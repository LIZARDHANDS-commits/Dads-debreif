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
export async function guardedFetch(fetch, url, { timers, signal, timeoutMs, maxBytes, accept } = /** @type {any} */ ({})) {
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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]; // the last chunk of every whole PNG
/** No picture the map asks for is bigger than this on a side (feeds.js allows 16 to 2048). */
export const MAX_PICTURE_SIDE = 2048;

const bigEndian = (bytes, at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

/** The width and height a PNG's IHDR says (bytes 16 to 23, big-endian), or null when it does not start like a PNG. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  // The first chunk must be IHDR, 13 bytes long.
  if (bigEndian(bytes, 8) !== 13 || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  return { width: bigEndian(bytes, 16), height: bigEndian(bytes, 20) };
}

/**
 * Whether the reply is a PNG image (a WMS error comes back as XML with a 200). With `expected`
 * ({ width, height }, what the address asked for) it must also say that size in its header, never
 * above 2048 on a side (a small file can claim to decode to gigabytes), and end with the PNG's own
 * IEND trailer (a picture cut off in transit decodes with transparent rows, which read as a clear
 * sky). The header is read before anything decodes the picture.
 */
export function isPng(contentType, bytes, expected) {
  if (!/^image\/png\b/i.test(contentType ?? '')) return false;
  if (!bytes || bytes.length <= 8) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  if (expected === undefined) return true;
  const size = pngSize(bytes);
  if (!size) return false;
  const { width, height } = size;
  if (width < 1 || height < 1 || width > MAX_PICTURE_SIDE || height > MAX_PICTURE_SIDE) return false;
  if (width !== expected.width || height !== expected.height) return false;
  if (bytes.length < PNG_IEND.length + 33) return false;
  const tail = bytes.length - PNG_IEND.length;
  for (let i = 0; i < PNG_IEND.length; i++) if (bytes[tail + i] !== PNG_IEND[i]) return false;
  return true;
}
