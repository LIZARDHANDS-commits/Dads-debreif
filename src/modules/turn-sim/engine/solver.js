// The Solver (Q41): finds the base delay, the starting spacing or the G that gives a target spacing at the end of the
// run. Ported from V6's Run solver (original/shell.html, `$('solve').onclick`, line 2025), and pinned to it by
// tests/golden/turn-sim-solver.test.js, exact and with no tolerance.
//
// V6's method, kept as it was: 60 trial values spread evenly over a fixed range for the thing being solved for; each
// is flown for the whole Duration with everything else as set; the trial whose ending spacing is nearest the target
// wins, the first of equals. The ending spacing is Lead to #2 in a two-ship and Lead to #3 otherwise (V6 line 2026).
// It is a sweep, so its answer is as fine as the range allows (G to about 0.08, delay to 0.25 s, spacing to 240 ft).
//
// PURE and on demand: nothing runs until solveSpacing is called, nothing is drawn and no state is kept, so a screen
// that calls it only when the Solver's button is pressed spends nothing otherwise. It flies 60 whole runs (about
// 70,000 steps at the default Duration), so the screen should call it from a button and not from a frame.
import { createRun } from './run.js';
import { STEP_SEC } from './step.js';

/** What can be solved for: the settings key it changes, V6's range (lo to hi) and how V6 printed the answer. */
export const SOLVER_MODES = Object.freeze({
  delay: { key: 'baseDelaySec', lo: -5, hi: 10, digits: 2, unit: ' sec' },
  spacing: { key: 'spacingFt', lo: 1000, hi: 15000, digits: 0, unit: ' ft' },
  g: { key: 'baseG', lo: 1.2, hi: 6, digits: 2, unit: ' G' },
});

/** How many values the sweep tries (V6 line 2027). */
export const SOLVER_TRIALS = 60;

/**
 * The spacing a run ends with, in feet: Lead to #2 in a two-ship, Lead to #3 otherwise (V6 line 2026).
 * @param {{ aircraft: { id: number, xFt: number, yFt: number }[] }} state
 */
function endingSpacingFt(state) {
  const lead = state.aircraft.find((a) => a.id === 1);
  const other = state.aircraft.find((a) => a.id === (state.aircraft.length === 2 ? 2 : 3));
  return Math.hypot(lead.xFt - other.xFt, lead.yFt - other.yFt);
}

/**
 * The run of one trial, not yet stepped. V6 flew exactly Duration / step steps and the Duration never grew to cover the
 * turn, so the run is told not to stop or extend (the steps are counted by the caller). It has no crossings preview
 * (noPreview): that preview flies a whole copy of the run, which with this Duration would never end.
 */
export function trialRun(settings, key, value) {
  return createRun({ ...settings, [key]: value, durationCoversTurn: false, durationSec: 1e9 }, { noPreview: true });
}

/** One trial: the whole Duration flown with `value` in place of the setting, and the spacing it ends with. */
function trialEndingFt(settings, key, value) {
  const run = trialRun(settings, key, value);
  const steps = +settings.durationSec / STEP_SEC;
  for (let k = 0; k < steps; k++) run.step();
  return endingSpacingFt(run.state);
}

/**
 * Runs the sweep.
 *
 * `settings` is a Turn Sim settings object (settings.js). Options: `mode` ('delay', 'spacing' or 'g'; default
 * settings.solveFor) and `targetFt` (default settings.targetSpacingFt). Under Timing = auto the base delay is not used
 * (the auto step is worked out from the spacing), so a delay answer then changes nothing.
 *
 * Returns { mode, targetFt, value, errFt, unit, valueText, errText, trials } where value is the best trial's value in the
 * unit of the mode (seconds, feet or G), errFt is how far its ending spacing is from the target, valueText and errText are
 * V6's readout (value to 2 decimals, or none for feet; error rounded to a foot), scoredAtSec is the Duration the ending
 * spacing is read at (as in V6, the spacing at the end of the run, not at the turn's rollout), readout is the plain-text
 * line for the screen that says so ("... scored at Duration (75 s)"; V6's own wording said only "Error"), and trials is
 * every trial { value, endingFt, errFt } in the order tried.
 *
 * @param {Record<string, any>} settings
 * @param {{ mode?: 'delay' | 'spacing' | 'g', targetFt?: number }} [options]
 */
export function solveSpacing(settings, options = {}) {
  const mode = options.mode ?? settings.solveFor;
  const spec = SOLVER_MODES[mode];
  if (!spec) throw new Error(`solveSpacing: unknown mode ${mode}`);
  const targetFt = options.targetFt ?? settings.targetSpacingFt;
  const trials = [];
  let best = { errFt: Infinity, value: null };
  for (let i = 0; i < SOLVER_TRIALS; i++) {
    const value = spec.lo + (spec.hi - spec.lo) * i / (SOLVER_TRIALS - 1);
    const endingFt = trialEndingFt(settings, spec.key, value);
    const errFt = Math.abs(endingFt - targetFt);
    trials.push({ value, endingFt, errFt });
    if (errFt < best.errFt) best = { errFt, value };
  }
  return {
    mode,
    targetFt,
    value: best.value,
    errFt: best.errFt,
    unit: spec.unit,
    valueText: best.value.toFixed(spec.digits),
    errText: String(Math.round(best.errFt)),
    scoredAtSec: +settings.durationSec,
    readout: `Best ${mode}: ${best.value.toFixed(spec.digits)}${spec.unit}. Error: ${Math.round(best.errFt)} ft from ${targetFt} ft, scored at Duration (${+settings.durationSec} s)`,
    trials,
  };
}
