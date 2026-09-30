// The map layers' places, against V6's own numbers (SPEC-debrief: 2D map).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAIL_WINDOW_S, LINE_39_HALF_FT, CONE, trailRuns, spacingPairs, line39, coneOutlines,
} from '../../../src/modules/debrief/map2d/geometry.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);
const fix = (t) => ({ t, xFt: t, yFt: 0 });
// Fixes every second from 0 to 200 s, with a GPS gap from 100 s to 110 s.
const fixes = [...Array.from({ length: 101 }, (_, i) => fix(i)), ...Array.from({ length: 91 }, (_, i) => fix(110 + i))];
const times = (runs) => runs.map((r) => [r[0].t, r.at(-1).t]);

test('trail modes: full, history up to now, and the last 60 s (V6 line 3027), still broken at gaps', () => {
  assert.equal(TRAIL_WINDOW_S, 60);
  assert.deepEqual(times(trailRuns(fixes, 'full', 50)), [[0, 100], [110, 200]]);
  assert.deepEqual(times(trailRuns(fixes, 'history', 50)), [[0, 50]]);
  assert.deepEqual(times(trailRuns(fixes, 'history', 150.5)), [[0, 100], [110, 150]]);
  assert.deepEqual(times(trailRuns(fixes, 'window', 150)), [[90, 100], [110, 150]]);
  assert.deepEqual(times(trailRuns(fixes, 'window', 175)), [[115, 175]]);
  assert.deepEqual(times(trailRuns(fixes, 'window', 80)), [[20, 80]]);
  assert.deepEqual(trailRuns(fixes, 'history', -5), []);
});

test('spacing lines: every pair, horizontal feet, no number while either ship is in a gap', () => {
  const ships = [
    { slot: 2, xFt: 3000, yFt: 4000 },
    { slot: 1, xFt: 0, yFt: 0 },
    { slot: 3, xFt: 0, yFt: 0, inGap: true },
  ];
  assert.deepEqual(spacingPairs(ships).map((p) => [p.a.slot, p.b.slot, p.ft]), [[1, 2, 5000], [1, 3, null], [2, 3, null]]);
});

test('3/9 line: square to the heading, 250,000 ft each way (V6 drawKml39Line); none without a heading', () => {
  assert.equal(LINE_39_HALF_FT, 250_000);
  const [a, b] = line39({ xFt: 10, yFt: 20 }, 0); // heading east: the line runs north-south
  near(a[0], 10); near(a[1], 20 - 250_000, 1e-6);
  near(b[0], 10); near(b[1], 20 + 250_000, 1e-6);
  assert.equal(line39({ xFt: 0, yFt: 0 }, null), null);
});

test('fighting-wing cone: 500-1,000 ft, 30-60° off Lead\'s tail on both sides (V6 lines 2816-2860)', () => {
  assert.deepEqual({ ...CONE }, { innerFt: 500, outerFt: 1000, fromDeg: 30, toDeg: 60 });
  const [left, right] = coneOutlines({ xFt: 0, yFt: 0 }, 0); // heading east: the tail is west
  // V6's first outer point on its side -1: tail - 30°, 1,000 ft out.
  near(left.points[0][0], 1000 * Math.cos(Math.PI - Math.PI / 6));
  near(left.points[0][1], 1000 * Math.sin(Math.PI - Math.PI / 6));
  near(right.points[0][1], -500); // the mirror image
  assert.equal(left.points.length, 58); // 29 on the outer arc, 29 back on the inner
  for (const side of [left, right]) {
    for (const [x, y] of side.points) {
      const r = Math.hypot(x, y);
      assert.ok(Math.abs(r - 500) < 1e-6 || Math.abs(r - 1000) < 1e-6);
      assert.ok(x < 0); // all behind Lead
    }
  }
  near(Math.hypot(...left.labelAt), 750);
  assert.equal(coneOutlines({ xFt: 0, yFt: 0 }, null), null);
});

test('a route lands in the map\'s feet', async () => {
  const { projectRoute, routeBounds } = await import('../../../src/modules/debrief/map2d/overlays.js');
  const { makeLocalRef, latLonToLocalFt } = await import('../../../src/core/geo.js');
  const route = { name: 'R', paths: [[[-105.5, 50.3], [-105.4, 50.4]]] };
  const ref = makeLocalRef(50, -105.6);
  const onFlight = projectRoute(route, ref);
  const { x, y } = latLonToLocalFt(ref, 50.4, -105.4);
  assert.deepEqual(onFlight.paths[0][1], [x, y]);
  const box = routeBounds(onFlight);
  assert.ok(box.minX < box.maxX && box.minY < box.maxY);
});
