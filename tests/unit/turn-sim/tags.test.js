// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// The info tags' fighting wing state (spec section 10.4, TS-56). The cone is written out here from the manual, not read
// from the code: 500 to 1,000 ft from the aircraft flown off, 30° to 60° of sweep back from its wing line (SMM 12.29
// para 69, Fig 12.19). Sweep is measured the manual's way: 0° abeam on the wing line, 90° straight behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fwState } from '../../../src/modules/turn-sim/tags.js';

const DEG = Math.PI / 180;
const lead = { xFt: 0, yFt: 0, headingRad: 0, altAboveFt: 0 }; // heading east; left is +y
/** A wingman `rangeFt` from Lead, `sweepDeg` back from Lead's wing line, on his right. */
const at = (rangeFt, sweepDeg) => ({ xFt: -rangeFt * Math.sin(sweepDeg * DEG), yFt: -rangeFt * Math.cos(sweepDeg * DEG), headingRad: 0, altAboveFt: -60 });

test('fighting wing: inside the cone is in position, too close is tight, too far is stretched, too flat or too far back is out of the cone', () => {
  assert.equal(fwState(lead, at(750, 45)).state, 'IN POSITION');
  assert.equal(fwState(lead, at(400, 45)).state, 'TIGHT');
  assert.equal(fwState(lead, at(1200, 45)).state, 'STRETCHED');
  assert.equal(fwState(lead, at(750, 15)).state, 'OUT OF CONE');
  assert.equal(fwState(lead, at(750, 75)).state, 'OUT OF CONE');
});

test('the sweep is shown from the wing line, the manual\'s way (Fig 12.19): abeam is 0°, the cone\'s edges 30° and 60°', () => {
  for (const sweep of [0, 30, 45, 60]) assert.ok(Math.abs(fwState(lead, at(750, sweep)).sweepDeg - sweep) <= 5, `${sweep}°`); // the shared ±5° margin
});

test('while Lead manoeuvres only the distance is judged; ahead of the 3/9 line is flagged either way', () => {
  // Patrick 23:07Z and 23:08Z: "during the turn all that matters is their distance from lead for spacing" (500 to 1,000
  // ft, SMM 12.29 para 69); the sweep is judged again straight and level. Ahead of Lead's 3/9 line stays a flag.
  const turning = { distanceOnly: true };
  assert.notEqual(fwState(lead, at(750, 15), turning).state, 'OUT OF CONE');
  assert.notEqual(fwState(lead, at(750, 75), turning).state, 'OUT OF CONE');
  assert.equal(fwState(lead, at(400, 45), turning).state, 'TIGHT');
  assert.equal(fwState(lead, at(1200, 45), turning).state, 'STRETCHED');
  for (const opts of [turning, {}]) assert.equal(fwState(lead, at(750, -20), opts).state, 'AHEAD OF 3/9');
});
