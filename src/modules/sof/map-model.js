// What the SOF map shows, decided without a page (SPEC-sof, "Map"): the airfield dots with
// their category in words and their wind barb, the credits line, and the status strip's
// words. Pure: the screen's cards, the weather snapshot and the feeds' lines go in; plain
// data comes out. map-draw.js only paints it.

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
 * `layers` is the layers state; `radarBackup` and `trafficOn` say what is in use.
 */
export function mapCredits(layers, { radarBackup = false, trafficOn = false } = {}) {
  const parts = ['Map: Esri, Maxar, Earthstar Geographics, and the GIS User Community imagery'];
  if (layers?.base === 'vnc' || layers?.base === 'vnc-satellite') parts.push('VNC charts © NAV CANADA (not for navigation)');
  parts.push('radar, lightning, cloud and warnings: ECCC (Open Government Licence)');
  if (radarBackup) parts.push('backup radar: RainViewer');
  if (trafficOn) parts.push('traffic: adsb.lol (ODbL)');
  return `${parts.join('. ')}.`;
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
  const near = result.state === 'near';
  const clear = result.state === 'clear';
  if (clear && mapLine?.stale === true) return { id: 'nearhome', text: `${result.words} (the lightning map is STALE)`, symbol: '?', tone: 'busy' };
  return { id: 'nearhome', text: result.words, symbol: near ? '⚠' : clear ? '✓' : '?', tone: near ? 'bad' : clear ? 'ok' : 'busy' };
}

/**
 * The strip's items, in a fixed order, only for what is switched on: { id, text, symbol, tone }.
 * `lines` maps a feed id to its feedLine, or, for traffic, { text } (its own statusText).
 */
export function statusItems(lines, on) {
  return ORDER.filter((id) => on[id] && lines[id]).map((id) => ({ id, text: lines[id].text, symbol: lines[id].symbol ?? '', tone: lines[id].tone ?? 'ok' }));
}
