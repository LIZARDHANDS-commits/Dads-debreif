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
import { attitudeDegFromClimb, rollWithinT6A, stallLimitG, T6A_G_ONSET } from '../../../core/t6-performance.js';
import { wrapPi, wrapDeg180 } from '../../../core/angles.js';
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

/**
 * The fastest the gate lets G build (G per second): twice the T-6A's normal onset (core T6A_G_ONSET, 4 G/s), an estimate.
 * Patrick 5 Oct 23:27Z: "higher than 4 occasionally is fine thats life as a pilot": 4 G/s is the normal pull, not a wall;
 * the gate only stops a pull no pilot could make.
 */
export const G_ONSET_CEILING = 2 * T6A_G_ONSET.maxRateDps;
/** Steeper than this the level-turn G (1 / cos bank) is not this model's (a lag roll through the inverted): the gate holds the roll only. */
const GATE_G_MAX_BANK_DEG = 85;

/**
 * The envelope gate (refactor PR 1, Fable's plan 23:20Z; ALL-28, Patrick's ruling 22:01Z; TS-93): one step of the wings
 * rolling toward targetDeg, held inside what a T-6A can do whatever drives the aircraft (a turn, the tracker, a recorded
 * bank track, a replayed pose, Lead's own turns):
 *   - roll rate and roll onset: the lower of the pilot's (`roll`) and the T-6A's at this speed (rollLimitAt, core estimates);
 *   - G onset: rolling steeper never builds the turn's G (1 / cos bank) faster than G_ONSET_CEILING (8 G/s, twice the
 *     T-6A's normal 4 G/s; estimates), so the last of a roll into a very steep bank slows down; rolling out is not held;
 *   - stall: never steeper than the bank whose G the speed can give (core stallLimitG; 86 KIAS 1 G stall, Patrick's).
 * A planner may ask for anything; the aircraft flies only this. tasFtps and kias are the aircraft's now. Returns easeRoll's
 * { bankDeg, rollRateDps }.
 */
export function gateRoll(bankDeg, rollRateDps, targetDeg, dt, roll, tasFtps, kias) {
  const limits = rollLimitAt(tasFtps, roll);
  // A rate handed in faster than the aircraft rolls (a replayed pose's own) is taken at the aircraft's.
  const rate0 = Math.max(-limits.maxRateDps, Math.min(limits.maxRateDps, rollRateDps));
  let target = targetDeg;
  const gStall = stallLimitG(kias);
  if (Math.abs(target) < GATE_G_MAX_BANK_DEG && gStall > 1) {
    const stallBank = (Math.acos(1 / gStall) * 180) / Math.PI;
    if (Math.abs(target) > stallBank && Math.abs(bankDeg) <= stallBank + 1e-6) target = Math.sign(target) * stallBank;
  }
  const steeper = Math.abs(target) > Math.abs(bankDeg) && Math.sign(target) === (Math.sign(bankDeg) || Math.sign(target));
  if (!steeper || Math.abs(bankDeg) >= GATE_G_MAX_BANK_DEG) return easeRoll(bankDeg, rate0, target, dt, limits);
  // The roll rate that builds G at the onset limit, read a little ahead (where the roll could still stop), so the rate
  // eases down inside the roll's own acceleration rather than stopping short.
  const ahead = Math.min(GATE_G_MAX_BANK_DEG, Math.abs(bankDeg) + (rate0 * rate0) / (2 * limits.maxAccelDps2));
  const phi = (ahead * Math.PI) / 180;
  const gRate = Math.tan(phi) / Math.cos(phi); // G per radian of bank
  const capDps = gRate > 1e-9 ? ((G_ONSET_CEILING / gRate) * 180) / Math.PI : limits.maxRateDps;
  const r = easeRoll(bankDeg, rate0, target, dt, { maxRateDps: Math.min(limits.maxRateDps, Math.max(capDps, 1)), maxAccelDps2: limits.maxAccelDps2 });
  // The backstop: this step's G change held to the onset, whatever the look-ahead missed.
  if (Math.abs(r.bankDeg) > Math.abs(bankDeg) && Math.abs(r.bankDeg) < GATE_G_MAX_BANK_DEG) {
    const gMax = gFromBankDeg(bankDeg) + G_ONSET_CEILING * dt;
    if (gFromBankDeg(r.bankDeg) > gMax + 1e-9) {
      const bank = Math.sign(r.bankDeg) * (Math.acos(1 / gMax) * 180) / Math.PI;
      return { bankDeg: bank, rollRateDps: (bank - bankDeg) / dt };
    }
  }
  return r;
}

