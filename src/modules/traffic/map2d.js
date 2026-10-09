// The Traffic Sim's 2D map (specs/SPEC-traffic.md: The screen, and Colour is
// never the only signal): a grid, the routes (patterns solid, entries dashed,
// splits dotted, each with its name), the selected route's points, aircraft
// pointing along their heading with callsign and height/speed, trails, and the
// conflict bubbles and caution rings. It is drawn on the ui-kit canvas view,
// so drag pans, wheel and + / - zoom, and it draws only when asked.
//
// It draws what it is given and works nothing out: routes and aircraft are
// plain data in feet (x east, y north), and nothing here changes a number.
// The projection and the wording live in small pure functions, tested on their own.
//
// The scene it draws (all optional except routes and aircraft):
//   routes:   [{ id, name, kind: 'pattern' | 'entry' | 'split', color, visible?,
//                points: [{ x, y, alt, label?, kt?, g?, decision?, radiusFt?, bankDeg?, maxG? }],
//                path?: [{ x, y }] }]   path is the rounded line to draw; without it, the points are joined
//   selectedRouteId: the route whose points show, or null
//   aircraft: [{ id, type, x, y, alt, kt, headingDeg, status, color? }]   only 'flying' ones are drawn
//   conflicts: [{ a, b, latFt, vertFt, level: 'conflict' | 'caution' }]
//   trails: { [aircraftId]: [{ x, y }] }
//   legs:     [{ routeId, x, y, ft }]   where each leg's length is written (its middle) and how long it is,
//                                       worked out by the engine. Without it, the map measures the
//                                       straight legs between each route's points itself.
import { createCanvasView } from '../../ui-kit/canvas-view.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { makeLocalRef, localFtToLatLon, latLonToLocalFt } from '../../core/geo.js';
import { FT_PER_NM } from '../../core/units.js';
import { PFL, PFL_CONFIGS, PFL_CONFIG_LABELS, calculateGlideFootprint } from './pfl.js';
import { ejectionAt } from './ejection.js';
import { trueAltFt } from './weather.js';
import { FIELD_ELEV_FT, THRESHOLD_29L, PFL_CIRCLE_RADIUS_FT, PATTERN_ALT_FT, trueToMagnetic } from './airfield.js';
import { TYPE_COLORS as FLEET_COLORS } from './types.js';
import { CLOSE_UP_DRAW_FT } from './types.js';

export const MAP_MIN_SPAN_FT = 300;
export const MAP_MAX_SPAN_FT = 200_000;
const FIT_PADDING_PX = 60; // room round the routes for the labels beside the aircraft

const HOME_SETUP = 'Moose Jaw';
export const HINT_TEXT = `Press Play to watch the ${HOME_SETUP} traffic.`;

/** V6's aircraft colours with full 15 Wing fleet support (CT-102B, CT-155, CF-188); an aircraft can bring its own. */
export const TYPE_COLORS = Object.freeze(
  Object.create(FLEET_COLORS, Object.getOwnPropertyDescriptors({
    'CT-157': '#a5d6ff',
    'CT-156': '#7ee787',
    'CT-102': '#ffcc66',
    'CT-114': '#ff6b6b',
  }))
);
const FALLBACK_COLOR = '#c7d8e7';

/** The words that go with the colours, so colour is never the only signal. */
export const LEVEL_MARKS = Object.freeze({ conflict: '⚠ CONFLICT', caution: '△ CAUTION' });

// Colours come from the ui-kit tokens on the page; these stand in when a token is missing.
const TOKEN_FALLBACKS = Object.freeze({
  '--text': '#e3eef5',
  '--text-muted': '#9bb8c6',
  '--border': '#17384a',
  '--bad': '#ff6b6b',
  '--caution': '#f5c542',
  '--bg': '#020a10',
});

/** Reads the map's colours through `read(tokenName)` (a computed style, in the browser). */
export function paletteFrom(read) {
  const pick = (name) => (read(name) || TOKEN_FALLBACKS[name]);
  return {
    text: pick('--text'),
    muted: pick('--text-muted'),
    grid: pick('--border'),
    bad: pick('--bad'),
    caution: pick('--caution'),
    halo: pick('--bg'),
  };
}

// ---------------------------------------------------------------------------
// Words and numbers (pure)

const whole = (n) => (Math.round(n) || 0).toLocaleString('en-US'); // never "-0"

/** "2,500 ft 220 kt", the label under an aircraft's callsign. */
export const heightSpeedText = (ac) => `${whole(ac.indicatedAlt ?? ac.alt)} ft ${whole(ac.kt)} kt`; // the altimeter's height

/** "1,250 ft", a leg's length on the map. */
export const feetText = (ft) => `${whole(ft)} ft`;

/** "Wind 241°M 20 kt" for a wind from 250° true, or nothing when the wind is calm: magnetic, as the runways are (Patrick, 4 Oct). */
export function windText(fromDeg, kt) {
  if (!(kt > 0)) return '';
  const from = String(trueToMagnetic(fromDeg)).padStart(3, '0');
  return `Wind ${from}°M ${whole(kt)} kt`;
}

/** The direction the wind blows towards, in degrees true (the arrow points this way). */
export const windBlowsTowardDeg = (fromDeg) => (((fromDeg + 180) % 360) + 360) % 360;

/** A point's label lines: "6 Downwind" and "2,500 ft / 220 kt / 2.0 G" (V6 line 283, points numbered from 1). */
export function pointLabelLines(index, point) {
  const parts = [];
  if (Number.isFinite(point.alt)) parts.push(`${whole(point.alt)} ft`);
  if (Number.isFinite(point.kt)) parts.push(`${whole(point.kt)} kt`);
  if (Number.isFinite(point.g)) parts.push(`${point.g.toFixed(1)} G`);
  return { title: `${index + 1} ${point.label ?? ''}`.trim(), detail: parts.join(' / ') };
}

