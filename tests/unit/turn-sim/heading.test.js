// D45: the start heading is a compass heading (000 north, 090 east), default 000; and legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, DEFAULTS } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { headingRadToCompassDeg } from '../../../src/core/angles.js';

const lead = (run) => run.state.aircraft.find((a) => a.id === 1);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('D45: 000 flies north, 090 east, 180 south and 270 west', () => {
  for (const [compass, dx, dy] of [[0, 0, 1], [90, 1, 0], [180, 0, -1], [270, -1, 0]]) {
    const run = createRun({ ...V6_DEFAULTS, startHeadingDeg: compass, maneuver: 'inplace90', turnDeg: 90, timing: 'time' });
    const start = { ...lead(run) };
    for (let i = 0; i < 2; i++) run.step(); // 0.1 s, before any turn is meaningful
    near(headingRadToCompassDeg(start.headingRad), compass, 1e-9);
    // Straight ahead for 0.1 s at 220 kt: in-place turns start at once, so look at Lead's very first movement.
    const moved = Math.hypot(lead(run).xFt - start.xFt, lead(run).yFt - start.yFt);
    assert.ok(moved > 30 && moved < 40, `moved ${moved}`);
    // The formation's line abreast is across that heading: #2 is 6,000 ft from Lead, 90° from the heading.
    const two = run.state.aircraft.find((a) => a.id === 2);
    const across = (two.xFt - lead(run).xFt) * dx + (two.yFt - lead(run).yFt) * dy;
    assert.ok(Math.abs(across) < 100, `#2 is abeam Lead, not ahead: ${across}`);
  }
});

test('D45: the default start heading is 000, flying up the screen; V6\'s default flew east, which is 090', () => {
  assert.equal(DEFAULTS.startHeadingDeg, 0);
  assert.equal(V6_DEFAULTS.startHeadingDeg, 90);
  const run = createRun(DEFAULTS);
  near(lead(run).headingRad, Math.PI / 2);
  assert.equal(run.state.startHeadingDeg, 0);
  const v6 = createRun(V6_DEFAULTS);
  assert.equal(lead(v6).headingRad, 0);
  assert.equal(v6.state.startHeadingDeg, 90);
});

test('D45: the same formation and turn flown north or east is the same picture turned 90°', () => {
  const north = createRun({ ...DEFAULTS, baseG: 2, boxAftFt: 8000 });
  const east = createRun(V6_DEFAULTS);
  for (let i = 0; i < 1400; i++) { north.step(); east.step(); }
  for (const a of north.state.aircraft) {
    const b = east.state.aircraft.find((x) => x.id === a.id);
    // The east picture turned 90° counter-clockwise is the north picture: (x, y) -> (-y, x).
    near(a.yFt, b.xFt, 1e-6 * Math.max(1, Math.abs(b.xFt)));
    near(a.xFt, -b.yFt, 1e-6 * Math.max(1, Math.abs(b.yFt)));
  }
});

test('legs: continuing fills in Lead\'s compass heading, and the next leg turns on from there', () => {
  const run = createRun({ ...DEFAULTS, maneuver: 'inplace90', durationSec: 40 });
  assert.equal(run.state.startHeadingDeg, 0);
  while (run.step());
  // North, turned 90° right: east.
  near(run.state.aircraft[0].headingRad, 0, 2e-4);
  assert.equal(run.state.startHeadingDeg, 0); // the run's start heading stays until a new leg
  run.startLeg();
  near(run.state.startHeadingDeg, 90, 1e-2);
  while (run.step());
  run.startLeg();
  near(run.state.startHeadingDeg, 180, 1e-2);
  while (run.step());
  run.startLeg();
  near(run.state.startHeadingDeg, 270, 1e-2);
  run.reset();
  assert.equal(run.state.startHeadingDeg, 0); // a reset goes back to the setting
});
