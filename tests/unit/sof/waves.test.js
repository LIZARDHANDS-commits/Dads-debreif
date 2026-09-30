// Tests for src/modules/sof/waves.js: wave times, home call, alternate calls.
// The V6 pins come first: they fix what V6 did before the new conversion is
// trusted with a time (CLAUDE.md: pin old behaviour, then change it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { homeAlternateTrigger, assessAlternate, arrivalWindow } from '../../../src/wx/alternates.js';
import { HOME_TRIGGERS, DEFAULT_LIMITS } from '../../../src/wx/limits.js';
import {
  MAX_WAVES, parseClock, localDate, localToUtc, planToUtc, waveWindow,
  triggerLimits, describeTrigger, cleanLimits, minimaText, descentText,
  homeCall, alternateCall, waveCalls,
} from '../../../src/modules/sof/waves.js';
import { REAL, HOME_TAF, ALT_TAF } from '../../fixtures/sof/reports.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-09-29T18:00:00Z'); // 12:00 in Moose Jaw

// ---- V6, pinned -----------------------------------------------------------

// V6 sof.html line 1441: `new Date(Date.UTC(Y, M-1, D, ah+6, am))` for takeoff and
// landing, landing moved to the next day when it is not after takeoff (line 1442).
function v6Wave(Y, M, D, takeoff, land) {
  const [ah, am] = takeoff.split(':').map(Number);
  const [bh, bm] = land.split(':').map(Number);
  const s = new Date(Date.UTC(Y, M - 1, D, ah + 6, am));
  const e = new Date(Date.UTC(Y, M - 1, D, bh + 6, bm));
  if (e <= s) e.setUTCDate(e.getUTCDate() + 1);
  return { s, e };
}

// V6 sof.html line 2032, used by the 24-hour timeline: CST = 6 h, minutes of the
// local day, landing +1440 when it is not after takeoff (line 2039).
const CST = 3_600_000 * 6;
const absoluteLocal = (y, m, d, mins) => Date.UTC(y, m, d, 0, 0) + CST + mins * 60000;
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const PAIRS = [
  ['08:00', '09:30'], ['00:00', '01:00'], ['06:00', '07:45'], ['13:45', '15:15'], ['17:59', '19:20'],
  ['18:00', '19:30'], ['20:30', '22:00'],
  ['22:00', '01:30'], ['23:30', '00:45'], ['18:00', '03:00'], // cross local midnight
  ['12:00', '12:00'], // not after takeoff: V6 makes it a 24 h wave
];

test('pin: V6 wave times for Moose Jaw are local + 6 h (spot checks)', () => {
  const w = v6Wave(2026, 9, 29, '08:00', '09:30');
  assert.equal(w.s.toISOString(), '2026-09-29T14:00:00.000Z');
  assert.equal(w.e.toISOString(), '2026-09-29T15:30:00.000Z');
  const late = v6Wave(2026, 9, 29, '20:30', '22:00'); // evening waves are the next UTC day
  assert.equal(late.s.toISOString(), '2026-09-30T02:30:00.000Z');
  const cross = v6Wave(2026, 9, 29, '22:00', '01:30');
  assert.equal(cross.e.toISOString(), '2026-09-30T07:30:00.000Z');
});

test('pin: V6 line 1441 and line 2032 agree with each other', () => {
  for (const [a, b] of PAIRS) {
    const w = v6Wave(2026, 9, 29, a, b);
    const take = minutesOf(a);
    let land = minutesOf(b);
    if (land <= take) land += 1440;
    assert.equal(+w.s, absoluteLocal(2026, 8, 29, take), `${a} takeoff`);
    assert.equal(+w.e, absoluteLocal(2026, 8, 29, land), `${b} landing`);
  }
});

for (const year of [2026, 2028]) {
  test(`Moose Jaw (America/Regina) wave times equal V6's +6 h on every day of ${year}`, () => {
    let days = 0;
    for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 24 * HOUR) {
      const d = new Date(t);
      const [Y, M, D] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const date = { year: Y, month: M, day: D };
      for (const [a, b] of PAIRS) {
        const v6 = v6Wave(Y, M, D, a, b);
        const [wave] = planToUtc([{ takeoff: a, land: b }], { now: NOW, timeZone: 'America/Regina', date }).waves;
        assert.equal(wave.takeoff.toISOString(), v6.s.toISOString(), `${Y}-${M}-${D} ${a}`);
        assert.equal(wave.land.toISOString(), v6.e.toISOString(), `${Y}-${M}-${D} ${a}-${b} landing`);
      }
      days++;
    }
    assert.ok(days >= 365);
  });
}

