// The SOF's 3D view of the weather (SPEC-sof, "3D view", SOF-39, phase 1): the map area swapped for a three.js picture of
// the 450 NM square round home (Dad, 7 Oct; it was 250). The satellite picture is the ground (two tiers, ground3d.js: the whole square at a modest zoom with a sharp patch
// round home), with the radar and lightning pictures laid on it; home and the alternates stand on it as pins with their category in words; the METAR cloud layers hang over them as flat
// round decks at their reported bases; the 25 and 50 NM rings run round home. Phase 2 (SOF-39) adds the model layers: a cloud-cover
// sheet at each model level (see-through, smooth, stacked from the surface up, like ForeFlight's cloud maps), wind barbs at three levels
// and the freezing level, from Open-Meteo's GEM forecast, with a time slider, a toggle for each and a Layer picker for one level at a time.
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
// Weather that looks right in 3D (Dad, 7 Oct): radar shafts up to the model cloud base, lightning bolts, a faint satellite cloud sheet, surface fronts with H and L marks, and a
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
// World frame (ui-kit three-aircraft.js): X east, Y north, Z up, in the map's local feet. A height is feet above sea level times
// the height scale (the "3D height scale" setting); the ground is the home field's elevation.
import { h } from '../../ui-kit/dom.js';
import { loadThree, webglSupported, matchProjection, worldToScreen } from '../../ui-kit/three-aircraft.js';
import { ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { RING_NM, FT_PER_NM } from './map-view.js';
import { createGround3d, MAX_GROUND_TILES, INNER_NM } from './ground3d.js';
import { createWeather3dLayers, weatherKeyWords } from './weather3d-layers.js';
import { FRONTS_CREDIT } from './fronts.js';
import {
  AREA_NM, AREA_FT, DECK_FT, CATEGORY_TOKENS, START_CAMERA, ZOOM_STEP, KEY_ORBIT_PX, ORBIT_DEG_PER_PX, fitZoom, orbitBy, zoomCamera, sceneSignature, formatFeet,
} from './scene3d-model.js';
import { createAirspaceLogView } from './airspace-log-view.js';
import { buildModelLayers, MODEL_GROUPS } from './model-layers3d.js';
import { createTraffic3d } from './traffic3d.js';
import { AIRSPACE } from './airspace-data.js';
import { buildAirspace, AIRSPACE_GROUPS, KIND_COLOURS } from './airspace3d.js';
import { buildAirports, RUNWAY_MIN_PX } from './airports3d.js';
import { GLIDE_3D_MS, TRAIL_WINDOW_S } from './traffic-motion.js';
import { AIRPORTS } from './airports-data.js';
import { checkedAirspace, KIND_WORDS, tacnavNote, AIRSPACE_FILL_OPACITY, VIEW_TOP_FT } from './airspace-model.js';
import {
  hourIndex, maxAhead, hourWords, meanLayerCover, unavailableWords, refreshFailedWords, LOADING_WORDS, CREDIT_WORDS, MAX_AHEAD_HOURS, CLOUD_STAGES_FT_AGL,
  CLOUD_COVER_THRESHOLD_PCT, MAG_VARIATION_DEG_E, barbStep,
} from './model-clouds.js';

const BACKGROUND = '#0a141d';
/** The depth range the camera is given after `matchProjection` (feet along the view): wide enough for the 450 NM square at any tilt, with its tallest layers. */
const CAMERA_NEAR_FT = -3_500_000;
const CAMERA_FAR_FT = 5_500_000;
/** The model credit: Open-Meteo and whichever model answered (the finer HRDPS, or the global GEM). */
const creditWords3d = (model) => `Model clouds and winds: Open-Meteo, ${model?.sourceName ?? 'ECCC GEM'} (model estimate)`;
/** A pin's line and head are this many screen pixels tall and wide at any zoom (they are scaled with the camera). */
const PIN_PX = Object.freeze({ line: 34, head: 5 });
/** Lines lie this far (scene feet) above what they follow, so the ground never hides them. */
const LIFT_FT = 400;
const WHEEL_ZOOM = 0.0015; // per wheel pixel, as the 2D map
const CLICK_PX = 4; // a press that moves less than this is a click, not a drag
const RING_SEGMENTS = 128;
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
/** The aircraft's credit, always said while the layer is on (adsb.lol's data is ODbL 1.0). */
const AIRCRAFT_CREDIT = 'Aircraft: adsb.lol (ODbL 1.0)';

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
 * context was lost: the caller goes back to 2D), routes (the TACNAV routes to draw, from the Debrief's `ROUTES` as `map.js` gives them:
 * { name, paths: [[[lon, lat], ...]] }), airspace (the entries to draw, airspace-data.js `AIRSPACE` unless a test gives its own), onAirspaceLogOptions
 * ({ showT6, showAll }: the log panel's two ticks changed), now() (the clock in milliseconds, for gliding the aircraft between answers), onTrails(on)
 * (the Trails button was pressed), win }.
 * Returns { element, show(), hide(), setScene({ airfields, heightScale }), setModel({ status, model, lastGoodAt, now, timeZone }), setAirspaceLog(view),
 * touch(), home(), zoomBy(factor), isShown(), dispose() }.
 * `show()` resolves { ok: true } or { ok: false, reason: 'gl' | 'load' | 'closed' }.
 */
