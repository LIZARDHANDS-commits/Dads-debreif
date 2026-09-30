// Tests for src/modules/sof/cautions.js: which cautions the banner lists, which
// are new, acknowledging, and when one comes back (SPEC-sof, "Caution banner",
// SOF-4). Reports come from tests/fixtures/sof/reports.js; every weather answer
// under test is wx's, so the expected reasons are taken from wx, not typed twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { checkConditions } from '../../../src/wx/limits.js';
import { homeAlternateTrigger, assessAlternate } from '../../../src/wx/alternates.js';
import { cardModel } from '../../../src/modules/sof/cards.js';
import { homeCall, alternateCall, waveCalls } from '../../../src/modules/sof/waves.js';
import {
  ackDay, emptyAcks, readAcks, cautionList, evaluate, acknowledge, acknowledgeAll, tafResultsOfWaves, tafCautionsForBanner, bannerWindow, bannerNotEndedBefore,
} from '../../../src/modules/sof/cautions.js';
import { METAR, HOME_TAF, ALT_TAF } from '../../fixtures/sof/reports.js';

const ZONE = 'America/Regina'; // Moose Jaw, CST all year (UTC-6)
const LIMITS = { ceilingFt: 2000, visSm: 3 };
const NOW = new Date('2026-09-29T18:42:00Z'); // 12:42 in Moose Jaw, 29 Sep
const at = (day, hh, mm = 0) => new Date(Date.UTC(2026, 8, day, hh, mm));

const metarEntry = (raw, now = NOW) => ({ raw, report: parseMetar(raw, { now }), source: 'metno', status: 'fresh' });
const tafEntry = (raw, now = NOW) => ({ raw, report: parseTaf(raw, { now }), source: 'metno', status: 'fresh' });
const card = (icao, metar, now = NOW, role = icao === 'CYMJ' ? 'HOME' : 'ALT') =>
  cardModel({ icao, name: icao, role, metar: metar ? metarEntry(metar, now) : null, limits: LIMITS, now });
const cardsOf = (...pairs) => pairs.map(([icao, metar, now]) => card(icao, metar, now));
const reasonsOf = (metar, limits = LIMITS) => checkConditions(parseMetar(metar, { now: NOW }).conditions, limits).reasons;

const homeTaf = (raw) => parseTaf(raw, { now: NOW });
const homeResult = (raw, window = { from: at(29, 18), to: at(30, 6) }) => homeAlternateTrigger(homeTaf(raw), window, LIMITS);
const altResult = (raw, window = { from: at(29, 18), to: at(30, 6) }) => assessAlternate(homeTaf(raw), window, { minima: [{ ceilingFt: 600, visSm: 2 }] });

// ---- Which reports raise a caution ------------------------------------------------------

test('a METAR below the limits raises one caution per reason, in wx\'s words', () => {
  const list = cautionList({ cards: cardsOf(['CYMJ', METAR.belowLimits]) });
  assert.deepEqual(list.map((c) => c.reason), reasonsOf(METAR.belowLimits));
  assert.deepEqual(list.map((c) => c.reason), ['CEILING 1500 FT < 2000 FT', 'VIS 2 SM < 3 SM']);
  for (const c of list) {
    assert.equal(c.icao, 'CYMJ');
    assert.equal(c.source, 'METAR');
    assert.equal(c.level, 'below');
    assert.equal(c.levelWords, 'Below limits');
  }
});

test('at the limit, unknown, within limits and information-only weather raise nothing (D57, D58)', () => {
  for (const metar of [METAR.onLimits, METAR.noCeilingGroup, METAR.fresh, METAR.vicinityShowers]) {
    assert.deepEqual(cautionList({ cards: cardsOf(['CYMJ', metar]) }), [], metar);
  }
});

test('at the limit on one thing but below on another lists only the below reason', () => {
  // Ceiling 2000 ft is exactly on Local's limit; 2 SM is below it.
  const list = cautionList({ cards: cardsOf(['CYMJ', 'METAR CYMJ 291800Z 27005KT 2SM BR BKN020 10/08 A2995']) });
  assert.deepEqual(list.map((c) => c.reason), ['VIS 2 SM < 3 SM']);
});

test('each D58 caution in a METAR raises, with wx\'s reason', () => {
  const table = {
    'thunderstorm in the vicinity': [METAR.thunderstorm, ['THUNDERSTORM / SEVERE WX (VCTS)', 'CB/TCU (FEW040CB)']],
    'towering cumulus': ['METAR CYMJ 291800Z 22008KT 15SM FEW040TCU BKN100 22/14 A2980', ['CB/TCU (FEW040TCU)']],
    'heavy thunderstorm with hail': ['METAR CYMJ 291800Z 36020G30KT 3/4SM +TSRAGR BKN015CB OVC030 18/16 A2975', null],
    'freezing fog': ['METAR CYMJ 291800Z 01010KT 1/2SM FZFG VV002 M03/M03 A3020', null],
    'freezing rain and ice pellets': ['METAR CYMJ 291800Z 27005KT 2 1/2SM -FZRAPL OVC012 M01/M02 A2995', null],
    'fog at the station': ['METAR CYMJ 291800Z 00000KT 5SM FG SKC 08/08 A3001', ['SIGNIFICANT WX (FG)']],
    'funnel cloud': ['METAR CYMJ 291800Z 22008KT 15SM +FC FEW040 22/14 A2980', null],
    'blowing snow': ['METAR CYMJ 291800Z 36025KT 15SM BLSN FEW040 M10/M14 A2980', ['SIGNIFICANT WX (BLSN)']],
  };
  for (const [name, [metar, expected]] of Object.entries(table)) {
    const list = cautionList({ cards: cardsOf(['CYMJ', metar]) }).filter((c) => c.level === 'caution');
    const wx = reasonsOf(metar).filter((r) => !/^(CEILING|VIS) /.test(r));
    assert.ok(wx.length > 0, `${name}: wx itself must call it a caution`);
    assert.deepEqual(list.map((c) => c.reason), wx, name);
    if (expected) assert.deepEqual(wx, expected, name);
    assert.ok(list.every((c) => c.levelWords === 'Caution' && c.source === 'METAR'), name);
  }
});

