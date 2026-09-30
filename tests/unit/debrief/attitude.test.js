// The 3D model's attitude is pinned to the reference geometry (auditor #169):
// scene.js attitudeEuler, applied by three.js as the model's rotation, must put
// the body points where t6Points puts them. three is imported here only, from
// node_modules; it runs in Node without WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attitudeEuler, t6Points } from '../../../src/modules/debrief/view3d/scene.js';

const rad = (d) => (d * Math.PI) / 180;
// Body points as fractions of the size: forward, left, up (T6_SHAPE in scene.js).
const BODY = { wingL: [0.02, 0.66, 0], fin: [-0.46, 0, 0.25], spinner: [1.02, 0, 0] };

test('attitudeEuler: the model turns roll, then pitch, then heading, each with its sign', () => {
  const e = attitudeEuler({ bankDeg: 30, pitchDeg: 10, hdg: 2 });
  assert.equal(e.order, 'ZYX');
  assert.ok(Math.abs(e.x + rad(30)) < 1e-12);
  assert.ok(Math.abs(e.y + rad(10)) < 1e-12);
  assert.equal(e.z, 2);
});

test('the three.js rotation puts the body points where t6Points does, for every attitude', () => {
  let checked = 0;
  for (const bankDeg of [-70, -30, 0, 25, 60]) {
    for (const pitchDeg of [-20, 0, 15, 40]) {
      for (const hdg of [0, 1, 2.5, -2]) {
        const e = attitudeEuler({ bankDeg, pitchDeg, hdg });
        const obj = new THREE.Object3D();
        obj.rotation.order = e.order;
        obj.rotation.set(e.x, e.y, e.z);
        obj.updateMatrix();
        const ref = t6Points({ x: 0, y: 0, altFt: 0 }, hdg, rad(bankDeg), rad(pitchDeg), 1);
        for (const [name, [f, l, u]] of Object.entries(BODY)) {
          const got = new THREE.Vector3(f, l, u).applyMatrix4(obj.matrix);
          const want = ref[name];
          const where = `${name} at bank ${bankDeg}, pitch ${pitchDeg}, heading ${hdg}`;
          assert.ok(Math.abs(got.x - want.x) < 1e-9, `x of ${where}`);
          assert.ok(Math.abs(got.y - want.y) < 1e-9, `y of ${where}`);
          assert.ok(Math.abs(got.z - want.altFt) < 1e-9, `z of ${where}`);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 5 * 4 * 4 * 3);
});
