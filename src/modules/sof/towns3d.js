// The towns in the SOF's 3D view (SPEC-sof, "3D view"; Dad, 7 Oct): each of towns-data.js's towns as a cluster of low grey boxes standing on the terrain, a few taller blocks in a
// downtown core tapering to low houses at the edge. Plainly schematic: the blocks are made up (a street grid, seeded so the same town looks the same every time), not real buildings,
// and the view's key says so. Only builds three.js objects; the labels and the toggle are view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale (`scale`), and a block stands on `heightFt(x, y)`,
// the ground the terrain gives there.
import { FT_PER_NM } from './map-view.js';
import { AREA_FT } from './scene3d-model.js';
import { TOWNS } from './towns-data.js';

/** Blocks on a street grid with this many cells across a town's radius, so a town is about 600 cells whatever its size (the cell grows with the town). An estimate, for speed. */
export const CELLS_PER_RADIUS = 14;
/** The most blocks one town gets, a cap for speed (about 400 are usual). */
export const MAX_TOWN_BLOCKS = 700;
/** How tall a house is and how tall the middle-ring blocks run, feet before the height scale. Estimates for the look. */
export const HOUSE_FT = Object.freeze([18, 32]);
export const MID_RING_FT = Object.freeze([30, 80]);
/** The downtown core is the inner share of the radius; the middle ring runs to MID_RING_SHARE. Estimates for the look. */
const CORE_SHARE = 0.22;
const MID_RING_SHARE = 0.5;
const BLOCK_COLOUR = '#625e57'; // a slightly warm mid grey: the scene's bright sky light is blue, so it comes out neutral grey on screen
/** A block's footprint is this share of its street cell, from the first to the second: a gap is left for the streets. */
const FOOTPRINT = Object.freeze([0.55, 0.85]);

/** A small seeded random number generator (mulberry32): the same seed always gives the same run of numbers, so a town is the same every time. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A text's seed: a simple hash, so each town has its own. */
export const seedOf = (text) => [...String(text)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

/**
 * The blocks of one town as plain data: [{ x, y, w, d, hFt }] in feet from home (w and d the footprint, hFt the height before the height scale), tallest in the core. `centre` is the
 * town's [x, y] in feet from home. Deterministic for a town id.
 */
export function townBlocks(town, centre, { cells = CELLS_PER_RADIUS, max = MAX_TOWN_BLOCKS } = {}) {
  const random = seededRandom(seedOf(town.id));
  const radiusFt = town.builtUpNm * FT_PER_NM;
  const cell = radiusFt / cells;
  const blocks = [];
  for (let gx = -cells; gx <= cells; gx++) {
    for (let gy = -cells; gy <= cells; gy++) {
      const d = Math.hypot(gx, gy) / cells; // 0 at the middle, 1 at the edge
      if (d > 1) continue;
      // Dense in the middle, thinning to about a third of the cells at the edge.
      if (random() > 1 - 0.65 * d ** 1.5) continue;
      if (blocks.length >= max) return blocks;
      let hFt;
      if (d < CORE_SHARE) hFt = HOUSE_FT[1] + (town.downtownFt - HOUSE_FT[1]) * (1 - d / CORE_SHARE) ** 1.5 * (0.35 + 0.65 * random());
      else if (d < MID_RING_SHARE) hFt = MID_RING_FT[0] + (MID_RING_FT[1] - MID_RING_FT[0]) * random();
      else hFt = HOUSE_FT[0] + (HOUSE_FT[1] - HOUSE_FT[0]) * random();
      const w = cell * (FOOTPRINT[0] + (FOOTPRINT[1] - FOOTPRINT[0]) * random());
      const dd = cell * (FOOTPRINT[0] + (FOOTPRINT[1] - FOOTPRINT[0]) * random());
      blocks.push({ x: centre[0] + gx * cell + (random() - 0.5) * cell * 0.2, y: centre[1] + gy * cell + (random() - 0.5) * cell * 0.2, w, d: dd, hFt: Math.max(HOUSE_FT[0], hFt) });
    }
  }
  return blocks;
}

/**
 * Builds the towns. `T` is three.js; `toXY(lat, lon)` gives [x, y] in feet from home; `heightFt(x, y)` the ground there (feet above sea level); `scale` the height scale;
 * `towns` is towns-data.js's list unless a test gives its own. A town whose middle is outside the square is skipped.
 *
 * Returns { root, entries, summary, dispose() }: `entries` is [{ id, name, x, y, z (the ground at its middle, scene feet), radiusFt }] for the labels, `summary` is
 * [{ name, blocks }] for the key.
 */
export function buildTowns(T, { toXY, heightFt, scale, towns = TOWNS }) {
  const root = new T.Group();
  root.name = 'towns';
  const owned = [];
  const entries = [];
  const summary = [];
  const half = AREA_FT / 2;
  const geometry = new T.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0, 0.5); // the base at z = 0, so a box scales up from the ground
  const material = new T.MeshLambertMaterial({ color: BLOCK_COLOUR });
  owned.push(geometry, material);
  const m = new T.Matrix4();
  const shade = new T.Color();
  for (const town of towns) {
    const [cx, cy] = toXY(town.lat, town.lon);
    if (Math.abs(cx) > half || Math.abs(cy) > half) continue;
    const blocks = townBlocks(town, [cx, cy]);
    if (!blocks.length) continue;
    const mesh = new T.InstancedMesh(geometry, material, blocks.length);
    blocks.forEach((b, n) => {
      m.compose(new T.Vector3(b.x, b.y, heightFt(b.x, b.y) * scale), new T.Quaternion(), new T.Vector3(b.w, b.d, b.hFt * scale));
      mesh.setMatrixAt(n, m);
      // A little lighter the taller it stands, so a core reads from a suburb (a grey from 0.7 to 1 of that).
      const g = 0.7 + 0.3 * Math.min(1, b.hFt / town.downtownFt);
      mesh.setColorAt(n, shade.setRGB(g, g, g * 1.03));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = `town-${town.id}`;
    owned.push(mesh);
    root.add(mesh);
    entries.push({ id: town.id, name: town.name, x: cx, y: cy, z: heightFt(cx, cy) * scale, radiusFt: town.builtUpNm * FT_PER_NM, tallFt: town.downtownFt * scale });
    summary.push({ name: town.name, blocks: blocks.length });
  }
  return {
    root,
    entries,
    summary,
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
