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

test('ship colours are V6\'s, except #4, which is white with an outline (#29)', () => {
  assert.deepEqual({ ...SHIP_COLORS }, { 1: '#0066ff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
  assert.deepEqual([...OUTLINED_SHIPS], [4]);
});

test('the layout starts with extra detail closed, both columns open and the grid on (R22)', () => {
  assert.deepEqual({ ...LAYOUT_DEFAULTS }, { statusDetails: false, flightColumn: true, formationColumn: true, moreDetail: false, standardsOpen: false, filesOpen: false, satellite: false, grid: true, trail: 'full', spacingLines: true, lead39: true, three39: false, cone: false, clockMarks: false, bubble: false, bubbleFt: 500, followLead: false, route: '', routeOpacity: 80, view: '2d', cam3d: 'followLead', yaw3d: -35, pitch3d: 52, zoom3d: 70, altScale3d: 2, model3d: 't6', planeSize3d: 260, attLabels3d: true, trailSec3d: 90, landscape3d: true, groundRef3d: true, datum3d: 'min', grid3d: true, sticks3d: true, altMarks3d: true });
  assert.ok(Object.isFrozen(LAYOUT_DEFAULTS));
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
