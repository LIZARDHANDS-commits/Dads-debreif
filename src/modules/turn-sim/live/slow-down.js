// Slowing down in the Formation Sim: power, the speed brake ("boards") and idle (decision TS-61; Patrick 4 Oct 2026
// 23:29Z-23:58Z and 5 Oct 00:11Z-00:48Z). It replaces the fixed 1.5 kt/s slow-down estimate everywhere an aircraft in the
// Formation Sim slows. It is a Formation-only helper: the core drag and thrust curves (src/core/t6-performance.js) are
// used as they are and not changed, so Fight Sim and Traffic fly exactly as before.
//
// The stages, in Patrick's order of use (23:37-23:38Z; SMM 12.26 para 63, 12.27 paras 64-66, SMM para 33): geometry first
// (the planners' business, not this file's), then a set, controlled overtake held with power, then the speed brake, then
// idle, then the overshoot (the planner's decision at the decision point).
//   power       part power: core excessFnFor(throttle). Its slowest is throttle 0 of excessFnFor (POWER_FLOOR_THROTTLE): the
//               prop gives no thrust and adds no drag of its own, the airframe's clean drag alone slows the aircraft. Where
//               "power" ends and "idle" begins is an estimate (the torque below which the blades go to full fine).
//   boards      power at its floor plus the speed brake.
//   idle        no thrust, and the idle prop's drag on top of the clean airframe's (the blades go full fine at idle,
//               Patrick 23:38Z: "LOTS of drag").
//   idleBoards  idle and the speed brake together.
//
// Units: knots indicated (KIAS), feet, seconds. Rates are in KIAS per second at the block height: the true airspeed's rate
// from the excess force (standard aerodynamics, dV/dt = g (T - D) / W), times KIAS / KTAS there.
import { dragPerWeight, excessFnFor, excessThrustPerWeight, iasToTasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, FTPS_TO_KT } from '../../../core/units.js';
import { smoother, smootherSlope } from './flight.js';

/**
 * The idle prop's extra drag ÷ weight: 0.16 at 200 KIAS, growing with dynamic pressure (KIAS²). Sized so Patrick's overhead
 * break (level, 2 G, 60° of bank, 220 to about 130 KIAS in 180°, 23:44Z) takes 180° on the core drag curve at zero thrust;
 * level at 1 G it gives about 5 kt/s at 200 KIAS, which Patrick confirmed ("probably closer to 5", 5 Oct 00:11Z). The growth
 * with KIAS² is an estimate. TS-61 (2).
 */
export const IDLE_PROP = Object.freeze({ dragPerWeight: 0.16, atKias: 200 });

/**
 * The speed brake's extra drag ÷ weight: about 0.095 at 200 KIAS, growing with dynamic pressure (KIAS²). A perforated flat
 * plate (Patrick 00:48Z: "a flat plate with holes as the size of the speed brake"): a single ventral panel opening to 70°
 * (NFM p.1-39), about 5 sq ft (about 4 by 1.25 ft: a GUESS, no manual gives the size), so about 4.7 sq ft face-on, Cd about
 * 0.9 (perforated plate, standard aerodynamics), a drag area of about 4.2 sq ft; at 6,000 lb (the NFM examples' weight) and
 * 135 lb/sq ft of dynamic pressure (200 KIAS) that is about 570 lb, 0.095 of the weight: about +1.7 kt/s level at 200 KIAS.
 * TS-61 (3).
 */
export const BOARDS = Object.freeze({ dragPerWeight: 0.095, atKias: 200, panelSqFt: 5, openDeg: 70, cd: 0.9, dragAreaSqFt: 4.2, weightLb: 6000 });

/** The slowest "power" setting: throttle 0 of core excessFnFor (no thrust and no extra prop drag). An estimate, TS-61. */
export const POWER_FLOOR_THROTTLE = 0;

/** The stages in Patrick's order of use (TS-61 (1)). */
export const STAGES = Object.freeze(['power', 'boards', 'idle', 'idleBoards']);

/** What the card and the tags say for a stage: nothing for power (a set overtake held with power is the normal way). */
export const STAGE_WORDS = Object.freeze({ power: null, boards: 'BOARDS', idle: 'IDLE', idleBoards: 'IDLE + BOARDS' });

