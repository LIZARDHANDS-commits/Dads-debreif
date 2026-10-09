// The instrument approaches to the home field and its usual alternates (plan item "Instrument approaches drawn to the fields"; Dad, 8 Oct 2026: "it would
// be nice to see the IAFs IF FAFs a the loc/Glidepath. the VOR course etc. that way the SOF could see if the arrival corridor is blocked"). Plain data and
// words only: approaches3d.js draws them in 3D, map-draw.js draws the final courses in 2D, view3d.js and the cards show the words. Nothing here raises or
// clears a caution or touches a limit: the corridor check is information only, and the CIFP has no minima (they stay entered by hand).
//
// Where the approaches come from:
// - US fields: the FAA's Coded Instrument Flight Procedures (CIFP, ARINC 424-18, public domain), trimmed by tools/cifp-approaches.mjs into one file per
//   base (sites/approaches/<base>.js, loaded only when needed, sites/approaches-load.js). The CIFP holds the FAA's own procedures: the military fields
//   (Laughlin, Vance, Randolph, Columbus, Sheppard, Whiting, Pensacola NAS, Kingsville, Kelly and NAS Corpus Christi) have none in it.
// - Canadian fields (Moose Jaw and its alternates), and a US field with none in the CIFP: NAV CANADA's coded procedures are not free and the DoD's are not
//   in the CIFP, so only each runway end's extended centreline out to 10 NM with a 3° path down to the threshold is drawn (ESTIMATE, from the runways in
//   airports-data.js), said in words as an estimate, not the published procedure. Nothing else is invented.
//
// The data file's shape (sites/approaches/<base>.js, written by the tool): { SOURCE, CYCLE: { id, effective }, FIELDS: [field] } where
//   field = { icao, varE (magnetic variation ° East from the CIFP airport record), elevFt, note? (why there are none), approaches: [approach] }
//   approach = { id ("I13R"), name ("ILS or LOC RWY 13R"), kind (ils | loc | locbc | lda | sdf | vor | tacan | ndb | rnav), rwy ("13R", or null for a
//     circling approach), gps (true for RNAV (GPS), RNAV (RNP), GPS, GLS), thr: [lat, lon, elevFt] or null (the runway threshold), tch (threshold crossing
//     height ft) or null, gpa (glidepath or coded vertical angle, degrees) or null, loc: [ident, lat, lon, true course] or null (the localizer antenna),
//     nav: [ident, lat, lon, 'VOR' | 'TACAN' | 'NDB'] or null (the final's navaid), tr: [[transition name, legs]], fin: legs (to the MAP), ma: legs (the
//     missed approach), also? (the LOC id drawn with this ILS) }
//   leg = [fix ident ('' for none), lat or null, lon or null, role ('' | 'IAF' | 'IF' | 'FAF' | 'MAP' | 'MAHF'), path terminator ('IF', 'TF', 'CF', 'DF',
//     'AF', 'RF', 'CA', 'VA', 'HM' ...), altitude or null: ['@', ft] at, ['+', ft] at or above, ['-', ft] at or below, ['B', top, bottom] between,
//     extra or null: { gs: glide slope intercept ft, arc: [centre lat, centre lon, radius NM, 'L' | 'R'], hold: [inbound true course, leg ('T1' a minute,
//     or NM), 'L' | 'R'] } ]
import { FT_PER_NM } from '../../core/units.js';
import { makeLocalRef, localFtToLatLon, legOffsetsFt } from '../../core/geo.js';
import { unitVectorFromCompassDeg, compassDegFromVector, wrapDeg360 } from '../../core/angles.js';

/** What a corridor is (Dad, 8 Oct 2026; all estimates, not from a source): ±2 NM either side of the final segment (FAF to MAP), ±4 NM either side of the initial and intermediate segments, and from 1,000 ft below the path to 3,000 ft above it. The missed approach is not checked. */
export const CORRIDOR = Object.freeze({ finalHalfNm: 2, initialHalfNm: 4, belowFt: 1000, aboveFt: 3000, sampleNm: 0.5 });
/** The estimated approach for a field with no coded procedure: each runway end's extended centreline this long, with a path at this angle down to the threshold, crossing it this high (all estimates: a typical 3° path and 50 ft threshold crossing height). */
export const ESTIMATE = Object.freeze({ lengthNm: 10, angleDeg: 3, tchFt: 50 });
/** A hold drawn as a racetrack: a 1-minute leg at this ground speed and turns of this radius (estimates for the picture, not the procedure's own). */
export const HOLD_DRAW = Object.freeze({ nmPerMinute: 2, turnNm: 1 });
/** An arc is drawn as straight pieces at most this many degrees round (an estimate for a smooth picture). */
const ARC_STEP_DEG = 3;

