// Winds aloft (SPEC-debrief: Weather at the time of the flight): the archive
// address, reading the reply, the wind at Lead's altitude and its words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WIND_MODELS, WIND_LEVELS_HPA, windModelFor, windsUrl, readWinds, windAtAltitude, windWords, windTextAt,
} from '../../../src/modules/debrief/weather/winds.js';
import { createWindsFeed } from '../../../src/modules/debrief/weather/winds-feed.js';

const T = (iso) => Date.parse(iso) / 1000;
const FT = 0.3048;

// A reply shaped like Open-Meteo's, for two hours, with the 850 and 700 hPa
// values the source check read for Moose Jaw on 29 Sep 2026 at 18Z (HRDPS).
function reply({ missing700 = false } = {}) {
  const hourly = { time: ['2026-09-29T18:00', '2026-09-29T19:00'] };
  for (const p of WIND_LEVELS_HPA) {
    hourly[`wind_speed_${p}hPa`] = [null, null];
    hourly[`wind_direction_${p}hPa`] = [null, null];
    hourly[`geopotential_height_${p}hPa`] = [null, null];
  }
  hourly.wind_speed_850hPa = [35.2, 30];
  hourly.wind_direction_850hPa = [278, 350];
  hourly.geopotential_height_850hPa = [1358, 1360];
  hourly.wind_speed_700hPa = [missing700 ? null : 33.2, 30];
  hourly.wind_direction_700hPa = [266, 10];
  hourly.geopotential_height_700hPa = [2957, 2960];
  return { hourly };
}

test('the model falls back to HRRR for a flight older than the HRDPS archive', () => {
  assert.equal(windModelFor('hrdps', T('2026-09-29T18:00Z')), 'hrdps');
  assert.equal(windModelFor('hrdps', T('2022-06-01T18:00Z')), 'hrrr');
  assert.equal(windModelFor('hrrr', T('2026-09-29T18:00Z')), 'hrrr');
  assert.equal(windModelFor('hrdps', T('2015-06-01T18:00Z')), null);
  assert.equal(windModelFor('nonsense', T('2026-09-29T18:00Z')), 'hrdps');
});

test('the archive address asks for each level\'s wind and height over the flight\'s days, in knots', () => {
  const url = new URL(windsUrl({ lat: 50.3312, lon: -105.559, startT: T('2026-09-29T00:30Z'), endT: T('2026-09-29T02:00Z'), model: 'hrdps' }));
  assert.equal(url.origin, 'https://historical-forecast-api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '50.33');
  assert.equal(url.searchParams.get('longitude'), '-105.56');
  assert.equal(url.searchParams.get('start_date'), '2026-09-28'); // the hour in force at 00:30Z may be the day before's
  assert.equal(url.searchParams.get('end_date'), '2026-09-29');
  assert.equal(url.searchParams.get('models'), WIND_MODELS.hrdps.id);
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kn');
  assert.equal(url.searchParams.get('hourly').split(',').length, WIND_LEVELS_HPA.length * 3);
  assert.throws(() => windsUrl({ lat: 50, lon: -105, startT: 0, endT: 1, model: 'x' }), TypeError);
  assert.throws(() => windsUrl({ lat: NaN, lon: -105, startT: 0, endT: 1, model: 'hrdps' }), TypeError);
});

test('the reply reads into hours of levels, low to high, leaving out missing values', () => {
  const hours = readWinds(reply({ missing700: true }));
  assert.equal(hours.length, 2);
  assert.equal(hours[0].t, T('2026-09-29T18:00Z'));
  assert.deepEqual(hours[0].levels.map((l) => l.hPa), [850]);
  assert.deepEqual(hours[1].levels.map((l) => l.hPa), [850, 700]);
  assert.ok(Math.abs(hours[1].levels[0].heightFt - 1360 / FT) < 1e-6);
  assert.deepEqual(readWinds(null), []);
  assert.deepEqual(readWinds({ hourly: {} }), []);
});

test('the wind at an altitude blends the levels either side as a vector', () => {
  const [h18, h19] = readWinds(reply());
  // At a level, that level's wind.
  const at850 = windAtAltitude(h18, 1358 / FT);
  assert.ok(Math.abs(at850.dirDeg - 278) < 1e-9 && Math.abs(at850.kt - 35.2) < 1e-9);
  // Halfway between 350°/30 and 010°/30 is 360°, a little under 30 kt, never 180°.
  const mid = windAtAltitude(h19, ((1360 + 2960) / 2) / FT);
  assert.ok(Math.abs(((mid.dirDeg + 180) % 360) - 180) < 1e-9, `got ${mid.dirDeg}`);
  assert.ok(mid.kt < 30 && mid.kt > 29);
  // Outside the levels, none.
  assert.equal(windAtAltitude(h18, 1000), null);
  assert.equal(windAtAltitude(h18, 30_000), null);
  assert.equal(windAtAltitude(null, 5000), null);
});

test('the words: true direction to 10°, 360 for north, then knots; marked as model; the hour in force and the model', () => {
  assert.equal(windWords({ dirDeg: 266, kt: 33.2 }), '270°T/33 kt');
  assert.equal(windWords({ dirDeg: 2, kt: 12 }), '360°T/12 kt');
  assert.equal(windWords({ dirDeg: 45, kt: 0.2 }), 'calm');
  const hours = readWinds(reply());
  assert.equal(windTextAt(hours, T('2026-09-29T18:40Z'), 1358 / FT, 'HRDPS'), 'model wind 280°T/35 kt at 4,500 ft (HRDPS 18Z, Open-Meteo)');
  assert.equal(windTextAt(hours, T('2026-09-29T19:05Z'), 1360 / FT, 'HRDPS'), 'model wind 350°T/30 kt at 4,500 ft (HRDPS 19Z, Open-Meteo)');
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 2000, 'HRDPS'), 'no HRDPS wind at 2,000 ft: below the lowest model level (4,500 ft)');
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 12_000, 'HRDPS'), 'no HRDPS wind at 12,000 ft: above the highest model level (9,700 ft)');
  assert.equal(windTextAt(hours, T('2026-09-29T17:59Z'), 5000, 'HRRR'), 'no HRRR wind for this time');
  assert.equal(windTextAt(hours, T('2026-09-29T21:00Z'), 5000, 'HRRR'), 'no HRRR wind for this time'); // older than 90 minutes
});

