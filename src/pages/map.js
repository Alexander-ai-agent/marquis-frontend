// Map (rebuild brief §8): a 1px spine a third of the way in; 4px nodes,
// white ahead and gold behind you; the current position is a 6px node with
// a slow pulse ring (the brief's second named loop). Nothing else, except
// what the product needs to keep working: the current phase can be marked
// complete (two-step), which plays the node completion and the milestone,
// the one place MARQUIS is allowed to snap.

import { qs, escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';
import { completePhase, DEMO_MODE } from '../lib/api.js';
import { state } from '../lib/state.js';
import { loadAll, daysIn, invalidate } from '../lib/data.js';

const gsap = window.gsap;
let phases = [];

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : '');

function row(p, i) {
  const cls = p.status === 'complete' ? 'done' : p.status === 'active' ? 'current' : 'ahead';
  const d = daysIn(p);
  const date = cls === 'done' ? `${fmt(p.started_at)} — ${fmt(p.completed_at)}` : cls === 'current' ? `SINCE ${fmt(p.started_at)}` : `${p.estimated_days ?? '—'} DAYS ESTIMATED`;
  const status = cls === 'done' ? `COMPLETE · ${d} OF ${p.estimated_days}` : cls === 'current' ? `UNDERWAY · DAY ${d} OF ${p.estimated_days}` : 'AHEAD';
  const act = cls === 'current' ? `<button type="button" class="act map-complete" data-complete="${escapeHtml(String(p.id))}">Mark complete ›</button><span class="map-note label"></span>` : '';
  return `<li class="map-row ${cls}" data-index="${i}">
    <span class="map-node" aria-hidden="true"></span>
    <div class="map-body">
      <h2 class="map-name serif">${escapeHtml(p.phase_name)}</h2>
      <div class="map-date">${date}</div>
      <div class="map-status label">${status}</div>
      ${act}
    </div>
  </li>`;
}

function render() {
  const list = qs('#mapList');
  if (!phases.length) { list.innerHTML = '<li class="map-row ahead"><div class="map-body"><h2 class="map-name serif">Not yet begun</h2><div class="map-status label">Your pathway appears once the first phase is set.</div></div></li>'; return; }
  list.innerHTML = phases.map(row).join('');
  list.querySelectorAll('[data-complete]').forEach((b) => b.addEventListener('click', onComplete));
}

export async function renderMap() {
  let data;
  try { data = await loadAll(); } catch (_) { data = { ok: false, phases: [] }; }
  if (!data.ok) { qs('#mapList').innerHTML = '<li class="map-row"><div class="map-body"><div class="map-status label">I can\'t reach your pathway at the moment. Nothing is lost.</div></div></li>'; return; }
  phases = data.phases;
  render();
}

let armTimer = null;
async function onComplete(e) {
  const btn = e.currentTarget;
  const note = btn.parentElement.querySelector('.map-note');
  const current = phases.find((p) => String(p.id) === btn.dataset.complete);
  if (!current) return;
  if (btn.dataset.armed !== 'true') {
    btn.dataset.armed = 'true';
    btn.classList.add('gold-act');
    btn.textContent = `Confirm: ${current.phase_name} is finished ›`;
    note.textContent = 'Finished, not nearly finished.';
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { btn.dataset.armed = 'false'; btn.classList.remove('gold-act'); btn.textContent = 'Mark complete ›'; note.textContent = ''; }, 6000);
    return;
  }
  clearTimeout(armTimer);
  btn.disabled = true;
  const days = daysIn(current);
  if (!DEMO_MODE) {
    try { await completePhase(state.token, current.id); }
    catch (_) { btn.disabled = false; note.textContent = "That didn't reach your records. Nothing has changed."; return; }
  }
  const i = phases.indexOf(current);
  current.status = 'complete'; current.actual_days = days; current.completed_at = new Date().toISOString();
  const next = phases[i + 1];
  if (next && next.status === 'future') { next.status = 'active'; next.started_at = new Date().toISOString(); }
  await completeNode(i);
  render();
  invalidate();
  showMilestone(`${current.phase_name}, complete.`, `${days} day${days === 1 ? '' : 's'} against an estimate of ${current.estimated_days}.${next ? ` ${next.phase_name} begins now.` : ' Every phase is behind you.'}`);
}

function completeNode(i) {
  return new Promise((resolve) => {
    const node = qs(`#mapList .map-row[data-index="${i}"] .map-node`);
    if (!node || skipMovement()) return resolve();
    const safety = setTimeout(resolve, 1400);
    try {
      gsap.timeline({ onComplete: () => { clearTimeout(safety); resolve(); } })
        .to(node, { scale: 1.8, backgroundColor: '#E8B84B', duration: 0.4, ease: EASE.milestone })
        .to(node, { scale: 1, duration: 0.5, ease: EASE.out });
    } catch (_) { clearTimeout(safety); resolve(); }
  });
}

let msTimer = null;
export function showMilestone(title, sub) {
  const el = qs('#milestone');
  qs('#milestoneTitle').innerHTML = [...title].map((c) => `<span class="ch">${escapeHtml(c)}</span>`).join('');
  qs('#milestoneSub').textContent = sub;
  el.hidden = false;
  const dismiss = () => {
    clearTimeout(msTimer);
    el.removeEventListener('click', dismiss);
    if (skipMovement()) { el.hidden = true; return; }
    try { gsap.to(el, { opacity: 0, duration: 0.6, ease: EASE.out, onComplete: () => { el.hidden = true; gsap.set(el, { clearProps: 'opacity' }); } }); } catch (_) { el.hidden = true; }
  };
  el.addEventListener('click', dismiss);
  msTimer = setTimeout(dismiss, 4000);
  if (skipMovement()) return;
  try {
    gsap.timeline()
      .fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: EASE.out })
      .fromTo('.milestone-box', { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: EASE.milestone }, '<')
      .fromTo('#milestoneTitle .ch', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.02, ease: EASE.out }, '-=0.2')
      .fromTo('.milestone-line', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: EASE.out }, '-=0.1')
      .fromTo('#milestoneSub', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: EASE.out }, '-=0.3');
    gsap.fromTo('.milestone-timer span', { scaleX: 0 }, { scaleX: 1, duration: 4, ease: 'none' });
  } catch (_) { /* visible by CSS */ }
}
