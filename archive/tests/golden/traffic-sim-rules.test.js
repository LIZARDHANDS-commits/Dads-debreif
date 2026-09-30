// Golden test (R9, D10): the corners of V6's flying rules, run side by side with sim.js
// as in traffic-sim.test.js but for shorter runs on purpose-built setups: odds of 0 and 1,
// two splits from one point, entries that join nothing, routes of no or one point, other
// route options and conflict limits, and Reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPattern, newEntry, newSplit } from '../../src/modules/traffic/route.js';
import { createDice } from '../../src/modules/traffic/dice.js';
import { loadV6Traffic, toV6Route, toV6Aircraft } from './traffic-v6.js';
import { builtIn, startPair, flyBoth, gridEvents, spawnBoth, v6SettingsFor, STEPS_PER_SEC } from './traffic-pair.js';

const minutes = (m) => m * 60 * STEPS_PER_SEC;

// ── The options and limits ───────────────────────────────────────────────────

test('without rounded turns, and with a manual radius, the flying is V6\'s too', () => {
  for (const options of [{ flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 }, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 4200 }]) {
    const setup = { ...builtIn(), routeOptions: options };
    const pair = startPair(setup, { seed: 11 });
    flyBoth(pair, minutes(6), gridEvents(setup));
  }
});

test('other conflict limits (wide, tight, and a red limit wider than the caution one) give V6\'s conflicts', () => {
  for (const conflictLimits of [{ latFt: 1500, vertFt: 500, cautionLatFt: 2500, cautionVertFt: 1000 }, { latFt: 50, vertFt: 50, cautionLatFt: 100, cautionVertFt: 100 }, { latFt: 900, vertFt: 900, cautionLatFt: 300, cautionVertFt: 300 }]) {
    const setup = { ...builtIn(), conflictLimits };
    const pair = startPair(setup, { seed: 3 });
    const seen = flyBoth(pair, minutes(6), gridEvents(setup));
    assert.ok(seen.conflict + seen.caution > 0, JSON.stringify(conflictLimits));
  }
});

test('with nobody landing, the grid keeps looping, splitting and joining, and the conflicts are V6\'s', () => {
  const setup = builtIn();
  for (const route of setup.routes) if (route.kind === 'pattern') route.landOdds = 0;
  const pair = startPair(setup, { seed: 99 });
  const seen = flyBoth(pair, minutes(12), gridEvents(setup, { firstStep: 1200 }));
  assert.ok(seen.conflict > 30 && seen.caution > 30, `${seen.conflict} conflict and ${seen.caution} caution seconds`);
  assert.ok(seen.routes.size >= 6);
});

// ── The odds ─────────────────────────────────────────────────────────────────

/** A small setup: one pattern with the given odds, two splits off it at the same point, entries that join it or nothing. */
function oddsSetup({ landOdds, splitOdds, second = 0.5 }) {
  const pattern = newPattern('PAT1', 'Pattern 1');
  pattern.landOdds = landOdds;
  const routes = [pattern];
  routes.push(newEntry('ENT1', 'Entry 1', 'PAT1', routes));
  routes.push(newSplit('SPL1', 'Split 1', 'PAT1', routes));
  routes[2].splitOdds = splitOdds;
  const twin = newSplit('SPL2', 'Split 2', 'PAT1', routes);
  twin.splitOdds = second; // leaves from the same point as Split 1 (V6 rolls each in turn: bug #47)
  routes.push(twin);
  const orphan = newEntry('ENT2', 'Entry 2', 'PAT1', routes);
  orphan.attachTo = ''; // an entry that joins nothing ends there
  routes.push(orphan);
  const toEntry = newEntry('ENT3', 'Entry 3', 'PAT1', routes);
  toEntry.attachTo = 'ENT1'; // an entry that joins something that is not a pattern also ends there
  routes.push(toEntry);
  const aircraft = ['PAT1', 'ENT1', 'SPL1', 'SPL2', 'ENT2', 'ENT3'].map((routeId, i) => ({ id: `A${i + 1}`, type: 'CT-156', routeId, startIndex: 0, startsAtSec: i * 10 }));
  return { ...builtIn(), routes, aircraft };
}

