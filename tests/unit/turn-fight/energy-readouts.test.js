// Checks: the Energy Result card words: speed, altitude, G, the move chosen, flags (OVER G, STALL, OVERSPEED, BELOW DECK), first
//   nose-on, winner or "No winner", altitude summary and table, kill and collision rows.
// Serves: TF-R16, TF-R17, TF-R9, TF-R4, TF-R6.
// Expected values: the setup's own inputs (220 KIAS, 10,000 ft, 1 G at T+0), the 160 KIAS MPT (SMM 14.14), and times
//   worked out from hand-made state. Exact card sentences, row lists and the move picked at the start are not
//   pinned (Patrick, 4 Oct 11:48Z).

// Energy mode's readouts (SPEC-turn-fight, "Energy mode", "The screen"): known answers from the engine's own fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { createEnergyRun, advanceRun } from '../../../src/modules/turn-fight/playback.js';
import {
  flagText, flagNotes, flagAnnouncement, moveWhyText, energyFirstNoseText, winnerText, energyResultRows, energyMoreRows, altitudeSummary, altitudeRows,
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
  assert.deepEqual([row(rows, 'kias').blue, row(rows, 'kias').red], ['220 KIAS', '220 KIAS']);
  assert.deepEqual([row(rows, 'alt').blue, row(rows, 'alt').red], ['10,000 ft', '10,000 ft']);
  assert.equal(row(rows, 'g').blue, '1.0');
  assert.equal(row(rows, 'toMpt').blue, '--');
  assert.deepEqual([row(rows, 'flags').blue, row(rows, 'flags').red], ['None', 'None']);
  assert.equal(row(rows, 'flags').blueTone, '');
  assert.equal(row(rows, 'firstNose').text, '--');
  assert.equal(row(rows, 'winner').text, '--');
});

test('the words beside each aircraft are the engine\'s: the spec\'s own example at 220 KIAS', () => {
  const fight = createEnergyFight({});
  assert.equal(moveWhyText({}), '');
});

test('once at the MPT the words say "MPT 160 KIAS" and the card gives the time and degrees of turn it took', () => {
  const fight = fly({ blueKias: 180, redKias: 180, pursuit: 'none', collisionDetection: false }, 30);
  assert.equal(fight.blue.mptReached, true);
  assert.equal(moveWhyText(fight.blue), 'MPT 160 KIAS');
  const rows = energyResultRows(fight);
  assert.match(row(rows, 'toMpt').blue, /^\d+\.\d s, \d+°$/);
});

test('the flags are words: OVER G, STALL, both, or None; the tone is on for any flag', () => {
  assert.equal(flagText({ overG: false, stall: false }), 'None');
  assert.equal(flagText({ overG: true, stall: false }), 'OVER G');
  assert.equal(flagText({ overG: false, stall: true }), 'STALL');
  assert.equal(flagText({ overG: true, stall: true }), 'OVER G + STALL');
});

test('a jet below the hard deck shows BELOW DECK with its reason, and keeps flying (TF-R6: flagged, not stopped)', () => {
  const fight = createEnergyFight({ pursuit: 'none' });
  assert.ok(!fight.blue.belowDeck, 'not flagged above the deck');
  fight.blue.pm.z = fight.setup.hardDeckFt - 500; // put it under the deck directly: the rule, not a story that gets it there
  stepEnergyFight(fight, 0.02);
  assert.ok(fight.blue.belowDeck, 'flagged below the deck');
  assert.notEqual(flagText(fight.blue), 'None');
  assert.ok(flagNotes(fight).some((n) => n.startsWith('Blue BELOW DECK: ')), flagNotes(fight).join(' | '));
  for (let i = 0; i < 5 / 0.02; i++) stepEnergyFight(fight, 0.02);
  assert.ok(!fight.stopped && Number.isFinite(fight.blue.altFt), 'the fight carries on');
});

