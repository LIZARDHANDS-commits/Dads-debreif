// The Traffic Sim's Settings panel: the tuning numbers, kept out of the way so
// only the essentials show at first (Patrick, 2026-09-30; specs/SPEC-traffic.md,
// R22). The playback bar opens it from its Settings button, closed at first.
// It holds the conflict limits (with the final spacing and the chance of
// missing traffic), the rules, the route options and the photo options.
//
// It is self-contained on purpose, so the shared Settings panel the app frame
// is making can take its place with a few lines:
//
//   const panel = createSettingsPanel({ values, onChange, available });
//   panel.element        put it in the Settings menu
//   panel.set(values)    show new values (a profile loaded); it doesn't call onChange
//   onChange(patch, all) called with just the settings that changed, and every value
//
// `values` may be partial: anything left out starts at its default. A group whose
// feature isn't on the screen yet is left out, so no box sits there doing nothing
// (R3): available = { rules, photo }, each true once it is.
import { h } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { DEFAULTS, LIMITS } from './defaults.js';

let nextHint = 1;

// The rules, each with a one-line hint in pilots' words (the spec's "More pattern procedures from the SMM").
export const RULES = Object.freeze([
  { key: 'ruleExtendDownwind', label: 'Extend downwind when final is busy', hint: 'If turning final would put the aircraft into traffic ahead, it carries on downwind and turns later.' },
  { key: 'ruleMoveOver', label: 'Move over when someone misses the traffic', hint: 'The aircraft on final moves over between the runways and flies a low approach.' },
  { key: 'ruleFlyThrough', label: 'Fly through instead of breaking', hint: 'At initial, if a PFL or other traffic would conflict with the break, it carries on to the departure end and rejoins crosswind.' },
  { key: 'ruleBreakAtDepartureEnd', label: 'Break at the departure end', hint: 'A normal break would conflict but a late one would not, so the break is delayed to the departure end.' },
  { key: 'ruleClosedPattern', label: 'Closed pattern: extend, or join the normal pattern', hint: 'The closed pattern waits along the departure leg while downwind is busy, then joins the normal pattern if there is still no room.' },
]);

// Every setting this panel edits.
export const PANEL_KEYS = Object.freeze([
  'conflictLatFt', 'conflictVertFt', 'cautionLatFt', 'cautionVertFt', 'finalSpacingFt', 'missChancePct',
  ...RULES.map((r) => r.key),
  'roundedTurns', 'radiusFromG', 'manualRadiusFt',
  'photoOpacityPct', 'photoAboveGrid', 'photoTrim', 'photoEastFt', 'photoNorthFt',
]);

const defaultsFor = (keys) => Object.fromEntries(keys.map((key) => [key, DEFAULTS[key]]));

