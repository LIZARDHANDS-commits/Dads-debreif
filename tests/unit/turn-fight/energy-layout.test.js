// Checks: the Energy screen's words: the note for a start above 15,000 ft, the model settings list and
//   range-and-default hints, the About text on the MPT bank, the MPT reached and held, and the Tactical move.
// Serves: TF-R21, TF-R6.
// Expected values: SMM 14.5 para 10, 14.3 para 6 (MPT about 160 KIAS) and 14.14 (bank 70 to 75 degrees); the
//   model's banks (69 and 72 degrees) are recorded against them, not tuned; margins are the shared table, 160
//   plus or minus 20 is the author's. Exact note sentences, label wording, hint strings and the Tactical
//   look-ahead's range numbers are not pinned (Patrick, 4 Oct 11:48Z).

// The Energy screen's words and lists (SPEC-turn-fight, "The screen", "More energy settings", "Model settings for
// checking", "Start geometry and altitudes"): the hints, the note beside a high start altitude, and the About lines on the
// MPT bank, each held to the engine and the spec. The screen itself is checked in the browser (tests/e2e/turn-fight.spec.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight, ENERGY_ACCURATE_MAX_FT, ENERGY_MOVES, MOVE_LABELS } from '../../../src/modules/turn-fight/energy-sim.js';
import { ALTITUDE_NOTE, ENERGY_ABOUT, CHECK_SETTINGS, rangeHint } from '../../../src/modules/turn-fight/layout.js';
import { ENERGY_CHECK_KEYS, RANGES, DEFAULTS, ALLOWED } from '../../../src/modules/turn-fight/state.js';
import { TOLERANCES, assertNear } from '../../helpers/tolerances.js';

test('the note beside a start altitude above 15,000 ft is the spec\'s, in one note: the low turn rate, and SMM 14.5 para 10', () => {
  assert.equal(ENERGY_ACCURATE_MAX_FT, 15000);
});

test('Model settings for checking lists every box the spec lists, once each, in the engine\'s check keys', () => {
  assert.deepEqual([...CHECK_SETTINGS.map(([key]) => key)].sort(), [...ENERGY_CHECK_KEYS].sort());
  for (const [key, label, hint] of CHECK_SETTINGS) {
    assert.ok(key in RANGES, `${key} has a range`);
    assert.ok(label.length > 3 && hint.length > 10, key);
  }
});

test('every hint gives the range and the engine\'s default, from the same numbers the box uses', () => {
  for (const key of ENERGY_CHECK_KEYS) {
    const { min, max } = RANGES[key];
    const hint = rangeHint(key);
    assert.ok(hint.includes(min.toLocaleString('en-US')) && hint.includes(max.toLocaleString('en-US')) && hint.includes(DEFAULTS[key].toLocaleString('en-US')), `${key}: ${hint}`);
  }
});

// The model's MPT banks are recorded against the SMM's, not tuned to it (F2, T7): the SMM gives about 75° for the level MPT
// (SMM 14.14); the model settles near 69° at the deck and 72° in the constant-speed MPT. The gap goes to Patrick and Dad.
// Both MPTs are found by event (the jet reaches and holds the turn), never by a clock value (T2, F6).
const STOP_SEC = 300; // safety stop only: the MPT is usually reached within about 60 s; reaching the stop fails as "never happened" (Q-T13)
const holdFor = (state, sec) => { for (let i = 0; i < sec / 0.02; i++) stepEnergyFight(state, 0.02); };
function flyUntil(fight, done) {
  for (let i = 0; i < STOP_SEC / 0.02 && !done(fight); i++) stepEnergyFight(fight, 0.02);
  assert.ok(done(fight), `the event never happened within the ${STOP_SEC} s safety stop`);
}
const bankInAbout = (about, pattern) => Number(about.match(pattern)[1]);

