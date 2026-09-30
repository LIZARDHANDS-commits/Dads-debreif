// Tests for src/modules/sof/banner-model.js: what the caution banner says and does,
// decided without a page (SPEC-sof, "Caution banner", task 3). cautions.js decides which
// cautions exist and which are new; the model only turns that into lines in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { buildScreen } from '../../../src/modules/sof/screen-model.js';
import {
  buildBanner, acksAfterOne, acksAfterAll, memoryAfterOne, memoryAfterAll, newKeys, tafInputs, ACKS_KEY,
} from '../../../src/modules/sof/banner-model.js';
import { buildWaves } from '../../../src/modules/sof/waves-view-model.js';
import { HOME_TAF } from '../../fixtures/sof/reports.js';

const NOW = new Date('2026-09-29T18:42:00Z');
const ZONE = 'America/Regina';
const LIMITS = { ceilingFt: 2000, visSm: 3 };
const airfields = () => createAirfields({ store: createStore(null).scope('airfields') });

const metar = (raw) => ({ raw, report: parseMetar(raw, { now: NOW }), source: 'metno' });
const taf = (raw) => ({ raw, report: parseTaf(raw, { now: NOW }), source: 'metno' });
const FINE = {
  CYMJ: metar('CYMJ 291800Z 25010KT 15SM BKN050 18/02 A2952'),
  CYQR: metar('CYQR 291800Z 26005KT 15SM FEW080 16/08 A2995'),
  CYYN: metar('CYYN 291800Z 24010KT 9SM CLR 15/00 A2951'),
  CYXE: metar('CYXE 291800Z 28010KT 15SM FEW080 16/03 A2952'),
};
const LOW_REGINA = metar('CYQR 291800Z 26005KT 2SM BR BKN004 10/08 A2995');
const STORM_HOME = metar('CYMJ 291800Z 25010KT 6SM VCTS BKN050 18/02 A2952');

function banner({ metars = FINE, tafs = {}, acks, enabled, extra, shown, memory, now = NOW, timeZone = ZONE } = {}) {
  const fields = airfields();
  const snapshot = { metar: metars, taf: tafs, newestAt: NOW, lastRound: null, busy: false, stopped: false };
  const cards = buildScreen({ airfields: fields, snapshot, limits: LIMITS, now }).cards;
  const reports = Object.fromEntries(Object.entries(tafs).map(([icao, e]) => [icao, e.report]));
  return buildBanner({ cards, tafs: tafInputs({ tafs: reports, calls: [], homeIcao: 'CYMJ', now, timeZone }), extra, acks, now, timeZone, enabled, shown, memory });
}

test('nothing below limits and nothing dangerous: no banner, nothing to store', () => {
  const b = banner();
  assert.equal(b.show, false);
  assert.deepEqual(b.lines, []);
  assert.equal(b.count, 0);
  assert.equal(b.ackAllLabel, null);
});

test('a report below its limits raises a line in words, with the airfield, the report and the reason', () => {
  const b = banner({ metars: { ...FINE, CYQR: LOW_REGINA } });
  assert.equal(b.show, true);
  assert.equal(b.lines.length, 1);
  const [line] = b.lines;
  assert.match(line.text, /^Below limits: CYQR METAR 1800Z: CEILING 400 FT < 600 FT/);
  assert.equal(line.icao, 'CYQR');
  assert.equal(line.level, 'below');
  assert.equal(line.symbol, '▼', 'the symbol sits beside the words, so it is never colour alone');
  assert.equal(b.heading, '1 new caution');
});

test('dangerous weather in a METAR is a caution line', () => {
  const b = banner({ metars: { ...FINE, CYMJ: STORM_HOME } });
  assert.equal(b.lines.length, 1);
  assert.match(b.lines[0].text, /Caution: CYMJ METAR 1800Z: THUNDERSTORM \/ SEVERE WX \(VCTS\)/);
  assert.equal(b.lines[0].symbol, '⚠');
});

