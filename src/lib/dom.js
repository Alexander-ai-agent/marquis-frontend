// Small DOM helpers shared across pages.

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** First name only, with a safe fallback — used all over (greeting, sidebar, settings). */
export function firstName(user, fallback = 'Founder') {
  return user && user.name ? user.name.split(' ')[0] : fallback;
}
