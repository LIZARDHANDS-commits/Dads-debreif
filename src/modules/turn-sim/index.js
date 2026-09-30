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
import { DEFAULTS, SETTINGS_RULES, SETTINGS_ALLOWED, SETTINGS_VERSION, MANEUVER_TURN_DEG, turnProblem, migrateSettings } from './settings.js';
import { createRun } from './engine/run.js';
import { readoutsAt, formationRows, mapLabel, turnNumbers } from './readouts.js';
import { createLayout, LAYOUT_DEFAULTS, LAYOUT_ALLOWED, SHIP_COLORS } from './layout.js';
import { createTurnSimView, plannedBounds, boundsOf } from './view.js';
import { createView3d, turnSign } from './view3d.js';

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

  const scenario = createSettings(memoryStore(), DEFAULTS, { allowed: SETTINGS_ALLOWED, version: SETTINGS_VERSION, migrate: migrateSettings });
  const layout = createSettings(layoutStore(app.storage), LAYOUT_DEFAULTS, { allowed: LAYOUT_ALLOWED });
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
  let bankSigns = {}; // id -> +1 for a left turn, -1 for a right turn, as the aircraft last turned (3D banks the right way)
  let lastHeading = {}; // id -> heading at the previous step
  let marks = {}; // id -> [[t, x, y], …], every whole second of this leg, for breadcrumbs
  let legStart = 0; // elapsed seconds before this leg began, so a trail keeps its order across legs
  let playing = false;
  let speed = 1;
  let owed = 0; // sim seconds waiting to be turned into fixed steps
  let stopFrames = null;
  let userMoved = false; // the person moved the view, so a setup change doesn't refit it
  let lastManeuver = scenario.get().maneuver;
  let lastFormation = scenario.get().formation;
  const TURN_SWITCHED_NOTE = 'Shackle and Cross turn are two-ship only, so this is now a Delayed 90.';
  let wantView = '2d'; // the view the person asked for last

  const state = () => run.state; // one live object, updated in place

  function record() {
    const s = state();
    const elapsed = legStart + s.tSec;
    for (const a of s.aircraft) {
      if (a.id in lastHeading) {
        const sign = turnSign(lastHeading[a.id], a.headingRad);
        if (sign) bankSigns[a.id] = sign;
      }
      lastHeading[a.id] = a.headingRad;
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

  // ---- the 3D picture: made now, but three.js loads only when 3D is first switched on ----
  /** Before an aircraft has visibly turned, its bank leans the way the Turn direction says. */
  const directionSigns = () => {
    const sign = scenario.get().direction === 'left' ? 1 : -1;
    return { 1: sign, 2: sign, 3: sign, 4: sign };
  };
  const view3d = createView3d(ui.canvas3d, {
    timers: app.scheduler,
    onUserMove: () => {
      userMoved = true;
    },
    source: {
      state,
      trails: () => ({ trail }),
      layers: () => layout.get(),
      paint: () => layout.get().paint,
      bankSigns: () => ({ ...directionSigns(), ...bankSigns }),
      colors: SHIP_COLORS,
    },
  });
  let shown = '2d'; // the picture on screen; the setting is what the person asked for
  let keepNote = false;
  let switching = 0; // counts switches, so a late three.js load can't undo a later choice

  /** Whichever picture is showing draws; the other one does nothing (no frames while hidden). */
  const redraw = () => (shown === '3d' ? view3d.requestDraw() : view.requestDraw());

  async function applyView(want) {
    const turn = ++switching;
    if (want !== '3d') {
      shown = '2d';
      view3d.hide();
      ui.showView('2d');
      if (!keepNote) ui.setNote('');
      view.requestDraw();
      return;
    }
    ui.setNote('Loading 3D…');
    const result = await view3d.show();
    if (turn !== switching) {
      if (wantView !== '3d') view3d.hide(); // switched away while three.js was loading: it must not stay showing
      return;
    }
    if (!result.ok) {
      if (result.reason === 'closed') return;
      ui.setNote('3D needs a connection the first time.'); // one message for a failed load and for no WebGL
      keepNote = true;
      layout.update({ view: '2d' }); // comes back here as a switch to 2D, which keeps the note
      keepNote = false;
      return;
    }
    ui.setNote('');
    shown = '3d';
    ui.showView('3d');
    view3d.requestDraw();
  }

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
      const padded = { minX: bounds.minX - room, minY: bounds.minY - room, maxX: bounds.maxX + room, maxY: bounds.maxY + room };
      view.fit(padded);
      view3d.fit(padded, state().aircraft.find((a) => a.id === 1)?.headingRad ?? 0); // behind Lead
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
    redraw();
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
    ui.setLegHeading(state().startHeadingDeg); // V6 wrote Lead's heading into its Start heading box; here it is shown, never written back
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
    bankSigns = {};
    lastHeading = {};
    legStart = 0;
    ui.setLegHeading(null);
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
    // Picking a four-ship formation while Shackle or Cross turn is chosen moves the menu to the default turn for good
    // (the stored setting too), and says so, rather than keeping a turn the formation cannot fly.
    if (turnProblem(values.formation, values.maneuver)) {
      lastManeuver = DEFAULTS.maneuver;
      lastFormation = values.formation;
      ui.setTurnSwitched(TURN_SWITCHED_NOTE);
      scenario.update({ maneuver: DEFAULTS.maneuver, turnDeg: MANEUVER_TURN_DEG[DEFAULTS.maneuver] }); // comes back here
      return;
    }
    if (values.formation !== lastFormation || values.maneuver !== lastManeuver) ui.setTurnSwitched(null);
    lastFormation = values.formation;
    // Turn degrees follow the turn, as V6's boxes fill them in when the turn changes (line 2030).
    if (values.maneuver !== lastManeuver) {
      lastManeuver = values.maneuver;
      if (values.turnDeg !== MANEUVER_TURN_DEG[values.maneuver]) {
        scenario.update({ turnDeg: MANEUVER_TURN_DEG[values.maneuver] }); // comes back here, and does the reset
        return;
      }
    }
    ui.applyScenario(values);
    resetRun();
    if (!userMoved) fit();
  });
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    if (values.view !== wantView) {
      wantView = values.view;
      applyView(wantView);
    }
    redraw();
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
    redraw();
    queueReadouts();
  });

  resetRun();
  ui.applyLayout(layout.get());
  if (layout.get().view === '3d') {
    wantView = '3d'; // remembered from last time: three.js loads now, as it would on a switch
    applyView('3d');
  }

  return () => {
    pause();
    pendingReadout?.();
    stopScenario();
    stopLayout();
    controls.dispose();
    layoutControls.dispose();
    view.dispose();
    view3d.dispose();
    stylesheet.remove();
  };
}

export default { id: 'turn-sim', title: 'Formation Turn Sim', mount };
