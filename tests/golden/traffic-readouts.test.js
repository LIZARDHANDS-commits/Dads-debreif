// Golden test (R9, D10): src/modules/traffic/readouts.js against the text V6's own
// Traffic page writes. V6's `updatePanels` fills the Aircraft table, the Conflicts list,
// the Leg distances table and the clock; its `drawRoute` and `drawAircraft` write the
// leg distances, point data, turn data and aircraft labels on the map. They all run in
// Node (tests/golden/traffic-v6.js), next to readouts.js given the same numbers, and
// the words and digits must be the same.
//
// One thing is different on purpose: V6's clock reads MM:SS and wraps to 00:00 after
// an hour (#46), and the rebuild's reads H:MM:SS. Below an hour the two are the same
// with "0:" in front, and after an hour the minutes and seconds are still V6's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDice } from '../../src/modules/traffic/dice.js';
import { clockText, aircraftRows, conflictLines, noConflictsText, legDistanceRows, pointRows } from '../../src/modules/traffic/readouts.js';
import { loadV6Traffic, toV6Route } from './traffic-v6.js';
import { builtIn, startPair, flyBoth, gridEvents, v6SettingsFor, STEPS_PER_SEC } from './traffic-pair.js';

const MAP_TEXT_ON = { showDistances: true, showPoints: true, showTurnData: true, showAlt: true };

/** The rows of a table V6 wrote: the text of each row's cells (the header row has none). */
const rowsOf = (html) => [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td>(.*?)<\/td>/g)].map((cell) => cell[1])).filter((cells) => cells.length);

/** V6's conflict lines: the class each is drawn in, and its text. */
const linesOf = (html) => [...html.matchAll(/<div class="(\w+)">(.*?)<\/div>/g)].map((line) => ({ cls: line[1], text: line[2] }));

const v6Clock = (v6) => v6.elements.get('clock').textContent;

/** Puts V6's clock at `t` and has it write its panels. */
function v6ClockAt(v6, t) {
  v6.state.t = t;
  v6.updatePanels();
  return v6Clock(v6);
}

// ── The panels, second by second, on a busy run ──────────────────────────────

/** Everything the panels and map labels show, compared with V6's for this moment of a run. */
function comparePanels(pair, where, seen) {
  const { mine, v6 } = pair;
  const state = mine.state();
  const routes = mine.setup.routes;
  v6.updatePanels();

  assert.equal(clockText(state.t), '0:' + v6Clock(v6), `${where}: the clock`);

  const rows = aircraftRows(state, mine.setup);
  assert.deepEqual(rows.map((row) => row.cells), rowsOf(v6.elements.get('readout').innerHTML), `${where}: the aircraft table`);
  rows.forEach((row) => seen.statuses.add(row.statusText));

  const lines = conflictLines(state);
  const v6Conflicts = v6.elements.get('conflicts').innerHTML;
  if (lines.length === 0) assert.equal(v6Conflicts, `<span class="good">${noConflictsText}</span>`, `${where}: no conflicts`);
  else assert.deepEqual(lines.map((line) => ({ cls: line.level === 'conflict' ? 'bad' : 'warn', text: line.text })), linesOf(v6Conflicts), `${where}: the conflict lines`);
  seen.lines += lines.length;
  seen.levels = new Set([...seen.levels, ...lines.map((line) => line.level)]);

  const visible = routes.filter((route) => route.visible !== false);
  assert.deepEqual(
    visible.flatMap((route) => legDistanceRows(route).map((leg) => [route.name, leg.leg, leg.ftText, leg.nmText])),
    rowsOf(v6.elements.get('distances').innerHTML), `${where}: the leg distances`,
  );

  v6.state.aircraft.forEach((a, i) => {
    assert.deepEqual(v6.textDrawnBy(() => v6.drawAircraft(a, v6.acPos(a))), [rows[i].id, rows[i].labelText], `${where}: the map label of ${a.id}`);
  });
}

test('the aircraft table, conflict lines, leg distances, clock and map labels are V6\'s every second for half an hour of a spawned grid', () => {
  const setup = builtIn();
  // An entry that joins nothing, so some aircraft finish as Done (the built-in ones all land or join a pattern).
  setup.routes.push({ ...setup.routes.find((r) => r.id === 'ENT1'), id: 'ENT9', name: 'Entry 9', attachTo: '' });
  const pair = startPair(setup, { seed: 7 });
  Object.assign(pair.v6.settings, MAP_TEXT_ON);
  const events = gridEvents(setup);
  const seen = { statuses: new Set(), lines: 0, levels: new Set() };
  for (let second = 1; second <= 30 * 60; second++) {
    flyBoth(pair, STEPS_PER_SEC, events);
    comparePanels(pair, `t=${second}`, seen);
  }
  assert.deepEqual([...seen.statuses].sort(), ['Done', 'Flying', 'Landed', 'Waiting']);
  assert.ok(seen.lines > 100 && seen.levels.has('conflict') && seen.levels.has('caution'), `${seen.lines} conflict lines compared`);
});

// ── The clock ────────────────────────────────────────────────────────────────

