// 15 Wing Moose Jaw (CYMJ) circuit ground references (EFIG p.130, 131, 151, 185, 209, 211).
// Low-poly landmarks the students use to fly the visual pattern, placed from Patrick's Google Maps pins (3 Oct).
// World frame: X east, Y north, Z up, feet from the ARP (50.3303 N, 105.5592 W). Field floor 1,880 ft.
// Every geometry and material is freed by disposeLandmarks (D411). Trees are one InstancedMesh (one draw call).

import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';

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

/** A round bin or silo: a steel cylinder standing on the floor. */
function bin(THREE, r, h, mat, x, y, name) {
  const geo = new THREE.CylinderGeometry(r, r, h, 12);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, h / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, 0);
  m.name = name;
  return m;
}

/** A Quonset (half-round) barn, its length along X. */
function quonset(THREE, length, width, mat, x, y, name) {
  const geo = new THREE.CylinderGeometry(width / 2, width / 2, length, 16, 1, false, 0, Math.PI);
  geo.rotateY(-Math.PI / 2); // the half-round up
  geo.rotateZ(Math.PI / 2); // its axis along X
  geo.scale(1, 1, 0.7); // a little lower than a full half-circle, like the real barn (estimate)
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, 0);
  m.name = name;
  return m;
}

/** A repeatable 0-to-1 roll for scattering: the same picture every time the scene is built. */
function scatterRolls(seed) {
  let h = seed >>> 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 2 ** 32;
  };
}

// Window Farm's layout, feet round Patrick's pin (x east, y north), traced off Esri's true-scale photo (5 Oct,
// about ±15 ft; Patrick 5 Oct 01:43Z: the buildings go on the big white barn, the brown block is pigs).
const WINDOW_FARM_PENS = Object.freeze([
  // [x0, y0, x1, y1]: the pens south-east of the yard, where the pigs are.
  [395, -640, 865, -365], [355, -850, 725, -655], [245, -850, 345, -730],
]);
const WINDOW_FARM_YARD = Object.freeze([20, -320, 300, -150]); // open yard south of the white barn: a few strays
const PIG_FT = Object.freeze({ length: 6, width: 2.6, height: 3 }); // a market hog, near enough (estimate)

