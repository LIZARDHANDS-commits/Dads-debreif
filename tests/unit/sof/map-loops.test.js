// Tests for src/modules/sof/map-loops.js: the near-home lightning reading (a fixed box, decoded
// into lightning.js's samples, null when the picture fails) and the traffic layer's loop (request
// number passed back, 30 s timeout, size cap, no cookies, ends when off or on unmount).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightningBox } from '../../../src/modules/sof/map-lightning.js';
import { trafficUrl } from '../../../src/modules/sof/traffic.js';
import { createLightningWatch, createTrafficFeed } from '../../../src/modules/sof/map-loops.js';
import { evaluate } from '../../../src/modules/sof/cautions.js';
import { virtualClock, fakeFetch, text, png, pngBytes, json, fail, fixture } from './map-testkit.js';

const MIN = 60_000;
const HOME = { icao: 'CYMJ', lat: 50.3303, lon: -105.559 };

// ---- Lightning near home ------------------------------------------------------------------------

function watch({ lit = [], radius = 20, picture = 'ok' } = {}) {
  const clock = virtualClock('2026-09-30T07:05:00Z'); // the fixture's layer time is 0700Z
  const state = { lit, radius, picture, layerTime: null, home: null };
  const f = fakeFetch((url) => {
    if (state.picture === 'down') return fail();
    // `state.layerTime` (an ISO time) moves the layer's own time, which the fixture fixes at 0700Z.
    const caps = () => fixture('geomet-caps-Lightning_2.5km_Density.xml').replaceAll('2026-09-30T07:00:00Z', state.layerTime ?? '2026-09-30T07:00:00Z');
    return url.includes('GetCapabilities') ? text(caps()) : png(url);
  });
  const changes = [];
  const w = createLightningWatch({
    home: () => state.home ?? HOME,
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
  assert.equal(r.caution?.text, "Lightning: can't tell", 'F1: with no earlier good reading the banner gets a plain can\'t-tell line');
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

// ---- A cut-off or wrong picture is "can't tell", never a clear sky (R1) -------------------------------------

test('a truncated picture (transparent rows where the rest should be) makes the lightning check say it cannot tell', async () => {
  const clock = virtualClock('2026-09-30T07:05:00Z');
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  for (const body of [pngBytes(box.width, box.height, { iend: false }), pngBytes(box.width, box.height - 1), pngBytes(65535, 65535)]) {
    let decoded = 0;
    const f = fakeFetch((url) => (url.includes('GetCapabilities')
      ? text(fixture('geomet-caps-Lightning_2.5km_Density.xml'))
      : new Response(body, { status: 200, headers: { 'content-type': 'image/png' } })));
    const w = createLightningWatch({
      home: () => HOME,
      radiusNm: () => 20,
      readPixels: async () => { decoded += 1; return { data: new Uint8ClampedArray(box.width * box.height * 4), width: box.width, height: box.height }; },
      fetch: f, timers: clock.timers, now: clock.now,
    });
    w.start();
    await clock.settle();
    assert.equal(decoded, 0, 'never decoded');
    assert.equal(w.result().state, 'unknown');
    w.stop();
  }
});

// ---- The picture is read against the box it was asked for (Y2) ------------------------------------------------

test('home changes while a picture is on its way: the old picture is never read as a clear sky at the new home', async () => {
  const clock = virtualClock('2026-09-30T07:05:00Z');
  const home = { ...HOME };
  const oldBox = lightningBox({ home: HOME, radiusNm: 20 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const asked = [];
  const f = fakeFetch(async (url) => {
    if (url.includes('GetCapabilities')) return text(fixture('geomet-caps-Lightning_2.5km_Density.xml'));
    asked.push(url);
    if (asked.length === 1) await gate; // the first picture, for the old home, is slow
    return png(url);
  });
  const w = createLightningWatch({
    home: () => home,
    radiusNm: () => 20,
    // whatever is asked for, the pixels are an empty (all clear) picture of the size of the box the fetch was made for
    readPixels: async () => ({ data: new Uint8ClampedArray(oldBox.width * oldBox.height * 4), width: oldBox.width, height: oldBox.height }),
    fetch: f, timers: clock.timers, now: clock.now,
  });
  w.start();
  await clock.settle();
  assert.equal(asked.length, 1);
  // Home moves 200 NM north while that picture is out, and the same-sized box is asked for there.
  home.lat += 200 / 60;
  w.setPlace();
  release();
  await clock.settle();
  const r = w.result();
  assert.notEqual(r.state, 'clear', 'the old area was empty, that says nothing about the new home');
  assert.equal(r.state, 'unknown');
  // Once the picture for the new place arrives it is read against its own box.
  await clock.advance(2000);
  assert.equal(asked.length >= 2, true);
  w.stop();
});

test('the picture is decoded against the box that was asked for, which is passed to the decoder', async () => {
  const clock = virtualClock('2026-09-30T07:05:00Z');
  const seen = [];
  const f = fakeFetch((url) => (url.includes('GetCapabilities') ? text(fixture('geomet-caps-Lightning_2.5km_Density.xml')) : png(url)));
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const w = createLightningWatch({
    home: () => HOME,
    radiusNm: () => 20,
    readPixels: async () => { seen.push(1); return { data: new Uint8ClampedArray(box.width * box.height * 4), width: box.width, height: box.height }; },
    fetch: f, timers: clock.timers, now: clock.now,
  });
  w.start();
  await clock.settle();
  assert.deepEqual(w.state().image.coverage.bounds, box.bounds);
  w.stop();
});

// ---- A new relay address starts the layer over (Y3) ---------------------------------------------------------

test('switching the layer off and on for a new relay address drops the old aircraft and the request still out, and asks the new address', async () => {
  const { clock, f, feed, state } = traffic({ serve: { mode: 'hang' } });
  feed.setOn(true);
  await clock.settle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url.startsWith('https://relay.example.test/'), true);
  // The address changes while that request is out: the map turns the layer off and on again.
  state.relay = 'https://other.example.test';
  state.mode = 'ok';
  feed.setOn(false);
  await clock.settle();
  assert.equal(f.requests[0].init.signal.aborted, true, 'the old request is cancelled');
  assert.equal(feed.view().status, 'off');
  feed.setOn(true);
  await clock.settle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url.startsWith('https://other.example.test/traffic?'), true);
  assert.ok(feed.view().count > 0);
  // Changing the address again: the aircraft from the old one are gone at once, before the new one answers.
  state.relay = 'https://third.example.test';
  state.mode = 'hang';
  feed.setOn(false);
  feed.setOn(true);
  await clock.settle();
  assert.equal(feed.view().count, 0, 'no aircraft from the old relay');
  assert.equal(f.requests.at(-1).url.startsWith('https://third.example.test/'), true);
  feed.stop();
});

// ---- Whatever goes wrong reading the picture, the answer is "can't tell" (Y4) --------------------------------

function watchWith({ readPixels, at = '2026-09-30T07:05:00Z' }) {
  const clock = virtualClock(at);
  const f = fakeFetch((url) => (url.includes('GetCapabilities') ? text(fixture('geomet-caps-Lightning_2.5km_Density.xml')) : png(url)));
  const w = createLightningWatch({ home: () => HOME, radiusNm: () => 20, readPixels, fetch: f, timers: clock.timers, now: clock.now });
  return { clock, w };
}

test('when the canvas cannot be read (a SecurityError from getImageData) the check says it cannot tell, and shows the failure in words', async () => {
  const { clock, w } = watchWith({
    readPixels: async () => { throw new DOMException('The canvas has been tainted by cross-origin data.', 'SecurityError'); },
  });
  w.start();
  await clock.settle();
  const r = w.result();
  assert.equal(r.state, 'unknown');
  assert.equal(w.line().text, 'Lightning failed, nothing to show');
  assert.equal(r.caution?.text, "Lightning: can't tell");
  w.stop();
});

test('when the picture is not the size that was asked for the check says it cannot tell', async () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  for (const [width, height] of [[box.width - 1, box.height], [box.width, box.height + 1], [1, 1]]) {
    const { clock, w } = watchWith({ readPixels: async () => ({ data: new Uint8ClampedArray(width * height * 4), width, height }) });
    w.start();
    await clock.settle();
    assert.equal(w.result().state, 'unknown', `${width} x ${height}`);
    assert.equal(w.state().image, null);
    w.stop();
  }
});

test('when the pixel data is short or missing the check says it cannot tell', async () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  for (const image of [{ data: new Uint8ClampedArray(10), width: box.width, height: box.height }, { width: box.width, height: box.height }, null]) {
    const { clock, w } = watchWith({ readPixels: async () => image });
    w.start();
    await clock.settle();
    assert.equal(w.result().state, 'unknown');
    w.stop();
  }
});

test('when the layer time is more than 40 minutes old the check says it cannot tell, even with a clean picture', async () => {
  const box = lightningBox({ home: HOME, radiusNm: 20 });
  const clean = async () => ({ data: new Uint8ClampedArray(box.width * box.height * 4), width: box.width, height: box.height });
  // the layer's time is 0700Z: at 0739 it is 39 minutes old (fine), at 0741 it is 41 (stale)
  const fresh = watchWith({ readPixels: clean, at: '2026-09-30T07:39:00Z' });
  fresh.w.start();
  await fresh.clock.settle();
  assert.equal(fresh.w.result().state, 'clear');
  fresh.w.stop();
  const old = watchWith({ readPixels: clean, at: '2026-09-30T07:41:00Z' });
  old.w.start();
  await old.clock.settle();
  const r = old.w.result();
  assert.equal(r.state, 'unknown');
  assert.match(r.words, /old|stale/i);
  assert.equal(r.caution?.text, "Lightning: can't tell", 'no earlier good reading: the plain can\'t-tell line, never a clear');
  old.w.stop();
});

// ---- F1 (sof-recheck-207, HIGH): a live near-home caution is never dropped by a bad or old reading -------------------

const banner = (r) => (r.caution ? [r.caution.text] : []);
// ECCC serving a picture 5 minutes behind the clock again (the fixture's layer time is fixed at 0700Z).
const followClock = (clock, state) => { state.layerTime = new Date(Math.floor(+clock.now() / MIN) * MIN - 5 * MIN).toISOString().replace('.000Z', 'Z'); };

test('F1: a caution is raised, the next refresh fails, and it is still on the banner, marked old, with the same key', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result();
  assert.equal(first.state, 'near');
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000); // the 10 minute round fails, and so does the 20 s retry
  const during = w.result();
  assert.equal(during.state, 'unknown', "the strip still says it can't tell");
  assert.equal(during.caution.key, first.caution.key, 'the same key, so an acknowledgement survives');
  assert.equal(during.caution.level, 'caution');
  assert.equal(during.caution.text, "Caution: CYMJ lightning: within 20 NM (can't tell now, last seen 15 min ago)");
  assert.equal(during.caution.reason, "Lightning within 20 NM (can't tell now, last seen 15 min ago)");
  assert.deepEqual(banner(during), ["Caution: CYMJ lightning: within 20 NM (can't tell now, last seen 15 min ago)"]);
  w.stop();
});

