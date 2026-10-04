// Checks: the right-hand panel: spawner spots, pairs, + Spawn PFL, plain-words refusals, the
//   200-aircraft limit, the aircraft rows with their command buttons, row selection, the conflict line and the
//   PFL badge.
// Serves: TR-R19, TR-R20, TR-R17, TR-R14, TR-R28.
// Expected values: screen wording and button states are design choices; Pair 20 s apart and the 200 limit are
//   TR-R19's own; PFL 125 kt glide is the T-6A glide chart (traffic spec 3.1), the 7,500 ft start height is
//   typed in, no source yet.

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
  assert.equal(defaultSpawnRouteId([{ id: 'S1', kind: 'split' }]), 'S1', 'falls back to first route when only splits exist');
  assert.equal(defaultSpawnRouteId([{ id: 'CUSTOM' }]), 'CUSTOM', 'handles missing kind cleanly');
  assert.equal(defaultSpawnRouteId([null, undefined, { id: 'PAT1', kind: 'pattern' }]), 'PAT1', 'handles null/undefined route entries cleanly');
  assert.equal(spawnRouteId('first-entry', routes), 'ENT1');
  assert.equal(spawnRouteId('ENT2', routes), 'ENT2');
  assert.equal(spawnRouteId('GONE', routes), 'ENT1', 'a route that has gone falls back to the default');
});

test('a fresh spawner asks for a CT-156 on the OHB Rejoin, at point 1, with no delay', () => {
  const asked = spawnSpec({ ...DEFAULTS }, MOOSE_JAW.routes);
  assert.deepEqual(asked, { spec: { type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 0 } });
  assert.deepEqual([...SPAWN_TYPES], ['CT-156'], 'the Harvard II only in the first version (TR-R16)');
});

