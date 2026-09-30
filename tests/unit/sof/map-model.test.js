// Tests for src/modules/sof/map-model.js: the airfield dots, wind barbs, credits and status strip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { buildScreen } from '../../../src/modules/sof/screen-model.js';
import { windBarb, windWords, airfieldMarks, mapCredits, baseNote, statusItems } from '../../../src/modules/sof/map-model.js';
import { defaultLayers, setBase } from '../../../src/modules/sof/map-layers.js';

const NOW = new Date('2026-09-29T18:42:00Z');

test('wind barbs: 5 kt steps, a half barb for 5, a full barb for 10, a pennant for 50, calm under 3', () => {
  assert.deepEqual(windBarb(0), { calm: true, pennants: 0, full: 0, half: 0, rounded: 0 });
  assert.equal(windBarb(2).calm, true);
  assert.deepEqual(windBarb(5), { calm: false, pennants: 0, full: 0, half: 1, rounded: 5 });
  assert.deepEqual(windBarb(3), { calm: false, pennants: 0, full: 0, half: 1, rounded: 5 });
  assert.deepEqual(windBarb(10), { calm: false, pennants: 0, full: 1, half: 0, rounded: 10 });
  assert.deepEqual(windBarb(18), { calm: false, pennants: 0, full: 2, half: 0, rounded: 20 });
  assert.deepEqual(windBarb(23), { calm: false, pennants: 0, full: 2, half: 1, rounded: 25 });
  assert.deepEqual(windBarb(50), { calm: false, pennants: 1, full: 0, half: 0, rounded: 50 });
  assert.deepEqual(windBarb(65), { calm: false, pennants: 1, full: 1, half: 1, rounded: 65 });
  assert.deepEqual(windBarb(120), { calm: false, pennants: 2, full: 2, half: 0, rounded: 120 });
});

test('wind barbs: no speed, a negative or a non-number is no barb', () => {
  for (const bad of [null, undefined, NaN, -5, '10', Infinity]) assert.equal(windBarb(bad), null);
});

test('wind in words: direction, speed and gust; variable; calm; nothing when there is no number', () => {
  assert.equal(windWords({ dirDeg: 250, speedKt: 18, gustKt: 25 }), '250° 18 kt gusting 25');
  assert.equal(windWords({ dirDeg: 70, speedKt: 8, gustKt: null }), '070° 8 kt');
  assert.equal(windWords({ dirDeg: null, variable: true, speedKt: 5 }), 'variable 5 kt');
  assert.equal(windWords({ dirDeg: 0, speedKt: 0 }), 'calm');
  assert.equal(windWords({ dirDeg: 250, speedKt: null }), null);
  assert.equal(windWords(null), null);
});

// A screen built from real cards, as the page does it.
function screenFor(metars) {
  const airfields = createAirfields({ store: createStore(null).scope('airfields') });
  const metar = Object.fromEntries(Object.entries(metars).map(([icao, raw]) => [icao, { raw, report: parseMetar(raw, { now: NOW }), source: 'metno' }]));
  const snapshot = { metar, taf: {}, newestAt: NOW, lastRound: null, busy: false, stopped: false };
  const screen = buildScreen({ airfields, snapshot, limits: { ceilingFt: 2000, visSm: 3 }, now: NOW });
  return { screen, snapshot, fields: [airfields.home(), ...airfields.alternates()] };
}
const METARS = {
  CYMJ: 'CYMJ 291800Z 25018G25KT 15SM BKN025 18/02 A2952 RMK SC6 SLP003',
  CYQR: 'CYQR 291800Z 09006KT 2SM BR OVC004 12/11 A2990',
  CYYN: 'CYYN 291600Z 36005KT 15SM CLR 15/03 A2960',
};

