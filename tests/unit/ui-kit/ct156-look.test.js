// Checks: the hemisphere light's sky colour comes from straight up in the world. The 3D views' world has Z up (X east, Y north;
//   ui-kit/three-aircraft.js) and their cameras use up = (0, 0, 1); three.js lights assume Y up, which once made the "sky"
//   light come from the north horizon. A world with Y up gets Y.
// Serves: the shared 3D look (ct156-look.js).
// Expected values: the world's own axes (Z up for the views, Y up for a Y-up scene), not anything from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { orientHemisphere } from '../../../src/ui-kit/ct156-look.js';

test('the hemisphere light shines its sky from the world up: Z for the views, Y for a Y-up scene', () => {
  const light = new THREE.HemisphereLight('#b8d0ff', '#12301a', 0.8); // as addLights makes it: sideways (Y) until turned
  orientHemisphere(light, 'z', 0.6);
  const up = light.position.clone().normalize();
  assert.ok(Math.abs(up.dot(new THREE.Vector3(0, 0, 1)) - 1) < 1e-9, 'sky comes from +Z in a Z-up world');
  orientHemisphere(light, 'y', 0.6);
  assert.ok(Math.abs(light.position.clone().normalize().dot(new THREE.Vector3(0, 1, 0)) - 1) < 1e-9, 'sky comes from +Y in a Y-up world');
});
