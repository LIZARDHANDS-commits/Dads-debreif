// The PFL's joins (Traffic spec 4.5 items 6-8): the paths onto the circle (a turn onto it, an intercept, High Key, an
// orbit), the direct to the runway, the square-off when high, and the choosers that pick one. Built on pfl-geometry.js.

import { ktToFtps } from '../../core/units.js';
import { DEG, wrapDeg180, wrapDeg360 } from '../../core/angles.js';
import { bankDegFromG, turnRadiusFromBankFt } from '../../core/flight-math.js';
import { iasToTasKt } from './weather.js';
import { legOffsetsFt } from '../../core/geo.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import {
  PFL, FILLET_MIN_DEG, clamp, dist, bearing, stallG, speedTradeFt, flownGlideRatio, directTurnRadiusFt, glideJoinMinRadiusFt,
  arcToAim, finalToAim, neededFt, neededTo, minDragPlan,
} from './pfl-geometry.js';

function joinPath(geo, from, theta, headingDeg = undefined, rt = directTurnRadiusFt(), minRt = rt, side = 1) {
  const p = geo.at(theta);
  const trk = geo.trackAt(theta);
  const t = { x: Math.sin(trk * DEG), y: Math.cos(trk * DEG) };
  if (!Number.isFinite(headingDeg)) {
    const q = { x: p.x - t.x * PFL.joinLeadFt, y: p.y - t.y * PFL.joinLeadFt };
    const o = legOffsetsFt(q, p, from);
    const lead = o.alongFt > 0 && Math.abs(o.crossFt) < PFL.joinLeadFt / 2 ? [] : [{ x: q.x, y: q.y, plan: 0 }];
    return [{ x: from.x, y: from.y, plan: 0 }, ...lead, ...arcToAim(geo, theta)];
  }
  const turnDeg = wrapDeg360(side * (trk - headingDeg));
  const h = { x: Math.sin(headingDeg * DEG), y: Math.cos(headingDeg * DEG) };
  const v1 = { x: side * (h.y - t.y), y: side * (t.x - h.x) };
  const n = { x: t.y, y: -t.x };
  const offFt = (from.x - p.x) * n.x + (from.y - p.y) * n.y;
  const rate = h.x * n.x + h.y * n.y;
  const per = v1.x * n.x + v1.y * n.y;
  const ht = h.x * t.x + h.y * t.y;
  const along0 = (from.x - p.x) * t.x + (from.y - p.y) * t.y;

  const fit = (r) => {
    let d;
    if (Math.abs(rate) < 0.02) {
      if (Math.abs(offFt + r * per) > 100) return null;
      d = ht < 0 ? Math.max(0, along0 + r * (v1.x * t.x + v1.y * t.y)) : 0;
    } else d = -(offFt + r * per) / rate;
    if (d < 0 || along0 + d * ht + r * (v1.x * t.x + v1.y * t.y) > 0) return null;
    return d;
  };

  const radii = [rt];
  for (let k = 1; k <= 20; k++) radii.push(rt - (rt - minRt) * k / 20);
  if (Math.abs(per) > 1e-6 && -offFt / per >= minRt && -offFt / per < rt) radii.push(-offFt / per);
  radii.sort((x, y) => y - x);
  let d = null;
  for (const r of radii) { d = fit(r); if (d !== null) { rt = r; break; } }
  if (d === null) return null;

  const v = { x: v1.x * rt, y: v1.y * rt };
  const s0 = { x: from.x + h.x * d, y: from.y + h.y * d };
  const e = { x: s0.x + v.x, y: s0.y + v.y };
  if ((e.x - p.x) * t.x + (e.y - p.y) * t.y > 0) return null;

  const c = { x: s0.x + side * rt * h.y, y: s0.y - side * rt * h.x };
  const turn = { cx: c.x, cy: c.y, r: rt, side };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < turnDeg - 1e-6; k += PFL.joinStepDeg) {
    const a = (headingDeg + side * k) * DEG;
    arc.push({ x: c.x - side * rt * Math.cos(a), y: c.y + side * rt * Math.sin(a), plan: 0, arc: turn });
  }
  const straight = d > 1 ? [{ x: s0.x, y: s0.y, plan: 0, arc: turn }] : [];
  const out = dist(e, p) > 1 ? [{ x: e.x, y: e.y, plan: 0 }] : [];
  const first = { x: from.x, y: from.y, plan: 0, ...(d > 1 ? {} : { arc: turn }) };
  return Object.assign([first, ...straight, ...arc, ...out, ...arcToAim(geo, theta)], { turnDeg, turnRadiusFt: rt, straightFt: d });
}

