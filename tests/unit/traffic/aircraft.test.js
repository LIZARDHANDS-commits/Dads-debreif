// The right column (src/modules/traffic/aircraft.js): the spawner, the aircraft list and the
// conflicts. The spawner asks the engine for aircraft and says in plain words when it can't;
// the lists show the engine's state as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom-extras.js';
import { createSettings } from '../../../src/storage/settings.js';
import { createControls } from '../../../src/ui-kit/controls.js';
import { DEFAULTS } from '../../../src/modules/traffic/defaults.js';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { SPAWN_TYPES, createAircraftPanel, defaultSpawnRouteId, detailText, engineProblem, pairSpec, spawnRouteId, spawnSpec } from '../../../src/modules/traffic/aircraft.js';

installFakeDom();

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

const all = (root, test) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, test) : []))].filter(test);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const withClass = (root, name) => all(root, (n) => n.getAttribute?.('class')?.split(' ').includes(name));
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const buttonNamed = (root, name) => tagged(root, 'BUTTON').find((b) => words(b) === name);
const inputFor = (root, label) => {
  const l = tagged(root, 'LABEL').find((n) => words(n) === label);
  assert.ok(l, `a "${label}" label`);
  return all(root, (n) => n.getAttribute?.('id') === l.getAttribute('for'))[0];
};
const type = (input, text) => {
  input.value = text;
  input.dispatch('input');
  input.dispatch('change');
};

/** A stand-in for the module's scheduler: `after` queues the call, `tick()` runs what is queued. */
function fakeTimers() {
  const queued = [];
  return { after: (ms, cb) => (queued.push(cb), () => queued.splice(queued.indexOf(cb), 1)), tick: () => queued.splice(0).forEach((cb) => cb()) };
}

function setup(options = {}) {
  const kept = new Map();
  const memory = { get: (key, fallback) => (kept.has(key) ? kept.get(key) : fallback), set: (key, value) => kept.set(key, value) };
  const settings = createSettings(memory, DEFAULTS);
  const traffic = structuredClone(MOOSE_JAW);
  const sim = createSim(traffic);
  const changes = [];
  const controls = createControls(settings);
  const panel = createAircraftPanel({ controls, timers: options.timers ?? fakeTimers(), settings, sim, setup: traffic, onChange: () => changes.push(sim.state().aircraft.length), ...options });
  panel.update(sim.state());
  return { panel, controls, sim, settings, traffic, changes, spawner: panel.elements.spawner, list: panel.elements.aircraft, conflicts: panel.elements.conflicts };
}

test('the spawner starts on the first entry (the first pattern when there is none), as the Defaults table says', () => {
  const routes = MOOSE_JAW.routes;
  assert.equal(defaultSpawnRouteId(routes), 'ENT1');
  assert.equal(defaultSpawnRouteId(routes.filter((r) => r.kind !== 'entry')), 'PAT1');
  assert.equal(defaultSpawnRouteId([]), '');
  assert.equal(spawnRouteId('first-entry', routes), 'ENT1');
  assert.equal(spawnRouteId('SPL2', routes), 'SPL2');
  assert.equal(spawnRouteId('GONE', routes), 'ENT1', 'a route that has gone falls back to the default');
});

test('a fresh spawner asks for a CT-156 on Entry 1, at point 1, with no delay', () => {
  const asked = spawnSpec({ ...DEFAULTS }, MOOSE_JAW.routes);
  assert.deepEqual(asked, { spec: { type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 0 } });
  assert.deepEqual([...SPAWN_TYPES], ['CT-157', 'CT-156', 'CT-102', 'CT-114']);
});

test('a start point that is not a whole number from 1, past the route\'s last point, or a bad delay is refused in plain words', () => {
  const ask = (values) => spawnSpec({ ...DEFAULTS, ...values }, MOOSE_JAW.routes);
  assert.match(ask({ spawnStartPoint: 0 }).problem, /whole number from 1/);
  assert.match(ask({ spawnStartPoint: 2.5 }).problem, /whole number from 1/);
  assert.match(ask({ spawnStartPoint: 5 }).problem, /Entry 1 has 4 points: choose a start point from 1 to 4/);
  assert.match(ask({ spawnDelayS: -1 }).problem, /delay/);
  assert.match(ask({ spawnDelayS: 86401 }).problem, /from 0 to 86,400/);
  assert.match(ask({ spawnDelayS: Infinity }).problem, /delay/);
  assert.match(ask({ spawnDelayS: NaN }).problem, /delay/);
  assert.equal(ask({ spawnDelayS: 86400 }).spec.delaySec, 86400);
  assert.match(spawnSpec({ ...DEFAULTS }, []).problem, /no routes/);
  assert.equal(ask({ spawnStartPoint: 4 }).spec.startPoint, 4);
});

