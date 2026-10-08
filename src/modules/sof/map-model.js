// What the SOF map shows, decided without a page (SPEC-sof, "Map"): the airfield dots with
// their category in words and their wind barb, the credits line, and the status strip's
// words. Pure: the screen's cards, the weather snapshot and the feeds' lines go in; plain
// data comes out. map-draw.js only paints it.
import { noSourceWords } from './sites/words.js';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- Wind barbs ------------------------------------------------------------------------------

/**
 * The parts of a wind barb for a speed in knots: speeds go to the nearest 5 kt, each pennant is 50,
 * each full barb 10 and a half barb 5. Under 3 kt it is calm (a ring, no staff); no number gives
 * no barb. Returns { calm, pennants, full, half, rounded } or null.
 */
export function windBarb(speedKt) {
  if (!isNumber(speedKt) || speedKt < 0) return null;
  if (speedKt < 3) return { calm: true, pennants: 0, full: 0, half: 0, rounded: 0 };
  const rounded = Math.max(5, Math.round(speedKt / 5) * 5);
  const pennants = Math.floor(rounded / 50);
  const rest = rounded - pennants * 50;
  const full = Math.floor(rest / 10);
  const half = rest - full * 10 >= 5 ? 1 : 0;
  return { calm: false, pennants, full, half, rounded };
}

/** A wind in words: "250° 18 kt gusting 25", "variable 5 kt", "calm", or null when there is none. */
export function windWords(wind) {
  if (!wind || !isNumber(wind.speedKt)) return null;
  if (wind.speedKt < 1) return 'calm';
  const gust = isNumber(wind.gustKt) ? ` gusting ${wind.gustKt}` : '';
  const dir = wind.variable ? 'variable' : isNumber(wind.dirDeg) ? `${String(wind.dirDeg).padStart(3, '0')}°` : null;
  return dir ? `${dir} ${wind.speedKt} kt${gust}` : null;
}

// ---- The airfield dots -------------------------------------------------------------------------

/**
 * The dots to draw, home first, one per card that has a position. `cards` are screen.cards
 * (category, metar.state); `fields` are the airfields (home, then alternates) with { icao, name, lat, lon };
 * `snapshot` is the weather snapshot, for the wind. A report that is stale, closed or missing is drawn hollow
 * with no barb (an old wind is never drawn as the wind now).
 * Each: { icao, name, home, lat, lon, category, old, wind, label, facts }.
 */
export function airfieldMarks({ cards = [], fields = [], snapshot = {} } = /** @type {any} */ ({})) {
  const byIcao = new Map(fields.map((f) => [f.icao, f]));
  const marks = [];
  for (const card of cards) {
    const field = byIcao.get(card.icao);
    if (!field || !isNumber(field.lat) || !isNumber(field.lon)) continue;
    const state = card.metar?.state;
    const fresh = state === 'fresh';
    const old = state === 'stale' || state === 'closed';
    const category = card.category ?? null;
    const w = snapshot.metar?.[card.icao]?.report?.conditions?.wind ?? null;
    const wind = fresh && w ? { dirDeg: isNumber(w.dirDeg) ? w.dirDeg : null, variable: w.variable === true, speedKt: isNumber(w.speedKt) ? w.speedKt : null, gustKt: isNumber(w.gustKt) ? w.gustKt : null } : null;
    const word = fresh || old ? (category ?? 'no category') : 'no METAR';
    marks.push({
      icao: card.icao,
      name: field.name ?? card.name ?? '',
      home: card.role === 'HOME',
      lat: field.lat,
      lon: field.lon,
      category: fresh || old ? category : null,
      old,
      wind,
      // The category is in the label, so a dot is never only a colour.
      label: `${card.icao} ${old ? `${word}, old` : word}`,
      facts: [
        `${card.icao}${field.name ? ` ${field.name}` : ''}, ${card.role === 'HOME' ? 'home' : 'alternate'}.`,
        fresh || old ? `Flight category ${category ?? 'unknown'}${old ? ' (report is old)' : ''}.` : 'No current METAR.',
        wind && windWords(wind) ? `Wind ${windWords(wind)}.` : null,
      ].filter(Boolean).join(' '),
    });
  }
  return marks;
}

// ---- Credits ------------------------------------------------------------------------------------------

/**
 * The map's credits line: the base map in use, ECCC for radar and lightning, and what else is showing
 * (RainViewer while it is the radar, adsb.lol's data while traffic is on). VNC carries "not for navigation".
 * `layers` is the layers state; `radarBackup` and `trafficOn` say what is in use. `feedsCredit` is the site profile's words for its radar, lightning,
 * cloud and warnings sources (profile `credits.mapFeeds`); null or left out when the base has none, then none are credited.
 */
