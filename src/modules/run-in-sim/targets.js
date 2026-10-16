// The generic target shapes (spec, "Targets"; RS-2): sized in feet, placed on the real ground at the chosen place and
// turned to the run-in heading (or a heading set under More). Every size is an ESTIMATE chosen to look like the kind of
// thing, not any real one: no outside building or target data (RS-R8). Plain values only; world3d.js draws them.
//
// sizeFt is the one size the user may type under More (the shape's main dimension); the rest scale with it.
// topFt: the height of its top above the ground, which the flyover's height is measured over. aimFt: the aim point's
// height above the ground (the bridge's deck); 0 is on the ground. The aim point is the local origin (0, 0).

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

/** The shape's sizes at a typed main size: { sizeFt, widthFt, topFt, aimFt }. */
export function targetSizes(id, sizeFt = TARGETS[id].sizeFt) {
  const t = TARGETS[id];
  return { sizeFt, widthFt: sizeFt * t.widthShare, topFt: sizeFt * t.topShare, aimFt: sizeFt * t.aimShare };
}

/**
 * The surface a load stops on near the target, ft above the ground: the bridge's deck over its footprint (so a load aimed
 * at the deck is judged where it meets the deck), else 0. x, y: feet from the aim point; headingDegT: the shape's long
 * axis, compass degrees true.
 */
export function targetSurfaceFt(id, sizeFt, headingDegT, x, y) {
  if (id !== 'bridge') return 0;
  const s = targetSizes(id, sizeFt);
  const r = ((90 - headingDegT) * Math.PI) / 180; // the long axis as a math angle
  const along = x * Math.cos(r) + y * Math.sin(r);
  const across = -x * Math.sin(r) + y * Math.cos(r);
  return Math.abs(along) <= s.sizeFt / 2 && Math.abs(across) <= s.widthFt / 2 ? s.aimFt : 0;
}
