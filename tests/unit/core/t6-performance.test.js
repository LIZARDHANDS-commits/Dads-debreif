// Checks: the T-6A performance model: G and speed limits, stall line, IAS and TAS, Mmo and top speed, thrust and drag, level torque, glide, zoom, energy height.
// Serves: ALL-R20, ALL-R22, ALL-R28.
// Expected values: the type certificates, SMM and EFIG pages and Patrick's rulings cited in each test, and standard
//   aerodynamics and atmosphere formulas worked out in the test; a few split S checks still pin the model's own output
//   (test register, T2 and T3).

// The shared T-6A performance model (SPEC-core, "API, fifth PR"), built from public and pilot sources (12 Oct 2026).
// V6 has none of this, so every check here is a known answer: the certificates' limits, the formulas with their
// inputs, Patrick's level torque, the SMM's glide and the zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  T6A_LIMITS, stallLimitG, availableG, iasToTasKt, tasToIasKt, energyHeightFt,
  thrustPerWeight, dragPerWeight, excessThrustPerWeight,
  T6A_GLIDE, glideSinkFpm, glideRatio, flyZoomT6A, t6aExcessFn,
  T6A_MANOEUVRE, shakerG, splitST6A, speedOfSoundKt, machToKiasKt, maxKiasT6A, modelMaxIasT6A,
  pitchDegFromClimb,
} from '../../../src/core/t6-performance.js';
import { isaDensityRatio, turnRadiusFt, turnRateRadPerSec } from '../../../src/core/flight-math.js';
import { KT_TO_FTPS, FT_PER_NM } from '../../../src/core/units.js';

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);

// ── Task 14: limits and speeds ──

// The type certificates (EASA.IM.A.636, UK.TC.A.00092) for the G and speed limits and the 6,900 lb maximum; Germann 2006
// p.17 for the rolling limits and the 6,500 lb the trainer is operated at, and Table 9 for the 6,400 lb sortie weight;
// the Textron T-6C brochure for the 5,170 lb basic weight.
test('the G, speed and weight limits: +7/−3.5 G, +4.7 G rolling, VO 227, VMO 316 KIAS, 6,400 lb sortie weight', () => {
  assert.deepEqual(
    { maxG: T6A_LIMITS.maxG, minG: T6A_LIMITS.minG, rollingMaxG: T6A_LIMITS.rollingMaxG, rollingMinG: T6A_LIMITS.rollingMinG },
    { maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1 });
  assert.equal(T6A_LIMITS.voKias, 227);
  assert.equal(T6A_LIMITS.vmoKias, 316);
  assert.deepEqual(
    { weightLb: T6A_LIMITS.weightLb, basicWeightLb: T6A_LIMITS.basicWeightLb, maxWeightLb: T6A_LIMITS.maxWeightLb, operatedMaxWeightLb: T6A_LIMITS.operatedMaxWeightLb },
    { weightLb: 6400, basicWeightLb: 5170, maxWeightLb: 6900, operatedMaxWeightLb: 6500 });
  assert.equal(T6A_LIMITS.stallKias, 86, "Patrick's ruling: 86 kt is the 1 G stall speed (30 Sep, 09:29Z), at every weight for now");
  assert.throws(() => { T6A_LIMITS.maxG = 8; }, TypeError);
});

