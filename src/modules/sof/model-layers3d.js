// Draws the model layers of the SOF's 3D view (SOF-39, phase 2): cloud blocks, wind barbs and the freezing level, from the plain data
// model-clouds.js works out. It only builds three.js objects; the page (labels, buttons) is view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet. A height is feet above sea level times the height scale,
// the same scale and sea-level reference as the METAR decks, so a model block and a deck at the same height sit at the same height.
//
// Built once for each answer, hour, height scale or ground height, with materials reused; `dispose()` frees everything. The groups are
// switched on and off with `.visible`, which does not rebuild anything.
import { modelCloudBlocks, modelWinds, windsOverHome, meanFreezingFt, freezingWords, GRID_SPACING_FT } from './model-clouds.js';
import { AREA_FT } from './scene3d-model.js';

/** The groups the view's toggles switch. */
export const MODEL_GROUPS = Object.freeze(['low', 'mid', 'high', 'winds', 'freezing']);

const CLOUD_COLOUR = '#b9cde0'; // a cooler grey-blue than the METAR decks' white, so a model block is never taken for a report
const WIND_COLOUR = '#ffe9a8';
const FREEZING_COLOUR = '#7fd4ff';
/** A block is a little narrower than its grid cell, so neighbouring blocks stay apart. */
const BLOCK_FILL = 0.9;
/** A block's opacity runs from this (just over the 30 % threshold) to this (full cover); drawn in steps so materials are reused. Estimates, SOF-39. */
const OPACITY_RANGE = Object.freeze([0.14, 0.48]);
const OPACITY_STEP = 0.05;
/** The barb, in feet along the ground: staff length, feather length, the gap between feathers, and the line width. Sized to the 31 NM grid. */
const BARB = Object.freeze({ staff: 62_000, feather: 26_000, gap: 11_000, width: 3_600, station: 8_000 });
const SHEET_OPACITY = 0.12;
const LIFT_FT = 400; // as view3d.js: a line lies a little above what it follows

const quantise = (v) => Math.round(v / OPACITY_STEP) * OPACITY_STEP;

/**
 * Builds the layers. `T` is three.js; `model`, `hour` (index into model.times), `scale` (the height scale) and `groundFt` (the ground
 * the view draws, feet above sea level) as the view has them.
 *
 * Returns { root, labels, summary, dispose() } where
 * - root: a Group holding one Group per MODEL_GROUPS entry (`root.userData.groups`);
 * - labels: [{ group, text, point: { x, y, z } }], words to put beside points (the freezing level, the winds over home);
 * - summary: { blocks: { low, mid, high } (counts), barbs, freezingFt, freezingText, windsOverHome: [words] }.
 */
