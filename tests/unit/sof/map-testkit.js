// A virtual clock, timers and fetch for the SOF map's feed tests. Not a test itself.
// Time only moves when a test moves it, and every timer the code under test starts
// is counted, so "nothing left running" can be checked.
import { readFileSync } from 'node:fs';

export const fixture = (name) => readFileSync(new URL(`../../fixtures/sof/${name}`, import.meta.url), 'utf8');

/** A PNG's first bytes: enough for the checks that look at the signature. */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * { now(), advance(ms), settle(), timers: { after, every }, pending, cancelled }.
 * `advance` runs every timer that comes due, in order, letting promises settle after each.
 */
export function virtualClock(startIso = '2026-09-30T07:15:00Z') {
  let t = Date.parse(startIso);
  let seq = 0;
  const queue = new Map(); // id -> { at, cb, every }
  let cancelled = 0;
  const add = (ms, cb, every = null) => {
    const id = ++seq;
    queue.set(id, { at: t + ms, cb, every });
    return () => {
      if (queue.delete(id)) cancelled += 1;
    };
  };
  const clock = {
    now: () => new Date(t),
    timers: {
      after: (ms, cb) => add(ms, cb),
      every: (ms, cb) => add(ms, cb, ms),
    },
    get pending() {
      return queue.size;
    },
    get cancelled() {
      return cancelled;
    },
    async settle() {
      for (let i = 0; i < 6; i++) await flush();
    },
    async advance(ms) {
      const end = t + ms;
      await clock.settle();
      for (;;) {
        let nextId = null;
        for (const [id, item] of queue) if (item.at <= end && (nextId === null || item.at < queue.get(nextId).at)) nextId = id;
        if (nextId === null) break;
        const item = queue.get(nextId);
        t = Math.max(t, item.at);
        if (item.every) item.at = t + item.every;
        else queue.delete(nextId);
        item.cb();
        await clock.settle();
      }
      t = end;
      await clock.settle();
    },
  };
  return clock;
}

/**
 * A fetch that answers from `route(url, init)`, which returns a Response, throws, or (a function)
 * returns a promise that never settles. `requests` lists every call: { url, init }.
 */
export function fakeFetch(route) {
  const requests = [];
  const fn = async (url, init) => {
    requests.push({ url, init });
    return route(String(url), init);
  };
  fn.requests = requests;
  return fn;
}

export const text = (body, contentType = 'text/xml') => new Response(body, { status: 200, headers: { 'content-type': contentType } });
export const png = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
export const json = (body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
export const fail = () => new Response('no', { status: 503 });
