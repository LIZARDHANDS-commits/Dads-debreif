// The Run-in Simulator's settings: every one starts at a default (spec, "Defaults"; every number there is an ESTIMATE until
// Patrick or a manual page gives it, RS-Q2), and the Run list. Plain values only.
//
// Headings and winds are typed in degrees magnetic (house rules; TR-65) and turned to true with the place's variation
// (9° E at Moose Jaw, Patrick's ruling TR-65, held in Traffic's airfield.js; elsewhere it is typed under Place's More).
// Speeds are KIAS. Heights are feet above the ground under the target (AGL) unless a key says MSL.
import { MAG_VARIATION_DEG_E } from '../traffic/airfield.js';
import { TARGETS } from './targets.js';

/**
 * The runs on the Run list, each with its aircraft (aircraft.js) and its load (core DROP_LOADS). The cargo offload waits
 * for the C-130J's performance set (RS-Q1): adding it later is one entry here, { id: 'cargo', aircraft: 'c130j',
 * load: 'a22g12' }, once aircraft.js has the C-130J.
 */
export const RUNS = Object.freeze([
  Object.freeze({ id: 'flyover', label: 'Flyover', aircraft: 'ct156', load: null }),
  Object.freeze({ id: 'bombFlat', label: 'Practice bomb, flat', aircraft: 'ct156', load: 'bdu33' }),
  Object.freeze({ id: 'bombDive', label: 'Practice bomb, dive', aircraft: 'ct156', load: 'bdu33' }),
]);
export const RUN_IDS = Object.freeze(RUNS.map((r) => r.id));
export const runOf = (id) => RUNS.find((r) => r.id === id) ?? RUNS[0];

/**
 * The default place: an open field in the Moose Jaw area, about 3 NM south-east of CYMJ (RS-Q4; an estimate, any open
 * field would do).
 */
export const DEFAULT_PLACE = Object.freeze({ lat: 50.2950, lon: -105.5000, words: 'Moose Jaw area' });

/** The settings each run starts with (the spec's Defaults table; all ESTIMATES, RS-Q2). Changing the Run puts these back. */
export const RUN_DEFAULTS = Object.freeze({
  flyover: Object.freeze({
    target: 'stadium', kias: 250, heightOverTopFt: 1000,
    escapeDir: 'straight', escapeG: 4, escapeBankDeg: 60, escapeTurnDeg: 90, escapeHeightFt: 3000,
  }),
  bombFlat: Object.freeze({
    target: 'range', kias: 220, releaseFt: 1000,
    escapeDir: 'left', escapeG: 4, escapeBankDeg: 60, escapeTurnDeg: 90, escapeHeightFt: 3000,
  }),
  bombDive: Object.freeze({
    target: 'range', kias: 250, releaseFt: 3000, diveDeg: 30,
    escapeDir: 'left', escapeG: 4, escapeBankDeg: 60, escapeTurnDeg: 90, escapeHeightFt: 3000,
  }),
});

/** Every setting and its default. The *ByHand switches are the "set by hand" overrides under More (RS-9). */
export const DEFAULTS = Object.freeze({
  run: 'bombFlat',
  target: 'range',
  targetSizeFt: TARGETS.range.sizeFt,
  targetTurnByHand: false,
  targetHeadingDegM: 320,
  placeLat: DEFAULT_PLACE.lat,
  placeLon: DEFAULT_PLACE.lon,
  placeIsDefault: true,
  magVarDegE: MAG_VARIATION_DEG_E,
  totSec: 360,
  // Orbit
  orbitHeightFt: 3000,
  orbitMode: 'radius',
  orbitRadiusNm: 2,
  orbitBankDeg: 30,
  orbitDir: 'left',
  orbitKias: 200,
  orbitBackNm: 0,
  // Run-in (320°M as the spec's picture; an estimate)
  runInDegM: 320,
  ipNm: 5,
  kias: 220,
  heightOverTopFt: 1000,
  releaseFt: 1000,
  diveDeg: 30,
  // Release
  releaseMode: 'carp',
  releaseDistFt: 1500,
  // Worked out to hit unless set by hand (RS-9)
  aimOffByHand: false,
  aimOffFt: 0,
  rollInByHand: false,
  rollInFt: 6000,
  rollInKiasByHand: false,
  rollInKias: 200,
  exitByHand: false,
  exitSec: 120,
  // Escape
  escapeDir: 'left',
  escapeG: 4,
  escapeBankDeg: 60,
  escapeTurnDeg: 90,
  escapeHeightFt: 3000,
  // Wind and temperature (RS-7): at the release height (the flyover's height) and at the ground, straight between
  windTopDegM: 270,
  windTopKt: 0,
  windGroundDegM: 270,
  windGroundKt: 0,
  tempDevC: 0,
  planWindOn: false,
  planTopDegM: 270,
  planTopKt: 0,
  planGroundDegM: 270,
  planGroundKt: 0,
  // Display
  showLines: true,
  showCarp: true,
  showTrails: true,
  showFlags: true,
  // The bar
  camera: 'chase',
  playSpeed: 4,
});

export const CAMERAS = Object.freeze([
  Object.freeze({ id: 'chase', label: 'Chase' }),
  Object.freeze({ id: 'cockpit', label: 'Cockpit' }),
  Object.freeze({ id: 'target', label: 'Target' }),
  Object.freeze({ id: 'overhead', label: 'Overhead' }),
  Object.freeze({ id: 'side', label: 'Side' }),
]);
export const PLAY_SPEEDS = Object.freeze([1, 2, 4, 8]);

