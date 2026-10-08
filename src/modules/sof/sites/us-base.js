// What every US T-6 base's site profile has in common (plan Step 2c, part B), so each base's file (kdlf.js ... kngp.js) holds only its own data.
// The shape is the one cymj.js and generic.js use. Until the later steps add them (C: radar, satellite, lightning; D: model clouds; E: airspace,
// NOTAMs and alerts; F: weather standards), a US base has:
// - no airspace, watched areas, routes, anchor stations or VNC charts (empty: "no airspace for this base yet");
// - every picture and report source `null` ("no source for this base, can't tell", never a tick) EXCEPT the fronts: WPC's coded surface analysis
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
    anchorStations: Object.freeze([]),
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
      radar: null,
      lightning: null,
      satellite: null,
      warnings: null,
      modelClouds: null,
      modelCloudMask: null,
      notams: null,
      alerts: null,
      fronts: CYMJ.sources.fronts, // WPC CODSUS through the relay covers the whole US
    }),
    credits: Object.freeze({
      confirm: null,
      model: null,
      pictures: '3D fronts: WPC surface analysis; towns: GeoNames (CC BY 4.0).',
      mapFeeds: null,
    }),
    standards: null,
  });
}