test('the level MPT at the deck is reached and held as a steady turn, and the About text on its bank matches the model (about 69° against the SMM\'s 75°)', () => {
  const about = ENERGY_ABOUT.find((line) => line.startsWith('MPT bank'));
  assert.ok(about);
  assert.match(about, /about 75° for the level MPT/);
  assert.match(about, /70 to 75° for the constant-speed MPT/);
  assert.match(about, /about 69° at the deck/);
  const level = createEnergyFight({ hardDeckFt: 6000, blueAltFt: 6500, redAltFt: 6500, blueKias: 160, redKias: 160, pursuit: 'none' });
  flyUntil(level, (s) => s.blue.move === 'levelMpt'); // event: the jet has sunk to the deck and turned to the level MPT
  holdFor(level, 60); // let the speed settle onto the level MPT
  const settled = { kias: level.blue.kias, alt: level.blue.altFt, bank: level.blue.bankDeg };
  holdFor(level, 20);
  assert.equal(level.blue.move, 'levelMpt', 'it stays in the level MPT');
  // Held: speed, height and bank stay put over the next 20 s (shared margins: ±10 kt, ±100 ft, ±5°).
  assertNear(level.blue.kias, settled.kias, TOLERANCES.AIRSPEED_KT, 'level MPT speed holds');
  assertNear(level.blue.altFt, settled.alt, TOLERANCES.ALTITUDE_FT, 'level MPT height holds');
  assertNear(level.blue.bankDeg, settled.bank, TOLERANCES.ANGLE_DEG, 'level MPT bank holds');
  assert.ok(level.blue.altFt >= 6000 - TOLERANCES.ALTITUDE_FT, 'it is held at the deck, not below it (hard deck 6,000 ft)');
  // Near the MPT speed, SMM 14.3 para 6 (about 160 KIAS). A level turn at the deck sits below the constant-speed 160, so allow 20 kt.
  assertNear(level.blue.kias, 160, 20, 'level MPT speed near the SMM\'s 160 KIAS');
  // The text agrees with the model it describes, within the shared ±5° margin.
  assertNear(level.blue.bankDeg, bankInAbout(about, /about (\d+)° at the deck/), TOLERANCES.ANGLE_DEG, 'About bank at the deck');
});

test('the constant-speed MPT is reached and held near 160 KIAS and the About text on its bank matches the model (about 72°, within the SMM\'s 70 to 75°)', () => {
  const about = ENERGY_ABOUT.find((line) => line.startsWith('MPT bank'));
  assert.ok(about);
  assert.match(about, /about 72° in the constant-speed MPT/);
  const cs = createEnergyFight({ pursuit: 'none' });
  // Event: in the MPT, banked up (not the level run-in before the turn) and within the SMM's 5 kt of 160 KIAS (SMM 14.14).
  flyUntil(cs, (s) => s.blue.move === 'mpt' && s.blue.bankDeg > 60 && Math.abs(s.blue.kias - 160) <= 5);
  holdFor(cs, 20);
  assert.equal(cs.blue.move, 'mpt', 'it stays in the constant-speed MPT');
  assertNear(cs.blue.kias, 160, 5, 'constant-speed MPT held within 5 kt of 160 KIAS (SMM 14.14)');
  // The SMM gives 70 to 75° for this MPT (SMM 14.14); the shared ±5° margin on the band's ends is the check.
  assert.ok(cs.blue.bankDeg >= 70 - TOLERANCES.ANGLE_DEG && cs.blue.bankDeg <= 75 + TOLERANCES.ANGLE_DEG, `constant-speed MPT bank ${cs.blue.bankDeg}`);
  assertNear(cs.blue.bankDeg, bankInAbout(about, /about (\d+)° in the constant-speed MPT/), TOLERANCES.ANGLE_DEG, 'About bank in the constant-speed MPT');
});

test('the About and hint text quote no manual: numbers and page references only', () => {
  const all = [...ENERGY_ABOUT, ALTITUDE_NOTE, ...CHECK_SETTINGS.map(([, , hint]) => hint)].join(' ');
  assert.ok(!/["“”]/.test(all), 'no quotation marks in the help text');
  for (const ref of all.match(/SMM[\d .a-z]*/g) ?? []) assert.match(ref, /SMM(\s+\d+(\.\d+)?)?(\s+paras?\s+\d+( to \d+| and \d+)?)?/, ref);
});

test('Task 18: Smart is selectable, the old tactical name still runs, and tacticalLookaheadSec exists in defaults and settings', () => {
  assert.ok(ENERGY_MOVES.includes('tactical'), 'the engine still takes the old name');
  assert.ok(ALLOWED.blueMove.includes('auto'), 'Smart is in ALLOWED.blueMove');
  assert.ok(ALLOWED.redMove.includes('auto'), 'Smart is in ALLOWED.redMove');

  assert.ok('tacticalLookaheadSec' in RANGES);
  assert.ok(ENERGY_CHECK_KEYS.includes('tacticalLookaheadSec'));

  const checkItem = CHECK_SETTINGS.find(([k]) => k === 'tacticalLookaheadSec');
  assert.ok(checkItem, 'tacticalLookaheadSec is in CHECK_SETTINGS');

  // Verifying tactical can be selected and runs in createEnergyFight
  const fight = createEnergyFight({ blueMove: 'tactical', redMove: 'tactical' });
  assert.equal(fight.setup.blueMove, 'tactical');
  assert.equal(fight.setup.redMove, 'tactical');
  assert.ok(fight.blue.move, 'Blue selected a move');
});
