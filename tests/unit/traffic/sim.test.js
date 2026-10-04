// Checks: small made-up routes and the built-in setup: 0.05 s steps, aircraft wait, fly 202.5 ft/s at 120 kt,
//   land or go round, take splits and joins by odds, conflicts at 200 ft and 500 ft, same seed same run, spawn
//   and remove, frame rate.
// Serves: TR-R1, TR-R12, TR-R15, TR-R17, TR-R19, TR-R21, TR-R22.
// Expected values: arithmetic worked out in comments (120 kt = 202.5 ft/s); lap times such as 118 s are the
//   code's own output; 41 of 47 cases read a hard-coded second; start times [12, 137 ...] are V6's data; "as V6
//   does" has no V6 number.

// What sim.js means, in plain terms: time moves in fixed steps, aircraft fly their routes
// at the set speed and height, pattern laps land or go round, splits are taken or not,
// entries join the pattern, conflicts are found, and the same seed gives the same run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC, TYPE_COLORS } from '../../../src/modules/traffic/sim.js';
import { createDice } from '../../../src/modules/traffic/dice.js';
import { routeLengthFt, closestDistFt, positionAt } from '../../../src/modules/traffic/route.js';
import { KT_TO_FTPS, ktToFtps } from '../../../src/core/units.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const builtIn = () => clone(MOOSE_JAW);

const point = (x, y, alt = 2500, kt = 120, g = 2) => ({ label: '', x, y, alt, kt, g });
const route = (id, kind, points, extra = {}) => ({ id, name: id, kind, visible: true, color: '#fff', points, ...extra });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/** A setup of your own routes and aircraft, with V6's options and limits. */
function setupOf(routes, aircraft = []) {
  const { routeOptions, conflictLimits, anchor } = MOOSE_JAW;
  return { version: 1, name: 'test', anchor, routes, aircraft, routeOptions, conflictLimits };
}
const plane = (id, routeId, startsAtSec = 0, startIndex = 0, type = 'CT-156', intent) => ({ id, type, routeId, startIndex, startsAtSec, ...(intent ? { intent } : {}) });

/** A 6,000 ft square pattern, 120 kt all round, at 2,000 ft. */
const SQUARE = [point(0, 0, 2000), point(6000, 0, 2000), point(6000, 6000, 2000), point(0, 6000, 2000)];
const square = (extra = {}) => route('SQ', 'pattern', SQUARE, { landOdds: 0, ...extra });
const straight = (kt = 120) => route('ST', 'entry', [point(0, 0, 2000, kt), point(60000, 0, 2000, kt)], { attachTo: '', mergeIndex: 0 });

const only = (state, id) => state.aircraft.find((a) => a.id === id);

// ── Time ─────────────────────────────────────────────────────────────────────

test('time moves in whole steps of 0.05 s and never past the time asked for', () => {
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST')]));
  assert.equal(STEP_SEC, 0.05);
  assert.equal(sim.t, 0);
  assert.equal(sim.stepTo(0.07), 1, 'one whole step fits in 0.07 s');
  near(sim.t, 0.05);
  assert.equal(sim.stepTo(0.09), 0, 'the rest of the frame is left for the next one');
  assert.equal(sim.stepTo(0.1), 1);
  near(sim.t, 0.1);
  assert.equal(sim.stepTo(1), 18);
  near(sim.t, 1);
});

test('a time that is a whole number of steps, however it is worked out, takes that many steps', () => {
  for (const [target, steps] of [[0.15, 3], [0.3, 6], [0.35, 7], [12, 240], [3 * 0.1, 6], [0.1 + 0.2, 6], [59.99999999999, 1200]]) {
    const sim = createSim(setupOf([straight()]));
    assert.equal(sim.stepTo(target), steps, String(target));
  }
});

test('the sim does not go back: asking for an earlier time does nothing, and a bad time is refused', () => {
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST')]));
  sim.stepTo(5);
  const state = JSON.stringify(sim.state());
  assert.equal(sim.stepTo(2), 0);
  assert.equal(JSON.stringify(sim.state()), state);
  for (const bad of [NaN, Infinity, '5', undefined]) assert.throws(() => sim.stepTo(bad), RangeError);
});

test('an hour of sim time is 72,000 steps and the clock says an hour', () => {
  const sim = createSim(setupOf([straight()]));
  assert.equal(sim.stepTo(3600), 72000);
  near(sim.t, 3600, 1e-6);
});

// ── Aircraft ─────────────────────────────────────────────────────────────────