// ---- Clock and date helpers ------------------------------------------------

test('parseClock reads HH:MM and refuses everything else', () => {
  assert.equal(parseClock('08:30'), 510);
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('23:59'), 1439);
  for (const bad of ['', '8:30 ', '24:00', '12:60', 'abc', null, undefined, 830, '0830']) assert.equal(parseClock(bad), null, String(bad));
});

test('localDate is the home-field date, not the UTC date', () => {
  // 03:00Z on the 30th is 21:00 on the 29th in Moose Jaw.
  assert.deepEqual(localDate(new Date('2026-09-30T03:00:00Z'), 'America/Regina'), { year: 2026, month: 9, day: 29 });
  assert.deepEqual(localDate(new Date('2026-09-30T06:00:00Z'), 'America/Regina'), { year: 2026, month: 9, day: 30 });
});

// ---- Daylight saving zones -------------------------------------------------

test('a daylight-saving zone gives the right UTC (America/Toronto)', () => {
  const tz = 'America/Toronto';
  assert.equal(localToUtc({ year: 2026, month: 7, day: 15 }, 8 * 60, tz).toISOString(), '2026-07-15T12:00:00.000Z'); // EDT
  assert.equal(localToUtc({ year: 2026, month: 1, day: 15 }, 8 * 60, tz).toISOString(), '2026-01-15T13:00:00.000Z'); // EST
});

test('DST change days: the landing after the change uses the new offset', () => {
  const tz = 'America/Toronto';
  // Fall back, Sunday 1 Nov 2026 at 02:00 EDT. Takeoff 22:00 the evening before, land 03:00 after the change.
  const fall = planToUtc([{ takeoff: '22:00', land: '03:00' }], { now: NOW, timeZone: tz, date: { year: 2026, month: 10, day: 31 } }).waves[0];
  assert.equal(fall.takeoff.toISOString(), '2026-11-01T02:00:00.000Z'); // 22:00 EDT
  assert.equal(fall.land.toISOString(), '2026-11-01T08:00:00.000Z'); // 03:00 EST, 6 h later
  // Spring forward, Sunday 8 Mar 2026 at 02:00 EST.
  const spring = planToUtc([{ takeoff: '22:00', land: '04:00' }], { now: NOW, timeZone: tz, date: { year: 2026, month: 3, day: 7 } }).waves[0];
  assert.equal(spring.takeoff.toISOString(), '2026-03-08T03:00:00.000Z'); // 22:00 EST
  assert.equal(spring.land.toISOString(), '2026-03-08T08:00:00.000Z'); // 04:00 EDT, 5 h later
});

test('a local time that happens twice takes the first; one that never happens moves forward', () => {
  const tz = 'America/Toronto';
  assert.equal(localToUtc({ year: 2026, month: 11, day: 1 }, 90, tz).toISOString(), '2026-11-01T05:30:00.000Z'); // 01:30 EDT
  assert.equal(localToUtc({ year: 2026, month: 3, day: 8 }, 150, tz).toISOString(), '2026-03-08T07:30:00.000Z'); // 02:30 -> 03:30 EDT
});

test('a repeated local time takes the first occurrence and a skipped one the later instant, east of UTC too', () => {
  const tz = 'Europe/Paris';
  assert.equal(localToUtc({ year: 2026, month: 10, day: 25 }, 150, tz).toISOString(), '2026-10-25T00:30:00.000Z'); // 02:30 CEST, before 02:30 CET
  assert.equal(localToUtc({ year: 2026, month: 3, day: 29 }, 150, tz).toISOString(), '2026-03-29T01:30:00.000Z'); // 02:30 doesn't exist: 03:30 CEST
  assert.equal(localToUtc({ year: 2026, month: 7, day: 1 }, 150, tz).toISOString(), '2026-07-01T00:30:00.000Z');
});

