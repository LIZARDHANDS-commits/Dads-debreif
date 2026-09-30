// Golden test (R9, D10): the Turn Fight against V6's own `bfmFight` script,
// run unchanged in Node by turn-fight-v6.js with a stand-in page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createV6Fight, parseV6Readouts } from './turn-fight-v6.js';
import { seeded } from './inputs.js';
import { createFight, stepFight, FIGHT_STEP_SEC, FIGHT_MAX_SEC } from '../../src/modules/turn-fight/sim.js';
import { FT_PER_NM } from '../../src/core/units.js';
import { timeText, phaseText, resultRows, moreDetailRows } from '../../src/modules/turn-fight/readouts.js';

const STEP = 0.02;

/** Runs V6 at 0.02 s steps until `stop(v6)` and returns it. */
function runV6(setup, stop, maxSteps = 40000) {
  const v6 = createV6Fight(setup);
  for (let i = 0; i < maxSteps && !stop(v6); i++) v6.step(STEP);
  return v6;
}

test('V6 itself gives the answers the spec pins (merge, first nose-on)', () => {
  const nose = (setup) => {
    const v6 = runV6(setup, (f) => f.S.firstNose);
    return { by: v6.S.firstNose.id, sinceMerge: v6.S.firstNose.t - v6.S.merge, merge: v6.S.merge };
  };
  const round1 = (x) => Math.round(x * 10) / 10;
  const two = nose({ circles: 2 });
  assert.equal(round1(two.merge), 16.4);
  assert.equal(round1(two.sinceMerge), 18.2);
  assert.equal(round1(nose({ circles: 1 }).sinceMerge), 9.1);
  const uneven = nose({ circles: 2, blueKt: 250, redKt: 200 });
  assert.equal(round1(uneven.merge), 16);
  assert.deepEqual([uneven.by, round1(uneven.sinceMerge)], ['b', 14.4]);
  const fiveG = nose({ circles: 2, blueG: 5 });
  assert.deepEqual([fiveG.by, round1(fiveG.sinceMerge)], ['a', 12.6]);
});

// ── The port against V6, step by step, for 10 minutes of fight time ──────────

const FT_TOL = 1e-9;
const RAD_TOL = 1e-12;
const STEPS = Math.round(FIGHT_MAX_SEC / FIGHT_STEP_SEC);

/** The spec's own setups, then a seeded spread over the whole grid. */
const SPEEDS = [[150, 150], [220, 220], [250, 200], [300, 150], [150, 300], [300, 300]];
const GS = [[2, 2], [4, 4], [5, 4], [7, 2], [4, 7], [7, 7]];
const SEPS = [1, 2, 5];
const PITCHES = [[0, 0], [30, -20], [-45, 60], [60, 60], [10, 10], [-60, 25]];

const named = (name, setup) => ({ name, ...setup });
const GRID = [
  named('V6 defaults: 2-circle, 2 NM, 220/220 kt, 4 G (a tie)', {}),
  named('1-circle defaults (a tie)', { circles: 1 }),
  named('2-circle, Blue 250 and Red 200 kt', { blueKt: 250, redKt: 200 }),
  named('2-circle, Blue at 5 G', { blueG: 5 }),
  named('1-circle, Blue 250 and Red 200 kt, First nose chases', { circles: 1, blueKt: 250, redKt: 200, chase: true }),
  named('2-circle, Blue at 5 G, First nose chases', { blueG: 5, chase: true }),
  named('2-circle, defaults, Climb and dive at 30 and -20', { vertical: true, bluePitchDeg: 30, redPitchDeg: -20 }),
  named('1-circle, Climb and dive at 30 and -20, First nose chases', { circles: 1, vertical: true, chase: true, bluePitchDeg: 30, redPitchDeg: -20 }),
  named('2-circle, Blue 250 and Red 200 kt, Climb and dive at 60 and -60, First nose chases', { blueKt: 250, redKt: 200, vertical: true, chase: true, bluePitchDeg: 60, redPitchDeg: -60 }),
  // Speeds and Gs where core's turn rate differs from V6's in the last digit (see the last test).
  // Without the chase a last-digit difference stays that small for the full 10 minutes.
  named('2-circle, 160 kt at 7 G against 350 kt at 5 G (rate differs in the last digit)', { blueKt: 160, redKt: 350, blueG: 7, redG: 5 }),
  named('1-circle, 100 kt at 8 G against 180 kt at 3 G (rate differs in the last digit)', { circles: 1, blueKt: 100, redKt: 180, blueG: 8, redG: 3 }),
  named('2-circle, 220 kt at 6 G against 400 kt at 2.5 G, Climb and dive at 15 and 40 (rate differs in the last digit)', { blueKt: 220, redKt: 400, blueG: 6, redG: 2.5, vertical: true, bluePitchDeg: 15, redPitchDeg: 40 }),
];
{
  const r = seeded(0x7f17);
  const pick = (list) => list[Math.floor(r() * list.length)];
  for (let i = 0; i < 44; i++) {
    const [blueKt, redKt] = pick(SPEEDS), [blueG, redG] = pick(GS);
    const vertical = i % 4 === 3, [bluePitchDeg, redPitchDeg] = vertical ? pick(PITCHES) : [0, 0];
    GRID.push({
      circles: i % 2 === 0 ? 2 : 1, separationNm: pick(SEPS), blueKt, redKt, blueG, redG,
      chase: r() < 0.5, vertical, bluePitchDeg, redPitchDeg,
    });
  }
  for (const g of GRID) g.name ??= JSON.stringify(g);
}