test('the clock is V6\'s minutes and seconds at every time, with the hours in front (V6 wraps to 00:00 at an hour, #46)', () => {
  const v6 = loadV6Traffic({});
  const dice = createDice(5);
  const times = [0, 0.05, 0.999, 1, 12.000000000000005, 59.95, 59.999, 60, 137, 137.5, 599.95, 3599.95, 3599.999, 3600, 3600.05, 3661, 7325.5, 36000, 86399.99, 86400, 90061.4, 1e6];
  for (let i = 0; i < 4000; i++) times.push(dice() * 3 * 86400);
  for (const t of times) {
    const v6Text = v6ClockAt(v6, t);
    const text = clockText(t);
    assert.equal(text.slice(-5), v6Text, `t=${t}: the minutes and seconds`);
    const hours = Math.floor(Math.trunc(t * 1000) / 1000 / 3600);
    assert.equal(text, `${hours}:${v6Text}`, `t=${t}: the hours in front`);
    if (t < 3600) assert.equal(text, '0:' + v6Text, `t=${t}: below an hour it is V6's with 0: in front`);
  }
  assert.equal(v6ClockAt(v6, 3600.05), '00:00', 'V6 wraps at an hour');
  assert.equal(clockText(3600.05), '1:00:00', 'the rebuild does not');
});

test('the clock is V6\'s for an hour of clock time added up 0.05 s at a time, drift and all', () => {
  const v6 = loadV6Traffic({});
  let t = 0, drifted = 0;
  for (let step = 1; step < 3600 * STEPS_PER_SEC; step++) {
    t += 0.05;
    if (step % (STEPS_PER_SEC / 4) !== 0) continue; // a quarter of a second is often enough to catch the ticks either side of a second
    const v6Text = v6ClockAt(v6, t);
    assert.equal(clockText(t), '0:' + v6Text, `step ${step} (t=${t})`);
    if (Math.abs(t - Math.round(t)) < 1e-9 && t < Math.round(t)) drifted++;
  }
  assert.ok(drifted > 0, 'some whole seconds came out a hair short, so V6 shows the second before');
});

// ── The distances, point data and turn data on the map ───────────────────────

const LABELS = ['', 'Downwind', 'Final', undefined, 'Turn <1> & "2"'];
const G_VALUES = [0, 1, 1.05, 2, 2.05, 2.25, 3.5, 4.44, 9, 9.5, 12, ''];

/** Routes of every kind and length, with the odd numbers a hand-edited route can have. */
function generatedRoutes(seed, count) {
  const dice = createDice(seed);
  const pick = (list) => list[Math.floor(dice() * list.length)];
  const routes = [];
  for (let i = 0; i < count; i++) {
    const points = Array.from({ length: 2 + Math.floor(dice() * 9) }, () => ({
      label: pick(LABELS), x: Math.round((dice() - 0.5) * 60000 * 100) / 100, y: (dice() - 0.5) * 40000,
      alt: dice() < 0.4 ? Math.round(1500 + dice() * 3000) : 1500 + dice() * 3000,
      kt: dice() < 0.4 ? Math.round(80 + dice() * 150) : 80 + dice() * 150 + (dice() < 0.1 ? 0.5 : 0),
      g: pick(G_VALUES),
    }));
    routes.push({ id: 'R' + i, name: `Route ${i}`, kind: pick(['pattern', 'entry', 'split']), visible: true, color: '#fff', points });
  }
  return routes;
}

test('leg distances: every route, closed and open, is V6\'s distances table, hidden routes and routes under two points give no rows', () => {
  const setup = builtIn();
  const routes = [...setup.routes, ...generatedRoutes(11, 60)];
  routes.push({ id: 'HID', name: 'Hidden', kind: 'entry', visible: false, color: '#fff', points: routes[1].points });
  routes.push({ id: 'ONE', name: 'One point', kind: 'pattern', visible: true, color: '#fff', points: [routes[0].points[0]] });
  routes.push({ id: 'NONE', name: 'No points', kind: 'entry', visible: true, color: '#fff', points: [] });
  const v6 = loadV6Traffic({ settings: v6SettingsFor(setup), routes: routes.map(toV6Route) });
  v6.updatePanels();
  const visible = routes.filter((route) => route.visible !== false);
  const expected = visible.flatMap((route) => legDistanceRows(route).map((leg) => [route.name, leg.leg, leg.ftText, leg.nmText]));
  assert.deepEqual(expected, rowsOf(v6.elements.get('distances').innerHTML));
  assert.ok(expected.length > 300, `${expected.length} rows compared`);
  assert.deepEqual(legDistanceRows(routes.at(-1)), [], 'a route of no points');
  assert.deepEqual(legDistanceRows(routes.at(-2)), [], 'a route of one point');
});

test('map text: the leg labels, point labels, point data and turn data are what V6\'s drawRoute writes, with the turn radius from G or set by hand', () => {
  const setup = builtIn();
  const routes = [...setup.routes, ...generatedRoutes(23, 250)];
  let turnTexts = 0, texts = 0;
  for (const routeOptions of [setup.routeOptions, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 2600 }, { flyRoundedTurns: false, radiusFromG: false, manualRadiusFt: 0 }]) {
    const v6 = loadV6Traffic({ settings: { ...v6SettingsFor({ ...setup, routeOptions }), ...MAP_TEXT_ON } });
    for (const route of routes) {
      const expected = [
        ...legDistanceRows(route).map((leg) => leg.labelText),
        ...pointRows(route, routeOptions).flatMap((row) => [row.titleText, row.dataText, ...(row.turnText ? [row.turnText] : [])]),
      ];
      assert.deepEqual(expected, v6.textDrawnBy(() => v6.drawRoute(toV6Route(route))), `${route.name}, ${JSON.stringify(routeOptions)}`);
      turnTexts += pointRows(route, routeOptions).filter((row) => row.turnText).length;
      texts += expected.length;
    }
  }
  assert.ok(turnTexts > 1500 && texts > 6000, `${turnTexts} turn texts and ${texts} in all compared`);
});
