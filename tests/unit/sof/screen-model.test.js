// Tests for src/modules/sof/screen-model.js: everything the SOF screen says,
// decided without a page (SPEC-sof, "The screen": SOF bar, Airfield cards). The
// page code only draws these answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { buildScreen, feedStatus, alertText, trafficUrl, CREDITS, STALE_FEED_MIN } from '../../../src/modules/sof/screen-model.js';
import { METAR, HOME_TAF } from '../../fixtures/sof/reports.js';

const MIN = 60_000;
const NOW = new Date('2026-09-29T18:42:00Z');
const airfields = () => createAirfields({ store: createStore(null).scope('airfields') });

const metar = (raw, now = NOW) => ({ raw, report: parseMetar(raw, { now }), source: 'metno' });
const taf = (raw, now = NOW) => ({ raw, report: parseTaf(raw, { now }), source: 'metno' });
const round = (kind, at = NOW, { metars = [], tafs = [], sources = [] } = {}) => ({
  kind, at, sources, fresh: { metar: new Set(metars), taf: new Set(tafs) },
});
const snap = (extra = {}) => ({ metar: {}, taf: {}, newestAt: null, lastRound: null, busy: false, stopped: false, ...extra });
const screen = (extra = {}) => buildScreen({ airfields: airfields(), snapshot: snap(), limits: { ceilingFt: 2000, visSm: 3 }, now: NOW, ...extra });

// ---- The bar ------------------------------------------------------------------------------

test('the DTG is in V6\'s form, from the clock given', () => {
  assert.equal(screen().dtg, '291842Z SEP 26');
  assert.equal(screen().dtgIso, '2026-09-29T18:42:00.000Z');
});

test('the credits carry the "not for flight planning" line and where the weather comes from', () => {
  assert.equal(screen().credits, CREDITS);
  assert.match(CREDITS, /Not for flight planning/);
  assert.match(CREDITS, /NAV CANADA/);
  assert.match(CREDITS, /MET Norway \(CC BY 4\.0\)/);
  assert.match(CREDITS, /Datamask/);
});

// ---- Feed status in words -----------------------------------------------------------------------

const words = (snapshot, at = NOW) => feedStatus(snapshot, at).text;

test('feed status: a round that worked says how long ago, in words and a symbol', () => {
  const s = snap({ lastRound: round('ok', new Date(+NOW - 2 * MIN)), newestAt: new Date(+NOW - 2 * MIN) });
  assert.equal(words(s), 'Weather 2 min ago ✓');
  assert.equal(feedStatus(s, NOW).tone, 'ok');
  assert.equal(words(snap({ lastRound: round('ok', NOW), newestAt: NOW })), 'Weather just now ✓');
});

test('feed status: past 15 minutes without a round that worked it says STALE, never fresh', () => {
  assert.equal(STALE_FEED_MIN, 15);
  const at = new Date(+NOW - 48 * MIN);
  const s = snap({ lastRound: round('ok', at), newestAt: at });
  assert.equal(words(s), 'Weather STALE 48 min ⚠');
  assert.equal(feedStatus(s, NOW).tone, 'bad');
  const edge = snap({ lastRound: round('ok', new Date(+NOW - 15 * MIN)), newestAt: new Date(+NOW - 15 * MIN) });
  assert.equal(words(edge), 'Weather 15 min ago ✓', 'exactly 15 is not yet stale');
});

test('feed status: a round out says Refreshing, and what is being shown meanwhile', () => {
  assert.equal(words(snap({ busy: true })), 'Weather Refreshing… ⟳');
  const at = new Date(+NOW - 12 * MIN);
  assert.equal(words(snap({ busy: true, newestAt: at, lastRound: round('ok', at) })), 'Weather Refreshing… (showing 12 min old) ⟳');
  assert.equal(feedStatus(snap({ busy: true }), NOW).tone, 'busy');
});

test('feed status: every feed failing says Failed and the age of what is still shown', () => {
  const at = new Date(+NOW - 12 * MIN);
  const failed = snap({ lastRound: round('failed', NOW, { sources: ['metno', 'datamask'] }), newestAt: at });
  assert.equal(words(failed), 'Weather Failed, showing 12 min old ⚠');
  assert.equal(feedStatus(failed, NOW).tone, 'bad');
  assert.equal(words(snap({ lastRound: round('failed', NOW) })), 'Weather Failed, no reports yet ⚠');
});

test('feed status: replies with no reports in them, not started yet, and off', () => {
  assert.equal(words(snap({ lastRound: round('empty', NOW) })), 'Weather No reports found ⚠');
  assert.equal(words(snap()), 'Weather Starting… ⟳');
  assert.equal(words(snap({ stopped: true })), 'Weather Off –');
});

