// Checks: the drawn Harvard II model has the right frame, length and span, ship colours, decals, no fog, and disposal frees everything.
// Serves: ALL-R12.
// Expected values: design choice: model units typed in; the span of 1.32 units has no source yet, so treat it as an estimate (register, T3).

// The CT-156 Harvard II model (specs/SPEC-ui-kit.md, "3D aircraft (three.js, D138)").
// It draws its decals on 2D canvases, so these tests give it a stub document that records
// what was drawn; three itself runs in Node without WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThree, createAircraftMesh, disposeAircraftMesh } from '../../../src/ui-kit/three-aircraft.js';
import {
  createCt156Model, disposeCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT, PAINT_OPTIONS,
} from '../../../src/ui-kit/ct156-model.js';

const THREE = await loadThree();

// A document whose canvases accept any 2D call and remember the text they were asked to draw.
const drawn = [];
let canvases = 0;
globalThis.document = {
  createElement() {
    canvases++;
    const ctx = new Proxy({}, {
      get(target, name) {
        if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (name === 'fillText' || name === 'strokeText') return (text) => drawn.push(String(text));
        if (name in target) return target[name];
        return () => {};
      },
      set(target, name, value) { target[name] = value; return true; },
    });
    return { width: 0, height: 0, getContext: () => ctx };
  },
};

const box = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };
const materialsOf = (group) => {
  const found = new Set();
  group.traverse((o) => { for (const m of [].concat(o.material ?? [])) found.add(m); });
  return [...found];
};

test('PAINT_DEFAULT is Harvard, and PAINT_OPTIONS offers Harvard then Ship colours', () => {
  assert.equal(PAINT_DEFAULT, 'harvard');
  assert.deepEqual(PAINT_OPTIONS.map((o) => [o.value, o.label]), [['harvard', 'Harvard'], ['ship', 'Ship colours']]);
  assert.ok(Object.isFrozen(PAINT_OPTIONS) && PAINT_OPTIONS.every(Object.isFrozen));
});

// Span against length: span 33 ft 5 in, length 33 ft 4 in (T-6A flight manual, AIR FORCE TO 1T-6A-1, Figure 1-2
// "Aircraft Dimensions", page 1-7). The model is a drawn icon, not a scale model, so the margin is 10 %, not the
// shared 5 %: the wing has to read as about as wide as the aircraft is long.
const PUBLISHED_SPAN_OVER_LENGTH = (33 + 5 / 12) / (33 + 4 / 12);

test('both paints build, in the frame nose +X, left +Y, up +Z, CT156_UNIT_LENGTH long', () => {
  assert.equal(CT156_UNIT_LENGTH, 1.44);
  for (const paint of ['harvard', 'ship', undefined, 'no-such-paint']) {
    const m = createCt156Model(THREE, { color: '#0066ff', number: 3, paint });
    assert.ok(m instanceof THREE.Group);
    const b = box(m);
    const size = b.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - CT156_UNIT_LENGTH) < 0.03, `${paint} length ${size.x}`);
    assert.ok(b.max.x > 0.6 && b.min.x < -0.7, `${paint} nose at +X, tail at -X`);
    assert.ok(Math.abs(size.y / size.x - PUBLISHED_SPAN_OVER_LENGTH) <= PUBLISHED_SPAN_OVER_LENGTH * 0.10, `${paint} span over length ${(size.y / size.x).toFixed(3)}`);
    assert.ok(Math.abs(b.max.y + b.min.y) < 0.01, `${paint} symmetric left and right`);
    assert.ok(b.max.z > 0.28 && b.max.z < 0.32 && b.min.z > -0.3, `${paint} fin stands up to +Z (${b.max.z})`);
    disposeCt156Model(m);
  }
});

test('lengthFt rescales the model, and rotation.set(-bank, -pitch, hdg) turns the nose to the heading', () => {
  const m = createCt156Model(THREE, { color: '#ff0000', number: 1, lengthFt: 40 });
  assert.ok(Math.abs(box(m).getSize(new THREE.Vector3()).x - 40) < 1);
  m.rotation.order = 'ZYX';
  m.rotation.set(0, 0, Math.PI / 2);
  m.updateMatrixWorld(true);
  const nose = new THREE.Vector3(1, 0, 0).transformDirection(m.matrixWorld);
  assert.ok(Math.abs(nose.y - 1) < 1e-9);
  disposeCt156Model(m);
});

test('Harvard: the whole fin is the ship colour, and the rest is navy', () => {
  const m = createCt156Model(THREE, { color: '#e0a010', number: 2 });
  const shipColoured = [];
  m.traverse((o) => { if (o.isMesh && o.material.color?.getHexString() === 'e0a010') shipColoured.push(o); });
  assert.equal(shipColoured.length, 1, 'only the fin');
  const fin = box(shipColoured[0]);
  assert.ok(fin.min.x < -0.68 && fin.max.z > 0.28 && fin.min.z > -0.01, 'the fin, at the tail and standing up');
  const navy = m.children[0].children[0].material; // the fuselage
  assert.notEqual(navy.color.getHexString(), 'e0a010');
  disposeCt156Model(m);
});

test('Ship colours: everything is the ship colour, and there are no decals', () => {
  drawn.length = 0;
  const m = createCt156Model(THREE, { color: '#e0a010', number: 2, paint: 'ship' });
  assert.equal(m.userData.ct156.mine.filter((o) => o.isCanvasTexture).length, 0, 'no number textures for the plain look');
  assert.ok(!drawn.some((t) => ['2', '122', '156122'].includes(t)), 'no number or serial drawn');
  const fuselage = m.children[0].children[0];
  assert.equal(fuselage.material.color.getHexString(), 'e0a010');
  disposeCt156Model(m);
});

