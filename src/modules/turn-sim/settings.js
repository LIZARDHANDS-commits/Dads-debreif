// The Turn Sim's settings: every setting, its default, and what it may be.
// No page access: the screen binds these to controls (ui-kit createControls)
// and storage/settings.js keeps them; the engine reads them.
//
// V6_DEFAULTS are the values V6's boxes start with (original/shell.html lines
// 527 to 600). DEFAULTS are what the rebuild starts with: V6's, except where a
// logged decision changed one (each named next to it). Golden tests pass
// V6_DEFAULTS, so they keep pinning V6 whatever DEFAULTS become.
//
// Every setting has a default: none is ever blank (Patrick, 07:13Z).
//
// The keys are flat (storage/settings.js keeps one value per key and needs each
// value to keep its default's type). An aircraft's own settings are named
// `aircraft<id>.<field>`, as the debrief names its standards (see aircraftKey).
//
// Left out on purpose: V6's hidden trigger modes (heading cue, range cue and
// bearing cue boxes, never reachable from its menu, spec "Timing"), the dead
// "Shackle rollback delay" box (it did nothing, V6 line 1585), and the view
// state (zoom, playback speed, layer toggles), which the screen remembers
// itself and a profile doesn't carry (spec "The screen").

/** The clock positions V6's menus offer: 12 o'clock, 12:30, 1 o'clock … 11:30 (lines 584 and 921). */
export const CLOCK_POSITIONS = Object.freeze(Array.from({ length: 24 }, (_, i) => (i === 0 ? 12 : i / 2)));

const AIRCRAFT_IDS = [1, 2, 3, 4];

/** The setting key for one aircraft's field, such as aircraftKey(2, 'delayErrSec') = 'aircraft2.delayErrSec'. */
export function aircraftKey(id, field) {
  return `aircraft${id}.${field}`;
}

// One aircraft's own settings (V6 lines 903 to 921). All start at "no error".
const AIRCRAFT_FIELD_DEFAULTS = {
  delayErrSec: 0, // + late, - early
  gError: 0, // added to the G setting
  positionErrorOn: false, // "Enable position error"
  lateralDir: 'none', // 'none' | 'tight' | 'wide'
  lateralFt: 0,
  foreAftDir: 'none', // 'none' | 'fore' | 'aft'
  foreAftFt: 0,
  clockTarget: 'global', // 'global' or an aircraft id as text: whose clock cue this one watches
  clockPos: 'global', // 'global' or a clock position as text
  turnLogic: 'auto', // 'auto' | 'selected' | 'right' | 'left' | 'toward' | 'away'
};

/** The names of one aircraft's fields. */
export const AIRCRAFT_FIELDS = Object.freeze(Object.keys(AIRCRAFT_FIELD_DEFAULTS));

/** V6's starting values, by setting key. */
export const V6_DEFAULTS = Object.freeze({
  // Formation card (lines 542 to 566)
  formation: 'weighted', // 'weighted' (4312) | 'weightedReverse' (2134) | 'offsetBox' | 'twoShip'
  spacingFt: 6000, // "Desired spacing"
  boxAftFt: 8000, // "Offset box aft spacing"
  boxStaggerFt: 1000, // "Offset box lateral stagger"
  startHeadingDeg: 0, // V6's math heading: 0 = east, counter-clockwise. Task 10 (D45) makes it a compass heading.
  showNm: true, // "Show NM secondary"

  // Offset box #4 timing and the rear element check (lines 543 to 558)
  offsetBox4Timing: 'late', // 'late' | 'early'
  rearCheckOn: false,
  rearCheckStartSec: 40,
  rearCheckDir: 'left', // 'left' | 'right'
  rearCheckAngleDeg: 20,
  rearCheckHoldSec: 5,
  // Not in V6. The SMM's 10 to 15 s delay for #3 and #4 in the offset box (16.41 para 112, D87).
  // The band is a setting; nothing flies with it yet (task 11).
  rearDelayMinSec: 10,
  rearDelayMaxSec: 15,

  // Turn setup (lines 571 to 588)
  maneuver: 'delayed90away', // 'delayed90away' | 'delayed45away' | 'hook90' | 'shackle45' | 'cross180' | 'inplace90'
  direction: 'right', // 'right' | 'left'
  speedKt: 220, // V6's "Speed KTAS": true airspeed, no wind
  baseG: 2.0,
  turnDeg: 90,
  timing: 'time', // 'time' | 'clock' | 'auto'
  baseDelaySec: 16,
  clockCueAircraft: 1, // 1 to 4
  clockCuePos: 5.5, // one of CLOCK_POSITIONS
  clockCueTolDeg: 4,
  clockCueSequence: 'outsideIn', // 'outsideIn' | 'manual'
  durationSec: 75,
  moaBoundaryNm: 30,

  // Correction model (lines 596 to 600, hidden in V6)
  correction: 'none', // 'none' | 'lag' | 'lead' | 'gfix'
  correctionStrength: 0.5,

  // Solver (line 2026, hidden in V6)
  solveFor: 'delay', // 'delay' | 'spacing' | 'g'
  targetSpacingFt: 6000,

  // Aircraft errors and per-aircraft clock cues (lines 903 to 921)
  ...Object.fromEntries(
    AIRCRAFT_IDS.flatMap((id) => AIRCRAFT_FIELDS.map((f) => [aircraftKey(id, f), AIRCRAFT_FIELD_DEFAULTS[f]])),
  ),
});

