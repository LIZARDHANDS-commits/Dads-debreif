import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GEOMET_URL, LAYERS, STALE_MS, REFRESH_MS, DEFAULT_BBOX,
  getMapUrl, parseLayerTimes, parseRainViewer, rainViewerTileUrl,
  initialFeedSource, nextFeedSource, feedAge, bboxToMercator,
} from '../../../src/modules/sof/feeds.js';

// Real replies captured 2026-09-30 about 07:20Z (tests/fixtures/sof): ECCC's per-layer
// GetCapabilities with the layer's own description cut down to its name, area and times,
// and RainViewer's weather-maps.json verbatim.
const fixture = (name) => readFileSync(new URL(`../../fixtures/sof/${name}`, import.meta.url), 'utf8');
const caps = (layer) => fixture(`geomet-caps-${layer}.xml`);
const RAINVIEWER = fixture('rainviewer-weather-maps.json');
const MIN = 60_000;
const utc = (s) => new Date(s);

// --- GetMap addresses -------------------------------------------------------

test('the four layers are the ones the spec names', () => {
  assert.deepEqual({ ...LAYERS }, {
    radarRain: 'RADAR_1KM_RRAI',
    radarSnow: 'RADAR_1KM_RSNO',
    lightning: 'Lightning_2.5km_Density',
    coverage: 'RADAR_COVERAGE_RRAI.INV',
  });
  assert.equal(GEOMET_URL, 'https://geo.weather.gc.ca/geomet');
});

test('getMapUrl with nothing given builds a valid default request for the rain radar', () => {
  const u = new URL(getMapUrl());
  assert.equal(u.origin + u.pathname, 'https://geo.weather.gc.ca/geomet');
  const p = u.searchParams;
  assert.equal(p.get('service'), 'WMS');
  assert.equal(p.get('version'), '1.3.0');
  assert.equal(p.get('request'), 'GetMap');
  assert.equal(p.get('layers'), 'RADAR_1KM_RRAI');
  assert.equal(p.get('crs'), 'EPSG:3857');
  assert.equal(p.get('format'), 'image/png');
  assert.equal(p.get('transparent'), 'true');
  assert.equal(p.get('styles'), '');
  assert.equal(p.has('time'), false);
  assert.equal(Number(p.get('width')) > 0 && Number(p.get('height')) > 0, true);
  assert.equal(p.get('bbox').split(',').length, 4);
});

test('getMapUrl uses exactly the numbers it is given, with the time as ISO seconds', () => {
  const url = getMapUrl({
    layer: LAYERS.lightning, bbox: [-110, 49, -100, 52], width: 1200, height: 600, time: utc('2026-09-30T07:00:00Z'),
  });
  const p = new URL(url).searchParams;
  assert.equal(p.get('layers'), 'Lightning_2.5km_Density');
  assert.equal(p.get('width'), '1200');
  assert.equal(p.get('height'), '600');
  assert.equal(p.get('time'), '2026-09-30T07:00:00Z');
  assert.deepEqual([...p.keys()].sort(), ['bbox', 'crs', 'format', 'height', 'layers', 'request', 'service', 'styles', 'time', 'transparent', 'version', 'width']);
});

test('the coverage layer name, which has a dot, is allowed', () => {
  const p = new URL(getMapUrl({ layer: LAYERS.coverage })).searchParams;
  assert.equal(p.get('layers'), 'RADAR_COVERAGE_RRAI.INV');
});

test('bbox is given in degrees and sent in web mercator metres by default', () => {
  const [x0, y0, x1, y1] = bboxToMercator([-180, -45, 180, 45]);
  assert.ok(Math.abs(x0 + 20037508.34) < 0.01);
  assert.ok(Math.abs(x1 - 20037508.34) < 0.01);
  assert.ok(Math.abs(y1 - 5621521.49) < 0.01);
  assert.ok(Math.abs(y0 + 5621521.49) < 0.01);
  const [ox, oy] = bboxToMercator([0, 0, 1, 1]);
  assert.equal(ox, 0);
  assert.equal(oy, 0);
  const sent = new URL(getMapUrl({ bbox: [-180, -45, 180, 45] })).searchParams.get('bbox').split(',').map(Number);
  assert.ok(Math.abs(sent[2] - 20037508.34) < 0.01);
  assert.ok(Math.abs(sent[3] - 5621521.49) < 0.01);
});

