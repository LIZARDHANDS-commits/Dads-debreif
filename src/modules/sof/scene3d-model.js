// What the SOF's 3D view shows, decided without a page (SPEC-sof, "3D view", SOF-39): the cloud decks
// from each airfield's METAR, the pins with their words, and the camera's numbers. Pure: reports, fields
// and numbers go in, plain data comes out. view3d.js only draws it.
//
// The 3D view is a picture for situational awareness. It never decides anything: no limit is checked here
// and nothing in it raises or clears a caution.
import { FT_PER_NM } from './map-view.js';
import { AIRPORTS } from './airports-data.js';
import { velocityFt } from './traffic-motion.js';
import { T6_TYPE, showsName } from './aircraft-kind.js';
import { staleness } from '../../wx/sources.js';
import { ceilingFt, ceilingUnknown } from '../../wx/conditions.js';

/**
 * The square the view shows, centred on home: 450 NM on a side by default (Dad, 7 Oct: "grow it by 100 NM each way so no empty corners show while orbiting"; it was 250), so
 * the usual alternates (CYYN, CYXE about 110 NM out) are well inside (SOF-39). The setting "3D area" (Dad, 8 Oct) chooses 450, 600 or 900 NM (AREA_CHOICES_NM).
 * Everything that scales with it takes `AREA_NM` or `AREA_FT` when it is built: the model grid, the ground canvases and terrain, the cloud sheets, the pictures over the
 * square, the airspace clipping, the towns and airports inside it, the camera's fit. They are live bindings: `setAreaNm` changes them, and the 3D view is built again.
 */
export const AREA_CHOICES_NM = Object.freeze([450, 600, 900]);
export const DEFAULT_AREA_NM = 450;
/** The largest choice: the FAA airspace files (tools/faa-airspace.mjs) cover this square, so every choice is inside them. */
export const MAX_AREA_NM = Math.max(...AREA_CHOICES_NM);
export let AREA_NM = DEFAULT_AREA_NM;
export let AREA_FT = AREA_NM * FT_PER_NM;
/** Sets the square's size to one of AREA_CHOICES_NM (anything else is the default). Returns the size in force. */
export function setAreaNm(nm) {
  AREA_NM = AREA_CHOICES_NM.includes(nm) ? nm : DEFAULT_AREA_NM;
  AREA_FT = AREA_NM * FT_PER_NM;
  return AREA_NM;
}
/** A cloud deck is a flat round disc this wide at its base (SOF-39). */
export const DECK_NM = 10;
export const DECK_FT = DECK_NM * FT_PER_NM;

/**
 * How solid each cover is drawn, as opacity from 0 to 1. A deck is a picture of a layer, not a measurement
 * of it. FEW is 1 to 2 oktas, SCT 3 to 4, BKN 5 to 7, OVC 8 (METAR), and these steps follow that order.
 */
// estimate, SOF-39
export const COVER_OPACITY = Object.freeze({ FEW: 0.25, SCT: 0.45, BKN: 0.7, OVC: 0.9 });

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** A field's elevation in feet above sea level: airports-data.js (OurAirports) first, then the airfield's own, else null ("elevation unknown"). */
export const fieldElevationFt = (icao, field) => AIRPORTS.find((a) => a.icao === icao)?.elevationFt ?? (isNumber(field?.elevationFt) ? field.elevationFt : null);

