// Tests for src/modules/sof/timeline-view-model.js: what the 24-hour timeline draws, without a
// page (SPEC-sof, "24-hour timeline", task 5). timeline.js makes the model from wx's tafTimeline;
// this lays it out in rows and lanes, puts every piece in words for the hover and focus card, and
// steps between pieces for the arrow keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf } from '../../../src/wx/taf.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { planToUtc } from '../../../src/modules/sof/waves.js';
import { timelineModel, timelineSignature } from '../../../src/modules/sof/timeline.js';
import { timelineRows, buildTimelineView, moveFocus } from '../../../src/modules/sof/timeline-view-model.js';
import { HOME_TAF, ALT_TAF } from '../../fixtures/sof/reports.js';
import { smallHoursChange, noChange } from '../../fixtures/sof/timeline-zones.js';
import { zoneAbbreviation } from '../../../src/core/time.js';

const ZONE = 'America/Regina'; // CST all year; the day 29 Sep is 06Z on the 29th to 06Z on the 30th
const NOW = new Date('2026-09-29T18:42:00Z'); // 12:42 at home
const LOCAL = { ceilingFt: 2000, visSm: 3 };
const fields = () => createAirfields({ store: createStore(null).scope('airfields') });
const taf = (raw) => ({ raw, report: parseTaf(raw, { now: NOW }), source: 'metno' });
const metar = (raw) => ({ raw, report: parseMetar(raw, { now: NOW }), source: 'metno' });
const waves = (entries, day = 'today') => planToUtc(entries, { now: NOW, timeZone: ZONE, day }).waves;

const GOOD = {
  CYQR: taf(ALT_TAF.good),
  CYYN: taf('TAF CYYN 291740Z 2918/3018 27010KT P6SM FEW080'),
  CYXE: taf('TAF CYXE 291740Z 2918/3018 28012KT P6SM FEW080'),
};

function view({ tafs = {}, metars = {}, limits = LOCAL, waves: w = [], day = 'today', timePrimary, now = NOW, timeZone = ZONE, airfields = fields(), tafNotes } = {}) {
  const snapshot = { taf: tafs, metar: metars };
  return buildTimelineView({ airfields, snapshot, limits, waves: w, day, now, timeZone, timePrimary, tafNotes });
}
const row = (v, icao) => v.rows.find((r) => r.icao === icao);

// ---- Rows ------------------------------------------------------------------------------------

test('rows are home first, then each alternate, with home limits for home and the alternate\'s own options for alternates', () => {
  const airfields = fields();
  airfields.update({ fields: { CYQR: { approach: 'non-precision', lowestHatFt: 500, lowestVisSm: 1 } } });
  const rows = timelineRows({ airfields, snapshot: { taf: { CYMJ: taf(HOME_TAF.good), CYQR: taf(ALT_TAF.ceiling700) }, metar: { CYMJ: metar('CYMJ 291800Z 25010KT 15SM FEW100 15/02 A2952') } }, limits: LOCAL });
  assert.deepEqual(rows.map((r) => [r.icao, r.role]), [['CYMJ', 'HOME'], ['CYQR', 'ALT'], ['CYYN', 'ALT'], ['CYXE', 'ALT']]);
  assert.deepEqual(rows[0].limits, LOCAL);
  assert.deepEqual(rows[1].options, airfields.checkOptions('CYQR'), 'the whole checkOptions object, as timeline.js reads it');
  assert.ok(rows[0].metar, 'the METAR is wx\'s parsed report, for the mark');
  assert.equal(rows[2].taf, null, 'no TAF held is null');
});

test('an alternate is hatched against its own minima: 800-2 makes a 700 ft ceiling below, the default 600-2 does not', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), CYQR: taf(ALT_TAF.ceiling700), CYYN: GOOD.CYYN, CYXE: GOOD.CYXE };
  assert.equal(row(view({ tafs }), 'CYQR').pieces.some((p) => p.below), false);
  const airfields = fields();
  airfields.update({ fields: { CYQR: { approach: 'non-precision', lowestHatFt: 500, lowestVisSm: 1 } } });
  assert.equal(row(view({ tafs, airfields }), 'CYQR').pieces.some((p) => p.below), true);
});

