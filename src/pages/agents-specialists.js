// Specialist tiles on the Agents screen, after the core four. Same dossier
// rules: hairline rules, no cards or shadows, the state label is the one
// gold accent (FLAGGED only). Each archetype shows its own kind of output.

import { escapeHtml } from '../lib/dom.js';
import { runAgent } from '../lib/agents-api.js';

const esc = (v) => escapeHtml(String(v ?? ''));

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function ago(iso) {
  if (!iso) return 'not run yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 60 * 36) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function reads(a) {
  const s = a.settings || {};
  const list = Object.values(s).find(Array.isArray) || [];
  if (a.agent.archetype === 'watcher') return `Watching · ${list.slice(0, 3).join(', ') || 'nothing yet'}`;
  if (a.agent.archetype === 'tracker') return `Limits · ${(s.metrics || []).map((m) => m.name).join(', ') || 'none set'}`;
  if (a.agent.archetype === 'reviewer') return 'Reviewing · your logged entries';
  return 'Drafts · on request, never sent';
}

function body(a) {
  const out = a.latest?.output;
  if (!out) return `<p class="spec-empty">${a.enabled ? 'Not run yet.' : 'Chosen but not set up. Finish it in Config.'}</p>`;
  const arch = a.agent.archetype;
  let detail = '';
  if (arch === 'watcher' && out.items?.length) {
    detail = `<ol class="spec-items">${out.items.slice(0, 4).map((i) => `<li>${esc(i.text)}${i.source_url && /^https?:\/\//.test(i.source_url)
      ? ` <a class="spec-src label" href="${esc(i.source_url)}" target="_blank" rel="noopener noreferrer">${esc(domain(i.source_url))}</a>` : ''}</li>`).join('')}</ol>`;
  } else if (arch === 'tracker' && out.flags?.length) {
    detail = `<ul class="spec-flags">${out.flags.map((f) => `<li><span>${esc(f.metric)}</span><span>${esc(f.value)}${esc(f.unit)} · ${esc(f.limit_kind)} ${esc(f.limit)}${esc(f.unit)}</span><span class="label">${f.level === 'breach' ? 'BREACH' : 'NEAR'}</span></li>`).join('')}</ul>`;
  } else if (arch === 'reviewer' && out.items?.length) {
    detail = `<ul class="spec-items">${out.items.slice(0, 4).map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`;
  } else if (arch === 'drafter' && out.drafts?.length) {
    detail = `<div class="spec-drafts">${out.drafts.map((d, n) => `<details><summary>${esc(d.title || `Draft ${n + 1}`)}</summary>
      <pre class="spec-draft">${esc(d.body)}</pre><button type="button" class="act spec-copy">Copy ›</button></details>`).join('')}</div>`;
  }
  return `<p class="agent-finding">${esc(out.summary)}</p>${detail}${out.data_note ? `<p class="spec-note">${esc(out.data_note)}</p>` : ''}`;
}

export function specialistTiles(agents) {
  return agents.map((a) => {
    const st = a.enabled ? a.state : 'IDLE';
    return `<section class="agent agent-spec" data-spec="${esc(a.id)}" aria-label="${esc(a.agent.name)}">
      <header class="agent-head"><span class="agent-name serif">${esc(a.agent.name)}</span><span class="agent-state label${st === 'FLAGGED' ? ' gold' : ''}">${esc(st)}</span></header>
      <div class="agent-reads label">${esc(reads(a))} · ${esc(ago(a.latest?.created_at))}</div>
      <div class="spec-body">${body(a)}</div>
      ${a.enabled ? '<button type="button" class="act spec-run">Run now ›</button>' : ''}
    </section>`;
  }).join('');
}

/** Run-now and copy actions; `onChange` re-renders after a run. */
export function wireSpecialists(grid, onChange) {
  if (grid.dataset.specWired) return;
  grid.dataset.specWired = '1';
  grid.addEventListener('click', async (e) => {
    const copy = e.target.closest('.spec-copy');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.previousElementSibling.textContent); copy.textContent = 'Copied'; } catch (_) { copy.textContent = 'Copy failed'; }
      return;
    }
    const run = e.target.closest('.spec-run');
    if (!run) return;
    const tile = run.closest('[data-spec]');
    run.disabled = true;
    tile.querySelector('.agent-state').textContent = 'WORKING';
    try { await runAgent(tile.dataset.spec); } catch (err) { run.textContent = err.message; }
    onChange();
  });
}
