// Tests for src/modules/sof/map-feeds.js: the radar feed's time and picture, its age from the
// layer's own time, stale after 20 minutes, the RainViewer backup after two ECCC failures (and
// back), and every request's discipline (SPEC-sof, Map and Security; R4). A virtual clock and a
// fake fetch serve captured replies; nothing here reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS } from '../../../src/modules/sof/feeds.js';
import {
  capabilitiesUrl, extraMapUrl, layerTimeOf, feedLine, createImageFeed, createRadarFeed, EXTRA_LAYERS,
  RAINVIEWER_LIST_URL, RETRY_MS, VIEW_SETTLE_MS,
} from '../../../src/modules/sof/map-feeds.js';
import { virtualClock, fakeFetch, text, png, pngBytes, json, fail, fixture } from './map-testkit.js';

const MIN = 60_000;
const caps = (layer) => fixture(`geomet-caps-${layer}.xml`);
const GOES = fixture('map-caps-GOES-West_1km_DayVis-NightIR.xml');
const REQUEST = { bbox: [-110.4, 48.4, -100.8, 52.6], width: 900, height: 700, key: 'a' };
const RADAR_TIME = new Date('2026-09-30T07:12:00Z');

// ---- Addresses ---------------------------------------------------------------------------------

test('a capabilities address asks for one named layer, never the 40 MB list', () => {
  const url = capabilitiesUrl(LAYERS.radarRain);
  assert.equal(url, 'https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI');
  for (const name of [...Object.values(LAYERS), ...Object.values(EXTRA_LAYERS)]) assert.match(capabilitiesUrl(name), /&layer=[A-Za-z0-9_.-]+$/);
  for (const bad of ['', 'RADAR', 'x&layer=y', '../etc', undefined, null, 5]) assert.throws(() => capabilitiesUrl(bad), RangeError);
});

test('the cloud and warnings pictures are built from a fixed name, numbers and a checked time only', () => {
  const url = extraMapUrl({ layer: EXTRA_LAYERS.cloud, bbox: [-110, 48, -101, 53], width: 800, height: 600, time: new Date('2026-09-30T08:50:00Z') });
  assert.match(url, /^https:\/\/geo\.weather\.gc\.ca\/geomet\?service=WMS&version=1\.3\.0&request=GetMap&layers=GOES-West_1km_DayVis-NightIR&styles=&crs=EPSG:3857&bbox=/);
  assert.match(url, /&width=800&height=600&format=image\/png&transparent=true&time=2026-09-30T08:50:00Z$/);
  assert.match(extraMapUrl({ layer: EXTRA_LAYERS.warnings, bbox: [-110, 48, -101, 53], width: 800, height: 600 }), /layers=Current-Alerts/);
  assert.doesNotMatch(extraMapUrl({ layer: EXTRA_LAYERS.warnings, bbox: [-110, 48, -101, 53], width: 800, height: 600 }), /time=/);
});

test('extraMapUrl refuses a layer off the list, a bad box or size, or a time that is not a real Date', () => {
  const ok = { layer: EXTRA_LAYERS.cloud, bbox: [-110, 48, -101, 53], width: 800, height: 600 };
  for (const bad of [
    { layer: 'RADAR_1KM_RRAI' }, { layer: 'x&y=1' }, { bbox: [-110, 48, -101] }, { bbox: [-110, 48, -101, NaN] }, { bbox: [-101, 48, -110, 53] },
    { bbox: [-190, 48, -101, 53] }, { bbox: [-110, 48, -101, 89] }, { width: 8 }, { width: 3000 }, { width: 800.5 }, { height: '600' },
    { time: '2026-09-30T08:50:00Z' }, { time: new Date('nope') },
  ]) assert.throws(() => extraMapUrl({ ...ok, ...bad }), RangeError, JSON.stringify(bad));
});

// ---- A layer's time ---------------------------------------------------------------------------

test('a layer time comes from feeds.js for the radar and from the layer\'s own default for the cloud picture', () => {
  assert.deepEqual(layerTimeOf(caps('RADAR_1KM_RRAI'), LAYERS.radarRain), RADAR_TIME);
  assert.deepEqual(layerTimeOf(GOES, EXTRA_LAYERS.cloud), new Date('2026-09-30T08:50:00Z'));
});

