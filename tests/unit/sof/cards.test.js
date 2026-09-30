// Tests for src/modules/sof/cards.js: what each airfield card says, decided
// without a page. Reports come from the real captures and hand-written METARs
// and TAFs in tests/fixtures/sof/reports.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { natoColour, flightCategory, checkConditions, DEFAULT_LIMITS } from '../../../src/wx/limits.js';
import { staleness, SOURCES } from '../../../src/wx/sources.js';
import { cardModel, formatDuration, formatAge } from '../../../src/modules/sof/cards.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { REAL, METAR, HOME_TAF, ALT_TAF } from '../../fixtures/sof/reports.js';

const NOW = new Date('2026-09-29T18:42:00Z'); // 42 minutes after the 1800Z METARs
const at = (hh, mm = 0, day = 29) => new Date(Date.UTC(2026, 8, day, hh, mm));

// A report entry as wx's fetchReports gives it: { raw, report, source, status }.
const metarEntry = (raw, now = NOW, source = 'metno') => {
  const report = parseMetar(raw, { now });
  return { raw, report, source, status: staleness('metar', report, now) };
};
const tafEntry = (raw, now = NOW, source = 'metno') => {
  const report = parseTaf(raw, { now });
  return { raw, report, source, status: staleness('taf', report, now) };
};
const home = (extra) => cardModel({ icao: 'CYMJ', name: 'Moose Jaw', role: 'HOME', now: NOW, ...extra });
const alt = (extra) => cardModel({ icao: 'CYQR', name: 'Regina', role: 'ALT', now: NOW, ...extra });

// ---- Durations ------------------------------------------------------------------

test('durations and ages read as words', () => {
  assert.equal(formatDuration(42), '42 min');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(100), '1 h 40 min');
  assert.equal(formatDuration(24 * 60 + 65), '1 d 1 h');
  assert.equal(formatAge(0.4), 'just now');
  assert.equal(formatAge(-5), 'just now', 'an observation a few minutes ahead of the clock is not negative');
  assert.equal(formatAge(42), '42 min ago');
  assert.equal(formatAge(100), '1 h 40 min ago');
  assert.equal(formatAge(null), 'age unknown');
});

// ---- Header ------------------------------------------------------------------------

test('header: ICAO, name, HOME or ALT, flight category and NATO state from wx', () => {
  const c = home({ metar: metarEntry(METAR.fresh) });
  const conditions = parseMetar(METAR.fresh, { now: NOW }).conditions;
  assert.equal(c.icao, 'CYMJ');
  assert.equal(c.name, 'Moose Jaw');
  assert.equal(c.role, 'HOME');
  assert.equal(c.category, flightCategory(conditions));
  assert.equal(c.category, 'VFR');
  assert.equal(c.nato, natoColour(conditions));
  assert.equal(c.nato, 'BLU');
  assert.equal(alt({}).role, 'ALT');
});

test('category and NATO follow the weather', () => {
  const c = home({ metar: metarEntry(METAR.foggy) });
  assert.equal(c.category, 'LIFR');
  assert.equal(c.nato, 'RED');
});

test('no METAR: no category and no NATO state, not a made-up one', () => {
  const c = home({});
  assert.equal(c.category, null);
  assert.equal(c.nato, null);
});

// ---- METAR times, ages, stale, missing ---------------------------------------------------

test('METAR line: time and age from the report itself', () => {
  const m = home({ metar: metarEntry(METAR.fresh) }).metar;
  assert.equal(m.state, 'fresh');
  assert.equal(m.label, 'METAR 1800Z (42 min ago)');
  assert.equal(m.ageMin, 42);
  assert.equal(m.ageText, '42 min ago');
  assert.equal(+m.time, +at(18));
  assert.equal(m.staleText, null);
  assert.equal(m.raw, METAR.fresh);
  assert.equal(m.sourceName, SOURCES.metno.name);
});

test('the source is named: MET Norway or Datamask', () => {
  assert.equal(home({ metar: metarEntry(METAR.fresh, NOW, 'datamask') }).metar.sourceName, SOURCES.datamask.name);
});

