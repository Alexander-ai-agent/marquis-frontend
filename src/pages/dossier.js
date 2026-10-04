// Dossier (rebuild brief §8): one dominant number, a ruled ledger, one
// 1px gold trend line, and up to three of Alfred's observations. Reads
// like a privately printed dossier, not a dashboard.

import { qs, escapeHtml } from '../lib/dom.js';
import { loadAll, combinedGap, gapSeries, trendDates, activePhase, daysIn } from '../lib/data.js';

let trend = null;

function ledgerRows(data) {
  const rows = [];
  const stat = (label) => (data.dashboard?.stat_cards || []).find((s) => (s.label || '').toLowerCase().startsWith(label));
  const active = stat('days active');
  if (active) rows.push(['Days active', active.value, active.delta]);
  const sessions = stat('sessions');
  if (sessions) rows.push(['Sessions, 7 days', sessions.value, sessions.delta]);
  const phases = data.phases;
  const p = activePhase(phases);
  if (phases.length) {
    const idx = p ? phases.indexOf(p) + 1 : phases.length;
    rows.push(['Phase', `${idx} of ${phases.length}`, p ? p.phase_name : 'all complete']);
  }
  if (p) rows.push(['Day in phase', `${daysIn(p)} / ${p.estimated_days ?? '—'}`, 'against estimate']);
  const done = phases.filter((x) => x.status === 'complete');
  if (done.length) {
    const worst = done.reduce((w, x) => ((x.actual_days - x.estimated_days) > (w.actual_days - w.estimated_days) ? x : w));
    const over = worst.actual_days - worst.estimated_days;
    if (over > 0) rows.push(['Largest overrun', `+${over}d`, worst.phase_name]);
  }
  return rows;
}

export async function renderDossier() {
  let data;
  try { data = await loadAll(); } catch (_) { data = { ok: false, phases: [] }; }

  if (!data.ok) {
    qs('#domNum').textContent = '—';
    qs('#domLabel').textContent = "I can't reach your records at the moment. Nothing is lost.";
    return;
  }

  const g = combinedGap(data.phases);
  qs('#domNum').textContent = data.phases.length ? (g > 0 ? `+${g}d` : g < 0 ? `${g}d` : '0d') : '—';
  qs('#domLabel').textContent = !data.phases.length ? 'No phase is underway yet'
    : g > 0 ? 'Days behind the combined estimate' : g < 0 ? 'Days ahead of the combined estimate' : 'On the combined estimate';

  qs('#ledger').innerHTML = ledgerRows(data).map(([k, v, d]) => `
    <div class="ledger-row"><span class="label">${escapeHtml(k)}</span><span class="ledger-val">${escapeHtml(String(v))}</span><span class="ledger-delta">${escapeHtml(d || '')}</span></div>`).join('');

  const obs = (data.dashboard?.agent_insights || [])
    .filter((a) => ['blocker', 'performance', 'enhancement'].includes(a.agent))
    .map((a) => a.insight).filter(Boolean).slice(0, 3);
  qs('#observations').innerHTML = obs.map((o) => `<li>${escapeHtml(o)}</li>`).join('');

  const series = gapSeries(data.phases);
  const host = qs('#domChart');
  const dates = trendDates();
  const mount = () => {
    try { trend?.destroy(); } catch (_) {}
    trend = window.MarquisCanvas?.mountTrend(host, series, dates) || null;
    if (!trend) host.innerHTML = `<p class="label">${escapeHtml(dates[0])} → TODAY</p>`;
  };
  if (window.MarquisCanvas) mount(); else window.addEventListener('load', mount, { once: true });
  host.setAttribute('aria-label', `Thirty-day trend of the combined gap, from ${series[0]} to ${series[series.length - 1]} days.`);
}
