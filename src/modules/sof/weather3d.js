// Draws the SOF 3D view's weather layers (SOF-39, SOF-42; Dad, 7 Oct): precipitation shafts from the radar, lightning bolts, a faint satellite cloud sheet, the surface fronts
// and the drifting wind streaks. It only builds three.js objects from the plain data weather3d-model.js works out; the page (buttons, labels, the picture reads) is view3d.js's.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale (`scale`), the same reference as the cloud
// sheets and decks. Every builder returns an object with its own `dispose()` that frees the geometry, materials and textures it made, and each leaves its root for the
// caller to add to the scene and switch with `.visible` (no toggle rebuilds anything).
import { AREA_FT } from './scene3d-model.js';
import { cellFt, FRONT_LINE_FT, FRONT_WALL_FT, SYMBOL_FT, FLOW_TAIL_MIN_FT } from './weather3d-model.js';

/** Lines and fills lie this far (scene feet) above the ground so it never hides them, as view3d.js's own LIFT_FT. */
const LIFT_FT = 500;
/** A shaft is a see-through column: radar's own colour at this opacity. An estimate for the look. */
const SHAFT_OPACITY = 0.34;
/** A bolt is this wide (feet), with a dark outline this wide: thin, but never under about two pixels at the start view. An estimate for the look. */
const BOLT_FT = { fill: 4800, outline: 9000 };
const BOLT_FILL = '#ffe800';
const BOLT_OUTLINE = '#101010';
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
 * The precipitation shafts (`shafts` from weather3d-model.js): one see-through box a cell wide from the ground to the cloud base, in the radar's colour. Returns { root, count, dispose }.
 */
export function buildShafts(T, { shafts, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'radar-shafts';
  if (shafts.length) {
    const geometry = own(owned, new T.BoxGeometry(1, 1, 1));
    geometry.translate(0, 0, 0.5); // the base at z = 0, so a box scales up from the ground
    const material = own(owned, new T.MeshBasicMaterial({ transparent: true, opacity: SHAFT_OPACITY, depthWrite: false }));
    const mesh = new T.InstancedMesh(geometry, material, shafts.length);
    const m = new T.Matrix4();
    const colour = new T.Color();
    shafts.forEach((s, n) => {
      m.compose(new T.Vector3(s.x, s.y, s.baseFt * scale), new T.Quaternion(), new T.Vector3(cellFt() * 0.9, cellFt() * 0.9, Math.max(1, (s.topFt - s.baseFt) * scale)));
      mesh.setMatrixAt(n, m);
      colour.setRGB(s.colour[0] / 255, s.colour[1] / 255, s.colour[2] / 255, T.SRGBColorSpace);
      mesh.setColorAt(n, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    own(owned, mesh);
    root.add(mesh);
  }
  return finish(T, root, owned, { count: shafts.length });
}

/** The lightning bolts (`bolts`): a thin yellow column from the ground to the cloud top with a dark outline behind it, as the 2D mark. Returns { root, count, dispose }. */
export function buildBolts(T, { bolts, scale }) {
  const owned = [];
  const root = new T.Group();
  root.name = 'lightning-bolts';
  if (bolts.length) {
    const geometry = own(owned, new T.BoxGeometry(1, 1, 1));
    geometry.translate(0, 0, 0.5);
    const m = new T.Matrix4();
    // The outline is drawn from its inside faces only (BackSide), so the thinner yellow column in front of them is never hidden by it.
    for (const [width, colour, order, side] of [[BOLT_FT.outline, BOLT_OUTLINE, 5, T.BackSide], [BOLT_FT.fill, BOLT_FILL, 6, T.FrontSide]]) {
      const material = own(owned, new T.MeshBasicMaterial({ color: colour, side }));
      const mesh = new T.InstancedMesh(geometry, material, bolts.length);
      bolts.forEach((b, n) => {
        m.compose(new T.Vector3(b.x, b.y, b.baseFt * scale), new T.Quaternion(), new T.Vector3(width, width, Math.max(1, (b.topFt - b.baseFt) * scale)));
        mesh.setMatrixAt(n, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      own(owned, mesh);
      root.add(mesh);
    }
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
