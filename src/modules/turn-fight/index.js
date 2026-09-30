// The Turn Fight (specs/SPEC-turn-fight.md): two aircraft start head-on, fly to
// the merge and turn; set each one's speed and G and see who gets their nose on
// first. mount() wires the settings, the fight, the frame loop and the screen
// together; everything it starts is stopped by the shell when it closes (R4).
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { timeText, phaseText, resultRows, moreDetailRows, geometryRows } from './readouts.js';
import {
  DEFAULTS, ALLOWED, setupFrom, startSetupFrom, startEnergyRun, setupKey, saneFix, v6Defaults, checkingDefaults,
} from './state.js';
import { START_DEFAULTS } from './geometry.js';
import { createRun, createEnergyRun, advanceRun, frameDtSec } from './playback.js';
import { createLayout } from './layout.js';
import { createTopDownView, createStartPictureView } from './view.js';
import { createProfileView } from './profile.js';
import { createView3d } from './view3d.js';
import { energyResultRows, energyMoreRows, flagNotes, flagAnnouncement, moveWhyText, altitudeSummary, altitudeRows } from './energy-readouts.js';
import { createAltitudeGraph } from './energy-graph.js';

const STYLESHEET = new URL('./turn-fight.css', import.meta.url).href;

/** Readouts update at most this far apart while playing (SPEC-turn-fight, "Readouts"), and at once for a reset or a pause. */
const READOUT_MS = 100;

