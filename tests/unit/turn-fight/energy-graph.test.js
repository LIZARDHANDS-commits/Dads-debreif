// Checks: the Energy height-against-time graph: its data (time, both jets, hard deck), axes and options, uPlot
//   loaded only when the graph starts, drawing, resizing, stopping and freeing.
// Serves: TF-R17, ALL-R9, ALL-R12.
// Expected values: design choices typed in (colours, dashed deck, axis rules); the load rule is decision D137;
//   one check scans the source text. No flight numbers.

// The Energy side view's graph (SPEC-turn-fight, "Energy mode"; SPEC.md, uPlot D137): its data, its options, and that
// uPlot is only ever fetched by import() when the graph starts, and freed when it stops.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnergyRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import {
  altitudeData, heightRange, timeRange, graphOptions, createAltitudeGraph, MIN_TIME_SPAN_SEC, HEIGHT_MARGIN_FT, HEIGHT_TICK_STEPS_FT, UPLOT_STYLESHEET,
} from '../../../src/modules/turn-fight/energy-graph.js';
import { COLORS } from '../../../src/modules/turn-fight/view.js';

const play = (run, seconds) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.02) advanceRun(run, 0.02);
  return run;
};

test('the data is time, Blue\'s altitude, Red\'s altitude and the hard deck, each as long as the time', () => {
  const run = play(createEnergyRun({ hardDeckFt: 7000, blueKias: 250 }), 20);
  const [time, blue, red, deck] = altitudeData(run);
  assert.equal(time.length, blue.length);
  assert.equal(time.length, red.length);
  assert.equal(time.length, deck.length);
  assert.equal(time[0], 0);
  assert.equal(blue[0], 10000);
  assert.ok(deck.every((d) => d === 7000));
  assert.ok(time.every((t, i) => i === 0 || t > time[i - 1]), 'time only goes forward');
  // The lines end at the aircraft now, not at the last 0.1 s point; the point after it (under 30 s) is the deck's alone.
  const last = time.length - 2;
  assert.ok(Math.abs(time[last] - run.fight.timeSec) < 1e-9);
  assert.equal(blue[last], run.fight.blue.altFt);
  assert.equal(red[last], run.fight.red.altFt);
  assert.deepEqual([time.at(-1), blue.at(-1), red.at(-1), deck.at(-1)], [MIN_TIME_SPAN_SEC, null, null, 7000]);
});

test('a new run has its T+0 point, and the deck line runs across the time axis from the start, so the graph is never empty', () => {
  const [time, blue, red, deck] = altitudeData(createEnergyRun({}));
  assert.deepEqual(time, [0, MIN_TIME_SPAN_SEC]);
  assert.deepEqual(blue, [10000, null]);
  assert.deepEqual(red, [10000, null]);
  assert.deepEqual(deck, [6000, 6000]);
});

test('after 30 s the deck-only point is gone: the data ends at the aircraft', () => {
  const run = play(createEnergyRun({}), 35);
  const [time, blue, , deck] = altitudeData(run);
  assert.ok(Math.abs(time.at(-1) - run.fight.timeSec) < 1e-9);
  assert.equal(blue.at(-1), run.fight.blue.altFt);
  assert.equal(deck.at(-1), 6000);
});

test('the axes: time from 0 and at least 30 s wide; height a little under and over the lines, never below 0', () => {
  assert.deepEqual(timeRange(5), [0, MIN_TIME_SPAN_SEC]);
  assert.deepEqual(timeRange(95), [0, 95]);
  assert.deepEqual(timeRange(Number.NaN), [0, MIN_TIME_SPAN_SEC]);
  assert.deepEqual(heightRange(6000, 10700), [6000 - HEIGHT_MARGIN_FT, 10700 + HEIGHT_MARGIN_FT]);
  assert.deepEqual(heightRange(100, 10700)[0], 0);
  const flat = heightRange(10000, 10000);
  assert.ok(flat[1] - flat[0] >= 1000, 'a level line still has a scale');
  assert.ok(Number.isFinite(heightRange(undefined, undefined)[1]));
});

