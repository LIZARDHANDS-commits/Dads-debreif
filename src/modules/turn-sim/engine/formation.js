// Formation slots and position errors (pure: a settings object in, plain
// numbers out). Ported unchanged from V6, so every number matches it; the
// golden test tests/golden/turn-sim-formation.test.js runs V6's own functions
// next to these. D42 (wide and tight measured from Lead) is startPositions;
// D48 (#2's side) is the twoSide setting in formationSlots.
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
import { compassDegToHeadingRad } from '../../../core/angles.js';
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
 * Uses: formation, spacingFt, startHeadingDeg (compass, D45), boxAftFt, boxStaggerFt, twoSide.
 * Each aircraft sits `lat` along the "right" vector and `long` along the
 * heading from Lead. 4312 is 4 | 3 | 1 | 2 with #2 on that vector's side, which
 * is Lead's left as the pilot sees it. D48 (Q31): `twoSide` is 'left' (the default, and V6's
 * layout) or 'right', which mirrors 4312 and 2134 so #2 flies on Lead's right.
 */
export function formationSlots(settings) {
  const s = settings.spacingFt;
  const h = compassDegToHeadingRad(settings.startHeadingDeg);
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

  // D48: which side #2 flies on in 4312 and 2134. Left is V6's 4312 (and its 2134 is the mirror); right mirrors both.
  const mirror = (form === 'weighted' || form === 'weightedReverse') && settings.twoSide === 'right' ? -1 : 1;
  return [1, 2, 3, 4].map((id) => {
    const lat = mirror * (map[id] || 0) || 0; // "|| 0": Lead's mirrored 0 is not -0
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
 * the fore/aft feet along the start heading and the wide/tight feet across it,
 * both taken from the Start heading box, not from Lead's heading.
 *
 * D42 (#15): wide and tight are measured from Lead, on whichever side the
 * aircraft flies: wide moves it further from Lead, tight closer. V6 moved every
 * aircraft along one fixed direction (line 913), so on the far side "wide"
 * came in tighter. An aircraft on the "right" vector's side of Lead (V6's
 * positive lateral slot, the map's left) is moved as V6 did; on the other side
 * the sign flips. Lead has no side and keeps V6's direction.
 */
export function startPositions(settings) {
  const h = compassDegToHeadingRad(settings.startHeadingDeg);
  const right = rightVector(h);
  const fwd = forwardVector(h);
  const errors = positionErrorsFt(settings);
  return formationSlots(settings).map((a) => {
    if (!aircraftSettings(settings, a.id).positionErrorOn) return a;
    const e = errors[a.id];
    const side = a.xFt * right.x + a.yFt * right.y < 0 ? -1 : 1; // the slot's side of Lead along the "right" vector
    const lateralFt = side * e.lateralFt;
    return { ...a, xFt: a.xFt + (right.x * lateralFt + fwd.x * e.foreAftFt), yFt: a.yFt + (right.y * lateralFt + fwd.y * e.foreAftFt) };
  });
}

/**
 * Whether a line abreast of four is now 4312 or 2134, from where the aircraft
 * are (V6 `inferLineAbreastFormFromCurrentState`, line 1407). Sorts the aircraft
 * along Lead's "right" vector; any other order, or fewer than four aircraft,
 * keeps `formation`. `aircraft` is [{ id, xFt, yFt, headingRad }]. `twoSide` is
 * the D48 setting: with 'right' the answers swap (see formationSlots).
 */
export function inferLineAbreastForm(aircraft, formation, twoSide = 'left') {
  const ids = activeIds(formation);
  const work = aircraft.filter((a) => ids.includes(a.id));
  if (work.length < 4) return formation;
  const lead = work.find((a) => a.id === 1) || work[0];
  const r = rightVector(lead.headingRad);
  const ordered = [...work]
    .sort((a, b) => (a.xFt - lead.xFt) * r.x + (a.yFt - lead.yFt) * r.y - ((b.xFt - lead.xFt) * r.x + (b.yFt - lead.yFt) * r.y))
    .map((a) => a.id)
    .join('');
  // D48: with #2 on Lead's right the two layouts swap names (the mirror of 4312 is what V6 called 2134).
  const [first, second] = twoSide === 'right' ? ['weightedReverse', 'weighted'] : ['weighted', 'weightedReverse'];
  if (ordered === '4312') return first;
  if (ordered === '2134') return second;
  return formation;
}
