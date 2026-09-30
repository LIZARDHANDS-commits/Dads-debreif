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
import { PANEL_KEYS, RULES, TITLE, createSettingsPanel } from '../../../src/modules/traffic/settings-panel.js';

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
const tick = (input, on) => {
  input.checked = on;
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

test('at first it shows only the conflict limits and the route options', () => {
  const { panel } = setup();
  assert.deepEqual(legends(panel), ['Conflict limits', 'Route options']);
});

test('the rules, final spacing and missing traffic appear when the rules are on the screen; the photo section when the photo is', () => {
  const rules = setup({ available: { rules: true } }).panel;
  assert.deepEqual(legends(rules), ['Conflict limits', 'Rules', 'Route options']);
  for (const rule of RULES) assert.ok(box(rules, rule.label), rule.label);
  assert.ok(box(rules, 'Final spacing'));
  assert.ok(box(rules, 'Chance of missing traffic'));
  const photo = setup({ available: { photo: true } }).panel;
  assert.deepEqual(legends(photo), ['Conflict limits', 'Route options', 'Photo']);
  assert.deepEqual(legends(setup({ available: { rules: true, photo: true } }).panel), ['Conflict limits', 'Rules', 'Route options', 'Photo']);
  assert.throws(() => box(setup().panel, 'Final spacing'), /Final spacing/, 'not there until the rules are');
});

test('final spacing and the chance of missing traffic sit in Conflict limits, and the rules in their own section', () => {
  const { panel } = setup({ available: { rules: true } });
  const sections = tagged(panel.element, 'FIELDSET');
  const holding = (label) => words(tagged(sections.find((s) => tagged(s, 'LABEL').some((l) => words(l) === label)), 'LEGEND')[0]);
  for (const label of ['Conflict: lateral', 'Conflict: vertical', 'Caution: lateral', 'Caution: vertical', 'Final spacing', 'Chance of missing traffic']) assert.equal(holding(label), 'Conflict limits', label);
  for (const rule of RULES) assert.equal(holding(rule.label), 'Rules', rule.label);
  for (const label of ['Fly rounded turns', 'Turn radius from speed and G', 'Manual turn radius']) assert.equal(holding(label), 'Route options', label);
});

test('Reset to defaults puts every setting back to defaults.js, reporting just the ones that had moved, and asks nothing first', () => {
  const { panel, changes } = setup({ available: { rules: true, photo: true } });
  type(box(panel, 'Conflict: lateral'), '300');
  type(box(panel, 'Final spacing'), '4000');
  tick(box(panel, RULES[0].label), false);
  tick(box(panel, 'Fly rounded turns'), false);
  type(box(panel, 'Photo opacity'), '50');
  changes.length = 0;
  buttonNamed(panel, 'Reset to defaults').dispatch('click');
  assert.equal(changes.length, 1, 'one report, no confirmation step');
  assert.deepEqual(changes[0].patch, { conflictLatFt: DEFAULTS.conflictLatFt, finalSpacingFt: DEFAULTS.finalSpacingFt, [RULES[0].key]: true, flyRoundedTurns: true, photoOpacityPct: 100 });
  for (const key of PANEL_KEYS) assert.equal(changes[0].values[key], DEFAULTS[key], key);
  assert.equal(box(panel, 'Conflict: lateral').value, '200');
  assert.equal(box(panel, 'Final spacing').value, '3000');
  assert.equal(box(panel, RULES[0].label).checked, true);
  assert.equal(box(panel, 'Fly rounded turns').checked, true);
  assert.equal(box(panel, 'Photo opacity').value, '100');
});

test('Reset to defaults takes the photo alignment from the setup, not from the defaults', () => {
  const { panel, changes } = setup({ available: { photo: true }, photoHome: { photoTrim: 1.0, photoEastFt: 100, photoNorthFt: -200 } });
  type(box(panel, 'Photo scale trim'), '0.9');
  type(box(panel, 'Photo opacity'), '50');
  type(box(panel, 'Conflict: lateral'), '300');
  buttonNamed(panel, 'Reset to defaults').dispatch('click');
  assert.equal(box(panel, 'Photo scale trim').value, '1', 'the setup\'s trim of 1.0, not 1.2');
  assert.equal(box(panel, 'Photo east / west offset').value, '100');
  assert.equal(box(panel, 'Photo north / south offset').value, '-200');
  assert.equal(box(panel, 'Photo opacity').value, '100', 'everything else goes to the defaults');
  assert.equal(box(panel, 'Conflict: lateral').value, '200');
  assert.equal(changes.at(-1).values.photoTrim, 1.0);
});

test('Reset to defaults with nothing changed reports nothing, and it clears a refused number too', () => {
  const { panel, changes } = setup();
  buttonNamed(panel, 'Reset to defaults').dispatch('click');
  assert.equal(changes.length, 0);
  const lateral = box(panel, 'Conflict: lateral');
  type(lateral, '999999');
  assert.equal(lateral.getAttribute('aria-invalid'), 'true');
  type(lateral, '300');
  buttonNamed(panel, 'Reset to defaults').dispatch('click');
  assert.equal(lateral.value, '200');
  assert.equal(lateral.getAttribute('aria-invalid'), null);
});

test('every box starts at its default, as the spec\'s table says', () => {
  const { panel } = setup({ available: { rules: true, photo: true } });
  const numbers = {
    'Conflict: lateral': '200', 'Conflict: vertical': '200', 'Caution: lateral': '500', 'Caution: vertical': '500',
    'Final spacing': '3000', 'Chance of missing traffic': '10', 'Manual turn radius': '1800',
    'Photo opacity': '100', 'Photo scale trim': '1.2', 'Photo east / west offset': '0', 'Photo north / south offset': '0',
  };
  for (const [label, value] of Object.entries(numbers)) assert.equal(box(panel, label).value, value, label);
  for (const rule of RULES) assert.equal(box(panel, rule.label).checked, true, `${rule.label} is on`);
  for (const label of ['Fly rounded turns', 'Turn radius from speed and G', 'Draw the photo above the grid']) assert.equal(box(panel, label).checked, true, label);
});

test('the boxes start at the settings\' values, so a saved or loaded setting shows', () => {
  const partial = setup({ start: { conflictLatFt: 350, windKt: 30, flyRoundedTurns: false } }).panel;
  assert.equal(box(partial, 'Conflict: lateral').value, '350');
  assert.equal(box(partial, 'Caution: lateral').value, '500');
  assert.equal(box(partial, 'Fly rounded turns').checked, false);
});

test('every box has a visible label, so screen readers say what it is', () => {
  const { panel } = setup({ available: { rules: true, photo: true } });
  const labelled = new Set(tagged(panel.element, 'LABEL').map((l) => l.getAttribute('for')));
  const inputs = tagged(panel.element, 'INPUT');
  assert.equal(inputs.length, 19, '11 number boxes and 8 checkboxes');
  for (const input of inputs) assert.ok(labelled.has(input.id), `input ${input.id} has a label`);
});

test('a good number goes to onChange as just that setting, with every value alongside', () => {
  const { panel, changes } = setup();
  type(box(panel, 'Conflict: lateral'), '300');
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].patch, { conflictLatFt: 300 });
  assert.equal(changes[0].values.conflictLatFt, 300);
  assert.equal(changes[0].values.cautionLatFt, 500);
  assert.equal(changes[0].values.finalSpacingFt, DEFAULTS.finalSpacingFt);
});

