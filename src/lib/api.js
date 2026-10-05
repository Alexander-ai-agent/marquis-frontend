// API client: the backend contract, DEMO_MODE fallback, and a hard fetch
// timeout so a hung backend endpoint (see README — this bit us for real)
// never hangs the UI indefinitely.

// Deployed Flask backend (Railway). Update if the Railway URL changes.
export const API_BASE = 'https://marquis-production.up.railway.app/api/v1/marquis';

// Flip to false once the backend is confirmed healthy end-to-end — see
// README "Switching off DEMO_MODE". Also auto-enables if API_BASE was
// never filled in, so a fresh clone never silently tries a bad URL.
const FORCE_DEMO = false;
export const DEMO_MODE = FORCE_DEMO || API_BASE.includes('YOUR-RAILWAY-URL');

const DEMO_LATENCY_MS = 500;
const CONVO_LATENCY_MS = 1100;
const FETCH_TIMEOUT_MS = 12000;
// A reply may involve reading the web first (search, pages, a second
// model call), so the conversation gets far longer than other requests.
const CONVERSATION_TIMEOUT_MS = 90000;

const DEMO_REPLIES = [
  "Three things require your attention, and only one of them is actually urgent. Your pricing page has sat untouched for six days — everything else around it keeps moving, which is usually the tell that it's the real blocker, not just an unfinished task.\n\nThe other two can wait. Outreach can wait a week without cost. Pricing cannot, because nothing downstream of it — your onboarding copy, your checkout flow, your first sales conversation — can be finished honestly until that number exists.",
  "You've asked this before, in a different shape. The answer hasn't changed: ship the smaller version this week, not the complete one. A founder at your stage loses more to a perfect thing that never ships than to an imperfect thing that does.\n\nIf it helps, write down what you'd cut if you had to launch tomorrow. That list is usually the real scope.",
  "That's worth sitting with rather than solving immediately. Most founders route around discomfort like this instead of through it — and the ones who don't tend to move faster afterward, not slower.\n\nTell me what you'd do if the obvious answer weren't available to you.",
];
let demoReplyIndex = 0;
const DEMO_IDLE = [
  "Only one thing is urgent this week: the pricing page. The rest can wait without cost.",
  "You've asked this before, in a different shape. Ship the smaller version this week.",
  "That's worth sitting with before solving. What would you do if the obvious answer weren't available?",
];

/**
 * fetch() with an AbortController-based timeout. A hung/misconfigured
 * backend endpoint fails fast with a clear message instead of leaving the
 * UI waiting indefinitely (see the diagnosed Supabase-timeout bug in the
 * backend repo — the frontend must never trust the backend to fail fast
 * on its own).
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Marquis is taking too long to answer. Try again shortly.');
    }
    throw new Error('Marquis cannot be reached at the moment. Try again shortly.');
  } finally {
    clearTimeout(timer);
  }
}

async function realLogin(email, password) {
  const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status >= 500 ? 'Marquis cannot be reached at the moment. Try again shortly.' : 'That email and password do not match.');
  return { token: data.token, user: { id: data.user_id, name: data.name, email } };
}

async function demoLogin(email) {
  await new Promise((r) => setTimeout(r, DEMO_LATENCY_MS));
  return { token: 'demo-token', user: { id: 'demo-user', name: email.split('@')[0] || 'Founder', email } };
}

export function login(email, password) {
  return DEMO_MODE ? demoLogin(email) : realLogin(email, password);
}

async function realSignup(name, email, password) {
  const res = await fetchWithTimeout(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status >= 500 ? 'Marquis cannot be reached at the moment. Try again shortly.' : (data.error || 'That account could not be created.'));
  return { token: data.token, user: { id: data.user_id, name, email } };
}

async function demoSignup(name, email) {
  await new Promise((r) => setTimeout(r, DEMO_LATENCY_MS));
  return { token: 'demo-token', user: { id: 'demo-user', name, email } };
}

export function signup(name, email, password) {
  return DEMO_MODE ? demoSignup(name, email) : realSignup(name, email, password);
}

/**
 * Returns { text, visualization }: visualization is the optional Living
 * Canvas payload (null on ordinary turns). Throws on any failure; the
 * caller shows an honest in-character notice, never a made-up reply.
 */
