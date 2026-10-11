// Checks: the sim engine on small made-up routes and the built-in setup: time in whole 0.05 s steps, aircraft wait
//   for their start, fly at the true airspeed set, land or go round by their landing intent, take splits by their
//   odds at the point they leave from and join where they are linked, conflict flags for two aircraft flown to cross,
//   same seed same run, spawn and remove, the same run at any frame rate. Each moment is found by what the aircraft
//   is doing (where it is, its route, landed), never at a chosen second; each run has a safety stop.
// Serves: TR-R1, TR-R12, TR-R15, TR-R17, TR-R19, TR-R21, TR-R22.
// Expected values: arithmetic worked out in the test (120 kt = 202.5 ft/s; a lap's length over its speed; a turn's
//   radius from speed and G, standard aerodynamics); the 200 ft and 500 ft conflict and caution limits are TR-R17
//   (Patrick, 4 Oct 09:09Z); the built-in setup and V6's routes (moose-jaw-v6.json) are inputs only, never answers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC, TYPE_COLORS } from '../../../src/modules/traffic/sim.js';
import { createDice } from '../../../src/modules/traffic/dice.js';
import { routeLengthFt } from '../../../src/modules/traffic/route.js';
import { KT_TO_FTPS } from '../../../src/core/units.js';
import { iasToTasKt } from '../../../src/core/t6-performance.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const builtIn = () => clone(MOOSE_JAW);

const point = (x, y, alt = 2500, kt = 120, g = 2) => ({ label: '', x, y, alt, kt, g });
const route = (id, kind, points, extra = {}) => ({ id, name: id, kind, visible: true, color: '#fff', points, ...extra });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/** A setup of your own routes and aircraft, with the built-in options and limits. */
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

/** One lap of the square (its rounded corners cut it a little short of 24,000 ft), worked out at 120 kt (202.5 ft/s). */
const LAP_FT = routeLengthFt(square());
const LAP_SEC = LAP_FT / (120 * KT_TO_FTPS);
// Safety stop: ten laps, far more than any case below needs, so only an aircraft that is stuck or lost reaches it.
const STOP_SEC = 10 * LAP_SEC;
/** The radius of a level turn at 120 kt and 2 G (standard aerodynamics: r = V² / (g √(G² − 1))): a corner's turn starts this far before it. */
const TURN_RADIUS_FT = (120 * KT_TO_FTPS) ** 2 / (32.174 * Math.sqrt(2 * 2 - 1));
const DIST = TOLERANCES.DISTANCE_FT;

/** Flies on a step at a time until `done(a)` is true for aircraft `id` or the safety stop is reached; returns it. */
function flyUntil(sim, id, done, stopSec = STOP_SEC) {
  let a = only(sim.state(), id);
  while (sim.t < stopSec && !done(a)) {
    sim.stepTo(sim.t + STEP_SEC);
    a = only(sim.state(), id);
  }
  return a;
}
const from = (a, p) => Math.hypot(a.x - p.x, a.y - p.y);

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

// ── Aircraft ─────────────────────────────────────────────────────────────────

test('an aircraft waits until its start time and then flies', () => {
  // The start time is a rule about time (docs/TESTING.md T2): 12 s is the test's own setting.
  const sim = createSim(setupOf([straight()], [plane('A1', 'ST', 12)]));
  sim.stepTo(11.95);
  assert.equal(only(sim.state(), 'A1').status, 'waiting');
  assert.equal(only(sim.state(), 'A1').distFt, 0);
  const a = flyUntil(sim, 'A1', (x) => x.status !== 'waiting');
  near(sim.t, 12, STEP_SEC + 1e-9);
  assert.equal(a.status, 'flying');
});

test('an aircraft moves along its route at the true airspeed for the speed set there: 120 KIAS at 2,000 ft is about 124 KTAS', () => {
  const sim = createSim(setupOf([straight(120)], [plane('A1', 'ST')]));
  sim.stepTo(10);
  const a = only(sim.state(), 'A1');
  // Calm air: ground speed is the true airspeed, 120 KIAS corrected for 2,000 ft on a standard day (aero; Traffic
  // spec item 8), times 10 s. 1 ft allows for rounding over 200 steps.
  near(a.x, iasToTasKt(120, 2000) * KT_TO_FTPS * 10, 1);
  assert.ok(Math.abs(a.headingDeg - 90) <= TOLERANCES.ANGLE_DEG, 'heading about 090°');
});

