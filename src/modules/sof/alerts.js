// SIGMETs, AIRMETs and PIREPs round home and the alternates (Dad, 7 Oct, plan Step 2b item 1; SOF-42): the request to our relay's /alerts (NAV CANADA's
// flight weather site behind it), the checks on its reply, a tolerant reader for each message's text, the words for each airfield's card, and the loop
// that asks again every 10 minutes while the SOF is open. The model is pure (the clock, `fetch` and the timers come in); alerts3d.js draws them in 3D.
//
// The reply is untrusted, even from our own relay: it is size capped, every field is checked for type and length, and anything wrong drops that message or
// the whole reply. Message text is shown as text only, never as HTML.
//
// What the reader understands (Canadian and ICAO SIGMET and AIRMET text; Canadian UA/UUA PIREPs and ARP air reports):
// - the area: a list of points ("WI N5000 W10600 - N5100 W10400 - ..."), a point with a radius ("WI 30NM OF N5012 W10512"), or a line with a width
//   ("WI 20NM OF LINE N5000 W10600 - N5100 W10400"; "APRX 50KM WID LINE BTN ..."), points as N5012 W10512, N50 W105, 5012N10512W or 4834N05456W;
// - the levels: FL220/300, SFC/FL120, 3000FT/FL120, BTN FL220 AND FL300, TOP FL350 (base not given: drawn from the ground, and said), BLW FL100,
//   ABV FL300 (top not given: drawn to the top of the view, and said), or one level; FL is the flight level × 100 read as feet above sea level
//   (pressure altitude taken as altitude, an approximation) and SFC is the home field's elevation (the ground the 3D view draws);
// - the hazard words (SEV TURB, SEV ICE, EMBD TS, MTW, VA, FZRA and the rest), the validity ("VALID 071200/071600", used when the relay gives no times),
//   the series ("SIGMET A1") and a cancellation ("CNCL SIGMET A1"), which takes the cancelled message off;
// - a PIREP's /OV (a station from the airports catalogue with a radial and distance, "CYQR 270020" = 20 NM on the 270 radial, or a lat/lon), /FL,
//   /TP, /TB, /IC, /SK; an ARP's position, flight level and any TURB or ICE words.
// Anything it cannot read is still listed as text and simply not drawn: the card says "position not read, see text" or "levels not read, see text".
//
// At the US bases (plan Step 2c part E, 8 Oct 2026) the relay's messages come from aviationweather.gov (the NOAA/NWS Aviation Weather Center) and carry
// their place and heights as data the relay has already checked: a SIGMET's or G-AIRMET's `area` ([[lat, lon], ...]), `baseFt` and `topFt` (feet above
// sea level, null when not given) and `hazard` (AWC's word, such as CONVECTIVE, TURB, ICE, IFR); a PIREP's `point` ([lat, lon]) and `levelFt`. The
// reader below uses those when they are there (no text has to be read to place them) and reads the text for the rest, as for NAV CANADA's.
//
// Safety rule (as the NOTAMs, SOF-42): "None" is said only when a fresh good answer, which names the field among its sites, has none near it. A failed
// fetch, an answer older than ALERTS_STALE_MS or one that does not name the field says "SIGMETs/PIREPs unavailable (last good 0612Z)".
import { readTime, hhmmZ, createRelayFeed } from './notams.js';
import { relayOrigin } from './traffic.js';
import { CATALOG } from '../../airfields/catalog.js';
import { makeLocalRef, latLonToLocalFt, localFtToLatLon } from '../../core/geo.js';
import { FT_PER_NM } from '../../core/units.js';
import { MAG_VARIATION_DEG_E } from './model-clouds.js';
import { noSourceWords } from './sites/words.js';
import { VIEW_TOP_FT } from '../../airfields/airspace/model.js';

const MINUTE_MS = 60_000;
/** Asked this often while the SOF is open (the 7 Oct brief: every 10 minutes). */
export const ALERTS_REFRESH_MS = 10 * MINUTE_MS;
/** An answer older than this is not shown as current: "SIGMETs/PIREPs unavailable (last good 0612Z)". An estimate: three missed asks. */
export const ALERTS_STALE_MS = 30 * MINUTE_MS;
/** A failed ask is tried again after this long (an estimate, as the NOTAMs'). */
export const ALERTS_RETRY_MS = MINUTE_MS;
/** The reply is read to this size (an estimate: a busy day across four fields is a few tens of KB). */
export const ALERTS_FETCH_LIMITS = Object.freeze({ timeoutMs: 20_000, maxBytes: 512 * 1024 });
/** A card lists the SIGMETs, AIRMETs and PIREPs within this distance of its field (the 7 Oct brief). */
export const ALERTS_NEARBY_NM = 100;
/**
 * A SIGMET for severe icing, severe turbulence or thunderstorms is amber with ⚠ on a card when its area comes within this distance of the field (the
 * field's area: the map's inner 25 NM ring). An estimate; Patrick may change it.
 */
export const ALERT_FIELD_AREA_NM = 25;
/** A single reported level ("SEV TURB FL350") is drawn this far above and below it. An estimate for drawing only. */
export const SINGLE_LEVEL_BAND_FT = 1000;
/** A circle's outline is this many straight sides (as the airspace's). */
export const ALERT_CIRCLE_SIDES = 48;
const KM_TO_NM = 1 / 1.852;

const MAX_ALERTS = 500;
const MAX_TEXT_CHARS = 4000;
const MAX_SITES = 12;
const YEAR_MIN = 2000;
export const ALERT_KINDS = Object.freeze(['sigmet', 'airmet', 'pirep']);
const KIND_WORDS = Object.freeze({ sigmet: 'SIGMET', airmet: 'AIRMET', pirep: 'PIREP' });
const ICAO = /^[A-Z]{4}$/;
const LOCATION = /^[A-Z0-9]{3,12}$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, key) => (Object.hasOwn(o, key) ? o[key] : undefined);
/** Control characters out, so the text can only be words (a tab or new line stays). */
const plain = (s) => String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
/** A whole number of feet with its comma: 2500 reads "2,500". */
const feet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- Positions -------------------------------------------------------------------------------------------------

