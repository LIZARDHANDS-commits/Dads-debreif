// The Energy engine and the T-6A's Mach limit (core #211 and #218; SPEC-turn-fight, "Limits").
//
// Two speeds are in play. Core's maxKiasT6A follows the NFM's chart line in calibrated airspeed (316 to 18,769 ft, then
// Mach 0.67: 309 at 20,000 ft, 279 at 25,000 ft). The Turn Fight flies the model's own IAS, TAS x sqrt(sigma), with no
// compressibility, which reads about 9 kt lower at the same Mach number at 25,000 ft. The engine compares like with like:
// its limit is the TAS at Mach 0.67 turned back into the model's IAS (or VMO where that is lower), so the true airspeed
// never goes over Mach 0.67. The tests take that limit from Mach 0.67 through core's atmosphere, not from the engine.
//
// Part 1: below about 17,600 ft the top speed is exactly VMO, so a fight whose chase stays under that height flies the
// speed guard exactly as it did before the Mach limit. (A chaser that starts lower can climb past the crossover; there
// the guard is meant to tighten.)
// Part 2: above it the limit is Mach 0.67.
// Which tests tell the new engine from the old: the merge-speed refusals and "a chaser diving ... trips the guard". The
// "never over Mach 0.67" fights pass on the old engine too; they are regression guards, not tests of this change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { T6A_LIMITS, maxKiasT6A } from '../../../src/core/t6-performance.js';
import { createEnergyFight, stepEnergyFight, energyTopKias } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { nfmTopKias, machAt, modelTopKias, NFM_LIMIT } from './nfm-limit.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} (±${tol})`);

// ── Part 1: VMO, exactly, below about 17,600 ft ──────────────────────────────

test('core: maxKiasT6A is exactly VMO (316) from 0 to 18,800 ft, in 1 ft steps', () => {
  for (let altFt = 0; altFt <= 18800; altFt++) {
    if (maxKiasT6A(altFt) !== T6A_LIMITS.vmoKias) assert.fail(`maxKiasT6A(${altFt}) is ${maxKiasT6A(altFt)}, not ${T6A_LIMITS.vmoKias}`);
  }
});

test('the engine\'s top speed is exactly VMO (316) at every height from 0 to 17,500 ft, in 1 ft steps, so the chaser\'s guard there is what it was', () => {
  for (let altFt = 0; altFt <= 17500; altFt++) {
    if (energyTopKias(altFt) !== T6A_LIMITS.vmoKias) assert.fail(`energyTopKias(${altFt}) is ${energyTopKias(altFt)}, not ${T6A_LIMITS.vmoKias}`);
  }
});

