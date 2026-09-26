// Dashboard: the calm page. Greeting and clock are live (local time), not
// hardcoded. Cards enter per MARQUIS_animations.md #5 (rows together,
// 60ms apart, 240ms, up 12px) and numbers count up once, 600ms.

import { qs, qsa, escapeHtml } from '../lib/dom.js';
import { reveal, skipMovement, EASE } from '../lib/motion.js';
import { fetchDashboard, DEMO_MODE } from '../lib/api.js';
import { state } from '../lib/state.js';

const gsap = window.gsap;
const RING_CIRCUMFERENCE = 345.6;
const AGENT_NAMES = { performance: 'Performance Analyst', pathway: 'Pathway Optimizer', blocker: 'Blocker Detector', enhancement: 'Enhancement Suggester' };
const ARROW_ICON = '<path d="M5 12h14M13 6l6 6-6 6"/>';

function demoDashboard() {
  return {
    sub: "You're mid-launch. Distribution is the open question, not the product.",
    last_butler_exchange: "Two weeks post-launch with zero conversions isn't a product problem. It's a distribution problem. Which of the three feels most true to you right now?",
    hero_time: '2 hours ago',
    phase_ring: { current_phase: 3, total_phases: 5 },
    ring_caption_html: 'Currently in <b>Launch</b>, day 8 of 14 estimated.',
    context: 'Phase 3 of 5 · Day 8',
    stat_cards: [
      { value: '58', label: 'Days active', delta: 'since 14 July', trend: 'flat' },
      { value: '+17d', label: 'Behind combined estimate', delta: 'mostly from Build', trend: 'down', warn: true },
      { value: '12', label: 'Sessions this week', delta: '7 the week before', trend: 'up' },
    ],
    agent_insights: [
      { agent: 'performance', html: 'Build ran <b>12 days over</b> its estimate. Launch is tracking closer to plan. You consistently underquote build work, not distribution work.' },
      { agent: 'pathway', html: 'The current sequence still fits. <b>Launch, then First Revenue</b>, remains the right next step.' },
      { agent: 'blocker', html: 'Pricing has come up in <b>three</b> conversations without a decision. <span class="flag">Likely what is actually stalling launch.</span>' },
      { agent: 'enhancement', html: 'No error monitoring on the live product yet. Standard at this stage. A free Sentry account catches what you will not see manually.' },
    ],
    quick_links: [
      { title: 'Speak with Marquis', sub: 'Resume where you left off', action: 'conversation' },
      { title: 'The full pathway', sub: 'Every phase, against its estimate', action: 'progress' },
      { title: 'The four at work', sub: 'What each agent is watching', action: 'analytics' },
    ],
  };
}

function firstName() {
  return (state.user?.name || '').trim().split(/\s+/)[0] || '';
}

function greeting(now = new Date()) {
  const h = now.getHours();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = firstName();
  return name ? `${part}, ${escapeHtml(name)}.` : `${part}.`;
}

let clockTimer = null;
function startClock() {
  const el = qs('.dash-clock');
  const tick = () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `${escapeHtml(date)}<br>${escapeHtml(time)}`;
    const g = qs('.dash-greeting');
    if (!g.classList.contains('skeleton')) g.innerHTML = greeting(now);
  };
  tick();
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 30_000);
}

