// Lines, then tracker (clean-up step 2, TS-65; Patrick, card "Lines, then tracker" 5 Oct 05:41Z; 06:24Z: hand-over and
// rate change together at about 500 ft). Every 2-ship wingman move is a kinematic line for the big move into the ball park,
// then the tracker (tracker.js) for the last few hundred feet and for holding the slot:
//  - the line (kinematic.js) runs #2 in along the move's places on the power time law (Patrick's technique, 06:13Z) at a
//    rejoin's closure (tuning.js REJOIN_CLOSURE_KT), arriving about 500 ft from his slot (handOverPoint, tuning.js
//    HAND_OVER_FT) at the close-in rate;
//  - there the tracker takes over from exactly where the line left him (position, track, speed, bank and roll rate are the
//    line's last pose; its speed loop starts at the line's acceleration) at the close-in rate, into the slot, and holds it.
//    It is planned at the press as a look-ahead (refusals) and planned again when the line ends from where #2 and Lead
//    really are (Patrick 06:24Z; replanFor below, transitions.js flyStep).
// A move that starts inside 500 ft is the tracker's alone. This file holds the pieces the 2-ship's planners
// share (line-moves.js and hot-rejoin.js); it changes no flight physics: the line is read off positions as every planned
// line is, and the tracker flies the unchanged flight.js step. Numbers are tuning.js's.
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';
import { STEP_SEC, copyAircraft } from './flight.js';
import { relativeTo, leadTurnSegs, DEG } from './manoeuvres.js';
import { applyPose, makeTrack, seedTrack, posesFrom, followInto, laggedBank, relPath, powerLaw, relSpeedLimitFor, speedNeeds, labelStages } from './kinematic.js';
import { trackTwice } from './tracker.js';
import { holdToPower } from './full-power.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { KIAS_OUTSIDE_LAB, KINEMATIC, WING_BANKS, HAND_OVER_FT, RATE_SET_SEC, closureNow, rejoinClosureNow } from './tuning.js';

const dt = STEP_SEC;

/**
 * The line's own accelerations in the frame of the aircraft flown off (all estimates): speeding up at full power and slowing
 * at idle (Patrick 05:47Z, 05:54Z: "assertively set the rate", the boards to help arrest it), each at 75%, and the line's
 * turns in the frame (moving aft, then forward, asks a speed change too) at a further 25%, so together they stay inside
 * what the aircraft can do and the line is never STRETCHED by its own shape; sideways about 0.3 G of turn (a gentle heading
 * change); up or down 3 ft/s²; a 1 s blend at the start. At the formation's 200 KIAS and the block height.
 */
export const RUN_IN = Object.freeze({ powerShare: 0.65, turnShare: 0.35, latG: 0.3, vertFtps2: 3, blendSec: 1 });

/** A leg whose slot is further than this from the aircraft flown off is a long move's (fighting wing, line abreast). */
const LONG_SLOT_FT = 300; // the close formations all sit inside about 230 ft (route, 5 wingspans out); fighting wing starts at 500 ft

/**
 * The phases flown on the power profile at the Rates choice's closures (tracker.js closureFtps; Patrick 06:09Z, 06:11Z):
 *  - a rejoin's legs (marked `rejoin`: up to route, the corner or the decision point), and the legs of other long moves
 *    (a slot out at fighting wing or line abreast range), at REJOIN_CLOSURE_KT;
 *  - every close leg (station changes, echelon and route both ways, line astern, the run-in from a rejoin's route or
 *    corner) at the close-in rate (tuning.js CLOSE_IN_SEC, closeInFtps).
 * Banks (Patrick 06:16Z item 12): a close leg up to 30°; a kick out to fighting wing or line abreast with no cap but the G
 * rule; a rejoin's legs keep their own (REJOIN.bankCapDeg: the G rule since V2.24, Patrick 06:16Z item 1). Each slot is chased at once, not
 * through a sliding reference, and the closure is never capped below the rate chosen. With `closeIn` (the tracker's run-in after a hand-over, or a move that starts inside
 * the hand-over range) every leg is at the close-in rate (Patrick 06:24Z). `rejoinBankDeg` replaces a rejoin leg's own cap
 * (the 4-ship's: the G rule only, Patrick 06:16Z item 1).
 */
