// Tests for src/modules/sof/lightning.js: lightning near the home field (SPEC-sof,
// SOF-3, Layers menu and Lightning). The map code (task 6) reads ECCC's
// Lightning_2.5km_Density image into cells { lat, lon, value }; these tests feed
// that shape in. tests/fixtures/sof/lightning-cells.json has cells placed by
// distance and bearing from CYMJ.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIGHTNING_DEFAULTS, MAX_CELLS, clampRadius, bearingDeg, compassWords, lightningNearHome,
} from '../../../src/modules/sof/lightning.js';
import { cautionList, acknowledge, evaluate, emptyAcks } from '../../../src/modules/sof/cautions.js';
import { cardModel } from '../../../src/modules/sof/cards.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { greatCircleNm } from '../../../src/airfields/distance.js';
import { METAR } from '../../fixtures/sof/reports.js';

const FIXTURE = JSON.parse(readFileSync(new URL('../../fixtures/sof/lightning-cells.json', import.meta.url), 'utf8'));
const HOME = FIXTURE.home;
const MIN = 60_000;
const NOW = new Date('2026-09-30T18:42:00Z');
const at = (minutesAgo) => new Date(+NOW - minutesAgo * MIN);
const NM_PER_DEG = (Math.PI / 180) * (6371000 / 1852); // what greatCircleNm uses
const north = (nm) => ({ lat: HOME.lat + nm / NM_PER_DEG, lon: HOME.lon, value: 1 });

// The area the caller read: a box around home wider than the biggest radius (50 NM), at ECCC's native grid.
const COVER = { bounds: { west: HOME.lon - 2, south: HOME.lat - 1, east: HOME.lon + 2, north: HOME.lat + 1 }, cellsRead: 5000 };
const check = (over = {}) => lightningNearHome({ samples: FIXTURE.inside, home: HOME, layerTime: at(5), now: NOW, coverage: COVER, ...over });

// ---- Defaults and the radius ---------------------------------------------------------------

test('the defaults are SOF-3\'s: on, 20 NM, range 5 to 50', () => {
  assert.equal(LIGHTNING_DEFAULTS.enabled, true);
  assert.equal(LIGHTNING_DEFAULTS.radiusNm, 20);
  assert.equal(LIGHTNING_DEFAULTS.minRadiusNm, 5);
  assert.equal(LIGHTNING_DEFAULTS.maxRadiusNm, 50);
});

test('the radius is kept within 5 to 50, and junk gives the default 20', () => {
  assert.deepEqual([0, 1, 4.9, 5, 20, 33.5, 50, 50.1, 500, -3].map(clampRadius), [5, 5, 5, 5, 20, 33.5, 50, 50, 50, 5]);
  for (const bad of [NaN, Infinity, -Infinity, '30', null, undefined, {}, [], true]) assert.equal(clampRadius(bad), 20, String(bad));
});

test('a radius outside the range is clamped in the answer, and it is what decides', () => {
  // A cell 3 NM away: outside a 1 NM ask, but the smallest radius is 5, so it is near.
  const r = check({ samples: [north(3)], radiusNm: 1, layerTime: at(1) });
  assert.equal(r.radiusNm, 5);
  assert.equal(r.state, 'near');
  // A cell 55 NM away is never near, even for an ask of 500 (clamped to 50).
  const far = check({ samples: [north(55)], radiusNm: 500, layerTime: at(1) });
  assert.equal(far.radiusNm, 50);
  assert.equal(far.state, 'clear');
});

// ---- Inside, outside, the boundary ---------------------------------------------------------

test('a fixture inside the radius raises: near, with the nearest distance and bearing in words', () => {
  const r = check();
  assert.equal(r.state, 'near');
  assert.equal(r.near, true);
  assert.equal(r.radiusNm, 20);
  assert.equal(r.nearestNm, 12);
  assert.equal(r.bearingDeg, 45);
  assert.equal(r.bearingWords, 'north-east');
  assert.equal(r.cells, 2); // the 12 and 18 NM cells; the one at 30 NM is outside
  assert.equal(r.words, 'Lightning about 12 NM north-east of home, within 20 NM');
  assert.ok(r.caution);
});