function highKeyPath(geo, from) {
  const run = geo.along(-PFL.highKeyRunInFt);
  return [{ x: from.x, y: from.y, plan: 0 }, { x: run.x, y: run.y, plan: 0 }, { x: geo.th.x, y: geo.th.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }];
}

export function orbitPath(from, trackDeg, r) {
  const h = { x: Math.sin(trackDeg * DEG), y: Math.cos(trackDeg * DEG) };
  const c = { x: from.x - r * h.y, y: from.y + r * h.x };
  const turn = { cx: c.x, cy: c.y, r, side: -1 };
  const pts = [{ x: from.x, y: from.y, plan: 0, arc: turn }];
  for (let k = PFL.joinStepDeg; k < 360 - 1e-6; k += PFL.joinStepDeg) {
    const a = (trackDeg - k) * DEG;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a), plan: 0, arc: turn });
  }
  return pts;
}

function interceptPath(geo, from, theta, trackDeg, turnRadiusFt) {
  if (!Number.isFinite(trackDeg)) return null;
  const p = geo.at(theta);
  const lineTrk = bearing(from, p);
  const first = Math.abs(wrapDeg180(lineTrk - trackDeg));
  const onto = Math.abs(wrapDeg180(geo.trackAt(theta) - lineTrk));
  if (first > 120 || onto > PFL.interceptOntoDeg) return null;
  // The turn onto the circle is planned too: a left turn at the 45° radius that rolls out on the circle at the point,
  // so the straight before it aims at where that turn starts (flown as planned, never a corner cut).
  const rt = directTurnRadiusFt();
  const tp = geo.trackAt(theta);
  const c2 = { x: p.x + rt * Math.sin((tp - 90) * DEG), y: p.y + rt * Math.cos((tp - 90) * DEG) };
  const entryFrom = (e) => {
    const d = dist(e, c2);
    if (d <= rt * 1.01) return null;
    const trv = bearing(e, c2) + Math.asin(rt / d) / DEG;
    const k = Math.sqrt(d * d - rt * rt);
    return { x: e.x + k * Math.sin(trv * DEG), y: e.y + k * Math.cos(trv * DEG), trv };
  };
  let entry = entryFrom(from);
  let arc = leadTurn(from, trackDeg, entry ?? p);
  if (entry && arc.length) entry = entryFrom(arc[arc.length - 1]) ?? entry;
  const exitArc = arc.length ? arc[arc.length - 1] : { x: from.x, y: from.y };
  const ontoPts = [];
  if (entry && wrapDeg180(tp - entry.trv) < -FILLET_MIN_DEG) {
    const turnC = { cx: c2.x, cy: c2.y, r: rt, side: -1 };
    const b0 = bearing(c2, entry), b1 = bearing(c2, p);
    const sweep = wrapDeg360(b0 - b1);
    ontoPts.push({ x: entry.x, y: entry.y, plan: 0, arc: turnC });
    for (let k = PFL.joinStepDeg; k < sweep - 1e-6; k += PFL.joinStepDeg) {
      const b = b0 - k;
      ontoPts.push({ x: c2.x + rt * Math.sin(b * DEG), y: c2.y + rt * Math.cos(b * DEG), plan: 0, arc: turnC });
    }
  }
  const legEnd = ontoPts[0] ?? p;
  const straightLeg = dist(exitArc, legEnd) > 10 ? [{ x: exitArc.x, y: exitArc.y, plan: 0 }] : [];
  const startPts = arc.length ? [{ x: from.x, y: from.y, plan: 0, arc: arc[0].arc }, ...arc, ...straightLeg, ...ontoPts] : [{ x: from.x, y: from.y, plan: 0 }, ...ontoPts];
  return Object.assign([...startPts, ...arcToAim(geo, theta)], { turnDeg: first + onto, straightFt: dist(from, p), turnRadiusFt });
}

