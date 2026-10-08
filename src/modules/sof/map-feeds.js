// The SOF map's feeds wired together, without a page (SPEC-sof, "Map" and "Security", R4):
// a layer's own time from ECCC, its picture for the view, how old it is, and what the
// feed says about itself in words. feeds.js decides the addresses, times and ages; this
// puts them on the clock. Radar has RainViewer as its backup (two ECCC failures, then
// back when ECCC answers); the lightning near-home reading and the traffic layer have
// their own loops below.
//
// No page: `fetch`, the clock, the timers (a scheduler scope) and the picture decoder come in,
// so the Node tests run the whole thing. Every request goes through guardedFetch
// (timeout, byte cap, no cookies) and ends when stop() is called (the module closing).
import {
  GEOMET_URL, LAYERS, GEOMET_EXTRA_LAYERS, getMapUrl, parseLayerTimes, parseRainViewer, feedAge,
  initialFeedSource, nextFeedSource, REFRESH_MS, wmsServiceOf, frameTimes,
} from './feeds.js';
import { guardedFetch, bytesToText, isPng, FETCH_LIMITS } from './map-fetch.js';
import { formatAge, formatDuration } from './cards.js';

export const RAINVIEWER_LIST_URL = 'https://api.rainviewer.com/public/weather-maps.json';

/** The two ECCC layers whose times are read from their `default` only (feeds.js GEOMET_EXTRA_LAYERS, the same object; asked for by name from this short list only). */
export const EXTRA_LAYERS = GEOMET_EXTRA_LAYERS;
const EXTRA_NAMES = new Set(Object.values(EXTRA_LAYERS));
const ALL_NAMES = new Set([...Object.values(LAYERS), ...EXTRA_NAMES]);

const MINUTE_MS = 60_000;
/** After a failure ECCC is asked again this soon, so two failures in a row take about this long, not two refreshes. */
export const RETRY_MS = 20_000;
/** A moved or zoomed view is asked for after it has held still this long. */
export const VIEW_SETTLE_MS = 400;

const ISO_SECONDS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- Addresses -------------------------------------------------------------------------------

/**
 * A layer's own GetCapabilities address, for its times only (ECCC's whole list is 40 MB, so it is
 * never asked for; NCEP's radar address is that one layer's own service, about 8 KB, checked 8 Oct 2026).
 * Throws RangeError for a name not on the SOF's list, and for a GIBS layer (its frames are worked out, feeds.js `frameTimes`).
 */
export function capabilitiesUrl(layer) {
  const service = wmsServiceOf(layer);
  if (service?.id === 'geomet' && ALL_NAMES.has(layer)) return `${GEOMET_URL}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${layer}`;
  if (service?.id === 'ncep') return `${service.url}?service=WMS&version=1.3.0&request=GetCapabilities`;
  throw new RangeError(service ? 'this layer has no capabilities request' : 'layer is not one the SOF uses');
}

/**
 * The GetMap address for one of EXTRA_LAYERS (web mercator only), built by feeds.js `getMapUrl`, the one address builder: a name
 * from the list, a box in degrees in order and in range (to 85°), a size in whole numbers, and an optional time as a Date.
 * Throws RangeError for anything else.
 */
export function extraMapUrl({ layer, bbox, width, height, time } = /** @type {any} */ ({})) {
  if (!EXTRA_NAMES.has(layer)) throw new RangeError('layer is not one the SOF uses');
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isNumber)) throw new RangeError('bbox must be four numbers');
  if (bbox[1] < -85 || bbox[3] > 85) throw new RangeError('bbox out of range');
  if (time !== undefined && time !== null && !(time instanceof Date && Number.isFinite(+time))) throw new RangeError('time must be a Date');
  return getMapUrl({ layer, bbox, width, height, time: time ?? undefined, crs: 'EPSG:3857' });
}

/**
 * The layer's own latest time from a capabilities reply, for the layers feeds.js can read
 * (`parseLayerTimes`) and for the GOES cloud layer, which it does not list: there only its
 * `default` time is read, and only as exact ISO seconds inside the layer's own element.
 * Returns a Date or null.
 */
