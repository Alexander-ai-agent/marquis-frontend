// Page router + sidebar. Page transition = MARQUIS_animations.md #2:
// outgoing 150ms, up 8px; incoming starts 100ms after the click, 200ms,
// up from 8px on --ease-out. Exits use the standard curve (no ease-in).
// The .active swap is synchronous and CSS alone makes the active page
// visible, so a missing/stalled animation can never leave a page blank.

import { qs, qsa } from './dom.js';
import { reveal, skipMovement, EASE } from './motion.js';

const gsap = window.gsap;
const INCOMING_DELAY_MS = 100;
const listeners = [];

/** Subscribe to page changes (pages lazy-build on first visit). */
export function onPageChange(cb) { listeners.push(cb); }

export function currentPage() {
  return qs('.page.active')?.id.replace('page-', '') || null;
}

export function goToPage(target) {
  const current = qs('.page.active');
  const next = document.getElementById(`page-${target}`);
  closeSidebar();
  if (!next || current === next) return;

  qsa('.nav-item').forEach((n) => {
    const on = n.dataset.page === target;
    n.classList.toggle('active', on);
    on ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current');
  });

  if (!skipMovement() && current) {
    try {
      gsap.to(current, { opacity: 0, y: -8, duration: 0.15, ease: EASE.standard });
    } catch (e) {
      console.warn('[router] outgoing page fade failed (non-fatal):', e);
    }
  }

  setTimeout(() => {
    if (current) {
      current.classList.remove('active');
      try { gsap?.set(current, { clearProps: 'opacity,transform' }); } catch (_) {}
    }
    next.classList.add('active');
    reveal(next, { y: 8, duration: 0.2 });
    listeners.forEach((cb) => { try { cb(target); } catch (e) { console.warn('[router] page hook failed:', e); } });
  }, skipMovement() ? 0 : INCOMING_DELAY_MS);
}

/* ---------------- Sidebar ---------------- */

function openSidebar(withOverlay = false) {
  qs('#sidebar')?.classList.add('open');
  // The dimming overlay is the mobile/touch pattern only (MARQUIS_animations.md #1).
  if (withOverlay) qs('#sidebarOverlay')?.classList.add('show');
  qs('#menuBtn')?.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  qs('#sidebar')?.classList.remove('open');
  qs('#sidebarOverlay')?.classList.remove('show');
  qs('#menuBtn')?.setAttribute('aria-expanded', 'false');
}

export function initRouter() {
  qsa('.nav-item[data-page]').forEach((el) => el.addEventListener('click', () => goToPage(el.dataset.page)));
  qsa('[data-page-link]').forEach((el) => el.addEventListener('click', () => goToPage(el.dataset.pageLink)));
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('[data-goto]');
    if (link) goToPage(link.dataset.goto);
  });

  // Desktop: hover-reveal with 80ms hover intent (no trigger on a
  // pass-through), hides when the pointer leaves the sidebar.
  const sidebar = qs('#sidebar');
  const strip = qs('#hoverStrip');
  let intent = null;
  strip?.addEventListener('mouseenter', () => { intent = setTimeout(() => openSidebar(false), 80); });
  strip?.addEventListener('mouseleave', () => clearTimeout(intent));
  sidebar?.addEventListener('mouseleave', () => {
    if (window.matchMedia('(hover:hover)').matches) closeSidebar();
  });

  // Touch / narrow screens: hamburger + overlay.
  qs('#menuBtn')?.addEventListener('click', () => openSidebar(true));
  qs('#sidebarOverlay')?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
}