test('a METAR is stale after wx\'s 75 minutes, by its own time, and says so in words (D67)', () => {
  const fresh = home({ now: at(19, 15), metar: metarEntry(METAR.fresh, at(19, 15)) }).metar;
  assert.equal(fresh.state, 'fresh', '75 min is still fresh');
  const late = at(19, 40);
  const stale = home({ now: late, metar: metarEntry(METAR.fresh, late) }).metar;
  assert.equal(stale.state, 'stale');
  assert.equal(stale.staleText, 'STALE: 1 h 40 min old');
  assert.equal(stale.label, 'METAR 1800Z (1 h 40 min ago)');
  const justOver = at(19, 16);
  assert.equal(home({ now: justOver, metar: metarEntry(METAR.fresh, justOver) }).metar.state, 'stale');
});

test('the card decides staleness from now, not from the status the feed stored earlier', () => {
  const entry = metarEntry(METAR.fresh); // stored as fresh
  assert.equal(entry.status, 'fresh');
  assert.equal(home({ now: at(20, 30), metar: entry }).metar.state, 'stale');
});

test('a stale report keeps its category and limit result but marks them stale, never current', () => {
  const late = at(20, 30);
  const c = home({ now: late, metar: metarEntry(METAR.belowLimits, late) });
  assert.equal(c.result.level, 'below');
  assert.equal(c.result.stale, true);
  assert.equal(c.result.words, 'Below limits: CEILING 1500 FT < 2000 FT, VIS 2 SM < 3 SM (STALE report)');
  assert.equal(c.category, 'IFR');
  assert.equal(home({ metar: metarEntry(METAR.belowLimits) }).result.stale, false);
});

test('a METAR with no readable time is stale with an unknown age, not fresh', () => {
  const m = home({ metar: metarEntry('METAR CYMJ 27010KT 15SM FEW100 15/02 A2952') }).metar;
  assert.equal(m.state, 'stale');
  assert.equal(m.ageMin, null);
  assert.equal(m.staleText, 'STALE: age unknown');
});

test('missing METAR says which sources were tried and when', () => {
  const c = home({ feed: { lastTry: at(18, 36) } });
  assert.equal(c.metar.state, 'missing');
  assert.equal(c.metar.words, 'No METAR from MET Norway or Datamask (last tried 1836Z)');
  assert.equal(home({}).metar.words, 'No METAR from MET Norway or Datamask');
  assert.equal(c.result.level, 'none');
  assert.equal(c.result.words, 'No METAR');
});

test('a METAR that failed to refresh is kept with its age and says the refresh failed (#8)', () => {
  const c = home({ metar: metarEntry(METAR.fresh), feed: { failed: true, lastTry: at(18, 40) } });
  assert.equal(c.metar.state, 'fresh');
  assert.equal(c.metar.raw, METAR.fresh);
  assert.equal(c.metar.refreshFailed, true);
  assert.equal(c.metar.refreshNote, 'Last refresh failed (tried 1840Z)');
  assert.equal(home({ metar: metarEntry(METAR.fresh) }).metar.refreshNote, null);
});

test('a NIL METAR is reported as words', () => {
  const c = home({ metar: metarEntry('METAR CYMJ 291800Z NIL') });
  assert.equal(c.metar.state, 'nil');
  assert.equal(c.metar.words, 'METAR NIL: no observation');
  assert.equal(c.category, null);
});

// ---- LAST OBS/NXT ------------------------------------------------------------------------------