test('a fixture outside the radius does not raise, and still says where the nearest is', () => {
  const r = check({ samples: FIXTURE.outside });
  assert.equal(r.state, 'clear');
  assert.equal(r.near, false);
  assert.equal(r.caution, null);
  assert.equal(r.cells, 0);
  assert.equal(r.nearestNm, 25);
  assert.equal(r.bearingWords, 'north');
  assert.equal(r.words, 'No lightning within 20 NM of home (nearest about 25 NM north)');
});

test('the same cells with a bigger radius bring the outside fixture in', () => {
  const r = check({ samples: FIXTURE.outside, radiusNm: 30 });
  assert.equal(r.state, 'near');
  assert.equal(r.nearestNm, 25);
});

test('the boundary: exactly the radius is near; a cell centre more than half a cell diagonal (1 NM) beyond is not', () => {
  const exactly = check({ samples: [north(20)] });
  assert.equal(exactly.state, 'near');
  assert.equal(exactly.nearestNm, 20);
  const beyond = check({ samples: [north(21.1)] });
  assert.equal(beyond.state, 'clear');
  assert.equal(beyond.nearestNm, 21.1);
  assert.equal(beyond.caution, null);
});

test('an edge cell partly inside the radius counts as inside: centre up to 1 NM (half the cell diagonal) beyond is near', () => {
  assert.equal(check({ samples: [north(20.9)] }).state, 'near');
  assert.equal(check({ samples: [north(20.9)] }).cells, 1);
  assert.equal(check({ samples: [north(21)] }).state, 'near');
});

test('in the clear case a nearest cell within 2 NM of the radius is shown to a tenth', () => {
  assert.equal(check({ samples: [north(21.1)] }).words, 'No lightning within 20 NM of home (nearest about 21.1 NM north)');
  assert.equal(check({ samples: [north(21.9)] }).words, 'No lightning within 20 NM of home (nearest about 21.9 NM north)');
  assert.equal(check({ samples: [north(22.2)] }).words, 'No lightning within 20 NM of home (nearest about 22 NM north)');
  assert.equal(check({ samples: [north(23.4)] }).words, 'No lightning within 20 NM of home (nearest about 23 NM north)');
  });

test('partly unreadable data with nothing near can\'t tell: it is never "clear"', () => {
  const r = check({ samples: [FIXTURE.outside[0], { lat: NaN, lon: 1, value: 1 }] });
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution, null);
  assert.equal(r.words, 'Can\'t tell: some lightning readings unreadable');
  const nullEntry = check({ samples: [...FIXTURE.outside, null] });
  assert.equal(nullEntry.state, 'unknown');
});

test('partly unreadable data with a near cell still stands as near', () => {
  const r = check({ samples: [{ lat: NaN, lon: 1, value: 1 }, FIXTURE.inside[0]] });
  assert.equal(r.state, 'near');
  assert.ok(r.caution);
});

// ---- Clear needs proof the area was read ---------------------------------------------------

