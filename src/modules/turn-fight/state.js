// The Turn Fight's remembered settings as plain values, tested in Node
// (SPEC-turn-fight, "The screen"): V6's defaults, the number ranges, and the
// few helpers that turn settings into the fight's setup. No page access.
import { V6_DEFAULT_SETUP } from './sim.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { START_DEFAULTS as GEOMETRY_START_DEFAULTS } from './geometry.js';
import { ENERGY_DEFAULT_SETUP, ENERGY_MOVES, PURSUITS, ENERGY_MAX_START_FT, MPT_KIAS_RANGE, energyTopKias } from './energy-sim.js';
import { iasToTasKt, maxKiasT6A, T6A_LIMITS } from '../../core/t6-performance.js';
import { FT_PER_NM } from '../../core/units.js';

/**
 * Tactical start defaults for the Turn Fight state (Task 24 re-baseline).
 * Authentic 750 ft lateral turning room offset corresponds to 5° ATA.
 */
export const START_DEFAULTS = Object.freeze({
  ...GEOMETRY_START_DEFAULTS,
  startAtaDeg: 5,
});

/**
 * 5 canonical tactical engagement presets (Task 24).
 */
export const TACTICAL_PRESETS = Object.freeze({
  'neutral-merge': Object.freeze({
    name: 'Neutral High-Aspect Merge (Default)',
    separationNm: 1.2,
    startAtaDeg: 5,
    startAaDeg: 175,
    startAtaSide: 'left',
    startAaSide: 'left',
    blueKt: 250,
    redKt: 250,
    blueKias: 250,
    redKias: 250,
    blueAltFt: 10000,
    redAltFt: 10000,
    redAboveFt: 0,
    circles: 2,
  }),
  'offensive-perch': Object.freeze({
    name: 'Offensive Perch (Blue Advantage)',
    separationNm: 1.0,
    startAtaDeg: 0,
    startAaDeg: 30,
    startAtaSide: 'left',
    startAaSide: 'left',
    blueKt: 220,
    redKt: 180,
    blueKias: 220,
    redKias: 180,
    blueAltFt: 11000,
    redAltFt: 10000,
    redAboveFt: -1000,
    circles: 2,
  }),
  'defensive-break': Object.freeze({
    name: 'Defensive Break (Red Locked on Six)',
    separationNm: 0.5,
    startAtaDeg: 150,
    startAaDeg: 15,
    startAtaSide: 'left',
    startAaSide: 'left',
    blueKt: 180,
    redKt: 240,
    blueKias: 180,
    redKias: 240,
    blueAltFt: 9500,
    redAltFt: 10000,
    redAboveFt: 500,
    circles: 2,
  }),
  'energy-vs-angles': Object.freeze({
    name: 'Energy vs Angles (High vs Low)',
    separationNm: 1.2,
    startAtaDeg: 15,
    startAaDeg: 165,
    startAtaSide: 'left',
    startAaSide: 'left',
    blueKt: 280,
    redKt: 160,
    blueKias: 280,
    redKias: 160,
    blueAltFt: 14000,
    redAltFt: 10000,
    redAboveFt: -4000,
    circles: 2,
  }),
  'radius-vs-rate': Object.freeze({
    name: 'Radius vs Rate (1-Circle vs 2-Circle)',
    separationNm: 1.0,
    startAtaDeg: 10,
    startAaDeg: 170,
    startAtaSide: 'left',
    startAaSide: 'left',
    blueKt: 240,
    redKt: 240,
    blueKias: 240,
    redKias: 240,
    blueAltFt: 10000,
    redAltFt: 10000,
    redAboveFt: 0,
    circles: 1,
  }),
});

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
    blueMove: 'auto', redMove: 'auto', mptKias: e.mptKias, hardDeckFt: e.hardDeckFt,
    pursuit: e.pursuit, chaseAfterHeadOn: e.chaseAfterHeadOn,
    collisionDetection: e.collisionDetection, collisionAvoidance: e.collisionAvoidance,
    // Model settings for checking (numbers no manual gives).
    stallKias: e.stallKias, shakerPct: Math.round(e.shakerFrac * 100), stallSec: e.stallSec,
    midThrottlePct: Math.round(e.midThrottle * 100), leadSec: e.leadSec, lagSec: e.lagSec,
    rollRateDegPerSec: e.rollRateDegPerSec, gOnsetGPerSec: e.gOnsetGPerSec, rollAccelDegPerSec2: e.rollAccelDegPerSec2,
    pitchBackBank160Deg: e.pitchBackBank160Deg, pitchBackBank220Deg: e.pitchBackBank220Deg,
    immelmannAboveKias: e.immelmannAboveKias, splitSBelowKias: e.splitSBelowKias,
    immelmannOffNoseDeg: e.immelmannOffNoseDeg, immelmannMinTopKias: e.immelmannMinTopKias,
    pickLookaheadSec: e.pickLookaheadSec, deckMarginFt: e.deckMarginFt,
    tacticalLookaheadSec: e.tacticalLookaheadSec ?? 20, smartDecisionSec: e.smartDecisionSec,
  };
}