test('the stall line: (KIAS ÷ 86)², reaching 7 G at 227.5 KIAS', () => {
  near(stallLimitG(86), 1, 1e-12, '1 G at the stall speed');
  near(stallLimitG(100), 1.352, 0.001, '100 KIAS');
  near(stallLimitG(150), 3.042, 0.001, '150 KIAS');
  near(stallLimitG(200), 5.408, 0.001, '200 KIAS');
  near(stallLimitG(86 * Math.sqrt(7)), 7, 1e-12, 'corner');
  near(86 * Math.sqrt(7), 227.5, 0.05, 'corner speed');
  // 227.5 matching VO (227) is a coincidence of the 86.
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

test('the Mach limit: Mmo 0.67 (type certificates), and the other limits unchanged', () => {
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

// The type certificates' VMO 316 KIAS and Mmo 0.67: Mach 0.67 reads 316 KIAS near 18,900 ft on a standard day
// (the standard calibrated-airspeed formula), so it is the limit above that.
test('the top speed follows the certificates: VMO 316 KIAS to about 18,900 ft, then Mach 0.67', () => {
  for (const alt of [0, 5000, 10000, 15000, 18000, 18700]) assert.equal(maxKiasT6A(alt), 316, `${alt} ft: VMO`);
  near(maxKiasT6A(20000), 309.1, 0.1, '20,000 ft');
  near(maxKiasT6A(25000), 279.1, 0.1, '25,000 ft');
  near(maxKiasT6A(31000), 245.3, 0.1, '31,000 ft');
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
    assert.ok(modelMaxIasT6A(alt) <= maxKiasT6A(alt), `${alt} ft: never above the reference line`);
  }
  // Flying the reference KIAS line on the model's IAS would be over Mach 0.67.
  near(iasToTasKt(maxKiasT6A(25000), 25000) / speedOfSoundKt(25000), 0.693, 0.001, 'the reference line flown on the model basis at 25,000 ft');
  for (const bad of [NaN, Infinity]) assert.throws(() => modelMaxIasT6A(bad), RangeError);
});

test('energy height: altitude + V²/2g', () => {
  assert.equal(energyHeightFt(5000, 0), 5000);
  near(energyHeightFt(0, 200), (200 * 1.68781) ** 2 / (2 * 32.174), 1e-9, '200 KTAS at sea level');
  near(energyHeightFt(0, 200), 1771, 1, 'about 1,770 ft');
  near(energyHeightFt(3500, 220) - energyHeightFt(3500, 145), 1212, 1, '220 to 145 KTAS is worth about 1,212 ft');
});

// ── Thrust and drag from the public and pilot sources (spec, "API, fifth PR: T-6A performance") ──

// The polar's inputs, as the spec gives them: wing area 175.3 sq ft (Textron T-6C brochure), aspect ratio 6.29 (a
// public PC-9 listing), zero-lift drag 0.027 (fitted to Patrick's torque table and top speeds, his pick 12 Oct 2026), span efficiency
// 0.8 (an estimate). Standard aerodynamics: q = ½ ρ₀ V² from indicated airspeed, CL = n W ÷ (q S), CD = CD0 + CL² ÷ (π AR e).
const WING_SQFT = 175.3, ASPECT = 6.29, CD0 = 0.027, SPAN_E = 0.8, SORTIE_LB = 6400;
const qPsf = (kias) => 0.5 * 0.0023769 * (kias * KT_TO_FTPS) ** 2;
const inducedPerWeight = (kias, g, w = SORTIE_LB) => g * g * w / (qPsf(kias) * WING_SQFT * Math.PI * ASPECT * SPAN_E);

test('drag: the zero-lift part plus the induced part, from the polar\'s inputs', () => {
  // 220 KIAS, 1 G: far from the stall, so only the two parts.
  near(dragPerWeight(220, 2000, 1), qPsf(220) * WING_SQFT * CD0 / SORTIE_LB + inducedPerWeight(220, 1), 1e-12, '220 KIAS, 1 G');
  near(dragPerWeight(200, 0, 3) - dragPerWeight(200, 0, 1), inducedPerWeight(200, 3) - inducedPerWeight(200, 1), 1e-12, 'the G² part, 200 KIAS');
  assert.equal(dragPerWeight(180, 20000, 2), dragPerWeight(180, 0, 2), 'at a given IAS, drag does not change with height');
  // The least drag at 1 G, 6,400 lb: within the shared ±10 kt of the SMM's 125 KIAS best glide (SMM 13.5 para 7).
  let least = 0;
  for (let k = 100; k <= 150; k += 0.5) if (!least || dragPerWeight(k, 0, 1) < dragPerWeight(least, 0, 1)) least = k;
  near(least, 125, 10, 'least drag speed, KIAS');
  // Gear and flaps add drag; a heavier aircraft has more induced drag ÷ weight at the same speed and G.
  assert.ok(dragPerWeight(120, 2000, 1, 'gearDown') > dragPerWeight(120, 2000, 1), 'gear down');
  assert.ok(dragPerWeight(120, 2000, 1, 'landing') > dragPerWeight(120, 2000, 1, 'flapsTakeoff'), 'landing flap over takeoff flap');
  assert.ok(dragPerWeight(150, 2000, 2, 'clean', 6900) > dragPerWeight(150, 2000, 2, 'clean', 5170), 'heavier');
  assert.throws(() => dragPerWeight(150, 2000, 1, 'spoilers'), RangeError);
  for (const [kias, alt, g, w] of [[0.5, 2000, 1, 6400], [NaN, 2000, 1, 6400], [150, NaN, 1, 6400], [150, 2000, NaN, 6400], [150, 2000, 1, 5000], [150, 2000, 1, 7000]]) {
    assert.throws(() => dragPerWeight(kias, alt, g, 'clean', w), RangeError, `${kias} KIAS, ${alt} ft, ${g} G, ${w} lb`);
  }
  // VMO is a published limit, flagged on screen, never a wall: the drag past it is still there (AGENTS.md).
  assert.ok(dragPerWeight(330, 2000, 1) > dragPerWeight(316, 2000, 1), 'past VMO');
});

test('thrust: falls with speed, holds its sea-level value to about 16,000 ft, then falls with density', () => {
  assert.ok(thrustPerWeight(100, 0) > thrustPerWeight(150, 0) && thrustPerWeight(150, 0) > thrustPerWeight(250, 0), 'falls with speed');
  // Same true airspeed, sea level and 12,000 ft (density ratio above the flat-rating corner at 16,000 ft, about 0.61): same thrust.
  near(thrustPerWeight(tasToIasKt(200, 12000), 12000), thrustPerWeight(200, 0), 1e-12, 'flat-rated below about 16,000 ft');
  assert.ok(thrustPerWeight(tasToIasKt(200, 20000), 20000) < thrustPerWeight(200, 0), 'less above it');
  // As power: a propeller turns 50 to 90 % of the shaft power into thrust power (standard aerodynamics); the shaft
  // power is the PT6A-68's 1,100 shp, flat-rated (EASA.IM.A.636), and the exhaust adds a little.
  // It rises with speed through the pattern and fight speeds; near the propeller's peak it levels off.
  let last = 0;
  for (const kias of [100, 150, 200, 250, 280]) {
    const share = thrustPerWeight(kias, 0) * SORTIE_LB * kias * KT_TO_FTPS / 550 / 1100;
    assert.ok(share > 0.5 && share < 0.9 && (kias > 250 || share > last), `thrust power at ${kias} KIAS: ${(share * 100).toFixed(0)} % of 1,100 shp`);
    last = share;
  }
  near(thrustPerWeight(180, 2000, 5170), thrustPerWeight(180, 2000) * SORTIE_LB / 5170, 1e-12, 'thrust ÷ weight at another weight');
});

// The one new test of this rebuild: the model's level-flight torque against the SMM and Patrick. With the propeller
// at 2,000 rpm, torque is a share of the 1,100 shp, and the part throttle that holds level flight is drag ÷ full thrust.
test('level flight at 220 KIAS, pattern height, takes about 65 % torque (SMM 4.14 para 32; Patrick, 12 Oct 2026)', () => {
  const torque = dragPerWeight(220, 2000, 1) / thrustPerWeight(220, 2000);
  // 10 points either way: the SMM and Patrick both say "about".
  assert.ok(torque >= 0.55 && torque <= 0.75, `${(torque * 100).toFixed(1)} % torque`);
});

test('excess thrust: thrust minus drag', () => {
  for (const [kias, alt, g] of [[140, 0, 2.8], [200, 10000, 1], [250, 20000, 4]]) {
    near(excessThrustPerWeight(kias, alt, g), thrustPerWeight(kias, alt) - dragPerWeight(kias, alt, g), 1e-15, `${kias} KIAS, ${alt} ft, ${g} G`);
  }
});

test('t6aExcessFn: excess thrust for stepPointMass, which passes true airspeed', () => {
  near(t6aExcessFn(iasToTasKt(180, 12000), 12000, 3), excessThrustPerWeight(180, 12000, 3), 1e-12, '180 KIAS at 12,000 ft, 3 G');
});

const DEG = 180 / Math.PI;

test('the model\'s corner: 7 G first at 227.5 KIAS (86 kt × √7); 33.3°/s on a 659 ft radius at 227 KIAS, sea level', () => {
  near(T6A_LIMITS.stallKias * Math.sqrt(T6A_LIMITS.maxG), 227.5, 0.05, 'corner speed');
  const v = iasToTasKt(227, 0) * KT_TO_FTPS;
  near(turnRateRadPerSec(v, 7) * DEG, 33.3, 0.1, 'instantaneous rate at 7 G');
  near(turnRadiusFt(v, 7), 659, 1, 'radius at 7 G');
});

// ── Glide and zoom, and the cross-checks ──

// Clean: SMM 13.5 paras 6 and 7. Gear down, landing flap and windmilling: Patrick's ruling, to confirm. Takeoff flap:
// an estimate between gear down and landing flap (Patrick, 4 Oct 2026 04:18Z).
test('the best glide, by configuration', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(T6A_GLIDE).map(([k, c]) => [k, [c.kias, c.nmPer1000Ft, c.prop]])),
    {
      clean: [125, 2.0, 'feathered'],
      gearDown: [105, 1.5, 'feathered'],
      flapsTakeoff: [110, 1.3, 'feathered'],
      landing: [95, 1.1, 'feathered'],
      windmilling: [110, 1.0, 'windmilling'],
    });
  assert.throws(() => { T6A_GLIDE.clean.kias = 120; }, TypeError);
});

