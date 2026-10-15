// Draws the SOF 3D view's radar with its real heights from NOAA MRMS (SOF-67; spec "3D view", "Radar with its real heights"). It only builds three.js objects (and one
// 2D canvas for the ground) from the plain data mrms-model.js works out; the feed is mrms-feed.js's and the page view3d.js's.
//
// - Performance: one see-through box a cell (about 4 km) from the ground to its 18 dBZ top in NOAA's colour for its composite echo, a narrower, stronger core up to its
//   30 dBZ top, and a flat tile for an echo weaker than 18 dBZ (no measured top). Three instanced meshes, one draw each.
// - High: the 12 heights as one volume: a three.js Data3DTexture (dBZ in half steps, mrms-model.js dbzCode, lightly smoothed across cells) ray-marched in a small
//   shader through a box over the square, drawn as nested see-through shells (SOF-69; Dad, 14 Oct 2026): the surfaces where the echo reaches 10, 20, 40 and 50 dBZ
//   (mrms-model.js HIGH_SHELL_DBZ) in NOAA's blue, green, yellow and red, each faint where it faces the view, glowing at its outline, with faint lines every
//   5,000 ft, so the inside shows through; the map's own flat radar picture lies on the ground under them. One draw. Until V2.453 it was a fog that grew more
//   solid with the echo (Dad: "so thick it blocks alot of data"). Chosen over instanced cubes (the research's other option) because the volume draws every 1 km
//   cell at every height in one draw whatever the weather (a squall line can be half a million cells) and never merges cells; the cost is per pixel, not per cell.
// - The ground: a picture of where MRMS has no coverage (grey hatching, never clear air) and the strip north of 55° N with its words, laid on the 3D ground with the
//   other pictures (view3d.js `getPictures`).
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale (`scale`).
import { dbzCode, kmToFt, MIN_DRAW_DBZ, NORTH_WORDS, northStrip, coverageMask, HIGH_SHELL_DBZ, shellColours } from './mrms-model.js';

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
 * How each of High's shells is drawn (SOF-69; Dad, 14 Oct 2026: "so thick it blocks alot of data", and his picture of thin, see-through, wispy shells), one entry
 * per HIGH_SHELL_DBZ, outermost first. A shell seen square-on adds only FACE_OPACITY, so the inside reads through it; where it is seen edge-on (its outline) it adds
 * up to EDGE_OPACITY more, falling off as (1 - |cos|)^EDGE_POWER of the angle between the view and the surface, and is lit towards white by EDGE_WHITE: a faint
 * glowing outline, like a fresnel or silhouette glow. Inner, stronger shells are a little more solid so a red core shows through the green and blue round it.
 * Faint lines lie on each shell every CONTOUR_FT above sea level (LINE_OPACITY, about LINE_PX pixels wide), the "contour-like lines" of Dad's picture, which also
 * give the shells' heights. All estimates for the look.
 */
const FACE_OPACITY = [0.02, 0.03, 0.12, 0.2];
const EDGE_OPACITY = [0.4, 0.4, 0.65, 0.8];
const EDGE_POWER = 3;
/** Which shells read the more smoothed strength (smoothedCodes): blue, green and yellow; the red core the lightly smoothed one, so a small core keeps its strength. */
const OUTER_SHELL = [1, 1, 1, 0];
const EDGE_WHITE = 0.45;
const LINE_OPACITY = [0.3, 0.3, 0.35, 0.35];
export const CONTOUR_FT = 5000;
const LINE_PX = 1.5;

