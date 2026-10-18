// Checks: the new look changes the CT-156 model and nothing else. When a CT-156 is first drawn, its glossy materials take the
//   shared sky as their reflection picture and its materials get the Neutral curve, while the renderer's tone mapping and
//   exposure and the scene's environment stay exactly as the module set them (Patrick, 13 Oct 2026: "i just want to focus on
//   the model"; a module's ground, runways and lights must look as they did). And a part shaded later with its baked pictures
//   gets the curve too, once, as does a copy of it (W27, 17 Oct 2026).
// Serves: the shared 3D look (ct156-look.js).
// Expected values: Patrick's ruling above (only the model changes); no number from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals on canvases, which the test doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
const { createCt156Model, CT156_LENGTH_FT } = await import('../../../src/ui-kit/ct156-model.js');

test('first draw: the CT-156 gets the shared sky and the Neutral curve; the renderer and the scene are left alone', () => {
  // three.js with its sky-filtering tool replaced by a stub, so no graphics card is needed (the caller passes THREE in).
  const sky = new THREE.Texture();
  const T = { ...THREE, PMREMGenerator: class { fromScene() { return { texture: sky, dispose() {} }; } dispose() {} } };
  const ship = createCt156Model(T, { color: '#c03030', number: 1, lengthFt: CT156_LENGTH_FT });
  const scene = new THREE.Scene();
  scene.add(ship);

  const set = [];
  const renderer = new Proxy({ dispose() {} }, { set: (t, k, v) => { set.push(k); t[k] = v; return true; } });
  const probe = ship.getObjectByName('ct156-look-probe');
  assert.ok(probe, 'the model carries the look probe');
  probe.onBeforeRender(renderer, scene);

  assert.deepEqual(set.filter((k) => /tone|environment|exposure/i.test(String(k))), [], "the renderer's tone mapping and exposure are not touched");
  assert.equal(scene.environment, null, "the scene's environment is not touched");
  const glossy = [];
  ship.traverse((o) => { if (o.isMesh && o !== probe && o.material?.envMap) glossy.push(o.material); });
  assert.ok(glossy.length > 0, 'the model has glossy parts');
  assert.ok(glossy.every((m) => m.envMap === sky), 'every glossy part reflects the shared sky');
});

test('a part shaded with its baked pictures after the first draw still gets the Neutral curve, exactly once, and so does a copy of it', async () => {
  // W27 (17 Oct 2026): the delivered parts are shaded only once their pictures load, from materials already dressed, and
  // drew with no curve. A later copy (the Debrief's ghost) must not get it twice: its shader would not compile.
  const { aoShaded, ct156CloneMaterial } = await import('../../../src/ui-kit/ct156-blender.js');
  const T = { ...THREE, PMREMGenerator: class { fromScene() { return { texture: new THREE.Texture(), dispose() {} }; } dispose() {} } };
  const ship = createCt156Model(T, { color: '#c03030', number: 1, lengthFt: CT156_LENGTH_FT });
  const scene = new THREE.Scene();
  scene.add(ship);
  const probe = ship.getObjectByName('ct156-look-probe');
  const renderer = { dispose() {} };
  probe.onBeforeRender(renderer, scene); // the first draw dresses the plain materials
  let mesh = null;
  ship.traverse((o) => { if (!mesh && o.isMesh && o !== probe && o.material?.isMeshStandardMaterial) mesh = o; });
  const curves = (m) => {
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <aomap_fragment>\n#include <tonemapping_fragment>' };
    m.onBeforeCompile(shader, renderer);
    return shader.fragmentShader.split('vec3 ct156Neutral(').length - 1;
  };

  mesh.material = aoShaded(mesh.material, new THREE.Texture()); // the pictures load
  probe.onBeforeRender(renderer, scene);
  assert.equal(curves(mesh.material), 1, 'the shaded part draws with the Neutral curve once');

  mesh.material = ct156CloneMaterial(mesh.material); // a later copy, as the Debrief's ghost
  probe.onBeforeRender(renderer, scene);
  assert.equal(curves(mesh.material), 1, 'its copy keeps the curve and is not curved twice');
});