test('a start point that is not a whole number from 1, past the route\'s last point, or a bad delay is refused in plain words', () => {
  const ask = (values) => spawnSpec({ ...DEFAULTS, ...values }, MOOSE_JAW.routes);
  assert.match(ask({ spawnStartPoint: 0 }).problem, /whole number from 1/);
  assert.match(ask({ spawnStartPoint: 2.5 }).problem, /whole number from 1/);
  assert.match(ask({ spawnStartPoint: 5 }).problem, /OHB Rejoin has 4 points: choose a start point from 1 to 4/);
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

// The spawner's spots (Patrick, 4 Oct): Type and Route, then a button for each spot of the route; one press adds an
// aircraft there. The delay and pairs are under Advanced settings; "PFL from area" is the Route list's last choice.
const spotButtons = (spawner) => withClass(spawner, 'spawn-spot');
const spot = (spawner, name) => spotButtons(spawner).find((b) => words(b) === name);
const chooseRoute = (spawner, id) => {
  const route = inputFor(spawner, 'Route');
  route.value = id;
  route.dispatch('change');
};
const pairBoxOf = (spawner) => all(spawner, (n) => n.getAttribute?.('id') === 'traffic-spawn-pair')[0];

test('the spawner shows Type and Route, a button for each spot of the route, and the delay and pair gap under Advanced settings', () => {
  const { spawner } = setup();
  for (const label of ['Type', 'Route', 'Delay', 'Pair gap']) assert.ok(inputFor(spawner, label), label);
  assert.equal(inputFor(spawner, 'Type').value, '0', 'CT-156 is the first in the list');
  assert.equal(inputFor(spawner, 'Route').value, 'ENT1');
  assert.equal(inputFor(spawner, 'Delay').value, '0');
  // The OHB Rejoin starts by whole miles back along the line (Patrick, 4 Oct), up to its 9.2 NM length; 9 at first.
  const miles = inputFor(spawner, 'Miles back on the rejoin line');
  assert.deepEqual(tagged(miles, 'OPTION').map(words), ['1 NM back', '2 NM back', '3 NM back', '4 NM back', '5 NM back', '6 NM back', '7 NM back', '8 NM back', '9 NM back']);
  assert.equal(miles.value, '9');
  assert.equal(words(withClass(spawner, 'spawn-spots-hint')[0]), 'Choose how far back, then + Spawn adds an aircraft there now.');
  assert.equal(words(all(withClass(spawner, 'spawner-advanced')[0], (n) => n.tagName === 'SUMMARY')[0]), 'Advanced settings');
  chooseRoute(spawner, 'ENT2');
  assert.deepEqual(spotButtons(spawner).map(words), ['Entry Start', 'Entry Mid', 'Entry Gate', 'Final', 'Glide path', 'Merge'], 'the SI Rejoin\'s spots, by name');
  assert.equal(spot(spawner, 'Entry Start').getAttribute('title'), 'Entry Start: 3,500 ft, 160 kt');
  assert.equal(words(withClass(spawner, 'spawn-spots-hint')[0]), 'Press a spot to add an aircraft there now.');
  assert.equal(buttonNamed(spawner, '+ Spawn'), undefined, 'a spot press replaces + Spawn');
});

test('the overhead break offers only Initial, In the break, Downwind and Perch (Patrick, 4 Oct), at spots the route already has', () => {
  const { spawner, sim, settings } = setup();
  chooseRoute(spawner, 'PAT1');
  assert.deepEqual(spotButtons(spawner).map(words), ['Initial', 'In the break', 'Downwind', 'Perch']);
  assert.deepEqual(spotButtons(spawner).map((b) => b.getAttribute('title')), ['Final Entry: 3,500 ft, 220 kt', 'Break: 3,500 ft, 220 kt', 'Break exit: 3,500 ft, 140 kt', 'Perch: 3,500 ft, 120 kt']);
  spot(spawner, 'Perch').dispatch('click');
  const added = sim.state().aircraft.at(-1);
  assert.equal(added.routeId, 'PAT1');
  assert.equal(settings.get().spawnStartPoint, 12, 'the Perch is the twelfth spot of the route');
  chooseRoute(spawner, 'ENT2');
  assert.equal(spotButtons(spawner).length, 6, 'the SI Rejoin keeps every spot');
});

test('on the OHB Rejoin, + Spawn adds an aircraft the chosen distance back, names it, and tells the screen', () => {
  const { spawner, sim, changes } = setup();
  const miles = inputFor(spawner, 'Miles back on the rejoin line');
  miles.value = '2';
  spot(spawner, '+ Spawn').dispatch('click');
  assert.equal(sim.state().aircraft.length, 8);
  const added = sim.state().aircraft.at(-1);
  assert.deepEqual([added.id, added.type, added.routeId], ['A8', 'CT-156', 'ENT1']);
  // 2 NM back from the Merge on the rejoin line (it is nearly straight), at the line's 3,500 ft and 220 kt.
  const merge = MOOSE_JAW.routes.find((r) => r.id === 'ENT1').points.at(-1);
  const nm = Math.hypot(added.x - merge.x, added.y - merge.y) / 6076.12;
  assert.ok(Math.abs(nm - 2) <= 0.1, `${nm.toFixed(2)} NM back`);
  assert.ok(Math.abs(added.alt - 3500) <= 100 && Math.abs((added.kt ?? added.iasKt) - 220) <= 10, `${added.alt} ft, ${added.kt} kt`);
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'Added A8.');
  assert.deepEqual(changes, [8]);
});

test('type, route, spot and the delay decide the aircraft', () => {
  const { spawner, sim, settings } = setup();
  settings.update({ spawnType: 'CT-114' });
  chooseRoute(spawner, 'ENT2');
  type(inputFor(spawner, 'Delay'), '45');
  assert.equal(words(withClass(spawner, 'spawn-spots-hint')[0]), 'Press a spot to add an aircraft there in 45 s.');
  spot(spawner, 'Entry Gate').dispatch('click');
  const added = sim.state().aircraft.at(-1);
  assert.deepEqual([added.type, added.routeId, added.startsAt], ['CT-114', 'ENT2', 45]);
  assert.equal(settings.get().spawnRoute, 'ENT2');
  assert.equal(settings.get().spawnStartPoint, 3);
});

test('the spawner keeps its own route when a route is picked elsewhere, and follows a route that is added', () => {
  const { panel, spawner, traffic } = setup();
  chooseRoute(spawner, 'ENT2');
  traffic.routes.push({ ...traffic.routes[1], id: 'ENT9', name: 'Entry 9' });
  panel.routesChanged();
  assert.equal(inputFor(spawner, 'Route').value, 'ENT2', 'its own choice stays');
  const options = tagged(inputFor(spawner, 'Route'), 'OPTION').map(words);
  assert.deepEqual(options.slice(-2), ['Entry 9', 'PFL from area'], 'the new route, then PFL from area last');
});

test('with Add a pair ticked, a spot adds two aircraft on the same route, the pair gap apart', () => {
  const { spawner, sim } = setup();
  chooseRoute(spawner, 'PAT1');
  type(inputFor(spawner, 'Delay'), '10');
  const pair = pairBoxOf(spawner);
  pair.checked = true;
  pair.dispatch('change');
  assert.equal(words(withClass(spawner, 'spawn-spots-hint')[0]), 'Press a spot to add a pair, 20 s apart, there in 10 s.');
  spot(spawner, 'Downwind').dispatch('click');
  const [first, second] = sim.state().aircraft.slice(-2);
  assert.deepEqual([first.routeId, second.routeId], ['PAT1', 'PAT1']);
  assert.equal(second.startsAt - first.startsAt, 20);
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'Added A8 and A9.');
});

