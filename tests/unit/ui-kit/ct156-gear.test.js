// Checks: with the gear down and the ship's root set to the EADI's 2.5° on the gear, all three wheels touch level ground and
//   nothing else on the aircraft reaches lower than the wheels (the model is drawn 2.5° nose-down inside its root, so its spinner axis is level).
// Serves: ALL-34 (the CT-156's landing gear).
// Expected values: 2.5° on the EADI on the gear on level ground (Patrick, 12 Oct 2026, core performance onGearDeg) with the spinner axis level
//   (fix row A2) and the EADI's datum 2.5° above it (Patrick, 13 Oct 2026: "Yes, offset 2.5"); the ground is the lowest wheel's bottom, so the test
//   needs no number from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals on canvases, which the test doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
const { createCt156Model, setGear, CT156_LENGTH_FT } = await import('../../../src/ui-kit/ct156-model.js');

/** The lowest point (feet) of everything shown under obj, in the world. */
function lowestFt(obj) {
  let min = Infinity;
  const v = new THREE.Vector3();
  obj.traverseVisible((o) => {
    if (!o.isMesh) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) min = Math.min(min, v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).z);
  });
  return min;
}

test('gear down with the root at 2.5° on the gear: all three wheels on the ground and nothing lower', () => {
  const ship = createCt156Model(THREE, { color: '#c03030', number: 1, lengthFt: CT156_LENGTH_FT });
  setGear(ship, 1);
  ship.rotation.order = 'ZYX';
  ship.rotation.set(0, -(2.5 * Math.PI) / 180, 0); // the root at the EADI's 2.5° nose up; the model inside is 2.5° nose-down
  ship.updateMatrixWorld(true);
  const gear = ship.userData.ct156.gear;
  const wheels = { left: lowestFt(gear.sides[0].leg), right: lowestFt(gear.sides[1].leg), nose: lowestFt(gear.nose) };
  const ground = Math.min(...Object.values(wheels));
  // Within an inch: a wheel further off the ground than that would show beside the runway.
  for (const [name, z] of Object.entries(wheels)) assert.ok(z - ground < 0.1, `${name} wheel ${(z - ground).toFixed(2)} ft above the ground`);
  assert.ok(lowestFt(ship) > ground - 0.01, `something reaches ${(ground - lowestFt(ship)).toFixed(2)} ft below the wheels`);
});
