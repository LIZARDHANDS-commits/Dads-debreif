// The 2-ship's formation changes on kinematic pre-planned lines (Turn Sim spec section 10, decision TS-55; Patrick,
// 4 Oct 2026 18:00Z): the hot turning rejoin from line abreast, and every move between line abreast, fighting wing,
// echelon, route and line astern as one continuous line to the new slot. Lead flies ordinary flight.js segments; #2's
// path is planned as positions (kinematic.js) and replayed exactly.
//
// Sources (page references only):
//  - Hot turning rejoin from line abreast: SMM 16.20 para 65b and 65b(2), para 66, Fig 16.25 (Lead rocks the wings, turns
//    into #2 at 30° of bank and holds that bank and speed; #2 turns aggressively to point at Lead, rolls out, reverses once
//    the line of sight moves, so its fuselage lines up with Lead's as it reaches fighting wing; to echelon it passes
//    through the fighting wing position first). 200 KIAS: Patrick 11:08Z; SMM 12.23 para 53; Fig 16.25 ("smoothly slows
//    to 200 KIAS at 30 deg bank"). Overtake 10-20 KIAS in a turning rejoin: EFIG p.374. Never at or above Lead's height:
//    SMM 12.27 para 65. Turning rejoin references: SMM 12.24 paras 54-59.
//  - Straight-ahead rejoin (the More option): SMM 16.20 para 65a (final vector aims away from Lead), EFIG p.371.
//  - Station changes cross behind and below Lead: SMM 12.20 para 44b. Close through route: SMM 16.15 para 38, AFM7 brief
//    p.18. Drop back to fighting wing: SMM 16.32 para 92, 16.38 para 105. Entry to line abreast: SMM 16.18 para 51.
// Numbers with no source beside them are estimates and say so.
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { relativeTo, turnSeg, wholeDegree, DEG } from './manoeuvres.js';
import { recordFlight, slotFor, KIAS_LAB, KIAS_OUTSIDE_LAB, SLOW_DOWN_KTPS, speedSeg, REJOIN, classifyPair, describe, FORMATIONS } from './transitions.js';
import { makeTrack, seedTrack, posesFrom, settleLast, followInto, rollStarts, relPath, timeLaw, slotInWorld, poseOf, laggedBank } from './kinematic.js';

const dt = STEP_SEC;

/** The numbers of the kinematic moves. All estimates unless a source is given. */
export const KINEMATIC = Object.freeze({
  // In the frame of Lead, how fast #2 may move:
  lateralFtps: 140, // across Lead's heading: about a 25° heading difference at 200 KIAS (inside the 20-40° turn away of SMM 16.18 para 51)
  foreAftFtps: 25, // along it: about 15 KIAS of overtake or undertake, the middle of EFIG p.374's 10-20 KIAS
  verticalFtps: 15, // up or down: 900 ft/min (the 4-ship's stack-change estimate)
  nearPerSec: 0.1, // closing slows with range: 10% of the range per second ...
  nearMinFtps: 8, // ... but never below about 5 kt, the station-change rate (SMM 12.20 para 44 says "controlled")
  // The hot turning rejoin:
  pointBankDeg: REJOIN.bankCapDeg, // #2's "aggressive" turn to point at Lead: the 60° bank cap (an estimate, flagged, never a wall)
  reverseBanksDeg: [35, 40, 45, 50, 55, 60], // the reversal's banks the planner may choose from
  hotWingKias: KIAS_OUTSIDE_LAB, // #2 slows with Lead to 200 KIAS in the hot rejoin: Lead turning into him gives the closure (estimate; the overtake comes in the capture, up to foreAftFtps)
  captureSec: 20, // the capture onto fighting wing, once the reversal has lined #2 up (how long the blend takes)
  captureEaseSec: 3, // how long #2 takes to ease the reversal's bank to Lead's turn as it lines up
  closeBlendSec: 3, // a close formation wingman follows a roll of Lead this long after it (SMM 12.19 para 43: he lags Lead's roll)
  planeLagSec: 3, // a close wingman's place in Lead's wing plane follows Lead's bank over this long (SMM 12.19 para 43: he lags the roll; estimate)
  wideBlendSec: 8, // a fighting wing wingman takes this long
  followLateralG: 0.2, // ... and swings its track at no more than this much sideways G (estimate)
  followAccelKtps: 2.5, // ... or longer, so a wingman following a roll of Lead speeds up or slows at no more than this (estimate; inside the 3 kt/s the smoothness tests allow)
  startBlendSec: 3, // a station change starts moving over this long
});

