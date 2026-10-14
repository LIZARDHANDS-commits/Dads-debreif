// The NOAA MRMS feed for the SOF's 3D radar with its real heights (SOF-67, SOF-R29; spec "3D view", "Radar with its real heights"). Asked only while the 3D view is
// open: at once, then every REFRESH_MS.radar (6 minutes, D67), never while the tab is hidden. Each update finds the newest file of each product the mode needs in the
// bucket's folder listing, fetches it (size-capped, timed out) and hands it to the background worker (`decode`, mrms-worker.js) one at a time; the network for the next
// file runs while the last is read.
//
// Failure, stale and untrusted replies (spec, a safety item): a file that is missing, late, too big, corrupt or fails a check fails its update with a reason in words;
// the last good set stays, labelled with its time, until it is STALE_MS.radar (20 minutes) old; then, or with nothing good yet, the view falls back to the flat radar
// in the model cloud (SOF-56) and says why. A High height that fails leaves a named gap; three or more failed heights drop that update to Performance, said in words.
// Nothing here is frozen: every view is worked out against the clock.
import { guardedFetch, MapFetchError } from './map-fetch.js';
import { STALE_MS, REFRESH_MS } from './feeds.js';
import {
  MODE_PRODUCTS, HIGH_LEVELS_KM, HIGH_FAILS_TO_PERFORMANCE, MAX_FILE_BYTES, MAX_LIST_BYTES, LIST_TIMEOUT_MS, FILE_TIMEOUT_MS, DEFAULT_RADAR_DETAIL,
  listingUrls, parseListing, newestFile, fileUrl, targetFor, heightsLine, fallbackWords, hhmmZ, levelsWords,
} from './mrms-model.js';

/** A request failure in plain words for the key. */
function fetchWords(err) {
  if (err instanceof MapFetchError) {
    if (err.code === 'timeout') return 'timed out';
    if (err.code === 'too-big') return 'reply too big';
    if (err.code === 'status') return `HTTP ${err.status}`;
    if (err.code === 'redirect') return 'reply came from another place';
    if (err.code === 'aborted') return 'stopped';
    return 'no connection';
  }
  return err?.reason ?? 'request failed';
}

/** At most this many products are being fetched at once (the worker still reads one at a time). An estimate, kind to the browser's connection limit. */
const AT_ONCE = 3;

/**
 * - fetch, timers (a scheduler scope), now () => Date: as the other feeds.
 * - decode(request) => Promise<reply>: the worker (mrms-worker.js); `request` is { gz: ArrayBuffer, product, nameTime, target, layout }.
 * - square() => { lat, lon, halfFt }: the 3D square round home now; mode() => 'performance' | 'high' (the "3D radar detail" setting).
 * - paused() => true while the tab is hidden; onChange() after anything the view shows changes.
 * Returns { start(), stop(), refresh(), wake(), view(now), dispose() }.
 */
