// 15 Wing Moose Jaw (CYMJ) circuit ground references (EFIG p.130, 131, 151, 185, 209, 211).
// Low-poly landmarks the students use to fly the visual pattern, placed from Patrick's Google Maps pins (3 Oct).
// World frame: X east, Y north, Z up, feet from the ARP (50.3303 N, 105.5592 W). Field floor 1,880 ft.
// Every geometry and material is freed by disposeLandmarks (D411). Trees are one InstancedMesh (one draw call).

import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';

const ARP = makeLocalRef(50.3303, -105.5592);
const at = (lat, lon) => latLonToLocalFt(ARP, lat, lon);

/** Pins from Patrick (3 Oct 2026, Google Maps). Positions are exact to the pin; models round them. */
export const CYMJ_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'window-farm', name: 'Window Farm (Titan Livestock)', kind: 'feedlot', lat: 50.318447904749114, lon: -105.53300074655971, source: 'EFIG p.151, 211; Patrick pin' }),
  Object.freeze({ id: 'sukanen-ship', name: 'Sukanen Ship (red roof)', kind: 'museum', lat: 50.28107901208548, lon: -105.53911866067092, source: 'EFIG p.185, 211; Patrick pin' }),
  Object.freeze({ id: 'fiat-farm', name: 'Auto Wrecker (Fiat Farm)', kind: 'wrecker', lat: 50.259722414439366, lon: -105.50834482311059, source: 'EFIG p.131, 185, 211; Patrick pin' }),
  Object.freeze({ id: 'arrow-trees', name: 'Arrow Tree Rows', kind: 'arrow', lat: 50.262255452976014, lon: -105.48630553284724, source: 'EFIG p.131, 185, 211; Patrick pin' }),
].map((l) => Object.freeze({ ...l, ...at(l.lat, l.lon) })));

// ---------------------------------------------------------------------------

function box(THREE, w, d, h, mat, x, y, name) {
  const geo = new THREE.BoxGeometry(w, d, h);
  geo.translate(0, 0, h / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, 0);
  m.name = name;
  return m;
}

/** A gable-roofed shed: walls box plus a prism roof. */
function shed(THREE, w, d, h, wallMat, roofMat, x, y, name) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, 0);
  g.add(box(THREE, w, d, h, wallMat, 0, 0, `${name}-walls`));
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 2, 0), new THREE.Vector2(w / 2 + 2, 0), new THREE.Vector2(0, w * 0.22)]);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 4, bevelEnabled: false });
  roofGeo.rotateX(Math.PI / 2);
  roofGeo.translate(0, (d + 4) / 2, h);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.name = `${name}-roof`;
  g.add(roof);
  return g;
}

/** Window Farm: Titan Livestock feedlot east of Hwy 2, rust-red pens, white barns, a truck shop. */
function createWindowFarm(THREE, mats) {
  const g = new THREE.Group();
  g.add(box(THREE, 520, 380, 1.5, mats.pens, 260, -120, 'window-farm-pens'));
  g.add(shed(THREE, 160, 70, 22, mats.white, mats.grey, -40, 220, 'window-farm-shop'));
  g.add(shed(THREE, 90, 60, 18, mats.white, mats.grey, 120, 60, 'window-farm-barn'));
  for (let i = 0; i < 3; i++) g.add(box(THREE, 14, 14, 40, mats.steel, 60 + i * 20, 230, `window-farm-bin-${i + 1}`));
  return g;
}

/** Sukanen Ship Pioneer Village: the red-roofed hall, grey sheds, the ship hull and a wooden elevator. */
function createSukanen(THREE, mats) {
  const g = new THREE.Group();
  g.add(shed(THREE, 70, 120, 20, mats.white, mats.red, 0, 0, 'sukanen-red-roof'));
  g.add(shed(THREE, 60, 160, 18, mats.white, mats.grey, -160, 20, 'sukanen-hall-west'));
  g.add(shed(THREE, 50, 140, 16, mats.white, mats.grey, 90, 10, 'sukanen-hall-east'));
  // The ship: a tapered hull with a wheelhouse.
  const hull = new THREE.Shape([
    new THREE.Vector2(-55, -12), new THREE.Vector2(45, -12), new THREE.Vector2(65, 0),
    new THREE.Vector2(45, 12), new THREE.Vector2(-55, 12),
  ]);
  const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 18, bevelEnabled: false });
  const ship = new THREE.Mesh(hullGeo, mats.hull);
  ship.name = 'sukanen-ship-hull';
  ship.position.set(260, 360, 0);
  g.add(ship);
  g.add(box(THREE, 24, 18, 14, mats.white, 250, 360, 'sukanen-ship-wheelhouse'));
  g.children.at(-1).position.z = 18;
  // A wooden prairie elevator, the tall cue from downwind.
  g.add(box(THREE, 30, 30, 85, mats.elevator, 380, 240, 'sukanen-elevator'));
  return g;
}

