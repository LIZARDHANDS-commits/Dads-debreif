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
// The Energy screen's words and lists (SPEC-turn-fight, "The screen", "More energy settings", "Model settings for
// checking", "Start geometry and altitudes"): the hints, the note beside a high start altitude, and the About lines on the
// MPT bank, each held to the engine and the spec. The screen itself is checked in the browser (tests/e2e/turn-fight.spec.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight, ENERGY_ACCURATE_MAX_FT, ENERGY_MOVES, MOVE_LABELS } from '../../../src/modules/turn-fight/energy-sim.js';
import { ALTITUDE_NOTE, ENERGY_ABOUT, CHECK_SETTINGS, rangeHint } from '../../../src/modules/turn-fight/layout.js';
import { ENERGY_CHECK_KEYS, RANGES, DEFAULTS, ALLOWED } from '../../../src/modules/turn-fight/state.js';

test('the note beside a start altitude above 15,000 ft is the spec\'s, in one note: the low turn rate, and SMM 14.5 para 10', () => {
  assert.equal(ENERGY_ACCURATE_MAX_FT, 15000);
  assert.match(ALTITUDE_NOTE, /^Above 15,000 ft the model's sustained turn rate reads low/);
  assert.match(ALTITUDE_NOTE, /up to 28 % low at 20,000 ft and above near 200 KIAS/);
  assert.match(ALTITUDE_NOTE, /within 0\.65°\/s at 15,000 ft and below/);
  assert.match(ALTITUDE_NOTE, /The SMM recommends aerobatics below 16,000 ft MSL \(SMM 14\.5 para 10\)\.$/);
  assert.equal(ALTITUDE_NOTE.split('. ').length, 2, 'one note of two sentences, not two warnings');
});

test('Model settings for checking lists every box the spec lists, once each, in the engine\'s check keys', () => {
  assert.deepEqual([...CHECK_SETTINGS.map(([key]) => key)].sort(), [...ENERGY_CHECK_KEYS].sort());
  for (const [key, label, hint] of CHECK_SETTINGS) {
    assert.ok(key in RANGES, `${key} has a range`);
    assert.ok(label.length > 3 && hint.length > 10, key);
  }
  // The spec's wording for the boxes (SPEC-turn-fight, "Model settings for checking").
  const labels = CHECK_SETTINGS.map(([, label]) => label).join(' | ');
  for (const words of ['Stall speed', 'Shaker', 'How long a stall lasts', 'Mid-range throttle', 'Lead point', 'Lag point', 'Roll rate', 'Pitch back bank at 160', 'Pitch back bank at 220',
    'Immelmann or pitch back above', 'split S below', 'Immelmann off-nose angle', 'Lowest Immelmann top speed', 'Look-ahead', 'Deck margin']) {
    assert.ok(labels.includes(words), words);
  }
});

test('every hint gives the range and the engine\'s default, from the same numbers the box uses', () => {
  assert.equal(rangeHint('mptKias'), '125 to 175 KIAS, default 160 KIAS.');
  assert.equal(rangeHint('hardDeckFt'), '0 to 25,000 ft, default 6,000 ft.');
  assert.equal(rangeHint('shakerPct'), '50 to 100%, default 94%.');
  assert.equal(rangeHint('immelmannOffNoseDeg'), '0 to 180°, default 120°.');
  assert.equal(rangeHint('pickLookaheadSec'), '0 to 120 s, default 60 s.');
  assert.equal(rangeHint('deckMarginFt'), '0 to 10,000 ft, default 1,000 ft.');
  for (const key of ENERGY_CHECK_KEYS) {
    const { min, max } = RANGES[key];
    const hint = rangeHint(key);
    assert.ok(hint.includes(min.toLocaleString('en-US')) && hint.includes(max.toLocaleString('en-US')) && hint.includes(DEFAULTS[key].toLocaleString('en-US')), `${key}: ${hint}`);
  }
});

test('the About text on the MPT bank is what the model does: about 69° at the deck and 72° above it, against the SMM\'s 75°', () => {
  const about = ENERGY_ABOUT.find((line) => line.startsWith('MPT bank'));
  assert.ok(about);
  assert.match(about, /about 75° for the level MPT/);
  assert.match(about, /70 to 75° for the constant-speed MPT/);
  assert.match(about, /about 69° at the deck/);
  assert.match(about, /about 72° in the constant-speed MPT/);
  // The numbers in the text are the engine's own, not remembered ones: fly the two MPTs and read the bank.
  const level = createEnergyFight({ hardDeckFt: 6000, blueAltFt: 6500, redAltFt: 6500, blueKias: 160, redKias: 160, pursuit: 'none' });
  for (let i = 0; i < 120 / 0.02; i++) stepEnergyFight(level, 0.02);
  assert.equal(level.blue.move, 'levelMpt');
  assert.ok(Math.abs(level.blue.bankDeg - 68.5) < 0.5, `level MPT bank ${level.blue.bankDeg}`);
  assert.ok(Math.abs(level.blue.kias - 146) < 1, `level MPT speed ${level.blue.kias}`);
  assert.ok(Math.abs(level.blue.g - 2.7) < 0.1, `level MPT G ${level.blue.g}`);
  const cs = createEnergyFight({ pursuit: 'none' });
  for (let i = 0; i < 60 / 0.02; i++) stepEnergyFight(cs, 0.02);
  assert.equal(cs.blue.move, 'mpt');
  assert.ok(Math.abs(cs.blue.bankDeg - 72.2) < 0.5, `constant-speed MPT bank ${cs.blue.bankDeg}`);
  assert.ok(Math.abs(cs.blue.g - 3.3) < 0.1, `constant-speed MPT G ${cs.blue.g}`);
});

test('the About and hint text quote no manual: numbers and page references only', () => {
  const all = [...ENERGY_ABOUT, ALTITUDE_NOTE, ...CHECK_SETTINGS.map(([, , hint]) => hint)].join(' ');
  assert.ok(!/["“”]/.test(all), 'no quotation marks in the help text');
  for (const ref of all.match(/SMM[\d .a-z]*/g) ?? []) assert.match(ref, /SMM(\s+\d+(\.\d+)?)?(\s+paras?\s+\d+( to \d+| and \d+)?)?/, ref);
});

test('Task 18: tactical move is selectable and tacticalLookaheadSec exists in defaults and settings', () => {
  assert.ok(ENERGY_MOVES.includes('tactical'), 'tactical is in ENERGY_MOVES');
  assert.ok(ALLOWED.blueMove.includes('tactical'), 'tactical is in ALLOWED.blueMove');
  assert.ok(ALLOWED.redMove.includes('tactical'), 'tactical is in ALLOWED.redMove');
  assert.equal(MOVE_LABELS.tactical, 'Tactical AI');

  assert.equal(DEFAULTS.tacticalLookaheadSec, 20);
  assert.ok('tacticalLookaheadSec' in RANGES);
  assert.equal(RANGES.tacticalLookaheadSec.min, 10);
  assert.equal(RANGES.tacticalLookaheadSec.max, 45);
  assert.equal(RANGES.tacticalLookaheadSec.default, 20);
  assert.ok(ENERGY_CHECK_KEYS.includes('tacticalLookaheadSec'));

  const checkItem = CHECK_SETTINGS.find(([k]) => k === 'tacticalLookaheadSec');
  assert.ok(checkItem, 'tacticalLookaheadSec is in CHECK_SETTINGS');
  assert.equal(checkItem[1], 'Tactical AI lookahead (s)');

  // Verifying tactical can be selected and runs in createEnergyFight
  const fight = createEnergyFight({ blueMove: 'tactical', redMove: 'tactical' });
  assert.equal(fight.setup.blueMove, 'tactical');
  assert.equal(fight.setup.redMove, 'tactical');
  assert.ok(fight.blue.move, 'Blue selected a move');
  assert.ok(fight.blue.why.startsWith('Tactical AI:'), 'Blue why text starts with Tactical AI');
});
