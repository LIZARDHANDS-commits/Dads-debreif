// Public elevation tiles, decoded: the Terrarium tiles (AWS Open Data, Mapzen terrain tiles: USGS, NRCan and others). Each tile is a 256 x 256 picture whose red, green
// and blue bytes hold the height in metres: (R x 256 + G + B / 256) - 32768 (the tiles' own published encoding). Shared by the SOF's 3D terrain and Traffic's 3D ground
// (TR-115); moved here from src/modules/sof/terrain-model.js so there is one copy. Pure: numbers in, numbers out. Tile pictures are untrusted: the caller checks the size,
// and every decoded height is range-checked here.
import { lonLatToTile } from './geo.js';

/** The tile address, built from numbers only (no user-entered text). */
export const TERRAIN_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
/** The credit line, as the tile set asks to be credited. */
export const TERRAIN_CREDIT = 'Terrain: Mapzen/AWS Terrain Tiles (USGS, NRCan and others)';
export const TILE_PX = 256;
/** A decoded height outside this range (metres; Everest is 8,849 and the Dead Sea shore is about -430) is a bad pixel, never a height. */
export const PLAUSIBLE_M = Object.freeze({ min: -500, max: 9000 });

const key = (z, x, y) => (z * 262144 + x) * 262144 + y;

/**
 * Decodes one Terrarium tile's pixels (RGBA bytes, 256 x 256) into heights in metres, a Float32Array of 65,536, NaN for a pixel that is transparent or outside PLAUSIBLE_M.
 * Returns null when the pixels are not a whole tile or none of them is a plausible height (a picture that is not a terrain tile).
 */
export function decodeTerrarium(rgba) {
  if (!rgba || rgba.length !== TILE_PX * TILE_PX * 4) return null;
  const out = new Float32Array(TILE_PX * TILE_PX);
  let good = 0;
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    const m = rgba[o] * 256 + rgba[o + 1] + rgba[o + 2] / 256 - 32768;
    if (rgba[o + 3] === 0 || !(m >= PLAUSIBLE_M.min && m <= PLAUSIBLE_M.max)) out[i] = NaN;
    else {
      out[i] = m;
      good += 1;
    }
  }
  return good > 0 ? out : null;
}

/** The tiles at a zoom that cover a box in degrees ({ north, south, west, east }): [{ z, x, y }]. */
export function tilesCovering(z, corners) {
  const a = lonLatToTile(corners.west, corners.north, z);
  const b = lonLatToTile(corners.east, corners.south, z);
  const n = 2 ** z;
  const out = [];
  for (let x = Math.max(0, a.x); x <= Math.min(n - 1, b.x); x++) {
    for (let y = Math.max(0, a.y); y <= Math.min(n - 1, b.y); y++) out.push({ z, x, y });
  }
  return out;
}

/** The decoded tiles, keyed by zoom, x and y. `version` changes whenever a tile is added, so a user can tell the grid is out of date. */
export function createHeightStore() {
  const tiles = new Map();
  let version = 0;
  const store = {
    get version() {
      return version;
    },
    set(z, x, y, metres) {
      tiles.set(key(z, x, y), metres);
      version += 1;
    },
    get: (z, x, y) => tiles.get(key(z, x, y)) ?? null,
    /**
     * The height in metres at a point given as a pixel of the zoom's world picture (lonLatToWorldPixel), bilinear between pixel centres, or NaN when the tile holding it
     * has not come. A neighbouring tile that has not come is stood in for by the nearest pixel of this one.
     */
    metresAtPixel(z, px, py) {
      const hx = Math.floor(px / TILE_PX);
      const hy = Math.floor(py / TILE_PX);
      const home = tiles.get(key(z, hx, hy));
      if (!home) return NaN;
      const fx = px - 0.5;
      const fy = py - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const side = 2 ** z * TILE_PX;
      const at = (ix, iy) => {
        const cx = Math.min(side - 1, Math.max(0, ix));
        const cy = Math.min(side - 1, Math.max(0, iy));
        const nx = Math.floor(cx / TILE_PX);
        const ny = Math.floor(cy / TILE_PX);
        const arr = nx === hx && ny === hy ? home : tiles.get(key(z, nx, ny));
        if (arr) return arr[(cy - ny * TILE_PX) * TILE_PX + (cx - nx * TILE_PX)];
        const ux = Math.min(hx * TILE_PX + TILE_PX - 1, Math.max(hx * TILE_PX, cx));
        const uy = Math.min(hy * TILE_PX + TILE_PX - 1, Math.max(hy * TILE_PX, cy));
        return home[(uy - hy * TILE_PX) * TILE_PX + (ux - hx * TILE_PX)];
      };
      const corners = [[at(x0, y0), (1 - tx) * (1 - ty)], [at(x0 + 1, y0), tx * (1 - ty)], [at(x0, y0 + 1), (1 - tx) * ty], [at(x0 + 1, y0 + 1), tx * ty]];
      let sum = 0;
      let weight = 0;
      for (const [v, w] of corners) {
        if (Number.isNaN(v) || w === 0) continue;
        sum += v * w;
        weight += w;
      }
      return weight > 0 ? sum / weight : NaN;
    },
  };
  return store;
}
