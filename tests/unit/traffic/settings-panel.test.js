// The Traffic Sim's Settings panel (Patrick, 2026-09-30; specs/SPEC-traffic.md, R22):
// the tuning numbers start filled in, take only good values, report only what
// changed, and leave out a group whose feature isn't on the screen yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from '../ui-kit/fake-dom.js';
import { DEFAULTS, LIMITS } from '../../../src/modules/traffic/defaults.js';
import { PANEL_KEYS, RULES, createSettingsPanel } from '../../../src/modules/traffic/settings-panel.js';

const document = installFakeDocument();

// The stand-in DOM from the ui-kit tests only reads text. These few additions let a
// test set text, look up ids and clear attributes, as a browser does.
const nodeProto = Object.getPrototypeOf(Object.getPrototypeOf(document.createElement('div')));
const readText = Object.getOwnPropertyDescriptor(nodeProto, 'textContent').get;
Object.defineProperty(nodeProto, 'textContent', {
  configurable: true,
  get: readText,
  set(value) {
    this.childNodes = [];
    if (value !== '') this.appendChild(document.createTextNode(value));
  },
});
const elementProto = Object.getPrototypeOf(document.createElement('div'));
Object.defineProperty(elementProto, 'id', { configurable: true, get() { return this.attributes.id; } });
elementProto.removeAttribute = function removeAttribute(name) {
  delete this.attributes[name];
};
elementProto.value = ''; // a fresh input or select starts with an empty value, unchecked
elementProto.checked = false;
elementProto.disabled = false;

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

function setup(options = {}) {
  const changes = [];
  const panel = createSettingsPanel({ values: DEFAULTS, onChange: (patch, values) => changes.push({ patch, values }), ...options });
  return { panel, changes };
}

test('the panel edits only settings that have a default', () => {
  for (const key of PANEL_KEYS) assert.ok(Object.hasOwn(DEFAULTS, key), key);
  assert.equal(new Set(PANEL_KEYS).size, PANEL_KEYS.length);
});

test('at first it shows only the conflict limits and the route options', () => {
  const { panel } = setup();
  assert.deepEqual(legends(panel), ['Conflict limits', 'Route options']);
  assert.equal(words(tagged(panel.element, 'H2')[0]), 'Settings');
});

test('the rules, final spacing and missing traffic appear when the rules are on the screen; the photo group when the photo is', () => {
  const rules = setup({ available: { rules: true } }).panel;
  assert.deepEqual(legends(rules), ['Conflict limits', 'Rules', 'Route options']);
  for (const rule of RULES) assert.ok(box(rules, rule.label), rule.label);
  assert.ok(box(rules, 'Final spacing'));
  assert.ok(box(rules, 'Chance of missing traffic'));
  const photo = setup({ available: { photo: true } }).panel;
  assert.deepEqual(legends(photo), ['Conflict limits', 'Route options', 'Satellite photo']);
  assert.deepEqual(legends(setup({ available: { rules: true, photo: true } }).panel), ['Conflict limits', 'Rules', 'Route options', 'Satellite photo']);
  assert.throws(() => box(setup().panel, 'Final spacing'), /Final spacing/, 'not there until the rules are');
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

test('a panel given nothing starts at the defaults, and the values it is given win; settings it doesn\'t edit are ignored', () => {
  const bare = createSettingsPanel({});
  assert.equal(box(bare, 'Conflict: lateral').value, '200');
  const partial = createSettingsPanel({ values: { conflictLatFt: 350, windKt: 30, roundedTurns: false } });
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

test('set() shows new values in the boxes without calling onChange, and leaves the rest alone', () => {
  const { panel, changes } = setup({ available: { rules: true } });
  panel.set({ conflictLatFt: 1500, ruleFlyThrough: false, windKt: 12 });
  assert.equal(box(panel, 'Conflict: lateral').value, '1500');
  assert.equal(box(panel, RULES[2].label).checked, false);
  assert.equal(box(panel, 'Caution: lateral').value, '500');
  assert.equal(changes.length, 0);
  type(box(panel, 'Conflict: vertical'), '250');
  assert.equal(changes[0].values.conflictLatFt, 1500, 'later changes report the values that were set');
  assert.equal(changes[0].values.ruleFlyThrough, false);
});

test('the manual radius is greyed out while the radius comes from speed and G, and everything about turns while they are not rounded', () => {
  const { panel } = setup();
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
  panel.set({ radiusFromG: true });
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
  assert.ok(RULES.every((r) => r.hint.length < 160), 'one line each');
});
