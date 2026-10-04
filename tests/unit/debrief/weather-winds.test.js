// Checks: winds aloft from Open-Meteo: model by date, archive address, reading replies, wind at an altitude and
//   blended by time, wording, feed errors, no levels below ground.
// Serves: DB-R8, DB-R18.
// Expected values: typed-in replies, and two real Open-Meteo replies for Moose Jaw on 29 Sep 2026 used for shape and
//   rules only; worked vector blends.

// Winds aloft (SPEC-debrief: Weather at the time of the flight): the archive
// address, reading the reply, the wind at Lead's altitude and its words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WIND_MODELS, WIND_LEVELS_HPA, windModelFor, windsUrl, readWinds, windAtAltitude, windAt, windWords, windTextAt, windFailureText,
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
  // N3: a flight ending after 23:00Z needs the next 00Z hour to blend towards, so the next day is asked for.
  const late = new URL(windsUrl({ lat: 50.33, lon: -105.56, startT: T('2026-09-29T22:00Z'), endT: T('2026-09-29T23:30Z'), model: 'hrdps' }));
  assert.equal(late.searchParams.get('end_date'), '2026-09-30');
  const early = new URL(windsUrl({ lat: 50.33, lon: -105.56, startT: T('2026-09-29T21:00Z'), endT: T('2026-09-29T22:30Z'), model: 'hrdps' }));
  assert.equal(early.searchParams.get('end_date'), '2026-09-29');
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
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 2000, 'HRDPS'), "no HRDPS wind at 2,000 ft (below the model's lowest level: see the METAR)");
  assert.equal(windTextAt(hours, T('2026-09-29T18:10Z'), 12_000, 'HRDPS'), "no HRDPS wind at 12,000 ft (above the model's highest level, 9,700 ft)");
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
    assert.match(text, new RegExp(`^model wind \\d{3}°T/\\d+ kt at 12,600 ft \\(${label} 18–19Z, Open-Meteo\\)$`));
    for (const word of ['model', 'kt', '°T']) assert.ok(text.includes(word), word); // true, in knots, and not observed (W1)
    assert.match(windTextAt(hours, at, 5500, label), /at 5,500 ft/);
    assert.match(windTextAt(hours, at, 31_500, label), /above the model's highest level/);
  }
});

// Two model hours with the same levels, to see the blend in time.
const level = (hPa, heightFt, dirDeg, kt) => ({ hPa, heightFt, dirDeg, kt });
const twoHours = (dir18, dir19, kt18 = 40, kt19 = 40) => [
  { t: T('2026-09-29T18:00Z'), levels: [level(850, 4000, dir18, kt18), level(700, 8000, dir18, kt18)] },
  { t: T('2026-09-29T19:00Z'), levels: [level(850, 4000, dir19, kt19), level(700, 8000, dir19, kt19)] },
];

test('W3: between two model hours the wind is blended by time as a vector, not a step at the hour', () => {
  const hours = twoHours(90, 180);
  // Halfway: 40 kt from the east and 40 kt from the south make 28.3 kt from 135°.
  const mid = windAt(hours, T('2026-09-29T18:30Z'), 6000);
  assert.ok(Math.abs(mid.wind.dirDeg - 135) < 1e-9 && Math.abs(mid.wind.kt - Math.hypot(20, 20)) < 1e-9, JSON.stringify(mid));
  assert.deepEqual(mid.hoursT, [T('2026-09-29T18:00Z'), T('2026-09-29T19:00Z')]);
  // A quarter of the way: 30 kt from the east, 10 kt from the south.
  const q = windAt(hours, T('2026-09-29T18:15Z'), 6000);
  assert.ok(Math.abs(q.wind.kt - Math.hypot(30, 10)) < 1e-9);
  assert.ok(Math.abs(q.wind.dirDeg - 108.43) < 0.01, `got ${q.wind.dirDeg}`); // from between east and south, nearer the east
  // On the hour, that hour alone; 350° and 010° halfway is 360°, not 180°.
  assert.deepEqual(windAt(hours, T('2026-09-29T18:00Z'), 6000).hoursT, [T('2026-09-29T18:00Z')]);
  assert.equal(windAt(hours, T('2026-09-29T19:00Z'), 6000).hoursT[0], T('2026-09-29T19:00Z'));
  const north = windAt(twoHours(350, 10), T('2026-09-29T18:30Z'), 6000).wind;
  assert.ok(Math.abs(((north.dirDeg + 180) % 360) - 180) < 1e-9 && north.kt > 39 && north.kt < 40);
});