/** "R 2,474 ft / bank 60°" for a rounded point, with the most G it needs when that's known; else nothing. */
export function turnLabelText(point) {
  if (!Number.isFinite(point.radiusFt) || !Number.isFinite(point.bankDeg)) return '';
  const most = Number.isFinite(point.maxG) ? ` / most ${point.maxG.toFixed(1)} G` : '';
  return `R ${whole(point.radiusFt)} ft / bank ${whole(point.bankDeg)}°${most}`;
}

/**
 * The one line on the map: what to do first, or what's missing. Nothing once the run has started.
 * `place` names the setup ("Moose Jaw"), or is left empty for one of the user's own.
 */
export function hintFor({ timeS, mode, aircraftCount, place = HOME_SETUP }) {
  if (aircraftCount === 0) return 'No aircraft yet. Press a spot under Spawn on the right to add one.';
  if (timeS !== 0 || mode !== 'paused') return '';
  return `Press Play to watch the ${place ? `${place} ` : ''}traffic.`;
}

// ---------------------------------------------------------------------------
// Where things go (pure)

/**
 * The box round every route that is showing (or, with none, every aircraft), or null when there
 * is nothing. A plain loop, because Math.min(...list) fails on a very long list.
 */
export function sceneBounds(routes, aircraft = []) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const take = (dots) => {
    for (const { x, y } of dots) {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
  };
  for (const route of routes) if (route.visible !== false) take(route.path ?? route.points);
  if (box.minX === Infinity) take(aircraft);
  return box.minX === Infinity ? null : box;
}

/**
 * The box the first view and Fit frame (TR-17): the first pattern that is showing (its drawn path where it has one)
 * and the flying aircraft near it, so the pattern being watched fills the map and the long entry legs run off the
 * edge. "Near" is within half the pattern's longer side of it. With no pattern showing it is every route, as
 * `sceneBounds` gives; with nothing it is null.
 */
export function focusBounds(routes, aircraft = []) {
  const pattern = routes.find((r) => r.kind === 'pattern');
  const box = pattern ? sceneBounds([{ ...pattern, visible: true }]) : null;
  if (!box) return sceneBounds(routes, aircraft);
  const room = Math.max(box.maxX - box.minX, box.maxY - box.minY) / 2;
  const { minX, minY, maxX, maxY } = box;
  for (const a of aircraft) {
    if (!isFlying(a) || a.x < minX - room || a.x > maxX + room || a.y < minY - room || a.y > maxY + room) continue;
    if (a.x < box.minX) box.minX = a.x;
    if (a.x > box.maxX) box.maxX = a.x;
    if (a.y < box.minY) box.minY = a.y;
    if (a.y > box.maxY) box.maxY = a.y;
  }
  return box;
}

const GRID_STEPS_FT = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

/** The smallest neat grid spacing that keeps lines at least `minPx` apart on screen. */
export function gridStepFt(pxPerFt, minPx = 40) {
  return GRID_STEPS_FT.find((step) => step * pxPerFt >= minPx) ?? GRID_STEPS_FT.at(-1);
}

/** The grid lines inside a box: the x of each vertical line and the y of each horizontal one. */
export function gridLines({ minX, minY, maxX, maxY }, stepFt) {
  const run = (lo, hi) => {
    const out = [];
    for (let v = Math.ceil(lo / stepFt) * stepFt + 0; v <= hi; v += stepFt) out.push(v); // + 0 turns -0 into 0
    return out;
  };
  return { xs: run(minX, maxX), ys: run(minY, maxY) };
}

export const gridLabel = (stepFt) => `Grid: ${whole(stepFt)} ft`;

/** How a route is drawn: patterns solid, entries dashed, splits dotted (V6 line 281); a PFL dash-dot. */
/** A route's own line thickness (a multiple of its kind's) and opacity, 0-1, from the Display box (Patrick, 4 Oct). */
export const lineScale = (route) => (Number.isFinite(route?.lineScale) && route.lineScale > 0 ? route.lineScale : 1);
export const lineOpacity = (route) => (Number.isFinite(route?.lineOpacity) ? Math.min(1, Math.max(0, route.lineOpacity)) : 1);

export function routeStyle(kind) {
  if (kind === 'entry') return { dash: [8, 6], width: 2.5 };
  if (kind === 'split') return { dash: [3, 7], width: 2.5 };
  if (kind === 'pfl') return { dash: [10, 4, 2, 4], width: 2.5 };
  return { dash: [], width: 3 };
}

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// The straight legs between a line's points; a loop (a pattern) has its closing leg too.
function legsOf(points, closed) {
  const legs = points.slice(1).map((b, i) => [points[i], b]);
  if (closed && points.length > 2) legs.push([points.at(-1), points[0]]);
  return legs;
}

/** The middle of the longest stretch of a line, where the route's name goes (a loop counts its closing leg). */
export function labelAnchor(line, closed = false) {
  const legs = legsOf(line, closed);
  if (!legs.length) return line[0] ?? null;
  const [a, b] = legs.reduce((best, leg) => (distance(...leg) > distance(...best) ? leg : best));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Each straight leg between a route's points, with its middle and its length in feet (V6 rawSegs). */
export function legLabels(route) {
  return legsOf(route.points, route.kind === 'pattern').map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ft: distance(a, b) }));
}

/**
 * The leg-length labels to draw, each with the colour of its route: the scene's own legs (from the
 * engine), or, when the scene gives none, the straight legs between each route's points.
 * Only routes that are showing have labels.
 */
export function legsToLabel(routes, legs) {
  if (!legs) return routes.flatMap((route) => legLabels(route).map((leg) => ({ ...leg, color: route.color })));
  const colours = new Map(routes.map((route) => [route.id, route.color]));
  return legs.filter((leg) => colours.has(leg.routeId)).map((leg) => ({ ...leg, color: colours.get(leg.routeId) }));
}

