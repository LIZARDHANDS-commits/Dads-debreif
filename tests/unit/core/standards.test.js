// What the standards labels mean, on simple formations, including the V6
// behaviour #21 reports (kept until Q39 is decided).
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

test('V6 (#21, Q39 open): with spread and offset both on, #3 can never be on parameters', () => {
  // #3 exactly where the offset standard wants it: 8,000 ft aft.
  assert.equal(labels(3, { 3: at(5000, 8000) }), 'AFT', 'spread calls it AFT');
  assert.equal(labels(3, { 3: at(5000, 8000) }, only('offset')), 'ON PARAMETERS');
  assert.equal(classifyDebriefPosition(3, { 1: lead, 3: at(5000, 8000) }, NORTH).offsetStatus, 'OFFSET OK');
  // #3 where the spread standard wants it: abeam.
  assert.equal(labels(3, { 3: at(5000, 0) }), 'FORE', 'offset calls it FORE');
  assert.equal(labels(3, { 3: at(5000, 0) }, only('spread')), 'ON PARAMETERS');
  // The same label twice, or both at once.
  assert.equal(labels(3, { 3: at(5000, -500) }), 'FORE / FORE');
  assert.equal(labels(3, { 3: at(5000, 10000) }), 'AFT / AFT');
  assert.equal(labels(3, { 3: at(5000, 6000) }), 'AFT / FORE');
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
