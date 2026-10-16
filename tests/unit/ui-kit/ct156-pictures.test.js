// Checks: the CT-156's shaded paint appears only once every baked picture it needs has loaded, and a picture that fails
//   to load leaves the plain paint and says which (an empty picture reads as 0, which bends the relief into the skin and
//   darkens the paint).
// Serves: plan Step 3b (3d-work slice 4.2 brief: "switch a mesh's material to the shaded one only when every picture it
//   needs has loaded; if one fails, keep the plain material and log the failure").
// Expected values: the brief's rule itself; no numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shadeWhenLoaded } from '../../../src/ui-kit/ct156-blender.js';

const later = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

test('the shaded paint waits for every picture, and a failed picture keeps the plain paint', async () => {
  const mesh = { material: 'plain' };
  const ao = later(), normal = later(), mask = later();
  const done = shadeWhenLoaded({ ao: ao.promise, normal: normal.promise, mask: mask.promise }, (p) => { mesh.material = `shaded ${Object.keys(p).join(' ')}`; });
  ao.resolve('ao'); normal.resolve('normal');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mesh.material, 'plain', 'shaded with a picture still loading');
  mask.resolve('mask');
  assert.equal(await done, true);
  assert.equal(mesh.material, 'shaded ao normal mask');

  const other = { material: 'plain' };
  const told = [];
  const ok = await shadeWhenLoaded({ ao: Promise.resolve('ao'), weather: Promise.reject(new Error('404')) }, () => { other.material = 'shaded'; }, (why) => told.push(why));
  assert.equal(ok, false);
  assert.equal(other.material, 'plain', 'shaded although a picture failed');
  assert.match(told.join(), /weather/);
});
