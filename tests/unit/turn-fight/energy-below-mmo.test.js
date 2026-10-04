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

// The Energy engine and the T-6A's top speed (TF-R4, Turn Fight testing rule F3, T10; SPEC-turn-fight, "Limits").
//
// The top speed is a published limit: VMO 316 KIAS up to and including 18,769 ft, then the Mach 0.67 line down to 244 KIAS at
// 31,000 ft (NFM Figure 4-1-2). It is a reference, not a wall: the model pilot (the AI) chooses to stay under it, and a jet forced
// past it keeps flying. The NFM line is worked out in nfm-limit.js, apart from the code under test; the checks below read it from there.
//
// What is NOT checked here: how far under the NFM line the engine keeps its own limit. The engine flies in the model's IAS, which has
// no compressibility, so its limit sits under the NFM's KIAS line up high; that margin is the model's business, not a requirement.
//
// Not testable yet (reported to Patrick): that a jet forced past the top speed SHOWS A FLAG. The engine has two flags only,
// OVER G and STALL (energy-readouts.js flagText); nothing flags the top speed or the hard deck. TF-R4 and TF-R6 want both.
// When the engine gets those flags, the forced-past test below gets its "shows the flag" check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { T6A_LIMITS, maxKiasT6A, iasToTasKt, speedOfSoundKt } from '../../../src/core/t6-performance.js';
import { createEnergyFight, stepEnergyFight, energyTopKias, ENERGY_DEFAULT_SETUP, ENERGY_MAX_START_FT } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { nfmTopKias, CHART_READ_KIAS } from './nfm-limit.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} (±${tol})`);
const nfm25 = Math.round(nfmTopKias(25000)); // 279
const nfm20 = Math.round(nfmTopKias(20000)); // 309
const CROSSOVER_FT = 17570; // where Mach 0.67 in the model's IAS equals VMO (17,566 ft, to the nearest 10 ft)
const FLIGHT_SEC = 180; // a fight window, not a gate: the AI's first moves, dives and chase all happen well inside 3 minutes, and a light run is enough (T9)

// ── VMO up to about 17,570 ft ────────────────────────────────────────────────

test('the engine\'s top speed is exactly VMO (316) from 0 to 17,560 ft, in 1 ft steps, and under it from 17,570 ft, so the chaser\'s guard there is what it was', () => {
  for (let altFt = 0; altFt <= CROSSOVER_FT - 10; altFt++) {
    if (energyTopKias(altFt) !== T6A_LIMITS.vmoKias) assert.fail(`energyTopKias(${altFt}) is ${energyTopKias(altFt)}, not ${T6A_LIMITS.vmoKias}`);
  }
  assert.ok(energyTopKias(CROSSOVER_FT) < T6A_LIMITS.vmoKias);
  assert.ok(energyTopKias(CROSSOVER_FT + 30) < energyTopKias(CROSSOVER_FT));
});

