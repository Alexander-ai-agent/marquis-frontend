// Settings: account, communication mode (Mode 1 speak / Mode 2 type,
// both voice-out), the butler's voice, business profile, begin again
// (two-step), sign out.

import { qs, qsa } from '../lib/dom.js';
import { state, setVoice, setMode, resetOnboarding, clearSession } from '../lib/state.js';

export function renderSettings() {
  qs('#setName').textContent = state.user?.name || '—';
  qs('#setEmail').textContent = state.user?.email || '—';
  qs('#setType').textContent = state.profile?.type || '—';
  qs('#setStage').textContent = state.profile?.stage || '—';
  syncMode(state.mode);
}

function syncMode(mode) {
  const canSpeak = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const effective = canSpeak ? mode : 'text';
  qsa('#page-settings [data-mode-option]').forEach((b) => {
    const on = b.dataset.modeOption === effective;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    if (b.dataset.modeOption === 'voice' && !canSpeak) { b.disabled = true; b.title = 'Speaking is not supported in this browser'; }
  });
}

export function initSettings() {
  const voiceToggle = qs('#voiceToggle');
  const syncVoice = () => { voiceToggle.classList.toggle('on', state.voiceOn); voiceToggle.setAttribute('aria-checked', String(state.voiceOn)); };
  syncVoice();
  voiceToggle.addEventListener('click', () => { setVoice(!state.voiceOn); syncVoice(); });

  qsa('#page-settings [data-mode-option]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeOption)));
  document.addEventListener('marquis:mode', (e) => syncMode(e.detail));

  // Begin again: destructive, so it asks once, in-voice.
  const resetBtn = qs('#resetBtn');
  const resetSub = qs('#resetSub');
  let armed = null;
  resetBtn.addEventListener('click', () => {
    if (!armed) {
      resetBtn.textContent = 'Confirm';
      resetSub.textContent = 'Your profile and pathway answers will be cleared. This cannot be undone.';
      resetSub.classList.add('warn');
      armed = setTimeout(() => {
        armed = null;
        resetBtn.textContent = 'Begin again';
        resetSub.textContent = 'Clears your profile and starts the introduction afresh';
        resetSub.classList.remove('warn');
      }, 6000);
      return;
    }
    clearTimeout(armed);
    resetOnboarding();
    location.reload();
  });

  qs('#signOutBtn').addEventListener('click', () => {
    if (window.speechSynthesis) speechSynthesis.cancel();
    clearSession();
    try { sessionStorage.clear(); } catch (_) {}
    location.reload();
  });
}
