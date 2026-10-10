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
import { fillGapsInSteps } from '../../flight-data/gap-fill.js';
import { windVectorFtps } from '../../core/wind.js';
import { DEFAULT_STANDARDS } from '../../core/standards.js';
import { LAYOUT_DEFAULTS, checkPicked } from './state.js';
import { readoutsAt, formationAt, mapLabel } from './readouts.js';
import { createStandardsPanel } from './standards-panel.js';
import { createLayout, shipSwatch } from './layout.js';
import { createPuckPanel } from './puck-panel.js';
import { withPucks, readPucks, puckSeat, puckStorageKey } from './puck.js';
import { createMapView } from './map2d/view.js';
import { createView3d } from './view3d/view.js';
import { CAMERA_ALLOWED } from './view3d/camera-modes.js';
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
import { WIND_MODELS, windModelFor, windAt, windTextAt, windFailureText } from './weather/winds.js';
import {
  clampArrowFt, windGridPoints, flightLatLonBounds, windArrowsAt, arrowLabel, arrowCaption, arrowStatus, lastResult,
} from './weather/wind-arrows.js';
import { metarLineAt } from './weather/metar.js';
import { nearestAirfield, reportTicks, tickLabel } from './weather/slices.js';
import { gibsSource, satelliteKept, satelliteNote, SATELLITE_LAYERS } from './weather/satellite.js';
import { TIME_KEY, weatherSettingOf, buildDebriefFile, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName, pucksFromSettings } from './debrief-session.js';
import { createSavedRadarFeed, offerState } from './weather/saved-radar-feed.js';
import { radarKept, framesToDraw, savedNoteLine, savedFromSetting, droppedNotice, SAVED_ALPHA } from './weather/saved-radar.js';