test('the options: the fight\'s colours, the deck dashed, no legend, no cursor, no zoom, and labelled axes', () => {
  const o = graphOptions({ width: 600, height: 150 });
  assert.deepEqual([o.width, o.height], [600, 150]);
  assert.equal(o.legend.show, false);
  assert.equal(o.cursor.show, false);
  assert.deepEqual(o.series.slice(1).map((s) => s.label), ['Blue', 'Red', 'Hard deck']);
  assert.deepEqual(o.series.slice(1).map((s) => s.stroke), [COLORS.blue, COLORS.red, COLORS.nose]);
  assert.ok(Array.isArray(o.series[3].dash), 'the deck is a dashed line: a reference, not a fight');
  assert.equal(o.series[1].dash, undefined);
  assert.deepEqual(o.axes.map((a) => a.label), ['Time (s)', 'Altitude (ft)']);
  assert.equal(o.scales.x.time, false, 'time is seconds of fight, not a clock');
  assert.deepEqual(o.scales.x.range(null, 0, 12), [0, 30]);
  assert.deepEqual(o.scales.y.range(null, 6000, 10000), [5500, 10500]);
  assert.deepEqual(o.axes[1].values(null, [6000, 10000]), ['6,000', '10,000']);
  // The height axis has room for several labelled ticks in a short box (one every 24 px, at round steps), not one or two.
  assert.equal(o.axes[1].space, 24);
  assert.deepEqual(o.axes[1].incrs, [...HEIGHT_TICK_STEPS_FT]);
  assert.ok(o.axes[1].incrs.includes(500) && o.axes[1].incrs.includes(1000) && o.axes[1].incrs.includes(2000));
  // Each aircraft shows a dot while it has one point (T+0), and none once it has a line; Blue is drawn wider so Red does not hide it.
  const dot = (series, values) => o.series[series].points.show({ data: [null, values, values] }, series);
  assert.equal(dot(1, [10000, null]), true);
  assert.equal(dot(2, [10000, null]), true);
  assert.equal(dot(1, [10000, 10010, null]), false);
  assert.equal(o.series[2].points.show({ data: [[], [1, 2], [null, null]] }, 2), true, 'no point at all is no line either');
  assert.ok(o.series[1].width > o.series[2].width);
  assert.equal(o.series[3].points.show, false);
  assert.equal(o.axes[0].stroke, '#9bb8c6');
  assert.equal(graphOptions({ width: 1, height: 1 }, { text: '#123456', grid: '#654321' }).axes[0].stroke, '#123456');
});

// ── start and stop, with a stand-in for uPlot ────────────────────────────────

function standIn() {
  const calls = { made: [], setData: 0, setSize: [], destroyed: 0 };
  class FakeUPlot {
    constructor(options, data, host) {
      this.options = options;
      this.data = data;
      calls.made.push({ options, data, host });
    }
    setData(data) {
      this.data = data;
      calls.setData++;
      calls.lastData = data;
    }
    setSize(size) {
      calls.setSize.push(size);
    }
    destroy() {
      calls.destroyed++;
    }
  }
  return { FakeUPlot, calls };
}

function fakeHost(width = 640, height = 140) {
  const head = { children: [], append(el) { this.children.push(el); } };
  const doc = { head, createElement: (tag) => ({ tag, remove() { head.children = head.children.filter((c) => c !== this); } }) };
  return {
    ownerDocument: doc, head, clientWidth: width, clientHeight: height, dataset: {}, children: [1, 2],
    replaceChildren() { this.children = []; },
  };
}

const fakeWin = () => {
  const watchers = [];
  return {
    watchers,
    getComputedStyle: () => ({ getPropertyValue: (name) => ({ '--text-muted': ' #aaaaaa ', '--border': '#222222' })[name] ?? '' }),
    ResizeObserver: class {
      constructor(fn) { this.fn = fn; watchers.push(this); }
      observe() { this.watching = true; }
      disconnect() { this.watching = false; }
    },
  };
};

test('start loads uPlot once, draws the run into the host with the page\'s own colours, and adds uPlot\'s stylesheet', async () => {
  const { FakeUPlot, calls } = standIn();
  const host = fakeHost();
  const win = fakeWin();
  let loads = 0;
  const run = createEnergyRun({});
  const graph = createAltitudeGraph(host, { run: () => run, load: async () => { loads++; return FakeUPlot; }, win });
  assert.equal(loads, 0, 'nothing is fetched until the graph starts');
  assert.deepEqual(await graph.start(), { ok: true });
  assert.deepEqual(await graph.start(), { ok: true }, 'a second start does nothing');
  assert.equal(loads, 1);
  assert.equal(calls.made.length, 1);
  assert.equal(calls.made[0].host, host);
  assert.deepEqual([calls.made[0].options.width, calls.made[0].options.height], [640, 140]);
  assert.equal(calls.made[0].options.axes[0].stroke, '#aaaaaa', 'the text colour is the page\'s --text-muted');
  assert.equal(calls.made[0].options.axes[0].grid.stroke, '#222222');
  assert.deepEqual(calls.made[0].data[0], [0, MIN_TIME_SPAN_SEC]);
  assert.equal(host.head.children.length, 1);
  assert.equal(host.head.children[0].href, UPLOT_STYLESHEET);
  assert.equal(host.head.children[0].rel, 'stylesheet');
  assert.equal(host.dataset.draws, '1');
  assert.equal(win.watchers.length, 1);
  assert.equal(win.watchers[0].watching, true);
  assert.deepEqual(graph.stats(), { active: true, drawn: 1 });
});

