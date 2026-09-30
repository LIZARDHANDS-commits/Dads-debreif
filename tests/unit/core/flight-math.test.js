// What the turn numbers mean, checked against known answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../../src/core/units.js';
import { radToDeg } from '../../../src/core/angles.js';
import { MIN_TURN_G, limitG, bankDegFromG, turnRadiusFt, turnRateRadPerSec, turnSimG, isaDensityRatio, emPoint, closureKt, formatClosureKt, gFromTrack } from '../../../src/core/flight-math.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('a 2 G level turn is a 60° bank, a 4 G turn about 75.5°', () => {
  near(bankDegFromG(2), 60, 1e-12);
  near(bankDegFromG(4), 75.52, 0.01);
});

test('4 G at 220 knots: about 1,106 ft radius and 19.2° per second', () => {
  const v = ktToFtps(220);
  near(turnRadiusFt(v, 4), 1106, 1);
  near(radToDeg(turnRateRadPerSec(v, 4)), 19.23, 0.01);
});

test('radius grows with the square of speed; rate falls as speed rises', () => {
  const g = 3;
  near(turnRadiusFt(ktToFtps(240), g) / turnRadiusFt(ktToFtps(120), g), 4, 1e-12);
  assert.ok(turnRateRadPerSec(ktToFtps(240), g) < turnRateRadPerSec(ktToFtps(120), g));
});

test('rate times radius is the speed', () => {
  for (const [kt, g] of [[120, 1.5], [200, 4], [300, 6.5]]) {
    const v = ktToFtps(kt);
    near(turnRateRadPerSec(v, g) * turnRadiusFt(v, g), v, 1e-9);
  }
});

test('limitG keeps G at least 1.01 and at most the cap', () => {
  assert.equal(MIN_TURN_G, 1.01);
  assert.equal(limitG(0.5), 1.01);
  assert.equal(limitG(4), 4);
  assert.equal(limitG(12), 12);
  assert.equal(limitG(12, 9), 9);
  assert.ok(Number.isNaN(limitG(NaN)));
});

// A wingman (#2) flying a 4 G turn with G fix on, 3,000 ft spacing and strength 1.
const wingman = { gSetting: 4, gErr: 0, useErrorsAndCorrection: true, correction: 'gfix', aircraftId: 2, distToLeadFt: 3000, spacingFt: 3000, corrStrength: 1 };

test('turnSimG: the G error is added, but only when errors are on', () => {
  near(turnSimG({ ...wingman, correction: 'none', gErr: 0.3 }), 4.3, 1e-12);
  assert.equal(turnSimG({ ...wingman, useErrorsAndCorrection: false, gErr: 0.3, distToLeadFt: 9000 }), 4);
});

test('turnSimG: the G box is limited to 1.01 before the error is added, and G again after', () => {
  assert.equal(turnSimG({ ...wingman, correction: 'none', gSetting: 1.01, gErr: -0.5 }), 1.01);
  // A box of 0.5 counts as 1.01, so an error of +0.6 gives 1.61 (not 1.1).
  near(turnSimG({ ...wingman, correction: 'none', gSetting: 0.5, gErr: 0.6 }), 1.61, 1e-12);
});

test('turnSimG: G fix pulls more G when too far back, less when too close', () => {
  assert.equal(turnSimG(wingman), 4); // on the slot
  near(turnSimG({ ...wingman, distToLeadFt: 4500 }), 4.25, 1e-12); // 1,500 ft back: 1500 / 6000
  near(turnSimG({ ...wingman, distToLeadFt: 4500, corrStrength: 2 }), 4.5, 1e-12);
  near(turnSimG({ ...wingman, distToLeadFt: 2250 }), 3.875, 1e-12); // 750 ft too close
});

test('turnSimG: the correction is at most 0.8 G either way', () => {
  near(turnSimG({ ...wingman, distToLeadFt: 12000, corrStrength: 3 }), 4.8, 1e-12);
  near(turnSimG({ ...wingman, distToLeadFt: 0, corrStrength: 3 }), 3.2, 1e-12);
});

test('turnSimG: the slot is the spacing times the aircraft number less 1; lead is never corrected', () => {
  assert.equal(turnSimG({ ...wingman, aircraftId: 3, distToLeadFt: 6000 }), 4);
  near(turnSimG({ ...wingman, aircraftId: 4, distToLeadFt: 12000 }), 4.5, 1e-12); // 3,000 ft back of slot 9,000
  assert.equal(turnSimG({ ...wingman, aircraftId: 1, distToLeadFt: 9000 }), 4);
});

