// Exports Traffic's still scenery (the airfield buildings, every base building and every landmark) as an OBJ file in feet from the
// ARP, z up, for Blender to bake their shadows onto the ground (tools/blender/bake-shadows.py; TR-133, TR-135). It builds the scenery
// with the same code the 3D view draws it with, so the shadows always match. It also writes the patches to bake (patches.json beside
// the OBJ): the flight line and base, and a patch round each thing outside it (each landmark, the radar), with room for its shadow.
// Usage: node tools/blender/export-buildings.mjs out.obj
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAirfieldScenery } from '../../src/modules/traffic/scenery3d.js';
import { createBaseBuildings } from '../../src/modules/traffic/base-buildings3d.js';
import { createLandmarks } from '../../src/modules/traffic/landmarks3d.js';

const out = process.argv[2];
if (!out) throw new Error('usage: node tools/blender/export-buildings.mjs out.obj');
const scenery = createAirfieldScenery(THREE, { floor: 0 });
const landmarks = createLandmarks(THREE, { floor: 0 });
const root = new THREE.Group();
root.add(scenery, createBaseBuildings(THREE, { floor: 0 }), landmarks);
root.updateMatrixWorld(true);

/** The flight line and the base (the first bake's area). */
const BASE = { name: 'base', x0: -1200, x1: 2900, y0: 1300, y1: 5100 };
/** Room round a feature for its shadow: 1.8 times the tallest thing (the 30 degree sun's 1.73), at least 60 ft (an estimate). */
const room = (h) => Math.max(60, h * 1.8);

const lines = ['# Traffic scenery, feet from the ARP, z up (generated)'];
let base = 1;
const v = new THREE.Vector3();
const m = new THREE.Matrix4();
function addGeometry(geo, matrix) {
  const pos = geo.attributes.position;
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    lines.push(`v ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`);
  }
  const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
  for (let i = 0; i + 2 < idx.length; i += 3) lines.push(`f ${base + idx[i]} ${base + idx[i + 1]} ${base + idx[i + 2]}`);
  base += pos.count;
}
let meshes = 0;
root.traverse((o) => {
  if (!o.isMesh || !o.visible) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  if (mat?.transparent && (mat.opacity ?? 1) < 0.5) return; // see-through helpers cast no shadow
  if (o.isInstancedMesh) {
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      addGeometry(o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, m));
    }
  } else addGeometry(o.geometry, o.matrixWorld);
  meshes += 1;
});
writeFileSync(out, lines.join('\n') + '\n');

// Patches: the base, then each landmark and anything of the airfield's scenery standing outside the base area.
const patches = [BASE];
const inBase = (b) => b.min.x >= BASE.x0 && b.max.x <= BASE.x1 && b.min.y >= BASE.y0 && b.max.y <= BASE.y1;
const outside = [...landmarks.children, ...scenery.children.filter((g) => g.name === 'radar-dome')];
for (const g of outside) {
  const b = new THREE.Box3().setFromObject(g);
  if (b.isEmpty() || inBase(b)) continue;
  const r = room(b.max.z);
  patches.push({ name: g.name, x0: Math.floor(b.min.x - r), x1: Math.ceil(b.max.x + r), y0: Math.floor(b.min.y - r), y1: Math.ceil(b.max.y + r) });
}
writeFileSync(out.replace(/\.obj$/, '.patches.json'), JSON.stringify(patches, null, 1));
console.log(`${meshes} meshes, ${base - 1} vertices -> ${out}; ${patches.length} patches: ${patches.map((p) => p.name).join(', ')}`);
