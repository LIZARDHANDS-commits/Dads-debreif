// Checks: the Simple fight's Result card lines: turn rate, radius, 360 degree time, range, ATA, AA and HCA
//   rows, first nose-on wording, rounding and data tags. Climb and dive cases retire with TF-R22.
//   The row list and the 2.00 NM range at the start are not pinned.
// Serves: TF-R16, TF-R3, TF-R12.
// Expected values: standard aerodynamics worked out in the test (5 G at 220 KTAS: 24.3 deg/s, 875 ft, 360
//   degrees in 14.8 s); rounding as TF-R16; tie and 3D wording are Patrick's Q48 and Q51.

// The Turn Fight's readout lines (SPEC-turn-fight, "Readouts", TF-R16): the numbers, rounded as the spec says, as text.
// Expected turn rates and radii are worked out here from standard aerodynamics (F1), not copied from the code or from V6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headingCrossAngleDeg } from '../../../src/core/angles.js';
import { KT_TO_FTPS, G_FTPS2 } from '../../../src/core/units.js';
import { createFight, stepFight, ataDeg } from '../../../src/modules/turn-fight/sim.js';
import {
  timeText, phaseText, resultRows, moreDetailRows, geometryRows, firstNoseText, formatWholeFt, aircraftTagLines,
} from '../../../src/modules/turn-fight/readouts.js';


// Standard aerodynamics for a level turn (F1): rate = g*sqrt(n^2-1)/V, radius = V^2/(g*sqrt(n^2-1)); V in ft/s.
const levelTurn = (ktas, n) => {
  const v = ktas * KT_TO_FTPS, gUnit = G_FTPS2 * Math.sqrt(n * n - 1);
  return { rateDegPerSec: (gUnit / v) * 180 / Math.PI, radiusFt: (v * v) / gUnit };
};
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const pair = (r) => [r.blue, r.red];

test('at the start, at the simple fight\'s setup of 5 G at 220 KTAS, the result is the level turn worked out here (24.3°/s, 875 ft each), 2.00 NM apart, no first nose-on', () => {
  const s = createFight();
  const r = byId(resultRows(s));
  // 220 KTAS = 371.3 ft/s; g*sqrt(5^2-1) = 32.174 * 4.899 = 157.6 ft/s^2; rate = 157.6 / 371.3 = 0.4245 rad/s = 24.3°/s; radius = 371.3^2 / 157.6 = 875 ft.
  const { rateDegPerSec, radiusFt } = levelTurn(220, 5);
  assert.deepEqual(pair(r.turnRate), [`${rateDegPerSec.toFixed(1)}°/s`, `${rateDegPerSec.toFixed(1)}°/s`]);
  assert.deepEqual(pair(r.radius), [`${Math.round(radiusFt)} ft`, `${Math.round(radiusFt)} ft`]);
  assert.equal(r.turnRate.blue, '24.3°/s', 'the worked figure for 5 G at 220 KTAS');
  assert.equal(r.radius.blue, '875 ft', 'the worked figure for 5 G at 220 KTAS');
  assert.equal(r.firstNose.text, '--');
});

test('More detail at the start: speed, G, 360° time, off-nose angle, time since the merge', () => {
  const m = byId(moreDetailRows(createFight()));
  assert.deepEqual(pair(m.speed), ['220 kt', '220 kt']);
  assert.deepEqual(pair(m.g), ['5.0', '5.0']);
  // A full circle takes 360 / rate (F1): 360 / 24.3°/s = 14.8 s.
  const t360 = 360 / levelTurn(220, 5).rateDegPerSec;
  assert.deepEqual(pair(m.time360), [`${t360.toFixed(1)} s`, `${t360.toFixed(1)} s`]);
  assert.equal(m.time360.blue, '14.8 s');
  assert.deepEqual(pair(m.offNose), ['0°', '0°']);
  assert.equal(m.sinceMerge.text, '0.0 s');
  assert.deepEqual(moreDetailRows(createFight()).map((x) => x.id), ['speed', 'g', 'time360', 'offNose', 'angleOff', 'sinceMerge']);
});

