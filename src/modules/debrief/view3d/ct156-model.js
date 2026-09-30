// SPIKE (not for merge): a CT-156 Harvard II (Moose Jaw RCAF) drawn in code only:
// procedural materials plus small CanvasTexture decals. No image files, no models.
// Standalone on purpose: it imports nothing from the app; three.js is passed in.
//
// Axes: nose +X, left +Y, up +Z. Natural length is CT156_UNIT_LENGTH model units
// (nose tip to tail); lengthFt rescales it (pass CT156_UNIT_LENGTH for scale 1).
//
//   const g = createCt156Model(THREE, { color: '#0066ff', number: 1, lengthFt: CT156_UNIT_LENGTH });
//   ... scene.add(g); ...; disposeCt156Model(g);
//
// paint 'harvard' (default): navy scheme, cheat line, chrome spinner, red-tipped
//   prop, roundels, Canada wordmark, red triangles, tail leaf/NATO star/flag/serial.
//   The whole vertical tail is `color`, and the ship number sits big on both sides
//   of the fin and on the nose.
// paint 'ship': the old look, everything in `color`, no decals.

export const CT156_UNIT_LENGTH = 1.44; // x from -0.78 (tail) to 0.66 (spinner tip)

const NAVY = '#151d31';
const rad = (d) => (d * Math.PI) / 180;

// Fuselage lathe profile: [radius, axial x].
const PROFILE = [
  [0.004, -0.78], [0.024, -0.72], [0.045, -0.55], [0.062, -0.35], [0.076, -0.1],
  [0.086, 0.15], [0.088, 0.3], [0.085, 0.42], [0.07, 0.5], [0.06, 0.52], [0.001, 0.52],
];
function radiusAt(x) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, x0] = PROFILE[i - 1];
    const [r1, x1] = PROFILE[i];
    if (x1 > x0 && x <= x1) return r0 + ((r1 - r0) * (Math.max(x, x0) - x0)) / (x1 - x0);
  }
  return 0.06;
}
// Cheat line height along the fuselage (rises toward the tail).
const cheatZ = (x) => 0.015 - (0.03 * (x + 0.66)) / 1.16;

const WING_Z = -0.045;
const WING_T = 0.012;
const DIHEDRAL = rad(3);

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

// Maple leaf, tip up, centred on (cx, cy), half-height s.
function leaf(ctx, cx, cy, s, fill) {
  const R = [[0, 1], [0.1, 0.78], [0.21, 0.84], [0.18, 0.55], [0.36, 0.68], [0.4, 0.58], [0.32, 0.44], [0.58, 0.52], [0.55, 0.34], [0.8, 0.18], [0.72, 0.1], [0.76, -0.02], [0.3, 0.02], [0.28, -0.12], [0.08, -0.26], [0.04, -0.3], [0.03, -0.62]];
  cy += 0.19 * s; // centre the leaf's bounding box on (cx, cy)
  ctx.beginPath();
  R.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy - y * s) : ctx.moveTo(cx + x * s, cy - y * s)));
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(cx - R[i][0] * s, cy - R[i][1] * s);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function roundelCanvas(ctx, w) {
  const c = w / 2;
  ctx.fillStyle = '#1d3f8f';
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath(); ctx.arc(c, c, c * 0.72, 0, 7); ctx.fill();
  leaf(ctx, c, c, c * 0.52, '#d2202c');
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

function flatXY(THREE, pts, depth, z0) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, z0);
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

const fuseSurf = (x, z) => Math.sqrt(Math.max(radiusAt(x) ** 2 - z * z, 1e-6)) + 0.0025;
const finSurf = () => 0.0078;

// Cheat line: a thin white ribbon on both sides, nose to tail.
function cheatLine(THREE) {
  const pos = [], idx = [];
  const N = 48, half = 0.0032;
  const x0 = 0.5, x1 = -0.66;
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

// An oriented plane (local x, y, normal z given by x cross y), for wing decals.
function orientedPlane(THREE, w, h, ax, ay, at) {
  const g = new THREE.PlaneGeometry(w, h);
  const az = new THREE.Vector3().crossVectors(ax, ay);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(at));
  return g;
}

