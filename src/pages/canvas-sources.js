// What Alfred read: the web sources behind an answer, as glass cards on
// the canvas. Numbered to match his [n] citations; hovering a citation in
// his subtitles lights its card. Links open in a new tab, http(s) only.

import { escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';

const gsap = window.gsap;

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch (_) { return null; }
}

/** Render `sources` into `host`. `strip` = a single row under another block. */
export function renderSources(host, sources, { strip = false } = {}) {
  const cards = sources.map((s) => {
    const u = safeUrl(s.url);
    if (!u) return '';
    const domain = u.hostname.replace(/^www\./, '');
    return `<a class="src-card glass" role="listitem" data-n="${Number(s.n) || 0}" href="${escapeHtml(u.href)}" target="_blank" rel="noopener noreferrer">
      <span class="src-top"><span class="src-n">${String(s.n).padStart(2, '0')}</span><span class="src-mono" aria-hidden="true">${escapeHtml(domain[0] || '·')}</span></span>
      <span class="src-title">${escapeHtml(s.title || domain)}</span>
      <span class="src-foot"><span class="src-domain">${escapeHtml(domain)}</span><span class="src-open" aria-hidden="true">Open ›</span></span>
    </a>`;
  }).join('');
  host.insertAdjacentHTML('beforeend', `<div class="sources${strip ? ' is-strip' : ''}" role="list" aria-label="Sources Alfred read">${cards}</div>`);
  const list = host.lastElementChild;

  // Glass catches the light where the pointer is.
  list.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.src-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  if (!skipMovement()) {
    try { gsap.from(list.children, { opacity: 0, y: 16, duration: 0.8, ease: EASE.out, stagger: 0.07, delay: 0.2, clearProps: 'all' }); } catch (_) {}
  }
  return list;
}

/** Light (or unlight) the card for citation n. */
export function citeSource(root, n, on) {
  root.querySelectorAll('.src-card').forEach((c) => c.classList.toggle('is-cited', on && Number(c.dataset.n) === n));
}