// Shapes are drawn about (0, 0) with a nose at (0, -1), so a heading turns them clockwise from north.
const AIRCRAFT_SHAPE = [[0, -1], [0.65, 0.7], [0, 0.35], [-0.65, 0.7]]; // V6 line 295
const WIND_ARROW_SHAPE = [[0, -1], [0.5, -0.3], [0.18, -0.3], [0.18, 1], [-0.18, 1], [-0.18, -0.3], [-0.5, -0.3]];

/** A shape turned to a compass heading and scaled to pixels: screen points, y down. */
export function turnedShape(shape, headingDeg, sizePx) {
  const a = ((Number.isFinite(headingDeg) ? headingDeg : 0) * Math.PI) / 180;
  const [sin, cos] = [Math.sin(a), Math.cos(a)];
  return shape.map(([x, y]) => [(x * cos - y * sin) * sizePx, (x * sin + y * cos) * sizePx]);
}

export const aircraftSymbol = (headingDeg, sizePx) => turnedShape(AIRCRAFT_SHAPE, headingDeg, sizePx);

/** The smallest an aircraft symbol is drawn, in pixels (its size parameter). */
export const MIN_SYMBOL_PX = 14;
/**
 * The symbol's size at this zoom: its real length (a T-6, 33.4 ft nose to tail, which is 1.7 of the
 * shape's units) once that is bigger than MIN_SYMBOL_PX, so zoomed in it grows with the map and never
 * looks smaller than the aircraft really is (Patrick, 4 Oct 09:19Z).
 */
export const aircraftSymbolPx = (pxPerFt, scale = 1) => Math.max(MIN_SYMBOL_PX, (CLOSE_UP_DRAW_FT * pxPerFt) / 1.7) * (Number(scale) > 0 ? Number(scale) : 1);

/** The smallest a conflict bubble and a caution ring are drawn on screen, in pixels, so they can be seen when zoomed out. */
export const MIN_BUBBLE_PX = 8;
export const MIN_RING_PX = 12;
const RING_OVER_BUBBLE_PX = 4;

/**
 * The radii, in pixels, of an aircraft's conflict bubble and caution ring at this zoom. They are the
 * true size of the limits (in feet) when that is big enough to see, and never smaller than
 * MIN_BUBBLE_PX and MIN_RING_PX; the ring is always bigger than the bubble.
 */
export function markRadiiPx(conflictLatFt, cautionLatFt, pxPerFt) {
  const bubblePx = Math.max(conflictLatFt * pxPerFt, MIN_BUBBLE_PX);
  const ringPx = Math.max(cautionLatFt * pxPerFt, MIN_RING_PX, bubblePx + RING_OVER_BUBBLE_PX);
  return { bubblePx, ringPx };
}

/** Each aircraft's worst level, 'conflict' over 'caution', as a Map of id to level. */
export function conflictLevels(conflicts) {
  const levels = new Map();
  for (const c of conflicts) {
    for (const id of [c.a, c.b]) if (levels.get(id) !== 'conflict') levels.set(id, c.level);
  }
  return levels;
}

export const isFlying = (ac) => ac.status === 'flying';
export const aircraftColor = (ac) => ac.color ?? TYPE_COLORS[ac.type] ?? FLEET_COLORS[ac.type] ?? FALLBACK_COLOR;

// The glide ring lives with the PFL segment planner's numbers (calculateGlideFootprint).
export { calculateGlideFootprint };

/**
 * Checks if an aircraft has engine failure or PFL active.
 *
 * @param {any} a
 * @returns {boolean}
 */
export function isPflActive(a) {
  if (!a) return false;
  if (a.engineFailed === true) return true;
  const phase = typeof a.phase === 'string' ? a.phase.toLowerCase() : '';
  const status = typeof a.status === 'string' ? a.status.toLowerCase() : '';
  const command = typeof a.command === 'string' ? a.command.toLowerCase() : '';
  if (phase.startsWith('pfl') || phase === 'crash_short' || phase === 'crashed' || phase === 'crash' || phase.includes('eject')) return true;
  if (status === 'crashed' || status === 'ejected') return true;
  if (command === 'pfl_current' || command === 'engine_fail' || command === 'climb_high_key' || command === 'climb_low_key' || command.startsWith('pfl')) return true;
  if (a.pflActive === true || Boolean(a.pflFlight) || Boolean(a.pflRoute) || Boolean(a.pflSegment) || Boolean(a.pflDecision)) return true;
  return false;
}

/**
 * Determines if the dynamic glide footprint ring should be rendered for an aircraft.
 *
 * @param {any} a
 * @param {string|null} [selectedAircraftId=null]
 * @returns {boolean}
 */
export function shouldShowGlideFootprint(a, selectedAircraftId = null) {
  // Only for the selected aircraft (Patrick, 4 Oct), and only while it is gliding or set up for a PFL.
  if (!a || !selectedAircraftId || a.id !== selectedAircraftId) return false;
  return isPflActive(a) || Boolean(a.command?.startsWith('pfl'));
}

/**
 * Determines tactical PFL status badge for an aircraft in PFL recovery.
 * Returns null when no tag shows. Every aircraft carries its behaviour tag (behaviour.js, TR-60). A PFL flown by the simulated pilot
 * (Traffic spec 4.5 item 14, TR-R35) shows its decision and configuration,
 * for example `[PFL: Join at Low Key · Gear]`; the badges below are the old
 * phase-only ones.
 *
 * Badges:
 * - `[CRASH SHORT]` (unrecoverable / below glide slope / crashed)
 * - `[PFL: ZOOM]` (during zoom climb/decel)
 * - `[PFL: HIGH KEY]` (joining High Key or orbit)
 * - `[PFL: LOW KEY]` (joining Low Key downwind)
 * - `[PFL: BASE KEY]` (joining Final Key; the old name)
 * - `[PFL: DIRECT]` (gliding direct to threshold)
 * - `[EJECT]` (pilot ejected / ejection initiated)
 *
 * @param {any} ac
 * @returns {string|null}
 */
