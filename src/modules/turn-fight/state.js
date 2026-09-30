// The Turn Fight's remembered settings as plain values, tested in Node
// (SPEC-turn-fight, "The screen"): V6's defaults, the number ranges, and the
// few helpers that turn settings into the fight's setup. No page access.
import { V6_DEFAULT_SETUP } from './sim.js';

/**
 * Every setting and its opening value (V6's where V6 had one). The fight's own
 * numbers use the same names as sim.js's setup, so a number box can be bound
 * straight to the setting. `energy` is saved but its box stays greyed out until
 * Energy mode is built. `setupOpen` and `resultOpen` remember the side columns.
 */
export const DEFAULTS = Object.freeze({
  ...V6_DEFAULT_SETUP,
  energy: false,
  heightScale: 2,
  playbackRate: 1,
  setupOpen: true,
  resultOpen: true,
});

/** The settings that make up a fight; changing one resets it (V6 `reset`, line 4294). */
export const FIGHT_KEYS = Object.freeze(Object.keys(V6_DEFAULT_SETUP));

/** Values a saved setting may take besides "any number in range" (createSettings `allowed`). */
export const ALLOWED = Object.freeze({
  circles: [1, 2],
  heightScale: [1, 2, 4],
  playbackRate: [0.5, 1, 2, 4],
});

/** The number boxes' limits (SPEC-turn-fight, "Number boxes"); `step` is V6's arrow step. */
export const RANGES = Object.freeze({
  separationNm: { min: 0.5, max: 10, step: 0.5, unit: 'NM' },
  blueKt: { min: 60, max: 400, step: 5, unit: 'KTAS' },
  redKt: { min: 60, max: 400, step: 5, unit: 'KTAS' },
  blueG: { min: 1.1, max: 9, step: 0.1, unit: 'G' },
  redG: { min: 1.1, max: 9, step: 0.1, unit: 'G' },
  bluePitchDeg: { min: -60, max: 60, step: 1, unit: '°' },
  redPitchDeg: { min: -60, max: 60, step: 1, unit: '°' },
});

/** The setup sim.js's createFight takes, from the settings. */
export function setupFrom(values) {
  return Object.fromEntries(FIGHT_KEYS.map((key) => [key, values[key]]));
}

/** Changes exactly when the fight would have to start again. */
export function setupKey(values) {
  return JSON.stringify(setupFrom(values));
}

/** What "Reset to V6 defaults" puts back: the fight and the display settings, not which columns are open. */
export function v6Defaults() {
  const patch = {};
  for (const key of [...FIGHT_KEYS, 'heightScale', 'playbackRate']) patch[key] = DEFAULTS[key];
  return patch;
}

/**
 * Settings read back from browser storage are checked against the same ranges
 * as the boxes (SPEC-turn-fight, "Skills used"): returns the defaults for any
 * number that is out of range, to be saved over it.
 */
export function saneFix(values) {
  const fix = {};
  for (const [key, { min, max }] of Object.entries(RANGES)) {
    const n = values[key];
    if (!(Number.isFinite(n) && n >= min && n <= max)) fix[key] = DEFAULTS[key];
  }
  return fix;
}
