// Shared app state, persisted to localStorage. See README "Token storage"
// for the tradeoff (XSS-readable, but zero backend changes needed — the
// deployed backend returns the JWT in the response body, not a cookie).

const KEYS = {
  token: 'marquis_token',
  user: 'marquis_user',
  voice: 'marquis_voice',
  onboarded: 'marquis_onboarded',
  profile: 'marquis_profile',
  mode: 'marquis_mode',
};

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch (_) { return null; }
}

export const state = {
  token: localStorage.getItem(KEYS.token) || null,
  user: readJson(KEYS.user),
  voiceOn: localStorage.getItem(KEYS.voice) !== 'off',
  onboarded: localStorage.getItem(KEYS.onboarded) === 'true',
  profile: readJson(KEYS.profile),
  // Communication mode (MARQUIS_product.md): 'voice' = speak in, voice out
  // (default); 'text' = type in, voice out.
  mode: localStorage.getItem(KEYS.mode) === 'text' ? 'text' : 'voice',
};

export function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem(KEYS.token, token);
  localStorage.setItem(KEYS.user, JSON.stringify(user));
}

export function setOnboarded(profile) {
  state.onboarded = true;
  state.profile = profile;
  localStorage.setItem(KEYS.onboarded, 'true');
  localStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export function setVoice(on) {
  state.voiceOn = on;
  localStorage.setItem(KEYS.voice, on ? 'on' : 'off');
  document.dispatchEvent(new CustomEvent('marquis:voice', { detail: on }));
}

export function resetOnboarding() {
  localStorage.removeItem(KEYS.onboarded);
  localStorage.removeItem(KEYS.profile);
}

export function clearSession() {
  localStorage.clear();
  state.token = null;
  state.user = null;
  state.onboarded = false;
  state.profile = null;
}

export function setMode(mode) {
  state.mode = mode === 'text' ? 'text' : 'voice';
  localStorage.setItem(KEYS.mode, state.mode);
  document.dispatchEvent(new CustomEvent('marquis:mode', { detail: state.mode }));
}