test('a number outside its limits, a blank or a minus is refused with a message and the last good value stays', () => {
  const { panel, changes } = setup();
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
  const radius = box(panel, 'Manual turn radius');
  type(radius, '99');
  assert.match(messageFor(radius), /from 100 to 20,000 ft/);
});

test('the boxes take the limits from the spec', () => {
  const { panel } = setup({ available: { rules: true, photo: true } });
  const limits = {
    'Conflict: lateral': LIMITS.conflictLatFt, 'Conflict: vertical': LIMITS.conflictVertFt, 'Caution: lateral': LIMITS.cautionLatFt,
    'Caution: vertical': LIMITS.cautionVertFt, 'Final spacing': LIMITS.finalSpacingFt, 'Chance of missing traffic': LIMITS.missChancePct,
    'Manual turn radius': LIMITS.manualRadiusFt, 'Photo opacity': LIMITS.photoOpacityPct, 'Photo scale trim': LIMITS.photoTrim,
  };
  for (const [label, [min, max]] of Object.entries(limits)) {
    const input = box(panel, label);
    assert.deepEqual([Number(input.getAttribute('min')), Number(input.getAttribute('max'))], [min, max], label);
  }
});

test('a rule switches off and on, and a checkbox change goes to onChange', () => {
  const { panel, changes } = setup({ available: { rules: true } });
  tick(box(panel, RULES[1].label), false);
  assert.deepEqual(changes.at(-1).patch, { ruleMoveOver: false });
  assert.equal(changes.at(-1).values.ruleMoveOver, false);
  assert.equal(changes.at(-1).values.ruleFlyThrough, true, 'the other rules are as they were');
  tick(box(panel, RULES[1].label), true);
  assert.deepEqual(changes.at(-1).patch, { ruleMoveOver: true });
});

test('a value that is set to what it already is is not a change', () => {
  const { panel, changes } = setup();
  type(box(panel, 'Conflict: lateral'), '200');
  assert.equal(changes.length, 0);
});

test('the boxes follow the settings when they change from elsewhere, and a box writes straight into them', () => {
  const { panel, changes, settings } = setup({ available: { rules: true } });
  settings.update({ conflictLatFt: 1500, ruleFlyThrough: false, windKt: 12 });
  assert.equal(box(panel, 'Conflict: lateral').value, '1500');
  assert.equal(box(panel, RULES[2].label).checked, false);
  assert.equal(box(panel, 'Caution: lateral').value, '500');
  changes.length = 0;
  type(box(panel, 'Conflict: vertical'), '250');
  assert.equal(settings.get().conflictVertFt, 250, 'the module\'s own settings hold it; the panel keeps no copy');
  assert.equal(changes[0].values.conflictLatFt, 1500);
  assert.equal(changes[0].values.ruleFlyThrough, false);
});

