// The Turn Sim's input boxes: plain words, units and hints for each setting,
// and a builder that makes the right ui-kit control from settings.js's rules
// (R22: plain labels with units). A field whose setting isn't in
// SETTINGS_RULES is left out, so a setting removed or renamed in settings.js
// never leaves a dead control on the screen.
//
// To reword a box, change its `label`, `unit` or `hint` here; to rename a
// setting, change its key here and in settings.js.
import { aircraftKey } from './settings.js';

/** One field: the setting it edits, and its words. */
const field = (key, meta) => ({ key, ...meta });

const OPTION_LABELS = {
  formation: { weighted: '4312', weightedReverse: '2134', offsetBox: 'Offset box', twoShip: 'Two-ship' },
  maneuver: {
    delayed90away: 'Delayed 90', delayed45away: 'Delayed 45', hook90: 'Hook turn', inplace90: 'In-place 90', check30: 'Check turn', shackle45: 'Shackle', cross180: 'Cross turn',
  },
  direction: { right: 'Right', left: 'Left' },
  timing: { time: 'Time delay', clock: 'Clock position cue', auto: 'Auto timing' },
  clockCuePos: { auto: 'Auto (7 right, 5 left)' },
  clockPos: { global: 'Same as setup', auto: 'Auto (7 right, 5 left)' },
  clockTarget: { global: 'Same as setup', 1: '#1', 2: '#2', 3: '#3', 4: '#4' },
  clockCueAircraft: { 1: '#1', 2: '#2', 3: '#3', 4: '#4' },
  clockCueSequence: { outsideIn: 'Outside-in', manual: 'Manual targets' },
  offsetBox4Timing: { boxSlot: 'Box slot (solved)', rearDelay: 'Rear element delay (SMM)', groundTrack: 'Solve by ground track', late: 'Late (V6)', early: 'Early (V6)' },
  delayed45Check: { auto: 'Auto', none: 'Plain', check: 'With check turn' },
  twoSide: { left: 'Left', right: 'Right' },
  rearCheckDir: { left: 'Left', right: 'Right' },
  correction: { none: 'None', lag: 'Lag to regain spacing', lead: 'Lead to close spacing', gfix: 'G adjustment' },
  lateralDir: { none: 'None', tight: 'Tight', wide: 'Wide' },
  foreAftDir: { none: 'None', fore: 'Fore', aft: 'Aft' },
};

// The essentials: always on screen (R22).
export const FORMATION = field('formation', { label: 'Formation' });
export const SPACING = field('spacingFt', { label: 'Spacing', unit: 'ft', step: 100, hint: 'Between neighbours, side to side.' });
export const START_HEADING = field('startHeadingDeg', { label: 'Start heading', unit: '°', step: 5, hint: 'Compass: 0 north, 90 east.' });
export const MANEUVER = field('maneuver', { label: 'Turn' });
export const DIRECTION = field('direction', { label: 'Direction' });
export const SPEED = field('speedKt', { label: 'Speed', unit: 'KTAS', step: 5 });
export const G = field('baseG', { label: 'G', unit: 'G', step: 0.1 });
export const TIMING = field('timing', { label: 'Timing', hint: 'How each aircraft knows when to turn.' });
export const BASE_DELAY = field('baseDelaySec', { label: 'Base delay', unit: 's', step: 0.1, hint: 'Wait between one turn and the next.' });
export const CLOCK_POS = field('clockCuePos', { label: 'Clock position', hint: 'Where the aircraft it watches must be before it turns.' });

