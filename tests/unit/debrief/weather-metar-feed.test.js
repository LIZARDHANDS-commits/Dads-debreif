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
