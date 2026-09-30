// The Traffic Pattern Sim (specs/SPEC-traffic.md): the built-in Moose Jaw setup opens paused
// at 0:00 with its aircraft ready, and Play flies them. mount() builds the screen and wires
// the settings, the engine and the map together; everything it starts runs on the shell's
// scheduler and listeners, so the shell stops it all when the module closes (R4).
//
// The engine is stepped in fixed 0.05 s steps (clock.js): playback speed changes how much
// sim time each frame asks for, never the size of a step, so a run is the same at any frame
// rate. This file is glue: it draws what the engine returns and changes no number.
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import MOOSE_JAW from './data/moose-jaw.json' with { type: 'json' };
import { DEFAULTS, ALLOWED } from './defaults.js';
import { createSim } from './sim.js';
import { clockText } from './readouts.js';
import { createClock } from './clock.js';
import { buildScene, routeRows } from './scene.js';
import { createPlaybackBar } from './playback-bar.js';
import { createLayout } from './layout.js';
import { createMap2d, hintFor } from './map2d.js';
import { createSettingsPanel } from './settings-panel.js';

const STYLESHEET = new URL('./traffic.css', import.meta.url).href;

/** The settings aren't remembered between visits yet (profiles are a later task), so they live in memory. */
function memoryStore() {
  const docs = new Map();
  return { get: (name, fallback) => (docs.has(name) ? docs.get(name) : fallback), set: (name, value) => docs.set(name, value) };
}

/** The settings the engine reads from the setup (V6 keeps them there), copied from the screen's settings. */
function applyToSetup(setup, values) {
  setup.conflictLimits = { latFt: values.conflictLatFt, vertFt: values.conflictVertFt, cautionLatFt: values.cautionLatFt, cautionVertFt: values.cautionVertFt };
  setup.routeOptions = { flyRoundedTurns: values.flyRoundedTurns, radiusFromG: values.radiusFromG, manualRadiusFt: values.manualRadiusFt };
}

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSettings(memoryStore(), DEFAULTS, { allowed: ALLOWED });
  const controls = createControls(settings);

  // A copy of the built-in setup: the person edits this one, and the module's own copy stays as it shipped.
  const setup = structuredClone(MOOSE_JAW);
  applyToSetup(setup, settings.get());
  const sim = createSim(setup, { seed: setup.seed ?? 1 });
  const clock = createClock({ sim, speed: settings.get().speed });
  let selectedRouteId = null; // no route is selected when the sim opens
  let stopFrames = null;
  let cached = null; // sim.state() for this moment, worked out once however often it is asked

  const state = () => (cached ??= sim.state());

  // ---- the screen -----------------------------------------------------------------
  const bar = createPlaybackBar({
    controls,
    listen: app.listen,
    on: {
      play,
      pause,
      reset: resetRun,
      fit: () => map.fit(),
      speed: (x) => settings.update({ speed: x }),
    },
  });
  const ui = createLayout({
    bar,
    listen: app.listen,
    on: {
      selectRoute,
      newRoute: () => {},
      toggleColumn: () => app.scheduler.after(0, () => map.requestDraw()),
    },
  });
  const settingsPanel = createSettingsPanel({ controls, settings });
  ui.slots.settings.append(settingsPanel.element);
  root.append(ui.element);

  const map = createMap2d(ui.canvas, {
    timers: app.scheduler,
    scene: () => buildScene({ setup, state: state(), selectedRouteId, trailOf: sim.trailOf }),
    settings: () => settings.get(),
  });

  // ---- keeping the screen up to date ------------------------------------------------
  /** Something in the run or the setup changed: redraw, and tell the bar. */
  function changed() {
    cached = null;
    bar.setState({ mode: clock.mode, clockText: clockText(clock.simTime) });
    ui.setHint(hintFor({ timeS: clock.simTime, mode: clock.mode, aircraftCount: state().aircraft.length }));
    map.requestDraw();
  }

  function showRoutes() {
    ui.setRoutes(routeRows(setup.routes), selectedRouteId);
  }

  function selectRoute(id) {
    selectedRouteId = id;
    showRoutes();
    map.requestDraw();
  }

  // ---- playback ----------------------------------------------------------------------
  function onFrame(dtMs) {
    if (clock.tick(dtMs)) changed();
  }

  function play() {
    if (clock.mode === 'running') return;
    clock.play();
    stopFrames = app.scheduler.frame(onFrame);
    changed();
  }

  function pause() {
    stopFrames?.();
    stopFrames = null;
    clock.pause();
    changed();
  }

  function resetRun() {
    stopFrames?.();
    stopFrames = null;
    clock.reset();
    changed();
  }

  // Any setting change reaches the engine's setup and the picture; the speed goes to the clock.
  const stopSettings = settings.subscribe((values) => {
    applyToSetup(setup, values);
    clock.setSpeed(values.speed);
    bar.setState({ speed: values.speed });
    changed();
  });

  // The stylesheet decides the map's size, so the first fit waits for it.
  const ready = () => map.fit();
  if (stylesheet.sheet) ready();
  else {
    stylesheet.addEventListener('load', ready, { once: true });
    stylesheet.addEventListener('error', ready, { once: true });
  }

  // Space plays or pauses and Home resets: only while the Traffic Sim is open and never while typing (app.keys).
  app.keys({
    Space: () => (clock.mode === 'running' ? pause() : play()),
    Home: resetRun,
  });

  bar.setState({ speed: settings.get().speed });
  showRoutes();
  changed();

  return () => {
    stopFrames?.();
    stopSettings();
    settingsPanel.dispose();
    controls.dispose();
    map.dispose();
    stylesheet.remove();
  };
}

export default { id: 'traffic', title: 'Traffic Pattern Sim', mount };
