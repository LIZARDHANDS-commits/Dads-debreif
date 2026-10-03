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

// OPERATOR DIRECTIVE: If there is an issue with tests repeatedly failing, ASK THE OPERATOR what to do before trying to tweak the physics to make it work.
// The Turn Fight's remembered settings (SPEC-turn-fight, "The screen", "Number boxes"):
// V6's defaults, the ranges, and what comes back from browser storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULT_SETUP, createFight } from '../../../src/modules/turn-fight/sim.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../../src/ui-kit/controls.js';
import { PAINT_DEFAULT } from '../../../src/ui-kit/ct156-model.js';
import {
  DEFAULTS, FIGHT_KEYS, G_LABEL, RANGES, ALLOWED, setupFrom, setupKey, saneFix, v6Defaults,
  START_DEFAULTS, TACTICAL_PRESETS,
} from '../../../src/modules/turn-fight/state.js';

test('every setting opens at Harvard default: 2-circle, 1.2 NM, 220 KTAS, 5 G, BFM Energy on, pitch 0°, height 2×, playback 1×', () => {
  assert.equal(DEFAULTS.circles, 2);
  assert.equal(DEFAULTS.separationNm, 1.2);
  assert.deepEqual([DEFAULTS.blueKt, DEFAULTS.redKt, DEFAULTS.blueG, DEFAULTS.redG], [220, 220, 5, 5]);
  assert.deepEqual([DEFAULTS.chase, DEFAULTS.vertical, DEFAULTS.energy], [false, false, true]);
  assert.deepEqual([DEFAULTS.bluePitchDeg, DEFAULTS.redPitchDeg], [0, 0]);
  assert.equal(DEFAULTS.heightScale, 2);
  assert.equal(DEFAULTS.playbackRate, 1);
});

test('the fight part of the defaults is exactly the engine\'s V6 setup with re-baselined separation and ATA', () => {
  assert.deepEqual(setupFrom(DEFAULTS), { ...V6_DEFAULT_SETUP, ...START_DEFAULTS, separationNm: 1.2 });
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

test('the G box is labelled plain "G", not "Sustained G" (the T-6 cannot sustain every G at every speed)', () => {
  assert.equal(G_LABEL, 'G');
});

test('choices are limited to the ones on screen', () => {
  assert.deepEqual(ALLOWED.circles, [1, 2]);
  assert.deepEqual(ALLOWED.heightScale, [1, 2, 4]);
  assert.deepEqual(ALLOWED.playbackRate, [0.5, 1, 2, 4]);
  assert.deepEqual(ALLOWED.view, ['2d', '3d']);
  assert.deepEqual(ALLOWED.paint, ['harvard', 'ship']);
});

test('the view opens in 2D and the paint as a Harvard, and a saved value outside the choices is refused (2D/3D, D141)', () => {
  assert.equal(DEFAULTS.view, VIEW_DEFAULT);
  assert.equal(DEFAULTS.view, '2d');
  assert.equal(DEFAULTS.paint, PAINT_DEFAULT);
  assert.equal(DEFAULTS.paint, 'harvard');
  assert.deepEqual(ALLOWED.view, [...VIEW_ALLOWED]);
});

test('setupFrom picks only the fight\'s numbers; display settings are not part of it', () => {
  const s = setupFrom({ ...DEFAULTS, blueKt: 250, heightScale: 4, playbackRate: 2, setupOpen: false });
  assert.equal(s.blueKt, 250);
  assert.deepEqual(Object.keys(s).sort(), Object.keys({ ...V6_DEFAULT_SETUP, ...START_DEFAULTS }).sort());
});

test('changing the setup changes its key; playback speed, height scale and column state do not (#20)', () => {
  const simpleDefaults = { ...DEFAULTS, energy: false };
  const base = setupKey(simpleDefaults);
  for (const change of [{ circles: 1 }, { separationNm: 3 }, { blueKt: 230 }, { redKt: 230 }, { blueG: 6 }, { redG: 6 },
    { chase: true }, { vertical: true }, { bluePitchDeg: 10 }, { redPitchDeg: -10 },
    { startAtaDeg: 30 }, { startAaDeg: 90 }, { redAboveFt: 1000 }, { turnsAt: 'once' }]) {
    assert.notEqual(setupKey({ ...simpleDefaults, ...change }), base, JSON.stringify(change));
  }
  // Switching between 2D and 3D, or the paint, never starts the fight again.
  for (const change of [{ heightScale: 4 }, { heightScale: 1 }, { playbackRate: 4 }, { setupOpen: false }, { resultOpen: false }, { view: '3d' }, { paint: 'ship' }, { dataTags: false }]) {
    assert.equal(setupKey({ ...simpleDefaults, ...change }), base, JSON.stringify(change));
  }
});

test('Reset to V6 defaults puts back the fight, Energy and the display settings, not the open columns', () => {
  const patch = v6Defaults();
  for (const key of ['circles', 'separationNm', 'blueKt', 'redKt', 'blueG', 'redG', 'chase', 'vertical', 'bluePitchDeg', 'redPitchDeg',
    'startAtaDeg', 'startAtaSide', 'startAaDeg', 'startAaSide', 'redAboveFt', 'turnsAt', 'energy', 'heightScale', 'playbackRate', 'dataTags']) {
    assert.equal(patch[key], DEFAULTS[key], key);
  }

  assert.equal(patch.paint, 'harvard');
  assert.ok(!('setupOpen' in patch) && !('resultOpen' in patch));
  assert.ok(!('view' in patch), 'reset never switches the view');
  assert.ok(FIGHT_KEYS.every((k) => k in DEFAULTS));
});

test('a saved number outside its range is put back to the default; good ones stay', () => {
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKt: 500, redG: 0.2, separationNm: 11, bluePitchDeg: 61, redKt: 100 }), {
    blueKt: 220, redG: 5, separationNm: 1.2, bluePitchDeg: 0,
  });
  assert.deepEqual(saneFix(DEFAULTS), {});
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKt: 60, blueG: 9, separationNm: 0.5, redPitchDeg: -60 }), {});
});