test('a METAR both below limits and with a caution lists both, below first', () => {
  const list = cautionList({ cards: cardsOf(['CYMJ', METAR.foggy]) });
  assert.equal(list[0].level, 'below');
  assert.ok(list.some((c) => c.level === 'caution' && c.reason.startsWith('SIGNIFICANT WX')));
  assert.deepEqual(list.map((c) => c.level), [...list.map((c) => c.level)].sort((a, b) => (a === 'below' ? -1 : 1) - (b === 'below' ? -1 : 1)));
});

test('an alternate is checked by the card against its own minima', () => {
  // 700 ft is below Local\'s 2000 but meets the alternate\'s 600-2.
  const alt = cardModel({ icao: 'CYQR', role: 'ALT', metar: metarEntry('METAR CYQR 291800Z 25015KT 10SM BKN007 12/08 A2990'), options: { minima: [{ ceilingFt: 600, visSm: 2 }] }, now: NOW });
  assert.deepEqual(cautionList({ cards: [alt] }), []);
  const low = cardModel({ icao: 'CYQR', role: 'ALT', metar: metarEntry('METAR CYQR 291800Z 25015KT 10SM BKN005 12/08 A2990'), options: { minima: [{ ceilingFt: 600, visSm: 2 }] }, now: NOW });
  assert.deepEqual(cautionList({ cards: [low] }).map((c) => c.reason), ['CEILING 500 FT < 600 FT']);
});

test('no cards, a missing METAR or a NIL METAR raise nothing and do not throw', () => {
  assert.deepEqual(cautionList({}), []);
  assert.deepEqual(cautionList({ cards: [] , tafs: [] }), []);
  assert.deepEqual(cautionList({ cards: [card('CYMJ', null)] }), []);
  assert.deepEqual(cautionList({ cards: [card('CYMJ', 'METAR CYMJ 291800Z NIL')] }), []);
  assert.deepEqual(cautionList({ cards: [null, undefined, {}], tafs: [null, {}, { icao: 'CYMJ' }] }), []);
});

test('a stale METAR still raises (a limit is never hidden) but is marked stale in words', () => {
  const late = at(29, 20, 30);
  const c = cautionList({ cards: [card('CYMJ', METAR.belowLimits, late)] })[0];
  assert.equal(c.stale, true);
  assert.match(c.text, /STALE report/);
  const fresh = cautionList({ cards: cardsOf(['CYMJ', METAR.belowLimits]) })[0];
  assert.equal(fresh.stale, false);
  assert.doesNotMatch(fresh.text, /STALE/);
});

// ---- Keys and words --------------------------------------------------------------------------

test('a METAR caution\'s key is airfield, METAR and wx\'s reason, and has no report time', () => {
  const [c] = cautionList({ cards: cardsOf(['CYQR', METAR.thunderstorm.replace('CYMJ', 'CYQR')]) });
  assert.equal(c.key, 'CYQR|METAR|THUNDERSTORM / SEVERE WX (VCTS)');
  assert.equal(c.text, 'Caution: CYQR METAR 1800Z: THUNDERSTORM / SEVERE WX (VCTS)');
});

test('the same weather in the next METAR has the same keys', () => {
  const a = cautionList({ cards: cardsOf(['CYMJ', METAR.thunderstorm]) });
  const later = at(29, 19, 40);
  const b = cautionList({ cards: [card('CYMJ', METAR.thunderstorm.replace('291800Z', '291900Z'), later)] });
  assert.ok(a.length > 0);
  assert.deepEqual(b.map((c) => c.key), a.map((c) => c.key));
  assert.notEqual(b[0].text, a[0].text, 'the words carry each report\'s own time');
});

test('the same reason at another airfield, or in the TAF instead of the METAR, is a different key', () => {
  const home = cautionList({ cards: cardsOf(['CYMJ', METAR.thunderstorm]) });
  const alt = cautionList({ cards: cardsOf(['CYQR', METAR.thunderstorm.replace('CYMJ', 'CYQR')]) });
  const taf = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.vicinityStorm) }] });
  const keys = [...home, ...alt, ...taf].map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('a TAF caution\'s key holds the group and its times, and words say TAF, the group and the times', () => {
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.vicinityStorm) }] });
  const storm = list.find((c) => c.reason.startsWith('THUNDERSTORM'));
  assert.equal(storm.source, 'TAF');
  assert.equal(storm.group, 'TEMPO');
  assert.equal(+storm.from, +at(29, 22));
  assert.equal(+storm.to, +at(30, 2));
  assert.equal(storm.key, 'CYMJ|TAF|TEMPO|2026-09-29T22:00Z|2026-09-30T02:00Z|THUNDERSTORM / SEVERE WX (VCTS)');
  assert.equal(storm.text, 'Caution: CYMJ TAF TEMPO 29/22Z–30/02Z: THUNDERSTORM / SEVERE WX (VCTS)');
  assert.ok(list.some((c) => c.reason === 'CB/TCU (FEW040CB)'));
  assert.equal(list.length, 2);
});

test('a TAF piece below the limits raises with its limit reasons, and at-limit reasons are left out', () => {
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.lowFromEvening) }] });
  const below = list.filter((c) => c.level === 'below');
  assert.deepEqual(below.map((c) => c.reason), ['CEILING 800 FT < 2000 FT', 'VIS 2 SM < 3 SM']);
  assert.equal(below[0].group, 'PREVAILING');
  assert.equal(below[0].text, 'Below limits: CYMJ TAF PREVAILING 29/21Z–30/06Z: CEILING 800 FT < 2000 FT');
  assert.equal(+below[0].from, +at(29, 21));
  assert.equal(+below[0].to, +at(30, 6));
  const onLimit = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.ceiling2000) }] });
  assert.deepEqual(onLimit, [], 'at the limit is not a caution');
});

