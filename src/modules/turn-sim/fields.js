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
    delayed90away: 'Delayed 90', delayed45away: 'Delayed 45', hook90: 'Hook turn', inplace90: 'In-place 90', shackle45: 'Shackle', cross180: 'Cross turn',
  },
  direction: { right: 'Right', left: 'Left' },
  timing: { time: 'Time delay', clock: 'Clock position cue', auto: 'Auto timing' },
  offsetBox4Timing: { late: 'Late (V6)', early: 'Early (V6)' },
  correction: { none: 'None', lag: 'Lag to regain spacing', lead: 'Lead to close spacing', gfix: 'G adjustment' },
  lateralDir: { none: 'None', tight: 'Tight', wide: 'Wide' },
  foreAftDir: { none: 'None', fore: 'Fore', aft: 'Aft' },
};

/**
 * Choices that show but can't be picked yet, because the engine doesn't fly them
 * (todo tasks 8 and 9: the clock cue and auto timing). Delete an entry when its task lands.
 */
export const NOT_YET = Object.freeze({
  timing: Object.freeze({ clock: 'coming in a later step', auto: 'coming in a later step' }),
});

// The essentials: always on screen (R22).
export const FORMATION = field('formation', { label: 'Formation' });
export const SPACING = field('spacingFt', { label: 'Spacing', unit: 'ft', step: 100, hint: 'Between neighbours, side to side.' });
// TODO(D45, Q42): the engine still takes V6's math heading (0 east, counter-clockwise) until task 10 makes it a
// compass heading (0 north, default 0). When it does, this hint becomes "Compass: 0 north, 90 east."
export const START_HEADING = field('startHeadingDeg', { label: 'Start heading', unit: '°', step: 5, hint: '0 is east, 90 is north.' });
export const MANEUVER = field('maneuver', { label: 'Turn' });
export const DIRECTION = field('direction', { label: 'Direction' });
export const SPEED = field('speedKt', { label: 'Speed', unit: 'KTAS', step: 5 });
export const G = field('baseG', { label: 'G', unit: 'G', step: 0.1 });
export const TIMING = field('timing', { label: 'Timing', hint: 'How each aircraft knows when to turn.' });
export const BASE_DELAY = field('baseDelaySec', { label: 'Base delay', unit: 's', step: 0.1, hint: 'Wait between one turn and the next.' });

// Behind the closed Settings menu (Patrick, 07:20Z): the tuning numbers.
export const TURN_DEG = field('turnDeg', { label: 'Turn degrees', unit: '°', step: 5, hint: 'Follows the turn you pick until you change it.' });
export const DURATION = field('durationSec', { label: 'Run length', unit: 's', step: 5 });
export const MOA = field('moaBoundaryNm', { label: 'MOA boundary', unit: 'NM', step: 5, hint: 'The purple box on the picture.' });
export const BOX_AFT = field('boxAftFt', { label: 'Aft spacing', unit: 'ft', step: 100, hint: 'How far behind the front element #3 and #4 fly.' });
export const BOX_STAGGER = field('boxStaggerFt', { label: 'Lateral stagger', unit: 'ft', step: 100 });
export const BOX4_TIMING = field('offsetBox4Timing', { label: '#4 timing', hint: 'V6\'s two ways to time #4.' });
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
  };
}

/** [{ value, label, disabled }] for a select, from the rule's allowed values. */
export function optionsOf(key, rule) {
  const name = key.replace(/^aircraft\d\./, ''); // an aircraft's field is worded the same for every aircraft
  return rule.oneOf.map((value) => {
    const later = NOT_YET[name]?.[value];
    const label = OPTION_LABELS[name]?.[value] ?? (name === 'clockCuePos' ? clockLabel(value) : String(value));
    return { value, label: later ? `${label} (${later})` : label, disabled: Boolean(later) };
  });
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
    else {
      control = controls.select(key, { label: def.label, options });
      // Choices the engine can't fly yet show greyed out, with their reason in the words.
      const select = control.querySelector('select');
      options.forEach((o, i) => {
        if (o.disabled) select.options[i].disabled = true;
      });
    }
  } else if (rule.type === 'boolean' || typeof defaults?.[key] === 'boolean') {
    control = controls.checkbox(key, { label: def.label });
  } else {
    control = controls.number(key, { label: def.label, unit: def.unit ?? '', min: rule.min, max: rule.max, step: def.step ?? 'any' });
  }
  return { key, control, hint: def.hint ?? null };
}
