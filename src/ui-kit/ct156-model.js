// The T-6 as a CT-156 Harvard II (Moose Jaw, RCAF), drawn in code only: a lofted fuselage, aerofoil
// wings and tail, glossy paint and small CanvasTexture decals. No image files, no models. Fine detail shows up close.
// Standalone on purpose: it imports nothing from the app, and three.js is passed in
// (never imported here, so the home screen bundle stays free of it; see three-aircraft.js
// `loadThree`). Spec: specs/SPEC-ui-kit.md, "3D aircraft (three.js, D138)".
//
// Axes: nose +X, left +Y, up +Z; fly it with rotation order 'ZYX' and
// rotation.set(-bank, -pitch, hdg). Natural length is CT156_UNIT_LENGTH model units
// (nose tip to tail); lengthFt rescales it (pass CT156_UNIT_LENGTH for scale 1).
//
//   const g = createCt156Model(THREE, { color: '#0066ff', number: 1, lengthFt: CT156_UNIT_LENGTH });
//   ... scene.add(g); ...; disposeCt156Model(g);
//
// paint 'harvard' (default): navy scheme, cheat line, chrome spinner, red-tipped
//   prop, roundels, Canada wordmark, red triangles, tail leaf/NATO star/flag/serial.
//   The whole vertical tail is `color`, and the ship number sits big on both sides
//   of the fin and on the nose.
// paint 'ship': the plain look, everything in `color`, no decals.
//
// Shared geometry, textures and materials are built once per THREE module and
// reference-counted: disposeCt156Model frees a ship's own materials and textures, and the
// shared kit only when the last ship is gone, leaving nothing behind. (three.js keeps a lookup table and its
// reflection-map converter once it has drawn one; those are its own, so a leak check
// measures from a baseline taken after one ship has come and gone.) Every material has fog: false (fog is for
// the ground only, never the aircraft). The decals are drawn on 2D canvases, so this
// needs a document (a browser).

/** The paint setting every module offers: Paint: Harvard / Ship colours, Harvard the default. */
export const PAINT_DEFAULT = 'harvard';
export const PAINT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'harvard', label: 'Harvard' }),
  Object.freeze({ value: 'ship', label: 'Ship colours' }),
]);

export const CT156_UNIT_LENGTH = 1.44; // x from -0.78 (tail) to 0.66 (spinner tip)
/** The real length those units stand for: the T-6A's 33 ft 4 in, nose to tail (the scale of Patrick's photo, below). */
export const CT156_LENGTH_FT = 33 + 4 / 12;

const NAVY = '#151d31';
const rad = (d) => (d * Math.PI) / 180;

// ---------- the shape ----------
// Redrawn (Patrick, 6 Oct: "make the model better ... make it look more like the side profile of a Harvard", with his
// photos of the navy CT-156). The side profile is measured off Patrick's side-on photo of CT-156 156101, scaled so
// nose to tail is the T-6A's 33 ft 4 in (1.44 units; the photo's fin top then sits 10.6 ft above the wheels, against
// the published 10.7 ft). Widths seen from above are estimates. x is along the nose, z up from the spinner's axis.

