// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// controls.viewSwitch: the one 2D | 3D switch every simulator shares (D141).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from './fake-dom.js';
import { createControls, VIEW_DEFAULT, VIEW_ALLOWED } from '../../../src/ui-kit/controls.js';

installFakeDocument();

function all(node, tag, found = []) {
  for (const child of node.childNodes) {
    if (child.tagName === tag) found.push(child);
    all(child, tag, found);
  }
  return found;
}

// A minimal { get, update, subscribe } like storage/settings.js.
function fakeSettings(values) {
  let current = { ...values };
  const subs = new Set();
  return {
    get: () => current,
    update(patch) {
      current = { ...current, ...patch };
      for (const fn of subs) fn(current);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

test('modules seed the view setting from VIEW_DEFAULT (2D) and VIEW_ALLOWED', () => {
  assert.equal(VIEW_DEFAULT, '2d');
  assert.deepEqual(VIEW_ALLOWED, ['2d', '3d']);
  assert.ok(Object.isFrozen(VIEW_ALLOWED), 'a module cannot change the shared list');
});

test('viewSwitch is a "View" choice with 2D then 3D, and the setting picks the radio', () => {
  const settings = fakeSettings({ view: VIEW_DEFAULT });
  const controls = createControls(settings);
  const el = controls.viewSwitch();
  assert.equal(el.tagName, 'FIELDSET');
  assert.equal(all(el, 'LEGEND')[0].textContent, 'View');
  const inputs = all(el, 'INPUT');
  assert.deepEqual(inputs.map((i) => i.value), ['2d', '3d']);
  assert.deepEqual(all(el, 'SPAN').map((s) => s.textContent), ['2D', '3D']);
  assert.deepEqual(inputs.map((i) => i.checked), [true, false]);
  controls.dispose();
});

test('choosing 3D writes the setting, and the switch follows outside changes', () => {
  const settings = fakeSettings({ view: '2d' });
  const controls = createControls(settings);
  const inputs = all(controls.viewSwitch(), 'INPUT');
  inputs[1].checked = true;
  inputs[1].dispatch('change');
  assert.equal(settings.get().view, '3d');
  settings.update({ view: '2d' });
  assert.deepEqual(inputs.map((i) => i.checked), [true, false]);
  controls.dispose();
});

test('viewSwitch(key) binds another setting, and setDisabled greys it out', () => {
  const settings = fakeSettings({ mode: '3d' });
  const controls = createControls(settings);
  const el = controls.viewSwitch('mode');
  assert.deepEqual(all(el, 'INPUT').map((i) => i.checked), [false, true]);
  controls.setDisabled('mode', true);
  assert.equal(el.disabled, true);
  controls.dispose();
});

test('setDisabled marks the whole control aria-disabled, and clears it when turned back on', () => {
  const settings = fakeSettings({ bubbleFt: 1000, mode: '2d', on: true });
  const controls = createControls(settings);
  // A select sits in the same labelled wrapper as a number box (the fake DOM has no typing).
  const number = controls.select('bubbleFt', { label: 'Safety bubble', options: [500, 1000] });
  const check = controls.checkbox('on', { label: 'On' });
  const choice = controls.viewSwitch('mode');
  const [box] = all(number, 'SELECT');
  for (const key of ['bubbleFt', 'on', 'mode']) controls.setDisabled(key, true);
  assert.equal(box.disabled, true);
  for (const el of [number, check, choice]) assert.equal(el.getAttribute('aria-disabled'), 'true');
  for (const key of ['bubbleFt', 'on', 'mode']) controls.setDisabled(key, false);
  assert.equal(box.disabled, false);
  for (const el of [number, check, choice]) assert.equal(el.getAttribute('aria-disabled'), null);
  controls.dispose();
});

test('guard holds back an action while a number box it uses refuses what was typed (TR-14)', () => {
  const settings = fakeSettings({ gapS: 20, turnG: 4 });
  const controls = createControls(settings);
  const [gap] = all(controls.number('gapS', { label: 'Gap', unit: 's', min: 5, max: 60 }), 'INPUT');
  const [turnG] = all(controls.number('turnG', { label: 'Turn G', min: 1, max: 6 }), 'INPUT');
  let pairs = 0;
  const pair = document.createElement('button');
  pair.addEventListener('click', () => pairs++);
  const any = document.createElement('button');
  controls.guard(pair, ['gapS']);
  const stopAny = controls.guard(any);
  assert.equal(pair.getAttribute('aria-disabled'), null);

  gap.value = '2';
  gap.dispatch('change');
  assert.deepEqual(controls.invalid(), ['gapS']);
  assert.equal(pair.getAttribute('aria-disabled'), 'true', 'the action reads as unavailable');
  assert.equal(any.getAttribute('aria-disabled'), 'true');
  assert.equal(pair.dispatch('click').defaultPrevented, true);
  assert.equal(pairs, 0, 'the click never reaches the action');
  assert.equal(settings.get().gapS, 20, 'the setting keeps its last good value');

  gap.value = '30';
  gap.dispatch('input');
  assert.equal(pair.getAttribute('aria-disabled'), null, 'a good gap lets the action run again');
  pair.dispatch('click');
  assert.equal(pairs, 1);

  turnG.value = '9';
  turnG.dispatch('change');
  assert.equal(pair.getAttribute('aria-disabled'), null, 'a keyed guard ignores other boxes');
  assert.equal(any.getAttribute('aria-disabled'), 'true', 'the unkeyed guard sees Turn G');

  stopAny();
  assert.equal(any.getAttribute('aria-disabled'), null, 'stopping a guard frees its button');
  controls.dispose();
});

test('guard reads the box again at the click, before "change" has fired', () => {
  const settings = fakeSettings({ gapS: 20 });
  const controls = createControls(settings);
  const [gap] = all(controls.number('gapS', { label: 'Gap', min: 5, max: 60 }), 'INPUT');
  let pairs = 0;
  const pair = document.createElement('button');
  pair.addEventListener('click', () => pairs++);
  controls.guard(pair, ['gapS']);
  gap.value = '2'; // typed, focus still in the box
  pair.dispatch('click');
  assert.equal(pairs, 0);
  assert.equal(gap.getAttribute('aria-invalid'), 'true', 'the box now shows why');
  controls.dispose();
});

test('guard leaves the button\'s own disabled state to the module', () => {
  const settings = fakeSettings({ gapS: 20 });
  const controls = createControls(settings);
  const [gap] = all(controls.number('gapS', { label: 'Gap', min: 5, max: 60 }), 'INPUT');
  const pair = document.createElement('button');
  pair.disabled = true; // the module's own limit
  controls.guard(pair, ['gapS']);
  gap.value = '2';
  gap.dispatch('change');
  gap.value = '30';
  gap.dispatch('input');
  assert.equal(pair.disabled, true);
  controls.dispose();
  assert.equal(pair.getAttribute('aria-disabled'), null, 'dispose frees guarded buttons');
});

test('the refusal message puts degrees on the number and a space before other units (TF3-9)', () => {
  const settings = fakeSettings({ bank: 45, gapS: 20 });
  const controls = createControls(settings);
  const bank = controls.number('bank', { label: 'Bank', unit: '°', min: 0, max: 90 });
  const gap = controls.number('gapS', { label: 'Gap', unit: 's', min: 5, max: 60 });
  for (const el of [bank, gap]) {
    const [box] = all(el, 'INPUT');
    box.value = '999';
    box.dispatch('change');
  }
  const message = (el) => all(el, 'SPAN').find((n) => n.getAttribute('class') === 'control-message').textContent;
  assert.equal(message(bank), 'Enter a number from 0 to 90°.');
  assert.equal(message(gap), 'Enter a number from 5 to 60 s.');
  controls.dispose();
});
