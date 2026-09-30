// What a saved debrief carries besides the tracks (R17): DFPs, standards, time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_STANDARDS } from '../../../src/core/standards.js';
import { STANDARD_LIMITS } from '../../../src/storage/standards.js';
import { loadExampleFlight } from '../../../src/flight-data/examples.js';
import { toDebriefFile, readDebriefFile } from '../../../src/flight-data/debrief-file.js';
import { addDfp, renameDfp, setDfpNote, dfpLabel } from '../../../src/modules/debrief/dfp.js';
import {
  TIME_KEY, WEATHER_KEY, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName,
} from '../../../src/modules/debrief/debrief-session.js';
import { makeSaved, savedBox, savedToSetting, savedFromSetting, MAX_SAVED_CHARS } from '../../../src/modules/debrief/weather/saved-radar.js';

const fromRepo = async (asset) => readFileSync(new URL(`../../../original/assets/${asset}`, import.meta.url), 'utf8');

test('every standard and the time have a rule, from app.standards\' limits', () => {
  const rules = settingsRules(STANDARD_LIMITS);
  assert.deepEqual(rules[TIME_KEY], { type: 'number', min: 0, max: 1e11 });
  assert.deepEqual(rules['standards.spread.on'], { type: 'boolean' });
  assert.deepEqual(rules['standards.spread.maxFt'], { type: 'number', min: 0, max: 20000 });
  const flat = sessionSettings(DEFAULT_STANDARDS, 5);
  assert.deepEqual(Object.keys(flat).sort(), Object.keys(rules).sort()); // nothing saved goes unchecked
});

test('standards go out flat and come back as the same patch', () => {
  const edited = { ...DEFAULT_STANDARDS, spread: { ...DEFAULT_STANDARDS.spread, maxFt: 7000 }, lead: { ...DEFAULT_STANDARDS.lead, on: false } };
  const patch = standardsPatch(sessionSettings(edited, 123));
  assert.deepEqual(patch, JSON.parse(JSON.stringify(edited)));
  assert.equal(standardsPatch({ [TIME_KEY]: 1 }), null);
});

test('DFPs keep their times, custom labels and notes; automatic labels stay automatic', () => {
  let list = addDfp([], { t: 300, x: 1, y: 2 }).list;
  list = addDfp(list, { t: 100 }).list;
  list = renameDfp(list, 1, 'Rejoin');
  list = setDfpNote(list, 2, 'Late on the turn\nsecond line');
  const saved = dfpsForFile(list);
  assert.deepEqual(saved, [{ t: 100, label: '', note: 'Late on the turn\nsecond line' }, { t: 300, label: 'Rejoin', note: '' }]);
  const back = dfpsFromFile(saved, (t) => ({ x: t, y: -t }));
  assert.deepEqual(back.map((d) => [dfpLabel(back, d), d.t, d.x, d.y, d.note]), [
    ['DFP 1', 100, 100, -100, 'Late on the turn\nsecond line'],
    ['Rejoin', 300, 300, -300, ''],
  ]);
  assert.deepEqual(dfpsFromFile(saved, () => null).map((d) => [d.x, d.y]), [[null, null], [null, null]]);
});

test('a whole debrief round-trips through flight-data\'s file: tracks, DFPs, standards, time (R17)', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const edited = { ...DEFAULT_STANDARDS, offset: { ...DEFAULT_STANDARDS.offset, aftTargetFt: 7500 } };
  const dfps = addDfp([], { t: flight.startT + 60 }).list;
  const text = toDebriefFile(flight, dfpsForFile(dfps), sessionSettings(edited, flight.startT + 90));
  const opened = readDebriefFile(text, { settings: settingsRules(STANDARD_LIMITS) });
  assert.deepEqual(opened.files.map((f) => f.name), flight.files.map((f) => f.name));
  assert.deepEqual(opened.dfps, [{ t: flight.startT + 60, label: '', note: '' }]);
  assert.equal(opened.settings[TIME_KEY], flight.startT + 90);
  assert.deepEqual(standardsPatch(opened.settings), JSON.parse(JSON.stringify(edited)));
});

test('a file\'s bad standard is dropped, not used, and so are V6-shaped fields from an older file', () => {
  const settings = {
    'standards.spread.maxFt': 1e9, 'standards.spread.on': 'yes', 'standards.lead.lowTargetKt': 190, 'other.thing': 1,
    'standards.spread.foreAftTolFt': 250, 'standards.lead.targetKt': 200,
  };
  const text = JSON.stringify({ format: 'dads-debrief', version: 1, tracks: [{ slot: 1, name: 'a', kml: '' }], dfps: [], settings });
  const opened = readDebriefFile(text, { settings: settingsRules(STANDARD_LIMITS) });
  assert.deepEqual(standardsPatch(opened.settings), { lead: { lowTargetKt: 190 } });
});

