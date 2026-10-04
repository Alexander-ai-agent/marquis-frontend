// Agents (rebuild brief §8): the four, each in its own visual language,
// with a live-state label. Separate from the Butler canvas entirely.
// Visuals draw in on arrival and redraw only when what they read changes;
// nothing here loops.

import { qs, escapeHtml } from '../lib/dom.js';
import { loadAll } from '../lib/data.js';
import { DEMO_MODE } from '../lib/api.js';

const AGENTS = [
  { key: 'performance', name: 'Performance', reads: 'Activity · 14 days' },
  { key: 'pathway', name: 'Pathway', reads: 'Route taken' },
  { key: 'blocker', name: 'Blocker', reads: 'Unresolved · 7 days' },
  { key: 'enhancement', name: 'Enhancement', reads: 'Standard for stage' },
];

const handles = [];
let signature = null;

function stateOf(key, data) {
  const s = data.signals;
  if (DEMO_MODE) return { performance: 'WORKING', pathway: 'IDLE', blocker: 'FLAGGED', enhancement: 'IDLE' }[key];
  if (key === 'performance') return (s?.activity || []).slice(-2).some((v) => v > 0) ? 'WORKING' : 'IDLE';
  if (key === 'blocker') return (s?.blocker_topics || []).some((t) => t.days.slice(-3).every((d) => d >= 2)) ? 'FLAGGED' : 'IDLE';
  if (key === 'enhancement') return (s?.coverage || []).some((c) => c.value < 50) ? 'WORKING' : 'IDLE';
  return (s?.phases || []).length ? 'WORKING' : 'IDLE';
}

function finding(key, data) {
  const ins = (data.dashboard?.agent_insights || []).find((a) => a.agent === key);
  return ins?.insight || 'Nothing to report yet.';
}

export async function renderAgents() {
  let data;
  try { data = await loadAll(); } catch (_) { data = { ok: false, phases: [], signals: null }; }
  const sig = JSON.stringify([data.signals, data.dashboard?.agent_insights]);
  if (sig === signature && handles.length) return;     // nothing changed: leave them still
  signature = sig;
  handles.splice(0).forEach((h) => { try { h.destroy(); } catch (_) {} });

  const grid = qs('#agentsGrid');
  grid.innerHTML = AGENTS.map((a) => {
    const st = stateOf(a.key, data);
    return `<section class="agent" data-agent="${a.key}" aria-label="${a.name}">
      <header class="agent-head"><span class="agent-name serif">${a.name}</span><span class="agent-state label${st === 'FLAGGED' ? ' gold' : ''}">${st}</span></header>
      <div class="agent-reads label">${escapeHtml(a.reads)}</div>
      <div class="agent-visual" id="agent-${a.key}"></div>
      <p class="agent-finding">${escapeHtml(finding(a.key, data))}</p>
    </section>`;
  }).join('');

  const mount = () => {
    AGENTS.forEach((a) => {
      const host = qs(`#agent-${a.key}`);
      let h = null;
      try { h = window.MarquisCanvas?.mountAgent(host, a.key, { demo: DEMO_MODE, signals: data.signals || undefined, accent: a.key === 'performance' && stateOf(a.key, data) === 'WORKING' }); } catch (e) { console.warn('[agents] visual failed:', e); }
      if (h) handles.push(h); else host.innerHTML = '<p class="label">Reading.</p>';
    });
  };
  if (window.MarquisCanvas) mount(); else window.addEventListener('load', mount, { once: true });
}
