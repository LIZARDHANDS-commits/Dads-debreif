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

// The shared T-6A performance model (SPEC-core, "API, fifth PR"), against the
// T-6A's own charts and manuals. V6 has none of this, so every check here is a
// known answer: the V-n diagram, the airspeed limits, the sustained turn rate
// and radius charts, the max glide chart and the flight manual's zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  T6A_LIMITS, stallLimitG, availableG, iasToTasKt, tasToIasKt, energyHeightFt,
  thrustPerWeight, dragPerWeight, excessThrustPerWeight,
  T6A_GLIDE, glideSinkFpm, NFM_ZOOM, zoomT6A, flyZoomT6A, t6aExcessFn,
  T6A_MANOEUVRE, shakerG, splitST6A, speedOfSoundKt, machToKiasKt, maxKiasT6A, modelMaxIasT6A,
} from '../../../src/core/t6-performance.js';
import {
  T6A_TURN_POINTS, T6A_TURN_STALL_LIMIT, T6A_TURN_ZERO, T6A_TURN_150_200, T6A_TURN_OTHER, T6A_FIT,
} from '../../../src/core/t6a-turn-charts.js';
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
  assert.equal(T6A_LIMITS.stallKias, 86, 'the agreed default (Patrick kept it, 09:29Z)');
  assert.throws(() => { T6A_LIMITS.maxG = 8; }, TypeError);
});

