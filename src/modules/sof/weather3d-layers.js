// The SOF 3D view's weather layers, put together (SOF-39, SOF-42; Dad, 7 Oct): radar blocks in the cloud with their rain curtains (Dad, 8 Oct), lightning bolts, the faint satellite sheet, the surface fronts with their pressure
// marks, and the gentle wind flow. view3d.js hands this the pictures, the model and the fronts as they change; this reads the pictures onto a grid, works out the heights from
// the model's clouds, builds the objects (weather3d.js), keeps each only as long as what it was built from is unchanged, and runs the wind flow's loop.
//
// Draws only on change, except the wind flow: its frame loop (the scheduler's, never setInterval) runs only while the layer is on, the view is shown and there is wind to show;
// with reduced motion the streaks step every FLOW_STEP_MS instead. Everything is freed on hide and on close (`dispose()`).
//
// Stale and failed data (SPEC-sof, "3D view"): radar shafts and lightning bolts are drawn only for a picture that is not stale (a stale precipitation column is never drawn as
// current); the satellite sheet follows the 2D layer: a stale picture is drawn fainter and the status line says STALE; a picture that failed leaves nothing. The fronts are
// fronts.js's: old or missing fronts are not drawn and the view says "Fronts unavailable".
//
// Radar with its real heights (SOF-67, V2.452): while NOAA MRMS answers (mrms-feed.js, a set no older than 20 minutes) the radar is drawn from it (radar3d.js: Performance
// columns to the measured echo tops, or High's see-through volume, drawn as nested shells since V2.453, SOF-69), cell by cell, never merged; the blocks in the model
// cloud below (SOF-56, SOF-57's merging) are the fallback when it cannot be had, and the key says why.
//
// NOAA's lightning strikes (SOF-71, V2.437; neon and fading with age since V2.438): a bolt for each strike of the last 30 minutes (map.js `weather3d().strikes`, from strikes-model.js), drawn as the ECCC
// bolts are (`bolts`, `buildBolts`), shown and hidden with the same Lightning switch. Not drawn when the strikes are not fresh (strikes-model.js decides).
import { h } from '../../ui-kit/dom.js';
import { drawGeoImage } from './map-draw.js';
import { AREA_FT } from './scene3d-model.js';
import { windGrid, sampleWind, cloudSheetLevels, cloudColumnAt, CLOUD_COVER_THRESHOLD_PCT } from './model-clouds.js';
import { formatFeet } from './scene3d-model.js';
import {
  CELL_PX, CELL_SUPERSAMPLE, SHAFT_MERGE_FT, SATELLITE_PX, SATELLITE_DEFAULT_FT, RADAR_DEFAULT_AGL_FT, LIGHTNING_DEFAULT_AGL_FT, FRONT_WALL_FT, FLOW_PARTICLES, FLOW_STEP_MS,
  FLOW_FT_PER_S_PER_KT, pictureCells, reduceToCells, shafts, bolts, satellitePixels, frontGeometry, createFlow,
} from './weather3d-model.js';
import { buildShafts, buildBolts, buildSatelliteSheet, buildFronts, buildFlow, BOLT_DRAWN_FT } from './weather3d.js';
import { buildRadarColumns, buildRadarVolume, CONTOUR_FT } from './radar3d.js';
import { performanceColumns, volumeColumns, northStrip, coverageMask, MIN_DRAW_DBZ, NORTH_WORDS, HIGH_SHELL_DBZ, PERFORMANCE_LOW_KM, kmToFt } from './mrms-model.js';
import { readTotalCloud } from './cloud-field.js';
import { CLOUD_SHEET_PX } from './model-clouds.js';
import { FRONTS_CREDIT } from './fronts.js';

/** The names the view's toggles use for these layers ('rain' is the radar blocks' rain curtains, "Rain to ground"). */
export const WEATHER_TOGGLES = Object.freeze(['satellite', 'radar', 'rain', 'lightning', 'fronts', 'flow']);
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
 *   `strikes` (SOF-71): null or { key, cells: [{ x, y, u, v }] }, NOAA's strikes of the last 30 minutes in the map's local feet, each with its age's strength `alpha` (strikes-model.js `strikeBoltCells`).
 * - model (model-clouds.js, or null) and `hour`: the cloud levels and winds behind the heights and the flow.
 * - items(): the H and L marks to place: [{ el, point: { x, y, z }, kind }]. summary(): what is drawn, for the key.
 */
