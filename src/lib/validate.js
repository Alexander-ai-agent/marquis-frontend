// Explicit JS validation. Forms use novalidate — native HTML5 validation
// (required/minlength) fails silently and is easy to miss; every field
// here gets a specific, visible inline error message instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

export function isValidPassword(value) {
  return typeof value === 'string' && value.length >= 8;
}

/**
 * Validate a set of {value, rule, message} entries in order and return the
 * first failing message, or null if all pass. Keeps validation logic out
 * of page modules so every form applies the same "stop at first error"
 * pattern consistently.
 */
export function firstError(checks) {
  for (const { value, rule, message } of checks) {
    if (!rule(value)) return message;
  }
  return null;
}
