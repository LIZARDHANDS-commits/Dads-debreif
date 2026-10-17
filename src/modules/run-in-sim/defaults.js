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
  // Air refuelling (RS-15 to RS-22): approved, Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'). The CT-156
  // is the stand-in receiver; the KC-130J tanker is a picture with no performance set (RS-Q1). refuel.js flies it.
  Object.freeze({ id: 'aar', label: 'Air refuelling, point-parallel', aircraft: 'ct156', load: null, tanker: 'kc130j' }),
]);
export const RUN_IDS = Object.freeze(RUNS.map((r) => r.id));
export const runOf = (id) => RUNS.find((r) => r.id === id) ?? RUNS[0];

/**
 * The default place: an open field in the Moose Jaw area, about 3 NM south-east of CYMJ (RS-Q4; an estimate, any open
 * field would do).
 */
export const DEFAULT_PLACE = Object.freeze({ lat: 50.2950, lon: -105.5000, words: 'Moose Jaw area' });
/**
 * The air refuelling run's default place, the tanker's roll-out point (RS-19): 32 NM from CYMJ along the default
 * refuelling track (320°M, 329°T), so the take-off, the climb-out and the transit to the IP point the way the receiver
 * flies (an estimate; open prairie north-west of Moose Jaw). Worked from CYMJ's origin (src/airfields/cymj-runways.js)
 * with core geo.js.
 */
export const AAR_PLACE = Object.freeze({ lat: 50.7871, lon: -105.9892, words: '32 NM NNW of Moose Jaw' });
/** The default place for a run. */
export const placeFor = (runId) => (runId === 'aar' ? AAR_PLACE : DEFAULT_PLACE);

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
    target: 'range', kias: 200, releaseFt: 3000, diveDeg: 30, // kias: the roll-in speed (diveSpeedAtRelease off)
    escapeDir: 'left', escapeG: 4, escapeBankDeg: 60, escapeTurnDeg: 90, escapeHeightFt: 3000,
  }),
});

/**
 * The air refuelling run's settings (spec "Air refuelling", "Defaults for this run"): every one an ESTIMATE until Patrick
 * or a manual page gives it (ATP-56 not read). Heights are ft MSL here (flown on the altimeter); speeds KIAS. Picking the
 * run puts these back (runPatch).
 */
export const AAR_DEFAULTS = Object.freeze({
  aarTrackDegM: 320, // the refuelling track, the receiver's (the run-in's default heading)
  aarHeightFt: 10000, // the tanker's height, MSL: inside the stand-in's speeds (the T-6A set holds 200 to about 250 KIAS level there)
  aarTankerKias: 200,
  aarBankDeg: 25, // the tanker's bank in its turns
  aarLegNm: 20, // the anchor's legs
  aarDir: 'left', // the anchor's turns
  aarRvSec: 180, // the rendezvous time: the tanker's roll-out, s after the start (short to watch)
  aarSplitFt: 1000, // the receiver below the tanker for the rendezvous
  aarTrailNm: 1, // the trail at the roll-out (air-refuelling-plan.md)
  aarOvertakeKt: 20, // the overtake on the join, and so the receiver's rendezvous speed over the tanker's
  aarPreContactFt: 15, // pre-contact: the receiver's nose this far behind the left basket
  // RS-19: the receiver takes off from CYMJ and meets at the IP (on the track, this far back from the roll-out point);
  // the airborne start of the first version under More.
  aarAirborne: false,
  aarIpNm: 15,
  // RS-20: the offset, two turn radii unless set by hand
  aarOffsetByHand: false,
  aarOffsetNm: 3.4, // the hand box starts near the worked-out two turn radii (3.4 NM at the defaults)
  // Worked out to hit unless set by hand (RS-16)
  aarTurnRangeByHand: false,
  aarTurnRangeNm: 7.5,
  aarRcvKiasByHand: false,
  aarRcvKias: 220,
});

/** Every setting and its default. The *ByHand switches are the "set by hand" overrides under More (RS-9). */
export const DEFAULTS = Object.freeze({
  run: 'bombFlat',
  target: 'range',
  targetSizeFt: TARGETS.range.sizeFt,
  // The target's own heading (RS-12): 050°M puts the bridge and the stadium square to the default 320°M run-in (an
  // estimate). The run-in heading never turns it.
  targetHeadingDegM: 50,
  placeLat: DEFAULT_PLACE.lat,
  placeLon: DEFAULT_PLACE.lon,
  placeIsDefault: true,
  magVarDegE: MAG_VARIATION_DEG_E,
  totSec: 360,
  // Orbit (RS-11): a holding pattern (the default), a figure 8 or the circle of the first version. The holding pattern's
  // legs are 1 minute (the standard holding leg below 14,000 ft, a reference; an estimate here) and its turns, like the
  // figure 8's, at 30° bank (an estimate). orbitBankDeg is also the circle's steady bank when flown as Bank.
  orbitPattern: 'hold',
  holdLegSec: 60,
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
  // The dive's speed box sets the roll-in speed and the release speed is what the dive gives (Dad's pick, 16 Oct 2026,
  // option (a) on PR #1062; to confirm with Patrick); on, it sets the speed at release and the roll-in speed is worked out.
  diveSpeedAtRelease: false,
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
  // Air refuelling (RS-15 to RS-22, approved)
  ...AAR_DEFAULTS,
  // Display
  showLines: true,
  showCarp: true,
  showTrails: true,
  showFlags: true,
  // The view (RS-13): the 3D view, or the 2D plan and profile; the profile shows the release to the impact (near), close
  // round the target (target) or the whole run-in (whole).
  viewMode: '3d',
  profileZoom: 'near',
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
  // The air refuelling run's own two (RS-18, AAR_CAMERAS); they show only on that run.
  Object.freeze({ id: 'tanker', label: 'From the tanker' }),
  Object.freeze({ id: 'drogue', label: 'Behind the drogue' }),
]);
/** The cameras only the air refuelling run has (RS-18). */
export const AAR_CAMERAS = Object.freeze(['tanker', 'drogue']);
export const PLAY_SPEEDS = Object.freeze([1, 2, 4, 8]);