test('TEMPO fog: below-limit reasons and the fog caution are both listed for the group', () => {
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.tempoFog) }] });
  assert.deepEqual(list.map((c) => [c.level, c.group, c.reason]), [
    ['below', 'TEMPO', 'CEILING 200 FT < 2000 FT'],
    ['below', 'TEMPO', 'VIS 1/2 SM < 3 SM'],
    ['caution', 'TEMPO', 'SIGNIFICANT WX (FG)'],
  ]);
});

test('PROB groups say so in the group name', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC PROB30 TEMPO 2922/3002 3SM TSRA BKN030CB';
  const group = (list) => list.map((c) => c.group);
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(raw) }] });
  assert.ok(list.length > 0);
  assert.deepEqual([...new Set(group(list))], ['PROB30 TEMPO']);
  const plain = cautionList({ tafs: [{ icao: 'CYMJ', result: homeResult(raw.replace('PROB30 TEMPO', 'PROB40')) }] });
  assert.deepEqual([...new Set(group(plain))], ['PROB40']);
});

test('an alternate\'s TAF below its minima raises (#4)', () => {
  const list = cautionList({ tafs: [{ icao: 'CYQR', result: altResult(ALT_TAF.fog, { from: at(29, 22), to: at(30, 1) }) }] });
  const below = list.filter((c) => c.level === 'below');
  assert.deepEqual(below.map((c) => c.reason), ['CEILING 200 FT < 600 FT', 'VIS <1/4 SM < 2 SM']);
  assert.ok(below.every((c) => c.icao === 'CYQR' && c.source === 'TAF' && c.group === 'PREVAILING'));
  assert.deepEqual(cautionList({ tafs: [{ icao: 'CYQR', result: altResult(ALT_TAF.good) }] }), []);
});

test('the same TAF piece seen through two overlapping waves is listed once', () => {
  const a = homeResult(HOME_TAF.vicinityStorm, { from: at(29, 20), to: at(30, 0) });
  const b = homeResult(HOME_TAF.vicinityStorm, { from: at(29, 23), to: at(30, 3) });
  const both = cautionList({ tafs: [{ icao: 'CYMJ', result: a }, { icao: 'CYMJ', result: b }] });
  const one = cautionList({ tafs: [{ icao: 'CYMJ', result: a }] });
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((c) => c.key), one.map((c) => c.key));
});

test('a TEMPO wx splits under a changing forecast is one caution over the whole group', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC BECMG 2921/2923 SCT050 TEMPO 2920/3000 VCTS';
  const result = homeResult(raw);
  assert.ok(result.cautions.length > 1, 'wx reports it in more than one piece');
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result }] });
  assert.equal(list.length, 1);
  assert.equal(+list[0].from, +at(29, 20));
  assert.equal(+list[0].to, +at(30, 0));
  assert.equal(list[0].key, 'CYMJ|TAF|TEMPO|2026-09-29T20:00Z|2026-09-30T00:00Z|THUNDERSTORM / SEVERE WX (VCTS)');
});

test('a TAF result that has no answer (no TAF, no time) raises nothing', () => {
  const none = homeAlternateTrigger(null, { from: at(29, 20), to: at(30, 0) }, LIMITS);
  assert.deepEqual(cautionList({ tafs: [{ icao: 'CYMJ', result: none }] }), []);
});

test('the results wx already gave the wave calls can be listed as they are', () => {
  const wave = { name: 'W1', takeoff: at(29, 20), land: at(29, 22) };
  const tafs = { CYMJ: homeTaf(HOME_TAF.vicinityStorm), CYQR: homeTaf(ALT_TAF.fog.replace('FM300000', 'FM300300')) };
  const airfields = {
    home: () => ({ icao: 'CYMJ' }),
    alternates: () => [{ icao: 'CYQR' }],
    checkOptions: () => ({ minima: [{ ceilingFt: 600, visSm: 2 }] }),
  };
  const calls = waveCalls({ waves: [wave], airfields, tafs, limits: LIMITS });
  const results = tafResultsOfWaves(calls, 'CYMJ');
  assert.deepEqual(results.map((r) => r.icao), ['CYMJ', 'CYQR']);
  assert.equal(results[0].result, calls[0].home.result);
  assert.equal(results[1].result, calls[0].alternates[0].result);
  const list = cautionList({ tafs: results });
  assert.ok(list.some((c) => c.icao === 'CYMJ' && c.group === 'TEMPO'));
  assert.ok(list.some((c) => c.icao === 'CYQR' && c.level === 'below'));
  assert.deepEqual(tafResultsOfWaves(undefined, 'CYMJ'), []);
  // homeCall and alternateCall (the calls waveCalls is made of) carry the same result.
  assert.equal(homeCall(wave, tafs.CYMJ, LIMITS).result.status, results[0].result.status);
  assert.equal(alternateCall(wave, 'CYQR', tafs.CYQR).result.status, results[1].result.status);
});

test('the list is in a fixed order: below first, then airfield order given, METAR before TAF', () => {
  const cards = [card('CYQR', METAR.thunderstorm.replace('CYMJ', 'CYQR')), card('CYMJ', METAR.belowLimits)];
  const tafs = [{ icao: 'CYMJ', result: homeResult(HOME_TAF.vicinityStorm) }];
  const list = cautionList({ cards, tafs });
  assert.deepEqual(list.map((c) => `${c.level} ${c.icao} ${c.source}`), [
    'below CYMJ METAR', 'below CYMJ METAR',
    'caution CYQR METAR', 'caution CYQR METAR',
    'caution CYMJ TAF', 'caution CYMJ TAF',
  ]);
  assert.deepEqual(cautionList({ cards, tafs }).map((c) => c.key), list.map((c) => c.key), 'same input, same order');
});

