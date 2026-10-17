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
import { sampleAt, headingAt } from '../../flight-data/flight.js';
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
import { withTimings, readTimings, timingStorageKey } from './gps-timing.js';
import { withAltitudes, readAltitudes, altitudeStorageKey } from './altitude.js';
import { createTerrainHeights } from './terrain-heights.js';
import { groundPhases } from '../../flight-data/altitude.js';
import { createMapView } from './map2d/view.js';
import { createView3d } from './view3d/view.js';
import { createFlightSpace, toXYFor } from './airspace.js';
import { groundLevel } from './view3d/ground.js';
import { AIRPORTS } from '../../airfields/airports-data.js';
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
import { TIME_KEY, weatherSettingOf, buildDebriefFile, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName, pucksFromSettings, timingsFromSettings, altitudesFromSettings } from './debrief-session.js';
import { createSavedRadarFeed, offerState } from './weather/saved-radar-feed.js';
import { radarKept, framesToDraw, savedNoteLine, savedFromSetting, droppedNotice, SAVED_ALPHA } from './weather/saved-radar.js';
import { createDropPanel } from './drop-panel.js';
import {
  DROP_ALLOWED, DROP_FILE_RULES, presetPatch, releaseAt, parseReleaseTime, typedWindFrom, dropWind, dropGround, runDrop, loadAt, dropWords,
  dropStorageKey, readDropPlace, dropForFile, dropFromFile, runInFor, zoneShape,
} from './drop.js';
import { TERRAIN_ZOOM } from './terrain-heights.js';
import { latLonToLocalFt, localFtToLatLon, lonLatToTile } from '../../core/geo.js';
import { headingRadToCompassDeg } from '../../core/angles.js';
import { formatZuluSeconds } from '../../core/time.js';
import { FT_PER_NM } from '../../core/units.js';

const STYLESHEET = new URL('./debrief.css', import.meta.url).href;

