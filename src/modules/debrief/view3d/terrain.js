// The Debrief 3D view's real ground (DB-27; Dad, 11 Oct 2026: "can you add the 3d terrain and satellite to the KML viewer on the 3d tab too"): the Ground choice "Terrain and
// satellite". Plain values, tested in Node; view.js draws them with the shared ui-kit terrain-tiles.js and draped-ground.js (the SOF's, SOF-64), and core/terrain.js does the
// decoding, grids, stitching and shading. This file holds only what is the Debrief's: the area round the flight, how the tiles' heights are matched to the tracks, and the words.
//
// The area: two squares on the middle of the flight's box. The inner one covers the box and INNER_MARGIN_NM more each way (at least MIN_INNER_NM, at most MAX_INNER_NM across), with
// the finer terrain and the sharper satellite picture; the outer one reaches OUTER_MARGIN_NM beyond it, coarser, so the overview and the cockpit's horizon have ground under them.
// The zooms are the finest whose tiles stay under each tier's cap (TILE_CAPS), so a small sortie gets sharper ground than a long cross-country.
//
// Heights: the tiles' heights are above sea level; the tracks' GPS heights carry the receivers' own bias (on the example flight the ground fixes read about 1,874 ft at Moose Jaw;
// DB-26 put the ground at 1,868 ft after the 6.2 ft to the wheels). So the whole terrain is moved by one shift: the tracks' ground less the terrain's height under the ground fixes'
// middle, the same idea as DB-26's shift of the runways. Parked and taxiing aircraft then sit on it. Under each drawn runway the terrain is laid flat just below the runway, so
// the runway never sinks into a tile's bump or flickers against it (RUNWAY_BED_FT). Where a tile never came the ground is flat at the tracks' ground.
// For a picture only: no number, verdict or readout uses this ground.
import { zoomForTiles, holeFor, sampleGrid, stitchInner } from '../../../core/terrain.js';
import { localFtToLatLon, latLonToLocalFt } from '../../../core/geo.js';
import { FT_PER_NM } from '../../../core/units.js';
import { runwayGeometry } from '../../../ui-kit/airfield3d.js';
import { flightBounds } from '../state.js';

/** The inner square reaches this far beyond the flight's box each way, NM (an estimate: room to see where the sortie went). */
export const INNER_MARGIN_NM = 8;
/** The inner square is at least this, and at most this, across, NM (estimates: a pattern-only flight still gets some country; a long cross-country gets its middle sharp). */
export const MIN_INNER_NM = 30;
export const MAX_INNER_NM = 150;
/** The outer square reaches this far beyond the inner one each way, NM (an estimate: about the horizon from 2,000 ft AGL, 50 NM, plus room for the overview). */
export const OUTER_MARGIN_NM = 60;
/** The inner grid's cells a side and how many outer cells it covers (8 inner to an outer cell). With a 30 to 150 NM patch, a cell is 350 to 1,780 ft. */
export const INNER_CELLS = 512;
export const HOLE_CELLS = 64;
/**
 * Tile caps per tier (estimates for speed and courtesy to the hosts, under the shared MAX_TERRAIN_TILES of 100 and the tile layer's 64 a tier): terrain 30 outer and 49 inner,
 * satellite 36 outer and 49 inner. Zoom ranges keep the pictures sensible: terrain no finer than zoom 11 (about 50 m a pixel at 50 N, finer than the grid), satellite up to 14.
 */
export const TILE_CAPS = Object.freeze({
  terrain: Object.freeze({ outer: Object.freeze({ maxTiles: 30, minZoom: 5, maxZoom: 9 }), inner: Object.freeze({ maxTiles: 49, minZoom: 7, maxZoom: 11 }) }),
  imagery: Object.freeze({ outer: Object.freeze({ maxTiles: 36, minZoom: 5, maxZoom: 10 }), inner: Object.freeze({ maxTiles: 49, minZoom: 7, maxZoom: 14 }) }),
});
/** The satellite canvases: 1,024 px over the outer square and 2,048 px over the inner one (about 200 ft a pixel over 70 NM). Estimates for memory and speed. */
export const CANVAS_PX = Object.freeze({ outer: 1024, inner: 2048 });
/**
 * The field patch: a still sharper satellite picture about FIELD_PATCH_NM square round where the aircraft sat on the ground (the home field's ramp), so the runways, taxiways and
 * pattern read in the overview zoomed in and in Chase. 2,048 px over 5 NM is about 15 ft a pixel, about Esri zoom 14 at 50 N (at most 49 tiles). Estimates for the look.
 */