test('an aircraft that starts at a later point starts there, and a start point past the last is the last', () => {
  const sim = createSim(setupOf([square()]));
  sim.spawn({ routeId: 'SQ', startPoint: 3 });
  sim.spawn({ routeId: 'SQ', startPoint: 99 });
  const [a, b] = sim.state().aircraft;
  assert.equal(a.id, 'A1');
  assert.equal(b.id, 'A2');
  // Where each corner's turn starts: within a turn radius (worked out) of the corner, plus the shared distance margin.
  assert.ok(from(a, SQUARE[2]) <= TURN_RADIUS_FT + DIST, `point 3 is the far corner, not ${a.x}, ${a.y}`);
  assert.ok(from(b, SQUARE[3]) <= TURN_RADIUS_FT + DIST, `point 4 is the last: ${b.x}, ${b.y}`);
});

test('an aircraft that has landed keeps the place it stopped at', () => {
  const sim = createSim(setupOf([square({ landOdds: 1 })], [plane('A1', 'SQ')]));
  const landed = flyUntil(sim, 'A1', (a) => a.status === 'landed');
  assert.equal(landed.status, 'landed', 'A1 never landed');
  sim.stepTo(sim.t + LAP_SEC);
  const later = only(sim.state(), 'A1');
  assert.deepEqual([later.x, later.y, later.distFt], [landed.x, landed.y, landed.distFt]);
});

// ── Patterns, landing, splits, joining ───────────────────────────────────────

test('a pattern is flown round and round: three laps and still flying', () => {
  const sim = createSim(setupOf([square()], [plane('A1', 'SQ')]));
  const a = flyUntil(sim, 'A1', (x) => x.distFt > 3 * LAP_FT || x.status !== 'flying');
  assert.equal(a.status, 'flying');
  assert.ok(a.distFt > 3 * LAP_FT, 'three laps');
});

test('with intent full_stop the aircraft lands at the end of its first lap, and with touch_and_go flies on', () => {
  const lands = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]));
  const a = flyUntil(lands, 'A1', (x) => x.status !== 'flying');
  assert.equal(a.status, 'landed');
  assert.ok(Math.abs(a.distFt - LAP_FT) <= DIST, `lands at the end of the first lap (${a.distFt.toFixed(0)} of ${LAP_FT.toFixed(0)} ft)`);
  const stays = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'touch_and_go')]));
  const b = flyUntil(stays, 'A1', (x) => x.distFt > 3 * LAP_FT || x.status !== 'flying');
  assert.equal(b.status, 'flying', 'a touch-and-go flies on, lap after lap');
});

test('training aircraft default to touch_and_go and stay flying; explicit full_stop aircraft land', () => {
  const aircraft = [
    ...Array.from({ length: 15 }, (_, i) => plane(`A${i + 1}`, 'SQ', 0, 0, 'CT-156', 'touch_and_go')),
    ...Array.from({ length: 5 }, (_, i) => plane(`A${i + 16}`, 'SQ', 0, 0, 'CT-156', 'full_stop')),
  ];
  const sim = createSim(setupOf([square()], aircraft));
  // All start together, so the full-stop ones land together, as the first lap ends.
  flyUntil(sim, 'A16', (a) => a.status !== 'flying');
  const landed = sim.state().aircraft.filter((a) => a.status === 'landed').map((a) => a.id);
  const flying = sim.state().aircraft.filter((a) => a.status === 'flying').length;
  assert.deepEqual(landed, ['A16', 'A17', 'A18', 'A19', 'A20']);
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
  const a = flyUntil(takes, 'A1', (x) => x.routeId === 'SP');
  assert.equal(a.routeId, 'SP', 'the split is taken');
  assert.ok(from(a, SQUARE[1]) <= TURN_RADIUS_FT + DIST, `taken at point 2, where its turn starts (${from(a, SQUARE[1]).toFixed(0)} ft from it)`);
  const refuses = createSim(withSplit(0));
  const b = flyUntil(refuses, 'A1', (x) => x.routeId !== 'SQ' || x.distFt > 3 * LAP_FT);
  assert.equal(b.routeId, 'SQ', 'never taken in three laps');
});

