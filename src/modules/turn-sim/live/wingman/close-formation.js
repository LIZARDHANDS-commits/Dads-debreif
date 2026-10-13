// The close-formation technique (B1, TS-226; spec 7b.6, 7b.6c, 7b.6d): what the wingman wants from his controls each step,
// as a pilot holds echelon. Two parts (Patrick 13 Oct 2026: "formation is all about seeing lead do something, reacting to it
// smoothly, and staying 'in position'"):
//
//  1. Reacting to Lead (feed-forward): Lead's lift as he sees it (Lead's G along Lead's lift line), turned to the bank Lead
//     will have when his hands act (Lead's bank dead-reckoned 0.3 s ahead, perception.js), plus his place's own motion as
//     Lead rolls (the pitch feed-forward, 7b.6d item 4); and the holding power for what the formation is doing (below).
//  2. Staying in position (feedback): three loops, one per control, each core pilotAxis (P and D on what he sees, a weak
//     trim, the soft threshold), in Lead's wing frame: pitch (G) on up and down (the plane axis); roll (lift along Lead's
//     wing line, i.e. bank off Lead's) on in and out; power (torque) on forward and back (spec 7b.6c's table). His
//     deviation is read on Patrick's plane, line, hinge axes (perception.js) and turned into up, in and out, and forward
//     and back; the supervisor shows the loops its share of each in plane-line-hinge order (supervisor.js).
//
// The pace (spec 7b.6c, "Power is a cascade"; 7b.6d item 13): in Lead's wing plane one pace points straight at his place,
// kPos per foot near it (a linear taper, so a few feet is a gentle drift), never over the jogging pace (8 ft/s in B1) and
// never faster than he can stop from on the spot: sqrt(2 x braking x distance), the braking the power floor gives for the
// power's share of the move and the job's bank for the rest, after his reaction and the torque's walk to the floor. Roll and
// power both close that pace on the closure he sees, so a move along the line is bank and power together (7b.3). Holding it
// under the pace is done by shortening the distance the loops are shown, so the D term still acts on the motion he sees and
// a hand-over already moving at pace is not braked (bumpless).
//
// Holding power (spec 7b.6 "The holding setting moves with the turn"): power.js powerFor at the formation's briefed speed
// (echelon 200 KIAS, slots.js; not an instrument he looks at, 7b.6d item 13) and the G he feels, plus the turn's share (his
// circle wider or tighter: g x his place's offset x sin(bank) / speed more or less speed, spec 7b.6), the roll-in's share
// (his place climbing or descending as Lead rolls) and his own climb or descent onto the plane, both charged as climb, so
// power goes with pitch; plus the power loop's trim (zero in B1).
//
// The correction is one lift vector in Lead's wing frame added to the feed-forward lift, handed to fluid-lead.js stepLead
// as `lift` (core gAndBankForLift reads it into his G and bank), as fluid-wing-live.js does (7b.6d item 8).
//
// Signs and units as perception.js; torque in percent. The memory is never changed in place. Numbers: wing-moves.js
// CLOSE_WING.
import { pilotAxis } from '../../../../core/flight-math.js';
import { iasToTasKt } from '../../../../core/t6-performance.js';
import { DEG } from '../../../../core/angles.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../../core/units.js';
import { STEP_SEC } from '../flight.js';
import { powerFor, throttleAtTorque, ktpsAtThrottle } from '../power.js';
import { LINE_BACK_PER_OUT, FOUR_FORMATIONS } from '../slots.js';
import { CLOSE_WING, CLOSE_SEE } from '../wing-moves.js';
import { add3, scale3, perp3 } from '../attitude.js';

const C = CLOSE_WING;

/** Torque (%) for a throttle (the model's share of full-power thrust) at kias and altFt: power.js throttleAtTorque turned round (it is linear in the torque). */
export function torqueFromThrottle(throttle, kias, altFt) {
  return throttle / throttleAtTorque(1, kias, altFt);
}

