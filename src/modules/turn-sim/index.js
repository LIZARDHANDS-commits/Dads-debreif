// The Formation Turn Sim (specs/SPEC-turn-sim.md): set up a formation and a
// turn, press Play, and watch it flown from above. mount() builds the screen
// and wires the settings, the engine and the picture together; everything it
// starts runs on the shell's scheduler and listeners, so the shell stops it
// all when the Turn Sim closes (R4).
//
// The engine is always stepped in fixed 0.05 s steps (Assumption 4, #17):
// playback speed changes how many steps run per frame, never their size, so
// a run comes out the same at any frame rate.
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { DEFAULT_STANDARDS } from '../../core/standards.js';
import { availableG } from '../../core/t6-performance.js';
import { DEFAULTS, SETTINGS_RULES, SETTINGS_ALLOWED, SETTINGS_VERSION } from './settings.js';
import { createRun } from './engine/run.js';
import { readoutsAt, formationRows, mapLabel, turnNumbers, TURN_DEGREES } from './readouts.js';
import { createLayout, LAYOUT_DEFAULTS } from './layout.js';
import { createTurnSimView, plannedBounds, boundsOf } from './view.js';

/** The most G a T-6 can pull at a speed (stall line, capped at +7 G), for the warning. */
const tMaxG = (kt) => availableG(kt, false);

const STYLESHEET = new URL('./turn-sim.css', import.meta.url).href;

/** V6's own step (`dt = 0.05`, line 784); the engine's STEP_SEC. */
const STEP_SEC = 0.05;
/** Most steps run in one frame, so a tab that was hidden can't freeze the page catching up. */
const MAX_STEPS_PER_FRAME = 40;
/** Readouts update at most this often while playing (SPEC-turn-sim: Performance). */
const READOUT_MS = 100;
/** The trail shows this much of the run (V6 kept 800 points; here it's by time, #17). */
const TRAIL_SEC = 60;

/** The scenario isn't remembered between visits yet (profiles are a later task), so it lives in memory. */
function memoryStore() {
  const docs = new Map();
  return { get: (name, fallback) => (docs.has(name) ? docs.get(name) : fallback), set: (name, value) => docs.set(name, value) };
}