/** What the rebuild starts with: V6's values, plus each logged decision that changed one. */
export const DEFAULTS = Object.freeze({
  ...V6_DEFAULTS,
});

const number = (min, max) => ({ type: 'number', min, max });
const bool = { type: 'boolean' };
const oneOf = (list) => ({ type: 'string', oneOf: list });
const numberOneOf = (list) => ({ type: 'number', oneOf: list });

const aircraftRules = {
  delayErrSec: number(-60, 60),
  gError: number(-5, 5),
  positionErrorOn: bool,
  lateralDir: oneOf(['none', 'tight', 'wide']),
  lateralFt: number(0, 20000),
  foreAftDir: oneOf(['none', 'fore', 'aft']),
  foreAftFt: number(0, 20000),
  clockTarget: oneOf(['global', '1', '2', '3', '4']),
  clockPos: oneOf(['global', ...CLOCK_POSITIONS.map(String)]),
  turnLogic: oneOf(['auto', 'selected', 'right', 'left', 'toward', 'away']),
};

/**
 * What each setting may be, by key, in the shape the debrief's rules use:
 * { type: 'number', min, max }, { type: 'boolean' } or { type: 'string', oneOf }.
 * A number with `oneOf` may only be one of those values (the clock positions and aircraft ids).
 * Numbers are finite and in range; Speed is at least 1 kt and Turn degrees run 10 to 180 (todo task 1).
 */
export const SETTINGS_RULES = Object.freeze({
  formation: oneOf(['weighted', 'weightedReverse', 'offsetBox', 'twoShip']),
  spacingFt: number(100, 50000),
  boxAftFt: number(100, 50000), // not 0: V6 reads a 0 in its box as 8,000 (`||8000`, line 816)
  boxStaggerFt: number(0, 20000),
  startHeadingDeg: number(-360, 360),
  showNm: bool,

  offsetBox4Timing: oneOf(['late', 'early']),
  rearCheckOn: bool,
  rearCheckStartSec: number(0, 600),
  rearCheckDir: oneOf(['left', 'right']),
  rearCheckAngleDeg: number(1, 90),
  rearCheckHoldSec: number(0, 120),
  rearDelayMinSec: number(0, 60),
  rearDelayMaxSec: number(0, 60),

  maneuver: oneOf(['delayed90away', 'delayed45away', 'hook90', 'shackle45', 'cross180', 'inplace90']),
  direction: oneOf(['right', 'left']),
  speedKt: number(1, 1000),
  baseG: number(1.01, 12),
  turnDeg: number(10, 180),
  timing: oneOf(['time', 'clock', 'auto']),
  baseDelaySec: number(0, 300),
  clockCueAircraft: numberOneOf([1, 2, 3, 4]),
  clockCuePos: numberOneOf(CLOCK_POSITIONS),
  clockCueTolDeg: number(0.1, 45),
  clockCueSequence: oneOf(['outsideIn', 'manual']),
  durationSec: number(5, 600),
  moaBoundaryNm: number(1, 500),

  correction: oneOf(['none', 'lag', 'lead', 'gfix']),
  correctionStrength: number(0, 5),

  solveFor: oneOf(['delay', 'spacing', 'g']),
  targetSpacingFt: number(100, 50000),

  ...Object.fromEntries(AIRCRAFT_IDS.flatMap((id) => AIRCRAFT_FIELDS.map((f) => [aircraftKey(id, f), aircraftRules[f]]))),
});

/** The version of the settings document, for storage/settings.js createSettings. */
export const SETTINGS_VERSION = 1;

/**
 * The allowed lists, in the shape createSettings wants as `options.allowed`
 * (it checks type and finiteness itself; ranges are checkSettings' job).
 */
export const SETTINGS_ALLOWED = Object.freeze(
  Object.fromEntries(
    Object.entries(SETTINGS_RULES)
      .filter(([, rule]) => rule.oneOf)
      .map(([key, rule]) => [key, rule.oneOf]),
  ),
);

/** True when `value` is fine for the setting `key`. */
export function settingIsValid(key, value) {
  const rule = Object.hasOwn(SETTINGS_RULES, key) ? SETTINGS_RULES[key] : null;
  if (!rule || typeof value !== rule.type) return false;
  if (rule.type === 'number') {
    if (!Number.isFinite(value)) return false;
    if (rule.oneOf) return rule.oneOf.includes(value);
    return value >= rule.min && value <= rule.max;
  }
  if (rule.type === 'string') return rule.oneOf.includes(value);
  return true;
}

/**
 * A clean settings object from anything: every key present, each value the
 * given one when it is good and the default otherwise, unknown keys dropped.
 * Never throws, never returns a blank. A delay band whose minimum is above its
 * maximum goes back to the default band.
 */
export function checkSettings(obj) {
  const out = {};
  const given = obj && typeof obj === 'object' ? obj : {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = Object.hasOwn(given, key) && settingIsValid(key, given[key]) ? given[key] : DEFAULTS[key];
  }
  if (out.rearDelayMinSec > out.rearDelayMaxSec) {
    out.rearDelayMinSec = DEFAULTS.rearDelayMinSec;
    out.rearDelayMaxSec = DEFAULTS.rearDelayMaxSec;
  }
  return Object.freeze(out);
}

/** One aircraft's own settings, by field name (delayErrSec, gError …), from a settings object. */
export function aircraftSettings(settings, id) {
  return Object.fromEntries(AIRCRAFT_FIELDS.map((f) => [f, settings[aircraftKey(id, f)]]));
}