test('the second aircraft of a pair is the same, later by the gap; a gap that makes no sense is refused in words', () => {
  const spec = { type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 10 };
  assert.deepEqual(pairSpec(spec, { pairGapS: 15 }), { spec: { ...spec, delaySec: 25 } });
  assert.match(pairSpec(spec, { pairGapS: -1 }).problem, /gap between a pair/);
  assert.match(pairSpec(spec, { pairGapS: NaN }).problem, /gap between a pair/);
  assert.match(pairSpec(spec, { pairGapS: 86400 }).problem, /gap between a pair/); // 10 + 86,400 is past a day
});

test('engine problems are said in words, and an unknown one is not passed on', () => {
  assert.equal(engineProblem(new RangeError('callsign A1 is in use')), 'That aircraft could not be added: callsign A1 is in use.');
  assert.equal(engineProblem(new Error('boom')), 'That aircraft could not be added.');
});

test('every spawner box is labelled: Type, Route, Start at point and Delay', () => {
  const { spawner } = setup();
  for (const label of ['Type', 'Route', 'Start at point', 'Delay']) assert.ok(inputFor(spawner, label), label);
  assert.equal(inputFor(spawner, 'Type').value, '1', 'CT-156 is the second in the list');
  assert.equal(inputFor(spawner, 'Route').value, 'ENT1');
  assert.equal(inputFor(spawner, 'Start at point').value, '1');
  assert.equal(inputFor(spawner, 'Delay').value, '0');
});

test('+ Spawn adds the aircraft the boxes describe, names it, and tells the screen', () => {
  const { spawner, sim, changes } = setup();
  buttonNamed(spawner, '+ Spawn').dispatch('click');
  assert.equal(sim.state().aircraft.length, 8);
  const added = sim.state().aircraft.at(-1);
  assert.deepEqual([added.id, added.type, added.routeId], ['A8', 'CT-156', 'ENT1']);
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'Added A8.');
  assert.deepEqual(changes, [8]);
});

test('the boxes decide the aircraft: type, route, start point and delay', () => {
  const { spawner, sim, settings } = setup();
  settings.update({ spawnType: 'CT-114' });
  const route = inputFor(spawner, 'Route');
  route.value = 'SPL1';
  route.dispatch('change');
  type(inputFor(spawner, 'Start at point'), '3');
  type(inputFor(spawner, 'Delay'), '45');
  buttonNamed(spawner, '+ Spawn').dispatch('click');
  const added = sim.state().aircraft.at(-1);
  assert.deepEqual([added.type, added.routeId, added.startsAt], ['CT-114', 'SPL1', 45]);
  assert.equal(settings.get().spawnRoute, 'SPL1');
});

test('the spawner keeps its own route when a route is picked elsewhere, and follows a route that is added', () => {
  const { panel, spawner, traffic } = setup();
  const route = inputFor(spawner, 'Route');
  route.value = 'SPL2';
  route.dispatch('change');
  traffic.routes.push({ ...traffic.routes[1], id: 'ENT9', name: 'Entry 9' });
  panel.routesChanged();
  assert.equal(inputFor(spawner, 'Route').value, 'SPL2', 'its own choice stays');
  assert.equal(tagged(inputFor(spawner, 'Route'), 'OPTION').length, 10);
  assert.equal(words(tagged(inputFor(spawner, 'Route'), 'OPTION').at(-1)), 'Entry 9');
});

test('+ Pair adds two aircraft on the same route, 20 s apart', () => {
  const { spawner, sim } = setup();
  const route = inputFor(spawner, 'Route');
  route.value = 'PAT1';
  route.dispatch('change');
  type(inputFor(spawner, 'Delay'), '10');
  const pair = buttonNamed(spawner, '+ Pair, 20 s apart');
  assert.ok(pair);
  pair.dispatch('click');
  const [first, second] = sim.state().aircraft.slice(-2);
  assert.deepEqual([first.routeId, second.routeId], ['PAT1', 'PAT1']);
  assert.equal(second.startsAt - first.startsAt, 20);
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'Added A8 and A9.');
});

test('+ Pair with a gap that makes no sense adds neither aircraft', () => {
  const { spawner, sim, settings } = setup();
  settings.update({ pairGapS: -3 });
  assert.doesNotThrow(() => buttonNamed(spawner, '+ Pair, 20 s apart').dispatch('click'));
  assert.equal(sim.state().aircraft.length, 7);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /gap between a pair/);
});