// Fuselage stations, nose to tail: [x, half-width, top, bottom, squareness]. The spinner sits high: the top line runs
// almost flat from the spinner back to the fin, and the belly hangs deep under it. Squareness 2 is an ellipse,
// higher is boxier (flat sides at the cockpit).
const STATIONS = [
  [0.578, 0.034, 0.028, -0.032, 2.2],
  [0.55, 0.048, 0.031, -0.06, 2.3],
  [0.518, 0.058, 0.034, -0.088, 2.4],
  [0.437, 0.068, 0.038, -0.118, 2.5],
  [0.329, 0.075, 0.042, -0.139, 2.6],
  [0.268, 0.078, 0.043, -0.149, 2.7],
  [0.167, 0.08, 0.043, -0.162, 2.7],
  [-0.009, 0.08, 0.04, -0.169, 2.7],
  [-0.158, 0.077, 0.034, -0.169, 2.7],
  [-0.32, 0.066, 0.026, -0.162, 2.6],
  [-0.482, 0.05, 0.023, -0.149, 2.5],
  [-0.59, 0.038, 0.022, -0.128, 2.4],
  [-0.685, 0.026, 0.0, -0.118, 2.3],
  [-0.75, 0.014, -0.04, -0.11, 2.2],
  [-0.78, 0.004, -0.06, -0.1, 2.0],
];
// The canopy, windscreen foot to its fairing on the spine: [x, half-width, top]. Long and low, about 2 ft above the
// top line (Patrick, 6 Oct: the cockpit was too tall).
const CANOPY = [
  [0.268, 0.02, 0.046],
  [0.23, 0.042, 0.076],
  [0.194, 0.052, 0.101],
  [0.14, 0.058, 0.12],
  [0.059, 0.06, 0.131],
  [-0.076, 0.06, 0.132],
  [-0.185, 0.057, 0.124],
  [-0.239, 0.05, 0.105],
  [-0.293, 0.032, 0.064],
  [-0.354, 0.008, 0.028],
];
// The cockpit, in model units (from the photo, as the canopy): the canopy frame hoops (the forward one is the windscreen
// bow), the two seats' stations (front, rear; each helmet sits there, its seat back just behind) and the helmets' height.
// ct156-cockpit.js builds the student's view from these, so each number has one copy.
export const CT156_FRAME_X = Object.freeze([0.16, -0.022, -0.239]);
export const CT156_SEAT_X = Object.freeze([0.06, -0.13]);
export const CT156_HELMET_Z = 0.098;
/** A table's row at x (rows run from high x to low), each number straight-line between the rows either side. */
function rowAt(rows, x) {
  if (x >= rows[0][0]) return rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (x >= rows[i][0]) {
      const a = rows[i - 1], b = rows[i];
      const t = (a[0] - x) / (a[0] - b[0]);
      return a.map((v, k) => v + (b[k] - v) * t);
    }
  }
  return rows[rows.length - 1];
}
/** A section's middle height and half-height. */
const middleOf = (top, bottom) => [(top + bottom) / 2, (top - bottom) / 2];
/** A point round a fuselage section: theta 0 the left side (+y), pi/2 the top. */
function sectionPoint(sec, theta) {
  const [, w, top, bottom, n] = sec;
  const [zc, h] = middleOf(top, bottom);
  const c = Math.cos(theta), s = Math.sin(theta);
  return [w * Math.sign(c) * Math.abs(c) ** (2 / n), zc + h * Math.sign(s) * Math.abs(s) ** (2 / n)];
}
/** The fuselage's half-width at (x, z), for the decals that hug its side. */
function fuseSurf(x, z) {
  const [, w, top, bottom, n] = rowAt(STATIONS, x);
  const [zc, h] = middleOf(top, bottom);
  const s = Math.min(0.999, Math.abs(z - zc) / h) ** (n / 2);
  return w * Math.sqrt(Math.max(1 - s * s, 1e-6)) ** (2 / n) + 0.0025;
}
/** The height where the fuselage is a given half-width, on its upper side: the canopy's sill. */
function sillZ(x, halfWidth) {
  const [, w, top, bottom, n] = rowAt(STATIONS, x);
  const [zc, h] = middleOf(top, bottom);
  const c = Math.min(1, halfWidth / w) ** (n / 2);
  return zc + h * Math.sqrt(Math.max(1 - c * c, 0)) ** (2 / n);
}
// The cheat line's height along the fuselage: just below the canopy's sill at the nose, falling a little to the tail.
const cheatZ = (x) => -0.045 + (x - 0.48) * 0.0202;

// Wings: a low wing on the belly line, 3° dihedral. Root chord 0.33 units (7.6 ft, the photo's root with its fillet),
// tip 0.16 (3.7 ft), 15 % thick at the root and 12 % at the tip (estimates); the tip at 0.722 units (Patrick, 5 Oct: the real span).
const WING_Z = -0.135;
const DIHEDRAL = rad(3);
const TIP = 0.722;
const WING = [{ le: 0.19, s: 0, chord: 0.33, t: 0.15, z: WING_Z }, { le: 0.13, s: TIP, chord: 0.16, t: 0.12, z: WING_Z }];
// The tailplane low on the tail cone, its tips swept back past the tail (photo); the span an estimate.
const STAB = [
  { le: -0.7, s: -0.3, chord: 0.15, t: 0.1, z: -0.095 },
  { le: -0.52, s: -0.04, chord: 0.25, t: 0.1, z: -0.095 },
  { le: -0.52, s: 0.04, chord: 0.25, t: 0.1, z: -0.095 },
  { le: -0.7, s: 0.3, chord: 0.15, t: 0.1, z: -0.095 },
];
// The fin: its root buried in the tail cone, its top 0.192 units (4.5 ft) above the spinner's axis (photo).
const FIN = [{ le: -0.575, s: -0.03, chord: 0.21, t: 0.09, z: 0 }, { le: -0.644, s: 0.192, chord: 0.1, t: 0.09, z: 0 }];
/** A symmetric NACA 4-digit section's half-thickness at xc (0 the leading edge, 1 the trailing edge), per chord. */
const thick = (xc, t) => 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc ** 2 + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** A lofted surface's section at span position s (straight-line between its two nearest sections). */
function sectionOf(sections, s) {
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    if (s <= b.s || i === sections.length - 1) {
      const f = clamp01((s - a.s) / (b.s - a.s || 1));
      return { le: a.le + (b.le - a.le) * f, chord: a.chord + (b.chord - a.chord) * f, t: a.t + (b.t - a.t) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return sections[0];
}
/** A wing's surface height at (x, y) in its own frame, upper (+1) or lower (-1), for the decals on it. */
function wingSurfZ(x, y, side) {
  const sec = sectionOf(WING, Math.abs(y));
  const xc = clamp01((sec.le - x) / sec.chord);
  return sec.z + side * (thick(xc, sec.t) * sec.chord + 0.0015);
}
/** The fin's half-thickness at (x, z), for the tail decals. */
function finSurf(x, z) {
  const sec = sectionOf(FIN, z);
  const xc = clamp01((sec.le - x) / sec.chord);
  return thick(xc, sec.t) * sec.chord + 0.0015;
}

// The fine detail (decals, the cockpit, the canopy frames, the prop blades, the exhausts) shows only when the aircraft
// is at least this long on screen, in CSS pixels, and goes again below the lower number (estimates, tuned by eye).
export const CT156_DETAIL_PX = Object.freeze({ show: 70, hide: 55 });

// ---------- canvas decals ----------

function canvasTexture(THREE, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The maple leaf of the Flag of Canada: the flag's own 11-point outline (Patrick, 6 Oct: "needs to look exactly like a
// maple leaf"), tip up, centred on (cx, cy), half-height s. The outline runs from y -2000 (the top point) to 2030 (the
// stem's foot), x -1860 to 1860, in its own units.
const LEAF_OUTLINE = 'm-90 2030 45-863a95 95 0 0 0-111-98l-859 151 116-320a65 65 0 0 0-20-73l-941-762 212-99a65 65 0 0 0 34-79l-186-572 542 115a65 65 0 0 0 73-38l105-247 423 454a65 65 0 0 0 111-57l-204-1052 327 189a65 65 0 0 0 91-27l332-652 332 652a65 65 0 0 0 91 27l327-189-204 1052a65 65 0 0 0 111 57l423-454 105 247a65 65 0 0 0 73 38l542-115-186 572a65 65 0 0 0 34 79l212 99-941 762a65 65 0 0 0-20 73l116 320-859-151a95 95 0 0 0-111 98l45 863z';
let leafPath = null;
function leaf(ctx, cx, cy, s, fill) {
  leafPath ??= new Path2D(LEAF_OUTLINE);
  const k = s / 2015;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(0, -15);
  ctx.fillStyle = fill;
  ctx.fill(leafPath);
  ctx.restore();
}

function roundelCanvas(ctx, w) {
  const c = w / 2;
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(c, c, c * 0.72, 0, 7); ctx.fill();
  leaf(ctx, c, c, c * 0.56, '#d2202c');
}

function natoStar(ctx, cx, cy, r) {
  ctx.strokeStyle = '#d5dae0';
  ctx.fillStyle = '#d5dae0';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, 7); ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a + 0.28) * r * 0.16, cy + Math.sin(a + 0.28) * r * 0.16);
    ctx.lineTo(cx + Math.cos(a - 0.28) * r * 0.16, cy + Math.sin(a - 0.28) * r * 0.16);
    ctx.closePath();
  }
  ctx.fill();
}