const STYLESHEET = new URL('./debrief.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  // The view and paint are checked against their lists (D141, D138); other values fall back to the defaults.
  const layout = createSettings(app.storage, LAYOUT_DEFAULTS, {
    allowed: {
      view: [...VIEW_ALLOWED], paint3d: PAINT_OPTIONS.map((o) => o.value), wxSatelliteLayer: Object.keys(SATELLITE_LAYERS), wxWindModel: Object.keys(WIND_MODELS),
      ...CAMERA_ALLOWED,
    },
  });
  const controls = createControls(layout);
  const bar = createPlaybackBar({ time: app.time });
  const canExample = typeof app.exampleText === 'function';
  const standardsPanel = app.standards && createStandardsPanel({ standards: app.standards, layout });
  const dfpPanel = createDfpPanel({ time: app.time, on: dfpActions() });
  const filePanel = createFilePanel({ layout, canExample, on: fileActions() });
  const tennisPanel = createTennisPanel({ controls, layout });
  const puckPanel = createPuckPanel({ layout, swatch: shipSwatch, on: { set: (slot, seat) => setPuck(slot, seat) } });
  const ui = createLayout({
    layout, controls, bar, canExample, listen: app.listen,
    flightExtras: [puckPanel.element, filePanel.element],
    formationExtras: [tennisPanel.element, dfpPanel.element, ...(standardsPanel ? [standardsPanel.element] : [])],
  });
  const currentStandards = () => app.standards?.get() ?? DEFAULT_STANDARDS;
  root.append(ui.element);

  let flight = null;
  // The GPS puck (DB-23): the flight as loaded, each ship's puck seat ({ slot: 'front' | 'rear' }), and where they are
  // kept in this browser. `flight` is baseFlight with each ship moved from its puck (the same object when none is set).
  let baseFlight = null;
  let pucks = {};
  let puckKey = null;
  // Whether the saved radar offer was pressed for this flight: only then is its line read out.
  let offerPressed = false;
  let clock = null;
  let dfps = [];
  let dfpKey = null; // where this flight's DFPs are kept in the browser (#25)
  let unsaved = false; // DFPs changed since the flight was loaded, saved or opened
  let stopClock = null;
  let stopFrames = null;
  let busy = false;
  let closed = false; // a load still running when the debrief closes must not land
  // The GPS gap fill (DB-19, DB-20): worked out a gap at a time over a few frames when a flight loads, and again when the
  // model wind arrives or changes; until a new answer is ready the last one stays drawn. `key` names the flight and wind
  // it was worked out for. Read only by the drawing (map, 3D, cockpit), never by the readouts, standards or CSV.
  let gapFill = { result: null, running: false, key: '' };
  let stopFill = null;
  let flightCount = 0; // which loaded flight this is, for gapFill.key
  const shownFills = () => (layout.get().fillGaps ? gapFill.result?.fills ?? null : null);

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

  // Saved radar and lightning (SPEC-debrief: Saved radar and lightning): the pictures kept with this
  // flight, fetched only when the offer is pressed or read from an opened debrief file. Radar under
  // lightning, each the last kept frame at or before the playback time.
  const savedRadar = createSavedRadarFeed({ onChange: () => { renderSavedWeather(); redraw(); } });
  // The saved pictures the browser could not draw (a picture that passes the checks but does not decode): the line
  // under the map names no time for them (F4c). Set from the map's draw, and only when the set changes.
  let notDrawn = new Set();
  let notDrawnKey = '';
  // The set of pictures that went into a saved debrief file. A set fetched later is a new object, so it
  // is unsaved whatever was saved before, or while the fetch ran (R1).
  let weatherWritten = null;
  const weatherUnsaved = () => {
    const s = savedRadar.state();
    return Boolean(s.saved) && !s.fromFile && s.saved !== weatherWritten;
  };
  // Reloading or closing the tab asks too, the browser's own question: the pictures can't be fetched again.
  const onBeforeUnload = (event) => {
    if (!weatherUnsaved()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  // Switching to another tool in the app asks the same (the shell's leave check, app frame #233).
  app.canLeave?.(() => (weatherUnsaved()
    ? "Leave the Debrief? The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours."
    : null));
  function savedWeatherItems() {
    const on = layout.get();
    const { saved } = savedRadar.state();
    if (!saved || !clock) return [];
    const items = [];
    for (const [item, shown] of [['radar', on.wxRadar], ['lightning', on.wxLightning]]) {
      if (!shown) continue;
      for (const { layer, frame } of framesToDraw(saved, item, clock.t)) {
        items.push({ key: `${layer}@${frame.t}`, mime: frame.mime, data: frame.data, box: saved.box, alpha: SAVED_ALPHA[item] });
      }
    }
    return items;
  }
  function renderSavedWeather() {
    const on = layout.get();
    const recent = flight ? radarKept(flight.endT, Date.now() / 1000) : false;
    const state = savedRadar.state();
    // Once the set is in a saved file, the line stops asking to save the debrief (F3).
    const offer = offerState({ flight: Boolean(flight), recent, pressed: offerPressed, inFile: Boolean(state.saved) && state.saved === weatherWritten, ...state });
    let note = '';
    if (flight && clock) {
      // While fetching, the menu's line is the one place progress is written and announced (Y5).
      note = offer.button === 'cancel' ? ''
        : savedNoteLine({ radar: on.wxRadar, lightning: on.wxLightning, recent, saved: savedRadar.state().saved, t: clock.t, notDrawn });
    }
    ui.setSavedWeather({ offer, note });
  }

  const map = createMapView(ui.canvas, {
    tennis: tennisNow,
    fills: shownFills,
    timers: app.scheduler,
    time: () => clock?.t ?? 0,
    layers: () => layout.get(),
    dfps: () => dfps.map((d) => ({ x: d.x, y: d.y, label: dfpLabel(dfps, d) })),
    onImagery: (state) => ui.setImagery(state),
    onCharts: (state) => ui.setCharts(state),
    weather: () => satelliteWanted(),
    windArrows: () => windArrowsNow().arrows,
    savedWeather: () => savedWeatherItems(),
    onSavedWeather: (state) => {
      const keys = state?.failedKeys ?? [];
      const key = keys.join();
      if (key === notDrawnKey) return;
      notDrawnKey = key;
      notDrawn = new Set(keys);
      renderSavedWeather();
    },
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
    fills: shownFills,
    // The model wind at a time and height, { dirDeg, kt } (true "from", knots), or null: the cockpit's crab and airspeed (DB-21).
    wind: (t, altFt) => leadWindVector(t, altFt),
    // Bumped when the wind's state changes, so the cockpit works its attitude table out again.
    windKey: () => windKeyNow(),
    timers: app.scheduler,
    flight: () => flight,
    time: () => clock?.t ?? 0,
    settings: () => layout.get(),
    // The field datum is the home field's elevation, or Moose Jaw's until one is set.
    fieldFt: () => app.airfields?.home()?.elevationFt ?? FIELD_ELEVATION_FT,
    setCamera: (patch) => layout.update(patch),
    // three.js couldn't load (offline on a first visit) or there's no WebGL 2: say so and stay in 2D (D141).
    onUnavailable: (message) => {
      ui.setViewMessage(message);
      layout.update({ view: '2d' });
    },
  });
  // Only the view that's showing draws.
  const redraw = () => {
    const on = layout.get();
    (on.view === '3d' ? view3d : map).requestDraw();
  };

  // The METAR line (SPEC-debrief: Weather at the time of the flight): the
  // report in force from the airfield nearest Lead, or the one picked.
  const metars = createMetarFeed({ timers: app.scheduler, onChange: () => renderMetar() });
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
    bar.setTicks(entry?.state === 'ready' ? reportTicks(entry.reports, flight.startT, flight.endT).map((r) => ({ t: r.t, label: tickLabel(r) })) : []);
  }

  // Winds aloft on the Lead line (SPEC-debrief: Weather at the time of the
  // flight): the model wind at Lead's altitude, taken at one point for the
  // whole flight (Lead's position halfway through).
  // The same feed also asks for the 3 x 3 grid of points the wind arrows on the map use, in one request.
  const winds = createWindsFeed({ onChange: () => { renderReadouts(); refill(); redraw(); } });
  let windGrid = []; // the grid's points for this flight, [{ lat, lon }]
  // The home field's elevation, or Moose Jaw's until one is set: the ground for a reply that gave none (W4).
  const homeFieldFt = () => app.airfields?.home()?.elevationFt ?? FIELD_ELEVATION_FT;
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
    if (entry.state === 'failed') return windFailureText(label, entry.failure);
    const lead = sampleAt(flight.tracks[1], clock.t);
    // Levels under the ground are not blended in (W4). The reply's own ground height decides; the home field's elevation, or Moose Jaw's until one is set, is for a reply without one.
    const fieldFt = homeFieldFt();
    return lead ? windTextAt(entry.hours, clock.t, lead.altFt, label, { fieldFt }) : null;
  }
  // The same wind as numbers, { dirDeg, kt } (true "from", knots), for Lead's est. IAS (final verification F1):
  // windAt's own value at Lead's altitude at time t, or null while Winds aloft is off, loading, failed, or has none there.
  function leadWindVector(t, altFt) {
    const on = layout.get();
    if (!on.wxWinds || !flight) return null;
    const model = windModelFor(on.wxWindModel, flight.startT);
    const entry = model ? winds.get(model) : null;
    if (entry?.state !== 'ready') return null;
    return windAt(entry.hours, t, altFt, { fieldFt: homeFieldFt() })?.wind ?? null;
  }
  // Which wind the gap fill and the cockpit use now: the model's name while Winds aloft is on and its reply is ready, or ''.
  function windKeyNow() {
    const on = layout.get();
    if (!on.wxWinds || !flight) return '';
    const model = windModelFor(on.wxWindModel, flight.startT);
    return model && winds.get(model)?.state === 'ready' ? model : '';
  }
  // Works the gap fill out again when the flight or the wind has changed, a few gaps a frame (a long gap can take a
  // few tenths of a second), and shows it when done.
  const FILL_SLICE_MS = 12;
  function refill() {
    if (!flight) return;
    const windKey = windKeyNow();
    const key = `${flightCount}|${windKey}`;
    if (key === gapFill.key) return;
    stopFill?.();
    stopFill = null;
    const windFtps = windKey ? (t, altFt) => {
      const w = leadWindVector(t, altFt);
      return w ? windVectorFtps(w.dirDeg, w.kt) : null;
    } : null;
    const run = fillGapsInSteps(flight, { windFtps });
    gapFill = { result: gapFill.key.startsWith(`${flightCount}|`) ? gapFill.result : null, running: true, key };
    const pump = () => {
      stopFill = null;
      const started = performance.now();
      let step = run.next();
      while (!step.done && performance.now() - started < FILL_SLICE_MS) step = run.next();
      if (!step.done) {
        stopFill = app.scheduler.after(0, pump);
        return;
      }
      gapFill = { result: step.value, running: false, key };
      showFill();
      redraw();
    };
    stopFill = app.scheduler.after(0, pump);
    showFill();
  }
  function showFill() {
    ui.setGapFill(flight ? { on: layout.get().fillGaps, running: gapFill.running, result: gapFill.result } : null);
    if (flight) app.status(`Debrief: ${ui.summary()}`);
  }
  function readoutsNow() {
    if (!flight || !clock) return null;
    const lead = flight.tracks[1] ? sampleAt(flight.tracks[1], clock.t) : null;
    return readoutsAt(flight, clock.t, { standards: currentStandards(), leadWind: lead ? leadWindVector(clock.t, lead.altFt) : null });
  }

  // Wind arrows on the 2D map (SPEC-debrief: Winds aloft): the model wind at
  // each grid point at the chosen height, at the playback time. Returns the
  // arrows to draw, the caption under the map and the Weather menu's status
  // line. Asks Open-Meteo for the grid only while the item is on and the 2D
  // map is showing (R5).
  function windArrowsNow() {
    const none = { arrows: [], caption: '', status: '' };
    const on = layout.get();
    if (!on.wxWindArrows || !flight || !clock) return none;
    if (on.view === '3d') return { ...none, status: 'Wind arrows show in the 2D map only.' };
    const model = windModelFor(on.wxWindModel, flight.startT);
    if (!model) return { ...none, status: 'no model winds go back this far' };
    const { label } = WIND_MODELS[model];
    const entry = winds.getGrid(model);
    if (!entry) return { ...none, status: "no model wind: the flight's tracks have no position" };
    const retry = 'Turn Wind arrows off and on to try again.';
    if (entry.state === 'loading') return { ...none, status: `loading ${label} winds for the map…` };
    if (entry.state === 'busy' && entry.daily) return { ...none, status: `${label} winds: this browser has used Open-Meteo's free daily allowance, try tomorrow` };
    if (entry.state === 'busy') return { ...none, status: `${label} winds: Open-Meteo is busy. ${retry}` };
    if (entry.state === 'failed') return { ...none, status: windFailureText(label, entry.failure, retry) };
    return arrowsFor(entry.grid, windGrid, clock.t, clampArrowFt(on.wxWindArrowFt), label, homeFieldFt());
  }
  // Worked out again only when the reply, the points, the moment, the height, the model or the field change, so a pan or zoom while paused reuses it (and the map reuses its projection of the same list).
  const arrowsFor = lastResult((grid, points, t, altFt, label, fieldFt) => {
    const found = windArrowsAt(grid, points, t, altFt, { fieldFt });
    const shown = found.filter((a) => a.wind);
    return {
      arrows: shown.map((a) => ({ lat: a.lat, lon: a.lon, dirDeg: a.wind.dirDeg, kt: a.wind.kt, label: arrowLabel(a.wind) })),
      caption: shown.length ? arrowCaption(altFt, label, shown[0].hoursT) : '',
      status: arrowStatus(found, altFt, label),
    };
  });
  function renderWindArrows() {
    const { caption, status } = windArrowsNow();
    ui.setWindArrows({ caption, status });
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
    ui.renderReadouts(readoutsNow(), { leadWind: leadWind() });
    if (layout.get().tennisOpen) tennisPanel.render(tennisNow());
    renderMetar();
    renderWindArrows();
    renderSavedWeather();
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
  // session is { flight, dfps?, t?, pucks? }: DFPs, a time and GPS puck seats from a debrief file.
  function show(session) {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    baseFlight = session.flight;
    const fingerprint = flightFingerprint([...baseFlight.files].sort((a, b) => a.slot - b.slot).map((f) => f.text));
    puckKey = puckStorageKey(fingerprint);
    pucks = readPucks(session.pucks ?? app.storage.get(puckKey, {}));
    if (session.pucks) app.storage.set(puckKey, pucks); // an opened debrief file's choice wins, as its DFPs do
    flight = withPucks(baseFlight, pucks);
    puckPanel.render(baseFlight, pucks);
    clock = createClock({ startT: flight.startT, endT: flight.endT });
    if (Number.isFinite(session.t)) clock.seek(session.t);
    stopClock = clock.onChange(onClock);
    metars.setFlight(flight);
    savedRadar.load(session.weather ?? null);
    weatherWritten = null;
    offerPressed = false;
    windGrid = windGridPoints(flightLatLonBounds(flight));
    winds.setFlight(flight, windPoint(flight), windGrid);
    dfpKey = dfpStorageKey(fingerprint);
    setDfps(session.dfps ?? readStoredDfps(app.storage.get(dfpKey, [])), { changed: Boolean(session.dfps) });
    unsaved = false;
    bar.setClock(clock);
    map.setFlight(flight);
    ui.showFlight(flight);
    filePanel.setFlight(true);
    flightCount++;
    gapFill = { result: null, running: false, key: '' };
    refill();
    renderReadouts();
    app.status(`Debrief: ${ui.summary()}`);
  }

  // A ship's GPS puck seat changed (DB-23): the flight is moved again from the as-loaded fixes and handed to every view;
  // the playback time, the camera, the DFPs and the weather stay. The gap fill works its answer out again.
  function setPuck(slot, seat) {
    if (!baseFlight) return;
    const next = { ...pucks };
    if (puckSeat(seat)) next[slot] = puckSeat(seat);
    else delete next[slot];
    pucks = next;
    if (puckKey) app.storage.set(puckKey, pucks);
    flight = withPucks(baseFlight, pucks);
    map.setFlight(flight, { keepView: true });
    ui.showFlight(flight);
    flightCount++;
    refill();
    renderReadouts();
    redraw();
    app.status(`Debrief: ${ui.summary()}`);
  }

  // "Close flight": back to the empty screen (#23, #25).
  function closeFlight() {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    stopClock = null;
    pendingReadout?.();
    stopFill?.();
    stopFill = null;
    gapFill = { result: null, running: false, key: '' };
    flight = null;
    baseFlight = null;
    pucks = {};
    puckKey = null;
    puckPanel.render(null);
    clock = null;
    metars.setFlight(null);
    savedRadar.setFlight(null);
    weatherWritten = null;
    offerPressed = false;
    windGrid = [];
    winds.setFlight(null);
    dfpKey = null;
    setDfps([], { changed: false });
    unsaved = false;
    bar.setClock(null);
    map.setFlight(null);
    ui.showFlight(null);
    ui.setGapFill(null);
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
          const kept = savedRadar.state().saved;
          const write = (weather) => toDebriefFile(flight, dfpsForFile(dfps), sessionSettings(currentStandards(), clock.t, weather, pucks));
          // The opener refuses a file over MAX_DEBRIEF_BYTES (counted in bytes), so a save that would be is made without the radar.
          const built = buildDebriefFile({
            write, weather: kept, window: { startT: flight.startT, endT: flight.endT }, maxBytes: MAX_DEBRIEF_BYTES, sizeOf: (text) => new Blob([text]).size,
          });
          downloadText(built.text, debriefFileName(flight.startT), { type: 'application/json' });
          unsaved = false;
          // Only pictures that went into the file count as saved; a debrief saved without them still asks on close.
          weatherWritten = built.wrote ? kept : null;
          renderSavedWeather();
          ui.setMessage(built.left);
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
          const text = await file.text();
          const opened = readDebriefFile(text, { settings: settingsRules(app.standards?.limits ?? {}, { weather: true, pucks: true }) });
          const next = loadFlight(opened.files);
          return { flight: next, opened, text };
        }, ({ flight: next, opened, text }) => {
          const filePucks = pucksFromSettings(opened.settings); // null when the file names none: the browser's choice stands
          flight = withPucks(next, filePucks ?? {}); // leadAt reads it for the DFP flags
          const patch = standardsPatch(opened.settings);
          if (patch && app.standards) app.standards.update(patch);
          // The saved radar is checked against this flight's own window; a bad block is left out, the rest opens.
          // Pictures outside the flight's window are left out and counted in a line (F4b); a block over the length or not
          // text (which the file reader drops unseen) is left out with a line too (F4a).
          const wx = savedFromSetting(weatherSettingOf(text, opened.settings), { startT: next.startT, endT: next.endT });
          return { flight: next, pucks: filePucks, dfps: dfpsFromFile(opened.dfps, leadAt), t: opened.settings[TIME_KEY], weather: wx.saved, notice: wx.problem ?? (droppedNotice(wx.dropped) || undefined) };
        });
      },
      csv() {
        if (!flight) return;
        downloadText(toCsv(flight, { leadWindAt: leadWindVector }), csvFileName(flight.startT), { type: 'text/csv' });
      },
      close() {
        if (!flight) return;
        const dfpsAtRisk = unsaved && dfps.length > 0;
        const radarAtRisk = weatherUnsaved();
        if ((dfpsAtRisk || radarAtRisk) && !confirm([
          'Close this flight?',
          dfpsAtRisk ? "Its DFPs stay in this browser, but they aren't in a saved debrief file yet." : '',
          radarAtRisk ? "The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours." : '',
        ].filter(Boolean).join(' '))) return;
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
    // A new flight replaces this one, and with it the radar that can't be fetched again (Y4).
    if (weatherUnsaved() && !confirm("Replace this flight? The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours.")) return;
    busy = true;
    ui.setBusy(what);
    filePanel.setBusy(true);
    try {
      const result = await work();
      if (closed) return;
      const session = prepare(result);
      show(session);
      ui.setMessage(session.notice ?? null);
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
  ui.onSaveWx(() => {
    if (!flight) return;
    offerPressed = true;
    // The 3 hours may have passed while the button was on screen: say "Not kept" instead of doing nothing (Y8).
    if (!radarKept(flight.endT, Date.now() / 1000)) renderSavedWeather();
    else savedRadar.start({ startT: flight.startT, endT: flight.endT, bounds: flightLatLonBounds(flight) });
  });
  ui.onCancelWx(() => savedRadar.cancel());
  ui.onReset(() => layout.reset());

  let lastWindKey = '';
  const stopLayout = layout.subscribe((values) => {
    ui.applyLayout(values);
    standardsPanel?.setCollapsed(!values.standardsOpen);
    filePanel.setCollapsed(!values.filesOpen);
    puckPanel.setCollapsed(!values.puckOpen);
    tennisPanel.element.hidden = !values.tennisOpen;
    if (values.tennisOpen) tennisPanel.render(tennisNow());
    // Turning Winds aloft or the wind arrows on, or picking a model, redraws
    // the Lead line and asks again for any that failed; anything else only
    // touches the METAR line and the arrows' words.
    const windKey = `${values.wxWinds} ${values.wxWindModel} ${values.wxWindArrows}`;
    if (windKey !== lastWindKey) {
      lastWindKey = windKey;
      winds.retry();
      renderReadouts();
      refill();
    } else {
      renderMetar();
      renderWindArrows();
    }
    renderSavedWeather();
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
    stopFill?.();
    stopFrames?.();
    pendingReadout?.();
    stopClock?.();
    stopLayout();
    metars.dispose();
    winds.dispose();
    window.removeEventListener('beforeunload', onBeforeUnload);
    savedRadar.dispose();
    controls.dispose();
    standardsPanel?.dispose();
    map.dispose();
    view3d.dispose();
    ui.dispose();
    stylesheet.remove();
  };
}

export default { id: 'debrief', title: 'Debrief Viewer', mount };