export function buildModelLayers(T, { model, hour, scale, groundFt }) {
  const root = new T.Group();
  const groups = {};
  for (const name of MODEL_GROUPS) {
    groups[name] = new T.Group();
    groups[name].name = `model-${name}`;
    root.add(groups[name]);
  }
  root.userData.groups = groups;
  const owned = []; // every geometry and material made here, freed together
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const labels = [];

  // ---- Cloud blocks: a soft see-through box about a grid cell wide, base to top ----
  const blocks = modelCloudBlocks(model, hour, { groundFt });
  const unit = own(new T.BoxGeometry(1, 1, 1));
  unit.translate(0, 0, 0.5); // the base at z = 0, so a mesh stands on its position
  const edges = own(new T.EdgesGeometry(unit));
  const edgeMaterial = own(new T.LineBasicMaterial({ color: CLOUD_COLOUR, transparent: true, opacity: 0.28 }));
  const materials = new Map();
  const materialFor = (coverPct) => {
    const [lo, hi] = OPACITY_RANGE;
    const opacity = quantise(lo + (hi - lo) * Math.min(1, Math.max(0, coverPct / 100)));
    let m = materials.get(opacity);
    if (!m) {
      m = own(new T.MeshBasicMaterial({ color: CLOUD_COLOUR, transparent: true, opacity, depthWrite: false }));
      materials.set(opacity, m);
    }
    return m;
  };
  const counts = { low: 0, mid: 0, high: 0 };
  const width = GRID_SPACING_FT * BLOCK_FILL;
  for (const block of blocks) {
    const mesh = new T.Mesh(unit, materialFor(block.cover));
    mesh.position.set(block.x, block.y, block.baseFt * scale);
    mesh.scale.set(width, width, (block.topFt - block.baseFt) * scale);
    mesh.renderOrder = 1;
    mesh.add(new T.LineSegments(edges, edgeMaterial));
    groups[block.stage].add(mesh);
    counts[block.stage] += 1;
  }

  // ---- Wind barbs: flat on the plane at each level's own height, one mesh for all the barbs of a level ----
  const winds = modelWinds(model, hour);
  const windMaterial = own(new T.MeshBasicMaterial({ color: WIND_COLOUR, side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }));
  const byLevel = new Map();
  for (const w of winds) {
    if (!byLevel.has(w.hPa)) byLevel.set(w.hPa, []);
    byLevel.get(w.hPa).push(w);
  }
  for (const list of byLevel.values()) {
    const positions = [];
    for (const w of list) addBarb(positions, w, w.heightFt * scale + LIFT_FT);
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const mesh = new T.Mesh(geometry, windMaterial);
    mesh.renderOrder = 4;
    groups.winds.add(mesh);
  }
  const over = windsOverHome(model, hour);
  for (const w of over) labels.push({ group: 'winds', text: w.words, point: { x: w.x, y: w.y, z: w.heightFt * scale + LIFT_FT } });

  // ---- The freezing level: one faint sheet across the area at the mean for the hour, with its border ----
  const freezingFt = meanFreezingFt(model, hour);
  const z = freezingFt * scale;
  const sheetGeometry = own(new T.PlaneGeometry(AREA_FT, AREA_FT));
  const sheet = new T.Mesh(sheetGeometry, own(new T.MeshBasicMaterial({ color: FREEZING_COLOUR, transparent: true, opacity: SHEET_OPACITY, side: T.DoubleSide, depthWrite: false })));
  sheet.position.set(0, 0, z);
  sheet.renderOrder = 0;
  const h2 = AREA_FT / 2;
  const border = new T.LineLoop(
    own(new T.BufferGeometry().setFromPoints([new T.Vector3(-h2, -h2, z), new T.Vector3(h2, -h2, z), new T.Vector3(h2, h2, z), new T.Vector3(-h2, h2, z)])),
    own(new T.LineBasicMaterial({ color: FREEZING_COLOUR, transparent: true, opacity: 0.55 })),
  );
  groups.freezing.add(sheet, border);
  const freezingText = freezingWords(freezingFt, groundFt);
  labels.push({ group: 'freezing', text: freezingText, point: { x: -h2, y: -h2, z } }); // the south-west corner: the left of the picture from the start view

  return {
    root,
    labels,
    summary: { blocks: counts, barbs: winds.length, freezingFt, freezingText, windsOverHome: over.map((w) => w.words) },
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}

// ---- One wind barb as triangles lying on a plane --------------------------------------------------

/**
 * A ribbon from a to b ([x, y] each), `w` wide, as two triangles (flat in the plane at height z). Pushes nine numbers a triangle.
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 */
function ribbon(out, a, b, w, z) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  const p = [[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]];
  for (const k of [0, 1, 2, 0, 2, 3]) out.push(p[k][0], p[k][1], z);
}

/**
 * Adds a standard wind barb for `wind` ({ x, y, dirTrue, barb }) to `out` (a flat list of triangle points): the staff points into the
 * wind (the way it comes from), the feathers are on the clockwise side at the far end, a pennant is 50 kt, a full feather 10 and a half
 * feather 5. Calm is the station mark alone. The barb is laid flat in the plane at height `z`.
 */
export function addBarb(out, wind, z) {
  const d = (wind.dirTrue * Math.PI) / 180;
  const along = [Math.sin(d), Math.cos(d)]; // from the station towards where the wind comes from, x east and y north
  const right = [Math.cos(d), -Math.sin(d)]; // clockwise of that
  const at = (t, s = 0) => [wind.x + along[0] * t + right[0] * s, wind.y + along[1] * t + right[1] * s];
  ribbon(out, at(-BARB.station / 2), at(BARB.station / 2), BARB.station, z); // the station mark
  const { barb } = wind;
  if (!barb || barb.calm) return;
  const { staff, feather, gap, width } = BARB;
  ribbon(out, at(0), at(staff), width, z);
  let t = staff;
  for (let n = 0; n < barb.pennants; n++) {
    const [a, b, c] = [at(t), at(t, feather * 0.9), at(t - gap * 1.4)];
    for (const [x, y] of [a, b, c]) out.push(x, y, z);
    t -= gap * 1.6;
  }
  for (let n = 0; n < barb.full; n++) {
    ribbon(out, at(t), at(t + feather * 0.12, feather), width, z);
    t -= gap;
  }
  if (barb.half) {
    if (barb.pennants === 0 && barb.full === 0) t -= gap; // a lone half feather is set in from the end, so it is not read as a full one
    ribbon(out, at(t), at(t + feather * 0.06, feather / 2), width, z);
  }
}
