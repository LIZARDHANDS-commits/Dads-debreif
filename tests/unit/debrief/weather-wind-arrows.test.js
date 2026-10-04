// Checks: the 3 x 3 wind grid over the flight, the one request for nine points, reading the multi-point reply, wind
//   at a height, arrow shape and words.
// Serves: DB-R18, DB-R8.
// Expected values: a hand-made fixture built from a real Open-Meteo single-point reply; one value worked out by hand
//   from it (margins 0.01 kt, 0.05 degrees).

// Wind arrows on the 2D map (SPEC-debrief: Winds aloft; task 12e-2): the 3 x 3
// grid over the flight, the one request for all nine points, reading the
// multi-point reply, each point's wind at the chosen height, the arrow's shape
// and its words. Plain values, tested in Node.
//
// The reply fixture is HAND-MADE (the sandbox couldn't reach Open-Meteo): the
// shape the historical-forecast API returns for several points, an array with
// one reply per point in the order asked, built from the real single-point
// reply beside it (live-gem_hrdps_continental.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIND_MODELS, WIND_LEVELS_HPA, windsUrl, windsGridUrl, readWinds, readWindsGrid } from '../../../src/modules/debrief/weather/winds.js';
import { createWindsFeed } from '../../../src/modules/debrief/weather/winds-feed.js';
import {
  ARROW_HEIGHT, clampArrowFt, windGridPoints, flightLatLonBounds, windArrowsAt, arrowVector, arrowLabel, arrowCaption, arrowStatus,
  ARROW_PX, lastResult,
} from '../../../src/modules/debrief/weather/wind-arrows.js';
import { makeLocalRef, localFtToLatLon } from '../../../src/core/geo.js';

const T = (iso) => Date.parse(iso) / 1000;
const FT = 0.3048;
const fixture = () => JSON.parse(readFileSync(new URL('../../fixtures/debrief/handmade-gem_hrdps_continental-3x3.json', import.meta.url), 'utf8'));
// The reply with the sixth point's ground at 700 m, above 925 hPa's height (646 m).
const raisedGround = () => {
  const reply = fixture();
  reply[5].elevation = 700;
  return readWindsGrid(reply, 9);
};
const BOX = { minLat: 50.2, maxLat: 50.4, minLon: -105.9, maxLon: -105.3 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('the height has a default of 8,000 ft, and a stored one is held to 2,000 to 30,000 ft in steps of 500', () => {
  assert.deepEqual({ ...ARROW_HEIGHT }, { default: 8000, min: 2000, max: 30000, step: 500 });
  assert.equal(clampArrowFt(8000), 8000);
  assert.equal(clampArrowFt(500), 2000);
  assert.equal(clampArrowFt(99_999), 30000);
  assert.equal(clampArrowFt(8260), 8500);
  assert.equal(clampArrowFt(NaN), 8000);
  assert.equal(clampArrowFt('x'), 8000);
});

test('the grid is 3 x 3 over the flight\'s box: corners, edge middles and centre, rounded to 0.01 degrees, south-west first', () => {
  const pts = windGridPoints({ minLat: 50.2049, maxLat: 50.3951, minLon: -105.9049, maxLon: -105.2951 });
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { lat: 50.2, lon: -105.9 });
  assert.deepEqual(pts[1], { lat: 50.2, lon: -105.6 });
  assert.deepEqual(pts[2], { lat: 50.2, lon: -105.3 });
  assert.deepEqual(pts[4], { lat: 50.3, lon: -105.6 });
  assert.deepEqual(pts[8], { lat: 50.4, lon: -105.3 });
  for (const p of pts) {
    assert.equal(p.lat, Math.round(p.lat * 100) / 100);
    assert.equal(p.lon, Math.round(p.lon * 100) / 100);
  }
});

