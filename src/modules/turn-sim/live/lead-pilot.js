// One Lead aircraft (TS-225, Patrick 12 Oct 2026: "let's have him fly the same point mass"; "our first job is to make lead
// fly realistically, then everything else adjusts"). Outside fluid manoeuvring Lead flies the same point mass as in fluid
// (fluid-lead.js stepLead: core stepPointMass with the T-6A's thrust and drag, the engine's response, TS-218, his 90°/s
// planned roll, TS-222 and TS-223, his G onset and his G cap at 17 units AOA, TS-224), not the programme's drawn lines.
// The planners hand him the same plans (flight.js segments and height profiles); this pilot step flies each one:
//  - turn: the bank the segment asks, rolled at the segment's, the plan's or his own roll; the roll-out started where the
//    wings come level on the heading (flight.js headingChangeRollingOut with the planned stop, as fluid Lead's level turns);
//    rollOut false hands the bank straight on; a level turn's G is the G that holds his height (fluid-lead.js gForClimb),
//    and the bank is never steeper than the G his 17 units AOA give at the speed he has (the old envelope gate's stall
//    check, at Lead's own cap);
//  - hold: straight and level until its time (thenNext kept);
//  - speed: the speed changed by power inside Lead's 20-80% torque (TS-216; line abreast's own changes inside its power,
//    replay.js speedSeg lab), the throttle reached as the engine answers (TS-218); a full-power turn at MAX (TS-204). The
//    plan is not done until the speed is made, or the power is at its edge and the speed has stopped coming;
//  - height legs (plan.profile): he pulls or pushes onto the planned height path, climbs at 80% torque and descents at 20%
//    (TS-203, TS-216); between legs he holds his height.
// His speed and height come out of the physics. Every aircraft field the rest of the code reads is filled from the point
// mass, so the planners, the judge, the card, the tags and the 3D view read him as before. His point-mass state rides on
// the aircraft (a.pmLead, never changed in place, so copyAircraft's copy shares it safely); if anything else moved the
// aircraft (a pose, a reset, fluid's hand-back) it is worked out again from the aircraft (fluid-lead.js leadStateOf).
//
// The switch: lead-moves.js LEAD_PILOT.onePointMass (on); off flies the old programme Lead (flight.js), unchanged.
// It changes no flight physics: the point mass, the engine, the roll and G laws are fluid's, unchanged.
import { bankDegFromG, gFromBankDeg, turnRateFromBankRadPerSec } from '../../../core/flight-math.js';
import { gAtAoaUnits } from '../../../core/t6-performance.js';
import { DEG, wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, angleToGo, headingChangeRollingOut, heightAt, keepRollAccel, outRoll, pitchAboveHorizonDeg, setLeadPilot } from './flight.js';
import { stepLead, leadStateOf, gForClimb } from './fluid-lead.js';
import { LEAD, LEAD_POWER, LEAD_PILOT } from './lead-moves.js';
import { ROLL } from './rates.js';
import { throttleAtTorque, powerFrom, withEngine, POWER_BLOCK_FT } from './power.js';
import { leadExcessPerWeight } from './replay.js';

const dt = STEP_SEC;
/** Wings level within this many degrees (and degrees per second of roll) are level: maths, not a flying number (flyLead). */
const WINGS_LEVEL_SNAP_DEG = 0.01;

let on = LEAD_PILOT.onePointMass;
/** The switch at run time (the sheet's LEAD_PILOT.onePointMass is its start): true flies Lead on the point mass. */
export function setOnePointMassLead(value) {
  on = Boolean(value);
}
/** Whether Lead flies the point mass now. */
export const onePointMassLead = () => on;

/** What the pilot step last wrote on the aircraft: when it still reads so, his point-mass state is the aircraft's. */
const fingerprint = (a) => [a.xFt, a.yFt, a.altAboveFt ?? 0, a.headingRad, a.tasFtps, a.kias, a.bankDeg ?? 0, a.rollRateDps ?? 0];
const unchanged = (fp, a) => Array.isArray(fp) && fingerprint(a).every((v, i) => v === fp[i]);

/**
 * Lead's point-mass state: the one he carries when nothing has moved him since, else worked out from the aircraft as it is
 * (fluid-lead.js leadStateOf). fluid.js starts fluid manoeuvring from it, so the state carries straight in.
 */
export function leadPointMassOf(a, blockFt) {
  const pm = a.pmLead;
  if (pm && pm.blockFt === blockFt && unchanged(pm.fp, a)) return pm.st;
  return leadStateOf(a, blockFt);
}