test('W3: no jump one second either side of the hour, on a real reply', () => {
  for (const [id] of REAL_MODELS) {
    const hours = readWinds(real(id));
    const before = windAt(hours, hours[19].t - 1, 12_600).wind;
    const after = windAt(hours, hours[19].t, 12_600).wind;
    assert.ok(Math.abs(before.kt - after.kt) < 0.05, `${id} ${before.kt} vs ${after.kt}`);
    assert.ok(Math.abs(before.dirDeg - after.dirDeg) < 0.5, `${id} ${before.dirDeg} vs ${after.dirDeg}`);
  }
});

test('W3: the label names both hours while blending, one hour when only one is used', () => {
  const hours = twoHours(90, 180);
  assert.equal(windTextAt(hours, T('2026-09-29T18:30Z'), 6000, 'HRDPS'), 'model wind 140°T/28 kt at 6,000 ft (HRDPS 18–19Z, Open-Meteo)');
  assert.equal(windTextAt(hours, T('2026-09-29T18:00Z'), 6000, 'HRDPS'), 'model wind 090°T/40 kt at 6,000 ft (HRDPS 18Z, Open-Meteo)');
  // The last hour has none after it: that hour alone, while it is under 90 minutes old.
  assert.match(windTextAt(hours, T('2026-09-29T19:30Z'), 6000, 'HRDPS'), /\(HRDPS 19Z, Open-Meteo\)$/);
  assert.equal(windTextAt(hours, T('2026-09-29T20:31Z'), 6000, 'HRDPS'), 'no HRDPS wind for this time');
  // Hours more than 90 minutes apart are not blended across the gap.
  const gap = [twoHours(90, 180)[0], { ...twoHours(90, 180)[1], t: T('2026-09-29T21:00Z') }];
  assert.match(windTextAt(gap, T('2026-09-29T18:30Z'), 6000, 'HRDPS'), /\(HRDPS 18Z, Open-Meteo\)$/);
  // The next hour has no wind at this height (its levels are higher): the earlier hour alone.
  const raised = [twoHours(90, 180)[0], { t: T('2026-09-29T19:00Z'), levels: [level(700, 8000, 180, 40)] }];
  assert.match(windTextAt(raised, T('2026-09-29T18:30Z'), 6000, 'HRDPS'), /\(HRDPS 18Z, Open-Meteo\)$/);
});

const FIELD_FT = 1892; // Moose Jaw, data/cymj.js