/** The approach groups, their colour (estimates for readability) and their words; RNAV is drawn fainter (the T-6A can't rely on GPS: Dad's ruling, AFMAN 11-202V3 4.17.3). */
export const APPROACH_GROUPS = Object.freeze({
  ils: Object.freeze({ colour: '#2fe6b4', words: 'teal', name: 'ILS and LOC (localizer, LDA, SDF and back course)', opacity: 0.95 }),
  vor: Object.freeze({ colour: '#8fa8ff', words: 'periwinkle blue', name: 'VOR, VOR/DME and TACAN', opacity: 0.95 }),
  ndb: Object.freeze({ colour: '#f0a35a', words: 'tan', name: 'NDB', opacity: 0.95 }),
  rnav: Object.freeze({ colour: '#e8e8e8', words: 'faint white', name: 'RNAV (GPS) and RNAV (RNP)', opacity: 0.35 }),
  estimate: Object.freeze({ colour: '#ffffff', words: 'white, dashed', name: 'estimate: runway centreline and a 3° path, not the published procedure', opacity: 0.8 }),
});
const GROUP_OF = Object.freeze({ ils: 'ils', loc: 'ils', locbc: 'ils', lda: 'ils', sdf: 'ils', vor: 'vor', tacan: 'vor', ndb: 'ndb', rnav: 'rnav', estimate: 'estimate' });
export const groupOf = (kind) => GROUP_OF[kind] ?? 'rnav';

/** The words of the estimate, as the key and the cards say them. */
export const ESTIMATE_WORDS = 'estimate: runway centreline and a 3° path, not the published procedure';
/** Why a Canadian field has only the estimate. */
export const CANADA_NOTE = 'NAV CANADA’s coded procedure data is not free, so its published approaches are not drawn';
const ROLE_WORDS = Object.freeze({ IAF: 'initial approach fix', IF: 'intermediate fix', FAF: 'final approach fix', MAP: 'missed approach point', MAHF: 'missed approach holding fix' });
const ALT_WORDS = Object.freeze({ '@': 'at', '+': 'at or above', '-': 'at or below', B: 'between' });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isLat = (v) => isNum(v) && v >= -90 && v <= 90;
const isLon = (v) => isNum(v) && v >= -180 && v <= 180;
const feet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- Reading the data file ----------------------------------------------------------------------------------------------------------

function readAlt(a) {
  if (!Array.isArray(a) || !ALT_WORDS[a[0]] || !isNum(a[1]) || a[1] < -2000 || a[1] > 60000) return null;
  if (a[0] === 'B') return isNum(a[2]) ? { how: 'B', ft: a[1], ft2: a[2] } : null;
  return { how: a[0], ft: a[1] };
}

function readLeg(raw) {
  if (!Array.isArray(raw) || raw.length < 5) return null;
  const [fix, lat, lon, role, path, alt, extra] = raw;
  const placed = isLat(lat) && isLon(lon);
  const leg = {
    fix: typeof fix === 'string' ? fix.slice(0, 5) : '',
    lat: placed ? lat : null,
    lon: placed ? lon : null,
    role: ROLE_WORDS[role] ? role : '',
    path: typeof path === 'string' ? path.slice(0, 2) : '',
    alt: readAlt(alt),
    gsFt: isNum(extra?.gs) ? extra.gs : null,
    arc: null,
    hold: null,
  };
  const arc = extra?.arc;
  if (Array.isArray(arc) && isLat(arc[0]) && isLon(arc[1]) && isNum(arc[2]) && arc[2] > 0 && arc[2] < 60 && (arc[3] === 'L' || arc[3] === 'R')) leg.arc = { lat: arc[0], lon: arc[1], radiusNm: arc[2], turn: arc[3] };
  const hold = extra?.hold;
  if (Array.isArray(hold) && isNum(hold[0]) && typeof hold[1] === 'string' && (hold[2] === 'L' || hold[2] === 'R')) {
    const minutes = /^T(\d+(\.\d+)?)$/.exec(hold[1]);
    const nm = minutes ? Number(minutes[1]) * HOLD_DRAW.nmPerMinute : Number(hold[1]);
    if (isNum(nm) && nm > 0 && nm < 30) leg.hold = { crsTrue: wrapDeg360(hold[0]), legNm: nm, legWords: minutes ? `${minutes[1]} min legs` : `${hold[1]} NM legs`, turn: hold[2] };
  }
  return leg;
}

const legsOf = (list) => (Array.isArray(list) ? list.map(readLeg).filter(Boolean) : []);

/** One approach from the data file, checked field by field (anything wrong is left out, never guessed), or null when it cannot be drawn at all. */
export function readApproach(raw, icao) {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const kind = GROUP_OF[raw.kind] ? raw.kind : 'rnav';
  const thr = Array.isArray(raw.thr) && isLat(raw.thr[0]) && isLon(raw.thr[1]) ? { lat: raw.thr[0], lon: raw.thr[1], elevFt: isNum(raw.thr[2]) ? raw.thr[2] : null } : null;
  const loc = Array.isArray(raw.loc) && isLat(raw.loc[1]) && isLon(raw.loc[2]) && isNum(raw.loc[3]) ? { ident: String(raw.loc[0]), lat: raw.loc[1], lon: raw.loc[2], crsTrue: wrapDeg360(raw.loc[3]) } : null;
  const nav = Array.isArray(raw.nav) && isLat(raw.nav[1]) && isLon(raw.nav[2]) ? { ident: String(raw.nav[0]), lat: raw.nav[1], lon: raw.nav[2], kind: String(raw.nav[3] ?? 'VOR') } : null;
  const final = legsOf(raw.fin);
  if (!final.some((l) => l.lat !== null)) return null;
  return {
    icao,
    id: raw.id,
    name: raw.name,
    kind,
    group: groupOf(kind),
    gps: raw.gps === true,
    rwy: typeof raw.rwy === 'string' ? raw.rwy : null,
    thr,
    tchFt: isNum(raw.tch) && raw.tch > 0 && raw.tch < 200 ? raw.tch : null,
    gpaDeg: isNum(raw.gpa) && raw.gpa > 1 && raw.gpa < 8 ? raw.gpa : null,
    loc,
    nav,
    transitions: Array.isArray(raw.tr) ? raw.tr.filter((t) => Array.isArray(t) && typeof t[0] === 'string').map(([name, legs]) => ({ name, legs: legsOf(legs) })) : [],
    final,
    missed: legsOf(raw.ma),
    estimate: false,
  };
}

