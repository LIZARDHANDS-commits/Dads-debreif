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

// The map layers' places, checked against what each layer is defined to be, worked out in the test (DB-R14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONE, trailRuns, spacingPairs, line39, coneOutlines,
} from '../../../src/modules/debrief/map2d/geometry.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);
const fix = (t) => ({ t, xFt: t, yFt: 0 });
// Fixes every second from 0 to 200 s, with a GPS gap from 100 s to 110 s.
const fixes = [...Array.from({ length: 101 }, (_, i) => fix(i)), ...Array.from({ length: 91 }, (_, i) => fix(110 + i))];
const times = (runs) => runs.map((r) => [r[0].t, r.at(-1).t]);

test('trails: full, history up to now, or the last 60 s, and never a line across a GPS gap', () => {
  // The three trail modes are the spec's ("trail modes (full, history, last 60 s)", docs/modules/debrief/spec.md, 2D map).
  // Full is every fix, history stops at the moment shown, and the last-60-s trail starts 60 s before it.
  const flat = (runs) => runs.flat().map((f) => f.t);
  const allTimes = fixes.map((f) => f.t);
  assert.deepEqual(flat(trailRuns(fixes, 'full', 50)), allTimes);
  for (const now of [50, 100, 105, 150.5, 175]) {
    const history = flat(trailRuns(fixes, 'history', now));
    assert.deepEqual(history, allTimes.filter((t) => t <= now), `history at ${now}`);
    const last60 = flat(trailRuns(fixes, 'window', now));
    assert.deepEqual(last60, allTimes.filter((t) => t >= now - 60 && t <= now), `last 60 s at ${now}`);
  }
  assert.deepEqual(trailRuns(fixes, 'history', -5), []); // before the flight starts: nothing to draw
  // The recording has a 10 s hole (100 s to 110 s). DB-R4: no line is drawn across a long gap, so no drawn run
  // holds two fixes more than 5 s apart (the debrief's GPS-gap rule, DB-R4), in any mode, at any moment.
  for (const mode of ['full', 'history', 'window']) {
    for (const now of [50, 100, 105, 110, 150, 175, 200]) {
      for (const run of trailRuns(fixes, mode, now)) {
        for (let i = 1; i < run.length; i++) assert.ok(run[i].t - run[i - 1].t <= 5, `${mode} at ${now}: ${run[i - 1].t} to ${run[i].t}`);
      }
    }
  }
  // The full trail is in two pieces, one each side of the hole.
  assert.deepEqual(times(trailRuns(fixes, 'full', 50)), [[0, 100], [110, 200]]);
});

test('spacing lines: every pair, horizontal feet, no number while either ship is in a gap', () => {
  const ships = [
    { slot: 2, xFt: 3000, yFt: 4000 },
    { slot: 1, xFt: 0, yFt: 0 },
    { slot: 3, xFt: 0, yFt: 0, inGap: true },
  ];
  assert.deepEqual(spacingPairs(ships).map((p) => [p.a.slot, p.b.slot, p.ft]), [[1, 2, 5000], [1, 3, null], [2, 3, null]]);
});

test('3/9 line: through the ship and square to its heading, running off the map both ways; none without a heading', () => {
  // The 3/9 line joins the 3 o'clock and 9 o'clock positions, so it is at 90° to the nose through the ship (SMM 16.18 para 49).
  const ship = { xFt: 10, yFt: 20 };
  for (const headingDeg of [0, 30, 90, 137, 180, 250, 315]) {
    const hdg = (headingDeg * Math.PI) / 180;
    const [a, b] = line39(ship, hdg);
    const along = [Math.cos(hdg), Math.sin(hdg)]; // the nose
    const line = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(...line);
    assert.ok(Math.abs(line[0] * along[0] + line[1] * along[1]) / length < 1e-9, `square to the nose at ${headingDeg}°`);
    assert.ok(Math.abs((a[0] + b[0]) / 2 - ship.xFt) < 1e-6 && Math.abs((a[1] + b[1]) / 2 - ship.yFt) < 1e-6, 'centred on the ship');
    // Long enough to leave any map view: the widest is about 50 NM (docs/modules/debrief/spec.md, 2D map).
    assert.ok(length >= 50 * 6076, `${length} ft`);
  }
  assert.equal(line39({ xFt: 0, yFt: 0 }, null), null);
});