/** The settings of Energy's first view, of "More energy settings", and of "Model settings for checking". */
export const ENERGY_FIRST_KEYS = Object.freeze(['blueAltFt', 'redAltFt', 'blueKias', 'redKias']);
export const ENERGY_MORE_KEYS = Object.freeze(['blueMove', 'redMove', 'mptKias', 'hardDeckFt', 'pursuit', 'chaseAfterHeadOn', 'collisionDetection', 'collisionAvoidance']);
export const ENERGY_CHECK_KEYS = Object.freeze([
  'stallKias', 'shakerPct', 'stallSec', 'midThrottlePct', 'leadSec', 'lagSec', 'rollRateDegPerSec', 'gOnsetGPerSec', 'rollAccelDegPerSec2', 'pitchBackBank160Deg',
  'pitchBackBank220Deg', 'immelmannAboveKias', 'splitSBelowKias', 'immelmannOffNoseDeg', 'immelmannMinTopKias', 'pickLookaheadSec', 'deckMarginFt',
  'tacticalLookaheadSec', 'smartDecisionSec',
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
  separationNm: 1.2,
  ...START_DEFAULTS, // R28: head-on, level, turns at the pass
  energy: true,
  ...energyDefaults(),
  heightScale: 2,
  playbackRate: 1,
  dataTags: true,
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
  // 'tactical' is the old name of Smart: the engine still takes it, a saved one falls back to Smart ('auto').
  blueMove: ENERGY_MOVES.filter((m) => m !== 'tactical'),
  redMove: ENERGY_MOVES.filter((m) => m !== 'tactical'),
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
  separationNm: { min: 0.5, max: 10, step: 0.1, unit: 'NM' },
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
  gOnsetGPerSec: { min: 0, max: 20, step: 1, unit: 'G/s' }, // 0 turns it off
  rollAccelDegPerSec2: { min: 0, max: 1000, step: 20, unit: '°/s²' }, // 0 turns it off
  pitchBackBank160Deg: { min: 10, max: 90, step: 5, unit: '°' },
  pitchBackBank220Deg: { min: 10, max: 90, step: 5, unit: '°' },
  immelmannAboveKias: { min: 160, max: 316, step: 5, unit: 'KIAS' },
  splitSBelowKias: { min: 40, max: 220, step: 5, unit: 'KIAS' },
  immelmannOffNoseDeg: { min: 0, max: 180, step: 5, unit: '°' },
  immelmannMinTopKias: { min: 0, max: 316, step: 5, unit: 'KIAS' },
  pickLookaheadSec: { min: 0, max: 120, step: 5, unit: 's' },
  deckMarginFt: { min: 0, max: 10000, step: 500, unit: 'ft' },
  tacticalLookaheadSec: { min: 10, max: 45, step: 1, unit: 's' },
  smartDecisionSec: { min: 0, max: 2, step: 0.1, unit: 's' },
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
    ataDeg: values.ataDeg ?? start.startAtaDeg,
    ataSide: values.ataSide ?? start.startAtaSide,
    aaDeg: values.aaDeg ?? start.startAaDeg,
    aaSide: values.aaSide ?? start.startAaSide,
    turnsStart: values.turnsStart ?? (values.turnsAt === 'once' ? 'now' : 'pass'),
    blueMove: values.blueMove, redMove: values.redMove, mptKias: values.mptKias, hardDeckFt: values.hardDeckFt,
    pursuit: values.pursuit, chaseAfterHeadOn: values.chaseAfterHeadOn,
    collisionDetection: values.collisionDetection !== false, collisionAvoidance: values.collisionAvoidance !== false,
    stallKias: values.stallKias,
    shakerFrac: values.shakerPct !== undefined ? values.shakerPct / 100 : (values.shakerFrac ?? 0.94),
    stallSec: values.stallSec,
    midThrottle: values.midThrottlePct !== undefined ? values.midThrottlePct / 100 : (values.midThrottle ?? 0.5),
    leadSec: values.leadSec, lagSec: values.lagSec,
    rollRateDegPerSec: values.rollRateDegPerSec,
    gOnsetGPerSec: values.gOnsetGPerSec, rollAccelDegPerSec2: values.rollAccelDegPerSec2,
    pitchBackBank160Deg: values.pitchBackBank160Deg, pitchBackBank220Deg: values.pitchBackBank220Deg,
    immelmannAboveKias: values.immelmannAboveKias, splitSBelowKias: values.splitSBelowKias,
    immelmannOffNoseDeg: values.immelmannOffNoseDeg, immelmannMinTopKias: values.immelmannMinTopKias,
    pickLookaheadSec: values.pickLookaheadSec, deckMarginFt: values.deckMarginFt,
    tacticalLookaheadSec: values.tacticalLookaheadSec, smartDecisionSec: values.smartDecisionSec,
  };
}

