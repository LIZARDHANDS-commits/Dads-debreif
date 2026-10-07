// The SOF 3D view's weather layers, put together (SOF-39, SOF-42; Dad, 7 Oct): radar shafts, lightning bolts, the faint satellite sheet, the surface fronts with their pressure
// marks, and the gentle wind flow. view3d.js hands this the pictures, the model and the fronts as they change; this reads the pictures onto a grid, works out the heights from
// the model's clouds, builds the objects (weather3d.js), keeps each only as long as what it was built from is unchanged, and runs the wind flow's loop.
//
// Draws only on change, except the wind flow: its frame loop (the scheduler's, never setInterval) runs only while the layer is on, the view is shown and there is wind to show;
// with reduced motion the streaks step every FLOW_STEP_MS instead. Everything is freed on hide and on close (`dispose()`).
//
// Stale and failed data (SPEC-sof, "3D view"): radar shafts and lightning bolts are drawn only for a picture that is not stale (a stale precipitation column is never drawn as
// current); the satellite sheet follows the 2D layer: a stale picture is drawn fainter and the status line says STALE; a picture that failed leaves nothing. The fronts are
// fronts.js's: old or missing fronts are not drawn and the view says "Fronts unavailable".
import { h } from '../../ui-kit/dom.js';
import { drawGeoImage } from './map-draw.js';
import { AREA_FT } from './scene3d-model.js';
import { windGrid, sampleWind, cloudSheetLevels, cloudColumnAt, CLOUD_COVER_THRESHOLD_PCT } from './model-clouds.js';
import { formatFeet } from './scene3d-model.js';
import {
  CELL_PX, CELL_SUPERSAMPLE, SATELLITE_PX, SATELLITE_DEFAULT_FT, RADAR_DEFAULT_AGL_FT, LIGHTNING_DEFAULT_AGL_FT, FRONT_WALL_FT, FLOW_PARTICLES, FLOW_STEP_MS,
  FLOW_FT_PER_S_PER_KT, pictureCells, reduceToCells, shafts, bolts, satellitePixels, frontGeometry, createFlow,
} from './weather3d-model.js';
import { buildShafts, buildBolts, buildSatelliteSheet, buildFronts, buildFlow } from './weather3d.js';
import { FRONTS_CREDIT } from './fronts.js';

/** The names the view's toggles use for these layers. */
export const WEATHER_TOGGLES = Object.freeze(['satellite', 'radar', 'lightning', 'fronts', 'flow']);
/** The flow's streaks are moved and drawn at most this often (milliseconds, about 30 a second). An estimate for smoothness at little cost. */
const FLOW_FRAME_MS = 33;
/** A stale satellite picture is drawn at this share of its opacity (the 2D map's own STALE_ALPHA). */
const STALE_SHARE = 0.4;
const WIND_LEVELS = Object.freeze([850, 700, 500]);
/** The satellite sheet is at full strength up to this zoom (times the start view) and thins to SHEET_FADE_MIN beyond. Estimates for the look. */
const SHEET_FADE_START = 8;
const SHEET_FADE_MIN = 0.2;

/**
 * T: three.js; scene; timers (a scheduler scope); win (the window: its document makes the canvases); labels (the element the H and L marks go in); requestRender(); reducedMotion().
 * Returns { update({ weather, model, hour, scale, groundFt, projection, terrain, clouds }), setToggles(toggles), items(), summary(), credit(), dispose() }.
 * - clouds (optional): the cloud slabs' own heights when the view draws slabs (Fable review, 7 Oct): { key, column(u, v), topFt } where `column` stands in for the
 *   per-level `cloudColumnAt` (cloud-field.js `slabColumnAt`), `topFt` is the highest slab top (the satellite sheet's height, or null) and `key` changes when they do.
 * - weather: { radar, lightning, satellite } each null or { id, image, bbox, stale, on }, and { fronts } as fronts.js `frontsView` (status, data, words); see map.js `weather3d`.
 * - model (model-clouds.js, or null) and `hour`: the cloud levels and winds behind the heights and the flow.
 * - items(): the H and L marks to place: [{ el, point: { x, y, z }, kind }]. summary(): what is drawn, for the key.
 */
