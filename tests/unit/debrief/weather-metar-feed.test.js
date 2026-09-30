// The METAR fetches (SPEC-debrief: Weather at the time of the flight, R5):
// once per airfield per flight, only when asked, stopped when the flight goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetarFeed } from '../../../src/modules/debrief/weather/metar-feed.js';

const flight = { startT: Date.parse('2026-09-30T14:00:00Z') / 1000, endT: Date.parse('2026-09-30T15:00:00Z') / 1000 };
const REPLY = 'station,valid,metar\nCYMJ,2026-09-30 14:00,CYMJ 301400Z 28015KT 15SM FEW040 10/07 A2990\n';
const settle = () => new Promise((resolve) => setImmediate(resolve));

function fakeFetch(respond) {
  const calls = [];
  const fetch = (url, { signal }) => {
    calls.push({ url, signal });
    return respond(url);
  };
  return { fetch, calls };
}

test('nothing is fetched until an airfield is asked for, then once per airfield', async () => {
  const { fetch, calls } = fakeFetch(() => Promise.resolve({ ok: true, text: () => Promise.resolve(REPLY) }));
  let changes = 0;
  const feed = createMetarFeed({ fetch, onChange: () => changes++ });
  assert.equal(feed.get('CYMJ'), null); // no flight
  feed.setFlight(flight);
  assert.equal(calls.length, 0);
  assert.equal(feed.get('CYMJ').state, 'loading');
  feed.get('CYMJ');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /station=CYMJ/);
  await settle();
  assert.equal(feed.get('CYMJ').state, 'ready');
  assert.equal(feed.get('CYMJ').reports.length, 1);
  assert.equal(changes, 1);
  assert.equal(calls.length, 1);
});

test('a failed fetch says so, and a new flight starts afresh', async () => {
  const { fetch, calls } = fakeFetch(() => Promise.resolve({ ok: false, status: 503 }));
  const feed = createMetarFeed({ fetch, onChange: () => {} });
  feed.setFlight(flight);
  feed.get('CYQR');
  await settle();
  assert.equal(feed.get('CYQR').state, 'failed');
  feed.setFlight({ ...flight });
  feed.get('CYQR');
  assert.equal(calls.length, 2);
});

test('closing the flight or the debrief stops a fetch still loading, silently', async () => {
  const { fetch, calls } = fakeFetch((url) => new Promise(() => {})); // never answers
  let changes = 0;
  const feed = createMetarFeed({ fetch, onChange: () => changes++ });
  feed.setFlight(flight);
  feed.get('CYMJ');
  feed.setFlight(null);
  assert.equal(calls[0].signal.aborted, true);
  feed.setFlight(flight);
  feed.get('CYMJ');
  feed.dispose();
  assert.equal(calls[1].signal.aborted, true);
  await settle();
  assert.equal(changes, 0);
});

// The SPECI marking: a second call, after the first, a second later, through the timer service.
const PLAIN = 'station,valid,metar\nCYMJ,2026-09-30 14:00,CYMJ 301400Z 28015KT 15SM FEW040 10/07 A2990\nCYMJ,2026-09-30 14:32,CYMJ 301432Z 28018KT 1SM +SHRA OVC008 09/08 A2991\n';
const SPECIALS = 'station,valid,metar\nCYMJ,2026-09-30 14:32,CYMJ 301432Z 28018KT 1SM +SHRA OVC008 09/08 A2991\n';
const ok = (text) => Promise.resolve({ ok: true, text: () => Promise.resolve(text) });
const isSpeciCall = (url) => new URL(url).searchParams.getAll('report_type').join() === '4';
const types = (feed, icao) => feed.get(icao).reports.map((r) => r.type);

function fakeTimers() {
  const waiting = [];
  return {
    waiting,
    after(ms, cb) {
      const entry = { ms, cb, cancelled: false };
      waiting.push(entry);
      return () => { entry.cancelled = true; };
    },
    fire() {
      for (const w of waiting.splice(0)) if (!w.cancelled) w.cb();
    },
  };
}

