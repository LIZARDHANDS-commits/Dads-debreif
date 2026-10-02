// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Profiles (specs/SPEC-traffic.md: Profiles and notes, Security; task 7, bug #48). A profile read back
// from this browser's storage is untrusted: these tests hold it to the spec's checks and to plain-words
// refusals, and hold the built-in setups to being valid profiles themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN, MOST_AIRCRAFT, MOST_POINTS, MOST_ROUTES, MOST_SAVED, NAME_MAX, NOTES_MAX, PROFILE_SETTING_KEYS, PROFILE_VERSION,
  captureProfile, checkProfile, cleanName, isBuiltInName, newSetupAt, nextProfileName, profileSettingDefaults, readProfiles, settingsFromSetup, startingProfile,
} from '../../../src/modules/traffic/profile.js';
import { DEFAULTS, LIMITS } from '../../../src/modules/traffic/defaults.js';

const data = (file) => JSON.parse(readFileSync(new URL(`../../../src/modules/traffic/data/${file}`, import.meta.url), 'utf8'));
const MOOSE_JAW = data('moose-jaw.json');
const V6 = data('moose-jaw-v6.json');
const clone = (v) => structuredClone(v);

/** A small good profile to break one thing at a time. */
function good() {
  return clone(BUILT_IN[0].profile);
}
const refused = (raw, words) => {
  const result = checkProfile(raw);
  assert.equal(result.ok, false, `should be refused: ${words}`);
  assert.match(result.problem, words);
  assert.match(result.problem, /^[a-z"0-9]/i);
  return result.problem;
};

// ── The built-in setups ──────────────────────────────────────────────────────

test('the built-in setups are Moose Jaw (built-in) first, then Moose Jaw (V6 original), and both are valid profiles', () => {
  assert.deepEqual(BUILT_IN.map((b) => b.name), ['Moose Jaw (built-in)', 'Moose Jaw (V6 original)']);
  assert.deepEqual(BUILT_IN.map((b) => b.id), ['moose-jaw', 'moose-jaw-v6']);
  for (const b of BUILT_IN) {
    const result = checkProfile(b.profile);
    assert.ok(result.ok, result.problem);
    assert.equal(b.profile.name, b.name);
    assert.equal(b.profile.airfield, 'CYMJ');
    assert.ok(Object.isFrozen(b));
    assert.ok(Object.isFrozen(b.profile));
  }
});

test('each built-in profile has its data file\'s routes, aircraft and anchor exactly, and V6\'s own settings', () => {
  for (const [entry, file] of [[BUILT_IN[0], MOOSE_JAW], [BUILT_IN[1], V6]]) {
    assert.deepEqual(entry.profile.routes, file.routes.map((r) => ({ ...r, points: r.points })), entry.name);
    assert.deepEqual(entry.profile.aircraft, file.aircraft);
    assert.deepEqual(entry.profile.anchor, file.anchor);
    assert.equal(entry.profile.seed, 1);
    assert.equal(entry.profile.notes, '');
    const s = entry.profile.settings;
    assert.equal(s.speed, 8);
    assert.equal(s.layerPhoto, true);
    assert.equal(s.photoTrim, 1.2);
    assert.equal(s.photoOpacityPct, 100);
    assert.equal(s.flyRoundedTurns, true);
    assert.equal(s.manualRadiusFt, 1800);
    assert.equal(s.conflictLatFt, 200);
    assert.equal(s.cautionVertFt, 500);
  }
});

test('V6\'s view, route options and conflict limits map to this page\'s settings, and a setup without them maps to nothing', () => {
  assert.deepEqual(settingsFromSetup({}), {});
  const s = settingsFromSetup({ view: { playbackSpeed: 2, showTrails: false, showLegDistances: true, photo: { show: false, opacity: 0.55, trim: 1, offsetEastFt: 100, offsetNorthFt: -50, aboveGrid: false } }, routeOptions: { radiusFromG: false }, conflictLimits: { latFt: 300 } });
  assert.deepEqual(s, { speed: 2, layerTrails: false, layerLegDistances: true, layerPhoto: false, photoAboveGrid: false, photoOpacityPct: 55, photoTrim: 1, photoEastFt: 100, photoNorthFt: -50, radiusFromG: false, conflictLatFt: 300 });
});

test('isBuiltInName knows both built-in names, so a saved profile cannot take one', () => {
  assert.ok(isBuiltInName('Moose Jaw (built-in)'));
  assert.ok(isBuiltInName('  Moose Jaw (V6 original) '));
  assert.ok(!isBuiltInName('Moose Jaw'));
});

test('every profile setting has a starting value, and the list names only settings that exist', () => {
  const defaults = profileSettingDefaults();
  assert.deepEqual(Object.keys(defaults), [...PROFILE_SETTING_KEYS]);
  for (const key of PROFILE_SETTING_KEYS) assert.ok(Object.hasOwn(DEFAULTS, key), key);
  assert.ok(checkProfile({ ...good(), settings: defaults }).ok, 'the defaults are themselves a good set of settings');
});

// ── What is accepted ─────────────────────────────────────────────────────────

test('a good profile is accepted as a new object of its own, with nothing else kept', () => {
  const raw = { ...good(), extra: 'x', settings: { speed: 4, layerTrails: false, junk: 1 } };
  raw.routes[0].onclick = 'alert(1)';
  raw.routes[0].points[0].label = '<img src=x onerror=alert(1)>';
  raw.aircraft[0].note = 'x';
  const result = checkProfile(raw);
  assert.ok(result.ok, result.problem);
  assert.notEqual(result.profile, raw);
  assert.notEqual(result.profile.routes[0], raw.routes[0]);
  assert.deepEqual(Object.keys(result.profile).sort(), ['aircraft', 'airfield', 'anchor', 'name', 'notes', 'routes', 'seed', 'settings', 'version']);
  assert.equal(result.profile.routes[0].onclick, undefined);
  assert.equal(result.profile.aircraft[0].note, undefined);
  assert.deepEqual(result.profile.settings, { speed: 4, layerTrails: false });
  // Text stays text: the label is kept as the characters typed, to be shown with textContent.
  assert.equal(result.profile.routes[0].points[0].label, '<img src=x onerror=alert(1)>');
});

test('a profile with no aircraft, no notes and no settings is fine: a new setup starts like that', () => {
  const raw = newSetupAt({ icao: 'CYQR', lat: 50.43, lon: -104.66 });
  const result = checkProfile(raw);
  assert.ok(result.ok, result.problem);
  assert.equal(result.profile.airfield, 'CYQR');
  assert.equal(result.profile.routes[0].kind, 'pattern');
  assert.deepEqual(result.profile.aircraft, []);
  assert.equal(result.profile.name, 'Setup 1');
});

test('the edges the spec gives are allowed: 30 routes, 100 points a route, 200 aircraft, a 40-character name', () => {
  const raw = good();
  raw.name = 'n'.repeat(NAME_MAX);
  const pat = raw.routes.find((r) => r.kind === 'pattern');
  const spare = { id: 'X', name: 'X', kind: 'pattern', visible: true, color: '#ffffff', landOdds: 0.2, points: pat.points };
  raw.routes = [pat, ...Array.from({ length: MOST_ROUTES - 1 }, (_, i) => ({ ...clone(spare), id: `R${i}`, name: `Route ${i}` }))];
  raw.routes[1].points = Array.from({ length: MOST_POINTS }, (_, i) => ({ ...pat.points[i % pat.points.length], label: `P${i}` }));
  raw.aircraft = Array.from({ length: MOST_AIRCRAFT }, (_, i) => ({ id: `A${i}`, type: 'CT-156', routeId: pat.id, startIndex: 0, startsAtSec: i }));
  const result = checkProfile(raw);
  assert.ok(result.ok, result.problem);
});

test('names are cleaned of control and direction-changing characters and trimmed, and HTML stays as typed', () => {
  assert.equal(cleanName('  Busy ‮tuesday\u0000 '), 'Busy tuesday');
  assert.equal(cleanName(12), '');
  const raw = good();
  raw.name = '  <b>Busy</b> ‮ ';
  raw.notes = 'line one\nline two\ttab\u0000‮';
  const result = checkProfile(raw);
  assert.ok(result.ok, result.problem);
  assert.equal(result.profile.name, '<b>Busy</b>');
  assert.equal(result.profile.notes, 'line one\nline two\ttab');
});

test('a profile from JSON with a __proto__ key does not change any object', () => {
  const raw = JSON.parse(JSON.stringify(good()).replace('"version":1', '"__proto__":{"polluted":true},"version":1'));
  const result = checkProfile(raw);
  assert.ok(result.ok, result.problem);
  assert.equal(({}).polluted, undefined);
  assert.equal(result.profile.polluted, undefined);
  assert.equal(Object.getPrototypeOf(result.profile), Object.prototype);
});

// ── What is refused, and how it says so ──────────────────────────────────────

test('something that is not a profile, or is another version, is refused', () => {
  for (const raw of [null, undefined, 3, 'text', [], true]) refused(raw, /not a profile/);
  refused({ ...good(), version: 2 }, /different version/);
  refused({ ...good(), version: undefined }, /different version/);
});

test('names: empty, over 40 characters, or not text are refused', () => {
  refused({ ...good(), name: '' }, /name is empty or over 40/);
  refused({ ...good(), name: ' \u0000 ' }, /name is empty or over 40/);
  refused({ ...good(), name: 'n'.repeat(NAME_MAX + 1) }, /name is empty or over 40/);
  refused({ ...good(), name: 42 }, /name is empty or over 40/);
  refused({ ...good(), name: { toString: () => 'x' } }, /name is empty or over 40/);
});

test('routes: none, too many, and too many points are refused with the number', () => {
  refused({ ...good(), routes: [] }, /no routes/);
  refused({ ...good(), routes: 'x' }, /no routes/);
  const many = good();
  const pat = many.routes[0];
  many.routes = Array.from({ length: MOST_ROUTES + 1 }, (_, i) => ({ ...clone(pat), id: `R${i}`, name: `Route ${i}` }));
  refused(many, /31 routes \(the most is 30\)/);
  const long = good();
  long.routes[0].points = Array.from({ length: MOST_POINTS + 1 }, () => clone(pat.points[0]));
  refused(long, /101 points \(the most is 100\)/);
  const short = good();
  short.routes[0].points = short.routes[0].points.slice(0, 2);
  refused(short, /2 points \(a pattern needs at least 3\)/);
});

test('route fields: id, name, kind, visibility and colour are held to their shapes', () => {
  const bad = (change, words) => {
    const raw = good();
    change(raw.routes[0]);
    refused(raw, words);
  };
  bad((r) => { r.id = '__proto__'; }, /id that is not letters/);
  bad((r) => { r.id = 'a b'; }, /id that is not letters/);
  bad((r) => { r.id = 'constructor'; }, /id that is not letters/);
  bad((r) => { r.id = 'prototype'; }, /id that is not letters/);
  bad((r) => { r.id = 'x'.repeat(21); }, /id that is not letters/);
  bad((r) => { r.name = ''; }, /name that is empty or over 40/);
  bad((r) => { r.name = 'n'.repeat(41); }, /name that is empty or over 40/);
  bad((r) => { r.kind = 'pfl'; }, /not a pattern, an entry or a split/);
  bad((r) => { r.visible = 'yes'; }, /does not say whether it shows/);
  bad((r) => { r.color = 'red'; }, /colour that is not like/);
  bad((r) => { r.color = 'url(javascript:alert(1))'; }, /colour that is not like/);
  bad((r) => { r.points = 'x'; }, /has no points/);
  bad((r) => { r.landOdds = 1.5; }, /landOdds that is not from 0 to 1/);
  bad((r) => { r.landOdds = Number.NaN; }, /landOdds that is not from 0 to 1/);
  const dup = good();
  dup.routes[1].id = dup.routes[0].id;
  refused(dup, /two routes have the id PAT1/);
});

test('points: every number must be a finite number in its box\'s range, and a label at most 40 characters', () => {
  const bad = (change, words) => {
    const raw = good();
    change(raw.routes[0].points[2]);
    refused(raw, words);
  };
  bad((p) => { p.alt = -1001; }, /height outside -1,000 to 20,000 ft/);
  bad((p) => { p.alt = 20001; }, /height outside/);
  bad((p) => { p.alt = Number.NaN; }, /height outside/);
  bad((p) => { p.alt = '3500'; }, /height outside/);
  bad((p) => { p.kt = 39; }, /speed outside 40 to 400 kt/);
  bad((p) => { p.kt = Infinity; }, /speed outside/);
  bad((p) => { p.g = 0.5; }, /G outside 1 to 9/);
  bad((p) => { p.g = 10; }, /G outside/);
  bad((p) => { p.x = 5e6; }, /from the airfield/);
  bad((p) => { p.y = null; }, /from the airfield/);
  bad((p) => { p.x = undefined; }, /from the airfield/);
  bad((p) => { p.label = 'l'.repeat(41); }, /label that is not text of at most 40/);
  bad((p) => { p.label = 5; }, /label that is not text/);
  const notPoint = good();
  notPoint.routes[0].points[0] = 7;
  refused(notPoint, /point 1 of Pattern 1 is not a point/);
});

test('links: an entry or split must join a pattern that is there, at a point that is there', () => {
  const entry = () => {
    const raw = good();
    return [raw, raw.routes.find((r) => r.kind === 'entry')];
  };
  let [raw, r] = entry();
  r.attachTo = 'NOPE';
  refused(raw, /joins a route that is not there/);
  [raw, r] = entry();
  r.attachTo = raw.routes.find((x) => x.kind === 'entry' && x !== r).id; // an entry, not a pattern
  refused(raw, /joins a route that is not there, or is not a pattern/);
  [raw, r] = entry();
  r.mergeIndex = 99;
  refused(raw, /joins Pattern 1 at point 100, which it does not have/);
  [raw, r] = entry();
  r.mergeIndex = -1;
  refused(raw, /point number/);
  [raw, r] = entry();
  r.mergeIndex = 1.5;
  refused(raw, /point number/);
  [raw, r] = entry();
  r.attachTo = 5;
  refused(raw, /joins something that is not a route/);
  const split = good();
  const s = split.routes.find((x) => x.kind === 'split');
  s.sourceRoute = 'NOPE';
  refused(split, /joins a route that is not there/);
  const odds = good();
  odds.routes.find((x) => x.kind === 'split').splitOdds = 2;
  refused(odds, /splitOdds that is not from 0 to 1/);
  // A route that has been left "Not linked" (an empty link) is fine.
  const unlinked = good();
  unlinked.routes.find((x) => x.kind === 'entry').attachTo = '';
  assert.ok(checkProfile(unlinked).ok);
});

test('aircraft: a known type, a callsign, a route that is there, a start point it has, a start time in range', () => {
  const bad = (change, words) => {
    const raw = good();
    change(raw.aircraft[1], raw);
    refused(raw, words);
  };
  bad((a) => { a.type = 'F-16'; }, /type this sim does not know/);
  bad((a) => { a.type = '__proto__'; }, /type this sim does not know/);
  bad((a) => { a.type = 'toString'; }, /type this sim does not know/);
  bad((a) => { a.id = 'A 1'; }, /callsign that is not/);
  bad((a) => { a.id = '__proto__'; }, /callsign that is not/);
  bad((a) => { a.id = 'constructor'; }, /callsign that is not/);
  bad((a) => { a.id = 'prototype'; }, /callsign that is not/);
  bad((a, raw) => { a.id = raw.aircraft[0].id; }, /two aircraft are called/);
  bad((a) => { a.routeId = 'NOPE'; }, /starts on a route that is not there/);
  bad((a) => { a.startIndex = 40; }, /starts at a point Pattern 1 does not have/);
  bad((a) => { a.startIndex = 0.5; }, /starts at a point/);
  bad((a) => { a.startsAtSec = -1; }, /start at a time outside 0 to 86,400 s|starts at a time outside 0 to 86,400 s/);
  bad((a) => { a.startsAtSec = 90000; }, /starts at a time outside/);
  bad((a) => { a.startsAtSec = Number.NaN; }, /starts at a time outside/);
  const many = good();
  many.aircraft = Array.from({ length: MOST_AIRCRAFT + 1 }, (_, i) => ({ id: `A${i}`, type: 'CT-156', routeId: 'PAT1', startIndex: 0, startsAtSec: 0 }));
  refused(many, /201 aircraft \(the most is 200\)/);
  const notList = good();
  notList.aircraft = { length: 3 };
  refused(notList, /aircraft are not a list/);
});

test('seed, airfield, anchor, notes and settings are checked', () => {
  refused({ ...good(), seed: 1.5 }, /dice seed/);
  refused({ ...good(), seed: -1 }, /dice seed/);
  refused({ ...good(), seed: 2 ** 32 }, /dice seed/);
  refused({ ...good(), airfield: 'cymj' }, /four-letter code/);
  refused({ ...good(), airfield: 'CYMJX' }, /four-letter code/);
  refused({ ...good(), anchor: { lat: 91, lon: 0 } }, /latitude and longitude/);
  refused({ ...good(), anchor: { lat: 0, lon: 'x' } }, /latitude and longitude/);
  refused({ ...good(), anchor: null }, /latitude and longitude/);
  refused({ ...good(), notes: 'n'.repeat(NOTES_MAX + 1) }, /notes are not text of at most 2,000/);
  refused({ ...good(), notes: 12 }, /notes are not text/);
  refused({ ...good(), settings: [] }, /not a list of settings/);
  refused({ ...good(), settings: { speed: 3 } }, /playback speed 3 is not one of/);
  refused({ ...good(), settings: { speed: '8' } }, /setting speed is not the right kind/);
  refused({ ...good(), settings: { layerTrails: 1 } }, /setting layerTrails is not the right kind/);
  refused({ ...good(), settings: { manualRadiusFt: 50 } }, /setting manualRadiusFt \(50\) is outside 100 to 20,000/);
  refused({ ...good(), settings: { windKt: 61 } }, /windKt/);
  refused({ ...good(), settings: { conflictLatFt: Number.NaN } }, /not a number/);
  for (const key of PROFILE_SETTING_KEYS) {
    if (typeof DEFAULTS[key] === 'number' && Object.hasOwn(LIMITS, key)) {
      refused({ ...good(), settings: { [key]: LIMITS[key][1] + 1 } }, new RegExp(key));
      assert.ok(checkProfile({ ...good(), settings: { [key]: LIMITS[key][1] } }).ok, `${key} at its top`);
    }
  }
});

test('an oversized profile is refused before its parts are read', () => {
  const raw = good();
  raw.extra = 'x'.repeat(500_000);
  refused(raw, /too big/);
  const circular = good();
  circular.self = circular;
  refused(circular, /cannot be read/);
});

// ── Reading the saved list ───────────────────────────────────────────────────

test('readProfiles keeps the good ones in order and says in plain words why each bad one was skipped', () => {
  const a = { ...good(), name: 'Alpha' };
  const b = { ...good(), name: 'Beta', routes: [] };
  const c = { ...good(), name: 'Gamma' };
  const dup = { ...good(), name: 'Alpha' };
  const nameless = { ...good(), name: 5 };
  const { profiles, skipped } = readProfiles({ version: PROFILE_VERSION, profiles: [a, b, c, dup, nameless, null] });
  assert.deepEqual(profiles.map((p) => p.name), ['Alpha', 'Gamma']);
  assert.equal(skipped.length, 4);
  assert.match(skipped[0], /^"Beta" was skipped: it has no routes\.$/);
  assert.match(skipped[1], /"Alpha" was skipped: another profile has the same name/);
  assert.match(skipped[2], /^A profile was skipped:/);
  assert.match(skipped[3], /^A profile was skipped: it is not a profile/);
});

test('readProfiles: nothing stored is no profiles; something that is not the list is skipped with one sentence', () => {
  assert.deepEqual(readProfiles(null), { profiles: [], skipped: [] });
  assert.deepEqual(readProfiles(undefined), { profiles: [], skipped: [] });
  for (const stored of ['x', 5, [], { version: 9, profiles: [] }, { version: 1, profiles: 'x' }]) {
    const { profiles, skipped } = readProfiles(stored);
    assert.deepEqual(profiles, []);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0], /could not be read/);
  }
});

