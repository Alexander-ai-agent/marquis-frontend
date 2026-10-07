// Specialist agents: the catalog, the user's enabled agents, runs and entries.
// Demo mode has no specialists (they need the live service).

import { API_BASE, DEMO_MODE, fetchWithTimeout } from './api.js';
import { state } from './state.js';

const RUN_TIMEOUT_MS = 90000; // a watcher searches and writes a brief

async function call(path, { method = 'GET', body, timeout } = {}) {
  if (DEMO_MODE) throw new Error('Specialist agents work with the live service only.');
  const res = await fetchWithTimeout(`${API_BASE}/agents${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
    body: body ? JSON.stringify(body) : undefined,
  }, timeout);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The agents are unavailable right now.');
  return data;
}

export const fetchCatalog = () => call('/catalog');
export const fetchMyAgents = () => (DEMO_MODE ? Promise.resolve({ agents: [] }) : call('/mine'));
export const enableAgent = (agentKey, fields = {}) => call('/mine', { method: 'POST', body: { agent_key: agentKey, ...fields } });
export const updateAgent = (id, fields) => call(`/mine/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields });
export const removeAgent = (id) => call(`/mine/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const runAgent = (id, request = '') => call(`/mine/${encodeURIComponent(id)}/run`, { method: 'POST', body: { request }, timeout: RUN_TIMEOUT_MS });
export const addEntry = (id, entry) => call(`/mine/${encodeURIComponent(id)}/entries`, { method: 'POST', body: entry, timeout: RUN_TIMEOUT_MS });
