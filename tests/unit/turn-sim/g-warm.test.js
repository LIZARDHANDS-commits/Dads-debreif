// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// G-warm from Spread 4 (docs/modules/turn-sim/spec.md section 8, decision TS-54). Checks that it flies right
// (Patrick, 4 Oct 11:50Z): the sequence the SMM and the brief give, the G each step calls for, the push over sinks
// and comes back level, nothing snaps, the four stay apart, and it ends in line abreast at the tightened gap.
//
// Sources for the expected values (page references only):
//  - SMM 16.22 para 71 and 16.44 para 120: in place 90 at 3 G (normally toward the wingman), a half-G push over,
//    hook at 4 G, in place 90 back; each aircraft flies accurate G and headings.
//  - AFM8 brief p.16 items 1-5: start on the wide side, in place 90 toward #2, then tighten to about 4,000 ft.
//  - AFM8 brief p.14: the stack is kept (#2 +300, Lead 0, #3 -300, #4 -600).
//  - SMM 16.18 para 49: line abreast sweep 0-10°; SMM 16.13 para 31: 300 ft separation.
//  - 2 CFFTS Orders B2 ch 8 p.98: more than two aircraft normally 3 G. A reference, not a wall: the 4 G hook is flown.
// Margins: the shared table (±100 ft, ±5°, ±0.5 G). No time gates: 5 minutes only catches a plan that never ends
// (the design estimates about 90 s plus the tighten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';

const DEG = Math.PI / 180;
const MARGIN_FT = 100; // shared table
const MARGIN_DEG = 5; // shared table
const MARGIN_G = 0.5; // shared table
const TIGHT_FT = 4000; // AFM8 brief p.16 item 5
const STACK = { 1: 0, 2: 300, 3: -300, 4: -600 }; // AFM8 brief p.14
const CATCH_SEC = 300;

const headingDiffDeg = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) / DEG;
const lateralOrder = (aircraft) => [...aircraft].sort((a, b) => relativeTo(aircraft[0], b).left - relativeTo(aircraft[0], a).left).map((a) => a.id);

/** Flies until nothing is being flown; calls each(before, after) every step. */
function fly(f, each = () => {}) {
  const t0 = f.state.tSec;
  let before = f.state.aircraft.map((a) => ({ ...a }));
  while (f.state.current || f.state.queued) {
    f.step();
    const after = f.state.aircraft.map((a) => ({ ...a }));
    each(before, after);
    before = after;
    assert.ok(f.state.tSec - t0 <= CATCH_SEC, 'G-warm finished');
  }
}

for (const wingSide of ['right', 'left']) {
  test(`G-warm, #2 on the ${wingSide}: in place 90 toward #2, push over, 4 G hook, back, and line abreast tightened to about 4,000 ft`, () => {
    const f = createFormation({ ships: 4, wingSide });
    const start = f.state.aircraft.map((a) => ({ ...a }));
    const h0 = start[0].headingRad;
    const towardTwo = wingSide === 'left' ? 1 : -1; // +1 is a left turn
    assert.equal(f.press('gWarm'), 'started');
    let firstTurn = 0; // the way Lead's heading first moves
    let minG = Infinity;
    let maxG = -Infinity;
    let sank = false;
    fly(f, (_b, after) => {
      const lead = after[0];
      const turned = Math.atan2(Math.sin(lead.headingRad - h0), Math.cos(lead.headingRad - h0)) / DEG;
      if (!firstTurn && Math.abs(turned) > 5) firstTurn = Math.sign(turned);
      for (const a of after) {
        minG = Math.min(minG, a.g);
        maxG = Math.max(maxG, a.g);
        if (a.altAboveFt < STACK[a.id] - 100) sank = true;
      }
    });
    const end = f.state.aircraft;
    assert.equal(firstTurn, towardTwo, 'the first in place 90 is toward #2');
    // The calls: 0.5 G in the push and 4 G in the hook, each within the shared ±0.5 G; never more than the hook's call plus that.
    assert.ok(Math.abs(minG - 0.5) <= MARGIN_G, `push over ${minG.toFixed(2)} G`);
    assert.ok(Math.abs(maxG - 4) <= MARGIN_G, `hook ${maxG.toFixed(2)} G`);
    assert.ok(sank, 'the push over sinks');
    for (const a of end) {
      assert.equal(a.climbFtps, 0, `${a.name} level again at the end`);
      assert.ok(headingDiffDeg(a.headingRad, h0) <= MARGIN_DEG, `${a.name} back on the first heading`);
      // The stack is kept: everyone sinks the same in the push, so each stays its step above or below Lead.
      assert.ok(Math.abs(a.altAboveFt - end[0].altAboveFt - STACK[a.id]) <= MARGIN_FT, `${a.name} on the stack`);
    }
    assert.deepEqual(lateralOrder(end), lateralOrder(start), 'the line reads the same way round as it started');
    const byLeft = lateralOrder(end).map((id) => end.find((a) => a.id === id));
    for (let i = 1; i < byLeft.length; i++) {
      const rel = relativeTo(byLeft[i - 1], byLeft[i]);
      const gap = Math.abs(rel.left);
      const sweep = Math.atan2(Math.abs(rel.fwd), gap) / DEG;
      assert.ok(Math.abs(gap - TIGHT_FT) <= MARGIN_FT, `gap ${gap.toFixed(0)} ft`);
      assert.ok(sweep <= 10 + MARGIN_DEG, `sweep ${sweep.toFixed(1)}°`);
    }
  });
}

