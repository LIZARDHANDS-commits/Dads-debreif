// The real ground for the SOF's 3D view, worked out without a page (SPEC-sof, "3D view"; Dad, 7 Oct: "real terrain"). Pure: numbers in, numbers out.
// The elevation comes from the public Terrarium tiles (AWS Open Data, Mapzen terrain tiles: USGS, NRCan and others). Each tile is a 256 x 256 picture whose red, green and blue
// bytes hold the height in metres: (R x 256 + G + B / 256) - 32768 (the tiles' own published encoding). terrain3d.js fetches and decodes the pictures; this file keeps what
// was decoded, samples it onto the two grids the ground is drawn on, and shades it.
//
// The ground is two height-mapped meshes (ground3d.js): an outer grid over the whole 3D square (450 NM by default) and a finer one over the inner patch round home that has the sharp satellite
// picture. The inner patch sits in a hole of the outer mesh and its edge heights are matched to the outer ones, so the two never cross or leave a crack. A tile that has not
// come (or never will) leaves its part of the grid flat at the home field's elevation.
import { FT_PER_M } from '../../core/units.js';
import { lonLatToWorldPixel } from '../../core/geo.js';
// The tile address, decoding and store are shared with Traffic's 3D ground (src/core/terrain-tiles.js, TR-117); re-exported here so the SOF's files are unchanged.
import { TERRAIN_URL, TERRAIN_CREDIT, TILE_PX, PLAUSIBLE_M, decodeTerrarium, tilesCovering, createHeightStore } from '../../core/terrain-tiles.js';
export { TERRAIN_URL, TERRAIN_CREDIT, TILE_PX, PLAUSIBLE_M, decodeTerrarium, tilesCovering, createHeightStore };
import { AREA_NM } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

/**
 * The tile zooms at 450 NM: zoom 7 over the whole square (about 790 m a pixel at 50 N), zoom 9 over the sharp patch (about 125 m a pixel). Zooms chosen for the look and the
 * tile count. A bigger 3D area takes a coarser outer zoom (TERRAIN_PLANS).
 */
export const TERRAIN_ZOOM = Object.freeze({ outer: 7, inner: 9 });
/** The most terrain tiles asked for in all (about 30 outer and 30 inner are needed); any beyond are not asked for and that part stays flat. A cap for speed and courtesy to the host. */
export const MAX_TERRAIN_TILES = 100;

/** The inner patch's width in NM (the sharp satellite picture's, ground3d.js) and its grid's cells: 120 / 256 = 0.47 NM a cell. */
export const INNER_NM = 120;
export const INNER_FT = INNER_NM * FT_PER_NM;
export const INNER_CELLS = 256;
/**
 * The outer grid and its terrain zoom for each 3D area choice (scene3d-model.js AREA_CHOICES_NM; Dad, 8 Oct 2026). The inner patch must cover a whole number of outer cells that
 * divides its own 256 (so the two meshes meet edge to edge, `stitchInner`):
 * - 450 NM: 240 cells (1.875 NM each; the patch is 64 of them), zoom 7: 25 outer tiles at Moose Jaw, 16 at Laughlin (as before);
 * - 600 NM: 320 cells (1.875 NM; the patch is 64), zoom 6 (about 1.6 km a pixel at 50 N, still finer than a 3.5 km cell): 12 outer tiles at Moose Jaw, 9 at Laughlin,
 *   where zoom 7 would need 42 and 30;
 * - 900 NM: 240 cells (3.75 NM; the patch is 32), zoom 6: 25 outer tiles at Moose Jaw, 20 at Laughlin, where zoom 7 would need 90 and 56 (90 and the patch's 36 is
 *   over MAX_TERRAIN_TILES).
 * Counted 8 Oct 2026 with `tilesCovering` over each square. The patch round home is zoom 9 at every area (36 tiles at Moose Jaw, 16 at Laughlin).
 * The zooms are chosen for the tile count, an estimate; the cells' sizes follow from the patch.
 */
export const TERRAIN_PLANS = Object.freeze({
  450: Object.freeze({ outerCells: 240, outerZoom: 7 }),
  600: Object.freeze({ outerCells: 320, outerZoom: 6 }),
  900: Object.freeze({ outerCells: 240, outerZoom: 6 }),
});
/** About how much ground a terrain tile's pixel covers at 50 N, in words, by zoom. */
const ZOOM_PIXEL_WORDS = Object.freeze({ 6: 'about 1.6 km', 7: 'about 790 m', 9: 'about 125 m' });