// Behind the closed Settings menu (Patrick, 07:20Z): the tuning numbers.
export const TURN_DEG = field('turnDeg', { label: 'Turn degrees', unit: '°', step: 5, hint: 'Follows the turn you pick until you change it.' });
export const DURATION = field('durationSec', { label: 'Run length', unit: 's', step: 5 });
export const MOA = field('moaBoundaryNm', { label: 'MOA boundary', unit: 'NM', step: 5, hint: 'The purple box on the picture.' });
export const BOX_AFT = field('boxAftFt', { label: 'Aft spacing', unit: 'ft', step: 100, hint: 'How far behind the front element #3 and #4 fly.' });
export const BOX_STAGGER = field('boxStaggerFt', { label: 'Lateral stagger', unit: 'ft', step: 100 });
export const BOX4_TIMING = field('offsetBox4Timing', { wide: true, label: '#4 timing', hint: 'V6\'s two ways to time #4.' });
export const CLOCK_AIRCRAFT = field('clockCueAircraft', { label: 'Clock cue aircraft', hint: 'The aircraft the cue is read from.' });
export const CLOCK_SEQUENCE = field('clockCueSequence', { label: 'Clock cue sequence', hint: 'Outside-in picks who watches whom; Manual uses the targets in Aircraft errors.' });
export const CLOCK_TOL = field('clockCueTolDeg', { label: 'Clock tolerance', unit: '°', step: 0.5, hint: 'How close to the position counts as there.' });
export const REAR_DELAY = field('rearDelaySec', { label: 'Rear element delay', unit: 's', step: 0.5, hint: 'How long #3 and #4 wait after the front element. The SMM says 10 to 15 s.' });
export const CROSS_FIRST_G = field('crossTurnFirstG', { label: 'Cross turn first-stage G', unit: 'G', step: 0.1, hint: 'The G setting is the second stage.' });
export const CROSS_SWITCH = field('crossTurnSwitchDeg', { label: 'Cross turn switch point', unit: '°', step: 5, hint: 'Degrees turned before the second stage.' });
export const CROSS_SOLVE = field('crossTurnSolveSpacing', { label: 'Set second-half G for LAB roll-out', hint: 'Off flies the G setting all the way, as V6 did.' });
export const DURATION_COVERS = field('durationCoversTurn', { label: 'Run at least until the turn is done' });
export const TWO_SIDE = field('twoSide', { label: '#2\'s side', hint: 'Which side of Lead #2 flies on, in 4312 and 2134. The two-ship and the offset box have their own places.' });
export const DELAYED45_CHECK = field('delayed45Check', { label: 'Delayed 45 style', hint: 'Auto: check in 4-ship formations; plain in the two-ship (the check is optional there, Fig 16.17).' });
export const CHECK_DEG = field('checkTurnDeg', { label: 'Check turn', unit: '°', step: 0.5, hint: 'The figure gives 10 to 15 degrees.' });
export const CHECK_SOLVE = field('checkSolveSpacing', { label: 'Roll in to hold the set spacing', hint: 'Off flies the figure\'s cue: abreast, about two thirds of the set spacing apart. On solves each roll-in for the Spacing, rolling out aft of abreast.' });
export const REAR_CHECK_ON = field('rearCheckOn', { label: 'Rear element check' });
export const REAR_CHECK_START = field('rearCheckStartSec', { label: 'Check starts at', unit: 's', step: 5 });
export const REAR_CHECK_DIR = field('rearCheckDir', { label: 'Check turns' });
export const REAR_CHECK_ANGLE = field('rearCheckAngleDeg', { label: 'Check angle', unit: '°', step: 5 });
export const REAR_CHECK_HOLD = field('rearCheckHoldSec', { label: 'Check hold', unit: 's', step: 1 });
export const REAR_CHECK_AFTER = field('rearCheckAfterTurns', { label: 'Wait for #3 and #4 to finish turning', hint: 'Off starts the check at its set time, as V6 did.' });
export const CORRECTION = field('correction', { label: 'Correction model', hint: 'An instructional model of a wingman correcting his position.' });
export const CORR_STRENGTH = field('correctionStrength', { label: 'Correction strength', step: 0.1 });

/** The Aircraft errors fields for wingman `id` (2, 3 or 4), by name. */
export function errorFields(id) {
  const key = (f) => aircraftKey(id, f);
  return {
    delay: field(key('delayErrSec'), { label: 'Turns late (+) or early (−)', unit: 's', step: 0.5 }),
    g: field(key('gError'), { label: 'Extra G (+) or less G (−)', unit: 'G', step: 0.1 }),
    positionOn: field(key('positionErrorOn'), { label: 'Put it out of position' }),
    lateralDir: field(key('lateralDir'), { label: 'Side to side' }),
    lateralFt: field(key('lateralFt'), { label: 'by', unit: 'ft', step: 100 }),
    foreAftDir: field(key('foreAftDir'), { label: 'Fore and aft' }),
    foreAftFt: field(key('foreAftFt'), { label: 'by', unit: 'ft', step: 100 }),
    clockTarget: field(key('clockTarget'), { label: 'Watches' }),
    clockPos: field(key('clockPos'), { label: 'Clock position' }),
  };
}

/** [{ value, label, disabled }] for a select, from the rule's allowed values. */
export function optionsOf(key, rule) {
  const name = key.replace(/^aircraft\d\./, ''); // an aircraft's field is worded the same for every aircraft
  const clock = name === 'clockCuePos' || name === 'clockPos';
  return rule.oneOf.map((value) => ({ value, label: OPTION_LABELS[name]?.[value] ?? (clock ? clockLabel(value) : String(value)) }));
}

/** The Auto clock position's words: the engine's Auto is 4:30 right and 7:30 left in the Delayed 45 (D206), else 7 right and 5 left. */
export function clockAutoLabel(maneuver) {
  return maneuver === 'delayed45away' ? 'Auto (4:30 right, 7:30 left)' : 'Auto (7 right, 5 left)';
}

/** A clock position as a person says it: 5.5 is "5:30", 12 is "12 o'clock". */
export function clockLabel(value) {
  const n = Number(value);
  const whole = Math.floor(n);
  const hour = whole === 0 ? 12 : whole;
  return n - whole >= 0.5 ? `${hour}:30` : `${hour} o'clock`;
}

/**
 * Builds the control for a field, or null when its setting isn't there.
 * controls: a ui-kit createControls bound to the scenario settings.
 * defaults: DEFAULTS. as: 'choice' for a small Right | Left style pair of buttons.
 * Returns { key, control, hint }.
 */
export function buildField({ controls, rules, defaults, def, as }) {
  const { key } = def;
  const rule = rules[key];
  if (!rule) return null;
  let control;
  if (rule.oneOf) {
    const options = optionsOf(key, rule);
    if (as === 'choice') control = controls.choice(key, { label: def.label, options });
    else control = controls.select(key, { label: def.label, options: def.without ? options.filter((o) => !def.without.includes(o.value)) : options });
  } else if (rule.type === 'boolean' || typeof defaults?.[key] === 'boolean') {
    control = controls.checkbox(key, { label: def.label });
  } else {
    control = controls.number(key, { label: def.label, unit: def.unit ?? '', min: rule.min, max: rule.max, step: def.step ?? 'any' });
  }
  return { key, control, hint: def.hint ?? null };
}
