// Flight-line and base buildings with their real shapes and roofs (Patrick, 10 Oct, with street-view and oblique photos: "the hangars
// have square roofs", "Fix the shapes and rooves of all the buildings I've included pictures of"; TR-119): Hangars 1 to 3 as flat-roofed
// hangars with their annexes, the Canex store and the big hall beside it, and 15 Wing Medical with Shipping and Receiving.
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
  const roof = boxAt(THREE, mat(b.roof), b, 0, 0, b.w - 4, b.d - 4, 0.6, b.h); // on top, inside a 2 ft white rim
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
  return { group, hangars };
}
