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
// Energy mode's settings (SPEC-turn-fight, "The screen", "More energy settings", "Model settings for checking"):
// the defaults are the engine's, the ranges are its setup checks, and the setup key follows the Energy fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight, ENERGY_DEFAULT_SETUP, ENERGY_MOVES, PURSUITS, ENERGY_MAX_START_FT, MPT_KIAS_RANGE } from '../../../src/modules/turn-fight/energy-sim.js';
import { T6A_LIMITS, iasToTasKt } from '../../../src/core/t6-performance.js';
import {
  DEFAULTS, RANGES, ALLOWED, ENERGY_KEYS, ENERGY_CHECK_KEYS, setupFrom, setupKey, energySetupFrom, startSetupFrom, energyProblem,
  saneFix, v6Defaults, standardDefaults, checkingDefaults, usableEnergyValues, energyProblemNote, START_FALLBACK_KEYS, topKiasAt,
  startEnergyRun, isSetupError, setupErrorText,
} from '../../../src/modules/turn-fight/state.js';

const ENERGY_ON = { ...DEFAULTS, energy: true };
const NUMBER_ENERGY_KEYS = ENERGY_KEYS.filter((k) => k in RANGES);

test('Energy opens off, and every Energy setting opens at the engine\'s own default', () => {
  assert.equal(DEFAULTS.energy, false);
  const setup = energySetupFrom(DEFAULTS);
  const shared = ['ataDeg', 'ataSide', 'aaDeg', 'aaSide', 'turnsStart']; // the start geometry is the simple fight's own
  for (const [key, value] of Object.entries(setup)) {
    if (!shared.includes(key)) assert.deepEqual(value, ENERGY_DEFAULT_SETUP[key], key);
  }
  // The spec's list: 10,000 ft and 220 KIAS each, Auto, MPT 160, deck 6,000, Pure, head-on chase on (D403); stall 86, shaker 94 %.
  assert.deepEqual([DEFAULTS.blueAltFt, DEFAULTS.redAltFt, DEFAULTS.blueKias, DEFAULTS.redKias], [10000, 10000, 220, 220]);
  assert.deepEqual([DEFAULTS.blueMove, DEFAULTS.redMove, DEFAULTS.mptKias, DEFAULTS.hardDeckFt, DEFAULTS.pursuit, DEFAULTS.chaseAfterHeadOn], ['auto', 'auto', 160, 6000, 'pure', true]);
  assert.deepEqual([DEFAULTS.stallKias, DEFAULTS.shakerPct, DEFAULTS.stallSec, DEFAULTS.midThrottlePct], [86, 94, 1, 50]);
  assert.deepEqual([DEFAULTS.rollRateDegPerSec, DEFAULTS.pitchBackBank160Deg, DEFAULTS.pitchBackBank220Deg], [90, 60, 30]);
  assert.deepEqual([DEFAULTS.immelmannAboveKias, DEFAULTS.splitSBelowKias, DEFAULTS.immelmannOffNoseDeg, DEFAULTS.immelmannMinTopKias, DEFAULTS.pickLookaheadSec, DEFAULTS.deckMarginFt], [220, 120, 120, 120, 60, 1000]);
  assert.deepEqual([DEFAULTS.leadSec, DEFAULTS.lagSec], [1, 1]);
});

test('the Energy defaults fly at once, and every default is in its own range', () => {
  for (const key of NUMBER_ENERGY_KEYS) assert.ok(DEFAULTS[key] >= RANGES[key].min && DEFAULTS[key] <= RANGES[key].max, key);
  assert.equal(energyProblem(ENERGY_ON), '');
  assert.doesNotThrow(() => createEnergyFight(energySetupFrom(ENERGY_ON)));
});

test('the three groups of Energy settings cover every Energy key once', () => {
  assert.equal(new Set(ENERGY_KEYS).size, ENERGY_KEYS.length);
  // The spec lists twelve model settings; lead and lag, the two pitch back banks, the two split points each make a pair, plus tactical AI lookahead.
  assert.equal(ENERGY_CHECK_KEYS.length, 16);
  for (const key of ENERGY_KEYS) assert.ok(key in DEFAULTS, key);
  // The moves and pursuits the boxes offer are the engine's.
  assert.deepEqual(ALLOWED.blueMove, [...ENERGY_MOVES]);
  assert.deepEqual(ALLOWED.redMove, [...ENERGY_MOVES]);
  assert.deepEqual(ALLOWED.pursuit, [...PURSUITS]);
});