test('turnSimG (D74): G is limited to 1.01 again after the correction, so the wingman still turns', () => {
  // V6 gave 0.7 G here (1.5 - 0.8): no turn, NaN. Now the wingman flies almost straight.
  const g = turnSimG({ ...wingman, gSetting: 1.5, distToLeadFt: 0, corrStrength: 2 });
  assert.equal(g, 1.01);
  assert.ok(turnRateRadPerSec(ktToFtps(200), g) > 0);
  // V6 gave exactly 1.0 G at base 1.8 (turn rate 0); now 1.01.
  assert.equal(turnSimG({ ...wingman, gSetting: 1.8, distToLeadFt: 0, corrStrength: 2 }), 1.01);
  // The floor is under the 1.01 G base too (V6 gave 0.21).
  assert.equal(turnSimG({ ...wingman, gSetting: 1.01, distToLeadFt: 0, corrStrength: 2 }), 1.01);
  // 1.805 - 0.8 = 1.005 (V6 turned at a tiny rate here): now 1.01 too.
  assert.equal(turnSimG({ ...wingman, gSetting: 1.805, distToLeadFt: 0, corrStrength: 2 }), 1.01);
  // Just above it, nothing changes: 1.85 - 0.8 = 1.05.
  near(turnSimG({ ...wingman, gSetting: 1.85, distToLeadFt: 0, corrStrength: 2 }), 1.05, 1e-12);
});

/** Three moments one second apart on a steady turn of rateDeg per second at kt knots. */
function steadyTurn(kt, rateDeg) {
  const v = ktToFtps(kt), w = rateDeg * Math.PI / 180, R = v / w;
  return [-1, 0, 1].map(k => ({ x: R * Math.sin(w * k), y: R - R * Math.cos(w * k) }));
}

test('emPoint shows the real turn rate (D39: V6 showed half)', () => {
  for (const rate of [3, 10, 19.2, -15]) {
    const [a, p, b] = steadyTurn(200, rate);
    near(emPoint(a, p, b).turnRateDeg, Math.abs(rate), 1e-9);
  }
});

test('emPoint: sea-level density ratio is 1, so IAS equals ground speed there', () => {
  near(isaDensityRatio(0), 1, 1e-15);
  const [a, p, b] = steadyTurn(200, 10);
  const m = emPoint(a, { ...p, spdKt: 200, altFt: 0 }, b);
  near(m.iasKt, 200, 1e-12);
  assert.ok(emPoint(a, { ...p, spdKt: 200, altFt: 8000 }, b).iasKt < 200);
});

test('emPoint without a recorded speed uses the distance flown over two seconds', () => {
  const m = emPoint({ x: 0, y: 0 }, { x: 337.562, y: 0 }, { x: 675.124, y: 0 });
  near(m.gsKt, 200, 1e-9);
  assert.equal(m.turnRateDeg, 0);
  assert.equal(m.altFt, 6500);
});

test('two aircraft meeting head-on at 200 knots each close at about 400 knots', () => {
  const v = ktToFtps(200);
  const kt = closureKt({ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: v, y: 0 }, { x: 10000 - v, y: 0 }, 1);
  near(kt, 400, 0.01);
  assert.ok(closureKt({ x: v, y: 0 }, { x: 10000 - v, y: 0 }, { x: 0, y: 0 }, { x: 10000, y: 0 }, 1) < 0, 'opening is negative');
  assert.equal(formatClosureKt(kt), '+400 kt');
  assert.equal(formatClosureKt(-0.4), '0 kt');
  assert.equal(closureKt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 0), null);
});

test('gFromTrack reads back the G of a steady level turn', () => {
  // Along a 4 G turn at 220 knots, heading grows at the turn rate.
  const v = ktToFtps(220), w = turnRateRadPerSec(v, 4), R = v / w, dt = 1;
  const p0 = { x: R, y: 0 }, p1 = { x: R * Math.cos(w * dt), y: R * Math.sin(w * dt) };
  const g = gFromTrack(p0, Math.PI / 2, p1, Math.PI / 2 + w * dt, dt);
  near(g, 4, 0.03); // a little under 4: the straight line between the points is shorter than the arc
  assert.equal(gFromTrack(p0, 0, { x: R + 10, y: 0 }, 0, 1), null, 'too slow to tell');
  assert.equal(gFromTrack(p0, 0, p1, 3, 1), null, 'over 9 G is noise');
  assert.equal(gFromTrack(null, 0, p1, 0, 1), null, 'a missing moment');
  assert.equal(gFromTrack(p0, 0, undefined, 0, 1), null);
});