test('F1: an acknowledged caution stays acknowledged through a failed refresh (the key does not change)', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result().caution;
  const acks = { version: 1, day: '2026-09-30', keys: [first.key] };
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000);
  const held = w.result().caution;
  const built = evaluate({ extra: [held], acks, now: clock.now(), timeZone: 'America/Regina' });
  assert.equal(built.cautions.length, 1);
  assert.equal(built.cautions[0].acknowledged, true, 'still acknowledged');
  assert.equal(built.fresh.length, 0, 'nothing new to raise the banner again');
  w.stop();
});

test('F1: a stale picture (no failure, but the layer time is past the limit) keeps the caution too, and the age grows', async () => {
  const { clock, w } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result();
  // Nothing refreshes (the timers are not run); the clock alone carries the picture past 40 minutes.
  const later = new Date(+clock.now() + 41 * MIN);
  const r = w.result(later);
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution.key, first.caution.key);
  assert.equal(r.caution.text, "Caution: CYMJ lightning: within 20 NM (can't tell now, last seen 46 min ago)");
  const later2 = new Date(+later + 5 * MIN);
  assert.match(w.result(later2).caution.text, /last seen 51 min ago/);
  w.stop();
});

test('F1: a short outage keeps the caution\'s key, and a good near reading inside the episode gap is the same caution', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const key = w.result().caution.key;
  state.picture = 'down';
  for (let i = 0; i < 2; i++) {
    await clock.advance(10 * MIN);
    assert.equal(w.result().caution.key, key, `after ${(i + 1) * 10} min of outage`);
  }
  state.picture = 'ok';
  followClock(clock, state);
  await clock.advance(10 * MIN); // 30 minutes after the last real near reading: exactly the gap
  const back = w.result();
  assert.equal(back.state, 'near');
  assert.equal(back.caution.key, key);
  assert.doesNotMatch(back.caution.text, /can't tell/);
  w.stop();
});