test('every row says what it is and which card it belongs to: a label, plain text, never HTML', () => {
  const s = createFight({ vertical: true, bluePitchDeg: 30 });
  stepFight(s, 25);
  for (const row of [...resultRows(s), ...moreDetailRows(s)]) {
    assert.ok(row.label && typeof row.label === 'string', row.id);
    const texts = 'text' in row ? [row.text] : [row.blue, row.red];
    for (const t of texts) assert.ok(typeof t === 'string' && !/[<>&]/.test(t), `${row.id}: ${t}`);
  }
});

test('the clock reads T+ and one decimal; the phase is HEAD-TO-HEAD until the merge, then 2-CIRCLE or 1-CIRCLE', () => {
  const two = createFight();
  assert.equal(timeText(two), 'T+0.0');
  assert.equal(phaseText(two), 'HEAD-TO-HEAD');
  stepFight(two, 16);
  assert.equal(timeText(two), 'T+16.0');
  assert.equal(phaseText(two), 'HEAD-TO-HEAD');
  stepFight(two, 1);
  assert.equal(timeText(two), 'T+17.0');
  assert.equal(phaseText(two), '2-CIRCLE');
  const one = createFight({ circles: 1 });
  stepFight(one, 17);
  assert.equal(phaseText(one), '1-CIRCLE');
});

test('rounding follows the spec\'s readout rules (TF-R16): G and rate and 360° time to one decimal, radius to whole feet, range to two decimals, angles to whole degrees', () => {
  const s = createFight({ blueKt: 173, redKt: 301, blueG: 3.34, redG: 6.66, separationNm: 1.25 });
  const r = byId(resultRows(s)), m = byId(moreDetailRows(s));
  assert.deepEqual(pair(m.g), ['3.3', '6.7']);
  assert.equal(r.turnRate.blue, '20.1°/s');
  assert.equal(r.radius.red, '1,218 ft');
  assert.equal(m.time360.blue, '17.9 s');
  assert.equal(r.range.text, '1.25 NM');
  assert.deepEqual(pair(m.speed), ['173 kt', '301 kt']);
});

test('the speed is shown as typed, and a G below 1.01 shows as 1.0, the least the simple fight flies', () => {
  const s = createFight({ blueKt: 220.5, blueG: 0.4 });
  const m = byId(moreDetailRows(s));
  assert.deepEqual(pair(m.speed), ['220.5 kt', '220 kt']);
  assert.equal(m.g.blue, '1.0');
});

test('whole feet have thousands separators, from 1,000 up, and a height a hair below zero reads 0 ft, not -0 ft', () => {
  assert.equal(formatWholeFt(0), '0');
  assert.equal(formatWholeFt(-0.4), '0');
  assert.equal(formatWholeFt(0.4), '0');
  assert.equal(formatWholeFt(999.4), '999');
  assert.equal(formatWholeFt(999.5), '1,000');
  assert.equal(formatWholeFt(1105.6), '1,106');
  assert.equal(formatWholeFt(-1234.6), '-1,235');
  assert.equal(formatWholeFt(1234567.2), '1,234,567');
  assert.equal(formatWholeFt(287.3), '287');
});

test('the radius of a tight turn has no separator: 150 kt at 7 G is 288 ft', () => {
  const r = byId(resultRows(createFight({ blueKt: 150, blueG: 7 })));
  assert.equal(r.radius.blue, '288 ft');
});

test('first nose-on reads "Blue at +… s", counted from the merge, or "Red at …"; "--" until then', () => {
  assert.equal(firstNoseText(createFight()), '--');
  const s = createFight({ blueKt: 250, redKt: 200 });
  while (!s.firstNose) stepFight(s, 0.02);
  assert.match(firstNoseText(s), /^Red at \+\d+\.\d+ s$/);
  assert.match(byId(resultRows(s)).firstNose.text, /^Red at \+\d+\.\d+ s$/);
  const b = createFight({ blueG: 6 });
  while (!b.firstNose) stepFight(b, 0.02);
  assert.match(firstNoseText(b), /^Blue at \+\d+\.\d+ s$/);
});

