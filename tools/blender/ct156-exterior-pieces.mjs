// Prints the code model's solid parts (ct156-model.js ct156ExteriorPieces: fuselage, wings and tail, fin, frames,
// exhausts, spinner and the rest) as JSON, triangle by triangle with each triangle's colour slot, for the Blender outside
// (build_ct156_exterior.py) to smooth and to bake soft shadows and panel lines onto (ALL-33). The shapes come from the
// code model itself, so they keep one source: Blender only smooths and shades them. Each part carries the code's
// fingerprint (ct156PiecesHash), so the app uses the file only while the code still draws those shapes.
// Model units, the model's frame: nose +X, left +Y, up +Z from the spinner's axis; 1.44 units is the 33 ft 4 in length.
//
//   node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals on canvases, which the export doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
const { ct156ExteriorPieces } = await import('../../src/ui-kit/ct156-model.js');

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const out = {};
for (const [name, { geometry, hash }] of Object.entries(ct156ExteriorPieces(THREE))) {
  const pos = geometry.attributes.position.array, verts = [];
  for (let i = 0; i < pos.length; i += 3) verts.push([r6(pos[i]), r6(pos[i + 1]), r6(pos[i + 2])]);
  const idx = geometry.index ? Array.from(geometry.index.array) : verts.map((_, i) => i);
  const slotOf = (corner) => geometry.groups.find((g) => corner >= g.start && corner < g.start + g.count)?.materialIndex ?? 0;
  const faces = [], slots = [];
  for (let i = 0; i < idx.length; i += 3) { faces.push([idx[i], idx[i + 1], idx[i + 2]]); slots.push(slotOf(i)); }
  out[name] = { hash, verts, faces, slots };
}
process.stdout.write(`${JSON.stringify(out)}\n`);
