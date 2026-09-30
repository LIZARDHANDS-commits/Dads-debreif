// Golden test (R9, Q41): the Spacing graph's data. V6's own run is stepped, and its history rows (d12, d13, d14, d34, min,
// closure: what V6's drawGraph plots, line 1959) are compared with the series made from the port's history, exact.
// The axis rule is V6's (line 1964), written out here from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../src/modules/turn-sim/settings.js';
import { createRun } from '../../src/modules/turn-sim/engine/run.js';
import { GRAPH_METRICS, DEFAULT_GRAPH_METRICS, spacingSeries } from '../../src/modules/turn-sim/engine/series.js';
import { createV6Page } from './turn-sim-fake-page.js';

const scenario = (over) => ({ ...V6_DEFAULTS, rearCheckAfterTurns: false, rearDelaySec: 0, durationCoversTurn: false, delayed45Check: 'none', turnDeg: 90, ...over });

function bothRuns(settings) {
  const page = createV6Page(settings, { readsClockTolerance: true });
  page.reset();
  page.play();
  const run = createRun(settings);
  while (page.time() < +page.$('duration').value) { page.step(); run.step(); }
  return { v6: page.history(), rows: run.history() };
}

test('the series are V6\'s own history columns, point for point', () => {
  const { v6, rows } = bothRuns(scenario({ formation: 'weighted', maneuver: 'delayed90away', direction: 'right' }));
  const g = spacingSeries(rows, ['1-2', '1-3', '1-4', '3-4', 'min', 'closure']);
  const column = { '1-2': 'd12', '1-3': 'd13', '1-4': 'd14', '3-4': 'd34', min: 'min', closure: 'closure' };
  assert.equal(g.series.length, 6);
  for (const s of g.series) {
    assert.deepEqual(s.points, v6.map((r) => ({ tSec: r.t, value: r[column[s.id]] })), s.id);
  }
  assert.equal(g.tStartSec, v6[0].t);
  assert.equal(g.tEndSec, v6[v6.length - 1].t);
});

test('the axis is V6\'s: the biggest value or 1,000 down to the smallest or 0, and with closure at least +-1,000', () => {
  const { v6, rows } = bothRuns(scenario({ formation: 'weighted', maneuver: 'delayed90away', direction: 'left' }));
  for (const ids of [['1-2'], ['1-2', '1-3', 'min'], ['closure'], ['1-2', 'closure']]) {
    const g = spacingSeries(rows, ids);
    const vals = v6.flatMap((r) => ids.map((id) => r[{ '1-2': 'd12', '1-3': 'd13', min: 'min', closure: 'closure' }[id]])).filter(Number.isFinite);
    let max = Math.max(...vals, 1000);
    let min = Math.min(...vals, 0);
    if (ids.includes('closure')) { max = Math.max(max, 1000); min = Math.min(min, -1000); }
    assert.deepEqual([g.axisMin, g.axisMax], [min, max], ids.join());
  }
});

test('a two-ship has only the 1-2 pair: the other series are empty, and closure is 0 as in V6', () => {
  const { v6, rows } = bothRuns(scenario({ formation: 'twoShip', maneuver: 'delayed90away', direction: 'right' }));
  const g = spacingSeries(rows, ['1-2', '1-3', 'min', 'closure']);
  const by = Object.fromEntries(g.series.map((s) => [s.id, s]));
  assert.equal(by['1-3'].points.length, 0);
  assert.deepEqual(by['1-2'].points.map((p) => p.value), v6.map((r) => r.d12));
  assert.deepEqual(by.min.points.map((p) => p.value), v6.map((r) => r.min));
  assert.ok(by.closure.points.every((p) => p.value === 0));
});

test('V6 kept the last 2,000 rows; the port keeps and the graph draws the whole run', () => {
  const { v6, rows } = bothRuns(scenario({ formation: 'weighted', maneuver: 'delayed90away', direction: 'right', durationSec: 120 }));
  assert.equal(v6.length, 2000, 'V6 drops the oldest row past 2,000');
  assert.ok(rows.length > 2000, 'more than 2,000 rows: 120 s of steps and the row of the first plan');
  // What V6 still has is the end of the port's history, exactly.
  assert.deepEqual(rows.slice(-2000).map((r) => [r.tSec, r.pairs['1-2'], r.minSepFt, r.closure13Ftps]), v6.map((r) => [r.t, r.d12, r.min, r.closure]));
  const g = spacingSeries(rows, ['1-2', 'closure']);
  assert.ok(g.series.every((s) => s.points.length === rows.length));
  assert.equal(g.tStartSec, 0);
  assert.equal(g.tEndSec, rows[rows.length - 1].tSec);
});

// Colour-vision simulation (Machado 2009, severity 1), to check the closure line stays apart from the other colours.
const SIM = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const linear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function labOf(hex, matrix) {
  const rgb = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16)));
  const [r, g, b] = matrix.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

test('the closure line is dashed and its colour is well apart from every other metric, also under protan and deutan simulation', () => {
  const closure = GRAPH_METRICS.find((m) => m.id === 'closure');
  assert.equal(closure.dashed, true);
  assert.ok(GRAPH_METRICS.filter((m) => m.id !== 'closure').every((m) => !m.dashed), 'only the closure is dashed');
  for (const [name, matrix] of Object.entries(SIM)) {
    for (const other of GRAPH_METRICS.filter((m) => m.id !== 'closure')) {
      const a = labOf(closure.colour, matrix);
      const b = labOf(other.colour, matrix);
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(distance >= 20, `${name}: closure against ${other.id} is only ${distance.toFixed(1)} apart`);
    }
  }
});

test('each metric has its own colour and label, the default is what V6 had ticked, and a short history draws nothing', () => {
  assert.deepEqual([...DEFAULT_GRAPH_METRICS], ['1-2', '1-3', 'min']);
  assert.equal(new Set(GRAPH_METRICS.map((m) => m.colour)).size, GRAPH_METRICS.length);
  assert.ok(GRAPH_METRICS.every((m) => m.label && m.unit));
  assert.deepEqual(spacingSeries([]).series.map((s) => s.id), [...DEFAULT_GRAPH_METRICS]);
  const run = createRun(scenario({}));
  run.step();
  const one = spacingSeries(run.history().slice(0, 1));
  assert.ok(one.series.every((s) => s.points.length === 0));
  assert.deepEqual([one.axisMin, one.axisMax], [0, 1000]);
  assert.throws(() => spacingSeries(run.history(), ['9-9']));
});
