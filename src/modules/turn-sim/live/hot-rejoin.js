// The hot turning rejoin from line abreast (Turn Sim spec sections 10.1 and 10.5; decisions TS-55, TS-61, TS-62), on a
// kinematic pre-planned line (Patrick 4 Oct 18:00Z): from the standard start (V2.15), from the off-standard starts the
// Errors (training) panel sets (V2.20; Patrick 19:15Z: "wide or close, ahead of line, high, tight, fast; worst = ahead,
// high, tight, fast"), and the overshoot when #2 reaches the decision point with too much energy (Patrick 23:29Z).
// Since V2.59 (TS-68) it flies only the Errors panel's starts: every other 2-ship turning rejoin flies the rejoin line
// (turning-rejoin.js; Patrick 07:31Z).
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
//  - V2.59 (TS-67): Patrick 06:16Z's rulings flown (RULED_REJOIN: no bank cap but the G rule, Lead holds his turn until #2
//    is in, no fixed descent rate, the decision point about 200 ft); the rejoin line (SMM 12.24 paras 56-58, Fig 12.14;
//    Patrick 04:53Z: "green should EXPEDITIOUSLY find the line (as per the smm), run up it, then move down into right route
//    and into eschelon"): #2 lines up on his own side and never crosses Lead's six to the outside unless it is the decision
//    overshoot; and lines, then tracker (TS-65): the line hands over about 500 ft from route (or the fighting wing slot)
//    and the tracker runs in at the close-in rate, planned again at the hand-over.
// Every number with no source beside it is an estimate and says so.
import { wrapPi } from '../../../core/angles.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft, smoother } from './flight.js';
import { relativeTo, turnSeg, wholeDegree, onStep, DEG } from './manoeuvres.js';
import { recordFlight, describe, closeThrough, rejoinTo, legsFor, CHANGE_LIMIT_SEC } from './transitions.js';
import { KIAS_LAB, KIAS_OUTSIDE_LAB, REJOIN, KINEMATIC, HOT, STANDARD, LINE_UP, LINE_UP_REFERENCE, closureNow, rejoinClosureNow, ratesNow, RATE_WORDS } from './tuning.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, LENGTH_FT, fwShapeNow, pairSlot } from './slots.js';
import { makeTrack, seedTrack, posesFrom, settleLast, followInto, slotInWorld, poseOf, laggedBank, speedNeeds, labelStages, RANK } from './kinematic.js';
import { CLOSE, slotPoint, routePoints, movingSlot, rollEvents, eventsEnd, lastRollEnd, laneAndBelow, finishLine } from './kinematic-moves.js';
import { leadTurnInto, handOverPoint, offSlotFt, onClosure, trackTail, replanFor, wingPlan } from './hand-over.js';
import { STAGES, STAGE_WORDS, speedSegFor, slowKtps } from './slow-down.js';
import { holdToPower } from './full-power.js';

const dt = STEP_SEC;

/** The reversal: a turn toward Lead's side (s) at bank b3, held with no roll-out, so the capture takes over with the wings still banked. */
const reverseSeg = (state, s, b3) => turnSeg(wrapPi(state.headingRad + s * Math.PI * 0.9), s, b3, false);

/** "A definite increase in the line of sight" (SMM 16.20 para 65b(2)): 2°/s, an estimate. */
const LOS_RATE_DPS = 2;
/** How much of the full pure-pursuit turn #2 may fly to point at Lead (estimates; the planner picks one). */
const POINT_SHARES = [1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8];
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

/**
 * Where a planned line slides across behind Lead to the outside of his turn (side -s) and back: the overshoot of SMM 12.27
 * para 65 and Fig 12.18 seen in the line itself (#2 could not stop on his own side, passes behind and below Lead, is on the
 * outside, then crosses back). Returns { k0, k1, crossFwd } (pose indices of the crossing out and back, and how far behind
 * Lead he crossed) or null. Only inside HOT.outsideWithinFt of Lead counts: a wide swing far out is a lag, not an overshoot.
 */
