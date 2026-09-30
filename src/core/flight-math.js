// Turn performance: how steep, how tight and how fast an aircraft turns at a
// given speed and G, in a level turn; and the EM chart point from a track.
//
// V6 has three copies of this physics: Turn Sim (lines 787 to 789), Turn Fight
// (`M`, line 4237) and the Traffic page (`bankFromG` and `turnRadiusFromG`,
// lines 147 and 148). They agree, except that each limits G its own way (see
// limitG) and Turn Fight works out the turn rate in a different order, which
// changes the last digit only (see turnRateRadPerSec).
//
// Speeds are true airspeed in feet per second (units.ktToFtps). G is the load
// factor; a level turn needs more than 1 G.
//
// Line numbers refer to original/shell.html unless a sub-page is named.
import { G_FTPS2, KT_TO_FTPS, M_PER_FT } from './units.js';
import { radToDeg, headingRad, wrapPi } from './angles.js';

/** The least G V6 lets any turn use: at exactly 1 G there is no turn. */
export const MIN_TURN_G = 1.01;

/**
 * Keeps G between MIN_TURN_G and maxG, as V6 does before turning.
 * Turn Fight and Turn Sim have no upper limit; the Traffic page uses maxG = 9.
 * (The Traffic page also reads an empty or zero G box as 2 G: `+g || 2`.)
 */
export function limitG(g, maxG = Infinity) {
  return Math.max(MIN_TURN_G, Math.min(maxG, g));
}

/** Bank angle in degrees for a level turn at g (Turn Sim `bankFromG`, line 788). */
export function bankDegFromG(g) {
  return radToDeg(Math.acos(1 / g));
}

/**
 * Turn radius in feet (Turn Sim `turnRadius`, line 788).
 * G below 1 gives NaN, as in V6: callers limit G first (limitG).
 */
export function turnRadiusFt(speedFtps, g) {
  return speedFtps * speedFtps / (G_FTPS2 * Math.sqrt(g * g - 1));
}

/**
 * Turn rate in radians per second (Turn Sim `turnRate`, line 789).
 * Turn Fight computes it as gravity × √(g² − 1) / speed instead, which differs
 * from this in the last digit for about a third of inputs; nothing it shows changes.
 */
export function turnRateRadPerSec(speedFtps, g) {
  return speedFtps / turnRadiusFt(speedFtps, g);
}

// ── Air data and the EM chart point ──────────────────────────────────────────

/**
 * Air density at altFt as a fraction of sea level, in the standard atmosphere
 * (EM chart `isaRhoRatio`, line 4154). Above 11,000 m V6 uses 0.297.
 */
export function isaDensityRatio(altFt) {
  const h = altFt * M_PER_FT, T0 = 288.15, L = .0065, g = 9.80665, R = 287.05287;
  if (h < 11000) {
    const T = T0 - L * h;
    return Math.pow(T / T0, g / (R * L) - 1);
  }
  return .297;
}

/**
 * Where an aircraft sits on the EM chart (EM chart `metrics`, line 4158), from
 * its track one second before, at, and one second after the moment shown.
 * Points are { x, y } in feet with optional spdKt and altFt; any missing point
 * gives null. Ground speed comes from spdKt, or from the distance flown over
 * the two seconds. Altitude defaults to 6,500 ft. Indicated airspeed is
 * estimated as ground speed × √(density ratio), with the ratio at least 0.15.
 *
 * turnRateDeg is halved, as in V6: the headings of the two one-second legs are
 * one second apart, but V6 divides their difference by 2. Dad confirmed this is
 * wrong (D39); the fix lands as its own change.
 */
export function emPoint(before, now, after) {
  if (!now || !before || !after) return null;
  const h0 = headingRad(before, now), h1 = headingRad(now, after);
  const turnRateDeg = Math.abs(wrapPi(h1 - h0)) * 180 / Math.PI / 2;
  const gsKt = Number.isFinite(now.spdKt) ? now.spdKt : (Math.hypot(after.x - before.x, after.y - before.y) / 2 / KT_TO_FTPS);
  const altFt = Number.isFinite(now.altFt) ? now.altFt : 6500;
  const iasKt = gsKt * Math.sqrt(Math.max(.15, isaDensityRatio(altFt)));
  return { iasKt, turnRateDeg, altFt, gsKt };
}
