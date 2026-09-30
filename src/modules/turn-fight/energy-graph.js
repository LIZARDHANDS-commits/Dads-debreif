// The Energy side view (SPEC-turn-fight, "Energy mode", "The screen"): altitude against time for both aircraft, with the
// hard deck as a dashed line for reference. It is a time-series graph, so it is drawn with uPlot (D137), which is loaded
// only here, by dynamic import, when Energy is on and 2D shows: never on the home screen and never in a simple fight.
// The graph has a text alternative for screen readers (energy-readouts.js altitudeSummary and altitudeRows, shown by
// layout.js), because a picture alone is no use to them.
//
// Like the other views it only READS the run ({ fight, trails }) and changes nothing. `update()` is called at the
// readouts' rate (at most ten times a second while playing), never every frame.
import { COLORS } from './view.js';

/**
 * uPlot's own stylesheet (its layout rules: the canvas and axes are positioned by it). Added when the graph first starts and
 * removed when the module closes. A small file, so the build may put it in the script as a data address; either way it
 * is a link.
 */
export const UPLOT_STYLESHEET = new URL('../../../node_modules/uplot/dist/uPlot.min.css', import.meta.url).href;

/** The graph never shows less than this much time, so the first seconds are not stretched across the whole box. */
export const MIN_TIME_SPAN_SEC = 30;
/** Height margin above and below the lines, in feet. */
export const HEIGHT_MARGIN_FT = 500;

/** How the deck line and axes are drawn. The two fight colours are V6's (view.js COLORS). */
const DECK_COLOR = COLORS.nose;
/** @type {{ text: string, grid: string }} */
const FALLBACK = { text: '#9bb8c6', grid: '#213040' };

/** Fetches uPlot when the graph first starts, and caches it (an import() is cached by the browser anyway). */
export async function loadUplot() {
  const module = await import('uplot');
  return module.default ?? module;
}

/**
 * The graph's data as uPlot wants it: [times (s), Blue's altitude, Red's altitude, the hard deck], each an array as long
 * as the times. From the trails (a point every 0.1 s), and the fight's own present moment so the lines end at the
 * aircraft. Never empty: a new run has its T+0 point. While the fight is younger than MIN_TIME_SPAN_SEC one more point,
 * for the deck only (the aircraft's are null there), stretches the dashed deck line across the whole time axis, so it
 * shows from the first moment.
 */
export function altitudeData(run) {
  const { fight, trails } = run;
  const n = Math.min(trails.blue.length, trails.red.length);
  const times = new Array(n);
  const blue = new Array(n);
  const red = new Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = trails.blue[i].timeSec;
    blue[i] = trails.blue[i].zFt;
    red[i] = trails.red[i].zFt;
  }
  if (!n || fight.timeSec > times[n - 1] + 1e-9) {
    times.push(fight.timeSec);
    blue.push(fight.blue.altFt);
    red.push(fight.red.altFt);
  }
  if (times[times.length - 1] < MIN_TIME_SPAN_SEC) {
    times.push(MIN_TIME_SPAN_SEC);
    blue.push(null);
    red.push(null);
  }
  return [times, blue, red, times.map(() => fight.setup.hardDeckFt)];
}

/** The height axis range: from a little under the lowest of the lines and the deck to a little over the highest. */
export function heightRange(min, max) {
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : lo + 1000;
  return [Math.max(0, lo - HEIGHT_MARGIN_FT), Math.max(hi, lo + 1000) + HEIGHT_MARGIN_FT];
}

/** The time axis range: from 0 to the fight so far, at least MIN_TIME_SPAN_SEC. */
export function timeRange(max) {
  return [0, Math.max(MIN_TIME_SPAN_SEC, Number.isFinite(max) ? max : 0)];
}

/** The steps between the altitude axis's labelled ticks, in feet, from a level fight's 100 to a climb through 25,000. */
export const HEIGHT_TICK_STEPS_FT = Object.freeze([100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]);

/** A dot at each aircraft's point while it has only one (the first moment, T+0), and none once there is a line. */
function startDot(color) {
  return {
    show: (u, seriesIndex) => u.data[seriesIndex].filter((value) => value !== null && value !== undefined).length < 2,
    size: 7,
    fill: color,
    stroke: color,
  };
}

