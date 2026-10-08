// Persistence: past exchanges and canvas creations, always for the logged-in
// user (the server scopes every query by the token, never by anything sent
// here). Demo mode has no server and therefore nothing to persist.

import { API_BASE, DEMO_MODE, fetchWithTimeout } from './api.js';
import { state } from './state.js';

export const persistenceOn = () => !DEMO_MODE && Boolean(state.token);

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

const query = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) q.set(k, String(v)); });
  return q.toString();
};

/** {exchanges (newest first), has_more, next_before, total} */
export const fetchHistory = ({ limit = 20, before } = {}) => call(`/history?${query({ limit, before })}`);

/** {items (headers, newest first), newest (full item or null), has_more, next_before} */
export const fetchItems = ({ limit = 30, before } = {}) => call(`/canvas/items?${query({ limit, before })}`);

/** One full item (its spec), for a panel that was loaded collapsed. */
export const fetchItem = (id) => call(`/canvas/items/${encodeURIComponent(id)}`).then((r) => r.item);

/** The user's edits to a sheet, layout or reel. */
export const saveItem = (id, spec) => call(`/canvas/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: { spec } });

/** Set aside: a flag, only ever set by the user. */
export const dismissItem = (id) => call(`/canvas/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: { dismissed: true } });
