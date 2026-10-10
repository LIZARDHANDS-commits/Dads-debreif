// Flight-line and base buildings with their real shapes and roofs (Patrick, 10 Oct, with street-view and oblique photos: "the hangars
// have square roofs", "Fix the shapes and rooves of all the buildings I've included pictures of"; TR-119): Hangars 1 to 3 as flat-roofed
// hangars with their annexes, the Canex store and the big hall beside it, and 15 Wing Medical with Shipping and Receiving. Then (TR-120)
// the Mess, the two eastern hangars (the blue one, and 431 Squadron Snowbirds' with its red walls) and the fuel tanks in their red berms.
//
// Footprints are traced off Esri's true-scale photo (10 Oct, zoom 18, about ±5 ft; the Canex and Medical blocks reuse the 5 Oct
// traces from base-buildings3d.js), in feet from the ARP (x east, y north). HEIGHTS ARE ESTIMATES (no survey gives them): a
// storey about 14 ft, a hangar about 40 ft to the roof. Colours are read off the photos. Hangar 4 keeps its arched roof
// (scenery3d.js): the photo shows a barrel roof there.

/**
 * A block: [cx, cy, w (along its x), d (along its y), rotation (radians, anticlockwise), height, roof colour].
 * `wall` defaults to white cladding.
 */
const blk = (cx, cy, w, d, rot, h, roof, extra = {}) => Object.freeze({ cx, cy, w, d, rot, h, roof, ...extra });

/** Hangars 1 to 3: the main hangar, doors to the east onto the pad beside it (Patrick, 10 Oct: "The hangar doors should be facing east"), and its annexes (traced 10 Oct), none overlapping the hangar. */
export const FLAT_HANGARS = Object.freeze([
  Object.freeze({
    id: 'hangar-1', name: 'Hangar 1', accent: '#c8102e',
    main: blk(266, 2224, 178, 234, -0.08, 40, '#e6e3da'),
    annexes: Object.freeze([blk(284, 2356, 159, 31, -0.08, 20, '#3d434a'), blk(174, 2318, 18, 37, -0.08, 16, '#eceae4')]),
  }),
  Object.freeze({
    id: 'hangar-2', name: 'Hangar 2', accent: '#1d4ed8',
    main: blk(584, 2183, 166, 230, -0.04, 40, '#9d9f9c'),
    annexes: Object.freeze([blk(462, 2187, 72, 243, -0.04, 30, '#ecebe6'), blk(556, 2046, 108, 37, -0.04, 18, '#ecebe6')]),
  }),
  Object.freeze({
    id: 'hangar-3', name: 'Hangar 3', accent: '#c8102e',
    main: blk(887, 2150, 178, 217, -0.04, 40, '#2b2f33'),
    annexes: Object.freeze([blk(901, 2276, 162, 34, -0.04, 22, '#b8bcbf'), blk(788, 2230, 22, 59, -0.04, 16, '#eceae4'), blk(883, 2010, 187, 63, -0.04, 20, '#d9d7d0')]),
  }),
]);

/** The big hall by the main road (Patrick: "the blue-roofed building ... north of the glass palace"): a low arched roof with blue eaves, and its wings. */
export const CANEX_HALL = Object.freeze({
  id: 'canex-hall', name: 'Base hall',
  hall: blk(644, 3167, 188, 104, 0.82, 32, '#c4c8cc'),
  archRiseFt: 10, // the roof's rise across the hall (estimate, from the street view's curved end)
  blueWings: Object.freeze([blk(760, 3169, 58, 46, 0.82, 18, '#2563c9'), blk(677, 3081, 83, 40, -0.75, 16, '#2563c9')]),
  wing: blk(722, 3246, 98, 56, -0.75, 22, '#cfd2d4'),
});

