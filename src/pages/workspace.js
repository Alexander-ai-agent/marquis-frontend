// The canvas as a creative workspace (rebuild brief §6). Only active while
// Alfred is making something; otherwise the field stays purely ambient.
// Output renders on the same plane as the field (never a modal, card, or
// panel), and the visitor can reach in and work on it.
//
//   chart     — a graph Alfred is explaining (the /conversation
//               `visualization` payload), drawn by bklit-ui.
//   reel      — images scattered across the canvas; click to keep; the
//               rest leave, the keepers come in toward Alfred; he proposes
//               an order and asks for the music; then hands off.
//   wireframe — Alfred sketches a site; regions can be moved, resized,
//               and annotated in place so he understands before building.
//
// Hand-offs to the other agents are stubbed: see handoffToAgents().

import { qs, escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';
import { setFieldState } from '../lib/field.js';
import { DEMO_MODE } from '../lib/api.js';

const gsap = window.gsap;
let root;
let current = null;           // { kind, data, stage, ... }
let chartHandle = null;

const LABELS = {
  revenue_projection: () => `REVENUE · Q${Math.floor(new Date().getMonth() / 3) + 1}`,
  phase_timeline: () => 'PATHWAY · ESTIMATES',
  blocker_heat: () => 'BLOCKER · UNRESOLVED',
  activity_pulse: () => 'PERFORMANCE · RHYTHM',
  coverage: () => 'STANDARD · FOR STAGE',
};

export function isOpen() { return Boolean(current); }
export function kind() { return current?.kind || null; }
export function label() {
  if (!current) return null;
  if (current.kind === 'chart') return (LABELS[current.data.type] || (() => 'CANVAS'))();
  if (current.kind === 'reel') return current.stage === 'music' ? 'REEL · MUSIC' : current.stage === 'done' ? 'REEL · HANDED OFF' : 'REEL · SELECTION';
  if (current.kind === 'wireframe') return current.edits ? `SITE · ${current.edits} EDIT${current.edits === 1 ? '' : 'S'}` : 'SITE · SKETCH';
  return 'CANVAS';
}

function remark(text) { document.dispatchEvent(new CustomEvent('marquis:remark', { detail: { text, label: label() } })); }

export function initWorkspace() {
  root = qs('#workspace');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) close();
  });
}

export function open(k, data) {
  if (current) teardown();
  current = { kind: k, data, stage: 'select', edits: 0 };
  root.hidden = false;
  root.dataset.kind = k;
  root.innerHTML = `<div class="ws-head"><span class="label ws-title">${escapeHtml(headTitle())}</span><button type="button" class="act ws-close">Set aside ×</button></div><div class="ws-plane" id="wsPlane"></div>`;
  root.querySelector('.ws-close').addEventListener('click', close);
  document.body.dataset.workspace = k;
  setFieldState('workspace');
  const plane = root.querySelector('#wsPlane');
  if (k === 'chart') renderChart(plane, data);
  else if (k === 'reel') renderReel(plane, data);
  else if (k === 'wireframe') renderWireframe(plane, data);
  if (!skipMovement()) { try { gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: EASE.out }); } catch (_) {} }
}

function headTitle() {
  if (current.kind === 'chart') return current.data.title || 'On the canvas';
  if (current.kind === 'reel') return `Images · ${current.data.query || 'gathered'}`;
  return 'Sketch · ' + (current.data.subject || 'the site');
}

export function close() {
  if (!current) return;
  const done = () => { teardown(); root.hidden = true; root.innerHTML = ''; delete root.dataset.kind; };
  delete document.body.dataset.workspace;
  current = null;
  document.dispatchEvent(new CustomEvent('marquis:workspace-closed'));
  setFieldState('idle');
  if (skipMovement()) return done();
  try { gsap.to(root, { opacity: 0, duration: 0.42, ease: EASE.out, onComplete: () => { done(); gsap.set(root, { clearProps: 'opacity' }); } }); }
  catch (_) { done(); }
}

function teardown() {
  try { chartHandle?.destroy(); } catch (_) {}
  chartHandle = null;
  current = null;
}

/** A step of a workspace flow typed into Alfred's input, handled here
 * rather than by the backend. Returns { text, label } or null. */
