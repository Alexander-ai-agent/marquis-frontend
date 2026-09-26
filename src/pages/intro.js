// Intro sequence — ported from marquis_v2_1.html's runIntro(): the
// mountain-peaks mark draws in, a guide line cuts across it, "MARQUIS"
// fades in below, then the whole overlay fades away to reveal the app.
// Fully automatic — no click-to-wake step (that was the previous
// iteration's butler-seal interaction; the reference has none).
//
// RESILIENCE FIX: in the reference, onDone (which is what shows either
// onboarding or the dashboard) fires ONLY from the GSAP timeline's
// onComplete. If GSAP fails to load, or the timeline never completes
// (verified in earlier testing: a backgrounded tab suspends
// requestAnimationFrame, which GSAP's ticker depends on), onDone never
// fires and the app is permanently stuck behind the intro. This races
// the timeline's onComplete against a setTimeout fallback — same pattern
// proven necessary elsewhere in this project.

import { qs } from '../lib/dom.js';
import { skipMovement, EASE } from '../lib/motion.js';

const gsap = window.gsap;
const INTRO_FALLBACK_MS = 5000; // generous — the full sequence is ~3.5s

export function runIntro(onDone) {
  const intro = qs('#intro');
  const peaks = qs('#peaksPath');
  const guide = qs('#guideLine');
  const word = qs('#intro-word');

  // The intro plays once per browser session: reloading shouldn't make a
  // returning user sit through 3.5s again (a high-frequency action gets
  // no animation). Any click or key skips it.
  let seen = false;
  try { seen = sessionStorage.getItem('marquis_intro_seen') === '1'; sessionStorage.setItem('marquis_intro_seen', '1'); } catch (_) {}
  if (skipMovement() || seen) {
    intro.style.display = 'none';
    onDone();
    return;
  }

  let done = false;
  let tl = null;
  const finish = () => {
    if (done) return;
    done = true;
    try { tl?.kill(); } catch (_) {}
    intro.style.display = 'none';
    onDone();
  };
  intro.addEventListener('click', finish, { once: true });
  window.addEventListener('keydown', finish, { once: true });

  try {
    const len = peaks.getTotalLength();
    const glen = guide.getTotalLength();

    gsap.set(peaks, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 });
    gsap.set(guide, { strokeDasharray: glen, strokeDashoffset: glen, opacity: .9 });
    gsap.set(word, { opacity: 0, y: 6 });

    tl = gsap.timeline({ onComplete: finish });
    tl.to(peaks, { strokeDashoffset: 0, duration: 1.1, ease: EASE.standard })
      .to(guide, { strokeDashoffset: 0, duration: .5, ease: EASE.out }, '+=.15')
      .to(word, { opacity: 1, y: 0, duration: .5, ease: EASE.out }, '-=.1')
      .to(intro, { opacity: 0, duration: .3, ease: EASE.standard }, '+=.5')
      ;
  } catch (e) {
    console.warn('[intro] animation failed, revealing app directly:', e);
    finish();
    return;
  }

  setTimeout(finish, INTRO_FALLBACK_MS);
}
