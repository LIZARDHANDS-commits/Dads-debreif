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

test('guard turns an action button off while a number box it uses refuses what was typed (TR-14)', () => {
  const settings = fakeSettings({ gapS: 20, turnG: 4 });
  const controls = createControls(settings);
  const [gap] = all(controls.number('gapS', { label: 'Gap', unit: 's', min: 5, max: 60 }), 'INPUT');
  const [turnG] = all(controls.number('turnG', { label: 'Turn G', min: 1, max: 6 }), 'INPUT');
  const pair = document.createElement('button');
  const any = document.createElement('button');
  controls.guard(pair, ['gapS']);
  const stopAny = controls.guard(any);
  assert.equal(pair.disabled, false);

  gap.value = '2';
  gap.dispatch('change');
  assert.deepEqual(controls.invalid(), ['gapS']);
  assert.equal(pair.disabled, true, 'the action waits for a good gap');
  assert.equal(any.disabled, true);
  assert.equal(settings.get().gapS, 20, 'the setting keeps its last good value');

  gap.value = '30';
  gap.dispatch('input');
  assert.equal(pair.disabled, false, 'a good gap turns the action back on');
  assert.equal(any.disabled, false);

  turnG.value = '9';
  turnG.dispatch('change');
  assert.equal(pair.disabled, false, 'a keyed guard ignores other boxes');
  assert.equal(any.disabled, true, 'the unkeyed guard sees Turn G');

  stopAny();
  turnG.value = '3';
  turnG.dispatch('input');
  assert.deepEqual(controls.invalid(), []);
  assert.equal(any.disabled, true, 'a stopped guard no longer changes its button');
  controls.dispose();
});