test('a split is rolled once per lap: an aircraft that refuses it is not offered it again on that lap', () => {
  const setup = withSplit(0.5);
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const sim = createSim(setup, { seed });
    // Half way along the leg after point 2: well past the split's point, and before the next lap's.
    const a = flyUntil(sim, 'A1', (x) => x.routeId === 'SP' || x.distFt > 9000);
    seen.add(a.routeId);
  }
  assert.deepEqual([...seen].sort(), ['SP', 'SQ'], 'some seeds take it and some do not');
});

test('at the end of a split the aircraft joins the pattern at the linked point, and flies on', () => {
  const sim = createSim(withSplit(1));
  flyUntil(sim, 'A1', (x) => x.routeId === 'SP');
  const a = flyUntil(sim, 'A1', (x) => x.routeId !== 'SP');
  assert.equal(a.routeId, 'SQ');
  assert.equal(a.status, 'flying');
  assert.ok(from(a, SQUARE[3]) <= DIST, `joins at point 4 (${from(a, SQUARE[3]).toFixed(0)} ft from it)`);
});

test('at the end of an entry the aircraft joins the pattern it is linked to at the linked point', () => {
  const entry = route('EN', 'entry', [point(-20000, 0, 2000), point(-9000, 0, 2000), point(0, 0, 2000)], { attachTo: 'SQ', mergeIndex: 0 });
  const sim = createSim(setupOf([square(), entry], [plane('A1', 'EN')]));
  const a = flyUntil(sim, 'A1', (x) => x.routeId !== 'EN');
  assert.equal(a.routeId, 'SQ');
  assert.equal(a.status, 'flying');
  assert.ok(from(a, SQUARE[0]) <= DIST, `joins at point 1 (${from(a, SQUARE[0]).toFixed(0)} ft from it)`);
});

test('an entry or split that joins nothing, or something that is not a pattern, ends there: Done', () => {
  const alone = route('EN', 'entry', [point(-20000, 0), point(-9000, 0)], { attachTo: '', mergeIndex: 0 });
  const toEntry = route('E2', 'entry', [point(-20000, 500), point(-9000, 500)], { attachTo: 'EN', mergeIndex: 0 });
  const sim = createSim(setupOf([square(), alone, toEntry], [plane('A1', 'EN'), plane('A2', 'E2')]));
  flyUntil(sim, 'A1', (a) => a.status === 'done');
  flyUntil(sim, 'A2', (a) => a.status === 'done');
  const state = sim.state();
  assert.equal(only(state, 'A1').status, 'done');
  assert.equal(only(state, 'A2').status, 'done');
  assert.ok(Math.abs(only(state, 'A1').x - (-9000)) <= DIST, 'ends at its last point');
});

// ── The odds when a route does not say ───────────────────────────────────────

test('splits are taken by odds while landing decisions are deterministic via aircraft intent', () => {
  let takenAbove = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const roll = createDice(seed)(); // the first choice the split makes
    if (seed <= 10) { // a few seeds show the landing does not hang on the dice (kept light, docs/TESTING.md T9)
      // Default intent is touch_and_go: still flying after the first lap.
      const stays = createSim(setupOf([square()], [plane('A1', 'SQ')]), { seed });
      const a = flyUntil(stays, 'A1', (x) => x.distFt > LAP_FT + 1000 || x.status !== 'flying');
      assert.equal(a.status, 'flying', `seed ${seed}: default touch_and_go stays flying`);

      // Explicit full_stop intent lands.
      const lands = createSim(setupOf([square()], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]), { seed });
      assert.equal(flyUntil(lands, 'A1', (x) => x.status !== 'flying').status, 'landed', `seed ${seed}: explicit full_stop lands`);
    }

    // A split with no odds set is taken half the time (the sim's default, no manual source).
    const splits = createSim(withSplit(undefined), { seed });
    const b = flyUntil(splits, 'A1', (x) => x.routeId === 'SP' || x.distFt > 9000);
    assert.equal(b.routeId === 'SP', roll < 0.5, `seed ${seed}: split, roll ${roll}`);
    if (roll >= 0.5 && roll < 0.6) takenAbove++;
  }
  assert.ok(takenAbove > 5, 'the seeds tried include rolls just above the default');
});

