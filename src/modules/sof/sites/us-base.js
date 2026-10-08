// What every US T-6 base's site profile has in common (plan Step 2c, part B), so each base's file (kdlf.js ... kngp.js) holds only its own data.
// The shape is the one cymj.js and generic.js use. Until the later steps add them (E: airspace, NOTAMs and alerts; F: weather standards), a US base has:
// - no airspace, watched areas, routes or VNC charts (empty: "no airspace for this base yet");
// - model clouds and winds from NOAA's HRRR (3 km) with the GFS as the quick first picture and fallback, both through Open-Meteo (part D, Dad 8 Oct 2026;
//   model-clouds.js NOAA_MODELS), asked every 3 hours; no 2.5 km cloud picture (ECCC's covers Canada only: `modelCloudMask: null`, the slabs are drawn
//   unmasked and the model panel says "2.5 km cloud detail: not available at this base");
// - METAR anchor stations: the base and its usual alternates (positions and elevations from the airfield catalog, OurAirports), with the same 15 NM and
//   5,000 ft rules as Moose Jaw's (SOF-45, Dad's ruling 7 Oct);
// - 3D airfields: the base and its usual alternates, runways from OurAirports (airports-data.js, read 8 Oct 2026);
// - radar from NOAA NCEP's MRMS base reflectivity and satellite from NASA GIBS's GOES-East infrared (part C, Dad approved 8 Oct 2026; both public
//   domain, US Government; the hosts and layers are feeds.js WMS_SERVICES). RainViewer is the radar's backup as at Moose Jaw. No radar coverage
//   layer exists for MRMS: the coverage line says "not shown for this source" (neutral, not a tick, not a failure);
// - no lightning source (no free US lightning picture was found): the near-home line says "Lightning: no source for this base, can't tell" in amber,
//   with a plain link to the Blitzortung lightning map (lightningmaps.org), an outside site this tool does not check;
// - every other picture and report source `null` ("no source for this base, can't tell", never a tick) EXCEPT the fronts: WPC's coded surface analysis
//   through the relay covers the whole of the US, so Moose Jaw's fronts source is used as it is (one copy, by reference);
// - `standards: null`: no weather limits have been given for the base, so the SOF says "Limits not set for KDLF" and never "Within limits".
//
// The towns are from GeoNames (CC BY 4.0), read 8 Oct 2026 through the `cities.json` copy of its cities-over-1,000 list on GitHub: each town's
// GeoNames position, rounded to 4 decimals, FOR DRAWING ONLY (never to navigate). `builtUpNm` and `downtownFt` are ESTIMATES for the schematic blocks,
// as in towns-data.js. The credits line names GeoNames.
//
// The magnetic variation is NOAA's World Magnetic Model WMM2025 (public domain) worked out at each field for 8 Oct 2026 (pygeomag 1.1.0, the WMM2025
// coefficients), to a tenth of a degree, East positive. It drifts about 0.1° a year (estimate), so it is dated.
import { CYMJ } from './cymj.js';
import { US_LAYERS } from '../feeds.js';
import { NOAA_MODELS } from '../model-clouds.js';
import { stationsFor } from '../stations-data.js';

/**
 * The US bases' radar: NOAA NCEP's MRMS quality-controlled base reflectivity (1 km, CONUS; a new time about every 2 minutes; NCEP's GetCapabilities,
 * checked 8 Oct 2026). One layer for rain and snow (reflectivity, not a rain or snow rate). `strip` and `short` are the words of its status line.
 * `scale: 'dbz'` is its own colours in dBZ (map-model.js MRMS_SCALE, read from NCEP's legend).
 */
export const US_RADAR = Object.freeze({
  name: 'NOAA NCEP MRMS base reflectivity',
  layers: Object.freeze({ rain: US_LAYERS.mrms, snow: US_LAYERS.mrms, coverage: null }),
  backup: 'RainViewer',
  strip: 'NOAA MRMS',
  short: 'NOAA',
  scale: 'dbz',
  credit: 'NOAA NCEP MRMS (public domain, US Government)',
});

/** The US bases' satellite picture: NASA GIBS, GOES-East ABI band 13 infrared (a frame every 10 minutes; feeds.js US_LAYERS says why infrared). */
export const US_SATELLITE = Object.freeze({
  name: 'NASA GIBS GOES-East infrared',
  layer: US_LAYERS.goesEastIr,
  strip: 'NASA GOES-East IR',
  short: 'NASA GIBS',
  credit: 'Imagery: NASA GIBS, GOES-East',
  // The 3D view's words: its Satellite button and its key.
  toggleWords: 'NASA GOES-East infrared cloud picture',
  keyWords: "NASA GIBS's GOES-East infrared picture (band 13, day and night)",
});

