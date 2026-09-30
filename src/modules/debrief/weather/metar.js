// The METAR line on the replay (SPEC-debrief: Weather at the time of the
// flight): where past reports come from, how the archive's reply is read, and
// the one line the screen shows. Decoding is src/wx's parseMetar; nothing new
// is parsed here. Plain values in and out, so it's tested in Node.
import { parseMetar } from '../../../wx/metar.js';
import { formatVisibility } from '../../../wx/conditions.js';
import { flightCategory } from '../../../wx/limits.js';
import { MAX_AGE_S, sliceAt, ageText } from './slices.js';

/** The Iowa Environmental Mesonet archive: METARs and SPECIs for one station, any past window. */
export const IEM_ASOS_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py';
/** More than a day of reports at one a minute; a reply bigger than this isn't read. */
export const MAX_REPLY_CHARS = 2_000_000;

const ICAO = /^[A-Z][A-Z0-9]{3}$/;
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

/**
 * The archive address for one airfield's reports covering the flight, from
 * two hours before its start (so the report in force at take-off is there)
 * to its end. Built only from a checked ICAO code and numbers.
 */
export function metarArchiveUrl(icao, startT, endT) {
  if (!ICAO.test(icao) || !Number.isFinite(startT) || !Number.isFinite(endT)) throw new TypeError('metarArchiveUrl: an ICAO code and two times');
  const q = new URLSearchParams({
    station: icao,
    data: 'metar',
    sts: iso(Math.floor(startT - MAX_AGE_S.metar)),
    ets: iso(Math.ceil(endT + 60)),
    tz: 'Etc/UTC',
    format: 'onlycomma',
    latlon: 'no',
    elev: 'no',
    missing: 'M',
    trace: 'T',
    direct: 'no',
  });
  q.append('report_type', '3'); // routine
  q.append('report_type', '4'); // specials
  return `${IEM_ASOS_URL}?${q}`;
}

/**
 * The archive's reply ("station,valid,metar" lines, valid as
 * "2026-09-30 14:00" UTC) as reports in time order: { t, type, raw, report }.
 * Lines it can't read are skipped. A reply over MAX_REPLY_CHARS reads as none.
 */
export function readArchive(text) {
  if (typeof text !== 'string' || text.length > MAX_REPLY_CHARS) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9]{3,4}),(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}),(.+)$/);
    if (!m) continue;
    const t = Date.parse(`${m[2]}T${m[3]}:00Z`) / 1000;
    const raw = m[4].trim();
    if (!Number.isFinite(t) || !raw || raw === 'M') continue;
    // The observation's own day resolves against its archive time.
    const report = parseMetar(raw, { now: new Date((t + 3600) * 1000) });
    out.push({ t, type: report.type === 'SPECI' || /^SPECI\b/.test(raw) ? 'SPECI' : 'METAR', raw, report });
  }
  out.sort((a, b) => a.t - b.t);
  // The archive can list one report twice (a correction); keep the later line.
  return out.filter((r, i) => i === out.length - 1 || out[i + 1].t !== r.t);
}

const pad = (n) => String(n).padStart(2, '0');
function windText(w) {
  if (!w) return null;
  if (w.speedKt === 0) return 'wind calm';
  const dir = w.variable ? 'VRB' : w.dirDeg === null ? '///' : String(w.dirDeg).padStart(3, '0');
  const speed = w.speedKt ?? '//';
  return `wind ${dir}/${speed}${w.gustKt ? ` gusting ${w.gustKt}` : ''} kt`;
}
function skyText(c) {
  if (!c) return null;
  if (c.cavok) return 'CAVOK';
  if (c.sky.length) return c.sky.map((l) => `${l.cover}${l.baseFt === null ? '///' : String(l.baseFt / 100).padStart(3, '0')}${l.type ?? ''}`).join(' ');
  return c.skyClear ? 'sky clear' : null;
}
const temp = (n) => (n < 0 ? `M${pad(-n)}` : pad(n));

/**
 * What the METAR line says at time t for one airfield's reports: the report
 * in force (the last at or before t, up to two hours old), decoded, with its
 * age. { text, raw, category, stale } or, with no report, { text, raw: '' }.
 */
export function metarLineAt(reports, t, icao) {
  const slice = sliceAt(reports, t, MAX_AGE_S.metar);
  if (!slice) return { text: `${icao}: no report in the two hours before this moment.`, raw: '', category: null };
  const { item, ageS } = slice;
  const r = item.report;
  const d = new Date(item.t * 1000);
  const c = r.conditions;
  const category = c ? flightCategory(c) : null;
  const parts = [
    `${item.type === 'SPECI' ? 'SPECI ' : ''}${icao} ${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z (${ageText(ageS)})`,
    category && category !== 'UNK' ? category : null,
    windText(c?.wind),
    c?.visibility ? `vis ${formatVisibility(c.visibility)}` : null,
    c?.weather.length ? c.weather.map((w) => w.raw).join(' ') : null,
    skyText(c),
    Number.isFinite(r.temperatureC) ? `${temp(r.temperatureC)}/${Number.isFinite(r.dewpointC) ? temp(r.dewpointC) : '//'}` : null,
    r.altimeter?.inHg ? `A${(r.altimeter.inHg * 100).toFixed(0)}` : r.altimeter?.hPa ? `Q${r.altimeter.hPa}` : null,
  ].filter(Boolean);
  return { text: parts.join(' · '), raw: item.raw, category };
}
