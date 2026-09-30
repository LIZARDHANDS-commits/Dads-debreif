// The Turn Fight's remembered settings as plain values, tested in Node
// (SPEC-turn-fight, "The screen"): V6's defaults, the number ranges, and the
// few helpers that turn settings into the fight's setup. No page access.
import { V6_DEFAULT_SETUP } from './sim.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { START_DEFAULTS } from './geometry.js';
import { ENERGY_DEFAULT_SETUP, ENERGY_MOVES, PURSUITS, ENERGY_MAX_START_FT, MPT_KIAS_RANGE } from './energy-sim.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { FT_PER_NM } from '../../core/units.js';

/**
 * Energy mode's settings and their opening values, the engine's own (ENERGY_DEFAULT_SETUP). Two are kept as
 * percentages on screen (the shaker: 94 % of the stall-line G; mid-range throttle: 50 % of maximum thrust), so their
 * keys end in Pct; energySetupFrom turns them back into the engine's fractions.
 */
function energyDefaults() {
  const e = ENERGY_DEFAULT_SETUP;
  return {
    // The first view (with Energy on): start altitude and merge speed for each aircraft.
    blueAltFt: e.blueAltFt, redAltFt: e.redAltFt, blueKias: e.blueKias, redKias: e.redKias,
    // More energy settings.
    blueMove: e.blueMove, redMove: e.redMove, mptKias: e.mptKias, hardDeckFt: e.hardDeckFt,
    pursuit: e.pursuit, chaseAfterHeadOn: e.chaseAfterHeadOn,
    // Model settings for checking (numbers no manual gives).
    stallKias: e.stallKias, shakerPct: Math.round(e.shakerFrac * 100), stallSec: e.stallSec,
    midThrottlePct: Math.round(e.midThrottle * 100), leadSec: e.leadSec, lagSec: e.lagSec,
    rollRateDegPerSec: e.rollRateDegPerSec, pitchBackBank160Deg: e.pitchBackBank160Deg, pitchBackBank220Deg: e.pitchBackBank220Deg,
    immelmannAboveKias: e.immelmannAboveKias, splitSBelowKias: e.splitSBelowKias,
    immelmannOffNoseDeg: e.immelmannOffNoseDeg, immelmannMinTopKias: e.immelmannMinTopKias,
    pickLookaheadSec: e.pickLookaheadSec, deckMarginFt: e.deckMarginFt,
  };
}

/** The settings of Energy's first view, of "More energy settings", and of "Model settings for checking". */
export const ENERGY_FIRST_KEYS = Object.freeze(['blueAltFt', 'redAltFt', 'blueKias', 'redKias']);
export const ENERGY_MORE_KEYS = Object.freeze(['blueMove', 'redMove', 'mptKias', 'hardDeckFt', 'pursuit', 'chaseAfterHeadOn']);
export const ENERGY_CHECK_KEYS = Object.freeze([
  'stallKias', 'shakerPct', 'stallSec', 'midThrottlePct', 'leadSec', 'lagSec', 'rollRateDegPerSec', 'pitchBackBank160Deg',
  'pitchBackBank220Deg', 'immelmannAboveKias', 'splitSBelowKias', 'immelmannOffNoseDeg', 'immelmannMinTopKias', 'pickLookaheadSec', 'deckMarginFt',
]);
/** Every Energy setting, without the checkbox itself. */
export const ENERGY_KEYS = Object.freeze([...ENERGY_FIRST_KEYS, ...ENERGY_MORE_KEYS, ...ENERGY_CHECK_KEYS]);

/**
 * Every setting and its opening value (V6's where V6 had one). The fight's own
 * numbers use the same names as sim.js's setup, so a number box can be bound
 * straight to the setting. `energy` is the Energy (T-6) checkbox; the Energy keys
 * (ENERGY_KEYS) come from the engine's own defaults (energy-sim.js), so the screen
 * and the engine cannot disagree. `setupOpen` and `resultOpen` remember the side columns.
 * `view` is the 2D or 3D choice (2D first) and `paint` the 3D aircraft's paint (Harvard first).
 */