/**
 * The outer grid for the 3D area in force (scene3d-model.js AREA_NM): { outerCells, outerZoom, holeCells, holeFrom }. The inner patch covers `holeCells` outer cells a side (120 NM
 * over 1.875 NM = 64 at 450 NM) and starts `holeFrom` cells in from the outer edge ((240 - 64) / 2); the outer mesh has no triangles there.
 */
export function terrainPlan(areaNm = AREA_NM) {
  const plan = TERRAIN_PLANS[areaNm] ?? TERRAIN_PLANS[450];
  const holeCells = Math.round(INNER_NM / (areaNm / plan.outerCells));
  return { ...plan, holeCells, holeFrom: (plan.outerCells - holeCells) / 2 };
}

/** Hill shading, so the relief reads on a picture that is lit flat (the satellite picture is not lit by the scene): sun from the north-west, 45 degrees up, as a map's hill shade. */
const SUN = Object.freeze({ lx: -Math.SQRT1_2, ly: Math.SQRT1_2, cot: 1 }); // cot(45 deg) = 1
/** The slopes are exaggerated again for the shading only, so low prairie relief shows; an estimate for the look. */
export const SHADE_GAIN = 4;
export const SHADE_LIMITS = Object.freeze([0.55, 1.3]);

/**
 * A square grid of vertices over `sizeFt`, centred on home, `cells` a side: where each vertex stands (feet east and north of home) and, for each tile zoom, the pixel of the world
 * picture it falls on (so a height is a lookup, not a projection each time). `toLatLon(x, y)` is the map projection's. `ft` is each vertex's height in feet above sea level and
 * `known` is 1 where a tile gave it (0: flat at home's elevation). Row 0 is the south edge, column 0 the west edge.
 */
export function createGrid({ cells, sizeFt, toLatLon, zooms = [TERRAIN_ZOOM.inner, terrainPlan().outerZoom] }) {
  const n = cells + 1;
  const half = sizeFt / 2;
  const cellFt = sizeFt / cells;
  const pixels = zooms.map((z) => ({ z, px: new Float64Array(n * n), py: new Float64Array(n * n) }));
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const ll = toLatLon(-half + ix * cellFt, -half + iy * cellFt);
      const i = iy * n + ix;
      for (const level of pixels) {
        const p = lonLatToWorldPixel(ll.lon, ll.lat, level.z);
        level.px[i] = p.x;
        level.py[i] = p.y;
      }
    }
  }
  return { cells, n, sizeFt, half, cellFt, pixels, ft: new Float32Array(n * n), known: new Uint8Array(n * n) };
}

/** Fills a grid's heights from the store: the finest zoom that has the vertex's tile wins, else the next; none leaves `homeFt` and `known` 0. Returns how many vertices are known. */
export function fillGrid(grid, store, homeFt) {
  let known = 0;
  for (let i = 0; i < grid.ft.length; i++) {
    let metres = NaN;
    for (const level of grid.pixels) {
      metres = store.metresAtPixel(level.z, level.px[i], level.py[i]);
      if (!Number.isNaN(metres)) break;
    }
    if (Number.isNaN(metres)) {
      grid.ft[i] = homeFt;
      grid.known[i] = 0;
    } else {
      grid.ft[i] = metres * FT_PER_M;
      grid.known[i] = 1;
      known += 1;
    }
  }
  return known;
}

/**
 * Makes the inner grid's edge agree with the outer mesh along the hole's border, so the two meshes meet with no crack: an inner edge vertex that stands on an outer vertex takes
 * its height exactly, and one between two takes the straight line between them (which is what the outer mesh's edge is).
 */