export function layerTimeOf(xml, layer) {
  if (typeof xml !== 'string') return null;
  if (!EXTRA_NAMES.has(layer)) return parseLayerTimes(xml, layer)?.latest ?? null;
  if (xml.length > 256 * 1024) return null;
  const at = xml.indexOf(`<Name>${layer}</Name>`);
  if (at < 0) return null;
  const rest = xml.slice(at);
  const ends = [rest.indexOf('</Layer>'), rest.indexOf('<Layer', 1)].filter((i) => i >= 0);
  const section = ends.length ? rest.slice(0, Math.min(...ends)) : rest;
  for (const m of section.matchAll(/<Dimension(?:\s([^<>]{0,1000}))?>/g)) {
    if (!/\bname="time"/.test(m[1] ?? '')) continue;
    const given = /\bdefault="([^"]*)"/.exec(m[1] ?? '')?.[1];
    if (typeof given !== 'string' || !ISO_SECONDS.test(given)) return null;
    const ms = Date.parse(given);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) + 'Z' === given ? new Date(ms) : null;
  }
  return null;
}

// ---- What a feed says about itself ------------------------------------------------------------

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;

/**
 * The feed's line, in words and a symbol (never colour alone): { text, symbol, tone, stale }.
 * - label: 'Radar', 'Lightning' or 'Cloud'. kind: 'radar', 'lightning' or 'cloud' (the stale limit, 20, 40 or 60 min, feeds.js STALE_MS).
 * - on: whether the layer is on. hasImage, layerTime (Date or null), failed, busy, backup (RainViewer), now.
 * - source, sourceShort: the site profile's words for where it comes from (`strip`, `short`), at a base whose source is not ECCC's
 *   ("Radar NOAA MRMS 0142Z (3 min ago)", "Radar (NOAA) failed, nothing to show"); left out at Moose Jaw, whose lines read as before.
 * The age is the layer's own time, never when it was fetched.
 */
export function feedLine({ label, kind = 'radar', on = true, hasImage = false, layerTime = null, failed = false, busy = false, backup = false, source = null, sourceShort = null, now = new Date() } = /** @type {any} */ ({})) {
  const name = backup ? `${label} (RainViewer backup)` : source ? `${label} ${source}` : label;
  const failedName = !backup && sourceShort ? `${label} (${sourceShort})` : name;
  if (!on) return { text: `${label} off`, symbol: '–', tone: 'off', stale: false };
  const time = layerTime ? feedAge({ kind, layerTime, now }) : null;
  const since = hasImage && layerTime && time && time.state !== 'unknown'
    ? `${hhmmZ(layerTime)} (${formatAge((+now - +layerTime) / MINUTE_MS)})`
    : null;
  if (failed) {
    return { text: since ? `${failedName} failed, showing ${formatDuration((+now - +layerTime) / MINUTE_MS)} old` : `${failedName} failed, nothing to show`, symbol: '⚠', tone: 'bad', stale: true };
  }
  if (!hasImage) return busy || !layerTime ? { text: `${name} loading…`, symbol: '⟳', tone: 'busy', stale: false } : { text: `${name} no picture`, symbol: '⚠', tone: 'bad', stale: true };
  if (!since) return { text: `${name} time unknown`, symbol: '⚠', tone: 'bad', stale: true };
  if (time.stale) return { text: `${name} STALE ${since}`, symbol: '⚠', tone: 'bad', stale: true };
  return { text: `${name} ${since}${busy ? ', refreshing…' : ''}`, symbol: busy ? '⟳' : '✓', tone: busy ? 'busy' : 'ok', stale: false };
}

// ---- One ECCC picture feed ---------------------------------------------------------------------

