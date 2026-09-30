// Unit tests for src/modules/traffic/readouts.js (SPEC-traffic, "Screen" and "Readouts"):
// the text the Traffic screen shows, with V6's rounding. Each expected string is worked
// out by hand here; tests/golden/traffic-readouts.test.js has V6's own text to compare.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noConflictsText, clockText, startTimeText, aircraftRows, conflictLines,
  legDistanceRows, pointDataText, turnDataText, pointRows,
} from '../../../src/modules/traffic/readouts.js';

const point = (x, y, extra = {}) => ({ label: '', x, y, alt: 2500, kt: 120, g: 2, ...extra });

// ── The clock ────────────────────────────────────────────────────────────────

test('the clock reads H:MM:SS', () => {
  assert.equal(clockText(0), '0:00:00');
  assert.equal(clockText(1), '0:00:01');
  assert.equal(clockText(59), '0:00:59');
  assert.equal(clockText(60), '0:01:00');
  assert.equal(clockText(137), '0:02:17');
  assert.equal(clockText(760), '0:12:40');
});

test('the clock keeps counting past an hour instead of wrapping to 00:00 (V6 bug #46)', () => {
  assert.equal(clockText(3599), '0:59:59');
  assert.equal(clockText(3600), '1:00:00');
  assert.equal(clockText(3661), '1:01:01');
  assert.equal(clockText(7325), '2:02:05');
  assert.equal(clockText(36000), '10:00:00');
  assert.equal(clockText(86399), '23:59:59');
  assert.equal(clockText(86400), '24:00:00', 'and past a day');
  assert.equal(clockText(90061), '25:01:01');
});

test('the clock shows the second that has begun, dropping the fraction, as V6 does: 59.999 s is still 0:00:59', () => {
  assert.equal(clockText(0.05), '0:00:00');
  assert.equal(clockText(0.999), '0:00:00');
  assert.equal(clockText(59.999), '0:00:59');
  assert.equal(clockText(3599.95), '0:59:59');
  assert.equal(clockText(3600.05), '1:00:00');
});

test('the clock added up 0.05 s at a time is a hair short of some whole seconds, and reads the second before them, as V6 does', () => {
  let t = 0;
  for (let step = 0; step < 60; step++) t += 0.05; // 3 s
  assert.ok(t < 3 && t > 2.9999999999999, `${t}`);
  assert.equal(clockText(t), '0:00:02');
  assert.equal(clockText(t + 0.05), '0:00:03');
});

test('a time that is not a time reads 0:00:00', () => {
  for (const t of [-1, -0.5, NaN, Infinity, -Infinity, undefined]) assert.equal(clockText(t), '0:00:00', `${t}`);
});

test('a start time reads M:SS, as the aircraft list has it ("starts at 2:17"), and H:MM:SS from an hour', () => {
  assert.equal(startTimeText(0), '0:00');
  assert.equal(startTimeText(12), '0:12');
  assert.equal(startTimeText(137), '2:17');
  assert.equal(startTimeText(599), '9:59');
  assert.equal(startTimeText(3599), '59:59');
  assert.equal(startTimeText(3600), '1:00:00');
  assert.equal(startTimeText(3725.5), '1:02:05');
  assert.equal(startTimeText(12.000000000000005), '0:12', 'V6\'s own start time for A1 (line 613)');
});

// ── The aircraft rows ────────────────────────────────────────────────────────

const routes = [{ id: 'PAT1', name: 'Pattern 1' }, { id: 'ENT1', name: 'Entry 1' }];
const aircraft = (over) => ({ id: 'A1', type: 'CT-156', color: '#7ee787', routeId: 'PAT1', x: 0, y: 0, alt: 2500, kt: 120, headingDeg: 0, leg: 3, distFt: 0, status: 'flying', startsAt: 0, ...over });

test('an aircraft row has V6\'s columns: callsign, type, route name, leg, height, speed and status', () => {
  const [row] = aircraftRows({ t: 50, aircraft: [aircraft({ alt: 2499.5, kt: 119.5, leg: 4 })], conflicts: [] }, { routes });
  assert.deepEqual(row.cells, ['A1', 'CT-156', 'Pattern 1', '4', '2500', '120', 'Flying']);
  assert.equal(row.id, 'A1');
  assert.equal(row.type, 'CT-156');
  assert.equal(row.routeName, 'Pattern 1');
  assert.equal(row.leg, 4);
  assert.equal(row.altFt, 2500);
  assert.equal(row.kt, 120);
  assert.equal(row.status, 'flying');
  assert.equal(row.statusText, 'Flying');
  assert.equal(row.color, '#7ee787');
});

