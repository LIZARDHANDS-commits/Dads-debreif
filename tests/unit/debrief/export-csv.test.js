// Checks: the CSV export: one row per second, ships side by side, same numbers as the readouts, GPS gaps flagged,
//   safe cells, CRLF lines, blank where unknown.
// Serves: DB-R17, DB-R4, DB-R8 (the est. IAS wind test).
// Expected values: tracks built in the test flying east at about 200 kt (102.9 m/s); 2,500 m = 8,202 ft; CSV compared
//   with readoutsAt (same code, a wiring check); the wind change is worked out from standard aerodynamics (ISA
//   density at 8,202 ft), margin 18 to 24 kt.

// The CSV export (SPEC-debrief: CSV export, #28): one row per second, ships
// side by side, the same numbers the readouts show, sources and gap flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlight } from '../../../src/flight-data/flight.js';
import { readoutsAt, shipDetailText } from '../../../src/modules/debrief/readouts.js';
import { csvRows, toCsv, csvCell, csvFileName } from '../../../src/modules/debrief/export-csv.js';

const M_PER_DEG = 111_320;
const cos50 = Math.cos((50 * Math.PI) / 180);
const T0 = Date.UTC(2026, 8, 30, 14, 32, 0) / 1000;
// A ship flying due east at about 200 kt, one fix a second, from `from` to `to` s, skipping `skip`.
function east({ northM = 0, from = 0, to = 60, skip = [] } = {}) {
  const fixes = [];
  for (let s = from; s <= to; s++) {
    if (skip.includes(s)) continue;
    fixes.push({ t: T0 + s, lat: 50 + northM / M_PER_DEG, lon: -105 + (102.9 * s) / (M_PER_DEG * cos50), altM: 2500 });
  }
  return fixes;
}

test('one row per second across the shared window, ships side by side', () => {
  const flight = buildFlight({
    1: { name: 'lead', fixes: east({ from: 0, to: 60 }) },
    2: { name: 'two', fixes: east({ northM: 300, from: 5, to: 50 }) },
  });
  const rows = csvRows(flight);
  const [header, ...data] = rows;
  assert.equal(data.length, 46); // 5 s to 50 s, both ends included
  assert.equal(header[0], 'time (Zulu)');
  assert.equal(header.length, 1 + 2 * 13);
  assert.equal(header[1], '#1 lat');
  assert.equal(header[14], '#2 lat');
  assert.ok(header.includes('#2 GPS gap') && header.includes('#1 G source') && header.includes('#1 bank deg (right +)'));
  assert.equal(data[0][0], '2026-09-30T14:32:05Z');
  assert.equal(data.at(-1)[0], '2026-09-30T14:32:50Z');
  for (const row of data) assert.equal(row.length, header.length);
  // Every second is there, in order.
  data.forEach((row, i) => assert.equal(Date.parse(row[0]) / 1000, T0 + 5 + i));
});

test('the numbers are the readouts\' numbers at that second', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: east() }, 2: { name: 'two', fixes: east({ northM: 300 }) } });
  const [header, ...data] = csvRows(flight);
  const col = (name) => header.indexOf(name);
  const t = T0 + 20;
  const row = data.find((r) => r[0] === '2026-09-30T14:32:20Z');
  const ship = readoutsAt(flight, t).ships.find((s) => s.slot === 2);
  assert.equal(row[col('#2 alt ft')], ship.altFt.toFixed(0));
  assert.equal(row[col('#2 GS kt')], ship.gsKt.toFixed(1));
  assert.equal(row[col('#2 est. IAS kt')], ship.iasKt.toFixed(1));
  assert.equal(row[col('#2 lat')], ship.lat.toFixed(6));
  assert.equal(row[col('#2 heading deg')], '90.0'); // due east
  assert.equal(row[col('#2 pitch source')], 'estimated');
  assert.equal(row[col('#2 GPS gap')], 'no');
  assert.ok(Math.abs(Number(row[col('#2 alt ft')]) - 8202) <= 1); // 2,500 m
});

test('a GPS gap is flagged on the seconds inside it', () => {
  const flight = buildFlight({
    1: { name: 'lead', fixes: east() },
    2: { name: 'two', fixes: east({ northM: 300, skip: [21, 22, 23, 24, 25, 26, 27, 28, 29] }) },
  });
  const [header, ...data] = csvRows(flight);
  const gap = header.indexOf('#2 GPS gap');
  const flagged = data.filter((r) => r[gap] === 'yes').map((r) => r[0].slice(17, 19));
  assert.deepEqual(flagged, ['21', '22', '23', '24', '25', '26', '27', '28', '29']);
  assert.ok(data.every((r) => r[header.indexOf('#1 GPS gap')] === 'no'));
});

