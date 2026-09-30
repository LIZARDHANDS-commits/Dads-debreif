// Tests for src/modules/sof/screen-model.js: everything the SOF screen says,
// decided without a page (SPEC-sof, "The screen": SOF bar, Airfield cards). The
// page code only draws these answers.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar } from '../../../src/wx/metar.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { lightningNearHome } from '../../../src/modules/sof/lightning.js';
import { buildScreen, feedStatus, alertText, CREDITS, STALE_FEED_MIN } from '../../../src/modules/sof/screen-model.js';
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

test('feed status says when it will try again: the last round plus 5 minutes, in Zulu', () => {
  const at = new Date(+NOW - 2 * MIN);
  const status = feedStatus(snap({ lastRound: round('ok', at), newestAt: at }), NOW);
  assert.match(status.title, /Asks again about 1845Z\./);
  assert.equal(status.detail, status.title, 'the same words are on the page, not only in a tooltip');
  assert.doesNotMatch(feedStatus(snap({ stopped: true }), NOW).title, /Asks again/);
});

test('the home limits are checked as snapped up: a hand-typed 2049 is checked as 2100 (R1)', () => {
  const s = snap({ metar: { CYMJ: metar('METAR CYMJ 291800Z 27010KT 15SM BKN021 15/02 A2952') }, lastRound: round('ok', NOW, { metars: ['CYMJ'] }), newestAt: NOW });
  const card = screen({ snapshot: s, limits: { ceilingFt: 2049, visSm: 2.8 } }).cards[0];
  assert.equal(card.limitsText, 'Custom 2100/3');
  assert.equal(card.result.level, 'at-limit', 'a 2100 ft ceiling is exactly on the snapped limit; rounding to the nearest would have said within');
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

// ---- Cautions, with lightning (SPEC-sof, SOF-3) ---------------------------------------------------

const HOME = { icao: 'CYMJ', lat: 50.3303, lon: -105.559 };
const LAYER_TIME = new Date(+NOW - 4 * MIN);
const COVER = { bounds: { west: HOME.lon - 2, south: HOME.lat - 1, east: HOME.lon + 2, north: HOME.lat + 1 }, cellsRead: 5000 };
const CELL = { lat: 50.4714, lon: -105.337, value: 3 };
const nearby = (at = NOW, episode) => lightningNearHome({ samples: [CELL], coverage: COVER, home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: at, episode });
const quiet = () => lightningNearHome({ samples: [], coverage: COVER, home: HOME, radiusNm: 20, layerTime: LAYER_TIME, now: NOW });

test('without a lightning answer the screen has no lightning and no lightning caution', () => {
  const s = screen();
  assert.equal(s.lightning, null);
  assert.deepEqual(s.cautions.filter((c) => c.source === 'LIGHTNING'), []);
});

test('lightning near home puts its caution in the screen\'s caution list, keeping lightning.js\'s key', () => {
  const found = nearby();
  const s = screen({ lightning: found });
  const c = s.cautions.filter((x) => x.source === 'LIGHTNING');
  assert.equal(c.length, 1);
  assert.equal(c[0].key, found.caution.key);
  assert.equal(c[0].icao, 'CYMJ');
  assert.equal(c[0].level, 'caution');
  assert.equal(c[0].acknowledged, false);
  assert.equal(s.lightning, found);
});

test('clear lightning, or "can\'t tell", raises nothing', () => {
  for (const answer of [quiet(), lightningNearHome({ samples: null, home: HOME, layerTime: LAYER_TIME, now: NOW })]) {
    assert.deepEqual(screen({ lightning: answer }).cautions.filter((c) => c.source === 'LIGHTNING'), [], answer.state);
  }
});

test('the caution list also holds a report below its limits, worst first, with lightning after it', () => {
  const below = metar('CYMJ 291800Z 25008KT 1SM BR OVC004 12/11 A2990');
  const s = screen({ snapshot: snap({ metar: { CYMJ: below }, lastRound: round('ok', NOW, { metars: ['CYMJ'] }) }), lightning: nearby() });
  assert.equal(s.cautions[0].level, 'below');
  assert.equal(s.cautions[0].source, 'METAR');
  assert.equal(s.cautions.at(-1).source, 'LIGHTNING');
});

test('the same lightning is the same caution on the next screen (an acknowledgement holds)', () => {
  const first = nearby();
  const later = new Date(+NOW + MIN);
  const again = nearby(later, first.episode);
  const key = (r, at) => screen({ lightning: r, now: at }).cautions.find((c) => c.source === 'LIGHTNING').key;
  assert.equal(key(again, later), key(first, NOW));
});

test('extraCautions is the list the banner reads: lightning.js\'s caution when there is one, else empty', () => {
  const found = nearby();
  assert.deepEqual(screen({ lightning: found }).extraCautions, [found.caution]);
  assert.deepEqual(screen({ lightning: quiet() }).extraCautions, []);
  assert.deepEqual(screen().extraCautions, []);
});

// ---- R2: a fetched-just-now header does not hide reports that are old -------------------------------------------

test('feed status: fetched just now, but the newest METAR was observed hours ago, says so and drops the tick', () => {
  const old = 'METAR CYMJ 291000Z 25010KT 15SM FEW100 15/02 A2952';
  const s = snap({ metar: { CYMJ: metar(old) }, lastRound: round('ok', NOW), newestAt: NOW });
  const f = feedStatus(s, NOW);
  assert.equal(f.text, 'Weather just now, newest METAR observed 8 h 42 min ago ⚠');
  assert.equal(f.tone, 'bad');
  assert.equal(f.symbol, '⚠');
});

test('feed status: the age is of the newest observation, not of the fetch; a fresh METAR keeps the plain wording', () => {
  const old = 'METAR CYMJ 291000Z 25010KT 15SM FEW100 15/02 A2952';
  const fresh = 'METAR CYQR 291800Z 26005KT 15SM FEW080 16/08 A2995';
  const both = snap({ metar: { CYMJ: metar(old), CYQR: metar(fresh) }, lastRound: round('ok', NOW), newestAt: NOW });
  assert.equal(words(both), 'Weather just now ✓', 'one current report is enough');
  const edge = snap({ metar: { CYMJ: metar('METAR CYMJ 291730Z 25010KT 15SM FEW100 15/02 A2952') }, lastRound: round('ok', NOW), newestAt: NOW });
  assert.equal(words(edge), 'Weather just now ✓', '72 min is not yet stale');
  assert.equal(words(snap({ lastRound: round('ok', NOW), newestAt: NOW })), 'Weather just now ✓', 'no METARs held: nothing to say about their age');
});

test('feed status: uses only the clock it is given, never the real one (a month away from it)', () => {
  const fresh = 'METAR CYMJ 291800Z 25010KT 15SM FEW100 15/02 A2952';
  const s = snap({ metar: { CYMJ: metar(fresh) }, lastRound: round('ok', NOW), newestAt: NOW });
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T23:00:00Z') });
  try {
    assert.equal(feedStatus(s, NOW).text, 'Weather just now ✓');
    assert.equal(screen({ snapshot: s }).feed.text, 'Weather just now ✓');
  } finally {
    mock.timers.reset();
  }
});

test("F1: a held lightning caution (the reading is failed or old, state 'unknown') stays in the caution list, same key, and a plain can't-tell line too", () => {
  const found = nearby();
  const held = { ...lightningNearHome({ samples: null, home: HOME, layerTime: LAYER_TIME, now: NOW }), caution: { ...found.caution, reason: "Lightning within 20 NM (can't tell now, last seen 12 min ago)", text: "Caution: CYMJ lightning: within 20 NM (can't tell now, last seen 12 min ago)", stale: true } };
  assert.equal(held.state, 'unknown');
  const line = screen({ lightning: held }).cautions.find((c) => c.source === 'LIGHTNING');
  assert.equal(line.key, found.caution.key);
  assert.equal(line.text, "Caution: CYMJ lightning: within 20 NM (can't tell now, last seen 12 min ago)");
  const plain = { ...held, caution: { ...held.caution, key: 'CYMJ|LIGHTNING|CANT-TELL|2026-09-29T18:42Z', text: "Lightning: can't tell", reason: "Lightning: can't tell" } };
  const plainLine = screen({ lightning: plain }).cautions.find((c) => c.source === 'LIGHTNING');
  assert.equal(plainLine.level, 'caution', 'amber, never the red below-limits level');
  assert.equal(plainLine.text, "Lightning: can't tell");

// ---- N3 and N4: the observation age, beside the closed-field rule and a failed round -----------------------------

const OLD = 'METAR CYMJ 291000Z 25010KT 15SM FEW100 15/02 A2952';
const CLOSED = 'METAR CYMJ 291000Z 25010KT 15SM FEW100 15/02 A2952 RMK LAST OBS/NXT 300000Z';

test('N3: the newest METAR is a closed field\'s last observation with the next one still ahead: no warning', () => {
  const s = snap({ metar: { CYMJ: metar(CLOSED) }, lastRound: round('ok', NOW), newestAt: NOW });
  assert.equal(words(s), 'Weather just now ✓');
  // The same report once the next observation was due is old like any other.
  assert.match(words(s, new Date('2026-09-30T00:30:00Z')), /newest METAR observed/);
});

test('N3: a closed field that is the newest is not warned about, but a stale open one still is', () => {
  const both = snap({ metar: { CYMJ: metar(CLOSED), CYQR: metar('METAR CYQR 290900Z 26005KT 15SM FEW080 16/08 A2995') }, lastRound: round('ok', NOW), newestAt: NOW });
  assert.equal(words(both), 'Weather just now ✓', 'the closed field is the newest, and it is accepted');
  assert.match(words(snap({ metar: { CYMJ: metar(OLD) }, lastRound: round('ok', NOW), newestAt: NOW })), /observed 8 h 42 min ago/);
});

test('N4: a failed round with stale METARs says how old the newest observation is, on the bar and in the alert', () => {
  const at = new Date(+NOW - 5 * MIN);
  const failed = snap({ metar: { CYMJ: metar(OLD) }, lastRound: round('failed', NOW, { sources: ['metno', 'datamask'] }), newestAt: at });
  assert.equal(words(failed), 'Weather Failed, showing 5 min old, newest METAR observed 8 h 42 min ago ⚠');
  assert.match(alertText(failed, NOW), /Showing the last reports, 5 min old\. The newest METAR was observed 8 h 42 min ago\.$/);
});

test('N4: a failed round with a current METAR, or a closed field, keeps the plain words', () => {
  const at = new Date(+NOW - 5 * MIN);
  const fresh = snap({ metar: { CYMJ: metar('METAR CYMJ 291800Z 25010KT 15SM FEW100 15/02 A2952') }, lastRound: round('failed', NOW, { sources: ['metno'] }), newestAt: at });
  assert.equal(words(fresh), 'Weather Failed, showing 5 min old ⚠');
  assert.doesNotMatch(alertText(fresh, NOW), /observed/);
  const closed = snap({ metar: { CYMJ: metar(CLOSED) }, lastRound: round('failed', NOW, { sources: ['metno'] }), newestAt: at });
  assert.equal(words(closed), 'Weather Failed, showing 5 min old ⚠');
});
