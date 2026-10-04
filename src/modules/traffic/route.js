// Route geometry for the Traffic Pattern Sim: what a route is, how its turns are
// rounded, how long it is, where a point sits along it, and V6's builders for a new
// pattern, entry and split (SPEC-traffic, "Routes (route.js)").
//
// It started as V6's own model (R9); V6 is now a source of ideas only, and the
// flying numbers are checked against the manuals (AGENTS.md). Line numbers refer
// to V6's decoded Traffic page (traffic.html). Nothing here reads the page, a setting or the clock:
// routes and options come in as plain values.
//
// Positions are feet, x east and y north (V6 had y pointing south: the built-in data
// was flipped once). A route point is { label, x, y, alt, kt, g }: height in feet,
// speed in knots, the G of the turn there. Turn maths comes from `core`.
//
// A route's path is worked out once and kept (V6 rebuilt every rounded route several
// times per aircraft per frame, #49). The cache looks at the route's points each time
// it is asked, so a point edited in place gives a new path.
import { FT_PER_NM, ktToFtps } from '../../core/units.js';
import { limitG, turnRadiusFt, bankDegFromG, gFromBankDeg, turnRateFromBankRadPerSec } from '../../core/flight-math.js';
import { unitVectorFromCompassDeg, compassDegFromVector } from '../../core/angles.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { RUNWAY_29L_HDG_DEG, FIELD_ELEV_FT, THRESHOLD_DATA_ELEV_FT, PFL_CIRCLE_RADIUS_FT } from './airfield.js';

/** V6's route options when the boxes are left alone (built-in profile, line 613). */
export const DEFAULT_ROUTE_OPTIONS = Object.freeze({ flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 });

/** The colours V6 hands to new routes in turn (`palette`, line 140). */
export const ROUTE_COLORS = Object.freeze(['#58a6ff', '#bc8cff', '#7ee787', '#ffcc66', '#56d4dd', '#ff6b6b', '#d29922', '#ff9bce', '#a5d6ff', '#d8dee9']);

/** The colour V6 gives the next route: the palette in turn (`palette[routes.length % palette.length]`). */
export function nextRouteColor(routes) {
  return ROUTE_COLORS[routes.length % ROUTE_COLORS.length];
}

/** A pattern is a closed loop; entries and splits are open lines (V6 `closed`, kept in step with the kind). */
export function isClosedRoute(route) {
  return route.kind === 'pattern';
}

// ── Little vectors (V6 lines 143 to 150) ─────────────────────────────────────

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function norm(v) {
  const length = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / length, y: v.y / length };
}

/** A route point with V6's defaults (`pt`, line 143): 2,500 ft, 120 kt, 2 G. */
function point(x, y, alt = 2500, kt = 120, label = '', g = 2) {
  return { label, x, y, alt, kt, g };
}

/**
 * V6's `perp(v, 'left')`. V6 draws with y pointing down, so what it calls left is
 * a turn to the right on the north-up map: clockwise, when y is north.
 */
const rightOf = (v) => ({ x: v.y, y: -v.x });
/** V6's `perp(v, 'right')`: a turn to the left on the north-up map. */
const leftOf = (v) => ({ x: -v.y, y: v.x });

/**
 * Where a fraction `u` of the way along a leg is (V6 `lerp`, line 145): height, speed and
 * G blended evenly between the two ends, missing values read as V6's defaults. `seg` and
 * `headingDeg` are the leg's, and go into the answer so it is made in one piece.
 */
function lerp(a, b, u, seg, headingDeg) {
  const alt = a.alt ?? 2500, kt = a.kt ?? 120, g = a.g ?? 2;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    alt: alt + ((b.alt ?? 2500) - alt) * u,
    kt: kt + ((b.kt ?? 120) - kt) * u,
    g: g + ((b.g ?? 2) - g) * u,
    seg, u, headingDeg,
    phase: a.phase ?? b.phase,
    tag: u < 0.5 ? (a.tag ?? b.tag) : (b.tag ?? a.tag),
  };
}

// ── The path ─────────────────────────────────────────────────────────────────

/**
 * Turn radius in feet at a route point (V6 `pointTurnRadius`, line 149): worked out
 * from the point's speed and G (G limited to 1.01 to 9, a blank speed read as 120 kt
 * and a blank G as 2), or the manual radius (a blank one read as 1,800 ft).
 */
export function pointTurnRadiusFt(p, { radiusFromG, manualRadiusFt }) {
  if (!radiusFromG) return +manualRadiusFt || 1800;
  return turnRadiusFt(ktToFtps(+p.kt || 120), limitG(+p.g || 2, 9));
}

/**
 * What the turn at a route point needs, as the map's turn data shows it (V6 line 283):
 * `radiusFt` from `pointTurnRadiusFt` and `bankDeg` from the point's G (limited to 1.01
 * to 9, a blank G read as 2).
 */
export function turnAtPoint(p, options = DEFAULT_ROUTE_OPTIONS) {
  return { radiusFt: pointTurnRadiusFt(p, options), bankDeg: bankDegFromG(limitG(+p.g || 2, 9)) };
}

/**
 * The turn at point `i` of a route, or `null` where V6 shows none (line 283): the first
 * point of a pattern, and the first and last of an entry or split (bug #49, kept for now).
 * `i` counts from 0.
 */
export function pointTurn(route, i, options = DEFAULT_ROUTE_OPTIONS) {
  const count = route.points.length;
  if (!(i > 0 && (isClosedRoute(route) || i < count - 1)) || i >= count) return null;
  return turnAtPoint(route.points[i], options);
}

/** A point on a turn's curve (V6 `bez`, line 193): the quadratic Bézier of the two ends and the corner. */
function bez(a, b, c, u) {
  const v = 1 - u;
  return {
    x: v * v * a.x + 2 * v * u * b.x + u * u * c.x,
    y: v * v * a.y + 2 * v * u * b.y + u * u * c.y,
    alt: v * v * (a.alt ?? 2500) + 2 * v * u * (b.alt ?? 2500) + u * u * (c.alt ?? 2500),
    kt: v * v * (a.kt ?? 120) + 2 * v * u * (b.kt ?? 120) + u * u * (c.kt ?? 120),
    g: b.g ?? 2,
    src: b.src ?? 0,
    tag: b.tag,
  };
}