test('update puts the run\'s newest numbers in; before it starts, or after it stops, it does nothing', async () => {
  const { FakeUPlot, calls } = standIn();
  const host = fakeHost();
  const run = createEnergyRun({});
  const graph = createAltitudeGraph(host, { run: () => run, load: async () => FakeUPlot, win: fakeWin() });
  graph.update();
  assert.equal(calls.setData, 0);
  await graph.start();
  play(run, 5);
  graph.update();
  assert.equal(calls.setData, 1);
  assert.ok(Math.abs(calls.lastData[0].at(-2) - 5) < 0.03, 'the chart now holds T+5 (its last aircraft point; the deck runs on to 30 s)');
  assert.equal(host.dataset.draws, '2');
  graph.stop();
  graph.update();
  assert.equal(calls.setData, 1);
});

test('a resize gives the chart the box\'s new size, and never a zero one', async () => {
  const { FakeUPlot, calls } = standIn();
  const host = fakeHost();
  const win = fakeWin();
  const graph = createAltitudeGraph(host, { run: () => createEnergyRun({}), load: async () => FakeUPlot, win });
  await graph.start();
  calls.setSize.length = 0;
  host.clientWidth = 500;
  host.clientHeight = 120;
  win.watchers[0].fn();
  assert.deepEqual(calls.setSize, [{ width: 500, height: 120 }]);
  host.clientWidth = 0;
  win.watchers[0].fn();
  assert.equal(calls.setSize.length, 1, 'a hidden box (0 px) is left alone');
});

test('stop frees the chart and the box; start draws it again without fetching uPlot again', async () => {
  const { FakeUPlot, calls } = standIn();
  const host = fakeHost();
  const win = fakeWin();
  let loads = 0;
  const graph = createAltitudeGraph(host, { run: () => createEnergyRun({}), load: async () => { loads++; return FakeUPlot; }, win });
  await graph.start();
  graph.stop();
  assert.equal(calls.destroyed, 1);
  assert.deepEqual(host.children, []);
  assert.equal(host.dataset.draws, undefined);
  assert.equal(win.watchers[0].watching, false);
  assert.deepEqual(graph.stats(), { active: false, drawn: 0 });
  await graph.start();
  assert.equal(calls.made.length, 2);
  assert.equal(host.head.children.length, 1, 'the stylesheet is added once');
});

test('a load that finishes after stop is ignored, and one that fails says "load" and can be tried again', async () => {
  const { FakeUPlot, calls } = standIn();
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const graph = createAltitudeGraph(fakeHost(), { run: () => createEnergyRun({}), load: () => slow, win: fakeWin() });
  const starting = graph.start();
  graph.stop();
  release(FakeUPlot);
  assert.deepEqual(await starting, { ok: false, reason: 'closed' });
  assert.equal(calls.made.length, 0);

  const warn = console.warn;
  console.warn = () => {};
  try {
    let asked = 0;
    const offline = createAltitudeGraph(fakeHost(), { run: () => createEnergyRun({}), load: async () => { asked++; throw new Error('offline'); }, win: fakeWin() });
    assert.deepEqual(await offline.start(), { ok: false, reason: 'load' });
    await offline.start();
    assert.equal(asked, 2);
    assert.equal(offline.stats().active, false);
  } finally {
    console.warn = warn;
  }
});

test('dispose frees the chart and removes the stylesheet, and the graph cannot start again', async () => {
  const { FakeUPlot, calls } = standIn();
  const host = fakeHost();
  const graph = createAltitudeGraph(host, { run: () => createEnergyRun({}), load: async () => FakeUPlot, win: fakeWin() });
  await graph.start();
  graph.dispose();
  assert.equal(calls.destroyed, 1);
  assert.equal(host.head.children.length, 0);
  assert.deepEqual(await graph.start(), { ok: false, reason: 'closed' });
  graph.dispose(); // twice is fine
  assert.equal(calls.destroyed, 1);
});

test('uPlot is never imported statically anywhere in src (D137: it loads with import(), only inside the graph)', () => {
  const root = fileURLToPath(new URL('../../../src/', import.meta.url));
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.js$/.test(d.name) ? [join(dir, d.name)] : []));
  const offenders = files(root).filter((f) => /^\s*(import|export)\b[^(]*from\s*['"]uplot(\/[^'"]*)?['"]/m.test(readFileSync(f, 'utf8')) || /^\s*import\s*['"]uplot/m.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
  // And the one place that fetches it does so by import().
  assert.match(readFileSync(join(root, 'modules/turn-fight/energy-graph.js'), 'utf8'), /await import\('uplot'\)/);
});