/**
 * The envelope gate for a replayed planned pose (replay.js flyStep's poseTrack): the wings follow the pose's bank
 * through gateRoll, the near way round, until they catch it up; the path flown is the pose's. seg keeps whether the wings
 * are still catching up; bank0, rate0: the aircraft's before the pose.
 */
export function holdToEnvelope(a, seg, p, bank0, rate0) {
  const step = wrapDeg180(p.bank - bank0);
  const r = gateRoll(bank0, rate0, bank0 + step, STEP_SEC, ROLL, p.tas, a.kias);
  // The pose's own bank is flown when the gate gives it this step (within a roll step's rate change: the pose's roll rate).
  const within = Math.abs(wrapDeg180(r.bankDeg - p.bank)) < 1e-6 || (Math.abs(step) <= rollLimitAt(p.tas).maxRateDps * STEP_SEC + 1e-9 && !(Math.abs(p.bank) > Math.abs(r.bankDeg) + 1e-6 && Math.abs(p.bank) < GATE_G_MAX_BANK_DEG && gFromBankDeg(p.bank) > gFromBankDeg(bank0) + G_ONSET_CEILING * STEP_SEC + 1e-9));
  if (!seg.rollBehind && within) return;
  if (Math.abs(wrapDeg180(r.bankDeg - p.bank)) < 1e-6 && Math.abs(r.rollRateDps - p.roll) <= rollLimitAt(p.tas).maxAccelDps2 * STEP_SEC) {
    seg.rollBehind = false;
    return;
  }
  a.bankDeg = wrapDeg180(r.bankDeg);
  a.rollRateDps = r.rollRateDps;
  seg.rollBehind = true;
}

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
    nz: 1, // the vertical share of the G (1 + vertical acceleration / g): with bankDeg, where the lift points (liftBankDeg)
    climbFtps: 0,
    pitchDeg: attitudeDegFromClimb(0, tasFtps, kias, 1),
    turning: false,
    slowStage: null, // how it is slowing now (slow-down.js, TS-61), or null
    power: null, // its power setting for the tag (power.js, TS-62), or null when nothing sets it
    stretched: false, // held to full power and behind his planned place (full-power.js, TS-63)
  };
}

/** A copy that shares nothing with the original, for dry runs. */
/**
 * The bank the lift points along (Patrick 6 Oct 04:17Z: "the bank should follow the lift vector"; TS-108), for drawing and
 * reading out: the turn's sideways share (tan of bankDeg, the level-turn bank its turn rate gives, in g) and the vertical
 * share nz (1 + vertical acceleration / g) together, standard mechanics. A level turn reads its own bank; a pull up reads
 * less, a pull down to a lower line more, past 90° once the vertical share is below zero. A push (the G negative by
 * stepAircraft's sign rule) reads the turn's bank. The flight itself steps on the turn's bank.
 */
export function liftBankDeg(bankDeg, nz = 1) {
  const b = (Math.min(Math.abs(bankDeg), 89.9) * Math.PI) / 180;
  const side = Math.tan(b);
  if (!bankDeg || nz * Math.cos(b) + side * Math.sin(b) < 0) return bankDeg;
  return (Math.sign(bankDeg) * Math.atan2(side, nz) * 180) / Math.PI;
}

/** The push is taken only when its wings are this much nearer than the pull's: positive G is the pilot's way (estimate). */
const PUSH_MARGIN_DEG = 45;

/**
 * The wings' attitude, drawn and read out (a.attitudeDeg): where the lift points (liftBankDeg, TS-108), flown as a roll.
 * Of the pull (positive G) and the push (negative G) that give the same lift line: the pull whenever the lift points above
 * the horizon (nz above zero, the wings then upright); otherwise the one whose wings are nearer the wings a step ago, the push
 * only when PUSH_MARGIN_DEG nearer, so a descending turn that reverses rolls through and a wings-level push over stays
 * upright. The wings turn no faster than twice the aircraft's roll (rollLimitAt). Patrick 6 Oct 06:01Z: "2's bank angle
 * snaps unrealistically 180 degrees and studders". Until V2.133 every step chose afresh by the lift's sign alone; in V2.133
 * a pull-out after a push could lock the wings inverted at negative G. Sets a.g's sign to the one chosen. prev:
 * { attitudeDeg } a step ago. On a big dive (a.invertDive) the pull down is flown inverted, never a push (TS-129).
 */