test('a caution in a TAF is a line that names the group and its times', () => {
  const b = banner({ tafs: { CYMJ: taf(HOME_TAF.tempoFog) } });
  const line = b.lines.find((l) => l.icao === 'CYMJ');
  assert.ok(line, 'the TAF caution is listed');
  assert.match(line.text, /CYMJ TAF TEMPO 30\/00Z–30\/03Z: SIGNIFICANT WX \(FG\)/);
});

test('the heading counts the lines, and Acknowledge all is offered only when there is more than one', () => {
  const two = banner({ metars: { ...FINE, CYQR: LOW_REGINA, CYMJ: STORM_HOME } });
  assert.equal(two.count, 2);
  assert.equal(two.heading, '2 new cautions');
  assert.equal(two.ackAllLabel, 'Acknowledge all');
  assert.equal(banner({ metars: { ...FINE, CYQR: LOW_REGINA } }).ackAllLabel, null);
});

test('acknowledging one clears its line and leaves the other', () => {
  const first = banner({ metars: { ...FINE, CYQR: LOW_REGINA, CYMJ: STORM_HOME } });
  const acks = acksAfterOne(first, first.lines[0].key);
  const next = banner({ metars: { ...FINE, CYQR: LOW_REGINA, CYMJ: STORM_HOME }, acks });
  assert.equal(next.count, 1);
  assert.equal(next.lines[0].key, first.lines[1].key);
});

test('Acknowledge all clears the banner, and the same caution in the next report does not raise it again', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA, CYMJ: STORM_HOME };
  const first = banner({ metars });
  const acks = acksAfterAll(first);
  assert.equal(banner({ metars, acks }).show, false);
  // The next report (a later time, the same weather) is the same caution.
  const later = { ...metars, CYQR: metar('CYQR 291900Z 26005KT 2SM BR BKN004 10/08 A2995') };
  assert.equal(banner({ metars: later, acks }).show, false, 'acknowledged stays acknowledged');
});

test('a caution that clears and comes back is new again, and a different one at the same field is new', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars });
  let acks = acksAfterAll(first);
  const cleared = banner({ metars: FINE, acks });
  assert.equal(cleared.show, false);
  acks = cleared.acks; // what the screen stores after the clear
  assert.equal(banner({ metars, acks }).show, true, 'back again: new');
  const different = { ...FINE, CYQR: metar('CYQR 291800Z 26005KT 6SM VCTS FEW080 16/08 A2995') };
  assert.equal(banner({ metars: different, acks: acksAfterAll(first) }).show, true, 'a different caution is new');
});

test('the setting off hides the banner but the cautions are still worked out and kept', () => {
  const b = banner({ metars: { ...FINE, CYQR: LOW_REGINA }, enabled: false });
  assert.equal(b.show, false);
  assert.equal(b.count, 1, 'still counted, for the cards and for coming back on');
  assert.deepEqual(b.announce, []);
});

test('cautions handed in as extra (lightning) are listed with the rest, and can be acknowledged', () => {
  const lightning = {
    key: 'CYMJ|LIGHTNING|20', icao: 'CYMJ', source: 'LIGHTNING', level: 'caution',
    text: 'Caution: CYMJ LIGHTNING: strikes 12 NM from the field',
  };
  const b = banner({ extra: [lightning] });
  assert.equal(b.lines.length, 1);
  assert.match(b.lines[0].text, /LIGHTNING/);
  assert.equal(banner({ extra: [lightning], acks: acksAfterAll(b) }).show, false);
  assert.equal(banner({ extra: [{ nonsense: true }, null, 'x'] }).show, false, 'anything that is not a caution is ignored');
});