test('R1: the held line keeps its key through a long outage, but a storm back after more than the episode gap is a new caution that re-raises', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result().caution;
  const acks = { version: 1, day: '2026-09-30', keys: [first.key] };
  state.picture = 'down';
  for (let i = 0; i < 8; i++) {
    await clock.advance(10 * MIN);
    assert.equal(w.result().caution.key, first.key, `the held line, after ${(i + 1) * 10} min of outage`);
  }
  state.picture = 'ok';
  followClock(clock, state);
  await clock.advance(10 * MIN); // 90 minutes after the last real near reading
  const back = w.result();
  assert.equal(back.state, 'near');
  assert.notEqual(back.caution.key, first.key, 'a storm after a long outage is a new episode');
  assert.doesNotMatch(back.caution.text, /can't tell/);
  // The old acknowledgement does not hide it: it is new and shows on the banner.
  const built = evaluate({ extra: [back.caution], acks, now: clock.now(), timeZone: 'America/Regina' });
  assert.equal(built.fresh.length, 1);
  w.stop();
});

test('F1: a good clear reading removes the held caution, and a new cell later is a new caution', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result().caution;
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000);
  assert.ok(w.result().caution);
  state.picture = 'ok';
  state.lit = [];
  followClock(clock, state);
  await clock.advance(10 * MIN);
  const clear = w.result();
  assert.equal(clear.state, 'clear');
  assert.equal(clear.caution, null, 'a good clear reading clears it');
  assert.deepEqual(banner(clear), []);
  // The same failure after a clear reading does not bring the old caution back.
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000);
  assert.equal(w.result().caution, null, 'nothing was live when it failed');
  state.picture = 'ok';
  state.lit = [pixelEast(12)];
  followClock(clock, state);
  await clock.advance(10 * MIN);
  const again = w.result();
  assert.equal(again.state, 'near');
  assert.notEqual(again.caution.key, first.key, 'lightning that comes back after a clear is a new caution');
  w.stop();
});

