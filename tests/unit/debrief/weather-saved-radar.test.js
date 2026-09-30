// Saved radar and lightning, the plain parts (SPEC-debrief: Saved radar and
// lightning, task 12f): who is offered it, which frames, the size limit and
// thinning, the file block and its checks, and the playback lookup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEPT_S, LIMITS, SAVED_LAYERS, MAX_SAVED_CHARS, radarKept, coveringTimes, savedBox, imageSize, frameUrl, capabilitiesUrl,
  bytesToBase64, mimeOfBase64, frameFromReply, frameBytes, fitCap, makeSaved, savedToSetting, savedFromSetting,
  savedFrameAt, framesToDraw, savedSummary, radarNote, savedNoteLine, notKeptText, pngSizeOfBase64, inWindow, weatherForFile,
} from '../../../src/modules/debrief/weather/saved-radar.js';
import { sliceAt, MAX_AGE_S } from '../../../src/modules/debrief/weather/slices.js';

const at = (iso) => Date.parse(iso) / 1000;
const HOUR = 3600;

// A real 1 × 1 PNG, and heads that only look like the others.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const PNG64 = PNG.toString('base64');
const JPEG64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1]).toString('base64');
const WEBP64 = Buffer.concat([Buffer.from('RIFF'), Buffer.from([26, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]).toString('base64');
// A PNG header that says it is 16,000 x 16,000 (about 1 GB decoded) in a file of about 1 MB.
function pngHeader(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, Buffer.from('IHDR'), ihdr, Buffer.alloc(4), Buffer.alloc(1000)]);
}
const BOMB64 = pngHeader(16000, 16000).toString('base64');
const SVG64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>').toString('base64');

const flightBox = { minLat: 50.0, maxLat: 50.6, minLon: -106.0, maxLon: -105.2 };
const START = at('2026-09-30T06:10:00Z');
const END = at('2026-09-30T06:50:00Z');
const NOW = at('2026-09-30T07:30:00Z');

function frame(layer, t, data = PNG64, mime = 'image/png') {
  return { layer, t, mime, data };
}
const goodFrames = () => [
  frame('rain', at('2026-09-30T06:06:00Z')), frame('rain', at('2026-09-30T06:12:00Z')), frame('rain', at('2026-09-30T06:18:00Z')),
  frame('snow', at('2026-09-30T06:06:00Z')),
  frame('lightning', at('2026-09-30T06:00:00Z')), frame('lightning', at('2026-09-30T06:10:00Z')),
];
const goodSaved = () => makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: NOW });

// --- Who is offered it ------------------------------------------------------

test('kept only while the flight ended less than 3 hours ago, by the clock passed in', () => {
  assert.equal(KEPT_S, 3 * HOUR);
  assert.equal(radarKept(END, END + 1 * HOUR), true);
  assert.equal(radarKept(END, END + 3 * HOUR - 1), true);
  assert.equal(radarKept(END, END + 3 * HOUR), false);
  assert.equal(radarKept(END, END + 5 * HOUR), false);
  assert.equal(radarKept(END, END - 60), true, 'a flight that ends "in the future" by a slow clock is still recent');
  assert.equal(radarKept(NaN, NOW), false);
  assert.equal(radarKept(END, undefined), false);
});

test('the not kept words, one for each item', () => {
  assert.equal(notKeptText('radar'), 'Not kept: radar is only available for 3 hours after the flight.');
  assert.equal(notKeptText('lightning'), 'Not kept: lightning is only available for 3 hours after the flight.');
});

// --- Which frames -----------------------------------------------------------

const RADAR_TIMES = { start: new Date('2026-09-30T04:42:00Z'), end: new Date('2026-09-30T07:42:00Z'), stepMs: 6 * 60_000 };

test('frames covering the window: the last at or before the start, then every step to the end', () => {
  const got = coveringTimes(RADAR_TIMES, START, END, 360).map((t) => new Date(t * 1000).toISOString().slice(11, 16));
  assert.deepEqual(got, ['06:06', '06:12', '06:18', '06:24', '06:30', '06:36', '06:42', '06:48']);
});

test('a frame exactly at the start is the first; the end\'s own frame is the last', () => {
  const on = coveringTimes(RADAR_TIMES, at('2026-09-30T06:12:00Z'), at('2026-09-30T06:24:00Z'), 360);
  assert.deepEqual(on.map((t) => new Date(t * 1000).toISOString().slice(11, 16)), ['06:12', '06:18', '06:24']);
});

test('what ECCC no longer has is left out, and the first frame it has starts the list', () => {
  const late = { ...RADAR_TIMES, start: new Date('2026-09-30T06:30:00Z') };
  const got = coveringTimes(late, START, END, 360).map((t) => new Date(t * 1000).toISOString().slice(11, 16));
  assert.deepEqual(got, ['06:30', '06:36', '06:42', '06:48']);
  assert.deepEqual(coveringTimes({ ...RADAR_TIMES, end: new Date('2026-09-30T06:00:00Z') }, START, END, 360), [at('2026-09-30T06:00:00Z')], 'the newest it has, when that is before the flight\'s start');
  assert.deepEqual(coveringTimes(RADAR_TIMES, at('2026-09-30T01:00:00Z'), at('2026-09-30T02:00:00Z'), 360), [], 'a flight before anything kept');
  assert.deepEqual(coveringTimes(RADAR_TIMES, at('2026-09-30T09:00:00Z'), at('2026-09-30T10:00:00Z'), 360).at(-1), at('2026-09-30T07:42:00Z'), 'the newest frame is the most it can give');
});

