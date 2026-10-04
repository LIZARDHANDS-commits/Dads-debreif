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

// Sanity checks on the debrief projection with known distances (SPEC-core).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../../src/core/geo.js';
import { FT_PER_NM } from '../../../src/core/units.js';

const ref = geo.makeLocalRef(50.3303, -105.5592);

test('one minute of latitude north is about one nautical mile', () => {
  const p = geo.latLonToLocalFt(ref, ref.lat + 1 / 60, ref.lon);
  assert.ok(Math.abs(p.x) < 1e-9);
  assert.ok(Math.abs(p.y / FT_PER_NM - 1) < 0.01, `${p.y / FT_PER_NM} NM`);
});

test('east is +x and north is +y', () => {
  const p = geo.latLonToLocalFt(ref, ref.lat + 0.01, ref.lon + 0.01);
  assert.ok(p.x > 0 && p.y > 0);
});

test('local feet round-trip back to the same latitude and longitude', () => {
  for (const [x, y] of [[0, 0], [30000, -12000], [-250000, 90000]]) {
    const ll = geo.localFtToLatLon(ref, x, y);
    const back = geo.latLonToLocalFt(ref, ll.lat, ll.lon);
    assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6);
  }
});

test('the reference point is the origin', () => {
  assert.deepEqual(geo.latLonToLocalFt(ref, ref.lat, ref.lon), { x: 0, y: 0 });
});
