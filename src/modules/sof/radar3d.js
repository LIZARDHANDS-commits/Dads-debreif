// Draws the SOF 3D view's radar with its real heights from NOAA MRMS (SOF-67; spec "3D view", "Radar with its real heights"). It only builds three.js objects (and one
// 2D canvas for the ground) from the plain data mrms-model.js works out; the feed is mrms-feed.js's and the page view3d.js's.
//
// - Performance: one see-through box a cell (about 4 km) from the ground to its 18 dBZ top in NOAA's colour for its composite echo, a narrower, stronger core up to its
//   30 dBZ top, and a flat tile for an echo weaker than 18 dBZ (no measured top). Three instanced meshes, one draw each.
// - High: the 12 heights as one see-through volume: a three.js Data3DTexture (one byte a cell: dBZ in half steps, mrms-model.js dbzCode) ray-marched in a small
//   shader through a box over the square, coloured and made more solid by the echo's strength at each height (a 256-entry palette of NOAA's colours). One draw.
//   Chosen over instanced cubes (the research's other option) because the volume draws every 1 km cell at every height in one draw whatever the weather (a squall
//   line can be half a million cells), never merges cells, and shows layers smoothly; the cost is per pixel, not per cell.
// - The ground: a picture of where MRMS has no coverage (grey hatching, never clear air) and the strip north of 55° N with its words, laid on the 3D ground with the
//   other pictures (view3d.js `getPictures`).
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale (`scale`).
import { dbzColour, codeDbz, kmToFt, MIN_DRAW_DBZ, NORTH_WORDS, northStrip, coverageMask } from './mrms-model.js';

/** A column is see-through at this opacity, its core at CORE_OPACITY and CORE_SHARE of its width, a weak echo's flat tile at FLAT_OPACITY. Estimates for the look. */
const COLUMN_OPACITY = 0.3;
const CORE_OPACITY = 0.55;
const CORE_SHARE = 0.55;
const FLAT_OPACITY = 0.45;
/** A flat tile is this thick (scene feet, not scaled) and lies this far above the ground so the ground never hides it. Estimates for the look. */
const FLAT_FT = 300;
const LIFT_FT = 500;
/** Neighbouring columns are kept apart by this share of a cell, so single cells still read as cells. An estimate for the look. */
const GAP = 0.08;

const own = (list, thing) => {
  list.push(thing);
  return thing;
};

