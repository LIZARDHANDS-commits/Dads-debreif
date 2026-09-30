// Energy mode's readouts (SPEC-turn-fight, "Energy mode", "The screen"): known answers from the engine's own fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { createEnergyRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import {
  flagText, flagNotes, moveWhyText, energyFirstNoseText, winnerText, energyResultRows, energyMoreRows, altitudeSummary, altitudeRows,
  ALTITUDE_TABLE_STEP_SEC,
} from '../../../src/modules/turn-fight/energy-readouts.js';

const fly = (setup, seconds) => {
  const fight = createEnergyFight(setup);
  for (let i = 0; i < seconds / 0.02; i++) stepEnergyFight(fight, 0.02);
  return fight;
};
const row = (rows, id) => rows.find((r) => r.id === id);

test('at T+0 the Result card reads the merge speed, the start altitude, 1 G and the move the model chose, with nothing flagged', () => {
  const fight = createEnergyFight({});
  const rows = energyResultRows(fight);
  assert.deepEqual(rows.map((r) => r.id), ['kias', 'alt', 'g', 'move', 'toMpt', 'flags', 'range', 'firstNose', 'winner']);
  assert.deepEqual([row(rows, 'kias').blue, row(rows, 'kias').red], ['220 KIAS', '220 KIAS']);
  assert.deepEqual([row(rows, 'alt').blue, row(rows, 'alt').red], ['10,000 ft', '10,000 ft']);
  assert.equal(row(rows, 'g').blue, '1.0');
  assert.equal(row(rows, 'move').blue, 'Pitch back');
  assert.equal(row(rows, 'toMpt').blue, '--');
  assert.deepEqual([row(rows, 'flags').blue, row(rows, 'flags').red], ['None', 'None']);
  assert.equal(row(rows, 'flags').blueTone, '');
  assert.equal(row(rows, 'range').text, '2.00 NM');
  assert.equal(row(rows, 'firstNose').text, '--');
  assert.equal(row(rows, 'winner').text, '--');
});

test('the words beside each aircraft are the engine\'s: the spec\'s own example at 220 KIAS', () => {
  const fight = createEnergyFight({});
  assert.equal(moveWhyText(fight.blue), 'Pitch back: 220 KIAS, SMM entry 160 to 220');
  assert.equal(moveWhyText({}), '');
});

test('once at the MPT the words say "MPT 160 KIAS" and the card gives the time and degrees of turn it took', () => {
  const fight = fly({ blueKias: 180, redKias: 180 }, 40);
  assert.equal(fight.blue.mptReached, true);
  assert.equal(moveWhyText(fight.blue), 'MPT 160 KIAS');
  const rows = energyResultRows(fight);
  assert.equal(row(rows, 'toMpt').blue, `${fight.blue.toMptSec.toFixed(1)} s, ${Math.round(fight.blue.toMptDeg)}°`);
  assert.match(row(rows, 'toMpt').blue, /^\d+\.\d s, \d+°$/);
});

test('the flags are words: OVER G, STALL, both, or None; the tone is on for any flag', () => {
  assert.equal(flagText({ overG: false, stall: false }), 'None');
  assert.equal(flagText({ overG: true, stall: false }), 'OVER G');
  assert.equal(flagText({ overG: false, stall: true }), 'STALL');
  assert.equal(flagText({ overG: true, stall: true }), 'OVER G + STALL');
});

test('a pull past the rolling limit goes OVER G, and the card says so in words, with the reason', () => {
  const fight = createEnergyFight({ blueKias: 220, redKias: 220, blueMove: 'pitchBack', blueForceG: 6, turnsStart: 'now' }); // the engine's what-if G: no box on screen sets one
  let seen = null;
  for (let i = 0; i < 20 / 0.02 && !seen; i++) {
    stepEnergyFight(fight, 0.02);
    if (fight.blue.overG) seen = energyResultRows(fight);
  }
  assert.ok(seen, 'OVER G came on');
  assert.match(row(seen, 'flags').blue, /OVER G/);
  assert.equal(row(seen, 'flags').blueTone, 'alert');
  assert.equal(row(seen, 'flags').red, 'None');
  assert.equal(row(seen, 'flags').redTone, '');
  const notes = flagNotes(fight);
  assert.ok(notes.some((n) => n.startsWith('Blue OVER G: ')), notes.join(' | '));
  assert.ok(notes.every((n) => !n.startsWith('Red')));
});