const CLOSE = new Set(['echelon', 'route', 'astern']);

/** A formation's slot as a relative-path point: { fwd, left, up, plane } (plane 1: in Lead's wing plane, a close formation). */
export function slotPoint(key, side, spacingFt) {
  const s = slotFor(key, side, spacingFt);
  return { fwd: s.fwd, left: s.left, up: s.alt, plane: CLOSE.has(key) ? 1 : 0 };
}

/** The speed limit in Lead's frame at a point of a relative path moving in direction d (unit, in fwd, left, up). */
export function relSpeedLimit(q, d) {
  const range = Math.hypot(q.fwd, q.left);
  const lim = [
    KINEMATIC.lateralFtps / Math.max(Math.abs(d.left), 1e-6),
    KINEMATIC.foreAftFtps / Math.max(Math.abs(d.fwd), 1e-6),
    KINEMATIC.verticalFtps / Math.max(Math.abs(d.up), 1e-6),
    Math.max(KINEMATIC.nearMinFtps, KINEMATIC.nearPerSec * range),
  ];
  return Math.min(...lim);
}

/**
 * The places #2's line passes on its way from `from` (side s, where it is now: `cur`) to `to` (side sTo), in Lead's frame,
 * as relative-path points (design section 4's routes, flown as one line): close formations cross behind and below Lead
 * (SMM 12.20 para 44b); fighting wing closes through route (SMM 16.15 para 38) and flows behind Lead to change sides
 * (SMM 12.29 para 69); a close formation drops back, then sweeps out to fighting wing (SMM 16.32 para 92); line abreast is
 * entered by opening out (SMM 16.18 para 51), behind Lead if the side changes.
 */
export function routePoints(from, s, to, sTo, cur, spacingFt) {
  const slot = (key, side) => slotPoint(key, side, spacingFt);
  const astern = slot('astern', 0);
  const behindY = astern.fwd - 12; // 12 ft further back than line astern: under Lead's tail (the 2-ship's crossing, transitions.js)
  const low = astern.up - 4;
  const pts = [cur];
  let at = from;
  let side = s;
  const crossClose = (target) => {
    // back and down behind the slot on this side, across under Lead's tail, then up into the target on the other side
    if (at !== 'astern') pts.push({ fwd: behindY, left: cur.left, up: low, plane: 1 });
    pts.push({ fwd: behindY, left: 0, up: low, plane: 1 });
    if (target !== 'astern') pts.push({ fwd: behindY, left: slot(target, sTo).left, up: low, plane: 1 });
    side = sTo;
  };
  if (at === 'lab') {
    // From line abreast (straight ahead): close from behind, final vector aiming away from Lead (SMM 16.20 para 65a)
    const fw = slot('fw', side);
    pts.push({ fwd: -200, left: side * spacingFt * 0.7, up: fw.up, plane: 0 }, { fwd: -900, left: side * 1200, up: fw.up, plane: 0 }, { fwd: -950, left: side * 400, up: fw.up, plane: 0 }, fw);
    at = 'fw';
  }
  if (to === 'lab') {
    if (at === 'fw' && side !== sTo) pts.push({ fwd: -750, left: side * 300, up: -60, plane: 0 }, { fwd: -750, left: 0, up: -60, plane: 0 }, { fwd: -750, left: sTo * 300, up: -60, plane: 0 });
    else if (at !== 'fw') {
      if (side !== sTo || at === 'astern') crossClose('astern');
      pts.push({ fwd: cur.fwd - 60, left: sTo * 80, up: cur.up - 15, plane: 0.5 }, { fwd: -300, left: sTo * 500, up: -40, plane: 0 });
    }
    pts.push({ fwd: -350, left: sTo * spacingFt * 0.35, up: -20, plane: 0 }, { fwd: -100, left: sTo * spacingFt * 0.8, up: 0, plane: 0 }, slot('lab', sTo));
    return pts;
  }
  if (to === 'fw') {
    if (at === 'fw') {
      // flow to the other side behind Lead (SMM 12.29 para 69)
      pts.push({ fwd: -750, left: side * 300, up: -60, plane: 0 }, { fwd: -750, left: 0, up: -60, plane: 0 }, { fwd: -750, left: sTo * 300, up: -60, plane: 0 });
    } else {
      if (side !== sTo) crossClose('echelon');
      // drop back first, then sweep out (SMM 16.32 para 92; 16.38 para 105)
      const here = pts[pts.length - 1];
      pts.push({ fwd: here.fwd - 80, left: here.left, up: here.up - 15, plane: 0.5 }, { fwd: -450, left: sTo * 150, up: -50, plane: 0 });
    }
    pts.push(slot('fw', sTo));
    return pts;
  }
  // To a close formation.
  if (at === 'fw' && to === 'astern') {
    // straight in behind and below Lead from fighting wing, closing on his tail (estimate: the 2-ship's line astern entry)
    pts.push({ fwd: -250, left: side * 100, up: -40, plane: 0 }, { fwd: astern.fwd - 30, left: 0, up: low, plane: 1 }, astern);
    return pts;
  }
  if (at === 'fw') {
    // close through route, level or slightly low (SMM 16.15 para 38; AFM7 brief p.18), on this side
    const route = slot('route', side);
    pts.push({ fwd: -200, left: side * 220, up: -45, plane: 0 }, { fwd: route.fwd - 15, left: route.left, up: -30, plane: 1 });
    at = 'route';
  }
  if (to === 'astern') {
    if (at !== 'astern') crossClose('astern');
    pts.push(astern);
    return pts;
  }
  if (side !== sTo) crossClose(to);
  pts.push(slot(to, sTo));
  return pts;
}