test('a merge at 316 KIAS is accepted from the deck to 17,560 ft, and 317 is refused', () => {
  for (const altFt of [6000, 10000, 15000, 17000, 17500, CROSSOVER_FT - 10]) {
    assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 316, redKias: 316 }), `316 at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit.*\(316 KIAS, VMO\)/, `317 at ${altFt} ft`);
  }
});

// ── The NFM line, from the figure ────────────────────────────────────────────

test('the NFM limit line (which core\'s maxKiasT6A follows, not the engine), worked from the figure: 316 to 18,769 ft, about 309 at 20,000 ft, about 279 at 25,000 ft, 244 at 31,000 ft', () => {
  assert.equal(nfmTopKias(18000), 316);
  assert.equal(nfmTopKias(18769), 316);
  assert.equal(nfm20, 309);
  assert.equal(nfm25, 279);
  assert.equal(nfmTopKias(31000), 244);
});

test('core: maxKiasT6A follows the NFM line to within a chart reading, 2 KIAS', () => {
  for (const altFt of [18700, 20000, 22000, 25000, 31000]) near(maxKiasT6A(altFt), nfmTopKias(altFt), CHART_READ_KIAS, `at ${altFt} ft`);
});

test('the engine\'s own top speed never sits above the NFM line at any height (how far under it is not checked)', () => {
  // The chart is a straight line read off a printed figure, so allow a chart reading (2 KIAS) over it.
  for (let altFt = 0; altFt <= 31000; altFt += 250) {
    assert.ok(energyTopKias(altFt) <= nfmTopKias(altFt) + CHART_READ_KIAS, `${energyTopKias(altFt).toFixed(1)} KIAS at ${altFt} ft, NFM line ${nfmTopKias(altFt).toFixed(1)}`);
  }
});

// ── Merge speeds the setup refuses ───────────────────────────────────────────

test('at 25,000 ft a merge at the NFM line\'s own speed or above is refused for either aircraft, with the limit at that height named, and a moderate speed is accepted', () => {
  const refusal = /merge speed is above the T-6A's limit at 25,000 ft \(\d+ KIAS in the model, Mach 0\.67/;
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300, redKias: 220 }), refusal);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 220, redKias: 300 }), refusal);
  // The NFM's own KIAS at that height would be Mach 0.69 in the model, so it is refused too.
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: nfm25 }), refusal);
  const moderate = nfm25 - 40; // well under the line
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: moderate, redKias: moderate });
  near(s.blue.kias, moderate, 0.01, 'blue starts at the speed asked for'); // the speed goes through true airspeed and back, so allow rounding
  near(s.red.kias, moderate, 0.01, 'red starts at the speed asked for');
});

// What the model actually flies at the highest merge speed the engine accepts. (The NFM line is a compressible KIAS; the model's
// IAS has no compressibility, so a check against that line alone let the model fly Mach 0.69.)
const accepts = (altFt, kias) => { try { createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: kias }); return true; } catch { return false; } };
const modelMach = (kias, altFt) => iasToTasKt(kias, altFt) / speedOfSoundKt(altFt);

test('at every start height from the deck to 25,000 ft (500 ft steps) the highest merge speed accepted is under VMO and the NFM line and flies at Mach 0.67 or less in the model', () => {
  const heights = [];
  for (let h = ENERGY_DEFAULT_SETUP.hardDeckFt; h <= ENERGY_MAX_START_FT; h += 500) heights.push(h);
  for (const altFt of heights) {
    let top = 316;
    while (top > 40 && !accepts(altFt, top)) top--;
    assert.ok(top > 200 && top <= T6A_LIMITS.vmoKias, `a merge speed is accepted at ${altFt} ft (${top})`);
    assert.ok(top <= nfmTopKias(altFt) + CHART_READ_KIAS, `${top} KIAS at ${altFt} ft is over the NFM line (${nfmTopKias(altFt).toFixed(1)})`);
    assert.ok(modelMach(top, altFt) <= T6A_LIMITS.mmo, `${top} KIAS at ${altFt} ft flies Mach ${modelMach(top, altFt).toFixed(4)} in the model, over ${T6A_LIMITS.mmo}`);
  }
});

test('each aircraft is checked at its own start height: Blue 316 at 10,000 ft is fine while Red 300 at 25,000 ft is refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 300, separationNm: 4 }), /Red's merge speed is above the T-6A's limit at 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: nfm25 - 40, separationNm: 4 }));
});

test('at 20,000 ft the NFM line\'s own speed and VMO are refused, and a moderate speed is accepted', () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: nfm20 - 40, redKias: nfm20 - 40 }));
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: nfm20 }), /limit at 20,000 ft/);
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 316 }), /limit at 20,000 ft/);
});

test('the height check comes first: a speed over the limit is refused with the limit at that height, whatever the height (VMO below the crossover, Mach 0.67 above it)', () => {
  assert.throws(() => createEnergyFight({ blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 317/);
  assert.throws(() => createEnergyFight({ redKias: 400 }), /Red's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 400/);
  // Above the crossover a speed over VMO gets the Mach limit's message, not "40 to 316".
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, redKias: 400 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(\d+ KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 400/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(\d+ KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 317/);
});

test('a speed under 40 or not a number still names the box and the range at that height', () => {
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias is from 40 to 316 KIAS, got NaN/);
  assert.throws(() => createEnergyFight({ redKias: 39 }), /redKias is from 40 to 316 KIAS, got 39/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 39 }), /blueKias is from 40 to \d+ KIAS, got 39/);
});

// ── The AI keeps under the top speed by choice ───────────────────────────────

/**
 * Flies FLIGHT_SEC and returns the most any aircraft went over the NFM line at its own height, and the moves seen.
 * Auto flies (both blue and red), so these are what the model pilot chooses to do.
 */
function overTheNfmLine(setup) {
  const s = createEnergyFight(setup);
  let over = -Infinity, fastest = 0;
  const moves = new Set();
  for (let i = 0; i < FLIGHT_SEC / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      over = Math.max(over, a.kias - nfmTopKias(a.altFt));
      fastest = Math.max(fastest, a.kias);
      moves.add(a.move);
    }
  }
  return { over, fastest, moves, s };
}

const HIGH_FIGHTS = {
  // The merge speed is the highest the setup accepts at that height (an input, taken from the engine's entry limit).
  'Auto from the merge at the top speed against the same': { setup: (alt) => ({ blueKias: Math.floor(energyTopKias(alt)), redKias: Math.floor(energyTopKias(alt)) }), moves: () => ['immelmann'] },
  'a split S from the merge (100 against 100)': { setup: () => ({ blueKias: 100, redKias: 100 }), moves: () => ['splitS'] },
  'a pursuit dive (Blue 100 against Red 220)': { setup: () => ({ blueKias: 100 }), moves: () => ['pursuit'] },
  'a pursuit dive (Blue 220 against Red 180)': { setup: () => ({ redKias: 180 }), moves: () => ['pursuit'] },
  'a fast one-circle chase after a head-on pass (265 against 133)': { setup: () => ({ blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 }), moves: () => ['pursuit'] },
};
for (const altFt of [25000, 20000]) {
  for (const pursuit of altFt === 25000 ? ['pure', 'lead', 'lag'] : ['pure']) {
    for (const [name, { setup, moves }] of Object.entries(HIGH_FIGHTS)) {
      test(`from ${altFt.toLocaleString('en-US')} ft, ${name}, ${pursuit} pursuit: the AI's chosen speed stays under the NFM line at its height`, () => {
        const r = overTheNfmLine({ blueAltFt: altFt, redAltFt: altFt, pursuit, ...setup(altFt) });
        for (const m of moves(altFt)) assert.ok(r.moves.has(m), `the fight flew ${m} (${[...r.moves].join(', ')})`);
        assert.ok(r.over <= 0, `${r.over.toFixed(1)} KIAS over the NFM line at its height (fastest ${r.fastest.toFixed(0)})`);
      });
    }
  }
}