test('the ranges are the engine\'s setup checks: KIAS 40 to VMO, altitude to 25,000 ft, angles 0 to 180°, look-ahead 0 to 120 s, deck margin 0 to 10,000 ft', () => {
  assert.deepEqual([RANGES.blueKias.min, RANGES.blueKias.max], [40, T6A_LIMITS.vmoKias]);
  assert.deepEqual([RANGES.redKias.min, RANGES.redKias.max], [40, T6A_LIMITS.vmoKias]);
  assert.equal(RANGES.blueAltFt.max, ENERGY_MAX_START_FT);
  assert.equal(RANGES.redAltFt.max, ENERGY_MAX_START_FT);
  assert.deepEqual([RANGES.immelmannOffNoseDeg.min, RANGES.immelmannOffNoseDeg.max], [0, 180]);
  assert.deepEqual([RANGES.immelmannMinTopKias.min, RANGES.immelmannMinTopKias.max], [0, T6A_LIMITS.vmoKias]);
  assert.deepEqual([RANGES.pickLookaheadSec.min, RANGES.pickLookaheadSec.max], [0, 120]);
  assert.deepEqual([RANGES.deckMarginFt.min, RANGES.deckMarginFt.max], [0, 10000]);
  assert.deepEqual([RANGES.shakerPct.max, RANGES.midThrottlePct.max], [100, 100]);
  assert.ok(RANGES.shakerPct.min > 0 && RANGES.midThrottlePct.min > 0, 'the engine wants the shaker and throttle above 0');
});

test('both ends of every Energy number box give a fight the engine accepts and flies finite for 40 s', () => {
  const fly = (values) => {
    assert.equal(energyProblem(values), '', JSON.stringify(values));
    const fight = createEnergyFight(energySetupFrom(values));
    for (let i = 0; i < 40 / 0.02; i++) stepEnergyFight(fight, 0.02);
    for (const who of ['blue', 'red']) for (const k of ['kias', 'altFt', 'g', 'bankDeg', 'climbDeg', 'psFtps']) assert.ok(Number.isFinite(fight[who][k]), `${who}.${k}`);
  };
  for (const key of NUMBER_ENERGY_KEYS) {
    for (const end of ['min', 'max']) {
      // The altitudes' floor is the deck and the deck's ceiling is the altitude: move the other one out of the way.
      const other = key === 'hardDeckFt' ? { blueAltFt: 25000, redAltFt: 25000 } : key.endsWith('AltFt') ? { hardDeckFt: 0, blueAltFt: RANGES[key][end], redAltFt: RANGES[key][end] } : {}; // both jets at the end, so the height between them stays inside the range
      fly({ ...ENERGY_ON, ...other, [key]: RANGES[key][end] });
    }
  }
});

test('energyProblem says what the engine would refuse for two numbers together, and only that', () => {
  const cases = [
    { hardDeckFt: 6000, blueAltFt: 5000 }, { hardDeckFt: 6000, redAltFt: 5999 }, { hardDeckFt: 12000 }, { hardDeckFt: 10000 },
    { blueAltFt: 25000, redAltFt: 6000, separationNm: 2 }, { blueAltFt: 25000, redAltFt: 6000, separationNm: 3.5 }, { blueAltFt: 12000, redAltFt: 6000, separationNm: 1 },
    { separationNm: 0.5, blueAltFt: 6000, redAltFt: 10000 }, { separationNm: 0.5, blueAltFt: 6000, redAltFt: 8000 },
  ];
  for (const change of cases) {
    const values = { ...ENERGY_ON, ...change };
    let refused = false;
    try {
      createEnergyFight(energySetupFrom(values));
    } catch (err) {
      assert.ok(err instanceof RangeError);
      refused = true;
    }
    assert.equal(energyProblem(values) !== '', refused, JSON.stringify(change));
  }
  assert.equal(energyProblem({ ...DEFAULTS, hardDeckFt: 20000 }), '', 'Energy off never complains');
  assert.equal(energyProblem({ ...ENERGY_ON, blueAltFt: 5000 }), 'Blue\'s start altitude (5,000 ft) must be from the hard deck (6,000 ft) to 25,000 ft.');
  assert.equal(energyProblem({ ...ENERGY_ON, separationNm: 0.5, redAltFt: 20000 }), 'The start separation (0.5 NM) must be more than the height between the aircraft (10,000 ft).');
});