// Why 3D did not start, by the reason view3d's start() gives.
const MESSAGES_3D = Object.freeze({
  gl: '3D needs WebGL, which this browser does not have.',
  gl2: '3D needs WebGL 2, which this browser does not have.',
  load: '3D needs a connection the first time.',
});
const STOPPED_TEXT = 'Fight stopped at 10 minutes. Reset to fly it again.';

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  // Settings come back from browser storage checked against the boxes' ranges.
  const settings = createSettings(app.storage, DEFAULTS, { allowed: ALLOWED });
  const fix = saneFix(settings.get());
  if (Object.keys(fix).length) settings.update(fix);

  // The number boxes only follow the setting when it changes. After "Reset to V6
  // defaults" a box can still show a refused entry next to a setting that didn't
  // change, so the controls' listeners are kept to be called again by hand.
  const followers = new Set();
  const controls = createControls({
    get: settings.get,
    update: settings.update,
    subscribe(fn) {
      followers.add(fn);
      const stop = settings.subscribe(fn);
      return () => {
        followers.delete(fn);
        stop();
      };
    },
  });
  const showSettingsInBoxes = () => {
    for (const fn of [...followers]) fn(settings.get());
  };

  // A new run from the settings: the simple fight, or Energy's. An Energy setup that can't fly (two boxes that don't go
  // together, which no box alone can refuse) says why beside the boxes and flies the default heights meanwhile.
  let ui = null; // the layout, made below; newRun says nothing to it until then
  let problemText = '';
  let flownValues = null; // the settings an Energy run actually flies when they are not the person's; the start picture and pass line use them
  function newRun(values) {
    problemText = '';
    flownValues = null;
    if (!values.energy) {
      ui?.setEnergyProblem('', null);
      return createRun(setupFrom(values));
    }
    // The settings, or the default start when energyProblem finds one, or (the engine refusing what no check here saw) every
    // Energy setting at its default; any other error is a fault and comes out (state.js startEnergyRun).
    const started = startEnergyRun(values, createEnergyRun);
    problemText = started.note;
    if (started.flown !== values) flownValues = started.flown;
    ui?.setEnergyProblem(problemText, flownValues);
    return started.run;
  }
  let run = newRun(settings.get());
  let playing = false;
  let stopFrames = null;
  let lastReadout = -Infinity;
  let pendingReadout = null;
  const views = []; // the 2D pictures, which draw the fight: { requestDraw, dispose }
  let shown = '2d'; // the picture on screen; the `view` setting is what the person asked for
  let wantView = settings.get().view;
  let keepNote = false;
  let switching = 0; // counts switches, so a late three.js load can't undo a later choice
  // Whichever picture is showing draws; the other draws nothing and holds nothing.
  const redraw = () => (shown === '3d' ? view3d.requestDraw() : views.forEach((view) => view.requestDraw()));

  ui = createLayout({
    settings,
    controls,
    on: {
      playPause: () => setPlaying(!playing),
      reset: () => resetFight(),
      resetDefaults() {
        settings.update(v6Defaults());
        showSettingsInBoxes();
        resetFight();
      },
      // Start geometry's own reset (R28): head-on, level, the turns at the pass.
      headOn() {
        settings.update({ ...START_DEFAULTS });
        showSettingsInBoxes();
      },
      // Model settings for checking has its own reset: just those numbers.
      checkingDefaults() {
        settings.update(checkingDefaults());
        showSettingsInBoxes();
      },
      moreToggled: (open) => open && renderReadouts(),
      tableToggled: (open) => open && renderReadouts(),
      cameraView: (name) => view3d.setView(name),
    },
  });
  ui.setEnergyProblem(problemText, flownValues);
  root.append(ui.element);
  views.push(createTopDownView(ui.canvas, { timers: app.scheduler, run: () => run }));
  // The picture in Turn Fight settings, Start geometry: drawn from the set numbers, so it follows them as they change.
  // (With Energy on the jets' speeds are the true airspeeds of their merge speeds.)
  views.push(createStartPictureView(ui.startPicture, { timers: app.scheduler, setup: () => startSetupFrom(flownValues ?? settings.get()) }));
  // The side view draws only while Climb and dive is on (and Energy is off: Energy has its own, the altitude graph); its panel is hidden (and 0 px) otherwise.
  const profile = createProfileView(ui.profileCanvas, { timers: app.scheduler, run: () => run, scale: () => settings.get().heightScale });
  views.push({
    requestDraw: () => settings.get().vertical && !settings.get().energy && profile.requestDraw(),
    dispose: profile.dispose,
  });
  // Energy's side view: altitude against time, drawn with uPlot, which is fetched (import()) only when it is first shown.
  const graph = createAltitudeGraph(ui.energyChart, { run: () => run });
  // Shown only with Energy on and 2D wanted. It draws at the readouts' rate (renderReadouts), never every frame.
  function syncGraph() {
    if (settings.get().energy && wantView !== '3d') graph.start().then((result) => result.ok && graph.update());
    else graph.stop();
  }

  // The 3D picture reads the same run as the 2D ones. Only the object is made now: three.js loads when 3D is switched on.
  // If the browser takes its WebGL context away, it has freed everything by the time this runs: show 2D with a note.
  const view3d = createView3d(ui.canvas3d, {
    timers: app.scheduler,
    run: () => run,
    paint: () => settings.get().paint,
    onLost: () => stayIn2d('3D stopped (the graphics card was reset); showing 2D.'),
  });

  // Goes back to 2D and says why. The fight is not touched: it plays on in 2D.
  function stayIn2d(message) {
    ui.setNote(message);
    keepNote = true;
    settings.update({ view: '2d' }); // comes back here as a switch to 2D, which keeps the note
    keepNote = false;
  }

  // Shows 2D, or 3D once three.js has loaded and WebGL has started. Neither touches the fight: no reset, no number changes.
  async function applyView(want) {
    const turn = ++switching;
    if (want !== '3d') {
      shown = '2d';
      view3d.stop();
      ui.showView('2d');
      if (!keepNote) ui.setNote('');
      redraw();
      return;
    }
    ui.setNote('Loading 3D…');
    const result = await view3d.start();
    if (turn !== switching) return; // a later choice came first, and has dealt with it
    if (!result.ok) {
      if (result.reason === 'closed') return;
      stayIn2d(MESSAGES_3D[result.reason] ?? MESSAGES_3D.load);
      return;
    }
    shown = '3d';
    ui.showView('3d');
    ui.setNote('');
    view3d.requestDraw();
  }

  function renderReadouts() {
    pendingReadout?.();
    pendingReadout = null;
    lastReadout = performance.now();
    const { fight, engine } = run;
    if (engine) {
      // Energy: the engine's own numbers for both aircraft (energy-readouts.js), the words beside each, the flags' reasons and the
      // altitude line and table that stand in for the graph.
      ui.renderReadouts({
        time: timeText(fight),
        phase: phaseText(fight),
        result: energyResultRows(engine),
        more: ui.moreOpen ? energyMoreRows(engine) : null,
        energy: {
          moves: { blue: moveWhyText(engine.blue), red: moveWhyText(engine.red) },
          notes: flagNotes(engine),
          flags: flagAnnouncement(engine),
          summary: altitudeSummary(engine),
          rows: ui.tableOpen ? altitudeRows(run.trails) : null,
          deck: engine.setup.hardDeckFt,
        },
      });
      graph.update();
      return;
    }
    ui.renderReadouts({
      time: timeText(fight),
      phase: phaseText(fight),
      result: resultRows(fight),
      more: ui.moreOpen ? [...moreDetailRows(fight), ...geometryRows(fight)] : null,
    });
  }

  // While playing, at most every READOUT_MS; for a pause, a reset or a change, at once.
  function queueReadouts() {
    const wait = READOUT_MS - (performance.now() - lastReadout);
    if (!playing || wait <= 0) renderReadouts();
    else pendingReadout ??= app.scheduler.after(wait, renderReadouts);
  }

  // Each frame moves the fight by at most 0.08 s times the playback speed, as V6
  // does; a paused fight has no frame running at all, so it costs nothing (#43).
  function onFrame(frameMs) {
    const dt = frameDtSec(frameMs, settings.get().playbackRate);
    if (dt === 0) return;
    advanceRun(run, dt);
    redraw();
    queueReadouts();
    if (run.fight.stopped) {
      endPlaying();
      ui.setStopped(STOPPED_TEXT);
      renderReadouts();
    }
  }

  function endPlaying() {
    playing = false;
    stopFrames?.();
    stopFrames = null;
    ui.setPlaying(false);
  }

  function setPlaying(on) {
    if (on === playing || (on && run.fight.stopped)) return;
    if (on) {
      playing = true;
      ui.setPlaying(true);
      stopFrames = app.scheduler.frame(onFrame);
    } else {
      endPlaying();
      renderReadouts();
    }
  }

  // Changing the setup starts the fight again, paused, as in V6 (`reset`, line 4240).
  function resetFight() {
    endPlaying();
    run = newRun(settings.get());
    ui.setStopped(null);
    renderReadouts();
    redraw();
  }

  let lastSetup = setupKey(settings.get());
  let lastEnergy = settings.get().energy;
  let shownFor = settings.get().view;
  const stopSettings = settings.subscribe((values) => {
    ui.applyLayout(values);
    const setup = setupKey(values);
    if (values.view !== wantView) {
      wantView = values.view;
      applyView(wantView);
    }
    if (setup !== lastSetup) {
      lastSetup = setup;
      resetFight(); // a new fight; playback speed and the height scale never get here (#20)
    } else redraw();
    if (values.energy !== lastEnergy || values.view !== shownFor) syncGraph();
    lastEnergy = values.energy;
    shownFor = values.view;
  });

  ui.applyLayout(settings.get());
  renderReadouts();
  syncGraph();
  if (wantView === '3d') applyView('3d'); // remembered from last time: three.js loads now, as it would on a switch

  app.keys({
    Space: () => setPlaying(!playing),
    Home: () => resetFight(),
  });

  return () => {
    endPlaying();
    pendingReadout?.();
    stopSettings();
    controls.dispose();
    graph.dispose();
    view3d.dispose();
    for (const view of views) view.dispose();
    stylesheet.remove();
  };
}

export default { id: 'turn-fight', title: 'Turn Fight', mount };
