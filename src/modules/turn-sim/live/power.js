// The power setting each aircraft's tag shows (Patrick 5 Oct 01:44Z: "I want tags on the aircraft to show their power
// setting, red letters for IDLE and IDLE+BOARDS or BOARDS as well"; 02:05Z: "Any way we can ratify pwr with a tq
// reading?"; TS-62, spec section 10.5). Formation Sim only: the core curves are used as they are, not changed.
//
// An aircraft's power is { stage, throttle, kias, altFt } or null when nothing that flies it sets its power (then the tag
// shows no power line rather than a guess). stage: null on power, or slow-down.js 'boards', 'idle', 'idleBoards'.
// The throttle is the MODEL's throttle: the share of full-power thrust (core thrustPerWeight) that gives the acceleration
// and climb being flown against the drag (core dragPerWeight, plus the speed brake's when it is out), excess = throttle x
// thrust - drag (core excessFnFor; standard aerodynamics, dV/dt = g (T - D) / W - g sin(climb angle)).
//
// Torque (TQ %) from it (02:05Z): TQ% = thrust x TAS / (eta x 1,100 shp) x 100, capped at 100.
//  - thrust: throttle x thrustPerWeight x weight, at 6,000 lb (the reference examples' weight; an ESTIMATE of the weight flown);
//  - 1,100 shp: the PT6A-68 is flat rated to 1,100 shp, "100% torque available" (reference);
//  - eta 0.81 (an ESTIMATE): the model's own full-power thrust power at 200 KIAS divided by 1,100 shp (0.80 at sea level,
//    0.81 at about 3,000 ft, 0.82 at 8,000 ft), so full power at 200 KIAS reads 100%.
// Checked against SMM Table 8.1's instrument torque settings (approximate checks, not pins): level 180 KIAS clean about
// 43% (SMM 40-45%; this model gives 39% at sea level to 44% at 8,000 ft); level 120 KIAS with gear and T/O flap about 36%
// (SMM low approach and circling 35%) and a 3° glidepath at 120 KIAS about 22% (SMM precision final 25%), those two worked
// out in the coordinator's brief with gear and flap drag this model does not have. Above 200 KIAS full power works out
// over 100%: it shows MAX.
import { dragPerWeight, thrustPerWeight, iasToTasKt } from '../../../core/t6-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { extraDragPerWeight, excessPerWeight } from './slow-down.js';
import { POWER_MAX_FROM, ENGINE } from './handling.js';

/** The block height a power is worked out at when the caller doesn't know it: the formation's default (formation.js, an estimate). */
export const POWER_BLOCK_FT = 8000;
/** The torque reading's numbers (Patrick 02:05Z): 1,100 shp flat rating (reference); eta and the weight are estimates. */
export const TORQUE = Object.freeze({ ratedShp: 1100, eta: 0.81, weightLb: 6000 });
const FT_LB_PER_S_PER_HP = 550;

/**
 * The model's throttle (share of full-power thrust) that flies an indicated-speed rate of ktps (KIAS per second) at kias,
 * height altFt, load factor g and climb rate climbFtps, with the stage's extra drag (the speed brake). Below 0 or above
 * 1 when the line asks more slowing or more speed than power alone gives (the caller decides what that means).
 */
export function throttleFor(ktps, kias, altFt = POWER_BLOCK_FT, g = 1, climbFtps = 0, stage = null) {
  const k = Math.max(kias, 1);
  const ktas = iasToTasKt(k, altFt);
  const accelFtps2 = ktps * (ktas / k) * KT_TO_FTPS; // the true airspeed's rate
  const excess = accelFtps2 / G_FTPS2 + climbFtps / Math.max(ktas * KT_TO_FTPS, 1);
  const extra = stage === 'boards' ? extraDragPerWeight('boards', k) : 0;
  return (excess + dragPerWeight(k, altFt, g) + extra) / thrustPerWeight(k, altFt);
}

/** Torque in percent for a throttle at kias and altFt (the formula at the top of this file), capped at 100. */
function torquePct(throttle, kias, altFt = POWER_BLOCK_FT) {
  const k = Math.max(kias, 1);
  const thrustLb = Math.max(0, throttle) * thrustPerWeight(k, altFt) * TORQUE.weightLb;
  const shp = (thrustLb * iasToTasKt(k, altFt) * KT_TO_FTPS) / FT_LB_PER_S_PER_HP;
  return Math.min(100, (100 * shp) / (TORQUE.eta * TORQUE.ratedShp));
}