export const ALLOWED = Object.freeze({
  run: [...RUN_IDS],
  target: Object.keys(TARGETS),
  orbitPattern: ['hold', 'eight', 'circle'],
  orbitMode: ['radius', 'bank'],
  orbitDir: ['left', 'right'],
  releaseMode: ['carp', 'distance'],
  escapeDir: ['left', 'right', 'straight'],
  aarDir: ['left', 'right'],
  camera: CAMERAS.map((c) => c.id),
  playSpeed: [...PLAY_SPEEDS],
  viewMode: ['3d', '2d'],
  profileZoom: ['target', 'near', 'whole'],
});

/** The number boxes' ranges: room for any sensible pass, not limits on the flying (estimates for the boxes). */
export const RANGES = Object.freeze({
  totSec: { min: 0, max: 3600, step: 5 },
  orbitHeightFt: { min: 200, max: 25000, step: 100 },
  orbitRadiusNm: { min: 0.5, max: 10, step: 0.1 },
  orbitBankDeg: { min: 5, max: 75, step: 1 },
  holdLegSec: { min: 15, max: 300, step: 5 },
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
  aarTrackDegM: { min: 0, max: 360, step: 1 },
  aarHeightFt: { min: 1000, max: 25000, step: 500 },
  aarTankerKias: { min: 120, max: 300, step: 5 },
  aarBankDeg: { min: 10, max: 45, step: 1 },
  aarLegNm: { min: 5, max: 60, step: 1 },
  aarRvSec: { min: 30, max: 3600, step: 5 },
  aarSplitFt: { min: 0, max: 3000, step: 100 },
  aarTrailNm: { min: 0.2, max: 5, step: 0.1 },
  aarOvertakeKt: { min: 2, max: 60, step: 1 },
  aarPreContactFt: { min: 5, max: 100, step: 1 },
  aarTurnRangeNm: { min: 1, max: 40, step: 0.1 },
  aarRcvKias: { min: 120, max: 316, step: 5 },
  aarIpNm: { min: 2, max: 60, step: 0.5 },
  aarOffsetNm: { min: 0.2, max: 15, step: 0.1 },
});

/**
 * The patch that changing the Run applies: that run's defaults, and its target's default size. While the place is still a
 * default (v.placeIsDefault), the run's own default place comes with it (RS-19: the refuelling run's is 32 NM NNW of CYMJ).
 */
export function runPatch(runId, v = DEFAULTS) {
  const place = v.placeIsDefault ? { placeLat: placeFor(runId).lat, placeLon: placeFor(runId).lon } : {};
  if (runId === 'aar') return { run: runId, ...AAR_DEFAULTS, ...place };
  const d = RUN_DEFAULTS[runId] ?? RUN_DEFAULTS.bombFlat;
  return { run: runId, ...d, targetSizeFt: TARGETS[d.target].sizeFt, ...place };
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
    target: { id: v.target, sizeFt: v.targetSizeFt, headingDegT: t(v.targetHeadingDegM) },
    trackDegT: t(v.runInDegM),
    totSec: v.totSec,
    orbit: {
      pattern: v.orbitPattern, legSec: v.holdLegSec,
      heightFt: v.orbitHeightFt, mode: v.orbitMode, radiusNm: v.orbitRadiusNm, bankDeg: v.orbitBankDeg,
      dir: v.orbitDir === 'left' ? -1 : 1, kias: v.orbitKias, backNm: v.orbitBackNm,
    },
    ipNm: v.ipNm,
    kias: v.kias,
    heightOverTopFt: v.heightOverTopFt,
    releaseFt: v.releaseFt,
    diveDeg: v.diveDeg,
    diveSpeedAt: v.diveSpeedAtRelease ? 'release' : 'rollIn',
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
    // The air refuelling run's own (refuel.js), only on that run.
    aar: run.id === 'aar' ? {
      trackDegT: t(v.aarTrackDegM), heightFt: v.aarHeightFt, tankerKias: v.aarTankerKias, bankDeg: v.aarBankDeg,
      legNm: v.aarLegNm, dir: v.aarDir === 'left' ? -1 : 1, rvSec: v.aarRvSec, splitFt: v.aarSplitFt,
      trailNm: v.aarTrailNm, overtakeKt: v.aarOvertakeKt, preContactFt: v.aarPreContactFt,
      start: v.aarAirborne ? 'airborne' : 'takeoff', ipNm: v.aarIpNm, placeLat: v.placeLat, placeLon: v.placeLon, magVarDegE: v.magVarDegE,
      byHand: {
        turnRangeNm: v.aarTurnRangeByHand ? v.aarTurnRangeNm : null, rcvKias: v.aarRcvKiasByHand ? v.aarRcvKias : null,
        offsetNm: v.aarOffsetByHand ? v.aarOffsetNm : null,
      },
    } : null,
  };
}
