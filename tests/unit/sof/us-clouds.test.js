// Checks: at Laughlin (KDLF) the 3D view's model clouds come from NOAA's HRRR through Open-Meteo, and a whole day of asking (opening the 3D view, then
//   leaving it open 24 hours, as the feed schedules it) stays inside Open-Meteo's free limits: under 10,000 calls in the day and never over 600 in any
//   minute, while still asking for a newer HRRR answer about every 3 hours. And Laughlin's three runways, with their true headings, are among the 3D
//   view's airports at KDLF, inside the 3D square, with its usual alternates.
// Serves: plan Step 2c part D (US model clouds asked every 3 hours, inside the free 10,000 a day; the US bases' airfields in 3D), SOF-46 (the pacing).
// Expected values: Open-Meteo's published free tier and counting (its pricing page, read 7 Oct 2026: 600 calls a minute, 10,000 a day; a request costs
//   max(1, variables / 10) calls for each location), written out here, not taken from the code; "about every 3 hours" is Dad's (8 Oct 2026), so at least 8
//   HRRR answers in 24 hours. Laughlin's runways are OurAirports' runways.csv record (public domain), read 8 Oct 2026: 13C/31C, 13L/31R and 13R/31L, each
//   135.4° and 315.4° true. Laughlin's usual alternates are Dad's (7 Oct 2026). The grid is the code's own 13 x 13 over the square (its shape, not a result).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualClock, fakeFetch, json } from './map-testkit.js';
import { CATALOG } from '../../../src/airfields/catalog.js';
import { siteFor } from '../../../src/modules/sof/sites/index.js';
import { createModelFeed, gridPoints, callCost } from '../../../src/modules/sof/model-clouds.js';
import { airportsFor } from '../../../src/modules/sof/airports-data.js';
import { runwayGeometry } from '../../../src/modules/sof/airports3d.js';
import { createProjection } from '../../../src/modules/sof/map-view.js';
import { AREA_FT } from '../../../src/modules/sof/scene3d-model.js';

/** Open-Meteo's free tier (pricing page): calls a day and a minute. */
const FREE_PER_DAY = 10_000;
const FREE_PER_MINUTE = 600;
/** Open-Meteo's counting (pricing page): max(1, variables / 10) calls for each location of a request. */
const openMeteoCalls = (locations, variables) => Math.max(1, variables / 10) * locations;

const HOUR_MS = 3_600_000;

/** A well-formed Open-Meteo reply for whatever the address asks: every point, every hourly variable, every hour (cloud at 850 hPa, so there is cloud to draw). */
function reply(url, startMs) {
  const q = new URL(url).searchParams;
  const points = q.get('latitude').split(',').length;
  const variables = q.get('hourly').split(',');
  const hours = Number(q.get('forecast_hours'));
  const first = Math.floor(startMs / HOUR_MS) * HOUR_MS;
  const time = Array.from({ length: hours }, (_, k) => new Date(first + k * HOUR_MS).toISOString().slice(0, 16));
  const value = (v) => {
    const hPa = Number(v.match(/_(\d+)hPa$/)?.[1]);
    if (v.startsWith('geopotential_height')) return Math.round(44331 * (1 - (hPa / 1013.25) ** 0.1903)); // standard atmosphere height of the level, metres
    if (v.startsWith('cloud_cover_') && hPa) return hPa === 850 ? 80 : 0;
    if (v.startsWith('cloud_cover')) return 40;
    if (v.startsWith('wind_speed')) return 20;
    if (v.startsWith('wind_direction')) return 270;
    return 4000; // freezing level, metres
  };
  return Array.from({ length: points }, () => ({ hourly: { time, ...Object.fromEntries(variables.map((v) => [v, new Array(hours).fill(value(v))])) } }));
}

test('Laughlin: a day of HRRR asking stays inside Open-Meteo\'s free limits, and Laughlin\'s runways are among the 3D airports', async () => {
  const site = siteFor('KDLF');
  const projection = createProjection(CATALOG.KDLF);
  const clock = virtualClock('2026-10-08T14:10:00Z');
  const start = +clock.now();
  const sent = []; // { at, calls, model }
  const fetch = fakeFetch((url) => {
    const q = new URL(url).searchParams;
    const locations = q.get('latitude').split(',').length;
    const variables = q.get('hourly').split(',').length;
    const calls = openMeteoCalls(locations, variables);
    assert.equal(callCost(locations, variables), calls, 'the feed paces with Open-Meteo\'s own counting');
    sent.push({ at: +clock.now(), calls, model: q.get('models'), host: new URL(url).host });
    return json(reply(url, +clock.now()));
  });
  const feed = createModelFeed({
    points: (size) => gridPoints(projection.toLatLon, size),
    models: () => site.sources.modelClouds.models,
    fetch,
    timers: clock.timers,
    now: clock.now,
  });

  feed.start(); // the 3D view opened
  await clock.advance(24 * HOUR_MS); // and left open all day
  const view = feed.view();
  feed.stop();

  assert.ok(sent.every((s) => s.host === 'api.open-meteo.com'), 'every ask goes to Open-Meteo');
  assert.equal(view.status, 'ok', 'model clouds are there at the end of the day');
  assert.equal(view.model.source, 'hrrr', 'drawn from NOAA HRRR');
  const hrrrAnswers = sent.filter((s) => s.model === 'ncep_hrrr_conus').length / 6; // six bands of rows make one answer
  assert.ok(hrrrAnswers >= 8, `HRRR asked about every 3 hours (${hrrrAnswers} answers in 24 h)`);

  const day = sent.filter((s) => s.at < start + 24 * HOUR_MS).reduce((sum, s) => sum + s.calls, 0);
  assert.ok(day < FREE_PER_DAY, `opening plus a day open: ${Math.round(day)} calls, under Open-Meteo's free ${FREE_PER_DAY}`);
  for (const s of sent) {
    const minute = sent.filter((t) => t.at >= s.at && t.at < s.at + 60_000).reduce((sum, t) => sum + t.calls, 0);
    assert.ok(minute <= FREE_PER_MINUTE, `${Math.round(minute)} calls in the minute from ${new Date(s.at).toISOString()}, not over ${FREE_PER_MINUTE}`);
  }

  // Laughlin's runways (OurAirports, true headings) are among the airports the 3D view draws at KDLF, inside its square, with the usual alternates.
  const airports = airportsFor(site.airports3d);
  for (const alternate of ['KDRT', 'KSAT', 'KSJT', 'KABI', 'KLRD']) assert.ok(airports.some((a) => a.icao === alternate), `${alternate} is drawn in 3D`);
  const laughlin = airports.find((a) => a.icao === 'KDLF');
  assert.ok(laughlin, 'Laughlin is drawn in 3D');
  const ourAirports = { '13C/31C': [135.4, 315.4], '13L/31R': [135.4, 315.4], '13R/31L': [135.4, 315.4] };
  assert.deepEqual(laughlin.runways.map((r) => r.ends.join('/')).sort(), Object.keys(ourAirports).sort(), 'the three runways OurAirports lists');
  for (const r of laughlin.runways) {
    const [a, b] = ourAirports[r.ends.join('/')];
    assert.ok(Math.abs(r.a.headingTrue - a) <= 0.05 && Math.abs(r.b.headingTrue - b) <= 0.05, `${r.ends.join('/')} heads ${a}° and ${b}° true`);
    const g = runwayGeometry(r, projection.toXY);
    assert.ok(g && Math.abs(g.cx) < AREA_FT / 2 && Math.abs(g.cy) < AREA_FT / 2, `${r.ends.join('/')} plots inside the 3D square`);
  }
});