test('EPSG:4326 goes out in WMS 1.3.0 axis order: south, west, north, east', () => {
  const p = new URL(getMapUrl({ crs: 'EPSG:4326', bbox: [-110, 49, -100, 52] })).searchParams;
  assert.equal(p.get('crs'), 'EPSG:4326');
  assert.equal(p.get('bbox'), '49,-110,52,-100');
});

test('the address never changes its host, whatever is passed', () => {
  for (const layer of Object.values(LAYERS)) {
    assert.ok(getMapUrl({ layer }).startsWith('https://geo.weather.gc.ca/geomet?'));
  }
});

test('getMapUrl refuses layer names that are not on the list', () => {
  for (const layer of ['radar', 'RADAR_1KM_RRAI&layers=x', 'radar_1km_rrai', '', null, 42, '../x', 'RADAR_1KM_RRAI\n', {}]) {
    assert.throws(() => getMapUrl({ layer }), RangeError, String(layer));
  }
});

test('getMapUrl refuses a bbox that is not four finite, ordered, in-range numbers', () => {
  const bad = [
    [], [1, 2, 3], [1, 2, 3, 4, 5], 'a,b,c,d', null, { west: 1 },
    [NaN, 49, -100, 52], [-110, Infinity, -100, 52], ['-110', 49, -100, 52], [-110, 49, null, 52],
    [-100, 49, -110, 52], [-110, 52, -100, 49], [-110, 49, -110, 52],
    [-181, 49, -100, 52], [-110, 49, 181, 52], [-110, -91, -100, 52], [-110, 49, -100, 91],
    [-110, -86, -100, 52], [-110, 49, -100, 86],
  ];
  for (const bbox of bad) assert.throws(() => getMapUrl({ bbox }), RangeError, JSON.stringify(bbox));
  // The poles are fine in EPSG:4326, where there is no mercator limit.
  assert.doesNotThrow(() => getMapUrl({ crs: 'EPSG:4326', bbox: [-110, -90, -100, 90] }));
});

test('getMapUrl refuses a width or height that is not a whole number from 16 to 2048', () => {
  for (const bad of [0, 15, 2049, 100.5, NaN, Infinity, -1, '800', null]) {
    assert.throws(() => getMapUrl({ width: bad }), RangeError, `width ${bad}`);
    assert.throws(() => getMapUrl({ height: bad }), RangeError, `height ${bad}`);
  }
  assert.doesNotThrow(() => getMapUrl({ width: 16, height: 2048 }));
});

test('getMapUrl refuses a crs that is not on the list', () => {
  for (const crs of ['EPSG:3978', 'epsg:3857', 'EPSG:3857&x=1', '', null, 3857]) {
    assert.throws(() => getMapUrl({ crs }), RangeError, String(crs));
  }
});

test('the time must be a real date (Date, ms or ISO text) and is sent normalised', () => {
  const at = (time) => new URL(getMapUrl({ time })).searchParams.get('time');
  assert.equal(at(utc('2026-09-30T07:12:00.999Z')), '2026-09-30T07:12:00Z');
  assert.equal(at(Date.parse('2026-09-30T07:12:00Z')), '2026-09-30T07:12:00Z');
  assert.equal(at('2026-09-30T07:12:00Z'), '2026-09-30T07:12:00Z');
  for (const bad of ['now', '2026-09-30', '2026-09-30T07:12:00Z&x=1', '2026-13-30T07:12:00Z', new Date('nope'), NaN, Infinity, '<script>', {}, '1999-01-01T00:00:00Z', '2101-01-01T00:00:00Z']) {
    assert.throws(() => getMapUrl({ time: bad }), RangeError, String(bad));
  }
});

test('an explicit time of undefined means "no time" (ECCC then draws its latest)', () => {
  assert.equal(new URL(getMapUrl({ time: undefined })).searchParams.has('time'), false);
});

test('the default bbox is southern Saskatchewan and is itself valid', () => {
  assert.equal(DEFAULT_BBOX.length, 4);
  assert.doesNotThrow(() => getMapUrl({ bbox: DEFAULT_BBOX }));
  assert.ok(DEFAULT_BBOX[0] < -105.56 && DEFAULT_BBOX[2] > -105.56 && DEFAULT_BBOX[1] < 50.33 && DEFAULT_BBOX[3] > 50.33);
});

// --- A layer's latest time, from its GetCapabilities ------------------------

