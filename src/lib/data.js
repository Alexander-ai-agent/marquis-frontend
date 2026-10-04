// One place every screen reads from: the dashboard summary, the phases,
// and what the four agents are reading. DEMO_MODE returns the demo set;
// otherwise the real backend, cached for the session. Derived values
// (combined gap, its 30-day trend, standing, Alfred's first line) are
// computed here so every screen tells the same story.

import { fetchDashboard, fetchPhases, fetchSignals, DEMO_MODE } from './api.js';
import { state } from './state.js';

const DAY = 86400000;

function daysAgo(n) { return new Date(Date.now() - n * DAY).toISOString(); }

const DEMO = {
  dashboard: {
    sub: "You're mid-launch. Distribution is the open question, not the product.",
    last_butler_exchange: "Two weeks post-launch with zero conversions is a distribution problem, not a product one.",
    stat_cards: [
      { label: 'Days active', value: '58', delta: 'since 14 July' },
      { label: 'Sessions this week', value: '12', delta: '+5 on last week' },
    ],
    agent_insights: [
      { agent: 'performance', insight: 'Build ran twelve days over its estimate. You underquote build work, not distribution work.' },
      { agent: 'pathway', insight: 'The sequence still fits. Launch, then First Revenue.' },
      { agent: 'blocker', insight: 'Pricing has come up in three conversations without a decision.' },
      { agent: 'enhancement', insight: 'No error monitoring on the live product yet. Standard at this stage.' },
    ],
  },
  phases: [
    { id: 'd1', phase_name: 'Foundation', estimated_days: 14, actual_days: 19, status: 'complete', started_at: daysAgo(60), completed_at: daysAgo(41) },
    { id: 'd2', phase_name: 'Build', estimated_days: 21, actual_days: 33, status: 'complete', started_at: daysAgo(41), completed_at: daysAgo(8) },
    { id: 'd3', phase_name: 'Launch', estimated_days: 14, actual_days: null, status: 'active', started_at: daysAgo(8), completed_at: null },
    { id: 'd4', phase_name: 'First Revenue', estimated_days: 18, actual_days: null, status: 'future' },
    { id: 'd5', phase_name: 'Scale', estimated_days: 30, actual_days: null, status: 'future' },
  ],
  // Mirrors the chart bundle's demo signals (charts/src/canvas/data.ts).
  signals: {
    activity: [0.2, 0.9, 0.3, 0.1, 0.05, 0.05, 0.4, 1, 0.6, 0.15, 0.5, 0.8, 0.3, 0.7],
    blocker_topics: [
      { name: 'Pricing', days: [2, 2, 3, 3, 4, 4, 4] },
      { name: 'Outreach', days: [1, 0, 1, 0, 1, 0, 1] },
      { name: 'Onboarding copy', days: [0, 1, 0, 0, 0, 1, 0] },
    ],
    coverage: [
      { name: 'Payments', value: 100 }, { name: 'Analytics', value: 95 }, { name: 'Error monitoring', value: 15 },
      { name: 'Onboarding email', value: 85 }, { name: 'Social proof', value: 20 },
    ],
  },
};

let cache = null;

export async function loadAll({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  if (DEMO_MODE) {
    cache = { dashboard: DEMO.dashboard, phases: DEMO.phases.map((p) => ({ ...p })), signals: DEMO.signals, demo: true, ok: true };
    return cache;
  }
  const [dashboard, phases, signals] = await Promise.allSettled([
    fetchDashboard(state.token), fetchPhases(state.token), fetchSignals(state.token),
  ]);
  cache = {
    dashboard: dashboard.value || null,
    phases: phases.value || [],
    signals: signals.value || null,
    demo: false,
    ok: dashboard.status === 'fulfilled' || phases.status === 'fulfilled',
  };
  return cache;
}

export function invalidate() { cache = null; }

/* ---------------- derived ---------------- */

export function daysIn(p, at = Date.now()) {
  if (p.status === 'complete' && p.actual_days != null) return p.actual_days;
  if (p.status === 'active') {
    if (p.started_at) return Math.max(0, Math.round((at - new Date(p.started_at).getTime()) / DAY));
    return p.actual_days ?? 0;
  }
  return null;
}

/** Finished phases' overrun plus the active phase's overrun so far. */
export function combinedGap(phases) {
  return phases.reduce((sum, p) => {
    const d = daysIn(p);
    if (!p.estimated_days || d == null) return sum;
    if (p.status === 'complete') return sum + (d - p.estimated_days);
    if (p.status === 'active') return sum + Math.max(0, d - p.estimated_days);
    return sum;
  }, 0);
}

/** The combined gap as it stood on each of the last 30 days. */
export function gapSeries(phases, days = 30) {
  const out = [];
  for (let k = days - 1; k >= 0; k--) {
    const at = Date.now() - k * DAY;
    let g = 0;
    for (const p of phases) {
      if (!p.estimated_days || !p.started_at) continue;
      const start = new Date(p.started_at).getTime();
      if (start > at) continue;
      const end = p.completed_at ? new Date(p.completed_at).getTime() : null;
      if (end && end <= at) g += (p.actual_days ?? Math.round((end - start) / DAY)) - p.estimated_days;
      else g += Math.max(0, Math.round((at - start) / DAY) - p.estimated_days);
    }
    out.push(g);
  }
  return out;
}

export function trendDates(days = 30) {
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  return [fmt(new Date(Date.now() - (days - 1) * DAY)), fmt(new Date(Date.now() - Math.floor(days / 2) * DAY)), 'TODAY'];
}

export function activePhase(phases) { return phases.find((p) => p.status === 'active') || null; }

/** "LAUNCH · DAY 8" — the divide's resting context label. */
export function contextLabel(phases) {
  const p = activePhase(phases);
  if (!p) return phases.length ? 'PATHWAY · COMPLETE' : 'MARQUIS';
  return `${p.phase_name.toUpperCase()} · DAY ${daysIn(p)}`;
}

/** ahead | behind | null — tints the room, never announced. */
export function standing(phases) {
  if (!phases.length) return null;
  const g = combinedGap(phases);
  return g > 0 ? 'behind' : g < 0 ? 'ahead' : null;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const say = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

/** Alfred's first line on arrival: one or two short sentences. */
export function firstLine(data) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = (state.user?.name || '').trim().split(/\s+/)[0];
  const open = name ? `${part}, ${name}.` : `${part}.`;
  if (!data?.ok) return `${open} I can't reach your records at the moment; nothing is lost.`;
  const p = activePhase(data.phases);
  if (!p) return data.phases.length ? `${open} Every phase is behind you.` : `${open} Your pathway begins when we set the first phase.`;
  const d = daysIn(p);
  const blocker = (data.dashboard?.agent_insights || []).find((a) => a.agent === 'blocker');
  const tail = blocker && /pricing/i.test(blocker.insight || '') ? ' Pricing is still undecided.' : '';
  return `${open} ${p.phase_name} is on day ${say(d)} of ${say(p.estimated_days)}.${tail}`;
}

/** Up to three of Alfred's observations, for the Dossier's foot. */
export function observations(data) {
  const ins = data?.dashboard?.agent_insights || [];
  const pick = ['blocker', 'performance', 'enhancement'].map((k) => ins.find((a) => a.agent === k)).filter(Boolean);
  return pick.slice(0, 3).map((a) => a.insight || a.html || '').filter(Boolean);
}
