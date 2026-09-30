// Cross-check of the Traffic Sim's built-in Moose Jaw setup against the T-6 manuals
// (task 24, part 1: what the engine can fly today). It ONLY REPORTS. It measures the
// setup with the engine (createSim with a fixed seed, routePath, positionAt,
// legDistances, pointTurn) and core's flight maths, builds a table (scenario, sim
// value, manual value with its page, difference, within tolerance), and asserts the
// table equals tests/crosscheck/traffic-expected.json. So it fails only when a number
// moves: a difference from the manual is not a failure, and nothing here changes flight
// maths, route data or the engine. Differences go to Patrick and Dad.
//
// The scenarios (manual number, unit, page, tolerance, how to measure) are in
// src/modules/traffic/data/crosscheck-scenarios.json. Numbers and page references only:
// the manuals are private, so no manual text goes in the repo.
//
// When a number moves on purpose (a redrawn setup, a decided change), review the new
// table, then rewrite the expected file with:
//   UPDATE_CROSSCHECK=1 node --test tests/crosscheck/traffic-scenarios.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertTableWithinTolerance } from '../helpers/tolerances.js';
import { buildTable, derivedManualNumbers, makeMeasures, decimalsFor, round, judge } from './traffic-measure.js';

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCENARIOS = readJson('../../src/modules/traffic/data/crosscheck-scenarios.json');
const SETUP = readJson('../../src/modules/traffic/data/moose-jaw.json');
const EXPECTED_URL = new URL('./traffic-expected.json', import.meta.url);

const MODES = Object.keys(SCENARIOS.modes);
/** A page reference is short: a manual number and where it is, never a quotation. */
const LONGEST_TEXT = 420;

test('the scenarios file is complete: every scenario has an id, a page reference, a unit and a valid mode', () => {
  const ids = SCENARIOS.scenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const s of SCENARIOS.scenarios) {
    for (const key of ['id', 'group', 'title', 'checks', 'page', 'unit', 'source', 'measure']) {
      assert.equal(typeof s[key], 'string', `${s.id}: ${key} is text`);
    }
    assert.ok(s.page.length > 0, `${s.id}: has a page reference`);
    assert.ok(MODES.includes(s.mode), `${s.id}: mode ${s.mode} is one of ${MODES}`);
    assert.ok(Object.keys(SCENARIOS.sources).includes(s.source), `${s.id}: source ${s.source} is listed`);
    assert.ok(s.manual === null || typeof s.manual === 'number', `${s.id}: the manual number is a number or null`);
    assert.equal(typeof s.tolerance, 'number', `${s.id}: tolerance is a number`);
    if (s.mode === 'waits') assert.ok(Number.isInteger(s.waitsOn) && s.waitsOn >= 1, `${s.id}: names the task it waits on`);
    else assert.equal(s.waitsOn, undefined, `${s.id}: only waiting rows name a task`);
    if (s.manual === null) assert.ok(['info', 'waits'].includes(s.mode), `${s.id}: no manual number, so it can only be info or waiting`);
  }
});

test('the scenarios file holds numbers, page references and short notes only (the manuals are private)', () => {
  const strings = [];
  (function walk(value) {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  })(SCENARIOS.scenarios);
  for (const text of strings) assert.ok(text.length <= LONGEST_TEXT, `a text of ${text.length} characters: ${text.slice(0, 60)}...`);
  for (const s of SCENARIOS.scenarios) assert.doesNotMatch(s.page, /["“”]/, `${s.id}: a page reference is not a quotation`);
});

test('every measurable scenario has a measure, and every measure has a scenario', () => {
  const measures = makeMeasures(SETUP, SCENARIOS.seed);
  const measurable = SCENARIOS.scenarios.filter((s) => s.mode !== 'waits').map((s) => s.id).sort();
  assert.deepEqual(Object.keys(measures).sort(), measurable);
});

test('the manual numbers that come from core\'s maths are the ones the scenarios file states', () => {
  const byId = new Map(SCENARIOS.scenarios.map((s) => [s.id, s]));
  for (const [id, value] of Object.entries(derivedManualNumbers())) {
    const s = byId.get(id);
    assert.equal(s.manual, round(value, decimalsFor(s.unit)), `${id}: the scenarios file says ${s.manual}, core gives ${value}`);
  }
});

test('the verdict rules: within, at least, at most, info, overridden and waiting', () => {
  assert.equal(judge({ mode: 'within', tolerance: 5 }, 223, 220), 'yes');
  assert.equal(judge({ mode: 'within', tolerance: 5 }, 226, 220), 'no');
  assert.equal(judge({ mode: 'atLeast', tolerance: 0 }, 110, 110), 'yes');
  assert.equal(judge({ mode: 'atLeast', tolerance: 0 }, 109.9, 110), 'no');
  assert.equal(judge({ mode: 'atMost', tolerance: 0 }, 147, 147), 'yes');
  assert.equal(judge({ mode: 'atMost', tolerance: 0 }, 148, 147), 'no');
  assert.equal(judge({ mode: 'info', tolerance: 0 }, 60, null), 'n/a');
  assert.equal(judge({ mode: 'overridden', tolerance: 50 }, 3500, 3000), 'overridden');
  assert.equal(judge({ mode: 'waits', waitsOn: 15, tolerance: 0 }, null, 2000), 'waits on task 15');
});

/** The table for the built-in setup, worked out once and shared by the tests below (each measure flies the sim). */
const TABLE = buildTable(structuredClone(SETUP), SCENARIOS);

test('the report table is the same every time (fixed seed, fresh setup)', () => {
  assert.deepEqual(buildTable(structuredClone(SETUP), SCENARIOS), TABLE);
});

test('the report table equals the checked-in expected table: it fails only when a number moves', () => {
  if (process.env.UPDATE_CROSSCHECK === '1') {
    assert.ok(!process.env.CI, 'UPDATE_CROSSCHECK=1 rewrites the expected table: not in CI');
    writeFileSync(EXPECTED_URL, JSON.stringify(TABLE, null, 2) + '\n');
  }
  const expected = JSON.parse(readFileSync(EXPECTED_URL, 'utf8'));
  assertTableWithinTolerance(TABLE, expected);
});

test('the run leaves the setup as it found it (the cross-check changes no number)', () => {
  const before = JSON.stringify(SETUP);
  buildTable(SETUP, SCENARIOS);
  assert.equal(JSON.stringify(SETUP), before);
});
