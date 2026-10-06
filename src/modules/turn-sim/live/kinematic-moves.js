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
import { G_FTPS2, KT_TO_FTPS as KT_FTPS } from '../../../core/units.js';
import { STEP_SEC, stepAircraft, copyAircraft } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { recordFlight, speedSeg, describe } from './transitions.js';
import { KIAS_LAB, KIAS_OUTSIDE_LAB, KINEMATIC, OPEN_OUT, LAG_ROLL } from './tuning.js';
import { FORMATIONS, FW_BAND, LANE, fwShapeNow, pairSlot } from './slots.js';
import { speedSegFor } from './slow-down.js';
import { makeTrack, seedTrack, posesFrom, settleLast, followInto, rollStarts, relPath, timeLaw, slotInWorld, poseOf, laggedBank, relSpeedLimit } from './kinematic.js';

const dt = STEP_SEC;

export const CLOSE = new Set(['echelon', 'route', 'astern']);

/** A formation's slot as a relative-path point: { fwd, left, up, plane } (plane 1: in Lead's wing plane, a close formation). */
export function slotPoint(key, side, spacingFt) {
  const s = pairSlot(key, side, spacingFt);
  return { fwd: s.fwd, left: s.left, up: s.alt, plane: CLOSE.has(key) ? 1 : 0 };
}

/** A fighting wing side swap (TS-86): how far outside the bubble #2 crosses Lead's six, and how far he drifts back for each foot across (about the tangent of half a 20-25° angle off; both estimates). */
const SWAP_CROSS_MARGIN_FT = 100;
const SWAP_LAG_RATIO = 0.2;

/** Where a crossing behind Lead passes his six, fwd ft: outside the 500 ft bubble by SWAP_CROSS_MARGIN_FT (estimates). */
export const crossBehindFwd = (rangeFt) => -(Math.max(LAG_ROLL.bubbleFt, rangeFt * 0.9) + SWAP_CROSS_MARGIN_FT);

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
  const fwBack = -fwShapeNow().rangeFt; // fighting wing flows across this far behind Lead: the spacing setting (750 ft by default)
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
    const dive = OPEN_OUT.diveFt;
    if (at === 'fw' && side !== sTo) pts.push({ fwd: fwBack, left: side * 300, up: -60, plane: 0 }, { fwd: fwBack, left: 0, up: -60, plane: 0 }, { fwd: fwBack, left: sTo * 300, up: -60, plane: 0 });
    else if (at !== 'fw') {
      if (side !== sTo || at === 'astern') crossClose('astern');
      // out and down at once, no drop back first (Patrick 21:11Z: a tactical formation selected means unrestricted attitude and power)
      pts.push({ fwd: cur.fwd - 20, left: sTo * 110, up: cur.up - 40, plane: 0.5 }, { fwd: -200, left: sTo * 500, up: -0.6 * dive, plane: 0 });
    }
    // A full power dive to start, then the climb back to Lead's height by the slot (OPEN_OUT.diveFt, TS-78; Patrick 21:06Z).
    pts.push({ fwd: -350, left: sTo * spacingFt * 0.35, up: -dive, plane: 0 }, { fwd: -100, left: sTo * spacingFt * 0.8, up: -0.25 * dive, plane: 0 }, slot('lab', sTo));
    return pts;
  }
  if (to === 'fw') {
    if (at === 'fw') {
      // flow to the other side behind Lead (SMM 12.29 para 69), lag then across (Patrick 22:29Z: the side swap is fast;
      // TS-86): #2 angles off across Lead's six at his own speed, so he drifts back as he crosses and needs no overtake,
      // and ends where that leaves him in the cone on the other side (fighting wing ends anywhere in the cone, TS-83). His
      // drift back is SWAP_LAG_RATIO of the way across; the cross stays SWAP_CROSS_MARGIN_FT outside the 500 ft bubble
      // (both estimates), and the end stays inside the band's far edge.
      const across = 2 * Math.abs(cur.left);
      const range = Math.hypot(cur.fwd, cur.left);
      const endFwd = -Math.min(-cur.fwd + SWAP_LAG_RATIO * across, Math.sqrt(Math.max(0, (FW_BAND.rangeFt[1] - 50) ** 2 - cur.left ** 2)));
      const crossFwd = Math.min((cur.fwd + endFwd) / 2, crossBehindFwd(range));
      pts.push({ fwd: crossFwd, left: 0, up: cur.up, plane: 0 }, { fwd: Math.min(endFwd, cur.fwd), left: -cur.left, up: cur.up, plane: 0 });
      return pts;
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

/**
 * A relative path and its time law, started at step k0: slotAt(k) for followInto. Returns { slotAt, endStep }. limit: the
 * speed limit in the frame (relSpeedLimit by default: a rejoin's closure fore and aft).
 */
export function movingSlot(points, k0, limit = relSpeedLimit) {
  const path = relPath(points);
  const law = timeLaw(path, limit);
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

/** The last step a list of roll events still blends at. */
export const eventsEnd = (events) => events.reduce((m, e) => Math.max(m, e.k + Math.ceil(e.blendSec / dt)), 0);

/** Lead's segments for a change: a speed change to the target formation's speed, at the start (full power up, power back down: slow-down.js). */
function leadSpeed(lead, kias, blockFt, withNext = false) {
  if (Math.abs(lead.kias - kias) <= 0.5) return [];
  return [{ ...speedSeg(lead.kias, kias, blockFt), withNext }];
}


/** The last step at which a recorded flight's wings move, searched back from step n, or 0. */
export function lastRollEnd(rec, n) {
  for (let k = n; k > 0; k--) if (Math.abs(rec.at(k).bankDeg - rec.at(k - 1).bankDeg) > 1e-9) return k;
  return 0;
}

/** The overshoot lane and the height check over a planned line: furthest ahead of Lead's 3/9 line inside 1,000 ft, and least height under Lead inside 2,000 ft. */
export function laneAndBelow(leadRec, track, n) {
  let laneFwdFt = -Infinity;
  let minBelowFt = Infinity;
  for (let k = 1; k <= n; k++) {
    const L = leadRec.at(k);
    const r = k + 3;
    const rel = relativeTo(L, { xFt: track.x[r], yFt: track.y[r] });
    const range = Math.hypot(rel.fwd, rel.left);
    if (range < LANE.rangeFt) laneFwdFt = Math.max(laneFwdFt, rel.fwd);
    if (range < LANE.belowRangeFt) minBelowFt = Math.min(minBelowFt, L.altAboveFt - track.z[r]);
  }
  return { laneFwdFt, minBelowFt };
}

/**
 * The follow from step `from`, re-based at every roll Lead starts after it (the formation's own blend), then the poses.
 * Returns { poses, maxBankDeg, minKias, maxKias }.
 */
export function finishLine(track, leadRec, from, slotAt, n, firstBlendSec, events, kiasPerTas, firstDecaySec = firstBlendSec / 2) {
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

// leadTurnSegs (a long turn as flight.js turn segments) lives in manoeuvres.js since V2.59, so transitions.js and
// hand-over.js can use it without an import loop; it is re-exported here for the files that read it from here.
export { leadTurnSegs } from './manoeuvres.js';

// The hot turning rejoin from line abreast lived in hot-rejoin.js until V2.93 (TS-94: a training error's start is now raced by the chooser).
