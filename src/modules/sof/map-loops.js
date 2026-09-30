// The two loops on the SOF map that are not pictures for the view (SPEC-sof, "Map"):
// the near-home lightning reading, and the live-traffic layer through our own relay.
// No page: `fetch`, the clock, the timers (a scheduler scope) and the picture reader come in.
import { LAYERS, getMapUrl, REFRESH_MS } from './feeds.js';
import { createImageFeed, feedLine } from './map-feeds.js';
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { lightningBox, decodeDensity } from './map-lightning.js';
import { lightningNearHome, clampRadius } from './lightning.js';
import { STALE_MS, feedAge } from './feeds.js';
import { MINUTE_MS } from '../../wx/dates.js';
import {
  initialTraffic, setTrafficOn, trafficDue, trafficRequested, trafficSucceeded, trafficFailed, trafficView,
} from './traffic.js';

/** A position this old has started to fade (traffic.js TRAFFIC_DEFAULTS.fadeStartS, 20 s): the view is redone every second from here. */
const FADING_AFTER_MS = 20_000;

// ---- Lightning near home ----------------------------------------------------------------------------------

/** Where the lightning episode is kept, in the module's storage scope (Y2). */
export const EPISODE_KEY = 'lightningEpisode';

/** The stored episode, shape-checked here (lightning.js checks the id and the gap again); null when missing, damaged or storage throws. */
function loadEpisode(store) {
  try {
    const e = store?.get(EPISODE_KEY, null);
    return e && typeof e === 'object' && typeof e.id === 'string' && Number.isFinite(e.lastNearAt) && typeof e.place === 'string'
      ? { id: e.id, lastNearAt: e.lastNearAt, place: e.place }
      : null;
  } catch {
    return null;
  }
}

const episodeSig = (e) => (e ? `${e.id}|${e.lastNearAt}|${e.place}` : '');

/**
 * The near-home lightning check (SOF-3), on its own fixed box around home (map-lightning.js),
 * read every 10 minutes whether or not the lightning layer is showing.
 *
 * - home(): { icao, lat, lon }. radiusNm(): the setting. enabled: SOF-3's switch (default on).
 * - readPixels(bytes): the picture as { data, width, height } (a canvas's getImageData), a promise.
 * - fetch, timers, now, onChange as createImageFeed.
 * - store: the module's storage ({ get, set }), optional. The lightning episode (when it began, when lightning was last seen near,
 *   and for which place) is kept there, so after a reload the same storm has the same caution key and an acknowledgement holds
 *   (Y2 of sof-recheck-207). It is read once at the start, written when it changes, and left alone when storage is missing or throws.
 *
 * When the last try failed, or nothing has been read yet, lightning.js is given `null` for its
 * samples, so it says it can't tell rather than "clear" (`state` 'unknown'). What the banner is
 * told is decided here (SPEC-sof, "Lightning near home", D278 and F1 of sof-recheck-207): a bad or
 * old reading never takes a live caution off it.
 * - Lightning was near at the last good reading, and now the try failed or the picture is stale:
 *   `caution` stays, with the same key (an acknowledgement holds), worded "Lightning within N NM
 *   (can't tell now, last seen M min ago)". A good reading, clear or near, replaces it.
 * - No good reading has been had since the place was set, and a try has failed or the picture is
 *   old: `caution` is a plain "Lightning: can't tell" line, amber, never counted as clear.
 * - After a good clear reading: the same plain line once the picture is past the lightning stale limit, or the
 *   last good reading is that old (a short blip stays on the strip only). Still loading: no line.
 * The held line keeps its own key while it is shown; the episode is not extended, so a storm back after more than the
 * episode gap (lightning.js) is a new caution that re-raises whatever was acknowledged before.
 * Returns { start, setPlace, refresh, wake, stop, result, line, state }.
 */
