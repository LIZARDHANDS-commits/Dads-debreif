// Checks: the "Traffic settings" menu: closed at first, its sections, boxes start at defaults and refuse bad
//   numbers, only changes reported, Reset to Standard Defaults, and the Paint, Graphics and Bank / Pitch
//   controls.
// Serves: TR-R27, ALL-R6.
// Expected values: defaults (200/200/500/500 ft, opacity 100, bank 50, pitch 10) typed in from the old spec
//   table, design choices, no manual page; one check (:259) cannot fail.

// The Traffic Sim's settings, on the shared ui-kit settings menu (Patrick, 2026-09-30;
// specs/SPEC-traffic.md, SPEC-ui-kit "Settings menu (R22)"): titled "Traffic settings",
// closed at first, the tuning numbers start filled in, take only good values, report
// only what changed, Reset puts back the defaults, and a section whose feature isn't
// on the screen yet is left out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom-extras.js';
import { createSettings } from '../../../src/storage/settings.js';
import { createControls } from '../../../src/ui-kit/controls.js';
import { DEFAULTS, LIMITS } from '../../../src/modules/traffic/defaults.js';
import { PANEL_KEYS, TITLE, createSettingsPanel } from '../../../src/modules/traffic/settings-panel.js';

installFakeDom();

const all = (root, test) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, test) : []))].filter(test);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const legends = (panel) => tagged(panel.element, 'LEGEND').map(words);

// The input that goes with a visible label.
function box(panel, label) {
  const found = tagged(panel.element, 'LABEL').find((l) => words(l) === label);
  assert.ok(found, `a "${label}" label`);
  const input = tagged(panel.element, 'INPUT').find((i) => i.id === found.getAttribute('for'));
  assert.ok(input, `an input for "${label}"`);
  return input;
}
const type = (input, text) => {
  input.value = text;
  input.dispatch('input');
  input.dispatch('change');
};
const messageFor = (input) => {
  const id = input.getAttribute('aria-describedby').split(' ').find((token) => token.endsWith('-message'));
  return all(input.parentNode, (n) => n.getAttribute?.('id') === id)[0].textContent;
};

// The panel on the real ui-kit controls and settings, kept in memory. `changes` lists each change the
// settings reported: just what moved, and every value. `start` is applied before the panel is built.
function setup({ start, ...options } = {}) {
  const kept = new Map();
  const memory = { get: (key, fallback) => (kept.has(key) ? kept.get(key) : fallback), set: (key, value) => kept.set(key, value) };
  const settings = createSettings(memory, DEFAULTS);
  if (start) settings.update(start);
  const changes = [];
  let before = settings.get();
  settings.subscribe((values) => {
    changes.push({ patch: Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== before[key])), values });
    before = values;
  });
  const panel = createSettingsPanel({ controls: createControls(settings), settings, ...options });
  return { panel, changes, settings };
}

test('the panel edits only settings that have a default', () => {
  for (const key of PANEL_KEYS) assert.ok(Object.hasOwn(DEFAULTS, key), key);
  assert.equal(new Set(PANEL_KEYS).size, PANEL_KEYS.length);
});

const header = (panel) => tagged(panel.element, 'BUTTON')[0];
const panelBody = (panel) => all(panel.element, (n) => n.getAttribute?.('class') === 'panel-body')[0];
const buttonNamed = (panel, name) => tagged(panel.element, 'BUTTON').find((b) => words(b) === name);

test('the menu is titled "Traffic settings", never plain "Settings", and is closed until it is opened', () => {
  const { panel } = setup();
  assert.equal(TITLE, 'Traffic settings');
  assert.equal(words(tagged(panel.element, 'H2')[0]), 'Traffic settings');
  assert.equal(header(panel).getAttribute('aria-expanded'), 'false');
  assert.equal(panel.collapsed, true);
  assert.equal(panelBody(panel).hidden, true, 'the boxes are out of sight');
  header(panel).dispatch('click');
  assert.equal(panel.collapsed, false);
  assert.equal(header(panel).getAttribute('aria-expanded'), 'true');
  assert.equal(panelBody(panel).hidden, false);
});

