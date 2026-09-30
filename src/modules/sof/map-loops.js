// The two loops on the SOF map that are not pictures for the view (SPEC-sof, "Map"):
// the near-home lightning reading, and the live-traffic layer through our own relay.
// No page: `fetch`, the clock, the timers (a scheduler scope) and the picture reader come in.
import { LAYERS, getMapUrl, REFRESH_MS } from './feeds.js';
import { createImageFeed, feedLine } from './map-feeds.js';
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { lightningBox, decodeDensity } from './map-lightning.js';
import { lightningNearHome } from './lightning.js';
import {
  initialTraffic, setTrafficOn, trafficDue, trafficRequested, trafficSucceeded, trafficFailed, trafficView,
} from './traffic.js';

/** A position this old has started to fade (traffic.js TRAFFIC_DEFAULTS.fadeStartS, 20 s): the view is redone every second from here. */
const FADING_AFTER_MS = 20_000;

// ---- Lightning near home ----------------------------------------------------------------------------------

/**
 * The near-home lightning check (SOF-3), on its own fixed box around home (map-lightning.js),
 * read every 10 minutes whether or not the lightning layer is showing.
 *
 * - home(): { icao, lat, lon }. radiusNm(): the setting. enabled: SOF-3's switch (default on).
 * - readPixels(bytes): the picture as { data, width, height } (a canvas's getImageData), a promise.
 * - fetch, timers, now, onChange as createImageFeed.
 *
 * When the last try failed, or nothing has been read yet, lightning.js is given `null` for its
 * samples, so it says it can't tell rather than "clear".
 * Returns { start, setPlace, refresh, wake, stop, result, line, state }.
 */
export function createLightningWatch({ home, radiusNm, enabled = true, readPixels, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let box = null;
  let episode = null;

  const feed = createImageFeed({
    layer: LAYERS.lightning,
    kind: 'lightning',
    // The box goes out in latitude and longitude, two pixels to a cell each way.
    urlFor: ({ layer, request, time }) => getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, crs: 'EPSG:4326', time }),
    decode: async (bytes) => decodeDensity(await readPixels(bytes), box),
    refreshMs: REFRESH_MS.lightning,
    fetch,
    timers,
    now,
    onChange,
  });

  function setPlace() {
    const next = lightningBox({ home: home(), radiusNm: radiusNm() });
    const same = next && box && next.width === box.width && next.bounds.west === box.bounds.west && next.bounds.south === box.bounds.south;
    if (same) return;
    box = next;
    if (!box) {
      feed.setRequest(null);
      return;
    }
    const { west, south, east, north } = box.bounds;
    feed.setRequest({ bbox: [west, south, east, north], width: box.width, height: box.height, key: `${west},${south},${east},${north},${box.width}` });
  }

  return {
    /** Starts asking now, and every 10 minutes. */
    start() {
      setPlace();
      feed.enable(enabled);
    },
    /** Home or the radius changed: read the new box. */
    setPlace,
    refresh: () => feed.refresh(),
    wake: () => feed.wake(),
    stop: () => feed.stop(),
    /** lightning.js's answer now (`lightningNearHome`), keeping its episode from one call to the next. */
    result(at = now()) {
      const s = feed.state();
      const data = s.failures === 0 && s.image ? s.image : null; // a failed try is "no data", never "clear"
      const answer = lightningNearHome({
        samples: data ? data.samples : null,
        coverage: data ? data.coverage : undefined,
        home: home(),
        radiusNm: radiusNm(),
        layerTime: s.layerTime ?? undefined,
        now: at,
        enabled,
        episode,
      });
      episode = answer.episode;
      return answer;
    },
    /** The reading's own line for the status strip. */
    line(at = now()) {
      const s = feed.state();
      return feedLine({ label: 'Lightning', kind: 'lightning', on: enabled, hasImage: Boolean(s.image), layerTime: s.layerTime, failed: s.failures > 0 && !s.busy, busy: s.busy, now: at });
    },
    state: () => feed.state(),
  };
}

// ---- Traffic through the relay ------------------------------------------------------------------------------

/**
 * The traffic layer's loop (SPEC-sof, "Live traffic layer"): while on, a poll each second asks the
 * relay when traffic.js says it is due (every 10 s), with a 30 s timeout, a size cap and no cookies.
 * The request's number goes back to trafficSucceeded and trafficFailed, so a late answer never
 * brings the layer back. Off, or stop(), ends the poll and any request at once (R4).
 *
 * - address(): the relay's request address (traffic.js `trafficUrl`) or null when it isn't set.
 * - options(): { label, militaryOnly } for the view.
 * Returns { setOn, stop, view(at), state }.
 */
export function createTrafficFeed({ address, options = () => ({}), fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let state = initialTraffic();
  let controller = new AbortController();
  let cancelPoll = null;
  let stopped = false;
  let cached = null;

  const changed = () => {
    cached = null;
    if (!stopped) onChange();
  };

  async function ask() {
    const url = address();
    if (!url) return;
    state = trafficRequested(state, { now: now() });
    const id = state.pendingId;
    const mine = controller;
    changed();
    let text = null;
    try {
      const reply = await guardedFetch(fetch, url, { timers, signal: mine.signal, accept: 'application/json', ...FETCH_LIMITS.traffic });
      text = bytesToText(reply.bytes);
    } catch {
      if (mine.signal.aborted || stopped) return; // off, or the module closed: nothing to say
    }
    if (mine !== controller || stopped) return;
    state = text === null ? trafficFailed(state, { now: now(), id }) : trafficSucceeded(state, { reply: text, now: now(), id });
    changed();
  }

  function tick() {
    if (stopped) return;
    if (trafficDue(state, now())) ask();
    // Positions fade once they are old, so a relay that has gone quiet is drawn fading, second by second.
    else if (state.lastGood && +now() - state.receivedAt > FADING_AFTER_MS) changed();
  }

  return {
    /** Switches the layer on (asks at once) or off (forgets everything, ends the request). */
    setOn(on) {
      if (stopped) return;
      const want = on === true;
      if (want === state.on) return;
      state = setTrafficOn(state, want, { now: now() });
      if (want) {
        cancelPoll = timers.every(1000, tick);
        tick();
      } else {
        cancelPoll?.();
        cancelPoll = null;
        controller.abort();
        controller = new AbortController();
      }
      changed();
    },
    /** Redoes the view now (the label or military-only choice changed, or a tick of the screen's clock). */
    touch: changed,
    stop() {
      stopped = true;
      cancelPoll?.();
      cancelPoll = null;
      controller.abort();
    },
    /** What to draw and say now (traffic.js `trafficView`), kept until something changes. */
    view(at = now()) {
      const key = +at;
      if (cached && cached.key === key) return cached.view;
      const view = trafficView(state, { now: at, ...options() });
      cached = { key, view };
      return view;
    },
    state: () => state,
  };
}
