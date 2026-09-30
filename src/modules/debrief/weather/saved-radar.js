// Saved radar and lightning (SPEC-debrief: Saved radar and lightning, task
// 12f). ECCC keeps only the last 3 hours, so when a flight ended less than
// 3 hours ago the debrief fetches every frame covering the flight, keeps them
// with it, and plays them back from the file with no network. This file is the
// plain part, tested in Node: who is offered it, which frames to ask for, the
// address of each, what a reply must be to be kept, the size limit and the
// thinning that meets it, the block that goes into the debrief file and the
// checks it gets on the way back in (a file is untrusted), and which frame goes
// with a playback moment. No page access, no network, no clock: `nowT` and
// the flight's times come in as arguments. Times are seconds since 1970.
import { getMapUrl, parseLayerTimes, GEOMET_URL, LAYERS } from '../../sof/feeds.js';
import { sliceAt, MAX_AGE_S, ageText } from './slices.js';

/** ECCC keeps radar and lightning for about 3 hours. */
export const KEPT_S = 3 * 3600;

/**
 * The ECCC layers kept, as the SOF names them. `item` is the Weather menu item
 * that draws it; `stepS` is ECCC's own spacing, used only when a reply gives none.
 * Rain and snow radar are both kept, so a winter storm shows as well as a summer one.
 */
export const SAVED_LAYERS = Object.freeze({
  rain: Object.freeze({ eccc: LAYERS.radarRain, item: 'radar', stepS: 360 }),
  snow: Object.freeze({ eccc: LAYERS.radarSnow, item: 'radar', stepS: 360 }),
  lightning: Object.freeze({ eccc: LAYERS.lightning, item: 'lightning', stepS: 600 }),
});
/** Which layers each Weather item draws, bottom first. */
export const ITEM_LAYERS = Object.freeze({ radar: Object.freeze(['rain', 'snow']), lightning: Object.freeze(['lightning']) });
const ITEM_LABEL = Object.freeze({ radar: 'Radar', lightning: 'Lightning' });
const LAYER_KEYS = Object.freeze(Object.keys(SAVED_LAYERS));

/**
 * The limits on what is kept and on what a file may hold. A real 1,024 pixel
 * radar frame is 20 to 30 kB and lightning 4 kB (sources check 2026-09-30), so
 * an hour and a half comes to about half a megabyte and these are not met in
 * practice; they are the most a debrief file will carry.
 */
export const LIMITS = Object.freeze({
  maxTotalBytes: 25 * 1024 * 1024, // the frames' image bytes, all together
  maxFrameBytes: 1.5 * 1024 * 1024, // one frame
  maxFramesPerLayer: 100, // ECCC's 3 hours is 31 radar frames and 19 lightning
  maxBoxDeg: 30, // no side of the picture's box is longer than this
  maxPixels: 1024, // no side of a picture is longer than this
  minPixels: 128,
  leadS: 20 * 60, // a frame may come this long before the flight's start (the one at or before it)
});
/** The debrief file's block, as text: at most this many characters (25 MB as base64 is 33.4 million, and a little more for the rest). */
export const MAX_SAVED_CHARS = 36 * 1024 * 1024;
/** How far round the formation the pictures reach, on each side. */
export const PAD_NM = 30;
/** The ECCC attribution its licence asks for. */
export const ECCC_CREDIT = 'Data Source: Environment and Climate Change Canada';
/** Picture types a file may hold. SVG is never one. */
export const ALLOWED_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const FORMAT_VERSION = 1;
const MAX_TIMES_PER_LAYER = 1000;
const KM_PER_DEG = 111.32;
const NM_PER_DEG = 60;

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasLayer = (layer) => typeof layer === 'string' && Object.hasOwn(SAVED_LAYERS, layer);

// --- Who is offered it ---------------------------------------------------------

/**
 * Whether ECCC can still have this flight's radar: its end is less than 3 hours
 * before `nowT` (the browser's clock, passed in). A flight that ends after
 * `nowT` (a slow clock) is recent.
 */
