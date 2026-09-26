// Butler page (route id "conversation"): the Living Canvas beside the
// conversation. Canvas = vendor/marquis-canvas (React + bklit-ui); this
// module owns the thread, voice in/out, and communication modes.
//
// Spec sources: MARQUIS_animations.md #3 (butler response appearance),
// MARQUIS_product.md "Living Canvas" + "Communication Modes",
// MARQUIS_design.md "The butler conversation interface".

import { qs } from '../lib/dom.js';
import { reveal, skipMovement, EASE } from '../lib/motion.js';
import { sendConversationMessage, fetchSignals, DEMO_MODE } from '../lib/api.js';
import { state, setMode } from '../lib/state.js';

const history = [];
let busy = false;

/* ---------------- Living Canvas ---------------- */

let canvas = null;
let canvasContext = 'Phase 3 of 5 · Day 8';

export function setCanvasContext(text) {
  canvasContext = text || canvasContext;
  qs('.bcf-context') && (qs('.bcf-context').textContent = canvasContext);
  canvas?.update({ context: canvasContext });
}

function mountCanvas() {
  const el = qs('#butlerCanvas');
  if (canvas || !el) return;
  if (!window.MarquisCanvas) {
    // Bundle still loading (it's `defer`) or failed: keep the static
    // fallback, and try once more when the page finishes loading.
    window.addEventListener('load', () => { if (window.MarquisCanvas) mountCanvas(); }, { once: true });
    return;
  }
  try {
    canvas = window.MarquisCanvas.mount(el, { context: canvasContext, demo: DEMO_MODE });
  } catch (e) {
    console.warn('[butler] canvas failed to mount, keeping the static fallback:', e);
    return;
  }
  if (!DEMO_MODE) {
    fetchSignals(state.token)
      .then((signals) => signals && canvas?.update({ signals }))
      .catch(() => { /* presences show their honest "nothing to read yet" state */ });
  }
}

function showOnCanvas(viz) {
  if (!canvas) return;
  try { viz ? canvas.show(viz) : canvas.idle(); } catch (e) { console.warn('[butler] canvas update failed:', e); }
}

let seedPlayed = false;
export function playSeedOnce() {
  if (seedPlayed) return;
  seedPlayed = true;
  mountCanvas();
  // Animation #3: paragraphs arrive as units, 200ms each, 80ms apart.
  reveal('#m1 p', { y: 6, duration: 0.2, stagger: 0.08 });
}

/* ---------------- Thread ---------------- */

function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function appendMessage({ role, text, notice = false }) {
  const scrollEl = qs('#convScroll');
  const thinkMsg = qs('#thinkMsg');
  const msg = document.createElement('div');
  msg.className = 'msg' + (role === 'user' ? ' user' : '') + (notice ? ' notice' : '');
  for (const para of role === 'user' ? [text] : paragraphs(text)) {
    const p = document.createElement('p');
    p.textContent = para;
    msg.appendChild(p);
  }
  const time = document.createElement('time');
  time.textContent = 'just now';
  msg.appendChild(time);
  scrollEl.insertBefore(msg, thinkMsg);
  scrollEl.scrollTop = scrollEl.scrollHeight;
  return msg;
}

async function send(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  busy = true;
  const thinkMsg = qs('#thinkMsg');

  // User message appears instantly: a high-frequency action gets no animation.
  appendMessage({ role: 'user', text });
  history.push({ role: 'user', content: text });
  thinkMsg.style.display = 'block';
  qs('#convScroll').scrollTop = qs('#convScroll').scrollHeight;

  let reply;
  try {
    reply = await sendConversationMessage(state.token, text, history.slice(0, -1));
  } catch (e) {
    reply = null;
  }
  thinkMsg.style.display = 'none';

  if (!reply) {
    // Honest failure: never invent a reply. Not added to history.
    appendMessage({ role: 'butler', notice: true, text: "I can't reach my notes at the moment. Nothing you said is lost. Ask me again in a minute." });
    busy = false;
    return;
  }

  history.push({ role: 'assistant', content: reply.text });
  const msg = appendMessage({ role: 'butler', text: reply.text });
  reveal(msg.querySelectorAll('p'), { y: 6, duration: 0.2, stagger: 0.08 });
  // The canvas moves in step with the reply: a view when the butler is
  // explaining something visual, back to the four on an ordinary turn.
  showOnCanvas(reply.visualization);
  speak(reply.text);
  busy = false;
}