/** A loaded approaches file as Map icao -> { icao, elevFt, note, approaches } (each approach checked by readApproach). */
export function readApproachFile(file) {
  const out = new Map();
  for (const f of Array.isArray(file?.FIELDS) ? file.FIELDS : []) {
    if (!f || typeof f.icao !== 'string') continue;
    out.set(f.icao, { icao: f.icao, elevFt: isNum(f.elevFt) ? f.elevFt : null, note: typeof f.note === 'string' ? f.note : null, approaches: (Array.isArray(f.approaches) ? f.approaches : []).map((a) => readApproach(a, f.icao)).filter(Boolean) });
  }
  return out;
}

// ---- The estimate for a field with no coded procedure -------------------------------------------------------------------------------

/**
 * Each runway end's estimated approach: the extended centreline from ESTIMATE.lengthNm out to the threshold, with an ESTIMATE.angleDeg path crossing the
 * threshold ESTIMATE.tchFt high. `airport` is an airports-data.js entry. Nothing else (no fixes, no missed approach) is drawn: there is no source for it.
 */
export function estimatedApproaches(airport) {
  const out = [];
  for (const rw of airport?.runways ?? []) {
    for (const [end, side] of [[rw.ends?.[0], rw.a], [rw.ends?.[1], rw.b]]) {
      if (!side || !isLat(side.lat) || !isLon(side.lon) || !isNum(side.headingTrue)) continue;
      const elevFt = isNum(side.elevationFt) ? side.elevationFt : airport.elevationFt ?? 0;
      const ref = makeLocalRef(side.lat, side.lon);
      const back = unitVectorFromCompassDeg(side.headingTrue + 180);
      const lengthFt = ESTIMATE.lengthNm * FT_PER_NM;
      const far = localFtToLatLon(ref, back.x * lengthFt, back.y * lengthFt);
      const thrFt = elevFt + ESTIMATE.tchFt;
      const farFt = thrFt + lengthFt * Math.tan((ESTIMATE.angleDeg * Math.PI) / 180);
      out.push({
        icao: airport.icao,
        id: `EST-${end}`,
        name: `RWY ${end} (estimate)`,
        kind: 'estimate',
        group: 'estimate',
        gps: false,
        rwy: String(end),
        thr: { lat: side.lat, lon: side.lon, elevFt },
        tchFt: ESTIMATE.tchFt,
        gpaDeg: ESTIMATE.angleDeg,
        loc: null,
        nav: null,
        transitions: [],
        final: [
          { fix: '', lat: far.lat, lon: far.lon, role: '', path: 'IF', alt: { how: '@', ft: Math.round(farFt) }, gsFt: null, arc: null, hold: null },
          { fix: `RW${end}`, lat: side.lat, lon: side.lon, role: '', path: 'TF', alt: { how: '@', ft: Math.round(thrFt) }, gsFt: null, arc: null, hold: null },
        ],
        missed: [],
        estimate: true,
      });
    }
  }
  return out;
}

/**
 * The approaches of each field the view draws: [{ icao, source: 'cifp' | 'estimate', note, approaches }], in `icaos` order. `file` is the base's loaded data
 * (readApproachFile), or null (a Canadian home, which has none, or a file not loaded yet). A field with CIFP approaches gets them; one with none there (a
 * military field) or with no file (a Canadian field) gets the estimate from its runways, and its note says why; a field not in airports-data.js is left out.
 */
/** @param {{ icaos: readonly string[], file?: Map<string, any> | null, airports?: readonly any[] }} options */
export function fieldApproaches({ icaos, file = null, airports = [] }) {
  return icaos.map((icao) => {
    const coded = file?.get(icao);
    if (coded && coded.approaches.length) return { icao, source: 'cifp', note: null, approaches: coded.approaches };
    const airport = airports.find((a) => a.icao === icao);
    if (!airport) return null;
    const note = coded?.note ?? (/^C/.test(icao) ? CANADA_NOTE : `No coded approaches for ${icao} in our data`);
    return { icao, source: 'estimate', note, approaches: estimatedApproaches(airport) };
  }).filter(Boolean);
}

// ---- Words ---------------------------------------------------------------------------------------------------------------------------

