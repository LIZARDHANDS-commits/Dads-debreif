// The relay's US answers for the SOF's US T-6 bases (plan Step 2c part E; Dad, 8 Oct 2026: "start without key for some of it"). wx.js routes each
// asked site by its first letter: K sites come here, every other site goes to NAV CANADA as before.
//
// - SIGMETs, G-AIRMETs and PIREPs from the NOAA/NWS Aviation Weather Center's data API (aviationweather.gov/api/data, public domain, no key). A page
//   cannot read it directly (no CORS header), so the relay asks. Its replies give each area as a list of points and each level as a number, so
//   nothing has to be read out of the text to place them; the text is still passed on (cleaned) for the cards.
// - NOTAMs from the FAA NOTAM API (external-api.faa.gov/notamapi/v1), which needs a free FAA account's client id and secret. They come only from the
//   relay's environment (FAA_CLIENT_ID and FAA_CLIENT_SECRET, set on Netlify, never in the repository); they are sent only to the FAA's own address
//   and never logged or echoed. Without them the answer is a plain "FAA NOTAM key not set", never an empty list.
//
// Every upstream reply is untrusted: size-capped by the caller, parsed as JSON, and rebuilt field by field from an allowlist (numbers checked for
// range, text cut to printable characters and capped, times rebuilt from their numbers), so nothing passes through as it came.
//
// AWC: checked against live replies and AWC's own OpenAPI file (aviationweather.gov/data/schema/openapi.yaml) on 8 Oct 2026: airsigmet altitudes
// in feet (altitudeHi1 38000), severity a number, coords { lat, lon }; gairmet levels as hundreds of feet in text ("250", "SFC", "FZL" with
// fzlbase/fzltop), due_to, forecastHour; pirep fltLvl in hundreds of feet (340), distance in statute miles; an empty answer is 204 with no body.
// FAA NOTAM API: see trimFaaNotams for what was and was not checked.

const MAX_TEXT = 4000;
const MAX_POINTS = 400;
/** Most alerts one answer carries for the US sites (an estimate: a busy day's SIGMETs, one G-AIRMET snapshot and the PIREPs round eight fields). */
export const MAX_US_ALERTS = 400;
export const MAX_US_NOTAMS = 300;

export const AWC_BASE = 'https://aviationweather.gov/api/data';
export const FAA_NOTAM_UPSTREAM = 'https://external-api.faa.gov/notamapi/v1/notams';
/** What the relay says when the FAA key is not set; the page reads exactly these words (notams.js). */
export const FAA_KEY_NOT_SET = 'FAA NOTAM key not set';
/**
 * PIREPs are asked for within this distance of each K site. AWC's `distance` is in statute miles (checked 8 Oct 2026: a PIREP 65.9 SM / 57.2 NM from
 * KCBM came back for distance=67 and not for 64), so 116 SM covers the 100 NM the cards list (alerts.js ALERTS_NEARBY_NM; 100 NM = 115.1 SM).
 */
export const PIREP_DISTANCE = 116;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanText = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/[^\x20-\x7E\n]/g, '').trim().slice(0, max) : null);
const WORD = /^[A-Z0-9][A-Z0-9 _/-]{0,23}$/;
/** An upper-case short word from an allowlist pattern (a hazard, a product, a severity), else null. */
const word = (v) => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : typeof v === 'number' && Number.isInteger(v) ? String(v) : null;
  return s && WORD.test(s) ? s : null;
};
const LOCATION = /^[A-Z0-9]{4,12}$/;
const location = (v) => (typeof v === 'string' && LOCATION.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null);

/** A number, or a string of a plain number (AWC sends some numbers as text). Null otherwise. */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d{1,6}(\.\d{1,8})?$/.test(v.trim())) return Number(v.trim());
  return null;
}

