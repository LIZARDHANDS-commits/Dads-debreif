// The Energy engine and the T-6A's Mach limit (core #211 and #218; SPEC-turn-fight, "Limits").
//
// The engine uses core's maxKiasT6A directly: the NFM's own line (316 KIAS to about 18,879 ft, then Mach 0.67: 309 at
// 20,000 ft, 279 at 25,000 ft). Like VMO, the line is compared with the model's own IAS as it stands (SPEC-core, Known
// limits: the model compares every manual KIAS with its IAS). The expected values in these tests are read off the NFM
// figure (nfm-limit.js), not from maxKiasT6A.
//
// Part 1: below about 18,879 ft the top speed is exactly VMO, so a fight whose chase stays under that height flies the
// speed guard exactly as it did before the Mach limit. (A chaser that starts lower can climb past the crossover; there
// the guard is meant to tighten.)
// Part 2: above it the limit is Mach 0.67.
// Which tests tell the new engine from the old: the merge-speed refusals and the two guard tests at the end. The
// "never over the NFM Mach limit" fights pass on the old engine too; they are regression guards, not tests of this change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { T6A_LIMITS, maxKiasT6A } from '../../../src/core/t6-performance.js';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { nfmTopKias, CHART_READ_KIAS } from './nfm-limit.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} (±${tol})`);
const nfm25 = Math.round(nfmTopKias(25000)); // 279
const nfm20 = Math.round(nfmTopKias(20000)); // 309

// ── Part 1: VMO, exactly, below about 18,879 ft ──────────────────────────────

test('the top speed is exactly VMO (316) from 0 to 18,800 ft, in 1 ft steps, so the chaser\'s guard there is what it was', () => {
  for (let altFt = 0; altFt <= 18800; altFt++) {
    if (maxKiasT6A(altFt) !== T6A_LIMITS.vmoKias) assert.fail(`maxKiasT6A(${altFt}) is ${maxKiasT6A(altFt)}, not ${T6A_LIMITS.vmoKias}`);
  }
});

test('a merge at 316 KIAS is accepted from the deck to 18,800 ft, and 317 is refused', () => {
  for (const altFt of [6000, 10000, 15000, 17000, 17500, 18800]) {
    assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 316, redKias: 316 }), `316 at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit/, `317 at ${altFt} ft`);
  }
});

// ── Part 2: above it the limit is Mach 0.67 ──────────────────────────────────

test('the NFM limit line, worked from the figure: 316 to 18,769 ft, about 309 at 20,000 ft, about 279 at 25,000 ft, 244 at 31,000 ft', () => {
  assert.equal(nfmTopKias(18000), 316);
  assert.equal(nfmTopKias(18769), 316);
  assert.equal(nfm20, 309);
  assert.equal(nfm25, 279);
  assert.equal(nfmTopKias(31000), 244);
});

test('core: maxKiasT6A follows the NFM line to within a chart reading, 2 KIAS', () => {
  for (const altFt of [18700, 20000, 22000, 25000, 31000]) near(maxKiasT6A(altFt), nfmTopKias(altFt), CHART_READ_KIAS, `at ${altFt} ft`);
});

test('at 25,000 ft a merge at 300 KIAS is refused, at either aircraft, and the message names the limit there; 279 is accepted and 280 refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300, redKias: 220 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(279 KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 220, redKias: 300 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(279 KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 280 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(279 KIAS/);
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 279, redKias: 279 });
  assert.equal(s.blue.kias, 279);
  assert.equal(s.red.kias, 279);
});

test('the highest whole KIAS accepted is the NFM line to within a chart reading, and the next one up is refused, at every height above the knee', () => {
  for (const altFt of [19500, 20000, 22000, 25000]) {
    let top = 0;
    for (let k = 260; k <= 316; k++) {
      try { createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: k, redKias: 100 }); top = k; } catch { break; }
    }
    near(top, nfmTopKias(altFt), CHART_READ_KIAS, `the highest merge accepted at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: top + 1 }), /limit at/, `${top + 1} at ${altFt} ft`);
  }
});

test('each aircraft is checked at its own start height: Blue 316 at 10,000 ft is fine while Red 300 at 25,000 ft is refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 300, separationNm: 4 }), /Red's merge speed is above the T-6A's limit at 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 279, separationNm: 4 }));
});

test('at 20,000 ft the limit is 309 KIAS: 309 is accepted, 310 refused', () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 309, redKias: 309 }));
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 310 }), /Blue's merge speed is above the T-6A's limit at 20,000 ft \(309 KIAS, Mach 0\.67\), got 310/);
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 316 }), /limit at 20,000 ft/);
});