test('specials: asked once after the full list, a second later, and never in parallel', async () => {
  const timers = fakeTimers();
  let inFlight = 0;
  let most = 0;
  const { fetch, calls } = fakeFetch((url) => {
    inFlight++;
    most = Math.max(most, inFlight);
    return ok(isSpeciCall(url) ? SPECIALS : PLAIN).finally(() => inFlight--);
  });
  let changes = 0;
  const feed = createMetarFeed({ fetch, timers, onChange: () => changes++ });
  feed.setFlight(flight);
  feed.get('CYMJ');
  assert.equal(calls.length, 1);
  assert.deepEqual(new URL(calls[0].url).searchParams.getAll('report_type'), ['3', '4']);
  await settle();
  // The list shows at once; the second call is only waiting out the second.
  assert.equal(feed.get('CYMJ').state, 'ready');
  assert.deepEqual(types(feed, 'CYMJ'), ['METAR', 'METAR']);
  assert.equal(changes, 1);
  assert.equal(calls.length, 1, 'not sent before the wait is over');
  assert.equal(timers.waiting.length, 1);
  assert.equal(timers.waiting[0].ms, 1000);
  feed.get('CYMJ'); // asking again neither waits again nor sends
  assert.equal(timers.waiting.length, 1);
  timers.fire();
  assert.equal(calls.length, 2);
  const [first, second] = calls.map((c) => new URL(c.url).searchParams);
  assert.deepEqual(second.getAll('report_type'), ['4']);
  for (const key of ['station', 'sts', 'ets']) assert.equal(second.get(key), first.get(key), key);
  await settle();
  assert.deepEqual(types(feed, 'CYMJ'), ['METAR', 'SPECI']);
  assert.equal(changes, 2, 'the line and ticks redraw when the marks arrive');
  assert.equal(calls.length, 2);
  assert.equal(timers.waiting.length, 0);
  assert.equal(most, 1);
});

test('specials: a failed second call leaves the reports unmarked, with no error and no further redraw', async () => {
  for (const second of [() => Promise.resolve({ ok: false, status: 429 }), () => Promise.reject(new Error('offline')), () => ok('<html>busy</html>')]) {
    const timers = fakeTimers();
    const { fetch, calls } = fakeFetch((url) => (isSpeciCall(url) ? second() : ok(PLAIN)));
    let changes = 0;
    const feed = createMetarFeed({ fetch, timers, onChange: () => changes++ });
    feed.setFlight(flight);
    feed.get('CYMJ');
    await settle();
    timers.fire();
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(feed.get('CYMJ').state, 'ready', 'no error line');
    assert.deepEqual(types(feed, 'CYMJ'), ['METAR', 'METAR']);
    assert.equal(changes, 1);
  }
});

test('specials: a failed first call asks for no specials', async () => {
  const timers = fakeTimers();
  const { fetch, calls } = fakeFetch(() => Promise.resolve({ ok: false, status: 503 }));
  const feed = createMetarFeed({ fetch, timers, onChange: () => {} });
  feed.setFlight(flight);
  feed.get('CYMJ');
  await settle();
  assert.equal(timers.waiting.length, 0);
  assert.equal(calls.length, 1);
});

test('specials: with no timer service the full list still works and the specials are not asked', async () => {
  const { fetch, calls } = fakeFetch(() => ok(PLAIN));
  const feed = createMetarFeed({ fetch, onChange: () => {} });
  feed.setFlight(flight);
  feed.get('CYMJ');
  await settle();
  assert.equal(feed.get('CYMJ').state, 'ready');
  assert.equal(calls.length, 1);
});

test('specials: closing the flight while waiting cancels the wait and sends nothing', async () => {
  for (const close of [(feed) => feed.setFlight(null), (feed) => feed.setFlight({ ...flight }), (feed) => feed.dispose()]) {
    const timers = fakeTimers();
    const { fetch, calls } = fakeFetch(() => ok(PLAIN));
    let changes = 0;
    const feed = createMetarFeed({ fetch, timers, onChange: () => changes++ });
    feed.setFlight(flight);
    feed.get('CYMJ');
    await settle();
    assert.equal(changes, 1);
    close(feed);
    assert.equal(timers.waiting[0].cancelled, true);
    timers.fire();
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(changes, 1);
  }
});

test('specials: closing the flight while the second call is out aborts it, silently', async () => {
  for (const close of [(feed) => feed.setFlight(null), (feed) => feed.dispose()]) {
    const timers = fakeTimers();
    const { fetch, calls } = fakeFetch((url) => (isSpeciCall(url) ? new Promise(() => {}) : ok(PLAIN)));
    let changes = 0;
    const feed = createMetarFeed({ fetch, timers, onChange: () => changes++ });
    feed.setFlight(flight);
    feed.get('CYMJ');
    await settle();
    timers.fire();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].signal.aborted, false);
    close(feed);
    assert.equal(calls[1].signal.aborted, true);
    await settle();
    assert.equal(changes, 1);
  }
});

test('specials: a late reply for a flight that has gone marks nothing and redraws nothing', async () => {
  const timers = fakeTimers();
  let answer;
  const { fetch } = fakeFetch((url) => (isSpeciCall(url) ? new Promise((resolve) => { answer = resolve; }) : ok(PLAIN)));
  let changes = 0;
  const feed = createMetarFeed({ fetch, timers, onChange: () => changes++ });
  feed.setFlight(flight);
  const stale = feed.get('CYMJ');
  await settle();
  timers.fire();
  feed.setFlight({ ...flight });
  answer({ ok: true, text: () => Promise.resolve(SPECIALS) });
  await settle();
  assert.deepEqual(stale.reports.map((r) => r.type), ['METAR', 'METAR']);
  assert.equal(changes, 1);
});
