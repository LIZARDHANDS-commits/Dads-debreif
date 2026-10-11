// Airspace and airfields round the loaded flight (DB-24; Dad, 10 Oct 2026: "lets use the 3d airspace in SOF in the KML viewer ... sure just use the
// boundaries etc" and "use the airfield graphics like pattern sim too"). The data, its checks and the kinds are the shared ones the SOF draws
// (src/airfields/airspace/, src/airfields/airports-data.js); this file only picks what belongs to this flight and says what is happening.
//
// Which airspace: the SOF base's files whose square holds the whole flight (areas.js: Moose Jaw's DAH and FAA files, or a US base's FAA file; each
// covers 450 NM each way round its base). None: "no airspace data for this area". The files load when first asked for (a dynamic import, as the
// SOF's do); while they load the fixed entries round Moose Jaw are drawn, and if they fail the layer says so. Nothing here ever holds up the flight.
//
// What is kept: every airspace whose outline reaches within AREA_MARGIN_NM of the flight's box, drawn whole; every airfield in the shared runway list
// with a runway end in the same box. Heights: AGL limits are taken above the home field's elevation and FL as feet, as the SOF does (estimates there).
// For a picture only: nothing here checks an aircraft against airspace or raises a caution.
import { airspaceAreaFor } from '../../airfields/airspace/areas.js';
import { airspaceOf, loadAirspaceFor, AIRSPACE_LOADING_WORDS, AIRSPACE_FAILED_WORDS } from '../../airfields/airspace/load.js';
import { checkedAirspace, outlineXY } from '../../airfields/airspace/model.js';
import { drawnAirspace, kindCounts, FILTER_KINDS } from '../../airfields/airspace/filter.js';
import { AIRPORTS } from '../../airfields/airports-data.js';
import { FT_PER_NM } from '../../core/units.js';
import { latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { flightBounds } from './state.js';

/** How far round the flight's box airspace and airfields are kept, NM. An estimate: enough to show what the sortie flew next to, not the whole province. */
export const AREA_MARGIN_NM = 30;
/** What the layer says when no base's files cover the flight. */
export const NO_AIRSPACE_WORDS = 'No airspace data for this area';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The flight's box in map feet grown by `marginNm` each way, or null for no flight. */
export function flightBox(flight, marginNm = AREA_MARGIN_NM) {
  const b = flightBounds(flight);
  if (!b) return null;
  const m = marginNm * FT_PER_NM;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** The four corners of the flight's own box (no margin) as [{ lat, lon }], for picking the area. */
export function flightCorners(flight) {
  const b = flightBounds(flight);
  if (!b || !flight?.ref) return [];
  return [[b.minX, b.minY], [b.minX, b.maxY], [b.maxX, b.minY], [b.maxX, b.maxY]].map(([x, y]) => localFtToLatLon(flight.ref, x, y));
}

/** `toXY(lat, lon)` as [x, y] in the flight's map feet. */
export const toXYFor = (ref) => (lat, lon) => {
  const p = latLonToLocalFt(ref, lat, lon);
  return [p.x, p.y];
};

const overlaps = (xy, box) => {
  if (!xy.length || xy.some(([x, y]) => !isNum(x) || !isNum(y))) return false;
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  return Math.max(...xs) >= box.minX && Math.min(...xs) <= box.maxX && Math.max(...ys) >= box.minY && Math.min(...ys) <= box.maxY;
};

/** The entries whose outline's bounds reach into `box` (map feet), each kept whole. An entry whose shape can't be read is passed on for `checkedAirspace` to name. */
export function airspaceNear(list, toXY, box) {
  return (Array.isArray(list) ? list : []).filter((entry) => {
    try {
      return overlaps(outlineXY(entry, toXY), box);
    } catch {
      return true;
    }
  });
}

/** The airfields with a runway end inside `box` (map feet). */
export function airfieldsNear(toXY, box, airports = AIRPORTS) {
  return airports.filter((a) => (a.runways ?? []).some((r) => [r.a, r.b].some((end) => isNum(end?.lat) && isNum(end?.lon) && overlaps([toXY(end.lat, end.lon)], box))));
}

/** The kinds hidden, from the stored text ("moa,mtr"): only the shared filter's kind keys, each once. */
export function hiddenKinds(text) {
  const keys = new Set(/** @type {string[]} */ (FILTER_KINDS.map((k) => k.key)));
  return [...new Set(String(text ?? '').split(',').map((k) => k.trim()).filter((k) => keys.has(k)))];
}

/** The stored text with one kind shown or hidden. */
export function withKind(text, key, hidden) {
  const now = new Set(hiddenKinds(text));
  if (hidden) now.add(key);
  else now.delete(key);
  return FILTER_KINDS.map((k) => k.key).filter((k) => now.has(k)).join(',');
}

/**
 * Keeps track of the loaded flight's airspace and airfields. `onChange()` is called when a file lands or fails, so the screen draws again.
 * `state({ fieldFt, hidden })` gives { status: 'none' | 'no-data' | 'loading' | 'failed' | 'ok', words, volumes (checked, near the flight, less the hidden
 * kinds), kinds ([{ key, words, count }] for every kind near the flight), skipped, airfields, key (changes when any of it does) }.
 */
export function createFlightSpace({ onChange = () => {} } = {}) {
  let flight = null;
  let area = null;
  let box = null;
  let toXY = null;
  let airfields = [];
  let near = { from: null, list: [] };
  let memo = { key: '', value: null };
  let serial = 0;

  return {
    setFlight(next) {
      flight = next ?? null;
      serial += 1;
      area = flight ? airspaceAreaFor(flightCorners(flight)) : null;
      box = flight ? flightBox(flight) : null;
      toXY = flight ? toXYFor(flight.ref) : null;
      airfields = flight ? airfieldsNear(toXY, box) : [];
      near = { from: null, list: [] };
    },
    /** Asks for the area's files if they are not here yet (only when a view shows the airspace). */
    want() {
      if (area) loadAirspaceFor(area, onChange);
    },
    get toXY() {
      return toXY;
    },
    state({ fieldFt = 0, hidden = '' } = {}) {
      if (!flight) return { status: 'none', words: '', volumes: [], kinds: [], skipped: [], airfields: [], key: 'none' };
      if (!area) return { status: 'no-data', words: NO_AIRSPACE_WORDS, volumes: [], kinds: [], skipped: [], airfields, key: `${serial}|none` };
      const held = airspaceOf(area);
      if (near.from !== held.entries) near = { from: held.entries, list: airspaceNear(held.entries, toXY, box) };
      const status = held.status === 'idle' ? 'loading' : held.status;
      const key = `${serial}|${area.icao}|${status}|${near.list.length}|${fieldFt}|${hidden}`;
      if (memo.key === key) return memo.value;
      const { volumes, skipped } = checkedAirspace(near.list, fieldFt);
      const kinds = kindCounts(volumes);
      const shown = drawnAirspace(volumes, { kinds: hiddenKinds(hidden), ids: [] });
      const count = new Set(shown.map((v) => v.id)).size;
      const total = new Set(volumes.map((v) => v.id)).size;
      const counted = `${count} of ${total} airspaces within ${AREA_MARGIN_NM} NM of the flight shown${skipped.length ? `; ${skipped.length} left out (bad data)` : ''}`;
      let words = counted;
      if (status === 'loading') words = `${AIRSPACE_LOADING_WORDS}${total ? ` (${counted})` : ''}`;
      // A failed file: whatever is fixed (the 25 entries round Moose Jaw) still draws, and the line says the rest is missing.
      if (status === 'failed') words = `${AIRSPACE_FAILED_WORDS}${total ? `: only ${counted}` : ''}`;
      memo = { key, value: { status, words, volumes: shown, kinds, skipped, airfields, key } };
      return memo.value;
    },
  };
}