export const ALLOWED = Object.freeze({
  run: RUN_IDS,
  target: Object.keys(TARGETS),
  orbitMode: ['radius', 'bank'],
  orbitDir: ['left', 'right'],
  releaseMode: ['carp', 'distance'],
  escapeDir: ['left', 'right', 'straight'],
  camera: CAMERAS.map((c) => c.id),
  playSpeed: PLAY_SPEEDS,
});

/** The number boxes' ranges: room for any sensible pass, not limits on the flying (estimates for the boxes). */
export const RANGES = Object.freeze({
  totSec: { min: 0, max: 3600, step: 5 },
  orbitHeightFt: { min: 200, max: 25000, step: 100 },
  orbitRadiusNm: { min: 0.5, max: 10, step: 0.1 },
  orbitBankDeg: { min: 5, max: 75, step: 1 },
  orbitKias: { min: 100, max: 316, step: 5 },
  orbitBackNm: { min: 0, max: 20, step: 0.1 },
  runInDegM: { min: 0, max: 360, step: 1 },
  ipNm: { min: 1, max: 20, step: 0.1 },
  kias: { min: 100, max: 316, step: 5 },
  heightOverTopFt: { min: 100, max: 10000, step: 50 },
  releaseFt: { min: 100, max: 15000, step: 50 },
  diveDeg: { min: 5, max: 60, step: 1 },
  releaseDistFt: { min: 0, max: 30000, step: 50 },
  aimOffFt: { min: -10000, max: 10000, step: 10 },
  rollInFt: { min: 500, max: 20000, step: 50 },
  rollInKias: { min: 100, max: 316, step: 5 },
  exitSec: { min: 0, max: 3600, step: 1 },
  escapeG: { min: 1.5, max: 9, step: 0.1 },
  escapeBankDeg: { min: 0, max: 90, step: 5 },
  escapeTurnDeg: { min: 0, max: 270, step: 5 },
  escapeHeightFt: { min: 200, max: 25000, step: 100 },
  windDeg: { min: 0, max: 360, step: 5 },
  windKt: { min: 0, max: 100, step: 1 },
  tempDevC: { min: -40, max: 40, step: 1 },
  targetSizeFt: { min: 20, max: 5000, step: 10 },
  targetHeadingDegM: { min: 0, max: 360, step: 1 },
  magVarDegE: { min: -40, max: 40, step: 1 },
  placeLat: { min: -85, max: 85, step: 0.0001 },
  placeLon: { min: -180, max: 180, step: 0.0001 },
});

/** The patch that changing the Run applies: that run's defaults, and its target's default size. */
export function runPatch(runId) {
  const d = RUN_DEFAULTS[runId] ?? RUN_DEFAULTS.bombFlat;
  return { run: runId, ...d, targetSizeFt: TARGETS[d.target].sizeFt };
}

/** Compass degrees magnetic to true at a variation (east positive), 0 up to 360. */
export const magToTrue = (degM, varE) => (((degM + varE) % 360) + 360) % 360;

/**
 * The engine's setup (pass.js) from the settings: headings and winds in true, everything else as typed. The engine
 * never reads a box: only this.
 */
export function setupFrom(v) {
  const run = runOf(v.run);
  const t = (deg) => magToTrue(deg, v.magVarDegE);
  return {
    run: run.id,
    aircraftId: run.aircraft,
    loadId: run.load,
    target: { id: v.target, sizeFt: v.targetSizeFt, headingDegT: t(v.targetTurnByHand ? v.targetHeadingDegM : v.runInDegM) },
    trackDegT: t(v.runInDegM),
    totSec: v.totSec,
    orbit: {
      heightFt: v.orbitHeightFt, mode: v.orbitMode, radiusNm: v.orbitRadiusNm, bankDeg: v.orbitBankDeg,
      dir: v.orbitDir === 'left' ? -1 : 1, kias: v.orbitKias, backNm: v.orbitBackNm,
    },
    ipNm: v.ipNm,
    kias: v.kias,
    heightOverTopFt: v.heightOverTopFt,
    releaseFt: v.releaseFt,
    diveDeg: v.diveDeg,
    release: { mode: v.releaseMode, distFt: v.releaseDistFt },
    byHand: {
      aimOffFt: v.aimOffByHand ? v.aimOffFt : null,
      rollInFt: v.rollInByHand ? v.rollInFt : null,
      rollInKias: v.rollInKiasByHand ? v.rollInKias : null,
      exitSec: v.exitByHand ? v.exitSec : null,
    },
    escape: { dir: v.escapeDir, g: v.escapeG, bankDeg: v.escapeBankDeg, turnDeg: v.escapeTurnDeg, heightFt: v.escapeHeightFt },
    wind: { topDegT: t(v.windTopDegM), topKt: v.windTopKt, groundDegT: t(v.windGroundDegM), groundKt: v.windGroundKt },
    planWind: v.planWindOn
      ? { topDegT: t(v.planTopDegM), topKt: v.planTopKt, groundDegT: t(v.planGroundDegM), groundKt: v.planGroundKt }
      : null,
    tempDevC: v.tempDevC,
  };
}
