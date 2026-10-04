// Butler, the landing screen (rebuild brief §7, §5, §6).
//
// Arrival: only Alfred's mark. He speaks one line (typewriter subtitles,
// the mark moving with his words), then the divide and the input fade in.
// That is the only new thing allowed to appear. Each exchange replaces the
// last; replies stay to a sentence or two so the column never grows tall.
// While he thinks, the ambient field draws inward; when he answers, one
// pulse. When he is making something, the canvas workspace takes over.

import { qs } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';
import { sendConversationMessage } from '../lib/api.js';
import { state, setMode } from '../lib/state.js';
import { setFieldState, fieldDeliver } from '../lib/field.js';
import { typewrite, speak, silence } from '../lib/voice.js';
import { wakeShell } from '../lib/router.js';
import * as workspace from './workspace.js';

const gsap = window.gsap;
const history = [];
let exchanges = 0;
let busy = false;
let opened = false;
let baseContext = 'MARQUIS';

const el = {};

/* ---------------- the mark ---------------- */

function pulse(word) {
  if (skipMovement() || !el.core) return;
  // A slow pulse tied to the word's weight, never a bounce.
  const amp = Math.min(1, Math.max(0.35, (word || '').length / 7));
  try {
    gsap.timeline({ overwrite: 'auto' })
      .to(el.core, { scale: 1 + amp * 1.3, duration: 0.18, ease: EASE.out })
      .to(el.core, { scale: 1, duration: 0.55, ease: EASE.out });
    gsap.fromTo(el.frame, { opacity: 0.55 + amp * 0.45 }, { opacity: 0.75, duration: 0.7, ease: EASE.out, overwrite: 'auto' });
  } catch (_) { /* the mark simply stays still */ }
}

function settle() {
  try { gsap.to(el.frame, { opacity: 1, duration: 0.6, ease: EASE.out }); gsap.to(el.core, { scale: 1, duration: 0.6, ease: EASE.out }); } catch (_) {}
}

/* ---------------- speaking ---------------- */

async function say(text) {
  const spoken = speak(text, { onWord: pulse, onEnd: settle });
  // Subtitles always type at the brief's rate; the mark follows the voice
  // when there is one, otherwise the words as they appear.
  await typewrite(el.subtitle, text, { onWord: spoken ? null : pulse });
  if (!spoken) settle();
}

function setContext(label) { el.ctx.textContent = label || baseContext; }
function bumpCount() { exchanges += 1; el.count.textContent = String(exchanges).padStart(2, '0'); }

function open() {
  if (opened) return;
  opened = true;
  el.butler.dataset.stage = 'open';
  wakeShell();
}

/** First arrival each session: mark, one line, then the input. */
export async function arrive(firstLine, context) {
  baseContext = context || baseContext;
  setContext();
  el.subtitle.textContent = '';
  const safety = setTimeout(open, 9000); // never leave the input hidden
  await new Promise((r) => setTimeout(r, skipMovement() ? 0 : 1100));
  await say(firstLine);
  clearTimeout(safety);
  open();
}

export function setButlerContext(context) { baseContext = context || baseContext; if (!workspace.isOpen()) setContext(); }

/* ---------------- an exchange ---------------- */

async function send(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  busy = true;
  silence();
  el.you.textContent = text; el.you.hidden = false;
  el.subtitle.textContent = '';
  el.input.value = ''; el.input.disabled = true;
  el.status.textContent = 'Alfred is considering.';

  // A step inside something Alfred is making (naming the music, say)
  // is handled by the workspace itself.
  const local = workspace.intercept(text);
  let reply;
  if (local) {
    setFieldState('processing');
    await new Promise((r) => setTimeout(r, 900));
    reply = { text: local.text, label: local.label };
  } else {
    setFieldState('processing');
    history.push({ role: 'user', content: text });
    try { reply = await sendConversationMessage(state.token, text, history.slice(0, -1)); } catch (_) { reply = null; }
  }

  fieldDeliver();
  el.status.textContent = '';
  if (!reply) {
    // Honest failure, in voice; never invent an answer.
    history.pop();
    await say("I can't reach my notes at the moment. Nothing you said is lost.");
    finish();
    return;
  }
  if (!local) history.push({ role: 'assistant', content: reply.text });

  if (reply.workspace) workspace.open(reply.workspace.type, reply.workspace);
  else if (reply.visualization) workspace.open('chart', reply.visualization);
  else if (!local && workspace.kind() === 'chart') workspace.close();
  setContext(reply.label || workspace.label());

  bumpCount();
  await say(reply.text);
  finish();
}

function finish() {
  busy = false;
  el.input.disabled = false;
  if (document.activeElement === document.body || !document.activeElement) el.input.focus({ preventScroll: true });
}

/** Alfred speaks without being asked (the workspace reporting back). */
async function remark({ text, label }) {
  if (busy || !text) return;
  busy = true;
  el.you.hidden = true;
  setContext(label || workspace.label());
  await say(text);
  busy = false;
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
  if (!recognition || busy) return;
  if (listening) { try { recognition.stop(); } catch (_) {} return; }
  silence();
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
  el.core = qs('#glyph .glyph-core');
  el.frame = qs('#glyph .glyph-frame');

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(el.input.value); }
  });

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
  applyMode(state.mode);

  workspace.initWorkspace();
}

export { send as sendToAlfred, setMode };