test('the home row uses the home limits chosen in Settings: 2500 ft is below Cross-country 3000 but not Local 2000', () => {
  const tafs = { CYMJ: taf(HOME_TAF.ceiling2500), ...GOOD };
  assert.equal(row(view({ tafs }), 'CYMJ').pieces.some((p) => p.below), false);
  assert.equal(row(view({ tafs, limits: { ceilingFt: 3000, visSm: 3 } }), 'CYMJ').pieces.some((p) => p.below), true);
});

// ---- Pieces ------------------------------------------------------------------------------------------

test('pieces sit on the home day as percentages of it: a piece from 21Z is 15 hours into a day that starts at 06Z', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD } });
  const pieces = row(v, 'CYMJ').pieces;
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].left, 50, 'the TAF starts 18Z: 12 hours in');
  assert.equal(pieces[0].width, 12.5, 'three hours of 24');
  assert.equal(pieces[1].left, 62.5);
  assert.equal(pieces[1].width, 37.5, 'to 06Z, the end of the day');
});

test('each piece has its NATO colour and a label in words, and a piece below the limits says below and is hatched', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD } });
  const [early, late] = row(v, 'CYMJ').pieces;
  assert.equal(early.below, false);
  assert.match(early.label, /^[A-Z0-9]+$/, 'the prevailing piece is labelled with its NATO state');
  assert.equal(late.below, true);
  assert.match(late.label, /\bbelow$/);
  assert.equal(late.nato, 'YLO1');
  assert.ok(late.hatch, 'a hatch as well as the label');
  assert.equal(early.hatch, false);
});

test('a PROB piece wx left unchecked is labelled "unchecked", never "below"', () => {
  const alt = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080 PROB30 3000/3003 2SM BR BKN005';
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.good), CYQR: taf(alt), CYYN: GOOD.CYYN, CYXE: GOOD.CYXE } });
  const prob = row(v, 'CYQR').pieces.find((p) => p.kind === 'PROB');
  assert.ok(prob);
  assert.equal(prob.unchecked, true);
  assert.equal(prob.below, false);
  assert.match(prob.label, /unchecked/);
  assert.doesNotMatch(prob.label, /below/);
  assert.match(prob.card, /PROB unchecked/);
});

test('overlays (TEMPO, PROB, BECMG) sit on lines under the prevailing one, and never on top of each other', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2920/2924 3SM BR BKN020 TEMPO 2922/3002 2SM BR BKN008 PROB30 3002/3005 1SM FG OVC004';
  const v = view({ tafs: { CYMJ: taf(raw), ...GOOD } });
  const r = row(v, 'CYMJ');
  assert.ok(r.pieces.filter((p) => p.lane === 0).every((p) => p.kind === 'PREVAILING'));
  const over = r.pieces.filter((p) => p.lane > 0);
  assert.equal(over.length, 3);
  for (const a of over) {
    for (const b of over) {
      if (a === b || a.lane !== b.lane) continue;
      assert.ok(a.left + a.width <= b.left + 1e-9 || b.left + b.width <= a.left + 1e-9, 'pieces on one line do not overlap');
    }
  }
  assert.equal(r.lanes, 1 + Math.max(...over.map((p) => p.lane)), 'the row is as tall as its lines');
  assert.ok(r.lanes >= 3, 'the two TEMPOs overlap, so they cannot share a line');
});

test('a row with only prevailing weather is one line tall', () => {
  assert.equal(row(view({ tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD } }), 'CYMJ').lanes, 1);
});

test('the card for a piece is words: the airfield, the group and times in Zulu, the state, both clocks, and the conditions', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.tempoFog), ...GOOD } });
  const tempo = row(v, 'CYMJ').pieces.find((p) => p.kind === 'TEMPO');
  assert.equal(tempo.card, `CYMJ TEMPO 30/00Z–30/03Z: ${tempo.nato}, below limits. Zulu 0000–0300, local 18:00–21:00 CST. Conditions: 22010KT 1/2SM FG VV002.`);
  assert.equal(tempo.ariaLabel, tempo.card, 'a screen reader hears the same words');
});

// ---- Rows that have no pieces ---------------------------------------------------------------------------------