/**
 * The throttle (share of full-power thrust) that gives `pct` % torque at kias and altFt: the torque formula above turned
 * round, not capped (a rejoin's 5% torque floor, REJOIN.floorTorquePct).
 */
export function throttleAtTorque(pct, kias, altFt = POWER_BLOCK_FT) {
  const k = Math.max(kias, 1);
  const shp = (pct / 100) * TORQUE.eta * TORQUE.ratedShp;
  const thrustLb = (shp * FT_LB_PER_S_PER_HP) / Math.max(iasToTasKt(k, altFt) * KT_TO_FTPS, 1);
  return thrustLb / (thrustPerWeight(k, altFt) * TORQUE.weightLb);
}

/**
 * The indicated-speed rate (KIAS per second) a throttle gives at kias, altFt, load factor g and climb rate climbFtps, on
 * power (no boards): throttleFor turned round (standard energy, dV/dt = g ((T - D) / W - sin climb)).
 */
export function ktpsAtThrottle(throttle, kias, altFt = POWER_BLOCK_FT, g = 1, climbFtps = 0) {
  const k = Math.max(kias, 1);
  const ktas = iasToTasKt(k, altFt);
  const excess = throttle * thrustPerWeight(k, altFt) - dragPerWeight(k, altFt, g) - climbFtps / Math.max(ktas * KT_TO_FTPS, 1);
  return ((excess * G_FTPS2) / KT_TO_FTPS) * (k / ktas);
}

// ---- The engine: how the power follows the PCL (TS-218) -------------------------------------------------------------
//
// One model for every aircraft (Patrick 12 Oct 2026, TS-218; numbers in handling.js ENGINE). The engine is a state carried
// from step to step, { thr, lowSec, lagSec }:
//  - thr: the throttle the engine gives now (the model's share of full-power thrust, as above); null when nothing is
//    known of it (a fresh aircraft), and then the first throttle asked is taken at once, as before TS-218;
//  - from 5% torque up, thr follows the throttle asked at the quick rate, the full travel in ENGINE.quickSec (0.25 s),
//    up or down;
//  - lowSec: how long the torque has sat below ENGINE.idleTorquePct (5%), i.e. idle. Once it has sat there at least
//    ENGINE.idleSettleSec (1 s, an estimate: a brief dip is not "gone idle"), the PCL advanced past idle starts the lag:
//  - lagSec: the lag still to run. For ENGINE.idleLagSec (3.5 s) after the PCL is advanced the power does not rise at all;
//    then it follows at the quick rate. Delay then rise is chosen over a gentler ramp because Patrick's words are a lag
//    ("once you go idle and the prop feathers there is lag"; "it's 3-4 seconds"), not a slow climb (an estimate of the
//    shape). Pulled back to idle during the lag, the advance is off; the next one, still from a settled idle, lags in full.
// A power reduction is never lagged. Each pilot asks for his throttle; what the engine gives is what the step flies.
// Formation pilots avoid idle because of the lag (TS-218): Lead keeps 20% or more (TS-216, lead-moves.js LEAD_POWER).

/** The engine of an aircraft from its power now (its tag's power; power.eng when an engine flew it): unknown when none. */
export function engineFrom(power) {
  if (power?.eng) return { ...power.eng };
  if (!power) return { thr: null, lowSec: 0, lagSec: 0 };
  const idle = power.stage === 'idle' || power.stage === 'idleBoards';
  return { thr: idle ? 0 : Math.max(0, Math.min(1, power.throttle ?? 0)), lowSec: 0, lagSec: 0 };
}

/**
 * One step of the engine (the model above): the engine `eng` with the throttle `wantThr` asked (clamped to 0..1) at kias and
 * altFt, over dt seconds. Returns the new engine; eng is not changed.
 */