test('a pair with a gap that makes no sense adds neither aircraft', () => {
  const { spawner, sim, settings } = setup();
  settings.update({ pairGapS: -3 });
  const pair = pairBoxOf(spawner);
  pair.checked = true;
  pair.dispatch('change');
  assert.doesNotThrow(() => spot(spawner, '+ Spawn').dispatch('click'));
  assert.equal(sim.state().aircraft.length, 7);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /gap between a pair/);
});

test('a refused spawn adds nothing, says why, and never throws', () => {
  const { spawner, sim, settings, changes } = setup();
  settings.update({ spawnType: 'Cessna' });
  assert.doesNotThrow(() => spot(spawner, '+ Spawn').dispatch('click'));
  assert.equal(sim.state().aircraft.length, 7);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /could not be added: unknown aircraft type Cessna/);
  assert.equal(changes.length, 1, 'the screen is told after the engine was asked');
});

test('PFL from area, chosen as the route, swaps the spots for its radial, distance and height boxes, and adds a gliding aircraft', () => {
  const { spawner, sim } = setup();
  chooseRoute(spawner, 'pfl-area');
  assert.equal(withClass(spawner, 'spawn-spots')[0].hidden, true, 'no spots');
  assert.equal(withClass(spawner, 'spawner-advanced')[0].hidden, true, 'the delay and pairs are for the spots');
  assert.equal(withClass(spawner, 'spawner-pfl')[0].hidden, false);
  for (const label of ['Radial (°T)', 'Distance (NM)', 'Altitude (ft MSL)']) assert.ok(inputFor(spawner, label), label);
  buttonNamed(spawner, '+ Spawn PFL').dispatch('click');
  assert.equal(sim.state().aircraft.length, 8);
  assert.match(words(withClass(spawner, 'spawn-message')[0]), /engine out, inbound to High Key/);
  chooseRoute(spawner, 'PAT1');
  assert.equal(withClass(spawner, 'spawn-spots')[0].hidden, false, 'a route brings the spots back');
  assert.equal(withClass(spawner, 'spawner-pfl')[0].hidden, true);
});

test('Clear finished drops the aircraft that have landed or are done, and says how many', () => {
  const { spawner, sim, traffic } = setup();
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), '');
  buttonNamed(spawner, 'Clear finished').dispatch('click');
  assert.equal(words(withClass(spawner, 'spawn-message')[0]), 'No finished aircraft to clear.');
  // An entry with nothing to join ends "Done": a route of its own.
  delete traffic.routes.find((r) => r.id === 'ENT1').attachTo;
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
  assert.match(words(rows[0]), /^A1 CT-156 on Overhead break.*Waiting, starts at 0:12$/);
  assert.equal(words(withClass(list, 'aircraft-empty')[0]), 'No aircraft yet. Press a spot under Spawn to add one.');
  assert.equal(withClass(list, 'aircraft-empty')[0].hidden, true);
});

