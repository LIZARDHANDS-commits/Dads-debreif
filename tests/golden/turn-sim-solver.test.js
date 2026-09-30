// Golden test (R9, D10, Q41): V6's Solver. V6's own Run solver handler (cut out of original/shell.html, see
// turn-sim-v6-solver.js) tries 60 values from a fixed range, flies the whole Duration for each and keeps the value
// whose ending spacing is nearest the target. This file first pins what V6 does, exact and with no tolerance, so the
// port (engine/solver.js) can be written against it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../src/modules/turn-sim/settings.js';
import { createRun } from '../../src/modules/turn-sim/engine/run.js';
import { solveSpacing, trialRun } from '../../src/modules/turn-sim/engine/solver.js';
import { v6Solver } from './turn-sim-v6-solver.js';
import { v6SettingsForD42, v6SettingsForD48 } from './turn-sim-fake-page.js';

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

// ---- The port (engine/solver.js) against V6 ----
// V6's flight is the port's except where a decision changed it (D41 toward and away, D42 and D48 sides); the scenarios
// here are the ones the run test compares step by step, with V6 given the same swaps.
const forV6 = (settings) => {
  const out = v6SettingsForD42(v6SettingsForD48(settings));
  for (const id of [1, 2, 3, 4]) {
    const key = aircraftKey(id, 'turnLogic');
    out[key] = { toward: 'away', away: 'toward' }[settings[key]] ?? settings[key];
  }
  return out;
};

const CASES = [
  { formation: 'weighted', maneuver: 'delayed90away', direction: 'right' },
  { formation: 'weightedReverse', maneuver: 'delayed90away', direction: 'left' },
  { formation: 'twoShip', maneuver: 'delayed90away', direction: 'right' },
  { formation: 'weighted', maneuver: 'inplace90', direction: 'left' },
  { formation: 'offsetBox', maneuver: 'hook90', direction: 'right', turnDeg: 180 },
  { formation: 'weighted', maneuver: 'delayed90away', direction: 'right', durationSec: 47.3, speedKt: 250, baseG: 3 },
];

test('the port solves like V6: every trial, the pick and the readout, exact, for delay, spacing and G', () => {
  for (const [i, c] of CASES.entries()) {
    for (const [mode, target] of [['delay', 6000], ['spacing', 4500], ['g', 8000]]) {
      const settings = solverScenario({ ...c, solveFor: mode, targetSpacingFt: target });
      const label = `case ${i} ${JSON.stringify(c)} ${mode}`;
      const v6 = v6Solver(forV6(settings));
      const port = solveSpacing(settings);
      assert.equal(port.trials.length, 60, label);
      assert.deepEqual(port.trials.map((t) => [t.value, t.endingFt]), v6.trials.map((t) => [t.value, t.finalFt]), label);
      assert.equal(`Best ${mode}: <b>${port.valueText}</b>${port.unit}<br>Error: ${port.errText} ft`, v6.html, label);
    }
  }
});

test('the mode and the target can be given, and default to the Solver card\'s settings', () => {
  const settings = solverScenario({ solveFor: 'g', targetSpacingFt: 8000 });
  const a = solveSpacing(settings);
  const b = solveSpacing({ ...settings, solveFor: 'delay', targetSpacingFt: 1 }, { mode: 'g', targetFt: 8000 });
  assert.deepEqual(a, b);
  assert.equal(a.mode, 'g');
  assert.equal(a.targetFt, 8000);
  assert.throws(() => solveSpacing(settings, { mode: 'nope' }));
});

test('the port\'s own readout says the spacing is scored at the Duration; V6\'s string stays what the golden pins', () => {
  const r = solveSpacing(solverScenario({ solveFor: 'delay', durationSec: 47.3, targetSpacingFt: 5000 }));
  assert.equal(r.scoredAtSec, 47.3);
  assert.equal(r.readout, `Best delay: ${r.valueText} sec. Error: ${r.errText} ft from 5000 ft, scored at Duration (47.3 s)`);
  assert.ok(!r.readout.includes('<'), 'plain text, no markup');
  // V6's string is still what valueText, unit and errText make.
  assert.equal(`Best delay: <b>${r.valueText}</b>${r.unit}<br>Error: ${r.errText} ft`, v6Solver(solverScenario({ solveFor: 'delay', durationSec: 47.3, targetSpacingFt: 5000 })).html);
});

// Under Timing = auto the port works the auto step out afresh for every trial (D44: spacing / speed x cot(half the turn)).
// V6 read stale page state there (computeAutoDelay is not called by its sweep), so V6 is not the reference: these tests
// say what the port does. See the spec's list of where it differs from V6.
const endingSpacing = (run, steps) => {
  for (let k = 0; k < steps; k++) run.step();
  const at = (id) => run.state.aircraft.find((a) => a.id === id);
  const other = run.state.aircraft.length === 2 ? at(2) : at(3);
  return Math.hypot(at(1).xFt - other.xFt, at(1).yFt - other.yFt);
};

test('auto timing, solving for the delay: the base delay is not used, so all 60 trials are identical', () => {
  for (const formation of ['weighted', 'twoShip']) {
    const r = solveSpacing(solverScenario({ solveFor: 'delay', timing: 'auto', formation }));
    assert.equal(new Set(r.trials.map((t) => t.endingFt)).size, 1, formation);
    assert.equal(r.value, -5, 'the first of equal trials wins');
  }
});

test('auto timing, solving for the spacing: each trial is a run at that spacing with its own auto step', () => {
  const settings = solverScenario({ solveFor: 'spacing', timing: 'auto', formation: 'weighted' });
  const r = solveSpacing(settings);
  const steps = +settings.durationSec / 0.05;
  const autoSteps = [];
  for (const i of [0, 1, 17, 30, 59]) {
    const t = r.trials[i];
    const run = createRun({ ...settings, spacingFt: t.value, durationCoversTurn: false });
    autoSteps.push(run.state.autoStepSec);
    assert.equal(t.endingFt, endingSpacing(run, steps), `trial ${i}`);
  }
  assert.ok(autoSteps.every(Number.isFinite) && new Set(autoSteps).size === autoSteps.length, 'the auto step follows the trial\'s spacing');
});

test('a trial run has no crossings preview: reading state.crossings never flies a copy of a 1e9 s run', () => {
  const run = trialRun(solverScenario({}), 'baseDelaySec', 3);
  assert.deepEqual(run.state.crossings, []);
  assert.deepEqual(run.state.closePasses, []);
});

test('the solver leaves the settings alone', () => {
  const settings = Object.freeze(solverScenario({ solveFor: 'delay' }));
  const copy = { ...settings };
  solveSpacing(settings);
  assert.deepEqual({ ...settings }, copy);
});
