// Winds aloft (SPEC-debrief: Weather at the time of the flight): the archive
// address, reading the reply, the wind at Lead's altitude and its words.
import test from 'node:test';
import assert from 'node:assert/strict';
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

test('the words: direction to 10°, 360 for north, then knots; the hour in force and the model', () => {
  assert.equal(windWords({ dirDeg: 266, kt: 33.2 }), '270/33');
  assert.equal(windWords({ dirDeg: 2, kt: 12 }), '360/12');
  assert.equal(windWords({ dirDeg: 45, kt: 0.2 }), 'calm');
  const hours = readWinds(reply());
  assert.equal(windTextAt(hours, T('2026-09-29T18:40Z'), 1358 / FT, 'HRDPS'), 'wind 280/35 at 4,500 ft (HRDPS 18Z, Open-Meteo)');
  assert.equal(windTextAt(hours, T('2026-09-29T19:05Z'), 1360 / FT, 'HRDPS'), 'wind 350/30 at 4,500 ft (HRDPS 19Z, Open-Meteo)');
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 2000, 'HRDPS'), 'no HRDPS wind at 2,000 ft: below the lowest model level (4,500 ft)');
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 12_000, 'HRDPS'), 'no HRDPS wind at 12,000 ft: above the highest model level');
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