// A big digit-string: white fill, dark outline.
function outlinedText(ctx, text, cx, cy, px, outline = px * 0.07) {
  ctx.font = `800 ${px}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline * 2;
  ctx.strokeStyle = '#0a1020';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy);
}

function tailCanvas(number) {
  return (ctx, w, h) => {
    leaf(ctx, w * 0.36, h * 0.13, h * 0.085, '#d8202c');
    natoStar(ctx, w * 0.64, h * 0.13, h * 0.075);
    outlinedText(ctx, String(number), w / 2, h * 0.52, h * 0.66, 9);
    // Canadian flag and the serial.
    const fy = h * 0.9;
    ctx.fillStyle = '#e4212d'; ctx.fillRect(w * 0.14, fy - 12, 40, 24);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.14 + 10, fy - 12, 20, 24);
    leaf(ctx, w * 0.14 + 20, fy, 8, '#e4212d');
    ctx.font = '700 32px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`15612${number}`, w * 0.14 + 50, fy + 1);
  };
}

// ---------- shared kit (geometry, materials, textures) ----------

const kits = new WeakMap(); // THREE namespace -> kit

function flatXZ(THREE, pts, thickness) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  g.rotateX(Math.PI / 2); // (x, up) plate, thickness across y
  return g;
}

/** An indexed geometry from points and triangles, smooth-shaded. */
function meshOf(THREE, pos, idx, groups = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (groups) for (const [start, count, m] of groups) g.addGroup(start, count, m);
  g.computeVertexNormals();
  return g;
}

/** The fuselage: rings round the stations, closed at the nose (behind the spinner) and the tail. */
function fuselageGeometry(THREE) {
  const RING = 36, N = 52;
  const x0 = STATIONS[0][0], x1 = STATIONS[STATIONS.length - 1][0];
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const sec = rowAt(STATIONS, x);
    for (let k = 0; k < RING; k++) {
      const [y, z] = sectionPoint(sec, (k / RING) * Math.PI * 2);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < RING; k++) {
      const a = i * RING + k, b = i * RING + ((k + 1) % RING), c = a + RING, d = b + RING;
      idx.push(a, c, b, b, c, d);
    }
  }
  const nose = pos.length / 3;
  pos.push(x0, 0, (STATIONS[0][2] + STATIONS[0][3]) / 2);
  const tail = pos.length / 3;
  const last = STATIONS[STATIONS.length - 1];
  pos.push(x1, 0, (last[2] + last[3]) / 2);
  for (let k = 0; k < RING; k++) {
    idx.push(nose, k, (k + 1) % RING);
    idx.push(tail, N * RING + ((k + 1) % RING), N * RING + k);
  }
  return meshOf(THREE, pos, idx);
}

/** The canopy: a rounded hood from sill to sill along its length. */
function canopyAt(x, grow = 0) {
  const [, w, top] = rowAt(CANOPY, x);
  return { w: w + grow, top: top + grow, base: sillZ(x, w) };
}
function canopyPoint(c, phi) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  return [c.w * Math.sign(cp) * Math.abs(cp) ** 0.85, c.base + (c.top - c.base) * Math.max(sp, 0) ** 0.75];
}
function canopyGeometry(THREE) {
  const N = 40, M = 20;
  const x0 = CANOPY[0][0], x1 = CANOPY[CANOPY.length - 1][0];
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const c = canopyAt(x);
    for (let j = 0; j <= M; j++) {
      const [y, z] = canopyPoint(c, (Math.PI * j) / M);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return meshOf(THREE, pos, idx);
}
/** The canopy's section at x, in model units: { w: half-width, top, base: the sill's height } (for ct156-cockpit.js). */
export const ct156CanopySection = (x) => canopyAt(x);
/** The canopy's inside half-width at station x and height z, model units (0 above its top or below its sill). */
export function ct156CanopyHalfWidth(x, z) {
  const c = canopyAt(x);
  const f = (z - c.base) / (c.top - c.base);
  if (!(f >= 0 && f <= 1)) return 0;
  const sp = f ** (1 / 0.75); // canopyPoint backwards: z = base + (top - base) * sin^0.75, y = w * cos^0.85
  return c.w * Math.sqrt(Math.max(1 - sp * sp, 0)) ** 0.85;
}
/** The fuselage's section at x, in model units: { halfWidth, top, bottom } (for ct156-cockpit.js). */
export function ct156FuselageSection(x) {
  const [, halfWidth, top, bottom] = rowAt(STATIONS, x);
  return { halfWidth, top, bottom };
}
/** A frame hoop over the canopy at x. */
function hoopGeometry(THREE, x) {
  const c = canopyAt(x, 0.0015);
  const pts = [];
  for (let j = 0; j <= 16; j++) {
    const [y, z] = canopyPoint(c, (Math.PI * j) / 16);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0035, 6, false);
}
/** A sill rail along one side of the canopy. */
function railGeometry(THREE, side) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const x = 0.25 - (0.55 * i) / 12;
    const c = canopyAt(x, 0.001);
    pts.push(new THREE.Vector3(x, side * c.w, c.base));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.003, 5, false);
}

/**
 * A lofted aerofoil surface through its sections ({ le, s, chord, t, z }): span along y (wings, tailplane) or z (fin),
 * closed at both ends. With leBand, the first part of the chord top and bottom is its own group (the white leading edge).
 */
function airfoilGeometry(THREE, sections, { span = 'y', leBand = 0 } = {}) {
  const K = 14;
  const xs = [];
  for (let k = 0; k <= K; k++) xs.push((1 - Math.cos((Math.PI * k) / K)) / 2); // closer together at the nose
  const ring = [];
  for (let k = K; k >= 0; k--) ring.push([xs[k], 1]); // upper surface, trailing edge to leading edge
  for (let k = 1; k < K; k++) ring.push([xs[k], -1]); // lower surface back to the trailing edge
  const R = ring.length;
  const pos = [];
  for (const sec of sections) {
    for (const [xc, side] of ring) {
      const x = sec.le - xc * sec.chord;
      const off = sec.z + side * thick(xc, sec.t) * sec.chord;
      if (span === 'y') pos.push(x, sec.s, off);
      else pos.push(x, off, sec.s);
    }
  }
  const body = [], band = [];
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < R; k++) {
      const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
      const inBand = leBand > 0 && ring[k][0] <= leBand && ring[(k + 1) % R][0] <= leBand;
      (inBand ? band : body).push(a, b, c, b, d, c);
    }
  }
  // End caps: a fan from the middle of the first and last sections.
  for (const i of [0, sections.length - 1]) {
    const sec = sections[i];
    const centre = pos.length / 3;
    const x = sec.le - 0.4 * sec.chord;
    if (span === 'y') pos.push(x, sec.s, sec.z);
    else pos.push(x, sec.z, sec.s);
    for (let k = 0; k < R; k++) body.push(centre, i * R + k, i * R + ((k + 1) % R));
  }
  return meshOf(THREE, pos, [...body, ...band], band.length ? [[0, body.length, 0], [body.length, band.length, 1]] : null);
}

/**
 * Joins several geometries into one, so parts sharing a paint are one draw call. parts: [{ geometry, materials }]:
 * materials gives, for each of the part's groups (or the whole part), the joined geometry's material slot. The
 * parts are freed; the joined geometry has one group per slot.
 */
function joinGeometries(THREE, parts) {
  const bySlot = new Map();
  for (const { geometry, materials } of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!flat.attributes.normal) flat.computeVertexNormals();
    const p = flat.attributes.position.array, n = flat.attributes.normal.array;
    const ranges = flat.groups.length ? flat.groups.map((gr) => [gr.start, gr.count, materials[gr.materialIndex] ?? materials[0]]) : [[0, p.length / 3, materials[0]]];
    for (const [start, count, slot] of ranges) {
      if (!bySlot.has(slot)) bySlot.set(slot, { pos: [], nor: [] });
      const into = bySlot.get(slot);
      for (let v = start; v < start + count; v++) {
        into.pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        into.nor.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]);
      }
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const pos = [], nor = [];
  const g = new THREE.BufferGeometry();
  for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
    const { pos: sp, nor: sn } = bySlot.get(slot);
    g.addGroup(pos.length / 3, sp.length / 3, slot);
    for (const v of sp) pos.push(v);
    for (const v of sn) nor.push(v);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// A decal patch that hugs a side surface: |y| = surf(x, z). side +1 left, -1 right.
// u runs so the picture reads correctly when seen from outside that side.
function patch(THREE, xc, zc, w, h, side, surf) {
  const nx = Math.max(2, Math.ceil(w / 0.015));
  const nz = Math.max(2, Math.ceil(h / 0.015));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const a = (i / nx - 0.5) * w;
      const x = xc + (side > 0 ? -a : a);
      const z = zc + (j / nz - 0.5) * h;
      pos.push(x, side * surf(x, z), z);
      uv.push(i / nx, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p = j * (nx + 1) + i;
      idx.push(p, p + 1, p + nx + 1, p + 1, p + nx + 2, p + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A decal that hugs a wing, upper (+1) or lower (-1): w along ax and h along ay (unit vectors in the wing's plane),
 * centred at (x, y); tilted with the wing's dihedral.
 */
function wingPatch(THREE, x, y, w, h, ax, ay, side, tilt) {
  const n = 10;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n - 0.5, v = j / n - 0.5;
      const px = x + u * w * ax[0] + v * h * ay[0];
      const py = y + u * w * ax[1] + v * h * ay[1];
      pos.push(px, py, wingSurfZ(px, py, side));
      uv.push(i / n, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = j * (n + 1) + i;
      idx.push(p, p + 1, p + n + 2, p, p + n + 2, p + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateX(tilt);
  return g;
}

// Cheat line: a thin white ribbon on both sides, nose to tail.
function cheatLine(THREE) {
  const pos = [], idx = [];
  const N = 48, half = 0.0032;
  const x0 = 0.395, x1 = -0.75; // from just behind the nose number to the tail (photo)
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((x1 - x0) * k) / N;
      const zc = cheatZ(x);
      for (const z of [zc + half, zc - half]) pos.push(x, side * fuseSurf(x, z), z);
    }
    for (let k = 0; k < N; k++) {
      const p = base + k * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(THREE, cx, cy, cz, rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 20, 12);
  g.scale(rx, ry, rz);
  g.translate(cx, cy, cz);
  return g;
}

function buildKit(THREE) {
  const own = []; // everything to dispose with the kit
  const keep = (o) => (own.push(o), o);
  const geo = {};

  // The sky above and the prairie below, for the reflections in the paint, the glass and the chrome: the same blues
  // as the 3D views' sky (ui-kit/sky-clouds.js), with the sun's bright patch. Auto-converted by the renderer.
  const env = keep(canvasTexture(THREE, 256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2f6aa8'); g.addColorStop(0.3, '#6f9fd2'); g.addColorStop(0.49, '#dde9f3');
    g.addColorStop(0.51, '#8a8a62'); g.addColorStop(0.7, '#5d6440'); g.addColorStop(1, '#2c3220');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(w * 0.1, h * 0.12, w * 0.1, h * 0.08);
  }));
  env.mapping = THREE.EquirectangularReflectionMapping;

  geo.fuselage = fuselageGeometry(THREE);
  // Wings, tailplane and ventral fin in one geometry (the wings' leading edges a second slot), so the
  // airframe is one draw call; the dihedral is built in.
  const wing = (side) => {
    const g = airfoilGeometry(THREE, side > 0 ? WING : WING.map((s) => ({ ...s, s: -s.s })).reverse(), { leBand: 0.07 });
    g.rotateX(side * DIHEDRAL);
    return g;
  };
  geo.airframe = joinGeometries(THREE, [
    { geometry: wing(1), materials: [0, 1] },
    { geometry: wing(-1), materials: [0, 1] },
    { geometry: airfoilGeometry(THREE, STAB), materials: [0] },
    { geometry: flatXZ(THREE, [[-0.51, -0.13], [-0.54, -0.19], [-0.67, -0.19], [-0.69, -0.11]], 0.01), materials: [0] },
  ]);
  geo.fin = airfoilGeometry(THREE, FIN, { span: 'z' });
  geo.canopy = canopyGeometry(THREE);
  geo.frames = joinGeometries(THREE, [
    ...CT156_FRAME_X.map((x) => ({ geometry: hoopGeometry(THREE, x), materials: [0] })),
    { geometry: railGeometry(THREE, 1), materials: [0] },
    { geometry: railGeometry(THREE, -1), materials: [0] },
    // The seat backs.
    ...CT156_SEAT_X.map((x) => ({ geometry: new THREE.BoxGeometry(0.014, 0.05, 0.05).translate(x - 0.035, 0, 0.07), materials: [0] })),
    // The chin intake under the spinner.
    { geometry: ellipsoid(THREE, 0.545, 0, -0.058, 0.03, 0.032, 0.016), materials: [0] },
  ]);
  const floor = new THREE.CircleGeometry(1, 24);
  floor.scale(0.2, 0.05, 1);
  floor.translate(-0.035, 0, 0.046);
  geo.floor = floor;
  // The two helmets apart, so the Cockpit view can leave out the one the camera sits in (setCockpitView).
  [geo.helmetFront, geo.helmetRear] = CT156_SEAT_X.map((x) => new THREE.SphereGeometry(0.02, 12, 8).translate(x, 0, CT156_HELMET_Z));
  // The exhaust stacks either side of the nose, just under the top line (photo).
  const stubY = fuseSurf(0.5, -0.012) - 0.003;
  geo.stubs = joinGeometries(THREE, [1, -1].map((s) => ({ geometry: new THREE.CylinderGeometry(0.012, 0.009, 0.06, 10).rotateZ(Math.PI / 2).translate(0.5, s * stubY, -0.012), materials: [0] })));
  const spin = new THREE.LatheGeometry([[0.001, 0.66], [0.01, 0.65], [0.02, 0.635], [0.028, 0.61], [0.033, 0.585], [0.034, 0.575]].map(([r, x]) => new THREE.Vector2(r, x)), 24);
  spin.rotateZ(-Math.PI / 2);
  geo.spinner = spin;
  // The prop: 97 in across (published T-6A figure; an estimate until a manual page backs it), 0.175 units each side.
  const disc = new THREE.CircleGeometry(0.175, 32);
  disc.rotateY(Math.PI / 2);
  disc.translate(0.585, 0, 0);
  geo.disc = disc;
  // The four blades as one geometry and their red tips as another (Traffic's turning prop hides both: blurProp).
  const blade = (v0, v1, w0, w1) => joinGeometries(THREE, [0, 1, 2, 3].map((k) => {
    const s = new THREE.Shape([[-w0, v0], [w0, v0], [w1, v1], [-w1, v1]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // depth along x, radial along y
    g.translate(0.587, 0, 0);
    g.rotateX((k * Math.PI) / 2);
    return { geometry: g, materials: [0] };
  }));
  geo.blade = blade(0.03, 0.15, 0.016, 0.013);
  geo.bladeTip = blade(0.15, 0.175, 0.013, 0.012);
  geo.cheat = cheatLine(THREE);
  for (const o of Object.values(geo)) keep(o);

  // Shared decal textures and geometry.
  const tex = {};
  tex.roundel = keep(canvasTexture(THREE, 256, 256, (ctx, w) => roundelCanvas(ctx, w)));
  tex.canada = keep(canvasTexture(THREE, 256, 72, (ctx, w, h) => {
    ctx.font = '600 52px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText('Canada', w * 0.46, h * 0.5);
    leaf(ctx, w * 0.93, h * 0.32, 8, '#e4212d');
  }));
  tex.tri = keep(canvasTexture(THREE, 64, 64, (ctx) => {
    ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(60, 8); ctx.lineTo(32, 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d2202c'; ctx.beginPath(); ctx.moveTo(15, 17); ctx.lineTo(49, 17); ctx.lineTo(32, 47); ctx.closePath(); ctx.fill();
  }));

  const both = (make) => ({ 1: make(1), '-1': make(-1) });
  const decalGeo = {
    roundelSide: both((side) => patch(THREE, -0.333, cheatZ(-0.333), 0.05, 0.05, side, fuseSurf)),
    canada: both((side) => patch(THREE, 0.194, -0.02, 0.085, 0.024, side, fuseSurf)),
    triA: both((side) => patch(THREE, 0.082, -0.016, 0.022, 0.022, side, fuseSurf)),
    triB: both((side) => patch(THREE, -0.151, -0.016, 0.022, 0.022, side, fuseSurf)),
    triC: both((side) => patch(THREE, -0.033, -0.016, 0.015, 0.015, side, fuseSurf)),
    nose: both((side) => patch(THREE, 0.425, cheatZ(0.425), 0.036, 0.045, side, fuseSurf)),
    tail: both((side) => patch(THREE, -0.687, 0.108, 0.105, 0.165, side, finSurf)),
    // Upper left wing: seen from above, nose up, right = -Y.
    roundelWing: wingPatch(THREE, 0.04, 0.42, 0.14, 0.14, [0, -1], [1, 0], 1, DIHEDRAL),
    // Under the right wing: seen from below with the nose up, it reads left to right.
    wingNum: wingPatch(THREE, 0.04, -0.42, 0.27, 0.09, [0, 1], [1, 0], -1, -DIHEDRAL),
  };
  for (const v of Object.values(decalGeo)) {
    if (v.isBufferGeometry) keep(v);
    else { keep(v[1]); keep(v['-1']); }
  }

  const two = THREE.DoubleSide; // both faces lit the right way round, whichever way a part's triangles were wound
  const mat = (params) => keep(new THREE.MeshStandardMaterial({ fog: false, ...params }));
  // Glossy paint: a clear coat over the colour, as on the real aircraft (Patrick's photos).
  const gloss = (params) => keep(new THREE.MeshPhysicalMaterial({ fog: false, side: two, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, ...params }));
  const decalMat = (map) => keep(new THREE.MeshStandardMaterial({
    map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.6, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const mats = {
    env,
    navy: gloss({ color: NAVY, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.8 }),
    cheat: mat({ color: '#f1f4f8', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.3, side: two, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wingLe: gloss({ color: '#f1f4f8', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.2, envMapIntensity: 0.5 }),
    chrome: mat({ color: '#f2f5f8', roughness: 0.1, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    exhaust: mat({ color: '#4a4d54', roughness: 0.45, metalness: 0.8, envMap: env, envMapIntensity: 0.6 }),
    glass: mat({ color: '#1d2a36', transparent: true, opacity: 0.4, roughness: 0.04, metalness: 0.6, envMap: env, envMapIntensity: 1.4, depthWrite: false, side: two }),
    // The canopy seen from inside (setCockpitView): a faint clear tint, no reflections, so the sky shows through it.
    glassInside: keep(new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    frame: mat({ color: '#0c1017', roughness: 0.5, side: two }),
    floor: mat({ color: '#0d1118', roughness: 0.9, side: two }),
    helmet: mat({ color: '#d4d8de', roughness: 0.35 }),
    blade: mat({ color: '#0a0c10', roughness: 0.6 }),
    tip: mat({ color: '#d2202c', roughness: 0.5 }),
    disc: keep(new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, fog: false })),
    roundel: decalMat(tex.roundel),
    canada: decalMat(tex.canada),
    tri: decalMat(tex.tri),
  };
  return { THREE, geo, decalGeo, mats, refs: 0, dispose: () => own.forEach((o) => o.dispose()) };
}

function getKit(THREE) {
  let k = kits.get(THREE);
  if (!k) kits.set(THREE, (k = buildKit(THREE)));
  return k;
}

// ---------- near and far ----------

/** How long the aircraft looks on screen, in CSS pixels, from this camera. */
function onScreenPx(THREE, obj, camera, renderer) {
  const size = renderer.getSize(new THREE.Vector2());
  const lengthWorld = CT156_UNIT_LENGTH * obj.matrixWorld.getMaxScaleOnAxis();
  if (camera.isOrthographicCamera) return (lengthWorld * camera.zoom * size.y) / Math.max(camera.top - camera.bottom, 1e-9);
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const d = eye.distanceTo(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld));
  return (lengthWorld * size.y * (camera.zoom ?? 1)) / (2 * Math.max(d, 1e-9) * Math.tan(rad(camera.fov ?? 50) / 2));
}

/** Shows or hides a ship's fine detail by its size on screen, with a gap between the two numbers so it doesn't flicker. */
function setDetail(THREE, root, camera, renderer) {
  const d = root.userData.ct156;
  if (!d?.detail) return;
  const px = onScreenPx(THREE, root, camera, renderer);
  if (px >= CT156_DETAIL_PX.show) d.detail.visible = true;
  else if (px < CT156_DETAIL_PX.hide) d.detail.visible = false;
}

/**
 * Each scene a ship is drawn in checks every ship's detail once per picture, before three.js lists what to draw,
 * so a change shows in the same picture. Installed the first time a ship is drawn there; it keeps any hook the scene had.
 */
function watchScene(THREE, scene) {
  if (!scene?.isScene || scene.userData.ct156Ships) return;
  const ships = new Set();
  scene.userData.ct156Ships = ships;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, s, camera, target) {
    before.call(this, renderer, s, camera, target);
    for (const ship of ships) {
      if (!ship.userData.ct156) ships.delete(ship);
      else setDetail(THREE, ship, camera, renderer);
    }
  };
}

// ---------- the per-ship model ----------

/**
 * Returns a THREE.Group: nose +X, left +Y, up +Z, nose-to-tail length lengthFt.
 * color: CSS colour of the ship (the whole tail in 'harvard', everything in 'ship').
 * number: the ship number, drawn on the fin and nose ('harvard' only).
 * paint: 'harvard' (default, and for any unknown value) or 'ship'.
 * @param {any} THREE
 * @param {{ color?: string, number?: string | number, paint?: string, lengthFt?: number }} [options]
 */
export function createCt156Model(THREE, { color, number, paint = 'harvard', lengthFt = CT156_UNIT_LENGTH } = {}) {
  const kit = getKit(THREE);
  kit.refs++;
  const { geo, decalGeo, mats } = kit;
  const mine = []; // per-ship materials and textures
  const own = (o) => (mine.push(o), o);
  const root = new THREE.Group();
  const g = new THREE.Group(); // scaled to lengthFt
  g.scale.setScalar(lengthFt / CT156_UNIT_LENGTH);
  root.add(g);
  const detail = new THREE.Group(); // the fine detail, shown only up close (near and far, above)
  g.add(detail);
  const add = (geometry, material, parent = g) => {
    const m = new THREE.Mesh(geometry, material);
    parent.add(m);
    return m;
  };

  let fuselage, canopy, helmetFront = null, prop = null;
  if (paint === 'ship') {
    const base = new THREE.Color(color);
    const m = (c, extra) => own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.1, envMap: mats.env, envMapIntensity: 0.4, side: THREE.DoubleSide, fog: false, ...extra }));
    const body = m(base);
    const light = m(base.clone().multiplyScalar(0.82));
    fuselage = add(geo.fuselage, body);
    add(geo.airframe, [light, light]);
    add(geo.fin, m(base.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
    // Solid dark glass, one canopy (Patrick, 5 Oct: the two see-through bubbles overlapped as a "ghost double canopy").
    canopy = add(geo.canopy, m('#2c4a66', { roughness: 0.12, metalness: 0.45 }));
    add(geo.spinner, m('#20242a', { roughness: 0.4 }));
    add(geo.disc, mats.disc);
  } else {
    const num = String(number ?? '');
    const wingTex = own(canvasTexture(THREE, 384, 128, (ctx, w, h) => outlinedText(ctx, `12${num}`, w / 2, h / 2, h * 0.86, 5)));
    const tailTex = own(canvasTexture(THREE, 320, 512, tailCanvas(num)));
    const noseTex = own(canvasTexture(THREE, 128, 160, (ctx, w, h) => outlinedText(ctx, num, w / 2, h / 2, h * 0.82, 7)));
    const decal = (tx) => own(new THREE.MeshStandardMaterial({
      map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.6, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const finMat = own(new THREE.MeshPhysicalMaterial({ color, fog: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMap: mats.env, envMapIntensity: 0.5 }));

    // Always drawn: the airframe, the canopy glass, the cheat line, the spinner and the prop disc.
    fuselage = add(geo.fuselage, mats.navy);
    add(geo.airframe, [mats.navy, mats.wingLe]);
    add(geo.fin, finMat);
    add(geo.cheat, mats.cheat);
    add(geo.spinner, mats.chrome);
    add(geo.disc, mats.disc);
    // Up close only: the decals, the cockpit, the frames, the exhausts and the blades.
    add(decalGeo.roundelWing, mats.roundel, detail);
    add(decalGeo.wingNum, decal(wingTex), detail);
    const tailMat = decal(tailTex);
    const noseMat = decal(noseTex);
    for (const s of ['1', '-1']) {
      add(decalGeo.tail[s], tailMat, detail);
      add(decalGeo.nose[s], noseMat, detail);
      add(decalGeo.roundelSide[s], mats.roundel, detail);
      add(decalGeo.canada[s], mats.canada, detail);
      add(decalGeo.triA[s], mats.tri, detail);
      add(decalGeo.triB[s], mats.tri, detail);
      add(decalGeo.triC[s], mats.tri, detail);
    }
    add(geo.stubs, mats.exhaust, detail);
    add(geo.floor, mats.floor, detail);
    add(geo.frames, mats.frame, detail);
    helmetFront = add(geo.helmetFront, mats.helmet, detail);
    add(geo.helmetRear, mats.helmet, detail);
    prop = new THREE.Group();
    prop.rotation.x = rad(22);
    add(geo.blade, mats.blade, prop);
    add(geo.bladeTip, mats.tip, prop);
    detail.add(prop);
    // The glass last, so the cockpit shows through it.
    canopy = add(geo.canopy, mats.glass);
  }
  // The first time the ship is drawn, its scene starts checking its detail (near and far, above).
  fuselage.onBeforeRender = (renderer, scene, camera) => {
    watchScene(THREE, scene);
    scene?.userData?.ct156Ships?.add(root);
    setDetail(THREE, root, camera, renderer);
  };
  root.userData.ct156 = { kit, mine, paint, detail, g, canopy, helmetFront, prop, inside: null };
  return root;
}

/**
 * The ship seen from its own front seat (the Formation Sim's Cockpit and Padlock views, with ct156-cockpit.js) or from
 * outside again. seat 'front': the front helmet goes (the camera is in it), the still prop blades go (a turning prop is
 * a blur from the seat; the faint disc stays), the canopy turns to clear glass from inside,
 * and the frames (the canopy bows), sill rails, seat backs, cockpit floor and rear helmet show whatever the paint ('ship'
 * paint has none of its own, so they are added from the shared kit). seat null: the ship as built. Wings, fin and
 * tailplane are never touched. Nothing new needs freeing: every part added is the shared kit's.
 * @param {any} root a ship from createCt156Model
 * @param {{ seat?: 'front' | null }} [view]
 */
export function setCockpitView(root, { seat = null } = {}) {
  const d = root?.userData?.ct156;
  if (!d) return;
  const { geo, mats, THREE } = d.kit;
  const inside = seat === 'front';
  d.canopy.userData.outsideMaterial ??= d.canopy.material;
  d.canopy.material = inside ? mats.glassInside : d.canopy.userData.outsideMaterial;
  if (d.helmetFront) d.helmetFront.visible = !inside;
  if (d.prop) d.prop.visible = !inside;
  if (d.paint === 'ship' && inside && !d.inside) {
    d.inside = new THREE.Group();
    for (const [geometry, material] of [[geo.frames, mats.frame], [geo.floor, mats.floor], [geo.helmetRear, mats.helmet]]) d.inside.add(new THREE.Mesh(geometry, material));
    d.g.add(d.inside);
  }
  if (d.inside) d.inside.visible = inside;
}

/** Frees this ship's own materials and textures; the shared kit goes with the last ship. */
export function disposeCt156Model(group) {
  const d = group.userData.ct156;
  if (!d) return;
  group.userData.ct156 = null;
  for (const o of d.mine) {
    o.map?.dispose();
    o.dispose();
  }
  if (--d.kit.refs === 0) {
    d.kit.dispose();
    kits.delete(d.kit.THREE);
  }
  group.removeFromParent();
}