test('readProfiles keeps at most 20 saved profiles, and does not spend time on a huge list', () => {
  const list = Array.from({ length: 100 }, (_, i) => ({ ...good(), name: `P${i}` }));
  const { profiles, skipped } = readProfiles({ version: 1, profiles: list });
  assert.equal(profiles.length, MOST_SAVED);
  assert.ok(skipped.some((s) => /only 20 profiles are kept/.test(s)));
  assert.ok(skipped.some((s) => /More profiles were saved than this page keeps/.test(s)));
});

test('readProfiles: a hostile name in the skipped message is cleaned and cut', () => {
  const { skipped } = readProfiles({ version: 1, profiles: [{ ...good(), name: `‮${'x'.repeat(100)}`, routes: 5 }] });
  assert.equal(skipped.length, 1);
  assert.ok(!skipped[0].includes('‮'));
  assert.ok(skipped[0].length < 200);
});

// ── Making profiles ──────────────────────────────────────────────────────────

test('a new setup at an airfield is V6\'s generic pattern with no aircraft', () => {
  const setup = newSetupAt({ icao: 'CYXE', lat: 52.17, lon: -106.7 });
  assert.equal(setup.routes.length, 1);
  assert.equal(setup.routes[0].points.length, 6);
  assert.deepEqual(setup.anchor, { lat: 52.17, lon: -106.7 });
  assert.equal(setup.routes[0].landOdds, 0.2);
  assert.ok(checkProfile(setup).ok);
});