test('the built-in setup opens with its seven aircraft waiting, each at the start of its route', () => {
  const sim = createSim(builtIn(), { seed: 1 });
  const { t, aircraft, conflicts } = sim.state();
  assert.equal(t, 0);
  assert.equal(aircraft.length, 7);
  assert.deepEqual(aircraft.map((a) => a.id), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']);
  assert.deepEqual(aircraft.map((a) => a.status), new Array(7).fill('waiting'));
  assert.deepEqual(aircraft.map((a) => a.startsAt), [12, 137, 177, 592, 856, 884, 902]);
  const a1 = aircraft[0];
  const threshold = MOOSE_JAW.routes[0].points[0];
  assert.deepEqual([a1.x, a1.y, a1.alt, a1.kt, a1.routeId, a1.color, a1.type], [threshold.x, threshold.y, 1880, 100, 'PAT1', TYPE_COLORS['CT-157'], 'CT-157']);
  assert.deepEqual(conflicts, []);
});

test('an aircraft waits until its start time and then flies', () => {
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST', 12)]));
  sim.stepTo(11.95);
  assert.equal(only(sim.state(), 'A1').status, 'waiting');
  assert.equal(only(sim.state(), 'A1').distFt, 0);
  sim.stepTo(20);
  const a = only(sim.state(), 'A1');
  assert.equal(a.status, 'flying');
  assert.ok(a.distFt > 0);
});

test('an aircraft moves along its route at the speed set there: 120 kt is 202.5 ft a second', () => {
  const sim = createSim(setupOf([straight(120)], [plane('A1', 'ST')]));
  sim.stepTo(10);
  const a = only(sim.state(), 'A1');
  near(a.x, 120 * KT_TO_FTPS * 10, 1e-6);
  assert.ok(Math.abs(only(sim.state(), 'A1').headingDeg - 90) <= 5, 'heading ~90°');
});

test('an aircraft that starts at a later point starts there, and a start point past the last is the last', () => {
  const sim = createSim(setupOf([square()]));
  sim.spawn({ routeId: 'SQ', startPoint: 3 });
  sim.spawn({ routeId: 'SQ', startPoint: 99 });
  const [a, b] = sim.state().aircraft;
  assert.equal(a.id, 'A1');
  assert.equal(b.id, 'A2');
  assert.ok(a.x > 5000 && a.y > 5000, `point 3 is at the far corner, not ${a.x}, ${a.y}`); // where its turn starts, just short of 6000, 6000
  assert.ok(b.x < 1000 && b.y > 5000, `point 4 is the last: ${b.x}, ${b.y}`);
  assert.deepEqual([a.leg, b.leg], [3, 3], 'at the very start of a turn V6 still reads the leg before it');
});

test('an aircraft that has landed or finished keeps the place it stopped at', () => {
  const pattern = square({ landOdds: 1 });
  const sim = createSim(setupOf([pattern], [plane('A1', 'SQ')]));
  sim.stepTo(600);
  const landed = only(sim.state(), 'A1');
  assert.equal(landed.status, 'landed');
  sim.stepTo(700);
  const later = only(sim.state(), 'A1');
  assert.deepEqual([later.x, later.y, later.distFt], [landed.x, landed.y, landed.distFt]);
});

// ── Patterns, landing, splits, joining ───────────────────────────────────────

test('a pattern is flown round and round; each time the first point is crossed it may land', () => {
  const sim = createSim(setupOf([square()], [plane('A1', 'SQ')]));
  const length = routeLengthFt(square());
  sim.stepTo(3 * length / (120 * KT_TO_FTPS) + 5);
  const a = only(sim.state(), 'A1');
  assert.equal(a.status, 'flying');
  assert.ok(a.distFt > 3 * length, 'three laps');
});

test('with intent full_stop the aircraft lands on first lap, and with touch_and_go continues flying', () => {
  const laps = 6 * routeLengthFt(square()) / (120 * KT_TO_FTPS);
  const lands = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]));
  lands.stepTo(laps);
  assert.equal(only(lands.state(), 'A1').status, 'landed');
  const stays = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'touch_and_go')]));
  stays.stepTo(laps);
  assert.equal(only(stays.state(), 'A1').status, 'flying');
});

test('training aircraft default to touch_and_go and stay flying; explicit full_stop aircraft land', () => {
  const routes = [square()];
  const aircraft = [
    ...Array.from({ length: 15 }, (_, i) => plane(`A${i + 1}`, 'SQ', 0, 0, 'CT-156', 'touch_and_go')),
    ...Array.from({ length: 5 }, (_, i) => plane(`A${i + 16}`, 'SQ', 0, 0, 'CT-156', 'full_stop')),
  ];
  const sim = createSim(setupOf(routes, aircraft));
  sim.stepTo(1.2 * routeLengthFt(routes[0]) / (120 * KT_TO_FTPS));
  const landed = sim.state().aircraft.filter((a) => a.status === 'landed').length;
  const flying = sim.state().aircraft.filter((a) => a.status === 'flying').length;
  assert.equal(landed, 5);
  assert.equal(flying, 15);
});

