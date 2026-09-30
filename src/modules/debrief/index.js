// The Debrief Viewer (specs/SPEC-debrief.md): load up to four ForeFlight
// tracks or the example flight, see them on the map, and play them back.
// mount() builds the screen and wires the flight, the clock and the map
// together; everything it starts is stopped by the shell when it closes (R4).
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls } from '../../ui-kit/controls.js';
import { loadFlight } from '../../flight-data/load.js';
import { loadExampleFlight } from '../../flight-data/examples.js';
import { createClock } from '../../flight-data/clock.js';
import { sampleAt } from '../../flight-data/flight.js';
import { toDebriefFile, readDebriefFile, MAX_DEBRIEF_BYTES } from '../../flight-data/debrief-file.js';
import { V6_STANDARDS } from '../../core/standards.js';
import { LAYOUT_DEFAULTS, checkPicked } from './state.js';
import { readoutsAt, formationAt, mapLabel } from './readouts.js';
import { createStandardsPanel } from './standards-panel.js';
import { createLayout } from './layout.js';
import { createMapView } from './map2d/view.js';
import { createView3d } from './view3d/view.js';
import { createEmView } from './em.js';
import { tennisAt } from './tennis.js';
import { createTennisPanel } from './tennis-panel.js';
import { FIELD_ELEVATION_FT } from './data/cymj.js';
import { createPlaybackBar } from './playback-bar.js';
import { createDfpPanel } from './dfp-panel.js';
import { createFilePanel } from './file-panel.js';
import { downloadText } from '../../storage/file.js';
import {
  addDfp, renameDfp, setDfpNote, removeDfp, nextDfp, previousDfp, flightFingerprint, dfpStorageKey, readStoredDfps, dfpLabel,
} from './dfp.js';
import { TIME_KEY, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName } from './debrief-session.js';