export function createMrmsFeed({ fetch, timers, now = () => new Date(), decode, square, mode = () => DEFAULT_RADAR_DETAIL, paused = () => false, onChange = () => {}, staleMs = STALE_MS.radar, refreshMs = REFRESH_MS.radar }) {
  let enabled = false;
  let busy = false;
  let run = null; // { controller, key } of the update in progress
  let cancelNext = null;
  let lastGood = null; // the set on screen: see `assemble`
  let failure = null; // { reason, at } of the last update that failed, cleared by a good one
  let lastRunAt = null;
  let disposed = false;
  let serial = 0;

  const squareKey = (sq, m) => `${sq.lat.toFixed(4)},${sq.lon.toFixed(4)}|${Math.round(sq.halfFt)}|${m}`;
  const placeKey = (sq) => `${sq.lat.toFixed(4)},${sq.lon.toFixed(4)}|${Math.round(sq.halfFt)}`;
  const changed = () => {
    if (!disposed) onChange();
  };

  function schedule(ms) {
    cancelNext?.();
    cancelNext = null;
    if (!enabled || disposed) return;
    cancelNext = timers.after(ms, () => {
      cancelNext = null;
      update();
    });
  }

  /** The newest file of one product, fetched: { bytes, key, time } or throws an Error with a `reason`. */
  async function getFile(p, signal) {
    const t = +now();
    const files = [];
    for (const url of listingUrls(p, t)) {
      const reply = await guardedFetch(fetch, url, { timers, signal, timeoutMs: LIST_TIMEOUT_MS, maxBytes: MAX_LIST_BYTES, accept: 'application/xml' });
      files.push(...parseListing(new TextDecoder().decode(reply.bytes), p));
    }
    const pick = newestFile(files, t, staleMs);
    if (!pick.file) throw Object.assign(new Error(pick.reason), { reason: pick.reason });
    const reply = await guardedFetch(fetch, fileUrl(pick.file.key), { timers, signal, timeoutMs: FILE_TIMEOUT_MS, maxBytes: MAX_FILE_BYTES });
    return { bytes: reply.bytes, key: pick.file.key, time: pick.file.time };
  }

  /** Every product of a list fetched (AT_ONCE at a time) and read by the worker in order: [{ product, ok, reply | reason }]. */
  async function readAll(products, target, layout, signal) {
    const results = new Array(products.length);
    const reads = [];
    let next = 0;
    const lane = async () => {
      while (next < products.length) {
        const k = next++;
        const p = products[k];
        try {
          const file = await getFile(p, signal);
          if (signal.aborted) throw Object.assign(new Error('stopped'), { reason: 'stopped' });
          const gz = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength);
          reads.push(decode({ gz, product: p, nameTime: file.time, target, layout }).then(
            (reply) => { results[k] = reply.ok ? { product: p, ok: true, reply } : { product: p, ok: false, reason: reply.reason }; },
            () => { results[k] = { product: p, ok: false, reason: 'decoder failed' }; },
          ));
        } catch (err) {
          results[k] = { product: p, ok: false, reason: fetchWords(err) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, products.length) }, lane));
    await Promise.all(reads);
    return results;
  }

  /** A Performance set from its three results, or { reason } when the composite or the 18 dBZ tops failed (no colour or no height to draw). */
  function performanceSet(results, target) {
    const by = Object.fromEntries(results.map((r) => [r.product.name, r]));
    const [top18, top30, composite] = MODE_PRODUCTS.performance.map((p) => by[p.name]);
    const failed = [composite, top18].find((r) => !r?.ok);
    if (failed) return { reason: `${failed.product.words}: ${failed.reason}` };
    const notes = [];
    if (!top30?.ok) notes.push(`30 dBZ cores not drawn (${top30?.reason ?? 'not read'})`);
    const times = [top18, composite, top30].filter((r) => r?.ok).map((r) => r.reply.time);
    return {
      set: {
        mode: 'performance', n: target.n, halfFt: target.halfFt, lat: target.lat, lon: target.lon,
        composite: composite.reply.cells, top18: top18.reply.cells, top30: top30?.ok ? top30.reply.cells : null,
        time: Math.min(...times), notes,
      },
    };
  }

  /** A High set: the 12 heights in one volume (n x n x 12, row 0 north, level by level), a failed height left empty and named. */
  function highSet(results, target) {
    const { n } = target;
    const plane = n * n;
    const codes = new Uint8Array(plane * HIGH_LEVELS_KM.length);
    const covered = [];
    const shares = [];
    const gaps = [];
    const times = [];
    results.forEach((r, l) => {
      if (r.ok) {
        codes.set(r.reply.codes, l * plane);
        covered.push(r.reply.covered);
        shares.push(r.reply.coveredShare);
        times.push(r.reply.time);
      } else {
        covered.push(null);
        shares.push(null);
        gaps.push({ km: HIGH_LEVELS_KM[l], reason: r.reason });
      }
    });
    const notes = gaps.length ? [`No data at ${levelsWords(gaps.map((g) => g.km))} (${gaps[0].reason}): left empty there, not clear air`] : [];
    return { set: { mode: 'high', n, halfFt: target.halfFt, lat: target.lat, lon: target.lon, codes, covered, shares, levelsKm: HIGH_LEVELS_KM, gaps, time: Math.min(...times), notes } };
  }

  async function update() {
    if (!enabled || disposed) return;
    if (busy) return;
    if (paused()) {
      schedule(refreshMs);
      return;
    }
    busy = true;
    lastRunAt = +now();
    const sq = square();
    const wanted = mode() === 'high' ? 'high' : 'performance';
    const key = squareKey(sq, wanted);
    const controller = new AbortController();
    run = { controller, key };
    changed();
    let outcome;
    try {
      if (wanted === 'high') {
        const target = targetFor('high', sq.lat, sq.lon, sq.halfFt);
        const results = await readAll(MODE_PRODUCTS.high, target, 'level', controller.signal);
        const failed = results.filter((r) => !r.ok);
        if (failed.length >= HIGH_FAILS_TO_PERFORMANCE) {
          // Too many heights missing for a fair picture: this update is drawn in Performance instead, and says so.
          const pTarget = targetFor('performance', sq.lat, sq.lon, sq.halfFt);
          const p = performanceSet(await readAll(MODE_PRODUCTS.performance, pTarget, 'bin', controller.signal), pTarget);
          const why = `High detail dropped to Performance for this update: ${failed.length} of ${HIGH_LEVELS_KM.length} heights failed (${failed[0].reason})`;
          outcome = p.set ? { set: { ...p.set, notes: [why, ...p.set.notes] } } : { reason: `${p.reason}; ${why}` };
        } else outcome = highSet(results, target);
      } else {
        const target = targetFor('performance', sq.lat, sq.lon, sq.halfFt);
        outcome = performanceSet(await readAll(MODE_PRODUCTS.performance, target, 'bin', controller.signal), target);
      }
    } catch (err) {
      outcome = { reason: fetchWords(err) };
    }
    busy = false;
    run = null;
    if (disposed || controller.signal.aborted) {
      if (enabled && !disposed) update(); // stopped for a new square or mode: start over at once
      return;
    }
    if (outcome.set) {
      serial += 1;
      lastGood = { ...outcome.set, id: serial, place: placeKey(sq), receivedAt: +now() };
      failure = null;
    } else failure = { reason: outcome.reason, at: +now() };
    schedule(refreshMs);
    changed();
  }

  return {
    /** The 3D view opened: ask at once (unless a fresh update is under way), then every REFRESH_MS.radar. */
    start() {
      if (disposed || enabled) return;
      enabled = true;
      update();
    },
    /** The 3D view closed: nothing more is asked; the last good set is kept (it is checked against the clock and the square when shown again). */
    stop() {
      enabled = false;
      cancelNext?.();
      cancelNext = null;
      run?.controller.abort();
    },
    /** The square or the mode changed: the update under way stops and a new one starts. */
    refresh() {
      if (!enabled || disposed) return;
      cancelNext?.();
      cancelNext = null;
      if (run) run.controller.abort();
      else update();
    },
    /** The tab is visible again: ask now if the last ask is older than the refresh time. */
    wake() {
      if (!enabled || busy || disposed) return;
      if (lastRunAt === null || +now() - lastRunAt >= refreshMs) update();
    },
    /**
     * What the 3D view shows now: { state, set, line: { text, symbol, tone }, notes, reason, sig }.
     * - state 'ok': a set no older than STALE_MS.radar (20 min), the last update good. 'old': such a set, but the last update failed (labelled with its time).
     *   'loading': nothing to show yet, an update under way. 'failed': nothing fresh to show (nothing good, too old, or for another square): fall back.
     * - set: the set to draw (state 'ok' or 'old'), else null. A set made for another place is never shown.
     */
    view(t = now()) {
      const clock = +t;
      const sq = square();
      const mine = lastGood && lastGood.place === placeKey(sq) ? lastGood : null;
      const fresh = mine && clock - mine.time <= staleMs ? mine : null;
      const notes = fresh ? fresh.notes : [];
      let state;
      let line;
      let reason = null;
      if (fresh && !failure) {
        state = 'ok';
        line = { text: heightsLine(fresh.time, clock), symbol: '✓', tone: 'ok' };
      } else if (fresh) {
        state = 'old';
        reason = failure.reason;
        line = { text: `${heightsLine(fresh.time, clock)}; refresh failed (${failure.reason})`, symbol: '⚠', tone: 'caution' };
      } else if (busy && !failure && !mine) {
        state = 'loading';
        line = { text: 'Radar heights: NOAA MRMS loading; heights from model cloud until it arrives', symbol: '⟳', tone: 'busy' };
      } else {
        state = 'failed';
        reason = failure?.reason ?? (mine ? `last set ${hhmmZ(mine.time)} is over ${Math.round(staleMs / 60_000)} min old` : busy ? 'loading' : 'not asked yet');
        line = { text: fallbackWords(reason), symbol: '⚠', tone: 'bad' };
      }
      const set = state === 'ok' || state === 'old' ? fresh : null;
      return { state, set, line, notes, reason, busy, sig: `${state}:${set?.id ?? 'none'}:${reason ?? ''}:${busy}:${Math.floor(clock / 60_000)}` };
    },
    dispose() {
      disposed = true;
      this.stop();
      lastGood = null;
    },
  };
}