export function mapCredits(layers, { radarBackup = false, trafficOn = false, feedsCredit = null } = {}) {
  const parts = ['Map: Esri, Maxar, Earthstar Geographics, and the GIS User Community imagery'];
  if (layers?.base === 'vnc' || layers?.base === 'vnc-satellite') parts.push('VNC charts © NAV CANADA (not for navigation)');
  if (feedsCredit) parts.push(feedsCredit);
  if (radarBackup) parts.push('backup radar: RainViewer');
  if (trafficOn) parts.push('traffic: adsb.lol (ODbL)');
  return `${parts.join('. ')}.`;
}

// ---- The map key ------------------------------------------------------------------------------------------

/**
 * ECCC's own radar scales (GetLegendGraphic for RADAR_1KM_RRAI and RADAR_1KM_RSNO, read 2026-09-30): the same 14 colour steps,
 * light blue to deep purple, in mm/h of rain or cm/h of snow. `ticks` are a few of the labelled steps with their place on the bar (percent
 * from the light end; the steps are evenly spaced, the numbers are not), and `colours` are the bar's stops. Fixed text, not read from ECCC.
 */
export const RADAR_SCALES = Object.freeze({
  rain: Object.freeze({ noun: 'rain', unit: 'mm/h', ticks: Object.freeze([['0.1', 0], ['4', 23], ['16', 46], ['50', 69], ['200', 100]]) }),
  snow: Object.freeze({ noun: 'snow', unit: 'cm/h', ticks: Object.freeze([['0.1', 0], ['0.5', 23], ['1.5', 46], ['4', 69], ['20', 100]]) }),
});
/** The bar's colours from light to heavy: light blue, cyan, green, dark green, yellow, orange, red, magenta, purple, deep purple. */
export const RADAR_COLOURS = Object.freeze(['#4fa8ff', '#19e6d0', '#00e000', '#007a00', '#ffff00', '#ff9900', '#ff0000', '#ff00b0', '#7a1fa2', '#3a0a5a']);

/**
 * NOAA NCEP's MRMS reflectivity colours, read from its own GetLegendGraphic for conus_bref_qcd on 8 Oct 2026 (5 px a dBZ, -25 to 70 dBZ sampled every
 * 5 dBZ): tan and grey below 0, blues to 15, greens 20 to 35, yellow and orange 40 to 45, reds 50 to 55, pink to purple 60 to 70. Fixed text, not read from NCEP.
 */
export const MRMS_SCALE = Object.freeze({
  noun: 'reflectivity',
  unit: 'dBZ',
  ticks: Object.freeze([['-20', 5], ['0', 26], ['20', 47], ['40', 68], ['70', 100]]),
  colours: Object.freeze(['#92896a', '#a4a26b', '#c2c39c', '#c1c5b4', '#a2a9b5', '#7c89af', '#536aa4', '#5186b7', '#58c2b9', '#30d65b', '#0daf12', '#0a730c', '#84a005', '#f5cb17', '#f5b217', '#d10809', '#aa0809', '#f1bafe', '#f175fe', '#8300e7']),
});

/**
 * The map key for what is showing (F5 of sof-recheck-207): { radar, lightning, rings, traffic }, each null when its layer is off.
 * `radarBackup`: RainViewer's tiles are the radar now, in their own colours. `radar` is { noun, unit, ticks, words } (and `colours` for a scale
 * that is not ECCC's); `lightning`, `rings` and `traffic` are the words. Plain words, never colour alone.
 * `radarScale`: 'dbz' for NOAA's MRMS reflectivity (the US bases' radar source's `scale`), else ECCC's rain or snow rate.
 * `lightningRing`: false when the base has no lightning source, so the rings' words do not speak of a lightning ring that is not drawn.
 */