export const FIELD_PATCH_NM = 5;
export const FIELD_PATCH = Object.freeze({ px: 2048, maxTiles: 49, minZoom: 10, maxZoom: 16 });
/** Under a drawn runway the terrain lies this far below it (feet), so the runway's paint is always on top (an estimate; the runway itself is 0.5 ft over its level, DB-26). */
export const RUNWAY_BED_FT = 1;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ftWords = (v) => `${Math.round(v).toLocaleString('en-US')} ft`;
const nmWords = (ft) => `${Math.round(ft / FT_PER_NM)} NM`;

/**
 * The area round a flight: { key, centre: { x, y } (map feet), lat, lon, plan, imagery, counts } or null with no flight. `plan` is the shared terrain-tiles/draped-ground plan
 * (squares centred on `centre`), `imagery` the satellite canvases and their finest zooms, `counts` how many terrain and satellite tiles each tier asks for (at most).
 */
export function terrainArea(flight) {
  const b = flightBounds(flight);
  if (!b || !flight?.ref) return null;
  const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const innerFt = Math.min(MAX_INNER_NM * FT_PER_NM, Math.max(MIN_INNER_NM * FT_PER_NM, span + 2 * INNER_MARGIN_NM * FT_PER_NM));
  const cellFt = innerFt / HOLE_CELLS;
  const ring = Math.ceil((OUTER_MARGIN_NM * FT_PER_NM) / cellFt);
  const outerCells = HOLE_CELLS + 2 * ring;
  const outerFt = outerCells * cellFt;
  const toLatLon = (x, y) => localFtToLatLon(flight.ref, x + centre.x, y + centre.y);
  const box = (sizeFt) => {
    const h = sizeFt / 2;
    const p = [[-h, -h], [-h, h], [h, -h], [h, h]].map(([x, y]) => toLatLon(x, y));
    return { north: Math.max(...p.map((q) => q.lat)), south: Math.min(...p.map((q) => q.lat)), west: Math.min(...p.map((q) => q.lon)), east: Math.max(...p.map((q) => q.lon)) };
  };
  const [outerBox, innerBox] = [box(outerFt), box(innerFt)];
  const tOuter = zoomForTiles(outerBox, TILE_CAPS.terrain.outer);
  const tInner = zoomForTiles(innerBox, TILE_CAPS.terrain.inner);
  const iOuter = zoomForTiles(outerBox, TILE_CAPS.imagery.outer);
  const iInner = zoomForTiles(innerBox, TILE_CAPS.imagery.inner);
  const { lat, lon } = toLatLon(0, 0);
  return {
    key: `${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(innerFt)}`,
    centre,
    lat,
    lon,
    toLatLon,
    plan: {
      outer: { sizeFt: outerFt, cells: outerCells, zoom: tOuter.zoom },
      inner: { sizeFt: innerFt, cells: INNER_CELLS, zoom: tInner.zoom },
      hole: holeFor({ outerSizeFt: outerFt, outerCells, innerSizeFt: innerFt }),
    },
    imagery: { outer: { px: CANVAS_PX.outer, maxZoom: iOuter.zoom }, inner: { px: CANVAS_PX.inner, maxZoom: iInner.zoom } },
    counts: {
      terrain: tOuter.tiles.length + tInner.tiles.length,
      imagery: iOuter.tiles.length + iInner.tiles.length,
    },
  };
}

/**
 * The field patch for an area: a square of the inner grid's own cells (so its mesh lies exactly on the ground's) round the ground fixes' middle (`ground.x`, `ground.y`), or the
 * flight's start when the tracks gave no ground; kept inside the inner square. { i0, j0, cells, sizeFt, centre: { x, y } (feet from the area's centre), imagery: { px, maxZoom } }.
 */
export function fieldPatch(area, ground, firstFix = null) {
  const { inner } = area.plan;
  const cellFt = inner.sizeFt / inner.cells;
  const cells = Math.min(inner.cells, Math.max(2, Math.round((FIELD_PATCH_NM * FT_PER_NM) / cellFt)));
  const at = isNum(ground?.x) && isNum(ground?.y) ? ground : firstFix && isNum(firstFix.x) && isNum(firstFix.y) ? firstFix : area.centre;
  const clampI = (v) => Math.max(0, Math.min(inner.cells - cells, v));
  const i0 = clampI(Math.round((at.x - area.centre.x + inner.sizeFt / 2) / cellFt - cells / 2));
  const j0 = clampI(Math.round((at.y - area.centre.y + inner.sizeFt / 2) / cellFt - cells / 2));
  const sizeFt = cells * cellFt;
  const centre = { x: -inner.sizeFt / 2 + (i0 + cells / 2) * cellFt, y: -inner.sizeFt / 2 + (j0 + cells / 2) * cellFt };
  const toLatLon = area.toLatLon;
  const h = sizeFt / 2;
  const p = [[-h, -h], [-h, h], [h, -h], [h, h]].map(([x, y]) => toLatLon(centre.x + x, centre.y + y));
  const box = { north: Math.max(...p.map((q) => q.lat)), south: Math.min(...p.map((q) => q.lat)), west: Math.min(...p.map((q) => q.lon)), east: Math.max(...p.map((q) => q.lon)) };
  const pick = zoomForTiles(box, FIELD_PATCH);
  return { i0, j0, cells, sizeFt, centre, imagery: { px: FIELD_PATCH.px, maxZoom: pick.zoom }, tiles: pick.tiles.length };
}

