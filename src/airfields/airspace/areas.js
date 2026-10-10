// Which airspace files cover which part of the map (10 Oct 2026, SOF-62, DB-24). Each SOF base's airspace is generated for the square round it that the
// SOF's largest "3D area" shows (900 NM across, so 450 NM each way; SOF-53; tools/faa-airspace.mjs and tools/dah-airspace.py cut to it). The SOF's site
// profiles take their loaders from here, and the Debrief picks the area that holds the loaded flight. One copy of each import path.
//
// An area has the shape src/airfields/airspace/load.js reads: { icao, airspace (the fixed entries, drawn at once), loadAirspace (imports the rest) }, plus
// its centre (the base's position in src/airfields/catalog.js) and half the square's width.
import { CATALOG } from '../catalog.js';
import { AIRSPACE } from './data.js';
import { FT_PER_NM } from '../../core/units.js';
import { makeLocalRef, latLonToLocalFt } from '../../core/geo.js';

/** Half the square each base's files cover, NM: half the SOF's largest 3D area, 900 NM (scene3d-model.js MAX_AREA_NM, SOF-53). */
export const COVER_HALF_NM = 450;

/**
 * Several airspace files as one ({ AIRSPACE, SOURCE }, what load.js expects): every file that loaded, in order, with their SOURCE lines joined; one that
 * did not is named in SOURCE ("not loaded: the FAA file"). Fails only when none loaded.
 */
async function loadBoth(imports, names) {
  const got = await Promise.allSettled(imports);
  if (got.every((g) => g.status === 'rejected')) throw got[0].reason;
  const ok = got.filter((g) => g.status === 'fulfilled').map((g) => g.value);
  const missing = names.filter((_, i) => got[i].status === 'rejected');
  return {
    AIRSPACE: ok.flatMap((file) => (Array.isArray(file?.AIRSPACE) ? file.AIRSPACE : [])),
    SOURCE: [...ok.map((file) => file?.SOURCE).filter((x) => typeof x === 'string'), ...(missing.length ? [`not loaded: ${missing.join(', ')}`] : [])].join('; '),
  };
}

/**
 * Each base's loader, a function that imports its generated file(s) only when asked (a dynamic import(), so nobody downloads a file they never draw):
 * Moose Jaw's wider DAH set (dah/cymj.js) and the US side of its square (faa/cymj.js); one FAA file for each US base (faa/<icao>.js).
 */
export const AIRSPACE_LOADERS = Object.freeze({
  CYMJ: () => loadBoth([import('./dah/cymj.js'), import('./faa/cymj.js')], ['the wider DAH set', 'the FAA file']),
  KDLF: () => import('./faa/kdlf.js'),
  KEND: () => import('./faa/kend.js'),
  KRND: () => import('./faa/krnd.js'),
  KCBM: () => import('./faa/kcbm.js'),
  KSPS: () => import('./faa/ksps.js'),
  KNSE: () => import('./faa/knse.js'),
  KNGP: () => import('./faa/kngp.js'),
  KSJT: () => import('./faa/ksjt.js'),
});

/** Every area: Moose Jaw's with its 25 fixed DAH entries (data.js), the US bases' with none fixed. */
export const AIRSPACE_AREAS = Object.freeze(Object.entries(AIRSPACE_LOADERS).map(([icao, loadAirspace]) => Object.freeze({
  icao,
  lat: CATALOG[icao].lat,
  lon: CATALOG[icao].lon,
  halfNm: COVER_HALF_NM,
  airspace: icao === 'CYMJ' ? AIRSPACE : Object.freeze([]),
  loadAirspace,
})));

/**
 * The area whose square holds every point given ([{ lat, lon }], such as a flight's corners), the one with the nearest centre when more than one does;
 * null when none does ("no airspace data for this area").
 */
export function airspaceAreaFor(points) {
  const list = (Array.isArray(points) ? points : []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  if (!list.length) return null;
  const half = COVER_HALF_NM * FT_PER_NM;
  let best = null;
  for (const area of AIRSPACE_AREAS) {
    const ref = makeLocalRef(area.lat, area.lon);
    const xy = list.map((p) => latLonToLocalFt(ref, p.lat, p.lon));
    if (!xy.every((p) => Math.abs(p.x) <= half && Math.abs(p.y) <= half)) continue;
    const far = Math.max(...xy.map((p) => Math.hypot(p.x, p.y)));
    if (!best || far < best.far) best = { area, far };
  }
  return best?.area ?? null;
}