/** The Canex store: white walls on a block base, a blue fascia band round the top, a dark flat roof and two glass entrance towers on the parking side (south-east). */
export const CANEX_STORE = Object.freeze({
  id: 'canex-store', name: 'Canex',
  body: blk(838, 3183, 167, 62, 0.855, 14, '#3a3f45'),
  fasciaFt: 6,
  towers: Object.freeze([0.3, 0.78]), // along its length, from its south-west end (street view)
});

/** 15 Wing Medical (black roofs, one storey, with a light plant box on top) and Canadian Forces Shipping and Receiving (light roof, taller). */
export const MEDICAL_BLOCKS = Object.freeze({
  id: 'medical',
  shipping: blk(-548, 2898, 146, 96, 0, 26, '#c9c7c0'),
  medical: Object.freeze([blk(-551, 2810, 135, 79, 0, 16, '#2a2d30'), blk(-400, 2829, 167, 142, 0, 16, '#2a2d30')]),
  plant: blk(-420, 2840, 34, 34, 0, 24, '#c9c7c0'),
});

const WALL = '#eceeef';
const BASE_BAND = '#6b7075';

function materials(THREE) {
  const cache = new Map();
  return (color, opts = {}) => {
    const key = `${color}|${opts.metal ?? 0}|${opts.rough ?? 0.7}`;
    if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: opts.metal ?? 0.05 }));
    return cache.get(key);
  };
}

/** A box of size w x d x h standing on z0 at the block's local (lx, ly), turned with the block. */
function boxAt(THREE, mat, b, lx, ly, w, d, h, z0 = 0) {
  const geo = new THREE.BoxGeometry(w, d, h);
  geo.translate(lx, ly, z0 + h / 2);
  geo.rotateZ(b.rot);
  geo.translate(b.cx, b.cy, 0);
  return new THREE.Mesh(geo, mat);
}

/** A flat-roofed block: white walls, a dark base band, and the roof colour on a thin cap on top, inside a 2 ft white rim. */
function flatBlock(THREE, mat, b, name) {
  const g = new THREE.Group();
  g.name = name;
  const walls = boxAt(THREE, mat(b.wall ?? WALL), b, 0, 0, b.w, b.d, b.h);
  walls.name = `${name}-walls`;
  g.add(walls);
  const band = boxAt(THREE, mat(BASE_BAND), b, 0, 0, b.w + 0.6, b.d + 0.6, 3);
  band.name = `${name}-base`;
  g.add(band);
  if (b.cap) g.add(boxAt(THREE, mat(b.cap), b, 0, 0, b.w + 0.8, b.d + 0.8, 0.8, b.h - 0.4)); // a light parapet cap
  const roof = boxAt(THREE, mat(b.roof), b, 0, 0, b.w - 4, b.d - 4, 0.6, b.h + (b.cap ? 0.2 : 0)); // on top, inside a 2 ft rim
  roof.name = `${name}-roof`;
  g.add(roof);
  return g;
}

/** A flat-roofed hangar: the main block with a door across its east face (a band in the hangar's colour over it) and its annexes. */
function flatHangar(THREE, mat, spec) {
  const g = new THREE.Group();
  g.name = spec.id;
  g.userData = { type: 'hangar', id: spec.id, name: spec.name, x: spec.main.cx, y: spec.main.cy };
  const m = spec.main;
  g.add(flatBlock(THREE, mat, m, `${spec.id}-main`));
  const doorW = m.d * 0.85;
  const doorH = 28;
  const door = boxAt(THREE, mat('#5b6470', { metal: 0.4, rough: 0.5 }), m, m.w / 2 + 0.6, 0, 1.2, doorW, doorH);
  door.name = `${spec.id}-doors`;
  g.add(door);
  const band = boxAt(THREE, mat(spec.accent), m, m.w / 2 + 0.8, 0, 1.2, doorW + 10, 5, doorH + 2);
  band.name = `${spec.id}-door-band`;
  g.add(band);
  spec.annexes.forEach((a, i) => g.add(flatBlock(THREE, mat, a, `${spec.id}-annex-${i + 1}`)));
  return g;
}

