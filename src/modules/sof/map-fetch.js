// Every request the SOF map makes goes through here (SPEC-sof, "Security" and R4): a
// timeout, a cap on how many bytes are read, no cookies (`credentials: 'omit'`), and it
// ends when the module does. Replies are untrusted, so the body is read as bytes up to
// the cap and the caller checks what is in them.
//
// It uses the module's scheduler scope for the timeout, so leaving the screen cancels it
// like every other timer. No page is needed: `fetch` comes in.

/** The caps: seconds to wait and bytes to read, by what is being asked for. */
export const FETCH_LIMITS = Object.freeze({
  layerTimes: Object.freeze({ timeoutMs: 15_000, maxBytes: 256 * 1024 }), // a per-layer capabilities reply is about 20 KB
  image: Object.freeze({ timeoutMs: 20_000, maxBytes: 4 * 1024 * 1024 }), // a 2048 px transparent PNG is far smaller
  json: Object.freeze({ timeoutMs: 15_000, maxBytes: 256 * 1024 }), // RainViewer's list is about 2 KB
  traffic: Object.freeze({ timeoutMs: 30_000, maxBytes: Math.ceil(1.25 * 1024 * 1024) }), // the relay's own cap is 1 MB
});

/** Why a request failed: 'timeout', 'too-big', 'status', 'aborted' or 'network'. */
export class MapFetchError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'MapFetchError';
    this.code = code;
  }
}

/**
 * Asks for `url` and returns { bytes: Uint8Array, contentType } once the whole reply, no more
 * than `maxBytes`, has arrived. Throws MapFetchError.
 *
 * - fetch: the browser's fetch (or a fake).
 * - timers: a scheduler scope (`after`); the request is given up on after `timeoutMs`.
 * - signal: ends the request when it aborts (the module closing).
 * - accept: the Accept header, if any.
 */
export async function guardedFetch(fetch, url, { timers, signal, timeoutMs, maxBytes, accept } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new RangeError('guardedFetch needs a timeout and a byte cap');
  }
  if (signal?.aborted) throw new MapFetchError('aborted');
  const controller = new AbortController();
  let why = null;
  const stop = (code) => {
    why ??= code;
    controller.abort();
  };
  const onAbort = () => stop('aborted');
  signal?.addEventListener('abort', onAbort, { once: true });
  const cancelTimer = timers.after(timeoutMs, () => stop('timeout'));
  try {
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'default',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        headers: accept ? { accept } : undefined,
      });
    } catch (err) {
      throw new MapFetchError(why ?? 'network', String(err?.message ?? err));
    }
    if (!response.ok) {
      response.body?.cancel?.().catch?.(() => {});
      throw new MapFetchError('status', `status ${response.status}`);
    }
    const contentType = response.headers?.get?.('content-type') ?? '';
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.body?.cancel?.().catch?.(() => {});
      throw new MapFetchError('too-big');
    }
    return { bytes: await readCapped(response, maxBytes, () => why), contentType };
  } finally {
    cancelTimer();
    signal?.removeEventListener('abort', onAbort);
  }
}

async function readCapped(response, maxBytes, why) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    // No stream (a test double): read it whole, then check.
    const all = new Uint8Array(await response.arrayBuffer());
    if (all.length > maxBytes) throw new MapFetchError('too-big');
    return all;
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new MapFetchError('too-big');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof MapFetchError) throw err;
    throw new MapFetchError(why() ?? 'network', String(err?.message ?? err));
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Bytes as text (UTF-8). */
export const bytesToText = (bytes) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

/** Whether the reply says it is a PNG image (a WMS error comes back as XML with a 200). */
export const isPng = (contentType, bytes) =>
  /^image\/png\b/i.test(contentType ?? '')
  && bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
