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
 * The limits on what is kept and on what a file may hold. Real 1,024 pixel
 * frames are rain 62 kB, snow 77 kB and lightning 4 kB (sources check
 * 2026-09-30), so a 3 hour flight over a box that size is about 4.4 MB and
 * these are not met in practice; they are the most a debrief file will carry.
 */
export const LIMITS = Object.freeze({
  maxTotalBytes: 25 * 1024 * 1024, // the frames' image bytes, all together
  maxFrameBytes: 1.5 * 1024 * 1024, // one frame
  maxFramesPerLayer: 100, // ECCC's 3 hours is 31 radar frames and 19 lightning
  maxBoxDeg: 30, // no side of the picture's box is longer than this
  maxPixels: 1024, // no side of a picture is longer than this
  minPixels: 128,
  maxThin: 12, // the most a thinning step can widen the age limit by (times the layer's own step)
  leadS: 60 * 60, // a frame may come this long before the flight's start (the one at or before it, even on a slow step)
});
/** The debrief file's block, as text: at most this many characters (25 MB as base64 is 33.4 million, and a little more for the rest). */
export const MAX_SAVED_CHARS = 36 * 1024 * 1024;
/** How far round the formation the pictures reach, on each side. */
export const PAD_NM = 30;
/** The ECCC attribution its licence asks for. */
export const ECCC_CREDIT = 'Data Source: Environment and Climate Change Canada';
/**
 * How opaque each Weather item's pictures are drawn on the map. Real rain is faint at 75 %,
 * so radar is 90 % (the pictures are still smoothed as the browser scales them); lightning is full.
 */
export const SAVED_ALPHA = Object.freeze({ radar: 0.9, lightning: 1 });
/** Picture types kept or read: PNG only (what ECCC is asked for), whose size can be read from its header. */
export const ALLOWED_MIMES = Object.freeze(['image/png']);
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

/** What both items say together under the map when neither has pictures: one short sentence, not two. */
const NOT_KEPT_BOTH = 'Not kept: radar and lightning are only available for 3 hours after the flight.';
const NOT_SAVED_BOTH = 'Radar and lightning not saved yet: see Weather.';

// --- Which frames ---------------------------------------------------------------

/**
 * Whether a frame time belongs to a flight running from startT to endT: from
 * LIMITS.leadS before the start (the frame at or before it) to the end. The one
 * rule the fetch keeps by and the reader checks by, so what is kept is read back.
 * False when any of the three is not a number.
 */
export function inWindow(t, startT, endT) {
  return [t, startT, endT].every(isFiniteNumber) && t >= startT - LIMITS.leadS && t <= endT;
}

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
  return grid.filter((t) => t >= from && t <= flightEndT).map(Math.round);
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

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';

/**
 * The size a PNG says it is, read from its header (its first chunk must be
 * IHDR): { width, height }, or null for anything that is not a PNG. A small
 * file can decode to a huge picture, so the size is checked before a picture
 * is ever decoded.
 */
export function pngSizeOfBase64(data) {
  if (typeof data !== 'string' || data.length < 32) return null;
  let head;
  try {
    head = atob(data.slice(0, 32)); // 24 bytes: signature, chunk length, 'IHDR', width, height
  } catch {
    return null;
  }
  if (!head.startsWith(PNG_SIGNATURE) || head.slice(12, 16) !== 'IHDR') return null;
  const u32 = (at) => ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0;
  return { width: u32(16), height: u32(20) };
}

/** True when a PNG's size (pngSizeOfBase64) is a real one no larger than the biggest picture asked for. */
const sizeOk = (size) => size !== null && size.width >= 1 && size.height >= 1 && size.width <= LIMITS.maxPixels && size.height <= LIMITS.maxPixels;

/** The picture type a base64 string's first bytes show (PNG only), or null. */
export function mimeOfBase64(data) {
  return pngSizeOfBase64(data) ? 'image/png' : null;
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
  return mimeOfBase64(data) === type && sizeOk(pngSizeOfBase64(data)) ? { mime: type, data } : null;
}

// --- The size limit -------------------------------------------------------------

const byLayer = (frames) => LAYER_KEYS.map((layer) => frames.filter((f) => f.layer === layer).sort((a, b) => a.t - b.t));

/**
 * The words for how far apart thinning left each item's pictures, from fitCap's
 * gapsS: "Radar every 12 min and lightning every 20 min kept to fit the size
 * limit." Rain and snow are the Radar item, so it names the wider of their
 * gaps; an item with a single picture has no gap and is left out. '' for none.
 */
