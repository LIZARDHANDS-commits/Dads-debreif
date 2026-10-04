// Checks: what the Waves part of the screen says (chips, list of hits, alternate cards), joining the plan to the
//   calls.
// Serves: SOF-R10, SOF-R11.
// Expected values: hand-written; TAFs from tests/fixtures/sof/reports.js; time zone data from timeline-zones.js; the
//   calls come from waves.js.

// Tests for src/modules/sof/waves-view-model.js: what the Waves part of the screen says,
// decided without a page (SPEC-sof, "Waves and the alternate call", task 4). waves.js
// makes every call; this joins the plan to the calls and puts them in words for chips,
// the list of hits and the alternate cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaf } from '../../../src/wx/taf.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { MAX_WAVES } from '../../../src/modules/sof/waves.js';
import { buildWaves, dayLabel, resolveSelected } from '../../../src/modules/sof/waves-view-model.js';
import { HOME_TAF, ALT_TAF } from '../../fixtures/sof/reports.js';
import { smallHoursChange, noChange } from '../../fixtures/sof/timeline-zones.js';
import { zoneAbbreviation } from '../../../src/core/time.js';

const ZONE = 'America/Regina'; // Moose Jaw, CST all year
const NOW = new Date('2026-09-29T18:42:00Z'); // 12:42 on the 29th at home
const LOCAL = { ceilingFt: 2000, visSm: 3 };
const airfields = () => createAirfields({ store: createStore(null).scope('airfields') });
const taf = (raw) => parseTaf(raw, { now: NOW });
const w = (id, takeoff, land, name = '') => ({ id, name, takeoff, land });
const plan = (waves, day = 'today') => ({ version: 1, day, dayChosen: null, waves });
const GOOD_ALTS = { CYQR: taf(ALT_TAF.good), CYYN: taf('TAF CYYN 291740Z 2918/3018 27010KT P6SM FEW080'), CYXE: taf('TAF CYXE 291740Z 2918/3018 28012KT P6SM FEW080') };

function model({ waves = [], day, tafs = {}, limits = LOCAL, selectedId, timeZone = ZONE, now = NOW, tafNotes } = {}) {
  return buildWaves({ plan: plan(waves, day), airfields: airfields(), tafs, limits, now, timeZone, selectedId, tafNotes });
}

// The TAFs are valid 18Z to 06Z (12:00 to 24:00 at home). Early afternoon 12:30-14:00 local is 18:30-20:00Z, the
// afternoon 15:30-17:00 local is 21:30-23:00Z. The morning wave is before the TAF starts, or tomorrow, after it ends.
const MORNING = w('w1', '08:00', '09:30');
const EARLY = w('w1', '12:30', '14:00');
const AFTERNOON = w('w2', '15:30', '17:00');

// ---- Rows and their words ---------------------------------------------------------------------

test('each wave is a row in the home zone, named W1, W2 by default, with the zone and the date said', () => {
  const m = model({ waves: [MORNING, w('w2', '10:30', '12:00', 'Late'), w('w3', '13:00', '14:00')] });
  assert.equal(m.problem, null);
  assert.equal(m.zone, 'CST');
  assert.equal(m.dayLabel, 'Tue 29 Sep');
  assert.deepEqual(m.rows.map((r) => r.id), ['w1', 'w2', 'w3']);
  assert.deepEqual(m.rows.map((r) => r.name), ['W1', 'Late', 'W3'], 'an empty name is W and its place');
  assert.equal(m.rows[0].title, 'W1 0800–0930 CST');
  assert.equal(m.rows[0].zulu, '1400–1530Z');
  assert.equal(m.rows[0].nextDay, false);
});

test('Tomorrow is the home zone\'s next date', () => {
  const m = model({ waves: [MORNING], day: 'tomorrow' });
  assert.equal(m.dayLabel, 'Wed 30 Sep');
  assert.equal(m.day, 'tomorrow');
  assert.equal(m.waves[0].takeoff.toISOString(), '2026-09-30T14:00:00.000Z');
});

test('an evening wave that lands after midnight is shown and checked, not dropped (#7)', () => {
  const m = model({ waves: [w('w1', '22:00', '00:30')], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } });
  const [row] = m.rows;
  assert.equal(row.nextDay, true);
  assert.equal(row.note, 'Lands the next day');
  assert.equal(row.zulu, '0400–0630Z');
  assert.ok(row.chip, 'it has a call');
  assert.equal(m.waves.length, 1);
});

