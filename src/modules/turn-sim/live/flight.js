// One aircraft flying a planned programme, one fixed step at a time (Turn Sim
// first version, Patrick 4 Oct 2026: every aircraft flies a pre-planned path
// that is kinematically accurate). A programme is a short list of segments
// (hold straight, turn to a heading at a bank); the bank eases in and out at
// the ruled roll rate, the heading changes at the coordinated-turn rate for
// that bank and true airspeed, and the height follows a smooth profile.
//
// The same function flies the real aircraft and the dry runs the planner uses
// to work out a manoeuvre, so the path drawn ahead is the path flown.
//
// Units: feet, seconds, x east, y north. Headings are math radians (0 east,
// counter-clockwise). Bank is signed, left wing down positive, so a positive
// bank turns the heading the positive (left) way.
import { easeRoll, turnRateFromBankRadPerSec, gFromBankDeg } from '../../../core/flight-math.js';
import { pitchDegFromClimb } from '../../../core/t6-performance.js';
import { wrapPi } from '../../../core/angles.js';

/** The step the whole Turn Sim flies in (TS-R9), the same 0.05 s as before. */
export const STEP_SEC = 0.05;

/** Roll limits: up to 90°/s (Patrick, 4 Oct 08:54Z), building and dying away at 360°/s² (Patrick, card 09:54Z). */
export const ROLL = Object.freeze({ maxRateDps: 90, maxAccelDps2: 360 });

/**
 * A new aircraft, straight and level.
 * @param {{id: number, xFt: number, yFt: number, headingRad: number, kias: number, tasFtps: number}} init
 */
export function makeAircraft({ id, xFt, yFt, headingRad, kias, tasFtps }) {
  return {
    id, xFt, yFt, headingRad, kias, tasFtps,
    altAboveFt: 0, // height above the formation's block height
    bankDeg: 0, // signed: left wing down positive
    rollRateDps: 0,
    g: 1,
    climbFtps: 0,
    pitchDeg: pitchDegFromClimb(0, tasFtps, kias, 1),
    turning: false,
  };
}

/** A copy that shares nothing with the original, for dry runs. */
export function copyAircraft(a) {
  return { ...a };
}

/**
 * The heading still to turn, in the turn's own direction, from `fromRad` to `toRad`: 0 to just under 2π.
 * dir is +1 for a left turn, -1 for a right turn.
 */
export function angleToGo(fromRad, toRad, dir) {
  const d = wrapPi((toRad - fromRad) * dir);
  return d < -1e-9 ? d + 2 * Math.PI : Math.max(0, d);
}

/**
 * The heading change over one step whose bank goes from `fromDeg` to `toDeg`: the
 * turn rate at the step's mean (trapezoid), so a roll-in and its roll-out are mirror
 * images and a turn's path is the same whichever way it is flown.
 */
function stepTurnRad(tasFtps, fromDeg, toDeg) {
  return ((turnRateFromBankRadPerSec(tasFtps, fromDeg) + turnRateFromBankRadPerSec(tasFtps, toDeg)) / 2) * STEP_SEC;
}

/** How much the heading still changes (radians, signed) if the wings are rolled level from here. */
export function headingChangeRollingOut(bankDeg, rollRateDps, tasFtps) {
  let bank = bankDeg;
  let rate = rollRateDps;
  let change = 0;
  for (let i = 0; i < 400 && (Math.abs(bank) > 1e-6 || Math.abs(rate) > 1e-6); i++) {
    const before = bank;
    ({ bankDeg: bank, rollRateDps: rate } = easeRoll(bank, rate, 0, STEP_SEC, ROLL));
    change += stepTurnRad(tasFtps, before, bank);
  }
  return change;
}

/**
 * Height on a smooth profile: legs { t0, t1, fromFt, toFt } in formation seconds. Each leg
 * starts and ends with no climb and no vertical acceleration (the smootherstep curve), so
 * the pitch and the pitch rate carry straight on across every join.
 * Returns { altAboveFt, climbFtps } at time t, or null when t is outside every leg.
 */
export function heightAt(profile, t) {
  for (const leg of profile ?? []) {
    if (t < leg.t0 || t > leg.t1) continue;
    const span = Math.max(leg.t1 - leg.t0, 1e-9);
    const u = (t - leg.t0) / span;
    const rise = leg.toFt - leg.fromFt;
    return {
      altAboveFt: leg.fromFt + rise * u * u * u * (10 - 15 * u + 6 * u * u),
      climbFtps: (rise * 30 * u * u * (1 - u) * (1 - u)) / span,
    };
  }
  return null;
}

