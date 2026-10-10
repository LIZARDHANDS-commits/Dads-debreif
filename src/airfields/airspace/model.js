// What a 3D view draws for airspace and the TACNAV routes, decided without a page (SPEC-sof, "3D view", SOF-39, phase 3; shared with the
// Debrief since 10 Oct 2026, SOF-62, DB-24): whether an airspace entry (data.js) is fit to draw, its floor and ceiling in feet above sea
// level, the words on its label, its outline in the map's feet, and which of the Debrief's routes are the TACNAV ones. Pure: entries and
// numbers go in, plain data comes out. ui-kit/airspace3d.js only draws it. The SOF cuts the list to its square itself
// (src/modules/sof/airspace-square.js); the Debrief keeps what reaches its flight's area (`airspaceNear`, below).
//
// The 3D view is a picture for situational awareness. It is not a chart and not for navigation or flight planning: it checks no
// limit and raises or clears no caution. A bad entry is skipped and named in the view's key, never drawn wrong.
import { FT_PER_NM } from '../../core/units.js';

/** The top of the view: an unlimited ceiling (`UNL`) is drawn up to here, in feet above sea level (SOF-39). */
export const VIEW_TOP_FT = 60_000;
/** How solid an airspace volume's fill is drawn, as opacity 0 to 1: faint, so clouds and aircraft read through it. An estimate, SOF-39. */
export const AIRSPACE_FILL_OPACITY = 0.08; // estimate, SOF-39
/** The TACNAV routes fly at this height above the ground (Dad, 7 Oct). The ground is taken as flat at the home field's elevation (an estimate). */
export const TACNAV_AGL_FT = 500;
/** A circle's outline is this many straight sides. An estimate for smoothness at 250 NM across. */
export const CIRCLE_SIDES = 64;

// The last four are the US bases' (plan Step 2c part E, FAA open data): military operations areas, warning and alert areas, and military training routes.
export const AIRSPACE_KINDS = Object.freeze(['restricted', 'advisory', 'terminal', 'control-zone', 'mtca', 'other', 'moa', 'warning', 'alert', 'mtr']);
/** The kinds every key lists (Moose Jaw's, as before); the US kinds are listed only where a base has them. */
export const BASE_KINDS = Object.freeze(['restricted', 'advisory', 'terminal', 'control-zone', 'mtca', 'other']);
const CLASS_LETTERS = Object.freeze(['B', 'C', 'D', 'E', 'F']);
const FLOOR_REFS = Object.freeze(['SFC', 'AGL', 'ASL', 'FL']);
const CEILING_REFS = Object.freeze(['AGL', 'ASL', 'FL', 'UNL']);