/** Hands Lead a point-mass state to carry on from (fluid.js, as fluid manoeuvring ends): the aircraft must read as st does. */
export function adoptLeadState(a, st, blockFt) {
  a.pmLead = { st, fp: fingerprint(a), blockFt, plan: null, hold: null, ktps: 0, setPower: false };
}

/**
 * A slow-down that only draws the bleed of the turn after it (formation-turns.js fwLeadPlan's held turn, TS-204: "Bleed,
 * no floor"): it slows him toward a speed while the next segment is a turn that 80% torque cannot hold at his speed. On
 * the point mass the turn bleeds by itself, so the pilot keeps his power and his speed, as a pilot holding the bank does.
 */
function drawnBleed(seg, plan, st) {
  const next = plan.segments[1];
  if (!seg.withNext || !(seg.toKias < st.kias) || next?.kind !== 'turn') return false;
  return leadExcessPerWeight(st.kias, st.pm.z, gFromBankDeg(next.bankDeg)) < 0;
}

/**
 * A turn's gentler roll-out (flight.js outRoll: seg.rollOutRoll, a close wingman in his wing plane, TS-126), once his roll-in
 * has settled: its rate no faster than the gentle roll's, and (here) its roll acceleration no more than the gentle roll's
 * either. With an acceleration above it, core easeRoll's planned stop has no stop to plan (its jerk range is empty) and
 * the roll-out prediction runs wild (-1,361° of heading from 0.25° of bank, 7.5°/s and -150°/s² at 12°/s²; found 12 Oct
 * 2026 for TS-225: the programme Lead takes it too and rolls out of fighting wing to echelon's 110° turn after about 7°).
 */
function settledOutRoll(seg, a, st) {
  const r = outRoll(seg, a);
  return r && Math.abs(st.rollAcc ?? 0) <= r.maxAccelDps2 + 1e-9 ? r : null;
}

/**
 * How far the heading still turns (radians, unsigned) if he rolls the wings level from now: his roll-out flown ahead on
 * the point mass (stepLead, the G that holds level flight, the throttle he has), so the G that lags the bank at the T-6A's
 * onset is in it. The kinematic prediction (flight.js headingChangeRollingOut) assumes the G of the bank at every
 * moment, and left him about 1.4° short of the heading out of a 70° turn.
 */
function rollOutTurnRad(st, roll) {
  let s = st;
  let h = Math.atan2(s.vel.y, s.vel.x);
  let turned = 0;
  const thr = s.eng?.thr;
  for (let k = 0; k < 400 && !(Math.abs(s.bank) < WINGS_LEVEL_SNAP_DEG && Math.abs(s.rollRate) < WINGS_LEVEL_SNAP_DEG); k++) {
    s = stepLead(s, { g: Math.max(LEAD.minPushG, gForClimb(s, 0)), bank: 0, lead: true, roll, ...(Number.isFinite(thr) ? { throttle: thr } : {}) });
    const h1 = Math.atan2(s.vel.y, s.vel.x);
    turned += wrapPi(h1 - h);
    h = h1;
  }
  return Math.abs(turned);
}

/** The height leg flown at time t (heightAt's own rule: the first leg whose span holds t), or null. */
const legAt = (profile, t) => (profile ?? []).find((leg) => t >= leg.t0 && t <= leg.t1) ?? null;

/**
 * Flies Lead one step on the point mass through `plan` (flight.js stepAircraft's segments and profile, used up as it goes,
 * as stepAircraft does). Returns false when the switch is off (the programme then flies him).
 */
