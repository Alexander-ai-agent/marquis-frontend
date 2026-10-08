// Butler, the landing screen (rebuild brief §7, §5, §6).
//
// Arrival: Alfred's presence (the orb) and one spoken line, then the
// divide and the input fade in. While he considers, the orb turns faster
// and the subtitles say so, with three dots that keep moving. When he
// answers, his words are spoken sentence by sentence with the subtitles
// keeping time. When he is making something, the canvas workspace takes
// the room and his column docks to its side, scrolling if he says a lot.
// You can interrupt him: the input is only held while he is thinking.

import { qs, escapeHtml } from '../lib/dom.js';
import { skipMovement } from '../lib/motion.js';
import { sendConversationMessage, designCanvas, buildSite } from '../lib/api.js';
import { fetchHistory, persistenceOn } from '../lib/canvas-api.js';
import { state, setMode } from '../lib/state.js';
import { setFieldState, fieldDeliver } from '../lib/field.js';
import { typewrite, narrate, silence, PARA } from '../lib/voice.js';
import { createOrb } from '../lib/orb.js';
import { wakeShell } from '../lib/router.js';
import * as workspace from './workspace.js';

// Alfred's memory is the server's: every exchange is stored there, the model
// reads it back from the database, and this page only keeps what is on screen.
// `shown` is the exchange in the main view; `earlier` are the ones before it,
// listed in the history drawer (loaded when it is first opened, then paged).
const HISTORY_PAGE = 20;
let exchanges = 0;         // the count in the divide line (all stored exchanges)
let shown = null;          // { id, you, alfred, sources }
const earlier = { list: [], loaded: false, hasMore: false, before: null, busy: false };
let awaiting = false;      // a request is in flight
let opened = false;
let baseContext = 'MARQUIS';
let orb = null;
let speech = Promise.resolve();   // Alfred's lines, one after another

const el = {};
const THINKING_WORDS = ['Contemplating', 'Considering', 'Weighing it', 'Composing'];

/* ---------------- presence ---------------- */

function setPresence(mode) {
  orb?.setMode(mode);
  el.butler.dataset.presence = mode;
}

let thinkingTimer = null;
function think(on) {
  clearInterval(thinkingTimer);
  if (!on) return;
  setPresence('thinking');
  let i = 0;
  el.subtitle.innerHTML = `<span class="thinking"><span class="thinking-word">${THINKING_WORDS[0]}</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
  const word = el.subtitle.querySelector('.thinking-word');
  thinkingTimer = setInterval(() => {
    i = (i + 1) % THINKING_WORDS.length;
    word.classList.add('is-turning');
    setTimeout(() => { word.textContent = THINKING_WORDS[i]; word.classList.remove('is-turning'); }, 260);
  }, 2600);
}

/* ---------------- speaking ---------------- */

/** Keep the newest words in view, unless the reader has scrolled back. */
function follow() {
  const s = el.subtitle;
  if (s.scrollHeight - s.scrollTop - s.clientHeight < 48) s.scrollTop = s.scrollHeight;
}

/** After a line is typed: citations become links to the sources. */
function decorate(span, line, sources) {
  const byN = new Map((sources || []).map((s) => [Number(s.n), s]));
  span.innerHTML = escapeHtml(`${line} `).replace(/\[(\d+)\]/g, (m, n) => {
    const src = byN.get(Number(n));
    if (!src || !/^https?:\/\//.test(src.url)) return `<sup class="cite">${n}</sup>`;
    return `<a class="cite" data-n="${n}" href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(src.title || '')}">${n}</a>`;
  });
}

function say(text, { sources } = {}) {
  return narrate(text, {
    type: (raw, msPerChar, onWord) => {
      if (raw.startsWith(PARA)) el.subtitle.insertAdjacentHTML('beforeend', '<span class="para-gap" aria-hidden="true"></span>');
      const line = raw.replace(PARA, '');
      const span = document.createElement('span');
      span.className = 'line';
      el.subtitle.appendChild(span);
      return typewrite(span, `${line} `, { msPerChar, onWord, onChar: follow }).then(() => decorate(span, line, sources));
    },
    onStart: () => { think(false); el.subtitle.innerHTML = ''; setPresence('speaking'); },
    onLevel: (v) => orb?.setLevel(v),
    onWord: (w) => orb?.pulse(Math.min(1, Math.max(0.35, (w || '').length / 7))),
  }).finally(() => { if (!awaiting) setPresence('idle'); });
}

