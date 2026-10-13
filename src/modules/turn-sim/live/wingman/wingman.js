// The close-formation wingman, one step (B1, TS-226; spec 7b.2 and 7b.8): Lead flies → perception (what he sees, 0.3 s
// late) → supervisor (the job) → close-formation technique (the correction on each axis, and the holding power) → shaper
// (pressure-sized inputs) → his aircraft, the same point mass as Lead's (fluid-lead.js stepLead, TS-225) → his new place
// goes back into what he sees. Not wired into the formation yet (plan 12.4 B1, T5): nothing calls this outside the probes.
//
// Frames and signs (one place for them, spec 7b.8 and the audit's gap "units and signs in one place"):
//  - World: feet and seconds; x east, y north, z up (heights absolute, the block included, as stepLead's st.pm).
//  - The aircraft he flies off (`ref`, Lead in the 2-ship; written for the one ahead in the 4-ship later): only its
//    position, velocity and body up are read (perception.js seenOf; TS-211), never its plan, roll rate, roll acceleration
//    or G.
//  - Its frame: nose along its velocity, up its body up, left = up × nose. Bank and roll rate left wing down positive (the
//    Turn Sim's way). stepLead's own st.bank is the point mass's way, right wing down positive: never mixed here, because
//    he asks stepLead for a lift vector, not a bank.
//  - His deviation: off the plane (+ above Lead's wing plane), off the line (+ ahead of the spinner-to-wingtip line), along
//    the line (+ out, away from Lead); his place from slots.js (echelon about 18 ft back, 43 ft out, 3 ft down).
//  - His controls: G along Lead's lift line, lift along Lead's wing line (bank off Lead's; left +), torque in percent
//    (turned into stepLead's throttle with power.js throttleAtTorque at his own speed and height).
//  - Steps of 0.05 s (flight.js STEP_SEC). No randomness (spec 7b.6d item 11).
//
// The state `w` is never changed in place: stepWingman returns a new one. startFrom fills it from the motion he already
// has (bumpless, 7b.6d item 2): his memory of the picture over the last 0.3 s (from his velocity and the acceleration the
// tracker hands over, kinematic.js handOverAt), the job for what he sees, the trims at zero and his torque as it is, so the
// first step reads the picture as it is moving, from the tracker's up to 8 ft/s, and nothing lurches.
import { leadStateOf, stepLead } from '../fluid-lead.js';
import { applyPose } from '../kinematic.js';
import { poseOf3d } from '../attitude.js';
import { pairSlot } from '../slots.js';
import { throttleAtTorque, powerFrom, withEngine } from '../power.js';
import { STEP_SEC } from '../flight.js';
import { startPerception, perceive, look, seenOf } from './perception.js';
import { startJob, supervise } from './supervisor.js';
import { startLaw, holdingTorque, closeLaw, liftFor, torqueFromThrottle } from './close-formation.js';
import { startHand, shape } from './shaper.js';

const vec = (a) => (a ? { x: a[0], y: a[1], z: a[2] } : null);

/**
 * The wingman's state from his aircraft (flight.js fields; a tracker hand-over's velFtps and accFtps2 when it has them)
 * and the state of the aircraft he flies off (refSt: stepLead's or leadStateOf's). opts: { blockFt, key (the close
 * formation, slots.js), side (+1 left of it, -1 right), refAcc (its acceleration, ft/s², if known) }.
 */
export function startFrom(aircraft, refSt, { blockFt, key = 'echelon', side, refAcc = null }) {
  const st = leadStateOf(aircraft, blockFt);
  const place = pairSlot(key, side);
  const per = startPerception(seenOf(refSt), seenOf(st), { place, side, refAcc, ownAcc: vec(aircraft.accFtps2) });
  const seen = look(per);
  const job = startJob(seen);
  const holdPct = holdingTorque(seen, st, place, key);
  const torquePct = st.eng?.thr !== null && st.eng?.thr !== undefined ? torqueFromThrottle(st.eng.thr, st.kias, st.pm.z) : holdPct;
  return { st, per, job, law: startLaw(), hand: startHand({ torquePct }, job), place, side, key, blockFt, t: 0, flags: { outOfPower: false, boards: false } };
}

/**
 * One step. refSt: the aircraft he flies off, at the same moment as his own state (before either steps). Returns { w, trace },
 * trace: what he saw and did this step, for the gauge and the plot page ({ t, job, dev, rate, under, gWant, bankOffDeg,
 * torquePct, holdPct, flags }).
 */
export function stepWingman(w, refSt) {
  const p = perceive(w.per, seenOf(refSt), seenOf(w.st));
  const seen = p.seen;
  const job = supervise(w.job, seen);
  const holdPct = holdingTorque(seen, w.st, w.place, w.key);
  const law = closeLaw(w.law, seen, job, { st: w.st, side: w.side, key: w.key, holdPct, held: w.hand.held });
  const hand = shape(w.hand, law.want, job, seen.g);
  const lift = liftFor(seen, w.st, hand.mem);
  const throttle = throttleAtTorque(hand.mem.torquePct, w.st.kias, w.st.pm.z);
  const st = stepLead(w.st, { lift, throttle });
  const next = { ...w, st, per: p.mem, job, law: law.mem, hand: hand.mem, t: w.t + STEP_SEC, flags: hand.flags };
  return {
    w: next,
    trace: {
      t: next.t, job: job.kind, dev: seen.dev, rate: seen.rate, under: seen.under,
      gWant: seen.gAhead + seen.ffUpG + hand.mem.upCorrG, leftG: seen.ffLeftG + hand.mem.leftCorrG,
      torquePct: hand.mem.torquePct, holdPct, flags: hand.flags,
    },
  };
}

/** The inputs he holds now (for the next technique to start from, B5): { upCorrG, leftCorrG, torquePct }. */
export function inputsOf(w) {
  const { upCorrG, leftCorrG, torquePct } = w.hand;
  return { upCorrG, leftCorrG, torquePct };
}

/**
 * Writes his aircraft's fields from his state as the live laws do (fluid-wing-live.js: attitude.js poseOf3d, kinematic.js
 * applyPose), with his power and engine (power.js), so the 3D view, the judge and the card read him as today.
 */
export function applyTo(aircraft, w) {
  const s = w.st;
  applyPose(aircraft, poseOf3d({ x: s.pm.x, y: s.pm.y, altAbove: s.pm.z - w.blockFt, vel: s.vel, up: s.bodyUp, kias: s.kias, g: s.g, rollDps: -s.rollRate }));
  aircraft.power = withEngine(powerFrom(null, s.eng?.thr ?? null, s.kias, s.pm.z), s.eng);
}