test('Q48: a tie reads "Both at +… s", in the card and in firstNoseText', () => {
  const s = createFight();
  while (!s.firstNose) stepFight(s, 0.02);
  assert.match(firstNoseText(s), /^Both at \+\d+\.\d+ s$/);
  assert.match(byId(resultRows(s)).firstNose.text, /^Both at \+\d+\.\d+ s$/);
  const one = createFight({ circles: 1 });
  while (!one.firstNose) stepFight(one, 0.02);
  assert.match(firstNoseText(one), /^Both at \+\d+\.\d+ s$/);
});

test('time since the merge counts up from the merge to one decimal and is 0.0 s before it', () => {
  const s = createFight();
  stepFight(s, 10);
  assert.equal(byId(moreDetailRows(s)).sinceMerge.text, '0.0 s');
  stepFight(s, s.mergeSec - 10 + 5);
  assert.equal(byId(moreDetailRows(s)).sinceMerge.text, '5.0 s');
});

test('Q51: the off-nose angle is labelled "Off-nose angle (ATA)", and true angle-off is one row, "Angle-off (HCA)"', () => {
  const rows = byId(moreDetailRows(createFight()));
  assert.equal(rows.offNose.label, 'Off-nose angle (ATA)');
  assert.equal(rows.angleOff.label, 'Angle-off (HCA)');
  assert.equal(rows.angleOff.group, 'more');
});