test('a slow Immelmann stalls at the top, and the card says STALL', () => {
  const fight = createEnergyFight({ blueKias: 120, redKias: 250, blueMove: 'immelmann', turnsStart: 'now' });
  let seen = null;
  for (let i = 0; i < 40 / 0.02 && !seen; i++) {
    stepEnergyFight(fight, 0.02);
    if (fight.blue.stall) seen = energyResultRows(fight);
  }
  assert.ok(seen, 'STALL came on');
  assert.match(row(seen, 'flags').blue, /STALL/);
  assert.equal(row(seen, 'flags').blueTone, 'alert');
  assert.ok(flagNotes(fight).some((n) => n.startsWith('Blue STALL: ')));
});

test('More detail has TAS, climb angle, bank, Ps and energy height, from the engine\'s numbers, and the pass geometry', () => {
  const fight = fly({}, 12);
  const rows = energyMoreRows(fight);
  assert.deepEqual(rows.map((r) => r.id), ['tas', 'climb', 'bank', 'ps', 'energyHeight', 'offNose', 'angleOff', 'sinceMerge']);
  assert.equal(row(rows, 'tas').blue, `${Math.round(fight.blue.ktas)} kt`);
  assert.equal(row(rows, 'climb').blue, `${fight.blue.climbDeg.toFixed(0)}°`);
  assert.equal(row(rows, 'bank').blue, `${fight.blue.bankDeg.toFixed(0)}°`);
  assert.match(row(rows, 'ps').blue, /^[+-][\d,]+ ft\/s$/);
  assert.match(row(rows, 'energyHeight').blue, /^[\d,]+ ft$/);
  assert.ok(Number.parseInt(row(rows, 'energyHeight').blue.replace(/,/g, ''), 10) > fight.blue.altFt);
  assert.equal(row(rows, 'angleOff').text, `${fight.headingCrossDeg.toFixed(0)}°`);
  assert.match(row(rows, 'sinceMerge').text, /^\d+\.\d s$/);
});

test('the Ps sign shows: a negative excess reads "-" and a positive "+"', () => {
  const rows = energyMoreRows({
    ...createEnergyFight({}),
    blue: { ...createEnergyFight({}).blue, psFtps: -123.4 },
  });
  assert.equal(row(rows, 'ps').blue, '-123 ft/s');
  const up = energyMoreRows({ ...createEnergyFight({}), blue: { ...createEnergyFight({}).blue, psFtps: 45.2 } });
  assert.equal(row(up, 'ps').blue, '+45 ft/s');
});

test('first nose-on reads Blue, Red or Both with the time since the pass', () => {
  const state = { mergeSec: 10, firstNose: { by: 'blue', timeSec: 28.2 } };
  assert.equal(energyFirstNoseText(state), 'Blue at +18.2 s');
  assert.equal(energyFirstNoseText({ ...state, firstNose: { by: 'red', timeSec: 25 } }), 'Red at +15.0 s');
  assert.equal(energyFirstNoseText({ ...state, firstNose: { by: 'both', timeSec: 25 } }), 'Both at +15.0 s');
  assert.equal(energyFirstNoseText({ ...state, firstNose: null }), '--');
});

