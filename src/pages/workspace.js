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
import { DEMO_MODE, searchImages, interpretDrawing } from '../lib/api.js';
import { state } from '../lib/state.js';
import { createSheet, colName, formatCell } from '../lib/sheet.js';
import { renderDesign, renderDrafting, failDrafting } from './canvas-design.js';
import { renderSources, citeSource } from './canvas-sources.js';

/** Route a /conversation `visualization` block to the right workspace.
 * `sources` (web pages Alfred read) ride along under the block. */
export function openViz(viz, { sources } = {}) {
  const opts = { sources };
  if (viz.type === 'sheet') open('sheet', viz, opts);
  else if (viz.type === 'drawing') open('drawing', viz, opts);
  else if (viz.type === 'design') open('design', viz, opts);
  else if (viz.type === 'blueprint') open('wireframe', { subject: viz.title, regions: viz.regions }, opts);
  else if (viz.type === 'images') open('reel', { query: viz.query, title: viz.title }, opts);
  else open('chart', viz, opts);
}

/** Only the web pages Alfred read, when nothing else needs drawing. */
export function openSources(sources) {
  open('sources', { title: 'What I read on your behalf', sources });
}

/** The designer is at work on `brief`; show the drafting table. */
export function openDrafting(brief) { open('drafting', { brief, title: 'At the drafting table' }); }
export function isDrafting(brief) { return current?.kind === 'drafting' && current.data.brief === brief; }
export function draftingFailed(message) { if (current?.kind === 'drafting') failDrafting(root.querySelector('#wsPlane'), message); }

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
  if (current.kind === 'wireframe') return current.edits ? `LAYOUT · ${current.edits} EDIT${current.edits === 1 ? '' : 'S'}` : 'LAYOUT · SKETCH';
  if (current.kind === 'sheet') return current.edits ? `SHEET · ${current.edits} EDIT${current.edits === 1 ? '' : 'S'}` : 'SHEET';
  if (current.kind === 'drawing') return 'DRAWING';
  if (current.kind === 'design') return `DESIGN · ${current.data.variants.length} CONCEPT${current.data.variants.length === 1 ? '' : 'S'}`;
  if (current.kind === 'drafting') return 'DESIGN · DRAFTING';
  if (current.kind === 'sources') return `READING · ${current.data.sources.length} SOURCES`;
  if (current.kind === 'pen') return 'YOUR SKETCH';
  return 'CANVAS';
}

function remark(text) { document.dispatchEvent(new CustomEvent('marquis:remark', { detail: { text, label: label() } })); }

export function initWorkspace() {
  root = qs('#workspace');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) close();
  });
  // Hovering a citation in Alfred's subtitles lights its source card.
  document.addEventListener('marquis:cite', (e) => citeSource(root, e.detail.n, e.detail.on));
}

export function open(k, data, { sources } = {}) {
  const wasOpen = Boolean(current);
  if (current) teardown();
  current = { kind: k, data, stage: 'select', edits: 0 };
  root.hidden = false;
  root.dataset.kind = k;
  root.innerHTML = `<div class="ws-head"><span class="ws-headline"><span class="ws-live" aria-hidden="true"></span><span class="label ws-title">${escapeHtml(headTitle())}</span><span class="label ws-kind">${escapeHtml(label())}</span></span><button type="button" class="act ws-close">Set aside ×</button></div><div class="ws-plane" id="wsPlane"></div>`;
  root.querySelector('.ws-close').addEventListener('click', close);
  document.body.dataset.workspace = k;
  setFieldState('workspace');
  const plane = root.querySelector('#wsPlane');
  if (k === 'chart') renderChart(plane, data);
  else if (k === 'reel') renderReel(plane, data);
  else if (k === 'wireframe') renderWireframe(plane, data);
  else if (k === 'sheet') renderSheet(plane, data);
  else if (k === 'drawing') renderDrawing(plane, data);
  else if (k === 'pen') renderPen(plane, data);
  else if (k === 'design') renderDesign(plane, data);
  else if (k === 'drafting') renderDrafting(plane, data);
  else if (k === 'sources') renderSources(plane, data.sources);
  if (k !== 'sources' && sources?.length) renderSources(root, sources, { strip: true });
  if (!skipMovement() && !wasOpen) { try { gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: EASE.out }); } catch (_) {} }
}

