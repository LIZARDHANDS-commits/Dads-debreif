// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Drawing the wind arrows on the 2D map (task 12e-2): each arrow starts where
// its point is on the screen, so it moves with pan and zoom, points downwind,
// carries its words as canvas text, and nothing is drawn for no arrows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWindArrows } from '../../../src/modules/debrief/map2d/layers.js';

// A canvas context that keeps the path's points and the text, in order.
function ctxStub() {
  const log = { moves: [], lines: [], texts: [], calls: [] };
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === 'log') return log;
      if (k === 'moveTo') return (x, y) => log.moves.push([x, y]);
      if (k === 'lineTo') return (x, y) => log.lines.push([x, y]);
      if (k === 'fillText') return (text, x, y) => log.texts.push({ text, x, y, kind: 'fill' });
      if (k === 'strokeText') return (text, x, y) => log.texts.push({ text, x, y, kind: 'stroke' });
      if (k === 'measureText') return () => ({ width: 40 });
      return () => log.calls.push(k);
    },
    set() {
      return true;
    },
  });
  return ctx;
}
const mapAt = (shift = [0, 0], zoom = 1) => ({ worldToScreen: (x, y) => [100 + shift[0] + x * zoom, 200 + shift[1] - y * zoom] });
const arrow = { x: 10, y: 20, dirDeg: 270, kt: 38, label: '270°T/38 kt' };

test('an arrow starts at its point on the screen and its shaft ends downwind', () => {
  // The end point is typed in from the geometry, not worked out with the code's own arrowVector.
  // A wind "from 270°" blows from the west toward the east, so on a north-up screen the arrow points straight right:
  // the head is level with the tail (same y) and to its right. The point (10, 20) ft is at screen (110, 180) with mapAt().
  const tail = [110, 180];
  const shaftOf = (a) => {
    const ctx = ctxStub();
    drawWindArrows(ctx, mapAt(), [a]);
    assert.ok(ctx.log.moves.some(([x, y]) => x === tail[0] && y === tail[1]), 'the shaft starts at the point');
    return ctx.log.lines[0]; // the first line is the shaft; the barbs come after
  };
  const west = shaftOf({ ...arrow, dirDeg: 270, kt: 20 });
  assert.ok(Math.abs(west[1] - tail[1]) < 1e-9, 'a west wind blows level across the screen');
  // Length: the spec holds an arrow between 16 and 72 px, growing with the speed (docs/modules/debrief/spec.md, Winds aloft).
  const len20 = west[0] - tail[0];
  assert.ok(len20 >= 16 && len20 <= 72, `${len20} px`);
  assert.ok(shaftOf({ ...arrow, dirDeg: 270, kt: 40 })[0] - tail[0] > len20, 'a stronger wind draws a longer arrow');
  // A north wind (from 360°) blows south: straight down the screen. An east wind (from 090°) blows west: left.
  const north = shaftOf({ ...arrow, dirDeg: 360, kt: 20 });
  assert.ok(Math.abs(north[0] - tail[0]) < 1e-9 && north[1] > tail[1]);
  const east = shaftOf({ ...arrow, dirDeg: 90, kt: 20 });
  assert.ok(Math.abs(east[1] - tail[1]) < 1e-9 && east[0] < tail[0]);
  // A south-west wind (from 225°) blows north-east: up and to the right, at 45°.
  const southwest = shaftOf({ ...arrow, dirDeg: 225, kt: 20 });
  assert.ok(southwest[0] > tail[0] && southwest[1] < tail[1]);
  assert.ok(Math.abs((southwest[0] - tail[0]) - (tail[1] - southwest[1])) < 1e-9);
});

test('the arrows move with the map: pan shifts the whole arrow, zoom moves its place but not its length', () => {
  const at = (map) => {
    const ctx = ctxStub();
    drawWindArrows(ctx, map, [arrow]);
    return ctx.log;
  };
  const a = at(mapAt());
  const panned = at(mapAt([30, -12]));
  assert.deepEqual(panned.moves[0], [a.moves[0][0] + 30, a.moves[0][1] - 12]);
  assert.deepEqual(panned.lines[0], [a.lines[0][0] + 30, a.lines[0][1] - 12]);
  const zoomed = at(mapAt([0, 0], 2));
  assert.deepEqual(zoomed.moves[0], [120, 160]); // the point is where zoom puts it
  const len = (log) => Math.hypot(log.lines[0][0] - log.moves[0][0], log.lines[0][1] - log.moves[0][1]);
  assert.ok(Math.abs(len(zoomed) - len(a)) < 1e-9, 'the arrow keeps its length in pixels');
});

test('each arrow has its words, drawn as canvas text (never markup), and no arrows draw nothing', () => {
  const ctx = ctxStub();
  drawWindArrows(ctx, mapAt(), [arrow, { ...arrow, x: 900, dirDeg: 90, kt: 12, label: '090°T/12 kt' }]);
  assert.deepEqual(ctx.log.texts.filter((t) => t.kind === 'fill').map((t) => t.text), ['270°T/38 kt', '090°T/12 kt']);
  const none = ctxStub();
  drawWindArrows(none, mapAt(), []);
  assert.deepEqual(none.log.texts, []);
  assert.deepEqual(none.log.moves, []);
});

test('a point with a value that is not a number is skipped, not drawn at NaN', () => {
  const ctx = ctxStub();
  drawWindArrows(ctx, mapAt(), [{ ...arrow, x: NaN }, { ...arrow, kt: NaN }, arrow]);
  assert.equal(ctx.log.texts.filter((t) => t.kind === 'fill').length, 1);
});

test('a calm point is a small ring with "calm" beside it: no shaft, no barbs, no direction', () => {
  const ctx = ctxStub();
  drawWindArrows(ctx, mapAt(), [{ x: 10, y: 20, dirDeg: 270, kt: 0.3, label: 'calm' }]);
  assert.deepEqual(ctx.log.lines, []);
  assert.deepEqual(ctx.log.moves, []);
  assert.ok(ctx.log.calls.includes('arc'), 'a ring on the point');
  assert.deepEqual(ctx.log.texts.filter((t) => t.kind === 'fill').map((t) => t.text), ['calm']);
  // The word is beside the ring, at the point's place on the screen.
  const word = ctx.log.texts.find((t) => t.kind === 'fill');
  assert.ok(word.x > 110 && word.x < 130 && Math.abs(word.y - 180) < 8, `${word.x}, ${word.y}`);
});
