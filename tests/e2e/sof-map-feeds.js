// Serves everything the SOF map asks for from fixtures, so no browser test ever reaches a live feed
// (SPEC-sof, "Map" and "Testing strategy"). To go in tests/e2e/sof-map-feeds.js, next to sof.spec.js and
// sof-map.spec.js, which import it. tests/e2e/fixtures.js also calls `serveMap` for every page (see
// registry-entry.md, item 3): without it each spec that opens the SOF would ask the real ECCC, Esri and
// RainViewer, and the unanswered requests would log console errors, which fixtures.js counts as bugs.
//
// Pictures are made here with a few lines of zlib, so the repo keeps no binary files for them.
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

export const fixture = (name) => readFileSync(new URL(`../fixtures/sof/${name}`, import.meta.url), 'utf8');

export const CORS = { 'access-control-allow-origin': '*' };
export const MET_NO = /^https:\/\/api\.met\.no\//;
export const DATAMASK = /^https:\/\/datamask\.org\//;
export const GEOMET = /^https:\/\/geo\.weather\.gc\.ca\//;
export const ESRI = /^https:\/\/services\.arcgisonline\.com\//;
export const RAINVIEWER_LIST = /^https:\/\/api\.rainviewer\.com\//;
export const RAINVIEWER_TILES = /^https:\/\/tilecache\.rainviewer\.com\//;
export const ADSBX = /^https:\/\/globe\.adsbexchange\.com\//;
export const RELAY = /^https:\/\/relay\.example\//;

// The layer times in the caps fixtures: radar 2026-09-30 07:12Z, lightning 07:00Z, cloud 08:50Z.
export const MAP_NOW = new Date('2026-09-30T07:20:00Z');
// The relay reply fixture is stamped 2026-09-30 18:42:00Z.
export const TRAFFIC_NOW = new Date('2026-09-30T18:42:05Z');

export const CAPS = Object.freeze({
  RADAR_1KM_RRAI: 'geomet-caps-RADAR_1KM_RRAI.xml',
  RADAR_1KM_RSNO: 'geomet-caps-RADAR_1KM_RSNO.xml',
  'RADAR_COVERAGE_RRAI.INV': 'geomet-caps-RADAR_COVERAGE_RRAI.INV.xml',
  'Lightning_2.5km_Density': 'geomet-caps-Lightning_2.5km_Density.xml',
  'GOES-West_1km_DayVis-NightIR': 'map-caps-GOES-West_1km_DayVis-NightIR.xml',
});

/** The colour of every satellite tile, so a test can see the base map was drawn. */
export const TILE_COLOUR = [58, 92, 64, 255];

/** An RGBA PNG, `width` × `height`, each pixel from `pixel(x, y)` giving [r, g, b, a]. */
export function png(width, height, pixel = () => [0, 0, 0, 0]) {
  const row = width * 4 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * row + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; // bits per channel
  head[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const param = (url, name) => new URL(url).searchParams.get(name);

/**
 * Serves MET Norway and Datamask with the plain fixtures (the four fields, no overrides). sof.spec.js has its
 * own, adjustable version; this one is for specs that only need the screen to have weather.
 */
export async function serveWeather(page) {
  await page.route(MET_NO, (route) => route.fulfill({
    status: 200, contentType: 'text/plain', headers: CORS,
    body: fixture(route.request().url().includes('/taf?') ? 'screen-metno-taf.txt' : 'screen-metno-metar.txt'),
  }));
  await page.route(DATAMASK, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: fixture('screen-datamask-not-found.json') }));
}

/**
 * Serves every map address from fixtures. The returned object is live; change these between steps:
 * - `eccc`: 'up' or 'down' (down: the capabilities reply is too big to read, which the feed counts as a failure);
 * - `lightning`: what the near-home check's picture holds: 'lit' (lightning about 4 NM from home), 'clear' or 'broken' (not a picture);
 * - `caps`: layer name → fixture file, to change a layer's time;
 * and read `requests` (ECCC and RainViewer addresses asked, in order), `pictures` (GetMap addresses), `tiles` (Esri)
 * and `adsbx` (page loads of the ADS-B Exchange frame).
 * A failure is always an unusable reply, never an HTTP error or an aborted request: Chrome logs those as console errors.
 */
export async function serveMap(page) {
  const map = { eccc: 'up', lightning: 'clear', caps: { ...CAPS }, requests: [], pictures: [], tiles: [], adsbx: [] };
  await page.route(GEOMET, (route) => {
    const url = route.request().url();
    map.requests.push(url);
    if (map.eccc === 'down') return route.fulfill({ status: 200, contentType: 'text/xml', headers: CORS, body: 'x'.repeat(300_000) });
    if (param(url, 'request') === 'GetCapabilities') {
      const file = map.caps[param(url, 'layer')];
      return route.fulfill({ status: 200, contentType: 'text/xml', headers: CORS, body: file ? fixture(file) : '<none/>' });
    }
    map.pictures.push(url);
    const width = Number(param(url, 'width'));
    const height = Number(param(url, 'height'));
    if (param(url, 'layers') === 'Lightning_2.5km_Density' && param(url, 'crs') === 'EPSG:4326') {
      // The near-home check: 1.25 km pixels (two to a 2.5 km cell), home in the middle. Lit is a small block beside home.
      if (map.lightning === 'broken') return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: 'not a picture' });
      const lit = map.lightning === 'lit';
      const body = png(width, height, (x, y) => (lit && Math.abs(x - width / 2) < 3 && Math.abs(y - height / 2) < 3 ? [255, 190, 0, 210] : [0, 0, 0, 0]));
      return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body });
    }
    // Any other layer: a picture of exactly the size asked for (the map refuses any other size) with a blob in the middle.
    const body = png(width, height, (x, y) => (Math.abs(x - width / 2) < width / 6 && Math.abs(y - height / 2) < height / 6 ? [30, 150, 255, 190] : [0, 0, 0, 0]));
    return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body });
  });
  await page.route(ESRI, (route) => {
    map.tiles.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: png(256, 256, () => TILE_COLOUR) });
  });
  await page.route(RAINVIEWER_LIST, (route) => {
    map.requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: fixture('rainviewer-weather-maps.json') });
  });
  await page.route(RAINVIEWER_TILES, (route) => {
    map.requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: png(256, 256, () => [200, 60, 200, 150]) });
  });
  await page.route(ADSBX, (route) => {
    map.adsbx.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>stand-in</title><p>ADS-B Exchange stand-in for the test</p>' });
  });
  return map;
}

/**
 * Serves the traffic relay at https://relay.example: the relay reply fixture plus one military aircraft near home.
 * Live object: `down` makes it answer with something that is not JSON; `requests` lists every address asked.
 */
export async function serveRelay(page) {
  const reply = JSON.parse(fixture('traffic-relay-reply.json'));
  reply.aircraft.push({ hex: 'ae1234', callsign: 'RCH401', reg: null, type: 'C17', lat: 50.6, lon: -105.2, alt: 8000, gs: 300, track: 270, squawk: null, seen: 1, mil: true });
  reply.count = reply.aircraft.length;
  const relay = { body: JSON.stringify(reply), down: false, requests: [] };
  await page.route(RELAY, (route) => {
    relay.requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: relay.down ? 'not json' : relay.body });
  });
  return relay;
}
