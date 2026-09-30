// Measures the built-in Moose Jaw setup (src/modules/traffic/data/moose-jaw.json) for the
// manual cross-check (task 24, part 1). Every measure reads the engine (routePath,
// positionAt, legDistances, pointTurn, createSim) and core's flight maths; none of them
// changes a number. The test in traffic-scenarios.test.js turns the values into the
// report table.
//
// Coordinates: feet, x east and y north. "Along" is distance along the runway from the
// threshold towards the departure end (the landing direction); "cross" is sideways from
// the extended centreline. Points count from 0 here, as in the engine (screen point 10 is
// index 9).
import { createSim, STEP_SEC } from '../../src/modules/traffic/sim.js';
import { routePath, positionAt, legDistances, pointTurn, pointDistFt } from '../../src/modules/traffic/route.js';
import { FT_PER_NM, G_FTPS2, ktToFtps } from '../../src/core/units.js';
import { availableG, iasToTasKt } from '../../src/core/t6-performance.js';
import { turnRadiusFt, limitG } from '../../src/core/flight-math.js';

const DEG = 180 / Math.PI;
/** 0.75 NM: the window, 3/4 NM from the threshold (SMM 4.7 para 12). */
const WINDOW_FT = 0.75 * FT_PER_NM;
/** How often the run for the spacing scenario is looked at, seconds of sim time. */
const LOOK_EVERY_SEC = 0.25;
/** How long the spacing run lasts, seconds. */
const SPACING_RUN_SEC = 3600;

/** Rounds to `dp` decimals (the table is compared as text-stable numbers). */
export function round(x, dp) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** dp;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r; // no -0
}

/** Decimals a value in this unit is shown with. */
export function decimalsFor(unit) {
  if (/^ft/.test(unit)) return 0;
  if (unit === 'G' || unit === 'NM') return 2;
  return 1;
}

const compass = (dx, dy) => (Math.atan2(dx, dy) * DEG + 360) % 360;
const norm360 = (d) => ((d % 360) + 360) % 360;

/** The runway and the maths that need it, from a pattern's first two points (threshold, departure end). */
function runwayOf(pattern) {
  const [t, d] = pattern.points;
  const len = Math.hypot(d.x - t.x, d.y - t.y);
  const ux = (d.x - t.x) / len, uy = (d.y - t.y) / len;
  return {
    headingDeg: compass(ux, uy),
    lengthFt: len,
    along: (p) => (p.x - t.x) * ux + (p.y - t.y) * uy,
    cross: (p) => (p.x - t.x) * uy - (p.y - t.y) * ux,
  };
}

/** The straight part of the flown path between the end of the turn at point i and the start of the one at i + 1. */
function straightLeg(route, i) {
  const { segs } = routePath(route);
  const n = route.points.length;
  const seg = segs.find((s) => s.a.src === i && s.b.src === (i + 1) % n && s.len > 0);
  if (!seg) throw new Error(`${route.id}: no straight leg from point index ${i}`);
  return seg;
}

/** Where the rounded turn at point i starts and ends on the flown path. */
function turnEnds(route, i) {
  const { points } = routePath(route);
  const start = points.find((p) => p.src === i);
  let end = start;
  for (const p of points) if (p.src === i) end = p;
  return { start, end };
}

/** The turn angle at point i (degrees) from the raw legs on each side. */
function rawTurnDeg(route, i) {
  const pts = route.points, n = pts.length;
  const cur = pts[i], prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
  const a = [cur.x - prev.x, cur.y - prev.y], b = [next.x - cur.x, next.y - cur.y];
  const dot = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.max(-1, Math.min(1, dot))) * DEG;
}

/**
 * The peak bank actually flown in the rounded turn at point i. The engine flies a quadratic Bezier between the
 * turn's start and end, whose curvature is highest in the middle (about 1.4 times the average on a 90 degree
 * corner), so the peak is read off the flown path: the heading change at each vertex of the turn divided by the
 * path length it is spread over gives the curvature, and the bank is the one that curvature needs at the
 * point's speed. (The circle a turn is equal to, d / tan(turn / 2), has a lower bank than the peak.)
 */
