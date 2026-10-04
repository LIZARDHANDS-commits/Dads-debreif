// Checks: the 3D extra viewpoints (Top-down, Tower, Cockpit, Padlock) give finite numbers and look the right
//   way, and the camera bar's Camera menu, Follow menu and High/Performance switch call back as wired.
// Serves: TR-R23.
// Expected values: compass bearings worked out in the test with atan2 for a made-up left downwind aircraft;
//   the 10 degree margin is the file's own (shared table is 5), no reason written; menu words typed in (design
//   choice).

// The 3D view's extra viewpoints (camera-views.js) and its little bar (camera-bar.js): every view gives finite
// numbers and looks roughly the right way (within 10 degrees), and the bar's menus and switch call back as wired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom-extras.js';
import {
  lookAt, topDownCamera, towerCamera, cockpitCamera, padlockCamera, TOWER_FT, RWY_29L_THRESHOLD, CAMERA_VIEWS, NEEDS_AIRCRAFT,
} from '../../../src/modules/traffic/camera-views.js';
import { createCameraBar } from '../../../src/modules/traffic/camera-bar.js';
import { povCamera } from '../../../src/modules/traffic/view3d.js';

installFakeDom();

const size = { width: 900, height: 600 };
const FLOOR = 1892;
const bearing = (from, to) => (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
const angleOff = (a, b) => Math.abs(((((a - b) + 180) % 360) + 360) % 360 - 180);
const allFinite = (v) => [v.center.x, v.center.y, v.center.z, v.cam.yawDeg, v.cam.pitchDeg, v.cam.zoom, v.cam.altScale].every(Number.isFinite);
// An aircraft on a left downwind for 29L, about a mile abeam, heading 118.
const downwind = { id: 'H1', x: -2000, y: 5000, alt: 2900, headingDeg: 118 };

test('lookAt gives a compass bearing and looks down at something below', () => {
  const east = lookAt({ x: 0, y: 0, alt: 1000 }, { x: 1000, y: 0, alt: 1000 });
  assert.ok(angleOff(east.yawDeg, 90) < 10);
  assert.ok(Math.abs(east.pitchDeg - 85) < 10, 'level is clamped to the top limit');
  const below = lookAt({ x: 0, y: 0, alt: 2000 }, { x: 0, y: 1000, alt: 1000 });
  assert.ok(Math.abs(below.pitchDeg - 45) < 10, '45 degrees below level is pitch 45');
});

test('Top-down looks straight down, north up, centred on the box', () => {
  const v = topDownCamera({ minX: -1000, maxX: 1000, minY: -500, maxY: 500, minZ: 1900, maxZ: 3500 }, size);
  assert.ok(allFinite(v));
  assert.equal(v.cam.pitchDeg, 0);
  assert.equal(v.cam.yawDeg, 0);
  assert.ok(Math.abs(v.center.x) < 20 && Math.abs(v.center.y) < 20);
});

test('Tower looks from the cab at the followed aircraft, or at the 29L threshold with none', () => {
  const v = towerCamera(downwind, size, FLOOR);
  assert.ok(allFinite(v));
  assert.ok(angleOff(v.cam.yawDeg, bearing(TOWER_FT, downwind)) < 10);
  assert.ok(Math.hypot(v.center.x - downwind.x, v.center.y - downwind.y) < 100);
  const empty = towerCamera(null, size, FLOOR);
  assert.ok(allFinite(empty));
  assert.ok(angleOff(empty.cam.yawDeg, bearing(TOWER_FT, RWY_29L_THRESHOLD)) < 10);
  assert.ok(empty.cam.pitchDeg > 70, 'the threshold is a long way off and nearly level from the cab');
});

test('Cockpit looks along the heading, nearly level, ahead of the nose', () => {
  const v = cockpitCamera(downwind, size);
  assert.ok(allFinite(v));
  assert.ok(angleOff(v.cam.yawDeg, downwind.headingDeg) < 10);
  assert.ok(v.cam.pitchDeg > 75);
  assert.ok(angleOff(bearing(downwind, v.center), downwind.headingDeg) < 10, 'the centre is ahead of the aircraft');
});

test('Padlock looks from the aircraft at the 29L threshold, with both in the picture', () => {
  const v = padlockCamera(downwind, size);
  assert.ok(allFinite(v));
  assert.ok(angleOff(v.cam.yawDeg, bearing(downwind, RWY_29L_THRESHOLD)) < 10);
  assert.ok(v.cam.pitchDeg < 85 && v.cam.pitchDeg > 45, 'looking down toward the field');
});

test('povCamera picks the view, and Tower is the only one that works without an aircraft', () => {
  assert.ok(allFinite(povCamera('tower', null, size, FLOOR)));
  assert.ok(angleOff(povCamera('cockpit', downwind, size, FLOOR).cam.yawDeg, 118) < 10);
  assert.deepEqual([...NEEDS_AIRCRAFT].sort(), ['cockpit', 'padlock']);
  assert.deepEqual(CAMERA_VIEWS.map((v) => v.id), ['field', 'fit', 'high', 'top', 'tower', 'low', 'cockpit', 'padlock']);
});

// ---- the bar ----
const all = (root, ok) => [root, ...(root.childNodes ?? []).flatMap((c) => (c.childNodes ? all(c, ok) : []))].filter(ok);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const words = (n) => n.textContent.replace(/\s+/g, ' ').trim();

function makeBar() {
  const calls = { view: [], follow: [], quality: [] };
  const bar = createCameraBar({ onView: (id) => calls.view.push(id), onFollow: (id) => calls.follow.push(id), onQuality: (q) => calls.quality.push(q) });
  return { bar, calls };
}
const labelled = (bar, text) => {
  const label = tagged(bar.element, 'LABEL').find((l) => words(l) === text);
  assert.ok(label, `a "${text}" label`);
  return tagged(bar.element, 'SELECT').find((s) => s.id === label.getAttribute('for'));
};

test('the Camera menu lists every view and calls back with the one chosen', () => {
  const { bar, calls } = makeBar();
  const camera = labelled(bar, 'Camera');
  assert.deepEqual(tagged(camera, 'OPTION').map(words), ['Over the field', 'Fit', 'High look-down', 'Top-down', 'Tower', 'Chase', 'Cockpit', 'Padlock (runway)']);
  camera.value = 'tower';
  camera.dispatch('change');
  assert.deepEqual(calls.view, ['tower']);
  bar.dispose();
});

test('the Follow menu lists the aircraft flying, refreshes as they come and go, and calls back', () => {
  const { bar, calls } = makeBar();
  const follow = labelled(bar, 'Follow');
  bar.update({ flying: ['H1', 'H2'], followId: null, quality: 'low' });
  assert.deepEqual(tagged(follow, 'OPTION').map(words), ['None', 'H1', 'H2']);
  bar.update({ flying: ['H2', 'H3'], followId: 'H3', quality: 'low' });
  assert.deepEqual(tagged(follow, 'OPTION').map(words), ['None', 'H2', 'H3']);
  assert.equal(follow.value, 'H3');
  follow.value = 'H2';
  follow.dispatch('change');
  follow.value = '';
  follow.dispatch('change');
  assert.deepEqual(calls.follow, ['H2', null]);
  bar.dispose();
});

test('the High | Performance switch shows the setting with aria-pressed and calls back on click', () => {
  const { bar, calls } = makeBar();
  const buttons = tagged(bar.element, 'BUTTON');
  assert.deepEqual(buttons.map(words), ['High', 'Performance']);
  bar.update({ flying: [], quality: 'low' });
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);
  buttons[0].dispatch('click');
  assert.deepEqual(calls.quality, ['high']);
  bar.update({ flying: [], quality: 'high' });
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['true', 'false']);
  bar.dispose();
  buttons[1].dispatch('click');
  assert.deepEqual(calls.quality, ['high'], 'no callbacks after dispose');
});
