import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createStandards, checkStandards, STANDARD_LIMITS } from '../../../src/storage/standards.js';
import { V6_STANDARDS } from '../../../src/core/standards.js';

const freshStore = () => createStore(undefined).scope('standards');

test("starts from V6's standards, read-only", () => {
  const standards = createStandards({ store: freshStore() });
  assert.deepEqual(standards.get(), V6_STANDARDS);
  assert.ok(Object.isFrozen(standards.get()));
  assert.ok(Object.isFrozen(standards.get().spread));
  assert.throws(() => {
    standards.get().spread.minFt = 1;
  }, TypeError);
});

test('update merges per group, saves, and a new instance reads it back', () => {
  const store = freshStore();
  const result = createStandards({ store }).update({ spread: { minFt: 4500 }, lead: { on: false } });
  assert.deepEqual(result, { ok: true, errors: [] });
  const again = createStandards({ store }).get();
  assert.equal(again.spread.minFt, 4500);
  assert.equal(again.spread.maxFt, V6_STANDARDS.spread.maxFt);
  assert.equal(again.lead.on, false);
  assert.deepEqual(again.offset, V6_STANDARDS.offset);
});

test('an out-of-range value is refused with an error for that field, and nothing changes', () => {
  const standards = createStandards({ store: freshStore() });
  const result = standards.update({ spread: { maxFt: 50000 }, lead: { gTol: -1 } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((e) => e.path), ['spread.maxFt', 'lead.gTol']);
  assert.match(result.errors[0].message, /Spread maximum must be between 0 and 20,000 ft/);
  assert.deepEqual(standards.get(), V6_STANDARDS);
});

test('refuses non-numbers, a non-boolean on, unknown fields, and a spread minimum above the maximum', () => {
  const standards = createStandards({ store: freshStore() });
  const cases = [
    [{ offset: { aftTolFt: Number.NaN } }, 'offset.aftTolFt'],
    [{ offset: { aftTolFt: '900' } }, 'offset.aftTolFt'],
    [{ spread: { on: 'yes' } }, 'spread.on'],
    [{ spread: { minFeet: 1 } }, 'spread.minFeet'],
    [{ wedge: { on: true } }, 'wedge'],
    [{ spread: { minFt: 7000 } }, 'spread.minFt'],
  ];
  for (const [patch, path] of cases) {
    const result = standards.update(patch);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.deepEqual(result.errors.map((e) => e.path), [path], JSON.stringify(patch));
  }
  assert.deepEqual(standards.get(), V6_STANDARDS);
});

test("reset goes back to V6's standards", () => {
  const store = freshStore();
  const standards = createStandards({ store });
  standards.update({ offset: { aftTargetFt: 9000 } });
  standards.reset();
  assert.deepEqual(standards.get(), V6_STANDARDS);
  assert.deepEqual(createStandards({ store }).get(), V6_STANDARDS);
});

test('subscribers hear each real change, not refused or no-op updates, and can unsubscribe', () => {
  const standards = createStandards({ store: freshStore() });
  const seen = [];
  const unsubscribe = standards.subscribe((s) => seen.push(s.spread.minFt));
  standards.update({ spread: { minFt: 4200 } });
  standards.update({ spread: { minFt: 4200 } });
  standards.update({ spread: { minFt: -5 } });
  standards.reset();
  unsubscribe();
  standards.update({ spread: { minFt: 4300 } });
  assert.deepEqual(seen, [4200, 4000]);
});

test('a listener that throws does not stop the others', (t) => {
  t.mock.method(console, 'error', () => {});
  const standards = createStandards({ store: freshStore() });
  let heard = false;
  standards.subscribe(() => {
    throw new Error('boom');
  });
  standards.subscribe(() => {
    heard = true;
  });
  assert.equal(standards.update({ lead: { targetKt: 210 } }).ok, true);
  assert.ok(heard);
});

test("stored values are checked field by field: bad ones fall back to V6's", () => {
  const store = freshStore();
  store.set('standards', {
    version: 1,
    standards: { spread: { on: false, minFt: 'x', maxFt: 5500 }, offset: { aftTolFt: 1e9 }, lead: null, extra: 1 },
  });
  const got = createStandards({ store }).get();
  assert.deepEqual(got, {
    spread: { ...V6_STANDARDS.spread, on: false, maxFt: 5500 },
    offset: V6_STANDARDS.offset,
    lead: V6_STANDARDS.lead,
  });
});

test("a stored spread minimum above the maximum, another version, or junk gives V6's", () => {
  for (const saved of [
    { version: 1, standards: { spread: { minFt: 6000, maxFt: 5000 } } },
    { version: 2, standards: { spread: { minFt: 4100 } } },
    'junk',
    null,
  ]) {
    const store = freshStore();
    store.set('standards', saved);
    assert.deepEqual(createStandards({ store }).get().spread, V6_STANDARDS.spread, JSON.stringify(saved));
  }
});

test("V6's standards pass the checks, and every number has limits with a step", () => {
  assert.deepEqual(checkStandards(V6_STANDARDS), []);
  for (const [group, fields] of Object.entries(V6_STANDARDS)) {
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'number') continue;
      const limit = STANDARD_LIMITS[group][key];
      assert.ok(limit, `${group}.${key}`);
      assert.ok(limit.min <= value && value <= limit.max, `${group}.${key} default in range`);
      assert.ok(limit.step > 0 && typeof limit.label === 'string' && typeof limit.unit === 'string');
    }
  }
  assert.ok(Object.isFrozen(STANDARD_LIMITS.lead.gTol));
});

test('checkStandards reports a missing group (for checking a debrief file)', () => {
  const { lead, ...rest } = V6_STANDARDS;
  assert.deepEqual(checkStandards(rest).map((e) => e.path), ['lead']);
  assert.deepEqual(checkStandards(null).map((e) => e.path), ['']);
});