function peakBankDeg(route, i) {
  const { points } = routePath(route);
  const first = points.findIndex((p) => p.src === i);
  let last = first;
  points.forEach((p, k) => { if (p.src === i) last = k; });
  const v = ktToFtps(route.points[i].kt);
  let peak = 0;
  for (let k = Math.max(first, 1); k <= Math.min(last, points.length - 2); k++) {
    const a = points[k - 1], b = points[k], c = points[k + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (!l1 || !l2) continue;
    const turn = Math.abs(((compass(c.x - b.x, c.y - b.y) - compass(b.x - a.x, b.y - a.y) + 540) % 360) - 180) / DEG;
    peak = Math.max(peak, Math.atan(v * v * (turn / ((l1 + l2) / 2)) / G_FTPS2) * DEG);
  }
  return peak;
}

/** Id of the cross-check row for the flown G at one corner: route id and the point as it counts on screen (from 1). */
export const cornerRowId = (routeId, point) => `t-corner-flown-${routeId}-p${point}`;

/**
 * Every corner of every route (a turn of 10 degrees or more), with the G its flown curve needs at its tightest
 * (from the peak bank) and the G the T-6A can pull at the point's speed (`availableG`: the stall line, at most +7 G; speed read as KIAS).
 * `margin` is flown minus that limit: zero or less is fine.
 * @param {object} setup the built-in setup
 * @returns {{ id: string, routeId: string, point: number, kt: number, asked: number, flownG: number, canPullG: number, margin: number }[]}
 */
export function flownCorners(setup) {
  const rows = [];
  for (const r of setup.routes) {
    r.points.forEach((p, i) => {
      if (pointTurn(r, i) === null || rawTurnDeg(r, i) < 10) return;
      const flownG = 1 / Math.cos(peakBankDeg(r, i) / DEG);
      const canPullG = availableG(p.kt);
      rows.push({ id: cornerRowId(r.id, i + 1), routeId: r.id, point: i + 1, kt: p.kt, asked: p.g, flownG, canPullG, margin: flownG - canPullG });
    });
  }
  return rows;
}

/** One aircraft flown alone round a pattern that never lands; the sim time at which each distance is reached. */
function flySolo(setup, route, startIndex, targetsFt, extraRoutes = []) {
  const alone = { ...setup, routes: [{ ...route, landOdds: 0 }, ...extraRoutes], aircraft: [] };
  const sim = createSim(alone, { seed: 1 });
  sim.spawn({ routeId: route.id, startPoint: startIndex + 1, id: 'X' });
  const times = targetsFt.map(() => null);
  for (let k = 1; times.some((t) => t === null) && k < 200000; k++) {
    sim.stepTo(k * STEP_SEC);
    const a = sim.state().aircraft[0];
    targetsFt.forEach((d, j) => { if (times[j] === null && a.distFt >= d) times[j] = sim.t; });
  }
  return times;
}

/** Sim time at which an aircraft started on `route` leaves it (a split joining the pattern). */
function timeToJoin(setup, route, pattern) {
  const alone = { ...setup, routes: [{ ...pattern, landOdds: 0 }, route], aircraft: [] };
  const sim = createSim(alone, { seed: 1 });
  sim.spawn({ routeId: route.id, startPoint: 1, id: 'X' });
  for (let k = 1; k < 200000; k++) {
    sim.stepTo(k * STEP_SEC);
    if (sim.state().aircraft[0].routeId !== route.id) return sim.t;
  }
  return null;
}

/**
 * Flies the setup's own traffic for an hour and finds when each aircraft crosses the threshold line low on final.
 * Returns the crossings (time, callsign) in order.
 */
function thresholdCrossings(setup, pattern, seed) {
  const runway = runwayOf(pattern);
  const thr = pattern.points[0];
  const sim = createSim(setup, { seed });
  const previous = new Map();
  const crossings = [];
  const looks = Math.round(SPACING_RUN_SEC / LOOK_EVERY_SEC);
  for (let k = 1; k <= looks; k++) {
    sim.stepTo(k * LOOK_EVERY_SEC);
    for (const a of sim.state().aircraft) {
      const now = { along: runway.along(a), cross: runway.cross(a), alt: a.alt, t: sim.t, status: a.status };
      const before = previous.get(a.id);
      previous.set(a.id, now);
      if (!before || before.status !== 'flying' || !(before.along < 0 && now.along >= 0)) continue;
      if (Math.abs(now.cross) > 500 || before.alt > thr.alt + 100 || now.alt > thr.alt + 100) continue;
      const share = -before.along / (now.along - before.along);
      crossings.push({ t: before.t + (now.t - before.t) * share, id: a.id });
    }
  }
  crossings.sort((a, b) => a.t - b.t);
  return crossings;
}

/**
 * Every measure, by scenario id. Each takes the setup and the fixed seed and returns
 * `{ value, where? }`: the number the sim gives, and where or which one when that helps.
 * @param {object} setup the built-in setup (moose-jaw.json)
 * @param {number} seed the dice seed
 * @returns {Record<string, () => { value: number|null, where?: string }>}
 */
export function makeMeasures(setup, seed) {
  const route = (id) => setup.routes.find((r) => r.id === id);
  const pat = route('PAT1'), spl1 = route('SPL1'), spl3 = route('SPL3'), ent2 = route('ENT2');
  const P = pat.points;
  const runway = runwayOf(pat);
  const min = (list) => Math.min(...list);
  const max = (list) => Math.max(...list);
  const alts = (r, idx) => idx.map((i) => r.points[i].alt);
  const kts = (r, idx) => idx.map((i) => r.points[i].kt);
  const bankAsked = (r, i) => pointTurn(r, i).bankDeg;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  /** Angle over the leg from point index `from` to `to`: the height it drops over its length. */
  const legGlide = (r, from, to) => {
    const a = r.points[from], b = r.points[to];
    return Math.atan((a.alt - b.alt) / Math.hypot(b.x - a.x, b.y - a.y)) * DEG;
  };
  /** Angle of the last straight bit of the flown path (from where the last turn rolls out to the end). */
  const flownGlide = (r) => {
    const leg = straightLeg(r, r.points.length - (r.kind === 'pattern' ? 1 : 2));
    return Math.atan((leg.a.alt - leg.b.alt) / leg.len) * DEG;
  };
  const windowHeight = (r) => positionAt(r, routePath(r).lengthFt - WINDOW_FT).alt;
  /** Angle from where the turn at point index i rolls out to the last point of the route. */
  const glideFromRollout = (r, i) => {
    const from = turnEnds(r, i).end, to = r.points[r.points.length - 1];
    return Math.atan((from.alt - to.alt) / Math.hypot(to.x - from.x, to.y - from.y)) * DEG;
  };
  const initial = () => straightLeg(pat, 8);
  const downwind = () => straightLeg(pat, 10);
  const finalLeg = () => straightLeg(pat, 12);

  const cornerMeasures = Object.fromEntries(flownCorners(setup).map((c) => [c.id, () => ({
    value: c.margin,
    where: `${c.flownG.toFixed(2)} G flown at ${c.kt} kt, can pull ${c.canPullG.toFixed(2)} G (stall line or +7 G), ${c.asked} G asked`,
  })]));

  return {
    ...cornerMeasures,
    'h-pattern-height': () => ({ value: min(alts(pat, range(3, 11))) }),
    'h-pattern-height-printed': () => ({ value: min(alts(pat, range(3, 11))) }),
    'h-closed-height': () => ({ value: spl3.points[spl3.points.length - 1].alt }),
    'h-straight-in-base': () => ({ value: spl1.points[2].alt }),
    'h-straight-in-drop': () => ({ value: min(alts(pat, range(3, 11))) - spl1.points[2].alt }),
    'h-window-height': () => ({ value: windowHeight(pat) }),
    'h-window-height-si1': () => ({ value: windowHeight(spl1) }),
    'h-window-height-si2': () => ({ value: windowHeight(ent2) }),
    'g-glide-pattern': () => ({ value: legGlide(pat, 12, 0) }),
    'g-glide-pattern-flown': () => ({ value: flownGlide(pat) }),
    'g-glide-straight-in-1': () => ({ value: legGlide(spl1, spl1.points.length - 2, spl1.points.length - 1) }),
    'g-glide-straight-in-2': () => ({ value: legGlide(ent2, ent2.points.length - 2, ent2.points.length - 1) }),

    'g-glide-straight-in-1-flown': () => ({ value: flownGlide(spl1) }),
    'g-glide-straight-in-2-flown': () => ({ value: glideFromRollout(ent2, 3) }),

    's-pattern-speed': () => ({ value: min(kts(pat, range(3, 9))) }),
    's-break-exit-speed': () => ({ value: P[10].kt }),
    's-downwind-speed': () => ({ value: P[11].kt }),
    's-final-turn-min-speed': () => ({ value: min(kts(pat, [11, 12])) }),
    's-window-speed': () => ({ value: P[12].kt }),
    's-threshold-speed': () => ({ value: P[0].kt }),
    's-straight-in-base-speed': () => ({ value: spl1.points[2].kt }),
    's-straight-in-final-turn-speed': () => ({ value: min(kts(spl1, [3, 4])) }),
    's-closed-speed': () => ({ value: min(spl3.points.map((p) => p.kt)) }),
    'k-initial-tas': () => ({ value: positionAt(pat, initial().len / 2 + pointDistFt(pat, 8)).kt }),
    'k-downwind-tas': () => ({ value: positionAt(pat, pointDistFt(pat, 11)).kt }),

    't-pattern-bank-asked': () => ({ value: min([3, 4, 6, 7, 8, 9].map((i) => bankAsked(pat, i))) }),
    't-break-bank-first': () => ({ value: bankAsked(pat, 9) }),
    't-break-bank-second': () => ({ value: bankAsked(pat, 10) }),
    't-break-bank-first-flown': () => ({ value: peakBankDeg(pat, 9) }),
    't-break-bank-second-flown': () => ({ value: peakBankDeg(pat, 10) }),
    't-break-heading-change': () => ({ value: norm360(initial().headingDeg - downwind().headingDeg) }),
    't-break-level': () => ({ value: P[9].alt - P[10].alt }),
    't-final-turn-bank-asked': () => ({ value: max([11, 12].map((i) => bankAsked(pat, i))) }),
    't-final-turn-bank-flown': () => ({ value: max([11, 12].map((i) => peakBankDeg(pat, i))) }),
    't-final-turn-heading-change': () => ({ value: norm360(downwind().headingDeg - finalLeg().headingDeg) }),
    't-final-turn-straight': () => ({ value: straightLeg(pat, 11).len }),
    't-straight-in-bank-asked': () => ({ value: max([2, 3, 4].map((i) => bankAsked(spl1, i))) }),
    't-corner-g-margin': () => {
      let worst = { margin: -Infinity, where: '' };
      for (const r of setup.routes) {
        r.points.forEach((p, i) => {
          if (pointTurn(r, i) === null || rawTurnDeg(r, i) < 10) return;
          const margin = limitG(p.g, 9) - availableG(p.kt);
          if (margin > worst.margin) worst = { margin, where: `${r.id} point ${i + 1}: ${p.g} G at ${p.kt} kt` };
        });
      }
      return { value: worst.margin, where: worst.where };
    },

    't-corner-g-margin-flown': () => {
      let worst = { margin: -Infinity, where: '' };
      for (const r of setup.routes) {
        r.points.forEach((p, i) => {
          if (pointTurn(r, i) === null || rawTurnDeg(r, i) < 10) return;
          const flownG = 1 / Math.cos(peakBankDeg(r, i) / DEG);
          const margin = flownG - availableG(p.kt);
          if (margin > worst.margin) worst = { margin, where: `${r.id} point ${i + 1}: ${flownG.toFixed(2)} G flown at ${p.kt} kt (${p.g} G asked)` };
        });
      }
      return { value: worst.margin, where: worst.where };
    },

    'a-initial-alignment': () => ({ value: norm360(initial().headingDeg - runway.headingDeg + 180) - 180 }),
    'a-initial-offset': () => ({ value: Math.abs(runway.cross(P[9])) }),
    'a-final-alignment': () => ({ value: norm360(finalLeg().headingDeg - runway.headingDeg + 180) - 180 }),
    'a-downwind-parallel': () => ({ value: norm360(downwind().headingDeg - runway.headingDeg - 180 + 180) - 180 }),
    'a-downwind-spacing': () => {
      const leg = downwind();
      return { value: (Math.abs(runway.cross(leg.a)) + Math.abs(runway.cross(leg.b))) / 2 };
    },
    'a-downwind-length': () => ({ value: legDistances(pat)[10].ft }),
    'a-break-point': () => ({ value: runway.along(turnEnds(pat, 9).start) }),
    'a-rollout-abeam': () => ({ value: runway.along(turnEnds(pat, 10).end) }),
    'a-perch': () => ({ value: -runway.along(turnEnds(pat, 11).start) }),
    'a-final-rollout': () => ({ value: -runway.along(turnEnds(pat, 12).end) }),
    'f-final-spacing': () => {
      const crossings = thresholdCrossings(setup, pat, seed);
      let closest = null;
      for (let i = 1; i < crossings.length; i++) {
        const gap = crossings[i].t - crossings[i - 1].t;
        if (!closest || gap < closest.gap) closest = { gap, a: crossings[i - 1].id, b: crossings[i].id };
      }
      const value = closest ? closest.gap * ktToFtps(P[0].kt) : null;
      return { value, where: closest ? `${closest.a} then ${closest.b}, ${closest.gap.toFixed(1)} s apart; ${crossings.length} crossings in ${SPACING_RUN_SEC} s` : '' };
    },

    'e-break-to-perch-time': () => {
      const [breakStart, perch] = flySolo(setup, pat, 8, [pointDistFt(pat, 9), pointDistFt(pat, 11)]);
      return { value: perch - breakStart };
    },
    'e-break-to-perch-distance': () => ({ value: pointDistFt(pat, 11) - pointDistFt(pat, 9) }),
    'e-final-turn-time': () => {
      const [perch, rollout] = flySolo(setup, pat, 8, [pointDistFt(pat, 11), pointDistFt(pat, 12) + pathLengthOfTurn(pat, 12)]);
      return { value: rollout - perch };
    },
    'e-initial-to-threshold': () => ({ value: flySolo(setup, pat, 8, [routePath(pat).lengthFt])[0] }),
    'e-pattern-lap': () => ({ value: flySolo(setup, pat, 0, [routePath(pat).lengthFt])[0] }),
    'e-closed-pattern-time': () => ({ value: timeToJoin(setup, spl3, pat) }),
  };
}

/** Length of the rounded turn at point i along the flown path. */
function pathLengthOfTurn(route, i) {
  const { points } = routePath(route);
  let len = 0;
  for (let k = 1; k < points.length; k++) if (points[k - 1].src === i && points[k].src === i) len += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  return len;
}

/**
 * The core-derived manual numbers the scenarios file states as plain numbers, so the test can check they still match.
 * @returns {Record<string, number>}
 */
export function derivedManualNumbers() {
  return {
    'k-initial-tas': iasToTasKt(220, 3500),
    'k-downwind-tas': iasToTasKt(120, 3500),
    'a-downwind-spacing': 2 * turnRadiusFt(ktToFtps(iasToTasKt(120, 3500)), Math.SQRT2),
    'a-perch': WINDOW_FT,
    'a-final-rollout': WINDOW_FT,
  };
}

/**
 * Compares a sim value with the manual number under the scenario's mode.
 * @param {{mode: string, tolerance: number}} scenario
 * @param {number|null} sim the sim value, rounded as shown
 * @param {number|null} manual the manual number
 * @returns {string} 'yes', 'no', 'n/a' (nothing to compare with), 'overridden' or 'waits on task N'
 */
export function judge(scenario, sim, manual) {
  if (scenario.mode === 'waits') return `waits on task ${scenario.waitsOn}`;
  if (scenario.mode === 'overridden') return 'overridden';
  if (scenario.mode === 'info' || sim === null || manual === null) return 'n/a';
  const eps = 1e-9;
  if (scenario.mode === 'within') return Math.abs(sim - manual) <= scenario.tolerance + eps ? 'yes' : 'no';
  if (scenario.mode === 'atLeast') return sim >= manual - scenario.tolerance - eps ? 'yes' : 'no';
  if (scenario.mode === 'atMost') return sim <= manual + scenario.tolerance + eps ? 'yes' : 'no';
  throw new Error(`unknown mode ${scenario.mode}`);
}

/**
 * The report table: one row per scenario.
 * @param {object} setup the built-in setup
 * @param {{scenarios: object[], seed: number}} scenarioFile the scenarios file
 * @returns {object[]} rows: id, group, title, sim, manual, unit, page, diff, tolerance, mode, within, where
 */
export function buildTable(setup, scenarioFile) {
  const measures = makeMeasures(setup, scenarioFile.seed);
  return scenarioFile.scenarios.map((s) => {
    const dp = decimalsFor(s.unit);
    let sim = null, where = '';
    if (s.mode !== 'waits') {
      const got = measures[s.id]();
      sim = round(got.value, dp);
      where = got.where ?? '';
    }
    const manual = s.manual === null ? null : round(s.manual, dp);
    const diff = sim !== null && manual !== null ? round(sim - manual, dp) : null;
    return {
      id: s.id, group: s.group, title: s.title, sim, manual, unit: s.unit, page: s.page,
      diff, tolerance: s.tolerance, mode: s.mode, within: judge(s, sim, manual), where,
    };
  });
}