/** Auto Wrecker (Fiat Farm): rows of scrapped cars (instanced) inside shelterbelts. */
function createFiatFarm(THREE, mats) {
  const g = new THREE.Group();
  const rows = 8;
  const perRow = 18;
  const carGeo = new THREE.BoxGeometry(15, 7, 5);
  carGeo.translate(0, 0, 2.5);
  const cars = new THREE.InstancedMesh(carGeo, mats.car, rows * perRow);
  cars.name = 'fiat-farm-cars';
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const tones = ['#7c2d12', '#334155', '#a3a3a3', '#1e3a8a', '#e5e5e5', '#365314'];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      m.makeRotationZ(((r * 7 + k * 3) % 5 - 2) * 0.08);
      m.setPosition(-140 + k * 16, 40 + r * 22, 0);
      cars.setMatrixAt(i, m);
      cars.setColorAt?.(i, c.set(tones[(r + k) % tones.length]));
      i++;
    }
  }
  g.add(cars);
  g.add(shed(THREE, 60, 40, 16, mats.white, mats.grey, 0, -20, 'fiat-farm-house'));
  return g;
}

/**
 * Tree rows as one InstancedMesh. Each row is [x0, y0, x1, y1] in feet relative to the group; trees every ~25 ft.
 * @returns {any} InstancedMesh
 */
function treeRows(THREE, mat, rows, name, spacing = 25) {
  const pts = [];
  for (const [x0, y0, x1, y1] of rows) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  }
  const geo = new THREE.ConeGeometry(11, 38, 5);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 19);
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  pts.forEach(([x, y], i) => {
    const s = 0.85 + ((i * 37) % 30) / 100;
    m.makeScale(s, s, s);
    m.setPosition(x, y, 0);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/**
 * Arrow Tree Rows: north-south shelterbelts filling the corners between two pivots, an hourglass from the air.
 * Traced from Patrick's blue lines (3 Oct, about 9 ft per pixel); the pin is where the two pivots touch.
 */
const ARROW_ROWS = Object.freeze([
  [-598, 1258, -598, 1170], [-334, 1240, -378, 950], [0, 1214, 0, 466], [308, 1232, 326, 906], [616, 1258, 634, 1082],
  [-704, -1232, -722, -1408], [-563, -1126, -563, -1390], [-317, -994, -317, -1346], [0, -546, 0, -1311],
  [308, -898, 308, -1311], [651, -1100, 616, -1452],
]);

function createArrowTrees(THREE, mats) {
  const g = new THREE.Group();
  g.add(treeRows(THREE, mats.tree, ARROW_ROWS, 'arrow-trees-rows'));
  return g;
}

const BUILDERS = { feedlot: createWindowFarm, museum: createSukanen, wrecker: createFiatFarm, arrow: createArrowTrees };

/**
 * Builds every circuit landmark.
 * @param {any} THREE
 * @param {{ floor?: number }} [options]
 */
export function createLandmarks(THREE, { floor = 1880 } = {}) {
  const root = new THREE.Group();
  root.name = 'circuit-landmarks';
  const lam = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
  const mats = {
    white: lam('#eef0f2'), grey: lam('#8b95a1'), red: lam('#c0262d'), pens: lam('#7a3b1d'),
    steel: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.35, metalness: 0.7 }),
    hull: lam('#5b4636'), elevator: lam('#8a3a26'), car: lam('#ffffff'), tree: lam('#1f4d2b'),
  };
  for (const l of CYMJ_LANDMARKS) {
    const g = BUILDERS[l.kind](THREE, mats);
    g.name = l.id;
    g.userData = { landmark: l };
    g.position.set(l.x, l.y, floor);
    root.add(g);
  }
  root.add(createHighway(THREE, HWY2_POINTS, floor));
  return root;
}

// ---- Highway 2 ------------------------------------------------------------------------------------

/**
 * Hwy 2 centreline (x east, y north, ft from the ARP), north to south. Estimated from Patrick's photos: about
 * 500 ft west of Window Farm and 600 ft east of Sukanen Ship. NEEDS A VISUAL CHECK against the satellite photo;
 * correct the points here.
 */
export const HWY2_POINTS = Object.freeze([
  Object.freeze([5892, 8000]), Object.freeze([5600, -4324]), Object.freeze([5277, -17956]), Object.freeze([4992, -30000]),
]);
export const HWY2_WIDTH_FT = 40;

