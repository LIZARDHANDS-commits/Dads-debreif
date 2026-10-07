// The SOF 3D view's terrain: fetches the Terrarium elevation tiles (terrain-model.js decodes and samples them), keeps the two height grids the ground meshes are drawn
// from, and answers "how high is the ground here?" for everything that stands on it (radar shafts, bolts, fronts, pins, towns, aircraft). SPEC-sof, "3D view".
//
// Progressive: the grids start flat at home's elevation and rise as tiles arrive (`refresh()` re-reads the store; the view throttles it). A tile that fails twice is given up on and
// that part stays flat. Tile pictures are untrusted (they come from another site): each must be exactly 256 x 256 pixels and its heights are range-checked when decoded.
// No page of its own: view3d.js hands in the scheduler scope and the document, and ground3d.js draws the grids.
import {
  TERRAIN_URL, TERRAIN_CREDIT, TILE_PX, TERRAIN_ZOOM, MAX_TERRAIN_TILES, OUTER_CELLS, INNER_CELLS, INNER_FT, decodeTerrarium, tilesCovering, createHeightStore, createGrid, fillGrid,
  stitchInner, sampleGrid,
} from './terrain-model.js';
import { AREA_FT } from './scene3d-model.js';

/** A tile that fails is asked for again once after this long (milliseconds), then given up on. An estimate. */
const RETRY_MS = 3000;

/**
 * timers (a scheduler scope: after); doc (the page's document, for the scratch canvas); onChange() when a tile arrives or is given up on; makeImage for tests.
 * Returns { setView(projection, homeFt), setEnabled(on), isEnabled(), refresh(), isDirty(), revision, grids, heightFt(x, y), known(x, y), state(), credit, dispose() }.
 */