test('a layer with no period in its reply uses the layer\'s own step, counted back from its newest frame', () => {
  const noStep = { start: new Date('2026-09-30T04:30:00Z'), end: new Date('2026-09-30T07:30:00Z'), stepMs: null };
  const got = coveringTimes(noStep, START, END, 600).map((t) => new Date(t * 1000).toISOString().slice(11, 16));
  assert.deepEqual(got, ['06:10', '06:20', '06:30', '06:40', '06:50']);
});

test('a reply that would mean thousands of frames gives none', () => {
  assert.deepEqual(coveringTimes({ start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z'), stepMs: 1000 }, START, END, 360), []);
});

test('the box: the flight\'s, 30 NM on each side, rounded outward to 0.01°', () => {
  const box = savedBox(flightBox);
  assert.equal(box.minLat, 49.5); // 50.0 - 0.5°
  assert.equal(box.maxLat, 51.1); // 50.6 + 0.5°
  // 30 NM of longitude at the middle latitude (50.3°): 0.5° / cos(50.3°) = 0.7826°
  assert.equal(box.minLon, -106.79); // -106.0 - 0.7826 = -106.7826, rounded outward
  assert.equal(box.maxLon, -104.41); // -105.2 + 0.7826 = -104.4174, rounded outward
  assert.equal(savedBox(null), null);
  assert.equal(savedBox({ minLat: NaN, maxLat: 1, minLon: 0, maxLon: 1 }), null);
  const polar = savedBox({ minLat: 89.9, maxLat: 89.99, minLon: 0, maxLon: 1 });
  assert.ok(polar.maxLat <= 85 && polar.minLon >= -180 && polar.maxLon <= 180, 'held inside what the map can show');
});

test('the picture is about a pixel a kilometre and never more than 1,024 on a side', () => {
  const { width, height } = imageSize(savedBox(flightBox));
  assert.ok(width >= 128 && height >= 128);
  assert.ok(Math.abs(width / height - (2.38 * Math.cos(50.3 * Math.PI / 180)) / 1.6) < 0.02, 'square pixels: the box\'s width in km over its height');
  const huge = imageSize({ minLat: 40, maxLat: 60, minLon: -120, maxLon: -90 });
  assert.equal(Math.max(huge.width, huge.height), 1024);
  const tiny = imageSize({ minLat: 50, maxLat: 50.001, minLon: -106, maxLon: -105.999 });
  assert.ok(tiny.width >= 128 && tiny.height >= 128);
});

test('addresses: ECCC\'s fixed host, plain latitude and longitude, the exact frame time', () => {
  const box = { minLat: 49.5, maxLat: 51.1, minLon: -106.79, maxLon: -104.41 };
  const url = frameUrl('rain', box, at('2026-09-30T06:06:00Z'), { width: 400, height: 300 });
  const q = new URL(url).searchParams;
  assert.equal(new URL(url).origin + new URL(url).pathname, 'https://geo.weather.gc.ca/geomet');
  assert.equal(q.get('layers'), 'RADAR_1KM_RRAI');
  assert.equal(q.get('crs'), 'EPSG:4326');
  assert.equal(q.get('bbox'), '49.5,-106.79,51.1,-104.41'); // 1.3.0 with EPSG:4326: south, west, north, east
  assert.equal(q.get('time'), '2026-09-30T06:06:00Z');
  assert.equal(q.get('width'), '400');
  assert.equal(q.get('format'), 'image/png');
  assert.equal(q.get('transparent'), 'true');
  assert.equal(new URL(frameUrl('snow', box, 0 + at('2026-09-30T06:06:00Z'), { width: 400, height: 300 })).searchParams.get('layers'), 'RADAR_1KM_RSNO');
  assert.equal(new URL(frameUrl('lightning', box, at('2026-09-30T06:10:00Z'), { width: 400, height: 300 })).searchParams.get('layers'), 'Lightning_2.5km_Density');
  assert.throws(() => frameUrl('coverage', box, 0, { width: 400, height: 300 }));
  assert.throws(() => frameUrl('rain', { ...box, minLat: 60 }, START, { width: 400, height: 300 }));
  assert.equal(capabilitiesUrl('rain'), 'https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI');
  assert.deepEqual(Object.keys(SAVED_LAYERS), ['rain', 'snow', 'lightning']);
});

// --- What comes back --------------------------------------------------------

test('bytes to base64 and the type from the first bytes', () => {
  assert.equal(bytesToBase64(new Uint8Array(PNG)), PNG64);
  const big = new Uint8Array(200_000).map((_, i) => i % 251);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'), 'longer than one chunk');
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
  assert.equal(mimeOfBase64(PNG64), 'image/png');
  assert.equal(mimeOfBase64(JPEG64), null, 'only PNG is kept');
  assert.equal(mimeOfBase64(WEBP64), null);
  assert.equal(mimeOfBase64(SVG64), null);
  assert.equal(mimeOfBase64('AAAA'), null);
  assert.equal(mimeOfBase64(''), null);
});

test('a reply is kept only if it is an image: ECCC answers a missing frame with 200 and XML', () => {
  assert.deepEqual(frameFromReply({ contentType: 'image/png', bytes: new Uint8Array(PNG) }), { mime: 'image/png', data: PNG64 });
  assert.deepEqual(frameFromReply({ contentType: 'image/png;charset=x', bytes: new Uint8Array(PNG) })?.mime, 'image/png');
  const xml = new TextEncoder().encode('<ogc:ServiceExceptionReport>NoMatch</ogc:ServiceExceptionReport>');
  assert.equal(frameFromReply({ contentType: 'text/xml', bytes: xml }), null);
  assert.equal(frameFromReply({ contentType: 'image/png', bytes: xml }), null, 'a lie about its type');
  assert.equal(frameFromReply({ contentType: 'image/svg+xml', bytes: new TextEncoder().encode('<svg/>') }), null);
  assert.equal(frameFromReply({ contentType: 'image/png', bytes: new Uint8Array(LIMITS.maxFrameBytes + 1).fill(0).map((_, i) => (i < 4 ? [0x89, 0x50, 0x4e, 0x47][i] : 0)) }), null, 'over one frame\'s limit');
  assert.equal(frameFromReply({ contentType: null, bytes: new Uint8Array(PNG) }), null);
});

// --- The size limit ---------------------------------------------------------

test('a frame\'s size is its decoded bytes', () => {
  assert.equal(frameBytes(frame('rain', 1)), PNG.length);
  assert.equal(frameBytes({ data: 'AAAA' }), 3);
  assert.equal(frameBytes({ data: 'AAA=' }), 2);
  assert.equal(frameBytes({ data: 'AA==' }), 1);
});

test('the limits: 25 MB in all, 1.5 MB a frame, 100 a layer, 36 million characters in the file block', () => {
  assert.equal(LIMITS.maxTotalBytes, 25 * 1024 * 1024);
  assert.equal(LIMITS.maxFrameBytes, 1.5 * 1024 * 1024);
  assert.equal(LIMITS.maxFramesPerLayer, 100);
  assert.equal(MAX_SAVED_CHARS, 36 * 1024 * 1024);
  // The most a saved set can be, at those limits, fits the block's own length limit.
  assert.ok(Math.ceil((LIMITS.maxTotalBytes * 4) / 3) + 100_000 < MAX_SAVED_CHARS);
});

// Frames of a set size, so the cap can be met by thinning. `bytes` decoded bytes each.
const sized = (layer, minutes, bytes) => ({ layer, t: START + minutes * 60, mime: 'image/png', data: Buffer.concat([PNG, Buffer.alloc(bytes - PNG.length)]).toString('base64') });

test('under the limit, everything is kept', () => {
  const frames = [0, 6, 12, 18].map((m) => sized('rain', m, 1000));
  const got = fitCap(frames, 10_000);
  assert.equal(got.frames.length, 4);
  assert.equal(got.factor, 1);
  assert.deepEqual(got.dropped, []);
  assert.equal(got.over, false);
});

test('over the limit, every second frame of each layer goes, then every third, and so on, keeping each layer\'s first and last', () => {
  const rain = [0, 6, 12, 18, 24, 30, 36].map((m) => sized('rain', m, 1000)); // 7 frames
  const light = [0, 10, 20, 30].map((m) => sized('lightning', m, 1000)); // 4 frames
  const times = (fs, layer) => fs.filter((f) => f.layer === layer).map((f) => (f.t - START) / 60);
  // 11 frames = 11,000 bytes. Every second (rain 0 12 24 36; lightning 0 20 30) = 7,000.
  let got = fitCap([...rain, ...light], 8000);
  assert.equal(got.factor, 2);
  assert.deepEqual(times(got.frames, 'rain'), [0, 12, 24, 36]);
  assert.deepEqual(times(got.frames, 'lightning'), [0, 20, 30], 'the last is kept even when it is not on the step');
  assert.deepEqual(got.dropped.map((f) => `${f.layer}@${(f.t - START) / 60}`), ['rain@6', 'rain@18', 'rain@30', 'lightning@10']);
  // Every third: rain 0 18 36 (36 is last); lightning 0 30 = 5,000.
  got = fitCap([...rain, ...light], 6000);
  assert.equal(got.factor, 3);
  assert.deepEqual(times(got.frames, 'rain'), [0, 18, 36]);
  assert.deepEqual(times(got.frames, 'lightning'), [0, 30]);
  // Tighter still: only the first and last of each layer = 4,000.
  got = fitCap([...rain, ...light], 4000);
  assert.deepEqual(times(got.frames, 'rain'), [0, 36]);
  assert.deepEqual(times(got.frames, 'lightning'), [0, 30]);
  assert.equal(got.over, false);
  // Nothing thinning can do.
  got = fitCap([...rain, ...light], 3000);
  assert.equal(got.over, true);
});

test('the largest gap after thinning is reported, so its layer\'s age limit can grow to fit', () => {
  const rain = [0, 6, 12, 18, 24, 30, 36].map((m) => sized('rain', m, 1000));
  assert.equal(fitCap(rain, 100_000).maxGapS, 6 * 60);
  assert.equal(fitCap(rain, 4500).maxGapS, 12 * 60);
});

test('a worst real-world set is far under the limit: 3 hours of every layer, with frames four times the largest seen', () => {
  const mb = (bytes) => ({ data: 'A'.repeat(Math.ceil((bytes * 4) / 3)) });
  const frames = [...Array(31).fill(mb(120_000)), ...Array(31).fill(mb(120_000)), ...Array(19).fill(mb(20_000))];
  assert.ok(frames.reduce((n, f) => n + frameBytes(f), 0) < LIMITS.maxTotalBytes / 3);
});

// --- Into the file and back -------------------------------------------------

test('a saved set is its box and its frames, in time order per layer', () => {
  const saved = makeSaved({ box: savedBox(flightBox), frames: [...goodFrames()].reverse(), fetchedT: NOW });
  assert.deepEqual(saved.box, { minLat: 49.5, maxLat: 51.1, minLon: -106.79, maxLon: -104.41 });
  assert.equal(saved.fetchedT, NOW);
  assert.deepEqual(saved.frames.map((f) => `${f.layer}@${new Date(f.t * 1000).toISOString().slice(11, 16)}`), [
    'rain@06:06', 'rain@06:12', 'rain@06:18', 'snow@06:06', 'lightning@06:00', 'lightning@06:10',
  ]);
});

test('a set goes into one string and comes back the same, inside the flight\'s window', () => {
  const saved = goodSaved();
  const text = savedToSetting(saved);
  assert.equal(typeof text, 'string');
  const back = savedFromSetting(text, { startT: START, endT: END });
  assert.deepEqual(back.problem, undefined);
  assert.deepEqual(back.saved, saved);
});

test('a file with no weather, or the wrong kind of value, is no weather, not a problem', () => {
  assert.deepEqual(savedFromSetting(undefined, { startT: START, endT: END }), { saved: null });
  assert.deepEqual(savedFromSetting('', { startT: START, endT: END }), { saved: null });
});

const read = (value) => savedFromSetting(typeof value === 'string' ? value : JSON.stringify(value), { startT: START, endT: END });
const block = (patch = {}) => ({ ...JSON.parse(savedToSetting(goodSaved())), ...patch });

test('untrusted: anything that is not the block is refused whole, with a line saying so', () => {
  for (const bad of ['not json', '"a string"', '[]', 'null', '{}', JSON.stringify({ v: 2, box: {}, frames: [] })]) {
    const got = read(bad);
    assert.equal(got.saved, undefined, bad);
    assert.match(got.problem, /^The radar and lightning saved in this file couldn't be read/, bad);
  }
  assert.ok(read(block({ frames: [] })).problem, 'no frames is not a block');
  assert.ok(savedFromSetting('x'.repeat(MAX_SAVED_CHARS + 1), { startT: START, endT: END }).problem, 'too long');
  assert.ok(savedFromSetting(42, { startT: START, endT: END }).problem);
});

test('untrusted: a frame\'s layer, time, type and picture are each checked', () => {
  const one = (f) => read(block({ frames: [f] }));
  assert.equal(one(frame('rain', START)).problem, undefined);
  assert.ok(one(frame('coverage', START)).problem, 'a layer that is not on the list');
  assert.ok(one(frame('__proto__', START)).problem);
  assert.ok(one({ ...frame('rain', START), t: START + 0.5 }).problem, 'a time that is not whole');
  assert.ok(one({ ...frame('rain', START), t: '1' }).problem);
  assert.ok(one(frame('rain', END + 1)).problem, 'after the flight');
  assert.ok(one(frame('rain', START - LIMITS.leadS - 1)).problem, 'the only picture is before the window: none is left');
  assert.equal(one(frame('rain', START - LIMITS.leadS)).problem, undefined, 'the frame at or before the start may come before it');
  assert.equal(one(frame('rain', END)).problem, undefined);
  assert.ok(one(frame('rain', START, JPEG64, 'image/jpeg')).problem, 'only PNG (its size is read from its header)');
  assert.ok(one(frame('rain', START, WEBP64, 'image/webp')).problem);
  assert.ok(one(frame('rain', START, SVG64, 'image/svg+xml')).problem, 'never SVG');
  assert.ok(one(frame('rain', START, PNG64, 'image/gif')).problem);
  assert.ok(one(frame('rain', START, SVG64, 'image/png')).problem, 'a type the picture doesn\'t bear out');
  assert.ok(one(frame('rain', START, PNG64, 'image/jpeg')).problem, 'the other way round');
  assert.ok(one(frame('rain', START, `${PNG64}!`)).problem, 'not base64');
  assert.ok(one(frame('rain', START, PNG64.slice(0, -1))).problem, 'base64 that stops short');
  assert.ok(one(frame('rain', START, 'data:image/png;base64,' + PNG64)).problem, 'a data address is not the bytes');
  assert.ok(one(frame('rain', START, 5)).problem);
  assert.ok(one(null).problem);
  assert.ok(one('rain').problem);
});

test('untrusted: the sizes and counts are held', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(LIMITS.maxFrameBytes)]).toString('base64');
  assert.ok(read(block({ frames: [frame('rain', START, big)] })).problem, 'one frame over its limit');
  const window = Array.from({ length: LIMITS.maxFramesPerLayer + 1 }, (_, i) => frame('rain', START + i * 10));
  assert.ok(read(block({ frames: window })).problem, 'over 100 in a layer');
  assert.equal(read(block({ frames: window.slice(0, LIMITS.maxFramesPerLayer) })).problem, undefined, 'exactly 100 is fine');
  assert.ok(read(block({ frames: [frame('rain', START), frame('rain', START)] })).problem, 'two frames for one layer and time');
  const chunk = Buffer.concat([PNG, Buffer.alloc(LIMITS.maxFrameBytes - PNG.length - 10)]).toString('base64');
  const total = Array.from({ length: 17 }, (_, i) => frame('rain', START + i * 60, chunk)); // 17 x 1.5 MB > 25 MB
  assert.ok(read(block({ frames: [...total.slice(0, 9)].concat(total.slice(9).map((f, i) => ({ ...f, layer: 'snow', t: START + i * 60 }))) })).problem, 'over 25 MB in all');
});

test('untrusted: the box must be in range, in order and no bigger than 30°', () => {
  const box = (b) => read(block({ box: b }));
  const ok = { minLat: 49.5, maxLat: 51.1, minLon: -106.79, maxLon: -104.41 };
  assert.equal(box(ok).problem, undefined);
  assert.ok(box({ ...ok, minLat: 52 }).problem, 'out of order');
  assert.ok(box({ ...ok, minLon: -105, maxLon: -105 }).problem, 'no width');
  assert.ok(box({ ...ok, maxLat: 91 }).problem);
  assert.ok(box({ ...ok, minLon: -181 }).problem);
  assert.ok(box({ ...ok, minLat: 10, maxLat: 45 }).problem, 'bigger than 30°');
  assert.ok(box({ ...ok, minLat: '49' }).problem);
  assert.ok(box(null).problem);
  assert.ok(box({ ...ok, maxLat: NaN }).problem);
});

test('untrusted: fields the block does not define are dropped, not passed on', () => {
  const dirty = block({ extra: '<script>', frames: [{ ...frame('rain', START), onload: 'x', href: 'javascript:1' }], fetchedT: 'soon' });
  const got = read(dirty);
  assert.deepEqual(Object.keys(got.saved).sort(), ['box', 'fetchedT', 'frames', 'thin']);
  assert.deepEqual(Object.keys(got.saved.frames[0]).sort(), ['data', 'layer', 'mime', 't']);
  assert.equal(got.saved.fetchedT, null, 'a fetch time that is not a number is not kept');
  assert.equal(got.saved.frames[0].data, PNG64);
});

// --- Playback ---------------------------------------------------------------

test('the last frame at or before the moment, with its age; never a later one', () => {
  const saved = goodSaved();
  const t = (hhmm) => at(`2026-09-30T${hhmm}:00Z`);
  assert.equal(savedFrameAt(saved, 'rain', t('06:12'))?.frame.t, t('06:12'));
  assert.equal(savedFrameAt(saved, 'rain', t('06:12'))?.ageS, 0);
  assert.equal(savedFrameAt(saved, 'rain', t('06:17'))?.frame.t, t('06:12'));
  assert.equal(savedFrameAt(saved, 'rain', t('06:17'))?.ageS, 5 * 60);
  assert.equal(savedFrameAt(saved, 'rain', t('06:05')), null, 'before the first frame: nothing, not the next one');
  assert.equal(savedFrameAt(saved, 'lightning', t('06:19'))?.frame.t, t('06:10'));
  assert.equal(savedFrameAt(saved, 'snow', t('06:30')), null, 'past the layer\'s age limit');
  assert.equal(savedFrameAt(saved, 'coverage', t('06:12')), null);
  assert.equal(savedFrameAt(null, 'rain', t('06:12')), null);
});

test('it is the same rule as the live slices: sliceAt with the same age limits', () => {
  const saved = goodSaved();
  for (const layer of ['rain', 'lightning']) {
    const items = saved.frames.filter((f) => f.layer === layer);
    const limit = MAX_AGE_S[layer === 'lightning' ? 'lightning' : 'radar'];
    for (let t = START - 600; t <= END; t += 47) {
      const live = sliceAt(items, t, limit);
      const kept = savedFrameAt(saved, layer, t);
      assert.equal(kept?.frame.t ?? null, live?.item.t ?? null, `${layer} at ${t}`);
      assert.equal(kept?.ageS ?? null, live?.ageS ?? null);
    }
  }
});

test('thinned frames keep showing: the age limit widens by the thinning step the set records, no more', () => {
  const t = (m) => START + m * 60;
  const frames = [frame('rain', t(0)), frame('rain', t(30))];
  const thinned = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames, thin: 5 }); // every 5th of 6-minute frames: 30 min
  assert.equal(thinned.thin, 5);
  assert.equal(savedFrameAt(thinned, 'rain', t(28))?.frame.t, t(0), '28 min on is past the usual 20 but inside 5 steps of 6 min');
  assert.equal(savedFrameAt(thinned, 'rain', t(31))?.frame.t, t(30));
  assert.equal(savedFrameAt(thinned, 'rain', t(31 - 30 + 31))?.frame.t, t(30));
  // The same two frames with no thinning recorded: an ordinary 20-minute limit.
  const whole = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames });
  assert.equal(whole.thin, 1);
  assert.equal(savedFrameAt(whole, 'rain', t(19))?.frame.t, t(0));
  assert.equal(savedFrameAt(whole, 'rain', t(21)), null);
});