test('odds of 0 and 1 (never and always landing, never and always taking a split), and two splits from one point', () => {
  for (const [landOdds, splitOdds, second] of [[0, 0, 0], [1, 1, 1], [0, 1, 0], [0, 0, 1], [0.5, 1, 0.5], [0.2, 0.5, 0.5], [0, 1, 1]]) {
    const setup = oddsSetup({ landOdds, splitOdds, second });
    const pair = startPair(setup, { seed: 41 });
    flyBoth(pair, minutes(9), gridEvents(setup, { firstStep: 200 }));
  }
});

test('an entry or split that joins nothing, or something that is not a pattern, ends as Done and stays where it stopped', () => {
  const setup = oddsSetup({ landOdds: 0, splitOdds: 0 });
  const pair = startPair(setup, { seed: 41 });
  flyBoth(pair, minutes(20));
  const done = pair.mine.state().aircraft.filter((a) => a.status === 'done').map((a) => a.id);
  assert.ok(done.includes('A5') && done.includes('A6'), `done: ${done}`);
  const where = (list) => list.filter((a) => a.status === 'done').map((a) => [a.id, a.x, a.y, a.distFt]);
  const before = where(pair.mine.state().aircraft);
  flyBoth(pair, 100);
  assert.deepEqual(where(pair.mine.state().aircraft).slice(0, before.length), before);
});

test('an aircraft that lands is Landed and stays where it landed', () => {
  const setup = oddsSetup({ landOdds: 1, splitOdds: 0 });
  const pair = startPair(setup, { seed: 41 });
  flyBoth(pair, minutes(12));
  const landed = pair.mine.state().aircraft.filter((a) => a.status === 'landed');
  assert.ok(landed.length >= 1);
  const where = (a) => [a.id, a.x, a.y, a.alt, a.kt, a.distFt];
  flyBoth(pair, 100);
  const later = pair.mine.state().aircraft;
  for (const a of landed) assert.deepEqual(where(later.find((b) => b.id === a.id)), where(a), `${a.id} stays where it landed`);
});

test('every split always taken: the aircraft joins the pattern at V6\'s closest point, with V6\'s overshoot', () => {
  const setup = builtIn();
  setup.routes.forEach((r) => { if (r.kind === 'split') r.splitOdds = 1; if (r.kind === 'pattern') r.landOdds = 0; });
  const pair = startPair(setup, { seed: 2 });
  const seen = flyBoth(pair, minutes(10), gridEvents(setup, { firstStep: 100 }));
  assert.ok(['SPL1', 'SPL2', 'SPL3', 'SPL4'].every((id) => seen.routes.has(id)), [...seen.routes].join());
});

// ── Odd routes and aircraft ──────────────────────────────────────────────────

test('routes with no points, one point, or two, and start points off either end, do what V6 does', () => {
  const setup = builtIn();
  const add = (id, kind, points) => setup.routes.push({ id, name: id, kind, visible: true, color: '#fff', points, ...(kind === 'pattern' ? { landOdds: 0.2 } : { attachTo: 'PAT1', mergeIndex: 99 }) });
  const p = (x, y) => ({ label: '', x, y, alt: 2000, kt: 100, g: 2 });
  add('EMPTY', 'entry', []);
  add('ONE', 'split', [p(100, 100)]);
  add('TWO', 'entry', [p(0, 0), p(-6000, 4000)]);
  add('TWOLOOP', 'pattern', [p(0, 0), p(5000, 5000)]);
  setup.routes.at(-1).landOdds = 0;
  const pair = startPair(setup, { seed: 8 });
  const events = {};
  for (const [i, routeId] of ['EMPTY', 'ONE', 'TWO', 'TWOLOOP'].entries()) {
    events[10 + i] = (pr) => spawnBoth(pr, { type: 'CT-156', routeId, start: 0 });
    events[20 + i] = (pr) => spawnBoth(pr, { type: 'CT-114', routeId, start: 7, delay: 3 });
  }
  flyBoth(pair, minutes(12), events);
});