export function createSofView3d({ timers, getProjection, getPictures, getWeather = () => ({ sig: 'none', radar: null, lightning: null, satellite: null, fronts: null, lines: [] }), fullScreen = null, onLost = () => {}, routes = [], airspace = AIRSPACE, onAirspaceLogOptions = /** @type {(options: { showT6: boolean, showAll: boolean }) => void} */ (() => {}), now = () => Date.now(), onTrails = /** @type {(on: boolean) => void} */ (() => {}), win = globalThis }) {
  const labels = h('div', { class: 'sof-3d-labels' });
  // The airspace volume under the pointer: its name and limits float beside the pointer (Dad, 7 Oct); nothing is written on the volumes themselves.
  const spaceTip = h('p', { class: 'sof-3d-space-tip', hidden: true });
  labels.append(spaceTip);
  const corner = h('p', { class: 'sof-3d-corner' });
  const credit = h('p', { class: 'sof-3d-credit' }, ESRI_IMAGERY.credit);
  // The credit line: the imagery's, then the aircraft's while they are drawn and the fronts' while they are (Dad, 7 Oct: "Fronts (WPC, whole-degree positions)").
  let creditAircraft = false;
  let creditFronts = false;
  const updateCredit = () => setText(credit, [ESRI_IMAGERY.credit, creditAircraft ? AIRCRAFT_CREDIT : null, creditFronts ? FRONTS_CREDIT : null].filter(Boolean).join('. '));
  const outside = h('p', { class: 'sof-3d-outside', hidden: true });
  const note = h('p', { class: 'sof-3d-note', role: 'status', hidden: true });
  const tag = h('p', { class: 'sof-3d-tag', role: 'status', hidden: true });

  // The model controls (phase 2): a toggle for each layer, the time slider, the key and the credit, in a stack with the ground's credit.
  const TOGGLES = /** @type {[string, string, string][]} */ ([
    ['low', 'Low', `Low cloud: model cloud sheets below ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft above the ground`],
    ['mid', 'Mid', `Mid cloud: model cloud sheets ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} to ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft above the ground`],
    ['high', 'High', `High cloud: model cloud sheets above ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft above the ground`],
    ['winds', 'Barbs', 'Winds aloft at 850, 700 and 500 hPa, as small barbs (off to begin with: the Wind flow shows the winds gently)'],
    ['freezing', 'Freezing level', 'The 0 °C level, a faint sheet across the area'],
    ['flow', 'Wind flow', 'Faint streaks drifting with the model wind at 850, 700 and 500 hPa, like Windy: they move only while this view is shown (they step every 2 seconds with reduced motion)'],
    ['satellite', 'Satellite', 'ECCC GOES-West cloud picture as a faint sheet at the highest model cloud level'],
    ['radar', 'Radar', 'Radar as see-through shafts from the ground up to the model cloud base (the radar picture on the ground has its own switch in the map’s Layers menu)'],
    ['lightning', 'Lightning', 'Lightning cells as thin bolts from the ground to the model cloud top'],
    ['fronts', 'Fronts', `${FRONTS_CREDIT}: surface fronts on the ground with a faint wall, and the H and L pressure centres`],
  ]);
  const toggles = { ...Object.fromEntries(MODEL_GROUPS.map((key) => [key, true])), winds: false, flow: true, satellite: true, radar: true, lightning: true, fronts: true }; // all on to begin with but the barbs
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
  const WEATHER_BUTTONS = ['flow', 'satellite', 'radar', 'lightning', 'fronts'];
  const sliderId = `sof-3d-time-${nextViewId++}`;
  const slider = h('input', {
    type: 'range', id: sliderId, class: 'sof-3d-slider', min: '0', max: String(MAX_AHEAD_HOURS), step: '1', 'aria-label': 'Model time, hours ahead of now',
    value: '0', oninput: () => setAhead(Number(slider.value)),
  });
  const sliderWords = h('output', { class: 'sof-3d-model-time', for: sliderId });
  const layerId = `sof-3d-layer-${nextViewId++}`;
  const layerSelect = h('select', { id: layerId, class: 'sof-3d-layer', title: 'Show one model cloud level at a time, or all of them', onchange: () => setLayer(layerSelect.value) },
    h('option', { value: 'all' }, 'All'));
  const modelStatus = h('p', { class: 'sof-3d-model-status', role: 'status' }, LOADING_WORDS);
  const modelWarn = h('p', { class: 'sof-3d-model-warn', role: 'status', hidden: true });
  const modelControls = h('div', { class: 'sof-3d-model-controls' },
    h('div', { class: 'sof-3d-model-row', role: 'group', 'aria-label': 'Model layers' }, MODEL_BUTTONS.map((k) => toggleButtons.get(k).button)),
    h('div', { class: 'sof-3d-model-row' }, h('label', { for: sliderId }, 'Model time'), slider, sliderWords),
    h('div', { class: 'sof-3d-model-row' }, h('label', { for: layerId }, 'Layer'), layerSelect));
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
  const modelPanel = h('div', { class: 'sof-3d-model', role: 'group', 'aria-label': 'Model clouds and winds' }, modelStatus, modelWarn, modelControls, modelFoot, modelCredit);
  const trafficStatus = h('p', { class: 'sof-3d-traffic-status', role: 'status', hidden: true });

  // The airspace controls (phase 3): a toggle for the volumes and one for the TACNAV routes, and a key. With no airspace data the first
  // toggle says so and cannot be pressed; with no routes the second does.
  const noAirspace = airspace.length === 0;
  const noRoutes = routes.length === 0;
  const SPACE_TOGGLES = /** @type {[string, string, string, string | null][]} */ ([
    ['airspace', noAirspace ? 'Airspace (no data yet)' : 'Airspace', 'Airspace volumes round home, each from its floor to its ceiling, see-through', noAirspace ? 'No airspace data yet: its floors, ceilings and outlines are added once each has a source' : null],
    ['tacnav', 'TACNAV', 'The TACNAV routes, as lines 500 ft above the ground (ground taken as flat, an estimate)', noRoutes ? 'No TACNAV routes to draw' : null],
    ['airports', 'Airports', `The runways of ${AIRPORTS.map((a) => a.icao).join(', ')} at their true places and sizes, with schematic buildings`, null],
  ]);
  const spaceToggles = { airspace: !noAirspace, tacnav: !noRoutes, airports: true };
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
  const spacePanel = h('div', { class: 'sof-3d-model sof-3d-space', role: 'group', 'aria-label': 'Airspace and TACNAV routes' },
    h('div', { class: 'sof-3d-model-row' }, [...spaceButtons.values()], spaceKey));
  const bottom = h('div', { class: 'sof-3d-bottom' }, trafficStatus, modelPanel, weatherPanel, spacePanel, credit);
  const acTag = h('p', { class: 'sof-3d-tag sof-3d-actag-facts', role: 'status', hidden: true });
  const logView = createAirspaceLogView({ onOptions: (options) => onAirspaceLogOptions(options) });

  // Orbit and Full screen sit in the top right, beside "Heights ×5" (Dad, 7 Oct). Orbit is an on/off button (aria-pressed); Full screen's words change
  // instead, so it has no aria-pressed.
  const orbitButton = h('button', {
    type: 'button',
    class: 'sof-3d-toggle sof-3d-orbit',
    'aria-pressed': 'false',
    title: `Turn the camera slowly round home, one turn in about ${ORBIT_SECONDS_PER_TURN / 60} minutes, at the zoom and tilt you have. A drag, the wheel, an arrow key or Home stops it.`,
    onclick: () => setOrbit(orbitButton.getAttribute('aria-pressed') !== 'true'),
  }, 'Orbit');
  const fullButton = h('button', { type: 'button', class: 'sof-3d-toggle sof-3d-fullscreen', hidden: !fullScreen, onclick: () => fullScreen?.toggle() }, 'Full screen');
  const tools = h('div', { class: 'sof-3d-tools' }, orbitButton, fullButton, corner);
  const element = h('div', { class: 'sof-3d', hidden: true }, labels, tools, outside, bottom, logView.element, note, tag, acTag);

  let airfields = [];
  let scale = 5;
  let sceneSig = '';
  let sceneDirty = true;
  let groundDirty = true;
  let picturesSig = null;
  let weatherSig = null; // the weather layers' inputs as last built
  let weatherDirty = true;
  let cam = { ...START_CAMERA, zoom: 1 }; // zoom is relative to the fitting zoom: 1 shows the whole square
  let THREE = null;
  let gl = null; // everything three.js made, while the view is shown
  let wanted = false;
  let loading = false;
  let disposed = false;
  let pending = null;
  let selected = null;
  let tilesFailed = false;
  let noTiles = false; // a tile the browser would not let three.js read: the ground is drawn plain instead
  let loadingNote = false;
  let modelState = { status: 'loading', model: null, lastGoodAt: null, failedAt: null, incomplete: false, refining: false, now: new Date(0), timeZone: null }; // what the map last gave setModel
  let ahead = 0; // the slider: hours past now
  let modelSig = '';
  let modelDirty = true;
  let layerChoice = 'all'; // the Layer picker: 'all', or a pressure level as text ('850')
  let trafficState = { shown: false, aircraft: [], labelsOn: false, trailsOn: false, signature: 'off' }; // what the map last gave setTraffic
  let trafficSig = '';
  let trafficDirty = true;
  let spaceSig = ''; // what the airspace objects were built for: the height scale, the ground and home
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
  const sizes = new WeakMap(); // each label's size, read once (a read of the page's layout each frame would slow the drag)

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const showNote = () => {
    const parts = [];
    if (loadingNote) parts.push('Loading the 3D view…');
    if (tilesFailed || noTiles) parts.push('Satellite ground unavailable: plain ground shown.');
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

    // Rings: dashed lines on the ground, round home.
    for (const nm of RING_NM) {
      const pts = [];
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(a) * nm * FT_PER_NM, Math.sin(a) * nm * FT_PER_NM, planeZ + LIFT_FT));
      }
      const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: RING_COLOUR, dashSize: 14_000, gapSize: 9_000 }));
      line.computeLineDistances();
      root.add(line);
      const el = h('span', { class: 'sof-3d-ring-label' }, `${nm} NM`);
      labels.append(el);
      rings.push({ el, point: { x: 0, y: nm * FT_PER_NM, z: planeZ + LIFT_FT } });
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
      pin.position.set(field.x, field.y, planeZ);
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
      pins.push({ field, pin, button, point: { x: field.x, y: field.y } });

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
          new T.BufferGeometry().setFromPoints([new T.Vector3(field.x, field.y, planeZ), new T.Vector3(field.x, field.y, top)]),
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

  function setToggle(key, on) {
    toggles[key] = on;
    toggleButtons.get(key)?.button.setAttribute('aria-pressed', String(on));
    applyToggles();
    requestRender();
  }

  function applyToggles() {
    const groups = gl?.model?.built.root.userData.groups;
    if (groups) for (const key of MODEL_GROUPS) groups[key].visible = toggles[key];
    gl?.weather?.setToggles(toggles);
    for (const [key, { button, title }] of toggleButtons) {
      const sheets = gl?.model?.counts?.[key]; // only the three cloud stages have a count of sheets
      button.title = sheets === undefined ? title : `${title}. ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} with cloud this hour.`;
    }
  }

  /** The Layer picker: all the cloud levels, or only one (the Low, Mid and High buttons still apply to what is shown). */
  function setLayer(value) {
    layerChoice = value;
    if (layerSelect.value !== value) layerSelect.value = value;
    gl?.model?.built.showLayer(value === 'all' ? null : Number(value));
    requestRender();
  }

  /** The picker's choices for this hour's sheets: "850 hPa ≈ 4,900 ft", with "no cloud" for a level the model has clear. A choice that has gone falls back to All. */
  function drawLayerPicker(sheets) {
    const options = [h('option', { value: 'all' }, 'All')];
    for (const sheet of sheets) options.push(h('option', { value: String(sheet.hPa) }, `${sheet.words}${sheet.drawn ? '' : ', no cloud'}`));
    layerSelect.replaceChildren(...options);
    if (layerChoice !== 'all' && !sheets.some((x) => String(x.hPa) === layerChoice)) layerChoice = 'all';
    layerSelect.value = layerChoice;
  }

  function setAhead(hours) {
    ahead = Math.max(0, Math.min(MAX_AHEAD_HOURS, Math.round(hours)));
    applyModel();
  }

  /** The words, the controls and whether the model layers must be built again, from what the map last gave `setModel`. */
  function applyModel() {
    const { status, model, lastGoodAt, failedAt, incomplete, now, timeZone } = modelState;
    const ok = status === 'ok' && model !== null;
    modelStatus.hidden = ok;
    modelControls.hidden = !ok;
    modelFoot.hidden = !ok;
    modelCredit.hidden = !ok;
    if (ok) setText(modelCredit, `${creditWords3d(model)}${modelState.refining ? '. The finer HRDPS model is still loading…' : ''}`);
    modelStatus.classList.toggle('is-bad', status === 'unavailable');
    // A refresh that failed while the answer held is still young enough: the layers stay and the panel says so.
    const stillShown = ok && failedAt !== null;
    modelWarn.hidden = !stillShown;
    if (stillShown) setText(modelWarn, refreshFailedWords({ failedAt, lastGoodAt, now, incomplete }));
    if (!ok) {
      setText(modelStatus, status === 'unavailable' ? unavailableWords(lastGoodAt, incomplete) : LOADING_WORDS);
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
    const hour = ok ? hourIndex(model, +now, ahead) : -1;
    const sig = ok ? `${model.id}|${hour}|${scale}|${groundFt()}` : 'none';
    if (sig === modelSig) return;
    modelSig = sig;
    modelDirty = true;
    weatherDirty = true; // the shafts, bolts, sheet and flow take their heights and winds from the model
    requestRender();
  }

  function freeModel() {
    if (!gl?.model) return;
    gl.model.built.dispose();
    for (const { el } of gl.model.items) el.remove();
    gl.model = null;
  }

  /** The model layers, built new for this answer, hour, height scale and ground (or taken away when there is no usable answer). */
  function rebuildModel() {
    freeModel();
    modelDirty = false;
    const { status, model, now } = modelState;
    if (!gl || status !== 'ok' || !model) return;
    const hour = hourIndex(model, +now, ahead);
    const built = buildModelLayers(gl.THREE, { model, hour, scale, groundFt: groundFt() });
    gl.scene.add(built.root);
    const items = built.labels.map((l) => {
      const el = h('span', { class: `sof-3d-model-label is-${l.group}` }, l.text);
      labels.append(el);
      return { el, group: l.group, point: l.point, hPa: l.hPa };
    });
    gl.model = { built, items, counts: built.summary.layers };
    drawLayerPicker(built.summary.sheets);
    built.showLayer(layerChoice === 'all' ? null : Number(layerChoice));
    applyToggles();
    drawKey(built.summary, hour);
  }

  function drawKey(summary, hour) {
    const { model } = modelState;
    const cover = meanLayerCover(model, hour);
    const pct = (v) => (v === null ? 'no data' : `${v} %`);
    keyBody.replaceChildren(
      h('p', {}, `${creditWords3d(model)}. ${model.source === 'hrdps' ? 'HRDPS is ECCC\'s 2.5 km model; the global GEM is the fallback and the quick first picture.' : 'This is the global GEM: the finer HRDPS model has not answered (it is slow, or failed).'}`),
      h('p', {}, `Clouds: one see-through sheet at each model level (${model.cloudLevels.length} levels, ${model.cloudLevels[0]} to ${model.cloudLevels.at(-1)} hPa), at the level's mean height. The model's cover at its ${model.gridSize} × ${model.gridSize} points (${Math.round(AREA_NM / (model.gridSize - 1) * 10) / 10} NM apart) is smoothed over the sheet: clear at ${CLOUD_COVER_THRESHOLD_PCT} % or less, then white to grey and more solid as cover rises, to about 85 % opaque at 100 %. A level under the ground has no sheet. Low, mid and high are by the sheet's height above the ground (below ${formatFeet(CLOUD_STAGES_FT_AGL.lowTopFt)} ft, up to ${formatFeet(CLOUD_STAGES_FT_AGL.midTopFt)} ft, above). The Layer picker shows one level at a time. The model's own mean cover this hour: low ${pct(cover.low)}, mid ${pct(cover.mid)}, high ${pct(cover.high)}.`),
      h('ul', {}, summary.sheets.map((x) => h('li', {}, `${x.words}: ${x.drawn ? `cover up to ${Math.round(x.maxCover)} %, mean ${Math.round(x.meanCover)} %` : 'no cloud'}`))),
      h('p', {}, `Winds: barbs (behind the Barbs button, off to begin with) at 850, 700 and 500 hPa at every ${barbStep(model.gridSize)}${barbStep(model.gridSize) === 2 ? 'nd' : 'rd'} grid point (${Math.round(model.gridSize > 1 ? (AREA_NM / (model.gridSize - 1)) * barbStep(model.gridSize) : 0)} NM apart): pennant 50 kt, full feather 10, half 5. Direction in °M (${MAG_VARIATION_DEG_E}° E variation), speed in kt.`),
      h('ul', {}, summary.windsOverHome.map((words) => h('li', {}, `Over home, ${words}`))),
      h('p', {}, `${summary.freezingText ? `${summary.freezingText}: the mean over the grid for the hour shown` : 'Freezing level: the model has none for this hour'}. Heights are feet above sea level, ×${scale}.`),
    );
  }

  // ---- The weather layers: radar shafts, bolts, satellite sheet, fronts, wind flow (Dad, 7 Oct) ----------------
  /** The weather layers, made again where what they are built from changed (weather3d-layers.js keeps each until then), with the status words, the key and the credit. */
  function rebuildWeather(wx) {
    weatherSig = wx.sig;
    weatherDirty = false;
    if (!gl?.weather) return;
    const { status, model, now } = modelState;
    const ok = status === 'ok' && model !== null;
    gl.weather.update({ weather: wx, model: ok ? model : null, hour: ok ? hourIndex(model, +now, ahead) : 0, scale, groundFt: groundFt(), projection: getProjection() });
    const lines = (wx.lines ?? []).map((l) => `${l.tone}|${l.text} ${l.symbol}`);
    const statusSig = lines.join('\n');
    if (statusSig !== weatherStatus.dataset.sig) {
      weatherStatus.dataset.sig = statusSig;
      weatherStatus.replaceChildren(...(wx.lines ?? []).map((l) => h('li', { class: `sof-3d-wx-line is-${l.tone}` }, `${l.text} `, h('span', { 'aria-hidden': 'true' }, l.symbol))));
    }
    weatherKeyBody.replaceChildren(
      h('p', {}, `Ground: Esri satellite imagery in two tiers: the whole ${AREA_NM} NM square at a modest zoom, and a sharper patch about ${INNER_NM} NM square round home on top of it (at most ${MAX_GROUND_TILES} tiles, loaded as they arrive).`),
      ...weatherKeyWords(gl.weather.summary(), scale).map((t) => h('p', {}, t)),
      h('p', {}, 'A picture for situational awareness: heights marked as estimates are not measurements, and nothing here raises or clears a caution.'),
    );
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
    applySpaceToggles();
    requestRender();
  }

  function applySpaceToggles() {
    const groups = gl?.space?.built.root.userData.groups;
    if (groups) for (const key of AIRSPACE_GROUPS) groups[key].visible = spaceToggles[key];
    if (gl?.space?.airports) gl.space.airports.root.visible = spaceToggles.airports;
    if (!spaceToggles.airspace) setSpaceHit(null);
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

  /** Which volume is under the pointer: the nearest to the camera along the ray through it (ray-cast on the fills, not every frame). */
  function pickSpace(x, y) {
    spaceLast = win.performance.now();
    const picks = gl?.space?.built.picks ?? [];
    if (!picks.length || !spaceToggles.airspace || hoverHex) return setSpaceHit(null);
    const width = gl.canvas.clientWidth;
    const height = gl.canvas.clientHeight;
    if (width < 2 || height < 2) return setSpaceHit(null);
    gl.raycaster ??= new THREE.Raycaster();
    gl.camera.updateMatrixWorld();
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
    for (const { el } of gl.space.items) el.remove();
    gl.space = null;
    setSpaceHit(null);
  }

  /** The airspace volumes and routes, built new for this height scale, ground and home (only then), with the key's words. */
  function rebuildSpace(sig) {
    freeSpace();
    spaceSig = sig;
    const projection = getProjection();
    const ground = groundFt();
    const { volumes, skipped } = checkedAirspace(airspace, ground);
    const built = buildAirspace(gl.THREE, { volumes, routes, toXY: projection.toXY, scale, groundFt: ground });
    gl.scene.add(built.root);
    const items = built.labels.map((label) => { // only the TACNAV routes' names stand in the picture; a volume's words come with the pointer
      const el = h('span', { class: 'sof-3d-route-label', title: label.title });
      el.textContent = label.text;
      labels.append(el);
      return { el, label };
    });
    const airports = buildAirports(gl.THREE, { toXY: projection.toXY, scale, groundFt: ground, doc: win.document });
    gl.scene.add(airports.root);
    gl.space = { built, items, airports };
    applySpaceToggles();
    drawSpaceKey(volumes, skipped, ground);
  }

  function drawSpaceKey(volumes, skipped, ground) {
    const used = (ref) => volumes.some((v) => v.floor.ref === ref || v.ceiling.ref === ref);
    const home = homeIcao();
    const colours = Object.entries(KIND_WORDS).map(([kind, words]) => {
      const swatch = h('span', { class: 'sof-3d-swatch', 'aria-hidden': 'true' });
      swatch.style.background = KIND_COLOURS[kind];
      return h('li', {}, swatch, ` ${words.colour}: ${words.name}`);
    });
    const notes = [];
    if (noAirspace) notes.push(h('p', {}, 'Airspace: no data yet. Each volume is added with its floor, ceiling, outline and source (NAV CANADA’s Designated Airspace Handbook); none is drawn from memory.'));
    else {
      notes.push(
        h('p', {}, `Airspace: each volume runs from its floor to its ceiling, see-through (${Math.round(AIRSPACE_FILL_OPACITY * 100)} % fill, an estimate), with a thin outline on its top and bottom and along its corners. Edge colour by kind:`),
        h('ul', {}, colours),
        h('p', {}, 'Nothing is written on the volumes: put the pointer over one and its name and limits float beside it (the nearest one under the pointer when several overlap), with the kind and the source on hover. Every volume is listed here with its limits:'),
        h('ul', { class: 'sof-3d-airspace-list' }, (gl?.space?.built.picks ?? []).map((pick) => h('li', { title: pick.title }, pick.text))),
        h('p', {}, `Heights are feet above sea level, ×${scale}. SFC is the ground at ${home}’s elevation (${Math.round(ground)} ft).${used('AGL') ? ` AGL ≈ over flat prairie, estimate: ${home}’s elevation plus the height.` : ''}${used('FL') ? ' FL is read as feet above sea level (pressure altitude taken as altitude, an approximation).' : ''}${volumes.some((v) => v.ceiling.ref === 'UNL') ? ` UNL is drawn up to ${formatFeet(VIEW_TOP_FT)} ft.` : ''}`),
      );
      if (skipped.length) notes.push(h('p', { class: 'sof-3d-model-warn' }, `Not drawn, entry fails its checks: ${skipped.map((x) => `${x.id} (${x.reason})`).join('; ')}.`));
    }
    const drawn = gl?.space?.airports.summary ?? [];
    notes.push(
      h('p', {}, drawn.length
        ? `Airports: ${drawn.map((a) => `${a.icao} (${a.ends.join(', ')})`).join('; ')}. Each runway is drawn between its two thresholds at their true places, length and width (OurAirports, public domain: for drawing only, check the Canada Flight Supplement), at the field’s elevation ×${scale}. Far out, a field is drawn larger and a runway wider so it stays visible (about ${RUNWAY_MIN_PX.length} px long at least); closer in they are true size, and the stripes, centreline and numbers appear once a runway is ${RUNWAY_MIN_PX.detail} px long. The numbers read from the approach end. The terminal and hangars are schematic: buildings are schematic, drawn for orientation only.`
        : 'Airports: none inside this area.'),
      h('p', {}, noRoutes ? 'TACNAV: no routes to draw.' : tacnavNote(home)),
      h('p', {}, 'A picture for situational awareness: not a chart, not for navigation or flight planning.'),
    );
    spaceKeyBody.replaceChildren(...notes);
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
    gl.traffic.set(items, { scale, groundFt: groundFt(), intruders: intruderHexes, nowMs: +now(), trailsOn: trafficState.trailsOn === true });
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
    const wanted = (e) => e.item.isT6 || e.intruder || trafficState.labelsOn || e.hex === hoverHex || e.hex === selectedAc;
    const early = (e) => e.item.isT6 || e.intruder; // a T-6's tag and an intruder's keep their places; the others step round them
    if (phase === 't6') {
      for (const e of list) {
        const on = wanted(e);
        if (e.tagEl.hidden === on) e.tagEl.hidden = !on;
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

    if (sceneDirty) {
      freeObjects();
      gl.objects = buildObjects();
      sceneDirty = false;
      trafficDirty = true; // the ground's height or the scale may have changed: the aircraft stand on the same ground
      weatherDirty = true; // and so do the shafts, bolts and fronts
      if (selected && !airfields.some((a) => a.icao === selected && !a.outside)) select(null);
    }
    if (modelDirty) rebuildModel();
    const wx = getWeather();
    if (wx.sig !== weatherSig) weatherDirty = true;
    if (weatherDirty) rebuildWeather(wx);
    const nextSpaceSig = `${scale}|${groundFt()}|${getProjection().lat},${getProjection().lon}`;
    if (!gl.space || nextSpaceSig !== spaceSig) rebuildSpace(nextSpaceSig);
    if (trafficDirty) syncTraffic();
    if (!groundDirty && getPictures().sig !== picturesSig) groundDirty = true;
    if (groundDirty) paintGround();

    const { pins, rings, decks, planeZ } = gl.objects;
    const size = { width, height };
    const zoom = fitZoom(size) * cam.zoom;
    matchProjection(THREE, camera, { x: 0, y: 0, z: planeZ / scale }, { yawDeg: cam.yawDeg, pitchDeg: cam.pitchDeg, zoom, altScale: scale }, size);
    // The square is 450 NM across: its far corners lie further from the view's middle than the shared camera's depth range reaches (ui-kit `matchProjection` is for 250 NM and
    // less), so the range is widened here. An orthographic camera has no perspective to spoil, only depth precision (24 bits over some 8 million ft is about half a foot).
    camera.near = CAMERA_NEAR_FT;
    camera.far = CAMERA_FAR_FT;
    camera.updateProjectionMatrix();
    const ftPerPx = 1000 / zoom;
    for (const { pin } of pins) pin.scale.setScalar(ftPerPx);
    gl.traffic.fit(ftPerPx);
    gl.space?.airports.fit(ftPerPx);

    // Labels go beside their points, and a deck's label steps down past any label already there, so words never sit on words.
    const headZ = planeZ + (PIN_PX.line + PIN_PX.head) * ftPerPx;
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
    for (const { button, point } of pins) { // home first: it keeps its place and the others step down past it
      const p = at({ ...point, z: headZ });
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
    placeAircraft({ at, put, boxFor, isClear, reserve, phase: 't6' }); // the T-6s' tags keep their places; the model's words step round them
    for (const { el, label } of gl.space?.items ?? []) { // the TACNAV routes' names (the airspace volumes' words come with the pointer, not from here)
      const on = spaceToggles[label.group];
      if (el.hidden === on) el.hidden = !on;
      if (!on) continue;
      const s = boxFor(el, 0, 0);
      const p = at(label.point);
      const rows = [0, 1, -1, 2, -2, 3, -3].map((k) => k * (s.h + 2));
      const boxes = rows.flatMap((dy) => [[p.x + 6, p.y - s.h / 2 + dy], [p.x - s.w - 6, p.y - s.h / 2 + dy]]).map(([x, y]) => ({ ...s, x, y }));
      put(el, boxes.find((box) => isClear(box)) ?? boxes[0]);
    }
    const modelWords = [];
    for (const { el, group, point, hPa } of gl.model?.items ?? []) { // the model's words: each cloud level, the winds over home, then the freezing level
      const on = toggles[group] && (hPa === undefined || layerChoice === 'all' || layerChoice === String(hPa));
      if (el.hidden === on) el.hidden = !on;
      if (on) modelWords.push({ el, group, hPa, p: at(point) });
    }
    modelWords.sort((a, b) => a.p.y - b.p.y); // top of the picture first, so a label only ever steps down past the ones above it
    for (const { el, group, hPa, p } of modelWords) {
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: group === 'freezing' || hPa !== undefined ? p.x - s.w - 6 : p.x + 8, y: p.y - s.h / 2 }));
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
      const p = at({ ...chosen.point, z: headZ });
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

  // ---- The camera's hands: drag to turn, wheel or pinch to zoom, arrow keys to turn --------------------
  const pointers = new Map();
  let drag = null; // { x, y, moved } for a single pointer
  let pinch = null; // the distance between two pointers last time

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const hands = /** @type {[string, (e: any) => void][]} */ ([
    ['pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gl?.canvas.setPointerCapture?.(e.pointerId);
      clearSpaceMove(); // a press is for dragging or clicking, not for reading
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 };
      else {
        drag = null;
        pinch = spread();
      }
      gl?.canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      const held = pointers.get(e.pointerId);
      if (!held) {
        if (pointers.size === 0 && e.pointerType === 'mouse') { // hovering, not dragging
          setHover(aircraftNear(e.clientX, e.clientY));
          const rect = gl.canvas.getBoundingClientRect();
          onSpaceMove(e.clientX - rect.left, e.clientY - rect.top);
        }
        return;
      }
      held.x = e.clientX;
      held.y = e.clientY;
      if (pointers.size >= 2 && pinch) {
        setOrbit(false); // a pinch is the SOF taking the camera
        const now = spread();
        if (now > 0) cam = zoomCamera(cam, now / pinch, 1);
        pinch = now;
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.moved >= CLICK_PX) setOrbit(false); // a drag is the SOF taking the camera; a click on an aircraft is not
        cam = orbitBy(cam, dx, dy);
      }
      requestRender();
    }],
    ['pointerup', endPointer],
    ['pointercancel', endPointer],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const turn = KEY_ORBIT_PX[e.key];
      if (turn) {
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
        cam = { ...START_CAMERA, zoom: 1 };
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
      if (drag && drag.moved < CLICK_PX && e.type === 'pointerup') {
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
      drag = { x: p.x, y: p.y, moved: CLICK_PX };
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
    if (!on || !gl || !wanted || disposed) return;
    if (reducedMotion()) {
      stopOrbit = timers.every(ORBIT_STEP.ms, () => {
        orbitTurn(ORBIT_STEP.deg);
        requestRender();
      });
    } else {
      const degPerMs = 360 / (ORBIT_SECONDS_PER_TURN * 1000);
      stopOrbit = timers.frame((dt) => {
        if (!gl || !wanted) return;
        orbitTurn(Math.min(dt, ORBIT_MAX_FRAME_MS) * degPerMs);
        render();
      });
    }
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
    canvas.setAttribute('aria-label', '3D view of the weather round home. Drag or press the arrow keys to turn it, scroll or press plus and minus to zoom, Home to start again. Each airfield pin is a button that shows its result. Press ] and [ to step through the aircraft.');
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
    gl = { THREE, canvas, renderer, scene, camera, ground, resizer, objects: null, traffic, weather, palette: paletteFor(canvas) };
    sceneDirty = true;
    weatherDirty = true;
    weatherSig = null;
    trafficDirty = true;
    groundDirty = true;
    modelDirty = true;
    spaceSig = '';
    tilesFailed = false;
    noTiles = false;
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
    gl.weather.dispose();
    freeModel();
    freeSpace();
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
    tilesFailed = false;
    noTiles = false;
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
    /** The airfields and the height scale to show ({ airfields: scene3d-model.js `sceneAirfields`, heightScale }). Drawn again only when they differ. */
    setScene({ airfields: next = [], heightScale = scale } = {}) {
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
    setModel({ status = 'loading', model = null, lastGoodAt = null, failedAt = null, incomplete = false, refining = false, now = new Date(), timeZone = null } = {}) {
      modelState = { status, model, lastGoodAt, failedAt, incomplete, refining, now, timeZone };
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
    /** Back to the start view: from the south-east, 45 degrees down, the whole square in view. */
    home() {
      setOrbit(false); // the bar's Home button: the SOF takes the camera, as the Home key does
      cam = { ...START_CAMERA, zoom: 1 };
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