/** An altitude constraint in a few characters ("3,000+", "3,000-", "4,000–6,000", "2,200") and in words ("at or above 3,000 ft"). */
export function altShort(alt) {
  if (!alt) return '';
  if (alt.how === 'B') return `${feet(alt.ft2)}–${feet(alt.ft)}`;
  return `${feet(alt.ft)}${alt.how === '+' ? '+' : alt.how === '-' ? '-' : ''}`;
}
export function altWords(alt) {
  if (!alt) return 'no altitude coded';
  if (alt.how === 'B') return `between ${feet(alt.ft2)} and ${feet(alt.ft)} ft`;
  return `${ALT_WORDS[alt.how]} ${feet(alt.ft)} ft`;
}
/** A fix's label, as the 3D view writes it beside the fix: "ALAMO FAF 2,200+". */
export const fixLabel = (fix) => [fix.ident, fix.role, altShort(fix.alt)].filter(Boolean).join(' ');
/** The same fix's hover sentence. */
export const fixTitle = (fix, approach) => `${fix.ident}: ${ROLE_WORDS[fix.role] ?? 'fix'} of ${approach.name} (${approach.icao}), ${altWords(fix.alt)}${fix.gsFt ? `; glide slope intercept ${feet(fix.gsFt)} ft` : ''}`;

/** A short name for the cards' list: "ILS 13R", "LOC 17R", "VOR-A", "VOR/DME Y 03", "RNAV Y 13R". */
export function shortName(a) {
  const n = a.name.replace(/^ILS or LOC/, 'ILS').replace(/ \((GPS|RNP)\)/, '').replace(' RWY ', ' ');
  return n;
}

/** The alternate card's line (AFMAN 11-202V3 4.17.3: the T-6A can't rely on GPS): "Published approaches: ILS 13R, VOR-A, RNAV 13R; non-GPS: yes". */
export function publishedLine(field, { maxListed = 8 } = {}) {
  if (!field) return null;
  if (field.source !== 'cifp') return `Published approaches: not in our data. ${field.note}; the 3D view draws only an ${ESTIMATE_WORDS}.`;
  const names = field.approaches.map(shortName);
  const shown = names.slice(0, maxListed).join(', ') + (names.length > maxListed ? ` and ${names.length - maxListed} more` : '');
  const nonGps = field.approaches.some((a) => !a.gps);
  return `Published approaches: ${shown}; non-GPS: ${nonGps ? 'yes' : 'no'} (FAA CIFP, no minima).`;
}

// ---- Geometry ------------------------------------------------------------------------------------------------------------------------

const ROLE_RANK = Object.freeze({ FAF: 5, MAP: 4, IF: 3, IAF: 2, MAHF: 1, '': 0 });

/** The height a constraint draws the path at: its altitude, or for a "between" its lower one (the lowest the procedure allows there). */
const drawFt = (alt) => (alt ? (alt.how === 'B' ? alt.ft2 : alt.ft) : null);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);

/** The points of an arc from `from` to `to` round `centre` ({ x, y }), turning `turn` ('L' or 'R'), `radiusFt` from it, at most ARC_STEP_DEG apart (the end points excluded). */
function arcPoints(from, to, centre, radiusFt, turn) {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a1 = Math.atan2(to.y - centre.y, to.x - centre.x);
  const tau = 2 * Math.PI;
  // Right is clockwise: the math angle goes down.
  let sweep = turn === 'R' ? (a0 - a1) % tau : (a1 - a0) % tau;
  if (sweep < 0) sweep += tau;
  const steps = Math.min(120, Math.max(1, Math.ceil((sweep * 180) / Math.PI / ARC_STEP_DEG)));
  const out = [];
  for (let i = 1; i < steps; i++) {
    const a = turn === 'R' ? a0 - (sweep * i) / steps : a0 + (sweep * i) / steps;
    out.push({ x: centre.x + radiusFt * Math.cos(a), y: centre.y + radiusFt * Math.sin(a) });
  }
  return out;
}

/** A hold at `fix` ({ x, y }) as a closed racetrack: inbound on `crsTrue`, turns `turn`, legs `legNm` long, HOLD_DRAW.turnNm turns (estimates for the picture). */
export function holdPoints(fix, { crsTrue, legNm, turn }) {
  const u = unitVectorFromCompassDeg(crsTrue);
  const n = turn === 'R' ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x }; // the side the turns are on
  const r = HOLD_DRAW.turnNm * FT_PER_NM;
  const L = legNm * FT_PER_NM;
  const pts = [];
  const c1 = { x: fix.x + n.x * r, y: fix.y + n.y * r };
  for (let i = 0; i <= 12; i++) {
    const t = (Math.PI * i) / 12;
    pts.push({ x: c1.x + r * (-n.x * Math.cos(t) + u.x * Math.sin(t)), y: c1.y + r * (-n.y * Math.cos(t) + u.y * Math.sin(t)) });
  }
  const c2 = { x: fix.x - u.x * L + n.x * r, y: fix.y - u.y * L + n.y * r };
  for (let i = 0; i <= 12; i++) {
    const t = (Math.PI * i) / 12;
    pts.push({ x: c2.x + r * (n.x * Math.cos(t) - u.x * Math.sin(t)), y: c2.y + r * (n.y * Math.cos(t) - u.y * Math.sin(t)) });
  }
  pts.push({ x: fix.x, y: fix.y });
  return pts;
}

/**
 * A list of legs as points in the map's feet with a height each: [{ x, y, ft, fix?, leg? }]. A leg with no fix (climb to an altitude, a heading) has no place
 * and is left out, so the line goes straight on to the next fix. An arc (AF, RF) is filled in with points round its centre. Heights: each constraint's
 * drawFt; between constraints, a straight line; before the first or after the last, level at the nearest one; `startFt` for a list with none at all.
 */
