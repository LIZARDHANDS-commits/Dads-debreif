// The Turn Fight (specs/SPEC-turn-fight.md): two aircraft start head-on, fly to
// the merge and turn; set each one's speed and G and see who gets their nose on
// first. mount() wires the settings, the fight, the frame loop and the screen
// together; everything it starts is stopped by the shell when it closes (R4).
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { timeText, phaseText, resultRows, moreDetailRows } from './readouts.js';
import { DEFAULTS, ALLOWED, setupFrom, setupKey, saneFix, v6Defaults } from './state.js';
import { createRun, advanceRun, frameDtSec } from './playback.js';
import { createLayout } from './layout.js';
import { createTopDownView } from './view.js';
import { createProfileView } from './profile.js';
import { createView3d } from './view3d.js';

const STYLESHEET = new URL('./turn-fight.css', import.meta.url).href;

/** Readouts update at most this far apart while playing (SPEC-turn-fight, "Readouts"), and at once for a reset or a pause. */
const READOUT_MS = 100;

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

  let run = createRun(setupFrom(settings.get()));
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

  const ui = createLayout({
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
      moreToggled: (open) => open && renderReadouts(),
      cameraView: (name) => view3d.setView(name),
    },
  });
  root.append(ui.element);
  views.push(createTopDownView(ui.canvas, { timers: app.scheduler, run: () => run }));
  // The side view draws only while Climb and dive is on; its panel is hidden (and 0 px) otherwise.
  const profile = createProfileView(ui.profileCanvas, { timers: app.scheduler, run: () => run, scale: () => settings.get().heightScale });
  views.push({
    requestDraw: () => settings.get().vertical && profile.requestDraw(),
    dispose: profile.dispose,
  });

  // The 3D picture reads the same run as the 2D ones. Only the object is made now: three.js loads when 3D is switched on.
  const view3d = createView3d(ui.canvas3d, { timers: app.scheduler, run: () => run, paint: () => settings.get().paint });

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
      ui.setNote(result.reason === 'gl' ? '3D needs WebGL, which this browser does not have.' : '3D needs a connection the first time.');
      keepNote = true;
      settings.update({ view: '2d' }); // comes back here as a switch to 2D, which keeps the note
      keepNote = false;
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
    const { fight } = run;
    ui.renderReadouts({
      time: timeText(fight),
      phase: phaseText(fight),
      result: resultRows(fight),
      more: ui.moreOpen ? moreDetailRows(fight) : null,
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
    run = createRun(setupFrom(settings.get()));
    ui.setStopped(null);
    renderReadouts();
    redraw();
  }

  let lastSetup = setupKey(settings.get());
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
  });

  ui.applyLayout(settings.get());
  renderReadouts();
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
    view3d.dispose();
    for (const view of views) view.dispose();
    stylesheet.remove();
  };
}

export default { id: 'turn-fight', title: 'Turn Fight', mount };
