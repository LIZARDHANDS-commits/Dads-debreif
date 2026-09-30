// The Delayed 45 with the check turn (SMM 16.19 Figure 16.17 for two aircraft, Figure 16.34 for spread 4, Figure 16.31 for the box).
//
// A chain of aircraft turns 45 degrees in order. The first turns its standard 45 (70 degrees of bank, 3 G) at once. Each of the others
// flies a CHECK turn of 10 to 15 degrees toward the first as soon as the first has established its 45, and then turns its 45 (the check
// and the 45 together: 45 + check degrees the other way) once the aircraft before it in the chain has gone through its tail, at the
// figure's clock position for it: 5 o'clock in a right turn, 7 in a left (not the plain Delayed 45's 4:30 and 7:30). The check turn moves it toward
// that track, so the wait is a few seconds where the plain Delayed 45 (the second aircraft waits cot(22.5) x the 90's delay, 39 s a step)
// makes a four-ship string 46,000 ft long. The price, which the figure also notes: the geometry needs extra speed to hold the sweep, so
// the wingmen roll out a little aft of abreast and fix it on the roll-out.
//
// The moment of each 45 is worked out here by flying a copy of the aircraft and its predecessor with the engine's own step (moveAircraft)
// until the predecessor reaches the clock position, and is stored as the hold before the second leg (step.js stepLegs).
import { relativeBearingDeg, clockToRelativeDeg, wrapDeg180 } from '../../../core/angles.js';
import { turnRateRadPerSec } from '../../../core/flight-math.js';
import { moveAircraft, STEP_SEC } from './step.js';

/** A hold that never ends, while the cue is searched for. */
const NEVER_SEC = 1e6;
/** The longest the search flies. */
const SEARCH_SEC = 400;

/** A copy of an aircraft for flying in the search: no G error, no following, its start without the delay error. */
function simCopy(a) {
  return { ...a, gError: 0, followId: null, followIds: null, turnStartSec: a.planStartSec };
}

/**
 * Plans one chain. `chain` is the aircraft in turning order, changed in place: the first gets a plain turn at `startSec`; each of
 * the others gets the check leg and the 45 leg (holdSec solved). `opts`: { startSec, goalRad, checkRad, speedFtps, baseG, cueHours,
 * direction, useErrors }. Returns nothing; the aircraft carry legs, turnStartSec and finalHeadingRad.
 */
export function planCheckChain(chain, opts) {
  const { startSec, goalRad, checkRad, speedFtps, baseG, cueHours, direction, useErrors } = opts;
  const omega = turnRateRadPerSec(speedFtps, Math.max(1.01, baseG));
  const establishedSec = startSec + goalRad / omega; // the first aircraft has turned its 45
  const targetDeg = clockToRelativeDeg(cueHours);
  const reset = (a, legs, startAt) => {
    a.planStartSec = startAt;
    a.turnStartSec = startAt + (useErrors ? a.delayErrSec : 0);
    a.legs = legs;
    a.legIndex = 0;
    a.legAccumRad = 0;
    a.legReadySec = 0;
    a.finalHeadingRad = legs ? a.headingRad + a.turnDir * goalRad : undefined;
    a.turnGoalRad = goalRad;
    a.startedAtSec = undefined;
  };
  chain.forEach((a, k) => {
    if (k === 0) {
      reset(a, undefined, startSec);
      return;
    }
    const dir = a.turnDir;
    const legs = [{ dir: -dir, goalRad: checkRad }, { dir, goalRad: goalRad + checkRad, holdSec: NEVER_SEC }];
    reset(a, legs, establishedSec);
    // Fly the predecessor and this aircraft until the predecessor comes to the clock position after the check.
    const before = simCopy(chain[k - 1]);
    const me = simCopy(a);
    const list = [before, me];
    let checkEndedAt = null;
    let previous = null;
    let crossedAt = null;
    for (let tSec = 0; tSec < SEARCH_SEC; tSec += STEP_SEC) {
      moveAircraft(list, { rearCheck: null, tSec, timing: 'time', direction, maneuver: 'delayed45away', speedFtps, baseG, turnDegDefault: goalRad * 180 / Math.PI, correction: 'none', correctionStrength: 0, spacingFt: 0 }, STEP_SEC);
      if (me.legIndex !== 1) continue;
      if (checkEndedAt === null) checkEndedAt = me.legReadySec - NEVER_SEC; // when its second leg would start with no hold
      const cur = wrapDeg180(relativeBearingDeg({ x: me.xFt, y: me.yFt, hdg: me.headingRad }, { x: before.xFt, y: before.yFt, hdg: before.headingRad }) - targetDeg);
      const crossed = Math.abs(cur) <= 0.25 || (previous !== null && Math.abs(cur - previous) <= 180 && ((previous < 0 && cur > 0) || (previous > 0 && cur < 0)));
      previous = cur;
      if (crossed) {
        crossedAt = tSec + STEP_SEC;
        break;
      }
    }
    legs[1].holdSec = checkEndedAt !== null && crossedAt !== null ? Math.max(0, crossedAt - checkEndedAt) : 0;
  });
}

/**
 * Where each aircraft of `list` is at time `atSec` (the plan flown with the engine's own step, no G errors): { id: { xFt, yFt } }. Aircraft that
 * have all finished their turns fly on straight, so the positions at one time are comparable whatever each aircraft's own timing.
 */
export function flyPlanTo(list, opts, atSec) {
  const copies = list.map((a) => ({ ...a, gError: 0, followId: null, followIds: null, turnStartSec: a.planStartSec ?? a.turnStartSec, active: false, done: false, legIndex: 0, legAccumRad: 0, legReadySec: 0, turnAccumRad: 0, headingRad: a.originalHeadingRad ?? a.headingRad }));
  for (let tSec = 0; tSec < atSec; tSec += STEP_SEC) {
    moveAircraft(copies, { rearCheck: null, tSec, timing: 'time', direction: opts.direction, maneuver: 'delayed45away', speedFtps: opts.speedFtps, baseG: opts.baseG, turnDegDefault: opts.goalRad * 180 / Math.PI, correction: 'none', correctionStrength: 0, spacingFt: 0 }, STEP_SEC);
  }
  return Object.fromEntries(copies.map((a) => [a.id, { xFt: a.xFt, yFt: a.yFt }]));
}