test('a merge speed above the top speed at its height is a problem, to the knot the engine takes: Blue at 25,000 ft and 300 KIAS', () => {
  // No limit is written in here: it is whatever the one helper (topKiasAt) says, and the engine has to agree. 300 KIAS at 25,000 ft is over any of them.
  const limit = Math.round(topKiasAt(25000));
  assert.ok(limit < 300, `the limit at 25,000 ft is under 300 KIAS (${limit})`);
  const values = { ...ENERGY_ON, blueAltFt: 25000, redAltFt: 25000, blueKias: 300 };
  const problem = energyProblem(values);
  assert.match(problem, new RegExp(`^Blue's merge speed \\(300 KIAS\\) is above the T-6A's limit at 25,000 ft \\(${limit} KIAS, `));
  assert.throws(() => createEnergyFight(energySetupFrom(values)), (err) => err instanceof RangeError && /Blue's merge speed/.test(err.message), 'the engine refuses it too');
  assert.equal(energyProblem({ ...values, blueKias: limit }), '', 'at the limit as shown it flies');
  assert.doesNotThrow(() => createEnergyFight(energySetupFrom({ ...values, blueKias: limit })));
  assert.notEqual(energyProblem({ ...values, blueKias: limit + 1 }), '');
  assert.match(energyProblem({ ...ENERGY_ON, blueAltFt: 25000, redAltFt: 25000, redKias: 300 }), /^Red's merge speed \(300 KIAS\)/);
  assert.equal(energyProblem({ ...ENERGY_ON, blueKias: 316 }), '', 'VMO at 10,000 ft is fine');
  // The check agrees with the engine over heights and speeds, at and around the limit the helper gives.
  for (const alt of [6000, 10000, 15000, 18000, 18879, 19000, 20000, 22000, 25000]) {
    const top = Math.round(topKiasAt(alt));
    for (const kias of [40, top - 1, top, top + 1, 316]) {
      const v = { ...ENERGY_ON, hardDeckFt: 0, blueAltFt: alt, redAltFt: alt, blueKias: kias };
      let refused = false;
      try { createEnergyFight(energySetupFrom(v)); } catch (err) { assert.ok(err instanceof RangeError); refused = true; }
      assert.equal(energyProblem(v) !== '', refused, `${alt} ft, ${kias} KIAS`);
    }
  }
});

test('while the start cannot fly, the fight, the pass and the start picture use the same default start, and the line names every setting it replaces', () => {
  const values = { ...ENERGY_ON, blueAltFt: 25000, blueKias: 300, redAltFt: 9000, hardDeckFt: 7000, separationNm: 6 };
  assert.ok(energyProblem(values));
  const usable = usableEnergyValues(values);
  for (const key of START_FALLBACK_KEYS) assert.equal(usable[key], DEFAULTS[key], key);
  assert.deepEqual([...START_FALLBACK_KEYS].sort(), ['blueAltFt', 'blueKias', 'hardDeckFt', 'redAltFt', 'redKias', 'separationNm']);
  assert.equal(usable.blueMove, values.blueMove, 'only the start is replaced');
  const shown = startSetupFrom(values);
  const flown = startSetupFrom({ ...values, ...usable });
  assert.deepEqual(shown, flown, 'the picture and the pass follow what is flown');
  assert.equal(shown.separationNm, DEFAULTS.separationNm);
  assert.equal(shown.blueKt, iasToTasKt(DEFAULTS.blueKias, DEFAULTS.blueAltFt));
  const note = energyProblemNote(values);
  assert.ok(note.startsWith(`${energyProblem(values)} Until this is fixed the fight flies the default start altitudes (10,000 ft), merge speeds (220 KIAS), hard deck (6,000 ft) and separation (2 NM).`), note);
  assert.equal(note.endsWith('separation (2 NM).'), true);
  assert.equal(energyProblemNote(ENERGY_ON), '');
  assert.equal(usableEnergyValues(ENERGY_ON), ENERGY_ON);
  assert.equal(usableEnergyValues({ ...DEFAULTS, blueKias: 300, blueAltFt: 25000 }).blueKias, 300, 'Energy off never replaces anything');
  assert.doesNotThrow(() => createEnergyFight(energySetupFrom(usable)));
});

test('with Energy on, the setup key is Energy\'s: it follows the Energy and fight settings, and not the greyed-out simple ones or the display', () => {
  const base = setupKey(ENERGY_ON);
  assert.notEqual(base, setupKey(DEFAULTS), 'switching Energy on starts the fight again');
  for (const change of [{ blueAltFt: 9000 }, { redKias: 250 }, { blueMove: 'splitS' }, { redMove: 'slice' }, { mptKias: 150 }, { hardDeckFt: 5000 },
    { pursuit: 'lead' }, { chaseAfterHeadOn: false }, { stallKias: 83 }, { shakerPct: 90 }, { stallSec: 2 }, { midThrottlePct: 30 }, { leadSec: 2 },
    { lagSec: 2 }, { rollRateDegPerSec: 60 }, { pitchBackBank160Deg: 50 }, { pitchBackBank220Deg: 25 }, { immelmannAboveKias: 230 },
    { splitSBelowKias: 110 }, { immelmannOffNoseDeg: 100 }, { immelmannMinTopKias: 100 }, { pickLookaheadSec: 30 }, { deckMarginFt: 500 },
    { circles: 1 }, { separationNm: 3 }, { startAtaDeg: 30 }, { startAaDeg: 90 }, { turnsAt: 'once' }]) {
    assert.notEqual(setupKey({ ...ENERGY_ON, ...change }), base, JSON.stringify(change));
  }
  // The simple mode's own numbers are kept but greyed out: changing them cannot restart an Energy fight.
  for (const change of [{ blueKt: 300 }, { redG: 6 }, { chase: true }, { vertical: true }, { bluePitchDeg: 20 }, { heightScale: 4 }, { playbackRate: 4 }, { view: '3d' }, { paint: 'ship' }]) {
    assert.equal(setupKey({ ...ENERGY_ON, ...change }), base, JSON.stringify(change));
  }
});

test('with Energy off, the simple fight\'s key is exactly what it was: the Energy settings never restart it', () => {
  const base = setupKey(DEFAULTS);
  assert.equal(base, JSON.stringify(setupFrom(DEFAULTS)));
  for (const key of ENERGY_KEYS) {
    const value = typeof DEFAULTS[key] === 'number' ? DEFAULTS[key] + 1 : DEFAULTS[key] === 'auto' ? 'splitS' : DEFAULTS[key] === 'pure' ? 'lead' : !DEFAULTS[key];
    assert.equal(setupKey({ ...DEFAULTS, [key]: value }), base, key);
  }
});

test('the percentages go to the engine as fractions, and a side at 0° or 180° is left, as in the simple fight', () => {
  const setup = energySetupFrom({ ...ENERGY_ON, shakerPct: 90, midThrottlePct: 30, startAtaDeg: 180, startAtaSide: 'right', turnsAt: 'once' });
  assert.equal(setup.shakerFrac, 0.9);
  assert.equal(setup.midThrottle, 0.3);
  assert.equal(setup.ataSide, 'left');
  assert.equal(setup.turnsStart, 'now');
  assert.equal(energySetupFrom({ ...ENERGY_ON, startAtaDeg: 30, startAtaSide: 'right' }).ataSide, 'right');
});

test('the start pass and picture use the true airspeed of the merge speed with Energy on, and the simple speed without', () => {
  assert.deepEqual(startSetupFrom(DEFAULTS), setupFrom(DEFAULTS));
  const on = startSetupFrom({ ...ENERGY_ON, blueKt: 100 });
  assert.ok(Math.abs(on.blueKt - iasToTasKt(220, 10000)) < 1e-9);
  assert.ok(on.blueKt > 220, 'TAS is above IAS at 10,000 ft');
});

test('Reset to V6 defaults turns Energy off and puts every Energy setting back; Reset to defaults in Model settings puts back only those', () => {
  const patch = v6Defaults();
  assert.equal(patch.energy, false);
  for (const key of ENERGY_KEYS) assert.equal(patch[key], DEFAULTS[key], key);
  const check = checkingDefaults();
  assert.deepEqual(Object.keys(check).sort(), [...ENERGY_CHECK_KEYS].sort());
  for (const key of ENERGY_CHECK_KEYS) assert.equal(check[key], DEFAULTS[key], key);
  assert.ok(!('blueMove' in check) && !('hardDeckFt' in check) && !('energy' in check));
});

test('the MPT speed box takes the engine\'s own range, and a saved speed outside it (110, 180) goes back to the default and flies', () => {
  assert.deepEqual([RANGES.mptKias.min, RANGES.mptKias.max], [...MPT_KIAS_RANGE]);
  assert.deepEqual(saneFix({ ...DEFAULTS, mptKias: 110 }), { mptKias: 160 });
  assert.deepEqual(saneFix({ ...DEFAULTS, mptKias: 180 }), { mptKias: 160 });
  assert.deepEqual(saneFix({ ...DEFAULTS, mptKias: 120 }), { mptKias: 160 });
  assert.deepEqual(saneFix({ ...DEFAULTS, mptKias: 125 }), {});
  assert.deepEqual(saneFix({ ...DEFAULTS, mptKias: 175 }), {});
  for (const mptKias of [125, 175]) assert.doesNotThrow(() => createEnergyFight(energySetupFrom({ ...ENERGY_ON, mptKias })), `${mptKias} flies`);
  assert.throws(() => createEnergyFight(energySetupFrom({ ...ENERGY_ON, mptKias: 110 })), RangeError);
  assert.throws(() => createEnergyFight(energySetupFrom({ ...ENERGY_ON, mptKias: 120 })), RangeError);
});

test('a saved Energy number outside its range is put back; a saved move or pursuit outside the choices is refused', () => {
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKias: 500, mptKias: 90, shakerPct: 0, pickLookaheadSec: 121 }), { blueKias: 220, mptKias: 160, shakerPct: 94, pickLookaheadSec: 60 });
  assert.deepEqual(saneFix({ ...DEFAULTS, blueKias: 40, redKias: 316, blueAltFt: 0, redAltFt: 25000 }), {});
  assert.ok(ALLOWED.blueMove.includes('splitS') && !ALLOWED.blueMove.includes('loop'));
  assert.ok(ALLOWED.pursuit.includes('lag') && !ALLOWED.pursuit.includes('none'), 'the engine\'s "none" is for tests, not a choice');
});

