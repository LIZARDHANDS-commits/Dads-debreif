// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Fluid manoeuvring, the simplified baseline (spec section 10.3, TS-57). What a pilot would recognise, with the numbers
// written out here from their sources, not read from the code:
//  - it starts only from fighting wing (Patrick 21:44Z);
//  - #2 stays 500 to 1,000 ft from Lead (SMM 16.17 para 42), inside the 60° cone, 30° either side of Lead's tail
//    (Patrick's pick 19:20Z row 2), at the distance set (600 ft, Patrick's pick row 3) within the shared ±100 ft;
//  - Lead's level turn is level (shared ±100 ft); nobody rolls faster than 90°/s (TS-37) and G never jumps;
//  - Terminate ends with the pair in fighting wing (Patrick's pick row 7);
//  - climb and descend (V2.18): Lead climbs or descends and levels off, #2 follows in the cone, G stays positive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { judgeFormation } from '../../../src/modules/turn-sim/live/transitions.js';
import { checkFluidRange } from '../../../src/modules/turn-sim/live/fluid.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const SMM_BAND_FT = [500, 1000]; // SMM 16.17 para 42
const CONE_HALF_DEG = 30; // Patrick 19:20Z row 2
const SET_FT = 600; // Patrick 19:20Z row 3 (the default)
const ROLL_MAX_DPS = 90; // TS-37
const ROLL_SLACK_DPS = 0.5; // rounding of the eased roll

/** A 2-ship flown from the default start into fighting wing (a generous 3 minutes: TS-53's change limit). */
function inFightingWing() {
  const f = createFormation();
  assert.equal(f.change('fw'), 'started');
  for (let i = 0; i < 3600 && f.state.current; i++) f.step();
  assert.equal(f.where().key, 'fw');
  return f;
}

/** Flies sec seconds, watching #2 against Lead once he is in the cone (after the entry's blend). */
function fly(f, sec, watch) {
  for (let i = 0; i < Math.round(sec / 0.05); i++) {
    const before = f.state.aircraft.map((a) => ({ g: a.g }));
    f.step();
    if (!f.state.fluid) break;
    watch?.(f, before);
  }
}

/** The checks a pilot would make while #2 is in the cone. Returns a watcher for fly(). */
function inTheCone(failures) {
  return (f, before) => {
    const now = f.state.fluid.session.now();
    if (now.wingCue === 'entry' || now.wingCue === 'back to fighting wing') return;
    const r = f.state.fluid.readouts;
    const [lead, wing] = f.state.aircraft;
    if (r.rangeFt < SMM_BAND_FT[0] || r.rangeFt > SMM_BAND_FT[1]) failures.push(`range ${Math.round(r.rangeFt)} ft outside 500-1,000`);
    if (Math.abs(r.rangeFt - SET_FT) > TOLERANCES.DISTANCE_FT) failures.push(`range ${Math.round(r.rangeFt)} ft, set ${SET_FT}`);
    if (r.aspectDeg > CONE_HALF_DEG + TOLERANCES.ANGLE_DEG) failures.push(`aspect ${Math.round(r.aspectDeg)}° outside the cone`);
    for (const [i, a] of [lead, wing].entries()) {
      if (Math.abs(a.rollRateDps) > ROLL_MAX_DPS + ROLL_SLACK_DPS) failures.push(`${a.name} rolling ${Math.round(a.rollRateDps)}°/s`);
      if (Math.abs(a.g - before[i].g) > TOLERANCES.G_FORCE) failures.push(`${a.name}'s G jumped ${before[i].g.toFixed(2)} to ${a.g.toFixed(2)}`);
    }
  };
}

test('fluid manoeuvring starts only from fighting wing', () => {
  const f = createFormation(); // the default start, line abreast
  assert.equal(f.change('fluid'), 'refused');
  assert.ok(f.state.refusal);
  assert.equal(f.state.fluid, null);
  const g = inFightingWing();
  assert.equal(g.change('fluid'), 'started');
  assert.equal(g.where().key, 'fluid');
  const four = createFormation({ ships: 4 });
  assert.equal(four.change('fluid'), 'refused'); // the four's fluid manoeuvring is a later piece
});

