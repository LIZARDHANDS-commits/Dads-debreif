// Moose Jaw (CYMJ) in one place: the runway, the field and the pattern numbers
// the Traffic Sim flies to, each with its source. Other Traffic files read
// these instead of typing the numbers again (Traffic plan, Step 2, PR 1).
//
// Map coordinates are feet, x east and y north, with the origin at the field
// (the same frame as data/moose-jaw.json). Headings are compass degrees true.
// The coordinates are true feet (TR-67, Patrick 5 Oct 00:27Z: V6's hand-drawn,
// 1.2 times stretched routes dropped and rebuilt from the manuals).

/**
 * Runway 29L threshold bar, map feet (data/moose-jaw.json point 0), measured on
 * Esri's true-scale photo (about ±10 ft; TR-67).
 */
export const THRESHOLD_29L = Object.freeze({ x: 2796, y: -2776 });

/**
 * Runway 29L number base, map feet: where the 3° glide path ends, the aim point (Patrick, 6 Oct 06:33Z: "three degree
 * goes to the base of the numbers"). Patrick's point, 50.322977 N 105.547962 W (5 Oct 00:35Z), lies on the centreline
 * 207 ft past the threshold bar on Esri's true-scale photo.
 */
export const NUMBER_BASE_29L = Object.freeze({ x: 2614, y: -2677 });
export const NUMBER_BASE_PAST_THRESHOLD_FT = 207;

/**
 * The flare: rounded out from this height above the runway, ft (an estimate, just before the threshold on the 3°
 * path), to touch down this far past the base of the numbers, ft (Patrick, 6 Oct 06:50Z: "round out/flare ... touch
 * down 300-500 feet down the runway"; 400 is the middle).
 */
export const FLARE_FROM_FT = 15;
export const TOUCHDOWN_PAST_NUMBERS_FT = 400;

/**
 * Runway 29L departure end (the 11R threshold bar), map feet (data/moose-jaw.json
 * point 1), measured the same way: 7,250 ft from the 29L threshold at 298.6° true.
 * The CAP aerodrome chart gives 7,280 ft (TR-67).
 */
export const DEPARTURE_END_29L = Object.freeze({ x: -3572, y: 690 });

/**
 * Runway 29R threshold bar and its departure end (the 11L threshold bar), map feet, measured on Esri's true-scale
 * photo (about ±15 ft; 5 Oct): 8,260 ft at 298.6° true, about 1,800 ft north-east of 29L. Drawn only (the 3D slab
 * and the painted ground); no route uses 29R.
 */
export const THRESHOLD_29R = Object.freeze({ x: 3622, y: -1189 });
export const DEPARTURE_END_29R = Object.freeze({ x: -3628, y: 2769 });

/**
 * Crossing runway 03/21, map feet: the NE-SW strip between 29L and the taxiway north of 29R, measured on Esri's true-scale
 * photo (about ±15 ft; 5 Oct). The 03 end is on the 29L centreline; about 3,060 ft at 44° true (35°M). Patrick named it
 * runway 03/21 (5 Oct 03:11Z; the NNW-SSE strip west of it is taxiway Echo). Drawn only; no route uses it.
 */
export const RUNWAY_03 = Object.freeze({ x: 55, y: -1284 });
export const RUNWAY_21 = Object.freeze({ x: 2175, y: 929 });

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

/** Runway widths, ft: 29L 150 (the painted ground's figure, which the photo matches), 29R about 150 (measured on Esri's photo, 6 Oct; was 200), 03/21 about 100 (photo). Estimates. */
export const RUNWAY_WIDTH_FT = Object.freeze({ '29L': 150, '29R': 150, '03': 100 });

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
 * Threshold height in the route data, ft MSL. It disagrees with FIELD_ELEV_FT
 * and the CAP chart's 1,892 ft threshold (decisions D202 and TR-24); the true-scale
 * rebuild (TR-67) left it alone, so the window (2,119 ft, 3° to the number base)
 * and every route height stay as they were.
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
 * ratified 4 Oct 07:03Z). True feet since TR-67 (on the stretched map it was
 * only about 0.42 NM over the ground).
 */
export const PFL_CIRCLE_RADIUS_FT = 3038.06;