test('every caution is words: a level word, the airfield, the report and the reason', () => {
  const list = cautionList({
    cards: cardsOf(['CYMJ', METAR.foggy]),
    tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.tempoFog) }],
  });
  assert.ok(list.length > 3);
  for (const c of list) {
    assert.match(c.text, /^(Below limits|Caution): CYMJ (METAR \d{4}Z|TAF [A-Z0-9 ]+ \d{2}\/\d{2}Z–\d{2}\/\d{2}Z): \S/);
    assert.ok(c.text.includes(c.reason));
  }
});

// ---- The day --------------------------------------------------------------------------------------

test('the acknowledgement day is the home zone\'s calendar day, never this machine\'s', () => {
  assert.equal(ackDay(at(30, 5, 59), ZONE), '2026-09-29', '23:59 in Moose Jaw');
  assert.equal(ackDay(at(30, 6, 0), ZONE), '2026-09-30');
  assert.equal(ackDay(at(30, 3), 'Pacific/Kiritimati'), '2026-09-30');
  assert.equal(ackDay(NOW, 'Not/AZone'), null);
  assert.equal(ackDay(NOW, undefined), null);
  assert.equal(ackDay(undefined, ZONE), null);
  assert.equal(ackDay(new Date('nope'), ZONE), null);
});

test('a new store is empty, plain and survives JSON', () => {
  const acks = emptyAcks({ now: NOW, timeZone: ZONE });
  assert.deepEqual(acks, { version: 1, day: '2026-09-29', keys: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(acks)), acks);
});

test('readAcks keeps today\'s acknowledgements and drops anything else', () => {
  const ctx = { now: NOW, timeZone: ZONE };
  const good = { version: 1, day: '2026-09-29', keys: ['CYMJ|METAR|X'] };
  assert.deepEqual(readAcks(good, ctx), good);
  assert.notEqual(readAcks(good, ctx), good, 'a copy, so the stored object is never changed');
  const empty = emptyAcks(ctx);
  assert.deepEqual(readAcks({ ...good, day: '2026-09-28' }, ctx), empty, 'yesterday\'s');
  assert.deepEqual(readAcks({ ...good, version: 2 }, ctx), empty);
  for (const bad of [null, undefined, 'x', 7, [], {}, { version: 1 }, { version: 1, day: '2026-09-29' },
    { version: 1, day: '2026-09-29', keys: 'CYMJ' }, { version: 1, day: '2026-09-29', keys: [1] },
    { version: 1, day: 20260929, keys: [] }, { version: 1, day: '2026-09-29', keys: ['a'.repeat(1000)] },
    { version: 1, day: '2026-09-29', keys: Array.from({ length: 5000 }, (_, i) => `k${i}`) }]) {
    assert.deepEqual(readAcks(bad, ctx), empty, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('with no readable day nothing carries over from a stored day, and none is invented', () => {
  const stored = { version: 1, day: '2026-09-29', keys: ['CYMJ|METAR|X'] };
  assert.deepEqual(readAcks(stored, { now: NOW, timeZone: 'Not/AZone' }), { version: 1, day: null, keys: [] });
  assert.deepEqual(readAcks(stored, {}), { version: 1, day: null, keys: [] });
});

// ---- New, acknowledged, and coming back ---------------------------------------------------------------

const storm = () => cardsOf(['CYMJ', METAR.thunderstorm]);
const stormAt = (hh, mm = 0) => [card('CYMJ', METAR.thunderstorm.replace('291800Z', `29${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}Z`), at(29, hh, mm + 10))];
const ctx = (now = NOW) => ({ now, timeZone: ZONE });

test('everything is new until acknowledged; nothing new means no banner', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  assert.equal(first.cautions.length, 2);
  assert.deepEqual(first.fresh.map((c) => c.key), first.cautions.map((c) => c.key));
  assert.deepEqual(first.acknowledged, []);
  assert.ok(first.cautions.every((c) => c.acknowledged === false));
  const quiet = evaluate({ cards: cardsOf(['CYMJ', METAR.fresh]), ...ctx() });
  assert.deepEqual([quiet.cautions, quiet.fresh, quiet.acknowledged], [[], [], []]);
});

test('acknowledging one clears that one and leaves the rest new', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  const acks = acknowledge(first.acks, first.cautions[0].key);
  const next = evaluate({ cards: storm(), acks, ...ctx() });
  assert.deepEqual(next.acknowledged.map((c) => c.key), [first.cautions[0].key]);
  assert.deepEqual(next.fresh.map((c) => c.key), [first.cautions[1].key]);
  assert.equal(next.cautions.length, 2, 'the card still shows every caution');
  assert.equal(next.cautions[0].acknowledged, true);
  assert.equal(next.cautions[1].acknowledged, false);
});

test('acknowledging all clears the banner', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const next = evaluate({ cards: storm(), acks, ...ctx() });
  assert.deepEqual(next.fresh, []);
  assert.equal(next.acknowledged.length, 2);
});

test('acknowledge does not change what it was given, ignores unknown input, and adds a key once', () => {
  const start = emptyAcks(ctx());
  const one = acknowledge(start, 'CYMJ|METAR|X');
  assert.deepEqual(start.keys, []);
  assert.deepEqual(one.keys, ['CYMJ|METAR|X']);
  assert.deepEqual(acknowledge(one, 'CYMJ|METAR|X').keys, ['CYMJ|METAR|X']);
  assert.deepEqual(acknowledge(one, 42).keys, ['CYMJ|METAR|X']);
  assert.deepEqual(acknowledge(one, undefined).keys, ['CYMJ|METAR|X']);
  assert.deepEqual(acknowledgeAll(one, [{ key: 'A' }, { key: 'A' }, null, {}]).keys, ['CYMJ|METAR|X', 'A']);
  assert.deepEqual(acknowledgeAll(one, undefined).keys, ['CYMJ|METAR|X']);
});

test('the same caution in the next report does not re-raise, however many reports it lasts (#5, SOF-4)', () => {
  let acks = acknowledgeAll(evaluate({ cards: storm(), ...ctx() }).acks, evaluate({ cards: storm(), ...ctx() }).fresh);
  for (const hh of [19, 20, 21]) {
    const r = evaluate({ cards: stormAt(hh), acks, ...ctx(at(29, hh, 20)) });
    assert.deepEqual(r.fresh, [], `${hh}00Z`);
    assert.equal(r.acknowledged.length, 2);
    acks = r.acks;
  }
});

test('a new caution at the same airfield raises, and the old one stays acknowledged', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const worse = cardsOf(['CYMJ', 'METAR CYMJ 291900Z 22008KT 15SM VCTS FZRA FEW040CB 22/14 A2980']);
  const r = evaluate({ cards: worse, acks, ...ctx(at(29, 19, 10)) });
  assert.deepEqual(r.fresh.map((c) => c.reason), ['SIGNIFICANT WX (FZRA)']);
  assert.equal(r.acknowledged.length, 2);
});

