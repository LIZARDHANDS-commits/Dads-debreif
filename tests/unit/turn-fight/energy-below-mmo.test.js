// The Energy engine and the T-6A's speed limit (core #211 and #218; SPEC-turn-fight, "Limits").
//
// The engine flies the model's own limit, energyTopKias: the model's IAS at VMO (316) or at true Mach 0.67, whichever is
// slower. That sits under the NFM's KIAS line (316 to about 18,770 ft, then Mach 0.67: 309 at 20,000 ft, 279 at 25,000 ft,
// which core's maxKiasT6A follows) because the model's IAS has no compressibility: an aircraft held at the NFM's 279 would
// fly Mach 0.69 at 25,000 ft, over Mmo. The NFM figure is worked out in nfm-limit.js, apart from the code under test.
//
// Part 1: up to about 17,570 ft the top speed is exactly VMO, so a fight whose chase stays under that height flies the
// speed guard exactly as it did before the Mach limit. (A chaser that starts lower can climb past the crossover; there
// the guard is meant to tighten.)
// Part 2: above it the limit is Mach 0.67, and the pin is the Mach the model actually flies at the highest speed accepted.
// Which tests tell this engine from the one that used the NFM line: the Mach pin, the merge-speed refusals and the two
// guard tests at the end. The "never over the limit" fights pass on either; they are regression guards.
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

// ── Part 1: VMO, exactly, up to about 17,570 ft ──────────────────────────────

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

test('from 17,566 ft, the first whole foot over the crossover, the limit is 315 and says Mach 0.67, not VMO; the NFM is not quoted there, its line is still VMO', () => {
  for (const altFt of [17566, 17567, CROSSOVER_FT, 17600]) {
    assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 315 }), `315 at ${altFt} ft`);
    assert.throws(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 316 }), /Blue's merge speed is above the T-6A's limit at 17,\d\d\d ft \(315 KIAS in the model, Mach 0\.67\), got 316/, `316 at ${altFt} ft`);
  }
});

// ── Part 2: above it the limit is Mach 0.67 ──────────────────────────────────

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

test('the engine\'s limit in the model\'s IAS: about 300 at 20,000 ft, 270 at 25,000 ft, 236 at 31,000 ft, 8 to 10 KIAS under the NFM line up high', () => {
  near(energyTopKias(20000), 300.4, 0.1, 'at 20,000 ft');
  near(energyTopKias(25000), 270.0, 0.1, 'at 25,000 ft');
  near(energyTopKias(31000), 236.1, 0.1, 'at 31,000 ft');
  for (const altFt of [20000, 22000, 25000, 31000]) {
    const under = nfmTopKias(altFt) - energyTopKias(altFt);
    assert.ok(under >= 7 && under <= 11, `${under.toFixed(1)} KIAS under the NFM line at ${altFt} ft`);
  }
});

test('at 25,000 ft a merge at 300 KIAS is refused, at either aircraft, and the message names the limit there; 269 is accepted and 270 refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300, redKias: 220 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(269 KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 220, redKias: 300 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(269 KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 270 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(269 KIAS/);
  // The NFM's 279 is refused: in the model it would be Mach 0.69.
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: nfm25 }), /limit at 25,000 ft \(269 KIAS/);
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 269, redKias: 269 });
  assert.equal(s.blue.kias, 269);
  assert.equal(s.red.kias, 269);
});

// The pin that matters: the Mach the model actually flies at the highest merge speed the engine accepts. (The NFM line is a
// compressible KIAS; the model's IAS has no compressibility, so a check against that line let the model fly Mach 0.69.)
const accepts = (altFt, kias) => { try { createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: kias }); return true; } catch { return false; } };
const modelMach = (kias, altFt) => iasToTasKt(kias, altFt) / speedOfSoundKt(altFt);

test('at every start height from the deck to 25,000 ft (500 ft steps, and 25,000) the highest merge speed accepted flies at Mach 0.67 or less in the model, and one knot more is refused', () => {
  const heights = [];
  for (let h = ENERGY_DEFAULT_SETUP.hardDeckFt; h <= ENERGY_MAX_START_FT; h += 500) heights.push(h);
  for (const altFt of heights) {
    let top = 316;
    while (top > 40 && !accepts(altFt, top)) top--;
    assert.ok(top > 200 && top <= T6A_LIMITS.vmoKias, `a merge speed is accepted at ${altFt} ft (${top})`);
    assert.ok(modelMach(top, altFt) <= T6A_LIMITS.mmo, `${top} KIAS at ${altFt} ft flies Mach ${modelMach(top, altFt).toFixed(4)} in the model, over ${T6A_LIMITS.mmo}`);
    assert.ok(!accepts(altFt, top + 1), `${top + 1} KIAS at ${altFt} ft is refused`);
    if (top < T6A_LIMITS.vmoKias) assert.ok(modelMach(top + 1, altFt) > T6A_LIMITS.mmo, `${top + 1} KIAS at ${altFt} ft would be over Mach ${T6A_LIMITS.mmo}, so the limit is no lower than it has to be`);
  }
});