/**
 * A layer's time and its picture for one box, kept fresh on a timer.
 *
 * - layer: the ECCC layer name, or a function returning it (radar rain or snow).
 * - kind: 'radar', 'lightning' or 'cloud': how long until it is stale (feeds.js).
 * - urlFor({ layer, request, time }): the picture's address (built from numbers only).
 * - decode(bytes, asked, layer): the picture as the caller uses it (a bitmap), a promise; null or a throw is a failure. `asked` is the
 *   request the picture was fetched for (which can differ from the current one by now), `layer` the layer it is of.
 *   For a layer with worked-out frames (GIBS, feeds.js `frameTimes`) there is no capabilities request: each frame time is tried, newest first,
 *   and a null from decode (an empty picture: no frame for that time yet, map.js) moves on to the next older one; none left is a failure.
 * - timeless: the layer has no time to ask for (warnings); no capabilities request is made.
 * - refreshMs, retryMs, paused(): a paused feed asks for nothing and looks again later.
 * - onAttempt(ok): after each try, for radar's switch to its backup.
 * - fetch, timers (scheduler scope), now (clock), onChange().
 *
 * `request` is what to ask for: { bbox, width, height, key } (map-view.js radarImageRequest, or the lightning box), and optionally
 * `time` (a Date): the hour to ask for instead of the layer's latest (the 3D view's model hour, for the HRDPS cloud picture; its key
 * then names the hour too). An hour outside the layer's own range (from its capabilities) is never asked for: that try fails.
 * A changed request is asked for after VIEW_SETTLE_MS. Returns { setRequest, enable, refresh, wake, stop, reset, state }.
 */