/** A relative path and its time law, started at step k0: slotAt(k) for followInto. Returns { slotAt, endStep }. */
function movingSlot(points, k0) {
  const path = relPath(points);
  const law = timeLaw(path, relSpeedLimit);
  const steps = Math.ceil(law.durationSec / dt);
  // Sampled once per step, then lightly smoothed (three passes of a one-second running mean) so the tables behind the
  // curve and its time law leave no tiny corners for the bank and roll rate, read off the line, to pick up.
  const keys = ['fwd', 'left', 'up', 'plane'];
  const HALF = 10;
  const pad = 3 * HALF;
  let rows = [];
  for (let i = -pad; i <= steps + pad; i++) rows.push(path.at(law.sAt(Math.max(0, Math.min(steps, i)) * dt)));
  for (let pass = 0; pass < 3; pass++) {
    rows = rows.map((_, i) => {
      const o = {};
      const a = Math.max(0, i - HALF);
      const b = Math.min(rows.length - 1, i + HALF);
      for (const key of keys) {
        let sum = 0;
        for (let j = a; j <= b; j++) sum += rows[j][key];
        o[key] = sum / (b - a + 1);
      }
      return o;
    });
  }
  return {
    endStep: k0 + steps + pad,
    slotAt: (k) => rows[Math.max(0, Math.min(rows.length - 1, k - k0 + pad))],
  };
}

/** A fixed slot as a slotAt function. */
const fixedSlot = (point) => () => point;

/** How fast a slot point moves in the world at step k (ft/s, x and y). */
function slotVelocity(leadRec, slotAt, k) {
  const at = (j) => {
    const R = leadRec.at(j);
    const q = slotAt(j, R);
    return slotInWorld(R, q.fwd, q.left, q.up, q.plane ?? 0);
  };
  const a = at(Math.max(0, k - 1));
  const b = at(k + 1);
  const span = (k + 1 - Math.max(0, k - 1)) * dt;
  return { x: (b.x - a.x) / span, y: (b.y - a.y) / span, z: (b.z - a.z) / span };
}

/**
 * The rolls of Lead the wingman re-bases at, from step `from` up to `horizon`, each with its blend: at least `baseSec`, and
 * long enough that the change in the slot's speed the roll makes (a slot out to the side of a turning Lead moves faster
 * or slower than he does) is taken up at no more than followAccelKtps. Returns [{ k, blendSec }].
 */
