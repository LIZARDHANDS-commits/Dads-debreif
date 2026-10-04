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

// The one heading convention (SPEC-core, R9): math radians, 0 = east,
// counter-clockwise positive, +y north. These pin its meaning.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as angles from '../../../src/core/angles.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

test('compass headings map onto code headings', () => {
  close(angles.compassDegToHeadingRad(0), Math.PI / 2, 'north');
  close(angles.compassDegToHeadingRad(90), 0, 'east');
  close(angles.compassDegToHeadingRad(180), -Math.PI / 2, 'south');
  close(angles.compassDegToHeadingRad(270), -Math.PI, 'west');
});

test('code headings map back to compass headings from 0 up to 360', () => {
  close(angles.headingRadToCompassDeg(Math.PI / 2), 0, 'north');
  close(angles.headingRadToCompassDeg(0), 90, 'east');
  close(angles.headingRadToCompassDeg(-Math.PI / 2), 180, 'south');
  close(angles.headingRadToCompassDeg(Math.PI), 270, 'west');
  for (let c = 0; c < 360; c += 7.5) close(angles.headingRadToCompassDeg(angles.compassDegToHeadingRad(c)), c, `round trip ${c}`);
});

test('compass headings stay from 0 up to, not including, 360', () => {
  assert.ok(Object.is(angles.headingRadToCompassDeg(Math.PI / 2 + 2e-16), 0), 'a hair west of north');
  assert.ok(Object.is(angles.headingRadToCompassDeg(angles.compassDegToHeadingRad(-1e-14)), 0));
  assert.ok(Object.is(angles.headingRadToCompassDeg(2.5 * Math.PI), 0), 'north, one turn on');
  for (let r = -20; r <= 20; r += 0.01) {
    const c = angles.headingRadToCompassDeg(r);
    assert.ok(c >= 0 && c < 360 && !Object.is(c, -0), `${r} -> ${c}`);
  }
});

test('headingRad of a step north is north', () => {
  close(angles.headingRad({ x: 0, y: 0 }, { x: 0, y: 100 }), angles.compassDegToHeadingRad(0));
  close(angles.headingRad({ x: 0, y: 0 }, { x: 100, y: 0 }), angles.compassDegToHeadingRad(90));
});

test('north-up unit vectors point where the compass says', () => {
  const n = angles.unitVectorFromCompassDeg(0), e = angles.unitVectorFromCompassDeg(90);
  close(n.x, 0); close(n.y, 1); close(e.x, 1); close(e.y, 0);
});

test('relative bearing: positive is left, 3 o\'clock is -90', () => {
  const lead = { x: 0, y: 0, hdg: angles.compassDegToHeadingRad(0) };
  close(angles.relativeBearingDeg(lead, { x: -100, y: 0 }), 90, 'target to the west, on the left');
  close(angles.relativeBearingDeg(lead, { x: 100, y: 0 }), -90, 'target to the east, on the right');
  close(angles.clockToRelativeDeg(3), -90);
  close(angles.clockToRelativeDeg(9), 90);
});

test('aspect angle follows V6\'s nose/tail convention', () => {
  const lead = { x: 0, y: 0 }, north = angles.compassDegToHeadingRad(0);
  close(angles.aspectAngleDeg(lead, { x: 0, y: -1000 }, north), 0, 'in trail');
  close(angles.aspectAngleDeg(lead, { x: 1000, y: 0 }, north), 90, 'on the 3/9 line');
  close(angles.aspectAngleDeg(lead, { x: 0, y: 1000 }, north), 180, 'on the nose');
});

test('heading crossing angle is 0 to 180', () => {
  close(angles.headingCrossAngleDeg(0, Math.PI), 180);
  close(angles.headingCrossAngleDeg(0.1, -0.1), angles.radToDeg(0.2));
  close(angles.headingCrossAngleDeg(3, -3), angles.radToDeg(2 * Math.PI - 6));
});