test('Auto at the top merge speed at 25,000 ft picks an Immelmann (over the top at 120 KIAS or more, the engine\'s Immelmann gate)', () => {
  const top = Math.floor(energyTopKias(25000));
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: top, redKias: top, pursuit: 'pure' });
  for (const ac of [s.blue, s.red]) {
    assert.equal(ac.move, 'immelmann');
    assert.match(ac.why, new RegExp(`^Immelmann: ${top} KIAS, other aircraft 180° off the nose, over the top at \\d+ KIAS`));
  }
});

/** A chaser starting from behind at 25,000 ft at `kias`, 0.5 NM back of a 160 KIAS target: the climb it has asked for after 2 s. */
function climbAfter2Sec(kias) {
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: kias, redKias: 160, ataDeg: 0, aaDeg: 0, turnsStart: 'now', separationNm: 0.5, pursuit: 'pure' });
  for (let i = 0; i < 100; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.equal(s.blue.move, 'pursuit', 'the chase is on');
  return s.blue.climbDeg;
}

test('a chaser starting fast at 25,000 ft keeps its nose up the faster it is, to stay under the top speed (never less climb at a higher speed)', () => {
  const speeds = [200, 230, 250, 265];
  const climbs = speeds.map(climbAfter2Sec);
  // Half a degree of slack: below the point where the chaser needs to climb its path is level to within a fraction of a degree.
  for (let i = 1; i < climbs.length; i++) assert.ok(climbs[i] >= climbs[i - 1] - 0.5, `${speeds[i]} KIAS asks ${climbs[i].toFixed(1)}° of climb, less than ${speeds[i - 1]} KIAS (${climbs[i - 1].toFixed(1)}°)`);
  assert.ok(climbs.at(-1) > climbs[0] + 5, `the fastest chaser (${climbs.at(-1).toFixed(1)}°) climbs clearly more than the slowest (${climbs[0].toFixed(1)}°)`);
});

// ── Forced past the top speed: a published limit is a reference, not a wall (F3, T10) ──

test('a jet forced past the NFM line (a split S from 265 KIAS) goes past it and keeps flying: nothing holds it at the limit, and the fight carries on to a steady turn', () => {
  for (const altFt of [10000, 25000]) {
    const s = createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 265, redKias: 265, blueMove: 'splitS', redMove: 'splitS', pursuit: 'none' });
    let fastest = 0;
    for (let i = 0; i < FLIGHT_SEC / FIGHT_STEP_SEC; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      fastest = Math.max(fastest, s.blue.kias);
    }
    // The what-if has to be a real one: the dive must have gone past the line, or this test says nothing about being held at it.
    assert.ok(fastest > nfmTopKias(s.blue.altFt) + 1, `the forced split S from ${altFt} ft went past the NFM line (fastest ${fastest.toFixed(0)} KIAS)`);
    assert.ok(!s.stopped, 'the fight is not stopped by it');
    assert.ok(Math.abs(s.timeSec - FLIGHT_SEC) < 1, 'the fight clock kept running');
    for (const k of ['kias', 'altFt', 'g', 'bankDeg', 'climbDeg']) assert.ok(Number.isFinite(s.blue[k]), `blue.${k} is finite`);
    // It came back: the speed it carried past the line is gone by the end, and the jet is above the ground (physical limit, F3).
    assert.ok(s.blue.kias < fastest - 50, `the jet slowed again (now ${s.blue.kias.toFixed(0)} KIAS)`);
    assert.ok(s.blue.altFt > 0, 'the jet is above the ground');
  }
});