test('a refused spawn adds nothing, says why, and never throws', () => {
  const { spawner, sim, settings, changes } = setup();
  type(inputFor(spawner, 'Start at point'), '9');
  assert.doesNotThrow(() => buttonNamed(spawner, '+ Spawn').dispatch('click'));
  assert.equal(sim.state().aircraft.length, 7);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /Entry 1 has 4 points/);
  // The engine's own check is passed on in words too.
  type(inputFor(spawner, 'Start at point'), '1');
  settings.update({ spawnType: 'Cessna' });
  assert.doesNotThrow(() => buttonNamed(spawner, '+ Spawn').dispatch('click'));
  assert.equal(sim.state().aircraft.length, 7);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /could not be added: unknown aircraft type Cessna/);
  assert.equal(changes.length, 1, 'the screen is told after the engine was asked, and not after a check that stopped short');
});

test('Clear finished drops the aircraft that have landed or are done, and says how many', () => {
  const { spawner, sim } = setup();
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), '');
  buttonNamed(spawner, 'Clear finished').dispatch('click');
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'No finished aircraft to clear.');
  // An entry with nothing to join ends "Done": a route of its own.
  sim.spawn({ routeId: 'ENT1', startPoint: 4 });
  sim.stepTo(60 * 20);
  const finished = sim.state().aircraft.filter((a) => a.status === 'landed' || a.status === 'done').length;
  assert.ok(finished > 0, 'twenty minutes in, some have landed');
  buttonNamed(spawner, 'Clear finished').dispatch('click');
  assert.equal(sim.state().aircraft.filter((a) => a.status === 'landed' || a.status === 'done').length, 0);
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), `Cleared ${finished} finished aircraft.`);
});

test('the aircraft list has a row for each aircraft: callsign, type, route, and Waiting with its start time', () => {
  const { list } = setup();
  const rows = withClass(list, 'aircraft-row');
  assert.equal(rows.length, 7);
  assert.equal(words(rows[0]), 'A1 CT-157 on Pattern 1 Waiting, starts at 0:12');
  assert.equal(words(withClass(list, 'aircraft-empty')[0]), 'No aircraft yet. Use + Spawn to add one.');
  assert.equal(withClass(list, 'aircraft-empty')[0].hidden, true);
});

test('a flying aircraft shows its height, speed and Flying, in whole numbers; landed and done say so', () => {
  const { panel, list, sim } = setup();
  sim.stepTo(60);
  panel.update(sim.state());
  const rows = withClass(list, 'aircraft-row');
  assert.match(words(rows[0]), /^A1 CT-157 on Pattern 1 [\d,]+ ft, \d+ kt, Flying/);
  const state = sim.state();
  assert.equal(detailText({ status: 'landed', statusText: 'Landed', altFt: 1880, kt: 0 }), '1,880 ft, Landed');
  assert.equal(detailText({ status: 'done', statusText: 'Done', altFt: 2500, kt: 100 }), '2,500 ft, Done');
  assert.ok(state.aircraft.length > 0);
});

test('every row carries the callsign as text, so colour is never the only way to tell them apart', () => {
  const { list } = setup();
  for (const row of withClass(list, 'aircraft-row')) assert.match(words(tagged(row, 'STRONG')[0]), /^A\d$/);
});

test('names go on the page as text, never as HTML', () => {
  const { panel, list, traffic, sim } = setup();
  traffic.routes[0].name = '<img src=x onerror=alert(1)>';
  panel.update(sim.state());
  assert.equal(tagged(list, 'IMG').length, 0);
  assert.match(words(withClass(list, 'aircraft-row')[0]), /<img src=x onerror=alert\(1\)>/);
});

test('with no conflicts the list says "No conflicts."; a pair inside the limits shows its line, with the word and the symbol', () => {
  const { panel, conflicts, traffic, sim } = setup();
  assert.equal(withClass(conflicts, 'conflict-none')[0].hidden, false);
  assert.equal(words(withClass(conflicts, 'conflict-none')[0]), 'No conflicts.');
  // Two aircraft on the same point at the same time.
  traffic.aircraft = [];
  const twins = createSim(traffic);
  twins.spawn({ routeId: 'PAT1', startPoint: 3, id: 'X1' });
  twins.spawn({ routeId: 'PAT1', startPoint: 3, id: 'X2' });
  panel.update(twins.state());
  const lines = withClass(conflicts, 'conflict-line');
  assert.equal(lines.length, 1);
  assert.match(words(lines[0]), /^⚠ CONFLICT X1\/X2: 0 ft lat, 0 ft vert$/);
  assert.equal(withClass(conflicts, 'conflict-none')[0].hidden, true);
  panel.update(sim.state());
  assert.equal(withClass(conflicts, 'conflict-line').length, 0);
});

