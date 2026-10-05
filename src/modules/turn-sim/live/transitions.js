// Changing formation, 2-ship (Turn Sim spec section 10, TS-53): the planner behind the
// "Change formation" buttons. Press one and the pair flies the manuals' transition from
// wherever it is now, planned at the press in the same style as the manoeuvres: each
// aircraft flies a pre-planned path through flight.js, roll 90°/s, smooth hand-overs.
//
// How it plans. Lead's part is a short list of ordinary segments (a speed change, and for
// a turning rejoin a 30° turn into #2). #2's part is worked out in a dry run: the tracker
// (tracker.js) flies #2 toward a slot in Lead's frame (the formation's position), commanding
// bank and speed the way a pilot would (small heading changes for slides, bank for the
// rejoin), through the very same flight.js step the real aircraft use. The bank and speed
// it commanded are recorded and replayed by the real aircraft (a 'bankTrack' segment), so
// the path drawn ahead is the path flown (spec F1). The run is done twice: once to learn when
// each leg starts and ends, then again with #2's height profile (smooth climbs and descents)
// built from those times.
//
// Since clean-up step 1 (TS-64) this file holds the moves only: the slots are slots.js, the
// classifier and judge judge.js, the tracker tracker.js and the speeds, rates and banks tuning.js.
//
// Sources (page references only): SMM 12.4 paras 11-12 (echelon), 12.5 para 13 (line astern),
// 12.6 para 15 (route), 12.20 paras 44-47 (station changes), 12.23 para 53 (200 KIAS),
// 12.24 paras 54-59 (turning rejoin), 12.26 paras 62-63 (straight-ahead rejoin), 12.27 para 65
// (overshoot, never at or above Lead's height), 12.29 para 69 (fighting wing), 16.15 para 38
// and AFM7 brief p.18 (close through route), 16.18 paras 49-51 (line abreast, entry),
// 16.20 paras 65-66 and Figs 16.24-16.25 (rejoins from line abreast), 16.32 para 92 and 16.38
// para 105 (drop back to fighting wing), EFIG p.371 and p.374 (overtake). Patrick 4 Oct 2026
// 11:08Z-11:09Z (200 KIAS outside line abreast, Lead turns into #2, speed only in
// transitions) and 11:45Z (wording agreed). Numbers with no manual or ruling behind them are
// labelled "estimate" beside them.
import { STEP_SEC, stepAircraft, copyAircraft, planDone, holdToEnvelope } from './flight.js';
import { wholeDegree, turnSeg, DEG } from './manoeuvres.js';
import { classify, judge } from './judge.js';
import { applyPose } from './kinematic.js';
import { fullPowerKtps, speedSegFor } from './slow-down.js';
import { setKias, stepCommanded, phase, trackTwice, PLAN_MAX_SEC } from './tracker.js';
import { FORMATIONS, fwShapeNow, pairSlot } from './slots.js';
import { KIAS_OUTSIDE_LAB, KIAS_LAB, REJOIN, RULED_REJOIN, STOP_KT, closureNow, rejoinClosureNow } from './tuning.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { onClosure, leadTurnInto, trackTail } from './hand-over.js';
import { fwGoal } from './formation-turns.js';

// ---- the numbers -----------------------------------------------------------------------

// Slowing down: slow-down.js (TS-61) replaces the fixed 1.5 kt/s estimate (SLOW_DOWN_KTPS, until V2.20). A formation
// change slows with power only (a set, controlled overtake held with power, Patrick 23:37Z); the speed brake and idle are
// for the off-standard rejoins (kinematic-moves.js).
export { fullPowerKtps };
/** The overshoot lane: inside 1,000 ft #2 stays behind Lead's 3/9 line, within the shared 100 ft margin (design section 10). */
const LANE_MARGIN_FT = 100;
/** A generous cap on how long one change may take (the spec's 3 minutes, an estimate): it only catches a planner that never finishes. */
export const CHANGE_LIMIT_SEC = 180;

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
    const [bank, kias, power] = seg.points[seg.i++];
    if (kias !== null && kias !== undefined) setKias(a, kias);
    stepCommanded(a, bank, t, plan.profile);
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
 * or off another wingman whose own path was planned first (the 4-ship, four-ship-moves.js). at(n) is the state at the
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

