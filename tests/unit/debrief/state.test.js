// Checks: the debrief's plain values: ship colours, first-visit layout, status text, track runs broken at 5 s gaps,
//   file picking and swapping, ship markers.
// Serves: DB-R1, DB-R2, DB-R21, DB-R24, DB-R4.
// Expected values: typed-in values; ship colours are Patrick's ruling (#29, DB-R24); the example flight names come
//   from its recorded files; the 5 s gap is the debrief's GPS-gap rule (design choice).

// The debrief's plain-value pieces (SPEC-debrief: The screen, Loading and status).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { buildFlight } from '../../../src/flight-data/flight.js';
import {
  SHIP_COLORS, OUTLINED_SHIPS, LAYOUT_DEFAULTS, flightSummary, trackStatus, flightBounds, trackRuns,
  assignShips, setShip, checkPicked, shipsAt, shipName,
} from '../../../src/modules/debrief/state.js';

const fromRepo = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');
const example = loadExampleFlight(fromRepo);

// A made-up flight with the shape loadFlight returns.
const fix = (t, xFt, yFt) => ({ t, xFt, yFt });
const fake = {
  tracks: {
    2: { slot: 2, name: '', fixes: [fix(10, 0, 0), fix(40, 5, 5)], dropped: { altitude: 0, position: 0, jump: 0 }, gaps: [] },
    1: {
      slot: 1, name: 'Lead', fixes: [fix(0, -100, 20), fix(1, 0, 0), fix(95, 300, -40)],
      dropped: { altitude: 2, position: 1, jump: 1 }, gaps: [{ fromT: 1, toT: 95 }],
    },
  },
  cutTracks: [{ slot: 1, beforeS: 10, afterS: 55 }],
};