/** A route point as the path keeps it: its place, height, speed and G, and which point it came from. */
const pathPoint = (p, src) => ({ x: p.x, y: p.y, alt: p.alt, kt: p.kt, g: p.g, src, tag: p.tag });

function circularArcPoints(start, cur, end, vin, vout, turn, steps, d, radius, nextAlt) {
  const z = vin.x * vout.y - vin.y * vout.x;
  const nin = z > 0 ? { x: -vin.y, y: vin.x } : { x: vin.y, y: -vin.x };
  const R = d / Math.tan(turn / 2);
  const C = { x: start.x + R * nin.x, y: start.y + R * nin.y };
  const a0 = Math.atan2(start.y - C.y, start.x - C.x);
  const sweep = z > 0 ? turn : -turn;

  const startAlt = start.alt ?? 2500;
  const endAlt = nextAlt ?? startAlt;

  const pts = [];
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const ang = a0 + sweep * u;
    const alt = startAlt + (endAlt - startAlt) * u;
    pts.push({
      x: C.x + R * Math.cos(ang),
      y: C.y + R * Math.sin(ang),
      alt,
      kt: cur.kt ?? 120,
      g: cur.g ?? 2,
      src: cur.src ?? 0,
      tag: cur.tag,
    });
  }
  return pts;
}

/**
 * The route with its turns rounded (V6 `roundedPoints`, lines 194 to 214; D46 circular arcs).
 *
 * At each point where the route turns by more than 0.08 rad (about 4.6°) the aircraft
 * starts turning a distance d before the point and finishes d after it, where
 * d = R × tan(turn ÷ 2) but never more than 45 % of either leg. The first and last
 * points of an entry or split don't round. Each point of the result says which route
 * point it belongs to (`src`), and carries the height, speed and G there.
 */
function buildRoundedPoints(route, options) {
  const closed = isClosedRoute(route);
  const pts = route.points, n = pts.length;
  if (!options.flyRoundedTurns || n < 3) {
    const plain = pts.map((p, i) => pathPoint(p, i));
    return closed && n ? [...plain, pathPoint(pts[0], 0)] : plain;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i], prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) { out.push(pathPoint(cur, i)); continue; }
    const vin = norm(sub(cur, prev)), vout = norm(sub(next, cur));
    const dot = Math.max(-1, Math.min(1, vin.x * vout.x + vin.y * vout.y));
    const turn = Math.acos(dot);
    if (!isFinite(turn) || turn < 0.08) { out.push(pathPoint(cur, i)); continue; }
    const radius = pointTurnRadiusFt(cur, options);
    const d = Math.min(radius * Math.tan(turn / 2), dist(prev, cur) * 0.45, dist(cur, next) * 0.45);

    // TR-02 / D382: PAT1 final turn descends continuously from Perch (3500) to Base (2810) to Window (2119)
    const isPat1Final11 = route.id === 'PAT1' && i === 11 && options.trueArcs;
    const isPat1Final12 = route.id === 'PAT1' && i === 12 && options.trueArcs;
    const curAlt = isPat1Final12 ? 2810 : cur.alt;
    const turnTargetAlt = isPat1Final11 ? 2810 : (isPat1Final12 ? 2119 : next.alt);

    const start = { ...add(cur, mul(vin, -d)), alt: curAlt, kt: cur.kt, g: cur.g, src: i, tag: cur.tag };
    const end = { ...add(cur, mul(vout, d)), alt: turnTargetAlt, kt: cur.kt, g: cur.g, src: i, tag: cur.tag };
    out.push(start);
    const steps = options.trueArcs
      ? Math.max(16, Math.min(48, Math.ceil(turn * 20)))
      : Math.max(5, Math.min(28, Math.ceil(turn * 10)));
    if (options.trueArcs) {
      const arc = circularArcPoints(start, { ...cur, alt: curAlt, src: i, tag: cur.tag }, end, vin, vout, turn, steps, d, radius, turnTargetAlt);
      for (const p of arc) out.push(p);
    } else {
      for (let k = 1; k <= steps; k++) out.push(bez(start, { ...cur, src: i, tag: cur.tag }, end, k / steps));
    }
  }
  if (options.trueArcs && route.id === 'PAT1') {
    // Overhead break: V² aerodynamic drag deceleration (220 to 140 KIAS)
    const breakStartIdx = out.findIndex((p) => p.src === 9);
    const breakEndIdx = out.findLastIndex((p) => p.src === 10);
    if (breakStartIdx >= 0 && breakEndIdx > breakStartIdx) {
      let totalD = 0;
      for (let k = breakStartIdx; k < breakEndIdx; k++) totalD += dist(out[k], out[k + 1]);
      let runD = 0;
      for (let k = breakStartIdx; k < breakEndIdx; k++) {
        runD += dist(out[k], out[k + 1]);
        const u = totalD ? runD / totalD : 1;
        out[k + 1].kt = Math.round(220 * Math.exp(-0.452 * u));
      }
    }

    // Final turn: continuous descending turn with symmetric cubic easing ((3500 + 2119)/2 = 2809.5 ft)
    const firstIdx = out.findIndex((p) => p.src === 11);
    const lastIdx = out.findLastIndex((p) => p.src === 12);
    if (firstIdx >= 0 && lastIdx > firstIdx) {
      let totalD = 0;
      for (let k = firstIdx; k < lastIdx; k++) totalD += dist(out[k], out[k + 1]);
      let runD = 0;
      const startAlt = 3500, endAlt = 2119;
      out[firstIdx].alt = startAlt;
      for (let k = firstIdx; k < lastIdx; k++) {
        runD += dist(out[k], out[k + 1]);
        const u = totalD ? runD / totalD : 1;
        const easedU = u + 0.05 * u * (1 - u) * (1 - 2 * u);
        out[k + 1].alt = startAlt + (endAlt - startAlt) * easedU;
      }
    }
  }
  if (route.id === 'PAT1') {
    for (const p of out) {
      const src = p.src ?? 0;
      if (src < 9) p.phase = 'initial';
      else if (src === 9) p.phase = 'break';
      else if (src === 10) { p.phase = 'downwind'; p.kt = 140; }
      else if (src === 11) p.phase = 'final_turn';
      else if (src === 12) p.phase = 'final';
      else p.phase = 'initial';
    }
  }
  if (closed && out.length) out.push({ ...out[0] });
  return out;
}

