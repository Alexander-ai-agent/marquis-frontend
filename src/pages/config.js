// Config (rebuild brief §8): ruled groups, [×]/[·] toggles, and one gold
// element: CONFIRM CHANGES. Toggles stage changes; confirming applies them.

import { qs, qsa } from '../lib/dom.js';
import { state, setVoice, setMode, setReplyStyle, resetOnboarding, clearSession } from '../lib/state.js';
import { renderConfigAgents } from './config-agents.js';

const canSpeak = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
let staged = {};

function paintToggle(btn, on) { btn.setAttribute('aria-checked', String(on)); btn.dataset.on = on ? '1' : '0'; }

function sync() {
  const mode = staged.mode ?? (canSpeak ? state.mode : 'text');
  const voice = staged.voice ?? state.voiceOn;
  qsa('#page-config [data-mode-option]').forEach((b) => {
    paintToggle(b, b.dataset.modeOption === mode);
    if (b.dataset.modeOption === 'voice' && !canSpeak) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
  });
  paintToggle(qs('#voiceToggle'), voice);
  const reply = staged.reply ?? state.replyStyle;
  qsa('#page-config [data-reply-option]').forEach((b) => paintToggle(b, b.dataset.replyOption === reply));
  const pending = Object.keys(staged).length > 0;
  qs('#cfgConfirm').disabled = !pending;
}

export function renderConfig() {
  qs('#cfgName').textContent = state.user?.name || '—';
  qs('#cfgEmail').textContent = state.user?.email || '—';
  qs('#cfgType').textContent = state.profile?.type || '—';
  qs('#cfgStage').textContent = state.profile?.stage || '—';
  staged = {};
  qs('#cfgConfirmNote').textContent = '';
  sync();
  renderConfigAgents();
}

export function initConfig() {
  qsa('#page-config [data-mode-option]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.modeOption;
    if (v === state.mode) delete staged.mode; else staged.mode = v;
    sync();
  }));
  qsa('#page-config [data-reply-option]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.replyOption;
    if (v === state.replyStyle) delete staged.reply; else staged.reply = v;
    sync();
  }));
  qs('#voiceToggle').addEventListener('click', () => {
    const next = !(staged.voice ?? state.voiceOn);
    if (next === state.voiceOn) delete staged.voice; else staged.voice = next;
    sync();
  });
  qs('#cfgConfirm').addEventListener('click', () => {
    if ('mode' in staged) setMode(staged.mode);
    if ('voice' in staged) setVoice(staged.voice);
    if ('reply' in staged) setReplyStyle(staged.reply);
    staged = {};
    sync();
    qs('#cfgConfirmNote').textContent = 'Noted.';
  });

  // Destructive: asks once, in voice.
  const reset = qs('#resetBtn');
  const note = qs('#resetNote');
  let armed = null;
  reset.addEventListener('click', () => {
    if (!armed) {
      reset.textContent = 'Confirm: clear everything ›';
      note.textContent = 'Your profile and pathway answers go. This cannot be undone.';
      armed = setTimeout(() => { armed = null; reset.textContent = 'Clear profile ›'; note.textContent = ''; }, 6000);
      return;
    }
    clearTimeout(armed);
    resetOnboarding();
    location.reload();
  });
  qs('#signOutBtn').addEventListener('click', () => {
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    clearSession();
    try { sessionStorage.clear(); } catch (_) {}
    location.reload();
  });
}