test('W4: levels below the ground are not blended in: on the real replies 950 hPa is under Moose Jaw\'s field', () => {
  for (const [id, label] of REAL_MODELS) {
    const hours = readWinds(real(id));
    const hour = hours[18];
    assert.equal(hour.levels[0].hPa, 950);
    assert.ok(hour.levels[0].heightFt < FIELD_FT, `${id}: 950 hPa is ${hour.levels[0].heightFt} ft`);
    // Without the field, the old behaviour: a wind at 1,900 ft, made from the level under the ground.
    assert.ok(windAtAltitude(hour, 1900));
    // With it: none between the field and the 925 hPa level, and on the ramp.
    const t = hour.t;
    const seen = (ft) => windTextAt(hours, t, ft, label, { fieldFt: FIELD_FT });
    assert.equal(seen(1900), `no ${label} wind at 1,900 ft (below the model's lowest level: see the METAR)`);
    assert.equal(seen(1875), `no ${label} wind at 1,900 ft (below the model's lowest level: see the METAR)`); // ramp reading under the field
    assert.match(seen(hour.levels[1].heightFt - 50), /below the model's lowest level: see the METAR/);
    // At the 925 hPa level and above, the wind is the model's, with no 950 hPa in it.
    const l925 = hour.levels[1];
    const at925 = windAt(hours, t, l925.heightFt, { fieldFt: FIELD_FT }).wind;
    assert.ok(Math.abs(at925.dirDeg - l925.dirDeg) < 1e-9 && Math.abs(at925.kt - l925.kt) < 1e-9);
    const without950 = { ...hour, levels: hour.levels.slice(1) };
    const above = l925.heightFt + 200;
    assert.deepEqual(windAt(hours, t, above, { fieldFt: FIELD_FT }).wind, windAtAltitude(without950, above));
    assert.match(seen(above), /^model wind \d{3}°T\/\d+ kt at /);
  }
});

test('W4: with a lower field the 950 hPa level is used; with no field given, every level is', () => {
  const hours = [...readWinds(real('gem_hrdps_continental'))]; // a copy has no ground height of its own, so the option decides
  const l950 = hours[18].levels[0];
  const inside = windAt(hours, hours[18].t, l950.heightFt + 100, { fieldFt: 500 }).wind;
  assert.ok(inside);
  assert.deepEqual(windAt(hours, hours[18].t, l950.heightFt + 100).wind, inside);
  assert.equal(windAt(hours, hours[18].t, l950.heightFt - 100, { fieldFt: 500 }).wind, null);
  // A field above every level: nothing to blend, and the words say so.
  assert.equal(windTextAt(hours, hours[18].t, 40_000, 'HRDPS', { fieldFt: 35_000 }), 'no HRDPS wind at 40,000 ft (no model level above the field)');
});

test('W4: above the top level the line names it, and the time blend keeps the rule for the next hour too', () => {
  const hours = readWinds(real('ncep_hrrr_conus'));
  assert.match(windTextAt(hours, hours[18].t, 31_500, 'HRRR', { fieldFt: FIELD_FT }), /^no HRRR wind at 31,500 ft \(above the model's highest level, 30,500 ft\)$/);
  // Half past the hour, just above the 925 hPa level: both hours give a wind and neither uses 950 hPa.
  const half = hours[18].t + 1800;
  const ft = hours[18].levels[1].heightFt + 100;
  const blended = windAt(hours, half, ft, { fieldFt: FIELD_FT });
  assert.equal(blended.hoursT.length, 2);
  const no950 = hours.map((h) => ({ ...h, levels: h.levels.slice(1) }));
  assert.deepEqual(blended.wind, windAt(no950, half, ft).wind);
});

test('W5: the feed tells a server error, an unreadable reply and no connection apart, and the words match', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const flight = { startT: T('2026-09-29T18:00Z'), endT: T('2026-09-29T19:00Z') };
  const point = { lat: 50.33, lon: -105.56 };
  const failure = async (fetch) => {
    const feed = createWindsFeed({ fetch, onChange: () => {} });
    feed.setFlight(flight, point);
    feed.get('hrdps');
    await settle();
    const entry = feed.get('hrdps');
    feed.dispose();
    return entry;
  };
  const server = await failure(() => Promise.resolve({ ok: false, status: 500 }));
  assert.equal(server.state, 'failed');
  assert.deepEqual(server.failure, { kind: 'http', status: 500 });
  const html = await failure(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }));
  assert.equal(html.state, 'failed');
  assert.deepEqual(html.failure, { kind: 'reply', status: 200 });
  const offline = await failure(() => Promise.reject(new TypeError('Failed to fetch')));
  assert.equal(offline.state, 'failed');
  assert.deepEqual(offline.failure, { kind: 'network', status: null });

  assert.equal(windFailureText('HRDPS', server.failure), 'HRDPS winds: Open-Meteo answered with an error (500). Turn Winds aloft off and on to try again.');
  assert.equal(windFailureText('HRDPS', html.failure), "HRDPS winds: Open-Meteo's answer wasn't wind data. Turn Winds aloft off and on to try again.");
  assert.equal(windFailureText('HRDPS', offline.failure), "HRDPS winds couldn't load. They need a connection.");
  assert.ok(!/connection/i.test(windFailureText('HRDPS', server.failure)));
  assert.ok(!/connection/i.test(windFailureText('HRDPS', html.failure)));
  assert.match(windFailureText('HRRR', null), /^HRRR winds couldn't load/);
});

test('Y1: the next hour is blended in only with its own above-ground levels, and only within 90 minutes', () => {
  // (a) The next hour's below-field level (1,500 ft) is under Lead and its lowest above-ground level (6,500 ft) is over him:
  // with the field applied to that hour too there is no wind there, so the earlier hour stands alone.
  const next = { t: T('2026-09-29T19:00Z'), levels: [level(950, 1500, 180, 40), level(850, 6500, 180, 40), level(700, 8000, 180, 40)] };
  const hours = [twoHours(90, 180)[0], next];
  assert.equal(windTextAt(hours, T('2026-09-29T18:30Z'), 5000, 'HRDPS', { fieldFt: 2000 }), 'model wind 090°T/40 kt at 5,000 ft (HRDPS 18Z, Open-Meteo)');
  // Without a field the below-ground level would be blended in, and both hours named.
  assert.match(windTextAt(hours, T('2026-09-29T18:30Z'), 5000, 'HRDPS'), /\(HRDPS 18–19Z, Open-Meteo\)$/);

  // (b) A 90-minute gap blends, 60 minutes blends, 91 minutes does not.
  const spaced = (minutes) => [twoHours(90, 180)[0], { ...twoHours(90, 180)[1], t: T('2026-09-29T18:00Z') + minutes * 60 }];
  const label = (minutes) => windTextAt(spaced(minutes), T('2026-09-29T18:20Z'), 6000, 'HRDPS').match(/\((HRDPS [^,]+),/)[1];
  assert.equal(label(60), 'HRDPS 18–19Z');
  assert.equal(label(90), 'HRDPS 18–19Z');
  assert.equal(label(91), 'HRDPS 18Z');
});

test('N1: a level exactly at the field is above the ground and is kept', () => {
  const hour = { t: T('2026-09-29T18:00Z'), levels: [level(925, 2000, 270, 20), level(850, 4000, 270, 30)] };
  const atField = windAtAltitude(hour, 2000, { fieldFt: 2000 });
  assert.ok(atField && Math.abs(atField.kt - 20) < 1e-9);
  assert.equal(windAtAltitude(hour, 1999, { fieldFt: 2000 }), null);
  assert.equal(windAtAltitude(hour, 2000, { fieldFt: 2001 }), null); // one foot higher and the level is under the ground
});

test('Y2: the ground under the wind point, from the reply, decides which levels are under it', () => {
  // The real replies say 573 m (1,880 ft) for Moose Jaw.
  for (const [id, label] of REAL_MODELS) {
    const hours = readWinds(real(id));
    assert.ok(Math.abs(hours.groundFt - 573 / FT) < 1e-6, `${id}: ${hours.groundFt}`);
    // With no field given the reply's ground is used: 950 hPa (about 1,400 ft) is left out.
    assert.match(windTextAt(hours, hours[18].t, 1900, label), /below the model's lowest level: see the METAR/);
    assert.match(windTextAt(hours, hours[18].t, hours[18].levels[1].heightFt + 100, label), /^model wind /);
    // The reply's ground wins over the home field's.
    assert.match(windTextAt(hours, hours[18].t, 1900, label, { fieldFt: 500 }), /below the model's lowest level/);
  }
  // High ground under the wind point: 1,500 m (4,921 ft) puts the 850 hPa level (4,455 ft) under it too.
  const high = readWinds({ ...reply(), elevation: 1500 });
  assert.ok(Math.abs(high.groundFt - 1500 / FT) < 1e-6);
  assert.equal(windTextAt(high, T('2026-09-29T18:00Z'), 5000, 'HRDPS'), "no HRDPS wind at 5,000 ft (below the model's lowest level: see the METAR)");
  assert.match(windTextAt(high, T('2026-09-29T18:00Z'), 2957 / FT, 'HRDPS'), /^model wind /);
  // Without the reply's elevation, or with a bad one, the home field given by the caller is used, and then none.
  for (const elevation of [undefined, null, 'high']) {
    const hours = readWinds({ ...reply(), elevation });
    assert.equal(hours.groundFt, undefined);
    assert.match(windTextAt(hours, T('2026-09-29T18:00Z'), 5000, 'HRDPS'), /^model wind /);
    assert.match(windTextAt(hours, T('2026-09-29T18:00Z'), 5000, 'HRDPS', { fieldFt: 4921 }), /below the model's lowest level/);
  }
  assert.deepEqual(readWinds({ hourly: {}, elevation: 500 }), []); // no hours: still a plain empty list
});

test('N5: a body that fails as a TypeError is the connection; one that fails as a SyntaxError is the reply', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const feed = createWindsFeed({ fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new TypeError('network error')) }), onChange: () => {} });
  feed.setFlight({ startT: T('2026-09-29T18:00Z'), endT: T('2026-09-29T19:00Z') }, { lat: 50.33, lon: -105.56 });
  feed.get('hrdps');
  await settle();
  assert.deepEqual(feed.get('hrdps').failure, { kind: 'network', status: null });
  feed.dispose();
});