function mount(root, app) {
  const stylesheet = h('link', { rel: 'stylesheet', href: STYLESHEET });
  document.head.append(stylesheet);

  // The view and paint are checked against their lists (D141, D138); other values fall back to the defaults.
  const layout = createSettings(app.storage, LAYOUT_DEFAULTS, {
    allowed: {
      view: [...VIEW_ALLOWED], paint3d: PAINT_OPTIONS.map((o) => o.value), wxSatelliteLayer: Object.keys(SATELLITE_LAYERS), wxWindModel: Object.keys(WIND_MODELS),
      ...CAMERA_ALLOWED,
      ...DROP_ALLOWED,
    },
  });
  const controls = createControls(layout);
  const bar = createPlaybackBar({ time: app.time });
  const canExample = typeof app.exampleText === 'function';
  const standardsPanel = app.standards && createStandardsPanel({ standards: app.standards, layout });
  const dfpPanel = createDfpPanel({ time: app.time, on: dfpActions() });
  const filePanel = createFilePanel({ layout, canExample, on: fileActions() });
  const tennisPanel = createTennisPanel({ controls, layout });
  const dropPanel = createDropPanel({ controls, layout, on: dropActions() });
  const puckPanel = createPuckPanel({
    layout, swatch: shipSwatch,
    on: {
      set: (slot, seat) => setPuck(slot, seat),
      setTimestamps: (slot, value) => setTiming(slot, { recorded: value === 'recorded' }),
      setShift: (slot, value) => setTiming(slot, { shiftS: Number(value) }),
      setAltitude: (slot, value) => setAltitude(slot, value),
    },
  });
  const ui = createLayout({
    layout, controls, bar, canExample, listen: app.listen,
    flightExtras: [puckPanel.element, filePanel.element],
    formationExtras: [tennisPanel.element, dropPanel.element, dfpPanel.element, ...(standardsPanel ? [standardsPanel.element] : [])],
  });
  const currentStandards = () => app.standards?.get() ?? DEFAULT_STANDARDS;
  root.append(ui.element);

  let flight = null;
  // The GPS puck (DB-23): the flight as loaded, each ship's puck seat ({ slot: 'front' | 'rear' }), and where they are
  // kept in this browser. `flight` is baseFlight with each ship moved from its puck (the same object when none is set).
  let baseFlight = null;
  let pucks = {};
  let puckKey = null;
  // The GPS timestamps (DB-25): each ship's choices away from the defaults ({ slot: { recorded?, shiftS? } }) and where
  // they are kept. Applied to baseFlight first (the puck move and the gap fill read the times), then the pucks.
  let timings = {};
  let timingKey = null;
  // The altitude check (DB-28): each ship kept at its recorded heights ({ slot: { recorded: true } }), where that is kept,
  // and the terrain heights under the ground fixes (loaded once per flight; the flight is checked again when they land).
  let altitudes = {};
  let altitudeKey = null;
  let terrain = null;
  /** The terrain for the check: its heights once every tile has come or been given up on, never half-way (no flip-flop while loading). */
  const terrainNow = () => {
    const state = terrain?.state() ?? 'none';
    return { refAt: terrain && state !== 'loading' ? terrain.refAt : null, terrain: state };
  };
  /** baseFlight retimed (DB-25), moved from its pucks (DB-23) and its heights corrected from the ground (DB-28): the flight every view shows. */
  const sourceFlight = (base, t, p, a = altitudes) => {
    let timed = base;
    try {
      timed = withTimings(base, t);
    } catch (err) {
      if (err?.name !== 'KmlError') throw err; // shifted so far the tracks no longer overlap: as recorded
    }
    return withAltitudes(withPucks(timed, p), a, terrainNow());
  };
  /** The terrain heights under the shown flight's ground fixes; a landing (or a failure) checks the flight again. */
  function loadTerrain(shown) {
    terrain?.dispose();
    const points = Object.values(shown.tracks).flatMap((tr) => {
      const p = groundPhases(tr);
      return [...p.start, ...p.end];
    });
    terrain = createTerrainHeights({ points, timers: app.scheduler, doc: document, onChange: () => { if (baseFlight) reshowSource(); } });
  }
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
  // The simulated drop (DB-36): this flight's release time and point of impact ({ releaseT, point: { lat, lon } }), kept
  // in the browser beside its DFPs and in the debrief file; whether the 2D map waits for the tap that places the point;
  // the terrain tiles under the drop (only with the 3D Ground on "Terrain and satellite"); and the last answer worked out.
  let dropPlace = { releaseT: null, point: null };
  let dropKey = null;
  let placing = false;
  let dropTerrain = null;
  let dropTerrainKey = '';
  let dropHeld = { key: '', result: null, zoneGroundFt: null, trail: null };
  let lastDropLoad = layout.get().dropLoad;
  let lastDropOpen = layout.get().dropOpen;
  let lastRunIn = layout.get().dropRunIn;
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

  // Airspace and airfields round the flight (DB-24): the SOF's shared data, picked for this flight's area. The files load
  // only once Airspace is on; a landing or failed file redraws and updates the menus' line. Never holds up the flight.
  const space = createFlightSpace({ onChange: () => { renderSpace(); redraw(); } });
  function spaceState() {
    const on = layout.get();
    if (!flight) return null;
    if (on.airspace) space.want();
    return space.state({ fieldFt: homeFieldFt(), hidden: on.airspaceHidden });
  }
  // The ground the tracks recorded (DB-26): worked out once per flight shown (and home field), for the 3D view's ground and its runways' heights.
  let groundHeld = { flight: null, fieldFt: null, value: null };
  function groundNow() {
    if (!flight) return null;
    const fieldFt = homeFieldFt();
    if (groundHeld.flight !== flight || groundHeld.fieldFt !== fieldFt) {
      groundHeld = { flight, fieldFt, value: groundLevel(flight, { fieldFt, airports: AIRPORTS, toXY: toXYFor(flight.ref) }) };
    }
    return groundHeld.value;
  }
  // AGL airspace limits are taken above homeFieldFt() (the home field's elevation, or Moose Jaw's), as the SOF does.
  // What the views draw: null with both switches off; the key names everything the 3D view builds from (the runways move with the tracks' ground).
  function spaceNow() {
    const on = layout.get();
    if (!flight || (!on.airspace && !on.airfields)) return null;
    const st = spaceState();
    return {
      key: `${st.key}|${on.airspace}|${on.airfields}|${st.airfields.length}|${groundNow()?.shiftFt ?? 0}`,
      toXY: space.toXY,
      fieldFt: homeFieldFt(),
      shiftFt: groundNow()?.shiftFt ?? 0,
      airspace: on.airspace ? st.volumes : null,
      airfields: on.airfields ? st.airfields : null,
    };
  }
  function renderSpace() {
    ui.setSpace(flight ? spaceState() : null);
    ui.setGround(groundNow()?.words ?? '');
  }

  const map = createMapView(ui.canvas, {
    space: () => spaceNow(),
    tennis: tennisNow,
    fills: shownFills,
    timers: app.scheduler,
    time: () => clock?.t ?? 0,
    layers: () => layout.get(),
    dfps: () => dfps.map((d) => ({ x: d.x, y: d.y, label: dfpLabel(dfps, d) })),
    drop: () => dropDrawing(),
    placing: () => placing && layout.get().dropOpen && Boolean(flight),
    onTap: (x, y) => placeDropPoint(x, y),
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
    space: () => spaceNow(),
    fills: shownFills,
    drop: () => dropDrawing(),
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
    // The ground the tracks recorded (DB-26): Chase and Cockpit stand on it, and the "From the tracks" ground setting.
    ground: () => groundNow(),
    setCamera: (patch) => layout.update(patch),
    // The "Terrain and satellite" ground's status and credit lines (DB-27).
    onTerrain: (state) => ui.setTerrain(state),
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
    return readoutsAt(flight, clock.t, { standards: currentStandards(), leadWind: lead ? leadWindVector(clock.t, lead.altFt) : null, smoothG: layout.get().smoothG });
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

  // ---- The simulated drop (DB-36; spec "Simulated drop"; drop.js has the plain values and core drop.js the fall) ----

  /** The point of impact in this flight's map feet, or null. */
  const dropPoint = () => (dropPlace.point && flight ? latLonToLocalFt(flight.ref, dropPlace.point.lat, dropPlace.point.lon) : null);

  /** The Debrief's model winds aloft for the fall, at the release time: { at(z) → { dirDeg, kt } | null, why, label, key }. Asks for them once. */
  function dropModelWind(releaseT) {
    const on = layout.get();
    const model = windModelFor(on.wxWindModel, flight.startT);
    if (!model) return { at: null, why: 'No model winds go back this far.', label: 'model', key: 'none' };
    const { label } = WIND_MODELS[model];
    const entry = winds.get(model);
    if (!entry) return { at: null, why: `No ${label} winds: Lead's track has no position.`, label, key: 'nopoint' };
    const key = `${model}:${entry.state}`;
    if (entry.state === 'ready') return { at: (z) => windAt(entry.hours, releaseT, z, { fieldFt: homeFieldFt() })?.wind ?? null, why: '', label, key };
    const retry = 'Close the Drop box and open it again to try again.';
    const why = entry.state === 'loading' ? `${label} winds still loading.`
      : entry.state === 'busy' ? `${label} winds: Open-Meteo is busy. ${retry}` : windFailureText(label, entry.failure, retry);
    return { at: null, why, label, key };
  }

  /**
   * The terrain under the drop, with the 3D Ground on "Terrain and satellite" (DB-27's tiles and decoder, through
   * terrain-heights.js): the tiles round the release and the point of impact (a nautical mile each way, for the drift) and
   * under the tracks' ground fixes, whose height moves the terrain to the tracks' ground as the 3D view's does.
   * Returns { at(x, y) → feet or NaN, state, key }; { at: null, state: 'none' } with any other Ground.
   */
  function dropTerrainFor(release, point) {
    if (layout.get().datum3d !== 'terrain') {
      dropTerrain?.dispose();
      dropTerrain = null;
      dropTerrainKey = '';
      return { at: null, state: 'none', key: 'none' };
    }
    const g = groundNow();
    const toLl = (x, y) => localFtToLatLon(flight.ref, x, y);
    const points = [];
    if (Number.isFinite(g?.x) && Number.isFinite(g?.y)) points.push(toLl(g.x, g.y));
    const nm = FT_PER_NM;
    for (const p of [release, point].filter(Boolean)) {
      for (const [dx, dy] of [[0, 0], [nm, 0], [-nm, 0], [0, nm], [0, -nm]]) points.push(toLl(p.x + dx, p.y + dy));
    }
    const key = [...new Set(points.map((ll) => {
      const tile = lonLatToTile(ll.lon, ll.lat, TERRAIN_ZOOM);
      return `${tile.x}/${tile.y}`;
    }))].sort().join(' ');
    if (key !== dropTerrainKey) {
      dropTerrain?.dispose();
      dropTerrainKey = key;
      dropTerrain = createTerrainHeights({ points, timers: app.scheduler, doc: document, onChange: () => { renderDrop(); redraw(); } });
    }
    const state = dropTerrain.state();
    if (state === 'none') return { at: null, state: 'none', key: 'none' };
    const mid = Number.isFinite(g?.x) ? toLl(g.x, g.y) : null;
    const middle = mid ? dropTerrain.refAt(mid.lat, mid.lon) : NaN;
    const shiftFt = Number.isFinite(middle) && Number.isFinite(g?.groundFt) ? g.groundFt - middle : NaN;
    const heights = dropTerrain;
    const at = Number.isFinite(shiftFt) ? (x, y) => {
      const ll = toLl(x, y);
      return heights.refAt(ll.lat, ll.lon) + shiftFt;
    } : null;
    return { at, state: state === 'loading' || at ? state : 'failed', key: `${key}:${state}:${Number.isFinite(shiftFt)}` };
  }

  /** The drop worked out for now, while its box is open: drop.js runDrop's result, kept until anything it reads changes. */
  function dropNow() {
    const on = layout.get();
    if (!on.dropOpen || !flight) return null;
    const point = dropPoint();
    const slot = on.dropShip;
    const release = Number.isFinite(dropPlace.releaseT) ? releaseAt(flight.tracks[slot], dropPlace.releaseT, slot) : null;
    const from = release && !release.reason ? release : null;
    const model = from && on.dropWind === 'model' ? dropModelWind(dropPlace.releaseT) : { at: null, why: '', label: 'model', key: 'off' };
    const terrainNowDrop = from || point ? dropTerrainFor(from, point) : { at: null, state: 'none', key: 'none' };
    const g = groundNow();
    const trackFt = g?.groundFt ?? homeFieldFt();
    const settingsKey = Object.keys(on).filter((k) => k.startsWith('drop')).map((k) => on[k]).join('|');
    const key = [flightCount, dropPlace.releaseT, dropPlace.point?.lat, dropPlace.point?.lon, dropPlace.point?.runInDeg, settingsKey, model.key, terrainNowDrop.key, trackFt].join('#');
    if (key === dropHeld.key) return dropHeld.result;
    const ground = dropGround({
      trackFt, trackWords: g?.source === 'tracks' ? "the tracks' ground" : "the home field's elevation", terrainAt: terrainNowDrop.at, terrain: terrainNowDrop.state,
    });
    const wind = dropWind({
      mode: on.dropWind, model: model.at, modelWhy: model.why, modelLabel: model.label, typed: typedWindFrom(on),
      releaseFt: from?.z ?? trackFt, groundFt: from ? ground.at(from.x, from.y) : trackFt,
    });
    const result = runDrop({ release, point, on, wind, ground, placedRunInDeg: dropPlace.point?.runInDeg ?? null });
    const zoneGroundFt = point ? ground.at(point.x, point.y) : trackFt;
    dropHeld = { key, result, zoneGroundFt, trail: result.ok ? result.fall.path.map((p) => ({ x: p.x, y: p.y, altFt: p.z })) : null };
    return result;
  }

  /** What the map and the 3D view draw for the drop (map2d/drop-layer.js says what it holds), or null while the box is shut. */
  function dropDrawing() {
    const on = layout.get();
    if (!on.dropOpen || !flight) return null;
    const r = dropNow();
    const point = dropPoint();
    let zone = r?.ok ? r.zone : null;
    if (!zone && point) {
      // Before a drop, a box lies along the run-in kept when it was placed (or its set heading); only a drop zone saved
      // without one falls back to the chosen ship's track now.
      const track = flight.tracks[on.dropShip];
      const hdg = track && clock ? headingAt(track, clock.t) : null;
      zone = zoneShape(point, on, runInFor(on, dropPlace.point?.runInDeg, hdg === null ? 360 : headingRadToCompassDeg(hdg)));
    }
    const out = { zone: zone ? { ...zone, groundFt: dropHeld.zoneGroundFt ?? groundNow()?.groundFt ?? homeFieldFt() } : null, trail: null, release: null, impact: null, impactWords: '', note: '', carp: null, now: null };
    if (!r?.ok) return out;
    const rel = r.release;
    out.trail = dropHeld.trail;
    out.release = { x: rel.x, y: rel.y, altFt: rel.z };
    if (r.impact) {
      out.impact = { x: r.impact.x, y: r.impact.y, altFt: r.impact.z };
      out.impactWords = r.miss ? `Impact ${Math.round(r.miss.missFt).toLocaleString('en-US')} ft at ${r.miss.clock} o'clock` : 'Impact';
    }
    out.note = r.windNote;
    if (r.carp) {
      const c = r.carp;
      // A short release line along the track: two seconds of the pass either side of the CARP, at least 150 ft (for the eye only).
      const half = Math.max(150, 2 * Math.hypot(rel.vx, rel.vy));
      const line = c.u ? [[c.x - c.u.x * half, c.y - c.u.y * half], [c.x + c.u.x * half, c.y + c.u.y * half]] : [[c.x, c.y], [c.x, c.y]];
      out.carp = { x: c.x, y: c.y, altFt: c.z, groundFt: out.zone?.groundFt ?? rel.z - rel.aglFt, line };
    }
    // The load itself while the replay is inside its fall.
    const t = clock?.t ?? 0;
    const endT = rel.t + (r.impact?.t ?? r.fall.path[r.fall.path.length - 1].t);
    if (t >= rel.t && t < endT) out.now = loadAt(r, t);
    return out;
  }

  /** The Drop box: shown or hidden with its Tools tick, and its answer and buttons for now. */
  function renderDrop() {
    const on = layout.get();
    dropPanel.element.hidden = !on.dropOpen;
    if (!on.dropOpen) return;
    dropPanel.showFor(on);
    const r = flight ? dropNow() : null;
    dropPanel.render(dropWords(r, { placed: Boolean(dropPlace.point) }), {
      flight: Boolean(flight), placing, placed: Boolean(dropPlace.point), nowText: clock ? formatZuluSeconds(clock.t) : '',
      is3d: on.view === '3d', hasRelease: Number.isFinite(dropPlace.releaseT),
    });
  }

  /** A new release time or point of impact for this flight, kept in the browser beside its DFPs. */
  function setDropPlace(next) {
    dropPlace = next;
    if (dropKey) app.storage.set(dropKey, dropPlace);
    renderDrop();
    redraw();
  }

  function setPlacing(on) {
    placing = Boolean(on);
    map.setPlacing(placing);
  }

  /** The tap on the 2D map that places the point of impact (map feet). */
  function placeDropPoint(x, y) {
    if (!flight) return;
    const ll = localFtToLatLon(flight.ref, x, y);
    // The run-in is the chosen ship's track now, kept with the point so the box stays put as the replay plays.
    const track = flight.tracks[layout.get().dropShip];
    const hdg = track && clock ? headingAt(track, clock.t) : null;
    setPlacing(false);
    setDropPlace({ ...dropPlace, point: { lat: ll.lat, lon: ll.lon, ...(hdg === null ? {} : { runInDeg: headingRadToCompassDeg(hdg) }) } });
  }

  function dropActions() {
    return {
      dropNow() {
        if (clock) setDropPlace({ ...dropPlace, releaseT: clock.t });
      },
      dropAt(text) {
        if (!flight) return '';
        const t = parseReleaseTime(text, flight.startT, flight.endT);
        if (t === null) return `Type a time in the replay as hh:mm:ssZ, from ${formatZuluSeconds(flight.startT)} to ${formatZuluSeconds(flight.endT)}.`;
        setDropPlace({ ...dropPlace, releaseT: t });
        return '';
      },
      clear: () => setDropPlace({ ...dropPlace, releaseT: null }),
      place() {
        setPlacing(true);
        renderDrop();
      },
      cancelPlace() {
        setPlacing(false);
        renderDrop();
      },
      preset: () => layout.update(presetPatch(layout.get().dropLoad)),
    };
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
    renderDrop();
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
  // session is { flight, dfps?, t?, pucks?, timings?, altitudes? }: DFPs, a time, GPS puck seats, timestamp and altitude choices from a debrief file.
  function show(session) {
    stopFrames?.();
    stopFrames = null;
    stopClock?.();
    baseFlight = session.flight;
    const fingerprint = flightFingerprint([...baseFlight.files].sort((a, b) => a.slot - b.slot).map((f) => f.text));
    puckKey = puckStorageKey(fingerprint);
    pucks = readPucks(session.pucks ?? app.storage.get(puckKey, {}));
    if (session.pucks) app.storage.set(puckKey, pucks); // an opened debrief file's choice wins, as its DFPs do
    timingKey = timingStorageKey(fingerprint);
    timings = readTimings(session.timings ?? app.storage.get(timingKey, {}));
    if (session.timings) app.storage.set(timingKey, timings);
    altitudeKey = altitudeStorageKey(fingerprint);
    altitudes = readAltitudes(session.altitudes ?? app.storage.get(altitudeKey, {}));
    if (session.altitudes) app.storage.set(altitudeKey, altitudes);
    terrain?.dispose();
    terrain = null;
    flight = sourceFlight(baseFlight, timings, pucks);
    loadTerrain(flight);
    puckPanel.render(flight, pucks, timings, altitudes);
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
    // The drop (DB-36): an opened debrief file's wins, as its DFPs do; checked against this flight's window either way.
    dropKey = dropStorageKey(fingerprint);
    dropPlace = readDropPlace(session.drop ?? app.storage.get(dropKey, null), flight.startT, flight.endT);
    if (session.drop) app.storage.set(dropKey, dropPlace);
    dropHeld = { key: '', result: null, zoneGroundFt: null, trail: null };
    setPlacing(false);
    bar.setClock(clock);
    space.setFlight(flight);
    map.setFlight(flight);
    ui.showFlight(flight);
    filePanel.setFlight(true);
    renderSpace();
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
    reshowSource();
  }

  // A ship's timestamp choice or time shift changed (DB-25): as a puck change, from the as-loaded fixes.
  function setTiming(slot, patch) {
    if (!baseFlight) return;
    const next = { ...timings, [slot]: { ...timings[slot], ...patch } };
    timings = readTimings(next);
    if (timingKey) app.storage.set(timingKey, timings);
    reshowSource();
  }

  // A ship's altitude choice changed (DB-28): as a puck change, from the as-loaded fixes.
  function setAltitude(slot, value) {
    if (!baseFlight) return;
    const next = { ...altitudes };
    if (value === 'recorded') next[slot] = { recorded: true };
    else delete next[slot];
    altitudes = readAltitudes(next);
    if (altitudeKey) app.storage.set(altitudeKey, altitudes);
    reshowSource();
  }

  // The shown flight worked out again from the as-loaded fixes and handed to every view; the playback time, the
  // camera, the DFPs and the weather stay. A time shift can move the playback window by a second or two: the clock is
  // then made again over the new window, at the same moment and speed. The gap fill works its answer out again.
  function reshowSource() {
    flight = sourceFlight(baseFlight, timings, pucks);
    if (clock && (clock.startT !== flight.startT || clock.endT !== flight.endT)) {
      const old = clock;
      stopFrames?.();
      stopFrames = null;
      stopClock?.();
      clock = createClock({ startT: flight.startT, endT: flight.endT });
      clock.setSpeed(old.speed);
      clock.seek(old.t);
      stopClock = clock.onChange(onClock);
      bar.setClock(clock);
      if (old.playing) clock.play();
    }
    map.setFlight(flight, { keepView: true });
    ui.showFlight(flight);
    puckPanel.setChecks(flight);
    renderSpace(); // the 3D ground reads the corrected heights (DB-26, DB-28)
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
    timings = {};
    timingKey = null;
    altitudes = {};
    altitudeKey = null;
    terrain?.dispose();
    terrain = null;
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
    dropKey = null;
    dropPlace = { releaseT: null, point: null };
    dropHeld = { key: '', result: null, zoneGroundFt: null, trail: null };
    dropTerrain?.dispose();
    dropTerrain = null;
    dropTerrainKey = '';
    setPlacing(false);
    bar.setClock(null);
    space.setFlight(null);
    map.setFlight(null);
    ui.showFlight(null);
    ui.setGapFill(null);
    renderSpace();
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
          // The drop goes in only when one is set (DB-36), so a debrief without one doesn't change the Drop box when opened.
          const dropSettings = Number.isFinite(dropPlace.releaseT) || dropPlace.point ? dropForFile(dropPlace, layout.get()) : {};
          const write = (weather) => toDebriefFile(flight, dfpsForFile(dfps), { ...sessionSettings(currentStandards(), clock.t, weather, pucks, timings, altitudes), ...dropSettings });
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
          const opened = readDebriefFile(text, { settings: { ...settingsRules(app.standards?.limits ?? {}, { weather: true, pucks: true }), ...DROP_FILE_RULES } });
          const next = loadFlight(opened.files);
          return { flight: next, opened, text };
        }, ({ flight: next, opened, text }) => {
          const filePucks = pucksFromSettings(opened.settings); // null when the file names none: the browser's choice stands
          const fileTimings = timingsFromSettings(opened.settings); // the same for the timestamps (DB-25)
          const fileAltitudes = altitudesFromSettings(opened.settings); // and the altitude choices (DB-28)
          flight = sourceFlight(next, fileTimings ?? {}, filePucks ?? {}, fileAltitudes ?? {}); // leadAt reads it for the DFP flags
          const patch = standardsPatch(opened.settings);
          if (patch && app.standards) app.standards.update(patch);
          // The saved radar is checked against this flight's own window; a bad block is left out, the rest opens.
          // Pictures outside the flight's window are left out and counted in a line (F4b); a block over the length or not
          // text (which the file reader drops unseen) is left out with a line too (F4a).
          const wx = savedFromSetting(weatherSettingOf(text, opened.settings), { startT: next.startT, endT: next.endT });
          // The drop (DB-36): the Drop box's settings from the file, then its release and point of impact (each value range-checked).
          const fileDrop = dropFromFile(opened.settings, next.startT, next.endT);
          if (fileDrop) {
            lastDropLoad = fileDrop.patch.dropLoad ?? lastDropLoad; // the file's load numbers stand, not the preset's
            layout.update(fileDrop.patch);
          }
          return { drop: fileDrop?.place, flight: next, pucks: filePucks, timings: fileTimings, altitudes: fileAltitudes, dfps: dfpsFromFile(opened.dfps, leadAt), t: opened.settings[TIME_KEY], weather: wx.saved, notice: wx.problem ?? (droppedNotice(wx.dropped) || undefined) };
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
  renderDrop();
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
  let lastSmoothG = layout.get().smoothG;
  const stopLayout = layout.subscribe((values) => {
    // The Drop box (DB-36): a new load takes its preset's numbers; opening it asks again for winds that failed; a set run-in
    // starts from the release's track; shutting it stops the placing.
    if (values.dropLoad !== lastDropLoad) {
      lastDropLoad = values.dropLoad;
      layout.update(presetPatch(values.dropLoad)); // tells this again with the new numbers (or nothing, when they already match)
    }
    if (values.dropOpen && !lastDropOpen) winds.retry();
    if (!values.dropOpen && placing) setPlacing(false);
    lastDropOpen = values.dropOpen;
    const runInSet = values.dropRunIn === 'set' && lastRunIn !== 'set';
    lastRunIn = values.dropRunIn;
    if (runInSet) { // a set heading starts from the run-in kept when the drop zone was placed, else the release's track
      const from = dropPlace.point?.runInDeg ?? (dropHeld.result?.ok ? dropHeld.result.release.trackDeg : null);
      if (Number.isFinite(from)) layout.update({ dropRunInDeg: Math.round(from) || 360 });
    }
    renderDrop();
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
      // "Smooth G" changes the G shown, so the readouts redraw at once (DB-Q4).
      if (values.smoothG !== lastSmoothG) renderReadouts();
    }
    lastSmoothG = values.smoothG;
    renderSavedWeather();
    renderSpace();
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
    terrain?.dispose();
    terrain = null;
    dropTerrain?.dispose();
    dropTerrain = null;
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
