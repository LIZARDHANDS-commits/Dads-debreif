// The top-down view's scale and grid maths, and what it draws (SPEC-turn-fight,
// "The drawing"). The maths is V6's `draw` (original/shell.html, line 4287).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FT_PER_NM } from '../../../src/core/units.js';
import { toScreen } from '../../../src/ui-kit/canvas-view.js';
import { createRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import {
  COLORS, MIN_REACH_FT, viewReachFt, topDownView, gridSpacingNm, gridLines, drawTopDown,
} from '../../../src/modules/turn-fight/view.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const play = (run, sec) => { for (let t = 0; t < sec - 1e-9; t += 0.02) advanceRun(run, 0.02); return run; };

test('V6\'s colours: Blue #58a6ff, Red #ff6b6b, first nose-on line #ffcc66', () => {
  assert.equal(COLORS.blue, '#58a6ff');
  assert.equal(COLORS.red, '#ff6b6b');
  assert.equal(COLORS.nose, '#ffcc66');
});

test('the screen\'s stylesheet uses the same three colours as the canvas', () => {
  const css = readFileSync(new URL('../../../src/modules/turn-fight/turn-fight.css', import.meta.url), 'utf8');
  assert.match(css, new RegExp(`--tf-blue:\\s*${COLORS.blue}`, 'i'));
  assert.match(css, new RegExp(`--tf-red:\\s*${COLORS.red}`, 'i'));
  assert.match(css, new RegExp(`--tf-nose:\\s*${COLORS.nose}`, 'i'));
});

test('the view reaches at least half the start separation, and never less than 3,000 ft (V6 `mx`)', () => {
  assert.equal(MIN_REACH_FT, 3000);
  assert.equal(viewReachFt({ separationNm: 2, extentFt: 0 }), 2 * FT_PER_NM / 2);
  assert.equal(viewReachFt({ separationNm: 0.5, extentFt: 0 }), 3000); // 1,519 ft would be tighter than V6 allows
  assert.equal(viewReachFt({ separationNm: 2, extentFt: 0 }) > 3000, true);
});

test('the view zooms out as the fight spreads, to keep every trail point and aircraft in sight', () => {
  assert.equal(viewReachFt({ separationNm: 2, extentFt: 9000 }), 9000);
  assert.equal(viewReachFt({ separationNm: 2, extentFt: 9000, aircraft: [{ xFt: -12000, yFt: 0 }, { xFt: 0, yFt: 15000 }] }), 15000);
  assert.equal(viewReachFt({ separationNm: 2, extentFt: 9000, aircraft: [{ xFt: 100, yFt: 100 }] }), 9000);
});

test('scale: 42% of the shorter side from the centre to the reach, with the centre at the middle (V6 `k`)', () => {
  const size = { width: 1000, height: 500 };
  const view = topDownView(size, { separationNm: 2, extentFt: 0 });
  near(view.scale, (500 * 0.42) / (2 * FT_PER_NM / 2));
  assert.deepEqual([view.cx, view.cy], [0, 0]);
  assert.deepEqual(toScreen(view, size, 0, 0), [500, 250]); // the merge point is the middle of the box
  const [sx, sy] = toScreen(view, size, 1000, 1000); // east is right, north is up
  assert.ok(sx > 500 && sy < 250);
  const tall = topDownView({ width: 500, height: 1000 }, { separationNm: 2, extentFt: 0 });
  near(tall.scale, view.scale); // it follows the shorter side
});

test('a bigger box gives a bigger picture, a spread-out fight a smaller one', () => {
  const small = topDownView({ width: 600, height: 400 }, { separationNm: 2, extentFt: 0 });
  const big = topDownView({ width: 1200, height: 800 }, { separationNm: 2, extentFt: 0 });
  near(big.scale, small.scale * 2);
  const spread = topDownView({ width: 600, height: 400 }, { separationNm: 2, extentFt: 30000 });
  assert.ok(spread.scale < small.scale);
});

test('the grid is 1 NM while that is readable, then 2, 5, 10 NM and so on, so it never turns to mush', () => {
  const ftPerPx = (px) => px / FT_PER_NM; // px per ft for a grid square of `px` pixels
  assert.equal(gridSpacingNm(ftPerPx(60)), 1);
  assert.equal(gridSpacingNm(ftPerPx(14)), 1);
  assert.equal(gridSpacingNm(ftPerPx(13)), 2);
  assert.equal(gridSpacingNm(ftPerPx(6)), 5);
  assert.equal(gridSpacingNm(ftPerPx(2)), 10);
  assert.equal(gridSpacingNm(ftPerPx(0.5)), 50);
  assert.equal(gridSpacingNm(ftPerPx(0.001)), 1000);
});

test('the grid fills the whole box at any zoom, through the merge point (V6 drew only ±4 NM)', () => {
  const size = { width: 900, height: 600 };
  for (const extentFt of [0, 20000, 100000, 400000]) {
    const view = topDownView(size, { separationNm: 2, extentFt });
    const { xs, ys, spacingNm } = gridLines(size, view);
    const step = spacingNm * FT_PER_NM * view.scale;
    assert.ok(xs.includes(450) && ys.includes(300), `a line through the centre (extent ${extentFt})`);
    assert.ok(Math.min(...xs) < step && Math.max(...xs) > size.width - step, 'reaches both sides');
    assert.ok(Math.min(...ys) < step && Math.max(...ys) > size.height - step, 'reaches top and bottom');
    near(xs[1] - xs[0], step, 1e-6);
    assert.ok(xs.length < 200 && ys.length < 200, 'never mush');
  }
  const zoomedOut = gridLines(size, topDownView(size, { separationNm: 2, extentFt: 100000 }));
  assert.equal(zoomedOut.spacingNm, 1);
  assert.ok(zoomedOut.xs.length > 9, 'more than V6\'s nine lines');
  assert.ok(gridLines(size, topDownView(size, { separationNm: 2, extentFt: 400000 })).spacingNm > 1);
});

// A canvas that writes down what it was asked to draw.
function recorder() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => { calls.push({ fn: prop, args, style: { stroke: target.strokeStyle, fill: target.fillStyle, align: target.textAlign } }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return ctx;
}
const texts = (ctx) => ctx.calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);

test('drawing shows B and R on the arrowheads and the MERGE mark, and no first nose-on line before there is one', () => {
  const run = createRun({});
  const ctx = recorder();
  drawTopDown(ctx, { width: 800, height: 500 }, run);
  assert.ok(texts(ctx).includes('B') && texts(ctx).includes('R'));
  assert.ok(texts(ctx).includes('MERGE'));
  assert.ok(!texts(ctx).some((t) => t.startsWith('FIRST NOSE')));
  assert.ok(!ctx.calls.some((c) => c.fn === 'setLineDash' && c.args[0].length));
});

test('drawing shows the dashed first nose-on line in #ffcc66 with its label once an aircraft has it', () => {
  const run = play(createRun({ blueKt: 250, redKt: 200 }), 40);
  assert.equal(run.fight.firstNose.by, 'red');
  const ctx = recorder();
  drawTopDown(ctx, { width: 800, height: 500 }, run);
  assert.ok(texts(ctx).includes('FIRST NOSE — RED'));
  // The words sit in the bottom-right corner, apart from the aircraft, MERGE and "Grid" (bottom-left).
  const label = ctx.calls.find((c) => c.fn === 'fillText' && c.args[0] === 'FIRST NOSE — RED');
  assert.deepEqual(label.args.slice(1), [800 - 8, 500 - 8]);
  assert.equal(label.style.align, 'right');
  const dash = ctx.calls.find((c) => c.fn === 'setLineDash' && c.args[0].length);
  assert.deepEqual(dash.args[0], [7, 5]);
  assert.ok(ctx.calls.some((c) => c.fn === 'stroke' && c.style.stroke === COLORS.nose));
});

test('the trails are drawn in each aircraft\'s colour and end at the aircraft', () => {
  const run = play(createRun({}), 5);
  const ctx = recorder();
  drawTopDown(ctx, { width: 800, height: 500 }, run);
  for (const colour of [COLORS.blue, COLORS.red]) {
    assert.ok(ctx.calls.some((c) => c.fn === 'stroke' && c.style.stroke === colour), colour);
    assert.ok(ctx.calls.some((c) => c.fn === 'fill' && c.style.fill === colour), `${colour} arrowhead`);
  }
  // The last point of Blue's line is where Blue is now, not the last 0.1 s point.
  const view = topDownView({ width: 800, height: 500 }, { separationNm: 2, extentFt: run.trails.extent.maxAbsFt, aircraft: [run.fight.blue, run.fight.red] });
  const [bx, by] = toScreen(view, { width: 800, height: 500 }, run.fight.blue.xFt, run.fight.blue.yFt);
  const lastBlueLine = ctx.calls.filter((c) => c.fn === 'lineTo' && c.style.stroke === COLORS.blue).at(-1);
  near(lastBlueLine.args[0], bx, 1e-6);
  near(lastBlueLine.args[1], by, 1e-6);
});

test('an empty box draws nothing and does not throw', () => {
  const ctx = recorder();
  assert.doesNotThrow(() => drawTopDown(ctx, { width: 0, height: 0 }, createRun({})));
  assert.equal(ctx.calls.length, 0);
});