test('the next profile name is the first "Setup N" nobody has', () => {
  assert.equal(nextProfileName([]), 'Setup 1');
  assert.equal(nextProfileName(['Setup 1', 'Setup 2', 'Other']), 'Setup 3');
  assert.equal(nextProfileName(['Setup 2']), 'Setup 1');
});

test('captureProfile takes the setup, the aircraft, the seed, the notes and the profile settings, as copies, and it passes the checks', () => {
  const setup = { anchor: { lat: 50.3303, lon: -105.5592 }, routes: clone(MOOSE_JAW.routes) };
  const aircraft = [{ id: 'A1', type: 'CT-157', routeId: 'PAT1', startIndex: 0, startsAtSec: 12 }];
  const settings = { ...DEFAULTS, speed: 2, layerTrails: false, spawnDelayS: 55, view: '3d' };
  const p = captureProfile({ name: '  Busy Tuesday ', airfield: 'CYMJ', notes: 'wind 250/20', setup, aircraft, seed: 7, settings });
  assert.equal(p.name, 'Busy Tuesday');
  assert.equal(p.settings.speed, 2);
  assert.equal(p.settings.layerTrails, false);
  assert.equal(p.settings.spawnDelayS, undefined, 'the spawner\'s boxes are not a profile\'s');
  assert.equal(p.settings.view, undefined, '2D or 3D is per viewer');
  assert.notEqual(p.routes, setup.routes);
  assert.notEqual(p.aircraft, aircraft);
  const result = checkProfile(p);
  assert.ok(result.ok, result.problem);
  assert.deepEqual(result.profile.routes, setup.routes);
  assert.equal(result.profile.seed, 7);
  assert.equal(result.profile.notes, 'wind 250/20');
});

