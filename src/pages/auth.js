// Login / signup screen.

import { qs } from '../lib/dom.js';
import { isValidEmail, isValidPassword, firstError } from '../lib/validate.js';
import { login, signup } from '../lib/api.js';
import { setSession } from '../lib/state.js';

let onAuthed = null; // (isNewSignup: boolean) => void

export function initAuth({ onAuthenticated }) {
  onAuthed = onAuthenticated;
  wireToggle();
  wireLoginForm();
  wireSignupForm();
}

export function showAuth() { qs('#auth-screen').classList.add('active'); }
export function hideAuth() { qs('#auth-screen').classList.remove('active'); }

function wireToggle() {
  const toggle = () => {
    const isSignup = qs('#signup-form').style.display !== 'none';
    qs('#login-form').style.display = isSignup ? 'block' : 'none';
    qs('#signup-form').style.display = isSignup ? 'none' : 'block';
    const switchEl = qs('#auth-switch');
    switchEl.innerHTML = isSignup
      ? 'First time here? <button type="button" id="show-signup">Create your account</button>'
      : 'Already a member? <button type="button" id="show-signup">Sign in</button>';
    qs('#show-signup').addEventListener('click', toggle);
  };
  qs('#show-signup').addEventListener('click', toggle);
}

function showFieldError(errEl, message) {
  errEl.textContent = message;
  errEl.classList.add('show');
}
function clearFieldError(errEl) {
  errEl.textContent = '';
  errEl.classList.remove('show');
}

function wireLoginForm() {
  qs('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#login-submit');
    const errEl = qs('#login-error');
    clearFieldError(errEl);

    const email = qs('#login-email').value.trim();
    const password = qs('#login-pass').value;

    const message = firstError([
      { value: email, rule: isValidEmail, message: 'Enter a valid email address.' },
      { value: password, rule: (v) => Boolean(v), message: 'Enter your password.' },
    ]);
    if (message) { showFieldError(errEl, message); return; }

    btn.disabled = true;
    btn.textContent = 'One moment';
    try {
      const { token, user } = await login(email, password);
      setSession(token, user);
      hideAuth();
      onAuthed(false);
    } catch (ex) {
      showFieldError(errEl, ex.message || 'Marquis cannot be reached at the moment. Try again shortly.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enter';
    }
  });
}

function wireSignupForm() {
  qs('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#signup-submit');
    const errEl = qs('#signup-error');
    clearFieldError(errEl);

    const name = qs('#signup-name').value.trim();
    const email = qs('#signup-email').value.trim();
    const password = qs('#signup-pass').value;

    const message = firstError([
      { value: name, rule: (v) => Boolean(v), message: 'Enter your name.' },
      { value: email, rule: isValidEmail, message: 'Enter a valid email address.' },
      { value: password, rule: isValidPassword, message: 'Password needs to be at least 8 characters.' },
    ]);
    if (message) { showFieldError(errEl, message); return; }

    btn.disabled = true;
    btn.textContent = 'One moment';
    try {
      const { token, user } = await signup(name, email, password);
      setSession(token, user);
      hideAuth();
      onAuthed(true);
    } catch (ex) {
      showFieldError(errEl, ex.message || 'Marquis cannot be reached at the moment. Try again shortly.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  });
}
