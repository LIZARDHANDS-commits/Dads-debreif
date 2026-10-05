// One aircraft flying a planned programme, one fixed step at a time (Turn Sim
// first version, Patrick 4 Oct 2026: every aircraft flies a pre-planned path
// that is kinematically accurate). A programme is a short list of segments
// (hold straight, turn to a heading at a bank, change speed); the bank eases in
// and out at the ruled roll rate, the heading changes at the coordinated-turn
// rate for that bank and true airspeed, the height follows a smooth profile and
// the speed a smooth ramp.
//
// The same function flies the real aircraft and the dry runs the planner uses
// to work out a manoeuvre, so the path drawn ahead is the path flown.
//
// Units: feet, seconds, x east, y north. Headings are math radians (0 east,
// counter-clockwise). Bank is signed, left wing down positive, so a positive
// bank turns the heading the positive (left) way.
import { easeRoll, turnRateFromBankRadPerSec, gFromBankDeg } from '../../../core/flight-math.js';
import { pitchDegFromClimb, rollWithinT6A } from '../../../core/t6-performance.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { powerFor, POWER_BLOCK_FT } from './power.js';
import { ROLL } from './tuning.js';

/** Roll limits (tuning.js ROLL), still read from here by the tests. */
export { ROLL };

/**
 * The roll limits flown at a true airspeed (ft/s): the lower of the pilot's (`roll`, tuning.js ROLL or a close formation's
 * gentler rate) and the T-6A's own at that speed (core rollWithinT6A, estimates; TS-85).
 */
export const rollLimitAt = (tasFtps, roll = ROLL) => rollWithinT6A(roll, tasFtps / KT_TO_FTPS);

/** The step the whole Turn Sim flies in (TS-R9), the same 0.05 s as before. */
export const STEP_SEC = 0.05;

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
    slowStage: null, // how it is slowing now (slow-down.js, TS-61), or null
    power: null, // its power setting for the tag (power.js, TS-62), or null when nothing sets it
    stretched: false, // held to full power and behind his planned place (full-power.js, TS-63)
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

/** How much the heading still changes (radians, signed) if the wings are rolled level from here, at the roll limits `roll` (under the T-6A's, rollLimitAt). */
export function headingChangeRollingOut(bankDeg, rollRateDps, tasFtps, roll = ROLL) {
  const limits = rollLimitAt(tasFtps, roll);
  let bank = bankDeg;
  let rate = rollRateDps;
  let change = 0;
  for (let i = 0; i < 400 && (Math.abs(bank) > 1e-6 || Math.abs(rate) > 1e-6); i++) {
    const before = bank;
    ({ bankDeg: bank, rollRateDps: rate } = easeRoll(bank, rate, 0, STEP_SEC, limits));
    change += stepTurnRad(tasFtps, before, bank);
  }
  return change;
}

/**
 * The smootherstep curve from 0 to 1 (u from 0 to 1) and its slope: no rate and no acceleration at
 * either end. Every smooth change in the Turn Sim (height legs, speed changes) uses this one curve.
 */
export const smoother = (u) => u * u * u * (10 - 15 * u + 6 * u * u);
export const smootherSlope = (u) => 30 * u * u * (1 - u) * (1 - u);
/** The smootherstep's curvature (the slope's own slope): a height leg's vertical acceleration is rise x this / span². */
export const smootherCurve = (u) => 60 * u * (1 - u) * (1 - 2 * u);
/** The smootherstep's steepest slope is this many times its average one (at the middle). */
export const SMOOTHER_PEAK = 1.875;

/**
 * Height on a smooth profile: legs { t0, t1, fromFt, toFt } in formation seconds. Each leg
 * starts and ends with no climb and no vertical acceleration (the smootherstep curve), so
 * the pitch and the pitch rate carry straight on across every join.
 * Returns { altAboveFt, climbFtps } at time t, or null when t is outside every leg.
 */
export function heightAt(profile, t) {
  for (const leg of profile ?? []) {
    if (t < leg.t0 || t > leg.t1) continue;
    if (leg.table) return tableAt(leg, t);
    const span = Math.max(leg.t1 - leg.t0, 1e-9);
    const u = (t - leg.t0) / span;
    const rise = leg.toFt - leg.fromFt;
    // nz: the G the leg's pull or push puts on the aircraft with the wings level (1 + vertical acceleration / g; height as energy).
    return { altAboveFt: leg.fromFt + rise * smoother(u), climbFtps: (rise * smootherSlope(u)) / span, nz: 1 + (rise * smootherCurve(u)) / (span * span * G_FTPS2) };
  }
  return null;
}