test('a wave with no times has no call, and says what is missing', () => {
  const m = model({ waves: [w('w1', '', ''), w('w2', '08:00', '')] });
  assert.equal(m.rows[0].chip, null);
  assert.equal(m.rows[0].note, 'Takeoff time not set');
  assert.equal(m.rows[1].note, 'Landing time not set');
  assert.equal(m.rows[0].title, 'W1');
  assert.deepEqual(m.calls, []);
});

test('N2: a wave with a time not set yet, or one that lands the next day, is not a problem', () => {
  const m = model({ waves: [w('w1', '08:00', ''), w('w2', '23:00', '01:00')] });
  assert.deepEqual(m.rows.map((r) => r.problem), [false, false]);
});

test('no waves is an empty list that can be added to', () => {
  const m = model();
  assert.deepEqual(m.rows, []);
  assert.equal(m.canAdd, true);
  assert.equal(m.selectedId, null);
  assert.equal(m.detail, null);
});

test('at 5 waves nothing more can be added, and it says why', () => {
  const five = Array.from({ length: MAX_WAVES }, (_, i) => w(`w${i + 1}`, '08:00', '09:00'));
  const m = model({ waves: five });
  assert.equal(m.canAdd, false);
  assert.equal(m.limitNote, 'Up to 5 waves');
  assert.equal(model({ waves: [MORNING] }).limitNote, '');
});

test('with no readable zone nothing is guessed: no calls, and a problem in words', () => {
  const m = model({ waves: [MORNING], timeZone: 'Not/AZone' });
  assert.equal(m.problem, 'The home time zone is not known');
  assert.equal(m.rows[0].chip, null);
  assert.equal(m.rows[0].note, 'The home time zone is not known');
  assert.equal(m.zone, '');
});

test('dayLabel is plain: weekday, day and month, from the calendar date given', () => {
  assert.equal(dayLabel({ year: 2026, month: 9, day: 29 }), 'Tue 29 Sep');
  assert.equal(dayLabel({ year: 2026, month: 12, day: 31 }), 'Thu 31 Dec');
  assert.equal(dayLabel(null), '');
});

// ---- The chip: call words, tone and first reason ---------------------------------------------------

test('a wave the home TAF has no trouble with says so, with a tick and no reason', () => {
  const m = model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } });
  const { chip } = m.rows[0];
  assert.equal(chip.words, 'No alternate needed');
  assert.equal(chip.tone, 'ok');
  assert.equal(chip.symbol, '✓');
  assert.equal(chip.reason, null);
  assert.equal(chip.limits, 'Local (MTCA) 2000/3', 'the label is built from the numbers used');
});

test('a wave that meets the trigger says ALTERNATE REQUIRED with the first reason and when', () => {
  const m = model({ waves: [AFTERNOON], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } });
  const { chip } = m.rows[0];
  assert.equal(chip.words, 'ALTERNATE REQUIRED');
  assert.equal(chip.tone, 'required');
  assert.equal(chip.symbol, '⚠', 'a symbol beside the words, so it is never colour alone');
  assert.match(chip.reason, /^CYMJ .*(CEILING 800 FT < 2000 FT|VIS 2 SM < 3 SM).* from 2130Z$/);
});

test('the chip follows the home limits chosen in Settings, and its label follows the numbers', () => {
  const tafs = { CYMJ: taf(HOME_TAF.ceiling2500), ...GOOD_ALTS };
  assert.equal(model({ waves: [EARLY], tafs }).rows[0].chip.words, 'No alternate needed');
  const cross = model({ waves: [EARLY], tafs, limits: { ceilingFt: 3000, visSm: 3 } }).rows[0].chip;
  assert.equal(cross.words, 'ALTERNATE REQUIRED');
  assert.equal(cross.limits, 'Cross-country 3000/3');
  assert.equal(model({ waves: [EARLY], tafs, limits: { ceilingFt: 2500, visSm: 3 } }).rows[0].chip.limits, 'Custom 2500/3');
});

