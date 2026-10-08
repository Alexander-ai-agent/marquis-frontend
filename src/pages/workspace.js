// The canvas as a creative workspace (rebuild brief §6), now a stack.
//
// Alfred's creations (a chart, a sheet, a layout, a reel, a design, a page,
// the sources he read) each live in a panel. The newest panel is open; the
// rest sit above and below it as a header you can open. A new creation is
// added, never swapped in for an earlier one: a panel leaves only when you
// set it aside. With persistence on, each panel is a stored canvas item, so a
// refresh brings the stack back (see lib/canvas-api.js); with one panel the
// plane looks and behaves exactly as the single workspace always did.
//
// Output renders on the same plane as the field (never a modal), and the
// visitor can reach in and work on it. The interactive kinds live in
// canvas-tools.js; hand-offs to the other agents are stubbed: handoffToAgents().

import { qs, escapeHtml } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';
import { setFieldState } from '../lib/field.js';
import { persistenceOn, fetchItem, fetchItems, saveItem, dismissItem } from '../lib/canvas-api.js';
import { renderDesign, renderDrafting, failDrafting } from './canvas-design.js';
import { renderSources, citeSource } from './canvas-sources.js';
import { renderSite, renderBars } from './canvas-pages.js';
import { renderChart, renderReel, renderWireframe, renderSheet, renderDrawing, renderPen, reelOrder } from './canvas-tools.js';

const gsap = window.gsap;
const SAVE_DELAY_MS = 900;
const MAX_HEADERS = 30;                 // older creations load on request, not at once

let root;
let stack;
let moreBtn = null;
let moreBefore = null;                  // cursor for older stored items
const panels = [];                      // newest first
let openPanel = null;
let seq = 0;

/* ---------------- what a stored item or block is, here ---------------- */

const UI_KIND = { sheet: 'sheet', drawing: 'drawing', design: 'design', site: 'site', bars: 'bars', blueprint: 'wireframe', reel: 'reel', images: 'reel', sources: 'sources' };
const uiKind = (type) => UI_KIND[type] || 'chart';
const clone = (v) => JSON.parse(JSON.stringify(v));

/** What a renderer is handed for a stored spec. */
function shape(k, spec) {
  if (k === 'wireframe') return { subject: spec.title, regions: spec.regions };
  return spec;                          // sheet, reel and the rest edit their spec in place
}

const LABELS = {
  revenue_projection: () => `REVENUE · Q${Math.floor(new Date().getMonth() / 3) + 1}`,
  phase_timeline: () => 'PATHWAY · ESTIMATES',
  blocker_heat: () => 'BLOCKER · UNRESOLVED',
  activity_pulse: () => 'PERFORMANCE · RHYTHM',
  coverage: () => 'STANDARD · FOR STAGE',
};

function labelOf(me) {
  const d = me.data || {};
  const edits = (word) => (me.edits ? `${word} · ${me.edits} EDIT${me.edits === 1 ? '' : 'S'}` : null);
  switch (me.kind) {
    case 'chart': return (LABELS[me.type] || (() => 'CANVAS'))();
    case 'reel': return d.stage === 'music' ? 'REEL · MUSIC' : d.stage === 'done' ? 'REEL · HANDED OFF' : 'REEL · SELECTION';
    case 'wireframe': return edits('LAYOUT') || 'LAYOUT · SKETCH';
    case 'sheet': return edits('SHEET') || 'SHEET';
    case 'drawing': return 'DRAWING';
    case 'design': return d.variants ? `DESIGN · ${d.variants.length} CONCEPT${d.variants.length === 1 ? '' : 'S'}` : 'DESIGN';
    case 'drafting': return d.building ? 'PAGE · BUILDING' : 'DESIGN · DRAFTING';
    case 'site': return 'PAGE · LIVE';
    case 'bars': return d.items ? `COMPARISON · ${d.items.length}` : 'COMPARISON';
    case 'sources': return d.sources ? `READING · ${d.sources.length} SOURCES` : 'READING';
    case 'pen': return 'YOUR SKETCH';
    default: return 'CANVAS';
  }
}

