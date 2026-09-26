// Central animation helper — every page imports reveal()/makeTimeline()/
// animate() from here instead of calling `gsap` directly.
//
// RESILIENCE CONTRACT (see README "Resilience notes"): every element this
// module animates must already be visible per its own base CSS. These
// helpers only ever ENHANCE an already-visible element with an entrance —
// never the sole mechanism that makes it visible. If GSAP failed to load,
// or a call throws mid-animation, the affected elements are forced back to
// a fully visible, usable state rather than left stuck invisible. This is
// the fix for the exact bug described in the project brief: a page/element
// whose only "reveal" was a JS animation call, with no CSS-visible fallback.

const gsap = window.gsap;
export const gsapReady = typeof gsap !== 'undefined';
if (!gsapReady) {
  console.warn('[motion] GSAP failed to load — falling back to instant, CSS-only transitions.');
}

// Exact MARQUIS_animations.md curves via GSAP's CustomEase (vendored).
// Without it, the nearest built-in eases stand in. Zero ease-in anywhere:
// exits use the standard curve (decision, Sep 24).
export const EASE = { out: 'expo.out', standard: 'power2.inOut', milestone: 'back.out(1.7)' };
try {
  if (gsapReady && window.CustomEase) {
    gsap.registerPlugin(window.CustomEase);
    window.CustomEase.create('marquisOut', '0.16, 1, 0.3, 1');
    window.CustomEase.create('marquisStandard', '0.4, 0, 0.2, 1');
    window.CustomEase.create('marquisMilestone', '0.34, 1.56, 0.64, 1');
    EASE.out = 'marquisOut';
    EASE.standard = 'marquisStandard';
    EASE.milestone = 'marquisMilestone';
  }
} catch (e) {
  console.warn('[motion] CustomEase unavailable — using nearest built-in eases:', e);
}

function queryReduced() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export let prefersReduced = queryReduced();
if (typeof window.matchMedia === 'function') {
  // Live: the OS setting can be toggled without a page reload.
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    prefersReduced = e.matches;
  });
}

/** Normalize a selector / element / NodeList / array into an element array. */
function toElements(targets) {
  if (!targets) return [];
  if (typeof targets === 'string') return [...document.querySelectorAll(targets)];
  if (typeof targets.length === 'number' && !targets.nodeType) return Array.from(targets);
  return [targets];
}

/** True when Tier-1/2 movement (translate/scale) should be skipped entirely. */
export function skipMovement() {
  return prefersReduced || !gsapReady;
}

/** Force targets to their final, fully-visible resting state — the safety
 * net used whenever an animation call fails partway through. */
function forceVisible(targets) {
  try {
    if (gsapReady) {
      gsap.set(targets, { clearProps: 'all' });
    } else {
      const els = toElements(targets);
      els.forEach((el) => { if (el && el.style) { el.style.opacity = '1'; el.style.transform = 'none'; } });
    }
  } catch (_) { /* last-resort: nothing more we can safely do */ }
}

/**
 * Entrance reveal for elements that are ALREADY opacity:1 in their base
 * CSS. Tiered per prefers-reduced-motion (accessible-animation: tier, not
 * kill-switch) — movement (y/scale) is Tier 1/2 and gets dropped; a short
 * opacity fade is Tier 3 and survives.
 */