export function getPflBadge(ac) {
  if (!ac) return null;
  const status = typeof ac.status === 'string' ? ac.status.toLowerCase() : '';
  const phase = typeof ac.phase === 'string' ? ac.phase.toLowerCase() : '';
  const segment = typeof ac.pflSegment === 'string' ? ac.pflSegment.toLowerCase() : '';
  const command = typeof ac.command === 'string' ? ac.command.toLowerCase() : '';

  // Ejected (checked first: an ejected crew marker or abandoned aircraft always bears [EJECT])
  if (
    status === 'ejected' ||
    phase === 'ejected' ||
    phase === 'eject' ||
    phase === 'ejection' ||
    phase === 'pfl_eject' ||
    segment === 'eject' ||
    segment === 'ejected'
  ) {
    return '[EJECT]';
  }

  // Crash short / unrecoverable
  if (
    status === 'crashed' ||
    phase === 'crash_short' ||
    phase === 'pfl_crash' ||
    phase === 'crashed' ||
    phase === 'crash' ||
    segment === 'crash' ||
    segment === 'crash_short'
  ) {
    return '[CRASH SHORT]';
  }

  const marginStr = Number.isFinite(ac.pflMarginFt) ? ` (${ac.pflMarginFt >= 0 ? '+' : ''}${Math.round(ac.pflMarginFt)} ft)` : '';
  if (ac.pflDecision) return ac.config ? `[PFL: ${ac.pflDecision}${marginStr} · ${ac.config}]` : `[PFL: ${ac.pflDecision}${marginStr}]`;

  // The behaviour tag (behaviour.js, TR-60): the pattern, what is next and the configuration, or what the automatic
  // deconfliction is doing with it (deconflict.js) with the configuration added.
  const gliding = ac.engineFailed === true ||
    phase.startsWith('pfl') ||
    phase.includes('crash') ||
    phase.includes('eject') ||
    Boolean(ac.pflFlight) ||
    Boolean(ac.pflRoute) ||
    Boolean(ac.pflSegment);

  if (ac.behaviour && !gliding) return ac.behaviour;
  if (ac.deconflict) return ac.deconflict;

  const active = gliding ||
    command === 'pfl_current' ||
    command === 'engine_fail' ||
    command === 'climb_high_key' ||
    command === 'climb_low_key' ||
    command.startsWith('pfl') ||
    ac.pflActive === true ||
    phase.includes('high_key') ||
    phase.includes('low_key') ||
    phase.includes('base_key') ||
    phase.includes('direct') ||
    phase.includes('zoom') ||
    segment.includes('high_key') ||
    segment.includes('low_key') ||
    segment.includes('base_key') ||
    segment.includes('direct') ||
    segment.includes('zoom') ||
    segment.includes('decel');

  if (!active) return null;

  // 1. Zoom climb / decel
  if (phase === 'pfl_zoom' || phase === 'zoom' || phase === 'pfl_decel' || phase === 'decel' || segment === 'zoom' || segment === 'decel') {
    return '[PFL: ZOOM]';
  }

  // 2. High Key or Orbit
  if (
    phase === 'pfl_high_key' ||
    phase === 'high_key' ||
    phase === 'high_key_run_in' ||
    phase === 'pfl_orbit' ||
    phase === 'orbit' ||
    phase === 'pfl_inbound' ||
    command === 'climb_high_key' ||
    segment === 'high_key'
  ) {
    return '[PFL: HIGH KEY]';
  }

  // 3. Low Key
  if (phase === 'pfl_low_key' || phase === 'low_key' || command === 'climb_low_key' || segment === 'low_key') {
    return '[PFL: LOW KEY]';
  }

  // 4. Base Key
  if (phase === 'pfl_base_key' || phase === 'base_key' || segment === 'base_key') {
    return '[PFL: BASE KEY]';
  }

  // 5. Direct to threshold
  if (
    phase === 'pfl_direct' ||
    phase === 'direct_threshold' ||
    phase === 'pfl_direct_threshold' ||
    phase === 'pfl_final' ||
    phase === 'direct' ||
    phase === 'final' ||
    segment === 'direct' ||
    segment === 'straight' ||
    segment === 'arc' ||
    segment === 'roundout' ||
    segment === 'flare'
  ) {
    return '[PFL: DIRECT]';
  }

  // Fallback heuristic based on altitude / speed if phase is generic ('pfl' or not yet refined)
  const alt = Number.isFinite(ac.altFt) ? ac.altFt : (Number.isFinite(ac.alt) ? ac.alt : PATTERN_ALT_FT);
  const kt = Number.isFinite(ac.kt) ? ac.kt : 120;
  if (alt <= FIELD_ELEV_FT && (status === 'crashed' || status === 'landed')) {
    return '[CRASH SHORT]';
  }
  if (kt > 150) {
    return '[PFL: ZOOM]';
  }
  if (alt >= 4500) {
    return '[PFL: HIGH KEY]';
  }
  if (alt >= 3400) {
    return '[PFL: LOW KEY]';
  }
  if (alt >= 2700) {
    return '[PFL: BASE KEY]';
  }
  return '[PFL: DIRECT]';
}


// ---------------------------------------------------------------------------
// The satellite photo (specs/SPEC-traffic.md: Layers, the Photo section of the settings menu)
//
// V6 draws Esri's tiles scaled by a trim about the field (the anchor), then moved by an east and
// a north offset (drawSatellite). The alignment is those three numbers; the tile loader is the
// ui-kit's. Positions on the photo are latitude and longitude, worked from the anchor in feet.

/** What the map says in place of Esri's credit when no tile of the photo will load. */
export const PHOTO_OFFLINE_TEXT = 'Satellite photo needs a connection. The grid still shows where things are.';

/** The photo's trim and offsets from the settings; a missing or unusable value is true scale and no shift. */
export function photoAlignment(settings) {
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const trim = num(settings.photoTrim, 1);
  return { trim: trim > 0 ? trim : 1, eastFt: num(settings.photoEastFt, 0), northFt: num(settings.photoNorthFt, 0) };
}

