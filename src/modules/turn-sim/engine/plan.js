// The turn plan: who turns which way, how far, and when. Only the time-delay
// timing is here (V6 `setupTurnStartsFor`, line 1174, with the trigger 'time').
// The clock cue, auto timing and the offset box's solved delays (offsetBoxPlan)
// are here too. Ported from V6; D41 (toward and away) is fixed, D43 and D44 (auto
// timing) and the others are their own commits later.
//
// Coordinates and headings are V6's (see formation.js). V6's "right" vector is
// the aircraft's left on the map; "selected direction" is +1 for a left turn
// (counter-clockwise) and -1 for a right turn, as V6 has it (line 1179).
import { degToRad } from '../../../core/angles.js';
import { ktToFtps } from '../../../core/units.js';
import { turnRadiusFt, turnRateRadPerSec, limitG } from '../../../core/flight-math.js';
import { rightVector, forwardVector, OFFSET_BOX_OUTSIDE_FT } from './formation.js';
import { planCheckChain, flyPlanTo } from './check-plan.js';

/** The turn direction sign for the Direction box: right is -1 (clockwise), left is +1 (V6 line 1179). */
export function selectedDirSign(direction) {
  return direction === 'right' ? -1 : 1;
}

/**
 * Which side of Lead an aircraft is on, measured along V6's "right" vector from
 * the Start heading box: +1, -1 or 0 (V6 `sideOfLeadIn`, line 930).
 */