test('while playing the lists are rewritten at most every 100 ms; paused, at once', () => {
  const { panel, list, sim } = setup();
  const shown = () => words(list);
  sim.stepTo(60);
  panel.update(sim.state(), { playing: true, now: 1000 });
  const first = shown();
  sim.stepTo(120);
  panel.update(sim.state(), { playing: true, now: 1050 });
  assert.equal(shown(), first, 'too soon: left as it was');
  panel.update(sim.state(), { playing: true, now: 1101 });
  assert.notEqual(shown(), first);
  const written = shown();
  sim.stepTo(180);
  panel.update(sim.state(), { playing: false, now: 1102 });
  assert.notEqual(shown(), written, 'paused: at once');
});

// TR-14: neither button acts while a box it reads is refused, and the spawner's line names the box.
test('+ Spawn and + Pair hold back while Start at point is refused, and the line names the box', () => {
  const timers = fakeTimers();
  const { spawner, sim, changes } = setup({ timers });
  const spawn = buttonNamed(spawner, '+ Spawn'), pair = buttonNamed(spawner, '+ Pair, 20 s apart');
  const before = sim.state().aircraft.length;
  assert.equal(spawn.getAttribute('aria-disabled'), null);
  type(inputFor(spawner, 'Start at point'), '0'); // out of range: refused, the setting keeps its last good value
  assert.equal(spawn.getAttribute('aria-disabled'), 'true');
  assert.equal(pair.getAttribute('aria-disabled'), 'true');
  spawn.dispatch('click');
  pair.dispatch('click');
  timers.tick();
  assert.equal(sim.state().aircraft.length, before, 'nothing was added');
  assert.deepEqual(changes, [], 'and the screen was not told');
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /Nothing was added: fix the Start at point box first\./);
  // Put it right: both act again.
  type(inputFor(spawner, 'Start at point'), '1');
  assert.equal(spawn.getAttribute('aria-disabled'), null);
  spawn.dispatch('click');
  pair.dispatch('click');
  assert.equal(sim.state().aircraft.length, before + 3);
});

test('a Delay typed but not yet "changed" is read at the click, so + Spawn still holds back', () => {
  const timers = fakeTimers();
  const { spawner, sim } = setup({ timers });
  const before = sim.state().aircraft.length;
  const delay = inputFor(spawner, 'Delay');
  delay.value = '99999'; // no change event: the guard reads the box at the click
  delay.dispatch('input');
  buttonNamed(spawner, '+ Spawn').dispatch('click');
  timers.tick();
  assert.equal(sim.state().aircraft.length, before);
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /fix the Delay box first/);
});

test('a refused Pair gap holds back + Pair only, and the line names it', () => {
  // No screen has a Pair gap box yet, so one is made on the same controls, as a settings box would be.
  const timers = fakeTimers();
  const { spawner, sim, controls } = setup({ timers });
  const gap = controls.number('pairGapS', { label: 'Pair gap', unit: 's', min: 0, max: 86_400, step: 1 });
  const before = sim.state().aircraft.length;
  type(inputFor(gap, 'Pair gap'), '-5');
  const spawn = buttonNamed(spawner, '+ Spawn'), pair = buttonNamed(spawner, '+ Pair, 20 s apart');
  assert.equal(pair.getAttribute('aria-disabled'), 'true');
  assert.equal(spawn.getAttribute('aria-disabled'), null, '+ Spawn does not read the gap');
  pair.dispatch('click');
  timers.tick();
  assert.equal(sim.state().aircraft.length, before);
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /fix the Pair gap box first/);
  spawn.dispatch('click');
  assert.equal(sim.state().aircraft.length, before + 1, '+ Spawn still works');
});

// PR-04: a saved profile holds 200 aircraft at most, so the spawner stops there, with the same limit in its words.
test('the 201st aircraft is refused at + Spawn and + Pair, with the limit in the sentence (PR-04)', () => {
  const { spawner, sim, changes } = setup();
  while (sim.state().aircraft.length < 199) sim.spawn({ type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 0 });
  const spawn = buttonNamed(spawner, '+ Spawn'), pair = buttonNamed(spawner, '+ Pair, 20 s apart');
  const say = () => words(withClass(spawner, 'spawn-message')[0]);
  pair.dispatch('click'); // 199 + 2 = 201
  assert.equal(sim.state().aircraft.length, 199, 'a pair that would pass the limit adds neither aircraft');
  assert.match(say(), /Nothing was added: that would make 201 aircraft \(the most is 200\)\. Clear finished aircraft or remove some first\./);
  spawn.dispatch('click'); // the 200th is allowed
  assert.equal(sim.state().aircraft.length, 200);
  assert.match(say(), /^Added /);
  const before = changes.length;
  spawn.dispatch('click');
  assert.equal(sim.state().aircraft.length, 200);
  assert.match(say(), /that would make 201 aircraft \(the most is 200\)/);
  assert.equal(changes.length, before, 'and the screen was not told of a change');
});
