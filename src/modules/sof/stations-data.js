// The reporting stations whose METAR cloud bases anchor the 3D view's low cloud near them (SOF-39; Fable review, 7 Oct; plan Step 2b "Weather fidelity 2", item 3).
// Their names and positions are the app's airfield catalog's (src/airfields/catalog.js, read only); this adds the field elevations the catalog does not have, so a METAR
// base (feet above the field) can be put in feet above sea level. The four with runways in airports-data.js (CYMJ, CYQR, CYYN, CYXE) take their elevation from there
// (scene3d-model.js `fieldElevationFt`), so it is written once.
//
// Elevations below: OurAirports airports.csv, public domain, downloaded 7 Oct 2026 (https://davidmegginson.github.io/ourairports-data/airports.csv), for drawing only.
// KISN (Williston, Sloulin Field) is in the catalog but left out: OurAirports lists it as closed (its replacement is KXWA, which is not in the catalog), so it never
// reports. CYQL (Lethbridge) and KGTF (Great Falls) are in the catalog but outside the 450 NM square round Moose Jaw; the map keeps only the stations inside the square
// round home, whatever home is.
import { CATALOG } from '../../airfields/catalog.js';
import { fieldElevationFt } from './scene3d-model.js';

/** Field elevations in feet above sea level: OurAirports airports.csv, public domain, downloaded 7 Oct 2026. */
const ELEVATION_FT = Object.freeze({
  CYQV: 1635,
  CYPA: 1405,
  CYQW: 1799,
  CYBR: 1343,
  CYXH: 2352,
  KGGW: 2296,
  KMIB: 1667,
  KMOT: 1716,
  CYQL: 3048,
  KGTF: 3680,
});

/** The stations asked for, in this order (MET Norway takes up to 30 in one call). */
export const ANCHOR_STATION_IDS = Object.freeze(['CYMJ', 'CYQR', 'CYYN', 'CYXE', 'CYQV', 'CYPA', 'CYQW', 'CYBR', 'CYXH', 'KGGW', 'KMIB', 'KMOT', 'CYQL', 'KGTF']);

/**
 * Stations for a list of ICAOs, in that order: [{ icao, name, lat, lon, elevationFt }] from the catalog (one not in it is left out), elevation null where it is
 * not known (its base is then not used). A US base's site profile (sites/us-base.js) uses it for the base and its usual alternates, whose catalog entries
 * carry OurAirports' elevations (read 8 Oct 2026).
 */
export const stationsFor = (icaos) => Object.freeze(icaos.filter((icao) => CATALOG[icao]).map((icao) => Object.freeze({
  icao,
  name: CATALOG[icao].name,
  lat: CATALOG[icao].lat,
  lon: CATALOG[icao].lon,
  elevationFt: fieldElevationFt(icao, CATALOG[icao]) ?? ELEVATION_FT[icao] ?? null,
})));

/** Moose Jaw's stations (sites/cymj.js). */
export const ANCHOR_STATIONS = stationsFor(ANCHOR_STATION_IDS);