test('height and speed are rounded to whole numbers the way V6 rounds them (Math.round: .5 goes up)', () => {
  const rows = aircraftRows({ t: 0, aircraft: [
    aircraft({ id: 'A1', alt: 2499.4, kt: 99.4 }), aircraft({ id: 'A2', alt: 2499.5, kt: 99.5 }), aircraft({ id: 'A3', alt: 1880, kt: 100.49 }),
    aircraft({ id: 'A4', alt: 0.4, kt: 0.5 }),
  ], conflicts: [] }, { routes });
  assert.deepEqual(rows.map((r) => [r.altFt, r.kt]), [[2499, 99], [2500, 100], [1880, 100], [0, 1]]);
  assert.deepEqual(rows.map((r) => [r.cells[4], r.cells[5]]), [['2499', '99'], ['2500', '100'], ['1880', '100'], ['0', '1']]);
});

test('Flying, Waiting, Landed and Done', () => {
  const rows = aircraftRows({ t: 100, aircraft: ['flying', 'waiting', 'landed', 'done'].map((status, i) => aircraft({ id: 'A' + (i + 1), status })), conflicts: [] }, { routes });
  assert.deepEqual(rows.map((r) => r.statusText), ['Flying', 'Waiting', 'Landed', 'Done']);
  assert.deepEqual(rows.map((r) => r.cells[6]), ['Flying', 'Waiting', 'Landed', 'Done']);
});

test('a waiting aircraft says when it starts ("starts at 2:17"); the others say nothing', () => {
  const rows = aircraftRows({ t: 10, aircraft: [
    aircraft({ id: 'A1', status: 'waiting', startsAt: 137 }), aircraft({ id: 'A2', status: 'flying', startsAt: 5 }),
    aircraft({ id: 'A3', status: 'landed', startsAt: 5 }), aircraft({ id: 'A4', status: 'done', startsAt: 5 }),
    aircraft({ id: 'A5', status: 'waiting', startsAt: 3725.5 }),
  ], conflicts: [] }, { routes });
  assert.deepEqual(rows.map((r) => r.startsText), ['starts at 2:17', '', '', '', 'starts at 1:02:05']);
});

test('the route is shown by name, and an aircraft on a route that has gone is shown on the first route, as V6 does', () => {
  const rows = aircraftRows({ t: 0, aircraft: [aircraft({ routeId: 'ENT1' }), aircraft({ id: 'A2', routeId: 'GONE' })], conflicts: [] }, { routes });
  assert.deepEqual(rows.map((r) => r.routeName), ['Entry 1', 'Pattern 1']);
  assert.equal(aircraftRows({ t: 0, aircraft: [aircraft({ routeId: 'GONE' })], conflicts: [] }, { routes: [] })[0].routeName, '', 'with no routes at all, V6 shows nothing');
  assert.equal(aircraftRows({ t: 0, aircraft: [aircraft()], conflicts: [] }, {})[0].routeName, '', 'and a setup with no routes list is no routes');
});

test('the label beside an aircraft on the map is height, speed and route, as V6 writes it', () => {
  const [row] = aircraftRows({ t: 0, aircraft: [aircraft({ alt: 1879.6, kt: 100.4 })], conflicts: [] }, { routes });
  assert.equal(row.labelText, '1880ft 100kt Pattern 1');
});

test('no aircraft gives no rows, and the rows keep the state\'s order', () => {
  assert.deepEqual(aircraftRows({ t: 0, aircraft: [], conflicts: [] }, { routes }), []);
  const rows = aircraftRows({ t: 0, aircraft: [aircraft({ id: 'A3' }), aircraft({ id: 'A1' })], conflicts: [] }, { routes });
  assert.deepEqual(rows.map((r) => r.id), ['A3', 'A1']);
});

test('the aircraft rows are plain text: a route name with markup in it stays as typed', () => {
  const [row] = aircraftRows({ t: 0, aircraft: [aircraft()], conflicts: [] }, { routes: [{ id: 'PAT1', name: '<b>&"' }] });
  assert.equal(row.routeName, '<b>&"');
  assert.equal(row.cells[2], '<b>&"');
});

// ── Conflicts ────────────────────────────────────────────────────────────────