/** The hall: walls, a low arched roof along its length (light grey), blue eaves along both long sides and blue arched trim on the ends; then its wings. */
function canexHall(THREE, mat) {
  const s = CANEX_HALL;
  const b = s.hall;
  const g = new THREE.Group();
  g.name = s.id;
  g.userData = { type: 'building', id: s.id, name: s.name, x: b.cx, y: b.cy };
  const walls = boxAt(THREE, mat(WALL), b, 0, 0, b.w, b.d, b.h);
  walls.name = `${s.id}-walls`;
  g.add(walls);
  // The arched roof: a shallow circular segment across the width (local y), run along the length (local x).
  const half = b.d / 2;
  const rise = s.archRiseFt;
  const radius = (half * half + rise * rise) / (2 * rise);
  const theta = Math.asin(half / radius);
  const roofGeo = new THREE.CylinderGeometry(radius, radius, b.w + 2, 32, 1, true, -theta, 2 * theta);
  roofGeo.rotateZ(Math.PI / 2); // its axis along local x; the crown stays up (+z)
  roofGeo.translate(0, 0, b.h - (radius - rise));
  roofGeo.rotateZ(b.rot);
  roofGeo.translate(b.cx, b.cy, 0);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide }));
  roof.name = `${s.id}-roof`;
  g.add(roof);
  // The arched ends: walls up under the curve, with a blue trim on their edge.
  for (const end of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    for (let i = 0; i <= 16; i++) {
      const y = -half + (2 * half * i) / 16;
      shape.lineTo(y, Math.sqrt(Math.max(0, radius * radius - y * y)) - (radius - rise));
    }
    shape.lineTo(half, 0);
    const endGeo = new THREE.ShapeGeometry(shape);
    endGeo.rotateX(Math.PI / 2);
    endGeo.rotateZ(Math.PI / 2);
    endGeo.translate(end * (b.w / 2 + 0.2), 0, b.h);
    endGeo.rotateZ(b.rot);
    endGeo.translate(b.cx, b.cy, 0);
    const endWall = new THREE.Mesh(endGeo, new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.7, side: THREE.DoubleSide }));
    endWall.name = `${s.id}-end-${end > 0 ? 'ne' : 'sw'}`;
    g.add(endWall);
  }
  for (const side of [-1, 1]) {
    const eave = boxAt(THREE, mat('#1f5fbf', { rough: 0.5 }), b, 0, side * (half + 0.5), b.w + 2, 1.5, 4, b.h - 4);
    eave.name = `${s.id}-eave-${side > 0 ? 'nw' : 'se'}`;
    g.add(eave);
  }
  s.blueWings.forEach((w, i) => g.add(flatBlock(THREE, mat, w, `${s.id}-blue-wing-${i + 1}`)));
  const wing = flatBlock(THREE, mat, s.wing, `${s.id}-wing`);
  wing.add(boxAt(THREE, mat('#1f5fbf', { rough: 0.5 }), s.wing, 0, 0, s.wing.w + 1, s.wing.d + 1, 3, s.wing.h - 3));
  g.add(wing);
  return g;
}

