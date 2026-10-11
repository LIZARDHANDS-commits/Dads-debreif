import test from 'node:test';
import assert from 'node:assert/strict';
import { isLeadInCanopy } from '../../../src/core/canopy.js';

test('isLeadInCanopy: Lead above is in canopy glass when wings level', () => {
  const wing = { xFt: 0, yFt: 0, altAboveFt: 5000, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const lead = { xFt: 500, yFt: 0, altAboveFt: 5200 };
  assert.equal(isLeadInCanopy(lead, wing), true);
});

test('isLeadInCanopy: Lead below is masked when wings level', () => {
  const wing = { xFt: 0, yFt: 0, altAboveFt: 5200, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const lead = { xFt: 500, yFt: 0, altAboveFt: 5000 };
  assert.equal(isLeadInCanopy(lead, wing), false);
});

test('isLeadInCanopy: Lead in turn is visible when canopy faces Lead', () => {
  // Wing at (0, 0, 5000), heading East (0), banked 60° right.
  // Lead is to the right at (0, -600, 5000).
  // Wait, in our right-turn convention, heading 0 banked +90° has canopy at +y (North).
  // If Lead is North at (0, +600, 5000), Lead is inside the turn.
  const wing = { xFt: 0, yFt: 0, altAboveFt: 5000, headingRad: 0, pitchDeg: 0, bankDeg: 60 };
  const leadInside = { xFt: 0, yFt: 600, altAboveFt: 5000 };
  assert.equal(isLeadInCanopy(leadInside, wing), true);

  // If Lead is on the belly side (South, y = -600), Lead is masked under the floor.
  const leadOutside = { xFt: 0, yFt: -600, altAboveFt: 5000 };
  assert.equal(isLeadInCanopy(leadOutside, wing), false);
});