test('an aircraft that lands is not then offered a split at the same point', () => {
  const pattern = square({ landOdds: 1 });
  const split = route('SP', 'split', [point(0, -3000, 2000), point(0, -6000, 2000)], { sourceRoute: 'SQ', sourceIndex: 0, attachTo: 'SQ', mergeIndex: 0, splitOdds: 1 });
  const sim = createSim(setupOf([pattern, split], [plane('A1', 'SQ', 0, 0, 'CT-156', 'full_stop')]), { seed: 5 });
  const a = flyUntil(sim, 'A1', (x) => x.status !== 'flying' || x.routeId !== 'SQ');
  assert.equal(a.status, 'landed');
  assert.equal(a.routeId, 'SQ');
});

test('a split that leaves from a point past the last leaves from the last, and from one before the first leaves from the first', () => {
  const leavesAt = (sourceIndex) => {
    const setup = withSplit(1);
    setup.routes[1].sourceIndex = sourceIndex;
    const sim = createSim(setup, { seed: 1 });
    return flyUntil(sim, 'A1', (x) => x.routeId === 'SP');
  };
  // Where each turn starts: within a turn radius (worked out) of its point, plus the shared distance margin.
  for (const [sourceIndex, at, name] of [[3, SQUARE[3], 'the last point'], [99, SQUARE[3], 'point 100 does not exist, so the last'], [-2, SQUARE[0], 'the first point, as the lap ends']]) {
    const a = leavesAt(sourceIndex);
    assert.equal(a.routeId, 'SP', `${name}: the split is taken`);
    assert.ok(from(a, at) <= TURN_RADIUS_FT + DIST, `${name}: taken ${from(a, at).toFixed(0)} ft from it`);
  }
});

test('a pattern of no length is never landed on or split from', () => {
  const dot = route('DOT', 'pattern', [point(100, 100, 2000)], { landOdds: 1 });
  const split = route('SP', 'split', [point(0, 0), point(0, -3000)], { sourceRoute: 'DOT', sourceIndex: 0, attachTo: 'DOT', mergeIndex: 0, splitOdds: 1 });
  const sim = createSim(setupOf([dot, split], [plane('A1', 'DOT')]), { seed: 4 });
  sim.stepTo(30); // a run of any length: nothing may happen
  const a = only(sim.state(), 'A1');
  assert.equal(a.status, 'flying');
  assert.equal(a.routeId, 'DOT');
  assert.equal(sim.diceState(), createDice(4).getState(), 'no choice was made');
});

// ── Conflicts ────────────────────────────────────────────────────────────────

const LIMITS = { latFt: 200, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 }; // TR-R17 (Patrick, 4 Oct 09:09Z)

/** Two aircraft flown to cross at right angles over (0, 0) at the same moment, A1 eastbound and A2 northbound. */
function crossing(altA = 2000, altB = 2000) {
  const a = route('EW', 'entry', [point(-20000, 0, altA, 120), point(20000, 0, altA, 120)], { attachTo: '', mergeIndex: 0 });
  const b = route('NS', 'entry', [point(0, -20000, altB, 120), point(0, 20000, altB, 120)], { attachTo: '', mergeIndex: 0 });
  return createSim(setupOf([a, b], [plane('A1', 'EW'), plane('A2', 'NS')]));
}

