// One fixed step of the flying (pure: aircraft and numbers in, aircraft moved).
// Ported unchanged from V6 `moveAircraftList` (line 1579) and `stepSim` (line
// 1687), without the G correction (Correction model "G adjustment", task 7) and
// without the rear element check (task 11): both are pinned later, each on its
// own. The golden test tests/golden/turn-sim-run.test.js runs V6's own code next
// to this.
//
// Coordinates and headings are V6's: feet, x east, y north, heading in radians
// (0 = east, counter-clockwise). See formation.js.
import { turnSimG, turnRateRadPerSec } from '../../../core/flight-math.js';
import { degToRad } from '../../../core/angles.js';
import { clockCueCrossed, V6_CLOCK_TOLERANCE_DEG } from './cues.js';
import { cueTargetForAircraft } from './plan.js';

/** The step, in seconds: V6's `dt` (line 784). It never depends on the frame rate (#17). */
export const STEP_SEC = 0.05;

/** V6's tolerance for "the turn is done" (line 1596), in radians. */
const GOAL_TOLERANCE_RAD = 0.0001;

/**
 * The G an aircraft flies with no correction: the G setting and its own G error, each limited to at
 * least 1.01 (V6 `baseG` line 786 and the first line of `moveAircraftList`).
 */
// V6 gates gError on useErrorsAndCorrection (line 1582).
export function flownG(baseG, gError) {
  return turnSimG({ gSetting: baseG, gErr: gError, useErrorsAndCorrection: true, correction: 'none', aircraftId: 1, distToLeadFt: 0, spacingFt: 0, corrStrength: 0 });
}

/**
 * Whether an aircraft may turn now (V6 `cueSatisfied`, line 1511). Once it has
 * started it stays turning. With the clock cue an aircraft that has an aircraft to
 * watch waits until that aircraft reaches the clock position (V6 line 1519); every
 * other aircraft waits for its start time, which is the time delay or, with auto
 * timing, its own place in the sequence. V6 held every auto-timed aircraft but
 * Lead until Lead had started (line 1525); D43 took that wait away.
 */
function mayTurn(a, aircraft, tSec, flight) {
  if (a.active) return true;
  if (flight.timing !== 'clock' || !a.cueArmed) return tSec >= a.turnStartSec;
  const target = a.autoClockTargetId ? aircraft.find((x) => x.id === a.autoClockTargetId) : cueTargetForAircraft(a, aircraft, flight.clockCueAircraft);
  if (!target || target.id === a.id) return tSec >= a.turnStartSec;
  return clockCueCrossed(a, target, { clockPos: flight.clockCuePos, direction: flight.direction, toleranceDeg: +flight.clockCueTolDeg || V6_CLOCK_TOLERANCE_DEG });
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
 * flight: { tSec, spacingFt, timing, direction, clockCueAircraft, clockCuePos, clockCueTolDeg, speedFtps, baseG, turnDegDefault, correction, correctionStrength }
 *   tSec is the time at the start of the step. turnDegDefault is V6's Turn degrees
 *   box, used when an aircraft has no goal of its own.
 *
 * Lag and lead bend the direction of travel, not the heading, by 4° × strength
 * (V6 lines 1607 and 1608).
 */
export function moveAircraft(aircraft, flight, stepSec = STEP_SEC) {
  const v = flight.speedFtps;
  const useCorrection = flight.correction === 'lag' || flight.correction === 'lead';
  for (const a of aircraft) {
    // Step 2 of the flying: the Correction model "G fix" nudges a wingman's G toward its slot (core turnSimG,
    // V6 line 1583). Lead has already moved this step, and the distance is measured from the wingman's own
    // position before its move, as V6 does.
    const lead = aircraft.find((x) => x.id === 1);
    const g = turnSimG({
      gSetting: flight.baseG,
      gErr: a.gError,
      useErrorsAndCorrection: true,
      correction: flight.correction,
      aircraftId: a.id,
      distToLeadFt: lead ? Math.hypot(a.xFt - lead.xFt, a.yFt - lead.yFt) : 0,
      spacingFt: flight.spacingFt,
      corrStrength: flight.correctionStrength,
    });
    a.gFlown = g;
    const omega = turnRateRadPerSec(v, g);
    if (mayTurn(a, aircraft, flight.tSec, flight) && !a.done) {
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
