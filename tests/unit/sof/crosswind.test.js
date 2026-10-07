// Checks: the crosswind per runway (src/modules/sof/crosswind.js) gives the headwind and crosswind a pilot works out with standard trigonometry,
//   and favours the runway end into the wind.
// Serves: SOF-R27 (decision SOF-43).
// Expected values: standard trigonometry, worked by hand, never the code's own output. A 270° wind at 20 kt on a runway heading 290° true is 20°
//   off the nose from the left: crosswind 20 × sin 20° = 6.84 kt from the left, headwind 20 × cos 20° = 18.79 kt.
// Margin: ±0.5 kt, not the shared ±10 kt: this checks arithmetic (half a knot is the METAR's own rounding), not flying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runwayWind, crosswindCheck } from '../../../src/modules/sof/crosswind.js';

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 0.5, `${what}: ${actual} kt, expected ${expected} kt ±0.5`);

test('270/20 on a runway heading 290 true: about 6.8 kt crosswind from the left and 18.8 kt headwind; down the runway, no crosswind', () => {
  const w = runwayWind(290, { dirDeg: 270, speedKt: 20 });
  near(Math.abs(w.crosswindKt), 6.84, 'crosswind');
  assert.ok(w.crosswindKt < 0, 'a wind from 270 on a heading of 290 comes from the left (negative is from the left)');
  near(w.headwindKt, 18.79, 'headwind');

  const straight = runwayWind(290, { dirDeg: 290, speedKt: 20 });
  near(straight.crosswindKt, 0, 'crosswind straight down the runway');
  near(straight.headwindKt, 20, 'headwind straight down the runway');
});

test('the favoured end of a two-end runway is the one into the wind', () => {
  const ends = [{ name: '11', headingTrue: 110 }, { name: '29', headingTrue: 290 }];
  assert.equal(crosswindCheck({ wind: { dirDeg: 270, speedKt: 20 }, ends }).favoured, '29');
  assert.equal(crosswindCheck({ wind: { dirDeg: 90, speedKt: 20 }, ends }).favoured, '11');
});