test('glide sink rate: true airspeed ÷ the glide ratio, so it grows with height', () => {
  // 125 KIAS at sea level is 12,660 ft/min forward; 2 NM per 1,000 ft is 12.15:1.
  near(glideSinkFpm('clean', 125, 0), 125 * KT_TO_FTPS * 60 / (2 * FT_PER_NM / 1000), 1e-9, 'clean at sea level');
  near(glideSinkFpm('clean', 125, 0), 1042, 1, 'about 1,040 ft/min at sea level');
  assert.ok(glideSinkFpm('clean', 125, 10000) > glideSinkFpm('clean', 125, 0), 'faster sink higher up');
  assert.throws(() => glideSinkFpm('Clean', 125, 0), { name: 'RangeError', message: /clean, gearDown, flapsTakeoff, landing, windmilling/ });
  near(glideSinkFpm('gearDown', 120, 3500), iasToTasKt(120, 3500) * KT_TO_FTPS * 60 / (1.5 * FT_PER_NM / 1000), 1e-9, 'the SMM\'s 120 KIAS gear down');
});

test('the glide cross-check: drag alone at 125 KIAS clean glides within 15 % of 2 NM per 1,000 ft', () => {
  const ratio = 1 / dragPerWeight(125, 0, 1);
  const refRatio = 2 * FT_PER_NM / 1000;
  assert.ok(Math.abs(ratio / refRatio - 1) <= 0.15, `model ${ratio.toFixed(2)}:1, SMM ${refRatio.toFixed(2)}:1`);
});