/** The Canex store: white walls, a block base, a blue fascia band round the top, the dark roof, and two dark glass entrance towers on the south-east side. */
function canexStore(THREE, mat) {
  const s = CANEX_STORE;
  const b = s.body;
  const g = new THREE.Group();
  g.name = s.id;
  g.userData = { type: 'building', id: s.id, name: s.name, x: b.cx, y: b.cy };
  g.add(boxAt(THREE, mat(WALL), b, 0, 0, b.w, b.d, b.h));
  g.add(boxAt(THREE, mat('#9b958b'), b, 0, 0, b.w + 0.6, b.d + 0.6, 3)); // the block base
  const fascia = boxAt(THREE, mat('#1f5fbf', { rough: 0.45, metal: 0.3 }), b, 0, 0, b.w + 2, b.d + 2, s.fasciaFt, b.h - 1);
  fascia.name = `${s.id}-fascia`;
  g.add(fascia);
  g.add(boxAt(THREE, mat(b.roof), b, 0, 0, b.w - 2, b.d - 2, 0.6, b.h + s.fasciaFt - 1.2));
  for (const t of s.towers) {
    const tower = boxAt(THREE, mat('#2b3540', { metal: 0.6, rough: 0.15 }), b, -b.w / 2 + t * b.w, -b.d / 2 - 4, 14, 10, b.h + s.fasciaFt + 3);
    tower.name = `${s.id}-entrance`;
    g.add(tower);
  }
  return g;
}

/** Medical and Shipping and Receiving: flat blocks, with the plant box on Medical's roof. */
function medical(THREE, mat) {
  const s = MEDICAL_BLOCKS;
  const g = new THREE.Group();
  g.name = s.id;
  g.userData = { type: 'building', id: s.id, name: '15 Wing Medical', x: s.shipping.cx, y: s.shipping.cy };
  g.add(flatBlock(THREE, mat, s.shipping, 'shipping-receiving'));
  s.medical.forEach((b, i) => g.add(flatBlock(THREE, mat, b, `medical-${i + 1}`)));
  g.add(flatBlock(THREE, mat, s.plant, 'medical-plant'));
  return g;
}

/**
 * The Mess (15 Wing Mess; Patrick, 10 Oct, pin 50.34163 N, 105.56126 W, with an oblique photo and a street view): a cross of
 * dark-brown board-clad blocks with white-framed windows, two storeys, the middle block taller with a plant room on top, flat
 * black roofs with light parapet caps, and a brick chimney. Traced off Esri's photo (10 Oct, about ±10 ft), turned 0.30 rad.
 */
const MESS_ROT = 0.30;
const MESS_WALL = '#5b4636';
export const MESS = Object.freeze({
  id: 'mess', name: '15 Wing Mess',
  blocks: Object.freeze([
    blk(-524, 4087, 103, 75, MESS_ROT, 24, '#24272a', { wall: MESS_WALL, cap: '#c9c6bd' }),
    blk(-457, 4138, 70, 70, MESS_ROT, 30, '#24272a', { wall: MESS_WALL, cap: '#c9c6bd' }),
    blk(-392, 4140, 75, 60, MESS_ROT, 24, '#24272a', { wall: MESS_WALL, cap: '#c9c6bd' }),
  ]),
  plantRoom: blk(-449, 4161, 45, 30, MESS_ROT, 38, '#b9b6ad', { wall: MESS_WALL }),
  chimney: Object.freeze({ x: -478, y: 4150, size: 6, height: 46 }),
});

/**
 * The two hangars east of Hangar 4 (were plain boxes): black, lightly hipped roofs, white lower walls with single-storey white
 * annexes on the north-east and south-east sides, coloured upper walls (blue; 431 Squadron Snowbirds' red, with its "7" roundel
 * on the north-east wall), and doors on the south-west face (Patrick, 10 Oct: "the both face southwest"). Footprints are the
 * 5 Oct traces, checked on the photo 10 Oct.
 */
export const EAST_HANGARS = Object.freeze([
  Object.freeze({ id: 'hangar-5', name: 'Hangar 5', upper: '#1e3f8a', main: blk(1897, 2554, 252, 200, -0.70, 48, '#26292c') }),
  Object.freeze({ id: 'hangar-6', name: '431 Squadron Snowbirds', upper: '#c0262d', roundel: '7', main: blk(2104, 2772, 264, 166, -0.79, 48, '#26292c') }),
]);
const EAST_ANNEX = Object.freeze({ depth: 22, height: 16 }); // estimates, from the street views
const EAST_UPPER_FROM_FT = 18; // the coloured cladding starts above the annexes (street view)

