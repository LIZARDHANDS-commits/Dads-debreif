// Checks: the 24-hour timeline as data: every real and hand-written TAF is compared with wx's own answer, plus 23 and
//   25 hour days at clock changes.
// Serves: SOF-R13.
// Expected values: wx's tafTimeline on purpose (a wiring check); real and hand-written TAFs from tests/fixtures;
//   clock-change days from the zone data; margins 1e-4, 1e-12.

// Tests for src/modules/sof/timeline.js: the 24-hour timeline as data. No canvas,
// no page. The pieces must be wx's tafTimeline, so every real and hand-written
// TAF in the fixtures is compared with wx's own answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTaf } from '../../../src/wx/taf.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { tafTimeline } from '../../../src/wx/taf.js';
import { checkConditions, natoColour, DEFAULT_LIMITS } from '../../../src/wx/limits.js';
import { assessAlternate } from '../../../src/wx/alternates.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { homeCall } from '../../../src/modules/sof/waves.js';
import { planToUtc, localDate, localToUtc } from '../../../src/modules/sof/waves.js';
import {
  timelineModel, axisTicks, stepPiece, timelineSignature, sameTimeline,
} from '../../../src/modules/sof/timeline.js';
import { HOME_TAF, ALT_TAF, METAR } from '../../fixtures/sof/reports.js';
import { smallHoursChange, noChange } from '../../fixtures/sof/timeline-zones.js';
import { TAF as WX_TAF } from '../wx/reports.js';

const HOUR = 3_600_000;
const ZONE = 'America/Regina'; // Moose Jaw, CST all year (UTC-6)
const NOW = new Date('2026-09-29T18:00:00Z'); // 12:00 in Moose Jaw on the 29th
const at = (day, hh, mm = 0) => new Date(Date.UTC(2026, 8, day, hh, mm));
const DAY29 = { year: 2026, month: 9, day: 29 };
const TAF_NOW = new Date('2026-09-29T20:00:00Z');

const taf = (raw) => parseTaf(raw, { now: TAF_NOW });
const plan = (entries, extra = {}) => planToUtc(entries, { now: NOW, timeZone: ZONE, ...extra }).waves;
const HOME_LIMITS = [DEFAULT_LIMITS.home];
const ALT_LIMITS = [DEFAULT_LIMITS.alternate];
const model = (extra = {}) => timelineModel({ now: NOW, timeZone: ZONE, ...extra });
const row = (icao, raw, extra = {}) => ({ icao, role: icao === 'CYMJ' ? 'HOME' : 'ALT', taf: raw == null ? null : taf(raw), ...extra });

// ---- Fixtures ---------------------------------------------------------------------------

const fixtureText = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const lines = (name) => fixtureText(name).split('\n').map((l) => l.trim()).filter(Boolean);

/** Every TAF in tests/fixtures/sof and tests/fixtures/wx, and the hand-written tables. */
const FIXTURE_TAFS = [
  ...lines('sof/metno-taf-CYMJ-CYQR-CYYN.txt').map((raw, i) => [`sof metno line ${i + 1}`, raw]),
  ...lines('wx/metno-taf-CYMJ-CYQR-CYYN.txt').map((raw, i) => [`wx metno line ${i + 1}`, raw]),
  ['wx datamask CYMJ', JSON.parse(fixtureText('wx/datamask-taf-CYMJ.json')).raw],
  ...Object.entries(HOME_TAF).map(([name, raw]) => [`sof HOME_TAF.${name}`, raw]),
  ...Object.entries(ALT_TAF).map(([name, raw]) => [`sof ALT_TAF.${name}`, raw]),
  ...Object.entries(WX_TAF).map(([name, raw]) => [`wx reports TAF.${name}`, raw]),
];

// wx's timeline as the flat list the model must equal.
function wxPieces(parsed, from, to) {
  const tl = tafTimeline(parsed);
  return [
    ...tl.prevailing.map((p) => ({ lane: 'prevailing', kind: 'PREVAILING', ...p })),
    ...tl.overlays.map((o) => ({ lane: 'overlay', ...o })),
  ].filter((p) => +p.to > +from && +p.from < +to);
}
const shape = (p) => [p.lane, p.kind, p.group, +(p.fullFrom ?? p.from), +(p.fullTo ?? p.to)].join('|');

test('the fixtures really are there', () => {
  assert.ok(FIXTURE_TAFS.length > 40, `${FIXTURE_TAFS.length} TAFs`);
});

test('for every fixture TAF the model\'s pieces are wx\'s tafTimeline, group for group and time for time', () => {
  let checked = 0;
  for (const [name, raw] of FIXTURE_TAFS) {
    const parsed = taf(raw);
    if (!parsed.validFrom || parsed.cancelled || parsed.nil) continue;
    const seen = new Set();
    // The day the TAF starts on at home, and the next (a TAF can run to 30 h).
    const first = localDate(parsed.validFrom, ZONE);
    for (const date of [first, localDate(new Date(+localToUtc(first, 0, ZONE) + 36 * HOUR), ZONE)]) {
      const m = timelineModel({ rows: [row('CYMJ', raw)], now: NOW, timeZone: ZONE, date });
      const axis = m.axis;
      const expected = wxPieces(parsed, axis.from, axis.to);
      const got = m.rows[0].pieces;
      assert.deepEqual(got.map(shape).sort(), expected.map(shape).sort(), `${name} on ${date.day}`);
      for (const piece of got) {
        const source = expected.find((e) => shape(e) === shape(piece));
        assert.equal(piece.nato, natoColour(source.conditions), `${name}: NATO colour`);
        seen.add(shape(piece));
      }
      checked += 1;
    }
    const all = wxPieces(parsed, new Date(0), new Date(8.64e15));
    assert.deepEqual([...seen].sort(), all.map(shape).sort(), `${name}: every wx piece shows on one of the two days`);
  }
  assert.ok(checked > 60, `${checked} day checks`);
});

