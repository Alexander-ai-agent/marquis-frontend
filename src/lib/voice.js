// Alfred's voice: the typewriter reveal and speech out.
//
// A reply is narrated sentence by sentence. Fish Audio clips are requested
// for the first sentences at once and for the rest just ahead of need, so
// he begins speaking a moment after the reply lands rather than after the
// whole reply has been synthesised. Each sentence's subtitles type at the
// pace of its own clip, so the words on screen keep time with the voice.
// The browser's own speech is the fallback; with voice off (or before the
// visitor has interacted, which browsers require) the text simply types.

import { prefersReduced } from './motion.js';
import { state } from './state.js';
import { DEMO_MODE, synthesizeSpeech } from './api.js';

export const MS_PER_CHAR = 38;
const BROWSER_MS_PER_CHAR = 62;   // the browser voice at rate 0.9
const FIRST_CLIP_WAIT_MS = 7000;  // after this, fall back rather than keep him silent
const NEXT_CLIP_WAIT_MS = 20000;
const PREFETCH = 3;
const FISH_COOLDOWN_MS = 60000;   // after a failure, don't make every reply wait on it

let activated = false;
let audioCtx = null;
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => {
  activated = true;
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioCtx = null; }
}, { once: true, capture: true }));

/** Reveal text into el at a constant rate. Calls onWord(word) as each word
 * completes and onChar() after each character. Resolves when done; a newer
 * call on the same el (or el._typeToken = null) cancels it. */
export function typewrite(el, text, { onWord, onChar, msPerChar = MS_PER_CHAR } = {}) {
  const token = Symbol('type');
  el._typeToken = token;
  text = String(text || '');
  if (prefersReduced) { el.textContent = text; onChar?.(); return Promise.resolve(); }
  return new Promise((resolve) => {
    let i = 0;
    let word = '';
    el.textContent = '';
    const tick = () => {
      if (el._typeToken !== token) return resolve();
      const ch = text[i];
      el.textContent += ch;
      onChar?.();
      if (/\s/.test(ch)) { if (word) onWord?.(word); word = ''; } else word += ch;
      i += 1;
      if (i < text.length) setTimeout(tick, msPerChar);
      else { if (word) onWord?.(word); resolve(); }
    };
    if (text.length) tick(); else resolve();
  });
}

/* ---------------- sentences ---------------- */

const MIN_LINE = 40;
const MAX_LINE = 240;

/** Marks the first line of a new paragraph (stripped before display/speech). */
export const PARA = ' ';

/** Split a reply into speakable lines: sentences, short ones merged, very
 * long ones broken at a comma or dash near the middle. Paragraphs (blank
 * lines) are kept: the first line of each later paragraph starts with PARA. */
export function splitLines(text) {
  return String(text || '').split(/\n\s*\n/).map(paragraphLines).filter((ls) => ls.length)
    .flatMap((ls, p) => (p ? [PARA + ls[0], ...ls.slice(1)] : ls));
}

