// The Turn Fight's start geometry (SPEC-turn-fight, "Start geometry and altitudes (R28)"):
// placing the two jets from range, off-nose angle (ATA) and aspect angle (AA), the HCA that
// follows, the pass (the closest point of approach), and which way each jet turns.
// Written before geometry.js; the three tests the spec requires come first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FT_PER_NM, KT_TO_FTPS } from '../../../src/core/units.js';
import { headingCrossAngleDeg, aspectAngleDeg, wrapPi, radToDeg } from '../../../src/core/angles.js';
import { createFight, FIGHT_MAX_SEC } from '../../../src/modules/turn-fight/sim.js';
import { START_DEFAULTS, MAX_PASS_SEC, startGeometry, turnDirections, isHeadOn, passNote, turnNote, passMarkWord, MERGE_WORD_MAX_NM } from '../../../src/modules/turn-fight/geometry.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected}`);
/** A setup: V6's defaults (2 NM, 220 kt each, head-on) with changes. */
const setup = (change = {}) => ({ separationNm: 2, blueKt: 220, redKt: 220, ...START_DEFAULTS, ...change });
const angleGap = (a, b) => Math.abs(radToDeg(wrapPi(a - b)));

test('ATA 0°, AA 180° gives today\'s head-on start: Blue east, Red west, the range apart on the x axis, meeting at the centre', () => {
  const g = startGeometry(setup());
  assert.equal(g.blue.headingRad, 0);
  near(angleGap(g.red.headingRad, Math.PI), 0, 1e-12, 'Red heading west');
  near(g.blue.xFt, -FT_PER_NM, 1e-6, 'Blue half the range left (equal speeds)');
  near(g.red.xFt, FT_PER_NM, 1e-6);
  near(g.blue.yFt, 0, 1e-6);
  near(g.red.yFt, 0, 1e-6);
  near(g.passSec, (2 * FT_PER_NM) / (440 * KT_TO_FTPS), 1e-9, 'the pass is the merge, T+16.4 s');
  near(g.hcaDeg, 180, 1e-9);
  assert.equal(g.closing, true);
  assert.equal(isHeadOn(setup()), true);
  // Unequal speeds: weighted by speed so they meet at the centre (Q49).
  const u = startGeometry(setup({ blueKt: 250, redKt: 200 }));
  near(u.blue.xFt, (-250 / 450) * 2 * FT_PER_NM, 1e-6);
  near(u.red.xFt, (200 / 450) * 2 * FT_PER_NM, 1e-6);
});

test('ATA 0°, AA 90° puts Red crossing Blue\'s nose, HCA 90°', () => {
  for (const side of ['left', 'right']) {
    const g = startGeometry(setup({ startAaDeg: 90, startAaSide: side }));
    near(g.hcaDeg, 90, 1e-9, `HCA ${side}`);
    // Red is still dead ahead of Blue, the range away, before the aircraft are shifted to the centre.
    const dx = g.red.xFt - g.blue.xFt, dy = g.red.yFt - g.blue.yFt;
    near(Math.hypot(dx, dy), 2 * FT_PER_NM, 1e-6, 'the range');
    near(dy, 0, 1e-6, 'Red straight ahead of Blue');
    assert.ok(dx > 0, 'ahead, along Blue\'s heading');
    // Red flies across Blue's nose: north when Blue is on Red's left (west of a north-bound Red).
    near(angleGap(g.red.headingRad, side === 'left' ? Math.PI / 2 : -Math.PI / 2), 0, 1e-9, `Red heading ${side}`);
    // Blue sits 90° off Red's tail.
    near(aspectAngleDeg({ x: g.red.xFt, y: g.red.yFt }, { x: g.blue.xFt, y: g.blue.yFt }, g.red.headingRad), 90, 1e-9);
  }
});