test('radar: the latest time is the layer default, with its start, end and step', () => {
  const t = parseLayerTimes(caps('RADAR_1KM_RRAI'), 'RADAR_1KM_RRAI');
  assert.equal(t.layer, 'RADAR_1KM_RRAI');
  assert.equal(+t.latest, +utc('2026-09-30T07:12:00Z'));
  assert.equal(+t.start, +utc('2026-09-30T04:12:00Z'));
  assert.equal(+t.end, +utc('2026-09-30T07:12:00Z'));
  assert.equal(t.stepMs, 6 * MIN);
});

test('every layer we use reads from its own captured reply', () => {
  const expected = {
    RADAR_1KM_RRAI: ['2026-09-30T07:12:00Z', 6],
    RADAR_1KM_RSNO: ['2026-09-30T07:12:00Z', 6],
    'Lightning_2.5km_Density': ['2026-09-30T07:00:00Z', 10],
    'RADAR_COVERAGE_RRAI.INV': ['2026-09-30T07:12:00Z', 6],
  };
  for (const [layer, [latest, stepMin]] of Object.entries(expected)) {
    const t = parseLayerTimes(caps(layer), layer);
    assert.equal(+t.latest, +utc(latest), layer);
    assert.equal(t.stepMs, stepMin * MIN, layer);
  }
});

test('a reply about a different layer than the one asked for reads as nothing', () => {
  assert.equal(parseLayerTimes(caps('RADAR_1KM_RRAI'), 'Lightning_2.5km_Density'), null);
  assert.equal(parseLayerTimes(caps('RADAR_COVERAGE_RRAI.INV'), 'RADAR_1KM_RRAI'), null);
});

test('a layer name that is not on the list reads as nothing', () => {
  assert.equal(parseLayerTimes(caps('RADAR_1KM_RRAI'), 'RADAR_1KM_RRAI.x'), null);
  assert.equal(parseLayerTimes(caps('RADAR_1KM_RRAI'), '.*'), null);
  assert.equal(parseLayerTimes(caps('RADAR_1KM_RRAI'), undefined), null);
});

const layerXml = (name, dimension, extra = '') =>
  `<WMS_Capabilities><Capability><Layer><Layer><Name>${name}</Name>${extra}${dimension}</Layer></Layer></Capability></WMS_Capabilities>`;
const dim = (text, attrs = '') => `<Dimension name="time" units="ISO8601" ${attrs}>${text}</Dimension>`;

test('with no default attribute the latest is the end of the range', () => {
  const xml = layerXml('RADAR_1KM_RRAI', dim('2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M'));
  assert.equal(+parseLayerTimes(xml, 'RADAR_1KM_RRAI').latest, +utc('2026-09-30T07:12:00Z'));
});

test('a comma list of times, or several ranges, gives the last one', () => {
  const list = layerXml('RADAR_1KM_RRAI', dim('2026-09-30T06:54:00Z,2026-09-30T07:00:00Z,2026-09-30T07:06:00Z'));
  const t = parseLayerTimes(list, 'RADAR_1KM_RRAI');
  assert.equal(+t.latest, +utc('2026-09-30T07:06:00Z'));
  assert.equal(t.stepMs, null);
  const ranges = layerXml('RADAR_1KM_RRAI', dim('2026-09-30T01:00:00Z/2026-09-30T02:00:00Z/PT6M,2026-09-30T05:00:00Z/2026-09-30T07:12:00Z/PT6M'));
  assert.equal(+parseLayerTimes(ranges, 'RADAR_1KM_RRAI').latest, +utc('2026-09-30T07:12:00Z'));
});

test('a default that is not a time is ignored in favour of the range', () => {
  const xml = layerXml('RADAR_1KM_RRAI', dim('2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M', 'default="soon"'));
  assert.equal(+parseLayerTimes(xml, 'RADAR_1KM_RRAI').latest, +utc('2026-09-30T07:12:00Z'));
  // A bracket inside an attribute is not a readable Dimension at all: nothing, never a guess.
  assert.equal(parseLayerTimes(layerXml('RADAR_1KM_RRAI', dim('2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M', 'default="<script>"')), 'RADAR_1KM_RRAI'), null);
  const junk = layerXml('RADAR_1KM_RRAI', dim('2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M', 'default="2026-13-45T99:99:99Z"'));
  assert.equal(+parseLayerTimes(junk, 'RADAR_1KM_RRAI').latest, +utc('2026-09-30T07:12:00Z'));
});

