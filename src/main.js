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
import { initButler, arrive } from './pages/butler.js';
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
  let data = null;
  try { data = await loadAll(); } catch (_) { data = { ok: false, phases: [] }; }
  setStanding(standing(data.phases || []));
  await arrive(firstLine(data), contextLabel(data.phases || []));
}

boot();