/** uPlot's options for a box of `size` pixels; `colors` are the text and grid colours read from the page. */
export function graphOptions(size, colors = FALLBACK) {
  const axis = (label, values, extra = {}) => ({
    stroke: colors.text,
    label,
    labelSize: 16,
    font: '11px system-ui, sans-serif',
    labelFont: '11px system-ui, sans-serif',
    grid: { stroke: colors.grid, width: 1 },
    ticks: { stroke: colors.grid, width: 1 },
    values,
    ...extra,
  });
  return {
    width: size.width,
    height: size.height,
    // No legend of its own (the page's is plain words), no hover cursor and no drag zoom: a picture to read, not to work.
    legend: { show: false },
    cursor: { show: false },
    select: { show: false },
    scales: {
      x: { time: false, range: (u, min, max) => timeRange(max) },
      y: { range: (u, min, max) => heightRange(min, max) },
    },
    axes: [
      axis('Time (s)', (u, ticks) => ticks.map((t) => String(t))),
      // A tick every 24 px or so, at round numbers, so a short box still has several labels (a level fight, 500 ft of range, is 100 ft apart).
      axis('Altitude (ft)', (u, ticks) => ticks.map((t) => Math.round(t).toLocaleString('en-US')), { size: 56, space: 24, incrs: HEIGHT_TICK_STEPS_FT }),
    ],
    series: [
      {},
      // Blue is drawn wider and under Red, so where the two fly together Blue's outline shows round Red's line, and each
      // shows a dot while it has a single point (T+0).
      { label: 'Blue', stroke: COLORS.blue, width: 4, points: startDot(COLORS.blue) },
      { label: 'Red', stroke: COLORS.red, width: 2, points: startDot(COLORS.red) },
      { label: 'Hard deck', stroke: DECK_COLOR, width: 1, dash: [6, 4], points: { show: false } },
    ],
  };
}

/**
 * The graph in `host` (a box the page gives a height). `run()` gives the run to draw now.
 * load: how uPlot is fetched (loadUplot; a test gives its own). win: for tests (ResizeObserver, getComputedStyle).
 * start() loads uPlot the first time and draws; stop() frees the chart (Energy off, or 3D showing); update() puts the run's
 * latest numbers in; dispose() is for the module closing. `stats()` says whether it is drawn, for tests.
 */
export function createAltitudeGraph(host, { run, load = loadUplot, win = globalThis, stylesheet = UPLOT_STYLESHEET }) {
  const doc = host.ownerDocument;
  let chart = null;
  let link = null;
  let resizer = null;
  let generation = 0; // a late load cannot undo a later stop
  let disposed = false;
  let drawn = 0;

  const colors = () => {
    const style = win.getComputedStyle?.(host);
    return {
      text: style?.getPropertyValue('--text-muted').trim() || FALLBACK.text,
      grid: style?.getPropertyValue('--border').trim() || FALLBACK.grid,
    };
  };
  const size = () => ({ width: Math.floor(host.clientWidth), height: Math.floor(host.clientHeight) });

  function resize() {
    const box = size();
    if (chart && box.width > 0 && box.height > 0) chart.setSize(box);
  }

  function update() {
    if (!chart || disposed) return;
    chart.setData(altitudeData(run()));
    drawn++;
    host.dataset.draws = String(drawn);
  }

  function freeChart() {
    resizer?.disconnect();
    resizer = null;
    chart?.destroy();
    chart = null;
    host.replaceChildren();
    delete host.dataset.draws;
    drawn = 0;
  }

  return {
    /** Loads uPlot (once) and draws the graph. Resolves { ok: true }, or { ok: false, reason: 'load' | 'closed' }. */
    async start() {
      if (disposed) return { ok: false, reason: 'closed' };
      if (chart) return { ok: true };
      const mine = ++generation;
      let UPlot;
      try {
        UPlot = await load();
      } catch (err) {
        console.warn('The graph library could not be loaded:', err);
        return { ok: false, reason: mine === generation ? 'load' : 'closed' };
      }
      if (mine !== generation || disposed) return { ok: false, reason: 'closed' };
      if (!link && stylesheet) {
        link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = stylesheet;
        doc.head.append(link);
      }
      const box = size();
      chart = new UPlot(graphOptions({ width: Math.max(1, box.width), height: Math.max(1, box.height) }, colors()), altitudeData(run()), host);
      drawn = 1;
      host.dataset.draws = '1';
      if (win.ResizeObserver) {
        resizer = new win.ResizeObserver(() => resize());
        resizer.observe(host);
      }
      resize();
      return { ok: true };
    },
    /** Frees the chart and stops watching the box; start() draws it again. */
    stop() {
      generation++;
      freeChart();
    },
    update,
    stats: () => ({ active: Boolean(chart), drawn }),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      freeChart();
      link?.remove();
      link = null;
    },
  };
}