function directPath(geo, from, aimAlongFt, gearAtJoin = true, headingDeg = undefined) {
  const straight = directPathFrom(geo, from, aimAlongFt, gearAtJoin);
  const arc = leadTurn(from, headingDeg, straight[1]);
  if (!arc.length) return straight;
  return [straight[0], ...arc, ...directPathFrom(geo, arc[arc.length - 1], aimAlongFt, gearAtJoin).slice(1)];
}

function leadTurn(from, headingDeg, target) {
  if (!Number.isFinite(headingDeg) || !target) return [];
  const off = wrapDeg180(bearing(from, target) - headingDeg);
  if (Math.abs(off) <= 10) return [];
  const side = off > 0 ? 1 : -1;
  const rt = directTurnRadiusFt();
  const c = { x: from.x + rt * Math.sin((headingDeg + side * 90) * DEG), y: from.y + rt * Math.cos((headingDeg + side * 90) * DEG) };
  const turn = { cx: c.x, cy: c.y, r: rt, side };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < 360; k += PFL.joinStepDeg) {
    const h = headingDeg + side * k;
    const b = h - side * 90;
    const p = { x: c.x + rt * Math.sin(b * DEG), y: c.y + rt * Math.cos(b * DEG), plan: 0, arc: turn };
    arc.push(p);
    if (dist(c, target) <= rt || Math.abs(wrapDeg180(bearing(p, target) - h)) <= PFL.joinStepDeg) break;
  }
  return arc;
}

function directPathFrom(geo, from, aimAlongFt, gearAtJoin) {
  const j = geo.along(aimAlongFt - PFL.directFinalFt);
  const rt = directTurnRadiusFt();
  let best = null;
  for (const side of [1, -1]) {
    const n = { x: -geo.u.y * side, y: geo.u.x * side };
    const c = { x: j.x + n.x * rt, y: j.y + n.y * rt };
    const bJ = bearing(c, j);
    const arc = [];
    let len = 0;
    if (dist(from, c) > rt * 1.05) {
      let bestB = bJ, bestErr = Infinity;
      for (let k = 0; k < 360; k += 1) {
        const bb = bJ + side * k;
        const p = { x: c.x + rt * Math.sin(bb * DEG), y: c.y + rt * Math.cos(bb * DEG) };
        const err = Math.abs(wrapDeg180(bearing(from, p) - (bb - side * 90)));
        if (err < bestErr) { bestErr = err; bestB = bb; }
      }
      const turnDeg = Math.abs(bestB - bJ);
      for (let k = 0; k < turnDeg - 1e-6; k += PFL.joinStepDeg) { const bb = bestB - side * k; arc.push({ x: c.x + rt * Math.sin(bb * DEG), y: c.y + rt * Math.cos(bb * DEG), plan: 0 }); }
      len = (arc.length ? dist(from, arc[0]) : dist(from, j)) + rt * turnDeg * DEG;
    } else {
      len = dist(from, j) + Math.PI * rt;
    }
    if (!best || len < best.len) best = { len, arc };
  }
  return [{ x: from.x, y: from.y, plan: 0, key: 'direct' }, ...best.arc, { x: j.x, y: j.y, plan: gearAtJoin ? 1 : 0, key: 'lined_up' }, ...finalToAim(geo, aimAlongFt)];
}