/** The fuel tanks east of the Snowbirds hangar, in their red-walled berms (Patrick, 10 Oct: "3d sprites for the fuel towers (red bumpers around them)"). */
export const FUEL_FARM = Object.freeze({
  tanks: Object.freeze([
    Object.freeze({ x: 2812, y: 2880, diameter: 30, height: 32 }),
    Object.freeze({ x: 2812, y: 2739, diameter: 30, height: 32 }),
    Object.freeze({ x: 2775, y: 2602, diameter: 50, height: 36 }),
  ]),
  berms: Object.freeze([
    Object.freeze({ x0: 2780, y0: 2708, x1: 2867, y1: 2920 }),
    Object.freeze({ x0: 2702, y0: 2527, x1: 2871, y1: 2677 }),
  ]),
  bermFt: Object.freeze({ height: 4, width: 5 }), // estimates
});

/** A "7" in a white roundel with a red ring, drawn on a canvas (browser only; none in a test). */
function roundel(THREE, text, sizeFt) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  const c = doc.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext?.('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0262d';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 66, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(sizeFt, sizeFt), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}

function mess(THREE, mat) {
  const s = MESS;
  const g = new THREE.Group();
  g.name = s.id;
  g.userData = { type: 'building', id: s.id, name: s.name, x: s.blocks[1].cx, y: s.blocks[1].cy };
  s.blocks.forEach((b, i) => {
    g.add(flatBlock(THREE, mat, b, `${s.id}-block-${i + 1}`));
    // White-framed windows, two rows on each long side, every 16 ft.
    for (const side of [-1, 1]) {
      for (let x = -b.w / 2 + 10; x <= b.w / 2 - 8; x += 16) {
        for (const z of [5, 16]) g.add(boxAt(THREE, mat('#f1f1ee'), b, x, side * (b.d / 2 + 0.2), 5, 0.4, 5, z));
      }
    }
  });
  g.add(flatBlock(THREE, mat, s.plantRoom, `${s.id}-plant-room`));
  const c = s.chimney;
  g.add(boxAt(THREE, mat('#8a4a32'), { cx: c.x, cy: c.y, rot: MESS_ROT }, 0, 0, c.size, c.size, c.height));
  return g;
}

/** A low hip over a w x d roof, `rise` ft high at its peak, as a flattened four-sided pyramid. */
function hipRoof(THREE, material, b, rise) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geo.rotateY(Math.PI / 4); // its corners onto the box's corners
  geo.rotateX(Math.PI / 2); // its point up (+z)
  geo.scale(b.w, b.d, rise);
  geo.translate(0, 0, b.h + rise / 2);
  geo.rotateZ(b.rot);
  geo.translate(b.cx, b.cy, 0);
  return new THREE.Mesh(geo, material);
}