export function radarKept(flightEndT, nowT) {
  return isFiniteNumber(flightEndT) && isFiniteNumber(nowT) && nowT - flightEndT < KEPT_S;
}

/** What Radar or Lightning says for a flight too old to have it. */
export function notKeptText(item) {
  return `Not kept: ${ITEM_LABEL[item]?.toLowerCase() ?? 'radar'} is only available for 3 hours after the flight.`;
}

// --- Which frames ---------------------------------------------------------------

/**
 * The frame times to fetch from one layer, in seconds, oldest first: the last
 * at or before the flight's start, then every step to the last at or before its
 * end. `times` is a layer's { start, end, stepMs } (parseLayerTimes: Dates);
 * frames sit on the layer's step counted back from its newest. Whatever ECCC no
 * longer has (an earlier start) is left out, so the first frame it does have
 * starts the list. A reply that would mean more than 1,000 frames gives none.
 */
export function coveringTimes(times, flightStartT, flightEndT, defaultStepS) {
  const stepS = times.stepMs > 0 ? times.stepMs / 1000 : defaultStepS;
  const first = times.start.getTime() / 1000;
  const last = times.end.getTime() / 1000;
  if (!(stepS > 0) || (last - first) / stepS > MAX_TIMES_PER_LAYER) return [];
  const grid = [];
  for (let t = last; t >= first; t -= stepS) grid.unshift(t);
  const before = grid.filter((t) => t <= flightStartT);
  const from = before.length ? before[before.length - 1] : grid[0];
  return grid.filter((t) => t >= from && t <= flightEndT);
}

const roundedDown = (v) => Math.floor(v * 100 + 1e-6) / 100;
const roundedUp = (v) => Math.ceil(v * 100 - 1e-6) / 100;

/**
 * The box the pictures cover: the flight's box ({ minLat, maxLat, minLon,
 * maxLon }, degrees) plus PAD_NM on each side, rounded outward to 0.01° and
 * held inside what the map can show. null with no usable box.
 */
export function savedBox(bounds, padNm = PAD_NM) {
  if (!bounds || ![bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon].every(isFiniteNumber)) return null;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const padLat = padNm / NM_PER_DEG;
  const padLon = padLat / Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
  return {
    minLat: Math.max(-85, roundedDown(bounds.minLat - padLat)),
    maxLat: Math.min(85, roundedUp(bounds.maxLat + padLat)),
    minLon: Math.max(-180, roundedDown(bounds.minLon - padLon)),
    maxLon: Math.min(180, roundedUp(bounds.maxLon + padLon)),
  };
}

/**
 * How big to ask each picture: about a pixel a kilometre (radar's own), square
 * pixels, no side over 1,024 or under 128.
 */
export function imageSize(box) {
  const midLat = (box.minLat + box.maxLat) / 2;
  const kmW = (box.maxLon - box.minLon) * KM_PER_DEG * Math.cos((midLat * Math.PI) / 180);
  const kmH = (box.maxLat - box.minLat) * KM_PER_DEG;
  const scale = Math.min(1, LIMITS.maxPixels / Math.max(kmW, kmH, 1));
  const px = (km) => Math.min(LIMITS.maxPixels, Math.max(LIMITS.minPixels, Math.round(km * scale)));
  return { width: px(kmW), height: px(kmH) };
}

/**
 * The ECCC address of one frame: plain latitude and longitude (EPSG:4326), the
 * exact frame time, a transparent PNG. A plain GET, since ECCC answers a
 * preflight with an error. Throws for a layer that isn't kept or a box that
 * isn't in order and in range.
 */
export function frameUrl(layer, box, t, { width, height }) {
  if (!hasLayer(layer)) throw new TypeError('frameUrl: a layer from SAVED_LAYERS');
  return getMapUrl({
    layer: SAVED_LAYERS[layer].eccc,
    bbox: [box.minLon, box.minLat, box.maxLon, box.maxLat],
    width,
    height,
    time: t * 1000,
    crs: 'EPSG:4326',
  });
}

