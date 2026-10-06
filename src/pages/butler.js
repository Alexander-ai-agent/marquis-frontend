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
import { sendConversationMessage, designCanvas } from '../lib/api.js';
import { state, setMode } from '../lib/state.js';
import { setFieldState, fieldDeliver } from '../lib/field.js';
import { typewrite, narrate, silence } from '../lib/voice.js';
import { createOrb } from '../lib/orb.js';
import { wakeShell } from '../lib/router.js';
import * as workspace from './workspace.js';

const history = [];
let exchanges = 0;
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
    type: (line, msPerChar, onWord) => {
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
function bumpCount() { exchanges += 1; el.count.textContent = String(exchanges).padStart(2, '0'); }

function open() {
  if (opened) return;
  opened = true;
  el.butler.dataset.stage = 'open';
  wakeShell();
}

/** First arrival each session: presence, one line, then the input. */
export async function arrive(firstLine, context) {
  baseContext = context || baseContext;
  setContext();
  el.subtitle.textContent = '';
  const safety = setTimeout(open, 9000); // never leave the input hidden
  await new Promise((r) => setTimeout(r, skipMovement() ? 0 : 1100));
  await enqueue(firstLine);
  clearTimeout(safety);
  open();
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
    history.push({ role: 'user', content: text });
    try { reply = await sendConversationMessage(state.token, text, history.slice(0, -1)); } catch (_) { reply = null; }
  }

  awaiting = false;
  fieldDeliver();
  el.status.textContent = '';
  el.input.disabled = false;
  if (document.activeElement === document.body || !document.activeElement) el.input.focus({ preventScroll: true });

  if (!reply) {
    // Honest failure, in voice; never invent an answer.
    history.pop();
    enqueue("I can't reach my notes at the moment. Nothing you said is lost.");
    return;
  }
  if (!local) history.push({ role: 'assistant', content: reply.text });

  const sources = reply.sources || [];
  if (reply.workspace) workspace.open(reply.workspace.type, reply.workspace);
  else if (reply.design?.brief) draft(reply.design.brief);
  else if (reply.visualization) workspace.openViz(reply.visualization, { sources });
  else if (sources.length) workspace.openSources(sources);
  else if (!local && workspace.kind() === 'chart') workspace.close();
  setContext(reply.label || workspace.label());

  bumpCount();
  enqueue(reply.text, { sources });
}

/** Hand a brief to the designer; the drafting table shows until it lands. */
async function draft(brief) {
  workspace.openDrafting(brief);
  try {
    const result = await designCanvas(state.token, brief);
    if (!workspace.isDrafting(brief)) return; // the founder has moved on
    workspace.openViz(result.visualization);
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
  document.addEventListener('marquis:remark', (e) => remark(e.detail || {}));
  document.addEventListener('marquis:workspace-closed', () => setContext());

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