test('a flying aircraft shows its height, speed, ground speed, crab and Flying, in whole numbers; landed and done say so (TR-R6)', () => {
  const { panel, list, sim } = setup();
  sim.stepTo(60);
  panel.update(sim.state());
  const rows = withClass(list, 'aircraft-row');
  assert.match(words(rows[0]), /^A1 CT-156 on Overhead break.*[\d,]+ ft, \d+ kt, GS \d+ kt, (no crab|crab \d+° [LR]), Flying/);
  assert.equal(detailText({ status: 'flying', statusText: 'Flying', altFt: 2500, kt: 140, gsKt: 128, crabDeg: -7 }), '2,500 ft, 140 kt, GS 128 kt, crab 7° L, Flying');
  const state = sim.state();
  assert.equal(detailText({ status: 'landed', statusText: 'Landed', altFt: 1880, kt: 0 }), '1,880 ft, Landed');
  assert.equal(detailText({ status: 'done', statusText: 'Done', altFt: 2500, kt: 100 }), '2,500 ft, Done');
  assert.ok(state.aircraft.length > 0);
});

test('Remove takes one aircraft out of the run, and only that one (TR-R19)', () => {
  const { list, sim, panel } = setup();
  const before = sim.state().aircraft.length;
  const row = withClass(list, 'aircraft-row')[0];
  buttonNamed(row, 'Remove').dispatch('click');
  panel.update(sim.state());
  assert.equal(sim.state().aircraft.length, before - 1);
  assert.ok(!sim.state().aircraft.some((a) => a.id === 'A1'));
});

test('Spawn a conflict waits for a selected aircraft (Patrick, 4 Oct 19:24Z)', () => {
  const { spawner, panel } = setup();
  const button = buttonNamed(spawner, 'Spawn a conflict');
  assert.equal(button.disabled, true);
  panel.selectAircraft('A1');
  assert.equal(button.disabled, false);
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

// TR-14: no spot acts while a box it reads is refused, and the spawner's line names the box.
test('the spots hold back while Delay is refused, and the line names the box', () => {
  const timers = fakeTimers();
  const { spawner, sim, changes } = setup({ timers });
  const first = spot(spawner, '+ Spawn');
  const before = sim.state().aircraft.length;
  assert.equal(first.getAttribute('aria-disabled'), null);
  type(inputFor(spawner, 'Delay'), '-1'); // out of range: refused, the setting keeps its last good value
  assert.equal(first.getAttribute('aria-disabled'), 'true');
  first.dispatch('click');
  timers.tick();
  assert.equal(sim.state().aircraft.length, before, 'nothing was added');
  assert.deepEqual(changes, [], 'and the screen was not told');
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /Nothing was added: fix the Delay box first\./);
  // Put it right: the spots act again.
  type(inputFor(spawner, 'Delay'), '0');
  assert.equal(first.getAttribute('aria-disabled'), null);
  first.dispatch('click');
  assert.equal(sim.state().aircraft.length, before + 1);
});

test('a Delay typed but not yet "changed" is read at the click, so a spot still holds back', () => {
  const timers = fakeTimers();
  const { spawner, sim } = setup({ timers });
  const before = sim.state().aircraft.length;
  const delay = inputFor(spawner, 'Delay');
  delay.value = '99999'; // no change event: the guard reads the box at the click
  delay.dispatch('input');
  spot(spawner, '+ Spawn').dispatch('click');
  timers.tick();
  assert.equal(sim.state().aircraft.length, before);
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /fix the Delay box first/);
});

test('a refused Pair gap holds back a pair only, and the line names it', () => {
  const { spawner, sim } = setup();
  const before = sim.state().aircraft.length;
  type(inputFor(spawner, 'Pair gap'), '-5');
  const pair = pairBoxOf(spawner);
  pair.checked = true;
  pair.dispatch('change');
  spot(spawner, '+ Spawn').dispatch('click');
  assert.equal(sim.state().aircraft.length, before);
  assert.match(withClass(spawner, 'spawn-message')[0].textContent, /fix the Pair gap box first/);
  pair.checked = false;
  pair.dispatch('change');
  spot(spawner, '+ Spawn').dispatch('click');
  assert.equal(sim.state().aircraft.length, before + 1, 'a single aircraft does not read the gap');
});

