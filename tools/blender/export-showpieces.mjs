// Writes the showpiece buildings' traced shapes (TR-142) as JSON for tools/blender/build-showpieces.py: Hangars 1 to 3 with their
// annexes, Hangars 5 and 6 (the Snowbirds), the Mess, the Glass Palace and the tower. The same data the 3D view draws them from,
// so the Blender models stand on the same footprints. Feet from the ARP, x east, y north.
// Usage: node tools/blender/export-showpieces.mjs out.json
import { writeFileSync } from 'node:fs';
import { FLAT_HANGARS, EAST_HANGARS, EAST_ANNEX, EAST_UPPER_FROM_FT, MESS, MESS_WALL } from '../../src/modules/traffic/flightline-buildings3d.js';
import { CYMJ_EXTRA_BUILDINGS, CYMJ_BUILDING_COORDS } from '../../src/modules/traffic/scenery3d.js';

const out = process.argv[2];
if (!out) throw new Error('usage: node tools/blender/export-showpieces.mjs out.json');
const gp = CYMJ_EXTRA_BUILDINGS.find((b) => b.id === 'main-building');
const tower = CYMJ_BUILDING_COORDS.tower;
writeFileSync(out, JSON.stringify({
  flatHangars: FLAT_HANGARS,
  eastHangars: EAST_HANGARS,
  eastAnnex: EAST_ANNEX,
  eastUpperFrom: EAST_UPPER_FROM_FT,
  mess: { ...MESS, wall: MESS_WALL },
  glassPalace: gp,
  tower: { id: 'control-tower', x: tower.x, y: tower.y },
}, null, 1));
console.log('wrote', out);
