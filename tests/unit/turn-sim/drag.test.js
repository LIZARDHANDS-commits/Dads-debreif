// Dragging an aircraft before Play is stored as its position error, so the engine starts it where it was dropped (task 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings } from '../../../src/modules/turn-sim/settings.js';
import { startPositions } from '../../../src/modules/turn-sim/engine/formation.js';
import { positionErrorFor, nudgeSettings, startOf, MOVABLE_IDS, describePlacement, atLimit } from '../../../src/modules/turn-sim/drag.js';

const near = (a, b, why) => assert.ok(Math.abs(a - b) <= 1, `${why}: ${a} against ${b}`);

test('a dropped aircraft starts where it was dropped, in every formation, heading and for every aircraft', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox', 'twoShip']) {
    for (const startHeadingDeg of [0, 90, 225]) {
      for (const twoSide of ['left', 'right']) {
        const settings = { ...DEFAULTS, formation, startHeadingDeg, twoSide };
        for (const id of formation === 'twoShip' ? [1, 2] : [1, 2, 3, 4]) {
          const patch = positionErrorFor(settings, id, 2500, -4100);
          const after = startPositions({ ...settings, ...patch });
          const moved = after.find((a) => a.id === id);
          const label = `${formation} ${startHeadingDeg} ${twoSide} #${id}`;
          near(moved.xFt, 2500, label);
          near(moved.yFt, -4100, label);
          // The others do not move.
          for (const other of startPositions(settings).filter((a) => a.id !== id)) {
            const still = after.find((a) => a.id === other.id);
            assert.deepEqual([still.xFt, still.yFt], [other.xFt, other.yFt], `${label}: #${other.id} stays`);
          }
        }
      }
    }
  }
});

test('the patch is one the settings accept, and a drop on the slot itself is no error', () => {
  const patch = positionErrorFor(DEFAULTS, 2, 5000, 700);
  assert.deepEqual(Object.keys(patch).sort(), ['aircraft2.foreAftDir', 'aircraft2.foreAftFt', 'aircraft2.lateralDir', 'aircraft2.lateralFt', 'aircraft2.positionErrorOn']);
  const checked = checkSettings({ ...DEFAULTS, ...patch });
  for (const [key, value] of Object.entries(patch)) assert.equal(checked[key], value, key);
  const [x, y] = startOf(DEFAULTS, 2);
  const same = positionErrorFor(DEFAULTS, 2, x, y);
  assert.equal(same['aircraft2.lateralDir'], 'none');
  assert.equal(same['aircraft2.foreAftDir'], 'none');
});

test('a very long drag stops at the most a position error can be', () => {
  const patch = positionErrorFor(DEFAULTS, 2, 1e6, 1e6);
  assert.ok(patch['aircraft2.lateralFt'] <= 20000 && patch['aircraft2.foreAftFt'] <= 20000);
});

test('the keyboard nudge moves an aircraft by the step from where it starts now, and repeats add up', () => {
  let settings = { ...DEFAULTS, startHeadingDeg: 0 };
  const [x0, y0] = startOf(settings, 3);
  settings = { ...settings, ...nudgeSettings(settings, 3, 0, 100) };
  settings = { ...settings, ...nudgeSettings(settings, 3, -100, 0) };
  const [x, y] = startOf(settings, 3);
  near(x, x0 - 100, 'west');
  near(y, y0 + 100, 'north');
});

test('describePlacement says where an aircraft is put, in words: wide or tight, fore or aft, feet (audit yellow 2)', () => {
  const put = (lat, latFt, fa, faFt) => ({ ...DEFAULTS, 'aircraft3.positionErrorOn': true, 'aircraft3.lateralDir': lat, 'aircraft3.lateralFt': latFt, 'aircraft3.foreAftDir': fa, 'aircraft3.foreAftFt': faFt });
  assert.equal(describePlacement(put('wide', 300, 'aft', 100), 3), '#3 wide 300 ft, aft 100 ft');
  assert.equal(describePlacement(put('tight', 1500, 'none', 0), 3), '#3 tight 1,500 ft');
  assert.equal(describePlacement(put('none', 0, 'fore', 20000), 3), '#3 fore 20,000 ft');
  assert.equal(describePlacement(put('none', 0, 'none', 0), 3), '#3 in its slot');
  assert.equal(describePlacement({ ...put('wide', 300, 'aft', 100), 'aircraft3.positionErrorOn': false }, 3), '#3 in its slot');
});

test('atLimit is true when a move has been held at the 20,000 ft most (audit yellow 2)', () => {
  assert.equal(atLimit(positionErrorFor(DEFAULTS, 2, 900000, 0), 2), true);
  assert.equal(atLimit(positionErrorFor(DEFAULTS, 2, 100, 100), 2), false);
});

test('a position error is always whole feet, however the drag lands (audit note)', () => {
  const patch = positionErrorFor(DEFAULTS, 3, 1234.567, -987.654);
  for (const key of ['aircraft3.lateralFt', 'aircraft3.foreAftFt']) assert.equal(patch[key], Math.round(patch[key]), key);
});

test('Lead is never movable: only #2 to #4 can be placed', () => {
  assert.deepEqual([...MOVABLE_IDS], [2, 3, 4]);
});