/**
 * The two starts (Q49). V6 starts both aircraft the same distance from the centre, the rebuild weights the start by
 * speed so they meet in the centre. Before the merge that moves both aircraft along x by the same amount; from the
 * merge on both are put at the centre, so nothing else differs. The grid runs both: with `v6Start` it pins V6 exactly,
 * and without it it expects V6's pre-merge positions shifted by `startShiftFt`.
 */
const MODES = [
  { label: 'V6 start', options: { v6Start: true }, shifted: false },
  { label: 'centre start (Q49)', options: {}, shifted: true },
];
/** How far the centre start moves both aircraft along x before the merge, against V6's: sep × (V2 − V1) / (2 (V1 + V2)). */
const startShiftFt = (g) => {
  const v1 = g.blueKt ?? 220, v2 = g.redKt ?? 220;
  return ((g.separationNm ?? 2) * FT_PER_NM * (v2 - v1)) / (2 * (v1 + v2));
};

function near(actual, expected, tol, what, stepNo, name) {
  // Not assert.ok(...) with a template string: this runs 30,000 times a setup.
  if (!(Math.abs(actual - expected) <= tol)) {
    assert.fail(`${name}: ${what} at step ${stepNo}: ${actual} vs V6 ${expected} (off by ${Math.abs(actual - expected)})`);
  }
}

/** Both aircraft, V6's `S.a` and `S.b` against the port's blue and red. */
function compareAircraft(mine, v6p, stepNo, name, who, shiftFt = 0) {
  near(mine.xFt, v6p.x + shiftFt, FT_TOL, `${who} x`, stepNo, name);
  near(mine.yFt, v6p.y, FT_TOL, `${who} y`, stepNo, name);
  near(mine.zFt, v6p.z, FT_TOL, `${who} height`, stepNo, name);
  near(mine.headingRad, v6p.h, RAD_TOL, `${who} heading`, stepNo, name);
  near(mine.pitchRad, v6p.pitch, RAD_TOL, `${who} pitch`, stepNo, name);
}

/**
 * Q48, the one difference on a tie. When both noses come within 5° in the same step V6 names one aircraft, in an even
 * fight by rounding noise. The rebuild marks it `both`, and the readout says "Both at +18.2 s" where V6 names one.
 * V6's own two angles at that step say whether it was a tie; everything else (the time, the line, the chase) is V6's.
 */
const isBothAtMark = (v6) => v6.ao(v6.S.a, v6.S.b) <= 5 && v6.ao(v6.S.b, v6.S.a) <= 5;

// ── The readouts against the text V6 writes on the page ──────────────────────

/**
 * V6's readout text in the rebuild's words. This is the whole list of what
 * differs from V6, and all of it is wording, not numbers (SPEC-turn-fight,
 * "Readouts"): "sec" is "s", "BLUE @ +18.2 sec" is "Blue at +18.2 s", the phase
 * is hyphenated, whole feet have thousands separators, and "-0 ft" (V6's
 * rounding of a height a hair below zero) is "0 ft". Keyed by the readout's id.
 */
function v6InRebuildWords(text) {
  const { time, phase, perf, live } = parseV6Readouts(text);
  const ft = (x) => x.replace(/^(-?)(\d+) ft$/, (all, sign, digits) => {
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return digits === '0' ? '0 ft' : `${sign}${grouped} ft`;
  });
  const seconds = (x) => x.replace(/ sec$/, ' s');
  const first = live['First nose-on'];
  return {
    time,
    phase: phase.replace(' CIRCLE', '-CIRCLE'),
    speed: perf['Speed'],
    g: perf['G'],
    turnRate: perf['Turn rate'],
    radius: perf['Turn radius'].map(ft),
    time360: perf['360° time'],
    range: live['Range'],
    offNose: [live['Blue angle-off'], live['Red angle-off']],
    sinceMerge: seconds(live['Time since merge']),
    heightChange: live['ΔAlt'].map(ft),
    heightBetween: ft(live['Vertical separation']),
    firstNose: first === '--' ? '--' : first.replace(/^(BLUE|RED) @ (\+[\d.]+) sec$/, (all, who, t) => `${who[0]}${who.slice(1).toLowerCase()} at ${t} s`),
  };
}