/** The projection the shared ground code is handed: lat/lon to feet from the area's centre and back (the flight's own map feet, moved to the centre). */
export function areaProjection(flight, area) {
  return {
    lat: area.lat,
    lon: area.lon,
    toXY: (lat, lon) => {
      const p = /** @type {{ x: number, y: number }} */ (latLonToLocalFt(flight.ref, lat, lon));
      return [p.x - area.centre.x, p.y - area.centre.y];
    },
    toLatLon: area.toLatLon,
  };
}

/**
 * How far the tiles' heights are moved to match the tracks (feet): the tracks' ground (`ground`, ground.js groundLevel) less the terrain's own height under the ground fixes'
 * middle, read from the raw grids (feet from the area's centre). { shiftFt, tileFt } or { shiftFt: 0, tileFt: null } when the tracks gave no ground or the tile there hasn't come.
 */
export function terrainShift(grids, area, ground) {
  if (!grids || !area || ground?.source !== 'tracks' || !isNum(ground.x) || !isNum(ground.y)) return { shiftFt: 0, tileFt: null };
  const x = ground.x - area.centre.x;
  const y = ground.y - area.centre.y;
  const h = area.plan.inner.sizeFt / 2;
  const s = sampleGrid(Math.abs(x) <= h && Math.abs(y) <= h ? grids.inner : grids.outer, x, y);
  if (!s.known) return { shiftFt: 0, tileFt: null };
  return { shiftFt: ground.groundFt - s.ft, tileFt: s.ft };
}

/**
 * The runways' beds: for each drawn airfield's runway, its rectangle (feet from the area's centre) and the height the terrain is laid at under it: the runway's own level
 * (its field's elevation moved by DB-26's shift, `shiftFt`, or `fieldFt` without an elevation, as ui-kit airfield3d.js draws it) less RUNWAY_BED_FT.
 */
export function runwayBeds(airfields, { toXY, shiftFt = 0, fieldFt, centre }) {
  const out = [];
  for (const a of airfields ?? []) {
    const level = (isNum(a?.elevationFt) ? a.elevationFt + shiftFt : fieldFt) - RUNWAY_BED_FT;
    for (const r of a?.runways ?? []) {
      const g = runwayGeometry(r, toXY);
      if (!g) continue;
      out.push({ cx: g.cx - centre.x, cy: g.cy - centre.y, cos: Math.cos(g.angle), sin: Math.sin(g.angle), halfLen: g.lengthFt / 2, halfWid: g.widthFt / 2, ft: level });
    }
  }
  return out;
}

/** Lays a grid flat at each bed's height over the runway and one cell round it, so every triangle under the runway is flat (changes `grid.ft`). */
function layBeds(grid, beds) {
  const m = grid.cellFt;
  for (const bed of beds) {
    const reach = Math.hypot(bed.halfLen, bed.halfWid) + m;
    const i0 = Math.max(0, Math.floor((bed.cx - reach + grid.half) / grid.cellFt));
    const i1 = Math.min(grid.cells, Math.ceil((bed.cx + reach + grid.half) / grid.cellFt));
    const j0 = Math.max(0, Math.floor((bed.cy - reach + grid.half) / grid.cellFt));
    const j1 = Math.min(grid.cells, Math.ceil((bed.cy + reach + grid.half) / grid.cellFt));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = -grid.half + i * grid.cellFt - bed.cx;
        const dy = -grid.half + j * grid.cellFt - bed.cy;
        const u = dx * bed.cos + dy * bed.sin;
        const v = -dx * bed.sin + dy * bed.cos;
        if (Math.abs(u) <= bed.halfLen + m && Math.abs(v) <= bed.halfWid + m) grid.ft[j * grid.n + i] = bed.ft;
      }
    }
  }
}

