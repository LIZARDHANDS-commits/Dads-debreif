// Moose Jaw (CYMJ) in one place: the runway, the field and the pattern numbers
// the Traffic Sim flies to, each with its source. Other Traffic files read
// these instead of typing the numbers again (Traffic plan, Step 2, PR 1).
//
// Map coordinates are feet, x east and y north, with the origin at the field
// (the same frame as data/moose-jaw.json). Headings are compass degrees true.
// The coordinates are V6's geometry, kept until the routes are redrawn with
// Dad (Traffic plan, Step 6).

/** Runway 29L threshold, map feet (data/moose-jaw.json point 0, rounded). */
export const THRESHOLD_29L = Object.freeze({ x: 3104, y: -3194 });

/** Runway 29L departure end, map feet (data/moose-jaw.json point 1, rounded). */
export const DEPARTURE_END_29L = Object.freeze({ x: -4066, y: 680 });

/** Runway 29L heading, degrees true: Patrick's CYMJ ground truth (D373, D378; TR-24). */
export const RUNWAY_29L_HDG_DEG = 298;

/**
 * Magnetic variation at Moose Jaw, degrees East (magnetic = true - this): Patrick's ruling, 4 Oct ("it's more like
 * 9 east"; TR-58). Used only to show the wind in °M; the flying is in true. The runway's true heading (298°) is
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
 * Threshold height in the route data, ft MSL. It disagrees with FIELD_ELEV_FT;
 * the data inconsistency is fixed at the route redraw (TR-Q15, decisions D202
 * and TR-24). Kept here so the refactor changes nothing on screen.
 */
export const THRESHOLD_DATA_ELEV_FT = 1880;

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
 * ratified 4 Oct 07:03Z).
 */
export const PFL_CIRCLE_RADIUS_FT = 3038.06;
