// Prints the CT-156's named points as JSON, in feet, read from the code model as it is today, to seed the Blender master
// file in the private repo 3d-work (ALL-38, plan Step 3b item 3.3): the eye points, the reference points, every hinge
// (where it is, the axis it turns about, and which way is positive in the code) and the instrument faces (the cockpit's
// pictured faces, with the corner of their picture each vertex shows). Nothing here changes the app.
// Feet, the model's frame: nose +X, left +Y, up +Z from the spinner's axis, origin at the model's origin.
//
//   node tools/blender/ct156-points.mjs > ct156-points.json
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals and panels on canvases, which the export doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
globalThis.fetch = async () => { throw new Error('the export reads no model files'); };
const quiet = console.warn;
console.warn = () => {};
const M = await import('../../src/ui-kit/ct156-model.js');
const C = await import('../../src/ui-kit/ct156-cockpit.js');
console.warn = quiet;

const F = C.CT156_FT_PER_UNIT;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const ft = (v) => [v[0], v[1], v[2]].map((x) => r4(x * F));
const ship = M.createCt156Model(THREE, {});
const d = ship.userData.ct156;

/**
 * An axis given in a hinge's parent frame, in the model's frame. A turning axis flips the other way in a mirror (the right
 * side is the left side mirrored), so a parent with a negative determinant turns the axis round.
 */
function worldAxis(o, axis) {
  const m = o.parent.matrixWorld;
  const a = new THREE.Vector3(...axis).transformDirection(m);
  if (m.determinant() < 0) a.negate();
  return a.toArray().map(r4);
}
/** Where a hinge group is (feet) and the model-frame direction of the axis it turns about. */
function hingeAt(o, localAxis) {
  ship.updateMatrixWorld(true);
  const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  return { at: ft(p.toArray()), axis: worldAxis(o, localAxis.toArray()) };
}
/** A flight surface's axis, read off the turn the code gives it for a deflection that is trailing edge down (or right). */
function surfaceAxis(o, controls) {
  M.setControls(ship, controls);
  const q = o.quaternion, s = Math.sqrt(1 - q.w * q.w) || 1;
  const axis = [q.x / s, q.y / s, q.z / s];
  M.setControls(ship, {});
  const p = new THREE.Vector3().setFromMatrixPosition((ship.updateMatrixWorld(true), o.matrixWorld));
  return { at: ft(p.toArray()), axis: worldAxis(o, axis) };
}

const surfaces = d.surfaces, gear = d.gear;
const flapNames = ['flapIn', 'flapOut'];
const hinges = {};
surfaces.sides.forEach((side, i) => {
  const lr = i === 0 ? 'Left' : 'Right';
  hinges[`aileron${lr}`] = { ...surfaceAxis(side.aileron, { roll: i === 0 ? 1 : -1 }), positive: 'trailing edge down', travel: 'code (ALL-35)' };
  side.flaps.forEach((flap, k) => {
    hinges[`${flapNames[k]}${lr}`] = { ...surfaceAxis(flap, { flaps: 'LDG' }), positive: 'trailing edge down', travel: 'code (ALL-35)' };
  });
});
hinges.elevator = { ...surfaceAxis(surfaces.elevator, { pitch: -1 }), positive: 'trailing edge down', travel: 'code (ALL-35)' };
hinges.rudder = { ...surfaceAxis(surfaces.rudder, { yaw: 1 }), positive: 'trailing edge right', travel: 'code (ALL-35)' };
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
gear.sides.forEach((s, i) => {
  const lr = i === 0 ? 'Left' : 'Right';
  hinges[`gearLeg${lr}`] = { ...hingeAt(s.leg, X), positive: 'code setGear: rotation.x = -90° up, 0° down', travel: 'code (ALL-34)' };
  hinges[`gearLegDoorSplay${lr}`] = { ...hingeAt(s.splay, X), positive: 'code setGear: splay with the leg', travel: 'code (ALL-34)' };
  hinges[`gearInboardDoor${lr}`] = { ...hingeAt(s.door, X), positive: 'code setGear: rotation.x = -90° open', travel: 'code (ALL-34)' };
});
hinges.gearNose = { ...hingeAt(gear.nose, Y), positive: 'code setGear: rotation.y = 90° up, 0° down', travel: 'code (ALL-34)' };
gear.noseDoors.forEach((door, i) => {
  hinges[`gearNoseDoor${i === 0 ? 'Left' : 'Right'}`] = { ...hingeAt(door, X), positive: 'code setGear: opens with the leg', travel: 'code (ALL-34)' };
});
hinges.speedBrake = { ...hingeAt(d.speedBrake.hinge, Y), positive: `code setSpeedBrake: opens ${d.speedBrake.openDeg}°`, travel: 'code' };
// The blades' pitch axes, read with the prop turned to 0 (blade 1 out along +Y, as the master models it), and the landing
// and taxi lamps' hinges (3d-work hinge.blade1 to blade4, hinge.gearLampLeft and Right since chunk 8b).
const propRest = d.prop.rotation.x;
d.prop.rotation.x = 0;
d.propPitch.forEach((p, k) => {
  hinges[`blade${k + 1}`] = { ...hingeAt(p, Y), positive: "code turnProp: PROP_PITCH from the master's feathered blade, the leading edge forward", travel: 'code (PROP_PITCH)' };
});
d.prop.rotation.x = propRest;
gear.lampTurns.forEach((t, i) => {
  hinges[`gearLamp${i === 0 ? 'Left' : 'Right'}`] = { ...hingeAt(t, Y), positive: 'code setGear: +90° up, 0° down', travel: 'code (ALL-34)' };
});

