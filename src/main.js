// Boot: intro (once per session) -> auth -> onboarding or dashboard.

import { qs } from './lib/dom.js';
import { state } from './lib/state.js';
import { initRouter, goToPage, onPageChange } from './lib/router.js';
import { DEMO_MODE } from './lib/api.js';

import { initAuth, showAuth } from './pages/auth.js';
import { initOnboarding, runOnboarding } from './pages/onboarding.js';
import { runIntro } from './pages/intro.js';
import { renderDashboard } from './pages/dashboard.js';
import { initConversation, playSeedOnce, setCanvasContext } from './pages/conversation.js';
import { buildTerrain } from './pages/progress.js';
import { buildAnalytics } from './pages/analytics.js';
import { initSettings, renderSettings } from './pages/settings.js';

function boot() {
  showDemoBadge();
  initRouter();
  initAuth({ onAuthenticated: afterAuth });
  initOnboarding({ onFinished: goToDashboard });
  initConversation();
  initSettings();

  onPageChange((page) => {
    if (page === 'progress') buildTerrain();
    if (page === 'analytics') buildAnalytics();
    if (page === 'settings') renderSettings();
    if (page === 'conversation') playSeedOnce();
  });

  // The intro is the first thing seen (once per session), regardless of
  // auth state; its overlay is always dismissed before anything else shows.
  runIntro(() => {
    if (!state.token) showAuth();
    else afterAuth();
  });
}

function afterAuth() {
  fillSidebarFoot();
  if (state.profile) {
    goToDashboard();
  } else {
    qs('#page-onboarding').classList.add('active');
    runOnboarding();
  }
}

function fillSidebarFoot() {
  // Spec: user name, plan tier, settings icon. (It used to show the
  // business type in the name slot.)
  qs('#sbName').textContent = (state.user?.name || 'Founder').trim().split(/\s+/)[0];
  qs('#sbPlan').textContent = 'Access';
  qs('#setPlan') && (qs('#setPlan').textContent = 'Access');
}

function goToDashboard() {
  fillSidebarFoot();
  goToPage('dashboard');
  renderDashboard({ onContext: setCanvasContext });
}

function showDemoBadge() {
  if (!DEMO_MODE) return;
  const badge = document.createElement('div');
  badge.className = 'demo-badge';
  badge.textContent = 'Demo';
  document.body.appendChild(badge);
}

boot();