test('a hostile capabilities reply gives no time: wrong layer, a default that is not exact ISO seconds, no time, or too big', () => {
  assert.equal(layerTimeOf(GOES, EXTRA_LAYERS.warnings), null, 'about another layer');
  assert.equal(layerTimeOf(GOES.replace('default="2026-09-30T08:50:00Z"', 'default="2026-09-30 08:50"'), EXTRA_LAYERS.cloud), null);
  assert.equal(layerTimeOf(GOES.replace('default="2026-09-30T08:50:00Z"', 'default="2026-02-31T08:50:00Z"'), EXTRA_LAYERS.cloud), null, 'not a real day');
  assert.equal(layerTimeOf(GOES.replace('name="time"', 'name="elevation"'), EXTRA_LAYERS.cloud), null);
  assert.equal(layerTimeOf(GOES + ' '.repeat(300_000), EXTRA_LAYERS.cloud), null);
  assert.equal(layerTimeOf(undefined, EXTRA_LAYERS.cloud), null);
  assert.equal(layerTimeOf('<html>', LAYERS.radarRain), null);
});

// ---- The feed's own words ------------------------------------------------------------------------

const line = (over) => feedLine({ label: 'Radar', kind: 'radar', hasImage: true, layerTime: RADAR_TIME, now: new Date(+RADAR_TIME + 4 * MIN), ...over });

test('a fresh feed shows its own layer time and its age, with a symbol as well as words', () => {
  assert.deepEqual(line(), { text: 'Radar 0712Z (4 min ago)', symbol: '✓', tone: 'ok', stale: false });
});

test('radar is stale after 20 minutes and lightning after 30, said in words', () => {
  const at = (min) => new Date(+RADAR_TIME + min * MIN);
  assert.equal(line({ now: at(20) }).stale, false);
  assert.equal(line({ now: at(21) }).text, 'Radar STALE 0712Z (21 min ago)');
  assert.equal(line({ now: at(21) }).symbol, '⚠');
  assert.equal(line({ kind: 'lightning', label: 'Lightning', now: at(29) }).stale, false);
  assert.equal(line({ kind: 'lightning', label: 'Lightning', now: at(31) }).text, 'Lightning STALE 0712Z (31 min ago)');
});

test('failed says what is still on screen and how old it is, or that there is nothing', () => {
  assert.equal(line({ failed: true, now: new Date(+RADAR_TIME + 12 * MIN) }).text, 'Radar failed, showing 12 min old');
  assert.equal(line({ failed: true, hasImage: false, layerTime: null }).text, 'Radar failed, nothing to show');
  assert.equal(line({ failed: true }).tone, 'bad');
});

test('loading, refreshing, off, the backup and an unknown time each have their own words', () => {
  assert.equal(line({ hasImage: false, layerTime: null }).text, 'Radar loading…');
  assert.equal(line({ busy: true }).text, 'Radar 0712Z (4 min ago), refreshing…');
  assert.equal(line({ on: false }).text, 'Radar off');
  assert.equal(line({ backup: true }).text, 'Radar (RainViewer backup) 0712Z (4 min ago)');
  assert.equal(line({ layerTime: new Date(+RADAR_TIME + 60 * MIN) }).text, 'Radar time unknown', 'a time from the future is never shown as fresh');
});

// ---- One picture feed ------------------------------------------------------------------------------

function radar(over = {}) {
  const clock = virtualClock('2026-09-30T07:15:00Z');
  const served = { eccc: 'ok', rv: 'ok', paused: false, ...over.served };
  const f = fakeFetch((url) => {
    if (new URL(url).host === 'api.rainviewer.com') return served.rv === 'ok' ? json(fixture('rainviewer-weather-maps.json')) : fail();
    if (served.eccc === 'down') return fail();
    if (url.includes('request=GetCapabilities')) return text(caps(url.includes('RSNO') ? 'RADAR_1KM_RSNO' : 'RADAR_1KM_RRAI'));
    return png(url);
  });
  const changes = [];
  const closed = [];
  const feed = createRadarFeed({
    precip: () => served.precip ?? 'rain',
    decode: async (bytes) => ({ bytes: bytes.length, close: () => closed.push(1) }),
    paused: () => served.paused,
    fetch: f,
    timers: clock.timers,
    now: clock.now,
    onChange: () => changes.push(clock.now().toISOString()),
  });
  return { clock, f, feed, served, changes, closed };
}