test('periods in hours, minutes and seconds are read; anything else is no step', () => {
  const step = (p) => parseLayerTimes(layerXml('RADAR_1KM_RRAI', dim(`2026-09-30T04:00:00Z/2026-09-30T07:00:00Z/${p}`)), 'RADAR_1KM_RRAI').stepMs;
  assert.equal(step('PT6M'), 6 * MIN);
  assert.equal(step('PT1H'), 60 * MIN);
  assert.equal(step('PT30S'), 30_000);
  assert.equal(step('PT1H30M'), 90 * MIN);
  assert.equal(step('P1D'), null);
  assert.equal(step('PT0M'), null);
  assert.equal(step('junk'), null);
});

test('replies with no usable time read as nothing, never a guess', () => {
  const bad = [
    '', 'not xml', '<html>502 Bad Gateway</html>', '<ServiceExceptionReport><ServiceException>Layer not found</ServiceException></ServiceExceptionReport>',
    layerXml('RADAR_1KM_RRAI', ''),
    layerXml('RADAR_1KM_RRAI', dim('')),
    layerXml('RADAR_1KM_RRAI', dim('soon')),
    layerXml('RADAR_1KM_RRAI', dim('2026-09-30T04:12:00Z/garbage/PT6M')),
    layerXml('RADAR_1KM_RRAI', dim('1999-01-01T00:00:00Z')),
    layerXml('RADAR_1KM_RRAI', '<Dimension name="elevation">0</Dimension>'),
    null, undefined, 42, {},
  ];
  for (const xml of bad) assert.equal(parseLayerTimes(xml, 'RADAR_1KM_RRAI'), null, String(xml).slice(0, 60));
});

test('a layer with no time of its own is not given the next layer\'s time', () => {
  const xml = '<Capability><Layer><Name>RADAR_1KM_RRAI</Name><Title>x</Title></Layer>'
    + `<Layer><Name>RADAR_1KM_RSNO</Name>${dim('2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M')}</Layer></Capability>`;
  assert.equal(parseLayerTimes(xml, 'RADAR_1KM_RRAI'), null);
  assert.ok(parseLayerTimes(xml, 'RADAR_1KM_RSNO'));
});

test('a reply over the size cap is not searched (a whole-server list is 40 MB)', () => {
  const big = caps('RADAR_1KM_RRAI') + ' '.repeat(300 * 1024);
  assert.equal(parseLayerTimes(big, 'RADAR_1KM_RRAI'), null);
});

test('the layer time is a Date and the result is frozen data, not the reply text', () => {
  const t = parseLayerTimes(caps('RADAR_1KM_RRAI'), 'RADAR_1KM_RRAI');
  assert.ok(t.latest instanceof Date);
  assert.deepEqual(Object.keys(t).sort(), ['end', 'latest', 'layer', 'start', 'stepMs']);
});

// --- RainViewer backup ------------------------------------------------------

test('RainViewer: the past frames are read from the real reply, oldest first', () => {
  const rv = parseRainViewer(RAINVIEWER);
  assert.equal(rv.frames.length, 13);
  assert.equal(+rv.frames[0].time, 1790745000 * 1000);
  assert.equal(rv.frames[0].path, '/v2/radar/3a9736287701');
  assert.equal(rv.latest.path, '/v2/radar/165873caca55');
  assert.equal(+rv.latest.time, 1790752200 * 1000);
  assert.equal(+rv.generated, 1790752534 * 1000);
});

test('RainViewer: a parsed object works as well as text', () => {
  assert.equal(parseRainViewer(JSON.parse(RAINVIEWER)).frames.length, 13);
});

test('RainViewer: paths that do not match the documented pattern are dropped', () => {
  const json = { radar: { past: [
    { time: 1790750400, path: '/v2/radar/fde4dac457d6' },
    { time: 1790751000, path: '/v2/radar/../../evil' },
    { time: 1790751100, path: 'https://evil.example/v2/radar/abcdef012345' },
    { time: 1790751200, path: '/v2/radar/abc def' },
    { time: 1790751300, path: '/v2/radar/abc?x=1' },
    { time: 1790751400, path: '/v2/radar/' },
    { time: 1790751500, path: '/v2/radar/ABCDEF0123' },
    { time: 1790751600, path: 42 },
    { time: 1790751700, path: '/v2/radar/259b9c16090e' },
  ] } };
  assert.deepEqual(parseRainViewer(json).frames.map((f) => f.path), ['/v2/radar/fde4dac457d6', '/v2/radar/259b9c16090e']);
});

