// What the standards labels mean, on simple formations, including Patrick's
// fix for #21 (D78), with what V6 said instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_STANDARDS, formationAxes, classifyDebriefPosition, classifyLeadParameters, standardsSummaryLines, classifyTurnSimPosition } from '../../../src/core/standards.js';

const NORTH = Math.PI / 2;
const lead = { x: 0, y: 0, spdKt: 200 };
// Heading north: left is west (−x), aft is south (−y).
const at = (leftFt, aftFt) => ({ x: -leftFt, y: -aftFt });
const only = (group) => ({ ...V6_STANDARDS, spread: { ...V6_STANDARDS.spread, on: group === 'spread' }, offset: { ...V6_STANDARDS.offset, on: group === 'offset' } });
const labels = (id, live, std) => classifyDebriefPosition(id, { 1: lead, ...live }, NORTH, std)?.labels.join(' / ');

test('the axes: heading north, forward is north and the across-vector is west, Lead\'s left', () => {
  const { fwd, left } = formationAxes(lead, NORTH);
  assert.ok(Math.abs(fwd.x) < 1e-15 && fwd.y === 1);
  assert.ok(left.x === -1 && Math.abs(left.y) < 1e-15);
});

test('spread: #2 5,000 ft abeam is on parameters; closer is TIGHT, further WIDE, ahead FORE', () => {
  assert.equal(labels(2, { 2: at(5000, 0) }), 'ON PARAMETERS');
  assert.equal(labels(2, { 2: at(-5000, 0) }), 'ON PARAMETERS', 'either side');
  assert.equal(labels(2, { 2: at(3000, 0) }), 'TIGHT');
  assert.equal(labels(2, { 2: at(7000, 300) }), 'WIDE / AFT');
  assert.equal(labels(2, { 2: at(5000, -300) }), 'FORE');
  assert.equal(labels(2, { 2: at(4001, 249) }), 'ON PARAMETERS', 'just inside the edges');
});

test('#4 measures its interval from #3 when #3 is out on the same side', () => {
  const live = { 3: at(5000, 0), 4: at(10000, 0) };
  assert.equal(classifyDebriefPosition(4, { 1: lead, ...live }, NORTH).intervalFt, 5000);
  assert.equal(classifyDebriefPosition(4, { 1: lead, 3: at(-5000, 0), 4: at(10000, 0) }, NORTH).intervalFt, 10000, '#3 on the other side');
  assert.equal(classifyTurnSimPosition({ id: 4, ...at(10000, 0) }, [{ id: 1, ...lead, hdg: NORTH }, { id: 3, ...at(5000, 0) }]).intervalFt, 5000);
});

test('D78 (#21): with spread and offset both on, the offset standard alone judges #3\'s fore/aft', () => {
  // #3 where the offset standard wants it, 8,000 ft aft, is on parameters (V6: AFT).
  assert.equal(labels(3, { 3: at(5000, 8000) }), 'ON PARAMETERS');
  assert.equal(classifyDebriefPosition(3, { 1: lead, 3: at(5000, 8000) }, NORTH).offsetStatus, 'OFFSET OK');
  // Abeam is too far forward for the offset (V6: FORE, the same).
  assert.equal(labels(3, { 3: at(5000, 0) }), 'FORE');
  // One fore/aft label, never two (V6: FORE / FORE, AFT / AFT, AFT / FORE).
  assert.equal(labels(3, { 3: at(5000, -500) }), 'FORE');
  assert.equal(labels(3, { 3: at(5000, 10000) }), 'AFT');
  assert.equal(labels(3, { 3: at(5000, 6000) }), 'FORE');
  // Spread still judges #3's interval.
  assert.equal(labels(3, { 3: at(3000, 8000) }), 'TIGHT');
  assert.equal(labels(3, { 3: at(7000, 10000) }), 'WIDE / AFT');
});

test('D78 changes only #3 with both standards on', () => {
  // With one standard on, #3 is judged by it alone, as in V6.
  assert.equal(labels(3, { 3: at(5000, 8000) }, only('spread')), 'AFT');
  assert.equal(labels(3, { 3: at(5000, 0) }, only('spread')), 'ON PARAMETERS');
  assert.equal(labels(3, { 3: at(5000, 8000) }, only('offset')), 'ON PARAMETERS');
  // #2 and #4 have no offset standard: spread judges their fore/aft.
  assert.equal(labels(2, { 2: at(5000, 8000) }), 'AFT');
  assert.equal(labels(4, { 4: at(5000, 8000) }), 'AFT');
});

