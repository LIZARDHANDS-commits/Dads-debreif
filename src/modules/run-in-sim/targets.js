// The generic target shapes (spec, "Targets"; RS-2): sized in feet, placed on the real ground at the chosen place and
// turned to their own heading (Setup's Target heading; RS-12: the run-in heading never turns them, so a run-in can cross
// the bridge at any angle). Every size is an ESTIMATE chosen to look like the kind of thing, not any real one: no outside
// building or target data (RS-R8). Plain values only; world3d.js and view2d.js draw them, and pass.js judges a load
// against the bridge's deck with deckHit and deckMiss.
//
// sizeFt is the one size the user may type under More (the shape's main dimension); the rest scale with it.
// topFt: the height of its top above the ground, which the flyover's height is measured over. aimFt: the aim point's
// height above the ground (the bridge's deck); 0 is on the ground. The aim point is the local origin (0, 0).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const TARGETS = Object.freeze({
  stadium: Object.freeze({
    id: 'stadium', label: 'Stadium bowl', aimWords: 'the centre of the field',
    sizeFt: 800, // its length; 650 wide, 100 high, open in the middle (estimates)
    widthShare: 650 / 800, topShare: 100 / 800, aimShare: 0,
  }),
  bridge: Object.freeze({
    id: 'bridge', label: 'Bridge', aimWords: 'the middle of the deck',
    sizeFt: 1500, // the deck's length; 60 ft wide, 150 ft above the ground, on two towers 300 ft high (estimates)
    widthShare: 60 / 1500, topShare: 300 / 1500, aimShare: 150 / 1500,
  }),
  tower: Object.freeze({
    id: 'tower', label: 'Tower', aimWords: 'its foot',
    sizeFt: 300, // its height; 40 ft square (estimates)
    widthShare: 40 / 300, topShare: 1, aimShare: 0,
  }),
  range: Object.freeze({
    id: 'range', label: 'Range circle', aimWords: 'the centre',
    sizeFt: 200, // the outer ring's radius; rings at 50, 100 and 200 ft, flat, with a white centre (estimates)
    widthShare: 0, topShare: 0, aimShare: 0,
  }),
  dz: Object.freeze({
    id: 'dz', label: 'Drop zone', aimWords: 'the point of impact',
    sizeFt: 300, // a circle's radius, as the Debrief's drop zone default (DB-36; an estimate)
    widthShare: 0, topShare: 0, aimShare: 0,
  }),
});

export const TARGET_IDS = Object.freeze(Object.keys(TARGETS));
/** The shapes that have a heading of their own (the circles look the same at any heading). */
export const HAS_HEADING = Object.freeze(['stadium', 'bridge', 'tower']);
/** The bridge's deck is a slab this thick under its top, ft (an estimate, as world3d.js draws it). */
export const DECK_THICK_FT = 10;
/** The bridge's towers: this long along the deck and this much wider than it, ft, at a quarter of its length each side of the middle (estimates, as drawn). */
export const TOWER = Object.freeze({ alongFt: 24, widerFt: 20 });

/** The shape's sizes at a typed main size: { sizeFt, widthFt, topFt, aimFt }. */
export function targetSizes(id, sizeFt = TARGETS[id].sizeFt) {
  const t = TARGETS[id];
  return { sizeFt, widthFt: sizeFt * t.widthShare, topFt: sizeFt * t.topShare, aimFt: sizeFt * t.aimShare };
}

