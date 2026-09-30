// Moving an aircraft's start position by hand (V6's drag before Play; SPEC-turn-sim: The screen). The engine takes no dragged positions, but
// it does take each aircraft's position error (a wide/tight and a fore/aft distance from its slot), so a move is stored as exactly that.
// The Aircraft errors boxes then show it, "Reset to defaults" clears it, and a profile carries it with the rest of the settings.
import { aircraftKey } from './settings.js';
import { formationSlots, startPositions, rightVector, forwardVector } from './engine/formation.js';
import { compassDegToHeadingRad } from '../../core/angles.js';

/** Lead stays where it is: the others are placed round it, and its position error has no box on the screen to show or clear it. */
export const MOVABLE_IDS = Object.freeze([2, 3, 4]);

/** The most a position error can be (settings.js). */
const MAX_ERROR_FT = 20000;

const clampFt = (v) => Math.min(Math.round(Math.abs(v)), MAX_ERROR_FT);

/**
 * The settings that put aircraft `id` at (xFt, yFt): its position error on, with the wide/tight and fore/aft distances from its slot.
 * Measured as the engine adds them (formation.js startPositions): fore/aft along the start heading, wide or tight across it and on the
 * slot's side of Lead, wide being further from Lead.
 *
 * @param {any} settings   the Turn Sim settings (formation, spacing, start heading, …)
 * @param {number} id      1 to 4
 * @param {number} xFt     where it should start
 * @param {number} yFt
 * @returns {Record<string, any>} the settings to update
 */
export function positionErrorFor(settings, id, xFt, yFt) {
  const slot = formationSlots(settings).find((a) => a.id === id);
  const h = compassDegToHeadingRad(settings.startHeadingDeg);
  const right = rightVector(h);
  const fwd = forwardVector(h);
  const dx = xFt - slot.xFt;
  const dy = yFt - slot.yFt;
  const side = slot.xFt * right.x + slot.yFt * right.y < 0 ? -1 : 1;
  const lateral = side * (dx * right.x + dy * right.y);
  const foreAft = dx * fwd.x + dy * fwd.y;
  return {
    [aircraftKey(id, 'positionErrorOn')]: true,
    [aircraftKey(id, 'lateralDir')]: clampFt(lateral) === 0 ? 'none' : lateral > 0 ? 'wide' : 'tight',
    [aircraftKey(id, 'lateralFt')]: clampFt(lateral),
    [aircraftKey(id, 'foreAftDir')]: clampFt(foreAft) === 0 ? 'none' : foreAft > 0 ? 'fore' : 'aft',
    [aircraftKey(id, 'foreAftFt')]: clampFt(foreAft),
  };
}

/** True when a move was held at the most a position error can be (so the aircraft is not where the pointer or key asked). */
export function atLimit(patch, id) {
  return patch[aircraftKey(id, 'lateralFt')] >= MAX_ERROR_FT || patch[aircraftKey(id, 'foreAftFt')] >= MAX_ERROR_FT;
}

/** Where aircraft `id` is put, in words for the status line: "#3 wide 300 ft, aft 100 ft", or "#3 in its slot". */
export function describePlacement(settings, id) {
  const parts = [];
  if (settings[aircraftKey(id, 'positionErrorOn')]) {
    for (const [dir, ftKey] of [['lateralDir', 'lateralFt'], ['foreAftDir', 'foreAftFt']]) {
      const d = settings[aircraftKey(id, dir)];
      const n = settings[aircraftKey(id, ftKey)];
      if (d !== 'none' && n > 0) parts.push(`${d} ${n.toLocaleString('en-US')} ft`);
    }
  }
  return `#${id} ${parts.length ? parts.join(', ') : 'in its slot'}`;
}

/** Where aircraft `id` starts now, errors included: [xFt, yFt]. */
export function startOf(settings, id) {
  const a = startPositions(settings).find((s) => s.id === id);
  return [a.xFt, a.yFt];
}

/**
 * A keyboard move: the settings that shift aircraft `id` by (dxFt, dyFt) from where it starts now (x east, y north).
 */
export function nudgeSettings(settings, id, dxFt, dyFt) {
  const [x, y] = startOf(settings, id);
  return positionErrorFor(settings, id, x + dxFt, y + dyFt);
}