test('the zoom refuses speeds and heights it cannot fly, rather than hang', () => {
  for (const [kias, alt] of [[-200, 3000], [NaN, 3000], [Infinity, 3000], [317, 3000], [200, NaN], [200, -Infinity]]) {
    assert.throws(() => flyZoomT6A(kias, alt), RangeError, `${kias} KIAS at ${alt} ft, flown`);
  }
  assert.ok(flyZoomT6A(316, 3000).gainFt > flyZoomT6A(250, 3000).gainFt, 'up to VMO');
  assert.deepEqual(flyZoomT6A(0, 3000), { gainFt: 0, timeSec: 0, distanceFt: 0 }, 'standing still: nothing to trade');
});

// ── The stick shaker and the split S (Patrick, 2026-09-30 09:27Z) ──
// Manoeuvre pulls fly in the shaker, not on the stall line: the shaker comes
// on 7 kt above the stall (Patrick's ruling, 30 Sep 2026), so the G is
// (KIAS ÷ 93)². Split S pulls go up to 5 G (Patrick).

test('the manoeuvre numbers: shaker 7 kt above the stall, split S 5 G, 90°/s roll, 20° nose up, 0.5 G roll', () => {
  assert.deepEqual({ ...T6A_MANOEUVRE }, { shakerMarginKt: 7, splitSMaxG: 5, rollRateDegPerSec: 90, splitSNoseUpDeg: 20, splitSRollG: 0.5 });
  assert.ok(Object.isFrozen(T6A_MANOEUVRE));
});