function headTitle(me) {
  const d = me.data || {};
  if (me.kind === 'reel') {
    if (d.stage === 'done' && d.music) return `Reel · ${(d.kept || []).length} frames · ${d.music}`;
    return `Images · ${d.query || 'gathered'}`;
  }
  if (me.kind === 'wireframe') return 'Layout · ' + (d.subject || me.title || 'the site');
  if (me.kind === 'pen') return 'Your sketch · draw, then hand it to Alfred';
  return d.title || me.title || 'On the canvas';
}

/* ---------------- the public face ---------------- */

/** Route a /conversation `visualization` block to a panel. `sources` (web
 * pages Alfred read) ride along under the block; `item` is its stored record. */
export function openViz(viz, { sources, item } = {}) {
  const spec = clone(item?.spec || viz);
  const k = uiKind(viz.type);
  return add({ k, type: viz.type, spec, data: shape(k, spec), id: item?.id, exchangeId: item?.exchange_id, title: item?.title, sources: sources ?? spec.sources });
}

/** Only the web pages Alfred read, when nothing else needs drawing. */
export function openSources(sources, { item } = {}) {
  const spec = { type: 'sources', title: 'What I read on your behalf', sources };
  return add({ k: 'sources', type: 'sources', spec, data: spec, id: item?.id, exchangeId: item?.exchange_id, title: spec.title });
}

/** A workspace that isn't a /conversation block (the pen, a demo reel). */
export function open(k, data, { sources } = {}) {
  if (k === 'wireframe') {
    const spec = { type: 'blueprint', title: data.subject || data.title, regions: data.regions };
    return add({ k, type: 'blueprint', spec, data, title: spec.title, sources });
  }
  if (k === 'reel') return add({ k, type: 'images', spec: data, data, title: data.title, sources });
  return add({ k, type: k, spec: null, data, title: data.title, sources });
}

/** The designer (or builder) is at work on `brief`; show the drafting table. */
export function openDrafting(brief, { building = false } = {}) {
  const data = { brief, building, title: building ? 'At the workbench' : 'At the drafting table' };
  return add({ k: 'drafting', type: 'drafting', spec: null, data, title: data.title });
}
const draftOf = (brief) => panels.find((p) => p.kind === 'drafting' && p.data.brief === brief);
export function isDrafting(brief) { return Boolean(draftOf(brief)); }
export function draftingFailed(message) {
  const me = panels.find((p) => p.kind === 'drafting');
  if (!me) return;
  me.error = message;
  if (me.plane) failDrafting(me.plane, message);
}
/** The designer's work landed: it takes the drafting table's place. It is
 * shown even if the table was set aside meanwhile (the work is saved either way). */
export function landDrafting(brief, viz, { item } = {}) {
  const table = draftOf(brief);
  const me = openViz(viz, { item });
  if (table) removePanel(table, { reopen: false });
  return me;
}

export function isOpen() { return panels.length > 0; }
export function kind() { return openPanel?.kind || null; }
export function label() { return openPanel ? labelOf(openPanel) : null; }
export function hasPen() { return panels.some((p) => p.kind === 'pen'); }

/** The creations on the canvas that came from one exchange (for its chips). */
export function creationsOf(exchangeId) {
  return panels.filter((p) => p.exchangeId && p.exchangeId === exchangeId).map((p) => ({ n: p.n, kind: labelOf(p) }));
}
/** Open the panel behind a chip. */
export function focusCreation(n) {
  const me = panels.find((p) => p.n === n);
  if (me) expand(me);
}

/** The ambient field follows the stack: dimmed while anything is on the canvas. */
export function syncField() { setFieldState(panels.length ? 'workspace' : 'idle'); }

/* ---------------- boot and restore ---------------- */