function buildKit(THREE) {
  const own = []; // everything to dispose with the kit
  const keep = (o) => (own.push(o), o);
  const geo = {};

  // Sky/ground gradient for reflections (chrome, gloss). Auto-converted by the renderer.
  const env = keep(canvasTexture(THREE, 256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a5866'); g.addColorStop(0.44, '#b9c2cc');
    g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.53, '#2a323a'); g.addColorStop(1, '#0b0e12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(w * 0.1, h * 0.12, w * 0.12, h * 0.1);
  }));
  env.mapping = THREE.EquirectangularReflectionMapping;

  const fuselage = new THREE.LatheGeometry(PROFILE.map(([r, x]) => new THREE.Vector2(r, x)), 40);
  fuselage.rotateZ(-Math.PI / 2);
  geo.fuselage = fuselage;

  const wingShape = (side, pts) => pts.map(([x, y]) => [x, side * y]);
  const wingPlan = [[0.26, 0], [0.14, 0.66], [0.06, 0.66], [-0.06, 0]];
  const wingLe = [[0.262, 0], [0.142, 0.66], [0.137, 0.66], [0.257, 0]];
  geo.wing = { 1: flatXY(THREE, wingShape(1, wingPlan), WING_T, WING_Z), '-1': flatXY(THREE, wingShape(-1, wingPlan), WING_T, WING_Z) };
  geo.wingLe = { 1: flatXY(THREE, wingShape(1, wingLe), WING_T + 0.002, WING_Z - 0.001), '-1': flatXY(THREE, wingShape(-1, wingLe), WING_T + 0.002, WING_Z - 0.001) };
  geo.stab = flatXY(THREE, [[-0.48, 0.04], [-0.6, 0.3], [-0.68, 0.3], [-0.72, 0.04], [-0.72, -0.04], [-0.68, -0.3], [-0.6, -0.3], [-0.48, -0.04]], 0.012, -0.006);
  geo.strake = new THREE.BoxGeometry(0.08, 0.008, 0.07);
  geo.fin = flatXZ(THREE, [[-0.38, 0.03], [-0.58, 0.3], [-0.69, 0.3], [-0.72, 0.03]], 0.014);
  geo.ventral = flatXZ(THREE, [[-0.5, 0.0], [-0.58, -0.075], [-0.68, -0.075], [-0.7, 0.0]], 0.01);
  geo.spine = ellipsoid(THREE, -0.22, 0, 0.058, 0.25, 0.042, 0.04);
  geo.glassFront = ellipsoid(THREE, 0.245, 0, 0.078, 0.1, 0.058, 0.06);
  geo.glassRear = ellipsoid(THREE, 0.075, 0, 0.078, 0.115, 0.058, 0.06);
  const floor = new THREE.CircleGeometry(1, 24);
  floor.scale(0.29, 0.056, 1);
  floor.translate(0.165, 0, 0.0895);
  geo.floor = floor;
  geo.helmet = new THREE.SphereGeometry(0.02, 12, 8);
  geo.seat = new THREE.BoxGeometry(0.014, 0.05, 0.05);
  const arch = new THREE.TorusGeometry(0.062, 0.0045, 6, 20, Math.PI);
  arch.rotateX(Math.PI / 2);
  arch.rotateZ(Math.PI / 2);
  arch.translate(0, 0, 0.078);
  geo.arch = arch;
  geo.rail = new THREE.CylinderGeometry(0.0038, 0.0038, 0.33, 6).rotateZ(Math.PI / 2);
  geo.stub = { 1: new THREE.CylinderGeometry(0.017, 0.011, 0.07, 10).rotateZ(Math.PI / 2).translate(0.46, 0.082, 0.01), '-1': new THREE.CylinderGeometry(0.017, 0.011, 0.07, 10).rotateZ(Math.PI / 2).translate(0.46, -0.082, 0.01) };
  const spin = new THREE.LatheGeometry([[0.001, 0.66], [0.012, 0.645], [0.028, 0.615], [0.04, 0.575], [0.045, 0.52]].map(([r, x]) => new THREE.Vector2(r, x)), 24);
  spin.rotateZ(-Math.PI / 2);
  geo.spinner = spin;
  const disc = new THREE.CircleGeometry(0.26, 32);
  disc.rotateY(Math.PI / 2);
  disc.translate(0.53, 0, 0);
  geo.disc = disc;
  const blade = (v0, v1, w0, w1) => {
    const s = new THREE.Shape([[-w0, v0], [w0, v0], [w1, v1], [-w1, v1]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // depth along x, radial along y
    g.translate(0.532, 0, 0);
    return g;
  };
  geo.blade = blade(0.03, 0.22, 0.016, 0.012);
  geo.bladeTip = blade(0.22, 0.26, 0.012, 0.011);
  geo.cheat = cheatLine(THREE);
  for (const o of [geo.fuselage, geo.stab, geo.strake, geo.fin, geo.ventral, geo.spine, geo.glassFront, geo.glassRear, geo.floor, geo.helmet, geo.seat, geo.arch, geo.rail, geo.spinner, geo.disc, geo.blade, geo.bladeTip, geo.cheat]) keep(o);
  for (const s of ['1', '-1']) { keep(geo.wing[s]); keep(geo.wingLe[s]); keep(geo.stub[s]); }

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

  const decalGeo = {
    roundelSide: { 1: patch(THREE, -0.3, -0.018, 0.055, 0.055, 1, fuseSurf), '-1': patch(THREE, -0.3, -0.018, 0.055, 0.055, -1, fuseSurf) },
    canada: { 1: patch(THREE, 0.33, cheatZ(0.33) + 0.024, 0.1, 0.028, 1, fuseSurf), '-1': patch(THREE, 0.33, cheatZ(0.33) + 0.024, 0.1, 0.028, -1, fuseSurf) },
    triA: { 1: patch(THREE, 0.06, cheatZ(0.06) + 0.03, 0.024, 0.024, 1, fuseSurf), '-1': patch(THREE, 0.06, cheatZ(0.06) + 0.03, 0.024, 0.024, -1, fuseSurf) },
    triB: { 1: patch(THREE, 0.19, cheatZ(0.19) + 0.03, 0.024, 0.024, 1, fuseSurf), '-1': patch(THREE, 0.19, cheatZ(0.19) + 0.03, 0.024, 0.024, -1, fuseSurf) },
    nose: { 1: patch(THREE, 0.39, -0.05, 0.05, 0.062, 1, fuseSurf), '-1': patch(THREE, 0.39, -0.05, 0.05, 0.062, -1, fuseSurf) },
    tail: { 1: patch(THREE, -0.633, 0.165, 0.16, 0.256, 1, finSurf), '-1': patch(THREE, -0.633, 0.165, 0.16, 0.256, -1, finSurf) },
    // Upper left wing: seen from above, nose up, right = -Y.
    roundelWing: orientedPlane(THREE, 0.14, 0.14, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.1, 0.4, WING_Z + WING_T + 0.001)),
    // Under the right wing: seen from below with the nose up, it reads left to right.
    wingNum: orientedPlane(THREE, 0.27, 0.09, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.09, -0.4, WING_Z - 0.001)),
  };
  for (const v of Object.values(decalGeo)) {
    if (v.isBufferGeometry) keep(v);
    else { keep(v[1]); keep(v['-1']); }
  }

  const mat = (params) => keep(new THREE.MeshStandardMaterial(params));
  const decalMat = (map) => keep(new THREE.MeshStandardMaterial({
    map, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.6,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const mats = {
    navy: mat({ color: NAVY, roughness: 0.34, metalness: 0.2, envMap: env, envMapIntensity: 0.55 }),
    cheat: mat({ color: '#f1f4f8', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wingLe: mat({ color: '#f1f4f8', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.25 }),
    chrome: mat({ color: '#f2f5f8', roughness: 0.1, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    exhaust: mat({ color: '#4a4d54', roughness: 0.45, metalness: 0.8, envMap: env, envMapIntensity: 0.6 }),
    glass: mat({ color: '#3e556a', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.5, envMap: env, envMapIntensity: 0.9, depthWrite: false }),
    frame: mat({ color: '#0c1017', roughness: 0.5 }),
    floor: mat({ color: '#0d1118', roughness: 0.9, side: THREE.DoubleSide }),
    helmet: mat({ color: '#d4d8de', roughness: 0.35 }),
    blade: mat({ color: '#0a0c10', roughness: 0.6 }),
    tip: mat({ color: '#d2202c', roughness: 0.5 }),
    disc: keep(new THREE.MeshBasicMaterial({ color: '#dcebff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })),
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

// ---------- the per-ship model ----------

function wingGroup(THREE, kit, side, materials) {
  const g = new THREE.Group();
  g.rotation.x = side * DIHEDRAL;
  const key = String(side);
  g.add(new THREE.Mesh(kit.geo.wing[key], materials.wing));
  if (materials.wingLe) g.add(new THREE.Mesh(kit.geo.wingLe[key], materials.wingLe));
  return g;
}

/**
 * Returns a THREE.Group: nose +X, left +Y, up +Z, nose-to-tail length lengthFt.
 * color: CSS colour of the ship (the whole tail in 'harvard', everything in 'ship').
 * number: the ship number, drawn on the fin and nose ('harvard' only).
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
  const add = (geometry, material, parent = g) => {
    const m = new THREE.Mesh(geometry, material);
    parent.add(m);
    return m;
  };

  if (paint === 'ship') {
    const base = new THREE.Color(color);
    const m = (c, extra) => own(new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.1, ...extra }));
    const body = m(base);
    const light = m(base.clone().multiplyScalar(0.82));
    add(geo.fuselage, body);
    for (const s of [1, -1]) g.add(wingGroup(THREE, kit, s, { wing: light }));
    add(geo.stab, light);
    add(geo.strake, light).position.set(-0.64, 0.3, 0.005);
    add(geo.strake, light).position.set(-0.64, -0.3, 0.005);
    add(geo.fin, m(base.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
    add(geo.ventral, light);
    add(geo.spine, body);
    add(geo.glassFront, m('#8fc4ff', { transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.4 }));
    add(geo.glassRear, mine[mine.length - 1]);
    add(geo.spinner, m('#20242a', { roughness: 0.4 }));
    add(geo.disc, mats.disc);
  } else {
    const num = String(number ?? '');
    const wingTex = own(canvasTexture(THREE, 384, 128, (ctx, w, h) => outlinedText(ctx, `12${num}`, w / 2, h / 2, h * 0.86, 5)));
    const tailTex = own(canvasTexture(THREE, 320, 512, tailCanvas(num)));
    const noseTex = own(canvasTexture(THREE, 128, 160, (ctx, w, h) => outlinedText(ctx, num, w / 2, h / 2, h * 0.82, 7)));
    const decal = (tx) => own(new THREE.MeshStandardMaterial({
      map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.6,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const finMat = own(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, envMap: mats.navy.envMap, envMapIntensity: 0.4 }));

    add(geo.fuselage, mats.navy);
    add(geo.cheat, mats.cheat);
    for (const s of [1, -1]) {
      const wg = wingGroup(THREE, kit, s, { wing: mats.navy, wingLe: mats.wingLe });
      g.add(wg);
      if (s === 1) add(decalGeo.roundelWing, mats.roundel, wg);
      else add(decalGeo.wingNum, decal(wingTex), wg);
    }
    add(geo.stab, mats.navy);
    add(geo.strake, mats.navy).position.set(-0.64, 0.3, 0.005);
    add(geo.strake, mats.navy).position.set(-0.64, -0.3, 0.005);
    add(geo.ventral, mats.navy);
    add(geo.spine, mats.navy);
    add(geo.fin, finMat);
    const tailMat = decal(tailTex);
    const noseMat = decal(noseTex);
    for (const s of ['1', '-1']) {
      add(decalGeo.tail[s], tailMat);
      add(decalGeo.nose[s], noseMat);
      add(decalGeo.roundelSide[s], mats.roundel);
      add(decalGeo.canada[s], mats.canada);
      add(decalGeo.triA[s], mats.tri);
      add(decalGeo.triB[s], mats.tri);
      add(geo.stub[s], mats.exhaust);
    }
    // Cockpits: dark floor, seat backs, helmets, then glass, arches and rails.
    add(geo.floor, mats.floor);
    for (const x of [0.25, 0.08]) {
      add(geo.seat, mats.frame).position.set(x - 0.03, 0, 0.115);
      add(geo.helmet, mats.helmet).position.set(x, 0, 0.116);
    }
    add(geo.glassFront, mats.glass);
    add(geo.glassRear, mats.glass);
    for (const x of [0.335, 0.165, -0.03]) add(geo.arch, mats.frame).position.x = x;
    for (const s of [1, -1]) add(geo.rail, mats.frame).position.set(0.165, s * 0.059, 0.083);
    add(geo.spinner, mats.chrome);
    add(geo.disc, mats.disc);
    const prop = new THREE.Group();
    prop.rotation.x = rad(22);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Group();
      b.rotation.x = (k * Math.PI) / 2;
      add(geo.blade, mats.blade, b);
      add(geo.bladeTip, mats.tip, b);
      prop.add(b);
    }
    g.add(prop);
  }
  root.userData.ct156 = { kit, mine, paint };
  return root;
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