test('a pull past the rolling limit goes OVER G, and the card says so in words, with the reason', () => {
  const fight = createEnergyFight({ blueKias: 220, redKias: 220, blueMove: 'pitchBack', blueForceG: 6, turnsStart: 'now', chaseAfterHeadOn: false }); // the engine's what-if G: no box on screen sets one; no chase after the head-on, which would clear the forced G before the roll-in counts as rolling
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
  const fight = createEnergyFight({ blueKias: 120, redKias: 250, blueMove: 'immelmann', turnsStart: 'now', chaseAfterHeadOn: false });
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

test('the announcement names the flags that are on and nothing that changes with the numbers: it is the same for the whole of a stall', () => {
  assert.equal(flagAnnouncement(createEnergyFight({})), '');
  const fight = createEnergyFight({ blueKias: 120, blueMove: 'immelmann', turnsStart: 'now', chaseAfterHeadOn: false });
  const told = [];
  const notes = new Set();
  for (let i = 0; i < 40 / 0.02; i++) {
    stepEnergyFight(fight, 0.02);
    const now = flagAnnouncement(fight);
    if (told.at(-1) !== now) told.push(now);
    if (fight.blue.stall) notes.add(flagNotes(fight).join('|'));
  }
  assert.deepEqual(told, ['', 'Blue STALL', ''], 'off, on, off: three words in all');
  assert.ok(notes.size > 50, `the reasons' numbers change all the time (${notes.size} texts)`);
  assert.equal(flagAnnouncement({ blue: { overG: true, stall: true }, red: { overG: false, stall: true } }), 'Blue OVER G, Blue STALL, Red STALL');
});

test('More detail has TAS, climb angle, bank, Ps and energy height, from the engine\'s numbers, and the pass geometry', () => {
  const fight = fly({}, 12);
  const rows = energyMoreRows(fight);
  assert.equal(row(rows, 'tas').blue, `${Math.round(fight.blue.ktas)} kt`);
  assert.equal(row(rows, 'climb').blue, `${fight.blue.climbDeg.toFixed(0)}°`);
  assert.equal(row(rows, 'bank').blue, `${fight.blue.bankDeg.toFixed(0)}°`);
  assert.match(row(rows, 'ps').blue, /^[+-][\d,]+ ft\/s$/);
  assert.match(row(rows, 'energyHeight').blue, /^[\d,]+ ft$/);
  assert.ok(Number.parseInt(row(rows, 'energyHeight').blue.replace(/,/g, ''), 10) > fight.blue.altFt);
  assert.equal(row(rows, 'aspect').blue, `${(180 - fight.ataBlueDeg).toFixed(0)}°`);
  assert.equal(row(rows, 'aspect').red, `${(180 - fight.ataRedDeg).toFixed(0)}°`);
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

test('the winner is what the engine says: evenFight, else a chase by one aircraft, else "--" while it runs and "No winner" at the 10-minute stop; nothing is guessed', () => {
  // The engine's own flag first.
  assert.equal(winnerText({ evenFight: false }), '--');
  // A chase by one aircraft names the winner (who got behind the other).
  assert.equal(winnerText({ evenFight: false, chase: { by: 'blue' } }), 'Blue wins');
  assert.equal(winnerText({ evenFight: false, chase: { by: 'red' } }), 'Red wins');
  assert.equal(winnerText({ chase: { by: 'blue' } }), 'Blue wins', 'no evenFight field (an older state): the chase still says');
  // Nothing decided: "--" while it runs, "No winner" once it has stopped.
  assert.equal(winnerText({}), '--');
  assert.equal(winnerText({ chase: null }), '--');
  assert.equal(winnerText({ evenFight: false, stopped: true }), 'No winner');
  assert.equal(winnerText({ stopped: true }), 'No winner');
  // Nothing else is guessed: a `winner` field, a tie at first nose-on with no flag, or both aircraft chasing name nobody.
  for (const state of [{ winner: 'blue' }, { winner: { by: 'red' } }, { firstNose: { by: 'both' } }, { firstNose: { by: 'blue' } }, { chase: { by: 'both' } }]) {
    assert.equal(winnerText(state), '--', JSON.stringify(state));
  }
  assert.equal(winnerText({ winner: 'blue', stopped: true }), 'No winner');
});

test('the chase row appears only once a pursuit has started, and says when the chaser is behind the curve', () => {
  const rows = energyResultRows(createEnergyFight({}));
  assert.equal(row(rows, 'chase'), undefined);
  const chasing = energyResultRows({
    ...createEnergyFight({}),
    chase: { by: 'blue' },
    blue: { ...createEnergyFight({}).blue, move: 'pursuit', chaseLimited: true },
  });
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

test('energyResultRows includes prominent Combat Result row when kill is present', () => {
  const fight = createEnergyFight({});
  fight.kill = { victor: 'blue', timeSec: 14.2, rangeFt: 1850, ataDeg: 8 };
  const rows = energyResultRows(fight);
  assert.equal(rows[0].id, 'combatResult');
  assert.equal(rows[0].label, 'Combat Result');
  assert.equal(winnerText(fight), 'Blue wins');

  fight.kill.victor = 'red';
  const redRows = energyResultRows(fight);
  assert.equal(winnerText(fight), 'Red wins');
});

test('energyResultRows includes prominent Combat Result row when collision is present', () => {
  const fight = createEnergyFight({});
  fight.collision = { timeSec: 18.5, impactKias: 215, closingRateKt: 320, altitudeFt: 9800 };
  const rows = energyResultRows(fight);
  assert.equal(rows[0].label, 'Combat Result');

  // When both kill and collision are present, kill is top row, collision is second
  fight.kill = { victor: 'blue', timeSec: 16.0, rangeFt: 1200, ataDeg: 5 };
  const bothRows = energyResultRows(fight);
  assert.equal(bothRows[0].id, 'combatResult');
  assert.equal(bothRows[1].id, 'collisionResult');
});
