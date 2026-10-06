// Two more things Alfred can put on the canvas.
//
//   site — a working page the builder made, shown live. It runs in a
//          sandboxed iframe (scripts allowed; no same-origin, forms,
//          popups or top navigation), so it can never reach this app or
//          the founder's session. Desktop/mobile widths; download as HTML.
//   bars — one figure per item, compared: gold bars that grow in, the
//          largest in full gold, each with its source or year beneath.

import { escapeHtml } from '../lib/dom.js';

function slug(s) { return String(s || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'; }

function download(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function renderSite(plane, data) {
  plane.innerHTML = `<div class="site-frame glass-flat">
    <div class="site-bar">
      <span class="site-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="label site-title">${escapeHtml(data.title || 'The page')}</span>
      <span class="site-views" role="radiogroup" aria-label="Preview width">
        <button type="button" class="tog" role="radio" aria-checked="true" data-width="desktop">Desktop</button>
        <button type="button" class="tog" role="radio" aria-checked="false" data-width="mobile">Mobile</button>
      </span>
      <button type="button" class="act site-save">Download HTML ↓</button>
    </div>
    <div class="site-stage"><iframe class="site-view" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escapeHtml(data.title || 'The page')}, live"></iframe></div>
  </div>`;
  const frame = plane.querySelector('.site-view');
  frame.srcdoc = data.html;
  plane.querySelectorAll('[data-width]').forEach((b) => b.addEventListener('click', () => {
    plane.querySelectorAll('[data-width]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    plane.querySelector('.site-stage').dataset.width = b.dataset.width;
  }));
  plane.querySelector('.site-save').addEventListener('click', () => download(data.html, `${slug(data.title)}.html`, 'text/html'));
}

function fmt(v) {
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Number(v.toFixed(2)).toLocaleString();
}

export function renderBars(plane, data) {
  const items = data.items || [];
  const max = Math.max(...items.map((it) => Math.abs(it.value)), 0) || 1;
  const top = Math.max(...items.map((it) => it.value));
  plane.innerHTML = `<div class="bars" role="list" aria-label="${escapeHtml(data.title || 'Comparison')}">${items.map((it, i) => `
    <div class="bar-row" role="listitem" style="--i:${i}">
      <div class="bar-label"><span class="bar-name">${escapeHtml(it.label)}</span>${it.note ? `<span class="bar-note">${escapeHtml(it.note)}</span>` : ''}</div>
      <div class="bar-track"><div class="bar-fill${it.value === top ? ' is-top' : ''}" style="--w:${(Math.abs(it.value) / max) * 100}%"></div></div>
      <div class="bar-value">${escapeHtml(data.unit || '')}${fmt(it.value)}</div>
    </div>`).join('')}</div>`;
}