/** A pattern with one split off it at point 2 (index 1) that rejoins at point 4, with the given chance. */
function withSplit(splitOdds) {
  const pattern = square();
  const split = route('SP', 'split', [point(6000, 0, 2000), point(3000, -2000, 2000), point(0, 6000, 2000)], { sourceRoute: 'SQ', sourceIndex: 1, attachTo: 'SQ', mergeIndex: 3, splitOdds });
  return setupOf([pattern, split], [plane('A1', 'SQ')]);
}

test('a split is taken at the point it leaves from, when the dice say so, and not otherwise', () => {
  const takes = createSim(withSplit(1));
  takes.stepTo(20); // point 2 is 6,000 ft on; its turn starts 736 ft before it, 26 s in
  assert.equal(only(takes.state(), 'A1').routeId, 'SQ');
  takes.stepTo(30);
  assert.equal(only(takes.state(), 'A1').routeId, 'SP');
  const refuses = createSim(withSplit(0));
  refuses.stepTo(300);
  assert.equal(only(refuses.state(), 'A1').routeId, 'SQ');
});

test('a split is rolled once per lap: an aircraft that refuses it once is not offered it again on that lap', () => {
  const setup = withSplit(0.5);
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const sim = createSim(setup, { seed });
    sim.stepTo(60);
    seen.add(only(sim.state(), 'A1').routeId);
  }
  assert.deepEqual([...seen].sort(), ['SP', 'SQ'], 'some seeds take it and some do not');
});

test('at the end of a split the aircraft joins the pattern where it is closest to the linked point, and flies on', () => {
  const sim = createSim(withSplit(1));
  sim.stepTo(100); // the split is 12,000 ft long: it is joined about 90 s in, and the next lap offers it again at 140 s
  const a = only(sim.state(), 'A1');
  assert.equal(a.routeId, 'SQ');
  assert.equal(a.status, 'flying');
});

test('at the end of an entry the aircraft joins the pattern it is linked to at the linked point', () => {
  const entry = route('EN', 'entry', [point(-20000, 0, 2000), point(-9000, 0, 2000), point(0, 0, 2000)], { attachTo: 'SQ', mergeIndex: 0 });
  const sim = createSim(setupOf([square(), entry], [plane('A1', 'EN')]));
  sim.stepTo(100);
  const a = only(sim.state(), 'A1');
  assert.equal(a.routeId, 'SQ');
  assert.equal(a.status, 'flying');
});

test('an entry or split that joins nothing, or something that is not a pattern, ends there: Done', () => {
  const alone = route('EN', 'entry', [point(-20000, 0), point(-9000, 0)], { attachTo: '', mergeIndex: 0 });
  const toEntry = route('E2', 'entry', [point(-20000, 500), point(-9000, 500)], { attachTo: 'EN', mergeIndex: 0 });
  const sim = createSim(setupOf([square(), alone, toEntry], [plane('A1', 'EN'), plane('A2', 'E2')]));
  sim.stepTo(200);
  const state = sim.state();
  assert.equal(only(state, 'A1').status, 'done');
  assert.equal(only(state, 'A2').status, 'done');
  assert.ok(Math.abs(only(state, 'A1').x - (-9000)) <= 50, 'near endpoint');
});

// ── The odds when a route does not say, and the crossing rule at its edges ───

test('splits are taken by odds while landing decisions are deterministic via aircraft intent', () => {
  let takenAbove = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const roll = createDice(seed)(); // the first choice split makes
    // Default intent is touch_and_go: stays flying
    const stays = createSim(setupOf([square()], [plane('A1', 'SQ')]), { seed });
    stays.stepTo(130);
    assert.equal(only(stays.state(), 'A1').status, 'flying', `seed ${seed}: default touch_and_go stays flying`);

    // Explicit full_stop intent lands
    const lands = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]), { seed });
    lands.stepTo(130);
    assert.equal(only(lands.state(), 'A1').status, 'landed', `seed ${seed}: explicit full_stop lands`);

    const splits = createSim(withSplit(undefined), { seed });
    splits.stepTo(30);
    assert.equal(only(splits.state(), 'A1').routeId === 'SP', roll < 0.5, `seed ${seed}: split, roll ${roll}`);
    if (roll >= 0.5 && roll < 0.6) takenAbove++;
  }
  assert.ok(takenAbove > 5, 'the seeds tried include rolls just above each default');
});