/** The formation's briefed speed, KIAS (slots.js: echelon 200; spec 7b.6d item 13). */
export function briefedKias(key) {
  return FOUR_FORMATIONS[key]?.kias ?? FOUR_FORMATIONS.echelon.kias;
}

/** The technique's memory at the start: each loop's trim at zero (spec 7b.6c: the trim starts at zero). */
export function startLaw() {
  return { plane: { i: 0 }, side: { i: 0 }, fore: { i: 0 } };
}

/**
 * The holding power, torque %: powerFor at the briefed speed and the G he feels, the climbs, and the turn's share of speed.
 * seen: perception.js; st: his own state (stepLead's); place: his slots.js place; key: the formation.
 */
export function holdingTorque(seen, st, place, key) {
  const kias = briefedKias(key);
  const altFt = st.pm.z;
  const tasRatio = iasToTasKt(kias, altFt) / kias;
  // The turn's share: the same turn rate on a circle wider or tighter by his place's offset across Lead's wing line, so
  // more speed outside the turn and less inside (spec 7b.6; zero straight and level). True airspeed, turned into indicated.
  const bank = seen.bankDeg * DEG;
  const dTasFtps = (-G_FTPS2 * place.left * Math.sin(bank)) / Math.max(st.V, 1);
  const dKias = dTasFtps / KT_TO_FTPS / tasRatio;
  // The roll-in's share: his place's vertical speed as Lead rolls (rigid-body: -p·left along the lift line, p·up along the
  // wing line), on top of Lead's own climb, charged as climb; and his own climb or descent onto the plane and the G he
  // feels, so power goes with pitch (Patrick 13 Oct 2026: "you stay in position by using coordination of all of the
  // controls at once"; standard energy: a 3 ft descent onto the plane is about 0.25 ft/s of speed at 200 KIAS).
  const p = seen.rollDps * DEG;
  const f = seen.frame;
  const placeClimb = -p * place.left * f.up.z + p * place.alt * f.left.z;
  const ownClimb = seen.rate.plane * f.up.z;
  const power = powerFor(0, kias + dKias, altFt, st.g, seen.climbFtps + placeClimb + ownClimb);
  return power ? torqueFromThrottle(power.throttle, kias + dKias, altFt) : 0;
}

/** The in-plane braking he can count on to stop (ft/s², true): from the holding setting down to the power floor's torque. */
function brakingFtps2(seen, st, key) {
  const kias = briefedKias(key);
  const altFt = st.pm.z;
  const ktps = ktpsAtThrottle(throttleAtTorque(C.brakeTorquePct, kias, altFt), kias, altFt, seen.g);
  return Math.max(0.1, -ktps) * KT_TO_FTPS * (iasToTasKt(kias, altFt) / kias);
}

/**
 * One step of the technique. mem: startLaw's; seen: perception.js; job: supervisor.js; ctx { st (his state), side (+1 left
 * of Lead), key (the formation), holdPct (holdingTorque), held { plane, side, fore } (each control at its limit last step:
 * the trims are held still, anti-windup) }. Returns { mem, want: { upCorrG, leftCorrG, torquePct, holdPct } }: the pitch
 * and roll corrections in G (along Lead's lift line, and along his wing line, left +) and the torque he wants.
 */
