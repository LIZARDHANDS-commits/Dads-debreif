// Every setting of the Traffic Pattern Sim and the value it starts at, so any
// box, menu or checkbox can be left alone (specs/SPEC-traffic.md: "Every setting
// starts filled in, and the first look stays simple", the Defaults table; and
// "Number boxes" for the limits). One flat frozen object of plain values, so
// the shared settings store can keep it as it is. A setting nothing reads is
// deleted, not kept (Traffic clean-up, 4 Oct).
//
// Rows that describe a rule rather than a number (which route the spawner
// starts on) are kept as short words; the code that does the work reads them.

import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { RUNWAY_29L_HDG_DEG, DOWNWIND_29L_HDG_DEG } from './airfield.js';

export const RUNWAYS = Object.freeze([
  { id: '29L', label: 'Runway 29L (Active)', headingDeg: RUNWAY_29L_HDG_DEG, active: true },
  { id: '11R', label: 'Runway 11R (Coming soon)', headingDeg: DOWNWIND_29L_HDG_DEG, disabled: true },
]);
export const DEFAULT_RUNWAY = '29L';

export const DEFAULTS = Object.freeze({
  // Active runway: CYMJ Moose Jaw Runway 29L (298°T, left-hand circuits).
  runway: DEFAULT_RUNWAY,

  // Playback speed: 1× (1x real-time speed, rebaselined from 8x).
  speed: 1,

  // 2D or 3D: 2D (the ui-kit's shared default).
  view: VIEW_DEFAULT,
  // The 3D aircraft's paint: the Harvard scheme (the ui-kit's PAINT_DEFAULT), or plain ship colours.
  paint: PAINT_DEFAULT,
  // 3D graphics quality: 'high' (sharp 4-tier satellite and up to 24 full Harvards) or 'low' (performance).
  graphicsQuality: 'low', // Performance by default (Patrick, 3D upgrade); High is one click in the 3D bar or Traffic settings

  // Wind: 260°M at 15 kt, the opening picture's wind (Patrick, 4 Oct 18:47Z; was calm). Set in true: 269°T with
  // Moose Jaw's 9° East (TR-63). Patrick, 4 Oct: "260 magnetic is fine" (it was 260°T, which reads 251°M).
  windFromDeg: 269,
  windKt: 15,

  // Layers: the Clean Operational preset (Patrick, 4 Oct: "the default display settings to be clean operational"):
  // labels, the wind-adjusted track and the photo on, with the caution ring and the PFL glide circle (both shown only
  // round the selected aircraft) and the 3D height drop lines; trails, route points, bubbles, the SMM calm reference,
  // leg distances and turn data off. The PFL ground circle is off too: only the overhead break and the OHB Rejoin show at first.
  // (Before 4 Oct: trails, points, bubbles, height lines, the SMM reference and the PFL circle were on.)
  layerTrails: false,
  layerLabels: true,
  layerPoints: false,
  layerBubbles: false,
  layerCautionRings: true,
  layerHeightLines: true, // in Clean Operational for the 3D view (Patrick, 4 Oct)
  layerPhoto: true,
  layerWindTrack: true,
  layerSmmReference: false,
  layerPflCircle: false,
  layerLegDistances: false,
  layerTurnData: false,
  layerEngineReach: true, // the PFL glide circle, behind this tick (Patrick, 4 Oct)

  // Photo (More in Layers): opacity 100 %, drawn above the grid, the setup's
  // own alignment (1.2 trim until the redraw, T8; no offset).
  photoOpacityPct: 100,
  photoAboveGrid: true,
  photoTrim: 1.2,
  photoEastFt: 0,
  photoNorthFt: 0,

  // Route options (flyRoundedTurns is V6's name): rounded turns on, radius from speed and G on, manual radius 1,800 ft.
  flyRoundedTurns: true,
  radiusFromG: true,
  manualRadiusFt: 1800,

  // Spawner: type CT-156, the first entry (or the first pattern if there are
  // no entries), start at point 1, delay 0 s.
  spawnType: 'CT-156',
  spawnRoute: 'first-entry',
  spawnStartPoint: 1,
  spawnDelayS: 0,

  // + Pair: 20 s apart, on the same route as the first (15 s leaves 2,536 ft on final at 100 kt, under 3,000 ft on final; about 18 s is needed).
  pairGapS: 20,

  // Conflict limits: 200 ft and 200 ft; caution 500 ft and 500 ft (T4).
  conflictLatFt: 200,
  conflictVertFt: 200,
  cautionLatFt: 500,
  cautionVertFt: 500,

  // Automatic deconfliction (deconflict.js): on at the start (Patrick, 4 Oct 16:59Z, TR-50).
  autoDeconflict: true,

  // Randomize behaviour (randomize.js): off at the start; each aircraft may pick its own landing and pattern (Patrick, 4 Oct 21:52Z).
  randomizeBehaviour: false,
  // ...and how often an aircraft does something other than the normal circuit, percent (Patrick's card "Odds as a setting", 4 Oct 22:29Z; 40, an estimate).
  randomizeSharePct: 40,

  // Closed pattern maneuver: default 50° bank (selectable 45, 50, 60). The pitch comes from the climb and angle of attack.
  closedPatternBankDeg: 50,

  // Aircraft size on the map: 1 = realistic, the real length with a smallest size so it can be seen (Patrick, 4 Oct 10:06Z).
  aircraftScale: 1,
});

// The values a setting may hold besides its type, for createSettings(store, DEFAULTS, { allowed: ALLOWED }).
// The 2D | 3D switch is the ui-kit's shared one, so its values come from there; so are the paints.
export const ALLOWED = /** @type {Record<string, any[]>} */ (/** @type {unknown} */ (Object.freeze({
  view: VIEW_ALLOWED,
  paint: PAINT_OPTIONS.map((o) => o.value),
  graphicsQuality: ['high', 'low'],
  closedPatternBankDeg: [45, 50, 60],
})));

// The playback speeds on offer (the spec's "0.25× to 8×"), and the speed the
// bar starts at.
export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4, 8]);

// What each number box accepts (the spec's "Number boxes"), as [min, max].
// Anything else is refused with a message and the last good value stays.
// Keys are settings, or the fields of a route point.
export const LIMITS = Object.freeze({
  windFromDeg: Object.freeze([1, 360]), // degrees true, as a METAR gives it
  windKt: Object.freeze([0, 60]),
  conflictLatFt: Object.freeze([0, 20000]),
  conflictVertFt: Object.freeze([0, 20000]),
  cautionLatFt: Object.freeze([0, 20000]),
  cautionVertFt: Object.freeze([0, 20000]),
  manualRadiusFt: Object.freeze([100, 20000]),
  spawnDelayS: Object.freeze([0, 86400]),
  pointAltFt: Object.freeze([-1000, 20000]),
  pointKias: Object.freeze([40, 400]),
  pointG: Object.freeze([1, 9]),
  closedPatternBankDeg: Object.freeze([30, 60]),
  aircraftScale: Object.freeze([1, 6]),
  randomizeSharePct: Object.freeze([0, 100]),
  // Not in the spec's list; V6's own ranges where it had them.
  photoOpacityPct: Object.freeze([5, 100]),
  photoTrim: Object.freeze([0.8, 1.2]),
  photoEastFt: Object.freeze([-20000, 20000]),
  photoNorthFt: Object.freeze([-20000, 20000]),
});