function finish(root, owned, extra = {}) {
  return {
    root,
    ...extra,
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}

/** An instanced mesh of boxes standing on their bases: `items` [{ x, y, w, d, z0, z1, colour }] in scene feet (heights already scaled). */
function boxes(T, owned, items, opacity, order) {
  const geometry = own(owned, new T.BoxGeometry(1, 1, 1));
  geometry.translate(0, 0, 0.5);
  const material = own(owned, new T.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false }));
  const mesh = new T.InstancedMesh(geometry, material, items.length);
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const p = new T.Vector3();
  const s = new T.Vector3();
  const c = new T.Color();
  items.forEach((it, n) => {
    m.compose(p.set(it.x, it.y, it.z0), q, s.set(it.w, it.d, Math.max(1, it.z1 - it.z0)));
    mesh.setMatrixAt(n, m);
    c.setRGB(it.colour[0] / 255, it.colour[1] / 255, it.colour[2] / 255, T.SRGBColorSpace);
    mesh.setColorAt(n, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  own(owned, mesh);
  return mesh;
}

/**
 * Performance's columns (`columns` from mrms-model.js performanceColumns, feet above sea level) at height scale `scale`. Returns { root, count, dispose }.
 */
export function buildRadarColumns(T, { columns, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'mrms-columns';
  const tall = [];
  const cores = [];
  const flats = [];
  for (const col of columns) {
    const w = col.wFt * (1 - GAP);
    const d = col.dFt * (1 - GAP);
    if (col.flat) {
      flats.push({ x: col.x, y: col.y, w, d, z0: col.baseFt * scale + LIFT_FT, z1: col.baseFt * scale + LIFT_FT + FLAT_FT, colour: col.colour });
      continue;
    }
    tall.push({ x: col.x, y: col.y, w, d, z0: col.baseFt * scale, z1: col.topFt * scale, colour: col.colour });
    if (col.coreTopFt !== null) cores.push({ x: col.x, y: col.y, w: w * CORE_SHARE, d: d * CORE_SHARE, z0: col.baseFt * scale, z1: col.coreTopFt * scale, colour: col.colour });
  }
  if (flats.length) root.add(boxes(T, owned, flats, FLAT_OPACITY, 2));
  if (tall.length) root.add(boxes(T, owned, tall, COLUMN_OPACITY, 3));
  if (cores.length) root.add(boxes(T, owned, cores, CORE_OPACITY, 4));
  return finish(root, owned, { count: columns.length, tall: tall.length, cores: cores.length, flats: flats.length });
}

/**
 * The palette for High's volume: 256 entries, one per dBZ code (mrms-model.js dbzCode), each NOAA's colour for that dBZ and an opacity a 1 km cell that rises
 * steeply with the echo: about 0.01 at 20 dBZ, 0.05 at 30, 0.12 at 40, 0.26 at 50 and 0.6 at 65 dBZ, so light rain is a faint haze that a strong core shows
 * through (estimates for the look; with gentler steps the green shell of a storm hid its red core). Code 0 (no echo or no coverage) and anything under
 * MIN_DRAW_DBZ are clear.
 */
export function volumePalette() {
  const out = new Uint8Array(256 * 4);
  for (let code = 1; code < 256; code++) {
    const dbz = codeDbz(code);
    if (dbz < MIN_DRAW_DBZ) continue;
    const [r, g, b] = dbzColour(dbz);
    const t = Math.min(1, (dbz - MIN_DRAW_DBZ) / 60);
    out.set([r, g, b, Math.round(255 * Math.min(0.85, 0.004 + 0.6 * t ** 3))], code * 4);
  }
  return out;
}

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Ray-marches from where the view's ray enters the box (this face) to where it leaves it, front to back: each step reads the volume (linear between cells and
// between heights), looks up the colour and opacity a cell, and adds it scaled by the step's length in cells. Rays stop once nearly solid.
const FRAGMENT = /* glsl */ `
uniform sampler3D uVolume;
uniform sampler2D uPalette;
uniform vec3 uMin;
uniform vec3 uMax;
uniform vec2 uSqMin;
uniform vec2 uSqMax;
uniform float uLevelZ[LEVELS];
uniform float uCellFt;
uniform float uLayerFt;
varying vec3 vWorld;

float sliceOf(float z) {
  if (z <= uLevelZ[0]) return 0.0;
  for (int k = 0; k < LEVELS - 1; k++) {
    if (z <= uLevelZ[k + 1]) return float(k) + (z - uLevelZ[k]) / (uLevelZ[k + 1] - uLevelZ[k]);
  }
  return float(LEVELS - 1) + (z - uLevelZ[LEVELS - 1]) / uLayerFt;
}

void main() {
  vec3 dir = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(vWorld - cameraPosition);
  vec3 inv = 1.0 / dir;
  vec3 t0 = (uMin - vWorld) * inv;
  vec3 t1 = (uMax - vWorld) * inv;
  vec3 tFar = max(t0, t1);
  float tExit = min(min(tFar.x, tFar.y), tFar.z);
  if (tExit <= 0.0) discard;
  vec2 size = uSqMax - uSqMin;
  vec3 span = dir * tExit / vec3(uCellFt, uCellFt, uLayerFt);
  int steps = int(clamp(ceil(length(span) * 1.2), 4.0, float(MAX_STEPS)));
  float dt = tExit / float(steps);
  float cells = length(dir * dt / vec3(uCellFt, uCellFt, uLayerFt));
  vec4 acc = vec4(0.0);
  for (int k = 0; k < MAX_STEPS; k++) {
    if (k >= steps || acc.a > 0.96) break;
    vec3 p = vWorld + dir * ((float(k) + 0.5) * dt);
    float s = sliceOf(p.z);
    if (s > float(LEVELS) - 0.5) continue;
    vec3 uvw = vec3((p.x - uSqMin.x) / size.x, (uSqMax.y - p.y) / size.y, (s + 0.5) / float(LEVELS));
    float code = texture(uVolume, uvw).r * 255.0;
    vec4 c = texture2D(uPalette, vec2((code + 0.5) / 256.0, 0.5));
    float a = 1.0 - pow(1.0 - c.a, cells);
    acc.rgb += (1.0 - acc.a) * a * c.rgb;
    acc.a += (1.0 - acc.a) * a;
  }
  if (acc.a < 0.004) discard;
  gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
}`;

/** The most steps a ray takes through the volume (a long slanting ray through a 450 NM square crosses about 100 cells). An estimate for the cost. */
const MAX_STEPS = 192;

/**
 * The part of the volume that holds any echo worth drawing: { i0, i1, j0, j1, l1 } (cells, inclusive; l1 the highest height with one), with a cell of margin, or
 * null when there is none. The box drawn is cut to it, so rays run only where there is weather (the cost of the volume is per pixel).
 */
export function echoBounds({ n, codes, levelsKm }) {
  const min = Math.ceil((MIN_DRAW_DBZ + 32) * 2); // mrms-model.js dbzCode of MIN_DRAW_DBZ
  const plane = n * n;
  let i0 = n;
  let i1 = -1;
  let j0 = n;
  let j1 = -1;
  let l1 = -1;
  for (let l = 0; l < levelsKm.length; l++) {
    for (let j = 0; j < n; j++) {
      const row = l * plane + j * n;
      for (let i = 0; i < n; i++) {
        if (codes[row + i] < min) continue;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
        l1 = l;
      }
    }
  }
  if (l1 < 0) return null;
  return { i0: Math.max(0, i0 - 1), i1: Math.min(n - 1, i1 + 1), j0: Math.max(0, j0 - 1), j1: Math.min(n - 1, j1 + 1), l1: Math.min(levelsKm.length - 1, l1 + 1) };
}

/**
 * High's volume: `set` is mrms-feed.js's High set ({ n, halfFt, codes (n x n x levels, row 0 north), levelsKm }), standing from `groundFt` (the home field's ground;
 * the lowest height is drawn down to it, as rain to the ground) to half a layer over the highest height, at height scale `scale`. Returns { root, dispose }.
 */
export function buildRadarVolume(T, { set, scale, groundFt }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'mrms-volume';
  const { n, halfFt, codes, levelsKm } = set;
  const levels = levelsKm.length;
  const bounds = echoBounds(set);
  if (!bounds) return finish(root, owned, { bytes: 0, empty: true }); // no echo to draw: no box, no cost
  const texture = own(owned, new T.Data3DTexture(codes, n, n, levels));
  texture.format = T.RedFormat;
  texture.type = T.UnsignedByteType;
  texture.minFilter = T.LinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const palette = own(owned, new T.DataTexture(volumePalette(), 256, 1, T.RGBAFormat));
  palette.minFilter = T.NearestFilter;
  palette.magFilter = T.NearestFilter;
  palette.needsUpdate = true;
  const levelZ = levelsKm.map((km) => kmToFt(km) * scale);
  const layerFt = (levelZ[levels - 1] - levelZ[levels - 2]); // the spacing between the top two heights
  const bottom = Math.min(groundFt * scale, levelZ[0]);
  const cell = (2 * halfFt) / n;
  const top = bounds.l1 >= levels - 1 ? levelZ[levels - 1] + layerFt / 2 : levelZ[bounds.l1];
  const box = { x0: -halfFt + bounds.i0 * cell, x1: -halfFt + (bounds.i1 + 1) * cell, y0: halfFt - (bounds.j1 + 1) * cell, y1: halfFt - bounds.j0 * cell };
  const material = own(owned, new T.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { LEVELS: levels, MAX_STEPS },
    uniforms: {
      uVolume: { value: texture },
      uPalette: { value: palette },
      uMin: { value: new T.Vector3(box.x0, box.y0, bottom) },
      uMax: { value: new T.Vector3(box.x1, box.y1, top) },
      uSqMin: { value: new T.Vector2(-halfFt, -halfFt) },
      uSqMax: { value: new T.Vector2(halfFt, halfFt) },
      uLevelZ: { value: levelZ },
      uCellFt: { value: (2 * halfFt) / n },
      uLayerFt: { value: layerFt },
    },
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
  }));
  const geometry = own(owned, new T.BoxGeometry(box.x1 - box.x0, box.y1 - box.y0, top - bottom));
  geometry.translate((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (top + bottom) / 2);
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  own(owned, mesh);
  root.add(mesh);
  return finish(root, owned, { bytes: codes.length, bounds });
}

/** The ground picture is this many pixels across. An estimate: enough for the 1 km cells of a 450 NM square to read as a hatched area, and for the words. */
const GROUND_PX = 1024;

/**
 * The ground picture for a set (row 0 the north edge, the square's own size): grey hatching over each cell MRMS has no coverage for (never drawn as clear air),
 * and the strip north of 55° N darker with its words (spec). `doc` makes the canvas. Returns { canvas, gaps (share of the square with no coverage south of 55° N),
 * north (share of the square north of 55° N) }, or null when there is nothing to draw.
 */
export function coverageCanvas(doc, set) {
  const { n, halfFt } = set;
  const mask = coverageMask(set);
  const strip = northStrip(set.lat, set.lon, halfFt);
  const stripPx = Math.round(strip.share * GROUND_PX);
  const cellPx = GROUND_PX / n;
  const canvas = doc.createElement('canvas');
  canvas.width = GROUND_PX;
  canvas.height = GROUND_PX;
  const ctx = canvas.getContext('2d');
  const hatch = (colour, back) => {
    const tile = doc.createElement('canvas');
    tile.width = 16;
    tile.height = 16;
    const t = tile.getContext('2d');
    t.fillStyle = back;
    t.fillRect(0, 0, 16, 16);
    t.strokeStyle = colour;
    t.lineWidth = 3;
    t.beginPath();
    t.moveTo(-4, 20);
    t.lineTo(20, -4);
    t.moveTo(12, 20);
    t.lineTo(20, 12);
    t.moveTo(-4, 4);
    t.lineTo(4, -4);
    t.stroke();
    return ctx.createPattern(tile, 'repeat');
  };
  let gaps = 0;
  let south = 0;
  ctx.fillStyle = hatch('rgba(200, 200, 200, 0.55)', 'rgba(60, 60, 60, 0.25)');
  for (let j = 0; j < n; j++) {
    const y0 = j * cellPx;
    if (y0 + cellPx <= stripPx) continue; // the strip is drawn on its own
    for (let i = 0; i < n; i++) {
      if (mask[j * n + i]) {
        south += 1;
        continue;
      }
      // A run of gap cells along the row is one rectangle.
      let i1 = i;
      while (i1 + 1 < n && !mask[j * n + i1 + 1]) i1 += 1;
      ctx.fillRect(Math.floor(i * cellPx), Math.max(stripPx, Math.floor(y0)), Math.ceil((i1 - i + 1) * cellPx), Math.ceil(cellPx));
      gaps += i1 - i + 1;
      south += i1 - i + 1;
      i = i1;
    }
  }
  if (stripPx > 0) {
    ctx.fillStyle = hatch('rgba(220, 220, 220, 0.6)', 'rgba(30, 30, 30, 0.45)');
    ctx.fillRect(0, 0, GROUND_PX, stripPx);
    const size = Math.max(14, Math.min(48, Math.round(stripPx * 0.45)));
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(NORTH_WORDS, GROUND_PX / 2, stripPx / 2);
    ctx.fillText(NORTH_WORDS, GROUND_PX / 2, stripPx / 2);
  }
  if (!gaps && stripPx <= 0) return null;
  return { canvas, gaps: south ? gaps / south : 0, north: strip.share };
}
