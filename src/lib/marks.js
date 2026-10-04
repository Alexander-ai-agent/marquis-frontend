// The two marks (rebuild brief §7), drawn once and reused.
//
// MARQUIS seal: a pointy-top hexagon carrying the old summit line and the
// guide rule from the first MARQUIS mark, so the brand keeps its lineage.
// Decorative only.
//
// Alfred's glyph: the seal's hexagon drawn tall and narrow, an upright
// figure in the same geometry (same 1px gold stroke), with one point at
// its centre. That point and the stroke are what move while he speaks.

const STROKE = 'stroke="currentColor" stroke-width="1" fill="none" vector-effect="non-scaling-stroke" stroke-linejoin="miter"';

export const SEAL_SVG = `<svg class="seal-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <polygon points="24,4 41.32,14 41.32,34 24,44 6.68,34 6.68,14" ${STROKE}/>
  <polyline points="14,30 19.5,21 24,27 28.5,18.5 34,30" ${STROKE}/>
  <line x1="12" y1="33.5" x2="36" y2="33.5" ${STROKE} opacity=".55"/>
</svg>`;

export const GLYPH_SVG = `<svg class="glyph-svg" viewBox="0 0 48 64" aria-hidden="true" focusable="false">
  <polygon class="glyph-frame" points="24,3 34,14 34,50 24,61 14,50 14,14" ${STROKE}/>
  <line class="glyph-brow" x1="19" y1="22" x2="29" y2="22" ${STROKE} opacity=".6"/>
  <circle class="glyph-core" cx="24" cy="33" r="1.7" fill="currentColor"/>
</svg>`;

/** Fill every [data-mark="seal"|"glyph"] placeholder in the document. */
export function paintMarks(root = document) {
  root.querySelectorAll('[data-mark="seal"]').forEach((el) => { el.innerHTML = SEAL_SVG; });
  root.querySelectorAll('[data-mark="glyph"]').forEach((el) => { el.innerHTML = GLYPH_SVG; });
}