const two = (n) => String(n).padStart(2, '0');
/** A time as the relay's plain UTC form, "2026-10-08T14:00:00", from epoch seconds, epoch ms or an ISO string; null when it is not a believable time. */
export function isoTime(v) {
  let ms = null;
  const n = num(v);
  if (n !== null) ms = n < 1e11 ? n * 1000 : n; // seconds or milliseconds
  else if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v.trim());
    if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  }
  if (ms === null || !Number.isFinite(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.UTC(2100, 0, 1)) return null;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

/**
 * A list of { lat, lon } points (AWC's `coords`) as checked [lat, lon] number pairs rounded to 4 decimals (about 10 m); null if any point is bad or
 * there are fewer than `min`. Bare pairs are refused rather than guessed at (their order, lat-lon or lon-lat, cannot be told).
 */
export function points(list, min = 3) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const p of list.slice(0, 5000)) {
    if (!isObject(p)) return null;
    const lat = num(p.lat);
    const lon = num(p.lon);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    out.push([Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4]);
  }
  if (out.length < min) return null;
  // A very long outline is thinned by taking every k-th point (the first and last kept): the 3D view needs no more.
  if (out.length > MAX_POINTS) {
    const k = Math.ceil(out.length / MAX_POINTS);
    return out.filter((_, i) => i % k === 0 || i === out.length - 1);
  }
  return out;
}

/**
 * An AWC altitude as feet above sea level, or null when not given. AWC gives feet (45000); a value from 1 to 600 is read as hundreds of feet (a
 * flight level written as "450"), an assumption not checked against a live reply.
 */
export function feetMsl(v) {
  const n = num(v);
  if (n === null || n < 0 || n > 100000) return null;
  return n > 0 && n <= 600 ? n * 100 : n;
}

// ---- SIGMETs (airsigmet) --------------------------------------------------------------------------------------------

/**
 * AWC's /airsigmet reply (a list) rebuilt: [{ kind: 'sigmet', location, start, end, text, area: [[lat, lon], ...], baseFt, topFt, hazard, severity }].
 * Only SIGMETs (convective and non-convective) are kept; AIRMETs come from the G-AIRMETs, so none is listed twice, and outlooks are left out.
 * A SIGMET with no readable area is still kept for its text (the page lists it as "position not read"). Returns null for a reply that is not a list.
 */
export function trimAwcSigmets(upstream) {
  if (!Array.isArray(upstream)) return null;
  const out = [];
  for (const s of upstream.slice(0, 2000)) {
    if (!isObject(s)) continue;
    const type = word(s.airSigmetType);
    if (type !== 'SIGMET') continue;
    const text = cleanText(s.rawAirSigmet);
    if (!text) continue;
    const lows = [s.altitudeLow1, s.altitudeLow2].map(feetMsl).filter((x) => x !== null);
    const highs = [s.altitudeHi1, s.altitudeHi2].map(feetMsl).filter((x) => x !== null);
    const baseFt = lows.length ? Math.min(...lows) : null;
    const topFt = highs.length ? Math.max(...highs) : null;
    out.push({
      kind: 'sigmet',
      location: location(s.icaoId),
      start: isoTime(s.validTimeFrom),
      end: isoTime(s.validTimeTo),
      text,
      area: points(s.coords),
      baseFt,
      topFt: topFt !== null && baseFt !== null && topFt <= baseFt ? null : topFt,
      hazard: word(s.hazard),
      severity: word(s.severity),
    });
    if (out.length >= MAX_US_ALERTS) break;
  }
  return out;
}

// ---- G-AIRMETs (gairmet) --------------------------------------------------------------------------------------------

/** A G-AIRMET level ("FL240", "240", "SFC", or "FZL" with its own fzl height) as feet above sea level; null when not given. */
function gairmetLevel(v, fzl) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : typeof v === 'number' ? String(v) : '';
  if (s === 'SFC') return 0;
  if (s === 'FZL') return feetMsl(fzl);
  const m = /^(?:FL)?\s?(\d{3})$/.exec(s);
  return m ? Number(m[1]) * 100 : null;
}