function turnOntoRunway(geo, from, trackDeg, kias, altFt, wind) {
  if (!Number.isFinite(trackDeg)) return [];
  const h = { x: Math.sin(trackDeg * DEG), y: Math.cos(trackDeg * DEG) };
  const nl = { x: -geo.u.y, y: geo.u.x };
  const off = (from.x - geo.th.x) * nl.x + (from.y - geo.th.y) * nl.y;
  const vMax = ktToFtps(iasToTasKt(kias, altFt) + (wind?.windKt ?? 0));
  const bankMax = Math.min(PFL.maxBankDeg, bankDegFromG(Math.max(stallG(kias, 0), 1.0001)));
  const rMin = turnRadiusFromBankFt(vMax, bankMax);
  const rMax = turnRadiusFromBankFt(ktToFtps(iasToTasKt(kias, altFt)), PFL.directMinBankDeg);
  const out = [];
  for (const side of [1, -1]) {
    const hr = { x: side * h.y, y: -side * h.x };
    const k = hr.x * nl.x + hr.y * nl.y + side;
    if (Math.abs(k) < 1e-6) continue;
    const turnDeg = wrapDeg360(side * (geo.rwyDeg - trackDeg));
    if (turnDeg < 3 || turnDeg > 180) continue;
    let r = -off / k, d = 0;
    if (r > rMax) {
      r = Math.max(rMin, directTurnRadiusFt());
      const conv = h.x * nl.x + h.y * nl.y;
      d = Math.abs(conv) < 1e-6 ? -1 : (-r * k - off) / conv;
    }
    if (!(r >= rMin && r <= rMax) || !(d >= 0)) continue;
    const s0 = { x: from.x + h.x * d, y: from.y + h.y * d };
    const c = { x: s0.x + hr.x * r, y: s0.y + hr.y * r };
    const roll = { x: c.x - side * r * geo.u.y, y: c.y + side * r * geo.u.x };
    const rollAlong = (roll.x - geo.th.x) * geo.u.x + (roll.y - geo.th.y) * geo.u.y;
    if (rollAlong > PFL.touchdownFt) continue;
    const turn = { cx: c.x, cy: c.y, r, side };
    const arc = [];
    for (let a = PFL.joinStepDeg; a < turnDeg - 1e-6; a += PFL.joinStepDeg) {
      const hd = (trackDeg + side * a) * DEG;
      arc.push({ x: c.x - side * r * Math.cos(hd), y: c.y + side * r * Math.sin(hd), plan: 0, arc: turn });
    }
    const first = Math.max(PFL.touchdownFt, rollAlong + PFL.directPastRollOutFt);
    for (let along = first; along >= Math.max(rollAlong + PFL.directPastRollOutFt, PFL.directPastRollOutFt) - 1e-6 && along <= geo.lenFt - PFL.stopMarginFt; along -= 250) {
      const start = d > 1 ? [{ x: from.x, y: from.y, plan: 0, key: 'direct' }, { x: s0.x, y: s0.y, plan: 0, arc: turn }] : [{ x: from.x, y: from.y, plan: 0, key: 'direct', arc: turn }];
      const path = [...start, ...arc, { x: roll.x, y: roll.y, plan: 1, key: 'lined_up' }, ...finalToAim(geo, along)];
      out.push({ path, aimAlongFt: along, carriesOnTurn: true });
    }
  }
  return out;
}

export function chooseDirect(geo, from, altFt, kias, wind, trackDeg = undefined, cfgNow = 0) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const last = geo.lenFt - PFL.stopMarginFt;
  const trade = speedTradeFt(kias, altFt, 1);
  const baseAlong = Math.max(500, geo.aimAlongFt);
  const alongs = [];
  for (let d = 0; baseAlong + d <= last + 1e-6 || baseAlong - d >= 500; d += 500) {
    if (baseAlong - d >= 500 && d > 0) alongs.push(baseAlong - d);
    if (baseAlong + d <= last + 1e-6) alongs.push(baseAlong + d);
  }
  const label = (along) => (along > baseAlong + 1 ? 'Turn early, land long' : 'Direct runway');
  const cands = turnOntoRunway(geo, from, trackDeg, kias, altFt, wind).map((c) => ({ ...c, label: label(c.aimAlongFt) }));
  for (const along of alongs) {
    cands.push({ path: directPath(geo, from, along, true, trackDeg), aimAlongFt: along, label: label(along) });
  }
  const spare = (c) => {
    const reach = altFt - neededFt(minDragPlan(c.path), 0, from, altFt, cfgNow, wind) - ground;
    if (reach < -trade) return -Infinity;
    const most = neededFt(c.path.map((p) => ({ ...p, plan: 3 })), 0, from, altFt, Math.max(cfgNow, 3), wind);
    const excess = altFt - most - ground;
    const floatFt = excess > 0 ? excess * flownGlideRatio(3, ground) : 0;
    if (c.aimAlongFt + floatFt > last) return -Infinity;
    return reach;
  };
  const pick = cands.find((c) => spare(c) >= 0) ?? cands.find((c) => spare(c) + trade >= 0);
  return pick ? { kind: 'direct', ...pick } : null;
}

/**
 * The square-off when high (Patrick, 10 Oct 2026; TR-113): a pattern PFL still high with all the drag out flies a wide
 * Low Key, then squares off its turns to Final Key and to the threshold: a straight downwind, about 90° onto base, a
 * straight base through Final Key, about 90° onto final. Final Key itself stays where it is (TR-48; Patrick's card
 * 19:46Z). The corners tighten first, from the circle's own radius to the 45° radius; after that the downwind moves
 * out, up to PFL.maxWidenFt. It is sized so that, with all the drag out, it arrives on profile.
 */