export function flyAttitude(a, prev, dt, roll = ROLL) {
  const bank = a.bankDeg ?? 0;
  const nz = a.nz ?? 1;
  const side = Math.sign(bank) * Math.tan((Math.min(Math.abs(bank), 89.9) * Math.PI) / 180);
  const mag = Math.hypot(side, nz);
  const att0 = Number.isFinite(prev?.attitudeDeg) ? prev.attitudeDeg : liftBankDeg(bank, nz);
  const pull = (Math.atan2(side, nz) * 180) / Math.PI;
  const push = wrapDeg180(pull + 180);
  // A big dive's pull down (a.invertDive, TS-129) is always the pull: the wings roll past 90° and he pulls the nose down.
  const usePull = nz > 0 || a.invertDive || Math.abs(wrapDeg180(pull - att0)) <= Math.abs(wrapDeg180(push - att0)) + PUSH_MARGIN_DEG;
  const lift = usePull ? pull : push;
  const target = mag < 1e-6 ? att0 : lift;
  const maxStep = 2 * rollLimitAt(a.tasFtps, roll).maxRateDps * dt;
  a.attitudeDeg = wrapDeg180(att0 + Math.max(-maxStep, Math.min(maxStep, wrapDeg180(target - att0))));
  a.g = (usePull ? 1 : -1) * Math.abs(a.g ?? 1);
}

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
/** The smootherstep's greatest curvature (at u = 1/2 - 1/sqrt(12)): a height leg's greatest vertical acceleration is rise x this / span². */
export const SMOOTHER_CURVE_PEAK = 10 / Math.sqrt(3);

/** The shortest smooth height leg for a change of riseFt whose push and pull stay within g of level flight, seconds. */
export function smoothLegSec(riseFt, g) {
  return Math.sqrt((SMOOTHER_CURVE_PEAK * Math.abs(riseFt)) / (g * G_FTPS2));
}

/** The smootherstep's integral from 0 to u (its value at 1 is one half): the height a smooth change of rate covers. */
const smootherArea = (u) => u * u * u * u * (2.5 - 3 * u + u * u);

/**
 * A big dive flown as a pilot flies it, the lateral roll (TS-129, TS-131; Patrick 6 Oct 15:29Z: "Can straight down be a hesitation roll with power and g
 * and roll managed to roll out near the desired spot?"): the rate of descent builds up smoothly with the nose pulled down
 * inverted (the push of inG g below level flight, flown as a pull with the wings past 90°), holds, and comes off with the
 * pull-out (outG g above level flight). T: seconds, H: feet (positive). Returns { vd, ta, to } (the steady rate and the two
 * changes' seconds), or null when T is too short for H at these G.
 */
export function diveShape(T, H, inG, outG) {
  const k = (SMOOTHER_PEAK / (2 * G_FTPS2)) * (1 / inG + 1 / outG); // the time the two changes cost, per ft/s of rate
  const disc = T * T - 4 * k * H;
  if (!(H > 0) || disc < 0) return null;
  const vd = (T - Math.sqrt(disc)) / (2 * k);
  return { vd, ta: (SMOOTHER_PEAK * vd) / (inG * G_FTPS2), to: (SMOOTHER_PEAK * vd) / (outG * G_FTPS2) };
}

/** The shortest dive of H feet within inG and outG whose steady rate is no more than vMax ft/s (diveShape). */
export function diveMinSec(H, inG, outG, vMax) {
  const k = (SMOOTHER_PEAK / (2 * G_FTPS2)) * (1 / inG + 1 / outG);
  return vMax < Math.sqrt(H / k) ? H / vMax + k * vMax : 2 * Math.sqrt(k * H);
}

/** A dive leg (leg.dive: { inG, outG }) at time t: { altAboveFt, climbFtps, nz, invert }, or null when it does not fit. */
function diveAt(leg, t) {
  const T = leg.t1 - leg.t0;
  const H = leg.fromFt - leg.toFt;
  const shape = diveShape(T, H, leg.dive.inG, leg.dive.outG);
  if (!shape) return null;
  const { vd, ta, to } = shape;
  const x = Math.min(T, Math.max(0, t - leg.t0));
  let down;
  let rate;
  let acc;
  if (x < ta) {
    const u = x / ta;
    down = vd * ta * smootherArea(u);
    rate = vd * smoother(u);
    acc = -(vd * smootherSlope(u)) / ta;
  } else if (x <= T - to) {
    down = vd * ta * 0.5 + vd * (x - ta);
    rate = vd;
    acc = 0;
  } else {
    const u = (x - (T - to)) / to;
    down = vd * ta * 0.5 + vd * (T - to - ta) + vd * to * (u - smootherArea(u));
    rate = vd * (1 - smoother(u));
    acc = (vd * smootherSlope(u)) / to;
  }
  return { altAboveFt: leg.fromFt - down, climbFtps: -rate, nz: 1 + acc / G_FTPS2, invert: true };
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
    if (leg.table) return tableAt(leg, t);
    if (leg.dive) {
      const d = diveAt(leg, t);
      if (d) return d;
    }
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
 * A turn's gentler roll-out (seg.rollOutRoll: Lead's, with a close wingman in his wing plane; TS-126), once his roll-in has
 * settled to no faster than it: until then his own roll, so the gentle stop is never planned from a quick roll-in.
 */
