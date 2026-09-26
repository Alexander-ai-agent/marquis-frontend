// Progress: the journey map (MARQUIS_product.md "Progress visualisation").
// Vertical timeline, phase completion (MARQUIS_animations.md #4), and the
// milestone moment (#8). Terrain moved to the Butler canvas (Sep 24).

import { qs, escapeHtml } from '../lib/dom.js';
import { reveal, skipMovement, EASE } from '../lib/motion.js';
import { fetchPhases, completePhase, DEMO_MODE } from '../lib/api.js';
import { state } from '../lib/state.js';

const gsap = window.gsap;

const DEMO_PHASES = [
  { id: 'd1', phase_name: 'Foundation', estimated_days: 14, actual_days: 19, status: 'complete' },
  { id: 'd2', phase_name: 'Build', estimated_days: 21, actual_days: 33, status: 'complete' },
  { id: 'd3', phase_name: 'Launch', estimated_days: 14, actual_days: 8, status: 'active' },
  { id: 'd4', phase_name: 'First Revenue', estimated_days: 18, actual_days: null, status: 'future' },
  { id: 'd5', phase_name: 'Scale', estimated_days: 30, actual_days: null, status: 'future' },
];

let phases = [];
let built = false;

function daysOf(p) {
  if (p.status === 'active') {
    if (p.actual_days != null) return p.actual_days;
    if (p.started_at) return Math.max(0, Math.round((Date.now() - new Date(p.started_at).getTime()) / 86400000));
    return 0;
  }
  return p.actual_days;
}

function combinedGap() {
  return phases.reduce((sum, p) => {
    const d = daysOf(p);
    if (!p.estimated_days || d == null) return sum;
    if (p.status === 'complete') return sum + (d - p.estimated_days);
    if (p.status === 'active') return sum + Math.max(0, d - p.estimated_days);
    return sum;
  }, 0);
}

function rowHtml(p, i) {
  const cls = p.status === 'complete' ? 'done' : p.status === 'active' ? 'current' : 'future';
  const d = daysOf(p);
  const est = p.estimated_days;
  let time = '';
  let gap = '';
  if (cls === 'done' && d != null) {
    time = `${d} days <span>· estimated ${est ?? '—'}</span>`;
    const g = est ? d - est : 0;
    gap = est ? `<span class="tl-gap ${g > 0 ? 'over' : ''}">${g > 0 ? `+${g}d over` : g < 0 ? `${g}d under` : 'on estimate'}</span>` : '';
  } else if (cls === 'current') {
    time = `day ${d} <span>· of ${est ?? '—'} estimated</span>`;
    if (est && d > est) gap = `<span class="tl-gap over">+${d - est}d over</span>`;
  } else {
    time = est ? `estimated ${est} days` : '';
  }
  const status = cls === 'done' ? 'Complete' : cls === 'current' ? 'Underway' : 'Ahead';
  const actions = cls === 'current'
    ? `<div class="tl-actions"><button type="button" class="btn" data-complete="${escapeHtml(String(p.id))}">Mark this phase complete</button><span class="tl-confirm-note"></span></div>`
    : '';
  return `<li class="tl-row ${cls}" data-index="${i}">
    <div class="tl-track"><span class="tl-node"></span><span class="tl-ripple"></span><span class="tl-line"></span></div>
    <div class="tl-content">
      <div class="tl-name">${escapeHtml(p.phase_name)}</div>
      <div class="tl-status">Phase ${i + 1} · ${status}</div>
      ${time ? `<div class="tl-time"><span>${time}</span>${gap}</div>` : ''}
      ${actions}
    </div>
  </li>`;
}

function note() {
  const done = phases.filter((p) => p.status === 'complete' && p.estimated_days && p.actual_days != null);
  const worst = done.reduce((w, p) => (!w || p.actual_days - p.estimated_days > w.actual_days - w.estimated_days ? p : w), null);
  const current = phases.find((p) => p.status === 'active');
  if (!phases.length) return 'Your pathway begins when your first phase is set. Finish onboarding and it will appear here.';
  const parts = [];
  if (worst && worst.actual_days > worst.estimated_days) parts.push(`Most of the gap came from <b>${escapeHtml(worst.phase_name)}</b>.`);
  if (current) {
    const d = daysOf(current);
    parts.push(current.estimated_days && d <= current.estimated_days
      ? `<b>${escapeHtml(current.phase_name)}</b> is tracking within its estimate.`
      : `<b>${escapeHtml(current.phase_name)}</b> has run past its estimate.`);
  }
  parts.push('The line only moves forward when a phase is genuinely finished, not when it feels finished.');
  return parts.join(' ');
}

function render() {
  const current = phases.find((p) => p.status === 'active');
  const idx = phases.indexOf(current);
  qs('#progEyebrow').textContent = current ? `Phase ${idx + 1} of ${phases.length}` : phases.length ? 'Every phase complete' : 'Your pathway';
  qs('#progTitle').textContent = current ? current.phase_name : phases.length ? 'Complete' : 'Not yet begun';
  const g = combinedGap();
  qs('#progGap').innerHTML = phases.length
    ? `<div class="num ${g > 0 ? 'over' : ''}">${g > 0 ? `+${g}d` : g < 0 ? `${g}d` : '0d'}</div><div class="lbl">${g > 0 ? 'Behind combined estimate' : g < 0 ? 'Ahead of combined estimate' : 'On combined estimate'}</div>`
    : '';
  qs('#timeline').innerHTML = phases.map(rowHtml).join('');
  qs('#progNote').innerHTML = note();
  qs('#timeline').querySelectorAll('[data-complete]').forEach((b) => b.addEventListener('click', onComplete));
}

