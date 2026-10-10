// The real ground under Traffic's 3D view (TR-115; Patrick, 10 Oct: "use real heights", approved as written). The High pattern squares are
// draped over the true ground heights, so the Moose Jaw River valley sits where the photo shows it; the traced river lines cut a shallow
// channel into it (rivers3d.js).
//
// Heights come from the public Terrarium elevation tiles (src/core/terrain-tiles.js, the same source and decoder as the SOF's 3D terrain) at
// zoom GROUND_ZOOM. What is drawn is each point's height above the field's own height in the same data, never the data's height above sea
// level, so a datum difference between the tiles and the field survey can never leave a step at the airfield.
// - The runways, flight line and base buildings stay flat (FLAT boxes, passed in), blending into the real ground over FLAT_BLEND_FT outside them.
// - The ground fades back to flat over EDGE_FADE_FT inside the pattern squares' outer edge, where the flat far photo carries on.
// - Data failure: a tile that fails twice, or a picture that is not a terrain tile, leaves its part flat at field height, as before TR-115.
//   Nothing waits for it and the view never stops. Tile pictures are untrusted: exactly 256 x 256 pixels, and every height range-checked.
// Drawing only: aircraft heights, the PFL and ejections still use the field elevation (airfield.js).
import { FT_PER_M } from '../../core/units.js';
import { localFtToLatLon, lonLatToWorldPixel } from '../../core/geo.js';
import { TERRAIN_URL, TERRAIN_CREDIT, TILE_PX, decodeTerrarium, tilesCovering, createHeightStore } from '../../core/terrain-tiles.js';
import { createRiverChannel } from './rivers3d.js';

/** Zoom 12: about 80 ft a pixel at Moose Jaw. The Canadian source data under the tiles is about 20-30 m, so finer adds nothing (an estimate). */
export const GROUND_ZOOM = 12;
/** The flat airfield blends into the real ground over this distance outside its boxes (an estimate). */
export const FLAT_BLEND_FT = 1000;
/** The real ground fades back to flat over this distance inside the outer edge of the draped squares (an estimate), so it meets the flat far photo. */
export const EDGE_FADE_FT = 3000;
/** The most height tiles asked for (about 16 cover the pattern squares); a cap for speed and courtesy to the host. */
export const MAX_GROUND_TILES = 40;
/** A tile that fails is asked for again once after this long (milliseconds), then given up on. An estimate, as the SOF's. */
const RETRY_MS = 3000;
export { TERRAIN_CREDIT };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** How flat the ground is held at a point: 1 inside any box, 0 from `blendFt` outside them all, smooth between. Boxes: { minX, maxX, minY, maxY }, ft. */
export function flatWeight(x, y, boxes, blendFt = FLAT_BLEND_FT) {
  let near = Infinity;
  for (const b of boxes) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dy = Math.max(b.minY - y, 0, y - b.maxY);
    near = Math.min(near, Math.hypot(dx, dy));
  }
  return 1 - smooth(near / blendFt);
}

/** How much of the real ground shows near the edge of the draped area ({ x, y, span }, its centre and side): 1 inside, 0 at the edge. */
export function edgeWeight(x, y, area, fadeFt = EDGE_FADE_FT) {
  const half = area.span / 2;
  const inset = Math.min(half - Math.abs(x - area.x), half - Math.abs(y - area.y));
  return smooth(inset / fadeFt);
}

/**
 * The drawn ground's offset from the field's height at a point, in feet (negative below the field): the real height above the field's own,
 * held flat on the airfield and faded out at the edge, less the river channel. `metresAt(x, y)` is the data's height (NaN where no tile came);
 * `fieldFt` is the data's height at the field (NaN until known, when everything stays flat).
 */
export function groundOffsetFt(x, y, { metresAt, fieldFt, flatBoxes, area, channelAt = null }) {
  const real = 1 - flatWeight(x, y, flatBoxes);
  const edge = edgeWeight(x, y, area);
  const show = real * edge;
  if (show <= 0) return 0;
  const m = metresAt(x, y);
  const above = Number.isFinite(m) && Number.isFinite(fieldFt) ? m * FT_PER_M - fieldFt : 0;
  const cut = channelAt ? channelAt(x, y).depthFt : 0;
  return show * (above - cut);
}