export function squarePath(geo, path, seg, s, trackDeg, altFt, wind, tdKey, cfgNow, th0 = path[seg]?.theta) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  if (th0 === undefined || th0 >= PFL.squareBaseDeg) return null;
  const nl = { x: -geo.u.y, y: geo.u.x };
  const alongOf = (p) => (p.x - geo.th.x) * geo.u.x + (p.y - geo.th.y) * geo.u.y;
  const latOf = (p) => (p.x - geo.th.x) * nl.x + (p.y - geo.th.y) * nl.y;
  const P = (along, lat) => ({ x: geo.th.x + geo.u.x * along + nl.x * lat, y: geo.th.y + geo.u.y * along + nl.y * lat });
  const lk = geo.at(180), fk = geo.at(270);
  const fkAlong = alongOf(fk);
  const out = Math.sign(latOf(lk)) || -1; // the pattern side: wider is further this way
  const rMin = directTurnRadiusFt();
  if (alongOf(s) < fkAlong + rMin) return null;
  const tail = [{ x: geo.th.x, y: geo.th.y, theta: 360, plan: 3, key: 'threshold' }, ...finalToAim(geo, geo.aimAlongFt)];
  const build = (x) => {
    const r = geo.r - (geo.r - rMin) * Math.min(x, 1);
    // The downwind line: Low Key's, moved out as x grows past 1. Reached at about 45° from where the aircraft is (in or
    // out), so that corner is made before Final Key's along-track spot.
    const wanted = out * latOf(lk) + Math.max(0, x - 1) * 1000;
    // Still well before Low Key (room for two turns): straight to the wide Low Key. Otherwise a 45° cut, as far as there is
    // room before Final Key.
    const toLk = alongOf(s) - alongOf(lk);
    const room = Math.max(0, alongOf(s) - fkAlong - 2 * rMin);
    const viaLk = toLk >= 2 * rMin;
    const wide = viaLk ? wanted - out * latOf(s) : clamp(wanted - out * latOf(s), -room, room);
    const lat = out * (out * latOf(s) + wide);
    const corner = { r };
    const atLk = viaLk || th0 < 180;
    // The drag as planned: gear to the wide Low Key, T/O flap from it, landing flap rolling into base (Patrick, 10 Oct 20:06Z).
    const plan = Math.max(atLk ? 1 : 2, cfgNow), wPlan = Math.max(2, cfgNow);
    const pts = [{ x: s.x, y: s.y, theta: th0, plan, square: true }];
    const wAlong = viaLk ? alongOf(lk) : th0 < 180 ? Math.min(alongOf(lk), alongOf(s) - Math.abs(wide)) : alongOf(s) - Math.abs(wide);
    const w = P(wAlong, lat), bc = P(fkAlong, lat), fc = P(fkAlong, 0);
    const useW = atLk || Math.abs(wide) > 1;
    const lead = leadTurn(s, trackDeg, useW ? w : bc).map((p) => ({ ...p, theta: th0, plan, square: true }));
    pts.push(...lead);
    if (useW) pts.push({ ...w, theta: atLk ? 180 : th0, plan: wPlan, ...(atLk ? { key: 'low_key' } : {}), square: true, arc: corner });
    pts.push({ ...bc, theta: PFL.squareBaseDeg, plan: 3, square: true, arc: corner });
    pts.push({ x: fk.x, y: fk.y, theta: 270, plan: 3, key: 'final_key', square: true });
    pts.push({ ...fc, theta: 315, plan: 3, square: true, arc: corner });
    return [...pts, ...tail];
  };
  const spare = (x) => altFt - ground - neededFt(build(x), 0, s, altFt, cfgNow, wind, false, tdKey) - PFL.onProfileFt;
  const xMax = 1 + PFL.maxWidenFt / 1000;
  if (spare(0) <= 0) return null;
  if (spare(xMax) > 0) {
    // Can't burn it all: square off only if that loses more than the path it is on.
    const now = altFt - ground - neededFt(path, seg, s, altFt, cfgNow, wind, false, tdKey) - PFL.onProfileFt;
    return spare(xMax) < now - PFL.onProfileFt ? build(xMax) : null;
  }
  let lo = 0, hi = xMax;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (spare(mid) > 0) lo = mid; else hi = mid; }
  return lo > 0.02 ? build(lo) : null;
}