/** Queue a line after whatever Alfred is already saying. */
function enqueue(text, opts) {
  speech = speech.then(() => say(text, opts)).catch(() => {});
  return speech;
}

/** Cut Alfred off: stop the voice and the typing, drop anything queued. */
function interrupt() {
  silence();
  el.subtitle.querySelectorAll('.line').forEach((s) => { s._typeToken = null; });
  speech = Promise.resolve();
}

function setContext(label) { el.ctx.textContent = label || baseContext; }
function paintCount() {
  el.count.textContent = String(exchanges).padStart(2, '0');
  el.count.disabled = !persistenceOn() || exchanges < 2;     // nothing earlier to open
}
function bumpCount() { exchanges += 1; paintCount(); }

/* ---------------- the exchange on screen, and the ones before it ---------------- */

const paragraphs = (text) => String(text || '').split('\n\n').map((p) => p.trim()).filter(Boolean);

/** Alfred's words, set down whole (no typing, no voice): what a restored exchange shows. */
function setDown(text, sources) {
  el.subtitle.innerHTML = '';
  paragraphs(text).forEach((para, i) => {
    if (i) el.subtitle.insertAdjacentHTML('beforeend', '<span class="para-gap" aria-hidden="true"></span>');
    const span = document.createElement('span');
    span.className = 'line';
    el.subtitle.appendChild(span);
    decorate(span, para, sources);
  });
  el.subtitle.scrollTop = 0;
}

/** The latest stored exchange becomes the main view, in the same compact
 * composition as a live one. Called once at load, before `arrive`. */
export function restoreHistory(page) {
  exchanges = Number(page?.total) || 0;
  const latest = page?.exchanges?.[0];
  if (latest?.you) {
    shown = { id: latest.id, you: latest.you.content, alfred: latest.alfred?.content || '', sources: latest.sources || [] };
    earlier.hasMore = exchanges > 1;
  }
}

/** A new exchange takes the main view; the one it replaces joins the drawer. */
function showExchange(next) {
  if (shown?.alfred) {
    earlier.list = [shown, ...earlier.list.filter((x) => x.id !== shown.id)];
  }
  shown = next;
  if (!drawer.hidden) paintDrawer();
}

const drawer = { hidden: true };

function creationChips(id) {
  return workspace.creationsOf(id).map((c) => `<button type="button" class="hx-chip" data-n="${c.n}">${escapeHtml(c.kind)}</button>`).join('');
}

function exchangeHtml(x) {
  const when = x.when ? `<time class="label hx-when">${escapeHtml(new Date(x.when).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time>` : '';
  return `<article class="hx" data-id="${escapeHtml(x.id)}">${when}
    <p class="hx-q">${escapeHtml(x.you)}</p>
    <p class="hx-a" tabindex="0" title="Click to read it all">${escapeHtml(x.alfred || 'No answer was kept.')}</p>
    <div class="hx-chips">${creationChips(x.id)}</div></article>`;
}

function paintDrawer() {
  const list = qs('#historyList');
  list.innerHTML = earlier.list.length
    ? earlier.list.map(exchangeHtml).join('')
    : `<p class="label hx-empty">${earlier.loaded ? 'Nothing earlier.' : 'Opening.'}</p>`;
  const more = qs('#historyMore');
  more.hidden = !earlier.hasMore;
  more.disabled = earlier.busy;
}

/** Fetch a page of earlier exchanges (never the one on screen). */
async function loadEarlier() {
  if (earlier.busy || !persistenceOn()) return;
  earlier.busy = true;
  paintDrawer();
  try {
    const page = await fetchHistory({ limit: HISTORY_PAGE, before: earlier.loaded ? earlier.before : undefined });
    const seen = new Set([shown?.id, ...earlier.list.map((x) => x.id)]);
    const fresh = page.exchanges.filter((x) => x.you && !seen.has(x.id))
      .map((x) => ({ id: x.id, you: x.you.content, alfred: x.alfred?.content || '', sources: x.sources || [], when: x.you.created_at }));
    earlier.list = [...earlier.list, ...fresh];
    earlier.before = page.next_before;
    earlier.hasMore = Boolean(page.has_more);
    earlier.loaded = true;
  } catch (e) {
    console.warn('[butler] earlier exchanges did not load:', e);
    qs('#historyList').insertAdjacentHTML('beforeend', '<p class="label hx-empty">That did not load. Try again.</p>');
  }
  earlier.busy = false;
  paintDrawer();
}