test('a winner the engine names is read; a null or missing one is "--" until the fight is settled, then "Even fight"', () => {
  assert.equal(winnerText({ winner: 'blue' }), 'Blue wins');
  assert.equal(winnerText({ winner: 'Red' }), 'Red wins');
  assert.equal(winnerText({ winner: { by: 'red' } }), 'Red wins');
  assert.equal(winnerText({ winner: { who: 'blue' } }), 'Blue wins');
  // The engine reports no winner: null, or no field at all.
  assert.equal(winnerText({ winner: null, stopped: true }), 'Even fight');
  assert.equal(winnerText({ stopped: true }), 'Even fight');
  assert.equal(winnerText({ winner: undefined }), '--');
  assert.equal(winnerText({ winner: null }), '--');
  // A field that names nobody is "Even fight" at once.
  for (const winner of ['none', 'even', 'both', {}, 'draw']) assert.equal(winnerText({ winner }), 'Even fight', JSON.stringify(winner));
  // No engine field: whoever's chase started won the turn; both at once is even.
  assert.equal(winnerText({ chase: { by: 'blue' } }), 'Blue wins');
  assert.equal(winnerText({ chase: { by: 'red' } }), 'Red wins');
  assert.equal(winnerText({ chase: { by: 'both' } }), 'Even fight');
  assert.equal(winnerText({ firstNose: { by: 'both' } }), 'Even fight', 'a tie at first nose-on, nobody chasing');
  assert.equal(winnerText({ firstNose: { by: 'blue' } }), '--', 'someone has their nose on, and no chase has started: not decided');
  assert.equal(winnerText({ firstNose: { by: 'both' }, chase: { by: 'red' } }), 'Red wins', 'a chase from behind decides it');
  assert.equal(winnerText({ winner: 'blue', chase: { by: 'red' } }), 'Blue wins', 'the engine\'s word comes first');
});

test('the chase row appears only once a pursuit has started, and says when the chaser is behind the curve', () => {
  const rows = energyResultRows(createEnergyFight({}));
  assert.equal(row(rows, 'chase'), undefined);
  const chasing = energyResultRows({
    ...createEnergyFight({}),
    chase: { by: 'blue' },
    blue: { ...createEnergyFight({}).blue, move: 'pursuit', chaseLimited: true },
  });
  assert.equal(row(chasing, 'chase').blue, 'Chasing, behind the curve');
  assert.equal(row(chasing, 'chase').red, 'Holding the MPT');
  const easy = energyResultRows({ ...createEnergyFight({}), chase: { by: 'blue' }, blue: { ...createEnergyFight({}).blue, move: 'pursuit', chaseLimited: false } });
  assert.equal(row(easy, 'chase').blue, 'Chasing');
});

test('the altitude summary is one line with both altitudes and the hard deck', () => {
  const fight = fly({ hardDeckFt: 7000 }, 5);
  assert.equal(altitudeSummary(fight), `Altitude at T+5.0: Blue ${Math.round(fight.blue.altFt).toLocaleString('en-US')} ft, Red ${Math.round(fight.red.altFt).toLocaleString('en-US')} ft. Hard deck 7,000 ft.`);
});

test('the altitude table has a row every 10 s from T+0 and the latest point last', () => {
  const run = createEnergyRun({});
  for (let i = 0; i < 25 / 0.02; i++) advanceRun(run, 0.02);
  const rows = altitudeRows(run.trails);
  assert.equal(ALTITUDE_TABLE_STEP_SEC, 10);
  assert.deepEqual(rows.map((r) => Math.round(r.timeSec)), [0, 10, 20, 25]);
  assert.equal(rows[0].blueFt, 10000);
  assert.equal(rows.at(-1).blueFt, run.trails.blue.at(-1).zFt);
  assert.deepEqual(altitudeRows({ blue: [], red: [] }), []);
  // At T+20 exactly the last row is the T+20 one, not doubled.
  const at20 = createEnergyRun({});
  for (let i = 0; i < 20 / 0.02; i++) advanceRun(at20, 0.02);
  assert.deepEqual(altitudeRows(at20.trails).map((r) => Math.round(r.timeSec)), [0, 10, 20]);
});
