// The Traffic Sim's settings: every tuning number behind one menu, closed at
// first so only the essentials show (Patrick, 2026-09-30; specs/SPEC-traffic.md
// and SPEC-ui-kit "Settings menu (R22)"). It fills the shared ui-kit settings
// menu, titled "Traffic settings", with four sections: Conflict limits (with the
// final spacing and the chance of missing traffic), Rules, Route options and
// Photo. Its Reset to defaults puts every one back to defaults.js.
//
//   const panel = createSettingsPanel({ controls, settings, onToggle, available, photoHome });
//   panel.element        put it in the layout's settings slot
//   controls, settings   the same ui-kit controls and settings the playback bar uses, so a box
//                        writes straight into the module's settings and follows them when they
//                        change from elsewhere (a profile loaded); this file keeps no copy
//   onToggle(collapsed)  called when the person opens or closes the menu
//
// A section whose feature isn't on the screen yet is left out, so no box sits there doing
// nothing (R3): available = { rules, photo }, each true once it is.
import { h } from '../../ui-kit/dom.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { DEFAULTS, LIMITS } from './defaults.js';

export const TITLE = 'Traffic settings';

let nextHint = 1;

// The rules, each with a one-line hint in pilots' words (the spec's "More pattern procedures from the SMM").
export const RULES = Object.freeze([
  { key: 'ruleExtendDownwind', label: 'Extend downwind when final is busy', hint: 'Carries on downwind when turning final would be too close.' },
  { key: 'ruleMoveOver', label: 'Move over when someone misses the traffic', hint: 'The one on final moves over and flies a low approach.' },
  { key: 'ruleFlyThrough', label: 'Fly through instead of breaking', hint: 'Flies through to the departure end instead of breaking.' },
  { key: 'ruleBreakAtDepartureEnd', label: 'Break at the departure end', hint: 'Delays a conflicting break to the departure end.' },
  { key: 'ruleClosedPattern', label: 'Closed pattern: extend, or join the normal pattern', hint: 'Waits on the departure leg, then joins the normal pattern.' },
]);

// Every setting this menu edits.
export const PANEL_KEYS = Object.freeze([
  'conflictLatFt', 'conflictVertFt', 'cautionLatFt', 'cautionVertFt', 'finalSpacingFt', 'missChancePct',
  ...RULES.map((r) => r.key),
  'roundedTurns', 'radiusFromG', 'manualRadiusFt',
  'photoOpacityPct', 'photoAboveGrid', 'photoTrim', 'photoEastFt', 'photoNorthFt',
]);

const defaultsFor = (keys) => Object.fromEntries(keys.map((key) => [key, DEFAULTS[key]]));

// The photo alignment a setup starts from; anything it doesn't give is the default.
const HOME_KEYS = ['photoTrim', 'photoEastFt', 'photoNorthFt'];
const pickHome = (home) => Object.fromEntries(HOME_KEYS.map((key) => [key, home?.[key] ?? DEFAULTS[key]]));

// Puts a one-line hint with a control and ties it to the control's input, so a screen reader reads it too.
// The hint shows on screen only while the pointer is over the control or it has focus (traffic.css).
function withHint(control, text) {
  const id = `traffic-settings-hint-${nextHint++}`;
  const input = [...control.childNodes].find((node) => node.tagName === 'INPUT');
  if (input) input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
  return h('div', { class: 'settings-item' }, control, h('p', { class: 'settings-hint', id }, text));
}

/**
 * controls, settings: the ui-kit controls bound to the traffic settings, and those settings.
 * onToggle(collapsed): the menu was opened or closed by the person.
 * available: { rules, photo }. photoHome: the alignment "Reset photo alignment" and Reset to
 * defaults go back to ({ photoTrim, photoEastFt, photoNorthFt }); the setup's own, or the defaults.
 * Returns { element, collapsed, setCollapsed(bool), dispose() }.
 */
export function createSettingsPanel({ controls, settings, onToggle, available = {}, photoHome = defaultsFor(HOME_KEYS) }) {
  const menu = createSettingsMenu({ title: TITLE, onToggle, onReset: () => settings.update({ ...defaultsFor(PANEL_KEYS), ...pickHome(photoHome) }) });
  const feet = (key, label, step = 50) => controls.number(key, { label, unit: 'ft', min: LIMITS[key][0], max: LIMITS[key][1], step });

  const limits = menu.section('Conflict limits');
  limits.append(
    withHint(feet('conflictLatFt', 'Conflict: lateral'), 'Inside this and the vertical limit is a conflict.'),
    withHint(feet('conflictVertFt', 'Conflict: vertical'), 'Inside this and the lateral limit is a conflict.'),
    withHint(feet('cautionLatFt', 'Caution: lateral'), 'Inside this and the vertical limit is a caution.'),
    withHint(feet('cautionVertFt', 'Caution: vertical'), 'Inside this and the lateral limit is a caution.'),
  );

  if (available.rules) {
    limits.append(
      withHint(feet('finalSpacingFt', 'Final spacing', 100), 'Closer behind the one on final, it extends downwind.'),
      withHint(
        controls.number('missChancePct', { label: 'Chance of missing traffic', unit: '%', min: LIMITS.missChancePct[0], max: LIMITS.missChancePct[1], step: 1 }),
        'How often a Random aircraft misses the one on final.',
      ),
    );
    menu.section('Rules').append(...RULES.map((rule) => withHint(controls.checkbox(rule.key, { label: rule.label }), rule.hint)));
  }

  menu.section('Route options').append(
    controls.checkbox('roundedTurns', { label: 'Fly rounded turns' }),
    controls.checkbox('radiusFromG', { label: 'Turn radius from speed and G' }),
    withHint(feet('manualRadiusFt', 'Manual turn radius', 100), 'Used only when the radius is not from speed and G.'),
  );

  if (available.photo) {
    const home = () => settings.update(pickHome(photoHome));
    menu.section('Photo').append(
      controls.number('photoOpacityPct', { label: 'Photo opacity', unit: '%', min: LIMITS.photoOpacityPct[0], max: LIMITS.photoOpacityPct[1], step: 5 }),
      controls.checkbox('photoAboveGrid', { label: 'Draw the photo above the grid' }),
      controls.number('photoTrim', { label: 'Photo scale trim', min: LIMITS.photoTrim[0], max: LIMITS.photoTrim[1], step: 0.01 }),
      feet('photoEastFt', 'Photo east / west offset', 100),
      feet('photoNorthFt', 'Photo north / south offset', 100),
      h('button', { type: 'button', class: 'button', onclick: home }, 'Reset photo alignment'),
    );
  }

  // The manual radius is used only when rounded turns are on and the radius isn't worked out from speed and G.
  const greyOut = (now) => {
    controls.setDisabled('radiusFromG', !now.roundedTurns);
    controls.setDisabled('manualRadiusFt', !now.roundedTurns || now.radiusFromG);
  };
  const stopGreying = settings.subscribe(greyOut);
  greyOut(settings.get());

  return {
    element: menu.element,
    get collapsed() {
      return menu.collapsed;
    },
    setCollapsed: menu.setCollapsed,
    dispose: stopGreying,
  };
}