test('RainViewer: frames with a bad time are dropped', () => {
  const p = '/v2/radar/fde4dac457d6';
  const json = { radar: { past: [
    { time: 'now', path: p }, { time: -5, path: p }, { time: 1.5, path: p }, { time: NaN, path: p }, { time: 1e15, path: p }, { path: p },
    { time: 1790750400, path: p },
  ] } };
  assert.equal(parseRainViewer(json).frames.length, 1);
});

test('RainViewer: wrong shapes read as nothing', () => {
  const bad = [
    '', 'not json', 'null', '[]', '{}', '{"radar":null}', '{"radar":{}}', '{"radar":{"past":"x"}}', '{"radar":{"past":[]}}',
    '{"radar":{"past":[null,7,"x",[]]}}', null, undefined, 7, [], 'x'.repeat(300 * 1024),
  ];
  for (const b of bad) assert.equal(parseRainViewer(b), null, String(b).slice(0, 40));
});

test('RainViewer: at most the last 24 frames are kept', () => {
  const past = Array.from({ length: 60 }, (_, i) => ({ time: 1790000000 + i * 600, path: `/v2/radar/${(0x100000 + i).toString(16)}` }));
  const rv = parseRainViewer({ radar: { past } });
  assert.equal(rv.frames.length, 24);
  assert.equal(rv.latest.path, past[59].path);
});

test('RainViewer: the tile address is built from the frame path and numbers, on RainViewer\'s host only', () => {
  const rv = parseRainViewer(RAINVIEWER);
  assert.equal(
    rainViewerTileUrl(rv.latest, { z: 6, x: 10, y: 21 }),
    'https://tilecache.rainviewer.com/v2/radar/165873caca55/256/6/10/21/2/1_1.png',
  );
  assert.equal(
    rainViewerTileUrl(rv.latest, { z: 7, x: 127, y: 0, size: 512, color: 4, smooth: false, snow: false }),
    'https://tilecache.rainviewer.com/v2/radar/165873caca55/512/7/127/0/4/0_0.png',
  );
});

test('RainViewer: the host in its reply is not trusted for the tile address', () => {
  const json = JSON.parse(RAINVIEWER);
  json.host = 'https://evil.example';
  const rv = parseRainViewer(json);
  assert.ok(rainViewerTileUrl(rv.latest).startsWith('https://tilecache.rainviewer.com/'));
});

test('RainViewer: tile numbers are checked (zoom 0 to 7, x and y inside the grid)', () => {
  const frame = { path: '/v2/radar/165873caca55' };
  assert.doesNotThrow(() => rainViewerTileUrl(frame));
  for (const bad of [{ z: 8 }, { z: -1 }, { z: 1.5 }, { z: NaN }, { z: '3' }, { z: 3, x: 8 }, { z: 3, y: -1 }, { z: 3, x: 1.5 },
    { size: 128 }, { color: 9 }, { color: -1 }, { color: 1.5 }, { smooth: 'yes' }, { snow: 2 }]) {
    assert.throws(() => rainViewerTileUrl(frame, bad), RangeError, JSON.stringify(bad));
  }
  assert.throws(() => rainViewerTileUrl({ path: '/v2/radar/../x' }), RangeError);
  assert.throws(() => rainViewerTileUrl(null), RangeError);
});

// --- ECCC to RainViewer and back --------------------------------------------

test('starts on ECCC with no failures', () => {
  assert.deepEqual(initialFeedSource(), { source: 'eccc', failures: 0 });
});

test('one ECCC failure stays on ECCC; the second in a row switches to RainViewer', () => {
  let s = initialFeedSource();
  s = nextFeedSource(s, false);
  assert.deepEqual(s, { source: 'eccc', failures: 1 });
  s = nextFeedSource(s, false);
  assert.deepEqual(s, { source: 'rainviewer', failures: 2 });
});

test('a success in between resets the count, so only consecutive failures count', () => {
  let s = initialFeedSource();
  s = nextFeedSource(s, false);
  s = nextFeedSource(s, true);
  assert.deepEqual(s, { source: 'eccc', failures: 0 });
  s = nextFeedSource(s, false);
  assert.deepEqual(s, { source: 'eccc', failures: 1 });
});

