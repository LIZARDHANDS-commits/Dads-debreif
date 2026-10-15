// Draws the SOF 3D view's weather layers (SOF-39, SOF-42; Dad, 7 Oct): radar blocks in the model cloud with a faint rain curtain below (Dad, 8 Oct), lightning bolts, a faint satellite cloud sheet, the surface fronts
// and the drifting wind streaks. It only builds three.js objects from the plain data weather3d-model.js works out; the page (buttons, labels, the picture reads) is view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale (`scale`), the same reference as the cloud
// sheets and decks. Every builder returns an object with its own `dispose()` that frees the geometry, materials and textures it made, and each leaves its root for the
// caller to add to the scene and switch with `.visible` (no toggle rebuilds anything).
import { AREA_FT } from './scene3d-model.js';
import { cellFt, FRONT_LINE_FT, FRONT_WALL_FT, SYMBOL_FT, FLOW_TAIL_MIN_FT } from './weather3d-model.js';

/** Lines and fills lie this far (scene feet) above the ground so it never hides them, as view3d.js's own LIFT_FT. */
const LIFT_FT = 500;
/** A radar block is a see-through column: radar's own colour at this opacity. An estimate for the look. */
const SHAFT_OPACITY = 0.34;
/** Neighbouring blocks are kept apart by this share of a radar cell, so a merged block still reads as separate from the next. An estimate for the look. */
const SHAFT_GAP = 0.1; // estimate, a share of a radar cell
/**
 * The rain curtain under a block is much fainter: thin vertical streaks (RAIN_STREAKS, alpha 0 to 255 across a face) at RAIN_OPACITY, so the streaks are at most this
 * opaque and about a third of it on average (about 0.1, under a third of a block's), and RAIN_INSET of a cell narrower than its block each way (a lone cell's curtain is
 * 0.7 of a cell wide, as V2.196's). The streaks keep the same spacing however wide a merged block's curtain is. Estimates for the look (Dad, 8 Oct 2026).
 */
const RAIN_OPACITY = 0.3; // estimate
const RAIN_INSET = 0.3; // estimate, a share of a radar cell
const RAIN_STREAKS = [255, 40, 0, 160, 0, 0, 220, 30, 0, 120, 0, 200, 0, 0, 90, 0];
/**
 * A bolt (Dad, 15 Oct 2026, on V2.437's thick yellow posts: "maybe like bright neon line then a fade at the same rate of the time stamps"): a thin jagged line, white-hot
 * at its core (BOLT_CORE), inside a faint yellow glow column BOLT_GLOW_FT wide (BOLT_GLOW at BOLT_GLOW_OPACITY), with a small glow on the ground BOLT_SPLASH_FT across
 * where it struck. All of it adds light (additive blending, no depth written), so a bolt brightens what is behind it and never hides the radar. A bolt's `alpha` (0 to 1,
 * the age steps strikes-model.js MARK_AGES gives the 2D crosses; 1 without one) dims all three. BOLT_KINKS segments, each kinked sideways up to BOLT_JITTER_FT, the
 * same for the same place every time (no flicker on a rebuild). Estimates for the look.
 */
const BOLT_CORE = 0xfff7c8;
const BOLT_GLOW = 0xffd21a;
const BOLT_GLOW_FT = 2200;
const BOLT_GLOW_OPACITY = 0.32;
const BOLT_SPLASH_FT = 2600;
const BOLT_SPLASH_OPACITY = 0.7;
const BOLT_KINKS = 7;
const BOLT_JITTER_FT = 1400;
const FLOW_COLOURS = ['#a8e0ff', '#dff3ff', '#ffe9b0']; // 850, 700 and 500 hPa, low to high, a slight tint a level
/** How bright a streak's head is (0 to 1): faint (Dad, 7 Oct: "faint short streaks"). */
const FLOW_BRIGHTNESS = 0.4;

const own = (list, thing) => {
  list.push(thing);
  return thing;
};

