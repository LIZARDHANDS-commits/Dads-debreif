// The Turn Fight's remembered settings (SPEC-turn-fight, "The screen", "Number boxes"):
// V6's defaults, the ranges, and what comes back from browser storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULT_SETUP, createFight } from '../../../src/modules/turn-fight/sim.js';
import {
  DEFAULTS, FIGHT_KEYS, RANGES, ALLOWED, setupFrom, setupKey, saneFix, v6Defaults,
} from '../../../src/modules/turn-fight/state.js';

test('every setting opens at V6\'s value: 2-circle, 2 NM, 220 KTAS, 4 G, extras off, pitch 0°, height 2×, playback 1×', () => {
  assert.equal(DEFAULTS.circles, 2);
  assert.equal(DEFAULTS.separationNm, 2);
  assert.deepEqual([DEFAULTS.blueKt, DEFAULTS.redKt, DEFAULTS.blueG, DEFAULTS.redG], [220, 220, 4, 4]);
  assert.deepEqual([DEFAULTS.chase, DEFAULTS.vertical, DEFAULTS.energy], [false, false, false]);
  assert.deepEqual([DEFAULTS.bluePitchDeg, DEFAULTS.redPitchDeg], [0, 0]);
  assert.equal(DEFAULTS.heightScale, 2);
  assert.equal(DEFAULTS.playbackRate, 1);
});

test('the fight part of the defaults is exactly the engine\'s V6 setup', () => {
  assert.deepEqual(setupFrom(DEFAULTS), { ...V6_DEFAULT_SETUP });
});

test('the ranges are the spec\'s: speed 60-400 KTAS, G 1.1-9, separation 0.5-10 NM, pitch ±60°', () => {
  assert.deepEqual([RANGES.blueKt.min, RANGES.blueKt.max], [60, 400]);
  assert.deepEqual([RANGES.redKt.min, RANGES.redKt.max], [60, 400]);
  assert.deepEqual([RANGES.blueG.min, RANGES.blueG.max], [1.1, 9]);
  assert.deepEqual([RANGES.redG.min, RANGES.redG.max], [1.1, 9]);
  assert.deepEqual([RANGES.separationNm.min, RANGES.separationNm.max], [0.5, 10]);
  assert.deepEqual([RANGES.bluePitchDeg.min, RANGES.bluePitchDeg.max], [-60, 60]);
  assert.deepEqual([RANGES.redPitchDeg.min, RANGES.redPitchDeg.max], [-60, 60]);
});

test('every default is inside its own range, so the fight plays straight away', () => {
  for (const [key, { min, max }] of Object.entries(RANGES)) assert.ok(DEFAULTS[key] >= min && DEFAULTS[key] <= max, key);
  assert.doesNotThrow(() => createFight(setupFrom(DEFAULTS)));
});

test('choices are limited to the ones on screen', () => {
  assert.deepEqual(ALLOWED.circles, [1, 2]);
  assert.deepEqual(ALLOWED.heightScale, [1, 2, 4]);
  assert.deepEqual(ALLOWED.playbackRate, [0.5, 1, 2, 4]);
});

test('setupFrom picks only the fight\'s numbers; display settings are not part of it', () => {
  const s = setupFrom({ ...DEFAULTS, blueKt: 250, heightScale: 4, playbackRate: 2, setupOpen: false });
  assert.equal(s.blueKt, 250);
  assert.deepEqual(Object.keys(s).sort(), Object.keys(V6_DEFAULT_SETUP).sort());
});

test('changing the setup changes its key; playback speed, height scale and column state do not (#20)', () => {
  const base = setupKey(DEFAULTS);
  for (const change of [{ circles: 1 }, { separationNm: 3 }, { blueKt: 230 }, { redKt: 230 }, { blueG: 5 }, { redG: 5 },
    { chase: true }, { vertical: true }, { bluePitchDeg: 10 }, { redPitchDeg: -10 }]) {
    assert.notEqual(setupKey({ ...DEFAULTS, ...change }), base, JSON.stringify(change));
  }
  for (const change of [{ heightScale: 4 }, { heightScale: 1 }, { playbackRate: 4 }, { setupOpen: false }, { resultOpen: false }]) {
    assert.equal(setupKey({ ...DEFAULTS, ...change }), base, JSON.stringify(change));
  }
});

test('Reset to V6 defaults puts back the fight, Energy and the display settings, not the open columns', () => {
  const patch = v6Defaults();
  for (const key of ['circles', 'separationNm', 'blueKt', 'redKt', 'blueG', 'redG', 'chase', 'vertical', 'bluePitchDeg', 'redPitchDeg', 'energy', 'heightScale', 'playbackRate']) {
    assert.equal(patch[key], DEFAULTS[key], key);
  }
  assert.ok(!('setupOpen' in patch) && !('resultOpen' in patch));
  assert.ok(FIGHT_KEYS.every((k) => k in DEFAULTS));
});

test('a saved number outside its range is put back to the default; good ones stay', () => {
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKt: 500, redG: 0.2, separationNm: 11, bluePitchDeg: 61, redKt: 100 }), {
    blueKt: 220, redG: 4, separationNm: 2, bluePitchDeg: 0,
  });
  assert.deepEqual(saneFix(DEFAULTS), {});
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKt: 60, blueG: 9, separationNm: 0.5, redPitchDeg: -60 }), {});
});
