// Dragging an aircraft before Play is stored as its position error, so the engine starts it where it was dropped (task 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings } from '../../../src/modules/turn-sim/settings.js';
import { startPositions } from '../../../src/modules/turn-sim/engine/formation.js';
import { positionErrorFor, nudgeSettings, startOf } from '../../../src/modules/turn-sim/drag.js';

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