export function onClosure(phases, { closeIn: allCloseIn = false, rejoinBankDeg = null } = {}) {
  const closeIn = closureNow().ftps;
  const rejoin = rejoinClosureNow().ftps;
  return phases.map((p) => {
    const long = Math.hypot(p.slot.fwd, p.slot.left) > LONG_SLOT_FT;
    const closureFtps = !allCloseIn && (p.rejoin || long) ? rejoin : closeIn;
    const bankCapDeg = p.rejoin ? rejoinBankDeg ?? p.bankCapDeg : long ? WING_BANKS.kickOutBankCapDeg : WING_BANKS.closeBankCapDeg;
    return { ...p, closureFtps, bankCapDeg, fwdRate: Infinity, latRate: Infinity, vrelMax: Math.max(p.vrelMax, closureFtps) };
  });
}

/** How far #2 (world x, y) is from a slot ({ fwd, left }) in the frame of L, horizontally, feet. */
export function offSlotFt(L, x, y, slot) {
  const rel = relativeTo(L, { xFt: x, yFt: y });
  return Math.hypot(rel.fwd - slot.fwd, rel.left - slot.left);
}

/** A recorded flight seen from step k on: at(n) is the original's at(n + k). */
export const fromStep = (rec, k) => ({ t0: rec.t0 + k * dt, at: (n) => rec.at(n + k) });

/** The aircraft as a line's pose left it: the hand-over state. */
export function wingFromPose(wing, pose) {
  const a = copyAircraft(wing);
  applyPose(a, pose);
  return a;
}

/** The line's time law makers, from RUN_IN at the speed and block height (moving aft in the frame is #2 slower: speeding up along such a path is slowing, and the other way round). */
function runInLaw(kiasPerTas, blockFt) {
  const ft2 = (ktps) => ktps * KT_TO_FTPS / kiasPerTas;
  const up = ft2(fullPowerKtps(KIAS_OUTSIDE_LAB, blockFt) * RUN_IN.powerShare);
  const down = ft2(slowKtps('idle', KIAS_OUTSIDE_LAB, blockFt) * RUN_IN.powerShare);
  const latA = RUN_IN.latG * G_FTPS2;
  const cap = (d, f) => Math.min(f / Math.max(Math.abs(d.fwd), 1e-6), latA / Math.max(Math.abs(d.left), 1e-6), RUN_IN.vertFtps2 / Math.max(Math.abs(d.up), 1e-6));
  return {
    accel: (q, d) => cap(d, d.fwd >= 0 ? up : down),
    decel: (q, d) => cap(d, d.fwd >= 0 ? down : up),
    turnFtps2: RUN_IN.turnShare * Math.min(up, down, latA), // the line's own turns in the frame, added to the speed changes above, so together they stay inside full power
  };
}

/**
 * Where the line hands over to the tracker (the one place the rule lives, so it can be switched): about HAND_OVER_FT from
 * the final slot, the same for every Rates choice (Patrick 5 Oct 06:24Z). Returns { slot, withinFt }.
 */
export function handOverPoint({ finalSlot }) {
  return { slot: finalSlot, withinFt: HAND_OVER_FT };
}

/**
 * The line into the ball park: #2 from where he is along `points` (a relative path in the frame of `leadRec`'s aircraft,
 * { fwd, left, up, plane }, ending on or near `finalSlot`), on the power time law at the line rates (kinematic.js
 * relSpeedLimit, its fore-aft rate `cruiseFtps`: a rejoin's closure), each change of rate set in about RATE_SET_SEC
 * (Patrick 06:13Z), arriving at the hand-over point (handOverPoint) at `endFtps` (the close-in rate). Held to full power
 * where Lead's own speed change asks more (full-power.js, TS-63). Returns null when #2 starts inside the hand-over range
 * (the tracker flies it all), else { poses, steps, accelKtps, stretched, maxBankDeg, handOverFt }: poses for steps
 * 1..steps, the last being the hand-over state, and the acceleration there (KIAS per second).
 */
