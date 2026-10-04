// The Traffic Sim's settings: every tuning number behind one menu, closed at
// first so only the essentials show (Patrick, 2026-09-30; specs/SPEC-traffic.md
// and SPEC-ui-kit "Settings menu (R22)"). It fills the shared ui-kit settings
// menu, titled "Traffic settings", with sections: Conflict limits, Photo (opacity)
// and 3D view (Paint). Its Reset to Standard Defaults puts every one back to defaults.js (D384).
//
//   const panel = createSettingsPanel({ controls, settings, onToggle, available });
//   panel.element        put it in the layout's settings slot
//   controls, settings   the same ui-kit controls and settings the playback bar uses, so a box
//                        writes straight into the module's settings and follows them when they
//                        change from elsewhere (a profile loaded); this file keeps no copy
//   onToggle(collapsed)  called when the person opens or closes the menu
//
// A section whose feature isn't on the screen yet is left out, so no box sits there doing
// nothing (R3): available = { photo, view3d }, each true once it is.
import { h } from '../../ui-kit/dom.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { DEFAULTS, LIMITS } from './defaults.js';

export const TITLE = 'Traffic settings';

let nextHint = 1;

// Every setting this menu edits.
export const PANEL_KEYS = Object.freeze([
  'conflictLatFt',
  'conflictVertFt',
  'cautionLatFt',
  'cautionVertFt',
  'closedPatternBankDeg',
  'closedPatternPitchDeg',
  'photoOpacityPct',
  'paint',
  'graphicsQuality',
]);

const defaultsFor = (keys) => Object.fromEntries(keys.map((key) => [key, DEFAULTS[key]]));

// Puts a one-line hint with a control and ties it to the control's input, so a screen reader reads it too.
// The hint shows on screen only while the pointer is over the control or it has focus (traffic.css).
function withHint(control, text) {
  const id = `traffic-settings-hint-${nextHint++}`;
  const input = [...control.childNodes].find((node) => node.tagName === 'INPUT' || node.tagName === 'SELECT');
  if (input) input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
  return h('div', { class: 'settings-item' }, control, h('p', { class: 'settings-hint', id }, text));
}

/**
 * controls, settings: the ui-kit controls bound to the traffic settings, and those settings.
 * onToggle(collapsed): the menu was opened or closed by the person.
 * available: { photo, view3d }.
 * photoHome: optional, retained for compatibility.
 * Returns { element, collapsed, setCollapsed(bool), dispose() }.
 * @param {{ controls?: any, settings?: any, onToggle?: (collapsed: boolean) => void, available?: { photo?: boolean, view3d?: boolean }, photoHome?: Record<string, any> }} [options]
 */
export function createSettingsPanel({ controls, settings, onToggle, available = {}, photoHome } = {}) {
  const menu = createSettingsMenu({
    title: TITLE,
    resetLabel: 'Reset to Standard Defaults',
    onToggle,
    onReset: () => settings.update(defaultsFor(PANEL_KEYS)),
  });

  const findResetButton = (node) => {
    if (node?.getAttribute?.('class') === 'settings-reset') return node;
    for (const child of node?.childNodes ?? []) {
      const found = findResetButton(child);
      if (found) return found;
    }
    return null;
  };
  const resetBtn = findResetButton(menu.element);
  if (resetBtn) resetBtn.setAttribute('title', 'Reset to Standard Defaults');

  const feet = (key, label, step = 50) => controls.number(key, { label, unit: 'ft', min: LIMITS[key][0], max: LIMITS[key][1], step });

  const limits = menu.section('Conflict limits');
  limits.append(
    withHint(feet('conflictLatFt', 'Conflict: lateral'), 'Inside this and the vertical limit is a conflict.'),
    withHint(feet('conflictVertFt', 'Conflict: vertical'), 'Inside this and the lateral limit is a conflict.'),
    withHint(feet('cautionLatFt', 'Caution: lateral'), 'Inside this and the vertical limit is a caution.'),
    withHint(feet('cautionVertFt', 'Caution: vertical'), 'Inside this and the lateral limit is a caution.'),
  );

  const closedSec = menu.section('Closed pattern');
  closedSec.append(
    withHint(controls.select('closedPatternBankDeg', {
      label: 'Bank angle',
      options: [
        { value: 45, label: '45°' },
        { value: 50, label: '50° (Standard)' },
        { value: 60, label: '60°' },
      ],
    }), 'Target bank angle for closed pattern climbing turn.'),
    withHint(controls.number('closedPatternPitchDeg', {
      label: 'Pitch angle',
      unit: '°',
      min: LIMITS.closedPatternPitchDeg[0],
      max: LIMITS.closedPatternPitchDeg[1],
      step: 1,
    }), 'Target pitch attitude during initial climb.'),
  );

  if (available.photo) {
    menu.section('Photo').append(
      controls.number('photoOpacityPct', { label: 'Photo opacity', unit: '%', min: LIMITS.photoOpacityPct[0], max: LIMITS.photoOpacityPct[1], step: 5 }),
    );
  }

  if (available.view3d) {
    const sec3d = menu.section('3D view');
    sec3d.append(
      withHint(controls.select('graphicsQuality', {
        label: 'Graphics',
        options: [
          { value: 'high', label: 'High (Sharp satellite & full 3D)' },
          { value: 'low', label: 'Performance (Fast & low memory)' },
        ],
      }), 'High loads sharp zoom-18 satellite tiles and up to 24 full Harvard models. Performance saves memory and runs faster on slower laptops.'),
      withHint(controls.select('paint', { label: 'Paint', options: PAINT_OPTIONS }), 'Shows zoomed right in; from further off, a plain T-6.'),
    );
  }

  return {
    element: menu.element,
    get collapsed() {
      return menu.collapsed;
    },
    setCollapsed: menu.setCollapsed,
    dispose: () => {},
  };
}
