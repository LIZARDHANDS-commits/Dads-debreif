// The SOF 3D view's own terrain plan: its square round home, its two tiers and the key's words (SPEC-sof, "3D view"; Dad, 7 Oct: "real terrain"). Pure: numbers in, numbers out.
// The Terrarium decoding, the height store, the grids, the stitching and the hill shade are shared with the Debrief in core/terrain.js (SOF-64); this file holds only what is the
// SOF's: the inner patch round home (120 NM, the sharp satellite picture's), the outer grid and zoom for each 3D area, and what the key says.
//
// The ground is two height-mapped meshes (ui-kit draped-ground.js): an outer grid over the whole 3D square (450 NM by default) and a finer one over the inner patch round home that
// has the sharp satellite picture. A tile that has not come (or never will) leaves its part of the grid flat at the home field's elevation.
import { createGrid as createSharedGrid, stitchInner as stitchShared, holeFor } from '../../core/terrain.js';
import { AREA_NM, AREA_FT } from './scene3d-model.js';
import { FT_PER_NM } from './map-view.js';

export {
  TERRAIN_URL, TERRAIN_CREDIT, TILE_PX, MAX_TERRAIN_TILES, PLAUSIBLE_M, SHADE_GAIN, SHADE_LIMITS, decodeTerrarium, tilesCovering, createHeightStore, fillGrid, sampleGrid,
  hillshade,
} from '../../core/terrain.js';

/**
 * The tile zooms at 450 NM: zoom 7 over the whole square (about 790 m a pixel at 50 N), zoom 9 over the sharp patch (about 125 m a pixel). Zooms chosen for the look and the
 * tile count. A bigger 3D area takes a coarser outer zoom (TERRAIN_PLANS).
 */
export const TERRAIN_ZOOM = Object.freeze({ outer: 7, inner: 9 });

/** The inner patch's width in NM (the sharp satellite picture's, ui-kit draped-ground.js) and its grid's cells: 120 / 256 = 0.47 NM a cell. */
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
  return { ...plan, ...holeFor({ outerSizeFt: areaNm * FT_PER_NM, outerCells: plan.outerCells, innerSizeFt: INNER_FT }) };
}

/**
 * The plan the shared terrain tiles and draped ground are built with (ui-kit terrain-tiles.js, draped-ground.js), for the 3D area in force: the whole square at its outer zoom
 * and the patch round home at zoom 9, both centred on home.
 */
export function sharedTerrainPlan() {
  const plan = terrainPlan();
  return {
    outer: { sizeFt: AREA_FT, cells: plan.outerCells, zoom: plan.outerZoom },
    inner: { sizeFt: INNER_FT, cells: INNER_CELLS, zoom: TERRAIN_ZOOM.inner },
    hole: { holeCells: plan.holeCells, holeFrom: plan.holeFrom },
  };
}

/**
 * The satellite ground's two canvases (ui-kit draped-ground.js). The outer canvas covers the whole square (about 2,700 ft a pixel at 1,024 px over 450 NM); its tiles are asked
 * for no finer than zoom 7 (about 36 of them over 450 NM). A bigger area is the same 1,024 px, so the tile layer picks its own coarser zoom (pickTileZoom: about zoom 7 at 600 NM,
 * 6 at 900 NM, each about 25 to 49 tiles): about 3,600 ft a pixel at 600 NM and 5,300 ft at 900 NM. An estimate for speed. The inner canvas covers INNER_NM square round home, at
 * zoom 9 (two finer than the outer; about 36 tiles), drawn at 1,536 px (about 475 ft a pixel).
 */
export const GROUND_IMAGERY = Object.freeze({ outer: Object.freeze({ px: 1024, maxZoom: 7 }), inner: Object.freeze({ px: 1536, maxZoom: 9 }) });
/** The most tiles the two tiers ask for between them: 36 + 36 and some spare. The tile layer itself refuses over 64 for one tier. */
export const MAX_GROUND_TILES = 100;

/** A grid over `sizeFt` round home (core/terrain.js createGrid), reading the patch's zoom first and then the area's outer zoom unless `zooms` says otherwise. */
export function createGrid({ cells, sizeFt, toLatLon, zooms = [TERRAIN_ZOOM.inner, terrainPlan().outerZoom] }) {
  return createSharedGrid({ cells, sizeFt, toLatLon, zooms });
}

/** Matches the inner grid's edge to the outer mesh for the 3D area in force (core/terrain.js stitchInner). */
export function stitchInner(inner, outer) {
  stitchShared(inner, outer, terrainPlan());
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
