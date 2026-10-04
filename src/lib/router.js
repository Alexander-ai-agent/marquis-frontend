// Page router + persistent shell (rebuild brief §3, §7). Transitions are
// heavy: the outgoing page lets go quickly, the incoming one decelerates
// like a vault door. The .active swap is synchronous and CSS alone shows
// the active page, so a stalled animation never leaves a page blank.
//
// Keys: "/" from anywhere focuses Alfred's input (switching to the Butler
// screen); Escape returns to wherever "/" was pressed.

import { qs, qsa } from './dom.js';
import { skipMovement, EASE } from './motion.js';

const gsap = window.gsap;
const listeners = [];
let returnTo = null;

export function onPageChange(cb) { listeners.push(cb); }
export function currentPage() { return qs('.page.active')?.id.replace('page-', '') || null; }

export function goToPage(target, { instant = false } = {}) {
  const current = qs('.page.active');
  const next = document.getElementById(`page-${target}`);
  if (!next || current === next) return;

  qsa('#shellNav [data-page]').forEach((b) => {
    if (b.dataset.page === target) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  const still = instant || skipMovement() || !current;
  if (!still) {
    try { gsap.to(current, { opacity: 0, duration: 0.42, ease: EASE.out }); } catch (_) { /* non-fatal */ }
  }
  setTimeout(() => {
    if (current) {
      current.classList.remove('active');
      try { gsap?.set(current, { clearProps: 'opacity,transform' }); } catch (_) {}
    }
    next.classList.add('active');
    if (!still) {
      try { gsap.fromTo(next, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, clearProps: 'opacity,transform' }); }
      catch (_) { /* already visible by CSS */ }
    }
    listeners.forEach((cb) => { try { cb(target); } catch (e) { console.warn('[router] page hook failed:', e); } });
  }, still ? 0 : 220);
}

export function initRouter() {
  qsa('#shellNav [data-page]').forEach((b) => b.addEventListener('click', () => { returnTo = null; goToPage(b.dataset.page); }));
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('[data-goto]');
    if (link) goToPage(link.dataset.goto);
  });

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.phase !== 'app') return;
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      const here = currentPage();
      if (here !== 'butler') { returnTo = here; goToPage('butler'); }
      setTimeout(() => qs('#intent')?.focus(), here === 'butler' ? 0 : 260);
    } else if (e.key === 'Escape' && returnTo && currentPage() === 'butler' && !document.body.dataset.workspace) {
      qs('#intent')?.blur();
      const back = returnTo; returnTo = null;
      goToPage(back);
    }
  });
}

/** Wake the shell out of its dormant first-load state. */
export function wakeShell() { qs('#shell')?.setAttribute('data-dormant', 'false'); }

/** The running head: MARQUIS · ALFRED · [live date]. */
export function startRunningHead() {
  const el = qs('#shellRun');
  const paint = () => {
    const d = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
    el.textContent = `MARQUIS · ALFRED · ${d}`;
  };
  paint();
  setInterval(paint, 60_000);
}
