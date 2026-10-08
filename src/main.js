// Boot. Every session lands on the Butler screen: Alfred's mark alone,
// then his first line, then the input. Unknown visitors meet him at the
// auth screen first; new ones go through his introduction (onboarding).

import { qs } from './lib/dom.js';
import { state } from './lib/state.js';
import { initRouter, goToPage, onPageChange, startRunningHead } from './lib/router.js';
import { DEMO_MODE } from './lib/api.js';
import { initField, setStanding } from './lib/field.js';
import { paintMarks } from './lib/marks.js';
import { typewrite } from './lib/voice.js';
import { loadAll, firstLine, contextLabel, standing } from './lib/data.js';

import { initAuth, showAuth } from './pages/auth.js';
import { initOnboarding, runOnboarding } from './pages/onboarding.js';
import { initButler, arrive, restoreHistory } from './pages/butler.js';
import { restore as restoreCanvas } from './pages/workspace.js';
import { persistenceOn, fetchHistory, fetchItems } from './lib/canvas-api.js';
import { renderDossier } from './pages/dossier.js';
import { renderAgents } from './pages/agents.js';
import { renderBrief } from './pages/brief.js';
import { renderMap } from './pages/map.js';
import { initConfig, renderConfig } from './pages/config.js';

function setPhase(phase) { document.body.dataset.phase = phase; }

function boot() {
  paintMarks();
  initField();
  startRunningHead();
  if (DEMO_MODE) document.body.dataset.demo = 'true';
  initRouter();
  initAuth({ onAuthenticated: afterAuth });
  initOnboarding({ onFinished: enterApp });
  initButler();
  initConfig();

  onPageChange((page) => {
    if (page === 'dossier') renderDossier();
    if (page === 'agents') renderAgents();
    if (page === 'brief') renderBrief();
    if (page === 'map') renderMap();
    if (page === 'config') renderConfig();
  });

  if (!state.token) {
    setPhase('auth');
    showAuth();
    typewrite(qs('#authLine'), 'You will need to be known to me first.');
  } else {
    afterAuth();
  }
}

function afterAuth() {
  qs('#auth-screen')?.classList.remove('active');
  if (state.profile) { enterApp(); return; }
  setPhase('onboarding');
  qs('#page-onboarding').classList.add('active');
  runOnboarding();
}

async function enterApp() {
  setPhase('app');
  goToPage('butler', { instant: true });
  // Everything the screen needs is asked for at once, and only what is needed:
  // the newest exchange (with the stored count) and the canvas headers, the
  // newest creation in full. A failure of either just means a fresh start.
  const quiet = (p) => p.catch((e) => { console.warn('[main] restore skipped:', e); return null; });
  const [data0, past, canvas] = await Promise.all([
    loadAll().catch(() => ({ ok: false, phases: [] })),
    persistenceOn() ? quiet(fetchHistory({ limit: 1 })) : null,
    persistenceOn() ? quiet(fetchItems({ limit: 30 })) : null,
  ]);
  const data = data0 || { ok: false, phases: [] };
  setStanding(standing(data.phases || []));
  if (past) restoreHistory(past);
  if (canvas) restoreCanvas({ items: canvas.items, newest: canvas.newest, hasMore: canvas.has_more, nextBefore: canvas.next_before });
  await arrive(firstLine(data), contextLabel(data.phases || []));
}

boot();
