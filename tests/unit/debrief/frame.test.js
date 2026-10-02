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

// The 3D view's plain values: camera moves, ship attitude, datum and ground grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { V6_CAMERA } from '../../../src/modules/debrief/view3d/scene.js';
import {
  orbit, wheelZoom, shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_GRID_FT,
} from '../../../src/modules/debrief/view3d/frame.js';

const fromRepo = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

test('dragging orbits as V6 did, within its limits', () => {
  assert.deepEqual(orbit(V6_CAMERA, 10, 4), { ...V6_CAMERA, yawDeg: -31, pitchDeg: 51 });
  assert.equal(orbit(V6_CAMERA, 10_000, 0).yawDeg, 180);
  assert.equal(orbit(V6_CAMERA, 0, 10_000).pitchDeg, 5);
  assert.equal(orbit(V6_CAMERA, 0, -10_000).pitchDeg, 80);
});

test('the wheel zooms by V6\'s steps, from 10 to 300', () => {
  assert.ok(Math.abs(wheelZoom(V6_CAMERA, -1).zoom - 78.4) < 1e-9);
  assert.ok(Math.abs(wheelZoom(V6_CAMERA, 1).zoom - 62.3) < 1e-9);
  assert.equal(wheelZoom({ ...V6_CAMERA, zoom: 290 }, -1).zoom, 300);
  assert.equal(wheelZoom({ ...V6_CAMERA, zoom: 10 }, 1).zoom, 10);
});

test('the datum: lowest ship less 500 ft down to a 500 ft step, the field, or sea level (V6)', () => {
  const ships = [{ altFt: 5230 }, { altFt: 4980 }, { altFt: null }];
  assert.equal(groundDatumFt(ships, 'min', 1892), 4000);
  assert.equal(groundDatumFt([{ altFt: 5000 }], 'min', 1892), 4500);
  assert.equal(groundDatumFt(ships, 'field', 1892), 1892);
  assert.equal(groundDatumFt(ships, 'zero', 1892), 0);
  assert.equal(groundDatumFt([], 'min', 1892), 0);
  assert.equal(heightLabel('field'), 'ft AGL');
  assert.equal(heightLabel('min'), 'ft above datum');
});

test('the ground grid sits on whole 5,000 ft lines, so it stays put as the formation moves (#27)', () => {
  const a = groundGrid({ x: 1234, y: -777 });
  const b = groundGrid({ x: 3234, y: 1223 });
  for (const g of [a, b]) assert.ok([...g.xs, ...g.ys].every((v) => v % GROUND_GRID_FT === 0));
  assert.ok(a.xs.includes(0) && b.xs.includes(0)); // the same line under both
  assert.ok(a.min.x <= 1234 - 70_000 && a.max.x >= 1234 + 70_000);
});

test('each ship\'s place and attitude come from the track, heading null when still', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const parked = shipsIn3d(flight, flight.startT);
  assert.equal(parked.length, 4);
  assert.equal(parked[0].hdg, null); // Lead on the ramp
  assert.ok(parked.every((s) => Number.isFinite(s.altFt)));
  const flying = shipsIn3d(flight, flight.startT + 40 * 60);
  assert.ok(flying.some((s) => s.hdg !== null));
  assert.ok(flying.every((s) => Number.isFinite(s.bankDeg) && Math.abs(s.bankDeg) <= 85));
  assert.deepEqual(shipsIn3d(null, 0), []);
});
