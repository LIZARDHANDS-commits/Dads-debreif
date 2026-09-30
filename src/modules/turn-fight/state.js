// The Turn Fight's remembered settings as plain values, tested in Node
// (SPEC-turn-fight, "The screen"): V6's defaults, the number ranges, and the
// few helpers that turn settings into the fight's setup. No page access.
import { V6_DEFAULT_SETUP } from './sim.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { START_DEFAULTS } from './geometry.js';

/**
 * Every setting and its opening value (V6's where V6 had one). The fight's own
 * numbers use the same names as sim.js's setup, so a number box can be bound
 * straight to the setting. `energy` is saved, but has no box on screen until
 * Energy mode is built. `setupOpen` and `resultOpen` remember the side columns.
 * `view` is the 2D or 3D choice (2D first) and `paint` the 3D aircraft's paint (Harvard first).
 */
export const DEFAULTS = Object.freeze({
  ...V6_DEFAULT_SETUP,
  ...START_DEFAULTS, // R28: head-on, level, turns at the pass
  energy: false,
  heightScale: 2,
  playbackRate: 1,
  view: VIEW_DEFAULT,
  paint: PAINT_DEFAULT,
  setupOpen: true,
  resultOpen: true,
});

/** The settings that make up a fight; changing one resets it (V6 `reset`, line 4294). */
export const FIGHT_KEYS = Object.freeze(Object.keys({ ...V6_DEFAULT_SETUP, ...START_DEFAULTS }));

/** Values a saved setting may take besides "any number in range" (createSettings `allowed`). */
export const ALLOWED = Object.freeze({
  circles: [1, 2],
  heightScale: [1, 2, 4],
  playbackRate: [0.5, 1, 2, 4],
  view: [...VIEW_ALLOWED],
  paint: PAINT_OPTIONS.map((option) => option.value),
  // R28, Start geometry
  startAtaSide: ['left', 'right'],
  startAaSide: ['left', 'right'],
  turnsAt: ['pass', 'once'],
});

/** The G box's label: plain "G" (the T-6 cannot sustain every G in the box at every speed, so not "Sustained G"). */
export const G_LABEL = 'G';

/** The number boxes' limits (SPEC-turn-fight, "Number boxes"); `step` is V6's arrow step. */
export const RANGES = Object.freeze({
  separationNm: { min: 0.5, max: 10, step: 0.5, unit: 'NM' },
  blueKt: { min: 60, max: 400, step: 5, unit: 'KTAS' },
  redKt: { min: 60, max: 400, step: 5, unit: 'KTAS' },
  blueG: { min: 1.1, max: 9, step: 0.1, unit: 'G' },
  redG: { min: 1.1, max: 9, step: 0.1, unit: 'G' },
  bluePitchDeg: { min: -60, max: 60, step: 1, unit: '°' },
  redPitchDeg: { min: -60, max: 60, step: 1, unit: '°' },
  // R28, Start geometry (SPEC-turn-fight, "The screen")
  startAtaDeg: { min: 0, max: 180, step: 5, unit: '°' },
  startAaDeg: { min: 0, max: 180, step: 5, unit: '°' },
  redAboveFt: { min: -5000, max: 5000, step: 500, unit: 'ft' },
});

/**
 * The setup sim.js's createFight takes, from the settings. A side means nothing at 0° or 180° (dead ahead or
 * astern), so it is taken as 'left' there: flipping it then neither restarts the fight nor changes it (TF3-4).
 */
export function setupFrom(values) {
  const setup = Object.fromEntries(FIGHT_KEYS.map((key) => [key, values[key]]));
  const noSide = (deg) => deg === 0 || deg === 180;
  if (noSide(setup.startAtaDeg)) setup.startAtaSide = 'left';
  if (noSide(setup.startAaDeg)) setup.startAaSide = 'left';
  return setup;
}

/** Changes exactly when the fight would have to start again. */
export function setupKey(values) {
  return JSON.stringify(setupFrom(values));
}

/** What "Reset to V6 defaults" puts back: the fight, Energy and the display settings (paint too), not which columns are open or whether the 3D view is showing. */
export function v6Defaults() {
  const patch = {};
  for (const key of [...FIGHT_KEYS, 'energy', 'heightScale', 'playbackRate', 'paint']) patch[key] = DEFAULTS[key];
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
