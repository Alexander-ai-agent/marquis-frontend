// Alfred's voice: the typewriter reveal (brief §3: ~38ms per character, no
// acceleration) and speech out. The browser only allows speech after the
// visitor has interacted with the page, so the very first greeting is
// read, not heard; every reply after a keystroke or click is spoken.

import { prefersReduced } from './motion.js';
import { state } from './state.js';
import { DEMO_MODE, synthesizeSpeech } from './api.js';

export const MS_PER_CHAR = 38;

let activated = false;
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { activated = true; }, { once: true, capture: true }));

/** Reveal text into el at a constant rate. Calls onWord(word) as each word
 * completes. Resolves when done; a newer call on the same el cancels it. */
export function typewrite(el, text, { onWord } = {}) {
  const token = Symbol('type');
  el._typeToken = token;
  text = String(text || '');
  if (prefersReduced) { el.textContent = text; return Promise.resolve(); }
  return new Promise((resolve) => {
    let i = 0;
    let word = '';
    el.textContent = '';
    const tick = () => {
      if (el._typeToken !== token) return resolve();
      const ch = text[i];
      el.textContent += ch;
      if (/\s/.test(ch)) { if (word) onWord?.(word); word = ''; } else word += ch;
      i += 1;
      if (i < text.length) setTimeout(tick, MS_PER_CHAR);
      else { if (word) onWord?.(word); resolve(); }
    };
    if (text.length) tick(); else resolve();
  });
}

let preferredVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices();
  // Composed, British, male: the closest browser voices to Alfred.
  preferredVoice = voices.find((v) => /Daniel|Google UK English Male|Arthur|Ryan|Oliver|George/i.test(v.name))
    || voices.find((v) => /en-GB/i.test(v.lang)) || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

// Fish Audio first (a real, composed British voice); the browser's own
// speech is the fallback, so Alfred is never silent when voice is on.
const MAX_SPEECH_CHARS = 1500;
let audio = null;
let speechToken = 0;

function stopAudio() {
  speechToken += 1;
  if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); audio = null; }
}

/** Pulse onWord once per word, spread across the clip's duration. */
function pulseAcross(el, words, onWord, token) {
  const step = (el.duration * 1000) / Math.max(words.length, 1);
  words.forEach((w, i) => setTimeout(() => { if (token === speechToken) onWord?.(w); }, i * step));
}

async function speakFish(text, { onWord, onEnd }, token) {
  const blob = await synthesizeSpeech(state.token, text);
  if (!blob || token !== speechToken) return Boolean(blob);
  const el = new Audio(URL.createObjectURL(blob));
  audio = el;
  el.addEventListener('playing', () => pulseAcross(el, text.split(/\s+/), onWord, token), { once: true });
  el.addEventListener('ended', () => { if (token === speechToken) { stopAudio(); onEnd?.(); } }, { once: true });
  await el.play();
  return true;
}

/** Speak if allowed. Returns true when speech actually started (or is
 * starting: the Fish Audio clip may arrive a moment after the text). */
export function speak(text, opts = {}) {
  if (!state.voiceOn || !activated) return false;
  stopAudio();
  const token = speechToken;
  const line = String(text);
  if (state.token && !DEMO_MODE && line.length <= MAX_SPEECH_CHARS) {
    speakFish(line, opts, token)
      .then((ok) => { if (!ok && token === speechToken) speakBrowser(line, opts); })
      .catch(() => { if (token === speechToken) speakBrowser(line, opts); });
    return true;
  }
  return speakBrowser(line, opts);
}

function speakBrowser(text, { onWord, onEnd } = {}) {
  if (!window.speechSynthesis) { onEnd?.(); return false; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 0.9; u.pitch = 0.82;
    if (preferredVoice) u.voice = preferredVoice;
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      const rest = String(text).slice(e.charIndex);
      onWord?.(rest.split(/\s/)[0] || '');
    };
    u.onend = u.onerror = () => onEnd?.();
    speechSynthesis.speak(u);
    return true;
  } catch (_) { return false; }
}

export function silence() {
  stopAudio();
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}
