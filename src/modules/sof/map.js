// The SOF's map (SPEC-sof, "Map"; tasks 6 and 7): a canvas map on ui-kit's canvas view, with no map
// library. Satellite (Esri, through the shared tile loader) or the VNC charts underneath; ECCC radar (with
// RainViewer as its backup), radar coverage, lightning, GOES cloud and warnings as pictures; the training
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
import { LAYERS, getMapUrl, rainViewerTileUrl, REFRESH_MS } from './feeds.js';
import { createImageFeed, createRadarFeed, extraMapUrl, feedLine, EXTRA_LAYERS } from './map-feeds.js';
import { createLightningWatch, createTrafficFeed } from './map-loops.js';
import { recolourLightning } from './map-lightning.js';
import { trafficUrl, layerModel } from './traffic.js';
import {
  createProjection, homeView, cornersOf, radarImageRequest, imageStillFits, nearestWithin, RING_NM, SPAN_LIMITS,
} from './map-view.js';
import {
  cleanLayers, setLayerOn, setLayerOpacity, setBase, setPrecip, setTrafficOption, stackOrder, baseLayers, BASE_DIM,
} from './map-layers.js';
import { airfieldMarks, mapCredits, baseNote, statusItems, nearHomeItem, legendItems } from './map-model.js';
import { drawGeoImage, drawRings, drawAirfields, drawTraffic, drawTrails } from './map-draw.js';
import { createTrails, glideLatLon, canGlide, GLIDE_2D_MS } from './traffic-motion.js';
import { createMapControls } from './map-controls.js';
import { createAdsbFrame, adsbExchangeUrl, zoomForScale } from './adsbx.js';
import { webglSupported } from '../../ui-kit/three-aircraft.js';
import { createSofView3d } from './view3d.js';
import { sceneAirfields, sceneTraffic } from './scene3d-model.js';
import { tacnavRoutes, checkedAirspace } from './airspace-model.js';
import { AIRSPACE } from './airspace-data.js';
import { createAirspaceLog } from './airspace-log.js';
import { createModelFeed, gridPoints } from './model-clouds.js';

const LAYERS_KEY = 'map-layers';
const BACKGROUND = '#05090d';
const STALE_ALPHA = 0.4; // a stale picture is drawn faint, and its line says STALE
const HOVER_PX = 14;
const MAX_REMEMBERED_REQUESTS = 12;
const OFFLINE_WORDS = 'Map and radar need a connection';
const NO_WEBGL_WORDS = 'The 3D view needs WebGL, which this browser does not have. The map stays.';
const NO_3D_LOAD_WORDS = 'The 3D view could not load (it needs a connection the first time). The map stays.';
const LOST_3D_WORDS = 'The 3D view lost its graphics and went back to the map.';
/** How long a notice about the 3D view stays up. */
const NOTICE_MS = 8000;

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;

/** A satellite picture's map address for the ECCC layers feeds.js lists. */
const ecccUrl = ({ layer, request, time }) => getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, time });
/** And for the two it does not. */
const extraUrl = ({ layer, request, time }) => extraMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, time });

/**
 * app: the module's app object (scheduler, storage, time, airfields, listen). settings: createSofSettings.
 * onLightning: called when the near-home lightning caution changes (so the banner can be redrawn). fullScreen: fullscreen.js's object, shared with the 3D view:
 * the map bar's Full screen button (2D) and the 3D view's own both toggle it (the whole SOF picture, with the airfield column and the timeline strip).
 * Returns { element, credits, update({ snapshot, screen }), lightning(now), wake(), dispose() }. `credits` is the line of the map's
 * credits, for the screen's Sources note (the map keeps no height for it).
 */