function outsideCrossing(poses, rec, s) {
  let k0 = -1;
  let crossFwd = 0;
  let prev = null;
  for (let k = 0; k < poses.length; k++) {
    const L = rec.at(k + 1);
    const rel = relativeTo(L, { xFt: poses[k].x, yFt: poses[k].y });
    const side = Math.sign(rel.left);
    if (prev !== null && side !== prev) {
      if (side === -s && k0 < 0 && Math.hypot(rel.fwd, rel.left) < HOT.outsideWithinFt) {
        k0 = k;
        crossFwd = rel.fwd;
      } else if (side === s && k0 >= 0) return { k0, k1: k, crossFwd };
    }
    prev = side;
  }
  return k0 >= 0 ? { k0, k1: poses.length - 1, crossFwd } : null;
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
  // While planning, Lead keeps turning (four near-half circles at 30°); the real plan ends the turn once #2 is in
  // (Patrick 06:16Z item 3, hand-over.js leadTurnInto).
  const into = leadTurnInto({ lead, pre: [leadSlow], s, bankDeg: bank, t0, record: recordFlight });
  const longRec = into.longRec;
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
  // No fixed rate (Patrick 06:16Z item 4): never quicker than a smooth descent whose push stays within HOT.pushG (the
  // smootherstep's steepest vertical acceleration is 10 / sqrt(3), about 5.77, x change / time squared).
  const dh = lead.altAboveFt + fw.up - wing.altAboveFt;
  const within2000 = standard ? Infinity : timeToRange(2200);
  const smoothFloorSec = Math.sqrt(((10 / Math.sqrt(3)) * Math.abs(dh)) / (HOT.pushG * G_FTPS2));
  const descendSec = Math.max(HOT.minDescentSec, smoothFloorSec, Math.min(Math.abs(dh) / HOT.descentFtps, within2000 - 2));
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
  const lineUps = (slowWing, knobs = null, lineUp = mode === 'reference' ? LINE_UP_REFERENCE : LINE_UP) => {
    // 1. Turn hard to point at Lead (pure pursuit at the roll-out), found in a few passes.
    let point = Math.atan2(lead.yFt - wing.yFt, lead.xFt - wing.xFt);
    // Off the standard start a fast #2 can cross Lead's nose before he has turned, and the passes then swing between "turn
    // all the way" and "don't turn"; there each pass moves only halfway to the new answer, with more passes, so it settles.
    const passes = standard ? 5 : 10;
    const relax = standard ? 1 : 0.5;
    for (let pass = 0; pass < passes; pass++) {
      let out = 1;
      const end = flyWing([...pre, slowWing, turnSeg(wholeDegree(point), -s, KINEMATIC.pointBankDeg)], 4000, (a, k, p) => {
        out = k;
        return !(p.segments.length === 0 && a.bankDeg === 0);
      });
      const L = longRec.at(out);
      const next = Math.atan2(L.yFt - end.yFt, L.xFt - end.xFt);
      point = pass === 0 ? next : wrapPi(point + relax * wrapPi(next - point));
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
              // On his own side of Lead (V2.59: the rejoin line passes through fighting wing on #2's side, SMM 16.20 para 66;
              // Patrick 04:53Z).
              if (rel.fwd <= -lineUp.behindFt && range >= lineUp.minRangeFt && range <= lineUp.maxRangeFt && rel.left * s > 0) {
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
  const leadPlanTo = into.planTo;
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
  /** #2's line held to what the aircraft can do (full-power.js, TS-63): unchanged when it is already inside the limits. */
  const held = (poses, rec) => holdToPower(poses, { refAt: (i) => rec.at(i + 1), blockFt, kiasPerTas, from: 1 });
  /**
   * The tracker's legs from the hand-over (Patrick 06:09Z, 06:24Z): into route on #2's side at the close-in rate, then on
   * as the close legs say (SMM 12.24 para 58: stabilise in route, then echelon); to fighting wing, its slot.
   */
  const tailLegs = () => onClosure(CLOSE.has(to)
    ? [closeThrough(pairSlot('route', s, spacingFt)), ...legsFor('route', s, to, sTo, spacingFt)]
    : [rejoinTo(pairSlot('fw', s, spacingFt))], { closeIn: true });
  /**
   * Lines, then tracker (V2.59, TS-65 as for the other moves): the line is flown until #2 is about HAND_OVER_FT from route
   * on his side (or the fighting wing slot), then the tracker runs him in at the close-in rate while Lead holds his 30°
   * turn until #2 is IN POSITION (Patrick 06:16Z item 3), planned again at the hand-over (Patrick 06:24Z). poses: the line
   * as flown (held to full power where it was). Null when the tail can't be flown (the whole line is flown then), and
   * for fighting wing on the other side (the line flows across behind Lead to its end).
   */
  const withTail = (b, poses) => {
    if (to === 'fw' && sTo !== s) return null;
    const hoSlot = CLOSE.has(to) ? pairSlot('route', s, spacingFt) : pairSlot('fw', s, spacingFt);
    const { withinFt } = handOverPoint({ finalSlot: hoSlot });
    let iH = -1;
    for (let i = Math.max(1, b.c.kh - 3); i < poses.length - 2; i++) {
      if (offSlotFt(b.lp.rec.at(i + 1), poses[i].x, poses[i].y, hoSlot) <= withinFt) {
        iH = i;
        break;
      }
    }
    if (iH < 0) return null;
    const line = { poses: poses.slice(0, iH + 1), steps: iH + 1, accelKtps: (poses[iH + 1].kias - poses[iH - 1].kias) / (2 * dt) };
    const legs = tailLegs();
    const tail = trackTail({ wing, lead, leadRec: longRec, line, phases: legs, t0, blockFt, leadPlanFor: leadPlanTo });
    const { run } = tail;
    if (!run.ok || !tail.lp) return null;
    const durationSec = (tail.steps0 + run.points.length) * dt;
    if (durationSec > CHANGE_LIMIT_SEC || !judge([run.end.lead, run.end.wing], { key: to }, { spacingFt }).inBand) return null;
    const replan = replanFor({ leadId: lead.id, phases: legs, blockFt, accelKtps: line.accelKtps, record: recordFlight });
    return { line, tail, replan, durationSec };
  };
  const result = (b, extra = {}, hold = true) => {
    const h = hold ? held(b.line.poses, b.lp.rec) : { poses: b.line.poses, stretched: false };
    const tl = withTail(b, h.poses);
    if (tl) {
      const { line, tail, replan, durationSec } = tl;
      const lineBank = line.poses.reduce((m, p) => Math.max(m, Math.abs(p.bank)), 0);
      return {
        ok: true,
        plans: { [lead.id]: { segments: tail.lp.segments.map((x) => ({ ...x })) }, [wing.id]: wingPlan(line, tail, replan) },
        endSec: t0 + durationSec,
        handOverSec: t0 + line.steps * dt,
        stretched: h.stretched,
        leadTurnDeg: Math.round(tail.lp.turned / DEG),
        maxBankDeg: Math.max(lineBank, tail.run.maxBankDeg),
        minKias: b.line.minKias,
        maxKias: b.line.maxKias,
        reverse: { atSec: b.c.kr * dt, bankDeg: b.c.b3 },
        knobs: { share: b.c.share, delaySteps: b.c.delaySteps, b3: b.c.b3 },
        usedStage: null,
        overshoot: null,
        ...b.checks,
        laneFwdFt: Math.max(b.checks.laneFwdFt, tail.run.laneFwdFt),
        minBelowFt: Math.min(b.checks.minBelowFt, tail.run.minBelowFt),
        ...extra,
      };
    }
    return {
    ok: true,
    plans: { [lead.id]: { segments: b.lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: h.poses }] } },
    endSec: hold && h.changed ? t0 + h.poses.length * dt : t0 + b.n * dt,
    stretched: h.stretched,
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
    };
  };

  if (standard) {
    const slowWing = { ...speedSegFor(wing.kias, KINEMATIC.hotWingKias, blockFt, 'power'), withNext: true };
    const candidates = lineUps(slowWing);
    if (!candidates.length) return { ok: false, reason: 'No safe hot turning rejoin from here: #2 could not line up with Lead.' };
    // The standard start's line is flown as planned (as in V2.20): it is inside full power (TS-63 holds only the
    // off-standard capture lines that broke it, Patrick 03:46Z).
    for (const c of candidates.slice(0, 12)) {
      const b = buildLine(c, slowWing, KINEMATIC.captureSec);
      // No bank cap but the G rule (REJOIN.bankCapDeg, Patrick 06:16Z item 1), and never across Lead's six to the outside
      // (V2.59: only the decision overshoot does that).
      if (b.line.maxBankDeg > REJOIN.bankCapDeg + 0.5 || b.checks.laneFwdFt > 100 || b.checks.minBelowFt <= 0) continue;
      if (outsideCrossing(b.line.poses, b.lp.rec, s)) continue;
      const needs = speedNeeds(b.line.poses, c.kh - 3, blockFt);
      labelStages(b.line.poses, c.kh - 3, needs);
      return result(b, {}, false);
    }
    return { ok: false, reason: 'No safe hot turning rejoin from here: every way in broke the bank cap, the overshoot lane or the height rule.' };
  }

  // Off-standard: try the ways of slowing in Patrick's order (Fix it) or power only (normal reference), and for each the
  // geometry, keeping the line that uses the least; remember the best line that would need an overshoot.
  const wingKias = KINEMATIC.hotWingKias + carryKias; // at the normal reference #2 keeps his speed error (it carries)
  const good = [];
  let nearly = null; // the best line whose capture asks a little more speed-up than full power gives (flown held to it, full-power.js)
  let needsOvershoot = null;
  let lined = false;
  /** Tries one way of slowing (stage) with the given choices (knobs, or a search), the best `top` line-ups. */
  const tryStage = (stage, knobs, top, toKias = wingKias, lineUp = undefined) => {
    const slowWing = { ...speedSegFor(wing.kias, toKias, blockFt, stage), withNext: true };
    const candidates = lineUps(slowWing, knobs, lineUp);
    if (candidates.length) lined = true;
    else return 0;
    for (const c of candidates.slice(0, top)) {
      // At the normal reference #2 flies the standard capture (20 s, TS-55): he does not stretch it to soak up his error.
      for (const captureSec of mode === 'reference' ? [KINEMATIC.captureSec] : HOT.captureSecs) {
        const b = buildLine(c, slowWing, captureSec);
        if (b.line.maxBankDeg > REJOIN.bankCapDeg + 0.5 || belowWhereItCounts(b.line.poses, b.lp.rec, c.kh) <= 0) break;
        const needs = speedNeeds(b.line.poses, c.kh - 3, blockFt);
        const lane = laneBreak(b.line.poses, b.lp.rec, c.kh);
        if (needs.firstBad >= 0 || lane >= 0) {
          // Too much energy for this line: the decision point comes before the first step it can't be flown.
          // It is an overshoot only if that is close to Lead (SMM 12.27 para 65: excess overtake as #2 reaches him); further
          // out a longer capture is tried instead.
          const kBad = Math.min(...[needs.firstBad, lane].filter((x) => x >= 0));
          const P = b.line.poses[kBad];
          const L = b.lp.rec.at(kBad + 1);
          if (Math.hypot(L.xFt - P.x, L.yFt - P.y) <= HOT.overshootRangeFt && (!needsOvershoot || RANK[stage] >= RANK[needsOvershoot.stage])) needsOvershoot = { b, kBad: Math.max(c.kh + 1, kBad), stage };
          continue;
        }
        // A line that swings across behind Lead to the outside of his turn and back is never flown (V2.59; Patrick 04:53Z,
        // SMM 12.24 paras 56-58): #2 stays on his own side, and only the decision overshoot crosses (Patrick 23:29Z;
        // firstBad above, planOvershoot). Until V2.59 a line that crossed well behind Lead was accepted.
        if (outsideCrossing(b.line.poses, b.lp.rec, s)) continue;
        const entry = { b, needs, used: Math.max(RANK[stage], needs.top), score: c.score };
        if (needs.accelShort > 0) {
          // A longer capture asks less power; keep the line that asks least past it in case none is within it.
          if (!nearly || needs.accelShort < nearly.needs.accelShort) nearly = entry;
          continue;
        }
        labelStages(b.line.poses, c.kh - 3, needs);
        good.push(entry);
        break;
      }
    }
    return candidates.length;
  };
  if (mode === 'reference') {
    tryStage('power', refKnobs, 1);
    // The standard start's own choices don't line up from here: the nearest standard rejoin, still power only.
    if (!good.length && !needsOvershoot) tryStage('power', null, 8);
  } else {
    // Fix it, in Patrick's order: geometry with power (slowing to Lead's speed, or keeping a set overtake), then the speed
    // brake, then idle, then both; the first way that works, and the line using the least of them.
    // A line found that only asks a little more speed-up than the cap (HOT.nearlyKtps) also ends the search, so a press
    // still plans in a second or a few.
    const enough = (rank) => good.some((g) => g.used <= rank) || (nearly !== null && nearly.needs.accelShort < HOT.nearlyKtps);
    // A faster target only lines up where a slower one does (more energy, further ahead), so a target with no line-up ends
    // that way of slowing.
    for (const stage of STAGES) {
      if (enough(RANK[stage] - 1)) break;
      // The faster targets (a set overtake kept with power) are for power only; the boards and idle slow him to Lead's speed.
      for (const toKias of stage === 'power' ? HOT.powerTargetsKias : [KINEMATIC.hotWingKias]) {
        if (!tryStage(stage, null, 5, toKias) || enough(RANK[stage])) break;
      }
    }
    // Nothing lines up behind Lead from here (ahead and close in): the nearest line-ups, even a little ahead or close, in
    // the same order; they need the overshoot if he can't stop.
    if (!good.length && !enough(3)) {
      for (const stage of ['power', 'idleBoards']) { // the ends of the order only, so a press still plans in a few seconds
        tryStage(stage, null, 5, KINEMATIC.hotWingKias, LINE_UP_REFERENCE);
        if (good.length) break;
      }
    }
  }
  if (!good.length && nearly && (nearly.needs.accelShort < HOT.nearlyKtps || !needsOvershoot)) {
    // The speed-ups of the planned capture lines aren't held to full power yet (the standard rejoin's aren't either: TS-62,
    // future.md); the slowing is, and that is what an off-standard start tests.
    labelStages(nearly.b.line.poses, nearly.b.c.kh - 3, nearly.needs);
    good.push(nearly);
  }
  if (good.length) {
    good.sort((x, y) => x.used - y.used || x.score - y.score);
    const g = good[0];
    return result(g.b, { usedStage: STAGES[g.used % 4], overshoot: null });
  }
  if (needsOvershoot) {
    const o = planOvershoot(needsOvershoot);
    if (o) return o;
  }
  // Nothing lines up at all (a fast or ahead start at the normal reference, or ahead and close in): pointed at Lead, #2 is
  // carried ahead of Lead's 3/9 line by Lead's turn into him, which is not the overshoot of Fig 12.18 (that starts behind,
  // with closure). The tracker's rejoin flies it (as before V2.20); what #2 should do there is a question for Patrick (TS-62).
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
    // The decision point is in the latter stages (after the line-up) and close to Lead (HOT.overshootRangeFt, an estimate
    // from Fig 12.18), never further out.
    const earliest = c.kh + Math.round(1 / dt);
    for (let kD = kBad; kD > earliest; kD -= step) {
      const at = b.line.poses[kD - 1];
      const L = longRec.at(kD);
      if (!at || Math.hypot(L.xFt - at.x, L.yFt - at.y) > HOT.overshootRangeFt) break;
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
        const needs = speedNeeds(poses, kD - 1, blockFt, kS);
        if (!pb) continue;
        // The overshoot only slows him (power back, boards): never a line that has him speed up to get there.
        if (needs.firstBad >= 0 || needs.accelShort > 0) continue;
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
    const kFlown = c.kh - 3;
    for (let k = 1; k <= kFlown; k++) line.poses[k - 1] = flown[k];
    const needs = speedNeeds(line.poses, kFlown, blockFt);
    labelStages(line.poses, kFlown, needs);
    for (let k = kD; k <= kS && k <= line.poses.length; k++) line.poses[k - 1].over = true;
    const checks = laneAndBelow(lp.rec, track, n);
    const h = held(line.poses, lp.rec);
    return {
      ok: true,
      plans: { [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: h.poses }] } },
      endSec: h.changed ? t0 + h.poses.length * dt : t0 + n * dt,
      stretched: h.stretched,
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
 * The hot turning rejoin with a training error set (options.errors, errors.js resolveErrors; TS-62) as a "Change formation"
 * plan (planGoTo's shape, transitions.js), or null when it does not apply: from any roughly line abreast start, flown as
 * the error's response says (Fix it or Turn at normal reference), with the decision overshoot. With no error set it is
 * null: since V2.59 every turning rejoin flies the rejoin line (turning-rejoin.js, TS-68; Patrick 07:31Z).
 */
export function planHotRejoinChange(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const errors = options.errors ?? null;
  if (!errors) return null;
  const from = classify([lead, wing]);
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
  if (!standard && !offStandardStart(lead, wing, rel)) return null;
  const s = Math.sign(rel.left) || from.side || -1;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const mode = errors.response === 'reference' ? 'reference' : 'fix';
  const lateSec = Math.max(0, errors.timingSec ?? 0); // early can't be earlier than the call
  let knobs = null;
  if (mode === 'reference') {
    // The standard rejoin's own choices, worked out from the standard start beside Lead as he is now.
    const nominal = { ...wing, xFt: lead.xFt - Math.sin(lead.headingRad) * s * spacingFt, yFt: lead.yFt + Math.cos(lead.headingRad) * s * spacingFt, altAboveFt: lead.altAboveFt, headingRad: lead.headingRad, kias: lead.kias, tasFtps: lead.tasFtps, bankDeg: 0, rollRateDps: 0 };
    const std = /** @type {any} */ (planHotRejoin([lead, nominal], s, to, sTo, { spacingFt, blockFt }, t0));
    knobs = std.ok ? std.knobs : { share: 1, delaySteps: 0, b3: 45 };
  }
  const r = /** @type {any} */ (planHotRejoin(pair, s, to, sTo, { spacingFt, blockFt, mode, knobs, lateSec, carryKias: mode === 'reference' ? wing.kias - lead.kias : 0 }, t0));
  if (!r.ok) return null;
  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromSide = s > 0 ? ' left' : ' right';
  const how = describe('lab', to, 'into');
  const base = `Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS, and holds it until #2 is in; #2 points at Lead, rolls out, reverses as the line of sight moves and lines up with Lead (SMM 16.20 para 65b(2)${to === 'fw' ? '' : ', through the fighting wing position, para 66'}).`;
  const offWords = ` ${offStandardWords(mode, r)}`;
  const handOver = r.handOverSec
    ? ` #2 flies the line at ${rejoinClosureNow().kt} kt of closure to about 500 ft from ${to === 'fw' ? 'the fighting wing slot' : 'route'}, then the tracker closes at ${closureNow().kt} kt (${RATE_WORDS[ratesNow()]}).`
    : '';
  return {
    ok: true,
    plans: r.plans,
    note: `Line abreast${fromSide} to ${label}${sideWord}: ${how}. ${base}${handOver}${offWords}`,
    label: `${label}${sideWord}`,
    flying: `Line abreast${fromSide} to ${label}${sideWord} (${how}, off-standard start)`,
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
    handOverSec: r.handOverSec ?? null,
    rejoining: true,
    offStandard: { mode, usedStage: r.usedStage, overshoot: r.overshoot },
  };
}

/** What #2 does about an off-standard start, in words for the card (TS-62). */
export function offStandardWords(mode, r) {
  const used = r.usedStage && r.usedStage !== 'power' ? STAGE_WORDS[r.usedStage] : null;
  if (r.overshoot?.crossFwdFt !== undefined) {
    // The line's own slide to the outside (outsideCrossing): say what it uses, not the decision overshoot's idle and boards.
    const why = mode === 'reference' ? 'Turning at the normal reference, the error carries: ' : `Fix it: geometry and power${used ? `, then ${used},` : ''} can't stop #2 on his own side, so `;
    return `${why}he slides behind and below Lead to the outside of the turn, then crosses back and joins (SMM 12.27 para 65, Fig 12.18).`;
  }
  if (r.overshoot) {
    const why = mode === 'reference' ? 'Turning at the normal reference, the error carries: ' : 'Fix it: geometry, power, the boards and idle are not enough, so ';
    return `${why}at the decision point #2 overshoots: wings level, power back and boards, behind and below Lead, stable on the outside, then he crosses back and joins (SMM 12.27 para 65, Fig 12.18).`;
  }
  if (mode === 'reference') return `Turning at the normal reference: #2 flies the standard rejoin from where he is, power only${used ? `, and needs ${used} to stop the overtake` : ''}.`;
  return `Fix it: #2 corrects with geometry first (cut-off, lag line, reversal), then power${used ? `, then ${used}` : ''} (Patrick's order, SMM 12.26 para 63).`;
}

/** The Errors line on the card once an off-standard hot turning rejoin ends (TS-62): what #2 used, and whether he joined. */
export function offStandardOutcome(off, inBand, label) {
  const used = off.usedStage && off.usedStage !== 'power' ? STAGE_WORDS[off.usedStage] : null;
  const how = off.overshoot
    ? 'overshot behind and below Lead, stabilised on the outside, crossed back and joined'
    : off.mode === 'reference'
      ? `turned at the normal reference, power only${used ? `, then ${used} to stop the overtake` : ''}`
      : `fixed it with geometry and power${used ? `, then ${used}` : ''}`;
  const end = inBand ? 'ended in position' : 'ended outside the band (see the judged line)';
  return { label, response: off.mode, fixed: off.mode === 'fix', text: `${label}: #2 ${how}, and ${end}.`, tone: inBand ? 'good' : 'caution' };
}