const STYLESHEET = new URL('./debrief.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  const layout = createSettings(app.storage, LAYOUT_DEFAULTS);
  const controls = createControls(layout);
  const bar = createPlaybackBar({ time: app.time });
  const canExample = typeof app.exampleText === 'function';
  const standardsPanel = app.standards && createStandardsPanel({ standards: app.standards, layout });
  const dfpPanel = createDfpPanel({ time: app.time, on: dfpActions() });
  const filePanel = createFilePanel({ layout, canExample, on: fileActions() });
  const tennisPanel = createTennisPanel({ controls, layout });
  const ui = createLayout({
    layout, controls, bar, canExample, listen: app.listen,
    flightExtras: [filePanel.element],
    formationExtras: [tennisPanel.element, dfpPanel.element, ...(standardsPanel ? [standardsPanel.element] : [])],
  });
  const currentStandards = () => app.standards?.get() ?? V6_STANDARDS;
  root.append(ui.element);

  let flight = null;
  let clock = null;
  let dfps = [];
  let dfpKey = null; // where this flight's DFPs are kept in the browser (#25)
  let unsaved = false; // DFPs changed since the flight was loaded, saved or opened
  let stopClock = null;
  let stopFrames = null;
  let busy = false;
  let closed = false; // a load still running when the debrief closes must not land

  // The one tennis-ball solution both views draw and the panel describes (#19), while it's open.
  const tennisNow = () => {
    const on = layout.get();
    return on.tennisOpen && flight && clock ? tennisAt(flight, clock.t, on) : null;
  };

  const map = createMapView(ui.canvas, {
    tennis: tennisNow,
    timers: app.scheduler,
    time: () => clock?.t ?? 0,
    layers: () => layout.get(),
    dfps: () => dfps.map((d) => ({ x: d.x, y: d.y, label: dfpLabel(dfps, d) })),
    onImagery: (state) => ui.setImagery(state),
    onCharts: (state) => ui.setCharts(state),
    labels: (shown, t) => {
      const out = {};
      for (const row of formationAt(shown, t, currentStandards())) {
        const label = mapLabel(row);
        if (label) out[row.slot] = label;
      }
      return out;
    },
  });

  const view3d = createView3d(ui.canvas3d, {
    tennis: tennisNow,
    timers: app.scheduler,
    flight: () => flight,
    time: () => clock?.t ?? 0,
    settings: () => layout.get(),
    // The field datum is the home field's elevation, or Moose Jaw's until one is set.
    fieldFt: () => app.airfields?.home()?.elevationFt ?? FIELD_ELEVATION_FT,
    setCamera: (patch) => layout.update(patch),
  });
  const em = createEmView(ui.emCanvas, {
    timers: app.scheduler,
    base: document.baseURI,
    flight: () => flight,
    time: () => clock?.t ?? 0,
    settings: () => layout.get(),
    onChart: (altitude) => ui.setEmChart(altitude),
  });
  // Only the view that's showing draws, and the EM chart only while open (#39).
  const redraw = () => {
    const on = layout.get();
    (on.view === '3d' ? view3d : map).requestDraw();
    if (on.emOpen) em.requestDraw();
  };

  // Readouts update at most READOUT_MS apart while playing (SPEC-debrief:
  // Performance), and at once for a step, a seek or a pause.
  const READOUT_MS = 100;
  let lastReadout = -Infinity;
  let pendingReadout = null;
  function renderReadouts() {
    pendingReadout?.();
    pendingReadout = null;
    lastReadout = performance.now();
    ui.renderReadouts(flight && clock ? readoutsAt(flight, clock.t, { standards: currentStandards() }) : null);
    if (layout.get().tennisOpen) tennisPanel.render(tennisNow());
  }
  function queueReadouts() {
    const wait = READOUT_MS - (performance.now() - lastReadout);
    if (!clock.playing || wait <= 0) renderReadouts();
    else pendingReadout ??= app.scheduler.after(wait, renderReadouts);
  }

  // The scheduler runs the clock only while playing; paused, nothing runs (#43).
  function onClock() {
    if (clock.playing && !stopFrames) stopFrames = app.scheduler.frame((dt, now) => clock.tick(now));
    if (!clock.playing && stopFrames) {
      stopFrames();
      stopFrames = null;
    }
    bar.sync();
    redraw();
    queueReadouts();
  }

  // Swaps in a new flight only once it has loaded completely (D54). A
  // session is { flight, dfps?, t? }: DFPs and a time from a debrief file.
  function show(session) {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    flight = session.flight;
    clock = createClock({ startT: flight.startT, endT: flight.endT });
    if (Number.isFinite(session.t)) clock.seek(session.t);
    stopClock = clock.onChange(onClock);
    dfpKey = dfpStorageKey(flightFingerprint([...flight.files].sort((a, b) => a.slot - b.slot).map((f) => f.text)));
    setDfps(session.dfps ?? readStoredDfps(app.storage.get(dfpKey, [])), { changed: Boolean(session.dfps) });
    unsaved = false;
    bar.setClock(clock);
    map.setFlight(flight);
    ui.showFlight(flight);
    filePanel.setFlight(true);
    renderReadouts();
    app.status(`Debrief: ${ui.summary()}`);
  }

  // "Close flight": back to the empty screen (#23, #25).
  function closeFlight() {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    stopClock = null;
    pendingReadout?.();
    flight = null;
    clock = null;
    dfpKey = null;
    setDfps([], { changed: false });
    unsaved = false;
    bar.setClock(null);
    map.setFlight(null);
    ui.showFlight(null);
    filePanel.setFlight(false);
    renderReadouts();
    ui.setMessage(null);
    app.status('');
  }

  // The DFP list, kept in the browser for this flight as it changes.
  function setDfps(next, { changed = true } = {}) {
    dfps = next;
    if (changed && dfpKey) app.storage.set(dfpKey, dfps);
    if (changed) unsaved = true;
    dfpPanel.render(dfps, Boolean(flight));
    redraw();
  }

  // Lead's place at time t (the first ship's with no Lead), for a DFP's flag.
  function leadAt(t) {
    const track = flight.tracks[1] ?? Object.values(flight.tracks)[0];
    const s = sampleAt(track, t);
    return { x: s.xFt, y: s.yFt };
  }

  function goTo(dfp) {
    if (!dfp || !clock) return;
    clock.pause();
    clock.seek(dfp.t);
  }

  function dfpActions() {
    return {
      add() {
        if (!clock) return;
        const t = Math.min(clock.endT, Math.max(clock.startT, Math.round(clock.t)));
        const { list, dfp } = addDfp(dfps, { t, ...leadAt(t) });
        if (dfp) setDfps(list);
      },
      go: goTo,
      previous: () => goTo(previousDfp(dfps, clock?.t ?? 0)),
      next: () => goTo(nextDfp(dfps, clock?.t ?? 0)),
      rename: (id, text) => setDfps(renameDfp(dfps, id, text)),
      note: (id, text) => setDfps(setDfpNote(dfps, id, text)),
      remove: (id) => setDfps(removeDfp(dfps, id)),
    };
  }

  function fileActions() {
    return {
      save() {
        if (!flight) return;
        try {
          const text = toDebriefFile(flight, dfpsForFile(dfps), sessionSettings(currentStandards(), clock.t));
          downloadText(text, debriefFileName(flight.startT), { type: 'application/json' });
          unsaved = false;
          ui.setMessage(null);
        } catch (err) {
          if (err?.name !== 'DebriefFileError') throw err;
          ui.setMessage(err.message);
        }
      },
      open(file) {
        if (file.size > MAX_DEBRIEF_BYTES) {
          ui.setMessage(`"${String(file.name).slice(0, 80)}" is too big to be a debrief file. Nothing was changed.`);
          return;
        }
        run('Opening the debrief', async () => {
          const opened = readDebriefFile(await file.text(), { settings: settingsRules(app.standards?.limits ?? {}) });
          const next = loadFlight(opened.files);
          return { flight: next, opened };
        }, ({ flight: next, opened }) => {
          flight = next; // leadAt reads it for the DFP flags
          const patch = standardsPatch(opened.settings);
          if (patch && app.standards) app.standards.update(patch);
          return { flight: next, dfps: dfpsFromFile(opened.dfps, leadAt), t: opened.settings[TIME_KEY] };
        });
      },
      close() {
        if (!flight) return;
        if (unsaved && dfps.length
          && !confirm("Close this flight? Its DFPs stay in this browser, but they aren't in a saved debrief file yet.")) return;
        closeFlight();
      },
      example(entry) {
        app.exampleText(entry.asset)
          .then((text) => downloadText(text, entry.download, { type: 'application/vnd.google-earth.kml+xml' }))
          .catch(() => ui.setMessage("That example file couldn't be downloaded. Check the connection and try again."));
      },
    };
  }

  // Runs a load; `work` returns what `prepare` turns into a session for show().
  async function run(what, work, prepare = (flightOnly) => ({ flight: flightOnly })) {
    if (busy) return;
    busy = true;
    ui.setBusy(what);
    filePanel.setBusy(true);
    try {
      const result = await work();
      if (closed) return;
      show(prepare(result));
      ui.setMessage(null);
    } catch (err) {
      if (closed) return;
      // A KmlError or DebriefFileError message names the file and the reason;
      // anything without a message for the user is unexpected, so it's logged.
      const told = err?.name === 'KmlError' || err?.name === 'DebriefFileError' ? err.message : err?.userMessage;
      if (!told) console.error(err);
      ui.setMessage(`${told ?? `${what} failed.`} Nothing was changed.`);
    } finally {
      busy = false;
      ui.setBusy(null);
      filePanel.setBusy(false);
    }
  }

  ui.onPick((files) => {
    const problem = checkPicked(files);
    if (problem) ui.setMessage(problem);
    else ui.showPicker(files);
  });
  ui.onLoad((picked) =>
    run('Loading the tracks', async () => {
      const texts = await Promise.all(picked.map((p) => p.file.text()));
      return loadFlight(picked.map((p, i) => ({ slot: p.slot, name: p.file.name, text: texts[i] })));
    }),
  );
  ui.onExample(() =>
    run('Loading the example flight', () =>
      loadExampleFlight(app.exampleText).catch((err) => {
        if (err?.name === 'KmlError') throw err;
        const failed = new Error('Example flight download failed', { cause: err });
        failed.userMessage = "The example flight couldn't be downloaded. Check the connection and try again.";
        throw failed;
      }),
    ),
  );
  tennisPanel.element.hidden = !layout.get().tennisOpen;
  tennisPanel.render(null);
  ui.onFit(() => map.fit());
  ui.onReset(() => layout.reset());

  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    standardsPanel?.setCollapsed(!values.standardsOpen);
    filePanel.setCollapsed(!values.filesOpen);
    tennisPanel.element.hidden = !values.tennisOpen;
    if (values.tennisOpen) tennisPanel.render(tennisNow());
    redraw();
  });

  app.keys({
    Space: () => clock && (clock.playing ? clock.pause() : clock.play()),
    ArrowLeft: () => clock?.step(-1),
    ArrowRight: () => clock?.step(1),
    Home: () => clock?.reset(),
  });
  // The time's order follows Settings; the local zone follows the home field.
  app.settings.subscribe(() => bar.sync());
  app.airfields?.subscribe(() => bar.sync());
  // Edited standards change the labels at once (R18).
  app.standards?.subscribe(() => {
    redraw();
    if (clock) renderReadouts();
  });

  return () => {
    closed = true;
    stopFrames?.();
    pendingReadout?.();
    stopClock?.();
    stopLayout();
    controls.dispose();
    standardsPanel?.dispose();
    map.dispose();
    view3d.dispose();
    em.dispose();
    stylesheet.remove();
  };
}

export default { id: 'debrief', title: 'Debrief Viewer', mount };