/** Compass heading, degrees from north, of a leg that goes dx east and dy north. */
const compassDeg = compassDegFromVector;

/** The path's legs (V6 `navSegs`, line 215), each with the heading it is flown on. */
function buildSegs(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = dist(a, b);
    segs.push({ a, b, len, i: a.src ?? i, headingDeg: len ? compassDeg(b.x - a.x, b.y - a.y) : NaN });
  }
  // A leg of no length has no direction of its own: it takes the one before it, or after it.
  let heading = segs.find((s) => !Number.isNaN(s.headingDeg))?.headingDeg ?? 0;
  for (const s of segs) {
    if (Number.isNaN(s.headingDeg)) s.headingDeg = heading;
    else heading = s.headingDeg;
  }
  return segs;
}

function buildPath(route, options) {
  let points;
  const isPat1 = route.id === 'PAT1';
  const isCompactPat1 = isPat1 && (route.points?.length ?? 0) < 10;
  const isPfl = route.id === 'ENT4' || route.id === 'PFL' || route.id === 'PFL_HIGH_KEY' || route.kind === 'pfl' || /pfl/i.test(route.name);
  if (options.flyRoundedTurns !== false && isPfl) {
    points = generatePflTrack(route, options.windFromDeg ?? 360, options.windKt ?? 0, options);
  } else if (options.flyRoundedTurns !== false && (isCompactPat1 || (isPat1 && (options.trueArcs || (options.windKt ?? 0) > 0)))) {
    points = generateWindAdjustedTrack(route, options.windFromDeg ?? 360, options.windKt ?? 0, options);
  } else {
    points = buildRoundedPoints(route, options);
  }
  const segs = buildSegs(points);
  return { lengthFt: segs.reduce((sum, s) => sum + s.len, 0), closed: isClosedRoute(route), points, segs, draw: null, pointDists: new Map() };
}

// What a path was worked out from, so it is redone only when that changes.
const pathCache = new WeakMap();
const MOST_PATHS_PER_ROUTE = 6;

function signatureOf(route, options) {
  const sig = [route.kind, options.flyRoundedTurns, options.radiusFromG, options.manualRadiusFt, options.trueArcs, options.windKt ?? 0, options.windFromDeg ?? 360];
  for (const p of route.points) sig.push(p.x, p.y, p.alt, p.kt, p.g);
  return sig;
}

function sameSignature(entry, route, options) {
  const sig = entry.sig, pts = route.points;
  if (sig.length !== 7 + 5 * pts.length) return false;
  if (sig[0] !== route.kind || !Object.is(sig[1], options.flyRoundedTurns) || !Object.is(sig[2], options.radiusFromG) || !Object.is(sig[3], options.manualRadiusFt) || !Object.is(sig[4], options.trueArcs) || !Object.is(sig[5], options.windKt ?? 0) || !Object.is(sig[6], options.windFromDeg ?? 360)) return false;
  for (let i = 0, k = 7; i < pts.length; i++, k += 5) {
    const p = pts[i];
    if (!Object.is(sig[k], p.x) || !Object.is(sig[k + 1], p.y) || !Object.is(sig[k + 2], p.alt) || !Object.is(sig[k + 3], p.kt) || !Object.is(sig[k + 4], p.g)) return false;
  }
  return true;
}

/**
 * The flown path of a route: `{ lengthFt, closed, points, segs }`, where `points`
 * are V6's rounded points (`{ x, y, alt, kt, g, src }`) and `segs` V6's legs
 * (`{ a, b, len, i, headingDeg }`, `i` being the route point the leg starts at).
 * Worked out once per route and options; read only. It also carries `draw` and
 * `pointDists`, which are `drawPath` and `pointDistFt`'s caches: internal, leave them be.
 */
export function routePath(route, options = DEFAULT_ROUTE_OPTIONS) {
  let entries = pathCache.get(route);
  if (!entries) pathCache.set(route, entries = []);
  for (const entry of entries) if (sameSignature(entry, route, options)) return entry.path;
  const path = buildPath(route, options);
  entries.push({ sig: signatureOf(route, options), path });
  if (entries.length > MOST_PATHS_PER_ROUTE) entries.shift();
  return path;
}

/** The route with its turns rounded (V6 `roundedPoints`). */
export function roundedPoints(route, options = DEFAULT_ROUTE_OPTIONS) {
  return routePath(route, options).points;
}

/** The legs of the flown path (V6 `navSegs`). */
export function navSegs(route, options = DEFAULT_ROUTE_OPTIONS) {
  return routePath(route, options).segs;
}

/** Length of the flown path in feet (V6 `routeLen`, line 216). */
export function routeLengthFt(route, options = DEFAULT_ROUTE_OPTIONS) {
  return routePath(route, options).lengthFt;
}

/**
 * Distance along the flown path to where the turn at route point `index` starts
 * (V6 `pointProg`, line 217); 0 for the first point.
 */
export function pointDistFt(route, index, options = DEFAULT_ROUTE_OPTIONS) {
  const path = routePath(route, options);
  let sum = path.pointDists.get(index); // the sim asks for the same few points every step
  if (sum === undefined) {
    sum = 0;
    for (const s of path.segs) {
      if ((s.a.src ?? 0) >= index) break;
      sum += s.len;
    }
    path.pointDists.set(index, sum);
  }
  return sum;
}

/**
 * Where an aircraft is after flying `distFt` along the route (V6 `posOnRoute`, line 218):
 * `{ x, y, alt, kt, g, seg, u, headingDeg }`. `seg` is the route point the leg starts
 * at, `u` how far along the leg (0 to 1), `headingDeg` the leg's direction. A pattern
 * wraps round; an open route stops at its ends.
 */