/** Pigs: groups of 4 to 14 in the pens with solo pigs between them and a few kicking round the yard, one draw call. */
function pigs(THREE, mat) {
  const roll = scatterRolls(1880);
  const spots = [];
  const inBox = ([x0, y0, x1, y1]) => [x0 + roll() * (x1 - x0), y0 + roll() * (y1 - y0)];
  for (const pen of WINDOW_FARM_PENS) {
    const area = (pen[2] - pen[0]) * (pen[3] - pen[1]);
    const groups = Math.max(2, Math.round(area / 9000));
    for (let g = 0; g < groups; g++) {
      const [cx, cy] = inBox(pen);
      const n = 4 + Math.floor(roll() * 11);
      for (let k = 0; k < n; k++) spots.push([cx + (roll() - 0.5) * 30, cy + (roll() - 0.5) * 30, roll() * Math.PI * 2]);
    }
    const solos = Math.round(groups / 2);
    for (let k = 0; k < solos; k++) spots.push([...inBox(pen), roll() * Math.PI * 2]);
  }
  for (let k = 0; k < 6; k++) spots.push([...inBox(WINDOW_FARM_YARD), roll() * Math.PI * 2]);
  const geo = new THREE.BoxGeometry(PIG_FT.length, PIG_FT.width, PIG_FT.height);
  geo.translate(0, 0, PIG_FT.height / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.name = 'window-farm-pigs';
  const m = new THREE.Matrix4();
  spots.forEach(([x, y, a], i) => {
    m.makeRotationZ(a);
    m.setPosition(x, y, 0);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/** Window Farm: Titan Livestock east of Hwy 2: the long white barn with its Quonset end, bins, feedlot barns, pigs. */
function createWindowFarm(THREE, mats) {
  const g = new THREE.Group();
  g.add(box(THREE, 159, 101, 24, mats.white, -78, -26, 'window-farm-barn'));
  g.add(quonset(THREE, 122, 101, mats.white, 63, -26, 'window-farm-quonset'));
  g.add(shed(THREE, 69, 45, 16, mats.white, mats.grey, -118, 48, 'window-farm-shop'));
  g.add(bin(THREE, 20, 60, mats.steel, 133, 87, 'window-farm-silo-1'));
  g.add(bin(THREE, 20, 60, mats.steel, 133, 48, 'window-farm-silo-2'));
  for (let i = 0; i < 10; i++) g.add(bin(THREE, 11, 35, mats.steel, 300, 125 - i * 24, `window-farm-bin-${i + 1}`));
  g.add(shed(THREE, 60, 163, 20, mats.white, mats.grey, 355, -412, 'window-farm-feedlot-barn-1'));
  g.add(shed(THREE, 50, 150, 18, mats.white, mats.grey, 198, -575, 'window-farm-feedlot-barn-2'));
  g.add(box(THREE, 90, 38, 16, mats.white, 280, -650, 'window-farm-feedlot-barn-3'));
  g.add(box(THREE, 84, 56, 18, mats.white, 206, -697, 'window-farm-feedlot-barn-4'));
  g.add(pigs(THREE, mats.pig));
  return g;
}

/**
 * Sukanen Ship Pioneer Village, traced off Esri's true-scale photo (5 Oct, about ±15 ft; Patrick 5 Oct 01:43Z: the
 * red roof turns and the buildings move with it). The red-roofed hall runs east-west on Patrick's pin, with the grey
 * hall north of it, the white hall south, a column of halls to the east and a row of long sheds to the west.
 */
const SUKANEN_HALLS = Object.freeze([
  // [x, y, east-west length, north-south width, wall height]
  [-8, 61, 125, 45, 18], [1, -81, 101, 83, 18], [-40, 132, 62, 75, 16],
  [117, 80, 65, 71, 16], [117, -19, 65, 107, 16], [117, -107, 65, 54, 14],
  [-178, 140, 101, 38, 14], [-178, 89, 101, 60, 14], [-178, 23, 101, 58, 14], [-178, -38, 101, 53, 14],
  [-178, -93, 101, 49, 14],
]);

function createSukanen(THREE, mats) {
  const g = new THREE.Group();
  const eastWest = (w, d, h, roof, x, y, name) => {
    const s = shed(THREE, d, w, h, mats.white, roof, x, y, name); // ridge along its length
    s.rotation.z = Math.PI / 2;
    return s;
  };
  g.add(eastWest(121, 71, 20, mats.red, -6, -2, 'sukanen-red-roof'));
  SUKANEN_HALLS.forEach(([x, y, w, d, h], i) => g.add(eastWest(w, d, h, mats.grey, x, y, `sukanen-hall-${i + 1}`)));
  return g;
}

// The Auto Wrecker's car lot, feet round Patrick's pin, traced off Esri's true-scale photo (5 Oct, about ±15 ft):
// north-south rows of cars from the pin's south edge about 600 ft north, with a cross lane part way up.
const FIAT_ROW_X = Object.freeze([-125, -106, -72, -31, 16, 56, 94, 131, 175, 215, 256]);
const FIAT_ROW_Y = Object.freeze([-70, 520]);
const FIAT_LANE_Y = Object.freeze([135, 175]);
const CAR_FT = Object.freeze({ length: 16, width: 7, height: 5.5, spacing: 10 }); // a car, near enough (estimate)

/** Auto Wrecker (Fiat Farm): the whole lot of scrapped cars (instanced) and the farmyard buildings south of it. */
function createFiatFarm(THREE, mats) {
  const g = new THREE.Group();
  const roll = scatterRolls(2_155);
  const spots = [];
  for (const x of FIAT_ROW_X) {
    for (let y = FIAT_ROW_Y[0]; y <= FIAT_ROW_Y[1]; y += CAR_FT.spacing) {
      if (y > FIAT_LANE_Y[0] && y < FIAT_LANE_Y[1]) continue;
      if (roll() < 0.12) continue; // the odd gap
      spots.push([x + (roll() - 0.5) * 3, y, (roll() - 0.5) * 0.35]);
    }
  }
  const carGeo = new THREE.BoxGeometry(CAR_FT.length, CAR_FT.width, CAR_FT.height);
  carGeo.translate(0, 0, CAR_FT.height / 2);
  const cars = new THREE.InstancedMesh(carGeo, mats.car, spots.length);
  cars.name = 'fiat-farm-cars';
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const tones = ['#7c2d12', '#334155', '#a3a3a3', '#1e3a8a', '#e5e5e5', '#365314'];
  spots.forEach(([x, y, a], i) => {
    m.makeRotationZ(a); // parked nose to the lane, length east-west
    m.setPosition(x, y, 0);
    cars.setMatrixAt(i, m);
    cars.setColorAt?.(i, c.set(tones[Math.floor(roll() * tones.length)]));
  });
  g.add(cars);
  g.add(shed(THREE, 50, 34, 16, mats.white, mats.grey, -200, -367, 'fiat-farm-house'));
  g.add(shed(THREE, 50, 44, 16, mats.white, mats.grey, -250, -243, 'fiat-farm-shed'));
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
 * Arrow Tree Rows: north-south shelterbelts in the corners between two pivots, an hourglass from the air. The pin is
 * where the two pivots touch. Moved onto the tree lines in Esri's true-scale photo (5 Oct, about ±15 ft; Patrick
 * 5 Oct 01:43Z): one long row north of the pin, three rows in the south wedge, and the groves at the corners.
 * Rows Patrick traced on 3 Oct that have no trees on the true photo (two north, two south-west) are left out.
 */
const ARROW_ROWS = Object.freeze([
  [12, 1207, 12, 557], [-598, 1258, -598, 1170], [616, 1258, 634, 1082],
  [10, -493, 10, -1255], [-317, -980, -317, -1318], [345, -880, 345, -1305], [670, -1100, 670, -1340],
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
export function createLandmarks(THREE, { floor = THRESHOLD_DATA_ELEV_FT } = {}) {
  const root = new THREE.Group();
  root.name = 'circuit-landmarks';
  const lam = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
  const mats = {
    white: lam('#eef0f2'), grey: lam('#8b95a1'), red: lam('#c0262d'), pens: lam('#7a3b1d'),
    steel: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.35, metalness: 0.7 }),
    car: lam('#ffffff'), tree: lam('#1f4d2b'), pig: lam('#e8a7a0'),
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
 * Hwy 2 centreline (x east, y north, ft from the ARP), north to south. Read off Esri's true-scale photo (5 Oct,
 * about ±30 ft; TR-67): the divided highway north of the field, then the road due south past Window Farm's west
 * side and about 1,000 ft east of the Sukanen Ship pin (through the Sukanen Ship intersection, EFIG p.211), bending
 * south-west near 4.7 NM south of the field.
 */
export const HWY2_POINTS = Object.freeze([
  Object.freeze([6250, 8000]), Object.freeze([5700, -4324]), Object.freeze([5700, -18267]), Object.freeze([5700, -28400]),
  Object.freeze([4950, -31450]),
]);
export const HWY2_WIDTH_FT = 40;

/** A flat ribbon along `points`, 1 ft above the floor and polygon-offset so it never z-fights the photo. */
export function createHighway(THREE, points, floor = THRESHOLD_DATA_ELEV_FT, width = HWY2_WIDTH_FT) {
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

/**
 * 29L threshold sock ~250 ft SW of centreline; mid-field sock south of the runway (ft from the ARP). Moved with the
 * runway onto its true thresholds (TR-67), keeping their places beside it.
 */
export const WINDSOCK_SITES = Object.freeze([
  Object.freeze({ id: 'windsock-29l', x: 2678, y: -2997 }),
  Object.freeze({ id: 'windsock-midfield', x: 253, y: -1872 }),
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
export function createWindsocks(THREE, { floor = THRESHOLD_DATA_ELEV_FT } = {}) {
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