test('the pass comes at the closest point of approach, to within one 0.02 s step', () => {
  const cases = [
    {}, { startAtaDeg: 30, startAaDeg: 120 }, { startAtaDeg: 45, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right' },
    { startAtaDeg: 60, startAaDeg: 150, separationNm: 5 }, { startAtaDeg: 10, startAaDeg: 45, blueKt: 300, redKt: 150 },
    { startAtaDeg: 120, startAaDeg: 160, redKt: 400 }, { startAtaDeg: 80, startAaDeg: 100, startAaSide: 'right' },
  ];
  for (const change of cases) {
    const s = setup(change);
    const g = startGeometry(s);
    assert.equal(g.closing, true, JSON.stringify(change));
    // Fly both straight in 1 ms steps and find the smallest range.
    const vb = s.blueKt * KT_TO_FTPS, vr = s.redKt * KT_TO_FTPS;
    let best = Infinity, bestT = 0;
    for (let t = 0; t < 120; t += 0.001) {
      const d = Math.hypot(
        g.red.xFt + vr * Math.cos(g.red.headingRad) * t - (g.blue.xFt + vb * Math.cos(g.blue.headingRad) * t),
        g.red.yFt + vr * Math.sin(g.red.headingRad) * t - (g.blue.yFt + vb * Math.sin(g.blue.headingRad) * t),
      );
      if (d < best) { best = d; bestT = t; }
    }
    near(g.passSec, bestT, 0.02, `pass time for ${JSON.stringify(change)}`);
  }
});

test('the midpoint between the jets at the pass is the centre of the view', () => {
  for (const change of [{ startAtaDeg: 30, startAaDeg: 120 }, { startAtaDeg: 75, startAtaSide: 'right', startAaDeg: 100, blueKt: 280 }]) {
    const s = setup(change);
    const g = startGeometry(s);
    const vb = s.blueKt * KT_TO_FTPS, vr = s.redKt * KT_TO_FTPS;
    const bx = g.blue.xFt + vb * Math.cos(g.blue.headingRad) * g.passSec, by = g.blue.yFt + vb * Math.sin(g.blue.headingRad) * g.passSec;
    const rx = g.red.xFt + vr * Math.cos(g.red.headingRad) * g.passSec, ry = g.red.yFt + vr * Math.sin(g.red.headingRad) * g.passSec;
    near((bx + rx) / 2, 0, 1e-6);
    near((by + ry) / 2, 0, 1e-6);
  }
});

test('the range is always the set range, and ATA and AA read back as set, on either side', () => {
  for (const [ata, ataSide, aa, aaSide] of [[0, 'left', 180, 'left'], [30, 'left', 150, 'right'], [90, 'right', 90, 'left'], [135, 'right', 45, 'right'], [180, 'left', 0, 'left'], [60, 'left', 100, 'left']]) {
    const s = setup({ startAtaDeg: ata, startAtaSide: ataSide, startAaDeg: aa, startAaSide: aaSide, separationNm: 3 });
    const g = startGeometry(s);
    const dx = g.red.xFt - g.blue.xFt, dy = g.red.yFt - g.blue.yFt;
    near(Math.hypot(dx, dy), 3 * FT_PER_NM, 1e-6, 'range');
    // ATA: where Red sits off Blue's nose, signed positive to the left (counter-clockwise).
    const ataSigned = radToDeg(wrapPi(Math.atan2(dy, dx) - g.blue.headingRad));
    near(Math.abs(ataSigned), ata, 1e-9, `ATA ${ata}`);
    if (ata > 0 && ata < 180) assert.equal(ataSigned > 0, ataSide === 'left', `ATA side ${ata}`);
    // AA: where Blue sits off Red's tail, 180° when Red points at Blue.
    const aaRead = aspectAngleDeg({ x: g.red.xFt, y: g.red.yFt }, { x: g.blue.xFt, y: g.blue.yFt }, g.red.headingRad);
    near(aaRead, aa, 1e-9, `AA ${aa}`);
    if (aa > 0 && aa < 180) {
      const blueOffRedNose = radToDeg(wrapPi(Math.atan2(-dy, -dx) - g.red.headingRad));
      assert.equal(blueOffRedNose > 0, aaSide === 'left', `AA side ${aa}`);
    }
    near(g.hcaDeg, headingCrossAngleDeg(g.blue.headingRad, g.red.headingRad), 1e-9, 'HCA from the two headings');
  }
});

test('HCA follows from ATA and AA: Blue dead astern of Red, and Red dead astern of Blue pointing at it, are both 0°', () => {
  near(startGeometry(setup({ startAaDeg: 0 })).hcaDeg, 0, 1e-9, 'ATA 0, AA 0: Red ahead, flying away');
  near(startGeometry(setup({ startAtaDeg: 180, startAaDeg: 180 })).hcaDeg, 0, 1e-9, 'ATA 180, AA 180: Red behind, pointing at Blue');
});

test('a range that is not closing has no pass: the turns start at once', () => {
  // Tail chase at equal speed: the range never changes.
  const chase = startGeometry(setup({ startAaDeg: 0 }));
  assert.equal(chase.closing, false);
  assert.equal(chase.passSec, 0);
  // Red ahead of Blue and faster, flying the same way: opening.
  const opening = startGeometry(setup({ startAaDeg: 0, redKt: 300 }));
  assert.equal(opening.closing, false);
  assert.equal(opening.passSec, 0);
  // Abeam on parallel, opposite tracks: the range is at its smallest already.
  const beam = startGeometry(setup({ startAtaDeg: 90, startAaDeg: 90 }));
  assert.equal(beam.closing, false);
});

test('with no pass ahead the jets are centred on the start: the midpoint at T+0 is the origin', () => {
  const g = startGeometry(setup({ startAtaDeg: 90, startAaDeg: 90 }));
  near((g.blue.xFt + g.red.xFt) / 2, 0, 1e-6);
  near((g.blue.yFt + g.red.yFt) / 2, 0, 1e-6);
});

test('each jet turns toward the other, from where it sits when the turns start', () => {
  // Red slightly left of Blue's nose, Blue slightly left of Red's nose: a pass with each on the other's left.
  const s = setup({ startAtaDeg: 20, startAtaSide: 'left', startAaDeg: 160, startAaSide: 'left' });
  assert.deepEqual(turnDirections(s, startGeometry(s)), { blue: 1, red: 1 });
  // Mirror image: both turn right.
  const m = setup({ startAtaDeg: 20, startAtaSide: 'right', startAaDeg: 160, startAaSide: 'right' });
  assert.deepEqual(turnDirections(m, startGeometry(m)), { blue: -1, red: -1 });
  // Red starts to Blue's left but crosses Blue's nose to its right before the pass: at the pass Red is on Blue's right.
  const c = setup({ startAtaDeg: 10, startAtaSide: 'left', startAaDeg: 90, startAaSide: 'right' });
  assert.equal(turnDirections(c, startGeometry(c)).blue, -1, 'Blue turns right, toward where Red is at the pass');
});

test('at exactly head-on the side is a tie, so V6\'s directions stand: Blue counter-clockwise, Red the same way (2-circle)', () => {
  const s = setup();
  assert.deepEqual(turnDirections(s, startGeometry(s)), { blue: 1, red: 1 });
  // A tie stays a tie whichever side was picked when the angle is 0 or 180.
  const right = setup({ startAtaSide: 'right', startAaSide: 'right' });
  assert.deepEqual(turnDirections(right, startGeometry(right)), { blue: 1, red: 1 });
});

test('turns at once: the side is read at T+0', () => {
  // Red abeam to Blue's left at the start, turns at once: both turn left.
  const s = setup({ startAtaDeg: 90, startAtaSide: 'left', startAaDeg: 90, startAaSide: 'left', turnsAt: 'once' });
  assert.deepEqual(turnDirections(s, startGeometry(s)), { blue: 1, red: 1 });
  const r = setup({ startAtaDeg: 90, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right', turnsAt: 'once' });
  assert.deepEqual(turnDirections(r, startGeometry(r)), { blue: -1, red: -1 });
});

test('isHeadOn is true only for ATA 0° with AA 180° exactly, on either side', () => {
  assert.equal(isHeadOn(setup({ startAtaSide: 'right', startAaSide: 'right' })), true);
  assert.equal(isHeadOn(setup({ startAtaDeg: 0.5 })), false);
  assert.equal(isHeadOn(setup({ startAaDeg: 179.5 })), false);
});

test('the defaults are head-on, turns at the pass, Red level with Blue', () => {
  assert.deepEqual({ ...START_DEFAULTS }, {
    startAtaDeg: 0, startAtaSide: 'left', startAaDeg: 180, startAaSide: 'left', redAboveFt: 0, turnsAt: 'pass',
  });
});

test('with the turns at once the jets are centred on T+0, not on a pass that never comes: a tail chase at 200 kt against 220 kt', () => {
  const g = startGeometry(setup({ startAaDeg: 0, redKt: 200, turnsAt: 'once' }));
  near((g.blue.xFt + g.red.xFt) / 2, 0, 1e-6, 'midpoint x at T+0');
  near((g.blue.yFt + g.red.yFt) / 2, 0, 1e-6);
  // With the turns at the pass the same start is centred on the pass (T+360 s), far from the origin at T+0.
  const pass = startGeometry(setup({ startAaDeg: 0, redKt: 200 }));
  assert.ok(pass.closing);
  assert.ok(Math.abs((pass.blue.xFt + pass.red.xFt) / 2) > 1e4);
});

test('a pass later than the 10-minute fight is no pass: a tail chase at 221 against 220 kt turns at once', () => {
  assert.equal(MAX_PASS_SEC, FIGHT_MAX_SEC);
  const g = startGeometry(setup({ startAaDeg: 0, blueKt: 221, redKt: 220 }));
  assert.equal(g.closing, false);
  assert.equal(g.passSec, 0);
  near((g.blue.xFt + g.red.xFt) / 2, 0, 1e-6, 'centred on T+0');
});

test('rounding noise is not a pass: a beam start on either side reports no pass, not one at 2e-15 s', () => {
  for (const side of ['left', 'right']) {
    const g = startGeometry(setup({ startAtaDeg: 90, startAtaSide: side, startAaDeg: 90, startAaSide: side }));
    assert.equal(g.closing, false, side);
    assert.equal(g.passSec, 0, side);
  }
});

test('on a collision course the side is the one set up: ATA 45 right with AA 135 left at equal speeds turns Blue right (toward Red) and Red left (toward Blue)', () => {
  const s = setup({ startAtaDeg: 45, startAtaSide: 'right', startAaDeg: 135, startAaSide: 'left' });
  const g = startGeometry(s);
  assert.equal(g.closing, true);
  // The jets meet at one point at the pass (a 0 ft miss), so the side cannot be read there.
  const vb = 220 * KT_TO_FTPS;
  const bx = g.blue.xFt + vb * g.passSec, by = g.blue.yFt;
  const rx = g.red.xFt + vb * Math.cos(g.red.headingRad) * g.passSec, ry = g.red.yFt + vb * Math.sin(g.red.headingRad) * g.passSec;
  assert.ok(Math.hypot(rx - bx, ry - by) < 1e-3, 'collision course');
  assert.deepEqual(turnDirections(s, g), { blue: -1, red: 1 });
  const mirror = setup({ startAtaDeg: 45, startAtaSide: 'left', startAaDeg: 135, startAaSide: 'right' });
  assert.deepEqual(turnDirections(mirror, startGeometry(mirror)), { blue: 1, red: -1 });
});

test('the pass note says when the jets pass, or that there is no pass', () => {
  assert.equal(passNote(setup()), 'Pass at T+16.4 s');
  assert.equal(passNote(setup({ startAaDeg: 0, redKt: 200 })), 'Pass at T+360.0 s');
  assert.equal(passNote(setup({ startAaDeg: 0 })), 'No pass: the turns start at once');
  assert.equal(passNote(setup({ startAtaDeg: 90, startAaDeg: 90 })), 'No pass: the turns start at once');
  assert.equal(passNote(setup({ turnsAt: 'once' })), 'Turns start at once (the jets pass at T+16.4 s)');
});

// ---- the turn line (TF3-2) and the tail chase (TF3-1) ----------------------------------------------

const base = { separationNm: 2, blueKt: 220, redKt: 220, ...START_DEFAULTS };
const words = (setup) => [2, 1].map((circles) => turnNote({ ...base, ...setup, circles }));

test('the turn line says which way each jet turns, with Red flipped in a 1-circle fight: head-on is V6\'s left and left, left and right', () => {
  assert.deepEqual(words({}), ['Blue turns left, Red turns left', 'Blue turns left, Red turns right']);
});

test('the turn line follows the side: a beam start on the left turns left, on the right turns right, and 1-circle flips Red', () => {
  assert.deepEqual(words({ startAtaDeg: 90, startAtaSide: 'left', startAaDeg: 90, startAaSide: 'left' }), ['Blue turns left, Red turns left', 'Blue turns left, Red turns right']);
  assert.deepEqual(words({ startAtaDeg: 90, startAtaSide: 'right', startAaDeg: 90, startAaSide: 'right' }), ['Blue turns right, Red turns right', 'Blue turns right, Red turns left']);
  // Red crossing Blue's nose: the side Blue is on decides, as the fight flies it.
  assert.deepEqual(words({ startAaDeg: 90, startAaSide: 'left' }), ['Blue turns left, Red turns left', 'Blue turns left, Red turns right']);
  assert.deepEqual(words({ startAaDeg: 90, startAaSide: 'right' }), ['Blue turns right, Red turns right', 'Blue turns right, Red turns left']);
});

test('from a tail chase the 2-circle directions differ: Blue left and Red right, so "same direction" is not what 2-circle means there', () => {
  const tail = { startAtaDeg: 30, startAtaSide: 'left', startAaDeg: 20, startAaSide: 'right', redKt: 150 };
  assert.deepEqual(words(tail), ['Blue turns left, Red turns right', 'Blue turns left, Red turns left']);
  const dirs = turnDirections({ ...base, ...tail }, startGeometry({ ...base, ...tail }));
  assert.notEqual(dirs.blue, dirs.red, 'each turns toward the other, from opposite sides');
  // A stern chase (dead astern of a slower Red): both ties, so V6's directions stand.
  assert.deepEqual(words({ startAtaDeg: 0, startAaDeg: 0, redKt: 150 }), ['Blue turns left, Red turns left', 'Blue turns left, Red turns right']);
});

// ---- the word at the pass (TF3-5) -----------------------------------------------------------------

test('the word at the pass is MERGE when the jets meet and PASS when they go by more than 0.25 NM apart', () => {
  const word = (setup) => passMarkWord(createFight({ ...setup }));
  assert.equal(MERGE_WORD_MAX_NM, 0.25);
  assert.equal(word({}), 'MERGE', 'head-on, V6\'s merge');
  assert.equal(word({ startAtaDeg: 0, startAaDeg: 0, redKt: 150 }), 'MERGE', 'a stern chase passes through');
  assert.equal(word({ startAtaDeg: 5, startAaDeg: 175 }), 'MERGE', '2 NM x sin 5° = 0.17 NM apart');
  assert.equal(word({ startAtaDeg: 20, startAaDeg: 160 }), 'PASS', '0.68 NM apart');
  assert.equal(word({ startAaDeg: 90 }), 'PASS', 'crossing Blue\'s nose: 1.4 NM apart at the closest');
  near(startGeometry({ ...base, startAaDeg: 90 }).passRangeFt / FT_PER_NM, 2 * Math.SQRT1_2, 1e-9);
  assert.equal(startGeometry({ ...base, startAtaDeg: 90, startAaDeg: 90 }).passRangeFt, 0, 'no pass, no range');
});

test('TF3-2: with First nose chases on the turn line says the turns are only until first nose-on, then each chases the other', () => {
  const chase = { ...base, chase: true, circles: 2 };
  assert.equal(turnNote(chase), 'Blue turns left, Red turns left (until first nose-on; then each chases the other)');
  assert.equal(turnNote({ ...chase, circles: 1 }), 'Blue turns left, Red turns right (until first nose-on; then each chases the other)');
  assert.equal(turnNote({ ...chase, chase: false }), 'Blue turns left, Red turns left');
});