export function sideOfLead(aircraft, a, startHeadingRad) {
  const r = rightVector(startHeadingRad);
  const lead = aircraft.find((x) => x.id === 1);
  return Math.sign((a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y);
}

/**
 * Which side of aircraft `a` the target is on, along a's own heading (V6
 * `sideOfAircraftFrom`, line 941): +1 on V6's "right" vector side (the map's
 * left), -1 the other, 0 when either is missing or dead ahead.
 */
export function sideOfAircraftFrom(a, target) {
  if (!a || !target) return 0;
  const r = rightVector(a.headingRad);
  return Math.sign((target.xFt - a.xFt) * r.x + (target.yFt - a.yFt) * r.y);
}

/**
 * The aircraft whose clock cue `a` watches: its own "Clock" target if it has
 * one, else the global Clock cue aircraft, else Lead (V6 `cueTargetForAircraft`, line 921).
 */
export function cueTargetForAircraft(a, aircraft, clockCueAircraft) {
  const globalId = +clockCueAircraft || 1;
  const id = a && a.clockTarget && a.clockTarget !== 'global' ? +a.clockTarget : globalId;
  return aircraft.find((x) => x.id === id) || aircraft.find((x) => x.id === 1);
}

/**
 * The direction one aircraft turns under its own "Turn" logic (V6
 * `turnDirFromLogic`, line 1095): the selected direction, right, left, or
 * toward or away from its cue aircraft. `defaultDir` is what "auto" gives.
 * D41 (#15): "toward" turns toward the cue aircraft and "away" turns away from
 * it. V6 (line 1104) had them swapped: it read its "right" vector (the map's
 * left) as the aircraft's right, so an aircraft with the cue on its map-left
 * turned right.
 */
export function turnDirFromLogic(a, aircraft, defaultDir, { direction, clockCueAircraft }) {
  const logic = a.turnLogic || 'auto';
  if (logic === 'selected') return selectedDirSign(direction);
  if (logic === 'right') return -1;
  if (logic === 'left') return 1;
  if (logic === 'toward' || logic === 'away') {
    const target = cueTargetForAircraft(a, aircraft, clockCueAircraft);
    const side = sideOfAircraftFrom(a, target);
    if (side === 0) return defaultDir;
    const toward = side > 0 ? 1 : -1; // cue on the "right" vector side (the map's left) -> turn left (+1)
    return logic === 'toward' ? toward : -toward;
  }
  return defaultDir;
}

/**
 * The aircraft ordered by their place on the 3/9 line, outside first: a right
 * turn starts the aircraft farthest along V6's "right" vector's opposite, a left
 * turn the other end (V6 `displayedOutsideInOrder`, line 1116). The line is
 * Lead's, measured from the Start heading box.
 */
export function displayedOutsideInOrder(aircraft, turnRight, startHeadingRad) {
  const lead = aircraft.find((a) => a.id === 1) || aircraft[0];
  const r = rightVector(startHeadingRad);
  const lateral = (a) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y;
  return [...aircraft].sort((a, b) => (turnRight ? lateral(b) - lateral(a) : lateral(a) - lateral(b)));
}

/**
 * The offset box's front element, #1 and #2, far side first (V6
 * `offsetFrontElementOrder`, line 966). Uses Lead's own heading.
 */
export function offsetFrontElementOrder(aircraft, turnRight, startHeadingRad) {
  const one = aircraft.find((a) => a.id === 1);
  const two = aircraft.find((a) => a.id === 2);
  const lead = one || aircraft[0];
  const h = lead ? lead.headingRad : startHeadingRad;
  const r = rightVector(h);
  const lateral = (a) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y;
  return [one, two].filter(Boolean).sort((a, b) => (turnRight ? lateral(b) - lateral(a) : lateral(a) - lateral(b)));
}

/**
 * Where an aircraft ends up if it flies straight for `delaySec` and then turns
 * `goalRad` in direction `dir` at radius `radiusFt` (V6 `simulateDelayedTurnFinalPos`,
 * line 946). Its own heading at the plan; the position when the turn is done.
 */
export function simulateDelayedTurnFinalPos(a, dir, goalRad, speedFtps, radiusFt, delaySec) {
  const h = a.headingRad;
  const fwd = { x: Math.cos(h), y: Math.sin(h) };
  const right = { x: Math.cos(h + Math.PI / 2), y: Math.sin(h + Math.PI / 2) };
  const xStraight = a.xFt + fwd.x * speedFtps * delaySec;
  const yStraight = a.yFt + fwd.y * speedFtps * delaySec;
  const delta = dir * goalRad;
  const turnX = fwd.x * radiusFt * Math.sin(delta) + right.x * radiusFt * (1 - Math.cos(delta));
  const turnY = fwd.y * radiusFt * Math.sin(delta) + right.y * radiusFt * (1 - Math.cos(delta));
  return { xFt: xStraight + turnX, yFt: yStraight + turnY };
}

/**
 * The delay, in seconds, whose final position lands nearest `target` (V6
 * `searchDelayToTarget`, line 979): 121 delays evenly from `minDelaySec` to the
 * longest one, the first best one wins. The longest is V6's own (|centerGuess| or
 * 20 s, whichever is more, plus 1.25 turn times), or `maxDelaySec` when given.
 * Returns { delaySec, errFt }: V6 kept only the delay.
 * @param {*} a
 * @param {*} dir
 * @param {number} goalRad
 * @param {*} target
 * @param {number} speedFtps
 * @param {number} radiusFt
 * @param {number} centerGuessSec
 * @param {{ baseG?: number, minDelaySec?: number, maxDelaySec?: number | null }} opts
 */
export function searchDelayToTarget(a, dir, goalRad, target, speedFtps, radiusFt, centerGuessSec, { baseG, minDelaySec = 0, maxDelaySec = null } = {}) {
  const turnTime = goalRad / Math.max(1e-6, turnRateRadPerSec(speedFtps, limitG(baseG)));
  const longest = maxDelaySec !== null && Number.isFinite(maxDelaySec)
    ? maxDelaySec
    : Math.max(minDelaySec + 4, Math.abs(centerGuessSec || 0) + Math.max(20, turnTime * 1.25));
  const steps = 120;
  let best = { delaySec: minDelaySec, errFt: Infinity };
  for (let i = 0; i <= steps; i++) {
    const delaySec = minDelaySec + (longest - minDelaySec) * i / steps;
    const pos = simulateDelayedTurnFinalPos(a, dir, goalRad, speedFtps, radiusFt, delaySec);
    const errFt = Math.hypot(pos.xFt - target.xFt, pos.yFt - target.yFt);
    if (errFt < best.errFt) best = { delaySec, errFt };
  }
  return best;
}

/**
 * +1 or -1: which side of Lead #2 ends on, across the final heading (+1 left of it), the side "outside #2" is on. Compared at one
 * clock time, so a delay of d s takes v d off the final heading's ahead.
 */
function outsideSide(one, two, delayOneSec, delayTwoSec, dir, goalRad, speedFtps, radiusFt) {
  const hNew = one.headingRad + dir * goalRad;
  const at = (a, d) => {
    const f = simulateDelayedTurnFinalPos(a, dir, goalRad, speedFtps, radiusFt, d);
    return { x: f.xFt - Math.cos(hNew) * speedFtps * d, y: f.yFt - Math.sin(hNew) * speedFtps * d };
  };
  const p1 = at(one, delayOneSec);
  const p2 = at(two, delayTwoSec);
  return Math.sign(-(p2.x - p1.x) * Math.sin(hNew) + (p2.y - p1.y) * Math.cos(hNew)) || 1;
}

/**
 * The rear element's delays as the SMM measures them (Fig 16.30, audit yellow): #3 from the LATER of the front pair's starts, #4 from #3's
 * start, so a solved timing reads the way a pilot times it. 'rearDelay' is defined as the fixed shift after each counterpart (#3 after #1,
 * #4 after #2), so it reads that way.
 */
function rearDelaysAsMeasured(delaysSec, timing4) {
  if (timing4 === 'rearDelay') return { 3: delaysSec[3] - delaysSec[1], 4: delaysSec[4] - delaysSec[2] };
  return { 3: delaysSec[3] - Math.max(delaysSec[1], delaysSec[2]), 4: delaysSec[4] - delaysSec[3] };
}

/**
 * The offset box's rear shift for the check version: the seconds after the front element's start that put #3 behind the middle of the front
 * pair and #4 outside #2 (3,000 ft beyond, on the far side from Lead), Box aft behind, by least squares over both. Two flights of the plan give the
 * end positions at a shift of 0 and of 10 s, which are linear in the shift.
 */
function boxCheckShiftSec(front, rear, opts, flight) {
  const all = [...front, ...rear];
  const atSec = 260;
  const at = (shift) => {
    planCheckChain(rear, { ...opts, startSec: shift });
    return flyPlanTo(all, opts, atSec);
  };
  const p0 = at(0);
  const p1 = at(10);
  const hFinal = front[0].headingRad + front[0].turnDir * opts.goalRad;
  const fwd = { x: Math.cos(hFinal), y: Math.sin(hFinal) };
  const aft = Number.isFinite(+flight.boxAftFt) ? +flight.boxAftFt : 8000;
  const one = p0[1];
  const two = p0[2];
  const span = Math.hypot(two.xFt - one.xFt, two.yFt - one.yFt) || 1;
  const u = { x: (two.xFt - one.xFt) / span, y: (two.yFt - one.yFt) / span };
  const target = {
    3: { x: (one.xFt + two.xFt) / 2 - fwd.x * aft, y: (one.yFt + two.yFt) / 2 - fwd.y * aft },
    4: { x: two.xFt + u.x * OFFSET_BOX_OUTSIDE_FT - fwd.x * aft, y: two.yFt + u.y * OFFSET_BOX_OUTSIDE_FT - fwd.y * aft },
  };
  let num = 0;
  let den = 0;
  for (const id of [3, 4]) {
    if (!p0[id]) continue;
    const w = { x: (p1[id].xFt - p0[id].xFt) / 10, y: (p1[id].yFt - p0[id].yFt) / 10 };
    num += (target[id].x - p0[id].xFt) * w.x + (target[id].y - p0[id].yFt) * w.y;
    den += w.x * w.x + w.y * w.y;
  }
  return den < 1e-9 ? Math.max(0, +flight.rearDelaySec || 0) : Math.max(0, num / den);
}

/** The midpoint of two aircraft's start positions. */
function mid0(a, b) {
  return { xFt: (a.xFt + b.xFt) / 2, yFt: (a.yFt + b.yFt) / 2 };
}

/**
 * Seconds a rear aircraft turns after its front reference so it ends `aftFt` behind the reference, in the reference's final
 * heading (the offset box's 'boxSlot' timing, audit R1). At the end of a turn of `dir * goalRad`, two aircraft that fly the same turn
 * and differ only by `k` seconds of delay differ by k v (old heading - new heading) (the later one has flown k s longer on the old heading
 * and k s less on the new). So the offset after the turn is e + k w with e the start offset from the reference and w = v (old - new);
 * the least squares k for the wanted offset (aftFt straight behind on the new heading, and `leftFt` to its left) is
 * ((want - e) . w) / (w . w). At the default box (aftFt aft, #3 in the middle, #4 3,000 ft outside #2) the wanted offset is on the line
 * e + k w exactly, and k is aftFt / v for #3 and for #4 in a 90, whatever the turn angle for #3.
 */
export function boxSlotShiftSec(rear, ref, dir, goalRad, speedFtps, aftFt, leftFt = 0) {
  const h = rear.headingRad;
  const hNew = h + dir * goalRad;
  const w = { x: speedFtps * (Math.cos(h) - Math.cos(hNew)), y: speedFtps * (Math.sin(h) - Math.sin(hNew)) };
  const wantX = -aftFt * Math.cos(hNew) - leftFt * Math.sin(hNew) - (rear.xFt - ref.xFt);
  const wantY = -aftFt * Math.sin(hNew) + leftFt * Math.cos(hNew) - (rear.yFt - ref.yFt);
  const ww = w.x * w.x + w.y * w.y;
  return ww < 1e-9 ? aftFt / speedFtps : (wantX * w.x + wantY * w.y) / ww;
}

/**
 * The offset box's delayed turn: each aircraft's delay in seconds (V6
 * `computeOffsetBoxPlan`, line 994). The front element goes first, far side
 * first (0 s), then the other one after the base delay; every aircraft turns
 * the selected way. #3 searches the delay that puts it in the slot centred aft
 * of the front element's final positions (Box aft feet behind their midpoint).
 * #4 turns one base delay after #3 (LATE) or before it (EARLY), or, by ground track (Q44b), at the
 * delay that puts it nearest 3,000 ft outside #2, Box aft behind the front element.
 *
 * aircraft: the active aircraft (xFt, yFt, headingRad, id).
 * cfg: { baseDelaySec, selectedDir, goalRad, direction ('right'|'left'), speedFtps, baseG, boxAftFt,
 *   startHeadingRad, rearDelaySec, timing4 ('boxSlot'|'rearDelay'|'groundTrack'|'late'|'early') }
 * Returns { delaysSec: { id: s }, dirs: { id: +1|-1 }, fitErrFt: { 3: ft, 4: ft } }: fitErrFt is how far #3 (and #4 when
 * by ground track) ends from its target at the solved delay.
 */
export function offsetBoxPlan(aircraft, cfg) {
  const one = aircraft.find((a) => a.id === 1);
  const two = aircraft.find((a) => a.id === 2);
  const three = aircraft.find((a) => a.id === 3);
  const four = aircraft.find((a) => a.id === 4);
  const { selectedDir, goalRad, speedFtps } = cfg;
  const base = cfg.baseDelaySec;
  const radiusFt = turnRadiusFt(speedFtps, Math.max(1.01, cfg.baseG));
  const plan = { delaysSec: {}, dirs: {}, fitErrFt: {} };

  const front = offsetFrontElementOrder(aircraft, cfg.direction === 'right', cfg.startHeadingRad);
  const frontFirst = front[0] || one;
  const frontSecond = front[1] || two;
  if (frontFirst) plan.delaysSec[frontFirst.id] = 0;
  if (frontSecond) plan.delaysSec[frontSecond.id] = Math.max(0, base);
  aircraft.forEach((a) => { plan.dirs[a.id] = selectedDir; });

  const finalHeading = (one ? one.headingRad : cfg.startHeadingRad) + selectedDir * goalRad;
  const fwd = forwardVector(finalHeading);
  const aftFt = Number.isFinite(+cfg.boxAftFt) ? +cfg.boxAftFt : 8000; // V6 line 1010: only an empty box reads as 8,000 (a typed 0 is 0)

  const oneFinal = one ? simulateDelayedTurnFinalPos(one, selectedDir, goalRad, speedFtps, radiusFt, plan.delaysSec[1] || 0) : null;
  const twoFinal = two ? simulateDelayedTurnFinalPos(two, selectedDir, goalRad, speedFtps, radiusFt, plan.delaysSec[2] || 0) : null;

  if (oneFinal && twoFinal) {
    const mid = { xFt: (oneFinal.xFt + twoFinal.xFt) / 2, yFt: (oneFinal.yFt + twoFinal.yFt) / 2 };
    const slotTarget = { xFt: mid.xFt - fwd.x * aftFt, yFt: mid.yFt - fwd.y * aftFt };
    if (cfg.timing4 === 'boxSlot') {
      // The default (audit R1): each rear aircraft's delay ends it boxAftFt behind the front element in its slot, #3 between Lead
      // and #2 (behind the pair's midpoint), #4 outside #2 (behind #2), in both directions (boxSlotShiftSec).
      if (three) plan.delaysSec[3] = Math.max(0, ((plan.delaysSec[1] || 0) + (plan.delaysSec[2] || 0)) / 2 + boxSlotShiftSec(three, mid0(one, two), selectedDir, goalRad, speedFtps, aftFt));
      if (four) plan.delaysSec[4] = Math.max(0, (plan.delaysSec[2] || 0) + boxSlotShiftSec(four, two, selectedDir, goalRad, speedFtps, aftFt, OFFSET_BOX_OUTSIDE_FT * outsideSide(one, two, plan.delaysSec[1] || 0, plan.delaysSec[2] || 0, selectedDir, goalRad, speedFtps, radiusFt)));
    } else if (cfg.timing4 === 'rearDelay') {
      // SMM 16.41 para 112a and Figure 16.30 (default): the rear element flies the same delayed turn as the front element,
      // shifted by rearDelaySec: #3 starts that long after #1 and #4 after #2, so #4 turns on the standard LAB cue
      // from #3 whichever way the turn goes, and none starts before its front counterpart. V6 chained all four a base delay apart.
      const shift = Math.max(0, cfg.rearDelaySec);
      if (three) plan.delaysSec[3] = (plan.delaysSec[1] || 0) + shift;
      if (four) plan.delaysSec[4] = (plan.delaysSec[2] || 0) + shift;
    } else if (three) {
      const solved = searchDelayToTarget(three, selectedDir, goalRad, slotTarget, speedFtps, radiusFt, base * 1.5, { baseG: cfg.baseG });
      plan.delaysSec[3] = solved.delaySec;
      plan.fitErrFt[3] = solved.errFt;
    }
    if (four && cfg.timing4 !== 'rearDelay' && cfg.timing4 !== 'boxSlot') {
      // V6 also worked out inner and outer targets for #4 here (lines 1035 to 1060) and never used them:
      // its selector alone (LATE or EARLY) set #4's delay. Q44b's ground track finishes what they started.
      const frontSecondDelay = Math.max(plan.delaysSec[1] || 0, plan.delaysSec[2] || 0);
      const threeDelay = plan.delaysSec[3] !== undefined ? plan.delaysSec[3] : frontSecondDelay + base;
      if (cfg.timing4 === 'groundTrack') {
        // Q44b: the delay that ends #4 nearest 3,000 ft outside #2 (on #2's side of the slot line), Box aft behind
        // the front element. The best delay only slides #4 along its old heading, so the fit is as close as that allows.
        const right = rightVector(finalHeading);
        const frontSepFt = Math.hypot(oneFinal.xFt - twoFinal.xFt, oneFinal.yFt - twoFinal.yFt);
        const twoSide = Math.sign((twoFinal.xFt - mid.xFt) * right.x + (twoFinal.yFt - mid.yFt) * right.y) || 1;
        const outsideTwo = { xFt: slotTarget.xFt + right.x * twoSide * (frontSepFt / 2 + OFFSET_BOX_OUTSIDE_FT), yFt: slotTarget.yFt + right.y * twoSide * (frontSepFt / 2 + OFFSET_BOX_OUTSIDE_FT) };
        const solved = searchDelayToTarget(four, selectedDir, goalRad, outsideTwo, speedFtps, radiusFt, threeDelay + Math.max(0, base), { baseG: cfg.baseG });
        plan.delaysSec[4] = solved.delaySec;
        plan.fitErrFt[4] = solved.errFt;
      } else {
        plan.delaysSec[4] = cfg.timing4 === 'early' ? Math.max(0, threeDelay - Math.max(0, base)) : Math.max(0, threeDelay + Math.max(0, base));
      }
    }
  }
  // V6's fallbacks if a target solve was not possible (line 1085).
  if (plan.delaysSec[1] === undefined) plan.delaysSec[1] = 0;
  if (plan.delaysSec[2] === undefined) plan.delaysSec[2] = base;
  if (plan.delaysSec[3] === undefined) plan.delaysSec[3] = base * 1.5;
  if (plan.delaysSec[4] === undefined) plan.delaysSec[4] = base * 2.0;
  return plan;
}

/** Who each aircraft turns with in the shackle and the cross turn: #1 with #2. Two-ship turns only (Patrick 09:28Z; settings.js turnProblem). */
const PARTNER_ID = { 1: 2, 2: 1 };

/** The aircraft `a` flies its pair with, or null if it has none in the list. */
export function pairPartner(aircraft, a) {
  return aircraft.find((x) => x.id === PARTNER_ID[a.id]) || null;
}

/** The turn direction that takes `a` toward `partner` (+1 left, -1 right); `fallback` when it is dead ahead or astern. */
export function towardDir(a, partner, fallback) {
  const side = sideOfAircraftFrom(a, partner);
  return side === 0 ? fallback : side > 0 ? 1 : -1;
}

/** Feet between `a` and `partner` across a's heading. */
export function lateralGapFt(a, partner) {
  const r = rightVector(a.headingRad);
  return Math.abs((partner.xFt - a.xFt) * r.x + (partner.yFt - a.yFt) * r.y);
}

/**
 * The shackle's hold between its two legs, in seconds (SMM 16.19 para 62: lead times the reversal to arrive in LAB).
 * Each aircraft turns `legRad` toward the other, holds that heading, and turns back. Across the original heading each
 * moves 2 R (1 - cos leg) in the two turns and v sin(leg) hold on the straight, and together they must close twice the
 * gap: hold = (gap - 2 R (1 - cos leg)) / (v sin leg). Never below 0.
 */
export function shackleHoldSec(gapFt, legRad, speedFtps, radiusFt) {
  return Math.max(0, (gapFt - 2 * radiusFt * (1 - Math.cos(legRad))) / (speedFtps * Math.sin(legRad)));
}

/**
 * The cross turn's second-stage G (SMM Fig 16.21 note: roll out LAB, 4,000 to 6,000 ft apart), the same for both aircraft so they
 * roll out abreast. Across the original heading an aircraft turning toward the other moves R1 (1 - cos first) in the first stage
 * and R2 (cos first - cos goal) in the second; the two swap sides, so the end spacing is 2 (that move) - gapFt. Solved for R2 with
 * spacing = spacingFt, then turned back into G (radius = v^2 / (32.174 sqrt(g^2 - 1))). For a 180 with a 90 first stage
 * R2 = gapFt - R1 when gapFt = spacingFt: at 220 kt, 4,000 ft gives about 3 G (the SMM's 60/2 then 70/3), 6,000 ft about 1.6 G.
 * The G is clamped to [1.1, maxG]; when the clamp bites the clamped value is kept and `spacingFt` is what it reaches.
 * Returns { solvedG, clamped, spacingFt }.
 */
export function solveCrossSecondG(gapFt, speedFtps, firstRad, goalRad, { crossTurnFirstG, spacingFt, crossTurnMaxG = 7 }) {
  const r1 = turnRadiusFt(speedFtps, Math.max(1.01, crossTurnFirstG));
  const k = turnRadiusFt(speedFtps, Math.SQRT2); // v^2 / G0
  const stage1 = r1 * (1 - Math.cos(firstRad));
  const swing = Math.cos(firstRad) - Math.cos(goalRad);
  const needR = ((gapFt + Math.abs(spacingFt)) / 2 - stage1) / swing;
  const rawG = needR > 0 ? Math.sqrt(1 + (k / needR) ** 2) : crossTurnMaxG;
  const solvedG = Math.min(crossTurnMaxG, Math.max(1.1, rawG));
  const achieved = 2 * (stage1 + turnRadiusFt(speedFtps, solvedG) * swing) - gapFt;
  return { solvedG, clamped: needR <= 0 || solvedG !== rawG, spacingFt: achieved };
}

/**
 * The order the aircraft start their turns in, first to last (V6
 * `tacticalOrderForDelayIn`, line 1132): outside aircraft first; in the offset
 * box the front element first (far side first), then #3, then #4.
 */
export function turningOrder(aircraft, { formation, direction, startHeadingRad }) {
  const turnRight = direction === 'right';
  if (formation === 'offsetBox') {
    const front = offsetFrontElementOrder(aircraft, turnRight, startHeadingRad);
    return [...front.map((a) => a.id), 3, 4].map((id) => aircraft.find((a) => a.id === id)).filter(Boolean);
  }
  return displayedOutsideInOrder(aircraft, turnRight, startHeadingRad);
}

/**
 * The auto timing step between aircraft, in seconds: spacing / speed x cot(half
 * the turn angle) (D44), the delay that rolls out line abreast. At V6's defaults
 * (6,000 ft, 220 KTAS, 90°) that is 16.16 s, where V6's spacing x angle / speed
 * (line 1391) gave 25.4 s. Turn degrees are limited to 10° to 180° so it stays finite.
 */
export function autoDelayStepSec(spacingFt, speedFtps, turnRad) {
  return (Math.abs(spacingFt) / Math.max(1, speedFtps)) / Math.tan(Math.abs(turnRad) / 2);
}

/**
 * Auto timing: the step and each aircraft's start time (V6 `computeAutoDelay`,
 * line 1369, with D44's step). Aircraft start at index x step in the turning
 * order (D43: the outside aircraft first, none waiting for Lead). Returns
 * { stepSec, startsSec: { id: seconds } }. V6 also wrote the step into the Base
 * delay box; the port never does, the step is shown instead (#16).
 *
 * flight: { formation, direction, startHeadingRad, speedKt, turnDeg, spacingFt }
 */
export function autoTimingStarts(aircraft, flight) {
  const order = turningOrder(aircraft, flight);
  const v = ktToFtps(flight.speedKt);
  const theta = degToRad(+flight.turnDeg || 90);
  const spacing = +flight.spacingFt || 6000;
  const stepSec = autoDelayStepSec(spacing, v, theta);
  const startsSec = {};
  order.forEach((a, i) => { startsSec[a.id] = i * stepSec; });
  return { stepSec, startsSec };
}

/**
 * Plans the turn for every aircraft (V6 `setupTurnStartsFor`, line 1174, with
 * the time-delay trigger): sets each aircraft's start time, direction and goal,
 * and clears its turn progress. `aircraft` is the active aircraft, changed in
 * place, each with xFt, yFt, headingRad, delayErrSec, turnLogic and clockTarget.
 *
 * flight: { formation, maneuver, direction, turnDeg, baseDelaySec, startHeadingRad, clockCueAircraft,
 *   timing ('time', 'clock' or 'auto'), clockCueSequence ('outsideIn' or 'manual'), speedKt, spacingFt }
 * Returns { autoStepSec, rearDelaysSec }: the auto step when the timing is auto and the turn is a delayed one, else null;
 * and, in the offset box's delayed turns (and the hook), the delays { 3: s, 4: s } of #3 and #4 as the SMM measures them: #3 after the
 * later front start, #4 after #3's start (the hook: both after the front element, which turns together; 'rearDelay': #3 after #1, #4 after #2), else null.
 * `formation` and `startHeadingRad` are the ones now in force: V6 changes both
 * when a new leg starts (see run.js).
 *
 * flight also has delayed45Check ('auto', 'none' or 'check') and checkTurnDeg for the Delayed 45 (check-plan.js);
 * for the offset box's delayed turns: baseG, boxAftFt, offsetBox4Timing; rearDelaySec (the hook); crossTurnFirstG and crossTurnSwitchDeg (the cross turn).
 * Only the delayed turns are delayed; every other turn starts at once.
 */
export function planTurn(aircraft, flight, { useErrors = true } = {}) {
  const man = flight.maneuver;
  const selectedDir = selectedDirSign(flight.direction);
  const goal = degToRad(flight.turnDeg);
  const form = flight.formation;
  const delayed = man === 'delayed90away' || man === 'delayed45away';
  const auto = flight.timing === 'auto' && delayed ? autoTimingStarts(aircraft, flight) : null;
  // In the offset box V6's Base delay box holds the auto step, rounded to 2 places (line 1397), and its plan reads it.
  // The Base delay is the delay for a 90 (SMM 16.19 paras 52 to 54). A Delayed 45 waits longer for the same spacing: the
  // aircraft that turns second starts once the first has flown through its tail (paras 56 and 57, Figure 16.16), which for a
  // turn of theta takes cot(theta / 2) times the 90's delay (D44's step). V6 used the 90's delay, and the wingman rolled out in trail.
  const base = auto ? Number(auto.stepSec.toFixed(2)) : man === 'delayed45away' ? flight.baseDelaySec * (1 / Math.tan(goal / 2)) : flight.baseDelaySec;
  const clockMode = flight.timing === 'clock' && delayed;
  const order = turningOrder(aircraft, flight);
  const cascade = clockMode ? order : []; // V6 clockCascadeOrder (line 1152) is the same order as the delay order
  // Under the clock cue the front aircraft start on their cues, but the box slot delays of #3 and #4 relative to their front counterparts
  // (the plan's, as if timed) are what the rear fallback flies after the counterpart has actually started (step.js mayTurn).
  const slotForClock = clockMode && form === 'offsetBox' && flight.offsetBox4Timing === 'boxSlot';
  const offsetPlan = form === 'offsetBox' && delayed && (!clockMode || slotForClock) ? offsetBoxPlan(aircraft, {
    baseDelaySec: base,
    selectedDir,
    goalRad: goal,
    direction: flight.direction,
    speedFtps: ktToFtps(flight.speedKt),
    baseG: flight.baseG,
    boxAftFt: flight.boxAftFt,
    startHeadingRad: flight.startHeadingRad,
    timing4: flight.offsetBox4Timing,
    rearDelaySec: flight.rearDelaySec,
  }) : null;
  const delayIndex = {};
  order.forEach((a, i) => { delayIndex[a.id] = i; });
  const logicFlight = { direction: flight.direction, clockCueAircraft: flight.clockCueAircraft };

  let crossSolve = null;
  let checkRear = null;
  // The hook in the box with the 'boxSlot' timing: the rear element turns about boxAftFt / speed after the front (they turn together)
  // so the box stays in trail, instead of the fixed rearDelaySec (which left it 2,283 ft aft and #2 and #4 465 ft apart).
  let hookRearDelaysSec = null;
  if (man === 'hook90' && form === 'offsetBox' && flight.offsetBox4Timing === 'boxSlot') {
    const front1 = aircraft.find((x) => x.id === 1);
    const front2 = aircraft.find((x) => x.id === 2);
    const v = ktToFtps(flight.speedKt);
    const aft = Number.isFinite(+flight.boxAftFt) ? +flight.boxAftFt : 8000;
    const r3 = aircraft.find((x) => x.id === 3);
    const r4 = aircraft.find((x) => x.id === 4);
    hookRearDelaysSec = {
      3: r3 && front1 && front2 ? Math.max(0, boxSlotShiftSec(r3, mid0(front1, front2), selectedDir, goal, v, aft)) : flight.rearDelaySec,
      4: r4 && front1 && front2 ? Math.max(0, boxSlotShiftSec(r4, front2, selectedDir, goal, v, aft, OFFSET_BOX_OUTSIDE_FT * outsideSide(front1, front2, 0, 0, selectedDir, goal, v, turnRadiusFt(v, Math.max(1.01, flight.baseG))))) : flight.rearDelaySec,
    };
  }
  for (const a of aircraft) {
    let d = 0;
    let dir = selectedDir;
    let g = goal;
    let legs;
    let followId = null;
    let followIds = null;
    let followDelay = Math.max(0, +flight.rearDelaySec || 0);

    if (clockMode) {
      // The clock cue (V6 line 1197): with Outside-in, each aircraft but the first waits for the aircraft just outside it.
      dir = selectedDir;
      let cueTarget;
      if (flight.clockCueSequence === 'manual') {
        // Q45, "Manual targets": every aircraft watches the aircraft chosen for it (its own Clock target, else the
        // Clock cue aircraft), and turns the way its own turn logic says. An aircraft that watches itself starts at once.
        const chosen = cueTargetForAircraft(a, aircraft, flight.clockCueAircraft);
        cueTarget = chosen && chosen.id !== a.id ? chosen : null;
        if (a.id !== 1) dir = turnDirFromLogic(a, aircraft, dir, logicFlight);
      } else {
        const idx = cascade.findIndex((x) => x.id === a.id);
        cueTarget = idx > 0 ? cascade[idx - 1] : null;
      }
      a.autoClockTargetId = cueTarget ? cueTarget.id : null;
      a.cueArmed = !!cueTarget;
      d = 0;
      // In the offset box #3 and #4 cannot see the cue aircraft (cues.js cantSee): they fly the rear delay instead, rearDelaySec
      // after their front counterpart (#3 after #1, #4 after #2) has started (step.js mayTurn).
      followId = form === 'offsetBox' && (a.id === 3 || a.id === 4) ? a.id - 2 : null;
      // The box slot fallback: #3 turns its shift after the MIDDLE of the front pair's actual starts, #4 its shift after #2's, so the slot
      // holds whatever the cues gave the front pair (the shift is the plan's delay less the plan's reference delay).
      if (followId && slotForClock && offsetPlan) {
        followIds = a.id === 3 ? [1, 2] : [2];
        const ref = followIds.reduce((sum, id) => sum + offsetPlan.delaysSec[id], 0) / followIds.length;
        followDelay = offsetPlan.delaysSec[a.id] - ref;
      }
    } else {
      if (delayed) {
        if (form === 'offsetBox') d = offsetPlan && offsetPlan.delaysSec[a.id] !== undefined ? offsetPlan.delaysSec[a.id] : delayIndex[a.id] * base;
        else d = auto ? +auto.startsSec[a.id] || 0 : delayIndex[a.id] * base;
      }

      // The check turn (SMM para 58) is the in-place turn through 30 degrees or less: Turn degrees does the rest.
      if (man === 'hook90' || man === 'inplace90' || man === 'check30') { d = 0; dir = selectedDir; }
      // SMM 16.41 para 112a: in the offset box the rear element turns a delay after the front element (V6: all together).
      if (man === 'hook90' && form === 'offsetBox' && (a.id === 3 || a.id === 4)) d = hookRearDelaysSec ? hookRearDelaysSec[a.id] : flight.rearDelaySec;

      if (man === 'shackle45') {
        // The shackle (SMM 16.19 paras 61 and 62), a two-ship turn.
        // Both turn into each other together, cross, and reverse back to the original heading, timed to arrive in
        // LAB on swapped sides. V6 (line 1219) turned each wingman by its side on V6's "right" vector, which is the
        // map's left, so every wingman turned away from Lead. The legs are stepped in step.js.
        d = 0;
        const partner = pairPartner(aircraft, a);
        dir = towardDir(a, partner, selectedDir);
        g = goal;
        const hold = partner ? shackleHoldSec(lateralGapFt(a, partner), goal, ktToFtps(flight.speedKt), turnRadiusFt(ktToFtps(flight.speedKt), Math.max(1.01, flight.baseG))) : 0;
        legs = [{ dir, goalRad: goal }, { dir: -dir, goalRad: goal, holdSec: hold }];
      }

      if (man === 'cross180') {
        // The cross turn (SMM 16.19 para 64, Figure 16.21): a two-ship turn, both turn toward each other at once, 2 G for the first
        // 90 degrees (crossTurnFirstG, crossTurnSwitchDeg), then the G setting to the 180. Lead always turns toward
        // #2, whichever way the Direction box points (V6 line 1223 sent Lead the Direction way, so with #2 on the far side both
        // turned the same way and never crossed): the direction Lead flies is in state.leadTurnDirection.
        d = 0;
        const partner = pairPartner(aircraft, a);
        dir = towardDir(a, partner, selectedDir);
        g = goal;
        const first = Math.min(degToRad(flight.crossTurnSwitchDeg), goal);
        legs = [{ dir, goalRad: first, gSetting: flight.crossTurnFirstG }];
        if (goal - first > 1e-9) legs.push({ dir, goalRad: goal - first });
        // SMM Fig 16.21 note: roll out LAB, 4,000 to 6,000 ft apart. Both fly the first stage, then the same solved second-stage G,
        // so the lateral spacing at roll-out is spacingFt and they end abreast (flight.crossTurnSolveSpacing; false is V6's fixed G).
        if (flight.crossTurnSolveSpacing && partner && legs.length === 2) {
          crossSolve = solveCrossSecondG(lateralGapFt(a, partner), ktToFtps(flight.speedKt), first, goal, flight);
          legs[1].gSetting = crossSolve.solvedG;
        }
      }

      if (man !== 'shackle45' && man !== 'cross180') {
        if (a.id === 1) dir = selectedDir;
        else dir = turnDirFromLogic(a, aircraft, dir, logicFlight);
      }

      // In the offset box's delayed turns every aircraft turns the selected way (V6 line 1241).
      if (form === 'offsetBox' && delayed) dir = offsetPlan && offsetPlan.dirs[a.id] !== undefined ? offsetPlan.dirs[a.id] : selectedDir;

      a.autoClockTargetId = null;
      a.cueArmed = flight.timing !== 'time' && delayed && a.id !== 1;
    }
    a.turnStartSec = clockMode ? 0 : d + (useErrors ? a.delayErrSec : 0); // V6 line 1253: a clock cue has no delay
    a.prevClockCueRelDeg = null;
    a.clockCueTriggered = false;
    a.turnDir = dir;
    a.turnGoalRad = g;
    a.originalHeadingRad = a.headingRad;
    // A turn in several legs (the shackle): each leg its own way and angle, with a hold before it (step.js).
    a.followId = followId;
    a.followIds = followIds;
    a.followDelaySec = followIds ? followDelay : Math.max(0, followDelay);
    a.startedAtSec = undefined;
    a.legs = legs;
    a.legIndex = 0;
    a.legAccumRad = 0;
    a.legReadySec = 0;
    a.finalHeadingRad = man === 'shackle45' ? a.headingRad : undefined; // the shackle rolls out exactly on its start heading
    a.active = false;
    a.done = false;
    a.turnAccumRad = 0;
  }
  // The Delayed 45 with the check turn (check-plan.js; Figures 16.17, 16.34 and 16.31). 'auto' is the check in the four-ship formations and the
  // box and the plain turn in the two-ship. Under the clock cue the plain turn is flown (its cue is the plan).
  const withCheck = man === 'delayed45away' && flight.timing !== 'clock' && (flight.delayed45Check === 'check' || (flight.delayed45Check === 'auto' && form !== 'twoShip'));
  if (withCheck) {
    const opts = { goalRad: goal, checkRad: degToRad(+flight.checkTurnDeg || 0), speedFtps: ktToFtps(flight.speedKt), baseG: flight.baseG, cueHours: flight.direction === 'right' ? 5 : 7, direction: flight.direction, useErrors };
    if (form === 'offsetBox') {
      // Figure 16.31: the front element flies the chain; the rear element follows the same flow rearDelaySec (10 to 15 s) later. In each pair the
      // aircraft on the first turner's side turns plain: #3 with Lead, #4 with #2.
      const [f0, f1] = order;
      const r0 = aircraft.find((x) => x.id === (f0.id === 1 ? 3 : 4));
      const r1 = aircraft.find((x) => x.id === (f0.id === 1 ? 4 : 3));
      const front = [f0, f1].filter(Boolean);
      const rear = [r0, r1].filter(Boolean);
      planCheckChain(front, { ...opts, startSec: 0 });
      // The rear element follows the same flow later. How much later puts #3 behind the front pair's middle and #4 outside #2, Box aft
      // behind (Figure 16.31 says 10 to 15 s, which leaves the box collapsed after a 45; boxSlot's idea, solved for the check). The ends
      // are linear in the shift, so two flights find it.
      const rearShift = boxCheckShiftSec(front, rear, opts, flight);
      planCheckChain(rear, { ...opts, startSec: rearShift });
      checkRear = { 3: rearShift, 4: rearShift };
    } else {
      planCheckChain(order, { ...opts, startSec: 0 });
    }
  }
  return {
    crossSolve,
    autoStepSec: auto ? auto.stepSec : null,
    // The offset box's solved delays for #3 and #4 in seconds, before delay errors, else null (SMM item 5).
    rearDelaysSec: checkRear || (offsetPlan ? rearDelaysAsMeasured(offsetPlan.delaysSec, flight.offsetBox4Timing) : hookRearDelaysSec || (man === 'hook90' && form === 'offsetBox' ? { 3: flight.rearDelaySec, 4: flight.rearDelaySec } : null)),
  };
}