function toggleDrawer(force) {
  const on = force ?? drawer.hidden;
  drawer.hidden = !on;
  const aside = qs('#history');
  aside.hidden = !on;
  el.count.setAttribute('aria-expanded', String(on));
  if (on) document.body.dataset.history = 'true'; else delete document.body.dataset.history;
  if (!on) return;
  paintDrawer();
  if (!earlier.loaded) loadEarlier();
  qs('#historyClose').focus({ preventScroll: true });
}

function open() {
  if (opened) return;
  opened = true;
  el.butler.dataset.stage = 'open';
  wakeShell();
}

/** First arrival each session: presence, one line, then the input. */
export async function arrive(firstLine, context) {
  baseContext = context || baseContext;
  setContext(workspace.label());
  el.subtitle.textContent = '';
  paintCount();
  const safety = setTimeout(open, 9000); // never leave the input hidden
  await new Promise((r) => setTimeout(r, skipMovement() ? 0 : 1100));
  if (shown?.alfred) {
    // Back after a refresh: the last exchange is the main view, as it was left.
    el.you.textContent = shown.you; el.you.hidden = false;
    setDown(shown.alfred, shown.sources);
  } else {
    await enqueue(firstLine);
  }
  clearTimeout(safety);
  open();
  workspace.syncField();
}

export function setButlerContext(context) { baseContext = context || baseContext; if (!workspace.isOpen()) setContext(); }

/* ---------------- an exchange ---------------- */

async function send(text) {
  text = (text || '').trim();
  if (!text || awaiting) return;
  awaiting = true;
  interrupt();
  el.you.textContent = text; el.you.hidden = false;
  el.input.value = ''; el.input.disabled = true;
  el.status.textContent = 'Alfred is considering.';
  think(true);
  setFieldState('processing');

  // A step inside something Alfred is making (naming the music, say)
  // is handled by the workspace itself.
  const local = workspace.intercept(text);
  let reply;
  if (local) {
    await new Promise((r) => setTimeout(r, 900));
    reply = { text: local.text, label: local.label };
  } else {
    // The server reads Alfred's memory from its own records; only the message goes.
    try { reply = await sendConversationMessage(state.token, text); } catch (_) { reply = null; }
  }

  awaiting = false;
  fieldDeliver();
  workspace.syncField();            // anything already on the canvas keeps the room dimmed
  el.status.textContent = '';
  el.input.disabled = false;
  if (document.activeElement === document.body || !document.activeElement) el.input.focus({ preventScroll: true });

  if (!reply) {
    // Honest failure, in voice; never invent an answer.
    enqueue("I can't reach my notes at the moment. Nothing you said is lost.");
    return;
  }

  const sources = reply.sources || [];
  const item = reply.items?.[0];
  // A new creation is added to the canvas; nothing already there is closed.
  if (reply.workspace) workspace.open(reply.workspace.type, reply.workspace);
  else if (reply.design?.brief) draft(reply.design.brief, { exchangeId: reply.exchangeId });
  else if (reply.build?.brief) draft(reply.build.brief, { building: true, exchangeId: reply.exchangeId });
  else if (reply.visualization) workspace.openViz(reply.visualization, { sources, item });
  else if (sources.length) workspace.openSources(sources, { item });
  setContext(reply.label || workspace.label());

  if (!local) {
    // The exchange is stored: it becomes the main view and the count follows the server's.
    showExchange({ id: reply.exchangeId || `local-${Date.now()}`, you: text, alfred: reply.text, sources });
    bumpCount();
  }
  enqueue(reply.text, { sources });
}

/** Hand a brief to the designer (or, building, to the builder); the
 * drafting table shows until the work lands, and the work takes its place. */
async function draft(brief, { building = false, exchangeId = null } = {}) {
  workspace.openDrafting(brief, { building });
  try {
    const result = await (building ? buildSite : designCanvas)(state.token, brief, exchangeId);
    workspace.landDrafting(brief, result.visualization, { item: result.item });
    setContext(workspace.label());
    if (result.text) enqueue(result.text);
  } catch (e) {
    if (workspace.isDrafting(brief)) workspace.draftingFailed(e.message);
  }
}

