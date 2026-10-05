// The power setting each aircraft's tag shows (Patrick 5 Oct 01:44Z: "I want tags on the aircraft to show their power
// setting, red letters for IDLE and IDLE+BOARDS or BOARDS as well"; TS-62, spec section 10.4).
//
// An aircraft's power is { stage } (slow-down.js 'boards', 'idle' or 'idleBoards') or { throttle } (part or full power) or
// null when nothing that flies it sets its power (then the tag shows no power line rather than a guess).
// The throttle is the MODEL's throttle: the share of full-power thrust (core thrustPerWeight) that gives the acceleration
// and climb being flown with the clean drag (core dragPerWeight), excess = throttle x thrust - drag (core excessFnFor).
// It is not a torque gauge reading: the T-6's torque at a given PCL changes with speed and height, and this model has no
// torque curve (standard aerodynamics, dV/dt = g (T - D) / W - g sin(climb angle)).
import { dragPerWeight, thrustPerWeight, iasToTasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';

/** The block height a power is worked out at when the caller doesn't know it: the formation's default (formation.js, an estimate). */
export const POWER_BLOCK_FT = 8000;
/** From this share of full-power thrust up the tag says MAX (so it does not flick between MAX and PWR 99% at full power; an estimate). */
const MAX_FROM = 0.985;

/**
 * The model's throttle (share of full-power thrust) that flies an indicated-speed rate of ktps (KIAS per second) at kias,
 * height altFt, load factor g and climb rate climbFtps. Below 0 or above 1 when the line asks more slowing or more speed
 * than power alone gives (the caller decides what that means).
 */
export function throttleFor(ktps, kias, altFt = POWER_BLOCK_FT, g = 1, climbFtps = 0) {
  const k = Math.max(kias, 1);
  const ktas = iasToTasKt(k, altFt);
  const accelFtps2 = ktps * (ktas / k) * KT_TO_FTPS; // the true airspeed's rate
  const excess = accelFtps2 / G_FTPS2 + climbFtps / Math.max(ktas * KT_TO_FTPS, 1);
  return (excess + dragPerWeight(k, altFt, g)) / thrustPerWeight(k, altFt);
}

/** An aircraft's power from its slowing stage (slow-down.js) and, when it flies on power, the throttle; null if neither is known. */
export function powerFrom(stage, throttle) {
  if (stage === 'boards' || stage === 'idle' || stage === 'idleBoards') return { stage };
  if (throttle === null || throttle === undefined || !Number.isFinite(throttle)) return null;
  return { throttle };
}

const STAGE_TEXT = Object.freeze({ boards: 'BOARDS', idle: 'IDLE', idleBoards: 'IDLE+BOARDS' });

/**
 * The tag's power line: { text, red } or null. MAX at full power, PWR nn% at part power (the model's throttle, see the
 * top of this file), IDLE, BOARDS (power set and the speed brake out) or IDLE+BOARDS; the last three in red letters.
 * A line that asks more than full power still reads MAX; one asking a little more slowing than the power floor reads PWR 0%.
 */
export function powerWord(power) {
  if (!power) return null;
  if (power.stage) return { text: STAGE_TEXT[power.stage], red: true };
  if (power.throttle >= MAX_FROM) return { text: 'MAX', red: false };
  return { text: `PWR ${Math.round(100 * Math.max(0, power.throttle))}%`, red: false };
}
