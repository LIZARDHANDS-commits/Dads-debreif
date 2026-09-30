import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createStandards, checkStandards, STANDARD_LIMITS } from '../../../src/storage/standards.js';
import { DEFAULT_STANDARDS, V6_STANDARDS } from '../../../src/core/standards.js';

const freshStore = () => createStore(undefined).scope('standards');

test("starts from the SMM's standards (core's DEFAULT_STANDARDS), read-only", () => {
  const standards = createStandards({ store: freshStore() });
  assert.deepEqual(standards.get(), DEFAULT_STANDARDS);
  assert.equal(standards.get().offset.aftTargetFt, 7000, 'D114');
  assert.deepEqual([standards.get().spread.sweepMinDeg, standards.get().spread.sweepMaxDeg], [0, 10], 'D116');
  assert.equal(standards.get().lead.lowTargetKt, 220, 'D115');
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
  assert.equal(again.spread.maxFt, DEFAULT_STANDARDS.spread.maxFt);
  assert.equal(again.lead.on, false);
  assert.deepEqual(again.offset, DEFAULT_STANDARDS.offset);
});

test('an out-of-range value is refused with an error for that field, and nothing changes', () => {
  const standards = createStandards({ store: freshStore() });
  const result = standards.update({ spread: { maxFt: 50000 }, lead: { gTol: -1 } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((e) => e.path), ['spread.maxFt', 'lead.gTol']);
  assert.match(result.errors[0].message, /Spread maximum must be between 0 and 20,000 ft/);
  assert.deepEqual(standards.get(), DEFAULT_STANDARDS);
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
    [{ spread: { sweepMinDeg: 5, sweepMaxDeg: 4 } }, 'spread.sweepMinDeg'],
    [{ spread: { sweepMaxDeg: 46 } }, 'spread.sweepMaxDeg'],
    [{ spread: { foreAftTolFt: 250 } }, 'spread.foreAftTolFt'],
    [{ lead: { targetKt: 200 } }, 'lead.targetKt'],
    [{ lead: { lowBlockTopFt: 25000 } }, 'lead.lowBlockTopFt'],
  ];
  for (const [patch, path] of cases) {
    const result = standards.update(patch);
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.deepEqual(result.errors.map((e) => e.path), [path], JSON.stringify(patch));
  }
  assert.deepEqual(standards.get(), DEFAULT_STANDARDS);
});

test("reset goes back to the default standards", () => {
  const store = freshStore();
  const standards = createStandards({ store });
  standards.update({ offset: { aftTargetFt: 9000 } });
  standards.reset();
  assert.deepEqual(standards.get(), DEFAULT_STANDARDS);
  assert.deepEqual(createStandards({ store }).get(), DEFAULT_STANDARDS);
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
  assert.equal(standards.update({ lead: { lowTargetKt: 210 } }).ok, true);
  assert.ok(heard);
});

test("stored values are checked field by field: bad ones fall back to the default", () => {
  const store = freshStore();
  store.set('standards', {
    version: 2,
    standards: { spread: { on: false, minFt: 'x', maxFt: 5500 }, offset: { aftTolFt: 1e9 }, lead: null, extra: 1 },
  });
  const got = createStandards({ store }).get();
  assert.deepEqual(got, {
    spread: { ...DEFAULT_STANDARDS.spread, on: false, maxFt: 5500 },
    offset: DEFAULT_STANDARDS.offset,
    lead: DEFAULT_STANDARDS.lead,
  });
});

test("a stored spread minimum above the maximum, crossed sweep, another version, or junk gives the default", () => {
  for (const saved of [
    { version: 2, standards: { spread: { minFt: 6000, maxFt: 5000 } } },
    { version: 2, standards: { spread: { sweepMinDeg: 8, sweepMaxDeg: 3 } } },
    { version: 3, standards: { spread: { minFt: 4100 } } },
    'junk',
    null,
  ]) {
    const store = freshStore();
    store.set('standards', saved);
    assert.deepEqual(createStandards({ store }).get().spread, DEFAULT_STANDARDS.spread, JSON.stringify(saved));
  }
});

test("the default standards pass the checks, and every number has limits with a step", () => {
  assert.deepEqual(checkStandards(DEFAULT_STANDARDS), []);
  for (const [group, fields] of Object.entries(DEFAULT_STANDARDS)) {
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'number') continue;
      const limit = STANDARD_LIMITS[group][key];
      assert.ok(limit, `${group}.${key}`);
      assert.ok(limit.min <= value && value <= limit.max, `${group}.${key} default in range`);
      assert.ok(limit.step > 0 && typeof limit.label === 'string' && typeof limit.unit === 'string');
    }
  }
  assert.ok(Object.isFrozen(STANDARD_LIMITS.lead.gTol));
  for (const [group, fields] of Object.entries(STANDARD_LIMITS)) {
    for (const key of Object.keys(fields)) assert.ok(key in DEFAULT_STANDARDS[group], `${group}.${key} is a default field`);
  }
});

test("a version 1 save (V6's shape) falls back to the default whole, even its valid fields", () => {
  const store = freshStore();
  store.set('standards', { version: 1, standards: { ...V6_STANDARDS, spread: { ...V6_STANDARDS.spread, minFt: 4500 } } });
  assert.deepEqual(createStandards({ store }).get(), DEFAULT_STANDARDS);
  assert.deepEqual(checkStandards(V6_STANDARDS).map((e) => e.path).sort(), [
    'lead.lowBlockTopFt', 'lead.lowTargetKt', 'lead.midTargetKt', 'lead.targetKt',
    'spread.foreAftTolFt', 'spread.sweepMaxDeg', 'spread.sweepMinDeg',
  ]);
});

test('a degree limit reads without a space: "between 0 and 45°"', () => {
  const result = createStandards({ store: freshStore() }).update({ spread: { sweepMaxDeg: 90 } });
  assert.equal(result.errors[0].message, 'Sweep, most must be between 0 and 45°.');
});

test('checkStandards reports a missing group (for checking a debrief file)', () => {
  const { lead, ...rest } = DEFAULT_STANDARDS;
  assert.deepEqual(checkStandards(rest).map((e) => e.path), ['lead']);
  assert.deepEqual(checkStandards(null).map((e) => e.path), ['']);
});