// ── R28: start geometry and altitudes ────────────────────────────────────────

test('R28: the start geometry opens head-on, level, turns at the pass: ATA 5°, AA 180°, Red 0 ft above Blue', () => {
  assert.deepEqual(
    [DEFAULTS.startAtaDeg, DEFAULTS.startAtaSide, DEFAULTS.startAaDeg, DEFAULTS.startAaSide, DEFAULTS.redAboveFt, DEFAULTS.turnsAt],
    [5, 'left', 180, 'left', 0, 'pass'],
  );
  assert.deepEqual(Object.fromEntries(Object.keys(START_DEFAULTS).map((k) => [k, DEFAULTS[k]])), { ...START_DEFAULTS });
});

test('R28: the sides and the turn start are limited to the choices on screen', () => {
  assert.deepEqual(ALLOWED.startAtaSide, ['left', 'right']);
  assert.deepEqual(ALLOWED.startAaSide, ['left', 'right']);
  assert.deepEqual(ALLOWED.turnsAt, ['pass', 'once']);
});

test('R28: the start geometry\'s ranges are the spec\'s: ATA and AA 0 to 180°, Red above Blue -5,000 to +5,000 ft', () => {
  assert.deepEqual([RANGES.startAtaDeg.min, RANGES.startAtaDeg.max], [0, 180]);
  assert.deepEqual([RANGES.startAaDeg.min, RANGES.startAaDeg.max], [0, 180]);
  assert.deepEqual([RANGES.redAboveFt.min, RANGES.redAboveFt.max], [-5000, 5000]);
  assert.equal(RANGES.redAboveFt.unit, 'ft');
});

test('R28: the start geometry is part of the fight, so changing it starts the fight again', () => {
  for (const key of ['startAtaDeg', 'startAtaSide', 'startAaDeg', 'startAaSide', 'redAboveFt', 'turnsAt']) assert.ok(FIGHT_KEYS.includes(key), key);
  assert.doesNotThrow(() => createFight(setupFrom({ ...DEFAULTS, startAtaDeg: 180, startAaDeg: 0, redAboveFt: -5000, turnsAt: 'once' })));
});

test('R28: a saved start angle or height out of range is put back; good ones stay', () => {
  assert.deepEqual(saneFix({ ...DEFAULTS, startAtaDeg: 181, startAaDeg: -1, redAboveFt: 6000 }), { startAtaDeg: 5, startAaDeg: 180, redAboveFt: 0 });
  assert.deepEqual(saneFix({ ...DEFAULTS, startAtaDeg: 180, startAaDeg: 0, redAboveFt: -5000 }), {});
});

test('R28: Reset to V6 defaults puts the start back to head-on, level, turns at the pass', () => {
  const patch = v6Defaults();
  assert.deepEqual([patch.startAtaDeg, patch.startAaDeg, patch.redAboveFt, patch.turnsAt], [5, 180, 0, 'pass']);
});

