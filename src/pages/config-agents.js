// Config → Specialists: add or remove specialist agents and set each one up
// (watchlist, competitors, limits, schedule). Same [×]/[·] toggles as the
// rest of Config; no pill switches. Trackers and Reviewers also take entries
// here (manual entry; integrations come later).

import { qs, qsa, escapeHtml } from '../lib/dom.js';
import { DEMO_MODE } from '../lib/api.js';
import { fetchCatalog, fetchMyAgents, enableAgent, updateAgent, removeAgent, runAgent, addEntry } from '../lib/agents-api.js';

const INTERVALS = [6, 12, 24, 48, 168];
let catalog = null;
let mine = [];
let showing = null;     // category key, or 'all'
const open = new Set(); // agent keys whose settings are expanded

const esc = (v) => escapeHtml(String(v ?? ''));
const mineFor = (key) => mine.find((m) => m.agent.key === key);

function fieldHtml(name, field, value) {
  const id = `ca-${name}`;
  if (field.kind === 'list') {
    return `<label class="ca-field"><span class="label">${esc(field.label)}${field.required ? '' : ' (optional)'}</span>
      <input class="line-field" data-field="${esc(name)}" data-kind="list" value="${esc((value || []).join(', '))}" placeholder="Separate with commas (up to ${field.max})"></label>`;
  }
  if (field.kind === 'text') {
    return `<label class="ca-field"><span class="label">${esc(field.label)}${field.required ? '' : ' (optional)'}</span>
      <input class="line-field" data-field="${esc(name)}" data-kind="text" value="${esc(value || '')}" maxlength="${field.max}"></label>`;
  }
  const rows = (value && value.length ? value : [{ name: '', unit: '', floor: null, ceiling: null }]);
  return `<div class="ca-field" data-field="${esc(name)}" data-kind="metrics"><span class="label">${esc(field.label)}</span>
    <div class="ca-metrics">${rows.map(metricRow).join('')}</div>
    <button type="button" class="act ca-add-metric" aria-controls="${id}">Add a metric ›</button></div>`;
}

function metricRow(m) {
  const num = (v) => (v === null || v === undefined ? '' : v);
  return `<div class="ca-metric">
    <input class="line-field" data-m="name" value="${esc(m.name)}" placeholder="Metric" aria-label="Metric name">
    <input class="line-field" data-m="unit" value="${esc(m.unit)}" placeholder="Unit" aria-label="Unit">
    <input class="line-field" data-m="floor" value="${esc(num(m.floor))}" placeholder="Floor" inputmode="decimal" aria-label="Floor (alert below)">
    <input class="line-field" data-m="ceiling" value="${esc(num(m.ceiling))}" placeholder="Ceiling" inputmode="decimal" aria-label="Ceiling (alert above)"></div>`;
}

function readSettings(box, agent) {
  const out = {};
  qsa('[data-field]', box).forEach((el) => {
    const name = el.dataset.field;
    if (el.dataset.kind === 'list') out[name] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (el.dataset.kind === 'text') out[name] = el.value.trim();
    else {
      out[name] = qsa('.ca-metric', el).map((row) => {
        const v = (k) => row.querySelector(`[data-m="${k}"]`).value.trim();
        const n = (k) => (v(k) === '' || Number.isNaN(Number(v(k))) ? null : Number(v(k)));
        return { name: v('name'), unit: v('unit'), floor: n('floor'), ceiling: n('ceiling') };
      }).filter((m) => m.name);
    }
  });
  return out;
}

