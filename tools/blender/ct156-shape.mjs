// Prints the code model's shape tables (src/ui-kit/ct156-model.js) as JSON, so the Blender build
// (build_ct156.py) uses the very same numbers and the tables keep one copy. It reads the file's
// "the shape" section as text and runs only that section: plain numbers and small helpers, no three.js.
//
//   node tools/blender/ct156-shape.mjs > ct156-shape.json
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../src/ui-kit/ct156-model.js', import.meta.url), 'utf8');
const start = src.indexOf('export const CT156_UNIT_LENGTH');
const end = src.indexOf('/** A symmetric NACA 4-digit');
if (start < 0 || end < start) throw new Error('ct156-model.js: shape section not found; update ct156-shape.mjs');
const section = src.slice(start, end).replace(/^export /gm, '');
const names = ['CT156_UNIT_LENGTH', 'CT156_LENGTH_FT', 'STATIONS', 'CANOPY', 'CT156_FRAME_X', 'CT156_SEAT_X', 'CT156_HELMET_Z', 'WING_Z', 'DIHEDRAL', 'TIP', 'WING', 'STAB', 'FIN'];
const shape = new Function(`${section}\nreturn { ${names.join(', ')} };`)();
process.stdout.write(`${JSON.stringify(shape, null, 1)}\n`);
