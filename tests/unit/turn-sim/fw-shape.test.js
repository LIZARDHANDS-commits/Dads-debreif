// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Fighting wing desired spacing and sweep as settings (TS-58, Patrick 21:25Z). What a pilot would recognise:
//  - the wingman settles where the setting puts him: at the spacing set, swept back from the wing line of the aircraft he
//    flies off by the sweep set (SMM 12.29 para 69, Fig 12.19), within the shared ±100 ft and ±5°;
//  - a place outside the SMM's 500-1,000 ft and 30-60° band is flown and flagged, never refused (rule book: published
//    limits are flags, never walls).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { judgeFormation } from '../../../src/modules/turn-sim/live/transitions.js';
import { checkFwShape } from '../../../src/modules/turn-sim/live/slots.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

/** Range and sweep back from ref's wing line (SMM Fig 12.19), as a pilot would read them. */
function place(ref, wing) {
  const rel = relativeTo(ref, wing);
  return { rangeFt: Math.hypot(rel.fwd, rel.left), sweepDeg: Math.atan2(-rel.fwd, Math.abs(rel.left)) * 180 / Math.PI };
}

/** Presses Fighting wing and flies it out (a generous 3 minutes: TS-53's change limit). */
function intoFightingWing(f) {
  assert.equal(f.change('fw'), 'started', f.state.refusal ?? '');
  for (let i = 0; i < 3600 && (f.state.current || f.state.queued); i++) f.step();
  assert.equal(f.state.current, null, 'the change finished');
}

function near(got, want, margin, what) {
  assert.ok(Math.abs(got - want) <= margin, `${what}: ${Math.round(got)}, set ${want}`);
}

test('a fighting wing place inside the SMM band has no flag; outside it is flown and flagged; far outside it is refused', () => {
  assert.deepEqual(checkFwShape(750, 45), { ok: true, flag: null });
  assert.equal(checkFwShape(1100, 45).ok, true);
  assert.ok(checkFwShape(1100, 45).flag, '1,100 ft is past the SMM band (SMM 12.29 para 69)');
  assert.ok(checkFwShape(750, 25).flag, '25° is flatter than the SMM band');
  assert.equal(checkFwShape(300, 45).ok, false, '300 ft is not fighting wing at all');
});

test('2-ship: #2 settles at the spacing and sweep set', () => {
  const f = createFormation({ fwRangeFt: 900, fwSweepDeg: 55 });
  intoFightingWing(f);
  const [lead, wing] = f.state.aircraft;
  const p = place(lead, wing);
  near(p.rangeFt, 900, TOLERANCES.DISTANCE_FT, 'spacing (ft)');
  near(p.sweepDeg, 55, TOLERANCES.ANGLE_DEG, 'sweep from the wing line (°)');
});

test('2-ship: a spacing past the SMM band is flown there and flagged, not held at the band', () => {
  const f = createFormation({ fwRangeFt: 1150, fwSweepDeg: 45 });
  intoFightingWing(f);
  const [lead, wing] = f.state.aircraft;
  near(place(lead, wing).rangeFt, 1150, TOLERANCES.DISTANCE_FT, 'spacing (ft)');
  assert.equal(judgeFormation('fw', lead, wing).inBand, false, 'the roll-out judgement flags it');
});

test('4-ship: #3 and #4 settle at their own spacing and sweep, #2 at his', () => {
  const f = createFormation({ ships: 4, fw4OtherRangeFt: 800, fw4OtherDeg: 50 });
  intoFightingWing(f);
  const by = new Map(f.state.aircraft.map((a) => [a.id, a]));
  const two = place(by.get(1), by.get(2));
  near(two.rangeFt, 650, TOLERANCES.DISTANCE_FT, '#2 spacing, the default (ft)'); // FW4: Patrick 11:44Z
  near(two.sweepDeg, 45, TOLERANCES.ANGLE_DEG, '#2 sweep, the default (°)');
  for (const [ref, id] of [[2, 3], [3, 4]]) {
    const p = place(by.get(ref), by.get(id));
    near(p.rangeFt, 800, TOLERANCES.DISTANCE_FT, `#${id} spacing (ft)`);
    near(p.sweepDeg, 50, TOLERANCES.ANGLE_DEG, `#${id} sweep (°)`);
  }
});