function legPoints(legs, toXY, { prev = null, startFt = null } = {}) {
  const pts = [];
  let last = prev;
  for (const leg of legs) {
    if (leg.lat === null) continue;
    const [x, y] = toXY(leg.lat, leg.lon);
    const here = { x, y, ft: drawFt(leg.alt), leg };
    if (leg.arc && last) {
      const [cx, cy] = toXY(leg.arc.lat, leg.arc.lon);
      for (const p of arcPoints(last, here, { x: cx, y: cy }, leg.arc.radiusNm * FT_PER_NM, leg.arc.turn)) pts.push({ ...p, ft: null });
    }
    // The same fix twice in a row (a hold at the end of a transition): kept once, with its constraint.
    if (last && Math.abs(last.x - x) < 1 && Math.abs(last.y - y) < 1 && pts.length) {
      const top = pts[pts.length - 1];
      if (top.ft === null) top.ft = here.ft;
      if (!top.leg || ROLE_RANK[leg.role] > ROLE_RANK[top.leg.role]) top.leg = { ...leg, alt: leg.alt ?? top.leg?.alt ?? null };
      top.holdLeg = leg.hold ? leg : top.holdLeg;
      continue;
    }
    if (leg.hold) here.holdLeg = leg;
    pts.push(here);
    last = here;
  }
  fillHeights(pts, startFt);
  return pts;
}

function fillHeights(pts, startFt) {
  const known = pts.map((p, i) => (isNum(p.ft) ? i : -1)).filter((i) => i >= 0);
  if (!known.length) {
    for (const p of pts) p.ft = startFt ?? 0;
    return;
  }
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + len(sub(pts[i], pts[i - 1])));
  for (let i = 0; i < pts.length; i++) {
    if (isNum(pts[i].ft)) continue;
    const before = known.filter((k) => k < i).at(-1);
    const after = known.find((k) => k > i);
    if (before === undefined) pts[i].ft = pts[after].ft;
    else if (after === undefined) pts[i].ft = pts[before].ft;
    else {
      const span = dist[after] - dist[before];
      const t = span > 0 ? (dist[i] - dist[before]) / span : 0;
      pts[i].ft = pts[before].ft + t * (pts[after].ft - pts[before].ft);
    }
  }
}

/**
 * Everything to draw for one approach, in the map's feet (`toXY(lat, lon)` gives [x, y]), heights in feet above sea level (unscaled):
 * { approach, paths: [{ seg: 'initial' | 'intermediate' | 'final' | 'missed', name, points: [{ x, y, ft }] }], fixes: [{ ident, role, x, y, ft, alt, gsFt }],
 *   holds: [[{ x, y, ft }]], loc: { from, to } | null (the localizer course on the ground, from the antenna out to the IF/FAF distance), glidepath: { from, to,
 *   angleDeg, tchFt } | null (from the threshold at its TCH up to the FAF's distance, at the coded angle), radial: { from, to, ident } | null (the final's VOR,
 *   TACAN or NDB course from the navaid to the furthest final fix), centreline: { from, to } | null (an estimate's extended centreline on the ground), faf: { x, y, along } | null, threshold: { x, y, ft } | null, groundFt }.
 */