/** Flies a crossing to its end; at every step the flag must be what the feet apart, worked out here, say. Returns the levels seen. */
function flyCrossing(sim) {
  const seen = new Set();
  while (sim.t < STOP_SEC) {
    sim.stepTo(sim.t + STEP_SEC);
    const { aircraft, conflicts } = sim.state();
    const [a, b] = aircraft;
    if (a.status !== 'flying' || b.status !== 'flying') break;
    const lat = Math.hypot(a.x - b.x, a.y - b.y), vert = Math.abs(a.alt - b.alt);
    const want = lat < LIMITS.latFt && vert < LIMITS.vertFt ? 'conflict' : lat < LIMITS.cautionLatFt && vert < LIMITS.cautionVertFt ? 'caution' : null;
    assert.deepEqual(conflicts.map((c) => c.level), want ? [want] : [], `${lat.toFixed(0)} ft apart, ${vert.toFixed(0)} ft in height`);
    if (want) {
      near(conflicts[0].latFt, lat, 1);
      near(conflicts[0].vertFt, vert, 1);
      seen.add(want);
    }
  }
  return [...seen].sort();
}

test('two aircraft flown to cross are red inside the conflict limits, yellow inside the caution limits, and clear outside', () => {
  assert.deepEqual(crossing().setup.conflictLimits, LIMITS, 'the built-in limits are 200 ft and 500 ft');
  assert.deepEqual(flyCrossing(crossing()), ['caution', 'conflict'], 'at the same height the crossing goes yellow, then red');
});

test('height apart counts too: 200 ft or more apart is not a conflict, 500 ft or more not even a caution', () => {
  assert.deepEqual(flyCrossing(crossing(2000, 2100)), ['caution', 'conflict'], '100 ft apart');
  assert.deepEqual(flyCrossing(crossing(2000, 2300)), ['caution'], '300 ft apart');
  assert.deepEqual(flyCrossing(crossing(2000, 2600)), [], '600 ft apart');
});

/** Two aircraft on the same straight route, `gapSec` apart (120 kt is 202.5 ft a second), at their own heights, once both fly. */
function pairOn(gapSec, altA = 2000, altB = 2000) {
  const a = route('AA', 'entry', [point(0, 0, altA, 120), point(60000, 0, altA, 120)], { attachTo: '', mergeIndex: 0 });
  const b = route('BB', 'entry', [point(0, 0, altB, 120), point(60000, 0, altB, 120)], { attachTo: '', mergeIndex: 0 });
  const sim = createSim(setupOf([a, b], [plane('A1', 'AA', 0), plane('A2', 'BB', gapSec)]));
  flyUntil(sim, 'A2', (x) => x.status === 'flying');
  sim.stepTo(sim.t + 1); // a second on, so both are in steady flight a fixed distance apart
  return sim;
}

test('the limits are strict: exactly 200 ft apart in height is not a conflict and exactly 500 ft not a caution, and the same for the distance apart', () => {
  const at = (altB) => pairOn(0.5, 2000, altB).state().conflicts.map((c) => c.level);
  assert.deepEqual(at(2200), ['caution']);
  assert.deepEqual(at(2500), []);
  const sim = pairOn(0.5);
  const lat = sim.state().conflicts[0].latFt;
  sim.setup.conflictLimits = { latFt: lat, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 };
  assert.equal(sim.state().conflicts[0].level, 'caution', 'exactly at the red distance');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 200, cautionLatFt: lat, cautionVertFt: 500 };
  assert.deepEqual(sim.state().conflicts, [], 'exactly at the caution distance');
});

test('the limits are the setup\'s, and can change while it runs', () => {
  const sim = pairOn(0.5);
  assert.equal(sim.state().conflicts[0].level, 'conflict');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 50, cautionLatFt: 500, cautionVertFt: 500 };
  assert.equal(sim.state().conflicts[0].level, 'caution');
  sim.setup.conflictLimits = { latFt: 50, vertFt: 50, cautionLatFt: 50, cautionVertFt: 50 };
  assert.deepEqual(sim.state().conflicts, []);
});