test('a merge at 316 KIAS is accepted from the deck to 17,500 ft, and 317 is refused', () => {
  for (const altFt of [6000, 10000, 15000, 17000, 17500]) {
    assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 316, redKias: 316 }), `316 at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit/, `317 at ${altFt} ft`);
  }
});

// ── Part 2: above it the limit is Mach 0.67 ──────────────────────────────────

test('the NFM limit line, worked from the figure (calibrated airspeed): 316 to 18,769 ft, about 309 at 20,000 ft, about 279 at 25,000 ft, 244 at 31,000 ft', () => {
  assert.equal(nfmTopKias(18000), 316);
  assert.equal(nfmTopKias(18769), 316);
  assert.equal(Math.round(nfmTopKias(20000)), 309);
  assert.equal(Math.round(nfmTopKias(25000)), 279);
  assert.equal(nfmTopKias(31000), 244);
});

test('core: maxKiasT6A follows the NFM line (calibrated airspeed) to within a chart reading, 2 KIAS', () => {
  for (const altFt of [18700, 20000, 22000, 25000, 31000]) near(maxKiasT6A(altFt), nfmTopKias(altFt), 2, `at ${altFt} ft`);
});

test('the engine\'s limit is Mach 0.67 in the model\'s own IAS: about 300 KIAS at 20,000 ft and 270 at 25,000 ft, 9 kt under the chart\'s calibrated speed', () => {
  for (const altFt of [18000, 20000, 22000, 25000]) {
    near(energyTopKias(altFt), modelTopKias(altFt), 1e-9, `at ${altFt} ft`);
    if (altFt >= 20000) near(machAt(energyTopKias(altFt), altFt), NFM_LIMIT.mmo, 1e-9, `Mach at the limit, ${altFt} ft`);
  }
  assert.equal(Math.round(energyTopKias(20000)), 300);
  assert.equal(Math.round(energyTopKias(25000)), 270);
  assert.ok(nfmTopKias(25000) - energyTopKias(25000) > 8, 'the chart\'s calibrated speed reads about 9 kt higher at the same Mach');
});

test('at 25,000 ft a merge at 300 KIAS is refused, at either aircraft, and the message names the limit there, 270 KIAS at Mach 0.67', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300, redKias: 220 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 220, redKias: 300 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 271 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS/);
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 270, redKias: 270 });
  assert.equal(s.blue.kias, 270);
  assert.equal(s.red.kias, 270);
});

test('the merge check is the Mach number, not the chart\'s calibrated speed: at 25,000 ft 279 KIAS (the chart\'s figure) is over Mach 0.67 in the model and is refused', () => {
  assert.ok(machAt(279, 25000) > NFM_LIMIT.mmo + 0.02, 'the model flies 279 KIAS at 25,000 ft well over Mach 0.67');
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 279 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS, Mach 0\.67\), got 279/);
  // The highest whole KIAS accepted is the one within half a knot of Mach 0.67.
  for (const altFt of [19000, 20000, 22000, 25000]) {
    const top = Math.round(modelTopKias(altFt));
    assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: top, redKias: top }), `${top} at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: top + 1 }), /limit at/, `${top + 1} at ${altFt} ft`);
    assert.ok(machAt(top, altFt) <= NFM_LIMIT.mmo + 0.0015, `${top} KIAS at ${altFt} ft is Mach ${machAt(top, altFt).toFixed(4)}`);
    assert.ok(machAt(top + 1, altFt) > NFM_LIMIT.mmo, `${top + 1} KIAS at ${altFt} ft is over Mach 0.67`);
  }
});

test('each aircraft is checked at its own start height: Blue 316 at 10,000 ft is fine while Red 300 at 25,000 ft is refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 300, separationNm: 4 }), /Red's merge speed is above the T-6A's limit at 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 270, separationNm: 4 }));
});

test('at 20,000 ft the limit is 300 KIAS: 300 is accepted, 301 refused', () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 300, redKias: 300 }));
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 301 }), /Blue's merge speed is above the T-6A's limit at 20,000 ft \(300 KIAS, Mach 0\.67\), got 301/);
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 316 }), /limit at 20,000 ft/);
});

test('the height check comes first: a speed over the limit is refused with the limit at that height, whatever the height (VMO below the crossover, Mach 0.67 above it)', () => {
  assert.throws(() => createEnergyFight({ blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 317/);
  assert.throws(() => createEnergyFight({ redKias: 400 }), /Red's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 400/);
  // Above the crossover a speed over VMO gets the Mach limit's message, not "40 to 316".
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, redKias: 400 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS, Mach 0\.67\), got 400/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(270 KIAS, Mach 0\.67\), got 317/);
});

test('a speed under 40 or not a number still names the box and the range at that height', () => {
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias is from 40 to 316 KIAS, got NaN/);
  assert.throws(() => createEnergyFight({ redKias: 39 }), /redKias is from 40 to 316 KIAS, got 39/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 39 }), /blueKias is from 40 to 270 KIAS, got 39/);
});

/**
 * Flies ten minutes and returns the most any aircraft went over the top speed at its own height (Mach 0.67 in the model's
 * IAS, or VMO), how far its true airspeed went over Mach 0.67, and the moves seen.
 * Auto flies (both blue and red), so this is what the model pilot does, not a forced what-if.
 */
function overTheLimit(setup) {
  const s = createEnergyFight(setup);
  let over = -Infinity, overMach = -Infinity, fastest = 0;
  const moves = new Set();
  for (let i = 0; i < 30000; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      over = Math.max(over, a.kias - modelTopKias(a.altFt));
      overMach = Math.max(overMach, machAt(a.kias, a.altFt) - NFM_LIMIT.mmo);
      fastest = Math.max(fastest, a.kias);
      moves.add(a.move);
    }
  }
  return { over, overMach, fastest, moves, s };
}
/** A start at the merge speed's own limit reads a fraction of a knot over it, and 2 KIAS is the slack the check allows. */
const SLACK_KIAS = 2;