test('a box so small that rounding makes points coincide keeps each place once; a null box has no grid', () => {
  assert.equal(windGridPoints({ minLat: 50.301, maxLat: 50.302, minLon: -105.601, maxLon: -105.599 }).length, 1);
  const line = windGridPoints({ minLat: 50.3, maxLat: 50.3, minLon: -105.9, maxLon: -105.3 });
  assert.deepEqual(line, [{ lat: 50.3, lon: -105.9 }, { lat: 50.3, lon: -105.6 }, { lat: 50.3, lon: -105.3 }]);
  assert.deepEqual(windGridPoints(null), []);
  assert.deepEqual(windGridPoints({ minLat: NaN, maxLat: 1, minLon: 0, maxLon: 1 }), []);
});

test('the flight\'s box in degrees comes from its box in map feet and its reference', () => {
  const ref = makeLocalRef(50.3, -105.6);
  const sw = localFtToLatLon(ref, -30_000, -20_000);
  const ne = localFtToLatLon(ref, 40_000, 25_000);
  const flight = {
    ref,
    tracks: { 1: { slot: 1, fixes: [{ xFt: -30_000, yFt: 0 }, { xFt: 0, yFt: 25_000 }, { xFt: 40_000, yFt: -20_000 }] } },
  };
  const box = flightLatLonBounds(flight);
  near(box.minLat, sw.lat);
  near(box.maxLat, ne.lat);
  near(box.minLon, sw.lon);
  near(box.maxLon, ne.lon);
  assert.equal(flightLatLonBounds(null), null);
  assert.equal(flightLatLonBounds({ ref, tracks: {} }), null);
  assert.equal(flightLatLonBounds({ ref: null, tracks: flight.tracks }), null);
});