export function approachGeometry(approach, toXY) {
  const groundFt = approach.thr?.elevFt ?? 0;
  const finalPts = legPoints(approach.final, toXY, { startFt: groundFt + 1500 });
  const fafIndex = finalPts.findIndex((p) => p.leg?.role === 'FAF');
  const paths = [];
  // The final approach route: intermediate up to the FAF, final from the FAF to the MAP (with no FAF coded, all of it is final).
  if (fafIndex > 0) paths.push({ seg: 'intermediate', name: 'intermediate', points: finalPts.slice(0, fafIndex + 1) });
  paths.push({ seg: 'final', name: 'final', points: fafIndex >= 0 ? finalPts.slice(fafIndex) : finalPts });
  const firstFinal = finalPts[0] ?? null;
  for (const t of approach.transitions) {
    const pts = legPoints(t.legs, toXY, { startFt: firstFinal?.ft ?? groundFt + 3000 });
    if (pts.length && firstFinal && len(sub(pts.at(-1), firstFinal)) > 1) pts.push({ x: firstFinal.x, y: firstFinal.y, ft: firstFinal.ft }); // joins the final route
    if (pts.length > 1) paths.push({ seg: 'initial', name: `${t.name} transition`, points: pts });
  }
  const lastFinal = finalPts.at(-1) ?? null;
  const missedPts = legPoints(approach.missed, toXY, { startFt: lastFinal?.ft ?? groundFt });
  if (missedPts.length && lastFinal) {
    // From the MAP, a leg with no fix (climb on a heading, to an altitude) is drawn straight to the next fix, at its constraint.
    paths.push({ seg: 'missed', name: 'missed approach', points: [{ x: lastFinal.x, y: lastFinal.y, ft: lastFinal.ft }, ...missedPts] });
  }

  // The fixes, once each, with the role that matters most where a fix has several.
  const fixes = new Map();
  const holds = [];
  for (const path of paths) {
    for (const p of path.points) {
      const leg = p.leg;
      if (!leg || !leg.fix || approach.estimate) continue;
      const known = fixes.get(leg.fix);
      if (!known || ROLE_RANK[leg.role] > ROLE_RANK[known.role] || (!known.alt && leg.alt)) {
        fixes.set(leg.fix, { ident: leg.fix, role: known && ROLE_RANK[known.role] > ROLE_RANK[leg.role] ? known.role : leg.role, x: p.x, y: p.y, ft: p.ft, alt: leg.alt ?? known?.alt ?? null, gsFt: leg.gsFt ?? known?.gsFt ?? null });
      }
      if (p.holdLeg) holds.push(holdPoints(p, p.holdLeg.hold).map((q) => ({ ...q, ft: p.ft })));
    }
  }

  let threshold = null;
  if (approach.thr) {
    const [x, y] = toXY(approach.thr.lat, approach.thr.lon);
    threshold = { x, y, ft: (approach.thr.elevFt ?? groundFt) + (approach.tchFt ?? 0) };
  }
  const faf = fafIndex >= 0 ? finalPts[fafIndex] : null;
  // The final course, true: the localizer's where there is one, else from the FAF (or the first final fix) to the threshold.
  const from = faf ?? firstFinal;
  const courseDeg = approach.loc ? approach.loc.crsTrue : from && threshold ? compassDegFromVector(threshold.x - from.x, threshold.y - from.y) : null;

  let loc = null;
  if (approach.loc) {
    const [ax, ay] = toXY(approach.loc.lat, approach.loc.lon);
    const outward = unitVectorFromCompassDeg(approach.loc.crsTrue + 180);
    const reach = Math.max(0, ...finalPts.filter((p) => p.leg && (p.leg.role === 'IF' || p.leg.role === 'FAF')).map((p) => (p.x - ax) * outward.x + (p.y - ay) * outward.y));
    const out = reach > 0 ? reach : 10 * FT_PER_NM;
    loc = { from: { x: ax, y: ay, ft: groundFt }, to: { x: ax + outward.x * out, y: ay + outward.y * out, ft: groundFt }, ident: approach.loc.ident, crsTrue: approach.loc.crsTrue };
  }

  // An estimate's 3° path is its own path; its extended centreline is drawn on the ground under it.
  const centreline = approach.estimate && firstFinal && threshold ? { from: { x: firstFinal.x, y: firstFinal.y, ft: groundFt }, to: { x: threshold.x, y: threshold.y, ft: groundFt } } : null;
  let glidepath = null;
  if (threshold && approach.gpaDeg && courseDeg !== null && !approach.estimate) {
    const outward = unitVectorFromCompassDeg(courseDeg + 180);
    const reachPts = from ? [from] : [];
    const dist = Math.max(0, ...reachPts.map((p) => (p.x - threshold.x) * outward.x + (p.y - threshold.y) * outward.y));
    const d = dist > 0 ? dist : ESTIMATE.lengthNm * FT_PER_NM;
    const rise = d * Math.tan((approach.gpaDeg * Math.PI) / 180);
    glidepath = {
      from: { x: threshold.x + outward.x * d, y: threshold.y + outward.y * d, ft: threshold.ft + rise },
      to: { ...threshold },
      angleDeg: approach.gpaDeg,
      tchFt: approach.tchFt,
      courseDeg,
    };
  }

  let radial = null;
  if (approach.nav) {
    const [nx, ny] = toXY(approach.nav.lat, approach.nav.lon);
    const placed = finalPts.filter((p) => p.leg && p.leg.role !== 'MAP');
    const far = [...placed, ...(lastFinal ? [lastFinal] : [])].sort((a, b) => len(sub(b, { x: nx, y: ny })) - len(sub(a, { x: nx, y: ny })))[0];
    if (far && len(sub(far, { x: nx, y: ny })) > FT_PER_NM * 0.2) radial = { from: { x: nx, y: ny, ft: groundFt }, to: { x: far.x, y: far.y, ft: groundFt }, ident: approach.nav.ident, kind: approach.nav.kind };
  }

  return {
    approach,
    paths: paths.map((p) => ({ ...p, points: p.points.map(({ x, y, ft }) => ({ x, y, ft })) })),
    fixes: [...fixes.values()],
    holds,
    loc,
    glidepath,
    radial,
    centreline,
    faf: faf ? { x: faf.x, y: faf.y } : null,
    threshold,
    courseDeg,
    groundFt,
  };
}

/** The 2D map's lines for one approach (lat/lon): its final course from the FAF (or the first final fix) to the threshold or MAP, its colour, and its fixes (IAF, IF, FAF) with their labels. */
export function finalCourse2d(approach) {
  const placed = approach.final.filter((l) => l.lat !== null);
  const faf = placed.find((l) => l.role === 'FAF') ?? placed[0];
  const end = approach.thr ?? placed.at(-1);
  if (!faf || !end) return null;
  const fixes = approach.estimate ? [] : [...approach.transitions.flatMap((t) => t.legs), ...approach.final]
    .filter((l) => l.lat !== null && l.fix && l.role && l.role !== 'MAP')
    .filter((l, i, all) => all.findIndex((m) => m.fix === l.fix) === i)
    .map((l) => ({ lat: l.lat, lon: l.lon, text: [l.fix, l.role, altShort(l.alt)].filter(Boolean).join(' ') }));
  const look = APPROACH_GROUPS[approach.group] ?? APPROACH_GROUPS.rnav;
  return { group: approach.group, colour: look.colour, opacity: look.opacity, name: approach.name, line: [[faf.lat, faf.lon], [end.lat, end.lon]], fixes };
}

