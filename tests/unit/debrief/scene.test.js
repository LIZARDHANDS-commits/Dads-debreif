// Patrick's rule for "level" (item G, option 1): recorded G sets the 3D bank
// only when the nose is within 10° of the horizon and the heading is changing
// by more than 1° a second. Recorded bank still wins (D47).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bankFromTrack, LEVEL_PITCH_DEG, LEVEL_TURN_DEG_PER_S } from '../../../src/modules/debrief/view3d/scene.js';

const acosDeg = (g) => (Math.acos(1 / g) * 180) / Math.PI;

/** A steady turn at `kt` turning `degPerS` (left when positive), sampled a second apart. */
function turn(kt, degPerS) {
  const v = kt * 1.68781, w = (degPerS * Math.PI) / 180;
  const at = (t) => (w === 0
    ? { t, x: v * t, y: 0 }
    : { t, x: (v / w) * Math.sin(w * t), y: (v / w) * (1 - Math.cos(w * t)) });
  return { before: at(9), now: at(10), after: at(11), speedKt: kt };
}

test('the thresholds are the ones Patrick picked', () => {
  assert.equal(LEVEL_PITCH_DEG, 10);
  assert.equal(LEVEL_TURN_DEG_PER_S, 1);
});

test('in a level turn, recorded G sets the bank as acos(1/G), on the turning side', () => {
  const left = bankFromTrack({ ...turn(200, 10), pitchDeg: 2, recordedG: 3.5 });
  assert.ok(Math.abs(left.bankDeg - acosDeg(3.5)) < 1e-9);
  assert.equal(left.source, 'estimated');
  const right = bankFromTrack({ ...turn(200, -10), pitchDeg: -9.9, recordedG: 3.5 });
  assert.ok(Math.abs(right.bankDeg + acosDeg(3.5)) < 1e-9);
  assert.ok(Math.abs(bankFromTrack({ ...turn(200, 10), pitchDeg: 10, recordedG: 3.5 }).bankDeg - acosDeg(3.5)) < 1e-9);
  assert.ok(Math.abs(bankFromTrack({ ...turn(200, 10), pitchDeg: 0, recordedG: -3.5 }).bankDeg - acosDeg(3.5)) < 1e-9);
});

test('nose more than 10° from the horizon: the bank comes from the turn rate, not G', () => {
  const byRate = bankFromTrack(turn(200, 10));
  for (const pitchDeg of [10.1, 30, -45]) {
    assert.deepEqual(bankFromTrack({ ...turn(200, 10), pitchDeg, recordedG: 4 }), byRate);
  }
});

test('heading changing by 1° a second or less: G is not used, so a wings-level pull stays level', () => {
  assert.deepEqual(bankFromTrack({ ...turn(200, 0), pitchDeg: 0, recordedG: 3 }), { bankDeg: 0, source: 'estimated' });
  assert.deepEqual(bankFromTrack({ ...turn(200, 1), pitchDeg: 0, recordedG: 3 }), bankFromTrack(turn(200, 1)));
  assert.ok(Math.abs(bankFromTrack({ ...turn(200, 1.2), pitchDeg: 0, recordedG: 3 }).bankDeg - acosDeg(3)) < 1e-9);
});

test('no G to use: unknown pitch, G at or below 1.01, no G, or too slow', () => {
  const byRate = bankFromTrack(turn(200, 10));
  assert.deepEqual(bankFromTrack({ ...turn(200, 10), recordedG: 4 }), byRate);
  assert.deepEqual(bankFromTrack({ ...turn(200, 10), pitchDeg: 0, recordedG: 1.01 }), byRate);
  assert.deepEqual(bankFromTrack({ ...turn(200, 10), pitchDeg: 0, recordedG: null }), byRate);
  assert.deepEqual(bankFromTrack({ ...turn(10, 20), pitchDeg: 0, recordedG: 2 }), { bankDeg: 0, source: 'estimated' });
});

test('recorded bank still wins over recorded G (D47)', () => {
  assert.deepEqual(bankFromTrack({ ...turn(200, 10), pitchDeg: 0, recordedG: 4, recordedBankDeg: 20 }), { bankDeg: -20, source: 'recorded' });
});