async function realConversation(token, message, conversationHistory) {
  const res = await fetchWithTimeout(`${API_BASE}/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversation_history: conversationHistory }),
  }, CONVERSATION_TIMEOUT_MS);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.butler_response) throw new Error(data.error || 'No reply');
  // `workspace` is the canvas-workspace contract (reel / wireframe); the
  // backend does not emit it yet (TODO), so real mode shows charts only.
  return {
    text: data.butler_response,
    visualization: data.visualization || null,
    workspace: data.workspace || null,
    sources: Array.isArray(data.sources) ? data.sources : [],
  };
}

// DEMO_MODE only: canned replies, each paired with the canvas view it
// would push, so the Living Canvas can be seen working without a backend.
const DEMO_VIZ = {
  revenue: { type: 'revenue_projection', title: "Revenue, and where it's heading", unit: '$', points: [
    { label: 'Jul', value: 0 }, { label: 'Aug', value: 420 }, { label: 'Sep', value: 1180 },
    { label: 'Oct', value: 1900, projected: true }, { label: 'Nov', value: 2700, projected: true }, { label: 'Dec', value: 3600, projected: true } ] },
  timeline: { type: 'phase_timeline', title: 'Each phase against its estimate', phases: [
    { name: 'Foundation', est_days: 14, actual_days: 19, status: 'done' }, { name: 'Build', est_days: 21, actual_days: 33, status: 'done' },
    { name: 'Launch', est_days: 14, actual_days: 8, status: 'current' }, { name: 'Revenue', est_days: 18, actual_days: null, status: 'future' },
    { name: 'Scale', est_days: 30, actual_days: null, status: 'future' } ] },
  blocker: { type: 'blocker_heat', title: "What hasn't cooled", topics: [
    { name: 'Pricing', days: [2, 2, 3, 3, 4, 4, 4] }, { name: 'Outreach', days: [1, 0, 1, 0, 1, 0, 1] },
    { name: 'Onboarding copy', days: [0, 1, 0, 0, 0, 1, 0] } ] },
  coverage: { type: 'coverage', title: 'Standard for your stage', items: [
    { name: 'Payments', value: 100 }, { name: 'Analytics', value: 95 }, { name: 'Error monitoring', value: 15 },
    { name: 'Onboarding email', value: 85 }, { name: 'Social proof', value: 20 } ] },
};
// Replies stay to a sentence or two (rebuild brief §7): a longer thought
// becomes a second exchange, never a taller block.
const DEMO_SHORT = {
  revenue: "At this pace you pass three thousand a month by December. That line assumes conversion holds; nothing guarantees it yet.",
  timeline: "Seventeen days behind, nearly all of it from Build. You underquote build work, not distribution work.",
  blocker: "Pricing has come up three times without a decision. Put a number on the page this week; you can change it.",
  coverage: "Two standard things are missing: error monitoring and social proof. Neither is urgent; both are cheap.",
};
// Demo examples of the general canvas blocks (real mode: Claude fills these in).
const DEMO_BLOCKS = {
  sheet: { type: 'sheet', title: 'Revenue against costs', columns: ['Month', 'Revenue', 'Costs', 'Net'], rows: [
    ['Jul', 0, 820, '=B1-C1'], ['Aug', 420, 860, '=B2-C2'], ['Sep', 1180, 910, '=B3-C3'], ['Oct', 1900, 960, '=B4-C4'],
    ['Total', '=SUM(B1:B4)', '=SUM(C1:C4)', '=SUM(D1:D4)'], ['Average', '=AVERAGE(B1:B4)', '=AVERAGE(C1:C4)', '=AVERAGE(D1:D4)'] ] },
  chart: { type: 'chart', title: 'Signups against paid', unit: '', x: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'], series: [
    { name: 'Signups', values: [12, 19, 24, 31, 29, 40, 46, 55] }, { name: 'Paid', values: [0, 1, 2, 2, 4, 5, 7, 9] } ] },
  drawing: { type: 'drawing', title: 'How a visitor becomes a customer', shapes: [
    { kind: 'rect', x: 4, y: 38, w: 18, h: 16, label: 'Lands on page' }, { kind: 'arrow', x1: 22, y1: 46, x2: 34, y2: 46 },
    { kind: 'rect', x: 34, y: 38, w: 18, h: 16, label: 'Understands it' }, { kind: 'arrow', x1: 52, y1: 46, x2: 64, y2: 46 },
    { kind: 'rect', x: 64, y: 38, w: 18, h: 16, label: 'Trusts it' }, { kind: 'arrow', x1: 82, y1: 46, x2: 92, y2: 46 },
    { kind: 'circle', x: 95, y: 46, r: 3, label: 'Pays' }, { kind: 'line', x1: 43, y1: 54, x2: 43, y2: 72 },
    { kind: 'text', x: 34, y: 78, text: 'most leave here: the first five seconds' } ] },
};
const DEMO_WORK = [
  { match: /\b(sheet|spreadsheet|excel|table|p&l|budget|costs?)\b/i, viz: DEMO_BLOCKS.sheet, label: 'SHEET · REVENUE', text: 'Revenue against costs, month by month. Change any number and the totals follow.' },
  { match: /\b(signups?|conversion|funnel chart|compare)\b/i, viz: DEMO_BLOCKS.chart, label: 'CHART · WEEKLY', text: 'Signups climb steadily; paid lags well behind. The gap is the conversion problem.' },
  { match: /\b(draw|diagram|flow|explain how)\b/i, viz: DEMO_BLOCKS.drawing, label: 'DRAWING · FUNNEL', text: 'Four steps from visit to payment. Most people leave at the second.' },
  { match: /\b(reel|instagram|video|montage)\b/i, workspace: { type: 'reel', query: 'launch week' }, label: 'REEL · SELECTION', text: "I've gathered twelve from this week. Keep the ones that feel like the product." },
  { match: /\b(website|site|landing page|homepage)\b/i, workspace: { type: 'wireframe', subject: 'the site' }, label: 'SITE · SKETCH', text: "A first sketch. Move what's wrong, note what's missing, and I'll take it from there." },
];
const DEMO_TOPICS = [
  { match: /revenue|money|mrr|income|earn|project/i, viz: 'revenue', text: "At the pace of the last two months, you'd pass three thousand a month by December. That line is a projection, not a promise. It assumes conversion holds while traffic grows, and right now nothing guarantees the second half of that.\n\nThe number worth watching isn't revenue. It's how many people who land on the page reach the checkout at all." },
  { match: /phase|behind|timeline|estimate|late|progress/i, viz: 'timeline', text: "You're seventeen days behind the combined estimate, and almost all of it came from Build. Launch is tracking close to plan.\n\nThe pattern is consistent: you underquote build work, not distribution work. Next time you estimate a build phase, add half again. You'll be right more often than not." },
  { match: /stuck|block|pricing|price|stall/i, viz: 'blocker', text: "Pricing has come up in three conversations without a decision. Everything around it keeps moving, which is usually the tell that it's the real blocker, not just an unfinished task.\n\nPick a number you'd be mildly embarrassed by, and put it on the page this week. You can change it. You can't learn anything from a number that doesn't exist." },
  { match: /missing|standard|should i add|enhance|gap/i, viz: 'coverage', text: "Two things are standard at your stage and absent: error monitoring and any form of social proof. Neither is urgent. Both are cheap.\n\nError monitoring first. A free Sentry account catches what you won't see manually, and it takes an afternoon." },
];

async function demoConversation(message) {
  await new Promise((r) => setTimeout(r, CONVO_LATENCY_MS));
  const work = DEMO_WORK.find((t) => t.match.test(message || ''));
  if (work) return { text: work.text, visualization: work.viz || null, workspace: work.workspace || null, label: work.label };
  const topic = DEMO_TOPICS.find((t) => t.match.test(message || ''));
  if (topic) return { text: DEMO_SHORT[topic.viz], visualization: DEMO_VIZ[topic.viz] };
  const reply = DEMO_IDLE[demoReplyIndex % DEMO_IDLE.length];
  demoReplyIndex++;
  return { text: reply, visualization: null };
}

export function sendConversationMessage(token, message, conversationHistory) {
  return DEMO_MODE ? demoConversation(message) : realConversation(token, message, conversationHistory);
}

/* ---------------- Canvas ---------------- */

/** The user drew first: send the sketch, get { text, visualization } back.
 * Demo mode reads the strokes locally (each stroke cluster becomes a
 * region), so the result still reflects what was actually drawn. */
export async function interpretDrawing(token, pngDataUrl, hint, strokes) {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, CONVO_LATENCY_MS));
    return demoInterpret(strokes);
  }
  const res = await fetchWithTimeout(`${API_BASE}/canvas/interpret`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: pngDataUrl, hint }),
  }, 45000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'I could not read that drawing.');
  return { text: data.butler_response, visualization: data.visualization };
}

function demoInterpret(strokes) {
  // Merge overlapping stroke bounding boxes into regions.
  const boxes = strokes.filter((s) => s.length > 1).map((s) => {
    const xs = s.map((p) => p.x), ys = s.map((p) => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
  const near = (a, b) => a.x0 <= b.x1 + 0.02 && b.x0 <= a.x1 + 0.02 && a.y0 <= b.y1 + 0.02 && b.y0 <= a.y1 + 0.02;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (near(boxes[i], boxes[j])) {
        const a = boxes[i], b = boxes.splice(j, 1)[0];
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
        merged = true; break;
      }
    }
  }
  const regions = boxes.filter((b) => b.x1 - b.x0 > 0.03 || b.y1 - b.y0 > 0.03).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).slice(0, 16)
    .map((b, i) => ({ label: `Region ${i + 1}`, x: b.x0, y: b.y0, w: Math.max(0.06, b.x1 - b.x0), h: Math.max(0.05, b.y1 - b.y0), note: '' }));
  if (!regions.length) throw new Error('I could not make out a layout in that drawing.');
  return {
    text: `I read ${regions.length} part${regions.length === 1 ? '' : 's'}. Name them by double-clicking and I will take it from there. (Demo: real mode reads the drawing itself.)`,
    visualization: { type: 'blueprint', title: 'Your sketch, tidied', regions },
  };
}

/** Real photographs for the canvas (backend /images/search, Unsplash). */
export async function searchImages(token, query) {
  if (DEMO_MODE) return null;
  const res = await fetchWithTimeout(`${API_BASE}/images/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Image search is unavailable.');
  return data.images || [];
}

/** Alfred's line as speech (backend /voice, Fish Audio). Returns an MP3
 * Blob, or null when there is no live voice (demo mode / no session). */
export async function synthesizeSpeech(token, text) {
  if (DEMO_MODE || !token) return null;
  const res = await fetchWithTimeout(`${API_BASE}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('The voice is unavailable.');
  return res.blob();
}

/** Real data for the canvas's idle presences (backend /agents/signals). */
export async function fetchSignals(token) {
  if (DEMO_MODE) return null;
  const res = await fetchWithTimeout(`${API_BASE}/agents/signals`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('signals unavailable');
  return res.json();
}

async function realDashboard(token) {
  const res = await fetchWithTimeout(`${API_BASE}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not load the dashboard.');
  return res.json();
}

export function fetchDashboard(token) {
  // Demo dashboard data lives in pages/dashboard.js (it's page-specific
  // content, not a generic API concern) — this only covers the real call.
  return realDashboard(token);
}

/* ---------------- Phases (Progress page) ---------------- */

export async function fetchPhases(token) {
  const res = await fetchWithTimeout(`${API_BASE}/phases`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('phases unavailable');
  return (await res.json()).phases || [];
}

export async function completePhase(token, phaseId) {
  const res = await fetchWithTimeout(`${API_BASE}/phases/${encodeURIComponent(phaseId)}/complete`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not record that.');
  return data;
}

/* ---------------- Onboarding ---------------- */

export async function fetchClarifyingQuestions(token, profile) {
  const res = await fetchWithTimeout(`${API_BASE}/onboarding/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  }, 30000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.questions)) throw new Error(data.error || 'questions unavailable');
  return data.questions;
}

export async function fetchPathway(token, profile, answers) {
  const res = await fetchWithTimeout(`${API_BASE}/onboarding/pathway`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...profile, answers }),
  }, 45000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.phase) throw new Error(data.error || 'pathway unavailable');
  return data;
}