export function legendItems(layers, { radarBackup = false, radarScale = null, lightningRing = true } = {}) {
  const on = layers?.on ?? {};
  const backupWords = radarBackup ? ' The backup radar (RainViewer) uses its own colours.' : '';
  let radar = null;
  if (on.radar && radarScale === 'dbz') {
    radar = { ...MRMS_SCALE, words: `Radar, NOAA MRMS reflectivity in dBZ, in NOAA's colours: blue is light, then green, yellow and orange, red, and pink to purple is the strongest. The rain and snow choice does not change it.${backupWords}` };
  } else if (on.radar) {
    const scale = RADAR_SCALES[layers?.precip === 'snow' ? 'snow' : 'rain'];
    radar = { ...scale, words: `Radar, ${scale.noun} rate in ${scale.unit}: pale blue is the lightest, then green, yellow, orange and red, and purple is the heaviest.${backupWords}` };
  }
  return {
    radar,
    lightning: on.lightning
      ? 'Lightning: a yellow mark with a dark outline is a 2.5 km square with lightning in the last 10 minutes. It shows where, not how strong.'
      : null,
    rings: on.rings
      ? `Dashed rings are 25 and 50 NM from home.${lightningRing ? ' A dotted amber ring is the lightning caution radius, when it is not one of those.' : ''}`
      : null,
    traffic: on.traffic
      ? 'Traffic: an arrow points along an aircraft\'s track (a dot when it gives none); a helicopter is a rotor ring round a small body with its tail boom aft (no tail when it gives no track). Hollow is on the ground, an amber ring is military. Its words say "Helicopter" when its type is one.'
      : null,
  };
}

// ---- The outside lightning map link -------------------------------------------------------------------

/** Blitzortung's live lightning map (lightningmaps.org), the only outside link of its kind; opened in a new tab, never fetched or framed. */
export const LIGHTNING_MAP_HOST = 'https://www.lightningmaps.org/';

/**
 * The link for a base with no lightning picture of its own (profile `lightningLink: 'blitzortung'`): { href, text, note }, centred on home
 * (latitude y, longitude x, zoom z in the address's # part; the format was not checked from here, so if the site ignores it the map opens at its own
 * start). Built from the fixed host and checked numbers only; null for anything else.
 */
export function lightningMapLink(kind, home) {
  if (kind !== 'blitzortung') return null;
  const lat = home?.lat;
  const lon = home?.lon;
  if (!isNumber(lat) || !isNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const at = (n) => String(Number(n.toFixed(4)));
  return Object.freeze({
    href: `${LIGHTNING_MAP_HOST}#y=${at(lat)};x=${at(lon)};z=8`,
    text: 'Lightning map (Blitzortung) ↗',
    note: 'outside site, not checked by this tool',
  });
}

/** What the VNC base says about its own edges, or null when it is not in use. */
export function baseNote(layers) {
  return layers?.base === 'vnc' || layers?.base === 'vnc-satellite'
    ? 'The VNC charts cover Moose Jaw, Regina, Saskatoon and Swift Current. Outside them the satellite picture shows.'
    : null;
}

// ---- The status strip ---------------------------------------------------------------------------------

const ORDER = ['radar', 'coverage', 'lightning', 'nearhome', 'cloud', 'warnings', 'traffic'];

/**
 * The near-home lightning line for the strip: { id: 'nearhome', text, symbol, tone }, from lightning.js's answer
 * (`state` 'near', 'clear', 'unknown' or 'off') and the lightning map's own line (`{ stale }`, or null when that layer is off).
 * STALE wins (L2): a clear answer next to a STALE lightning map loses its tick and says so, so the strip never reads "STALE"
 * and "No lightning within 20 NM ✓" side by side. A warning is never softened.
 */
export function nearHomeItem(result, mapLine = null) {
  // A base with no lightning source (the site profile's `null`): amber, a warning symbol and "can't tell", never a tick.
  if (result.noSource) return { id: 'nearhome', text: result.words, symbol: '⚠', tone: 'caution' };
  const near = result.state === 'near';
  const clear = result.state === 'clear';
  if (clear && mapLine?.stale === true) return { id: 'nearhome', text: `${result.words} (the lightning map is STALE)`, symbol: '?', tone: 'busy' };
  return { id: 'nearhome', text: result.words, symbol: near ? '⚠' : clear ? '✓' : '?', tone: near ? 'bad' : clear ? 'ok' : 'busy' };
}

/** The line for a feed the base's site profile has no source for: "Radar: no source for this base, can't tell" ⚠, amber, never a tick. */
export const noSourceLine = (label) => ({ text: noSourceWords(label), symbol: '⚠', tone: 'caution', stale: false });

/**
 * The strip's items, in a fixed order, only for what is switched on: { id, text, symbol, tone }.
 * `lines` maps a feed id to its feedLine, or, for traffic, { text } (its own statusText).
 */
export function statusItems(lines, on) {
  return ORDER.filter((id) => on[id] && lines[id]).map((id) => ({ id, text: lines[id].text, symbol: lines[id].symbol ?? '', tone: lines[id].tone ?? 'ok' }));
}

/** The radar coverage line at a base whose radar has no coverage layer (NOAA MRMS): neutral, neither a tick nor a failure. */
export const coverageNotShownLine = () => ({ text: 'Radar coverage: not shown for this source', symbol: '–', tone: 'off', stale: false });