// ---- the legs (phases): the tracker's recipes for each move --------------------------------------

/** A station change in close formation (SMM 12.20 paras 44-47): about 5 kt, wings level but for a degree or two of heading. */
export const slide = (slot, over = {}) => phase(slot, { advanceTol: 6, ...over });
/**
 * A station change's corner or end point, flown as a real stop (SMM 12.20 para 45: "stabilize in this position", "stop the
 * aircraft", "stabilize directly behind the echelon position"): #2 stops on it and holds 2 s before moving on. The 1 ft/s
 * and 2 s are estimates; the stop is within STOP_KT (Patrick 20:41Z: "stabilize" is within 5 knots, not exactly zero).
 */
export const stopAt = (slot, over = {}) => slide(slot, { fwdRate: 5, advanceTol: 2, stopFtps: STOP_KT * KT_TO_FTPS, dwellSec: 2, ...over });
/**
 * The corner behind a close slot (SMM 12.20 para 45; Figs 12.12-12.13): back until #2's nose is at least 10 ft behind Lead's
 * tail (line astern's own spacing, plus 12 ft so it does not fall short: an estimate), at the slot's own lateral, and low
 * enough for the tail to pass below the prop wash (line astern's height: an estimate).
 */
export const cornerBehind = (slot, spacingFt) => {
  const astern = pairSlot('astern', 0, spacingFt);
  return { fwd: astern.fwd - 12, left: slot.left, alt: astern.alt };
};
/** Drop back slowly (SMM 16.32 para 92): a few knots slower than Lead. */
export const dropBack = (slot, over = {}) => phase(slot, { fwdRate: 12, latRate: 12, vrel0: 14, advanceTol: 25, finalTol: 6, bankCapDeg: 20, ...over });
/**
 * Echelon, route or line astern to fighting wing, expeditious (Patrick 19:03Z: "take ~7-15 seconds", TS-55): the slot is chased at
 * once with up to 20 KIAS under or over Lead, 45° bank, and the height change over the first 6 s. All the rates are estimates.
 */
export const sweepOut = (slot, over = {}) => phase(slot, { fwdRate: Infinity, latRate: Infinity, vrel0: 30, kcap: 0.1, d0: 50, vrelMax: 200, decel: 3, bankCapDeg: 45, overtakeKias: 20, undertakeKias: 20, advanceTol: 25, finalTol: 6, altSec: 6, ...over });
/** Close from fighting wing through route (SMM 16.15 para 38; AFM7 p.18): 10-20 KIAS overtake, slowing to about 5 kt at route. */
export const closeThrough = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 40, vrel0: 8, kcap: 0.05, d0: 100, vrelMax: 50, overtakeKias: 20, advanceTol: 6, bankCapDeg: 25, ...over });
/** The rejoin to a formation (SMM 12.24, 16.20): the slot is chased at once, the closing speed falls with range, bank up to the cap. */
export const rejoinTo = (slot, over = {}) => phase(slot, { rejoin: true, fwdRate: Infinity, latRate: Infinity, vrel0: 25, kcap: 0.1, d0: 500, vrelMax: 260, decel: 3, bankCapDeg: REJOIN.bankCapDeg, overtakeKias: REJOIN.overtakeKias, undertakeKias: 25, advanceTol: 40, finalTol: 3, altSec: 10, ...over });
/** Entry to line abreast (SMM 16.18 para 51): #2 turns away 20-40° to open out while Lead holds 220 KIAS. */
export const openOut = (slot, over = {}) => phase(slot, { fwdRate: 40, latRate: 150, vrel0: 40, kcap: 0.1, d0: 300, vrelMax: 220, decel: 2, bankCapDeg: 45, overtakeKias: 25, undertakeKias: 15, advanceTol: 30, finalTol: 25, ...over });

/** The straight-ahead rejoin's places in feet, in the frame of the aircraft rejoined on (estimates, see straightAhead). */
export const STRAIGHT_AHEAD = {
  sixFt: -1000, // line up on the six about 1,000 ft back (SMM Fig 12.17, point 1; Patrick's card "1,000 ft", 4 Oct 19:54Z)
  belowWakeFt: -20, // "fly just below lead's wake" (EFIG p.371); 20 ft is an estimate
  closeTowardFt: -150, // the closing leg's aim, ahead on the six line, so the closure holds until the vector point (estimate)
  vectorAtFt: 500, // "at approximately 500 ft" the small vector toward the echelon side (Fig 12.17, point 2; SMM 12.26 para 63)
};