export function createImageFeed({
  layer, kind = 'radar', urlFor, decode, timeless = false, refreshMs = REFRESH_MS.radar, retryMs = RETRY_MS,
  paused = () => false, onAttempt = (_ok) => {}, fetch, timers, now = () => new Date(), onChange = () => {},
}) {
  const layerName = () => (typeof layer === 'function' ? layer() : layer);
  const closing = new AbortController();
  let enabled = false;
  let request = null;
  let held = null; // { image, key, layer, time } the picture on screen, with its own layer time
  let latestTime = null; // the newest layer time ECCC has given, for asking again for the same picture
  let range = null; // the layer's own { start, end, referenceTime } from its capabilities (feeds.js parseLayerTimes), for a request with its own time
  let failures = 0;
  let lastAttemptAt = null;
  let busy = false;
  let again = false;
  let cancelNext = null;
  let cancelSettle = null;
  let stopped = false;

  const changed = () => {
    if (!stopped) onChange();
  };
  const clearNext = () => {
    cancelNext?.();
    cancelNext = null;
  };

  function schedule(ms) {
    clearNext();
    if (stopped || !enabled) return;
    cancelNext = timers.after(ms, () => {
      cancelNext = null;
      attempt();
    });
  }

  function release(image) {
    try {
      image?.close?.();
    } catch {
      /* a bitmap already closed */
    }
  }

  async function attempt({ full = true } = {}) {
    if (stopped || !enabled) return;
    if (busy) {
      again = true;
      return;
    }
    if (paused()) {
      schedule(refreshMs);
      return;
    }
    busy = true;
    lastAttemptAt = now();
    changed();
    const name = layerName();
    const frames = !timeless && wmsServiceOf(name)?.times === 'frames';
    let ok = false;
    try {
      let time = latestTime;
      if (!timeless && !frames && (full || !time)) {
        const reply = await guardedFetch(fetch, capabilitiesUrl(name), { timers, signal: closing.signal, accept: 'text/xml', ...FETCH_LIMITS.layerTimes });
        const xml = bytesToText(reply.bytes);
        time = layerTimeOf(xml, name);
        if (!time) throw new Error('no layer time');
        if (stopped) return;
        latestTime = time;
        const times = EXTRA_NAMES.has(name) ? null : parseLayerTimes(xml, name);
        range = times ? { start: times.start, end: times.end, referenceTime: times.referenceTime } : null;
      }
      if (request) {
        const asked = request;
        if (!timeless && !frames && asked.time instanceof Date) {
          // The request's own hour: only inside the layer's range (never an hour ECCC does not have).
          if (!range || +asked.time < +range.start || +asked.time > +range.end) throw new Error('hour outside the layer');
          time = asked.time;
        }
        // One picture for one time: its address, a checked PNG of the size asked, and the caller's decoding (null when it is not a picture to show).
        const picture = async (when) => {
          const url = urlFor({ layer: name, request: asked, time: when });
          const reply = await guardedFetch(fetch, url, { timers, signal: closing.signal, accept: 'image/png', ...FETCH_LIMITS.image });
          if (!isPng(reply.contentType, reply.bytes, { width: asked.width, height: asked.height })) throw new Error('not a picture');
          return (await decode(reply.bytes, asked, name)) ?? null; // the request it was asked for, not the current one
        };
        let image = null;
        if (frames) {
          for (const when of frameTimes(name, now())) {
            image = await picture(when);
            if (stopped) break;
            if (image !== null) {
              time = when;
              latestTime = when;
              break;
            }
          }
          if (image === null && !stopped) throw new Error('no frame young enough');
        } else image = await picture(timeless ? undefined : time);
        if (image === null && !stopped) throw new Error('picture unreadable');
        if (stopped) {
          release(image);
          return;
        }
        release(held?.image);
        held = { image, key: asked.key, layer: name, time: timeless ? null : time, at: now(), referenceTime: range?.referenceTime ?? null };
      }
      ok = true;
      failures = 0;
    } catch (err) {
      if (stopped) return;
      failures += 1;
    } finally {
      busy = false;
    }
    if (stopped) return;
    onAttempt(ok);
    changed();
    if (again) {
      again = false;
      schedule(0);
    } else schedule(ok ? refreshMs : failures === 1 ? retryMs : refreshMs);
  }

  return {
    /** The view's request, or null. A different one is asked for after the view has held still. */
    setRequest(next) {
      const changedKey = (next?.key ?? null) !== (request?.key ?? null);
      request = next ?? null;
      if (!changedKey || !enabled || !request) return;
      cancelSettle?.();
      cancelSettle = timers.after(VIEW_SETTLE_MS, () => {
        cancelSettle = null;
        attempt({ full: false });
      });
    },
    /** Switches the feed on (asks at once) or off (stops asking and lets go of the picture). */
    enable(on) {
      const want = on === true;
      if (want === enabled || stopped) return;
      enabled = want;
      if (want) attempt();
      else {
        clearNext();
        cancelSettle?.();
        cancelSettle = null;
        release(held?.image);
        held = null;
        latestTime = null;
        range = null;
        failures = 0;
        changed();
      }
    },
    /** Asks now (time and picture). */
    refresh() {
      clearNext();
      return attempt();
    },
    /** The tab is back or the computer woke: asks now if a refresh is due. */
    wake() {
      if (!enabled || stopped || busy) return;
      if (lastAttemptAt === null || +now() - +lastAttemptAt >= refreshMs) {
        clearNext();
        attempt();
      }
    },
    /** Forgets the picture and time (the layer changed under it, rain to snow) and asks again. */
    reset() {
      release(held?.image);
      held = null;
      latestTime = null;
      range = null;
      failures = 0;
      changed();
      if (enabled) {
        clearNext();
        attempt();
      }
    },
    /** Ends every request and timer for good. */
    stop() {
      stopped = true;
      closing.abort();
      clearNext();
      cancelSettle?.();
      release(held?.image);
      held = null;
    },
    /** { enabled, busy, failures, layerTime (of the picture on screen), fetchedAt, image, imageKey, layer, referenceTime (a model layer's run, or null) } */
    state: () => ({
      enabled, busy, failures, layerTime: held?.time ?? null, fetchedAt: held?.at ?? null,
      image: held?.image ?? null, imageKey: held?.key ?? null, layer: held?.layer ?? null, referenceTime: held?.referenceTime ?? null,
    }),
  };
}

// ---- Radar: ECCC first, RainViewer after two failures -----------------------------------------------