// ---- The arrival corridor check (information only) ------------------------------------------------------------------------------------

/** A radar colour in words, from its RGB (an estimate by hue: the radar palettes run green, yellow, orange, red, magenta). */
export function radarColourWords([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return max > 160 ? 'white' : 'grey';
  let hue;
  if (max === r) hue = ((g - b) / (max - min)) * 60;
  else if (max === g) hue = (2 + (b - r) / (max - min)) * 60;
  else hue = (4 + (r - g) / (max - min)) * 60;
  hue = wrapDeg360(hue);
  if (hue < 15 || hue >= 330) return 'red';
  if (hue < 40) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 255) return 'blue';
  return 'magenta';
}

/** Distance in feet from point p to the axis-aligned rectangle centred (cx, cy), wFt east-west and dFt north-south (0 inside). */
const rectDistance = (p, cx, cy, wFt, dFt) => Math.hypot(Math.max(Math.abs(p.x - cx) - wFt / 2, 0), Math.max(Math.abs(p.y - cy) - dFt / 2, 0));

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringDistance(p, ring) {
  if (pointInRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = { x: ring[i][0], y: ring[i][1] };
    const b = { x: ring[(i + 1) % ring.length][0], y: ring[(i + 1) % ring.length][1] };
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * ab.x), p.y - (a.y + t * ab.y)));
  }
  return best;
}

/**
 * The corridor's sample points along an approach's initial, intermediate and final paths (not the missed approach), CORRIDOR.sampleNm apart:
 * [{ x, y, ft, halfFt, seg, name, toFafNm }] where toFafNm is the distance flown to the FAF (positive before it, negative after; null on a transition or with no FAF).
 */
export function corridorSamples(geometry) {
  const out = [];
  const step = CORRIDOR.sampleNm * FT_PER_NM;
  const pathLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + len(sub(p, pts[i - 1])) : 0), 0);
  // The final route is the intermediate path (to the FAF) then the final one (from it): the FAF is the end of the first, or the start of the final with none.
  const intermediate = geometry.paths.find((p) => p.seg === 'intermediate');
  const fafAlong = geometry.faf ? (intermediate ? pathLength(intermediate.points) : 0) : null;
  let routeBase = 0;
  for (const path of geometry.paths) {
    if (path.seg === 'missed') continue;
    const halfFt = (path.seg === 'final' ? CORRIDOR.finalHalfNm : CORRIDOR.initialHalfNm) * FT_PER_NM;
    const onRoute = path.seg !== 'initial';
    let base = onRoute ? routeBase : 0;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1];
      const b = path.points[i];
      const d = len(sub(b, a));
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        const along = base + t * d;
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), ft: a.ft + t * (b.ft - a.ft), halfFt, seg: path.seg, name: path.name, toFafNm: onRoute && fafAlong !== null ? (fafAlong - along) / FT_PER_NM : null });
      }
      base += d;
    }
    if (onRoute) routeBase = base;
  }
  return out;
}

const whereWords = (s) => {
  if (s.toFafNm === null) return s.seg === 'initial' ? `on the ${s.name}` : 'on the final';
  const nm = Math.round(Math.abs(s.toFafNm));
  if (nm === 0) return 'at the FAF';
  return s.toFafNm > 0 ? `${nm} NM before the FAF` : `${nm} NM after the FAF`;
};

/**
 * What weather is in an approach's corridor (information only: it never raises a caution or changes a limit). `geometry` is approachGeometry's; `weather` is
 * { radar: { status: 'ok' | other, why, blocks: weather3d-model.js mergeShafts blocks }, lightning: { status, why, bolts, cellFt }, alerts: { status, why,
 * volumes: [{ ring: [[x, y]], baseFt, topFt, words }] } }. A source whose status is not 'ok' is "can't tell" with its `why`.
 * Returns { name, hits: [{ kind, words }], cantTell: [words], words, shortWords }: `words` the whole line, `shortWords` the same without the "can't tell" part
 * (the key says that once for the field).
 */