export function initWorkspace() {
  root = qs('#workspace');
  stack = document.createElement('div');
  stack.className = 'ws-stack';
  root.appendChild(stack);

  stack.addEventListener('click', (e) => {
    const me = e.target.closest('.ws-panel')?._me;
    if (!me) return;
    if (e.target.closest('.ws-close')) dismiss(me);
    else if (e.target.closest('.ws-toggle')) expand(me);
    else if (e.target.closest('.ws-more')) loadOlder();
  });
  // Escape no longer closes panels: panels leave only when you set them
  // aside. It still cancels your sketch (and the router, seeing the pen, lets
  // it go before returning you to the screen you came from).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const pen = panels.find((p) => p.kind === 'pen');
    if (pen) removePanel(pen);
  });
  // Hovering a citation in Alfred's subtitles lights its source card.
  document.addEventListener('marquis:cite', (e) => citeSource(root, e.detail.n, e.detail.on));
  // Edits are saved a moment after they settle; make sure none is left behind.
  document.addEventListener('visibilitychange', () => { if (document.hidden) panels.forEach((p) => { if (p.saveTimer) flush(p); }); });
}

/** Bring back what the server holds: headers of the user's items, newest
 * first, the newest with its spec so it opens at once. */
export function restore({ items = [], newest = null, hasMore = false, nextBefore = null } = {}) {
  if (!items.length || panels.length) return;
  items.slice(0, MAX_HEADERS).forEach((h, i) => {
    const full = i === 0 && newest?.id === h.id ? newest : null;
    const spec = full?.spec ? clone(full.spec) : null;
    const k = uiKind(h.kind);
    const me = make({ k, type: h.kind, spec, data: spec ? shape(k, spec) : null, id: h.id, exchangeId: h.exchange_id, title: h.title, sources: spec?.sources, loaded: Boolean(spec) });
    panels.push(me);
    stack.appendChild(me.el);
    paintHead(me);
  });
  moreBefore = hasMore ? nextBefore : null;
  paintMore();
  const first = panels[0];
  if (first) { showRoot(); activate(first); }
}

async function loadOlder() {
  if (!moreBefore || !persistenceOn()) return;
  const before = moreBefore;
  moreBefore = null;
  try {
    const page = await fetchItems({ limit: MAX_HEADERS, before });
    page.items.forEach((h) => {
      const k = uiKind(h.kind);
      const me = make({ k, type: h.kind, spec: null, data: null, id: h.id, exchangeId: h.exchange_id, title: h.title, loaded: false });
      panels.push(me);
      stack.appendChild(me.el);
      paintHead(me);
    });
    moreBefore = page.has_more ? page.next_before : null;
  } catch (e) {
    console.warn('[workspace] earlier creations did not load:', e);
    moreBefore = before;
  }
  paintMore();
}

function paintMore() {
  moreBtn?.remove();
  moreBtn = null;
  if (!moreBefore) return;
  moreBtn = document.createElement('div');
  moreBtn.className = 'ws-panel ws-more-row';
  moreBtn._me = {};
  moreBtn.innerHTML = '<button type="button" class="act ws-more">Earlier creations ›</button>';
  stack.appendChild(moreBtn);
}

/* ---------------- panels ---------------- */

function make({ k, type, spec, data, id, exchangeId, title, sources, loaded = true }) {
  const el = document.createElement('section');
  el.className = 'ws-panel';
  const me = {
    el, id: id || null, n: ++seq, kind: k, type, spec, data, title: title || '', exchangeId: exchangeId || null, sources: sources || null,
    loaded, open: false, edits: 0, cleanups: [], live: true, renderToken: 0, plane: null, saveTimer: null, cameFrom: null, error: '',
  };
  el._me = me;
  el.dataset.kind = k;
  el.dataset.state = 'collapsed';
  return me;
}

const host = {
  remark(me, text) { document.dispatchEvent(new CustomEvent('marquis:remark', { detail: { text, label: labelOf(me) } })); },
  changed(me) { paintHead(me); queueSave(me); },
  penResult(me, reply) {
    const shown = openViz(reply.visualization, { item: reply.item });
    host.remark(shown, reply.text);
  },
};

function add(def) {
  const me = make(def);
  panels.unshift(me);
  stack.prepend(me.el);
  const wasHidden = root.hidden;
  showRoot();
  activate(me, { fade: !wasHidden });
  return me;
}

function showRoot() {
  const wasHidden = root.hidden;
  try { gsap.killTweensOf(root); } catch (_) {}
  root.hidden = false;
  if (wasHidden && !skipMovement()) { try { gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: EASE.out }); } catch (_) {} }
  else { try { gsap.set(root, { clearProps: 'opacity' }); } catch (_) {} }
}