/** A whole number of feet with its comma: 2500 reads "2,500". */
export const formatFeet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * The cloud decks for one airfield's METAR sky layers (wx's `conditions.sky`: { cover, baseFt, ... }, baseFt in feet
 * above the aerodrome, as a METAR gives it: BKN025 is 2,500 ft). `elevationFt` is the field's elevation above sea
 * level, or null when it is not known (the decks then stand on the ground the view draws, and `elevationKnown` says so).
 *
 * Returns { decks, baseUnknown, obscured, elevationKnown }:
 * - decks: [{ cover, baseAglFt, baseMslFt, opacity, label }], lowest first. A layer with no base is not drawn.
 * - baseUnknown: a FEW, SCT, BKN or OVC layer was reported without a base (BKN///), so the pin says so.
 * - obscured: the vertical visibility in feet when the sky is obscured (VV), else null. It is not a layer, so no deck.
 */
export function cloudDecks({ sky = [], elevationFt = null } = /** @type {any} */ ({})) {
  const elevationKnown = isNumber(elevationFt);
  const decks = [];
  let baseUnknown = false;
  let obscured = null;
  for (const layer of sky ?? []) {
    if (layer?.cover === 'VV') {
      if (isNumber(layer.baseFt)) obscured = layer.baseFt;
      else baseUnknown = true;
      continue;
    }
    const opacity = COVER_OPACITY[layer?.cover];
    if (opacity === undefined) continue;
    if (!isNumber(layer.baseFt)) {
      baseUnknown = true;
      continue;
    }
    decks.push({
      cover: layer.cover,
      baseAglFt: layer.baseFt,
      baseMslFt: layer.baseFt + (elevationKnown ? elevationFt : 0),
      opacity,
      label: `${layer.cover} ${formatFeet(layer.baseFt)}`,
    });
  }
  decks.sort((a, b) => a.baseMslFt - b.baseMslFt);
  return { decks, baseUnknown, obscured, elevationKnown };
}

/**
 * What each reporting station's METAR says about the cloud base over it, for anchoring the 3D view's low cloud (SOF-39; Fable review, 7 Oct). `reports` are wx's
 * `fetchReports('metar', ...)` reports ({ ICAO: { raw, report, source } }, read by wx, never here); `stations` are stations-data.js's ({ icao, lat, lon, elevationFt });
 * `toXY(lat, lon)` gives [x, y] in the map's local feet; `now` is the clock (a report's freshness is wx's own rule, 75 minutes, checked again against it each time, so an
 * old report is never kept).
 *
 * Returns [{ icao, x, y, fresh, ceiling, baseMslFt, clear, unknown }] in the stations' order:
 * - ceiling: the lowest BKN, OVC or VV layer with a base (wx `ceilingFt`), as { group ('BKN085', 'VV002'), baseAglFt, baseMslFt (null when the field elevation is not
 *   known) }, or null. FEW and SCT layers are not a ceiling, so they never move a base.
 * - baseMslFt: the ceiling's base in feet above sea level, or null.
 * - clear: a fresh report with no ceiling whose sky is known (SKC, CLR, or only FEW and SCT): the low cloud near it is thinned.
 * - unknown: a fresh report whose ceiling cannot be known (BKN///, or no cloud group at all): it is not used.
 */
export function stationAnchors({ reports = {}, stations = [], toXY, now = new Date() } = /** @type {any} */ ({})) {
  return stations.map((station) => {
    const [x, y] = toXY(station.lat, station.lon);
    const entry = reports?.[station.icao];
    const fresh = Boolean(entry?.report) && staleness('metar', entry.report, now) === 'fresh';
    const conditions = fresh ? entry.report.conditions : null;
    const elevationFt = isNumber(station.elevationFt) ? station.elevationFt : null;
    const base = fresh ? ceilingFt(conditions) : null;
    let ceiling = null;
    if (base !== null) {
      const layer = (conditions?.sky ?? []).find((l) => (l.cover === 'BKN' || l.cover === 'OVC' || l.cover === 'VV') && l.baseFt === base);
      const deck = layer?.cover === 'VV' ? null : cloudDecks({ sky: [layer], elevationFt }).decks[0];
      ceiling = {
        group: `${layer?.cover ?? 'BKN'}${String(Math.round(base / 100)).padStart(3, '0')}`,
        baseAglFt: base,
        baseMslFt: elevationFt === null ? null : (deck?.baseMslFt ?? base + elevationFt),
      };
    }
    const unknown = fresh && base === null && ceilingUnknown(conditions);
    return { icao: station.icao, x, y, fresh, ceiling, baseMslFt: ceiling?.baseMslFt ?? null, clear: fresh && base === null && !unknown, unknown };
  });
}

/** The category colour tokens (the SOF page's own), with their fallbacks; `none` is for a field with no current METAR. */
export const CATEGORY_TOKENS = Object.freeze({
  VFR: ['--sof-vfr', '#3ecf8e'],
  MVFR: ['--sof-mvfr', '#6db3ff'],
  IFR: ['--sof-ifr', '#ff6b6b'],
  LIFR: ['--sof-lifr', '#e08bff'],
  none: ['--text-muted', '#9bb8c6'],
});

/**
 * One entry per airfield the map has a mark for, home first: where it stands in the view's feet, its colour key, the words on
 * its pin and its decks. `marks` are map-model.js `airfieldMarks` (category, old report, position); `fields` are the airfields
 * (home, then alternates) with their elevation; `cards` are the screen's airfield cards (the METAR's state and the result line); `snapshot` is the weather snapshot (for the sky layers); `toXY(lat, lon)` gives
 * [x, y] in the map's local feet.
 *
 * Failure and stale behaviour (SPEC-sof, "3D view"):
 * - No current METAR: the pin says "No METAR" and there are no decks.
 * - An old report (stale or closed): the pin says its category with "old report" and no decks are drawn, so an old sky is
 *   never drawn as the sky now.
 * - A layer with no base is not drawn, and the pin adds "base unknown".
 *
 * An airfield outside the square (`outside`: true; Saskatoon is some 110 NM from Moose Jaw, past the half-width) is not drawn:
 * a pin hanging in the air past the edge of the ground would be misleading, so the view names it instead.
 *
 * Each: { icao, home, x, y, outside, groundFt, category, key, result, old, lines, title, decks } where `lines` are the pin's words, `title` is the same as a sentence for hover, `key` is a
 * CATEGORY_TOKENS key, `result` is the airfield card's result line ({ level, words }, or null) and `groundFt` is the field's elevation
 * (the home field's when this one has none).
 */
export function sceneAirfields({ marks = [], cards = [], fields = [], snapshot = {}, toXY } = /** @type {any} */ ({})) {
  const byIcao = new Map(fields.map((f) => [f.icao, f]));
  const cardOf = new Map(cards.map((c) => [c.icao, c]));
  const homeMark = marks.find((m) => m.home);
  const homeElevation = fieldElevationFt(homeMark?.icao, byIcao.get(homeMark?.icao));
  const out = [];
  for (const mark of marks) {
    const field = byIcao.get(mark.icao);
    const [x, y] = toXY(mark.lat, mark.lon);
    const card = cardOf.get(mark.icao);
    const fresh = card?.metar?.state === 'fresh';
    const noMetar = !fresh && !mark.old;
    const sky = fresh ? snapshot.metar?.[mark.icao]?.report?.conditions?.sky : null;
    const own = fieldElevationFt(mark.icao, field);
    const result = cloudDecks({ sky: sky ?? [], elevationFt: own ?? (isNumber(homeElevation) ? homeElevation : null) });
    const lines = [];
    if (noMetar) lines.push(`${mark.icao} No METAR`);
    else lines.push(`${mark.icao} ${mark.category ?? 'no category'}${mark.old ? ', old report' : ''}`);
    if (mark.old) lines.push('no cloud decks drawn');
    if (fresh && result.baseUnknown) lines.push('base unknown');
    if (fresh && result.obscured !== null) lines.push(`sky obscured, vertical visibility ${formatFeet(result.obscured)}`);
    if (own === null && fresh && result.decks.length) lines.push('elevation unknown');
    out.push({
      icao: mark.icao,
      home: mark.home,
      x,
      y,
      outside: Math.abs(x) > AREA_FT / 2 || Math.abs(y) > AREA_FT / 2,
      groundFt: own ?? (isNumber(homeElevation) ? homeElevation : 0),
      category: mark.category,
      key: noMetar || mark.category === null ? 'none' : mark.category,
      result: card?.result ? { level: card.result.level, words: card.result.words } : null,
      old: mark.old,
      lines,
      // The pin's hover text: its words, and what an unknown elevation means for its decks.
      title: `${lines.join('. ')}.${own === null && fresh && result.decks.length ? ' This field’s elevation is not known, so its decks are drawn from home’s.' : ''}`,
      decks: fresh ? result.decks : [],
    });
  }
  return out;
}

/** Whether two scenes would draw the same, so the view is only rebuilt when something it shows changes. */
export const sceneSignature = (airfields) => JSON.stringify(airfields.map((a) => [a.icao, a.x, a.y, a.outside, a.groundFt, a.key, a.old, a.lines, a.result?.words, a.decks.map((d) => [d.cover, d.baseMslFt])]));

// ---- Live aircraft (SOF-39 phase 4, SOF-40) ---------------------------------------------------------

/** The relay's type code for the T-6 (Harvard II) that Dad wants to see at a glance: drawn large, with its tag always on (Dad, 7 Oct). From aircraft-kind.js. */
export { T6_TYPE };
/**
 * Most aircraft drawn at once, T-6s first, then military, then the relay's order (nearest home first). A cap for the drawing's sake (each aircraft is a few
 * dozen triangles, sharing its kind's shapes, and a tag); the relay's own limit is 1,000. 300 since the traffic reaches 250 NM (Dad, 8 Oct 2026; was 150).
 * An estimate, SOF-39.
 */
export const MAX_3D_AIRCRAFT = 300; // estimate, SOF-39

/**
 * The traffic display settings (SOF settings, "Traffic display"; Dad, 8 Oct 2026), as the 3D view and the 2D layer take them. The defaults are the look before
 * them: medium icons, medium (V2.199) tag text, tags with the callsign and altitude, names for every aircraft, and T-6 tags larger and always on.
 * Kept in the SOF's "view3d" settings document (settings-model.js `cleanView3d`).
 */
export const TRAFFIC_DISPLAY_DEFAULTS = Object.freeze({ iconSize: 'medium', tagSize: 'medium', tagShows: 'callsign-altitude', namesFor: 'all', t6Tags: true });
const SIZE_IDS = Object.freeze(['small', 'medium', 'large']);
const TAG_SHOWS_IDS = Object.freeze(['callsign', 'callsign-altitude', 'full']);
/** How much bigger or smaller each icon size draws every aircraft, in 2D and in 3D. Estimates for readability. */
export const ICON_SCALE = Object.freeze({ small: 0.7, medium: 1, large: 1.4 });

/** The display settings checked: anything not offered is its default. */
export function cleanTrafficDisplay(d) {
  const v = d ?? {};
  return Object.freeze({
    iconSize: SIZE_IDS.includes(v.iconSize) ? v.iconSize : TRAFFIC_DISPLAY_DEFAULTS.iconSize,
    tagSize: SIZE_IDS.includes(v.tagSize) ? v.tagSize : TRAFFIC_DISPLAY_DEFAULTS.tagSize,
    tagShows: TAG_SHOWS_IDS.includes(v.tagShows) ? v.tagShows : TRAFFIC_DISPLAY_DEFAULTS.tagShows,
    namesFor: ['all', 't6-mil', 't6'].includes(v.namesFor) ? v.namesFor : TRAFFIC_DISPLAY_DEFAULTS.namesFor,
    t6Tags: typeof v.t6Tags === 'boolean' ? v.t6Tags : TRAFFIC_DISPLAY_DEFAULTS.t6Tags,
  });
}

/**
 * Whether an aircraft's tag shows in the 3D view. `item` is a `sceneTraffic` aircraft (isT6, named). Always for the one under the pointer or chosen
 * (`picked`: the hover still shows any aircraft, Dad, 8 Oct 2026), the one the tour follows, and one inside a watched area (`intruder`, its ⚠ tag; the
 * airspace watch is not a name and is not hidden); a T-6's always while "T-6 tags larger and always on" is on (`t6Tags`); any other only while the
 * Labels choice is on (`labelsOn`) and the "Names shown for" choice names it (`item.named`).
 */
export function tagShown(item, { labelsOn = false, t6Tags = true, intruder = false, picked = false } = {}) {
  if (picked || intruder) return true;
  if (item?.isT6 === true && t6Tags) return true;
  return labelsOn === true && item?.named !== false;
}

/** An aircraft's name as the tag says it: callsign, else registration, else the hex id. */
export const aircraftName = (a) => a.callsign ?? a.reg ?? String(a.hex).toUpperCase();

/**
 * The words on an aircraft's tag. `a` is traffic.js `layerModel`'s aircraft. The compact form is the name and the height in hundreds of feet
 * or a flight level from 18,000 ft ("TEX21 5,500", "UAL1 FL350", "GND"); the Labels choice of the 2D layer picks what an always-on tag says:
 * 'callsign' the name only, 'full' the 2D label (name, height, ground speed, type), anything else the compact form.
 */
export function tagWords(a, label = 'off') {
  const name = aircraftName(a);
  const height = String(a.altitudeWords).replace(/ ft$/, '');
  if (label === 'callsign') return name;
  if (label === 'full' && a.label) return a.label;
  // "Callsign, altitude, speed and type" for a tag that shows with the Labels choice off (the Traffic display setting "Tag shows").
  if (label === 'full') return [name, height, a.gsWords, a.type].filter(Boolean).join(' ');
  return `${name} ${height}`;
}

/**
 * What the 3D view draws for the traffic layer, from `trafficFeed.view()` (traffic.js `trafficView`): the checked, aged and faded aircraft
 * with positions in the map's local feet. `toXY(lat, lon)` gives [x, y]; `label` is the layer's Labels choice.
 *
 * - An aircraft with no height ("altitude unknown") is not drawn, because a height is needed to stand it in the air; the words say how many.
 * - 'ground' stays 'ground' (the view stands it on the field's elevation).
 * - Opacity is traffic.js's own stale fade, and an aircraft the 2D layer has dropped (too old) is gone here too: nothing is frozen.
 * - T-6s ('TEX2') come first, then the relay's order, up to MAX_3D_AIRCRAFT; the words say when some are left out.
 *
 * Smoother traffic (Dad, 7 Oct): `x` and `y` are where the aircraft was reported; `vx` and `vy` (feet a second east and north, from its track and
 * ground speed; null when it cannot be glided) with `ageS` (the report's age at `t0`, which is `now` in milliseconds) let the view put it where it
 * should be by now (traffic-motion.js `glideXY`). `trails` is the memory of reported positions (`createTrails`) and `trailsOn` the Trails choice: each
 * aircraft then carries `trail`, [{ x, y, altFt, t }] oldest first, the positions of the last couple of minutes (t in ms).
 *
 * `display` is the Traffic display settings (TRAFFIC_DISPLAY_DEFAULTS, checked here): with the Labels choice off, a tag that shows (a T-6's, a watched-area
 * one, the hovered one) says what "Tag shows" picks; with it on, the tag says what the Labels choice picks, as before. `named` is false for an aircraft the
 * "Names shown for" choice leaves without a tag (aircraft-kind.js `showsName`).
 *
 * Returns { shown, status, statusText, aircraft: [{ hex, x, y, vx, vy, ageS, t0, trail, altFt, trackDeg, opacity, mil, isT6, helicopter, kind, kindWords, named, name, tag, labelText,
 * description }], noAltitude, leftOut, labelsOn (the Labels choice is not 'off': every named tag shows), trailsOn, display, signature }; `shown` is false when the layer is off.
 */
export function sceneTraffic({ view, toXY, label = 'off', max = MAX_3D_AIRCRAFT, now = null, trails = null, trailsOn = false, display = TRAFFIC_DISPLAY_DEFAULTS } = /** @type {any} */ ({})) {
  const shows = cleanTrafficDisplay(display);
  if (!view || view.show !== true) return { shown: false, status: view?.status ?? 'off', statusText: '', aircraft: [], noAltitude: 0, leftOut: 0, labelsOn: false, trailsOn: false, display: shows, signature: 'off' };
  const words = label !== 'off' ? label : shows.tagShows === 'callsign-altitude' ? 'off' : shows.tagShows; // 'off' is the compact callsign and altitude
  const drawable = [];
  let noAltitude = 0;
  // An aircraft with no height is still drawn, just above the ground with "height ?" in its tag (Dad, 7 Oct: a low aircraft was missing).
  for (const a of view.aircraft ?? []) {
    if (a.altitudeFt !== 'ground' && !isNumber(a.altitudeFt)) noAltitude += 1;
    drawable.push(a);
  }
  // T-6s first, then military, then the rest in the relay's order (nearest home first), so the cap leaves out the far civil traffic first.
  const t6s = drawable.filter((a) => a.type === T6_TYPE);
  const military = drawable.filter((a) => a.type !== T6_TYPE && a.mil === true);
  const ordered = [...t6s, ...military, ...drawable.filter((a) => a.type !== T6_TYPE && a.mil !== true)];
  const leftOut = Math.max(0, ordered.length - max);
  const aircraft = ordered.slice(0, max).map((a) => {
    const [x, y] = toXY(a.lat, a.lon);
    const v = Number.isFinite(now) ? velocityFt(a) : null;
    return {
      hex: a.hex,
      x,
      y,
      vx: v ? v.vx : null,
      vy: v ? v.vy : null,
      ageS: a.ageS,
      t0: Number.isFinite(now) ? now : null,
      trail: trailsOn && trails ? trails.get(a.hex).map((p) => {
        const [tx, ty] = toXY(p.lat, p.lon);
        return { x: tx, y: ty, altFt: p.alt, t: p.t };
      }) : [],
      altFt: a.altitudeFt === 'ground' || isNumber(a.altitudeFt) ? a.altitudeFt : null,
      trackDeg: a.hasTrack ? a.rotationDeg : null,
      opacity: a.opacity,
      mil: a.mil === true,
      isT6: a.type === T6_TYPE,
      helicopter: a.helicopter === true && a.type !== T6_TYPE, // traffic.js marks it (helicopters.js); drawn as a helicopter (Dad, 8 Oct 2026)
      kind: a.type === T6_TYPE ? 't6' : (typeof a.kind === 'string' ? a.kind : 'other'), // traffic.js's (aircraft-kind.js): the 3D shape
      kindWords: typeof a.kindWords === 'string' ? a.kindWords : null,
      named: showsName(a, shows.namesFor),
      name: aircraftName(a),
      tag: a.altitudeFt === 'ground' || isNumber(a.altitudeFt) ? tagWords(a, 'off') : `${aircraftName(a)} height ?`,
      labelText: a.altitudeFt === 'ground' || isNumber(a.altitudeFt) ? tagWords(a, words) : `${aircraftName(a)} height ?`,
      description: a.description || `${String(a.hex).toUpperCase()}.`,
    };
  });
  const notes = [];
  if (noAltitude) notes.push(`${noAltitude} without a height, drawn just above the ground`);
  const helicopters = aircraft.filter((a) => a.helicopter).length;
  if (helicopters) notes.push(`${helicopters} ${helicopters === 1 ? 'helicopter' : 'helicopters'}, drawn with a rotor`);
  if (leftOut) notes.push(`${max} drawn: T-6s, then military, then the nearest`);
  const statusText = notes.length ? `${view.statusText} (${notes.join(', ')})` : view.statusText;
  const rows = aircraft.map((a) => [a.hex, Math.round(a.x), Math.round(a.y), a.altFt, a.trackDeg === null ? '' : Math.round(a.trackDeg), a.opacity, a.mil ? 1 : 0, a.helicopter ? 1 : 0, a.kind, a.named ? 1 : 0, a.tag, a.labelText, a.trail.length, a.trail.at(-1)?.t ?? ''].join(','));
  const look = [shows.iconSize, shows.tagSize, shows.t6Tags ? 1 : 0].join(',');
  return { shown: true, status: view.status, statusText, aircraft, noAltitude, leftOut, labelsOn: label !== 'off', trailsOn, display: shows, signature: `${view.status}|${label !== 'off'}|${trailsOn}|${look}|${rows.join(';')}` }; // the words change with the clock, the drawing only when an aircraft does
}

// ---- The camera -----------------------------------------------------------------------------------

/** pitchDeg is degrees from straight down (0 looks straight down, 90 is level), as ui-kit's `matchProjection` takes it. zoom is pixels to 1,000 ft. */
export const START_CAMERA = Object.freeze({ yawDeg: -45, pitchDeg: 45 });
/** From the south-east, 45 degrees down (SOF-39): looking north-west, so the ground's "up the screen" direction is -45 degrees. */
export const PITCH_LIMITS = Object.freeze([5, 85]);
/** A wheel notch, a pinch step and the keys' turn. Estimates for feel. */
export const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
export const ZOOM_STEP = 1.25;
/**
 * The zoom limits as a share of the start (fit) zoom: out to half of it, in to 540 times it (was 20, then 300 over the 250 NM square). At 20 times, Moose Jaw's 150 ft wide
 * runway is about 2 px across, so the airports' markings and numbers (airports3d.js) could never be read; at 300 times over 250 NM it was about 30 px, and the square grew
 * to 450 NM (the fit zoom fell by 1.8), so 540 keeps the same closest view. An estimate for readability, SOF-39.
 */
export const ZOOM_RANGE = Object.freeze([0.5, 540]);
export const KEY_ORBIT_PX = Object.freeze({ ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * The zoom (pixels to 1,000 ft) at which the whole square fits the view at a pitch: its corners spread the square's diagonal
 * across the screen, and up the screen it spans the diagonal times the cosine of the pitch plus the tallest deck.
 * `size` is { width, height } in pixels, `topFt` the highest thing drawn above the ground, already scaled.
 */
export function fitZoom(size, pitchDeg = START_CAMERA.pitchDeg, topFt = 0) {
  const diagonal = AREA_FT * Math.SQRT2;
  const across = diagonal * 1.08;
  const up = (diagonal * Math.cos((pitchDeg * Math.PI) / 180) + topFt * Math.sin((pitchDeg * Math.PI) / 180)) * 1.12 + 1;
  const pxPerFt = Math.min(Math.max(size.width, 1) / across, Math.max(size.height, 1) / up);
  return pxPerFt * 1000;
}

/** The camera after a drag of (dx, dy) pixels (or a key press standing for one): right turns the view, down tilts it to look more from above. */
export function orbitBy(cam, dx, dy) {
  return {
    ...cam,
    yawDeg: wrapDeg(cam.yawDeg + dx * ORBIT_DEG_PER_PX.yaw),
    pitchDeg: clamp(cam.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]),
  };
}

/**
 * The camera zoomed by a factor (above 1 zooms in), kept inside the limits round the start zoom `fit`. Out to ZOOM_RANGE[0] of the fit (so a bigger area zooms out further);
 * in to ZOOM_RANGE[1] of it at 450 NM, and that much more for a bigger area (its fit zoom is smaller), so the closest view is the same at every area.
 */
export function zoomCamera(cam, factor, fit) {
  const next = Number.isFinite(factor) && factor > 0 ? cam.zoom * factor : cam.zoom;
  return { ...cam, zoom: clamp(next, fit * ZOOM_RANGE[0], fit * ZOOM_RANGE[1] * (AREA_NM / DEFAULT_AREA_NM)) };
}

/** The start view (Home): from the south-east, 45 degrees down, the whole square in view, looking at home. */
export const homeCamera = () => ({ ...START_CAMERA, zoom: 1, tx: 0, ty: 0 });

/**
 * A drag slides the map (Dad, 8 Oct): the most a drag up or down the screen is stretched for the tilt. Up the screen, a foot of ground shows as cos(pitch) of a foot
 * (pitch from straight down), so keeping the ground under the pointer needs 1 / cos(pitch) feet a pixel; near level that grows without end, so it stops at this (an
 * estimate for feel: about 76 degrees of tilt).
 */
export const PAN_TILT_GAIN_MAX = 4;
/** Shift and an arrow key slides the map this many pixels' worth (an estimate for feel, twice the arrow keys' turn). */
export const KEY_PAN_PX = 60;

/** The look-at point kept inside the square (`halfFt` its half width): { ...cam, tx, ty } with each within ±halfFt of home. */
export function clampLookAt(cam, halfFt = AREA_FT / 2) {
  return { ...cam, tx: clamp(cam.tx ?? 0, -halfFt, halfFt), ty: clamp(cam.ty ?? 0, -halfFt, halfFt) };
}

/**
 * The camera after a drag of (dx, dy) screen pixels (right and down positive) that slides the map: the ground under the pointer moves with it, so the look-at point
 * moves the other way. `ftPerPx` is the ground feet a screen pixel spans at the zoom in use (1000 / pixels per 1,000 ft). The view is orthographic (ui-kit
 * `matchProjection`): screen right is the ground direction (cos yaw, -sin yaw), and up the screen is (sin yaw, cos yaw) foreshortened by cos(pitch). The look-at point
 * stays inside the square (`clampLookAt`).
 */
export function panBy(cam, dx, dy, ftPerPx, halfFt = AREA_FT / 2) {
  const yaw = (cam.yawDeg * Math.PI) / 180;
  const pitch = (cam.pitchDeg * Math.PI) / 180;
  const across = -dx * ftPerPx; // along screen right
  const up = dy * ftPerPx * Math.min(1 / Math.max(Math.cos(pitch), 1e-6), PAN_TILT_GAIN_MAX); // along the ground direction that points up the screen
  const tx = (cam.tx ?? 0) + Math.cos(yaw) * across + Math.sin(yaw) * up;
  const ty = (cam.ty ?? 0) - Math.sin(yaw) * across + Math.cos(yaw) * up;
  return clampLookAt({ ...cam, tx, ty }, halfFt);
}

// ---- The mouse (Dad, 8 Oct 2026: "i should be able to click and move around with the mouse") ------------------------------------------------------------

/** What a plain left-drag does, the "3D mouse" setting: 'move' slides the map (the default, like an online map) or 'turn' turns the view (as before 8 Oct). */
export const MOUSE_LEFT_CHOICES = Object.freeze(['move', 'turn']);
export const DEFAULT_MOUSE_LEFT = 'move';

/**
 * What a press starts, from the pointer event's own fields: 'move' (slide the map, `panBy`), 'turn' (turn the view, `orbitBy`) or null (a mouse button that does
 * nothing, such as the middle one). A mouse's left button does what `leftDrag` says and its right button the other; Shift with the left button always moves and
 * Ctrl with it always turns. A finger or a pen is as before the setting: one turns the view, Shift (from a keyboard) moves it; two fingers are a pinch (view3d.js).
 */
export function dragAction({ pointerType = 'mouse', button = 0, shiftKey = false, ctrlKey = false } = {}, leftDrag = DEFAULT_MOUSE_LEFT) {
  const left = MOUSE_LEFT_CHOICES.includes(leftDrag) ? leftDrag : DEFAULT_MOUSE_LEFT;
  if (pointerType !== 'mouse') return button === 2 || shiftKey === true ? 'move' : 'turn';
  if (button !== 0 && button !== 2) return null;
  if (shiftKey === true) return 'move';
  if (button === 2) return left === 'move' ? 'turn' : 'move';
  if (ctrlKey === true) return 'turn';
  return left;
}

/** The corner hint for the mouse choice. */
export const mouseHint = (leftDrag = DEFAULT_MOUSE_LEFT) => (leftDrag === 'turn'
  ? 'Drag to turn · Right-drag or Shift-drag to move · Wheel to zoom'
  : 'Drag to move · Right-drag to turn · Wheel to zoom');
