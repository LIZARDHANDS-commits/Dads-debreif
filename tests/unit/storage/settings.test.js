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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createSettings } from '../../../src/storage/settings.js';

const DEFAULTS = { timePrimary: 'zulu', motion: 'system', spacingFt: 6000, showLabels: true };
const ALLOWED = { timePrimary: ['zulu', 'local'], motion: ['system', 'full', 'reduced'] };

const freshStore = () => createStore(undefined).scope('app');

test('starts from the defaults', () => {
  const settings = createSettings(freshStore(), DEFAULTS, { allowed: ALLOWED });
  assert.deepEqual(settings.get(), DEFAULTS);
  assert.ok(Object.isFrozen(settings.get()));
});

test('update saves, and a new instance on the same store reads it back', () => {
  const store = freshStore();
  createSettings(store, DEFAULTS, { allowed: ALLOWED }).update({ timePrimary: 'local', spacingFt: 9000 });
  const again = createSettings(store, DEFAULTS, { allowed: ALLOWED });
  assert.deepEqual(again.get(), { ...DEFAULTS, timePrimary: 'local', spacingFt: 9000 });
});

test('values of the wrong type, outside the allowed list, or unknown are ignored', () => {
  const store = freshStore();
  store.set('settings', { version: 1, values: { timePrimary: 'mars', spacingFt: '6000', showLabels: 'yes', extra: 1 } });
  const settings = createSettings(store, DEFAULTS, { allowed: ALLOWED });
  assert.deepEqual(settings.get(), DEFAULTS);
  settings.update({ motion: 'sometimes', extra: 2, spacingFt: Number.NaN });
  assert.deepEqual(settings.get(), DEFAULTS);
});

test('reset returns to the defaults and saves that', () => {
  const store = freshStore();
  const settings = createSettings(store, DEFAULTS, { allowed: ALLOWED });
  settings.update({ timePrimary: 'local' });
  settings.reset();
  assert.deepEqual(settings.get(), DEFAULTS);
  assert.deepEqual(createSettings(store, DEFAULTS).get(), DEFAULTS);
});

test('subscribers hear each change until they unsubscribe', () => {
  const settings = createSettings(freshStore(), DEFAULTS, { allowed: ALLOWED });
  const heard = [];
  const stop = settings.subscribe((next) => heard.push(next.timePrimary));
  settings.update({ timePrimary: 'local' });
  settings.update({ timePrimary: 'local' }); // no change, no call
  stop();
  settings.update({ timePrimary: 'zulu' });
  assert.deepEqual(heard, ['local']);
});

test('a subscriber that throws does not stop the others', (t) => {
  t.mock.method(console, 'error', () => {});
  const settings = createSettings(freshStore(), DEFAULTS, { allowed: ALLOWED });
  let heard = 0;
  settings.subscribe(() => { throw new Error('boom'); });
  settings.subscribe(() => { heard += 1; });
  settings.update({ timePrimary: 'local' });
  assert.equal(heard, 1);
});

test('an older saved version is migrated when a migrate function is given', () => {
  const store = freshStore();
  store.set('settings', { version: 1, values: { zuluFirst: false } });
  const settings = createSettings(store, DEFAULTS, {
    version: 2,
    allowed: ALLOWED,
    migrate: (values, from) => (from === 1 ? { timePrimary: values.zuluFirst ? 'zulu' : 'local' } : values),
  });
  assert.equal(settings.get().timePrimary, 'local');
  assert.equal(store.get('settings').version, 2);
});

test('an older saved version with no migrate function falls back to the defaults', () => {
  const store = freshStore();
  store.set('settings', { version: 1, values: { timePrimary: 'local' } });
  const settings = createSettings(store, DEFAULTS, { version: 2, allowed: ALLOWED });
  assert.deepEqual(settings.get(), DEFAULTS);
});

test('a migrate function that throws falls back to the defaults instead of stopping the app', (t) => {
  t.mock.method(console, 'error', () => {});
  const store = freshStore();
  store.set('settings', { version: 1, values: { odd: true } });
  const settings = createSettings(store, DEFAULTS, {
    version: 2,
    allowed: ALLOWED,
    migrate: () => {
      throw new Error('unexpected shape');
    },
  });
  assert.deepEqual(settings.get(), DEFAULTS);
});
