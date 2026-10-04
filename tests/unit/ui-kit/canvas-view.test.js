// Checks: map pan and zoom geometry: screen and world positions round-trip, north is up, zoom keeps the point under the pointer, span limits, fit.
// Serves: none named yet (design check).
// Expected values: geometry worked out in the test; the 1e-9 closeness is arithmetic, not a flying margin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { toScreen, toWorld, clampScale, zoomAbout, fitBounds, visibleBounds } from '../../../src/ui-kit/canvas-view.js';

const size = { width: 800, height: 600 };
const view = { cx: 1000, cy: -2000, scale: 0.05 };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('the centre of the view is the middle of the canvas, with north up', () => {
  assert.deepEqual(toScreen(view, size, 1000, -2000), [400, 300]);
  const [, sy] = toScreen(view, size, 1000, -1000); // 1,000 units north
  assert.ok(sy < 300, 'north is up the screen');
  const [sx] = toScreen(view, size, 2000, -2000); // 1,000 units east
  assert.ok(sx > 400, 'east is to the right');
});

test('screen and world round-trip', () => {
  for (const [x, y] of [[0, 0], [1000, -2000], [-54321.5, 98765.25]]) {
    const [sx, sy] = toScreen(view, size, x, y);
    const [bx, by] = toWorld(view, size, sx, sy);
    close(bx, x, 'x');
    close(by, y, 'y');
  }
});

test('the visible width stays between minSpan and maxSpan', () => {
  const limits = { minSpan: 500, maxSpan: 300000 };
  assert.equal(clampScale(100, 800, limits), 800 / 500, 'no closer than 500 across');
  assert.equal(clampScale(1e-9, 800, limits), 800 / 300000, 'no further than 300,000 across');
  assert.equal(clampScale(0.05, 800, limits), 0.05, 'inside the limits: unchanged');
  assert.equal(clampScale(0.05, 0, limits), 0.05, 'a canvas with no width yet: unchanged');
});

test('zooming keeps the world point under the pointer still', () => {
  const pointer = [123, 456];
  const before = toWorld(view, size, ...pointer);
  for (const factor of [2, 0.5, 1.37]) {
    const next = zoomAbout(view, size, factor, ...pointer);
    close(next.scale, view.scale * factor, 'scale');
    const after = toWorld(next, size, ...pointer);
    close(after[0], before[0], 'x under the pointer');
    close(after[1], before[1], 'y under the pointer');
  }
});

test('zooming stops at the limits and still keeps the pointer point still', () => {
  const limits = { minSpan: 500, maxSpan: 300000 };
  const next = zoomAbout(view, size, 1e6, 700, 100, limits);
  close(size.width / next.scale, 500, 'span');
  const a = toWorld(view, size, 700, 100);
  const b = toWorld(next, size, 700, 100);
  close(b[0], a[0], 'x');
  close(b[1], a[1], 'y');
});

test('fit shows the whole box, centred, with padding', () => {
  const box = { minX: -10000, minY: 0, maxX: 30000, maxY: 10000 };
  const fitted = fitBounds(box, size, 20, {});
  assert.deepEqual([fitted.cx, fitted.cy], [10000, 5000]);
  const [left, top] = toScreen(fitted, size, box.minX, box.maxY);
  const [right, bottom] = toScreen(fitted, size, box.maxX, box.minY);
  close(left, 20, 'wide box touches the left padding');
  close(right, 780, 'and the right padding');
  assert.ok(top >= 20 - 1e-9 && bottom <= 580 + 1e-9, 'fits vertically');
});

test('fit of a tall box is limited by the height', () => {
  const fitted = fitBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 100000 }, size, 0, {});
  close(fitted.scale, 600 / 100000, 'scale');
});

test('fit of a single point uses the closest zoom allowed', () => {
  const fitted = fitBounds({ minX: 5, minY: 7, maxX: 5, maxY: 7 }, size, 24, { minSpan: 500 });
  assert.deepEqual([fitted.cx, fitted.cy], [5, 7]);
  close(size.width / fitted.scale, 500, 'span');
});

test('fit respects maxSpan for a very long flight', () => {
  const fitted = fitBounds({ minX: 0, minY: 0, maxX: 1e7, maxY: 10 }, size, 0, { maxSpan: 300000 });
  close(size.width / fitted.scale, 300000, 'span');
});

test('the visible bounds are the world corners of the screen', () => {
  const view = { cx: 1000, cy: -500, scale: 0.5 };
  const b = visibleBounds(view, size);
  close(b.minX, 1000 - 400 / 0.5, 'minX');
  close(b.maxX, 1000 + 400 / 0.5, 'maxX');
  close(b.minY, -500 - 300 / 0.5, 'minY (south)');
  close(b.maxY, -500 + 300 / 0.5, 'maxY (north)');
});