export function closeLaw(mem, seen, job, { st, side, key, holdPct, held }) {
  const j = C.jobs[job.kind];
  const m = job.masks;
  const k = LINE_BACK_PER_OUT;
  const n = Math.hypot(1, k);
  // The deviation shown to the loops (plane, line, hinge), turned into forward and out (away from Lead), and its rate.
  const eLine = m.line * seen.dev.line;
  const eAlong = m.along * seen.dev.along;
  let eFwd = (eLine - k * eAlong) / n;
  let eOut = (k * eLine + eAlong) / n;
  const rFwd = (seen.rate.line - k * seen.rate.along) / n;
  const rOut = (k * seen.rate.line + seen.rate.along) / n;
  let ePlane = m.plane * seen.dev.plane;
  // Gains: each loop's D (per ft/s of pace error) and P = D x the pace per foot near the spot, the same for both in-plane
  // loops so the pace points straight at his place. Roll's are degrees of bank off Lead's, read as lift across his wing
  // line at Lead's G.
  const gRef = Math.max(seen.g, 0.5);
  const kPos = C.kPosPerSec;
  const rollKd = C.side.kdDegPerFtps * DEG * gRef;
  const roll = { kp: rollKd * kPos, kd: rollKd, ki: C.side.ki, iMax: C.side.iMax };
  const fore = { kp: C.fore.kdPctPerFtps * kPos, kd: C.fore.kdPctPerFtps, ki: C.fore.ki, iMax: C.fore.iMax };
  // The pace in the plane: kPos per foot near the spot, never over the jogging pace, and never faster than he can stop from
  // on the spot: the braking along this way (the power's share stopped at the floor's braking, the bank's share at the
  // job's bank), after his reaction and the torque's walk down to the floor (half the walk, on average).
  const dist = Math.hypot(eFwd, eOut);
  if (dist > 1e-9) {
    const byPower = brakingFtps2(seen, st, key) / Math.max(Math.abs(eFwd) / dist, 1e-6);
    const byBank = (G_FTPS2 * gRef * Math.sin(j.bankCapDeg * DEG)) / Math.max(Math.abs(eOut) / dist, 1e-6);
    const b = Math.min(byPower, byBank);
    const lag = CLOSE_SEE.delaySec + Math.max(0, holdPct - C.brakeTorquePct) / (2 * j.torquePctps);
    const stopFtps = b * (Math.sqrt(lag * lag + (2 * dist) / b) - lag);
    const pace = Math.min(C.paceFtps, stopFtps, kPos * dist);
    eFwd *= pace / (kPos * dist);
    eOut *= pace / (kPos * dist);
  }
  // Up and down the same: never over the jogging pace, nor faster than the job's G stops him from.
  const vPlane = (C.plane.kp / C.plane.kd) * Math.abs(ePlane);
  const pacePlane = Math.min(C.paceFtps, Math.sqrt(2 * j.gCap * G_FTPS2 * Math.abs(ePlane)));
  if (vPlane > pacePlane && vPlane > 0) ePlane *= pacePlane / vPlane;
  // The soft threshold (7b.6d item 11; wing-moves.js CLOSE_WING deadFt and deadFtps, where D's is off for now, waiting on
  // Patrick: see the note there).
  const soft = { deadFt: C.deadFt, deadFtps: C.deadFtps };
  const up = pilotAxis(mem.plane, ePlane, seen.rate.plane, STEP_SEC, { ...C.plane, ...soft, hold: held.plane });
  const out = pilotAxis(mem.side, eOut, rOut, STEP_SEC, { ...roll, ...soft, hold: held.side });
  const pwr = pilotAxis(mem.fore, eFwd, rFwd, STEP_SEC, { ...fore, ...soft, hold: held.fore });
  // Under Lead he does not come up until he is out (supervisor.js upOk): no correction upward.
  const upCorrG = job.upOk ? up.out : Math.min(0, up.out);
  return {
    mem: { plane: up.mem, side: out.mem, fore: pwr.mem },
    want: { upCorrG, leftCorrG: side * out.out, torquePct: holdPct + pwr.out, holdPct },
  };
}

/**
 * The one lift vector (in G) he asks his aircraft for: Lead's lift as he sees it, turned to Lead's bank 0.3 s ahead, plus
 * his place's motion, plus the pitch and roll corrections (hand: the shaper's), square to his own nose (st: his state).
 */
export function liftFor(seen, st, hand) {
  const f = seen.frame;
  const d = (seen.bankAheadDeg - seen.bankDeg) * DEG; // the roll still to come across his delay (left wing down +)
  const up = add3(scale3(f.up, Math.cos(d)), scale3(f.left, Math.sin(d)));
  const left = add3(scale3(f.left, Math.cos(d)), scale3(f.up, -Math.sin(d)));
  const lift = add3(scale3(up, seen.g + seen.ffUpG + hand.upCorrG), scale3(left, seen.ffLeftG + hand.leftCorrG));
  return perp3(lift, st.nose);
}