/**
 * A height leg flown from a table (leg.table: { dt, alt: [], climb: [], nz: [] }, one entry every dt seconds from
 * leg.t0): a vertical manoeuvre worked out in full when it is planned, such as G-warm's push over (g-warm.js), whose
 * load factor is part of the plan. Read between entries in a straight line. Returns { altAboveFt, climbFtps, nz }:
 * nz is the G the vertical manoeuvre puts on the aircraft with the wings level (1 in level flight).
 */
function tableAt(leg, t) {
  const { dt, alt, climb, nz } = leg.table;
  const x = Math.max(0, (t - leg.t0) / dt);
  const i = Math.min(alt.length - 1, Math.floor(x));
  const j = Math.min(alt.length - 1, i + 1);
  const f = Math.min(1, x - i);
  const mix = (arr) => arr[i] + (arr[j] - arr[i]) * f;
  return { altAboveFt: mix(alt), climbFtps: mix(climb), nz: mix(nz) };
}

/**
 * The speed on a running speed change (plan.speedLeg: { t0, t1, fromKias, toKias, tasPerKias })
 * at formation time t: { kias, tasFtps, rateKtps }. Indicated airspeed follows the smootherstep
 * from fromKias to toKias, so the acceleration starts and ends at zero; true airspeed is indicated
 * times the ratio at the block height when the change began (the Turn Sim flies its height changes
 * at that one density too, F3/F4).
 */
export function speedAt(leg, t) {
  const span = Math.max(leg.t1 - leg.t0, 1e-9);
  const u = Math.min(1, Math.max(0, (t - leg.t0) / span));
  const kias = u >= 1 ? leg.toKias : leg.fromKias + (leg.toKias - leg.fromKias) * smoother(u);
  return { kias, tasFtps: kias * leg.tasPerKias, rateKtps: ((leg.toKias - leg.fromKias) * smootherSlope(u)) / span };
}

/**
 * Flies one step. `plan` is the aircraft's { segments, profile } and is used up as
 * it goes (finished segments are shifted off). `t` is the formation's time at the
 * start of the step. Segments:
 *   { kind: 'hold', untilSec, thenNext } straight and level until formation time untilSec; with thenNext the next
 *        segment starts in the step the hold ends (so a plan joined from separately planned legs starts each leg on
 *        the exact step it was planned from); without it the step the hold ends is still flown straight.
 *   { kind: 'turn', toRad, dir, bankDeg, rollOut }
 *        turn the `dir` way (+1 left, -1 right) at bankDeg (magnitude) to heading toRad;
 *        rollOut false hands the bank straight on to the next segment (the cross turn's two stages).
 *   { kind: 'speed', toKias, rateKtps, withNext, stage }
 *        change indicated airspeed from what it is now to toKias at an average of rateKtps
 *        (knots per second; the smootherstep's steepest point is SMOOTHER_PEAK times that), so
 *        the change takes |toKias - kias| / rateKtps seconds and the acceleration starts and ends
 *        at zero; position and track carry straight on (each step moves at the step's mean speed).
 *        The planner checks the rate against what the aircraft can do (errors.js: full-power excess
 *        thrust to speed up). By default it is flown like a hold: straight and level until the new
 *        speed is reached. withNext: true starts the change and hands straight on to the next
 *        segment in the same step, so the speed changes during the turns and holds that follow
 *        (the plan isn't done until the change is). A change that starts while another is still
 *        running waits for it, so the acceleration never jumps. stage (slow-down.js: 'power', 'boards', 'idle',
        'idleBoards') says how a slow-down is flown; while the change runs it is the aircraft's slowStage.
 * With no segments left the aircraft flies straight and level.
 */
