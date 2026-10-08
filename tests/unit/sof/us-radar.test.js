// Checks: with home at Laughlin (KDLF) the SOF's radar picture is asked only of NOAA NCEP's MRMS service, for its listed layer, over a box that has
//   Laughlin inside it; an address with a layer not on the list, or a box that is not four numbers, is refused before anything is asked; and with
//   home at Moose Jaw the radar is still asked of ECCC GeoMet (plan Step 2c part C: "Moose Jaw is unchanged").
// Serves: plan Step 2c part C (US radar), SPEC-sof "Security" (every address from a fixed host and checked numbers or a listed name, never free
//   text), SOF-48 (each base's sources come from its site profile).
// Expected values: the NCEP host, path and layer name are the ones Dad approved on 8 Oct 2026 (NOAA NCEP GeoServer WMS, MRMS base reflectivity,
//   `conus_bref_qcd`), checked against NCEP's own GetCapabilities that day; ECCC GeoMet's host is the one in csp-hosts.md; Laughlin's position is
//   OurAirports' (src/airfields/catalog.js). The box is turned back from web mercator metres with the standard spherical-mercator formulas
//   (radius 6,378,137 m). None is taken from the code's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../../../src/airfields/catalog.js';
import { siteFor } from '../../../src/modules/sof/sites/index.js';
import { getMapUrl } from '../../../src/modules/sof/feeds.js';
import { createProjection, homeView, radarImageRequest, cornersOf } from '../../../src/modules/sof/map-view.js';

const R = 6378137;
const toLon = (x) => (x / R) * (180 / Math.PI);
const toLat = (y) => Math.atan(Math.sinh(y / R)) * (180 / Math.PI);

/** The radar address the map asks for at home, for the map's start view round it (map-view.js, as map.js does). */
function radarAddressAt(icao) {
  const field = { icao, ...CATALOG[icao] };
  const projection = createProjection(field);
  const { scale } = homeView(field.lat);
  const halfX = 600 / scale;
  const halfY = 400 / scale;
  const request = radarImageRequest(cornersOf(projection, { minX: -halfX, minY: -halfY, maxX: halfX, maxY: halfY }), { width: 1200, height: 800 });
  const layer = siteFor(icao).sources.radar.layers.rain;
  return { field, layer, request, url: new URL(getMapUrl({ layer, bbox: request.bbox, width: request.width, height: request.height })) };
}

test('US radar: Laughlin asks only NOAA NCEP for the MRMS layer over a box round the field; an unlisted layer or a bad box is refused; Moose Jaw still asks ECCC', () => {
  const { field, layer, request, url } = radarAddressAt('KDLF');
  assert.equal(url.origin, 'https://opengeo.ncep.noaa.gov', 'radar at Laughlin goes to NOAA NCEP only');
  assert.equal(url.pathname, '/geoserver/conus/conus_bref_qcd/ows');
  assert.equal(url.searchParams.get('layers'), 'conus_bref_qcd', 'the MRMS base reflectivity layer Dad approved');
  assert.equal(url.searchParams.get('request'), 'GetMap');
  assert.equal(url.searchParams.get('crs'), 'EPSG:3857');

  const box = url.searchParams.get('bbox').split(',').map(Number);
  assert.equal(box.length, 4);
  assert.ok(box.every(Number.isFinite), 'the box is four numbers');
  const [west, south, east, north] = [toLon(box[0]), toLat(box[1]), toLon(box[2]), toLat(box[3])];
  assert.ok(west < field.lon && field.lon < east && south < field.lat && field.lat < north, `Laughlin (${field.lat}, ${field.lon}) is inside the box ${[west, south, east, north].map((n) => n.toFixed(2))}`);

  // Nothing but a listed name and checked numbers reaches an address.
  assert.throws(() => getMapUrl({ layer: 'conus_bref_raw', bbox: request.bbox, width: 512, height: 512 }), RangeError, 'a layer not on the list');
  assert.throws(() => getMapUrl({ layer: `${layer}&format=text/html`, bbox: request.bbox, width: 512, height: 512 }), RangeError, 'extra text after the layer');
  assert.throws(() => getMapUrl({ layer, bbox: [request.bbox[0], request.bbox[1], 'x', request.bbox[3]], width: 512, height: 512 }), RangeError, 'a box that is not numbers');
  assert.throws(() => getMapUrl({ layer, bbox: request.bbox.slice(0, 3), width: 512, height: 512 }), RangeError, 'a box of three numbers');

  const moose = radarAddressAt('CYMJ');
  assert.equal(moose.url.origin, 'https://geo.weather.gc.ca', 'Moose Jaw radar is still ECCC GeoMet');
  assert.equal(moose.url.pathname, '/geomet');
});
