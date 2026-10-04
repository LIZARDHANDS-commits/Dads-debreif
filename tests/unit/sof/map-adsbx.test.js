// Checks: the ADS-B Exchange view's address is built from numbers only, and its zoom matches the map's.
// Serves: SOF-R17, SOF-R24.
// Expected values: hand-written expectations from the SOF spec section on the ADS-B Exchange view (design choice).

// Tests for src/modules/sof/adsbx.js: the ADS-B Exchange view's address is built from numbers only,
// and the zoom matches the map's (SPEC-sof, ADS-B Exchange view, Security).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adsbExchangeUrl, zoomForScale, frameIsCrossOrigin, ADSBX_ORIGIN, FRAME_SANDBOX } from '../../../src/modules/sof/adsbx.js';
import { pxPerFtForZoom } from '../../../src/modules/sof/map-view.js';

test('the address is the one fixed site with the home field\'s position and a zoom, and nothing else', () => {
  assert.equal(adsbExchangeUrl({ lat: 50.3303, lon: -105.559, zoom: 8 }), 'https://globe.adsbexchange.com/?lat=50.33&lon=-105.559&zoom=8');
  assert.equal(ADSBX_ORIGIN, 'https://globe.adsbexchange.com');
  const url = new URL(adsbExchangeUrl({ lat: 50.3303, lon: -105.559 }));
  assert.equal(url.origin, ADSBX_ORIGIN);
  assert.deepEqual([...url.searchParams.keys()], ['lat', 'lon', 'zoom']);
  assert.equal(url.hash, '');
});

test('the position is kept to 3 decimals and the zoom to a whole number from 2 to 14', () => {
  assert.match(adsbExchangeUrl({ lat: 50.123456789, lon: -105.987654321 }), /lat=50\.123&lon=-105\.988/);
  assert.match(adsbExchangeUrl({ lat: 50, lon: -105, zoom: 6.4 }), /zoom=6$/);
  assert.match(adsbExchangeUrl({ lat: 50, lon: -105, zoom: 99 }), /zoom=14$/);
  assert.match(adsbExchangeUrl({ lat: 50, lon: -105, zoom: -3 }), /zoom=2$/);
  assert.match(adsbExchangeUrl({ lat: 50, lon: -105, zoom: NaN }), /zoom=8$/);
  assert.match(adsbExchangeUrl({ lat: 50, lon: -105, zoom: '9' }), /zoom=8$/);
});

test('a place that is not real gives no address; text can never get into it', () => {
  for (const bad of [{}, { lat: '50', lon: -105 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: NaN, lon: 0 }, { lat: 50, lon: Infinity }, undefined]) {
    assert.equal(adsbExchangeUrl(bad), null, JSON.stringify(bad));
  }
  const url = adsbExchangeUrl({ lat: 50, lon: -105, zoom: '8&evil=1' });
  assert.equal(new URL(url).searchParams.get('evil'), null);
});

test('the zoom is the web-map zoom of the map\'s own scale, so the view opens at the same zoom', () => {
  for (const z of [3, 6, 8, 11]) assert.equal(zoomForScale(50.3, pxPerFtForZoom(50.3, z)), z);
  assert.equal(zoomForScale(50.3, pxPerFtForZoom(50.3, 20)), 14);
  assert.equal(zoomForScale(50.3, pxPerFtForZoom(50.3, 0)), 2);
  assert.equal(zoomForScale(NaN, 1), 8);
  assert.equal(zoomForScale(50, -1), 8);
});

test('the frame\'s powers are its own scripts and storage; no pop-ups, no navigating our page, no forms', () => {
  const powers = FRAME_SANDBOX.split(' ');
  assert.deepEqual(powers.sort(), ['allow-same-origin', 'allow-scripts']);
  for (const never of ['allow-popups', 'allow-top-navigation', 'allow-forms', 'allow-modals', 'allow-popups-to-escape-sandbox', 'allow-top-navigation-by-user-activation']) {
    assert.ok(!powers.includes(never), never);
  }
});

test('the frame must never be the same origin as our own page: with allow-same-origin that would lift the sandbox altogether', () => {
  assert.equal(frameIsCrossOrigin('https://dads-ooda-loop.example'), true);
  assert.equal(frameIsCrossOrigin('http://localhost:5173'), true);
  assert.equal(frameIsCrossOrigin(ADSBX_ORIGIN), false, 'served from ADS-B Exchange\'s own origin it would be same-origin');
  assert.equal(frameIsCrossOrigin('null'), true);
  assert.equal(frameIsCrossOrigin(undefined), true);
});