test('an aircraft that lands is not then offered a split at the same point', () => {
  const pattern = square({ landOdds: 1 });
  const split = route('SP', 'split', [point(0, -3000, 2000), point(0, -6000, 2000)], { sourceRoute: 'SQ', sourceIndex: 0, attachTo: 'SQ', mergeIndex: 0, splitOdds: 1 });
  const sim = createSim(setupOf([pattern, split], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]), { seed: 5 });
  sim.stepTo(125); // the first lap ends at 118 s, where the split leaves too
  const a = only(sim.state(), 'A1');
  assert.equal(a.status, 'landed');
  assert.equal(a.routeId, 'SQ');
});

/** One step at 120 kt, in feet, exactly as the sim works it out. */
const STEP_FT = ktToFtps(120) * STEP_SEC;

/** A speed that flies exactly 8 ft a step, so the distances below are whole numbers and a step can end exactly on a point. */
const KT_8_FT_A_STEP = 8 / (KT_TO_FTPS * STEP_SEC);

/** A point of a route flown at 8 ft a step. */
const point8 = (x, y) => point(x, y, 2000, KT_8_FT_A_STEP);

/** A pattern flown in straight lines, never landing, with a split from `sourceIndex` that is always taken. */
function exactSetup(points, sourceIndex, startIndex = 0) {
  const pattern = route('P', 'pattern', points, { landOdds: 0 });
  const split = route('SP', 'split', [point8(0, -3000), point8(0, -6000)], { sourceRoute: 'P', sourceIndex, attachTo: 'P', mergeIndex: 0, splitOdds: 1 });
  return { ...setupOf([pattern, split], [plane('A1', 'P', 0, startIndex)]), routeOptions: { flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 } };
}
const routeIdAfter = (setup, sec) => { const sim = createSim(setup, { seed: 1 }); sim.stepTo(sec); return { id: only(sim.state(), 'A1').routeId, dice: sim.diceState() }; };
const BOX = [point8(0, 0), point8(6000, 0), point8(6000, 6000), point8(0, 6000)]; // 24,000 ft round

test('moving a split to another point while it runs offers it there on the same lap, as V6 does', () => {
  const setup = withSplit(0);
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(30); // point 2 passed, and the split refused
  setup.routes[1].sourceIndex = 2;
  setup.routes[1].splitOdds = 1;
  sim.stepTo(70); // point 3 is passed at 55 s
  assert.equal(only(sim.state(), 'A1').routeId, 'SP');
});

test('a split that leaves from a point past the last leaves from the last, and from one before the first leaves from the first', () => {
  const leavingFrom = (sourceIndex, sec) => {
    const setup = withSplit(1);
    setup.routes[1].sourceIndex = sourceIndex;
    return routeIdAfter(setup, sec).id;
  };
  assert.equal(leavingFrom(3, 100), 'SP', 'the last point is passed at 85 s');
  assert.equal(leavingFrom(99, 100), 'SP', 'point 100 does not exist, so it is the last');
  assert.equal(leavingFrom(-2, 100), 'SQ', 'the first point is next passed when the lap ends, at 118 s');
  assert.equal(leavingFrom(-2, 125), 'SP');
});

test('a pattern of no length is never landed on or split from', () => {
  const dot = route('DOT', 'pattern', [point(100, 100, 2000)], { landOdds: 1 });
  const split = route('SP', 'split', [point(0, 0), point(0, -3000)], { sourceRoute: 'DOT', sourceIndex: 0, attachTo: 'DOT', mergeIndex: 0, splitOdds: 1 });
  const sim = createSim(setupOf([dot, split], [plane('A1', 'DOT')]), { seed: 4 });
  sim.stepTo(30);
  const a = only(sim.state(), 'A1');
  assert.equal(a.status, 'flying');
  assert.equal(a.routeId, 'DOT');
  assert.equal(sim.diceState(), createDice(4).getState(), 'no choice was made');
});

