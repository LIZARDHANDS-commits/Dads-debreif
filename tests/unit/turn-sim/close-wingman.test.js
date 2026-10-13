// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// The live close-in wingman holds echelon (B1, TS-226; spec 7b, section 10's B1 test, 7b.6d item 10). What a pilot would
// recognise, with the numbers written out here from their sources, not read from the code:
//  - from the default start, with "#2 in close formation: Live", Change to echelon finishes (a generous 5 minutes; it takes
//    about 70 s from line abreast);
//  - then for 60 s straight and level (long enough to show any hunting; the SMM's picture is a steady one):
//    - he never leaves 5 ft of his place and closes under 5 kt (in position: Patrick, TS-80);
//    - his place is the SMM's echelon, about 18 ft back, 43 ft out and 3 ft down off Lead (SMM 12.6 para 15, Fig 12.3; TS-182),
//      so 5 ft of it is checked against those numbers;
//    - he is never within a wingspan of Lead (the T-6A's 33.4 ft, the existing always-true check);
//    - his bank stays within 5° and his G within 0.5 G of Lead's (the shared table, tests/helpers/tolerances.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const STEP_SEC = 0.05; // the sim's fixed step
const CHANGE_LIMIT_SEC = 300; // generous: the change takes about 70 s from line abreast
const HOLD_SEC = 60; // spec 7b.6d item 10
const IN_POSITION_FT = 5; // Patrick, TS-80
const CLOSURE_KT = 5; // Patrick, TS-80
const KT_TO_FTPS = 1.6878;
const WINGSPAN_FT = 33.4; // the T-6A's wingspan
const ECHELON = { back: 18, out: 43, down: 3 }; // SMM 12.6 para 15, Fig 12.3; TS-182

test('the live close-in wingman holds echelon straight and level for 60 s', () => {
  const f = createFormation({ ships: 2, closeWing: 'live' });
  assert.equal(f.change('echelon'), 'started');
  for (let t = 0; f.state.current && t < CHANGE_LIMIT_SEC; t += STEP_SEC) f.step();
  assert.equal(f.state.current, null, `Change to echelon did not finish within ${CHANGE_LIMIT_SEC} s`);
  assert.ok(f.state.liveWing, 'the live wingman took #2 at the end of the change');

  const [lead, two] = f.state.aircraft;
  const side = Math.sign(relativeTo(lead, two).left) || -1; // +1 on Lead's left
  const place = { fwd: -ECHELON.back, left: side * ECHELON.out, up: -ECHELON.down };
  let prev = null;
  for (let t = 0; t < HOLD_SEC; t += STEP_SEC) {
    f.step();
    const r = relativeTo(lead, two);
    const up = two.altAboveFt - lead.altAboveFt;
    const off = Math.hypot(r.fwd - place.fwd, r.left - place.left, up - place.up);
    assert.ok(off <= IN_POSITION_FT, `at ${t.toFixed(2)} s #2 is ${off.toFixed(1)} ft from his echelon place`);
    assert.ok(Math.hypot(r.fwd, r.left, up) > WINGSPAN_FT, `at ${t.toFixed(2)} s #2 is within a wingspan of Lead`);
    if (prev) {
      const closureKt = Math.hypot(r.fwd - prev.fwd, r.left - prev.left, up - prev.up) / STEP_SEC / KT_TO_FTPS;
      assert.ok(closureKt < CLOSURE_KT, `at ${t.toFixed(2)} s #2 closes at ${closureKt.toFixed(1)} kt`);
    }
    prev = { fwd: r.fwd, left: r.left, up };
    assert.ok(Math.abs(two.bankDeg - lead.bankDeg) <= TOLERANCES.ANGLE_DEG, `at ${t.toFixed(2)} s #2's bank is ${(two.bankDeg - lead.bankDeg).toFixed(1)}° off Lead's`);
    assert.ok(Math.abs(two.g - lead.g) <= TOLERANCES.G_FORCE, `at ${t.toFixed(2)} s #2's G is ${(two.g - lead.g).toFixed(2)} off Lead's`);
  }
});