/**
 * Flies one step. `plan` is the aircraft's { segments, profile } and is used up as
 * it goes (finished segments are shifted off). `t` is the formation's time at the
 * start of the step. Segments:
 *   { kind: 'hold', untilSec }          straight and level until formation time untilSec
 *   { kind: 'turn', toRad, dir, bankDeg, rollOut }
 *        turn the `dir` way (+1 left, -1 right) at bankDeg (magnitude) to heading toRad;
 *        rollOut false hands the bank straight on to the next segment (the cross turn's two stages).
 * With no segments left the aircraft flies straight and level.
 */
export function stepAircraft(a, plan, t) {
  const dt = STEP_SEC;
  const seg = plan.segments[0];
  let targetBank = 0;

  if (seg?.kind === 'hold') {
    if (t + dt / 2 >= seg.untilSec) plan.segments.shift();
  } else if (seg?.kind === 'turn') {
    const toGo = angleToGo(a.headingRad, seg.toRad, seg.dir);
    if (!seg.rollingOut) {
      targetBank = seg.dir * seg.bankDeg;
      if (seg.rollOut === false) {
        // Hand-over turn: done when the heading reaches the target, still banked.
        const thisStep = Math.abs(turnRateFromBankRadPerSec(a.tasFtps, a.bankDeg)) * dt;
        if (toGo <= thisStep / 2 || toGo > 1.5 * Math.PI && seg.started) {
          plan.segments.shift();
          return stepAircraft(a, plan, t); // the next segment flies this same step
        }
      } else {
        // Roll out early enough that the wings come level on the target heading.
        const rollOutChange = Math.abs(headingChangeRollingOut(a.bankDeg, a.rollRateDps, a.tasFtps));
        const thisStep = Math.abs(turnRateFromBankRadPerSec(a.tasFtps, a.bankDeg)) * dt;
        if (seg.started && (toGo <= rollOutChange + thisStep / 2 || toGo > 1.5 * Math.PI)) seg.rollingOut = true;
      }
      seg.started = true;
    }
    if (seg.rollingOut) {
      targetBank = 0;
      // Wings level: the turn is done. The heading is never nudged onto the target, so nothing jumps;
      // what the fixed step leaves over is a fraction of a degree, the same for every aircraft flying the same turn.
      if (Math.abs(a.bankDeg) < 1e-6 && Math.abs(a.rollRateDps) < 1e-6) plan.segments.shift();
    }
  }

  const bankBefore = a.bankDeg;
  const headingBefore = a.headingRad;
  const climbBefore = a.climbFtps;
  const rolled = easeRoll(a.bankDeg, a.rollRateDps, targetBank, dt, ROLL);
  a.bankDeg = Math.abs(rolled.bankDeg) < 1e-9 ? 0 : rolled.bankDeg;
  a.rollRateDps = Math.abs(rolled.rollRateDps) < 1e-9 ? 0 : rolled.rollRateDps;
  const turned = stepTurnRad(a.tasFtps, bankBefore, a.bankDeg);
  a.headingRad = wrapPi(headingBefore + turned);
  a.g = gFromBankDeg(a.bankDeg);
  a.turning = a.bankDeg !== 0 || plan.segments.length > 0;

  const height = heightAt(plan.profile, t + dt);
  if (height) {
    a.altAboveFt = height.altAboveFt;
    a.climbFtps = height.climbFtps;
  } else {
    a.climbFtps = 0;
  }
  // Constant speed: the path is flown at the aircraft's true airspeed (Patrick, card 09:54Z), along the
  // step's middle heading and with the step's mean climb, so the path has no lean either way.
  const climb = (climbBefore + a.climbFtps) / 2;
  const horiz = Math.sqrt(Math.max(0, a.tasFtps * a.tasFtps - climb * climb));
  const middle = headingBefore + turned / 2;
  a.xFt += Math.cos(middle) * horiz * dt;
  a.yFt += Math.sin(middle) * horiz * dt;
  a.pitchDeg = pitchAboveHorizonDeg(a);
}

/**
 * The nose above the horizon: the climb angle plus the angle of attack, which in a
 * banked turn is tilted with the wings, so only its cos(bank) share lifts the nose.
 * The shared formula's angle of attack grows with G, so passing G x cos(bank) gives
 * that share (1 in a level turn, where G = 1 / cos(bank)).
 */
function pitchAboveHorizonDeg(a) {
  return pitchDegFromClimb(a.climbFtps, a.tasFtps, a.kias, a.g * Math.cos((a.bankDeg * Math.PI) / 180));
}

/** True when the aircraft has flown every segment and its wings are level. */
export function planDone(a, plan) {
  return plan.segments.length === 0 && a.bankDeg === 0 && a.rollRateDps === 0;
}