test('the feed fetches once per model per flight, only when asked, and tells a daily limit from a failure', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const flight = { startT: T('2026-09-29T18:00Z'), endT: T('2026-09-29T19:00Z') };
  const calls = [];
  let answer = { ok: true, status: 200, json: () => Promise.resolve(reply()) };
  const feed = createWindsFeed({ fetch: (url) => { calls.push(url); return Promise.resolve(answer); }, onChange: () => {} });
  assert.equal(feed.get('hrdps'), null);
  feed.setFlight(flight, { lat: 50.33, lon: -105.56 });
  assert.equal(calls.length, 0);
  assert.equal(feed.get('hrdps').state, 'loading');
  feed.get('hrdps');
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(feed.get('hrdps').state, 'ready');
  assert.equal(feed.get('hrdps').hours.length, 2);

  answer = { ok: false, status: 429 };
  feed.setFlight(flight, { lat: 50.33, lon: -105.56 });
  feed.get('hrrr');
  await settle();
  assert.equal(feed.get('hrrr').state, 'busy');
  answer = { ok: false, status: 500 };
  feed.setFlight(flight, { lat: 50.33, lon: -105.56 });
  feed.get('hrrr');
  await settle();
  assert.equal(feed.get('hrrr').state, 'failed');
  feed.dispose();
  assert.equal(feed.get('hrrr'), null);
});

test('three-figure directions, the top level itself, and a blend a quarter of the way up', () => {
  assert.equal(windWords({ dirDeg: 45, kt: 12 }), '050°T/12 kt');
  const [h18] = readWinds(reply());
  const top = windAtAltitude(h18, 2957 / FT);
  assert.ok(Math.abs(top.dirDeg - 266) < 1e-9 && Math.abs(top.kt - 33.2) < 1e-9);
  // 090°/40 below, 180°/40 above: a quarter of the way up is 30 kt from the east plus 10 kt from the south.
  const hour = { t: 0, levels: [{ hPa: 850, heightFt: 4000, dirDeg: 90, kt: 40 }, { hPa: 700, heightFt: 8000, dirDeg: 180, kt: 40 }] };
  const q = windAtAltitude(hour, 5000);
  assert.ok(Math.abs(q.kt - Math.hypot(30, 10)) < 1e-9);
  assert.ok(Math.abs(q.dirDeg - (90 + (Math.atan2(10, 30) * 180) / Math.PI)) < 1e-9);
});

