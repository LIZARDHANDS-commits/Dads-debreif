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
import { rightVector } from './formation.js';

/** The turn direction sign for the Direction box: right is -1 (clockwise), left is +1 (V6 line 1179). */
export function selectedDirSign(direction) {
  return direction === 'right' ? -1 : 1;
}

/**
 * Which side of Lead an aircraft is on, measured along V6's "right" vector from
 * the Start heading box: +1, -1 or 0 (V6 `sideOfLeadIn`, line 930).
 */
export function sideOfLead(aircraft, a, startHeadingDeg) {
  const r = rightVector(degToRad(startHeadingDeg));
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
export function displayedOutsideInOrder(aircraft, turnRight, startHeadingDeg) {
  const lead = aircraft.find((a) => a.id === 1) || aircraft[0];
  const r = rightVector(degToRad(startHeadingDeg));
  const lateral = (a) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y;
  return [...aircraft].sort((a, b) => (turnRight ? lateral(b) - lateral(a) : lateral(a) - lateral(b)));
}

/**
 * The offset box's front element, #1 and #2, far side first (V6
 * `offsetFrontElementOrder`, line 966). Uses Lead's own heading.
 */
export function offsetFrontElementOrder(aircraft, turnRight, startHeadingDeg) {
  const one = aircraft.find((a) => a.id === 1);
  const two = aircraft.find((a) => a.id === 2);
  const lead = one || aircraft[0];
  const h = lead ? lead.headingRad : degToRad(startHeadingDeg);
  const r = rightVector(h);
  const lateral = (a) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y;
  return [one, two].filter(Boolean).sort((a, b) => (turnRight ? lateral(b) - lateral(a) : lateral(a) - lateral(b)));
}

/**
 * The order the aircraft start their turns in, first to last (V6
 * `tacticalOrderForDelayIn`, line 1132): outside aircraft first; in the offset
 * box the front element first (far side first), then #3, then #4.
 */
export function turningOrder(aircraft, { formation, direction, startHeadingDeg }) {
  const turnRight = direction === 'right';
  if (formation === 'offsetBox') {
    const front = offsetFrontElementOrder(aircraft, turnRight, startHeadingDeg);
    return [...front.map((a) => a.id), 3, 4].map((id) => aircraft.find((a) => a.id === id)).filter(Boolean);
  }
  return displayedOutsideInOrder(aircraft, turnRight, startHeadingDeg);
}

/**
 * Plans the turn for every aircraft (V6 `setupTurnStartsFor`, line 1174, with
 * the time-delay trigger): sets each aircraft's start time, direction and goal,
 * and clears its turn progress. `aircraft` is the active aircraft, changed in
 * place, each with xFt, yFt, headingRad, delayErrSec, turnLogic and clockTarget.
 *
 * flight: { formation, maneuver, direction, turnDeg, baseDelaySec, startHeadingDeg, clockCueAircraft }
 * `formation` and `startHeadingDeg` are the ones now in force: V6 changes both
 * when a new leg starts (see run.js).
 *
 * Not yet here, so flown as V6's plain time delay: the clock cue and auto timing
 * (tasks 8 and 9) and, in the offset box's delayed turns, V6's solved delays for
 * #3 and #4 (task 11), which use the time delay index x base delay meanwhile.
 * Only the delayed turns are delayed; every other turn starts at once.
 */
export function planTurn(aircraft, flight, { useErrors = true } = {}) {
  const base = flight.baseDelaySec;
  const man = flight.maneuver;
  const selectedDir = selectedDirSign(flight.direction);
  const goal = degToRad(flight.turnDeg);
  const form = flight.formation;
  const delayed = man === 'delayed90away' || man === 'delayed45away';
  const order = turningOrder(aircraft, flight);
  const delayIndex = {};
  order.forEach((a, i) => { delayIndex[a.id] = i; });
  const logicFlight = { direction: flight.direction, clockCueAircraft: flight.clockCueAircraft };

  for (const a of aircraft) {
    let d = 0;
    let dir = selectedDir;
    let g = goal;

    if (delayed) d = delayIndex[a.id] * base;

    if (man === 'hook90' || man === 'inplace90') { d = 0; dir = selectedDir; }

    if (man === 'shackle45') {
      d = 0;
      if (form === 'twoShip') {
        const wing = aircraft.find((x) => x.id !== 1) || aircraft.find((x) => x.id === 2);
        const side = wing ? sideOfLead(aircraft, wing, flight.startHeadingDeg) : -1;
        dir = a.id === 1 ? -side : side;
      } else {
        const side = sideOfLead(aircraft, a, flight.startHeadingDeg);
        dir = a.id === 1 || side === 0 ? selectedDir : side;
      }
      g = degToRad(45);
    }

    if (man === 'cross180') {
      d = 0;
      dir = sideOfLead(aircraft, a, flight.startHeadingDeg) < 0 ? 1 : -1;
      if (a.id === 1) dir = selectedDir;
    }

    if (a.id === 1) dir = selectedDir;
    else dir = turnDirFromLogic(a, aircraft, dir, logicFlight);

    // In the offset box's delayed turns every aircraft turns the selected way (V6 line 1240).
    if (form === 'offsetBox' && delayed) dir = selectedDir;

    a.turnStartSec = d + (useErrors ? a.delayErrSec : 0);
    a.turnDir = dir;
    a.turnGoalRad = g;
    a.originalHeadingRad = a.headingRad;
    a.shackleReturn = man === 'shackle45';
    a.turnPhase = 0;
    a.active = false;
    a.done = false;
    a.turnAccumRad = 0;
  }
}