test('aircraft that are waiting, landed or done are never in conflict', () => {
  const a = route('AA', 'entry', [point(0, 0, 2000, 120), point(60000, 0, 2000, 120)], { attachTo: '', mergeIndex: 0 });
  const waiting = createSim(setupOf([a], [plane('A1', 'AA', 0), plane('A2', 'AA', 0.5)]));
  waiting.stepTo(0.4); // A1 flying, A2 still waiting at the same spot (before its 0.5 s start)
  assert.equal(only(waiting.state(), 'A2').status, 'waiting');
  assert.deepEqual(waiting.state().conflicts, []);
  const landing = createSim(setupOf([square({ landOdds: 1 })], [plane('A1', 'SQ'), plane('A2', 'SQ', 0.5)]));
  flyUntil(landing, 'A2', (x) => x.status === 'landed');
  assert.deepEqual(landing.state().aircraft.map((x) => x.status), ['landed', 'landed']);
  assert.deepEqual(landing.state().conflicts, []);
});

// ── The dice ─────────────────────────────────────────────────────────────────

/** Where 16 aircraft are after 15 minutes on the built-in setup, from one seed (900 s is the run's length, not a time to meet). */
function busyRun(seed) {
  const sim = createSim(builtIn(), { seed });
  for (const r of MOOSE_JAW.routes) sim.spawn({ routeId: r.id, startPoint: 1, delaySec: 5 });
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
  const count = MOOSE_JAW.aircraft.length;
  sim.stepTo(500);
  const spawned = sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 10 });
  sim.stepTo(1500);
  const first = JSON.stringify(sim.state());
  sim.reset();
  assert.equal(sim.t, 0);
  const start = sim.state();
  assert.equal(start.aircraft.length, count + 1);
  assert.deepEqual(start.aircraft.map((a) => a.status), new Array(count + 1).fill('waiting'));
  near(only(start, spawned).startsAt, 500 + 10, 1e-9); // a spawned aircraft keeps its start time: spawned at 500 s, 10 s delay
  sim.stepTo(500);
  assert.equal(sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 10 }), `A${count + 2}`);
  sim.remove(`A${count + 2}`);
  sim.stepTo(1500);
  assert.equal(JSON.stringify(sim.state()), first);
});

// ── Spawning and removing ────────────────────────────────────────────────────

test('spawn: the next free callsign, the type\'s colour, a start point counted from 1, and a delay from now', () => {
  const sim = createSim(builtIn());
  const next = `A${MOOSE_JAW.aircraft.length + 1}`;
  sim.stepTo(10);
  const id = sim.spawn({ type: 'CT-102', routeId: 'ENT2', startPoint: 3, delaySec: 5 });
  assert.equal(id, next);
  const a = only(sim.state(), id);
  assert.deepEqual([a.type, a.color, a.routeId, a.status], ['CT-102', TYPE_COLORS['CT-102'], 'ENT2', 'waiting']);
  near(a.startsAt, 10 + 5, 1e-9);
  const entryGate = MOOSE_JAW.routes.find((r) => r.id === 'ENT2').points[2];
  // Within 3,000 ft: where the turn at point 3 begins, a turn radius or two before it at the route's speeds.
  assert.ok(Math.hypot(a.x - entryGate.x, a.y - entryGate.y) < 3000, 'starts near point 3 (where the turn there begins)');
  const second = sim.spawn();
  const b = only(sim.state(), second);
  assert.deepEqual([b.type, b.routeId], ['CT-156', MOOSE_JAW.routes[0].id], 'with nothing said: CT-156, the first route, point 1, now');
  near(b.startsAt, 10, 1e-9);
});

test('spawn refuses what makes no sense: an unknown type or route, a start point under 1, a delay that is not a number', () => {
  const sim = createSim(builtIn());
  assert.throws(() => sim.spawn({ type: 'B-52' }), /unknown aircraft type/);
  assert.throws(() => sim.spawn({ routeId: 'NOPE' }), /unknown route/);
  for (const startPoint of [0, -1, 1.5, NaN, '2']) assert.throws(() => sim.spawn({ startPoint }), RangeError, String(startPoint));
  assert.throws(() => sim.spawn({ delaySec: NaN }), RangeError);
  assert.equal(sim.state().aircraft.length, MOOSE_JAW.aircraft.length, 'nothing was added');
  assert.throws(() => createSim(setupOf([])).spawn(), /at least one route/);
});