/** Layout (open panels, layers) is remembered in this browser under one name, so it can't clash with other documents. */
function layoutStore(storage) {
  return { get: (_name, fallback) => storage.get('layout', fallback), set: (_name, value) => storage.set('layout', value) };
}

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const scenario = createSettings(memoryStore(), DEFAULTS, { allowed: SETTINGS_ALLOWED, version: SETTINGS_VERSION });
  const layout = createSettings(layoutStore(app.storage), LAYOUT_DEFAULTS);
  const controls = createControls(scenario);
  const layoutControls = createControls(layout);
  const standards = () => app.standards?.get?.() ?? DEFAULT_STANDARDS;

  const ui = createLayout({
    scenario, controls, layout, layoutControls, rules: SETTINGS_RULES, defaults: DEFAULTS, listen: app.listen, say: app.status,
  });
  root.append(ui.element);

  // ---- the run --------------------------------------------------------------
  const run = createRun(scenario.get());
  let trail = {}; // id -> [[elapsed, x, y], …], the last TRAIL_SEC of the run
  let marks = {}; // id -> [[t, x, y], …], every whole second of this leg, for breadcrumbs
  let legStart = 0; // elapsed seconds before this leg began, so a trail keeps its order across legs
  let playing = false;
  let speed = 1;
  let owed = 0; // sim seconds waiting to be turned into fixed steps
  let stopFrames = null;
  let userMoved = false; // the person moved the view, so a setup change doesn't refit it
  let lastManeuver = scenario.get().maneuver;

  const state = () => run.state; // one live object, updated in place

  function record() {
    const s = state();
    const elapsed = legStart + s.tSec;
    for (const a of s.aircraft) {
      const points = (trail[a.id] ??= []);
      points.push([elapsed, a.xFt, a.yFt]);
      let drop = 0;
      while (drop < points.length - 1 && points[drop][0] < elapsed - TRAIL_SEC) drop++;
      if (drop) points.splice(0, drop);
      if (Math.abs(s.tSec - Math.round(s.tSec)) < 1e-6) (marks[a.id] ??= []).push([Math.round(s.tSec), a.xFt, a.yFt]);
    }
  }

  // ---- the picture ------------------------------------------------------------
  const view = createTurnSimView(ui.canvas, {
    timers: app.scheduler,
    onUserMove: () => {
      userMoved = true;
    },
    source: {
      state,
      trails: () => ({ trail, marks }),
      layers: () => layout.get(),
      settings: () => scenario.get(),
      labels: () => {
        const out = {};
        for (const row of formationRows(state(), scenario.get(), standards())) {
          const label = mapLabel(row);
          if (label) out[row.id] = label;
        }
        return out;
      },
    },
  });

  /** Fits the whole planned run (start and turn) at the real canvas size (#30). */
  function fit() {
    let bounds = null;
    try {
      bounds = plannedBounds(createRun(scenario.get()));
    } catch (err) {
      console.error('The planned run could not be flown to fit the view:', err);
    }
    bounds ??= boundsOf(state().aircraft.map((a) => ({ x: a.xFt, y: a.yFt })));
    if (bounds) {
      // Room for the turn circles at the edges, so their labels aren't cut off.
      const room = turnNumbers(scenario.get()).radiusFt + 500;
      view.fit({ minX: bounds.minX - room, minY: bounds.minY - room, maxX: bounds.maxX + room, maxY: bounds.maxY + room });
    }
    userMoved = false;
  }

  // ---- readouts: at most READOUT_MS apart while playing, at once otherwise ------
  let lastReadout = -Infinity;
  let pendingReadout = null;
  function renderReadouts() {
    pendingReadout?.();
    pendingReadout = null;
    lastReadout = performance.now();
    const r = readoutsAt(state(), scenario.get(), { standards: standards(), stallLimitG: tMaxG, distNm: layout.get().distNm });
    ui.renderReadouts(r);
    ui.setGWarning(r.gWarning);
  }
  function queueReadouts() {
    const wait = READOUT_MS - (performance.now() - lastReadout);
    if (!playing || wait <= 0) renderReadouts();
    else pendingReadout ??= app.scheduler.after(wait, renderReadouts);
  }
  function refresh() {
    ui.setTime(state().tSec);
    view.requestDraw();
    queueReadouts();
  }

  // ---- playback -----------------------------------------------------------------
  function stepOnce() {
    if (!run.step()) return false;
    record();
    return true;
  }

  function onFrame(dtMs) {
    owed += (dtMs / 1000) * speed;
    let steps = 0;
    while (owed >= STEP_SEC - 1e-9 && steps < MAX_STEPS_PER_FRAME && stepOnce()) {
      owed -= STEP_SEC;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) owed = 0; // drop the backlog rather than chase it
    if (state().finished) pause();
    refresh();
  }

  /** Play after the turn has finished starts a new leg from where the aircraft are (V6, audit b#13, #31). */
  function startLegIfDue() {
    if (!state().canStartLeg) return;
    legStart += state().tSec;
    run.startLeg();
    marks = {}; // breadcrumbs start again for the new leg
    record();
  }

  function play() {
    if (playing) return;
    startLegIfDue();
    playing = true;
    owed = 0;
    ui.setPlaying(true);
    stopFrames = app.scheduler.frame(onFrame);
    refresh();
  }

  function pause() {
    stopFrames?.();
    stopFrames = null;
    if (!playing) return;
    playing = false;
    ui.setPlaying(false);
    renderReadouts(); // a readout still waiting its turn must not show a step behind the picture
  }

  function resetRun() {
    pause();
    run.reset(scenario.get());
    trail = {};
    marks = {};
    legStart = 0;
    owed = 0;
    record();
    refresh();
  }

  function stepButton() {
    pause();
    startLegIfDue();
    stepOnce();
    refresh();
  }

  ui.onPlayPause(() => (playing ? pause() : play()));
  ui.onStep(stepButton);
  ui.onResetRun(resetRun);
  ui.onSpeed((x) => {
    speed = x; // changes steps per frame only; it doesn't stop the run
  });
  ui.onFit(() => {
    fit();
    app.status('Fitted the whole turn on screen.');
  });
  ui.onResetLayout(() => {
    layout.reset();
    app.status('Layout back to the essentials.');
  });

  // Any setup change stops the run and goes back to t = 0 with the new plan (#31). Layers and speed don't.
  const stopScenario = scenario.subscribe((values) => {
    // Turn degrees follow the turn, as V6's boxes fill them in when the turn changes (line 2030).
    if (values.maneuver !== lastManeuver) {
      lastManeuver = values.maneuver;
      if (values.turnDeg !== TURN_DEGREES[values.maneuver]) {
        scenario.update({ turnDeg: TURN_DEGREES[values.maneuver] }); // comes back here, and does the reset
        return;
      }
    }
    ui.applyScenario(values);
    resetRun();
    if (!userMoved) fit();
  });
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    view.requestDraw();
    queueReadouts();
  });

  // The stylesheet decides the picture's size, so the first fit waits for it (#30).
  const ready = () => {
    view.setReady();
    fit();
  };
  if (stylesheet.sheet) ready();
  else {
    stylesheet.addEventListener('load', ready, { once: true });
    stylesheet.addEventListener('error', ready, { once: true });
  }

  // Space plays or pauses, the right arrow steps once, Home resets: only while the Turn Sim is
  // open and never while typing (app.keys). On the picture, the arrows pan instead.
  app.keys({
    Space: () => (playing ? pause() : play()),
    ArrowRight: stepButton,
    Home: resetRun,
  });

  // Edited standards change the labels at once (Q46).
  app.standards?.subscribe?.(() => {
    view.requestDraw();
    queueReadouts();
  });

  resetRun();
  ui.applyLayout(layout.get());

  return () => {
    pause();
    pendingReadout?.();
    stopScenario();
    stopLayout();
    controls.dispose();
    layoutControls.dispose();
    view.dispose();
    stylesheet.remove();
  };
}

export default { id: 'turn-sim', title: 'Formation Turn Sim', mount };