/**
 * Adapts an Energy setup (ataDeg, aaDeg, turnsStart) to Simple setup keys (startAtaDeg, startAaDeg, turnsAt).
 */
export function simpleSetupFromEnergy(energySetup) {
  return {
    ...energySetup,
    startAtaDeg: energySetup.ataDeg ?? energySetup.startAtaDeg,
    startAtaSide: energySetup.ataSide ?? energySetup.startAtaSide,
    startAaDeg: energySetup.aaDeg ?? energySetup.startAaDeg,
    startAaSide: energySetup.aaSide ?? energySetup.startAaSide,
    turnsAt: energySetup.turnsStart ? (energySetup.turnsStart === 'now' ? 'once' : 'pass') : energySetup.turnsAt,
  };
}

/**
 * The simple fight's setup, with each aircraft's speed as the true airspeed of its Energy merge speed, for the parts of the
 * screen that work out the start from speeds (the pass time, the start picture, which way each turns). Without Energy it
 * is setupFrom. While the Energy start cannot fly (energyProblem) these are the settings the fight flies
 * (usableEnergyValues), so the pass and the picture show what is flown.
 */
export function startSetupFrom(values) {
  const usable = usableEnergyValues(values);
  const setup = setupFrom(usable);
  if (!values.energy) return setup;
  return {
    ...setup,
    blueKt: iasToTasKt(usable.blueKias, usable.blueAltFt),
    redKt: iasToTasKt(usable.redKias, usable.redAltFt),
  };
}

const feetText = (ft) => Math.round(ft).toLocaleString('en-US');

/**
 * The top merge speed at a height, in KIAS: the one place the screen asks (the box's own range stops at VMO, and this is the
 * limit at each height). It has to be the number the engine compares a merge speed with.
 */
export function topKiasAt(altFt) {
  const exact = energyTopKias(altFt);
  return exact >= T6A_LIMITS.vmoKias ? T6A_LIMITS.vmoKias : Math.floor(exact);
}

/**
 * What a box cannot say on its own: an Energy setup the engine would refuse because of numbers together (its RangeError,
 * worded for the screen), or '' when it is fine. Each start altitude runs from the hard deck to 25,000 ft; each merge speed
 * is at most the top speed at that altitude (topKiasAt, taken to the whole knot as the engine does); and the start
 * separation must be more than the height between the aircraft. The engine's checks in the engine's order; a test holds
 * this to the engine.
 */
