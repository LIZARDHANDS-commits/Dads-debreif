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

// The 3D view's plain values: camera moves, ship attitude, datum and ground grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { V6_CAMERA, projectPoint } from '../../../src/modules/debrief/view3d/scene.js';
import {
  orbit, wheelZoom, shipsIn3d, groundDatumFt, heightLabel, groundGrid, GROUND_GRID_FT,
} from '../../../src/modules/debrief/view3d/frame.js';

const fromRepo = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

// Where a world point lands on a 1,280 x 720 canvas, through the 3D view's own projection (scene.js).
const CANVAS = { width: 1280, height: 720 };
const CENTRE = { x: 0, y: 0, z: 0 };
const screenOf = (point, camera) => projectPoint(point, CENTRE, camera, CANVAS);
// Screen pixels per 10,000 ft along the ground, measured from the picture, not from the zoom number.
const pixelsPer10kFt = (zoom) => screenOf({ x: 10_000, y: 0, altFt: 0 }, { ...V6_CAMERA, yawDeg: 0, zoom }).x - CANVAS.width / 2;

test('dragging turns the view the way the mouse moves: the near side follows the pointer, and it never flips over', () => {
  // Two ground points, one nearer the viewer than the view's centre and one farther (smaller depth is nearer).
  const near = { x: 10_000, y: 0, altFt: 0 };
  const far = { x: -10_000, y: 0, altFt: 0 };
  assert.ok(screenOf(near, V6_CAMERA).depth < 0 && screenOf(far, V6_CAMERA).depth > 0, 'test setup: near is nearer');
  // Drag right: what is near moves right on the screen, what is far moves left.
  const right = orbit(V6_CAMERA, 100, 0);
  assert.ok(screenOf(near, right).x > screenOf(near, V6_CAMERA).x);
  assert.ok(screenOf(far, right).x < screenOf(far, V6_CAMERA).x);
  // Drag down: what is near moves down on the screen (y grows downward), what is far moves up.
  const down = orbit(V6_CAMERA, 0, 40);
  assert.ok(screenOf(near, down).y > screenOf(near, V6_CAMERA).y);
  assert.ok(screenOf(far, down).y < screenOf(far, V6_CAMERA).y);
  // Dragging the other way undoes it (right then left comes back to where it started).
  const back = orbit(orbit(V6_CAMERA, 100, 40), -100, -40);
  assert.ok(Math.abs(back.yawDeg - V6_CAMERA.yawDeg) < 1e-9 && Math.abs(back.pitchDeg - V6_CAMERA.pitchDeg) < 1e-9);
  // However far the mouse goes: the yaw stays within a full turn either side, and the pitch stays between
  // the horizon (0°) and straight down (90°), so the picture can't flip over.
  for (const [dx, dy] of [[10_000, 0], [-10_000, 0], [0, 10_000], [0, -10_000], [10_000, -10_000]]) {
    const cam = orbit(V6_CAMERA, dx, dy);
    assert.ok(Math.abs(cam.yawDeg) <= 180, `yaw ${cam.yawDeg}`);
    assert.ok(cam.pitchDeg > 0 && cam.pitchDeg < 90, `pitch ${cam.pitchDeg}`);
  }
  assert.equal(orbit(V6_CAMERA, 5, 5).zoom, V6_CAMERA.zoom); // a drag turns the view, it doesn't zoom it
});

test('the wheel zooms in and out, reaches a close formation view and a wide one, and stops at its limits', () => {
  assert.ok(wheelZoom(V6_CAMERA, -1).zoom > V6_CAMERA.zoom); // wheel forward: in
  assert.ok(wheelZoom(V6_CAMERA, 1).zoom < V6_CAMERA.zoom); // wheel back: out
  let closest = V6_CAMERA;
  let widest = V6_CAMERA;
  for (let i = 0; i < 200; i++) { closest = wheelZoom(closest, -1); widest = wheelZoom(widest, 1); }
  // It stops: another notch changes nothing.
  assert.equal(wheelZoom(closest, -1).zoom, closest.zoom);
  assert.equal(wheelZoom(widest, 1).zoom, widest.zoom);
  // Closest: a 4,000 ft spread (the narrow end of SMM 16.18 para 49's 4,000 to 6,000 ft) fills a good part of a 1,280 px
  // canvas; 400 px is a judgement of "close enough to read the formation", not a manual number.
  assert.ok((pixelsPer10kFt(closest.zoom) * 4000) / 10_000 >= 400);
  // Widest: the whole formation and the country round it, at least 20 NM (121,600 ft) across a 1,280 px canvas.
  // (The 2D map's Fit is what shows the whole sortie, about 39 NM for the example flight.)
  assert.ok((CANVAS.width / pixelsPer10kFt(widest.zoom)) * 10_000 >= 20 * 6076);
});

test('the datum is the ground the view stands on: under every ship, the field\'s height, or sea level', () => {
  // The spec's rule (docs/modules/debrief/spec.md, The 3D view: "ground reference with ground datum (lowest altitude
  // minus 500 ft, field elevation, or sea level)"). One worked example: lowest ship 5,000 ft, so 4,500 ft.
  assert.equal(groundDatumFt([{ altFt: 5000 }], 'min', 1892), 4500);
  // Whatever the ships do, the lowest-ship datum sits below all of them, but not far below the lowest, and a ship
  // with no altitude is ignored.
  const ships = [{ altFt: 5230 }, { altFt: 4980 }, { altFt: null }];
  const datum = groundDatumFt(ships, 'min', 1892);
  assert.ok(datum < 4980 && datum >= 4980 - 1000, `datum ${datum}`);
  assert.equal(groundDatumFt(ships, 'field', 1892), 1892);
  assert.equal(groundDatumFt(ships, 'zero', 1892), 0);
  assert.equal(groundDatumFt([], 'min', 1892), 0); // nothing to stand under: sea level
  // Only the field's datum is "above ground level"; the others say "above datum" (#27).
  assert.equal(heightLabel('field'), 'ft AGL');
  assert.equal(heightLabel('min'), 'ft above datum');
});

test('the ground grid sits on whole 5,000 ft lines, so it stays put as the formation moves (#27)', () => {
  const a = groundGrid({ x: 1234, y: -777 });
  const b = groundGrid({ x: 3234, y: 1223 });
  for (const g of [a, b]) assert.ok([...g.xs, ...g.ys].every((v) => v % GROUND_GRID_FT === 0));
  assert.ok(a.xs.includes(0) && b.xs.includes(0)); // the same line under both
  assert.ok(a.min.x <= 1234 - 70_000 && a.max.x >= 1234 + 70_000);
});

test('each ship\'s place and attitude come from the track, heading null when still', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const parked = shipsIn3d(flight, flight.startT);
  assert.equal(parked.length, 4);
  assert.equal(parked[0].hdg, null); // Lead on the ramp
  assert.ok(parked.every((s) => Number.isFinite(s.altFt)));
  const flying = shipsIn3d(flight, flight.startT + 40 * 60);
  assert.ok(flying.some((s) => s.hdg !== null));
  assert.ok(flying.every((s) => Number.isFinite(s.bankDeg) && Math.abs(s.bankDeg) <= 85));
  assert.deepEqual(shipsIn3d(null, 0), []);
});
