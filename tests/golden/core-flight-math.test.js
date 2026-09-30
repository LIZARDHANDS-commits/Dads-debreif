// Golden test (R9): src/core/flight-math.js against V6's three copies of the
// turn physics: Turn Sim, Turn Fight (`M`) and the Traffic page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ktToFtps } from '../../src/core/units.js';
import { limitG, bankDegFromG, turnRadiusFt, turnRateRadPerSec, turnSimG, isaDensityRatio, emPoint, closureKt, formatClosureKt, gFromTrack } from '../../src/core/flight-math.js';
import { loadV6, v6FunctionText, v6Number } from './v6-source.js';
import { seeded, spread, recordedTrack } from './inputs.js';

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
  const v6 = loadV6(['rad2deg', 'bankFromG', 'turnRadius', 'turnRate'], { marker: TURN_SIM, prelude: `const G0=${v6Number('G0')};` });
  for (const g of G_VALUES) assert.equal(bankDegFromG(g), v6.bankFromG(g), `g=${g}`);
  for (const [kt, g] of pairs()) {
    const v = ktToFtps(kt);
    assert.equal(turnRadiusFt(v, g), v6.turnRadius(v, g), `kt=${kt} g=${g}`);
    assert.equal(turnRateRadPerSec(v, g), v6.turnRate(v, g), `kt=${kt} g=${g}`);
  }
});

test('Turn Fight: M gives the same speed, G, radius and degrees per second', () => {
  const { M } = loadV6(['M'], { marker: BFM, prelude: `const KT=${v6Number('KT', { marker: BFM })},G=${v6Number('G', { marker: BFM })};` });
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
  // Turn Sim's G correction (line 1583) adds up to −0.8 G after limiting, so
  // base G plus a G error under 1.8 can reach this (flagged in SPEC-core).
  assert.ok(Number.isNaN(turnRateRadPerSec(ktToFtps(200), 0.5)));
  assert.ok(Number.isNaN(bankDegFromG(0.5)));
  assert.equal(turnRadiusFt(ktToFtps(200), 1), Infinity);
  assert.equal(turnRateRadPerSec(ktToFtps(200), 1), 0);
});

/**
 * V6's G for one Turn Sim aircraft: its two lines from moveAircraftList (1582
 * and 1583), cut out by text and run as they are, with the page's globals
 * (baseG, $, dist, ac, a) given as arguments. Returns a function of one case
 * that gives V6's G and the base G V6's own baseG() read from the G box.
 */
