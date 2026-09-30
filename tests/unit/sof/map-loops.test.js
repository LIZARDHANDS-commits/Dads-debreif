// Tests for src/modules/sof/map-loops.js: the near-home lightning reading (a fixed box, decoded
// into lightning.js's samples, null when the picture fails) and the traffic layer's loop (request
// number passed back, 30 s timeout, size cap, no cookies, ends when off or on unmount).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightningBox } from '../../../src/modules/sof/map-lightning.js';
import { trafficUrl } from '../../../src/modules/sof/traffic.js';
import { createLightningWatch, createTrafficFeed } from '../../../src/modules/sof/map-loops.js';
import { virtualClock, fakeFetch, text, png, json, fail, fixture } from './map-testkit.js';

const MIN = 60_000;
const HOME = { icao: 'CYMJ', lat: 50.3303, lon: -105.559 };

// ---- Lightning near home ------------------------------------------------------------------------

function watch({ lit = [], radius = 20, picture = 'ok' } = {}) {
  const clock = virtualClock('2026-09-30T07:05:00Z'); // the fixture's layer time is 0700Z
  const state = { lit, radius, picture };
  const f = fakeFetch((url) => {
    if (state.picture === 'down') return fail();
    return url.includes('GetCapabilities') ? text(fixture('geomet-caps-Lightning_2.5km_Density.xml')) : png();
  });
  const changes = [];
  const w = createLightningWatch({
    home: () => HOME,
    radiusNm: () => state.radius,
    readPixels: async () => {
      const box = lightningBox({ home: HOME, radiusNm: state.radius });
      const data = new Uint8ClampedArray(box.width * box.height * 4);
      for (const [x, y] of state.lit) data[(y * box.width + x) * 4 + 3] = 255;
      return { data, width: box.width, height: box.height };
    },
    fetch: f,
    timers: clock.timers,
    now: clock.now,
    onChange: () => changes.push(1),
  });
  return { clock, f, w, state, changes };
}

const pixelEast = (nm, radius = 20) => {
  const box = lightningBox({ home: HOME, radiusNm: radius });
  const lon = HOME.lon + nm / 60 / Math.cos((HOME.lat * Math.PI) / 180);
  const { west, east, south, north } = box.bounds;
  return [Math.floor(((lon - west) / (east - west)) * box.width), Math.floor(((north - HOME.lat) / (north - south)) * box.height)];
};

test('the lightning reading asks for a fixed box around home in latitude and longitude, at 2.5 km, not the map view', async () => {
  const { clock, f, w } = watch();
  w.start();
  await clock.settle();
  assert.match(f.requests[0].url, /request=GetCapabilities&layer=Lightning_2\.5km_Density$/);
  const map = f.requests[1].url;
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  assert.match(map, /layers=Lightning_2\.5km_Density/);
  assert.match(map, /crs=EPSG:4326/);
  assert.match(map, new RegExp(`width=${box.width}&height=${box.height}`));
  assert.match(map, /time=2026-09-30T07:00:00Z/);
  for (const r of f.requests) assert.equal(r.init.credentials, 'omit');
  w.stop();
});

test('lightning inside the radius in the picture is a near-home caution; the layer time is the picture\'s own', async () => {
  const { clock, w } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const r = w.result();
  assert.equal(r.state, 'near');
  assert.equal(r.caution.source, 'LIGHTNING');
  assert.equal(r.caution.icao, 'CYMJ');
  assert.equal(r.ageMin, 5);
  assert.equal(w.line().text, 'Lightning 0700Z (5 min ago)');
  w.stop();
});

test('an empty picture that covered home plus the radius is clear', async () => {
  const { clock, w } = watch();
  w.start();
  await clock.settle();
  const r = w.result();
  assert.equal(r.state, 'clear');
  assert.equal(r.caution, null);
  w.stop();
});