function syncBody() {
  if (openPanel) document.body.dataset.workspace = openPanel.kind; else delete document.body.dataset.workspace;
  if (hasPen()) document.body.dataset.pen = 'true'; else delete document.body.dataset.pen;
}

/** Make `me` the open panel; whatever was open becomes a header (its work
 * kept in memory), except a sketch, which is only ever a scratch surface. */
function activate(me, { fade = false } = {}) {
  const prev = openPanel;
  if (prev && prev !== me) {
    me.cameFrom = prev;
    if (prev.kind === 'pen') removePanel(prev, { reopen: false });
    else collapse(prev);
  }
  openPanel = me;
  me.open = true;
  me.el.dataset.state = 'open';
  paintHead(me);
  syncBody();
  setFieldState('workspace');
  if (fade && !skipMovement()) { try { gsap.fromTo(me.el, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: EASE.out, clearProps: 'opacity' }); } catch (_) {} }
  show(me);
}

function collapse(me) {
  teardown(me);
  me.open = false;
  me.el.dataset.state = 'collapsed';
  paintHead(me);
}

function expand(me) {
  if (me.open || !me.live) return;
  activate(me);
  me.el.scrollIntoView?.({ block: 'nearest' });
}

/** Draw an open panel: its plane, then its sources strip. A panel loaded as
 * a header fetches its spec first, so a refresh only ever pays for one. */
async function show(me) {
  const token = ++me.renderToken;
  me.plane = document.createElement('div');
  me.plane.className = 'ws-plane';
  me.el.appendChild(me.plane);
  if (!me.loaded) {
    me.plane.innerHTML = '<p class="label ws-quiet">Opening.</p>';
    try {
      const item = await fetchItem(me.id);
      if (me.renderToken !== token || !me.live) return;
      me.spec = clone(item.spec);
      me.data = shape(me.kind, me.spec);
      me.sources = me.spec.sources || null;
      me.loaded = true;
    } catch (e) {
      if (me.renderToken === token) me.plane.innerHTML = `<p class="label ws-quiet">${escapeHtml(e.message || 'That did not open.')}</p>`;
      return;
    }
    paintHead(me);
  }
  me.plane.innerHTML = '';
  render(me);
  if (me.kind !== 'sources' && me.sources?.length) renderSources(me.el, me.sources, { strip: true });
}

function render(me) {
  const { plane, data } = me;
  switch (me.kind) {
    case 'chart': renderChart(plane, data, me); break;
    case 'reel': renderReel(plane, data, me, host); break;
    case 'wireframe': renderWireframe(plane, data, me, host); break;
    case 'sheet': renderSheet(plane, data, me, host); break;
    case 'drawing': renderDrawing(plane, data, me); break;
    case 'pen': renderPen(plane, data, me, host); break;
    case 'design': renderDesign(plane, data); break;
    case 'drafting': renderDrafting(plane, data); if (me.error) failDrafting(plane, me.error); break;
    case 'site': renderSite(plane, data); break;
    case 'bars': renderBars(plane, data); break;
    case 'sources': renderSources(plane, data.sources); break;
    default: break;
  }
}

/** Stop a panel's live parts and take its plane out of the page. */
function teardown(me) {
  me.renderToken += 1;
  me.cleanups.splice(0).forEach((fn) => { try { fn(); } catch (_) {} });
  me.plane?.remove();
  me.plane = null;
  me.el.querySelector(':scope > .sources')?.remove();
}

function paintHead(me) {
  let head = me.el.querySelector(':scope > .ws-head');
  if (!head) { head = document.createElement('div'); head.className = 'ws-head'; me.el.prepend(head); }
  const title = escapeHtml(headTitle(me));
  const kindLabel = escapeHtml(labelOf(me));
  head.innerHTML = (me.open
    ? `<span class="ws-headline"><span class="ws-live" aria-hidden="true"></span><span class="label ws-title">${title}</span><span class="label ws-kind">${kindLabel}</span></span>`
    : `<button type="button" class="ws-toggle" aria-expanded="false"><span class="label ws-title">${title}</span><span class="label ws-kind">${kindLabel}</span><span class="label ws-expand" aria-hidden="true">Open ›</span></button>`)
    + '<button type="button" class="act ws-close">Set aside ×</button>';
}