test('no TAF, and a wave the TAF does not cover, say so instead of "no alternate needed"', () => {
  const none = model({ waves: [MORNING], tafs: {} }).rows[0].chip;
  assert.equal(none.words, 'No TAF');
  assert.equal(none.tone, 'unknown');
  assert.equal(none.symbol, '?');
  // Tomorrow morning is after the TAF ends (06Z on the 30th).
  const later = model({ waves: [MORNING], day: 'tomorrow', tafs: { CYMJ: taf(HOME_TAF.good) } }).rows[0].chip;
  assert.equal(later.words, "TAF doesn't cover the wave");
  assert.match(later.reason, /TAF valid to 06Z/);
});

test('the chip says how many alternates meet their minima', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(ALT_TAF.fog) };
  const { chip } = model({ waves: [w('w1', '15:30', '17:00')], tafs }).rows[0];
  assert.equal(chip.alternates, '2 of 3 alternates meet');
  assert.equal(model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS } }).rows[0].chip.alternates, '3 of 3 alternates meet');
});

test('the chip adds "(1 with caution)" when an alternate meets its minima with thunderstorms or the like forecast', () => {
  const stormy = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080 TEMPO 2920/2922 4SM TSRA BKN040CB';
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(stormy) };
  const { chip } = model({ waves: [w('w1', '15:00', '16:30')], tafs }).rows[0];
  assert.equal(chip.alternates, '3 of 3 alternates meet (1 with caution)');
  assert.equal(model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS } }).rows[0].chip.alternates, '3 of 3 alternates meet', 'no caution, no words');
});

test('N5: an alternate that meets with a caution is not "Meets minima" alone on its own line', () => {
  const stormy = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080 TEMPO 2920/2922 4SM TSRA BKN040CB';
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(stormy) };
  const lines = model({ waves: [w('w1', '15:00', '16:30')], tafs }).altLines;
  assert.equal(lines.get('CYQR').words, 'Meets minima (with caution)', 'the same words as the chip\'s "(1 with caution)"');
  assert.equal(lines.get('CYYN').words, 'Meets minima', 'no caution, no added words');
});

test('N5: an alternate at its limit with a caution reads "At the limit (with caution)", and the chip counts it', () => {
  const limitStorm = 'TAF CYQR 291740Z 2918/3018 25015KT P6SM BKN006 TEMPO 2920/2922 4SM TSRA BKN040CB';
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(limitStorm) };
  const m = model({ waves: [w('w1', '15:00', '16:30')], tafs });
  assert.equal(m.altLines.get('CYQR').words, 'At the limit (with caution)');
  assert.equal(m.rows[0].chip.alternates, '3 of 3 alternates meet (1 with caution)');
});

// ---- Selecting a wave lists every hit -----------------------------------------------------------------

test('the first wave with a call is selected until another is chosen, and none can be chosen', () => {
  const rows = model({ waves: [w('w1', '', ''), w('w2', '08:00', '09:30'), w('w3', '15:30', '17:00')] }).rows;
  assert.equal(resolveSelected(rows, undefined), 'w2');
  assert.equal(resolveSelected(rows, 'w3'), 'w3');
  assert.equal(resolveSelected(rows, null), null, 'null is a choice: none');
  assert.equal(resolveSelected(rows, 'w1'), 'w2', 'a wave with no call cannot be selected');
  assert.equal(resolveSelected(rows, 'gone'), 'w2', 'a removed wave falls back to the first');
  assert.equal(resolveSelected([], 'w1'), null);
});

test('the selected wave lists every hit in words, worst first', () => {
  const tafs = { CYMJ: taf('TAF CYMJ 291740Z 2918/3006 22010KT P6SM SCT050 FM292100 22010KT 2SM BR OVC008 TEMPO 2922/2923 1/2SM FG VV002 RMK NXT FCST BY 300000Z'), ...GOOD_ALTS };
  const m = model({ waves: [w('w1', '15:30', '17:00')], tafs, selectedId: 'w1' });
  const { detail } = m;
  assert.equal(detail.id, 'w1');
  assert.equal(detail.title, 'W1 1530–1700 CST (2130–2300Z)');
  assert.equal(detail.home.words, 'ALTERNATE REQUIRED');
  assert.ok(detail.home.lines.length >= 2, 'the prevailing piece and the TEMPO');
  assert.ok(detail.home.lines.every((l) => l.levelWords && l.text));
  assert.equal(detail.home.lines[0].levelWords, 'Below limits');
  assert.match(detail.home.lines[0].text, /^CYMJ .* from 2130Z$/);
  assert.equal(detail.home.limits, 'Local (MTCA) 2000/3');
});