test('radar asks for the layer time first, then the picture for that time, and shows the radar\'s own time', async () => {
  const { clock, f, feed } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  assert.equal(f.requests.length, 2);
  assert.match(f.requests[0].url, /request=GetCapabilities&layer=RADAR_1KM_RRAI$/);
  assert.match(f.requests[1].url, /request=GetMap&layers=RADAR_1KM_RRAI.*&time=2026-09-30T07:12:00Z$/);
  const s = feed.state();
  assert.equal(s.source, 'eccc');
  assert.ok(s.image);
  assert.deepEqual(s.layerTime, RADAR_TIME);
  // The age is the radar's, 3 minutes, not the time since the fetch (nothing).
  assert.equal(feed.line().text, 'Radar 0712Z (3 min ago)');
  // Six minutes on, the next round has fetched a picture, but the radar's own time is what shows.
  await clock.advance(6 * MIN + 1000);
  assert.deepEqual(feed.state().layerTime, RADAR_TIME);
  assert.equal(feed.line().text, 'Radar 0712Z (9 min ago)');
  feed.stop();
});

test('every request omits cookies, and none is made until the layer is switched on', async () => {
  const { clock, f, feed } = radar();
  feed.setRequest(REQUEST);
  await clock.advance(10 * MIN);
  assert.equal(f.requests.length, 0);
  feed.enable(true);
  await clock.settle();
  assert.ok(f.requests.length > 0);
  for (const r of f.requests) assert.equal(r.init.credentials, 'omit');
  feed.stop();
});

test('radar is asked for again every 6 minutes, and not before', async () => {
  const { clock, f, feed } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  const first = f.requests.length;
  await clock.advance(5 * MIN + 50_000);
  assert.equal(f.requests.length, first);
  await clock.advance(20_000);
  assert.equal(f.requests.length, first + 2, 'the time and the picture');
  feed.stop();
});

test('a picture past 20 minutes old says STALE in words', async () => {
  const { clock, feed } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  assert.equal(feed.line(new Date('2026-09-30T07:32:00Z')).stale, false);
  assert.equal(feed.line(new Date('2026-09-30T07:33:00Z')).text, 'Radar STALE 0712Z (21 min ago)');
  feed.stop();
});

test('a moved view asks for a new picture only, after it holds still; the same view asks for nothing', async () => {
  const { clock, f, feed } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  const before = f.requests.length;
  feed.setRequest({ ...REQUEST });
  await clock.advance(2 * VIEW_SETTLE_MS);
  assert.equal(f.requests.length, before, 'same key, no request');
  feed.setRequest({ ...REQUEST, key: 'b', bbox: [-109, 48, -100, 52] });
  feed.setRequest({ ...REQUEST, key: 'c', bbox: [-108, 48, -99, 52] });
  await clock.advance(VIEW_SETTLE_MS - 50);
  assert.equal(f.requests.length, before, 'still settling');
  await clock.advance(100);
  assert.equal(f.requests.length, before + 1, 'one picture, no second capabilities request');
  assert.match(f.requests.at(-1).url, /request=GetMap/);
  assert.match(f.requests.at(-1).url, /time=2026-09-30T07:12:00Z/);
  feed.stop();
});

test('a paused (hidden) tab asks for nothing and looks again later; wake asks at once when due', async () => {
  const { clock, f, feed, served } = radar({ served: { paused: true } });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.advance(13 * MIN);
  assert.equal(f.requests.length, 0);
  served.paused = false;
  feed.wake();
  await clock.settle();
  assert.equal(f.requests.length, 2);
  feed.stop();
});

test('switching the layer off stops asking and lets go of the picture', async () => {
  const { clock, f, feed, closed } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  feed.enable(false);
  assert.equal(closed.length, 1, 'the bitmap was closed');
  assert.equal(feed.state().image, null);
  const before = f.requests.length;
  await clock.advance(20 * MIN);
  assert.equal(f.requests.length, before);
  assert.equal(clock.pending, 0, 'no timer left');
  assert.equal(feed.line().text, 'Radar off');
});