test('the manual radius is greyed out while the radius comes from speed and G, and everything about turns while they are not rounded', () => {
  const { panel, settings } = setup();
  const manual = box(panel, 'Manual turn radius');
  const fromG = box(panel, 'Turn radius from speed and G');
  assert.equal(manual.disabled, true, 'radius from speed and G is on at first');
  tick(fromG, false);
  assert.equal(manual.disabled, false);
  tick(box(panel, 'Fly rounded turns'), false);
  assert.equal(manual.disabled, true);
  assert.equal(fromG.disabled, true);
  tick(box(panel, 'Fly rounded turns'), true);
  assert.equal(fromG.disabled, false);
  assert.equal(manual.disabled, false, 'still off, so the manual radius is used');
  settings.update({ radiusFromG: true });
  assert.equal(manual.disabled, true);
  // The greyed-out value keeps its number.
  assert.equal(manual.value, '1800');
});

test('Reset photo alignment goes back to the setup\'s own alignment', () => {
  const { panel, changes } = setup({ available: { photo: true }, photoHome: { photoTrim: 1.0, photoEastFt: 100, photoNorthFt: -200 } });
  type(box(panel, 'Photo scale trim'), '0.9');
  type(box(panel, 'Photo east / west offset'), '900');
  const reset = tagged(panel.element, 'BUTTON').find((b) => words(b) === 'Reset photo alignment');
  assert.ok(reset);
  reset.dispatch('click');
  assert.deepEqual(changes.at(-1).patch, { photoTrim: 1.0, photoEastFt: 100, photoNorthFt: -200 });
  assert.equal(box(panel, 'Photo scale trim').value, '1');
  assert.equal(box(panel, 'Photo east / west offset').value, '100');
  assert.equal(box(panel, 'Photo north / south offset').value, '-200');
  assert.equal(box(panel, 'Photo opacity').value, '100', 'the opacity is not part of the alignment');
});

test('with no setup alignment given, Reset photo alignment goes back to the defaults', () => {
  const { panel } = setup({ available: { photo: true } });
  type(box(panel, 'Photo scale trim'), '0.9');
  tagged(panel.element, 'BUTTON').find((b) => words(b) === 'Reset photo alignment').dispatch('click');
  assert.equal(box(panel, 'Photo scale trim').value, '1.2');
});

test('the less obvious settings carry a one-line hint that a screen reader reads with the box', () => {
  const { panel } = setup({ available: { rules: true } });
  for (const rule of RULES) {
    const input = box(panel, rule.label);
    const hint = all(panel.element, (n) => n.getAttribute?.('id') === input.getAttribute('aria-describedby'))[0];
    assert.equal(hint.textContent, rule.hint, rule.label);
  }
  // A number box keeps its error message and adds the hint.
  const spacing = box(panel, 'Final spacing');
  assert.equal(spacing.getAttribute('aria-describedby').split(' ').length, 2);
  assert.ok(RULES.every((r) => r.hint.length <= 60), 'one short line each');
  const everyHint = all(panel.element, (n) => n.getAttribute?.('class') === 'settings-hint');
  assert.ok(everyHint.length >= 10);
  for (const hint of everyHint) assert.ok(hint.textContent.length <= 60, `"${hint.textContent}" is one short line`);
});

test('the 3D view\'s Paint choice is in the menu, Harvard first and by default, and Reset to defaults puts it back', () => {
  const { panel, settings } = setup({ available: { view3d: true } });
  assert.ok(legends(panel).length >= 0);
  const selects = tagged(panel.element, 'SELECT');
  assert.equal(selects.length, 1);
  const label = tagged(panel.element, 'LABEL').find((l) => words(l) === 'Paint');
  assert.ok(label, 'a "Paint" label');
  assert.equal(selects[0].id, label.getAttribute('for'));
  const options = tagged(selects[0], 'OPTION').map(words);
  assert.deepEqual(options, ['Harvard', 'Ship colours']);
  assert.equal(settings.get().paint, 'harvard');
  assert.equal(DEFAULTS.paint, 'harvard');
  selects[0].value = '1';
  selects[0].dispatch('change');
  assert.equal(settings.get().paint, 'ship');
  const reset = tagged(panel.element, 'BUTTON').find((b) => words(b) === 'Reset to defaults');
  reset.dispatch('click');
  assert.equal(settings.get().paint, 'harvard');
});

test('without the 3D view there is no Paint choice (R3)', () => {
  const { panel } = setup({ available: {} });
  assert.equal(tagged(panel.element, 'SELECT').length, 0);
});
