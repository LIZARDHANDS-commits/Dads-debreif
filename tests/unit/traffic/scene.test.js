// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR WARNING — READ BEFORE DEBUGGING TEST FAILURES            ║
// ║                                                                    ║
// ║  These tests use PILOT-DOMAIN TOLERANCES (±10 kt, ±100 ft, ±5°).  ║
// ║  If a test fails repeatedly, DO NOT tweak the physics engine to    ║
// ║  make it pass. Instead:                                            ║
// ║    1. Ask the operator what to do.                                 ║
// ║    2. The test tolerance may need widening, OR                     ║
// ║    3. There may be a genuine flight behavior bug.                  ║
// ║  Never force physics to match a test value.                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// What the screen hands the map (src/modules/traffic/scene.js): the routes with their
// drawn path and turn data, the leg lengths with their middles, and the routes list rows.
// It reads the engine's setup and state and changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { legDistances } from '../../../src/modules/traffic/route.js';
import { buildScene, decisionPoints, legMarks, routeLink, routeRows } from '../../../src/modules/traffic/scene.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(MOOSE_JAW);
const byId = (setup, id) => setup.routes.find((r) => r.id === id);

test('the routes list says where each entry and split joins, by point number counted from 1', () => {
  const setup = fresh();
  assert.equal(routeLink(byId(setup, 'PAT1'), setup.routes), '');
  assert.equal(routeLink(byId(setup, 'ENT1'), setup.routes), '→ Pattern 1 P8');
  assert.equal(routeLink(byId(setup, 'SPL1'), setup.routes), 'P6 → P1');
  const orphan = { ...byId(setup, 'ENT1'), attachTo: 'GONE' };
  assert.equal(routeLink(orphan, setup.routes), 'Not linked');
});

test('one row per route for the routes list: id, name, kind, colour and link', () => {
  const setup = fresh();
  const rows = routeRows(setup.routes);
  assert.equal(rows.length, setup.routes.length);
  assert.deepEqual(rows[1], { id: 'ENT1', name: 'Entry 1', kind: 'entry', color: byId(setup, 'ENT1').color, link: '→ Pattern 1 P8' });
});

test('decision points are the first point of a pattern and every point a split leaves from', () => {
  const setup = fresh();
  assert.deepEqual([...decisionPoints(byId(setup, 'PAT1'), setup.routes)].sort((a, b) => a - b), [0, 1, 5, 11]);
  assert.equal(decisionPoints(byId(setup, 'ENT1'), setup.routes).size, 0);
});

test('leg lengths come with the middle of each leg, for the map to write them at', () => {
  const setup = fresh();
  const marks = legMarks(setup.routes);
  const pattern = byId(setup, 'PAT1');
  const legs = legDistances(pattern);
  const first = marks.filter((m) => m.routeId === 'PAT1');
  assert.equal(first.length, legs.length);
  assert.equal(first[0].ft, legs[0].ft);
  assert.equal(first[0].x, (pattern.points[0].x + pattern.points[1].x) / 2);
  assert.equal(first[0].y, (pattern.points[0].y + pattern.points[1].y) / 2);
  const closing = first.at(-1);
  assert.equal(closing.x, (pattern.points.at(-1).x + pattern.points[0].x) / 2, 'a pattern\'s last leg goes back to point 1');
  assert.ok(marks.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y) && m.ft > 0));
});

test('a hidden route has no leg marks', () => {
  const setup = fresh();
  byId(setup, 'ENT1').visible = false;
  assert.equal(legMarks(setup.routes).some((m) => m.routeId === 'ENT1'), false);
});

test('the scene has every route with its drawn path, the aircraft, the conflicts and the trails', () => {
  const setup = fresh();
  const sim = createSim(setup);
  sim.stepTo(60);
  const scene = buildScene({ setup, state: sim.state(), selectedRouteId: 'ENT1', trailOf: sim.trailOf });
  assert.equal(scene.routes.length, setup.routes.length);
  assert.equal(scene.selectedRouteId, 'ENT1');
  const pattern = scene.routes[0];
  assert.deepEqual([pattern.id, pattern.name, pattern.kind, pattern.color], ['PAT1', 'Pattern 1', 'pattern', byId(setup, 'PAT1').color]);
  assert.ok(pattern.path.length > pattern.points.length, 'the rounded turns are drawn as curves');
  assert.equal(scene.aircraft.length, 7);
  assert.deepEqual(scene.conflicts, sim.state().conflicts);
  assert.ok(Object.keys(scene.trails).length > 0);
  assert.ok(scene.legs.length > 0);
  assert.equal(scene.aircraft[0].id, 'A1');
});

test('an aircraft called __proto__, constructor or prototype still gets its trail, and no object changes', () => {
  const setup = fresh();
  const scene = buildScene({
    setup, selectedRouteId: null,
    state: { aircraft: ['__proto__', 'constructor', 'prototype'].map((id) => ({ id })), conflicts: [] },
    trailOf: (id) => [{ x: id.length, y: 0 }],
  });
  assert.deepEqual(Object.keys(scene.trails).sort(), ['__proto__', 'constructor', 'prototype']);
  assert.deepEqual(Object.entries(scene.trails).map(([id, trail]) => [id, trail[0].x]).sort(), [['__proto__', 9], ['constructor', 11], ['prototype', 9]]);
  assert.equal(Object.getPrototypeOf(scene.trails), null);
  assert.equal(({}).length, undefined);
});

test('turn data is the engine\'s: a radius and bank where V6 shows turn data, none at the first point of a pattern or the ends of an entry or split', () => {
  const setup = fresh();
  const scene = buildScene({ setup, state: createSim(setup).state(), selectedRouteId: null, trailOf: () => [] });
  const pattern = scene.routes.find((r) => r.id === 'PAT1');
  assert.equal(pattern.points[0].radiusFt, undefined);
  assert.ok(pattern.points.slice(1).every((p) => p.radiusFt > 0 && p.bankDeg > 0));
  const entry = scene.routes.find((r) => r.id === 'ENT1');
  assert.equal(entry.points[0].radiusFt, undefined);
  assert.equal(entry.points.at(-1).radiusFt, undefined);
  assert.ok(entry.points[1].radiusFt > 0);
});

test('the radius follows the route options, so turn data changes when they do', () => {
  const setup = fresh();
  const state = createSim(setup).state();
  const before = buildScene({ setup, state, selectedRouteId: null, trailOf: () => [] }).routes[0].points[3].radiusFt;
  setup.routeOptions = { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 1000 };
  const after = buildScene({ setup, state, selectedRouteId: null, trailOf: () => [] }).routes[0].points[3].radiusFt;
  assert.equal(after, 1000);
  assert.notEqual(before, after);
});

test('decision points are marked on the points the map draws as diamonds', () => {
  const setup = fresh();
  const scene = buildScene({ setup, state: createSim(setup).state(), selectedRouteId: null, trailOf: () => [] });
  const pattern = scene.routes[0];
  assert.deepEqual(pattern.points.map((p, i) => (p.decision ? i : null)).filter((i) => i !== null), [0, 1, 5, 11]);
});

test('building the scene changes nothing in the setup', () => {
  const setup = fresh();
  const before = JSON.stringify(setup);
  buildScene({ setup, state: createSim(setup).state(), selectedRouteId: 'PAT1', trailOf: () => [] });
  assert.equal(JSON.stringify(setup), before);
});