test('G-warm: nothing snaps, and the four stay apart', () => {
  const f = createFormation({ ships: 4 });
  const tas = f.state.aircraft[0].tasFtps;
  f.press('gWarm');
  let lastPitchRate = null;
  fly(f, (before, after) => {
    after.forEach((x, i) => {
      const p = before[i];
      const what = `${x.name} at ${f.state.tSec.toFixed(2)} s`;
      const moved = Math.hypot(x.xFt - p.xFt, x.yFt - p.yFt);
      // Constant speed: each step covers its true airspeed's distance, a little less while climbing or sinking (5% allowed).
      assert.ok(moved <= tas * STEP_SEC + 1e-6 && moved >= 0.95 * tas * STEP_SEC, `${what}: moved ${moved.toFixed(1)} ft`);
      assert.ok(Math.abs(x.bankDeg - p.bankDeg) <= ROLL.maxRateDps * STEP_SEC + 1e-9, `${what}: bank jumped`);
      assert.ok(Math.abs(x.rollRateDps - p.rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${what}: roll rate jumped`);
      // A step in pitch rate is a step in G: 0.5°/s in one step is about 0.1 G (as live.test.js).
      const pitchRate = (x.pitchDeg - p.pitchDeg) / STEP_SEC;
      if (lastPitchRate) assert.ok(Math.abs(pitchRate - lastPitchRate[i]) <= 0.5, `${what}: pitch rate jumped`);
      // No vertical snap: the vertical acceleration is never more than the push's half G plus the shared 0.5 G (1 G, 32.2 ft/s²).
      assert.ok(Math.abs(x.climbFtps - p.climbFtps) / STEP_SEC <= 32.2, `${what}: climb rate jumped`);
    });
    lastPitchRate = after.map((x, i) => (x.pitchDeg - before[i].pitchDeg) / STEP_SEC);
    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        const horiz = Math.hypot(after[i].xFt - after[j].xFt, after[i].yFt - after[j].yFt);
        const vert = Math.abs(after[i].altAboveFt - after[j].altAboveFt);
        assert.ok(Math.max(horiz, vert) >= 300 - 1, `${after[i].name} and ${after[j].name}: ${horiz.toFixed(0)} ft apart, ${vert.toFixed(0)} ft vertically`);
      }
    }
  });
});

test('G-warm starts from Spread 4 only, and is a four-ship button', () => {
  const f = createFormation({ ships: 4 });
  f.press('inPlace90', 1);
  fly(f);
  assert.equal(f.press('gWarm'), 'refused', 'from a column after an in-place turn');
  assert.throws(() => createFormation().press('gWarm'));
});