test('Q51: true angle-off is the difference in headings: 180° head-on where the off-nose angle is 0°, and the same for both aircraft', () => {
  const s = createFight();
  const m = byId(moreDetailRows(s));
  assert.equal(m.angleOff.text, '180°');
  assert.deepEqual(pair(m.offNose), ['0°', '0°']);
  // After the merge both jets turn left at the same rate, so they keep 180° apart (2-circle).
  stepFight(s, s.mergeSec + 5);
  assert.equal(byId(moreDetailRows(s)).angleOff.text, '180°', '2-circle: both turn left at the same rate');
  const one = createFight({ circles: 1 });
  stepFight(one, one.mergeSec + 5);
  const gap = Math.abs(((one.red.headingRad - one.blue.headingRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 180 / Math.PI;
  assert.equal(byId(moreDetailRows(one)).angleOff.text, `${gap.toFixed(0)}°`);
  assert.notEqual(byId(moreDetailRows(one)).angleOff.text, '180°', '1-circle: they turn opposite ways');
});

test('Q51: with Climb and dive on the off-nose angle in More detail is the 3D angle, nose to line of sight including height', () => {
  const s = createFight({ vertical: true, bluePitchDeg: 30, redPitchDeg: -20 });
  const flat = createFight();
  while (!flat.firstNose) { stepFight(flat, 0.02); stepFight(s, 0.02); }
  const m = byId(moreDetailRows(s)), f = byId(moreDetailRows(flat));
  assert.deepEqual(pair(f.offNose), ['5°', '5°'], 'level: first nose-on is judged within 5° of the nose (FIRST_NOSE_DEG, a design choice, TF-R9)');
  assert.notEqual(m.offNose.blue, '5°');
  assert.equal(m.offNose.blue, `${ataDeg(s, s.blue, s.red).toFixed(0)}°`);
  assert.equal(m.offNose.red, `${ataDeg(s, s.red, s.blue).toFixed(0)}°`);
});

test('off-nose angle: 0° head-on, and after the merge whatever the aircraft measure', () => {
  const s = createFight();
  stepFight(s, s.mergeSec + 5);
  const m = byId(moreDetailRows(s));
  assert.match(m.offNose.blue, /^\d+°$/);
  assert.match(m.offNose.red, /^\d+°$/);
  assert.notEqual(m.offNose.blue, '0°');
});

test('the height rows appear only with Climb and dive on: each aircraft\'s height change and the height between them, in whole feet', () => {
  assert.equal(moreDetailRows(createFight()).some((r) => r.id === 'heightChange' || r.id === 'heightBetween'), false);
  const s = createFight({ vertical: true, bluePitchDeg: 30, redPitchDeg: -20 });
  assert.deepEqual(byId(moreDetailRows(s)).heightChange && pair(byId(moreDetailRows(s)).heightChange), ['0 ft', '0 ft']);
  stepFight(s, s.mergeSec + 10);
  const m = byId(moreDetailRows(s));
  const after = s.timeSec - s.mergeSec;
  const blueFt = 220 * 1.68781 * Math.sin(Math.PI / 6) * after, redFt = -220 * 1.68781 * Math.sin(20 * Math.PI / 180) * after;
  assert.equal(m.heightChange.blue, `${formatWholeFt(blueFt)} ft`);
  assert.equal(m.heightChange.red, `${formatWholeFt(redFt)} ft`);
  assert.equal(m.heightBetween.text, `${formatWholeFt(Math.abs(blueFt - redFt))} ft`);
  assert.ok(m.heightChange.blue.includes(','), 'a thousand feet or more has its comma');
  assert.ok(m.heightChange.red.startsWith('-'), 'a dive is negative');
});

test('range is the straight line, height included: 1,000 ft apart in height adds to the range', () => {
  const s = createFight({ vertical: true, bluePitchDeg: 60, redPitchDeg: -60 });
  stepFight(s, s.mergeSec + 10);
  const flat = Math.hypot(s.red.xFt - s.blue.xFt, s.red.yFt - s.blue.yFt) / 6076.12;
  const range = Number(byId(resultRows(s)).range.text.replace(' NM', ''));
  assert.ok(range > flat + 0.3, `${range} vs ground ${flat}`);
});

test('reading the state changes nothing in it', () => {
  const s = createFight({ vertical: true, bluePitchDeg: 20, chase: true });
  stepFight(s, 40);
  const before = JSON.stringify(s);
  timeText(s); phaseText(s); resultRows(s); moreDetailRows(s); firstNoseText(s);
  assert.equal(JSON.stringify(s), before);
});

// ── R28: live AA, HCA and range ──────────────────────────────────────────────

test('R28 / D409: More detail geometry rows include aspect angle (AA) and derived bank angle', () => {
  const rows = geometryRows(createFight());
  assert.deepEqual(rows.map((r) => r.id), ['aspect', 'bank']);
  assert.deepEqual(rows.map((r) => r.label), ['Aspect angle (AA)', 'Derived bank angle']);
  assert.ok(rows.every((r) => r.group === 'more'));
  const all = [...resultRows(createFight()), ...moreDetailRows(createFight()), ...rows].map((r) => r.id);
  assert.equal(new Set(all).size, all.length, 'every row id is unique across both tables');
  assert.equal(byId(moreDetailRows(createFight())).angleOff.label, 'Angle-off (HCA)');
});

test('D409: derived bank angle in geometry rows is arccos(1/G)', () => {
  const s = createFight({ blueG: 2, redG: 3 });
  const rows = byId(geometryRows(s));
  assert.equal(rows.bank.blue, '60°', '2.0 G -> 60° bank');
  assert.equal(rows.bank.red, '71°', '3.0 G -> 71° bank (arccos(1/3))');
  const level = createFight({ blueG: 1, redG: 1 });
  assert.equal(byId(geometryRows(level)).bank.blue, '0°', '1.0 G -> 0° bank');
});

test('R28: head-on at the start reads AA 180° for both, HCA 180°, range 2.00 NM', () => {
  const s = createFight();
  assert.deepEqual(pair(byId(geometryRows(s)).aspect), ['180°', '180°']);
  assert.equal(byId(moreDetailRows(s)).angleOff.text, '180°');
  assert.equal(byId(resultRows(s)).range.text, '2.00 NM');
});

test('R28: a 90° crossing reads HCA 90° and Red\'s AA 90°; Blue dead astern of Red (tail chase) reads Red\'s AA 0° and Blue\'s 180°', () => {
  const x = createFight({ startAaDeg: 90 });
  assert.equal(byId(moreDetailRows(x)).angleOff.text, '90°');
  assert.equal(byId(geometryRows(x)).aspect.red, '90°');
  const chase = createFight({ startAaDeg: 0 });
  assert.equal(byId(moreDetailRows(chase)).angleOff.text, '0°');
  assert.deepEqual(pair(byId(geometryRows(chase)).aspect), ['180°', '0°'], 'Red is on Blue\'s nose (Blue\'s AA 180°); Blue is on Red\'s tail (Red\'s AA 0°)');
});

test('R28: the live AA moves with the fight', () => {
  const s = createFight({ startAtaDeg: 30, startAaDeg: 120, circles: 1 });
  stepFight(s, 5);
  const now = byId(geometryRows(s));
  assert.equal(now.aspect.blue, `${(180 - ataDeg(s, s.blue, s.red)).toFixed(0)}°`);
  assert.equal(now.aspect.red, `${(180 - ataDeg(s, s.red, s.blue)).toFixed(0)}°`);
  const later = createFight({ startAtaDeg: 30, startAaDeg: 120, circles: 1 });
  stepFight(later, 25);
  assert.notEqual(byId(geometryRows(later)).aspect.red, now.aspect.red);
});

test('R28: before the pass the phase says TO THE PASS unless the start is head-on; once the turns start it is 1- or 2-CIRCLE', () => {
  assert.equal(phaseText(createFight({ startAaDeg: 90 })), 'TO THE PASS');
  assert.equal(phaseText(createFight({ startAtaDeg: 30 })), 'TO THE PASS');
  assert.equal(phaseText(createFight({ startAtaSide: 'right', startAaSide: 'right' })), 'HEAD-TO-HEAD', 'head-on is the neutral start');
  assert.equal(phaseText(createFight({ startAaDeg: 90, turnsAt: 'once' })), '2-CIRCLE');
  const s = createFight({ startAaDeg: 90, circles: 1 });
  stepFight(s, s.mergeSec + 1);
  assert.equal(phaseText(s), '1-CIRCLE');
});

test('R28: the geometry rows are text only and change nothing in the state', () => {
  const s = createFight({ vertical: true, redAboveFt: 2000 });
  const before = JSON.stringify(s);
  for (const row of geometryRows(s)) for (const t of 'text' in row ? [row.text] : [row.blue, row.red]) assert.ok(typeof t === 'string' && !/[<>&]/.test(t));
  assert.equal(JSON.stringify(s), before);
});

test('R28: height change counts from each aircraft\'s start height, and the height between shows Red\'s start height', () => {
  const s = createFight({ vertical: true, redAboveFt: 3000 });
  const m = byId(moreDetailRows(s));
  assert.deepEqual(pair(m.heightChange), ['0 ft', '0 ft'], 'no height has been gained or lost yet');
  assert.equal(m.heightBetween.text, '3,000 ft');
  stepFight(s, s.mergeSec + 10);
  assert.equal(byId(moreDetailRows(s)).heightChange.red, '0 ft', 'level pitch: no change for Red');
  assert.equal(byId(moreDetailRows(s)).heightBetween.text, '3,000 ft');
});

test('aircraftTagLines produces speed, G-load and maneuver lines for both simple and energy modes', () => {
  const simple = createFight({ blueKt: 250, blueG: 4.5 });
  const bTag = aircraftTagLines(simple, simple.blue, 'blue');
  assert.equal(bTag.title, '250 KTAS · 4.5 G');
  assert.equal(bTag.detail, 'Straight');

  const energyFight = {
    energy: true,
    merged: true,
  };
  const ac = { kias: 160, g: 3.2, moveLabel: 'MPT' };
  const eTag = aircraftTagLines(energyFight, ac, 'blue');
  assert.equal(eTag.title, '160 KIAS · 3.2 G');
  assert.equal(eTag.detail, 'MPT');

  const shakerAc = { kias: 110, g: 2.0, moveLabel: 'Slice', onShaker: true };
  const sTag = aircraftTagLines(energyFight, shakerAc, 'red');
  assert.equal(sTag.detail, 'Slice (Shaker)');
});