test('a real gap in what ECCC had is not bridged: a 58-minute natural gap shows nothing after the usual age, thinned or not (Y3)', () => {
  const t = (m) => START + m * 60;
  const frames = [frame('rain', t(0)), frame('rain', t(58)), frame('lightning', t(0)), frame('lightning', t(58))];
  for (const thin of [1, 2]) {
    const saved = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames, thin });
    assert.equal(savedFrameAt(saved, 'rain', t(19))?.frame.t, t(0), `thin ${thin}: shown while it is fresh`);
    assert.equal(savedFrameAt(saved, 'rain', t(30)), null, `thin ${thin}: not 30 min on`);
    assert.equal(savedFrameAt(saved, 'rain', t(57)), null);
    assert.equal(savedFrameAt(saved, 'rain', t(58))?.frame.t, t(58));
    assert.equal(savedFrameAt(saved, 'lightning', t(30)), null);
  }
});

test('thinned lightning widens by its own 10-minute step, not radar\'s 6', () => {
  const t = (s) => START + s;
  const saved = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('lightning', t(0))], thin: 4 });
  assert.equal(savedFrameAt(saved, 'lightning', t(2300))?.frame.t, t(0), '4 steps of 600 s is 2,400 s');
  assert.equal(savedFrameAt(saved, 'lightning', t(2401)), null);
});

