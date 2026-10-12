// Checks: at full right stick, full back stick, full right pedal and landing flap, each flight surface turns about its
//   own hinge (its front edge stays where it was, so no gap opens and nothing swings through the wing or tail) and its
//   trailing edge goes the way a pilot expects: right aileron up, left aileron down, elevators up, rudder right, flaps
//   down.
// Serves: ALL-35 (the CT-156's moving flight surfaces).
// Expected values: the directions are the stick's and pedals' (ailerons 20° up and 11° down, Patrick, 12 Oct 2026); the
//   front edges are each surface's own as drawn neutral, so the test needs no number from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// A stand-in for the browser's document: the model draws its decals on canvases, which the test doesn't need.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 0 }) : noop), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.Path2D ??= class {};
const { createCt156Model, setControls, CT156_LENGTH_FT } = await import('../../../src/ui-kit/ct156-model.js');

/** Every corner of the meshes under obj, in the world (feet). */
function corners(obj) {
  obj.updateWorldMatrix(true, true);
  const out = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld));
  });
  return out;
}

/** The indices of a surface's front edge, neutral: the corners with nothing within 0.25 ft along `span` more than
 * 0.05 ft further forward (a swept hinge line moves forward less than that over 0.25 ft). */
function frontEdge(points, span) {
  const out = [];
  points.forEach((p, i) => {
    if (!points.some((q) => Math.abs(q[span] - p[span]) < 0.25 && q.x > p.x + 0.05)) out.push(i);
  });
  return out;
}

test('full stick, pedal and flap: every surface turns on its hinge, trailing edges the right way', () => {
  const ship = createCt156Model(THREE, { color: '#c03030', number: 1, lengthFt: CT156_LENGTH_FT });
  const s = ship.userData.ct156.surfaces;
  const elevatorHalf = Math.max(...corners(s.elevator).map((p) => Math.abs(p.y)));
  const surfaces = {
    'left aileron': { obj: s.sides[0].aileron, span: 'y', te: (p) => -p.z, way: 'down' },
    'right aileron': { obj: s.sides[1].aileron, span: 'y', te: (p) => p.z, way: 'up' },
    'left inboard flap': { obj: s.sides[0].flaps[0], span: 'y', te: (p) => -p.z, way: 'down' },
    'right outboard flap': { obj: s.sides[1].flaps[1], span: 'y', te: (p) => -p.z, way: 'down' },
    // The front edge inboard of the horn balances, which sit ahead of the hinge and so move with the elevator.
    elevators: { obj: s.elevator, span: 'y', te: (p) => p.z, way: 'up', keep: (p) => Math.abs(p.y) < 0.6 * elevatorHalf },
    rudder: { obj: s.rudder, span: 'z', te: (p) => -p.y, way: 'right' },
  };
  const before = Object.fromEntries(Object.entries(surfaces).map(([name, d]) => [name, corners(d.obj)]));
  setControls(ship, { roll: 1, pitch: 1, yaw: 1, flaps: 'LDG' });
  for (const [name, d] of Object.entries(surfaces)) {
    const was = before[name], now = corners(d.obj);
    const edge = frontEdge(was, d.span).filter((i) => !d.keep || d.keep(was[i]));
    assert.ok(edge.length > 3, `${name}: no front edge found`);
    // Within an inch: a front edge that moved further would open a gap or swing into the wing or tail.
    const moved = Math.max(...edge.map((i) => now[i].distanceTo(was[i])));
    assert.ok(moved < 0.1, `${name}: front edge moved ${moved.toFixed(2)} ft off its hinge`);
    // The trailing edge: the corner furthest aft, which moves the most.
    const aft = was.reduce((k, p, i) => (p.x < was[k].x ? i : k), 0);
    assert.ok(d.te(now[aft]) - d.te(was[aft]) > 0.1, `${name}: trailing edge didn't go ${d.way}`);
  }
});
