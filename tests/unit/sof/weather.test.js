// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// Tests for src/modules/sof/weather.js: the refresh lifecycle the screen runs on
// the module's scheduler scope, with fake timers and a fake fetch (SPEC-sof,
// "Testing strategy": failed refresh keeps the last report (#8), nothing runs
// after unmount (#11 and R4)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../../../src/ui-kit/scheduler.js';
import { createStore } from '../../../src/storage/store.js';
import { createWeather } from '../../../src/modules/sof/weather.js';
import { packReports, REPORTS_KEY } from '../../../src/modules/sof/reports-store.js';
import { parseMetar } from '../../../src/wx/metar.js';
import { MINUTE_MS } from '../../../src/wx/dates.js';

const T0 = new Date('2026-09-29T18:42:00Z');
const STATIONS = ['CYMJ', 'CYQR'];

const metarText = (hhmm = '1800') => `CYMJ 29${hhmm}Z 27010KT 15SM FEW100 15/02 A2952=\nCYQR 29${hhmm}Z 25015KT 15SM FEW080 17/03 A2952=`;
const tafText = 'CYMJ 291740Z 2918/3006 22010KT P6SM FEW100=\nCYQR 291740Z 2918/3018 25015KT P6SM FEW080=';

// Just enough of fetch's answer for wx's sources.
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

/**
 * A fake fetch. `state.down` makes every request fail; `state.metar` is what MET Norway
 * says for METARs. It records each call's url and signal, and `hang` holds every answer until aborted.
 */
function fakeFetch(state = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, signal: init?.signal, credentials: init?.credentials });
    if (state.hang) {
      await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (state.gate) {
      await state.gate; // an answer that only fails once the test lets it, whatever the signal says
      throw new Error('late failure');
    }
    if (state.down) throw new Error('network down');
    if (url.startsWith('https://api.met.no/') && url.includes('/metar?')) return reply(200, state.metar ?? metarText());
    if (url.startsWith('https://api.met.no/') && url.includes('/taf?')) return reply(200, state.taf ?? tafText);
    return reply(404, '{}');
  };
  fn.calls = calls;
  return fn;
}

/** Fake clock and timers under a real scheduler, so the scope's own counts can be checked. */
function setup({ stations = STATIONS, state = {}, saved = null, startAt = T0 } = {}) {
  let clock = new Date(startAt);
  const due = new Map();
  let nextId = 1;
  const scheduler = createScheduler({
    setTimeout: (cb, ms) => {
      const id = nextId++;
      due.set(id, { at: +clock + ms, cb });
      return id;
    },
    clearTimeout: (id) => due.delete(id),
  });
  const scope = scheduler.scope('sof');
  const store = createStore(null).scope('sof');
  if (saved) store.set(REPORTS_KEY, saved);
  const fetch = fakeFetch(state);
  const changes = [];
  let ids = stations;
  const weather = createWeather({
    stations: () => ids,
    fetch,
    timers: scope,
    store,
    now: () => clock,
    onChange: () => changes.push(weather.snapshot()),
  });
  return {
    weather, scheduler, scope, store, fetch, state, changes,
    setStations: (next) => { ids = next; },
    // Moves the clock on and fires what has come due, then lets the answers land.
    async advance(ms) {
      clock = new Date(+clock + ms);
      for (const [id, t] of [...due]) {
        if (t.at <= +clock && due.delete(id)) t.cb();
      }
      await flush();
    },
    // Moves the clock on without firing any timer, as a computer that slept does.
    jump(ms) { clock = new Date(+clock + ms); },
    get clock() { return clock; },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---- The first round ---------------------------------------------------------------

test('start asks for METARs and TAFs for the stations, home first, with no cookies', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const urls = t.fetch.calls.map((c) => c.url);
  assert.ok(urls.includes('https://api.met.no/weatherapi/tafmetar/1.0/metar?icao=CYMJ,CYQR'));
  assert.ok(urls.includes('https://api.met.no/weatherapi/tafmetar/1.0/taf?icao=CYMJ,CYQR'));
  assert.ok(t.fetch.calls.every((c) => c.credentials === 'omit'));
  t.weather.stop();
});

test('after the first round the snapshot has every report, marked fresh, and the round says ok', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const s = t.weather.snapshot();
  assert.equal(s.metar.CYMJ.report.station, 'CYMJ');
  assert.equal(s.metar.CYQR.source, 'metno');
  assert.equal(s.taf.CYMJ.raw.startsWith('CYMJ 291740Z'), true);
  assert.equal(s.lastRound.kind, 'ok');
  assert.equal(+s.lastRound.at, +T0);
  assert.deepEqual([...s.lastRound.fresh.metar].sort(), ['CYMJ', 'CYQR']);
  assert.equal(+s.newestAt, +T0);
  assert.equal(s.busy, false);
  assert.equal(s.stopped, false);
  t.weather.stop();
});