test('before anything has been read, and after a failed picture, the answer is "can\'t tell", never clear', async () => {
  const { clock, w, state } = watch({ picture: 'down' });
  assert.equal(w.result().state, 'unknown');
  w.start();
  await clock.settle();
  const r = w.result();
  assert.equal(r.state, 'unknown');
  assert.match(r.words, /^Can't tell: no lightning data/);
  assert.equal(r.caution, null);
  assert.equal(w.line().text, 'Lightning failed, nothing to show');
  // It recovers on the next good round.
  state.picture = 'ok';
  await clock.advance(10 * MIN + 1000);
  assert.equal(w.result().state, 'clear');
  w.stop();
});

test('a failed round after a good one is "can\'t tell" until the next good one, and an open episode is kept', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result();
  assert.equal(first.state, 'near');
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000);
  const during = w.result();
  assert.equal(during.state, 'unknown');
  assert.equal(during.near, null);
  state.picture = 'ok';
  await clock.advance(10 * MIN);
  const after = w.result();
  assert.equal(after.state, 'near');
  assert.equal(after.caution.key, first.caution.key, 'the same lightning is the same caution');
  w.stop();
});
test('a bigger radius makes a bigger box and reads it again, and the check uses that radius', async () => {
  const { clock, f, w, state } = watch({ radius: 20 });
  w.start();
  await clock.settle();
  assert.equal(w.result().radiusNm, 20);
  state.radius = 50;
  state.lit = [pixelEast(40, 50)];
  w.setPlace();
  await clock.advance(1000);
  const map = f.requests.at(-1).url;
  const box = lightningBox({ home: HOME, radiusNm: 50 });
  assert.match(map, new RegExp(`width=${box.width}&height=${box.height}`));
  const r = w.result();
  assert.equal(r.radiusNm, 50);
  assert.equal(r.state, 'near', 'lightning 40 NM out is inside a 50 NM radius');
  w.stop();
});

test('the reading is asked for again every 10 minutes and leaves nothing running after stop (R4)', async () => {
  const { clock, f, w } = watch();
  w.start();
  await clock.settle();
  const first = f.requests.length;
  await clock.advance(9 * MIN);
  assert.equal(f.requests.length, first);
  await clock.advance(2 * MIN);
  assert.equal(f.requests.length, first + 2);
  w.stop();
  assert.equal(clock.pending, 0);
  await clock.advance(60 * MIN);
  assert.equal(f.requests.length, first + 2);
});

// ---- Traffic ---------------------------------------------------------------------------------------

const RELAY = 'https://relay.example.test';
const REPLY = fixture('traffic-relay-reply.json');
const REPLY_NOW = new Date(JSON.parse(REPLY).now);

function traffic({ relay = RELAY, serve } = {}) {
  const clock = virtualClock(REPLY_NOW.toISOString());
  const state = { relay, mode: 'ok', options: {}, ...serve };
  const f = fakeFetch((url, init) => {
    if (state.mode === 'down') return fail();
    if (state.mode === 'hostile') return json('{"aircraft": "no"}');
    if (state.mode === 'hang') return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return json(REPLY);
  });
  const changes = [];
  const feed = createTrafficFeed({
    address: () => trafficUrl({ baseUrl: state.relay, lat: HOME.lat, lon: HOME.lon }),
    options: () => state.options,
    fetch: f,
    timers: clock.timers,
    now: clock.now,
    onChange: () => changes.push(1),
  });
  return { clock, f, feed, state, changes };
}

test('while off nothing is asked and nothing is running', async () => {
  const { clock, f, feed } = traffic();
  await clock.advance(5 * MIN);
  assert.equal(f.requests.length, 0);
  assert.equal(clock.pending, 0);
  assert.equal(feed.view().status, 'off');
});

test('with no relay address set the layer never asks', async () => {
  const { clock, f, feed } = traffic({ relay: '' });
  feed.setOn(true);
  await clock.advance(60_000);
  assert.equal(f.requests.length, 0);
  feed.stop();
});

test('on, it asks the relay at once from numbers only, and shows the aircraft', async () => {
  const { clock, f, feed } = traffic();
  feed.setOn(true);
  await clock.settle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://relay.example.test/traffic?lat=50.33&lon=-105.56&nm=100');
  assert.equal(f.requests[0].init.credentials, 'omit');
  const v = feed.view();
  assert.equal(v.status, 'ok');
  assert.ok(v.count > 0);
  assert.match(v.statusText, /^Traffic: \d+ aircraft, /);
  feed.stop();
});

test('it asks again every 10 seconds, no faster', async () => {
  const { clock, f, feed } = traffic();
  feed.setOn(true);
  await clock.settle();
  await clock.advance(9_000);
  assert.equal(f.requests.length, 1);
  await clock.advance(2_000);
  assert.equal(f.requests.length, 2);
  await clock.advance(30_000);
  assert.equal(f.requests.length, 5);
  feed.stop();
});

test('the request\'s number goes back with the answer: a reply to an old request is ignored after off and on again', async () => {
  const clock = virtualClock(REPLY_NOW.toISOString());
  const releases = [];
  const f = fakeFetch(() => new Promise((resolve) => releases.push(() => resolve(json(REPLY)))));
  const feed = createTrafficFeed({ address: () => trafficUrl({ baseUrl: RELAY }), fetch: f, timers: clock.timers, now: clock.now });
  feed.setOn(true);
  await clock.settle();
  const firstId = feed.state().pendingId;
  feed.setOn(false);
  feed.setOn(true);
  await clock.settle();
  const secondId = feed.state().pendingId;
  assert.notEqual(firstId, secondId, 'a new request has a new number');
  releases[0](); // the old one answers late
  await clock.settle();
  assert.equal(feed.state().lastGood, null, 'a late answer is not taken');
  releases[1]();
  await clock.settle();
  assert.ok(feed.state().lastGood);
  feed.stop();
});

