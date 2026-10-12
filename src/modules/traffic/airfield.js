// Moose Jaw (CYMJ) in one place: the runway, the field and the pattern numbers
// the Traffic Sim flies to, each with its source. Other Traffic files read
// these instead of typing the numbers again (Traffic plan, Step 2, PR 1).
//
// Map coordinates are feet, x east and y north, with the origin at the field
// (the same frame as data/moose-jaw.json). Headings are compass degrees true.
// The coordinates are true feet (TR-67, Patrick 5 Oct 00:27Z: V6's hand-drawn,
// 1.2 times stretched routes dropped and rebuilt from the manuals).

// Patrick's measured runway points (the 29L, 29R and 03/21 ends, the 29L number base and the runway widths) live in the shared
// src/airfields/cymj-runways.js, the one copy (Patrick, 11 Oct 2026 20:47Z); the SOF's and the Debrief's runway list reads the same file.
export {
  THRESHOLD_29L, NUMBER_BASE_29L, NUMBER_BASE_PAST_THRESHOLD_FT, DEPARTURE_END_29L, THRESHOLD_29R, DEPARTURE_END_29R, RUNWAY_03, RUNWAY_21,
  RUNWAY_WIDTH_FT,
} from '../../airfields/cymj-runways.js';

/**
 * The flare: rounded out from this height above the runway, ft (an estimate, just before the threshold on the 3°
 * path), to touch down this far past the base of the numbers, ft (Patrick, 6 Oct 06:50Z: "round out/flare ... touch
 * down 300-500 feet down the runway"; 400 is the middle).
 */
export const FLARE_FROM_FT = 15;
export const TOUCHDOWN_PAST_NUMBERS_FT = 400;

/**
 * The taxi-in after a full stop on 29L (Patrick, 10 Oct 20:38Z: to the end of the runway, off along the taxi lines,
 * across the other runway, stop in front of the Bandit hangar), map feet, traced off Esri's true-scale photo along the
 * concrete's centre (10 Oct, about ±25 ft; the taxiways painted on the map are only roughly placed). In order: the
 * turn-off at the 29L end (on the centreline, about 30 ft short of the 11R bar), the 29R crossing, the join with the
 * taxiway north of 29R, onto the ramp, along the ramp, and the stop in front of Hangar 2 (the hangar the 3D view puts
 * the Bandit badge on, scenery3d.js). The taxiway from the 29L end runs at about 29° true, straight across 29R.
 */
export const TAXI_IN_29L = Object.freeze([
  Object.freeze({ x: -3544, y: 675, tag: 'turn_off' }),
  Object.freeze({ x: -2679, y: 2253, tag: 'cross_29r' }),
  Object.freeze({ x: -2485, y: 2608, tag: 'north_taxiway' }),
  Object.freeze({ x: -750, y: 1830, tag: 'ramp' }),
  Object.freeze({ x: 560, y: 1830, tag: 'ramp' }),
  Object.freeze({ x: 560, y: 1990, tag: 'bandit_hangar' }),
]);

/**
 * Runway 29L heading, degrees true: Patrick's CYMJ ground truth (D373, D378; TR-24), the same as the CAP chart's
 * 289°M with 9° East. The photo's thresholds lie on 298.6° true; the routes follow the drawn runway, and this
 * heading sets the PFL circle and High Key's run-in (half a degree apart, about 30 ft at the circle's centre).
 */
export const RUNWAY_29L_HDG_DEG = 298;

/**
 * Magnetic variation at Moose Jaw, degrees East (magnetic = true - this): Patrick's ruling, 4 Oct ("it's more like
 * 9 east"; TR-65). Used only to show the wind in °M; the flying is in true. The runway's true heading (298°) is
 * Patrick's ground truth on its own and does not come from this.
 */
export const MAG_VARIATION_DEG_E = 9;

/** A true bearing as magnetic, 1-360 (360, never 0, for north). */
export const trueToMagnetic = (trueDeg) => {
  const m = ((Math.round(trueDeg - MAG_VARIATION_DEG_E) % 360) + 360) % 360;
  return m === 0 ? 360 : m;
};

/** A magnetic bearing as true, 1-360. */
export const magneticToTrue = (magDeg) => {
  const t = ((Math.round(magDeg + MAG_VARIATION_DEG_E) % 360) + 360) % 360;
  return t === 0 ? 360 : t;
};

/** Downwind heading for 29L: the reciprocal of the runway. */
export const DOWNWIND_29L_HDG_DEG = 118;

/**
 * Field elevation, ft MSL: Patrick's CYMJ number (D373; TR-24). The manuals
 * say about 1,890 ft (pf/manuals/traffic-pattern-numbers.md:5).
 */
export const FIELD_ELEV_FT = 1892;

/**
 * Threshold height in the route data, ft MSL: the field's, 1,892 ft (Patrick, 12 Oct 2026: "Touchdown Elevation
 * 1892 ft", card "Move to 1,892"). 1,880 ft until then (D202, D211). The window sits 3° above it at 3/4 NM, 2,131 ft
 * (2,119 ft until then).
 */
export const THRESHOLD_DATA_ELEV_FT = FIELD_ELEV_FT;

/** Pattern height, ft MSL: Patrick's ruling (D109; TR-R4). */
export const PATTERN_ALT_FT = 3500;

/**
 * PFL key heights, ft MSL, checked against the SMM (Patrick, card 4 Oct
 * 07:01Z): High Key 5,000 (SMM 13.8 para 17), Low Key 3,700 (SMM 13.8 para 17,
 * 4.28 para 71), Final Key about 1,000 ft above the field (SMM 13.9 para 18).
 */
export const PFL_KEY_ALT_FT = Object.freeze({ highKey: 5000, lowKey: 3700, finalKey: 3000 });

/**
 * The PFL circle: 0.5 NM radius (1 NM across), centre 0.5 NM from the 29L
 * threshold, 90° left of the runway heading (208° true), so the circle closes
 * on the centreline at the threshold (pf/reset/pfl-prep/pfl-definition.md,
 * ratified 4 Oct 07:03Z). True feet since TR-67 (on the stretched map it was
 * only about 0.42 NM over the ground).
 */
export const PFL_CIRCLE_RADIUS_FT = 3038.06;

/**
 * Where (x, y) sits against a runway: `alongFt` from the threshold `th` in the direction (ux, uy), and `acrossFt`
 * either side of the centreline. A unit (ux, uy) gives feet; a caller with a longer vector divides both by its length.
 */
export function runwayFrameFt(x, y, th, ux, uy) {
  const dx = x - th.x, dy = y - th.y;
  return { alongFt: dx * ux + dy * uy, acrossFt: Math.abs(dx * uy - dy * ux) };
}

/**
 * Lined up with a runway: within `maxAcrossFt` of its centreline and tracking within `maxOffDeg` of it. Each caller
 * names its own limits (estimates, listed for Patrick in the refactor's unsourced-numbers table).
 */
export function linedUp(acrossFt, offDeg, { maxAcrossFt, maxOffDeg }) {
  return acrossFt < maxAcrossFt && offDeg < maxOffDeg;
}
