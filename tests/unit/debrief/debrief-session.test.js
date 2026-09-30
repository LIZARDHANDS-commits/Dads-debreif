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
  TIME_KEY, settingsRules, sessionSettings, standardsPatch, dfpsForFile, dfpsFromFile, debriefFileName,
} from '../../../src/modules/debrief/debrief-session.js';

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
