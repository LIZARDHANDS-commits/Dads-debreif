// Turn performance: how steep, how tight and how fast an aircraft turns at a
// given speed and G, in a level turn (standard aerodynamics: bank = acos(1/G),
// radius = v² ÷ (g √(G² − 1))); the EM chart point from a track; closure and G
// from recorded tracks; and the smooth roll every module flies.
//
// Speeds are true airspeed in feet per second (units.ktToFtps). G is the load
// factor; a level turn needs more than 1 G.
import { G_FTPS2, KT_TO_FTPS, FTPS_TO_KT } from './units.js';
import { degToRad, radToDeg, headingRad, wrapPi } from './angles.js';
import { isaDensityRatio } from './atmosphere.js';

/** The least G any turn uses: at exactly 1 G there is no turn (D74). */
export const MIN_TURN_G = 1.01;

/**
 * Keeps G between MIN_TURN_G and maxG before turning. With no maxG there is
 * no upper limit.
 */
export function limitG(g, maxG = Infinity) {
  return Math.max(MIN_TURN_G, Math.min(maxG, g));
}

/** Bank angle in degrees for a level turn at g: acos(1 / g). */
export function bankDegFromG(g) {
  return radToDeg(Math.acos(1 / g));
}

/**
 * Turn radius in feet: v² ÷ (g √(G² − 1)).
 * G below 1 gives NaN: callers limit G first (limitG).
 */
export function turnRadiusFt(speedFtps, g) {
  return speedFtps * speedFtps / (G_FTPS2 * Math.sqrt(g * g - 1));
}

/**
 * Turn rate in radians per second: speed ÷ turnRadiusFt. Worked out as
 * gravity × √(G² − 1) ÷ speed instead it differs in the last digit for about a
 * third of inputs, which a long chase can compound, so every module calls this
 * one.
 */
export function turnRateRadPerSec(speedFtps, g) {
  return speedFtps / turnRadiusFt(speedFtps, g);
}

/** G in a level, coordinated turn at bankDeg: 1 / cos(bank). 60° gives 2 G. */
export function gFromBankDeg(bankDeg) {
  return 1 / Math.cos(degToRad(bankDeg));
}

/**
 * Turn rate in radians per second in a level, coordinated turn at bankDeg:
 * gravity × tan(bank) ÷ true airspeed (ft/s). Same physics as turnRateRadPerSec,
 * given the bank instead of the G.
 */
export function turnRateFromBankRadPerSec(speedFtps, bankDeg) {
  return (G_FTPS2 * Math.tan(degToRad(bankDeg))) / speedFtps;
}

/** Turn radius in feet in a level, coordinated turn at bankDeg: v² ÷ (gravity × tan(bank)). */
export function turnRadiusFromBankFt(speedFtps, bankDeg) {
  return speedFtps * speedFtps / (G_FTPS2 * Math.tan(degToRad(bankDeg)));
}

/**
 * Bank in degrees for a coordinated turn at a heading rate: tan⁻¹(true airspeed
 * × rate ÷ gravity). Signed like the rate: a positive (clockwise, right) rate
 * gives a positive (right) bank. The inverse of turnRateFromBankRadPerSec.
 */
export function bankDegFromTurnRate(speedFtps, rateRadPerSec) {
  return radToDeg(Math.atan((speedFtps * rateRadPerSec) / G_FTPS2));
}

// ── Air data and the EM chart point ──────────────────────────────────────────

// The standard day's density ratio lives in atmosphere.js; it is exported here
// too, under the same name, for the modules that read it from this file.
export { isaDensityRatio };

/**
 * Where an aircraft sits on the EM chart, from
 * its track one second before, at, and one second after the moment shown.
 * Points are { x, y } in feet with optional spdKt and altFt; any missing point
 * gives null. Ground speed comes from spdKt, or from the distance flown over
 * the two seconds. Altitude defaults to 6,500 ft. Indicated airspeed is
 * estimated as ground speed × √(density ratio), with the ratio at least 0.15.
 *
 * turnRateDeg is the change between the headings of the two one-second legs,
 * whose middles are one second apart: the whole rate, not half of it (D39).
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
 * where each is now. Positive means the
 * range is shrinking. Null if a position is missing or dtSec is not above 0.
 */
export function closureKt(prevA, prevB, nowA, nowB, dtSec) {
  if (!nowA || !nowB || !prevA || !prevB || dtSec <= 0) return null;
  const nowR = Math.hypot(nowA.x - nowB.x, nowA.y - nowB.y);
  const prevR = Math.hypot(prevA.x - prevB.x, prevA.y - prevB.y);
  return ((prevR - nowR) / dtSec) * FTPS_TO_KT;
}

/** Closure for the screen: "+12 kt", "-5 kt", "0 kt" under a knot, "--" if unknown. */
export function formatClosureKt(kt) {
  if (kt === null || !Number.isFinite(kt)) return '--';
  const rounded = Math.round(kt);
  if (Math.abs(rounded) < 1) return '0 kt';
  return (rounded > 0 ? '+' : '') + rounded + ' kt';
}

