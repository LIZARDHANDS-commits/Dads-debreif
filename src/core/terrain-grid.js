// The height grids a 3D view's real ground is drawn from, worked out without a page: shared by the SOF's 3D terrain (SPEC-sof, "3D view"; Dad, 7 Oct: "real terrain") and
// the Debrief's "Terrain and satellite" ground (DB-27; Dad, 11 Oct 2026: "can you add the 3d terrain and satellite to the KML viewer on the 3d tab too"). Pure: numbers in,
// numbers out. Moved here from the SOF's terrain-model.js (SOF-65); the tile address, decoding and height store it reads are src/core/terrain-tiles.js (TR-117), not copied.
//
// The ground is two height-mapped meshes (ui-kit draped-ground.js): an outer grid over the whole area and a finer one over an inner patch that has the sharp satellite picture.
// The inner patch sits in a hole of the outer mesh and its edge heights are matched to the outer ones, so the two never cross or leave a crack. A tile that has not come (or
// never will) leaves its part of the grid flat at the fallback height the caller gives. Each module sizes its own area and tiers (the SOF its square round home,
// sof/terrain-model.js; the Debrief its flight, debrief/view3d/terrain.js). A picture only: no flight math.
import { FT_PER_M } from './units.js';
import { lonLatToWorldPixel } from './geo.js';
import { tilesCovering } from './terrain-tiles.js';

/** Hill shading, so the relief reads on a picture that is lit flat (the satellite picture is not lit by the scene): sun from the north-west, 45 degrees up, as a map's hill shade. */
const SUN = Object.freeze({ lx: -Math.SQRT1_2, ly: Math.SQRT1_2, cot: 1 }); // cot(45 deg) = 1
/** The slopes are exaggerated again for the shading only, so low prairie relief shows; an estimate for the look. */
export const SHADE_GAIN = 4;
export const SHADE_LIMITS = Object.freeze([0.55, 1.3]);

/**
 * The finest zoom from `maxZoom` down to `minZoom` whose tiles over a box in degrees number `maxTiles` or fewer: { zoom, tiles } (the tiles at that zoom). At `minZoom` the
 * tiles are returned however many they are, for the caller's own cap to trim. For a caller that sizes its area to the place (the Debrief's flight), not to a fixed square.
 */
export function zoomForTiles(corners, { maxTiles, minZoom, maxZoom }) {
  for (let z = maxZoom; z > minZoom; z--) {
    const tiles = tilesCovering(z, corners);
    if (tiles.length <= maxTiles) return { zoom: z, tiles };
  }
  return { zoom: minZoom, tiles: tilesCovering(minZoom, corners) };
}

/**
 * Where an inner patch `innerSizeFt` square sits in an outer grid `outerSizeFt` square of `outerCells` cells, both centred on the same point: { holeCells, holeFrom }. The patch
 * covers `holeCells` outer cells a side and starts `holeFrom` cells in from the outer edge; the outer mesh has no triangles there (stitchInner).
 */
export function holeFor({ outerSizeFt, outerCells, innerSizeFt }) {
  const holeCells = Math.round(innerSizeFt / (outerSizeFt / outerCells));
  return { holeCells, holeFrom: (outerCells - holeCells) / 2 };
}

/**
 * A square grid of vertices over `sizeFt`, centred on the area's middle, `cells` a side: where each vertex stands (feet east and north of the middle) and, for each tile zoom,
 * the pixel of the world picture it falls on (so a height is a lookup, not a projection each time); `zooms` lists the tile zooms, finest first. `toLatLon(x, y)` is the map
 * projection's. `ft` is each vertex's height in feet above sea level and `known` is 1 where a tile gave it (0: flat at the fallback height fillGrid is given). Row 0 is the
 * south edge, column 0 the west edge.
 */
export function createGrid({ cells, sizeFt, toLatLon, zooms }) {
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

/**
 * Fills a grid's heights from a height store (core/terrain-tiles.js createHeightStore): the finest zoom that has the vertex's tile wins, else the next; none leaves `fallbackFt`
 * and `known` 0. Returns how many vertices are known.
 */
export function fillGrid(grid, store, fallbackFt) {
  let known = 0;
  for (let i = 0; i < grid.ft.length; i++) {
    let metres = NaN;
    for (const level of grid.pixels) {
      metres = store.metresAtPixel(level.z, level.px[i], level.py[i]);
      if (!Number.isNaN(metres)) break;
    }
    if (Number.isNaN(metres)) {
      grid.ft[i] = fallbackFt;
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
 * its height exactly, and one between two takes the straight line between them (which is what the outer mesh's edge is). `hole` is { holeCells, holeFrom } (holeFor): the inner
 * patch covers `holeCells` outer cells a side, starting `holeFrom` cells in from the outer edge, and its own cells are a whole multiple of them.
 */
export function stitchInner(inner, outer, { holeCells, holeFrom }) {
  const ratio = inner.cells / holeCells; // inner cells to an outer cell (4 at the SOF's 450 NM, 8 at 900)
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
  for (let k = 0; k <= inner.cells; k++) {
    edge(k, 0);
    edge(k, inner.cells);
    if (k > 0 && k < inner.cells) {
      edge(0, k);
      edge(inner.cells, k);
    }
  }
}

/** A grid's height at a point in feet from the area's middle, bilinear between its vertices (clamped to the grid), and whether the nearest vertex came from a tile. Returns { ft, known }. */
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
