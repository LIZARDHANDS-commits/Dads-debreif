// 15 Wing Moose Jaw (CYMJ) base buildings: a simple 3D model for every building on the base that has no model of its own
// (the base only, not the city). Each is a flat-roofed box, or a low gable ("house") where the photo shows a pitched roof,
// standing on its real footprint with its roof colour taken from the photo. Most are the PMQ (base housing) roofs north and
// north-east of the flight line.
//
// Source: traced off Esri's true-scale photo, 5 Oct, about +/-15 ft (Patrick 5 Oct 02:39Z, "Light set now").
// HEIGHTS ARE ESTIMATES (no survey or manual gives them): 16 ft to the eaves for a house, 14 to 26 ft for a flat-roofed
// building by its size, a few set by eye. Roof colours are the middle colour of the roof in the photo, so a roof in
// shadow or under trees can read darker than it is.
//
// Left out because scenery3d.js already models them: the control tower, the arch hangars 1 to 4, the three small arch
// hangars, the Glass Palace, the Student Barracks, the rec centre, Hangars 5 and 6 and the two flight-line buildings by
// Hangar 4. The Canex, the hall beside it and Medical with Shipping and Receiving moved to flightline-buildings3d.js
// (TR-119), on these boxes' 5 Oct footprints (bldg-002 to 004, bldg-020 to 024). Not modelled: round tanks, vehicles and trailers, pools, playgrounds and the small sheds in back yards.
//
// World frame: X east, Y north, Z up, feet from the ARP (50.3303 N, 105.5592 W). Field floor 1,880 ft.
// Few draw calls (D411): the walls are one InstancedMesh, the flat roofs one, the gable roofs one, each with a colour per
// building. Every geometry and material is freed by disposeBaseBuildings.

import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';

/** The box the traced buildings sit in (ft from the ARP): the housing north, the flight line south, the farm fields outside it. */
export const BASE_BOX_FT = Object.freeze({ minX: -1000, maxX: 2700, minY: 1700, maxY: 5000 });

// `w` runs along the ridge of a house (its longer side); `rotation` turns the whole footprint anticlockwise (radians).
// `height` is the wall height to the eaves for a house, and the full height for a flat-roofed building.
const b = (id, x, y, w, d, rotation, height, roof, kind) => Object.freeze({ id, x, y, w, d, rotation, height, roof, kind });

