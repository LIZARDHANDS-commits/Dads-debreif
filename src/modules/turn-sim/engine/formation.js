// Formation slots and position errors (pure: a settings object in, plain
// numbers out). Ported unchanged from V6, so every number matches it; the
// golden test tests/golden/turn-sim-formation.test.js runs V6's own functions
// next to these. D42 (wide and tight measured from Lead) and D48 (#2's side)
// come later as their own commits, so nothing here changes yet.
//
// Coordinates are V6's own: feet, x east and y north, headings in radians with
// 0 pointing east and angles growing counter-clockwise (the code heading of
// src/core/angles.js). V6's Turn Sim already draws north-up, so nothing is
// converted at the edge.
//
// V6's "right" vector, (cos(h + 90°), sin(h + 90°)), is 90° counter-clockwise
// of the heading, which on this north-up map is the LEFT of the aircraft. V6's
// code and comments call it "right" throughout, and its numbers depend on it,
// so it keeps that name here (rightVector) and this note says what it is.
import { degToRad } from '../../../core/angles.js';
import { aircraftSettings } from '../settings.js';

/** #4's distance outside #2 in the offset box, in feet (V6 line 815: "fixed 3000 ft outside of #2"). */
export const OFFSET_BOX_OUTSIDE_FT = 3000;

/** V6 puts the aircraft that a two-ship doesn't have this far away (line 823, `999999`); they never fly. */
const ABSENT_LATERAL_FT = 999999;

/** True when the preset is the two-ship: only #1 and #2 exist (V6 `isTwoShip`, line 783). */
export function isTwoShip(formation) {
  return formation === 'twoShip';
}

/** The aircraft ids that exist in a preset (V6 `activeList`, line 785). */
export function activeIds(formation) {
  return isTwoShip(formation) ? [1, 2] : [1, 2, 3, 4];
}

/** V6's "right" vector for a heading (see the note at the top: it is the aircraft's left on the map). */
export function rightVector(headingRad) {
  return { x: Math.cos(headingRad + Math.PI / 2), y: Math.sin(headingRad + Math.PI / 2) };
}

/** The unit vector along a heading. */
export function forwardVector(headingRad) {
  return { x: Math.cos(headingRad), y: Math.sin(headingRad) };
}

/**
 * Where each aircraft starts in a preset, before position errors
 * (V6 `desiredFormationAircraft`, line 797; the code-only "fluid" and "trail"
 * layouts are not ported). Returns all four aircraft, as V6 does:
 * [{ id, xFt, yFt, headingRad }].
 *
 * Uses: formation, spacingFt, startHeadingDeg, boxAftFt, boxStaggerFt.
 * Each aircraft sits `lat` along the "right" vector and `long` along the
 * heading from Lead. 4312 is 4 | 3 | 1 | 2 with #2 on that vector's side.
 */
export function formationSlots(settings) {
  const s = settings.spacingFt;
  const h = degToRad(settings.startHeadingDeg);
  const form = settings.formation;
  const right = rightVector(h);
  const fwd = forwardVector(h);
  const map = {};
  if (form === 'weighted') { map[1] = 0; map[2] = s; map[3] = -s; map[4] = -2 * s; }
  else if (form === 'weightedReverse') { map[1] = 0; map[2] = -s; map[3] = s; map[4] = 2 * s; }
  else if (form === 'offsetBox') {
    // #1 and #2 are the front element; #3 is centred in the slot between them,
    // #4 is OFFSET_BOX_OUTSIDE_FT outside #2 (V6 lines 806 to 819).
    const lateral = s + settings.boxStaggerFt;
    map[1] = 0;
    map[2] = -lateral;
    map[3] = -lateral / 2;
    map[4] = -(lateral + OFFSET_BOX_OUTSIDE_FT);
  } else if (form === 'twoShip') { map[1] = 0; map[2] = -s; map[3] = ABSENT_LATERAL_FT; map[4] = ABSENT_LATERAL_FT; }
  else throw new RangeError(`unknown formation: ${form}`);

  return [1, 2, 3, 4].map((id) => {
    const lat = map[id] || 0;
    let long = 0;
    if (form === 'offsetBox' && (id === 3 || id === 4)) long = -settings.boxAftFt;
    return { id, xFt: right.x * lat + fwd.x * long, yFt: right.y * lat + fwd.y * long, headingRad: h };
  });
}

/**
 * Each aircraft's position error in feet, by id (V6 `syncAircraftErrorValues`,
 * line 905): { lateralFt, foreAftFt }. Wide is +, tight is -, fore is +, aft is -.
 * The error is worked out even when "Enable position error" is off; it is only
 * added to the start position when it is on (see startPositions).
 */
export function positionErrorsFt(settings) {
  const out = {};
  for (const id of [1, 2, 3, 4]) {
    const a = aircraftSettings(settings, id);
    out[id] = {
      lateralFt: (a.lateralDir === 'wide' ? 1 : a.lateralDir === 'tight' ? -1 : 0) * (+a.lateralFt || 0),
      foreAftFt: (a.foreAftDir === 'fore' ? 1 : a.foreAftDir === 'aft' ? -1 : 0) * (+a.foreAftFt || 0),
    };
  }
  return out;
}

/**
 * The slots with each enabled position error added (V6 `applyErrors`, line 910):
 * the wide/tight feet along the "right" vector and the fore/aft feet along the
 * start heading, both taken from the Start heading box, not from Lead's heading.
 * This is where V6's D42 problem lives (wide moves every aircraft the same way);
 * it is left as it is until that decision's own commit.
 */
export function startPositions(settings) {
  const h = degToRad(settings.startHeadingDeg);
  const right = rightVector(h);
  const fwd = forwardVector(h);
  const errors = positionErrorsFt(settings);
  return formationSlots(settings).map((a) => {
    if (!aircraftSettings(settings, a.id).positionErrorOn) return a;
    const e = errors[a.id];
    return { ...a, xFt: a.xFt + (right.x * e.lateralFt + fwd.x * e.foreAftFt), yFt: a.yFt + (right.y * e.lateralFt + fwd.y * e.foreAftFt) };
  });
}

/**
 * Whether a line abreast of four is now 4312 or 2134, from where the aircraft
 * are (V6 `inferLineAbreastFormFromCurrentState`, line 1407). Sorts the aircraft
 * along Lead's "right" vector; any other order, or fewer than four aircraft,
 * keeps `formation`. `aircraft` is [{ id, xFt, yFt, headingRad }].
 */
export function inferLineAbreastForm(aircraft, formation) {
  const ids = activeIds(formation);
  const work = aircraft.filter((a) => ids.includes(a.id));
  if (work.length < 4) return formation;
  const lead = work.find((a) => a.id === 1) || work[0];
  const r = rightVector(lead.headingRad);
  const ordered = [...work]
    .sort((a, b) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y - ((b.xFt - lead.xFt) * r.x + (b.yFt - lead.yFt) * r.y))
    .map((a) => a.id)
    .join('');
  if (ordered === '4312') return 'weighted';
  if (ordered === '2134') return 'weightedReverse';
  return formation;
}
