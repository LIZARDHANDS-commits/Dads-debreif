// 15 Wing Moose Jaw (CYMJ) circuit ground references (EFIG p.130, 131, 151, 185, 209, 211).
// Low-poly landmarks the students use to fly the visual pattern, placed from Patrick's Google Maps pins (3 Oct).
// World frame: X east, Y north, Z up, feet from the ARP (50.3303 N, 105.5592 W). Field floor 1,880 ft.
// Every geometry and material is freed by disposeLandmarks (D411). Trees are one InstancedMesh (one draw call).

import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';
import { batchByMaterial } from './batch3d.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';

const ARP = makeLocalRef(50.3303, -105.5592);
const at = (lat, lon) => latLonToLocalFt(ARP, lat, lon);

/** Pins from Patrick (3 Oct 2026, Google Maps). Positions are exact to the pin; models round them. */
export const CYMJ_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'window-farm', name: 'Window Farm (Titan Livestock)', kind: 'feedlot', lat: 50.318447904749114, lon: -105.53300074655971, source: 'EFIG p.151, 211; Patrick pin' }),
  Object.freeze({ id: 'sukanen-ship', name: 'Sukanen Ship (red roof)', kind: 'museum', lat: 50.28107901208548, lon: -105.53911866067092, source: 'EFIG p.185, 211; Patrick pin' }),
  Object.freeze({ id: 'fiat-farm', name: 'Auto Wrecker (Fiat Farm)', kind: 'wrecker', lat: 50.259722414439366, lon: -105.50834482311059, source: 'EFIG p.131, 185, 211; Patrick pin' }),
  Object.freeze({ id: 'arrow-trees', name: 'Arrow Tree Rows', kind: 'arrow', lat: 50.262255452976014, lon: -105.48630553284724, source: 'EFIG p.131, 185, 211; Patrick pin' }),
  // Patrick, 10 Oct: "3d models for these building groups. the first one is a lot of cows"; camera parked on each (TR-118). The name is a working name.
  Object.freeze({ id: 'south-feedlot', name: 'South Feedlot (cattle)', kind: 'cattle', lat: 50.2974064, lon: -105.5428827, source: 'Patrick, 10 Oct (camera on it); traced off Esri' }),
  Object.freeze({ id: 'crossroads-farm', name: 'Crossroads Farm', kind: 'farmstead', lat: 50.2961729, lon: -105.5819583, source: 'Patrick, 10 Oct (camera on it); traced off Esri' }),
  // Patrick, 10 Oct: "build a VOR antenna on this circle"; camera parked on it, the hut traced off Esri (977 ft W, 294 ft N of the ARP) (TR-119).
  Object.freeze({ id: 'vor', name: 'VOR', kind: 'vor', lat: 50.3311059, lon: -105.5633953, source: 'Patrick, 10 Oct (camera on it); traced off Esri' }),
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

/** A gable-roofed shed: walls box plus a prism roof, its ridge along Y (`rise` ft above the walls; a 0.22 pitch by default). */
function shed(THREE, w, d, h, wallMat, roofMat, x, y, name, rise = w * 0.22) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, 0);
  g.add(box(THREE, w, d, h, wallMat, 0, 0, `${name}-walls`));
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 2, 0), new THREE.Vector2(w / 2 + 2, 0), new THREE.Vector2(0, rise)]);
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

/**
 * Livestock scattered in pens as one InstancedMesh: groups in each pen, solo animals between them and a few in the yard.
 * pens: [x0, y0, x1, y1] (an optional fifth item 'n' or 's' packs the groups toward that side, where the feed lane is);
 * size: { length, width, height } ft; group: { perArea, min, spread } (one group per `perArea` sq ft, `min` to `min + span`
 * animals, `spread` ft across); coats: colours picked at random (one material colour when empty). Always the same picture.
 */