test('the height check comes first: a speed over the limit is refused with the limit at that height, whatever the height (VMO below the crossover, Mach 0.67 above it)', () => {
  assert.throws(() => createEnergyFight({ blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 317/);
  assert.throws(() => createEnergyFight({ redKias: 400 }), /Red's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 400/);
  // Above the crossover a speed over VMO gets the Mach limit's message, not "40 to 316".
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, redKias: 400 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(279 KIAS, Mach 0\.67\), got 400/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(279 KIAS, Mach 0\.67\), got 317/);
});

test('a speed under 40 or not a number still names the box and the range at that height', () => {
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias is from 40 to 316 KIAS, got NaN/);
  assert.throws(() => createEnergyFight({ redKias: 39 }), /redKias is from 40 to 316 KIAS, got 39/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 39 }), /blueKias is from 40 to 279 KIAS, got 39/);
});

/**
 * Flies ten minutes and returns the most any aircraft went over the NFM line at its own height, and the moves seen.
 * Auto flies (both blue and red), so this is what the model pilot does, not a forced what-if.
 */
function overTheLimit(setup) {
  const s = createEnergyFight(setup);
  let over = -Infinity, fastest = 0;
  const moves = new Set();
  for (let i = 0; i < 30000; i++) {
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
  'an Immelmann from the merge (at the NFM limit, against the same)': { setup: (alt) => ({ blueKias: Math.round(nfmTopKias(alt)), redKias: Math.round(nfmTopKias(alt)) }), moves: ['immelmann'] },
  'a split S from the merge (100 against 100)': { setup: () => ({ blueKias: 100, redKias: 100 }), moves: ['splitS'] },
  'a pursuit dive (Blue 100 against Red 220)': { setup: () => ({ blueKias: 100 }), moves: ['pursuit'] },
  'a pursuit dive (Blue 220 against Red 180)': { setup: () => ({ redKias: 180 }), moves: ['pursuit'] },
  'a fast one-circle chase after a head-on pass (265 against 133)': { setup: () => ({ blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 }), moves: ['pursuit'] },
};
for (const altFt of [25000, 20000]) {
  for (const pursuit of altFt === 25000 ? ['pure', 'lead', 'lag'] : ['pure']) {
    for (const [name, { setup, moves }] of Object.entries(HIGH_FIGHTS)) {
      test(`from ${altFt.toLocaleString('en-US')} ft, ${name}, ${pursuit} pursuit, ten minutes: never over the NFM Mach limit at its height (regression guard)`, () => {
        const r = overTheLimit({ blueAltFt: altFt, redAltFt: altFt, pursuit, ...setup(altFt) });
        for (const m of moves) assert.ok(r.moves.has(m), `the fight flew ${m} (${[...r.moves].join(', ')})`);
        assert.ok(r.over <= CHART_READ_KIAS, `${r.over.toFixed(1)} KIAS over the NFM line at its height (fastest ${r.fastest.toFixed(0)})`);
      });
    }
  }
}

test('a chaser diving from 25,000 ft is held near the guard at its height (the NFM limit there less 40 KIAS), not near VMO less 40', () => {
  // The guard is the top speed at the chaser's own height less 40 KIAS: at 22,000 ft (the NFM line is 298 KIAS there) it starts at 258,
  // where the old guard (VMO 316 - 40 = 276) did not. This fight, flown to a chase from 25,000 ft, reached 279 KIAS at 21,800 ft
  // under the old guard: 21 KIAS over the new one.
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 });
  let worst = -Infinity, chasingHigh = 0;
  for (let i = 0; i < 30000; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      if (a.move !== 'pursuit' || a.altFt < 18000) continue;
      chasingHigh++;
      worst = Math.max(worst, a.kias - (nfmTopKias(a.altFt) - 40));
    }
  }
  assert.ok(chasingHigh > 500, `a chase flew above 18,000 ft (${chasingHigh} steps)`);
  assert.ok(worst <= 12, `the chaser went ${worst.toFixed(1)} KIAS over its guard speed`);
  assert.ok(worst > -20, `the guard was in play: the chaser got to within 20 KIAS of it (${worst.toFixed(1)} KIAS over)`);
});

test('at 25,000 ft the guard trips at the NFM Mach 0.67 point: a chaser at 265 or 255 KIAS is asked to climb at once, which a guard at VMO less 40 (0° after 2 s) would not', () => {
  // A chaser starting from behind at 25,000 ft. The guard is 279 - 40 = 239 KIAS. After 2 s, measured on this engine:
  // 9° of climb from 265 KIAS and 5° from 255 KIAS; a guard on VMO (276) asks for none.
  for (const [kias, minClimbDeg] of [[265, 6], [255, 3]]) {
    const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: kias, redKias: 160, ataDeg: 0, aaDeg: 0, turnsStart: 'now', separationNm: 0.5, pursuit: 'pure' });
    for (let i = 0; i < 100; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
    assert.equal(s.blue.move, 'pursuit', 'the chase is on');
    assert.ok(s.blue.climbDeg >= minClimbDeg, `${kias} KIAS: ${s.blue.climbDeg.toFixed(1)}° of climb after 2 s, wanted ${minClimbDeg}° or more`);
  }
});
