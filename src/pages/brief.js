// Brief (rebuild brief §8): a private intelligence brief. One 680px
// column; each section is an uppercase label, a full-width rule, then
// content; one gold element per section at most.

import { qs, escapeHtml } from '../lib/dom.js';
import { loadAll, combinedGap, gapSeries, activePhase, daysIn } from '../lib/data.js';

const handles = [];

const section = (label, body) => `<section class="brief-sec"><h2 class="label">${label}</h2><div class="brief-rule"></div>${body}</section>`;

export async function renderBrief() {
  let data;
  try { data = await loadAll(); } catch (_) { data = { ok: false, phases: [] }; }
  const doc = qs('#briefDoc');
  const period = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  if (!data.ok) {
    doc.innerHTML = `<h1 class="brief-title">BRIEF · ${period}</h1><p class="brief-p">I can't reach your records at the moment. Nothing is lost.</p>`;
    return;
  }
  const s = data.signals || {};
  const p = activePhase(data.phases);
  const g = combinedGap(data.phases);
  const ins = Object.fromEntries((data.dashboard?.agent_insights || []).map((a) => [a.agent, a.insight]));

  const situation = `<p class="brief-p">${escapeHtml(data.dashboard?.sub || '')} ${p ? `${escapeHtml(p.phase_name)} is on day ${daysIn(p)} of ${p.estimated_days}.` : ''} The combined gap stands at <span class="gold">${g > 0 ? `+${g}` : g} days</span>.</p>`;

  const rows = data.phases.map((ph) => {
    const d = daysIn(ph);
    const delta = ph.status === 'complete' && ph.estimated_days ? d - ph.estimated_days : null;
    return `<tr><td>${escapeHtml(ph.phase_name)}</td><td>${ph.estimated_days ?? '—'}</td><td>${d ?? '—'}</td><td>${delta == null ? (ph.status === 'active' ? 'underway' : '') : delta > 0 ? `+${delta}` : delta}</td></tr>`;
  }).join('');
  const pathway = `<table class="brief-table"><thead><tr><th>Phase</th><th>Est.</th><th>Actual</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="brief-spark-row"><span class="label">Gap · 30 days</span><div class="brief-spark" data-spark="gap" data-gold="1"></div></div>`;

  const performance = `<div class="brief-spark-row"><span class="label">Activity · 14 days</span><div class="brief-spark" data-spark="activity" data-gold="1"></div></div><p class="brief-p">${escapeHtml(ins.performance || '')}</p>`;

  const topics = (s.blocker_topics || []);
  const hottest = topics.reduce((b, t, i) => (t.days.reduce((x, y) => x + y, 0) > (topics[b]?.days.reduce((x, y) => x + y, 0) ?? -1) ? i : b), 0);
  const blockers = topics.length
    ? `<div class="brief-multiples">${topics.map((t, i) => `<div class="brief-mult"><span class="label">${escapeHtml(t.name)}</span><div class="brief-spark" data-spark="topic-${i}"${i === hottest ? ' data-gold="1"' : ''}></div></div>`).join('')}</div><p class="brief-p">${escapeHtml(ins.blocker || '')}</p>`
    : '<p class="brief-p">Nothing recurring this week.</p>';

  const cov = (s.coverage || []);
  const firstGap = cov.findIndex((c) => c.value < 50);
  const standard = `<dl class="brief-list">${cov.map((c, i) => `<div><dt>${escapeHtml(c.name)}</dt><dd class="${i === firstGap ? 'gold' : c.value < 50 ? '' : 'dim'}">${c.value >= 50 ? 'in place' : 'missing'}</dd></div>`).join('')}</dl>`;

  const rec = `<p class="brief-p brief-rec">${escapeHtml(ins.blocker ? 'Put a number on the pricing page this week. It can change; it cannot teach you anything until it exists.' : ins.enhancement || 'Nothing pressing. Keep the pace.')}</p>`;

  doc.innerHTML = `<h1 class="brief-title">BRIEF · ${period}</h1>
    ${section('Situation', situation)}
    ${section('Pathway', pathway)}
    ${section('Performance', performance)}
    ${section('Blockers', blockers)}
    ${section('Standard for stage', standard)}
    ${section('Recommendation', rec)}`;

  const series = { gap: gapSeries(data.phases), activity: s.activity || [] };
  topics.forEach((t, i) => { series[`topic-${i}`] = t.days; });
  handles.splice(0).forEach((h) => { try { h.destroy(); } catch (_) {} });
  const mount = () => doc.querySelectorAll('[data-spark]').forEach((el) => {
    const v = series[el.dataset.spark] || [];
    let h = null;
    try { h = window.MarquisCanvas?.mountSpark(el, v, el.dataset.gold === '1'); } catch (_) {}
    if (h) handles.push(h);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${el.dataset.spark}: ${v.join(', ')}`);
  });
  if (window.MarquisCanvas) mount(); else window.addEventListener('load', mount, { once: true });
}
