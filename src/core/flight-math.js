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
import { G_FTPS2, KT_TO_FTPS, FTPS_TO_KT, M_PER_FT } from './units.js';
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

/**
 * The G one Turn Sim aircraft turns at this step (`moveAircraftList`, lines
 * 1582 and 1583). Everything V6 reads from the page comes in as an argument:
 *
 * - baseG: the G box as V6's `baseG()` gives it, already at least 1.01.
 * - gErr: this aircraft's own G error (`a.gErr`), added only when
 *   useErrorsAndCorrection is true.
 * - useErrorsAndCorrection: true when the step is the real flight, false for
 *   the planning pass that has no errors and no correction.
 * - correction: the Correction model box, 'gfix' for "G fix".
 * - aircraftId: the aircraft's number, 1 for lead. Lead is never corrected.
 * - distToLeadFt: how far this aircraft is from lead now.
 * - spacingFt: the Spacing box; its slot is spacingFt × (aircraftId − 1) from lead.
 * - corrStrength: the Correction strength box.
 *
 * With G fix on, the wingman's G moves by (distance − slot) / 6,000 ft × strength,
 * never more than 0.8 G either way: too far back pulls more G, too close pulls less.
 *
 * V6 limits G to 1.01 first and corrects after, so the result can be below 1 G
 * (base G plus error under 1.8 with the full −0.8 correction). Then
 * turnRateRadPerSec gives NaN, and V6's aircraft position with it.
 */
export function turnSimG({ baseG, gErr, useErrorsAndCorrection, correction, aircraftId, distToLeadFt, spacingFt, corrStrength }) {
  let g = Math.max(MIN_TURN_G, baseG + (useErrorsAndCorrection ? gErr : 0));
  if (useErrorsAndCorrection && correction === 'gfix' && aircraftId !== 1) {
    const e = distToLeadFt - spacingFt * Math.abs(aircraftId - 1);
    g += Math.max(-.8, Math.min(.8, e / 6000 * corrStrength));
  }
  return g;
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
 * turnRateDeg is the change between the headings of the two one-second legs,
 * whose middles are one second apart. V6 divided it by 2, showing half the real
 * rate; Dad confirmed that was wrong, and it is fixed here (D39).
 */
export function emPoint(before, now, after) {
  if (!now || !before || !after) return null;
  const h0 = headingRad(before, now), h1 = headingRad(now, after);
  const turnRateDeg = Math.abs(wrapPi(h1 - h0)) * 180 / Math.PI;
  const gsKt = Number.isFinite(now.spdKt) ? now.spdKt : (Math.hypot(after.x - before.x, after.y - before.y) / 2 / KT_TO_FTPS);
  const altFt = Number.isFinite(now.altFt) ? now.altFt : 6500;
  const iasKt = gsKt * Math.sqrt(Math.max(.15, isaDensityRatio(altFt)));
  return { iasKt, turnRateDeg, altFt, gsKt };
}

// ── Closure and G from recorded tracks ───────────────────────────────────────
// The debrief works these out from two moments of a track. Picking the moments
// and reading the track at them is flight-data's job; these take the result.

/**
 * Closure between aircraft A and B in knots, from where each was dtSec ago and
 * where each is now (debrief `closureRateKt`, line 3119). Positive means the
 * range is shrinking. Null if a position is missing or dtSec is not above 0.
 */
export function closureKt(prevA, prevB, nowA, nowB, dtSec) {
  if (!nowA || !nowB || !prevA || !prevB || dtSec <= 0) return null;
  const nowR = Math.hypot(nowA.x - nowB.x, nowA.y - nowB.y);
  const prevR = Math.hypot(prevA.x - prevB.x, prevA.y - prevB.y);
  return ((prevR - nowR) / dtSec) * FTPS_TO_KT;
}

/** Closure for the screen: "+12 kt", "-5 kt", "0 kt" under a knot, "--" if unknown (`fmtClosureKt`, line 3131). */
export function formatClosureKt(kt) {
  if (kt === null || !Number.isFinite(kt)) return '--';
  const rounded = Math.round(kt);
  if (Math.abs(rounded) < 1) return '0 kt';
  return (rounded > 0 ? '+' : '') + rounded + ' kt';
}

/**
 * G of a level turn flown between two moments dtSec apart, from the positions
 * p0 and p1 and the headings h0 and h1 there (debrief `estimatedGAtTrack`,
 * line 2462). Null below 20 ft/s, or when the answer is outside 0.8 to 9 G.
 */
export function gFromTrack(p0, h0, p1, h1, dtSec) {
  if (!p0 || !p1) return null;
  const omega = Math.abs(wrapPi(h1 - h0)) / dtSec;
  const fps = Math.hypot(p1.x - p0.x, p1.y - p0.y) / dtSec;
  if (!Number.isFinite(omega) || !Number.isFinite(fps) || fps < 20) return null;
  const g = Math.sqrt(1 + Math.pow(fps * omega / G_FTPS2, 2));
  if (!Number.isFinite(g) || g < 0.8 || g > 9) return null;
  return g;
}
