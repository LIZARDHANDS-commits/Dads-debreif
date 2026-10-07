// Flying a planned move, and the dry runs and recorded flights the planners fly off (clean-up step 3, from transitions.js).
// flyStep is the one step that knows the planners' own segments (the recorded bank-and-speed replay, 'bankTrack', and the
// kinematic pre-planned line, 'poseTrack'); everything else goes to flight.js. dryRunT flies a plan ahead through it for the
// look-ahead, and recordFlight records an aircraft through its plan as the moving reference a tracker or a kinematic line
// flies off. speedSeg is the speed change every move's Lead flies (slow-down.js, TS-61).
// It changes no flight physics: the step is flight.js's and the tracker's, unchanged.
import { STEP_SEC, stepAircraft, copyAircraft, planDone, holdToEnvelope } from './flight.js';
import { applyPose } from './kinematic.js';
import { fullPowerKtps, speedSegFor } from './slow-down.js';
import { setKias, stepCommanded } from './tracker.js';

// Slowing down: slow-down.js (TS-61) replaces the fixed 1.5 kt/s estimate (SLOW_DOWN_KTPS, until V2.20). A formation
// change slows with power only (a set, controlled overtake held with power, Patrick 23:37Z); the speed brake and idle are
// for the off-standard rejoins (kinematic-moves.js).
export { fullPowerKtps };

// ---- flying: the recorded-bank and pose handlers ---------------------------------------------

/**
 * Flies one step of a plan that may hold the recorded-bank segment of design section 6, which
 * flight.js does not know; everything else, the speed segment included, goes to stepAircraft:
 *   { kind: 'bankTrack', points: [[bankDeg, kias], …] }   replays what the planner's dry run commanded,
 *                                             one entry a step; kias may be null for "unchanged".
 */
export function flyStep(a, plan, t, ctx = null) {
  const seg = plan.segments[0];
  if (seg?.kind === 'poseTrack') {
    // A kinematic pre-planned line (kinematic.js, TS-55): the pose for each step was worked out at the press.
    seg.i ??= 0;
    const bank0 = a.bankDeg;
    const rate0 = a.rollRateDps ?? 0;
    const p = seg.poses[seg.i++];
    applyPose(a, p);
    holdToEnvelope(a, seg, p, bank0, rate0);
    if (seg.i >= seg.poses.length) {
      plan.segments.shift();
      // Lines, then tracker (step 2, Patrick 06:24Z): in the live formation (ctx, from formation.js) the tracker's run-in is
      // planned again here, from where #2 and Lead really are as the line ends; a dry run flies the press's look-ahead.
      if (ctx?.live && seg.replan && plan.segments[0]?.kind === 'bankTrack') {
        const again = seg.replan(a, t + STEP_SEC, ctx);
        if (again) {
          plan.segments[0] = { kind: 'bankTrack', points: again.points };
          if (again.profile) plan.profile = again.profile;
        }
      }
      a.turning = plan.segments.length > 0 || a.bankDeg !== 0;
    }
    return;
  }
  if (seg?.kind === 'bankTrack') {
    seg.i ??= 0;
    const pt = seg.points[seg.i++];
    const bank = pt[0];
    const accel = pt.length >= 4 ? pt[3] : (pt[1] != null && Math.abs(pt[1]) < 50 ? pt[1] : null);
    const kias = pt.length >= 4 ? pt[1] : (pt[1] != null && Math.abs(pt[1]) >= 50 ? pt[1] : null);
    const power = pt.length >= 4 ? pt[2] : (typeof pt[2] === 'object' ? pt[2] : null);

    if (accel !== null && accel !== undefined) {
      stepCommanded(a, bank, t, plan.profile, accel);
    } else {
      if (kias !== null && kias !== undefined) setKias(a, kias);
      stepCommanded(a, bank, t, plan.profile);
    }
    // The power the tracker flew it with (its power profile, step 2: MAX, TQ, IDLE or IDLE+BOARDS); a replay that recorded
    // none (the 4-ship's, until step 3) shows none rather than a guess (TS-62).
    a.power = power ?? null;
    a.slowStage = power?.stage ?? null;
    if (seg.i >= seg.points.length) plan.segments.shift();
    return;
  }
  stepAircraft(a, plan, t);
}

/** manoeuvres.js's dryRun, flown through flyStep so it knows the speed and bank-track segments. */
export function dryRunT(aircraft, plan, t0, { maxSec = 600, sampleSec = 0.25 } = {}) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const every = Math.max(1, Math.round(sampleSec / STEP_SEC));
  const points = [[t0, a.xFt, a.yFt, a.altAboveFt]];
  let t = t0;
  let i = 0;
  while (!planDone(a, p) && t - t0 < maxSec) {
    flyStep(a, p, t);
    t += STEP_SEC;
    if (++i % every === 0) points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  }
  points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  return { end: a, durationSec: t - t0, points };
}

/** A speed segment from `from` to `to` KIAS: full power to speed up, power back to slow down (slow-down.js, TS-61). */
export function speedSeg(from, to, blockFt = 8000) {
  return speedSegFor(from, to, blockFt, 'power');
}

// ---- recorded flights: the moving references the tracker and the kinematic lines fly off -----

/**
 * A recorded flight: an aircraft flown through its plan by flyStep, one state per step from t0, extended on demand (once
 * its plan is done it flies straight on). It is the moving reference a tracker flies off, so a wingman can fly off Lead
 * or off another wingman whose own path was planned first (the 4-ship, four-legs.js). at(n) is the state at the
 * start of step n: { xFt, yFt, headingRad, tasFtps, kias, altAboveFt, bankDeg, free } where free means its plan has no
 * segments left.
 */
export function recordFlight(aircraft, plan, t0) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const snap = () => ({ xFt: a.xFt, yFt: a.yFt, headingRad: a.headingRad, tasFtps: a.tasFtps, kias: a.kias, altAboveFt: a.altAboveFt, bankDeg: a.bankDeg, free: p.segments.length === 0 });
  const states = [snap()];
  let t = t0;
  return {
    t0,
    at(n) {
      while (states.length <= n) {
        flyStep(a, p, t);
        t += STEP_SEC;
        states.push(snap());
      }
      return states[n];
    },
  };
}