test('on RainViewer it stays there while ECCC keeps failing, and returns on the first ECCC success', () => {
  let s = { source: 'rainviewer', failures: 2 };
  for (let i = 0; i < 50; i++) s = nextFeedSource(s, false);
  assert.deepEqual(s, { source: 'rainviewer', failures: 2 });
  s = nextFeedSource(s, true);
  assert.deepEqual(s, { source: 'eccc', failures: 0 });
});

test('the switch point can be changed, and a nonsense one falls back to two', () => {
  const run = (after, n) => {
    let s = initialFeedSource();
    for (let i = 0; i < n; i++) s = nextFeedSource(s, false, { after });
    return s.source;
  };
  assert.equal(run(1, 1), 'rainviewer');
  assert.equal(run(3, 2), 'eccc');
  assert.equal(run(3, 3), 'rainviewer');
  for (const bad of [0, -1, NaN, 1.5, '2', null, Infinity]) assert.equal(run(bad, 1), 'eccc', String(bad));
  for (const bad of [0, -1, NaN, 1.5, '2', null, Infinity]) assert.equal(run(bad, 2), 'rainviewer', String(bad));
});

test('the state is never changed in place, and a damaged state starts over', () => {
  const s = Object.freeze({ source: 'eccc', failures: 1 });
  assert.deepEqual(nextFeedSource(s, false), { source: 'rainviewer', failures: 2 });
  assert.deepEqual(s, { source: 'eccc', failures: 1 });
  for (const damaged of [null, undefined, {}, 'x', { source: 'other', failures: 1 }, { source: 'eccc', failures: -3 }, { source: 'eccc', failures: NaN }]) {
    assert.deepEqual(nextFeedSource(damaged, true), { source: 'eccc', failures: 0 });
    assert.deepEqual(nextFeedSource(damaged, false), { source: 'eccc', failures: 1 });
  }
});

// --- How old a feed is, from its own time -----------------------------------

test('the limits and refresh times are the spec\'s', () => {
  assert.equal(STALE_MS.radar, 20 * MIN);
  assert.equal(STALE_MS.lightning, 30 * MIN);
  assert.equal(REFRESH_MS.radar, 6 * MIN);
  assert.equal(REFRESH_MS.lightning, 10 * MIN);
});

test('radar is fresh up to 20 minutes old and stale after', () => {
  const now = utc('2026-09-30T07:30:00Z');
  const age = (layerTime) => feedAge({ kind: 'radar', layerTime, now });
  assert.deepEqual(age(utc('2026-09-30T07:12:00Z')), { ageMs: 18 * MIN, ageMin: 18, stale: false, state: 'fresh' });
  assert.equal(age(utc('2026-09-30T07:10:00Z')).state, 'fresh'); // exactly 20 minutes
  assert.equal(age(utc('2026-09-30T07:09:59Z')).state, 'stale');
  assert.equal(age(utc('2026-09-30T07:09:59Z')).stale, true);
  assert.equal(age(utc('2026-09-30T06:30:00Z')).ageMin, 60);
});

test('lightning is fresh up to 30 minutes old and stale after', () => {
  const now = utc('2026-09-30T07:40:00Z');
  const age = (layerTime) => feedAge({ kind: 'lightning', layerTime, now });
  assert.equal(age(utc('2026-09-30T07:10:00Z')).state, 'fresh');
  assert.equal(age(utc('2026-09-30T07:09:00Z')).state, 'stale');
  // The same age is stale for radar but fresh for lightning.
  assert.equal(feedAge({ kind: 'radar', layerTime: utc('2026-09-30T07:15:00Z'), now }).state, 'stale');
  assert.equal(age(utc('2026-09-30T07:15:00Z')).state, 'fresh');
});

test('the age comes from the layer\'s own time, not from when it was fetched', () => {
  // Fetched a second ago, but ECCC is still serving a radar frame from 25 minutes back.
  const now = utc('2026-09-30T07:37:01Z');
  const fetchedAt = utc('2026-09-30T07:37:00Z');
  const layer = parseLayerTimes(caps('RADAR_1KM_RRAI'), 'RADAR_1KM_RRAI'); // 07:12Z
  const fromLayer = feedAge({ kind: 'radar', layerTime: layer.latest, now });
  const fromFetch = feedAge({ kind: 'radar', layerTime: fetchedAt, now });
  assert.equal(fromLayer.state, 'stale');
  assert.equal(fromLayer.ageMin, 25);
  assert.equal(fromFetch.state, 'fresh');
});