export function lineRunIn({ wing, leadRec, points, finalSlot, blockFt = 8000, cruiseFtps = rejoinClosureNow().ftps, endFtps = closureNow().ftps }) {
  const { slot: hoSlot, withinFt: D } = handOverPoint({ finalSlot });
  const L0 = leadRec.at(0);
  if (offSlotFt(L0, wing.xFt, wing.yFt, hoSlot) <= D) return null;
  const path = relPath(points);
  let sH = path.length;
  for (let s = 0; s <= path.length; s += 2) {
    const q = path.at(s);
    if (Math.hypot(q.fwd - hoSlot.fwd, q.left - hoSlot.left) <= D) {
      sH = s;
      break;
    }
  }
  const kiasPerTas = wing.kias / wing.tasFtps;
  const { accel, decel, turnFtps2 } = runInLaw(kiasPerTas, blockFt);
  const law = powerLaw(path, { accel, decel, turnFtps2, limit: relSpeedLimitFor(cruiseFtps), endAt: sH, endFtps, rateSetSec: RATE_SET_SEC });
  const steps = Math.ceil(law.durationSec / dt);
  // Sampled once a step, past the hand-over too, then lightly smoothed (three passes of a one-second running mean, as
  // kinematic-moves.js movingSlot) so the bank and roll read off the line have no tiny corners.
  const HALF = 10;
  const pad = 3 * HALF;
  const extra = Math.round(KINEMATIC.startBlendSec / dt) + 40;
  const keys = ['fwd', 'left', 'up', 'plane'];
  let rows = [];
  for (let i = -pad; i <= steps + extra + pad; i++) rows.push(path.at(law.sAt(Math.max(0, i) * dt)));
  for (let pass = 0; pass < 3; pass++) {
    rows = rows.map((_, i) => {
      const o = {};
      const a = Math.max(0, i - HALF);
      const b = Math.min(rows.length - 1, i + HALF);
      for (const key of keys) {
        let sum = 0;
        for (let j = a; j <= b; j++) sum += rows[j][key] ?? 0;
        o[key] = sum / (b - a + 1);
      }
      return o;
    });
  }
  const slotAt = (k) => rows[Math.max(0, Math.min(rows.length - 1, k + pad))];
  const n = steps + extra;
  const track = makeTrack(n);
  seedTrack(track, wing);
  // The line starts where #2 is, at rest in the frame, so it needs only a short blend for the acceleration's onset.
  followInto(track, { ref: laggedBank(leadRec, KINEMATIC.planeLagSec), from: 0, slotAt, blendSec: RUN_IN.blendSec });
  const line = posesFrom(track, kiasPerTas);
  const held = holdToPower(line.poses, { refAt: (i) => leadRec.at(i + 1), blockFt, kiasPerTas, from: 1 });
  const poses = held.poses;
  // The hand-over: the first step #2 is inside the range (pose index i is step i + 1), leaving two poses after it for the
  // acceleration there.
  let iH = poses.length - 3;
  for (let i = 1; i < poses.length - 2; i++) {
    if (offSlotFt(leadRec.at(i + 1), poses[i].x, poses[i].y, hoSlot) <= D) {
      iH = i;
      break;
    }
  }
  labelStages(poses, 0, speedNeeds(poses, 0, blockFt));
  const part = poses.slice(0, iH + 1);
  return {
    poses: part,
    steps: iH + 1,
    accelKtps: (poses[iH + 1].kias - poses[iH - 1].kias) / (2 * dt),
    stretched: held.stretched,
    maxBankDeg: part.reduce((m, p) => Math.max(m, Math.abs(p.bank)), 0),
    handOverFt: D,
  };
}

/**
 * Lead's turn into #2 in a turning rejoin, held until #2 is IN POSITION, then rolled out (Patrick 5 Oct 06:16Z item 3:
 * "until 2 is on"; RULED_REJOIN; SMM 16.20 para 65b: 30° of bank, constant bank and speed). pre: his speed change, flown
 * with the turn (withNext); s: the way he turns (toward #2); record: transitions.js recordFlight (passed in, so this file
 * needs no import of it). Returns { longRec, planTo }: longRec, the turn held on (four near-half circles, for planning);
 * planTo(step), his real plan, rolling out on the whole degree once he has turned what longRec turned by that step
 * ({ segments, turned, rec }): trackTail's leadPlanFor.
 */
