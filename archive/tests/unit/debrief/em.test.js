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

// The EM chart's trail (SPEC-debrief: EM chart): worked out from the track, so
// it's the same after a seek as while playing, and broken across GPS gaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlight } from '../../../src/flight-data/flight.js';
import { emAt, emTrail, EM_TRAIL_S } from '../../../src/modules/debrief/em.js';

// A ship flying a steady turn at 3°/s, one fix a second, with a GPS gap from 40 s to 50 s.
function turning() {
  const fixes = [];
  const R = 2000; // metres
  for (let t = 0; t <= 120; t++) {
    if (t > 40 && t < 50) continue;
    const a = (3 * t * Math.PI) / 180;
    const north = R * Math.sin(a), east = R * (1 - Math.cos(a));
    fixes.push({ t, lat: 50 + north / 111_320, lon: -105 + east / (111_320 * Math.cos((50 * Math.PI) / 180)), altM: 2500 });
  }
  return buildFlight({ 1: { name: 'turning', fixes } });
}

test('a steady 3°/s turn shows 3°/s (no divide by 2, D39)', () => {
  const p = emAt(turning().tracks[1], 20);
  assert.ok(Math.abs(p.turnRateDeg - 3) < 0.05, String(p.turnRateDeg));
  assert.ok(p.iasKt > 0);
});

test('inside a GPS gap there is no point', () => {
  assert.equal(emAt(turning().tracks[1], 45), null);
});

test('the trail covers the last 60 s every half second, oldest first, broken across the gap', () => {
  const f = turning();
  const trail = emTrail(f.tracks[1], 100, f.startT);
  assert.equal(trail.length, (EM_TRAIL_S / 0.5) + 1);
  assert.equal(trail[0].t, 40);
  assert.equal(trail.at(-1).t, 100);
  assert.ok(trail.some((p) => p === null));
  assert.ok(trail.slice(0, 1).every((p) => p !== null)); // 40 s itself is a fix
  // Near the start of the flight it starts at the flight's start.
  assert.equal(emTrail(f.tracks[1], 10, f.startT)[0].t, 0);
});