export function rollEvents(leadRec, slotAt, from, horizon, baseSec) {
  const out = [];
  for (const k of rollStarts(leadRec, horizon).filter((x) => x > from)) {
    let e = k + 1;
    while (e < horizon + 400 && Math.abs(leadRec.at(e + 1).bankDeg - leadRec.at(e).bankDeg) > 1e-9) e++;
    const v0 = slotVelocity(leadRec, slotAt, k);
    const v1 = slotVelocity(leadRec, slotAt, e + 1);
    // Split into the change along the slot's new track (speed) and across it (heading), each with its own gentle limit.
    const speed1 = Math.max(Math.hypot(v1.x, v1.y), 1);
    const along = ((v1.x - v0.x) * v1.x + (v1.y - v0.y) * v1.y) / speed1;
    const across = Math.abs(((v1.y - v0.y) * v1.x - (v1.x - v0.x) * v1.y) / speed1);
    const forSpeed = (BLEND_PEAK * Math.abs(along)) / (KINEMATIC.followAccelKtps * KT_FTPS);
    const forHeading = (BLEND_PEAK * Math.hypot(across, v1.z - v0.z)) / (KINEMATIC.followLateralG * G_FTPS2);
    out.push({ k, blendSec: Math.max(baseSec, forSpeed, forHeading) });
  }
  return out;
}
/** The steepest speed change of a septic blend away from a line drifting at a steady rate, as a multiple of drift / blend (worked out from the blend's shape). */
const BLEND_PEAK = 5.8;
/** One knot in feet per second. */
const KT_FTPS = 1.6878;

/** The last step a list of roll events still blends at. */
export const eventsEnd = (events) => events.reduce((m, e) => Math.max(m, e.k + Math.ceil(e.blendSec / dt)), 0);

/** Lead's segments for a change: a speed change to the target formation's speed, at the start (full power up, 1.5 kt/s down). */
function leadSpeed(lead, kias, blockFt, withNext = false) {
  if (Math.abs(lead.kias - kias) <= 0.5) return [];
  return [{ ...speedSeg(lead.kias, kias, blockFt), withNext }];
}


/** The last step at which a recorded flight's wings move, searched back from step n, or 0. */
function lastRollEnd(rec, n) {
  for (let k = n; k > 0; k--) if (Math.abs(rec.at(k).bankDeg - rec.at(k - 1).bankDeg) > 1e-9) return k;
  return 0;
}

/** The overshoot lane and the height check over a planned line: furthest ahead of Lead's 3/9 line inside 1,000 ft, and least height under Lead inside 2,000 ft. */
function laneAndBelow(leadRec, track, n) {
  let laneFwdFt = -Infinity;
  let minBelowFt = Infinity;
  for (let k = 1; k <= n; k++) {
    const L = leadRec.at(k);
    const r = k + 3;
    const rel = relativeTo(L, { xFt: track.x[r], yFt: track.y[r] });
    const range = Math.hypot(rel.fwd, rel.left);
    if (range < 1000) laneFwdFt = Math.max(laneFwdFt, rel.fwd);
    if (range < 2000) minBelowFt = Math.min(minBelowFt, L.altAboveFt - track.z[r]);
  }
  return { laneFwdFt, minBelowFt };
}

/**
 * The follow from step `from`, re-based at every roll Lead starts after it (the formation's own blend), then the poses.
 * Returns { poses, maxBankDeg, minKias, maxKias }.
 */
function finishLine(track, leadRec, from, slotAt, n, firstBlendSec, events, kiasPerTas, firstDecaySec = firstBlendSec / 2) {
  const ref = laggedBank(leadRec, KINEMATIC.planeLagSec);
  followInto(track, { ref, from, slotAt, blendSec: firstBlendSec, decaySec: firstDecaySec });
  for (const e of events) followInto(track, { ref, from: e.k, slotAt, blendSec: e.blendSec, decaySec: e.blendSec / 2 });
  const out = posesFrom(track, kiasPerTas);
  settleLast(out.poses, leadRec.at(n));
  return out;
}

/**
 * A station change or entry on one line (Patrick 18:00Z: one press flies one continuous line to the new slot, no stop
 * between legs, speed ramps only): Lead flies straight, changing speed to the target formation's; #2 flies one line through
 * the route's places (routePoints). pair: [lead, wing]. Returns { ok, plans, endSec, maxBankDeg, laneFwdFt, minBelowFt }.
 */