function joinLabel(theta) {
  if (Math.abs(theta) < 1e-6) return 'Join at High Key';
  if (Math.abs(theta - 180) < 1e-6) return 'Join at Low Key';
  if (Math.abs(theta - 270) < 1e-6) return 'Join at Final Key';
  return `Join at ${Math.round(theta)}°`;
}

// ── Choosing the join ─────────────────────────────────────────────────────────

export function chooseJoin(geo, from, availFt, trackDeg, wind, { allowHighKey = true, turnRadiusFt = directTurnRadiusFt(), minTurnRadiusFt = glideJoinMinRadiusFt(), bankDeg = 0 } = {}) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const hk = highKeyPath(geo, from);
  const atHk = availFt - neededFt(hk, 0, from, availFt, 0, wind, false, 'high_key');
  if (allowHighKey && atHk >= PFL.highKeyMinFt) {
    return { kind: 'highKey', path: [...hk, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'Join at High Key' };
  }

  const leftMaxDeg = bankDeg <= -PFL.inTurnBankDeg ? 270 : 180;
  const isDownwindTrack = Math.abs(wrapDeg180(trackDeg - (geo.rwyDeg - 180))) <= 35;
  const search = (oneTurn) => {
    let best = null, bestHigh = null;
    for (let th = 0; th <= PFL.lastJoinDeg + 1e-6; th += PFL.joinStepDeg) {
      if (th < 45 && (!allowHighKey || atHk < PFL.highKeyMinFt)) continue;
      const tries = oneTurn ? [-1, 1].map((side) => joinPath(geo, from, th, trackDeg, turnRadiusFt, minTurnRadiusFt, side)) : [joinPath(geo, from, th)];
      if (oneTurn) tries.push(interceptPath(geo, from, th, trackDeg, turnRadiusFt));
      const downwindPref = isDownwindTrack && th <= 180 ? -120 : 0;
      const score = (p) => (oneTurn ? p.turnDeg + p.straightFt / 1000 + 1000 * (turnRadiusFt - p.turnRadiusFt) / turnRadiusFt + downwindPref : Math.abs(wrapDeg180(geo.trackAt(th) - trackDeg)) + downwindPref);
      const path = tries.filter((p, k) => p && (!oneTurn || p.turnDeg <= (k === 0 ? leftMaxDeg : 180))).sort((x, y) => score(x) - score(y))[0];
      if (!path) continue;
      const toJoinIdx = path.findIndex((p) => p.theta === th);
      const toJoin = neededTo(path, toJoinIdx, from, availFt, wind);
      const hAtJoin = availFt - toJoin;
      const least = neededFt(minDragPlan(path), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      if (hAtJoin - least - ground < 0) continue;
      const most = neededFt(path.map((p) => ({ ...p, plan: 3 })), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      const pick = { turn: score(path), turnDeg: path.turnDeg ?? 0, th, path };
      const longFt = (hAtJoin - most - ground) * flownGlideRatio(3, ground);
      const landable = th <= PFL.highJoinRoomDeg || geo.aimAlongFt + longFt <= geo.lenFt / 3;
      if (hAtJoin - most - ground <= 0) { if (!best || pick.turn < best.turn - 1e-6) best = pick; }
      else if (landable && (!bestHigh || pick.turn < bestHigh.turn - 1e-6)) bestHigh = pick;
    }
    if (best && bestHigh && best.turnDeg > bestHigh.turnDeg + PFL.fitsExtraTurnDeg) best = null;
    const asJoin = (pick, high) => pick && { kind: 'circle', path: pick.path, theta: pick.th, label: joinLabel(pick.th), high };
    return { best: asJoin(best, false), high: asJoin(bestHigh, true) };
  };

  const one = search(true);
  const run = search(false);
  const join = one.best ?? one.high ?? run.best ?? run.high ?? chooseDirect(geo, from, availFt, PFL.glideCleanKias, wind, trackDeg);
  if (join) return join;
  return { kind: 'none', path: directPath(geo, from, geo.aimAlongFt, true, trackDeg), aimAlongFt: geo.aimAlongFt, label: 'Eject' };
}