/** Every traced base building: `{ id, x, y, w, d, rotation, height, roof, kind }`, with kind 'house' (gable) or 'flat'. */
export const BASE_BUILDINGS = Object.freeze([
  b('bldg-001', -654, 2844, 88, 121, 0, 22, '#cbbfa5', 'flat'),
  b('bldg-005', -693, 2678, 35, 40, 0, 16, '#a9b8b4', 'flat'),
  b('bldg-006', -190, 2571, 29, 29, 0, 14, '#aeb1a8', 'flat'),
  b('bldg-007', 2580, 2792, 23, 23, 0, 10, '#bbbab7', 'flat'),
  b('house-001', -393, 2968, 52, 40, -1.571, 22, '#756d68', 'house'),
  b('bldg-008', 129, 3054, 233, 79, 0.384, 24, '#918272', 'flat'),
  b('bldg-009', 196, 3123, 48, 46, 0.471, 26, '#8a786b', 'flat'),
  b('bldg-010', 17, 3054, 67, 79, -0.087, 24, '#8b7c6e', 'flat'),
  b('bldg-011', 69, 3113, 29, 27, 0, 14, '#79675b', 'flat'),
  b('bldg-012', -72, 2533, 35, 79, 0, 22, '#c2c9be', 'flat'),
  b('bldg-013', -109, 2530, 40, 52, 0, 20, '#c2c5b8', 'flat'),
  b('bldg-014', -138, 2544, 31, 104, 0, 16, '#a8a492', 'flat'),
  b('bldg-015', -35, 2512, 21, 23, 0, 12, '#8f9283', 'flat'),
  b('bldg-016', 79, 2562, 54, 96, 0, 26, '#b9ad96', 'flat'),
  b('bldg-017', 125, 2531, 67, 58, 0, 24, '#bab29d', 'flat'),
  b('bldg-018', -179, 2281, 33, 54, 0, 16, '#d6d8cf', 'flat'),
  b('bldg-019', -56, 2190, 38, 46, 0, 18, '#4976a8', 'flat'),
  b('bldg-025', 533, 3033, 42, 67, 0, 18, '#b8bfba', 'flat'),
  b('bldg-026', 825, 3004, 62, 42, 0, 16, '#605f60', 'flat'),
  b('bldg-027', 829, 2952, 50, 56, 0, 18, '#bebfb0', 'flat'),
  b('bldg-028', 617, 3402, 62, 54, -0.698, 20, '#b7baad', 'flat'),
  b('bldg-029', 619, 2872, 108, 44, 0, 22, '#b4ab96', 'flat'),
  b('bldg-030', 615, 2826, 85, 50, 0, 20, '#b2a993', 'flat'),
  b('bldg-031', 348, 3442, 102, 48, 0.436, 20, '#6099c2', 'flat'),
  b('bldg-032', 350, 3496, 50, 56, 0.436, 20, '#508dba', 'flat'),
  b('bldg-033', 596, 3462, 52, 50, -0.436, 20, '#3c7db3', 'flat'),
  b('bldg-034', 2253, 2913, 123, 60, 0, 28, '#e7e8db', 'flat'),
  b('bldg-035', 2040, 2916, 31, 29, -0.698, 16, '#a7b8b8', 'flat'),
  b('bldg-036', 2128, 2910, 58, 21, -0.733, 14, '#bbb4ad', 'flat'),
  b('bldg-037', 2167, 2871, 42, 19, -0.733, 14, '#d5d2c3', 'flat'),
  b('bldg-038', 2296, 2846, 17, 21, 0, 10, '#f8faea', 'flat'),
  b('bldg-039', 1923, 2721, 62, 42, -0.733, 16, '#b0b6ae', 'flat'),
  b('bldg-040', 1960, 2675, 71, 25, -0.733, 16, '#b6b7a9', 'flat'),
  b('bldg-041', 1621, 2875, 29, 27, 0, 12, '#b3b19d', 'flat'),
  b('bldg-042', 1821, 2679, 35, 33, -0.733, 14, '#a5aead', 'flat'),
  b('bldg-043', -655, 2672, 35, 23, 0, 9, '#bfbdab', 'flat'),
  b('bldg-044', -615, 2666, 38, 27, 0, 9, '#698195', 'flat'),
  b('bldg-045', -591, 2663, 15, 23, 0, 9, '#9c887d', 'flat'),
  b('bldg-046', -553, 2658, 48, 27, 0, 9, '#ececdd', 'flat'),
  b('bldg-047', -642, 2370, 23, 48, 0, 9, '#d1a88c', 'flat'),
  b('house-002', 1653, 3266, 48, 35, -1.571, 16, '#897066', 'house'),
  b('house-003', 1649, 3194, 50, 31, -1.571, 16, '#886d65', 'house'),
  b('house-004', 1771, 3320, 46, 33, 0, 16, '#887367', 'house'),
  b('house-005', 1841, 3317, 48, 33, 0, 16, '#93857a', 'house'),
  b('house-006', 1909, 3322, 48, 33, 0, 16, '#826963', 'house'),
  b('house-007', 1977, 3325, 46, 33, 0, 16, '#8a7068', 'house'),
  b('house-008', 2049, 3318, 52, 35, 0, 16, '#887b74', 'house'),
  b('house-009', 1772, 3208, 48, 29, 0, 16, '#93796e', 'house'),
  b('house-010', 1840, 3201, 46, 35, 0, 16, '#896e62', 'house'),
  b('house-011', 1977, 3211, 46, 28, 0, 16, '#8d8176', 'house'),
  b('house-012', 2049, 3198, 50, 31, 0, 16, '#93796c', 'house'),
  b('house-013', 2122, 3198, 46, 33, 0, 16, '#8b7266', 'house'),
  b('house-014', 1638, 3891, 52, 31, -1.571, 16, '#886c66', 'house'),
  b('house-015', 1760, 3891, 48, 29, -1.571, 16, '#866b68', 'house'),
  b('house-016', 1721, 4154, 30, 25, -0.96, 16, '#615d60', 'house'),
  b('house-017', 1710, 4109, 83, 32, -1.03, 16, '#646065', 'house'),
  b('house-018', 1765, 4096, 42, 28, -0.873, 16, '#615e63', 'house'),
  b('house-019', 1747, 4040, 63, 32, -1.047, 16, '#646164', 'house'),
  b('house-020', 1796, 4025, 30, 25, -0.873, 16, '#5c5a5b', 'house'),
  b('house-021', 1609, 4219, 38, 30, -0.611, 16, '#86807f', 'house'),
  b('house-022', 1628, 4170, 62, 35, -0.454, 16, '#847d7d', 'house'),
  b('house-023', 1676, 4187, 28, 20, -0.524, 16, '#8d8480', 'house'),
  b('house-024', 2221, 3719, 80, 40, -0.489, 16, '#826362', 'house'),
  b('house-025', 2269, 3581, 87, 34, -1.571, 16, '#877875', 'house'),
  b('house-026', 2278, 3458, 91, 35, -1.571, 16, '#887974', 'house'),
  b('house-027', 942, 4112, 77, 35, 1.012, 16, '#8b6f67', 'house'),
  b('house-028', 962, 4000, 110, 42, -0.977, 16, '#80766f', 'house'),
  b('house-029', 927, 3833, 125, 44, -0.908, 16, '#8a7e72', 'house'),
  b('house-030', 1113, 4034, 42, 35, 0, 16, '#545885', 'house'),
  b('house-031', 1388, 4002, 79, 42, -0.559, 16, '#88726e', 'house'),
  b('bldg-048', 1351, 4221, 35, 17, 0.262, 14, '#b2a7a3', 'flat'),
  b('house-032', 1373, 4431, 154, 48, 1.431, 16, '#adada4', 'house'),
  b('house-033', 1560, 4244, 54, 33, -0.436, 16, '#857d72', 'house'),
  b('house-034', 1556, 4194, 62, 42, -0.436, 16, '#86827d', 'house'),
  b('house-035', 1337, 4847, 138, 46, 0.977, 16, '#827169', 'house'),
  b('house-036', 1349, 4668, 151, 46, -1.134, 16, '#86756e', 'house'),
  b('house-037', 1367, 3329, 62, 38, -0.436, 16, '#8d8477', 'house'),
  b('house-038', 1454, 3388, 56, 38, 0.873, 16, '#9a9285', 'house'),
  b('house-039', 1519, 3413, 33, 27, 0, 16, '#adb0a5', 'house'),
  b('house-040', 1440, 3323, 40, 27, 0.785, 16, '#b3b6ac', 'house'),
  b('house-041', 1192, 3847, 33, 23, 0.908, 16, '#b5b5b0', 'house'),
  b('house-042', 1191, 3805, 62, 35, -0.663, 16, '#b0b2a9', 'house'),
  b('house-043', 1247, 3812, 35, 23, 0.908, 16, '#b3b1aa', 'house'),
  b('house-044', 1267, 3879, 38, 29, -0.698, 16, '#81746a', 'house'),
  b('house-045', 1332, 3866, 42, 29, -0.611, 16, '#887e75', 'house'),
  b('house-046', 1255, 3758, 62, 35, -0.663, 16, '#79726d', 'house'),
  b('house-047', 1313, 3769, 38, 25, 0.908, 16, '#afb1a9', 'house'),
  b('house-048', 1330, 3724, 62, 33, -0.489, 16, '#aeb4a8', 'house'),
  b('house-049', 1383, 3735, 38, 25, 0.908, 16, '#b5b6ac', 'house'),
  b('house-050', 1388, 3681, 42, 27, -0.524, 16, '#bab6af', 'house'),
  b('house-051', 1129, 3659, 46, 29, 0.908, 16, '#b1b3a7', 'house'),
  b('house-052', 1172, 3672, 40, 27, 0.908, 16, '#7c7366', 'house'),
  b('house-053', 1218, 3640, 46, 29, 0.908, 16, '#857d6c', 'house'),
  b('house-054', 1282, 3604, 67, 35, -0.611, 16, '#afb3ac', 'house'),
  b('house-055', 1227, 3590, 40, 29, 0.908, 16, '#a8aca1', 'house'),
  b('house-056', 1301, 3556, 31, 23, 0.908, 16, '#b5b4af', 'house'),
  b('house-057', 1143, 3552, 44, 29, 0.908, 16, '#b7b8af', 'house'),
  b('house-058', 1158, 3496, 58, 33, -0.663, 16, '#a7aaa3', 'house'),
  b('house-059', 1206, 3504, 42, 27, 0.908, 16, '#acaca3', 'house'),
  b('house-060', 1224, 3455, 62, 33, -0.663, 16, '#82786d', 'house'),
  b('house-061', 1271, 3467, 33, 21, 0.908, 16, '#adaea0', 'house'),
  b('house-062', 1435, 3642, 48, 31, 0.908, 16, '#8b8578', 'house'),
  b('house-063', 1488, 3640, 46, 29, 0.908, 16, '#b7baad', 'house'),
  b('house-064', 1477, 3575, 54, 42, 0.908, 16, '#8a8274', 'house'),
  b('house-065', 1530, 3533, 33, 23, 0, 16, '#b5b7ad', 'house'),
  b('house-066', 1494, 3479, 58, 42, -1.571, 16, '#908477', 'house'),
  b('house-067', 965, 3717, 121, 21, 0.803, 10, '#bec0b2', 'house'),
  b('house-068', 806, 3596, 62, 52, -0.576, 16, '#8a716b', 'house'),
  b('house-069', 1003, 3646, 35, 25, 0.908, 16, '#b4b4a9', 'house'),
  b('house-070', 1008, 3596, 62, 33, -0.559, 16, '#b3b3ad', 'house'),
  b('house-071', 1065, 3597, 35, 25, 0.908, 16, '#b3b2a7', 'house'),
  b('house-072', 1053, 3553, 42, 29, 0.908, 16, '#b2b8ac', 'house'),
  b('house-073', 1091, 3523, 46, 31, 0.908, 16, '#a9afa3', 'house'),
  b('house-074', 1070, 3709, 38, 23, 0.908, 16, '#a6ab9f', 'house'),
  b('house-075', 1112, 3723, 62, 38, -0.611, 16, '#85796f', 'house'),
  b('house-076', 919, 3515, 54, 46, -0.663, 16, '#83796c', 'house'),
  b('house-077', 983, 3467, 40, 29, 0.908, 16, '#847a6d', 'house'),
  b('house-078', 929, 3456, 31, 19, 0.908, 16, '#acafa4', 'house'),
  b('house-079', 1028, 3435, 46, 31, 0.908, 16, '#7e746a', 'house'),
  b('house-080', 983, 3417, 44, 29, 0.908, 16, '#adb3a9', 'house'),
  b('house-081', 1085, 3390, 73, 33, -0.663, 16, '#b3b6af', 'house'),
  b('house-082', 1037, 3380, 31, 19, 0.908, 16, '#adb1a7', 'house'),
  b('house-083', 1162, 3356, 58, 38, -0.663, 16, '#8f9289', 'house'),
  b('house-084', 1109, 3338, 35, 23, 0.908, 16, '#b3baab', 'house'),
  b('house-085', 1226, 3320, 42, 29, 0.908, 16, '#a9b1a5', 'house'),
  b('house-086', 1181, 3306, 33, 23, 0.908, 16, '#a9aba2', 'house'),
  b('house-087', 1288, 3312, 38, 23, 0.908, 16, '#6d645e', 'house'),
  b('house-088', 1253, 3277, 42, 27, 0.908, 16, '#b3b6ad', 'house'),
  b('house-089', 1338, 3279, 29, 21, 0.908, 16, '#899184', 'house'),
  b('house-090', 1648, 3825, 46, 38, -1.571, 16, '#836660', 'house'),
  b('house-091', 1648, 3756, 42, 38, -1.571, 16, '#896c66', 'house'),
  b('house-092', 1646, 3680, 52, 36, -1.571, 16, '#876b64', 'house'),
  b('house-093', 1646, 3615, 42, 36, -1.571, 16, '#866a63', 'house'),
  b('house-094', 1646, 3550, 36, 33, 0, 16, '#78635d', 'house'),
  b('house-095', 1646, 3475, 46, 36, -1.571, 16, '#836a61', 'house'),
  b('house-096', 1646, 3403, 48, 36, -1.571, 16, '#826960', 'house'),
  b('house-097', 1646, 3337, 40, 36, -1.571, 16, '#7e695e', 'house'),
  b('house-098', 1762, 3822, 44, 35, -1.571, 16, '#8a6b66', 'house'),
  b('house-099', 1765, 3585, 50, 33, -1.571, 16, '#8e716a', 'house'),
  b('house-100', 1765, 3517, 50, 33, -1.571, 16, '#896c67', 'house'),
  b('house-101', 1769, 3719, 46, 31, 0, 16, '#827870', 'house'),
  b('house-102', 1838, 3720, 46, 37, 0, 16, '#8e8178', 'house'),
  b('house-103', 1907, 3718, 44, 31, 0, 16, '#867573', 'house'),
  b('house-104', 1977, 3715, 46, 33, 0, 16, '#7d5e5e', 'house'),
  b('house-105', 2048, 3722, 46, 35, 0, 16, '#8d7d75', 'house'),
  b('house-106', 2120, 3720, 44, 31, 0, 16, '#81625e', 'house'),
  b('house-107', 1851, 3599, 48, 32, 0, 16, '#867b71', 'house'),
  b('house-108', 1924, 3596, 48, 31, 0, 16, '#856b65', 'house'),
  b('house-109', 1993, 3603, 48, 36, 0, 16, '#826761', 'house'),
  b('house-110', 2062, 3605, 50, 31, 0, 16, '#8c7068', 'house'),
  b('house-111', 2132, 3604, 44, 31, 0, 16, '#81766f', 'house'),
  b('house-112', 2145, 3473, 42, 31, -1.571, 16, '#886b63', 'house'),
  b('house-113', 2143, 3402, 46, 33, -1.571, 16, '#826660', 'house'),
  b('house-114', 2134, 3335, 40, 33, -1.571, 16, '#81655e', 'house'),
]);

