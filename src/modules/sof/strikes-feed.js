// The NOAA lightning strikes feed (SOF-71, SOF-R30; spec "Lightning strikes from NOAA at every base"): NOAA MRMS's NLDN one-minute cloud-to-ground files from the
// public bucket the 3D radar reads (mrms-model.js), read by our own GRIB2 reader in a background worker (`decode`, mrms-worker.js). Runs while the SOF is open at a
// base whose site profile names the source, hidden tab included: the near-home check rests on it, as the ECCC check does (spec "Refresh").
//
// The first read lists the last 30 minutes and takes up to 30 files, newest first, so the near-home answer comes first (onChange after each file); after that each
// refresh, every 2 minutes, lists only the files after the last key listed. A file that could not be fetched (no connection, a timeout) is asked again at the next
// refresh while it is inside the 30 minutes; a file that fails its checks (MRMS's grid, the field's numbers, its time against its name, values 0 to 1,000) is skipped
// and named (strikes-model.js `skippedLine`), never asked again. What was read is kept for 30 minutes by each file's own time; whether it is shown is decided against
// the clock (strikes-model.js: not after the newest file is 10 minutes old).
//
// Untrusted replies, as the radar's (spec): the listing is size-capped and read with the strict pattern (mrms-model.js `parseListing`), file addresses are built only
// from the fixed host and keys that passed it, every request has a timeout and a byte cap and sends no cookies and follows no redirect (map-fetch.js `guardedFetch`).
import { guardedFetch } from './map-fetch.js';
import { REFRESH_MS } from './feeds.js';
import { fetchWords } from './mrms-feed.js';
import { MAX_LIST_BYTES, LIST_TIMEOUT_MS, listingUrls, parseListing, fileUrl } from './mrms-model.js';
import {
  STRIKES_PRODUCT, HOLD_MS, FIRST_FILES, MAX_KEPT_STRIKES, MAX_STRIKE_FILE_BYTES, STRIKE_FILE_TIMEOUT_MS, strikesTarget,
} from './strikes-model.js';

/** A file time this far ahead of the clock is a wrong clock or a bad reply, as mrms-model.js (5 minutes). */
const SKEW_MS = 5 * 60_000;

/**
 * - fetch, timers (a scheduler scope: after, every), now () => Date: as the other feeds.
 * - decode(request) => Promise<reply>: the worker; `request` is { gz: ArrayBuffer, product, nameTime, target, layout: 'strikes' } and the reply mrms-model.js
 *   `decodeFile`'s ({ ok: true, time, strikes } or { ok: false, reason }). A rejected promise (the worker failed) is treated as a fetch failure: asked again.
 * - home() => { icao, lat, lon }: the square is round it; a new home starts everything over (setPlace()).
 * - onChange() after anything the lines or the map show changes.
 * Returns { start(), stop(), setPlace(), refresh(), wake(), held(), dispose() }. `held()` is strikes-model.js's `held`.
 */