/** The rebuild's readouts, in the same shape. Height rows exist only with Climb and dive on. */
function ourReadouts(state) {
  const out = { time: timeText(state), phase: phaseText(state) };
  for (const row of [...resultRows(state), ...moreDetailRows(state)]) out[row.id] = 'text' in row ? row.text : [row.blue, row.red];
  return out;
}

let readoutsCompared = 0;
function compareReadouts(v6, mine, stepNo, name, v6Both) {
  const want = v6InRebuildWords(v6.text);
  const got = ourReadouts(mine);
  if (v6Both) {
    // Q48, the one readout difference on a tie: V6 names an aircraft, the rebuild says "Both".
    want.firstNose = want.firstNose.replace(/^(Blue|Red) at /, 'Both at ');
  }
  if (!mine.setup.vertical) {
    // With Climb and dive off the rebuild doesn't show height, and V6 shows zero.
    assert.deepEqual([want.heightChange, want.heightBetween], [['0 ft', '0 ft'], '0 ft'], `${name}: V6's height at step ${stepNo}`);
    delete want.heightChange;
    delete want.heightBetween;
  }
  assert.deepEqual(got, want, `${name}: readouts at step ${stepNo}`);
  readoutsCompared++;
}

/** What the grid has exercised, so the last test can say it was not all trivial. */
const covered = { firstNose: 0, chaseAfterNoseOn: 0, vertical: 0, verticalChase: 0, oneCircle: 0, twoCircle: 0, unequalSpeed: 0, unequalG: 0 };

for (const mode of MODES) for (const setup of GRID) {
  const { name: gridName, ...fightSetup } = setup;
  const name = mode.shifted ? `${gridName} [${mode.label}]` : gridName;
  test(`matches V6 for 10 minutes, step by step: ${name}`, () => {
    const v6 = createV6Fight(fightSetup);
    const mine = createFight({ ...fightSetup, ...mode.options });
    const shiftFt = mode.shifted ? startShiftFt(fightSetup) : 0;
    near(mine.mergeSec, v6.S.merge, 1e-12, 'merge time', 0, name);
    let seenNose = false, seenMerge = false, v6Both = false;
    compareReadouts(v6, mine, 0, name, v6Both);
    for (let i = 1; i <= STEPS; i++) {
      v6.step(FIGHT_STEP_SEC);
      stepFight(mine, FIGHT_STEP_SEC);
      if (v6.S.firstNose && !seenNose) v6Both = isBothAtMark(v6);
      // Every 25th step, every step around the merge and first nose-on, and the last one.
      const nearMerge = Math.abs(mine.timeSec - mine.mergeSec) < 0.1;
      const nearNose = mine.firstNose && mine.timeSec - mine.firstNose.timeSec < 0.1;
      const readoutsDue = i % 25 === 0 || i === STEPS || nearMerge || nearNose;
      if (readoutsDue) compareReadouts(v6, mine, i, name, v6Both);
      near(mine.timeSec, v6.t, 1e-12, 'fight time', i, name);
      if (mine.merged !== v6.S.done) assert.fail(`${name}: merged is ${mine.merged}, V6 ${v6.S.done}, at step ${i}`);
      seenMerge ||= mine.merged;
      // Until the merge the centre start is V6's path moved along x; after it both are V6's.
      const moved = v6.S.done ? 0 : shiftFt;
      compareAircraft(mine.blue, v6.S.a, i, name, 'Blue', moved);
      compareAircraft(mine.red, v6.S.b, i, name, 'Red', moved);
      const want = v6.S.firstNose, got = mine.firstNose;
      if (!want !== !got) assert.fail(`${name}: first nose-on ${got ? 'marked' : 'not marked'}, V6 ${want ? 'marked' : 'not marked'}, at step ${i}`);
      if (want && !seenNose) {
        seenNose = true;
        near(got.timeSec, want.t, 1e-12, 'first nose-on time', i, name);
        assert.equal(got.both, v6Both, `${name}: a tie is marked as both (Q48), nothing else is, at step ${i}`);
        const close = (p, q) => Math.abs(p.xFt - q.x) <= FT_TOL && Math.abs(p.yFt - q.y) <= FT_TOL;
        if (v6Both) {
          // A tie: V6 names either aircraft, the rebuild draws the line from Blue; it is the same two points.
          assert.ok((close(got.from, want.from) && close(got.to, want.to)) || (close(got.from, want.to) && close(got.to, want.from)), `${name}: first nose-on line, at step ${i}`);
        } else {
          assert.equal(got.by, want.id === 'a' ? 'blue' : 'red', `${name}: who got first nose-on, at step ${i}`);
          assert.ok(close(got.from, want.from) && close(got.to, want.to), `${name}: first nose-on line, at step ${i}`);
        }
      }
    }
    assert.ok(seenMerge, `${name}: the aircraft merged`);
    if (seenNose) covered.firstNose++;
    if (seenNose && fightSetup.chase) covered.chaseAfterNoseOn++;
    if (fightSetup.vertical) covered.vertical++;
    if (fightSetup.vertical && fightSetup.chase && seenNose) covered.verticalChase++;
    covered[fightSetup.circles === 1 ? 'oneCircle' : 'twoCircle']++;
    if ((fightSetup.blueKt ?? 220) !== (fightSetup.redKt ?? 220)) covered.unequalSpeed++;
    if ((fightSetup.blueG ?? 4) !== (fightSetup.redG ?? 4)) covered.unequalG++;
    assert.equal(mine.stopped, true, `${name}: stopped at 10 minutes`);
    near(mine.timeSec, FIGHT_MAX_SEC, 1e-6, 'stop time', STEPS, name);
  });
}

