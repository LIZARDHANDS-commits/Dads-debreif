// Golden test (R9): src/core/flight-math.js against V6's three copies of the
// turn physics: Turn Sim, Turn Fight (`M`) and the Traffic page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../src/core/units.js';
import { limitG, bankDegFromG, turnRadiusFt, turnRateRadPerSec, isaDensityRatio, emPoint } from '../../src/core/flight-math.js';
import { loadV6 } from './v6-source.js';
import { seeded, spread } from './inputs.js';

const TURN_SIM = 'const FT_PER_NM=6076.12, KTS_TO_FPS';
const BFM = '<script id="bfmFight">';

// Level-turn G from barely turning to the Traffic cap and past it, plus the
// values V6 reaches without a limit (below 1 G, exactly 1 G) or from a bad box (NaN).
const G_VALUES = [1.01, 1.5, 2, 3, 4, 5, 6, 7.5, 9, 12, 1, 0.5, 0, -2, NaN, ...spread(150, 1.01, 9, 11)];
const KT_VALUES = [100, 120, 150, 200, 220, 250, 300, 0, -150, ...spread(40, 80, 400, 12)];

/** Equal, or within `rel` of each other (NaN matches NaN). */
function near(a, b, rel) {
  return Object.is(a, b) || Math.abs(a - b) <= rel * Math.abs(b);
}

function* pairs() {
  for (const kt of KT_VALUES) for (const g of G_VALUES) yield [kt, g];
}

test('Turn Sim: bank, radius and rate match bankFromG, turnRadius and turnRate', () => {
  const v6 = loadV6(['rad2deg', 'bankFromG', 'turnRadius', 'turnRate'], { marker: TURN_SIM, prelude: 'const G0=32.174;' });
  for (const g of G_VALUES) assert.equal(bankDegFromG(g), v6.bankFromG(g), `g=${g}`);
  for (const [kt, g] of pairs()) {
    const v = ktToFtps(kt);
    assert.equal(turnRadiusFt(v, g), v6.turnRadius(v, g), `kt=${kt} g=${g}`);
    assert.equal(turnRateRadPerSec(v, g), v6.turnRate(v, g), `kt=${kt} g=${g}`);
  }
});

test('Turn Fight: M gives the same speed, G, radius and degrees per second', () => {
  const { M } = loadV6(['M'], { marker: BFM, prelude: 'const KT=1.68781,G=32.174;' });
  let lastDigit = 0;
  for (const [kt, g] of pairs()) {
    const m = M(kt, g);
    const v = ktToFtps(kt), lg = limitG(g);
    assert.equal(v, m.v);
    assert.equal(lg, m.g, `g=${g}`);
    assert.equal(turnRadiusFt(v, lg), m.R, `kt=${kt} g=${g}`);
    // M works out the rate as G·√(g²−1)/v, not v/R: the same number to the last digit or two.
    const w = turnRateRadPerSec(v, lg);
    if (kt === 0) {
      assert.equal(w, 0 / 0); // Turn Fight never gets 0 kt: its box reads 0 as 220 (`|| d`).
      continue;
    }
    if (!Object.is(w, m.w)) lastDigit++;
    assert.ok(near(w, m.w, 1e-15), `kt=${kt} g=${g}: ${w} vs ${m.w}`);
    assert.ok(near(w * 180 / Math.PI, m.rate, 1e-15), `kt=${kt} g=${g}`);
  }
  assert.ok(lastDigit > 0, 'the two V6 orders really do differ, which is why this test has a tolerance');
});

test('Traffic page: bankFromG and turnRadiusFromG are limitG(+g || 2, 9) then the same physics', () => {
  const v6 = loadV6(['speedFps', 'bankFromG', 'turnRadiusFromG'], { page: 'traffic' });
  const trafficG = g => limitG(+g || 2, 9);
  for (const g of [...G_VALUES, '', '4', undefined, null]) {
    assert.equal(bankDegFromG(trafficG(g)), v6.bankFromG(g), `g=${g}`);
    for (const kt of KT_VALUES) {
      // The page also reads an empty or zero speed as 120 kt.
      assert.equal(turnRadiusFt(ktToFtps(+kt || 120), trafficG(g)), v6.turnRadiusFromG(kt, g), `kt=${kt} g=${g}`);
    }
  }
});

test('below 1 G there is no turn: NaN, as in V6', () => {
  // Turn Sim's G-correction (line 1583) adds up to −0.8 G after limiting, so a
  // base G under 1.81 can reach this (flagged in SPEC-core).
  assert.ok(Number.isNaN(turnRateRadPerSec(ktToFtps(200), 0.5)));
  assert.ok(Number.isNaN(bankDegFromG(0.5)));
  assert.equal(turnRadiusFt(ktToFtps(200), 1), Infinity);
  assert.equal(turnRateRadPerSec(ktToFtps(200), 1), 0);
});

test('isaDensityRatio matches the EM chart isaRhoRatio', () => {
  const { isaRhoRatio } = loadV6(['isaRhoRatio']);
  for (const ft of [0, 6500, 8000, 13000, 36088, 36089, 36090, 40000, -1000, NaN, ...spread(200, -2000, 50000, 13)]) {
    assert.equal(isaDensityRatio(ft), isaRhoRatio(ft), `ft=${ft}`);
  }
});

/** V6's EM `metrics` reads three moments of a track through the 3D API; this stub serves them. */
function emChartV6() {
  return loadV6(['isaRhoRatio', 'hdg', 'dAng', 'metrics'], { marker: 'function isaRhoRatio(' });
}
function trackApi(before, now, after) {
  return { getInterp: (id, t) => (t === 9 ? before : t === 10 ? now : t === 11 ? after : null) };
}

/** Three moments one second apart: a turn at `rateDeg` per second, with optional speed and altitude. */
function turningTrack(r, { spdKt, altFt } = {}) {
  const kt = 90 + 250 * r(), rateDeg = -30 + 60 * r(), h = 2 * Math.PI * r();
  const v = ktToFtps(kt), w = rateDeg * Math.PI / 180;
  const at = k => ({ x: 1000 * r() + v * Math.cos(h + w * k) * k, y: v * Math.sin(h + w * k) * k, spdKt, altFt });
  return [at(-1), at(0), at(1)];
}

test('emPoint matches the EM chart metrics, except the turn rate is doubled (D39)', () => {
  const { metrics } = emChartV6();
  const r = seeded(14);
  const extras = [{}, { spdKt: 210 }, { altFt: 8000 }, { spdKt: 180, altFt: 13000 }, { altFt: 45000 }, { spdKt: NaN, altFt: NaN }];
  for (let i = 0; i < 300; i++) {
    const [a, p, b] = turningTrack(r, extras[i % extras.length]);
    const m = metrics(trackApi(a, p, b), 1, 10);
    // D39: V6 halved the rate. Doubling is exact in floating point, so this stays an exact match.
    assert.deepEqual(emPoint(a, p, b), { iasKt: m.ias, turnRateDeg: m.tr * 2, altFt: m.alt, gsKt: m.gs });
  }
});

test('emPoint is null when a moment is missing, as metrics is', () => {
  const { metrics } = emChartV6();
  const p = { x: 0, y: 0 }, q = { x: 300, y: 10 };
  for (const [a, b, c] of [[null, p, q], [p, null, q], [p, q, null], [undefined, p, q]]) {
    assert.equal(emPoint(a, b, c), null);
    assert.equal(metrics(trackApi(a, b, c), 1, 10), null);
  }
});
