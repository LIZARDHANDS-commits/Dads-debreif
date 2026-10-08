// The SOF's map (SPEC-sof, "Map"; tasks 6 and 7): a canvas map on ui-kit's canvas view, with no map
// library. Satellite (Esri, through the shared tile loader) or the VNC charts underneath; ECCC radar (with
// RainViewer as its backup), radar coverage, lightning, GOES cloud and warnings as pictures (at a US base, NOAA
// MRMS radar and NASA GIBS GOES-East satellite instead, from its site profile; plan Step 2c part C); the training
// routes; the 25 and 50 NM rings; the airfield dots with wind barbs; and live traffic through our own relay.
// The ADS-B Exchange view swaps the whole map area for their own page, and the 3D view (view3d.js, SOF-39) swaps it for a
// three.js picture of the weather round home; the two are never on together.
//
// This file wires the pieces together and touches the page. Where things are and what they say is decided
// in map-view.js, map-layers.js, map-model.js and the feeds (map-feeds.js, map-loops.js), all tested in Node.
//
// It draws only when something changes (a pan, a zoom, a new picture, a new report, a traffic reply), through
// the scheduler's frame. Every request goes through map-fetch.js (timeout, byte cap, no cookies) and ends when
// the module closes: dispose() stops every feed and timer, drops the frame and releases the pictures (R4).
import { h } from '../../ui-kit/dom.js';
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
// The VNC charts and the training routes are the debrief's, used as they are: they are to move to a shared
// place (SPEC-sof, "What the SOF needs from other pieces"), and this is the only place the SOF reaches into it.
import { createVncLayer, VNC_CHOICES, VNC_DEFAULT_ALIGN } from '../debrief/map2d/vnc.js';
import { projectRoute, drawRoute } from '../debrief/map2d/overlays.js';
import { ROUTES } from '../debrief/data/routes.js';
import { getMapUrl, rainViewerTileUrl, REFRESH_MS, feedAge, wmsServiceOf } from './feeds.js';
import { createImageFeed, createRadarFeed, feedLine } from './map-feeds.js';
import { createLightningWatch, createTrafficFeed } from './map-loops.js';
import { recolourLightning } from './map-lightning.js';
import { trafficUrl, layerModel, trafficRadiusNm } from './traffic.js';
import { trafficDisplayOf } from './settings-model.js';
import {
  createProjection, homeView, cornersOf, radarImageRequest, imageStillFits, nearestWithin, RING_NM, SPAN_LIMITS,
} from './map-view.js';
import {
  cleanLayers, setLayerOn, setLayerOpacity, setBase, setPrecip, setTrafficOption, stackOrder, baseLayers, BASE_DIM,
} from './map-layers.js';
import { airfieldMarks, mapCredits, baseNote, statusItems, nearHomeItem, legendItems, noSourceLine, coverageNotShownLine, lightningMapLink } from './map-model.js';
import { drawGeoImage, drawRings, drawAirfields, drawTraffic, drawTrails, drawApproaches2d } from './map-draw.js';
import { fieldApproaches, finalCourse2d, publishedLine } from './approaches-model.js';
import { approachesOf, loadApproachesFor } from './sites/approaches-load.js';
import { runwayInUse, fieldsForRunways, shownSignature } from './runway-in-use.js';
import { AIRPORTS } from './airports-data.js';
import { createTrails, glideLatLon, canGlide, GLIDE_2D_MS } from './traffic-motion.js';
import { createMapControls } from './map-controls.js';
import { createAdsbFrame, adsbExchangeUrl, zoomForScale } from './adsbx.js';
import { webglSupported } from '../../ui-kit/three-aircraft.js';
import { createSofView3d } from './view3d.js';
import { alerts3dView } from './alerts.js';
import { sceneAirfields, sceneTraffic, stationAnchors, AREA_FT, AREA_NM, DEFAULT_AREA_NM, setAreaNm } from './scene3d-model.js';
import { fetchReports } from '../../wx/sources.js';
import { createFrontsFeed, frontsUrl, frontsView } from './fronts.js';
import { tacnavRoutes, checkedAirspace } from './airspace-model.js';
import { createAirspaceLog } from './airspace-log.js';
import { createModelFeed, gridPoints } from './model-clouds.js';
import { siteFor, noSourceWords } from './sites/index.js';

const LAYERS_KEY = 'map-layers';
const BACKGROUND = '#05090d';
const STALE_ALPHA = 0.4; // a stale picture is drawn faint, and its line says STALE
const HOVER_PX = 14;
const MAX_REMEMBERED_REQUESTS = 12;
/**
 * The 3D view's pictures (radar, lightning, satellite) are asked for over the whole 450 NM square at about this many pixels across (the request adds a fifth), under the 2,048
 * the feeds allow. A bigger 3D area asks for the radar and lightning at more pixels in step (1,200 at 600 NM), so the radar round home is as sharp, up to PICTURE_3D_MAX_PX
 * (1,706, which with the fifth is 2,047; ECCC, NOAA NCEP and NASA GIBS all answered 2,047 x 2,048 on 8 Oct 2026, radar about 120 KB): at 900 NM that is about 1.6 pixels a NM
 * instead of 1.7, a little less sharp. The satellite picture stays at 900 at every area (at 2,047 px ECCC's GOES picture was 2.9 MB, asked every 10 minutes; it is only a
 * faint sheet), so at 900 NM it is half as sharp.
 */
const PICTURE_3D_PX = 900;
const PICTURE_3D_MAX_PX = Math.floor(2048 / 1.2);
/**
 * The HRDPS total-cloud picture (the 3D slabs' 2.5 km detail) is asked for at 512 pixels across the square (the request adds a fifth to this): about 25 KB in under half a second
 * (checked 7 Oct 2026). It stays 512 at every area: the slabs read it on their own 256 px sheet (model-clouds.js CLOUD_SHEET_PX), so asking for more would not show more. At
 * 900 NM a sheet pixel is about 6.5 km, not 3.3: the detail is coarser.
 */
const MODEL_CLOUD_PX = Math.round(512 / 1.2);
/** The radar and lightning pictures' size in pixels for the 3D area in force (from PICTURE_3D_PX at 450 NM), never over PICTURE_3D_MAX_PX. */
const areaPx = (px) => Math.min(PICTURE_3D_MAX_PX, Math.round(px * (AREA_NM / DEFAULT_AREA_NM)));
/** It is asked for again once an hour (its layer has hourly times and a new run every 6 hours), and for a new hour as soon as the slider settles. Estimate, SOF-39. */
const MODEL_CLOUD_REFRESH_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** The stations' METARs that anchor the 3D low cloud are asked for this often while the 3D view is shown (Fable review, 7 Oct; METARs come hourly, specials between). */
const ANCHOR_REFRESH_MS = 10 * 60 * 1000;
const OFFLINE_WORDS = 'Map and radar need a connection';
const NO_WEBGL_WORDS = 'The 3D view needs WebGL, which this browser does not have. The map stays.';
const NO_3D_LOAD_WORDS = 'The 3D view could not load (it needs a connection the first time). The map stays.';
const LOST_3D_WORDS = 'The 3D view lost its graphics and went back to the map.';
/** How long a notice about the 3D view stays up. */
const NOTICE_MS = 8000;

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;

/** A picture's map address: feeds.js `getMapUrl`, the one builder, sends each listed layer to its own service (ECCC GeoMet, NOAA NCEP or NASA GIBS). */
const wmsUrl = ({ layer, request, time }) => getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, time });
/** A GIBS picture with under this share of its pixels drawn is "no frame for that time yet" (GIBS answers one with an empty PNG); a GOES-East picture over a US base covers it all. An estimate. */
const MIN_FILLED_SHARE = 0.5;

/**
 * app: the module's app object (scheduler, storage, time, airfields, listen). settings: createSofSettings. view3dSettings: createView3dSettings (the 3D cloud style, area and
 * Rain to ground), or left out (slabs, 450 NM, rain on).
 * onLightning: called when the near-home lightning caution changes (so the banner can be redrawn). fullScreen: fullscreen.js's object, shared with the 3D view:
 * the map bar's Full screen button (2D) and the 3D view's own both toggle it (the whole SOF picture, with the airfield column and the timeline strip).
 * Returns { element, credits, update({ snapshot, screen, alerts }), lightning(now), wake(), dispose() }. `credits` is the line of the map's
 * credits, for the screen's Sources note (the map keeps no height for it).
 */
