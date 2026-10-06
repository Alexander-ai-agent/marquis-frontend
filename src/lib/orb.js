// Alfred's presence: a sphere of silk light. Ribbons of champagne, gold,
// amber and oxblood drift inside a glass orb; when he speaks they swell
// with the loudness of his voice and cross one another, brightening where
// they meet (additive light); when he thinks they turn faster, as if
// weighing something. Canvas 2D, no dependencies, paused when hidden.

import { prefersReduced } from './motion.js';

const HUES = [
  [243, 223, 168], // champagne
  [232, 184, 75],  // gold
  [201, 130, 43],  // amber
  [150, 52, 34],   // oxblood
  [233, 230, 224], // ivory
];
const RIBBONS = HUES.map((rgb, i) => ({
  rgb,
  tilt: i * 1.257,
  dir: i % 2 ? -1 : 1,
  speed: 0.75 + i * 0.13,
  seed: 17.3 * (i + 1),
  spread: 0.12 + 0.05 * (i % 2),
}));

/* Smooth 2D gradient (Perlin) noise: organic motion that never repeats,
   unlike sums of sine waves, which visibly loop and line up. */
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 1337;
  for (let i = 255; i > 0; i -= 1) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return Uint8Array.from([...p, ...p]);
})();
const GRADS = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function noise(x, y) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const g = (ix, iy, dx, dy) => { const v = GRADS[PERM[ix + PERM[iy]] & 7]; return v[0] * dx + v[1] * dy; };
  const u = fade(xf), v = fade(yf);
  const a = g(xi, yi, xf, yf) + u * (g(xi + 1, yi, xf - 1, yf) - g(xi, yi, xf, yf));
  const b = g(xi, yi + 1, xf, yf - 1) + u * (g(xi + 1, yi + 1, xf - 1, yf - 1) - g(xi, yi + 1, xf, yf - 1));
  return a + v * (b - a); // roughly -1..1
}
const fbm = (x, y) => noise(x, y) * 0.68 + noise(x * 2.07 + 31.7, y * 1.93 + 4.1) * 0.32;
const FILAMENTS = 7;
const ENERGY = { idle: 0.28, thinking: 0.62, speaking: 0.5 };
const SPIN = { idle: 0.16, thinking: 0.85, speaking: 0.3 };