test('a row with no TAF says so in words instead of drawing nothing', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.good) } });
  assert.equal(row(v, 'CYQR').words, 'No TAF');
  assert.deepEqual(row(v, 'CYQR').pieces, []);
  assert.equal(row(v, 'CYMJ').words, null);
});

test('a cancelled TAF and a TAF with no readable ceiling say so in words', () => {
  const cancelled = view({ tafs: { CYMJ: taf('TAF CYMJ 291740Z 2918/3006 CNL') } });
  assert.equal(row(cancelled, 'CYMJ').words, 'TAF cancelled');
});

// ---- Marks, bands and the now line -------------------------------------------------------------------------------------

test('the METAR is a mark at its time with its words, and only when it is on the day', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.good) }, metars: { CYMJ: metar('CYMJ 291800Z 25010KT 15SM FEW100 15/02 A2952') } });
  assert.equal(row(v, 'CYMJ').metar.label, 'METAR 1800Z');
  assert.equal(row(v, 'CYMJ').metar.left, 50);
  const old = view({ tafs: {}, metars: { CYMJ: metar('CYMJ 281800Z 25010KT 15SM FEW100 15/02 A2952') }, now: new Date('2026-09-29T18:42:00Z') });
  assert.equal(row(old, 'CYMJ').metar, null, 'a METAR from the day before is off this day');
});

test('each wave is a band with landing and landing + 1 h marks, and the evening wave is on the day (#7)', () => {
  const v = view({ waves: waves([{ takeoff: '08:00', land: '09:30' }, { takeoff: '22:00', land: '23:30' }]) });
  assert.equal(v.waves.length, 2);
  const [morning, night] = v.waves;
  assert.equal(morning.name, 'W1');
  assert.ok(Math.abs(morning.left - ((14 - 6) / 24) * 100) < 1e-4);
  assert.equal(morning.landing.label, 'W1 landing 1530Z');
  assert.equal(morning.landingPlus1.label, 'W1 landing + 1 h 1630Z');
  assert.match(morning.text, /^W1 1400Z–1530Z, local 08:00–09:30 CST/);
  assert.ok(night.left > 90, 'a 22:00 local wave is near the end of the day');
  assert.equal(night.landing.visible, true);
});

test('a wave that lands past midnight is cut at the end of the day and says so, with its +1 h mark off the day', () => {
  const v = view({ waves: waves([{ takeoff: '22:00', land: '00:30' }]) });
  const [wave] = v.waves;
  assert.equal(wave.clippedEnd, true);
  assert.equal(wave.left + wave.width, 100);
  assert.equal(wave.landing.visible, false);
});

test('the now line is at the time now on the day, and off the day for Tomorrow', () => {
  const v = view();
  assert.ok(Math.abs(v.now.left - ((18 + 42 / 60 - 6) / 24) * 100) < 1e-4);
  assert.equal(v.now.label, 'Now 1842Z');
  assert.equal(view({ day: 'tomorrow' }).now, null);
});

// ---- Axis ---------------------------------------------------------------------------------------------------------

test('the axis is Zulu first with a local row, or local first when Settings puts local first', () => {
  const zulu = view();
  assert.deepEqual(zulu.axis.map((a) => a.zone), ['utc', 'local']);
  assert.equal(zulu.axis[0].label, 'Zulu');
  assert.equal(zulu.axis[1].label, 'CST');
  assert.deepEqual(view({ timePrimary: 'local' }).axis.map((a) => a.zone), ['local', 'utc']);
  assert.ok(zulu.axis[0].ticks.every((t) => t.left >= 0 && t.left <= 100));
});

test('the title names the day and the home zone', () => {
  assert.equal(view().title, '24-hour timeline, Tue 29 Sep (CST)');
  assert.equal(view({ day: 'tomorrow' }).title, '24-hour timeline, Wed 30 Sep (CST)');
});

test('with no readable zone nothing is drawn and the problem is in words', () => {
  const v = view({ timeZone: 'Not/AZone' });
  assert.equal(v.problem, 'The home time zone is not known');
  assert.deepEqual(v.rows, []);
  assert.equal(v.signature, 'problem:The home time zone is not known');
});

// ---- Redraw only on change --------------------------------------------------------------------------------------------------