export function energyProblem(values) {
  if (!values.energy) return '';
  for (const [who, key] of [['Blue', 'blueAltFt'], ['Red', 'redAltFt']]) {
    const alt = values[key];
    if (alt < values.hardDeckFt || alt > ENERGY_MAX_START_FT) {
      return `${who}'s start altitude (${feetText(alt)} ft) must be from the hard deck (${feetText(values.hardDeckFt)} ft) to ${feetText(ENERGY_MAX_START_FT)} ft.`;
    }
  }
  for (const [who, kiasKey, altKey] of [['Blue', 'blueKias', 'blueAltFt'], ['Red', 'redKias', 'redAltFt']]) {
    const limit = topKiasAt(values[altKey]);
    if (values[kiasKey] > limit) {
      const vmoGoverns = limit >= T6A_LIMITS.vmoKias;
      const nfmKias = Math.round(maxKiasT6A(values[altKey]));
      const limitText = vmoGoverns ? 'VMO'
        : `Mach ${T6A_LIMITS.mmo}${nfmKias < T6A_LIMITS.vmoKias ? `; the NFM's ${nfmKias} is the same Mach on the gauge` : ''}`;
      return `${who}'s merge speed (${values[kiasKey]} KIAS) is above the T-6A's limit at ${feetText(values[altKey])} ft (${limit} KIAS, ${limitText}).`;
    }
  }
  const between = Math.abs(values.redAltFt - values.blueAltFt);
  if (!(values.separationNm * FT_PER_NM > between)) {
    return `The start separation (${values.separationNm} NM) must be more than the height between the aircraft (${feetText(between)} ft).`;
  }
  return '';
}

/** The settings a start that cannot fly puts back to their defaults while it cannot: every one energyProblem's checks read. */
export const START_FALLBACK_KEYS = Object.freeze(['blueAltFt', 'redAltFt', 'blueKias', 'redKias', 'hardDeckFt', 'separationNm']);

const startFallbacks = () => Object.fromEntries(START_FALLBACK_KEYS.map((key) => [key, DEFAULTS[key]]));

/** The settings the Energy fight flies: the person's, or, with a problem in energyProblem, those with the START_FALLBACK_KEYS at their defaults. */
export function usableEnergyValues(values) {
  return values.energy && energyProblem(values) ? { ...values, ...startFallbacks() } : values;
}

/**
 * The line beside the boxes when the start cannot fly: the reason, then every setting the fight uses instead, with its
 * value. '' when there is no reason. The reason is energyProblem's, or the engine's own message for a problem found
 * some other way.
 */
export function energyProblemNote(values, reason = energyProblem(values)) {
  if (!reason) return '';
  const d = startFallbacks();
  return `${reason} Until this is fixed the fight flies the default start altitudes (${feetText(d.blueAltFt)} ft), merge speeds (${d.blueKias} KIAS), hard deck (${feetText(d.hardDeckFt)} ft) and separation (${d.separationNm} NM).`;
}

/** The start of every message the engine's own setup checks raise (energy-sim.js need()): only these are the engine refusing a setup. */
export const ENGINE_SETUP_PREFIX = 'Turn Fight energy setup: ';

/** Whether an error is the engine refusing a setup (a RangeError with the engine's setup prefix), and not some other fault. */
export function isSetupError(error) {
  return error instanceof RangeError && typeof error.message === 'string' && error.message.startsWith(ENGINE_SETUP_PREFIX);
}