test('feed status names the sources that answered', () => {
  const s = snap({ metar: { CYMJ: metar(METAR.fresh) }, taf: { CYMJ: { ...taf(HOME_TAF.good), source: 'datamask' } }, lastRound: round('ok'), newestAt: NOW });
  assert.match(feedStatus(s, NOW).title, /MET Norway/);
  assert.match(feedStatus(s, NOW).title, /Datamask/);
  assert.match(feedStatus(snap(), NOW).title, /every 5 minutes/);
});

// ---- Every feed failing ---------------------------------------------------------------------------

test('the alert is there only when the last round failed, and says who failed and what is still shown', () => {
  const at = new Date(+NOW - 12 * MIN);
  const failed = snap({ lastRound: round('failed', NOW, { sources: ['metno', 'datamask'] }), newestAt: at });
  assert.equal(
    alertText(failed, NOW),
    'Weather feeds are not answering (MET Norway and NOAA NWS via Datamask both failed at 1842Z). Showing the last reports, 12 min old.',
  );
  assert.equal(alertText(snap({ lastRound: round('ok') }), NOW), null);
  assert.equal(alertText(snap({ busy: true, lastRound: round('ok') }), NOW), null);
  assert.equal(alertText(snap(), NOW), null);
});

test('the alert with nothing to show says so, and with one source only names it', () => {
  assert.equal(
    alertText(snap({ lastRound: round('failed', NOW, { sources: ['metno'] }) }), NOW),
    'Weather feeds are not answering (MET Norway failed at 1842Z). No reports are being shown yet.',
  );
  assert.equal(
    alertText(snap({ lastRound: round('failed', NOW) }), NOW),
    'Weather feeds are not answering (failed at 1842Z). No reports are being shown yet.',
  );
});

// ---- The cards ------------------------------------------------------------------------------------------

test('a card for home, then one for each alternate, in the order set in Settings', () => {
  assert.deepEqual(screen().cards.map((c) => [c.icao, c.role, c.name]), [
    ['CYMJ', 'HOME', 'Moose Jaw'], ['CYQR', 'ALT', 'Regina'], ['CYYN', 'ALT', 'Swift Current'], ['CYXE', 'ALT', 'Saskatoon'],
  ]);
  const a = airfields();
  a.update({ alternates: ['CYXE', 'CYQR'] });
  assert.deepEqual(buildScreen({ airfields: a, snapshot: snap(), limits: {}, now: NOW }).cards.map((c) => c.icao), ['CYMJ', 'CYXE', 'CYQR']);
});

test('an airfield that is home and an alternate at once gets one card', () => {
  const fake = {
    home: () => ({ icao: 'CYMJ', name: 'Moose Jaw' }),
    alternates: () => [{ icao: 'CYMJ', name: 'Moose Jaw' }, { icao: 'CYQR', name: 'Regina' }],
    checkOptions: () => ({}),
  };
  assert.deepEqual(buildScreen({ airfields: fake, snapshot: snap(), limits: {}, now: NOW }).cards.map((c) => c.icao), ['CYMJ', 'CYQR']);
});

test('home is judged against the home limits from Settings, and says which', () => {
  const s = snap({ metar: { CYMJ: metar('METAR CYMJ 291800Z 27010KT 15SM BKN025 15/02 A2952') }, lastRound: round('ok', NOW, { metars: ['CYMJ'] }), newestAt: NOW });
  const local = screen({ snapshot: s, limits: { ceilingFt: 2000, visSm: 3 } }).cards[0];
  assert.equal(local.result.level, 'within');
  assert.equal(local.limitsLabel, 'Limits');
  assert.equal(local.limitsText, 'Local (MTCA) 2000/3');
  const cross = screen({ snapshot: s, limits: { ceilingFt: 3000, visSm: 3 } }).cards[0];
  assert.equal(cross.result.level, 'below');
  assert.equal(cross.result.words, 'Below limits: CEILING 2500 FT < 3000 FT');
  assert.equal(cross.limitsText, 'Cross-country 3000/3');
});

test('an alternate is judged against its own minima, and an alternate below them says so (#4)', () => {
  const a = airfields();
  a.update({ fields: { CYQR: { approach: 'non-precision' } } });
  const s = snap({ metar: { CYQR: metar('METAR CYQR 291800Z 26005KT 2SM BR BKN007 10/08 A2995') }, lastRound: round('ok', NOW, { metars: ['CYQR'] }), newestAt: NOW });
  const card = buildScreen({ airfields: a, snapshot: s, limits: {}, now: NOW }).cards[1];
  assert.equal(card.icao, 'CYQR');
  assert.equal(card.result.level, 'below');
  assert.equal(card.limitsLabel, 'Minima');
  assert.match(card.limitsText, /^800-2/);
  assert.equal(card.limitsNote, null);
});