test('shakerG: 1 G at 93 KIAS, (KIAS ÷ 93)² above it, capped at the envelope\'s 7 G unless told', () => {
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

test('the split S from 110 KIAS at 10,000 ft: about 2,000 ft below the top (SMM 14.16 para 40), faster at the exit, inside 7 G', (t) => {
  const r = splitST6A(110, 10000);
  near(r.fromTopFt, 2000, 100, 'loss from the top, shared ±100 ft');
  assert.ok(r.exitKias > 110, `exit ${r.exitKias} KIAS`);
  // Patrick's G rule (11 Oct 2026): over 7 G fails, over 5 G is a caution only.
  assert.ok(r.peakG <= 7, `peak ${r.peakG} G`);
  if (r.peakG > 5) t.diagnostic(`caution: peak ${r.peakG.toFixed(2)} G, over 5 G`);
  // A generous limit: a split S is well under a minute; 60 s would mean it is stuck (the model's own guard stops at 120 s).
  assert.ok(r.timeSec > 0 && r.timeSec < 60, `time ${r.timeSec} s`);
  assert.equal(r.completed, true);
});

test('the split S against the SMM (14.16 para 40, about 2,000 ft) over its 100 to 120 KIAS entries', (t) => {
  for (const kias of [100, 110, 120]) {
    const r = splitST6A(kias, 10000);
    // From the entry altitude the model loses 14 to 18 % less; from the top it is within 2 %.
    assert.ok(r.lossFt > 1600 && r.lossFt < 1750, `${kias} KIAS: ${r.lossFt} ft from the entry`);
    assert.ok(Math.abs(r.fromTopFt - 2000) < 40, `${kias} KIAS: ${r.fromTopFt} ft from the top`);
    assert.ok(r.peakG <= 7, `${kias} KIAS: peak ${r.peakG} G`); // Patrick's G rule: over 7 G fails
    if (r.peakG > 5) t.diagnostic(`caution: ${kias} KIAS peak ${r.peakG.toFixed(2)} G, over 5 G`);
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

test('the split S loses height, more the faster it starts, and ends level and upright', () => {
  assert.ok(splitST6A(110, 10000).lossFt > 0, 'a split S always ends lower than it started');
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
  // Patrick's card, 12 Oct 2026 06:31Z ("Rewrite"): pilot checks in place of the code's own earlier numbers.
  assert.ok(splitST6A(110, 10000, { noseUpDeg: 0 }).lossFt > base.lossFt, 'no nose-up first loses more than 20° nose up');
  near(splitST6A(110, 10000, { rollRateDegPerSec: 45 }).lossFt, base.lossFt, 100, 'a 45°/s roll: within the shared ±100 ft');
  near(splitST6A(110, 10000, { rollG: 1 }).lossFt, base.lossFt, 100, 'a 1 G roll: within the shared ±100 ft');
  assert.ok(splitST6A(110, 10000, { stallKias: 83 }).lossFt < base.lossFt - 50, 'an 83 kt stall pulls harder');
});

test('the split S flies from a slow or a fast entry, says when it cannot finish, and refuses what it cannot fly', () => {
  for (const kias of [1, 60, 93, 316]) {
    const r = splitST6A(kias, 10000);
    assert.ok(Number.isFinite(r.lossFt) && r.timeSec < 120 && r.completed, `${kias} KIAS`);
  }
  const stuck = splitST6A(110, 10000, { maxG: 1 });
  assert.equal(stuck.completed, false, 'a 1 G pull never comes level');
  // The 120 s guard is a safety stop in the model (Q-T13, decided): a pull that can never come level stops there.
  near(stuck.timeSec, 120, 0.05, 'stopped at the 120 s safety guard');
  for (const [kias, alt] of [[0.5, 10000], [0, 10000], [-1, 10000], [317, 10000], [NaN, 10000], [110, NaN], [110, Infinity]]) {
    assert.throws(() => splitST6A(kias, alt), RangeError, `${kias} KIAS at ${alt} ft`);
  }
});

test('glideRatio: the SMM\'s 2 NM per 1,000 ft clean (13.5 para 7) is about 12.2 ft flown per foot lost', () => {
  near(glideRatio('clean'), 2 * FT_PER_NM / 1000, 1e-9, 'clean');
  near(glideRatio('landing'), 1.1 * FT_PER_NM / 1000, 1e-9, 'landing flap');
  assert.throws(() => glideRatio('spoilers'), RangeError);
});

test('nose attitude: climb angle plus angle of attack, more nose up when slower, pulling or climbing', () => {
  // Properties only: the angle-of-attack size is an estimate (T6A_PITCH), so no exact attitude is pinned here.
  const tas = (kias) => iasToTasKt(kias, 3500) * KT_TO_FTPS;
  const level220 = pitchDegFromClimb(0, tas(220), 220, 1);
  const level140 = pitchDegFromClimb(0, tas(140), 140, 1);
  assert.ok(level220 > 0 && level220 < level140, 'level flight is a little nose up, more so when slower');
  assert.ok(pitchDegFromClimb(0, tas(220), 220, 2) > level220, 'a 2 G turn needs more angle of attack');
  const climbFtps = 2000 / 60;
  const climb = pitchDegFromClimb(climbFtps, tas(180), 180, 1) - pitchDegFromClimb(0, tas(180), 180, 1);
  assert.ok(Math.abs(climb - Math.asin(climbFtps / tas(180)) * 180 / Math.PI) < 1e-9, 'a climb adds its flight path angle');
});