// PR-04: a saved profile holds 200 aircraft at most, so the spawner stops there, with the same limit in its words.
test('the 201st aircraft is refused at a spot, alone or as a pair, with the limit in the sentence (PR-04)', () => {
  const { spawner, sim, changes } = setup();
  while (sim.state().aircraft.length < 199) sim.spawn({ type: 'CT-156', routeId: 'ENT1', startPoint: 1, delaySec: 0 });
  const say = () => words(withClass(spawner, 'spawn-message')[0]);
  const pair = pairBoxOf(spawner);
  pair.checked = true;
  pair.dispatch('change');
  spot(spawner, '+ Spawn').dispatch('click'); // 199 + 2 = 201
  assert.equal(sim.state().aircraft.length, 199, 'a pair that would pass the limit adds neither aircraft');
  assert.match(say(), /Nothing was added: that would make 201 aircraft \(the most is 200\)\. Clear finished aircraft or remove some first\./);
  pair.checked = false;
  pair.dispatch('change');
  spot(spawner, '+ Spawn').dispatch('click'); // the 200th is allowed
  assert.equal(sim.state().aircraft.length, 200);
  assert.match(say(), /^Added /);
  const before = changes.length;
  spot(spawner, '+ Spawn').dispatch('click');
  assert.equal(sim.state().aircraft.length, 200);
  assert.match(say(), /that would make 201 aircraft \(the most is 200\)/);
  assert.equal(changes.length, before, 'and the screen was not told of a change');
});

test('flying aircraft rows show Breakout, High Key, PFL, and window-restricted Go-around buttons', () => {
  const { panel, list, sim } = setup();
  sim.stepTo(60);
  panel.update(sim.state());
  const rows = withClass(list, 'aircraft-row');
  const row0 = rows[0];
  const breakoutBtn = buttonNamed(row0, 'Breakout');
  const closedBtn = buttonNamed(row0, 'Closed Pattern');
  const highKeyBtn = buttonNamed(row0, 'High Key');
  const pflBtn = buttonNamed(row0, 'PFL');
  const goAroundBtn = buttonNamed(row0, 'Go-around');

  assert.ok(breakoutBtn, 'Breakout button is rendered on flying aircraft');
  assert.ok(closedBtn, 'Closed Pattern button is rendered on flying aircraft');
  assert.ok(highKeyBtn, 'High Key button is rendered on flying aircraft');
  assert.ok(pflBtn, 'PFL button is rendered on flying aircraft');
  assert.ok(goAroundBtn, 'Go-around button is rendered on flying aircraft');

  // Closed Pattern issues closed_pattern command
  closedBtn.dispatch('click');
  assert.equal(sim.state().aircraft[0].command, 'closed_pattern');

  // The card's menu (Patrick, 4 Oct 23:23Z): Landing behaviour shows its buttons, which set the aircraft's intent.
  const menuOf = (row) => tagged(row, 'SELECT').find((s) => s.getAttribute?.('class')?.includes('aircraft-menu-select'));
  assert.equal(menuOf(row0).value, 'manoeuvres', 'the card opens on Manoeuvres');
  menuOf(row0).value = 'landing';
  menuOf(row0).dispatch('change');
  const landingRow = withClass(list, 'aircraft-row')[0];
  buttonNamed(landingRow, 'Full Stop').dispatch('click');
  assert.equal(sim.state().aircraft[0].intent, 'full_stop');
  // Pattern shows OHB and SI, which set the pattern it flies each lap.
  menuOf(landingRow).value = 'pattern';
  menuOf(landingRow).dispatch('change');
  buttonNamed(withClass(list, 'aircraft-row')[0], 'SI').dispatch('click');
  assert.equal(sim.state().aircraft[0].pattern, 'si');
  menuOf(withClass(list, 'aircraft-row')[0]).value = 'manoeuvres';
  menuOf(withClass(list, 'aircraft-row')[0]).dispatch('change');

  // Go-around is disabled before the landing window (e.g. on climbout)
  assert.equal(goAroundBtn.disabled, true, 'Go-around is disabled outside the final approach window');
  goAroundBtn.dispatch('click');
  assert.equal(sim.state().aircraft[0].command, 'closed_pattern', 'Clicking disabled Go-around does not change command');

  // Breakout issues command from anywhere
  breakoutBtn.dispatch('click');
  assert.equal(sim.state().aircraft[0].command, 'breakout');

  // High Key issues climb_high_key command
  highKeyBtn.dispatch('click');
  assert.equal(sim.state().aircraft[0].command, 'climb_high_key');

  // PFL issues pfl_current command
  pflBtn.dispatch('click');
  assert.equal(sim.state().aircraft[0].command, 'pfl_current');

  // Aircraft on final approach window (point 13 = threshold / final) has Go-around enabled
  const id = sim.spawn({ id: 'AFINAL', routeId: 'PAT1', startPoint: 13, delaySec: 0 });
  panel.update(sim.state());
  const finalRow = withClass(list, 'aircraft-row').find((r) => r.dataset.aircraftId === id);
  assert.ok(finalRow, 'Final approach aircraft row is rendered');
  const finalGaBtn = buttonNamed(finalRow, 'Go-around');
  assert.equal(finalGaBtn.disabled, false, 'Go-around is enabled on final approach');
  finalGaBtn.dispatch('click');
  assert.equal(sim.state().aircraft.find((a) => a.id === id).command, 'go_around');
});