test('one request asks for all nine points: comma-separated, rounded, in the order of the grid, with the same hours, levels and units as the Lead line', () => {
  const points = windGridPoints(BOX);
  const startT = T('2026-09-29T18:00Z');
  const endT = T('2026-09-29T19:00Z');
  const url = new URL(windsGridUrl({ points, startT, endT, model: 'hrdps' }));
  assert.equal(url.origin, 'https://historical-forecast-api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '50.20,50.20,50.20,50.30,50.30,50.30,50.40,50.40,50.40');
  assert.equal(url.searchParams.get('longitude'), '-105.90,-105.60,-105.30,-105.90,-105.60,-105.30,-105.90,-105.60,-105.30');
  assert.equal(url.searchParams.get('models'), WIND_MODELS.hrdps.id);
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kn');
  assert.equal(url.searchParams.get('hourly').split(',').length, WIND_LEVELS_HPA.length * 3);
  // Rounds what it is given, and shares everything else with the single-point address (the Lead line's is unchanged).
  const one = new URL(windsUrl({ lat: 50.2049, lon: -105.9049, startT, endT, model: 'hrdps' }));
  const grid1 = new URL(windsGridUrl({ points: [{ lat: 50.2049, lon: -105.9049 }], startT, endT, model: 'hrdps' }));
  assert.equal(grid1.href, one.href);
  assert.equal(one.searchParams.get('latitude'), '50.20');
  assert.throws(() => windsGridUrl({ points: [], startT, endT, model: 'hrdps' }), TypeError);
  assert.throws(() => windsGridUrl({ points: [{ lat: NaN, lon: 0 }], startT, endT, model: 'hrdps' }), TypeError);
  assert.throws(() => windsGridUrl({ points, startT, endT, model: 'x' }), TypeError);
});

test('the multi-point reply is a list with one reply per point, and each is read as the single-point reply is, with its own ground', () => {
  const list = readWindsGrid(fixture(), 9);
  assert.equal(list.length, 9);
  for (const hours of list) {
    assert.equal(hours.length, 6);
    assert.equal(hours[0].t, T('2026-09-29T15:00Z'));
  }
  near(list[0].groundFt, 570 / FT);
  near(list[8].groundFt, 586 / FT); // each point's own elevation
  // The same as reading that point's reply alone.
  assert.deepEqual([...list[3]], [...readWinds(fixture()[3])]);
  // One point asked for comes back as a single reply, not a list.
  const single = readWindsGrid(fixture()[0], 1);
  assert.equal(single.length, 1);
  assert.deepEqual([...single[0]], [...list[0]]);
  // Fewer replies than points, or nonsense: the missing points are empty, never shifted.
  const short = readWindsGrid(fixture().slice(0, 4), 9);
  assert.equal(short.length, 9);
  assert.equal(short[3].length, 6);
  assert.deepEqual([...short[4]], []);
  assert.deepEqual(readWindsGrid(null, 2).map((h) => h.length), [0, 0]);
});

test('each point\'s wind at a height is the Lead line\'s blend, by height and by time, leaving out levels under that point\'s own ground', () => {
  const points = windGridPoints(BOX);
  const grid = readWindsGrid(fixture(), 9);
  const t = T('2026-09-29T18:30Z');
  const at8 = windArrowsAt(grid, points, t, 8000);
  assert.equal(at8.length, 9);
  assert.ok(at8.every((a) => a.wind && a.why === null));
  assert.deepEqual(at8.map((a) => ({ lat: a.lat, lon: a.lon })), points);
  assert.deepEqual(at8[0].hoursT, [T('2026-09-29T18:00Z'), T('2026-09-29T19:00Z')]);
  // The first point is the real reply's own winds (no scaling), halfway between the 18Z and 19Z hours, and 8,000 ft
  // lies between 850 hPa (1,358 m) and 700 hPa (2,957 m) heights: its speed is between theirs.
  assert.ok(at8[0].wind.kt > 30 && at8[0].wind.kt < 40, `got ${at8[0].wind.kt}`);
  // The points differ from each other (the hand-made reply varies them).
  assert.notEqual(at8[0].wind.kt, at8[8].wind.kt);
  // 2,000 ft is under 925 hPa's height (about 2,120 ft) and the ground is 1,870 ft: 925 hPa is the lowest level above the ground, so none below it.
  const at2 = windArrowsAt(grid, points, t, 2000);
  assert.ok(at2.every((a) => a.wind === null && a.why === 'below'));
  // Each point drops the levels under its own ground: raise one point's ground above 925 hPa's height (646 m), and 3,000 ft
  // (between 925 and 850 hPa) goes from a wind to none at that point only.
  const raised = raisedGround();
  const at3 = windArrowsAt(raised, points, t, 3000);
  assert.deepEqual(at3.map((a) => a.wind !== null), [true, true, true, true, true, false, true, true, true]);
  assert.equal(at3[5].why, 'below');
  // Above the model's highest level, and no hour in force, say so.
  assert.equal(windArrowsAt(grid, points, t, 31_000)[0].why, 'above');
  assert.equal(windArrowsAt(grid, points, T('2026-09-29T22:00Z'), 8000)[0].why, 'time');
  assert.equal(windArrowsAt([[]], [points[0]], t, 8000)[0].why, 'time');
});

test('an arrow points downwind: the way the air moves, opposite the model\'s "from" direction, in screen pixels with north up', () => {
  const to = (dirDeg, kt = 20) => arrowVector({ dirDeg, kt });
  // Wind from the west (270) blows east: right on the screen.
  let v = to(270);
  near(v.dx, v.lengthPx);
  near(v.dy, 0);
  // From the north (360): blows south, down the screen (y grows downward).
  v = to(360);
  near(v.dx, 0);
  near(v.dy, v.lengthPx);
  // From the south: up. From the east: left. From the north-east: towards the south-west.
  v = to(180);
  near(v.dy, -v.lengthPx);
  v = to(90);
  near(v.dx, -v.lengthPx);
  v = to(45);
  near(v.dx, -v.lengthPx / Math.SQRT2);
  near(v.dy, v.lengthPx / Math.SQRT2);
  near(Math.hypot(v.dx, v.dy), v.lengthPx);
});

test('an arrow\'s length grows with the speed and is held to a readable range', () => {
  const len = (kt) => arrowVector({ dirDeg: 270, kt }).lengthPx;
  assert.equal(len(0.5), ARROW_PX.min); // light wind: still a visible arrow
  assert.equal(len(500), ARROW_PX.max); // a jet stream does not run across the map
  assert.ok(len(20) < len(40) && len(40) < len(60));
  assert.ok(len(20) > ARROW_PX.min && len(60) < ARROW_PX.max, `${len(20)} ${len(60)}`);
  near(len(40), len(20) + 20 * ARROW_PX.perKt);
});

test('the label is the Lead line\'s words for the wind, "280°T/38 kt", and calm says calm', () => {
  assert.equal(arrowLabel({ dirDeg: 278, kt: 38.2 }), '280°T/38 kt');
  assert.equal(arrowLabel({ dirDeg: 2, kt: 12 }), '360°T/12 kt');
  assert.equal(arrowLabel({ dirDeg: 90, kt: 0.2 }), 'calm');
});

test('the caption names the height, the model, the hours and the source; the status says why a point has no arrow', () => {
  assert.equal(arrowCaption(8000, 'HRDPS', [T('2026-09-29T18:00Z'), T('2026-09-29T19:00Z')]), 'Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)');
  assert.equal(arrowCaption(12_500, 'HRRR', [T('2026-09-29T18:00Z')]), 'Model wind at 12,500 ft (HRRR 18Z, Open-Meteo)');
  const points = windGridPoints(BOX);
  const grid = readWindsGrid(fixture(), 9);
  const t = T('2026-09-29T18:30Z');
  assert.equal(arrowStatus(windArrowsAt(grid, points, t, 8000), 8000, 'HRDPS'), '9 of 9 points have model wind');
  assert.equal(arrowStatus(windArrowsAt(grid, points, t, 2000), 2000, 'HRDPS'), "no model wind at 2,000 ft here (below the model's lowest level)");
  assert.equal(arrowStatus(windArrowsAt(grid, points, t, 31_000), 31_000, 'HRDPS'), "no model wind at 31,000 ft here (above the model's highest level)");
  assert.equal(arrowStatus(windArrowsAt(grid, points, T('2026-09-29T22:00Z'), 8000), 8000, 'HRDPS'), 'no HRDPS wind for this time');
  const raised = raisedGround();
  assert.equal(arrowStatus(windArrowsAt(raised, points, t, 3000), 3000, 'HRDPS'), 'no model wind at 3,000 ft at 1 of 9 points (below the model\'s lowest level)');
  assert.equal(arrowStatus([], 8000, 'HRDPS'), '');
  // Some points drawn and the rest missing: never "no wind" for the whole map (verification re-check of #213, W1).
  const w = { wind: { dirDeg: 200, kt: 20 }, why: null };
  const noHour = { wind: null, why: 'time' };
  const below = { wind: null, why: 'below' };
  assert.equal(arrowStatus([w, noHour, noHour], 8000, 'HRDPS'), 'no HRDPS wind for this time at 2 of 3 points');
  assert.equal(arrowStatus([w, below, noHour], 8000, 'HRDPS'), '1 of 3 points have model wind');
  assert.equal(arrowStatus([below, noHour], 2000, 'HRDPS'), 'no model wind at 2,000 ft here');
});

test('the feed asks for the grid once per model, in one request, only when asked, and the Lead line\'s request is its own', async () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const flight = { startT: T('2026-09-29T18:00Z'), endT: T('2026-09-29T19:00Z') };
  const points = windGridPoints(BOX);
  const calls = [];
  let answer = { ok: true, status: 200, json: () => Promise.resolve(fixture()) };
  let changes = 0;
  const feed = createWindsFeed({ fetch: (url, init) => { calls.push({ url, signal: init.signal }); return Promise.resolve(answer); }, onChange: () => changes++ });
  assert.equal(feed.getGrid('hrdps'), null); // no flight yet
  feed.setFlight(flight, { lat: 50.3, lon: -105.6 }, points);
  assert.equal(calls.length, 0); // nothing is asked until something asks
  assert.equal(feed.getGrid('hrdps').state, 'loading');
  feed.getGrid('hrdps');
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('latitude').split(',').length, 9);
  await settle();
  const entry = feed.getGrid('hrdps');
  assert.equal(entry.state, 'ready');
  assert.equal(entry.grid.length, 9);
  assert.equal(entry.grid[0].length, 6);
  assert.equal(calls.length, 1);
  assert.equal(changes, 1);
  // The Lead line's own fetch is separate: one point, and it does not read the grid's reply.
  answer = { ok: true, status: 200, json: () => Promise.resolve(fixture()[4]) };
  assert.equal(feed.get('hrdps').state, 'loading');
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get('latitude'), '50.30');
  assert.equal(feed.get('hrdps').hours.length, 6);
  assert.equal(feed.getGrid('hrdps').grid.length, 9);

  // A rate limit or an error is shown and retry() asks again, as for the Lead line.
  answer = { ok: false, status: 429, json: () => Promise.resolve({ reason: 'Daily API request limit exceeded.' }) };
  feed.setFlight(flight, { lat: 50.3, lon: -105.6 }, points);
  feed.getGrid('hrrr');
  await settle();
  assert.deepEqual({ state: feed.getGrid('hrrr').state, daily: feed.getGrid('hrrr').daily }, { state: 'busy', daily: true });
  answer = { ok: false, status: 500 };
  feed.retry();
  feed.getGrid('hrrr');
  await settle();
  assert.deepEqual(feed.getGrid('hrrr').failure, { kind: 'http', status: 500 });
  answer = { ok: true, status: 200, json: () => Promise.resolve(fixture()) };
  feed.retry();
  feed.getGrid('hrrr');
  await settle();
  assert.equal(feed.getGrid('hrrr').state, 'ready');

  // Closing the flight cancels what is still loading and drops a late answer.
  const before = changes;
  feed.setFlight(flight, null, points);
  feed.getGrid('hrdps');
  const signal = calls.at(-1).signal;
  feed.dispose();
  assert.equal(signal.aborted, true);
  await settle();
  assert.equal(changes, before);
  assert.equal(feed.getGrid('hrdps'), null);
  // With no grid points (no flight box) there is nothing to ask.
  feed.setFlight(flight, { lat: 50.3, lon: -105.6 }, []);
  assert.equal(feed.getGrid('hrdps'), null);
});

