// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test fails repeatedly (2x test fail): DO NOT tweak flight physics to
// force it to pass. STOP, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import { CYMJ_LANDMARKS, createLandmarks, disposeLandmarks, createWindsocks, updateWindsocks, disposeWindsocks, HWY2_POINTS } from '../../../src/modules/traffic/landmarks3d.js';

const THREE = await loadThree();
const NM = 6076;

test('every landmark has a source and sits south/east of the field within 6 NM', () => {
  assert.equal(CYMJ_LANDMARKS.length, 4);
  for (const l of CYMJ_LANDMARKS) {
    assert.ok(l.source.includes('EFIG'), `${l.id} cites the EFIG`);
    assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y));
    assert.ok(Math.hypot(l.x, l.y) < 6 * NM, `${l.id} within 6 NM`);
    assert.ok(l.y < 0 && l.x > 0, `${l.id} is south-east of the ARP`);
  }
});

test('Window Farm lies on the 29L extended centreline within 0.15 NM', () => {
  const w = CYMJ_LANDMARKS.find((l) => l.id === 'window-farm');
  const thr = { x: 3104, y: -3194 };
  const u = { x: Math.sin((118 * Math.PI) / 180), y: Math.cos((118 * Math.PI) / 180) };
  const dx = w.x - thr.x; const dy = w.y - thr.y;
  const cross = Math.abs(dx * u.y - dy * u.x);
  assert.ok(cross < 0.15 * NM, `cross-track ${Math.round(cross)} ft`);
});

test('the landmarks build at the floor, trees and cars are one draw call each', () => {
  const root = createLandmarks(THREE, { floor: 1880 });
  const lm = root.children.filter((g) => g.userData?.landmark);
  assert.equal(lm.length, 4);
  for (const g of lm) assert.equal(g.position.z, 1880);
  assert.ok(root.getObjectByName('hwy2').position.z > 1880, 'Hwy 2 sits just above the floor');
  assert.ok(root.getObjectByName('arrow-trees-rows').isInstancedMesh);
  assert.ok(root.getObjectByName('fiat-farm-cars').isInstancedMesh);
  disposeLandmarks(root);
});

test('disposeLandmarks frees every geometry and material once and empties the group (D411)', (t) => {
  const seenG = new Map(); const seenM = new Map();
  const g0 = THREE.BufferGeometry.prototype.dispose; const m0 = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { seenG.set(this, (seenG.get(this) ?? 0) + 1); return g0.call(this); };
  THREE.Material.prototype.dispose = function () { seenM.set(this, (seenM.get(this) ?? 0) + 1); return m0.call(this); };
  t.after(() => { THREE.BufferGeometry.prototype.dispose = g0; THREE.Material.prototype.dispose = m0; });
  const root = createLandmarks(THREE);
  const geos = new Set(); const mats = new Set();
  root.traverse((o) => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material ?? [])) mats.add(m); });
  disposeLandmarks(root);
  for (const g of geos) assert.ok(seenG.get(g) >= 1, 'geometry freed');
  for (const m of mats) assert.equal(seenM.get(m), 1, 'material freed once');
  assert.equal(root.children.length, 0);
  assert.doesNotThrow(() => disposeLandmarks(root));
});

// ---- Windsocks + Hwy 2 ----
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

test('windsock points downwind (from + 180) within 5 deg', () => {
  const g = createWindsocks(THREE);
  for (const from of [0, 90, 290, 359]) {
    updateWindsocks(g, from, 10);
    assert.ok(angDiff(g.userData.headingDeg, from + 180) <= 5);
    const yaw = g.children[0].userData.yaw.rotation.z;
    const compass = 90 - (yaw * 180) / Math.PI; // back to compass from the X-east frame
    assert.ok(angDiff(compass, from + 180) <= 5, `yaw for ${from}`);
  }
  disposeWindsocks(g);
});

test('windsock hangs at 0 kt and is full at 15 kt and above', () => {
  const g = createWindsocks(THREE);
  updateWindsocks(g, 270, 0); assert.equal(g.userData.extension, 0);
  assert.ok(g.children[0].userData.tilt.rotation.y > 1.3, 'hanging');
  updateWindsocks(g, 270, 15); assert.equal(g.userData.extension, 1);
  assert.ok(Math.abs(g.children[0].userData.tilt.rotation.y) < 1e-9, 'horizontal');
  updateWindsocks(g, 270, 30); assert.equal(g.userData.extension, 1);
  disposeWindsocks(g);
});

test('missing or NaN wind is calm and never NaN', () => {
  const g = createWindsocks(THREE);
  for (const [f, k] of [[NaN, NaN], [undefined, undefined], [270, NaN], [NaN, 10]]) {
    updateWindsocks(g, f, k);
    for (const s of g.children) {
      assert.ok(Number.isFinite(s.userData.yaw.rotation.z));
      assert.ok(Number.isFinite(s.userData.tilt.rotation.y));
    }
  }
  updateWindsocks(g, NaN, NaN); assert.equal(g.userData.extension, 0);
  disposeWindsocks(g);
});

test('Hwy 2 passes within 800 ft of Window Farm and Sukanen Ship references', () => {
  const distToLine = (px, py) => {
    let best = Infinity;
    for (let i = 1; i < HWY2_POINTS.length; i++) {
      const [ax, ay] = HWY2_POINTS[i - 1]; const [bx, by] = HWY2_POINTS[i];
      const dx = bx - ax; const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  };
  assert.ok(distToLine(6100, -4324) < 800);
  assert.ok(distToLine(4677, -17956) < 800);
  assert.ok(HWY2_POINTS[0][1] >= 8000 && HWY2_POINTS.at(-1)[1] <= -30000);
});

test('disposeWindsocks frees every geometry and material (D411)', (t) => {
  const seenG = new Map(); const seenM = new Map();
  const g0 = THREE.BufferGeometry.prototype.dispose; const m0 = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { seenG.set(this, (seenG.get(this) ?? 0) + 1); return g0.call(this); };
  THREE.Material.prototype.dispose = function () { seenM.set(this, (seenM.get(this) ?? 0) + 1); return m0.call(this); };
  t.after(() => { THREE.BufferGeometry.prototype.dispose = g0; THREE.Material.prototype.dispose = m0; });
  const g = createWindsocks(THREE);
  const geos = new Set(); const mats = new Set(); let meshes = 0;
  g.traverse((o) => { if (o.isMesh) meshes++; if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material ?? [])) mats.add(m); });
  assert.equal(meshes, 10, 'two socks, five meshes each');
  assert.equal(geos.size, 5); assert.equal(mats.size, 3);
  disposeWindsocks(g);
  for (const x of geos) assert.equal(seenG.get(x), 1);
  for (const x of mats) assert.equal(seenM.get(x), 1);
  assert.equal(g.children.length, 0);
});