/** The address of a layer's GetCapabilities reply: its own times, never the whole server's list. */
export function capabilitiesUrl(layer) {
  if (!hasLayer(layer)) throw new TypeError('capabilitiesUrl: a layer from SAVED_LAYERS');
  return `${GEOMET_URL}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${SAVED_LAYERS[layer].eccc}`;
}

/** A layer's times from its GetCapabilities text: { start, end, stepMs } or null (parseLayerTimes). */
export function layerTimes(layer, xml) {
  if (!hasLayer(layer)) return null;
  return parseLayerTimes(xml, SAVED_LAYERS[layer].eccc);
}

// --- What comes back ------------------------------------------------------------

/** Bytes as base64, in chunks, so a big picture doesn't overflow the call's argument limit. */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The picture type a base64 string's first bytes show (PNG, JPEG or WebP), or null. */
export function mimeOfBase64(data) {
  if (typeof data !== 'string' || data.length < 16) return null;
  let head;
  try {
    head = atob(data.slice(0, 16)); // 12 bytes
  } catch {
    return null;
  }
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (head.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** The bytes a base64 string decodes to. */
export function frameBytes({ data }) {
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - pad;
}

/**
 * A fetched reply as a frame's { mime, data }, or null unless it is a picture:
 * ECCC answers a missing frame with 200 and an XML error, so the type is
 * checked and the first bytes must bear it out. `bytes` is a Uint8Array.
 */
export function frameFromReply({ contentType, bytes }) {
  const type = typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
  if (!ALLOWED_MIMES.includes(type) || !bytes?.length || bytes.length > LIMITS.maxFrameBytes) return null;
  const data = bytesToBase64(bytes);
  return mimeOfBase64(data) === type ? { mime: type, data } : null;
}

// --- The size limit -------------------------------------------------------------

const byLayer = (frames) => LAYER_KEYS.map((layer) => frames.filter((f) => f.layer === layer).sort((a, b) => a.t - b.t));

/**
 * Meets the size limit by thinning, never by cutting the end off: if the frames
 * come to more than `capBytes`, every second frame of each layer is dropped
 * (counting from its first), then every third, and so on until they fit; each
 * layer's first and last frame are always kept. Returns { frames, dropped,
 * factor, maxGapS, over }: the kept frames (layer order, oldest first), those
 * dropped in the same order, the step that was needed (1 for none), the widest
 * gap left in any layer (seconds), and `over` true when even the first and last
 * of every layer are too much (the caller keeps nothing then).
 */
export function fitCap(frames, capBytes = LIMITS.maxTotalBytes) {
  const layers = byLayer(frames);
  const total = (kept) => kept.reduce((n, list) => n + list.reduce((m, f) => m + frameBytes(f), 0), 0);
  const longest = Math.max(1, ...layers.map((l) => l.length));
  let factor = 1;
  let kept = layers;
  while (total(kept) > capBytes && factor < longest) {
    factor += 1;
    kept = layers.map((list) => list.filter((f, i) => i % factor === 0 || i === list.length - 1));
  }
  const keptSet = new Set(kept.flat());
  const gaps = kept.map((list) => list.slice(1).map((f, i) => f.t - list[i].t)).flat();
  return {
    frames: kept.flat(),
    dropped: layers.flat().filter((f) => !keptSet.has(f)),
    factor,
    maxGapS: gaps.length ? Math.max(...gaps) : 0,
    over: total(kept) > capBytes,
  };
}

// --- Into the file and back -----------------------------------------------------

/** A saved set: the box the pictures cover and the frames, layer by layer, oldest first. */
export function makeSaved({ box, frames, fetchedT }) {
  return {
    box: { minLat: box.minLat, maxLat: box.maxLat, minLon: box.minLon, maxLon: box.maxLon },
    frames: byLayer(frames).flat().map((f) => ({ layer: f.layer, t: f.t, mime: f.mime, data: f.data })),
    fetchedT: isFiniteNumber(fetchedT) ? fetchedT : null,
  };
}

/** The block as the text the debrief file keeps under its settings. */
export function savedToSetting(saved) {
  return JSON.stringify({ v: FORMAT_VERSION, box: saved.box, fetchedT: saved.fetchedT, frames: saved.frames });
}

const problem = (why) => ({ problem: `The radar and lightning saved in this file couldn't be read (${why}), so they were left out. The rest of the debrief is as saved.` });
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_FRAME_CHARS = Math.ceil((LIMITS.maxFrameBytes * 4) / 3) + 4;

function readBox(box) {
  if (!isObject(box) || ![box.minLat, box.maxLat, box.minLon, box.maxLon].every(isFiniteNumber)) return null;
  const { minLat, maxLat, minLon, maxLon } = box;
  if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180 || minLat >= maxLat || minLon >= maxLon) return null;
  if (maxLat - minLat > LIMITS.maxBoxDeg || maxLon - minLon > LIMITS.maxBoxDeg) return null;
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Reads the debrief file's block, which is untrusted, for a flight running from
 * `startT` to `endT`. All of it or none: returns { saved } with only the
 * fields this file defines, { saved: null } when the file has none, or
 * { problem } (words for the user) for anything wrong. Checks: the length; a
 * known version; the box in range, in order and no bigger than 30°; at most
 * 100 frames a layer; a layer from the list; a whole-number time from 20
 * minutes before the start (the frame at or before it) to the end; a MIME type
 * of PNG, JPEG or WebP that the picture's first bytes bear out; strict base64;
 * 1.5 MB a frame and 25 MB in all; no layer and time twice.
 */
export function savedFromSetting(text, { startT, endT }) {
  if (text === undefined || text === null || text === '') return { saved: null };
  if (typeof text !== 'string') return problem('it is not text');
  if (text.length > MAX_SAVED_CHARS) return problem('it is too big');
  let block;
  try {
    block = JSON.parse(text);
  } catch {
    return problem('it is damaged');
  }
  if (!isObject(block) || block.v !== FORMAT_VERSION) return problem('it is not a kind this tool understands');
  const box = readBox(block.box);
  if (!box) return problem('its area is wrong');
  if (!Array.isArray(block.frames) || !block.frames.length) return problem('it holds no pictures');
  if (block.frames.length > LIMITS.maxFramesPerLayer * LAYER_KEYS.length) return problem('it holds too many pictures');

  const seen = new Set();
  const perLayer = {};
  let totalBytes = 0;
  const frames = [];
  for (const f of block.frames) {
    if (!isObject(f) || !hasLayer(f.layer)) return problem('a picture is for a layer this tool does not know');
    if (!Number.isInteger(f.t) || f.t < startT - LIMITS.leadS || f.t > endT) return problem("a picture's time is outside the flight");
    if (!ALLOWED_MIMES.includes(f.mime)) return problem('a picture is not a PNG, JPEG or WebP');
    if (typeof f.data !== 'string' || f.data.length > MAX_FRAME_CHARS || f.data.length % 4 !== 0 || !BASE64.test(f.data)) return problem('a picture is damaged');
    if (mimeOfBase64(f.data) !== f.mime) return problem('a picture is not the kind it says');
    const key = `${f.layer}@${f.t}`;
    if (seen.has(key)) return problem('a picture is in twice');
    seen.add(key);
    perLayer[f.layer] = (perLayer[f.layer] ?? 0) + 1;
    if (perLayer[f.layer] > LIMITS.maxFramesPerLayer) return problem('it holds too many pictures');
    const bytes = frameBytes(f);
    if (bytes > LIMITS.maxFrameBytes) return problem('a picture is too big');
    totalBytes += bytes;
    if (totalBytes > LIMITS.maxTotalBytes) return problem('the pictures are too big');
    frames.push({ layer: f.layer, t: f.t, mime: f.mime, data: f.data });
  }
  return { saved: makeSaved({ box, frames, fetchedT: block.fetchedT }) };
}

// --- Playback -------------------------------------------------------------------

const indexed = new WeakMap(); // saved set → { layer: { frames, maxAgeS } }
function layerIndex(saved) {
  let index = indexed.get(saved);
  if (!index) {
    index = {};
    const lists = byLayer(saved.frames);
    for (const [i, layer] of LAYER_KEYS.entries()) {
      const frames = lists[i];
      const widest = frames.slice(1).reduce((m, f, i) => Math.max(m, f.t - frames[i].t), 0);
      const item = SAVED_LAYERS[layer].item;
      // A thinned layer keeps showing across its wider gaps.
      index[layer] = { frames, maxAgeS: Math.max(MAX_AGE_S[item], widest) };
    }
    indexed.set(saved, index);
  }
  return index;
}

/**
 * The frame of a layer to draw at playback time t: the last at or before it
 * (the live layers' rule, `sliceAt`), with its age, or null before the first or
 * once it is older than the layer's age limit. Returns { frame, ageS } | null.
 */
export function savedFrameAt(saved, layer, t) {
  if (!saved || !hasLayer(layer)) return null;
  const { frames, maxAgeS } = layerIndex(saved)[layer];
  const found = sliceAt(frames, t, maxAgeS);
  return found ? { frame: found.item, ageS: found.ageS } : null;
}

/**
 * What a Weather item draws at time t, bottom first: [{ layer, frame, ageS }]
 * (Radar is a rain frame and a snow frame; Lightning is its one). [] for none.
 */
export function framesToDraw(saved, item, t) {
  const out = [];
  for (const layer of ITEM_LAYERS[item] ?? []) {
    const found = savedFrameAt(saved, layer, t);
    if (found) out.push({ layer, ...found });
  }
  return out;
}

// --- The words ------------------------------------------------------------------

/** A time as "14:30Z". */
export const hhmmZ = (t) => {
  const d = new Date(t * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
};

/** What a saved set says about itself, under the Weather menu; '' with none. */
export function savedSummary(saved) {
  if (!saved?.frames.length) return '';
  const times = saved.frames.map((f) => f.t);
  const first = Math.min(...times);
  const last = Math.max(...times);
  const n = saved.frames.length;
  return `Kept with this debrief: ${n} radar and lightning ${n === 1 ? 'picture' : 'pictures'}, ${hhmmZ(first)}${last > first ? ` to ${hhmmZ(last)}` : ''}.`;
}

/**
 * The words for one Weather item ('radar' or 'lightning') under the map. on:
 * whether its item is on. recent: whether the flight is within 3 hours
 * (radarKept). saved: the kept set or null. t: the playback time. '' when off.
 */
export function radarNote({ item, on, recent, saved, t }) {
  if (!on) return '';
  const label = ITEM_LABEL[item];
  if (!saved) {
    return recent
      ? `${label} not saved yet: use Save radar and lightning with this debrief in the Weather menu.`
      : notKeptText(item);
  }
  if (!ITEM_LAYERS[item].some((layer) => saved.frames.some((f) => f.layer === layer))) return `${label}: none was saved with this debrief.`;
  const drawn = framesToDraw(saved, item, t);
  if (!drawn.length) return `${label}: no picture kept for this moment.`;
  const newest = drawn.reduce((a, b) => (b.frame.t > a.frame.t ? b : a));
  return `${label} ${hhmmZ(newest.frame.t)}, ${ageText(newest.ageS)}`;
}

/**
 * The whole line under the map for the saved layers: each item that is on
 * (`radar`, `lightning`: booleans), joined, with ECCC's credit once after them
 * when a picture is showing. '' when both are off.
 */
export function savedNoteLine({ radar, lightning, recent, saved, t }) {
  const items = [['radar', radar], ['lightning', lightning]].filter(([, on]) => on).map(([item]) => item);
  const parts = items.map((item) => radarNote({ item, on: true, recent, saved, t }));
  const showing = items.some((item) => framesToDraw(saved, item, t).length > 0);
  return [...parts, ...(showing ? [ECCC_CREDIT] : [])].join(' · ');
}