test('thinning widens the age limit by at most 12 steps', () => {
  assert.equal(LIMITS.maxThin, 12);
  const t = (s) => START + s;
  const saved = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('lightning', t(0))], thin: 13 });
  assert.equal(saved.thin, 12);
  assert.equal(savedFrameAt(saved, 'lightning', t(7200))?.frame.t, t(0), '12 steps of 600 s');
  assert.equal(savedFrameAt(saved, 'lightning', t(7201)), null, 'not a 13th step');
});

test('the thinning step is stored in the block, read back, and capped; nonsense reads as none', () => {
  assert.equal(makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: 1, thin: 3 }).thin, 3);
  assert.equal(makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: 1, thin: 500 }).thin, LIMITS.maxThin);
  assert.equal(makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: 1, thin: 0 }).thin, 1);
  assert.equal(makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: 1, thin: 2.5 }).thin, 1);
  assert.equal(makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: 1 }).thin, 1);
  const saved = makeSaved({ box: savedBox(flightBox), frames: goodFrames(), fetchedT: NOW, thin: 4 });
  assert.equal(read(savedToSetting(saved)).saved.thin, 4);
  for (const bad of [99999, -1, 'x', null, 1.5]) assert.equal(read(block({ thin: bad })).saved.thin, bad === 99999 ? LIMITS.maxThin : 1, String(bad));
  assert.equal(read(block({ thin: undefined })).saved.thin, 1, 'a file from before the step was stored');
});

