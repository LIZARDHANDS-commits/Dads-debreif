// Checks: the guarded fetch every map request uses: timeout, byte cap, no cookies, abort, and PNG reading.
// Serves: SOF-R2, SOF-R23, SOF-R24.
// Expected values: hand-written; PNG bytes built in map-testkit.js; limits are FETCH_LIMITS from the code (design
//   choice); the clock is turned by hand.

// Tests for src/modules/sof/map-fetch.js: the timeout, the byte cap, no cookies and
// the abort that every SOF map request has (SPEC-sof, Security; R4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardedFetch, MapFetchError, FETCH_LIMITS, bytesToText, isPng, pngSize } from '../../../src/modules/sof/map-fetch.js';
import { pngBytes } from './map-testkit.js';

// A scheduler scope stand-in whose clock the test turns by hand.
function fakeTimers() {
  const pending = new Set();
  return {
    after(ms, cb) {
      const t = { ms, cb };
      pending.add(t);
      return () => pending.delete(t);
    },
    fire() {
      for (const t of [...pending]) {
        pending.delete(t);
        t.cb();
      }
    },
    get count() {
      return pending.size;
    },
  };
}

const LIMIT = { timeoutMs: 1000, maxBytes: 100 };
const ok = (body, headers = {}) => async () => new Response(body, { status: 200, headers });
const code = async (promise) => {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof MapFetchError, String(err));
    return err.code;
  }
  return 'none';
};

test('a good reply comes back as bytes with its content type, and its timer is cleared', async () => {
  const timers = fakeTimers();
  const { bytes, contentType } = await guardedFetch(ok('hello', { 'content-type': 'text/plain' }), 'https://x.test/a', { timers, ...LIMIT });
  assert.equal(bytesToText(bytes), 'hello');
  assert.equal(contentType, 'text/plain');
  assert.equal(timers.count, 0, 'no timer left behind');
});

test('every request omits cookies and sends no referrer, and is given a signal', async () => {
  let seen;
  await guardedFetch(async (url, init) => { seen = { url, init }; return new Response('x'); }, 'https://x.test/a', { timers: fakeTimers(), ...LIMIT, accept: 'image/png' });
  assert.equal(seen.url, 'https://x.test/a');
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.referrerPolicy, 'no-referrer');
  assert.ok(seen.init.signal instanceof AbortSignal);
  assert.deepEqual(seen.init.headers, { accept: 'image/png' });
});

test('a reply over the cap is refused, whether it says so up front or only shows it while streaming', async () => {
  const timers = fakeTimers();
  assert.equal(await code(guardedFetch(ok('x'.repeat(101)), 'u', { timers, ...LIMIT })), 'too-big', 'no length given');
  assert.equal(await code(guardedFetch(ok('x', { 'content-length': '5000' }), 'u', { timers, ...LIMIT })), 'too-big', 'length given');
  const bytes = await guardedFetch(ok('x'.repeat(100)), 'u', { timers, ...LIMIT });
  assert.equal(bytes.bytes.length, 100, 'exactly the cap is fine');
  assert.equal(timers.count, 0);
});

test('a stream that never ends is stopped at the cap, not read to the end', async () => {
  let cancelled = false;
  let pulled = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(new Uint8Array(60));
    },
    cancel() { cancelled = true; },
  });
  const c = await code(guardedFetch(async () => new Response(body), 'u', { timers: fakeTimers(), ...LIMIT }));
  assert.equal(c, 'too-big');
  assert.equal(cancelled, true);
  assert.ok(pulled < 10);
});

test('an HTTP error status is a failure', async () => {
  assert.equal(await code(guardedFetch(async () => new Response('no', { status: 503 }), 'u', { timers: fakeTimers(), ...LIMIT })), 'status');
});

test('a request that fails at the network is a failure', async () => {
  assert.equal(await code(guardedFetch(async () => { throw new TypeError('offline'); }, 'u', { timers: fakeTimers(), ...LIMIT })), 'network');
});

test('a request that takes too long is aborted at the timeout', async () => {
  const timers = fakeTimers();
  let signal;
  const never = (url, init) => new Promise((resolve, reject) => {
    signal = init.signal;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const pending = code(guardedFetch(never, 'u', { timers, ...LIMIT }));
  await Promise.resolve();
  assert.equal(timers.count, 1);
  timers.fire();
  assert.equal(await pending, 'timeout');
  assert.equal(signal.aborted, true);
});

test('a body that stalls half way is also stopped by the timeout', async () => {
  const timers = fakeTimers();
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; c.enqueue(new Uint8Array(5)); } });
  const pending = code(guardedFetch(async (url, init) => {
    init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    return new Response(body);
  }, 'u', { timers, ...LIMIT }));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  timers.fire();
  assert.equal(await pending, 'timeout');
});