test('TF3-4: a side means nothing at 0° or 180°, so flipping it does not change the setup key; at any other angle it does', () => {
  for (const [deg, key, side] of [[0, 'startAtaDeg', 'startAtaSide'], [180, 'startAtaDeg', 'startAtaSide'], [0, 'startAaDeg', 'startAaSide'], [180, 'startAaDeg', 'startAaSide']]) {
    const left = { ...DEFAULTS, [key]: deg, [side]: 'left' };
    const right = { ...DEFAULTS, [key]: deg, [side]: 'right' };
    assert.equal(setupKey(left), setupKey(right), `${key} ${deg}`);
    assert.equal(setupFrom(right)[side], 'left');
  }
  // The head-on start (ATA 0, AA 180) flips either side with no restart.
  assert.equal(setupKey({ ...DEFAULTS, startAtaDeg: 0, startAtaSide: 'right', startAaSide: 'right' }), setupKey({ ...DEFAULTS, startAtaDeg: 0 }));
  for (const [key, side] of [['startAtaDeg', 'startAtaSide'], ['startAaDeg', 'startAaSide']]) {
    for (const deg of [1, 90, 179]) {
      assert.notEqual(setupKey({ ...DEFAULTS, [key]: deg, [side]: 'left' }), setupKey({ ...DEFAULTS, [key]: deg, [side]: 'right' }), `${key} ${deg}`);
      assert.equal(setupFrom({ ...DEFAULTS, [key]: deg, [side]: 'right' })[side], 'right');
    }
  }
});

test('Task 24: 5 canonical tactical presets are defined with valid geometry and flight envelopes', () => {
  const expectedKeys = ['neutral-merge', 'offensive-perch', 'defensive-break', 'energy-vs-angles', 'radius-vs-rate'];
  assert.deepEqual(Object.keys(TACTICAL_PRESETS), expectedKeys);

  const neutral = TACTICAL_PRESETS['neutral-merge'];
  assert.equal(neutral.separationNm, 1.2);
  assert.equal(neutral.startAtaDeg, 5);
  assert.equal(neutral.startAaDeg, 175);
  assert.equal(neutral.blueKt, 250);
  assert.equal(neutral.redKt, 250);
  assert.equal(neutral.blueAltFt, 10000);
  assert.equal(neutral.redAltFt, 10000);

  const perch = TACTICAL_PRESETS['offensive-perch'];
  assert.equal(perch.separationNm, 1.0);
  assert.equal(perch.startAtaDeg, 0);
  assert.equal(perch.startAaDeg, 30);
  assert.equal(perch.blueKt, 220);
  assert.equal(perch.redKt, 180);
  assert.equal(perch.blueAltFt, 11000);
  assert.equal(perch.redAltFt, 10000);

  const defensive = TACTICAL_PRESETS['defensive-break'];
  assert.equal(defensive.separationNm, 0.5);
  assert.equal(defensive.startAtaDeg, 150);
  assert.equal(defensive.startAaDeg, 15);
  assert.equal(defensive.blueKt, 180);
  assert.equal(defensive.redKt, 240);
  assert.equal(defensive.blueAltFt, 9500);
  assert.equal(defensive.redAltFt, 10000);

  const energy = TACTICAL_PRESETS['energy-vs-angles'];
  assert.equal(energy.separationNm, 1.2);
  assert.equal(energy.startAtaDeg, 15);
  assert.equal(energy.startAaDeg, 165);
  assert.equal(energy.blueKt, 280);
  assert.equal(energy.redKt, 160);
  assert.equal(energy.blueAltFt, 14000);
  assert.equal(energy.redAltFt, 10000);

  const radius = TACTICAL_PRESETS['radius-vs-rate'];
  assert.equal(radius.separationNm, 1.0);
  assert.equal(radius.startAtaDeg, 10);
  assert.equal(radius.startAaDeg, 170);
  assert.equal(radius.blueKt, 240);
  assert.equal(radius.redKt, 240);
  assert.equal(radius.circles, 1);
  assert.equal(radius.blueAltFt, 10000);
  assert.equal(radius.redAltFt, 10000);

  // All preset parameters are valid inside ranges
  for (const [key, preset] of Object.entries(TACTICAL_PRESETS)) {
    assert.ok(preset.separationNm >= RANGES.separationNm.min && preset.separationNm <= RANGES.separationNm.max, `${key} separation`);
    assert.ok(preset.startAtaDeg >= RANGES.startAtaDeg.min && preset.startAtaDeg <= RANGES.startAtaDeg.max, `${key} ATA`);
    assert.ok(preset.startAaDeg >= RANGES.startAaDeg.min && preset.startAaDeg <= RANGES.startAaDeg.max, `${key} AA`);
    assert.ok(preset.blueKt >= RANGES.blueKt.min && preset.blueKt <= RANGES.blueKt.max, `${key} blueKt`);
    assert.ok(preset.redKt >= RANGES.redKt.min && preset.redKt <= RANGES.redKt.max, `${key} redKt`);
    assert.ok(preset.blueAltFt >= RANGES.blueAltFt.min && preset.blueAltFt <= RANGES.blueAltFt.max, `${key} blueAltFt`);
    assert.ok(preset.redAltFt >= RANGES.redAltFt.min && preset.redAltFt <= RANGES.redAltFt.max, `${key} redAltFt`);
  }
});