const NEW_REQUEST = /\b(website|site|landing page|reel|instagram|chart|revenue|phase|pricing|show me|sketch|draw)\b/i;

export function intercept(text) {
  if (NEW_REQUEST.test(text) && !(current?.kind === 'wireframe' && /\b(build|go ahead|proceed)\b/i.test(text))) return null;
  if (current?.kind === 'reel' && current.stage === 'music') {
    current.music = text;
    current.stage = 'done';
    handoffToAgents({ kind: 'reel', images: current.order, music: text });
    root.querySelector('.ws-title').textContent = `Reel · ${current.order.length} frames · ${text}`;
    return { text: `Noted: ${text}. The cut is with the others now; I'll bring it to you when it's assembled.`, label: label() };
  }
  if (current?.kind === 'wireframe' && /\b(build|go ahead|proceed|that's it|looks right)\b/i.test(text)) {
    handoffToAgents({ kind: 'wireframe', regions: current.regions });
    return { text: 'Understood. I have the layout as you left it, and the build is in hand.', label: 'SITE · HANDED OFF' };
  }
  return null;
}

/**
 * TODO(agents): hand finished direction to the agent system for real
 * production (reel assembly, site build). Stubbed this round per the
 * brief; the payload shape is what the backend will receive.
 */
function handoffToAgents(payload) {
  console.info('[workspace] hand-off queued (stub):', payload);
}

/* ---------------- chart ---------------- */

function renderChart(plane, viz) {
  plane.innerHTML = '<div class="ws-chart" id="wsChart"></div>';
  const host = plane.querySelector('#wsChart');
  const mount = () => {
    try { chartHandle = window.MarquisCanvas?.mountViz(host, viz) || null; } catch (e) { console.warn('[workspace] chart failed:', e); }
    if (!chartHandle) host.innerHTML = `<p class="ws-quiet label">${escapeHtml(viz.title || 'The chart could not be drawn.')}</p>`;
  };
  if (window.MarquisCanvas) mount(); else window.addEventListener('load', mount, { once: true });
}

/* ---------------- reel ---------------- */

// TODO(images): real image search (e.g. an Unsplash/Pexels key on the
// backend). The demo gathers public photographs from picsum.photos; if
// those can't load, drawn placeholder frames stand in.
function gatherImages(query, n = 12) {
  const seed = (query || 'marquis').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return Array.from({ length: n }, (_, i) => ({ id: `${seed}-${i}`, src: `https://picsum.photos/seed/${seed}-${i}/360/480?grayscale` }));
}

function placeholder(i) {
  const lines = Array.from({ length: 5 }, (_, k) => `<line x1="0" y1="${40 + k * 18 + (i % 3) * 4}" x2="90" y2="${30 + k * 16}" stroke="rgba(233,230,224,.18)" stroke-width="1"/>`).join('');
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120"><rect width="90" height="120" fill="#2a2520"/><rect x=".5" y=".5" width="89" height="119" fill="none" stroke="rgba(233,230,224,.3)"/>${lines}</svg>`);
}

function renderReel(plane, data) {
  const imgs = gatherImages(data.query, DEMO_MODE ? 12 : 12);
  plane.innerHTML = `<div class="reel" id="reel"></div><div class="reel-tray" id="reelTray" aria-label="Kept frames"></div>
    <div class="reel-act"><span class="label" id="reelCount">Select the frames to keep</span><button type="button" class="act" id="reelKeep" disabled>Keep these ›</button></div>`;
  const reel = plane.querySelector('#reel');
  const W = plane.clientWidth, H = plane.clientHeight;
  imgs.forEach((im, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'frame';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `Frame ${i + 1}`);
    // Scattered, not gridded: a loose field across the plane.
    const col = i % 6, row = Math.floor(i / 6);
    const x = (col + 0.5) / 6 * W + (Math.sin(i * 7.3) * W) / 28;
    const y = (row + 0.5) / 2 * (H * 0.82) + (Math.cos(i * 3.1) * H) / 18;
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    // The drawn frame shows at once; the photograph replaces it when it lands.
    const img = new Image();
    img.alt = '';
    img.src = placeholder(i);
    const photo = new Image();
    photo.onload = () => { img.src = im.src; };
    photo.src = im.src;
    b.appendChild(img);
    b.addEventListener('click', () => {
      if (current?.stage !== 'select') return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      const n = reel.querySelectorAll('[aria-pressed="true"]').length;
      plane.querySelector('#reelCount').textContent = n ? `${n} kept` : 'Select the frames to keep';
      plane.querySelector('#reelKeep').disabled = n === 0;
    });
    reel.appendChild(b);
  });
  if (!skipMovement()) {
    try { gsap.from(reel.children, { opacity: 0, y: 14, duration: 0.9, ease: EASE.out, stagger: { each: 0.05, from: 'random' } }); } catch (_) {}
  }
  plane.querySelector('#reelKeep').addEventListener('click', () => keepFrames(plane));
}