// B2 (TS-226; spec 7b, section 10's B2 test): with Live, Lead's telegraphed close turn in echelon at the default 60° bank
// (rates.js DEFAULT_CLOSE_BANK_DEG; Patrick: the default, 60°), into #2 and away, each to its roll-out. His place is held
// in Lead's wing plane (SMM 12.19 para 41: in a turn #2 stays on his references in Lead's plane), so it is checked in
// Lead's banked frame: never more than 5 ft from it and closing under 5 kt (TS-80), never within a wingspan, and once
// Lead's roll is done his bank within 5° and his G within 0.5 G of Lead's (the shared table). Out of place a little while
// Lead rolls and catching up as the turn steadies is how formation flies (Patrick, 13 Oct 2026); the turn finishes within
// a generous 2 minutes (it takes about 20 s).
const TURN_LIMIT_SEC = 120;

test('the live close-in wingman holds echelon through the 60° close turn, into #2 and away', () => {
  const f = createFormation({ ships: 2, closeWing: 'live' });
  f.change('echelon');
  for (let t = 0; f.state.current && t < CHANGE_LIMIT_SEC; t += STEP_SEC) f.step();
  assert.equal(f.state.current, null, 'Change to echelon finished');
  const [lead, two] = f.state.aircraft;
  const side = Math.sign(relativeTo(lead, two).left) || -1;
  const DEG = Math.PI / 180;
  // Where #2 sits in Lead's wing frame (Lead level in his turn, banked bankDeg, left wing down positive).
  const inWing = () => {
    const r = relativeTo(lead, two);
    const dz = two.altAboveFt - lead.altAboveFt;
    const b = lead.bankDeg * DEG;
    return { fwd: r.fwd, left: r.left * Math.cos(b) - dz * Math.sin(b), up: r.left * Math.sin(b) + dz * Math.cos(b) };
  };
  const place = { fwd: -ECHELON.back, left: side * ECHELON.out, up: -ECHELON.down };
  for (const [dir, words] of [[-side, 'into #2'], [side, 'away from #2']]) {
    assert.equal(f.press('delayed90', dir), 'started');
    let prev = null;
    let t = 0;
    for (; f.state.current && t < TURN_LIMIT_SEC; t += STEP_SEC) {
      f.step();
      const w = inWing();
      const off = Math.hypot(w.fwd - place.fwd, w.left - place.left, w.up - place.up);
      assert.ok(off <= IN_POSITION_FT, `turn ${words}, ${t.toFixed(2)} s: #2 is ${off.toFixed(1)} ft from his place in Lead's wing plane`);
      assert.ok(Math.hypot(w.fwd, w.left, w.up) > WINGSPAN_FT, `turn ${words}, ${t.toFixed(2)} s: #2 is within a wingspan of Lead`);
      if (prev) {
        const closureKt = Math.hypot(w.fwd - prev.fwd, w.left - prev.left, w.up - prev.up) / STEP_SEC / KT_TO_FTPS;
        assert.ok(closureKt < CLOSURE_KT, `turn ${words}, ${t.toFixed(2)} s: #2 closes at ${closureKt.toFixed(1)} kt`);
      }
      prev = w;
      if (lead.rollRateDps === 0) {
        assert.ok(Math.abs(two.bankDeg - lead.bankDeg) <= TOLERANCES.ANGLE_DEG, `turn ${words}, ${t.toFixed(2)} s: #2's bank is ${(two.bankDeg - lead.bankDeg).toFixed(1)}° off Lead's`);
        assert.ok(Math.abs(two.g - lead.g) <= TOLERANCES.G_FORCE, `turn ${words}, ${t.toFixed(2)} s: #2's G is ${(two.g - lead.g).toFixed(2)} off Lead's`);
      }
    }
    assert.equal(f.state.current, null, `the close turn ${words} finished within ${TURN_LIMIT_SEC} s`);
  }
});