export function planLineMove(pair, from, s, to, sTo, { spacingFt = 6000, blockFt = 8000 } = {}, t0 = 0) {
  const [lead, wing] = pair;
  const rel = relativeTo(lead, wing);
  const cur = { fwd: rel.fwd, left: rel.left, up: wing.altAboveFt - lead.altAboveFt, plane: CLOSE.has(from) ? 1 : 0 };
  const points = routePoints(from, s, to, sTo, cur, spacingFt);
  const kias = to === 'lab' ? KIAS_LAB : KIAS_OUTSIDE_LAB;
  const leadSegs = leadSpeed(lead, kias, blockFt);
  const moving = movingSlot(points, 0);
  const speedSteps = leadSegs.length ? Math.ceil((2 * Math.abs(lead.kias - kias)) / leadSegs[0].rateKtps / dt) : 0;
  const leadRec = recordFlight(lead, { segments: leadSegs }, t0);
  const blend = CLOSE.has(to) ? KINEMATIC.closeBlendSec : KINEMATIC.wideBlendSec;
  const horizon = Math.max(moving.endStep, speedSteps);
  const events = rollEvents(leadRec, moving.slotAt, 0, horizon, blend);
  const n = Math.max(horizon + Math.ceil(KINEMATIC.startBlendSec / dt), eventsEnd(events)) + 4;
  const track = makeTrack(n);
  seedTrack(track, wing);
  const line = finishLine(track, leadRec, 0, moving.slotAt, n, KINEMATIC.startBlendSec, events, wing.kias / wing.tasFtps);
  return {
    ok: true,
    plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: line.poses }] } },
    endSec: t0 + n * dt,
    maxBankDeg: line.maxBankDeg,
    ...laneAndBelow(leadRec, track, n),
  };
}

/**
 * A turn of `total` radians the `dir` way at `bankDeg`, as flight.js turn segments of at most 170° each handed straight on
 * (flight.js reads a heading more than 270° away as already passed), the last rolling out on the whole degree when rollOut.
 */
export function leadTurnSegs(h0, dir, total, bankDeg, rollOut) {
  const segs = [];
  const chunks = Math.max(1, Math.ceil(total / (170 * DEG)));
  for (let i = 1; i <= chunks; i++) {
    const to = wholeDegree(h0 + dir * total * (i / chunks));
    segs.push(turnSeg(to, dir, bankDeg, i === chunks ? rollOut : false));
  }
  return segs;
}

/** The reversal: a turn toward Lead's side (s) at bank b3, held with no roll-out, so the capture takes over with the wings still banked. */
const reverseSeg = (state, s, b3) => turnSeg(wrapPi(state.headingRad + s * Math.PI * 0.9), s, b3, false);

/** "A definite increase in the line of sight" (SMM 16.20 para 65b(2)): 2°/s, an estimate. */
const LOS_RATE_DPS = 2;
/** How much of the full pure-pursuit turn #2 may fly to point at Lead (estimates; the planner picks one). */
const POINT_SHARES = [1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8];
/** Where #2 may line up after the reversal: at least 300 ft behind Lead's 3/9 line, 400 to 2,000 ft from him (estimates). */
const LINE_UP = Object.freeze({ behindFt: 300, minRangeFt: 400, maxRangeFt: 2000 });

/**
 * The hot turning rejoin from line abreast (SMM 16.20 para 65b(2), para 66, Fig 16.25). At the press Lead turns into #2 at
 * 30° of bank, slowing smoothly to 200 KIAS, and holds that bank and speed until #2 is in position. #2 at once turns hard
 * (60° bank) to point at Lead, rolls out, and when the line of sight starts to move (Lead passes through its nose) reverses,
 * so its fuselage is lined up with Lead's as it reaches fighting wing; to echelon (or route, or line astern) it carries on
 * through the fighting wing position to the wing (para 66). Below Lead throughout (SMM 12.27 para 65). s: #2's side (+1 left,
 * -1 right); to, sTo: the formation and side commanded. Returns { ok, plans, endSec, leadTurnDeg, maxBankDeg, laneFwdFt,
 * minBelowFt, reverse } or { ok: false, reason }.
 */