// ---- Plan to UTC -------------------------------------------------------------

test('Today and Tomorrow are dates in the home zone, so an old date is never kept', () => {
  const plan = [{ name: 'W1', takeoff: '08:00', land: '09:30' }];
  const late = new Date('2026-09-30T03:00:00Z'); // still the 29th in Moose Jaw
  const today = planToUtc(plan, { now: late, timeZone: 'America/Regina' });
  assert.deepEqual(today.date, { year: 2026, month: 9, day: 29 });
  assert.equal(today.waves[0].takeoff.toISOString(), '2026-09-29T14:00:00.000Z');
  const tomorrow = planToUtc(plan, { now: late, timeZone: 'America/Regina', day: 'tomorrow' });
  assert.deepEqual(tomorrow.date, { year: 2026, month: 9, day: 30 });
  assert.equal(tomorrow.waves[0].takeoff.toISOString(), '2026-09-30T14:00:00.000Z');
  const month = planToUtc(plan, { now: new Date('2026-09-30T20:00:00Z'), timeZone: 'America/Regina', day: 'tomorrow' });
  assert.deepEqual(month.date, { year: 2026, month: 10, day: 1 });
});

test('defaults: Today, and W1, W2 names', () => {
  const r = planToUtc([{ takeoff: '08:00', land: '09:30' }, { takeoff: '10:00', land: '11:30' }], { now: NOW, timeZone: 'America/Regina' });
  assert.deepEqual(r.date, { year: 2026, month: 9, day: 29 });
  assert.deepEqual(r.waves.map((w) => w.name), ['W1', 'W2']);
  assert.equal(r.zone, 'CST');
  assert.equal(r.problem, null);
});

test('now and the time zone are required: without them nothing is guessed', () => {
  const plan = [{ takeoff: '08:00', land: '09:30' }, { takeoff: '10:00', land: '11:30' }];
  for (const opts of [{}, { now: NOW }, { timeZone: 'America/Regina' }, { now: NOW, timeZone: 'Not/AZone' }, { now: new Date('x'), timeZone: 'America/Regina' }, { now: '2026-09-29', timeZone: 'America/Regina' }]) {
    const r = planToUtc(plan, opts);
    assert.deepEqual(r.waves, [], JSON.stringify(opts));
    assert.deepEqual(r.skipped.map((k) => k.name), ['W1', 'W2']);
    assert.ok(r.problem && r.skipped.every((k) => k.problem === r.problem));
  }
  assert.match(planToUtc(plan, { timeZone: 'America/Regina' }).problem, /time now/);
  assert.match(planToUtc(plan, { now: NOW }).problem, /time zone/);
});

test('an evening wave is kept (V6 dropped it in Zulu mode, #7)', () => {
  const { waves } = planToUtc([{ takeoff: '20:30', land: '22:00' }], { now: NOW, timeZone: 'America/Regina' });
  assert.equal(waves[0].takeoff.toISOString(), '2026-09-30T02:30:00.000Z');
  assert.equal(waves[0].land.toISOString(), '2026-09-30T04:00:00.000Z');
});

test('a landing not after takeoff is the next day, as in V6', () => {
  const [w] = planToUtc([{ takeoff: '22:00', land: '01:30' }], { now: NOW, timeZone: 'America/Regina' }).waves;
  assert.equal(w.nextDay, true);
  assert.equal(w.land.toISOString(), '2026-09-30T07:30:00.000Z');
  assert.equal(planToUtc([{ takeoff: '08:00', land: '09:00' }], { now: NOW, timeZone: 'America/Regina' }).waves[0].nextDay, false);
});

test('at most 5 waves; a wave without two readable times is skipped and named', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ takeoff: `${String(6 + i).padStart(2, '0')}:00`, land: `${String(7 + i).padStart(2, '0')}:00` }));
  assert.equal(MAX_WAVES, 5);
  assert.equal(planToUtc(many, { now: NOW, timeZone: 'America/Regina' }).waves.length, 5);
  const r = planToUtc([{ takeoff: '08:00', land: '' }, { takeoff: '09:00', land: '10:00' }], { now: NOW, timeZone: 'America/Regina' });
  assert.equal(r.waves.length, 1);
  assert.equal(r.waves[0].name, 'W2', 'names follow the plan position');
  assert.deepEqual(r.skipped.map((s) => s.name), ['W1']);
  assert.deepEqual(planToUtc(undefined, { now: NOW, timeZone: 'America/Regina' }).waves, []);
});

