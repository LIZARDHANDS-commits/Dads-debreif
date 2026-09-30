// V6's own Solver (Q41), run in Node. Its `Run solver` click handler (original/shell.html, `$('solve').onclick`) is
// cut out of the source unchanged and run against the fake page of turn-sim-fake-page.js; only what it calls is
// stubbed: `resetFormation` is the fake page's numeric reset, and it also notes where each trial ended, because V6
// keeps only the best error and the golden tests want every trial.
import { v6Page } from './v6-source.js';
import { createV6Page, TURN_SIM_MARKER } from './turn-sim-fake-page.js';

const BOX = { delay: 'baseDelay', spacing: 'spacing', g: 'gload' };

/** The handler's own text, from `$('solve').onclick=` to the next function. */
function solveHandlerText() {
  const src = v6Page('shell');
  const from = src.indexOf("$('solve').onclick=", src.indexOf(TURN_SIM_MARKER));
  if (from < 0) throw new Error("V6's solver handler not found");
  return src.slice(from, src.indexOf('\nfunction updateManeuverDefaults', from));
}

/**
 * Clicks V6's Run solver with `settings` (V6 settings; solveFor and targetSpacingFt are the Solver card's boxes).
 * Returns what V6 wrote: `html` (the readout), and per trial the value put in the box and the distance at the end
 * of that trial's run (Lead to #2 in a two-ship, Lead to #3 otherwise).
 */
export function v6Solver(settings) {
  const page = createV6Page(settings, { readsClockTolerance: true });
  page.reset();
  const mode = settings.solveFor;
  const ac = page.aircraft();
  const two = () => page.v6.isTwoShip();
  const finalFt = () => page.v6.dist(ac[0], two() ? ac[1] : ac[2]);

  // The box being solved for notes every value written to it.
  const writes = [];
  const box = page.$(BOX[mode]);
  let held = box.value;
  Object.defineProperty(box, 'value', { get: () => held, set: (v) => { writes.push(v); held = v; } });

  const finals = [];
  const solverOut = { innerHTML: '' };
  const solve = {};
  const extra = { solverOut, solve };
  const $ = (id) => extra[id] ?? page.$(id);
  const resetFormation = () => { finals.push(finalFt()); page.reset(); };
  new Function('$', 'ac', 'dt', 'hist', 'resetFormation', 'setupTurnStarts', 'recordHist', 'stepSim', 'isTwoShip', 'dist', solveHandlerText())(
    $, ac, 0.05, [], resetFormation, page.v6.setupTurnStarts, page.v6.recordHist, page.v6.stepSim, page.v6.isTwoShip, page.v6.dist,
  );
  solve.onclick();

  // finals[0] is the reset before the first trial; the last write restores the box.
  const trials = writes.slice(0, 60).map((value, i) => ({ value, finalFt: finals[i + 1] }));
  return { html: solverOut.innerHTML, trials, restored: held };
}