test('LAST OBS/NXT reads as "No obs until 1000Z", not stale or an error (CYMJ closes overnight)', () => {
  const now = new Date('2026-09-30T03:00:00Z');
  const m = home({ now, metar: metarEntry(REAL.metar.CYMJ, now) }).metar;
  assert.match(REAL.metar.CYMJ, /LAST OBS\/NXT 011000Z/);
  assert.equal(m.state, 'closed');
  assert.equal(m.words, 'No obs until 1000Z');
  assert.equal(m.staleText, null);
  assert.equal(m.noObsUntil.toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(m.label, 'METAR 0027Z (2 h 33 min ago)', 'the age is still shown');
});

test('once the next obs is due and there is none, the report is plainly stale again', () => {
  const now = new Date('2026-10-01T10:30:00Z');
  const m = home({ now, metar: metarEntry(REAL.metar.CYMJ, now) }).metar;
  assert.equal(m.state, 'stale');
  assert.match(m.staleText, /^STALE: /);
});

test('a fresh METAR that carries LAST OBS still says when the next one is', () => {
  const now = new Date('2026-09-30T00:40:00Z');
  const m = home({ now, metar: metarEntry(REAL.metar.CYMJ, now) }).metar;
  assert.equal(m.state, 'fresh');
  assert.equal(m.words, 'No obs until 1000Z');
});

// ---- TAF ---------------------------------------------------------------------------------------------

test('TAF line: issue time and valid period, with its age', () => {
  const t = home({ taf: tafEntry(HOME_TAF.good) }).taf;
  assert.equal(t.state, 'fresh');
  assert.equal(t.label, 'TAF 1740Z, valid 29/18–30/06');
  assert.equal(t.ageText, 'issued 1 h 2 min ago');
  assert.equal(t.raw, HOME_TAF.good);
  assert.equal(t.staleText, null);
});

test('a TAF past its end is stale and says how long ago it ended', () => {
  const late = at(7, 40, 30);
  const t = home({ now: late, taf: tafEntry(HOME_TAF.good, at(7, 40, 30)) }).taf;
  assert.equal(t.state, 'stale');
  assert.equal(t.staleText, 'STALE: valid period ended 1 h 40 min ago');
});

test('a cancelled TAF says "TAF cancelled", it is not an error or a stale report', () => {
  const now = new Date('2026-09-30T03:00:00Z');
  const t = home({ now, taf: tafEntry(REAL.taf.CYMJ, now) }).taf;
  assert.equal(t.state, 'cancelled');
  assert.equal(t.words, 'TAF cancelled');
  assert.equal(t.staleText, null);
  assert.equal(t.label, 'TAF 0030Z, valid 30/00–30/12');
});

test('a NIL TAF and a missing TAF', () => {
  const nil = home({ taf: tafEntry('TAF CYMJ 291740Z NIL') }).taf;
  assert.equal(nil.state, 'nil');
  assert.equal(nil.words, 'TAF NIL: none issued');
  const missing = home({ feed: { lastTry: at(18, 36) } }).taf;
  assert.equal(missing.state, 'missing');
  assert.equal(missing.words, 'No TAF from MET Norway or Datamask (last tried 1836Z)');
});

// ---- Limit result ------------------------------------------------------------------------------------

test('result: below the limits, in wx\'s words', () => {
  const r = home({ metar: metarEntry(METAR.belowLimits) }).result;
  assert.equal(r.level, 'below');
  assert.equal(r.words, 'Below limits: CEILING 1500 FT < 2000 FT, VIS 2 SM < 3 SM');
  assert.deepEqual(r.reasons, ['CEILING 1500 FT < 2000 FT', 'VIS 2 SM < 3 SM']);
});

test('result: exactly on the limit is "At the limit", not below', () => {
  const r = home({ metar: metarEntry(METAR.onLimits) }).result;
  assert.equal(r.level, 'at-limit');
  assert.equal(r.words, 'At the limit: CEILING 2000 FT AT LIMIT 2000 FT, VIS 3 SM AT LIMIT 3 SM');
});

test('result: within limits, and unknown is never within', () => {
  assert.equal(home({ metar: metarEntry(METAR.fresh) }).result.words, 'Within limits');
  const unknown = home({ metar: metarEntry(METAR.noCeilingGroup) }).result;
  assert.equal(unknown.level, 'unknown');
  assert.equal(unknown.words, 'Unknown: no ceiling reported');
  const noBase = home({ metar: metarEntry('METAR CYMJ 291800Z 27005KT 10SM OVC/// 10/08 A2995') }).result;
  assert.equal(noBase.words, 'Unknown: cloud base not reported');
});

test('home limits: default Local (MTCA) 2000/3, or the ones passed, with the label from the numbers', () => {
  const m = metarEntry('METAR CYMJ 291800Z 27005KT 10SM BKN025 10/08 A2995');
  const local = home({ metar: m });
  assert.equal(local.result.level, 'within');
  assert.equal(local.limitsText, 'Local (MTCA) 2000/3');
  const xc = home({ metar: m, limits: { ceilingFt: 3000, visSm: 3 } });
  assert.equal(xc.result.level, 'below');
  assert.equal(xc.limitsText, 'Cross-country 3000/3');
  assert.equal(home({ metar: m, limits: { ceilingFt: 2500, visSm: 3 } }).limitsText, 'Custom 2500/3');
});

test('#4: an alternate card uses its own minima, not the home limits', () => {
  // 700 ft ceiling, 3 SM: below home's 2000, fine for the alternate's 600-2.
  const m = metarEntry('METAR CYQR 291800Z 27005KT 3SM BR BKN007 10/08 A2995');
  const c = alt({ metar: m, limits: [{ ceilingFt: 600, visSm: 2 }] });
  assert.equal(c.result.level, 'within');
  assert.equal(c.limitsText, '600-2');
  const worse = alt({ metar: metarEntry('METAR CYQR 291800Z 27005KT 3SM BR BKN005 10/08 A2995'), limits: [{ ceilingFt: 600, visSm: 2 }] });
  assert.equal(worse.result.level, 'below');
  assert.match(worse.result.words, /^Below limits: CEILING 500 FT < 600 FT/);
});

test('an alternate with no minima given is checked against V6\'s 600-2', () => {
  const c = alt({ metar: metarEntry('METAR CYQR 291800Z 27005KT 3SM BR BKN005 10/08 A2995') });
  assert.equal(c.result.level, 'below');
  assert.equal(c.limitsText, '600-2');
  assert.deepEqual(DEFAULT_LIMITS.alternate, { ceilingFt: 600, visSm: 2 });
});

test('an alternate with several minima options is below only when below every one', () => {
  const options = [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }];
  // 600 ft and 2 SM is below 700-1.5 and 800-1 but exactly on 600-2: at the limit, not below.
  const c = alt({ metar: metarEntry('METAR CYQR 291800Z 27005KT 2SM BR BKN006 10/08 A2995'), limits: options });
  assert.notEqual(c.result.level, 'below');
  assert.equal(c.limitsText, '600-2 (or 700-1½, 800-1)');
});

