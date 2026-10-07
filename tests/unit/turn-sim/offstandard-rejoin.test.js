// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// The hot turning rejoin from off-standard starts and the overshoot (docs/modules/turn-sim/decisions.md TS-62, spec
// section 10.5). Patrick's 4 Oct 11:50Z rule: no wording, seconds, counts or one-off values. What a pilot would recognise:
//  - a corrected ("Fix it") off-standard start ends in the formation pressed (the bands written out from the manuals);
//  - an overshooting #2 never climbs to Lead's height and passes behind him (SMM 12.27 para 65, Fig 12.18);
//  - slowing never beats what idle and the speed brake together can do (TS-61);
//  - a rejoining #2 is below Lead whenever he is inside 1,000 ft (SMM 12.27 para 65).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { slowKtps } from '../../../src/modules/turn-sim/live/slow-down.js';
import { climbCostKtps } from '../../../src/modules/turn-sim/live/pilot.js';

const DEG = Math.PI / 180;
const LENGTH_FT = 33.4; // T-6A length (SMM Fig 12.18: "one to two aircraft lengths behind")
const CATCH_SEC = 600; // "the plan finished" catch, not a timing check
// The slowing is read back from the speeds the line flies, averaged over a second; 0.5 kt/s covers that read-back
// (finite differences of a planned line), not a margin the flight code may use.
const SLOW_MARGIN_KTPS = 0.5;

const link = (ref, wing) => {
  const rel = relativeTo(ref, wing);
  const across = Math.abs(rel.left);
  return { rel, across, back: -rel.fwd, down: ref.altAboveFt - wing.altAboveFt, range: Math.hypot(rel.fwd, rel.left), sweep: Math.atan2(-rel.fwd, across) / DEG };
};
// 500-1,000 ft and 30-60° of sweep, below Lead (SMM 12.29 para 69, Fig 12.19), with the shared ±100 ft and ±5°
const inFw = (l) => l.range >= 400 && l.range <= 1100 && l.sweep >= 25 && l.sweep <= 65 && l.down > 0;
// about 45 ft out, 25 ft back, 5 ft down, the 2-ship spec table's own margins (estimates)
const inEchelon = (l) => Math.abs(l.across - 45) <= 15 && Math.abs(l.back - 25) <= 15 && Math.abs(l.down - 5) <= 10;

/** Flies the press to its end; returns what a pilot would watch: overshoot passes, slowing, height and snaps. */
function flyRejoin(errors, to) {
  const f = createFormation(errors);
  const side = Math.sign(relativeTo(f.state.aircraft[0], f.state.aircraft[1]).left);
  assert.equal(f.change(to, { side: 'keep', rejoin: 'into' }), 'started', `${JSON.stringify(errors)} to ${to}`);
  const what = `${JSON.stringify(errors)} to ${to}`;
  const t0 = f.state.tSec;
  const kias = [];
  let before = f.state.aircraft.map((a) => ({ ...a }));
  let overshot = false;
  let lastLeft = null;
  while (f.state.current || f.state.queued) {
    f.step();
    const [lead, wing] = f.state.aircraft;
    const t = f.state.tSec - t0;
    const l = link(lead, wing);
    assert.ok(Math.abs(wing.rollRateDps - before[1].rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${what}: #2's roll rate jumped at ${t.toFixed(1)} s`);
    if (l.range < 1000) assert.ok(l.down > 0, `${what}: #2 at or above Lead's height inside 1,000 ft at ${t.toFixed(1)} s`);
    if (wing.overshooting) {
      overshot = true;
      // Never climbs to Lead's height while overshooting, and crosses Lead's track behind him, not ahead.
      assert.ok(l.down > 0, `${what}: overshooting #2 at or above Lead's height at ${t.toFixed(1)} s`);
      if (lastLeft !== null && Math.sign(l.rel.left) !== Math.sign(lastLeft)) {
        assert.ok(l.rel.fwd <= -LENGTH_FT, `${what}: overshooting #2 crossed only ${(-l.rel.fwd).toFixed(0)} ft behind Lead`);
      }
      lastLeft = l.rel.left;
    }
    kias.push(wing.kias);
    const n = kias.length;
    const sec = Math.round(1 / STEP_SEC);
    if (n > sec) {
      const ktps = (kias[n - 1] - kias[n - 1 - sec]) / (sec * STEP_SEC);
      if (ktps < 0) {
        const maxSlow = (wing.slowStage || wing.power?.stage || Math.abs(wing.bankDeg) > 30)
          ? 16
          : (slowKtps('idleBoards', wing.kias, 8000, wing.g) + climbCostKtps(wing, Math.max(0, wing.climbFtps ?? 0)) + SLOW_MARGIN_KTPS);
        assert.ok(-ktps <= maxSlow, `${what}: slowing at ${(-ktps).toFixed(2)} kt/s at ${t.toFixed(1)} s, more than ${maxSlow.toFixed(2)} kt/s`);
      }
    }
    before = f.state.aircraft.map((a) => ({ ...a }));
    assert.ok(t <= CATCH_SEC, `${what}: the plan finished`);
  }
  const [lead, wing] = f.state.aircraft;
  return { f, side, overshot, end: link(lead, wing) };
}

test('a corrected off-standard start ends in the formation pressed, below Lead, never slowing harder than idle and the boards', () => {
  for (const [errors, to] of [
    [{ errSpeed: 'fast', errResponse: 'fix' }, 'echelon'],
    [{ errFore: 'behind', errResponse: 'fix' }, 'fw'],
    [{ errHeight: 'high', errResponse: 'fix' }, 'echelon'],
  ]) {
    const { f, end } = flyRejoin(errors, to);
    assert.ok(to === 'fw' ? inFw(end) : inEchelon(end), `${JSON.stringify(errors)} ends in ${to}`);
    assert.ok(f.state.errorOutcome, `${JSON.stringify(errors)}: the card says how #2 dealt with the start`);
  }
});
