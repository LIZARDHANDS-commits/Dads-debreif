import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSm, formatMinimaLine, formatOffset, formatNm } from '../../../src/airfields/format.js';

test('visibility is written the way minima are: 2, 1½, ¾, 1¼, 2.4', () => {
  assert.deepEqual([2, 1.5, 0.75, 1.25, 0.5, 2.4].map(formatSm), ['2', '1½', '¾', '1¼', '½', '2.4']);
});

test('the minima line names the options and says when the approach type is not set', () => {
  assert.equal(
    formatMinimaLine('CYQR', { minima: [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }], minimaChecked: true }),
    'CYQR 600-2 (or 700-1½, 800-1)',
  );
  assert.equal(formatMinimaLine('CYYN', { minima: [{ ceilingFt: 600, visSm: 2 }], minimaChecked: false }), 'CYYN 600-2, not checked');
});

test('UTC offsets read UTC−6, UTC+5:30, UTC', () => {
  assert.deepEqual([-360, 330, 0].map(formatOffset), ['UTC−6', 'UTC+5:30', 'UTC']);
});

test('distances are whole NM, or unknown', () => {
  assert.deepEqual([118.5, null].map(formatNm), ['119 NM', 'unknown']);
});