export function stitchInner(inner, outer) {
  const { holeCells, holeFrom } = terrainPlan();
  const ratio = INNER_CELLS / holeCells; // inner cells to an outer cell (4 at 450 NM, 8 at 900)
  const outerAt = (ox, oy) => oy * outer.n + ox;
  const edge = (ix, iy) => {
    // The outer vertices either side of this inner vertex along the border it is on.
    const gx = holeFrom + ix / ratio;
    const gy = holeFrom + iy / ratio;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.ceil(gx);
    const y1 = Math.ceil(gy);
    const t = x0 === x1 ? gy - y0 : gx - x0;
    const a = outerAt(x0, y0);
    const b = outerAt(x1, y1);
    const i = iy * inner.n + ix;
    inner.ft[i] = outer.ft[a] + (outer.ft[b] - outer.ft[a]) * t;
    inner.known[i] = outer.known[a] && outer.known[b] ? 1 : 0;
  };
  for (let k = 0; k <= INNER_CELLS; k++) {
    edge(k, 0);
    edge(k, INNER_CELLS);
    if (k > 0 && k < INNER_CELLS) {
      edge(0, k);
      edge(INNER_CELLS, k);
    }
  }
}

/** A grid's height at a point in feet from home, bilinear between its vertices (clamped to the grid), and whether the nearest vertex came from a tile. Returns { ft, known }. */
export function sampleGrid(grid, x, y) {
  const gx = Math.min(grid.cells, Math.max(0, (x + grid.half) / grid.cellFt));
  const gy = Math.min(grid.cells, Math.max(0, (y + grid.half) / grid.cellFt));
  const x0 = Math.min(grid.cells - 1, Math.floor(gx));
  const y0 = Math.min(grid.cells - 1, Math.floor(gy));
  const tx = gx - x0;
  const ty = gy - y0;
  const i = y0 * grid.n + x0;
  const f = grid.ft;
  const ft = (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + grid.n] * (1 - tx) + f[i + grid.n + 1] * tx) * ty;
  return { ft, known: grid.known[(ty < 0.5 ? y0 : y0 + 1) * grid.n + (tx < 0.5 ? x0 : x0 + 1)] === 1 };
}

/**
 * Hill shading for a grid's vertices: a brightness near 1 (flat ground is exactly 1) that the satellite picture is multiplied by, lighter on slopes that face the sun (north-west)
 * and darker on those that face away. `scale` is the height scale, since the ground is drawn with its heights times it. Returns a Float32Array, one brightness a vertex.
 */
export function hillshade(grid, scale) {
  const out = new Float32Array(grid.ft.length);
  const n = grid.n;
  const f = grid.ft;
  const k = (scale * SHADE_GAIN) / (2 * grid.cellFt);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const e = f[iy * n + Math.min(n - 1, ix + 1)];
      const w = f[iy * n + Math.max(0, ix - 1)];
      const nn = f[Math.min(n - 1, iy + 1) * n + ix];
      const s = f[Math.max(0, iy - 1) * n + ix];
      const gx = (e - w) * k;
      const gy = (nn - s) * k;
      // A slope that rises to the east (gx > 0) faces west, towards a sun in the north-west (lx < 0), so it comes out lighter.
      const b = 1 - SUN.cot * (gx * SUN.lx + gy * SUN.ly);
      out[iy * n + ix] = Math.min(SHADE_LIMITS[1], Math.max(SHADE_LIMITS[0], b));
    }
  }
  return out;
}

/** The words for how much of the terrain has come, for the key: { ready, failed, wanted } tiles. */
export function terrainWords({ wanted = 0, ready = 0, failed = 0, pending = 0 } = {}, { on = true, tilesCapped = false } = {}) {
  if (!on) return 'Terrain is off: the ground is drawn flat at home’s elevation.';
  if (wanted === 0) return 'Terrain: waiting for the map.';
  if (ready === 0 && failed > 0 && pending === 0) return 'Terrain unavailable: the ground is flat at home’s elevation.';
  if (failed > 0 || tilesCapped) return `Terrain partly unavailable: ${failed} of ${wanted} tiles did not come${tilesCapped ? ' (some were over the tile cap)' : ''}, so those parts are flat at home’s elevation.`;
  if (pending > 0) return `Terrain loading: ${ready} of ${wanted} tiles so far; the rest is flat until it arrives.`;
  const { outerZoom } = terrainPlan();
  return `Terrain: ${ready} elevation tiles, zoom ${outerZoom} (${ZOOM_PIXEL_WORDS[outerZoom]} a pixel) over the whole ${AREA_NM} NM square and zoom ${TERRAIN_ZOOM.inner} (${ZOOM_PIXEL_WORDS[TERRAIN_ZOOM.inner]}) round home.`;
}
