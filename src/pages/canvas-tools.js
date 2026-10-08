// The canvas's interactive creations, one panel each (see workspace.js):
//
//   chart     — a graph Alfred is explaining, drawn by bklit-ui.
//   reel      — images scattered across the plane; click to keep; the rest
//               leave, the keepers come in toward Alfred; he proposes an
//               order and asks for the music.
//   wireframe — a layout Alfred sketched; regions can be moved, resized and
//               annotated in place.
//   sheet     — a ruled ledger whose values and formulas you can edit.
//   drawing   — Alfred's diagram, drawn on stroke by stroke.
//   pen       — your sketch surface, which you hand to Alfred.
//
// Every renderer takes the panel's plane, its data, its item `me`, and the
// workspace `host` (remark / changed / penResult). They hold no module-level
// state, so any number of panels can be open at once. Edits are written back
// into `data`, which is what gets saved and what a collapsed panel keeps.

import { escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';
import { setFieldState } from '../lib/field.js';
import { DEMO_MODE, searchImages, interpretDrawing } from '../lib/api.js';
import { state } from '../lib/state.js';
import { createSheet, colName, formatCell } from '../lib/sheet.js';

const gsap = window.gsap;
const SVGNS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- chart ---------------- */

export function renderChart(plane, viz, me) {
  plane.innerHTML = '<div class="ws-chart"></div>';
  const host = plane.firstElementChild;
  const mount = () => {
    if (!me.live) return;
    let handle = null;
    try { handle = window.MarquisCanvas?.mountViz(host, viz) || null; } catch (e) { console.warn('[workspace] chart failed:', e); }
    if (!handle) host.innerHTML = `<p class="ws-quiet label">${escapeHtml(viz.title || 'The chart could not be drawn.')}</p>`;
    else me.cleanups.push(() => { try { handle.destroy(); } catch (_) {} });
  };
  if (window.MarquisCanvas) mount(); else window.addEventListener('load', mount, { once: true });
}

/* ---------------- reel ---------------- */

// The demo gathers public photographs from picsum.photos; if those can't
// load, drawn placeholder frames stand in. In live mode the photographs are
// Unsplash's own hotlinked URLs, with their credit kept.
function gatherImages(query, n = 12) {
  const seed = (query || 'marquis').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return Array.from({ length: n }, (_, i) => ({ id: `${seed}-${i}`, src: `https://picsum.photos/seed/${seed}-${i}/360/480?grayscale` }));
}

const slimImage = (im) => ({ id: im.id || '', src: im.src, alt: im.alt || '', author: im.author || '', author_url: im.author_url || '' });

function placeholder(i) {
  const lines = Array.from({ length: 5 }, (_, k) => `<line x1="0" y1="${40 + k * 18 + (i % 3) * 4}" x2="90" y2="${30 + k * 16}" stroke="rgba(233,230,224,.18)" stroke-width="1"/>`).join('');
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120"><rect width="90" height="120" fill="#2a2520"/><rect x=".5" y=".5" width="89" height="119" fill="none" stroke="rgba(233,230,224,.3)"/>${lines}</svg>`);
}

/** The order of kept frames, as handed to the other agents. */
export function reelOrder(data) {
  return (data.kept || []).map((idx, n) => ({ frame: n + 1, src: data.images?.[idx]?.src })).filter((f) => f.src);
}

function frameEl(im, i) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'frame';
  b.dataset.i = String(i);
  b.setAttribute('aria-pressed', 'false');
  b.setAttribute('aria-label', im.alt ? `Frame ${i + 1}: ${im.alt}` : `Frame ${i + 1}`);
  if (im.author) b.title = `Photograph by ${im.author}`;
  // The drawn frame shows at once; the photograph replaces it when it lands
  // (and stays drawn if it never does, so a dead link is never a broken image).
  const img = new Image();
  img.alt = '';
  img.src = placeholder(i);
  const photo = new Image();
  photo.onload = () => { img.src = im.src; };
  photo.src = im.src;
  b.appendChild(img);
  return b;
}

