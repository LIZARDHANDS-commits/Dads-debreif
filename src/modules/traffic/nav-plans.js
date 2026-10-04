// Where a PFL "From Area" aircraft starts (Traffic spec 4.5): a radial and distance from the field, at a
// height, heading for the field at 125 KIAS (the clean glide speed, T-6A max glide chart; PFL in pfl.js).
// The old nav plans that fed the physics controllers were removed with them on Patrick's card
// "Rebuild, then delete" (4 Oct 17:53Z).

import { FT_PER_NM } from '../../core/units.js';

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