test('a new caution at another airfield raises', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const both = [...storm(), card('CYQR', METAR.thunderstorm.replace('CYMJ', 'CYQR'))];
  const r = evaluate({ cards: both, acks, ...ctx() });
  assert.deepEqual(new Set(r.fresh.map((c) => c.icao)), new Set(['CYQR']));
});

test('an acknowledged caution that clears and later returns is new again (SOF-4)', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  let acks = acknowledgeAll(first.acks, first.fresh);
  const cleared = evaluate({ cards: cardsOf(['CYMJ', METAR.fresh.replace('291800Z', '291900Z')]), acks, ...ctx(at(29, 19, 20)) });
  assert.deepEqual(cleared.cautions, []);
  assert.deepEqual(cleared.acks.keys, [], 'the acknowledgement goes when the caution does');
  acks = cleared.acks;
  const back = evaluate({ cards: stormAt(20), acks, ...ctx(at(29, 20, 20)) });
  assert.equal(back.fresh.length, 2);
  assert.deepEqual(back.acknowledged, []);
});

test('the same holds for a TAF caution that leaves the forecast and comes back', () => {
  const tafs = (raw) => [{ icao: 'CYMJ', result: homeResult(raw) }];
  const first = evaluate({ tafs: tafs(HOME_TAF.vicinityStorm), ...ctx() });
  assert.equal(first.fresh.length, 2);
  const acks = acknowledgeAll(first.acks, first.fresh);
  const same = evaluate({ tafs: tafs(HOME_TAF.vicinityStorm), acks, ...ctx() });
  assert.deepEqual(same.fresh, []);
  const gone = evaluate({ tafs: tafs(HOME_TAF.good), acks: same.acks, ...ctx() });
  assert.deepEqual(gone.acks.keys, []);
  assert.equal(evaluate({ tafs: tafs(HOME_TAF.vicinityStorm), acks: gone.acks, ...ctx() }).fresh.length, 2);
});