test('waveWindow is takeoff to landing plus one hour (V6 lines 1441 to 1443)', () => {
  const [w] = planToUtc([{ takeoff: '13:00', land: '14:30' }], { now: NOW, timeZone: 'America/Regina' }).waves;
  const win = waveWindow(w);
  assert.equal(win.from.toISOString(), '2026-09-29T19:00:00.000Z');
  assert.equal(win.to.toISOString(), '2026-09-29T21:30:00.000Z');
});

// ---- Trigger presets, custom and the label -------------------------------------

test('presets: Local (MTCA) 2000 ft / 3 SM is the default, Cross-country is 3000 ft / 3 SM', () => {
  assert.deepEqual(triggerLimits(), { ceilingFt: 2000, visSm: 3 });
  assert.deepEqual(triggerLimits('local'), { ceilingFt: 2000, visSm: 3 });
  assert.deepEqual(triggerLimits('crossCountry'), { ceilingFt: 3000, visSm: 3 });
  assert.deepEqual(triggerLimits('nonsense'), { ceilingFt: 2000, visSm: 3 });
  assert.deepEqual(triggerLimits('local'), DEFAULT_LIMITS.home);
});

test('the label is built from the numbers used (D59) and matches wx for the presets', () => {
  assert.equal(describeTrigger({ ceilingFt: 2000, visSm: 3 }).label, 'Local (MTCA) 2000/3');
  assert.equal(describeTrigger({ ceilingFt: 3000, visSm: 3 }).label, 'Cross-country 3000/3');
  assert.equal(describeTrigger(triggerLimits('local')).label, HOME_TRIGGERS.local.label);
  assert.equal(describeTrigger(triggerLimits('crossCountry')).label, HOME_TRIGGERS.crossCountry.label);
  assert.equal(describeTrigger(undefined).label, 'Local (MTCA) 2000/3', 'nothing set means the default');
});

test('a hand-changed number reads as Custom, with the numbers in the label', () => {
  const c = describeTrigger({ ceilingFt: 2500, visSm: 3 });
  assert.equal(c.id, 'custom');
  assert.equal(c.name, 'Custom');
  assert.equal(c.label, 'Custom 2500/3');
  assert.equal(describeTrigger({ ceilingFt: 2000, visSm: 2.5 }).label, 'Custom 2000/2½');
  assert.equal(describeTrigger({ ceilingFt: 3000, visSm: 3 }).id, 'crossCountry', 'typing the preset numbers is the preset');
});

test('cleanLimits keeps settings in range and falls back per number', () => {
  assert.deepEqual(cleanLimits({ ceilingFt: 2500, visSm: 2.5 }), { ceilingFt: 2500, visSm: 2.5 });
  assert.deepEqual(cleanLimits({}), { ceilingFt: 2000, visSm: 3 });
  assert.deepEqual(cleanLimits({ ceilingFt: 'x', visSm: NaN }), { ceilingFt: 2000, visSm: 3 });
  assert.deepEqual(cleanLimits({ ceilingFt: 99999, visSm: 99 }), { ceilingFt: 10000, visSm: 10 });
  assert.deepEqual(cleanLimits({ ceilingFt: -5, visSm: -1 }), { ceilingFt: 0, visSm: 0 });
  assert.deepEqual(cleanLimits({ ceilingFt: 2549, visSm: 2.6 }), { ceilingFt: 2500, visSm: 2.5 }, 'to 100 ft and quarter miles');
});

// ---- Home call ----------------------------------------------------------------

const taf = (raw) => parseTaf(raw, { now: NOW, timeZone: 'America/Regina' });
const wavesAt = (...pairs) => planToUtc(pairs.map(([takeoff, land]) => ({ takeoff, land })), { now: NOW, timeZone: 'America/Regina' }).waves;
const LOCAL = triggerLimits('local');
const XC = triggerLimits('crossCountry');