test('V6 (#21): an aircraft no standard checks is still "ON PARAMETERS"; with both off, no label', () => {
  assert.equal(labels(2, { 2: at(100, 3000) }, only('offset')), 'ON PARAMETERS');
  const none = { ...V6_STANDARDS, spread: { ...V6_STANDARDS.spread, on: false }, offset: { ...V6_STANDARDS.offset, on: false } };
  assert.equal(labels(2, { 2: at(100, 3000) }, none), '');
});

test('Lead and missing aircraft get no position label', () => {
  assert.equal(classifyDebriefPosition(1, { 1: lead }, NORTH), null);
  assert.equal(classifyDebriefPosition(2, { 1: lead }, NORTH), null);
  assert.equal(classifyDebriefPosition(2, { 2: at(5000, 0) }, NORTH), null);
});

test('lead standard: 200 ±10 kt and 1.0 ±0.2 G; recorded G wins over the estimate', () => {
  const lab = (l, estG, std) => classifyLeadParameters(l, estG, std)?.labels.join(' / ');
  assert.equal(lab({ spdKt: 205 }, 1.1), 'LEAD ON PARAMETERS');
  assert.equal(lab({ spdKt: 185 }, 1.5), 'SLOW / HIGH G');
  assert.equal(lab({ spdKt: 215, gNative: 0.7 }, 1.0), 'FAST / LOW G');
  assert.equal(lab({ spdKt: 200 }, null), 'LEAD ON PARAMETERS', 'no G known');
  assert.equal(lab({}, 1), 'SLOW', 'no speed reads as 0 kt');
  assert.equal(lab(undefined, 1), undefined);
  assert.equal(classifyLeadParameters({ spdKt: 100 }, 3, { ...V6_STANDARDS, lead: { ...V6_STANDARDS.lead, on: false } }), null);
});

test('the summary lists the standards that are on', () => {
  assert.deepEqual(standardsSummaryLines(), [
    'Spread: 4000-6000 ft, 3/9 ±250 ft',
    'Offset #3 aft: 8000 ±1000 ft',
    'Lead: 200 ±10 kt, 1.0 ±0.20 G',
  ]);
  assert.equal(standardsSummaryLines(only('spread')).length, 2);
});

test('Turn Sim offset box: #3 in the slot 8,000 ft back is on spacing; outside the slot it is WIDE', () => {
  const fleet = [{ id: 1, ...lead, hdg: NORTH }, { id: 2, ...at(5000, 0) }, { id: 3, ...at(2500, 8000) }, { id: 4, ...at(7500, 8000) }];
  const lab = a => classifyTurnSimPosition(a, fleet, 'offsetBox').labels.join(' / ');
  assert.equal(lab(fleet[1]), 'ON SPACING');
  assert.equal(lab(fleet[2]), 'ON SPACING');
  assert.equal(lab(fleet[3]), 'ON SPACING', '#4 5,000 ft from #3, level with it');
  assert.equal(lab({ id: 3, ...at(6000, 8000) }), 'WIDE');
  assert.equal(lab({ id: 3, ...at(-600, 6500) }), 'FORE / WIDE');
});

// D116 (SMM 16.18 para 49): the sweep check, 0-10° behind the 3/9 line, in place of V6's ± 250 ft.
const SWEEP = { ...V6_STANDARDS, spread: { on: true, minFt: 4000, maxFt: 6000, sweepMinDeg: 0, sweepMaxDeg: 10 } };

test('D116 sweep: 0 to 10° behind the 3/9 line passes; ahead of it is FORE, further back AFT', () => {
  // 10° at 5,000 ft is 881.6 ft back.
  assert.equal(labels(2, { 2: at(5000, 0) }, SWEEP), 'ON PARAMETERS', 'on the 3/9 line');
  assert.equal(labels(2, { 2: at(5000, 881) }, SWEEP), 'ON PARAMETERS', 'just inside 10°');
  assert.equal(labels(2, { 2: at(5000, 882) }, SWEEP), 'AFT', 'just past 10°');
  assert.equal(labels(2, { 2: at(5000, -1) }, SWEEP), 'FORE', 'any amount ahead of the line');
  assert.equal(labels(2, { 2: at(-5000, 500) }, SWEEP), 'ON PARAMETERS', 'either side');
  // V6's ± 250 ft would call 500 ft back AFT and 200 ft ahead on parameters.
  assert.equal(labels(2, { 2: at(5000, 500) }), 'AFT');
  assert.equal(labels(2, { 2: at(5000, 500) }, SWEEP), 'ON PARAMETERS');
  assert.equal(labels(2, { 2: at(5000, -200) }), 'ON PARAMETERS');
  assert.equal(labels(2, { 2: at(5000, -200) }, SWEEP), 'FORE');
  // The angle, not the distance: further out, more feet back still pass.
  assert.equal(labels(2, { 2: at(5900, 1000) }, SWEEP), 'ON PARAMETERS');
  assert.equal(labels(2, { 2: at(4100, 1000) }, SWEEP), 'AFT');
  assert.equal(labels(2, { 2: at(7000, 300) }, SWEEP), 'WIDE', 'interval still judged by spread');
});