test('the list of hits has each alternate\'s own result and what it was checked against', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(ALT_TAF.fog) };
  const { detail } = model({ waves: [w('w1', '15:30', '17:00')], tafs });
  assert.deepEqual(detail.alternates.map((a) => a.icao), ['CYQR', 'CYYN', 'CYXE']);
  const regina = detail.alternates[0];
  assert.equal(regina.words, 'Below minima');
  assert.equal(regina.symbol, '▼');
  assert.equal(regina.minima, '600-2');
  assert.equal(regina.note, 'Approaches not set: checked against 600-2');
  assert.ok(regina.lines.length >= 1);
  assert.equal(detail.alternates[1].words, 'Meets minima');
  assert.equal(detail.alternates[1].symbol, '✓');
  assert.equal(detail.summary, '2 of 3 alternates meet');
});

test('nothing selected means no detail and no result on the alternate cards', () => {
  const m = model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS }, selectedId: null });
  assert.equal(m.detail, null);
  assert.equal(m.altLines.size, 0);
  assert.equal(m.selectedId, null);
});

// ---- Each alternate card shows its result for the selected wave -------------------------------------------------

test('each alternate card gets a line for the selected wave: its window, its words and its first reason', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(ALT_TAF.fog) };
  const m = model({ waves: [w('w1', '15:30', '17:00')], tafs });
  assert.deepEqual([...m.altLines.keys()], ['CYQR', 'CYYN', 'CYXE'], 'alternates only, never home');
  const regina = m.altLines.get('CYQR');
  assert.equal(regina.label, 'W1 arrival 2200–0000Z');
  assert.equal(regina.words, 'Below minima');
  assert.equal(regina.tone, 'below');
  assert.equal(regina.symbol, '▼');
  assert.match(regina.reason, /^CYQR .*from 22Z$/);
  assert.equal(m.altLines.get('CYYN').words, 'Meets minima');
  assert.equal(m.altLines.get('CYYN').reason, null);
});

test('switching the selected wave switches the alternate lines', () => {
  const tafs = { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS, CYQR: taf(ALT_TAF.fog) };
  const waves = [w('w1', '15:30', '17:00'), w('w2', '08:00', '09:30')]; // fog until 00Z, then lifting
  const evening = model({ waves, tafs, selectedId: 'w1' }).altLines.get('CYQR');
  const morning = model({ waves, tafs, selectedId: 'w2' }).altLines.get('CYQR');
  assert.equal(evening.words, 'Below minima');
  assert.notEqual(morning.words, 'Below minima');
  assert.match(morning.label, /^W2 arrival/);
});

test('waves the model reports in UTC are the ones the timeline and the banner use, with the calls', () => {
  const m = model({ waves: [w('w1', '', ''), w('w2', '15:30', '17:00')], tafs: { CYMJ: taf(HOME_TAF.good), ...GOOD_ALTS } });
  assert.equal(m.waves.length, 1);
  assert.equal(m.waves[0].name, 'W2', 'named by its place in the plan');
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].wave, m.waves[0]);
});

// ---- A TAF that is stale or failed is said on the chip, never shown as plainly fine -----------------------------

const STALE = { stale: true, failed: false, note: 'STALE TAF, valid period ended 5 min ago' };

test('a chip on a stale home TAF says so in its reason and is not a plain tick', () => {
  const tafs = { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS };
  const plain = model({ waves: [EARLY], tafs }).rows[0].chip;
  assert.equal(plain.tone, 'ok');
  const { chip } = model({ waves: [EARLY], tafs, tafNotes: { CYMJ: STALE } }).rows[0];
  assert.equal(chip.reason, '(STALE TAF, valid period ended 5 min ago)');
  assert.equal(chip.tone, 'unknown');
  assert.equal(chip.symbol, '?');
  assert.equal(chip.words, plain.words, 'the call itself is wx\'s, unchanged');
});