test('a level turn and a reversal: Lead stays level and #2 stays in the cone at the distance set, with no jumps', () => {
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = inTheCone(failures);
  fly(f, 30, watch); // the entry (a Lead press during it would wait)
  const alt0 = f.state.aircraft[0].altAboveFt;
  assert.equal(f.pressFluid('levelTurn', -1), 'started');
  fly(f, 30, watch);
  const lead = f.state.aircraft[0];
  assert.ok(lead.bankDeg < -45, `Lead in a right turn, bank ${Math.round(lead.bankDeg)}`);
  assert.equal(f.pressFluid('reversal'), 'started');
  fly(f, 30, watch);
  assert.ok(lead.bankDeg > 45, `Lead reversed to the left, bank ${Math.round(lead.bankDeg)}`);
  assert.ok(Math.abs(lead.altAboveFt - alt0) <= TOLERANCES.DISTANCE_FT, `Lead held his height (${Math.round(lead.altAboveFt - alt0)} ft)`);
  assert.deepEqual(failures.slice(0, 5), []);
});

test('Terminate brings the pair back to fighting wing', () => {
  const f = inFightingWing();
  f.change('fluid');
  fly(f, 30);
  f.pressFluid('levelTurn', 1);
  fly(f, 20);
  assert.equal(f.pressFluid('terminate'), 'started');
  fly(f, 120); // a generous 2 minutes: a gentle 90° turn, the roll-out and #2's move back
  assert.equal(f.state.fluid, null);
  assert.equal(f.where().key, 'fw');
  const [lead, wing] = f.state.aircraft;
  assert.ok(judgeFormation('fw', lead, wing).inBand);
});

test('a reversal needs a turn to reverse, and a distance outside 500-1,000 ft is refused', () => {
  const f = inFightingWing();
  f.change('fluid');
  fly(f, 30);
  f.pressFluid('wingsLevel');
  fly(f, 10);
  assert.equal(f.pressFluid('reversal'), 'refused');
  assert.ok(f.state.refusal);
  assert.equal(checkFluidRange(400).ok, false);
  assert.equal(checkFluidRange(1200).ok, false);
  assert.equal(checkFluidRange(750).ok, true);
});

test('climb and descend: Lead pitches up or down and levels off, #2 follows him in the cone at the distance set, G stays positive', () => {
  // Patrick's list and design 5.1 (Lead's climb and descend); #2 follows Lead's plane of motion (SMM 16.16 para 39c);
  // Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a).
  const f = inFightingWing();
  f.change('fluid');
  const failures = [];
  const watch = inTheCone(failures);
  const positive = (ff) => {
    for (const a of ff.state.aircraft) if (a.g <= 0) failures.push(`${a.name} at ${a.g.toFixed(2)} G`);
  };
  fly(f, 30, watch);
  f.pressFluid('wingsLevel');
  fly(f, 10, watch);
  const lead = f.state.aircraft[0];
  const alt0 = lead.altAboveFt;
  assert.equal(f.pressFluid('climb'), 'started');
  fly(f, 60, (ff, before) => { // a generous minute to climb and level off
    watch(ff, before);
    positive(ff);
  });
  assert.ok(lead.altAboveFt > alt0 + 1000, `Lead climbed (${Math.round(lead.altAboveFt - alt0)} ft)`);
  assert.ok(Math.abs(lead.climbFtps) < 5, `Lead levelled off (${lead.climbFtps.toFixed(1)} ft/s)`);
  const alt1 = lead.altAboveFt;
  assert.equal(f.pressFluid('descend'), 'started');
  fly(f, 60, (ff, before) => {
    watch(ff, before);
    positive(ff);
  });
  assert.ok(lead.altAboveFt < alt1 - 1000, `Lead descended (${Math.round(lead.altAboveFt - alt1)} ft)`);
  assert.ok(Math.abs(lead.climbFtps) < 5, `Lead levelled off (${lead.climbFtps.toFixed(1)} ft/s)`);
  assert.deepEqual(failures.slice(0, 5), []);
});