function keepFrames(plane) {
  const reel = plane.querySelector('#reel');
  const tray = plane.querySelector('#reelTray');
  const all = [...reel.children];
  const kept = all.filter((b) => b.getAttribute('aria-pressed') === 'true');
  const gone = all.filter((b) => b.getAttribute('aria-pressed') !== 'true');
  current.stage = 'sequenced';
  plane.querySelector('.reel-act').hidden = true;

  // Unselected leave the canvas; keepers come in toward Alfred, in order.
  const W = plane.clientWidth;
  gone.forEach((b) => {
    const r = b.getBoundingClientRect();
    const dx = (r.left + r.width / 2 < window.innerWidth / 2 ? -1 : 1) * (W * 0.7);
    if (skipMovement()) b.remove();
    else { try { gsap.to(b, { x: dx, opacity: 0, duration: 0.8, ease: EASE.out, onComplete: () => b.remove() }); } catch (_) { b.remove(); } }
  });
  current.order = kept.map((b, i) => ({ frame: i + 1, src: b.querySelector('img').src }));
  kept.forEach((b, i) => {
    const first = b.getBoundingClientRect();
    tray.appendChild(b);
    b.style.left = ''; b.style.top = '';
    b.disabled = true;
    const idx = document.createElement('span');
    idx.className = 'frame-idx label';
    idx.textContent = String(i + 1).padStart(2, '0');
    b.appendChild(idx);
    if (skipMovement()) return;
    const last = b.getBoundingClientRect();
    try { gsap.from(b, { x: first.left - last.left, y: first.top - last.top, duration: 1.1, ease: EASE.out, delay: 0.15 + i * 0.06 }); } catch (_) {}
  });
  current.stage = 'music';
  setTimeout(() => remark(proposal(kept.length)), skipMovement() ? 0 : 900);
}

function proposal(n) {
  if (n === 1) return 'One frame holds the whole reel; I would let it breathe for six seconds. What should it be set to?';
  return `I would open on frame ${String(Math.min(2, n)).padStart(2, '0')} and close on the first, ${n} cuts at roughly a second each. What music should carry it?`;
}

/* ---------------- wireframe ---------------- */

const DEFAULT_REGIONS = [
  { id: 'nav', label: 'Navigation', x: 0.04, y: 0.04, w: 0.92, h: 0.08 },
  { id: 'hero', label: 'Opening statement', x: 0.04, y: 0.16, w: 0.56, h: 0.34, note: 'words rise in, one line at a time' },
  { id: 'media', label: 'Product, moving', x: 0.64, y: 0.16, w: 0.32, h: 0.34, note: 'loops only on hover' },
  { id: 'proof', label: 'Proof', x: 0.04, y: 0.56, w: 0.44, h: 0.18 },
  { id: 'how', label: 'How it works', x: 0.52, y: 0.56, w: 0.44, h: 0.18, note: 'three steps draw on scroll' },
  { id: 'close', label: 'The ask', x: 0.04, y: 0.80, w: 0.92, h: 0.14 },
];