test("F1: with no earlier good reading, a failure gives a plain \"Lightning: can't tell\" line: not red, never clear, one key for the outage", async () => {
  const { clock, w, state } = watch({ picture: 'down' });
  assert.equal(w.result().caution, null, 'nothing has failed yet, and nothing has been read: no line while it is still loading');
  w.start();
  await clock.settle();
  const r = w.result();
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution.text, "Lightning: can't tell");
  assert.equal(r.caution.level, 'caution', 'amber, not the red "below limits" level');
  assert.equal(r.caution.source, 'LIGHTNING');
  assert.notEqual(r.state, 'clear');
  const key = r.caution.key;
  await clock.advance(30 * MIN);
  assert.equal(w.result().caution.key, key, 'one outage is one line');
  // It goes when a good reading comes, clear or not.
  state.picture = 'ok';
  followClock(clock, state);
  await clock.advance(10 * MIN);
  const ok = w.result();
  assert.equal(ok.state, 'clear');
  assert.equal(ok.caution, null);
  w.stop();
});

test("F1: the held caution belongs to the place it was read for: a new home field drops it to the plain can't-tell line", async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  assert.equal(w.result().state, 'near');
  state.picture = 'down';
  state.home = { icao: 'CYQR', lat: 50.4319, lon: -104.6658 };
  w.setPlace();
  await clock.advance(30 * 1000);
  const r = w.result();
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution.text, "Lightning: can't tell", 'lightning near CYMJ says nothing about CYQR');
  assert.equal(r.caution.icao, 'CYQR');
  w.stop();
});

