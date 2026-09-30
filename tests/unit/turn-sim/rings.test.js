// The NM rings layer: which rings to draw round Lead at a zoom (task 12c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ringsNm, RING_STEPS_NM, RING_STROKE, RING_LABEL } from '../../../src/modules/turn-sim/rings.js';

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

// WCAG 1.4.11: a graphic that carries meaning needs 3:1 against what it sits on (the picture's #071018).
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the ring lines are at least 3:1 against the picture background, and their labels 4.5:1 (audit yellow 5)', () => {
  assert.ok(contrast(RING_STROKE, '#071018') >= 3, `ring line ${contrast(RING_STROKE, '#071018').toFixed(2)}:1`);
  assert.ok(contrast(RING_LABEL, '#071018') >= 4.5, `ring label ${contrast(RING_LABEL, '#071018').toFixed(2)}:1`);
});