test('a conflict line starts "⚠ CONFLICT" and a caution line "△ CAUTION", then the pair and both distances', () => {
  const lines = conflictLines({ t: 0, aircraft: [], conflicts: [
    { a: 'A2', b: 'A5', latFt: 180, vertFt: 120, level: 'conflict' },
    { a: 'A1', b: 'A7', latFt: 350.2, vertFt: 400, level: 'caution' },
  ] });
  assert.deepEqual(lines.map((l) => l.text), ['⚠ CONFLICT A2/A5: 180 ft lat, 120 ft vert', '△ CAUTION A1/A7: 350 ft lat, 400 ft vert']);
  assert.deepEqual(lines.map((l) => l.level), ['conflict', 'caution']);
  assert.deepEqual(lines.map((l) => [l.a, l.b]), [['A2', 'A5'], ['A1', 'A7']]);
});

test('conflict distances are rounded to whole feet the way V6 rounds them', () => {
  const [a, b, c] = conflictLines({ t: 0, aircraft: [], conflicts: [
    { a: 'A1', b: 'A2', latFt: 199.5, vertFt: 0.4, level: 'conflict' },
    { a: 'A1', b: 'A3', latFt: 199.49, vertFt: 0.5, level: 'conflict' },
    { a: 'A1', b: 'A4', latFt: 0, vertFt: 499.99, level: 'caution' },
  ] });
  assert.equal(a.text, '⚠ CONFLICT A1/A2: 200 ft lat, 0 ft vert');
  assert.equal(b.text, '⚠ CONFLICT A1/A3: 199 ft lat, 1 ft vert');
  assert.equal(c.text, '△ CAUTION A1/A4: 0 ft lat, 500 ft vert');
});

test('no conflicts gives no lines, and the words for the screen to show are "No conflicts."', () => {
  assert.deepEqual(conflictLines({ t: 0, aircraft: [], conflicts: [] }), []);
  assert.equal(noConflictsText, 'No conflicts.');
});

// ── Leg distances ────────────────────────────────────────────────────────────

/** A square 6,076.12 ft (1 NM) a side. */
const square = (kind) => ({ id: 'SQ', name: 'Square', kind, visible: true, color: '#fff', points: [point(0, 0), point(6076.12, 0), point(6076.12, 6076.12), point(0, 6076.12)] });

test('a pattern has a leg back to point 1: 4→1, in feet and nautical miles', () => {
  const rows = legDistanceRows(square('pattern'));
  assert.deepEqual(rows.map((r) => r.leg), ['1→2', '2→3', '3→4', '4→1']);
  assert.deepEqual(rows.map((r) => r.ftText), ['6076', '6076', '6076', '6076']);
  assert.deepEqual(rows.map((r) => r.nmText), ['1.00', '1.00', '1.00', '1.00']);
  assert.deepEqual(rows.map((r) => r.labelText), ['6076 ft', '6076 ft', '6076 ft', '6076 ft']);
});

test('an entry or split has one leg fewer, and none back to point 1', () => {
  for (const kind of ['entry', 'split']) assert.deepEqual(legDistanceRows(square(kind)).map((r) => r.leg), ['1→2', '2→3', '3→4'], kind);
});

test('a leg carries its exact length in feet and NM as numbers too', () => {
  const [first, , , last] = legDistanceRows({ ...square('pattern'), points: [point(0, 0), point(3000, 4000), point(3000, 4000 + 1519.03), point(-30, 100)] });
  assert.equal(first.from, 1);
  assert.equal(first.to, 2);
  assert.equal(first.ft, 5000);
  assert.ok(Math.abs(first.nm - 5000 / 6076.12) < 1e-12);
  assert.equal(last.from, 4);
  assert.equal(last.to, 1);
});

test('feet are rounded to whole feet and NM to two places, as V6 does', () => {
  const rows = legDistanceRows({ ...square('entry'), points: [point(0, 0), point(1519.03, 0), point(1519.03 + 2000.6, 0), point(1519.03 + 2000.6 + 4.4, 0)] });
  assert.deepEqual(rows.map((r) => r.ftText), ['1519', '2001', '4']);
  assert.deepEqual(rows.map((r) => r.nmText), ['0.25', '0.33', '0.00']);
  assert.deepEqual(rows.map((r) => r.labelText), ['1519 ft', '2001 ft', '4 ft']);
});

test('a route of no points or one point has no legs, and two points have one (a pattern of two goes there and back)', () => {
  assert.deepEqual(legDistanceRows({ ...square('pattern'), points: [] }), []);
  assert.deepEqual(legDistanceRows({ ...square('pattern'), points: [point(0, 0)] }), []);
  assert.deepEqual(legDistanceRows({ ...square('entry'), points: [point(0, 0), point(3, 4)] }).map((r) => [r.leg, r.ftText]), [['1→2', '5']]);
  assert.deepEqual(legDistanceRows({ ...square('pattern'), points: [point(0, 0), point(3, 4)] }).map((r) => [r.leg, r.ftText]), [['1→2', '5'], ['2→1', '5']]);
});

