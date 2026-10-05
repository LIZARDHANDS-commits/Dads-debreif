// The hot turning rejoin from line abreast (Turn Sim spec sections 10.1 and 10.5; decisions TS-55, TS-61, TS-62), on a
// kinematic pre-planned line (Patrick 4 Oct 18:00Z): from the standard start (V2.15), from the off-standard starts the
// Errors (training) panel sets (V2.20; Patrick 19:15Z: "wide or close, ahead of line, high, tight, fast; worst = ahead,
// high, tight, fast"), and the overshoot when #2 reaches the decision point with too much energy (Patrick 23:29Z).
//
// Sources (page references only):
//  - SMM 16.20 para 65b and 65b(2), para 66, Fig 16.25: Lead rocks the wings, turns into #2 at 30° of bank and holds that
//    bank and speed ("smoothly slows to 200 KIAS at 30 deg bank"); #2 turns aggressively to point at Lead, rolls out,
//    reverses once the line of sight moves, so his fuselage lines up with Lead's as he reaches fighting wing; to echelon he
//    passes through the fighting wing position first (the overshoot lane).
//  - SMM 12.23 para 53 (200 KIAS; stabilise in route before closing to echelon, room to pass behind and below), 12.24
//    paras 54-59 (turning rejoin: cut-off and overtake; adjust torque to remove overtake approaching route), 12.26 para 63
//    (torque, speed brake, idle if the overtake is excessive), 12.27 paras 64-65 and Fig 12.18 (the overshoot from a
//    turning rejoin), 16.34 paras 94-96 (the 4-ship: not built here). EFIG p.374 (10-20 KIAS overtake, speed brake if
//    required). Patrick 23:29Z (overshoot only at the decision point), 23:37-23:38Z (order of use: geometry, power,
//    speed brake, idle, overshoot).
// Every number with no source beside it is an estimate and says so.
import { wrapPi } from '../../../core/angles.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft, SMOOTHER_PEAK, smoother } from './flight.js';
import { relativeTo, turnSeg, wholeDegree, onStep, DEG } from './manoeuvres.js';
import { recordFlight, fwShapeNow, KIAS_LAB, KIAS_OUTSIDE_LAB, REJOIN, classifyPair, describe, FORMATIONS, LENGTH_FT } from './transitions.js';
import { makeTrack, seedTrack, posesFrom, settleLast, followInto, slotInWorld, poseOf, laggedBank } from './kinematic.js';
import { KINEMATIC, CLOSE, slotPoint, routePoints, movingSlot, rollEvents, eventsEnd, lastRollEnd, laneAndBelow, finishLine, leadTurnSegs } from './kinematic-moves.js';
import { STAGES, STAGE_WORDS, speedSegFor, slowKtps, stageFor, fullPowerKtps } from './slow-down.js';

const dt = STEP_SEC;

/** The reversal: a turn toward Lead's side (s) at bank b3, held with no roll-out, so the capture takes over with the wings still banked. */
const reverseSeg = (state, s, b3) => turnSeg(wrapPi(state.headingRad + s * Math.PI * 0.9), s, b3, false);

/** "A definite increase in the line of sight" (SMM 16.20 para 65b(2)): 2°/s, an estimate. */
const LOS_RATE_DPS = 2;
/** How much of the full pure-pursuit turn #2 may fly to point at Lead (estimates; the planner picks one). */
const POINT_SHARES = [1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8];
/** Where #2 may line up after the reversal: at least 300 ft behind Lead's 3/9 line, 400 to 2,000 ft from him (estimates). */
const LINE_UP = Object.freeze({ behindFt: 300, minRangeFt: 400, maxRangeFt: 2000 });
/**
 * At the normal reference #2 lines up wherever the standard rejoin's choices put him, even a little ahead or close in (the
 * error carries, TS-62); an overshoot then takes over if he can't stop. Estimates.
 */
const LINE_UP_REFERENCE = Object.freeze({ behindFt: -100, minRangeFt: 250, maxRangeFt: 3000 });
/** How close to the standard start the pair must be for the standard hot turning rejoin (estimates: the shared margins). */
export const STANDARD = Object.freeze({ spacingFt: 100, foreAftFt: 500, heightFt: 100, kias: 10, headingDeg: 5 });

/**
 * The numbers of the off-standard starts and the overshoot (TS-62). All estimates unless a source is given.
 */
export const HOT = Object.freeze({
  minDescentSec: 12, // #2 comes down (or up) to the fighting wing height over at least 12 s, the standard start's (TS-55) ...
  descentFtps: 30, // ... at about 30 ft/s average (1,800 ft/min) when there is time ...
  maxDescentFtps: 45, // ... and faster, up to about 45 ft/s average (2,700 ft/min; its steepest about 13° nose down at 200 KIAS), to be off the
  // stack before he is inside 2,000 ft of Lead (SMM 12.27 para 65: never at or above Lead's height while closing)
  // A planned speed-up may ask up to what full power gives, or the 3 kt/s every planned line keeps under (TS-55) where that is
  // more: the kinematic lines of the standard rejoin already ask a little more than full power in the capture (TS-62 notes it).
  accelCapKtps: 3,
  lagShares: [0.75, 0.7], // Fix it may also cut off less (a lag line, geometry first: Patrick 23:37Z, SMM 12.24 para 57)
  search: Object.freeze({ shares: [1.2, 1.1, 1, 0.9, 0.8], banksDeg: [35, 45, 55, 60], reversalStepSec: 1 }), // the coarser search off the standard start
  // Fix it's power: the speed #2 slows to before the capture, 200 KIAS as the standard (Lead's speed) or a little more, so he
  // keeps a set overtake with power (SMM 12.24 para 56: 10 to 20 KIAS more than Lead's; Patrick 23:37Z)
  powerTargetsKias: [200, 210, 220],
  captureSecs: [20, 30, 45], // the capture onto fighting wing: the shortest whose speed changes the aircraft can fly (20 s is the standard's)
  // Where off-standard starts are accepted at all (a generous "roughly line abreast"; anything else flies the tracker's rejoin):
  start: Object.freeze({ minAcrossFt: 1000, maxForeAftFt: 4000, maxHeightFt: 2500, maxKiasOff: 45, maxHeadingDeg: 10 }),
  // The overshoot (SMM 12.27 para 65, Fig 12.18):
  passBehindFt: LENGTH_FT, // passes at least one aircraft length behind Lead (the figure: "one to two aircraft lengths behind and below")
  belowFt: 30, // ... and stays at least this far below Lead until stable outside ("do not go higher than the flat turn position")
  outsideLeftFt: 100, // stabilises on the outside about 3 wingspans out, about one length of clearance tip to tip ("at least one aircraft length")
  outsideBackFt: 40, // ... a little behind Lead's 3/9 line
  blendSecs: [8, 11, 14, 18, 24], // how long the overshoot takes to settle on the outside: the shortest the aircraft can fly
  rollLevelSec: 2, // #2's turn dies away over this long as he rolls the wings level
  idleShare: 0.9, // the overshoot slows at 90% of what idle and the boards give, so the settling has room ("use power and speed brake as required")
  decisionStepSec: 0.5, // the decision point is searched back from the latest possible in half-second steps
});