/**
 * A straight-ahead rejoin from fighting wing to route (SMM 12.26 paras 62-63, Fig 12.17; EFIG p.371): line up on the six of the
 * aircraft rejoined on, about 1,000 ft back and just below its wake (Fig 12.17, point 1); close with 20-30 KIAS overtake (EFIG
 * p.371); from about 500 ft behind (point 2) take a small vector to the side wanted, which aims slightly away from it, reduce
 * the overtake and stabilise in route (point 3). The caller then moves up the wing-tip line to echelon (point 4). at(fwd, left,
 * alt) turns a place in the frame of the aircraft rejoined on into a phase slot; route is the route slot itself; over (e.g.
 * { track }) goes on every phase. holdLineUpUntil: a formation time before which the wingman stays lined up at 1,000 ft
 * instead of closing (the 4-ship: safe separation until the aircraft ahead is stable, SMM 16.34 para 95; AFM7 brief p.21).
 * @param {(fwd: number, left: number, alt: number) => { fwd: number, left: number, alt: number }} at
 * @param {{ fwd: number, left: number, alt: number }} route
 * @param {{ endInRoute?: boolean, track?: number, holdLineUpUntil?: number }} [options]
 */
export function straightAhead(at, route, { endInRoute = false, holdLineUpUntil, ...over } = {}) {
  const A = STRAIGHT_AHEAD;
  const quick = { rejoin: true, fwdRate: Infinity, latRate: Infinity, decel: 2, undertakeKias: 15, ...over }; // a rejoin up to route (Patrick 06:09Z)
  return [
    phase(at(A.sixFt, 0, A.belowWakeFt), { ...quick, vrel0: 20, kcap: 0.05, d0: 50, vrelMax: 100, bankCapDeg: 30, overtakeKias: 15, advanceTol: 60, ...(holdLineUpUntil !== undefined ? { holdUntil: holdLineUpUntil } : {}) }),
    // close along the six line at about 21 KIAS overtake, inside EFIG p.371's 20-30, until the vector point
    phase(at(A.closeTowardFt, 0, A.belowWakeFt), { ...quick, vrel0: 36, kcap: 0, vrelMax: 50, decel: 3, bankCapDeg: 20, overtakeKias: 30, advanceTol: A.vectorAtFt + A.closeTowardFt }),
    // then route, closing level or slightly low (SMM 16.15 para 38) and slowing as it comes in
    closeThrough(endInRoute ? route : { ...route, alt: route.alt - 25 }, { rejoin: true, overtakeKias: 30, vrel0: 6, kcap: 0.04, decel: 1, advanceTol: 6, ...(endInRoute ? { finalTol: 1.5 } : {}), ...over }),
  ];
}

/**
 * The legs from one formation to another, as a list of phases, with #2 on side s now and sTo to end
 * (+1 left, -1 right). The route (design section 4): from line abreast (or a picture that fits nothing) it is a
 * rejoin to fighting wing first, the capture point (SMM 16.20 para 65), flown straight through it for the hot
 * rejoin to echelon (para 66); a change of side is made behind Lead in the formation the pair is then in (a close
 * formation never crosses in front of Lead, SMM 12.20 para 44b; "flow to the opposite side" in fighting wing,
 * SMM 12.29 para 69); then the close-formation legs, or the opening out into line abreast (SMM 16.18 para 51).
 */
