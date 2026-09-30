// The saved radar's fetch (SPEC-debrief: Saved radar and lightning): only when
// asked, every frame covering the flight, what it does with a reply that isn't
// a picture, how a partial or failed fetch reads, and cancelling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSavedRadarFeed, offerState } from '../../../src/modules/debrief/weather/saved-radar-feed.js';
import { savedBox, framesToDraw, LIMITS, savedToSetting, savedFromSetting } from '../../../src/modules/debrief/weather/saved-radar.js';

const at = (iso) => Date.parse(iso) / 1000;
const png = (name) => readFileSync(new URL(`../../fixtures/debrief/${name}`, import.meta.url));
const RAIN = png('eccc-rain.png');
const LIGHTNING = png('eccc-lightning.png');

const START = at('2026-09-30T06:10:00Z');
const END = at('2026-09-30T06:50:00Z');
const NOW = at('2026-09-30T07:30:00Z');
const flight = { startT: START, endT: END, bounds: { minLat: 50, maxLat: 50.6, minLon: -106, maxLon: -105.2 } };

const caps = (name, start, end, period) =>
  `<WMS_Capabilities><Capability><Layer><Layer><Name>${name}</Name><Dimension name="time" units="ISO8601" default="${end}" nearestValue="0">${start}/${end}/${period}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`;
const CAPS = {
  RADAR_1KM_RRAI: caps('RADAR_1KM_RRAI', '2026-09-30T04:30:00Z', '2026-09-30T07:30:00Z', 'PT6M'),
  RADAR_1KM_RSNO: caps('RADAR_1KM_RSNO', '2026-09-30T04:30:00Z', '2026-09-30T07:30:00Z', 'PT6M'),
  Lightning_2_5km: caps('Lightning_2.5km_Density', '2026-09-30T04:30:00Z', '2026-09-30T07:30:00Z', 'PT10M'),
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A fake ECCC. `answer(url)` may return a Response, a Promise of one or undefined
 * for the default answer: the caps XML for a capabilities request, otherwise a PNG.
 */
function fakeEccc(answer = () => undefined) {
  const calls = [];
  let open = 0;
  let mostOpen = 0;
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    open += 1;
    mostOpen = Math.max(mostOpen, open);
    try {
      await settle();
      const custom = await answer(String(url), init);
      if (custom) return custom;
      const q = new URL(url).searchParams;
      if (q.get('request') === 'GetCapabilities') {
        const layer = q.get('layer');
        return new Response(layer === 'Lightning_2.5km_Density' ? CAPS.Lightning_2_5km : CAPS[layer], { headers: { 'content-type': 'text/xml' } });
      }
      return new Response(q.get('layers') === 'Lightning_2.5km_Density' ? LIGHTNING : RAIN, { headers: { 'content-type': 'image/png' } });
    } finally {
      open -= 1;
    }
  };
  return { fetch, calls, get mostOpen() { return mostOpen; } };
}
const param = (url, name) => new URL(url).searchParams.get(name);
const frames = (calls) => calls.filter((c) => new URL(c.url).searchParams.get('request') === 'GetMap');
const done = async (feed) => {
  for (let i = 0; i < 400 && feed.state().phase === 'fetching'; i++) await settle();
};

test('nothing is fetched until asked, and then the pictures covering the flight are, each once', async () => {
  const eccc = fakeEccc();
  let changes = 0;
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => changes++ });
  await settle();
  assert.equal(eccc.calls.length, 0);
  assert.equal(feed.state().phase, 'idle');
  feed.start(flight);
  assert.equal(feed.state().phase, 'fetching');
  await done(feed);
  const s = feed.state();
  assert.equal(s.phase, 'done');
  // 8 rain (06:06 to 06:48), 8 snow, 5 lightning (06:10 to 06:50).
  assert.equal(s.total, 21);
  assert.equal(s.done, 21);
  assert.equal(s.saved.frames.length, 21);
  assert.equal(s.saved.fetchedT, NOW);
  assert.deepEqual(s.notes, []);
  assert.ok(changes >= 22, 'a change for the start and each picture');
  const asked = frames(eccc.calls).map((c) => new URL(c.url).searchParams);
  assert.equal(asked.length, 21);
  const box = savedBox(flight.bounds);
  assert.ok(asked.every((q) => q.get('bbox') === `${box.minLat},${box.minLon},${box.maxLat},${box.maxLon}` && q.get('crs') === 'EPSG:4326'));
  const rainTimes = asked.filter((q) => q.get('layers') === 'RADAR_1KM_RRAI').map((q) => q.get('time').slice(11, 16));
  assert.deepEqual(rainTimes.sort(), ['06:06', '06:12', '06:18', '06:24', '06:30', '06:36', '06:42', '06:48']);
  const lightningTimes = asked.filter((q) => q.get('layers') === 'Lightning_2.5km_Density').map((q) => q.get('time').slice(11, 16));
  assert.deepEqual(lightningTimes.sort(), ['06:10', '06:20', '06:30', '06:40', '06:50']);
  // Plain GETs: nothing ECCC's preflight refusal would trip on.
  assert.ok(eccc.calls.every((c) => c.init?.method === undefined && c.init?.headers === undefined && c.init?.body === undefined));
  assert.ok(eccc.calls.every((c) => new URL(c.url).origin === 'https://geo.weather.gc.ca'));
});