const RANK = Object.freeze({ power: 0, boards: 1, idle: 2, idleBoards: 3 });

/**
 * The slowing and speeding up a planned line asks for, from pose index `from` on: each step's stage (slow-down.js, the
 * first in the order of use that gives it), the first step that asks more than idle and the boards can give (-1 if none),
 * and the most a speed-up asks past full power (KIAS per second; 0 if never). Read from the line's own speeds, lightly
 * smoothed (a half-second running mean) so the differences' noise is not read as a need. A climb or descent counts too
 * (energy height, standard aerodynamics: holding the speed in a descent at climb rate c takes g c / V of extra drag), so a
 * high start that dives down to Lead has its height to lose as well as its speed (Patrick 19:15Z lists "high" as a worse start).
 */
export function speedNeeds(poses, from, blockFt) {
  const n = poses.length;
  const raw = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) raw[k] = (poses[k + 1].kias - poses[k - 1].kias) / (2 * dt);
  const half = 5;
  const ranks = new Int8Array(n).fill(-1);
  let firstBad = -1;
  let accelShort = 0;
  let top = 0;
  for (let k = Math.max(1, from); k < n - 1; k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(1, k - half); j <= Math.min(n - 2, k + half); j++) {
      sum += raw[j];
      cnt++;
    }
    const p = poses[k];
    const r = sum / cnt + ((G_FTPS2 * (p.climb ?? 0)) / Math.max(p.tas, 1)) * (p.kias / Math.max(p.tas, 1));
    if (r < 0) {
      const st = stageFor(-r, p.kias, blockFt, p.g);
      if (!st.ok && -r > slowKtps('idleBoards', p.kias, blockFt, p.g) * 1.02 + 0.05 && firstBad < 0) firstBad = k;
      ranks[k] = RANK[st.stage];
      top = Math.max(top, ranks[k]);
    } else {
      accelShort = Math.max(accelShort, r - Math.max(fullPowerKtps(p.kias, blockFt, p.g) * 1.05 + 0.05, HOT.accelCapKtps));
    }
  }
  return { ranks, firstBad, accelShort: Math.max(0, accelShort), top };
}

/** Writes each pose's slowing stage from its rank, held for a second either side so the boards don't flick in and out. */
function labelStages(poses, from, ranks) {
  const hold = Math.round(1 / dt);
  for (let k = Math.max(0, from); k < poses.length; k++) {
    let r = -1;
    for (let j = Math.max(0, k - hold); j <= Math.min(poses.length - 1, k + hold); j++) r = Math.max(r, ranks[j]);
    poses[k].stage = r >= 1 ? STAGES[r] : r === 0 ? 'power' : null;
  }
}

/** The first pose index from `from` at which #2 would pass ahead of Lead's 3/9 line inside 1,000 ft (the overshoot lane, ±100 ft margin), or -1. */
function laneBreak(poses, leadRec, from) {
  for (let k = Math.max(0, from); k < poses.length; k++) {
    const L = leadRec.at(k + 1);
    const rel = relativeTo(L, { xFt: poses[k].x, yFt: poses[k].y });
    if (Math.hypot(rel.fwd, rel.left) < 1000 && rel.fwd > 100) return k;
  }
  return -1;
}

/**
 * The least height #2 is below Lead (feet; negative is above) where the off-standard rejoin holds him below (TS-62): from the
 * line-up on (step kh) inside 2,000 ft, and anywhere inside 1,000 ft (SMM 12.27 para 65). Before the line-up a high start
 * may still be stepping down while he is further out than 1,000 ft (flagged on the card, never walled).
 */
function belowWhereItCounts(poses, rec, kh) {
  let least = Infinity;
  for (let k = 1; k <= poses.length; k++) {
    const L = rec.at(k);
    const p = poses[k - 1];
    const range = Math.hypot(L.xFt - p.x, L.yFt - p.y);
    if (range < 1000 || (k >= kh && range < 2000)) least = Math.min(least, L.altAboveFt - p.alt);
  }
  return least;
}

/** A recorded flight seen with its wings level, for the overshoot's "carry on" line (followInto level). */
const levelRef = (rec) => ({ t0: rec.t0, at: (k) => ({ ...rec.at(k), bankDeg: 0 }) });

/**
 * The places #2's line passes after an overshoot, from `outside` (stable on the outside of Lead's turn, side -s) to the
 * formation commanded: back and down behind Lead (level, not in Lead's wing plane, so he never steps up on the outside),
 * across under his tail and up into the slot (SMM 12.27 para 65: "cross over to the appropriate echelon and complete the
 * rejoin as normal"; SMM 12.20 para 44b: crossing behind and below). To fighting wing: back out to the fighting wing place,
 * flowing behind Lead to #2's side (SMM 12.29 para 69).
 */