// ---- Cautions and watch -----------------------------------------------------------------------------------

test('cautions come from wx and never change the limit result', () => {
  const c = home({ metar: metarEntry(METAR.thunderstorm) });
  assert.equal(c.result.level, 'within');
  assert.deepEqual(c.cautions, ['VCTS', 'FEW040CB']);
  assert.ok(c.cautionReasons.some((r) => r.startsWith('THUNDERSTORM')));
  assert.equal(c.alert, true);
  assert.equal(home({ metar: metarEntry(METAR.fresh) }).alert, false);
  assert.deepEqual(home({ metar: metarEntry(METAR.fresh) }).cautions, []);
});

test('information-only weather is listed as Watch', () => {
  const c = home({ metar: metarEntry(METAR.vicinityShowers) });
  assert.deepEqual(c.watch, ['VCSH']);
  assert.equal(c.watchText, 'Watch: VCSH');
  assert.equal(c.alert, false);
  assert.equal(home({ metar: metarEntry(METAR.fresh) }).watchText, null);
});

test('fog is both below the limits and a caution', () => {
  const c = home({ metar: metarEntry(METAR.foggy) });
  assert.equal(c.result.level, 'below');
  assert.ok(c.cautions.includes('FG'));
});

test('the model agrees with wx checkConditions', () => {
  const report = parseMetar(METAR.belowLimits, { now: NOW });
  const direct = checkConditions(report.conditions, DEFAULT_LIMITS.home);
  assert.deepEqual(home({ metar: metarEntry(METAR.belowLimits) }).result.reasons, direct.reasons);
});

