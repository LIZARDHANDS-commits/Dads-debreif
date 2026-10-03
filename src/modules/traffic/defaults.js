// Every setting of the Traffic Pattern Sim and the value it starts at, so any
// box, menu or checkbox can be left alone (specs/SPEC-traffic.md: "Every setting
// starts filled in, and the first look stays simple", the Defaults table; and
// "Number boxes" for the limits). One flat frozen object of plain values, so
// the shared settings store can keep it as it is. The tests pin each value to
// its row of the table.
//
// Rows that describe a rule rather than a number (where a new point goes, which
// route a new entry joins) are kept as short words; the code that does the
// work reads them and names the row it follows.

import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';

export const RUNWAYS = Object.freeze([
  { id: '29L', label: 'Runway 29L (Active)', headingDeg: 298, active: true },
  { id: '11R', label: 'Runway 11R (Coming soon)', headingDeg: 118, disabled: true },
]);
export const DEFAULT_RUNWAY = '29L';

export const DEFAULTS = Object.freeze({
  // Active runway: CYMJ Moose Jaw Runway 29L (298°T, left-hand circuits).
  runway: DEFAULT_RUNWAY,

  // Playback speed: 1× (1x real-time speed, rebaselined from 8x).
  speed: 1,

  // 2D or 3D: 2D (the ui-kit's shared default); the 3D camera starts at Fit.
  view: VIEW_DEFAULT,
  camera3d: 'fit',
  // The 3D aircraft's paint: the Harvard scheme (the ui-kit's PAINT_DEFAULT), or plain ship colours.
  paint: PAINT_DEFAULT,

  // Wind: calm, 360°T at 0 kt.
  windFromDeg: 360,
  windKt: 0,

  // Layers: trails, height and speed labels, route points, conflict bubbles,
  // caution rings and the satellite photo on (V6's built-in setup); leg
  // distances, turn data and Engine-out reach off.
  layerTrails: true,
  layerLabels: true,
  layerPoints: true,
  layerBubbles: true,
  layerCautionRings: true,
  layerHeightLines: true,
  layerPhoto: true,
  layerWindTrack: true,
  layerSmmReference: true,
  layerLegDistances: false,
  layerTurnData: false,
  layerEngineReach: false,

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

  // New pattern: V6's generic pattern, left-hand, its first point a decision
  // point at V6's odds (Land 20 %, Stay 80 %); at another home field the
  // runway box starts at 29, V6's generic runway (T2).
  newPatternHand: 'left',
  newPatternLandPct: 20,
  newPatternStayPct: 80,
  newPatternRunway: 29,

  // New entry, new split: V6's builders, linked to the selected pattern, or
  // the first pattern if none is selected.
  newEntrySplitJoins: 'selected-pattern',

  // New PFL: at the threshold the pattern lands on, orbiting on the pattern's
  // side; High Key 5,000 ft MSL at Moose Jaw, 3,000 ft above the field elsewhere.
  pflAt: 'landing-threshold',
  pflOrbitSide: 'pattern-side',
  pflHighKeyMooseJawFtMsl: 5000,
  pflHighKeyElsewhereAboveFieldFt: 3000,

  // New point (+ Point): V6's rule, halfway to the next point with the average
  // height and G of the two; the speed phase is the selected point's (Blend
  // between two different phases); labelled "New point".
  newPointPlace: 'halfway',
  newPointAltAndG: 'average',
  newPointPhase: 'selected-point',
  newPointLabel: 'New point',

  // A new split's share: half of Stay's share at that point, so the shares
  // still add up to 100 % and the new split gets flown.
  newSplitShare: 'half-of-stay',

  // Break: none until a point is marked Break; the slow-down then ends abeam
  // the threshold.
  breakPoint: 'none',
  breakSlowDownEnds: 'abeam-threshold',

  // Spawner: type CT-156, the first entry (or the first pattern if there are
  // no entries), start at point 1, delay 0 s, plan Random.
  spawnType: 'CT-156',
  spawnRoute: 'first-entry',
  spawnStartPoint: 1,
  spawnDelayS: 0,
  spawnPlan: 'random',

  // + Pair: 20 s apart, on the same route (15 s leaves 2,536 ft on final at 100 kt, under the 3,000 ft final spacing; about 18 s is needed).
  pairGapS: 20,
  pairRoute: 'same',

  // New plan: named "Plan 1", no steps yet; when it runs out, Land.
  newPlanName: 'Plan 1',
  planWhenOut: 'land',

  // Engine out (Command menu): prop feathered, clean until the runway is assured.
  engineOutProp: 'feathered',
  engineOutConfig: 'clean',

  // Dice: the setup's own seed, so the first run is the same for everyone;
  // New traffic picks a new one.
  dice: 'setup-seed',

  // Conflict limits: 200 ft and 200 ft; caution 500 ft and 500 ft (T4).
  conflictLatFt: 200,
  conflictVertFt: 200,
  cautionLatFt: 500,
  cautionVertFt: 500,

  // Final spacing, missing traffic: 3,000 ft; 10 % (T11).
  finalSpacingFt: 3000,
  missChancePct: 10,

  // Rules: every rule on.
  ruleExtendDownwind: true,
  ruleMoveOver: true,
  ruleFlyThrough: true,
  ruleBreakAtDepartureEnd: true,
  ruleClosedPattern: true,

  // Set up a conflict: the first two aircraft in the list (or two new CT-156s
  // on Random), the first crossing on its list, 1 minute from now, arriving at
  // the same moment; rules left as they are until you pick "switch them off".
  conflictSetupAircraft: 'first-two',
  conflictSetupPlace: 'first-crossing',
  conflictSetupInS: 60,
  conflictSetupGapS: 0,
  conflictSetupRules: 'leave-as-they-are',

  // Engine-out check: the selected aircraft's state; with none selected, the
  // downwind example (3,500 ft, 220 KIAS, abeam the threshold, clean, prop
  // feathered); airstart attempt off.
  engineOutCheckFrom: 'selected-aircraft',
  engineOutCheckAltFt: 3500,
  engineOutCheckKias: 220,
  engineOutCheckPlace: 'abeam-threshold',
  engineOutCheckConfig: 'clean',
  engineOutCheckProp: 'feathered',
  airstartAttempt: false,

  // Engine-out reach: off (layerEngineReach above); CT-156; 200 ft margin for green.
  reachType: 'CT-156',
  reachMarginFt: 200,

  // New profile: named "Setup 1", with an empty notes box.
  newProfileName: 'Setup 1',
  newProfileNotes: '',
});