const VERTEX = /* glsl */ `
uniform float uHalfPx;
varying vec3 vWorld;
varying float vPixel;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  // How wide one pixel is at one foot from the camera (perspective) or anywhere (orthographic), for the contour lines' width: the half-height the view sees over
  // half the canvas's height (uHalfPx).
  vPixel = 1.0 / (projectionMatrix[1][1] * uHalfPx);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Ray-marches from where the view's ray enters the box (this face) to where it leaves it, front to back, reading the echo's strength at each step (linear between
// cells and between heights). Where the strength passes one of the shells' thresholds between two steps, the ray has crossed that shell: the crossing is placed
// between the two steps, the shell's direction there is taken from how the strength changes around it (its gradient), and the shell's colour is added, faint where
// it faces the view and stronger at its outline, with its contour lines. The ray carries on through, so the inner shells show.
const FRAGMENT = /* glsl */ `
uniform sampler3D uVolume;
uniform vec3 uMin;
uniform vec3 uMax;
uniform vec2 uSqMin;
uniform vec2 uSqMax;
uniform float uLevelZ[LEVELS];
uniform float uCellFt;
uniform float uLayerFt;
uniform vec4 uThreshold;
uniform vec4 uOuter;
uniform vec3 uColour[4];
uniform vec4 uFace;
uniform vec4 uEdge;
uniform vec4 uLine;
uniform float uContourFt;
varying vec3 vWorld;
varying float vPixel;

// The height z as a fractional slice of the volume (0 at the lowest height and below it, so the lowest height reaches down to the ground; past the highest by the
// top layer's spacing). lev is the layer z was last in (the height at or under it): it is moved up or down from there, as a ray moves only a little between
// steps, so a step does not search all the heights.
float sliceOf(float z, inout int lev) {
  if (z <= uLevelZ[0]) {
    lev = 0;
    return 0.0;
  }
  for (int k = 0; k < LEVELS; k++) {
    if (lev < LEVELS - 1 && z > uLevelZ[lev + 1]) lev++;
    else if (z < uLevelZ[lev]) lev--;
    else break;
  }
  if (lev >= LEVELS - 1) return float(LEVELS - 1) + (z - uLevelZ[LEVELS - 1]) / uLayerFt;
  return float(lev) + (z - uLevelZ[lev]) / (uLevelZ[lev + 1] - uLevelZ[lev]);
}

// Where a point lies on the square (0 to 1 east and south, as the volume's rows run from the north).
vec2 squareAt(vec3 p) {
  vec2 size = uSqMax - uSqMin;
  return vec2((p.x - uSqMin.x) / size.x, (uSqMax.y - p.y) / size.y);
}

// The echo's strength (dbzCode: 0 no echo or no coverage) at a place on the square and a height as a fractional slice (sliceOf), lightly smoothed (x, for the
// inner shells) and more (y, for the outer ones); none above half a layer over the highest height; the lowest height reaches down to the ground.
vec2 strength(vec2 at, float s) {
  if (s > float(LEVELS) - 0.5) return vec2(0.0);
  return texture(uVolume, vec3(at, (s + 0.5) / float(LEVELS))).rg * 255.0;
}

// Feet between the heights either side of slice s (the top layer's spacing above the highest).
float spacingAt(float s) {
  if (s >= float(LEVELS - 1)) return uLayerFt;
  int k = clamp(int(s), 0, LEVELS - 2);
  return uLevelZ[k + 1] - uLevelZ[k];
}

float pick(vec4 v, int i) { return i == 0 ? v.x : i == 1 ? v.y : i == 2 ? v.z : v.w; }