export async function renderReel(plane, data, me, host) {
  const token = me.renderToken;
  plane.innerHTML = '<p class="label ws-quiet">Gathering.</p>';
  if (!data.images?.length) {
    try {
      data.images = DEMO_MODE ? gatherImages(data.query) : (await searchImages(state.token, data.query || 'workspace')).map(slimImage);
    } catch (e) {
      if (me.renderToken !== token) return;
      plane.innerHTML = `<p class="label ws-quiet">${escapeHtml(e.message || 'Image search is unavailable.')}</p>`;
      return;
    }
    if (me.renderToken !== token) return;
    if (data.images.length) host.changed(me, { silent: true });     // remembered, so a refresh doesn't search again
  }
  if (!data.images.length) { plane.innerHTML = '<p class="label ws-quiet">Nothing came back for that. Try other words.</p>'; return; }
  const imgs = data.images;
  const credit = DEMO_MODE ? '' : 'Photographs: Unsplash';
  plane.innerHTML = `<div class="reel"></div><div class="reel-tray" aria-label="Kept frames"></div>
    <div class="reel-act"><span class="label reel-count">Select the frames to keep</span><span class="label">${credit}</span><button type="button" class="act reel-keep" disabled>Keep these ›</button></div>`;
  const reel = plane.querySelector('.reel');

  // Restored after the frames were kept: straight to the tray.
  if (data.kept?.length && data.stage && data.stage !== 'select') {
    const tray = plane.querySelector('.reel-tray');
    plane.querySelector('.reel-act').hidden = true;
    data.kept.forEach((idx, n) => {
      if (!imgs[idx]) return;
      const b = frameEl(imgs[idx], idx);
      b.disabled = true;
      const label = document.createElement('span');
      label.className = 'frame-idx label';
      label.textContent = String(n + 1).padStart(2, '0');
      b.appendChild(label);
      tray.appendChild(b);
    });
    return;
  }

  const W = plane.clientWidth, H = plane.clientHeight;
  imgs.forEach((im, i) => {
    const b = frameEl(im, i);
    // Scattered, not gridded: a loose field across the plane.
    const col = i % 6, row = Math.floor(i / 6);
    b.style.left = `${(col + 0.5) / 6 * W + (Math.sin(i * 7.3) * W) / 28}px`;
    b.style.top = `${(row + 0.5) / 2 * (H * 0.82) + (Math.cos(i * 3.1) * H) / 18}px`;
    b.addEventListener('click', () => {
      if ((data.stage || 'select') !== 'select') return;
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      const n = reel.querySelectorAll('[aria-pressed="true"]').length;
      plane.querySelector('.reel-count').textContent = n ? `${n} kept` : 'Select the frames to keep';
      plane.querySelector('.reel-keep').disabled = n === 0;
    });
    reel.appendChild(b);
  });
  if (!skipMovement()) {
    try { gsap.from(reel.children, { opacity: 0, y: 14, duration: 0.9, ease: EASE.out, stagger: { each: 0.05, from: 'random' } }); } catch (_) {}
  }
  plane.querySelector('.reel-keep').addEventListener('click', () => keepFrames(plane, me, host));
}

function keepFrames(plane, me, host) {
  const data = me.data;
  const reel = plane.querySelector('.reel');
  const tray = plane.querySelector('.reel-tray');
  const all = [...reel.children];
  const kept = all.filter((b) => b.getAttribute('aria-pressed') === 'true');
  const gone = all.filter((b) => b.getAttribute('aria-pressed') !== 'true');
  plane.querySelector('.reel-act').hidden = true;

  // Unselected leave the canvas; keepers come in toward Alfred, in order.
  const W = plane.clientWidth;
  gone.forEach((b) => {
    const r = b.getBoundingClientRect();
    const dx = (r.left + r.width / 2 < window.innerWidth / 2 ? -1 : 1) * (W * 0.7);
    if (skipMovement()) b.remove();
    else { try { gsap.to(b, { x: dx, opacity: 0, duration: 0.8, ease: EASE.out, onComplete: () => b.remove() }); } catch (_) { b.remove(); } }
  });
  data.kept = kept.map((b) => Number(b.dataset.i));
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
  data.stage = 'music';
  host.changed(me);
  setTimeout(() => host.remark(me, proposal(kept.length)), skipMovement() ? 0 : 900);
}

function proposal(n) {
  if (n === 1) return 'One frame holds the whole reel; I would let it breathe for six seconds. What should it be set to?';
  return `I would open on frame ${String(Math.min(2, n)).padStart(2, '0')} and close on the first, ${n} cuts at roughly a second each. What music should carry it?`;
}

/* ---------------- wireframe ---------------- */

export const DEFAULT_REGIONS = [
  { id: 'nav', label: 'Navigation', x: 0.04, y: 0.04, w: 0.92, h: 0.08 },
  { id: 'hero', label: 'Opening statement', x: 0.04, y: 0.16, w: 0.56, h: 0.34, note: 'words rise in, one line at a time' },
  { id: 'media', label: 'Product, moving', x: 0.64, y: 0.16, w: 0.32, h: 0.34, note: 'loops only on hover' },
  { id: 'proof', label: 'Proof', x: 0.04, y: 0.56, w: 0.44, h: 0.18 },
  { id: 'how', label: 'How it works', x: 0.52, y: 0.56, w: 0.44, h: 0.18, note: 'three steps draw on scroll' },
  { id: 'close', label: 'The ask', x: 0.04, y: 0.80, w: 0.92, h: 0.14 },
];