// The store the ui-kit controls bind to: the panel's own values. A box changed by the user
// goes to onChange; set() shows new values without calling it.
function createLocalSettings(initial, onChange) {
  let current = { ...initial };
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(current));
  return {
    get: () => current,
    update(patch) {
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => current[key] !== value));
      if (!Object.keys(changed).length) return;
      current = { ...current, ...changed };
      notify();
      onChange?.(changed, current);
    },
    replace(values) {
      current = { ...current, ...values };
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Puts a one-line hint under a control and ties it to the control's input, so a screen reader reads it too.
function withHint(control, text) {
  const id = `traffic-settings-hint-${nextHint++}`;
  const input = [...control.childNodes].find((node) => node.tagName === 'INPUT');
  if (input) input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
  return h('div', { class: 'settings-item' }, control, h('p', { class: 'settings-hint', id }, text));
}

const group = (legend, ...children) => h('fieldset', { class: 'settings-group' }, h('legend', {}, legend), ...children);

/**
 * values: the current settings (partial is fine). onChange(patch, values): a box was changed.
 * available: { rules, photo }. photoHome: the alignment "Reset photo alignment" goes back to
 * ({ photoTrim, photoEastFt, photoNorthFt }); the setup's own, or the defaults.
 * Returns { element, set(values) }.
 */
export function createSettingsPanel({ values = {}, onChange, available = {}, photoHome = defaultsFor(['photoTrim', 'photoEastFt', 'photoNorthFt']) }) {
  const store = createLocalSettings({ ...defaultsFor(PANEL_KEYS), ...pick(values) }, onChange);
  const controls = createControls(store);
  const feet = (key, label, step = 50) => controls.number(key, { label, unit: 'ft', min: LIMITS[key][0], max: LIMITS[key][1], step });

  const groups = [
    group(
      'Conflict limits',
      h('p', { class: 'settings-hint' }, 'A pair inside both conflict limits is a conflict; inside both caution limits, a caution.'),
      h(
        'div',
        { class: 'settings-grid' },
        feet('conflictLatFt', 'Conflict: lateral'),
        feet('conflictVertFt', 'Conflict: vertical'),
        feet('cautionLatFt', 'Caution: lateral'),
        feet('cautionVertFt', 'Caution: vertical'),
      ),
      ...(available.rules
        ? [
            withHint(feet('finalSpacingFt', 'Final spacing', 100), 'How far behind the aircraft on final a roll-out must be. Any closer and the aircraft extends downwind.'),
            withHint(
              controls.number('missChancePct', { label: 'Chance of missing traffic', unit: '%', min: LIMITS.missChancePct[0], max: LIMITS.missChancePct[1], step: 1 }),
              'How often an aircraft on Random does not see the traffic on final and turns in anyway.',
            ),
          ]
        : []),
    ),
  ];

  if (available.rules) {
    groups.push(group('Rules', ...RULES.map((rule) => withHint(controls.checkbox(rule.key, { label: rule.label }), rule.hint))));
  }

  groups.push(
    group(
      'Route options',
      controls.checkbox('roundedTurns', { label: 'Fly rounded turns' }),
      controls.checkbox('radiusFromG', { label: 'Turn radius from speed and G' }),
      withHint(feet('manualRadiusFt', 'Manual turn radius', 100), 'Used only when the turn radius is not worked out from speed and G.'),
    ),
  );

  if (available.photo) {
    const home = () => store.update({ photoTrim: photoHome.photoTrim, photoEastFt: photoHome.photoEastFt, photoNorthFt: photoHome.photoNorthFt });
    groups.push(
      group(
        'Satellite photo',
        controls.number('photoOpacityPct', { label: 'Photo opacity', unit: '%', min: LIMITS.photoOpacityPct[0], max: LIMITS.photoOpacityPct[1], step: 5 }),
        controls.checkbox('photoAboveGrid', { label: 'Draw the photo above the grid' }),
        controls.number('photoTrim', { label: 'Photo scale trim', min: LIMITS.photoTrim[0], max: LIMITS.photoTrim[1], step: 0.01 }),
        feet('photoEastFt', 'Photo east / west offset', 100),
        feet('photoNorthFt', 'Photo north / south offset', 100),
        h('button', { type: 'button', class: 'button', onclick: home }, 'Reset photo alignment'),
      ),
    );
  }

  // The manual radius is used only when rounded turns are on and the radius isn't worked out from speed and G.
  const greyOut = (now) => {
    controls.setDisabled('radiusFromG', !now.roundedTurns);
    controls.setDisabled('manualRadiusFt', !now.roundedTurns || now.radiusFromG);
  };
  store.subscribe(greyOut);
  greyOut(store.get());

  const element = h(
    'div',
    { class: 'settings-panel' },
    h('h2', { class: 'settings-title' }, 'Settings'),
    h('p', { class: 'settings-hint' }, 'The tuning numbers. Every one starts filled in, so you can leave them alone.'),
    ...groups,
  );

  return {
    element,
    set: (next) => store.replace(pick(next)),
  };
}

// Only the settings this panel edits.
function pick(values) {
  return Object.fromEntries(PANEL_KEYS.filter((key) => values?.[key] !== undefined).map((key) => [key, values[key]]));
}