export function thinningNote(gapsS) {
  const parts = [];
  for (const item of ['radar', 'lightning']) {
    const gap = Math.max(0, ...ITEM_LAYERS[item].map((layer) => gapsS[layer] ?? 0));
    if (gap > 0) parts.push(`${item} every ${Math.round(gap / 60)} min`);
  }
  if (!parts.length) return '';
  const text = parts.join(' and ');
  return `${text[0].toUpperCase()}${text.slice(1)} kept to fit the size limit.`;
}

/**
 * Meets the size limit by thinning, never by cutting the end off: if the frames
 * come to more than `capBytes`, every second frame of each layer is dropped
 * (counting from its first), then every third, and so on until they fit; each
 * layer's first and last frame are always kept. Returns { frames, dropped,
 * factor, maxGapS, gapsS, over }: the kept frames (layer order, oldest first),
 * those dropped in the same order, the step that was needed (1 for none), the
 * widest gap left in any layer (seconds), each layer's own widest gap
 * ({ rain, snow, lightning }, 0 for a layer with fewer than two frames), and
 * `over` true when even the first and last of every layer are too much (the
 * caller keeps nothing then).
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
  const gapsOf = (list) => list.slice(1).map((f, i) => f.t - list[i].t);
  const gaps = kept.map(gapsOf).flat();
  return {
    frames: kept.flat(),
    dropped: layers.flat().filter((f) => !keptSet.has(f)),
    factor,
    maxGapS: gaps.length ? Math.max(...gaps) : 0,
    gapsS: Object.fromEntries(LAYER_KEYS.map((layer, i) => [layer, Math.max(0, ...gapsOf(kept[i]))])),
    over: total(kept) > capBytes,
  };
}

// --- Into the file and back -----------------------------------------------------

/** The thinning step kept in a set: a whole number from 1 (nothing dropped) to LIMITS.maxThin. */
const thinStep = (thin) => (Number.isInteger(thin) && thin >= 1 ? Math.min(thin, LIMITS.maxThin) : 1);

/**
 * A saved set: the box the pictures cover, the frames, layer by layer, oldest
 * first, and `thin`, the step the size limit thinned them to (1 for none),
 * which widens each layer's age limit by that many of its own steps.
 */
export function makeSaved({ box, frames, fetchedT, thin = 1 }) {
  return {
    box: { minLat: box.minLat, maxLat: box.maxLat, minLon: box.minLon, maxLon: box.maxLon },
    frames: byLayer(frames).flat().map((f) => ({ layer: f.layer, t: f.t, mime: f.mime, data: f.data })),
    fetchedT: isFiniteNumber(fetchedT) ? fetchedT : null,
    thin: thinStep(thin),
  };
}

/** The block as the text the debrief file keeps under its settings. */
export function savedToSetting(saved) {
  return JSON.stringify({ v: FORMAT_VERSION, box: saved.box, fetchedT: saved.fetchedT, thin: saved.thin, frames: saved.frames });
}

