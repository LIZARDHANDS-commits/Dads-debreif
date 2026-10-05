// The off-standard hot rejoin held to what the aircraft can do, and the overshoot only from the decision point
// (docs/modules/turn-sim/decisions.md TS-63). What a pilot would recognise (Patrick 4 Oct 11:50Z, "no dumb tests"):
//  - #2 never speeds up faster than full power gives at that speed, height and G (core excess thrust, standard
//    aerodynamics: dV/dt = g ((T - D) / W - sin climb));
//  - a fast start that power, the boards and idle can fix ends in the formation pressed with no overshoot (Patrick 23:29Z;
//    EFIG p.374: 10-20 KIAS of overtake is normal);
//  - an overshooting #2 is never at full power and never at or above Lead's height (SMM 12.27 para 65, Fig 12.18).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { fullPowerKtps } from '../../../src/modules/turn-sim/live/slow-down.js';
import { powerWord } from '../../../src/modules/turn-sim/live/power.js';

const G = 32.174;
const BLOCK_FT = 8000;
const CATCH_SEC = 600; // "the plan finished" catch, not a timing check
// The speed-up is read back from the speeds flown, over one second; 0.3 kt/s covers that read-back where the G changes
// (finite differences of a planned line), not a margin the flight code may use.
const READ_BACK_KTPS = 0.3;

function fly(errors, to) {
  const f = createFormation(errors);
  const what = `${JSON.stringify(errors)} to ${to}`;
  assert.equal(f.change(to, { side: 'keep', rejoin: 'into' }), 'started', what);
  const t0 = f.state.tSec;
  const hist = [];
  let overshot = false;
  const sec = Math.round(1 / STEP_SEC);
  while (f.state.current || f.state.queued) {
    f.step();
    const [lead, wing] = f.state.aircraft;
    const t = f.state.tSec - t0;
    hist.push({ kias: wing.kias, climb: wing.climbFtps ?? 0, tas: wing.tasFtps, g: wing.g ?? 1, alt: wing.altAboveFt });
    const n = hist.length;
    if (n > sec) {
      const m = hist[n - 1 - sec / 2];
      const need = hist[n - 1].kias - hist[n - 1 - sec].kias + ((G * m.climb) / m.tas) * (m.kias / m.tas);
      const full = fullPowerKtps(m.kias, BLOCK_FT + m.alt, m.g);
      assert.ok(need <= full + READ_BACK_KTPS, `${what}: speeding up at ${need.toFixed(2)} kt/s at ${t.toFixed(1)} s, more than full power's ${full.toFixed(2)}`);
    }
    if (wing.overshooting) {
      overshot = true;
      assert.notEqual(powerWord(wing.power)?.text, 'MAX', `${what}: overshooting at full power at ${t.toFixed(1)} s`);
      assert.ok(wing.altAboveFt < lead.altAboveFt, `${what}: overshooting #2 at or above Lead's height at ${t.toFixed(1)} s`);
    }
    assert.ok(t <= CATCH_SEC, `${what}: the plan finished`);
  }
  const [lead, wing] = f.state.aircraft;
  return { overshot, rel: relativeTo(lead, wing), down: lead.altAboveFt - wing.altAboveFt };
}

test('a fast start that power, the boards and idle can fix ends in echelon with no overshoot, never beating full power', () => {
  const { overshot, rel, down } = fly({ errSpeed: 'fast', errResponse: 'fix' }, 'echelon');
  assert.equal(overshot, false, 'no overshoot from a fixable fast start');
  // about 45 ft out, 25 ft back, 5 ft down, the 2-ship spec table's own margins (estimates), as offstandard-rejoin.test.js
  assert.ok(Math.abs(Math.abs(rel.left) - 45) <= 15 && Math.abs(-rel.fwd - 25) <= 15 && Math.abs(down - 5) <= 10, 'ends in echelon');
});

test('a fast start flown at the normal reference never beats full power and never overshoots at full power', () => {
  fly({ errSpeed: 'fast', errResponse: 'reference' }, 'fw');
});