export function stepAircraft(a, plan, t) {
  const dt = STEP_SEC;
  const seg = plan.segments[0];
  let targetBank = 0;

  if (seg?.kind === 'speed') {
    if (!plan.speedLeg && !seg.begun) {
      const rate = Math.abs(seg.rateKtps);
      const change = seg.toKias - a.kias;
      const span = rate > 0 ? Math.abs(change) / rate : 0;
      seg.begun = true;
      if (Math.abs(change) > 1e-9 && span > 0) plan.speedLeg = { t0: t, t1: t + span, fromKias: a.kias, toKias: seg.toKias, tasPerKias: a.tasFtps / a.kias, stage: seg.stage ?? null };
    }
    if (seg.begun && (seg.withNext || !plan.speedLeg)) {
      plan.segments.shift();
      return stepAircraft(a, plan, t); // the next segment flies this same step
    }
    // otherwise: straight and level while the speed changes (or while an earlier change finishes)
  } else if (seg?.kind === 'hold') {
    if (t + dt / 2 >= seg.untilSec) {
      plan.segments.shift();
      if (seg.thenNext) return stepAircraft(a, plan, t); // the next segment flies this same step
    }
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
        const rollOutChange = Math.abs(headingChangeRollingOut(a.bankDeg, a.rollRateDps, a.tasFtps, seg.roll));
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
  const tasBefore = a.tasFtps;
  const kiasBefore = a.kias;
  if (plan.speedLeg) {
    const sp = speedAt(plan.speedLeg, t + dt);
    a.kias = sp.kias;
    a.tasFtps = sp.tasFtps;
    a.slowStage = plan.speedLeg.stage ?? null; // how the slow-down is flown (slow-down.js, TS-61): the card and tags say BOARDS or IDLE
    if (t + dt >= plan.speedLeg.t1 - 1e-9) plan.speedLeg = null;
  } else {
    a.slowStage = null;
  }
  // The step's mean true airspeed: the same number when the speed is constant, so nothing else changes.
  const tas = (tasBefore + a.tasFtps) / 2;
  // A turn segment may roll gentler (a close formation Lead); never faster than the T-6A at this speed (TS-85).
  const rolled = easeRoll(a.bankDeg, a.rollRateDps, targetBank, dt, rollLimitAt(tasBefore, seg?.roll ?? ROLL));
  a.bankDeg = Math.abs(rolled.bankDeg) < 1e-9 ? 0 : rolled.bankDeg;
  a.rollRateDps = Math.abs(rolled.rollRateDps) < 1e-9 ? 0 : rolled.rollRateDps;
  const turned = stepTurnRad(tas, bankBefore, a.bankDeg);
  a.headingRad = wrapPi(headingBefore + turned);
  a.g = gFromBankDeg(a.bankDeg);
  a.turning = a.bankDeg !== 0 || plan.segments.length > 0;

  const height = heightAt(plan.profile, t + dt);
  if (height) {
    a.altAboveFt = height.altAboveFt;
    a.climbFtps = height.climbFtps;
    // The pull or push of the height change is charged as G (height as energy; until V2.82 a smooth height leg's pull was
    // free, so a 700 ft pop-up in 6 s cost nothing): the turn's sideways share (tan bank, in g) and the vertical share
    // (nz) together, standard mechanics; 1 / cos(bank) in a level turn, nz with the wings level. A push past zero G keeps
    // its sign (G-warm's push over).
    if (height.nz !== undefined) {
      const side = Math.max(0, a.g * a.g - 1);
      a.g = Math.sign(height.nz || 1) * Math.sqrt(side + height.nz * height.nz);
    }
  } else {
    a.climbFtps = 0;
  }
  // The path is flown at the aircraft's true airspeed (constant, Patrick card 09:54Z, except in a speed
  // segment), along the step's middle heading and with the step's mean climb, so the path has no lean either way.
  const climb = (climbBefore + a.climbFtps) / 2;
  const horiz = Math.sqrt(Math.max(0, tas * tas - climb * climb));
  const middle = headingBefore + turned / 2;
  a.xFt += Math.cos(middle) * horiz * dt;
  a.yFt += Math.sin(middle) * horiz * dt;
  a.pitchDeg = pitchAboveHorizonDeg(a);
  // The power that flies this step (power.js): the slow-down's stage, or the model's throttle for the speed change, the
  // climb and the G flown (a held speed included). The block height is the plan's, or the formation's default.
  const blockFt = plan.blockFt ?? POWER_BLOCK_FT;
  a.stretched = false; // a flight.js segment flies its own plan, never behind it (TS-63 marks the planned lines only)
  a.power = powerFor((a.kias - kiasBefore) / dt, a.kias, blockFt, a.g, a.climbFtps, a.slowStage);
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

/** True when the aircraft has flown every segment, its wings are level and no speed change is still running. */
export function planDone(a, plan) {
  return plan.segments.length === 0 && a.bankDeg === 0 && a.rollRateDps === 0 && !plan.speedLeg;
}