test('the module closing (the caller\'s signal) aborts a request in flight, and one already aborted never starts', async () => {
  const timers = fakeTimers();
  const closing = new AbortController();
  let asked = 0;
  const never = (url, init) => new Promise((resolve, reject) => {
    asked += 1;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const pending = code(guardedFetch(never, 'u', { timers, signal: closing.signal, ...LIMIT }));
  await Promise.resolve();
  closing.abort();
  assert.equal(await pending, 'aborted');
  assert.equal(timers.count, 0, 'its timer goes with it');
  assert.equal(await code(guardedFetch(never, 'u', { timers, signal: closing.signal, ...LIMIT })), 'aborted');
  assert.equal(asked, 1, 'no second request was made');
});

test('a timeout and a cap are required, so none can be forgotten', async () => {
  for (const bad of [{}, { timeoutMs: 1000 }, { maxBytes: 10 }, { timeoutMs: 0, maxBytes: 10 }, { timeoutMs: 1000, maxBytes: NaN }]) {
    await assert.rejects(guardedFetch(ok('x'), 'u', { timers: fakeTimers(), ...bad }), RangeError);
  }
});

test('the limits for each kind of request are set: traffic 30 s, every cap finite', () => {
  assert.equal(FETCH_LIMITS.traffic.timeoutMs, 30_000);
  for (const [kind, { timeoutMs, maxBytes }] of Object.entries(FETCH_LIMITS)) {
    assert.ok(timeoutMs > 0 && Number.isFinite(maxBytes) && maxBytes > 0, kind);
  }
});

test('isPng wants the image type and the PNG signature (a WMS error is XML in a 200)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(isPng('image/png', png), true);
  assert.equal(isPng('image/png; charset=x', png), true);
  assert.equal(isPng('text/xml', png), false);
  assert.equal(isPng('image/png', new TextEncoder().encode('<ServiceExceptionReport>')), false);
  assert.equal(isPng(null, png), false);
});

// ---- A picture must be the picture that was asked for (R1) ---------------------------------------------

test('pngSize reads the width and height from the IHDR, big-endian, and nothing else', () => {
  assert.deepEqual(pngSize(pngBytes(900, 700)), { width: 900, height: 700 });
  assert.deepEqual(pngSize(pngBytes(65535, 65536)), { width: 65535, height: 65536 });
  assert.equal(pngSize(new Uint8Array(10)), null);
  const wrongChunk = pngBytes(10, 10);
  wrongChunk[12] = 0x58; // the first chunk is not IHDR
  assert.equal(pngSize(wrongChunk), null);
});

test('a picture of the size asked for, with its IEND trailer, is accepted', () => {
  assert.equal(isPng('image/png', pngBytes(900, 700), { width: 900, height: 700 }), true);
  assert.equal(isPng('image/png', pngBytes(2048, 2048), { width: 2048, height: 2048 }), true);
});

test('a decompression bomb\'s header is refused before anything decodes it', () => {
  // 65535 x 65535 in a few dozen bytes: decoding it would ask for 16 GB
  assert.equal(isPng('image/png', pngBytes(65535, 65535), { width: 900, height: 700 }), false);
  assert.equal(isPng('image/png', pngBytes(65535, 65535), { width: 65535, height: 65535 }), false, 'never above 2048, even if it was "asked for"');
  assert.equal(isPng('image/png', pngBytes(2049, 10), { width: 2049, height: 10 }), false);
  assert.equal(isPng('image/png', pngBytes(0, 0), { width: 0, height: 0 }), false);
});

test('a picture of another size than asked for is refused', () => {
  assert.equal(isPng('image/png', pngBytes(899, 700), { width: 900, height: 700 }), false);
  assert.equal(isPng('image/png', pngBytes(900, 701), { width: 900, height: 700 }), false);
  assert.equal(isPng('image/png', pngBytes(700, 900), { width: 900, height: 700 }), false);
});

test('a picture without its IEND trailer in the last 12 bytes (cut off in transit) is refused', () => {
  assert.equal(isPng('image/png', pngBytes(900, 700, { iend: false }), { width: 900, height: 700 }), false);
  const trailing = new Uint8Array([...pngBytes(900, 700), 0]); // something after the trailer
  assert.equal(isPng('image/png', trailing, { width: 900, height: 700 }), false);
  const wrongTrailer = pngBytes(900, 700);
  wrongTrailer[wrongTrailer.length - 1] ^= 1;
  assert.equal(isPng('image/png', wrongTrailer, { width: 900, height: 700 }), false);
});

// ---- Redirects (Y5) ----------------------------------------------------------------------------------

test('a request is never allowed to follow a redirect: the browser is told to fail on one', async () => {
  let seen;
  await guardedFetch(async (url, init) => { seen = init; return new Response('x'); }, 'https://x.test/a', { timers: fakeTimers(), ...LIMIT });
  assert.equal(seen.redirect, 'error');
});

test('a reply that came from another origin than the one asked is refused, in case a redirect got through', async () => {
  const from = (url) => async () => {
    const r = new Response('secret', { status: 200 });
    Object.defineProperty(r, 'url', { value: url });
    return r;
  };
  assert.equal(await code(guardedFetch(from('https://evil.test/a'), 'https://x.test/a', { timers: fakeTimers(), ...LIMIT })), 'redirect');
  assert.equal(await code(guardedFetch(from('http://x.test/a'), 'https://x.test/a', { timers: fakeTimers(), ...LIMIT })), 'redirect');
  // the same origin (a different path is fine: only the origin must not change) and an unset url (a test double) are accepted
  assert.equal(await code(guardedFetch(from('https://x.test/b'), 'https://x.test/a', { timers: fakeTimers(), ...LIMIT })), 'none');
  assert.equal(await code(guardedFetch(ok('x'), 'https://x.test/a', { timers: fakeTimers(), ...LIMIT })), 'none');
});
