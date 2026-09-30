// The Energy engine and the T-6A's Mach limit (core #211; SPEC-turn-fight, "Limits").
// Part 1 pins the engine at 17,000 ft and below, where the speed limit is still VMO and nothing may change.
// Part 2 is the new behaviour above about 17,600 ft, where the limit is Mach 0.67 (maxKiasT6A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T6A_LIMITS, maxKiasT6A } from '../../../src/core/t6-performance.js';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { trajectoryDigest, pinCases, PIN_STEPS } from './energy-pin.js';

// ── Part 1: nothing moves at 17,000 ft and below ─────────────────────────────

const pinned = JSON.parse(readFileSync(new URL('../../fixtures/turn-fight/energy-below-mmo.json', import.meta.url), 'utf8'));

test('the pin fixture is the fights the helper lists, all starting at 17,000 ft or lower', () => {
  const cases = pinCases();
  assert.equal(pinned.steps, PIN_STEPS);
  assert.deepEqual(pinned.cases.map((c) => c.name), cases.map((c) => c.name));
  assert.ok(cases.length >= 40);
  for (const c of cases) {
    const s = { blueAltFt: 10000, redAltFt: 10000, ...c.setup };
    assert.ok(s.blueAltFt <= 17000 && s.redAltFt <= 17000, `${c.name} starts at or under 17,000 ft`);
  }
  for (const name of ['the default fight', 'a 316 KIAS merge at 10,000 ft']) assert.ok(cases.some((c) => c.name === name), name);
  assert.ok(maxKiasT6A(17000) === T6A_LIMITS.vmoKias, 'the limit at 17,000 ft is still VMO');
});

// Every step of a ten-minute fight, every number, must be what the engine gave before the Mach limit.
for (const c of pinned.cases) {
  test(`${c.name}: the whole ten-minute trajectory is bit-for-bit what it was before the Mach limit`, () => {
    const now = trajectoryDigest(c.setup);
    // The readable numbers first, so a failure says what moved; then the fingerprint of every step.
    const { name, setup, digest, ...readable } = c;
    const { digest: nowDigest, ...nowReadable } = now;
    assert.deepEqual(nowReadable, readable);
    assert.equal(nowDigest, digest);
  });
}