test('a re-issued TAF with the same group and times does not re-raise; moved times do', () => {
  const tafs = (raw) => [{ icao: 'CYMJ', result: homeResult(raw) }];
  const first = evaluate({ tafs: tafs(HOME_TAF.vicinityStorm), ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const reissued = HOME_TAF.vicinityStorm.replace('291740Z', '291940Z');
  assert.deepEqual(evaluate({ tafs: tafs(reissued), acks, ...ctx() }).fresh, []);
  const moved = HOME_TAF.vicinityStorm.replace('2922/3002', '2923/3003');
  assert.equal(evaluate({ tafs: tafs(moved), acks, ...ctx() }).fresh.length, 2);
});

test('a report that is missing is not a caution that cleared: the acknowledgement stays', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const lost = evaluate({ cards: [card('CYMJ', null)], acks, ...ctx() });
  assert.deepEqual(lost.cautions, []);
  assert.deepEqual(lost.acks.keys, acks.keys);
  assert.deepEqual(evaluate({ cards: storm(), acks: lost.acks, ...ctx() }).fresh, []);
  // A NIL METAR is the same, and so is a TAF that is gone.
  const nil = evaluate({ cards: [card('CYMJ', 'METAR CYMJ 291900Z NIL')], acks, ...ctx() });
  assert.deepEqual(nil.acks.keys, acks.keys);
  const tafAcks = acknowledgeAll(emptyAcks(ctx()), evaluate({ tafs: [{ icao: 'CYMJ', result: homeResult(HOME_TAF.vicinityStorm) }], ...ctx() }).fresh);
  const noTaf = evaluate({ tafs: [{ icao: 'CYMJ', result: homeAlternateTrigger(null, { from: at(29, 20), to: at(30, 0) }, LIMITS) }], acks: tafAcks, ...ctx() });
  assert.deepEqual(noTaf.acks.keys, tafAcks.keys);
});

test('a METAR clearing does not clear the TAF\'s acknowledgement, and the reverse', () => {
  const tafs = [{ icao: 'CYMJ', result: homeResult(HOME_TAF.vicinityStorm) }];
  const first = evaluate({ cards: storm(), tafs, ...ctx() });
  assert.equal(first.fresh.length, 4);
  const acks = acknowledgeAll(first.acks, first.fresh);
  const metarClear = evaluate({ cards: cardsOf(['CYMJ', METAR.fresh]), tafs, acks, ...ctx() });
  assert.equal(metarClear.acknowledged.length, 2);
  assert.equal(metarClear.acks.keys.length, 2);
  assert.ok(metarClear.acks.keys.every((k) => k.includes('|TAF|')));
});

test('acknowledgements last for the day in the home zone and are gone the next day', () => {
  const evening = at(30, 5, 30); // 23:30 on the 29th at home
  const first = evaluate({ cards: [card('CYMJ', METAR.thunderstorm.replace('291800Z', '300500Z'), evening)], ...ctx(evening) });
  const acks = acknowledgeAll(first.acks, first.fresh);
  assert.equal(acks.day, '2026-09-29');
  const before = evaluate({ cards: [card('CYMJ', METAR.thunderstorm.replace('291800Z', '300550Z'), at(30, 5, 58))], acks, ...ctx(at(30, 5, 59)) });
  assert.deepEqual(before.fresh, [], 'still the 29th at home, though it is the 30th in UTC');
  const after = evaluate({ cards: [card('CYMJ', METAR.thunderstorm.replace('291800Z', '300600Z'), at(30, 6, 5))], acks, ...ctx(at(30, 6, 5)) });
  assert.equal(after.fresh.length, 2, 'midnight at home');
  assert.equal(after.acks.day, '2026-09-30');
  assert.deepEqual(after.acks.keys, []);
});

test('a stored value that is garbled, or from another day, acts as nothing acknowledged', () => {
  for (const acks of [null, 'x', { version: 1, day: '2026-09-28', keys: ['CYMJ|METAR|THUNDERSTORM / SEVERE WX (VCTS)'] }]) {
    assert.equal(evaluate({ cards: storm(), acks, ...ctx() }).fresh.length, 2);
  }
});

test('what evaluate returns for storing is plain data and reports whether it changed', () => {
  const first = evaluate({ cards: storm(), ...ctx() });
  assert.deepEqual(JSON.parse(JSON.stringify(first.acks)), first.acks);
  assert.equal(first.changed, false, 'a new empty store equal to what was there is not a write');
  const acks = acknowledgeAll(first.acks, first.fresh);
  assert.equal(evaluate({ cards: storm(), acks, ...ctx() }).changed, false);
  assert.equal(evaluate({ cards: cardsOf(['CYMJ', METAR.fresh]), acks, ...ctx() }).changed, true, 'pruned');
  assert.equal(evaluate({ cards: storm(), acks: { version: 1, day: '2026-09-28', keys: [] }, ...ctx() }).changed, true, 'a new day');
  assert.equal(evaluate({ cards: storm(), acks: 'garbled', ...ctx() }).changed, true);
});

test('evaluate never changes the acks or cards it is given', () => {
  const cards = storm();
  const acks = Object.freeze({ version: 1, day: '2026-09-29', keys: Object.freeze(['CYMJ|METAR|CB/TCU (FEW040CB)', 'CYMJ|METAR|GONE']) });
  const copy = JSON.stringify({ cards, acks });
  const r = evaluate({ cards, acks, ...ctx() });
  assert.equal(JSON.stringify({ cards, acks }), copy);
  assert.deepEqual(r.acks.keys, ['CYMJ|METAR|CB/TCU (FEW040CB)']);
});

// ---- Cautions from the TAF do not depend on waves (RED 2) -------------------------------------------------

const STORM_TAF = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2922/3002 3SM TSRA BKN030CB';

test('with no waves planned a TEMPO TSRA at home still raises a caution', () => {
  assert.deepEqual(tafResultsOfWaves([], 'CYMJ'), [], 'no waves, no wave results');
  const tafs = tafCautionsForBanner({ tafs: { CYMJ: homeTaf(STORM_TAF) }, ...ctx() });
  const list = cautionList({ tafs });
  assert.ok(list.length >= 1);
  assert.ok(list.every((c) => c.level === 'caution' && c.group === 'TEMPO' && c.icao === 'CYMJ'));
  assert.ok(list.some((c) => c.reason.startsWith('THUNDERSTORM')));
  assert.equal(evaluate({ tafs, ...ctx() }).fresh.length, list.length);
});

test('without a home given, the day check takes only wx\'s cautions: below-limit TAF pieces stay tied to the waves', () => {
  const tafs = tafCautionsForBanner({ tafs: { CYMJ: homeTaf(HOME_TAF.lowFromEvening), CYQR: homeTaf(ALT_TAF.fog) }, ...ctx() });
  const list = cautionList({ tafs });
  assert.deepEqual(list.map((c) => [c.icao, c.level, c.reason]), [['CYQR', 'caution', 'SIGNIFICANT WX (FG)']], 'the fog is a caution; the low ceiling and visibility are not raised');
  assert.ok(tafs.every((t) => t.result.hits.length === 0));
});

test('every airfield\'s TAF is checked over the day, and a missing TAF says so instead of clearing', () => {
  const tafs = tafCautionsForBanner({
    tafs: { CYMJ: homeTaf(STORM_TAF), CYQR: homeTaf('TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080 TEMPO 3000/3003 FZRA OVC010'), CYYN: null },
    ...ctx(),
  });
  assert.deepEqual(tafs.map((t) => t.icao), ['CYMJ', 'CYQR', 'CYYN']);
  assert.equal(tafs[2].result.status, 'no-taf');
  const list = cautionList({ tafs });
  assert.deepEqual([...new Set(list.map((c) => c.icao))], ['CYMJ', 'CYQR']);
  assert.ok(list.some((c) => c.icao === 'CYQR' && c.reason.startsWith('SIGNIFICANT WX (FZRA')));
  const first = evaluate({ tafs, ...ctx() });
  const acks = acknowledgeAll(first.acks, first.fresh);
  assert.deepEqual(evaluate({ tafs, acks, ...ctx() }).fresh, []);
});

test('the banner window is from local midnight (or 1 h before now, if earlier) to the later of the end of today and now + 12 h', () => {
  const w = bannerWindow(ctx());
  assert.equal(+w.from, +at(29, 6), 'midnight at Moose Jaw, so a joined spell keeps one span all day');
  assert.equal(+w.to, +at(30, 6, 42), 'now + 12 h is later than the end of today');
  const evening = bannerWindow(ctx(at(29, 23)));
  assert.equal(+evening.from, +at(29, 6));
  assert.equal(+evening.to, +at(30, 11), 'late in the day it reaches into tomorrow');
  const early = bannerWindow(ctx(at(29, 8)));
  assert.equal(+early.from, +at(29, 6), 'never later than midnight');
  assert.equal(+early.to, +at(30, 6), 'early in the day, the end of today');
  assert.equal(+bannerWindow(ctx(at(30, 5, 59))).to, +at(30, 17, 59), 'still the 29th at home: now + 12 h is later than 06:00Z');
});

test('with no readable zone the banner window is now to now + 12 h; with no readable time there is none', () => {
  const w = bannerWindow({ now: NOW, timeZone: undefined });
  assert.deepEqual([+w.from, +w.to], [+NOW - 3_600_000, +NOW + 12 * 3_600_000]);
  assert.equal(bannerWindow({ now: undefined, timeZone: ZONE }), null);
  assert.equal(bannerWindow({}), null);
});

test('the banner does not depend on the day being viewed: a TAF storm later today or in the next 12 h is raised, one after that is not', () => {
  const tempo = (from, to) => `TAF CYMJ 290540Z 2900/3018 22010KT P6SM SKC TEMPO ${from}/${to} 3SM TSRA BKN030CB`;
  const raised = (raw, now = NOW) => cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, ...ctx(now) }), notEndedBefore: bannerNotEndedBefore(now) }).length > 0;
  assert.equal(raised(tempo('2920', '2923')), true, 'this evening');
  assert.equal(raised(tempo('3004', '3006')), true, 'tonight, within 12 h of now');
  assert.equal(raised(tempo('3010', '3013')), false, 'past now + 12 h (30/06:42Z)');
  assert.equal(raised(tempo('3010', '3013'), at(29, 23)), true, 'the same storm, once it is within 12 h');
  assert.equal(raised(tempo('2902', '2904')), false, 'before today began at home');
  assert.equal(raised(tempo('2910', '2912')), false, 'earlier today, but over for hours');
});