test('the reports are kept in storage, and a new session starts from them, with their age', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const saved = t.store.get(REPORTS_KEY, null);
  assert.equal(saved.metar.CYMJ.raw, 'CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952');
  t.weather.stop();

  const later = setup({ saved, startAt: new Date(+T0 + 12 * MINUTE_MS), state: { down: true } });
  const before = later.weather.snapshot();
  assert.equal(before.metar.CYMJ.report.station, 'CYMJ', 'shown before any fetch');
  assert.equal(before.lastRound, null);
  assert.equal(+before.newestAt, +T0, 'its age is from when it was fetched');
});

test('busy is true while requests are out, and the change is announced both ways', async () => {
  const t = setup({ state: { hang: true } });
  t.weather.start();
  assert.equal(t.weather.snapshot().busy, true);
  assert.ok(t.changes.some((s) => s.busy), 'the screen is told when it starts');
  t.weather.stop();
});

// ---- A round that fails keeps what it had ---------------------------------------------

test('every feed failing keeps the last reports and says the round failed, with who failed (#8)', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  t.state.down = true;
  await t.advance(5 * MINUTE_MS);
  const s = t.weather.snapshot();
  assert.equal(s.lastRound.kind, 'failed');
  assert.deepEqual(s.lastRound.sources.sort(), ['datamask', 'metno']);
  assert.equal(s.metar.CYMJ.report.station, 'CYMJ', 'the last report is still there');
  assert.equal(s.lastRound.fresh.metar.size, 0);
  assert.equal(+s.newestAt, +T0, 'its age keeps counting from the last good round');
  t.weather.stop();
});

test('a failed round does not overwrite what is stored', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const good = JSON.stringify(t.store.get(REPORTS_KEY, null));
  t.state.down = true;
  await t.advance(5 * MINUTE_MS);
  assert.equal(JSON.stringify(t.store.get(REPORTS_KEY, null)), good);
  t.weather.stop();
});

test('the next round that works says ok again and takes the new reports', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  t.state.down = true;
  await t.advance(5 * MINUTE_MS);
  t.state.down = false;
  t.state.metar = metarText('1900');
  await t.advance(5 * MINUTE_MS);
  const s = t.weather.snapshot();
  assert.equal(s.lastRound.kind, 'ok');
  assert.equal(s.metar.CYMJ.raw.startsWith('CYMJ 291900Z'), true);
  assert.equal(+s.newestAt, +t.clock);
  t.weather.stop();
});

test('a station a round could not get is not fresh in it, though an older report is still held', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  t.state.metar = 'CYMJ 291900Z 27010KT 15SM FEW100 15/02 A2952='; // Regina missing from both sources
  await t.advance(5 * MINUTE_MS);
  const s = t.weather.snapshot();
  assert.equal(s.lastRound.kind, 'ok');
  assert.deepEqual([...s.lastRound.fresh.metar], ['CYMJ']);
  assert.equal(s.metar.CYQR.raw.startsWith('CYQR 291800Z'), true);
  t.weather.stop();
});

test('a round with replies but no reports at all is empty, not failed', async () => {
  const t = setup({ state: { metar: '', taf: '' } });
  t.weather.start();
  await flush();
  const s = t.weather.snapshot();
  assert.equal(s.lastRound.kind, 'empty');
  assert.equal(s.newestAt, null);
  t.weather.stop();
});

// ---- Timing --------------------------------------------------------------------------

test('it refreshes every 5 minutes and not before', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const first = t.fetch.calls.length;
  await t.advance(4 * MINUTE_MS + 59_000);
  assert.equal(t.fetch.calls.length, first);
  await t.advance(1_000);
  assert.ok(t.fetch.calls.length > first);
  t.weather.stop();
});

test('refresh() asks now, and pressing it again while a round is out does nothing', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const first = t.fetch.calls.length;
  const one = t.weather.refresh();
  t.weather.refresh();
  t.weather.refresh();
  await one;
  await flush();
  assert.equal(t.fetch.calls.length, first + 2, 'one round of a METAR and a TAF request');
  t.weather.stop();
});

test('wake() refreshes when the last round is 5 minutes old or more, and otherwise leaves it', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const first = t.fetch.calls.length;
  t.weather.wake();
  await flush();
  assert.equal(t.fetch.calls.length, first, 'a round has just run');
  // The computer slept: the clock moved on, and the timer has not fired yet.
  t.jump(6 * MINUTE_MS);
  t.weather.wake();
  await flush();
  assert.equal(t.fetch.calls.length, first + 2, 'one round, at once');
  t.weather.stop();
});