void main() {
  vec3 dir = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(vWorld - cameraPosition);
  // Where the ray enters and leaves the box, from the camera (from the camera itself when it is inside the box: then the box's far faces are drawn), or for a
  // flat (orthographic) view from this face.
  vec3 origin = isOrthographic ? vWorld : cameraPosition;
  vec3 inv = 1.0 / dir;
  vec3 t0 = (uMin - origin) * inv;
  vec3 t1 = (uMax - origin) * inv;
  vec3 tNear = min(t0, t1);
  vec3 tFar = max(t0, t1);
  float tEnter = max(max(tNear.x, tNear.y), tNear.z);
  if (!isOrthographic) tEnter = max(tEnter, 0.0);
  float run = min(min(tFar.x, tFar.y), tFar.z) - tEnter; // feet of ray inside the box
  if (run <= 0.0) discard;
  vec3 start = origin + dir * tEnter;
  vec3 span = dir * run / vec3(uCellFt, uCellFt, uLayerFt);
  int steps = int(clamp(ceil(length(span)), 4.0, float(MAX_STEPS))); // about a step a cell: the crossings are placed between steps, so no finer is needed
  float dt = run / float(steps);
  vec2 size = uSqMax - uSqMin;
  vec2 east = vec2(uCellFt / size.x, 0.0);
  vec2 north = vec2(0.0, -uCellFt / size.y);
  vec4 acc = vec4(0.0);
  vec3 pPrev = start;
  int lev = 0;
  float sPrev = sliceOf(pPrev.z, lev);
  vec2 prev2 = strength(squareAt(pPrev), sPrev);
  for (int k = 1; k <= MAX_STEPS; k++) {
    if (k > steps || acc.a > 0.97) break;
    vec3 pNow = start + dir * (float(k) * dt);
    float sNow = sliceOf(pNow.z, lev);
    vec2 now2 = strength(squareAt(pNow), sNow);
    // Each shell's strength before and after this step (the outer shells read the more smoothed strength), and which shells the step crossed: all four at once.
    vec4 before4 = mix(vec4(prev2.x), vec4(prev2.y), uOuter);
    vec4 after4 = mix(vec4(now2.x), vec4(now2.y), uOuter);
    vec4 crossed = abs(step(uThreshold, after4) - step(uThreshold, before4));
    if (crossed != vec4(0.0)) {
      bool rising = now2.x + now2.y > prev2.x + prev2.y;
      for (int m = 0; m < 4; m++) {
        int i = rising ? m : 3 - m; // the nearer shell first, near enough
        if (pick(crossed, i) == 0.0) continue;
        bool outer = pick(uOuter, i) > 0.5;
        float before = pick(before4, i);
        float after = pick(after4, i);
        float limit = pick(uThreshold, i);
        // The crossing, between the two steps (its slice too: the steps are short, so it is near enough straight between them).
        float f = (limit - before) / (after - before);
        vec3 p = mix(pPrev, pNow, f);
        float s = mix(sPrev, sNow, f);
        vec2 at = squareAt(p);
        // The shell's direction: how the strength changes a cell east, a cell north and a quarter of a layer up from the crossing (where it is the threshold),
        // each per cell's width of feet.
        vec2 gx = strength(at + east, s) - limit;
        vec2 gy = strength(at + north, s) - limit;
        vec2 gz = (strength(at, s + 0.25) - limit) * uCellFt / (0.25 * spacingAt(s));
        vec3 grad = outer ? vec3(gx.y, gy.y, gz.y) : vec3(gx.x, gy.x, gz.x);
        float len = length(grad);
        vec3 n = len > 0.0 ? grad / len : -dir;
        float rim = pow(1.0 - abs(dot(n, dir)), EDGE_POWER);
        // Contour lines: how far this point is from the nearest line height, measured along the shell (a flat top has none).
        float slope = sqrt(max(0.0, 1.0 - n.z * n.z));
        float off = abs(fract(p.z / uContourFt + 0.5) - 0.5) * uContourFt;
        float width = LINE_PX * vPixel * (isOrthographic ? 1.0 : distance(p, cameraPosition));
        float line = slope > 0.2 ? 1.0 - smoothstep(0.5 * width, width, off / slope) : 0.0;
        float a = min(0.9, pick(uFace, i) + pick(uEdge, i) * rim + pick(uLine, i) * line);
        vec3 c = mix(uColour[i], vec3(1.0), EDGE_WHITE * max(rim, line));
        acc.rgb += (1.0 - acc.a) * a * c;
        acc.a += (1.0 - acc.a) * a;
      }
    }
    pPrev = pNow;
    sPrev = sNow;
    prev2 = now2;
  }
  if (acc.a < 0.004) discard;
  gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
}`;

/** The most steps a ray takes through the volume (a long slanting ray through a 450 NM square crosses about 100 cells). An estimate for the cost. */
const MAX_STEPS = 192;

/**
 * The part of the volume that holds any echo worth drawing: { i0, i1, j0, j1, l1 } (cells, inclusive; l1 the highest height with one), with `margin` cells round it and a height over it, or
 * null when there is none. The box drawn is cut to it, so rays run only where there is weather (the cost of the volume is per pixel).
 */
export function echoBounds({ n, codes, levelsKm }, margin = 1) {
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
  return { i0: Math.max(0, i0 - margin), i1: Math.min(n - 1, i1 + margin), j0: Math.max(0, j0 - margin), j1: Math.min(n - 1, j1 + margin), l1: Math.min(levelsKm.length - 1, l1 + 1) };
}

/** The box is cut this many cells round the echo, so the smoothing's spread (below) stays inside it. */
const SMOOTH_MARGIN = 3;

/**
 * Smoothed copies of High's volume for drawing (the set's own codes, which the corridor check reads, are left as they are), two bytes a cell: the first lightly
 * smoothed, for the red core (1-2-1 east-west and north-south: a core of two or three cells keeps its strength), the second more (1-4-6-4-1 each way, about a
 * cell's spread), for the blue, green and yellow shells (OUTER_SHELL), where weak echo near a threshold otherwise breaks into speckle that looked like grass.
 * Only inside `bounds` (echoBounds) and up to its highest height (elsewhere none: nothing there reaches MIN_DRAW_DBZ); no smoothing between heights (they are
 * 1 to 2 km apart). Whole numbers, one sweep a height: about 0.11 s in Node and 0.15 to 0.3 s in headless Chromium for a 450 NM square full of rain (14 Oct
 * 2026), once a radar update. Estimates for the look.
 */
export function smoothedCodes({ n, codes, levelsKm }, bounds) {
  const plane = n * n;
  const out = new Uint8Array(plane * levelsKm.length * 2);
  const { i0, i1, j0, j1 } = bounds;
  const last = n - 1;
  const r0 = Math.max(0, j0 - 2);
  const r1 = Math.min(last, j1 + 2);
  const h3 = new Uint16Array(plane); // 1-2-1 east-west, at most 4 x 255
  const h5 = new Uint16Array(plane); // 1-4-6-4-1 east-west, at most 16 x 255
  for (let l = 0; l <= bounds.l1; l++) {
    const base = l * plane;
    for (let j = r0; j <= r1; j++) {
      const row = base + j * n;
      const at = j * n;
      for (let i = i0; i <= i1; i++) {
        // Neighbours past the square's edge read its edge cell.
        const c = codes[row + i];
        const w1 = codes[row + (i > 0 ? i - 1 : 0)];
        const e1 = codes[row + (i < last ? i + 1 : last)];
        const w2 = codes[row + (i > 1 ? i - 2 : 0)];
        const e2 = codes[row + (i < last - 1 ? i + 2 : last)];
        h3[at + i] = w1 + 2 * c + e1;
        h5[at + i] = w2 + e2 + 4 * (w1 + e1) + 6 * c;
      }
    }
    for (let j = j0; j <= j1; j++) {
      const at = j * n;
      const n1 = (j > 0 ? j - 1 : 0) * n;
      const s1 = (j < last ? j + 1 : last) * n;
      const n2 = (j > 1 ? j - 2 : 0) * n;
      const s2 = (j < last - 1 ? j + 2 : last) * n;
      let k = 2 * (base + at + i0);
      for (let i = i0; i <= i1; i++, k += 2) {
        out[k] = (h3[n1 + i] + 2 * h3[at + i] + h3[s1 + i] + 8) >> 4;
        out[k + 1] = (h5[n2 + i] + h5[s2 + i] + 4 * (h5[n1 + i] + h5[s1 + i]) + 6 * h5[at + i] + 128) >> 8;
      }
    }
  }
  return out;
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
  const bounds = echoBounds(set, SMOOTH_MARGIN);
  if (!bounds) return finish(root, owned, { bytes: 0, empty: true }); // no echo to draw: no box, no cost
  const texture = own(owned, new T.Data3DTexture(smoothedCodes(set, bounds), n, n, levels));
  texture.format = T.RGFormat;
  texture.type = T.UnsignedByteType;
  texture.minFilter = T.LinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const levelZ = levelsKm.map((km) => kmToFt(km) * scale);
  const layerFt = (levelZ[levels - 1] - levelZ[levels - 2]); // the spacing between the top two heights
  const bottom = Math.min(groundFt * scale, levelZ[0]);
  const cell = (2 * halfFt) / n;
  const top = bounds.l1 >= levels - 1 ? levelZ[levels - 1] + layerFt / 2 : levelZ[bounds.l1];
  const box = { x0: -halfFt + bounds.i0 * cell, x1: -halfFt + (bounds.i1 + 1) * cell, y0: halfFt - (bounds.j1 + 1) * cell, y1: halfFt - bounds.j0 * cell };
  const vec4 = (list) => new T.Vector4(...list);
  const material = own(owned, new T.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { LEVELS: levels, MAX_STEPS, EDGE_POWER: EDGE_POWER.toFixed(1), EDGE_WHITE: EDGE_WHITE.toFixed(2), LINE_PX: LINE_PX.toFixed(2) },
    uniforms: {
      uVolume: { value: texture },
      uMin: { value: new T.Vector3(box.x0, box.y0, bottom) },
      uMax: { value: new T.Vector3(box.x1, box.y1, top) },
      uSqMin: { value: new T.Vector2(-halfFt, -halfFt) },
      uSqMax: { value: new T.Vector2(halfFt, halfFt) },
      uLevelZ: { value: levelZ },
      uCellFt: { value: cell },
      uLayerFt: { value: layerFt },
      uThreshold: { value: vec4(HIGH_SHELL_DBZ.map(dbzCode)) },
      uOuter: { value: vec4(OUTER_SHELL) }, // 1 where a shell reads the more smoothed strength
      uColour: { value: shellColours().map(([r, g, b]) => new T.Vector3(r / 255, g / 255, b / 255)) }, // as the screen shows them (the shader writes them as they are)
      uFace: { value: vec4(FACE_OPACITY) },
      uEdge: { value: vec4(EDGE_OPACITY) },
      uLine: { value: vec4(LINE_OPACITY) },
      uContourFt: { value: CONTOUR_FT * scale },
      uHalfPx: { value: 500 },
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
  const drawn = new T.Vector2();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    material.uniforms.uHalfPx.value = renderer.getDrawingBufferSize(drawn).y / 2; // the contour lines' width in pixels
    // With the camera inside the box (zoomed in low over wide weather) its near faces are behind the camera, so the far faces are drawn instead and the rays start
    // at the camera; they are not hidden by the ground then (the box's floor is the home field's ground, under any higher terrain). Until V2.453 nothing drew there.
    const p = camera.position;
    const m = 2 * (camera.near ?? 0);
    const inside = Boolean(camera.isPerspectiveCamera) && p.x > box.x0 - m && p.x < box.x1 + m && p.y > box.y0 - m && p.y < box.y1 + m && p.z > bottom - m && p.z < top + m;
    material.side = inside ? T.BackSide : T.FrontSide;
    material.depthTest = !inside;
  };
  own(owned, mesh);
  root.add(mesh);
  return finish(root, owned, { bytes: codes.length * 2, bounds });
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