test('an empty list with no coverage is not clear: it can\'t tell', () => {
  const r = lightningNearHome({ samples: [], home: HOME, layerTime: at(1), now: NOW });
  assert.equal(r.state, 'unknown');
  assert.equal(r.near, null);
  assert.match(r.words, /^Can't tell: .*area/);
});

test('clear needs coverage that reaches home plus the radius (and a cell), else can\'t tell', () => {
  const box = (d) => ({ bounds: { west: HOME.lon - d.lon, south: HOME.lat - d.lat, east: HOME.lon + d.lon, north: HOME.lat + d.lat }, cellsRead: 900 });
  // 21 NM (radius plus the edge cell) is 0.35 degrees of latitude and 0.547 of longitude here.
  assert.equal(check({ samples: [], coverage: box({ lat: 0.36, lon: 0.6 }) }).state, 'clear');
  assert.equal(check({ samples: [], coverage: box({ lat: 0.33, lon: 0.6 }) }).state, 'unknown');
  assert.equal(check({ samples: [], coverage: box({ lat: 0.36, lon: 0.5 }) }).state, 'unknown');
  assert.equal(check({ samples: [], radiusNm: 50, coverage: box({ lat: 0.36, lon: 0.6 }) }).state, 'unknown');
  assert.equal(check({ samples: [], radiusNm: 50, coverage: box({ lat: 0.9, lon: 1.4 }) }).state, 'clear');
});

test('bad coverage never counts: wrong shape, reversed or out-of-range bounds, no cells read', () => {
  const good = COVER.bounds;
  for (const coverage of [undefined, null, 5, 'x', {}, { bounds: good }, { bounds: good, cellsRead: 0 }, { bounds: good, cellsRead: -1 }, { bounds: good, cellsRead: 1.5 }, { bounds: good, cellsRead: NaN },
    { bounds: { ...good, west: good.east }, cellsRead: 10 }, { bounds: { ...good, south: good.north + 1 }, cellsRead: 10 }, { bounds: { ...good, west: '1' }, cellsRead: 10 }, { bounds: { ...good, north: NaN }, cellsRead: 10 }]) {
    assert.equal(check({ samples: [], coverage }).state, 'unknown', JSON.stringify(coverage));
  }
});

test('lightning found stands even when the coverage box is missing or small', () => {
  assert.equal(check({ coverage: undefined }).state, 'near');
  assert.equal(check({ coverage: { bounds: { west: 0, south: 0, east: 1, north: 1 }, cellsRead: 4 } }).state, 'near');
});

test('an outside-only list with no coverage can\'t tell either', () => {
  assert.equal(check({ samples: FIXTURE.outside, coverage: undefined }).state, 'unknown');
});

test('distance is the app\'s one great-circle distance (to 0.1 NM), not a second formula', () => {
  const s = FIXTURE.inside[0];
  assert.equal(check({ samples: [s] }).nearestNm, greatCircleNm(HOME, s));
});

test('no cells at all, fresh, is a clear answer', () => {
  const r = check({ samples: [] });
  assert.equal(r.state, 'clear');
  assert.equal(r.nearestNm, null);
  assert.equal(r.bearingDeg, null);
  assert.equal(r.words, 'No lightning within 20 NM of home');
});

test('the nearest of many cells wins, whatever the order', () => {
  const cells = [...FIXTURE.inside, ...FIXTURE.outside];
  const forward = check({ samples: cells });
  const backward = check({ samples: [...cells].reverse() });
  assert.equal(forward.nearestNm, 12);
  assert.deepEqual([backward.nearestNm, backward.bearingDeg, backward.cells], [forward.nearestNm, forward.bearingDeg, forward.cells]);
});

test('lightning right at home says so without a bearing', () => {
  const r = check({ samples: [{ lat: HOME.lat, lon: HOME.lon, value: 2 }] });
  assert.equal(r.state, 'near');
  assert.equal(r.bearingDeg, null);
  assert.equal(r.words, 'Lightning at home, within 20 NM');
});

test('cells with no lightning (0 or below), or unreadable ones, do not count, but a list of nothing readable is not "clear"', () => {
  const quiet = check({ samples: [{ ...FIXTURE.inside[0], value: 0 }, { ...FIXTURE.inside[1], value: -1 }] });
  assert.equal(quiet.state, 'clear');
  const mixed = check({ samples: [null, 5, 'x', { lat: NaN, lon: 1, value: 1 }, { lat: 91, lon: 0, value: 1 }, { lat: 1, lon: 200, value: 1 }, { lat: '1', lon: 1, value: 1 }, { lat: 1, lon: 1, value: NaN }, FIXTURE.inside[0]] });
  assert.equal(mixed.state, 'near');
  const junk = check({ samples: [null, 5, 'x', { lat: NaN, lon: 1, value: 1 }, { lat: 91, lon: 0, value: 1 }] });
  assert.equal(junk.state, 'unknown');
  assert.equal(junk.near, null);
});

test('a huge list is not scanned to the end: a hit inside still raises, but "clear" is never claimed', () => {
  const far = { lat: 0, lon: 0, value: 1 };
  const many = Array.from({ length: MAX_CELLS + 1 }, () => far);
  const none = check({ samples: many });
  assert.equal(none.state, 'unknown');
  assert.equal(none.caution, null);
  const hit = check({ samples: [FIXTURE.inside[0], ...many] });
  assert.equal(hit.state, 'near');
});

// ---- Stale data never says "no lightning" --------------------------------------------------

test('stale data (over 40 minutes by the layer\'s own time) says it can\'t tell, never "no lightning"', () => {
  const r = check({ samples: [], layerTime: at(41) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.near, null);
  assert.equal(r.caution, null);
  assert.equal(r.words, 'Can\'t tell: lightning data is 41 min old');
  assert.doesNotMatch(r.words, /^No lightning/);
});

test('stale data does not raise either, even with lightning in it', () => {
  const r = check({ layerTime: at(45) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution, null);
});

test('exactly 40 minutes old is still current, 40 minutes and a second is stale (feedAge\'s limit)', () => {
  assert.equal(check({ samples: [], layerTime: at(40) }).state, 'clear');
  assert.equal(check({ samples: [], layerTime: new Date(+NOW - 40 * MIN - 1000) }).state, 'unknown');
});

test('the age is the layer\'s own time, not when it was fetched: a fresh fetch of an old layer is stale', () => {
  const r = check({ samples: [], layerTime: at(50) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.ageMin, 50);
});

test('no layer time, or one from the future, can\'t be trusted to say clear', () => {
  for (const layerTime of [undefined, null, 'soon', NaN, new Date(NaN), new Date(+NOW + 20 * MIN)]) {
    const r = check({ samples: [], layerTime });
    assert.equal(r.state, 'unknown', String(layerTime));
    assert.match(r.words, /^Can't tell/);
  }
});

test('no cells given (the image failed) says it can\'t tell; it is not an empty sky', () => {
  for (const samples of [undefined, null, 'x', {}, 5, { length: 3 }]) {
    const r = check({ samples });
    assert.equal(r.state, 'unknown', String(samples));
    assert.equal(r.words, 'Can\'t tell: no lightning data');
  }
});

test('with nothing passed at all the answer is "can\'t tell", never clear', () => {
  const r = lightningNearHome({ now: NOW });
  assert.equal(r.state, 'unknown');
  assert.equal(r.near, null);
});

test('an unreadable clock can\'t tell either', () => {
  for (const now of [undefined, NaN, 'now', new Date(NaN)]) assert.equal(lightningNearHome({ samples: [], layerTime: at(1), now }).state, 'unknown', String(now));
});

test('a home with no position can\'t tell', () => {
  for (const home of [{ icao: 'CYMJ' }, { lat: NaN, lon: 1 }, { lat: 91, lon: 0 }, { lat: 0, lon: '5' }, null]) {
    const r = check({ home });
    assert.equal(r.state, 'unknown', JSON.stringify(home));
    assert.equal(r.words, 'Can\'t tell: no position for the home field');
  }
});

test('with no home given it is the default home field, CYMJ', () => {
  const r = lightningNearHome({ samples: FIXTURE.inside, layerTime: at(1), now: NOW });
  assert.equal(r.state, 'near');
  assert.equal(r.caution.icao, 'CYMJ');
});

test('the check can be switched off (SOF-3 no): nothing is said and nothing raised', () => {
  const r = check({ enabled: false });
  assert.equal(r.state, 'off');
  assert.equal(r.near, null);
  assert.equal(r.caution, null);
  assert.equal(r.episode, null);
});

test('it never throws, whatever it is given', () => {
  for (const arg of [undefined, null, 5, 'x', [], { samples: Symbol('x') }, { samples: [Symbol('x')], now: NOW }, { home: 5, now: NOW }, { episode: 5, now: NOW }]) {
    assert.doesNotThrow(() => lightningNearHome(arg));
  }
});

test('nothing passed in is changed', () => {
  const samples = JSON.parse(JSON.stringify(FIXTURE.inside));
  const home = { ...HOME };
  const episode = { id: '2026-09-30T18:00Z', lastNearAt: +NOW - MIN };
  Object.freeze(episode);
  lightningNearHome({ samples, home, layerTime: at(1), now: NOW, episode });
  assert.deepEqual(samples, FIXTURE.inside);
  assert.deepEqual(home, HOME);
});

// ---- Bearing in words ----------------------------------------------------------------------

test('the compass bearing from home: north 0, east 90, south 180, west 270', () => {
  const to = (nm, brg) => {
    const d = nm / (6371000 / 1852), b = (brg * Math.PI) / 180, la = (HOME.lat * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lon2 = (HOME.lon * Math.PI) / 180 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
  };
  for (const brg of [0, 45, 90, 135, 180, 225, 270, 315, 10, 359]) {
    assert.ok(Math.abs(bearingDeg(HOME, to(15, brg)) - brg) < 0.01 || Math.abs(bearingDeg(HOME, to(15, brg)) - brg - 360) < 0.01, `${brg}`);
  }
  assert.equal(bearingDeg(HOME, HOME), null);
  assert.equal(bearingDeg(HOME, { lat: NaN, lon: 0 }), null);
});

test('eight compass words, each 45 degrees wide and centred', () => {
  const words = [0, 22, 23, 45, 90, 135, 180, 225, 270, 315, 337, 338, 359.9, 360].map(compassWords);
  assert.deepEqual(words, ['north', 'north', 'north-east', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north-west', 'north', 'north', 'north']);
  assert.equal(compassWords(null), null);
  assert.equal(compassWords(NaN), null);
});

test('a cell 18 NM out at bearing 200 is south of home', () => {
  const r = check({ samples: [FIXTURE.inside[1]] });
  assert.equal(r.bearingDeg, 200);
  assert.equal(r.bearingWords, 'south');
  assert.equal(r.nearestNm, 18);
});

// ---- The caution ---------------------------------------------------------------------------

test('the caution has the shape cautions.js gives every caution, so the banner can show it', () => {
  const card = cardModel({ icao: 'CYMJ', name: 'CYMJ', role: 'HOME', metar: { raw: METAR.belowLimits, report: parseMetar(METAR.belowLimits, { now: NOW }), source: 'metno', status: 'fresh' }, limits: { ceilingFt: 2000, visSm: 3 }, now: NOW });
  const reference = cautionList({ cards: [card] })[0];
  const c = check().caution;
  assert.deepEqual(Object.keys(c).sort(), Object.keys(reference).sort());
  assert.equal(c.icao, 'CYMJ');
  assert.equal(c.source, 'LIGHTNING');
  assert.equal(c.level, 'caution');
  assert.equal(c.levelWords, 'Caution');
  assert.equal(c.stale, false);
  assert.equal(c.acknowledged, false);
  assert.equal(c.reason, 'Lightning about 12 NM north-east of home, within 20 NM');
  assert.equal(c.text, 'Caution: CYMJ lightning: about 12 NM north-east of home, within 20 NM');
  assert.equal(typeof c.key, 'string');
  assert.ok(c.key.length > 0 && c.key.length <= 300);
});

test('the caution is plain text with no markup, whatever the home name is', () => {
  const r = check({ home: { ...HOME, icao: '<img src=x onerror=alert(1)>' } });
  assert.equal(r.caution.icao, 'CYMJ');
});

test('the home ICAO is used when it is four letters or digits, else CYMJ', () => {
  assert.equal(check({ home: { ...HOME, icao: 'CYQR' } }).caution.icao, 'CYQR');
  for (const icao of ['cyqr', 'CYQRX', '', 5, null, 'C Y']) assert.equal(check({ home: { ...HOME, icao } }).caution.icao, 'CYMJ', String(icao));
});

// ---- Episodes: the same lightning does not re-raise, a new one after a clear does ---------

test('the same lightning on the next refresh has the same key', () => {
  const first = check();
  const second = check({ now: new Date(+NOW + 10 * MIN), layerTime: at(-5), episode: first.episode, samples: [FIXTURE.inside[1], FIXTURE.inside[0]] });
  assert.equal(second.state, 'near');
  assert.equal(second.caution.key, first.caution.key);
  assert.equal(second.episode.id, first.episode.id);
});

test('a key that has been acknowledged stays acknowledged on the next refresh, with cautions.js\'s own store', () => {
  const first = check();
  const acks = acknowledge(emptyAcks({ now: NOW, timeZone: 'America/Regina' }), first.caution.key);
  const second = check({ now: new Date(+NOW + 10 * MIN), layerTime: at(-5), episode: first.episode });
  assert.ok(acks.keys.includes(second.caution.key));
});

test('a new episode after a clear has a new key', () => {
  const first = check();
  const later = new Date(+NOW + 30 * MIN);
  const cleared = check({ samples: FIXTURE.outside, now: later, layerTime: new Date(+later - 2 * MIN), episode: first.episode });
  assert.equal(cleared.state, 'clear');
  assert.equal(cleared.episode, null);
  const again = new Date(+NOW + 40 * MIN);
  const second = check({ samples: FIXTURE.inside, now: again, layerTime: new Date(+again - 2 * MIN), episode: cleared.episode });
  assert.equal(second.state, 'near');
  assert.notEqual(second.caution.key, first.caution.key);
});

test('data that can\'t tell (stale, missing) is not a clear: the episode carries on and keeps its key', () => {
  const first = check();
  const later = new Date(+NOW + 25 * MIN);
  const unsure = check({ samples: [], now: later, layerTime: at(20), episode: first.episode });
  assert.equal(unsure.state, 'unknown');
  assert.deepEqual(unsure.episode, first.episode);
  const back = new Date(+NOW + 29 * MIN);
  const second = check({ now: back, layerTime: new Date(+back - MIN), episode: unsure.episode });
  assert.equal(second.caution.key, first.caution.key);
});

test('a long outage ends the episode: a storm after 5 hours of can\'t-tell is a new caution', () => {
  const first = check();
  const later = new Date(+NOW + 5 * 60 * MIN);
  const unsure = check({ samples: [], now: later, layerTime: NOW, episode: first.episode });
  assert.equal(unsure.state, 'unknown');
  assert.equal(unsure.episode, null, 'nothing is known about a storm 5 hours ago');
  const second = check({ now: later, layerTime: new Date(+later - MIN), episode: first.episode });
  assert.equal(second.state, 'near');
  assert.notEqual(second.caution.key, first.caution.key);
});

test('the gap that ends an episode is the longer of 30 minutes and clearHoldMs', () => {
  const first = check();
  const at40 = new Date(+NOW + 40 * MIN);
  const short = check({ now: at40, layerTime: new Date(+at40 - MIN), episode: first.episode });
  assert.notEqual(short.caution.key, first.caution.key);
  const held = check({ now: at40, layerTime: new Date(+at40 - MIN), episode: first.episode, clearHoldMs: 60 * MIN });
  assert.equal(held.caution.key, first.caution.key);
  const exactly = new Date(+NOW + 30 * MIN);
  assert.equal(check({ now: exactly, layerTime: new Date(+exactly - MIN), episode: first.episode }).caution.key, first.caution.key);
});

test('the lightning caution joins cautionList and evaluate through `extra`, sorted and listed once', () => {
  const card = cardModel({ icao: 'CYMJ', name: 'CYMJ', role: 'HOME', metar: { raw: METAR.belowLimits, report: parseMetar(METAR.belowLimits, { now: NOW }), source: 'metno', status: 'fresh' }, limits: { ceilingFt: 2000, visSm: 3 }, now: NOW });
  const c = check().caution;
  const list = cautionList({ cards: [card], extra: [c, c] });
  assert.equal(list.filter((x) => x.key === c.key).length, 1);
  assert.deepEqual(list.map((x) => x.level), ['below', 'below', 'caution'], 'below the limits first, then the lightning caution');
  assert.equal(list.at(-1).text, c.text);
  assert.equal(cautionList({ cards: [card] }).length, 2, 'without extra nothing changes');
  const junk = cautionList({ cards: [card], extra: [null, 5, {}, { key: 'x' }, { ...c, level: 'red' }, { ...c, key: 5 }] });
  assert.equal(junk.length, 2, 'entries that are not cautions are ignored');
  const first = evaluate({ cards: [card], extra: [c], now: NOW, timeZone: 'America/Regina' });
  assert.equal(first.fresh.filter((x) => x.source === 'LIGHTNING').length, 1);
  const acked = evaluate({ cards: [card], extra: [c], acks: acknowledge(first.acks, c.key), now: NOW, timeZone: 'America/Regina' });
  assert.equal(acked.acknowledged.filter((x) => x.source === 'LIGHTNING').length, 1);
  assert.equal(acked.fresh.filter((x) => x.source === 'LIGHTNING').length, 0);
});

test('turning the check off ends the episode, so switching it on again is a new one', () => {
  const first = check();
  const off = check({ enabled: false, episode: first.episode });
  assert.equal(off.episode, null);
  const second = check({ now: new Date(+NOW + MIN), layerTime: NOW, episode: off.episode });
  assert.notEqual(second.caution.key, first.caution.key);
});

test('by default a clear reading ends the episode at once; clearHoldMs holds it open for flicker at the edge', () => {
  assert.equal(LIGHTNING_DEFAULTS.clearHoldMs, 0);
  const first = check();
  const t1 = new Date(+NOW + 10 * MIN);
  const held = check({ samples: FIXTURE.outside, now: t1, layerTime: new Date(+t1 - MIN), episode: first.episode, clearHoldMs: 30 * MIN });
  assert.equal(held.state, 'clear');
  assert.equal(held.caution, null, 'clear says clear; only the key is remembered');
  assert.equal(held.episode.id, first.episode.id);
  const t2 = new Date(+NOW + 20 * MIN);
  const back = check({ now: t2, layerTime: new Date(+t2 - MIN), episode: held.episode, clearHoldMs: 30 * MIN });
  assert.equal(back.caution.key, first.caution.key);
  const t3 = new Date(+NOW + 70 * MIN);
  const expired = check({ samples: FIXTURE.outside, now: t3, layerTime: new Date(+t3 - MIN), episode: back.episode, clearHoldMs: 30 * MIN });
  assert.equal(expired.episode, null);
});

test('a stored episode that isn\'t the right shape is ignored', () => {
  for (const episode of [5, 'x', [], { id: 5 }, { id: '' }, { id: 'a'.repeat(100), lastNearAt: 1 }, { id: '2026-09-30T18:00Z', lastNearAt: NaN }]) {
    const r = check({ episode });
    assert.equal(r.state, 'near', JSON.stringify(episode));
    assert.match(r.caution.key, /^CYMJ\|LIGHTNING\|2026-09-30T18:42Z$/, JSON.stringify(episode));
  }
});

test('the key names the episode\'s first minute, and holds nothing else that changes (distance, radius, cell count)', () => {
  const a = check({ radiusNm: 20 });
  const b = check({ radiusNm: 30 });
  const c = check({ samples: [FIXTURE.inside[1]] });
  assert.equal(a.caution.key, 'CYMJ|LIGHTNING|2026-09-30T18:42Z');
  assert.equal(b.caution.key, a.caution.key);
  assert.equal(c.caution.key, a.caution.key);
});

test('cautions.js keeps the lightning key when it is acknowledged, and its evaluate leaves it alone', () => {
  const c = check().caution;
  const acks = acknowledge(emptyAcks({ now: NOW, timeZone: 'America/Regina' }), c.key);
  const { acks: kept } = evaluate({ cards: [], tafs: [], acks, now: NOW, timeZone: 'America/Regina' });
  assert.deepEqual(kept.keys, [c.key]);
});

test('the coverage edge margin: a box holding home plus 20.5 NM but not 21 NM can\'t tell for a 20 NM radius', () => {
  // Degrees of latitude and longitude for a distance at CYMJ: 1 degree of latitude is 60.04 NM.
  const box = (nm) => ({ bounds: { west: HOME.lon - (nm + 0.02) / 38.37, south: HOME.lat - (nm + 0.02) / 60.04, east: HOME.lon + (nm + 0.02) / 38.37, north: HOME.lat + (nm + 0.02) / 60.04 }, cellsRead: 900 });
  assert.equal(check({ samples: [], coverage: box(20.5) }).state, 'unknown');
  assert.match(check({ samples: [], coverage: box(20.5) }).words, /^Can't tell/);
  assert.equal(check({ samples: [], coverage: box(21.05) }).state, 'clear');
});

test('the sort puts METAR, then TAF, then LIGHTNING at the same airfield and level, whatever the input order', () => {
  const c = check().caution;
  const fake = (source) => ({ ...c, key: `CYMJ|${source}|x`, source, text: `Caution: ${source}` });
  const three = [fake('METAR'), fake('TAF'), fake('LIGHTNING')];
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const o of orders) {
    const list = cautionList({ extra: o.map((i) => three[i]) });
    assert.deepEqual(list.map((x) => x.source), ['METAR', 'TAF', 'LIGHTNING'], o.join());
  }
});

test('near wording past the radius says "at the edge of the radius", not "within"', () => {
  const edge = check({ samples: [north(20.6)] });
  assert.equal(edge.state, 'near');
  assert.equal(edge.words, 'Lightning about 20.6 NM north of home, at the edge of the 20 NM radius');
  assert.equal(edge.caution.text, 'Caution: CYMJ lightning: about 20.6 NM north of home, at the edge of the 20 NM radius');
  assert.equal(check({ samples: [north(20)] }).words, 'Lightning about 20 NM north of home, within 20 NM');
  assert.equal(check({ samples: [north(19.9)] }).words, 'Lightning about 19.9 NM north of home, within 20 NM');
});