// ---- The stations change --------------------------------------------------------------

test('restart with new stations asks for the new list, keeps one timer, and drops reports for stations no longer shown', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  assert.equal(t.scheduler.stats().timers, 1);
  t.setStations(['CYMJ', 'CYYN']);
  t.state.metar = 'CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952=\nCYYN 291800Z 27016G29KT 9SM CLR 18/02 A2954=';
  t.weather.restart();
  await flush();
  assert.ok(t.fetch.calls.some((c) => c.url.endsWith('/metar?icao=CYMJ,CYYN')));
  assert.equal(t.scheduler.stats().timers, 1, 'the old timer was cancelled, not left running');
  const s = t.weather.snapshot();
  assert.equal(s.metar.CYYN.report.station, 'CYYN');
  assert.equal(s.metar.CYQR, undefined);
  t.weather.stop();
});

test('restart when the stations have not changed is not needed: restartIfChanged leaves the round alone', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  const calls = t.fetch.calls.length;
  assert.equal(t.weather.restartIfChanged(), false);
  assert.equal(t.fetch.calls.length, calls);
  t.setStations(['CYMJ', 'CYYN']);
  assert.equal(t.weather.restartIfChanged(), true);
  await flush();
  assert.ok(t.fetch.calls.length > calls);
  t.weather.stop();
});

test('a round still out for the old stations is dropped when the stations change', async () => {
  const t = setup({ state: { hang: true } });
  t.weather.start();
  const old = t.fetch.calls.map((c) => c.signal);
  t.state.hang = false;
  t.setStations(['CYMJ']);
  t.weather.restart();
  await flush();
  assert.ok(old.length > 0 && old.every((s) => s.aborted), 'the old requests were cancelled');
  t.weather.stop();
});

// ---- Leaving the module (R4) ------------------------------------------------------------

test('stop cancels requests still out, the timer, and tells the screen nothing more', async () => {
  const t = setup({ state: { hang: true } });
  t.weather.start();
  await flush();
  assert.ok(t.fetch.calls.length >= 2);
  const seen = t.changes.length;
  t.weather.stop();
  await flush();
  assert.ok(t.fetch.calls.every((c) => c.signal.aborted), 'every request was aborted');
  assert.equal(t.scheduler.stats().timers, 0);
  assert.equal(t.weather.snapshot().stopped, true);
  assert.equal(t.changes.length, seen, 'no change reported after stop');
  t.weather.refresh();
  t.weather.wake();
  await flush();
  assert.ok(t.fetch.calls.length <= 4, 'nothing new is asked for after stop');
});

test('disposing the scope alone leaves no timer running', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  assert.equal(t.scheduler.stats().timers, 1);
  t.scope.dispose();
  assert.equal(t.scheduler.stats().timers, 0);
  t.weather.stop();
});

test('stopping twice is harmless', async () => {
  const t = setup();
  t.weather.start();
  await flush();
  t.weather.stop();
  t.weather.stop();
  assert.equal(t.scheduler.stats().timers, 0);
});

// ---- Odd stored data --------------------------------------------------------------------

test('stored reports are read back checked: junk in storage starts the screen empty', () => {
  const t = setup({ saved: { v: 1, metar: { CYMJ: { raw: 5 } }, taf: 'nope' } });
  const s = t.weather.snapshot();
  assert.deepEqual(s.metar, {});
  assert.equal(s.newestAt, null);
});

test('reports from a stored round survive a restart to the same stations even when the fetch fails at once', async () => {
  const seeded = packReports({
    metar: new Map([['CYMJ', { entry: { raw: 'CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952', report: parseMetar('CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952', { now: T0 }), source: 'metno' }, at: T0 }]]),
    taf: new Map(),
  });
  const t = setup({ saved: seeded, state: { down: true } });
  t.weather.start();
  await flush();
  const s = t.weather.snapshot();
  assert.equal(s.lastRound.kind, 'failed');
  assert.equal(s.metar.CYMJ.report.station, 'CYMJ');
  t.weather.stop();
});

test('a round still finishing for the old stations cannot leave the screen stuck on Refreshing', async () => {
  let release;
  const t = setup({ state: { gate: new Promise((resolve) => { release = resolve; }) } });
  t.weather.start();
  await flush();
  t.state.gate = null;
  t.setStations(['CYMJ']);
  t.weather.restart();
  await flush();
  assert.equal(t.weather.snapshot().busy, false, 'the new round is done');
  release(); // now the old round's requests fail, and it goes on to ask Datamask
  await flush();
  await flush();
  assert.equal(t.weather.snapshot().busy, false);
  t.weather.stop();
});