export function createTerrain3d({ timers, doc, onChange, makeImage = () => new Image() }) {
  const store = createHeightStore();
  const pending = new Map(); // tile key -> { image, retry }
  const failed = new Set();
  const wantedKeys = new Set();
  let canvas = null;
  let ctx = null;
  let projection = null;
  let planKey = '';
  let homeFt = 0;
  let enabled = true;
  let grids = null; // { outer, inner } once a projection is known
  let dirty = true;
  let revision = 0;
  let storeVersion = -1;
  let capped = false;
  let disposed = false;

  const tileKey = (t) => `${t.z}/${t.x}/${t.y}`;

  function readTile(image) {
    // A picture of any other size is not a terrain tile (untrusted): refuse it.
    if (image.naturalWidth !== TILE_PX || image.naturalHeight !== TILE_PX) return null;
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
    const key = tileKey(tile);
    const entry = { image: makeImage(), retry: null };
    pending.set(key, entry);
    const give = (ok) => {
      pending.delete(key);
      if (!ok) failed.add(key);
      dirty = true;
      onChange();
    };
    const again = () => {
      if (disposed) return;
      if (tries >= 1) return give(false);
      entry.retry = timers.after(RETRY_MS, () => {
        if (!disposed) load(tile, tries + 1);
      });
    };
    entry.image.crossOrigin = 'anonymous'; // the tile host allows it (Access-Control-Allow-Origin: *), and the height is read from its pixels
    entry.image.onload = () => {
      if (disposed || pending.get(key) !== entry) return;
      let metres = null;
      try {
        metres = readTile(entry.image);
      } catch {
        metres = null; // the browser would not let the pixels be read
      }
      if (!metres) return give(false); // not a terrain tile: do not ask again
      store.set(tile.z, tile.x, tile.y, metres);
      give(true);
    };
    entry.image.onerror = () => {
      if (disposed || pending.get(key) !== entry) return;
      again();
    };
    entry.image.src = TERRAIN_URL(tile.z, tile.x, tile.y);
  }

  /** Asks for the tiles the square needs, outer zoom first so the whole area rises before the sharp patch does, up to MAX_TERRAIN_TILES. */
  function request() {
    const half = AREA_FT / 2;
    const box = (h) => {
      const points = [[-h, -h], [-h, h], [h, -h], [h, h]].map(([x, y]) => projection.toLatLon(x, y));
      return { north: Math.max(...points.map((p) => p.lat)), south: Math.min(...points.map((p) => p.lat)), west: Math.min(...points.map((p) => p.lon)), east: Math.max(...points.map((p) => p.lon)) };
    };
    const list = [...tilesCovering(TERRAIN_ZOOM.outer, box(half)), ...tilesCovering(TERRAIN_ZOOM.inner, box(INNER_FT / 2))];
    capped = list.length > MAX_TERRAIN_TILES;
    wantedKeys.clear();
    for (const tile of list.slice(0, MAX_TERRAIN_TILES)) {
      const key = tileKey(tile);
      wantedKeys.add(key);
      if (store.get(tile.z, tile.x, tile.y) || pending.has(key) || failed.has(key)) continue;
      load(tile);
    }
  }

  function rebuild() {
    if (!grids) return;
    fillGrid(grids.outer, store, homeFt);
    fillGrid(grids.inner, store, homeFt);
    stitchInner(grids.inner, grids.outer);
    storeVersion = store.version;
  }

  const api = {
    /** The map's projection (its toLatLon) and home's elevation in feet. Cheap when nothing changed; a new home asks for its tiles and builds its grids. */
    setView(next, nextHomeFt) {
      const key = `${next.lat},${next.lon}`;
      if (key !== planKey) {
        planKey = key;
        projection = next;
        grids = {
          outer: createGrid({ cells: OUTER_CELLS, sizeFt: AREA_FT, toLatLon: next.toLatLon }),
          inner: createGrid({ cells: INNER_CELLS, sizeFt: INNER_FT, toLatLon: next.toLatLon }),
        };
        dirty = true;
        if (enabled) request();
      }
      if (nextHomeFt !== homeFt) {
        homeFt = nextHomeFt;
        dirty = true;
      }
    },
    /** Terrain on or off. Off: every height is home's elevation (the flat plane), and no tile is asked for until it is turned on. */
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      dirty = true;
      if (on && projection) request();
    },
    isEnabled: () => enabled,
    isDirty: () => dirty,
    /** Re-reads the tiles into the grids (the view calls it at a throttled pace). Bumps `revision` and returns true when it did something. */
    refresh() {
      if (!dirty || !grids) return false;
      dirty = false;
      if (store.version !== storeVersion || revision === 0) rebuild();
      revision += 1;
      return true;
    },
    get revision() {
      return revision;
    },
    /** { outer, inner } grids (terrain-model.js createGrid): heights in feet above sea level in `ft`, `known` where a tile gave it. Null before the first setView. */
    get grids() {
      return grids;
    },
    /** The ground's height at a point in feet from home, feet above sea level: the mesh's own surface. Home's elevation when terrain is off or the tile has not come. */
    heightFt(x, y) {
      if (!enabled || !grids) return homeFt;
      const inInner = Math.abs(x) <= INNER_FT / 2 && Math.abs(y) <= INNER_FT / 2;
      return sampleGrid(inInner ? grids.inner : grids.outer, x, y).ft;
    },
    /** Whether a tile really gave the height here (false when terrain is off or flat for want of a tile). */
    known(x, y) {
      if (!enabled || !grids) return false;
      const inInner = Math.abs(x) <= INNER_FT / 2 && Math.abs(y) <= INNER_FT / 2;
      return sampleGrid(inInner ? grids.inner : grids.outer, x, y).known;
    },
    /** The tiles wanted, got, given up on and still coming, and whether the cap left some out. */
    state() {
      let ready = 0;
      let bad = 0;
      for (const key of wantedKeys) {
        if (failed.has(key)) bad += 1;
        else if (!pending.has(key)) ready += 1;
      }
      return { wanted: wantedKeys.size, ready, failed: bad, pending: pending.size, capped };
    },
    credit: TERRAIN_CREDIT,
    dispose() {
      disposed = true;
      for (const entry of pending.values()) {
        entry.retry?.();
        entry.image.onload = entry.image.onerror = null;
      }
      pending.clear();
      grids = null;
    },
  };
  return api;
}
