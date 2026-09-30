// The turn plan: who turns which way, how far, and when. Only the time-delay
// timing is here (V6 `setupTurnStartsFor`, line 1174, with the trigger 'time').
// The clock cue, auto timing and the offset box's solved delays come in tasks
// 8, 9 and 11, so until then those timings fly as a plain time delay (see
// planTurn). Ported from V6; D41 (toward and away) is fixed, D43 and D44 (auto
// timing) and the others are their own commits later.
//
// Coordinates and headings are V6's (see formation.js). V6's "right" vector is
// the aircraft's left on the map; "selected direction" is +1 for a left turn
// (counter-clockwise) and -1 for a right turn, as V6 has it (line 1179).
import { degToRad } from '../../../core/angles.js';
import { ktToFtps } from '../../../core/units.js';
import { rightVector } from './formation.js';

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
 * Returns { autoStepSec }: the auto step when the timing is auto and the turn is a delayed one, else null.
 * `formation` and `startHeadingRad` are the ones now in force: V6 changes both
 * when a new leg starts (see run.js).
 *
 * Not yet here: in the offset box's delayed turns, V6's solved delays for #3 and
 * #4 (task 11), which use the time delay index x base delay meanwhile.
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
  const base = auto ? Number(auto.stepSec.toFixed(2)) : flight.baseDelaySec;
  const clockMode = flight.timing === 'clock' && delayed;
  const order = turningOrder(aircraft, flight);
  const cascade = clockMode ? order : []; // V6 clockCascadeOrder (line 1152) is the same order as the delay order
  const delayIndex = {};
  order.forEach((a, i) => { delayIndex[a.id] = i; });
  const logicFlight = { direction: flight.direction, clockCueAircraft: flight.clockCueAircraft };

  for (const a of aircraft) {
    let d = 0;
    let dir = selectedDir;
    let g = goal;

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
    } else {
      if (delayed) d = auto && form !== 'offsetBox' ? +auto.startsSec[a.id] || 0 : delayIndex[a.id] * base;

      if (man === 'hook90' || man === 'inplace90') { d = 0; dir = selectedDir; }

      if (man === 'shackle45') {
        d = 0;
        if (form === 'twoShip') {
          const wing = aircraft.find((x) => x.id !== 1) || aircraft.find((x) => x.id === 2);
          const side = wing ? sideOfLead(aircraft, wing, flight.startHeadingRad) : -1;
          dir = a.id === 1 ? -side : side;
        } else {
          const side = sideOfLead(aircraft, a, flight.startHeadingRad);
          dir = a.id === 1 || side === 0 ? selectedDir : side;
        }
        g = degToRad(45);
      }

      if (man === 'cross180') {
        d = 0;
        dir = sideOfLead(aircraft, a, flight.startHeadingRad) < 0 ? 1 : -1;
        if (a.id === 1) dir = selectedDir;
      }

      if (a.id === 1) dir = selectedDir;
      else dir = turnDirFromLogic(a, aircraft, dir, logicFlight);

      // In the offset box's delayed turns every aircraft turns the selected way (V6 line 1241).
      if (form === 'offsetBox' && delayed) dir = selectedDir;

      a.autoClockTargetId = null;
      a.cueArmed = flight.timing !== 'time' && delayed && a.id !== 1;
    }
    a.turnStartSec = clockMode ? 0 : d + (useErrors ? a.delayErrSec : 0); // V6 line 1253: a clock cue has no delay
    a.prevClockCueRelDeg = null;
    a.clockCueTriggered = false;
    a.turnDir = dir;
    a.turnGoalRad = g;
    a.originalHeadingRad = a.headingRad;
    a.shackleReturn = man === 'shackle45';
    a.turnPhase = 0;
    a.active = false;
    a.done = false;
    a.turnAccumRad = 0;
  }
  return { autoStepSec: auto ? auto.stepSec : null };
}