// ── Part 2: above 18,769 ft the limit is Mach 0.67 ───────────────────────────
//
// Where the expected top speeds come from. They are read off the T-6A NFM's own limit figure, not from maxKiasT6A: NFM Figure
// 4-1-2, "Airspeed and Mach Limitations" (Figure 5-3, p. 5-9, in the scribd extract text/t6a-nfm-100-scribd.txt; the page image
// is manuals/images/t6a-airspeed-mach-limits.png; the numbers are in formation-and-turn-numbers.md, "T-6A performance charts").
// The figure gives VMO 316 KIAS up to and including 18,769 ft, then the MMO 0.67 line, drawn straight, down to 244 KIAS at
// 31,000 ft. So the KIAS at a height between is the line's own value: about 309 at 20,000 ft and 279 at 25,000 ft.
//
// CORE FIX PENDING. Core's maxKiasT6A has no compressibility, so it reads about 8 kt under that line above 18,769 ft (it gives
// 300 at 20,000 ft and 270 at 25,000 ft). Core is fixing it, keeping the signature. Every test marked "[needs Core's
// maxKiasT6A fix]" below leans on the figure's numbers, so it fails until that fix lands; that is expected, and this PR waits for it.
// The tests not so marked hold either way (nothing goes over the figure's line).
const NFM_LIMIT = Object.freeze({ vmoKias: 316, kneeFt: 18769, topKias: 244, topFt: 31000 });
/** The NFM Fig 4-1-2 limit, in KIAS, at altFt (from 18,769 ft to 31,000 ft the straight line from 316 to 244). */
function nfmTopKias(altFt) {
  if (altFt <= NFM_LIMIT.kneeFt) return NFM_LIMIT.vmoKias;
  const frac = Math.min(1, (altFt - NFM_LIMIT.kneeFt) / (NFM_LIMIT.topFt - NFM_LIMIT.kneeFt));
  return NFM_LIMIT.vmoKias + frac * (NFM_LIMIT.topKias - NFM_LIMIT.vmoKias);
}
/** How closely a straight line read off a printed figure is taken: 2 KIAS. */
const CHART_READ_KIAS = 2;
const nfm25 = Math.round(nfmTopKias(25000)); // 279
const nfm20 = Math.round(nfmTopKias(20000)); // 309
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} (±${tol})`);

test('the NFM limit line, worked from the figure: 316 to 18,769 ft, about 309 at 20,000 ft, about 279 at 25,000 ft, 244 at 31,000 ft', () => {
  assert.equal(nfmTopKias(18000), 316);
  assert.equal(nfmTopKias(18769), 316);
  assert.equal(nfm20, 309);
  assert.equal(nfm25, 279);
  assert.equal(nfmTopKias(31000), 244);
});

test("[needs Core's maxKiasT6A fix] maxKiasT6A follows the NFM line: 316 to 18,769 ft, about 309 at 20,000 ft, about 279 at 25,000 ft", () => {
  assert.equal(maxKiasT6A(17000), 316); // holds now
  for (const altFt of [18700, 20000, 22000, 25000]) near(maxKiasT6A(altFt), nfmTopKias(altFt), CHART_READ_KIAS, `at ${altFt} ft`);
});

test('at 25,000 ft a merge at 300 KIAS is refused, at either aircraft, and the message names Mach 0.67', () => {
  // Holds with or without Core's fix: 300 is over the line (279) and over Core's current 270.
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300, redKias: 220 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft \(\d+ KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 220, redKias: 300 }), /Red's merge speed is above the T-6A's limit at 25,000 ft \(\d+ KIAS, Mach 0\.67\), got 300/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 285 }), /Blue's merge speed is above the T-6A's limit at 25,000 ft/);
});

test("[needs Core's maxKiasT6A fix] at 25,000 ft the message names the NFM limit, 279 KIAS, and a merge at 279 is accepted", () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 300 }), new RegExp(`limit at 25,000 ft \\(${nfm25} KIAS, Mach 0\\.67\\), got 300`));
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: nfm25, redKias: nfm25 });
  assert.equal(s.blue.kias, nfm25);
  assert.equal(s.red.kias, nfm25);
});

test('at 25,000 ft a merge at 270 KIAS, under the NFM line, is accepted', () => {
  const s = createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, blueKias: 270, redKias: 270 });
  assert.equal(s.blue.kias, 270);
  assert.equal(s.red.kias, 270);
});

test('each aircraft is checked at its own start height: Blue 316 at 10,000 ft is fine while Red 300 at 25,000 ft is refused', () => {
  assert.throws(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 300, separationNm: 4 }), /Red's merge speed is above the T-6A's limit at 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 10000, redAltFt: 25000, blueKias: 316, redKias: 270, separationNm: 4 }));
});

test('at 20,000 ft a merge at 316 KIAS is refused and 290 is accepted; at 17,000 ft and below 316 is still accepted', () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 290, redKias: 290 })); // under the line either way
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: 316 }), /Blue's merge speed is above the T-6A's limit at 20,000 ft/);
  for (const altFt of [6000, 10000, 15000, 17000]) assert.doesNotThrow(() => createEnergyFight({ blueAltFt: altFt, redAltFt: altFt, blueKias: 316, redKias: 316 }), `316 at ${altFt} ft`);
});

test("[needs Core's maxKiasT6A fix] at 20,000 ft the NFM limit is 309 KIAS: 309 is accepted, 312 refused with 309 in the message", () => {
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: nfm20, redKias: nfm20 }));
  assert.throws(() => createEnergyFight({ blueAltFt: 20000, redAltFt: 20000, blueKias: nfm20 + 3 }), new RegExp(`limit at 20,000 ft \\(${nfm20} KIAS, Mach 0\\.67\\)`));
});

test('a speed over VMO is refused at any height with the old message, and a NaN still names the box', () => {
  assert.throws(() => createEnergyFight({ blueKias: 317 }), /blueKias is from 40 to 316 KIAS, got 317/);
  assert.throws(() => createEnergyFight({ blueAltFt: 25000, redAltFt: 25000, redKias: 400 }), /redKias is from 40 to 316 KIAS, got 400/);
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias/);
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
/** A start at the merge speed's own limit reads a fraction of a knot over it, and 2 KIAS is the slack the check allows. */
const SLACK_KIAS = 2;

// The Immelmann fight merges at the NFM limit itself (279 at 25,000 ft, 309 at 20,000 ft): it needs Core's fix to start at all.
const HIGH_FIGHTS = {
  "[needs Core's maxKiasT6A fix] an Immelmann from the merge (at the NFM limit, against the same)": { setup: (alt) => ({ blueKias: Math.round(nfmTopKias(alt)), redKias: Math.round(nfmTopKias(alt)) }), moves: ['immelmann'] },
  'a split S from the merge (100 against 100)': { setup: () => ({ blueKias: 100, redKias: 100 }), moves: ['splitS'] },
  'a pursuit dive (Blue 100 against Red 220)': { setup: () => ({ blueKias: 100 }), moves: ['pursuit'] },
  'a pursuit dive (Blue 220 against Red 180)': { setup: () => ({ redKias: 180 }), moves: ['pursuit'] },
  'a fast one-circle chase after a head-on pass (265 against 133)': { setup: () => ({ blueKias: 265, redKias: 133, ataDeg: 161, aaDeg: 37, circles: 1, chaseAfterHeadOn: true, separationNm: 3.5 }), moves: ['pursuit'] },
};
for (const altFt of [25000, 20000]) {
  for (const pursuit of altFt === 25000 ? ['pure', 'lead', 'lag'] : ['pure']) {
    for (const [name, { setup, moves }] of Object.entries(HIGH_FIGHTS)) {
      test(`from ${altFt.toLocaleString('en-US')} ft, ${name}, ${pursuit} pursuit, ten minutes: never over the NFM Mach limit at its height`, () => {
        const r = overTheLimit({ blueAltFt: altFt, redAltFt: altFt, pursuit, ...setup(altFt) });
        for (const m of moves) assert.ok(r.moves.has(m), `the fight flew ${m} (${[...r.moves].join(', ')})`);
        assert.ok(r.over <= SLACK_KIAS, `${r.over.toFixed(1)} KIAS over the NFM line at its height (fastest ${r.fastest.toFixed(0)})`);
      });
    }
  }
}

test('a chaser diving from 25,000 ft is held to a speed near the guard at its height (the NFM limit there less 40 KIAS), not near VMO less 40', () => {
  // Under the old guard (VMO 316 - 40 = 276) this fight reached 279 KIAS at 21,800 ft, where the NFM limit is 298 and the guard 258: 21 KIAS over.
  // The bound holds for Core's current low line (its guard is 8 lower, so the chaser sits further under the NFM guard) and for the fix.
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
});