test('a calm wind (the speed rounds to 0 kt, as the words say "calm") has no direction to point: no length, marked calm', () => {
  const calm = arrowVector({ dirDeg: 270, kt: 0.4 });
  assert.deepEqual(calm, { dx: 0, dy: 0, lengthPx: 0, calm: true });
  assert.equal(arrowVector({ dirDeg: 90, kt: 0 }).calm, true);
  // 0.5 kt reads "1 kt", so it is still an arrow, at the shortest length.
  const light = arrowVector({ dirDeg: 270, kt: 0.5 });
  assert.equal(light.calm, undefined);
  assert.equal(light.lengthPx, ARROW_PX.min);
  assert.equal(arrowLabel({ dirDeg: 270, kt: 0.4 }), 'calm');
});

test('the fallback ground height (fieldFt) is used only for a point whose reply gave no elevation, and it drops the levels under it', () => {
  const points = windGridPoints(BOX);
  const t = T('2026-09-29T18:30Z');
  // 1,500 ft is between 950 hPa (about 1,370 ft) and 925 hPa (about 2,120 ft). Point 0's reply has no elevation.
  const noElevation = () => {
    const reply = fixture();
    delete reply[0].elevation;
    return readWindsGrid(reply, 9);
  };
  const grid = noElevation();
  assert.equal(grid[0].groundFt, undefined);
  assert.ok(grid[1].groundFt > 1800, 'the others keep their own ground');
  // A low field keeps 950 hPa for that point, so there is a wind at 1,500 ft: blended between 950 and 925.
  const low = windArrowsAt(grid, points, t, 1500, { fieldFt: 500 });
  assert.ok(low[0].wind, 'the 950 hPa level is used');
  // No field given: nothing is left out either.
  assert.ok(windArrowsAt(grid, points, t, 1500)[0].wind);
  // A field at Moose Jaw's 1,892 ft puts 950 hPa under the ground: dropped, so 1,500 ft is below the lowest level.
  const high = windArrowsAt(grid, points, t, 1500, { fieldFt: 1892 });
  assert.equal(high[0].wind, null);
  assert.equal(high[0].why, 'below');
  // The points that gave an elevation ignore the fallback: their own ground (about 1,870 ft) already drops 950 hPa, and a low fallback does not bring it back.
  for (const i of [1, 4, 8]) {
    assert.equal(windArrowsAt(grid, points, t, 1500, { fieldFt: 500 })[i].wind, null, `point ${i}`);
    assert.equal(windArrowsAt(grid, points, t, 1500, { fieldFt: 500 })[i].why, 'below');
  }
});