test('each wave call equals wx homeAlternateTrigger over takeoff to landing + 1 h', () => {
  const t = taf(HOME_TAF.tempoFog);
  for (const w of wavesAt(['13:00', '14:30'], ['18:00', '19:30'], ['16:00', '17:00'])) {
    const direct = homeAlternateTrigger(t, { from: w.takeoff, to: new Date(w.land.getTime() + HOUR) }, LOCAL);
    const call = homeCall(w, t, LOCAL);
    assert.equal(call.status, direct.status);
    assert.deepEqual(call.result, direct);
  }
});

test('words for each status', () => {
  const [day] = wavesAt(['13:00', '14:30']); // 19:00Z to 20:30Z
  assert.equal(homeCall(day, taf(HOME_TAF.good), LOCAL).words, 'No alternate needed');
  assert.equal(homeCall(day, taf(HOME_TAF.ceiling2000), LOCAL).words, 'At the limit');
  assert.equal(homeCall(day, taf('TAF CYMJ 291740Z 2918/3006 22010KT 2SM BR OVC008'), LOCAL).words, 'ALTERNATE REQUIRED');
  assert.equal(homeCall(day, taf(HOME_TAF.unknownCeiling), LOCAL).words, "Can't tell");
  assert.equal(homeCall(day, null, LOCAL).words, 'No TAF');
  const cancelled = parseTaf(REAL.taf.CYMJ, { now: new Date('2026-09-30T03:00:00Z') });
  assert.equal(cancelled.cancelled, true);
  assert.equal(homeCall(day, cancelled, LOCAL).words, 'No TAF', 'a cancelled TAF is No TAF');
  const early = wavesAt(['06:00', '07:00'])[0]; // 12Z to 14Z, before the TAF starts
  assert.equal(homeCall(early, taf(HOME_TAF.good), LOCAL).words, "TAF doesn't cover the wave");
});

test('tone tells the screen how to colour the words without reading them', () => {
  const [w] = wavesAt(['13:00', '14:30']);
  assert.equal(homeCall(w, taf(HOME_TAF.good), LOCAL).tone, 'ok');
  assert.equal(homeCall(w, taf(HOME_TAF.ceiling2000), LOCAL).tone, 'at-limit');
  assert.equal(homeCall(w, taf('TAF CYMJ 291740Z 2918/3006 22010KT 2SM BR OVC008'), LOCAL).tone, 'required');
  assert.equal(homeCall(w, null, LOCAL).tone, 'unknown');
});

test('a TAF of 2500 ft: Local (MTCA) needs no alternate, Cross-country does', () => {
  const [w] = wavesAt(['13:00', '14:30']);
  const t = taf(HOME_TAF.ceiling2500);
  const local = homeCall(w, t, LOCAL);
  const xc = homeCall(w, t, XC);
  assert.equal(local.words, 'No alternate needed');
  assert.equal(xc.words, 'ALTERNATE REQUIRED');
  assert.equal(local.label, 'Local (MTCA) 2000/3');
  assert.equal(xc.label, 'Cross-country 3000/3');
  assert.match(xc.firstReason.text, /CEILING 2500 FT < 3000 FT/);
  assert.equal(homeCall(w, t, { ceilingFt: 2500, visSm: 3 }).label, 'Custom 2500/3');
  assert.equal(homeCall(w, t, { ceilingFt: 2500, visSm: 3 }).words, 'At the limit', 'exactly on 2500 is at the limit, not below');
});

test('the first reason names the airfield, the group and when it starts', () => {
  const [w] = wavesAt(['18:00', '19:30']); // 00:00Z to 01:30Z, window to 02:30Z
  const call = homeCall(w, taf(HOME_TAF.tempoFog), LOCAL);
  assert.equal(call.words, 'ALTERNATE REQUIRED');
  assert.equal(call.firstReason.text, 'CYMJ TEMPO CEILING 200 FT < 2000 FT from 00Z');
  assert.equal(call.firstReason.from.toISOString(), '2026-09-30T00:00:00.000Z');
});