// ---- Y3: after a clear reading, a long outage or a stale picture still reaches the banner -----------------------------------

test("Y3: after a clear reading a short blip (20 s) stays on the strip only, and a 45 minute outage puts the plain can't-tell line on the banner", async () => {
  const { clock, w, state } = watch();
  w.start();
  await clock.settle();
  assert.equal(w.result().state, 'clear');
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000); // the refresh fails and so does the 20 s retry
  assert.equal(w.result().state, 'unknown');
  assert.equal(w.result().caution, null, 'a blip is strip-only');
  await clock.advance(20 * MIN); // 31 minutes after the last good reading
  assert.equal(w.result().caution, null, 'still inside the 40 minute limit');
  await clock.advance(15 * MIN); // 46 minutes
  const r = w.result();
  assert.equal(r.state, 'unknown');
  assert.equal(r.caution.text, "Lightning: can't tell");
  assert.equal(r.caution.level, 'caution');
  // A good reading takes it away.
  state.picture = 'ok';
  followClock(clock, state);
  await clock.advance(10 * MIN);
  assert.equal(w.result().state, 'clear');
  assert.equal(w.result().caution, null);
  w.stop();
});

test('Y3: a stale picture (no failure) after a clear reading puts the plain line on the banner once it is past 40 minutes', async () => {
  const { clock, w } = watch();
  w.start();
  await clock.settle();
  assert.equal(w.result().state, 'clear');
  assert.equal(w.result(new Date(+clock.now() + 30 * MIN)).caution, null);
  const late = w.result(new Date(+clock.now() + 41 * MIN));
  assert.equal(late.state, 'unknown');
  assert.equal(late.caution.text, "Lightning: can't tell");
  w.stop();
});

// ---- Y1: widening the radius during an outage keeps the held caution ----------------------------------------------------

test('Y1: a bigger radius during an outage keeps the held caution and its key ("within 25 NM"); a smaller one does not', async () => {
  const { clock, w, state } = watch({ lit: [pixelEast(12)] });
  w.start();
  await clock.settle();
  const first = w.result().caution;
  state.picture = 'down';
  await clock.advance(10 * MIN + 1000);
  state.radius = 25;
  w.setPlace();
  await clock.advance(30 * 1000);
  const wider = w.result();
  assert.equal(wider.caution.key, first.key, 'lightning inside 20 NM is inside 25 NM');
  assert.match(wider.caution.text, /within 25 NM \(can't tell now, last seen/);
  state.radius = 10;
  w.setPlace();
  await clock.advance(30 * 1000);
  const smaller = w.result();
  assert.equal(smaller.caution.text, "Lightning: can't tell", 'lightning inside 20 NM may be outside 10 NM: the held line is replaced at once by the plain can\'t-tell line');
  assert.notEqual(smaller.caution.key, first.key);
  w.stop();
});