test('rain or snow is a different layer, and choosing one asks for it again', async () => {
  const { clock, f, feed, served } = radar();
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  served.precip = 'snow';
  feed.setPrecip();
  await clock.settle();
  assert.match(f.requests.at(-2).url, /layer=RADAR_1KM_RSNO$/);
  assert.match(f.requests.at(-1).url, /layers=RADAR_1KM_RSNO/);
  feed.stop();
});

test('a reply that is not a picture (a WMS error in a 200) is a failure', async () => {
  const clock = virtualClock();
  const f = fakeFetch((url) => (url.includes('GetCapabilities') ? text(caps('RADAR_1KM_RRAI')) : text('<ServiceExceptionReport/>', 'text/xml')));
  const feed = createRadarFeed({ decode: async () => ({}), fetch: f, timers: clock.timers, now: clock.now });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  assert.equal(feed.state().image, null);
  assert.equal(feed.state().failures, 1);
  assert.equal(feed.line().text, 'Radar failed, nothing to show');
  feed.stop();
});

test('a picture that will not decode is a failure and the old picture stays', async () => {
  const clock = virtualClock();
  let bad = false;
  const f = fakeFetch((url) => (url.includes('GetCapabilities') ? text(caps('RADAR_1KM_RRAI')) : png(url)));
  const feed = createRadarFeed({ decode: async () => (bad ? null : { ok: 1 }), fetch: f, timers: clock.timers, now: clock.now });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  bad = true;
  await clock.advance(6 * MIN + 1000);
  assert.ok(feed.state().image, 'the last good picture is kept');
  assert.equal(feed.state().failures, 1);
  assert.match(feed.line(new Date('2026-09-30T07:40:00Z')).text, /^Radar failed, showing 28 min old$/);
  feed.stop();
});

// ---- ECCC, then RainViewer, then back ------------------------------------------------------------------

test('after two ECCC failures in a row the radar switches to RainViewer, and its frame time is the radar\'s time', async () => {
  const { clock, f, feed, served } = radar({ served: { eccc: 'down' } });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  assert.equal(feed.state().source, 'eccc', 'one failure is not enough');
  assert.equal(feed.state().failures, 1);
  assert.equal(f.requests.some((r) => r.url.startsWith(RAINVIEWER_LIST_URL)), false);
  await clock.advance(RETRY_MS + 1000);
  const s = feed.state();
  assert.equal(s.source, 'rainviewer');
  assert.ok(s.frame.path.startsWith('/v2/radar/'));
  assert.equal(+s.layerTime, +s.frame.time);
  assert.ok(f.requests.some((r) => r.url === RAINVIEWER_LIST_URL));
  assert.match(feed.line(new Date(+s.frame.time + 4 * MIN)).text, /^Radar \(RainViewer backup\) \d{4}Z \(4 min ago\)$/);
  assert.equal(served.rv, 'ok');
  feed.stop();
});

test('while on RainViewer ECCC is still asked on the usual 6 minutes, and the first answer switches back', async () => {
  const { clock, f, feed, served } = radar({ served: { eccc: 'down' } });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.advance(RETRY_MS + 1000);
  assert.equal(feed.state().source, 'rainviewer');
  served.eccc = 'ok';
  const asked = f.requests.length;
  await clock.advance(6 * MIN);
  assert.ok(f.requests.length > asked, 'ECCC was asked again');
  const s = feed.state();
  assert.equal(s.source, 'eccc');
  assert.equal(s.frame, null);
  assert.ok(s.image);
  assert.equal(feed.line().text.startsWith('Radar 0712Z'), true);
  feed.stop();
});

test('with ECCC and RainViewer both failing the words say so, and there is nothing to draw', async () => {
  const { clock, feed } = radar({ served: { eccc: 'down', rv: 'down' } });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.advance(RETRY_MS + 1000);
  const s = feed.state();
  assert.equal(s.source, 'rainviewer');
  assert.equal(s.frame, null);
  assert.equal(s.failed, true);
  assert.equal(feed.line().text, 'Radar (RainViewer backup) failed, nothing to show');
  feed.stop();
});