test('a dot for home and each alternate with a position, home first, each labelled with its category in words', () => {
  const { screen, snapshot, fields } = screenFor(METARS);
  const marks = airfieldMarks({ cards: screen.cards, fields, snapshot });
  assert.deepEqual(marks.map((m) => m.icao), ['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
  assert.equal(marks[0].home, true);
  assert.equal(marks[0].label, 'CYMJ MVFR');
  assert.equal(marks[1].label, 'CYQR LIFR');
  assert.ok(marks.every((m) => typeof m.lat === 'number' && typeof m.lon === 'number'));
});

test('a fresh METAR gives a wind barb; a stale one is drawn old, without the wind', () => {
  const { screen, snapshot, fields } = screenFor(METARS);
  const [home, regina, swift, saskatoon] = airfieldMarks({ cards: screen.cards, fields, snapshot });
  assert.deepEqual(home.wind, { dirDeg: 250, variable: false, speedKt: 18, gustKt: 25 });
  assert.equal(home.old, false);
  assert.equal(swift.old, true, 'a 1600Z report at 1842Z is old');
  assert.equal(swift.wind, null);
  assert.equal(swift.label, 'CYYN VFR, old');
  assert.match(swift.facts, /report is old/);
  assert.doesNotMatch(swift.facts, /Wind/);
  assert.equal(regina.wind.speedKt, 6);
  assert.equal(saskatoon.category, null);
  assert.equal(saskatoon.label, 'CYXE no METAR');
  assert.equal(saskatoon.wind, null);
  assert.match(saskatoon.facts, /No current METAR/);
});

test('the facts for a dot read as sentences: name, role, category and wind', () => {
  const { screen, snapshot, fields } = screenFor(METARS);
  const [home] = airfieldMarks({ cards: screen.cards, fields, snapshot });
  assert.equal(home.facts, 'CYMJ Moose Jaw, home. Flight category MVFR. Wind 250° 18 kt gusting 25.');
});

test('a card with no position on the airfield list is left out rather than placed at 0, 0', () => {
  const cards = [{ icao: 'CYMJ', role: 'HOME', category: 'VFR', metar: { state: 'fresh' } }, { icao: 'CZZZ', role: 'ALT', category: null, metar: { state: 'missing' } }];
  const fields = [{ icao: 'CYMJ', name: 'Moose Jaw', lat: 50.33, lon: -105.56 }, { icao: 'CZZZ', name: 'Custom', lat: null, lon: null }];
  assert.deepEqual(airfieldMarks({ cards, fields }).map((m) => m.icao), ['CYMJ']);
  assert.deepEqual(airfieldMarks(), []);
});

test('the credits name the base map in use, ECCC, and what else is showing', () => {
  const sat = mapCredits(defaultLayers());
  assert.match(sat, /Esri/);
  assert.match(sat, /ECCC/);
  assert.doesNotMatch(sat, /VNC|RainViewer|adsb\.lol/);
  const vnc = mapCredits(setBase(defaultLayers(), 'vnc'), { radarBackup: true, trafficOn: true });
  assert.match(vnc, /VNC charts © NAV CANADA \(not for navigation\)/);
  assert.match(vnc, /RainViewer/);
  assert.match(vnc, /adsb\.lol \(ODbL\)/);
  assert.match(mapCredits(setBase(defaultLayers(), 'vnc-satellite')), /not for navigation/);
});

test('the VNC base says the satellite shows outside the charts; the satellite base says nothing', () => {
  assert.match(baseNote(setBase(defaultLayers(), 'vnc')), /Outside them the satellite picture shows/);
  assert.match(baseNote(setBase(defaultLayers(), 'vnc-satellite')), /Moose Jaw, Regina, Saskatoon and Swift Current/);
  assert.equal(baseNote(defaultLayers()), null);
});

test('the status strip lists only what is on, in a fixed order, and leaves out what has no line', () => {
  const lines = {
    radar: { text: 'Radar 1840Z (2 min ago)', symbol: '✓', tone: 'ok' },
    lightning: { text: 'Lightning STALE 1800Z (42 min ago)', symbol: '⚠', tone: 'bad' },
    traffic: { text: 'Traffic: 40 aircraft, 3 s ago' },
    cloud: { text: 'Cloud loading…', symbol: '⟳', tone: 'busy' },
  };
  const on = { radar: true, lightning: true, traffic: true, cloud: false, coverage: true };
  assert.deepEqual(statusItems(lines, on).map((i) => i.id), ['radar', 'lightning', 'traffic']);
  assert.equal(statusItems(lines, on)[2].symbol, '');
  assert.equal(statusItems(lines, on)[1].tone, 'bad');
});