function crossBackPoints(outside, s, to, sTo, spacingFt) {
  const slot = (key, side) => slotPoint(key, side, spacingFt);
  const astern = slot('astern', 0);
  const behindY = astern.fwd - 12;
  const low = astern.up - 4;
  const pts = [outside];
  if (to === 'fw') {
    const back = -fwShapeNow().rangeFt;
    pts.push({ fwd: -300, left: -s * 200, up: -60, plane: 0 });
    if (sTo === s) pts.push({ fwd: back, left: -s * 300, up: -60, plane: 0 }, { fwd: back, left: 0, up: -60, plane: 0 }, { fwd: back, left: s * 300, up: -60, plane: 0 });
    pts.push(slot('fw', sTo));
    return pts;
  }
  if (to !== 'astern' && sTo === -s) {
    pts.push(slot(to, sTo));
    return pts;
  }
  pts.push({ fwd: behindY, left: -s * 60, up: low, plane: 0 }, { fwd: behindY, left: 0, up: low, plane: 0 });
  if (to === 'astern') {
    pts.push(astern);
    return pts;
  }
  pts.push({ fwd: behindY, left: slot(to, sTo).left, up: low, plane: 1 }, slot(to, sTo));
  return pts;
}

/**
 * The hot turning rejoin from line abreast (SMM 16.20 para 65b(2), para 66, Fig 16.25). At the press Lead turns into #2 at
 * 30° of bank, slowing smoothly to 200 KIAS with power, and holds that bank and speed until #2 is in position. #2 at once
 * turns hard (60° bank) to point at Lead, rolls out, and when the line of sight starts to move reverses, so its fuselage is
 * lined up with Lead's as it reaches fighting wing; to echelon (or route, or line astern) it carries on through the fighting
 * wing position (para 66). Below Lead throughout (SMM 12.27 para 65). s: #2's side (+1 left, -1 right); to, sTo: the
 * formation and side commanded.
 * opts.mode:
 *   'standard'   the standard start (V2.15, TS-55): the planner's best line.
 *   'fix'        an off-standard start, "Fix it" (TS-62): #2 corrects in Patrick's order (23:37Z): geometry first (how far
 *                he cuts off, a lag line, when and how hard he reverses), then power, then the speed brake, then idle; the
 *                line using the least of them wins. If none can stop him in route, he overshoots at the decision point.
 *   'reference'  an off-standard start, "Turn at normal reference": #2 flies the standard rejoin's own choices (opts.knobs,
 *                from the standard start) from where he is, with power only, and keeps his speed error (opts.carryKias);
 *                the error carries through, so he overshoots when it leaves him too much energy.
 * opts.lateSec: #2 reacts that late (the Roll-in error). Returns { ok, plans, endSec, leadTurnDeg, maxBankDeg, laneFwdFt,
 * minBelowFt, reverse, knobs, usedStage, overshoot } or { ok: false, reason }.
 */