export function createOrb(canvas) {
  const ctx = canvas.getContext('2d');
  // The silk is drawn on its own layer, then laid down twice: blurred for
  // the glow, sharp for the filaments.
  const silk = document.createElement('canvas');
  const sctx = silk.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let mode = 'idle';
  let level = 0, levelTarget = 0, energy = ENERGY.idle, spin = 0, t = 0;
  let last = performance.now(), raf = 0, running = true;

  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    canvas.width = w; canvas.height = h;
    silk.width = w; silk.height = h;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  /** Points of filament f of ribbon r, in the ribbon's own frame. */
  function filament(r, R, f) {
    const mid = (FILAMENTS - 1) / 2;
    const off = (f - mid) / mid;
    const tt = t * r.speed;
    // each ribbon's reach swells and settles on its own, unpredictably
    const reach = 0.65 + 0.7 * (0.5 + 0.5 * noise(tt * 0.18, r.seed + 3.3));
    const amp = R * (0.55 + 0.35 * energy + 0.6 * level) * reach;
    const pts = [];
    for (let x = -R * 1.1; x <= R * 1.1 + 0.01; x += R / 26) {
      const u = x / R;
      const envelope = 0.4 + 0.6 * Math.max(0, 1 - u * u * 0.55);
      const crest = fbm(u * 0.85 + r.seed, tt * 0.22);
      const ripple = noise(u * 2.6 + r.seed * 2, tt * 0.55 + f * 0.11) * (0.25 + 1.1 * level);
      const fan = off * R * r.spread * (0.55 + 0.9 * (0.5 + 0.5 * noise(u * 1.4 + r.seed + f * 0.07, tt * 0.3)));
      pts.push([x, (crest * amp + ripple * R * 0.09) * envelope + fan]);
    }
    return pts;
  }

  function ribbon(r, R) {
    const [cr, cg, cb] = r.rgb;
    const strands = Array.from({ length: FILAMENTS }, (_, f) => filament(r, R, f));
    // the sheet between the outermost strands
    const top = strands[0], bottom = strands[FILAMENTS - 1];
    sctx.beginPath();
    top.forEach(([x, y], i) => (i ? sctx.lineTo(x, y) : sctx.moveTo(x, y)));
    for (let i = bottom.length - 1; i >= 0; i -= 1) sctx.lineTo(bottom[i][0], bottom[i][1]);
    sctx.closePath();
    sctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.05 + 0.07 * energy + 0.1 * level).toFixed(3)})`;
    sctx.fill();
    // the strands themselves
    strands.forEach((pts, f) => {
      const edge = Math.abs(f - (FILAMENTS - 1) / 2) / ((FILAMENTS - 1) / 2);
      sctx.beginPath();
      pts.forEach(([x, y], i) => (i ? sctx.lineTo(x, y) : sctx.moveTo(x, y)));
      sctx.strokeStyle = `rgba(${cr},${cg},${cb},${((0.22 + 0.3 * energy + 0.35 * level) * (1 - edge * 0.55)).toFixed(3)})`;
      sctx.lineWidth = (edge < 0.2 ? 1.7 : 0.9) * dpr;
      sctx.stroke();
    });
  }

  function draw() {
    const cx = w / 2, cy = h / 2;
    const breathe = 1 + Math.sin(t * (mode === 'thinking' ? 2.4 : 1.1)) * 0.012 + level * 0.025;
    const R = Math.min(w, h) * 0.4 * breathe;
    ctx.clearRect(0, 0, w, h);

    // halo, outside the glass
    const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.25);
    halo.addColorStop(0, `rgba(232,184,75,${(0.1 + 0.16 * energy + 0.3 * level).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(232,184,75,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    // the body: dark glass, warm low in the core
    const body = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R);
    body.addColorStop(0, 'rgba(58,34,16,1)');
    body.addColorStop(0.65, 'rgba(16,10,7,1)');
    body.addColorStop(1, 'rgba(6,4,3,1)');
    ctx.fillStyle = body;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // silk: additive, so crossings flare; then a soft glow of itself
    sctx.clearRect(0, 0, w, h);
    sctx.globalCompositeOperation = 'lighter';
    RIBBONS.forEach((r) => {
      sctx.save();
      sctx.translate(cx, cy);
      // the angle wanders too, so ribbons drift into and across each other
      sctx.rotate(r.tilt + spin * r.dir * 0.35 + noise(t * 0.05 * r.speed, r.seed + 9.1) * 2.4);
      ribbon(r, R);
      sctx.restore();
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${Math.round(R * 0.06)}px)`;
    ctx.globalAlpha = 0.85 + 0.15 * level;
    ctx.drawImage(silk, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.drawImage(silk, 0, 0);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
    core.addColorStop(0, `rgba(243,223,168,${(0.05 + 0.18 * level).toFixed(3)})`);
    core.addColorStop(1, 'rgba(243,223,168,0)');
    ctx.fillStyle = core;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'source-over';

    // fresnel rim and a glint, so it reads as glass
    const rim = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
    rim.addColorStop(0, 'rgba(243,223,168,0)');
    rim.addColorStop(1, `rgba(243,223,168,${(0.22 + 0.2 * energy).toFixed(3)})`);
    ctx.fillStyle = rim;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const glint = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.42);
    glint.addColorStop(0, 'rgba(255,248,230,0.16)');
    glint.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = glint;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(243,223,168,${(0.35 + 0.3 * level).toFixed(3)})`;
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const slow = prefersReduced ? 0.15 : 1;
    level += (levelTarget - level) * 0.22;
    levelTarget *= 0.9; // word pulses decay; a live analyser keeps it topped up
    energy += (ENERGY[mode] - energy) * 0.04;
    spin += dt * SPIN[mode] * slow;
    // his voice quickens the current: the louder, the faster the silk moves
    t += dt * slow * (1 + level * 2.2 + (mode === 'thinking' ? 0.8 : 0));
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** 'idle' | 'thinking' | 'speaking' */
    setMode(next) { if (ENERGY[next] !== undefined) mode = next; },
    /** Live loudness 0-1 (from the voice's analyser). */
    setLevel(v) { levelTarget = Math.max(levelTarget, Math.min(1, v)); },
    /** A single word's weight, when there is no analyser. */
    pulse(v = 0.6) { levelTarget = Math.max(levelTarget, Math.min(1, v)); },
    destroy() { running = false; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
