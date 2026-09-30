// Tests for src/modules/sof/settings-model.js: the SOF's own settings, their
// defaults, and how the alternate trigger choice and the two limit numbers
// stay in step (SPEC-sof, "Settings").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createSettings } from '../../../src/storage/settings.js';
import { SETTINGS_DEFAULTS, TRIGGER_OPTIONS, withTrigger } from '../../../src/modules/sof/settings-model.js';

const fresh = () => createSettings(createStore(null).scope('sof'), SETTINGS_DEFAULTS);

test('every setting starts at its default: Local (MTCA) 2000/3, banner on, lightning 20 NM', () => {
  assert.deepEqual({ ...fresh().get() }, { ceilingFt: 2000, visSm: 3, banner: true, lightningNm: 20 });
});

test('the trigger options are named from the numbers they fill in (D59, D111)', () => {
  assert.deepEqual(TRIGGER_OPTIONS, [
    { value: 'local', label: 'Local (MTCA) 2000/3' },
    { value: 'crossCountry', label: 'Cross-country 3000/3' },
    { value: 'custom', label: 'Custom' },
  ]);
});

test('the trigger choice is read from the two numbers, and hand-changed numbers read as Custom', () => {
  const settings = fresh();
  const view = withTrigger(settings);
  assert.equal(view.get().trigger, 'local');
  settings.update({ ceilingFt: 3000 });
  assert.equal(view.get().trigger, 'crossCountry');
  settings.update({ ceilingFt: 2500 });
  assert.equal(view.get().trigger, 'custom');
});

test('choosing a trigger fills in both numbers', () => {
  const settings = fresh();
  const view = withTrigger(settings);
  settings.update({ ceilingFt: 2500, visSm: 2 });
  view.update({ trigger: 'crossCountry' });
  assert.deepEqual([settings.get().ceilingFt, settings.get().visSm], [3000, 3]);
  view.update({ trigger: 'local' });
  assert.deepEqual([settings.get().ceilingFt, settings.get().visSm], [2000, 3]);
});

test('choosing Custom, or something unknown, changes nothing', () => {
  const settings = fresh();
  const view = withTrigger(settings);
  view.update({ trigger: 'custom' });
  view.update({ trigger: 'bogus' });
  assert.deepEqual([settings.get().ceilingFt, settings.get().visSm], [2000, 3]);
});

test('other settings pass straight through, and subscribers see the trigger too', () => {
  const settings = fresh();
  const view = withTrigger(settings);
  const seen = [];
  const stop = view.subscribe((values) => seen.push(values.trigger));
  view.update({ banner: false, ceilingFt: 3000 });
  assert.equal(settings.get().banner, false);
  assert.deepEqual(seen, ['crossCountry']);
  stop();
  view.update({ ceilingFt: 2000 });
  assert.deepEqual(seen, ['crossCountry'], 'unsubscribing stops the calls');
});

test('a patch that carries a trigger and another setting applies both', () => {
  const settings = fresh();
  withTrigger(settings).update({ trigger: 'crossCountry', banner: false });
  assert.equal(settings.get().ceilingFt, 3000);
  assert.equal(settings.get().banner, false);
});