test('a point with no speed reads 120 kt and one with no height 2,500 ft; the type\'s own speed is used only on a route with no legs', () => {
  const types = ['CT-157', 'CT-156', 'CT-102', 'CT-114'];
  const flownOn = (points) => {
    const sim = createSim(setupOf([route('BARE', 'entry', points, { attachTo: '', mergeIndex: 0 })], types.map((type, i) => plane('A' + (i + 1), 'BARE', 0, 0, type))));
    sim.stepTo(1);
    return sim.state().aircraft;
  };
  const withLegs = flownOn([{ label: '', x: 0, y: 0 }, { label: '', x: 9000, y: 0 }]);
  assert.deepEqual(withLegs.map((a) => a.kt), [120, 120, 120, 120]);
  assert.deepEqual(withLegs.map((a) => a.alt), [2500, 2500, 2500, 2500]);
  const noLegs = flownOn([{ label: '', x: 0, y: 0 }]);
  assert.deepEqual(noLegs.map((a) => a.kt), [125, 180, 150, 230]);
  assert.deepEqual(noLegs.map((a) => a.alt), [2500, 2500, 2500, 2500]);
});

test('on a route with no legs, a point that loses its height while flown shows the height the aircraft\'s start point had when it was made, as V6 does', () => {
  const dot = route('DOT', 'entry', [{ label: '', x: 0, y: 0, alt: 3000, kt: 100 }], { attachTo: '', mergeIndex: 0 });
  const sim = createSim(setupOf([dot], [plane('A1', 'DOT')]));
  sim.stepTo(1);
  assert.equal(only(sim.state(), 'A1').alt, 3000);
  delete dot.points[0].alt; // edited while it runs
  assert.equal(only(sim.state(), 'A1').alt, 3000, 'V6 falls back on what the aircraft noted');
  const bare = route('BARE', 'entry', [{ label: '', x: 0, y: 0 }], { attachTo: '', mergeIndex: 0 });
  assert.equal(only(createSim(setupOf([bare], [plane('A1', 'BARE')])).state(), 'A1').alt, 2500, 'and 2,500 ft when its start point had none');
});

test('the built-in setup: A1 leaves the threshold at 12 s and speeds up and climbs, and the later ones wait their turn', () => {
  const sim = createSim(builtIn(), { seed: 1 });
  sim.stepTo(60);
  const a1 = only(sim.state(), 'A1');
  assert.equal(a1.status, 'flying');
  assert.ok(a1.kt > 100 && a1.alt > 1880, `${a1.kt} kt, ${a1.alt} ft`);
  sim.stepTo(300);
  assert.deepEqual(sim.state().aircraft.map((a) => a.status !== 'waiting'), [true, true, true, false, false, false, false]);
});

// ── Conflicts ────────────────────────────────────────────────────────────────

/** Two aircraft on the same straight route, `gapSec` apart, at their own heights. */
function pairOn(gapSec, altA = 2000, altB = 2000) {
  const a = route('AA', 'entry', [point(0, 0, altA, 120), point(60000, 0, altA, 120)], { attachTo: '', mergeIndex: 0 });
  const b = route('BB', 'entry', [point(0, 0, altB, 120), point(60000, 0, altB, 120)], { attachTo: '', mergeIndex: 0 });
  return createSim(setupOf([a, b], [plane('A1', 'AA', 0), plane('A2', 'BB', gapSec)]));
}

test('two aircraft inside the red limits are in conflict, inside the caution limits only in caution, and further apart neither', () => {
  const at = (gapSec) => { const sim = pairOn(gapSec); sim.stepTo(30); return sim.state().conflicts; };
  // 120 kt is 202.5 ft a second.
  const red = at(0.5); // about 100 ft apart
  assert.equal(red.length, 1);
  assert.deepEqual([red[0].a, red[0].b, red[0].level], ['A1', 'A2', 'conflict']);
  near(red[0].latFt, 0.5 * 120 * KT_TO_FTPS, 10);
  assert.equal(red[0].vertFt, 0);
  const yellow = at(2); // about 405 ft apart
  assert.equal(yellow.length, 1);
  assert.equal(yellow[0].level, 'caution');
  assert.deepEqual(at(3), []); // 608 ft
});

test('height apart counts too: 200 ft or more is not a conflict, 500 ft or more not even a caution', () => {
  const at = (altB) => { const sim = pairOn(0.5, 2000, altB); sim.stepTo(30); return sim.state().conflicts.map((c) => c.level); };
  assert.deepEqual(at(2100), ['conflict']);
  assert.deepEqual(at(2300), ['caution']);
  assert.deepEqual(at(2600), []);
});