export function createSofMap({ app, settings, onLightning = () => {}, fullScreen = null }) {
  const timers = app.scheduler;
  const now = () => app.time.now();
  const fetchNet = (url, init) => globalThis.fetch(url, init);

  let layers = cleanLayers(app.storage.get(LAYERS_KEY, null), { now: now() });
  let adsbOn = false;
  let threeOn = false; // the 3D view has the map area (never together with adsbOn)
  let scene3d = null; // what the 3D view was last given: { marks, cards, fields, snapshot }
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
  const airspaceLog = createAirspaceLog(); // who is in the watched advisory areas; reads each new traffic answer once (airspace-log.js), information only
  let logAnswer = null; // when the traffic answer the log last read arrived
  const trailMemory = createTrails(); // the last couple of minutes of each aircraft's reported positions, for the fading trails (2D and 3D)
  let trailAnswer = null; // when the traffic answer the trails last took arrived
  let intruderHexes = new Map(); // the aircraft that are not T-6s inside a watched area (the log's), whose trails are amber
  let cancelGlide2d = null; // the 2D layer's once-a-second redraw while aircraft glide
  let logVolumes = null; // { key, volumes }: the airspace checked for home's elevation
  let lastRadius = null;
  let lastRelay = null;

  // ---- Where home is ---------------------------------------------------------------------------------
  let home = app.airfields.home();
  let projection = createProjection(home);
  let routes = null; // the training routes in this projection's feet, made the first time they are drawn
  const requests = new Map(); // request key → the request, so a picture is laid where it was asked for
  const asked = new Map(); // feed id → the request it holds

  const relayAddress = () => trafficUrl({ baseUrl: settings.get().trafficRelay, lat: home.lat, lon: home.lon });
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
    fullScreen,
    routes: tacnavRoutes(ROUTES), // the Debrief's routes with TAC in the name, drawn at 500 ft above the ground in 3D (SOF-39 phase 3)
    onAirspaceLogOptions: (options) => airspaceLog.setOptions(options), // the panel's two ticks: what the log records from now on
    now: () => +now(),
    onTrails: (trails) => change(setTrafficOption(layers, { trails })),
    onLost() {
      if (!threeOn) return;
      threeOn = false;
      modelFeed.stop();
      canvas.hidden = false;
      applyLayers();
      sync();
      view.requestDraw();
      say(LOST_3D_WORDS);
    },
  });

  // The model clouds, winds and freezing level (Open-Meteo's GEM forecast) are asked for only while the 3D view is shown (SOF-39, phase 2).
  const modelFeed = createModelFeed({
    points: () => gridPoints(projection.toLatLon),
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
  const paused = () => document.hidden || adsbOn;
  const shared = { fetch: fetchNet, timers, now, onChange: () => redraw() };

  const radar = createRadarFeed({ precip: () => layers.precip, decode, paused, ...shared });
  // One picture feed for the layers that follow the view. `external`: a layer feeds.js does not list (map-feeds.js EXTRA_LAYERS).
  const picture = (layer, kind, refreshMs, { external = false, timeless = false, decodeWith = decode } = {}) => createImageFeed({
    layer, kind, urlFor: external ? extraUrl : ecccUrl, timeless, decode: decodeWith, refreshMs, paused, ...shared,
  });
  const feeds = {
    coverage: picture(LAYERS.coverage, 'radar', REFRESH_MS.radar),
    lightning: picture(LAYERS.lightning, 'lightning', REFRESH_MS.lightning, { decodeWith: decodeLightning }),
    cloud: picture(EXTRA_LAYERS.cloud, 'cloud', REFRESH_MS.lightning, { external: true }),
    warnings: picture(EXTRA_LAYERS.warnings, 'lightning', REFRESH_MS.lightning, { external: true, timeless: true }),
  };
  const watch = createLightningWatch({
    home: () => ({ icao: home.icao, lat: home.lat, lon: home.lon }),
    radiusNm: () => settings.get().lightningNm,
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
    if (base.vnc !== null) charts.draw(ctx, { keys: VNC_CHOICES.both, map: view, ref: projection.ref, align: VNC_DEFAULT_ALIGN, opacityPct: base.vnc });

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
          routes ??= ROUTES.map((r) => projectRoute(r, projection.ref));
          for (const r of routes) drawRoute(ctx, view, r, /** @type {any} */ (layers.opacity).routes);
          break;
        case 'rings':
          drawRings(ctx, view.worldToScreen(0, 0), view.view.scale, { radii: RING_NM, lightningNm: settings.get().lightningNm }, pal);
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
          hits.traffic = drawTraffic(ctx, list, project, pal, size, selectedHex);
          break;
        default:
      }
    }
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
    radar.enable(on.radar);
    for (const id of Object.keys(feeds)) feeds[id].enable(on[id]);
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
    view3d.setScene({ airfields: sceneAirfields({ ...scene3d, toXY: projection.toXY }), heightScale: settings.get().heightScale3d });
  }

  /** What the model feed says now, for the 3D view: it builds the model layers only when the answer, the hour, the scale or the ground changed. */
  function pushModel() {
    if (!threeOn || disposed) return;
    const t = now();
    view3d.setModel({ ...modelFeed.view(t), now: t, timeZone: app.time.zone });
  }

  /**
   * The live aircraft for the 3D view: the 2D layer's own feed (one poller, the same checks and stale fade), as positions in the map's
   * local feet. With the layer off, or the relay failing for long enough that every aircraft has faded out, there are none.
   */
  function pushTraffic() {
    if (!threeOn || disposed) return;
    view3d.setTraffic(sceneTraffic({ view: trafficFeed.view(now()), toXY: projection.toXY, label: layers.traffic.label, now: +now(), trails: trailMemory, trailsOn: layers.traffic.trails !== false }));
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
      if (logVolumes?.key !== key) logVolumes = { key, volumes: checkedAirspace(AIRSPACE, groundFt).volumes };
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

  /** The pictures the 2D map already holds, for the 3D ground: ECCC radar and lightning, with the same stale fading. Not fetched again. */
  const imageIds = new WeakMap();
  let imageCount = 0;
  function pictures3d() {
    const t = now();
    const list = [];
    const parts = [`${home.lat},${home.lon}`];
    for (const id of ['radar', 'lightning']) {
      if (!layers.on[id]) continue;
      const s = id === 'radar' ? radar.state() : feeds.lightning.state();
      const req = s.image && s.imageKey ? requests.get(s.imageKey) : null;
      if (!req) continue; // no picture yet, or the backup radar's tiles (RainViewer), which the 3D view does not draw
      const stale = id === 'radar' ? radar.line(t).stale : feedStale('lightning');
      const alpha = ((layers.opacity[id] ?? 100) / 100) * (stale ? STALE_ALPHA : 1);
      if (!imageIds.has(s.image)) imageIds.set(s.image, ++imageCount);
      list.push({ id, image: s.image, bbox: req.bbox, alpha });
      parts.push(`${id}:${imageIds.get(s.image)}:${req.key}:${alpha}`);
    }
    return { sig: parts.join('|'), list };
  }

  function stopThree() {
    if (!threeOn) return;
    threeOn = false;
    modelFeed.stop(); // nothing is asked for while the 3D view is not shown
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
    modelFeed.start(); // asks for the model clouds and winds at once, then once an hour while the view is open
    pushModel();
    applyLayers();
    pushTraffic();
    sync();
    // three.js loads now, the first time. If it cannot, the map comes back and says why.
    view3d.show().then((result) => {
      if (result.ok || !threeOn) return;
      threeOn = false;
      modelFeed.stop();
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
    return feedLine({ label, kind: { coverage: 'radar', cloud: 'cloud' }[id] ?? 'lightning', on: true, hasImage: Boolean(s.image), layerTime: s.layerTime, failed: s.failures > 0 && !s.busy, busy: s.busy, now: t });
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
    controls.setCredits(mapCredits(layers, { radarBackup: radar.state().source === 'rainviewer', trafficOn: layers.on.traffic && relayOn() }));
    controls.setNote(baseNote(layers));
    controls.setLegend(legendItems(layers, { radarBackup: radar.state().source === 'rainviewer' }));
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
     * snapshot and `screen` what buildScreen made from it. Redraws only when something the map shows differs.
     */
    update({ snapshot, screen }) {
      if (disposed) return;
      const field = app.airfields.home();
      if (field.icao !== home.icao || field.lat !== home.lat || field.lon !== home.lon) {
        home = field;
        projection = createProjection(home);
        routes = null;
        asked.clear();
        requests.clear();
        airspaceLog.reset(); // the volumes are checked for the new home's elevation, and nobody has been seen yet
        logAnswer = null;
        updateAirspaceLog();
        watch.setPlace();
        modelFeed.setPlace(); // the grid is round the new home
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
        view3d.touch(); // the pictures' fading with age is checked on every tick
      }
      const key = JSON.stringify(marks.map((m) => [m.icao, m.label, m.old, m.wind && [m.wind.dirDeg, m.wind.speedKt], m.lat, m.lon]));
      if (key !== marksKey) {
        marksKey = key;
        view.requestDraw();
      }
      refreshStatus();
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