// (The rear panel's picture is 1024 x 561 since chunk 6's E2 made its face the front's 2.3 by 1.26 ft; it was 1024 x 489.)
// The cockpit's pictured faces: each textured mesh drawn from a canvas, named by its picture (ct156-cockpit.js
// createCt156Cockpit: the live instruments' and engine displays' 1024 px atlases, in that order, the front and rear panel
// pictures, the lower panels, the consoles, each seat's panel shade, the standby compass card and the striped handles).
const FACE_NAMES = {
  '1024x1024': 'instruments-live', '1024x1024-2': 'engine-live', '2048x1122': 'panel-front', '1024x561': 'panel-rear',
  '768x576': 'panel-lower', '512x2048': 'consoles', '4x256': 'panel-shade-front', '4x256-2': 'panel-shade-rear',
  '2048x96': 'compass-card', '32x32': 'handle-stripes',
};
const cockpit = C.createCt156Cockpit(THREE, { liveEngine: true });
const faces = {};
const seen = new Map();
cockpit.group.traverse((o) => {
  const map = o.isMesh && !Array.isArray(o.material) ? o.material.map : null;
  if (!map?.image || !o.geometry.attributes.uv) return;
  const w = map.image.width, h = map.image.height;
  const key = `${w}x${h}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  const g = o.geometry, pos = g.attributes.position.array, uv = g.attributes.uv.array;
  const verts = [], uvs = [];
  for (let i = 0; i < pos.length; i += 3) verts.push([r4(pos[i]), r4(pos[i + 1]), r4(pos[i + 2])]);
  for (let i = 0; i < uv.length; i += 2) uvs.push([r4(uv[i]), r4(uv[i + 1])]);
  const idx = g.index ? Array.from(g.index.array) : verts.map((_, i) => i);
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) tris.push([idx[i], idx[i + 1], idx[i + 2]]);
  const name = FACE_NAMES[`${key}${n > 1 ? `-${n}` : ''}`];
  if (!name) throw new Error(`a cockpit face with a ${key} picture has no name in FACE_NAMES`);
  faces[name] = { picture: [w, h], verts, uvs, tris };
});

const out = {
  units: 'ft',
  frame: "nose +X, left +Y, up +Z from the spinner's axis, origin at the model's origin",
  ftPerUnit: r4(F),
  source: 'the code model as on main at V2.418 (src/ui-kit/ct156-model.js, ct156-cockpit.js)',
  eyes: { front: Object.values(C.EYES_FT.front).map(r4), rear: Object.values(C.EYES_FT.rear).map(r4) },
  reference: Object.fromEntries(Object.entries(M.CT156_REFERENCE_POINTS).map(([k, v]) => [k, ft(v)])),
  hinges,
  faces,
};
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