export function createStrikesFeed({ fetch, timers, now = () => new Date(), decode, home, onChange = () => {}, refreshMs = REFRESH_MS.strikes }) {
  let enabled = false;
  let disposed = false;
  let busy = false;
  let run = null; // the AbortController of the update under way
  let cancelNext = null;
  let lastRunAt = null;
  let place = null; // the home the files below were read for
  let files = new Map(); // key -> { key, time, strikes }
  let pending = new Map(); // key -> { key, time, size }: listed, not read yet (or its fetch failed)
  let refused = new Map(); // key -> { key, time, reason }: failed its checks, skipped and named
  let lastKey = null; // the newest key listed, for the next listing's start-after
  let failure = null; // words for the last update's failure (listing or a file's fetch), or null
  let rounds = 0; // updates finished for this home: the first read comes a file at a time, and until it has finished it is still loading
  let cached = null;

  const placeOf = (h) => (h && Number.isFinite(h.lat) && Number.isFinite(h.lon) ? `${h.lat.toFixed(4)},${h.lon.toFixed(4)}` : null);
  const changed = () => {
    cached = null;
    if (!disposed) onChange();
  };

  function reset(next) {
    place = next;
    files = new Map();
    pending = new Map();
    refused = new Map();
    lastKey = null;
    failure = null;
    rounds = 0;
  }

  /** Forgets what is older than the 30 minutes kept, and the oldest files past the strikes cap. */
  function prune(t) {
    for (const map of [files, pending, refused]) for (const [key, f] of map) if (t - f.time > HOLD_MS) map.delete(key);
    let total = 0;
    for (const f of [...files.values()].sort((a, b) => b.time - a.time)) {
      total += f.strikes.length;
      if (total > MAX_KEPT_STRIKES) files.delete(f.key);
    }
  }

  function schedule(ms) {
    cancelNext?.();
    cancelNext = null;
    if (!enabled || disposed) return;
    cancelNext = timers.after(ms, () => {
      cancelNext = null;
      update();
    });
  }

  async function update() {
    if (!enabled || disposed || busy) return;
    const h = home();
    const where = placeOf(h);
    if (where === null) return;
    if (where !== place) reset(where);
    busy = true;
    lastRunAt = +now();
    const controller = new AbortController();
    run = controller;
    const { signal } = controller;
    let failed = null;
    const t = +now();
    prune(t);
    changed();
    try {
      // The files after the last key listed (the last 30 minutes the first time).
      const listed = [];
      for (const url of listingUrls(STRIKES_PRODUCT, t, { lookbackMs: HOLD_MS, afterKey: lastKey })) {
        const reply = await guardedFetch(fetch, url, { timers, signal, timeoutMs: LIST_TIMEOUT_MS, maxBytes: MAX_LIST_BYTES, accept: 'application/xml' });
        listed.push(...parseListing(new TextDecoder().decode(reply.bytes), STRIKES_PRODUCT));
      }
      for (const f of listed) {
        if (f.time - t > SKEW_MS || t - f.time > HOLD_MS) continue; // ahead of the clock, or older than what is kept
        if (lastKey === null || f.key > lastKey) lastKey = f.key; // keys of one product sort by their time (day folder, then the name's time)
        if (!files.has(f.key) && !refused.has(f.key)) pending.set(f.key, f);
      }
    } catch (err) {
      if (!signal.aborted) failed = fetchWords(err);
    }
    // Newest first, so the last 10 minutes (the near-home check) come in first.
    const queue = [...pending.values()].sort((a, b) => b.time - a.time).slice(0, FIRST_FILES);
    const target = strikesTarget(h);
    for (const f of queue) {
      if (signal.aborted || disposed) break;
      if (f.size > MAX_STRIKE_FILE_BYTES) {
        pending.delete(f.key);
        refused.set(f.key, { key: f.key, time: f.time, reason: `file too big (${Math.round(f.size / 1024)} KB)` });
        changed();
        continue;
      }
      let reply;
      try {
        const got = await guardedFetch(fetch, fileUrl(f.key), { timers, signal, timeoutMs: STRIKE_FILE_TIMEOUT_MS, maxBytes: MAX_STRIKE_FILE_BYTES });
        if (signal.aborted) break;
        const gz = got.bytes.buffer.slice(got.bytes.byteOffset, got.bytes.byteOffset + got.bytes.byteLength);
        reply = await decode({ gz, product: STRIKES_PRODUCT, nameTime: f.time, target, layout: 'strikes' });
      } catch (err) {
        if (signal.aborted) break;
        failed ??= err instanceof Error && err.message.startsWith('worker') ? 'decoder failed' : fetchWords(err); // left pending: asked again next time
        continue;
      }
      if (signal.aborted || placeOf(home()) !== place) break;
      pending.delete(f.key);
      if (reply?.ok && Array.isArray(reply.strikes)) files.set(f.key, { key: f.key, time: reply.time, strikes: reply.strikes });
      else refused.set(f.key, { key: f.key, time: f.time, reason: reply?.reason ?? 'file could not be read' });
      changed(); // the near-home answer as soon as each minute is in
    }
    busy = false;
    run = null;
    if (disposed) return;
    if (signal.aborted) {
      if (enabled) update(); // stopped for a new home: start over at once
      return;
    }
    prune(+now());
    // An answer with nothing in it (an empty listing, every file skipped) is not "no lightning": it is said as a failure, so the lines read "unavailable".
    failure = failed ?? (files.size === 0 ? (refused.size ? 'every file in the last 30 minutes failed its checks' : 'no file listed in the last 30 minutes') : null);
    rounds += 1;
    schedule(refreshMs);
    changed();
  }

  return {
    /** Starts asking now, and every 2 minutes (nothing changes when it is already on). */
    start() {
      if (disposed || enabled) return;
      enabled = true;
      update();
    },
    /** Stops asking; what was read is kept (it is shown only while fresh). */
    stop() {
      enabled = false;
      cancelNext?.();
      cancelNext = null;
      run?.abort();
    },
    /** Home changed: the update under way stops, everything read for the old home goes, and a new first read starts. */
    setPlace() {
      if (disposed) return;
      const where = placeOf(home());
      if (where === place) return;
      reset(where);
      cached = null;
      if (!enabled) return;
      cancelNext?.();
      cancelNext = null;
      if (run) run.abort();
      else update();
      changed();
    },
    /** Asks again now. */
    refresh() {
      if (!enabled || disposed || busy) return;
      cancelNext?.();
      cancelNext = null;
      update();
    },
    /** The tab is back or the computer woke: asks now if the last ask is older than the refresh time. */
    wake() {
      if (!enabled || busy || disposed) return;
      if (lastRunAt === null || +now() - lastRunAt >= refreshMs) {
        cancelNext?.();
        cancelNext = null;
        update();
      }
    },
    /** What was read, for strikes-model.js (see its header): kept until something changes. */
    held() {
      if (cached) return cached;
      const list = [...files.values()];
      cached = Object.freeze({
        files: list,
        newest: list.length ? Math.max(...list.map((f) => f.time)) : null,
        refused: [...refused.values()],
        failure,
        busy,
        rounds,
      });
      return cached;
    },
    dispose() {
      disposed = true;
      enabled = false;
      cancelNext?.();
      cancelNext = null;
      run?.abort();
      reset(null);
      cached = null;
    },
  };
}