test('the readouts were compared many times: at the start, around the merge and first nose-on, and every 25th step', () => {
  assert.ok(readoutsCompared > 50 * 1000, `${readoutsCompared} comparisons`);
});

test('the grid was not trivial: it reached first nose-on, the chase, climb and dive, both fight types, unequal fights', () => {
  assert.ok(covered.firstNose >= 40, `${covered.firstNose} setups reached first nose-on`);
  assert.ok(covered.chaseAfterNoseOn >= 15, `${covered.chaseAfterNoseOn} chased after first nose-on`);
  assert.ok(covered.vertical >= 10, `${covered.vertical} used Climb and dive`);
  assert.ok(covered.verticalChase >= 3, `${covered.verticalChase} chased in 3D`);
  assert.ok(covered.oneCircle >= 15 && covered.twoCircle >= 15, `${covered.oneCircle} one-circle, ${covered.twoCircle} two-circle`);
  assert.ok(covered.unequalSpeed >= 15 && covered.unequalG >= 15, `${covered.unequalSpeed} with unequal speeds, ${covered.unequalG} with unequal G`);
});

// Known limit. The chase is chaotic: two aircraft turning at each other pass
// close again and again, so a difference of one bit in a turn rate grows until,
// after minutes, the paths differ by feet. Core works the turn rate out as
// speed ÷ radius, V6 as g√(G²−1) ÷ speed; for about a quarter of speeds and Gs
// the two differ in the last digit (none of the grid's round speeds and Gs
// above do). So with the chase on and such a rate, the port follows V6 to 1e-9
// ft only for the first half-minute or so. Without the chase, see the grid above.
test('with the chase on and a rate that differs from V6 in the last digit, the fight follows V6 to 1e-9 ft for the first 40 s', () => {
  const setups = [
    { circles: 2, separationNm: 1.5, blueKt: 126.2, redKt: 112.4, blueG: 7.77, redG: 4.04, chase: true },
    { circles: 2, separationNm: 3, blueKt: 301.5, redKt: 298.1, blueG: 7.02, redG: 4.1, chase: true, vertical: true, bluePitchDeg: 17, redPitchDeg: 58 },
    { circles: 2, separationNm: 2, blueKt: 160, redKt: 350, blueG: 7, redG: 5, chase: true },
  ];
  for (const setup of setups) {
    const v6 = createV6Fight(setup);
    const mine = createFight({ ...setup, v6Start: true });
    const differs = v6.M(setup.blueKt, setup.blueG).w !== mine.perf.blue.rateRadPerSec || v6.M(setup.redKt, setup.redG).w !== mine.perf.red.rateRadPerSec;
    assert.ok(differs, 'this setup should have a rate that differs from V6 in the last digit');
    for (let i = 1; i <= 40 / FIGHT_STEP_SEC; i++) {
      v6.step(FIGHT_STEP_SEC);
      stepFight(mine, FIGHT_STEP_SEC);
      compareAircraft(mine.blue, v6.S.a, i, JSON.stringify(setup), 'Blue');
      compareAircraft(mine.red, v6.S.b, i, JSON.stringify(setup), 'Red');
    }
    assert.ok(mine.firstNose, 'first nose-on came before the 40 s were up');
  }
});