test('a TAF caution that ended hours ago is not on the banner; one that ended 30 minutes ago still is', () => {
  const tempo = (from, to) => `TAF CYMJ 290540Z 2900/3018 22010KT P6SM SKC TEMPO ${from}/${to} 3SM TSRA BKN030CB`;
  const raised = (raw, now = NOW) => cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, ...ctx(now) }), notEndedBefore: bannerNotEndedBefore(now) }).length > 0;
  const now = at(29, 18, 30);
  assert.equal(raised(tempo('2913', '2915'), now), false, 'ended 3 h 30 min ago');
  assert.equal(raised(tempo('2916', '2918'), now), true, 'ended 30 min ago');
  assert.equal(raised(tempo('2916', '2918'), at(29, 19, 30)), false, 'an hour and a half after it ended it goes');
});

test('the banner window is cut at the TAF\'s end, and a TAF that ended before it says so and raises nothing', () => {
  const ended = 'TAF CYMJ 281740Z 2818/2906 22010KT P6SM SKC TEMPO 2822/2902 3SM TSRA BKN030CB';
  const [one] = tafCautionsForBanner({ tafs: { CYMJ: homeTaf(ended) }, ...ctx(at(29, 12)) });
  assert.equal(one.result.status, 'no-time', 'nothing of it falls in the window');
  assert.deepEqual(cautionList({ tafs: [one] }), []);
  const kept = evaluate({ tafs: [one], acks: { version: 1, day: '2026-09-29', keys: ['CYMJ|TAF|TEMPO|x|y|z'] }, ...ctx(at(29, 12)) });
  assert.deepEqual(kept.acks.keys, ['CYMJ|TAF|TEMPO|x|y|z'], 'an unreadable TAF does not clear acknowledgements');
  // A TAF valid to 06Z is asked about only up to 06Z: nothing after it is invented.
  const [two] = tafCautionsForBanner({ tafs: { CYMJ: homeTaf(STORM_TAF) }, ...ctx(at(30, 3)) });
  assert.notEqual(two.result.status, 'no-time');
});

test('the banner check never throws on nothing or no clock', () => {
  assert.deepEqual(tafCautionsForBanner(), []);
  assert.deepEqual(tafCautionsForBanner({ tafs: { CYMJ: homeTaf(STORM_TAF) } }), []);
  assert.deepEqual(tafCautionsForBanner({ tafs: null, ...ctx() }), []);
});

// ---- Below with no reason we can name (YELLOW 3) -----------------------------------------------------------------

test('a card below limits with no CEILING or VIS reason still raises one caution', () => {
  const odd = { icao: 'CYMJ', result: { level: 'below', reasons: ['SOMETHING ELSE'], stale: false }, cautionReasons: [], metar: { time: at(29, 18) } };
  assert.deepEqual(cautionList({ cards: [odd] }).map((c) => [c.level, c.reason]), [['below', 'SOMETHING ELSE']]);
  const empty = { ...odd, result: { level: 'below', reasons: [], stale: false } };
  assert.deepEqual(cautionList({ cards: [empty] }).map((c) => [c.level, c.reason, c.key]), [['below', 'Below limits', 'CYMJ|METAR|Below limits']]);
  const missing = { icao: 'CYMJ', result: { level: 'below' } };
  assert.deepEqual(cautionList({ cards: [missing] }).map((c) => c.reason), ['Below limits']);
});

test('a TAF piece below limits with no CEILING or VIS reason still raises one caution', () => {
  const piece = { kind: 'TEMPO', probability: null, tempo: false, from: at(29, 22), to: at(30, 1), group: 1, reasons: [] };
  const list = cautionList({ tafs: [{ icao: 'CYMJ', result: { status: 'below', hits: [piece], cautions: [] } }] });
  assert.deepEqual(list.map((c) => [c.level, c.group, c.reason]), [['below', 'TEMPO', 'Below limits']]);
  const named = cautionList({ tafs: [{ icao: 'CYMJ', result: { status: 'below', hits: [{ ...piece, reasons: ['ODD REASON'] }], cautions: [] } }] });
  assert.deepEqual(named.map((c) => c.reason), ['ODD REASON']);
});

// ---- No readable day: nothing is stored ----------------------------------------------------------------------------

test('with no readable day acknowledgements are not kept, so they can never outlive the day', () => {
  const noZone = { now: NOW, timeZone: undefined };
  const stored = { version: 1, day: null, keys: ['CYMJ|METAR|X'] };
  assert.deepEqual(readAcks(stored, noZone), { version: 1, day: null, keys: [] }, 'a null-day store is not honoured');
  const first = evaluate({ cards: storm(), ...noZone });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const again = evaluate({ cards: storm(), acks, ...noZone });
  assert.equal(again.fresh.length, 2, 'nothing acknowledged carries over');
  assert.equal(again.storable, false);
  assert.equal(again.changed, false, 'and there is nothing to write');
  assert.equal(evaluate({ cards: storm(), acks: stored, ...noZone }).changed, false);
  assert.equal(evaluate({ cards: storm(), ...ctx() }).storable, true);
});