test('the pictures kept are the ones fetched, drawn by the same lookup a file\'s would be', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const { saved } = feed.state();
  const drawn = framesToDraw(saved, 'radar', at('2026-09-30T06:20:00Z'));
  assert.deepEqual(drawn.map((d) => [d.layer, d.frame.t, d.ageS]), [['rain', at('2026-09-30T06:18:00Z'), 120], ['snow', at('2026-09-30T06:18:00Z'), 120]]);
  assert.equal(drawn[0].frame.data, RAIN.toString('base64'));
  assert.equal(framesToDraw(saved, 'lightning', at('2026-09-30T06:20:00Z'))[0].frame.data, LIGHTNING.toString('base64'));
});

test('a few requests at a time, not all at once', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  assert.ok(eccc.mostOpen > 1 && eccc.mostOpen <= 3, `at most 3 at a time, saw ${eccc.mostOpen}`);
});

test('a starting fetch is not started twice', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  feed.start(flight);
  await done(feed);
  assert.equal(frames(eccc.calls).length, 21);
});

test('ECCC answering a missing frame with 200 and XML leaves that picture out and says so', async () => {
  const xml = () => new Response('<ogc:ServiceExceptionReport><ogc:ServiceException code="NoMatch"/></ogc:ServiceExceptionReport>', { headers: { 'content-type': 'text/xml' } });
  const eccc = fakeEccc((url) => (param(url, 'time') === '2026-09-30T06:24:00Z' && param(url, 'layers') === 'RADAR_1KM_RRAI' ? xml() : undefined));
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const s = feed.state();
  assert.equal(s.phase, 'done');
  assert.equal(s.saved.frames.length, 20);
  assert.deepEqual(s.notes, ["1 picture couldn't be fetched."]);
});

test('a frame that fails to load, or answers with an error, is counted the same', async () => {
  const eccc = fakeEccc((url) => {
    if (param(url, 'layers') !== 'RADAR_1KM_RSNO') return undefined;
    if (param(url, 'time') === '2026-09-30T06:12:00Z') return Promise.reject(new TypeError('network down'));
    if (param(url, 'time') === '2026-09-30T06:18:00Z') return new Response('busy', { status: 503 });
    return undefined;
  });
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const s = feed.state();
  assert.equal(s.saved.frames.length, 19);
  assert.deepEqual(s.notes, ["2 pictures couldn't be fetched."]);
});

test('a layer ECCC will not list is named, and the others are kept', async () => {
  const eccc = fakeEccc((url) => (param(url, 'request') === 'GetCapabilities' && param(url, 'layer') === 'Lightning_2.5km_Density' ? new Response('down', { status: 500 }) : undefined));
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const s = feed.state();
  assert.equal(s.phase, 'done');
  assert.equal(s.saved.frames.length, 16);
  assert.deepEqual(s.notes, ['No lightning pictures could be fetched.']);
});

test('a layer whose reply names no times is left out the same way', async () => {
  const eccc = fakeEccc((url) => (param(url, 'request') === 'GetCapabilities' && param(url, 'layer') === 'RADAR_1KM_RSNO' ? new Response('<WMS_Capabilities/>', { headers: { 'content-type': 'text/xml' } }) : undefined));
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  assert.deepEqual(feed.state().notes, ['No snow radar pictures could be fetched.']);
});

test('ECCC no longer having the start of the flight says from when the pictures are', async () => {
  const late = { ...CAPS, RADAR_1KM_RRAI: caps('RADAR_1KM_RRAI', '2026-09-30T06:30:00Z', '2026-09-30T07:30:00Z', 'PT6M') };
  const eccc = fakeEccc((url) => {
    const q = new URL(url).searchParams;
    return q.get('request') === 'GetCapabilities' && q.get('layer') === 'RADAR_1KM_RRAI' ? new Response(late.RADAR_1KM_RRAI, { headers: { 'content-type': 'text/xml' } }) : undefined;
  });
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const s = feed.state();
  assert.equal(s.saved.frames.filter((f) => f.layer === 'rain').length, 4); // 06:30 to 06:48
  assert.deepEqual(s.notes, ['Rain radar from 06:30Z: ECCC no longer had earlier pictures.']);
});