/** Each kind in words, with the colour of its edge told in words too (colour is never the only signal). */
export const KIND_WORDS = Object.freeze({
  restricted: { name: 'restricted or danger area', colour: 'red' },
  advisory: { name: 'advisory area', colour: 'amber' },
  terminal: { name: 'terminal airspace', colour: 'blue' },
  'control-zone': { name: 'control zone', colour: 'light blue' },
  mtca: { name: 'MTCA', colour: 'cyan' },
  other: { name: 'other airspace', colour: 'grey' },
  moa: { name: 'military operations area (MOA)', colour: 'orange' },
  warning: { name: 'warning area', colour: 'red' },
  alert: { name: 'alert area', colour: 'amber' },
  mtr: { name: 'military training route (centreline)', colour: 'violet' },
});

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isLatLon = (p) => Array.isArray(p) && p.length === 2 && isNumber(p[0]) && isNumber(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/** A whole number of feet with its comma: 2500 reads "2,500". */
const feet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * One limit as feet above sea level. SFC is the ground at `groundFt`; AGL is `groundFt` plus the height (ground taken as flat at home's
 * elevation, an estimate); ASL is as given; FL is the flight level times 100 read as feet (pressure altitude taken as altitude, an
 * approximation); UNL is the top of the view. `approx` is true for AGL and FL, which are estimates here.
 */
export function limitFt(limit, groundFt = 0) {
  switch (limit.ref) {
    case 'SFC': return { ft: groundFt, approx: false };
    case 'AGL': return { ft: groundFt + limit.ft, approx: true };
    case 'ASL': return { ft: limit.ft, approx: false };
    case 'FL': return { ft: limit.ft, approx: true };
    default: return { ft: VIEW_TOP_FT, approx: false }; // UNL
  }
}

/** A limit in words for a label: "SFC", "2,200 ft AGL", "3,000 ft ASL", "FL180", "UNL". */
export function limitWords(limit) {
  switch (limit.ref) {
    case 'SFC': return 'SFC';
    case 'FL': return `FL${String(Math.round(limit.ft / 100)).padStart(3, '0')}`;
    case 'UNL': return 'UNL';
    default: return `${feet(limit.ft)} ft ${limit.ref}`;
  }
}

/** The label's words: "CYR303 SFC–FL180", or "IR123 altitudes not given" for a route whose data has none. */
export const airspaceWords = (entry) => {
  if (heightsNotGiven(entry)) return `${entry.id} altitudes not given`;
  const [floor, ceiling] = [limitWords(entry.floor), limitWords(entry.ceiling)];
  return floor === ceiling ? `${entry.id} at ${floor}` : `${entry.id} ${floor}–${ceiling}`;
};

/**
 * A line entry (a military training route's centreline, `shape: { type: 'line', points }`) may have no heights in its data: its floor is then SFC and
 * its ceiling `null`, and it is drawn as a line on the ground at home's elevation, its words saying "altitudes not given". This says whether that is so.
 */
export const heightsNotGiven = (entry) => entry?.shape?.type === 'line' && entry.ceiling === null;

/**
 * Whether an entry is fit to draw. Returns { ok: true } or { ok: false, reason } with the reason in plain words (no console, no throw).
 * `groundFt` is the ground the view draws, so an AGL limit can be compared with an ASL one; with the default 0 only like references
 * are compared fairly. Rejects: no id, name, known kind, class letter or source; bad numbers in a limit (a UNL ceiling's number is
 * ignored); fewer than 3 points or a point that is not [lat, lon]; a circle with no centre or a radius that is not above 0; a ceiling
 * not above the floor.
 */
export function checkAirspace(entry, groundFt = 0) {
  const bad = (reason) => ({ ok: false, reason });
  if (!entry || typeof entry !== 'object') return bad('not an entry');
  if (!isText(entry.id)) return bad('no id');
  if (!isText(entry.name)) return bad('no name');
  if (!AIRSPACE_KINDS.includes(entry.kind)) return bad('unknown kind');
  if (entry.classLetter !== null && !CLASS_LETTERS.includes(entry.classLetter)) return bad('unknown class letter');
  if (!isText(entry.source)) return bad('no source');
  const { floor, ceiling, shape } = entry;
  if (!floor || !FLOOR_REFS.includes(floor.ref) || !isNumber(floor.ft) || floor.ft < 0) return bad('floor is not a height');
  const noHeights = heightsNotGiven(entry);
  if (!noHeights && (!ceiling || !CEILING_REFS.includes(ceiling.ref) || (ceiling.ref !== 'UNL' && (!isNumber(ceiling.ft) || ceiling.ft < 0)))) return bad('ceiling is not a height');
  if (!shape || typeof shape !== 'object') return bad('no shape');
  if (shape.type === 'line') {
    if (!Array.isArray(shape.points) || shape.points.length < 2) return bad('a line needs 2 points');
    if (!shape.points.every(isLatLon)) return bad('a point is not [lat, lon]');
    if (noHeights) return floor.ref === 'SFC' ? { ok: true } : bad('a line with no ceiling must start at SFC');
  } else if (shape.type === 'polygon') {
    if (!Array.isArray(shape.points) || shape.points.length < 3) return bad('fewer than 3 points');
    if (!shape.points.every(isLatLon)) return bad('a point is not [lat, lon]');
  } else if (shape.type === 'circle') {
    if (!isLatLon(shape.centre)) return bad('centre is not [lat, lon]');
    if (!isNumber(shape.radiusNm) || shape.radiusNm <= 0) return bad('radius is not above 0');
  } else return bad('unknown shape');
  // A route flown at one altitude (a line whose floor and ceiling are the same, as some FAA IR segments are) is a line at that height.
  const top = limitFt(ceiling, groundFt).ft;
  const bottom = limitFt(floor, groundFt).ft;
  if (shape.type === 'line' ? top < bottom : top <= bottom) return bad('ceiling is not above the floor');
  return { ok: true };
}

/**
 * The entries fit to draw and the ones skipped, for a list and the ground the view draws. Returns { volumes: [entry with floorFt, ceilingFt
 * (feet above sea level) and approx (an AGL or FL limit is in it)], skipped: [{ id, reason }] }. A repeated id counts as bad (the second is skipped).
 */
export function checkedAirspace(list, groundFt = 0) {
  const volumes = [];
  const skipped = [];
  const seen = new Set();
  for (const [i, entry] of (Array.isArray(list) ? list : []).entries()) {
    const verdict = checkAirspace(entry, groundFt);
    const id = isText(entry?.id) ? entry.id : `entry ${i + 1}`;
    if (!verdict.ok) {
      skipped.push({ id, reason: verdict.reason });
      continue;
    }
    if (seen.has(entry.id)) {
      skipped.push({ id, reason: 'id used twice' });
      continue;
    }
    seen.add(entry.id);
    const floor = limitFt(entry.floor, groundFt);
    const ceiling = heightsNotGiven(entry) ? floor : limitFt(entry.ceiling, groundFt);
    volumes.push({ ...entry, floorFt: floor.ft, ceilingFt: ceiling.ft, approx: floor.approx || ceiling.approx });
  }
  return { volumes, skipped };
}

/**
 * An entry's outline in the map's local feet: a polygon's points, or a circle as CIRCLE_SIDES straight sides, round its projected centre
 * (flat, fine at this size). `toXY(lat, lon)` gives [x, y]. A repeated closing point is dropped. Returns [[x, y], ...]. A line's points are
 * returned as they are (an open path, not closed).
 */
export function outlineXY(entry, toXY) {
  const { shape } = entry;
  if (shape.type === 'line') return shape.points.map(([lat, lon]) => toXY(lat, lon));
  if (shape.type === 'circle') {
    const [cx, cy] = toXY(shape.centre[0], shape.centre[1]);
    const r = shape.radiusNm * FT_PER_NM;
    return Array.from({ length: CIRCLE_SIDES }, (_, i) => {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  }
  const ring = shape.points.map(([lat, lon]) => toXY(lat, lon));
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 3 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring;
}

/** The hover sentence for a volume: what it is, its colour in words, its limits and its source. */
export function airspaceTitle(entry) {
  const kind = KIND_WORDS[entry.kind];
  const cls = entry.classLetter ? `, class ${entry.classLetter}` : '';
  const est = entry.approx ? ' AGL heights are taken from the home field’s elevation and FL as feet ASL (estimates).' : '';
  const limits = heightsNotGiven(entry) ? 'Altitudes not given in the data: drawn on the ground at home’s elevation.'
    : limitWords(entry.floor) === limitWords(entry.ceiling) ? `At ${limitWords(entry.floor)}.` : `${limitWords(entry.floor)} to ${limitWords(entry.ceiling)}.`;
  return `${entry.name}: ${kind.name}${cls}, drawn with a ${kind.colour} edge. ${limits} Source: ${entry.source}.${est}`;
}

// ---- The TACNAV routes ----------------------------------------------------------------------------

/** The Debrief's routes (`ROUTES`: { name, paths: [[[lon, lat], ...], ...] }) whose name has TAC in it: TAC NAV 2, TACNAV 1 and so on. */
export const tacnavRoutes = (routes) => (Array.isArray(routes) ? routes : []).filter((r) => typeof r?.name === 'string' && /\bTAC/i.test(r.name));

/** A route's paths in the map's feet: { name, paths: [[[x, y], ...], ...], first: [x, y] }, `first` being where its label stands; null for a route with no line. */
export function routeXY(route, toXY) {
  const paths = (route.paths ?? []).filter((path) => Array.isArray(path) && path.length >= 2).map((path) => path.map(([lon, lat]) => toXY(lat, lon)));
  return paths.length ? { name: route.name, paths, first: paths[0][0] } : null;
}

/** A TACNAV route's height above sea level: home's elevation plus 500 ft (ground taken as flat, an estimate). */
export const tacnavFt = (groundFt) => groundFt + TACNAV_AGL_FT;

/** The words under the key for the routes, as Dad asked (SOF-39). */
export const tacnavNote = (homeIcao) => `TACNAV routes: ${TACNAV_AGL_FT} ft AGL, ground taken as flat at ${homeIcao}'s elevation (estimate).`;