/**
 * Radar (rain or snow) with its backup. `precip()` says 'rain' or 'snow'. `layers()` gives the layer names, { rain, snow } (the home base's site profile,
 * `sources.radar.layers`; ECCC's two radar layers by default); it is only read while the feed is on, so a base with no radar source can return nothing. `decode`, `urlFor`-less:
 * the addresses are built here from feeds.js (`getMapUrl`, which sends each layer to its own service: ECCC GeoMet, or NOAA NCEP at the US bases).
 * `words()` gives the radar source's `{ strip, short }` words for its line (the site profile's `sources.radar`), or nothing for the plain "Radar" line (Moose Jaw).
 * `fetch`, `timers`, `now`, `onChange` as createImageFeed.
 *
 * Returns { setRequest, enable, setPrecip, refresh, wake, stop, state, line }:
 * `state()` is { source: 'eccc' | 'rainviewer', failures, image, frame, layerTime, failed, busy };
 * `frame` is RainViewer's newest { time, path } while it is the source; `line(now)` is feedLine's.
 */
export function createRadarFeed({ precip = () => 'rain', layers = () => ({ rain: LAYERS.radarRain, snow: LAYERS.radarSnow }), words = () => null, decode, paused, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let source = initialFeedSource();
  let backup = null; // { frame, generated }
  let backupFailed = false;
  let stopped = false;
  let on = false;
  const closing = new AbortController();

  async function askRainViewer() {
    try {
      const reply = await guardedFetch(fetch, RAINVIEWER_LIST_URL, { timers, signal: closing.signal, accept: 'application/json', ...FETCH_LIMITS.json });
      const list = parseRainViewer(bytesToText(reply.bytes));
      if (stopped) return;
      backup = list ? { frame: list.latest, generated: list.generated } : null;
      backupFailed = !list;
    } catch {
      if (stopped) return;
      backupFailed = true;
    }
    onChange();
  }

  const feed = createImageFeed({
    layer: () => (precip() === 'snow' ? layers()?.snow : layers()?.rain),
    kind: 'radar',
    urlFor: ({ layer, request, time }) => getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height, time }),
    decode,
    refreshMs: REFRESH_MS.radar,
    paused,
    fetch,
    timers,
    now,
    onChange,
    onAttempt(ok) {
      const before = source.source;
      source = nextFeedSource(source, ok);
      if (source.source === 'rainviewer') askRainViewer();
      else if (before === 'rainviewer') backup = null;
    },
  });

  const eccc = () => feed.state();

  return {
    setRequest: (req) => feed.setRequest(req),
    enable(want) {
      on = want === true;
      feed.enable(on);
      if (!on) {
        source = initialFeedSource();
        backup = null;
        backupFailed = false;
      }
    },
    setPrecip() {
      feed.reset();
    },
    refresh: () => feed.refresh(),
    wake: () => feed.wake(),
    stop() {
      stopped = true;
      closing.abort();
      feed.stop();
    },
    state() {
      const e = eccc();
      const usingBackup = source.source === 'rainviewer';
      return {
        source: source.source,
        failures: source.failures,
        image: usingBackup ? null : e.image,
        imageKey: e.imageKey,
        frame: usingBackup ? backup?.frame ?? null : null,
        layerTime: usingBackup ? backup?.frame?.time ?? null : e.layerTime,
        failed: usingBackup ? backupFailed && !backup : source.failures > 0 && !e.busy,
        busy: e.busy,
        enabled: on,
      };
    },
    /** The radar's line for the status strip. */
    line(at = now()) {
      const s = this.state();
      const w = words();
      return feedLine({
        label: 'Radar', kind: 'radar', on, hasImage: s.source === 'rainviewer' ? Boolean(s.frame) : Boolean(s.image),
        layerTime: s.layerTime, failed: s.failed, busy: s.busy, backup: s.source === 'rainviewer', source: w?.strip ?? null, sourceShort: w?.short ?? null, now: at,
      });
    },
  };
}