test('remove takes one aircraft out; clearFinished takes out those that have landed or are done', () => {
  // A1 lands at the end of its first square lap; A2's 60,000 ft straight takes about 300 s at 202.5 ft/s, so it is
  // still flying then; A3 starts at 2,000 s.
  const setup = setupOf([square({ landOdds: 1 }), straight()], [plane('A1', 'SQ'), plane('A2', 'ST'), plane('A3', 'ST', 2000)]);
  const sim = createSim(setup);
  flyUntil(sim, 'A1', (a) => a.status === 'landed');
  assert.deepEqual(sim.state().aircraft.map((a) => a.status), ['landed', 'flying', 'waiting']);
  sim.clearFinished();
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), ['A2', 'A3']);
  assert.equal(sim.remove('A2'), true);
  assert.equal(sim.remove('A2'), false);
  assert.deepEqual(sim.state().aircraft.map((a) => a.id), ['A3']);
});

test('aircraftSpecs gives the aircraft as a setup keeps them, so a new sim from them starts the same', () => {
  const sim = createSim(builtIn(), { seed: 4 });
  const next = `A${MOOSE_JAW.aircraft.length + 1}`;
  sim.stepTo(60);
  sim.spawn({ type: 'CT-114', routeId: 'ENT1', startPoint: 2, delaySec: 30 });
  const specs = sim.aircraftSpecs();
  assert.equal(specs.length, MOOSE_JAW.aircraft.length + 1);
  const { startsAtSec, ...last } = specs.at(-1);
  assert.deepEqual(last, { id: next, type: 'CT-114', routeId: 'ENT1', startIndex: 1 });
  near(startsAtSec, 60 + 30, 1e-9);
  const again = createSim({ ...builtIn(), aircraft: specs }, { seed: 4 });
  sim.reset();
  assert.equal(JSON.stringify(again.state()), JSON.stringify(sim.state()));
});

test('the specs of an aircraft that has moved to another route are still where it started', () => {
  const sim = createSim(withSplit(1));
  assert.equal(flyUntil(sim, 'A1', (a) => a.routeId === 'SP').routeId, 'SP');
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
  // 5 ft across and 1 ft in height: well under the 10 ft an aircraft flies in one 0.05 s step at 120 kt, so any
  // step's difference between the runs fails.
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

// ── Heading and the training loop ────────────────────────────────────────────

test('state gives the heading the aircraft is flying, as a compass heading', () => {
  const sim = createSim(setupOf([square()], [plane('A1', 'SQ')]));
  // Half way along the first leg (east) and the second (north), found by distance flown. ±5°: the shared angle margin.
  const east = flyUntil(sim, 'A1', (a) => a.distFt >= 3000);
  assert.ok(Math.abs(east.headingDeg - 90) <= TOLERANCES.ANGLE_DEG, `east on the first leg, not ${east.headingDeg}`);
  const north = flyUntil(sim, 'A1', (a) => a.distFt >= 9000);
  assert.ok(Math.abs(((north.headingDeg + 540) % 360) - 180) <= TOLERANCES.ANGLE_DEG, `north on the second leg, not ${north.headingDeg}`);
});

test('the built-in A1 takes off and comes round the circuit to the break at pattern height, still flying', () => {
  const sim = createSim(builtIn());
  assert.equal(only(sim.state(), 'A1').intent, 'touch_and_go', 'training aircraft fly touch-and-goes by default');
  // Safety stop: 20 minutes, several times one circuit, so only an aircraft that is stuck or lost reaches it.
  const a = flyUntil(sim, 'A1', (x) => x.phase === 'break' || (x.status !== 'flying' && x.status !== 'waiting'), 1200);
  assert.equal(a.phase, 'break', 'A1 comes round to the break');
  assert.equal(a.status, 'flying', 'still flying');
  // 3,500 ft pattern height (TR-R4), ±100 ft: the shared height margin.
  assert.ok(Math.abs(a.alt - 3500) <= TOLERANCES.ALTITUDE_FT, `at pattern height (${a.alt.toFixed(0)} ft)`);
});