/**
 * Loads the height tiles over `area` and answers offsetAt(x, y) and shadeAt(x, y) (the river banks' darkening, 1 elsewhere).
 * ref: the map's local reference (geo.js makeLocalRef, the ARP); flatBoxes: the boxes held flat; timers: the module's scheduler scope
 * (after, clearTimeout); doc: the page's document, for the scratch canvas; onChange() when the heights move on. makeImage for tests.
 * `version` changes whenever the answers would; `state()` counts the tiles.
 */
export function createGroundHeights({ ref, area, flatBoxes, timers, doc, onChange = () => {}, makeImage = () => new Image() }) {
  const store = createHeightStore();
  const pending = new Map(); // tile key -> { image, retry }
  const failed = new Set();
  const channelAt = createRiverChannel();
  let wanted = [];
  let canvas = null;
  let ctx = null;
  let fieldFt = NaN;
  let version = 0;
  let disposed = false;

  const tileKey = (t) => `${t.z}/${t.x}/${t.y}`;
  const metresAt = (x, y) => {
    const ll = localFtToLatLon(ref, x, y);
    const px = lonLatToWorldPixel(ll.lon, ll.lat, GROUND_ZOOM);
    return store.metresAtPixel(GROUND_ZOOM, px.x, px.y);
  };

  /** The field's height in the data: the mean over a grid of points in each flat box, once every point has a height. */
  function measureField() {
    let sum = 0;
    let n = 0;
    for (const b of flatBoxes) {
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 8; j++) {
          const m = metresAt(b.minX + ((b.maxX - b.minX) * i) / 8, b.minY + ((b.maxY - b.minY) * j) / 8);
          if (!Number.isFinite(m)) return NaN;
          sum += m;
          n += 1;
        }
      }
    }
    return n ? (sum / n) * FT_PER_M : NaN;
  }

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

  function settle() {
    if (!Number.isFinite(fieldFt)) fieldFt = measureField();
    version += 1;
    onChange();
  }

  function load(tile, tries = 0) {
    const key = tileKey(tile);
    const entry = { image: makeImage(), retry: null };
    pending.set(key, entry);
    const give = (ok) => {
      pending.delete(key);
      if (!ok) failed.add(key);
      settle();
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

  const half = area.span / 2;
  const corners = [[-half, -half], [-half, half], [half, -half], [half, half]].map(([dx, dy]) => localFtToLatLon(ref, area.x + dx, area.y + dy));
  const box = {
    north: Math.max(...corners.map((p) => p.lat)), south: Math.min(...corners.map((p) => p.lat)),
    west: Math.min(...corners.map((p) => p.lon)), east: Math.max(...corners.map((p) => p.lon)),
  };
  wanted = tilesCovering(GROUND_ZOOM, box).slice(0, MAX_GROUND_TILES);
  for (const tile of wanted) load(tile);

  return {
    get version() {
      return version;
    },
    credit: TERRAIN_CREDIT,
    offsetAt: (x, y) => groundOffsetFt(x, y, { metresAt, fieldFt, flatBoxes, area, channelAt }),
    /** The river banks' darkening at a point (1 is unchanged), faded with the real ground. */
    shadeAt(x, y) {
      const s = channelAt(x, y).shade;
      if (s === 1) return 1;
      const show = (1 - flatWeight(x, y, flatBoxes)) * edgeWeight(x, y, area);
      return 1 - (1 - s) * show;
    },
    state: () => ({ wanted: wanted.length, ready: wanted.length - pending.size - failed.size, failed: failed.size, pending: pending.size, fieldKnown: Number.isFinite(fieldFt) }),
    dispose() {
      disposed = true;
      for (const entry of pending.values()) {
        if (entry.retry) timers.clearTimeout?.(entry.retry);
        entry.image.onload = null;
        entry.image.onerror = null;
      }
      pending.clear();
      canvas = null;
      ctx = null;
    },
  };
}