/* ---------------- Voice out ---------------- */

let preferredVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices();
  // Composed, British, male: the closest browser voices to the butler.
  preferredVoice = voices.find((v) => /Daniel|Google UK English Male|Arthur|Ryan|Oliver/i.test(v.name))
    || voices.find((v) => /en-GB/i.test(v.lang))
    || null;
}
if (window.speechSynthesis) {
  pickVoice();
  // Chrome loads its voice list asynchronously; without this the first
  // reply used the default voice.
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function setSpeaking(on) {
  // The one earned gold on this screen: the mark, only while the butler speaks.
  qs('#convMark')?.classList.toggle('speaking', on);
}

function pulseMark() {
  if (skipMovement()) return;
  try {
    window.gsap.fromTo('#convMark', { scale: 1 }, { scale: 1.12, duration: 0.1, yoyo: true, repeat: 1, ease: EASE.out, transformOrigin: 'center' });
  } catch (_) { /* non-fatal */ }
}

function speak(text) {
  if (!state.voiceOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92; u.pitch = 0.85;
  if (preferredVoice) u.voice = preferredVoice;
  u.onboundary = pulseMark;
  u.onstart = () => setSpeaking(true);
  u.onend = u.onerror = () => setSpeaking(false);
  speechSynthesis.speak(u);
}

/* ---------------- Voice in + modes ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

function stopListening() {
  listening = false;
  qs('#speakBtn')?.classList.remove('listening');
  qs('#speakLabel') && (qs('#speakLabel').textContent = 'Speak');
}

function startListening() {
  if (!recognition || busy) return;
  if (window.speechSynthesis) speechSynthesis.cancel(); // don't listen to the butler
  try {
    recognition.start();
    listening = true;
    qs('#speakBtn').classList.add('listening');
    qs('#speakLabel').textContent = 'Listening';
  } catch (_) { stopListening(); }
}

function applyMode(mode) {
  const effective = SR ? mode : 'text';
  qs('#page-conversation').dataset.mode = effective;
  document.querySelectorAll('[data-mode-option]').forEach((b) => {
    const on = b.dataset.modeOption === effective;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (effective === 'text') { stopListening(); try { recognition?.stop(); } catch (_) {} }
}

export function initConversation() {
  const inputBox = qs('#convInputBox');
  const inputEl = qs('#convInput');

  inputEl.addEventListener('focus', () => inputBox.classList.add('focused'));
  inputEl.addEventListener('blur', () => inputBox.classList.remove('focused'));
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      send(text);
    }
  });

  if (SR) {
    recognition = new SR();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.onresult = (e) => send(e.results[0][0].transcript);
    recognition.onend = stopListening;
    recognition.onerror = stopListening;
    qs('#speakBtn').addEventListener('click', () => (listening ? recognition.stop() : startListening()));
  } else {
    // No speech recognition in this browser: Mode 1 isn't possible here.
    document.querySelectorAll('[data-mode-option="voice"]').forEach((b) => { b.disabled = true; b.title = 'Speaking is not supported in this browser'; });
  }

  document.querySelectorAll('.conv-modes [data-mode-option]').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.modeOption));
  });
  document.addEventListener('marquis:mode', (e) => applyMode(e.detail));
  document.addEventListener('marquis:voice', (e) => { if (!e.detail && window.speechSynthesis) speechSynthesis.cancel(); });
  applyMode(state.mode);
}

// Exposed for tests and the Progress page's "discuss this" hand-off.
export { send as sendButlerMessage };