// ---- The cut is after the join, so an acknowledged fog does not come back mid-spell ---------------------------

const FOG_SPELL = 'TAF CYMJ 301140Z 3012/0112 27010KT 1/2SM FG OVC002 BECMG 3016/3018 30015KT 1/2SM FG OVC002 FM302200 27010KT P6SM SKC';
const fogKeys = (now) => {
  const tafs = tafCautionsForBanner({ tafs: { CYMJ: parseTaf(FOG_SPELL, { now: at(30, 11, 40) }) }, ...ctx(now) });
  return cautionList({ tafs, notEndedBefore: bannerNotEndedBefore(now) }).filter((c) => /FG/.test(c.reason) && c.group === 'PREVAILING').map((c) => c.key); // the BECMG has its own line, and its own end
};

test('one fog spell has one key all through it, whatever the time: the join is made before the cut', () => {
  const early = fogKeys(at(30, 13));
  assert.equal(early.length, 1);
  assert.deepEqual(fogKeys(at(30, 17, 30)), early);
  assert.deepEqual(fogKeys(at(30, 19, 30)), early, 'the first piece ended over an hour ago, the spell has not');
});

test('an acknowledgement of that fog made at 13Z still holds at 19:30Z', () => {
  const at13 = at(30, 13);
  const tafs13 = tafCautionsForBanner({ tafs: { CYMJ: parseTaf(FOG_SPELL, { now: at(30, 11, 40) }) }, ...ctx(at13) });
  const first = evaluate({ tafs: tafs13, notEndedBefore: bannerNotEndedBefore(at13), ...ctx(at13) });
  const acks = acknowledgeAll(first.acks, first.fresh);
  const later = at(30, 19, 30);
  const tafsLate = tafCautionsForBanner({ tafs: { CYMJ: parseTaf(FOG_SPELL, { now: at(30, 11, 40) }) }, ...ctx(later) });
  assert.deepEqual(evaluate({ tafs: tafsLate, acks, notEndedBefore: bannerNotEndedBefore(later), ...ctx(later) }).fresh, []);
});

test('the cut still works after the join: a caution that ended hours ago goes, and BANNER_BACK_MS is the knob', () => {
  assert.equal(+bannerNotEndedBefore(NOW), +NOW - 3_600_000);
  const raw = 'TAF CYMJ 290540Z 2900/3018 22010KT P6SM SKC TEMPO 2913/2915 3SM TSRA BKN030CB';
  const list = (now) => cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, ...ctx(now) }), notEndedBefore: bannerNotEndedBefore(now) });
  assert.equal(list(at(29, 18, 30)).length, 0);
  assert.equal(list(at(29, 15, 30)).length > 0, true);
});

test('just after local midnight the window still reaches back across it: 00:30 local sees an hour back', () => {
  const now = at(29, 6, 30); // 00:30 at Moose Jaw
  const w = bannerWindow(ctx(now));
  assert.equal(+w.from, +at(29, 5, 30), 'now - 1 h, which is before local midnight (06Z)');
  const raw = 'TAF CYMJ 290540Z 2900/3018 22010KT P6SM SKC TEMPO 2905/2906 3SM TSRA BKN030CB';
  const shown = cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, ...ctx(now) }), notEndedBefore: bannerNotEndedBefore(now) });
  assert.equal(shown.length > 0, true, 'ended 30 min ago, before local midnight');
});

// ---- R3: the home forecast below the home limits is on the banner with no wave entered --------------------------

const HOME = { icao: 'CYMJ', limits: { ceilingFt: 2000, visSm: 3 } };

test('with the home field given, a forecast below its limits in the window is a banner line with no waves; alternates stay tied to waves', () => {
  const tafs = tafCautionsForBanner({ tafs: { CYMJ: homeTaf(HOME_TAF.lowFromEvening), CYQR: homeTaf(ALT_TAF.ceiling700) }, home: HOME, ...ctx() });
  const list = cautionList({ tafs });
  const below = list.filter((c) => c.level === 'below');
  assert.ok(below.length >= 1);
  assert.ok(below.every((c) => c.icao === 'CYMJ' && c.source === 'TAF'));
  assert.ok(below.some((c) => /^CEILING 800 FT < 2000 FT/.test(c.reason)));
  assert.equal(list.some((c) => c.icao === 'CYQR' && c.level === 'below'), false);
  assert.equal(evaluate({ tafs, ...ctx() }).fresh.length, list.length);
});

test('a home forecast below the limits that ended more than an hour ago is cut, like the cautions', () => {
  const raw = 'TAF CYMJ 290540Z 2900/3018 22010KT P6SM SKC TEMPO 2913/2915 1SM BR OVC003';
  const shown = (now) => cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, home: HOME, ...ctx(now) }), notEndedBefore: bannerNotEndedBefore(now) }).filter((c) => c.level === 'below').length > 0;
  assert.equal(shown(at(29, 14, 30)), true, 'in progress');
  assert.equal(shown(at(29, 15, 30)), true, 'ended 30 min ago');
  assert.equal(shown(at(29, 18, 30)), false, 'ended hours ago');
});

test('the home limits are the ones given: 2500 ft is below Cross-country 3000 and not Local 2000', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN025';
  const n = (limits) => cautionList({ tafs: tafCautionsForBanner({ tafs: { CYMJ: homeTaf(raw) }, home: { icao: 'CYMJ', limits }, ...ctx() }) }).filter((c) => c.level === 'below').length;
  assert.equal(n({ ceilingFt: 2000, visSm: 3 }), 0);
  assert.ok(n({ ceilingFt: 3000, visSm: 3 }) > 0);
});
