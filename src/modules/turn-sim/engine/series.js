// The Spacing graph's data (Q41): the chosen pair distances, the minimum separation and the closure over a run, ready to
// draw. Ported from V6's drawGraph (original/shell.html, line 1959), which read d12, d13, d14, d34, min and closure from
// the history rows and scaled one shared axis. Pure: history rows in, plain numbers out, nothing drawn, so the screen
// calls it only while the graph is open and draws the result itself (graph.js).
//
// What differs from V6: every metric has its own colour and a label for the legend (V6's colour table was keyed by
// aircraft number, so all its lines came out white), and the six pairs of the history are all on offer, not only V6's
// four. The axis rule is V6's.
//
// Golden test: tests/golden/turn-sim-solver.test.js, against V6's own recorded history.

/**
 * The metrics on offer, in the order of the graph's checkboxes: id (a pair key of the history's `pairs`, or 'min' and
 * 'closure'), the legend's label, its unit and its colour (Okabe-Ito, which stay apart for colour-blind viewers, and
 * show on V6's dark graph background).
 */
export const GRAPH_METRICS = Object.freeze([
  { id: '1-2', label: '1-2 spacing', unit: 'ft', colour: '#e69f00' },
  { id: '1-3', label: '1-3 spacing', unit: 'ft', colour: '#56b4e9' },
  { id: '1-4', label: '1-4 spacing', unit: 'ft', colour: '#009e73' },
  { id: '3-4', label: '3-4 spacing', unit: 'ft', colour: '#f0e442' },
  { id: '2-3', label: '2-3 spacing', unit: 'ft', colour: '#d55e00' },
  { id: '2-4', label: '2-4 spacing', unit: 'ft', colour: '#cc79a7' },
  { id: 'min', label: 'minimum sep', unit: 'ft', colour: '#c9d1d9' },
  { id: 'closure', label: '1-3 closure', unit: 'ft/s', colour: '#d2a8ff' },
]);

/** What V6's graph had ticked at the start (line 615): the 1-2 and 1-3 spacing and the minimum separation. */
export const DEFAULT_GRAPH_METRICS = Object.freeze(['1-2', '1-3', 'min']);

/** The floor V6 gave the axis: at least 1,000 above, 0 below, and 1,000 below when closure is drawn (line 1964). */
const AXIS_FLOOR = 1000;

/**
 * The series for the metrics asked for, from a run's history rows (createRun's history()).
 *
 * Returns { series, tStartSec, tEndSec, axisMin, axisMax }:
 *   series   one per metric asked for, in the order asked: { id, label, unit, colour, points: [{ tSec, value }] }.
 *            A pair the run does not have (a two-ship has only 1-2) has no points, and a value that is not a finite
 *            number is left out, as V6 left it out, so a series may be empty and the screen can skip it.
 *   axis     the one axis V6 shared: the largest value or 1,000, down to the smallest or 0; with closure drawn, at least
 *            +1,000 and -1,000.
 * With fewer than 2 rows there is nothing to draw (V6 said to play the sim first): the series are empty and the axis is
 * the floor.
 *
 * @param {{ tSec: number, pairs: Record<string, number>, minSepFt: number, closure13Ftps: number }[]} rows
 * @param {readonly string[]} [metricIds]
 */
export function spacingSeries(rows, metricIds = DEFAULT_GRAPH_METRICS) {
  const chosen = metricIds.map((id) => {
    const metric = GRAPH_METRICS.find((m) => m.id === id);
    if (!metric) throw new Error(`spacingSeries: unknown metric ${id}`);
    return metric;
  });
  const valueOf = (row, id) => (id === 'min' ? row.minSepFt : id === 'closure' ? row.closure13Ftps : row.pairs[id]);
  const enough = rows.length >= 2;
  const series = chosen.map((m) => ({
    ...m,
    points: enough ? rows.flatMap((row) => { const value = valueOf(row, m.id); return Number.isFinite(value) ? [{ tSec: row.tSec, value }] : []; }) : [],
  }));
  let axisMax = AXIS_FLOOR;
  let axisMin = 0;
  for (const s of series) for (const p of s.points) { axisMax = Math.max(axisMax, p.value); axisMin = Math.min(axisMin, p.value); }
  if (chosen.some((m) => m.id === 'closure')) { axisMax = Math.max(axisMax, AXIS_FLOOR); axisMin = Math.min(axisMin, -AXIS_FLOOR); }
  return { series, tStartSec: enough ? rows[0].tSec : 0, tEndSec: enough ? rows[rows.length - 1].tSec : 0, axisMin, axisMax };
}
