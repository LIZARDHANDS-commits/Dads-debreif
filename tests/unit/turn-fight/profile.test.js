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

// The side view for Climb and dive (SPEC-turn-fight, "The side view's height
// scale works"). V6 (original/shell.html, line 4287) divided the height by
// its own biggest height times the scale and then multiplied by the scale
// again, so 1×, 2× and 4× drew the same picture (#20). Here the height is
// drawn against a range that only grows with the fight, times the scale, and
// stays inside the panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import { ALLOWED } from '../../../src/modules/turn-fight/state.js';
import {
  MIN_HEIGHT_RANGE_FT, heightRangeFt, plotArea, heightOffsetPx, edgeHeightFt, xSpanFt, xToPx, drawProfile,
} from '../../../src/modules/turn-fight/profile.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const play = (run, sec) => { for (let t = 0; t < sec - 1e-9; t += 0.02) advanceRun(run, 0.02); return run; };
const size = { width: 800, height: 176 };

const HEIGHT_SCALES = ALLOWED.heightScale;

test('the height scales are 1×, 2× and 4×', () => {
  assert.deepEqual(HEIGHT_SCALES, [1, 2, 4]);
});

test('the height range starts at 1,000 ft and only grows with the biggest height so far', () => {
  assert.equal(MIN_HEIGHT_RANGE_FT, 1000);
  assert.equal(heightRangeFt(0), 1000);
  assert.equal(heightRangeFt(400), 1000);
  assert.equal(heightRangeFt(1000), 1000);
  assert.equal(heightRangeFt(6500), 6500);
});

test('the plot leaves room for the title above and a margin below, with level in the middle of what is left', () => {
  const area = plotArea(size);
  assert.ok(area.top > 0 && area.top < size.height / 3);
  near(area.midY, (area.top + area.bottom) / 2);
  assert.ok(area.bottom <= size.height);
  assert.ok(area.left > 0 && area.right < size.width);
});

test('the scale works: the same height is drawn twice as far from level at 2× as at 1×, and four times at 4× (#20)', () => {
  const area = plotArea(size);
  const at = (scale) => heightOffsetPx(400, { rangeFt: 1000, scale, halfPx: area.halfPx });
  near(at(2), 2 * at(1));
  near(at(4), 4 * at(1));
  assert.ok(at(1) > 0);
  near(heightOffsetPx(-400, { rangeFt: 1000, scale: 2, halfPx: area.halfPx }), -at(2)); // a dive goes the other way
  assert.equal(heightOffsetPx(0, { rangeFt: 1000, scale: 4, halfPx: area.halfPx }), 0);
});

test('the range is fixed while it is not exceeded, so the picture does not re-fit itself every frame (V6 did)', () => {
  const half = plotArea(size).halfPx;
  const a = heightOffsetPx(300, { rangeFt: heightRangeFt(300), scale: 2, halfPx: half });
  const b = heightOffsetPx(300, { rangeFt: heightRangeFt(900), scale: 2, halfPx: half });
  assert.equal(a, b);
  const c = heightOffsetPx(300, { rangeFt: heightRangeFt(9000), scale: 2, halfPx: half });
  assert.ok(c < a, 'a bigger range squeezes the same height');
});

test('whatever the height and scale, it stays inside the panel', () => {
  const area = plotArea(size);
  for (const scale of HEIGHT_SCALES) {
    for (const z of [0, 1, 500, 1000, 3000, 25000, 1e7, -1e7, -25000, -500]) {
      const range = heightRangeFt(Math.min(Math.abs(z), 5000)); // a range that has not caught up yet is the worst case
      const y = area.midY - heightOffsetPx(z, { rangeFt: range, scale, halfPx: area.halfPx });
      assert.ok(y >= 0 && y <= size.height, `z ${z} at ${scale}×: ${y}`);
      assert.ok(Math.abs(heightOffsetPx(z, { rangeFt: range, scale, halfPx: area.halfPx })) <= area.halfPx);
    }
  }
});

test('at 4× the biggest height reaches most of the way to the edge; at 1× about a quarter of that', () => {
  const half = plotArea(size).halfPx;
  const big = heightOffsetPx(5000, { rangeFt: 5000, scale: 4, halfPx: half });
  assert.ok(big > 0.7 * half && big < half, String(big / half));
  const small = heightOffsetPx(5000, { rangeFt: 5000, scale: 1, halfPx: half });
  near(small, big / 4);
});

test('the edge label says how high the edge of the panel is at this scale', () => {
  assert.ok(edgeHeightFt({ rangeFt: 1000, scale: 1 }) > edgeHeightFt({ rangeFt: 1000, scale: 2 }));
  near(edgeHeightFt({ rangeFt: 1000, scale: 1 }), 2 * edgeHeightFt({ rangeFt: 1000, scale: 2 }));
  // A height of exactly that many feet is drawn at the edge of where lines may go.
  const half = 70;
  const edge = edgeHeightFt({ rangeFt: 2000, scale: 2 });
  near(heightOffsetPx(edge, { rangeFt: 2000, scale: 2, halfPx: half }), half * 0.95, 1e-9);
});