/** Alfred speaks without being asked (the workspace reporting back). */
function remark({ text, label }) {
  if (!text) return;
  el.you.hidden = true;
  setContext(label || workspace.label());
  enqueue(text);
}

/* ---------------- voice in ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

function applyMode(mode) {
  const voice = Boolean(SR) && mode === 'voice';
  el.speak.hidden = !voice;
  if (!voice && listening) { try { recognition.stop(); } catch (_) {} }
}

function listen() {
  if (!recognition || awaiting) return;
  if (listening) { try { recognition.stop(); } catch (_) {} return; }
  interrupt();
  try {
    recognition.start();
    listening = true;
    el.speak.textContent = 'Listening'; el.speak.setAttribute('aria-pressed', 'true');
  } catch (_) { stopListening(); }
}
function stopListening() { listening = false; el.speak.textContent = 'Speak'; el.speak.setAttribute('aria-pressed', 'false'); }

export function initButler() {
  Object.assign(el, {
    butler: qs('#butler'), subtitle: qs('#subtitle'), you: qs('#youLine'), input: qs('#intent'),
    ctx: qs('#divideCtx'), count: qs('#divideCount'), speak: qs('#speakBtn'), status: qs('#butlerStatus'),
  });
  try { orb = createOrb(qs('#orb')); } catch (_) { orb = null; }

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(el.input.value); }
  });
  // Citations in the subtitles point at their source cards on the canvas.
  ['pointerover', 'pointerout'].forEach((type) => el.subtitle.addEventListener(type, (e) => {
    const cite = e.target.closest?.('a.cite');
    if (cite) document.dispatchEvent(new CustomEvent('marquis:cite', { detail: { n: Number(cite.dataset.n), on: type === 'pointerover' } }));
  }));

  if (SR) {
    recognition = new SR();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.onresult = (e) => send(e.results[0][0].transcript);
    recognition.onend = stopListening;
    recognition.onerror = stopListening;
    el.speak.addEventListener('click', listen);
  }
  document.addEventListener('marquis:mode', (e) => applyMode(e.detail));
  document.addEventListener('marquis:voice', (e) => { if (!e.detail) silence(); });
  // Which voice is playing, always visible: Fish, the browser's (demo only), failed, or off.
  document.addEventListener('marquis:voice-status', (e) => {
    const { engine, detail, build } = e.detail || {};
    const ind = qs('#voiceInd');
    if (!ind) return;
    ind.dataset.voiceState = engine;
    ind.textContent = `Voice · ${engine === 'fish' ? 'Fish' : engine === 'browser' ? 'Browser' : engine === 'failed' ? 'Fish failed' : 'Off'}`;
    ind.title = `${detail} (build ${build})`;
  });
  document.addEventListener('marquis:remark', (e) => remark(e.detail || {}));
  document.addEventListener('marquis:workspace-closed', () => setContext());

  // The count in the divide line opens the earlier exchanges, a short list
  // beside Alfred rather than a tall block under him.
  el.count.addEventListener('click', () => toggleDrawer());
  qs('#historyClose').addEventListener('click', () => { toggleDrawer(false); el.count.focus({ preventScroll: true }); });
  qs('#historyMore').addEventListener('click', loadEarlier);
  qs('#historyList').addEventListener('click', (e) => {
    const chip = e.target.closest('.hx-chip');
    if (chip) { workspace.focusCreation(Number(chip.dataset.n)); toggleDrawer(false); return; }
    e.target.closest('.hx-a')?.classList.toggle('is-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden && !e.defaultPrevented) { toggleDrawer(false); el.count.focus({ preventScroll: true }); }
  });

  // You draw first: open the pen layer; Alfred reads it when handed over.
  qs('#drawBtn').addEventListener('click', () => {
    if (awaiting) return;
    interrupt();
    workspace.open('pen', {});
    remark({ text: "Draw it as you see it. I'll make sense of it.", label: 'YOUR SKETCH' });
  });
  applyMode(state.mode);

  workspace.initWorkspace();
}

export { send as sendToAlfred, setMode };