test('the layer time may be a Date or milliseconds; a missing or bad one is unknown, and counts as stale', () => {
  const now = utc('2026-09-30T07:30:00Z');
  assert.equal(feedAge({ layerTime: +utc('2026-09-30T07:29:00Z'), now }).ageMin, 1);
  for (const bad of [null, undefined, NaN, 'soon', new Date('x'), {}]) {
    assert.deepEqual(feedAge({ layerTime: bad, now }), { ageMs: null, ageMin: null, stale: true, state: 'unknown' }, String(bad));
  }
});

test('a layer time a little ahead of the clock counts as age zero, not negative', () => {
  const now = utc('2026-09-30T07:30:00Z');
  const a = feedAge({ layerTime: utc('2026-09-30T07:33:00Z'), now });
  assert.deepEqual(a, { ageMs: 0, ageMin: 0, stale: false, state: 'fresh' });
});

test('an unknown kind is refused rather than guessed, and kind defaults to radar', () => {
  const now = utc('2026-09-30T07:30:00Z');
  assert.throws(() => feedAge({ kind: 'traffic', layerTime: now, now }), RangeError);
  assert.equal(feedAge({ layerTime: utc('2026-09-30T07:05:00Z'), now }).state, 'stale');
});

test('the RainViewer backup is aged from its frame time the same way', () => {
  const rv = parseRainViewer(RAINVIEWER); // latest frame 07:10:00Z
  const now = utc('2026-09-30T07:35:00Z');
  assert.equal(feedAge({ kind: 'radar', layerTime: rv.latest.time, now }).state, 'stale');
  assert.equal(feedAge({ kind: 'radar', layerTime: rv.latest.time, now: utc('2026-09-30T07:25:00Z') }).state, 'fresh');
});

// --- Audit fixes ------------------------------------------------------------

test('hostile 256 KB replies are read in linear time, not minutes', () => {
  const head = '<Name>RADAR_1KM_RRAI</Name>';
  const size = 256 * 1024 - head.length - 64;
  const inputs = [
    head + '<Dimension ' + ' '.repeat(40_000),
    head + '<Dimension a'.repeat(20_000),
    head + '<Dimension name="time" ' + 'a'.repeat(size - 30),
    head + '<Dimension name="time">' + '2026-09-30T07:00:00Z,'.repeat(Math.floor(size / 21)),
    head + '<Dimension>'.repeat(Math.floor(size / 11)),
  ];
  for (const xml of inputs) {
    assert.ok(xml.length <= 256 * 1024);
    const t0 = performance.now();
    parseLayerTimes(xml, 'RADAR_1KM_RRAI');
    assert.ok(performance.now() - t0 < 50, `took ${Math.round(performance.now() - t0)} ms`);
  }
});

test('a default outside the layer\'s own start and end is ignored', () => {
  const range = '2026-09-30T04:12:00Z/2026-09-30T07:12:00Z/PT6M';
  const latest = (attrs) => parseLayerTimes(layerXml('RADAR_1KM_RRAI', dim(range, attrs)), 'RADAR_1KM_RRAI').latest;
  assert.equal(+latest('default="2026-09-30T07:06:00Z"'), +utc('2026-09-30T07:06:00Z'));
  assert.equal(+latest('default="2026-09-30T04:12:00Z"'), +utc('2026-09-30T04:12:00Z'));
  assert.equal(+latest('default="2026-09-30T07:12:00Z"'), +utc('2026-09-30T07:12:00Z'));
  assert.equal(+latest('default="2026-09-30T09:00:00Z"'), +utc('2026-09-30T07:12:00Z'));
  assert.equal(+latest('default="2026-09-30T03:00:00Z"'), +utc('2026-09-30T07:12:00Z'));
});

test('a layer time more than 5 minutes ahead of the clock is unknown, not fresh', () => {
  const now = utc('2026-09-30T07:30:00Z');
  const unknown = { ageMs: null, ageMin: null, stale: true, state: 'unknown' };
  assert.deepEqual(feedAge({ layerTime: utc('2026-09-30T07:35:01Z'), now }), unknown);
  assert.deepEqual(feedAge({ layerTime: utc('2026-09-30T12:00:00Z'), now, kind: 'lightning' }), unknown);
  assert.equal(feedAge({ layerTime: utc('2026-09-30T07:35:00Z'), now }).state, 'fresh');
});