const outRoll = (seg, a) => (seg?.rollOutRoll && Math.abs(a.rollRateDps ?? 0) <= seg.rollOutRoll.maxRateDps + 1e-9 ? seg.rollOutRoll : null);

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
        const rollOutChange = Math.abs(headingChangeRollingOut(a.bankDeg, a.rollRateDps, a.tasFtps, outRoll(seg, a) ?? seg.roll));
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
  const attitudeBefore = { attitudeDeg: a.attitudeDeg };
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
  // A turn segment may roll gentler (a close formation Lead); never past the envelope gate (gateRoll: the T-6A's roll at
  // this speed, TS-85; G onset and stall, TS-93).
  const rolled = gateRoll(a.bankDeg, a.rollRateDps, targetBank, dt, (seg?.rollingOut && outRoll(seg, a)) || seg?.roll || ROLL, tasBefore, a.kias);
  a.bankDeg = Math.abs(rolled.bankDeg) < 1e-9 ? 0 : rolled.bankDeg;
  a.rollRateDps = Math.abs(rolled.rollRateDps) < 1e-9 ? 0 : rolled.rollRateDps;
  const turned = stepTurnRad(tas, bankBefore, a.bankDeg);
  a.headingRad = wrapPi(headingBefore + turned);
  a.g = gFromBankDeg(a.bankDeg);
  a.turning = a.bankDeg !== 0 || plan.segments.length > 0;

  const height = heightAt(plan.profile, t + dt);
  a.nz = height?.nz ?? 1;
  a.invertDive = Boolean(height?.invert); // a big dive's pull down is flown inverted (TS-129, flyAttitude)
  if (height) {
    a.altAboveFt = height.altAboveFt;
    a.climbFtps = height.climbFtps;
    // The pull or push of the height change is charged as G (height as energy; until V2.82 a smooth height leg's pull was
    // free, so a 700 ft pop-up in 6 s cost nothing): the turn's sideways share (tan bank, in g) and the vertical share
    // (nz) together, standard mechanics; 1 / cos(bank) in a level turn, nz with the wings level. A push past zero G keeps
    // its sign (G-warm's push over). The sign is the lift's, along the wings' up axis (the vertical share times cos bank
    // plus the sideways share times sin bank), so a banked aircraft easing its descent through zero vertical G keeps
    // positive G; until V2.92 the sign was the vertical share's alone, a 2 G jump in one step (Fable's review, section 17).
    // flyAttitude then keeps whichever of pull or push follows on from the step before (V2.133-V2.135).
    if (height.nz !== undefined) {
      const side = Math.max(0, a.g * a.g - 1);
      const b = (Math.abs(a.bankDeg) * Math.PI) / 180;
      const lift = height.nz * Math.cos(b) + Math.sqrt(side) * Math.sin(b);
      a.g = Math.sign(lift || 1) * Math.sqrt(side + height.nz * height.nz);
    }
  } else {
    a.climbFtps = 0;
  }
  flyAttitude(a, attitudeBefore, dt, seg?.roll ?? ROLL); // the wings follow the lift as a roll, and set the G's sign
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
 * that share (1 in a level turn, where G = 1 / cos(bank)). Shown as the pilot's picture, less the fuselage datum (core
 * attitudeDegFromClimb; Patrick 6 Oct 06:20Z, "Both modules", TR-91): about -0.5 to -1° level at 220 KIAS.
 */
function pitchAboveHorizonDeg(a) {
  return attitudeDegFromClimb(a.climbFtps, a.tasFtps, a.kias, a.g * Math.cos((a.bankDeg * Math.PI) / 180));
}

/** True when the aircraft has flown every segment, its wings are level and no speed change is still running. */
export function planDone(a, plan) {
  return plan.segments.length === 0 && a.bankDeg === 0 && a.rollRateDps === 0 && !plan.speedLeg;
}
