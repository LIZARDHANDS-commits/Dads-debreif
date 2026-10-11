// Terrain heights under the loaded tracks' ground fixes, for the altitude check (DB-28): the public Terrarium elevation tiles, decoded by
// the shared src/core/terrain-tiles.js (the same source and decoder as the SOF's 3D terrain and Traffic's ground), at zoom TERRAIN_ZOOM.
// Only the tiles holding a ground fix are asked for (one or two airfields: a handful of tiles), at most MAX_TILES.
// - Data failure: a tile that fails is asked for once more after RETRY_MS, then given up on; a picture that is not a terrain tile is refused.
//   The check then compares the ships with each other instead (flight-data altitude.js says which), and the box says so. Nothing waits for
//   the tiles: the flight shows at once, and is checked again when they land.
// Tile pictures are untrusted: exactly 256 x 256 pixels, and every height range-checked by the decoder.
import { FT_PER_M } from '../../core/units.js';
import { lonLatToTile, lonLatToWorldPixel } from '../../core/geo.js';
import { TERRAIN_URL, TILE_PX, decodeTerrarium, createHeightStore } from '../../core/terrain-tiles.js';

/** Zoom 12: about 80 ft a pixel at Moose Jaw; the Canadian source data under the tiles is about 20-30 m, so finer adds nothing (an estimate, as Traffic's ground). */
export const TERRAIN_ZOOM = 12;
/** The most tiles asked for (the example flight needs 3); a cap for speed and courtesy to the host. */
export const MAX_TILES = 16;
/** A tile that fails is asked for again once after this long (milliseconds), then given up on. An estimate, as the SOF's. */
const RETRY_MS = 3000;

/**
 * Loads the tiles under `points` ([{ lat, lon }]) and answers refAt(lat, lon), the terrain height in feet (NaN where no tile came).
 * timers: the module's scheduler (after, which returns a cancel); doc: the page's document, for the scratch canvas; onChange() when a tile lands or
 * fails. makeImage for tests. `state()` is 'none' (no points), 'loading', 'ready' (every tile came) or 'failed' (some never came).
 */
export function createTerrainHeights({ points, timers, doc, onChange = () => {}, makeImage = () => new Image() }) {
  const store = createHeightStore();
  const pending = new Map();
  const failed = new Set();
  let canvas = null;
  let ctx = null;
  let disposed = false;

  const keys = new Map();
  for (const p of points) {
    const t = lonLatToTile(p.lon, p.lat, TERRAIN_ZOOM);
    keys.set(`${t.x}/${t.y}`, { z: TERRAIN_ZOOM, x: t.x, y: t.y });
  }
  const wanted = [...keys.values()].slice(0, MAX_TILES);

  function readTile(image) {
    if (image.naturalWidth !== TILE_PX || image.naturalHeight !== TILE_PX) return null; // not a terrain tile (untrusted): refused
    if (!canvas) {
      canvas = doc.createElement('canvas');
      canvas.width = TILE_PX;
      canvas.height = TILE_PX;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    ctx.drawImage(image, 0, 0);
    return decodeTerrarium(ctx.getImageData(0, 0, TILE_PX, TILE_PX).data);
  }

  function load(tile, tries = 0) {
    const key = `${tile.x}/${tile.y}`;
    const entry = { image: makeImage(), retry: null };
    pending.set(key, entry);
    const give = (ok) => {
      pending.delete(key);
      if (!ok) failed.add(key);
      if (!pending.size) onChange(); // checked again once every tile has come or been given up on
    };
    entry.image.crossOrigin = 'anonymous'; // the tile host allows it, and the heights are read from the pixels
    entry.image.onload = () => {
      if (disposed || pending.get(key) !== entry) return;
      let metres = null;
      try {
        metres = readTile(entry.image);
      } catch {
        metres = null; // the browser would not let the pixels be read
      }
      if (!metres) return give(false);
      store.set(tile.z, tile.x, tile.y, metres);
      give(true);
    };
    entry.image.onerror = () => {
      if (disposed || pending.get(key) !== entry) return;
      if (tries >= 1) return give(false);
      entry.retry = timers.after(RETRY_MS, () => {
        if (!disposed) load(tile, tries + 1);
      });
    };
    entry.image.src = TERRAIN_URL(tile.z, tile.x, tile.y);
  }
  for (const tile of wanted) load(tile);

  return {
    refAt(lat, lon) {
      const px = lonLatToWorldPixel(lon, lat, TERRAIN_ZOOM);
      return store.metresAtPixel(TERRAIN_ZOOM, px.x, px.y) * FT_PER_M;
    },
    state: () => (!wanted.length ? 'none' : pending.size ? 'loading' : failed.size ? 'failed' : 'ready'),
    dispose() {
      disposed = true;
      for (const entry of pending.values()) {
        entry.retry?.(); // the scheduler's after() returns its cancel
        entry.image.onload = null;
        entry.image.onerror = null;
      }
      pending.clear();
      canvas = null;
      ctx = null;
    },
  };
}