function eastHangar(THREE, mat, spec) {
  const m = spec.main;
  const g = new THREE.Group();
  g.name = spec.id;
  g.userData = { type: 'hangar', id: spec.id, name: spec.name, x: m.cx, y: m.cy };
  g.add(boxAt(THREE, mat(WALL), m, 0, 0, m.w, m.d, EAST_UPPER_FROM_FT));
  g.add(boxAt(THREE, mat(spec.upper, { rough: 0.5, metal: 0.25 }), m, 0, 0, m.w, m.d, m.h - EAST_UPPER_FROM_FT, EAST_UPPER_FROM_FT));
  const roof = hipRoof(THREE, mat(m.roof), m, 6);
  roof.name = `${spec.id}-roof`;
  g.add(roof);
  // Doors across the south-west face (local -y), under a white band.
  const doorW = m.w * 0.85;
  g.add(boxAt(THREE, mat('#5b6470', { metal: 0.4, rough: 0.5 }), m, 0, -m.d / 2 - 0.6, doorW, 1.2, 32));
  g.add(boxAt(THREE, mat('#f1f1ee'), m, 0, -m.d / 2 - 0.8, doorW + 10, 1.2, 4, 33));
  // White single-storey annexes along the north-east (+y) and south-east (+x) sides.
  const A = EAST_ANNEX;
  g.add(boxAt(THREE, mat(WALL), m, 0, m.d / 2 + A.depth / 2 + 0.5, m.w, A.depth, A.height));
  g.add(boxAt(THREE, mat('#d9d7d0'), m, 0, m.d / 2 + A.depth / 2 + 0.5, m.w - 2, A.depth - 2, 0.6, A.height));
  g.add(boxAt(THREE, mat(WALL), m, m.w / 2 + A.depth / 2 + 0.5, 0, A.depth, m.d, A.height));
  g.add(boxAt(THREE, mat(spec.upper), m, m.w / 2 + A.depth / 2 + 0.5, 0, A.depth - 2, m.d - 2, 0.6, A.height));
  if (spec.roundel) {
    const r = roundel(THREE, spec.roundel, 22);
    if (r) {
      // On the north-east wall above the annex, toward its north-west end.
      r.position.set(-m.w * 0.25, m.d / 2 + 0.3, EAST_UPPER_FROM_FT + 14);
      r.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(r);
      holder.position.set(m.cx, m.cy, 0);
      holder.rotation.z = m.rot;
      g.add(holder);
    }
  }
  return g;
}

function fuelFarm(THREE, mat) {
  const s = FUEL_FARM;
  const g = new THREE.Group();
  g.name = 'fuel-farm';
  for (const [k, t] of s.tanks.entries()) {
    const body = new THREE.CylinderGeometry(t.diameter / 2, t.diameter / 2, t.height, 32);
    body.rotateX(Math.PI / 2);
    body.translate(t.x, t.y, t.height / 2);
    const tank = new THREE.Mesh(body, mat('#f4f4f1', { rough: 0.5, metal: 0.2 }));
    tank.name = `fuel-tank-${k + 1}`;
    g.add(tank);
    const top = new THREE.ConeGeometry(t.diameter / 2, t.diameter * 0.08, 32);
    top.rotateX(Math.PI / 2);
    top.translate(t.x, t.y, t.height + t.diameter * 0.04);
    g.add(new THREE.Mesh(top, mat('#e6e6e2', { rough: 0.5, metal: 0.2 })));
  }
  const B = s.bermFt;
  for (const { x0, y0, x1, y1 } of s.berms) {
    const red = mat('#b3262b');
    const side = (cx, cy, w, d) => {
      const geo = new THREE.BoxGeometry(w, d, B.height);
      geo.translate(cx, cy, B.height / 2);
      return new THREE.Mesh(geo, red);
    };
    g.add(side((x0 + x1) / 2, y0, x1 - x0, B.width), side((x0 + x1) / 2, y1, x1 - x0, B.width));
    g.add(side(x0, (y0 + y1) / 2, B.width, y1 - y0), side(x1, (y0 + y1) / 2, B.width, y1 - y0));
  }
  return g;
}

/** Every building in this file, standing at z = floor. Returns { group, hangars }. */
export function createFlightlineBuildings(THREE, floor) {
  const mat = materials(THREE);
  const group = new THREE.Group();
  group.name = 'flightline-buildings';
  group.position.z = floor;
  const hangars = FLAT_HANGARS.map((h) => flatHangar(THREE, mat, h));
  for (const h of hangars) group.add(h);
  group.add(canexHall(THREE, mat));
  group.add(canexStore(THREE, mat));
  group.add(medical(THREE, mat));
  group.add(mess(THREE, mat));
  const east = EAST_HANGARS.map((h) => eastHangar(THREE, mat, h));
  for (const h of east) group.add(h);
  group.add(fuelFarm(THREE, mat));
  return { group, hangars: [...hangars, ...east] };
}