// ---- Defaults ---------------------------------------------------------------------------------------------

test('an empty card still has every field, with nothing invented', () => {
  const c = cardModel({});
  assert.equal(c.icao, null);
  assert.equal(c.role, 'ALT');
  assert.equal(c.metar.state, 'missing');
  assert.equal(c.taf.state, 'missing');
  assert.deepEqual(c.cautions, []);
  assert.equal(c.result.level, 'none');
});

test('a card built from an alternate TAF and METAR together', () => {
  const c = alt({ metar: metarEntry('METAR CYQR 291800Z 25015KT 15SM FEW080 15/02 A2952'), taf: tafEntry(ALT_TAF.good) });
  assert.equal(c.metar.state, 'fresh');
  assert.equal(c.taf.state, 'fresh');
  assert.equal(c.taf.label, 'TAF 1740Z, valid 29/18–30/18');
});

// ---- Review fixes ----------------------------------------------------------------------

test('a stale or closed METAR never reads as plain "Within limits"', () => {
  const late = at(20, 30);
  const stale = home({ now: late, metar: metarEntry(METAR.fresh, late) }).result;
  assert.equal(stale.level, 'within');
  assert.equal(stale.words, 'Within limits (STALE report)');
  const now = new Date('2026-09-30T03:00:00Z');
  const closed = home({ now, metar: metarEntry(REAL.metar.CYMJ, now) }).result;
  assert.equal(closed.words, 'Within limits (last observation)');
  assert.equal(home({ metar: metarEntry(METAR.fresh) }).result.words, 'Within limits');
});

const airfields = () => {
  const map = new Map();
  const backend = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
  return createAirfields({ store: createStore(backend).scope('airfields') });
};
const overcast800 = () => metarEntry('METAR CYQR 291800Z 27005KT 10SM OVC008 10/08 A2995');

test('D80: a no-IFR alternate is never checked against 600-2', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'no-ifr', meaFt: 4500 } } });
  const c = alt({ metar: overcast800(), options: a.checkOptions('CYQR') });
  assert.equal(a.checkOptions('CYQR').minima, null);
  assert.equal(c.result.level, 'unknown');
  assert.equal(c.result.words, 'Visual descent from MEA: see the wave call');
  assert.equal(c.limitsText, 'Visual descent from MEA 4,500 ft, 3 SM');
});

test('D80: a no-IFR alternate without an MEA says it needs one', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'no-ifr' } } });
  const c = alt({ metar: overcast800(), options: a.checkOptions('CYQR') });
  assert.equal(c.result.level, 'unknown');
  assert.equal(c.limitsText, 'Visual descent, needs MEA');
});

test('D80: a GNSS-only alternate with an MEA uses the visual descent, not LNAV minima', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'gnss-only', meaFt: 4500 } } });
  const c = alt({ metar: overcast800(), options: a.checkOptions('CYQR') });
  assert.equal(c.result.level, 'unknown');
  assert.equal(c.limitsText, 'Visual descent from MEA 4,500 ft, 3 SM');
  // Cautions still come from the METAR.
  const storm = alt({ metar: metarEntry('METAR CYQR 291800Z 22008KT 15SM VCTS FEW040CB 22/14 A2980'), options: a.checkOptions('CYQR') });
  assert.ok(storm.cautions.includes('VCTS'));
});

test('a GNSS-only alternate with no MEA uses its LNAV minima from the whole options object', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'gnss-only' } } });
  const c = alt({ metar: overcast800(), options: a.checkOptions('CYQR') });
  assert.equal(c.limitsText, '800-2 (or 900-1½, 1000-1)');
  assert.equal(c.result.level, 'at-limit'); // 800 ft is exactly on 800-2; visibility 10 SM
});