test('the limits are strict: exactly 200 ft apart in height is not a conflict and exactly 500 ft not a caution, and the same for the distance apart', () => {
  const at = (altB) => { const sim = pairOn(0.5, 2000, altB); sim.stepTo(30); return sim.state().conflicts.map((c) => c.level); };
  assert.deepEqual(at(2200), ['caution']);
  assert.deepEqual(at(2500), []);
  const sim = pairOn(0.5);
  sim.stepTo(30);
  const lat = sim.state().conflicts[0].latFt;
  sim.setup.conflictLimits = { latFt: lat, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 };
  assert.equal(sim.state().conflicts[0].level, 'caution', 'exactly at the red distance');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 200, cautionLatFt: lat, cautionVertFt: 500 };
  assert.deepEqual(sim.state().conflicts, [], 'exactly at the caution distance');
});

test('the limits are the setup\'s, and can change while it runs', () => {
  const sim = pairOn(0.5);
  sim.stepTo(30);
  assert.equal(sim.state().conflicts[0].level, 'conflict');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 50, cautionLatFt: 500, cautionVertFt: 500 };
  assert.equal(sim.state().conflicts[0].level, 'caution');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 50, cautionLatFt: 50, cautionVertFt: 50 };
  assert.deepEqual(sim.state().conflicts, []);
});

test('aircraft that are waiting, landed or done are never in conflict', () => {
  const sim = pairOn(0.5);
  sim.stepTo(0.4); // A1 flying, A2 still waiting at the same spot
  assert.equal(only(sim.state(), 'A2').status, 'waiting');
  assert.deepEqual(sim.state().conflicts, []);
  const landing = createSim(setupOf([square({ landOdds: 1 })], [plane('A1', 'SQ'), plane('A2', 'SQ', 0.5)]));
  landing.stepTo(400);
  assert.deepEqual(landing.state().aircraft.map((a) => a.status), ['landed', 'landed']);
  assert.deepEqual(landing.state().conflicts, []);
});

// ── The dice ─────────────────────────────────────────────────────────────────

/** Where 16 aircraft are after 15 minutes on the built-in setup, from one seed. */
function busyRun(seed) {
  const sim = createSim(builtIn(), { seed });
  for (const route of MOOSE_JAW.routes) sim.spawn({ routeId: route.id, startPoint: 1, delaySec: 5 });
  sim.stepTo(900);
  return JSON.stringify(sim.state());
}

test('the same seed gives the same run and another seed gives another', () => {
  assert.equal(busyRun(1), busyRun(1));
  assert.notEqual(busyRun(1), busyRun(2));
});

test('two sims from one setup do not disturb each other, and the sim never changes the setup', () => {
  const setup = builtIn();
  const before = JSON.stringify(setup);
  const a = createSim(setup, { seed: 5 }), b = createSim(setup, { seed: 5 });
  a.stepTo(900);
  b.stepTo(300);
  b.stepTo(900);
  assert.equal(JSON.stringify(a.state()), JSON.stringify(b.state()));
  assert.equal(JSON.stringify(setup), before);
});

test('Reset goes back to 0 s with every aircraft at its start, spawned ones too, and flies the same run again', () => {
  const sim = createSim(builtIn(), { seed: 9 });
  sim.stepTo(500);
  const spawned = sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 10 });
  sim.stepTo(1500);
  const first = JSON.stringify(sim.state());
  sim.reset();
  assert.equal(sim.t, 0);
  const start = sim.state();
  assert.equal(start.aircraft.length, 8);
  assert.deepEqual(start.aircraft.map((a) => a.status), new Array(8).fill('waiting'));
  near(only(start, spawned).startsAt, 510, 1e-9); // a spawned aircraft keeps its start time
  sim.stepTo(500);
  assert.equal(sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 10 }), 'A9');
  sim.remove('A9');
  sim.stepTo(1500);
  assert.equal(JSON.stringify(sim.state()), first);
});

// ── Spawning and removing ────────────────────────────────────────────────────

test('Reset also forgets that an aircraft landed: after it, an aircraft that finishes is Done, not Landed (V6\'s Reset button leaves it Landed)', () => {
  const entry = route('EN', 'entry', [point(-20000, 0, 2000), point(-9000, 0, 2000), point(0, 0, 2000)], { attachTo: 'SQ', mergeIndex: 0 });
  const setup = setupOf([square(), entry], [plane('A1', 'EN', 0, 0, 'CT-156', 'full_stop')]);
  const sim = createSim(setup);
  sim.stepTo(300); // joins the pattern at 99 s and lands at the end of its first lap
  assert.equal(only(sim.state(), 'A1').status, 'landed');
  entry.attachTo = ''; // now the entry joins nothing
  sim.reset();
  sim.stepTo(200);
  assert.equal(only(sim.state(), 'A1').status, 'done');
});

