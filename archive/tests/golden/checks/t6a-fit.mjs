// Refits the T-6A thrust to the sustained turn chart and prints the constants
// for T6A_FIT in src/core/t6a-turn-charts.js (SPEC-core, "API, fifth PR").
// Run after changing a chart point or the glide numbers, then copy the output:
//
//     node tests/golden/checks/t6a-fit.mjs
//
// Drag comes from the max glide chart alone (best glide 125 KIAS, 2 NM per
// 1,000 ft): at the best glide speed the two drag parts are equal, and their
// sum is 1 ÷ L/D. Thrust is then fitted to the turn chart by least squares on
// (T − D)/D, with a downhill simplex from a few starting guesses.
import { T6A_TURN_POINTS } from '../../../src/core/t6a-turn-charts.js';
import { isaDensityRatio } from '../../../src/core/flight-math.js';
import { FT_PER_NM, G_FTPS2, KT_TO_FTPS } from '../../../src/core/units.js';

const glideRatio = 2 * FT_PER_NM / 1000;
const vbg = 125;
const dragA = 1 / (2 * glideRatio * vbg * vbg);
const dragB = dragA * vbg ** 4;

const tas = (kias, alt) => kias / Math.sqrt(isaDensityRatio(alt));
const gFromRate = (kias, alt, degPerSec) => Math.hypot(1, degPerSec * Math.PI / 180 * tas(kias, alt) * KT_TO_FTPS / G_FTPS2);
const drag = (kias, g) => dragA * kias * kias + dragB * g * g / (kias * kias);
const thrust = ([k, v0, m, flat]) => (kias, alt) => k * Math.min(isaDensityRatio(alt), flat) ** m / (tas(kias, alt) + v0);

function cost(p) {
  if (p[1] <= -50 || p[3] <= 0.2 || p[3] > 1) return 1e9;
  const t = thrust(p);
  let s = 0;
  for (const [kias, alt, rate] of T6A_TURN_POINTS) {
    const d = drag(kias, gFromRate(kias, alt, rate));
    s += ((t(kias, alt) - d) / d) ** 2;
  }
  return s;
}

function simplex(f, x0, iterations = 40000) {
  const n = x0.length;
  let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (j === i ? v * 1.2 + 0.01 : v)))];
  let vals = pts.map(f);
  for (let it = 0; it < iterations; it++) {
    const order = pts.map((_, i) => i).sort((i, j) => vals[i] - vals[j]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const toward = (k) => c.map((v, j) => v + k * (v - pts[n][j]));
    const r = toward(1), fr = f(r);
    if (fr < vals[0]) {
      const e = toward(2), fe = f(e);
      [pts[n], vals[n]] = fe < fr ? [e, fe] : [r, fr];
    } else if (fr < vals[n - 1]) {
      [pts[n], vals[n]] = [r, fr];
    } else {
      const k = toward(-0.5), fk = f(k);
      if (fk < vals[n]) [pts[n], vals[n]] = [k, fk];
      else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
    }
  }
  return { x: pts[0], f: vals[0] };
}

let best = { f: Infinity };
for (const x0 of [[70, 75, 0.5, 0.9], [70, 75, 0.8, 0.7], [60, 50, 1, 0.6]]) {
  const r = simplex(cost, x0);
  if (r.f < best.f) best = r;
}
const [thrustK, thrustV0Kt, thrustDensityExp, thrustFlatSigma] = best.x;
console.log(`cost (sum of squared (T − D)/D over ${T6A_TURN_POINTS.length} points): ${best.f.toFixed(4)}`);
console.log(JSON.stringify({
  glideRatio: +glideRatio.toFixed(5),
  bestGlideKias: vbg,
  dragA: +dragA.toPrecision(6),
  dragB: +dragB.toPrecision(6),
  thrustK: +thrustK.toPrecision(6),
  thrustV0Kt: +thrustV0Kt.toPrecision(5),
  thrustDensityExp: +thrustDensityExp.toPrecision(6),
  thrustFlatSigma: +thrustFlatSigma.toPrecision(6),
}, null, 2));