test('route points with no height, speed or G fly as V6 flies them: 120 kt and 2,500 ft on a route with legs, and the aircraft type\'s own speed on one with none', () => {
  const setup = builtIn();
  const bare = (x, y) => ({ label: '', x, y });
  const add = (id, kind, points, extra) => setup.routes.push({ id, name: id, kind, visible: true, color: '#fff', points, ...extra });
  add('BARE1', 'entry', [bare(0, 0)], { attachTo: '', mergeIndex: 0 });
  add('BARE2', 'entry', [bare(0, 0), bare(-9000, 3000), bare(-12000, 12000)], { attachTo: 'PAT1', mergeIndex: 2 });
  add('BARE3', 'pattern', [bare(0, 0), bare(5000, 0), bare(5000, 5000), bare(0, 5000)], { landOdds: 0 });
  const pair = startPair(setup, { seed: 8 });
  const events = {};
  let step = 5;
  for (const routeId of ['BARE1', 'BARE2', 'BARE3']) {
    for (const type of ['CT-157', 'CT-156', 'CT-102', 'CT-114']) events[step++] = (pr) => spawnBoth(pr, { type, routeId, start: 0 });
  }
  flyBoth(pair, minutes(5), events);
  const kts = new Set(pair.mine.state().aircraft.filter((a) => a.routeId === 'BARE1').map((a) => a.kt));
  assert.deepEqual([...kts].sort((a, b) => a - b), [125, 150, 180, 230], 'each type flew its own speed on the route with none');
});

test('an aircraft whose route is gone flies the first route, as V6 does', () => {
  const setup = builtIn();
  setup.aircraft.push({ id: 'A8', type: 'CT-102', routeId: 'GONE', startIndex: 3, startsAtSec: 5 });
  const pair = startPair(setup, { seed: 12 });
  flyBoth(pair, minutes(6));
});

// ── Reset, and V6 without its shortcuts ──────────────────────────────────────

test('Reset goes back to the start and, with the dice reseeded, flies the same run again; V6\'s Reset button leaves a landed aircraft marked landed', () => {
  const setup = oddsSetup({ landOdds: 1, splitOdds: 0 });
  const pair = startPair(setup, { seed: 41 });
  flyBoth(pair, minutes(10));
  const first = JSON.stringify(pair.mine.state());
  assert.ok(pair.mine.state().aircraft.some((a) => a.status === 'landed'));
  pair.mine.reset();
  pair.step = 0;
  assert.equal(pair.mine.t, 0);
  assert.ok(pair.mine.state().aircraft.every((a) => a.status !== 'landed' && a.status !== 'done'));
  // V6's Reset button: back to the start, but `landed` stays set (the rebuild's Reset clears it).
  pair.v6.state.playing = false;
  pair.v6.reset();
  assert.ok(pair.v6.state.aircraft.some((a) => a.landed && a.active), 'V6 keeps landed after Reset');
  pair.v6.state.aircraft.forEach((a) => { a.landed = false; });
  pair.dice.setState(41); // the seed again, in V6's copy of the dice
  pair.v6.state.playing = true;
  flyBoth(pair, minutes(10));
  assert.equal(JSON.stringify(pair.mine.state()), first, 'the same run again');
});

test('V6 with its shortcuts off (no route cache, and its tables redrawn every frame) flies the same five minutes', () => {
  const setup = builtIn();
  const load = (options) => {
    const dice = createDice(7);
    const v6 = loadV6Traffic({ settings: v6SettingsFor(setup), random: () => dice(), routes: setup.routes.map(toV6Route), aircraft: setup.aircraft.map(toV6Aircraft), ...options });
    v6.reset();
    v6.state.playing = true;
    v6.frame();
    return v6;
  };
  const plain = load({ cacheRoutes: false, panelsEachFrame: true });
  const quick = load({ cacheRoutes: true, panelsEachFrame: false });
  const state = (v6) => v6.state.aircraft.map((a) => [a.phaseRouteId, a.prog, a.active, a.landed]);
  for (let k = 1; k <= minutes(5); k++) {
    plain.frame();
    quick.frame();
    if (k % STEPS_PER_SEC === 0) assert.deepEqual(state(plain), state(quick), `t=${k / STEPS_PER_SEC}`);
  }
  assert.ok(plain.elements.get('readout').innerHTML.includes('<td>A1</td>'), 'the tables were drawn');
});
