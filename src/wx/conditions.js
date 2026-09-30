// The parts METARs and TAF groups share: wind, visibility, weather and cloud.
// Tokens are read one at a time, so a TAF period such as "2916/2920" can never be
// mistaken for visibility (audit issue #1).

// Swap for core/units.js once the flight-math core has merged (SPEC-wx assumption 4).
export const METRES_PER_SM = 1609.344;
// "9999" and CAVOK both mean 10 km or more.
const TEN_KM = { sm: 10000 / METRES_PER_SM, qualifier: 'more', metres: 9999 };

const WIND = /^(\d{3}|VRB|\/{3})(\d{2,3}|\/\/)(?:G(\d{2,3}))?(KT|MPS)$/;
const WIND_VARIATION = /^(\d{3})V(\d{3})$/;
const VIS_SM = /^([MP])?(?:(\d+)\/(\d+)|(\d+(?:\.\d+)?))SM$/;
const VIS_WHOLE = /^\d{1,2}$/;
const VIS_METRES = /^(\d{4})(?:NDV|N|NE|E|SE|S|SW|W|NW)?$/;
const RVR = /^R\d{2}[LCR]?\//;
const SKY = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/;
const SKY_CLEAR = /^(SKC|CLR|NSC|NCD)$/;
const WEATHER = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;
const TEMPERATURE = /^(M?\d{2})\/(M?\d{2})?$/;
const ALTIMETER = /^([AQ])(\d{4})$/;
const IGNORED = [/^RE[A-Z]{2,}$/, /^WS/, /^T[XN]M?\d{2}\/\d{4}Z$/, /^\/+$/];

/** Upper-case tokens and the remarks, split at RMK, with any trailing "=" dropped. */
export function tokenize(raw) {
  const text = String(raw ?? '').toUpperCase().replace(/=\s*$/, '').replace(/\s+/g, ' ').trim();
  const at = text.search(/(^|\s)RMK(\s|$)/);
  const body = at < 0 ? text : text.slice(0, at);
  const remarks = at < 0 ? '' : text.slice(at).trim().replace(/^RMK\s*/, '');
  return { tokens: body.split(' ').filter(Boolean), remarks };
}

/** Conditions with nothing stated. */
export function emptyConditions() {
  return { wind: null, visibility: null, cavok: false, weather: [], nsw: false, sky: [], skyClear: false };
}

/**
 * A statute-mile fraction. A fraction of a mile is always below one, so "11/2" is
 * "1 1/2" with the space dropped, and "13/4" is "1 3/4".
 */
function fraction(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (n < d || numerator.length < 2) return n / d;
  return Number(numerator.slice(0, -1)) + Number(numerator.slice(-1)) / d;
}

function signedTemp(s) {
  return s.startsWith('M') ? -Number(s.slice(1)) : Number(s);
}

/**
 * Read condition tokens (already split, upper case, without the report header).
 * Returns the conditions plus temperature and altimeter when present, and any
 * tokens it could not read.
 */
export function readConditions(tokens) {
  const c = emptyConditions();
  const out = { conditions: c, temperatureC: null, dewpointC: null, altimeter: null, unread: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if (!c.wind && (m = t.match(WIND))) {
      const toKt = m[4] === 'MPS' ? 1.943844 : 1;
      c.wind = {
        dirDeg: /^\d{3}$/.test(m[1]) ? Number(m[1]) : null,
        variable: m[1] === 'VRB',
        speedKt: m[2] === '//' ? null : Math.round(Number(m[2]) * toKt),
        gustKt: m[3] ? Math.round(Number(m[3]) * toKt) : null,
        raw: t,
      };
    } else if (c.wind && (m = t.match(WIND_VARIATION))) {
      c.wind.varyingDeg = [Number(m[1]), Number(m[2])];
    } else if (!c.visibility && VIS_WHOLE.test(t) && tokens[i + 1] && /^\d+\/\d+SM$/.test(tokens[i + 1])) {
      const [n, d] = tokens[i + 1].slice(0, -2).split('/').map(Number);
      c.visibility = { sm: Number(t) + n / d, qualifier: null, metres: null, raw: `${t} ${tokens[i + 1]}` };
      i++;
    } else if (!c.visibility && (m = t.match(VIS_SM))) {
      const sm = m[2] ? fraction(m[2], m[3]) : Number(m[4]);
      c.visibility = { sm, qualifier: m[1] === 'M' ? 'less' : m[1] === 'P' ? 'more' : null, metres: null, raw: t };
    } else if (!c.visibility && (m = t.match(VIS_METRES)) && !/SM$/.test(tokens[i + 1] || '')) {
      // A four-digit number right before an SM visibility is not metric visibility.
      const metres = Number(m[1]);
      c.visibility = metres === 9999 ? { ...TEN_KM, raw: t } : { sm: metres / METRES_PER_SM, qualifier: null, metres, raw: t };
    } else if (t === 'CAVOK') {
      c.cavok = true;
      c.visibility = { ...TEN_KM, raw: t };
      c.sky = [];
      c.skyClear = true;
      c.weather = [];
      c.nsw = true;
    } else if (RVR.test(t)) {
      // Runway visual range: not used by any check.
    } else if ((m = t.match(SKY))) {
      c.sky.push({
        cover: m[1],
        baseFt: m[2] === '///' ? null : Number(m[2]) * 100,
        type: m[3] === 'CB' || m[3] === 'TCU' ? m[3] : null,
        raw: t,
      });
    } else if (SKY_CLEAR.test(t)) {
      c.skyClear = true;
    } else if (t === 'NSW') {
      c.nsw = true;
    } else if ((m = t.match(WEATHER)) && (m[2] || m[3])) {
      c.weather.push({
        intensity: m[1] || '',
        descriptor: m[2] || null,
        phenomena: m[3] ? m[3].match(/../g) : [],
        raw: t,
      });
    } else if ((m = t.match(TEMPERATURE))) {
      out.temperatureC = signedTemp(m[1]);
      out.dewpointC = m[2] ? signedTemp(m[2]) : null;
    } else if ((m = t.match(ALTIMETER))) {
      out.altimeter = m[1] === 'A' ? { inHg: Number(m[2]) / 100 } : { hPa: Number(m[2]) };
    } else if (!IGNORED.some((re) => re.test(t))) {
      out.unread.push(t);
    }
  }
  return out;
}