// What the screen calls the settings the engine names by key, for its refusals.
const KEY_WORDS = Object.freeze({
  blueAltFt: "Blue's start altitude", redAltFt: "Red's start altitude", blueKias: "Blue's merge speed", redKias: "Red's merge speed",
  blueMove: "Blue's move", redMove: "Red's move", mptKias: 'The MPT speed', hardDeckFt: 'The hard deck', pursuit: 'The pursuit',
  chaseAfterHeadOn: 'Chase after a head-on pass', collisionDetection: 'Collision detection', collisionAvoidance: 'Collision avoidance', separationNm: 'The start separation', stallKias: 'The stall speed',
  shakerFrac: 'The shaker', midThrottle: 'The mid-range throttle', rollRateDegPerSec: 'The roll rate',
  gOnsetGPerSec: 'The G onset', rollAccelDegPerSec2: 'The roll acceleration',
  immelmannAboveKias: 'The Immelmann speed', splitSBelowKias: 'The split S speed', immelmannOffNoseDeg: 'The Immelmann off-nose angle',
  immelmannMinTopKias: 'The lowest Immelmann top speed', pickLookaheadSec: 'The look-ahead', deckMarginFt: 'The deck margin',
  tacticalLookaheadSec: 'The Smart look-ahead', smartDecisionSec: 'The Smart decision time',
  stallSec: 'How long a stall lasts', ataDeg: 'The off-nose angle', aaDeg: 'The aspect angle', circles: 'The fight type', turnsStart: 'The turns',
});

/**
 * The engine's refusal in words for the screen: its message without the prefix, the setting's key name (a name like
 * "mptKias", never shown) put as the words for it, and ", got 110" as "(it was 110)". "The MPT speed is from 120 to 175 KIAS (it was 110)."
 */
export function setupErrorText(error) {
  const message = String(error?.message ?? '').slice(ENGINE_SETUP_PREFIX.length);
  const [, what, got] = /^(.*?)(?:, got (.*))?$/s.exec(message);
  const first = /^([A-Za-z][A-Za-z0-9]*)\b/.exec(what)?.[1] ?? '';
  const words = KEY_WORDS[first] ?? (/[a-z][A-Z]/.test(first) ? first.replace(/([A-Z])/g, ' $1').toLowerCase() : first);
  const sentence = `${words}${what.slice(first.length)}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}${got !== undefined ? ` (it was ${got})` : ''}.`;
}

/** Every Energy setting and the start settings at their defaults, over the person's other ones: what flies when the engine refuses what the screen thought was fine. */
export function energyDefaultValues(values) {
  return { ...values, ...Object.fromEntries([...ENERGY_KEYS, ...START_FALLBACK_KEYS].map((key) => [key, DEFAULTS[key]])) };
}

/**
 * Starts an Energy fight from the settings with `create(engineSetup)` (playback.js createEnergyRun). The settings as they are,
 * or the default start when energyProblem finds one; and if the engine still refuses the setup (its own RangeError, which a
 * check here did not foresee), the engine's message in words and every Energy setting at its default, so a refusal never
 * leaves the screen blank. Any other error is a fault: logged, and thrown again. Returns { run, note, flown }: the run, the
 * words for beside the boxes ('' for none) and the settings actually flown, which the start picture and the pass line use.
 */
export function startEnergyRun(values, create) {
  let flown = usableEnergyValues(values);
  try {
    return { run: create(energySetupFrom(flown)), note: energyProblemNote(values), flown };
  } catch (error) {
    if (!isSetupError(error)) {
      console.error('Turn Fight Energy could not start:', error);
      throw error;
    }
    flown = energyDefaultValues(values);
    const note = `${setupErrorText(error)} Until this is fixed every Energy setting is at its default.`;
    return { run: create(energySetupFrom(flown)), note, flown };
  }
}

/** Changes exactly when the fight would have to start again. Energy mode is a different fight with its own numbers, so with it on the key is Energy's. */
export function setupKey(values) {
  return JSON.stringify(values.energy ? { energy: true, ...energySetupFrom(values) } : setupFrom(values));
}

/** What "Reset to Standard Defaults" (D384) puts back: the fight, Energy (on, with every Energy setting) and the display settings (paint too), not which columns are open or whether the 3D view is showing. */
export function standardDefaults() {
  const patch = {};
  for (const key of [...FIGHT_KEYS, 'energy', ...ENERGY_KEYS, 'heightScale', 'playbackRate', 'dataTags', 'paint']) patch[key] = DEFAULTS[key];
  return patch;
}

export const v6Defaults = standardDefaults;

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