test('ships are told apart by colour: #1 blue, #2 green, #3 red, #4 white with a dark outline (DB-R24)', () => {
  // DB-R24 (ratified 4 Oct 2026): #1 blue, #2 green, #3 red, #4 white with a dark outline (Patrick's #29 ruling).
  assert.deepEqual({ ...SHIP_COLORS }, { 1: '#0066ff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
  assert.deepEqual([...OUTLINED_SHIPS], [4]);
});

test('first visit: every menu and panel is closed and only the default layers are on (DB-R21)', () => {
  const start = LAYOUT_DEFAULTS;
  assert.ok(Object.isFrozen(start));
  // The essentials are showing: the map in 2D, the flight column and the one small Formation card.
  assert.equal(start.view, '2d');
  assert.equal(start.flightColumn, true);
  assert.equal(start.formationColumn, true);
  // Every menu and panel starts closed: the status details, per-ship detail, standards, files and Tools.
  for (const key of ['statusDetails', 'moreDetail', 'standardsOpen', 'filesOpen', 'tennisOpen']) assert.equal(start[key], false, key);
  assert.deepEqual(Object.keys(start).filter((k) => /Open$/.test(k) && start[k] !== false), [], 'no panel starts open');
  // The 2D layers: only the four default ones are on (DB-R21: full tracks, spacing lines, grid and Lead's 3/9 line).
  assert.equal(start.trail, 'full');
  const on = ['grid', 'spacingLines', 'lead39'];
  const layers = ['satellite', 'grid', 'spacingLines', 'lead39', 'three39', 'cone', 'clockMarks', 'bubble', 'followLead'];
  for (const key of layers) assert.equal(start[key], on.includes(key), key);
  assert.equal(start.route, '', 'no route overlay');
  assert.equal(start.vnc, 'off', 'no VNC chart');
  // Weather starts off (DB-R18): every weather switch is false.
  const weather = Object.keys(start).filter((k) => /^wx/.test(k) && typeof start[k] === 'boolean');
  assert.ok(weather.length >= 5);
  for (const key of weather) assert.equal(start[key], false, key);
});

test('the dropped EM chart keeps no settings (DB-R20)', { todo: "Debrief plan step 2 (remove the EM chart code): not done yet. Remove this mark when it is done (Patrick's card, 4 Oct)" }, () => {
  assert.deepEqual(Object.keys(LAYOUT_DEFAULTS).filter((k) => /^em[A-Z]/.test(k)), [], 'no EM chart keys');
});

test('the one-line status counts tracks, gaps and trimmed tracks from what loaded (#23)', () => {
  assert.equal(flightSummary(null), 'No flight loaded');
  assert.equal(flightSummary(fake), '2 tracks loaded, 1 gap, 1 track trimmed to the shared time');
  assert.equal(flightSummary({ tracks: { 1: fake.tracks[2] }, cutTracks: [] }), '1 track loaded');
});

test('the full status says, per ship in order, what was kept, dropped, missing and cut (R11)', () => {
  assert.deepEqual(trackStatus(null), []);
  assert.deepEqual(trackStatus(fake), [
    {
      slot: 1,
      name: 'Lead',
      lines: [
        '3 positions over 1 min 35 s',
        'Left out: 2 with an impossible altitude, 1 off the globe, 1 GPS jump',
        '1 GPS gap, longest 1 min 34 s',
        '1 min 5 s outside the shared time isn\'t played',
      ],
    },
    { slot: 2, name: 'Track #2', lines: ['2 positions over 30 s'] },
  ]);
});

test('the example flight: four tracks, named, with a status for each', async () => {
  const flight = await example;
  assert.match(flightSummary(flight), /^4 tracks loaded/);
  const status = trackStatus(flight);
  assert.deepEqual(status.map((s) => s.name), ['#1 Lead - ED2F5', '#2 - 60DF66', '#3 - 8738A6C9', '#4 - 083AC']);
  for (const s of status) assert.match(s.lines[0], /^\d+ positions over \d+ min( \d+ s)?$/);
});

test('the flight\'s box covers every position of every track', async () => {
  assert.equal(flightBounds(null), null);
  assert.deepEqual(flightBounds(fake), { minX: -100, minY: -40, maxX: 300, maxY: 20 });
  const flight = await example;
  const box = flightBounds(flight);
  for (const tr of Object.values(flight.tracks)) {
    for (const p of tr.fixes) assert.ok(p.xFt >= box.minX && p.xFt <= box.maxX && p.yFt >= box.minY && p.yFt <= box.maxY);
  }
});

test('a track is drawn as runs broken where fixes are more than 5 s apart (D32)', () => {
  assert.deepEqual(trackRuns([]), []);
  const runs = trackRuns([fix(0), fix(1), fix(6), fix(12), fix(13), fix(18.5)]);
  assert.deepEqual(runs.map((r) => r.map((p) => p.t)), [[0, 1, 6], [12, 13], [18.5]]);
});

test('picked files take ships #1 upward in order; more than four are refused', () => {
  assert.deepEqual(assignShips(['a', 'b']), [{ name: 'a', slot: 1 }, { name: 'b', slot: 2 }]);
  assert.equal(assignShips(['a', 'b', 'c', 'd', 'e']), null);
});

test('choosing a ship for one file swaps it with the file that had it, so each ship is used once', () => {
  const three = assignShips(['a', 'b', 'c']);
  assert.deepEqual(setShip(three, 0, 3).map((a) => a.slot), [3, 2, 1]);
  assert.deepEqual(setShip(three, 1, 4).map((a) => a.slot), [1, 4, 3]);
  assert.deepEqual(setShip(three, 2, 3), three);
});

test('picked files are checked before reading: one to four, none too big', () => {
  const small = (name) => ({ name, size: 1000 });
  assert.equal(checkPicked([small('a')]), null);
  assert.equal(checkPicked([]), 'No files were chosen.');
  assert.match(checkPicked(['a', 'b', 'c', 'd', 'e'].map(small)), /^Choose up to 4 track files at once \(5 were chosen\)\. Nothing was loaded\.$/);
  assert.match(checkPicked([small('a'), { name: 'huge.kml', size: 31 * 1024 * 1024 }]), /^"huge\.kml" is larger than 30 MB/);
});

test('ship markers sit where each track is at that time, flagged inside a GPS gap', () => {
  const ll = (t, lat, lon) => ({ t, lat, lon, altM: 1000 });
  const flight = buildFlight({
    1: { name: 'a', fixes: [ll(0, 50, -105), ll(4, 50, -105.01), ll(8, 50, -105.02)] },
    2: { name: 'b', fixes: [ll(0, 50.01, -105), ll(8, 50.01, -105.02)] },
  });
  assert.deepEqual(shipsAt(null, 0), []);
  const at2 = shipsAt(flight, 2);
  assert.deepEqual(at2.map((s) => [s.slot, s.inGap]), [[1, false], [2, true]]);
  const mid = (a, b) => (a + b) / 2;
  const f1 = flight.tracks[1].fixes;
  assert.ok(Math.abs(at2[0].xFt - mid(f1[0].xFt, f1[1].xFt)) < 1e-9);
  assert.ok(at2[1].yFt > at2[0].yFt); // #2 is the northern one
  assert.ok(Math.abs(Math.abs(at2[0].hdg) - Math.PI) < 0.01); // flying west, for the 3/9 line and silhouette
});

test('a name that starts with its own ship number isn\'t shown with the number twice', () => {
  assert.equal(shipName(1, '#1 Lead - ED2F5'), 'Lead - ED2F5');
  assert.equal(shipName(2, '#2 - 60DF66'), '60DF66');
  assert.equal(shipName(1, '#12 odd.kml'), '#12 odd.kml');
  assert.equal(shipName(3, '#2 - 60DF66'), '#2 - 60DF66');
  assert.equal(shipName(1, 'lead.kml'), 'lead.kml');
  assert.equal(shipName(4, ''), '');
});