// Fig 16.25 is not to scale: flown at 200 KIAS and 30° of bank, a reversal timed as the figure draws it lines #2 up
// thousands of feet behind and outside Lead. Patrick chose this SMM text version, from the standard start (4 Oct 19:16Z,
// TS-55): #2 lines up just behind Lead, then one line carries it into fighting wing.
export function planHotRejoin(pair, s, to, sTo, { spacingFt = 6000 } = {}, t0 = 0) {
  const [lead, wing] = pair;
  const h0 = lead.headingRad;
  const fw = slotPoint('fw', s, spacingFt);
  const bank = REJOIN.leadBankDeg;
  const leadSlow = { kind: 'speed', toKias: KIAS_OUTSIDE_LAB, rateKtps: SLOW_DOWN_KTPS, withNext: true };
  // While planning, Lead keeps turning (two near-full circles at 30°); the real plan ends the turn once #2 is in.
  const longRec = recordFlight(lead, { segments: [leadSlow, ...leadTurnSegs(h0, s, 4 * 170 * DEG, bank, false)] }, t0);
  const kiasPerTas = wing.kias / wing.tasFtps;
  const slowWing = { kind: 'speed', toKias: KINEMATIC.hotWingKias, rateKtps: SLOW_DOWN_KTPS, withNext: true };
  const descend = { t0, t1: t0 + 12, fromFt: wing.altAboveFt, toFt: lead.altAboveFt + fw.up }; // down to the fighting wing height first (12 s, estimate)
  /** Flies #2 from the press through segments, calling each(a, k) after every step until it returns false. */
  const flyWing = (segments, maxSteps, each) => {
    const a = copyAircraft(wing);
    const p = { segments: segments.map((x) => ({ ...x })), profile: [descend] };
    let t = t0;
    for (let k = 1; k <= maxSteps; k++) {
      stepAircraft(a, p, t);
      t += dt;
      if (each(a, k, p) === false) break;
    }
    return a;
  };

  // 1. Turn hard to point at Lead (pure pursuit at the roll-out), found in a few passes.
  let point = Math.atan2(lead.yFt - wing.yFt, lead.xFt - wing.xFt);
  for (let pass = 0; pass < 5; pass++) {
    let out = 1;
    const end = flyWing([slowWing, turnSeg(wholeDegree(point), -s, KINEMATIC.pointBankDeg)], 4000, (a, k, p) => {
      out = k;
      return !(p.segments.length === 0 && a.bankDeg === 0);
    });
    const L = longRec.at(out);
    point = Math.atan2(L.yFt - end.yFt, L.xFt - end.xFt);
  }
  const pointTurn = Math.abs(wrapPi(point - wing.headingRad));

  // 2. Roll out pointing at Lead, then reverse once the line of sight moves. The planner tries how far toward Lead #2 turns
  // (the full pure-pursuit turn or a little less: an "aggressive" turn that a pilot anticipating Lead's turn stops short),
  // when it reverses and at what bank, and keeps the ways that line #2 up nearest fighting wing, on its own side, at the
  // smallest speed difference (para 65b(2): anticipate the reversal to align the fuselage with Lead's).
  const bearing = (w, l) => wrapPi(Math.atan2(l.yFt - w.yFt, l.xFt - w.xFt) - w.headingRad);
  const fwSlotAt = (k) => slotInWorld(longRec.at(k), fw.fwd, fw.left, fw.up, 0);
  const candidates = [];
  for (const share of POINT_SHARES) {
    const pointSeg = turnSeg(wholeDegree(wing.headingRad - s * pointTurn * share), -s, KINEMATIC.pointBankDeg);
    const states = [];
    let rolledOut = 0;
    flyWing([slowWing, pointSeg, { kind: 'hold', untilSec: t0 + 600 }], 12000, (a, k, p) => {
      states[k] = { ...a, speedLeg: p.speedLeg ? { ...p.speedLeg } : null };
      if (!rolledOut && p.segments[0]?.kind === 'hold' && a.bankDeg === 0) rolledOut = k;
      return !rolledOut || k < rolledOut + Math.round(40 / dt);
    });
    const losRate = (k) => wrapPi(bearing(states[k], longRec.at(k)) - bearing(states[k - 1], longRec.at(k - 1))) / dt;
    let firstMove = rolledOut + 1;
    while (firstMove < states.length - 1 && Math.abs(losRate(firstMove)) < LOS_RATE_DPS * DEG) firstMove++;
    for (let kr = rolledOut + 1; kr <= Math.min(states.length - 1, firstMove + Math.round(20 / dt)); kr += Math.round(0.5 / dt)) {
      for (const b3 of KINEMATIC.reverseBanksDeg) {
        // The reversal turns until #2's heading matches the slot's track: fuselage lined up with Lead's (SMM 16.20 para 65b(2)).
        const a = copyAircraft(states[kr]);
        const p = { segments: [reverseSeg(states[kr], s, b3)], profile: [descend], speedLeg: states[kr].speedLeg ? { ...states[kr].speedLeg } : null };
        let t = t0 + kr * dt;
        let gapBefore = null;
        let hBefore = a.headingRad;
        for (let k = kr + 1; k <= kr + Math.round(60 / dt); k++) {
          stepAircraft(a, p, t);
          t += dt;
          const S0 = fwSlotAt(k - 1);
          const S1 = fwSlotAt(k + 1);
          // Heading still to turn to line up, less what the capture's easing of the reversal (to Lead's turn) still turns:
          // the reversal is anticipated (para 65b(2)) so the fuselage lines up as the bank comes off.
          const slotTurn = wrapPi(longRec.at(k + 1).headingRad - longRec.at(k - 1).headingRad) / (2 * dt);
          const ownTurn = wrapPi(a.headingRad - hBefore) / dt;
          hBefore = a.headingRad;
          const ease = Math.max(0, (ownTurn - slotTurn) * s) * KINEMATIC.captureEaseSec * 0.5;
          const gap = wrapPi(Math.atan2(S1.y - S0.y, S1.x - S0.x) - a.headingRad) * s - ease;
          if (gapBefore !== null && gap <= 0 && gapBefore > 0) {
            // Lined up. Keep it if #2 is behind Lead and clear of him, and score how far it is from fighting wing and how
            // fast it moves against the point in Lead's frame where it is (what the capture has to take out).
            const L = longRec.at(k);
            const rel = relativeTo(L, a);
            const range = Math.hypot(rel.fwd, rel.left);
            if (rel.fwd <= -LINE_UP.behindFt && range >= LINE_UP.minRangeFt && range <= LINE_UP.maxRangeFt) {
              const P0 = slotInWorld(longRec.at(k - 1), rel.fwd, rel.left, 0);
              const P1 = slotInWorld(longRec.at(k + 1), rel.fwd, rel.left, 0);
              const settled = a.headingRad + s * ease; // the heading once the capture has eased the reversal
              const dvx = a.tasFtps * Math.cos(settled) - (P1.x - P0.x) / (2 * dt);
              const dvy = a.tasFtps * Math.sin(settled) - (P1.y - P0.y) / (2 * dt);
              // The same, in Lead's frame: how #2 is drifting against him as it lines up.
              const drift = { fwd: dvx * Math.cos(L.headingRad) + dvy * Math.sin(L.headingRad), left: -dvx * Math.sin(L.headingRad) + dvy * Math.cos(L.headingRad) };
              const rv = Math.hypot(dvx, dvy);
              candidates.push({ kr, b3, kh: k, pointSeg, states, rel, drift, score: Math.hypot(rel.fwd - fw.fwd, rel.left - fw.left) + 8 * rv });
            }
            break;
          }
          gapBefore = gap;
        }
      }
    }
  }
  if (!candidates.length) return { ok: false, reason: 'No safe hot turning rejoin from here: #2 could not line up with Lead.' };
  candidates.sort((x, y) => x.score - y.score);

  // 3. For the best few, plan the whole line: from the line-up, one continuous line out to the fighting wing position (the
  // capture), on through it to the target (para 66), and Lead's roll-out once #2 is in.
  const onward = to === 'fw' && sTo === s ? [] : routePoints('fw', s, to, sTo, fw, spacingFt).slice(1);
  const blend = CLOSE.has(to) ? KINEMATIC.closeBlendSec : KINEMATIC.wideBlendSec;
  for (const c of candidates.slice(0, 12)) {
    // The line starts where #2's drift against Lead carries it during the capture, so the capture takes the drift out
    // smoothly instead of pulling #2 back to where it lined up.
    const carry = KINEMATIC.captureSec / 2;
    const first = { fwd: c.rel.fwd + c.drift.fwd * carry, left: c.rel.left + c.drift.left * carry, up: fw.up, plane: 0 };
    const moving = movingSlot([first, fw, ...onward], c.kh);
    const slotAt = moving.slotAt;
    const inStep = Math.max(c.kh + Math.round(KINEMATIC.captureSec / dt), moving.endStep);
    // Lead holds the 30° turn until #2 is in position, then rolls out on the whole degree.
    let turned = 0;
    for (let i = 1; i <= inStep; i++) turned += wrapPi(longRec.at(i).headingRad - longRec.at(i - 1).headingRad) * s;
    const leadSegs = [leadSlow, ...leadTurnSegs(h0, s, Math.round(turned / DEG) * DEG, bank, true)];
    const leadRec = recordFlight(lead, { segments: leadSegs }, t0);
    const events = rollEvents(leadRec, slotAt, c.kh, lastRollEnd(leadRec, inStep + Math.round(30 / dt)) + 1, blend);
    const n = Math.max(c.kh + Math.ceil(KINEMATIC.captureSec / dt), inStep, eventsEnd(events)) + 4;
    const track = makeTrack(n);
    seedTrack(track, wing);
    // Steps 1..kh: the turn to point, the straight leg and the reversal, as flight.js flies them.
    const segs = [slowWing, c.pointSeg, { kind: 'hold', untilSec: t0 + c.kr * dt, thenNext: true }, reverseSeg(c.states[c.kr], s, c.b3)];
    const flown = [];
    flyWing(segs, c.kh, (a, k) => {
      track.x[k + 3] = a.xFt;
      track.y[k + 3] = a.yFt;
      track.z[k + 3] = a.altAboveFt;
      flown[k] = poseOf(a);
      return true;
    });
    const line = finishLine(track, leadRec, c.kh, slotAt, n, KINEMATIC.captureSec, events, kiasPerTas, KINEMATIC.captureEaseSec);
    // Up to the line-up #2 flies exactly what flight.js flew (its own roll and speed), not values read back off the line.
    for (let k = 1; k <= c.kh - 3; k++) line.poses[k - 1] = flown[k];
    const checks = laneAndBelow(leadRec, track, n);
    if (line.maxBankDeg > KINEMATIC.pointBankDeg + 0.5 || checks.laneFwdFt > 100 || checks.minBelowFt <= 0) continue;
    return {
      ok: true,
      plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'poseTrack', poses: line.poses }] } },
      endSec: t0 + n * dt,
      leadTurnDeg: Math.round(turned / DEG),
      maxBankDeg: line.maxBankDeg,
      minKias: line.minKias,
      maxKias: line.maxKias,
      reverse: { atSec: c.kr * dt, bankDeg: c.b3 },
      ...checks,
    };
  }
  return { ok: false, reason: 'No safe hot turning rejoin from here: every way in broke the bank cap, the overshoot lane or the height rule.' };
}

