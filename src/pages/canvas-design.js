// The designer's work on the canvas: each concept on its own glass board,
// drawn on stroke by stroke with fills settling in after. Click a concept
// to bring it forward (Escape or click again to step back); each one can
// be saved as an SVG. While the designer is still working, the canvas
// shows the drafting table: construction geometry being laid out.

import { escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';

const gsap = window.gsap;
const SVGNS = 'http://www.w3.org/2000/svg';

const PAINT = {
  none: 'none',
  ink: '#E9E6E0',
  'ink-soft': 'rgba(233,230,224,0.55)',
  gold: '#E8B84B',
  'gold-light': '#F3DFA8',
  amber: '#C9822B',
  bronze: '#8A6A3B',
  oxblood: '#7A2A1E',
  ground: '#0B0907',
};
const GRADIENTS = {
  'gold-gradient': ['#F3DFA8', '#E8B84B', '#9C6B1F'],
  'ink-gradient': ['#FFFFFF', '#E9E6E0', '#8E8A83'],
  'dusk-gradient': ['#E8B84B', '#B4562A', '#5E1E15'],
};
const BACKGROUND = { ground: '#0B0907', ink: '#E9E6E0', gold: '#E8B84B', oxblood: '#3E140E' };
const FONT = { serif: "'Cormorant Garamond', Georgia, serif", mono: "'JetBrains Mono', ui-monospace, monospace" };

let boardSeq = 0;

function node(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null) n.setAttribute(k, String(v)); });
  parent?.appendChild(n);
  return n;
}

