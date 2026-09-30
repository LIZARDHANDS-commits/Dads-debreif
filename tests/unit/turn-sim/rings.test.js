// The NM rings layer: which rings to draw round Lead at a zoom (task 12c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ringsNm, RING_STEPS_NM } from '../../../src/modules/turn-sim/rings.js';

const FT_PER_NM = 6076.11549;

test('the rings are a whole number of nautical miles, out to the edge of the picture', () => {
  // 40 px per NM: a ring every NM, out to 5 NM (the far edge is 5.5 NM away).
  const rings = ringsNm({ pxPerFt: 40 / FT_PER_NM, reachFt: 5.5 * FT_PER_NM });
  assert.deepEqual(rings, [1, 2, 3, 4, 5]);
});

test('zoomed out, the step grows so the rings stay apart, and there are never a crowd of them', () => {
  // 2 px per NM needs 20 NM between rings to be 40 px apart: one ring inside the 30 NM the picture reaches.
  assert.deepEqual(ringsNm({ pxPerFt: 2 / FT_PER_NM, reachFt: 30 * FT_PER_NM }), [20]);
  const wide = ringsNm({ pxPerFt: 2 / FT_PER_NM, reachFt: 130 * FT_PER_NM });
  assert.deepEqual(wide, [20, 40, 60, 80, 100, 120]);
  for (const size of [0.01, 0.5, 5, 500]) assert.ok(ringsNm({ pxPerFt: size / FT_PER_NM, reachFt: 200 * FT_PER_NM }).length <= 12);
});

test('nothing in the way of a bad size: no rings for a zero or non-finite scale or reach', () => {
  assert.deepEqual(ringsNm({ pxPerFt: 0, reachFt: 1e5 }), []);
  assert.deepEqual(ringsNm({ pxPerFt: NaN, reachFt: 1e5 }), []);
  assert.deepEqual(ringsNm({ pxPerFt: 1, reachFt: 0 }), []);
});