test('along the bottom: the x range of the fight, at least 1,000 ft wide, as V6', () => {
  assert.deepEqual(xSpanFt({ minXFt: -3000, maxXFt: 2500 }), { minXFt: -3000, maxXFt: 2500 });
  assert.deepEqual(xSpanFt({ minXFt: 0, maxXFt: 200 }), { minXFt: -500, maxXFt: 700 });
  const span = { minXFt: -1000, maxXFt: 1000 };
  assert.equal(xToPx(-1000, span, { left: 10, right: 790 }), 10);
  assert.equal(xToPx(1000, span, { left: 10, right: 790 }), 790);
  assert.equal(xToPx(0, span, { left: 10, right: 790 }), 400);
});

function recorder() {
  const calls = [];
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (text) => ({ width: 7 * String(text).length });
      return (...args) => { calls.push({ fn: prop, args, style: { stroke: target.strokeStyle, fill: target.fillStyle, align: target.textAlign } }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}
const texts = (ctx) => ctx.calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);
const dotY = (ctx, colour) => ctx.calls.find((c) => c.fn === 'arc' && c.style.fill === colour)?.args[1];

test('the picture is titled with the scale and labels both aircraft', () => {
  const run = play(createRun({ vertical: true, bluePitchDeg: 20, redPitchDeg: -20 }), 25);
  const ctx = recorder();
  drawProfile(ctx, size, run, 2);
  assert.ok(texts(ctx).includes('VERTICAL PROFILE • 2×'));
  assert.ok(texts(ctx).includes('B') && texts(ctx).includes('R'));
});

test('drawing at 1×, 2× and 4× puts Blue\'s dot at different heights, and Red\'s the other way (#20)', () => {
  const run = play(createRun({ vertical: true, bluePitchDeg: 20, redPitchDeg: -20 }), 25);
  const area = plotArea(size);
  const ys = HEIGHT_SCALES.map((scale) => {
    const ctx = recorder();
    drawProfile(ctx, size, run, scale);
    return { blue: dotY(ctx, '#58a6ff'), red: dotY(ctx, '#ff6b6b') };
  });
  assert.ok(ys[0].blue < area.midY && ys[0].red > area.midY, 'Blue climbs above level, Red dives below');
  assert.ok(ys[1].blue < ys[0].blue && ys[2].blue < ys[1].blue, 'more scale, higher');
  near(area.midY - ys[1].blue, 2 * (area.midY - ys[0].blue), 1e-6);
  assert.ok(ys.every(({ blue, red }) => blue >= 0 && red <= size.height));
});

test('with no pitch the traces lie along the level line', () => {
  const run = play(createRun({ vertical: true }), 20);
  const ctx = recorder();
  drawProfile(ctx, size, run, 2);
  const area = plotArea(size);
  near(dotY(ctx, '#58a6ff'), area.midY);
  near(dotY(ctx, '#ff6b6b'), area.midY);
});

test('a letter at the right edge flips to the left of its dot, and none goes above the plot', () => {
  const run = createRun({ vertical: true }); // at the start Red is at the east end of the span, at the plot's right edge
  const area = plotArea(size);
  const ctx = recorder();
  drawProfile(ctx, size, run, 2);
  const letter = ctx.calls.find((c) => c.fn === 'fillText' && c.args[0] === 'R');
  const [, y] = letter.args.slice(1);
  near(dotY(ctx, '#ff6b6b'), area.midY);
  if (letter.style.align === 'right') assert.ok(letter.args[1] - 7 >= 0 && letter.args[1] <= size.width - 2, 'flipped, inside');
  else assert.ok(letter.args[1] + 7 <= size.width - 2, 'not flipped, inside');
  assert.equal(letter.style.align, 'right');
  assert.ok(y >= area.top + 12);
  // Blue sits at the left end and keeps its letter to the right of the dot.
  assert.equal(ctx.calls.find((c) => c.fn === 'fillText' && c.args[0] === 'B').style.align, 'left');
  // A dot high in the plot never has its letter above the plot's top.
  const climbed = play(createRun({ vertical: true, bluePitchDeg: 60, redPitchDeg: -60 }), 60);
  const tall = recorder();
  drawProfile(tall, { width: 800, height: 60 }, climbed, 4);
  for (const t of ['B', 'R']) assert.ok(tall.calls.find((c) => c.fn === 'fillText' && c.args[0] === t).args[2] >= plotArea({ width: 800, height: 60 }).top + 12);
});

test('a box with no size draws nothing', () => {
  const ctx = recorder();
  assert.doesNotThrow(() => drawProfile(ctx, { width: 0, height: 0 }, createRun({ vertical: true }), 2));
  assert.equal(ctx.calls.length, 0);
});
