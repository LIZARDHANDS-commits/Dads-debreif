// The 3D view's flat labels for a ship in a GPS gap (D32): its number and
// "GPS gap", never a bank, pitch or height, since the position there is a guess.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelShip, drawMarker } from '../../../src/modules/debrief/view3d/overlay.js';
import { recordingContext } from './view3d-harness.js';

const P = (p) => ({ x: p.x, y: p.y });
const on = { attLabels3d: true, planeSize3d: 240 };
const ship = (extra) => ({ slot: 2, x: 100, y: 200, altFt: 5000, hdg: 1, bankDeg: 40, pitchDeg: 8, inGap: false, ...extra });
const words = (ctx) => ctx.texts.map((t) => t.text);

test('labelShip: a ship in a gap gets its number and "GPS gap" where the attitude went', () => {
  const ctx = recordingContext();
  labelShip(ctx, { x: 100, y: 200 }, ship({ inGap: true }), on);
  const filled = ctx.texts.filter((t) => t.kind === 'fillText').map((t) => t.text);
  assert.deepEqual(filled, ['#2', 'GPS gap']);
  assert.ok(!words(ctx).some((s) => /bank|pitch|ft/.test(s)));
});

test('labelShip: the gap says so even with attitude labels off, and for a ship with no heading', () => {
  for (const extra of [{ inGap: true, hdg: null }, { inGap: true }]) {
    const ctx = recordingContext();
    labelShip(ctx, { x: 0, y: 0 }, ship(extra), { ...on, attLabels3d: false });
    assert.equal(words(ctx).filter((s) => s === 'GPS gap').length, 2); // one stroke, one fill
  }
});

test('labelShip: a ship with GPS still shows its attitude', () => {
  const ctx = recordingContext();
  labelShip(ctx, { x: 0, y: 0 }, ship(), on);
  assert.ok(words(ctx).some((s) => s.startsWith('bank 40° L, pitch +8°')));
  assert.ok(!words(ctx).includes('GPS gap'));
});

test('drawMarker: a hollow marker for a gap ship, labelled once, with no numbers', () => {
  const ctx = recordingContext();
  drawMarker(ctx, P, ship({ inGap: true }), on);
  const filled = ctx.texts.filter((t) => t.kind === 'fillText').map((t) => t.text);
  assert.deepEqual(filled, ['#2', 'GPS gap']);
  assert.ok(!words(ctx).some((s) => /bank|pitch|ft/i.test(s)));
  assert.ok(!ctx.calls.includes('fill'), 'hollow: outlined, not filled');
});