export function corridorCheck(geometry, weather) {
  const samples = corridorSamples(geometry);
  const hits = [];
  const inside = (s, baseFt, topFt) => topFt >= s.ft - CORRIDOR.belowFt && baseFt <= s.ft + CORRIDOR.aboveFt;
  // Only the weather near the corridor's box is looked at.
  const pad = CORRIDOR.initialHalfNm * FT_PER_NM;
  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);
  const box = samples.length ? { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad } : null;
  const near = (x, y, r) => box && x + r >= box.x0 && x - r <= box.x1 && y + r >= box.y0 && y - r <= box.y1;
  // The final route's samples first, then the transitions': each weather object is named once, where the corridor first meets it in that order.
  const ordered = [...samples.filter((s) => s.seg !== 'initial'), ...samples.filter((s) => s.seg === 'initial')];
  const firstOrdered = (test) => ordered.find(test) ?? null;

  if (weather.radar?.status === 'ok') {
    // Blocks of one colour are named once: where the corridor first meets one of them, with the lowest base and highest top of them all.
    const byColour = new Map();
    for (const b of weather.radar.blocks ?? []) {
      if (!near(b.x, b.y, Math.max(b.wFt ?? 0, b.dFt ?? 0))) continue;
      const s = firstOrdered((q) => rectDistance(q, b.x, b.y, b.wFt ?? 0, b.dFt ?? 0) <= q.halfFt && inside(q, b.baseFt, b.topFt));
      if (!s) continue;
      const colour = radarColourWords(b.colour ?? [0, 200, 0]);
      const held = byColour.get(colour);
      const rank = (q) => (q.toFafNm === null ? 1e9 : q.toFafNm);
      if (!held) byColour.set(colour, { s, baseFt: b.baseFt, topFt: b.topFt });
      else {
        if (rank(s) < rank(held.s)) held.s = s;
        held.baseFt = Math.min(held.baseFt, b.baseFt);
        held.topFt = Math.max(held.topFt, b.topFt);
      }
    }
    for (const [colour, { s, baseFt, topFt }] of byColour) hits.push({ kind: 'radar', s, words: `radar return (${colour}) ${whereWords(s)}, ${feet(baseFt)}–${feet(topFt)} ft` });
  }
  if (weather.lightning?.status === 'ok') {
    const cell = weather.lightning.cellFt ?? 0;
    for (const b of weather.lightning.bolts ?? []) {
      if (!near(b.x, b.y, cell)) continue;
      const s = firstOrdered((q) => rectDistance(q, b.x, b.y, cell, cell) <= q.halfFt && inside(q, b.baseFt, b.topFt));
      if (s) hits.push({ kind: 'lightning', s, words: `lightning ${whereWords(s)}` });
    }
  }
  if (weather.alerts?.status === 'ok') {
    for (const v of weather.alerts.volumes ?? []) {
      if (!Array.isArray(v.ring) || v.ring.length < 3) continue;
      const s = firstOrdered((q) => ringDistance(q, v.ring) <= q.halfFt && inside(q, v.baseFt, v.topFt));
      if (s) hits.push({ kind: 'alert', s, words: `${v.words} ${whereWords(s)}, ${feet(v.baseFt)}–${feet(v.topFt)} ft` });
    }
  }
  // The nearest to the runway first: on the final route by distance to the FAF, then the transitions.
  hits.sort((a, b) => (a.s.toFafNm ?? 1e9) - (b.s.toFafNm ?? 1e9));
  const cantTell = [
    weather.radar?.status === 'ok' ? null : `radar: can't tell, ${weather.radar?.why ?? 'no radar'}`,
    weather.lightning?.status === 'ok' ? null : `lightning: can't tell, ${weather.lightning?.why ?? 'no lightning picture'}`,
    weather.alerts?.status === 'ok' ? null : `SIGMETs: can't tell, ${weather.alerts?.why ?? 'no SIGMETs'}`,
  ].filter(Boolean);
  const clearOf = [weather.radar?.status === 'ok' && 'radar', weather.lightning?.status === 'ok' && 'lightning', weather.alerts?.status === 'ok' && 'SIGMETs'].filter(Boolean);
  const name = geometry.approach.name;
  const listed = hits.slice(0, 3).map((h) => h.words).join('; ') + (hits.length > 3 ? `; and ${hits.length - 3} more` : '');
  const clearWords = clearOf.length ? `clear of ${clearOf.length > 1 ? `${clearOf.slice(0, -1).join(', ')} and ${clearOf.at(-1)}` : clearOf[0]}` : 'nothing to check against';
  const words = hits.length
    ? `${name}: ${listed}${cantTell.length ? ` (${cantTell.join('; ')})` : ''}`
    : `${name}: ${clearWords}${cantTell.length ? ` (${cantTell.join('; ')})` : ''}`;
  const shortWords = hits.length ? `${name}: ${listed}` : `${name}: ${clearWords}`;
  return { name, hits: hits.map(({ kind, words: w }) => ({ kind, words: w })), cantTell, words, shortWords };
}

/**
 * The card's one line for a field ("Approaches: 2 of 5 have weather in the corridor"), from its corridorCheck results; information only. `runway` names the
 * runway(s) the approaches were kept for (runway-in-use.js, "13"): "Approaches to 13: 1 of 2 has weather in the corridor".
 */
export function corridorSummary(results, { estimate = false, runway = null } = {}) {
  if (!results?.length) return null;
  const n = results.filter((r) => r.hits.length).length;
  const tell = results[0].cantTell.length ? `; ${results[0].cantTell.join('; ')}` : '';
  return `${estimate ? 'Estimated approach paths' : 'Approaches'}${runway ? ` to ${runway}` : ''}: ${n} of ${results.length} ${n === 1 ? 'has' : 'have'} weather in the corridor${tell}. Information only (3D view, Approaches key).`;
}

/** How far along and off the final course a point is from the threshold, in NM (for the words and the test): { alongNm (out from the threshold), offNm }. */
export function finalOffsets(geometry, p) {
  if (!geometry.threshold || geometry.courseDeg === null) return null;
  const out = unitVectorFromCompassDeg(geometry.courseDeg + 180);
  const far = { x: geometry.threshold.x + out.x * FT_PER_NM, y: geometry.threshold.y + out.y * FT_PER_NM };
  const o = legOffsetsFt(geometry.threshold, far, p);
  return { alongNm: o.alongFt / FT_PER_NM, offNm: o.crossFt / FT_PER_NM };
}