/** The shape's long axis (unit, x east y north) at a heading, compass degrees true. */
export function axisOf(headingDegT) {
  const r = ((90 - headingDegT) * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** A point in feet from the aim point as along and across the shape's long axis (across: to its left, +). */
function toTarget(headingDegT, x, y) {
  const a = axisOf(headingDegT);
  return { along: x * a.x + y * a.y, across: -x * a.y + y * a.x };
}

/**
 * The shape's footprint for a plan drawing, feet from the aim point: { polys: [[{ x, y }]], ellipses: [{ a, b }], rings:
 * [radius] } with the ellipses' a along the long axis (axis: axisOf(heading)).
 */
export function footprintOf(id, sizeFt, headingDegT) {
  const s = targetSizes(id, sizeFt);
  const a = axisOf(headingDegT);
  const at = (along, across) => ({ x: a.x * along - a.y * across, y: a.y * along + a.x * across });
  const rect = (c, l, w) => [at(c - l / 2, -w / 2), at(c + l / 2, -w / 2), at(c + l / 2, w / 2), at(c - l / 2, w / 2)];
  const out = { axis: a, polys: [], ellipses: [], rings: [] };
  if (id === 'bridge') {
    out.polys.push(rect(0, s.sizeFt, s.widthFt));
    for (const c of [-s.sizeFt / 4, s.sizeFt / 4]) out.polys.push(rect(c, TOWER.alongFt, s.widthFt + TOWER.widerFt));
  } else if (id === 'stadium') {
    out.ellipses.push({ a: s.sizeFt / 2, b: s.widthFt / 2 }, { a: s.sizeFt * 0.34, b: s.widthFt * 0.3 });
  } else if (id === 'tower') {
    out.polys.push(rect(0, s.widthFt, s.widthFt));
  } else if (id === 'range') {
    const k = s.sizeFt / 200;
    out.rings.push(50 * k, 100 * k, 200 * k);
  } else {
    out.rings.push(s.sizeFt);
  }
  return out;
}

/** Where the line p0 + s·d (s in feet) is inside |along| ≤ halfL, |across − c| ≤ halfW of a box about `along0`: [s0, s1] or null. */
function clipBox(headingDegT, p0, d, along0, halfL, halfW) {
  const q = toTarget(headingDegT, p0.x, p0.y);
  const a = axisOf(headingDegT);
  const dA = d.x * a.x + d.y * a.y;
  const dC = -d.x * a.y + d.y * a.x;
  let lo = -Infinity;
  let hi = Infinity;
  for (const [pos, rate, half] of [[q.along - along0, dA, halfL], [q.across, dC, halfW]]) {
    if (Math.abs(rate) < 1e-9) {
      if (Math.abs(pos) > half) return null;
      continue;
    }
    const s1 = (-half - pos) / rate;
    const s2 = (half - pos) / rate;
    lo = Math.max(lo, Math.min(s1, s2));
    hi = Math.min(hi, Math.max(s1, s2));
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Where the line p0 + s·d is inside an ellipse of semi-axes a (along) and b (across) about the aim point: [s0, s1] or null. */
function clipEllipse(headingDegT, p0, d, a, b) {
  const q = toTarget(headingDegT, p0.x, p0.y);
  const ax = axisOf(headingDegT);
  const dA = d.x * ax.x + d.y * ax.y;
  const dC = -d.x * ax.y + d.y * ax.x;
  const A = (dA * dA) / (a * a) + (dC * dC) / (b * b);
  const B = 2 * ((q.along * dA) / (a * a) + (q.across * dC) / (b * b));
  const C = (q.along * q.along) / (a * a) + (q.across * q.across) / (b * b) - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return null;
  const r = Math.sqrt(disc);
  return [(-B - r) / (2 * A), (-B + r) / (2 * A)];
}

/**
 * The shape cut along a line (RS-13's profile): the line p0 + s·d over the ground (d unit, s in feet), and the solid parts
 * it passes through as [{ from, to, bottomFt, topFt, words }] in s, heights above the target's ground. The bridge's deck
 * shows as wide as the line sees it at its crossing angle, its towers only where the line passes them.
 */
export function targetCut(id, sizeFt, headingDegT, p0, d) {
  const s = targetSizes(id, sizeFt);
  const out = [];
  const add = (span, bottomFt, topFt, words) => span && out.push({ from: span[0], to: span[1], bottomFt, topFt, words });
  if (id === 'bridge') {
    add(clipBox(headingDegT, p0, d, 0, s.sizeFt / 2, s.widthFt / 2), s.aimFt - DECK_THICK_FT, s.aimFt, 'deck');
    for (const c of [-s.sizeFt / 4, s.sizeFt / 4]) add(clipBox(headingDegT, p0, d, c, TOWER.alongFt / 2, (s.widthFt + TOWER.widerFt) / 2), 0, s.topFt, 'tower');
  } else if (id === 'tower') {
    add(clipBox(headingDegT, p0, d, 0, s.widthFt / 2, s.widthFt / 2), 0, s.topFt, 'tower');
  } else if (id === 'stadium') {
    const outer = clipEllipse(headingDegT, p0, d, s.sizeFt / 2, s.widthFt / 2);
    const hole = clipEllipse(headingDegT, p0, d, s.sizeFt * 0.34, s.widthFt * 0.3);
    if (outer && hole) {
      add([outer[0], hole[0]], 0, s.topFt, 'stand');
      add([hole[1], outer[1]], 0, s.topFt, 'stand');
    } else add(outer, 0, s.topFt, 'stand');
  }
  return out;
}

/** The bridge's deck as pass.js judges a load against it: { headingDegT, halfL, halfW, topMsl, bottomMsl }. */
export function deckOf(sizeFt, headingDegT, groundFt) {
  const s = targetSizes('bridge', sizeFt);
  return { headingDegT, halfL: s.sizeFt / 2, halfW: s.widthFt / 2, topMsl: groundFt + s.aimFt, bottomMsl: groundFt + s.aimFt - DECK_THICK_FT };
}

const onDeck = (deck, q) => {
  const t = toTarget(deck.headingDegT, q.x, q.y);
  return Math.abs(t.along) <= deck.halfL && Math.abs(t.across) <= deck.halfW;
};

/**
 * Where a falling load first meets the bridge's deck (RS-12): onto its top, or into its edge between the top and the
 * slab's underside. A load that comes into the footprint below the slab has gone under the bridge and is not stopped.
 * path: the fall, [{ t, x, y, z }] at every step. Returns { t, x, y, z, edge } or null.
 */
export function deckHit(path, deck) {
  const lerpAt = (p0, p1, f) => ({ t: p0.t + (p1.t - p0.t) * f, x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, z: p0.z + (p1.z - p0.z) * f });
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    if (p1.z > deck.topMsl || p0.z < deck.bottomMsl) continue; // still above the deck, or already below it
    // Onto the top: where the step comes down through the deck's height, if that is over the deck.
    if (p0.z > deck.topMsl) {
      const top = lerpAt(p0, p1, (p0.z - deck.topMsl) / (p0.z - p1.z));
      if (onDeck(deck, top)) return { ...top, z: deck.topMsl, edge: false };
    }
    // Into the edge: where the step comes into the footprint, if it is then between the top and the slab's underside.
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (len < 1e-9) continue;
    const span = clipBox(deck.headingDegT, p0, { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }, 0, deck.halfL, deck.halfW);
    if (!span || span[1] < 0 || span[0] > len) continue;
    const q = lerpAt(p0, p1, Math.max(0, span[0]) / len);
    if (q.z <= deck.topMsl && q.z >= deck.bottomMsl) return { ...q, edge: true };
  }
  return null;
}

/**
 * How a load that missed the deck missed it (RS-12), as a pilot reads it off the run-in: where it came down through the
 * deck's height, and how far it was from the deck along the run-in (u: "short" or "long"), or, when a line along the
 * run-in through that point never meets the deck (past its end), across it (r: "left" or "right" of the deck). Returns
 * { ft, words, at } or null when it never came down through the deck's height.
 */
export function deckMiss(path, deck, u, r) {
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    if (!(p0.z > deck.topMsl && p1.z <= deck.topMsl)) continue;
    const f = (p0.z - deck.topMsl) / (p0.z - p1.z);
    const at = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
    const gap = (d, ahead, behind) => {
      const span = clipBox(deck.headingDegT, at, d, 0, deck.halfL, deck.halfW);
      if (!span) return null;
      if (span[0] > 0) return { ft: span[0], words: ahead }; // the deck lies further along d
      if (span[1] < 0) return { ft: -span[1], words: behind };
      return { ft: 0, words: ahead };
    };
    const miss = gap(u, 'short', 'long') ?? gap(r, 'left', 'right');
    if (miss) return { ...miss, at };
    // Past a corner: the straight-line distance to the deck, named by its larger part.
    const a = axisOf(deck.headingDegT);
    const t = toTarget(deck.headingDegT, at.x, at.y);
    const along = clamp(t.along, -deck.halfL, deck.halfL);
    const across = clamp(t.across, -deck.halfW, deck.halfW);
    const dx = at.x - (a.x * along - a.y * across);
    const dy = at.y - (a.y * along + a.x * across);
    const du = dx * u.x + dy * u.y;
    const dr = dx * r.x + dy * r.y;
    return { ft: Math.hypot(dx, dy), words: Math.abs(du) >= Math.abs(dr) ? (du > 0 ? 'long' : 'short') : (dr > 0 ? 'right' : 'left'), at };
  }
  return null;
}