/**
 * The grids as drawn: each known height moved by `shiftFt`, each unknown one at `flatFt` (the tracks' ground), the runways' beds laid, and the inner edge matched to the outer
 * mesh again. `into` (a previous result for the same area) is reused. Returns { outer, inner }, the same shape as the raw grids (core/terrain.js createGrid).
 */
export function drawnGrids(raw, { shiftFt, flatFt, beds = [], hole, into = null }) {
  const out = into ?? {
    outer: { ...raw.outer, ft: new Float32Array(raw.outer.ft.length), known: new Uint8Array(raw.outer.known.length) },
    inner: { ...raw.inner, ft: new Float32Array(raw.inner.ft.length), known: new Uint8Array(raw.inner.known.length) },
  };
  for (const part of ['outer', 'inner']) {
    const src = raw[part];
    const dst = out[part];
    for (let i = 0; i < src.ft.length; i++) {
      dst.known[i] = src.known[i];
      dst.ft[i] = src.known[i] ? src.ft[i] + shiftFt : flatFt;
    }
    layBeds(dst, beds);
  }
  stitchInner(out.inner, out.outer, hole);
  return out;
}

/** The drawn ground's height at a point (feet from the area's centre), feet: the inner grid inside its square, else the outer. */
export function drawnHeightFt(grids, area, x, y) {
  const h = area.plan.inner.sizeFt / 2;
  return sampleGrid(Math.abs(x) <= h && Math.abs(y) <= h ? grids.inner : grids.outer, x, y).ft;
}

/**
 * What 3D settings says about the terrain: `tiles` and `imagery` are the shared loaders' states ({ wanted, ready, failed, pending } and { outer, inner } of { wanted, ready,
 * failed }), `shift` terrainShift's, `groundFt` the tracks' ground, `ms` how long the build took once settled (null while loading).
 */
export function terrainStatusWords({ area, tiles, imagery, shift, groundFt, ms = null, patch = null }) {
  if (!area) return '';
  const parts = [];
  const flat = `flat at the tracks' ground, ${ftWords(groundFt)}`;
  if (tiles.wanted && tiles.ready === 0 && tiles.failed > 0 && tiles.pending === 0) parts.push(`Terrain unavailable (the elevation tiles didn't load): the ground is ${flat}.`);
  else if (tiles.pending > 0 || !tiles.wanted) parts.push(`Terrain loading: ${tiles.ready} of ${tiles.wanted || area.counts.terrain} elevation tiles so far; the rest is ${flat} until it arrives.`);
  else {
    const { outer, inner } = area.plan;
    const sat = imagery ? imagery.outer.ready + imagery.inner.ready + (imagery.patch?.ready ?? 0) : 0;
    const patchWords = patch ? `, and a sharper satellite picture over ${nmWords(patch.sizeFt)} round the field (zoom ${patch.imagery.maxZoom})` : '';
    parts.push(`Terrain: ${tiles.ready} elevation tiles, zoom ${outer.zoom} over ${nmWords(outer.sizeFt)} square and zoom ${inner.zoom} over the flight's ${nmWords(inner.sizeFt)}${patchWords}; ${sat} satellite tiles${ms !== null ? `; built in ${(ms / 1000).toFixed(1)} s` : ''}.`);
    if (tiles.failed > 0 || tiles.capped) parts.push(`${tiles.failed} tiles didn't load${tiles.capped ? ' (some were over the tile cap)' : ''}: those parts are ${flat}.`);
  }
  if (shift?.tileFt !== null && shift?.tileFt !== undefined) {
    const n = Math.round(shift.shiftFt);
    parts.push(`Terrain shifted ${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('en-US')} ft to match the tracks (the tiles read ${ftWords(shift.tileFt)} under the ground fixes, the tracks ${ftWords(groundFt)}).`);
  } else if (tiles.ready > 0) parts.push('Terrain not shifted: the tracks gave no ground to match it to.');
  const lost = (s) => s.wanted > 0 && s.failed === s.wanted;
  if (imagery) {
    const all = [imagery.outer, imagery.inner, ...(imagery.patch ? [imagery.patch] : [])];
    const sum = (k) => all.reduce((n, s) => n + s[k], 0);
    if (lost(imagery.outer) && all.every((s) => lost(s) || !s.wanted)) parts.push('Satellite picture unavailable (its tiles didn\'t load): plain ground shown.');
    else if (sum('ready') + sum('failed') < sum('wanted')) parts.push(`Satellite loading: ${sum('ready')} of ${sum('wanted')} tiles.`);
    else if (sum('failed') > 0) parts.push(`${sum('failed')} satellite tiles didn't load: plain ground or a coarser picture there.`);
  }
  return parts.join(' ');
}