test('cancelled and NIL TAFs draw no pieces and say so in words', () => {
  const cancelled = taf(JSON.parse(fixtureText('wx/datamask-taf-CYMJ.json')).raw);
  assert.equal(cancelled.cancelled, true);
  const r = model({ rows: [{ icao: 'CYMJ', role: 'HOME', taf: cancelled }] }).rows[0];
  assert.deepEqual([r.state, r.words, r.pieces], ['cancelled', 'TAF cancelled', []]);
  const nil = model({ rows: [row('CYMJ', 'TAF CYMJ 291740Z NIL')] }).rows[0];
  assert.deepEqual([nil.state, nil.words, nil.pieces], ['nil', 'TAF NIL: none issued', []]);
});

test('no TAF, or one with no valid period, draws no pieces and says so', () => {
  const none = model({ rows: [row('CYMJ', null)] }).rows[0];
  assert.deepEqual([none.state, none.words, none.pieces, none.coverage], ['no-taf', 'No TAF', [], null]);
  const noValid = model({ rows: [{ icao: 'CYMJ', role: 'HOME', taf: { groups: [], problems: [] } }] }).rows[0];
  assert.deepEqual([noValid.state, noValid.words, noValid.pieces], ['no-valid-period', 'TAF valid period unknown', []]);
});

// ---- Pieces: colour, label, hatch ------------------------------------------------------------------

test('a piece has a NATO colour from wx and a text label; the label names the group for TEMPO, BECMG and PROB', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC BECMG 2921/2923 SCT040 TEMPO 2922/3002 3SM BR BKN012 PROB30 3002/3004 1SM FG BKN002';
  const m = model({ rows: [row('CYMJ', raw, { limits: { ceilingFt: 1000, visSm: 2 } })] });
  const pieces = m.rows[0].pieces;
  const prevailing = pieces.filter((p) => p.lane === 'prevailing');
  const overlays = pieces.filter((p) => p.lane === 'overlay');
  assert.ok(prevailing.length >= 1 && overlays.length >= 3);
  assert.equal(prevailing[0].nato, 'BLU');
  assert.equal(prevailing[0].label, 'BLU');
  assert.equal(prevailing[0].name, 'PREVAILING');
  const tempo = overlays.find((p) => p.kind === 'TEMPO');
  assert.equal(tempo.nato, natoColour(tafTimeline(taf(raw)).overlays.find((o) => o.kind === 'TEMPO').conditions));
  assert.equal(tempo.label, `TEMPO ${tempo.nato}`);
  assert.equal(overlays.find((p) => p.kind === 'BECMG').name, 'BECMG');
  const prob = overlays.find((p) => p.kind === 'PROB');
  assert.equal(prob.name, 'PROB30');
  assert.match(prob.label, /^PROB30 /);
  const probTempo = model({ rows: [row('CYMJ', raw.replace('PROB30 3002/3004', 'PROB30 TEMPO 3002/3004'))] }).rows[0].pieces.find((p) => p.kind === 'PROB');
  assert.equal(probTempo.name, 'PROB30 TEMPO');
});

test('every NATO state is a word in the label, so colour is never the only signal', () => {
  const tafs = [
    'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC',
    'TAF CYMJ 291740Z 2918/3006 22010KT 6SM SCT020',
    'TAF CYMJ 291740Z 2918/3006 22010KT 3SM BKN012',
    'TAF CYMJ 291740Z 2918/3006 22010KT 1SM OVC004',
    'TAF CYMJ 291740Z 2918/3006 22010KT 1/4SM FG VV001',
    'TAF CYMJ 291740Z 2918/3006 22010KT P6SM OVC///',
  ];
  const labels = tafs.map((raw) => model({ rows: [row('CYMJ', raw)] }).rows[0].pieces[0]);
  for (const p of labels) assert.ok(p.label.split(' ').includes(p.nato), `${p.label} names ${p.nato}`);
  assert.ok(new Set(labels.map((p) => p.nato)).size >= 5);
  assert.ok(labels.some((p) => p.nato === 'UNK'));
});

test('a piece below the airfield\'s limits is flagged below, hatched by the screen, and says below in its label', () => {
  const m = model({ rows: [row('CYMJ', HOME_TAF.lowFromEvening, { limits: HOME_LIMITS })] });
  const [fine, low] = m.rows[0].pieces;
  assert.equal(fine.below, false);
  assert.doesNotMatch(fine.label, /below/);
  assert.equal(low.below, true);
  assert.equal(low.label, `${low.nato} below`);
  assert.match(low.text, /below limits/);
  assert.equal(+low.fullFrom, +at(29, 21));
});

test('below follows wx\'s limit check for every fixture: home limits, alternate minima and a list of options', () => {
  const options = [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }];
  const belowAll = (conditions, list) => list.every((l) => checkConditions(conditions, l).belowLimits);
  for (const [name, raw] of FIXTURE_TAFS) {
    const parsed = taf(raw);
    if (!parsed.validFrom || parsed.cancelled || parsed.nil) continue;
    const date = localDate(parsed.validFrom, ZONE);
    const cases = [
      ['HOME', { limits: HOME_LIMITS }, HOME_LIMITS],
      ['ALT', { options: { minima: ALT_LIMITS } }, ALT_LIMITS],
      ['ALT', { options: { minima: options } }, options],
      ['ALT', { options: { minima: options, landingMinima: { ceilingFt: 200, visSm: 0.5 } } }, options],
    ];
    for (const [role, extra, list] of cases) {
      const landing = extra.options?.landingMinima ? [extra.options.landingMinima] : null;
      const pieces = timelineModel({ rows: [{ icao: 'CYMJ', role, taf: parsed, ...extra }], now: NOW, timeZone: ZONE, date }).rows[0].pieces;
      for (const p of pieces) {
        const source = wxPieces(parsed, p.fullFrom, p.fullTo).find((e) => shape(e) === shape(p));
        // Below only when below every option; a PROB piece at an alternate is tested against the landing minima.
        const against = p.kind === 'PROB' && role === 'ALT' ? landing : list;
        assert.equal(p.below, against ? belowAll(source.conditions, against) : false, `${name} ${role} ${p.name} ${p.fullFrom.toISOString()}`);
        const unchecked = p.kind === 'PROB' && role === 'ALT' && !landing && belowAll(source.conditions, list);
        assert.equal(p.unchecked, unchecked, `${name} ${role} ${p.name}: unchecked`);
      }
    }
  }
});