function v6TurnSimG() {
  const body = v6FunctionText('moveAircraftList');
  const lineG = body.match(/^ *let g=Math\.max\(1\.01,baseG\(\).*$/m);
  const lineFix = body.match(/^ *if\(useErrorsAndCorrection && \$\('correction'\).*$/m);
  assert.ok(lineG && lineFix, 'the two G lines are still in moveAircraftList');
  const run = new Function('baseG', '$', 'dist', 'ac', 'a', 'useErrorsAndCorrection', `${lineG[0]}\n${lineFix[0]}\nreturn g;`);
  const { baseG, box } = loadV6(['baseG'], { prelude: 'const box={value:0}; const $=()=>box;', expose: ['box'] });
  const { dist } = loadV6(['dist']);
  return c => {
    box.value = c.gload; // the G box, which baseG() reads and limits to 1.01
    const boxes = { correction: { value: c.correction }, spacing: { value: c.spacingFt }, corrStrength: { value: c.corrStrength } };
    // Lead sits at the origin; the aircraft is distToLeadFt away on the x axis.
    const a = { id: c.aircraftId, gErr: c.gErr, x: c.distToLeadFt, y: 0 };
    return { g: run(baseG, id => boxes[id], dist, [{ x: 0, y: 0 }], a, c.useErrorsAndCorrection), baseG: baseG() };
  };
}

/** Fixed edge cases first, then seeded random ones with plenty of low base G and hard corrections. */
function turnSimGCases() {
  const fix = { gload: 4, gErr: 0, useErrorsAndCorrection: true, correction: 'gfix', aircraftId: 2, distToLeadFt: 3000, spacingFt: 3000, corrStrength: 1 };
  const cases = [
    fix,
    { ...fix, aircraftId: 1, distToLeadFt: 9000 },                            // lead is never corrected
    { ...fix, correction: 'none', distToLeadFt: 9000 },                       // no correction model
    { ...fix, useErrorsAndCorrection: false, gErr: 0.5, distToLeadFt: 9000 }, // planning pass: no error, no correction
    { ...fix, gErr: 0.5 },                                                    // error, spacing already right
    { ...fix, distToLeadFt: 3000 + 6000 * 0.8 },                              // correction exactly +0.8
    { ...fix, aircraftId: 4, distToLeadFt: 9000, gload: 2 },                  // slot is spacing × 3
    { ...fix, aircraftId: 3, distToLeadFt: 6000, gload: 2 },                  // right on the slot: no change
    { ...fix, gload: 2, corrStrength: 0 },
    { ...fix, gload: 2, spacingFt: 0, distToLeadFt: 0 },
    { ...fix, gload: 1.8, distToLeadFt: 0, corrStrength: 2 },                 // the 1.8 case: G 1.0, turn rate 0
    { ...fix, gload: 1.79, distToLeadFt: 0, corrStrength: 2 },                // just under: below 1 G
    { ...fix, gload: 1.01, distToLeadFt: 0, corrStrength: 2 },                // base G at the limit, full -0.8
    { ...fix, gload: 0.5, distToLeadFt: 0, corrStrength: 2 },                 // box under 1.01, limited by baseG()
    { ...fix, gload: 0, gErr: -0.7, distToLeadFt: 0, corrStrength: 2 },       // error pushes under the limit first
    { ...fix, gload: 3, gErr: -5, distToLeadFt: 0, corrStrength: 2 },         // limited to 1.01, then -0.8
  ];
  const r = seeded(0xc0de);
  for (let i = 0; i < 600; i++) {
    cases.push({
      gload: i % 3 === 0 ? 0.8 + 1.4 * r() : 1 + 8 * r(),
      gErr: -1 + 2 * r(),
      useErrorsAndCorrection: r() < 0.9,
      correction: r() < 0.8 ? 'gfix' : 'none',
      aircraftId: 1 + Math.floor(4 * r()),
      distToLeadFt: 12000 * r(),
      spacingFt: 6000 * r(),
      corrStrength: 3 * r(),
    });
  }
  return cases;
}

test('Turn Sim G: V6 limits to 1.01, then corrects, so G can end below 1', () => {
  const v6G = v6TurnSimG();
  let below1 = 0, exactly1 = 0, corrected = 0;
  for (const c of turnSimGCases()) {
    const v6 = v6G(c);
    const g = turnSimG({ ...c, baseG: v6.baseG });
    assert.equal(g, v6.g, JSON.stringify(c));
    if (g < 1) below1++;
    if (g === 1) exactly1++;
    if (c.useErrorsAndCorrection && c.correction === 'gfix' && c.aircraftId !== 1) corrected++;
  }
  // The cases really do reach the trouble spots, so the equality above says something.
  assert.ok(below1 >= 20, `${below1} cases below 1 G`);
  assert.ok(exactly1 >= 1, 'the exactly 1 G case');
  assert.ok(corrected >= 300, `${corrected} corrected cases`);
});

test('isaDensityRatio matches the EM chart isaRhoRatio', () => {
  const { isaRhoRatio } = loadV6(['isaRhoRatio']);
  // 36089.238845144355 ft is exactly 11,000 m, where V6 switches to 0.297.
  for (const ft of [0, 6500, 8000, 13000, 36088, 36089, 36089.238845144355, 36090, 40000, -1000, NaN, ...spread(200, -2000, 50000, 13)]) {
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

// ── Closure and estimated G: V6's debrief functions run on the same tracks ──

function debriefV6() {
  return loadV6(['interpTrack', 'headingAtTrack', 'offsetKmlPoint', 'interpTrackWithError', 'normAngleRad', 'closureRateKt', 'estimatedGAtTrack', 'fmtClosureKt'], {
    prelude: `const KML_KT_PER_FPS=${v6Number('KML_KT_PER_FPS')}; let tracks={}, kmlT=0, kmlStart=0, kmlErrors={};
      function setDebrief(s){ tracks=s.tracks; kmlT=s.kmlT; kmlStart=s.kmlStart; kmlErrors=s.kmlErrors||{}; }`,
    expose: ['setDebrief'],
  });
}

test('closureKt matches the debrief closureRateKt, positions read the V6 way', () => {
  const v6 = debriefV6();
  const r = seeded(15);
  for (let i = 0; i < 60; i++) {
    const A = recordedTrack(1, r), B = recordedTrack(2, r);
    B.pts.forEach((p, k) => { p.t = A.pts[Math.min(k, A.pts.length - 1)].t + (r() - 0.5); });
    B.pts.sort((p, q) => p.t - q.t);
    const kmlErrors = i % 3 ? {} : { 2: { on: true, latDir: 'wide', latMag: 300, foreDir: 'aft', foreMag: 100 } };
    for (let j = 0; j < 20; j++) {
      const kmlStart = A.pts[0].t, kmlT = kmlStart - 2 + (A.pts.at(-1).t - kmlStart + 4) * r();
      const lookback = [1, 0.5, 2, 0][j % 4];
      v6.setDebrief({ tracks: { 1: A, 2: B }, kmlT, kmlStart, kmlErrors });
      const prevT = Math.max(kmlStart, kmlT - lookback);
      const at = (tr, t) => v6.interpTrackWithError(tr, t);
      const ours = closureKt(at(A, prevT), at(B, prevT), at(A, kmlT), at(B, kmlT), kmlT - prevT);
      assert.equal(ours, v6.closureRateKt(1, 2, lookback), `kmlT=${kmlT} lookback=${lookback}`);
      assert.equal(formatClosureKt(ours), v6.fmtClosureKt(ours));
    }
  }
  v6.setDebrief({ tracks: { 1: recordedTrack(1, r) }, kmlT: 5, kmlStart: 0 });
  assert.equal(v6.closureRateKt(1, 2), null);
  assert.equal(closureKt({ x: 0, y: 0 }, null, { x: 0, y: 0 }, { x: 1, y: 1 }, 1), null);
});

test('formatClosureKt matches fmtClosureKt', () => {
  const { fmtClosureKt } = debriefV6();
  for (const kt of [null, NaN, Infinity, 0, -0, 0.4, 0.5, -0.5, -0.51, 1, -1, 12.49, 12.5, -12.5, 250, -3000, ...spread(100, -400, 400, 16)]) {
    assert.equal(formatClosureKt(kt), fmtClosureKt(kt), `kt=${kt}`);
  }
});

test('gFromTrack matches the debrief estimatedGAtTrack, moments picked the V6 way', () => {
  const v6 = debriefV6();
  const r = seeded(17);
  // What flight-data has to do before calling gFromTrack (estimatedGAtTrack, lines 2463 to 2468).
  function estimatedG(tr, time, windowSec = 1.5) {
    if (!tr || !tr.pts || tr.pts.length < 3) return null;
    const t0 = Math.max(tr.pts[0].t, time - windowSec), t1 = Math.min(tr.pts[tr.pts.length - 1].t, time + windowSec);
    if (t1 - t0 < 0.5) return null;
    return gFromTrack(v6.interpTrack(tr, t0), v6.headingAtTrack(tr, t0), v6.interpTrack(tr, t1), v6.headingAtTrack(tr, t1), t1 - t0);
  }
  let found = 0;
  for (let i = 0; i < 80; i++) {
    const tr = recordedTrack(1, r, i % 10 === 0 ? 2 : 40);
    for (let j = 0; j < 25; j++) {
      const time = tr.pts[0].t - 2 + (tr.pts.at(-1).t - tr.pts[0].t + 4) * r();
      const windowSec = j % 5 ? 1.5 : 0.2 + 3 * r();
      const want = v6.estimatedGAtTrack(tr, time, windowSec);
      assert.equal(estimatedG(tr, time, windowSec), want, `time=${time}`);
      if (want !== null) found++;
    }
  }
  assert.ok(found > 500, `only ${found} moments had a G to compare`);
});