test('the Radar item draws a rain frame and a snow frame; Lightning its own', () => {
  const saved = goodSaved();
  const t = at('2026-09-30T06:12:00Z');
  assert.deepEqual(framesToDraw(saved, 'radar', t).map((d) => d.layer), ['rain', 'snow']);
  assert.deepEqual(framesToDraw(saved, 'lightning', t).map((d) => d.layer), ['lightning']);
  assert.deepEqual(framesToDraw(saved, 'radar', at('2026-09-30T05:00:00Z')), []);
  assert.deepEqual(framesToDraw(null, 'radar', t), []);
  assert.deepEqual(framesToDraw(saved, 'satellite', t), []);
});

// --- The words --------------------------------------------------------------

test('what a set says about itself', () => {
  const saved = goodSaved();
  assert.equal(savedSummary(saved), 'Kept with this debrief: 6 radar and lightning pictures, 06:00Z to 06:18Z.');
  assert.equal(savedSummary(makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', START)] })), 'Kept with this debrief: 1 radar and lightning picture, 06:10Z.');
  assert.equal(savedSummary(null), '');
});

test('the line under the map for each item', () => {
  const saved = goodSaved();
  const t = at('2026-09-30T06:14:00Z');
  const base = { on: true, recent: true, saved, t };
  assert.equal(radarNote({ ...base, item: 'radar', on: false }), '');
  assert.equal(radarNote({ ...base, item: 'radar' }), 'Radar 06:12Z, 2 min before');
  assert.equal(radarNote({ ...base, item: 'radar', t: at('2026-09-30T06:12:00Z') }), 'Radar 06:12Z, at this moment');
  assert.equal(radarNote({ ...base, item: 'lightning' }), 'Lightning 06:10Z, 4 min before');
  assert.equal(radarNote({ ...base, item: 'radar', t: at('2026-09-30T06:01:00Z') }), 'Radar: no picture kept for this moment.');
  assert.equal(radarNote({ ...base, item: 'radar', t: at('2026-09-30T07:00:00Z') }), 'Radar: no picture kept for this moment.');
  // Nothing saved: within 3 hours it can still be, later, it can't.
  assert.equal(radarNote({ ...base, item: 'radar', saved: null }), 'Radar not saved yet: use Save radar and lightning with this debrief in the Weather menu.');
  assert.equal(radarNote({ ...base, item: 'radar', saved: null, recent: false }), 'Not kept: radar is only available for 3 hours after the flight.');
  assert.equal(radarNote({ ...base, item: 'lightning', saved: null, recent: false }), 'Not kept: lightning is only available for 3 hours after the flight.');
  // A set that has this flight's radar but no lightning says so.
  const noLightning = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', START)] });
  assert.equal(radarNote({ ...base, item: 'lightning', saved: noLightning }), 'Lightning: none was saved with this debrief.');
});

test('the line under the map joins the items that are on, with ECCC\'s credit once, and only when a picture is shown', () => {
  const saved = goodSaved();
  const t = at('2026-09-30T06:14:00Z');
  const line = (o) => savedNoteLine({ radar: false, lightning: false, recent: true, saved, t, ...o });
  assert.equal(line({}), '');
  assert.equal(line({ radar: true }), 'Radar 06:12Z, 2 min before · Data Source: Environment and Climate Change Canada');
  assert.equal(line({ radar: true, lightning: true }),
    'Radar 06:12Z, 2 min before · Lightning 06:10Z, 4 min before · Data Source: Environment and Climate Change Canada');
  assert.equal(line({ radar: true, t: at('2026-09-30T05:00:00Z') }), 'Radar: no picture kept for this moment.', 'no credit for a picture that isn\'t shown');
  assert.equal(line({ radar: true, lightning: true, saved: null, recent: false }),
    'Not kept: radar is only available for 3 hours after the flight. · Not kept: lightning is only available for 3 hours after the flight.');
  assert.equal(line({ lightning: true, saved: null }), 'Lightning not saved yet: use Save radar and lightning with this debrief in the Weather menu.');
});

// --- Only PNG, and only small ones (a small file can decode to a huge picture) --------------------

test('a PNG\'s size is read from its header, and nothing else has one to read', () => {
  assert.deepEqual(pngSizeOfBase64(PNG64), { width: 1, height: 1 });
  assert.deepEqual(pngSizeOfBase64(BOMB64), { width: 16000, height: 16000 });
  assert.deepEqual(pngSizeOfBase64(pngHeader(1024, 768).toString('base64')), { width: 1024, height: 768 });
  assert.equal(pngSizeOfBase64(JPEG64), null);
  assert.equal(pngSizeOfBase64(SVG64), null);
  assert.equal(pngSizeOfBase64(''), null);
  assert.equal(pngSizeOfBase64(PNG64.slice(0, 28)), null, 'too short to hold the header');
  const notIhdr = pngHeader(4, 4);
  notIhdr.write('IDAT', 12);
  assert.equal(pngSizeOfBase64(notIhdr.toString('base64')), null, 'the first chunk must be IHDR');
});

test('untrusted: a small file that decodes to a huge picture is refused, and the limit is the largest picture asked for', () => {
  const one = (data) => read(block({ frames: [frame('rain', START, data)] }));
  assert.equal(pngHeader(16000, 16000).length < 2000, true, 'the bomb is tiny on disk');
  assert.match(one(BOMB64).problem, /too large|too big/);
  assert.equal(one(pngHeader(LIMITS.maxPixels, LIMITS.maxPixels).toString('base64')).problem, undefined, 'the largest picture asked for is fine');
  assert.ok(one(pngHeader(LIMITS.maxPixels + 1, 10).toString('base64')).problem);
  assert.ok(one(pngHeader(10, LIMITS.maxPixels + 1).toString('base64')).problem);
  assert.ok(one(pngHeader(0, 10).toString('base64')).problem, 'a picture with no width');
});

test('a fetched reply that decodes to a huge picture is not kept either', () => {
  assert.equal(frameFromReply({ contentType: 'image/png', bytes: new Uint8Array(pngHeader(16000, 16000)) }), null);
  assert.deepEqual(frameFromReply({ contentType: 'image/png', bytes: new Uint8Array(pngHeader(1024, 1024)) })?.mime, 'image/png');
  assert.equal(frameFromReply({ contentType: 'image/jpeg', bytes: new Uint8Array(Buffer.from(JPEG64, 'base64')) }), null, 'PNG only, as asked for');
});

// --- The window: one rule for the writer and the reader (Y2) --------------------------------------

test('the window is from an hour before the start (the frame at or before it, even on a 30-minute step) to the end', () => {
  assert.equal(LIMITS.leadS, 60 * 60);
  assert.equal(inWindow(START - 60 * 60, START, END), true);
  assert.equal(inWindow(START - 60 * 60 - 1, START, END), false);
  assert.equal(inWindow(END, START, END), true);
  assert.equal(inWindow(END + 1, START, END), false);
  assert.equal(inWindow(NaN, START, END), false);
  assert.equal(inWindow(START, NaN, END), false);
  assert.equal(inWindow(START, START, undefined), false);
});

test('a frame 1,740 s before the start (a 30-minute step) is inside the reader\'s window', () => {
  const t = at('2026-09-30T06:00:00Z');
  const saved = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', t), frame('rain', t + 1800)] });
  const got = savedFromSetting(savedToSetting(saved), { startT: t + 1740, endT: t + 3000 });
  assert.equal(got.problem, undefined);
  assert.equal(got.saved.frames.length, 2);
});

test('the frame times are whole seconds, whatever the reply\'s time list gave', () => {
  const times = { start: new Date('2026-09-30T04:30:00.400Z'), end: new Date('2026-09-30T07:30:00.400Z'), stepMs: 360_000 };
  const got = coveringTimes(times, START, END, 360);
  assert.ok(got.length > 0 && got.every((t) => Number.isInteger(t)));
});

test('untrusted: when the flight\'s window has moved, the pictures outside it are dropped, not the whole block', () => {
  const saved = goodSaved(); // rain 06:06, 06:12, 06:18; snow 06:06; lightning 06:00, 06:10
  const got = savedFromSetting(savedToSetting(saved), { startT: at('2026-09-30T06:14:00Z') + 4000, endT: at('2026-09-30T06:14:00Z') + 4000 + 1800 });
  assert.equal(got.saved, undefined, 'none of them is inside: nothing to keep');
  assert.match(got.problem, /couldn't be read/);
  const shifted = savedFromSetting(savedToSetting(saved), { startT: at('2026-09-30T06:00:00Z') - 5 * 3600, endT: at('2026-09-30T06:11:00Z') });
  assert.equal(shifted.problem, undefined);
  assert.deepEqual(shifted.saved.frames.map((f) => `${f.layer}@${hhmm(f.t)}`), ['rain@06:06', 'snow@06:06', 'lightning@06:00', 'lightning@06:10']);
  assert.equal(shifted.dropped, 2);
});

const hhmm = (t) => new Date(t * 1000).toISOString().slice(11, 16);

test('untrusted: a flight with no times cannot vouch for anything, so nothing is read', () => {
  const text = savedToSetting(goodSaved());
  for (const bad of [{ startT: NaN, endT: END }, { startT: START, endT: NaN }, { startT: undefined, endT: undefined }, { startT: Infinity, endT: END }]) {
    assert.match(savedFromSetting(text, bad).problem, /couldn't be read/, JSON.stringify(bad));
  }
});

test('untrusted: a base64 string of the right length with a bad character inside is refused', () => {
  const bad = `${PNG64.slice(0, 40)}!${PNG64.slice(41)}`;
  assert.equal(bad.length, PNG64.length);
  assert.equal(bad.length % 4, 0);
  assert.ok(read(block({ frames: [frame('rain', START, bad)] })).problem);
  const padded = `${PNG64.slice(0, -4)}=AAA`;
  assert.ok(read(block({ frames: [frame('rain', START, padded)] })).problem, 'padding in the middle');
});

test('untrusted: a well-formed block over the character limit is refused before it is parsed', () => {
  const text = JSON.stringify(block()) + ' '.repeat(MAX_SAVED_CHARS);
  assert.ok(text.length > MAX_SAVED_CHARS);
  assert.doesNotThrow(() => JSON.parse(text), 'it is valid JSON');
  assert.match(savedFromSetting(text, { startT: START, endT: END }).problem, /too big/);
});

test('what goes in the file is read back by the same checks first, and refused if they would fail it', () => {
  const good = weatherForFile(goodSaved(), { startT: START, endT: END });
  assert.equal(good.problem, undefined);
  assert.deepEqual(savedFromSetting(good.text, { startT: START, endT: END }).saved, goodSaved());
  // A set that does not fit the flight: refused, in words, and no text.
  const stray = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', END + 7200)] });
  const bad = weatherForFile(stray, { startT: START, endT: END });
  assert.equal(bad.text, undefined);
  assert.match(bad.problem, /couldn't be put in the file/);
  // Frames the reader would drop count as a failure too: what is written is what is read.
  const partly = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', START), frame('rain', END + 7200)] });
  assert.match(weatherForFile(partly, { startT: START, endT: END }).problem, /couldn't be put in the file/);
  // One second past the end is outside the flight too, and the words say so.
  const justAfter = makeSaved({ box: savedBox(flightBox), fetchedT: NOW, frames: [frame('rain', START), frame('rain', END + 1)] });
  const after = weatherForFile(justAfter, { startT: START, endT: END });
  assert.equal(after.text, undefined);
  assert.match(after.problem, /\(some pictures fall outside the flight\)/);
});