const WALL_COLOR = Object.freeze({ house: '#cfc8ba', flat: '#d3d6da' }); // pale siding / cladding, a guess
const SLAB_FT = 1.5; // thickness of a flat roof, standing on the walls
const OVERHANG_FT = 1; // eaves and roof edges stand out a foot
const RISE_RATIO = 0.22; // gable rise over the span, a low pitch (estimate)
const RISE_MAX_FT = 10;

/** A unit box (1 x 1 x 1) standing on z = 0. */
function unitBox(THREE) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0, 0.5);
  return geo;
}

/** A unit gable prism: ridge along X at the top (z = 1), eaves on z = 0 at y = -0.5 and +0.5. */
function unitGable(THREE) {
  const v = [
    // the two slopes
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0, 1], [-0.5, -0.5, 0], [0.5, 0, 1], [-0.5, 0, 1],
    [0.5, 0.5, 0], [-0.5, 0.5, 0], [-0.5, 0, 1], [0.5, 0.5, 0], [-0.5, 0, 1], [0.5, 0, 1],
    // the two gable ends
    [0.5, -0.5, 0], [0.5, 0.5, 0], [0.5, 0, 1],
    [-0.5, 0.5, 0], [-0.5, -0.5, 0], [-0.5, 0, 1],
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v.flat()), 3));
  geo.computeVertexNormals();
  return geo;
}

