// The Living Canvas, ambient field only (rebuild brief §5). Pure mood and
// texture: it never carries information, never loops a visible pattern,
// never pulses on a timer. A screenshot at any moment reads as a still.
//
// States: idle -> processing (Alfred thinking) -> deliver (one pulse) ->
// idle, plus `workspace` (Alfred is making something: dimmer, slower,
// still breathing underneath). Business standing tints the room via two
// overlay divs (body[data-standing]), never announced.

const COUNT = 200;
const FRAME_MS = 1000 / 60;
const PROCESS_SPEED = 0.02;        // px/frame target while processing
const PROCESS_EASE_MS = 400;
const PULL = 0.0004;               // centripetal pull while processing
const PULSE_MAG = 0.9;
const PULSE_FRAMES = 90;
const MOUSE_RADIUS = 120;
const MOUSE_LAG_S = 1.5;
const MOUSE_FADE_MS = 2000;

const rand = (a, b) => a + Math.random() * (b - a);

let canvas, ctx, w = 0, h = 0, dpr = 1;
let particles = [];
let presence = null;               // Alfred's own particle while processing
let state = 'idle';
let speedScale = 1, speedFrom = 1, speedTo = 1, speedT0 = 0;
let alphaScale = 1;
let pullStrength = 0;
let pulseFrame = -1;
let reduced = false;
const mouse = { x: 0, y: 0, lx: 0, ly: 0, inside: false, influence: 0, seen: false };
let last = 0;
let running = false;

function size() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth; h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seed() {
  particles = Array.from({ length: COUNT }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = rand(0.08, 0.12);
    return { x: rand(0, w), y: rand(0, h), bvx: Math.cos(a) * s, bvy: Math.sin(a) * s, ex: 0, ey: 0, o: rand(0.03, 0.10), r: rand(0.5, 1.2) };
  });
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function targetSpeed(s) {
  // Base speed is ~0.10 px/frame; express the processing target as a scale.
  if (s === 'processing') return PROCESS_SPEED / 0.10;
  if (s === 'workspace') return 0.35;
  return 1;
}

function draw() {
  ctx.clearRect(0, 0, w, h);
  for (const p of particles) {
    ctx.globalAlpha = p.o * alphaScale;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  if (presence) {
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(presence.x, presence.y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function step(now) {
  if (!running) return;
  const dtMs = last ? Math.min(now - last, 64) : FRAME_MS;
  last = now;
  const f = dtMs / FRAME_MS;                       // frames elapsed at 60fps
  const cx = w / 2, cy = h / 2;

  // Speed eases toward the state's target (400ms into processing).
  const k = Math.min(1, (now - speedT0) / PROCESS_EASE_MS);
  speedScale = speedFrom + (speedTo - speedFrom) * easeOut(k);
  pullStrength += ((state === 'processing' ? 1 : 0) - pullStrength) * Math.min(1, (dtMs / PROCESS_EASE_MS) * 2);
  const alphaTarget = state === 'workspace' ? 0.45 : 1;
  alphaScale += (alphaTarget - alphaScale) * Math.min(1, 0.02 * f);

  // Mouse presence: a 1.5s exponentially-lagged position, fading in/out.
  const lagK = 1 - Math.exp(-(dtMs / 1000) / MOUSE_LAG_S);
  mouse.lx += (mouse.x - mouse.lx) * lagK;
  mouse.ly += (mouse.y - mouse.ly) * lagK;
  const infTarget = mouse.inside ? 1 : 0;
  const infStep = dtMs / MOUSE_FADE_MS;
  mouse.influence = infTarget > mouse.influence ? Math.min(1, mouse.influence + infStep) : Math.max(0, mouse.influence - infStep);

  const pulsing = pulseFrame >= 0;
  const pulse = pulsing ? PULSE_MAG * (1 - pulseFrame / PULSE_FRAMES) : 0;

  for (const p of particles) {
    let vx = p.bvx * speedScale, vy = p.bvy * speedScale;

    // Weak pull toward the centre while Alfred thinks. Applied as a drift
    // (not accumulated), so the field leans inward without collapsing into
    // a visible cluster that outlives the thought.
    if (pullStrength > 0) { vx += (cx - p.x) * PULL * pullStrength; vy += (cy - p.y) * PULL * pullStrength; }

    if (mouse.influence > 0) {
      const dx = mouse.lx - p.x, dy = mouse.ly - p.y;
      const d = Math.hypot(dx, dy);
      if (d < MOUSE_RADIUS) {
        const m = 1 + 0.4 * mouse.influence;
        vx = vx * m + (dx / (d || 1)) * 0.03 * mouse.influence;
        vy = vy * m + (dy / (d || 1)) * 0.03 * mouse.influence;
      }
    }

    if (pulse > 0) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      vx += (dx / d) * pulse; vy += (dy / d) * pulse;
    }

    p.x += vx * f; p.y += vy * f;
    // Wrap, never bounce.
    if (p.x < -2) p.x += w + 4; else if (p.x > w + 2) p.x -= w + 4;
    if (p.y < -2) p.y += h + 4; else if (p.y > h + 2) p.y -= h + 4;
  }

  if (pulsing) { pulseFrame += f; if (pulseFrame >= PULSE_FRAMES) pulseFrame = -1; }
  if (presence) {
    presence.x += presence.vx * f; presence.y += presence.vy * f;
    if (presence.x < -10 || presence.x > w + 10 || presence.y < -10 || presence.y > h + 10) spawnPresence();
  }

  draw();
  requestAnimationFrame(step);
}

function spawnPresence() {
  const fromLeft = Math.random() < 0.5;
  const y = rand(h * 0.3, h * 0.7);
  presence = { x: fromLeft ? -4 : w + 4, y, vx: (fromLeft ? 1 : -1) * 0.22, vy: rand(-0.03, 0.03) };
}

function setSpeedTarget(next) {
  speedFrom = speedScale; speedTo = targetSpeed(next); speedT0 = performance.now();
}

/** Mount the field once. Safe to call when canvas is unsupported. */
export function initField() {
  canvas = document.getElementById('field');
  ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  size(); seed();
  ctx.fillStyle = '#fff';
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  reduced = Boolean(mq?.matches);
  mq?.addEventListener?.('change', (e) => { reduced = e.matches; reduced ? stop() : start(); });

  window.addEventListener('resize', () => { size(); ctx.fillStyle = '#fff'; if (reduced) draw(); });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (!mouse.seen) { mouse.lx = e.clientX; mouse.ly = e.clientY; mouse.seen = true; }
  }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('blur', () => { mouse.inside = false; });

  reduced ? draw() : start();
}

function start() { if (running || !ctx) return; running = true; last = 0; requestAnimationFrame(step); }
function stop() { running = false; draw(); }

/** idle | processing | workspace */
export function setFieldState(next) {
  if (!ctx || next === state) return;
  const was = state;
  state = next;
  setSpeedTarget(next);
  if (next === 'processing' && !reduced) spawnPresence();
  if (was === 'processing' && next !== 'processing') presence = null;
  if (reduced) draw();
}

/** Alfred has delivered a response: Alfred's particle vanishes, one pulse. */
export function fieldDeliver() {
  if (!ctx) return;
  presence = null;
  if (state === 'processing') setFieldState('idle');
  if (!reduced) pulseFrame = 0;
}

/** Business standing tints the room. null clears it. */
export function setStanding(standing) {
  if (standing) document.body.dataset.standing = standing;
  else delete document.body.dataset.standing;
}
