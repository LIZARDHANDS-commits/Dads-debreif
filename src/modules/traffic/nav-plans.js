// Where a PFL "From Area" aircraft starts (Traffic spec 4.5): a radial and distance from the field, at a
// height, heading for the field at 125 KIAS (the clean glide speed, T-6A max glide chart; PFL in pfl.js).
// The old nav plans that fed the physics controllers were removed with them on Patrick's card
// "Rebuild, then delete" (4 Oct 17:53Z).

import { FT_PER_NM } from '../../core/units.js';
import { flyPfl, PFL } from './pfl.js';

/**
 * The start of a PFL from the area: `radialDeg` from the field (0-360), `distNm` out (1-30) and `altFt`
 * (3,000-15,000), each clamped to its range. Returns { spawn: { x, y, alt, headingDeg, iasKt } }, heading
 * the reciprocal of the radial (toward the field).
 */
export function makePflFromArea(radialDeg = 90, distNm = 10, altFt = 8000) {
  radialDeg = ((radialDeg % 360) + 360) % 360;
  distNm = Math.max(1, Math.min(30, distNm));
  altFt = Math.max(3000, Math.min(15000, altFt));
  const distFt = distNm * FT_PER_NM;
  const radialRad = (radialDeg * Math.PI) / 180;
  return {
    spawn: { x: distFt * Math.sin(radialRad), y: distFt * Math.cos(radialRad), alt: altFt, headingDeg: (radialDeg + 180) % 360, iasKt: 125 },
  };
}

/** The heights an area PFL can start at, ft MSL (makePflFromArea's clamp). */
export const AREA_ALT_RANGE_FT = Object.freeze([3000, 15000]);

/**
 * On profile (Patrick, 4 Oct: a PFL from the area that "can hit high key between 5000 and 6000 feet"): the start
 * height, in whole hundreds of feet, from which a PFL at `radialDeg` and `distNm` crosses High Key nearest the
 * middle of its window (PFL.highKeyMinFt to highKeyMaxFt, 5,000-6,000 ft: WFO S2 art 403 para 1a). It works
 * nothing out of its own: it flies the PFL the sim would fly (pfl.js flyPfl, in `wind` with `settings`) from
 * trial heights. A higher start crosses High Key higher, so it halves the range until it has the lowest start
 * that reaches the middle. Returns { altFt, highKeyFt }, or { problem } in words when no start in range
 * puts it inside the window.
 */
export function onProfileAltFt(radialDeg, distNm, wind = { windFromDeg: 360, windKt: 0 }, settings = undefined) {
  const [low, high] = AREA_ALT_RANGE_FT;
  const aim = (PFL.highKeyMinFt + PFL.highKeyMaxFt) / 2;
  const atHighKey = (altFt) => {
    const { spawn: s } = makePflFromArea(radialDeg, distNm, altFt);
    const flight = flyPfl({ x: s.x, y: s.y, alt: s.alt, kias: s.iasKt, headingDeg: s.headingDeg, bankDeg: 0 }, wind, { settings });
    const hk = flight.points.find((p) => p.tag === 'high_key');
    return hk ? hk.alt : null; // null: it joined lower down, or did not reach the field
  };
  const reaches = (altFt) => (atHighKey(altFt) ?? -Infinity) >= aim;
  if (!reaches(high)) {
    const hk = atHighKey(high); // short of the middle, but maybe still inside the window
    if (hk !== null && hk >= PFL.highKeyMinFt) return { altFt: high, highKeyFt: Math.round(hk) };
    return { problem: `Too far out: even from ${high.toLocaleString('en-CA')} ft it does not reach High Key at ${PFL.highKeyMinFt.toLocaleString('en-CA')} ft or more. Try a shorter distance.` };
  }
  let [lo, hi] = [low, high];
  if (reaches(lo)) hi = lo;
  while (hi - lo > 50) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  // Whole hundreds: the nearer of the two either side that crosses High Key inside the window.
  const tries = [Math.ceil(hi / 100) * 100, Math.floor(hi / 100) * 100].filter((a) => a >= low && a <= high);
  for (const altFt of tries) {
    const hk = atHighKey(altFt);
    if (hk !== null && hk >= PFL.highKeyMinFt && hk <= PFL.highKeyMaxFt) return { altFt, highKeyFt: Math.round(hk) };
  }
  return { problem: 'No start height from this radial and distance crosses High Key inside 5,000-6,000 ft. Try another distance.' };
}