test('PFL From Area: three boxes with the defaults; + Spawn PFL adds an engine-out aircraft at the radial, distance and altitude, gliding at 125 kt toward the field', () => {
  const { spawner, sim, panel } = setup();
  const radial = inputFor(spawner, 'Radial (\u00b0T)'), dist = inputFor(spawner, 'Distance (NM)'), alt = inputFor(spawner, 'Altitude (ft MSL)');
  assert.deepEqual([radial.value, dist.value, alt.value], ['180', '5', '7500']);
  const before = sim.state().aircraft.length;
  buttonNamed(spawner, '+ Spawn PFL').dispatch('click');
  panel.update(sim.state());
  const added = sim.state().aircraft.at(-1);
  assert.equal(sim.state().aircraft.length, before + 1);
  assert.equal(added.engineFailed, true);
  assert.equal(added.command, 'pfl_current');
  assert.ok(Math.abs(added.alt - 7500) <= 100, `alt ${added.alt}`);
  assert.ok(Math.abs(added.kt - 125) <= 10, `kt ${added.kt}`);
  // 5 NM on the 180� radial is south of the anchor: y is about -30,380 ft from it.
  assert.ok(added.y < -25000, `south of the field, y ${added.y}`);
  assert.equal(added.headingDeg, 0, 'heading is the reciprocal of the radial, toward the field');
});

test('PFL From Area: the sim clamps the three inputs to their ranges (minimum and maximum envelope)', () => {
  const { sim } = setup();
  const low = sim.spawnPflFromArea({ radialDeg: 0, distNm: 0.1, altFt: 100 });
  const high = sim.spawnPflFromArea({ radialDeg: 360, distNm: 99, altFt: 99999 });
  const alts = Object.fromEntries(sim.state().aircraft.map((a) => [a.id, a.alt]));
  assert.ok(Math.abs(alts[low] - 3000) <= 100, `min alt ${alts[low]}`);
  assert.ok(Math.abs(alts[high] - 15000) <= 100, `max alt ${alts[high]}`);
});