const isCeilingLayer = (l) => l.cover === 'BKN' || l.cover === 'OVC' || l.cover === 'VV';

/** Lowest BKN, OVC or VV layer with a known base, in feet; null when there is no ceiling. */
export function ceilingFt(conditions) {
  const bases = (conditions?.sky || [])
    .filter((l) => isCeilingLayer(l) && l.baseFt != null)
    .map((l) => l.baseFt);
  return bases.length ? Math.min(...bases) : null;
}

/**
 * True when the ceiling can't be known: a BKN, OVC or VV layer with an unknown
 * base ("///"), or no cloud group at all without SKC/CLR/NSC/NCD/CAVOK.
 */
export function ceilingUnknown(conditions) {
  const sky = conditions?.sky ?? [];
  if (!sky.length) return !conditions?.skyClear;
  return sky.some((l) => isCeilingLayer(l) && l.baseFt == null);
}

/**
 * Apply a change group to the conditions it changes. A BECMG, TEMPO or PROB group
 * changes only what it states; everything else carries over. SKC/NSC/CAVOK clear
 * inherited cloud and NSW clears inherited weather.
 */
export function mergeConditions(base, change) {
  const b = base || emptyConditions();
  const statesWeather = change.weather.length > 0 || change.nsw;
  const statesSky = change.sky.length > 0 || change.skyClear;
  const statesAnyCavokPart = Boolean(change.visibility) || statesWeather || statesSky;
  return {
    wind: change.wind || b.wind,
    visibility: change.visibility || b.visibility,
    cavok: change.cavok || (!statesAnyCavokPart && b.cavok),
    weather: statesWeather ? change.weather : b.weather,
    nsw: statesWeather ? change.nsw : b.nsw,
    sky: statesSky ? change.sky : b.sky,
    skyClear: statesSky ? change.skyClear : b.skyClear,
  };
}

const FRACTIONS = [
  [1 / 16, '1/16'], [1 / 8, '1/8'], [3 / 16, '3/16'], [1 / 4, '1/4'], [5 / 16, '5/16'], [3 / 8, '3/8'],
  [1 / 2, '1/2'], [5 / 8, '5/8'], [3 / 4, '3/4'], [7 / 8, '7/8'],
];

/** Visibility as the SOF shows it: "<1/4 SM", "1 1/2 SM", ">6 SM", "800 m", "10 km or more". */
export function formatVisibility(vis) {
  if (!vis) return 'VIS ?';
  if (vis.metres != null) return vis.metres >= 9999 ? '10 km or more' : `${vis.metres} m`;
  const prefix = vis.qualifier === 'less' ? '<' : vis.qualifier === 'more' ? '>' : '';
  const whole = Math.floor(vis.sm + 1e-9);
  const rest = vis.sm - whole;
  let text;
  if (rest < 1e-9) text = String(whole);
  else {
    const f = FRACTIONS.find(([v]) => Math.abs(v - rest) < 1e-6);
    text = f ? (whole ? `${whole} ${f[1]}` : f[1]) : vis.sm.toFixed(1);
  }
  return `${prefix}${text} SM`;
}
