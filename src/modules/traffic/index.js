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
import { DEFAULTS, ALLOWED } from './defaults.js';
import { captureProfile, nextProfileName, profileSettingDefaults, startingProfile } from './profile.js';
import { createProfileStore } from './profile-store.js';
import { createProfilesPanel } from './profiles-panel.js';
import { createSim } from './sim.js';
import { clockText } from './readouts.js';
import { createClock } from './clock.js';
import { buildScene, routeRows } from './scene.js';
import { createPlaybackBar } from './playback-bar.js';
import { createLayout } from './layout.js';
import { createMap2d, hintFor } from './map2d.js';
import { createSettingsPanel } from './settings-panel.js';
import { createAircraftPanel } from './aircraft.js';
import { createIdMaker, createRouteEditor, makeRoute } from './editor.js';
import { applyToSetup, memoryStore, pauseOnThrow } from './glue.js';

const STYLESHEET = new URL('./traffic.css', import.meta.url).href;
const PROFILES_STYLESHEET = new URL('./profiles.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  const profilesStylesheet = h('link', { rel: 'stylesheet', href: PROFILES_STYLESHEET });
  document.head.append(stylesheet, profilesStylesheet);

  const settings = createSettings(memoryStore(), DEFAULTS, { allowed: ALLOWED });
  const controls = createControls(settings);

  // What opens: the last profile used, else the built-in Moose Jaw (V6's generic pattern at another home field).
  // A profile is copied, never used as it is: the person edits the copy, and the saved one stays as saved.
  const profileStore = createProfileStore(app.storage);
  const start = startingProfile({ last: profileStore.lastUsed(), saved: profileStore.list().profiles, home: app.airfields?.home() });
  let place = start.place; // what the map's hint calls the setup ("Moose Jaw"), empty for one of the person's own
  let airfield = start.profile.airfield; // where the setup is, saved with it
  settings.update({ ...profileSettingDefaults(), ...start.profile.settings });
  const setup = /** @type {any} */ ({ version: 1, name: start.profile.name, anchor: structuredClone(start.profile.anchor), routes: structuredClone(start.profile.routes), aircraft: structuredClone(start.profile.aircraft) });
  applyToSetup(setup, settings.get());
  const sim = createSim(setup, { seed: start.profile.seed });
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
      rewind,
      step: (seconds) => stepBy(seconds),
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
      newRoute: (kind) => newRoute(kind),
      toggleColumn: () => app.scheduler.after(0, () => map.requestDraw()),
    },
  });
  const aircraftPanel = createAircraftPanel({ controls, settings, sim, setup, onChange: () => changed() });
  ui.slots.spawner.append(aircraftPanel.elements.spawner);
  ui.slots.aircraft.append(aircraftPanel.elements.aircraft);
  ui.slots.conflicts.append(aircraftPanel.elements.conflicts);
  // The left column: the selected route's points (the layout shows it under the routes list).
  let nextId = createIdMaker(setup.routes);
  const editor = createRouteEditor({
    setup,
    onChange: ({ structure, routeId, remap }) => {
      if (remap) sim.remapStarts(routeId, remap); // aircraft that start on this route keep their starting place
      sim.forgetHistory(); // the route was edited: going back flies the edited route from 0
      if (structure) routesChanged();
      else changed();
    },
  });
  ui.slots.pointTable.append(editor.element);
  ui.slots.leftExtras.append(editor.message);
  // Profiles and notes: a closed section at the foot of the left column (profiles-panel.js, profile.js).
  const profilesPanel = createProfilesPanel({
    store: profileStore,
    current: { name: start.entry?.kind === 'saved' ? start.profile.name : nextProfileName(profileStore.list().profiles.map((p) => p.name)), notes: start.profile.notes },
    capture: (name, notes) => captureProfile({ name, airfield, notes, setup, aircraft: sim.aircraftSpecs(), seed: sim.seed, settings: settings.get() }),
    load: (profile, entry) => loadProfile(profile, entry),
  });
  ui.slots.leftExtras.append(profilesPanel.element);
  const settingsPanel = createSettingsPanel({ controls, settings, onToggle: () => {} }); // opening the menu moves nothing on the map
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
    ui.setHint(hintFor({ timeS: clock.simTime, mode: clock.mode, aircraftCount: state().aircraft.length, place }));
    aircraftPanel.update(state(), { playing: clock.mode !== 'paused', now: performance.now() });
    map.requestDraw();
  }

  function showRoutes() {
    ui.setRoutes(routeRows(setup.routes), selectedRouteId);
  }

  function selectRoute(id) {
    selectedRouteId = id;
    showRoutes();
    editor.show(id);
    map.requestDraw();
  }

  /** Routes, names, links or points were added or changed: the lists follow, and the picture. */
  function routesChanged() {
    sim.forgetHistory(); // a route added, deleted or re-linked changes the run: going back flies the new setup from 0
    showRoutes();
    aircraftPanel.routesChanged();
    changed();
  }

  /**
   * Puts a profile on the screen (Load, or the built-in setup): its routes, aircraft, dice seed and settings,
   * paused at 0:00. The profile is copied, so editing it leaves the saved one alone.
   */
  function loadProfile(profile, entry) {
    stopFrames?.();
    stopFrames = null;
    setup.name = profile.name;
    setup.anchor = structuredClone(profile.anchor);
    setup.routes = structuredClone(profile.routes);
    setup.aircraft = structuredClone(profile.aircraft);
    nextId = createIdMaker(setup.routes);
    sim.rebuild({ seed: profile.seed });
    clock.reset();
    airfield = profile.airfield;
    place = entry?.kind === 'built-in' ? 'Moose Jaw' : '';
    selectedRouteId = null;
    editor.show(null);
    settings.update({ ...profileSettingDefaults(), ...profile.settings }); // the subscriber below copies them into the setup
    showRoutes();
    aircraftPanel.routesChanged();
    map.fit();
    changed();
  }

  /** + New route: makes the route, adds it, and picks it so its points show. */
  function newRoute(kind) {
    const made = makeRoute(kind, { routes: setup.routes, selectedId: selectedRouteId, nextId });
    if (made.problem) return editor.say(made.problem);
    setup.routes.push(made.route);
    selectRoute(made.route.id);
    editor.say(`Added ${made.route.name}.`);
    routesChanged();
  }

  // ---- playback ----------------------------------------------------------------------
  // If a frame throws, the run is paused first so the bar never says Running over a stopped sim; the error still surfaces.
  const onFrame = pauseOnThrow((dtMs) => {
    const moved = clock.tick(dtMs);
    if (clock.mode === 'paused') pause(); // a rewind that reached 0:00 stops itself
    else if (moved) changed();
  }, () => pause());

  function startFrames() {
    stopFrames?.();
    stopFrames = app.scheduler.frame(onFrame);
  }

  function play() {
    if (clock.mode === 'running') return;
    clock.play();
    startFrames();
    changed();
  }

  /** Rewind plays the run backward at the playback speed, until 0:00 or Pause. */
  function rewind() {
    if (clock.mode === 'rewinding') return;
    clock.rewind();
    startFrames();
    changed();
  }

  function pause() {
    stopFrames?.();
    stopFrames = null;
    clock.pause();
    changed();
  }

  /** -10 s and +10 s (the buttons, [ and ]): 10 s of sim time exactly, at any speed. Playing carries on; a rewind stops. */
  function stepBy(seconds) {
    const wasRewinding = clock.mode === 'rewinding';
    clock.stepBy(seconds);
    if (wasRewinding) {
      stopFrames?.();
      stopFrames = null;
    }
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
    const before = JSON.stringify(setup.routeOptions);
    applyToSetup(setup, values);
    if (JSON.stringify(setup.routeOptions) !== before) sim.forgetHistory(); // the turns are flown differently now
    clock.setSpeed(values.speed);
    bar.setState({ speed: values.speed });
    editor.refresh();
    changed();
  });

  // The stylesheet decides the map's size, so the first fit waits for it.
  const ready = () => map.fit();
  if (stylesheet.sheet) ready();
  else {
    stylesheet.addEventListener('load', ready, { once: true });
    stylesheet.addEventListener('error', ready, { once: true });
  }

  // Space plays or pauses, Home resets, [ and ] step back and ahead 10 s: only while the Traffic Sim is open and
  // never while typing (app.keys). The bracket keys are matched by the character and by the key's place, for other layouts.
  const back10 = () => stepBy(-10);
  const ahead10 = () => stepBy(10);
  app.keys({
    Space: () => (clock.mode === 'paused' ? play() : pause()),
    Home: resetRun,
    '[': back10,
    ']': ahead10,
    BracketLeft: back10,
    BracketRight: ahead10,
  });

  bar.setState({ speed: settings.get().speed });
  showRoutes();
  changed();

  return () => {
    stopFrames?.();
    stopSettings();
    settingsPanel.dispose();
    editor.dispose();
    controls.dispose();
    map.dispose();
    stylesheet.remove();
    profilesStylesheet.remove();
  };
}

export default { id: 'traffic', title: 'Traffic Pattern Sim', mount };