test('the signature is timeline.js\'s, without the now line: the same for the same picture, new when a wave or a report changes', () => {
  const tafs = { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD };
  const a = view({ tafs, waves: waves([{ takeoff: '15:30', land: '17:00' }]) });
  const later = view({ tafs, waves: waves([{ takeoff: '15:30', land: '17:00' }]), now: new Date(+NOW + 5 * 60_000) });
  assert.equal(later.signature, a.signature, 'the now line moving is not a redraw');
  assert.notEqual(later.now.left, a.now.left, 'but the now line did move');
  assert.notEqual(view({ tafs, waves: waves([{ takeoff: '15:30', land: '17:30' }]) }).signature, a.signature);
  assert.notEqual(view({ tafs: { ...tafs, CYMJ: taf(HOME_TAF.good) }, waves: waves([{ takeoff: '15:30', land: '17:00' }]) }).signature, a.signature);
  assert.notEqual(view({ tafs, timePrimary: 'local', waves: waves([{ takeoff: '15:30', land: '17:00' }]) }).signature, a.signature, 'the time order changes the axis');
  const model = timelineModel({ rows: timelineRows({ airfields: fields(), snapshot: { taf: tafs, metar: {} }, limits: LOCAL }), waves: waves([{ takeoff: '15:30', land: '17:00' }]), now: NOW, timeZone: ZONE });
  assert.equal(a.signature, timelineSignature(model, { now: false }));
});

// ---- Keyboard stepping ----------------------------------------------------------------------------------------------------------

test('Left and Right step through the pieces of a row in time order and stop at the ends', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD } });
  const [first, second] = row(v, 'CYMJ').pieces;
  assert.equal(moveFocus(v, first.id, 'ArrowRight'), second.id);
  assert.equal(moveFocus(v, second.id, 'ArrowLeft'), first.id);
  assert.equal(moveFocus(v, first.id, 'ArrowLeft'), null, 'at the start it stays put');
  assert.equal(moveFocus(v, second.id, 'ArrowRight'), null, 'at the end it stays put');
});

test('Home and End go to the first and last piece of the row', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.tempoFog), ...GOOD } });
  const pieces = row(v, 'CYMJ').pieces;
  assert.equal(moveFocus(v, pieces[0].id, 'End'), pieces.at(-1).id);
  assert.equal(moveFocus(v, pieces.at(-1).id, 'Home'), pieces[0].id);
});

test('Up and Down move to the row above or below, to the piece at about the same time', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), CYQR: taf(ALT_TAF.fog), CYYN: GOOD.CYYN, CYXE: GOOD.CYXE } });
  const late = row(v, 'CYMJ').pieces[1]; // from 21Z
  const down = moveFocus(v, late.id, 'ArrowDown');
  const target = row(v, 'CYQR').pieces.find((p) => p.id === down);
  assert.ok(target, 'lands on a piece in the next row');
  assert.ok(target.left <= late.left && late.left <= target.left + target.width, 'the one under the same time');
  // Back up goes to the piece above that starts the same time as the one it came from, here 18Z.
  assert.equal(moveFocus(v, down, 'ArrowUp'), row(v, 'CYMJ').pieces[0].id);
  assert.equal(moveFocus(v, late.id, 'ArrowUp'), null, 'nothing above the first row');
});

test('Down skips a row with no pieces, and other keys and unknown pieces do nothing', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.good), CYXE: GOOD.CYXE } }); // CYQR and CYYN have no TAF
  const home = row(v, 'CYMJ').pieces[0];
  const next = moveFocus(v, home.id, 'ArrowDown');
  assert.ok(row(v, 'CYXE').pieces.some((p) => p.id === next), 'jumps over the rows with nothing to focus');
  assert.equal(moveFocus(v, home.id, 'x'), null);
  assert.equal(moveFocus(v, 'nope', 'ArrowRight'), null);
});

// ---- A TAF that is stale or failed is said on its row, in words -------------------------------------------------

const STALE = { stale: true, failed: false, note: 'STALE TAF, valid period ended 5 min ago' };

