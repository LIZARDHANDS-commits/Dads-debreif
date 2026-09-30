// The words under each turn circle keep clear of each other (a 4312 In-place 90 ended with "#1 3.0 G" printed over "#3 3.0 G").
import test from 'node:test';
import assert from 'node:assert/strict';
import { stackRows, ROW_PX } from '../../../src/modules/turn-sim/label-rows.js';

const at = (x, w = 120, row = 0, y = 300) => ({ x, y, w, row });

test('labels that already clear each other stay in the rows they wanted', () => {
  assert.deepEqual(stackRows([at(100), at(400, 120, 1), at(700)]), [0, 1, 0]);
});

test('two neighbours that would overprint (#1 and #3 side by side) go to different rows', () => {
  const rows = stackRows([at(100, 120, 0), at(160, 120, 1), at(200, 120, 0)]); // #1, #2 (wants row 1), #3
  assert.equal(rows[0], 0);
  assert.equal(rows[1], 1);
  assert.ok(rows[2] > 1, `#3 shares no row with #1 or #2: ${rows}`);
});

test('no two placed labels overlap, whatever the crowd', () => {
  const labels = [at(100), at(130, 120, 1), at(160), at(190, 120, 1), at(220)];
  const rows = stackRows(labels);
  const rects = labels.map((l, i) => ({ x0: l.x - l.w / 2, x1: l.x + l.w / 2, y0: l.y + rows[i] * ROW_PX - 11, y1: l.y + rows[i] * ROW_PX + 2 }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      assert.ok(!(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0), `${i} and ${j} overlap`);
    }
  }
});