/**
 * G of a level turn flown between two moments dtSec apart, from the positions
 * p0 and p1 and the headings h0 and h1 there: √(1 + (v ω ÷ g)²). Null below
 * 20 ft/s, or when the answer is outside 0.8 to 9 G.
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

// ── Shared Flight Guidance & Control Utilities ──────────────────────────────

/**
 * Moves a bank angle toward a target by at most maxDeltaRad;
 * wrapPi ensures shortest-arc roll, and prefer (+1 or -1) picks direction if 180° off.
 * Returns { bank, movedRad }.
 */
export function rollToward(bank, target, maxDeltaRad, prefer = 1) {
  let delta = wrapPi(target - bank);
  if (Math.abs(delta) > Math.PI - 1e-3) delta = prefer * Math.PI;
  const moved = Math.abs(delta) <= maxDeltaRad ? delta : Math.sign(delta) * maxDeltaRad;
  return { bank: wrapPi(bank + moved), movedRad: Math.abs(moved) };
}

/**
 * One step of a smooth roll toward targetDeg: the roll rate builds up and dies
 * away at most maxAccelDps2, never passes maxRateDps, and slows in time to stop
 * on the target, so the wings ease into and out of a bank instead of snapping.
 * With an onset (onsetSec, seconds) the roll's acceleration is built too: it
 * changes by at most maxAccelDps2 per onsetSec, so full acceleration takes one
 * onset to build and one to die away (the stick pushed, not slammed); accelDps2
 * is the acceleration it already has. Onset 0 is the law without it, exactly.
 * Degrees, degrees per second and per second²; returns { bankDeg, rollRateDps,
 * rollAccelDps2 } for the next step. With no time step nothing moves.
 */
export function easeRoll(bankDeg, rollRateDps, targetDeg, dt, { maxRateDps, maxAccelDps2, onsetSec = 0, accelDps2 = 0 }) {
  const onset = onsetSec > 0 ? onsetSec : 0;
  if (!(dt > 0)) return { bankDeg, rollRateDps, rollAccelDps2: onset > 0 ? accelDps2 : 0 };
  const err = targetDeg - bankDeg;
  // The fastest rate that can still stop on the target at maxAccelDps2, with the time the acceleration takes to build
  // added to the stopping margin.
  const half = (maxAccelDps2 * (dt + onset)) / 2; // discrete-step correction, so the roll stops on the target, not past it
  const stopRate = Math.max(0, Math.sqrt(2 * maxAccelDps2 * Math.abs(err) + half * half) - half);
  const wanted = Math.sign(err) * Math.min(maxRateDps, stopRate, Math.abs(err) / dt);
  if (!(onset > 0)) {
    const step = maxAccelDps2 * dt;
    const rate = rollRateDps + Math.max(-step, Math.min(step, wanted - rollRateDps));
    return { bankDeg: bankDeg + rate * dt, rollRateDps: rate, rollAccelDps2: (rate - rollRateDps) / dt };
  }
  // The acceleration that reaches the rate wanted over half an onset, never past maxAccelDps2 or the rate limit, moved
  // toward at most maxAccelDps2 / onset per second.
  let accWanted = Math.max(-maxAccelDps2, Math.min(maxAccelDps2, ((wanted - rollRateDps) * 2) / onset));
  accWanted = Math.max((-maxRateDps - rollRateDps) / dt, Math.min((maxRateDps - rollRateDps) / dt, accWanted));
  const build = (maxAccelDps2 / onset) * dt;
  const accel = accelDps2 + Math.max(-build, Math.min(build, accWanted - accelDps2));
  const rate = rollRateDps + accel * dt;
  const bank = bankDeg + rate * dt;
  // The built roll closes on the target without end: within a thousandth of a degree, with the rate and the acceleration
  // all but gone, the wings are on it.
  if (Math.abs(targetDeg - bank) < 1e-3 && Math.abs(rate) < 1e-2 && Math.abs(accel) < 1) return { bankDeg: targetDeg, rollRateDps: 0, rollAccelDps2: 0 };
  return { bankDeg: bank, rollRateDps: rate, rollAccelDps2: accel };
}

/** easeRoll under a general name: it limits any value's rate and the rate's change (a G onset, a roll), not only bank. */
export const easeValue = easeRoll;

/**
 * G required for first-order damped flight path angle convergence toward targetClimbRad:
 * n = cos(climb) + (V / g) * omega * (targetClimb - climb).
 * omega defaults to 1.0 rad/s (standard T-6 roundout).
 */
export function dampedClimbG(climbRad, targetClimbRad, speedFtps, omega = 1.0) {
  return Math.cos(climbRad) + (speedFtps / G_FTPS2) * omega * (targetClimbRad - climbRad);
}