// N5012 W10512, N50 W105, N5012W10512 ...
const COORD_A = /(?<![A-Z0-9])([NS])(\d{2})(\d{2})?\s?([EW])(\d{3})(\d{2})?(?![0-9])/g;
// ... and 5012N10512W, 4834N05456W, 50N105W.
const COORD_B = /(?<![A-Z0-9])(\d{2})(\d{2})?([NS])\s?(\d{3})(\d{2})?([EW])(?![A-Z0-9])/g;

function toPoint(latD, latM, ns, lonD, lonM, ew) {
  const la = Number(latD) + (latM ? Number(latM) / 60 : 0);
  const lo = Number(lonD) + (lonM ? Number(lonM) / 60 : 0);
  if ((latM && Number(latM) > 59) || (lonM && Number(lonM) > 59) || la > 90 || lo > 180) return null;
  return { lat: ns === 'S' ? -la : la, lon: ew === 'W' ? -lo : lo };
}

/** Every lat/lon in the text, in order: [{ lat, lon, index, end }]. */
export function findPoints(text) {
  const out = [];
  for (const m of text.matchAll(COORD_A)) {
    const p = toPoint(m[2], m[3], m[1], m[5], m[6], m[4]);
    if (p) out.push({ ...p, index: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(COORD_B)) {
    const p = toPoint(m[1], m[2], m[3], m[4], m[5], m[6]);
    if (p && !out.some((q) => m.index < q.end && q.index < m.index + m[0].length)) out.push({ ...p, index: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The points that follow `from` one after another, joined only by dashes, slashes, spaces, "TO" or "AND" (a list such as "N50 W106 - N51 W104 - ..."). */
function runFrom(text, points, from) {
  const run = [];
  for (const p of points) {
    if (p.index < from) continue;
    const gap = text.slice(run.length ? run.at(-1).end : from, p.index);
    if (run.length ? !/^[\s\-/]*(?:(?:TO|AND)[\s\-/]*)?$/.test(gap) : !/^[\s\-/:]*(?:(?:PSN|POINT|LINE|BTN|FM)[\s\-/:]*)?$/.test(gap)) break;
    run.push(p);
  }
  return run;
}

const strip = (p) => ({ lat: p.lat, lon: p.lon });

/** A station by its identifier from the airports catalogue: "CYQR", or the three letters "YQR" for a Canadian one. Null when it is not there. */
export function stationPoint(id) {
  const code = String(id ?? '').toUpperCase();
  const field = CATALOG[code] ?? (code.length === 3 ? CATALOG[`C${code}`] : undefined);
  return field ? { lat: field.lat, lon: field.lon, station: CATALOG[code] ? code : `C${code}` } : null;
}

/**
 * The point `distanceNm` along `radialDeg` from a station. A PIREP radial is magnetic (as a VOR's), so it is turned to true with the home base's
 * variation: the SOF's 9° E by default (Patrick's ruling for Moose Jaw, TR-65), or the site profile's `magVarDegE` where the caller passes it; across
 * the 450 NM area the real variation differs by a few degrees, so the point is approximate.
 * The distance is laid off on the flat local map round the station (core/geo.js), which is close enough at PIREP distances.
 */
export function radialPoint(station, radialDeg, distanceNm, magVarDegE = MAG_VARIATION_DEG_E) {
  const trueDeg = ((radialDeg + magVarDegE) * Math.PI) / 180;
  const ref = makeLocalRef(station.lat, station.lon);
  const ft = distanceNm * FT_PER_NM;
  return localFtToLatLon(ref, ft * Math.sin(trueDeg), ft * Math.cos(trueDeg));
}

// ---- Levels ----------------------------------------------------------------------------------------------------

const LV = String.raw`(SFC|FL\s?\d{3}|\d{3,5}\s?FT)`;
const LEVEL_PATTERNS = [
  { re: /\bFL\s?(\d{3})\/(\d{3})\b/, read: (m) => ({ base: { ft: +m[1] * 100, fl: true }, top: { ft: +m[2] * 100, fl: true } }) },
  { re: new RegExp(String.raw`\b${LV}\s?\/\s?${LV}(?![0-9])`), read: (m) => ({ base: level(m[1]), top: level(m[2]) }) },
  { re: new RegExp(String.raw`\bBTN\s+${LV}\s+AND\s+${LV}`), read: (m) => ({ base: level(m[1]), top: level(m[2]) }) },
  { re: new RegExp(String.raw`\bBLW\s+${LV}`), read: (m) => ({ base: { sfc: true }, top: level(m[1]) }) },
  { re: new RegExp(String.raw`\bTOPS?\s+(?:ABV\s+|TO\s+|NEAR\s+)?${LV}`), read: (m) => ({ base: { sfc: true, assumed: true }, top: level(m[1]) }) },
  { re: new RegExp(String.raw`\bABV\s+${LV}`), read: (m) => ({ base: level(m[1]), top: { ft: VIEW_TOP_FT, assumed: true } }) },
  { re: new RegExp(String.raw`(?:\bAT\s+|(?<![A-Z0-9/]))(FL\s?\d{3})(?![0-9/])`), read: (m) => ({ base: { ...level(m[1]), band: true }, top: { ...level(m[1]), band: true } }) },
];

/** One level token as { sfc: true } or { ft }. */
function level(token) {
  const t = token.replace(/\s/g, '');
  if (t === 'SFC') return { sfc: true };
  if (t.startsWith('FL')) return { ft: Number(t.slice(2)) * 100, fl: true };
  return { ft: Number(t.replace('FT', '')) };
}

/** The levels a SIGMET or AIRMET gives, as { base, top } ({ sfc } or { ft }, either may be `assumed`), or null when none can be read. */
export function readLevels(text) {
  for (const { re, read } of LEVEL_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const out = read(m);
    if (out.base && out.top && !out.top.sfc && (out.base.sfc || out.top.ft >= out.base.ft)) return out;
  }
  return null;
}

/** A level in words: "SFC", "FL220", "3,000 ft" (a level given in feet stays in feet). */
const levelWord = (l) => (l.sfc ? 'SFC' : l.fl ? `FL${String(Math.round(l.ft / 100)).padStart(3, '0')}` : `${feet(l.ft)} ft`);

/** "FL220–FL300", "SFC–FL120", "at FL350", "base not given–FL350", "above FL300". */
export function levelWords(levels) {
  if (!levels) return null;
  const { base, top } = levels;
  if (base.band) return `at ${levelWord(base)}`;
  if (top.assumed) return `above ${levelWord(base)}`;
  if (base.assumed) return `tops ${levelWord(top)}`;
  return `${levelWord(base)}–${levelWord(top)}`;
}

/**
 * The levels as feet above sea level for drawing: { baseFt, topFt, notes } (notes say what was assumed), or null. `groundFt` is the home field's
 * elevation, used for SFC (an approximation away from home). A single level is drawn SINGLE_LEVEL_BAND_FT above and below it (an estimate).
 */
export function levelsFt(levels, groundFt = 0) {
  if (!levels) return null;
  const notes = [];
  const at = (l) => (l.sfc ? groundFt : l.ft);
  let baseFt = at(levels.base);
  let topFt = at(levels.top);
  if (levels.base.band) {
    baseFt -= SINGLE_LEVEL_BAND_FT;
    topFt += SINGLE_LEVEL_BAND_FT;
    notes.push(`one level given: drawn ${feet(SINGLE_LEVEL_BAND_FT)} ft above and below it (estimate)`);
  }
  if (levels.base.assumed) notes.push('base not given: drawn from the ground');
  if (levels.top.assumed) notes.push('top not given: drawn to the top of the view');
  baseFt = Math.max(baseFt, groundFt);
  if (!(topFt > baseFt)) topFt = baseFt + 2 * SINGLE_LEVEL_BAND_FT;
  return { baseFt, topFt, notes };
}

// ---- Hazards ---------------------------------------------------------------------------------------------------

// The hazard words of a SIGMET or AIRMET, in order of weight. `family` sets the colour family (turbulence, icing, thunderstorm, other); `severe` marks
// what turns a SIGMET amber on a card over the field (SEV ICE, SEV TURB, TS: the 7 Oct brief).
const HAZARDS = [
  { re: /\bSEV\s+TURB\b/, family: 'turb', severe: true },
  { re: /\bSEV\s+(?:ICE|ICG)\b(?:\s*\(FZRA\))?/, family: 'ice', severe: true },
  { re: /\b(?:(?:EMBD|OBSC|FRQ|SQL|ISOL|OCNL)\s+)?TS(?:GR|GS)?\b/, family: 'ts', severe: true },
  { re: /\bSEV\s+MTW\b/, family: 'turb' },
  { re: /\bMOD\s+TURB\b/, family: 'turb' },
  { re: /\bMOD\s+(?:ICE|ICG)\b/, family: 'ice' },
  { re: /\b(?:(?:ISOL|OCNL|FRQ|EMBD)\s+)?(?:CB|TCU)\b/, family: 'ts' },
  { re: /\bMTW\b/, family: 'turb' },
  { re: /\bVA(?:\s+CLD|\s+ERUPTION)?\b/, family: 'other' },
  { re: /\bRDOACT\s+CLD\b/, family: 'other' },
  { re: /\b(?:HVY\s+)?FZ(?:RA|DZ)\b/, family: 'ice' },
  { re: /\bHVY\s+(?:DS|SS)\b/, family: 'other' },
  { re: /\bLLWS\b/, family: 'turb' },
  { re: /\bTC\b/, family: 'other' },
  { re: /\bMT\s+OBSC\b/, family: 'other' },
  { re: /\bSFC\s+VIS\b[^.=]*?\b\d+\s?(?:SM|M)\b/, family: 'other' },
  { re: /\b(?:BKN|OVC)\s+CLD\b[^.=]*?\b\d{3,5}\s?FT\b/, family: 'other' },
];

/** The hazard words in a SIGMET or AIRMET: { words: ['SEV TURB', ...], family, severe }. */
export function readHazards(text) {
  const words = [];
  let family = null;
  let severe = false;
  for (const h of HAZARDS) {
    const m = h.re.exec(text);
    if (!m) continue;
    const said = m[0].replace(/\s+/g, ' ').trim();
    if (words.some((w) => w.includes(said))) continue;
    words.push(said);
    family ??= h.family;
    if (h.severe) severe = true;
  }
  return { words, family: family ?? 'other', severe };
}

// ---- Areas -----------------------------------------------------------------------------------------------------

const CIRCLE = /\b(?:WI|WTN)\s+(\d{1,3})\s?(NM|KM)\s+(?:RADIUS\s+)?OF\s+(?!LINE\b)(?:(?:PSN|POINT|CENTRE|CENTER)\s+)?/;
const LINE = /\b(?:WI|WTN)\s+(\d{1,3})\s?(NM|KM)\s+(?:(?:EITHER\s+SIDE|EACH\s+SIDE)\s+)?OF\s+(?:A\s+)?LINE\b/;
const WIDE_LINE = /\bAPRX\s+(\d{1,3})\s?(NM|KM)\s+WID\s+LINE\b/;
const POLYGON = /\b(?:WI|WTN|BOUNDED\s+BY)\b/;

const nm = (value, unit) => Number(value) * (unit === 'KM' ? KM_TO_NM : 1);

/**
 * The area a SIGMET or AIRMET covers: { type: 'polygon', points }, { type: 'circle', center, radiusNm }, { type: 'line', points, halfWidthNm }, or null
 * when it can't be read. Points are { lat, lon }.
 */
export function readArea(text) {
  const points = findPoints(text);
  let m = LINE.exec(text);
  if (m) {
    const run = runFrom(text, points, m.index + m[0].length);
    if (run.length >= 2) return { type: 'line', points: run.map(strip), halfWidthNm: nm(m[1], m[2]) };
  }
  m = WIDE_LINE.exec(text);
  if (m) {
    const run = runFrom(text, points, m.index + m[0].length);
    if (run.length >= 2) return { type: 'line', points: run.map(strip), halfWidthNm: nm(m[1], m[2]) / 2 };
  }
  m = CIRCLE.exec(text);
  if (m) {
    const after = m.index + m[0].length;
    const run = runFrom(text, points, after);
    const station = /^\/?([A-Z]{3,4})\b/.exec(text.slice(after));
    const center = run.length ? strip(run[0]) : station ? stationPoint(station[1]) : null;
    if (center) return { type: 'circle', center: { lat: center.lat, lon: center.lon }, radiusNm: nm(m[1], m[2]) };
  }
  m = POLYGON.exec(text);
  const listed = m ? runFrom(text, points, m.index + m[0].length) : [];
  const ring = listed.length >= 3 ? listed : longestRun(text, points);
  if (ring.length >= 3) {
    const pts = ring.map(strip);
    if (pts.length > 3 && pts[0].lat === pts.at(-1).lat && pts[0].lon === pts.at(-1).lon) pts.pop(); // a closed list repeats its first point
    return { type: 'polygon', points: pts };
  }
  return null;
}

/** The longest list of points joined by dashes anywhere in the text (a polygon written without WI). */
function longestRun(text, points) {
  let best = [];
  for (const p of points) {
    const run = runFrom(text, points, p.index);
    if (run.length > best.length) best = run;
  }
  return best;
}

// ---- One message -----------------------------------------------------------------------------------------------

const VALID = /\bVALID\s+(\d{2})(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})\b/;
const SERIES = /\b(SIGMET|AIRMET)\s+([A-Z]{1,2}\d{1,2})\b/g;
const CANCEL = /\bCNCL\s+(SIGMET|AIRMET)\s+([A-Z]{1,2}\d{1,2})\b/;
const FIR = /\b([A-Z]{4})\s+(?:SIGMET|AIRMET)\b/;

/** A day-hour-minute ("071200") as milliseconds, in the month nearest `now` (so 31/2300 read on the 1st is last month's). Null when not a time. */
function dayTime(dd, hh, mi, now) {
  const [d, h, m] = [dd, hh, mi].map(Number);
  if (d < 1 || d > 31 || h > 24 || m > 59) return null;
  const n = new Date(now);
  let best = null;
  for (const shift of [-1, 0, 1]) {
    const t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + shift, d, h, m);
    if (new Date(t).getUTCDate() !== d && h !== 24) continue;
    if (best === null || Math.abs(t - +now) < Math.abs(best - +now)) best = t;
  }
  return best;
}

const PIREP_FIELDS = ['OV', 'TM', 'FL', 'TP', 'SK', 'WX', 'TA', 'WV', 'TB', 'IC', 'RM'];

/** A UA/UUA PIREP's fields: { OV: 'CYQR 270020', FL: '080', TB: 'MOD', ... }. */
function pirepFields(text) {
  const out = {};
  // A field's name runs straight into its value ("/FL080", "/OV CYQR"), so it ends at a space, a digit, or the unknown-level words; "/OVC050" is not /OV.
  const re = new RegExp(String.raw`\/\s?(${PIREP_FIELDS.join('|')})(?=[\s\d]|$|UNKN|DUR)\s*`, 'g');
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const from = m.index + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
    if (!(m[1] in out)) out[m[1]] = text.slice(from, to).replace(/=\s*$/, '').trim();
  });
  return out;
}

/** Where a PIREP's /OV puts it: { lat, lon, how } or null. */
function overPoint(ov, magVarDegE) {
  if (!ov) return null;
  const first = ov.split(/\s*-\s*/)[0];
  const coords = findPoints(first);
  if (coords.length) return { ...strip(coords[0]), how: 'lat/lon' };
  const m = /^([A-Z0-9]{3,4})\s?(?:(\d{3})(\d{3}))?\b/.exec(first);
  if (!m) return null;
  const station = stationPoint(m[1]);
  if (!station) return null;
  if (!m[2]) return { lat: station.lat, lon: station.lon, how: `over ${station.station}` };
  const radial = Number(m[2]);
  const dist = Number(m[3]);
  if (radial > 360) return null;
  return { ...radialPoint(station, radial % 360, dist, magVarDegE), how: `${dist} NM on the ${m[2]} radial of ${station.station} (approximate)` };
}

/** A PIREP flight level ("080", "FL080", "080-120", "DURD") as a level, or null. */
function pirepLevel(fl) {
  const m = /^(?:FL)?\s?(\d{3})(?:\s?-\s?(?:FL)?(\d{3}))?\b/.exec(fl ?? '');
  if (!m) return null;
  return { ft: Number(m[1]) * 100, fl: true };
}

/** A PIREP's reported hazards: { words, family } (turbulence amber, icing blue, other white). NEG (none) is not a hazard. */
function pirepHazards(fields, text, urgent) {
  const words = [];
  let turb = false;
  let ice = false;
  const tb = fields.TB;
  if (tb && !/^(?:NEG|NIL|SMOOTH|SMTH)\b/.test(tb)) { // SMOOTH or SMTH (as US reports write it) is no turbulence, as NEG is
    words.push(`turbulence ${tb}`);
    turb = true;
  }
  const ic = fields.IC;
  if (ic && !/^NEG\b|^NIL\b/.test(ic)) {
    words.push(`icing ${ic}`);
    ice = true;
  }
  if (!tb && !ic) { // an ARP or free text: its own words
    const t = /\b((?:LGT|MOD|SEV|LGT-MOD|MOD-SEV)\s+)?(?:TURB|TB|CHOP)\b/.exec(text);
    if (t && !/\bNEG\b/.test(text.slice(t.index, t.index + 20))) {
      words.push(t[0]);
      turb = true;
    }
    const c = /\b((?:LGT|MOD|SEV|TRACE)\s+)?(?:ICE|ICG|ICING)\b/.exec(text);
    if (c) {
      words.push(c[0]);
      ice = true;
    }
  }
  if (fields.WX) words.push(fields.WX);
  if (fields.RM) words.push(fields.RM);
  if (urgent) words.unshift('URGENT');
  return { words, family: turb ? 'turb' : ice ? 'ice' : 'other' };
}

/**
 * One message's text read into plain data (never throws). `item` is the relay's { kind, location, start, end, text }; `now` resolves a "VALID"
 * time when the relay gave none. Returns:
 * { key, kind, kindWords, text, location, start, end, hazards: { words, family, severe }, area, point, levels, levelWords, series, fir, cancels,
 *   drawable, note } where `area` (SIGMET/AIRMET) or `point` (PIREP) is null when the position can't be read, `levels` is null when the heights
 *   can't be, and `note` says what was not read ("position not read, see text").
 */
export function parseAlert(item, { now = Date.now(), magVarDegE = MAG_VARIATION_DEG_E } = {}) {
  const text = String(item.text ?? '');
  const flat = text.toUpperCase().replace(/\s+/g, ' ');
  const kind = item.kind;
  const base = {
    key: `${kind}|${item.location ?? ''}|${item.start ?? ''}|${flat.slice(0, 120)}`,
    kind, kindWords: KIND_WORDS[kind], text, location: item.location ?? null, start: item.start ?? null, end: item.end ?? null,
    area: null, point: null, levels: null, levelWords: null, series: null, fir: null, cancels: null, drawable: false, note: null,
  };
  if (kind === 'pirep') {
    const arp = /^\s*ARP\s+(\S+)\s+/.exec(flat);
    const fields = arp ? {} : pirepFields(flat);
    let point = null;
    let levels = null;
    if (arp) {
      const pts = findPoints(flat);
      if (pts.length) point = { ...strip(pts[0]), how: 'lat/lon' };
      const f = /\bF(\d{3})\b/.exec(flat);
      if (f) levels = { ft: Number(f[1]) * 100, fl: true };
    } else {
      point = overPoint(fields.OV, magVarDegE);
      levels = pirepLevel(fields.FL);
    }
    if (item.point) point = { lat: item.point.lat, lon: item.point.lon, how: 'lat/lon given with the report' }; // AWC's own position for it beats the text's
    if (!levels && Number.isFinite(item.levelFt)) levels = { ft: item.levelFt, fl: true };
    if (!point && item.location) { // the relay's location: a lat/lon or a station
      const pts = findPoints(item.location);
      const station = pts.length ? null : stationPoint(item.location);
      if (pts.length) point = { ...strip(pts[0]), how: 'lat/lon' };
      else if (station) point = { lat: station.lat, lon: station.lon, how: `over ${station.station}` };
    }
    const hazards = pirepHazards(fields, flat, /^\s*\S*\s*UUA\b/.test(flat));
    const type = fields.TP ? fields.TP.split(/\s/)[0] : arp ? arp[1] : null;
    const notes = [!point && 'position not read, see text', point && !levels && 'level not read, see text'].filter(Boolean);
    return {
      ...base,
      hazards: { ...hazards, severe: false },
      point,
      aircraft: type,
      sky: fields.SK ?? null,
      levels: levels ? { base: levels, top: levels } : null,
      levelWords: levels ? levelWord(levels) : null,
      drawable: Boolean(point && levels),
      note: notes.length ? notes.join('; ') : null,
    };
  }

  // SIGMET or AIRMET.
  const cancel = CANCEL.exec(flat);
  const series = [...flat.matchAll(SERIES)].find((m) => !cancel || m.index !== cancel.index + cancel[0].indexOf(cancel[1]));
  const fir = FIR.exec(flat)?.[1] ?? null;
  let { start, end } = base;
  const valid = VALID.exec(flat);
  if (valid && (start === null || end === null)) {
    start ??= dayTime(valid[1], valid[2], valid[3], now);
    end ??= dayTime(valid[4], valid[5], valid[6], now);
    if (start !== null && end !== null && end < start) end += 31 * 24 * 60 * MINUTE_MS; // never seen; keeps a cross-month pair the right way round
  }
  const area = cancel ? null : item.area ? polygonOf(item.area) : readArea(flat);
  const levels = cancel ? null : levelsGiven(item) ?? readLevels(flat);
  const hazards = withGivenHazard(readHazards(flat), item);
  const notes = cancel ? [] : [!area && 'position not read, see text', area && !levels && 'levels not read, see text'].filter(Boolean);
  return {
    ...base,
    key: series && fir ? `${kind}|${fir}|${series[2]}|${start ?? ''}` : base.key,
    start,
    end,
    hazards,
    area,
    levels,
    levelWords: levelWords(levels),
    series: series ? series[2] : null,
    fir,
    cancels: cancel ? { kind: cancel[1].toLowerCase(), series: cancel[2] } : null,
    drawable: Boolean(area && levels),
    note: notes.length ? notes.join('; ') : null,
  };
}

// ---- AWC's structured fields (US bases) ---------------------------------------------------------------------------

/** A given area ([{ lat, lon }], a closing repeat of the first point dropped) as the reader's polygon. */
function polygonOf(pts) {
  const points = pts.map((p) => ({ lat: p.lat, lon: p.lon }));
  if (points.length > 3 && points[0].lat === points.at(-1).lat && points[0].lon === points.at(-1).lon) points.pop();
  return { type: 'polygon', points };
}

/**
 * The levels the relay gave (`baseFt`, `topFt`, feet above sea level) in the reader's form, or null when no top was given (the text is read then).
 * A base of 0 is the surface; no base is "base not given" (drawn from the ground, and said); 18,000 ft and above read as flight levels (the US
 * transition altitude), lower ones in feet.
 */
function levelsGiven(item) {
  if (!Number.isFinite(item.topFt)) return null;
  const at = (ft) => (ft >= 18_000 ? { ft, fl: true } : { ft });
  const base = !Number.isFinite(item.baseFt) ? { sfc: true, assumed: true } : item.baseFt === 0 ? { sfc: true } : at(item.baseFt);
  const top = at(item.topFt);
  return base.sfc || top.ft >= base.ft ? { base, top } : null;
}

// AWC's hazard words: its family, and whether a SIGMET for it counts as severe for the card's amber (a US non-convective SIGMET is only issued for
// severe turbulence or severe icing, a convective one for thunderstorms; the 7 Oct rule: SEV ICE, SEV TURB and TS).
const AWC_HAZARDS = Object.freeze({
  CONVECTIVE: { words: 'TS (convective SIGMET)', family: 'ts', severe: true },
  TS: { words: 'TS', family: 'ts', severe: true },
  TURB: { words: 'SEV TURB', family: 'turb', severe: true },
  'TURB-HI': { words: 'MOD TURB above FL180', family: 'turb' },
  'TURB-LO': { words: 'MOD TURB below FL180', family: 'turb' },
  LLWS: { words: 'LLWS', family: 'turb' },
  SFC_WND: { words: 'surface wind over 30 kt', family: 'other' },
  SFC_WIND: { words: 'surface wind over 30 kt', family: 'other' },
  ICE: { words: 'ICE', family: 'ice' },
  IFR: { words: 'IFR', family: 'other' },
  MT_OBSC: { words: 'MT OBSC', family: 'other' },
  'MTN OBSCN': { words: 'MT OBSC', family: 'other' },
  ASH: { words: 'VA', family: 'other' },
  DUST: { words: 'DS', family: 'other' },
});

/** The text's hazards, filled from the given AWC hazard when the text gave none (and a US SIGMET's hazard marked severe as the 7 Oct rule). */
function withGivenHazard(hazards, item) {
  const given = item.hazard ? AWC_HAZARDS[item.hazard] : null;
  if (!given) return hazards;
  const words = hazards.words.length ? hazards.words : [item.kind === 'sigmet' && given === AWC_HAZARDS.ICE ? 'SEV ICE' : given.words];
  return { words, family: hazards.words.length ? hazards.family : given.family, severe: hazards.severe || (item.kind === 'sigmet' && (given.severe || given === AWC_HAZARDS.ICE)) };
}

// ---- Reading the reply ------------------------------------------------------------------------------------------

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isLatLon = (p) => Array.isArray(p) && p.length === 2 && isNumber(p[0]) && isNumber(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
const MAX_AREA_POINTS = 500;
/** A height in feet above sea level as the relay gives it (0 to 100,000), else null. */
const heightFt = (v) => (isNumber(v) && v >= 0 && v <= 100_000 ? v : null);
const AWC_WORD = /^[A-Z0-9][A-Z0-9 _/-]{0,23}$/;

/**
 * The structured fields the relay adds for an AWC message (see the top of this file), each checked; a bad one is left out and the text is read instead.
 * Returns { area?: [{ lat, lon }], baseFt?, topFt?, hazard?, severity?, point?: { lat, lon }, levelFt? }.
 */
function readStructured(n) {
  const out = {};
  const area = own(n, 'area');
  if (Array.isArray(area) && area.length >= 3 && area.length <= MAX_AREA_POINTS && area.every(isLatLon)) out.area = area.map(([lat, lon]) => ({ lat, lon }));
  for (const key of ['baseFt', 'topFt', 'levelFt']) {
    const v = heightFt(own(n, key));
    if (v !== null) out[key] = v;
  }
  for (const key of ['hazard', 'severity']) {
    const v = own(n, key);
    if (typeof v === 'string' && AWC_WORD.test(v)) out[key] = v;
  }
  const point = own(n, 'point');
  if (isLatLon(point)) out.point = { lat: point[0], lon: point[1] };
  return out;
}

function readOne(n) {
  if (!isObject(n)) return null;
  const kind = own(n, 'kind');
  const text = own(n, 'text');
  if (typeof kind !== 'string' || !ALERT_KINDS.includes(kind)) return null;
  if (typeof text !== 'string' || !text.trim()) return null;
  const location = own(n, 'location');
  const startValue = own(n, 'start');
  const endValue = own(n, 'end');
  const start = startValue === null || startValue === undefined ? null : readTime(startValue);
  const end = endValue === null || endValue === undefined ? null : readTime(endValue);
  if (startValue != null && start === null) return null;
  if (endValue != null && end === null) return null; // a bad end is not "no end"
  return {
    kind,
    location: typeof location === 'string' && LOCATION.test(location.trim().toUpperCase()) ? location.trim().toUpperCase() : null,
    start,
    end,
    text: plain(text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text).trim(),
    ...readStructured(n),
  };
}

/**
 * The relay's /alerts reply (parsed, or JSON text) checked, each message read (parseAlert): { fetched (ms, or null when the relay's own time is not
 * believable), sites: ['CYMJ', ...], alerts: [parsed] }. The same message twice is kept once; a cancelled SIGMET or AIRMET (a later "CNCL SIGMET A1"
 * from the same FIR) is dropped with its cancellation. Returns null for anything that is not the expected shape. Never throws.
 */
export function readAlertsReply(input, { now = Date.now(), magVarDegE = MAG_VARIATION_DEG_E } = {}) {
  try {
    let json = input;
    if (typeof input === 'string') {
      if (input.length > ALERTS_FETCH_LIMITS.maxBytes) return null;
      json = JSON.parse(input);
    }
    if (!isObject(json)) return null;
    const list = own(json, 'alerts');
    const sites = own(json, 'sites');
    if (!Array.isArray(list) || !Array.isArray(sites) || sites.length > MAX_SITES) return null;
    const names = [];
    for (const s of sites) {
      if (typeof s !== 'string' || !ICAO.test(s.trim().toUpperCase())) return null;
      names.push(s.trim().toUpperCase());
    }
    const seen = new Set();
    const read = [];
    for (const n of list.slice(0, MAX_ALERTS)) {
      const one = readOne(n);
      if (!one) continue;
      const parsed = parseAlert(one, { now: +now, magVarDegE });
      const same = `${parsed.kind}|${parsed.text.toUpperCase().replace(/\s+/g, ' ')}`;
      if (seen.has(same)) continue;
      seen.add(same);
      read.push(parsed);
    }
    const cancels = read.filter((a) => a.cancels);
    const alerts = read.filter((a) => !a.cancels && !cancels.some((c) => c.cancels.kind === a.kind && c.cancels.series === a.series && (c.fir === null || c.fir === a.fir)));
    const fetched = own(json, 'fetched');
    const believable = typeof fetched === 'number' && Number.isFinite(fetched) && fetched > Date.UTC(YEAR_MIN, 0, 1) && fetched <= +now + 5 * MINUTE_MS;
    return { fetched: believable ? fetched : null, sites: names, alerts };
  } catch {
    return null;
  }
}

/** `<relay>/alerts?sites=CYMJ,CYQR`, or null with no good relay address or no field to ask about. Four-letter codes only. */
export function alertsUrl({ baseUrl, sites }) {
  const origin = relayOrigin(baseUrl);
  const codes = [...new Set((sites ?? []).filter((s) => typeof s === 'string' && ICAO.test(s.trim().toUpperCase())).map((s) => s.trim().toUpperCase()))].slice(0, MAX_SITES);
  if (!origin || codes.length === 0) return null;
  return `${origin}/alerts?sites=${codes.join(',')}`;
}

// ---- Distances from a field -------------------------------------------------------------------------------------

/** Flat map in NM round `from` (x east, y north), from core/geo.js's local feet. */
function flatNm(from) {
  const ref = makeLocalRef(from.lat, from.lon);
  return (p) => {
    const f = latLonToLocalFt(ref, p.lat, p.lon);
    return { x: f.x / FT_PER_NM, y: f.y / FT_PER_NM };
  };
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function inside(p, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}

/** How far a message's area or point is from a field, in NM (0 when the field is inside it), or null when its position was not read. */
export function distanceNm(alert, field) {
  const to = flatNm(field);
  const p = { x: 0, y: 0 };
  if (alert.point) {
    const q = to(alert.point);
    return Math.hypot(q.x, q.y);
  }
  const area = alert.area;
  if (!area) return null;
  if (area.type === 'circle') {
    const c = to(area.center);
    return Math.max(0, Math.hypot(c.x, c.y) - area.radiusNm);
  }
  const pts = area.points.map(to);
  if (area.type === 'line') {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentDistance(p, pts[i - 1], pts[i]));
    return Math.max(0, best - area.halfWidthNm);
  }
  if (inside(p, pts)) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) best = Math.min(best, segmentDistance(p, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

// ---- What a card shows ---------------------------------------------------------------------------------------------

/** "until 1600Z", "from 1400Z until 1600Z", or a PIREP's "1332Z". */
export function alertTimeWords(alert, now) {
  if (alert.kind === 'pirep') return alert.start !== null ? `reported ${hhmmZ(alert.start)}` : 'time not given';
  if (alert.end === null) return alert.start !== null ? `from ${hhmmZ(alert.start)}` : 'validity not given';
  return alert.start !== null && alert.start > +now ? `from ${hhmmZ(alert.start)} until ${hhmmZ(alert.end)}` : `until ${hhmmZ(alert.end)}`;
}

/** The message is in force or coming: not past its end. */
export const notExpired = (alert, now) => alert.end === null || alert.end >= +now;

const KIND_RANK = { sigmet: 0, airmet: 1, pirep: 2 };

/**
 * One airfield's SIGMETs, AIRMETs and PIREPs as its card shows them, from the feed's state (`createAlertsFeed().state()`); `field` is { icao, lat, lon }.
 * Returns { status: 'ok' | 'unavailable' | 'unset', words, list: [{ key, kind, kindWords, hazardWords, levelWords, timeWords, where, warn, note, text }] }.
 * - 'unset': no relay address; words say where it goes.
 * - 'unavailable': never fetched, the last ask failed, the answer is older than ALERTS_STALE_MS, or it does not name this field:
 *   "SIGMETs/PIREPs unavailable (last good 0612Z)".
 * - 'ok': a fresh good answer. `list` is what is within ALERTS_NEARBY_NM of the field and not past its end, plus any message whose position was not read
 *   (listed so it is never lost), amber (`warn`) first. Empty means none, and `words` says so.
 */
export function alertsFor(state, field, now) {
  const at = +now;
  // The base's site profile has no SIGMET/AIRMET/PIREP source (`state.noSource`): it can't tell, and says so, never "No SIGMETs".
  if (state.noSource) return { status: 'unavailable', words: noSourceWords('SIGMETs/PIREPs'), list: [] };
  if (!state.relay) return { status: 'unset', words: 'SIGMETs/PIREPs need the relay address in SOF settings', list: [] };
  const good = state.lastGood;
  const dataTime = good ? Math.min(good.fetched ?? good.receivedAt, good.receivedAt) : null;
  const lastGood = good ? `last good ${hhmmZ(dataTime)}` : 'none yet';
  const named = good?.sites.includes(String(field?.icao).toUpperCase()) === true;
  if (!good || at - dataTime > ALERTS_STALE_MS || state.failed || !named) {
    return { status: 'unavailable', words: `SIGMETs/PIREPs unavailable (${lastGood})`, list: [] };
  }
  const known = Number.isFinite(field?.lat) && Number.isFinite(field?.lon);
  const list = [];
  for (const a of good.alerts) {
    if (!notExpired(a, at)) continue;
    const d = known ? distanceNm(a, field) : null;
    if (d !== null && d > ALERTS_NEARBY_NM) continue;
    const warn = a.kind === 'sigmet' && a.hazards.severe && d !== null && d <= ALERT_FIELD_AREA_NM;
    list.push({
      key: a.key,
      kind: a.kind,
      kindWords: a.kindWords,
      hazardWords: a.hazards.words.length ? a.hazards.words.join(', ') : a.kind === 'pirep' ? (a.aircraft ? `${a.aircraft}, no hazard reported` : 'no hazard reported') : 'hazard not read, see text',
      levelWords: a.levelWords,
      timeWords: alertTimeWords(a, at),
      where: d === null ? null : d < 0.5 ? 'over the field' : `${Math.round(d)} NM away`,
      d,
      warn,
      note: a.note,
      text: a.text,
    });
  }
  list.sort((x, y) => Number(y.warn) - Number(x.warn) || KIND_RANK[x.kind] - KIND_RANK[y.kind] || (x.d ?? Infinity) - (y.d ?? Infinity));
  return { status: 'ok', words: list.length ? '' : `No SIGMETs, AIRMETs or PIREPs within ${ALERTS_NEARBY_NM} NM`, list: list.map(({ d, ...rest }) => rest) };
}

/**
 * What the 3D view draws: the messages not past their end that can be drawn, with their heights in feet above sea level for `groundFt` (home's
 * elevation), and the status in words. { status: 'ok' | 'unavailable' | 'unset', words, alerts: [parsed + { baseFt, topFt, levelNotes }], notDrawn }.
 * With no fresh answer nothing is drawn (never frozen).
 */
export function alerts3dView(state, now, groundFt = 0) {
  const at = +now;
  if (state.noSource) return { status: 'unavailable', words: noSourceWords('SIGMETs/PIREPs'), alerts: [], notDrawn: 0, signature: 'nosource' };
  if (!state.relay) return { status: 'unset', words: 'SIGMETs/PIREPs need the relay address in SOF settings', alerts: [], notDrawn: 0, signature: 'unset' };
  const good = state.lastGood;
  const dataTime = good ? Math.min(good.fetched ?? good.receivedAt, good.receivedAt) : null;
  if (!good || at - dataTime > ALERTS_STALE_MS || state.failed) {
    return { status: 'unavailable', words: `SIGMETs/PIREPs unavailable (${good ? `last good ${hhmmZ(dataTime)}` : 'none yet'})`, alerts: [], notDrawn: 0, signature: 'unavailable' };
  }
  const live = good.alerts.filter((a) => notExpired(a, at));
  const alerts = live.filter((a) => a.drawable).map((a) => {
    const ft = levelsFt(a.levels, groundFt);
    return { ...a, baseFt: ft.baseFt, topFt: ft.topFt, levelNotes: ft.notes };
  });
  const notDrawn = live.length - alerts.length;
  const counts = ALERT_KINDS.map((k) => `${alerts.filter((a) => a.kind === k).length} ${KIND_WORDS[k]}${alerts.filter((a) => a.kind === k).length === 1 ? '' : 's'}`).join(', ');
  return {
    status: 'ok',
    words: `SIGMETs/AIRMETs/PIREPs as fetched ${hhmmZ(dataTime)}: ${counts} drawn${notDrawn ? `; ${notDrawn} listed on the cards only (position or levels not read)` : ''}`,
    alerts,
    notDrawn,
    signature: `${groundFt}|${alerts.map((a) => a.key).join(',')}`,
  };
}

// ---- The loop -------------------------------------------------------------------------------------------------------

/**
 * Asks the relay for the SIGMETs, AIRMETs and PIREPs near `address()`'s sites (an `alertsUrl`, or null when no relay is set), at once and then every
 * ALERTS_REFRESH_MS while the SOF is open, paused while `paused()`. The NOTAMs' loop (notams.js createRelayFeed): the same request limits, the same
 * keeping of the last good answer and retry after a failure. Returns { sync(), wake(), stop(), state() } (state: { relay, lastGood, failed, busy }).
 */
export function createAlertsFeed(options) {
  // `options.magVarDegE()` is the home base's variation (its site profile), read each time a reply is read; Moose Jaw's when left out.
  const magVarDegE = options.magVarDegE ?? (() => MAG_VARIATION_DEG_E);
  return createRelayFeed({ ...options, read: (text, ctx) => readAlertsReply(text, { ...ctx, magVarDegE: magVarDegE() }), refreshMs: ALERTS_REFRESH_MS, retryMs: ALERTS_RETRY_MS, limits: ALERTS_FETCH_LIMITS });
}