function herd(THREE, mat, { pens, yard = null, yardCount = 0, size, seed, name, group, coats = [] }) {
  const roll = scatterRolls(seed);
  const spots = [];
  const inBox = ([x0, y0, x1, y1]) => [x0 + roll() * (x1 - x0), y0 + roll() * (y1 - y0)];
  for (const pen of pens) {
    const [x0, y0, x1, y1, side] = pen;
    const area = (x1 - x0) * (y1 - y0);
    const groups = Math.max(2, Math.round(area / group.perArea));
    const keep = (x, y) => [Math.min(x1 - 2, Math.max(x0 + 2, x)), Math.min(y1 - 2, Math.max(y0 + 2, y))];
    for (let g = 0; g < groups; g++) {
      let [cx, cy] = inBox(pen);
      if (side === 's') cy = y0 + (y1 - y0) * roll() ** 2;
      if (side === 'n') cy = y1 - (y1 - y0) * roll() ** 2;
      const n = group.min + Math.floor(roll() * (group.span + 1));
      for (let k = 0; k < n; k++) spots.push([...keep(cx + (roll() - 0.5) * group.spread, cy + (roll() - 0.5) * group.spread), roll() * Math.PI * 2]);
    }
    const solos = Math.round(groups / 2);
    for (let k = 0; k < solos; k++) spots.push([...inBox(pen), roll() * Math.PI * 2]);
  }
  for (let k = 0; k < yardCount; k++) spots.push([...inBox(yard), roll() * Math.PI * 2]);
  const geo = new THREE.BoxGeometry(size.length, size.width, size.height);
  geo.translate(0, 0, size.height / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach(([x, y, a], i) => {
    m.makeRotationZ(a);
    m.setPosition(x, y, 0);
    mesh.setMatrixAt(i, m);
    if (coats.length) mesh.setColorAt?.(i, c.set(coats[Math.floor(roll() * coats.length)]));
  });
  return mesh;
}

/** Pigs: groups of 4 to 14 in the pens with solo pigs between them and a few kicking round the yard, one draw call. */
const pigs = (THREE, mat) => herd(THREE, mat, {
  pens: WINDOW_FARM_PENS, yard: WINDOW_FARM_YARD, yardCount: 6, size: PIG_FT, seed: 1880, name: 'window-farm-pigs',
  group: { perArea: 9000, min: 4, span: 10, spread: 30 },
});

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

/** A Quonset whose length runs north-south. */
function quonsetNS(THREE, length, width, mat, x, y, name) {
  const q = quonset(THREE, length, width, mat, 0, 0, name);
  const g = new THREE.Group();
  g.name = `${name}-turn`;
  g.position.set(x, y, 0);
  q.rotation.z = Math.PI / 2;
  g.add(q);
  return g;
}

/** Pen fences as one InstancedMesh of thin rails: each pen's outline and `split` cross fences, FENCE_FT high. */
const FENCE_FT = Object.freeze({ height: 5, thick: 0.6 }); // a feedlot pen fence, near enough (estimate)
function penFences(THREE, mat, pens, name) {
  const rails = [];
  for (const { box: [x0, y0, x1, y1], split = 1 } of pens) {
    rails.push([x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]);
    for (let k = 1; k < split; k++) {
      const x = x0 + ((x1 - x0) * k) / split;
      rails.push([x, y0, x, y1]);
    }
  }
  const geo = new THREE.BoxGeometry(1, FENCE_FT.thick, FENCE_FT.height);
  geo.translate(0, 0, FENCE_FT.height / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, rails.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  rails.forEach(([ax, ay, bx, by], i) => {
    m.makeScale(Math.hypot(bx - ax, by - ay), 1, 1);
    turn.makeRotationZ(Math.atan2(by - ay, bx - ax));
    m.premultiply(turn);
    m.setPosition((ax + bx) / 2, (ay + by) / 2, 0);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

/**
 * The South Feedlot, traced off Esri's true-scale photo on 10 Oct (about ±15 ft), in feet from the ARP; the builder moves
 * them round its anchor (3,800 E, 12,000 S). Two long rows of pens north, a block of pens round two long white barns
 * south, a pen block south-east, and the yard east with its big white shed and Quonset. Heights are estimates.
 */
const SOUTH_FEEDLOT_ANCHOR = Object.freeze({ x: 3800, y: -12000 });
const SOUTH_FEEDLOT_PENS = Object.freeze([
  // box [x0, y0, x1, y1], cross fences, the side its feed lane is on (the cattle crowd that side)
  { box: [2625, -11545, 4470, -11395], split: 12, side: 's' },
  { box: [2625, -11745, 4580, -11595], split: 13, side: 'n' },
  ...[[-12148, -12010], [-12436, -12298], [-12590, -12460], [-12723, -12598], [-12880, -12735]].flatMap(([y0, y1]) => [
    { box: [3505, y0, 3826, y1], split: 3 },
    { box: [3876, y0, 4188, y1], split: 3 },
  ]),
  { box: [4513, -12523, 4863, -12380], split: 2 },
]);
const COW_FT = Object.freeze({ length: 7.5, width: 3, height: 4.5 }); // a feeder steer, near enough (estimate)
const COW_COATS = Object.freeze(['#1c1c1c', '#1c1c1c', '#262321', '#6b2f1a', '#7a3a20', '#f1ece2', '#3a2a22']); // black, red, white-faced mixes
/** One group per 7,500 sq ft, 10 to 40 head each (about 300 sq ft a head, an estimate for a full feedlot): about 3,500 head in all. */
const COW_GROUP = Object.freeze({ perArea: 7500, min: 10, span: 30, spread: 70 });

function createSouthFeedlot(THREE, mats) {
  const g = new THREE.Group();
  const { x: ax, y: ay } = SOUTH_FEEDLOT_ANCHOR;
  const local = ([x0, y0, x1, y1]) => [x0 - ax, y0 - ay, x1 - ax, y1 - ay];
  const pens = SOUTH_FEEDLOT_PENS.map((p) => ({ ...p, box: local(p.box) }));
  g.add(penFences(THREE, mats.fence, pens, 'south-feedlot-fences'));
  g.add(herd(THREE, mats.cow, {
    pens: pens.map((p) => [...p.box, p.side]), size: COW_FT, seed: 1_016, name: 'south-feedlot-cows', group: COW_GROUP, coats: COW_COATS,
  }));
  const at = (x, y) => [x - ax, y - ay];
  const eastWestBarn = (len, wid, h, rise, x, y, name) => {
    const b = shed(THREE, wid, len, h, mats.white, mats.white, ...at(x, y), name, rise);
    b.rotation.z = Math.PI / 2;
    return b;
  };
  g.add(eastWestBarn(303, 135, 16, 12, 3656, -12222, 'south-feedlot-barn-west'));
  g.add(eastWestBarn(313, 135, 16, 12, 4032, -12222, 'south-feedlot-barn-east'));
  g.add(box(THREE, 263, 190, 24, mats.white, ...at(5056, -11448), 'south-feedlot-big-shed'));
  g.add(quonsetNS(THREE, 187, 93, mats.steel, ...at(5230, -11666), 'south-feedlot-quonset'));
  g.add(shed(THREE, 55, 113, 14, mats.white, mats.grey, ...at(4610, -11591), 'south-feedlot-white-barn'));
  g.add(shed(THREE, 107, 92, 14, mats.grey, mats.grey, ...at(4646, -12314), 'south-feedlot-grey-barn'));
  g.add(shed(THREE, 75, 113, 14, mats.grey, mats.grey, ...at(4650, -12091), 'south-feedlot-shop'));
  g.add(shed(THREE, 75, 100, 14, mats.white, mats.grey, ...at(5125, -11735), 'south-feedlot-machine-shed'));
  g.add(box(THREE, 55, 50, 12, mats.white, ...at(4410, -11323), 'south-feedlot-shed-north'));
  g.add(box(THREE, 87, 50, 12, mats.grey, ...at(4056, -11248), 'south-feedlot-feed-shed'));
  g.add(treeRows(THREE, mats.tree, [
    [4200, -11800, 4500, -11800], [4200, -11870, 4500, -11870], [4200, -11940, 4500, -11940], [4600, -11900, 4740, -11960],
  ].map(([x0, y0, x1, y1]) => [x0 - ax, y0 - ay, x1 - ax, y1 - ay]), 'south-feedlot-trees'));
  return g;
}

/**
 * The Crossroads Farm north-west of the crossroads, traced off Esri's true-scale photo on 10 Oct (about ±15 ft), in feet
 * from the ARP round its anchor (5,300 W, 12,450 S): two houses, two sheds, three Quonsets, a bin and its shelterbelts.
 * Every roof is silver (Patrick, 10 Oct: "the rooves ... must be silver").
 */
const CROSSROADS_FARM_ANCHOR = Object.freeze({ x: -5300, y: -12450 });
function createCrossroadsFarm(THREE, mats) {
  const g = new THREE.Group();
  const { x: ax, y: ay } = CROSSROADS_FARM_ANCHOR;
  const at = (x, y) => [x - ax, y - ay];
  g.add(shed(THREE, 56, 63, 12, mats.house, mats.steel, ...at(-5304, -12368), 'crossroads-farm-house'));
  g.add(shed(THREE, 56, 65, 12, mats.house, mats.steel, ...at(-5143, -12449), 'crossroads-farm-house-east'));
  g.add(box(THREE, 48, 31, 10, mats.steel, ...at(-5156, -12399), 'crossroads-farm-shed'));
  g.add(box(THREE, 50, 18, 9, mats.steel, ...at(-5246, -12265), 'crossroads-farm-trailer'));
  g.add(quonsetNS(THREE, 81, 46, mats.steel, ...at(-5425, -12536), 'crossroads-farm-quonset-grey'));
  g.add(quonsetNS(THREE, 150, 56, mats.steel, ...at(-5370, -12575), 'crossroads-farm-quonset-long'));
  g.add(quonsetNS(THREE, 79, 50, mats.steel, ...at(-5132, -12722), 'crossroads-farm-quonset-south'));
  g.add(bin(THREE, 9, 22, mats.steel, ...at(-5504, -12346), 'crossroads-farm-bin'));
  g.add(treeRows(THREE, mats.tree, [
    [-5536, -12120, -5105, -12120], [-5536, -12170, -5105, -12170], [-5830, -12128, -5830, -12865], [-5745, -12128, -5745, -12865],
    [-5392, -12275, -5142, -12275],
  ].map(([x0, y0, x1, y1]) => [x0 - ax, y0 - ay, x1 - ax, y1 - ay]), 'crossroads-farm-trees'));
  return g;
}

/** The VOR: a classic station, every size an estimate (TR-119): its equipment hut, the round flat counterpoise on top, and the cone antenna in the middle. */
const VOR_FT = Object.freeze({ hut: 16, hutHeight: 10, counterpoise: 15, thick: 1.2, cone: 3, coneHeight: 7 });
const VOR_BANDS = 4; // red and white bands on the antenna
function createVor(THREE, mats) {
  const g = new THREE.Group();
  g.add(box(THREE, VOR_FT.hut, VOR_FT.hut, VOR_FT.hutHeight, mats.white, 0, 0, 'vor-hut'));
  const disc = bin(THREE, VOR_FT.counterpoise, VOR_FT.thick, mats.steel, 0, 0, 'vor-counterpoise');
  disc.position.z = VOR_FT.hutHeight;
  g.add(disc);
  // The antenna in red and white bands (Patrick, 10 Oct: "white and red stripes"), red at the base: one frustum per band.
  const base = VOR_FT.hutHeight + VOR_FT.thick;
  for (let k = 0; k < VOR_BANDS; k++) {
    const h = VOR_FT.coneHeight / VOR_BANDS;
    const rBottom = VOR_FT.cone * (1 - k / VOR_BANDS);
    const rTop = VOR_FT.cone * (1 - (k + 1) / VOR_BANDS);
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 16);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, h / 2);
    const band = new THREE.Mesh(geo, k % 2 === 0 ? mats.red : mats.white);
    band.name = `vor-antenna-${k + 1}`;
    band.position.z = base + k * h;
    g.add(band);
  }
  return g;
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

const BUILDERS = {
  feedlot: createWindowFarm, museum: createSukanen, wrecker: createFiatFarm, arrow: createArrowTrees,
  cattle: createSouthFeedlot, farmstead: createCrossroadsFarm, vor: createVor,
};

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
    cow: lam('#ffffff'), fence: lam('#9a8f80'), house: lam('#d9d4c7'), // cow: white, so each animal's coat colour shows
  };
  for (const l of CYMJ_LANDMARKS) {
    const g = BUILDERS[l.kind](THREE, mats);
    g.name = l.id;
    g.userData = { landmark: l };
    g.position.set(l.x, l.y, floor);
    batchByMaterial(THREE, g); // fewer draw calls (TR-127); the landmark still stands on the ground as one group
    root.add(g);
  }
  // Hwy 2 is no longer drawn over the photo (Patrick, 5 Oct: "it looks like trash"); the photo shows the road.
  // HWY2_POINTS stays as the road's traced line.
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