/**
 * The hot turning rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply
 * and the tracker's rejoin flies instead: only from the standard start (Patrick 19:16Z): line abreast at the spacing, level,
 * on the line, matched at 220 KIAS, with the turning rejoin chosen. Off-standard starts are a later piece.
 */
export function planHotRejoinChange(pair, to, options = {}, t0 = 0) {
  const [lead, wing] = pair;
  if (to === 'lab' || (options.rejoin ?? 'into') !== 'into') return null;
  const from = classifyPair(lead, wing);
  if (from.key !== 'lab') return null;
  const spacingFt = options.spacingFt ?? 6000;
  const rel = relativeTo(lead, wing);
  const standard =
    Math.abs(Math.abs(rel.left) - spacingFt) <= STANDARD.spacingFt &&
    Math.abs(rel.fwd) <= STANDARD.foreAftFt &&
    Math.abs(wing.altAboveFt - lead.altAboveFt) <= STANDARD.heightFt &&
    Math.abs(lead.kias - KIAS_LAB) <= STANDARD.kias &&
    Math.abs(wing.kias - KIAS_LAB) <= STANDARD.kias &&
    Math.abs(wrapPi(wing.headingRad - lead.headingRad)) <= STANDARD.headingDeg * DEG &&
    Math.abs(lead.bankDeg) < 0.5 &&
    Math.abs(wing.bankDeg) < 0.5;
  if (!standard) return null;
  const s = from.side;
  const want = options.side ?? 'keep';
  const sTo = to === 'astern' ? 0 : want === 'left' ? 1 : want === 'right' ? -1 : s;
  const r = /** @type {any} */ (planHotRejoin(pair, s, to, sTo, { spacingFt }, t0));
  if (!r.ok) return null;
  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromSide = s > 0 ? ' left' : ' right';
  const how = describe('lab', to, 'into');
  return {
    ok: true,
    plans: r.plans,
    note: `Line abreast${fromSide} to ${label}${sideWord}: ${how}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS, and holds it until #2 is in; #2 points at Lead, rolls out, reverses as the line of sight moves and lines up with Lead (SMM 16.20 para 65b(2)${to === 'fw' ? '' : ', through the fighting wing position, para 66'}).`,
    label: `${label}${sideWord}`,
    flying: `Line abreast${fromSide} to ${label}${sideWord} (${how})`,
    from: 'lab',
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    leadTurnDeg: r.leadTurnDeg,
    laneFwdFt: r.laneFwdFt,
    maxBankDeg: r.maxBankDeg,
    judged: null,
    endSec: r.endSec,
    rejoining: true,
  };
}
/** How close to the standard start the pair must be for the hot turning rejoin (estimates: the shared margins). */
const STANDARD = Object.freeze({ spacingFt: 100, foreAftFt: 500, heightFt: 100, kias: 10, headingDeg: 5 });