test('standardDefaults returns standard defaults and matches v6Defaults (D384)', () => {
  assert.equal(standardDefaults, v6Defaults);
  const std = standardDefaults();
  assert.equal(std.energy, false);
  for (const key of ENERGY_KEYS) assert.equal(std[key], DEFAULTS[key]);
});

test('startEnergyRun runs cleanly, handles engine setup RangeError with fallback, and rethrows unexpected errors', () => {
  const values = { ...ENERGY_ON, blueKias: 220 };
  const mockCreate = (setup) => ({ setup, isRun: true });
  const result = startEnergyRun(values, mockCreate);
  assert.ok(result.run.isRun);
  assert.equal(result.note, '');
  assert.equal(result.flown.blueKias, 220);

  // Engine setup error is captured and returns default flown settings
  let calls = 0;
  const setupErrorCreate = (setup) => {
    calls++;
    if (calls === 1) {
      throw new RangeError('Turn Fight energy setup: mptKias is from 125 to 175 KIAS, got 110');
    }
    return { setup, isRun: true };
  };
  const fallback = startEnergyRun(values, setupErrorCreate);
  assert.ok(fallback.run.isRun);
  assert.match(fallback.note, /The MPT speed is from 125 to 175 KIAS \(it was 110\)\. Until this is fixed every Energy setting is at its default\./);
  assert.equal(fallback.flown.mptKias, DEFAULTS.mptKias);

  // Unexpected RangeError (no prefix) or other Error is rethrown
  const unexpectedRangeError = () => {
    throw new RangeError('Invalid array length');
  };
  assert.throws(() => startEnergyRun(values, unexpectedRangeError), RangeError);

  const unexpectedTypeError = () => {
    throw new TypeError('Cannot read property of undefined');
  };
  assert.throws(() => startEnergyRun(values, unexpectedTypeError), TypeError);
});
