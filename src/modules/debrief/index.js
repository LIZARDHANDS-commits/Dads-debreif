// The Debrief Viewer (specs/SPEC-debrief.md): load up to four ForeFlight
// tracks or the example flight, see them on the map, and play them back.
// mount() builds the screen and wires the flight, the clock and the map
// together; everything it starts is stopped by the shell when it closes (R4).
import { h } from '../../ui-kit/dom.js';
import { createSettings } from '../../storage/settings.js';
import { createControls, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { loadFlight } from '../../flight-data/load.js';
import { loadExampleFlight } from '../../flight-data/examples.js';
import { createClock } from '../../flight-data/clock.js';
import { sampleAt } from '../../flight-data/flight.js';
import { toDebriefFile, readDebriefFile, MAX_DEBRIEF_BYTES } from '../../flight-data/debrief-file.js';
import { DEFAULT_STANDARDS } from '../../core/standards.js';
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
import { toCsv, csvFileName } from './export-csv.js';
import {
  addDfp, renameDfp, setDfpNote, removeDfp, nextDfp, previousDfp, flightFingerprint, dfpStorageKey, readStoredDfps, dfpLabel,
} from './dfp.js';
import { CATALOG } from '../../airfields/catalog.js';
import { createMetarFeed } from './weather/metar-feed.js';
import { createWindsFeed } from './weather/winds-feed.js';
import { WIND_MODELS, windModelFor, windTextAt } from './weather/winds.js';
import { metarLineAt } from './weather/metar.js';
import { nearestAirfield, reportTicks } from './weather/slices.js';
import { gibsSource, satelliteKept, satelliteNote, SATELLITE_LAYERS } from './weather/satellite.js';
import { TIME_KEY, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName } from './debrief-session.js';

const STYLESHEET = new URL('./debrief.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  // The view and paint are checked against their lists (D141, D138); other values fall back to the defaults.
  const layout = createSettings(app.storage, LAYOUT_DEFAULTS, {
    allowed: { view: [...VIEW_ALLOWED], paint3d: PAINT_OPTIONS.map((o) => o.value), wxSatelliteLayer: Object.keys(SATELLITE_LAYERS), wxWindModel: Object.keys(WIND_MODELS) },
  });
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
  const currentStandards = () => app.standards?.get() ?? DEFAULT_STANDARDS;
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

  // The satellite picture for the playback time, while it's on and NASA still
  // keeps the flight's frames (about 90 days; Patrick 08:03Z: live only).
  function satelliteWanted() {
    const on = layout.get();
    if (!on.wxSatellite || !flight || !clock || !satelliteKept(flight.endT, Date.now() / 1000)) return null;
    const layer = SATELLITE_LAYERS[on.wxSatelliteLayer] ? on.wxSatelliteLayer : 'geocolor';
    return { source: gibsSource(layer, clock.t), opacityPct: on.wxSatelliteOpacity };
  }

  const map = createMapView(ui.canvas, {
    tennis: tennisNow,
    timers: app.scheduler,
    time: () => clock?.t ?? 0,
    layers: () => layout.get(),
    dfps: () => dfps.map((d) => ({ x: d.x, y: d.y, label: dfpLabel(dfps, d) })),
    onImagery: (state) => ui.setImagery(state),
    onCharts: (state) => ui.setCharts(state),
    weather: () => satelliteWanted(),
    onWeather: (state) => {
      const on = layout.get();
      const source = satelliteWanted()?.source;
      ui.setWeatherNote(!on.wxSatellite || !flight || !clock ? ''
        : satelliteNote({ kept: satelliteKept(flight.endT, Date.now() / 1000), state, frameT: source?.frameT, t: clock.t }));
    },
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
    // three.js couldn't load (offline on a first visit) or there's no WebGL 2: say so and stay in 2D (D141).
    onUnavailable: (message) => {
      ui.setMessage(message);
      layout.update({ view: '2d' });
    },
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

  // The METAR line (SPEC-debrief: Weather at the time of the flight): the
  // report in force from the airfield nearest Lead, or the one picked.
  const metars = createMetarFeed({ onChange: () => renderMetar() });
  function weatherFields() {
    const byIcao = new Map(Object.entries(CATALOG).map(([icao, f]) => [icao, { icao, ...f }]));
    for (const f of app.airfields ? [app.airfields.home(), ...app.airfields.alternates()] : []) {
      if (Number.isFinite(f.lat) && Number.isFinite(f.lon)) byIcao.set(f.icao, f);
    }
    return [...byIcao.values()];
  }
  function renderMetar() {
    const on = layout.get();
    if (!on.wxMetar || !flight || !clock) {
      ui.setMetar(null);
      bar.setTicks([]);
      return;
    }
    let icao = on.wxMetarField;
    if (!CATALOG[icao]) { // "nearest", or anything else a stored layout holds
      const lead = sampleAt(flight.tracks[1] ?? Object.values(flight.tracks)[0], clock.t);
      icao = nearestAirfield(weatherFields(), lead)?.icao;
    }
    const entry = icao ? metars.get(icao) : null;
    if (!entry) ui.setMetar({ text: 'No airfield with a known position to take METARs from.', raw: '' });
    else if (entry.state === 'loading') ui.setMetar({ text: `Loading ${icao} METARs…`, raw: '' });
    else if (entry.state === 'failed') ui.setMetar({ text: `${icao} METARs couldn't load. They need a connection.`, raw: '' });
    else ui.setMetar(metarLineAt(entry.reports, clock.t, icao));
    bar.setTicks(entry?.state === 'ready' ? reportTicks(entry.reports, flight.startT, flight.endT).map((r) => r.t) : []);
  }

  // Winds aloft on the Lead line (SPEC-debrief: Weather at the time of the
  // flight): the model wind at Lead's altitude, taken at one point for the
  // whole flight (Lead's position halfway through).
  const winds = createWindsFeed({ onChange: () => renderReadouts() });
  function windPoint(shown) {
    const lead = shown.tracks[1] ?? Object.values(shown.tracks)[0];
    const s = lead && sampleAt(lead, (shown.startT + shown.endT) / 2);
    return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? { lat: s.lat, lon: s.lon } : null;
  }
  function leadWind() {
    const on = layout.get();
    if (!on.wxWinds || !flight || !clock || !flight.tracks[1]) return null;
    const model = windModelFor(on.wxWindModel, flight.startT);
    if (!model) return 'no model winds go back this far';
    const { label } = WIND_MODELS[model];
    const entry = winds.get(model);
    if (!entry) return `no ${label} winds: Lead's track has no position`;
    if (entry.state === 'loading') return `loading ${label} winds…`;
    if (entry.state === 'busy' && entry.daily) return `${label} winds: this browser has used Open-Meteo's free daily allowance, try tomorrow`;
    if (entry.state === 'busy') return `${label} winds: Open-Meteo is busy. Turn Winds aloft off and on to try again.`;
    if (entry.state === 'failed') return `${label} winds couldn't load. They need a connection.`;
    const lead = sampleAt(flight.tracks[1], clock.t);
    return lead ? windTextAt(entry.hours, clock.t, lead.altFt, label) : null;
  }

  // Readouts update at most READOUT_MS apart while playing (SPEC-debrief:
  // Performance), and at once for a step, a seek or a pause.
  const READOUT_MS = 100;
  let lastReadout = -Infinity;
  let pendingReadout = null;
  function renderReadouts() {
    pendingReadout?.();
    pendingReadout = null;
    lastReadout = performance.now();
    ui.renderReadouts(flight && clock ? readoutsAt(flight, clock.t, { standards: currentStandards() }) : null, { leadWind: leadWind() });
    if (layout.get().tennisOpen) tennisPanel.render(tennisNow());
    renderMetar();
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
    metars.setFlight(flight);
    winds.setFlight(flight, windPoint(flight));
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
    metars.setFlight(null);
    winds.setFlight(null);
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
      csv() {
        if (!flight) return;
        downloadText(toCsv(flight), csvFileName(flight.startT), { type: 'text/csv' });
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
        const failed = Object.assign(new Error('Example flight download failed', { cause: err }), {
          userMessage: "The example flight couldn't be downloaded. Check the connection and try again.",
        });
        throw failed;
      }),
    ),
  );
  tennisPanel.element.hidden = !layout.get().tennisOpen;
  tennisPanel.render(null);
  ui.onFit(() => map.fit());
  ui.onReset(() => layout.reset());

  let lastWindKey = '';
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    standardsPanel?.setCollapsed(!values.standardsOpen);
    filePanel.setCollapsed(!values.filesOpen);
    tennisPanel.element.hidden = !values.tennisOpen;
    if (values.tennisOpen) tennisPanel.render(tennisNow());
    // Turning Winds aloft on or picking a model redraws the Lead line and asks
    // again for any that failed; anything else only touches the METAR line.
    const windKey = `${values.wxWinds} ${values.wxWindModel}`;
    if (windKey !== lastWindKey) {
      lastWindKey = windKey;
      winds.retry();
      renderReadouts();
    } else renderMetar();
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
    metars.dispose();
    winds.dispose();
    controls.dispose();
    standardsPanel?.dispose();
    map.dispose();
    view3d.dispose();
    em.dispose();
    stylesheet.remove();
  };
}

export default { id: 'debrief', title: 'Debrief Viewer', mount };