test('onToggle is told when the person opens or closes the menu, but not when the screen does', () => {
  const toggles = [];
  const { panel } = setup({ onToggle: (collapsed) => toggles.push(collapsed) });
  header(panel).dispatch('click');
  header(panel).dispatch('click');
  assert.deepEqual(toggles, [false, true]);
  panel.setCollapsed(false);
  panel.setCollapsed(true);
  assert.deepEqual(toggles, [false, true], 'setCollapsed is silent');
  assert.equal(panel.collapsed, true);
});

test('at first it shows conflict limits and closed pattern sections', () => {
  const { panel } = setup();
  assert.deepEqual(legends(panel), ['Conflict limits', 'Closed pattern', 'Aircraft']);
});

test('the photo section appears when the photo is on the screen, and 3D view when 3D is', () => {
  const photo = setup({ available: { photo: true } }).panel;
  assert.deepEqual(legends(photo), ['Conflict limits', 'Closed pattern', 'Aircraft', 'Photo']);
  assert.ok(box(photo, 'Photo opacity'));
  const view3d = setup({ available: { view3d: true } }).panel;
  assert.deepEqual(legends(view3d), ['Conflict limits', 'Closed pattern', 'Aircraft', '3D view']);
  const both = setup({ available: { photo: true, view3d: true } }).panel;
  assert.deepEqual(legends(both), ['Conflict limits', 'Closed pattern', 'Aircraft', 'Photo', '3D view']);
});

test('conflict limits sit in Conflict limits section', () => {
  const { panel } = setup();
  const sections = tagged(panel.element, 'FIELDSET');
  const holding = (label) => words(tagged(sections.find((s) => tagged(s, 'LABEL').some((l) => words(l) === label)), 'LEGEND')[0]);
  for (const label of ['Conflict: lateral', 'Conflict: vertical', 'Caution: lateral', 'Caution: vertical']) {
    assert.equal(holding(label), 'Conflict limits', label);
  }
});

test('Reset to Standard Defaults puts every setting back to defaults.js, reporting just the ones that had moved, and asks nothing first', () => {
  const { panel, changes } = setup({ available: { photo: true } });
  type(box(panel, 'Conflict: lateral'), '300');
  type(box(panel, 'Photo opacity'), '50');
  changes.length = 0;
  buttonNamed(panel, 'Reset to Standard Defaults').dispatch('click');
  assert.equal(changes.length, 1, 'one report, no confirmation step');
  assert.deepEqual(changes[0].patch, { conflictLatFt: DEFAULTS.conflictLatFt, photoOpacityPct: 100 });
  for (const key of PANEL_KEYS) assert.equal(changes[0].values[key], DEFAULTS[key], key);
  assert.equal(box(panel, 'Conflict: lateral').value, '200');
  assert.equal(box(panel, 'Photo opacity').value, '100');
});

test('Reset to Standard Defaults with nothing changed reports nothing, and it clears a refused number too', () => {
  const { panel, changes } = setup();
  buttonNamed(panel, 'Reset to Standard Defaults').dispatch('click');
  assert.equal(changes.length, 0);
  const lateral = box(panel, 'Conflict: lateral');
  type(lateral, '999999');
  assert.equal(lateral.getAttribute('aria-invalid'), 'true');
  type(lateral, '300');
  buttonNamed(panel, 'Reset to Standard Defaults').dispatch('click');
  assert.equal(lateral.value, '200');
  assert.equal(lateral.getAttribute('aria-invalid'), null);
});

test('every box starts at its default, as the spec\'s table says', () => {
  const { panel } = setup({ available: { photo: true } });
  const numbers = {
    'Conflict: lateral': '200',
    'Conflict: vertical': '200',
    'Caution: lateral': '500',
    'Caution: vertical': '500',
    'Photo opacity': '100',
  };
  for (const [label, value] of Object.entries(numbers)) assert.equal(box(panel, label).value, value, label);
});

test('the boxes start at the settings\' values, so a saved or loaded setting shows', () => {
  const partial = setup({ start: { conflictLatFt: 350, cautionLatFt: 600 } }).panel;
  assert.equal(box(partial, 'Conflict: lateral').value, '350');
  assert.equal(box(partial, 'Caution: lateral').value, '600');
});