test('each aircraft is checked at its own start height: Blue 316 at 10,000 ft is fine while Red 300 at 25,000 ft is refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 300, separationNm: 4 }), /Red's merge speed is above the T-6A's limit at 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 269, separationNm: 4 }));
});

test('at 20,000 ft the limit is 300 KIAS: 300 is accepted, 301 refused (the NFM line reads 309)', () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 300, redKias: 300 }));
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 301 }), /Blue's merge speed is above the T-6A's limit at 20,000 ft \(300 KIAS in the model, Mach 0\.67; the NFM's 309 is the same Mach on the gauge\), got 301/);
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: nfm20 }), /limit at 20,000 ft/);
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 316 }), /limit at 20,000 ft/);
});

test('the height check comes first: a speed over the limit is refused with the limit at that height, whatever the height (VMO below the crossover, Mach 0.67 above it)', () => {
  assert.throws(() => createEnergyFight({ blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 317/);
  assert.throws(() => createEnergyFight({ redKias: 400 }), /Red's merge speed is above the T-6A's limit at 10,000 ft \(316 KIAS, VMO\), got 400/);
  // Above the crossover a speed over VMO gets the Mach limit's message, not "40 to 316".
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, redKias: 400 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(269 KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 400/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 317 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(269 KIAS in the model, Mach 0\.67; the NFM's 279 is the same Mach on the gauge\), got 317/);
});

test('a speed under 40 or not a number still names the box and the range at that height', () => {
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias is from 40 to 316 KIAS, got NaN/);
  assert.throws(() => createEnergyFight({ redKias: 39 }), /redKias is from 40 to 316 KIAS, got 39/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 39 }), /blueKias is from 40 to 269 KIAS, got 39/);
});

/**
 * Flies ten minutes and returns the most any aircraft went over energyTopKias at its own height, and the moves seen.
 * Auto flies (both blue and red) unless the setup forces a move, so most of these are what the model pilot does; the forced
 * Immelmann is a what-if.
 */
function overTheLimit(setup) {
  const s = createEnergyFight(setup);
  let over = -Infinity, fastest = 0;
  const moves = new Set();
  for (let i = 0; i < 30000; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      over = Math.max(over, a.kias - energyTopKias(a.altFt));
      fastest = Math.max(fastest, a.kias);
      moves.add(a.move);
    }
  }
  return { over, fastest, moves, s };
}

const HIGH_FIGHTS = {
  // Auto at the top speed: an Immelmann at 20,000 ft and at 25,000 ft (269 KIAS, over the top at 130 KIAS >= 120 KIAS gate).
  'Auto from the merge at the top speed against the same': { setup: (alt) => ({ blueKias: Math.floor(energyTopKias(alt)), redKias: Math.floor(energyTopKias(alt)) }), moves: () => ['immelmann'] },
  'a forced Immelmann from the merge (a what-if, at the top speed against the same)': { setup: (alt) => ({ blueKias: Math.floor(energyTopKias(alt)), redKias: Math.floor(energyTopKias(alt)), blueMove: 'immelmann', redMove: 'immelmann' }), moves: () => ['immelmann'] },
  'a split S from the merge (100 against 100)': { setup: () => ({ blueKias: 100, redKias: 100 }), moves: () => ['splitS'] },
  'a pursuit dive (Blue 100 against Red 220)': { setup: () => ({ blueKias: 100 }), moves: () => ['pursuit'] },
  'a pursuit dive (Blue 220 against Red 180)': { setup: () => ({ redKias: 180 }), moves: () => ['pursuit'] },
  'a fast one-circle chase after a head-on pass (265 against 133)': { setup: () => ({ blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 }), moves: () => ['pursuit'] },
};
for (const altFt of [25000, 20000]) {
  for (const pursuit of altFt === 25000 ? ['pure', 'lead', 'lag'] : ['pure']) {
    for (const [name, { setup, moves }] of Object.entries(HIGH_FIGHTS)) {
      test(`from ${altFt.toLocaleString('en-US')} ft, ${name}, ${pursuit} pursuit, ten minutes: never over the model's own limit at its height (regression guard)`, () => {
        const r = overTheLimit({ blueAltFt: altFt, redAltFt: altFt, pursuit, ...setup(altFt) });
        for (const m of moves(altFt)) assert.ok(r.moves.has(m), `the fight flew ${m} (${[...r.moves].join(', ')})`);
        assert.ok(r.over <= 0, `${r.over.toFixed(1)} KIAS over the limit at its height (fastest ${r.fastest.toFixed(0)})`);
      });
    }
  }
}

