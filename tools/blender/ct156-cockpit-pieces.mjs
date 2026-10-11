// Prints the code cockpit's named parts (seat, pcl, stick, body) piece by piece, as JSON, for the Blender cockpit
// (build_ct156_cockpit.py) to round and to bake soft shadows onto (ALL-32). The pieces come from the code cockpit itself
// (createCt156Cockpit with keepPieces), so the shapes keep one source: Blender only rounds their edges and shades them.
// Each part carries the code's fingerprint of its pieces (cockpitPiecesHash), so the app shows the file's part only
// while the code still draws it so. `_occluders` are the pictured faces (panel faces, console tops, lower panels,
// striped handles): not in the file, but they shade its parts in the bake. `_eyes` are the pilots' eyes.
// Feet, the cockpit's frame: nose +X, left +Y, up +Z from the model's origin on the spinner's axis.
//
//   node tools/blender/ct156-cockpit-pieces.mjs > ct156-cockpit-pieces.json
import * as THREE from 'three';
import { EYES_FT, cockpitPiecesHash, createCt156Cockpit } from '../../src/ui-kit/ct156-cockpit.js';

// A stand-in for the browser's document: the cockpit draws its pictures on canvases, which the export doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const cockpit = createCt156Cockpit(THREE, { doc, keepPieces: true });
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const piece = ({ geometry, slot }) => {
  const pos = geometry.attributes.position.array, verts = [];
  for (let i = 0; i < pos.length; i += 3) verts.push([r4(pos[i]), r4(pos[i + 1]), r4(pos[i + 2])]);
  const idx = geometry.index ? Array.from(geometry.index.array) : verts.map((_, i) => i), faces = [];
  for (let i = 0; i < idx.length; i += 3) faces.push([idx[i], idx[i + 1], idx[i + 2]]);
  return { slot, verts, faces };
};
const out = {};
for (const [name, pieces] of Object.entries(cockpit.group.userData.pieces)) out[name] = { hash: cockpitPiecesHash(pieces), pieces: pieces.map(piece) };
out._eyes = EYES_FT; // the pictured faces are turned to face the nearer eye
out._occluders = { hash: cockpit.group.userData.shadeHash, pieces: cockpit.group.userData.occluders.map(piece) };
process.stdout.write(`${JSON.stringify(out)}\n`);