test('spawn: the next free callsign, the type\'s colour, a start point counted from 1, and a delay from now', () => {
  const sim = createSim(builtIn());
  sim.stepTo(10);
  const id = sim.spawn({ type: 'CT-102', routeId: 'ENT2', startPoint: 3, delaySec: 5 });
  assert.equal(id, 'A8');
  const a = only(sim.state(), 'A8');
  assert.deepEqual([a.type, a.color, a.routeId, a.status], ['CT-102', TYPE_COLORS['CT-102'], 'ENT2', 'waiting']);
  near(a.startsAt, 15, 1e-9);
  const entryGate = MOOSE_JAW.routes.find((r) => r.id === 'ENT2').points[2];
  assert.ok(Math.hypot(a.x - entryGate.x, a.y - entryGate.y) < 3000, 'starts near point 3 (where the turn there begins)');
  assert.equal(sim.spawn(), 'A9', 'with nothing said: CT-156, the first route, point 1, now');
  const b = only(sim.state(), 'A9');
  assert.deepEqual([b.type, b.routeId], ['CT-156', 'PAT1']);
  near(b.startsAt, 10, 1e-9);
});

test('spawn takes the first callsign not in use, as V6 does, and a callsign can be chosen', () => {
  const sim = createSim(builtIn());
  sim.remove('A3');
  assert.equal(sim.spawn(), 'A3');
  assert.equal(sim.spawn({ id: 'LEAD' }), 'LEAD');
  assert.throws(() => sim.spawn({ id: 'LEAD' }), RangeError);
});

test('spawn refuses what makes no sense: an unknown type or route, a start point under 1, a delay that is not a number', () => {
  const sim = createSim(builtIn());
  assert.throws(() => sim.spawn({ type: 'B-52' }), /unknown aircraft type/);
  assert.throws(() => sim.spawn({ routeId: 'NOPE' }), /unknown route/);
  for (const startPoint of [0, -1, 1.5, NaN, '2']) assert.throws(() => sim.spawn({ startPoint }), RangeError, String(startPoint));
  assert.throws(() => sim.spawn({ delaySec: NaN }), RangeError);
  assert.equal(sim.state().aircraft.length, 7, 'nothing was added');
  assert.throws(() => createSim(setupOf([])).spawn(), /at least one route/);
});

test('remove takes one aircraft out; clearFinished takes out those that have landed or are done', () => {
  const setup = setupOf([square({ landOdds: 1 }), straight()], [plane('A1', 'SQ'), plane('A2', 'ST'), plane('A3', 'ST', 2000)]);
  const sim = createSim(setup);
  sim.stepTo(150); // A1 lands on its first lap at 113 s; A2's 60,000 ft take 296 s; A3 starts at 2,000 s
  assert.deepEqual(sim.state().aircraft.map((a) => a.status), ['landed', 'flying', 'waiting']);
  sim.clearFinished();
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), ['A2', 'A3']);
  assert.equal(sim.remove('A2'), true);
  assert.equal(sim.remove('A2'), false);
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), ['A3']);
});

test('aircraftSpecs gives the aircraft as a setup keeps them, so a new sim from them starts the same', () => {
  const sim = createSim(builtIn(), { seed: 4 });
  sim.stepTo(60);
  sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 30 });
  const specs = sim.aircraftSpecs();
  assert.equal(specs.length, 8);
  const { startsAtSec, ...last } = specs.at(-1);
  assert.deepEqual(last, { id: 'A8', type: 'CT-114', routeId: 'ENT1', startIndex: 1 });
  near(startsAtSec, 90, 1e-9);
  const again = createSim({ ...builtIn(), aircraft: specs }, { seed: 4 });
  sim.reset();
  assert.equal(JSON.stringify(again.state()), JSON.stringify(sim.state()));
});

test('an aircraft whose route is not there flies the first route, as V6 does', () => {
  const setup = setupOf([square()], [plane('A1', 'GONE')]);
  const sim = createSim(setup);
  assert.equal(only(sim.state(), 'A1').routeId, 'SQ');
});

test('the specs of an aircraft that has moved to another route are still where it started', () => {
  const sim = createSim(withSplit(1));
  sim.stepTo(30);
  assert.equal(only(sim.state(), 'A1').routeId, 'SP');
  assert.deepEqual(sim.aircraftSpecs(), [{ id: 'A1', type: 'CT-156', routeId: 'SQ', startIndex: 0, startsAtSec: 0 }]);
});

