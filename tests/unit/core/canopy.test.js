import test from 'node:test';
import assert from 'node:assert/strict';
import { canopySightVector, canopyLosDot, isLeadInCanopy, checkDoctrinalInvariants } from '../../../src/core/canopy.js';

test('canopySightVector: wings level, level pitch points straight up', () => {
  const c = canopySightVector(0, 0, 0);
  assert.ok(Math.abs(c.x) < 1e-9);
  assert.ok(Math.abs(c.y) < 1e-9);
  assert.ok(Math.abs(c.z - 1.0) < 1e-9);
});

test('canopySightVector: 90 deg right bank points toward inside of turn (left in aircraft frame)', () => {
  // Heading East (headingRad = 0).
  // Right wing points South (y = -1).
  // Banked 90 deg right -> canopy points North (y = +1, into the right turn).
  const c = canopySightVector(0, 0, 90);
  assert.ok(Math.abs(c.x) < 1e-9);
  assert.ok(Math.abs(c.y - 1.0) < 1e-9);
  assert.ok(Math.abs(c.z) < 1e-9);
});

test('canopySightVector: inverted flight points straight down', () => {
  const c = canopySightVector(0, 0, 180);
  assert.ok(Math.abs(c.x) < 1e-9);
  assert.ok(Math.abs(c.y) < 1e-9);
  assert.ok(Math.abs(c.z - (-1.0)) < 1e-9);
});

test('isLeadInCanopy: Lead above is in canopy glass when wings level', () => {
  const wing = { xFt: 0, yFt: 0, altAboveFt: 5000, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const lead = { xFt: 500, yFt: 0, altAboveFt: 5200 };
  assert.equal(isLeadInCanopy(lead, wing), true);
  assert.ok(canopyLosDot(lead, wing) > 0);
});

test('isLeadInCanopy: Lead below is masked when wings level', () => {
  const wing = { xFt: 0, yFt: 0, altAboveFt: 5200, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const lead = { xFt: 500, yFt: 0, altAboveFt: 5000 };
  assert.equal(isLeadInCanopy(lead, wing), false);
  assert.ok(canopyLosDot(lead, wing) < 0);
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

test('checkDoctrinalInvariants: inside 2,000 ft step-down gate enforced', () => {
  const lead = { xFt: 0, yFt: 0, altAboveFt: 5000, headingRad: 0 };
  // Wing inside 2,000 ft but 50 ft above Lead -> fails step-down
  const highWing = { xFt: 1500, yFt: 0, altAboveFt: 5050, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const resHigh = checkDoctrinalInvariants(lead, highWing);
  assert.equal(resHigh.ok, false);
  assert.equal(resHigh.stepDownOk, false);

  // Wing inside 2,000 ft and 20 ft below Lead -> passes step-down
  const lowWing = { xFt: 1500, yFt: 0, altAboveFt: 4980, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const resLow = checkDoctrinalInvariants(lead, lowWing);
  assert.equal(resLow.stepDownOk, true);
});

test('checkDoctrinalInvariants: inside 1,200 ft canopy lock enforced', () => {
  const lead = { xFt: 0, yFt: 0, altAboveFt: 5000, headingRad: 0 };
  // Wing inside 1,200 ft at 4,950 ft, inverted (bank 180°), Lead is above Wing's belly -> fails canopy lock
  const invertedWing = { xFt: -800, yFt: 0, altAboveFt: 4950, headingRad: 0, pitchDeg: 0, bankDeg: 180 };
  const resInv = checkDoctrinalInvariants(lead, invertedWing);
  assert.equal(resInv.ok, false);
  assert.equal(resInv.canopyOk, false);

  // Wing upright (bank 0°), Lead at 5,000 ft is above Wing at 4,950 ft -> in canopy glass
  const uprightWing = { xFt: -800, yFt: 0, altAboveFt: 4950, headingRad: 0, pitchDeg: 0, bankDeg: 0 };
  const resUpright = checkDoctrinalInvariants(lead, uprightWing);
  assert.equal(resUpright.ok, true);
  assert.equal(resUpright.canopyOk, true);
});