export function createWeather3dLayers({ T, scene, timers, win, labels, requestRender, reducedMotion }) {
  const root = new T.Group();
  root.name = 'weather-3d';
  scene.add(root);
  let toggles = { satellite: true, radar: true, rain: true, lightning: true, fronts: true, flow: true };
  const built = {}; // name -> { key, layer }
  let marks = []; // the H and L labels
  let flowState = null; // { flow, layer, levels }
  let flowStop = null;
  let facts = { radar: null, lightning: null, strikes: null, satellite: null, fronts: null, flow: null };
  let shown = true;
  let sheetFade = 1;
  let heightsNow = null; // the radar heights' line as of the last update ("Radar heights: NOAA MRMS, 0508Z (3 min ago)"), for the key
  // The radar and lightning cells last read, one picture each: { key, cells }. A model-hour or terrain change re-works only the heights and the drawing, not the picture.
  const cellCache = { radar: null, lightning: null };
  // The radar blocks and lightning bolts last drawn (weather3d-model.js `shafts` and `bolts`, feet), for the approaches' corridor check (approaches-model.js); null when not drawn.
  const drawnLists = { radar: null, lightning: null };

  const canvasOf = (px) => {
    const c = win.document.createElement('canvas');
    c.width = px;
    c.height = px;
    return c;
  };

  /**
   * Draws a picture onto a square canvas laid over the whole area (north at the top) and returns its pixels. `smooth` false draws it pixel for pixel (nearest pixel,
   * no blending): the radar and lightning pictures keep their own palette colours, so neighbouring radar cells of the same colour can merge into one block (blending
   * made 60 and more in-between colours out of a 29-colour palette, Fable review 8 Oct 2026). The satellite and total-cloud pictures keep the smoothing.
   */
  function readPicture(picture, projection, px, { smooth = true } = {}) {
    const canvas = canvasOf(px);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = smooth;
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
    if (built.radar?.layer) {
      built.radar.layer.root.visible = on('radar');
      if (built.radar.layer.rain) built.radar.layer.rain.visible = toggles.rain !== false; // switched, never rebuilt
    }
    if (built.lightning?.layer) built.lightning.layer.root.visible = on('lightning');
    if (built.strikes?.layer) built.strikes.layer.root.visible = on('lightning'); // NOAA's strikes share the Lightning switch
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
      const cellsOf = (name, picture, accept) => {
        const key = `${picture.id}|${picture.bbox}|${projection.lat},${projection.lon}|${AREA_FT}`;
        if (cellCache[name]?.key === key) return cellCache[name].cells;
        const read = readPicture(picture, projection, CELL_PX * CELL_SUPERSAMPLE, { smooth: false });
        const cells = read ? pictureCells(reduceToCells(read.image, CELL_SUPERSAMPLE, accept)) : null;
        cellCache[name] = cells ? { key, cells } : null;
        return cells;
      };

      // The radar with its real heights from NOAA MRMS when it answers (SOF-67): Performance columns or High's volume, cell by cell, never merged. Else the
      // fallback below, labelled with why (mrms-feed.js `view`).
      const mrms = weather.mrms ?? null;
      const set = mrms?.set ?? null;
      heightsNow = mrms && mrms.state !== 'nosource' ? mrms.line.text : null;
      if (set) {
        // High's volume stands on the home field's ground, so new terrain tiles do not upload its 3D texture again; Performance's columns stand on the terrain.
        place('radar', `mrms|${set.id}|${set.mode === 'high' ? common : standing}`, () => {
          const ground = groundAt ?? (() => groundFt);
          const strip = northStrip(set.lat, set.lon, set.halfFt);
          const mask = coverageMask(set);
          let open = 0;
          for (let k = 0; k < mask.length; k++) open += mask[k] ? 0 : 1;
          const base = { mrms: true, mode: set.mode, time: set.time, notes: set.notes ?? [], line: mrms.line.text, cellKm: (2 * set.halfFt) / set.n / 3280.84, north: strip.share, gapShare: mask.length ? open / mask.length : 0 };
          if (set.mode === 'high') {
            drawnLists.radar = volumeColumns(set, { groundAt: ground });
            facts.radar = { ...base, count: drawnLists.radar.length, shares: set.shares, levelsKm: set.levelsKm, gaps: set.gaps };
            return buildRadarVolume(T, { set, scale, groundFt });
          }
          const { columns } = performanceColumns(set, { groundAt: ground });
          drawnLists.radar = columns;
          facts.radar = { ...base, count: columns.length, tall: columns.filter((c) => !c.flat).length, cores: columns.filter((c) => c.coreTopFt !== null).length, flats: columns.filter((c) => c.flat).length, aloft: columns.filter((c) => c.aloft).length, highestFt: columns.reduce((m, c) => Math.max(m, c.flat ? 0 : c.topFt), 0) };
          return buildRadarColumns(T, { columns, scale });
        });
      }

      // Fallback: radar blocks in the cloud, each with its rain curtain to the ground (always built; the "Rain to ground" switch shows or hides them)
      const radar = weather.radar;
      const radarOn = !set && Boolean(radar && radar.image && radar.on !== false && !radar.stale);
      if (!set) place('radar', radarOn ? `${radar.id}|${modelKey}|${standing}|${mrms?.line?.text ?? ''}` : 'off', () => {
        drawnLists.radar = null;
        if (!radarOn) {
          facts.radar = null;
          return null;
        }
        const cells = cellsOf('radar', radar);
        if (!cells) return null;
        const list = shafts(cells, { column, groundFt, ...(groundAt ? { groundAt } : {}) });
        drawnLists.radar = list;
        facts.radar = { count: list.length, cells: cells.length, blocks: list.length, withModelTop: list.filter((s) => s.modelTop).length, rain: list.filter((s) => s.rain).length };
        return buildShafts(T, { shafts: list, scale });
      });

      // Lightning bolts: the lit cells of the 2D mark (its yellow fill), not its dark outline
      const lightning = weather.lightning;
      const lightningOn = Boolean(lightning && lightning.image && lightning.on !== false && !lightning.stale);
      place('lightning', lightningOn ? `${lightning.id}|${modelKey}|${standing}` : 'off', () => {
        drawnLists.lightning = null;
        if (!lightningOn) {
          facts.lightning = null;
          return null;
        }
        const cells = cellsOf('lightning', lightning, (r, g, b) => r > 200 && g > 150 && b < 100);
        if (!cells) return null;
        const list = bolts(cells, { column, groundFt, ...(groundAt ? { groundAt } : {}) });
        drawnLists.lightning = list;
        facts.lightning = { count: list.length };
        return buildBolts(T, { bolts: list, scale });
      });

      // NOAA's lightning strikes (SOF-71): a neon bolt for each strike of the last 30 minutes, dimmer the older (V2.438), from the ground to the model cloud top above it.
      const strikes = weather.strikes ?? null;
      const strikesOn = Boolean(strikes && Array.isArray(strikes.cells) && strikes.cells.length);
      place('strikes', strikesOn ? `${strikes.key}|${modelKey}|${standing}` : 'off', () => {
        if (!strikesOn) {
          facts.strikes = null;
          return null;
        }
        const list = bolts(strikes.cells, { column, groundFt, max: strikes.cells.length, ...(groundAt ? { groundAt } : {}) }); // already newest first and capped (strikes-model.js MAX_STRIKE_BOLTS)
        facts.strikes = { count: list.length, strikes: strikes.cells.length };
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
    /** The view's toggles: { satellite, radar, rain, lightning, fronts, flow } (a missing one is on). */
    setToggles(next) {
      toggles = { ...toggles, ...next };
      applyVisible();
    },
    /** The H and L marks, for view3d.js to place beside their points each frame. */
    items: () => marks,
    /**
     * The HRDPS total-cloud picture ({ image, bbox }, map.js `weather3d().modelCloud`) drawn onto a CLOUD_SHEET_PX square over the area and read as percent for the cloud
     * slabs (cloud-field.js `readTotalCloud`: { px, percent }, row 0 south), or null when there is no picture or it cannot be drawn.
     */
    totalCloud(picture, projection) {
      if (!picture?.image || !picture.bbox) return null;
      const read = readPicture(picture, projection, CLOUD_SHEET_PX);
      return read ? readTotalCloud(read.image) : null;
    },
    /** What is drawn, for the key: { radar, lightning, strikes, satellite, fronts, flow }, each null when not drawn; the radar's says whether its rain curtains are shown (`rainShown`). */
    summary: () => ({ ...facts, radar: facts.radar ? { ...facts.radar, rainShown: toggles.rain !== false, line: heightsNow } : null }),
    /**
     * The radar blocks and lightning bolts as last built, for the approaches' corridor check: { radar: [block] | null, lightning: [bolt] | null } (null: not drawn,
     * because there is no fresh picture). They are built whatever the Radar and Lightning buttons show, so the check does not depend on what is switched on.
     */
    drawn: () => ({ radar: drawnLists.radar, lightning: drawnLists.lightning }),
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
      cellCache.radar = null;
      cellCache.lightning = null;
      drawnLists.radar = null;
      drawnLists.lightning = null;
      root.removeFromParent();
    },
  };
}

/**
 * The key's words for what the weather layers draw (the estimates named as estimates). `summary` is `createWeather3dLayers().summary()`; `scale` the height scale.
 * `satelliteWords` names the satellite picture (the site profile's `sources.satellite.keyWords`; ECCC's GOES-West at Moose Jaw, as before).
 */
export function weatherKeyWords(summary, scale, satelliteWords = "ECCC's GOES-West picture (day visible, night infrared)") {
  const out = [];
  if (summary.satellite) {
    out.push(`Satellite: ${satelliteWords} laid as a faint sheet where it is bright (cloud) at ${formatFeet(Math.round(summary.satellite.heightFt / 100) * 100)} ft${summary.satellite.modelHeight ? (summary.satellite.slabs ? ', the highest model cloud top' : ', the highest model cloud level') : ` (${formatFeet(SATELLITE_DEFAULT_FT)} ft where the model has no cloud: an estimate)`}.${summary.satellite.stale ? ' STALE: drawn fainter.' : ''}`);
  }
  if (summary.radar?.mrms) {
    out.push(...mrmsKeyWords(summary.radar, scale));
  } else if (summary.radar) {
    const r = summary.radar;
    const rain = r.rain ? (r.rainShown === false ? ' Rain to ground is off: the faint rain curtains under the blocks are hidden.' : ' Under each block a faint, streaked rain curtain reaches the ground (switch: Rain to ground); the radar does not say whether the precipitation reaches the ground (virga is not told apart).') : '';
    const bare = r.count - r.withModelTop;
    const noCloud = bare > 0 ? ` ${bare} with no model cloud here: drawn from the ground up to ${formatFeet(RADAR_DEFAULT_AGL_FT)} ft above it (an estimate).` : '';
    const merged = Number.isFinite(r.cells) ? `${r.cells} cells as ${r.blocks} blocks` : `${r.count} drawn`;
    out.push(`${r.line ? `${r.line}. ` : ''}Radar: a see-through block for each run of neighbouring radar cells with the same colour and cloud heights (a cell is about 5 NM; heights within ${formatFeet(SHAFT_MERGE_FT)} ft of each other, an estimate), in the radar's colour, standing in the model cloud over it, from the cloud's base to its top (the lowest model cloud there; a model estimate).${rain}${noCloud} ${merged}. Not drawn when the radar picture is stale.`);
  }
  if (summary.lightning) {
    out.push(`Lightning: a thin neon bolt for each lit lightning cell, drawn ${formatFeet(BOLT_DRAWN_FT)} ft up from the ground (Dad's choice; the approaches' check still counts it from the ground to the model cloud top, or ${formatFeet(LIGHTNING_DEFAULT_AGL_FT)} ft with none, an estimate). ${summary.lightning.count} drawn.`);
  }
  if (summary.strikes) {
    const s = summary.strikes;
    out.push(`Lightning strikes (NOAA NLDN via MRMS): a thin neon bolt for each cloud-to-ground strike of the last 30 minutes (each 0.01° cell with a strike, its middle), brightest for 5 minutes, dimmer to 15 and dimmest to 30 as the map's crosses, with a glow on the ground where it struck, drawn ${formatFeet(BOLT_DRAWN_FT)} ft up from the ground (Dad's choice). In-cloud lightning is not in it. ${s.count === s.strikes ? `${s.count} drawn` : `${s.count} of ${s.strikes} drawn (the newest)`}.`);
  }
  if (summary.fronts) {
    out.push(`Fronts: ${FRONTS_CREDIT}, so a front is only right to about a degree (60 NM). Line colours: cold blue with triangles, warm red with half circles, stationary alternating blue and red, occluded purple with both, trough dashed orange. The symbols stand on the side the bulletin does not give: taken from the way each kind usually moves across North America (a guess). A faint wall ${formatFeet(FRONT_WALL_FT)} ft tall stands along each (an estimate, ×${scale}). H and L are the bulletin's pressure centres in hPa.`);
  }
  if (summary.flow) {
    out.push(`Wind flow: ${summary.flow.count} faint streaks drifting with the model wind at 850, 700 and 500 hPa, at those levels' heights. Their speed follows the wind (${FLOW_FT_PER_S_PER_KT} ft a second for each knot, so 50 kt crosses the square in about 90 seconds: a picture of the flow, not its true speed; an estimate).`);
  }
  return out;
}

/** NOAA's dBZ colours in words (map-model.js legendItems' MRMS words). */
const DBZ_COLOUR_WORDS = "NOAA's dBZ colours: blue is light, then green, yellow and orange, red, and pink to purple is the strongest";
const pct = (share) => `${Math.round(share * 100)} %`;

/** The key's words for the radar with its real heights from NOAA MRMS (SOF-67): what is drawn, how, the estimates named, the gaps and the edge said. */
export function mrmsKeyWords(r, scale) {
  const out = [];
  const km = Math.round(r.cellKm * 10) / 10;
  if (r.line) out.push(`${r.line}.`);
  if (r.mode === 'high') {
    const seen = (r.levelsKm ?? []).map((k, l) => `${k} km ${r.shares?.[l] === null || r.shares?.[l] === undefined ? 'no data' : pct(r.shares[l])}`).join(', ');
    out.push(`Radar heights (High): NOAA MRMS reflectivity at ${r.levelsKm.length} heights (${r.levelsKm.join(', ')} km above sea level: an estimate for the levels), as one see-through volume over the square: every cell about ${km} km at every height, never merged, drawn as nested see-through shells where the echo reaches ${HIGH_SHELL_DBZ.slice(0, -1).join(', ')} and ${HIGH_SHELL_DBZ.at(-1)} dBZ, each in NOAA's colour for that strength (blue, green, yellow, red from the outside in): faint where a shell faces you, brighter at its outline, with faint lines every ${formatFeet(CONTOUR_FT)} ft above sea level (the strengths, opacities and lines are estimates). Echo from ${MIN_DRAW_DBZ} dBZ up to the first shell draws no shell; the flat radar picture on the ground shows it. The strength is smoothed a little across cells for drawing and blended between heights; the 1 km height is drawn down to the ground. Heights ×${scale}. Where MRMS sees each height (share of the square south of its 55° N edge): ${seen}.`);
  } else {
    out.push(`Radar heights (Performance): NOAA MRMS echo tops and composite reflectivity, cell by cell, never merged: each cell about ${km} km with an echo of ${MIN_DRAW_DBZ} dBZ or more (an estimate) is one see-through column from the ground to its measured 18 dBZ echo top (km above sea level), in ${DBZ_COLOUR_WORDS} for its strongest echo; a narrower, stronger core runs up to its 30 dBZ top. An echo weaker than 18 dBZ has no measured top and lies as a flat tile on the ground. Where MRMS sees ${PERFORMANCE_LOW_KM} km (${formatFeet(Math.round(kmToFt(PERFORMANCE_LOW_KM) / 100) * 100)} ft) above sea level and finds no echo there, the echo is aloft and may not reach the ground (virga): its column or tile starts at that height instead. ${r.count} cells: ${r.tall} with a top (highest ${formatFeet(Math.round(r.highestFt / 100) * 100)} ft), ${r.cores} with a 30 dBZ core, ${r.flats} flat, ${r.aloft} aloft. Heights ×${scale}.`);
  }
  for (const note of r.notes ?? []) out.push(`${note}.`);
  if (r.gapShare > 0) out.push(`Grey hatching on the ground: no MRMS radar coverage there (${pct(r.gapShare)} of the square${r.north > 0 ? ', the strip north of 55° N included' : ''}): not clear air, the radar cannot see it.`);
  if (r.north > 0) out.push(`${NORTH_WORDS}: the northern ${pct(r.north)} of the square, hatched darker on the ground with those words.`);
  out.push(`NOAA MRMS (Multi-Radar Multi-Sensor) merges every radar's tilts onto a 1 km grid every 2 minutes (US radars, and Canadian radars by a search summary, unchecked); read from NOAA's public bucket by our own GRIB2 reader. The flat radar picture on the ground is the map's own (its Layers menu).`);
  return out;
}