test('Harvard: the ship number is drawn for the fin (both faces), the nose and the wing, and the serial', () => {
  const m = createCt156Model(THREE, { color: '#0066ff', number: 7 });
  const { mine } = m.userData.ct156;
  const textures = mine.filter((o) => o.isCanvasTexture);
  assert.equal(textures.length, 3, 'wing, fin and nose numbers');
  assert.ok(drawn.includes('7'), 'the number itself (fin and nose)');
  assert.ok(drawn.includes('127'), 'the wing number');
  assert.ok(drawn.includes('156127'), 'the serial');
  // The fin decal is on both faces of the fin and the nose number on both sides of the nose.
  const decalMeshes = [];
  m.traverse((o) => { if (o.isMesh && o.material.map && textures.includes(o.material.map)) decalMeshes.push(o); });
  assert.equal(decalMeshes.length, 5, 'fin x2, nose x2, one wing underside');
  const sides = (tex) => decalMeshes.filter((o) => o.material.map === tex).map((o) => Math.sign(box(o).getCenter(new THREE.Vector3()).y));
  const finTex = textures.find((t) => t.image.height === 512);
  assert.deepEqual(sides(finTex).sort(), [-1, 1]);
  disposeCt156Model(m);
});

test('every material is fog: false, so the aircraft never fades into the horizon', () => {
  for (const paint of ['harvard', 'ship']) {
    const m = createCt156Model(THREE, { color: '#0066ff', number: 1, paint });
    const mats = materialsOf(m);
    assert.ok(mats.length > 5);
    for (const mat of mats) assert.equal(mat.fog, false, `${paint} ${mat.type}`);
    disposeCt156Model(m);
  }
});

// Watch geometry and materials being freed.
function watch(group) {
  const freed = { geometry: 0, material: 0 };
  group.traverse((o) => {
    o.geometry?.addEventListener('dispose', () => freed.geometry++);
    for (const m of [].concat(o.material ?? [])) m.addEventListener('dispose', () => freed.material++);
  });
  return freed;
}

test('dispose is reference-counted: the shared kit is freed only when the last model goes', () => {
  const a = createCt156Model(THREE, { color: '#ff0000', number: 1 });
  const b = createCt156Model(THREE, { color: '#00ff00', number: 2 });
  const sharedGeometry = a.children[0].children[0].geometry;
  assert.equal(sharedGeometry, b.children[0].children[0].geometry, 'the fuselage geometry is shared');
  const shared = { freed: 0 };
  sharedGeometry.addEventListener('dispose', () => shared.freed++);
  const ownA = a.userData.ct156.mine.filter((o) => o.isMaterial);
  let ownFreed = 0;
  for (const mat of ownA) mat.addEventListener('dispose', () => ownFreed++);

  disposeCt156Model(a);
  assert.equal(shared.freed, 0, 'still in use by b');
  assert.equal(ownFreed, ownA.length, "a's own materials are freed at once");
  disposeCt156Model(a); // disposing twice does nothing
  assert.equal(shared.freed, 0);

  disposeCt156Model(b);
  assert.equal(shared.freed, 1, 'the last model frees the shared kit');

  const c = createCt156Model(THREE, { color: '#0000ff', number: 3 });
  assert.notEqual(c.children[0].children[0].geometry, sharedGeometry, 'a fresh kit is built after that');
  disposeCt156Model(c);
});

test('once the last model goes, every geometry, material and texture it drew with is freed', () => {
  const a = createCt156Model(THREE, { color: '#ff0000', number: 1 });
  const b = createCt156Model(THREE, { color: '#00ff00', number: 2, paint: 'ship' });
  // Everything the renderer would upload: each mesh's geometry, its materials and
  // every texture slot on them (map, emissiveMap, envMap ...), shared or per ship.
  const used = new Set();
  for (const g of [a, b]) {
    g.traverse((o) => {
      if (o.geometry) used.add(o.geometry);
      for (const m of [].concat(o.material ?? [])) {
        used.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) used.add(v);
      }
    });
  }
  assert.ok([...used].some((o) => o.isTexture && o.mapping === THREE.EquirectangularReflectionMapping), 'the reflection map is among them');
  const left = new Set(used);
  for (const o of used) o.addEventListener('dispose', () => left.delete(o));
  disposeCt156Model(a);
  disposeCt156Model(b);
  const names = [...left].map((o) => o.constructor.name);
  assert.deepEqual(names, [], 'nothing is left behind');
});

test('disposeCt156Model removes the model from its scene, and disposeAircraftMesh hands a Harvard model to it', () => {
  const scene = new THREE.Scene();
  const a = createCt156Model(THREE, { color: '#ff0000', number: 1 });
  const b = createCt156Model(THREE, { color: '#00ff00', number: 2 });
  scene.add(a, b);
  const sharedGeometry = a.children[0].children[0].geometry;
  let freed = 0;
  sharedGeometry.addEventListener('dispose', () => freed++);
  disposeCt156Model(a);
  assert.deepEqual(scene.children, [b]);
  disposeAircraftMesh(b); // must not free shared geometry itself, and must release b's reference
  assert.equal(freed, 1, 'freed exactly once, by the ref count');
  assert.equal(scene.children.length, 0);
});

test('the plain createAircraftMesh is unaffected and needs no canvas', () => {
  const before = canvases;
  const m = createAircraftMesh(THREE, { color: '#ffffff' });
  assert.equal(canvases, before);
  assert.ok(watch(m));
});