test('a failed request says "Traffic unavailable" with the last good time, and asks again in 10 s', async () => {
  const { clock, f, feed, state } = traffic();
  feed.setOn(true);
  await clock.settle();
  state.mode = 'down';
  await clock.advance(11_000);
  const v = feed.view();
  assert.equal(v.status, 'unavailable');
  assert.match(v.statusText, /^Traffic unavailable, last good \d{4}Z$/);
  const asked = f.requests.length;
  await clock.advance(10_000);
  assert.equal(f.requests.length, asked + 1);
  state.mode = 'ok';
  await clock.advance(11_000);
  assert.equal(feed.view().status, 'ok');
  feed.stop();
});

test('a hostile reply (wrong shape) counts as a failure and draws nothing', async () => {
  const { clock, feed, state } = traffic({ serve: { mode: 'hostile' } });
  feed.setOn(true);
  await clock.settle();
  const v = feed.view();
  assert.equal(v.status, 'unavailable');
  assert.equal(v.count, 0);
  assert.equal(state.mode, 'hostile');
  feed.stop();
});

test('a reply over the size cap is a failure', async () => {
  const clock = virtualClock(REPLY_NOW.toISOString());
  const f = fakeFetch(() => new Response('x'.repeat(1_400_000), { status: 200 }));
  const feed = createTrafficFeed({ address: () => trafficUrl({ baseUrl: RELAY }), fetch: f, timers: clock.timers, now: clock.now });
  feed.setOn(true);
  await clock.settle();
  assert.equal(feed.view().status, 'unavailable');
  feed.stop();
});

test('a request that hangs is given up on at 30 seconds', async () => {
  const { clock, feed } = traffic({ serve: { mode: 'hang' } });
  feed.setOn(true);
  await clock.advance(29_000);
  assert.equal(feed.view().status, 'loading');
  await clock.advance(2_000);
  assert.equal(feed.view().status, 'unavailable');
  feed.stop();
});

test('switching off ends the poll and aborts a request in flight, and forgets the aircraft', async () => {
  const { clock, f, feed, state } = traffic();
  feed.setOn(true);
  await clock.settle();
  state.mode = 'hang';
  await clock.advance(11_000);
  const signal = f.requests.at(-1).init.signal;
  assert.equal(signal.aborted, false);
  feed.setOn(false);
  assert.equal(signal.aborted, true);
  await clock.settle();
  assert.equal(clock.pending, 0);
  const asked = f.requests.length;
  await clock.advance(60_000);
  assert.equal(f.requests.length, asked);
  assert.equal(feed.view().status, 'off');
  assert.equal(feed.view().count, 0);
});

test('closing the module (stop) leaves no timer and no request, and never calls back again', async () => {
  const { clock, f, feed, state, changes } = traffic();
  feed.setOn(true);
  await clock.settle();
  state.mode = 'hang';
  await clock.advance(11_000);
  const signal = f.requests.at(-1).init.signal;
  feed.stop();
  await clock.settle();
  assert.equal(signal.aborted, true);
  assert.equal(clock.pending, 0);
  const seen = changes.length;
  await clock.advance(120_000);
  assert.equal(changes.length, seen);
});

test('the label and military-only choices reach the view', async () => {
  const { clock, feed, state } = traffic();
  feed.setOn(true);
  await clock.settle();
  const plain = feed.view();
  assert.ok(plain.aircraft.every((a) => a.label === ''));
  state.options = { label: 'callsign' };
  feed.touch();
  assert.ok(feed.view().aircraft.some((a) => a.label !== ''));
  state.options = { militaryOnly: true };
  feed.touch();
  assert.ok(feed.view().aircraft.every((a) => a.mil));
  feed.stop();
});

test('with the relay quiet, positions fade second by second and are gone after a minute, not frozen', async () => {
  const { clock, feed, state, changes } = traffic();
  feed.setOn(true);
  await clock.settle();
  const fresh = feed.view();
  assert.ok(fresh.aircraft.every((a) => a.opacity === 1));
  state.mode = 'hang';
  const before = changes.length;
  await clock.advance(35_000);
  assert.ok(changes.length > before, 'it asks for a redraw as the fade goes on');
  assert.ok(feed.view().aircraft.every((a) => a.opacity < 1));
  await clock.advance(40_000);
  assert.equal(feed.view().count, 0);
  feed.stop();
});