test('a stale TAF is added after the first reason when there is one, and the tone stays that of the call', () => {
  const m = model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } });
  const base = model({ waves: [EARLY, w('w2', '15:30', '17:00')], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } }).rows[1].chip;
  const noted = model({ waves: [EARLY, w('w2', '15:30', '17:00')], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS }, tafNotes: { CYMJ: STALE } }).rows[1].chip;
  assert.ok(m.rows[0].chip);
  assert.equal(noted.reason, base.reason ? `${base.reason} (STALE TAF, valid period ended 5 min ago)` : '(STALE TAF, valid period ended 5 min ago)');
  assert.equal(noted.tone, base.tone === 'ok' ? 'unknown' : base.tone);
});

test('a failed refresh of the home TAF is said on the chip too', () => {
  const failed = { stale: false, failed: true, note: 'TAF refresh failed, showing the last one' };
  const { chip } = model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS }, tafNotes: { CYMJ: failed } }).rows[0];
  assert.match(chip.reason, /TAF refresh failed, showing the last one/);
});

test('an alternate on a stale TAF says so on its card line and in the list of hits', () => {
  const m = model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS }, tafNotes: { CYQR: STALE } });
  assert.match(m.altLines.get('CYQR').reason ?? '', /STALE TAF, valid period ended 5 min ago/);
  assert.equal(m.altLines.get('CYYN').reason, model({ waves: [EARLY], tafs: { CYMJ: taf(HOME_TAF.lowFromEvening), ...GOOD_ALTS } }).altLines.get('CYYN').reason, 'the others are unchanged');
  const alt = m.detail.alternates.find((a) => a.icao === 'CYQR');
  assert.match(alt.why ?? '', /STALE TAF/);
  assert.equal(alt.tone === 'ok', false, 'not a plain tick');
});

// ---- A day the clocks change: each time carries its own zone name ----------------------------------------------

const TORONTO = 'America/Toronto';
const HOUR = 3_600_000;

for (const kind of ['forward', 'back']) {
  const change = smallHoursChange(TORONTO, 2026, kind);
  test(`on the day the clocks go ${kind} (${TORONTO}) a wave across the change names both zones, and the day says both`, { skip: change ? false : noChange(TORONTO, 2026, kind) }, () => {
    const before = zoneAbbreviation(new Date(+change.at - 3 * HOUR), TORONTO);
    const after = zoneAbbreviation(new Date(+change.at + 3 * HOUR), TORONTO);
    assert.notEqual(before, after, 'the tz data has two names either side of the change');
    const noon = new Date(+change.at + 8 * HOUR);
    const at = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const takeoff = at(change.wallMinutes - 30 < 0 ? 0 : change.wallMinutes - 30);
    const land = at(change.wallMinutes + 3 * 60);
    const across = model({ waves: [w('w1', takeoff, land)], timeZone: TORONTO, now: noon });
    assert.equal(across.zone, `${before}/${after}`);
    assert.equal(across.rows[0].title, `W1 ${takeoff.replace(':', '')} ${before}–${land.replace(':', '')} ${after}`);
    // Two times after the change use the name after it, whatever the day began as.
    const late = model({ waves: [w('w1', '15:00', '16:30')], timeZone: TORONTO, now: noon });
    assert.equal(late.rows[0].title, `W1 1500–1630 ${after}`);
    const early = model({ waves: [w('w1', '00:10', '00:40')], timeZone: TORONTO, now: noon });
    assert.equal(early.rows[0].title, `W1 0010–0040 ${before}`);
  });
}

test('an ordinary day names one zone, as before', () => {
  const m = model({ waves: [EARLY], timeZone: ZONE });
  assert.equal(m.zone, 'CST');
  assert.equal(m.rows[0].title, 'W1 1230–1400 CST');
});

test('a landing at the same time as takeoff has no call, and the row says why', () => {
  const m = model({ waves: [w('w1', '08:00', '08:00')] });
  assert.equal(m.rows[0].chip, null);
  assert.equal(m.rows[0].note, 'Landing is the same time as takeoff: set a later time, or an earlier one for the next day');
  assert.equal(m.rows[0].problem, true, 'N2: the boxes are marked invalid, not just given a note');
  assert.deepEqual(m.calls, []);
});