test('the feed: a rate limit says whether it is the day\'s, retry() asks again, and a closed flight\'s late answer is dropped', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const flight = { startT: T('2026-09-29T18:00Z'), endT: T('2026-09-29T19:00Z') };
  const point = { lat: 50.33, lon: -105.56 };
  const limited = (reason) => ({ ok: false, status: 429, json: () => Promise.resolve({ reason, error: true }) });
  let answer = limited('Daily API request limit exceeded. Please try again tomorrow.');
  const calls = [];
  let changes = 0;
  const feed = createWindsFeed({ fetch: (url, init) => { calls.push(init.signal); return Promise.resolve(answer); }, onChange: () => changes++ });
  feed.setFlight(flight, point);
  feed.get('hrdps');
  await settle();
  assert.deepEqual({ state: feed.get('hrdps').state, daily: feed.get('hrdps').daily }, { state: 'busy', daily: true });
  answer = limited('Minutely API request limit exceeded. Please try again in one minute.');
  feed.retry();
  feed.get('hrdps');
  await settle();
  assert.deepEqual({ state: feed.get('hrdps').state, daily: feed.get('hrdps').daily }, { state: 'busy', daily: false });
  assert.equal(calls.length, 2);
  answer = { ok: true, status: 200, json: () => Promise.resolve(reply()) };
  feed.retry();
  feed.get('hrdps');
  await settle();
  assert.equal(feed.get('hrdps').state, 'ready');
  feed.retry(); // a good answer is kept
  feed.get('hrdps');
  assert.equal(calls.length, 3);

  // A fetch still out when the flight closes is stopped, and its answer tells no one.
  let release;
  const feed2 = createWindsFeed({
    fetch: (url, init) => { calls.push(init.signal); return new Promise((resolve) => { release = resolve; }); },
    onChange: () => changes++,
  });
  feed2.setFlight(flight, point);
  feed2.get('hrdps');
  const before = changes;
  feed2.setFlight(null);
  assert.equal(calls.at(-1).aborted, true);
  release({ ok: true, status: 200, json: () => Promise.resolve(reply()) });
  await settle();
  assert.equal(changes, before);
});

// Real replies from Open-Meteo for Moose Jaw (50.33, -105.56), 29 Sep 2026, as
// the app asks for them (all nine levels, knots, GMT): a change to the shape
// of the answer shows up here.
const real = (model) => JSON.parse(readFileSync(new URL(`../../fixtures/debrief/live-${model}.json`, import.meta.url), 'utf8'));
const REAL_MODELS = [['gem_hrdps_continental', 'HRDPS'], ['ncep_hrrr_conus', 'HRRR']];

test('real replies read into 48 hours of all nine levels, low to high, in knots', () => {
  for (const [id] of REAL_MODELS) {
    const json = real(id);
    assert.equal(json.hourly_units.wind_speed_950hPa, 'kn');
    const hours = readWinds(json);
    assert.equal(hours.length, 48, id);
    assert.equal(hours[0].t, T('2026-09-29T00:00Z'));
    assert.equal(hours[47].t, T('2026-09-30T23:00Z'));
    for (const hour of hours) {
      assert.deepEqual(hour.levels.map((l) => l.hPa), [...WIND_LEVELS_HPA], id);
      assert.ok(hour.levels.every((l, i) => i === 0 || l.heightFt > hour.levels[i - 1].heightFt), `${id} heights rise`);
      assert.ok(hour.levels.every((l) => l.dirDeg >= 0 && l.dirDeg <= 360 && l.kt >= 0 && l.kt < 200));
    }
  }
});

test('windTextAt on real replies gives a wind at flying heights and none above the top level', () => {
  for (const [id, label] of REAL_MODELS) {
    const hours = readWinds(real(id));
    const at = hours[18].t + 600; // 18:10Z
    const text = windTextAt(hours, at, 12_600, label);
    assert.match(text, new RegExp(`^model wind \\d{3}°T/\\d+ kt at 12,600 ft \\(${label} 18Z, Open-Meteo\\)$`));
    for (const word of ['model', 'kt', '°T']) assert.ok(text.includes(word), word); // true, in knots, and not observed (W1)
    assert.match(windTextAt(hours, at, 5500, label), /at 5,500 ft/);
    assert.match(windTextAt(hours, at, 31_500, label), /above the highest model level/);
  }
});
