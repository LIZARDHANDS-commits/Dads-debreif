// Web map tiles (Esri World Imagery) drawn under a flat map in local feet.
// Used by the debrief today, and by the Traffic and SOF maps as they are built.
// Self-contained on purpose: it knows nothing of any one module's state. It
// takes a place-to-screen function and the view's corners, and asks for a
// redraw when a tile arrives; redraws are one per frame however many tiles land.
import { lonLatToTile, tileBounds, pickTileZoom } from '../core/geo.js';

/** Esri World Imagery, built from numbers only (SPEC-debrief: Security). */
export const ESRI_IMAGERY = Object.freeze({
  url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  credit: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
});

const RETRY_MS = [2000, 6000]; // two more tries, further apart, then the tile is given up on
const MAX_KEPT = 300; // tiles kept in memory; the oldest go first
const MAX_TILES_PER_DRAW = 64; // more than this means the zoom is wrong for tiles: draw none

/**
 * The tiles that cover a view, for the zoom V6 chose (pickTileZoom).
 * corners: { north, south, west, east } in degrees. pxPerFt: the map's scale.
 * maxZoom: the source's finest zoom, if it has one (GOES stops at 6 or 7);
 * closer in, its coarser tiles are stretched over the view.
 * Returns [{ z, x, y, bounds }], or [] when the view needs too many.
 */
export function tilesFor(corners, pxPerFt, maxZoom = Infinity) {
  const z = Math.min(pickTileZoom((corners.north + corners.south) / 2, pxPerFt), maxZoom ?? Infinity);
  const a = lonLatToTile(corners.west, corners.north, z);
  const b = lonLatToTile(corners.east, corners.south, z);
  const n = 2 ** z;
  const [x0, x1, y0, y1] = [Math.max(0, a.x), Math.min(n - 1, b.x), Math.max(0, a.y), Math.min(n - 1, b.y)];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES_PER_DRAW) return [];
  const out = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) out.push({ z, x, y, bounds: tileBounds(x, y, z) });
  }
  return out;
}

/**
 * source: { url(z, x, y), maxZoom? }. timers: a scheduler scope (after). onChange():
 * called when a tile arrives or fails for good, to ask for a redraw.
 * makeImage: for tests. maxKept: maximum cached tiles in memory. Returns { draw, state, dispose }.
 */
export function createTileLayer({ source, timers, onChange, makeImage = () => new Image(), maxKept = MAX_KEPT }) {
  const tiles = new Map(); // key → { image, ready, failed, tries }
  let disposed = false;

  function load(key, url, entry) {
    const image = makeImage();
    entry.image = image;
    // CORS keeps the map readable (a saved picture, the tests); the last try goes without it.
    if (entry.tries < RETRY_MS.length) image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (disposed || entry.image !== image) return;
      entry.ready = true;
      onChange();
    };
    image.onerror = () => {
      if (disposed || entry.image !== image) return;
      const wait = RETRY_MS[entry.tries];
      entry.tries += 1;
      if (wait === undefined) {
        entry.failed = true;
        onChange();
        return;
      }
      entry.retry = timers.after(wait, () => load(key, url, entry));
    };
    image.src = url;
  }

  function tile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let entry = tiles.get(key);
    if (entry) {
      tiles.delete(key); // back to the newest end
    } else {
      entry = { image: null, ready: false, failed: false, tries: 0, retry: null };
      load(key, source.url(z, x, y), entry);
    }
    tiles.set(key, entry);
    while (tiles.size > maxKept) {
      const [oldest, gone] = tiles.entries().next().value;
      gone.retry?.();
      gone.image.onload = gone.image.onerror = null;
      tiles.delete(oldest);
    }
    return entry;
  }

  let last = { wanted: 0, ready: 0, failed: 0 };

  return {
    /**
     * Draws the tiles covering `corners` ({ north, south, west, east }) at
     * `pxPerFt`. toScreen(lat, lon) gives [x, y] in CSS pixels.
     */
    draw(ctx, { corners, pxPerFt, toScreen }) {
      const wanted = tilesFor(corners, pxPerFt, source.maxZoom);
      let ready = 0;
      let failed = 0;
      for (const { z, x, y, bounds } of wanted) {
        const entry = tile(z, x, y);
        if (entry.failed) failed += 1;
        if (!entry.ready) continue;
        ready += 1;
        const [x1, y1] = toScreen(bounds.north, bounds.west);
        const [x2, y2] = toScreen(bounds.south, bounds.east);
        // Half a pixel of overlap hides the seams between tiles.
        ctx.drawImage(entry.image, Math.min(x1, x2) - 0.5, Math.min(y1, y2) - 0.5, Math.abs(x2 - x1) + 1, Math.abs(y2 - y1) + 1);
      }
      last = { wanted: wanted.length, ready, failed };
    },
    /** What the last draw found: { wanted, ready, failed } tiles. */
    state: () => last,
    dispose() {
      disposed = true;
      for (const entry of tiles.values()) {
        entry.retry?.();
        if (entry.image) entry.image.onload = entry.image.onerror = null;
      }
      tiles.clear();
    },
  };
}