const GAIRMET_HAZARD_WORDS = Object.freeze({ 'TURB-HI': 'MOD TURB', 'TURB-LO': 'MOD TURB', ICE: 'MOD ICE', LLWS: 'LLWS', SFC_WND: 'SFC WND 30KT', SFC_WIND: 'SFC WND 30KT', IFR: 'IFR', MT_OBSC: 'MT OBSC' });

/**
 * AWC's /gairmet reply rebuilt as AIRMETs: one snapshot only, the one whose valid time is nearest `now` (G-AIRMETs come as snapshots 3 hours apart),
 * areas only (the freezing-level lines are left out). Each: { kind: 'airmet', location: 'KKCI', start, end (90 minutes either side of the snapshot, an
 * estimate for "in force"), text (built here from the allowlisted fields, as AWC sends no text), area, baseFt, topFt, hazard, severity }.
 * Returns null for a reply that is not a list.
 */
export function trimAwcGairmets(upstream, now = Date.now()) {
  if (!Array.isArray(upstream)) return null;
  const items = [];
  for (const g of upstream.slice(0, 5000)) {
    if (!isObject(g)) continue;
    const geometry = word(g.geometryType);
    const hazard = word(g.hazard);
    if (geometry !== 'AREA' || !hazard || /FZLVL/.test(hazard)) continue;
    const valid = isoTime(g.validTime);
    const area = points(g.coords);
    if (!valid || !area) continue;
    items.push({ g, hazard, valid, area, at: Date.parse(`${valid}Z`) });
  }
  if (!items.length) return [];
  const snapshot = items.reduce((best, x) => (Math.abs(x.at - now) < Math.abs(best - now) ? x.at : best), items[0].at);
  const out = [];
  for (const { g, hazard, valid, area, at } of items) {
    if (at !== snapshot) continue;
    const product = word(g.product);
    const severity = word(g.severity);
    const baseFt = gairmetLevel(g.base, g.fzlBase ?? g.fzlbase);
    const topFt = gairmetLevel(g.top, g.fzlTop ?? g.fzltop);
    const dueTo = cleanText(g.dueTo ?? g.due_to, 200);
    const said = GAIRMET_HAZARD_WORDS[hazard] ?? hazard.replace(/[_-]/g, ' ');
    const levels = baseFt !== null || topFt !== null ? ` ${baseFt === 0 ? 'SFC' : baseFt !== null ? `FL${String(baseFt / 100).padStart(3, '0')}` : '...'}/${topFt !== null ? `FL${String(topFt / 100).padStart(3, '0')}` : '...'}` : '';
    out.push({
      kind: 'airmet',
      location: 'KKCI',
      start: isoTime(at - 90 * 60_000),
      end: isoTime(at + 90 * 60_000),
      text: `G-AIRMET ${product ?? ''} ${word(g.tag) ?? ''} ${said}${levels} VALID ${valid.slice(8, 10)}${valid.slice(11, 13)}${valid.slice(14, 16)}Z${dueTo ? ` DUE TO ${dueTo}` : ''}`.replace(/\s+/g, ' ').trim(),
      area,
      baseFt,
      topFt: topFt !== null && baseFt !== null && topFt <= baseFt ? null : topFt,
      hazard,
      severity,
    });
    if (out.length >= MAX_US_ALERTS) break;
  }
  return out;
}

// ---- PIREPs (pirep) -------------------------------------------------------------------------------------------------

/**
 * AWC's /pirep reply rebuilt: [{ kind: 'pirep', location, start (the report's time), end: null, text (the report as sent), point: [lat, lon],
 * levelFt }]. `levelFt` is AWC's flight level (hundreds of feet, as a PIREP's /FL is written) times 100, or null. Returns null for a reply that is
 * not a list.
 */
