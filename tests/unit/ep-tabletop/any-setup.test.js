// Checks: "Any setup" frozen nose high (30° nose up, 140 KIAS, 70 % power, wings level, 8,000 ft) and left to carry on with the controls
//   held has its nose fall through the horizon, the stall said in words on the way, and the G never more than the wing gives at that speed
//   (a physical limit, docs/TESTING.md T10). Frozen there again, the nose-high recovery entered as steps (roll to the nearest horizon with
//   max power, pitch to the horizon, roll wings level, each until done) ends with the session paused, wings level, the nose near the
//   horizon and the speed above the clean stall; each step ended at its targets, none at its 60 s cap; the G never more than the wing gives.
// Serves: EP-R11 (docs/modules/ep-tabletop/requirements.md), EP-17, EP-18; ALL-R20.
// Expected values (docs/TESTING.md T3), never from this code's output:
//   - standard aerodynamics: nose high with the G held, the speed bleeds away (at 30° up gravity alone takes about half a G of it, some
//     9 kt a second at 8,000 ft) until the wing can no longer give the G held, (KIAS ÷ stall)² (core stallLimitG); then the path, and the
//     nose with it, falls through the horizon.
//   - the clean stall, 86 KIAS (core T6A_LIMITS.stallKias, Patrick 30 Sep), compared with the indicated airspeed the panel shows.
//   - "wings level" and "near the horizon": within the shared ±5° (tests/helpers/tolerances.js, docs/TESTING.md T4).
// Time limits, generous with their reasons (T2): the nose falls within 60 s (the speed is gone in well under 15 s at 9 kt a second, and a
// stalled nose drops in seconds; 60 s only catches one that is stuck); the steps finish within 3 minutes (each step stops at 60 s at the
// latest, and the check that none hit its cap is separate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, act, advance } from '../../../src/modules/ep-tabletop/scenario.js';
import { studentView } from '../../../src/modules/ep-tabletop/student-view.js';
import { ANY_SETUP } from '../../../src/modules/ep-tabletop/scenarios.js';
import { stallLimitG, T6A_LIMITS } from '../../../src/core/t6-performance.js';

const NOSE_HIGH = { altFt: 8000, headingDegM: 270, kias: 140, powerPct: 70, pitchDeg: 30, bankDeg: 0 };
const FALL_CAP_S = 60; // see the header
const STEPS_CAP_S = 180; // see the header
const DEG_MARGIN = 5; // the shared ±5° (tolerances.js)
/** The wing's limit is applied at the start of each 0.05 s step and the speed moves a fraction of a knot within it, so 0.02 G covers the sample (as flight.test.js). */
const G_SAMPLE_MARGIN = 0.02;

const frozen = () => act(startSession(ANY_SETUP), { type: 'freeze', setup: NOSE_HIGH });

function assertWingHolds(f, at) {
  assert.ok(f.g <= stallLimitG(f.kias) + G_SAMPLE_MARGIN, `${at}: ${f.g.toFixed(2)} G is more than the wing gives at ${f.kias.toFixed(1)} KIAS`);
}

test('Any setup: a nose-high freeze left to carry on falls through the horizon; the nose-high recovery as steps ends wings level near the horizon', () => {
  // The freeze shows what was set, paused.
  const s0 = frozen();
  const at0 = studentView(s0).flight;
  assert.equal(s0.running, false, 'the freeze is paused');
  assert.ok(Math.abs(at0.pitchDeg - NOSE_HIGH.pitchDeg) <= DEG_MARGIN, `frozen at ${at0.pitchDeg.toFixed(1)}° of pitch`);
  assert.ok(Math.abs(at0.kias - NOSE_HIGH.kias) <= 10, `frozen at ${at0.kias.toFixed(0)} KIAS`); // the shared ±10 kt

  // Carry on, the controls held: the nose falls through the horizon, never past what the wing gives.
  let s = act(s0, { type: 'carryOn' });
  let fellAtS = null;
  for (let t = 1; t <= FALL_CAP_S && fellAtS === null; t++) {
    s = advance(s, 1);
    const f = studentView(s).flight;
    assertWingHolds(f, `carrying on, ${t} s`);
    assert.equal(f.outcome, null, `carrying on, ${t} s: it hit the ground`);
    if (f.pitchDeg < 0) fellAtS = t;
  }
  assert.ok(fellAtS !== null, `the nose was still above the horizon after ${FALL_CAP_S} s`);
  assert.ok(s.log.some((l) => /stall/i.test(l.text)), 'the stall is said in words');

  // The nose-high recovery the student described, entered as steps and flown from the same freeze.
  s = act(frozen(), {
    type: 'flySteps',
    rows: [
      { type: 'fly', roll: { kind: 'nearest' }, power: { kind: 'max' } },
      { type: 'fly', pitch: { kind: 'horizon' } },
      { type: 'fly', roll: { kind: 'level' } },
    ],
  });
  assert.equal(s.running, true, 'Fly runs the clock');
  for (let t = 0; t < STEPS_CAP_S * 4 && s.running; t++) {
    s = advance(s, 0.25);
    assertWingHolds(studentView(s).flight, `flying the steps, ${(t + 1) / 4} s`);
  }
  assert.equal(s.running, false, `the steps had not finished after ${STEPS_CAP_S} s`);
  assert.ok(!s.log.some((l) => /stopped after/i.test(l.text)), 'every step ended at its targets, none at its cap');
  const end = studentView(s).flight;
  assert.equal(end.outcome, null, 'still flying');
  assert.ok(Math.abs(end.bankDeg) <= DEG_MARGIN, `ended with ${end.bankDeg.toFixed(1)}° of bank`);
  assert.ok(Math.abs(end.pitchDeg) <= DEG_MARGIN, `ended with the nose ${end.pitchDeg.toFixed(1)}° from the horizon`);
  assert.ok(end.kias > T6A_LIMITS.stallKias, `ended at ${end.kias.toFixed(0)} KIAS, not above the ${T6A_LIMITS.stallKias} KIAS clean stall`);
});
