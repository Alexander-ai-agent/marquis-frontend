// Analytics: each agent's presence, rendered by the same bklit-ui
// components as the Butler canvas (MARQUIS_product.md: bklit-ui for ALL
// charts). Real mode reads /agents/signals; the notes come from the
// dashboard's agent insights. If the chart bundle fails, cards keep a
// quiet text fallback.

import { qs } from '../lib/dom.js';
import { reveal } from '../lib/motion.js';
import { fetchSignals, DEMO_MODE } from '../lib/api.js';
import { state } from '../lib/state.js';
import { latestInsights } from './dashboard.js';

const KEYS = ['performance', 'pathway', 'blocker', 'enhancement'];
let built = false;

export async function buildAnalytics() {
  if (built) return;
  built = true;
  reveal('#page-analytics .an-card', { y: 12, duration: 0.24, stagger: 0.06 });

  let signals = null;
  if (!DEMO_MODE) {
    try { signals = await fetchSignals(state.token); } catch (_) { signals = {}; }
    const insights = latestInsights();
    KEYS.forEach((k) => {
      const text = insights[k];
      if (text) qs(`#an-note-${k}`).innerHTML = text;
      else qs(`#an-note-${k}`).textContent = '';
    });
  }

  const mountAll = () => {
    if (!window.MarquisCanvas?.mountPresence) return false;
    KEYS.forEach((k) => {
      try { window.MarquisCanvas.mountPresence(qs(`#an-${k}`), k, { demo: DEMO_MODE, signals: signals || undefined }); }
      catch (e) { console.warn(`[analytics] ${k} presence failed, keeping fallback:`, e); }
    });
    return true;
  };
  if (!mountAll()) window.addEventListener('load', mountAll, { once: true });
}