test('the reason time is when the wave is first affected, never before takeoff', () => {
  // Low weather starts at 21Z (FM); the wave runs 20Z to 22:30Z so it starts being affected at 21Z.
  const [w] = wavesAt(['14:00', '15:30']);
  const call = homeCall(w, taf(HOME_TAF.lowFromEvening), LOCAL);
  assert.equal(call.words, 'ALTERNATE REQUIRED');
  assert.match(call.firstReason.text, /from 21Z$/);
  // A wave that starts after the low weather began is affected from takeoff.
  const [later] = wavesAt(['17:00', '18:00']); // 23Z
  assert.match(homeCall(later, taf(HOME_TAF.lowFromEvening), LOCAL).firstReason.text, /from 23Z$/);
});

test('minutes are shown when they are not zero', () => {
  const [w] = wavesAt(['14:00', '15:30']);
  const t = taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW100 FM292130 22010KT 2SM BR OVC008');
  assert.match(homeCall(w, t, LOCAL).firstReason.text, /from 2130Z$/);
});

test('the full list has every hit, at-limit piece and caution, worst first', () => {
  const [w] = wavesAt(['18:00', '19:30']);
  const call = homeCall(w, taf(HOME_TAF.tempoFog), LOCAL);
  assert.ok(call.details.length >= 2);
  assert.equal(call.details[0].level, 'below');
  assert.ok(call.details.some((d) => d.level === 'caution' && /FG/.test(d.text)));
  const [storm] = wavesAt(['16:00', '17:00']); // 22Z to 23Z, TEMPO VCTS from 22Z
  const stormy = homeCall(storm, taf(HOME_TAF.vicinityStorm), LOCAL);
  assert.equal(stormy.words, 'No alternate needed', 'a caution never changes the call');
  assert.equal(stormy.firstReason, null);
  assert.ok(stormy.details.some((d) => d.level === 'caution' && /THUNDERSTORM/.test(d.text)));
  const [limit] = wavesAt(['13:00', '14:30']);
  assert.deepEqual(homeCall(limit, taf(HOME_TAF.ceiling2000), LOCAL).details.map((d) => d.level), ['at-limit']);
  assert.match(homeCall(limit, taf(HOME_TAF.ceiling2000), LOCAL).firstReason.text, /AT LIMIT 2000 FT/);
});

test('problems the TAF reader listed come through', () => {
  const [w] = wavesAt(['13:00', '14:30']);
  const call = homeCall(w, taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN025 XYZZY'), LOCAL);
  assert.ok(call.problems.length > 0);
});

test('limits default to Local (MTCA) when none are passed', () => {
  const [w] = wavesAt(['13:00', '14:30']);
  assert.equal(homeCall(w, taf(HOME_TAF.ceiling2500)).words, 'No alternate needed');
  assert.equal(homeCall(w, taf(HOME_TAF.ceiling2500)).label, 'Local (MTCA) 2000/3');
});

// ---- Alternate calls ------------------------------------------------------------

const memoryBackend = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
};
const airfields = () => createAirfields({ store: createStore(memoryBackend()).scope('airfields') });

test('an alternate call equals wx assessAlternate over landing +/- 60 min with checkOptions', () => {
  const a = airfields();
  const t = taf(ALT_TAF.fog);
  for (const w of wavesAt(['13:00', '14:30'], ['17:00', '18:30'])) {
    const options = a.checkOptions('CYQR');
    const direct = assessAlternate(t, arrivalWindow([w.land]), options);
    const call = alternateCall(w, 'CYQR', t, options);
    assert.deepEqual(call.result, direct);
    assert.equal(call.icao, 'CYQR');
  }
});

test('alternate words: meets, below, at the limit, not covered, no TAF', () => {
  const a = airfields();
  const options = a.checkOptions('CYQR');
  const [w] = wavesAt(['13:00', '14:30']); // lands 20:30Z, window 19:30Z to 21:30Z
  assert.equal(alternateCall(w, 'CYQR', taf(ALT_TAF.good), options).words, 'Meets minima');
  assert.equal(alternateCall(w, 'CYQR', taf(ALT_TAF.fog), options).words, 'Below minima');
  assert.equal(alternateCall(w, 'CYQR', taf(ALT_TAF.ceiling700), options).words, 'Meets minima');
  assert.equal(alternateCall(w, 'CYQR', taf('TAF CYQR 291740Z 2918/3018 25015KT P6SM BKN006'), options).words, 'At the limit');
  assert.equal(alternateCall(w, 'CYQR', null, options).words, 'No TAF');
  assert.equal(alternateCall(wavesAt(['06:00', '07:00'])[0], 'CYQR', taf(ALT_TAF.good), options).words, "TAF doesn't cover the arrival");
  assert.equal(alternateCall(w, 'CYQR', taf('TAF CYQR 291740Z 2918/3018 25015KT P6SM OVC///'), options).words, "Can't tell");
});

