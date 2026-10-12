// Prints the code model's landing gear (ct156-model.js ct156GearPieces: the main leg and wheel, its leg door, the inboard
// door, the nose leg and wheel, a nose door; the left side's, each in its own hinge's frame) as JSON, triangle by
// triangle with each triangle's colour slot, and each part's pose gear down (a column-major 4x4 matrix into the model's
// frame), for the Blender gear (build_ct156_gear.py) to smooth and to bake soft shadows onto in place (ALL-34). Each part
// carries the code's fingerprint (ct156PiecesHash), so the app uses the file only while the code still draws those shapes.
// Model units: nose +X, left +Y, up +Z from the spinner's axis; 1.44 units is the 33 ft 4 in length.
//
//   node tools/blender/ct156-gear-pieces.mjs > ct156-gear-pieces.json
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals on canvases, which the export doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
const { ct156GearPieces } = await import('../../src/ui-kit/ct156-model.js');

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const out = {};
for (const [name, { geometry, hash, pose }] of Object.entries(ct156GearPieces(THREE))) {
  const pos = geometry.attributes.position.array, verts = [];
  for (let i = 0; i < pos.length; i += 3) verts.push([r6(pos[i]), r6(pos[i + 1]), r6(pos[i + 2])]);
  const idx = geometry.index ? Array.from(geometry.index.array) : verts.map((_, i) => i);
  const slotOf = (corner) => geometry.groups.find((g) => corner >= g.start && corner < g.start + g.count)?.materialIndex ?? 0;
  const faces = [], slots = [];
  for (let i = 0; i < idx.length; i += 3) { faces.push([idx[i], idx[i + 1], idx[i + 2]]); slots.push(slotOf(i)); }
  out[name] = { hash, pose: pose.map(r6), verts, faces, slots };
}
process.stdout.write(`${JSON.stringify(out)}\n`);