export function engineStep(eng, wantThr, kias, altFt, dt) {
  const want = Math.max(0, Math.min(1, Number.isFinite(wantThr) ? wantThr : 0));
  if (!eng || eng.thr === null || eng.thr === undefined) return { thr: want, lowSec: 0, lagSec: 0 };
  const idle = (thr) => torquePct(thr, kias, altFt) < ENGINE.idleTorquePct;
  let { thr, lowSec, lagSec } = eng;
  const advanced = want > thr + 1e-9 && !idle(want);
  if (!advanced) lagSec = 0;
  else if (lagSec <= 0 && idle(thr) && lowSec >= ENGINE.idleSettleSec - 1e-9) lagSec = ENGINE.idleLagSec;
  if (lagSec > 0) {
    lagSec = Math.max(0, lagSec - dt);
    if (lagSec <= 1e-9) {
      lagSec = 0;
      lowSec = 0; // spooled up: from the next step the power rises at the quick rate
      return { thr, lowSec, lagSec };
    }
    return { thr, lowSec: lowSec + dt, lagSec };
  }
  const step = dt / ENGINE.quickSec;
  thr += Math.max(-step, Math.min(step, want - thr));
  return { thr, lowSec: idle(thr) ? lowSec + dt : 0, lagSec: 0 };
}

/** A power (powerFrom's) with the engine that flew it, so the next pilot of the aircraft carries it on (engineFrom). */
export function withEngine(power, eng) {
  return power && eng ? { ...power, eng } : power;
}

const RANK = Object.freeze({ power: 0, boards: 1, idle: 2, idleBoards: 3 });

/**
 * The power that flies an indicated-speed rate ktps (with climb and G) using no more than `top` (the planned way of
 * slowing, slow-down.js; null is power): the least in Patrick's order of use that gives it (TS-61), so the ends of a
 * planned slow-down, where it barely slows, read as power and not as boards or idle. Where even `top` can't give it, `top`.
 * `floorThrottle`: the least throttle before the boards (0, or a rejoin's 5% torque, throttleAtTorque).
 */
export function powerFor(ktps, kias, altFt = POWER_BLOCK_FT, g = 1, climbFtps = 0, top = null, floorThrottle = 0) {
  const r = RANK[top ?? 'power'] ?? 0;
  const onPower = throttleFor(ktps, kias, altFt, g, climbFtps);
  if (onPower >= floorThrottle || r === 0) return powerFrom(null, Math.max(onPower, floorThrottle), kias, altFt);
  const withBoards = throttleFor(ktps, kias, altFt, g, climbFtps, 'boards');
  if (withBoards >= floorThrottle || r === 1) return powerFrom('boards', Math.max(withBoards, floorThrottle), kias, altFt);
  // At idle there is no throttle: idle alone if the slowing asked is no more than idle gives, else idle and the boards.
  const k = Math.max(kias, 1);
  const ktas = iasToTasKt(k, altFt);
  const asked = (ktps * (ktas / k) * KT_TO_FTPS) / G_FTPS2 + climbFtps / Math.max(ktas * KT_TO_FTPS, 1);
  const idleOnly = asked >= excessPerWeight('idle', k, altFt, g);
  return powerFrom(idleOnly || r === 2 ? 'idle' : 'idleBoards', 0, kias, altFt);
}

/**
 * An aircraft's power: its slowing stage (slow-down.js) and the throttle it flies, at kias and altFt; null when the
 * throttle is not known (idle has none to know: it is idle).
 */
export function powerFrom(stage, throttle, kias, altFt = POWER_BLOCK_FT) {
  const st = stage === 'boards' || stage === 'idle' || stage === 'idleBoards' ? stage : null;
  if (st === 'idle' || st === 'idleBoards') return { stage: st, throttle: 0, kias, altFt };
  if (throttle === null || throttle === undefined || !Number.isFinite(throttle)) return null;
  return { stage: st, throttle, kias, altFt };
}

/**
 * The tag's power line: { text, red } or null. MAX at full power; TQ nn% at part power (the torque above); IDLE,
 * IDLE+BOARDS, or TQ nn% + BOARDS (power set and the speed brake out), the last three in red letters.
 */
export function powerWord(power) {
  if (!power) return null;
  if (power.stage === 'idle') return { text: 'IDLE', red: true };
  if (power.stage === 'idleBoards') return { text: 'IDLE+BOARDS', red: true };
  const tq = Math.round(torquePct(power.throttle, power.kias, power.altFt ?? POWER_BLOCK_FT));
  const set = power.throttle >= POWER_MAX_FROM || tq >= 100 ? 'MAX' : `TQ ${tq}%`;
  if (power.stage === 'boards') return { text: `${set} + BOARDS`, red: true };
  return { text: set, red: false };
}
