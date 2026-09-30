// Rows for the words under each turn circle, so neighbours never print over each other (a 4312 In-place 90 ends with #1 and #3 side by side).

/** How far apart two rows of 11 px words are, in CSS px. */
export const ROW_PX = 13;
const TEXT_ABOVE_PX = 11;
const TEXT_BELOW_PX = 2; // 11 + 2 = a row, so words in neighbouring rows touch but never overlap

/**
 * Which row each label goes in. Each label wants a row (its `row`, 0 for the first) and takes the first row from there down where it does not
 * cover an earlier label, so labels that already clear each other stay where they were and only the ones that would collide move.
 *
 * @param {{ x: number, y: number, w: number, row?: number }[]} labels  the centre of each label's words, its baseline and its width, in draw order
 * @param {number} [rowPx]
 * @returns {number[]} the row of each label
 */
export function stackRows(labels, rowPx = ROW_PX) {
  const placed = [];
  return labels.map((l) => {
    for (let row = l.row ?? 0; ; row++) {
      const y = l.y + row * rowPx;
      const rect = { x0: l.x - l.w / 2, x1: l.x + l.w / 2, y0: y - TEXT_ABOVE_PX, y1: y + TEXT_BELOW_PX };
      if (!placed.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0)) {
        placed.push(rect);
        return row;
      }
    }
  });
}