/* ---------------- leaving ---------------- */

/** Only ever the user's act. Stored items get a dismissed flag, not a delete. */
function dismiss(me) {
  if (me.id && persistenceOn()) {
    dismissItem(me.id).catch((e) => {
      console.warn('[workspace] set-aside was not saved:', e);
      host.remark(me, 'I set that aside here, but could not note it on my side; it may return when you refresh.');
    });
  }
  removePanel(me);
}

function removePanel(me, { reopen = true } = {}) {
  const i = panels.indexOf(me);
  if (i < 0) return;
  clearTimeout(me.saveTimer);
  me.saveTimer = null;
  teardown(me);
  me.live = false;
  panels.splice(i, 1);
  me.el.remove();
  if (openPanel === me) {
    openPanel = null;
    const next = reopen ? (panels.includes(me.cameFrom) ? me.cameFrom : panels[0]) : null;
    if (next) activate(next);
  }
  if (!panels.length) closeWorkspace();
  else syncBody();
}

function closeWorkspace() {
  openPanel = null;
  syncBody();
  document.dispatchEvent(new CustomEvent('marquis:workspace-closed'));
  setFieldState('idle');
  const done = () => { if (!panels.length) root.hidden = true; try { gsap.set(root, { clearProps: 'opacity' }); } catch (_) {} };
  if (skipMovement()) return done();
  try { gsap.to(root, { opacity: 0, duration: 0.42, ease: EASE.out, onComplete: done }); } catch (_) { done(); }
}

/* ---------------- saving edits ---------------- */

/** The spec as the server should hold it after the user's edits. */
function specOf(me) {
  if (me.kind === 'wireframe') return { ...me.spec, regions: me.regions.map(({ id, label, x, y, w, h, note }) => ({ id, label, x, y, w, h, note })) };
  return me.data;
}

function queueSave(me) {
  if (!me.id || !persistenceOn() || !['sheet', 'wireframe', 'reel'].includes(me.kind)) return;
  clearTimeout(me.saveTimer);
  me.saveTimer = setTimeout(() => flush(me), SAVE_DELAY_MS);
}

async function flush(me) {
  clearTimeout(me.saveTimer);
  me.saveTimer = null;
  if (!me.live) return;
  try { await saveItem(me.id, specOf(me)); }
  catch (e) { console.warn('[workspace] edits were not saved:', e); }
}

/* ---------------- a step typed to Alfred ---------------- */

/** A step of a workspace flow typed into Alfred's input, handled here
 * rather than by the backend. Returns { text, label } or null. */
const NEW_REQUEST = /\b(website|site|landing page|reel|instagram|chart|revenue|phase|pricing|show me|sketch|draw|design|logo|mark|icon|poster)\b/i;

export function intercept(text) {
  const me = openPanel;
  if (NEW_REQUEST.test(text) && !(me?.kind === 'wireframe' && /\b(build|go ahead|proceed)\b/i.test(text))) return null;
  if (me?.kind === 'reel' && me.data.stage === 'music') {
    me.data.music = text;
    me.data.stage = 'done';
    handoffToAgents({ kind: 'reel', images: reelOrder(me.data), music: text });
    host.changed(me);
    return { text: `Noted: ${text}. The cut is with the others now; I'll bring it to you when it's assembled.`, label: labelOf(me) };
  }
  if (me?.kind === 'wireframe' && /\b(build|go ahead|proceed|that's it|looks right)\b/i.test(text)) {
    handoffToAgents({ kind: 'wireframe', regions: me.regions });
    return { text: 'Understood. I have the layout as you left it, and the build is in hand.', label: 'SITE · HANDED OFF' };
  }
  return null;
}

/**
 * TODO(agents): hand finished direction to the agent system for real
 * production (reel assembly, site build). Stubbed this round per the
 * brief; the payload shape is what the backend will receive.
 */
function handoffToAgents(payload) {
  console.info('[workspace] hand-off queued (stub):', payload);
}