test('aircraft row click triggers onSelectAircraft callback and applies is-selected class', () => {
  const selected = [];
  const { list } = setup({ onSelectAircraft: (id) => selected.push(id) });
  const rows = withClass(list, 'aircraft-row');
  assert.ok(rows.length >= 2, 'has aircraft rows');
  assert.equal(rows[0].classList.contains('is-selected'), false);

  // Clicking first row selects it
  rows[0].dispatch('click');
  assert.deepEqual(selected, [rows[0].dataset.aircraftId]);
  assert.equal(rows[0].classList.contains('is-selected'), true);
  assert.ok(rows[0].getAttribute('class').includes('is-selected'));

  // Clicking second row transfers selection
  rows[1].dispatch('click');
  assert.deepEqual(selected, [rows[0].dataset.aircraftId, rows[1].dataset.aircraftId]);
  assert.equal(rows[0].classList.contains('is-selected'), false);
  assert.equal(rows[1].classList.contains('is-selected'), true);
  assert.ok(!rows[0].getAttribute('class').includes('is-selected'));
  assert.ok(rows[1].getAttribute('class').includes('is-selected'));
});

test('clicking action buttons stops propagation and does not trigger onSelectAircraft', () => {
  const selected = [];
  const { panel, list, sim } = setup({ onSelectAircraft: (id) => selected.push(id) });
  sim.stepTo(60);
  panel.update(sim.state());

  const rows = withClass(list, 'aircraft-row');
  const flyingRow = rows[0];
  const breakoutBtn = buttonNamed(flyingRow, 'Breakout');
  assert.ok(breakoutBtn, 'has Breakout button');

  // Click the Breakout button
  breakoutBtn.dispatch('click');
  assert.equal(selected.length, 0, 'Breakout button click did not trigger onSelectAircraft');
  assert.equal(flyingRow.classList.contains('is-selected'), false);

  // Click PFL button
  const pflBtn = buttonNamed(flyingRow, 'PFL');
  assert.ok(pflBtn, 'has PFL button');
  pflBtn.dispatch('click');
  assert.equal(selected.length, 0, 'PFL button click did not trigger onSelectAircraft');

  // Clicking the row body directly does trigger selection
  flyingRow.dispatch('click');
  assert.deepEqual(selected, [flyingRow.dataset.aircraftId]);
  assert.equal(flyingRow.classList.contains('is-selected'), true);
});

test('panel.selectAircraft programmatically updates is-selected visual state', () => {
  const { panel, list } = setup();
  const rows = withClass(list, 'aircraft-row');
  const id0 = rows[0].dataset.aircraftId;
  const id1 = rows[1].dataset.aircraftId;

  panel.selectAircraft(id0);
  assert.equal(panel.selectedAircraft(), id0);
  assert.equal(rows[0].classList.contains('is-selected'), true);
  assert.equal(rows[1].classList.contains('is-selected'), false);

  panel.selectAircraft(id1);
  assert.equal(panel.selectedAircraft(), id1);
  assert.equal(rows[0].classList.contains('is-selected'), false);
  assert.equal(rows[1].classList.contains('is-selected'), true);

  panel.selectAircraft(null);
  assert.equal(panel.selectedAircraft(), null);
  assert.equal(rows[0].classList.contains('is-selected'), false);
  assert.equal(rows[1].classList.contains('is-selected'), false);
});

test('aircraft row displays tactical PFL status badge during PFL recovery phases', () => {
  const { panel, list, sim } = setup();
  sim.stepTo(60);
  const st = sim.state();
  // Simulate aircraft 0 in PFL recovery
  const target = st.aircraft[0];
  target.engineFailed = true;
  target.phase = 'pfl_high_key';
  panel.update(st);

  const rows = withClass(list, 'aircraft-row');
  const pflBadge = withClass(rows[0], 'pfl-badge')[0];
  assert.ok(pflBadge, 'has pfl-badge element');
  assert.equal(pflBadge.textContent, '[PFL: HIGH KEY]');

  // Test crash short badge styling
  target.phase = 'crash_short';
  panel.update(st);
  const updatedRows = withClass(list, 'aircraft-row');
  const crashBadge = withClass(updatedRows[0], 'pfl-badge')[0];
  assert.ok(crashBadge, 'has pfl-badge');
  assert.equal(crashBadge.textContent, '[CRASH SHORT]');
  assert.ok(crashBadge.getAttribute('class').includes('badge-crash'), 'has badge-crash class');
});


