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

// Tests for src/modules/sof/settings-model.js: the SOF's own settings, their
// defaults, and how the alternate trigger choice and the two limit numbers
// stay in step (SPEC-sof, "Settings").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { SETTINGS_DEFAULTS, TRIGGER_OPTIONS, BANNER_HINT, MAX_RELAY_CHARS, relayAccepted, withTrigger, snapCeiling, snapVisibility, snapLimits, createSofSettings } from '../../../src/modules/sof/settings-model.js';

const fresh = () => createSofSettings(createStore(null).scope('sof'));

test('every setting starts at its default: Local (MTCA) 2000/3, banner on, lightning 20 NM, no traffic relay', () => {
  assert.deepEqual({ ...fresh().get() }, { ceilingFt: 2000, visSm: 3, banner: true, lightningNm: 20, trafficRelay: '' });
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

// ---- Hand-typed limits snap to the safe side (R1) ------------------------------------------------

test('a ceiling snaps UP to the next 100 ft, so 2049 and 2050 are both checked as 2100', () => {
  assert.equal(snapCeiling(2049), 2100);
  assert.equal(snapCeiling(2050), 2100);
  assert.equal(snapCeiling(2000), 2000);
  assert.equal(snapCeiling(2001), 2100);
  assert.equal(snapCeiling(0), 0);
  assert.equal(snapCeiling(10000), 10000);
});

test('a visibility snaps UP to the next quarter mile: 2.8 becomes 3, 2.5 stays', () => {
  assert.equal(snapVisibility(2.8), 3);
  assert.equal(snapVisibility(2.5), 2.5);
  assert.equal(snapVisibility(2.51), 2.75);
  assert.equal(snapVisibility(0.3), 0.5);
  assert.equal(snapVisibility(3), 3);
  assert.equal(snapVisibility(0.75), 0.75);
});

test('snapping is clamped to the range and never returns junk', () => {
  assert.equal(snapCeiling(99999), 10000);
  assert.equal(snapCeiling(-5), 0);
  assert.equal(snapVisibility(11), 10);
  assert.equal(snapCeiling('x'), 2000);
  assert.equal(snapVisibility(NaN), 3);
  assert.deepEqual(snapLimits({ ceilingFt: 2049, visSm: 2.8 }), { ceilingFt: 2100, visSm: 3 });
});

test('the trigger reads from the snapped numbers, so 2049 reads as Custom 2100, not Local', () => {
  const settings = createSofSettings(createStore(null).scope('sof'));
  settings.update({ ceilingFt: 2049 });
  assert.equal(withTrigger(settings).get().trigger, 'custom');
  assert.equal(settings.get().ceilingFt, 2100, 'what is stored and shown is what the check uses');
});

// ---- Stored settings are range-checked on read (Y4) -------------------------------------------------

test('stored settings out of range or of the wrong type fall back to their defaults', () => {
  const store = createStore(null).scope('sof');
  store.set('settings', { version: 1, values: { ceilingFt: 99999, visSm: 'far', banner: 'yes', lightningNm: -3 } });
  assert.deepEqual({ ...createSofSettings(store).get() }, { ...SETTINGS_DEFAULTS });
});

test('a stored value in range but not on the step is snapped up, and one on the range is kept', () => {
  const store = createStore(null).scope('sof');
  store.set('settings', { version: 1, values: { ceilingFt: 2049, visSm: 2.8, lightningNm: 50, banner: false } });
  assert.deepEqual({ ...createSofSettings(store).get() }, { ceilingFt: 2100, visSm: 3, banner: false, lightningNm: 50, trafficRelay: '' });
});

test('an update with an out-of-range number is dropped; the rest of it applies', () => {
  const settings = createSofSettings(createStore(null).scope('sof'));
  settings.update({ ceilingFt: 99999, lightningNm: 4, banner: false });
  assert.deepEqual({ ...settings.get() }, { ...SETTINGS_DEFAULTS, banner: false });
});

test('the facade notifies subscribers with the cleaned values and resets to the defaults', () => {
  const settings = createSofSettings(createStore(null).scope('sof'));
  const seen = [];
  settings.subscribe((v) => seen.push(v.ceilingFt));
  settings.update({ ceilingFt: 2049 });
  assert.deepEqual(seen, [2100]);
  settings.reset();
  assert.equal(settings.get().ceilingFt, 2000);
});

test('the traffic relay address starts empty, is kept as a string, and is dropped when it is not one or is too long', () => {
  const settings = fresh();
  assert.equal(settings.get().trafficRelay, '');
  settings.update({ trafficRelay: 'https://relay.example.test' });
  assert.equal(settings.get().trafficRelay, 'https://relay.example.test');
  settings.update({ trafficRelay: 5 });
  settings.update({ trafficRelay: 'https://x.test/' + 'a'.repeat(MAX_RELAY_CHARS) });
  assert.equal(settings.get().trafficRelay, 'https://relay.example.test', 'a bad update changes nothing');
  settings.reset();
  assert.equal(settings.get().trafficRelay, '');
});

test('a stored relay address of the wrong type or too long is the default; spaces round it are trimmed on read but kept while typing', () => {
  const store = createStore(null).scope('sof');
  store.set('settings', { version: 1, values: { trafficRelay: 'x'.repeat(MAX_RELAY_CHARS + 1) } });
  assert.equal(createSofSettings(store).get().trafficRelay, '');
  const typed = createSofSettings(createStore(null).scope('sof'));
  typed.update({ trafficRelay: '  https://relay.example.test ' });
  assert.equal(typed.get().trafficRelay, 'https://relay.example.test');
  assert.equal(typed.editing.get().trafficRelay, '  https://relay.example.test ');
});

test('only a good address counts as a relay: https, or http on localhost, the origin alone', () => {
  for (const good of ['https://relay.example.test', 'https://traffic.someone.workers.dev', 'http://localhost:8787', 'http://127.0.0.1:8787', ' https://relay.example.test ']) {
    assert.equal(relayAccepted(good), true, good);
  }
  for (const bad of ['', '   ', 'relay.example.test', 'http://relay.example.test', 'ftp://x.test', 'https://user:pw@x.test', 'https://x.test/traffic', 'https://x.test/?a=1', 'javascript:alert(1)', 'https://', null, undefined, 5]) {
    assert.equal(relayAccepted(bad), false, String(bad));
  }
});

test('the lightning radius is kept from 5 to 50 NM, whole numbers, for the control that is now live', () => {
  const settings = fresh();
  settings.update({ lightningNm: 35 });
  assert.equal(settings.get().lightningNm, 35);
  settings.update({ lightningNm: 4 });
  settings.update({ lightningNm: 51 });
  settings.update({ lightningNm: NaN });
  assert.equal(settings.get().lightningNm, 35);
});

test('F6: the banner switch\'s hint does not claim the cards show every caution: lightning is only in the map strip', () => {
  assert.match(BANNER_HINT, /^The banner lists cautions you have not acknowledged\./);
  assert.match(BANNER_HINT, /airfield cards show every weather caution either way/);
  assert.match(BANNER_HINT, /lightning shows in the map strip/);
  assert.doesNotMatch(BANNER_HINT, /show every caution either way/, 'the old wording was false for lightning');
});