/** The US bases' model clouds and winds: NOAA's HRRR and GFS through Open-Meteo (CC BY 4.0), asked every 3 hours (model-clouds.js NOAA_MODELS). */
export const US_MODEL_CLOUDS = Object.freeze({
  name: 'Open-Meteo, NOAA HRRR and GFS',
  credit: 'Open-Meteo (CC BY 4.0), NOAA HRRR / GFS (model estimate)',
  models: NOAA_MODELS,
});

/** The towns' source, for each town list and the credits line. */
export const US_TOWNS_SOURCE = 'GeoNames (CC BY 4.0), cities over 1,000 people, read 8 Oct 2026; positions for drawing only';

/** The magnetic variation's source words. */
export const US_MAGVAR_SOURCE = 'NOAA World Magnetic Model WMM2025 at the field, for 8 Oct 2026 (model value; drifts about 0.1° a year, estimate)';

/** The key line for a base with no airspace yet (Step E brings the FAA's). */
export const NO_AIRSPACE_YET = 'no airspace for this base yet';

const town = (id, name, lat, lon, builtUpNm, downtownFt) => Object.freeze({ id, name, lat, lon, builtUpNm, downtownFt });
/** A town as `[id, name, lat, lon, builtUpNm (estimate), downtownFt (estimate)]`. */
export const towns = (list) => Object.freeze(list.map((t) => town(...t)));

/**
 * One US base's profile, frozen.
 * - icao, name (as the SOF names the base), shortName (the Home base choice says "Laughlin (KDLF)").
 * - usualAlternates: ICAOs, with `alternatesSource` saying whose they are (Dad's, or a guess Dad said to use for now).
 * - towns: from `towns()`. tourField: the nearby field the 3D tour visits after the base's circuit, `{ icao, label }`.
 * - magVarDeg: degrees East (West negative), from US_MAGVAR_SOURCE.
 */
export function usBase({ icao, name, shortName, usualAlternates, alternatesSource, towns: townList, tourField, magVarDeg }) {
  return Object.freeze({
    icao,
    name,
    shortName,
    usualAlternates: Object.freeze([...usualAlternates]),
    alternatesSource,
    airspace: Object.freeze([]),
    airspaceNote: NO_AIRSPACE_YET,
    watchedAreas: Object.freeze([]),
    towns: townList,
    townsSource: US_TOWNS_SOURCE,
    // The METAR stations whose cloud bases anchor the 3D low cloud: the base and its usual alternates (stations-data.js, from the catalog).
    anchorStations: stationsFor([icao, ...usualAlternates]),
    // The airports the 3D view draws: the base and its usual alternates (airports-data.js; OurAirports runways, read 8 Oct 2026).
    airports3d: Object.freeze([icao, ...usualAlternates]),
    // The base's circuit (about 5 NM round, as Moose Jaw's), one nearby field, then each airborne T-6 (the type flown at every one of these bases).
    tourTargets: Object.freeze([
      Object.freeze({ id: `${icao.toLowerCase()}-circuit`, kind: 'field', icao, label: `${shortName} circuit`, nm: 5 }),
      Object.freeze({ id: tourField.icao.toLowerCase(), kind: 'field', icao: tourField.icao, label: `${tourField.label} 5 NM`, nm: 5 }),
      Object.freeze({ id: 'tex2', kind: 'aircraft', nm: 3 }),
    ]),
    magVarDegE: Object.freeze({ value: magVarDeg, source: US_MAGVAR_SOURCE }),
    bbox: null,
    charts: Object.freeze({ vnc: false }),
    routes: Object.freeze([]),
    sources: Object.freeze({
      radar: US_RADAR,
      lightning: null,
      satellite: US_SATELLITE,
      warnings: null,
      modelClouds: US_MODEL_CLOUDS,
      modelCloudMask: null, // ECCC's 2.5 km total-cloud picture is Canada only; no US one is used
      notams: null,
      alerts: null,
      fronts: CYMJ.sources.fronts, // WPC CODSUS through the relay covers the whole US
    }),
    // No lightning picture: a plain link to Blitzortung's map (lightningmaps.org), labelled as an outside site the tool does not check (map-model.js `lightningMapLink`).
    lightningLink: 'blitzortung',
    credits: Object.freeze({
      confirm: null,
      model: 'Model clouds and winds in the 3D view: Open-Meteo (CC BY 4.0), NOAA HRRR / GFS (model estimate).',
      pictures: '3D fronts: WPC surface analysis; radar: NOAA NCEP MRMS; satellite imagery: NASA GIBS, GOES-East; towns: GeoNames (CC BY 4.0).',
      mapFeeds: `radar: ${US_RADAR.credit}. ${US_SATELLITE.credit}`,
    }),
    standards: null,
  });
}
