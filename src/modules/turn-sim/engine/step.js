// One fixed step of the flying (pure: aircraft and numbers in, aircraft moved).
// Ported unchanged from V6 `moveAircraftList` (line 1579) and `stepSim` (line
// 1687), without the G correction (Correction model "G adjustment", task 7) and
// without the rear element check (task 11): both are pinned later, each on its
// own. The golden test tests/golden/turn-sim-run.test.js runs V6's own code next
// to this.
//
// Coordinates and headings are V6's: feet, x east, y north, heading in radians
// (0 = east, counter-clockwise). See formation.js.
import { limitG, turnRateRadPerSec } from '../../../core/flight-math.js';
import { degToRad } from '../../../core/angles.js';

/** The step, in seconds: V6's `dt` (line 784). It never depends on the frame rate (#17). */
export const STEP_SEC = 0.05;

/** V6's tolerance for "the turn is done" (line 1596), in radians. */
const GOAL_TOLERANCE_RAD = 0.0001;

/**
 * The G an aircraft flies: the G setting and its own G error, each limited to at
 * least 1.01 (V6 `baseG` line 786 and the first line of `moveAircraftList`).
 */
// V6 adds gError only with useErrorsAndCorrection (line 1580); the ghost (line 1461) flies without it, so it will need a flag when ported.
export function flownG(baseG, gError) {
  return limitG(limitG(baseG) + gError);
}

/**
 * Whether an aircraft may turn now, for the time-delay trigger: once it has
 * started it stays turning, and before that it waits for its start time
 * (V6 `cueSatisfied`, line 1511, `trigger==='time'` branch). The clock and auto
 * cues come in tasks 8 and 9.
 */
function mayTurn(a, tSec) {
  if (a.active) return true;
  return tSec >= a.turnStartSec;
}

/**
 * Moves every aircraft one step (V6 `moveAircraftList`, line 1579). Per aircraft:
 * turn toward its goal at the rate its speed and G give, if its start time has
 * come; the shackle's first leg hands over to the reverse leg; then fly straight
 * along the heading for the step, using the heading at the END of the turn
 * (V6's Euler step, pinned).
 *
 * aircraft: the active aircraft, changed in place. Each has xFt, yFt, headingRad,
 *   gError, turnStartSec, turnDir (+1 counter-clockwise, -1 clockwise), turnGoalRad, turnAccumRad,
 *   active, done, shackleReturn, turnPhase, originalHeadingRad.
 * flight: { tSec, speedFtps, baseG, turnDegDefault, correction, correctionStrength }
 *   tSec is the time at the start of the step. turnDegDefault is V6's Turn degrees
 *   box, used when an aircraft has no goal of its own.
 *
 * Lag and lead bend the direction of travel, not the heading, by 4° × strength
 * (V6 lines 1607 and 1608); the G correction is not here yet.
 */
export function moveAircraft(aircraft, flight, stepSec = STEP_SEC) {
  const v = flight.speedFtps;
  const useCorrection = flight.correction === 'lag' || flight.correction === 'lead';
  for (const a of aircraft) {
    const g = flownG(flight.baseG, a.gError);
    a.gFlown = g;
    const omega = turnRateRadPerSec(v, g);
    if (mayTurn(a, flight.tSec) && !a.done) {
      // V6's shackle "hold" (line 1585) never held: shackleHoldUntil was never set. Task 15 gives it a real one.
      a.active = true;
      const goal = a.turnGoalRad || degToRad(flight.turnDegDefault);
      const dth = Math.min(omega * stepSec, goal - a.turnAccumRad);
      a.headingRad += (a.turnDir || 1) * dth;
      a.turnAccumRad += dth;
      if (a.turnAccumRad >= goal - GOAL_TOLERANCE_RAD) {
        // The shackle has two legs: 45° in, then the same 45° back to the original heading.
        if (a.shackleReturn && a.turnPhase === 0) {
          a.turnPhase = 1;
          a.turnAccumRad = 0;
          a.turnDir = -(a.turnDir || 1);
          a.done = false;
          a.active = false;
        } else {
          if (a.shackleReturn && typeof a.originalHeadingRad === 'number') a.headingRad = a.originalHeadingRad;
          a.done = true;
          a.active = false;
        }
      }
    }
    let heading = a.headingRad;
    if (useCorrection && a.id !== 1) {
      const bend = (a.turnDir || 1) * degToRad(4) * flight.correctionStrength;
      heading += flight.correction === 'lag' ? bend : -bend;
    }
    a.xFt += Math.cos(heading) * v * stepSec;
    a.yFt += Math.sin(heading) * v * stepSec;
  }
}