const HIGH_FIGHTS = {
  'an Immelmann from the merge (at the limit, against the same)': { setup: (alt) => ({ blueKias: Math.round(modelTopKias(alt)), redKias: Math.round(modelTopKias(alt)) }), moves: ['immelmann'] },
  'a split S from the merge (100 against 100)': { setup: () => ({ blueKias: 100, redKias: 100 }), moves: ['splitS'] },
  'a pursuit dive (Blue 100 against Red 220)': { setup: () => ({ blueKias: 100 }), moves: ['pursuit'] },
  'a pursuit dive (Blue 220 against Red 180)': { setup: () => ({ redKias: 180 }), moves: ['pursuit'] },
  'a fast one-circle chase after a head-on pass (265 against 133)': { setup: () => ({ blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 }), moves: ['pursuit'] },
};
for (const altFt of [25000, 20000]) {
  for (const pursuit of altFt === 25000 ? ['pure', 'lead', 'lag'] : ['pure']) {
    for (const [name, { setup, moves }] of Object.entries(HIGH_FIGHTS)) {
      test(`from ${altFt.toLocaleString('en-US')} ft, ${name}, ${pursuit} pursuit, ten minutes: never over Mach 0.67 at its height (regression guard)`, () => {
        const r = overTheLimit({ blueAltFt: altFt, redAltFt: altFt, pursuit, ...setup(altFt) });
        for (const m of moves) assert.ok(r.moves.has(m), `the fight flew ${m} (${[...r.moves].join(', ')})`);
        assert.ok(r.over <= SLACK_KIAS, `${r.over.toFixed(1)} KIAS over the top speed at its height (fastest ${r.fastest.toFixed(0)})`);
        assert.ok(r.overMach <= 0.01, `Mach ${(NFM_LIMIT.mmo + r.overMach).toFixed(3)}`);
      });
    }
  }
}

test('a chaser diving from 25,000 ft trips the guard at the Mach 0.67 point, 40 KIAS under it at its height, not at VMO less 40', () => {
  // The guard is the top speed at the chaser's own height less 40 KIAS, in the model's IAS: at 22,000 ft (Mach 0.67 is 288 KIAS
  // there) it starts at 248, where the old guard (VMO 316 - 40 = 276) did not. This fight, flown to a chase from 25,000 ft, reached
  // 279 KIAS at 21,800 ft under the old guard: 31 KIAS over the new one.
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 });
  let worst = -Infinity, fastestMach = 0, chasingHigh = 0;
  for (let i = 0; i < 30000; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      if (a.move !== 'pursuit' || a.altFt < 18000) continue;
      chasingHigh++;
      const overGuard = a.kias - (modelTopKias(a.altFt) - 40);
      worst = Math.max(worst, overGuard);
      fastestMach = Math.max(fastestMach, machAt(a.kias, a.altFt));
    }
  }
  assert.ok(chasingHigh > 500, `a chase flew above 18,000 ft (${chasingHigh} steps)`);
  assert.ok(worst <= 12, `the chaser went ${worst.toFixed(1)} KIAS over its guard speed`);
  assert.ok(worst > -20, `the guard was in play: the chaser got to within 20 KIAS of it (${worst.toFixed(1)} KIAS over)`);
  assert.ok(fastestMach < NFM_LIMIT.mmo - 0.03, `Mach ${fastestMach.toFixed(3)}: kept under the Mach 0.67 point by about the margin`);
});

test('at 25,000 ft the guard trips at the Mach 0.67 point in the model\'s own speed: a chaser at 265 or 245 KIAS is asked to climb at once, more than a guard 9 kt higher (the chart\'s calibrated speed) would ask', () => {
  // A chaser starting from behind at 25,000 ft. The guard is 270 - 40 = 230 KIAS; a guard on the chart's 279 would be 239.
  // After 2 s, measured on this engine: 13° of climb from 265 KIAS (9° with a guard 9 kt higher) and 5° from 245 KIAS (1°).
  for (const [kias, minClimbDeg] of [[265, 11], [245, 3]]) {
    const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: kias, redKias: 160, ataDeg: 0, aaDeg: 0, turnsStart: 'now', separationNm: 0.5, pursuit: 'pure' });
    for (let i = 0; i < 100; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
    assert.equal(s.blue.move, 'pursuit', 'the chase is on');
    assert.ok(s.blue.climbDeg >= minClimbDeg, `${kias} KIAS: ${s.blue.climbDeg.toFixed(1)}° of climb after 2 s, wanted ${minClimbDeg}° or more`);
  }
});