// Fig 16.25 is not to scale: flown at 200 KIAS and 30° of bank, a reversal timed as the figure draws it lines #2 up
// thousands of feet behind and outside Lead. Patrick chose this SMM text version, from the standard start (4 Oct 19:16Z,
// TS-55): #2 lines up just behind Lead, then one line carries it into fighting wing.
export function planHotRejoin(pair, s, to, sTo, opts = {}, t0 = 0) {
  const { spacingFt = 6000, blockFt = 8000, mode = 'standard', knobs: refKnobs = null, lateSec = 0, carryKias = 0 } = opts;
  const [lead, wing] = pair;
  const h0 = lead.headingRad;
  const fw = slotPoint('fw', s, spacingFt);
  const bank = REJOIN.leadBankDeg;
  // Lead "smoothly slows to 200 KIAS" (Fig 16.25) with power, not the boards (Patrick 23:37Z, TS-61).
  const leadSlow = { ...speedSegFor(lead.kias, KIAS_OUTSIDE_LAB, blockFt, 'power'), withNext: true };
  // While planning, Lead keeps turning (four near-half circles at 30°); the real plan ends the turn once #2 is in.
  const longRec = recordFlight(lead, { segments: [leadSlow, ...leadTurnSegs(h0, s, 4 * 170 * DEG, bank, false)] }, t0);
  const kiasPerTas = wing.kias / wing.tasFtps;
  // A late reaction (the Roll-in error) holds #2 straight, at his speed, before anything else.
  const pre = lateSec > 0 ? [{ kind: 'hold', untilSec: onStep(t0 + lateSec), thenNext: true }] : [];
  const standard = mode === 'standard';
  /** Seconds from the press until a pure-pursuit #2 is inside rangeFt of Lead (a first look, level, power only). */
  const timeToRange = (rangeFt) => {
    const a = copyAircraft(wing);
    const point = Math.atan2(lead.yFt - wing.yFt, lead.xFt - wing.xFt);
    const p = { segments: [...pre, turnSeg(wholeDegree(point), -s, KINEMATIC.pointBankDeg)] };
    let t = t0;
    for (let k = 1; k <= 4000; k++) {
      stepAircraft(a, p, t);
      t += dt;
      const L = longRec.at(k);
      if (Math.hypot(L.xFt - a.xFt, L.yFt - a.yFt) < rangeFt) return k * dt;
    }
    return Infinity;
  };
  // Down (or up) to the fighting wing height first: 12 s from the standard start, longer from a high or low one, but done
  // before #2 is inside 2,000 ft of Lead (HOT; the horizontal path doesn't depend on it, so it is read off a first look).
  const dh = lead.altAboveFt + fw.up - wing.altAboveFt;
  const within2000 = standard ? Infinity : timeToRange(2200);
  const descendSec = Math.max(HOT.minDescentSec, (SMOOTHER_PEAK * Math.abs(dh)) / HOT.maxDescentFtps, Math.min((SMOOTHER_PEAK * Math.abs(dh)) / HOT.descentFtps, within2000 - 2));
  const descend = { t0, t1: t0 + descendSec, fromFt: wing.altAboveFt, toFt: lead.altAboveFt + fw.up };
  /** Flies #2 from the press through segments, calling each(a, k, p) after every step until it returns false. */
  const flyWing = (segments, maxSteps, each) => {
    const a = copyAircraft(wing);
    const p = { segments: segments.map((x) => ({ ...x })), profile: [descend] };
    let t = t0;
    for (let k = 1; k <= maxSteps; k++) {
      stepAircraft(a, p, t);
      t += dt;
      if (each(a, k, p) === false) break;
    }
    return a;
  };

  /** Steps 1 and 2 for one way of slowing: the turn to point, the roll-out and the reversal; every way that lines #2 up, best first. */
  const lineUps = (slowWing, knobs = null) => {
    const lineUp = mode === 'reference' ? LINE_UP_REFERENCE : LINE_UP;
    // 1. Turn hard to point at Lead (pure pursuit at the roll-out), found in a few passes.
    let point = Math.atan2(lead.yFt - wing.yFt, lead.xFt - wing.xFt);
    for (let pass = 0; pass < 5; pass++) {
      let out = 1;
      const end = flyWing([...pre, slowWing, turnSeg(wholeDegree(point), -s, KINEMATIC.pointBankDeg)], 4000, (a, k, p) => {
        out = k;
        return !(p.segments.length === 0 && a.bankDeg === 0);
      });
      const L = longRec.at(out);
      point = Math.atan2(L.yFt - end.yFt, L.xFt - end.xFt);
    }
    const pointTurn = Math.abs(wrapPi(point - wing.headingRad));

    // 2. Roll out pointing at Lead, then reverse once the line of sight moves. The planner tries how far toward Lead #2 turns
    // (the full pure-pursuit turn or a little less: an "aggressive" turn that a pilot anticipating Lead's turn stops short),
    // when it reverses and at what bank, and keeps the ways that line #2 up nearest fighting wing, on its own side, at the
    // smallest speed difference (para 65b(2): anticipate the reversal to align the fuselage with Lead's). At the normal
    // reference only the standard start's own choices are flown.
    const bearing = (w, l) => wrapPi(Math.atan2(l.yFt - w.yFt, l.xFt - w.xFt) - w.headingRad);
    const fwSlotAt = (k) => slotInWorld(longRec.at(k), fw.fwd, fw.left, fw.up, 0);
    // Off the standard start the search is coarser (HOT.search) so a press still plans in a second or two.
    const shares = knobs ? [knobs.share] : standard ? POINT_SHARES : [...HOT.search.shares, ...(mode === 'fix' ? HOT.lagShares : [])];
    const banks = knobs ? [knobs.b3] : standard ? KINEMATIC.reverseBanksDeg : HOT.search.banksDeg;
    const krStep = Math.round((standard ? 0.5 : HOT.search.reversalStepSec) / dt);
    const candidates = [];
    for (const share of shares) {
      const pointSeg = turnSeg(wholeDegree(wing.headingRad - s * pointTurn * share), -s, KINEMATIC.pointBankDeg);
      const states = [];
      let rolledOut = 0;
      flyWing([...pre, slowWing, pointSeg, { kind: 'hold', untilSec: t0 + 600, straight: true }], 12000, (a, k, p) => {
        states[k] = { ...a, speedLeg: p.speedLeg ? { ...p.speedLeg } : null };
        if (!rolledOut && p.segments[0]?.straight && a.bankDeg === 0) rolledOut = k;
        return !rolledOut || k < rolledOut + Math.round(40 / dt);
      });
      if (!rolledOut) continue;
      const losRate = (k) => wrapPi(bearing(states[k], longRec.at(k)) - bearing(states[k - 1], longRec.at(k - 1))) / dt;
      let firstMove = rolledOut + 1;
      while (firstMove < states.length - 1 && Math.abs(losRate(firstMove)) < LOS_RATE_DPS * DEG) firstMove++;
      const reversals = [];
      if (knobs) reversals.push(Math.min(states.length - 1, Math.max(rolledOut + 1, firstMove + knobs.delaySteps)));
      else for (let kr = rolledOut + 1; kr <= Math.min(states.length - 1, firstMove + Math.round(20 / dt)); kr += krStep) reversals.push(kr);
      for (const kr of reversals) {
        for (const b3 of banks) {
          // The reversal turns until #2's heading matches the slot's track: fuselage lined up with Lead's (SMM 16.20 para 65b(2)).
          const a = copyAircraft(states[kr]);
          const p = { segments: [reverseSeg(states[kr], s, b3)], profile: [descend], speedLeg: states[kr].speedLeg ? { ...states[kr].speedLeg } : null };
          let t = t0 + kr * dt;
          let gapBefore = null;
          let hBefore = a.headingRad;
          for (let k = kr + 1; k <= kr + Math.round(60 / dt); k++) {
            stepAircraft(a, p, t);
            t += dt;
            const S0 = fwSlotAt(k - 1);
            const S1 = fwSlotAt(k + 1);
            // Heading still to turn to line up, less what the capture's easing of the reversal (to Lead's turn) still turns:
            // the reversal is anticipated (para 65b(2)) so the fuselage lines up as the bank comes off.
            const slotTurn = wrapPi(longRec.at(k + 1).headingRad - longRec.at(k - 1).headingRad) / (2 * dt);
            const ownTurn = wrapPi(a.headingRad - hBefore) / dt;
            hBefore = a.headingRad;
            const ease = Math.max(0, (ownTurn - slotTurn) * s) * KINEMATIC.captureEaseSec * 0.5;
            const gap = wrapPi(Math.atan2(S1.y - S0.y, S1.x - S0.x) - a.headingRad) * s - ease;
            if (gapBefore !== null && gap <= 0 && gapBefore > 0) {
              // Lined up. Keep it if #2 is behind Lead and clear of him, and score how far it is from fighting wing and how
              // fast it moves against the point in Lead's frame where it is (what the capture has to take out).
              const L = longRec.at(k);
              const rel = relativeTo(L, a);
              const range = Math.hypot(rel.fwd, rel.left);
              if (rel.fwd <= -lineUp.behindFt && range >= lineUp.minRangeFt && range <= lineUp.maxRangeFt) {
                const P0 = slotInWorld(longRec.at(k - 1), rel.fwd, rel.left, 0);
                const P1 = slotInWorld(longRec.at(k + 1), rel.fwd, rel.left, 0);
                const settled = a.headingRad + s * ease; // the heading once the capture has eased the reversal
                const dvx = a.tasFtps * Math.cos(settled) - (P1.x - P0.x) / (2 * dt);
                const dvy = a.tasFtps * Math.sin(settled) - (P1.y - P0.y) / (2 * dt);
                // The same, in Lead's frame: how #2 is drifting against him as it lines up.
                const drift = { fwd: dvx * Math.cos(L.headingRad) + dvy * Math.sin(L.headingRad), left: -dvx * Math.sin(L.headingRad) + dvy * Math.cos(L.headingRad) };
                const rv = Math.hypot(dvx, dvy);
                candidates.push({ kr, b3, kh: k, pointSeg, states, rel, drift, share, delaySteps: kr - firstMove, score: Math.hypot(rel.fwd - fw.fwd, rel.left - fw.left) + 8 * rv });
              }
              break;
            }
            gapBefore = gap;
          }
        }
      }
    }
    candidates.sort((x, y) => x.score - y.score);
    return candidates;
  };

  // 3. For a line-up, the whole line: from the line-up, one continuous line out to the fighting wing position (the capture),
  // on through it to the target (para 66), and Lead's roll-out once #2 is in.
  const onward = to === 'fw' && sTo === s ? [] : routePoints('fw', s, to, sTo, fw, spacingFt).slice(1);
  const blend = CLOSE.has(to) ? KINEMATIC.closeBlendSec : KINEMATIC.wideBlendSec;
  /** The flown part, steps 1..kh: the turn to point, the straight leg and the reversal, as flight.js flies them. */
  const flownPart = (c, slowWing, track) => {
    const segs = [...pre, slowWing, c.pointSeg, { kind: 'hold', untilSec: t0 + c.kr * dt, thenNext: true }, reverseSeg(c.states[c.kr], s, c.b3)];
    const flown = [];
    flyWing(segs, c.kh, (a, k) => {
      if (track) {
        track.x[k + 3] = a.xFt;
        track.y[k + 3] = a.yFt;
        track.z[k + 3] = a.altAboveFt;
      }
      flown[k] = poseOf(a);
      return true;
    });
    return flown;
  };
  /** The capture's moving slot from the line-up, carrying #2's drift so the capture takes it out smoothly. */
  const captureSlot = (c, captureSec) => {
    const carry = Math.min(captureSec, KINEMATIC.captureSec) / 2; // the standard capture's carry; a longer capture only eases the line
    const first = { fwd: c.rel.fwd + c.drift.fwd * carry, left: c.rel.left + c.drift.left * carry, up: fw.up, plane: 0 };
    return movingSlot([first, fw, ...onward], c.kh);
  };
  /** Lead's turn, held at 30° until step inStep, then rolled out on the whole degree. */
  const leadPlanTo = (inStep) => {
    let turned = 0;
    for (let i = 1; i <= inStep; i++) turned += wrapPi(longRec.at(i).headingRad - longRec.at(i - 1).headingRad) * s;
    const segments = [leadSlow, ...leadTurnSegs(h0, s, Math.round(turned / DEG) * DEG, bank, true)];
    return { segments, turned, rec: recordFlight(lead, { segments }, t0) };
  };
  const buildLine = (c, slowWing, captureSec) => {
    const moving = captureSlot(c, captureSec);
    const inStep = Math.max(c.kh + Math.round(captureSec / dt), moving.endStep);
    const lp = leadPlanTo(inStep);
    const events = rollEvents(lp.rec, moving.slotAt, c.kh, lastRollEnd(lp.rec, inStep + Math.round(30 / dt)) + 1, blend);
    const n = Math.max(c.kh + Math.ceil(captureSec / dt), inStep, eventsEnd(events)) + 4;
    const track = makeTrack(n);
    seedTrack(track, wing);
    const flown = flownPart(c, slowWing, track);
    const line = finishLine(track, lp.rec, c.kh, moving.slotAt, n, captureSec, events, kiasPerTas, KINEMATIC.captureEaseSec);
    // Up to the line-up #2 flies exactly what flight.js flew (its own roll and speed), not values read back off the line.
    for (let k = 1; k <= c.kh - 3; k++) line.poses[k - 1] = flown[k];
    return { c, slowWing, captureSec, moving, lp, n, track, line, checks: laneAndBelow(lp.rec, track, n) };
  };
  const result = (b, extra = {}) => ({
    ok: true,
    plans: { [lead.id]: { segments: b.lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: b.line.poses }] } },
    endSec: t0 + b.n * dt,
    leadTurnDeg: Math.round(b.lp.turned / DEG),
    maxBankDeg: b.line.maxBankDeg,
    minKias: b.line.minKias,
    maxKias: b.line.maxKias,
    reverse: { atSec: b.c.kr * dt, bankDeg: b.c.b3 },
    knobs: { share: b.c.share, delaySteps: b.c.delaySteps, b3: b.c.b3 },
    usedStage: null,
    overshoot: null,
    ...b.checks,
    ...extra,
  });

  if (standard) {
    const slowWing = { ...speedSegFor(wing.kias, KINEMATIC.hotWingKias, blockFt, 'power'), withNext: true };
    const candidates = lineUps(slowWing);
    if (!candidates.length) return { ok: false, reason: 'No safe hot turning rejoin from here: #2 could not line up with Lead.' };
    for (const c of candidates.slice(0, 12)) {
      const b = buildLine(c, slowWing, KINEMATIC.captureSec);
      if (b.line.maxBankDeg > KINEMATIC.pointBankDeg + 0.5 || b.checks.laneFwdFt > 100 || b.checks.minBelowFt <= 0) continue;
      const needs = speedNeeds(b.line.poses, c.kh - 3, blockFt);
      labelStages(b.line.poses, c.kh - 3, needs.ranks);
      return result(b);
    }
    return { ok: false, reason: 'No safe hot turning rejoin from here: every way in broke the bank cap, the overshoot lane or the height rule.' };
  }

  // Off-standard: try the ways of slowing in Patrick's order (Fix it) or power only (normal reference), and for each the
  // geometry, keeping the line that uses the least; remember the best line that would need an overshoot.
  const wingKias = KINEMATIC.hotWingKias + carryKias; // at the normal reference #2 keeps his speed error (it carries)
  const good = [];
  let nearly = null; // the best line whose capture asks a little more speed-up than full power gives (see HOT.accelCapKtps)
  let needsOvershoot = null;
  let lined = false;
  /** Tries one way of slowing (stage) with the given choices (knobs, or a search), the best `top` line-ups. */
  const tryStage = (stage, knobs, top, toKias = wingKias) => {
    const slowWing = { ...speedSegFor(wing.kias, toKias, blockFt, stage), withNext: true };
    const candidates = lineUps(slowWing, knobs);
    if (globalThis.HRDBG) console.error('DBG stage', stage, 'cands', candidates.length);
    if (candidates.length) lined = true;
    for (const c of candidates.slice(0, top)) {
      for (const captureSec of HOT.captureSecs) {
        const b = buildLine(c, slowWing, captureSec);
        if (b.line.maxBankDeg > KINEMATIC.pointBankDeg + 0.5 || belowWhereItCounts(b.line.poses, b.lp.rec, c.kh) <= 0) break;
        const needs = speedNeeds(b.line.poses, c.kh - 3, blockFt);
        const lane = laneBreak(b.line.poses, b.lp.rec, c.kh);
        if (globalThis.HRDBG) console.error('DBG  cand', c.share, c.delaySteps, c.b3, 'kh', c.kh, 'cap', captureSec, 'bank', b.line.maxBankDeg.toFixed(1), 'below', b.checks.minBelowFt.toFixed(0), 'bad', needs.firstBad, 'lane', lane, 'accShort', needs.accelShort.toFixed(2), 'top', needs.top);
        if (needs.firstBad >= 0 || lane >= 0) {
          // Too much energy for this line: the decision point comes before the first step it can't be flown.
          const kBad = Math.min(...[needs.firstBad, lane].filter((x) => x >= 0));
          if (!needsOvershoot || RANK[stage] >= RANK[needsOvershoot.stage]) needsOvershoot = { b, kBad: Math.max(c.kh + 1, kBad), stage };
          break;
        }
        const entry = { b, needs, used: Math.max(RANK[stage], needs.top), score: c.score };
        if (needs.accelShort > 0) {
          // A longer capture asks less power; keep the line that asks least past it in case none is within it.
          if (!nearly || needs.accelShort < nearly.needs.accelShort) nearly = entry;
          continue;
        }
        labelStages(b.line.poses, c.kh - 3, needs.ranks);
        good.push(entry);
        break;
      }
    }
  };
  if (mode === 'reference') {
    tryStage('power', refKnobs, 1);
    // The standard start's own choices don't line up from here: the nearest standard rejoin, still power only.
    if (!good.length && !needsOvershoot) tryStage('power', null, 8);
  } else {
    // Fix it, in Patrick's order: geometry with power (slowing to Lead's speed, or keeping a set overtake), then the speed
    // brake, then idle, then both; the first way that works, and the line using the least of them.
    for (const toKias of HOT.powerTargetsKias) {
      tryStage('power', null, 5, toKias);
      if (good.some((g) => g.used === 0)) break;
    }
    for (const stage of STAGES.slice(1)) {
      if (good.some((g) => g.used < RANK[stage])) break;
      tryStage(stage, null, 5);
    }
  }
  if (!good.length && nearly) {
    // The speed-ups of the planned capture lines aren't held to full power yet (the standard rejoin's aren't either: TS-62,
    // future.md); the slowing is, and that is what an off-standard start tests.
    labelStages(nearly.b.line.poses, nearly.b.c.kh - 3, nearly.needs.ranks);
    good.push(nearly);
  }
  if (good.length) {
    good.sort((x, y) => x.used - y.used || x.score - y.score);
    return result(good[0].b, { usedStage: STAGES[good[0].used] });
  }
  if (needsOvershoot) {
    if (globalThis.HRDBG) console.error('DBG overshoot from kBad', needsOvershoot.kBad, 'kh', needsOvershoot.b.c.kh);
    const o = planOvershoot(needsOvershoot);
    if (globalThis.HRDBG) console.error('DBG overshoot', Boolean(o));
    if (o) return o;
  }
  return { ok: false, reason: lined ? 'No safe hot turning rejoin or overshoot from here.' : 'No safe hot turning rejoin from here: #2 could not line up with Lead.' };

  /**
   * The overshoot (SMM 12.27 paras 64-65, Fig 12.18): at the decision point #2 rolls the wings level and reduces torque (idle
   * and the speed brake as required), passes one to two lengths behind and below Lead, never climbing to or above Lead's
   * height, stabilises on the outside of the turn with at least a length of clearance and no overtake, then crosses back
   * under Lead's tail to the formation commanded and completes the rejoin as normal. The decision point is the latest from
   * which the overshoot passes behind and below and can be flown; the rejoin is flown as planned until then.
   */
  function planOvershoot({ b, kBad }) {
    const c = b.c;
    const vLead = KIAS_OUTSIDE_LAB * (lead.tasFtps / lead.kias);
    const tasPerKias = 1 / kiasPerTas;
    /** Slowing at 90% of what idle and the boards give, easing off as #2 comes back to Lead's speed (ft/s², true). */
    const accelFn = (v) => {
      const kias = v * kiasPerTas;
      const taper = smoother(Math.max(0, Math.min(1, (v - vLead) / (10 * KT_TO_FTPS * tasPerKias))));
      return -HOT.idleShare * slowKtps('idleBoards', kias, blockFt) * KT_TO_FTPS * tasPerKias * taper;
    };
    const moving = captureSlot(c, b.captureSec);
    /** The line up to and through the overshoot, with Lead flying `rec`, from decision step kD with a settling of blendSec. */
    const overshootTrack = (rec, kD, blendSec, n, outside) => {
      const track = makeTrack(n);
      seedTrack(track, wing);
      const flown = flownPart(c, b.slowWing, track);
      followInto(track, { ref: laggedBank(rec, KINEMATIC.planeLagSec), from: c.kh, slotAt: moving.slotAt, blendSec: b.captureSec, decaySec: KINEMATIC.captureEaseSec });
      followInto(track, { ref: levelRef(rec), from: kD, slotAt: () => outside, blendSec, decaySec: HOT.rollLevelSec, level: true, accelFn });
      return { track, flown };
    };
    const step = Math.max(1, Math.round(HOT.decisionStepSec / dt));
    for (let kD = kBad; kD > c.kh + Math.round(1 / dt); kD -= step) {
      // Where #2 is at the decision: the outside place keeps his height if he is lower (he never climbs while crossing).
      const probe = overshootTrack(longRec, kD, 1, kD + 8, { fwd: 0, left: 0, up: 0, plane: 0 }).track;
      const upNow = probe.z[kD + 3] - longRec.at(kD).altAboveFt;
      const outside = { fwd: -HOT.outsideBackFt, left: -s * HOT.outsideLeftFt, up: Math.min(upNow, -HOT.belowFt), plane: 0 };
      for (const blendSec of HOT.blendSecs) {
        const kS = kD + Math.ceil(blendSec / dt);
        const n = kS + 8;
        const { track } = overshootTrack(longRec, kD, blendSec, n, outside);
        const poses = posesFrom(track, kiasPerTas).poses;
        const pb = passesBehindAndBelow(poses, longRec, kD, kS);
        const needs = speedNeeds(poses, kD - 1, blockFt);
        if (globalThis.HRDBG && blendSec === HOT.blendSecs[0]) console.error('DBG   kD', kD, 'B', blendSec, 'pass', pb, 'bad', needs.firstBad, 'kS', kS, 'upNow', upNow.toFixed(0));
        if (!pb) continue;
        if (needs.firstBad >= 0 && needs.firstBad < kS - 1) continue;
        return finishOvershoot({ c, kD, kS, blendSec, outside, overshootTrack });
      }
    }
    return null;
  }

  /** True when, from kD to kS, #2 crosses Lead's tail line at least a length behind him and stays below him all the way. */
  function passesBehindAndBelow(poses, rec, kD, kS) {
    let crossed = false;
    let lastLeft = null;
    for (let k = kD; k <= kS && k <= poses.length; k++) {
      const L = rec.at(k);
      const p = poses[k - 1];
      const rel = relativeTo(L, { xFt: p.x, yFt: p.y });
      if (L.altAboveFt - p.alt < HOT.belowFt - 1e-6 && Math.hypot(rel.fwd, rel.left) < 1000) return false;
      if (lastLeft !== null && Math.sign(rel.left) !== Math.sign(lastLeft)) {
        if (rel.fwd > -HOT.passBehindFt) return false;
        crossed = true;
      }
      lastLeft = rel.left;
    }
    // Ends on the outside of Lead's turn (side -s).
    return crossed || (lastLeft !== null && Math.sign(lastLeft) === -s);
  }

  /** The whole overshoot line: the rejoin to the decision point, the overshoot, the cross back and Lead's roll-out. */
  function finishOvershoot({ c, kD, kS, blendSec, outside, overshootTrack }) {
    const back = movingSlot(crossBackPoints(outside, s, to, sTo, spacingFt), kS);
    const inStep = back.endStep;
    const lp = leadPlanTo(inStep);
    const crossBlend = CLOSE.has(to) ? KINEMATIC.closeBlendSec : KINEMATIC.wideBlendSec;
    const events = rollEvents(lp.rec, back.slotAt, kS, lastRollEnd(lp.rec, inStep + Math.round(30 / dt)) + 1, crossBlend);
    const n = Math.max(inStep, eventsEnd(events)) + 4;
    const { track, flown } = overshootTrack(lp.rec, kD, blendSec, n, outside);
    const ref = laggedBank(lp.rec, KINEMATIC.planeLagSec);
    followInto(track, { ref, from: kS, slotAt: back.slotAt, blendSec: KINEMATIC.startBlendSec * 2, decaySec: KINEMATIC.startBlendSec });
    for (const e of events) followInto(track, { ref, from: e.k, slotAt: back.slotAt, blendSec: e.blendSec, decaySec: e.blendSec / 2 });
    const line = posesFrom(track, kiasPerTas);
    settleLast(line.poses, lp.rec.at(n));
    for (let k = 1; k <= c.kh - 3; k++) line.poses[k - 1] = flown[k];
    const needs = speedNeeds(line.poses, c.kh - 3, blockFt);
    labelStages(line.poses, c.kh - 3, needs.ranks);
    for (let k = kD; k <= kS && k <= line.poses.length; k++) line.poses[k - 1].over = true;
    const checks = laneAndBelow(lp.rec, track, n);
    return {
      ok: true,
      plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: line.poses }] } },
      endSec: t0 + n * dt,
      leadTurnDeg: Math.round(lp.turned / DEG),
      maxBankDeg: line.maxBankDeg,
      minKias: line.minKias,
      maxKias: line.maxKias,
      reverse: { atSec: c.kr * dt, bankDeg: c.b3 },
      knobs: { share: c.share, delaySteps: c.delaySteps, b3: c.b3 },
      usedStage: STAGES[Math.max(...needs.ranks, 0)],
      overshoot: { atSec: kD * dt, stableSec: kS * dt },
      ...checks,
    };
  }
}