test('with nothing to keep, or no connection, it fails with words and keeps nothing', async () => {
  const off = fakeEccc(() => Promise.reject(new TypeError('Failed to fetch')));
  const feed = createSavedRadarFeed({ fetch: off.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  assert.equal(feed.state().phase, 'failed');
  assert.equal(feed.state().saved, null);
  assert.equal(feed.state().failure, "ECCC couldn't be reached. Check the connection and try again.");

  const gone = fakeEccc((url) => (param(url, 'request') === 'GetMap' ? new Response('<x/>', { headers: { 'content-type': 'text/xml' } }) : undefined));
  const second = createSavedRadarFeed({ fetch: gone.fetch, now: () => NOW, onChange: () => {} });
  second.start(flight);
  await done(second);
  assert.equal(second.state().phase, 'failed');
  assert.equal(second.state().failure, 'ECCC had no pictures for this flight any more.');

  const nowhere = createSavedRadarFeed({ fetch: off.fetch, now: () => NOW, onChange: () => {} });
  nowhere.start({ ...flight, bounds: null });
  assert.equal(nowhere.state().phase, 'failed');
  assert.equal(nowhere.state().failure, "the flight's tracks have no position.");
});

test('a failed fetch can be tried again', async () => {
  let up = false;
  const eccc = fakeEccc(() => (up ? undefined : Promise.reject(new TypeError('Failed to fetch'))));
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  assert.equal(feed.state().phase, 'failed');
  up = true;
  feed.start(flight);
  await done(feed);
  assert.equal(feed.state().phase, 'done');
  assert.equal(feed.state().failure, null);
});

test('cancel stops the requests, keeps nothing, and a late reply changes nothing', async () => {
  const eccc = fakeEccc();
  let changes = 0;
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => changes++ });
  feed.start(flight);
  for (let i = 0; i < 6; i++) await settle();
  assert.equal(feed.state().phase, 'fetching');
  const signals = eccc.calls.map((c) => c.init?.signal).filter(Boolean);
  assert.ok(signals.length > 0 && signals.every((s) => s instanceof AbortSignal));
  feed.cancel();
  assert.equal(feed.state().phase, 'idle');
  assert.equal(feed.state().saved, null);
  assert.ok(signals.every((s) => s.aborted));
  const seen = changes;
  const asked = eccc.calls.length;
  for (let i = 0; i < 20; i++) await settle();
  assert.equal(changes, seen, 'nothing changes after cancelling');
  assert.equal(eccc.calls.length, asked, 'nothing more is asked');
  assert.equal(feed.state().phase, 'idle');
});

test('closing the flight or the debrief cancels a fetch under way', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await settle();
  feed.setFlight(null);
  assert.equal(feed.state().phase, 'idle');
  assert.ok(eccc.calls.every((c) => !c.init?.signal || c.init.signal.aborted));
  feed.start(flight);
  await settle();
  feed.dispose();
  for (let i = 0; i < 20; i++) await settle();
  assert.equal(feed.state().saved, null);
});

test('a new flight forgets the last one\'s pictures; a file\'s pictures are loaded as done', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const { saved } = feed.state();
  feed.setFlight(null);
  assert.equal(feed.state().saved, null);
  feed.load(saved);
  assert.equal(feed.state().phase, 'done');
  assert.equal(feed.state().saved, saved);
  assert.deepEqual(feed.state().notes, []);
  feed.load(null);
  assert.equal(feed.state().phase, 'idle');
});

test('over the size limit the pictures are thinned and the words say how far apart they are', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {}, capBytes: 7 * RAIN.length });
  feed.start(flight);
  await done(feed);
  const s = feed.state();
  assert.equal(s.phase, 'done');
  assert.ok(s.saved.frames.length < 21);
  assert.ok(s.saved.frames.filter((f) => f.layer === 'rain').length >= 2, 'a layer\'s first and last stay');
  assert.match(s.notes.at(-1), /^Every \d+ min kept to fit the size limit\.$/);
  assert.ok(s.saved.thin > 1 && s.saved.thin <= LIMITS.maxThin, 'the step is recorded for the age limit');
  const tooSmall = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {}, capBytes: 10 });
  tooSmall.start(flight);
  await done(tooSmall);
  assert.equal(tooSmall.state().phase, 'failed');
  assert.equal(tooSmall.state().failure, 'the pictures are over the size limit.');
  assert.ok(LIMITS.maxTotalBytes > 10);
});

// --- What the menu offers -----------------------------------------------------

const base = { flight: true, recent: true, phase: 'idle', done: 0, total: 0, saved: null, notes: [], failure: null, fromFile: false };
const OFFER = 'ECCC keeps radar for 3 hours. This fetches every picture from the flight and keeps them in the debrief file.';