test('a setup with aircraft but no route is refused with a message, at the start and when the last route goes', () => {
  const message = 'the setup needs at least one route';
  assert.throws(() => createSim(setupOf([], [plane('A1', 'SQ')])), { name: 'RangeError', message });
  assert.doesNotThrow(() => createSim(setupOf([], [])), 'no aircraft, no need of a route');
  const setup = setupOf([square()], [plane('A1', 'SQ')]);
  const sim = createSim(setup);
  setup.routes.length = 0; // the last route is deleted
  assert.throws(() => sim.reset(), { name: 'RangeError', message });
  assert.throws(() => sim.spawn({}), { name: 'RangeError', message });
});

// ── Any frame rate ───────────────────────────────────────────────────────────

test('the run is the same at any frame rate: 20, 30 and 60 frames a second, 8x, and frames of any length', () => {
  const setup = builtIn();
  const frames = {
    '20 fps': () => 1 / 20, '30 fps': () => 1 / 30, '60 fps': () => 1 / 60, '8x at 60 fps': () => 8 / 60,
    'uneven': (() => { let k = 0; return () => [0.007, 0.111, 0.033, 0.4, 0.016][k++ % 5]; })(),
  };
  const runs = {};
  for (const [name, frame] of Object.entries(frames)) {
    const sim = createSim(setup, { seed: 7 });
    const shots = [];
    let spawned = false, boundary = 300, target = 0;
    while (boundary <= 1800) {
      target += frame();
      if (!spawned && target >= 30) { // spawned at a moment every run passes exactly, so it is the same moment for all
        sim.stepTo(30);
        sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 1, delaySec: 0 });
        spawned = true;
      }
      while (boundary <= target && boundary <= 1800) {
        sim.stepTo(boundary);
        shots.push(sim.state());
        boundary += 300;
      }
      sim.stepTo(target);
    }
    runs[name] = shots;
  }
  const reference = runs['20 fps'];
  assert.equal(reference.length, 6);
  for (const [name, shots] of Object.entries(runs)) {
    for (let i = 0; i < reference.length; i++) {
      for (let j = 0; j < reference[i].aircraft.length; j++) {
        const refA = reference[i].aircraft[j];
        const a = shots[i].aircraft[j];
        assert.ok(Math.abs(a.x - refA.x) <= 5, `${name} shot ${i} ${a.id} x`);
        assert.ok(Math.abs(a.y - refA.y) <= 5, `${name} shot ${i} ${a.id} y`);
        assert.ok(Math.abs(a.alt - refA.alt) <= 1, `${name} shot ${i} ${a.id} alt`);
      }
    }
  }
});

test('a caller that keeps the remainder gets 8 steps of sim time from 8x at 20 frames a second', () => {
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST')]));
  let target = 0, steps = 0;
  for (let frame = 0; frame < 100; frame++) {
    target += (1 / 20) * 8; // 0.4 s of sim time a frame
    steps += sim.stepTo(target);
  }
  assert.equal(steps, 800);
  near(sim.t, 40, 1e-9);
});

// ── Trails ───────────────────────────────────────────────────────────────────

test('a trail has a point every half second of sim time, whatever the frame rate, and the last two minutes', () => {
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST')]));
  sim.stepTo(10);
  assert.equal(sim.trailOf('A1').length, 20);
  for (let t = 10.016; t < 300; t += 0.016) sim.stepTo(t);
  const trail = sim.trailOf('A1');
  assert.equal(trail.length, 240, 'two minutes of half seconds');
  near(trail.at(-1).x - trail.at(-2).x, 0.5 * 120 * KT_TO_FTPS, 5);
  assert.deepEqual(sim.trailOf('NOBODY'), []);
  sim.reset();
  assert.deepEqual(sim.trailOf('A1'), []);
});

test('state gives the heading the aircraft is flying, as a compass heading', () => {
  const sim = createSim(setupOf([square()], [plane('A1', 'SQ')]));
  sim.stepTo(20);
  assert.ok(Math.abs(only(sim.state(), 'A1').headingDeg - 90) <= 5, 'heading ~90°');
  sim.stepTo(45);
  const a = only(sim.state(), 'A1');
  assert.equal(Math.round(a.headingDeg), 0, `north on the second leg, not ${a.headingDeg}`);
});

test('Fallback Doctrine: continuous pattern training loop on touch-and-go past departure end', () => {
  const sim = createSim(builtIn());
  const a1 = only(sim.state(), 'A1');
  assert.equal(a1.intent, 'touch_and_go');
  // Step until A1 completes takeoff climb out
  sim.stepTo(100);
  const a1Flown = only(sim.state(), 'A1');
  assert.equal(a1Flown.status, 'flying');
  assert.ok(a1Flown.alt >= 2500, `Alt ${a1Flown.alt} should be >= 2500 ft`);
});