export function createWeather3dLayers({ T, scene, timers, win, labels, requestRender, reducedMotion }) {
  const root = new T.Group();
  root.name = 'weather-3d';
  scene.add(root);
  let toggles = { satellite: true, radar: true, lightning: true, fronts: true, flow: true };
  const built = {}; // name -> { key, layer }
  let marks = []; // the H and L labels
  let flowState = null; // { flow, layer, levels }
  let flowStop = null;
  let facts = { radar: null, lightning: null, satellite: null, fronts: null, flow: null };
  let shown = true;
  let sheetFade = 1;

  const canvasOf = (px) => {
    const c = win.document.createElement('canvas');
    c.width = px;
    c.height = px;
    return c;
  };

  /** Draws a picture onto a square canvas laid over the whole area (north at the top) and returns its pixels. */
  function readPicture(picture, projection, px) {
    const canvas = canvasOf(px);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    const k = px / AREA_FT;
    const half = AREA_FT / 2;
    const toPx = (lat, lon) => {
      const [x, y] = projection.toXY(lat, lon);
      return [(x + half) * k, (half - y) * k];
    };
    try {
      drawGeoImage(ctx, picture.image, picture.bbox, toPx, 1);
    } catch {
      return null; // a picture the map has just let go of: the next change draws the new one
    }
    return { canvas, ctx, image: ctx.getImageData(0, 0, px, px) };
  }

  function free(name) {
    const entry = built[name];
    if (!entry) return;
    entry.layer?.dispose?.();
    delete built[name];
  }

  function place(name, key, make) {
    if (built[name]?.key === key) return;
    free(name);
    const layer = make();
    if (layer) {
      root.add(layer.root);
      built[name] = { key, layer };
      layer.setOpacity?.(sheetFade);
    } else built[name] = { key, layer: null };
    applyVisible();
  }

  function applyVisible() {
    const on = (name) => shown && toggles[name] !== false;
    if (built.radar?.layer) built.radar.layer.root.visible = on('radar');
    if (built.lightning?.layer) built.lightning.layer.root.visible = on('lightning');
    if (built.satellite?.layer) built.satellite.layer.root.visible = on('satellite');
    if (built.fronts?.layer) built.fronts.layer.root.visible = on('fronts');
    if (flowState) flowState.layer.root.visible = on('flow');
    for (const m of marks) m.el.hidden = !on('fronts');
    syncFlowLoop();
  }

  // ---- The wind flow's loop ----------------------------------------------------------------------------------
  function syncFlowLoop() {
    const should = shown && toggles.flow !== false && flowState !== null;
    if (!should) {
      flowStop?.();
      flowStop = null;
      return;
    }
    if (flowStop) return;
    const move = (dtS) => {
      flowState.flow.step(dtS);
      flowState.layer.update();
      requestRender();
    };
    if (reducedMotion()) {
      flowStop = timers.every(FLOW_STEP_MS, () => move(FLOW_STEP_MS / 1000));
    } else {
      let waited = FLOW_FRAME_MS; // the first frame acts
      flowStop = timers.frame((dt) => {
        waited += dt;
        if (waited < FLOW_FRAME_MS) return;
        const step = Math.min(waited, 250) / 1000; // a stalled tab moves them no further than a quarter second
        waited = 0;
        move(step);
      });
    }
  }

  function buildFlowLayer({ model, hour, scale }) {
    const grids = WIND_LEVELS.map((hPa) => windGrid(model, hour, hPa)).filter((g) => g !== null);
    if (!grids.length) {
      facts.flow = null;
      return null;
    }
    const flow = createFlow(grids.map((grid) => ({ grid })), { count: FLOW_PARTICLES, sample: sampleWind });
    const layer = buildFlow(T, { flow, levels: grids.map((g) => ({ heightFt: g.heightFt })), scale });
    flowState = { flow, layer };
    facts.flow = { count: flow.particles.length, levels: grids.length };
    return layer;
  }

  function freeFlow() {
    flowStop?.();
    flowStop = null;
    flowState?.layer.dispose();
    flowState = null;
    delete built.flow;
    facts.flow = null;
  }

  function freeMarks() {
    for (const m of marks) m.el.remove();
    marks = [];
  }

  return {
    /** The layers, rebuilt only where what they are made from changed. See the factory's words. */
    update({ weather, model, hour, scale, groundFt, projection, terrain = null, clouds = null }) {
      const modelKey = model ? `${model.id}|${hour}|${clouds ? clouds.key : 'levels'}` : 'none';
      const common = `${scale}|${groundFt}|${projection.lat},${projection.lon}`;
      // The layers that stand on the ground (shafts, bolts, fronts) follow the real terrain when the view has it: `terrain` is { heightFt(x, y), key }, and they are made again
      // when its key changes (more tiles, the Terrain switch). The cloud sheets, satellite sheet and flow are at heights above sea level and ignore it.
      const standing = `${common}|${terrain ? terrain.key : 'flat'}`;
      const groundAt = terrain ? terrain.heightFt : null;
      const levels = model && !clouds ? cloudSheetLevels(model, hour) : [];
      const column = model && clouds ? clouds.column : (u, v) => cloudColumnAt(levels, u, v, groundFt);
      const cellsOf = (picture, accept) => {
        const read = readPicture(picture, projection, CELL_PX * CELL_SUPERSAMPLE);
        return read ? pictureCells(reduceToCells(read.image, CELL_SUPERSAMPLE, accept)) : null;
      };

      // Radar shafts
      const radar = weather.radar;
      const radarOn = Boolean(radar && radar.image && radar.on !== false && !radar.stale);
      place('radar', radarOn ? `${radar.id}|${modelKey}|${standing}` : 'off', () => {
        if (!radarOn) {
          facts.radar = null;
          return null;
        }
        const cells = cellsOf(radar);
        if (!cells) return null;
        const list = shafts(cells, { column, groundFt, ...(groundAt ? { groundAt } : {}) });
        facts.radar = { count: list.length, withModelTop: list.filter((s) => s.modelTop).length };
        return buildShafts(T, { shafts: list, scale });
      });

      // Lightning bolts: the lit cells of the 2D mark (its yellow fill), not its dark outline
      const lightning = weather.lightning;
      const lightningOn = Boolean(lightning && lightning.image && lightning.on !== false && !lightning.stale);
      place('lightning', lightningOn ? `${lightning.id}|${modelKey}|${standing}` : 'off', () => {
        if (!lightningOn) {
          facts.lightning = null;
          return null;
        }
        const cells = cellsOf(lightning, (r, g, b) => r > 200 && g > 150 && b < 100);
        if (!cells) return null;
        const list = bolts(cells, { column, groundFt, ...(groundAt ? { groundAt } : {}) });
        facts.lightning = { count: list.length };
        return buildBolts(T, { bolts: list, scale });
      });

      // The satellite sheet: at the highest model cloud level present (the highest slab top with slabs), else SATELLITE_DEFAULT_FT
      const sat = weather.satellite;
      const satOn = Boolean(sat && sat.image && sat.on !== false);
      const highest = model && clouds
        ? (clouds.topFt === null ? [] : [clouds.topFt])
        : levels.filter((l) => l.heightFt > groundFt && l.maxCover > CLOUD_COVER_THRESHOLD_PCT).map((l) => l.heightFt);
      const sheetFt = highest.length ? Math.max(...highest) : SATELLITE_DEFAULT_FT;
      place('satellite', satOn ? `${sat.id}|${sat.stale}|${Math.round(sheetFt)}|${common}` : 'off', () => {
        if (!satOn) {
          facts.satellite = null;
          return null;
        }
        const read = readPicture(sat, projection, SATELLITE_PX);
        if (!read) return null;
        const { data, drawn } = satellitePixels(read.image);
        facts.satellite = { heightFt: sheetFt, modelHeight: highest.length > 0, slabs: Boolean(model && clouds), drawn, stale: sat.stale === true };
        if (!drawn) return null;
        if (sat.stale) for (let n = 3; n < data.length; n += 4) data[n] = Math.round(data[n] * STALE_SHARE);
        read.ctx.putImageData(new win.ImageData(data, SATELLITE_PX, SATELLITE_PX), 0, 0);
        return buildSatelliteSheet(T, { canvas: read.canvas, heightFt: sheetFt, scale });
      });

      // The fronts
      const fronts = weather.fronts;
      const frontsOn = Boolean(fronts && fronts.status === 'ok' && fronts.data);
      place('fronts', frontsOn ? `${fronts.key}|${standing}` : 'off', () => {
        freeMarks();
        if (!frontsOn) {
          facts.fronts = null;
          return null;
        }
        const geometry = frontGeometry(fronts.data, { toXY: projection.toXY });
        marks = geometry.marks.map((m) => {
          const el = h('span', { class: `sof-3d-wx-mark is-${m.kind === 'H' ? 'high' : 'low'}`, title: m.kind === 'H' ? `High pressure centre, ${m.hPa} hPa` : `Low pressure centre, ${m.hPa} hPa` }, m.text);
          labels.append(el);
          return { el, kind: m.kind, point: { x: m.x, y: m.y, z: (groundAt ? groundAt(m.x, m.y) : groundFt) * scale + 900 } };
        });
        facts.fronts = { fronts: geometry.counts.fronts, drawn: geometry.counts.drawn, highs: geometry.marks.filter((m) => m.kind === 'H').length, lows: geometry.marks.filter((m) => m.kind === 'L').length, symbols: geometry.symbols.length };
        return buildFronts(T, { geometry, scale, groundFt, groundAt });
      });

      // The flow follows the model's winds at the hour shown
      const flowKey = model ? `${modelKey}|${common}` : 'none';
      if (built.flow?.key !== flowKey) {
        freeFlow();
        if (model) {
          const layer = buildFlowLayer({ model, hour, scale });
          if (layer) {
            root.add(layer.root);
            built.flow = { key: flowKey, layer };
          } else built.flow = { key: flowKey, layer: null };
        } else built.flow = { key: flowKey, layer: null };
      }
      applyVisible();
    },
    /** The view's toggles: { satellite, radar, lightning, fronts, flow } (a missing one is on). */
    setToggles(next) {
      toggles = { ...toggles, ...next };
      applyVisible();
    },
    /** The H and L marks, for view3d.js to place beside their points each frame. */
    items: () => marks,
    /** What is drawn, for the key: { radar, lightning, satellite, fronts, flow }, each null when not drawn. */
    summary: () => ({ ...facts }),
    /** The fronts' credit while they are drawn. */
    credit: () => (facts.fronts ? FRONTS_CREDIT : null),
    /**
     * The camera's zoom (relative to the start view, 1 is the whole square): the satellite sheet is a haze high over the ground, so it fades out as the camera comes in
     * close (full up to SHEET_FADE_START times, thinning to SHEET_FADE_MIN by four times that), and a close look at a circuit or a T-6 is clear. An estimate for the look.
     */
    setZoom(zoom) {
      const fade = Math.min(1, Math.max(SHEET_FADE_MIN, SHEET_FADE_START / Math.max(1, zoom)));
      if (fade !== sheetFade) {
        sheetFade = fade;
        built.satellite?.layer?.setOpacity?.(fade);
      }
    },
    /** Shown or hidden with the whole view (the loops stop while hidden). */
    setShown(on) {
      shown = on;
      applyVisible();
    },
    dispose() {
      freeFlow();
      for (const name of Object.keys(built)) free(name);
      freeMarks();
      root.removeFromParent();
    },
  };
}