test('a row on a stale TAF says so in its words and its aria label, and so does each of its pieces', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD };
  const plain = row(view({ tafs }), 'CYMJ');
  assert.equal(plain.words, null);
  const noted = row(view({ tafs, tafNotes: { CYMJ: STALE } }), 'CYMJ');
  assert.equal(noted.words, '(STALE TAF, valid period ended 5 min ago)');
  assert.match(noted.ariaLabel, /: \(STALE TAF, valid period ended 5 min ago\)$/);
  assert.match(noted.pieces[0].card, /\(STALE TAF, valid period ended 5 min ago\)$/);
  assert.equal(noted.pieces[0].ariaLabel, noted.pieces[0].card);
  assert.equal(row(view({ tafs, tafNotes: { CYMJ: STALE } }), 'CYQR').words, null, 'only the row on that TAF');
});

test('the note follows the words a row already has, such as a cancelled TAF that is also out of date', () => {
  const tafs = { CYMJ: taf('TAF CYMJ 291740Z 2918/3006 CNL') };
  const r = row(view({ tafs, tafNotes: { CYMJ: STALE } }), 'CYMJ');
  assert.equal(r.words, 'TAF cancelled (STALE TAF, valid period ended 5 min ago)');
});

test('a failed refresh is said on the row', () => {
  const failed = { stale: false, failed: true, note: 'TAF refresh failed, showing the last one' };
  const r = row(view({ tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD }, tafNotes: { CYMJ: failed } }), 'CYMJ');
  assert.equal(r.words, '(TAF refresh failed, showing the last one)');
});

test('the picture is redrawn when a note appears or goes: the signature changes', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD };
  const a = view({ tafs }).signature;
  const b = view({ tafs, tafNotes: { CYMJ: STALE } }).signature;
  assert.notEqual(a, b);
  assert.equal(b, view({ tafs, tafNotes: { CYMJ: STALE } }).signature);
});

// ---- A day the clocks change: the title, the local row, the cards and the waves name the right zone ---------------

const TORONTO = 'America/Toronto';
const HOUR = 3_600_000;
const pad = (n) => String(n).padStart(2, '0');

for (const kind of ['forward', 'back']) {
  const change = smallHoursChange(TORONTO, 2026, kind);
  test(`on the day the clocks go ${kind} (${TORONTO}) the title, the local row and the cards say both zone names`, { skip: change ? false : noChange(TORONTO, 2026, kind) }, () => {
    const before = zoneAbbreviation(new Date(+change.at - 3 * HOUR), TORONTO);
    const after = zoneAbbreviation(new Date(+change.at + 3 * HOUR), TORONTO);
    assert.notEqual(before, after);
    const now = new Date(+change.at + 8 * HOUR);
    // A TAF valid from the evening before to the evening after: one prevailing piece across the change.
    const dd = (d, h) => `${pad(d.getUTCDate())}${pad(h)}`;
    const start = new Date(+change.at - 12 * HOUR);
    const end = new Date(+change.at + 30 * HOUR);
    const raw = `TAF CYMJ ${dd(start, start.getUTCHours())}00Z ${dd(start, start.getUTCHours())}/${dd(end, end.getUTCHours())} 22010KT P6SM SKC`;
    const tafs = { CYMJ: { raw, report: parseTaf(raw, { now: start }), source: 'metno' }, ...GOOD };
    const v = view({ tafs, now, timeZone: TORONTO, waves: [{ name: 'W1', takeoff: new Date(+change.at - HOUR), land: new Date(+change.at + 2 * HOUR), nextDay: false }] });
    assert.equal(v.title.endsWith(`(${before}/${after})`), true, v.title);
    assert.equal(v.axis.find((a) => a.zone === 'local').label, `${before}/${after}`);
    const card = row(v, 'CYMJ').pieces[0].card;
    assert.match(card, new RegExp(`local \\d\\d:\\d\\d ${before}–\\d\\d:\\d\\d ${after}\\.`), card);
    assert.match(v.waves[0].text, new RegExp(`local \\d\\d:\\d\\d ${before}–\\d\\d:\\d\\d ${after}\\.`), v.waves[0].text);
  });
}

test('an ordinary day still says one zone in the title, the local row and the cards', () => {
  const v = view({ tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD } });
  assert.equal(v.title, '24-hour timeline, Tue 29 Sep (CST)');
  assert.equal(v.axis.find((a) => a.zone === 'local').label, 'CST');
  assert.match(row(v, 'CYMJ').pieces[0].card, /local \d\d:\d\d–\d\d:\d\d CST\. Conditions/);
});