export function legsFor(from, s, to, sTo, spacingFt) {
  const slot = (key, side) => pairSlot(key, side, spacingFt);
  const phases = [];
  let at = from;
  let side = s;

  if (at === 'lab' || at === 'other') {
    phases.push(rejoinTo(slot('fw', side), to === 'echelon' ? { advanceTol: 150 } : to === 'fw' ? {} : { advanceTol: 40 }));
    at = 'fw';
  }

  // Cross behind Lead to the other side, in the formation the pair is in. Fighting wing is crossed in place only when the target is
  // fighting wing or line abreast; for the close formations it closes first and crosses there, which is far quicker.
  // A close crossover (SMM 12.20 paras 44-45, Figs 12.12-12.13): back and down into the corner and stop; across at a steady
  // rate (a small heading change, slide's 8 ft/s: an estimate), passing slightly aft of line astern; stop directly behind
  // the new slot; then forward and up into it. The caller adds the last move.
  const corner = (key, side) => cornerBehind(slot(key, side), spacingFt);
  const crossClose = () => {
    phases.push(stopAt(corner(at, side)), stopAt(corner(at, sTo)), slide(slot(at, sTo), { fwdRate: 5 }));
    side = sTo;
  };
  const closeTarget = to === 'echelon' || to === 'route';
  if (at !== 'astern' && to !== 'astern' && side !== sTo && !(at === 'fw' && closeTarget)) {
    if (at === 'fw') {
      // drop back to the fighting wing spacing astern (750 ft by default), flow across behind Lead, then to the other side's
      // slot; 30 ft/s across is an estimate
      const flow = { latRate: 30, vrel0: 32, advanceTol: 25 };
      const fw = slot('fw', side);
      const back = -fwShapeNow().rangeFt;
      phases.push(dropBack({ ...fw, fwd: back }, flow), dropBack({ fwd: back, left: 0, alt: fw.alt }, flow), dropBack({ ...slot('fw', sTo), fwd: back }, flow));
      if (to !== 'fw') phases.push(dropBack(slot('fw', sTo), { advanceTol: 25 }));
      side = sTo;
    } else {
      crossClose();
    }
  }

  if (to === 'lab') {
    phases.push(openOut(slot('lab', sTo)));
  } else if (to === 'fw') {
    const fw = slot('fw', sTo);
    if (at === 'fw') {
      if (!phases.length) return phases;
      phases.push(dropBack(fw, { advanceTol: 6, finalTol: 6, vrel0: 16 }));
    } else {
      // drop back and sweep out in one expeditious move, about 7-15 s to the band (Patrick 19:03Z, TS-55); SMM 16.32 para 92 says
      // "slowly drop back", and Patrick's ruling wins (rule book, What wins). Speed changes stay near 2 kt/s.
      phases.push(sweepOut(fw));
    }
  } else {
    if (at === 'fw') {
      // The straight-ahead rejoin (Patrick 19:04Z, TS-55; SMM 12.26 paras 62-63 and Fig 12.17; EFIG p.371), on the side wanted.
      if (to !== 'astern') side = sTo;
      phases.push(...straightAhead((fwd, left, alt) => ({ fwd, left, alt }), slot('route', side), { endInRoute: to === 'route' }));
      at = 'route';
      if (to === 'route') return phases;
    }
    if (to === 'astern') {
      // Echelon to line astern (SMM 12.20 para 46): the first half of the crossover, stopping directly astern (slightly aft,
      // the corner's spacing), then adjusting power to move up into position.
      const astern = slot('astern', 0);
      if (at !== 'astern') phases.push(stopAt(corner(at, side)), stopAt({ ...corner(at, side), left: 0 }));
      phases.push(slide(astern));
    } else if (at === 'astern') {
      // Line astern to echelon (SMM 12.20 para 47): the latter part of the crossover: across to directly behind the slot and
      // stop, then forward and up into it.
      phases.push(stopAt(corner(to, sTo)), slide(slot(to, sTo), { fwdRate: 5 }));
    } else if (at !== to || side !== sTo) {
      phases.push(slide(slot(to, sTo)));
    }
  }
  // Fighting wing's last leg ends anywhere in the cone, not on its one slot (Patrick 08:58Z: "the whole cone can be used";
  // V2.80's band, TS-80): the tracker aims for the nearest point of the cone, and inside it holds where he arrives (fwGoal).
  if (to === 'fw' && phases.length) {
    const last = phases[phases.length - 1];
    phases[phases.length - 1] = { ...last, goal: (L, W) => fwGoal(L, W, sTo, false) };
  }
  return phases;
}

/** The words for how a change is flown. */
export function describe(from, to, rejoinKind) {
  const fromLab = from === 'lab' || from === 'other';
  if (fromLab && to === 'lab') return 'in line abreast';
  if (fromLab) {
    const how = rejoinKind === 'straight' ? 'straight-ahead rejoin' : to === 'echelon' ? 'hot turning rejoin' : 'turning rejoin';
    return to === 'fw' ? how : to === 'echelon' ? how : `${how} to fighting wing, then ${to === 'route' ? 'close to route' : 'close and cross behind'}`;
  }
  if (to === 'lab') return 'entry to line abreast, Lead speeds up to 220 KIAS';
  if (to === 'fw') return from === 'fw' ? 'flow to the other side behind Lead' : 'drop back and sweep out, expeditious';
  if (from === 'fw') return 'straight-ahead rejoin';
  return 'station change';
}