// ── What opens first ─────────────────────────────────────────────────────────

test('the profile that opens: the last one used, else the built-in Moose Jaw at CYMJ, else V6\'s generic pattern at the home field', () => {
  const alpha = { ...good(), name: 'Alpha' };
  const cymj = { icao: 'CYMJ', lat: 50.3303, lon: -105.559 };
  const cyqr = { icao: 'CYQR', lat: 50.4319, lon: -104.6658 };

  // Nothing remembered: the home field decides.
  assert.equal(startingProfile({ last: null, saved: [], home: cymj }).profile, BUILT_IN[0].profile);
  assert.equal(startingProfile({ last: null, saved: [], home: cymj }).place, 'Moose Jaw');
  assert.equal(startingProfile({ last: null, saved: [], home: undefined }).profile, BUILT_IN[0].profile, 'no home field known: Moose Jaw');
  const generic = startingProfile({ last: null, saved: [], home: cyqr });
  assert.equal(generic.entry, null, 'a new setup is not any saved profile');
  assert.equal(generic.profile.airfield, 'CYQR');
  assert.deepEqual(generic.profile.anchor, { lat: 50.4319, lon: -104.6658 });
  assert.equal(generic.profile.routes.length, 1);
  assert.equal(generic.place, '');
  assert.ok(checkProfile(generic.profile).ok);
  // A home field with no position known can't have a pattern drawn on it: Moose Jaw opens.
  assert.equal(startingProfile({ last: null, saved: [], home: { icao: 'ZZZZ', lat: null, lon: null } }).profile, BUILT_IN[0].profile);

  // The last one used wins, whatever the home field.
  assert.equal(startingProfile({ last: { kind: 'saved', name: 'Alpha' }, saved: [alpha], home: cyqr }).profile, alpha);
  assert.deepEqual(startingProfile({ last: { kind: 'saved', name: 'Alpha' }, saved: [alpha], home: cyqr }).entry, { kind: 'saved', name: 'Alpha' });
  assert.equal(startingProfile({ last: { kind: 'saved', name: 'Alpha' }, saved: [alpha], home: cyqr }).place, '');
  assert.equal(startingProfile({ last: { kind: 'built-in', id: 'moose-jaw-v6' }, saved: [], home: cyqr }).profile, BUILT_IN[1].profile);
  assert.equal(startingProfile({ last: { kind: 'built-in', id: 'moose-jaw-v6' }, saved: [], home: cyqr }).place, 'Moose Jaw');
  // The last one is gone (deleted, or it failed the checks): back to the home field's setup.
  assert.equal(startingProfile({ last: { kind: 'saved', name: 'Gone' }, saved: [alpha], home: cymj }).profile, BUILT_IN[0].profile);
});