test('one exact value: point 0 at 18:30Z and 8,000 ft, worked out by hand from the fixture (not by this code), so passing the hour instead of the moment fails', () => {
  // Point 0's ground is 570 m (1,870 ft), so 950 hPa is dropped and 8,000 ft lies between 800 hPa and 700 hPa.
  // 18Z: 27 kt/279° at 6,112 ft and 33.2 kt/266° at 9,701 ft, a fraction 0.5260 of the way up: 30.07 kt from 271.49°.
  // 19Z: 30 kt/282° at 6,122 ft and 32.5 kt/278° at 9,711 ft, a fraction 0.5232 of the way up: 31.29 kt from 279.83°.
  // Halfway between them as vectors: 30.60 kt from 275.74°. (The hour alone, 18Z, would be 30.07 kt from 271.49°.)
  const points = windGridPoints(BOX);
  const [arrow] = windArrowsAt(readWindsGrid(fixture(), 9), points, T('2026-09-29T18:30Z'), 8000);
  near(arrow.wind.kt, 30.599, 0.01);
  near(arrow.wind.dirDeg, 275.744, 0.05);
  assert.deepEqual(arrow.hoursT, [T('2026-09-29T18:00Z'), T('2026-09-29T19:00Z')]);
  assert.equal(arrowLabel(arrow.wind), '280°T/31 kt');
  // On the hour, it is that hour's own value.
  const [onHour] = windArrowsAt(readWindsGrid(fixture(), 9), points, T('2026-09-29T18:00Z'), 8000);
  near(onHour.wind.kt, 30.071, 0.01);
  near(onHour.wind.dirDeg, 271.494, 0.05);
});

test('lastResult works a thing out again only when an input changes, so a pan or zoom while paused reuses the arrows', () => {
  let runs = 0;
  const grid = [[]];
  const arrows = lastResult((g, t, alt) => {
    runs++;
    return { g, t, alt };
  });
  const first = arrows(grid, 100, 8000);
  assert.equal(arrows(grid, 100, 8000), first); // the same object: nothing recomputed
  assert.equal(runs, 1);
  assert.notEqual(arrows(grid, 101, 8000), first); // time moved
  assert.notEqual(arrows(grid, 101, 9000), first); // height changed
  assert.notEqual(arrows([[]], 101, 9000).g, grid); // a new reply
  assert.equal(runs, 4);
  arrows([[]], 101, 9000); // a different array with the same content is a different input: asked again
  assert.equal(runs, 5);
  // A result that is null or undefined is remembered too.
  let nulls = 0;
  const none = lastResult(() => { nulls++; return null; });
  none(1);
  none(1);
  assert.equal(nulls, 1);
});
