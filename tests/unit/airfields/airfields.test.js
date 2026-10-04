// Checks: the airfield setup store: default home and alternates, minima by approach type, corrupt saves fall back, home never an alternate, at most six alternates.
// Serves: ALL-R16, SOF-R12, SOF-R22.
// Expected values: distances (35 and 119 NM) worked out by great circle in the test; the default alternates and minima are design choices (SOF-R12), no manual page yet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/storage/store.js';
import { createAirfields, MAX_ALTERNATES } from '../../../src/airfields/airfields.js';
import { parseTaf } from '../../../src/wx/taf.js';
import { assessAlternate } from '../../../src/wx/alternates.js';
import { NOW, at } from '../wx/reports.js';

function memoryBackend() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const blocked = () => { throw new Error('SecurityError'); };
const fresh = (backend = memoryBackend()) => createAirfields({ store: createStore(backend).scope('airfields') });
const withSaved = (setup) => {
  const backend = memoryBackend();
  backend.setItem('ooda:v1:airfields:setup', JSON.stringify(setup));
  return fresh(backend);
};

test('defaults: home CYMJ (Moose Jaw, UTC-6), alternates CYQR, CYYN, CYXE', () => {
  const a = fresh();
  const home = a.home();
  assert.deepEqual([home.icao, home.name, home.timeZone, home.elevationFt], ['CYMJ', 'Moose Jaw', 'America/Regina', 1892]);
  assert.deepEqual(a.alternates().map((f) => f.icao), ['CYQR', 'CYYN', 'CYXE']);
  assert.deepEqual(a.stations(), ['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
});

// SOF-R12 (Patrick, SOF-Q3, 4 Oct 00:48Z): the usual alternates come with their approaches and published landing minima
// filled in, and the date they were checked. The test checks they are filled in and dated, not what the minima are:
// the real numbers come from the published approach charts and are Patrick's and Dad's to enter. The name
// "checkedOn" is a placeholder until the SOF build task settles it.
test('SOF-R12: the usual alternates open with their approach and landing minima filled in, and dated', { todo: "SOF plan step 3: not built yet. Remove this mark when it is built (Patrick's card, 4 Oct)" }, () => {
  const a = fresh();
  for (const icao of ['CYQR', 'CYYN', 'CYXE']) {
    const field = a.alternates().find((f) => f.icao === icao);
    assert.notEqual(field.approach, 'not-set', `${icao} has an approach type`);
    const o = a.checkOptions(icao);
    assert.equal(o.minimaChecked, true, `${icao} minima are checked, not a fallback`);
    assert.ok(Number.isFinite(o.landingMinima?.ceilingFt) && Number.isFinite(o.landingMinima?.visSm), `${icao} has published landing minima`);
    assert.match(String(field.checkedOn), /^\d{4}-\d{2}-\d{2}$/, `${icao} says when it was checked`);
  }
});

test('SOF-R12: an alternate with nothing filled in reads Incomplete, never "meets"', { todo: "SOF plan step 3: not built yet. Remove this mark when it is built (Patrick's card, 4 Oct)" }, () => {
  const a = fresh();
  a.update({ alternates: ['CZZZ'], fields: { CZZZ: { name: 'Nowhere' } } });
  const good = parseTaf('TAF CYXE 291120Z 2912/3012 27010KT P6SM SCT040', { now: NOW });
  const r = assessAlternate(good, { from: at(29, 17), to: at(29, 19) }, a.checkOptions('CZZZ'));
  assert.equal(r.status, 'incomplete');
});

test('checkOptions carries landing minima, GNSS flags and distance from home', () => {
  const a = fresh();
  a.update({ fields: { CYXE: { approach: 'one-precision', lowestHatFt: 250, lowestVisSm: 0.75 } } });
  const o = a.checkOptions('CYXE');
  assert.deepEqual(o.minima, [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }]);
  assert.equal(o.minimaChecked, true);
  assert.deepEqual(o.landingMinima, { ceilingFt: 250, visSm: 0.75 });
  assert.equal(o.gnssApproach, false);
  assert.equal(o.homeGnssApproach, false);
  assert.ok(Math.abs(o.distanceNm - 119) < 1);
});

test('GNSS: the GNSS-only type turns the flag on; the plan checkbox turns it on for any field, home included', () => {
  const a = fresh();
  a.update({ fields: { CYQR: { approach: 'gnss-only' }, CYMJ: { gnssPlan: true } } });
  assert.equal(a.checkOptions('CYQR').gnssApproach, true);
  assert.equal(a.checkOptions('CYQR').homeGnssApproach, true);
  assert.equal(a.home().gnssApproach, true);
});

const tafs = {
  bkn007: 'TAF CYXE 291120Z 2912/3012 27010KT 3SM BKN007',
  prob300: 'TAF CYXE 291120Z 2912/3012 27010KT P6SM SCT030 PROB30 2917/2920 1SM BR OVC003',
};
const WINDOW = { from: at(29, 17), to: at(29, 19) };
const check = (a, icao, raw) => assessAlternate(parseTaf(raw, { now: NOW }), WINDOW, a.checkOptions(icao));

test('into wx: BKN007 3SM passes at 600-2 but fails once CYXE is set to non-precision (800-2)', () => {
  const a = fresh();
  assert.equal(check(a, 'CYXE', tafs.bkn007).status, 'meets');
  a.update({ fields: { CYXE: { approach: 'non-precision' } } });
  assert.equal(check(a, 'CYXE', tafs.bkn007).status, 'below');
});

test('into wx: a PROB30 OVC003 passes with landing minima of 250 ft and 3/4 SM, and is unchecked without them', () => {
  const a = fresh();
  a.update({ fields: { CYXE: { approach: 'one-precision' } } });
  let r = check(a, 'CYXE', tafs.prob300);
  assert.equal(r.status, 'meets');
  assert.equal(r.probUnchecked.length, 1);
  a.update({ fields: { CYXE: { lowestHatFt: 250, lowestVisSm: 0.75 } } });
  r = check(a, 'CYXE', tafs.prob300);
  assert.equal(r.status, 'meets');
  assert.equal(r.probUnchecked.length, 0);
});

test('into wx (D73): GNSS at both ends warns for CYQR (35 NM) and not for CYXE (119 NM)', () => {
  const a = fresh();
  a.update({ fields: { CYMJ: { gnssPlan: true }, CYQR: { approach: 'gnss-only' }, CYXE: { approach: 'gnss-only' } } });
  assert.equal(check(a, 'CYQR', tafs.bkn007).warnings.length, 1);
  assert.equal(check(a, 'CYXE', tafs.bkn007).warnings.length, 0);
});

test('an added airfield without a position gives distance unknown, which wx reports', () => {
  const a = fresh();
  a.update({ alternates: ['CYQR', 'CZZZ'], fields: { CZZZ: { name: 'Nowhere', approach: 'gnss-only' }, CYMJ: { gnssPlan: true } } });
  assert.equal(a.checkOptions('CZZZ').distanceNm, null);
  assert.match(check(a, 'CZZZ', tafs.bkn007).warnings[0], /distance unknown/);
});

test('settings are saved and read back in a new visit', () => {
  const backend = memoryBackend();
  fresh(backend).update({ home: 'cyxh', alternates: ['CYQL'] });
  const b = fresh(backend);
  assert.equal(b.home().icao, 'CYXH');
  assert.equal(b.home().timeZone, 'America/Edmonton');
  assert.deepEqual(b.stations(), ['CYXH', 'CYQL']);
});

test('ICAO ids are upper-cased; anything not four letters or digits is dropped', () => {
  const a = withSaved({ version: 1, home: 'x<b>', alternates: ['cyqr', 'CY QR', 'CYQRR', 7, null, 'KGTF'], fields: { '<img>': { approach: 'one-precision' } } });
  assert.equal(a.home().icao, 'CYMJ');
  assert.deepEqual(a.alternates().map((f) => f.icao), ['CYQR', 'KGTF']);
  assert.deepEqual(Object.keys(a.get().fields), []);
});

test('home is never an alternate, duplicates are dropped, and there are at most 6 alternates', () => {
  const a = fresh();
  a.update({ alternates: ['CYMJ', 'CYQR', 'cyqr', 'CYYN', 'CYXE', 'CYQV', 'KGGW', 'KISN', 'CYPA'] });
  assert.equal(MAX_ALTERNATES, 6);
  assert.deepEqual(a.alternates().map((f) => f.icao), ['CYQR', 'CYYN', 'CYXE', 'CYQV', 'KGGW', 'KISN']);
  a.update({ home: 'CYQR' });
  assert.deepEqual(a.alternates().map((f) => f.icao), ['CYYN', 'CYXE', 'CYQV', 'KGGW', 'KISN']);
});

test('out-of-range numbers, unknown approach types and unknown time zones are dropped, never guessed', () => {
  const a = withSaved({
    version: 1,
    home: 'CZZZ',
    alternates: ['CYQR'],
    fields: {
      CYQR: { approach: 'ils', lowestHatFt: -5, lowestVisSm: 11 },
      CZZZ: { name: 'Test', lat: 91, lon: -181, elevationFt: 20000, timeZone: 'Mars/Olympus' },
    },
  });
  const qr = a.alternates()[0];
  assert.deepEqual([qr.approach, qr.lowestHatFt, qr.lowestVisSm], ['not-set', null, null]);
  const home = a.home();
  assert.deepEqual([home.lat, home.lon, home.elevationFt], [null, null, null]);
  assert.equal(home.timeZoneMissing, true);
  assert.equal(home.timeZone, 'America/Regina'); // the last good zone, not a guess
});

test("a built-in airfield's name, position, elevation and zone can't be overwritten", () => {
  const a = withSaved({ version: 1, home: 'CYMJ', alternates: [], fields: { CYMJ: { name: 'X', lat: 1, lon: 1, timeZone: 'UTC', elevationFt: 0 } } });
  const home = a.home();
  assert.deepEqual([home.name, home.lat, home.timeZone, home.elevationFt], ['Moose Jaw', 50.3303, 'America/Regina', 1892]);
});

test('names are trimmed text of at most 40 characters', () => {
  const a = fresh();
  a.update({ alternates: ['CZZZ'], fields: { CZZZ: { name: `  ${'x'.repeat(60)}  ` } } });
  assert.equal(a.alternates()[0].name, 'x'.repeat(40));
});

test('a corrupt or wrong-version setting falls back to the defaults', () => {
  assert.equal(withSaved('nonsense').home().icao, 'CYMJ');
  assert.equal(withSaved({ version: 99, home: 'CYQR' }).home().icao, 'CYMJ');
});

test('a field value of null clears it; fields: { ICAO: null } removes the whole entry', () => {
  const a = fresh();
  a.update({ fields: { CYXE: { approach: 'non-precision', lowestHatFt: 400 } } });
  a.update({ fields: { CYXE: { lowestHatFt: null } } });
  assert.deepEqual(a.get().fields.CYXE, { approach: 'non-precision' });
  a.update({ fields: { CYXE: null } });
  assert.equal(a.get().fields.CYXE, undefined);
});

test('blocked storage: works for the visit and says it is not persistent', () => {
  const a = fresh(blocked);
  a.update({ home: 'CYQR' });
  assert.equal(a.home().icao, 'CYQR');
  assert.equal(a.persistent, false);
});

test('subscribe fires after every change with the new home; unsubscribe stops it; reset restores defaults', () => {
  const a = fresh();
  const seen = [];
  const stop = a.subscribe(() => seen.push(a.home().icao));
  a.update({ home: 'CYXH' });
  a.reset();
  stop();
  a.update({ home: 'CYQR' });
  assert.deepEqual(seen, ['CYXH', 'CYMJ']);
});

test('what callers get back is a copy, so they cannot change the setting behind its back', () => {
  const a = fresh();
  a.alternates().push({ icao: 'KGTF' });
  a.get().alternates.push('KGTF');
  a.home().icao = 'KGTF';
  assert.deepEqual(a.stations(), ['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
});

test('D80: MEA and visual-descent visibility are kept per airfield and reach wx as visualDescent', () => {
  const a = fresh();
  a.update({ fields: { CYYN: { approach: 'no-ifr', meaFt: 4500, visualDescentVisSm: 4, elevationFt: 2680 } } });
  const o = a.checkOptions('CYYN');
  assert.deepEqual(o.visualDescent, { meaFt: 4500, elevationFt: 2680, visSm: 4 });
  assert.equal(o.minima, null);
  assert.equal(a.checkOptions('CYQR').visualDescent, null);
});

test("a built-in airfield's elevation can be entered only where the built-in list has none", () => {
  const a = fresh();
  a.update({ fields: { CYQR: { elevationFt: 1894 }, CYMJ: { elevationFt: 1 } } });
  assert.equal(a.alternates()[0].elevationFt, 1894);
  assert.equal(a.home().elevationFt, 1892);
  assert.equal(a.get().fields.CYMJ, undefined);
});

test('an MEA outside 0 to 20,000 ft is dropped', () => {
  const a = fresh();
  a.update({ fields: { CYYN: { approach: 'no-ifr', meaFt: 25000 } } });
  assert.equal(a.checkOptions('CYYN').visualDescent.meaFt, null);
});

test('into wx (D80): a no-IFR field without an MEA is incomplete, never a pass; with one it is checked from sea level', () => {
  const a = fresh();
  a.update({ fields: { CYYN: { approach: 'no-ifr', elevationFt: 2680 } } });
  const good = 'TAF CYYN 291120Z 2912/3012 27010KT P6SM SKC';
  assert.equal(check(a, 'CYYN', good).status, 'incomplete');
  a.update({ fields: { CYYN: { meaFt: 4500 } } });
  assert.equal(check(a, 'CYYN', good).status, 'meets');
  // 4500 + 500 - 2680 = 2320 ft needed above the field.
  assert.equal(check(a, 'CYYN', 'TAF CYYN 291120Z 2912/3012 27010KT P6SM BKN022').status, 'below');
  assert.equal(check(a, 'CYYN', 'TAF CYYN 291120Z 2912/3012 27010KT P6SM BKN024').status, 'meets');
});