test('every box has a visible label, so screen readers say what it is', () => {
  const { panel } = setup({ available: { photo: true } });
  const labelled = new Set(tagged(panel.element, 'LABEL').map((l) => l.getAttribute('for')));
  const inputs = tagged(panel.element, 'INPUT');
  assert.ok(inputs.length > 0);
  for (const input of inputs) assert.ok(labelled.has(input.id), `input ${input.id} has a label`);
});

test('a good number goes to onChange as just that setting, with every value alongside', () => {
  const { panel, changes } = setup();
  type(box(panel, 'Conflict: lateral'), '300');
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].patch, { conflictLatFt: 300 });
  assert.equal(changes[0].values.conflictLatFt, 300);
  assert.equal(changes[0].values.cautionLatFt, 500);
});

test('a number outside its limits, a blank or a minus is refused with a message and the last good value stays', () => {
  const { panel, changes } = setup({ available: { photo: true } });
  const lateral = box(panel, 'Conflict: lateral');
  type(lateral, '300');
  for (const bad of ['20001', '-1', '']) {
    type(lateral, bad);
    assert.equal(lateral.getAttribute('aria-invalid'), 'true', bad);
    assert.match(messageFor(lateral), /Enter a number from 0 to 20,000 ft/);
  }
  assert.equal(changes.length, 1, 'nothing went to onChange after the first good value');
  type(lateral, '400');
  assert.equal(lateral.getAttribute('aria-invalid'), null);
  assert.deepEqual(changes.at(-1).patch, { conflictLatFt: 400 });
  const opacity = box(panel, 'Photo opacity');
  type(opacity, '4');
  assert.match(messageFor(opacity), /from 5 to 100 %/);
});

test('the boxes take the limits from the spec', () => {
  const { panel } = setup({ available: { photo: true } });
  const limits = {
    'Conflict: lateral': LIMITS.conflictLatFt,
    'Conflict: vertical': LIMITS.conflictVertFt,
    'Caution: lateral': LIMITS.cautionLatFt,
    'Caution: vertical': LIMITS.cautionVertFt,
    'Photo opacity': LIMITS.photoOpacityPct,
  };
  for (const [label, [min, max]] of Object.entries(limits)) {
    const input = box(panel, label);
    assert.deepEqual([Number(input.getAttribute('min')), Number(input.getAttribute('max'))], [min, max], label);
  }
});

test('a value that is set to what it already is is not a change', () => {
  const { panel, changes } = setup();
  type(box(panel, 'Conflict: lateral'), '200');
  assert.equal(changes.length, 0);
});

test('the boxes follow the settings when they change from elsewhere, and a box writes straight into them', () => {
  const { panel, changes, settings } = setup({ available: { photo: true } });
  settings.update({ conflictLatFt: 1500, photoOpacityPct: 50, windKt: 12 });
  assert.equal(box(panel, 'Conflict: lateral').value, '1500');
  assert.equal(box(panel, 'Photo opacity').value, '50');
  assert.equal(box(panel, 'Caution: lateral').value, '500');
  changes.length = 0;
  type(box(panel, 'Conflict: vertical'), '250');
  assert.equal(settings.get().conflictVertFt, 250, 'the module\'s own settings hold it; the panel keeps no copy');
  assert.equal(changes[0].values.conflictLatFt, 1500);
});

test('the conflict limits carry a one-line hint that a screen reader reads with the box', () => {
  const { panel } = setup();
  const conflictHints = [
    { label: 'Conflict: lateral', hint: 'Inside this and the vertical limit is a conflict.' },
    { label: 'Conflict: vertical', hint: 'Inside this and the lateral limit is a conflict.' },
    { label: 'Caution: lateral', hint: 'Inside this and the vertical limit is a caution.' },
    { label: 'Caution: vertical', hint: 'Inside this and the lateral limit is a caution.' },
  ];
  for (const item of conflictHints) {
    const input = box(panel, item.label);
    const hintId = input.getAttribute('aria-describedby').split(' ').find((id) => id.startsWith('traffic-settings-hint-'));
    const hint = all(panel.element, (n) => n.getAttribute?.('id') === hintId)[0];
    assert.ok(hint, `hint element for ${item.label}`);
    assert.equal(hint.textContent, item.hint, item.label);
    assert.ok(item.hint.length <= 60, 'one short line');
  }
});