test('#4: an alternate below its minima shows below, and says which minima were used', () => {
  const a = airfields();
  const [w] = wavesAt(['17:00', '18:00']); // lands 00:00Z, fog still there at 23Z
  const call = alternateCall(w, 'CYQR', taf(ALT_TAF.fog), a.checkOptions('CYQR'));
  assert.equal(call.words, 'Below minima');
  assert.equal(call.tone, 'below');
  assert.match(call.firstReason.text, /^CYQR /);
  assert.equal(call.minimaText, '600-2');
});

test('approaches not set: checked against 600-2 and says so (D95)', () => {
  const a = airfields();
  const [w] = wavesAt(['13:00', '14:30']);
  const call = alternateCall(w, 'CYQR', taf(ALT_TAF.good), a.checkOptions('CYQR'));
  assert.equal(call.note, 'Approaches not set: checked against 600-2');
  a.update({ fields: { CYQR: { approach: 'non-precision' } } });
  const set = alternateCall(w, 'CYQR', taf(ALT_TAF.good), a.checkOptions('CYQR'));
  assert.equal(set.note, null);
  assert.equal(set.minimaText, '800-2 (or 900-1½, 1000-1)');
});

test('alternate warnings (GNSS separation) come through', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'gnss-only' }, CYMJ: { gnssPlan: true } } });
  const [w] = wavesAt(['13:00', '14:30']);
  const call = alternateCall(w, 'CYQR', taf(ALT_TAF.good), a.checkOptions('CYQR'));
  assert.ok(call.warnings.length > 0);
  assert.match(call.warnings[0], /GNSS/);
});

test('minima read as the Airfields panel writes them', () => {
  assert.equal(minimaText([{ ceilingFt: 600, visSm: 2 }]), '600-2');
  assert.equal(minimaText([{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }]), '600-2 (or 700-1½)');
  assert.equal(minimaText(null), '');
  assert.equal(descentText({ meaFt: 4500, visSm: 3 }), 'Visual descent from MEA 4,500 ft, 3 SM');
  assert.equal(descentText({ meaFt: null, visSm: 3 }), 'Visual descent, needs MEA');
});

// ---- The whole plan ---------------------------------------------------------------

test('waveCalls: a home call and every alternate for each wave, with how many alternates meet', () => {
  const a = airfields(); // CYMJ home, alternates CYQR, CYYN, CYXE
  const waves = wavesAt(['13:00', '14:30'], ['17:00', '18:00']);
  const tafs = {
    CYMJ: taf(HOME_TAF.ceiling2500),
    CYQR: taf(ALT_TAF.fog),
    CYYN: taf('TAF CYYN 291740Z 2918/3006 27010KT P6SM BKN040'),
    // CYXE has no TAF
  };
  const plan = waveCalls({ waves, airfields: a, tafs, limits: XC });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].wave, waves[0]);
  assert.equal(plan[0].home.words, 'ALTERNATE REQUIRED');
  assert.deepEqual(plan[0].alternates.map((c) => c.icao), ['CYQR', 'CYYN', 'CYXE']);
  assert.deepEqual(plan[0].alternates.map((c) => c.words), ['Below minima', 'Meets minima', 'No TAF']);
  assert.equal(plan[0].meeting, 1);
  assert.equal(plan[0].of, 3);
  assert.equal(plan[1].alternates[0].words, 'Below minima');
  assert.equal(plan[1].meeting, 1);
});

test('waveCalls with nothing given starts from sensible defaults', () => {
  assert.deepEqual(waveCalls({ waves: [], airfields: airfields() }), []);
  const [w] = wavesAt(['13:00', '14:30']);
  const [p] = waveCalls({ waves: [w], airfields: airfields() });
  assert.equal(p.home.words, 'No TAF');
  assert.equal(p.home.label, 'Local (MTCA) 2000/3');
  assert.equal(p.meeting, 0);
});