function finish(T, root, owned, extra = {}) {
  return {
    root,
    ...extra,
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}

/**
 * The radar blocks (`shafts` from weather3d-model.js): one see-through box for each block, `wFt` by `dFt` less a tenth of a cell's gap, from its base to its top, in the
 * radar's colour, and under each block with a `rain` part one faint, streaked, narrower box (three tenths of a cell narrower each way) from the ground to the block's base
 * in the same colour. Two instanced meshes, one draw each, one box a block and one curtain a wet block. Returns { root, count, rain (the curtains' group, for the "Rain to
 * ground" switch), dispose }.
 */
export function buildShafts(T, { shafts, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'radar-shafts';
  const rainGroup = new T.Group();
  rainGroup.name = 'radar-rain';
  root.add(rainGroup);
  const cell = cellFt();
  const m = new T.Matrix4();
  const colour = new T.Color();
  const place = (mesh, list, partOf, inset) => {
    list.forEach((s, n) => {
      const part = partOf(s);
      const w = Math.max(1, (s.wFt ?? cell) - inset * cell);
      const d = Math.max(1, (s.dFt ?? cell) - inset * cell);
      m.compose(new T.Vector3(s.x, s.y, part.baseFt * scale), new T.Quaternion(), new T.Vector3(w, d, Math.max(1, (part.topFt - part.baseFt) * scale)));
      mesh.setMatrixAt(n, m);
      colour.setRGB(s.colour[0] / 255, s.colour[1] / 255, s.colour[2] / 255, T.SRGBColorSpace);
      mesh.setColorAt(n, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    own(owned, mesh);
  };
  if (shafts.length) {
    const geometry = own(owned, new T.BoxGeometry(1, 1, 1));
    geometry.translate(0, 0, 0.5); // the base at z = 0, so a box scales up from its base
    const material = own(owned, new T.MeshBasicMaterial({ transparent: true, opacity: SHAFT_OPACITY, depthWrite: false }));
    const mesh = new T.InstancedMesh(geometry, material, shafts.length);
    place(mesh, shafts, (s) => s, SHAFT_GAP);
    mesh.renderOrder = 3;
    root.add(mesh);
  }
  const wet = shafts.filter((s) => s.rain);
  if (wet.length) {
    // The box is turned so each side's texture runs up the side (BoxGeometry's own "height" is its y), then stood on its base like the blocks.
    const geometry = own(owned, new T.BoxGeometry(1, 1, 1));
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, 0.5);
    const texel = new Uint8Array(RAIN_STREAKS.length * 4 * 4);
    for (let row = 0; row < 4; row++) {
      RAIN_STREAKS.forEach((a, k) => texel.set([255, 255, 255, a], (row * RAIN_STREAKS.length + k) * 4));
    }
    const texture = own(owned, new T.DataTexture(texel, RAIN_STREAKS.length, 4, T.RGBAFormat));
    texture.wrapS = T.RepeatWrapping;
    texture.generateMipmaps = true; // far off the streaks blend to a faint even column instead of shimmering
    texture.minFilter = T.LinearMipmapLinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.needsUpdate = true;
    const material = own(owned, new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: RAIN_OPACITY, depthWrite: false }));
    // Each side's streaks repeat once for every lone cell's curtain width along it, so a wide merged curtain has more streaks, not wider ones. After the turn above
    // every side's texture runs across it horizontally: a side facing east or west spans the box's north-south size (the instance's y scale), the others its x scale.
    const across = (1 - RAIN_INSET) * cell;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  vMapUv.x *= ( abs( normal.x ) > 0.5 ? length( instanceMatrix[ 1 ].xyz ) : length( instanceMatrix[ 0 ].xyz ) ) / ${across.toFixed(1)};
#endif`);
    };
    material.customProgramCacheKey = () => `radar-rain-${across.toFixed(1)}`;
    const mesh = new T.InstancedMesh(geometry, material, wet.length);
    place(mesh, wet, (s) => s.rain, RAIN_INSET);
    mesh.renderOrder = 2;
    rainGroup.add(mesh);
  }
  return finish(T, root, owned, { count: shafts.length, rain: rainGroup });
}

/** A number 0 to 1 that is always the same for the same place and step (a small hash), so a bolt's kinks don't move when it is built again. */
const kink = (x, y, k) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * The lightning bolts (`bolts`, each { x, y, baseFt, topFt, alpha? }): a thin neon line kinked from the cloud top down to the ground, in a faint glow column, with a glow
 * on the ground where it struck (see BOLT_CORE). Three draws whatever the number of bolts (one line set, two instanced meshes). Returns { root, count, dispose }.
 */
export function buildBolts(T, { bolts, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'lightning-bolts';
  if (bolts.length) {
    const core = new T.Color(BOLT_CORE);
    const glow = new T.Color(BOLT_GLOW);
    const strength = (b) => (typeof b.alpha === 'number' && b.alpha >= 0 && b.alpha <= 1 ? b.alpha : 1);
    // The core: BOLT_KINKS segments a bolt as one line set, each point's colour the core's dimmed by the bolt's age (added light: dimmer is fainter).
    const points = new Float32Array(bolts.length * BOLT_KINKS * 6);
    const colours = new Float32Array(bolts.length * BOLT_KINKS * 6);
    let p = 0;
    for (const b of bolts) {
      const a = strength(b);
      const z0 = b.baseFt * scale;
      const z1 = Math.max(z0 + 1, b.topFt * scale);
      let prev = [b.x, b.y, z1];
      for (let k = 1; k <= BOLT_KINKS; k++) {
        const end = k === BOLT_KINKS; // the last point is the strike itself, on the ground
        const next = end ? [b.x, b.y, z0] : [b.x + (kink(b.x, b.y, k) * 2 - 1) * BOLT_JITTER_FT, b.y + (kink(b.y, b.x, k) * 2 - 1) * BOLT_JITTER_FT, z1 + ((z0 - z1) * k) / BOLT_KINKS];
        for (const q of [prev, next]) {
          points.set(q, p);
          colours.set([core.r * a, core.g * a, core.b * a], p);
          p += 3;
        }
        prev = next;
      }
    }
    const lineGeometry = own(owned, new T.BufferGeometry());
    lineGeometry.setAttribute('position', new T.BufferAttribute(points, 3));
    lineGeometry.setAttribute('color', new T.BufferAttribute(colours, 3));
    const lines = new T.LineSegments(lineGeometry, own(owned, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false })));
    lines.renderOrder = 7;
    lines.frustumCulled = false;
    root.add(lines);

    // The glow column round each bolt and the glow on the ground, each an instanced mesh coloured per bolt by its age.
    const add = (geometry, opacity, place) => {
      const material = own(owned, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
      const mesh = new T.InstancedMesh(geometry, material, bolts.length);
      const m = new T.Matrix4();
      const c = new T.Color();
      bolts.forEach((b, n) => {
        mesh.setMatrixAt(n, place(b, m));
        mesh.setColorAt(n, c.copy(glow).multiplyScalar(strength(b)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      own(owned, mesh);
      root.add(mesh);
    };
    const column = own(owned, new T.CylinderGeometry(0.5, 0.5, 1, 8, 1, true));
    column.rotateX(Math.PI / 2);
    column.translate(0, 0, 0.5);
    add(column, BOLT_GLOW_OPACITY, (b, m) => m.compose(new T.Vector3(b.x, b.y, b.baseFt * scale), new T.Quaternion(), new T.Vector3(BOLT_GLOW_FT, BOLT_GLOW_FT, Math.max(1, (b.topFt - b.baseFt) * scale))));
    add(own(owned, new T.CircleGeometry(0.5, 20)), BOLT_SPLASH_OPACITY, (b, m) => m.compose(new T.Vector3(b.x, b.y, b.baseFt * scale + LIFT_FT), new T.Quaternion(), new T.Vector3(BOLT_SPLASH_FT, BOLT_SPLASH_FT, 1)));
  }
  return finish(T, root, owned, { count: bolts.length });
}

/**
 * The satellite sheet: a see-through plane over the whole square at `heightFt` (feet above sea level) with `canvas` as its picture (satellitePixels drawn onto it; its
 * top is north). Returns { root, setOpacity(0 to 1), dispose }.
 */
export function buildSatelliteSheet(T, { canvas, heightFt, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'satellite-sheet';
  const texture = own(owned, new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  const mesh = new T.Mesh(
    own(owned, new T.PlaneGeometry(AREA_FT, AREA_FT)),
    own(owned, new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide })),
  );
  mesh.position.z = heightFt * scale;
  mesh.renderOrder = 1;
  own(owned, mesh);
  root.add(mesh);
  // The whole sheet's opacity, 0 to 1 (the picture's own faintness is in its pixels): the view lowers it as the camera comes close, so a haze high above the ground does
  // not hide a circuit being looked at.
  return finish(T, root, owned, { setOpacity: (o) => { mesh.material.opacity = o; } });
}

// ---- Fronts ---------------------------------------------------------------------------------------------------------

/** Pushes a ribbon (two triangles) along a-b, `w` wide, lying at height za at a and zb at b. */
function pushRibbon(out, a, b, w, za, zb = za) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  const p = [[a[0] + nx, a[1] + ny, za], [a[0] - nx, a[1] - ny, za], [b[0] - nx, b[1] - ny, zb], [b[0] + nx, b[1] + ny, zb]];
  for (const k of [0, 1, 2, 0, 2, 3]) out.push(p[k][0], p[k][1], p[k][2]);
}

/** Pushes a vertical quad up from a-b, from height z0 to z1 at a and from z0b to z1b at b (the same at both unless the ground slopes). */
function pushWall(out, a, b, z0, z1, z0b = z0, z1b = z1) {
  const q = [[a[0], a[1], z0], [b[0], b[1], z0b], [b[0], b[1], z1b], [a[0], a[1], z1]];
  for (const k of [0, 1, 2, 0, 2, 3]) out.push(...q[k]);
}

/** A triangle standing on the line: its base on the line (centred on the point) and its tip towards the normal. `zAt(x, y)` gives each corner's height. */
function pushTriangle(out, s, zAt) {
  const half = SYMBOL_FT / 2;
  for (const [x, y] of [[s.x - s.dx * half, s.y - s.dy * half], [s.x + s.dx * half, s.y + s.dy * half], [s.x + s.nx * SYMBOL_FT * 0.9, s.y + s.ny * SYMBOL_FT * 0.9]]) out.push(x, y, zAt(x, y));
}

/** A half circle standing on the line: its flat side on the line (centred on the point), bulging towards the normal. */
function pushSemicircle(out, s, zAt, pieces = 10) {
  const r = SYMBOL_FT / 2;
  let prev = [s.x - s.dx * r, s.y - s.dy * r];
  for (let k = 1; k <= pieces; k++) {
    const a = Math.PI - (k / pieces) * Math.PI; // from the line's start, over the bulge, to its end
    const next = [s.x + s.dx * r * Math.cos(a) + s.nx * r * Math.sin(a), s.y + s.dy * r * Math.cos(a) + s.ny * r * Math.sin(a)];
    out.push(s.x, s.y, zAt(s.x, s.y), prev[0], prev[1], zAt(prev[0], prev[1]), next[0], next[1], zAt(next[0], next[1]));
    prev = next;
  }
}

/** A segment as pieces no longer than `step` feet (or itself when it is already short or `step` is infinite): [[a, b], ...]. */
function pieces(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push([[a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n]]);
  }
  return out;
}

/** With terrain, a front's line is cut into pieces this long so each lies on the ground under it (feet, about 3 NM). An estimate for the look. */
const FRONT_FOLLOW_STEP_FT = 18_000;

/**
 * The fronts (`frontGeometry` from weather3d-model.js) on the ground at `groundFt`: each as a ribbon in its colour, the cold triangles and warm half circles along it, and a
 * faint wall FRONT_WALL_FT tall (×scale) along it. Returns { root, count, dispose } and `root.userData.groups` = { lines, walls }, so the wall can be switched off.
 * With `groundAt(x, y)` (feet above sea level; the view's terrain) the ribbons, symbols and walls stand on the ground under them, the line cut into short pieces to do so;
 * without it everything stands on the flat ground at `groundFt`.
 */
export function buildFronts(T, { geometry, scale, groundFt, groundAt = null }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'fronts';
  const ground = groundAt ?? (() => groundFt);
  const step = groundAt ? FRONT_FOLLOW_STEP_FT : Infinity;
  const zAt = (x, y) => ground(x, y) * scale + LIFT_FT;
  const lines = new Map(); // colour -> positions
  const walls = new Map();
  const fills = new Map();
  const add = (map, colour) => {
    if (!map.has(colour)) map.set(colour, []);
    return map.get(colour);
  };
  for (const line of geometry.lines) {
    line.segments.forEach((seg, n) => {
      const colour = line.colours?.[n] ?? line.colour;
      for (const [a, b] of pieces(seg[0], seg[1], step)) {
        const ga = ground(a[0], a[1]) * scale;
        const gb = ground(b[0], b[1]) * scale;
        pushRibbon(add(lines, colour), a, b, FRONT_LINE_FT, ga + LIFT_FT, gb + LIFT_FT);
        pushWall(add(walls, line.colour), a, b, ga, ga + FRONT_WALL_FT * scale, gb, gb + FRONT_WALL_FT * scale);
      }
    });
  }
  for (const s of geometry.symbols) {
    if (s.shape === 'tri') pushTriangle(add(fills, s.colour), s, zAt);
    else pushSemicircle(add(fills, s.colour), s, zAt);
  }
  const mesh = (positions, colour, opacity, order) => {
    const g = own(owned, new T.BufferGeometry());
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const m = own(owned, new T.MeshBasicMaterial({ color: colour, side: T.DoubleSide, transparent: opacity < 1, opacity, depthWrite: false }));
    const o = new T.Mesh(g, m);
    o.renderOrder = order;
    o.frustumCulled = false;
    return o;
  };
  const groupLines = new T.Group();
  const groupWalls = new T.Group();
  for (const [colour, positions] of lines) groupLines.add(mesh(positions, colour, 1, 4));
  for (const [colour, positions] of fills) groupLines.add(mesh(positions, colour, 1, 4));
  for (const [colour, positions] of walls) groupWalls.add(mesh(positions, colour, 0.13, 2));
  root.add(groupLines, groupWalls);
  root.userData.groups = { lines: groupLines, walls: groupWalls };
  return finish(T, root, owned, { count: geometry.counts.drawn });
}

// ---- The wind flow --------------------------------------------------------------------------------------------------

/**
 * The drifting streaks for `flow` (weather3d-model.js createFlow): one line segment a streak with a bright head and a dark tail (added to the picture, so the tail fades to
 * nothing). `levels` is [{ heightFt }] in the order the flow's grids were given. `update()` writes the streaks' places from the flow's particles; it touches no page and
 * makes nothing. Returns { root, update(), dispose() }.
 */
export function buildFlow(T, { flow, levels, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'wind-flow';
  const n = flow.particles.length;
  const positions = new Float32Array(n * 6);
  const colours = new Float32Array(n * 6);
  const geometry = own(owned, new T.BufferGeometry());
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colours, 3));
  const material = own(owned, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  const lines = new T.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 7;
  own(owned, lines);
  root.add(lines);
  const tints = FLOW_COLOURS.map((c) => new T.Color(c));
  const zOf = levels.map((l) => l.heightFt * scale + LIFT_FT);
  function update() {
    flow.particles.forEach((p, k) => {
      const z = zOf[p.level] ?? zOf[0] ?? 0;
      const o = k * 6;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = z;
      positions[o + 3] = p.x + p.tx;
      positions[o + 4] = p.y + p.ty;
      positions[o + 5] = z;
      const tint = tints[Math.min(p.level, tints.length - 1)];
      const f = p.fade * FLOW_BRIGHTNESS;
      colours[o] = tint.r * f;
      colours[o + 1] = tint.g * f;
      colours[o + 2] = tint.b * f;
      colours[o + 3] = 0; // the tail: nothing added
      colours[o + 4] = 0;
      colours[o + 5] = 0;
    });
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  update();
  return finish(T, root, owned, { update, minTailFt: FLOW_TAIL_MIN_FT });
}