const problem = (why) => ({ problem: `The radar and lightning saved in this file couldn't be read (${why}), so they were left out. The rest of the debrief is as saved.`, why });
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
 * `startT` to `endT`. Returns { saved, dropped } with only the fields this
 * file defines (`dropped`: how many pictures fell outside the flight's window,
 * inWindow, and were left out, as when the flight's own times have moved),
 * { saved: null } when the file has none, or { problem, why } (words for the
 * user) for anything wrong, including no picture left inside the window. Every
 * other check is all or nothing: the length; a known version; the box in
 * range, in order and no bigger than 30°; at most 100 frames a layer; a layer
 * from the list; a whole-number time; a PNG whose first bytes bear out its type
 * and whose own header gives a size of at most 1,024 a side; strict base64;
 * 1.5 MB a frame and 25 MB in all; no layer and time twice.
 */
export function savedFromSetting(text, { startT, endT }) {
  if (text === undefined || text === null || text === '') return { saved: null };
  if (typeof text !== 'string') return problem('it is not text');
  if (![startT, endT].every(isFiniteNumber)) return problem('the flight has no times to check it against');
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
  let dropped = 0;
  for (const f of block.frames) {
    if (!isObject(f) || !hasLayer(f.layer)) return problem('a picture is for a layer this tool does not know');
    if (!Number.isInteger(f.t)) return problem("a picture's time is not a whole number of seconds");
    if (!ALLOWED_MIMES.includes(f.mime)) return problem('a picture is not a PNG');
    if (typeof f.data !== 'string' || f.data.length > MAX_FRAME_CHARS || f.data.length % 4 !== 0 || !BASE64.test(f.data)) return problem('a picture is damaged');
    if (mimeOfBase64(f.data) !== f.mime) return problem('a picture is not the kind it says');
    if (!sizeOk(pngSizeOfBase64(f.data))) return problem('a picture is too large');
    const key = `${f.layer}@${f.t}`;
    if (seen.has(key)) return problem('a picture is in twice');
    seen.add(key);
    perLayer[f.layer] = (perLayer[f.layer] ?? 0) + 1;
    if (perLayer[f.layer] > LIMITS.maxFramesPerLayer) return problem('it holds too many pictures');
    const bytes = frameBytes(f);
    if (bytes > LIMITS.maxFrameBytes) return problem('a picture is too big');
    totalBytes += bytes;
    if (totalBytes > LIMITS.maxTotalBytes) return problem('the pictures are too big');
    // Counted above like the rest, kept only inside the flight's window.
    if (inWindow(f.t, startT, endT)) frames.push({ layer: f.layer, t: f.t, mime: f.mime, data: f.data });
    else dropped += 1;
  }
  if (!frames.length) return problem('none of its pictures fall inside the flight');
  return { saved: makeSaved({ box, frames, fetchedT: block.fetchedT, thin: block.thin }), dropped };
}

/**
 * The line for pictures in a file that fall outside the flight's window and were
 * left out (savedFromSetting's `dropped`): '' for none. They are not in a file
 * saved again, so the words say they were left out.
 */
export function droppedNotice(count) {
  if (!(count > 0)) return '';
  return count === 1
    ? 'The saved radar and lightning has 1 picture outside the flight, so it was left out.'
    : `The saved radar and lightning has ${count} pictures outside the flight, so they were left out.`;
}

/**
 * What goes into the debrief file for a kept set: { text } once it has been read
 * back through the reader's own checks against this flight's window and comes
 * back whole, else { problem } (words for the user) and no text: what is written
 * is what will be read, or it isn't written.
 */
export function weatherForFile(saved, window) {
  const text = savedToSetting(saved);
  const back = savedFromSetting(text, window);
  const why = back.problem ? back.why : back.dropped ? 'some pictures fall outside the flight' : back.saved.frames.length !== saved.frames.length ? 'some pictures were lost' : null;
  if (why) return { problem: `The radar and lightning couldn't be put in the file (${why}), so this debrief was saved without them. They stay here until you close the flight.` };
  return { text };
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
      const { item, stepS } = SAVED_LAYERS[layer];
      // A thinned layer keeps showing across the gaps thinning made (the recorded step times its own step);
      // a gap ECCC itself had is not bridged.
      index[layer] = { frames, maxAgeS: Math.max(MAX_AGE_S[item], thinStep(saved.thin) * stepS) };
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
 * (radarKept). saved: the kept set or null. t: the playback time. notDrawn:
 * the keys ("rain@1780000000") of pictures the browser could not draw, which
 * the line never names a time for. '' when off.
 */
export function radarNote({ item, on, recent, saved, t, notDrawn = new Set() }) {
  if (!on) return '';
  const label = ITEM_LABEL[item];
  if (!saved) {
    return recent
      ? `${label} not saved yet: see Weather.`
      : notKeptText(item);
  }
  if (!ITEM_LAYERS[item].some((layer) => saved.frames.some((f) => f.layer === layer))) return `${label}: none was saved with this debrief.`;
  const drawn = framesToDraw(saved, item, t);
  if (!drawn.length) return `${label}: no picture kept for this moment.`;
  const shown = drawn.filter((d) => !notDrawn.has(`${d.layer}@${d.frame.t}`));
  if (!shown.length) return `${label}: the picture couldn't be drawn.`;
  const newest = shown.reduce((a, b) => (b.frame.t > a.frame.t ? b : a));
  const line = `${label} ${hhmmZ(newest.frame.t)}, ${ageText(newest.ageS)}`;
  return shown.length < drawn.length ? `${line}; a picture couldn't be drawn` : line;
}

/**
 * The whole line under the map for the saved layers: each item that is on
 * (`radar`, `lightning`: booleans), joined, with ECCC's credit once after them
 * when a picture is showing. notDrawn: as radarNote's. '' when both are off.
 */
export function savedNoteLine({ radar, lightning, recent, saved, t, notDrawn = new Set() }) {
  const items = [['radar', radar], ['lightning', lightning]].filter(([, on]) => on).map(([item]) => item);
  // Nothing kept and both on: one short sentence, not two (the line under the map stays short).
  if (!saved && items.length === 2) return recent ? NOT_SAVED_BOTH : NOT_KEPT_BOTH;
  const parts = items.map((item) => radarNote({ item, on: true, recent, saved, t, notDrawn }));
  const showing = items.some((item) => framesToDraw(saved, item, t).some((d) => !notDrawn.has(`${d.layer}@${d.frame.t}`)));
  return [...parts, ...(showing ? [ECCC_CREDIT] : [])].join(' · ');
}