/** The key's words for what the weather layers draw (the estimates named as estimates). `summary` is `createWeather3dLayers().summary()`; `scale` the height scale. */
export function weatherKeyWords(summary, scale) {
  const out = [];
  if (summary.satellite) {
    out.push(`Satellite: ECCC's GOES-West picture (day visible, night infrared) laid as a faint sheet where it is bright (cloud) at ${formatFeet(Math.round(summary.satellite.heightFt / 100) * 100)} ft${summary.satellite.modelHeight ? (summary.satellite.slabs ? ', the highest model cloud top' : ', the highest model cloud level') : ` (${formatFeet(SATELLITE_DEFAULT_FT)} ft where the model has no cloud: an estimate)`}.${summary.satellite.stale ? ' STALE: drawn fainter.' : ''}`);
  }
  if (summary.radar) {
    out.push(`Radar: a see-through column for each radar cell (about 5 NM), in the radar's colour, from the ground up to the model cloud base above it${summary.radar.withModelTop < summary.radar.count ? `, or ${formatFeet(RADAR_DEFAULT_AGL_FT)} ft above the ground where the model has no cloud (an estimate)` : ''}. ${summary.radar.count} drawn. Not drawn when the radar picture is stale.`);
  }
  if (summary.lightning) {
    out.push(`Lightning: a bolt for each lit lightning cell, from the ground to the model cloud top above it, or ${formatFeet(LIGHTNING_DEFAULT_AGL_FT)} ft above the ground where the model has none (an estimate). ${summary.lightning.count} drawn.`);
  }
  if (summary.fronts) {
    out.push(`Fronts: ${FRONTS_CREDIT}, so a front is only right to about a degree (60 NM). Line colours: cold blue with triangles, warm red with half circles, stationary alternating blue and red, occluded purple with both, trough dashed orange. The symbols stand on the side the bulletin does not give: taken from the way each kind usually moves across North America (a guess). A faint wall ${formatFeet(FRONT_WALL_FT)} ft tall stands along each (an estimate, ×${scale}). H and L are the bulletin's pressure centres in hPa.`);
  }
  if (summary.flow) {
    out.push(`Wind flow: ${summary.flow.count} faint streaks drifting with the model wind at 850, 700 and 500 hPa, at those levels' heights. Their speed follows the wind (${FLOW_FT_PER_S_PER_KT} ft a second for each knot, so 50 kt crosses the square in about 90 seconds: a picture of the flow, not its true speed; an estimate).`);
  }
  return out;
}