test('an alternate whose approaches are not set is checked against 600-2 and says so (D95)', () => {
  const card = screen().cards[1];
  assert.equal(card.limitsText, '600-2');
  assert.equal(card.limitsNote, 'Approaches not set in Settings: checked against 600-2');
});

test('a station with no METAR says so with the time of the last try; before any try it has no time', () => {
  const tried = screen({ snapshot: snap({ lastRound: round('ok', NOW, { metars: ['CYQR'] }) }) }).cards[0];
  assert.equal(tried.metar.state, 'missing');
  assert.equal(tried.metar.words, 'No METAR from MET Norway or Datamask (last tried 1842Z)');
  assert.equal(screen().cards[0].metar.words, 'No METAR from MET Norway or Datamask');
});

test('a report the last round could not refresh stays, with its age, and says the refresh failed (#8)', () => {
  const old = metar(METAR.fresh);
  const s = snap({ metar: { CYMJ: old }, lastRound: round('failed', NOW, { sources: ['metno', 'datamask'] }), newestAt: NOW });
  const card = screen({ snapshot: s }).cards[0];
  assert.equal(card.metar.raw, METAR.fresh);
  assert.equal(card.metar.label, 'METAR 1800Z (42 min ago)');
  assert.equal(card.metar.refreshFailed, true);
  assert.equal(card.metar.refreshNote, 'Last refresh failed (tried 1842Z)');
});

test('a report that the last round did refresh has no failure note, and one shown before any round has none either', () => {
  const entry = metar(METAR.fresh);
  const fresh = screen({ snapshot: snap({ metar: { CYMJ: entry }, lastRound: round('ok', NOW, { metars: ['CYMJ'] }) }) }).cards[0];
  assert.equal(fresh.metar.refreshFailed, false);
  const seeded = screen({ snapshot: snap({ metar: { CYMJ: entry } }) }).cards[0];
  assert.equal(seeded.metar.refreshFailed, false);
});

test('an old report reads as stale by its own time, however recently it was fetched', () => {
  const entry = metar(METAR.fresh, new Date('2026-09-29T18:00:00Z'));
  const later = new Date('2026-09-29T19:40:00Z');
  const card = screen({ snapshot: snap({ metar: { CYMJ: entry }, lastRound: round('ok', later, { metars: ['CYMJ'] }) }), now: later }).cards[0];
  assert.equal(card.metar.state, 'stale');
  assert.equal(card.metar.staleText, 'STALE: 1 h 40 min old');
});

test('a TAF that lasts is shown with its time; a cancelled one says so in words', () => {
  const s = snap({
    taf: { CYMJ: taf(HOME_TAF.good), CYQR: taf('TAF CYQR 291740Z 2918/3018 CNL') },
    lastRound: round('ok', NOW, { tafs: ['CYMJ', 'CYQR'] }),
  });
  const cards = screen({ snapshot: s }).cards;
  assert.equal(cards[0].taf.label, 'TAF 1740Z, valid 29/18–30/06');
  assert.equal(cards[1].taf.words, 'TAF cancelled');
});

test('nothing in the model is HTML: report text passes through as plain strings', () => {
  const raw = 'METAR CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952 RMK <img src=x onerror=alert(1)>';
  const card = screen({ snapshot: snap({ metar: { CYMJ: metar(raw) } }) }).cards[0];
  assert.equal(card.metar.raw, raw);
  assert.equal(typeof card.metar.raw, 'string');
});

test('a home field with no name is not shown as "null"', () => {
  const fake = { home: () => ({ icao: 'ZZZZ', name: null }), alternates: () => [], checkOptions: () => ({}) };
  assert.equal(buildScreen({ airfields: fake, snapshot: snap(), limits: {}, now: NOW }).cards[0].name, '');
});

// ---- The Traffic link ------------------------------------------------------------------------------------

test('the Traffic link is ADS-B Exchange centred on home, built from numbers only', () => {
  const url = screen().trafficUrl;
  assert.equal(url, 'https://globe.adsbexchange.com/?lat=50.3303&lon=-105.5590&zoom=6');
  assert.equal(trafficUrl({ lat: 52.1708, lon: -106.6997 }), 'https://globe.adsbexchange.com/?lat=52.1708&lon=-106.6997&zoom=6');
});

test('with no usable position there is no Traffic link', () => {
  for (const bad of [null, {}, { lat: null, lon: null }, { lat: 'x', lon: 1 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: NaN, lon: 0 }]) {
    assert.equal(trafficUrl(bad), null);
  }
});
