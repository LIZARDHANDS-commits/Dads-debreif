// Checks: in the SOF's 3D view, three neighbouring radar cells in a row with the same colour, under model cloud from 4,000 to 12,000 ft, are drawn as one block three
//   cells wide from 4,000 to 12,000 ft with one rain curtain from the ground up to 4,000 ft; a neighbour of a different colour stays its own block; and a radar picture
//   lit in every cell never draws more than MAX_SHAFTS blocks.
// Serves: SOF-39 (3D view: radar), SOF-56 (radar blocks in the cloud), and Dad's ask of 8 Oct 2026: "the radar blocks are heavy on processing. can we simplify if need".
// Expected values: the stated geometry (cloud base 4,000 ft and top 12,000 ft above sea level over flat ground at 1,900 ft, about Moose Jaw's elevation; the radar
//   grid is CELL_PX cells across the 3D area, so three cells side by side are three cells' width east-west and one north-south). Not read from V6 or from the code's
//   own output.
// Margin: ±100 ft, the shared table's height margin, for the block's base and top and the curtain's ends; the same ±100 ft for the block's width and depth, which
//   are distances in feet too (a cell is about 28,000 ft at 450 NM, so 100 ft is well under one per cent of it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shafts, CELL_PX, MAX_SHAFTS } from '../../../src/modules/sof/weather3d-model.js';
import { slabColumnAt } from '../../../src/modules/sof/cloud-field.js';
import { AREA_FT } from '../../../src/modules/sof/scene3d-model.js';

const GROUND_FT = 1900;
const BASE_FT = 4000;
const TOP_FT = 12_000;
const CELL_FT = AREA_FT / CELL_PX;
const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 100, `${what}: ${got} ft, expected ${want} ft ± 100`);

/** Cloud slabs over the whole square as the 3D view keeps them (cloud-field.js `slabFields`'s shape): one low slab, 80 % cover, base and top as given. */
function slabs() {
  const px = 4;
  const fill = (v) => new Float32Array(px * px).fill(v);
  return { px, groundFt: GROUND_FT, low: { base: fill(BASE_FT), top: fill(TOP_FT), cover: fill(80), levels: fill(3) }, mid: null, high: null };
}

/** The radar cell in grid column `col` and row `row` (row 0 the north edge), as pictureCells gives it, in colour [r, g, b]. */
function cell(col, row, [r, g, b]) {
  const u = (col + 0.5) / CELL_PX;
  const v = 1 - (row + 0.5) / CELL_PX;
  return { x: (u - 0.5) * AREA_FT, y: (v - 0.5) * AREA_FT, u, v, r, g, b, a: 0.9 };
}

const GREEN = [0, 200, 0];
const YELLOW = [255, 255, 0];

test('three neighbouring cells of one colour under cloud from 4,000 to 12,000 ft are one block three cells wide with one rain curtain; a different-coloured neighbour stays its own block; a fully lit picture draws no more than MAX_SHAFTS blocks', () => {
  const cloudy = slabs();
  const column = (u, v) => slabColumnAt(cloudy, u, v);
  const cells = [cell(40, 50, GREEN), cell(41, 50, GREEN), cell(42, 50, GREEN), cell(43, 50, YELLOW)];

  const blocks = shafts(cells, { column, groundFt: GROUND_FT });
  assert.equal(blocks.length, 2, 'the three green cells make one block and the yellow one its own');

  const green = blocks.find((b) => b.colour.join() === GREEN.join());
  assert.ok(green, 'a green block');
  near(green.wFt, 3 * CELL_FT, 'green block east-west');
  near(green.dFt, CELL_FT, 'green block north-south');
  near(green.x, cells[1].x, 'green block centred on the middle cell, east-west');
  near(green.y, cells[1].y, 'green block centred on the middle cell, north-south');
  near(green.baseFt, BASE_FT, 'green block base');
  near(green.topFt, TOP_FT, 'green block top');
  assert.ok(green.rain, 'one rain curtain under the green block');
  near(green.rain.baseFt, GROUND_FT, 'curtain bottom');
  near(green.rain.topFt, BASE_FT, 'curtain top');

  const yellow = blocks.find((b) => b.colour.join() === YELLOW.join());
  assert.ok(yellow, 'the yellow cell is its own block');
  near(yellow.wFt, CELL_FT, 'yellow block east-west');
  near(yellow.dFt, CELL_FT, 'yellow block north-south');
  near(yellow.x, cells[3].x, 'yellow block where its cell is');

  assert.equal(blocks.filter((b) => b.rain).length, 2, 'one curtain a block, not one a cell');

  // A picture lit in every cell, colours alternating cell by cell so no two neighbours can merge (the most blocks a picture can ask for): never more than MAX_SHAFTS.
  const full = [];
  for (let row = 0; row < CELL_PX; row++) for (let col = 0; col < CELL_PX; col++) full.push(cell(col, row, (row + col) % 2 ? GREEN : YELLOW));
  const many = shafts(full, { column, groundFt: GROUND_FT });
  assert.ok(many.length > 0, 'a fully lit picture still draws blocks');
  assert.ok(many.length <= MAX_SHAFTS, `${many.length} blocks for a fully lit ${CELL_PX} × ${CELL_PX} picture, at most ${MAX_SHAFTS}`);
});
