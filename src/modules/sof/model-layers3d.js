// Draws the model layers of the SOF's 3D view (SOF-39, phase 2): cloud-cover sheets, wind barbs and the freezing level, from the plain
// data model-clouds.js works out. It only builds three.js objects; the page (labels, buttons) is view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet. A height is feet above sea level times the height scale,
// the same scale and sea-level reference as the METAR decks, so a model sheet and a deck at the same height sit at the same height.
//
// Clouds (Dad, 7 Oct: like ForeFlight's cloud-cover maps): one see-through sheet across the whole square at each model pressure level
// (1000 to 300 hPa), at that level's mean geopotential height. Its picture is the 9 x 9 cover grid smoothed up, white to grey, clear
// at or below the cloud threshold and easing in to about 85 % opaque at full cover. Stacked, they read as a soft cloud field from the
// surface to the high atmosphere. They are drawn without writing depth and from both sides, so they sort by distance and blend. A
// level at or below the ground the view draws is under the ground (the model extends below the terrain), so it gets no sheet.
//
// Built once for each answer, hour, height scale or ground height, with materials reused; `dispose()` frees everything. The groups are
// switched on and off with `.visible`, which does not rebuild anything; the Layer picker shows one sheet at a time with `showLayer`.
import {
  cloudSheetLevels, cloudSheetPixels, cloudStage, modelWinds, windsOverHome, meanFreezingFt, freezingWords, CLOUD_SHEET_PX,
} from './model-clouds.js';
import { AREA_FT, formatFeet } from './scene3d-model.js';

/** The groups the view's toggles switch. */
export const MODEL_GROUPS = Object.freeze(['low', 'mid', 'high', 'winds', 'freezing']);

const WIND_COLOUR = '#ffe9a8';
const FREEZING_COLOUR = '#7fd4ff';
/** The barb, in feet along the ground: staff length, feather length, the gap between feathers, and the line width. Smaller than before (Dad, 7 Oct: "too prominent"; about three quarters of the old size). */
const BARB = Object.freeze({ staff: 46_000, feather: 19_000, gap: 8_000, width: 2_700, station: 6_000 });
const SHEET_OPACITY = 0.12;
const LIFT_FT = 400; // as view3d.js: a line lies a little above what it follows

/** "850 hPa ≈ 4,900 ft": a level in words, height to the nearest 100 ft above sea level. */
export const sheetWords = (hPa, heightFt) => `${hPa} hPa ≈ ${formatFeet(Math.round(heightFt / 100) * 100)} ft`;

/**
 * Builds the layers. `T` is three.js; `model`, `hour` (index into model.times), `scale` (the height scale) and `groundFt` (the ground
 * the view draws, feet above sea level) as the view has them.
 *
 * Returns { root, labels, summary, showLayer(hPa | null), dispose() } where
 * - root: a Group holding one Group per MODEL_GROUPS entry (`root.userData.groups`);
 * - labels: [{ group, text, point: { x, y, z }, hPa? }], words to put beside points (a sheet's level, the freezing level, the winds over
 *   home); a sheet's label carries its `hPa` so the Layer picker can hide it with the sheet;
 * - summary: { sheets: [{ hPa, heightFt, stage, meanCover, maxCover, drawn, words }] (every level above the ground, bottom first; `drawn` is
 *   false for a level with no cloud, which has no sheet), layers: { low, mid, high } (counts of drawn sheets), barbs, freezingFt,
 *   freezingText, windsOverHome: [words] }; the freezing level is null (no sheet, no label) when the model has none anywhere for the hour;
 * - showLayer(hPa): shows only that level's sheet and label, or all of them for null (the stage toggles still apply, being groups).
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
  const owned = []; // every geometry, material and texture made here, freed together
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const labels = [];

  // ---- Cloud sheets: one see-through plane across the square at each level above the ground ----
  const sheetGeometry = own(new T.PlaneGeometry(AREA_FT, AREA_FT));
  const sheets = [];
  const meshes = new Map(); // hPa -> mesh
  const layers = { low: 0, mid: 0, high: 0 };
  const h2 = AREA_FT / 2;
  for (const level of cloudSheetLevels(model, hour)) {
    if (level.heightFt <= groundFt) continue; // under the ground the view draws
    const stage = cloudStage(level.heightFt - groundFt);
    const words = sheetWords(level.hPa, level.heightFt);
    const { pixels, drawn } = level.maxCover > 0 ? cloudSheetPixels(level.values, level.size, { px: CLOUD_SHEET_PX }) : { pixels: null, drawn: false };
    sheets.push({ hPa: level.hPa, heightFt: level.heightFt, stage, meanCover: level.meanCover, maxCover: level.maxCover, drawn, words });
    if (!drawn) continue;
    // A DataTexture has no row flip: row 0 is the plane's south edge, which is how cloudSheetPixels lays it out.
    const texture = own(new T.DataTexture(pixels, CLOUD_SHEET_PX, CLOUD_SHEET_PX, T.RGBAFormat));
    texture.colorSpace = T.SRGBColorSpace;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const mesh = new T.Mesh(sheetGeometry, own(new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false })));
    mesh.position.set(0, 0, level.heightFt * scale);
    mesh.renderOrder = 1;
    mesh.name = `cloud-${level.hPa}`;
    groups[stage].add(mesh);
    meshes.set(level.hPa, mesh);
    layers[stage] += 1;
    labels.push({ group: stage, text: words, point: { x: h2, y: h2, z: level.heightFt * scale }, hPa: level.hPa }); // the east corner, the right of the picture from the start view
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
  let freezingText = null;
  if (freezingFt !== null) {
    const z = freezingFt * scale;
    const sheet = new T.Mesh(
      own(new T.PlaneGeometry(AREA_FT, AREA_FT)),
      own(new T.MeshBasicMaterial({ color: FREEZING_COLOUR, transparent: true, opacity: SHEET_OPACITY, side: T.DoubleSide, depthWrite: false })),
    );
    sheet.position.set(0, 0, z);
    sheet.renderOrder = 0;
      const border = new T.LineLoop(
      own(new T.BufferGeometry().setFromPoints([new T.Vector3(-h2, -h2, z), new T.Vector3(h2, -h2, z), new T.Vector3(h2, h2, z), new T.Vector3(-h2, h2, z)])),
      own(new T.LineBasicMaterial({ color: FREEZING_COLOUR, transparent: true, opacity: 0.55 })),
    );
    groups.freezing.add(sheet, border);
    freezingText = freezingWords(freezingFt, groundFt);
    labels.push({ group: 'freezing', text: freezingText, point: { x: -h2, y: -h2, z } }); // the south-west corner: the left of the picture from the start view
  }

  return {
    root,
    labels,
    summary: { sheets, layers, barbs: winds.length, freezingFt, freezingText, windsOverHome: over.map((w) => w.words) },
    showLayer(hPa) {
      for (const [level, mesh] of meshes) mesh.visible = hPa === null || hPa === level;
    },
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