/** True when the pair is roughly line abreast, wings level, so an off-standard hot turning rejoin can start from it (HOT.start). */
function offStandardStart(lead, wing, rel) {
  const st = HOT.start;
  return Math.abs(rel.left) >= st.minAcrossFt &&
    Math.abs(rel.fwd) <= st.maxForeAftFt &&
    Math.abs(wing.altAboveFt - lead.altAboveFt) <= st.maxHeightFt &&
    Math.abs(wing.kias - lead.kias) <= st.maxKiasOff &&
    Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= st.maxHeadingDeg * DEG &&
    Math.abs(lead.bankDeg) < 0.5 &&
    Math.abs(wing.bankDeg) < 0.5;
}

/**
 * The hot turning rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply
 * and the tracker's rejoin flies instead. With no training error set: only from the standard start (Patrick 19:16Z), line
 * abreast at the spacing, level, on the line, matched at 220 KIAS, with the turning rejoin chosen. With an error set
 * (options.errors, errors.js resolveErrors; TS-62): from any roughly line abreast start, flown as the error's response says
 * (Fix it or Turn at normal reference).
 */
export function planHotRejoinChange(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const errors = options.errors ?? null;
  const from = classifyPair(lead, wing);
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const rel = relativeTo(lead, wing);
  const standard =
    from.key === 'lab' &&
    Math.abs(Math.abs(rel.left) - spacingFt) <= STANDARD.spacingFt &&
    Math.abs(rel.fwd) <= STANDARD.foreAftFt &&
    Math.abs(wing.altAboveFt - lead.altAboveFt) <= STANDARD.heightFt &&
    Math.abs(lead.kias - KIAS_LAB) <= STANDARD.kias &&
    Math.abs(wing.kias - KIAS_LAB) <= STANDARD.kias &&
    Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= STANDARD.headingDeg * DEG &&
    Math.abs(lead.bankDeg) < 0.5 &&
    Math.abs(wing.bankDeg) < 0.5;
  if (!errors && !standard) return null;
  if (errors && !standard && !offStandardStart(lead, wing, rel)) return null;
  const s = Math.sign(rel.left) || from.side || -1;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  let r;
  let mode = 'standard';
  if (!errors) {
    r = /** @type {any} */ (planHotRejoin(pair, s, to, sTo, { spacingFt, blockFt }, t0));
  } else {
    mode = errors.response === 'reference' ? 'reference' : 'fix';
    const lateSec = Math.max(0, errors.timingSec ?? 0); // early can't be earlier than the call
    let knobs = null;
    if (mode === 'reference') {
      // The standard rejoin's own choices, worked out from the standard start beside Lead as he is now.
      const nominal = { ...wing, xFt: lead.xFt - Math.sin(lead.headingRad) * s * spacingFt, yFt: lead.yFt + Math.cos(lead.headingRad) * s * spacingFt, altAboveFt: lead.altAboveFt, headingRad: lead.headingRad, kias: lead.kias, tasFtps: lead.tasFtps, bankDeg: 0, rollRateDps: 0 };
      const std = /** @type {any} */ (planHotRejoin([lead, nominal], s, to, sTo, { spacingFt, blockFt }, t0));
      knobs = std.ok ? std.knobs : { share: 1, delaySteps: 0, b3: 45 };
    }
    r = /** @type {any} */ (planHotRejoin(pair, s, to, sTo, { spacingFt, blockFt, mode, knobs, lateSec, carryKias: mode === 'reference' ? wing.kias - lead.kias : 0 }, t0));
  }
  if (!r.ok) return null;
  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromSide = s > 0 ? ' left' : ' right';
  const how = describe('lab', to, 'into');
  const base = `Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS, and holds it until #2 is in; #2 points at Lead, rolls out, reverses as the line of sight moves and lines up with Lead (SMM 16.20 para 65b(2)${to === 'fw' ? '' : ', through the fighting wing position, para 66'}).`;
  const offWords = mode === 'standard' ? '' : ` ${offStandardWords(mode, r)}`;
  return {
    ok: true,
    plans: r.plans,
    note: `Line abreast${fromSide} to ${label}${sideWord}: ${how}. ${base}${offWords}`,
    label: `${label}${sideWord}`,
    flying: `Line abreast${fromSide} to ${label}${sideWord} (${how}${mode === 'standard' ? '' : ', off-standard start'})`,
    from: 'lab',
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    leadTurnDeg: r.leadTurnDeg,
    laneFwdFt: r.laneFwdFt,
    maxBankDeg: r.maxBankDeg,
    judged: null,
    endSec: r.endSec,
    rejoining: true,
    offStandard: mode === 'standard' ? null : { mode, usedStage: r.usedStage, overshoot: r.overshoot },
  };
}

/** What #2 does about an off-standard start, in words for the card (TS-62). */
export function offStandardWords(mode, r) {
  const used = r.usedStage && r.usedStage !== 'power' ? STAGE_WORDS[r.usedStage] : null;
  if (r.overshoot) {
    const why = mode === 'reference' ? 'Turning at the normal reference, the error carries: ' : 'Fix it: geometry, power, the boards and idle are not enough, so ';
    return `${why}at the decision point #2 overshoots: wings level, power back and boards, behind and below Lead, stable on the outside, then he crosses back and joins (SMM 12.27 para 65, Fig 12.18).`;
  }
  if (mode === 'reference') return `Turning at the normal reference: #2 flies the standard rejoin from where he is, power only${used ? `, and needs ${used} to stop the overtake` : ''}.`;
  return `Fix it: #2 corrects with geometry first (cut-off, lag line, reversal), then power${used ? `, then ${used}` : ''} (Patrick's order, SMM 12.26 para 63).`;
}