function paragraphLines(text) {
  const clean = String(text || '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // A citation after the full stop ("…a year. [1] Runna…") stays with its sentence.
  const sentences = clean.replace(/([.!?…])((?:\s*\[\d+\])+)/g, '$2$1')
    .split(/(?<=[.!?…])\s+(?=["“'(]?[A-Z0-9])/);
  const merged = [];
  sentences.forEach((s) => {
    if (merged.length && merged[merged.length - 1].length < MIN_LINE) merged[merged.length - 1] += ` ${s}`;
    else merged.push(s);
  });
  return merged.flatMap((s) => {
    if (s.length <= MAX_LINE) return [s];
    const mid = s.length / 2;
    const cuts = [...s.matchAll(/[,;—–] /g)].map((m) => m.index + 1);
    const cut = cuts.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    return cut ? [s.slice(0, cut).trim(), s.slice(cut).trim()] : [s];
  });
}

/** What is said aloud: citations and stray markup are for the eye only. */
const spoken = (line) => line.replace(PARA, '').replace(/\s?\[\d+\]/g, '').replace(/[*_#`]/g, '');

/* ---------------- narration ---------------- */

let narration = 0;          // bumps on every new narration or silence()
let stopCurrent = null;     // resolves the clip or utterance in progress
let fishOffUntil = 0;

const canSpeak = () => state.voiceOn && activated;
const fishReady = () => !DEMO_MODE && Boolean(state.token) && Date.now() > fishOffUntil;
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

/**
 * Narrate `text`. `type(line, msPerChar, onWord)` must append one line of
 * subtitles and resolve when typed. Callbacks: onStart() as the first line
 * begins, onLevel(0-1) with the live loudness, onWord(word) per word when
 * there is no live loudness. Resolves when done or silenced.
 */
export async function narrate(text, { type, onStart, onLevel, onWord } = {}) {
  const id = ++narration;
  stopPlayback();
  const lines = splitLines(text);
  if (!lines.length) { onStart?.(); return; }
  let from = 0;
  if (canSpeak() && fishReady()) {
    from = await narrateFish(id, lines, { type, onStart, onLevel });
    if (from >= lines.length || id !== narration) return;
  }
  const rest = lines.slice(from);
  if (canSpeak() && window.speechSynthesis) await narrateBrowser(id, rest, { type, onStart, onWord, first: from === 0 });
  else {
    if (from === 0) onStart?.();
    for (const line of rest) {
      if (id !== narration) return;
      await type(line, MS_PER_CHAR, onWord);
    }
  }
}

/** Returns the index of the first line it could not speak (lines.length when all spoken). */
async function narrateFish(id, lines, { type, onStart, onLevel }) {
  const clips = [];
  const silent = (i) => !spoken(lines[i]).trim();
  const fetchClip = (i) => {
    if (i >= lines.length || silent(i)) return null;
    clips[i] = clips[i] || synthesizeSpeech(state.token, spoken(lines[i])).catch(() => null);
    return clips[i];
  };
  for (let i = 0; i < PREFETCH; i += 1) fetchClip(i);
  for (let i = 0; i < lines.length; i += 1) {
    if (silent(i)) { if (i === 0) onStart?.(); await type(lines[i], MS_PER_CHAR); continue; }
    const blob = await withTimeout(fetchClip(i), i === 0 ? FIRST_CLIP_WAIT_MS : NEXT_CLIP_WAIT_MS);
    if (id !== narration) return lines.length;
    if (!blob) { fishOffUntil = Date.now() + FISH_COOLDOWN_MS; return i; }
    fetchClip(i + PREFETCH);
    const clip = await loadClip(blob, lines[i]);
    if (id !== narration) { URL.revokeObjectURL(clip.el.src); return lines.length; }
    if (i === 0) onStart?.();
    const msPerChar = Math.max(22, Math.min(95, (clip.duration * 1000) / Math.max(lines[i].length, 1)));
    const played = playClip(clip, onLevel);
    await Promise.all([played, type(lines[i], msPerChar)]);
    if (!(await played) && id === narration) return i + 1; // playback refused: carry on in the browser voice
  }
  return lines.length;
}

function loadClip(blob, line) {
  const el = new Audio(URL.createObjectURL(blob));
  el.preload = 'auto';
  return new Promise((resolve) => {
    const done = () => resolve({ el, duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : line.length * 0.065 });
    el.addEventListener('loadedmetadata', done, { once: true });
    el.addEventListener('error', done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Play one clip, reporting loudness. Resolves true when it played through. */
function playClip({ el }, onLevel) {
  return new Promise((resolve) => {
    let raf = 0, source = null, settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(raf);
      try { source?.disconnect(); } catch (_) {}
      el.pause();
      URL.revokeObjectURL(el.src);
      if (stopCurrent === stop) stopCurrent = null;
      resolve(ok);
    };
    const stop = () => finish(true);
    stopCurrent = stop;
    if (audioCtx && onLevel) {
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        source = audioCtx.createMediaElementSource(el);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(audioCtx.destination);
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const meter = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let k = 0; k < buf.length; k += 1) { const v = (buf[k] - 128) / 128; sum += v * v; }
          onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          raf = requestAnimationFrame(meter);
        };
        raf = requestAnimationFrame(meter);
      } catch (_) { /* no meter; the clip still plays directly */ }
    }
    el.addEventListener('ended', () => finish(true), { once: true });
    el.addEventListener('error', () => finish(false), { once: true });
    el.play().catch(() => finish(false));
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

async function narrateBrowser(id, lines, { type, onStart, onWord, first }) {
  for (let i = 0; i < lines.length; i += 1) {
    if (id !== narration) return;
    const line = lines[i];
    await new Promise((resolve) => {
      let typed = null;
      let settled = false;
      const end = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        if (stopCurrent === end) stopCurrent = null;
        Promise.resolve(typed).then(resolve);
      };
      const safety = setTimeout(end, line.length * 140 + 3000); // some engines never fire onend
      stopCurrent = end;
      try {
        const u = new SpeechSynthesisUtterance(spoken(line));
        u.rate = 0.9; u.pitch = 0.82;
        if (preferredVoice) u.voice = preferredVoice;
        u.onstart = () => {
          if (first && i === 0) onStart?.();
          typed = type(line, BROWSER_MS_PER_CHAR);
        };
        u.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          onWord?.(spoken(line).slice(e.charIndex).split(/\s/)[0] || '');
        };
        u.onend = u.onerror = end;
        speechSynthesis.speak(u);
      } catch (_) {
        if (first && i === 0) onStart?.();
        typed = type(line, MS_PER_CHAR, onWord);
        end();
      }
    });
  }
}

function stopPlayback() {
  const stop = stopCurrent;
  stopCurrent = null;
  stop?.();
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}

/** Stop speaking now; any narration in progress ends. */
export function silence() {
  narration += 1;
  stopPlayback();
}