function flyLead(a, plan, t) {
  if (!on) return false;
  const prior = a.pmLead;
  const blockFt = prior?.blockFt ?? plan.blockFt ?? POWER_BLOCK_FT;
  const st = leadPointMassOf(a, blockFt);
  const z = st.pm.z;
  // A plan he has not flown yet: he holds the speed he has, and his height (once level, if he was still climbing).
  const fresh = !prior || prior.plan !== plan || !prior.hold;
  const hold = fresh ? { kias: st.kias, z: Math.abs(st.vel.z) < LEAD_PILOT.levelFtps ? z : null } : { ...prior.hold };

  // A speed change running: made, or as near as the power takes it.
  let leg = plan.speedLeg;
  if (leg && !leg.pointMass) {
    // A ramp the programme began (the switch turned on mid-plan): flown to its speed by power.
    leg = plan.speedLeg = { pointMass: true, t0: t, t1: null, fromKias: st.kias, toKias: leg.toKias, stage: leg.stage ?? null, background: Boolean(leg.background), band: LEAD_POWER };
  }
  if (leg) {
    const err = leg.toKias - st.kias;
    let made = Math.abs(err) <= LEAD_PILOT.speedDoneKt;
    if (!made && !fresh) {
      const thr = st.eng?.thr;
      const edge = prior.setPower || (Number.isFinite(thr) && (err > 0
        ? thr >= Math.min(1, throttleAtTorque(leg.band.maxTorquePct, st.kias, z)) - 0.01
        : thr <= Math.max(0, throttleAtTorque(leg.band.minTorquePct, st.kias, z)) + 0.01));
      made = edge && Math.sign(err) * prior.ktps < LEAD_PILOT.speedStuckKtps;
    }
    if (made) {
      leg.t1 = t;
      hold.kias = leg.toKias;
      plan.speedLeg = null;
    }
  }

  // The segment flown this step (flight.js stepAircraft's rules, the bank and the speed from the point mass).
  let targetBank = 0; // turn-sim convention: left wing down positive
  let seg;
  for (let guard = 0; guard < 64; guard++) {
    seg = plan.segments[0];
    if (seg?.kind === 'speed') {
      if (!plan.speedLeg && !seg.begun) {
        seg.begun = true;
        if (!drawnBleed(seg, plan, st)) {
          if (Math.abs(seg.toKias - st.kias) > LEAD_PILOT.speedDoneKt) {
            plan.speedLeg = { pointMass: true, t0: t, t1: null, fromKias: st.kias, toKias: seg.toKias, stage: seg.stage ?? null, background: Boolean(seg.background), band: seg.lab ? LEAD_PILOT.labPower : LEAD_POWER };
          } else hold.kias = seg.toKias;
        }
      }
      if (seg.begun && (seg.withNext || !plan.speedLeg)) {
        plan.segments.shift();
        continue; // the next segment flies this same step
      }
      break; // straight and level while the speed changes (or while an earlier change finishes)
    }
    if (seg?.kind === 'hold') {
      if (t + dt / 2 >= seg.untilSec) {
        plan.segments.shift();
        if (seg.thenNext) continue;
      }
      break;
    }
    if (seg?.kind === 'turn') {
      const toGo = angleToGo(a.headingRad, seg.toRad, seg.dir);
      if (!seg.rollingOut) {
        targetBank = seg.dir * seg.bankDeg;
        const thisStep = Math.abs(turnRateFromBankRadPerSec(a.tasFtps, a.bankDeg)) * dt;
        if (seg.rollOut === false) {
          // Hand-over turn: done when the heading reaches the target, still banked.
          if (toGo <= thisStep / 2 || (toGo > 1.5 * Math.PI && seg.started)) {
            plan.segments.shift();
            continue;
          }
        } else {
          // Roll out where the wings come level on the heading: the roll-out he flies (his roll, its onset and the
          // planned stop, TS-223), predicted as fluid Lead's level turns predict it; near the roll-out, flown ahead on
          // the point mass itself (rollOutTurnRad), whose G comes off at its own onset.
          const roll = settledOutRoll(seg, a, st) ?? seg.roll ?? plan.roll ?? a.techRoll;
          let rollOutChange = Math.abs(headingChangeRollingOut(a.bankDeg, a.rollRateDps, a.tasFtps, roll, -(st.rollAcc ?? 0), true));
          if (seg.started && toGo <= 1.5 * rollOutChange + 2 * thisStep) rollOutChange = rollOutTurnRad(st, roll);
          if (seg.started && (toGo <= rollOutChange + thisStep / 2 || toGo > 1.5 * Math.PI)) seg.rollingOut = true;
        }
        seg.started = true;
      }
      if (seg.rollingOut) {
        targetBank = 0;
        if (Math.abs(a.bankDeg) < 1e-6 && Math.abs(a.rollRateDps) < 1e-6) plan.segments.shift();
      }
      break;
    }
    break; // no segments: straight and level
  }
  // Never steeper than the bank whose level G his 17 units AOA give at this speed (TS-224's cap; the envelope gate's stall
  // check, flight.js gateRoll, at Lead's own cap): a pilot eases the bank rather than sink.
  if (targetBank !== 0) {
    const gCap = gAtAoaUnits(st.kias, LEAD.loopAoaUnits);
    const capDeg = gCap > 1 ? bankDegFromG(gCap) : 0;
    if (Math.abs(targetBank) > capDeg) targetBank = Math.sign(targetBank) * capDeg;
  }
  const roll = (seg?.rollingOut && settledOutRoll(seg, a, st)) || seg?.roll || plan.roll || a.techRoll || ROLL;

  // Height: the planned leg's path (its climb rate and its pull as the lead), or the height held, closed at heightPerSec.
  const height = heightAt(plan.profile, t + dt);
  let zT = null;
  let vT = 0;
  let nzLead = 0;
  if (height) {
    zT = blockFt + height.altAboveFt;
    vT = height.climbFtps ?? 0;
    nzLead = (height.nz ?? 1) - 1;
    hold.z = zT;
  } else if (hold.z !== null) zT = hold.z;
  let gamma = 0;
  if (zT === null) {
    // A climb carried into a plan with no height: level off (the flight path brought onto level), then hold that height.
    if (Math.abs(st.vel.z) < LEAD_PILOT.levelFtps) hold.z = z;
  } else {
    const catchFtps = Math.max(-LEAD_PILOT.heightCatchFtps, Math.min(LEAD_PILOT.heightCatchFtps, LEAD_PILOT.heightPerSec * (zT - z)));
    gamma = Math.asin(Math.max(-1, Math.min(1, (vT + catchFtps) / st.V)));
  }
  const cb = Math.max(0.25, Math.cos(st.bank * DEG));
  const g = Math.max(LEAD.minPushG, gForClimb(st, gamma) + nzLead / cb);

  // Power: MAX in a full-power turn (TS-204); a planned climb at 80% torque and a descent at 20% (TS-203, TS-216); else the
  // speed wanted, held inside the band (20-80%, TS-216; line abreast's own changes inside its power).
  const hLeg = legAt(plan.profile, t + dt);
  const climbing = hLeg && !hLeg.table && !hLeg.dive && hLeg.toFt !== hLeg.fromFt ? Math.sign(hLeg.toFt - hLeg.fromFt) : 0;
  let power;
  if (seg?.kind === 'turn' && seg.fullPower) power = { throttle: 1 };
  else if (climbing) power = { throttle: Math.max(0, Math.min(1, throttleAtTorque(climbing > 0 ? LEAD_PILOT.climbTorquePct : LEAD_PILOT.descentTorquePct, st.kias, z))) };
  else power = { holdKias: plan.speedLeg?.toKias ?? hold.kias, torqueBand: plan.speedLeg?.band ?? LEAD_POWER };

  let s = stepLead(st, { g, bank: -targetBank, lead: true, roll, ...power });
  // Wings level within a hundredth of a degree, with the roll all but stopped, is wings level. A numerical snap, not a
  // flying number: core easeRoll's planned stop can stick a few thousandths of a degree short of its target, the rate at
  // zero and the roll acceleration flipping ±13°/s² every step (0.0007° short after a 60° turn at 90°/s, found 12 Oct 2026
  // for TS-225; the programme Lead sticks the same way, 0.0054° short), and the plan then never reads as done (planDone
  // wants the wings exactly level).
  if (targetBank === 0 && Math.abs(s.bank) < WINGS_LEVEL_SNAP_DEG && Math.abs(s.rollRate) < WINGS_LEVEL_SNAP_DEG) {
    s = { ...s, bank: 0, rollRate: 0, rollAcc: 0 };
  }

  // The aircraft as the rest of the code reads it.
  a.xFt = s.pm.x;
  a.yFt = s.pm.y;
  a.altAboveFt = s.pm.z - blockFt;
  a.headingRad = Math.atan2(s.vel.y, s.vel.x);
  a.tasFtps = s.V;
  a.kias = s.kias;
  a.bankDeg = Math.abs(s.bank) < 1e-9 ? 0 : -s.bank;
  a.rollRateDps = Math.abs(s.rollRate) < 1e-9 ? 0 : -s.rollRate;
  keepRollAccel(a, -(s.rollAcc ?? 0));
  a.climbFtps = s.vel.z;
  a.nz = 1 + s.accPerp.z / G_FTPS2; // the vertical share of the G (1 + vertical acceleration / g), flight.js's meaning
  a.g = s.g;
  a.invertDive = false;
  // The wings drawn: the point mass's bank is the lift's own roll from the level up square to the path, so the wings are
  // drawn at it (as fluid draws Lead from his body up); flight.js flyAttitude would tilt them again by the vertical share.
  a.attitudeDeg = a.bankDeg;
  a.pitchDeg = pitchAboveHorizonDeg(a);
  a.turning = a.bankDeg !== 0 || plan.segments.length > 0;
  a.stretched = false;
  a.slowStage = null; // Lead never sets the boards or idle in formation (TS-216)
  a.power = withEngine(powerFrom(null, s.eng?.thr ?? null, a.kias, s.pm.z), s.eng);
  a.pmLead = { st: s, fp: fingerprint(a), blockFt, plan, hold, ktps: (s.kias - st.kias) / dt, setPower: !('holdKias' in power) };
  return true;
}

setLeadPilot(flyLead);