/** One concept as an SVG element (also what "Save SVG" writes out). */
function board(variant) {
  const id = `dz${(boardSeq += 1)}`;
  const svg = node('svg', { xmlns: SVGNS, viewBox: '0 0 100 100', role: 'img', 'aria-label': variant.name });
  const defs = node('defs', {}, svg);
  Object.entries(GRADIENTS).forEach(([name, stops]) => {
    const g = node('linearGradient', { id: `${id}-${name}`, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    stops.forEach((c, i) => node('stop', { offset: `${(i / (stops.length - 1)) * 100}%`, 'stop-color': c }, g));
  });
  const paint = (p) => (GRADIENTS[p] ? `url(#${id}-${p})` : PAINT[p] || 'none');
  node('rect', { x: 0, y: 0, width: 100, height: 100, fill: BACKGROUND[variant.background] || BACKGROUND.ground, 'data-ground': '1' }, svg);

  variant.shapes.forEach((s) => {
    const style = {
      fill: paint(s.fill),
      stroke: paint(s.stroke),
      'stroke-width': s.stroke !== 'none' ? s.sw : undefined,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: s.opacity < 1 ? s.opacity : undefined,
      transform: s.rotate ? `rotate(${s.rotate} ${s.ox} ${s.oy})` : undefined,
    };
    let el;
    if (s.kind === 'path') el = node('path', { d: s.d, ...style }, svg);
    else if (s.kind === 'rect') el = node('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx || undefined, ...style }, svg);
    else if (s.kind === 'circle') el = node('circle', { cx: s.cx, cy: s.cy, r: s.r, ...style }, svg);
    else if (s.kind === 'ellipse') el = node('ellipse', { cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry, ...style }, svg);
    else if (s.kind === 'polygon') el = node('polygon', { points: s.points.map((p) => p.join(',')).join(' '), ...style }, svg);
    else if (s.kind === 'line') el = node('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, ...style }, svg);
    else if (s.kind === 'text') {
      el = node('text', {
        x: s.x, y: s.y, ...style,
        'font-family': FONT[s.family] || FONT.serif, 'font-size': s.size, 'font-weight': s.weight,
        'text-anchor': s.anchor, 'letter-spacing': s.ls || undefined, 'dominant-baseline': 'alphabetic',
      }, svg);
      el.textContent = s.text;
    }
    if (el) el.dataset.kind = s.kind;
  });
  return svg;
}

function slug(s) { return String(s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design'; }

function saveSvg(svg, name) {
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(name)}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Stroke-by-stroke draw-on, then fills and type settle in. */
function drawOn(svg, delay) {
  const marks = [...svg.children].filter((n) => n.dataset.kind);
  const stroked = marks.filter((n) => n.dataset.kind !== 'text' && n.getAttribute('stroke') && n.getAttribute('stroke') !== 'none');
  stroked.forEach((n) => n.setAttribute('pathLength', '1'));
  // Each tween cleans up after itself, so an interrupted or skipped
  // animation can never leave a stroke dashed or a fill hidden.
  const tl = gsap.timeline({ delay });
  marks.forEach((n, i) => {
    const at = i * 0.09;
    if (stroked.includes(n)) {
      tl.fromTo(n, { strokeDasharray: 1, strokeDashoffset: 1 }, {
        strokeDashoffset: 0, duration: 0.9, ease: EASE.out, immediateRender: true,
        onComplete: () => { gsap.set(n, { clearProps: 'strokeDasharray,strokeDashoffset' }); n.removeAttribute('pathLength'); },
      }, at);
    }
    tl.fromTo(n, { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.7, ease: EASE.out, immediateRender: true, clearProps: 'fillOpacity' }, at + 0.35);
  });
  // Animation frames can stall (a background tab, a throttled pane); the
  // work must never be left half-drawn. Settle it once it should be done.
  setTimeout(() => {
    tl.kill();
    gsap.set(marks, { clearProps: 'strokeDasharray,strokeDashoffset,fillOpacity' });
    stroked.forEach((n) => n.removeAttribute('pathLength'));
  }, (delay + tl.duration()) * 1000 + 1200);
}

export function renderDesign(plane, data) {
  const variants = data.variants || [];
  plane.innerHTML = `<div class="design-grid n${variants.length}" role="list"></div>`;
  const grid = plane.firstElementChild;
  variants.forEach((v, i) => {
    const card = document.createElement('figure');
    card.className = 'design-card glass';
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;
    card.innerHTML = `<div class="design-art"></div><figcaption class="design-cap">
      <span class="label design-name">${String(i + 1).padStart(2, '0')} · ${escapeHtml(v.name)}</span>
      ${v.note ? `<span class="design-note">${escapeHtml(v.note)}</span>` : ''}
      <button type="button" class="act design-save">Save SVG ↓</button></figcaption>`;
    const svg = board(v);
    card.querySelector('.design-art').appendChild(svg);
    card.querySelector('.design-save').addEventListener('click', (e) => { e.stopPropagation(); saveSvg(svg, `${data.title}-${v.name}`); });
    const focus = () => {
      const on = !card.classList.contains('is-focus');
      grid.querySelectorAll('.design-card').forEach((c) => c.classList.toggle('is-focus', on && c === card));
      grid.classList.toggle('has-focus', on);
    };
    card.addEventListener('click', focus);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(); }
      if (e.key === 'Escape' && grid.classList.contains('has-focus')) { e.stopPropagation(); focus(); }
    });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
    card.style.setProperty('--i', i);
    grid.appendChild(card);
    if (!skipMovement()) {
      try { drawOn(svg, 0.3 + i * 0.25); } catch (_) {}
    }
  });
}

/** The drafting table: construction geometry laid out, over and over,
 * until the designer's work arrives. */
export function renderDrafting(plane, data) {
  const lines = [
    '<circle cx="50" cy="50" r="30"/>', '<circle cx="50" cy="50" r="18.54"/>', '<circle cx="61.46" cy="50" r="11.46"/>',
    '<line x1="10" y1="50" x2="90" y2="50"/>', '<line x1="50" y1="10" x2="50" y2="90"/>',
    '<line x1="22" y1="22" x2="78" y2="78"/>', '<line x1="78" y1="22" x2="22" y2="78"/>',
    '<rect x="20" y="20" width="60" height="60"/>', '<path d="M 50 20 A 30 30 0 0 1 80 50"/>',
  ];
  plane.innerHTML = `<div class="drafting">
    <svg class="drafting-art" viewBox="0 0 100 100" aria-hidden="true">${lines.map((l, i) => l.replace(/^<(\w+)/, `<$1 pathLength="1" style="--i:${i}"`)).join('')}</svg>
    <p class="label drafting-label">Drafting<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
    <p class="drafting-brief">${escapeHtml(data.brief || '')}</p></div>`;
}

export function failDrafting(plane, message) {
  const label = plane.querySelector('.drafting-label');
  if (!label) return;
  plane.querySelector('.drafting')?.classList.add('is-stopped');
  label.textContent = message || 'The designer is unavailable right now.';
}