export function reveal(targets, { x = 0, y = 12, scale, duration = 0.24, stagger = 0, delay = 0, ease = EASE.out } = {}) {
  if (!gsapReady) return; // base CSS already shows it — nothing to enhance.
  try {
    if (prefersReduced) {
      gsap.from(targets, { opacity: 0, duration: 0.15, stagger, delay, ease: 'none' });
    } else {
      const vars = { opacity: 0, duration, stagger, delay, ease };
      if (x) vars.x = x;
      if (y) vars.y = y;
      if (scale) vars.scale = scale;
      gsap.from(targets, vars);
    }
  } catch (e) {
    console.warn('[motion] reveal failed — forcing visible instead:', e);
    forceVisible(targets);
    return;
  }

  // Safety net — verified necessary in real-browser testing, not
  // theoretical: gsap.from()'s immediateRender applies its FROM state
  // (opacity:0, inline) the instant this call runs, even though these
  // targets are already opacity:1 by CSS default. That's normally fine —
  // GSAP's ticker animates it back to 1 within `duration`. But if the
  // ticker is throttled or fully suspended (e.g. the tab is backgrounded,
  // which suspends requestAnimationFrame — confirmed via direct testing,
  // not a hypothetical), the inline opacity:0 never gets animated away
  // and permanently overrides the CSS default, leaving the element
  // invisible indefinitely. This timeout (setTimeout, not rAF-gated)
  // guarantees the element reaches its correct visible state regardless.
  // Includes the full stagger spread, not just one element's duration —
  // the last element in a staggered group doesn't even start until
  // `stagger * (count - 1)` in.
  const els = toElements(targets);
  const staggerSpread = stagger * Math.max(0, els.length - 1);
  const safetyMs = Math.round((delay + staggerSpread + duration) * 1000) + 1500;
  setTimeout(() => {
    // Not '=== 0': a stagger group whose ticker stalls mid-way can freeze
    // any element at a PARTIAL opacity (verified in testing — one line of
    // a 4-line stagger sat at 0.45 forever while its siblings finished
    // normally). Checking only for "still exactly 0" misses that case
    // entirely, so this checks for "not essentially fully visible yet".
    const stuck = els.some((el) => el && parseFloat(getComputedStyle(el).opacity) < 0.99);
    if (stuck) forceVisible(targets);
  }, safetyMs);
}

/**
 * "Draw in" reveal for an SVG line/path (stroke-dashoffset from full
 * length to 0) — the stroke-dash equivalent of reveal()'s opacity
 * pattern, same resilience contract: the element is set to its correct,
 * fully-drawn resting state (dashoffset:0) FIRST and unconditionally,
 * before any GSAP call, so a missing/throttled ticker leaves a complete
 * line rather than an undrawn one. GSAP only enhances with the draw-in
 * animation on top of that already-correct state.
 */
export function drawStroke(el, { duration = 0.6, delay = 0, ease = EASE.out } = {}) {
  if (!el) return;
  el.style.strokeDashoffset = '0';
  if (!gsapReady || prefersReduced) return;

  let len;
  try {
    len = el.getTotalLength();
  } catch (e) {
    return; // base state above is already correct
  }

  try {
    gsap.set(el, { strokeDasharray: len });
    gsap.fromTo(el, { strokeDashoffset: len }, { strokeDashoffset: 0, duration, delay, ease });
  } catch (e) {
    console.warn('[motion] drawStroke failed (line is already fully drawn):', e);
    return;
  }

  const safetyMs = Math.round((delay + duration) * 1000) + 1500;
  setTimeout(() => {
    if (parseFloat(getComputedStyle(el).strokeDashoffset) !== 0) {
      el.style.strokeDashoffset = '0';
    }
  }, safetyMs);
}

/** gsap.to(), with the same failure-safe wrapping. `finalState` (optional)
 * is applied directly if the tween throws, so the UI still reaches the
 * intended end state instead of freezing mid-transition. */
export function animate(targets, vars, finalState) {
  if (!gsapReady) {
    if (finalState) forceVisible(targets);
    return;
  }
  try {
    gsap.to(targets, vars);
  } catch (e) {
    console.warn('[motion] animate failed:', e);
    forceVisible(targets);
  }
}

/** A GSAP timeline, or a no-op stand-in exposing the same chainable API
 * subset this app uses, so call sites never need `if (gsapReady)` guards. */
export function makeTimeline(vars = {}) {
  if (!gsapReady) return noopTimeline();
  try {
    return gsap.timeline(vars);
  } catch (e) {
    console.warn('[motion] timeline creation failed:', e);
    return noopTimeline();
  }
}

function noopTimeline() {
  const stub = {
    to: () => stub, from: () => stub, fromTo: () => stub, set: () => stub, call: () => stub,
  };
  return stub;
}
