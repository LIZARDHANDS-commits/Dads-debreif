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
import { BUILT_IN, profileSettingDefaults, startingProfile } from './profile.js';
import { createSim } from './sim.js';
import { clockText } from './readouts.js';
import { createClock, TEN_SECONDS_STEPS } from './clock.js';
import { buildScene, routeRows, SI_PATTERN, siPatternPath } from './scene.js';
import { createPlaybackBar } from './playback-bar.js';
import { createLayout } from './layout.js';
import { createMap2d, hintFor, photoCaption } from './map2d.js';
import { createView3d } from './view3d.js';
import { createSettingsPanel } from './settings-panel.js';
import { createAircraftPanel } from './aircraft.js';
import { createSetupPanel, scenarioAircraft, BUSY_STRAIGHT_IN_SEC } from './setup-panel.js';
import { straightInDelaySec } from './scenario-timing.js';
import { applyToSetup, memoryStore, pauseOnThrow } from './glue.js';
import { trueAltFt } from './weather.js';

const STYLESHEET = new URL('./traffic.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const settings = createSettings(memoryStore(), DEFAULTS, { allowed: ALLOWED });
  const controls = createControls(settings);

  // What opens: the built-in Moose Jaw (V6's generic pattern at another home field), copied so nothing edits it.
  // "Scenarios and notes", with its saved profiles, came off the screen (Patrick, 4 Oct: a drop-down of the
  // ready-made scenarios is enough), so a profile saved earlier is no longer opened: nothing on screen could
  // leave it. profiles-panel.js and profile-store.js stay until Patrick says (Traffic future list).
  const start = startingProfile({ last: null, saved: [], home: app.airfields?.home() });
  const place = start.place; // what the map's hint calls the setup ("Moose Jaw")
  settings.update({ ...profileSettingDefaults(), ...start.profile.settings });
  const setup = /** @type {any} */ ({ version: 1, name: start.profile.name, anchor: structuredClone(start.profile.anchor), routes: structuredClone(start.profile.routes), aircraft: structuredClone(start.profile.aircraft) });
  applyToSetup(setup, settings.get());
  // The built-in Moose Jaw opens on the Busy circuit scenario, in 260°M at 15 kt (Patrick, 4 Oct 18:47Z; °M, TR-65).
  const opensBusy = start.profile === BUILT_IN[0].profile;
  if (opensBusy) setup.aircraft = scenarioAircraftNow('busy', 1);
  const sim = createSim(setup, { seed: start.profile.seed });
  const clock = createClock({ sim, speed: settings.get().speed });
  let selectedRouteId = null; // no route is selected when the sim opens
  let selectedAircraftId = null; // the aircraft card picked: only it shows its caution ring and glide circle (Patrick, 4 Oct)
  let stopFrames = null;
  let cached = null; // sim.state() for this moment, worked out once however often it is asked

  const state = () => (cached ??= sim.state());

  // ---- the screen -----------------------------------------------------------------
  const bar = createPlaybackBar({
    controls,
    settings,
    listen: app.listen,
    available: { photo: true, view3d: true, windTrack: true, reach: true }, // the wind is set in the Setup column (setup-panel.js)
    layersInBar: false, // the layers are in the Setup column's Display box (Patrick, 4 Oct)
    on: {
      play,
      pause,
      rewind,
      reset: resetRun,
      step: (seconds) => stepBy(seconds),
      fit: () => (shown === '3d' ? view3d.preset('fit') : map.fit()),
      fitAll: () => (shown === '3d' ? view3d.preset('fit') : map.fitAll()),
      speed: (x) => settings.update({ speed: x }),
      runwayChange: (runwayId) => {
        changed();
      },
    },
  });
  const ui = createLayout({
    bar,
    listen: app.listen,
    on: {
      toggleRoute,
      routeLine: (id, change) => setRouteLine(id, change),
      toggleColumn: () => app.scheduler.after(0, () => redraw()),
    },
    filterSplits: true,
  });
  const aircraftPanel = createAircraftPanel({ controls, timers: app.scheduler, settings, sim, setup, onChange: () => changed(), onSelectAircraft: (id) => { selectedAircraftId = id; redraw(); } }); // the camera stays put (Patrick, 4 Oct); the 3D bar's Follow still follows
  ui.slots.spawner.append(aircraftPanel.elements.spawner);
  ui.slots.aircraft.append(aircraftPanel.elements.aircraft);
  ui.slots.conflicts.append(aircraftPanel.elements.conflicts);
  // "Reset photo alignment" goes back to the setup's own trim and offsets (V6's photo block, T8).
  const photo = setup.view?.photo ?? {};
  const photoHome = { photoTrim: photo.trim ?? DEFAULTS.photoTrim, photoEastFt: photo.offsetEastFt ?? DEFAULTS.photoEastFt, photoNorthFt: photo.offsetNorthFt ?? DEFAULTS.photoNorthFt };
  // The Scenario drop-down and the wind dial at the top of the Setup column (Patrick, 4 Oct 11:05Z).
  const setupPanel = createSetupPanel({ controls, settings, onScenario: (id) => loadScenario(id) });
  ui.slots.setup.append(setupPanel.element);
  setupPanel.addRunway(bar.runway); // the Active runway list, under the wind (Patrick, 4 Oct)
  if (opensBusy) setupPanel.setActive('busy');
  const settingsPanel = createSettingsPanel({ controls, settings, onToggle: () => {}, available: { photo: true, view3d: true }, photoHome }); // opening the menu moves nothing on the map
  ui.slots.settings.append(settingsPanel.element);
  if (bar.layers) ui.slots.layers.append(bar.layers); // the layer presets and ticks, in the Display box
  root.append(ui.element);

  const map = createMap2d(ui.canvas, {
    timers: app.scheduler,
    scene: () => withSiPattern(buildScene({ setup, state: state(), selectedRouteId, trailOf: sim.trailOf })),
    settings: () => settings.get(),
    anchor: () => setup.anchor,
    onPhoto: (state) => {
      ui.setPhotoNote(photoCaption(state));
      ui.canvas.dataset.photoTiles = state ? `${state.ready}/${state.wanted}` : 'off'; // for the browser tests: tiles drawn / tiles asked for
    },
  });

  // ---- the 3D picture: made now, but three.js loads only when 3D is first switched on -------------
  const view3d = createView3d({
    host: ui.stage3d,
    timers: app.scheduler,
    source: {
      scene: () => atTrueHeight(withSiPattern(buildScene({ setup, state: state(), selectedRouteId, trailOf: () => [] }))), // 3D draws no trails
      settings: () => settings.get(),
      // The 3D bar's High | Performance writes graphicsQuality here (it used to go through Traffic settings' Graphics
      // box, which moved out on 4 Oct, so the buttons did nothing: Patrick, 4 Oct).
      setSettings: (values) => settings.update(values),
      anchor: () => setup.anchor,
      time: () => sim.t,
    },
    onLost: () => noteAndReturnTo2d('3D stopped: the graphics were reset. Switch 3D on to start it again.'),
    onFacing: (yawDeg) => { if (shown === '3d') setupPanel.setFacing(yawDeg); }, // the wind dial turns with the 3D view
  });
  let shown = '2d'; // the picture on screen; the View setting is what the person asked for
  let wantView = '2d';
  let switching = 0; // counts switches, so a late three.js load can't undo a later choice
  let keepNote = false;

  /** Layers only the 2D map draws are greyed out in 3D (labels and caution rings show in both). */
  const LAYERS_2D_ONLY = ['layerTrails', 'layerPoints', 'layerLegDistances', 'layerTurnData', 'layerBubbles'];

  /** Whichever picture is showing draws; the other does nothing, so 3D costs nothing in 2D and the reverse. */
  function redraw() {
    if (shown === '3d') view3d.requestDraw();
    else map.requestDraw();
  }

  async function applyView(want) {
    const turn = ++switching;
    wantView = want;
    if (want !== '3d') {
      shown = '2d';
      view3d.hide(); // frees the renderer, the sky, every geometry and material
      ui.setView('2d');
      setupPanel.setFacing(0); // the 2D map is north up
      for (const key of LAYERS_2D_ONLY) controls.setDisabled(key, false);
      if (!keepNote) ui.setNote3d('');
      map.requestDraw();
      return;
    }
    ui.setNote3d('Loading 3D…');
    const result = await view3d.show();
    if (turn !== switching) {
      if (wantView !== '3d') view3d.hide(); // switched away while three.js was loading: it must not stay showing
      return;
    }
    if (!result.ok) {
      if (result.reason === 'closed' || result.reason === 'cancelled') return;
      noteAndReturnTo2d(result.reason === 'gl' ? '3D needs WebGL, which this browser does not have.' : '3D needs a connection the first time.');
      return;
    }
    ui.setNote3d('');
    shown = '3d';
    ui.setView('3d');
    setupPanel.setFacing(view3d.facing().yawDeg);
    for (const key of LAYERS_2D_ONLY) controls.setDisabled(key, true);
    view3d.requestDraw();
  }

  /** 3D can't run: say why, put the setting back to 2D (which comes back here as a switch to 2D that keeps the note). */
  function noteAndReturnTo2d(words) {
    ui.setNote3d(words);
    keepNote = true;
    settings.update({ view: '2d' });
    keepNote = false;
  }

  // ---- keeping the screen up to date ------------------------------------------------
  /** Something in the run or the setup changed: redraw, and tell the bar. */
  function changed() {
    if (replaying) return; // the run is part way through a replay: the screen keeps the moment it shows until the replay is there (then `go` calls this)
    cached = null;
    bar.setState({ mode: clock.mode, clockText: clockText(clock.simTime) });
    ui.setHint(hintFor({ timeS: clock.simTime, mode: clock.mode, aircraftCount: state().aircraft.length, place }));
    aircraftPanel.update(state(), { playing: clock.mode !== 'paused', now: performance.now() });
    redraw();
  }

  // The PFL circle has a row in "Routes on the map" too (Patrick, 4 Oct). It is the Layers menu's "PFL ground
  // circle" switch (layerPflCircle), so the row and the menu always agree. Colour as map2d draws it.
  const PFL_CIRCLE_ROW = 'pfl-circle';
  // The SI pattern has a row too (Patrick, 4 Oct): its line is flown, not stored (scene.js siPatternPath), so it is
  // added to the picture here. Hidden at first, so the opening picture is as it was.
  let siPatternShown = false;
  const siPatternRow = () => ({ ...SI_PATTERN, visible: siPatternShown });
  // Each route's line settings from the Display box (Patrick, 4 Oct): thickness (a multiple of its usual width),
  // opacity (0-1) and whether the 3D view draws it on the ground; ×1 and 70% at first (Patrick, 4 Oct); kept for the visit.
  const LINE_DEFAULTS = Object.freeze({ lineScale: 1, lineOpacity: 0.7, onGround: false });
  const routeLines = new Map();
  const lineOf = (id) => ({ ...LINE_DEFAULTS, ...(routeLines.get(id) ?? {}) });
  function setRouteLine(id, change) {
    routeLines.set(id, { ...lineOf(id), ...change });
    redraw();
  }
  /** The 3D picture puts each aircraft at its true height for the day's temperature; the labels keep the altimeter's (TR-77). */
  function atTrueHeight(scene) {
    scene.aircraft = scene.aircraft.map((ac) => (Number.isFinite(ac.alt) ? { ...ac, indicatedAlt: ac.alt, alt: trueAltFt(ac.alt) } : ac));
    return scene;
  }

  function withSiPattern(scene) {
    scene.selectedAircraftId = selectedAircraftId;
    if (siPatternShown) {
      const path = siPatternPath(setup.routes, setup.windFromDeg ?? 360, setup.windKt ?? 0, setup.routeOptions);
      if (path) scene.routes.push({ ...SI_PATTERN, visible: true, points: [], path });
    }
    scene.routes = scene.routes.map((r) => ({ ...r, ...lineOf(r.id) }));
    return scene;
  }
  const pflCircleRow = () => ({ id: PFL_CIRCLE_ROW, name: 'PFL circle', kind: 'pfl', color: '#ff9bce', visible: settings.get().layerPflCircle !== false });
  let shownPflCircle = null;

  function showRoutes() {
    const listed = setup.routes.filter((r) => r.kind !== 'split');
    const rows = routeRows(listed).map((row) => ({ ...row, line: lineOf(row.id) }));
    if (setup.routes.some((r) => r.id === 'PAT1') && setup.routes.some((r) => r.id === 'ENT2')) rows.push({ ...siPatternRow(), line: lineOf(SI_PATTERN.id) });
    rows.push(pflCircleRow());
    shownPflCircle = settings.get().layerPflCircle !== false;
    ui.setRoutes(rows);
  }

  /** A route's row was pressed: its line shows or hides on the map (Patrick, 4 Oct). Only the picture changes; the aircraft on it fly on. */
  function toggleRoute(id) {
    if (id === SI_PATTERN.id) {
      siPatternShown = !siPatternShown;
      showRoutes();
      redraw();
      return;
    }
    if (id === PFL_CIRCLE_ROW) {
      settings.update({ layerPflCircle: settings.get().layerPflCircle === false }); // the subscriber redraws and updates the row
      return;
    }
    const route = setup.routes.find((r) => r.id === id);
    if (!route || route.kind === 'split') return;
    route.visible = route.visible === false;
    showRoutes();
    redraw();
  }

  /** Routes, names, links or points were added or changed: the lists follow, and the picture. */
  function routesChanged() {
    sim.forgetHistory(); // a route added, deleted or re-linked changes the run: going back flies the new setup from 0
    showRoutes();
    aircraftPanel.routesChanged();
    changed();
  }

  /**
   * A scenario's aircraft for the routes on screen. Busy circuit's straight-in is timed for 260°T at 15 kt; in any
   * other wind it is timed again so it still meets the overhead aircraft in its final turn (scenario-timing.js,
   * under a second).
   */
  function scenarioAircraftNow(id, seed) {
    const list = scenarioAircraft(id, { routes: setup.routes.filter((r) => r.kind !== 'split'), builtIn: BUILT_IN[0].profile.aircraft, seed, type: settings.get().spawnType });
    const inbound = list.find((a) => a.routeId === 'ENT2' && a.startsAtSec === BUSY_STRAIGHT_IN_SEC);
    const overhead = list.find((a) => a.routeId === 'PAT1' && a.startIndex === 8 && !a.area);
    const usual = setup.windFromDeg === 260 && setup.windKt === 15;
    if (id === 'busy' && inbound && overhead && !usual) inbound.startsAtSec = straightInDelaySec(setup, overhead, inbound).delaySec;
    return list;
  }

  /**
   * A scenario button: its aircraft replace the run's, on the routes already on screen, paused at 0:00.
   * The routes, the wind and the settings stay as they are. Random gets new dice on every press.
   */
  function loadScenario(id) {
    cancelReplay();
    stopFrames?.();
    stopFrames = null;
    const seed = Math.floor(Math.random() * 2 ** 31); // only Random uses it: a new picture each press, repeatable once made
    setup.aircraft = scenarioAircraftNow(id, seed);
    sim.rebuild();
    clock.reset();
    setupPanel.setActive(id);
    aircraftPanel.routesChanged();
    changed();
  }

  // ---- playback ----------------------------------------------------------------------
  // If a frame throws, the run is paused first so the bar never says Running over a stopped sim; the error still surfaces.
  // After an edit of a route, a point or an option the snapshots are stale, and the first step back flies the run again
  // from 0 (0.6 s for an hour of the built-in setup, about 5 s at 30 aircraft). A stretch over 200 s of sim time says
  // "Replaying…" in the bar and is flown a slice at a time, a few milliseconds of each frame, so the page stays alive
  // (RW-03). Presses meanwhile (Play, Pause, Space, Rewind, ±10 s) are ignored, except Reset and Load, which drop the replay.
  const REPLAY_NOTICE_STEPS = 4000; // 200 s of sim time, about 30 ms at 7 aircraft
  const REPLAY_SLICE_STEPS = 25; // 1.25 s of sim time: about 2 ms at 30 aircraft, 12 ms at 200
  const REPLAY_FRAME_MS = 8; // how long one frame works on the replay before it lets the page draw
  let replaying = false;
  let stopReplay = null;
  function cancelReplay() {
    stopReplay?.();
    stopReplay = null;
    if (replaying) {
      replaying = false;
      bar.setState({ note: null });
    }
  }
  /** Gets the run to `targetStep` (which `go` then settles on: it must find the run there, or be able to fly there itself), saying "Replaying…" and flying it in frames when it is long. */
  function afterNotice(targetStep, go) {
    if (replaying) return;
    if (sim.replayCost(targetStep) <= REPLAY_NOTICE_STEPS) return go();
    replaying = true;
    bar.setState({ note: 'Replaying…' });
    stopReplay = app.scheduler.frame(() => {
      try {
        const began = performance.now();
        let there = false;
        while (!there && performance.now() - began < REPLAY_FRAME_MS) there = sim.seekStepsSlice(targetStep, REPLAY_SLICE_STEPS);
        if (!there) return;
        cancelReplay();
        go();
      } catch (err) {
        cancelReplay();
        pause();
        throw err;
      }
    });
  }

  const onFrame = pauseOnThrow((dtMs) => {
    if (replaying) return;
    const moved = clock.tick(dtMs);
    if (clock.mode === 'paused') pause(); // a rewind that reached 0:00 stops itself
    else if (moved) changed();
  }, () => pause());

  function startFrames() {
    stopFrames?.();
    stopFrames = app.scheduler.frame(onFrame);
  }

  function play() {
    if (replaying || clock.mode === 'running') return; // a replay is on its way to a step: the move that follows it sets the mode
    clock.play();
    startFrames();
    changed();
  }

  /** Rewind plays the run backward at the playback speed, until 0:00 or Pause. */
  function rewind() {
    if (clock.mode === 'rewinding') return;
    const back = Math.max(0, sim.steps - 1);
    afterNotice(back, () => {
      sim.seekSteps(back); // the first step back, which after an edit is the replay from 0; the frames then find snapshots
      clock.rewind();
      startFrames();
      changed();
    });
  }

  function pause() {
    if (replaying) return;
    stopFrames?.();
    stopFrames = null;
    clock.pause();
    changed();
  }

  /** -10 s and +10 s (the buttons, [ and ]): 10 s of sim time exactly, at any speed. Playing carries on; a rewind stops. */
  function stepBy(seconds) {
    const wanted = Math.max(0, sim.steps + Math.sign(seconds) * TEN_SECONDS_STEPS);
    afterNotice(wanted, () => {
      const wasRewinding = clock.mode === 'rewinding';
      clock.seekSteps(wanted);
      if (wasRewinding) {
        stopFrames?.();
        stopFrames = null;
      }
      changed();
    });
  }

  function resetRun() {
    cancelReplay();
    stopFrames?.();
    stopFrames = null;
    clock.reset();
    changed();
  }

  // Any setting change reaches the engine's setup and the picture; the speed goes to the clock.
  const stopSettings = settings.subscribe((values) => {
    const beforeOpts = JSON.stringify(setup.routeOptions);
    const beforeWind = `${setup.windFromDeg}_${setup.windKt}`;
    const beforeDeconflict = setup.deconflict, beforeRandomize = `${setup.randomize}_${setup.randomizeSharePct}`, beforeTemp = setup.fieldTempC;
    applyToSetup(setup, values);
    if (JSON.stringify(setup.routeOptions) !== beforeOpts || `${setup.windFromDeg}_${setup.windKt}` !== beforeWind || setup.deconflict !== beforeDeconflict || `${setup.randomize}_${setup.randomizeSharePct}` !== beforeRandomize || setup.fieldTempC !== beforeTemp) {
      sim.forgetHistory(); // the turns and flight are flown differently now
    }
    clock.setSpeed(values.speed);
    bar.setState({ speed: values.speed });
    if (values.view !== wantView) applyView(values.view);
    if ((values.layerPflCircle !== false) !== shownPflCircle) showRoutes(); // the Layers menu switched the PFL circle
    changed();
  });

  // The stylesheet decides the map's size, so the first fit waits for it.
  const ready = () => map.fit();
  if (stylesheet.sheet) ready();
  else {
    stylesheet.addEventListener('load', ready, { once: true });
    stylesheet.addEventListener('error', ready, { once: true });
  }
  // It opens in the view the settings start with: 3D on Performance (Patrick, 5 Oct 06:31Z).
  if (settings.get().view !== wantView) applyView(settings.get().view);

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
    stopReplay?.();
    stopFrames?.();
    stopSettings();
    settingsPanel.dispose();
    setupPanel.dispose();
    controls.dispose();
    view3d.dispose(); // three.js, the renderer and everything drawn with it
    map.dispose();
    stylesheet.remove();
  };
}

export default { id: 'traffic', title: 'Traffic Pattern Sim', mount };