/** Where a place on the photo (latitude and longitude) lands on the map, in feet: stretched about the field by the trim, then moved. */
export function photoToWorld(ref, align, lat, lon) {
  const p = latLonToLocalFt(ref, lat, lon);
  return { x: p.x * align.trim + align.eastFt, y: p.y * align.trim + align.northFt };
}

/** The place on the photo that lies under a map point: photoToWorld undone. */
export function worldToPhoto(ref, align, x, y) {
  return localFtToLatLon(ref, (x - align.eastFt) / align.trim, (y - align.northFt) / align.trim);
}

/**
 * What the ui-kit tile layer needs to draw for this view: the corners of the photo that show, the
 * photo's scale in pixels a foot (the map's, times the trim) and lat/lon to screen. map is the canvas view.
 */
export function photoView(map, ref, align) {
  const { minX, minY, maxX, maxY } = map.visibleBounds();
  const corners = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]].map(([x, y]) => worldToPhoto(ref, align, x, y));
  return {
    corners: {
      north: Math.max(...corners.map((c) => c.lat)),
      south: Math.min(...corners.map((c) => c.lat)),
      west: Math.min(...corners.map((c) => c.lon)),
      east: Math.max(...corners.map((c) => c.lon)),
    },
    pxPerFt: map.view.scale * align.trim,
    toScreen: (lat, lon) => {
      const { x, y } = photoToWorld(ref, align, lat, lon);
      return map.worldToScreen(x, y);
    },
  };
}

/** The line about the photo under the map: Esri's credit while it shows, or that it needs a connection. `state` is the tile layer's, or null when the layer is off. */
export function photoCaption(state) {
  if (!state) return '';
  return state.wanted > 0 && state.failed === state.wanted ? PHOTO_OFFLINE_TEXT : ESRI_IMAGERY.credit;
}