test('the hatched pieces are exactly the pieces wx\'s assessAlternate calls hits over the same day', () => {
  const parsed = taf(ALT_TAF.fog);
  const options = { minima: ALT_LIMITS };
  const m = timelineModel({ rows: [{ icao: 'CYQR', role: 'ALT', taf: parsed, options }], now: NOW, timeZone: ZONE, date: DAY29 });
  const hits = assessAlternate(parsed, { from: m.axis.from, to: m.axis.to }, options).hits;
  const below = m.rows[0].pieces.filter((p) => p.below);
  assert.ok(hits.length > 0);
  assert.deepEqual(below.map((p) => [p.kind, p.group, +p.fullFrom, +p.fullTo]), hits.map((h) => [h.kind, h.group, +h.from, +h.to]));
});

// ---- Alternates as the Airfields panel sets them (checkOptions), not just 600-2 ---------------------

const memoryBackend = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
};
const airfields = () => createAirfields({ store: createStore(memoryBackend()).scope('airfields') });
const altRow = (a, raw, icao = 'CYQR') => ({ icao, role: 'ALT', taf: taf(raw), options: a.checkOptions(icao) });
const OVC020 = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM OVC020';

test('a no-IFR alternate (MEA 4500, elevation 1900) is hatched against the visual descent, not 600-2 (RED 1)', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'no-ifr', meaFt: 4500, elevationFt: 1900 } } });
  const options = a.checkOptions('CYQR');
  assert.ok(options.visualDescent, 'the descent is what checkOptions gives');
  const m = model({ rows: [altRow(a, OVC020)] });
  const [p] = m.rows[0].pieces;
  assert.equal(p.below, true, 'a 2000 ft ceiling is under MEA + 500 ft - elevation = 3100 ft');
  assert.match(p.label, /below/);
  // The same TAF at an alternate with plain 600-2 is fine, so this really is the descent.
  assert.equal(model({ rows: [altRow(airfields(), OVC020)] }).rows[0].pieces[0].below, false);
  // And it is wx's own answer.
  const hits = assessAlternate(taf(OVC020), { from: m.axis.from, to: m.axis.to }, options).hits;
  assert.deepEqual(m.rows[0].pieces.filter((x) => x.below).map((x) => +x.fullFrom), hits.map((h) => +h.from));
});

test('a GNSS-only alternate with an MEA is hatched against the visual descent; without one, against its minima', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'gnss-only', meaFt: 4500, elevationFt: 1900 } } });
  assert.ok(a.checkOptions('CYQR').visualDescent);
  assert.equal(model({ rows: [altRow(a, OVC020)] }).rows[0].pieces[0].below, true);
  const noMea = airfields();
  noMea.update({ fields: { CYQR: { approach: 'gnss-only' } } });
  assert.equal(noMea.checkOptions('CYQR').visualDescent, null);
  assert.equal(model({ rows: [altRow(noMea, OVC020)] }).rows[0].pieces[0].below, false);
});

test('an alternate with approaches set is hatched against its own minima from checkOptions', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'non-precision' } } });
  const raw = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM BKN007'; // meets 600-2, below every non-precision option
  assert.equal(model({ rows: [altRow(a, raw)] }).rows[0].pieces[0].below, true);
  assert.equal(model({ rows: [altRow(airfields(), raw)] }).rows[0].pieces[0].below, false);
});

test('a PROB piece below an alternate\'s minima is "unchecked", not "below", until landing minima are set (YELLOW 1)', () => {
  const raw = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM SKC PROB30 2922/3002 1SM FG VV002';
  const a = airfields();
  const [, prob] = model({ rows: [altRow(a, raw)] }).rows[0].pieces;
  assert.equal(prob.kind, 'PROB');
  assert.deepEqual([prob.below, prob.unchecked], [false, true]);
  assert.match(prob.label, /unchecked/);
  assert.doesNotMatch(prob.label, /below/);
  // With landing minima that the piece is under, it is below.
  a.update({ fields: { CYQR: { approach: 'non-precision', lowestHatFt: 600, lowestVisSm: 2 } } });
  assert.ok(a.checkOptions('CYQR').landingMinima);
  const [, prob2] = model({ rows: [altRow(a, raw)] }).rows[0].pieces;
  assert.deepEqual([prob2.below, prob2.unchecked], [true, false]);
  // Home checks PROB against its own limits.
  const [, homeProb] = model({ rows: [row('CYMJ', raw.replace('CYQR', 'CYMJ'), { limits: HOME_LIMITS })] }).rows[0].pieces;
  assert.deepEqual([homeProb.below, homeProb.unchecked], [true, false]);
});

test('with no limits given a home row uses Local (MTCA) 2000/3 and an alternate uses 600-2', () => {
  const homeRaw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN015'; // 1500 ft: below 2000, above 600
  assert.equal(model({ rows: [row('CYMJ', homeRaw)] }).rows[0].pieces[0].below, true);
  assert.equal(model({ rows: [row('CYQR', homeRaw)] }).rows[0].pieces[0].below, false);
  assert.equal(model({ rows: [{ icao: 'CYMJ', taf: taf(homeRaw) }] }).rows[0].pieces[0].below, false, 'no role: an alternate');
  assert.equal(model({ rows: [row('CYMJ', homeRaw, { limits: { ceilingFt: 1000, visSm: 3 } })] }).rows[0].pieces[0].below, false, 'one limit, not a list');
  assert.equal(model({ rows: [row('CYMJ', homeRaw, { limits: [{ nonsense: 1 }] })] }).rows[0].pieces[0].below, true, 'unusable limits fall back');
});