export function posOnRoute(route, distFt, options = DEFAULT_ROUTE_OPTIONS) {
  const { segs, lengthFt: total, closed } = routePath(route, options);
  const pts = route.points;
  if (!segs.length) {
    const p = pts[0] ?? point(0, 0);
    return { x: p.x, y: p.y, alt: p.alt, kt: p.kt, g: p.g, seg: 0, u: 0, headingDeg: 0, tag: p.tag };
  }
  let f = closed ? (((distFt % total) + total) % total) : Math.max(0, Math.min(distFt, total));
  for (const s of segs) {
    if (f <= s.len) {
      const u = s.len ? f / s.len : 0;
      return lerp(s.a, s.b, u, s.i, s.headingDeg);
    }
    f -= s.len;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, alt: last.alt, kt: last.kt, g: last.g, seg: pts.length - 1, u: 1, headingDeg: segs[segs.length - 1].headingDeg, tag: last.tag };
}

/** Distance along the flown path of the place nearest to `target` (V6 `closestProg`, line 224). */
export function closestDistFt(route, target, options = DEFAULT_ROUTE_OPTIONS) {
  let best = { d: Infinity, dist: 0 }, run = 0;
  for (const s of navSegs(route, options)) {
    const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y, l2 = vx * vx + vy * vy;
    const u = l2 ? Math.max(0, Math.min(1, ((target.x - s.a.x) * vx + (target.y - s.a.y) * vy) / l2)) : 0;
    const px = s.a.x + vx * u, py = s.a.y + vy * u, d = Math.hypot(target.x - px, target.y - py);
    if (d < best.d) best = { d, dist: run + s.len * u };
    run += s.len;
  }
  return best.dist;
}

/** Where an aircraft is after `distFt` along the route, for the screen: `posOnRoute` and the leg counted from 1. */
export function positionAt(route, distFt, options = DEFAULT_ROUTE_OPTIONS) {
  const p = posOnRoute(route, distFt, options);
  return { x: p.x, y: p.y, alt: p.alt, kt: p.kt, g: p.g, headingDeg: p.headingDeg, leg: p.seg + 1 };
}

/** The flown path as points to draw: `[{ x, y, alt }]` (the rounded turns V6 draws, 5 to 28 steps each). */
export function drawPath(route, options = DEFAULT_ROUTE_OPTIONS) {
  const path = routePath(route, options);
  path.draw ??= path.points.map((p) => ({ x: p.x, y: p.y, alt: p.alt ?? 2500 }));
  return path.draw;
}

/**
 * The legs of the route as its points are joined, before any rounding (V6 `rawSegs`,
 * line 192, and the Leg Distances table, line 464): points counted from 1, a pattern's
 * last leg going back to point 1 (a pattern of two points has both legs, there and
 * back, as V6 draws it). Each leg also says which route it is on and where its middle
 * is (`x`, `y`, feet), where the map puts the leg's label (V6 line 282).
 */
