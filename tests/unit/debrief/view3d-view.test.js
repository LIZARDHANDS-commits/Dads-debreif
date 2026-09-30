// The 3D view run in Node with a fake renderer: what it draws for a ship in a
// GPS gap (D32), and how it looks after its WebGL side (materials, size, teardown).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createView3d } from '../../../src/modules/debrief/view3d/view.js';
import { shipsIn3d } from '../../../src/modules/debrief/view3d/frame.js';
import { viewKit, exampleFlight, installFakeDocument, drawn, FakeRenderer } from './view3d-harness.js';

/** Opens a view on `flight` at time `t`, lets three "load" and draws once. */
async function open({ settings = {}, flight, t }) {
  const restore = installFakeDocument();
  const kit = await viewKit(settings);
  FakeRenderer.all.length = 0;
  const time = { t };
  const view = createView3d(kit.canvas, {
    timers: kit.timers, flight: () => flight, time: () => time.t, settings: () => kit.state, fieldFt: () => 0,
    setCamera() {}, loadThree: () => Promise.resolve(kit.THREE), onUnavailable(m) { throw new Error(m); },
  });
  const settle = async () => {
    kit.timers.flush();
    await Promise.resolve();
    await Promise.resolve();
    kit.timers.flush();
  };
  await settle();
  return { ...kit, view, time, settle, renderer: () => FakeRenderer.all[0], close() { view.dispose(); restore(); } };
}

const START_S = 40 * 60; // a while into the example flight, when all four are flying

test('a ship in a GPS gap shows no bank, pitch or height in 3D (D32)', async () => {
  const at = (await exampleFlight()).startT + START_S;
  const flight = await exampleFlight(2, at - 10, at + 20);
  const t = at + 5;
  assert.ok(shipsIn3d(flight, t).find((s) => s.slot === 2).inGap, 'the set-up has ship 2 in a gap');
  const k = await open({ flight, t });
  try {
    const text = drawn(k.ctx);
    assert.equal(text.filter((s) => s === 'GPS gap').length, 1);
    assert.ok(text.includes('#2'));
    // The three ships still in GPS carry bank, pitch and stick heights; the gap ship none.
    assert.equal(text.filter((s) => s.startsWith('bank ')).length, 3);
    assert.equal(text.filter((s) => /ft above datum$/.test(s)).length, 3);
    // In the picture: three height sticks and three Harvard models; the gap ship's is the hollow marker.
    const world = k.renderer().scene.children.find((o) => o.type === 'Group' && o.children.length);
    assert.equal(world.children.filter((o) => o.geometry?.type === 'CylinderGeometry').length, 3);
    assert.equal(k.renderer().scene.children.filter((o) => o.visible && o.type === 'Group' && o !== world).length, 3);
  } finally {
    k.close();
  }
});
