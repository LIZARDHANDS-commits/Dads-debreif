// The Turn Fight's readout lines (SPEC-turn-fight, "Readouts"): V6's rounding, as text.
// tests/golden/turn-fight-sim.test.js compares every one with the text V6 writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFight, stepFight } from '../../../src/modules/turn-fight/sim.js';
import {
  timeText, phaseText, resultRows, moreDetailRows, firstNoseText, formatWholeFt,
} from '../../../src/modules/turn-fight/readouts.js';

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const pair = (r) => [r.blue, r.red];

test('at the start, at V6\'s defaults, the result is 19.2°/s and 1,106 ft each, 2.00 NM apart, no first nose-on', () => {
  const s = createFight();
  const r = byId(resultRows(s));
  assert.deepEqual(pair(r.turnRate), ['19.2°/s', '19.2°/s']);
  assert.deepEqual(pair(r.radius), ['1,106 ft', '1,106 ft']);
  assert.equal(r.range.text, '2.00 NM');
  assert.equal(r.firstNose.text, '--');
  assert.deepEqual(resultRows(s).map((x) => x.id), ['turnRate', 'radius', 'range', 'firstNose']);
});

test('More detail at the start: speed, G, 360° time, off-nose angle, time since the merge', () => {
  const m = byId(moreDetailRows(createFight()));
  assert.deepEqual(pair(m.speed), ['220 kt', '220 kt']);
  assert.deepEqual(pair(m.g), ['4.0', '4.0']);
  assert.deepEqual(pair(m.time360), ['18.7 s', '18.7 s']);
  assert.deepEqual(pair(m.offNose), ['0°', '0°']);
  assert.equal(m.sinceMerge.text, '0.0 s');
  assert.deepEqual(moreDetailRows(createFight()).map((x) => x.id), ['speed', 'g', 'time360', 'offNose', 'sinceMerge']);
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

test('rounding is V6\'s: G and rate and 360° time to one decimal, radius to whole feet, range to two decimals, angles to whole degrees', () => {
  const s = createFight({ blueKt: 173, redKt: 301, blueG: 3.34, redG: 6.66, separationNm: 1.25 });
  const r = byId(resultRows(s)), m = byId(moreDetailRows(s));
  assert.deepEqual(pair(m.g), ['3.3', '6.7']);
  assert.equal(r.turnRate.blue, '20.1°/s');
  assert.equal(r.radius.red, '1,218 ft');
  assert.equal(m.time360.blue, '17.9 s');
  assert.equal(r.range.text, '1.25 NM');
  assert.deepEqual(pair(m.speed), ['173 kt', '301 kt']);
});

test('the speed is shown as typed, and a G below 1.01 shows as the G V6 flies: 1.0', () => {
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

test('first nose-on reads "Blue at +18.2 s", counted from the merge, or "Red at …"; "--" until then', () => {
  assert.equal(firstNoseText(createFight()), '--');
  const s = createFight({ blueKt: 250, redKt: 200 });
  while (!s.firstNose) stepFight(s, 0.02);
  assert.equal(firstNoseText(s), 'Red at +14.4 s');
  assert.equal(byId(resultRows(s)).firstNose.text, 'Red at +14.4 s');
  const b = createFight({ blueG: 5 });
  while (!b.firstNose) stepFight(b, 0.02);
  assert.equal(firstNoseText(b), 'Blue at +12.6 s');
});

test('time since the merge counts up from the merge to one decimal and is 0.0 s before it', () => {
  const s = createFight();
  stepFight(s, 10);
  assert.equal(byId(moreDetailRows(s)).sinceMerge.text, '0.0 s');
  stepFight(s, s.mergeSec - 10 + 5);
  assert.equal(byId(moreDetailRows(s)).sinceMerge.text, '5.0 s');
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