test('fighting-wing cone: windows 500 to 1,000 ft behind Lead, 30° to 60° off its tail, one each side', () => {
  // The cone's size is EFIG p.391 (docs/modules/debrief/requirements.md, "Fighting Wing Cone"): 500 to 1,000 ft, 30 to 60°.
  assert.deepEqual({ ...CONE }, { innerFt: 500, outerFt: 1000, fromDeg: 30, toDeg: 60 });
  const lead = { xFt: 3000, yFt: -2000 };
  for (const headingDeg of [0, 90, 215]) {
    const hdg = (headingDeg * Math.PI) / 180;
    const tail = [-Math.cos(hdg), -Math.sin(hdg)];
    const sides = coneOutlines(lead, hdg);
    assert.equal(sides.length, 2);
    const turnedFromTail = []; // signed angle of each point off the tail: positive is counter-clockwise
    for (const side of sides) {
      const angles = [];
      for (const [px, py] of side.points) {
        const x = px - lead.xFt;
        const y = py - lead.yFt;
        const r = Math.hypot(x, y);
        assert.ok(r > 500 - 1e-6 && r < 1000 + 1e-6, `${r} ft out`);
        const off = Math.atan2(tail[0] * y - tail[1] * x, tail[0] * x + tail[1] * y) * (180 / Math.PI);
        angles.push(off);
        assert.ok(Math.abs(off) > 30 - 1e-6 && Math.abs(off) < 60 + 1e-6, `${off}° off the tail`);
      }
      assert.ok(angles.every((a) => Math.sign(a) === Math.sign(angles[0])), 'a window stays on one side of the tail');
      // The window opens over the full 30° to 60° and its distances over the full 500 to 1,000 ft.
      assert.ok(Math.abs(Math.min(...angles.map(Math.abs)) - 30) < 1e-6 && Math.abs(Math.max(...angles.map(Math.abs)) - 60) < 1e-6);
      const radii = side.points.map(([px, py]) => Math.hypot(px - lead.xFt, py - lead.yFt));
      assert.ok(Math.abs(Math.min(...radii) - 500) < 1e-6 && Math.abs(Math.max(...radii) - 1000) < 1e-6);
      turnedFromTail.push(Math.sign(angles[0]));
    }
    assert.deepEqual(turnedFromTail.sort(), [-1, 1]); // one window each side of the tail
    for (const side of sides) { // the label sits inside its own window, in the middle
      const r = Math.hypot(side.labelAt[0] - lead.xFt, side.labelAt[1] - lead.yFt);
      assert.ok(r > 500 && r < 1000);
    }
  }
  assert.equal(coneOutlines({ xFt: 0, yFt: 0 }, null), null); // a parked Lead has no cone (DB-R4)
});

test('a route lands in the map\'s feet', async () => {
  const { projectRoute, routeBounds } = await import('../../../src/modules/debrief/map2d/overlays.js');
  const { makeLocalRef, latLonToLocalFt } = await import('../../../src/core/geo.js');
  const route = { name: 'R', paths: [[[-105.5, 50.3], [-105.4, 50.4]]] };
  const ref = makeLocalRef(50, -105.6);
  const onFlight = projectRoute(route, ref);
  const { x, y } = latLonToLocalFt(ref, 50.4, -105.4);
  assert.deepEqual(onFlight.paths[0][1], [x, y]);
  const box = routeBounds(onFlight);
  assert.ok(box.minX < box.maxX && box.minY < box.maxY);
});
