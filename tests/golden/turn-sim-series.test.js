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

test('each metric has its own colour and label, the default is what V6 had ticked, and a short history draws nothing', () => {
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