function headTitle() {
  const d = current.data || {};
  if (current.kind === 'reel') return `Images · ${d.query || 'gathered'}`;
  if (current.kind === 'wireframe') return 'Layout · ' + (d.subject || 'the site');
  if (current.kind === 'pen') return 'Your sketch · draw, then hand it to Alfred';
  return d.title || 'On the canvas';
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
const NEW_REQUEST = /\b(website|site|landing page|reel|instagram|chart|revenue|phase|pricing|show me|sketch|draw|design|logo|mark|icon|poster)\b/i;

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

async function renderReel(plane, data) {
  plane.innerHTML = '<p class="label ws-quiet">Gathering.</p>';
  const mine = current;
  let imgs, credit = '';
  if (DEMO_MODE) imgs = gatherImages(data.query);
  else {
    try {
      imgs = await searchImages(state.token, data.query || 'workspace');
      credit = 'Photographs: Unsplash';
    } catch (e) {
      if (current !== mine) return;
      plane.innerHTML = `<p class="label ws-quiet">${escapeHtml(e.message || 'Image search is unavailable.')}</p>`;
      return;
    }
  }
  if (current !== mine) return;
  if (!imgs.length) { plane.innerHTML = '<p class="label ws-quiet">Nothing came back for that. Try other words.</p>'; return; }
  plane.innerHTML = `<div class="reel" id="reel"></div><div class="reel-tray" id="reelTray" aria-label="Kept frames"></div>
    <div class="reel-act"><span class="label" id="reelCount">Select the frames to keep</span><span class="label">${credit}</span><button type="button" class="act" id="reelKeep" disabled>Keep these ›</button></div>`;
  const reel = plane.querySelector('#reel');
  const W = plane.clientWidth, H = plane.clientHeight;
  imgs.forEach((im, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'frame';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', im.alt ? `Frame ${i + 1}: ${im.alt}` : `Frame ${i + 1}`);
    if (im.author) b.title = `Photograph by ${im.author}`;
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

/* ---------------- sheet ---------------- */

function renderSheet(plane, data) {
  const sheet = createSheet(data.columns, data.rows);
  plane.innerHTML = `<div class="sheet-wrap"><table class="sheet" aria-label="${escapeHtml(data.title || 'Sheet')}">
    <thead><tr><th class="sheet-corner" aria-hidden="true"></th>${data.columns.map((c, i) => `<th scope="col"><span class="sheet-col">${colName(i)}</span>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody></tbody></table></div><p class="sheet-hint label">Click a value to change it · formulas start with =</p>`;
  const body = plane.querySelector('tbody');
  const paint = () => {
    body.innerHTML = Array.from({ length: sheet.rows }, (_, r) => `<tr><th scope="row" class="sheet-rn">${r + 1}</th>${data.columns.map((_, c) => {
      const raw = sheet.raw(r, c);
      const v = sheet.value(r, c);
      const isF = typeof raw === 'string' && raw.startsWith('=');
      const cls = [typeof v === 'number' ? 'num' : '', isF ? 'formula' : '', typeof v === 'string' && v.startsWith('#') ? 'err' : ''].join(' ').trim();
      return `<td class="${cls}" tabindex="0" data-r="${r}" data-c="${c}"${isF ? ` title="${escapeHtml(raw)}"` : ''}>${escapeHtml(String(formatCell(v)))}</td>`;
    }).join('')}</tr>`).join('');
  };
  paint();
  const edit = (td) => {
    const r = +td.dataset.r, c = +td.dataset.c;
    const raw = sheet.raw(r, c);
    const input = document.createElement('input');
    input.className = 'sheet-input';
    input.value = raw == null ? '' : String(raw);
    input.setAttribute('aria-label', `${colName(c)}${r + 1}`);
    td.textContent = '';
    td.appendChild(input);
    input.focus(); input.select();
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      if (keep) {
        const t = input.value.trim();
        const n = Number(t.replace(/,/g, ''));
        sheet.set(r, c, t === '' ? '' : t.startsWith('=') ? t.toUpperCase() : Number.isFinite(n) ? n : t);
        current.edits += 1;
      }
      paint();
      body.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(false); }
    });
    input.addEventListener('blur', () => commit(true));
  };
  body.addEventListener('click', (e) => { const td = e.target.closest('td'); if (td && !td.querySelector('input')) edit(td); });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('td')) { e.preventDefault(); edit(e.target); } });
  if (!skipMovement()) { try { gsap.from(body.querySelectorAll('tr'), { opacity: 0, duration: 0.7, ease: EASE.out, stagger: 0.04 }); } catch (_) {} }
}

/* ---------------- Alfred draws ---------------- */

const SVGNS = 'http://www.w3.org/2000/svg';

function renderDrawing(plane, data) {
  plane.innerHTML = `<svg class="drawing" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(data.title || 'Drawing')}"><defs><marker id="dArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke="rgba(233,230,224,.8)" stroke-width="1.2"/></marker></defs></svg>`;
  const svg = plane.querySelector('svg');
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(SVGNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text) n.textContent = text;
    svg.appendChild(n);
    return n;
  };
  const strokes = [];
  data.shapes.forEach((s) => {
    if (s.kind === 'rect') {
      strokes.push(el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, class: 'd-stroke', pathLength: 1 }));
      if (s.label) el('text', { x: s.x + s.w / 2, y: s.y + s.h / 2 + 1, class: 'd-label', 'text-anchor': 'middle' }, s.label);
    } else if (s.kind === 'line' || s.kind === 'arrow') {
      strokes.push(el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: 'd-stroke', pathLength: 1, ...(s.kind === 'arrow' ? { 'marker-end': 'url(#dArrow)' } : {}) }));
    } else if (s.kind === 'circle') {
      strokes.push(el('circle', { cx: s.x, cy: s.y, r: s.r, class: 'd-stroke', pathLength: 1 }));
      if (s.label) el('text', { x: s.x, y: s.y + s.r + 4, class: 'd-label', 'text-anchor': 'middle' }, s.label);
    } else if (s.kind === 'text') {
      el('text', { x: s.x, y: s.y, class: 'd-note' }, s.text);
    }
  });
  if (skipMovement()) return;
  // Stroke by stroke, in order, as if drawn by hand.
  try {
    const tl = gsap.timeline({ onComplete: () => gsap.set(strokes, { clearProps: 'strokeDasharray,strokeDashoffset' }) });
    strokes.forEach((s, i) => tl.fromTo(s, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, ease: EASE.out }, i * 0.32));
    tl.fromTo(svg.querySelectorAll('text'), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: EASE.out, stagger: 0.12 }, 0.4);
  } catch (_) {}
}

/* ---------------- You draw first ---------------- */

function renderPen(plane) {
  plane.innerHTML = `<canvas class="pen" id="pen" aria-label="Drawing surface. Draw with the mouse, a pen, or a finger."></canvas>
    <div class="pen-act"><button type="button" class="act" id="penUndo">Undo</button><button type="button" class="act" id="penClear">Clear</button>
    <span class="label pen-status" id="penStatus" aria-live="polite">Draw what you have in mind</span><button type="button" class="act gold-act" id="penRead" disabled>Hand it to Alfred ›</button></div>`;
  const cv = plane.querySelector('#pen');
  const ctx = cv.getContext('2d');
  const strokes = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const redraw = () => {
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.strokeStyle = 'rgba(233,230,224,0.9)';
    ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach((s) => {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x * r.width, p.y * r.height) : ctx.moveTo(p.x * r.width, p.y * r.height)));
      ctx.stroke();
    });
  };
  const fit = () => {
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const sync = () => { plane.querySelector('#penRead').disabled = !strokes.length; };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const s = [pt(e)];
    strokes.push(s);
    const move = (ev) => { s.push(pt(ev)); redraw(); };
    const up = () => { cv.removeEventListener('pointermove', move); sync(); };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up, { once: true });
    cv.addEventListener('pointercancel', up, { once: true });
  });
  plane.querySelector('#penUndo').addEventListener('click', () => { strokes.pop(); redraw(); sync(); });
  plane.querySelector('#penClear').addEventListener('click', () => { strokes.length = 0; redraw(); sync(); });
  plane.querySelector('#penRead').addEventListener('click', () => readDrawing(cv, strokes));
  new ResizeObserver(fit).observe(cv);
}

async function readDrawing(cv, strokes) {
  const status = qs('#penStatus');
  const btn = qs('#penRead');
  btn.disabled = true;
  status.textContent = 'Alfred is reading it';
  setFieldState('processing');
  // Export ink on a matte ground, so the model sees a drawing, not alpha.
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  const o = out.getContext('2d');
  o.fillStyle = '#050403';
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(cv, 0, 0);
  const hint = qs('#intent')?.value.trim() || '';
  let reply;
  try {
    reply = await interpretDrawing(state.token, out.toDataURL('image/png'), hint, strokes);
  } catch (e) {
    setFieldState('workspace');
    status.textContent = e.message || 'I could not read that.';
    btn.disabled = false;
    return;
  }
  setFieldState('workspace');
  openViz(reply.visualization);
  remark(reply.text);
}