test('pieces have a time-ordered, stable list, a lane, an id and a place on the axis', () => {
  const m = model({ rows: [row('CYMJ', HOME_TAF.tempoFog)] });
  const pieces = m.rows[0].pieces;
  const order = pieces.map((p) => +p.fullFrom);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(new Set(pieces.map((p) => p.id)).size, pieces.length);
  const m2 = model({ rows: [row('CYMJ', HOME_TAF.tempoFog)] });
  assert.deepEqual(m2.rows[0].pieces.map((p) => p.id), pieces.map((p) => p.id), 'ids are the same each time');
  const tempo = pieces.find((p) => p.kind === 'TEMPO');
  // Moose Jaw's day is 06Z to 06Z; the TEMPO is 00Z to 03Z on the 30th.
  assert.equal(tempo.lane, 'overlay');
  assert.equal(tempo.x0, 18 / 24);
  assert.equal(tempo.x1, 21 / 24);
});

test('a piece that runs past the axis is cut to it, keeps its full times and says so', () => {
  const m = model({ rows: [row('CYMJ', 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080')] });
  const [p] = m.rows[0].pieces;
  assert.equal(+p.fullFrom, +at(29, 18));
  assert.equal(+p.fullTo, +at(30, 18));
  assert.equal(+p.from, +at(29, 18));
  assert.equal(+p.to, +at(30, 6));
  assert.deepEqual([p.x0, p.x1], [0.5, 1]);
  assert.deepEqual([p.clippedStart, p.clippedEnd], [false, true]);
  const tomorrow = model({ rows: [row('CYMJ', 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080')], day: 'tomorrow' }).rows[0].pieces[0];
  assert.deepEqual([tomorrow.x0, tomorrow.x1, tomorrow.clippedStart, tomorrow.clippedEnd], [0, 0.5, true, false]);
});

test('a TAF that does not reach the day at all has no pieces and no coverage', () => {
  const m = model({ rows: [row('CYMJ', HOME_TAF.good)], day: 'tomorrow', now: at(29, 18) });
  // Valid 29/18 to 30/06; tomorrow at home is 30/06 to 31/06: touching only.
  assert.deepEqual(m.rows[0].pieces, []);
  assert.equal(m.rows[0].coverage, null);
  assert.equal(m.rows[0].state, 'ok');
});

test('coverage is the TAF\'s valid period on the axis, so a gap shows', () => {
  const m = model({ rows: [row('CYMJ', HOME_TAF.good)] });
  assert.deepEqual(m.rows[0].coverage, { x0: 0.5, x1: 1, from: at(29, 18), to: at(30, 6) });
  assert.deepEqual([m.rows[0].validFrom, m.rows[0].validTo].map(Number), [+at(29, 18), +at(30, 6)]);
});

// ---- wx's status and problems come through to the row ---------------------------------------------------------------

test('a no-IFR alternate with no MEA reads incomplete, says why in wx\'s words, and is not hatched', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'no-ifr' } } });
  assert.equal(a.checkOptions('CYQR').visualDescent.meaFt, null);
  for (const raw of [ALT_TAF.good, ALT_TAF.fog]) { // fog would be below 600-2, which must not be used
    const r = model({ rows: [altRow(a, raw)] }).rows[0];
    assert.equal(r.state, 'incomplete');
    assert.equal(r.status, 'incomplete');
    assert.equal(r.words, 'Visual descent needs the MEA and the field elevation');
    assert.equal(r.words, r.problems[0]);
    assert.ok(r.pieces.length > 0, 'the forecast is still drawn');
    assert.ok(r.pieces.every((p) => !p.below && !p.unchecked));
  }
});

test('a TAF with a ceiling that can\'t be read is incomplete too, and an ordinary one carries wx\'s status', () => {
  const r = model({ rows: [row('CYMJ', 'TAF CYMJ 290540Z 2900/3006 22010KT P6SM OVC///')] }).rows[0]; // covers the whole day
  assert.deepEqual([r.state, r.status], ['incomplete', 'incomplete']);
  assert.equal(r.words, "A ceiling or visibility in the TAF can't be read");
  const fine = model({ rows: [row('CYMJ', HOME_TAF.good)] }).rows[0];
  assert.deepEqual([fine.state, fine.status, fine.words, fine.problems], ['ok', 'not-covered', null, []]);
  const alt = model({ rows: [altRow(airfields(), 'TAF CYQR 290540Z 2900/3006 25015KT P6SM FEW080')] }).rows[0];
  assert.deepEqual([alt.state, alt.status], ['ok', 'meets']);
  const none = model({ rows: [row('CYMJ', null)] }).rows[0];
  assert.deepEqual([none.status, none.problems], [null, []]);
});

test('the signature changes when a row becomes incomplete', () => {
  const a = airfields();
  const before = timelineSignature(model({ rows: [altRow(a, ALT_TAF.good)] }));
  a.update({ fields: { CYQR: { approach: 'no-ifr' } } });
  assert.notEqual(timelineSignature(model({ rows: [altRow(a, ALT_TAF.good)] })), before);
});

// ---- The home row uses the same numbers as the wave call ---------------------------------------------------------------

test('home limits are cleaned as the wave call cleans them, so the timeline and the call agree (2549 ft with BKN025)', () => {
  const limits = { ceilingFt: 2549, visSm: 3 }; // Settings rounds 2549 to 2500
  const [wave] = plan([{ takeoff: '14:00', land: '16:00' }]);
  const call = homeCall(wave, taf(HOME_TAF.ceiling2500), limits);
  assert.equal(call.status, 'at-limit', '2500 ft is not below a 2500 ft limit');
  const m = model({ rows: [row('CYMJ', HOME_TAF.ceiling2500, { limits })] });
  assert.deepEqual(m.rows[0].pieces.map((p) => p.below), [false]);
  assert.equal(call.hasHit, m.rows[0].pieces.some((p) => p.below));
  // Cross-country 3000/3 puts both over the limit.
  const cross = { ceilingFt: 3000, visSm: 3 };
  assert.equal(homeCall(wave, taf(HOME_TAF.ceiling2500), cross).hasHit, true);
  assert.equal(model({ rows: [row('CYMJ', HOME_TAF.ceiling2500, { limits: cross })] }).rows[0].pieces[0].below, true);
  // Nonsense and missing numbers are Local's, in both.
  for (const bad of [{ ceilingFt: 'x', visSm: NaN }, null, undefined, [], 'x']) {
    const c = homeCall(wave, taf(HOME_TAF.lowFromEvening), bad);
    const t = model({ rows: [row('CYMJ', HOME_TAF.lowFromEvening, { limits: bad })] }).rows[0].pieces;
    assert.equal(c.hasHit, t.some((p) => p.below), JSON.stringify(bad));
  }
});

// ---- The day and the axis ------------------------------------------------------------------------------

test('the axis is the home zone\'s day: 06Z to 06Z for Moose Jaw, Today or Tomorrow', () => {
  const today = model();
  assert.equal(+today.axis.from, +at(29, 6));
  assert.equal(+today.axis.to, +at(30, 6));
  assert.deepEqual(today.date, DAY29);
  assert.equal(today.zone, 'CST');
  const tomorrow = model({ day: 'tomorrow' });
  assert.equal(+tomorrow.axis.from, +at(30, 6));
  assert.deepEqual(tomorrow.date, { year: 2026, month: 9, day: 30 });
  assert.deepEqual(model({ date: { year: 2026, month: 12, day: 31 } }).date, { year: 2026, month: 12, day: 31 });
  assert.equal(+model({ date: { year: 2026, month: 12, day: 31 } }).axis.to, Date.UTC(2027, 0, 1, 6), 'across a year');
});

test('today at home is the home date, not the UTC date', () => {
  const m = model({ now: at(30, 3) }); // 21:00 on the 29th at home
  assert.deepEqual(m.date, DAY29);
  assert.equal(+model({ now: at(30, 6) }).axis.from, +at(30, 6));
});

// The change day comes from the tz data this machine runs on, and the expected length
// from that zone's own offsets.
for (const kind of ['back', 'forward']) {
  const tz = 'America/Toronto';
  const change = smallHoursChange(tz, 2026, kind);
  test(`a day with a clock change is 23 or 25 hours long, and positions use the real length (${kind}, ${tz})`, { skip: change ? false : noChange(tz, 2026, kind) }, () => {
    const hours = (24 * 60 + change.before - change.after) / 60;
    assert.equal(hours, kind === 'back' ? 25 : 23);
    const m = timelineModel({ now: change.at, timeZone: tz, date: change.date, rows: [] });
    assert.equal((+m.axis.to - +m.axis.from) / HOUR, hours);
    const wave = planToUtc([{ takeoff: '23:00', land: '23:30' }], { now: NOW, timeZone: tz, date: change.date }).waves;
    const w = timelineModel({ now: change.at, timeZone: tz, date: change.date, waves: wave, rows: [] }).waves[0];
    assert.ok(Math.abs(w.x0 - (+wave[0].takeoff - +m.axis.from) / (hours * HOUR)) < 1e-12);
  });
}

test('without a readable time or zone nothing is guessed: no axis, no rows, and a reason', () => {
  for (const extra of [{ timeZone: undefined }, { timeZone: 'Not/AZone' }, { now: undefined }, { now: new Date('x') }]) {
    const m = timelineModel({ rows: [row('CYMJ', HOME_TAF.good)], waves: [], now: NOW, timeZone: ZONE, ...extra });
    assert.equal(m.axis, null);
    assert.deepEqual([m.rows, m.waves, m.now], [[], [], null]);
    assert.match(m.problem, /not known/);
  }
  assert.equal(timelineModel().problem !== null, true);
  assert.equal(model().problem, null);
});

test('default arguments: no rows and no waves is an empty but valid timeline', () => {
  const m = model();
  assert.deepEqual([m.rows, m.waves], [[], []]);
  assert.ok(m.axis.rows.length === 2);
  assert.deepEqual(model({ rows: 'x', waves: 5 }).rows, []);
  assert.deepEqual(model({ rows: [null, undefined, {}] }).rows.map((r) => r.state), ['no-taf', 'no-taf', 'no-taf']);
});

// ---- Axis ticks: Zulu first, local optional ---------------------------------------------------------------

test('UTC ticks every three hours from 06Z to 06Z, with the date shown at the start and at 00Z', () => {
  const [utc] = model().axis.rows;
  assert.equal(utc.zone, 'utc');
  assert.equal(utc.label, 'Zulu');
  assert.deepEqual(utc.ticks.map((t) => t.label), ['06Z', '09Z', '12Z', '15Z', '18Z', '21Z', '00Z', '03Z', '06Z']);
  assert.deepEqual(utc.ticks.map((t) => t.x), [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8, 1]);
  assert.deepEqual(utc.ticks.map((t) => t.dayLabel), ['29', null, null, null, null, null, '30', null, null]);
  assert.deepEqual(utc.ticks.map((t) => +t.at), Array.from({ length: 9 }, (_, i) => +at(29, 6) + i * 3 * HOUR));
});

test('the local row follows, with the zone named, and the local date at midnight', () => {
  const [, local] = model().axis.rows;
  assert.equal(local.zone, 'local');
  assert.equal(local.label, 'CST');
  assert.deepEqual(local.ticks.map((t) => t.label), ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '00:00']);
  assert.deepEqual(local.ticks.map((t) => t.dayLabel), ['29', null, null, null, null, null, null, null, '30']);
  assert.deepEqual(local.ticks.map((t) => t.x), model().axis.rows[0].ticks.map((t) => t.x));
});

test('the order and the local row are options: local first, or Zulu alone', () => {
  assert.deepEqual(model({ first: 'local' }).axis.rows.map((r) => r.zone), ['local', 'utc']);
  assert.deepEqual(model({ showLocal: false }).axis.rows.map((r) => r.zone), ['utc']);
  assert.deepEqual(model({ first: 'local', showLocal: false }).axis.rows.map((r) => r.zone), ['utc'], 'no local row to put first');
  assert.deepEqual(model({ first: 'sideways' }).axis.rows.map((r) => r.zone), ['utc', 'local'], 'anything else is Zulu first');
});

test('the tick step is 1, 2, 3, 4, 6 or 12 hours, else 3', () => {
  const count = (stepHours) => model({ stepHours }).axis.rows[0].ticks.length;
  assert.deepEqual([1, 2, 3, 4, 6, 12].map(count), [25, 13, 9, 6, 5, 2]);
  for (const bad of [0, -3, 5, 2.5, 'x', null, 48]) assert.equal(count(bad), 9, String(bad));
});

test('a half-hour zone gets whole-hour ticks on each clock: Zulu on the UTC hours, local on the local ones', () => {
  const zone = 'Asia/Kolkata'; // UTC+5:30
  const m = timelineModel({ now: NOW, timeZone: zone, date: DAY29, rows: [] });
  const [utc, local] = m.axis.rows;
  assert.ok(utc.ticks.every((t) => t.at.getUTCMinutes() === 0 && t.at.getUTCHours() % 3 === 0));
  assert.ok(local.ticks.length >= 8);
  for (const t of local.ticks) {
    const shifted = new Date(+t.at + 330 * 60_000);
    assert.equal(shifted.getUTCMinutes(), 0);
    assert.equal(shifted.getUTCHours() % 3, 0);
  }
  assert.notDeepEqual(utc.ticks.map((t) => +t.at), local.ticks.map((t) => +t.at));
});

test('axisTicks works on its own for any span', () => {
  const rows = axisTicks({ from: at(29, 6), to: at(29, 12), timeZone: ZONE, stepHours: 2 });
  assert.deepEqual(rows[0].ticks.map((t) => t.label), ['06Z', '08Z', '10Z', '12Z']);
  assert.deepEqual(axisTicks({ from: at(29, 6), to: at(29, 6), timeZone: ZONE })[0].ticks.map((t) => t.x), [0], 'a span of nothing is one tick, not a division by zero');
  assert.deepEqual(axisTicks({ from: 'x', to: at(29, 6), timeZone: ZONE }), []);
});

// ---- Waves, marks, METAR, now -----------------------------------------------------------------------------------


test('a wave is a band with its own place on the axis and landing and landing + 1 h marks', () => {
  const m = model({ waves: plan([{ name: 'W1', takeoff: '08:00', land: '09:30' }]) });
  const [w] = m.waves;
  assert.equal(w.name, 'W1');
  assert.equal(+w.from, +at(29, 14));
  assert.equal(+w.to, +at(29, 15, 30));
  assert.deepEqual([w.x0, w.x1], [8 / 24, 9.5 / 24]);
  assert.equal(+w.landing.at, +at(29, 15, 30));
  assert.equal(w.landing.x, 9.5 / 24);
  assert.equal(+w.landingPlus1.at, +at(29, 16, 30));
  assert.equal(w.landingPlus1.x, 10.5 / 24);
  assert.deepEqual([w.landing.visible, w.landingPlus1.visible, w.clippedStart, w.clippedEnd], [true, true, false, false]);
  assert.equal(w.landing.label, 'W1 landing 1530Z');
  assert.equal(w.landingPlus1.label, 'W1 landing + 1 h 1630Z');
  assert.equal(w.text, 'W1 1400Z–1530Z');
  assert.equal(w.localText, '08:00–09:30 CST');
});

test('an evening wave is on the timeline, in the right place, with Zulu first (#7)', () => {
  const m = model({ waves: plan([{ name: 'W3', takeoff: '18:00', land: '20:00' }]) });
  const [w] = m.waves;
  assert.equal(+w.from, +at(30, 0));
  assert.equal(+w.to, +at(30, 2));
  assert.deepEqual([w.x0, w.x1], [18 / 24, 20 / 24]);
  assert.equal(w.text, 'W3 0000Z–0200Z');
  assert.equal(w.localText, '18:00–20:00 CST');
  assert.equal(w.landing.x, 20 / 24);
  assert.equal(w.landingPlus1.x, 21 / 24);
  assert.equal(m.axis.rows[0].zone, 'utc');
});

test('a wave that crosses midnight Zulu shows as one band, and its times read across the date', () => {
  const m = model({ waves: plan([{ name: 'W2', takeoff: '17:30', land: '19:30' }]) });
  const [w] = m.waves;
  assert.equal(+w.from, +at(29, 23, 30));
  assert.equal(+w.to, +at(30, 1, 30));
  assert.ok(w.x1 > w.x0);
  assert.ok(Math.abs(w.x1 - w.x0 - 2 / 24) < 1e-12);
  assert.equal(w.text, 'W2 2330Z–0130Z');
  // The 00Z tick, and its new date, are inside the band.
  const midnight = m.axis.rows[0].ticks.find((t) => t.label === '00Z');
  assert.ok(midnight.x > w.x0 && midnight.x < w.x1);
  assert.equal(midnight.dayLabel, '30');
});

test('a wave that crosses local midnight runs off the end of the day and is cut, not dropped', () => {
  const m = model({ waves: plan([{ name: 'W4', takeoff: '22:00', land: '00:30' }]) });
  const [w] = m.waves;
  assert.equal(w.clippedEnd, true);
  assert.equal(w.x1, 1);
  assert.equal(w.x0, 22 / 24);
  assert.equal(+w.to, +at(30, 6, 30), 'its real end is kept');
  assert.equal(w.landing.visible, false);
  assert.ok(w.landing.x > 1, 'the mark says where it would be');
  assert.equal(w.landingPlus1.visible, false);
  // Tomorrow's timeline shows the part of today's wave that runs past midnight...
  const carried = model({ day: 'tomorrow', waves: plan([{ name: 'W4', takeoff: '22:00', land: '00:30' }]) });
  assert.equal(carried.waves.length, 1);
  assert.deepEqual([carried.waves[0].clippedStart, carried.waves[0].x0, carried.waves[0].x1], [true, 0, 0.5 / 24]);
  // ...and the wave planned for tomorrow is in its own place.
  const next = model({ day: 'tomorrow', waves: plan([{ name: 'W4', takeoff: '22:00', land: '00:30' }], { day: 'tomorrow' }) });
  assert.equal(next.waves.length, 1);
  assert.equal(next.waves[0].x0, 22 / 24);
});

test('a landing whose + 1 h mark falls off the day keeps the landing mark', () => {
  const [w] = model({ waves: plan([{ name: 'W', takeoff: '22:00', land: '23:30' }]) }).waves;
  assert.equal(w.landing.visible, true);
  assert.equal(w.landingPlus1.visible, false);
});

test('waves outside the day are left out, and unreadable ones do not throw', () => {
  const out = model({ waves: [{ name: 'Y', takeoff: at(28, 20), land: at(28, 22) }, { name: 'bad' }, null, { takeoff: 'x', land: 1 }] });
  assert.deepEqual(out.waves, []);
  const before = model({ waves: [{ name: 'Edge', takeoff: at(29, 4), land: at(29, 6) }] });
  assert.deepEqual(before.waves, [], 'ending exactly when the day starts is not on it');
});

test('waves keep their order, up to five', () => {
  const waves = plan([
    { name: 'A', takeoff: '08:00', land: '09:00' }, { name: 'B', takeoff: '10:00', land: '11:00' }, { name: 'C', takeoff: '12:00', land: '13:00' },
  ]);
  assert.deepEqual(model({ waves }).waves.map((w) => w.name), ['A', 'B', 'C']);
});

test('the latest METAR is a mark at its time on the row, with its time in words', () => {
  const report = parseMetar(METAR.fresh, { now: NOW });
  const r = model({ rows: [row('CYMJ', HOME_TAF.good, { metar: report })] }).rows[0];
  assert.equal(+r.metar.at, +at(29, 18));
  assert.equal(r.metar.x, 12 / 24);
  assert.equal(r.metar.label, 'METAR 1800Z');
  assert.equal(r.metar.visible, true);
  const none = model({ rows: [row('CYMJ', HOME_TAF.good)] }).rows[0];
  assert.equal(none.metar, null);
  assert.equal(model({ rows: [row('CYMJ', HOME_TAF.good, { metar: parseMetar('METAR CYMJ 291800Z NIL', { now: NOW }) })] }).rows[0].metar, null);
  const old = model({ rows: [row('CYMJ', HOME_TAF.good, { metar: parseMetar('METAR CYMJ 281800Z 27010KT 15SM FEW100 15/02 A2952', { now: at(28, 18, 30) }) })] }).rows[0];
  assert.equal(old.metar.visible, false, 'a METAR from yesterday is not on today\'s axis');
});

test('the now line is at now, once a minute, and absent outside the day', () => {
  const m = model({ now: at(29, 18, 30) });
  assert.equal(+m.now.at, +at(29, 18, 30));
  assert.equal(m.now.x, 12.5 / 24);
  assert.equal(model({ now: at(29, 18, 30), day: 'tomorrow' }).now, null);
  assert.equal(model({ now: at(29, 18, 30, 0), date: { year: 2026, month: 9, day: 28 } }).now, null);
  assert.equal(model({ now: at(29, 6) }).now.x, 0);
});

// ---- Keyboard stepping ---------------------------------------------------------------------------------------------------

const STEP_TAF = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2920/2923 3SM BR BKN012 FM292200 22010KT P6SM SCT050 TEMPO 3000/3003 VCTS';
const stepPieces = () => model({ rows: [row('CYMJ', STEP_TAF)] }).rows[0].pieces;

test('next and previous go through the pieces in time order, one at a time, without skipping a piece that starts together', () => {
  const pieces = stepPieces();
  assert.ok(pieces.length >= 5);
  let walk = [];
  let p = stepPiece(pieces, null, 'next');
  while (p) { walk.push(p.id); p = stepPiece(pieces, p, 'next'); }
  assert.deepEqual(walk, pieces.map((x) => x.id), 'forward visits every piece once');
  walk = [];
  p = stepPiece(pieces, null, 'previous');
  while (p) { walk.push(p.id); p = stepPiece(pieces, p, 'previous'); }
  assert.deepEqual(walk, pieces.map((x) => x.id).reverse());
});

test('stepping from a piece id works like stepping from the piece, and an unknown id starts over', () => {
  const pieces = stepPieces();
  assert.equal(stepPiece(pieces, pieces[1].id, 'next'), pieces[2]);
  assert.equal(stepPiece(pieces, pieces[1], 'previous'), pieces[0]);
  assert.equal(stepPiece(pieces, 'no-such-piece', 'next'), pieces[0]);
  assert.equal(stepPiece(pieces, 'no-such-piece', 'previous'), pieces.at(-1));
});

test('stepping from a time goes to the next piece that starts after it, or the last that starts before it', () => {
  const pieces = stepPieces();
  const first = pieces[0];
  assert.equal(stepPiece(pieces, new Date(+first.from - 1), 'next'), first);
  const t = at(29, 21);
  const next = stepPiece(pieces, t, 'next');
  assert.ok(+next.from > +t);
  assert.ok(pieces.filter((p) => +p.from > +t).every((p) => +p.from >= +next.from));
  const before = stepPiece(pieces, t, 'previous');
  assert.ok(+before.from < +t);
  assert.ok(pieces.filter((p) => +p.from < +t).every((p) => +p.from <= +before.from));
  assert.equal(stepPiece(pieces, +t, 'next'), next, 'a timestamp works too');
});

test('at the ends stepping stays put (null), or wraps when asked', () => {
  const pieces = stepPieces();
  assert.equal(stepPiece(pieces, pieces.at(-1), 'next'), null);
  assert.equal(stepPiece(pieces, pieces[0], 'previous'), null);
  assert.equal(stepPiece(pieces, pieces.at(-1), 'next', { wrap: true }), pieces[0]);
  assert.equal(stepPiece(pieces, pieces[0], 'previous', { wrap: true }), pieces.at(-1));
});

test('stepping with nothing to step through, or a nonsense direction, is null and never throws', () => {
  assert.equal(stepPiece([], null, 'next'), null);
  assert.equal(stepPiece(undefined, null, 'next'), null);
  const pieces = stepPieces();
  assert.equal(stepPiece(pieces, null, 'sideways'), null);
  assert.equal(stepPiece(pieces, null), pieces[0], 'next by default');
  assert.equal(stepPiece([], null, 'next', { wrap: true }), null);
});

// ---- Signature: redraw only on change -----------------------------------------------------------------------------------------

// The third row is incomplete: wx can't read a token in its TAF, and says which.
const sigRows = (unread = 'XYZZY') => [
  row('CYMJ', HOME_TAF.tempoFog, { metar: parseMetar(METAR.fresh, { now: NOW }) }),
  row('CYQR', ALT_TAF.fog),
  row('CYYN', `TAF CYYN 290540Z 2900/3006 25015KT P6SM FEW080 ${unread}`),
];
const sig = (extra = {}) => timelineSignature(model({
  rows: sigRows(),
  waves: plan([{ name: 'W1', takeoff: '08:00', land: '09:30' }]),
  ...extra,
}));

test('the signature table\'s third row is incomplete, with wx\'s own problem text as its words', () => {
  const rows = model({ rows: sigRows() }).rows;
  assert.equal(rows[2].state, 'incomplete');
  assert.equal(rows[2].words, 'Could not read: XYZZY');
  assert.equal(model({ rows: sigRows('FOOBAR') }).rows[2].words, 'Could not read: FOOBAR');
});

test('a change to the weather under a piece changes the signature even when colour and times do not (YELLOW 2)', () => {
  const a = model({ rows: [row('CYMJ', 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW040')] });
  const b = model({ rows: [row('CYMJ', 'TAF CYMJ 291740Z 2918/3006 35025G50KT P6SM FEW040CB')] });
  assert.equal(a.rows[0].pieces[0].nato, b.rows[0].pieces[0].nato);
  assert.equal(a.rows[0].pieces[0].summary, '22010KT P6SM FEW040');
  assert.equal(b.rows[0].pieces[0].summary, '35025G50KT P6SM FEW040CB');
  assert.notEqual(timelineSignature(a), timelineSignature(b));
  const wind = model({ rows: [row('CYMJ', 'TAF CYMJ 291740Z 2918/3006 24010KT P6SM FEW040')] });
  assert.notEqual(timelineSignature(a), timelineSignature(wind));
});

test('the same inputs give the same signature, even when built again from scratch', () => {
  assert.equal(sig(), sig());
  assert.equal(typeof sig(), 'string');
  const a = model({ rows: [row('CYMJ', HOME_TAF.tempoFog)] });
  const b = model({ rows: [row('CYMJ', HOME_TAF.tempoFog)] });
  assert.equal(sameTimeline(a, b), true);
  assert.equal(timelineSignature(a), timelineSignature(b));
});

test('a new fetch of the same report, and a different issue time with the same forecast, do not redraw', () => {
  const a = model({ rows: [row('CYMJ', HOME_TAF.tempoFog)] });
  const b = model({ rows: [row('CYMJ', HOME_TAF.tempoFog.replace('291740Z', '291940Z'))] });
  assert.equal(sameTimeline(a, b), true);
});

test('anything drawn changing changes the signature', () => {
  const base = sig();
  const changed = {
    'a wave added': { waves: plan([{ name: 'W1', takeoff: '08:00', land: '09:30' }, { name: 'W2', takeoff: '10:00', land: '11:00' }]) },
    'a wave edited': { waves: plan([{ name: 'W1', takeoff: '08:00', land: '09:45' }]) },
    'a wave renamed': { waves: plan([{ name: 'First', takeoff: '08:00', land: '09:30' }]) },
    'a wave removed': { waves: [] },
    'the day': { day: 'tomorrow' },
    'the time order': { first: 'local' },
    'the local row off': { showLocal: false },
    'the tick step': { stepHours: 6 },
    'the zone': { timeZone: 'Asia/Kolkata' },
    'a TAF': { rows: [row('CYMJ', HOME_TAF.tempoFog.replace('1/2SM', '2SM')), ...sigRows().slice(1)] },
    'a row removed': { rows: [row('CYMJ', HOME_TAF.tempoFog)] },
    'an incomplete row\'s problem text': { rows: sigRows('FOOBAR') },
    'a row\'s limits': { rows: [row('CYMJ', HOME_TAF.tempoFog, { limits: { ceilingFt: 100, visSm: 0.25 } }), ...sigRows().slice(1)] },
    'the METAR': { rows: [row('CYMJ', HOME_TAF.tempoFog, { metar: parseMetar(METAR.fresh.replace('291800Z', '291900Z'), { now: at(29, 19, 5) }) }), ...sigRows().slice(1)] },
    'the METAR gone': { rows: [row('CYMJ', HOME_TAF.tempoFog), ...sigRows().slice(1)] },
  };
  for (const [name, extra] of Object.entries(changed)) {
    assert.notEqual(sig(extra), base, name);
  }
});

test('the now line moving a minute changes the whole signature but not the structure', () => {
  const a = model({ now: at(29, 18, 0), waves: plan([{ takeoff: '08:00', land: '09:30' }]) });
  const sameMinute = model({ now: new Date(+at(29, 18, 0) + 40_000), waves: plan([{ takeoff: '08:00', land: '09:30' }]) });
  const later = model({ now: at(29, 18, 1), waves: plan([{ takeoff: '08:00', land: '09:30' }]) });
  assert.equal(sameTimeline(a, sameMinute), true, 'seconds do not redraw');
  assert.equal(sameTimeline(a, later), false, 'a minute does');
  assert.equal(timelineSignature(a, { now: false }), timelineSignature(later, { now: false }));
  assert.notEqual(timelineSignature(a, { now: false }), timelineSignature(a));
});

test('a timeline that has no axis has a signature too, and differs from a good one', () => {
  const none = timelineModel({});
  assert.equal(typeof timelineSignature(none), 'string');
  assert.notEqual(timelineSignature(none), timelineSignature(model()));
  assert.equal(sameTimeline(null, null), true);
  assert.equal(sameTimeline(null, model()), false);
});

test('the model does not change what it is given, and is plain enough to compare', () => {
  const rows = [row('CYMJ', HOME_TAF.tempoFog)];
  const waves = plan([{ takeoff: '08:00', land: '09:30' }]);
  const before = JSON.stringify({ rows, waves });
  model({ rows, waves });
  assert.equal(JSON.stringify({ rows, waves }), before);
  const m = model({ rows });
  assert.doesNotThrow(() => JSON.stringify(m));
});