export function createLightningWatch({ home, radiusNm, enabled = true, readPixels, fetch, timers, now = () => new Date(), store = null, onChange = () => {} }) {
  let box = null;
  let episode = loadEpisode(store); // { id, lastNearAt, place } from before a reload, or null; checked against the place at the first answer
  let saved = episodeSig(episode);
  let lastNear = null; // the caution of the last good reading that had lightning near home
  let lastNearRadius = null; // the radius that reading was for
  let lastGoodAt = null; // when the last good reading (clear or near) was seen, ms
  let gaveReading = false; // a good reading (clear or near) has been had for this place
  let outageSince = null; // when the "can't tell" line began, for its key
  let placeKey = null;

  const feed = createImageFeed({
    layer: LAYERS.lightning,
    kind: 'lightning',
    // The box goes out in latitude and longitude, two pixels to a cell each way.
    urlFor: ({ layer, request, time }) => getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, crs: 'EPSG:4326', time }),
    // Against the box this picture was asked for (carried on its request), never the current one: home or the radius
    // may have changed while it was on its way, and the pixels belong to the place they were asked for.
    decode: async (bytes, asked) => decodeDensity(await readPixels(bytes), asked.box),
    refreshMs: REFRESH_MS.lightning,
    fetch,
    timers,
    now,
    onChange: () => {
      answer(now()); // keeps what was last seen even when no one asks between two readings
      onChange();
    },
  });

  /** The answer with F1's rule applied. `result` and the feed's own changes both come through here. */
  function answer(at) {
    const s = feed.state();
    const h = home();
    const radius = radiusNm();
    const place = `${h.icao}|${h.lat}|${h.lon}`;
    const r = clampRadius(radius);
    if (placeKey === null && episode && episode.place !== place) episode = null; // kept for another home field: not this one's
    if (place !== placeKey) {
      placeKey = place;
      lastNear = null;
      gaveReading = false;
      outageSince = null;
      lastGoodAt = null;
    } else if (lastNearRadius !== null && r < lastNearRadius) {
      lastNear = null; // lightning inside the old radius may be outside a smaller one ...
      gaveReading = false; // ... and nothing is known for the smaller radius, so the plain can't-tell line comes at once
    }
    if (lastNear === null) lastNearRadius = null;
    const data = s.failures === 0 && s.image ? s.image : null; // a failed try is "no data", never "clear"
    const found = lightningNearHome({
      samples: data ? data.samples : null,
      coverage: data ? data.coverage : undefined,
      home: h,
      radiusNm: radius,
      layerTime: s.layerTime ?? undefined,
      now: at,
      enabled,
      episode,
    });
    episode = found.episode ? { ...found.episode, place } : null; // lightning.js's own two fields, and where they were seen
    const sig = episodeSig(episode);
    if (store && sig !== saved) {
      try {
        store.set(EPISODE_KEY, episode); // null once the storm is over
        saved = sig;
      } catch {
        // Nothing can be kept: the episode lives in memory for this visit, as before.
      }
    }
    if (found.state === 'near') {
      lastNear = found.caution;
      lastNearRadius = r;
      gaveReading = true;
      lastGoodAt = +at;
      outageSince = null;
      return found;
    }
    if (found.state === 'clear') {
      lastNear = null;
      gaveReading = true;
      lastGoodAt = +at;
      outageSince = null;
      return found;
    }
    if (found.state === 'off') {
      lastNear = null;
      gaveReading = false;
      lastGoodAt = null;
      outageSince = null;
      return found;
    }
    // 'unknown': it can't tell now.
    const icao = lastNear?.icao ?? (typeof h.icao === 'string' && h.icao ? h.icao : 'CYMJ');
    if (lastNear) {
      // Keep the live caution, under its own key, for as long as no good reading replaces it. The episode is left as it is: it is
      // only the same caution again if lightning is seen near within the episode gap (lightning.js), never after a long outage.
      const seenMin = Math.max(0, Math.floor((+at - +lastNear.from) / MINUTE_MS));
      const words = `Lightning within ${found.radiusNm} NM (can't tell now, last seen ${seenMin} min ago)`;
      return { ...found, caution: { ...lastNear, reason: words, text: `Caution: ${icao} lightning: ${words.slice('Lightning '.length)}`, stale: true } };
    }
    const tried = s.failures > 0 || Boolean(s.image);
    // With no good reading yet, any failed or old picture. After one, only a picture past the stale limit or a last good reading
    // that old: a short blip stays on the strip.
    const pictureStale = s.image && s.layerTime ? feedAge({ kind: 'lightning', layerTime: s.layerTime, now: at }).stale : false;
    const longSinceGood = lastGoodAt !== null && +at - lastGoodAt > STALE_MS.lightning;
    if (tried && (!gaveReading || pictureStale || longSinceGood)) {
      outageSince ??= +at;
      return {
        ...found,
        caution: {
          key: `${icao}|LIGHTNING|CANT-TELL|${new Date(outageSince).toISOString().slice(0, 16)}Z`,
          icao,
          source: 'LIGHTNING',
          level: 'caution', // amber: it is not a reading below limits, and it is never counted as clear
          levelWords: 'Caution',
          group: null,
          from: new Date(outageSince),
          to: null,
          reason: "Lightning: can't tell",
          stale: true,
          text: "Lightning: can't tell",
          acknowledged: false,
        },
      };
    }
    return found;
  }

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
    feed.setRequest({ bbox: [west, south, east, north], width: box.width, height: box.height, key: `${west},${south},${east},${north},${box.width}`, box });
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
      return answer(at);
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
 * - paused(): true while the tab is hidden (or the map is not drawn): nothing is asked, and the view is left alone, until it
 *   turns false; wake() then asks at once if a request is due (F2 of sof-recheck-207).
 * Returns { setOn, wake, touch, stop, view(at), state }.
 */
export function createTrafficFeed({ address, options = () => ({}), paused = () => false, fetch, timers, now = () => new Date(), onChange = () => {} }) {
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
    if (stopped || paused()) return;
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
    /** The tab is back: ask at once if a request is due (the one-second poll would get there within a second anyway). */
    wake: tick,
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