test('no flight, no rows', () => {
  assert.deepEqual(csvRows(null), []);
});

test('cells: quoted when needed, and never run as a spreadsheet formula', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('+cmd'), "'+cmd");
  assert.equal(csvCell('-12.5'), '-12.5'); // a number stays a number
  assert.equal(csvCell(''), '');
});

test('the file: CRLF lines, and a name from the flight\'s start', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: east({ to: 3 }) } });
  const text = toCsv(flight);
  const lines = text.split('\r\n');
  assert.equal(lines.at(-1), '');
  assert.equal(lines.length, 1 + 4 + 1);
  assert.ok(!/-0\.0\b/.test(text));
  assert.equal(csvFileName(T0 + 5.4), 'debrief-2026-09-30-1432Z.csv');
});

// Verification re-check N2: an unknown bank is a blank cell, not 0.0.
test('the bank cell is blank where the bank is unknown, and a number where it is known', () => {
  const flight = buildFlight({ 1: { name: 'lead', fixes: east({ from: 0, to: 60, skip: [31, 32, 33, 34, 35, 36, 37] }) } });
  const [header, ...data] = csvRows(flight);
  const col = header.indexOf('#1 bank deg (right +)');
  const at = (s) => data.find((row) => Date.parse(row[0]) / 1000 === T0 + s)[col];
  assert.equal(readoutsAt(flight, T0 + 29).ships[0].bankDeg, null); // its ±1.5 s window touches the gap after 30 s
  assert.equal(at(29), '');
  assert.equal(at(10), '0.0');
});

// DB-R8 (D3): every ship's est. IAS uses the same wind when Winds aloft is on, and says "(no wind)" when it is off.
// The wind reaches the file through `leadWindAt`, the one wind option the CSV has today.
test('every ship\'s est. IAS uses the same wind when Winds aloft is on, and reads "(no wind)" when off', { todo: "Debrief plan step 2: not built yet. Remove this mark when it is built (Patrick's card, 4 Oct)" }, () => {
  // Two ships on the same path at the same moment: same heading, speed and altitude, 300 m apart.
  const flight = buildFlight({ 1: { name: 'lead', fixes: east() }, 2: { name: 'two', fixes: east({ northM: 300 }) } });
  const asked = [];
  const headwind = (t, altFt) => { asked.push([t, Math.round(altFt)]); return { dirDeg: 90, kt: 24 }; }; // from the east; both ships fly east
  const plain = csvRows(flight);
  const windy = csvRows(flight, { leadWindAt: headwind });
  const col = (name) => plain[0].indexOf(name);
  const at = (rows, s) => rows.find((r) => Date.parse(r[0]) / 1000 === T0 + s);
  const change = (slotCol, s) => Number(at(windy, s)[col(slotCol)]) - Number(at(plain, s)[col(slotCol)]);
  // Standard aerodynamics: a 24 kt headwind adds 24 kt of true airspeed, and est. IAS is TAS x sqrt(density ratio).
  // ISA at 8,202 ft: sigma = (1 - 6.8756e-6 x 8202)^4.2559 = 0.781, sqrt = 0.884, so about +21 kt (generous: 18 to 24).
  for (const slotCol of ['#1 est. IAS kt', '#2 est. IAS kt']) {
    assert.ok(change(slotCol, 20) > 18 && change(slotCol, 20) < 24, `${slotCol}: ${change(slotCol, 20)}`);
  }
  // The same path at the same time reads the same est. IAS for both ships.
  assert.equal(at(windy, 20)[col('#2 est. IAS kt')], at(windy, 20)[col('#1 est. IAS kt')]);
  assert.ok(asked.length > 0 && asked.every(([, alt]) => Math.abs(alt - 8202) <= 1)); // asked with the ships' altitude (2,500 m), each second
  // Winds aloft off (no provider, or none for this moment): the plain column, and each ship's line says "(no wind)".
  assert.deepEqual(csvRows(flight, { leadWindAt: () => null }), plain);
  for (const ship of readoutsAt(flight, T0 + 20).ships) {
    assert.ok(shipDetailText(ship)[0].endsWith('(no wind)'), shipDetailText(ship)[0]);
  }
});
