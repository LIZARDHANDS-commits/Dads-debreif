// The PFL: an engine failure (or a practice from High Key) flown to the runway (Traffic spec 4.5). This file puts the
// flight into the sim: it starts it from the aircraft, resumes it mid-glide, and draws the path flown before it.
//
// How it flies (spec 4.5 item 3, TR-113): the zoom or level slow-down is planned first and flown by the same code;
// the join is chosen from where it ends. The plan is a list of points (the join, the wind-shaped circle, the direct);
// the chain turns it into the turns and straights the aircraft flies, every corner a turn at its planned radius. The
// height needed is summed along that chain, and the aircraft flies the same chain: one path, one sum (Fable F9, F16).
// Re-plans come at the keys, when the margin is more than 300 ft short, and when the drag no longer fits. A pattern
// PFL still high with all the drag out squares off: a wide Low Key, then square turns to base and final, Final Key
// staying where it is. Drag goes out a step at a time, at least 5 s apart (Fable F6); the round-out and flare are
// TR-110's.
//
// The parts: pfl-geometry.js (the PFL table, the circle, the zoom, the chain and its height sums), pfl-joins.js (the
// joins, the direct, the square-off and the choosers), pfl-flight.js (flyPfl).

import { ktToFtps } from '../../core/units.js';
import { DEG, RAD, wrapDeg360 } from '../../core/angles.js';
import { turnRateFromBankRadPerSec } from '../../core/flight-math.js';
import { iasToTasKt } from './weather.js';
import { windVectorFtps } from '../../core/wind.js';
import { startJoin, setFlown, flownOf, groupOf } from './path-follower.js';
import { routeLengthFt } from './route.js';
import { RUNWAY_29L_HDG_DEG } from './airfield.js';
import { PFL_CONFIG_LABELS, PFL_ROUTE_OPTIONS, dist, project } from './pfl-geometry.js';
import { flyPfl } from './pfl-flight.js';

export { PFL, PFL_CONFIGS, PFL_CONFIG_LABELS, PFL_ROUTE_OPTIONS, pflGeometry, calculateGlideFootprint } from './pfl-geometry.js';
export { flyPfl } from './pfl-flight.js';

// ── Into the sim ──────────────────────────────────────────────────────────────

/**
 * The PFL configuration index for the configuration the aircraft is in when the engine fails ('Clean', 'T/O flap',
 * 'Gear + T/O flap', 'Gear + landing flap', as behaviour.js names them). Flap with the gear up has no glide row of its
 * own, so it glides as gear and T/O flap (an estimate: a little more drag than it has).
 */
function startCfgIndex(config) {
  if (config === 'T/O flap') return 2;
  return Math.max(0, PFL_CONFIG_LABELS.indexOf(config ?? ''));
}

export function startPflFlight(a, wind, options = {}) {
  const flight = flyPfl(
    {
      x: Number.isFinite(a.x) ? a.x : 0,
      y: Number.isFinite(a.y) ? a.y : 0,
      alt: Number.isFinite(a.alt) ? a.alt : 3500,
      kias: a.iasKt ?? a.kt ?? 125,
      headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG,
      bankDeg: a.bankDeg,
      rollRateDps: a.rollRateDps,
      cfgIndex: startCfgIndex(options.startConfig),
    },
    wind,
    options
  );

  const fl = setFlown(a, 'pfl', { id: 'PFL_FLOWN', kind: 'pfl', name: 'Engine-out glide', points: flight.points }, {
    outcome: flight.outcome,
    touchdown: flight.touchdown,
    eject: flight.eject,
    gate: flight.gate,
    practice: Boolean(options.practice),
    patternPfl: flight.patternPfl,
    planLog: flight.planLog,
  });

  const behind = flownBehind(a, flight.points[0], wind);
  fl.behindCount = behind.length;
  fl.route.points = [...behind, ...flight.points];

  startJoin(a, fl.route, routeLengthFt({ points: [...behind, flight.points[0]] }, PFL_ROUTE_OPTIONS), wind, PFL_ROUTE_OPTIONS);

  a.engineFailed = true;
  a.landed = false;
  a.active = true;
  const pf = groupOf(a, 'pfl');
  pf.decision = flight.points[0]?.decision ?? '';
  a.config = flight.points[0]?.config ?? PFL_CONFIG_LABELS[0];
  a.phase = flight.points[0]?.phase ?? 'pfl';
  pf.segment = flight.points[0]?.segmentType ?? flight.points[0]?.segment ?? flight.points[0]?.phase ?? 'pfl';
  pf.marginFt = flight.points[0]?.marginFt ?? null;
  pf.marginTag = flight.points[0]?.marginTag ?? null;

  delete a.navPlan;
  delete a._blendStart;
  delete a._blendTarget;
  delete a._blendTimer;

  return fl;
}

export function resumePflFlight(a, wind, settings = undefined) {
  const prev = flownOf(a, 'pfl');
  const cfgIndex = Math.max(0, PFL_CONFIG_LABELS.indexOf(a.config ?? PFL_CONFIG_LABELS[0]));
  return startPflFlight(a, wind, {
    practice: prev?.practice,
    settings,
    midGlide: { cfgIndex, patternPfl: prev?.patternPfl, plan: planNow(a, prev), decision: a.pfl?.decision },
  });
}

function planNow(a, flight) {
  const log = flight?.planLog;
  const pts = flight?.route?.points;
  if (!log?.length || !pts?.length) return null;
  let i = 0, d = 0;
  while (i < pts.length - 1 && d + dist(pts[i], pts[i + 1]) <= (a.distFt ?? 0)) { d += dist(pts[i], pts[i + 1]); i++; }
  const at = i - (flight.behindCount ?? 0);
  const entry = [...log].reverse().find((e) => e.at <= at) ?? log[0];
  const path = entry?.plan?.path;
  if (!path || path.length < 2) return null;
  let seg = 0;
  for (let k = 0, best = Infinity; k < path.length - 1; k++) {
    const p = project(path, k, a);
    if (p.seg === k && p.d < best) { best = p.d; seg = k; }
  }
  return { ...entry.plan, path: [{ ...path[seg], x: a.x, y: a.y, key: undefined, highKeyCheck: undefined }, ...path.slice(seg + 1)] };
}

function flownBehind(a, first, wind) {
  const alt = Number.isFinite(a.alt) ? a.alt : 3500;
  const tasFtps = ktToFtps(iasToTasKt(a.iasKt ?? a.kt ?? 125, alt));
  const omegaDeg = Number.isFinite(a.bankDeg) ? turnRateFromBankRadPerSec(Math.max(tasFtps, 1), a.bankDeg) * RAD : 0;
  const w = windVectorFtps(wind?.windFromDeg ?? 360, wind?.windKt ?? 0);
  const pts = [];
  let x = Number.isFinite(a.x) ? a.x : 0, y = Number.isFinite(a.y) ? a.y : 0, hdg = a.headingDeg ?? RUNWAY_29L_HDG_DEG;
  const dt = 0.4;
  for (let k = 0; k < 8; k++) {
    hdg -= omegaDeg * dt;
    x -= (tasFtps * Math.sin(hdg * DEG) + w.x) * dt;
    y -= (tasFtps * Math.cos(hdg * DEG) + w.y) * dt;
    pts.unshift({ ...first, x, y, headingDeg: wrapDeg360(hdg) });
  }
  return pts;
}