export function renderWireframe(plane, data, me, host) {
  me.regions = data.regions = (data.regions || DEFAULT_REGIONS).map((r) => ({ ...r }));
  plane.innerHTML = '<div class="wire" role="group" aria-label="Site sketch. Drag to move, drag the corner to resize, double-click to annotate."></div><p class="wire-hint label">Drag to move · corner to resize · double-click to annotate</p>';
  const wire = plane.querySelector('.wire');
  me.regions.forEach((r) => wire.appendChild(regionEl(r, me, host)));
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

function place(node, r) { Object.assign(node.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }); }

function edited(me, host, what) {
  me.edits += 1;
  document.dispatchEvent(new CustomEvent('marquis:workspace-edit', { detail: { regions: me.regions, what } }));
  host.changed(me);
  // Alfred watches the edits and says what he understood, once things settle.
  clearTimeout(me.editTimer);
  me.editTimer = setTimeout(() => {
    if (!me.live) return;
    const hero = me.regions.find((x) => x.id === 'hero');
    const line = hero && hero.w > 0.6 ? 'The opening statement takes the full width now, so the product moves below it.' : `I have ${me.edits} change${me.edits === 1 ? '' : 's'} noted.`;
    host.remark(me, `${line} Tell me when it is right and I will build it.`);
  }, 1800);
}

function regionEl(r, me, host) {
  const node = document.createElement('div');
  node.className = 'region';
  node.tabIndex = 0;
  node.setAttribute('aria-label', r.label);
  place(node, r);
  node.innerHTML = `<svg class="region-rule" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="calc(100% - 1px)" height="calc(100% - 1px)" pathLength="1" stroke-dasharray="1"/></svg>
    <span class="region-label label">${escapeHtml(r.label)}</span>${r.note ? `<span class="region-note">${escapeHtml(r.note)}</span>` : ''}<span class="region-grip" aria-hidden="true"></span>`;
  drag(node, r, me, host);
  node.addEventListener('dblclick', () => annotate(node, r, me, host));
  node.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); r.x = clamp(r.x + moves[e.key][0], 0, 1 - r.w); r.y = clamp(r.y + moves[e.key][1], 0, 1 - r.h); place(node, r); edited(me, host); }
    if (e.key === 'Enter') { e.preventDefault(); annotate(node, r, me, host); }
  });
  return node;
}

function drag(node, r, me, host) {
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
      if (r.x !== start.r.x || r.y !== start.r.y || r.w !== start.r.w || r.h !== start.r.h) edited(me, host, resizing ? `${r.label} resized` : `${r.label} moved`);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up, { once: true });
    node.addEventListener('pointercancel', up, { once: true });
  });
}

function annotate(node, r, me, host) {
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
    edited(me, host, `note on ${r.label}`);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.stopPropagation(); input.remove(); } });
  input.addEventListener('blur', commit, { once: true });
}

/* ---------------- sheet ---------------- */

const rowsOf = (sheet, columns) => Array.from({ length: sheet.rows }, (_, r) => columns.map((_c, c) => sheet.raw(r, c) ?? ''));

export function renderSheet(plane, data, me, host) {
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
        data.rows = rowsOf(sheet, data.columns);
        me.edits += 1;
        host.changed(me);
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

export function renderDrawing(plane, data, me) {
  const arrow = `dArrow${me.n}`;
  plane.innerHTML = `<svg class="drawing" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(data.title || 'Drawing')}"><defs><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke="rgba(233,230,224,.8)" stroke-width="1.2"/></marker></defs></svg>`;
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
      strokes.push(el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: 'd-stroke', pathLength: 1, ...(s.kind === 'arrow' ? { 'marker-end': `url(#${arrow})` } : {}) }));
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

export function renderPen(plane, _data, me, host) {
  plane.innerHTML = `<canvas class="pen" aria-label="Drawing surface. Draw with the mouse, a pen, or a finger."></canvas>
    <div class="pen-act"><button type="button" class="act pen-undo">Undo</button><button type="button" class="act pen-clear">Clear</button>
    <span class="label pen-status" aria-live="polite">Draw what you have in mind</span><button type="button" class="act gold-act pen-read" disabled>Hand it to Alfred ›</button></div>`;
  const cv = plane.querySelector('.pen');
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
  const sync = () => { plane.querySelector('.pen-read').disabled = !strokes.length; };
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
  plane.querySelector('.pen-undo').addEventListener('click', () => { strokes.pop(); redraw(); sync(); });
  plane.querySelector('.pen-clear').addEventListener('click', () => { strokes.length = 0; redraw(); sync(); });
  plane.querySelector('.pen-read').addEventListener('click', () => readDrawing(plane, cv, strokes, me, host));
  const ro = new ResizeObserver(fit);
  ro.observe(cv);
  me.cleanups.push(() => ro.disconnect());
}

async function readDrawing(plane, cv, strokes, me, host) {
  const status = plane.querySelector('.pen-status');
  const btn = plane.querySelector('.pen-read');
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
  const hint = document.querySelector('#intent')?.value.trim() || '';
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
  host.penResult(me, reply);
}
