// Checks: every traced base building has real numbers, a roof colour and sits inside the stated base box; the group
//   builds at the field floor with the walls, flat roofs and gable roofs each as one instanced mesh; dispose frees
//   every geometry and material and empties the group.
// Serves: ALL-R12 (the 3D view frees what it builds), TR-R23 (scenery).
// Expected values: the base box is read off Esri's true-scale photo (5 Oct): the housing runs north to about 4,850 ft
//   and the base buildings reach about 700 ft west of the ARP and 2,600 ft east; the box leaves room round them. Counts
//   come from the data itself, never a fixed number.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import { BASE_BUILDINGS, BASE_BOX_FT, createBaseBuildings, disposeBaseBuildings } from '../../../src/modules/traffic/base-buildings3d.js';

const THREE = await loadThree();

test('every base building has real numbers and a roof colour, and sits inside the base box', () => {
  assert.ok(BASE_BUILDINGS.length > 0, 'there are buildings');
  const ids = new Set();
  for (const e of BASE_BUILDINGS) {
    for (const k of ['x', 'y', 'w', 'd', 'rotation', 'height']) assert.ok(Number.isFinite(e[k]), `${e.id} ${k} is a number`);
    assert.ok(e.w > 0 && e.d > 0 && e.height > 0, `${e.id} has a size`);
    assert.match(e.roof, /^#[0-9a-f]{6}$/i, `${e.id} roof colour`);
    assert.ok(e.kind === 'house' || e.kind === 'flat', `${e.id} kind`);
    assert.ok(e.x >= BASE_BOX_FT.minX && e.x <= BASE_BOX_FT.maxX, `${e.id} east-west inside the box`);
    assert.ok(e.y >= BASE_BOX_FT.minY && e.y <= BASE_BOX_FT.maxY, `${e.id} north-south inside the box`);
    assert.ok(!ids.has(e.id), `${e.id} is unique`);
    ids.add(e.id);
  }
});

test('the base buildings build at the floor, walls and roofs as instanced meshes', () => {
  const root = createBaseBuildings(THREE, { floor: 1880 });
  assert.equal(root.position.z, 1880);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.length <= 3, 'a few draw calls');
  for (const m of meshes) assert.ok(m.isInstancedMesh, `${m.name} is instanced`);
  assert.equal(root.getObjectByName('base-buildings-walls').count, BASE_BUILDINGS.length, 'every building has walls');
  assert.ok(root.getObjectByName('base-buildings-walls').instanceColor, 'a colour for each building');
  disposeBaseBuildings(root);
});

test('disposeBaseBuildings frees every geometry and material once and empties the group (D411)', (t) => {
  const seenG = new Map(); const seenM = new Map();
  const g0 = THREE.BufferGeometry.prototype.dispose; const m0 = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { seenG.set(this, (seenG.get(this) ?? 0) + 1); return g0.call(this); };
  THREE.Material.prototype.dispose = function () { seenM.set(this, (seenM.get(this) ?? 0) + 1); return m0.call(this); };
  t.after(() => { THREE.BufferGeometry.prototype.dispose = g0; THREE.Material.prototype.dispose = m0; });
  const root = createBaseBuildings(THREE);
  const geos = new Set(); const mats = new Set();
  root.traverse((o) => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material ?? [])) mats.add(m); });
  assert.ok(geos.size > 0 && mats.size > 0);
  disposeBaseBuildings(root);
  for (const g of geos) assert.ok(seenG.get(g) >= 1, 'geometry freed');
  for (const m of mats) assert.equal(seenM.get(m), 1, 'material freed once');
  assert.equal(root.children.length, 0);
  assert.doesNotThrow(() => disposeBaseBuildings(root));
});