test('Auto at 269 KIAS at 25,000 ft picks an Immelmann (over the top at 130 KIAS >= 120 KIAS gate)', () => {
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 269, redKias: 269, pursuit: 'pure' });
  for (const ac of [s.blue, s.red]) {
    assert.equal(ac.move, 'immelmann');
    assert.match(ac.why, /^Immelmann: 269 KIAS, other aircraft 180° off the nose, over the top at 130 KIAS/);
  }
});

test('a chaser diving from 25,000 ft is held near the guard at its height (energyTopKias there less 40 KIAS), not near VMO less 40 or the NFM line less 40', () => {
  // The guard is the engine's top speed at the chaser's own height less 40 KIAS: at 22,000 ft (energyTopKias is 288 there) it starts at 248,
  // where a guard on VMO (316 - 40 = 276) did not, and one on the NFM line (298 - 40 = 258) sat 10 KIAS higher. This fight, flown to a
  // chase from 25,000 ft, stays within a knot of its guard; under a guard on the NFM line it would run about 8 KIAS over this one.
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 });
  let worst = -Infinity, chasingHigh = 0;
  for (let i = 0; i < 30000; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    for (const a of [s.blue, s.red]) {
      if (a.move !== 'pursuit' || a.altFt < 18000) continue;
      chasingHigh++;
      worst = Math.max(worst, a.kias - (energyTopKias(a.altFt) - 40));
    }
  }
  assert.ok(chasingHigh > 500, `a chase flew above 18,000 ft (${chasingHigh} steps)`);
  assert.ok(worst <= 4, `the chaser went ${worst.toFixed(1)} KIAS over its guard speed`);
  assert.ok(worst > -20, `the guard was in play: the chaser got to within 20 KIAS of it (${worst.toFixed(1)} KIAS over)`);
});

/** A chaser starting from behind at 25,000 ft at `kias`, 0.5 NM back of a 160 KIAS target: the climb it has asked for after 2 s. */
function climbAfter2Sec(kias) {
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: kias, redKias: 160, ataDeg: 0, aaDeg: 0, turnsStart: 'now', separationNm: 0.5, pursuit: 'pure' });
  for (let i = 0; i < 100; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.equal(s.blue.move, 'pursuit', 'the chase is on');
  return s.blue.climbDeg;
}

test('at 25,000 ft the guard trips at the model\'s Mach 0.67 point: a chaser at 265 or 255 KIAS is asked to climb at once, which a guard at VMO less 40 (0° after 2 s) would not', () => {
  // The guard is 270 - 40 = 230 KIAS. After 2 s, measured on this engine: 13° of climb from 265 KIAS and 9° from 255 KIAS;
  // a guard on VMO (276) asks for none.
  for (const [kias, minClimbDeg] of [[265, 10], [255, 7]]) {
    const climb = climbAfter2Sec(kias);
    assert.ok(climb >= minClimbDeg, `${kias} KIAS: ${climb.toFixed(1)}° of climb after 2 s, wanted ${minClimbDeg}° or more`);
  }
});

test('the chase guard\'s limit at 25,000 ft is energyTopKias less the margin: the chaser starts to climb at that speed, a few knots over it for the speed lost in the 2 s lead, not at the NFM line\'s 239 or VMO\'s 276', () => {
  const guard = energyTopKias(25000) - 40; // 229.98
  let trip = null;
  for (let kias = 200; kias <= 290; kias++) {
    if (climbAfter2Sec(kias) > 0) { trip = kias; break; }
  }
  assert.ok(trip !== null, 'a climb is asked for somewhere from 200 to 290 KIAS');
  assert.ok(trip >= guard && trip <= guard + 5, `the chaser first climbs at ${trip} KIAS, the guard is ${guard.toFixed(1)}`);
});