test('the saved file is named for the flight\'s start, in Zulu', () => {
  assert.equal(debriefFileName(Date.UTC(2026, 5, 2, 18, 17, 42) / 1000), 'debrief-2026-06-02-1817Z.dadsdebrief.json');
});

// --- Saved radar and lightning (12f): one string under the file's settings ------

const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const savedFor = (flight) => makeSaved({
  box: savedBox({ minLat: 50, maxLat: 50.5, minLon: -106, maxLon: -105.5 }),
  fetchedT: flight.endT + 600,
  frames: [
    { layer: 'rain', t: Math.floor(flight.startT / 360) * 360, mime: 'image/png', data: PNG64 },
    { layer: 'lightning', t: Math.floor(flight.endT / 600) * 600, mime: 'image/png', data: PNG64 },
  ],
});

test('the saved weather has its own setting key, a string rule as long as the block may be, and only when the debrief has some', () => {
  assert.equal(WEATHER_KEY, 'savedWeather');
  assert.equal(settingsRules(STANDARD_LIMITS)[WEATHER_KEY], undefined, 'not unless asked (the keys still match what is saved)');
  assert.deepEqual(settingsRules(STANDARD_LIMITS, { weather: true })[WEATHER_KEY], { type: 'string', max: MAX_SAVED_CHARS });
  assert.equal(Object.hasOwn(sessionSettings(DEFAULT_STANDARDS, 5), WEATHER_KEY), false);
  assert.equal(Object.hasOwn(sessionSettings(DEFAULT_STANDARDS, 5, ''), WEATHER_KEY), false);
  assert.equal(sessionSettings(DEFAULT_STANDARDS, 5, 'text')[WEATHER_KEY], 'text');
  const withWeather = sessionSettings(DEFAULT_STANDARDS, 5, 'text');
  assert.deepEqual(Object.keys(withWeather).sort(), Object.keys(settingsRules(STANDARD_LIMITS, { weather: true })).sort());
  assert.equal(Object.hasOwn(standardsPatch(withWeather), WEATHER_KEY), false, 'the block is not a standard');
});

test('saved radar and lightning go through flight-data\'s file untouched and come back the same (12f)', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const saved = savedFor(flight);
  const text = toDebriefFile(flight, [], sessionSettings(DEFAULT_STANDARDS, flight.startT + 90, savedToSetting(saved)));
  const opened = readDebriefFile(text, { settings: settingsRules(STANDARD_LIMITS, { weather: true }) });
  assert.equal(opened.settings[TIME_KEY], flight.startT + 90, 'the rest of the settings are as before');
  const back = savedFromSetting(opened.settings[WEATHER_KEY], { startT: flight.startT, endT: flight.endT });
  assert.equal(back.problem, undefined);
  assert.deepEqual(back.saved, saved);
});

test('a debrief saved without weather opens without any, and an older tool opening one with it ignores it', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const plain = toDebriefFile(flight, [], sessionSettings(DEFAULT_STANDARDS, 5));
  const opened = readDebriefFile(plain, { settings: settingsRules(STANDARD_LIMITS, { weather: true }) });
  assert.deepEqual(savedFromSetting(opened.settings[WEATHER_KEY], { startT: flight.startT, endT: flight.endT }), { saved: null });
  const withWeather = toDebriefFile(flight, [], sessionSettings(DEFAULT_STANDARDS, 5, savedToSetting(savedFor(flight))));
  const oldTool = readDebriefFile(withWeather, { settings: settingsRules(STANDARD_LIMITS) });
  assert.equal(Object.hasOwn(oldTool.settings, WEATHER_KEY), false, 'a reader that doesn\'t list it drops it');
});

test('a weather block over its rule is dropped by the file reader, and a hostile one is refused by the debrief\'s own checks', async () => {
  const flight = await loadExampleFlight(fromRepo);
  const tooLong = toDebriefFile(flight, [], { ...sessionSettings(DEFAULT_STANDARDS, 5), [WEATHER_KEY]: 'x'.repeat(2000) });
  const rules = settingsRules(STANDARD_LIMITS, { weather: true });
  rules[WEATHER_KEY] = { ...rules[WEATHER_KEY], max: 1000 };
  assert.equal(Object.hasOwn(readDebriefFile(tooLong, { settings: rules }).settings, WEATHER_KEY), false);
  const hostile = JSON.stringify({ v: 1, box: { minLat: 50, maxLat: 51, minLon: -106, maxLon: -105 }, fetchedT: 1, frames: [{ layer: 'rain', t: flight.startT, mime: 'image/svg+xml', data: 'PHN2Zy8+' }] });
  const text = toDebriefFile(flight, [], { ...sessionSettings(DEFAULT_STANDARDS, 5), [WEATHER_KEY]: hostile });
  const opened = readDebriefFile(text, { settings: settingsRules(STANDARD_LIMITS, { weather: true }) });
  const got = savedFromSetting(opened.settings[WEATHER_KEY], { startT: flight.startT, endT: flight.endT });
  assert.match(got.problem, /couldn't be read/);
});