export const DEFAULTS = Object.freeze({
  ...V6_DEFAULT_SETUP,
  ...START_DEFAULTS, // R28: head-on, level, turns at the pass
  energy: false,
  ...energyDefaults(),
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
  // Energy mode (SPEC-turn-fight, "More energy settings")
  blueMove: [...ENERGY_MOVES],
  redMove: [...ENERGY_MOVES],
  pursuit: [...PURSUITS],
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
  // Energy mode. The ranges are the engine's setup checks (energy-sim.js checkedSetup): KIAS 40 to VMO (316), the start
  // altitude up to 25,000 ft (its floor is the hard deck, which no box can know, so energyProblem says it), the shaker,
  // throttle and G fractions above 0 and up to 1, angles 0 to 180°, the look-ahead 0 to 120 s, the deck margin 0 to 10,000 ft.
  // Where the engine only says "above 0" or "a number", the range is a sensible one for a T-6, wide enough to use and narrow
  // enough to stay finite (a test flies every end of every range).
  blueAltFt: { min: 0, max: ENERGY_MAX_START_FT, step: 500, unit: 'ft' },
  redAltFt: { min: 0, max: ENERGY_MAX_START_FT, step: 500, unit: 'ft' },
  blueKias: { min: 40, max: 316, step: 5, unit: 'KIAS' },
  redKias: { min: 40, max: 316, step: 5, unit: 'KIAS' },
  mptKias: { min: MPT_KIAS_RANGE[0], max: MPT_KIAS_RANGE[1], step: 5, unit: 'KIAS' }, // the engine's own range
  hardDeckFt: { min: 0, max: ENERGY_MAX_START_FT, step: 500, unit: 'ft' },
  stallKias: { min: 60, max: 120, step: 1, unit: 'KIAS' },
  shakerPct: { min: 50, max: 100, step: 1, unit: '%' },
  stallSec: { min: 0, max: 5, step: 0.5, unit: 's' },
  midThrottlePct: { min: 10, max: 100, step: 5, unit: '%' },
  leadSec: { min: 0, max: 5, step: 0.5, unit: 's' },
  lagSec: { min: 0, max: 5, step: 0.5, unit: 's' },
  rollRateDegPerSec: { min: 30, max: 180, step: 10, unit: '°/s' },
  pitchBackBank160Deg: { min: 10, max: 90, step: 5, unit: '°' },
  pitchBackBank220Deg: { min: 10, max: 90, step: 5, unit: '°' },
  immelmannAboveKias: { min: 160, max: 316, step: 5, unit: 'KIAS' },
  splitSBelowKias: { min: 40, max: 220, step: 5, unit: 'KIAS' },
  immelmannOffNoseDeg: { min: 0, max: 180, step: 5, unit: '°' },
  immelmannMinTopKias: { min: 0, max: 316, step: 5, unit: 'KIAS' },
  pickLookaheadSec: { min: 0, max: 120, step: 5, unit: 's' },
  deckMarginFt: { min: 0, max: 10000, step: 500, unit: 'ft' },
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

/**
 * The setup Energy mode's engine (energy-sim.js createEnergyFight) takes, from the settings: the start geometry and
 * fight type are shared with the simple fight (a side means nothing at 0° or 180°, as in setupFrom), the altitudes and
 * KIAS are Energy's own, and the percentages become fractions. Only settings that are set here reach the engine; its
 * other keys (the what-if forced G, `none` for the pursuit) keep their defaults.
 */
export function energySetupFrom(values) {
  const start = setupFrom(values);
  return {
    circles: values.circles,
    separationNm: values.separationNm,
    blueAltFt: values.blueAltFt, redAltFt: values.redAltFt,
    blueKias: values.blueKias, redKias: values.redKias,
    ataDeg: start.startAtaDeg, ataSide: start.startAtaSide, aaDeg: start.startAaDeg, aaSide: start.startAaSide,
    turnsStart: values.turnsAt === 'once' ? 'now' : 'pass',
    blueMove: values.blueMove, redMove: values.redMove, mptKias: values.mptKias, hardDeckFt: values.hardDeckFt,
    pursuit: values.pursuit, chaseAfterHeadOn: values.chaseAfterHeadOn,
    stallKias: values.stallKias, shakerFrac: values.shakerPct / 100, stallSec: values.stallSec,
    midThrottle: values.midThrottlePct / 100, leadSec: values.leadSec, lagSec: values.lagSec,
    rollRateDegPerSec: values.rollRateDegPerSec,
    pitchBackBank160Deg: values.pitchBackBank160Deg, pitchBackBank220Deg: values.pitchBackBank220Deg,
    immelmannAboveKias: values.immelmannAboveKias, splitSBelowKias: values.splitSBelowKias,
    immelmannOffNoseDeg: values.immelmannOffNoseDeg, immelmannMinTopKias: values.immelmannMinTopKias,
    pickLookaheadSec: values.pickLookaheadSec, deckMarginFt: values.deckMarginFt,
  };
}

/**
 * The simple fight's setup, with each aircraft's speed as the true airspeed of its Energy merge speed, for the parts of the
 * screen that work out the start from speeds (the pass time, the start picture, which way each turns). Without Energy it
 * is setupFrom.
 */
export function startSetupFrom(values) {
  const setup = setupFrom(values);
  if (!values.energy) return setup;
  return {
    ...setup,
    blueKt: iasToTasKt(values.blueKias, values.blueAltFt),
    redKt: iasToTasKt(values.redKias, values.redAltFt),
  };
}

const feetText = (ft) => Math.round(ft).toLocaleString('en-US');

/**
 * What a box cannot say on its own: an Energy setup the engine would refuse because of two numbers together (its
 * RangeError, worded for the screen), or '' when it is fine. Each start altitude runs from the hard deck to 25,000 ft, and
 * the range (the start separation) must be more than the height between the aircraft. A test holds this to the engine.
 */
export function energyProblem(values) {
  if (!values.energy) return '';
  for (const [who, key] of [['Blue', 'blueAltFt'], ['Red', 'redAltFt']]) {
    const alt = values[key];
    if (alt < values.hardDeckFt || alt > ENERGY_MAX_START_FT) {
      return `${who}'s start altitude (${feetText(alt)} ft) must be from the hard deck (${feetText(values.hardDeckFt)} ft) to ${feetText(ENERGY_MAX_START_FT)} ft.`;
    }
  }
  const between = Math.abs(values.redAltFt - values.blueAltFt);
  if (!(values.separationNm * FT_PER_NM > between)) {
    return `The start separation (${values.separationNm} NM) must be more than the height between the aircraft (${feetText(between)} ft).`;
  }
  return '';
}

/** Changes exactly when the fight would have to start again. Energy mode is a different fight with its own numbers, so with it on the key is Energy's. */
export function setupKey(values) {
  return JSON.stringify(values.energy ? { energy: true, ...energySetupFrom(values) } : setupFrom(values));
}

/** What "Reset to V6 defaults" puts back: the fight, Energy (off, with every Energy setting) and the display settings (paint too), not which columns are open or whether the 3D view is showing. */
export function v6Defaults() {
  const patch = {};
  for (const key of [...FIGHT_KEYS, 'energy', ...ENERGY_KEYS, 'heightScale', 'playbackRate', 'paint']) patch[key] = DEFAULTS[key];
  return patch;
}

/** What "Reset to defaults" in Model settings for checking puts back: just those settings. */
export function checkingDefaults() {
  return Object.fromEntries(ENERGY_CHECK_KEYS.map((key) => [key, DEFAULTS[key]]));
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