// ---------------------------------------------------------------------------
// Drawing

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// map: { worldToScreen(x, y), size: { width, height }, view: { scale }, visibleBounds() } (the ui-kit canvas view).
// layers.photo(ctx): draws the satellite photo, called only when the Satellite photo layer is on, under the
// grid or above it as the settings say, and always under the routes.
export function drawScene(ctx, map, scene, settings, palette, layers = {}) {
  const at = (p) => map.worldToScreen(p.x, p.y);
  const pxPerFt = map.view.scale;
  const flying = scene.aircraft.filter(isFlying);
  const levels = conflictLevels(scene.conflicts ?? []);
  const colours = new Map(scene.aircraft.map((ac) => [ac.id, aircraftColor(ac)]));

  // `anchor` is the screen x of the thing a label sits beside. A label that would run off the
  // right edge of the map goes to the other side of that thing instead, so it can still be read.
  const text = (str, x, y, colour, { size = 11, bold = false, align = 'left', anchor = null } = {}) => {
    ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
    if (anchor !== null && align === 'left' && x + ctx.measureText(str).width > map.size.width - 4) {
      x = 2 * anchor - x;
      align = 'right';
    }
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.halo;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(str, x, y);
  };
  const line = (points, colour, width, dash = [], closed = false) => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...at(p)) : ctx.moveTo(...at(p))));
    if (closed) ctx.closePath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const circle = (x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  };

  const photo = () => {
    if (!settings.layerPhoto || !layers.photo) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (Number.isFinite(settings.photoOpacityPct) ? settings.photoOpacityPct : 100) / 100));
    layers.photo(ctx);
    ctx.restore();
  };
  if (!settings.photoAboveGrid) photo();
  drawGrid(ctx, map, palette, text);
  if (settings.photoAboveGrid) photo();

  // Routes: the line, its name, and the extras the layers switch on.
  const routes = scene.routes.filter((r) => r.visible !== false);
  const picked = scene.selectedRouteId ?? null;
  for (const route of routes) {
    const path = route.path ?? route.points;
    if (path.length < 2) continue;

    const isPat1 = route.id === 'PAT1';
    const hasCalm = Boolean(route.calmPath);
    const showWind = settings.layerWindTrack !== false;
    const showSmm = settings.layerSmmReference !== false;

    if (isPat1 && hasCalm) {
      if (showSmm) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        line(route.calmPath, route.color, 2, [6, 6], !route.open);
        ctx.restore();
      }
      if (showWind) {
        const chosen = route.id === picked;
        ctx.save();
        ctx.globalAlpha = (picked !== null && !chosen ? 0.55 : 1) * lineOpacity(route);
        line(route.path, route.color, (chosen ? 4.5 : 3) * lineScale(route), [], !route.open);
        ctx.restore();
      }
    } else {
      const style = routeStyle(route.kind);
      const chosen = route.id === picked;
      ctx.save();
      ctx.globalAlpha = (picked !== null && !chosen ? 0.55 : 1) * lineOpacity(route);
      line(path, route.color, (chosen ? style.width + 1.5 : style.width) * lineScale(route), style.dash, route.kind === 'pattern' && !route.open);
      ctx.restore();
    }

    const name = labelAnchor(path, route.kind === 'pattern' && !route.open);
    if (name) {
      const [x, y] = at(name);
      text(route.name, x + 6, y - 6, route.color, { size: 12, bold: route.id === picked, anchor: x });
    }

    if (isPat1 && route.windPerch && showWind && settings.layerPoints !== false) {
      const [wx, wy] = at(route.windPerch);
      ctx.save();
      circle(wx, wy, 4.5);
      ctx.fillStyle = '#ff7b72';
      ctx.fill();
      ctx.strokeStyle = palette.halo;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text('Perch (Wind)', wx + 7, wy + 4, '#ff7b72', { size: 10, bold: true, anchor: wx });
      ctx.restore();
    }
  }
  if (settings.layerPflCircle) {
    drawPflGroundCircle(ctx, settings, palette, at, pxPerFt, text, circle);
  }
  if (settings.layerLegDistances) {
    for (const leg of legsToLabel(routes, scene.legs)) {
      const [x, y] = at(leg);
      const label = feetText(leg.ft);
      ctx.font = `700 11px ${FONT}`;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = palette.halo;
      ctx.fillRect(x - w / 2, y - 10, w, 20);
      ctx.strokeStyle = leg.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2, y - 10, w, 20);
      text(label, x, y + 4, palette.text, { bold: true, align: 'center' });
    }
  }
  if (settings.layerTurnData) {
    for (const route of routes) {
      route.points.forEach((pt) => {
        const words = turnLabelText(pt);
        if (!words) return;
        const [x, y] = at(pt);
        text(words, x + 11, y + 29, palette.caution, { anchor: x });
      });
    }
  }
  const chosenRoute = routes.find((r) => r.id === picked);
  if (settings.layerPoints && chosenRoute) drawPoints(ctx, chosenRoute, at, text, palette, circle);

  if (settings.layerTrails) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (const [id, trail] of Object.entries(scene.trails ?? {})) {
      if (trail.length > 1) line(trail, colours.get(id) ?? FALLBACK_COLOR, 1.5);
    }
    ctx.restore();
  }

  // Bubbles and rings first, so the aircraft sit on top of them.
  const marks = markRadiiPx(settings.conflictLatFt, settings.cautionLatFt, pxPerFt);
  for (const ac of flying) {
    const [x, y] = at(ac);
    const level = levels.get(ac.id);
    // The caution ring: round the selected aircraft only (Patrick, 4 Oct: "only the aircraft selected should have the
    // green circle"). A conflict still shows by its bubble and its words.
    const ringed = ac.id === (scene.selectedAircraftId ?? null);
    if (settings.layerCautionRings && ringed) {
      ctx.save();
      const hot = level === 'caution';
      ctx.globalAlpha = hot ? 1 : 0.3;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hot ? palette.caution : colours.get(ac.id);
      ctx.lineWidth = hot ? 2.5 : 1.5;
      circle(x, y, marks.ringPx);
      ctx.stroke();
      ctx.restore();
    }
    if (settings.layerBubbles) {
      ctx.save();
      const hot = level === 'conflict';
      ctx.globalAlpha = hot ? 1 : 0.22;
      ctx.strokeStyle = hot ? palette.bad : colours.get(ac.id);
      ctx.lineWidth = hot ? 3 : 2;
      circle(x, y, marks.bubblePx);
      if (hot) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = palette.bad;
        ctx.fill();
        ctx.restore();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Dynamic Glide Footprint Ring (SMM Ch 13 / PFL forced landing recovery)
  const windFromDeg = settings.windFromDeg ?? scene.windFromDeg ?? 360;
  const windKt = settings.windKt ?? scene.windKt ?? 0;
  for (const ac of flying) {
    if (settings.layerEngineReach !== false && shouldShowGlideFootprint(ac, scene.selectedAircraftId ?? null)) { // the Engine-out reach tick
      const footprint = calculateGlideFootprint(ac, windFromDeg, windKt);
      if (footprint.rGlide > 0) {
        const [scx, scy] = map.worldToScreen(footprint.cx, footprint.cy);
        const rPx = footprint.rGlide * pxPerFt;
        if (rPx > 1) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(scx, scy, rPx, 0, Math.PI * 2);
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Shifted center crosshair indicating wind-drifted glide center
          ctx.beginPath();
          ctx.moveTo(scx - 4, scy);
          ctx.lineTo(scx + 4, scy);
          ctx.moveTo(scx, scy - 4);
          ctx.lineTo(scx, scy + 4);
          ctx.stroke();

          // Tactical HUD range label
          const nmRange = (footprint.rGlide / FT_PER_NM).toFixed(1);
          text(`PFL GLIDE (${nmRange} NM)`, scx, scy - rPx - 4, '#38bdf8', { size: 10, bold: true, align: 'center', anchor: scx });
          ctx.restore();
        }
      }
    }
  }

  // Aircraft: the symbol along its heading, its callsign, height and speed, and the word for any conflict.
  for (const ac of flying) {
    const [x, y] = at(ac);
    const colour = colours.get(ac.id);
    ctx.beginPath();
    aircraftSymbol(ac.headingDeg, aircraftSymbolPx(pxPerFt, settings?.aircraftScale)).forEach(([dx, dy], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.halo;
    ctx.stroke();
    text(ac.id, x + 12, y - 8, colour, { size: 12, bold: true, anchor: x });
    if (settings.layerLabels) text(heightSpeedText(ac), x + 12, y + 7, palette.text, { anchor: x });
    const level = levels.get(ac.id);
    if (level) text(LEVEL_MARKS[level], x + 12, y + 21, level === 'conflict' ? palette.bad : palette.caution, { bold: true, anchor: x });
    const pflBadge = getPflBadge(ac);
    if (pflBadge) {
      const badgeY = level ? y + 33 : (settings.layerLabels ? y + 21 : y + 7);
      text(pflBadge, x + 12, badgeY, pflBadge === '[CRASH SHORT]' ? palette.bad : '#38bdf8', { size: 10, bold: true, anchor: x });
    }
  }

  // Where an aircraft ejected (Traffic spec 4.5 item 10): the aircraft is gone, a marker stays, and the parachute
  // drifts down with the wind from there (TR-75; ejection.js).
  for (const ac of scene.aircraft) {
    if (ac.status !== 'ejected' || !ac.ejectAt) continue;
    const [x, y] = at(ac.ejectAt);
    text(`✕ ${ac.id} EJECT`, x, y, palette.bad, { size: 12, bold: true, align: 'center', anchor: x });
    if (!Number.isFinite(ac.ejectAt.t) || !Number.isFinite(scene.t) || scene.t < ac.ejectAt.t) continue;
    const st = ejectionAt({ ...ac.ejectAt, alt: trueAltFt(ac.ejectAt.alt) }, scene.t - ac.ejectAt.t, { windFromDeg: scene.windFromDeg, windKt: scene.windKt }, FIELD_ELEV_FT);
    const [px, py] = at(st.person);
    ctx.save();
    ctx.strokeStyle = palette.bad;
    ctx.fillStyle = '#f97316';
    ctx.lineWidth = 1.5;
    if (st.chuteOpen > 0 || st.down) {
      // A canopy over the pilot: open in the air, flat on the ground.
      const r = 7 * Math.max(0.3, st.down ? 1 : st.chuteOpen);
      ctx.beginPath();
      if (st.down) ctx.ellipse(px + 8, py, r, 2.5, 0, 0, Math.PI * 2);
      else ctx.arc(px, py - 9, r, Math.PI, 0);
      ctx.fill();
      if (!st.down) {
        ctx.beginPath();
        ctx.moveTo(px - r, py - 9); ctx.lineTo(px, py);
        ctx.moveTo(px + r, py - 9); ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = palette.bad;
    ctx.fill();
    ctx.restore();
  }

  drawWind(ctx, map, settings, palette, text);
}

function drawGrid(ctx, map, palette, text) {
  const step = gridStepFt(map.view.scale);
  const { xs, ys } = gridLines(map.visibleBounds(), step);
  const { width, height } = map.size;
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xs) {
    const [sx] = map.worldToScreen(x, 0);
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (const y of ys) {
    const [, sy] = map.worldToScreen(0, y);
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
  text(gridLabel(step), 8, height - 8, palette.muted);
}

// The selected route's points: a circle, or a diamond at a decision point, with their labels.
function drawPoints(ctx, route, at, text, palette, circle) {
  route.points.forEach((pt, i) => {
    const [x, y] = at(pt);
    ctx.beginPath();
    if (pt.decision) {
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
    } else circle(x, y, 6);
    ctx.fillStyle = route.color;
    ctx.fill();
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const words = pointLabelLines(i, pt);
    text(words.title, x + 11, y - 9, palette.text, { anchor: x });
    if (words.detail) text(words.detail, x + 11, y + 17, palette.muted, { size: 10, anchor: x }); // below the line, so a level leg doesn't run through it
  });
}

// The wind arrow and "Wind 241°M 20 kt" in the top right corner, only when it isn't calm.
function drawWind(ctx, map, settings, palette, text) {
  const words = windText(settings.windFromDeg, settings.windKt);
  if (!words) return;
  const { width } = map.size;
  ctx.beginPath();
  const arrow = turnedShape(WIND_ARROW_SHAPE, windBlowsTowardDeg(settings.windFromDeg), 14);
  arrow.forEach(([dx, dy], i) => (i ? ctx.lineTo(width - 28 + dx, 30 + dy) : ctx.moveTo(width - 28 + dx, 30 + dy)));
  ctx.closePath();
  ctx.fillStyle = palette.text;
  ctx.fill();
  text(words, width - 50, 34, palette.text, { size: 13, bold: true, align: 'right' });
}

/**
 * Where the PFL ground circle for Runway 29L and its keys are, in map feet: one place for the 2D map and
 * the 3D view. The 1/2 NM radius (1 NM diameter) circle sits 90° left of the runway (298° − 90° = 208° true)
 * with High Key over the threshold, Low Key 1 NM abeam it and Final Key 270° round the circle.
 */
export function pflCircleLayout() {
  const th = THRESHOLD_29L;
  const radiusFt = PFL_CIRCLE_RADIUS_FT; // 0.5 NM radius (1.0 NM diameter = 6076 ft)
  const rad208 = (208 * Math.PI) / 180;
  const nLeftX = Math.sin(rad208); // -0.469472 (West)
  const nLeftY = Math.cos(rad208); // -0.882948 (South)
  const center = { x: th.x + radiusFt * nLeftX, y: th.y + radiusFt * nLeftY };
  const lowKey = { x: th.x + 2 * radiusFt * nLeftX, y: th.y + 2 * radiusFt * nLeftY };
  const rad118 = (118 * Math.PI) / 180; // Final Key: 270° round the circle, bearing 118° from its centre
  const finalKey = { x: center.x + radiusFt * Math.sin(rad118), y: center.y + radiusFt * Math.cos(rad118) };
  return { highKey: { x: th.x, y: th.y }, center, radiusFt, lowKey, finalKey };
}

// Draws the 1/2 NM radius (1 NM diameter) PFL circle on the ground for Runway 29L.
export function drawPflGroundCircle(ctx, settings, palette, at, pxPerFt, text, circle) {
  const layout = pflCircleLayout();
  const th = layout.highKey;
  const radiusFt = layout.radiusFt;
  const cxFt = layout.center.x;
  const cyFt = layout.center.y;
  const [cx, cy] = at({ x: cxFt, y: cyFt });
  const rPx = radiusFt * pxPerFt;
  const lkPt = layout.lowKey;
  const bkPt = layout.finalKey;

  // 1. PFL ground circle (0.5 NM radius / 1.0 NM diameter)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 155, 206, 0.08)';
  circle(cx, cy, rPx);
  ctx.fill();

  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = '#ff9bce';
  ctx.lineWidth = 2.5;
  circle(cx, cy, rPx);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center mark and title
  circle(cx, cy, 3);
  ctx.fillStyle = '#ff9bce';
  ctx.fill();
  text('PFL Circle (0.5 NM Radius / 1.0 NM Dia)', cx, cy - 8, '#ff9bce', { size: 11, bold: true, align: 'center' });
  ctx.restore();

  // 2. Reference Spoke: 1.0 NM (90° Left of Runway Threshold)
  const [thX, thY] = at(th);
  const [lkX, lkY] = at(lkPt);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(thX, thY);
  ctx.lineTo(lkX, lkY);
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  const midSpokeX = (thX + lkX) / 2;
  const midSpokeY = (thY + lkY) / 2;
  text('1.0 NM (90° Left)', midSpokeX - 12, midSpokeY, '#ff6b6b', { size: 10, bold: true, align: 'right' });
  ctx.restore();

  // 3. Key Points on the PFL pattern
  if (settings.layerPoints !== false) {
    // High Key (0° of turn, over threshold at 5,000 ft MSL)
    ctx.save();
    circle(thX, thY, 5);
    ctx.fillStyle = '#ff9bce';
    ctx.fill();
    ctx.strokeStyle = palette.halo;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text('HIGH KEY (5,000\' MSL)', thX + 10, thY - 5, '#ff9bce', { size: 11, bold: true, anchor: thX });
    text('Over Threshold / Clean 125 kt', thX + 10, thY + 9, palette.muted, { size: 9, anchor: thX });
    ctx.restore();

    // Low Key (180° around circle, 1 NM 90° left of threshold at 3,700 ft MSL)
    // Red oval matching the section line road
    ctx.save();
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(lkX, lkY, 14, 8, Math.PI / 12, 0, Math.PI * 2);
    ctx.stroke();
    circle(lkX, lkY, 4);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    text('LOW KEY (3,700\' MSL)', lkX + 18, lkY - 5, '#ff6b6b', { size: 11, bold: true, anchor: lkX });
    text('1.0 NM abeam / T/O flap 120 kt', lkX + 18, lkY + 9, palette.muted, { size: 9, anchor: lkX });
    ctx.restore();

    // Final Key (270° around the circle, about 3,000 ft MSL, 1,000 ft AGL; SMM 13.9 para 18)
    // Blue marker matching Patrick's blue scribble
    const [bkX, bkY] = at(bkPt);
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    circle(bkX, bkY, 6.5);
    ctx.stroke();
    circle(bkX, bkY, 3.5);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    text('FINAL KEY (3,000\' MSL)', bkX + 12, bkY - 5, '#38bdf8', { size: 11, bold: true, anchor: bkX });
    text('Landing flap / 120 kt', bkX + 12, bkY + 9, palette.muted, { size: 9, anchor: bkX });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The view

/**
 * canvas: the map's <canvas>. timers: the module's scheduler scope.
 * scene(): the routes, aircraft, conflicts and trails to draw now (see the top of this file).
 * settings(): the traffic settings (layers, conflict limits, wind).
 * anchor(): the setup's { lat, lon }, where the photo is centred (no anchor, no photo).
 * onPhoto(state): after a draw, when the photo's state changed: the tile layer's { wanted, ready, failed },
 * or null while the layer is off, for the credit line. makeImage: for tests.
 * Returns { requestDraw, refreshColours, fit, fitAll, view, worldToScreen, screenToWorld, dispose }: ask for a draw
 * whenever the scene or a setting changes; the rest is the canvas view's own, for the editor.
 */
export function createMap2d(canvas, {
  timers, scene, settings,
  anchor = /** @type {() => ({ lat: number, lon: number } | null | undefined)} */ (() => null),
  onPhoto = /** @type {(state: any) => void} */ (() => {}),
  makeImage = undefined,
}) {
  let fitted = false;
  let imagery = null; // the photo's tile layer, made the first time the layer is on (nothing is fetched while it is off)
  let shownPhoto = 'unset';
  let fitAllNext = false; // a Fit all pressed while the map had no size
  let palette = null; // the page's colours, read once and kept until refreshColours()
  const colours = () => {
    if (!palette) {
      const style = globalThis.getComputedStyle(canvas);
      palette = paletteFrom((name) => style.getPropertyValue(name).trim());
    }
    return palette;
  };

  const fitTo = (data, all = false) => {
    const bounds = all ? sceneBounds(data.routes, data.aircraft) : focusBounds(data.routes, data.aircraft);
    if (bounds) map.fit(bounds, FIT_PADDING_PX);
  };

  const map = createCanvasView(canvas, {
    timers,
    minSpan: MAP_MIN_SPAN_FT,
    maxSpan: MAP_MAX_SPAN_FT,
    label: 'Traffic pattern map: drag to move, scroll or press + and − to zoom',
    draw(ctx) {
      const data = scene();
      // The first draw with something to show and a size to fit to frames the pattern and the aircraft near it.
      if (!fitted && map.size.width > 1 && (data.routes.length || data.aircraft.length)) {
        fitted = true;
        fitTo(data, fitAllNext);
        fitAllNext = false;
      }
      const options = settings();
      const at = anchor();
      const photoOn = Boolean(options.layerPhoto && at && map.size.width > 1);
      const align = photoAlignment(options);
      const ref = at ? makeLocalRef(at.lat, at.lon) : null;
      if (photoOn) imagery ??= createTileLayer({ source: ESRI_IMAGERY, timers, onChange: () => map.requestDraw(), ...(makeImage ? { makeImage } : {}) });
      drawScene(ctx, map, data, options, colours(), photoOn ? { photo: (c) => imagery.draw(c, photoView(map, ref, align)) } : {});
      const state = photoOn ? imagery.state() : null;
      const key = state ? `${state.wanted}/${state.ready}/${state.failed}` : null;
      if (key !== shownPhoto) {
        shownPhoto = key;
        onPhoto(state ? { ...state } : null);
      }
    },
  });

  return {
    requestDraw: map.requestDraw,
    get view() {
      return map.view;
    },
    worldToScreen: map.worldToScreen,
    screenToWorld: map.screenToWorld,
    /** Reads the page's colours again and redraws; for when the theme changes. */
    refreshColours() {
      palette = null;
      map.requestDraw();
    },
    /** Frames the pattern and the aircraft near it. A map that has no size yet (hidden) does it at its next draw. */
    fit() {
      fitAllNext = false;
      if (map.size.width > 1) fitTo(scene());
      else fitted = false;
    },
    /** Frames every route, the long entries too. */
    fitAll() {
      if (map.size.width > 1) fitTo(scene(), true);
      else {
        fitted = false;
        fitAllNext = true;
      }
    },
    dispose() {
      imagery?.dispose();
      imagery = null;
      map.dispose();
    },
  };
}