export async function buildTerrain() { // name kept: main.js calls this on first visit
  if (built) return;
  built = true;
  try {
    phases = DEMO_MODE ? DEMO_PHASES.map((p) => ({ ...p })) : await fetchPhases(state.token);
  } catch (e) {
    qs('#progTitle').textContent = 'Unavailable';
    qs('#progNote').textContent = "I can't reach your pathway at the moment. Nothing is lost. Try again shortly.";
    built = false;
    return;
  }
  render();
  reveal('#timeline .tl-row', { y: 12, duration: 0.24, stagger: 0.06 });
}

/* ---------- Phase completion: two-step confirm, then #4 then #8 ---------- */

let confirmTimer = null;
async function onComplete(e) {
  const btn = e.currentTarget;
  const noteEl = btn.parentElement.querySelector('.tl-confirm-note');
  const current = phases.find((p) => String(p.id) === btn.dataset.complete);
  if (!current) return;

  if (btn.dataset.armed !== 'true') {
    // Irreversible: ask once, in-voice, with the confirm as the gold CTA.
    btn.dataset.armed = 'true';
    btn.classList.add('btn-primary');
    btn.textContent = `Confirm: ${current.phase_name} is finished`;
    noteEl.textContent = 'Finished, not nearly finished.';
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      btn.dataset.armed = 'false';
      btn.classList.remove('btn-primary');
      btn.textContent = 'Mark this phase complete';
      noteEl.textContent = '';
    }, 6000);
    return;
  }
  clearTimeout(confirmTimer);
  btn.disabled = true;

  const days = daysOf(current);
  if (!DEMO_MODE) {
    try {
      await completePhase(state.token, current.id);
    } catch (err) {
      btn.disabled = false;
      noteEl.textContent = "That didn't reach your records. Nothing has changed. Try again shortly.";
      return;
    }
  }

  const i = phases.indexOf(current);
  current.status = 'complete';
  current.actual_days = days;
  const next = phases[i + 1];
  if (next && next.status === 'future') { next.status = 'active'; next.actual_days = 0; next.started_at = new Date().toISOString(); }

  await animateNodeCompletion(i);
  render();
  const est = current.estimated_days;
  showMilestone(`${current.phase_name}, complete.`,
    `${days} day${days === 1 ? '' : 's'}${est ? ` against an estimate of ${est}` : ''}.${next ? ` ${next.phase_name} begins now.` : ' Every phase is behind you.'}`);
}

/** MARQUIS_animations.md #4: scale up with overshoot while turning gold,
 * settle, gold ripple, the line below draws, the next node arrives. */
function animateNodeCompletion(i) {
  return new Promise((resolve) => {
    const row = qs(`#timeline .tl-row[data-index="${i}"]`);
    const nextRow = qs(`#timeline .tl-row[data-index="${i + 1}"]`);
    if (!row || skipMovement()) return resolve();
    const node = row.querySelector('.tl-node');
    const ripple = row.querySelector('.tl-ripple');
    const line = row.querySelector('.tl-line');
    const done = () => resolve();
    const safety = setTimeout(done, 1500);
    try {
      gsap.timeline({ onComplete: () => { clearTimeout(safety); done(); } })
        .to(node, { scale: 1.4, duration: 0.2, ease: EASE.milestone })
        .to(node, { backgroundColor: '#B8962E', borderColor: '#B8962E', duration: 0.2 }, '<')
        .to(node, { scale: 1, duration: 0.15, ease: EASE.out })
        .fromTo(ripple, { scale: 1, opacity: 0.6 }, { scale: 2.5, opacity: 0, duration: 0.4, ease: EASE.out }, '-=0.3')
        .fromTo(line, { scaleY: 0, backgroundColor: 'rgba(184,150,46,0.5)' }, { scaleY: 1, duration: 0.3, ease: EASE.out }, '-=0.2')
        .fromTo(nextRow ? nextRow.querySelector('.tl-node') : {}, { scale: 0.8 }, { scale: 1, duration: 0.2, ease: EASE.out });
    } catch (_) { clearTimeout(safety); done(); }
  });
}

/* ---------- Milestone overlay (#8) ---------- */

let milestoneTimer = null;
export function showMilestone(title, sub) {
  const el = qs('#milestone');
  const titleEl = qs('#milestoneTitle');
  titleEl.innerHTML = [...title].map((c) => `<span class="ch">${escapeHtml(c)}</span>`).join('');
  qs('#milestoneSub').textContent = sub;
  el.hidden = false;
  const dismiss = () => {
    clearTimeout(milestoneTimer);
    el.removeEventListener('click', dismiss);
    if (skipMovement()) { el.hidden = true; return; }
    try { gsap.to(el, { opacity: 0, duration: 0.3, ease: EASE.standard, onComplete: () => { el.hidden = true; gsap.set(el, { clearProps: 'opacity' }); } }); }
    catch (_) { el.hidden = true; }
    setTimeout(() => { el.hidden = true; }, 800);
  };
  el.addEventListener('click', dismiss);
  milestoneTimer = setTimeout(dismiss, 4000);
  if (skipMovement()) return;
  try {
    const timer = el.querySelector('.milestone-timer span');
    gsap.timeline()
      .fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE.out })
      .fromTo('.milestone-box', { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: EASE.milestone }, '<')
      .fromTo('#milestoneTitle .ch', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.02, ease: EASE.out }, '-=0.2')
      .fromTo('.milestone-line', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: EASE.out }, '-=0.1')
      .fromTo('#milestoneSub', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: EASE.out }, '-=0.2');
    // The auto-dismiss indicator is a literal 4s timer, so it runs linearly (as spec'd).
    gsap.fromTo(timer, { scaleX: 0 }, { scaleX: 1, duration: 4, ease: 'none' });
  } catch (_) { /* overlay is already visible by CSS */ }
}
