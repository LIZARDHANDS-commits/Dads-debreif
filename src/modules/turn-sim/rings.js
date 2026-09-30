// The NM rings layer (task 12c): circles round Lead a whole number of nautical miles out, to read distances off the picture.
import { FT_PER_NM } from '../../core/units.js';

/** The steps between rings, in NM: the first that keeps the rings a fair way apart on screen is used. */
export const RING_STEPS_NM = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500]);
/** Colours on the picture's #071018: the line is 4.5:1 and the label 5.7:1 against it, so both can be seen (tests pin at least 3:1 and 4.5:1). */
export const RING_STROKE = '#4f7fa8';
export const RING_LABEL = '#6f8fae';
const MIN_GAP_PX = 40;
const MAX_RINGS = 12;

/**
 * The radii, in NM, of the rings to draw: every `step` NM out to `reachFt` (the farthest the picture shows from Lead).
 *
 * @param {{ pxPerFt: number, reachFt: number }} view  the zoom (CSS px per foot) and the distance to the far corner of the picture
 * @returns {number[]}
 */
export function ringsNm({ pxPerFt, reachFt }) {
  if (!(pxPerFt > 0) || !(reachFt > 0) || !Number.isFinite(pxPerFt) || !Number.isFinite(reachFt)) return [];
  const pxPerNm = pxPerFt * FT_PER_NM;
  let step = RING_STEPS_NM.find((s) => s * pxPerNm >= MIN_GAP_PX) ?? RING_STEPS_NM[RING_STEPS_NM.length - 1];
  const reachNm = reachFt / FT_PER_NM;
  while (reachNm / step > MAX_RINGS) step *= 2; // very wide: keep it to a few rings
  const out = [];
  for (let r = step; r <= reachNm; r += step) out.push(r);
  return out;
}