test('the stall line: (KIAS ÷ 86)², reaching 7 G at 227.5 KIAS', () => {
  near(stallLimitG(86), 1, 1e-12, '1 G at the stall speed');
  near(stallLimitG(100), 1.352, 0.001, '100 KIAS');
  near(stallLimitG(150), 3.042, 0.001, '150 KIAS');
  near(stallLimitG(200), 5.408, 0.001, '200 KIAS');
  near(stallLimitG(86 * Math.sqrt(7)), 7, 1e-12, 'corner');
  near(86 * Math.sqrt(7), 227.5, 0.05, 'corner speed');
  near(stallLimitG(139.6, 83), 2.829, 0.001, 'the turn charts\' max-power stall is near 83 kt');
  // The V-n diagram's own curve is (KIAS ÷ 89.4)², reaching 7 G near 236 KIAS; 227.5 matching VO (227) is a coincidence of the 86.
  near(89.4 * Math.sqrt(7), 236.5, 0.1, 'the V-n curve\'s corner');
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

test('the Mach limit: Mmo 0.67 (NFM Fig 5-3, p.5-9), and the other limits unchanged', () => {
  assert.equal(T6A_LIMITS.mmo, 0.67);
  assert.deepEqual(
    { maxG: T6A_LIMITS.maxG, minG: T6A_LIMITS.minG, stallKias: T6A_LIMITS.stallKias, voKias: T6A_LIMITS.voKias, vmoKias: T6A_LIMITS.vmoKias },
    { maxG: 7, minG: -3.5, stallKias: 86, voKias: 227, vmoKias: 316 },
  );
});

test('the speed of sound in the standard atmosphere: 661.5 kt at sea level, 573.6 kt from 36,089 ft', () => {
  near(speedOfSoundKt(0), 661.48, 0.01, 'sea level');
  near(speedOfSoundKt(10000), 638.3, 0.1, '10,000 ft');
  near(speedOfSoundKt(25000), 601.9, 0.1, '25,000 ft');
  near(speedOfSoundKt(40000), 573.6, 0.1, 'the stratosphere');
  for (const bad of [NaN, Infinity]) assert.throws(() => speedOfSoundKt(bad), RangeError);
});

test('the KIAS a Mach number reads: calibrated airspeed, standard day, with compressibility', () => {
  for (const mach of [0.2, 0.5, 0.67]) near(machToKiasKt(mach, 0), mach * speedOfSoundKt(0), 1e-9, `M${mach} at sea level is its true airspeed`);
  near(machToKiasKt(0.67, 25000), 279.1, 0.1, 'M0.67 at 25,000 ft');
  near(machToKiasKt(0.67, 31000), 245.3, 0.1, 'M0.67 at 31,000 ft');
  near(machToKiasKt(0.67, 40000), 199.3, 0.1, 'M0.67 at 40,000 ft (the stratosphere)');
  near(machToKiasKt(0.67, 11000 / 0.3048 - 1e-6), machToKiasKt(0.67, 11000 / 0.3048 + 1e-6), 1e-6, 'no step at the tropopause');
  assert.ok(machToKiasKt(0.67, 25000) > tasToIasKt(0.67 * speedOfSoundKt(25000), 25000), 'above the no-compressibility IAS');
  for (const bad of [NaN, Infinity]) assert.throws(() => machToKiasKt(0.67, bad), RangeError);
  for (const bad of [-0.1, 1, NaN]) assert.throws(() => machToKiasKt(bad, 10000), RangeError);
});

// The NFM's airspeed and Mach limits (Fig 5-3, p.5-9): VMO 316 KIAS to
// 18,769 ft, then Mmo 0.67, which is 244 KIAS at 31,000 ft.
test('the top speed follows the NFM line: VMO 316 KIAS to about 18,900 ft, then Mach 0.67', () => {
  for (const alt of [0, 5000, 10000, 15000, 18000, 18769]) assert.equal(maxKiasT6A(alt), 316, `${alt} ft: VMO`);
  near(maxKiasT6A(20000), 309.1, 0.1, '20,000 ft');
  near(maxKiasT6A(25000), 279.1, 0.1, '25,000 ft');
  // The standard formula gives 245.3 at the chart's top; the chart reads 244.
  near(maxKiasT6A(31000), 244, 1.5, '31,000 ft: the NFM reads 244');
  assert.ok(maxKiasT6A(19000) < 316, 'Mach is the limit by 19,000 ft');
  for (const alt of [20000, 25000, 31000]) assert.equal(maxKiasT6A(alt), machToKiasKt(T6A_LIMITS.mmo, alt), `${alt} ft is Mach 0.67`);
  for (const bad of [NaN, -Infinity]) assert.throws(() => maxKiasT6A(bad), RangeError);
});

test('the top speed on the model\'s own IAS: flown there, the model is never over Mach 0.67', () => {
  for (const alt of [0, 5000, 10000, 15000, 17000]) assert.equal(modelMaxIasT6A(alt), 316, `${alt} ft: VMO`);
  near(modelMaxIasT6A(20000), 300.4, 0.1, '20,000 ft');
  near(modelMaxIasT6A(25000), 270.0, 0.1, '25,000 ft');
  near(modelMaxIasT6A(31000), 236.1, 0.1, '31,000 ft');
  for (let alt = 0; alt <= 31000; alt += 500) {
    const mach = iasToTasKt(modelMaxIasT6A(alt), alt) / speedOfSoundKt(alt);
    assert.ok(mach <= T6A_LIMITS.mmo + 1e-12, `${alt} ft: Mach ${mach}`);
    assert.ok(modelMaxIasT6A(alt) <= maxKiasT6A(alt), `${alt} ft: never above the NFM line`);
  }
  // Flying the NFM's KIAS line on the model's IAS would be over Mach 0.67.
  near(iasToTasKt(maxKiasT6A(25000), 25000) / speedOfSoundKt(25000), 0.693, 0.001, 'the NFM line flown on the model basis at 25,000 ft');
  for (const bad of [NaN, Infinity]) assert.throws(() => modelMaxIasT6A(bad), RangeError);
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

test('t6aExcessFn: excess thrust for stepPointMass, which passes true airspeed', () => {
  near(t6aExcessFn(iasToTasKt(180, 12000), 12000, 3), excessThrustPerWeight(180, 12000, 3), 1e-12, '180 KIAS at 12,000 ft, 3 G');
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

// Turn rate against the chart directly (verification of 2026-09-30, finding F2): a point's
// thrust within 10 % of its drag can still be a rate 28 % low where the curve falls steeply.

/** The model's sustained turn rate, °/s, at kias and altFt: thrust equal to drag, capped by the stall line. */
function sustainedRate(kias, altFt, stallKias = T6A_LIMITS.stallKias) {
  const g = Math.min(sustainedG(kias, altFt), availableG(kias, false, stallKias));
  return g > 1 ? turnRateRadPerSec(iasToTasKt(kias, altFt) * KT_TO_FTPS, g) * DEG : 0;
}

// More points off Fig 4-10-1, read by pixel in the independent check (verification/core.md, Table 1):
// 175, 230 and 250 KIAS, where the curves fall steeply, and fresh reads at 200 KIAS. [KIAS, ft, °/s]
const PIXEL_POINTS = [
  [200, 0, 15.36], [230, 0, 11.46], [250, 0, 7.32], [200, 5000, 13.35], [250, 5000, 4.51],
  [200, 10000, 11.5], [175, 15000, 11.9], [200, 15000, 9.75], [200, 20000, 6.86],
  [175, 25000, 6.27], [200, 25000, 3.17], [175, 31000, 2.31],
];

/** Whether the model reaches the chart's rate within kt knots of the chart's speed. */
function reachesWithin(kias, altFt, rate, kt) {
  const lo = sustainedRate(kias - kt, altFt), hi = sustainedRate(kias + kt, altFt);
  return Math.min(lo, hi) <= rate && rate <= Math.max(lo, hi);
}

test('turn rate against the chart, sea level to 15,000 ft: within 0.65°/s, or 3 kt where the curve is steep', () => {
  const points = [...T6A_TURN_150_200, ...T6A_TURN_OTHER, ...PIXEL_POINTS].filter(([, alt]) => alt <= 15000);
  assert.equal(points.length, 20);
  let worst = 0;
  for (const [kias, alt, rate] of points) {
    const miss = sustainedRate(kias, alt) - rate;
    assert.ok(Math.abs(miss) <= 0.65 || reachesWithin(kias, alt, rate, 3), `${kias} KIAS at ${alt} ft: model ${sustainedRate(kias, alt).toFixed(2)}°/s, chart ${rate}`);
    worst = Math.max(worst, Math.abs(miss));
  }
  assert.ok(worst > 0.3, 'read off a chart: not a perfect fit');
  // Near zero turn at sea level the curve is steep: 0.75°/s high, but only 2 kt.
  assert.ok(!(Math.abs(sustainedRate(256.6, 0) - 4.48) <= 0.65) && reachesWithin(256.6, 0, 4.48, 3));
});

test('turn rate against the chart, 20,000 ft and up: a known shortfall, up to 0.95°/s low from 175 KIAS', () => {
  // Kept as it is (a judgement call logged for review): the MTCA working blocks are 6,000 to 15,500 ft.
  for (const [kias, alt, rate] of [...T6A_TURN_150_200, ...PIXEL_POINTS].filter(([, a]) => a >= 20000)) {
    const miss = sustainedRate(kias, alt) - rate;
    const allowed = kias <= 150 ? 0.4 : 0.95;
    assert.ok(miss <= 0.1 && miss >= -allowed, `${kias} KIAS at ${alt} ft: model ${sustainedRate(kias, alt).toFixed(2)}°/s, chart ${rate}`);
  }
  near(sustainedRate(200, 25000), 2.27, 0.02, 'the worst: 200 KIAS at 25,000 ft, chart 3.17');
});

test('zero sustained turn: the model reaches it within 6 kt of each chart line', () => {
  for (const [kias, alt] of T6A_TURN_ZERO) {
    let zero = 0;
    for (let k = 150; k <= 300; k += 0.1) if (sustainedG(k, alt) >= 1) zero = k;
    assert.ok(Math.abs(zero - kias) <= 6, `${alt} ft: model ${zero.toFixed(1)} KIAS, chart ${kias}`);
  }
});

test('the tops of the chart lines: within 0.35°/s with an 83 kt stall, and 1.1 to 1.6°/s low with the 86 kt default', () => {
  for (const [kias, alt, rate] of T6A_TURN_STALL_LIMIT) {
    const at83 = sustainedRate(kias, alt, 83) - rate;
    const at86 = sustainedRate(kias, alt, 86) - rate;
    assert.ok(Math.abs(at83) <= 0.35, `${alt} ft at 83 kt: ${at83.toFixed(2)}°/s`);
    assert.ok(at86 < -1.1 && at86 > -1.6, `${alt} ft at 86 kt: ${at86.toFixed(2)}°/s (verification finding F1, logged for review)`);
  }
});

test('the fitted constants are the fit\'s best for these chart points (tests/golden/checks/t6a-fit.mjs)', () => {
  assert.equal(T6A_TURN_POINTS.length, 31);
  let sum = 0;
  for (const [kias, alt, rate] of T6A_TURN_POINTS) {
    const g = Math.hypot(1, rate / DEG * iasToTasKt(kias, alt) * KT_TO_FTPS / G_FTPS2);
    sum += (excessThrustPerWeight(kias, alt, g) / dragPerWeight(kias, alt, g)) ** 2;
  }
  near(sum, 0.0227, 0.00005, 'sum of squared (T − D)/D');
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

test('the model\'s corner: 7 G first at 227.5 KIAS (86 kt × √7); 33.3°/s on a 659 ft radius at 227 KIAS, sea level', () => {
  near(T6A_LIMITS.stallKias * Math.sqrt(T6A_LIMITS.maxG), 227.5, 0.05, 'corner speed');
  const v = iasToTasKt(227, 0) * KT_TO_FTPS;
  near(turnRateRadPerSec(v, 7) * DEG, 33.3, 0.1, 'instantaneous rate at 7 G');
  near(turnRadiusFt(v, 7), 659, 1, 'radius at 7 G');
});

// ── Task 17: glide and zoom, and the cross-checks ──

test('the max glide chart, by configuration', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(T6A_GLIDE).map(([k, c]) => [k, [c.kias, c.nmPer1000Ft, c.chartSinkFpm, c.prop, c.dragIndex]])),
    {
      clean: [125, 2.0, 1350, 'feathered', 0],
      gearDown: [105, 1.5, 1500, 'feathered', 20],
      landing: [95, 1.1, 1850, 'feathered', 80],
      windmilling: [110, 1.0, 2350, 'windmilling', 0],
    });
  assert.throws(() => { T6A_GLIDE.clean.kias = 120; }, TypeError);
});

test('glide sink rate: true airspeed ÷ the glide ratio, so it grows with height', () => {
  // 125 KIAS at sea level is 12,660 ft/min forward; 2 NM per 1,000 ft is 12.15:1.
  near(glideSinkFpm('clean', 125, 0), 125 * KT_TO_FTPS * 60 / (2 * FT_PER_NM / 1000), 1e-9, 'clean at sea level');
  near(glideSinkFpm('clean', 125, 0), 1042, 1, 'about 1,040 ft/min at sea level');
  assert.ok(glideSinkFpm('clean', 125, 10000) > glideSinkFpm('clean', 125, 0), 'faster sink higher up');
  assert.throws(() => glideSinkFpm('Clean', 125, 0), { name: 'RangeError', message: /clean, gearDown, landing, windmilling/ });
  near(glideSinkFpm('gearDown', 120, 3500), iasToTasKt(120, 3500) * KT_TO_FTPS * 60 / (1.5 * FT_PER_NM / 1000), 1e-9, 'the SMM\'s 120 KIAS gear down');
  // The chart's own sink rates are the same sums at about 16,000 ft, all four rows alike.
  for (const [config, c] of Object.entries(T6A_GLIDE)) {
    const atChart = glideSinkFpm(config, c.kias, 16300);
    assert.ok(Math.abs(atChart / c.chartSinkFpm - 1) < 0.02, `${config}: ${atChart.toFixed(0)} ft/min at 16,300 ft against the chart's ${c.chartSinkFpm}`);
  }
});

test('the glide cross-check: drag alone at 125 KIAS clean glides within 15 % of 2 NM per 1,000 ft', () => {
  const ratio = 1 / dragPerWeight(125, 0, 1);
  const chart = 2 * FT_PER_NM / 1000;
  assert.ok(Math.abs(ratio / chart - 1) <= 0.15, `model ${ratio.toFixed(2)}:1, chart ${chart.toFixed(2)}:1`);
  // It is exact, since the glide chart sets the drag (T6A_FIT).
  near(ratio, chart, 1e-3, 'L/D');
});

test('the NFM zoom table (Fig 3-4): the lightest and heaviest rows exactly, the rows between within 1 ft', () => {
  for (let i = 0; i < NFM_ZOOM.kias.length; i++) {
    for (let j = 0; j < NFM_ZOOM.altFt.length; j++) {
      assert.equal(zoomT6A(NFM_ZOOM.kias[i], NFM_ZOOM.altFt[j], NFM_ZOOM.lightLb).gainFt, NFM_ZOOM.light[i][j]);
      assert.equal(zoomT6A(NFM_ZOOM.kias[i], NFM_ZOOM.altFt[j], NFM_ZOOM.heavyLb).gainFt, NFM_ZOOM.heavy[i][j]);
    }
  }
  // As read from the table: 500, 1,500, 3,000 and 6,000 ft; 200 KIAS then 250 KIAS.
  assert.deepEqual(NFM_ZOOM.light, [[595, 621, 649, 794], [1172, 1232, 1297, 1487]], '5,400 lb');
  assert.deepEqual(NFM_ZOOM.heavy, [[738, 757, 768, 883], [1299, 1347, 1410, 1552]], '6,500 lb');
  near(zoomT6A(200, 3000, 5800).gainFt, 693, 1, 'NFM example 1');
  near(zoomT6A(250, 6000, 6200).gainFt, 1535, 1, 'NFM example 2');
  near(zoomT6A(200, 500, 5900).gainFt, 660, 1, 'a row between');
  near(zoomT6A(250, 1500, 6100).gainFt, 1305, 1, 'another');
});

test('zoomT6A between and beyond the table: the same share of the ideal energy height, none below 150 KIAS', () => {
  assert.equal(zoomT6A(250, 3000).gainFt, zoomT6A(250, 3000, 5800).gainFt, '5,800 lb unless told');
  const gains = [150.1, 175, 200, 220, 250, 280].map((k) => zoomT6A(k, 3500).gainFt);
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i] > gains[i - 1], `rises with speed: ${gains.join(', ')}`);
  near(zoomT6A(220, 3500).gainFt, 959, 1, 'about 960 ft from 220 KIAS at 3,500 ft');
  near(zoomT6A(280, 3500).gainFt, 1830.5, 0.5, 'above 250 KIAS: 250\'s share');
  assert.equal(zoomT6A(150, 3500).gainFt, 0, 'at or below 150 KIAS the NFM decelerates level');
  near(zoomT6A(200, 2250).gainFt, (zoomT6A(200, 1500).gainFt + zoomT6A(200, 3000).gainFt) / 2, 1e-9, 'straight line between altitudes');
  assert.ok(zoomT6A(250, 10000).gainFt > zoomT6A(250, 6000).gainFt, 'higher than the table: the same share of a bigger energy height');
  assert.equal(zoomT6A(200, 3000, 5000).gainFt, zoomT6A(200, 3000, 5400).gainFt, 'lighter than the table: its lightest row');
});

test('zoomT6A time and distance come from flying the NFM procedure in the model', () => {
  const z = zoomT6A(200, 500, 5400);
  const flown = flyZoomT6A(200, 500);
  // Pinned, so a change to the flown procedure (the 2 G pull, holding 20°) shows.
  near(flown.gainFt, 635.67, 0.5, 'height, 200 KIAS at 500 ft');
  near(flown.timeSec, 13.04, 0.011, 'time');
  near(flown.distanceFt, 3558.6, 1, 'distance');
  near(flyZoomT6A(250, 6000).gainFt, 1486.03, 0.5, 'height, 250 KIAS at 6,000 ft');
  assert.equal(z.timeSec, flown.timeSec);
  assert.equal(z.distanceFt, flown.distanceFt);
  assert.ok(z.timeSec > 10 && z.timeSec < 16, `200 KIAS: ${z.timeSec.toFixed(1)} s`);
  assert.ok(zoomT6A(250, 500).timeSec > z.timeSec && zoomT6A(250, 500).distanceFt > z.distanceFt, 'longer from 250');
  const level = zoomT6A(140, 3500);
  assert.ok(level.gainFt === 0 && level.timeSec > 0 && level.distanceFt > 0, 'a level slow-down to 125 below 150 KIAS');
  assert.deepEqual(zoomT6A(120, 3500), { gainFt: 0, timeSec: 0, distanceFt: 0 }, 'already at glide speed');
});

test('the zoom cross-check: the model, thrust off, flies the NFM zoom within 10 % of the table (5,400 lb)', () => {
  // 2 s delay, 2 G pull to 20° nose up, held to 145 KIAS, then a 0.25 G push to 125 KIAS or the glide path.
  for (let i = 0; i < NFM_ZOOM.kias.length; i++) {
    const [lo, hi] = i === 0 ? [595, 883] : [1172, 1552];
    for (let j = 0; j < NFM_ZOOM.altFt.length; j++) {
      const gain = flyZoomT6A(NFM_ZOOM.kias[i], NFM_ZOOM.altFt[j]).gainFt;
      const table = NFM_ZOOM.light[i][j];
      assert.ok(Math.abs(gain / table - 1) <= 0.1, `${NFM_ZOOM.kias[i]} KIAS at ${NFM_ZOOM.altFt[j]} ft: model ${gain.toFixed(0)}, NFM ${table}`);
      assert.ok(gain >= lo && gain <= hi, `inside the manual's ${lo} to ${hi} ft`);
    }
  }
});

test('the zoom refuses speeds and heights it cannot fly, rather than hang', () => {
  for (const [kias, alt] of [[-200, 3000], [NaN, 3000], [Infinity, 3000], [317, 3000], [200, NaN], [200, -Infinity]]) {
    assert.throws(() => zoomT6A(kias, alt), RangeError, `${kias} KIAS at ${alt} ft`);
    assert.throws(() => flyZoomT6A(kias, alt), RangeError, `${kias} KIAS at ${alt} ft, flown`);
  }
  assert.ok(zoomT6A(316, 3000).gainFt > zoomT6A(250, 3000).gainFt, 'up to VMO');
  assert.deepEqual(zoomT6A(0, 3000), { gainFt: 0, timeSec: 0, distanceFt: 0 }, 'standing still: nothing to trade');
});

// ── The stick shaker and the split S (Patrick, 2026-09-30 09:27Z) ──
// Manoeuvre pulls fly in the shaker, not on the stall line: the shaker comes
// on about 5 to 10 kt above the stall (NFM p.1-52), taken as 7 kt, so the G is
// (KIAS ÷ 93)². Split S pulls go up to 5 G (Patrick; AIF 2410's maximum).

test('the manoeuvre numbers: shaker 7 kt above the stall, split S 5 G, 90°/s roll, 20° nose up, 0.5 G roll', () => {
  assert.deepEqual({ ...T6A_MANOEUVRE }, { shakerMarginKt: 7, splitSMaxG: 5, rollRateDegPerSec: 90, splitSNoseUpDeg: 20, splitSRollG: 0.5 });
  assert.ok(Object.isFrozen(T6A_MANOEUVRE));
});

test('shakerG: 1 G at 93 KIAS, (KIAS ÷ 93)² above it, capped at the V-n 7 G unless told', () => {
  near(shakerG(93), 1, 1e-12, 'shaker at 93 KIAS');
  near(shakerG(110), (110 / 93) ** 2, 1e-12, 'shaker at 110 KIAS');
  near(shakerG(186), 4, 1e-12, 'shaker at 186 KIAS');
  near(shakerG(240), (240 / 93) ** 2, 1e-12, 'shaker at 240 KIAS');
  assert.equal(shakerG(250), 7);
  assert.equal(shakerG(316), 7);
  assert.equal(shakerG(250, { maxG: T6A_MANOEUVRE.splitSMaxG }), 5);
  // Settings: another stall speed, margin or cap.
  near(shakerG(110, { stallKias: 83 }), (110 / 90) ** 2, 1e-12, 'shaker, 83 kt stall');
  near(shakerG(110, { marginKt: 0 }), stallLimitG(110), 1e-12, 'no margin is the stall line');
  assert.equal(shakerG(250, { maxG: 4 }), 4);
});

test('shakerG is always below the stall line and never above availableG', () => {
  for (let kias = 60; kias <= 316; kias += 1) {
    assert.ok(shakerG(kias) < stallLimitG(kias), `${kias} KIAS`);
    assert.ok(shakerG(kias) <= availableG(kias), `${kias} KIAS`);
  }
});

test('the split S from 110 KIAS at 10,000 ft: about 1,690 ft below the entry, 1,980 below the top', () => {
  const r = splitST6A(110, 10000);
  near(r.lossFt, 1688, 2, 'loss from the entry altitude');
  near(r.fromTopFt, 1976, 2, 'loss from the top');
  near(r.exitKias, 206.3, 0.2, 'exit speed');
  near(r.peakG, 5, 1e-9, 'peak G');
  near(r.timeSec, 16.6, 0.1, 'time');
  near(r.turnDeg, 174.4, 0.2, 'heading change (rolling right: 186° clockwise, read as +174)');
  assert.equal(r.completed, true);
});

test('the split S against the SMM (14.16 para 40, about 2,000 ft) over its 100 to 120 KIAS entries', () => {
  for (const kias of [100, 110, 120]) {
    const r = splitST6A(kias, 10000);
    // From the entry altitude the model loses 14 to 18 % less; from the top it is within 2 %.
    assert.ok(r.lossFt > 1600 && r.lossFt < 1750, `${kias} KIAS: ${r.lossFt} ft from the entry`);
    assert.ok(Math.abs(r.fromTopFt - 2000) < 40, `${kias} KIAS: ${r.fromTopFt} ft from the top`);
    assert.ok(r.peakG <= 5 + 1e-9, `${kias} KIAS: peak ${r.peakG} G`);
  }
});

test('the split S in the shaker loses more height than the old pull on the stall line', () => {
  // Pulled on the stall line (no margin, 7 G cap) instead, it loses about 1,470 ft.
  const stallLine = splitST6A(110, 10000, { marginKt: 0, maxG: 7 });
  near(stallLine.lossFt, 1473, 2, 'stall-line loss');
  assert.ok(splitST6A(110, 10000).lossFt > stallLine.lossFt + 200);
  // A lower G cap loses more still.
  assert.ok(splitST6A(110, 10000, { maxG: 4 }).lossFt > splitST6A(110, 10000).lossFt + 100);
});

test('the split S loses more the faster it starts, and ends level and upright', () => {
  let last = 0;
  for (const kias of [100, 120, 140, 160, 220]) {
    const r = splitST6A(kias, 10000);
    assert.ok(r.lossFt > last, `${kias} KIAS: ${r.lossFt} ft`);
    last = r.lossFt;
  }
  const r = splitST6A(110, 10000);
  near(r.exitClimbDeg, 0, 0.5, 'exit climb angle');
  assert.ok(r.exitUpright, 'upright at the exit');
});

test('below the shaker speed the nose cannot come up, so the split S starts with the roll', () => {
  const slow = splitST6A(90, 10000);
  near(slow.fromTopFt, slow.lossFt, 1e-9, 'no height gained first');
  near(slow.lossFt, 1965, 2, 'loss from 90 KIAS');
  // About 300 ft more from the entry than a 100 KIAS entry, which climbs first; the same from the top.
  const r100 = splitST6A(100, 10000);
  assert.ok(slow.lossFt > r100.lossFt + 250, `${slow.lossFt} vs ${r100.lossFt}`);
  near(slow.fromTopFt, r100.fromTopFt, 20, 'loss from the top');
});

test('the split S settings: roll left, roll rate, nose up, roll G, stall speed', () => {
  const base = splitST6A(110, 10000);
  const left = splitST6A(110, 10000, { rollLeft: true });
  near(left.lossFt, base.lossFt, 1e-6, 'a left roll loses the same');
  near(left.turnDeg, -base.turnDeg, 1e-6, 'a left roll mirrors the heading');
  near(splitST6A(110, 10000, { noseUpDeg: 0 }).lossFt, 1996, 2, 'no nose-up');
  near(splitST6A(110, 10000, { rollRateDegPerSec: 45 }).lossFt, 1681, 2, 'a 45°/s roll');
  near(splitST6A(110, 10000, { rollG: 1 }).lossFt, 1675, 2, 'a 1 G roll');
  assert.ok(splitST6A(110, 10000, { stallKias: 83 }).lossFt < base.lossFt - 50, 'an 83 kt stall pulls harder');
});

test('the split S flies from a slow or a fast entry, says when it cannot finish, and refuses what it cannot fly', () => {
  for (const kias of [1, 60, 93, 316]) {
    const r = splitST6A(kias, 10000);
    assert.ok(Number.isFinite(r.lossFt) && r.timeSec < 120 && r.completed, `${kias} KIAS`);
  }
  const stuck = splitST6A(110, 10000, { maxG: 1 });
  assert.equal(stuck.completed, false, 'a 1 G pull never comes level');
  near(stuck.timeSec, 120, 0.05, 'stopped at the guard');
  for (const [kias, alt] of [[0.5, 10000], [0, 10000], [-1, 10000], [317, 10000], [NaN, 10000], [110, NaN], [110, Infinity]]) {
    assert.throws(() => splitST6A(kias, alt), RangeError, `${kias} KIAS at ${alt} ft`);
  }
});