/** One InstancedMesh from `items`, each placed by `place(item)` = [x, y, z, rotation, sx, sy, sz] and coloured by `colorOf`. */
function instanced(THREE, geo, items, place, colorOf, name) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0.02 });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axisZ = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    const [x, y, z, rot, sx, sy, sz] = place(it);
    q.setFromAxisAngle(axisZ, rot);
    m.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(colorOf(it)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Gable rise for a house of span `d` (ft). */
const riseFt = (d) => Math.min(RISE_MAX_FT, d * RISE_RATIO);

/**
 * Builds every traced base building: three draw calls (walls, flat roofs, gable roofs).
 * @param {any} THREE
 * @param {{ floor?: number }} [options]
 */
export function createBaseBuildings(THREE, { floor = THRESHOLD_DATA_ELEV_FT } = {}) {
  const root = new THREE.Group();
  root.name = 'base-buildings';
  root.position.set(0, 0, floor);
  const flats = BASE_BUILDINGS.filter((e) => e.kind !== 'house');
  const houses = BASE_BUILDINGS.filter((e) => e.kind === 'house');
  const wallColor = (e) => WALL_COLOR[e.kind] ?? WALL_COLOR.flat;

  // Walls: a flat-roofed building's walls stop under its roof slab; a house's walls stop at the eaves.
  const wallTop = (e) => (e.kind === 'house' ? e.height : e.height - SLAB_FT);
  root.add(instanced(THREE, unitBox(THREE), BASE_BUILDINGS, (e) => [e.x, e.y, 0, e.rotation, e.w, e.d, wallTop(e)], wallColor, 'base-buildings-walls'));
  root.add(instanced(
    THREE, unitBox(THREE), flats,
    (e) => [e.x, e.y, e.height - SLAB_FT, e.rotation, e.w + 2 * OVERHANG_FT, e.d + 2 * OVERHANG_FT, SLAB_FT],
    (e) => e.roof, 'base-buildings-flat-roofs',
  ));
  root.add(instanced(
    THREE, unitGable(THREE), houses,
    (e) => [e.x, e.y, e.height, e.rotation, e.w + 2 * OVERHANG_FT, e.d + 2 * OVERHANG_FT, riseFt(e.d)],
    (e) => e.roof, 'base-buildings-gable-roofs',
  ));
  root.userData = { count: BASE_BUILDINGS.length, houses: houses.length, flats: flats.length };
  return root;
}

/** Frees every geometry and material under the base buildings group (D411) and detaches it. */
export function disposeBaseBuildings(group) {
  if (!group) return;
  const geos = new Set();
  const mats = new Set();
  group.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) mats.add(m);
    if (o.isInstancedMesh) o.dispose?.();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  group.clear();
  group.removeFromParent?.();
}
