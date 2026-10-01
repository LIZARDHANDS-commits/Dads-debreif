// The default Moose Jaw setup (moose-jaw.json) may differ from V6's own (moose-jaw-v6.json)
// only where the manual cross-check corrected it (tests/crosscheck/, decisions-for-review.md):
//   g on Entry 2 points 2 and 3 and Split 1 points 2, 3 and 4 (45 degree corners), counting from 0;
//   alt on Pattern 1 point 12 and Split 1 point 5 (heights on a 3 degree final);
//   one inserted point in Entry 2, at index 4, on the straight line between its neighbours;
//   the label of a point that V6 called "New Point", which now has a pilot's name (verification TR-18).
// Anything else fails, so a position, speed, aircraft or route cannot move unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../../src/modules/traffic/data/${name}`, import.meta.url), 'utf8'));
const DEFAULT = load('moose-jaw.json');
const V6 = load('moose-jaw-v6.json');

/** Point fields that may differ, by route id and point index (counting from 0, as in the default file). */
const ALLOWED = {
  ENT1: { 3: ['x', 'y'] },
  ENT2: { 2: ['g'], 3: ['g'] },
  ENT3: { 3: ['x', 'y'] },
  SPL1: { 2: ['g'], 3: ['g'], 4: ['g'], 5: ['alt'] },
  SPL2: { 0: ['x', 'y'], 4: ['x', 'y'] },
  SPL3: { 2: ['x', 'y'] },
  PAT1: { 9: ['x', 'y'], 10: ['g'], 11: ['g'], 12: ['alt', 'g'] },
};
/** V6's name for a point nobody named; the built-in setup gives each one a pilot's name. */
const NEW_POINT = 'New Point';
/** The one point added: route and index in the default file. */
const INSERTED = { routeId: 'ENT2', index: 4 };
const COLLINEAR_FT = 1e-6;

test('everything outside the routes is V6\'s', () => {
  const { routes: a, routeOptions: roA, aircraft: acA, ...restDefault } = DEFAULT;
  const { routes: b, routeOptions: roB, aircraft: acB, ...restV6 } = V6;
  const { trueArcs: _tA, ...optsDefault } = roA ?? {};
  assert.deepEqual(restDefault, restV6);
  assert.deepEqual(optsDefault, roB);
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
  // A3 reassigned from SPL4 to PAT1 for operational deactivation (Stage 1)
  const normalizedAcA = acA.map((ac) => (ac.id === 'A3' ? { ...ac, routeId: 'SPL4' } : ac));
  assert.deepEqual(normalizedAcA, acB);
  assert.equal(acA.find((ac) => ac.id === 'A3')?.routeId, 'PAT1');
});

test('every route is V6\'s except for the allowed points and fields', () => {
  for (const route of DEFAULT.routes) {
    const v6 = V6.routes.find((r) => r.id === route.id);
    const { points, ...restDefault } = route;
    const { points: v6Points, ...restV6 } = v6;
    if (route.kind === 'split') {
      assert.equal(restDefault.visible, false);
      assert.equal(restDefault.splitOdds, 0);
      assert.deepEqual({ ...restDefault, visible: true, splitOdds: 0.5 }, restV6, `${route.id}: route fields`);
    } else {
      assert.deepEqual(restDefault, restV6, `${route.id}: route fields`);
    }

    const added = route.id === INSERTED.routeId ? 1 : 0;
    assert.equal(points.length, v6Points.length + added, `${route.id}: number of points`);
    points.forEach((point, i) => {
      if (added && i === INSERTED.index) return; // checked below
      const original = v6Points[added && i > INSERTED.index ? i - 1 : i];
      const allowed = ALLOWED[route.id]?.[i] ?? [];
      assert.deepEqual(Object.keys(point).sort(), Object.keys(original).sort(), `${route.id} point ${i}: fields`);
      for (const key of Object.keys(original)) {
        if (allowed.includes(key)) continue;
        if (key === 'label' && original.label === NEW_POINT) continue; // renamed: checked below
        assert.equal(point[key], original[key], `${route.id} point ${i}: ${key} must be V6's`);
      }
    });
  }
});

test('no built-in point is labelled New Point, and only V6\'s New Points were renamed (TR-18)', () => {
  for (const route of DEFAULT.routes) {
    const v6 = V6.routes.find((r) => r.id === route.id);
    const added = route.id === INSERTED.routeId ? 1 : 0;
    route.points.forEach((point, i) => {
      assert.notEqual(point.label, NEW_POINT, `${route.id} point ${i}: still New Point`);
      assert.equal(typeof point.label, 'string');
      assert.ok(point.label.trim().length > 0 && point.label.length <= 24, `${route.id} point ${i}: a short name`);
      if (added && i === INSERTED.index) return;
      const original = v6.points[added && i > INSERTED.index ? i - 1 : i];
      if (original.label !== NEW_POINT) assert.equal(point.label, original.label, `${route.id} point ${i}: V6's name stays`);
    });
    const names = route.points.map((p) => p.label);
    assert.equal(new Set(names).size, names.length, `${route.id}: no two points share a name`);
  }
});

test('every allowed change is really a change (the list does not go stale)', () => {
  for (const [routeId, byIndex] of Object.entries(ALLOWED)) {
    const route = DEFAULT.routes.find((r) => r.id === routeId);
    const v6 = V6.routes.find((r) => r.id === routeId);
    for (const [i, keys] of Object.entries(byIndex)) {
      for (const key of keys) assert.notEqual(route.points[i][key], v6.points[i][key], `${routeId} point ${i}: ${key} differs`);
    }
  }
});

test('the inserted Entry 2 point lies on the straight line between its neighbours', () => {
  const route = DEFAULT.routes.find((r) => r.id === INSERTED.routeId);
  const [before, point, after] = [route.points[INSERTED.index - 1], route.points[INSERTED.index], route.points[INSERTED.index + 1]];
  const length = Math.hypot(after.x - before.x, after.y - before.y);
  const offLineFt = Math.abs((after.x - before.x) * (point.y - before.y) - (after.y - before.y) * (point.x - before.x)) / length;
  assert.ok(offLineFt < COLLINEAR_FT, `${offLineFt} ft off the line`);
  const along = ((point.x - before.x) * (after.x - before.x) + (point.y - before.y) * (after.y - before.y)) / (length * length);
  assert.ok(along > 0 && along < 1, 'between the neighbours');
});