// ── Point data and turn data ─────────────────────────────────────────────────

test('point data is height, speed and G: 2500ft/120kt/2.0G, with V6\'s rounding', () => {
  assert.equal(pointDataText(point(0, 0)), '2500ft/120kt/2.0G');
  assert.equal(pointDataText(point(0, 0, { alt: 1879.5, kt: 99.5, g: 4.5 })), '1880ft/100kt/4.5G');
  assert.equal(pointDataText(point(0, 0, { alt: 2499.4, kt: 99.4, g: 0 })), '2499ft/99kt/0.0G');
  assert.equal(pointDataText(point(0, 0, { g: '3' })), '2500ft/120kt/3.0G', 'a G typed into a box is a string');
  assert.equal(pointDataText(point(0, 0, { g: 2.25 })), '2500ft/120kt/2.3G');
});

test('turn data is the turn radius and the bank: 120 kt at 2 G is 736 ft at 60°', () => {
  const options = { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 };
  assert.equal(turnDataText(point(0, 0), options), 'R 736ft / bank 60°');
  assert.equal(turnDataText(point(0, 0, { kt: 220, alt: 3500 }), options), 'R 2474ft / bank 60°');
  assert.equal(turnDataText(point(0, 0, { g: 4 }), options), 'R 329ft / bank 76°');
});

test('turn data: G is limited to 1.01 to 9, and a blank speed reads 120 kt and a blank G 2 G, as in V6', () => {
  const options = { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 };
  assert.equal(turnDataText(point(0, 0, { g: 0 }), options), turnDataText(point(0, 0, { g: 2 }), options));
  assert.equal(turnDataText(point(0, 0, { kt: 0 }), options), turnDataText(point(0, 0, { kt: 120 }), options));
  assert.equal(turnDataText(point(0, 0, { g: 1 }), options), turnDataText(point(0, 0, { g: 1.01 }), options));
  assert.equal(turnDataText(point(0, 0, { g: 12 }), options), turnDataText(point(0, 0, { g: 9 }), options));
  assert.equal(turnDataText(point(0, 0, { g: 12 }), options).endsWith('bank 84°'), true);
});

test('turn data with a radius set by hand shows that radius, and the bank the point\'s G would give', () => {
  const options = { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 2500 };
  assert.equal(turnDataText(point(0, 0), options), 'R 2500ft / bank 60°');
  assert.equal(turnDataText(point(0, 0), { ...options, manualRadiusFt: 0 }), 'R 1800ft / bank 60°', 'a blank radius is 1800 ft');
});

const pat = { id: 'P', name: 'Pattern 1', kind: 'pattern', visible: true, color: '#fff', points: [point(0, 0, { label: 'Threshold' }), point(6000, 0, { label: 'Upwind' }), point(6000, 4000, { label: '' }), point(0, 4000, { label: undefined })] };
const options = { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 };

test('each point has its title (route, number, label), its data and its turn data', () => {
  const rows = pointRows(pat, options);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.number), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((r) => r.titleText), ['Pattern 1 1 Threshold', 'Pattern 1 2 Upwind', 'Pattern 1 3 ', 'Pattern 1 4 ']);
  assert.deepEqual(rows.map((r) => r.dataText), Array(4).fill('2500ft/120kt/2.0G'));
});

test('V6 shows turn data at every point but the first of a pattern, and at every point but the first and last of an entry or split (#49)', () => {
  assert.deepEqual(pointRows(pat, options).map((r) => r.turnText), ['', 'R 736ft / bank 60°', 'R 736ft / bank 60°', 'R 736ft / bank 60°']);
  const entry = { ...pat, kind: 'entry' };
  assert.deepEqual(pointRows(entry, options).map((r) => r.turnText), ['', 'R 736ft / bank 60°', 'R 736ft / bank 60°', '']);
  const split = { ...pat, kind: 'split', points: pat.points.slice(0, 2) };
  assert.deepEqual(pointRows(split, options).map((r) => r.turnText), ['', '']);
});

test('the point rows use the route options given, and the defaults when none are', () => {
  assert.equal(pointRows(pat, { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 3000 })[1].turnText, 'R 3000ft / bank 60°');
  assert.equal(pointRows(pat)[1].turnText, 'R 736ft / bank 60°');
});

test('a route of no points has no point rows', () => {
  assert.deepEqual(pointRows({ ...pat, points: [] }, options), []);
});
