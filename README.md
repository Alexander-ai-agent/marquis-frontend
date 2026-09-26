# MARQUIS Frontend

## Sep 24 redesign: what changed

Base stays marquis_v2_1.html (silver/ink, soft radii, one matte grain);
everything in the STRYDE/ spec files (MARQUIS_product.md incl. the Sep 24
"Identity & Positioning" and "Living Canvas" sections, MARQUIS_design.md,
MARQUIS_animations.md, ALFRED.md, MARQUIS_agents.md) was audited against it
and applied:

- **Butler page (route id `conversation`, sidebar label "Butler")**: the
  Living Canvas beside the thread. Idle = the four agents as visual
  presences (Performance: live ECG trace; Pathway: route with branches;
  Blocker: 7-day heat, crimson only where it hasn't cooled; Enhancement:
  coverage radar). When the butler's reply carries a `visualization`
  payload, the canvas swaps to it using the page-transition motion; plain
  turns return it to the four. Charts are **bklit-ui** (React), built from
  `../charts` into `vendor/marquis-canvas/` (see below).
- **Communication modes**: Speak (voice in, voice out; default) or Type
  (text in, voice out), switchable in the conversation bar and Settings.
  Browsers without speech recognition fall back to Type.
- **Progress**: rebuilt as the spec's vertical timeline (filled gold /
  2s-pulsing gold / faint nodes, gold lines through finished phases),
  estimate-vs-actual per phase set large, two-step "mark complete", node
  completion animation (#4) and the milestone moment (#8).
- **Gold, once per screen**: dashboard ring; the butler's mark only while
  it speaks; the Progress timeline; the final "Enter Marquis"; the auth
  submit; the active nav item. Chrome silver is no longer used for text or
  borders. Crimson (#8B1A1A) only for alerts (over-estimate, the hot cell).
- **Motion**: exact MARQUIS_animations.md curves via GSAP CustomEase
  (`vendor/CustomEase.min.js`); zero ease-in anywhere (exits use the
  standard curve); sidebar, page transition, response, card entrance,
  CTA, gold, completion and milestone timings match the spec.
- **Background** `#030202` (#020202 + the "microscopic warm tint"); the
  v2_1 vignette was removed (it rendered as a visible ring on near-black).
- **Type/radii/spacing tokens** from MARQUIS_design.md in `tokens.css`.
- **Copy** in the butler's voice everywhere; failures are honest and
  in-voice, and the butler never fabricates a reply when the backend fails.
- **Phones**: hamburger + overlay navigation (there was none), responsive
  rules moved to `responsive.css` (loaded last; they were being overridden).
- **Onboarding**: "Something else" option, validation, questions and the
  pathway reveal come from the butler (`/onboarding/*`) in real mode.
- **Dashboard**: live greeting and clock, card entrance and count-up,
  full agent names, and the backend contract actually matches now.

## Rebuilding the Living Canvas bundle

The canvas and the Analytics charts are React + bklit-ui, built once into
static files the vanilla app loads with a plain `<script>`:

```bash
cd ../charts
npm install
npm run build:canvas     # -> ../frontend/vendor/marquis-canvas/{marquis-canvas.js,.css}
```

Source: `charts/src/canvas/` (entry.tsx exposes `window.MarquisCanvas.mount()`
and `.mountPresence()`). If the bundle fails to load, the Butler page keeps a
static fallback and the conversation works regardless.

A premium, quiet-luxury frontend for MARQUIS — the AI executive advisor
for founders. Vanilla HTML/CSS/JS + GSAP, ported pixel-for-pixel from the
`marquis_v2_1.html` single-file reference into a real, multi-file project
(v1 of this build used a different gold/carbon-fiber design — abandoned
and fully replaced by this port; nothing from it remains). Zero build
step — no npm install required to run it.

## Why vanilla JS + GSAP (not React)

Decided with the user before building (see conversation): the reference's
imperative DOM logic already worked; porting it to React would have been
a rewrite with real behavior-drift risk, not a restructure. This design's
palette and typography are bespoke CSS either way — Tailwind buys little
here.

## Running it locally

ES modules (`<script type="module">`) require an actual HTTP server —
opening `index.html` via `file://` will fail silently (CORS blocks module
imports from the filesystem). Any static file server works:

```bash
python -m http.server 4173
# or: npx serve .
```

Then open `http://localhost:4173`. If you're iterating rapidly during
development, prefer a fresh, never-before-visited port over reusing one —
browsers will happily keep serving a stale cached copy of an unchanged
relative-import URL (`/src/pages/foo.js`) even after the file on disk has
changed and even after a hard reload.

## Project structure

```
frontend/
  index.html              Entry point — links all CSS, loads vendor/gsap.min.js,
                           loads src/main.js as a module
  vendor/
    gsap.min.js            Bundled locally (not a CDN) — see Resilience notes
  src/
    styles/
      tokens.css            Design tokens (void/surface/hair/ink/silver/warn),
                             .grain + .vignette atmosphere, .card, ::selection
      layout.css             .app / .page shell, sidebar, hover-strip
      intro.css               Intro overlay (mountain-peaks mark + wordmark)
      auth.css                 Login/signup — NOT in the reference (see
                                "What's weak" below), restyled to match tokens
      onboarding.css, dashboard.css, conversation.css, progress.css,
      analytics.css, settings.css   One file per screen, ported verbatim
    lib/
      dom.js                qs/qsa/escapeHtml helpers
      validate.js           Explicit JS validation (see Resilience notes)
      state.js               Shared app state + localStorage persistence
      api.js                  Backend client, DEMO_MODE, fetchWithTimeout
      motion.js                Central animation helper (see Resilience notes)
      router.js                Page navigation (goToPage, cross-fade timing)
    pages/
      intro.js                 Intro sequence (mark draw-in → wordmark → app)
      auth.js, onboarding.js, dashboard.js, conversation.js,
      progress.js, analytics.js, settings.js   One module per screen
    main.js                 Boot sequence — intro always runs first, then
                             routes to auth or straight to the app
  tests/
    marquis.spec.js          Playwright (see Testing)
```

## Connecting to the real backend

Everything currently runs in **DEMO_MODE** (see below). To connect to the
real deployed backend:

1. Open `src/lib/api.js`.
2. Set `const FORCE_DEMO = false;`.
3. Confirm `API_BASE` points at the correct Railway URL (currently
   `https://marquis-production.up.railway.app/api/v1/marquis`).

The backend contract this file implements: `POST /auth/login`,
`POST /auth/signup`, `GET /dashboard`, `POST /conversation` (now with
`visualization`), `GET /phases`, `POST /phases/<id>/complete`,
`GET /agents/signals`, `POST /onboarding/questions`,
`POST /onboarding/pathway`. See `backend/README.md` for shapes. The four
new endpoints must be deployed to Railway before switching DEMO_MODE off.

## Token storage

JWT + user are stored in `localStorage` (see `lib/state.js`), matching
what the backend already returns (`{token, user_id, name}` in the response
body, not a cookie). This is readable by any injected script if an XSS
bug exists elsewhere in the app — the more secure alternative (httpOnly
cookie) needs backend changes that were out of scope for this pass.

## Resilience notes (read this before touching lib/motion.js)

(Items 3 and 5 describe the pre-Sep 24 terrain and hand-drawn analytics,
since replaced by the vertical timeline and bklit charts; the pattern
still applies to everything animated.)

The reference file this project is ported from makes `.app` and every
`.page` invisible by default (`opacity:0`) and relies entirely on a GSAP
animation to ever set them visible. Confirmed directly, live, against the
reference itself during verification: in a real browser session its own
GSAP ticker can stall (backgrounded/inactive tab, throttling — whatever
the cause) and when it does, `.page.active` never gets its opacity
restored — the reference sits permanently behind its own intro overlay,
`.app` stuck at `opacity:0`. This project audits for and fixes every
instance of that pattern instead of reproducing it:

1. **Every animated element is visible by CSS default; GSAP only
   enhances.** `.app{opacity:1}` and `.page.active{opacity:1}` are plain,
   synchronous CSS/class-toggle facts, not animation outcomes. `reveal()`
   and `drawStroke()` (in `lib/motion.js`) only ever layer an entrance
   *on top of* an element that is already correct without them.

2. **`gsap.from()`'s `immediateRender` sets an inline `opacity:0` even on
   elements that are already `opacity:1` by CSS default.** Normally
   invisible — GSAP animates it back within the tween's duration. But if
   GSAP's ticker (`requestAnimationFrame`-based) stalls, that inline
   `opacity:0` never gets animated away and permanently overrides the CSS
   default. `reveal()` schedules a `setTimeout` (not rAF-gated) safety net
   that force-clears it if this happens. The check is
   `opacity < 0.99`, not `=== 0` — a stalled stagger can freeze an
   element at a *partial* opacity, not just zero (verified in testing: one
   line of a 4-line stagger froze at `0.45` while its siblings finished
   normally).

3. **The same pattern, for stroke-dash line draws.** `drawStroke()` is the
   `strokeDashoffset` equivalent of `reveal()`: it sets the line to fully
   drawn (`dashoffset:0`) unconditionally *before* any GSAP call, then
   layers the draw-in animation on top via `fromTo()`, with the same
   `setTimeout` safety net. Used for the intro mark, the progress terrain
   line, and the analytics heartbeat/river paths — all of which used to
   ship hidden (`dashoffset` at full length) in their base SVG markup,
   exactly the "invisible unless GSAP succeeds" bug this project audits
   for. (Directly confirmed against the live reference during
   verification: its heartbeat line's `strokeDashoffset` was stuck at
   `840px` of `851px` — i.e. almost entirely undrawn — because its raw,
   un-audited `gsap.to()` draw-in stalled in exactly this way.)

4. **Anything gated behind a tween's `onComplete` got the same fix.**
   `pages/intro.js`'s wake→app transition used to run only inside
   `onComplete` — if that never fires, the app hangs forever behind the
   intro (this is the exact live failure observed in the reference, see
   above). It now races the timeline's `onComplete` against a `setTimeout`
   fallback (`INTRO_FALLBACK_MS`), whichever fires first wins, guarded so
   it only runs once. A real bug from this exact class was found and
   fixed during this port: `main.js` used to skip the intro's callback
   entirely on the "no auth token" path, permanently trapping the
   (correctly opaque, full-screen) intro overlay in front of the auth
   screen. Fixed by always running the intro first and branching to
   `showAuth()` vs. the authenticated path from its callback.

5. **`analytics.js`'s heat-map cells** used to ship at `opacity:0` in
   their generated markup, animated to their real value via `gsap.to()`.
   Fixed the same way: markup now carries the correct final opacity
   directly, and the fade-in is a `gsap.from()` enhancement with its own
   safety net.

6. **GSAP is bundled locally** (`vendor/gsap.min.js`), not loaded from a
   CDN. `lib/motion.js` checks `window.gsap` and every animation call
   degrades to instant/CSS-only if it's missing. Verified end-to-end with
   `vendor/gsap.min.js` removed entirely: every screen (intro → auth →
   onboarding → dashboard → all 5 nav pages) still rendered correctly and
   instantly, with no stuck overlays and no invisible content.

7. **Forms use `novalidate` + explicit JS validation** (`lib/validate.js`).

8. **`fetchWithTimeout`** (`lib/api.js`) wraps every backend call with an
   `AbortController`-based timeout (12s).

9. **`DEMO_MODE`** (`lib/api.js`) lets the entire frontend, including
   auth, be exercised with realistic canned data and zero backend
   dependency. Flip `FORCE_DEMO` to `false` to point at the real API.

## Testing

`tests/marquis.spec.js` covers the redesign end to end (7 tests: fresh
visitor through validated onboarding to dashboard; every page visible with
content; butler reply in paragraphs + canvas view + return; phase
completion with confirm + milestone; settings mode sync + sign out; GSAP
and the chart bundle both blocked; phone overflow + hamburger).

```bash
npm install
npx playwright install chromium
npm test
```

## What's weak / worth another pass

- **The idle presences show demo data in DEMO_MODE.** With the backend on,
  they read `/agents/signals`; the Blocker heat uses the detector's own
  recurring-keyword signal, which is crude (a topic is a repeated word).
- **Voice** (speech recognition + synthesis) can't be exercised in a
  headless browser; the logic was reviewed, not heard. Try Speak mode in
  Chrome.
- **The type scale** is applied to headings, body, labels and data; a few
  sizes outside it remain for mono captions and chart labels (10-11px).
- **The dashboard ring** is a hand-drawn SVG progress ring, not a bklit
  chart. It's an indicator rather than a data chart, and keeping it plain
  means the dashboard doesn't depend on the chart bundle.
- **The Pathway presence** uses transparent "ballast" flows so bklit's
  sankey draws thin channels rather than blocks; on narrow widths the
  last two labels crowd.
- **Backend changes are local**: redeploy to Railway for the new
  endpoints; the Railway hang fix still needs confirming against production.
