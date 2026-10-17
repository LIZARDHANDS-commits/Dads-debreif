// Checks: over two full turns of the Model Showcase's gentle flight, what a pilot would recognise: the bank never past the
//   gentle 25°, a right bank turns right (the heading goes up) and a left bank left, the climb climbs on more torque than
//   the descent, which descends, the G in a steady turn is the turn's own, and with Manoeuvre off it settles wings level
//   and level.
// Serves: MS-7 (the Showcase's flight cycle), W25.
// Expected values: the brief's picture numbers (25° turns, +1,200 fpm on 85 % torque, -1,000 fpm on 22 %; Patrick's
//   W25, "just graphics"); G = 1 / cos(bank) in a level turn (standard aerodynamics); margins from the shared table
//   (±5°, ±0.5 G, ±100 ft/min as ±100 ft), not the code's own output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseFlight, stepShowcaseFlight, showcaseLegAt, SHOWCASE_CYCLE_S } from '../../../src/modules/model-showcase/flight-cycle.js';

test('the Showcase flies gentle, coordinated turns, climbs and descents, and holds level with Manoeuvre off', () => {
  const dt = 0.05;
  let s = createShowcaseFlight();
  const seen = { climbVs: [], climbTq: [], descentVs: [], descentTq: [] };
  for (let i = 0; i < (2 * SHOWCASE_CYCLE_S) / dt; i++) {
    const before = s;
    s = stepShowcaseFlight(s, dt);
    assert.ok(Math.abs(s.bankDeg) <= 25 + 5, `bank ${s.bankDeg.toFixed(1)}° is past a gentle 25°`);
    const turned = ((s.headingDeg - before.headingDeg + 540) % 360) - 180;
    if (s.bankDeg > 5) assert.ok(turned > 0, `right bank ${s.bankDeg.toFixed(1)}° but the heading went ${turned.toFixed(3)}°`);
    if (s.bankDeg < -5) assert.ok(turned < 0, `left bank ${s.bankDeg.toFixed(1)}° but the heading went ${turned.toFixed(3)}°`);
    // Steady in a turn (rolled in, nose not moving): the turn's own G.
    if (Math.abs(s.bankDeg) > 20 && Math.abs(s.rollRateDps) < 0.5 && Math.abs(s.pitchRateDps) < 0.2) {
      assert.ok(Math.abs(s.g - 1 / Math.cos((s.bankDeg * Math.PI) / 180)) <= 0.5, `G ${s.g.toFixed(2)} at ${s.bankDeg.toFixed(1)}° of bank`);
    }
    const leg = showcaseLegAt(s.t);
    if (leg.name === 'climb') seen.climbVs.push(s.vsFpm), seen.climbTq.push(s.torquePct);
    if (leg.name === 'descent') seen.descentVs.push(s.vsFpm), seen.descentTq.push(s.torquePct);
  }
  const last = (a) => a[a.length - 1];
  assert.ok(Math.max(...seen.climbVs) >= 1200 - 100, `the climb reached only ${Math.max(...seen.climbVs).toFixed(0)} fpm`);
  assert.ok(Math.min(...seen.descentVs) <= -1000 + 100, `the descent reached only ${Math.min(...seen.descentVs).toFixed(0)} fpm`);
  assert.ok(last(seen.climbTq) > last(seen.descentTq), 'the climb sets more torque than the descent');

  // Manoeuvre off, from a 20° bank in a climb: wings level and level flight within half a minute.
  let h = { ...createShowcaseFlight(), bankDeg: 20, vsFpm: 800, pitchDeg: 6 };
  for (let i = 0; i < 30 / dt; i++) h = stepShowcaseFlight(h, dt, { manoeuvre: false });
  assert.ok(Math.abs(h.bankDeg) <= 5, `still banked ${h.bankDeg.toFixed(1)}° with Manoeuvre off`);
  assert.ok(Math.abs(h.vsFpm) <= 100, `still climbing ${h.vsFpm.toFixed(0)} fpm with Manoeuvre off`);
});