test('RainViewer\'s list is read with a size cap and shape check; a hostile list gives no frame', async () => {
  const clock = virtualClock();
  const f = fakeFetch((url) => (new URL(url).host === 'api.rainviewer.com' ? json({ radar: { past: [{ time: 1, path: '/../../evil' }] } }) : fail()));
  const feed = createRadarFeed({ decode: async () => ({}), fetch: f, timers: clock.timers, now: clock.now });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.advance(RETRY_MS + 1000);
  assert.equal(feed.state().source, 'rainviewer');
  assert.equal(feed.state().frame, null);
  feed.stop();
});

test('a request still out when the module closes is aborted, and nothing is left running (R4)', async () => {
  const clock = virtualClock();
  const seen = [];
  const f = fakeFetch((url, init) => new Promise((resolve, reject) => {
    seen.push(init.signal);
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const feed = createRadarFeed({ decode: async () => ({}), fetch: f, timers: clock.timers, now: clock.now });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.settle();
  assert.equal(seen.length, 1);
  assert.equal(clock.pending, 1, 'the timeout is a timer on the scope');
  feed.stop();
  await clock.settle();
  assert.equal(seen[0].aborted, true);
  assert.equal(clock.pending, 0);
  const asked = f.requests.length;
  await clock.advance(30 * MIN);
  assert.equal(f.requests.length, asked, 'nothing asks after stop');
});

test('a request that never answers is given up on at the timeout and counted as a failure', async () => {
  const clock = virtualClock();
  const f = fakeFetch((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const feed = createImageFeed({
    layer: LAYERS.radarRain, urlFor: () => 'https://x.test/', decode: async () => ({}), fetch: f, timers: clock.timers, now: clock.now,
  });
  feed.setRequest(REQUEST);
  feed.enable(true);
  await clock.advance(16_000);
  assert.equal(feed.state().failures, 1);
  assert.equal(feed.state().busy, false);
  feed.stop();
});

test('a feed with a request in flight when asked again asks once more afterwards, not in parallel', async () => {
  const clock = virtualClock();
  let open = 0;
  let most = 0;
  const f = fakeFetch(async (url) => {
    open += 1;
    most = Math.max(most, open);
    await new Promise((r) => setImmediate(r));
    open -= 1;
    return url.includes('GetCapabilities') ? text(caps('RADAR_1KM_RRAI')) : png(url);
  });
  const feed = createImageFeed({
    layer: LAYERS.radarRain, urlFor: () => 'https://x.test/', decode: async () => ({}), fetch: f, timers: clock.timers, now: clock.now,
  });
  feed.setRequest(REQUEST);
  feed.enable(true);
  feed.refresh();
  feed.refresh();
  await clock.settle();
  assert.equal(most, 1);
  feed.stop();
});

// ---- A picture that is not the picture asked for is a failure (R1) -------------------------------------------

for (const [name, reply] of [
  ['a bomb header', () => new Response(pngBytes(65535, 65535), { status: 200, headers: { 'content-type': 'image/png' } })],
  ['the wrong size', () => new Response(pngBytes(REQUEST.width - 1, REQUEST.height), { status: 200, headers: { 'content-type': 'image/png' } })],
  ['no IEND (cut off)', () => new Response(pngBytes(REQUEST.width, REQUEST.height, { iend: false }), { status: 200, headers: { 'content-type': 'image/png' } })],
]) {
  test(`a picture with ${name} is a failed try: it is never decoded and nothing is held`, async () => {
    const clock = virtualClock();
    let decoded = 0;
    const f = fakeFetch((url) => (url.includes('GetCapabilities') ? text(caps('RADAR_1KM_RRAI')) : reply()));
    const feed = createRadarFeed({ decode: async () => { decoded += 1; return { ok: 1 }; }, fetch: f, timers: clock.timers, now: clock.now });
    feed.setRequest(REQUEST);
    feed.enable(true);
    await clock.settle();
    assert.equal(decoded, 0);
    const s = feed.state();
    assert.equal(s.image, null);
    assert.ok(s.failures >= 1);
    assert.equal(feed.line().text, 'Radar failed, nothing to show');
    feed.stop();
  });
}