test('announce lists only lines that were not on the banner before, so role=alert is for new cautions only', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars, shown: [] });
  assert.deepEqual(first.announce, [first.lines[0].key]);
  const again = banner({ metars, shown: first.lines.map((l) => l.key) });
  assert.deepEqual(again.announce, [], 'the same banner on the next tick is not announced again');
  const more = banner({ metars: { ...metars, CYMJ: STORM_HOME }, shown: first.lines.map((l) => l.key) });
  assert.equal(more.announce.length, 1);
  assert.match(more.lines.find((l) => l.key === more.announce[0]).text, /CYMJ METAR/);
  assert.deepEqual(newKeys(['a', 'b'], [{ key: 'b' }, { key: 'c' }]), ['c']);
});

test('the signature changes only when what the banner shows changes', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const a = banner({ metars });
  assert.equal(banner({ metars }).signature, a.signature);
  assert.notEqual(banner({ metars: { ...metars, CYMJ: STORM_HOME } }).signature, a.signature);
  assert.notEqual(banner({ metars, acks: acksAfterAll(a) }).signature, a.signature);
  assert.notEqual(banner({ metars, enabled: false }).signature, a.signature);
});

test('acknowledgements are for storing only when they can be told which day they are for', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars });
  assert.equal(first.storable, true);
  assert.equal(ACKS_KEY, 'cautionAcks');
  const acks = acksAfterAll(first);
  assert.equal(acks.day, '2026-09-29', 'the day is the home zone\'s');
  // With no readable zone nothing is kept: an acknowledgement with no day could never expire.
  const noZone = banner({ metars, timeZone: 'Not/AZone' });
  assert.equal(noZone.storable, false);
  assert.equal(acksAfterAll(noZone), null);
  assert.equal(acksAfterOne(noZone, noZone.lines[0].key), null);
});

test('acknowledgements from another day read as nothing acknowledged', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const acks = acksAfterAll(banner({ metars }));
  const tomorrow = new Date('2026-09-30T18:42:00Z');
  assert.equal(banner({ metars, acks, now: tomorrow }).show, true);
});

test('the banner says whether what is stored has to change, so the screen writes only when it must', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars });
  assert.equal(first.write, false, 'nothing stored yet and nothing to prune');
  const acks = acksAfterAll(first);
  assert.equal(banner({ metars, acks }).write, false, 'unchanged');
  assert.equal(banner({ metars: FINE, acks }).write, true, 'the cleared caution is pruned from what is stored');
});

// ---- One line for one caution, however many looks at the TAF found it -------------------------------------------

test('two FM groups with the same fog, seen by the banner window and by a wave, are one line', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC FM292000 22010KT 1/2SM FG VV002 FM300000 22010KT 1/4SM FG VV001';
  const reports = { CYMJ: parseTaf(raw, { now: NOW }) };
  const fields = airfields();
  const wavePlan = { version: 1, day: 'today', dayChosen: null, waves: [{ id: 'w1', name: '', takeoff: '12:30', land: '16:00' }] };
  const waves = buildWaves({ plan: wavePlan, airfields: fields, tafs: reports, limits: LIMITS, now: NOW, timeZone: ZONE });
  const snapshot = { metar: FINE, taf: { CYMJ: taf(raw) }, newestAt: NOW, lastRound: null, busy: false, stopped: false };
  const cards = buildScreen({ airfields: fields, snapshot, limits: LIMITS, now: NOW }).cards;
  const b = buildBanner({ cards, tafs: tafInputs({ tafs: reports, calls: waves.calls, homeIcao: 'CYMJ', now: NOW, timeZone: ZONE }), now: NOW, timeZone: ZONE });
  const fog = b.lines.filter((l) => /FG/.test(l.text));
  assert.equal(fog.length, 1, fog.map((l) => l.text).join(' | '));
});

// ---- With no readable day nothing can be stored, but Acknowledge still works for the visit ---------------------

test('with no readable zone Acknowledge still works, kept in memory for the visit', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA, CYMJ: STORM_HOME };
  const first = banner({ metars, timeZone: 'Not/AZone' });
  assert.equal(first.storable, false);
  assert.equal(first.lines.length, 2);
  const one = memoryAfterOne(first, first.lines[0].key);
  const next = banner({ metars, timeZone: 'Not/AZone', memory: one });
  assert.deepEqual(next.lines.map((l) => l.key), [first.lines[1].key]);
  assert.equal(next.acknowledgedCount, 1);
  assert.equal(next.write, false, 'nothing is written');
  const all = banner({ metars, timeZone: 'Not/AZone', memory: memoryAfterAll(next) });
  assert.equal(all.show, false);
  assert.equal(all.lines.length, 0);
});

