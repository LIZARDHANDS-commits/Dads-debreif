// The shared T-6A performance model (SPEC-core, "API, fifth PR"), against the
// T-6A's own charts and manuals. V6 has none of this, so every check here is a
// known answer: the V-n diagram, the airspeed limits, the sustained turn rate
// and radius charts, the max glide chart and the flight manual's zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  T6A_LIMITS, stallLimitG, availableG, iasToTasKt, tasToIasKt, energyHeightFt,
} from '../../../src/core/t6-performance.js';
import { isaDensityRatio } from '../../../src/core/flight-math.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);

// ── Task 14: limits and speeds ──

test('the V-n limits: +7/−3.5 G, +4.7 G rolling, VO 227, VMO 316 KIAS, 5,168 lb', () => {
  assert.deepEqual(
    { maxG: T6A_LIMITS.maxG, minG: T6A_LIMITS.minG, rollingMaxG: T6A_LIMITS.rollingMaxG, rollingMinG: T6A_LIMITS.rollingMinG },
    { maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1 });
  assert.equal(T6A_LIMITS.voKias, 227);
  assert.equal(T6A_LIMITS.vmoKias, 316);
  assert.equal(T6A_LIMITS.weightLb, 5168);
  assert.equal(T6A_LIMITS.stallKias, 86, 'the V-n stall line, the agreed default (Dad may pick 83)');
  assert.throws(() => { T6A_LIMITS.maxG = 8; }, TypeError);
});

test('the stall line: (KIAS ÷ 86)², reaching 7 G at 227.5 KIAS, VO', () => {
  near(stallLimitG(86), 1, 1e-12, '1 G at the stall speed');
  near(stallLimitG(100), 1.352, 0.001, '100 KIAS');
  near(stallLimitG(150), 3.042, 0.001, '150 KIAS');
  near(stallLimitG(200), 5.408, 0.001, '200 KIAS');
  near(stallLimitG(86 * Math.sqrt(7)), 7, 1e-12, 'corner');
  near(86 * Math.sqrt(7), 227.5, 0.05, 'corner speed');
  near(stallLimitG(139.6, 83), 2.829, 0.001, 'the turn charts\' lighter jet stalls near 83 kt');
});

test('available G: the stall line, capped at +7 G, or +4.7 G while rolling', () => {
  near(availableG(150), 3.042, 0.001, 'below the corner, the stall line');
  assert.equal(availableG(250), 7, 'above the corner, the limit');
  assert.equal(availableG(250, true), 4.7, 'rolling');
  near(availableG(150, true), 3.042, 0.001, 'rolling below 4.7 G: still the stall line');
  near(availableG(200, false, 83), (200 / 83) ** 2, 1e-12, 'a stall speed can be passed in');
});

test('IAS and TAS through the standard atmosphere: TAS = IAS ÷ √σ', () => {
  assert.equal(iasToTasKt(200, 0), 200, 'the same at sea level');
  near(iasToTasKt(200, 10000), 200 / Math.sqrt(isaDensityRatio(10000)), 1e-12, '10,000 ft');
  near(iasToTasKt(200, 10000), 232.7, 0.1, 'about 16 % faster at 10,000 ft');
  for (const alt of [0, 3500, 10000, 20000, 31000]) near(tasToIasKt(iasToTasKt(173, alt), alt), 173, 1e-12, `round trip at ${alt} ft`);
});

test('energy height: altitude + V²/2g', () => {
  assert.equal(energyHeightFt(5000, 0), 5000);
  near(energyHeightFt(0, 200), (200 * 1.68781) ** 2 / (2 * 32.174), 1e-9, '200 KTAS at sea level');
  near(energyHeightFt(0, 200), 1771, 1, 'about 1,770 ft');
  near(energyHeightFt(3500, 220) - energyHeightFt(3500, 145), 1212, 1, '220 to 145 KTAS is worth about 1,212 ft');
});