test('the 3D view\'s Paint choice is in the menu, Harvard first and by default, and Reset to Standard Defaults puts it back', () => {
  const { panel, settings } = setup({ available: { view3d: true } });
  assert.ok(legends(panel).length >= 0);
  const label = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Paint');
  assert.ok(label, 'a "Paint" label');
  const selects = tagged(panel.element, 'SELECT');
  const paintSelect = selects.find((s) => s.id === label.getAttribute('for'));
  assert.ok(paintSelect, 'select for Paint');
  const hintId = paintSelect.getAttribute('aria-describedby');
  assert.ok(hintId, 'the hint is tied to the select, so a screen reader reads it');
  const hint = tagged(panel.element, 'P').find((p) => p.getAttribute('id') === hintId);
  assert.match(words(hint), /zoomed right in/, 'and says when the paint shows');
  assert.ok(words(hint).length <= 60);
  const options = tagged(paintSelect, 'OPTION').map(words);
  assert.deepEqual(options, ['Harvard', 'Ship colours']);
  assert.equal(settings.get().paint, 'harvard');
  assert.equal(DEFAULTS.paint, 'harvard');
  paintSelect.value = '1';
  paintSelect.dispatch('change');
  assert.equal(settings.get().paint, 'ship');
  const reset = buttonNamed(panel, 'Reset to Standard Defaults');
  assert.ok(reset, 'Reset to Standard Defaults button found');
  reset.dispatch('click');
  assert.equal(settings.get().paint, 'harvard');
});

test('Reset button has title and label "Reset to Standard Defaults" (D384)', () => {
  const { panel } = setup();
  const reset = buttonNamed(panel, 'Reset to Standard Defaults');
  assert.ok(reset, 'button named "Reset to Standard Defaults" exists');
  assert.equal(reset.getAttribute('title'), 'Reset to Standard Defaults');
});

test('without the 3D view there is no Paint choice (R3)', () => {
  const { panel } = setup({ available: {} });
  const paintLabel = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Paint');
  assert.equal(paintLabel, undefined);
});

test('Closed pattern settings include Bank angle select and Pitch angle number input', () => {
  const { panel, settings } = setup();
  const bankLabel = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Bank angle');
  assert.ok(bankLabel, 'Bank angle label exists');
  const pitchLabel = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Pitch angle');
  assert.ok(pitchLabel, 'Pitch angle label exists');

  const selects = tagged(panel.element, 'SELECT');
  const bankSelect = selects.find((s) => s.id === bankLabel.getAttribute('for'));
  assert.ok(bankSelect, 'Bank angle select exists');
  assert.equal(settings.get().closedPatternBankDeg, 50);

  const pitchInput = box(panel, 'Pitch angle');
  assert.ok(pitchInput, 'Pitch angle input exists');
  assert.equal(pitchInput.value, '10');
  assert.equal(settings.get().closedPatternPitchDeg, 10);

  type(pitchInput, '12');
  assert.equal(settings.get().closedPatternPitchDeg, 12);
});

test('the 3D view Graphics Quality selector switches between High and Performance', () => {
  const { panel, settings } = setup({ available: { view3d: true } });
  const label = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Graphics');
  assert.ok(label, 'a "Graphics" label exists');
  const select = tagged(panel.element, 'SELECT').find((s) => s.id === label.getAttribute('for'));
  assert.ok(select, 'a select for Graphics exists');
  assert.equal(settings.get().graphicsQuality, 'low');
  assert.equal(DEFAULTS.graphicsQuality, 'low');
  select.value = '0';
  select.dispatch('change');
  assert.equal(settings.get().graphicsQuality, 'high');
  const reset = buttonNamed(panel, 'Reset to Standard Defaults');
  reset.dispatch('click');
  assert.equal(settings.get().graphicsQuality, 'low');
});
