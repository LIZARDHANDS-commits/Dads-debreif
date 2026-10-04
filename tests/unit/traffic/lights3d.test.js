// Checks: the 3D scene has one south-west sun about 45 degrees up, one hemisphere light, no shadows, and
//   disposing frees them.
// Serves: TR-R23.
// Expected values: design choice (look and feel): azimuth 225 and elevation 45 degrees, plus or minus 10,
//   typed in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree } from '../../../src/ui-kit/three-aircraft.js';
import { addTrafficLights } from '../../../src/modules/traffic/view3d.js';

const THREE = await loadThree();

test('Traffic scene: one south-west sun ~45° up, one hemisphere light, no shadows, freed on dispose', () => {
  const scene = new THREE.Scene();
  const lights = addTrafficLights(THREE, scene);
  const dirs = scene.children.filter((o) => o.isDirectionalLight);
  const hemis = scene.children.filter((o) => o.isHemisphereLight);
  assert.equal(dirs.length, 1);
  assert.equal(hemis.length, 1);
  const sun = dirs[0];
  assert.equal(sun.castShadow, false);
  const d = sun.position.clone().sub(sun.target.position).normalize(); // towards the sun; X east, Y north, Z up
  const az = (Math.atan2(d.x, d.y) * 180 / Math.PI + 360) % 360;
  const el = Math.asin(d.z) * 180 / Math.PI;
  assert.ok(Math.abs(az - 225) <= 10, `azimuth ${az}`);
  assert.ok(Math.abs(el - 45) <= 10, `elevation ${el}`);
  lights.dispose();
  assert.equal(scene.children.filter((o) => o.isLight).length, 0);
});