// ---- Review fixes ----------------------------------------------------------------------

test('a wave the TAF only partly covers still shows the hit it knows about', () => {
  // Wave 21:00 to 01:00 local = 03Z to 07Z (window to 08Z); the TAF ends at 06Z and has low cloud from 04Z.
  const t = taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW100 FM300400 22010KT 1SM OVC003');
  const [w] = wavesAt(['21:00', '01:00']);
  const call = homeCall(w, t, LOCAL);
  assert.equal(call.status, 'not-covered');
  assert.equal(call.words, "TAF doesn't cover the wave");
  assert.equal(call.hasHit, true);
  assert.equal(call.firstReason.text, 'CYMJ CEILING 300 FT < 2000 FT from 04Z');
});

test('an alternate the TAF only partly covers shows its hit too', () => {
  const a = airfields();
  const t = taf('TAF CYQR 291740Z 2918/3006 25015KT P6SM FEW080 FM300300 25015KT 1SM OVC003');
  const [w] = wavesAt(['20:00', '21:00']); // lands 03:00Z, window 02Z to 04Z... TAF valid to 06Z
  const late = { ...w, land: new Date('2026-09-30T05:30:00Z') }; // window to 06:30Z, past the TAF's end
  const call = alternateCall(late, 'CYQR', t, a.checkOptions('CYQR'));
  assert.equal(call.status, 'not-covered');
  assert.equal(call.hasHit, true);
  assert.match(call.firstReason.text, /^CYQR CEILING 300 FT < 600 FT from 0430Z$/);
});

test('an unknown call says why: what the TAF covers against what the wave needs', () => {
  const t = taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW100');
  const [w] = wavesAt(['21:00', '01:30']); // lands 07:30Z
  assert.equal(homeCall(w, t, LOCAL).why, 'TAF valid to 06Z; wave ends 0730Z');
  const early = wavesAt(['06:00', '07:00'])[0]; // starts 12Z, TAF starts 18Z
  assert.equal(homeCall(early, t, LOCAL).why, 'TAF valid from 18Z; wave starts 12Z');
  assert.equal(homeCall(wavesAt(['13:00', '14:30'])[0], t, LOCAL).why, null, 'a known call needs no reason');
});

test("incomplete says a ceiling or visibility can't be read, with the first problem when there is one", () => {
  const [w] = wavesAt(['13:00', '14:30']);
  const plain = homeCall(w, taf(HOME_TAF.unknownCeiling), LOCAL);
  assert.equal(plain.status, 'incomplete');
  assert.equal(plain.why, "A ceiling or visibility in the TAF can't be read");
  const withProblem = homeCall(w, taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN025 XYZZY'), LOCAL);
  assert.equal(withProblem.why, `A ceiling or visibility in the TAF can't be read: ${withProblem.problems[0]}`);
  const alt = alternateCall(w, 'CYQR', taf('TAF CYQR 291740Z 2918/3018 25015KT P6SM OVC///'), airfields().checkOptions('CYQR'));
  assert.equal(alt.why, "A ceiling or visibility in the TAF can't be read");
});

test('an alternate exactly at its minima counts as meeting in waveCalls', () => {
  const a = airfields();
  const [w] = wavesAt(['13:00', '14:30']);
  const tafs = { CYMJ: taf(HOME_TAF.good), CYQR: taf('TAF CYQR 291740Z 2918/3018 25015KT P6SM BKN006') };
  const [p] = waveCalls({ waves: [w], airfields: a, tafs });
  assert.equal(p.alternates[0].status, 'at-limit');
  assert.equal(p.meeting, 1);
  assert.equal(p.of, 3);
});

test('a visual-descent alternate names the descent, not 600-2', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'no-ifr', meaFt: 4500 } } });
  const [w] = wavesAt(['13:00', '14:30']);
  const call = alternateCall(w, 'CYQR', taf(ALT_TAF.good), a.checkOptions('CYQR'));
  assert.equal(call.minimaText, 'Visual descent from MEA 4,500 ft, 3 SM');
  assert.equal(call.note, null);
});