function relativeTime(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Accepts the demo shape or the backend's /dashboard shape. */
function normalize(data) {
  const ring = data.phase_ring || {};
  const insights = (data.agent_insights || []).map((a) => ({ agent: a.agent, html: a.html ?? escapeHtml(a.insight || '') }));
  const links = (data.quick_links || []).map((q) => ({ title: q.title, sub: q.sub ?? q.description ?? '', action: q.action }));
  const phaseName = data.active_phase_name;
  return {
    sub: data.sub || '',
    quote: data.last_butler_exchange || '',
    heroTime: data.hero_time || relativeTime(data.last_butler_exchange_at),
    ring,
    ringCaption: data.ring_caption_html ?? (phaseName ? `Currently in <b>${escapeHtml(phaseName)}</b>.` : 'No phase is underway yet.'),
    context: data.context || (ring.current_phase ? `Phase ${ring.current_phase} of ${ring.total_phases}` : ''),
    stats: (data.stat_cards || []).slice(0, 3),
    insights,
    links,
  };
}

let cachedInsights = {};
/** The agents' latest findings (HTML-safe), for the Analytics page's notes. */
export function latestInsights() { return cachedInsights; }

let firstRender = true;
export async function renderDashboard({ onContext } = {}) {
  startClock();
  let data;
  try {
    data = normalize(DEMO_MODE ? demoDashboard() : await fetchDashboard(state.token));
  } catch (e) {
    // Honest failure: say so in-voice, keep the page calm, never fake data.
    qsa('#page-dashboard .skeleton').forEach((el) => el.classList.remove('skeleton'));
    qs('.dash-greeting').innerHTML = greeting();
    qs('.dash-sub').textContent = "I can't reach your records at the moment. Nothing is lost. This page will be current once I can.";
    qs('.hero-quote').textContent = '';
    qs('#statRow').innerHTML = '';
    return;
  }

  qsa('#page-dashboard .skeleton').forEach((el) => el.classList.remove('skeleton'));
  qs('.dash-greeting').innerHTML = greeting();
  qs('.dash-sub').textContent = data.sub;
  qs('.hero-quote').textContent = data.quote ? `“${data.quote}”` : 'Nothing said yet. The conversation starts whenever you are ready.';
  qs('.hero-time').textContent = data.heroTime;
  qs('.ring-caption').innerHTML = data.ringCaption;
  qs('.ring-num').textContent = data.ring.current_phase ?? '–';
  qs('.ring-den').textContent = data.ring.total_phases ? `of ${data.ring.total_phases}` : '';
  if (onContext && data.context) onContext(data.context);

  const arrow = (t) => (t === 'up' ? '<span class="trend up" aria-label="up">&uarr;</span>' : t === 'down' ? '<span class="trend down" aria-label="down">&darr;</span>' : '');
  qs('#statRow').innerHTML = data.stats.map((s) => `
    <div class="card stat-card">
      <div class="stat-num${s.warn ? ' warn' : ''}"><span class="count" data-final="${escapeHtml(String(s.value))}">${escapeHtml(String(s.value))}</span>${arrow(s.trend)}</div>
      <div class="stat-lbl">${escapeHtml(s.label)}</div>
      <div class="stat-delta">${escapeHtml(s.delta || '')}</div>
    </div>`).join('');

  cachedInsights = Object.fromEntries(data.insights.map((a) => [a.agent, a.html]));
  qs('#intelRows').innerHTML = data.insights.map((a) => `
    <div class="intel-row"><div class="intel-tag">${escapeHtml(AGENT_NAMES[a.agent] || a.agent)}</div><div class="intel-text">${a.html}</div></div>`).join('');

  qs('#quickRow').innerHTML = data.links.map((q) => `
    <button class="card quick-card" data-goto="${escapeHtml(q.action || '')}">
      <div><div class="quick-h">${escapeHtml(q.title)}</div><div class="quick-s">${escapeHtml(q.sub)}</div></div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${ARROW_ICON}</svg>
    </button>`).join('');

  const total = data.ring.total_phases || 0;
  const done = Math.max(0, (data.ring.current_phase || 1) - 1);
  fillRing(total ? (done + 0.5) / total : 0);

  if (firstRender) {
    firstRender = false;
    // Animation #5: cards in the same row enter together; rows 60ms apart.
    qsa('#page-dashboard .dash-row').forEach((row, i) => reveal(row.querySelectorAll('.card'), { y: 12, duration: 0.24, delay: i * 0.06 }));
    countUp();
  }
}

function countUp() {
  if (skipMovement()) return;
  qsa('#statRow .count').forEach((el) => {
    const final = el.dataset.final;
    const m = final.match(/^([+-]?)(\d+)(.*)$/);
    if (!m) return;
    const [, sign, digits, suffix] = m;
    const obj = { v: 0 };
    try {
      gsap.to(obj, { v: Number(digits), duration: 0.6, ease: EASE.out, onUpdate: () => { el.textContent = `${sign}${Math.round(obj.v)}${suffix}`; }, onComplete: () => { el.textContent = final; } });
    } catch (_) { el.textContent = final; }
    setTimeout(() => { el.textContent = final; }, 2100); // safety: always lands on the real value
  });
}

function fillRing(fraction) {
  const ring = qs('#ringFg');
  const offset = RING_CIRCUMFERENCE - RING_CIRCUMFERENCE * fraction;
  ring.style.strokeDashoffset = offset; // correct resting value first
  if (skipMovement()) return;
  try {
    // Progress fill: --dur-slow (600ms), the spec's ceiling for fills.
    gsap.fromTo(ring, { strokeDashoffset: RING_CIRCUMFERENCE }, { strokeDashoffset: offset, duration: 0.6, ease: EASE.out, delay: 0.1 });
  } catch (e) { /* ring already shows the correct value */ }
}