test('D116 sweep: the angle is reported, and #4 is swept from #3 when it flies off #3', () => {
  const pos = classifyDebriefPosition(2, { 1: lead, 2: at(5000, 500) }, NORTH, SWEEP);
  assert.ok(Math.abs(pos.sweepDeg - 5.7106) < 1e-4, String(pos.sweepDeg));
  assert.ok(Math.abs(pos.foreAftFt + 500) < 1e-9, 'fore/aft is still given, from Lead');
  // #3 5,000 ft out and 400 ft back; #4 5,000 ft beyond it (SMM 16.42 para 116: #4 flies LAB off #3).
  assert.equal(labels(4, { 3: at(5000, 400), 4: at(10000, 800) }, SWEEP), 'ON PARAMETERS', '4.6° off #3');
  assert.equal(labels(4, { 3: at(5000, 1000), 4: at(10000, 1500) }, SWEEP), 'ON PARAMETERS', '5.7° off #3, though 1,500 ft back');
  // 1,000 ft behind #3 is 11.3° off #3, though only 8° from Lead.
  assert.equal(labels(4, { 3: at(5000, 400), 4: at(10000, 1400) }, SWEEP), 'AFT');
  // #3 on the other side: #4 is judged from Lead.
  assert.equal(labels(4, { 3: at(-5000, 0), 4: at(10000, 1400) }, SWEEP), 'WIDE');
});

test('D116 sweep with D78: the offset standard still judges #3\'s fore/aft', () => {
  assert.equal(labels(3, { 3: at(5000, 8000) }, SWEEP), 'ON PARAMETERS');
  assert.equal(labels(3, { 3: at(5000, 8000) }, { ...SWEEP, offset: { ...SWEEP.offset, on: false } }), 'AFT', '58° of sweep');
});

test('D116 sweep: the summary names it', () => {
  assert.equal(standardsSummaryLines(SWEEP)[0], 'Spread: 4000-6000 ft, sweep 0 to 10°');
  assert.equal(standardsSummaryLines({ ...SWEEP, spread: { ...SWEEP.spread, sweepMaxDeg: 12.5 } })[0], 'Spread: 4000-6000 ft, sweep 0 to 12.5°');
  assert.equal(standardsSummaryLines({ ...SWEEP, spread: { ...SWEEP.spread, sweepMinDeg: -2 } })[0], 'Spread: 4000-6000 ft, sweep -2 to 10°');
});

test('D116 sweep: a minimum below 0 lets an aircraft sit a little ahead of the 3/9 line', () => {
  const loose = { ...SWEEP, spread: { ...SWEEP.spread, sweepMinDeg: -2 } };
  assert.equal(labels(2, { 2: at(5000, -150) }, loose), 'ON PARAMETERS', '1.7° ahead');
  assert.equal(labels(2, { 2: at(5000, -180) }, loose), 'FORE', '2.1° ahead');
});

test('D116 sweep in the Turn Sim: spread, and the offset box\'s #2 and #4', () => {
  const lab = (a, fleet, formation) => classifyTurnSimPosition(a, fleet, formation, SWEEP).labels.join(' / ');
  const leadN = { id: 1, ...lead, hdg: NORTH };
  assert.equal(lab({ id: 2, ...at(5000, 500) }, [leadN], 'weighted'), 'ON SPACING');
  assert.equal(lab({ id: 2, ...at(5000, 1000) }, [leadN], 'weighted'), 'AFT');
  assert.equal(lab({ id: 2, ...at(5000, -10) }, [leadN], 'offsetBox'), 'FORE');
  const three = { id: 3, ...at(2500, 8000) };
  assert.equal(lab({ id: 4, ...at(7500, 8500) }, [leadN, three], 'offsetBox'), 'ON SPACING', '5.7° off #3');
  assert.equal(lab({ id: 4, ...at(7500, 7990) }, [leadN, three], 'offsetBox'), 'FORE', 'ahead of #3\'s 3/9 line');
  assert.equal(classifyTurnSimPosition(three, [leadN, three], 'offsetBox', SWEEP).sweepDeg, null, '#3 in the box is the offset standard\'s');
});