test('the offer: hidden with no flight, a button for a recent flight, the not kept words for an old one', () => {
  assert.deepEqual(offerState({ ...base, flight: false }), { button: 'hidden', status: '', live: '' });
  assert.deepEqual(offerState(base), { button: 'save', status: OFFER, live: OFFER });
  const old = 'Not kept: radar is only available for 3 hours after the flight.';
  assert.deepEqual(offerState({ ...base, recent: false }), { button: 'hidden', status: old, live: old });
});

test('the offer while fetching is a cancel button with a progress line that counts each picture', () => {
  assert.equal(offerState({ ...base, phase: 'fetching' }).button, 'cancel');
  assert.equal(offerState({ ...base, phase: 'fetching' }).status, 'Asking ECCC which pictures it has…');
  assert.equal(offerState({ ...base, phase: 'fetching', done: 12, total: 39 }).status, 'Saving radar and lightning: 12 of 39');
});

test('what is announced to a screen reader changes only at the start, about every 25 %, and at the end (Y5)', () => {
  const live = (done, total = 40) => offerState({ ...base, phase: 'fetching', done, total }).live;
  assert.equal(offerState({ ...base, phase: 'fetching' }).live, 'Asking ECCC which pictures it has…');
  const seen = [];
  for (let done = 0; done < 40; done++) if (live(done) !== seen.at(-1)) seen.push(live(done));
  assert.deepEqual(seen, [
    'Saving radar and lightning: 40 pictures',
    'Saving radar and lightning: 25 percent',
    'Saving radar and lightning: 50 percent',
    'Saving radar and lightning: 75 percent',
  ]);
  // The end is the result, announced as a change once.
  const saved = { box: {}, fetchedT: 1, thin: 1, frames: [{ layer: 'rain', t: START, mime: 'image/png', data: 'AAAA' }] };
  const end = offerState({ ...base, phase: 'done', saved });
  assert.equal(end.live, end.status);
  assert.match(end.live, /^Kept with this debrief/);
});

test('once kept, the offer is gone and the line says what is kept, even for a flight that is now old', () => {
  const saved = { box: {}, fetchedT: 1, frames: [{ layer: 'rain', t: START, mime: 'image/png', data: 'AAAA' }, { layer: 'lightning', t: END, mime: 'image/png', data: 'AAAA' }] };
  const kept = offerState({ ...base, phase: 'done', saved, notes: ["1 picture couldn't be fetched."] });
  assert.equal(kept.button, 'hidden');
  assert.equal(kept.status, "Kept with this debrief: 2 radar and lightning pictures, 06:10Z to 06:50Z. 1 picture couldn't be fetched. Save the debrief to put them in the file.");
  assert.equal(offerState({ ...base, recent: false, phase: 'done', saved, fromFile: true }).status, 'Kept with this debrief: 2 radar and lightning pictures, 06:10Z to 06:50Z.');
});

test('a failed fetch offers the button again with the reason', () => {
  const failed = offerState({ ...base, phase: 'failed', failure: 'ECCC had no pictures for this flight any more.' });
  assert.deepEqual(failed, {
    button: 'save', status: "Couldn't save radar and lightning: ECCC had no pictures for this flight any more.",
    live: "Couldn't save radar and lightning: ECCC had no pictures for this flight any more.",
  });
});

test('every frame the fetch keeps passes the reader, even on a 30-minute step with a start 1,740 s after the last frame (Y2)', async () => {
  const slow = (name) => caps(name, '2026-09-30T04:00:00Z', '2026-09-30T07:30:00Z', 'PT30M');
  const eccc = fakeEccc((url) => {
    const q = new URL(url).searchParams;
    if (q.get('request') !== 'GetCapabilities') return undefined;
    return new Response(slow(q.get('layer')), { headers: { 'content-type': 'text/xml' } });
  });
  const late = { ...flight, startT: at('2026-09-30T06:29:00Z') }; // the frame at or before it is 06:00, 1,740 s earlier
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(late);
  await done(feed);
  const { saved } = feed.state();
  assert.ok(saved.frames.some((f) => f.t === at('2026-09-30T06:00:00Z')), 'the frame at or before the start is kept');
  const back = savedFromSetting(savedToSetting(saved), { startT: late.startT, endT: late.endT });
  assert.equal(back.problem, undefined);
  assert.deepEqual(back.saved, saved, 'every frame kept is read back');
});

test('and on the usual steps, from the recorded shape, every kept frame passes', async () => {
  const eccc = fakeEccc();
  const feed = createSavedRadarFeed({ fetch: eccc.fetch, now: () => NOW, onChange: () => {} });
  feed.start(flight);
  await done(feed);
  const { saved } = feed.state();
  assert.deepEqual(savedFromSetting(savedToSetting(saved), { startT: flight.startT, endT: flight.endT }).saved, saved);
});