function renderWireframe(plane, data) {
  current.regions = (data.regions || DEFAULT_REGIONS).map((r) => ({ ...r }));
  plane.innerHTML = '<div class="wire" id="wire" role="group" aria-label="Site sketch. Drag to move, drag the corner to resize, double-click to annotate."></div><p class="wire-hint label">Drag to move · corner to resize · double-click to annotate</p>';
  const wire = plane.querySelector('#wire');
  current.regions.forEach((r, i) => wire.appendChild(regionEl(r, i)));
  if (!skipMovement()) {
    // Alfred draws it: each region's outline traces on, then its words.
    try {
      const tl = gsap.timeline();
      wire.querySelectorAll('.region').forEach((node, i) => {
        tl.fromTo(node.querySelector('rect'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: EASE.out }, i * 0.16);
        tl.fromTo(node.querySelectorAll('.region-label, .region-note'), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: EASE.out }, i * 0.16 + 0.4);
      });
    } catch (_) {}
  }
}

function regionEl(r) {
  const node = document.createElement('div');
  node.className = 'region';
  node.tabIndex = 0;
  node.setAttribute('aria-label', r.label);
  place(node, r);
  node.innerHTML = `<svg class="region-rule" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="calc(100% - 1px)" height="calc(100% - 1px)" pathLength="1" stroke-dasharray="1"/></svg>
    <span class="region-label label">${escapeHtml(r.label)}</span>${r.note ? `<span class="region-note">${escapeHtml(r.note)}</span>` : ''}<span class="region-grip" aria-hidden="true"></span>`;
  drag(node, r);
  node.addEventListener('dblclick', () => annotate(node, r));
  node.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); r.x = clamp(r.x + moves[e.key][0], 0, 1 - r.w); r.y = clamp(r.y + moves[e.key][1], 0, 1 - r.h); place(node, r); edited(); }
    if (e.key === 'Enter') { e.preventDefault(); annotate(node, r); }
  });
  return node;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function place(node, r) { Object.assign(node.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }); }

function drag(node, r) {
  node.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.region-note-input')) return;
    const wire = node.parentElement.getBoundingClientRect();
    const resizing = e.target.classList.contains('region-grip');
    const start = { x: e.clientX, y: e.clientY, r: { ...r } };
    node.setPointerCapture(e.pointerId);
    node.classList.add('held');
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / wire.width, dy = (ev.clientY - start.y) / wire.height;
      if (resizing) { r.w = clamp(start.r.w + dx, 0.08, 1 - r.x); r.h = clamp(start.r.h + dy, 0.06, 1 - r.y); }
      else { r.x = clamp(start.r.x + dx, 0, 1 - r.w); r.y = clamp(start.r.y + dy, 0, 1 - r.h); }
      place(node, r);
    };
    const up = () => {
      node.classList.remove('held');
      node.removeEventListener('pointermove', move);
      if (r.x !== start.r.x || r.y !== start.r.y || r.w !== start.r.w || r.h !== start.r.h) edited(resizing ? `${r.label} resized` : `${r.label} moved`);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up, { once: true });
    node.addEventListener('pointercancel', up, { once: true });
  });
}

function annotate(node, r) {
  if (node.querySelector('.region-note-input')) return;
  const input = document.createElement('input');
  input.className = 'region-note-input';
  input.value = r.note || '';
  input.placeholder = 'Your note';
  input.setAttribute('aria-label', `Note for ${r.label}`);
  node.appendChild(input);
  input.focus();
  const commit = () => {
    const v = input.value.trim();
    input.remove();
    if (v === (r.note || '')) return;
    r.note = v;
    let n = node.querySelector('.region-note');
    if (!n && v) { n = document.createElement('span'); n.className = 'region-note'; node.insertBefore(n, node.querySelector('.region-grip')); }
    if (n) { if (v) n.textContent = v; else n.remove(); }
    edited(`note on ${r.label}`);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.stopPropagation(); input.remove(); } });
  input.addEventListener('blur', commit, { once: true });
}

let editTimer = null;
function edited(what) {
  current.edits += 1;
  document.dispatchEvent(new CustomEvent('marquis:workspace-edit', { detail: { regions: current.regions, what } }));
  // Alfred watches the edits and says what he understood, once things settle.
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    if (current?.kind !== 'wireframe') return;
    const hero = current.regions.find((x) => x.id === 'hero');
    const line = hero && hero.w > 0.6 ? 'The opening statement takes the full width now, so the product moves below it.' : `I have ${current.edits} change${current.edits === 1 ? '' : 's'} noted.`;
    remark(`${line} Tell me when it is right and I will build it.`);
  }, 1800);
}
