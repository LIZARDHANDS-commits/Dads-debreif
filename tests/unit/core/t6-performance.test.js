// The shared T-6A performance model (SPEC-core, "API, fifth PR"), against the
// T-6A's own charts and manuals. V6 has none of this, so every check here is a
// known answer: the V-n diagram, the airspeed limits, the sustained turn rate
// and radius charts, the max glide chart and the flight manual's zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  T6A_LIMITS, stallLimitG, availableG, iasToTasKt, tasToIasKt, energyHeightFt,
  thrustPerWeight, dragPerWeight, excessThrustPerWeight,
} from '../../../src/core/t6-performance.js';
import { T6A_TURN_POINTS, T6A_FIT } from '../../../src/core/t6a-turn-charts.js';
import { isaDensityRatio, turnRadiusFt, turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { KT_TO_FTPS, G_FTPS2, FT_PER_NM } from '../../../src/core/units.js';

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

// ── Task 16: thrust and drag from the turn charts ──

const DEG = 180 / Math.PI;

/** The G the model can hold without slowing down: where thrust equals drag. 0 if not even 1 G. */
function sustainedG(kias, altFt) {
  if (excessThrustPerWeight(kias, altFt, 1) < 0) return 0;
  let lo = 1, hi = 10;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (excessThrustPerWeight(kias, altFt, mid) > 0) lo = mid; else hi = mid; }
  return lo;
}

/** The chart's lines from the model: best sustained rate and where, smallest radius, zero-turn speed. */
function chartFromModel(altFt, stallKias) {
  let bestRate = 0, bestKias = 0, minRadius = Infinity, zeroKias = 0;
  for (let kias = 80; kias <= 300; kias += 0.1) {
    const sustained = sustainedG(kias, altFt);
    if (sustained >= 1) zeroKias = kias;
    const g = Math.min(sustained, availableG(kias, false, stallKias));
    if (g <= 1) continue;
    const v = iasToTasKt(kias, altFt) * KT_TO_FTPS;
    const rate = turnRateRadPerSec(v, g) * DEG;
    if (rate > bestRate) { bestRate = rate; bestKias = kias; }
    minRadius = Math.min(minRadius, turnRadiusFt(v, g));
  }
  return { bestRate, bestKias, minRadius, zeroKias };
}

test('drag: a zero-lift part plus a part growing with G², set by the max glide chart', () => {
  // Best glide 125 KIAS clean at 2 NM per 1,000 ft: L/D 12.15, both parts equal there.
  near(1 / dragPerWeight(125, 0, 1), 2 * FT_PER_NM / 1000, 1e-3, 'L/D at 125 KIAS, 1 G');
  near(T6A_FIT.dragA * 125 ** 2 / (T6A_FIT.dragB / 125 ** 2), 1, 1e-5, 'the two parts equal at the best glide speed');
  assert.ok(dragPerWeight(115, 0, 1) > dragPerWeight(125, 0, 1) && dragPerWeight(135, 0, 1) > dragPerWeight(125, 0, 1), '125 KIAS is the least drag at 1 G');
  near(dragPerWeight(200, 0, 3) - dragPerWeight(200, 0, 1), 8 * T6A_FIT.dragB / 200 ** 2, 1e-12, 'G² part');
  assert.equal(dragPerWeight(180, 20000, 2), dragPerWeight(180, 0, 2), 'at a given IAS, drag does not change with height');
});

test('thrust: falls with speed, holds its sea-level value to about 14,000 ft, then falls with density', () => {
  assert.ok(thrustPerWeight(100, 0) > thrustPerWeight(150, 0) && thrustPerWeight(150, 0) > thrustPerWeight(250, 0), 'falls with speed');
  near(thrustPerWeight(150, 0), T6A_FIT.thrustK / (150 + T6A_FIT.thrustV0Kt) * T6A_FIT.thrustFlatSigma ** T6A_FIT.thrustDensityExp, 1e-12, 'the formula at sea level');
  // Same true airspeed, sea level and 12,000 ft (σ above the flat-rating point): same thrust.
  near(thrustPerWeight(tasToIasKt(200, 12000), 12000), thrustPerWeight(200, 0), 1e-12, 'flat-rated below about 14,000 ft');
  assert.ok(thrustPerWeight(tasToIasKt(200, 20000), 20000) < thrustPerWeight(200, 0), 'less above it');
  // As power: 50 to 80 % of the PT6A-68's 1,100 shp (flat-rated, NFM section 1) at 5,168 lb,
  // rising with speed like a propeller's efficiency.
  let last = 0;
  for (const kias of [100, 150, 200, 250, 280]) {
    const share = thrustPerWeight(kias, 0) * T6A_LIMITS.weightLb * kias * KT_TO_FTPS / 550 / 1100;
    assert.ok(share > 0.5 && share < 0.8 && share > last, `thrust power at ${kias} KIAS: ${(share * 100).toFixed(0)} % of 1,100 shp`);
    last = share;
  }
});

test('excess thrust: thrust minus drag', () => {
  for (const [kias, alt, g] of [[140, 0, 2.8], [200, 10000, 1], [250, 20000, 4]]) {
    near(excessThrustPerWeight(kias, alt, g), thrustPerWeight(kias, alt) - dragPerWeight(kias, alt, g), 1e-15, `${kias} KIAS, ${alt} ft, ${g} G`);
  }
});

test('every chart point: thrust within 10 % of drag at the chart\'s G', () => {
  let worst = 0;
  for (const [kias, alt, rate] of T6A_TURN_POINTS) {
    const g = Math.hypot(1, rate / DEG * iasToTasKt(kias, alt) * KT_TO_FTPS / G_FTPS2);
    const d = dragPerWeight(kias, alt, g);
    const miss = Math.abs(excessThrustPerWeight(kias, alt, g) / d);
    assert.ok(miss <= 0.1, `${kias} KIAS at ${alt} ft: ${(miss * 100).toFixed(1)} %`);
    worst = Math.max(worst, miss);
  }
  assert.ok(worst > 0.01, 'read off by eye: not a perfect fit');
});

for (const stallKias of [86, 83]) {
  test(`the turn chart's checks (SPEC-turn-fight), stall at ${stallKias} kt`, () => {
    const sl = chartFromModel(0, stallKias);
    near(sl.bestRate, 20.6, 1, 'best sustained rate at sea level, °/s');
    near(sl.bestKias, 140, 10, 'at about 140 KIAS');
    near(sl.zeroKias, 260, 10, 'zero sustained turn at sea level, KIAS');
    assert.ok(sl.minRadius >= 650 * 0.9 && sl.minRadius <= 700 * 1.1, `smallest sustained radius 650 to 700 ft ± 10 %: ${sl.minRadius.toFixed(0)}`);
    near(chartFromModel(10000, stallKias).bestRate, 16.5, 1, 'best at 10,000 ft');
    near(chartFromModel(20000, stallKias).bestRate, 12, 1, 'best at 20,000 ft');
  });
}

test('the corner: 7 G first at 227.5 KIAS; 33.3°/s on a 659 ft radius at 227 KIAS, sea level', () => {
  near(T6A_LIMITS.stallKias * Math.sqrt(T6A_LIMITS.maxG), 227.5, 0.05, 'corner speed');
  const v = iasToTasKt(227, 0) * KT_TO_FTPS;
  near(turnRateRadPerSec(v, 7) * DEG, 33.3, 0.1, 'instantaneous rate at 7 G');
  near(turnRadiusFt(v, 7), 659, 1, 'radius at 7 G');
});