function agentHtml(a) {
  const m = mineFor(a.key);
  const on = Boolean(m?.enabled);
  const expanded = open.has(a.key);
  const schedulable = a.archetype === 'watcher' || a.archetype === 'reviewer';
  const mode = m?.run_mode || a.run_mode.default;
  const hours = m?.interval_hours || a.run_mode.interval_hours || 24;
  const status = m && !m.enabled ? 'Chosen · needs setup' : on ? m.state : '';
  const entries = m && (a.archetype === 'tracker' || a.archetype === 'reviewer') ? entryHtml(a, m) : '';
  return `<div class="ca-agent" data-key="${esc(a.key)}">
    <div class="ca-head">
      <button type="button" class="tog ca-toggle" role="switch" aria-checked="${on}" data-on="${on ? 1 : 0}">${esc(a.name)}</button>
      <span class="cfg-note">${esc(a.archetype)}${status ? ` · ${esc(status)}` : ''}</span>
      <button type="button" class="act ca-expand" aria-expanded="${expanded}">${expanded ? 'Close' : m ? 'Settings ›' : ''}</button>
    </div>
    <p class="ca-purpose">${esc(a.purpose)}</p>
    ${expanded ? `<div class="ca-body">
      ${Object.entries(a.settings).map(([n, f]) => fieldHtml(n, f, m?.settings?.[n])).join('')}
      ${schedulable ? `<div class="ca-field"><span class="label">Runs</span><span class="cfg-choices">
        <button type="button" class="tog ca-mode" data-mode="on_demand" data-on="${mode === 'on_demand' ? 1 : 0}">When asked</button>
        <button type="button" class="tog ca-mode" data-mode="scheduled" data-on="${mode === 'scheduled' ? 1 : 0}">Every</button>
        <select class="ca-hours" aria-label="Interval">${INTERVALS.map((h) => `<option value="${h}"${h === hours ? ' selected' : ''}>${h < 48 ? `${h} hours` : `${h / 24} days`}</option>`).join('')}</select>
      </span></div>` : ''}
      <div class="ca-actions">
        <button type="button" class="act ca-save">${on ? 'Save ›' : 'Save and switch on ›'}</button>
        ${on ? '<button type="button" class="act ca-run">Run now ›</button>' : ''}
        ${m ? '<button type="button" class="act ca-remove">Remove ›</button>' : ''}
        <span class="cfg-note ca-status" aria-live="polite"></span>
      </div>
      ${entries}
    </div>` : ''}
  </div>`;
}

function entryHtml(a, m) {
  if (a.archetype === 'tracker') {
    const names = (m.settings?.metrics || []).map((x) => x.name);
    if (!names.length) return '';
    return `<div class="ca-entry"><span class="label">Log a figure</span>
      <select class="ca-entry-metric" aria-label="Metric">${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
      <input class="line-field ca-entry-value" inputmode="decimal" placeholder="Value" aria-label="Value">
      <button type="button" class="act ca-log">Log ›</button></div>`;
  }
  return `<div class="ca-entry"><span class="label">Log an entry</span>
    <input class="line-field ca-entry-text" placeholder="What happened (a trade, a ticket, a piece of feedback)" maxlength="1000" aria-label="Entry">
    <button type="button" class="act ca-log">Log ›</button></div>`;
}

function paint() {
  const host = qs('#cfgAgents');
  if (!catalog) return;
  const on = mine.filter((m) => m.enabled).length;
  const cats = Object.entries(catalog.categories);
  const list = catalog.agents.filter((a) => showing === 'all' || a.category === showing);
  host.innerHTML = `<div class="cfg-row"><span class="label">Specialists</span>
      <span class="cfg-val"><span class="cfg-note">${on} of ${catalog.limits.enabled_specialists} on · the core four always run</span></span></div>
    <div class="ca-cats" role="radiogroup" aria-label="Category">${cats.map(([k, label]) => `<button type="button" class="tog ca-cat" role="radio" data-cat="${esc(k)}" data-on="${showing === k ? 1 : 0}" aria-checked="${showing === k}">${esc(label)}</button>`).join('')}
      <button type="button" class="tog ca-cat" role="radio" data-cat="all" data-on="${showing === 'all' ? 1 : 0}" aria-checked="${showing === 'all'}">All</button></div>
    <div class="ca-list">${list.map(agentHtml).join('')}</div>`;
}

async function refresh() {
  try { mine = (await fetchMyAgents()).agents; } catch (_) { /* keep what we have */ }
  paint();
}