export function createSofMap({ app, settings, view3dSettings = null, onLightning = () => {}, fullScreen = null, onApproaches = () => {} }) {
  const timers = app.scheduler;
  const now = () => app.time.now();
  const fetchNet = (url, init) => globalThis.fetch(url, init);
  // The home field, and the SOF's own data for its base (sites/: airspace, towns, which radar, lightning and model services, the credits). Read again when home changes.
  let home = app.airfields.home();
  let site = siteFor(home.icao);
  /** The site profile's source for each map layer (radar and its coverage share one). A source that is null means this base has none: nothing is asked for and the line says so. */
  const SOURCE_OF = { radar: 'radar', coverage: 'radar', lightning: 'lightning', cloud: 'satellite', warnings: 'warnings' };
  const hasSource = (id) => site.sources[SOURCE_OF[id]] != null;
  /** Radar coverage is drawn only when the radar source has a coverage layer (ECCC's; NOAA's MRMS has none: its line says "not shown for this source"). */
  const coverageShown = () => hasSource('coverage') && Boolean(site.sources.radar.layers?.coverage);
  /** The source's words for a status line (`strip`, `short`), as feedLine takes them; nothing at Moose Jaw, whose lines read as before. */
  const sourceWords = (source) => ({ source: source?.strip ?? null, sourceShort: source?.short ?? null });

  let layers = cleanLayers(app.storage.get(LAYERS_KEY, null), { now: now() });
  let adsbOn = false;
  let threeOn = false; // the 3D view has the map area (never together with adsbOn)
  let scene3d = null; // what the 3D view was last given: { marks, cards, fields, snapshot }
  let alertsState = null; // the SIGMET/AIRMET/PIREP feed's state (alerts.js, run by the screen for the cards too), for the 3D view
  let cancelNotice = null;
  let disposed = false;
  let online = globalThis.navigator?.onLine !== false;
  let tilesFailed = false;
  let homed = false;
  let marks = [];
  let marksKey = '';
  let hits = { airfields: [], traffic: [] };
  let selectedHex = null;
  let trafficSig = '';
  const airspaceLog = createAirspaceLog({ watched: site.watchedAreas }); // who is in the watched advisory areas; reads each new traffic answer once (airspace-log.js), information only
  let logAnswer = null; // when the traffic answer the log last read arrived
  const trailMemory = createTrails(); // the last couple of minutes of each aircraft's reported positions, for the fading trails (2D and 3D)
  let trailAnswer = null; // when the traffic answer the trails last took arrived
  let intruderHexes = new Map(); // the aircraft that are not T-6s inside a watched area (the log's), whose trails are amber
  let cancelGlide2d = null; // the 2D layer's once-a-second redraw while aircraft glide
  let logVolumes = null; // { key, volumes }: the airspace checked for home's elevation
  let lastRadius = null;
  let lastRelay = null;
  let corridors = new Map(); // the 3D view's arrival corridor check, icao -> { results, summary, estimate } (information only, for the cards)
  let approachKey2d = ''; // what the 2D approaches were last drawn for
  let runways = new Map(); // each field's runway in use from its latest METAR wind (runway-in-use.js), icao -> runwayInUse; set by setRunways on each render
  let runwaysKey = '';

  // ---- Where home is ---------------------------------------------------------------------------------
  let projection = createProjection(home);
  let routes = null; // the training routes in this projection's feet, made the first time they are drawn
  const requests = new Map(); // request key → the request, so a picture is laid where it was asked for
  const asked = new Map(); // feed id → the request it holds

  // The radius asked for (Dad, 8 Oct 2026: "can we draw aircraft further out from the base"): half the 3D square, at most 250 NM, while the 3D view is open,
  // else the 2D map's 100 NM as before (traffic.js `trafficRadiusNm`); the next request after the 3D view opens or closes asks the new one.
  const relayAddress = () => trafficUrl({ baseUrl: settings.get().trafficRelay, lat: home.lat, lon: home.lon, nm: trafficRadiusNm({ threeOn, areaNm: AREA_NM }) });
  /** The Traffic display settings (SOF settings; the "view3d" document), for the 2D layer and the 3D view. */
  const trafficDisplay = () => trafficDisplayOf(view3dSettings?.get());
  let displayKey = '';
  const relayOn = () => relayAddress() !== null;

  // ---- The page --------------------------------------------------------------------------------------
  const canvas = h('canvas', { class: 'sof-map-canvas' });
  const tip = h('div', { class: 'sof-map-tip', hidden: true });
  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const message = h('p', { class: 'sof-map-message', role: 'status', hidden: true }, OFFLINE_WORDS);
  const notice = h('p', { class: 'sof-map-message sof-map-notice', role: 'status', hidden: true });
  const adsbFrame = createAdsbFrame({ timers });

  const controls = createMapControls({
    onLayer: (id, on) => change(setLayerOn(layers, id, on)),
    onOpacity: (id, pct) => change(setLayerOpacity(layers, id, pct)),
    onBase: (id) => change(setBase(layers, id)),
    onPrecip(value) {
      const before = layers.precip;
      change(setPrecip(layers, value));
      if (layers.precip !== before) radar.setPrecip();
    },
    onHome: () => {
      if (threeOn) {
        view3d.home(); // in 3D, Home is the start view: from the south-east, 45 degrees down
        live.textContent = 'The 3D view is back at its start.';
      } else goHome();
    },
    onZoom: (factor) => {
      if (threeOn) view3d.zoomBy(factor);
      else view.zoomBy(factor);
      live.textContent = factor > 1 ? 'Zoomed in.' : 'Zoomed out.'; // the buttons never press silently (a screen reader hears it)
    },
    onAdsb: (on) => setAdsb(on),
    onThree: (on) => setThree(on),
    onFullScreen: () => fullScreen?.toggle(),
    threeReason: () => (webglSupported() ? null : NO_WEBGL_WORDS),
    onTraffic: (on) => change(setLayerOn(layers, 'traffic', on)),
    onTrafficLabel: (label) => change(setTrafficOption(layers, { label })),
    onMilitaryOnly: (militaryOnly) => change(setTrafficOption(layers, { militaryOnly })),
    onTrails: (trails) => change(setTrafficOption(layers, { trails })), // one choice for the 2D layer and the 3D view
  });

  // The 3D view reads the 2D map's own pictures (radar, lightning) and its projection, so nothing is fetched twice.
  const view3d = createSofView3d({
    timers,
    getProjection: () => projection,
    getPictures: pictures3d,
    getWeather: weather3d,
    fullScreen,
    getSite: () => site, // the airspace, towns, tour targets and magnetic variation of the home base (sites/)
    routes: () => (site.routes.includes('tacnav') ? tacnavRoutes(ROUTES) : []), // the Debrief's routes with TAC in the name, drawn at 500 ft above the ground in 3D (SOF-39 phase 3)
    onAirspaceLogOptions: (options) => airspaceLog.setOptions(options), // the panel's two ticks: what the log records from now on
    now: () => +now(),
    onTrails: (trails) => change(setTrafficOption(layers, { trails })),
    onModelHour: (ms) => setModelHour(ms), // the 3D slider's model hour: the HRDPS cloud picture follows it
    onRainToGround: (on) => view3dSettings?.update({ rainToGround3d: on }), // the Rain to ground button, kept in the SOF's "view3d" settings
    // The Approaches button and its field picker, kept in the same settings; the 2D map draws the same field's final courses.
    onApproaches: ({ on, field, runway, manual }) => {
      view3dSettings?.update({ approaches3d: on, approachField3d: field, approachRunway3d: runway, approachRunways3d: manual });
      view.requestDraw();
      onApproaches(); // the cards' runway in use line follows the choice
    },
    getRunways: () => runways, // the runway in use at each field, from its METAR wind: only its approaches are drawn and checked by default
    onCorridors: (results) => {
      corridors = results;
      onApproaches(); // the cards' corridor line
    },
    onLost() {
      if (!threeOn) return;
      threeOn = false;
      modelFeed.stop();
      stop3dFeeds();
      canvas.hidden = false;
      applyLayers();
      sync();
      view.requestDraw();
      say(LOST_3D_WORDS);
    },
  });

  // The model clouds, winds and freezing level (Open-Meteo: ECCC's HRDPS and GEM, or NOAA's HRRR and GFS at a US base) are asked for only while the 3D view is shown (SOF-39, phase 2).
  const modelFeed = createModelFeed({
    points: (size) => gridPoints(projection.toLatLon, size),
    models: () => site.sources.modelClouds?.models, // the home base's two models (sites/), read at each ask
    fetch: fetchNet,
    timers,
    now,
    onChange: () => pushModel(),
  });

  const stage = h('div', { class: 'sof-map-stage' }, canvas, adsbFrame.element, view3d.element, tip, message, notice, live);
  const element = h(
    'section',
    { class: 'sof-map', 'aria-label': 'Weather map' },
    h('h2', { class: 'visually-hidden' }, 'Map'),
    controls.bar,
    stage,
    // SOF-38: the status strip and the key are one line under the map. The map's credits are in the screen's Sources
    // note at the bottom (layout.js), so they take no height from the map.
    h('div', { class: 'sof-map-foot' }, controls.status, controls.legend),
    controls.note,
  );

  // ---- Pictures --------------------------------------------------------------------------------------
  const decode = (bytes) => createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  async function readPixels(bytes) {
    const bitmap = await decode(bytes);
    try {
      const scratch = document.createElement('canvas');
      scratch.width = bitmap.width;
      scratch.height = bitmap.height;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, scratch.width, scratch.height);
    } finally {
      bitmap.close();
    }
  }
  // The lightning layer is drawn as a bright, outlined mark (map-lightning.js `recolourLightning`), not in ECCC's dark blue,
  // which is 1.02 to 1.41 : 1 on the satellite. The near-home check reads the picture as ECCC drew it (`readPixels`), not this.
  async function decodeLightning(bytes) {
    const marked = recolourLightning(await readPixels(bytes));
    if (!marked) return null;
    const scratch = document.createElement('canvas');
    scratch.width = marked.width;
    scratch.height = marked.height;
    scratch.getContext('2d').putImageData(new ImageData(marked.data, marked.width, marked.height), 0, 0);
    return createImageBitmap(scratch);
  }
  // A picture from a service that answers a missing time with an empty one (GIBS, feeds.js WMS_SERVICES `blankIsMissing`): mostly see-through is
  // "no frame for that time" (null, so the feed tries an older frame), never a clear sky. Any other layer is decoded as it is.
  async function decodeSatellite(bytes, asked, layer) {
    if (!wmsServiceOf(layer)?.blankIsMissing) return decode(bytes);
    const pixels = await readPixels(bytes);
    let filled = 0;
    for (let n = 3; n < pixels.data.length; n += 4) if (pixels.data[n] > 0) filled += 1;
    if (filled < MIN_FILLED_SHARE * pixels.width * pixels.height) return null;
    return createImageBitmap(pixels);
  }
  const paused = () => document.hidden || adsbOn;
  const shared = { fetch: fetchNet, timers, now, onChange: () => redraw() };

  const radar = createRadarFeed({ precip: () => layers.precip, layers: () => site.sources.radar?.layers, words: () => site.sources.radar, decode, paused, ...shared });
  // One picture feed for the layers that follow the view. `layer` is the layer name from the site profile (a function, read when asking); its service comes with the name (feeds.js WMS_SERVICES).
  const picture = (layer, kind, refreshMs, { timeless = false, decodeWith = decode } = {}) => createImageFeed({
    layer, kind, urlFor: wmsUrl, timeless, decode: decodeWith, refreshMs, paused, ...shared,
  });
  const feeds = {
    coverage: picture(() => site.sources.radar?.layers.coverage, 'radar', REFRESH_MS.radar),
    lightning: picture(() => site.sources.lightning?.layer, 'lightning', REFRESH_MS.lightning, { decodeWith: decodeLightning }),
    cloud: picture(() => site.sources.satellite?.layer, 'cloud', REFRESH_MS.lightning, { decodeWith: decodeSatellite }),
    warnings: picture(() => site.sources.warnings?.layer, 'lightning', REFRESH_MS.lightning, { timeless: true }),
  };
  const watch = createLightningWatch({
    home: () => ({ icao: home.icao, lat: home.lat, lon: home.lon }),
    radiusNm: () => settings.get().lightningNm,
    hasSource: () => site.sources.lightning != null, // none for this base: nothing is asked for, and it reads "no source, can't tell" (never "no lightning")
    readPixels,
    store: app.storage, // the lightning episode survives a reload, so an acknowledged caution stays acknowledged
    ...shared,
  });
  const trafficFeed = createTrafficFeed({
    address: relayAddress,
    options: () => layers.traffic,
    paused, // nothing asked while the tab is hidden or the ADS-B Exchange view has the map; the 3D view uses the same feed, so it keeps running
    ...shared,
    onChange() {
      updateAirspaceLog();
      updateTrails();
      const v = trafficFeed.view();
      if (v.signature !== trafficSig) {
        trafficSig = v.signature;
        view.requestDraw();
      }
      pushTraffic();
      refreshStatus();
    },
  });

  // ---- The 3D view's own pictures (Dad, 7 Oct) --------------------------------------------------------------
  // The 3D view covers 450 NM (or 600 or 900, the "3D area" setting), more than the 2D map's picture usually does, so radar, lightning and the GOES cloud picture are asked for again over the 3D square, only while the
  // 3D view is shown. They lay on the 3D ground and, read on a grid, make the radar shafts, the lightning bolts and the satellite sheet (weather3d-layers.js). The fronts come from
  // the relay's /fronts, every 30 minutes, also only while 3D is shown.
  const feeds3d = {
    radar: createImageFeed({ layer: () => (layers.precip === 'snow' ? site.sources.radar?.layers.snow : site.sources.radar?.layers.rain), kind: 'radar', urlFor: wmsUrl, decode, refreshMs: REFRESH_MS.radar, paused, ...shared }),
    lightning: createImageFeed({ layer: () => site.sources.lightning?.layer, kind: 'lightning', urlFor: wmsUrl, decode: decodeLightning, refreshMs: REFRESH_MS.lightning, paused, ...shared }),
    cloud: createImageFeed({ layer: () => site.sources.satellite?.layer, kind: 'cloud', urlFor: wmsUrl, decode: decodeSatellite, refreshMs: REFRESH_MS.lightning, paused, ...shared }),
    // HRDPS total cloud for the model hour shown (Fable review, 7 Oct): the 3D slabs' 2.5 km detail. Its own request (512 px, with the hour), not the others'.
    modelCloud: createImageFeed({ layer: () => site.sources.modelCloudMask?.layer, kind: 'modelCloud', urlFor: wmsUrl, decode, refreshMs: MODEL_CLOUD_REFRESH_MS, paused, ...shared }),
  };
  const requests3d = new Map(); // request key → the request, so a picture is laid where it was asked for
  let modelHourMs = null; // the 3D slider's model hour (ms), or null before the model has answered: then the hour now
  // The reporting stations' METARs for the 3D low cloud's observed bases (wx's fetchReports: MET Norway in one call, Datamask for the rest): in memory only.
  let anchorReports = {}; // ICAO -> wx report entry, the latest each station gave (each one's freshness is checked against the clock when used, so none is frozen)
  let anchorRound = { busy: false, at: null, failedAt: null, home: null };
  let cancelAnchors = null;
  const frontsFeed = createFrontsFeed({
    address: () => frontsUrl(settings.get().trafficRelay),
    paused: () => document.hidden,
    fetch: fetchNet,
    timers,
    now,
    onChange: () => {
      if (threeOn && !disposed) view3d.touch();
    },
  });

  /**
   * The "3D area" setting (Dad, 8 Oct 2026): sets the square's size (scene3d-model.js `setAreaNm`) and, when it changed, starts the square's things over: the model is asked
   * again over the new square (the same 13 x 13 points, so the same Open-Meteo calls, about 1,200; a change counts against the free daily 10,000), the pictures are asked
   * for over it, the stations inside it are asked for, and the 3D view is built again.
   */
  function syncArea() {
    const wanted = view3dSettings?.get().area3dNm ?? DEFAULT_AREA_NM;
    if (wanted === AREA_NM) return;
    setAreaNm(wanted);
    modelFeed.setPlace();
    requests3d.clear();
    if (threeOn) {
      syncFeeds3d();
      askAnchors();
    }
    view3d.setArea();
  }

  /** Asks the 3D feeds for pictures over the square round home (a new home gives a new request). */
  function syncFeeds3d() {
    const half = AREA_FT / 2;
    const corners = cornersOf(projection, { minX: -half, minY: -half, maxX: half, maxY: half });
    const request = radarImageRequest(corners, { width: areaPx(PICTURE_3D_PX), height: areaPx(PICTURE_3D_PX) });
    const cloudRequest = radarImageRequest(corners, { width: PICTURE_3D_PX, height: PICTURE_3D_PX }); // the satellite stays at 900 px (see PICTURE_3D_PX)
    for (const r of [request, cloudRequest]) if (r) requests3d.set(r.key, r);
    feeds3d.radar.setRequest(request);
    feeds3d.lightning.setRequest(request);
    feeds3d.cloud.setRequest(cloudRequest);
    syncModelCloud(corners);
    while (requests3d.size > MAX_REMEMBERED_REQUESTS) requests3d.delete(requests3d.keys().next().value);
  }
  /** The HRDPS cloud picture's request: the square at MODEL_CLOUD_PX, at the model hour shown (the whole hour; now's hour before the model has answered). */
  function syncModelCloud(corners) {
    const half = AREA_FT / 2;
    const base = radarImageRequest(corners ?? cornersOf(projection, { minX: -half, minY: -half, maxX: half, maxY: half }), { width: MODEL_CLOUD_PX, height: MODEL_CLOUD_PX });
    if (!base) return feeds3d.modelCloud.setRequest(null);
    const hour = new Date(Math.floor((modelHourMs ?? +now()) / HOUR_MS) * HOUR_MS);
    const request = { ...base, time: hour, key: `${base.key}@${hour.toISOString().slice(0, 13)}Z` };
    requests3d.set(request.key, request);
    feeds3d.modelCloud.setRequest(request);
  }
  /** The 3D slider moved to another model hour (or the model came or went): a picture for that hour is asked for once the slider has settled (the feed's own delay). */
  function setModelHour(ms) {
    const next = Number.isFinite(ms) ? ms : null;
    if (next === modelHourMs) return;
    modelHourMs = next;
    if (threeOn) syncModelCloud();
    while (requests3d.size > MAX_REMEMBERED_REQUESTS) requests3d.delete(requests3d.keys().next().value);
  }
  /** Which site-profile source each 3D picture feed needs. A feed whose source is null (this base has none) is never switched on. */
  const SOURCE_OF_3D = { radar: 'radar', lightning: 'lightning', cloud: 'satellite', modelCloud: 'modelCloudMask' };
  /** Switches the 3D feeds, the fronts and the model on for the sources this base has, and off for the ones it has not (when 3D opens, and when home changes). */
  function enable3dSources() {
    for (const [id, feed] of Object.entries(feeds3d)) feed.enable(site.sources[SOURCE_OF_3D[id]] != null);
    if (site.sources.fronts) frontsFeed.start();
    else frontsFeed.stop();
    if (site.sources.modelClouds) modelFeed.start(); // asks for the model clouds and winds at once, then when a newer run can be out (HRDPS about 0500, 1100, 1700, 2300Z; HRRR every 3 hours) while the view is open
    else modelFeed.stop();
  }
  function start3dFeeds() {
    syncFeeds3d();
    enable3dSources();
    askAnchors();
    cancelAnchors ??= timers.every(ANCHOR_REFRESH_MS, askAnchors);
  }
  function stop3dFeeds() {
    for (const feed of Object.values(feeds3d)) feed.enable(false);
    frontsFeed.stop();
    cancelAnchors?.();
    cancelAnchors = null;
  }

  /** The anchor stations inside the 3D square round home (the site profile's, from stations-data.js). */
  function anchorStations() {
    const half = AREA_FT / 2;
    return site.anchorStations.filter((st) => {
      const [x, y] = projection.toXY(st.lat, st.lon);
      return Math.abs(x) <= half && Math.abs(y) <= half;
    });
  }

  /** One round of the stations' METARs (only while 3D is shown and the tab is visible). A station missing from a round keeps its last report until wx calls it stale. */
  async function askAnchors() {
    if (disposed || !threeOn || document.hidden || anchorRound.busy) return;
    const asked = home.icao;
    const stations = anchorStations();
    if (!stations.length) {
      // The site profile lists no stations inside the square: there is nothing to ask for, and nothing to claim ("unavailable", never "ok").
      anchorRound = { busy: false, at: null, failedAt: +now(), home: asked };
      view3d.touch();
      return;
    }
    anchorRound = { ...anchorRound, busy: true };
    let got = 0;
    try {
      const result = await fetchReports('metar', stations.map((st) => st.icao), { fetch: fetchNet, now: now() });
      if (disposed || asked !== home.icao) return;
      got = Object.keys(result.reports).length;
      anchorReports = { ...anchorReports, ...result.reports };
    } catch {
      // fetchReports does not throw; anything else is a failed round
    } finally {
      if (!disposed && asked === home.icao) {
        anchorRound = { busy: false, at: got ? +now() : anchorRound.at, failedAt: got ? null : +now(), home: asked };
        if (threeOn) view3d.touch();
      } else anchorRound = { ...anchorRound, busy: false };
    }
  }

  /**
   * The observed bases for the 3D view: { status, anchors, failedAt } where status is 'loading' (no round yet), 'ok' or 'unavailable' (no station has a fresh report),
   * and anchors are scene3d-model.js `stationAnchors` for the stations inside the square (freshness checked against the clock now).
   */
  function anchorsView(t) {
    const anchors = stationAnchors({ reports: anchorReports, stations: anchorStations(), toXY: projection.toXY, now: t });
    const anyFresh = anchors.some((a) => a.fresh);
    const status = anyFresh ? 'ok' : anchorRound.at === null && anchorRound.failedAt === null ? 'loading' : 'unavailable';
    return { status, anchors, failedAt: anchorRound.failedAt };
  }

  const imagery = createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => view.requestDraw() });
  const charts = createVncLayer({ base: document.baseURI, onChange: () => view.requestDraw() });
  let backupLayer = null; // RainViewer's tiles for the frame in use
  let backupPath = null;

  function rainViewerTiles(frame) {
    if (frame.path !== backupPath) {
      backupLayer?.dispose();
      backupPath = frame.path;
      backupLayer = createTileLayer({
        source: { url: (z, x, y) => rainViewerTileUrl(frame, { z, x, y }), maxZoom: 7 },
        timers,
        onChange: () => view.requestDraw(),
      });
    }
    return backupLayer;
  }

  // ---- The canvas view ---------------------------------------------------------------------------------
  // The colours come from the page's tokens, read once and again only when the light/dark choice changes (a style read
  // on every draw would force a style recalculation each time the map moves).
  let paletteCache = null;
  function palette() {
    if (paletteCache) return paletteCache;
    const cs = getComputedStyle(canvas);
    let missing = false; // a token not there yet (sof.css still loading): use the fallback, but do not keep it
    const v = (name, fallback) => {
      const value = cs.getPropertyValue(name).trim();
      if (!value) missing = true;
      return value || fallback;
    };
    const made = {
      text: v('--text', '#e3eef5'),
      halo: 'rgba(2, 10, 16, 0.85)',
      ring: v('--accent-strong', '#8adfff'),
      caution: v('--caution', '#f5c542'),
      vfr: v('--sof-vfr', '#3ecf8e'),
      mvfr: v('--sof-mvfr', '#6db3ff'),
      ifr: v('--sof-ifr', '#ff6b6b'),
      lifr: v('--sof-lifr', '#e08bff'),
      none: v('--text-muted', '#9bb8c6'),
      traffic: v('--accent-strong', '#8adfff'),
      military: v('--caution', '#f5c542'),
    };
    if (!missing) paletteCache = made;
    return made;
  }

  const project = (lat, lon) => view.worldToScreen(...projection.toXY(lat, lon));

  function tileView() {
    const corners = cornersOf(projection, view.visibleBounds());
    return { corners, pxPerFt: view.view.scale, toScreen: project };
  }

  /** Asks each view-following feed for a picture that covers the view, when the one it holds no longer does. */
  function followView(corners) {
    const req = radarImageRequest(corners, view.size);
    if (!req) return;
    for (const [id, feed] of Object.entries({ radar, ...feeds })) {
      const held = asked.get(id);
      if (held && imageStillFits(held, corners)) continue;
      asked.set(id, req);
      requests.set(req.key, req);
      feed.setRequest(req);
    }
    while (requests.size > MAX_REMEMBERED_REQUESTS) requests.delete(requests.keys().next().value);
  }

  function drawPicture(ctx, feed, alpha) {
    const s = feed.state();
    const req = s.imageKey ? requests.get(s.imageKey) : null;
    if (s.image && req) drawGeoImage(ctx, s.image, req.bbox, project, alpha);
  }

  function draw(ctx) {
    const { width, height } = view.size;
    if (width < 2 || height < 2) return;
    if (!homed) {
      homed = true;
      goHome();
    }
    const pal = palette();
    const size = { width, height };
    const t = now();

    // Base
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    const tv = tileView();
    imagery.draw(ctx, tv);
    const tiles = imagery.state();
    const failed = tiles.wanted > 0 && tiles.ready === 0 && tiles.failed > 0;
    if (failed !== tilesFailed) {
      tilesFailed = failed;
      syncMessage();
    }
    ctx.fillStyle = `rgba(5, 10, 18, ${BASE_DIM})`;
    ctx.fillRect(0, 0, width, height);
    const base = baseLayers(layers);
    if (base.vnc !== null && site.charts.vnc) charts.draw(ctx, { keys: VNC_CHOICES.both, map: view, ref: projection.ref, align: VNC_DEFAULT_ALIGN, opacityPct: base.vnc });

    followView(tv.corners);

    // Overlays, bottom to top
    for (const id of stackOrder(layers, { relay: relayOn() })) {
      const pct = (layers.opacity[id] ?? 100) / 100;
      switch (id) {
        case 'cloud':
        case 'coverage':
        case 'warnings':
        case 'lightning':
          drawPicture(ctx, feeds[id], pct * (id === 'lightning' && feedStale('lightning') ? STALE_ALPHA : 1));
          break;
        case 'radar': {
          const s = radar.state();
          const alpha = pct * (radar.line(t).stale ? STALE_ALPHA : 1);
          if (s.source === 'rainviewer' && s.frame) {
            ctx.save();
            ctx.globalAlpha = alpha;
            rainViewerTiles(s.frame).draw(ctx, tv);
            ctx.restore();
          } else drawPicture(ctx, { state: () => s }, alpha);
          break;
        }
        case 'routes':
          if (!site.routes.includes('training')) break; // this base has no training routes to draw
          routes ??= ROUTES.map((r) => projectRoute(r, projection.ref));
          for (const r of routes) drawRoute(ctx, view, r, /** @type {any} */ (layers.opacity).routes);
          break;
        case 'rings':
          // The lightning caution ring only where the base has a lightning source: elsewhere there is no caution to draw a radius for.
          drawRings(ctx, view.worldToScreen(0, 0), view.view.scale, { radii: RING_NM, lightningNm: hasSource('lightning') ? settings.get().lightningNm : null }, pal);
          break;
        case 'airfields':
          hits.airfields = drawAirfields(ctx, marks, project, pal, size);
          break;
        case 'traffic':
          // Between answers each aircraft is drawn where its track and ground speed put it by now (traffic-motion.js), with its fading trail behind it.
          const list = trafficFeed.view(t).aircraft.map((a) => {
            const g = glideLatLon(a);
            return g.glided ? { ...a, lat: g.lat, lon: g.lon } : a;
          });
          if (layers.traffic.trails !== false) drawTrails(ctx, list, trailMemory, project, pal, size, +t, intruderHexes);
          hits.traffic = drawTraffic(ctx, list, project, pal, size, selectedHex, trafficDisplay());
          break;
        default:
      }
    }
    drawApproaches(ctx, pal, size); // over the overlays, under nothing: thin lines and small points
    if (!layers.on.airfields) hits.airfields = [];
    if (!layers.on.traffic || !relayOn()) hits.traffic = [];
  }

  const view = createCanvasView(canvas, {
    timers,
    minSpan: SPAN_LIMITS.minSpan,
    maxSpan: SPAN_LIMITS.maxSpan,
    label: 'Weather map. Drag to move, scroll or press plus and minus to zoom, and press ] and [ to step through traffic.',
    draw,
    onUserMove: () => hideTip(),
  });

  function goHome() {
    view.setView({ cx: 0, cy: 0, scale: homeView(home.lat).scale });
    live.textContent = `Map centred on ${home.icao}.`; // said even when it was already there, so the press is never silent
  }
  let lightningSeen = null; // the caution text last told to onLightning
  function redraw() {
    if (disposed) return;
    view.requestDraw();
    if (threeOn) view3d.touch(); // a new radar or lightning picture goes on the 3D ground too
    refreshStatus();
    const caution = watch.result(now())?.caution ?? null;
    const text = caution ? JSON.stringify(caution) : null;
    if (text !== lightningSeen) {
      lightningSeen = text;
      onLightning();
    }
  }

  // ---- Hover and keyboard facts for the dots and the traffic ----------------------------------------------
  function showTip(text, x, y) {
    if (tip.textContent !== text) tip.textContent = text;
    tip.hidden = false;
    // Kept inside the map: flipped to the other side of the pointer near the right and bottom edges.
    const { width, height } = view.size;
    tip.style.left = `${Math.min(Math.max(x + 14, 4), Math.max(4, width - 260))}px`;
    tip.style.top = `${Math.min(Math.max(y + 14, 4), Math.max(4, height - 90))}px`;
  }
  function hideTip() {
    if (!tip.hidden) tip.hidden = true;
  }
  function factsAt(x, y) {
    const a = nearestWithin(hits.traffic, x, y, HOVER_PX);
    if (a) return { text: a.aircraft.description || `${a.aircraft.hex}.`, x: a.x, y: a.y };
    const f = nearestWithin(hits.airfields, x, y, HOVER_PX);
    return f ? { text: f.mark.facts, x: f.x, y: f.y } : null;
  }
  canvas.addEventListener('pointermove', (event) => {
    if (event.buttons) return hideTip(); // dragging
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const found = factsAt(x, y);
    if (found) showTip(found.text, x, y);
    else hideTip();
  });
  canvas.addEventListener('pointerleave', hideTip);
  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      selectedHex = null;
      hideTip();
      view.requestDraw();
      return;
    }
    if (event.key !== ']' && event.key !== '[') return;
    const list = hits.traffic;
    if (!list.length) {
      live.textContent = 'No traffic on the map.';
      return;
    }
    event.preventDefault();
    const at = list.findIndex((item) => item.aircraft.hex === selectedHex);
    const next = list[(at + (event.key === ']' ? 1 : -1) + list.length) % list.length];
    selectedHex = next.aircraft.hex;
    live.textContent = next.aircraft.description;
    showTip(next.aircraft.description, next.x, next.y);
    view.requestDraw();
  });

  // ---- Layers, the ADS-B view, the words ---------------------------------------------------------------------
  function applyLayers() {
    const on = layers.on;
    // A layer whose source is null for this base (the site profile's) is never switched on: nothing is asked for.
    radar.enable(on.radar && hasSource('radar'));
    for (const id of Object.keys(feeds)) feeds[id].enable(on[id] && (id === 'coverage' ? coverageShown() : hasSource(id)));
    trafficFeed.setOn(on.traffic && relayOn() && !adsbOn);
    const gliding = on.traffic && relayOn() && !adsbOn;
    if (gliding && !cancelGlide2d) cancelGlide2d = timers.every(GLIDE_2D_MS, glide2dTick);
    else if (!gliding && cancelGlide2d) {
      cancelGlide2d();
      cancelGlide2d = null;
    }
    if (!on.traffic || !relayOn() || adsbOn || threeOn) { // the 2D hover and keyboard hits: not while the 2D canvas is hidden
      selectedHex = null;
      hits.traffic = [];
    }
  }

  function change(next) {
    if (next === layers) return;
    layers = next;
    app.storage.set(LAYERS_KEY, layers);
    applyLayers();
    trafficFeed.touch();
    sync();
    view.requestDraw();
  }

  function setAdsb(on) {
    if (on === adsbOn) return;
    if (on) stopThree(); // the two views are exclusive: ADS-B Exchange takes the map area from the 3D view
    adsbOn = on;
    canvas.hidden = on;
    hideTip();
    if (on) {
      const lat = home.lat;
      adsbFrame.show(adsbExchangeUrl({ lat, lon: home.lon, zoom: zoomForScale(lat, view.view.scale) }));
    } else {
      adsbFrame.hide();
      wakeFeeds();
      canvas.focus?.();
    }
    applyLayers();
    sync();
    view.requestDraw();
  }

  function wakeFeeds() {
    radar.wake();
    for (const feed of Object.values(feeds)) feed.wake();
  }

  // ---- The 3D view (SOF-39) ----------------------------------------------------------------------------
  /** A short notice over the map (why 3D did not open); it goes by itself. */
  function say(text) {
    cancelNotice?.();
    cancelNotice = null;
    if (notice.textContent !== text) notice.textContent = text;
    notice.hidden = false;
    cancelNotice = timers.after(NOTICE_MS, () => {
      cancelNotice = null;
      notice.hidden = true;
    });
  }

  /** What the 3D view is given: each airfield's pin words, colour and METAR cloud decks, and the height scale. */
  function pushScene() {
    if (!scene3d) return;
    view3d.setScene({ airfields: sceneAirfields({ ...scene3d, toXY: projection.toXY }), heightScale: settings.get().heightScale3d, cloudStyle: view3dSettings?.get().cloudStyle3d ?? 'slabs', rainToGround: view3dSettings?.get().rainToGround3d ?? true, approaches: approachChoice() });
  }

  /**
   * The Approaches choice (the "view3d" settings): { on, field, runway, manual } with field 'home', 'all' or an ICAO, runway 'wind' (the runway in use, the
   * default) or 'all', and manual the runway ends chosen by hand per field. Off by default, so the start view is as it was.
   */
  function approachChoice() {
    const v = view3dSettings?.get();
    return {
      on: v?.approaches3d === true,
      field: typeof v?.approachField3d === 'string' ? v.approachField3d : 'home',
      runway: v?.approachRunway3d === 'all' ? 'all' : 'wind',
      manual: v?.approachRunways3d && typeof v.approachRunways3d === 'object' ? v.approachRunways3d : {},
    };
  }

  /** These fields' approaches, keeping only those to the runway(s) shown (runway-in-use.js): the 2D lines and the cards use the same choice as the 3D view. */
  function approachesForRunways(fields) {
    const { runway, manual } = approachChoice();
    return fieldsForRunways({ fields, runways, mode: runway, manual, airports: AIRPORTS });
  }

  /** The fields the Approaches choice names, of the home base's 3D airports (home first). */
  function approachIcaos() {
    const list = site.airports3d ?? [home.icao];
    const { field } = approachChoice();
    if (field === 'all') return list;
    return list.includes(field) ? [field] : list.slice(0, 1);
  }

  /** A US base's approaches file (FAA CIFP), loaded once when the SOF shows that base: the alternate cards list their published approaches from it. */
  function askApproaches() {
    if (approachesOf(site).status !== 'idle') return;
    loadApproachesFor(site, () => {
      if (disposed) return;
      view.requestDraw();
      view3d.refreshApproaches();
      onApproaches();
    });
  }

  /** The 2D lines: the chosen field's final approach courses (FAF to threshold) and its fixes as small labelled points, while the Approaches are on. */
  function drawApproaches(ctx, pal, size) {
    if (!approachChoice().on) return;
    const held = approachesOf(site);
    if (held.status === 'loading' || held.status === 'idle') return;
    const fields = approachesForRunways(fieldApproaches({ icaos: approachIcaos(), file: held.fields, airports: AIRPORTS }));
    const courses = fields.flatMap((f) => f.approaches.map(finalCourse2d)).filter(Boolean);
    drawApproaches2d(ctx, courses, project, pal, size);
  }

  /** The SIGMETs, AIRMETs and PIREPs for the 3D view (alerts.js `alerts3dView`), their SFC at home's elevation as the 3D ground. Built again there only when they change. */
  function pushAlerts() {
    if (!threeOn || disposed || !alertsState) return;
    view3d.setAlerts(alerts3dView(alertsState, now(), Number.isFinite(home.elevationFt) ? home.elevationFt : 0));
  }

  /** What the model feed says now, for the 3D view: it builds the model layers only when the answer, the hour, the scale or the ground changed. */
  function pushModel() {
    if (!threeOn || disposed) return;
    const t = now();
    // No model source for this base (the site profile's null): not asked for, and the model panel says "no source, can't tell" rather than loading for ever.
    if (!site.sources.modelClouds) {
      view3d.setModel({ status: 'unavailable', model: null, lastGoodAt: null, failedAt: null, incomplete: false, limited: false, refining: false, nextAt: null, noSource: true, now: t, timeZone: app.time.zone });
      return;
    }
    view3d.setModel({ ...modelFeed.view(t), now: t, timeZone: app.time.zone });
  }

  /**
   * The live aircraft for the 3D view: the 2D layer's own feed (one poller, the same checks and stale fade), as positions in the map's
   * local feet. With the layer off, or the relay failing for long enough that every aircraft has faded out, there are none.
   */
  function pushTraffic() {
    if (!threeOn || disposed) return;
    view3d.setTraffic(sceneTraffic({ view: trafficFeed.view(now()), toXY: projection.toXY, label: layers.traffic.label, now: +now(), trails: trailMemory, trailsOn: layers.traffic.trails !== false, display: trafficDisplay() }));
  }

  /**
   * The airspace log reads the traffic feed's answer, once for each new answer (never per frame, and in 2D as well as 3D): every aircraft the relay
   * gave (the Military only choice hides aircraft from the picture, not from this), checked against the airspace volumes at home's elevation. With
   * no current traffic (the layer off, loading, or the relay failing) nobody is listed as inside; the lines already logged stay.
   */
  function updateAirspaceLog() {
    if (disposed) return;
    const st = trafficFeed.state();
    const stop = (reason) => {
      airspaceLog.pause(reason);
      logAnswer = null; // after a break the next answer is read afresh
    };
    if (!layers.on.traffic || !relayOn() || adsbOn || !st.on) stop('off');
    else if (st.failed) stop('unavailable');
    else if (!st.lastGood) stop('loading');
    else if (st.receivedAt !== logAnswer) {
      logAnswer = st.receivedAt;
      const groundFt = Number.isFinite(home.elevationFt) ? home.elevationFt : 0;
      const key = `${home.icao}|${groundFt}`;
      if (logVolumes?.key !== key) logVolumes = { key, volumes: checkedAirspace(site.airspace, groundFt).volumes };
      const answer = layerModel({ reply: st.lastGood, receivedAt: st.receivedAt, now: st.receivedAt, militaryOnly: false });
      airspaceLog.update({ aircraft: answer.aircraft, volumes: logVolumes.volumes, groundFt, at: st.receivedAt });
    }
    const logView = airspaceLog.view();
    intruderHexes = logView.hexes;
    view3d.setAirspaceLog(logView);
  }

  /** The trails take each new traffic answer once; with the layer off (or the relay not in use) they are forgotten, so nothing old comes back. */
  function updateTrails() {
    if (disposed) return;
    const st = trafficFeed.state();
    if (!layers.on.traffic || !relayOn() || adsbOn || !st.on || !st.lastGood) {
      trailMemory.clear();
      trailAnswer = null;
      return;
    }
    if (st.receivedAt === trailAnswer) return;
    trailAnswer = st.receivedAt;
    const answer = layerModel({ reply: st.lastGood, receivedAt: st.receivedAt, now: st.receivedAt, militaryOnly: false });
    trailMemory.record(answer.aircraft, st.receivedAt);
  }

  /** The 2D layer is redrawn once a second while an aircraft glides (and its trail ages); nothing runs while the layer is off or another view has the map. */
  function glide2dTick() {
    if (disposed || threeOn || adsbOn || document.hidden) return;
    if (trafficFeed.view(now()).aircraft.some(canGlide)) view.requestDraw();
  }

  /**
   * The pictures for the 3D ground: ECCC radar and lightning over the whole 3D square (the 3D view's own feeds, above), each only when its 2D layer is on, with the same
   * stale fading. The backup radar's tiles (RainViewer) are not drawn in 3D.
   */
  const imageIds = new WeakMap();
  let imageCount = 0;
  const idOf = (image) => {
    if (!imageIds.has(image)) imageIds.set(image, ++imageCount);
    return imageIds.get(image);
  };
  /** One 3D feed's line for the 3D view's status strip: words and a symbol, never colour alone (feedLine, as the 2D map's strip). */
  function line3d(id, t) {
    const s = feeds3d[id].state();
    const label = { radar: 'Radar', lightning: 'Lightning', cloud: 'Satellite' }[id];
    const source = site.sources[SOURCE_OF_3D[id]];
    if (source == null) return noSourceLine(label); // this base has none: amber, ⚠, "can't tell"

    return feedLine({ label, kind: id, on: true, hasImage: Boolean(s.image), layerTime: s.layerTime, failed: s.failures > 0 && !s.busy, busy: s.busy, ...sourceWords(source), now: t });
  }
  function pictures3d() {
    const t = now();
    const list = [];
    const parts = [`${home.lat},${home.lon}`];
    for (const id of ['radar', 'lightning']) {
      if (!layers.on[id]) continue;
      const s = feeds3d[id].state();
      const req = s.image && s.imageKey ? requests3d.get(s.imageKey) : null;
      if (!req) continue; // no picture yet
      const alpha = ((layers.opacity[id] ?? 100) / 100) * (line3d(id, t).stale ? STALE_ALPHA : 1);
      list.push({ id, image: s.image, bbox: req.bbox, alpha });
      parts.push(`${id}:${idOf(s.image)}:${req.key}:${alpha}`);
    }
    return { sig: parts.join('|'), list };
  }

  /**
   * What the 3D weather layers are built from (weather3d-layers.js): the radar, lightning and satellite pictures over the 3D square with whether each is stale (feeds.js ages),
   * the fronts (fronts.js `frontsView`), and the status strip's lines. `sig` changes when a picture, its staleness, the fronts or the minute does, so the layers are built
   * again only then.
   */
  function weather3d() {
    const t = now();
    const parts = [`${home.lat},${home.lon}`, Math.floor(+t / 60_000)];
    const lines = [];
    const pic = (id) => {
      const line = line3d(id, t);
      lines.push({ id, text: line.text, symbol: line.symbol, tone: line.tone });
      const s = feeds3d[id].state();
      const req = s.image && s.imageKey ? requests3d.get(s.imageKey) : null;
      if (!req) {
        parts.push(`${id}:none`);
        return null;
      }
      parts.push(`${id}:${idOf(s.image)}:${line.stale}`);
      return { id: idOf(s.image), image: s.image, bbox: req.bbox, stale: line.stale };
    };
    const radar = pic('radar');
    const lightning = pic('lightning');
    const satellite = pic('cloud');
    // The HRDPS cloud picture for the slabs: the hour it is for, its model run, whether that run is old, and whether the last try failed (no status-strip line: the model panel says it).
    const mc = feeds3d.modelCloud.state();
    const mcReq = mc.image && mc.imageKey ? requests3d.get(mc.imageKey) : null;
    const modelCloud = {
      id: mcReq ? idOf(mc.image) : null,
      image: mcReq ? mc.image : null,
      bbox: mcReq ? mcReq.bbox : null,
      time: mcReq && mc.layerTime ? +mc.layerTime : null,
      referenceTime: mc.referenceTime ? +mc.referenceTime : null,
      stale: mcReq ? feedAge({ kind: 'modelCloud', layerTime: mc.referenceTime, now: t }).stale : false,
      failed: mc.failures > 0 && !mc.busy,
      busy: mc.busy,
      lastGoodAt: mc.fetchedAt ? +mc.fetchedAt : null,
      noSource: !site.sources.modelCloudMask, // no 2.5 km picture for this base (ECCC's covers Canada only): the slabs are drawn unmasked and the panel says so
    };
    parts.push(`modelCloud:${modelCloud.id}:${modelCloud.time}:${modelCloud.stale}:${modelCloud.failed}:${modelCloud.busy}:${modelCloud.noSource}`);
    const anchors = anchorsView(t);
    parts.push(`anchors:${anchors.status}:${anchors.anchors.map((a) => `${a.icao}${a.fresh ? `+${a.baseMslFt ?? ''}${a.clear ? 'c' : ''}${a.unknown ? 'u' : ''}` : '-'}`).join(',')}`);
    const fs = frontsFeed.state();
    // No fronts source for this base: nothing drawn, and the line says so in amber (never a tick).
    const fronts = site.sources.fronts ? { ...frontsView(fs, t), key: `${fs.lastGood?.receivedAt ?? 'none'}` } : { status: 'nosource', data: null, words: noSourceWords('Fronts'), key: 'nosource' };
    parts.push(`fronts:${fronts.status}:${fronts.key}`);
    if (fronts.status === 'nosource') lines.push({ id: 'fronts', text: fronts.words, symbol: '⚠', tone: 'caution' });
    else lines.push({ id: 'fronts', text: fronts.words, symbol: fronts.status === 'ok' ? (fs.failed ? '⚠' : '✓') : fronts.status === 'loading' ? '⟳' : '⚠', tone: fronts.status === 'ok' && !fs.failed ? 'ok' : fronts.status === 'loading' ? 'busy' : 'bad' });
    return { sig: parts.join('|'), radar, lightning, satellite, fronts, lines, modelCloud, anchors };
  }

  function stopThree() {
    if (!threeOn) return;
    threeOn = false;
    modelFeed.stop(); // nothing is asked for while the 3D view is not shown
    stop3dFeeds(); // nor are its pictures or the fronts
    view3d.hide(); // frees the aircraft too; the traffic feed itself is the 2D layer's and goes on while its switch is on
    view3d.setTraffic();
  }

  function setThree(on) {
    if (on === threeOn) return;
    if (!on) {
      stopThree();
      canvas.hidden = false;
      applyLayers();
      sync();
      view.requestDraw();
      canvas.focus?.();
      return;
    }
    if (!webglSupported()) {
      say(NO_WEBGL_WORDS); // the button stays; it says the same on hover
      return;
    }
    if (adsbOn) {
      adsbOn = false; // the two views are exclusive
      adsbFrame.hide();
      wakeFeeds();
    }
    threeOn = true;
    canvas.hidden = true;
    hideTip();
    pushScene();
    start3dFeeds(); // the 3D view's own radar, lightning and satellite pictures, the fronts, and the model clouds and winds, for the sources this base has; they all stop when it is closed
    pushModel();
    applyLayers();
    pushTraffic();
    pushAlerts();
    sync();
    // three.js loads now, the first time. If it cannot, the map comes back and says why.
    view3d.show().then((result) => {
      if (result.ok || !threeOn) return;
      threeOn = false;
      modelFeed.stop();
      stop3dFeeds();
      canvas.hidden = false;
      applyLayers();
      sync();
      view.requestDraw();
      say(result.reason === 'gl' ? NO_WEBGL_WORDS : NO_3D_LOAD_WORDS);
    });
  }

  function feedStale(id) {
    return lineOf(id, now())?.stale === true;
  }

  function lineOf(id, t) {
    // No source for this base: "Radar: no source for this base, can't tell", amber with ⚠, never a tick and never "no picture".
    if (id in SOURCE_OF && !hasSource(id)) return noSourceLine({ radar: 'Radar', coverage: 'Radar coverage', lightning: 'Lightning map', cloud: 'Cloud', warnings: 'Warnings' }[id]);
    if (id === 'coverage' && !coverageShown()) return coverageNotShownLine(); // a radar source with no coverage layer (NOAA MRMS): neutral, not a failure
    if (id === 'radar') return radar.line(t);
    const s = feeds[id]?.state();
    if (!s) return null;
    if (id === 'warnings') {
      // Warnings have no layer time; the time shown is when the picture was fetched, and it says so.
      if (!s.image) return feedLine({ label: 'Warnings', on: true, hasImage: false, failed: s.failures > 0 && !s.busy, busy: s.busy, now: t });
      const age = Math.max(0, Math.round((+t - +s.fetchedAt) / 60_000));
      return { text: `Warnings as fetched ${hhmmZ(s.fetchedAt)} (${age < 1 ? 'just now' : `${age} min ago`})`, symbol: '✓', tone: 'ok', stale: false };
    }
    const label = { coverage: 'Radar coverage', lightning: 'Lightning map', cloud: 'Cloud' }[id];
    return feedLine({ label, kind: { coverage: 'radar', cloud: 'cloud' }[id] ?? 'lightning', on: true, hasImage: Boolean(s.image), layerTime: s.layerTime, failed: s.failures > 0 && !s.busy, busy: s.busy, ...(id === 'cloud' ? sourceWords(site.sources.satellite) : {}), now: t });
  }

  function syncMessage() {
    const show = !online || tilesFailed;
    if (message.hidden === show) message.hidden = !show;
  }

  function refreshStatus() {
    if (disposed) return;
    const t = now();
    if (adsbOn) {
      controls.setStatus([
        { id: 'adsb', text: "ADS-B Exchange's own map is showing. Radar, lightning and airfields are not drawn over it.", symbol: '', tone: 'ok' },
        nearHome(t),
      ]);
      controls.setCredits('Traffic map: ADS-B Exchange (globe.adsbexchange.com), shown in a frame and opened in a new tab on request.');
      controls.setNote(null);
      controls.setLegend(null);
      return;
    }
    const lines = {};
    for (const id of ['radar', 'coverage', 'lightning', 'cloud', 'warnings']) lines[id] = layers.on[id] ? lineOf(id, t) : null;
    const tv = trafficFeed.view(t);
    if (layers.on.traffic && relayOn()) {
      lines.traffic = { text: tv.statusText, symbol: tv.status === 'unavailable' ? '⚠' : tv.status === 'ok' ? '✓' : '⟳', tone: tv.status === 'unavailable' ? 'bad' : tv.status === 'ok' ? 'ok' : 'busy' };
    }
    const items = statusItems({ ...lines, nearhome: nearHome(t) }, { ...layers.on, nearhome: true, traffic: layers.on.traffic && relayOn() });
    const space = airspaceLog.view();
    // Information only, never a caution: it is on the traffic line's side of the strip, in amber with the ⚠ symbol and the words.
    if (layers.on.traffic && relayOn() && space.count > 0) items.push({ id: 'airspace', text: space.countWords, symbol: '⚠', tone: 'caution' });
    controls.setStatus(items);
    controls.setCredits(mapCredits(layers, { radarBackup: radar.state().source === 'rainviewer', trafficOn: layers.on.traffic && relayOn(), feedsCredit: site.credits.mapFeeds }));
    // A base with no lightning picture of its own may have an outside map to look at instead (us-base.js): a plain link under the map, labelled as not checked.
    controls.setNote(site.charts.vnc ? baseNote(layers) : null, lightningMapLink(site.lightningLink, home));
    // The key explains only the layers this base has a source for.
    controls.setLegend(legendItems({ ...layers, on: { ...layers.on, radar: layers.on.radar && hasSource('radar'), lightning: layers.on.lightning && hasSource('lightning'), traffic: layers.on.traffic === true && relayOn() } }, { radarBackup: radar.state().source === 'rainviewer', radarScale: site.sources.radar?.scale ?? null, lightningRing: hasSource('lightning') }));
  }

  function nearHome(t) {
    return nearHomeItem(watch.result(t), layers.on.lightning ? lineOf('lightning', t) : null);
  }

  function sync() {
    controls.sync({ layers, relay: relayOn(), adsbOn, threeOn, fullOn: fullScreen?.isFull() === true });
    refreshStatus();
  }

  // ---- Listeners the module owns (counted, and ended with it) -----------------------------------------------
  const stops = [
    // Escape closes the Layers menu from anywhere on the map (the canvas, the zoom buttons) and puts focus back on its button.
    app.listen(element, 'keydown', controls.escape),
    app.listen(globalThis, 'online', () => {
      online = true;
      syncMessage();
      radar.wake();
      for (const feed of Object.values(feeds)) feed.wake();
      watch.wake();
      trafficFeed.wake();
    }),
    app.listen(globalThis, 'offline', () => {
      online = false;
      syncMessage();
    }),
  ];
  if (fullScreen) stops.push(fullScreen.subscribe(sync)); // the button's words follow Full screen, however it was entered or left
  const scheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (scheme) {
    stops.push(app.listen(scheme, 'change', () => {
      paletteCache = null;
      view.requestDraw();
    }));
  }

  syncArea(); // the "3D area" setting, before the square is first used
  goHome();
  applyLayers();
  watch.start();
  sync();
  syncMessage();

  return {
    element,
    credits: controls.credits,
    /**
     * The screen changed (a report, the settings, the airfields, the clock). `snapshot` is the weather
     * snapshot and `screen` what buildScreen made from it; `alerts` the SIGMET/AIRMET/PIREP feed's state (alerts.js), for the 3D view.
     * Redraws only when something the map shows differs.
     */
    update({ snapshot, screen, alerts = null }) {
      if (disposed) return;
      alertsState = alerts;
      syncArea(); // the "3D area" setting, before anything is worked out over the square
      const display = JSON.stringify(trafficDisplay());
      if (display !== displayKey) {
        displayKey = display; // a Traffic display setting changed: the 2D layer draws again (the 3D view follows through pushTraffic)
        view.requestDraw();
        if (threeOn) pushTraffic();
      }
      const field = app.airfields.home();
      if (field.icao !== home.icao || field.lat !== home.lat || field.lon !== home.lon) {
        home = field;
        site = siteFor(home.icao); // the new base's airspace, towns, sources and credits
        projection = createProjection(home);
        routes = null;
        asked.clear();
        requests.clear();
        airspaceLog.setWatched(site.watchedAreas);
        airspaceLog.reset(); // the volumes are checked for the new home's elevation, and nobody has been seen yet
        logAnswer = null;
        updateAirspaceLog();
        applyLayers(); // a layer is on only if the new base has a source for it
        watch.setPlace();
        modelFeed.setPlace(); // the grid is round the new home
        requests3d.clear();
        anchorReports = {}; // and the stations round it
        anchorRound = { busy: false, at: null, failedAt: null, home: null };
        if (threeOn) {
          syncFeeds3d(); // and so are the 3D pictures
          enable3dSources(); // for the sources the new base has
          askAnchors();
        }
        goHome();
      }
      const radius = settings.get().lightningNm;
      const relay = settings.get().trafficRelay;
      if (radius !== lastRadius) {
        lastRadius = radius;
        watch.setPlace();
        view.requestDraw();
      }
      if (relay !== lastRelay) {
        lastRelay = relay;
        // A new address starts the layer over: off drops the old relay's aircraft and cancels its request still out,
        // and applyLayers turns it on again for the new one (or leaves it off when the address is not one we use).
        trafficFeed.setOn(false);
        applyLayers();
        controls.sync({ layers, relay: relayOn(), adsbOn, threeOn, fullOn: fullScreen?.isFull() === true });
        view.requestDraw();
      }
      const fields = [home, ...app.airfields.alternates()];
      marks = airfieldMarks({ cards: screen.cards, fields, snapshot });
      scene3d = { marks, cards: screen.cards, fields, snapshot };
      if (threeOn) {
        pushScene();
        pushModel(); // the model's age and the hour "now" are checked on every tick
        pushTraffic(); // so is the traffic's "seconds ago" line
        pushAlerts(); // and the SIGMETs' end times
        view3d.touch(); // the pictures' fading with age is checked on every tick
      }
      const key = JSON.stringify(marks.map((m) => [m.icao, m.label, m.old, m.wind && [m.wind.dirDeg, m.wind.speedKt], m.lat, m.lon]));
      if (key !== marksKey) {
        marksKey = key;
        view.requestDraw();
      }
      askApproaches();
      const apprKey = JSON.stringify([approachChoice(), site.icao, approachesOf(site).status, runwaysKey]);
      if (apprKey !== approachKey2d) {
        approachKey2d = apprKey;
        view.requestDraw();
      }
      refreshStatus();
    },
    /**
     * The approach lines for a field's card (information only): { published } "Published approaches: ILS 13R, VOR-A ...; non-GPS: yes" at a base with an
     * approaches file (a US base; none at Moose Jaw, whose cards stay as they were), and { corridor } the 3D view's arrival corridor summary for that field
     * while it is checked. Either is null when there is nothing to say.
     */
    approachLines(icao) {
      const held = approachesOf(site);
      const field = held.status === 'ok' || held.status === 'none' ? fieldApproaches({ icaos: [icao], file: held.fields, airports: AIRPORTS })[0] ?? null : null;
      const published = held.status === 'ok' ? publishedLine(field) : null;
      // The runway in use and the approaches to it (Dad, 8 Oct 2026), at a base whose approaches are known (a US base's FAA CIFP file), or anywhere while the
      // Approaches are on; so Moose Jaw's cards stay as they were until the Approaches are turned on.
      const said = field && (held.status === 'ok' || approachChoice().on) ? approachesForRunways([field])[0] : null;
      return { published, corridor: corridors.get(icao)?.summary ?? null, runway: said?.runway.ends.length ? said.line : null };
    },
    /**
     * Each field's runway in use from its latest METAR wind (runway-in-use.js), worked out on every render from the cards (their METAR line, whose staleness
     * rule decides, and the METAR's wind): the home base's 3D fields and the cards' fields. No request is made: it reads what the screen already has. The 3D
     * view and the 2D lines are drawn again only when a runway in use or its words change.
     */
    setRunways({ cards = [], snapshot = null } = {}) {
      const byIcao = new Map(cards.map((c) => [c.icao, c]));
      const icaos = [...new Set([...(siteFor(app.airfields.home().icao).airports3d ?? []), ...byIcao.keys()])]; // the new home's fields at once, before update() moves `site`
      const next = new Map(icaos.map((icao) => {
        const card = byIcao.get(icao);
        const wind = snapshot?.metar?.[icao]?.report?.conditions?.wind ?? null;
        return [icao, runwayInUse({ icao, metar: card?.metar ?? null, wind: card ? wind : null, airports: AIRPORTS })];
      }));
      const key = shownSignature([...next.values()].map((r) => ({ icao: r.icao, shown: { mode: r.status, ends: r.inUse, words: r.words } })));
      runways = next;
      if (key === runwaysKey) return;
      runwaysKey = key;
      view.requestDraw();
      view3d.refreshApproaches();
    },
    /** lightning.js's answer now, for the screen model's cautions. */
    lightning: (t) => watch.result(t),
    /** The tab is back or the computer woke: anything due is asked for at once. */
    wake() {
      if (disposed) return;
      radar.wake();
      for (const feed of Object.values(feeds)) feed.wake();
      watch.wake();
      trafficFeed.wake();
      modelFeed.wake();
      if (threeOn) {
        for (const feed of Object.values(feeds3d)) feed.wake();
        frontsFeed.wake();
        if (anchorRound.at === null || +now() - anchorRound.at >= ANCHOR_REFRESH_MS) askAnchors();
      }
      view.requestDraw();
    },
    /** Stops every request and timer, drops the frame and the pictures. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of stops) stop();
      radar.stop();
      for (const feed of Object.values(feeds)) feed.stop();
      watch.stop();
      trafficFeed.stop();
      cancelGlide2d?.();
      cancelNotice?.();
      modelFeed.stop();
      for (const feed of Object.values(feeds3d)) feed.stop();
      frontsFeed.stop();
      cancelAnchors?.();
      cancelAnchors = null;
      view3d.dispose();
      adsbFrame.dispose();
      imagery.dispose();
      charts.dispose();
      backupLayer?.dispose();
      view.dispose();
      element.remove();
    },
  };
}