export function leadTurnInto({ lead, pre = [], s, bankDeg, t0, record }) {
  const h0 = lead.headingRad;
  const longRec = record(lead, { segments: [...pre, ...leadTurnSegs(h0, s, 4 * 170 * DEG, bankDeg, false)] }, t0);
  const planTo = (inStep) => {
    let turned = 0;
    for (let i = 1; i <= inStep; i++) turned += wrapPi(longRec.at(i).headingRad - longRec.at(i - 1).headingRad) * s;
    const segments = [...pre, ...leadTurnSegs(h0, s, Math.round(turned / DEG) * DEG, bankDeg, true)];
    return { segments, turned, rec: record(lead, { segments }, t0) };
  };
  return { longRec, planTo };
}

/**
 * The tracker's part: from the hand-over state (or from the press when there is no line), `phases` (each on the power
 * profile: onClosure) flown off Lead's recorded flight `leadRec`. With `leadPlanFor` (a Lead who turns until #2 is in, the
 * hot turning rejoin), a first run against `leadRec` (Lead turning on) finds when #2 has settled, leadPlanFor(step) gives
 * Lead's real plan rolling out then ({ segments, rec }), and the second run flies against it. Returns { run, profile,
 * steps0, lp }: steps0 is the step the tracker starts at, lp Lead's plan when leadPlanFor was given.
 */
export function trackTail({ wing, lead, leadRec, line = null, phases, t0, blockFt = 8000, leadPlanFor = null }) {
  const steps0 = line?.steps ?? 0;
  const wing0 = line ? wingFromPose(wing, line.poses[steps0 - 1]) : wing;
  const init = line ? { accelKtps: line.accelKtps } : null;
  const fly = (rec, stopWhenSettled) => trackTwice({ refs: { [lead.id]: fromStep(rec, steps0) }, wing0, t0: t0 + steps0 * dt, phases, blockFt, init, stopWhenSettled });
  if (!leadPlanFor) return { ...fly(leadRec, false), steps0, lp: null };
  const first = fly(leadRec, true);
  const lp = leadPlanFor(steps0 + first.run.points.length);
  return { ...fly(lp.rec, false), steps0, lp };
}

/**
 * The tracker's run-in planned again at the hand-over (Patrick 06:24Z: "Should the tracker re-calculate after the line hands
 * over?": yes): a function transitions.js flyStep calls as the line's last pose is flown, in the live formation only, with
 * #2 (`wing`, as he really is), the formation time and { aircraft, plans } (everyone as they really are, and their plans
 * now). It flies `phases` off Lead's (or `refIds`', the 4-ship's) real state and the rest of his plan (`record`: transitions.js recordFlight, passed in
 * so this file needs no import of it) from #2's real state, his speed loop starting at the line's acceleration, so nothing
 * jumps. Returns { points, profile }, or null (the press's look-ahead is flown) when it does not settle.
 */
export function replanFor({ leadId = 1, refIds = [leadId], phases, blockFt, accelKtps, record }) {
  return (wing, t, ctx) => {
    const refs = {};
    for (const id of refIds) {
      const a = ctx?.aircraft?.find((x) => x.id === id);
      if (!a) return null;
      refs[id] = record(a, ctx.plans?.[id] ?? { segments: [] }, t);
    }
    const { run, profile } = trackTwice({ refs, wing0: wing, t0: t, phases, blockFt, init: { accelKtps } });
    return run.ok ? { points: run.points, profile } : null;
  };
}

/**
 * #2's plan from a line part (or none) and the tracker's run: the poses replayed, then the tracker's bank and speed (the
 * press's look-ahead; with `replan`, replanFor's, planned again when the line ends).
 */
export function wingPlan(line, tail, replan = null) {
  const segments = [];
  if (line) segments.push({ kind: 'poseTrack', poses: line.poses, ...(replan ? { replan } : {}) });
  segments.push({ kind: 'bankTrack', points: tail.run.points });
  return { segments, profile: tail.profile };
}