const hasBoards = (stage) => stage === 'boards' || stage === 'idleBoards';
const atIdle = (stage) => stage === 'idle' || stage === 'idleBoards';

/** The extra drag ÷ weight a stage adds to the clean airframe at an indicated airspeed: the idle prop, the speed brake, or both. */
export function extraDragPerWeight(stage, kias) {
  let extra = 0;
  if (atIdle(stage)) extra += IDLE_PROP.dragPerWeight * (kias / IDLE_PROP.atKias) ** 2;
  if (hasBoards(stage)) extra += BOARDS.dragPerWeight * (kias / BOARDS.atKias) ** 2;
  return extra;
}

/**
 * (Thrust - drag) ÷ weight in a stage, at kias, the block height altFt and load factor g. power and boards fly at
 * `throttle` of core excessFnFor (the power floor by default); idle has no thrust and the idle prop's drag. Negative: slowing.
 */
export function excessPerWeight(stage, kias, altFt, g = 1, throttle = POWER_FLOOR_THROTTLE) {
  const base = atIdle(stage) ? -dragPerWeight(kias, altFt, g) : excessFnFor(throttle)(iasToTasKt(kias, altFt), altFt, g);
  return base - extraDragPerWeight(stage, kias);
}

/** KIAS per second from an excess force ÷ weight at kias and altFt. */
function ktpsFrom(excess, kias, altFt) {
  return excess * G_FTPS2 * FTPS_TO_KT * (kias / iasToTasKt(kias, altFt));
}

/** Full-power acceleration at an indicated speed, in KIAS per second (the core's excess thrust at maximum power, at g; 1 G by default). */
export function fullPowerKtps(kias, altFt, g = 1) {
  return ktpsFrom(excessThrustPerWeight(kias, altFt, g), kias, altFt);
}

/** The most a stage slows the aircraft (KIAS per second, a positive number) at kias, altFt and g, power and boards at `throttle` (the floor by default). */
export function slowKtps(stage, kias, altFt, g = 1, throttle = POWER_FLOOR_THROTTLE) {
  return Math.max(0, -ktpsFrom(excessPerWeight(stage, kias, altFt, g, throttle), kias, altFt));
}

/**
 * The first stage, in the order of use, that slows the aircraft at least `needKtps` (KIAS per second) at kias, altFt and g,
 * no further than `top`: { stage, ok } (ok false when even `top` can't).
 */
export function stageFor(needKtps, kias, altFt, g = 1, top = 'idleBoards') {
  const last = STAGES.indexOf(top);
  for (let i = 0; i <= last; i++) if (slowKtps(STAGES[i], kias, altFt, g) >= needKtps) return { stage: STAGES[i], ok: true };
  return { stage: STAGES[last], ok: false };
}

/**
 * The average rate (KIAS per second) of a smooth slow-down from `from` to `to` KIAS (flight.js's smootherstep speed ramp)
 * whose steepest point never asks more than `stage` gives at the speed it is at then, level: the slow-down a pilot holds
 * with that stage set.
 */
export function slowRampKtps(from, to, altFt, stage = 'power') {
  const d = to - from;
  let rate = Infinity;
  for (let i = 1; i < 400; i++) {
    const u = i / 400;
    rate = Math.min(rate, slowKtps(stage, from + d * smoother(u), altFt) / smootherSlope(u));
  }
  return rate;
}

/**
 * A flight.js speed segment from `from` to `to` KIAS: full power to speed up (the core's excess thrust at the middle speed),
 * and to slow down the stage given (power by default), at the most it gives on the smooth ramp. The stage rides on the
 * segment so the card and tags can say BOARDS or IDLE.
 */
export function speedSegFor(from, to, altFt = 8000, stage = 'power') {
  if (to > from) return { kind: 'speed', toKias: to, rateKtps: fullPowerKtps((from + to) / 2, altFt) };
  return { kind: 'speed', toKias: to, rateKtps: slowRampKtps(from, to, altFt, stage), stage };
}

/** The word for an aircraft's slowing stage now (aircraft.slowStage, set by flight.js and the planned lines), or null. */
export function slowWord(a) {
  return (a?.slowStage && STAGE_WORDS[a.slowStage]) || null;
}