export function trimAwcPireps(upstream) {
  if (!Array.isArray(upstream)) return null;
  const out = [];
  for (const p of upstream.slice(0, 2000)) {
    if (!isObject(p)) continue;
    const text = cleanText(p.rawOb, 1000);
    if (!text) continue;
    const at = points([{ lat: p.lat, lon: p.lon }], 1);
    const fl = num(p.fltLvl ?? p.fltlvl);
    out.push({
      kind: 'pirep',
      location: location(p.icaoId),
      start: isoTime(p.obsTime),
      end: null,
      text,
      point: at ? at[0] : null,
      levelFt: fl !== null && fl > 0 && fl <= 600 ? fl * 100 : null,
    });
    if (out.length >= MAX_US_ALERTS) break;
  }
  return out;
}

/** The AWC addresses for a set of K sites: one airsigmet, two gairmet (forecast hours 0 and 3) and one pirep per site. Only checked ICAO ids go into them. */
export function awcUrls(sites) {
  return {
    sigmets: `${AWC_BASE}/airsigmet?format=json`,
    // AWC answers one snapshot per ask (with no `fore` it gave the next one, 06Z at 0443Z on 8 Oct 2026), so the current package's first two are asked
    // and the one nearest now is kept.
    gairmets: [`${AWC_BASE}/gairmet?format=json&fore=0`, `${AWC_BASE}/gairmet?format=json&fore=3`],
    pireps: sites.map((s) => `${AWC_BASE}/pirep?id=${s}&distance=${PIREP_DISTANCE}&format=json`),
  };
}

/** JSON text, where an empty reply (AWC answers 204 with nothing when it has nothing) is an empty list. Throws on anything else that is not JSON. */
export const jsonOrEmpty = (text) => (typeof text === 'string' && text.trim() === '' ? [] : JSON.parse(text));

/**
 * Asks AWC for everything for the K sites (`get(url)` returns the reply text, throws on failure) and returns the merged, rebuilt list, or null
 * when any part's reply is the wrong shape. A failure in any part fails the whole (the page then says "unavailable" for those fields, never "none").
 * The same PIREP near two sites is kept once.
 */
export async function askAwc(get, sites, now = Date.now()) {
  const urls = awcUrls(sites);
  const [sig, gair0, gair3, ...pir] = await Promise.all([get(urls.sigmets), ...urls.gairmets.map((u) => get(u)), ...urls.pireps.map((u) => get(u))]);
  const sigmets = trimAwcSigmets(jsonOrEmpty(sig));
  const g0 = jsonOrEmpty(gair0);
  const g3 = jsonOrEmpty(gair3);
  const airmets = Array.isArray(g0) && Array.isArray(g3) ? trimAwcGairmets([...g0, ...g3], now) : null;
  if (!sigmets || !airmets) return null;
  const pireps = [];
  const seen = new Set();
  for (const text of pir) {
    const part = trimAwcPireps(jsonOrEmpty(text));
    if (!part) return null;
    for (const p of part) {
      if (seen.has(p.text)) continue;
      seen.add(p.text);
      pireps.push(p);
    }
  }
  return [...sigmets, ...pireps, ...airmets].slice(0, MAX_US_ALERTS);
}

// ---- NOTAMs (FAA NOTAM API) -----------------------------------------------------------------------------------------

// One or two letters (the FAA's own example number is "CK0000/01"), the number and the year.
const ICAO_NOTAM_ID = /^[A-Z]{1,2}\d{4}\/\d{2}$/;
const DOMESTIC_ID = /^\d{1,2}\/\d{1,4}$/;

/** The NOTAM's number: the ICAO form ("A1234/26") from its ICAO text or its series, number and year; else the FAA domestic form ("10/123"); else null. */
function notamId(n, icaoText) {
  const fromText = /^\s*([A-Z]{1,2}\d{4}\/\d{2})\b/.exec(icaoText ?? '')?.[1];
  if (fromText) return fromText;
  const number = typeof n.number === 'string' ? n.number.trim() : typeof n.number === 'number' ? String(n.number) : '';
  const series = typeof n.series === 'string' ? n.series.trim().toUpperCase() : '';
  const year = /^(\d{4})-/.exec(typeof n.issued === 'string' ? n.issued : '')?.[1]?.slice(2);
  if (/^[A-Z]{1,2}$/.test(series) && /^\d{1,4}$/.test(number) && year) {
    const id = `${series}${number.padStart(4, '0')}/${year}`;
    if (ICAO_NOTAM_ID.test(id)) return id;
  }
  if (ICAO_NOTAM_ID.test(number)) return number;
  return DOMESTIC_ID.test(number) ? number : null;
}

