// Golden test (R9, D10, Q41): V6's Solver. V6's own Run solver handler (cut out of original/shell.html, see
// turn-sim-v6-solver.js) tries 60 values from a fixed range, flies the whole Duration for each and keeps the value
// whose ending spacing is nearest the target. This file first pins what V6 does, exact and with no tolerance, so the
// port (engine/solver.js) can be written against it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS } from '../../src/modules/turn-sim/settings.js';
import { v6Solver } from './turn-sim-v6-solver.js';

/** V6's Solver reads the boxes only, and the flight is a delayed 90 at V6's defaults (no Q47 waits or extensions). */
export const solverScenario = (over) => ({ ...V6_DEFAULTS, rearCheckAfterTurns: false, rearDelaySec: 0, durationCoversTurn: false, delayed45Check: 'none', turnDeg: 90, targetSpacingFt: 6000, ...over });

// The sweep's own ranges (V6 line 2027): G 1.2 to 6, delay -5 to 10 s, spacing 1000 to 15000 ft, 60 trials.
const RANGE = { g: [1.2, 6], delay: [-5, 10], spacing: [1000, 15000] };

test('V6 tries 60 evenly spaced values across its range, and restores the box', () => {
  for (const [mode, [lo, hi]] of Object.entries(RANGE)) {
    const r = v6Solver(solverScenario({ solveFor: mode }));
    assert.equal(r.trials.length, 60, mode);
    assert.deepEqual(r.trials.map((t) => t.value), Array.from({ length: 60 }, (_, i) => lo + (hi - lo) * i / 59), mode);
  }
});

test('V6 keeps the first trial with the least error, and prints it to 2 decimals (delay, G) or none (spacing)', () => {
  for (const mode of ['delay', 'spacing', 'g']) {
    const r = v6Solver(solverScenario({ solveFor: mode }));
    let best = { err: Infinity, val: null };
    for (const t of r.trials) {
      const err = Math.abs(t.finalFt - 6000);
      if (err < best.err) best = { err, val: t.value };
    }
    const unit = { spacing: ' ft', delay: ' sec', g: ' G' }[mode];
    assert.equal(r.html, `Best ${mode}: <b>${best.val.toFixed(mode === 'spacing' ? 0 : 2)}</b>${unit}<br>Error: ${Math.round(best.err)} ft`, mode);
  }
});

test('pinned V6 answers at the defaults: four-ship base delay, two-ship spacing, and G over a Duration that is not a whole number of steps', () => {
  assert.equal(v6Solver(solverScenario({ solveFor: 'delay' })).html, 'Best delay: <b>-5.00</b> sec<br>Error: 0 ft');
  assert.equal(v6Solver(solverScenario({ solveFor: 'spacing', formation: 'twoShip' })).html, 'Best spacing: <b>5034</b> ft<br>Error: 10 ft');
  assert.equal(v6Solver(solverScenario({ solveFor: 'g', durationSec: 47.3 })).html, 'Best g: <b>2.42</b> G<br>Error: 59 ft');
  // A trial's ending spacing, to the last digit.
  const r = v6Solver(solverScenario({ solveFor: 'spacing', formation: 'twoShip' }));
  assert.equal(r.trials[0].finalFt, 7727.285868494706);
  assert.equal(r.trials[1].finalFt, 7577.752167723804);
  assert.equal(r.trials[59].finalFt, 10833.300203236275);
});

test('V6 gives the box back: the sweep leaves each box as it found it', () => {
  assert.equal(v6Solver(solverScenario({ solveFor: 'delay' })).restored, 16);
  assert.equal(v6Solver(solverScenario({ solveFor: 'spacing' })).restored, 6000);
  assert.equal(v6Solver(solverScenario({ solveFor: 'g' })).restored, 2);
});