// ---- the plan for a button press ---------------------------------------------------------------------

/**
 * Plans a change of formation for a pair [lead, wing] as they are now.
 * to: 'lab' | 'fw' | 'echelon' | 'route' | 'astern'. options: { side: 'keep' | 'left' | 'right', spacingFt, blockFt,
 * rejoin: 'into' | 'straight', lastSide (+1/-1, for a pair in line astern) }.
 * Returns { ok, reason?, plans: { id: { segments, profile } }, note, label, from, to, side, rejoinKind, endSec, rejoinPhase, maxBankDeg }.
 * When ok is false nothing should be flown and `reason` says why in one line (spec section 10, "When things go wrong").
 */
export function planGoTo(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  if (!FORMATIONS[to]) return { ok: false, reason: `There is no formation called ${to}.` };
  const from = classify([lead, wing]);
  const lastSide = options.lastSide ?? -1;
  const sCur = from.side || lastSide;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : sCur;
  if (from.key === to && (to === 'astern' || sTo === sCur)) return { ok: false, reason: `Already in ${FORMATIONS[to].label.toLowerCase()}.` };
  if (from.key === 'lab' && to === 'lab') return { ok: false, reason: 'Already in line abreast.' };
  const rejoinOpt = options.rejoin ?? 'into';
  const fromLab = from.key === 'lab' || from.key === 'other';
  const rejoinKind = fromLab && to !== 'lab' ? (rejoinOpt === 'straight' || from.key === 'other' ? 'straight' : 'into') : 'none';
  const targetKias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  // Every leg on the power profile at the Rates choice's closure, a rejoin's up to route (clean-up step 2, TS-65; Patrick
  // 05:46Z, 05:47Z, 05:54Z, 06:09Z).
  const phases = onClosure(legsFor(from.key, sCur, to, sTo, spacingFt));
  if (!phases.length) return { ok: false, reason: 'Nothing to change.' };
  if (options.overtakeKias !== undefined || options.bankCapDeg !== undefined) {
    for (const p of phases) {
      if (p.bankCapDeg === REJOIN.bankCapDeg && options.bankCapDeg !== undefined) p.bankCapDeg = options.bankCapDeg;
      if (p.overtakeKias === REJOIN.overtakeKias && options.overtakeKias !== undefined) p.overtakeKias = options.overtakeKias;
    }
  }

  const speedSegs = Math.abs(lead.kias - targetKias) > 0.5 ? [speedSeg(lead.kias, targetKias, blockFt)] : [];
  // In a turning rejoin Lead slows while he turns, so the turn starts at the press (Patrick 05:29Z).
  const slowWhileTurning = speedSegs.map((x) => ({ ...x, withNext: true }));
  const judgeEnd = (attempt) => judge([attempt.run.end.lead, attempt.run.end.wing], { key: to }, { spacingFt });
  const finished = (attempt) => attempt.run.ok && judgeEnd(attempt).inBand && attempt.run.durationSec <= CHANGE_LIMIT_SEC;
  // A rejoin has to keep the overshoot lane (never ahead of Lead's 3/9 line inside 1,000 ft, +-100 ft) and stay under Lead (SMM 12.27 para 65).
  const laneOk = (attempt) => attempt.run.laneFwdFt <= LANE_MARGIN_FT && attempt.run.minBelowFt > 0;
  /** @type {any} */
  let best = null;
  if (rejoinKind === 'into' && RULED_REJOIN.leadTurnsUntilIn) {
    // Lead holds his 30° turn until #2 is IN POSITION, then rolls out (Patrick 5 Oct 06:16Z item 3: "until 2 is on";
    // V2.59, TS-67): a first run against Lead turning on finds when #2 settles, the second flies against Lead rolling out
    // then (hand-over.js leadTurnInto, trackTail).
    const into = leadTurnInto({ lead, pre: slowWhileTurning, s: sCur, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });
    const tail = trackTail({ wing, lead, leadRec: into.longRec, phases, t0, blockFt, leadPlanFor: into.planTo });
    if (tail.lp) {
      const attempt = { leadSegs: tail.lp.segments, run: tail.run, profile: tail.profile, turnDeg: Math.round(tail.lp.turned / DEG) };
      if (finished(attempt)) best = attempt;
    }
  }
  if (rejoinKind === 'into' && !best) {
    // "Hot turning rejoin ALWAYS begins with lead IMMEDIATELY turning towards 2" (Patrick 5 Oct 05:29Z): Lead turns into #2
    // at the press, slowing as he turns (SMM 16.20 para 65b); the turn is the first angle that keeps the overshoot lane, or
    // failing that the first that finishes (the lane is flagged on the card, never a wall). Until step 2 Lead waited for
    // closure first, or held straight when no turn kept the lane. Since V2.59 only when Lead turning until #2 is in
    // doesn't finish.
    let fallback = null;
    for (const turnDeg of REJOIN.turnAnglesDeg) {
      const leadSegs = [...slowWhileTurning, turnSeg(wholeDegree(lead.headingRad + sCur * turnDeg * DEG), sCur, REJOIN.leadBankDeg)];
      const attempt = { ...fly2(lead, wing, leadSegs, t0, phases, blockFt), turnDeg };
      if (finished(attempt) && laneOk(attempt)) {
        best = attempt;
        break;
      }
      if (!fallback && finished(attempt)) fallback = attempt;
    }
    best ??= fallback ?? { ...fly2(lead, wing, [...slowWhileTurning, turnSeg(wholeDegree(lead.headingRad + sCur * REJOIN.turnAnglesDeg[0] * DEG), sCur, REJOIN.leadBankDeg)], t0, phases, blockFt), turnDeg: REJOIN.turnAnglesDeg[0] };
  } else if (!best) {
    best = { ...fly2(lead, wing, speedSegs, t0, phases, blockFt), turnDeg: 0 };
  }
  best.judged = judgeEnd(best);
  best.good = finished(best);
  if (!best.good) {
    return {
      ok: false,
      reason: !best.run.ok
        ? `No safe rejoin from here: the planner could not reach ${FORMATIONS[to].label.toLowerCase()} inside ${Math.round(PLAN_MAX_SEC / 60)} minutes.`
        : !best.judged.inBand
          ? `No safe rejoin from here: ${best.judged.text}`
          : `No safe rejoin from here: it would take more than ${Math.round(CHANGE_LIMIT_SEC / 60)} minutes.`,
      from: from.key,
      to,
    };
  }
  const { leadSegs, run, profile } = best;
  const plans = {
    [lead.id]: { segments: leadSegs.map((s) => ({ ...s })) },
    [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile },
  };
  const how = describe(from.key, to, rejoinKind);
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = FORMATIONS[from.key]?.label ?? 'In trail';
  const fromSide = from.key === 'astern' || from.key === 'other' ? '' : sCur > 0 ? ' left' : ' right';
  const turnNote = best.turnDeg
    ? ` Lead turns ${best.turnDeg}° into #2 at the press at ${REJOIN.leadBankDeg}° bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS; #2 closes at ${rejoinClosureNow().kt} kt, to fighting wing or route, then ${closureNow().kt} kt into the slot.`
    : '';
  return {
    ok: true,
    plans,
    note: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord}: ${how}.${turnNote}`,
    label: `${FORMATIONS[to].label}${sideWord}`,
    flying: `${fromWord}${fromSide} to ${FORMATIONS[to].label}${sideWord} (${how})`,
    from: from.key,
    fromSide: sCur,
    to,
    side: sTo,
    rejoinKind,
    leadTurnDeg: best.turnDeg,
    laneFwdFt: best.run.laneFwdFt,
    maxBankDeg: run.maxBankDeg,
    judged: best.judged,
    endSec: t0 + run.durationSec,
    rejoining: fromLab && to !== 'lab',
  };
}

/** Two passes of the tracker: the first learns the leg times, the second flies with #2's height profile built from them. */
function fly2(lead, wing, leadSegs, t0, phases, blockFt) {
  const refs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  return { leadSegs, ...trackTwice({ refs, wing0: wing, t0, phases, blockFt }) };
}