test('a caution acknowledged in memory that goes away and comes back is new again', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars, timeZone: 'Not/AZone' });
  const memory = memoryAfterAll(first);
  const gone = banner({ metars: FINE, timeZone: 'Not/AZone', memory });
  assert.deepEqual(gone.memory, [], 'no longer reported, so no longer remembered');
  assert.equal(banner({ metars, timeZone: 'Not/AZone', memory: gone.memory }).show, true);
});

test('when the day is readable, memory is not used and Acknowledge is stored as before', () => {
  const metars = { ...FINE, CYQR: LOW_REGINA };
  const first = banner({ metars });
  assert.equal(memoryAfterAll(first), null);
  assert.equal(memoryAfterOne(first, first.lines[0].key), null);
  assert.equal(banner({ metars, memory: ['CYQR|METAR|whatever'] }).show, true, 'a stray memory does not hide a stored-day caution');
});

// ---- A wave that has been flown does not keep its fog on the banner --------------------------------------------

test('a below-limits TAF hit of a wave flown hours ago is not on the banner, and is while the period is still current', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2919/2921 1/2SM FG VV002';
  const reports = { CYMJ: parseTaf(raw, { now: NOW }) };
  const fields = airfields();
  const wavePlan = { version: 1, day: 'today', dayChosen: null, waves: [{ id: 'w1', name: '', takeoff: '13:00', land: '14:30' }] };
  const at = (now) => {
    const waves = buildWaves({ plan: wavePlan, airfields: fields, tafs: reports, limits: LIMITS, now, timeZone: ZONE });
    const snapshot = { metar: FINE, taf: { CYMJ: taf(raw) }, newestAt: now, lastRound: null, busy: false, stopped: false };
    const cards = buildScreen({ airfields: fields, snapshot, limits: LIMITS, now }).cards;
    return buildBanner({ cards, tafs: tafInputs({ tafs: reports, calls: waves.calls, homeIcao: 'CYMJ', now, timeZone: ZONE }), now, timeZone: ZONE });
  };
  const during = at(new Date('2026-09-29T19:30:00Z'));
  assert.equal(during.lines.some((l) => l.level === 'below' && /TAF/.test(l.text)), true, 'the fog is in the wave window and current');
  const later = at(new Date('2026-09-29T22:30:00Z')); // the TEMPO ended 1 h 30 min ago
  assert.deepEqual(later.lines.filter((l) => /TAF/.test(l.text)), [], later.lines.map((l) => l.text).join(' | '));
});

test('with no wave entered, a home forecast below the limits raises a banner line (the default state)', () => {
  const raw = 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2921/2923 1SM BR OVC003';
  const reports = { CYMJ: parseTaf(raw, { now: NOW }) };
  const fields = airfields();
  const snapshot = { metar: FINE, taf: { CYMJ: taf(raw) }, newestAt: NOW, lastRound: null, busy: false, stopped: false };
  const cards = buildScreen({ airfields: fields, snapshot, limits: LIMITS, now: NOW }).cards;
  const b = buildBanner({ cards, tafs: tafInputs({ tafs: reports, calls: [], homeIcao: 'CYMJ', homeLimits: LIMITS, now: NOW, timeZone: ZONE }), now: NOW, timeZone: ZONE });
  const below = b.lines.filter((l) => l.level === 'below');
  assert.ok(below.length >= 1, b.lines.map((l) => l.text).join(' | '));
  assert.match(below[0].text, /^Below limits: CYMJ TAF TEMPO 29\/21Z–29\/23Z: CEILING 300 FT < 2000 FT/);
});
