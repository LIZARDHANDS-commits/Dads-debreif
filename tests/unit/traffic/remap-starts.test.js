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

// Adding or deleting a route point moves the point numbers after it, so the aircraft that
// start on that route must start at the same place as before (sim.remapStarts, driven by
// the editor's own index mapping).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { deletePoint, indexAfterDelete, indexAfterInsert, insertPoint } from '../../../src/modules/traffic/editor.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(MOOSE_JAW);
const byId = (routes, id) => routes.find((r) => r.id === id);
const at = (sim, id) => {
  const a = sim.state().aircraft.find((x) => x.id === id);
  return { x: a.x, y: a.y };
};

test('the index mappings: insert moves later points up, delete moves later ones down and a deleted one back', () => {
  const up = indexAfterInsert(3);
  assert.deepEqual([0, 2, 3, 4, 9].map(up), [0, 2, 4, 5, 10]);
  const down = indexAfterDelete(3, 12);
  assert.deepEqual([0, 2, 3, 4, 12].map(down), [0, 2, 2, 3, 11]);
  assert.equal(indexAfterDelete(0, 5)(0), 0, 'the first point deleted: the aircraft starts on the new first point');
  assert.equal(indexAfterDelete(4, 4)(4), 3, 'never past the last point');
});

test('an aircraft spawned at point 5 still starts at the same place after + Point after point 2, and Reset puts it there', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 5, delaySec: 100 });
  const before = at(sim, 'A8');
  const pattern = byId(setup.routes, 'PAT1');
  const put = insertPoint(setup.routes, pattern, 1); // after point 2: the new point is number 3
  sim.remapStarts('PAT1', indexAfterInsert(put));
  assert.deepEqual(sim.aircraftSpecs().find((s) => s.id === 'A8').startIndex, 5, 'point 5 is now point 6 (index 5)');
  assert.deepEqual(at(sim, 'A8'), before, 'still waiting where it was');
  sim.stepTo(1);
  sim.reset();
  const after = at(sim, 'A8');
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1e-6, 'after Reset it starts at the same place');
});

test('the same for the setup\'s own aircraft, and other routes\' aircraft are left alone', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.spawn({ routeId: 'PAT1', startPoint: 9, delaySec: 50 });
  sim.spawn({ routeId: 'ENT1', startPoint: 3, delaySec: 50 });
  const starts = () => Object.fromEntries(sim.aircraftSpecs().map((s) => [s.id, s.startIndex]));
  const was = starts();
  const pattern = byId(setup.routes, 'PAT1');
  const put = insertPoint(setup.routes, pattern, 3);
  sim.remapStarts('PAT1', indexAfterInsert(put));
  const now = starts();
  for (const spec of MOOSE_JAW.aircraft) {
    const onPattern = spec.routeId === 'PAT1';
    assert.equal(now[spec.id], onPattern && spec.startIndex >= put ? was[spec.id] + 1 : was[spec.id], spec.id);
  }
  assert.equal(now.A8, 9, 'point 9 (index 8) moved up by one');
  assert.equal(now.A9, 2, 'an aircraft on another route keeps its start');
});

test('after Delete point the start numbers move down, and an aircraft on the deleted point starts on the point before it', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.spawn({ routeId: 'PAT1', startPoint: 6, delaySec: 100 }); // index 5
  sim.spawn({ routeId: 'PAT1', startPoint: 4, delaySec: 100 }); // index 3, the one deleted
  const pattern = byId(setup.routes, 'PAT1');
  assert.deepEqual(deletePoint(setup.routes, pattern, 3), { ok: true });
  sim.remapStarts('PAT1', indexAfterDelete(3, pattern.points.length));
  const starts = Object.fromEntries(sim.aircraftSpecs().map((s) => [s.id, s.startIndex]));
  assert.equal(starts.A8, 4);
  assert.equal(starts.A9, 2);
});

test('an aircraft that is flying keeps its distance along the route, as V6\'s does', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(40); // A1 has been flying since 12 s
  const flying = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.equal(flying.status, 'flying');
  const put = insertPoint(setup.routes, byId(setup.routes, 'PAT1'), 4);
  sim.remapStarts('PAT1', indexAfterInsert(put));
  assert.equal(sim.state().aircraft.find((a) => a.id === 'A1').distFt, flying.distFt);
});

test('a mapping that gives a bad number is refused and moves nothing', () => {
  const sim = createSim(fresh(), { seed: 1 });
  const before = JSON.stringify(sim.aircraftSpecs());
  assert.throws(() => sim.remapStarts('PAT1', () => -1), RangeError);
  assert.throws(() => sim.remapStarts('PAT1', () => NaN), RangeError);
  assert.equal(JSON.stringify(sim.aircraftSpecs()), before);
});