function status(box, text) { const s = box.querySelector('.ca-status') || box.querySelector('.cfg-note'); if (s) s.textContent = text; }

async function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const box = t.closest('.ca-agent');
  if (t.classList.contains('ca-cat')) { showing = t.dataset.cat; paint(); return; }
  if (!box) {
    if (t.classList.contains('ca-add-metric')) t.previousElementSibling.insertAdjacentHTML('beforeend', metricRow({ name: '', unit: '' }));
    return;
  }
  const key = box.dataset.key;
  const a = catalog.agents.find((x) => x.key === key);
  const m = mineFor(key);
  try {
    if (t.classList.contains('ca-add-metric')) { t.previousElementSibling.insertAdjacentHTML('beforeend', metricRow({ name: '', unit: '' })); return; }
    if (t.classList.contains('ca-expand')) { open.has(key) ? open.delete(key) : open.add(key); paint(); return; }
    if (t.classList.contains('ca-mode')) { qsa('.ca-mode', box).forEach((b) => { b.dataset.on = b === t ? '1' : '0'; }); return; }
    if (t.classList.contains('ca-toggle')) {
      if (m?.enabled) { await updateAgent(m.id, { enabled: false }); await refresh(); return; }
      open.add(key); paint();                               // switching on means setting it up first
      qs(`.ca-agent[data-key="${CSS.escape(key)}"] input`)?.focus();
      return;
    }
    if (t.classList.contains('ca-save')) {
      const fields = { settings: readSettings(box, a) };
      const mode = box.querySelector('.ca-mode[data-on="1"]')?.dataset.mode;
      if (mode) { fields.run_mode = mode; fields.interval_hours = Number(box.querySelector('.ca-hours').value); }
      status(box, 'Saving…');
      if (m) await updateAgent(m.id, { ...fields, enabled: true });
      else await enableAgent(key, fields);
      await refresh();
      return;
    }
    if (t.classList.contains('ca-run')) {
      status(box, 'Working…');
      await runAgent(m.id);
      await refresh();
      status(qs(`.ca-agent[data-key="${CSS.escape(key)}"]`), 'Done. See Agents.');
      return;
    }
    if (t.classList.contains('ca-remove')) { await removeAgent(m.id); open.delete(key); await refresh(); return; }
    if (t.classList.contains('ca-log')) {
      const entry = a.archetype === 'tracker'
        ? { metric: box.querySelector('.ca-entry-metric').value, value: Number(box.querySelector('.ca-entry-value').value) }
        : { body: { text: box.querySelector('.ca-entry-text').value.trim() } };
      if (a.archetype === 'tracker' && !Number.isFinite(entry.value)) { status(box, 'Enter a number.'); return; }
      if (a.archetype !== 'tracker' && !entry.body.text) { status(box, 'Write the entry first.'); return; }
      status(box, 'Logging…');
      await addEntry(m.id, entry);
      await refresh();
      status(qs(`.ca-agent[data-key="${CSS.escape(key)}"]`), 'Logged.');
    }
  } catch (err) {
    status(box, err.message);
  }
}

export async function renderConfigAgents() {
  const host = qs('#cfgAgents');
  if (!host) return;
  if (DEMO_MODE) { host.innerHTML = '<div class="cfg-row"><span class="label">Specialists</span><span class="cfg-note">Live service only.</span></div>'; return; }
  try {
    [catalog, mine] = await Promise.all([fetchCatalog(), fetchMyAgents().then((r) => r.agents)]);
  } catch (err) {
    host.innerHTML = `<div class="cfg-row"><span class="label">Specialists</span><span class="cfg-note">${esc(err.message)}</span></div>`;
    return;
  }
  showing = showing || catalog.suggested_category;
  mine.filter((x) => !x.enabled).forEach((x) => open.add(x.agent.key)); // chosen at onboarding: open to set up
  paint();
  if (!host.dataset.wired) { host.addEventListener('click', onClick); host.dataset.wired = '1'; }
}
