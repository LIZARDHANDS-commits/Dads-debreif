// The T-6A's sustained turn chart, read off by eye, and the thrust and drag
// fitted to it (SPEC-core, "API, fifth PR"; tasks 16 and 17).
//
// Chart: "Sustained turn rate versus airspeed", T-6A flight manual Figure
// 4-10-1 (PT6A-68, flight test, June 1998): maximum power, flaps and gear up,
// standard day, maximum take-off weight less the fuel to climb. Patrick sent
// it on 2026-09-30 (05:19Z); the picture stays in the project files, not here.
// Its example arrow is at 10,000 ft: the radius chart's 1,690 ft at the same
// speed confirms it.
//
// How the points were read: by eye against the picture's grid (10 KIAS and
// 0.5°/s per line), so each is good to a few knots and a few tenths of a
// degree a second. Three kinds per altitude line: its top at the stall limit, where it
// crosses 150 and 200 KIAS, and where it reaches zero turn rate (1 G). A few
// more at sea level near zero, and the example arrow at 10,000 ft.
//
// Each point is [KIAS, pressure altitude ft, sustained turn rate °/s]. In a
// sustained turn thrust equals drag, so each gives the drag at that speed and
// G, with G from the rate: n = √(1 + (ω V / g)²), V the true airspeed.

/** Tops of each altitude line, on the stall limit. */
export const T6A_TURN_STALL_LIMIT = Object.freeze([
  [139.6, 0, 20.6], [135.9, 5000, 18.5], [132.2, 10000, 16.55], [128.2, 15000, 14.7],
  [118.3, 20000, 12.0], [108.8, 25000, 9.57], [97.7, 31000, 6.68],
]);

/** Where each altitude line reaches zero turn rate: 1 G is all it can hold. */
export const T6A_TURN_ZERO = Object.freeze([
  [260.3, 0, 0], [253.6, 5000, 0], [247.1, 10000, 0], [240.7, 15000, 0],
  [225.8, 20000, 0], [205.9, 25000, 0], [179.6, 31000, 0],
]);

/** Each altitude line at 150 and 200 KIAS (25,000 ft at 200 is near its end; 31,000 has none). */
export const T6A_TURN_150_200 = Object.freeze([
  [150, 0, 19.83], [150, 5000, 17.58], [150, 10000, 15.5], [150, 15000, 13.44],
  [150, 20000, 10.56], [150, 25000, 7.77], [150, 31000, 4.85],
  [200, 0, 15.26], [200, 5000, 13.28], [200, 10000, 11.4], [200, 15000, 9.66],
  [200, 20000, 6.78], [200, 25000, 2.96],
]);

/** Sea level on its steep fall toward 260 KIAS, and the chart's example arrow at 10,000 ft. */
export const T6A_TURN_OTHER = Object.freeze([
  [236.2, 0, 10.36], [249.6, 0, 7.5], [256.6, 0, 4.48], [187, 10000, 12.73],
]);

/** Every chart point the fit uses. */
export const T6A_TURN_POINTS = Object.freeze([
  ...T6A_TURN_STALL_LIMIT, ...T6A_TURN_ZERO, ...T6A_TURN_150_200, ...T6A_TURN_OTHER,
]);

/**
 * The fitted model, as fractions of weight (tests/golden/checks/t6a-fit.mjs
 * prints these from the points above).
 *
 * Drag, D/W = dragA·KIAS² + dragB·G²/KIAS², comes from the max glide chart
 * alone: best glide 125 KIAS at 2 NM per 1,000 ft (L/D 12.15). In a
 * sustained turn only thrust minus drag shows, so the turn chart cannot split
 * the two; the glide chart can (SPEC-core's default for a glide miss).
 *
 * Thrust, T/W = thrustK · min(σ, thrustFlatSigma)^thrustDensityExp ÷ (KTAS + thrustV0Kt),
 * falls with true airspeed like a constant-power propeller and holds its
 * sea-level value up to about 14,000 ft (σ 0.643), like the flat-rated
 * PT6A-68, then falls with density. Fitted to the turn chart by least squares
 * on (T − D)/D.
 */
export const T6A_FIT = Object.freeze({
  glideRatio: 12.15224,
  bestGlideKias: 125,
  dragA: 2.63326e-6,
  dragB: 642.886,
  thrustK: 96.9613,
  thrustV0Kt: 74.793,
  thrustDensityExp: 0.884479,
  thrustFlatSigma: 0.642634,
});