/**
 * What was checked (8 Oct 2026): the address answers 401 "Unauthorized" without a key (reachable); its query names (icaoLocation, responseFormat=geoJson,
 * pageSize) and the client_id / client_secret headers agree with an independent open-source client (the `aviation-mcp` package on npm). NOT checked:
 * the reply's field names (items[].properties.coreNOTAMData.notam / .notamTranslation), because the FAA's documentation site (api.faa.gov) was refused by
 * this session's network and no reply can be had without a key. Check the first keyed reply against this reader.
 *
 * The FAA NOTAM API's GeoJSON reply for one site rebuilt into the relay's shape: [{ id, location, start, end, raw }], `raw` being the ICAO-format text
 * when the FAA gives it (so the page's closed-runway reading works on its "E)" line) and the plain text otherwise; `end` null for a permanent one.
 * Only NOTAMs for the asked site are kept. Returns null when the reply is not the expected shape.
 */
export function trimFaaNotams(upstream, site) {
  if (!isObject(upstream) || !Array.isArray(upstream.items)) return null;
  const out = [];
  for (const item of upstream.items.slice(0, 2000)) {
    const core = item?.properties?.coreNOTAMData;
    const n = core?.notam;
    if (!isObject(n)) continue;
    const where = location(n.icaoLocation) ?? location(n.location);
    if (where !== site) continue;
    const translations = Array.isArray(core.notamTranslation) ? core.notamTranslation : [];
    const icao = translations.find((t) => isObject(t) && t.type === 'ICAO');
    const icaoText = cleanText(icao?.formattedText);
    const raw = icaoText || cleanText(n.text);
    if (!raw) continue;
    const endWord = typeof n.effectiveEnd === 'string' ? n.effectiveEnd.trim().toUpperCase() : '';
    out.push({
      id: notamId(n, icaoText),
      location: site,
      start: isoTime(n.effectiveStart),
      end: endWord.startsWith('PERM') ? null : isoTime(n.effectiveEnd),
      raw,
    });
    if (out.length >= MAX_US_NOTAMS) break;
  }
  return out;
}

/** The FAA key from the relay's environment, or null when either half is missing. The values are only ever put in the FAA request's headers. */
export function faaKey(env) {
  const id = typeof env?.FAA_CLIENT_ID === 'string' ? env.FAA_CLIENT_ID.trim() : '';
  const secret = typeof env?.FAA_CLIENT_SECRET === 'string' ? env.FAA_CLIENT_SECRET.trim() : '';
  return id && secret ? { id, secret } : null;
}

/** The FAA address for one checked ICAO id: its NOTAMs as GeoJSON, up to 1,000 on one page (the API's largest page). */
export const faaNotamUrl = (site) => `${FAA_NOTAM_UPSTREAM}?icaoLocation=${site}&responseFormat=geoJson&pageSize=1000`;

/**
 * Asks the FAA for each K site's NOTAMs (`get(url, headers)` returns the reply text, throws on failure) and returns them merged, or null when any reply
 * is the wrong shape. `key` is faaKey(env).
 */
export async function askFaa(get, sites, key) {
  const headers = { client_id: key.id, client_secret: key.secret, accept: 'application/json' };
  const replies = await Promise.all(sites.map((s) => get(faaNotamUrl(s), headers)));
  const out = [];
  for (const [i, text] of replies.entries()) {
    const part = trimFaaNotams(JSON.parse(text), sites[i]);
    if (!part) return null;
    out.push(...part);
  }
  return out;
}
