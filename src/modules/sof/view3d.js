// The SOF's 3D view of the weather (SPEC-sof, "3D view", SOF-39, phase 1): the map area swapped for a three.js picture of
// the 450 NM square round home (Dad, 7 Oct; it was 250). The satellite picture is the ground (two tiers, ground3d.js: the whole square at a modest zoom with a sharp patch
// round home), with the radar and lightning pictures laid on it; home and the alternates stand on it as pins with their category in words; the METAR cloud layers hang over them as flat
// round decks at their reported bases; the 25 and 50 NM rings run round home. Phase 2 (SOF-39) adds the model layers: a cloud-cover
// sheet at each model level (see-through, smooth, stacked from the surface up, like ForeFlight's cloud maps), wind barbs at three levels
// and the freezing level, from Open-Meteo's GEM forecast, with a time slider and a toggle for each. A "Cloud at" height control (V2.184, Dad 7 Oct: like ForeFlight's
// cloud forecast) shows the model's cover at one height as a single sheet instead of the slabs or level sheets; it took over the old Layer picker's job (one level at a time).
// They are a model estimate, labelled so, and are removed (never frozen) when the forecast fails or is old. Phase 4 (SOF-39, SOF-40) adds
// the live aircraft from the 2D layer's own relay feed (traffic3d.js), the T-6 drawn large. Phase 3 (SOF-39) adds the airspace volumes
// from a sourced data file (airspace-data.js, drawn in airspace3d.js) and the TACNAV routes at 500 ft above the ground, each with a toggle.
// Also (Dad, 7 Oct): the airports' runways modelled at true size (airports3d.js, an Airports toggle), and an airspace volume's name and limits are not written
// on it any more: they float beside the pointer while it is over the volume (a ray-cast on the fills, at most ten a second and only while the pointer moves).
// It is for situational awareness only: it checks no limit and never raises or clears a caution.
// Three more things (SOF-39, Dad 7 Oct): a Full screen button (the browser's fullscreen on the 3D view, or a fixed layer over the whole window when
// the browser refuses), an Orbit toggle that turns the camera slowly round home (the one case where the view draws every frame, through the
// scheduler's frame, and only while Orbit is on and the view is shown; any camera input turns it off), and the Airspace log panel (airspace-log-view.js)
// with an amber tag that stays on for each aircraft that is not a T-6 inside a watched area.
// Tour (Dad, 7 Oct): a Tour toggle beside Orbit turns Orbit on and flies the camera round a list of targets (tour-model.js): the Moose Jaw circuit, Regina, then each airborne
// T-6 in turn (followed, its tag highlighted), about 20 s each; any camera input from the SOF stops it, and Orbit with it. It runs in Orbit's own frame loop, so nothing runs while
// both are off.
// Weather that looks right in 3D (Dad, 7 Oct): radar blocks in the model cloud with a faint rain curtain to the ground (Dad, 8 Oct; Rain to ground), lightning bolts, a faint satellite cloud sheet, surface fronts with H and L marks, and a
// gentle wind flow (weather3d-layers.js builds them, weather3d.js draws, weather3d-model.js decides); the wind barbs are smaller and behind a Barbs toggle (off). Full screen is
// the whole SOF picture's (fullscreen.js), shared with the 2D map's button.
//
// What is drawn and what the words say is decided in scene3d-model.js and model-clouds.js (tested in Node); model-layers3d.js builds the
// model layers' three.js objects, traffic3d.js the aircraft's and airspace3d.js the airspace's (airspace-model.js decides what is fit to
// draw and what its words say). This file builds the rest, the camera's hands and the model and airspace controls, and touches the page.
//
// three.js is loaded only when the view is first opened (ui-kit `loadThree`). It draws only while shown, and only when something
// changed (a new report or picture, a tile arriving, the camera moving), through the scheduler's frame: nothing runs while it
// sits still (but for Orbit, above). Hiding it, or closing the module, frees everything three.js made and removes its canvas, because a canvas whose
// WebGL context has been let go can't be given another.
//
// Real terrain (Dad, 7 Oct): the ground is a height-mapped mesh from the public Terrarium elevation tiles (terrain3d.js loads them, terrain-model.js decodes and shades them, ground3d.js
// draws them), heights times the same height scale. Radar shafts, lightning bolts, front walls, pins, drop lines and rings stand on it; runways stay at their field elevation, METAR decks at
// field elevation plus base, and aircraft at their reported altitude whatever the ground does (one under the terrain is drawn just above it, tagged "below terrain?"). A Terrain switch
// flattens it back to the old plane. The ground starts flat at home's elevation and rises as tiles arrive.
//
// Towns (Dad, 7 Oct): Moose Jaw, Regina, Swift Current and Saskatoon as clusters of low grey boxes standing on the terrain (towns3d.js builds them from towns-data.js): plainly schematic,
// the key says so. A Towns toggle (on); each town's name shows when zoomed in, or while the pointer is over the town.
//
// World frame (ui-kit three-aircraft.js): X east, Y north, Z up, in the map's local feet. A height is feet above sea level times
// the height scale (the "3D height scale" setting); the ground is the home field's elevation.
import { h } from '../../ui-kit/dom.js';
import { loadThree, webglSupported, matchProjection, worldToScreen } from '../../ui-kit/three-aircraft.js';
import { ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { RING_NM, FT_PER_NM } from './map-view.js';
import { createGround3d, MAX_GROUND_TILES, INNER_NM } from './ground3d.js';
import { createTerrain3d } from './terrain3d.js';
import { buildTowns } from './towns3d.js';
import { terrainWords, TERRAIN_CREDIT } from './terrain-model.js';
import { createWeather3dLayers, weatherKeyWords } from './weather3d-layers.js';
import { FRONTS_CREDIT } from './fronts.js';
import {
  AREA_NM, AREA_FT, DEFAULT_AREA_NM, DECK_FT, CATEGORY_TOKENS, ZOOM_STEP, KEY_ORBIT_PX, KEY_PAN_PX, ORBIT_DEG_PER_PX, fitZoom, orbitBy, zoomCamera, panBy, clampLookAt, homeCamera,
  sceneSignature, formatFeet,
} from './scene3d-model.js';
import { createAirspaceLogView } from './airspace-log-view.js';
import {
  TOUR_DWELL_S, TOUR_FLY_S, TOUR_PITCH_DEG, TOUR_FIELD_AGL_FT, tourStops, nextStopIndex, tourCaption, nextInWords, framingZoom, flyPose,
} from './tour-model.js';
import { buildModelLayers, MODEL_GROUPS } from './model-layers3d.js';
import {
  slabColumnAt, highestSlabTopFt, cloudSlabs, maskSlabs, anchorLowSlab, anchorWords, heightSheet, heightSheetWords, SHEET_HEIGHTS_FT, SLAB_SHEETS, MIN_SLAB_FT,
  NT_MAX_GAIN, NT_OLD_FADE, ANCHOR_NM, ANCHOR_CEILING_AGL_FT,
} from './cloud-field.js';
import { buildHeightSheet } from './cloud-slabs3d.js';
import { createTraffic3d } from './traffic3d.js';
import { CYMJ, magVarWords, noSourceWords } from './sites/index.js';
import { buildAirspace, AIRSPACE_GROUPS, KIND_COLOURS } from './airspace3d.js';
import { buildAirports, RUNWAY_MIN_PX } from './airports3d.js';
import { buildAlerts3d, areaRingXY, ALERT_COLOURS, PIREP_COLOURS, ALERT_COLOUR_WORDS, ALERT_FILL_OPACITY } from './alerts3d.js';
import { buildApproaches } from './approaches3d.js';
import { APPROACH_GROUPS, CORRIDOR, ESTIMATE, ESTIMATE_WORDS, HOLD_DRAW, fieldApproaches, approachGeometry, corridorCheck, corridorSummary } from './approaches-model.js';
import { approachesOf, loadApproachesFor, APPROACHES_LOADING_WORDS, APPROACHES_FAILED_WORDS } from './sites/approaches-load.js';
import { cellFt } from './weather3d-model.js';
import { GLIDE_3D_MS, TRAIL_WINDOW_S } from './traffic-motion.js';
import { airportsFor, AIRPORTS } from './airports-data.js';
import { checkedAirspace, airspaceInSquare, KIND_WORDS, BASE_KINDS, tacnavNote, AIRSPACE_FILL_OPACITY, VIEW_TOP_FT } from './airspace-model.js';
import { airspaceOf, loadAirspaceFor, AIRSPACE_LOADING_WORDS, AIRSPACE_FAILED_WORDS } from './sites/airspace-load.js';
import {
  hourIndex, maxAhead, hourWords, meanLayerCover, unavailableWords, refreshFailedWords, LOADING_WORDS, CREDIT_WORDS, MAX_AHEAD_HOURS, CLOUD_STAGES_FT_AGL,
  CLOUD_COVER_THRESHOLD_PCT, barbStep, CLOUD_SHEET_PX, filledWords, nextAskWords, HRDPS_CHUNKS, modelSetOf, GRID_SIZE,
} from './model-clouds.js';

const BACKGROUND = '#0a141d';
/** render() looks at whether the pictures or the weather changed at most this often (milliseconds). */
const SIGNATURE_CHECK_MS = 1000;
/** The depth range the camera is given after `matchProjection` (feet along the view): wide enough for the 450 NM square at any tilt, with its tallest layers (scaled up for a bigger area). */
const CAMERA_NEAR_FT = -3_500_000;
const CAMERA_FAR_FT = 5_500_000;
/** The model credit: Open-Meteo and the model (Moose Jaw: whichever answered, the finer HRDPS or the global GEM; a US base: NOAA HRRR / GFS). */
const creditWords3d = (model) => modelSetOf(model).credit(model);
/** A pin's line and head are this many screen pixels tall and wide at any zoom (they are scaled with the camera). */
const PIN_PX = Object.freeze({ line: 34, head: 5 });
/** Lines lie this far (scene feet) above what they follow, so the ground never hides them. */
const LIFT_FT = 400;
const WHEEL_ZOOM = 0.0015; // per wheel pixel, as the 2D map
const CLICK_PX = 4; // a press that moves less than this is a click, not a drag
const RING_SEGMENTS = 360; // enough that a ring follows the terrain under it
const DECK_SEGMENTS = 64;
const DECK_COLOUR = '#f2f7fb';
const RING_COLOUR = '#8adfff';
/** An aircraft is under the pointer when its middle is this close on the screen (the 2D map's own HOVER_PX). */
const AIRCRAFT_HOVER_PX = 14;
/** One turn of Orbit takes this many seconds: "about one turn per 2 minutes" (Dad, 7 Oct). An estimate for feel. */
export const ORBIT_SECONDS_PER_TURN = 120; // estimate, SOF-39
/** With reduced motion, Orbit steps this many degrees every this many milliseconds instead of turning smoothly (Dad, 7 Oct). */
export const ORBIT_STEP = Object.freeze({ deg: 15, ms: 2000 });
/** A frame longer than this (a stalled tab) turns the camera no further than this long a frame would. */
const ORBIT_MAX_FRAME_MS = 250;
/** The tour's clock counts real time, but a frame longer than this (the computer slept) counts as no more than this. */
const TOUR_MAX_FRAME_MS = 2000;
/** A town's name shows at this zoom (times the start view) or more, and while the pointer is within its built-up area on the screen (at least TOWN_HOVER_PX). Estimates for feel. */
const TOWN_LABEL_ZOOM = 5;
const TOWN_HOVER_PX = 14;
/** The ground's heights are read from the elevation tiles at most this often while they arrive (milliseconds); an estimate that keeps the page quick. */
const TERRAIN_APPLY_MS = 400;
/** Things that stand on the ground (shafts, bolts, fronts, pins, rings) are made again for new terrain at most this often while tiles are still coming (milliseconds), and once all are in. */
const TERRAIN_DEPS_MS = 4000;
/** The aircraft's credit, always said while the layer is on (adsb.lol's data is ODbL 1.0). */
const AIRCRAFT_CREDIT = 'Aircraft: adsb.lol (ODbL 1.0)';
/** The cloud detail's credit, said while the 2.5 km picture shapes the slabs. */
const DETAIL_CREDIT = 'Cloud detail: ECCC MSC GeoMet, HRDPS total cloud';
/** The observed bases' credit, said while METARs anchor the low cloud. */
const ANCHOR_CREDIT = 'Observed bases: METARs (MET Norway, NOAA)';
const hhmm = (ms) => `${new Date(ms).toISOString().slice(11, 16).replace(':', '')}Z`;

/** A TACNAV route's name shows while the pointer is within this many pixels of its line (Dad, 7 Oct: names only under the pointer). An estimate for feel. */
const ROUTE_HOVER_PX = 10;
/** With every field's approaches shown ("all"), the fixes' words show only at this zoom or more (times the start view), so the whole square is not covered in words. An estimate for feel. */
const APPROACH_ALL_LABEL_ZOOM = 3;
/** The pointer is looked for under the airspace volumes at most this often (about ten a second), and only while it moves over the view. */
const SPACE_PICK_MS = 100;

let nextViewId = 1;

const isColour = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(v.trim());

/**
 * options: { timers (a scheduler scope), getProjection() (the SOF map's projection: toXY and a reference, for the corners of the
 * square), getPictures() (the ground's pictures, radar and lightning over the whole 3D area: { sig, list: [{ image, bbox, alpha }] }, read when it draws),
 * getWeather() (the weather layers' inputs, read when it draws and when `touch()` says something may have changed: { sig, radar, lightning, satellite, fronts, lines },
 * each picture null or { id, image, bbox, stale }, `fronts` as fronts.js `frontsView` with a `key`, `lines` the status strip's words; see map.js `weather3d`), fullScreen
 * (fullscreen.js's object, for the Full screen button), onLost() (the graphics
 * context was lost: the caller goes back to 2D), getSite() (the home base's site profile, sites/: its airspace, towns, tour targets and magnetic variation; Moose Jaw's
 * unless the caller gives it), routes (the TACNAV routes to draw, or a function that gives them, from the Debrief's `ROUTES` as `map.js` gives them:
 * { name, paths: [[[lon, lat], ...]] }), airspace (the entries to draw instead of the site profile's, for a test), onAirspaceLogOptions
 * ({ showT6, showAll }: the log panel's two ticks changed), now() (the clock in milliseconds, for gliding the aircraft between answers), onTrails(on)
 * (the Trails button was pressed), onModelHour(ms) (the model hour shown changed, or null with no model: the map asks for the HRDPS cloud picture at that hour),
 * onRainToGround(on) (the Rain to ground button was pressed: the caller keeps the choice in the SOF's "view3d" settings), onApproaches({ on, field }) (the
 * Approaches button or its field picker changed: the caller keeps the choice in the same settings), onCorridors(results) (the arrival corridor check's answer
 * for each field drawn, Map icao -> { results, summary, estimate }, an empty Map when nothing is checked: information only, for the cards), win }.
 * Returns { element, show(), hide(), setScene({ airfields, heightScale, cloudStyle, rainToGround, approaches: { on, field } }), refreshApproaches(), setModel({ status, model, lastGoodAt, now, timeZone }), setAirspaceLog(view),
 * touch(), home(), zoomBy(factor), isShown(), dispose() }.
 * `show()` resolves { ok: true } or { ok: false, reason: 'gl' | 'load' | 'closed' }.
 */
export function createSofView3d({ timers, getProjection, getPictures, getWeather = () => ({ sig: 'none', radar: null, lightning: null, satellite: null, fronts: null, lines: [] }), fullScreen = null, onLost = () => {}, getSite = /** @type {() => any} */ (() => CYMJ), routes = /** @type {any} */ ([]), airspace = /** @type {any} */ (null), onAirspaceLogOptions = /** @type {(options: { showT6: boolean, showAll: boolean }) => void} */ (() => {}), now = () => Date.now(), onTrails = /** @type {(on: boolean) => void} */ (() => {}), onModelHour = /** @type {(ms: number | null) => void} */ (() => {}), onRainToGround = /** @type {(on: boolean) => void} */ (() => {}), onApproaches = /** @type {(choice: { on: boolean, field: string }) => void} */ (() => {}), onCorridors = /** @type {(results: Map<string, any>) => void} */ (() => {}), win = globalThis }) {
  const labels = h('div', { class: 'sof-3d-labels' });
  // The airspace volume under the pointer: its name and limits float beside the pointer (Dad, 7 Oct); nothing is written on the volumes themselves.
  const spaceTip = h('p', { class: 'sof-3d-space-tip', hidden: true });
  labels.append(spaceTip);
  const corner = h('p', { class: 'sof-3d-corner' });
  const credit = h('p', { class: 'sof-3d-credit' }, ESRI_IMAGERY.credit);
  // The credit line: the imagery's, then the aircraft's while they are drawn and the fronts' while they are (Dad, 7 Oct: "Fronts (WPC, whole-degree positions)").
  let creditAircraft = false;
  let creditFronts = false;
  let creditTerrain = false;
  let creditDetail = false;
  let creditAnchors = false;
  const updateCredit = () => setText(credit, [ESRI_IMAGERY.credit, creditTerrain ? TERRAIN_CREDIT : null, creditAircraft ? AIRCRAFT_CREDIT : null, creditFronts ? FRONTS_CREDIT : null, creditDetail ? DETAIL_CREDIT : null, creditAnchors ? ANCHOR_CREDIT : null].filter(Boolean).join('. '));
  const outside = h('p', { class: 'sof-3d-outside', hidden: true });
  const note = h('p', { class: 'sof-3d-note', role: 'status', hidden: true });
  const tag = h('p', { class: 'sof-3d-tag', role: 'status', hidden: true });

  // The Satellite button's words name the home base's picture (its site profile's `toggleWords`; ECCC's GOES-West at Moose Jaw, as before).
  function satelliteTitle() {
    return `${getSite().sources.satellite?.toggleWords ?? 'ECCC GOES-West cloud picture'} as a faint sheet at the highest model cloud level`;
  }
  // The model controls (phase 2): a toggle for each layer, the time slider, the key and the credit, in a stack with the ground's credit.
  const TOGGLES = /** @type {[string, string, string][]} */ ([
    ['low', 'Low', `Low cloud: model cloud with its base below ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft above the ground`],
    ['mid', 'Mid', `Mid cloud: model cloud with its base ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} to ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft above the ground`],
    ['high', 'High', `High cloud: model cloud with its base above ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft above the ground`],
    ['winds', 'Barbs', 'Winds aloft at 850, 700 and 500 hPa, as small barbs (off to begin with: the Wind flow shows the winds gently)'],
    ['freezing', 'Freezing level', 'The 0 °C level, a faint sheet across the area'],
    ['flow', 'Wind flow', 'Faint streaks drifting with the model wind at 850, 700 and 500 hPa, like Windy: they move only while this view is shown (they step every 2 seconds with reduced motion)'],
    ['satellite', 'Satellite', satelliteTitle()],
    ['radar', 'Radar', 'Radar as see-through blocks standing in the model cloud over each return, from its base to its top, or from the ground where the model has no cloud there (the radar picture on the ground has its own switch in the map’s Layers menu)'],
    ['rain', 'Rain to ground', 'A faint, streaked rain curtain under each radar block, from the model cloud base to the ground (the radar does not say whether the precipitation reaches the ground)'],
    ['lightning', 'Lightning', 'Lightning cells as thin bolts from the ground to the model cloud top'],
    ['fronts', 'Fronts', `${FRONTS_CREDIT}: surface fronts on the ground with a faint wall, and the H and L pressure centres`],
  ]);
  const toggles = { ...Object.fromEntries(MODEL_GROUPS.map((key) => [key, true])), winds: false, flow: true, satellite: true, radar: true, rain: true, lightning: true, fronts: true }; // all on to begin with but the barbs
  const toggleButtons = new Map();
  for (const [key, text, title] of TOGGLES) {
    const button = h('button', {
      type: 'button',
      class: 'sof-3d-toggle',
      title,
      'aria-pressed': String(toggles[key]),
      onclick: () => setToggle(key, button.getAttribute('aria-pressed') !== 'true'),
    }, text);
    toggleButtons.set(key, { button, title });
  }
  // The model's own buttons sit with its controls (they go when the model is unavailable); the weather layers' buttons stand on their own, as they do not need the model.
  const MODEL_BUTTONS = ['low', 'mid', 'high', 'winds', 'freezing'];
  const WEATHER_BUTTONS = ['flow', 'satellite', 'radar', 'rain', 'lightning', 'fronts'];
  const sliderId = `sof-3d-time-${nextViewId++}`;
  const slider = h('input', {
    type: 'range', id: sliderId, class: 'sof-3d-slider', min: '0', max: String(MAX_AHEAD_HOURS), step: '1', 'aria-label': 'Model time, hours ahead of now',
    value: '0', oninput: () => setAhead(Number(slider.value)),
  });
  const sliderWords = h('output', { class: 'sof-3d-model-time', for: sliderId });
  // The "Cloud at" height control (Dad, 7 Oct: ForeFlight-style): Off (0, the default: the slabs or level sheets as before), then 1,000 to 30,000 ft above sea level in
  // 500 ft steps. A chosen height draws one see-through sheet of the model's cover there, in place of the cloud stages.
  const heightId = `sof-3d-height-${nextViewId++}`;
  const HEIGHT_STEPS = Math.round((SHEET_HEIGHTS_FT.max - SHEET_HEIGHTS_FT.min) / SHEET_HEIGHTS_FT.step) + 1;
  const heightOf = (v) => (v <= 0 ? null : SHEET_HEIGHTS_FT.min + (Math.min(HEIGHT_STEPS, v) - 1) * SHEET_HEIGHTS_FT.step);
  const heightSlider = h('input', {
    type: 'range', id: heightId, class: 'sof-3d-slider sof-3d-height', min: '0', max: String(HEIGHT_STEPS), step: '1', value: '0',
    'aria-label': 'Cloud at a height: off, or feet above sea level', 'aria-valuetext': 'Off',
    title: `The model's cloud cover at one height, as one sheet over the square (feet above sea level, ${formatFeet(SHEET_HEIGHTS_FT.min)} to ${formatFeet(SHEET_HEIGHTS_FT.max)} ft). Off shows the cloud as before.`,
    oninput: () => setCloudHeight(heightOf(Number(heightSlider.value))),
  });
  const heightValue = h('output', { class: 'sof-3d-model-time', for: heightId }, 'Off');
  const heightWords = h('p', { class: 'sof-3d-model-note sof-3d-height-words', role: 'status', hidden: true });
  const modelStatus = h('p', { class: 'sof-3d-model-status', role: 'status' }, LOADING_WORDS);
  // The slabs' 2.5 km detail (Fable review, 7 Oct): one line in words and a symbol, shown with slabs only.
  const modelDetail = h('p', { class: 'sof-3d-model-note sof-3d-model-detail', role: 'status', hidden: true });
  const modelWarn = h('p', { class: 'sof-3d-model-warn', role: 'status', hidden: true });
  const modelControls = h('div', { class: 'sof-3d-model-controls' },
    h('div', { class: 'sof-3d-model-row', role: 'group', 'aria-label': 'Model layers' }, MODEL_BUTTONS.map((k) => toggleButtons.get(k).button)),
    h('div', { class: 'sof-3d-model-row' }, h('label', { for: sliderId }, 'Model time'), slider, sliderWords),
    h('div', { class: 'sof-3d-model-row' }, h('label', { for: heightId }, 'Cloud at'), heightSlider, heightValue),
    heightWords);
  const modelNote = h('p', { class: 'sof-3d-model-note' }, 'METAR decks, radar, lightning, satellite and fronts stay at now.');
  const keyBody = h('div', { class: 'sof-3d-model-key-body' });
  const modelKey = h('details', { class: 'sof-3d-model-key' }, h('summary', {}, 'Model key'), keyBody);
  const modelCredit = h('p', { class: 'sof-3d-model-credit' }, creditWords3d(null));
  // The weather layers (Dad, 7 Oct): their buttons, a line for each picture's age (or failure), and a key that names every estimate.
  const weatherStatus = h('ul', { class: 'sof-3d-wx-status', 'aria-label': 'Weather pictures in 3D' });
  const weatherKeyBody = h('div', { class: 'sof-3d-model-key-body' });
  const weatherKey = h('details', { class: 'sof-3d-model-key' }, h('summary', {}, 'Weather key'), weatherKeyBody);
  const weatherPanel = h('div', { class: 'sof-3d-model sof-3d-wx', role: 'group', 'aria-label': 'Weather layers' },
    h('div', { class: 'sof-3d-model-row' }, WEATHER_BUTTONS.map((k) => toggleButtons.get(k).button), weatherKey),
    weatherStatus);
  const modelFoot = h('div', { class: 'sof-3d-model-row' }, modelNote, modelKey);
  const modelPanel = h('div', { class: 'sof-3d-model', role: 'group', 'aria-label': 'Model clouds and winds' }, modelStatus, modelWarn, modelControls, modelDetail, modelFoot, modelCredit);
  const trafficStatus = h('p', { class: 'sof-3d-traffic-status', role: 'status', hidden: true });

  // The airspace controls (phase 3): a toggle for the volumes and one for the TACNAV routes, and a key. With no airspace data the first
  // toggle says so and cannot be pressed; with no routes the second does.
  // What is drawn comes from the home base's site profile (read each time it is built, so a new home gets its own); `airspace` and `routes` can still be given.
  // A base's FAA airspace file is loaded only when the 3D view is drawn there (sites/airspace-load.js); until then its fixed entries (Moose Jaw's DAH ones) are drawn.
  // Whatever is drawn is cut to the square the "3D area" setting chose (airspace-model.js `airspaceInSquare`).
  const airspaceStatus = () => (airspace ? 'ok' : airspaceOf(getSite()).status);
  let clipped = { key: '', entries: [] };
  const airspaceNow = () => {
    const held = airspace ? { status: 'ok', entries: airspace } : airspaceOf(getSite());
    const projection = getProjection();
    const key = `${getSite().icao}|${held.status}|${held.entries.length}|${AREA_NM}|${projection.lat},${projection.lon}`;
    if (clipped.key !== key) clipped = { key, entries: airspaceInSquare(held.entries, { toXY: projection.toXY, toLatLon: projection.toLatLon, halfFt: AREA_FT / 2 }) };
    return clipped.entries;
  };
  /** The airports the home base's 3D view draws (its site profile's `airports3d`; airports-data.js). */
  const airportsNow = () => airportsFor(getSite().airports3d);
  const routesNow = () => (typeof routes === 'function' ? routes() : routes);
  const noAirspace = () => airspaceNow().length === 0;
  const noRoutes = () => routesNow().length === 0;
  /** The first two toggles' words, by what the home base has: [text, title, reason it cannot be pressed or null]. Read again when the airspace is built for a new home. */
  const spaceToggleWords = () => ({
    airspace: noAirspace() && airspaceStatus() === 'loading' ? [AIRSPACE_LOADING_WORDS, '', AIRSPACE_LOADING_WORDS]
      : noAirspace() && airspaceStatus() === 'failed' ? [AIRSPACE_FAILED_WORDS, '', `${AIRSPACE_FAILED_WORDS}: it is tried again the next time the 3D view opens`]
        : [noAirspace() ? 'Airspace (no data yet)' : 'Airspace', `Airspace volumes round home, each from its floor to its ceiling, see-through${airspaceStatus() === 'loading' ? ` (${AIRSPACE_LOADING_WORDS})` : airspaceStatus() === 'failed' ? ` (${AIRSPACE_FAILED_WORDS})` : ''}`, noAirspace() ? 'No airspace data yet: its floors, ceilings and outlines are added once each has a source' : null],
    tacnav: ['TACNAV', 'The TACNAV routes, as lines 500 ft above the ground (ground taken as flat, an estimate)', noRoutes() ? 'No TACNAV routes to draw' : null],
    airports: ['Airports', `The runways of ${airportsNow().map((a) => a.icao).join(', ')} at their true places and sizes, with schematic buildings`, null],
  });
  const firstWords = spaceToggleWords();
  const SPACE_TOGGLES = /** @type {[string, string, string, string | null][]} */ ([
    ['airspace', ...firstWords.airspace],
    ['tacnav', ...firstWords.tacnav],
    ['airports', ...firstWords.airports],
    ['terrain', 'Terrain', `The real ground: heights from the Terrarium elevation tiles, ×the height scale, so the valleys, the Coteau and the Cypress Hills show. Off lays the ground flat at home’s elevation. ${TERRAIN_CREDIT}.`, null],
    ['towns', 'Towns', 'Moose Jaw, Regina, Swift Current and Saskatoon as schematic blocks standing on the terrain: not real buildings. A name shows when zoomed in, or under the pointer.', null],
    ['alerts', 'SIGMET/PIREP', `SIGMETs (red-orange) and AIRMETs (yellow) as see-through volumes from base to top, PIREPs as small diamonds at their level (amber turbulence, blue icing, white other), from ${getSite().sources.alerts?.credit ?? 'NAV CANADA'} through the relay. Put the pointer on one for its words.`, null],
  ]);
  const spaceToggles = { airspace: !noAirspace(), tacnav: !noRoutes(), airports: true, terrain: true, towns: true, alerts: true };
  const spaceButtons = new Map();
  for (const [key, text, title, reason] of SPACE_TOGGLES) {
    const button = h('button', {
      type: 'button',
      class: 'sof-3d-toggle',
      title: reason ?? title,
      'aria-pressed': String(spaceToggles[key]),
      disabled: reason !== null,
      onclick: () => setSpaceToggle(key, button.getAttribute('aria-pressed') !== 'true'),
    }, text);
    spaceButtons.set(key, button);
  }
  // Trails (Dad, 7 Oct): shown only while the aircraft are; the same choice as the map bar's Trails button.
  const trailsButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle',
    title: `A fading line behind each aircraft: its last ${TRAIL_WINDOW_S / 60} minutes of reported positions, at their own heights`,
    'aria-pressed': 'true',
    hidden: true,
    onclick: () => onTrails(trailsButton.getAttribute('aria-pressed') !== 'true'),
  }, 'Trails');
  spaceButtons.set('trails', trailsButton);
  const spaceKeyBody = h('div', { class: 'sof-3d-model-key-body' });
  const spaceKey = h('details', { class: 'sof-3d-model-key' }, h('summary', {}, 'Airspace key'), spaceKeyBody);
  // SIGMETs, AIRMETs and PIREPs (Dad, 7 Oct): a line saying when they cannot be shown (never frozen: with no fresh answer none are drawn).
  const alertsStatus = h('p', { class: 'sof-3d-traffic-status is-bad', role: 'status', hidden: true });
  const alertsKey = h('div', {});
  // The instrument approaches (Dad, 8 Oct 2026: "can you plot the approaches to these fields"): one button, off to begin with (so the start view is as it was), and
  // its key with the field picker (home by default, each alternate, or all). The choice is kept in the SOF's "view3d" settings (the caller's onApproaches).
  let apprOn = false;
  let apprField = 'home';
  const apprButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle',
    'aria-pressed': 'false',
    title: 'The instrument approaches to the field chosen in the Approaches key: the path through the fixes at the coded altitudes, the localizer, glidepath and VOR courses, and the missed approach dashed. US fields from the FAA CIFP; Canadian and military fields only an estimated centreline and 3° path. Never for navigation.',
    onclick: () => setApproaches(apprButton.getAttribute('aria-pressed') !== 'true', apprField, { save: true }),
  }, 'Approaches');
  const apprPicker = h('select', { class: 'sof-3d-appr-field', 'aria-label': 'Approaches to draw: home, an alternate, or all', onchange: () => setApproaches(true, apprPicker.value, { save: true }) });
  const apprKeyBody = h('div', { class: 'sof-3d-model-key-body' });
  const apprKey = h('details', { class: 'sof-3d-model-key' }, h('summary', {}, 'Approaches key'),
    h('div', { class: 'sof-3d-model-row' }, h('label', {}, 'Field ', apprPicker)), apprKeyBody);
  const spacePanel = h('div', { class: 'sof-3d-model sof-3d-space', role: 'group', 'aria-label': 'Airspace, TACNAV routes, airports, terrain, towns, SIGMETs and approaches' },
    h('div', { class: 'sof-3d-model-row' }, [...spaceButtons.values()], spaceKey, apprButton, apprKey), alertsStatus);
  const bottom = h('div', { class: 'sof-3d-bottom' }, trafficStatus, modelPanel, weatherPanel, spacePanel, credit);
  const acTag = h('p', { class: 'sof-3d-tag sof-3d-actag-facts', role: 'status', hidden: true });
  const logView = createAirspaceLogView({ onOptions: (options) => onAirspaceLogOptions(options) });

  // Orbit and Full screen sit in the top right, beside "Heights ×5" (Dad, 7 Oct). Orbit is an on/off button (aria-pressed); Full screen's words change
  // instead, so it has no aria-pressed.
  const orbitButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle sof-3d-orbit',
    'aria-pressed': 'false',
    title: `Turn the camera slowly round home, one turn in about ${ORBIT_SECONDS_PER_TURN / 60} minutes, at the zoom and tilt you have. A drag (turning or moving the map), the wheel, an arrow key or Home stops it.`,
    onclick: () => setOrbit(orbitButton.getAttribute('aria-pressed') !== 'true'),
  }, 'Orbit');
  const fullButton = h('button', { type: 'button', class: 'sof-3d-toggle sof-3d-fullscreen', hidden: !fullScreen, onclick: () => fullScreen?.toggle() }, 'Full screen');
  // Tour (Dad, 7 Oct): beside Orbit, off to begin with; turning it on turns Orbit on, and any camera input from the SOF turns both off.
  const tourButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle sof-3d-tour',
    'aria-pressed': 'false',
    title: `Fly the camera round the Moose Jaw circuit, Regina and each airborne T-6 in turn, about ${TOUR_DWELL_S} seconds at each, with Orbit turning. A drag (turning or moving the map), the wheel, an arrow key or Home stops it.`,
    onclick: () => setTour(tourButton.getAttribute('aria-pressed') !== 'true'),
  }, 'Tour');
  // In full screen the layer panels and the airspace log are folded away so the map is clear (Dad, 7 Oct); "Panels" brings them back. The credits
  // and the traffic line stay. Outside full screen the button is not shown and the panels are always there (sof.css).
  const panelsButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle sof-3d-panels-toggle',
    'aria-pressed': 'false',
    title: 'Show or hide the layer panels and the airspace log while in full screen',
    onclick: () => {
      const show = panelsButton.getAttribute('aria-pressed') !== 'true';
      panelsButton.setAttribute('aria-pressed', String(show));
      element.classList.toggle('show-panels', show);
    },
  }, 'Panels');
  // How to move the camera, in the corner (Dad, 8 Oct: drag to move round the map), under the Heights line.
  const hint = h('p', { class: 'sof-3d-hint' }, 'Drag to turn · Right-drag or Shift-drag to move · Wheel to zoom');
  const tools = h('div', { class: 'sof-3d-tools' }, orbitButton, tourButton, panelsButton, fullButton, corner, hint);
  // What the tour is showing and when it moves on. The words change every stop (announced); the countdown changes every second (not announced).
  const tourWhat = h('span', { class: 'sof-3d-tour-what' });
  const tourNext = h('span', { class: 'sof-3d-tour-next', 'aria-hidden': 'true' });
  const tourCaptionEl = h('p', { class: 'sof-3d-tour-caption', role: 'status', hidden: true }, tourWhat, ' · ', tourNext);
  const element = h('div', { class: 'sof-3d', hidden: true }, labels, tools, tourCaptionEl, outside, bottom, logView.element, note, tag, acTag);

  let airfields = [];
  let scale = 5;
  let sceneSig = '';
  let sceneDirty = true;
  let groundDirty = true;
  let picturesSig = null;
  let signaturesAt = -Infinity; // when render() last looked at the pictures' and the weather's signatures
  let weatherSig = null; // the weather layers' inputs as last built
  let weatherDirty = true;
  /** The camera: zoom is relative to the fitting zoom (1 shows the whole square); tx, ty and tz are the point looked at when the tour moved it off home (feet from home, feet above sea level). */
  let cam = /** @type {{ yawDeg: number, pitchDeg: number, zoom: number, tx?: number, ty?: number, tz?: number }} */ (homeCamera());
  let THREE = null;
  let gl = null; // everything three.js made, while the view is shown
  let wanted = false;
  let loading = false;
  let disposed = false;
  let pending = null;
  let selected = null;
  let terrainOn = true; // the Terrain switch
  let terrainRev = 0; // changes when what stands on the ground (pins, rings, shafts, bolts, fronts, aircraft) must be made again for new terrain
  let terrainSeen = 0; // the terrainRev the scene was last built for
  let terrainAppliedAt = -Infinity; // when the grids were last re-read from the tiles (performance.now)
  let terrainDepsAt = -Infinity; // when terrainRev last moved
  let terrainDepsOn = true; // the Terrain switch as terrainRev last moved
  let terrainDepsWaiting = false; // new terrain has come that the things on it have not been told of yet
  let terrainDepsDue = false; // that wait is over
  let terrainTimer = null; // the timer that draws again when the next re-read is allowed
  let terrainDepsTimer = null;
  let reliefSig = '';
  let terrainWordsSig = '';
  let terrainPartly = false; // some tiles failed or were left out
  const terrainKey = h('p', { class: 'sof-3d-terrain-words' });
  const townsKey = h('p', { class: 'sof-3d-towns-words' });
  let townsSig = ''; // what the towns were built for: the height scale, the terrain and home
  let townHover = null; // the id of the town the pointer is over
  let tilesFailed = false;
  let noTiles = false; // a tile the browser would not let three.js read: the ground is drawn plain instead
  let loadingNote = false;
  let modelState = { status: 'loading', model: null, lastGoodAt: null, failedAt: null, incomplete: false, limited: false, refining: false, nextAt: null, noSource: false, now: new Date(0), timeZone: null }; // what the map last gave setModel
  let ahead = 0; // the slider: hours past now
  let modelSig = '';
  let modelDirty = true;
  let cloudHeight = null; // the "Cloud at" control: null (off) or feet above sea level
  let sheetSig = ''; // what the altitude sheet was last built for
  let cloudStyle = 'slabs'; // the setting "3D cloud style": 'slabs' or 'levels' (the old per-level sheets)
  let lastWx = null; // the weather layers' inputs as last read (the slabs take the HRDPS cloud picture from them)
  let trafficState = { shown: false, aircraft: [], labelsOn: false, trailsOn: false, signature: 'off' }; // what the map last gave setTraffic
  let trafficSig = '';
  let trafficDirty = true;
  let spaceSig = ''; // what the airspace objects were built for: the height scale, the ground, home, the airspace file's state and the area
  let airspaceAsked = null; // the site profile whose airspace file this showing of the view has asked for
  let alertsView = { status: 'unset', words: '', alerts: [], notDrawn: 0, signature: 'unset' }; // alerts.js alerts3dView, from the map
  let alertsSig = ''; // what the SIGMET/PIREP objects were built for
  let apprSig = ''; // what the approach objects were built for (or 'off')
  let apprAsked = null; // the site profile whose approaches file this showing of the view has asked for
  let corridorSig = ''; // what the corridor check last ran on
  let weatherRev = 0; // counts the weather layers' rebuilds, so the corridor check runs again after one
  let corridorResults = new Map(); // icao -> { results, summary, estimate }: the arrival corridor check, information only
  let apprPickerSig = '';
  let spaceHit = null; // the airspace volume the pointer is over (airspace3d.js `picks` entry), whose words float beside the pointer
  let spaceMove = null; // the last pointer place waiting for the throttled pick: { x, y }
  let spaceLast = 0; // when the last pick ran
  let cancelSpaceMove = null; // the trailing pick's timer
  let hoverHex = null; // the aircraft under the pointer, or whose tag the pointer is on
  let selectedAc = null; // the aircraft whose facts are showing
  let intruderHexes = new Map(); // hex -> the watched areas it is in: the aircraft that are not T-6s in a watched area, whose tags stay on (airspace-log.js)
  let intruderSig = '';
  let orbitOn = false;
  let stopOrbit = null; // ends the orbit's frame loop (or its steps)
  let tourOn = false;
  let tour = null; // { stop, index, elapsed (ms at this stop), from (the camera's pose when the fly began) } once the tour has picked its first stop
  let tourHex = null; // the T-6 the tour is following: its tag is highlighted and always on
  const sizes = new WeakMap(); // each label's size, read once (a read of the page's layout each frame would slow the drag)

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const showNote = () => {
    const parts = [];
    if (loadingNote) parts.push('Loading the 3D view…');
    if (tilesFailed || noTiles) parts.push('Satellite ground unavailable: plain ground shown.');
    if (terrainPartly) parts.push('Terrain partly unavailable: flat there.');
    note.hidden = parts.length === 0;
    setText(note, parts.join(' '));
  };
  const setCorner = () => setText(corner, `Heights ×${scale}`);
  setCorner();

  // ---- Drawing on demand ---------------------------------------------------------------------------
  function requestRender() {
    if (!gl || pending || disposed) return;
    pending = timers.frame(() => {
      pending?.();
      pending = null;
      render();
    });
  }

  // ---- Building and freeing the three.js objects ----------------------------------------------------
  function paletteFor(canvas) {
    const style = win.getComputedStyle?.(canvas);
    const out = {};
    for (const [key, [token, fallback]] of Object.entries(CATEGORY_TOKENS)) {
      const value = style?.getPropertyValue(token).trim();
      out[key] = isColour(value) ? value : fallback;
    }
    return out;
  }

  function disposeTree(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) m.dispose();
    });
    root.removeFromParent();
  }

  /** The pins, decks, height lines and rings, made new each time the scene changes. Returns { root, pins, rings, planeZ, tops }. */
  function buildObjects() {
    const { THREE: T, scene, palette } = gl;
    const homeField = airfields.find((a) => a.home) ?? airfields[0];
    const drawn = airfields.filter((a) => !a.outside);
    const planeZ = (homeField?.groundFt ?? 0) * scale; // the ground is the home field's elevation
    const root = new T.Group();
    const pins = [];
    const rings = [];
    const decks = [];

    gl.ground.setHeight(planeZ);

    // Rings: dashed lines on the ground, round home (on the terrain under them when the view has it).
    const { terrain } = gl;
    const groundZ = (x, y) => terrain.heightFt(x, y) * scale;
    for (const nm of RING_NM) {
      const pts = [];
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(a) * nm * FT_PER_NM;
        const y = Math.sin(a) * nm * FT_PER_NM;
        pts.push(new T.Vector3(x, y, groundZ(x, y) + LIFT_FT));
      }
      const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: RING_COLOUR, dashSize: 14_000, gapSize: 9_000 }));
      line.computeLineDistances();
      root.add(line);
      const el = h('span', { class: 'sof-3d-ring-label' }, `${nm} NM`);
      labels.append(el);
      rings.push({ el, point: { x: 0, y: nm * FT_PER_NM, z: groundZ(0, nm * FT_PER_NM) + LIFT_FT } });
    }

    const deckGeometry = new T.CircleGeometry(DECK_FT / 2, DECK_SEGMENTS);
    const rimPoints = [];
    for (let i = 0; i < DECK_SEGMENTS; i++) {
      const a = (i / DECK_SEGMENTS) * Math.PI * 2;
      rimPoints.push(new T.Vector3(Math.cos(a) * DECK_FT / 2, Math.sin(a) * DECK_FT / 2, 0));
    }
    const rimGeometry = new T.BufferGeometry().setFromPoints(rimPoints);

    for (const field of drawn) {
      const colour = new T.Color(palette[field.key] ?? palette.none);
      const opacity = field.old || field.key === 'none' ? 0.55 : 1;

      // The pin: a thin line and a head, kept the same size on the screen at any zoom (scaled in `render`).
      const pin = new T.Group();
      const baseZ = groundZ(field.x, field.y); // a pin stands on the terrain under its field
      pin.position.set(field.x, field.y, baseZ);
      pin.add(new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, PIN_PX.line)]),
        new T.LineBasicMaterial({ color: colour, transparent: opacity < 1, opacity }),
      ));
      const head = new T.Mesh(new T.SphereGeometry(PIN_PX.head, 16, 12), new T.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity }));
      head.position.z = PIN_PX.line;
      pin.add(head);
      root.add(pin);

      const button = h('button', {
        type: 'button',
        class: 'sof-3d-pin',
        dataset: { key: field.key },
        title: field.title,
        'aria-pressed': 'false',
        onclick: () => select(selected === field.icao ? null : field.icao),
      }, field.lines.map((line, i) => h('span', { class: i === 0 ? 'sof-3d-pin-main' : 'sof-3d-pin-extra' }, line)));
      labels.append(button);
      pins.push({ field, pin, button, point: { x: field.x, y: field.y }, baseZ });

      // The decks: flat round discs at the reported bases, and a thin line from the ground up through them.
      let top = null;
      for (const deck of field.decks) {
        const z = deck.baseMslFt * scale;
        const disc = new T.Mesh(deckGeometry, new T.MeshBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: deck.opacity, side: T.DoubleSide, depthWrite: false }));
        disc.position.set(field.x, field.y, z);
        disc.renderOrder = 2;
        const rim = new T.LineLoop(rimGeometry, new T.LineBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: 0.9 }));
        rim.position.copy(disc.position);
        rim.renderOrder = 3;
        root.add(disc, rim);
        const el = h('span', { class: 'sof-3d-deck-label' }, deck.label);
        labels.append(el);
        decks.push({ el, point: { x: field.x, y: field.y, z } });
        top = Math.max(top ?? z, z);
      }
      if (top !== null) {
        root.add(new T.Line(
          new T.BufferGeometry().setFromPoints([new T.Vector3(field.x, field.y, baseZ), new T.Vector3(field.x, field.y, top)]),
          new T.LineBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: 0.45 }),
        ));
      }
    }
    scene.add(root);
    return { root, pins, rings, decks, planeZ, shared: [deckGeometry, rimGeometry] };
  }

  function freeObjects() {
    if (!gl?.objects) return;
    const { root, shared, pins, rings, decks } = gl.objects;
    disposeTree(root);
    for (const g of shared) g.dispose();
    for (const item of [...pins.map((p) => p.button), ...rings.map((r) => r.el), ...decks.map((d) => d.el)]) item.remove();
    gl.objects = null;
  }

  // ---- The ground: satellite in two tiers (ground3d.js), then radar and lightning on it ----------------
  function paintGround() {
    const pictures = getPictures();
    picturesSig = pictures.sig;
    const { failed } = gl.ground.paint({ projection: getProjection(), pictures, noTiles });
    if (!noTiles && failed !== tilesFailed) {
      tilesFailed = failed;
      showNote();
    }
    groundDirty = false;
  }

  // ---- The model layers (phase 2) ---------------------------------------------------------------------
  const groundFt = () => (airfields.find((a) => a.home) ?? airfields[0])?.groundFt ?? 0;

  function setToggle(key, on, { save = true } = {}) {
    toggles[key] = on;
    toggleButtons.get(key)?.button.setAttribute('aria-pressed', String(on));
    applyToggles();
    if (key === 'rain') {
      weatherDirty = true; // the key's words say whether the curtains show (nothing is built again)
      if (save) onRainToGround(on);
    }
    requestRender();
  }

  /** The cloud stages (Low, Mid, High) are shown by their toggles, but not while a "Cloud at" height is chosen: its one sheet takes their place. */
  const STAGE_KEYS = ['low', 'mid', 'high'];
  const shownGroup = (key) => toggles[key] && !(cloudHeight !== null && STAGE_KEYS.includes(key));

  function applyToggles() {
    const groups = gl?.model?.built.root.userData.groups;
    if (groups) for (const key of MODEL_GROUPS) groups[key].visible = shownGroup(key);
    gl?.weather?.setToggles(toggles);
    for (const [key, { button, title }] of toggleButtons) {
      const slab = gl?.model?.built.summary.slabs?.words?.[key]; // with slabs, each stage's base and top in words
      const sheets = gl?.model?.counts?.[key]; // only the three cloud stages have a count of sheets
      if (slab) button.title = `${title}. ${slab}.`;
      else button.title = sheets === undefined ? title : `${title}. ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} with cloud this hour.`;
      if (STAGE_KEYS.includes(key)) {
        button.disabled = cloudHeight !== null;
        if (cloudHeight !== null) button.title = `${title}. Hidden while "Cloud at" shows one height; set it to Off to see the ${key} cloud.`;
      }
    }
  }

  /**
   * The "Cloud at" control (Dad, 7 Oct, ForeFlight-style; it took over the old Layer picker's job of showing one level at a time): null for off (the slabs or level
   * sheets as before), or a height in feet above sea level, which shows the model's cover at that height as one sheet. It follows the model time slider.
   */
  function setCloudHeight(ft) {
    cloudHeight = ft;
    const words = ft === null ? 'Off' : `${formatFeet(ft)} ft`;
    setText(heightValue, words);
    heightSlider.setAttribute('aria-valuetext', words);
    applyToggles();
    applyModel(); // the 2.5 km detail line shows while a height is chosen, in either cloud style
    requestRender();
  }

  function setAhead(hours) {
    ahead = Math.max(0, Math.min(MAX_AHEAD_HOURS, Math.round(hours)));
    applyModel();
  }

  /** The words, the controls and whether the model layers must be built again, from what the map last gave `setModel`. */
  function applyModel() {
    const { status, model, lastGoodAt, failedAt, incomplete, limited, now, timeZone } = modelState;
    const ok = status === 'ok' && model !== null;
    modelStatus.hidden = ok;
    modelControls.hidden = !ok;
    modelFoot.hidden = !ok;
    modelCredit.hidden = !ok;
    if (ok) setText(modelCredit, `${creditWords3d(model)}${modelState.refining ? `. The finer ${modelSetOf(model).fine.short} model is still loading…` : ''}`);
    modelStatus.classList.toggle('is-bad', status === 'unavailable');
    // A refresh that failed while the answer held is still young enough: the layers stay and the panel says so. So does an HRDPS band filled from the global GEM.
    const stillShown = ok && failedAt !== null;
    const filled = ok ? filledWords(model) : null;
    const warn = [stillShown ? refreshFailedWords({ failedAt, lastGoodAt, now, incomplete, limited }) : null, filled].filter(Boolean).join(' ');
    modelWarn.hidden = warn === '';
    setText(modelWarn, warn);
    if (!ok) {
      setText(modelStatus, modelState.noSource ? noSourceWords('Model clouds') : status === 'unavailable' ? unavailableWords(lastGoodAt, incomplete, limited) : LOADING_WORDS);
    } else {
      const nowMs = +now;
      const limit = maxAhead(model, nowMs);
      if (ahead > limit) ahead = limit;
      if (slider.max !== String(limit)) slider.max = String(limit);
      if (slider.value !== String(ahead)) slider.value = String(ahead);
      const words = hourWords(model, hourIndex(model, nowMs, ahead), nowMs, timeZone);
      setText(sliderWords, words);
      slider.setAttribute('aria-valuetext', words);
    }
    modelDetail.hidden = !ok || (cloudStyle !== 'slabs' && cloudHeight === null);
    const hour = ok ? hourIndex(model, +now, ahead) : -1;
    onModelHour(ok ? model.times[hour] : null);
    // In levels style the 2.5 km picture is read only while a "Cloud at" height is chosen, so choosing one builds the layers again.
    const sig = ok ? `${model.id}|${hour}|${scale}|${groundFt()}|${cloudStyle}|${cloudStyle === 'levels' && cloudHeight !== null ? 'detail' : ''}` : 'none';
    if (sig === modelSig) return;
    modelSig = sig;
    modelDirty = true;
    weatherDirty = true; // the shafts, bolts, sheet and flow take their heights and winds from the model
    requestRender();
  }

  function freeModel() {
    freeSheet();
    if (!gl?.model) return;
    gl.model.built.dispose();
    for (const { el } of gl.model.items) el.remove();
    gl.model = null;
  }

  function freeSheet() {
    sheetSig = '';
    if (!gl?.sheet) return;
    gl.sheet.built.dispose();
    for (const { el } of gl.sheet.items) el.remove();
    gl.sheet = null;
  }

  /**
   * The "Cloud at" sheet for the height chosen, at the model hour shown (cloud-field.js `heightSheet`), shaped by the same 2.5 km picture as the slabs when there is one
   * for the hour, in either cloud style; built again only when the model layers or the height changed. With no height chosen there is none.
   */
  function rebuildSheet() {
    const sig = gl?.model && cloudHeight !== null ? `${gl.model.key}|${cloudHeight}` : 'none';
    if (sig === sheetSig) return;
    freeSheet();
    sheetSig = sig;
    const { model, now } = modelState;
    if (!gl?.model || cloudHeight === null || !model) {
      heightWords.hidden = true;
      return;
    }
    const hour = hourIndex(model, +now, ahead);
    gl.model.reference ??= cloudSlabs(model, hour, groundFt()); // the column's own cover at every stage, unmasked: the most-overlap rule's reference
    const sheet = heightSheet(model, hour, cloudHeight, { total: gl.model.total, reference: gl.model.reference });
    const ground = groundFt();
    const shown = cloudHeight > ground ? sheet : null;
    const built = buildHeightSheet(gl.THREE, { sheet: shown, scale, fade: gl.model.fade });
    gl.scene.add(built.root);
    const text = heightSheetWords(sheet, cloudHeight, { groundFt: ground });
    const detail = gl.model.total ? '' : ' Drawn from the model grid alone (no 2.5 km detail for this hour).';
    setText(heightWords, `${text}.${detail}`);
    heightWords.hidden = false;
    const h2 = AREA_FT / 2;
    const el = h('span', { class: 'sof-3d-model-label is-altitude' }, `Cloud at ${formatFeet(cloudHeight)} ft (model estimate)`);
    labels.append(el);
    gl.sheet = { built, items: built.drawn ? [{ el, group: 'altitude', point: { x: h2, y: h2, z: cloudHeight * scale }, side: 'left' }] : [] };
    if (!built.drawn) el.remove();
  }

  /** The model layers, built new for this answer, hour, height scale and ground (or taken away when there is no usable answer). */
  function rebuildModel() {
    freeModel();
    modelDirty = false;
    const { status, model, now } = modelState;
    if (!gl || status !== 'ok' || !model) {
      showDetail(null, null);
      if (creditAnchors) {
        creditAnchors = false;
        updateCredit();
      }
      return;
    }
    const hour = hourIndex(model, +now, ahead);
    const wx = lastWx ?? getWeather();
    let slabs = null;
    let reference = null; // the slabs before the 2.5 km picture shapes them: the "Cloud at" sheet's reference for the most-overlap rule
    let fade = 1;
    let total = null;
    // The 2.5 km total-cloud picture for this hour, when there is one: it shapes the slabs, and the "Cloud at" sheet in either style.
    const usesDetail = cloudStyle === 'slabs' || cloudHeight !== null;
    let detail = usesDetail ? detailOf(wx, model, hour) : null;
    if (detail?.state === 'ok' || detail?.state === 'old') {
      total = gl.weather.totalCloud(detail.picture, getProjection());
      if (!total) detail = { state: 'failed', lastGoodAt: detail.picture.lastGoodAt, key: 'unreadable' };
      else if (detail.state === 'old') fade = NT_OLD_FADE;
    }
    if (cloudStyle === 'slabs') {
      // The slabs from the 37.5 NM grid, then shaped by the 2.5 km total-cloud picture for this hour when there is one (cloud-field.js `maskSlabs`).
      slabs = cloudSlabs(model, hour, groundFt());
      reference = slabs;
      if (total) {
        const masked = maskSlabs(slabs, total);
        slabs = masked.slabs;
        detail.unplacedShare = masked.unplacedShare;
      }
    }
    showDetail(detail, model);
    // Observed bases (METARs) pull the low cloud near their stations, at the model hour "now" only: the reports are now, not a forecast.
    const observed = cloudStyle === 'slabs' ? anchorsOf(wx, model, hour) : null;
    if (observed?.state === 'ok') {
      const anchored = anchorLowSlab(slabs, observed.list);
      slabs = anchored.slabs;
      observed.stations = anchored.stations;
    }
    const anchorsOn = observed?.state === 'ok' && observed.stations.some((st) => st.use !== 'none');
    if (anchorsOn !== creditAnchors) {
      creditAnchors = anchorsOn;
      updateCredit();
    }
    const built = buildModelLayers(gl.THREE, { model, hour, scale, groundFt: groundFt(), style: cloudStyle, slabs, fade: cloudStyle === 'slabs' ? fade : 1, magVarDegE: getSite().magVarDegE.value });
    gl.scene.add(built.root);
    const items = built.labels.map((l) => {
      const el = h('span', { class: `sof-3d-model-label is-${l.group}` }, l.text);
      labels.append(el);
      return { el, group: l.group, point: l.point, hPa: l.hPa, side: l.side };
    });
    const inputs = `${detail?.key ?? 'none'}|${observed?.key ?? 'none'}`;
    gl.model = { built, items, counts: built.summary.layers, key: `${modelSig}|${inputs}`, fields: built.fields, inputs, detail, observed, total, fade, reference };
    applyToggles();
    drawKey(built.summary, hour);
  }

  /**
   * What the slabs can take from the HRDPS total-cloud picture (map.js `weather3d().modelCloud`) for the hour shown: { state, picture?, lastGoodAt?, key } with state
   * 'ok' (a picture for this hour), 'old' (one from a model run over 12 hours old: drawn fainter), 'loading' (asked, not here yet) or 'failed' (the last try failed and
   * nothing for this hour is held: the slabs come from the grid alone). `key` changes when what the slabs would be built from does.
   */
  function detailOf(wx, model, hour) {
    const mc = wx?.modelCloud;
    if (mc?.noSource) return { state: 'none', key: 'none' }; // no 2.5 km picture at this base (a US base): the slabs are the grid's alone
    if (!mc) return { state: 'loading', key: 'loading' };
    if (mc.image && mc.time === model.times[hour]) return { state: mc.stale ? 'old' : 'ok', picture: mc, key: `${mc.id}|${mc.stale}` };
    if (mc.failed) return { state: 'failed', lastGoodAt: mc.lastGoodAt, key: 'failed' };
    return { state: 'loading', key: 'loading' };
  }

  /**
   * The observed bases for the slabs (map.js `weather3d().anchors`): { state, list, key } with state 'ok' (fresh reports to anchor with: `list` the fresh ones),
   * 'later' (the slider is past now: the reports are now, so nothing is anchored), 'loading' or 'unavailable' (no station has a fresh report: the model alone).
   */
  function anchorsOf(wx, model, hour) {
    const view = wx?.anchors;
    if (hour !== hourIndex(model, +modelState.now, 0)) return { state: 'later', list: [], all: view?.anchors ?? [], key: 'later' };
    if (!view || view.status === 'loading') return { state: 'loading', list: [], all: [], key: 'loading' };
    if (view.status !== 'ok') return { state: 'unavailable', list: [], all: view.anchors, key: 'unavailable' };
    const key = view.anchors.map((a) => `${a.icao}${a.fresh ? `+${a.baseMslFt ?? ''}${a.clear ? 'c' : ''}${a.unknown ? 'u' : ''}` : '-'}`).join(',');
    return { state: 'ok', list: view.anchors, all: view.anchors, key };
  }

  /** The detail's line in the model panel and its credit (words and a symbol, never colour alone). */
  function showDetail(detail, model) {
    const grid = model ? `${Math.round((AREA_NM / ((model.gridSize ?? 13) - 1)) * 10) / 10} NM grid` : 'grid';
    let words = '';
    if (detail?.state === 'ok') words = `2.5 km cloud detail: ECCC HRDPS total cloud for ${hhmm(detail.picture.time)}${detail.picture.referenceTime ? ` (run ${hhmm(detail.picture.referenceTime)})` : ''} ✓`;
    else if (detail?.state === 'old') words = `2.5 km cloud detail: old model run${detail.picture.referenceTime ? ` (${hhmm(detail.picture.referenceTime)})` : ''}, over 12 h old: drawn fainter ⚠`;
    else if (detail?.state === 'failed') words = `2.5 km cloud detail unavailable (last good ${detail.lastGoodAt ? hhmm(detail.lastGoodAt) : 'not yet'}); drawn from the ${grid} alone ⚠`;
    else if (detail?.state === 'loading') words = '2.5 km detail loading… ⟳';
    else if (detail?.state === 'none') words = '2.5 km cloud detail: not available at this base';
    setText(modelDetail, words);
    modelDetail.classList.toggle('is-bad', detail?.state === 'failed' || detail?.state === 'old');
    const on = detail?.state === 'ok' || detail?.state === 'old';
    if (on !== creditDetail) {
      creditDetail = on;
      updateCredit();
    }
  }

  function drawKey(summary, hour) {
    const { model } = modelState;
    const set = modelSetOf(model); // the base's two models and their words (model-clouds.js ECCC_MODELS, NOAA_MODELS)
    const cover = meanLayerCover(model, hour);
    const pct = (v) => (v === null ? 'no data' : `${v} %`);
    keyBody.replaceChildren(
      h('p', {}, `${creditWords3d(model)}. ${model.source === set.fine.id ? set.aboutFine(model, HRDPS_CHUNKS) : set.aboutCoarse}${filledWords(model) ? ` ${filledWords(model)}` : ''} ${set.askWords}${modelState.nextAt ? `: next ${nextAskWords(modelState.nextAt)}` : ''}, so the free daily request limit holds.`),
      ...(summary.slabs ? slabKey(summary, model, cover, pct) : [
        h('p', {}, `Clouds: one see-through sheet at each model level (${model.cloudLevels.length} levels, ${model.cloudLevels[0]} to ${model.cloudLevels.at(-1)} hPa), at the level's mean height. The model's cover at its ${model.gridSize} × ${model.gridSize} points (${Math.round(AREA_NM / (model.gridSize - 1) * 10) / 10} NM apart${coarserWords()}) is smoothed over the sheet: clear at ${CLOUD_COVER_THRESHOLD_PCT} % or less, then white to grey and more solid as cover rises, to about 85 % opaque at 100 %. A level under the ground has no sheet. Low, mid and high are by the sheet's height above the ground (below ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft, up to ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft, above). "Cloud at" shows the model's cover at one height instead. The model's own mean cover this hour: low ${pct(cover.low)}, mid ${pct(cover.mid)}, high ${pct(cover.high)}.`),
        h('ul', {}, summary.sheets.map((x) => h('li', {}, `${x.words}: ${x.drawn ? `cover up to ${Math.round(x.maxCover)} %, mean ${Math.round(x.meanCover)} %` : 'no cloud'}`))),
      ]),
      h('p', {}, `Winds: barbs (behind the Barbs button, off to begin with) at 850, 700 and 500 hPa at every ${barbStep(model.gridSize)}${barbStep(model.gridSize) === 2 ? 'nd' : 'rd'} grid point (${Math.round(model.gridSize > 1 ? (AREA_NM / (model.gridSize - 1)) * barbStep(model.gridSize) : 0)} NM apart): pennant 50 kt, full feather 10, half 5. Direction in °M (${magVarWords(getSite())}), speed in kt.`),
      h('ul', {}, summary.windsOverHome.map((words) => h('li', {}, `Over home, ${words}`))),
      h('p', {}, `${summary.freezingText ? `${summary.freezingText}: the mean over the grid for the hour shown` : 'Freezing level: the model has none for this hour'}. Heights are feet above sea level, ×${scale}.`),
      h('p', {}, `Cloud at a height ("Cloud at", off to begin with; ${formatFeet(SHEET_HEIGHTS_FT.min)} to ${formatFeet(SHEET_HEIGHTS_FT.max)} ft above sea level in ${SHEET_HEIGHTS_FT.step} ft steps): in each model column the cover at that height is read as a straight line by height between the two levels either side, smoothed over the square like the slabs, shaped by the 2.5 km picture for the hour when there is one (the same most-overlap rule), and drawn as one see-through sheet, clear at ${CLOUD_COVER_THRESHOLD_PCT} % or less and whiter and more solid as cover rises. It replaces the Low, Mid and High cloud while chosen, follows the model time slider, and is a model estimate. A column whose levels do not reach the height has no data there, drawn clear and counted in the words. METARs do not move it.`),
    );
  }

  /** With a 3D area bigger than the default, the key says the same model points are further apart than at 450 NM (Dad, 8 Oct 2026: the "3D area" setting). */
  const coarserWords = () => (AREA_NM > DEFAULT_AREA_NM ? `: the 3D area is ${AREA_NM} NM, so the same points are further apart than at ${DEFAULT_AREA_NM} NM (${DEFAULT_AREA_NM / (GRID_SIZE - 1)} NM) and the cloud is coarser` : '');

  /** The key's cloud lines for the slabs (the default "3D cloud style"): how they are made, with every estimate named, and each stage's base and top. */
  function slabKey(summary, model, cover, pct) {
    const spacing = Math.round((AREA_NM / (model.gridSize - 1)) * 10) / 10;
    return [
      h('p', {}, `Clouds: slabs with a base and a top. In each of the model's ${model.gridSize} × ${model.gridSize} columns (${spacing} NM apart${coarserWords()}), each run of levels over ${CLOUD_COVER_THRESHOLD_PCT} % cover (an estimate) is one block of cloud (${model.cloudLevels.length} levels, ${model.cloudLevels[0]} to ${model.cloudLevels.at(-1)} hPa). Its base and top are where the column's cover crosses ${CLOUD_COVER_THRESHOLD_PCT} %, reading the cover as a straight line by height between the levels either side (a cloudy level at the top or bottom of the model goes half the gap to the next level beyond it, an estimate). The lowest such block in each stage is that stage's slab (low, mid and high by its base above the ground: below ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft, up to ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft, above). Base, top and cover are smoothed between the columns and drawn as ${SLAB_SHEETS} stacked sheets from base to top (an estimate), never thinner than ${formatFeet(MIN_SLAB_FT)} ft, white to grey by cover and as solid from above as the old one-sheet-per-level style would stack its levels (so deeper cloud reads denser; an estimate), with a soft texture that is a picture, not data. The real cloud's thickness between the model's levels is not known. The model's own mean cover this hour: low ${pct(cover.low)}, mid ${pct(cover.mid)}, high ${pct(cover.high)}.`),
      h('ul', {}, ['low', 'mid', 'high'].map((stage) => h('li', {}, summary.slabs.words[stage]))),
      ...detailKey(gl?.model?.detail ?? null, spacing),
      ...anchorKey(gl?.model?.observed ?? null),
    ];
  }

  /** The key's words for the observed bases: the rule with its estimate named, then one line per station. */
  function anchorKey(observed) {
    if (!observed) return [];
    if (observed.state === 'later') return [h('p', {}, 'Observed bases: METARs anchor the low cloud at now only; at later hours the slabs are the model alone (observations stay at now).')];
    if (observed.state === 'loading') return [h('p', {}, 'Observed bases loading: the low cloud is the model alone until the stations\' METARs arrive.')];
    if (observed.state === 'unavailable') return [h('p', {}, 'Observed bases unavailable, model alone: no station in the square has a fresh METAR.')];
    return [
      h('p', {}, `Observed bases (now only): within ${ANCHOR_NM} NM of each reporting station (an estimate), the low cloud's base is pulled to the METAR's lowest BKN, OVC or VV base below ${formatFeet(ANCHOR_CEILING_AGL_FT)} ft above the field (plus the field's elevation; Dad's ruling), fully at the station and fading smoothly to nothing at ${ANCHOR_NM} NM. A ceiling from ${formatFeet(ANCHOR_CEILING_AGL_FT)} to ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft above the field leaves the model's low cloud alone. Where the METAR has no low ceiling (clear, FEW or SCT only, or its ceiling is higher), the model's low cloud there is thinned the same way. FEW and SCT never move a base. A station with no fresh METAR (older than 75 minutes) is not used.`),
      h('ul', {}, observed.stations.filter((st) => st.reason !== 'outside').map((st) => h('li', {}, anchorWords(st)))),
    ];
  }

  /** The key's words for the 2.5 km detail: how it shapes the slabs, the estimates named, and what it cannot place. */
  function detailKey(detail, spacing) {
    if (!detail) return [];
    if (detail.state === 'none') return [h('p', {}, `2.5 km cloud detail: not available at this base (ECCC's HRDPS total-cloud picture covers Canada only), so the slabs are drawn from the ${spacing} NM grid alone, unmasked.`)];
    if (detail.state === 'failed') return [h('p', {}, `2.5 km cloud detail unavailable (last good ${detail.lastGoodAt ? hhmm(detail.lastGoodAt) : 'not yet'}); drawn from the ${spacing} NM grid alone.`)];
    if (detail.state === 'loading') return [h('p', {}, '2.5 km detail loading: the slabs are drawn from the grid alone until the picture for this hour arrives.')];
    const pct = detail.unplacedShare === null || detail.unplacedShare === undefined ? null : Math.round(detail.unplacedShare * 100);
    return [h('p', {}, `2.5 km cloud detail: ECCC's HRDPS total-cloud picture (GeoMet layer HRDPS.CONTINENTAL_NT) for ${hhmm(detail.picture.time)}${detail.picture.referenceTime ? `, model run ${hhmm(detail.picture.referenceTime)}` : ''}, read on a ${CLOUD_SHEET_PX} px grid over the square (about ${Math.round((AREA_NM * 1.852) / CLOUD_SHEET_PX * 10) / 10} km a pixel), says where the cloud is. Its grey is read as percent (a straight line fitted to ECCC's own values; see-through is 0 %). Each slab's cover is scaled so the most of the three stages matches the picture's total (the most-overlap rule, an estimate; at most ×${NT_MAX_GAIN}); where the picture has ${CLOUD_COVER_THRESHOLD_PCT} % or less, no cloud is drawn.${pct === null ? '' : ` ${pct} % of the square has cloud in the picture where the ${spacing} NM grid has none at any level: it has no height, so it is not drawn.`}${detail.state === 'old' ? ' Old model run (over 12 hours): drawn fainter.' : ''}`)];
  }

  // ---- The weather layers: radar shafts, bolts, satellite sheet, fronts, wind flow (Dad, 7 Oct) ----------------
  /** The weather layers, made again where what they are built from changed (weather3d-layers.js keeps each until then), with the status words, the key and the credit. */
  function rebuildWeather(wx) {
    weatherSig = wx.sig;
    weatherDirty = false;
    weatherRev += 1;
    if (!gl?.weather) return;
    const { status, model, now } = modelState;
    const ok = status === 'ok' && model !== null;
    const fields = gl.model?.fields ?? null;
    const clouds = ok && fields ? { key: gl.model.key, column: (u, v) => slabColumnAt(fields, u, v), topFt: highestSlabTopFt(fields) } : null;
    gl.weather.update({ weather: wx, model: ok ? model : null, hour: ok ? hourIndex(model, +now, ahead) : 0, scale, groundFt: groundFt(), projection: getProjection(), terrain: { heightFt: gl.terrain.heightFt, key: terrainOn ? terrainRev : 'flat' }, clouds });
    const lines = (wx.lines ?? []).map((l) => `${l.tone}|${l.text} ${l.symbol}`);
    const statusSig = lines.join('\n');
    if (statusSig !== weatherStatus.dataset.sig) {
      weatherStatus.dataset.sig = statusSig;
      weatherStatus.replaceChildren(...(wx.lines ?? []).map((l) => h('li', { class: `sof-3d-wx-line is-${l.tone}` }, `${l.text} `, h('span', { 'aria-hidden': 'true' }, l.symbol))));
    }
    weatherKeyBody.replaceChildren(
      h('p', {}, `Ground: Esri satellite imagery in two tiers: the whole ${AREA_NM} NM square at a modest zoom, and a sharper patch about ${INNER_NM} NM square round home on top of it (at most ${MAX_GROUND_TILES} tiles, loaded as they arrive).`),
      ...weatherKeyWords(gl.weather.summary(), scale, getSite().sources.satellite?.keyWords).map((t) => h('p', {}, t)),
      h('p', {}, 'A picture for situational awareness: heights marked as estimates are not measurements, and nothing here raises or clears a caution.'),
    );
    const satButton = toggleButtons.get('satellite'); // the home base may have changed since the button was made
    if (satButton && satButton.title !== satelliteTitle()) {
      satButton.title = satelliteTitle();
      satButton.button.title = satButton.title;
    }
    const fronts = Boolean(gl.weather.credit());
    if (fronts !== creditFronts) {
      creditFronts = fronts;
      updateCredit();
    }
  }

  // ---- Airspace and the TACNAV routes (phase 3) -----------------------------------------------------------
  const homeIcao = () => (airfields.find((a) => a.home) ?? airfields[0])?.icao ?? 'home';

  function setSpaceToggle(key, on) {
    if (spaceButtons.get(key)?.disabled) return;
    spaceToggles[key] = on;
    spaceButtons.get(key)?.setAttribute('aria-pressed', String(on));
    if (key === 'terrain') {
      terrainOn = on; // render() lays the ground flat or raises it, and moves what stands on it
      terrainAppliedAt = -Infinity; // at once, not after the throttle
    }
    applySpaceToggles();
    requestRender();
  }

  function applySpaceToggles() {
    const groups = gl?.space?.built.root.userData.groups;
    if (groups) for (const key of AIRSPACE_GROUPS) groups[key].visible = spaceToggles[key];
    if (gl?.space?.airports) gl.space.airports.root.visible = spaceToggles.airports;
    if (gl?.towns) {
      gl.towns.built.root.visible = spaceToggles.towns;
      for (const { el } of gl.towns.items) if (!spaceToggles.towns) el.hidden = true;
    }
    if (gl?.alerts) gl.alerts.root.visible = spaceToggles.alerts;
    alertsStatus.hidden = alertsView.status !== 'unavailable' || !spaceToggles.alerts;
    if (!spaceToggles.airspace && !spaceToggles.alerts && !spaceToggles.tacnav) setSpaceHit(null);
  }

  // ---- The towns (Dad, 7 Oct) --------------------------------------------------------------------------------
  function freeTowns() {
    if (!gl?.towns) return;
    gl.towns.built.dispose();
    for (const { el } of gl.towns.items) el.remove();
    gl.towns = null;
  }

  /** The towns, built new for this height scale, terrain and home (only then). Each name is a label the frame places while it is shown. */
  function rebuildTowns(sig) {
    freeTowns();
    townsSig = sig;
    const projection = getProjection();
    const terrain = gl.terrain;
    const built = buildTowns(gl.THREE, { toXY: projection.toXY, heightFt: terrain.heightFt, scale, towns: getSite().towns });
    gl.scene.add(built.root);
    const items = built.entries.map((entry) => {
      const el = h('span', { class: 'sof-3d-town-label', hidden: true }, entry.name);
      labels.append(el);
      return { el, entry };
    });
    gl.towns = { built, items };
    setText(townsKey, `Towns are schematic blocks, not real buildings: ${built.summary.map((t) => t.name).join(', ')} are each drawn as a street grid of low grey boxes (taller in a downtown core, low houses at the edge), made up by the program and the same every time, standing on the terrain. A town’s centre is an approximate coordinate and its size an estimate, both for drawing only. A name shows when zoomed in (${TOWN_LABEL_ZOOM}× or more) and while the pointer is over the town.`);
    applySpaceToggles();
  }

  /** The id of the town the pointer is over (within its built-up area on the screen, at least TOWN_HOVER_PX), from where the last frame put the camera; null for none. */
  function townNear(clientX, clientY) {
    if (!gl?.towns || !spaceToggles.towns) return null;
    const rect = gl.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const width = gl.canvas.clientWidth;
    const height = gl.canvas.clientHeight;
    if (width < 2 || height < 2) return null;
    gl.camera.updateMatrixWorld();
    const ftPerPx = 1000 / (fitZoom({ width, height }) * cam.zoom);
    let best = null;
    let bestD = Infinity;
    for (const { entry } of gl.towns.items) {
      const p = worldToScreen(THREE, gl.camera, { x: entry.x, y: entry.y, z: entry.z }, width, height);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= Math.max(TOWN_HOVER_PX, entry.radiusFt / ftPerPx) && d < bestD) {
        best = entry.id;
        bestD = d;
      }
    }
    return best;
  }

  function setTownHover(id) {
    if (id === townHover) return;
    townHover = id;
    requestRender();
  }

  // ---- The airspace under the pointer (Dad, 7 Oct) ----------------------------------------------------------
  /** Shows the volume's words beside the pointer (`x`, `y` in the view), or takes them away. The sentence behind it is the title, on the tag and on the canvas. */
  function setSpaceHit(pick, x = 0, y = 0) {
    spaceHit = pick;
    spaceTip.hidden = !pick;
    if (pick) {
      setText(spaceTip, pick.text);
      spaceTip.title = pick.title;
      spaceTip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
    }
    if (gl && gl.canvas.title !== (pick?.title ?? '')) gl.canvas.title = pick?.title ?? ''; // the tag does not take the pointer, so the browser's own tip is on the canvas
  }

  /**
   * The TACNAV route whose line passes within ROUTE_HOVER_PX of the pointer on the screen (the nearest), as a pick { key, text, title }, or null. Its points
   * are put on the screen only here, at the pick's pace, never each frame.
   */
  function routeNear(x, y, width, height) {
    // The TACNAV routes, and a US base's military training routes (airspace3d.js `lines`, shown with the airspace).
    const routes = [...(spaceToggles.tacnav ? gl?.space?.built.labels ?? [] : []), ...(spaceToggles.airspace ? gl?.space?.built.lines ?? [] : []), ...(apprOn ? gl?.approaches?.built.lines ?? [] : [])];
    if (!routes.length) return null;
    let best = null;
    let bestD = ROUTE_HOVER_PX;
    for (const route of routes) {
      for (const path of route.paths) {
        let prev = null;
        for (const point of path) {
          const p = worldToScreen(THREE, gl.camera, point, width, height);
          if (prev) {
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - prev.x) * dx + (y - prev.y) * dy) / len2)) : 0;
            const d = Math.hypot(x - (prev.x + t * dx), y - (prev.y + t * dy));
            if (d < bestD) {
              bestD = d;
              best = route;
            }
          }
          prev = p;
        }
      }
    }
    return best ? { key: `route:${best.key}`, text: best.text, title: best.title } : null;
  }

  /**
   * What is under the pointer: a TACNAV route's line close to it first (a thin line is easy to miss), else the nearest volume to the camera along the ray
   * through it (ray-cast on the fills). Not every frame: at most every SPACE_PICK_MS while the pointer moves.
   */
  function pickSpace(x, y) {
    spaceLast = win.performance.now();
    // The SIGMETs, AIRMETs and PIREPs are looked for with the airspace volumes: the nearest under the pointer wins.
    const picks = [...(spaceToggles.alerts ? gl?.alerts?.picks ?? [] : []), ...(spaceToggles.airspace ? gl?.space?.built.picks ?? [] : [])];
    if (!gl || hoverHex) return setSpaceHit(null);
    const width = gl.canvas.clientWidth;
    const height = gl.canvas.clientHeight;
    if (width < 2 || height < 2) return setSpaceHit(null);
    gl.camera.updateMatrixWorld();
    const route = routeNear(x, y, width, height);
    if (route) return setSpaceHit(route, x, y);
    if (!picks.length) return setSpaceHit(null);
    gl.raycaster ??= new THREE.Raycaster();
    gl.raycaster.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), gl.camera);
    const hit = gl.raycaster.intersectObjects(picks.map((p) => p.mesh), false)[0];
    setSpaceHit(hit ? picks.find((p) => p.mesh === hit.object) ?? null : null, x, y);
  }

  /** The pointer moved over the view: look under it now, or once the last look is SPACE_PICK_MS old (the last place wins). No timer runs while it is still. */
  function onSpaceMove(x, y) {
    spaceMove = { x, y };
    const wait = SPACE_PICK_MS - (win.performance.now() - spaceLast);
    if (wait <= 0) {
      cancelSpaceMove?.();
      cancelSpaceMove = null;
      pickSpace(x, y);
    } else if (!cancelSpaceMove) {
      cancelSpaceMove = timers.after(wait, () => {
        cancelSpaceMove = null;
        if (spaceMove && gl) pickSpace(spaceMove.x, spaceMove.y);
      });
    }
  }

  /** The pointer left, pressed to drag or the camera moved: no words, and no look waiting. */
  function clearSpaceMove() {
    spaceMove = null;
    cancelSpaceMove?.();
    cancelSpaceMove = null;
    if (spaceHit) setSpaceHit(null);
  }

  function freeSpace() {
    if (!gl?.space) return;
    gl.space.built.dispose();
    gl.space.airports.dispose();
    gl.space = null;
    setSpaceHit(null);
  }

  /** The airspace volumes and routes, built new for this height scale, ground and home (only then), with the key's words. */
  function rebuildSpace(sig) {
    freeSpace();
    spaceSig = sig;
    syncSpaceAvailability();
    const projection = getProjection();
    const ground = groundFt();
    const { volumes, skipped } = checkedAirspace(airspaceNow(), ground);
    const built = buildAirspace(gl.THREE, { volumes, routes: routesNow(), toXY: projection.toXY, scale, groundFt: ground });
    gl.scene.add(built.root); // nothing stands in the picture: a route's name and a volume's words come with the pointer (pickSpace)
    const airports = buildAirports(gl.THREE, { toXY: projection.toXY, scale, groundFt: ground, doc: win.document, airports: airportsNow() });
    gl.scene.add(airports.root);
    gl.space = { built, airports };
    applySpaceToggles();
    drawSpaceKey(volumes, skipped, ground);
  }

  /** The airspace and TACNAV buttons follow what the home base has: pressable when there is something to draw, and switched on when it first appears. */
  function syncSpaceAvailability() {
    for (const [key, [text, title, reason]] of Object.entries(spaceToggleWords())) {
      const button = spaceButtons.get(key);
      if (!button) continue;
      const wasDisabled = button.disabled;
      button.disabled = reason !== null;
      button.title = reason ?? title;
      setText(button, text);
      if (reason !== null) spaceToggles[key] = false;
      else if (wasDisabled) spaceToggles[key] = true;
      button.setAttribute('aria-pressed', String(spaceToggles[key]));
    }
  }

  function freeAlerts() {
    if (!gl?.alerts) return;
    if (spaceHit && gl.alerts.picks.includes(spaceHit)) setSpaceHit(null);
    gl.alerts.dispose();
    gl.alerts = null;
  }

  /** The SIGMETs, AIRMETs and PIREPs, built new when the answer, the height scale or home changed (only then). */
  function rebuildAlerts(sig) {
    freeAlerts();
    alertsSig = sig;
    const projection = getProjection();
    gl.alerts = buildAlerts3d(gl.THREE, { alerts: alertsView.alerts, toXY: projection.toXY, scale, halfFt: AREA_FT / 2, now: +now() });
    gl.scene.add(gl.alerts.root);
    applySpaceToggles();
    drawAlertsKey();
  }

  /** The key's words for the SIGMETs, AIRMETs and PIREPs: the colours in words, what is drawn and what is not. */
  function drawAlertsKey() {
    const swatch = (colour) => {
      const el = h('span', { class: 'sof-3d-swatch', 'aria-hidden': 'true' });
      el.style.background = colour;
      return el;
    };
    const drawn = gl?.alerts?.summary;
    const outside = drawn?.outside ? ` ${drawn.outside} outside this ${AREA_NM} NM square not drawn.` : '';
    alertsKey.replaceChildren(
      h('p', {}, `SIGMETs, AIRMETs and PIREPs (${getSite().sources.alerts?.credit ?? 'NAV CANADA'}, through the relay, asked every 10 minutes): a SIGMET or AIRMET is a see-through volume (${Math.round(ALERT_FILL_OPACITY * 100)} % fill, an estimate) from its base to its top over its area; a PIREP is a small diamond at its position and level. Expired ones are not drawn. Levels: FL × 100 read as feet above sea level, SFC as home’s elevation; a message whose position or levels could not be read is listed on the airfield cards only.`),
      h('ul', {},
        h('li', {}, swatch(ALERT_COLOURS.sigmet), ` ${ALERT_COLOUR_WORDS.sigmet} edge: SIGMET`),
        h('li', {}, swatch(ALERT_COLOURS.airmet), ` ${ALERT_COLOUR_WORDS.airmet} edge: AIRMET`),
        h('li', {}, swatch(PIREP_COLOURS.turb), ` ${ALERT_COLOUR_WORDS.turb} diamond: PIREP of turbulence`),
        h('li', {}, swatch(PIREP_COLOURS.ice), ` ${ALERT_COLOUR_WORDS.ice} diamond: PIREP of icing`),
        h('li', {}, swatch(PIREP_COLOURS.other), ` ${ALERT_COLOUR_WORDS.other} diamond: other PIREP`)),
      h('p', {}, `${alertsView.words || 'SIGMETs/PIREPs: waiting for the first answer.'}${outside}`),
    );
  }

  function drawSpaceKey(volumes, skipped, ground) {
    const used = (ref) => volumes.some((v) => v.floor.ref === ref || v.ceiling?.ref === ref);
    const home = homeIcao();
    // Moose Jaw's six kinds as always, and a US base's own kinds (MOA, warning and alert areas, training routes) only where it has them.
    const colours = Object.entries(KIND_WORDS).filter(([kind]) => BASE_KINDS.includes(kind) || volumes.some((v) => v.kind === kind)).map(([kind, words]) => {
      const swatch = h('span', { class: 'sof-3d-swatch', 'aria-hidden': 'true' });
      swatch.style.background = KIND_COLOURS[kind];
      return h('li', {}, swatch, ` ${words.colour}: ${words.name}`);
    });
    const notes = [];
    const status = airspaceStatus();
    if (status === 'loading') notes.push(h('p', {}, `${AIRSPACE_LOADING_WORDS} (${getSite().airspaceSource ?? 'FAA open aeronautical data'}).`));
    else if (status === 'failed') notes.push(h('p', { class: 'sof-3d-model-warn' }, `${AIRSPACE_FAILED_WORDS}: ${noAirspace() ? 'no airspace is drawn' : 'only the entries built in are drawn'}; it is tried again the next time the 3D view opens.`));
    if (noAirspace() && status === 'ok') notes.push(h('p', {}, `Airspace: no data yet. Each volume is added with its floor, ceiling, outline and source (${getSite().airspaceSource ?? 'NAV CANADA’s Designated Airspace Handbook'}); none is drawn from memory.`));
    if (!noAirspace()) {
      notes.push(
        h('p', {}, `Airspace: each volume runs from its floor to its ceiling, see-through (${Math.round(AIRSPACE_FILL_OPACITY * 100)} % fill, an estimate), with a thin outline on its top and bottom and along its corners. Edge colour by kind:`),
        h('ul', {}, colours),
        h('p', {}, 'Nothing is written on the volumes: put the pointer over one and its name and limits float beside it (the nearest one under the pointer when several overlap), with the kind and the source on hover. Every volume is listed here with its limits:'),
        h('ul', { class: 'sof-3d-airspace-list' }, [...(gl?.space?.built.picks ?? []), ...(gl?.space?.built.lines ?? []).filter((l) => !(gl?.space?.built.picks ?? []).some((p) => p.key === l.key))].map((pick) => h('li', { title: pick.title }, pick.text))),
        getSite().airspaceSource ? h('p', {}, `Source: ${getSite().airspaceSource}.${airspaceOf(getSite()).source ? ` Loaded: ${airspaceOf(getSite()).source}.` : ''} Drawn inside this ${AREA_NM} NM square (an area across its edge is drawn whole; a training route is cut at the edge).`) : null,
        h('p', {}, `Heights are feet above sea level, ×${scale}. SFC is the ground at ${home}’s elevation (${Math.round(ground)} ft).${used('AGL') ? ` AGL ≈ over flat prairie, estimate: ${home}’s elevation plus the height.` : ''}${used('FL') ? ' FL is read as feet above sea level (pressure altitude taken as altitude, an approximation).' : ''}${volumes.some((v) => v.ceiling?.ref === 'UNL') ? ` UNL is drawn up to ${formatFeet(VIEW_TOP_FT)} ft.` : ''}`),
      );
      if (skipped.length) notes.push(h('p', { class: 'sof-3d-model-warn' }, `Not drawn, entry fails its checks: ${skipped.map((x) => `${x.id} (${x.reason})`).join('; ')}.`));
    }
    const drawn = gl?.space?.airports.summary ?? [];
    notes.push(terrainKey, townsKey);
    notes.push(
      h('p', {}, drawn.length
        ? `Airports: ${drawn.map((a) => `${a.icao} (${a.ends.join(', ')})`).join('; ')}. Each runway is drawn between its two thresholds at their true places, length and width (OurAirports, public domain: for drawing only, check the Canada Flight Supplement), at the field’s elevation ×${scale}. Far out, a field is drawn larger and a runway wider so it stays visible (about ${RUNWAY_MIN_PX.length} px long at least); closer in they are true size, and the stripes, centreline and numbers appear once a runway is ${RUNWAY_MIN_PX.detail} px long. The numbers read from the approach end. The terminal and hangars are schematic: buildings are schematic, drawn for orientation only.`
        : 'Airports: none inside this area.'),
      h('p', {}, noRoutes() ? 'TACNAV: no routes to draw.' : `${tacnavNote(home)} A route’s name shows while the pointer is near its line. The routes:`),
      noRoutes() ? null : h('ul', { class: 'sof-3d-airspace-list' }, (gl?.space?.built.labels ?? []).map((label) => h('li', { title: label.title }, label.text))),
      alertsKey,
      h('p', {}, 'A picture for situational awareness: not a chart, not for navigation or flight planning.'),
    );
    spaceKeyBody.replaceChildren(...notes.filter(Boolean)); // replaceChildren would turn a null into the text "null"
  }

  // ---- The instrument approaches (Dad, 8 Oct 2026) ----------------------------------------------------------
  /** The fields the picker offers: the home base's 3D airports (home first, then its usual alternates). */
  const apprIcaos = () => getSite().airports3d ?? [homeIcao()];
  /** The fields drawn now: the one chosen, or all of them; home when the one chosen is not this base's. */
  const apprChosen = () => {
    const list = apprIcaos();
    if (apprField === 'all') return list;
    return list.includes(apprField) ? [apprField] : list.slice(0, 1);
  };

  /** Turns the approaches on or off and picks the field ('home', 'all' or an ICAO); `save` tells the caller to keep the choice. */
  function setApproaches(on, field, { save = false } = {}) {
    const nextField = typeof field === 'string' && field ? field : 'home';
    if (on === apprOn && nextField === apprField) return;
    apprOn = on;
    apprField = nextField;
    apprButton.setAttribute('aria-pressed', String(on));
    syncApprPicker();
    if (save) onApproaches({ on, field: nextField });
    requestRender();
  }

  /** The picker's options, for this base's fields. */
  function syncApprPicker() {
    const list = apprIcaos();
    const sig = `${list.join(',')}|${apprField}`;
    if (sig === apprPickerSig) return;
    apprPickerSig = sig;
    const options = [['home', `${list[0] ?? 'Home'} (home)`], ...list.slice(1).map((icao) => [icao, `${icao} (alternate)`]), ['all', 'All of them']];
    apprPicker.replaceChildren(...options.map(([value, text]) => h('option', { value }, text)));
    apprPicker.value = apprField === 'all' || list.slice(1).includes(apprField) ? apprField : 'home';
  }

  /** The approaches of the fields drawn now (approaches-model.js `fieldApproaches`): the CIFP's where the base's file has them, else the estimate. */
  function apprFieldsNow() {
    const held = approachesOf(getSite());
    return fieldApproaches({ icaos: apprChosen(), file: held.fields, airports: AIRPORTS });
  }

  function freeApproaches() {
    if (!gl?.approaches) return;
    gl.approaches.built.dispose();
    for (const { el } of gl.approaches.labels) el.remove();
    gl.approaches = null;
  }

  /** The approach objects, built new for these fields, height scale, home and area (only then), with their fixes' words as labels. */
  function rebuildApproaches(sig) {
    freeApproaches();
    apprSig = sig;
    if (!apprOn || !gl) {
      drawApproachKey();
      return;
    }
    const status = approachesOf(getSite()).status;
    // A US base's file still on its way: nothing drawn yet (its fields would otherwise show the estimate for a moment); the key says so.
    const fields = status === 'loading' || status === 'idle' ? [] : apprFieldsNow();
    const projection = getProjection();
    const items = fields.flatMap((f) => f.approaches.map((a) => ({ icao: f.icao, geometry: approachGeometry(a, projection.toXY) })));
    const built = buildApproaches(gl.THREE, { items, scale });
    gl.scene.add(built.root);
    // Words beside the fixes that have a role (IAF, IF, FAF, MAP, missed approach holding fix), once per field and fix.
    const seen = new Set();
    const labelsList = [];
    for (const fix of built.fixes) {
      if (!fix.role) continue;
      const key = `${fix.icao}|${fix.ident}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const el = h('span', { class: 'sof-3d-appr-label', title: fix.title, hidden: true }, fix.text);
      labels.append(el);
      labelsList.push({ el, fix });
    }
    gl.approaches = { built, fields, items, labels: labelsList };
    drawApproachKey();
  }

  /** What the corridor check reads: the radar blocks and lightning bolts drawn here, and the SIGMET and G-AIRMET volumes, each with why it can't tell. */
  function corridorWeather() {
    const site = getSite();
    const wx = lastWx ?? getWeather();
    const drawn = gl?.weather?.drawn() ?? { radar: null, lightning: null };
    const picture = (name, source, list, words) => {
      if (!source) return { status: 'none', why: `no ${words} at this base` };
      if (!wx?.[name]) return { status: 'none', why: `no ${words} yet, or it failed` };
      if (wx[name].stale) return { status: 'stale', why: `the ${words} is old` };
      return list ? { status: 'ok' } : { status: 'none', why: `the ${words} could not be read` };
    };
    const radar = { ...picture('radar', site.sources.radar, drawn.radar, 'radar picture'), blocks: drawn.radar ?? [] };
    const lightning = { ...picture('lightning', site.sources.lightning, drawn.lightning, 'lightning picture'), bolts: drawn.lightning ?? [], cellFt: cellFt() };
    const toXY = getProjection().toXY;
    const alerts = alertsView.status === 'ok'
      ? { status: 'ok', volumes: alertsView.alerts.filter((a) => a.kind !== 'pirep' && a.area).map((a) => ({ ring: areaRingXY(a.area, toXY), baseFt: a.baseFt, topFt: a.topFt, words: `${a.kindWords}${a.series ? ` ${a.series}` : ''}${a.hazards?.words?.length ? ` (${a.hazards.words.join(', ')})` : ''}` })) }
      : { status: 'none', why: alertsView.words || 'not available' };
    return { radar, lightning, alerts };
  }

  /** The arrival corridor check for every approach drawn (information only: no caution, no limit), its words in the key, and the cards' summary to the caller. */
  function runCorridors(sig) {
    corridorSig = sig;
    const results = new Map();
    if (apprOn && gl?.approaches) {
      const weather = corridorWeather();
      for (const f of gl.approaches.fields) {
        const list = gl.approaches.items.filter((i) => i.icao === f.icao).map((i) => corridorCheck(i.geometry, weather));
        if (list.length) results.set(f.icao, { results: list, summary: corridorSummary(list, { estimate: f.source !== 'cifp' }), estimate: f.source !== 'cifp' });
      }
    }
    const had = corridorResults.size > 0;
    corridorResults = results;
    drawApproachKey();
    if (had || results.size) onCorridors(results); // nothing to tell the cards when nothing was or is checked
  }

  /** The Approaches key: the picker's field(s), where the data comes from, the colours in words, how it is drawn, and the corridor words. */
  function drawApproachKey() {
    syncApprPicker();
    const held = approachesOf(getSite());
    const swatch = (colour) => {
      const el = h('span', { class: 'sof-3d-swatch', 'aria-hidden': 'true' });
      el.style.background = colour;
      return el;
    };
    const notes = [];
    if (!apprOn) notes.push(h('p', {}, 'Approaches are off: press Approaches to draw them for the field chosen here.'));
    if (held.status === 'loading' || (apprOn && held.status === 'idle')) notes.push(h('p', {}, `${APPROACHES_LOADING_WORDS} (FAA CIFP).`));
    if (held.status === 'failed') notes.push(h('p', { class: 'sof-3d-model-warn' }, `${APPROACHES_FAILED_WORDS}: the US fields show only the estimate; it is tried again the next time the 3D view opens.`));
    const fields = gl?.approaches?.fields ?? [];
    const groups = new Set(fields.flatMap((f) => f.approaches.map((a) => a.group)));
    // The corridor words first: what the SOF looks for.
    if (apprOn && fields.length) {
      const first = [...corridorResults.values()][0]?.results[0];
      notes.push(h('p', {}, `Arrival corridor, information only (never a caution, never a limit): ±${CORRIDOR.finalHalfNm} NM either side of the final segment (FAF to MAP), ±${CORRIDOR.initialHalfNm} NM either side of the initial and intermediate segments, from ${formatFeet(CORRIDOR.belowFt)} ft below the path to ${formatFeet(CORRIDOR.aboveFt)} ft above it (estimates); checked against the radar blocks, lightning cells and SIGMET/G-AIRMET volumes drawn here. The missed approach is not checked.`));
      if (first?.cantTell.length) notes.push(h('p', { class: 'sof-3d-model-warn' }, `Can’t tell: ${first.cantTell.join('; ')}.`));
      for (const f of fields) {
        const r = corridorResults.get(f.icao);
        if (!r) continue;
        const n = r.results.filter((x) => x.hits.length).length;
        notes.push(h('p', {}, `${f.icao}: ${n} of ${r.results.length} ${r.estimate ? 'estimated paths' : 'approaches'} with weather in the corridor.`), h('ul', { class: 'sof-3d-airspace-list' }, r.results.map((x) => h('li', { class: x.hits.length ? 'sof-3d-appr-hit' : '' }, `${x.hits.length ? '⚠ ' : ''}${x.shortWords}`))));
      }
    }
    if (held.source && fields.some((f) => f.source === 'cifp')) notes.push(h('p', {}, `Source: ${held.source}; trimmed by tools/cifp-approaches.mjs. No minima are coded in the CIFP: minima stay entered by hand.`));
    for (const f of fields.filter((x) => x.source !== 'cifp')) notes.push(h('p', {}, `${f.icao}: ${ESTIMATE_WORDS}. ${f.note}.`));
    if (groups.size) {
      notes.push(h('p', {}, 'Colour by approach type:'), h('ul', {}, Object.entries(APPROACH_GROUPS).filter(([g]) => groups.has(g)).map(([g, look]) => h('li', {}, swatch(look.colour), ` ${look.words}: ${look.name}${g === 'rnav' ? ', drawn fainter: the T-6A can’t rely on GPS (AFMAN 11-202V3 4.17.3, Dad’s ruling)' : ''}`))));
    }
    if ([...groups].some((g) => g !== 'estimate')) {
      notes.push(h('p', {}, `Each path runs through its fixes at the coded altitudes ×${scale} (between constraints, straight lines; a “between” is drawn at its lower altitude; a leg with no fix, such as climb on a heading, goes straight on to the next fix). A fix's words: ident, role and altitude, “3,000+” at or above, “3,000-” at or below. The localizer course and a VOR, TACAN or NDB final course are dashed on the ground; the glidepath (or coded descent angle) is a white line from the FAF's distance down to the runway threshold at its angle and threshold crossing height; DME arcs are drawn round their navaid; the missed approach is dashed; holds are racetracks of ${HOLD_DRAW.nmPerMinute} NM a minute with ${HOLD_DRAW.turnNm} NM turns (estimates for the picture). An ILS and a LOC to the same runway are one, “ILS or LOC”. Put the pointer on a path for its words.`));
    }
    if (groups.has('estimate')) notes.push(h('p', {}, `An estimated field: each runway end's centreline dashed on the ground out to ${ESTIMATE.lengthNm} NM, and a ${ESTIMATE.angleDeg}° path from there down to ${ESTIMATE.tchFt} ft over the threshold (all estimates, from the runways in airports-data.js), ×${scale}.`));
    notes.push(h('p', {}, 'A picture for situational awareness: not a chart, never for navigation.'));
    apprKeyBody.replaceChildren(...notes);
  }

  // ---- The aircraft (phase 4) ---------------------------------------------------------------------------
  // Gliding (Dad, 7 Oct): between the relay's answers each aircraft is moved along its track at its ground speed. It runs on the scheduler's frame,
  // but acts at most every GLIDE_3D_MS (about ten a second), moves only objects that already exist, and then asks for one picture. It exists only while the
  // Traffic layer is on and the view is shown, and ends with the view (teardown) or when the layer goes off.
  let stopGlide = null;
  function syncGlide() {
    const should = Boolean(gl) && wanted && !disposed && trafficState.shown === true && trafficState.aircraft.some((a) => Number.isFinite(a.vx));
    if (!should) {
      stopGlide?.();
      stopGlide = null;
      return;
    }
    if (stopGlide) return;
    let waited = GLIDE_3D_MS; // the first frame acts
    stopGlide = timers.frame((dt) => {
      waited += dt;
      if (waited < GLIDE_3D_MS || !gl || !wanted) return;
      waited = 0;
      if (gl.traffic.glide(trafficState.aircraft, +now()) > 0) requestRender();
    });
  }

  /** Brings the aircraft objects in line with what the map last gave setTraffic (they are made, moved and freed in traffic3d.js). */
  function syncTraffic() {
    trafficDirty = false;
    if (!gl) return;
    const items = trafficState.shown ? trafficState.aircraft : [];
    gl.traffic.set(items, { scale, groundFt: groundFt(), intruders: intruderHexes, nowMs: +now(), trailsOn: trafficState.trailsOn === true, terrain: gl.terrain });
    if (hoverHex && !gl.traffic.get(hoverHex)) hoverHex = null;
    if (selectedAc && !gl.traffic.get(selectedAc)) selectAircraft(null);
    else if (selectedAc) setText(acTag, gl.traffic.get(selectedAc).item.description);
    for (const e of gl.traffic.entries()) sizes.delete(e.tagEl); // the words may have changed, so the tag's size is read again
  }

  /** The aircraft whose middle is nearest to a point of the page, within a few pixels, from where the last picture put them; else null. */
  function aircraftNear(clientX, clientY) {
    if (!gl) return null;
    const rect = gl.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (const e of gl.traffic.entries()) {
      const d = Math.hypot(e.screen.x - x, e.screen.y - y);
      if (d < bestD && d <= Math.max(AIRCRAFT_HOVER_PX, e.px / 2 + 4)) {
        best = e.hex;
        bestD = d;
      }
    }
    return best;
  }

  function setHover(hex) {
    if (hex === hoverHex) return;
    hoverHex = hex;
    gl?.canvas.classList.toggle('is-over-aircraft', hex !== null);
    requestRender();
  }

  /** Shows an aircraft's facts (the 2D popup's words) in a small tag beside it, or closes it. The camera never moves. */
  function selectAircraft(hex) {
    selectedAc = hex;
    const entry = hex && gl ? gl.traffic.get(hex) : null;
    if (hex && !entry) selectedAc = null;
    acTag.hidden = !entry;
    if (entry) setText(acTag, entry.item.description);
    requestRender();
  }

  /** `]` and `[` step through the aircraft, T-6s first, as they step through the traffic on the 2D map. Returns false when there are none. */
  function stepAircraft(direction) {
    const list = gl ? [...gl.traffic.entries()] : [];
    if (!list.length) return false;
    const at = list.findIndex((e) => e.hex === selectedAc);
    selectAircraft(list[(at + direction + list.length) % list.length].hex);
    return true;
  }

  /**
   * Puts each aircraft's tag beside it: a T-6's always, the others' on hover, focus (the selected one) or when the Labels choice is on. Also
   * fills in where each stands on the screen, for the hover. A tag is tried at a few places round its aircraft and takes the first that
   * covers no other word, so it never drifts far from what it names. `phase` is 't6' (before the model's words, so they step round the T-6s)
   * or 'others'.
   */
  function placeAircraft({ at, put, boxFor, isClear, reserve, phase }) {
    const list = [...gl.traffic.entries()];
    if (phase === 't6') for (const e of list) e.screen = at(e.group.position);
    const wanted = (e) => e.item.isT6 || e.intruder || trafficState.labelsOn || e.hex === hoverHex || e.hex === selectedAc || e.hex === tourHex;
    const early = (e) => e.item.isT6 || e.intruder; // a T-6's tag and an intruder's keep their places; the others step round them
    if (phase === 't6') {
      for (const e of list) {
        const on = wanted(e);
        if (e.tagEl.hidden === on) e.tagEl.hidden = !on;
        e.tagEl.classList.toggle('is-tour', e.hex === tourHex); // the T-6 the tour is following
        // A T-6 and its halo are kept clear of every tag, so a tag never lands on the wrong aircraft.
        if (e.item.isT6) reserve({ x: e.screen.x - 0.7 * e.px, y: e.screen.y - 0.55 * e.px, w: 1.4 * e.px, h: 1.1 * e.px });
      }
    }
    for (const e of list.filter((x) => (phase === 't6') === early(x) && wanted(x))) {
      const s = boxFor(e.tagEl, 0, 0);
      const r = e.px * 0.7 + 4;
      const { x, y } = e.screen;
      const spots = [[x + r, y - s.h - 2], [x + r, y + 4], [x - r - s.w, y - s.h - 2], [x - r - s.w, y + 4], [x - s.w / 2, y - r - s.h], [x - s.w / 2, y + r],
        [x + r, y - 2 * s.h - 6], [x - r - s.w, y - 2 * s.h - 6], [x + r, y + s.h + 8], [x - r - s.w, y + s.h + 8]];
      const boxes = spots.map(([bx, by]) => ({ ...s, x: bx, y: by }));
      put(e.tagEl, boxes.find((box) => isClear(box)) ?? boxes[0]);
    }
    if (phase === 'others') {
      const chosen = selectedAc && gl.traffic.get(selectedAc);
      if (chosen) acTag.style.transform = `translate(${Math.round(chosen.screen.x + chosen.px * 0.7 + 4)}px, ${Math.round(chosen.screen.y + 8)}px)`;
    }
  }

  // ---- The terrain (Dad, 7 Oct) --------------------------------------------------------------------------
  /** The key's words and the credit for how much terrain has come, and the note when some did not. Cheap: it only writes what changed. */
  function updateTerrainWords() {
    const st = gl.terrain.state();
    const sig = `${st.wanted}|${st.ready}|${st.failed}|${st.pending}|${st.capped}|${terrainOn}|${scale}`;
    if (sig === terrainWordsSig) return;
    terrainWordsSig = sig;
    setText(terrainKey, `${terrainWords(st, { on: terrainOn, tilesCapped: st.capped })} ${TERRAIN_CREDIT}. Heights are ×${scale}, as everything else. Runways stay at their field’s elevation and the METAR decks at the field’s elevation plus their base; aircraft stay at their reported height above sea level and are never moved by the terrain (one reported under the ground below it is drawn just above the ground and says “below terrain?”). Airspace floors marked AGL or SFC, the TACNAV routes and the SIGMETs are still measured from home’s elevation, not the terrain.`);
    const credited = terrainOn && st.ready > 0;
    if (credited !== creditTerrain) {
      creditTerrain = credited;
      updateCredit();
    }
    const partly = terrainOn && (st.failed > 0 || st.capped);
    if (partly !== terrainPartly) {
      terrainPartly = partly;
      showNote();
    }
  }

  /**
   * Keeps the ground's heights up to date, once a frame when something may have changed: the terrain's grids are re-read from the tiles at most every TERRAIN_APPLY_MS while tiles
   * arrive, the ground meshes are given them (or laid flat when the Terrain switch is off), and what stands on the ground is told (terrainRev) when the new terrain has settled or
   * TERRAIN_DEPS_MS have passed, so the shafts, bolts, fronts, pins, rings and aircraft are not rebuilt for every tile.
   */
  function syncTerrain() {
    const t = gl.terrain;
    t.setView(getProjection(), groundFt());
    t.setEnabled(terrainOn);
    const clock = win.performance.now();
    if (terrainDepsDue) {
      terrainDepsDue = false;
      if (terrainDepsWaiting) {
        terrainDepsWaiting = false;
        terrainRev += 1;
        terrainDepsAt = clock;
      }
    }
    if (t.isDirty()) {
      const wait = TERRAIN_APPLY_MS - (clock - terrainAppliedAt);
      if (wait > 0) {
        if (!terrainTimer) {
          terrainTimer = timers.after(wait, () => {
            terrainTimer = null;
            requestRender();
          });
        }
      } else {
        terrainAppliedAt = clock;
        t.refresh();
        const switched = terrainOn !== terrainDepsOn;
        if (terrainOn || switched) {
          if (switched || t.state().pending === 0 || clock - terrainDepsAt >= TERRAIN_DEPS_MS) {
            terrainRev += 1;
            terrainDepsAt = clock;
            terrainDepsOn = terrainOn;
            terrainDepsWaiting = false;
          } else if (!terrainDepsWaiting) {
            terrainDepsWaiting = true;
            terrainDepsTimer?.();
            terrainDepsTimer = timers.after(TERRAIN_DEPS_MS, () => {
              terrainDepsTimer = null;
              terrainDepsDue = true;
              requestRender();
            });
          }
        }
        terrainDepsOn = terrainOn;
      }
    }
    const sig = `${t.revision}|${scale}|${terrainOn}|${groundFt()}`;
    if (sig !== reliefSig) {
      reliefSig = sig;
      gl.ground.setRelief({ grids: t.grids, on: terrainOn, scale, homeFt: groundFt() });
    }
    if (terrainRev !== terrainSeen) {
      terrainSeen = terrainRev;
      sceneDirty = true; // the pins, drop lines and rings stand on the new ground
      weatherDirty = true; // so do the shafts, bolts and fronts
      trafficDirty = true; // and the aircraft's ground, their drop lines and their "below terrain?"
    }
    updateTerrainWords();
  }

  // ---- One frame -----------------------------------------------------------------------------------
  function render() {
    if (!gl || !wanted || disposed) return;
    const { renderer, scene, camera, canvas } = gl;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return; // hidden or not laid out yet: the resize observer draws when it has a size
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) renderer.setSize(width, height, false);

    syncTerrain();
    if (sceneDirty) {
      freeObjects();
      gl.objects = buildObjects();
      sceneDirty = false;
      trafficDirty = true; // the ground's height or the scale may have changed: the aircraft stand on the same ground
      weatherDirty = true; // and so do the shafts, bolts and fronts
      if (selected && !airfields.some((a) => a.icao === selected && !a.outside)) select(null);
    }
    // The inputs' signatures are looked at once a second at most (the wind flow draws about thirty frames a second, and each look reads every feed's state); `touch()` asks for
    // a picture the moment something does change.
    const looked = win.performance.now();
    let wx = null;
    if (looked - signaturesAt >= SIGNATURE_CHECK_MS) {
      signaturesAt = looked;
      if (!groundDirty && getPictures().sig !== picturesSig) groundDirty = true;
      wx = getWeather();
      lastWx = wx;
      if (wx.sig !== weatherSig) weatherDirty = true;
      // The slabs are built again when the HRDPS cloud picture for the hour shown comes, goes or fails.
      const { status, model, now: at } = modelState;
      if (gl.model && (cloudStyle === 'slabs' || cloudHeight !== null) && status === 'ok' && model) {
        const hour = hourIndex(model, +at, ahead);
        if (`${detailOf(wx, model, hour).key}|${cloudStyle === 'slabs' ? anchorsOf(wx, model, hour).key : 'none'}` !== gl.model.inputs) modelDirty = true; // as rebuildModel makes `inputs`
      }
    }
    if (modelDirty) {
      rebuildModel();
      weatherDirty = true; // the shafts, bolts and satellite sheet stand on the slabs
    }
    rebuildSheet(); // the "Cloud at" sheet, when the model layers or the height changed (nothing to do otherwise)
    if (weatherDirty) rebuildWeather(wx ?? lastWx ?? getWeather());
    if (getSite() !== airspaceAsked) { // this base's airspace file, once each time the view opens at it (a failed load is tried again then)
      airspaceAsked = getSite();
      loadAirspaceFor(airspaceAsked, () => requestRender());
    }
    const nextSpaceSig = `${scale}|${groundFt()}|${getProjection().lat},${getProjection().lon}|${airspaceStatus()}|${AREA_NM}`;
    if (!gl.space || nextSpaceSig !== spaceSig) rebuildSpace(nextSpaceSig);
    const nextAlertsSig = `${nextSpaceSig}|${alertsView.signature}`;
    if (!gl.alerts || nextAlertsSig !== alertsSig) rebuildAlerts(nextAlertsSig);
    if (apprOn && getSite() !== apprAsked) { // this base's approaches file, once each time the view opens at it with the Approaches on (a failed load is tried again then)
      apprAsked = getSite();
      loadApproachesFor(apprAsked, () => requestRender());
    }
    const nextApprSig = apprOn ? `${scale}|${getProjection().lat},${getProjection().lon}|${AREA_NM}|${getSite().icao}|${approachesOf(getSite()).status}|${apprChosen().join(',')}` : `off|${getSite().icao}`; // off: built again only to refresh the key's picker for a new home
    if (nextApprSig !== apprSig) rebuildApproaches(nextApprSig);
    const nextCorridorSig = apprOn ? `${apprSig}|${weatherRev}|${alertsSig}` : apprSig;
    if (nextCorridorSig !== corridorSig) runCorridors(nextCorridorSig);
    const nextTownsSig = `${scale}|${terrainOn ? terrainRev : 'flat'}|${getProjection().lat},${getProjection().lon}`;
    if (!gl.towns || nextTownsSig !== townsSig) rebuildTowns(nextTownsSig);
    if (trafficDirty) syncTraffic();
    if (groundDirty) paintGround();

    const { pins, rings, decks, planeZ } = gl.objects;
    const size = { width, height };
    const zoom = fitZoom(size) * cam.zoom;
    // The point looked at is home's ground unless the tour moved it (cam.tx, ty, tz: feet from home and feet above sea level).
    matchProjection(THREE, camera, { x: cam.tx ?? 0, y: cam.ty ?? 0, z: cam.tz ?? planeZ / scale }, { yawDeg: cam.yawDeg, pitchDeg: cam.pitchDeg, zoom, altScale: scale }, size);
    // The square is 450 NM across or more: its far corners lie further from the view's middle than the shared camera's depth range reaches (ui-kit `matchProjection` is for 250 NM
    // and less), so the range is widened here, in step with the area chosen (and so it still reaches the far corner with the map slid to the edge). An orthographic camera has no
    // perspective to spoil, only depth precision (24 bits over some 8 million ft at 450 NM is about half a foot; 16 million at 900 NM, about a foot).
    const depth = AREA_NM / DEFAULT_AREA_NM;
    camera.near = CAMERA_NEAR_FT * depth;
    camera.far = CAMERA_FAR_FT * depth;
    camera.updateProjectionMatrix();
    const ftPerPx = 1000 / zoom;
    gl.weather.setZoom(cam.zoom);
    for (const { pin } of pins) pin.scale.setScalar(ftPerPx);
    gl.traffic.fit(ftPerPx);
    gl.space?.airports.fit(ftPerPx);
    gl.alerts?.fit(ftPerPx);

    // Labels go beside their points, and a deck's label steps down past any label already there, so words never sit on words.
    const headAbove = (PIN_PX.line + PIN_PX.head) * ftPerPx;
    const placed = [];
    const put = (el, box) => {
      const text = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
      if (el.style.transform !== text) el.style.transform = text;
      placed.push(box);
    };
    const boxFor = (el, x, y) => {
      let s = sizes.get(el);
      if (!s || s.w === 0) {
        s = { w: el.offsetWidth, h: el.offsetHeight };
        sizes.set(el, s);
      }
      return { x, y, w: s.w, h: s.h };
    };
    const at = (point) => worldToScreen(THREE, camera, point, width, height);
    const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const reserve = (box) => placed.push(box);
    const isClear = (box) => !placed.some((b) => overlaps(box, b));
    const clearOf = (box) => {
      for (let tries = 0; tries < 12 && placed.some((b) => overlaps(box, b)); tries++) box.y += box.h + 1;
      return box;
    };
    for (const { button, point, baseZ } of pins) { // home first: it keeps its place and the others step down past it
      const p = at({ ...point, z: baseZ + headAbove });
      const s = boxFor(button, 0, 0);
      put(button, clearOf({ ...s, x: p.x + 10, y: p.y - s.h / 2 }));
    }
    for (const { el, point } of rings) {
      const p = at(point);
      const s = boxFor(el, 0, 0);
      put(el, { ...s, x: p.x - s.w / 2, y: p.y - s.h });
    }
    const deckLabels = decks.map(({ el, point }) => ({ el, p: at(point) })).sort((a, b) => a.p.y - b.p.y);
    for (const { el, p } of deckLabels) {
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: p.x - 8 - s.w, y: p.y - s.h / 2 }));
    }
    for (const { el, entry } of gl.towns?.items ?? []) { // a town's name: zoomed in, or under the pointer
      const on = spaceToggles.towns && (cam.zoom >= TOWN_LABEL_ZOOM || townHover === entry.id);
      if (el.hidden === on) el.hidden = !on;
      if (!on) continue;
      const p = at({ x: entry.x, y: entry.y, z: entry.z + entry.tallFt });
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: p.x - s.w / 2, y: p.y - s.h - 4 }));
    }
    const apprLabelsOn = apprOn && (apprField !== 'all' || cam.zoom >= APPROACH_ALL_LABEL_ZOOM);
    for (const { el, fix } of gl.approaches?.labels ?? []) { // the approach fixes' words: "ALAMO FAF 2,200+"
      if (el.hidden === apprLabelsOn) el.hidden = !apprLabelsOn;
      if (!apprLabelsOn) continue;
      const p = at(fix.point);
      if (p.x < -50 || p.y < -50 || p.x > width + 50 || p.y > height + 50) continue;
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: p.x + 6, y: p.y - s.h - 2 }));
    }
    placeAircraft({ at, put, boxFor, isClear, reserve, phase: 't6' }); // the T-6s' tags keep their places; the model's words step round them
    const modelWords = [];
    for (const { el, group, point, hPa, side } of [...(gl.model?.items ?? []), ...(gl.sheet?.items ?? [])]) { // the model's words: each cloud level (or slab), the winds over home, the freezing level, the "Cloud at" sheet
      const on = group === 'altitude' || shownGroup(group);
      if (el.hidden === on) el.hidden = !on;
      if (on) modelWords.push({ el, group, hPa, side, p: at(point) });
    }
    modelWords.sort((a, b) => a.p.y - b.p.y); // top of the picture first, so a label only ever steps down past the ones above it
    for (const { el, group, hPa, side, p } of modelWords) {
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: group === 'freezing' || hPa !== undefined || side === 'left' ? p.x - s.w - 6 : p.x + 8, y: p.y - s.h / 2 }));
    }
    for (const { el, point } of gl.weather?.items() ?? []) { // the fronts' pressure centres: "H 1024", "L 995"
      if (el.hidden) continue;
      const s = boxFor(el, 0, 0);
      const p = at(point);
      put(el, clearOf({ ...s, x: p.x - s.w / 2, y: p.y - s.h / 2 }));
    }
    placeAircraft({ at, put, boxFor, isClear, reserve, phase: 'others' });
    const chosen = selected && pins.find((q) => q.field.icao === selected);
    if (chosen) {
      const p = at({ ...chosen.point, z: chosen.baseZ + headAbove });
      tag.style.transform = `translate(${Math.round(p.x + 10)}px, ${Math.round(p.y + 28)}px)`;
    }

    try {
      renderer.render(scene, camera);
    } catch (err) {
      // The browser refuses a picture from another site as a texture (a tile that came without permission): draw the ground plain.
      if (!noTiles && /security/i.test(`${err?.name} ${err?.message}`)) {
        noTiles = true;
        groundDirty = true;
        showNote();
        requestRender();
        return;
      }
      throw err;
    }
  }

  function select(icao) {
    selected = icao;
    if (gl?.objects) for (const { field, button } of gl.objects.pins) button.setAttribute('aria-pressed', String(field.icao === icao));
    const field = icao ? airfields.find((a) => a.icao === icao && !a.outside) : null;
    tag.hidden = !field;
    if (field) setText(tag, `${field.icao}: ${field.result?.words ?? field.lines.join(', ')}`); // the card's own result line, as words
    requestRender();
  }

  // ---- The camera's hands: drag to turn, right-drag, Shift-drag or two fingers to slide the map, wheel or pinch to zoom, arrow keys to turn (Shift: slide) --------------------
  const pointers = new Map();
  let drag = null; // { x, y, moved, pan } for a single pointer: `pan` slides the map (right button or Shift held), else the drag turns the view
  let pinch = null; // two pointers: { spread (their distance), x, y (their midpoint) } last time

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  /** The ground feet one screen pixel spans at the zoom in use (the view's fit zoom times the camera's). */
  const ftPerPxNow = () => {
    const size = { width: gl?.canvas.clientWidth ?? 1, height: gl?.canvas.clientHeight ?? 1 };
    return 1000 / (fitZoom(size) * cam.zoom);
  };
  /** Slides the map by a drag of (dx, dy) pixels: the ground follows the pointer, and the point looked at stays inside the square (scene3d-model.js `panBy`). */
  const panCamera = (dx, dy) => {
    cam = panBy(cam, dx, dy, ftPerPxNow());
  };
  const hands = /** @type {[string, (e: any) => void][]} */ ([
    ['pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return; // the left button turns (Shift: slides), the right slides
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gl?.canvas.setPointerCapture?.(e.pointerId);
      clearSpaceMove(); // a press is for dragging or clicking, not for reading
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey === true, click: e.button !== 2 };
      else {
        drag = null;
        pinch = { spread: spread(), ...midpoint() };
      }
      gl?.canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      const held = pointers.get(e.pointerId);
      if (!held) {
        if (pointers.size === 0 && e.pointerType === 'mouse') { // hovering, not dragging
          setHover(aircraftNear(e.clientX, e.clientY));
          setTownHover(townNear(e.clientX, e.clientY));
          const rect = gl.canvas.getBoundingClientRect();
          onSpaceMove(e.clientX - rect.left, e.clientY - rect.top);
        }
        return;
      }
      held.x = e.clientX;
      held.y = e.clientY;
      if (pointers.size >= 2 && pinch) {
        setOrbit(false); // a pinch or a two-finger drag is the SOF taking the camera
        const now = spread();
        const mid = midpoint();
        if (now > 0 && pinch.spread > 0) cam = zoomCamera(cam, now / pinch.spread, 1);
        panCamera(mid.x - pinch.x, mid.y - pinch.y); // two fingers moving together slide the map
        pinch = { spread: now, ...mid };
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.moved >= CLICK_PX) setOrbit(false); // a drag is the SOF taking the camera; a click on an aircraft is not
        if (drag.pan) panCamera(dx, dy);
        else cam = orbitBy(cam, dx, dy);
      }
      requestRender();
    }],
    ['pointerup', endPointer],
    ['pointercancel', endPointer],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const turn = KEY_ORBIT_PX[e.key];
      if (turn && e.shiftKey) {
        // Shift and an arrow slides the view that way: the point looked at moves right for the right arrow, up the screen for the up arrow (a drag the other way).
        e.preventDefault();
        setOrbit(false);
        panCamera(-Math.sign(turn[0]) * KEY_PAN_PX, -Math.sign(turn[1]) * KEY_PAN_PX);
      } else if (turn) {
        e.preventDefault();
        setOrbit(false);
        cam = orbitBy(cam, turn[0], turn[1]);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setOrbit(false);
        cam = zoomCamera(cam, ZOOM_STEP, 1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setOrbit(false);
        cam = zoomCamera(cam, 1 / ZOOM_STEP, 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setOrbit(false);
        cam = homeCamera();
      } else if ((e.key === ']' || e.key === '[') && gl?.traffic) {
        if (!stepAircraft(e.key === ']' ? 1 : -1)) return; // none to step through: the key is left alone
        e.preventDefault();
      } else if (e.key === 'Escape' && (selected || selectedAc)) {
        e.stopPropagation();
        select(null);
        selectAircraft(null);
        return;
      } else return;
      requestRender();
    }],
    ['pointerleave', () => {
      setHover(null);
      setTownHover(null);
      clearSpaceMove();
    }],
    ['contextmenu', (e) => e.preventDefault()],
    ['webglcontextlost', (e) => {
      e.preventDefault();
      teardown({ lost: true });
      element.hidden = true;
      wanted = false;
      onLost();
    }],
  ]);

  // Escape closes a tag from a tag's own button too (focus is there after a click on it), not only from the canvas.
  function onLabelKey(e) {
    if (e.key !== 'Escape' || (!selected && !selectedAc) || e.altKey || e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    select(null);
    selectAircraft(null);
    gl?.canvas.focus?.();
  }

  // The wheel zooms over the whole view, labels included (a pin's label is a button over the picture).
  function onWheel(e) {
    e.preventDefault(); // the page does not scroll while the pointer is over the view
    if (!e.deltaY) return;
    clearSpaceMove();
    setOrbit(false);
    cam = zoomCamera(cam, Math.exp(-e.deltaY * WHEEL_ZOOM), 1);
    requestRender();
  }

  function endPointer(e) {
    pointers.delete(e.pointerId);
    gl?.canvas.releasePointerCapture?.(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      gl?.canvas.classList.remove('is-dragging');
      // A press that never moved is a click: on an aircraft it shows that aircraft's facts, anywhere else it only closes a tag. The camera never moves on a click.
      if (drag && drag.click && drag.moved < CLICK_PX && e.type === 'pointerup') {
        const hit = aircraftNear(e.clientX, e.clientY);
        if (hit) selectAircraft(selectedAc === hit ? null : hit);
        else {
          if (selected) select(null);
          if (selectedAc) selectAircraft(null);
        }
      }
      drag = null;
    } else if (pointers.size === 1) {
      const [p] = pointers.values();
      drag = { x: p.x, y: p.y, moved: CLICK_PX, pan: false, click: false }; // one finger left after two: it turns the view again
    }
  }

  // ---- Orbit (Dad, 7 Oct) --------------------------------------------------------------------------------
  /** Reduced motion, by the Settings choice (data-motion on the page) or else the computer's own setting. */
  function reducedMotion() {
    const choice = win.document?.documentElement?.dataset?.motion;
    if (choice === 'reduced') return true;
    if (choice === 'full') return false;
    return win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  /** Turns the camera round home by `deg` (at the zoom and tilt it has). */
  const orbitTurn = (deg) => {
    cam = orbitBy(cam, deg / ORBIT_DEG_PER_PX.yaw, 0);
  };

  /**
   * Orbit on or off. While on and shown, the camera turns one round in ORBIT_SECONDS_PER_TURN: smoothly on the scheduler's frame (the one case where the
   * view draws every frame), or, with reduced motion, ORBIT_STEP.deg every ORBIT_STEP.ms. The loop ends the moment it is off, the view is hidden or the
   * module closes. Any camera input from the SOF turns it off.
   */
  function setOrbit(on) {
    if (on === orbitOn) return;
    orbitOn = on;
    orbitButton.setAttribute('aria-pressed', String(on));
    stopOrbit?.();
    stopOrbit = null;
    if (!on) endTour(); // the Tour rides on Orbit: Orbit off (a drag, the wheel, a key, Home, or its button) is the Tour off
    if (!on || !gl || !wanted || disposed) return;
    if (reducedMotion()) {
      stopOrbit = timers.every(ORBIT_STEP.ms, () => {
        tourTick(ORBIT_STEP.ms, true);
        orbitTurn(ORBIT_STEP.deg);
        requestRender();
      });
    } else {
      const degPerMs = 360 / (ORBIT_SECONDS_PER_TURN * 1000);
      stopOrbit = timers.frame((dt) => {
        if (!gl || !wanted) return;
        const ms = Math.min(dt, ORBIT_MAX_FRAME_MS);
        tourTick(Math.min(dt, TOUR_MAX_FRAME_MS), false); // the tour keeps real time even when frames are slow (the camera's turn above does not jump)
        orbitTurn(ms * degPerMs);
        render();
      });
    }
  }

  // ---- Tour (Dad, 7 Oct): the camera visits the targets in tour-model.js's list, one after the other ---------------------
  /** Where the camera is looking and how, as the tour's fly takes it: { tx, ty, tz, zoom, pitch }. */
  const poseNow = () => ({ tx: cam.tx ?? 0, ty: cam.ty ?? 0, tz: cam.tz ?? groundFt(), zoom: cam.zoom, pitch: cam.pitchDeg });

  /** The stops there are now (the fields in the scene, the airborne T-6s the traffic feed has). */
  const tourStopsNow = () => tourStops({ targets: getSite().tourTargets, airfields, aircraft: trafficState.shown ? trafficState.aircraft : [] });

  /** Where a stop is now, in feet from home (z: feet above sea level), and how closely to frame it; a T-6 is where it is drawn this moment. Null when it has gone. */
  function tourTarget(stop) {
    const size = { width: gl.canvas.clientWidth, height: gl.canvas.clientHeight };
    const zoom = framingZoom({ nm: stop.nm, size, fit: fitZoom(size) });
    if (stop.kind === 'field') return { tx: stop.x, ty: stop.y, tz: stop.groundFt + TOUR_FIELD_AGL_FT, zoom, pitch: TOUR_PITCH_DEG };
    const entry = gl.traffic.get(stop.hex);
    if (!entry) return null;
    const at = entry.group.position;
    return { tx: at.x, ty: at.y, tz: at.z / scale, zoom, pitch: TOUR_PITCH_DEG };
  }

  /** Moves on to the next stop (or the first), the camera flying from where it is. Ends the tour when there is nothing to visit. */
  function tourAdvance() {
    const stops = tourStopsNow();
    const index = nextStopIndex(stops, tour?.stop.key ?? null, tour?.index ?? 0);
    if (index < 0) {
      setTourWords(null);
      tour = null;
      tourHex = null;
      return false;
    }
    tour = { stop: stops[index], index, elapsed: 0, from: poseNow() };
    tourHex = tour.stop.kind === 'aircraft' ? tour.stop.hex : null;
    return true;
  }

  function setTourWords(words, elapsed = 0) {
    tourCaptionEl.hidden = !tourOn || words === null;
    hint.hidden = !tourCaptionEl.hidden; // the tour's caption takes the hint's place
    if (words !== null) {
      setText(tourWhat, words);
      setText(tourNext, nextInWords(elapsed));
    }
  }

  /**
   * One step of the tour, called by Orbit's loop with the time since the last (milliseconds): the camera flies to the stop's place over TOUR_FLY_S (at once with reduced
   * motion, `step`), then stays on it (a T-6 is followed as it moves) until TOUR_DWELL_S have passed at the stop. A T-6 that has left the feed is skipped at once. The camera
   * is only set; Orbit's own turn and the picture follow.
   */
  function tourTick(ms, step) {
    if (!tourOn || !gl) return;
    if (!tour && !tourAdvance()) return;
    tour.elapsed += ms;
    for (let guard = 0; guard < 4; guard++) { // a stop that has gone is skipped on the spot
      const gone = tour.stop.kind === 'aircraft' && !trafficState.aircraft.some((a) => a.hex === tour.stop.hex && a.isT6 === true && a.altFt !== 'ground');
      const target = gone ? null : tourTarget(tour.stop);
      if (target) {
        const flown = step ? 1 : Math.min(1, tour.elapsed / (TOUR_FLY_S * 1000));
        const pose = flyPose(tour.from, target, flown);
        cam = { ...cam, tx: pose.tx, ty: pose.ty, tz: pose.tz, zoom: pose.zoom, pitchDeg: pose.pitch };
        const aircraft = tour.stop.kind === 'aircraft' ? trafficState.aircraft.find((a) => a.hex === tour.stop.hex) : undefined;
        setTourWords(tourCaption(tour.stop, aircraft), tour.elapsed);
        if (tour.elapsed >= TOUR_DWELL_S * 1000) tourAdvance();
        return;
      }
      if (!tourAdvance()) return;
    }
  }

  /** The Tour on or off. On: Orbit goes on with it (the tour is its camera), and the first stop is taken at once. Off: the camera stays where it is and Orbit goes on turning. */
  function setTour(on) {
    if (on === tourOn) return;
    if (!on) {
      endTour();
      requestRender();
      return;
    }
    setOrbit(true); // before tourOn is set, so it is not read as the tour ending
    tourOn = true;
    tour = null;
    tourButton.setAttribute('aria-pressed', 'true');
    tourTick(0, reducedMotion());
    requestRender();
  }

  /** Ends the tour (no camera change); safe when it is off. */
  function endTour() {
    if (!tourOn) return;
    tourOn = false;
    tour = null;
    tourHex = null;
    tourButton.setAttribute('aria-pressed', 'false');
    tourCaptionEl.hidden = true;
    hint.hidden = false;
    requestRender();
  }

  // ---- Full screen (Dad, 7 Oct) ----------------------------------------------------------------------------
  // Full screen is the whole SOF picture's (fullscreen.js, shared with the 2D map's button): the map area with the airfield column and the timeline strip.
  // This view only shows the button's words and draws again at the new size; hiding the view leaves full screen as it is.
  const isFull = () => fullScreen?.isFull() === true;

  /** The button's words follow the state, and the picture is drawn again at its new size. */
  function syncFull() {
    const on = isFull();
    setText(fullButton, on ? 'Exit full screen' : 'Full screen');
    fullButton.title = on ? 'Back to the page. Escape does the same.' : 'Fill the whole window with the 3D view, the airfield column and the timeline strip. Escape or Exit full screen brings the page back.';
    requestRender(); // the resize observer would also catch the new size; this makes sure
  }
  let stopFullSync = null;

  // ---- Building and tearing down the view -------------------------------------------------------------
  function build() {
    const canvas = win.document.createElement('canvas');
    canvas.className = 'sof-3d-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D view of the weather round home. Drag or press the arrow keys to turn it; right-drag, Shift-drag, drag with two fingers or press Shift and an arrow key to move across the map; scroll or press plus and minus to zoom, Home to start again. Each airfield pin is a button that shows its result. Press ] and [ to step through the aircraft.');
    element.prepend(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (err) {
      canvas.remove();
      throw err;
    }
    renderer.setClearColor(BACKGROUND);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);

    // The ground in two tiers: the whole square, and a sharp patch round home (ground3d.js); a tile arriving asks for the ground to be painted again.
    const ground = createGround3d({
      T: THREE,
      timers,
      doc: win.document,
      onChange: () => {
        groundDirty = true;
        requestRender();
      },
    });
    scene.add(ground.group);
    // The real terrain's heights (terrain3d.js): the ground meshes and everything that stands on the ground read them. A tile arriving asks for a picture; syncTerrain throttles the rest.
    const terrain = createTerrain3d({ timers, doc: win.document, onChange: () => requestRender() });
    // The aircraft are lit models (the ground and the weather layers are not): a bright sky-and-ground light and a sun from the south-west,
    // stronger than the Debrief's, because these small aircraft must read against a dark ground. Estimates for readability, SOF-39.
    const sun = new THREE.DirectionalLight('#fff3dd', 2.6);
    sun.position.set(-0.5, -0.7, 1).normalize().multiplyScalar(1000);
    scene.add(new THREE.HemisphereLight('#e4eeff', '#8296a8', 2.4), sun, sun.target);

    let resizer = null;
    if (win.ResizeObserver) {
      resizer = new win.ResizeObserver(() => requestRender());
      resizer.observe(element);
    }
    for (const [type, fn] of hands) canvas.addEventListener(type, fn);
    element.addEventListener('wheel', onWheel, { passive: false });
    labels.addEventListener('keydown', onLabelKey);
    stopFullSync = fullScreen?.subscribe(syncFull) ?? null;
    const traffic = createTraffic3d(THREE, { scene, labels, onHover: setHover, onPick: (hex) => selectAircraft(selectedAc === hex ? null : hex) });
    const weather = createWeather3dLayers({ T: THREE, scene, timers, win, labels, requestRender, reducedMotion });
    weather.setToggles(toggles);
    gl = { THREE, canvas, renderer, scene, camera, ground, terrain, resizer, objects: null, traffic, weather, palette: paletteFor(canvas) };
    sceneDirty = true;
    weatherDirty = true;
    weatherSig = null;
    trafficDirty = true;
    groundDirty = true;
    modelDirty = true;
    spaceSig = '';
    townsSig = '';
    townHover = null;
    tilesFailed = false;
    noTiles = false;
    reliefSig = '';
    terrainWordsSig = '';
    terrainSeen = -1; // the first frame builds everything for the terrain as it is
    terrainRev = 0;
    terrainDepsOn = terrainOn;
    terrainDepsWaiting = false;
    terrainDepsDue = false;
    terrainAppliedAt = -Infinity;
    terrainDepsAt = -Infinity;
    creditTerrain = false;
    updateCredit();
    syncFull(); // the button's words for a fresh start
    syncGlide();
    if (orbitOn) { // Orbit was pressed while three.js was still loading
      orbitOn = false;
      setOrbit(true);
    }
  }

  function teardown({ lost = false } = {}) {
    setOrbit(false); // no loop outlives the view
    stopGlide?.();
    stopGlide = null;
    clearSpaceMove();
    pending?.();
    pending = null;
    pointers.clear();
    drag = null;
    pinch = null;
    if (!gl) return;
    const { canvas, renderer, scene, ground, resizer } = gl;
    terrainTimer?.();
    terrainTimer = null;
    terrainDepsTimer?.();
    terrainDepsTimer = null;
    gl.terrain.dispose();
    gl.weather.dispose();
    freeModel();
    freeSpace();
    freeAlerts();
    freeApproaches();
    freeTowns();
    freeObjects();
    gl.traffic.dispose();
    for (const [type, fn] of hands) canvas.removeEventListener(type, fn);
    element.removeEventListener('wheel', onWheel);
    labels.removeEventListener('keydown', onLabelKey);
    stopFullSync?.();
    stopFullSync = null;
    resizer?.disconnect();
    ground.dispose();
    scene.clear();
    renderer.dispose();
    if (!lost) renderer.forceContextLoss?.();
    canvas.remove();
    gl = null;
    airspaceAsked = null; // the next showing asks again (a file that failed is tried again)
    apprAsked = null;
    apprSig = '';
    corridorSig = '';
    if (corridorResults.size) {
      corridorResults = new Map();
      onCorridors(corridorResults); // the cards' corridor line goes with the view
    }
    tilesFailed = false;
    noTiles = false;
    terrainPartly = false;
    creditTerrain = false;
    creditDetail = false;
    creditAnchors = false;
    lastWx = null;
    updateCredit();
    tag.hidden = true;
    acTag.hidden = true;
    selected = null;
    selectedAc = null;
    hoverHex = null;
    showNote();
  }

  const api = {
    element,
    isShown: () => wanted,
    /**
     * Shows the view, loading three.js the first time. 'gl': this browser cannot draw WebGL2. 'load': three.js would not load
     * (offline). 'closed': hidden or closed again while it was loading.
     */
    async show() {
      if (disposed) return { ok: false, reason: 'closed' };
      if (gl) return { ok: true };
      if (!webglSupported({ document: win.document })) return { ok: false, reason: 'gl' };
      if (loading) return { ok: true };
      wanted = true;
      loading = true;
      element.hidden = false;
      loadingNote = true;
      showNote();
      try {
        THREE = await loadThree();
      } catch {
        loading = false;
        loadingNote = false;
        wanted = false;
        element.hidden = true;
        showNote();
        return { ok: false, reason: 'load' };
      }
      loading = false;
      loadingNote = false;
      if (!wanted || disposed) {
        showNote();
        return { ok: false, reason: 'closed' };
      }
      try {
        build();
      } catch {
        wanted = false;
        element.hidden = true;
        showNote();
        return { ok: false, reason: 'gl' };
      }
      showNote();
      if (selected) select(selected);
      requestRender();
      return { ok: true };
    },
    /** Stops drawing, frees everything three.js made and takes the canvas out. Safe to call twice. */
    hide() {
      wanted = false;
      teardown();
      element.hidden = true;
    },
    /**
     * The airfields, the height scale, the cloud style and the Rain to ground choice to show ({ airfields: scene3d-model.js `sceneAirfields`, heightScale,
     * cloudStyle: 'slabs' | 'levels', rainToGround: boolean }). Drawn again only when they differ.
     */
    setScene({ airfields: next = [], heightScale = scale, cloudStyle: style = cloudStyle, rainToGround = toggles.rain, approaches = null } = {}) {
      if (typeof rainToGround === 'boolean' && rainToGround !== toggles.rain) setToggle('rain', rainToGround, { save: false }); // the stored choice
      if (approaches && typeof approaches.on === 'boolean') setApproaches(approaches.on, approaches.field, { save: false }); // the stored choice
      if (style !== cloudStyle && (style === 'slabs' || style === 'levels')) {
        cloudStyle = style;
        applyModel(); // the model layers are built again in the other style
      }
      const sig = `${heightScale}|${sceneSignature(next)}`;
      airfields = next;
      const far = next.filter((a) => a.outside).map((a) => a.icao);
      outside.hidden = far.length === 0;
      setText(outside, far.length ? `Not shown, outside this ${AREA_NM} NM square: ${far.join(', ')}` : '');
      if (heightScale !== scale) {
        scale = heightScale;
        setCorner();
      }
      if (sig === sceneSig) return;
      sceneSig = sig;
      sceneDirty = true;
      applyModel(); // the ground's height or the scale may have changed: the model layers stand on the same ground
      if (selected) {
        const field = next.find((a) => a.icao === selected && !a.outside);
        if (field) setText(tag, `${field.icao}: ${field.result?.words ?? field.lines.join(', ')}`);
        else select(null);
      }
      requestRender();
    },
    /**
     * What the model feed says now (model-clouds.js `createModelFeed().view()`, with the clock and home's time zone): { status: 'ok' | 'loading' |
     * 'unavailable', model, lastGoodAt, failedAt, incomplete, now, timeZone }. The layers are built again only when the answer, the hour, the scale or the ground
     * changed. With no usable answer they are taken away and the view says why.
     */
    setModel({ status = 'loading', model = null, lastGoodAt = null, failedAt = null, incomplete = false, limited = false, refining = false, nextAt = null, noSource = false, now = new Date(), timeZone = null } = {}) {
      modelState = { status, model, lastGoodAt, failedAt, incomplete, limited, refining, nextAt, noSource, now, timeZone };
      applyModel();
    },
    /**
     * The live aircraft (scene3d-model.js `sceneTraffic`): { shown, statusText, aircraft, labelsOn, trailsOn, signature }. The aircraft are drawn again
     * only when the signature differs; the words and the credit follow at once. With the layer off (`shown` false) none are drawn, and with the
     * relay failing the 2D layer's own fade has already taken them away.
     */
    setTraffic(next = { shown: false, aircraft: [], labelsOn: false, trailsOn: false, signature: 'off' }) {
      trafficState = next;
      trafficStatus.hidden = !next.shown;
      setText(trafficStatus, next.shown ? next.statusText : '');
      trafficStatus.classList.toggle('is-bad', next.shown && next.status === 'unavailable');
      creditAircraft = next.shown === true;
      updateCredit();
      trailsButton.hidden = !next.shown;
      trailsButton.setAttribute('aria-pressed', String(next.trailsOn === true));
      syncGlide();
      if (next.signature === trafficSig) return;
      trafficSig = next.signature;
      trafficDirty = true;
      requestRender();
    },
    /**
     * The airspace log (airspace-log.js `view()`): the panel is drawn from it (only when it changed), and the aircraft in it that are not T-6s inside a
     * watched area keep an amber tag with ⚠ (words, not colour alone). Called when a new traffic answer arrives, never each frame.
     */
    setAirspaceLog(view) {
      logView.render(view);
      const sig = [...view.hexes].map(([hex, ids]) => `${hex}:${ids}`).sort().join(',');
      if (sig === intruderSig) return;
      intruderSig = sig;
      intruderHexes = view.hexes;
      trafficDirty = true;
      requestRender();
    },
    /**
     * The SIGMETs, AIRMETs and PIREPs to draw (alerts.js `alerts3dView`, worked out by the map for home's elevation): { status, words, alerts, signature }.
     * They are built again only when the signature differs; with no fresh answer there are none, and the panel says why.
     */
    setAlerts(next = { status: 'unset', words: '', alerts: [], notDrawn: 0, signature: 'unset' }) {
      alertsView = next;
      alertsStatus.hidden = next.status !== 'unavailable' || !spaceToggles.alerts; // no relay address: the key says so, without a warning line
      setText(alertsStatus, next.status === 'unavailable' ? next.words : '');
      const button = spaceButtons.get('alerts');
      if (button) button.title = `${SPACE_TOGGLES.find((t) => t[0] === 'alerts')[2]} ${next.words}`.trim();
      if (gl) drawAlertsKey();
      if (gl && `${spaceSig}|${next.signature}` !== alertsSig) requestRender();
    },
    /** The approaches file may have arrived (the map loads it for the cards too): drawn again if the Approaches are on. */
    refreshApproaches() {
      if (gl && wanted && apprOn) requestRender();
    },
    /** The 2D map's pictures or their fading may have changed: the ground is painted again if they did. */
    touch() {
      if (!gl || !wanted) return;
      let changed = false;
      if (getPictures().sig !== picturesSig) {
        groundDirty = true;
        changed = true;
      }
      if (getWeather().sig !== weatherSig) changed = true; // render() sees it and builds the layers again
      if (changed) requestRender();
    },
    /**
     * The "3D area" setting changed (scene3d-model.js `setAreaNm` has already set the square's size): everything sized from the square (ground, terrain, model layers,
     * weather layers, airspace, towns, airports, alerts) is built again, and the point looked at is kept inside the new square. The map gives new pictures and asks for
     * the model again over the new square.
     */
    setArea() {
      cam = clampLookAt(cam);
      if (!gl) return;
      const orbiting = orbitOn;
      teardown();
      build();
      if (orbiting) setOrbit(true);
      requestRender();
    },
    /** Back to the start view: from the south-east, 45 degrees down, the whole square in view. */
    home() {
      setOrbit(false); // the bar's Home button: the SOF takes the camera, as the Home key does
      cam = homeCamera();
      requestRender();
    },
    zoomBy(factor) {
      setOrbit(false);
      cam = zoomCamera(cam, factor, 1);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wanted = false;
      teardown();
      element.remove();
    },
  };
  return api;
}