export function legDistances(route) {
  const pts = route.points, n = pts.length, legs = [];
  if (n < 2) return legs;
  const count = n - (isClosedRoute(route) ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const ft = dist(pts[i], pts[(i + 1) % n]);
    const a = pts[i], b = pts[(i + 1) % n];
    legs.push({ routeId: route.id, from: i + 1, to: i + 2 > n ? 1 : i + 2, ft, nm: ft / FT_PER_NM, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return legs;
}

// ── New routes: V6's builders (lines 160 to 176) ─────────────────────────────

const routeById = (routes, id) => routes.find((r) => r.id === id);

/**
 * A new pattern (V6 `defaultPattern`, line 160): an 8,000 ft runway on 290° centred on
 * the airfield, 9,000 ft upwind, 5,000 ft out, at 2,000 to 2,500 ft and 95 to 130 kt.
 * `offsetEastFt` and `offsetNorthFt` move the whole pattern. It lands 20 % of the
 * time each lap. (V6 calls the side of the circuit "left" because its y points down;
 * on the map it is the right-hand side of the landing direction.)
 */
export function newPattern(id, name, { offsetEastFt = 0, offsetNorthFt = 0, color = ROUTE_COLORS[0] } = {}) {
  const heading = 290, runwayFt = 8000, outFt = 5000, upwindFt = 9000, finalFt = 7500;
  const along = unitVectorFromCompassDeg(heading), side = rightOf(along);
  const threshold = mul(along, -runwayFt / 2), departure = mul(along, runwayFt / 2);
  const upwind = add(departure, mul(along, upwindFt));
  const at = (v, alt, kt, label) => point(v.x + offsetEastFt, v.y + offsetNorthFt, alt, kt, label);
  return {
    id, name, kind: 'pattern', visible: true, color, landOdds: 0.2,
    points: [
      at(threshold, 2000, 95, 'Threshold / Final'),
      at(departure, 2000, 110, 'Departure End'),
      at(upwind, 2500, 130, 'Upwind'),
      at(add(upwind, mul(side, outFt)), 2500, 130, 'Crosswind'),
      at(add(add(threshold, mul(along, -finalFt * 0.35)), mul(side, outFt)), 2500, 120, 'Downwind'),
      at(add(threshold, mul(along, -finalFt)), 2200, 105, 'Final Entry'),
    ],
  };
}

/**
 * A new entry (V6 `defaultEntry`, line 165): a line in from 12,000 ft out that ends on
 * the pattern's sixth point (or its last, if it has fewer). `patternId` says which
 * pattern; if it isn't in `routes`, the first pattern is used.
 */
export function newEntry(id, name, patternId, routes, { color = nextRouteColor(routes) } = {}) {
  const pattern = routeById(routes, patternId) || routes.find((r) => r.kind === 'pattern');
  const count = pattern?.points.length || 1;
  const mergeIndex = Math.min(5, count - 1);
  const merge = pattern?.points[mergeIndex] || point(0, 0);
  const before = pattern?.points[Math.max(0, mergeIndex - 1)] || point(-1000, 0);
  const dir = norm(sub(merge, before)), side = rightOf(dir);
  const at = (v, alt, kt, label) => point(v.x, v.y, alt, kt, label);
  return {
    id, name, kind: 'entry', visible: true, color, attachTo: pattern?.id || '', mergeIndex,
    points: [
      at(add(merge, add(mul(dir, -12000), mul(side, -5000))), 3500, 160, 'Entry Start'),
      at(add(merge, mul(dir, -7000)), 3000, 140, 'Entry Mid'),
      at(add(merge, mul(dir, -2500)), 2600, 120, 'Entry Gate'),
      point(merge.x, merge.y, merge.alt, merge.kt, 'Merge'),
    ],
  };
}

/**
 * A new split (V6 `defaultSplit`, line 170): leaves the pattern at its fourth point,
 * swings out and rejoins at the next one. It is taken half the time. `patternId` says
 * which pattern; if it isn't in `routes`, the first pattern is used.
 */
export function newSplit(id, name, patternId, routes, { color = nextRouteColor(routes) } = {}) {
  const source = routeById(routes, patternId) || routes.find((r) => r.kind === 'pattern');
  const count = source?.points.length || 1;
  const sourceIndex = Math.min(3, count - 1);
  const mergeIndex = Math.min(sourceIndex + 1, count - 1);
  const start = source?.points[sourceIndex] || point(0, 0);
  const merge = source?.points[mergeIndex] || point(4000, 0);
  const next = source?.points[(sourceIndex + 1) % count] || point(1000, 0);
  const dir = norm(sub(next, start)), side = leftOf(dir);
  const mid = add(start, add(mul(dir, 3500), mul(side, 2500)));
  return {
    id, name, kind: 'split', visible: true, color,
    attachTo: source?.id || '', mergeIndex, sourceRoute: source?.id || '', sourceIndex, splitOdds: 0.5,
    points: [
      point(start.x, start.y, start.alt, start.kt, 'Split Start'),
      point(mid.x, mid.y, start.alt ?? 2500, 150, 'Split Mid'),
      point(merge.x, merge.y, merge.alt ?? 2400, merge.kt ?? 130, 'Merge'),
    ],
  };
}

/**
 * Calculates the wind-compensated Perch waypoint coordinates (D389).
 * In calm wind, the perch is at its nominal position (Point 11 on PAT1).
 * In wind, the airmass drifts during the 180° descending final turn (120 KIAS, ~35° bank, T ≈ 29.8 s).
 * To roll out aligned on extended runway centerline, the aircraft must start the turn at an offset
 * @param {any} route
 * @param {number} [windFromDeg]
 * @param {number} [windKt]
 * @param {Record<string, any>} [options]
 */
export function computeWindPerch(route, windFromDeg = 360, windKt = 0, options = DEFAULT_ROUTE_OPTIONS) {
  const pts = route?.points || route?.waypoints;
  if (!pts || pts.length === 0) return null;
  const perchPoint = pts.find((p) => p.tag === 'perch' || /perch/i.test(p.label)) ?? pts[11];
  const nominal = perchPoint;
  if (!nominal) return null;

  const opt = /** @type {Record<string, any>} */ (options);
  const iasKt = opt.finalTurnKt ?? 120;
  const altFt = opt.finalTurnAltFt ?? (nominal.alt ?? 3500);
  const bankDeg = opt.finalTurnBankDeg ?? 35;
  const tasKt = iasToTasKt(iasKt, altFt);
  const tasFtps = ktToFtps(tasKt);

  const omega = turnRateFromBankRadPerSec(Math.max(1, tasFtps), bankDeg);
  const turnSec = Math.PI / omega;

  if (!windKt || windKt <= 0) {
    return {
      x: nominal.x,
      y: nominal.y,
      alt: nominal.alt ?? 3500,
      calmX: nominal.x,
      calmY: nominal.y,
      shiftX: 0,
      shiftY: 0,
      turnSec,
    };
  }

  // Wind velocity vector (ft/s) in direction wind is blowing TOWARDS
  const { x: wx, y: wy } = windVectorFtps(windFromDeg, windKt);

  const driftX = wx * turnSec;
  const driftY = wy * turnSec;

  const shiftX = -driftX;
  const shiftY = -driftY;

  return {
    x: nominal.x + shiftX,
    y: nominal.y + shiftY,
    alt: nominal.alt ?? 3500,
    calmX: nominal.x,
    calmY: nominal.y,
    shiftX,
    shiftY,
    turnSec,
  };
}

/**
 * Calculates the wind-compensated Break Rollout waypoint coordinates (Point 10).
 * Simulates the 180° decelerating overhead break turn from Point 9 (Break entry).
 * @param {any} route
 * @param {number} [windFromDeg]
 * @param {number} [windKt]
 * @param {Record<string, any>} [options]
 * @returns {{ x: number, y: number, headingDeg: number, alt?: number } | null}
 */
let _breakCache = { wFrom: null, wKt: null, result: null };

/**
 * Simulates the 180° decelerating overhead break turn.
 * @param {any} route
 * @param {number} [windFromDeg]
 * @param {number} [windKt]
 * @returns {{ rollout: { x: number, y: number, alt: number, headingDeg: number }, arcPoints: Array<any>, breakStartX?: number, breakStartY?: number, rwyHeadingDeg?: number, downwindHeadingDeg?: number } | null}
 */
function simulateBreakArc(route, windFromDeg = 360, windKt = 0) {
  const pts = route?.points || route?.waypoints;
  if (!pts || pts.length === 0) return null;

  const th = pts.find((p) => p.tag === 'threshold' || /threshold/i.test(p.label)) ?? pts[0];
  const dep = pts.find((p) => p.tag === 'departure_end' || /departure/i.test(p.label)) ?? pts[1];
  const breakPoint = pts.find((p) => p.tag === 'break' || /break/i.test(p.label)) ?? pts[9];
  const brk = breakPoint;
  if (!th || !dep || !brk) return null;
  const rwyLen = Math.hypot(dep.x - th.x, dep.y - th.y);
  const rwyUx = (dep.x - th.x) / rwyLen;
  const rwyUy = (dep.y - th.y) / rwyLen;
  const rwyHeadingDeg = compassDegFromVector(dep.x - th.x, dep.y - th.y);
  const downwindHeadingDeg = (rwyHeadingDeg + 180) % 360;

  const useRwyBreak = (windKt ?? 0) <= 0;
  const breakStartX = useRwyBreak ? th.x + rwyUx * 2000 : brk.x;
  const breakStartY = useRwyBreak ? th.y + rwyUy * 2000 : brk.y;

  const { x: wx, y: wy } = windVectorFtps(windFromDeg, windKt);

  const tasInit = iasToTasKt(220, 3500);
  const tasDownwind = iasToTasKt(140, 3500);

  // Initial leg crabbed heading entering break (matches incoming runway centerline track)
  const wtInit = windTriangle(rwyHeadingDeg, tasInit, windFromDeg, windKt);
  const entryHeadingDeg = wtInit.canHoldTrack ? wtInit.headingDeg : rwyHeadingDeg;

  // Downwind leg crabbed heading exiting break (matches outgoing downwind track)
  const wtDw = windTriangle(downwindHeadingDeg, tasDownwind, windFromDeg, windKt);
  const exitHeadingDeg = wtDw.canHoldTrack ? wtDw.headingDeg : downwindHeadingDeg;

  let totalTurnDeg = ((entryHeadingDeg - exitHeadingDeg + 360) % 360);
  if (totalTurnDeg < 30) totalTurnDeg += 360;

  let curX = breakStartX;
  let curY = breakStartY;
  let curHeadingDeg = entryHeadingDeg;
  let curIas = 220;
  const breakDt = 0.2;
  let turnAccum = 0;
  const arcPoints = [];

  while (turnAccum < totalTurnDeg) {
    const u = turnAccum / totalTurnDeg;

    const curTasKt = iasToTasKt(curIas, 3500);
    const tasFtps = ktToFtps(curTasKt);
    const omega = turnRateFromBankRadPerSec(Math.max(1, tasFtps), 60);
    const dTurnDeg = Math.min((omega * breakDt * 180) / Math.PI, totalTurnDeg - turnAccum);

    turnAccum += dTurnDeg;
    curHeadingDeg = (curHeadingDeg - dTurnDeg + 360) % 360;

    curIas = 220 * Math.exp(-0.452 * u);

    const hdgRad = (curHeadingDeg * Math.PI) / 180;
    const vx = tasFtps * Math.sin(hdgRad) + wx;
    const vy = tasFtps * Math.cos(hdgRad) + wy;
    curX += vx * breakDt;
    curY += vy * breakDt;

    const isRollout = turnAccum >= totalTurnDeg;

    arcPoints.push({
      x: curX,
      y: curY,
      alt: 3500,
      kt: isRollout ? 140 : Math.round(curIas),
      g: isRollout ? 1 : 2,
      src: isRollout ? 10 : 9,
      phase: isRollout ? 'downwind' : 'break',
      headingDeg: isRollout ? exitHeadingDeg : curHeadingDeg,
      tag: isRollout ? 'break_rollout' : 'break',
    });
  }

  const rolloutPt = pts.find((p) => p.tag === 'break_rollout' || /break\s*exit/i.test(p.label)) ?? pts[10];

  return {
    rollout: {
      x: curX,
      y: curY,
      alt: rolloutPt?.alt ?? pts[10]?.alt ?? 3500,
      headingDeg: exitHeadingDeg,
    },
    arcPoints,
    breakStartX,
    breakStartY,
    rwyHeadingDeg,
    downwindHeadingDeg: exitHeadingDeg,
  };
}

export function computeBreakRollout(route, windFromDeg = 360, windKt = 0, options = DEFAULT_ROUTE_OPTIONS) {
  if (_breakCache.wFrom === windFromDeg && _breakCache.wKt === windKt && _breakCache.result) {
    return _breakCache.result;
  }

  const sim = simulateBreakArc(route, windFromDeg, windKt);
  if (!sim) return null;

  _breakCache = { wFrom: windFromDeg, wKt: windKt, result: sim.rollout };
  return sim.rollout;
}

/**
 * Generates the wind-adjusted ground track coordinates for Pattern 1 (D370, D382, D389).
 */
export function generateWindAdjustedTrack(route, windFromDeg = 360, windKt = 0, options = DEFAULT_ROUTE_OPTIONS) {
  if (route.id !== 'PAT1' || !route.points || route.points.length < 13) {
    return buildRoundedPoints(route, options);
  }

  const pts = route.points.map((p) => ({ ...p }));
  const perch = computeWindPerch(route, windFromDeg, windKt, options);
  const perchIdx = pts.findIndex((p) => p.tag === 'perch' || /perch/i.test(p.label));
  const targetPerchIdx = perchIdx >= 0 ? perchIdx : 11;
  if (perch && pts[targetPerchIdx]) { pts[targetPerchIdx] = { ...pts[targetPerchIdx], x: perch.x, y: perch.y }; }

  const breakSim = simulateBreakArc(route, windFromDeg, windKt);
  const breakRollout = breakSim?.rollout ?? computeBreakRollout(route, windFromDeg, windKt, options);
  const breakRolloutIdx = pts.findIndex((p) => p.tag === 'break_rollout' || /break\s*exit/i.test(p.label));
  const targetBreakRolloutIdx = breakRolloutIdx >= 0 ? breakRolloutIdx : 10;
  if (breakRollout && pts[targetBreakRolloutIdx]) { pts[targetBreakRolloutIdx] = { ...pts[targetBreakRolloutIdx], x: breakRollout.x, y: breakRollout.y }; }

  const th = pts.find((p) => p.tag === 'threshold' || /threshold/i.test(p.label)) ?? pts[0];   // Threshold
  const dep = pts.find((p) => p.tag === 'departure_end' || /departure/i.test(p.label)) ?? pts[1];  // Departure End
  const rwyHeadingDeg = compassDegFromVector(dep.x - th.x, dep.y - th.y);
  const downwindHeadingDeg = (rwyHeadingDeg + 180) % 360;

  const { x: wx, y: wy } = windVectorFtps(windFromDeg, windKt);

  const track = [];

  // 1. Initial legs from Threshold through Climbout up to Break (points with src < 9)
  const baseRounded = buildRoundedPoints(route, { ...options, windKt: 0 });
  for (const p of baseRounded) {
    if ((p.src ?? 0) === 9) break;
    track.push({ ...p, phase: 'initial', tag: p.tag ?? route.points?.[p.src]?.tag });
  }

  // 2. Overhead Break (60° bank / 2.0 G level turn to downwind heading)
  const useRwyBreak = (windKt ?? 0) <= 0;
  if (useRwyBreak && breakSim) {
    track.push({
      x: breakSim.breakStartX,
      y: breakSim.breakStartY,
      alt: 3500,
      kt: 220,
      g: 2,
      src: 9,
      phase: 'break',
      headingDeg: rwyHeadingDeg,
      tag: 'break',
    });
  }

  let curX = breakRollout?.x ?? -3385;
  let curY = breakRollout?.y ?? -4323;

  if (breakSim && breakSim.arcPoints.length > 0) {
    for (const p of breakSim.arcPoints) {
      track.push(p);
    }
    curX = breakSim.rollout.x;
    curY = breakSim.rollout.y;
  }

  // 3. Direct Steer from Break Rollout to Calculated Wind Perch
  const dwDist = Math.hypot(perch.x - curX, perch.y - curY);
  const dwSteps = Math.max(5, Math.ceil(dwDist / 1000));
  const dwStartX = curX;
  const dwStartY = curY;
  const dwTrackRad = Math.atan2(perch.x - dwStartX, perch.y - dwStartY);
  const dwTrackDeg = (dwTrackRad * 180 / Math.PI + 360) % 360;

  for (let k = 1; k < dwSteps; k++) {
    const u = k / dwSteps;
    track.push({
      x: dwStartX + (perch.x - dwStartX) * u,
      y: dwStartY + (perch.y - dwStartY) * u,
      alt: 3500,
      kt: 140,
      g: 1,
      src: 10,
      phase: 'downwind',
      headingDeg: dwTrackDeg,
      tag: 'downwind',
    });
  }

  // 4. Descending Final Turn: Wind-smoothed continuous transition from Perch to Final
  curX = perch.x;
  curY = perch.y;
  let curIas = 120;
  const ftDt = 0.2;
  const ftTasKt = iasToTasKt(curIas, 3100);
  const ftTasFtps = ktToFtps(ftTasKt);

  // Compute crabbed heading at Perch (matches incoming downwind ground track)
  const wtPerch = windTriangle(dwTrackDeg, ftTasKt, windFromDeg, windKt);
  const entryHeadingDeg = wtPerch.canHoldTrack ? wtPerch.headingDeg : dwTrackDeg;

  // Compute crabbed heading on Final (matches outgoing runway centerline ground track)
  const wtFinal = windTriangle(rwyHeadingDeg, ftTasKt, windFromDeg, windKt);
  const exitHeadingDeg = wtFinal.canHoldTrack ? wtFinal.headingDeg : rwyHeadingDeg;

  // Total angular heading change turning left from entry to exit
  let totalTurnDeg = ((entryHeadingDeg - exitHeadingDeg + 360) % 360);
  if (totalTurnDeg < 30) totalTurnDeg += 360;

  let curHeadingDeg = entryHeadingDeg;
  let ftTurnAccum = 0;

  track.push({
    x: curX,
    y: curY,
    alt: 3500,
    kt: 120,
    g: 1.0,
    src: 11,
    phase: 'final_turn',
    headingDeg: curHeadingDeg,
    tag: 'perch',
  });

  while (ftTurnAccum < totalTurnDeg) {
    const u = ftTurnAccum / totalTurnDeg;

    // Smooth bank profile: ramp in over first 15%, hold 35° (G=1.22), ramp out over last 15%
    let bankDeg = 35;
    if (u < 0.15) {
      bankDeg = 35 * Math.sin((u / 0.15) * (Math.PI / 2));
    } else if (u > 0.85) {
      bankDeg = 35 * Math.sin(((1 - u) / 0.15) * (Math.PI / 2));
    }
    const ftOmega = turnRateFromBankRadPerSec(Math.max(1, ftTasFtps), Math.max(5, bankDeg));
    const dTurnDeg = Math.min((ftOmega * ftDt * 180) / Math.PI, totalTurnDeg - ftTurnAccum);

    ftTurnAccum += dTurnDeg;
    curHeadingDeg = (curHeadingDeg - dTurnDeg + 360) % 360;

    const curAlt = 3500 - (3500 - 2119) * u;
    const hdgRad = (curHeadingDeg * Math.PI) / 180;
    const vx = ftTasFtps * Math.sin(hdgRad) + wx;
    const vy = ftTasFtps * Math.cos(hdgRad) + wy;
    curX += vx * ftDt;
    curY += vy * ftDt;

    const currentG = gFromBankDeg(bankDeg);
    const isRollout = ftTurnAccum >= totalTurnDeg;

    track.push({
      x: curX,
      y: curY,
      alt: Math.round(curAlt),
      kt: 120,
      g: Number(currentG.toFixed(2)),
      src: isRollout ? 12 : 11,
      phase: isRollout ? 'final' : 'final_turn',
      headingDeg: isRollout ? exitHeadingDeg : curHeadingDeg,
      tag: isRollout ? 'window' : 'final_turn',
    });
  }

  // 5. Straight-in Final Approach along extended centerline (3.0° glide slope)
  const finalDist = Math.hypot(th.x - curX, th.y - curY);
  const finalSteps = Math.max(10, Math.ceil(finalDist / 1000));
  const finalStartX = curX;
  const finalStartY = curY;
  const startAlt = track.at(-1)?.alt ?? 2119;

  for (let k = 1; k <= finalSteps; k++) {
    const u = k / finalSteps;
    const kt = Math.round(120 - 20 * u);
    const alt = Math.round(startAlt - (startAlt - THRESHOLD_DATA_ELEV_FT) * u);
    track.push({
      x: finalStartX + (th.x - finalStartX) * u,
      y: finalStartY + (th.y - finalStartY) * u,
      alt,
      kt,
      g: 1,
      src: 0,
      phase: 'final',
      headingDeg: exitHeadingDeg,
      tag: k === finalSteps ? 'threshold' : 'final',
    });
  }

  return track;
}

/**
 * Generates continuous 4-segment Practice Forced Landing (PFL) gliding track from High Key (5,000 ft MSL)
 * over the threshold facing down the runway (298°), through Low Key (~3,700 ft, wind-compensated perch),
 * Base Key (~2,900 ft), to final rollout and threshold touchdown (1,892 ft MSL).
 *
 * Segment 1 (High Key Turn): 180° descending turn from 5,000 ft -> 3,700 ft MSL, 125 -> 120 KIAS.
 * Segment 2 (Downwind Leg to Low Key): Straight leg heading ~118° (wind crabbed) to dynamic Low Key.
 * Segment 3 (Low Key to Final Approach): Smooth descending turn (35° bank) with crab boundary matching.
 * Segment 4 (Final to Touchdown): Straight glide along runway centerline terminating exactly at threshold.
 */
export function generatePflTrack(route, windFromDeg = 360, windKt = 0, options = DEFAULT_ROUTE_OPTIONS) {
  const pts = route?.points || route?.waypoints || [];
  const th = pts.find((p) => p.tag === 'threshold' || /threshold/i.test(p.label)) ?? pts.find((p) => (p.alt ?? 0) <= 2000) ?? pts[pts.length - 1] ?? { x: 3103.84, y: -3193.93 };
  const rwyHeadingDeg = RUNWAY_29L_HDG_DEG;
  const radiusFt = PFL_CIRCLE_RADIUS_FT; // 0.5 NM radius (1.0 NM diameter)

  // 90° LEFT of Runway 29L heading is bearing 208° True (South-Southwest)
  const rad208 = (208 * Math.PI) / 180;
  const nLeftX = Math.sin(rad208); // -0.469472 (West)
  const nLeftY = Math.cos(rad208); // -0.882948 (South)

  // Center of circle: 0.5 NM at 208° from threshold
  const cxFt = th.x + radiusFt * nLeftX; // ~1677.7 ft
  const cyFt = th.y + radiusFt * nLeftY; // ~-5876.4 ft

  const totalSteps = 120; // 3° per step for smooth high-density trajectory
  const track = [];

  for (let k = 0; k <= totalSteps; k++) {
    const u = k / totalSteps;
    const turnDeg = u * 360;

    // Angle from circle center to aircraft position on circle:
    // Starts at bearing 028° (threshold), rotates counter-clockwise (left turn)
    const posAngleDeg = (28 - turnDeg + 360) % 360;
    const radPos = (posAngleDeg * Math.PI) / 180;

    // Position on circle in calm air
    const calmX = cxFt + radiusFt * Math.sin(radPos);
    const calmY = cyFt + radiusFt * Math.cos(radPos);

    // Flown track heading (tangent to circle pointing counter-clockwise):
    const trackHdgDeg = ((rwyHeadingDeg - turnDeg) % 360 + 360) % 360;

    // Altitude descent schedule:
    // High Key (5,000') -> Low Key (3,700') at u=0.5 -> Base Key (2,900') at u=0.75 -> Threshold (1,892') at u=1.0
    let alt;
    if (u <= 0.5) {
      alt = Math.round(5000 - (5000 - 3700) * (u / 0.5));
    } else if (u <= 0.75) {
      alt = Math.round(3700 - (3700 - 2900) * ((u - 0.5) / 0.25));
    } else {
      alt = Math.round(2900 - (2900 - FIELD_ELEV_FT) * ((u - 0.75) / 0.25));
    }

    // Airspeed schedule:
    // 125 KIAS (High Key) -> 120 KIAS (Low Key & Base Key) -> 100 KIAS (Threshold flare)
    let kt;
    if (u <= 0.5) {
      kt = Math.round(125 - 5 * (u / 0.5));
    } else if (u <= 0.75) {
      kt = 120;
    } else {
      kt = Math.round(120 - 20 * ((u - 0.75) / 0.25));
    }

    // Phase and semantic tags:
    let phase = 'pfl_high_key';
    let tag = 'high_key';
    let src = 0;
    if (u === 0) {
      phase = 'pfl_high_key';
      tag = 'high_key';
      src = 0;
    } else if (u < 0.5) {
      phase = 'pfl_high_key';
      tag = 'high_key';
      src = 0;
    } else if (u === 0.5 || (u >= 0.48 && u <= 0.52)) {
      phase = 'pfl_low_key';
      tag = 'low_key';
      src = 1;
    } else if (u < 0.75) {
      phase = 'pfl_base_key';
      tag = 'base_key';
      src = 2;
    } else if (u === 0.75) {
      phase = 'pfl_base_key';
      tag = 'base_key';
      src = 2;
    } else if (u < 1.0) {
      phase = 'pfl_final';
      tag = 'final';
      src = 3;
    } else {
      phase = 'pfl_final';
      tag = 'threshold';
      src = 3;
    }

    // Wind crab angle calculation
    const tasKt = iasToTasKt(kt, alt);
    const wt = windTriangle(trackHdgDeg, tasKt, windFromDeg, windKt);
    const headingDeg = wt.canHoldTrack ? wt.headingDeg : trackHdgDeg;

    // Configuration schedule:
    // Clean (High Key) -> Gear Down (Low Key) -> Landing Flaps (Base Key & Final)
    let config = 'clean';
    if (u >= 0.5 && u < 0.75) config = 'gearDown';
    else if (u >= 0.75) config = 'landing';

    // Nominal coordinated bank for 0.5 NM radius circle at 120 kt is ~25°–30° (1.15 G)
    const bankDeg = (u === 0 || u === 1.0) ? 0 : 30;
    const g = (u === 0 || u === 1.0) ? 1.0 : 1.15;

    // Coordinates: clamped exactly to threshold at end
    const x = (k === totalSteps) ? th.x : Math.round(calmX * 10) / 10;
    const y = (k === totalSteps) ? th.y : Math.round(calmY * 10) / 10;

    track.push({
      x,
      y,
      alt,
      kt,
      kias: kt,
      headingDeg,
      bankDeg,
      g,
      src,
      phase,
      tag,
      config,
    });
  }

  // Ensure semantic tags exist on key indices for lookup helpers
  if (!track.some(p => p.tag === 'low_key')) track[Math.round(totalSteps * 0.5)].tag = 'low_key';
  if (!track.some(p => p.tag === 'base_key')) track[Math.round(totalSteps * 0.75)].tag = 'base_key';

  return track;
}