/** A flat ribbon along `points`, 1 ft above the floor and polygon-offset so it never z-fights the photo. */
export function createHighway(THREE, points, floor = 1880, width = HWY2_WIDTH_FT) {
  const pos = [];
  const idx = [];
  points.forEach(([x, y], i) => {
    const [ax, ay] = points[Math.max(0, i - 1)];
    const [bx, by] = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len * (width / 2);
    const ny = (bx - ax) / len * (width / 2);
    pos.push(x + nx, y + ny, 0, x - nx, y - ny, 0);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: '#5f6368', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hwy2';
  mesh.position.set(0, 0, floor + 1);
  return mesh;
}

// ---- Windsocks --------------------------------------------------------------------------------------

/** 29L threshold sock ~250 ft SW of centreline; mid-field sock south of the runway (ft from the ARP). */
export const WINDSOCK_SITES = Object.freeze([
  Object.freeze({ id: 'windsock-29l', x: 2987, y: -3415 }),
  Object.freeze({ id: 'windsock-midfield', x: 267, y: -2140 }),
]);
export const WINDSOCK_FULL_KT = 15;
const MAST_FT = 20;
const SOCK_FT = 15;
const HANG_RAD = (85 * Math.PI) / 180;

/** 0 (hanging) to 1 (straight out) for a wind speed; anything not a positive number is calm. */
export function sockExtension(windKt) {
  const kt = Number(windKt);
  if (!Number.isFinite(kt) || kt <= 0) return 0;
  return Math.min(1, kt / WINDSOCK_FULL_KT);
}

/** Compass heading the sock points: downwind (wind from + 180). Missing wind gives 180 (from north). */
export function sockHeadingDeg(windFromDeg) {
  const from = Number(windFromDeg);
  const f = Number.isFinite(from) ? from : 0;
  return (((f + 180) % 360) + 360) % 360;
}

/**
 * Two orange/white striped socks on 20 ft masts. Each sock: mast + 4 stripe segments (5 meshes, shared geometry).
 * @param {any} THREE
 * @param {{ floor?: number }} [options]
 */
export function createWindsocks(THREE, { floor = 1880 } = {}) {
  const root = new THREE.Group();
  root.name = 'windsocks';
  const orange = new THREE.MeshStandardMaterial({ color: '#f26a1b', roughness: 0.8, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.8, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.5, metalness: 0.6 });
  const mastGeo = new THREE.CylinderGeometry(0.3, 0.4, MAST_FT, 6);
  mastGeo.rotateX(Math.PI / 2);
  mastGeo.translate(0, 0, MAST_FT / 2);
  const segs = 4;
  const segGeos = [];
  for (let i = 0; i < segs; i++) {
    const r0 = 1.6 - (i * 0.8) / segs;
    const r1 = 1.6 - ((i + 1) * 0.8) / segs;
    const g = new THREE.CylinderGeometry(r1, r0, SOCK_FT / segs, 8, 1, true);
    g.rotateZ(-Math.PI / 2); // along +X
    g.translate((SOCK_FT / segs) * (i + 0.5), 0, 0);
    segGeos.push(g);
  }
  for (const site of WINDSOCK_SITES) {
    const sock = new THREE.Group();
    sock.name = site.id;
    sock.position.set(site.x, site.y, floor);
    const mast = new THREE.Mesh(mastGeo, steel);
    mast.name = `${site.id}-mast`;
    sock.add(mast);
    const yaw = new THREE.Group();
    yaw.name = `${site.id}-yaw`;
    yaw.position.set(0, 0, MAST_FT);
    const tilt = new THREE.Group();
    tilt.name = `${site.id}-tilt`;
    segGeos.forEach((g, i) => {
      const m = new THREE.Mesh(g, i % 2 ? white : orange);
      m.name = `${site.id}-stripe-${i + 1}`;
      tilt.add(m);
    });
    yaw.add(tilt);
    sock.add(yaw);
    sock.userData = { yaw, tilt };
    root.add(sock);
  }
  updateWindsocks(root, undefined, 0);
  return root;
}

/** Points every sock downwind and fills it by wind speed. Missing or NaN wind hangs it calm. */
export function updateWindsocks(group, windFromDeg, windKt) {
  if (!group) return;
  const ext = sockExtension(windKt);
  const heading = ext > 0 ? sockHeadingDeg(windFromDeg) : sockHeadingDeg(group.userData?.lastFrom);
  if (ext > 0 && Number.isFinite(Number(windFromDeg))) group.userData = { ...group.userData, lastFrom: Number(windFromDeg) };
  const yawRad = ((90 - heading) * Math.PI) / 180; // compass to the +X-east, +Y-north frame
  const tiltRad = (1 - ext) * HANG_RAD; // +Y rotation tips +X down toward -Z
  group.userData = { ...group.userData, headingDeg: heading, extension: ext };
  for (const sock of group.children) {
    const { yaw, tilt } = sock.userData ?? {};
    if (yaw) yaw.rotation.z = yawRad;
    if (tilt) tilt.rotation.y = tiltRad;
  }
}

/** Frees the windsocks (D411). */
export function disposeWindsocks(group) {
  disposeLandmarks(group);
}

/** Frees every geometry and material under the landmarks group (D411) and detaches it. */
export function disposeLandmarks(root) {
  if (!root) return;
  const geos = new Set();
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) mats.add(m);
    if (o.isInstancedMesh) o.dispose?.();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) { m.map?.dispose(); m.dispose(); }
  root.clear();
  root.removeFromParent?.();
}