// The values a setting may hold besides its type, for createSettings(store, DEFAULTS, { allowed: ALLOWED }).
// The 2D | 3D switch is the ui-kit's shared one, so its values come from there; so are the paints.
export const ALLOWED = /** @type {Record<string, any[]>} */ (/** @type {unknown} */ (Object.freeze({ view: VIEW_ALLOWED, paint: PAINT_OPTIONS.map((o) => o.value) })));

// The playback speeds on offer (the spec's "0.25× to 8×"), and the speed the
// bar starts at.
export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4, 8]);

// What each number box accepts (the spec's "Number boxes"), as [min, max].
// Anything else is refused with a message and the last good value stays.
// Keys are settings, or the fields of a route point and a share.
export const LIMITS = Object.freeze({
  windFromDeg: Object.freeze([1, 360]), // degrees true, as a METAR gives it
  windKt: Object.freeze([0, 60]),
  conflictLatFt: Object.freeze([0, 20000]),
  conflictVertFt: Object.freeze([0, 20000]),
  cautionLatFt: Object.freeze([0, 20000]),
  cautionVertFt: Object.freeze([0, 20000]),
  finalSpacingFt: Object.freeze([0, 20000]), // a distance, so the conflict distances' range
  missChancePct: Object.freeze([0, 100]), // a share
  manualRadiusFt: Object.freeze([100, 20000]),
  spawnDelayS: Object.freeze([0, 86400]),
  pointAltFt: Object.freeze([-1000, 20000]),
  pointKias: Object.freeze([40, 400]),
  pointG: Object.freeze([1, 9]),
  sharePct: Object.freeze([0, 100]),
  // Not in the spec's list; V6's own ranges where it had them.
  photoOpacityPct: Object.freeze([5, 100]),
  photoTrim: Object.freeze([0.8, 1.2]),
  photoEastFt: Object.freeze([-20000, 20000]),
  photoNorthFt: Object.freeze([-20000, 20000]),
});
