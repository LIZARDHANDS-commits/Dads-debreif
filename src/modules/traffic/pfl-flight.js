// The PFL flown (Traffic spec 4.5): the zoom or level slow-down, then the glide along the chain of the plan, re-planning
// at the keys and when the energy margin says so, the drag ladder, the square-off when high, the round-out and the flare.
// One run object carries the flight's state (the plan, where it is on the chain, the drag, the margin, the outcome) from
// one phase of the step to the next. Built on pfl-geometry.js and pfl-joins.js.

import { ktToFtps, KT_TO_FTPS, G_FTPS2, FT_PER_NM } from '../../core/units.js';
import { DEG, wrapDeg180, wrapDeg360 } from '../../core/angles.js';
import { dampedClimbG, easeValue } from '../../core/flight-math.js';
import { glideDragPerWeight } from '../../core/t6-performance.js';
import { iasToTasKt, heightFactor } from './weather.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, PILOT_DT } from './circuit.js';
import { RUNWAY_29L_HDG_DEG, THRESHOLD_DATA_ELEV_FT, PFL_KEY_ALT_FT } from './airfield.js';
import {
  PFL, PFL_CONFIGS, PFL_CONFIG_LABELS, clamp, dist, bearing, stallG, glideKias, tradeFloorKias, speedTradeFt, speedAboveFt,
  flownGlideRatio, orbitRadiusFt, pflGeometry, obviouslyShort, zoomPitchStep, zoomBank, flyZoomPlan, buildChain,
  chainLocate, chainBank, chainSum, chainFtTo, planAt, arcToAim, neededFt, minDragPlan,
} from './pfl-geometry.js';
import { chooseJoin, chooseDirect, squarePath, orbitPath } from './pfl-joins.js';

const MAX_STEPS = 25000;

/** The point a zoom turns toward: the join on the circle, the line-up point of a direct, or the plan's next point. */
function zoomAim(plan, from) {
  const p = plan?.path ?? [];
  return p.find((q) => q.theta !== undefined || q.key === 'lined_up') ?? p[1] ?? from;
}

// ── The run and its helpers ───────────────────────────────────────────────────

/** A new path to fly from here: its chain is built once, and the aircraft flies it from its start. */
function usePath(r, p) {
  r.path = p;
  r.chain = buildChain(r.path);
  r.loc = chainLocate(r.chain, 0, r.s);
  r.seg = r.chain.pieces[r.loc.idx]?.owner ?? 0;
  r.planFromN = r.n;
}

function replan(r, next) {
  r.plan = next;
  usePath(r, next.path.map((p, i) => (i === 0 ? { ...p, x: r.s.x, y: r.s.y } : p)));
}

/** Height needed from where the aircraft is on its own chain (the planned drag of `p`, which has the same points as path). */
function need(r, p, cfgNow, takeNext = false, stopAtKey = 'aim', maxPlan = 3) {
  const stop = p.findIndex((q) => q.key === stopAtKey);
  if (stop >= 0 && stop <= r.seg) return 0;
  const base = takeNext ? Math.min(3, cfgNow + 1) : cfgNow;
  return chainSum(r.chain, (o) => p[o]?.plan ?? 0, r.loc.idx, r.loc.along, r.s.alt, r.wind, { base, maxPlan, stopOwner: stop >= 0 ? stop : Infinity, kiasNow: r.s.ias });
}

function ftTo(r, key) {
  const stop = r.path.findIndex((q) => q.key === key);
  return chainFtTo(r.chain, r.loc.idx, r.loc.along, stop >= 0 ? stop : Infinity);
}

const calcMarginTag = (m) => (m > 150 ? 'high' : m < -PFL.onProfileFt ? 'low' : 'on profile');

function getSegmentType(r) {
  if (r.state === 'zoom') return 'zoom';
  if (r.state === 'slow') return 'decel';
  if (r.roundOut?.flare) return 'flare';
  if (r.roundOut) return 'roundout';
  return r.chain.pieces[r.loc.idx]?.kind === 'arc' ? 'arc' : 'straight';
}

function setRec(r, decision, extra = {}) {
  r.s.rec = {
    decision,
    config: PFL_CONFIG_LABELS[r.cfg],
    cfgIndex: r.cfg,
    segmentType: extra.segmentType ?? getSegmentType(r),
    marginFt: extra.marginFt !== undefined ? extra.marginFt : (Number.isFinite(r.margin) ? Math.round(r.margin) : null),
    marginTag: extra.marginTag !== undefined ? extra.marginTag : (Number.isFinite(r.margin) ? calcMarginTag(r.margin) : null),
    ...extra,
  };
}

const tdKeyOf = (r) => (r.path.some((p) => p.key === 'touchdown') ? 'touchdown' : 'aim');

function marginNow(r) {
  const tdKey = tdKeyOf(r);
  return r.cfg >= 3 ? r.s.alt - r.ground - need(r, r.path, r.cfg, false, tdKey) : r.s.alt - r.ground - need(r, r.path, r.cfg, false, 'aim', 2);
}

function onCircle(r) {
  const { path, seg } = r;
  return path[seg]?.theta !== undefined ||
    path[seg]?.falseCircle ||
    ['threshold', 'touchdown', 'aim', 'rollout'].includes(path[seg]?.key) ||
    r.plan.kind === 'direct';
}

// ── The start: the first plan ─────────────────────────────────────────────────

function startRun(start, wind, options) {
  const practice = Boolean(options.practice);
  const geo = pflGeometry(wind.windFromDeg, wind.windKt, options.settings);
  const ground = THRESHOLD_DATA_ELEV_FT;
  const mid = options.midGlide ?? null;

  const pilot = makePilot(
    {
      x: start.x,
      y: start.y,
      alt: start.alt,
      ias: start.kias,
      hdg: start.headingDeg ?? RUNWAY_29L_HDG_DEG,
      src: 0,
      phase: mid ? 'pfl' : start.kias > PFL.zoomAboveKias ? 'pfl_zoom' : 'pfl',
    },
    wind
  );

  const { s } = pilot;
  s.bank = Number.isFinite(start.bankDeg) ? start.bankDeg : 0;
  s.rollRate = Number.isFinite(start.rollRateDps) ? start.rollRateDps : 0;
  // Gear and flap already down stay down: with the engine failed there is no hydraulic pressure to raise them
  // (Patrick, 11 Oct 08:43Z), so the glide starts in the aircraft's configuration and only ever adds drag.
  const cfg = clamp(Math.round((mid ? mid.cfgIndex : start.cfgIndex) ?? 0), 0, 3);
  s.rec = { decision: '', config: PFL_CONFIG_LABELS[cfg] };
  const notes = [];

  // The zoom is planned first, so the join is chosen from where the zoom really ends (spec 4.5 items 5, 6).
  const zooming = !mid && start.kias > PFL.zoomAboveKias;
  const startHdg = start.headingDeg ?? RUNWAY_29L_HDG_DEG;
  let zoomTrackDeg = null;
  let plan;
  let planFrom = { x: start.x, y: start.y, alt: start.alt, trackDeg: start.headingDeg ?? RUNWAY_29L_HDG_DEG };
  if (mid?.plan) {
    plan = mid.plan;
  } else if (zooming) {
    const straight = flyZoomPlan(start, wind, startHdg);
    const first = chooseJoin(geo, straight, straight.alt, straight.trackDeg, wind, { bankDeg: straight.bankDeg });
    zoomTrackDeg = bearing(start, zoomAim(first, straight));
    if (Math.abs(wrapDeg180(zoomTrackDeg - startHdg)) < 5) zoomTrackDeg = startHdg;
    const top = zoomTrackDeg === startHdg ? straight : flyZoomPlan(start, wind, zoomTrackDeg);
    plan = chooseJoin(geo, top, top.alt, top.trackDeg, wind, { bankDeg: top.bankDeg });
    planFrom = top;
  } else {
    // Slowing level to 125 KIAS: the speed above it is height in hand (energy height, spec 4.5 item 6).
    const avail = start.alt + speedAboveFt(start.kias, PFL.glideCleanKias, start.alt);
    plan = chooseJoin(geo, s, avail, startHdg, wind, { bankDeg: s.bank });
    planFrom = { x: s.x, y: s.y, alt: avail, trackDeg: startHdg };
  }

  if (!mid?.plan && Math.hypot(s.x - geo.th.x, s.y - geo.th.y) <= PFL.atHighKeyFt && s.alt >= PFL.highKeyMinFt) {
    plan = { kind: 'highKey', path: [{ x: s.x, y: s.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'At High Key' };
    zoomTrackDeg = startHdg;
  }

  const patternPfl = mid ? Boolean(mid.patternPfl) : !practice && plan.kind !== 'highKey' && plan.kind !== 'direct';
  // A pattern PFL that starts high near the circle is squared off from the start (TR-113), rather than flown onto a high join first.
  if (!mid?.plan && patternPfl && plan.kind === 'circle' && plan.theta < PFL.squareBaseDeg && dist(geo.th, planFrom) <= PFL.squareWithinFt) {
    const sq = squarePath(geo, plan.path, 0, planFrom, planFrom.trackDeg, planFrom.alt, wind, 'aim', cfg, plan.theta);
    if (sq) {
      plan = { ...plan, path: sq, label: 'Square off' };
      notes.push(`squared off at ${Math.round(start.alt)} ft`);
    }
  }
  const path = plan.path;

  const r = {
    // Fixed for the run.
    practice, geo, ground, mid, wind, pilot, s, notes, planLog: [], startHdg, zooming, patternPfl,
    // The plan and where the aircraft is on it.
    plan, path, chain: buildChain(path), loc: { idx: 0, along: 0, left: 0, trk: startHdg, pt: { x: s.x, y: s.y } }, seg: 0,
    zoomTrackDeg, state: mid ? 'glide' : zooming ? 'zoom' : 'slow', lastKey: undefined, pastLowKey: false,
    // The step count and the steps things last happened at.
    n: 0, planFromN: 0, lastConfigChangeN: -100, lastSquareN: -1e9, ejectAtN: null,
    // The drag, the margin and the round-out.
    cfg, margin: 0, roundOut: null, goingShort: false,
    // The pitch: flight path angle and G between steps.
    z: { gamma: mid ? -Math.asin(clamp(glideDragPerWeight(PFL_CONFIGS[cfg], start.kias, start.alt, 1), 0, 1)) : 0, nz: 1, nzRate: 0, pullDone: false },
    // How it ends.
    outcome: null, touchdown: null, eject: null, gate: null,
  };

  r.margin = marginNow(r);
  setRec(r, mid ? (mid.decision || plan.label) : zooming ? `Zoom: ${plan.label.toLowerCase()}` : `Slow to 125: ${plan.label.toLowerCase()}`);
  s.tag = undefined;
  pilot.record();

  // No join and no runway: glide on toward the runway to Low Key or its height, then eject (spec 4.5 items 10, 15; TR-53).
  if (plan.kind === 'none' || plan.label === 'Eject') {
    r.goingShort = true;
    notes.push(`can't make the runway (${Math.round(s.alt)} ft MSL)`);
    setRec(r, "Can't make it: ejecting");
  }
  return r;
}

// ── The phases of one step ────────────────────────────────────────────────────

/** Passing a point of the path: the key tag, and at High Key the orbit, the false High Key or carrying on. */
function passPoint(r) {
  const { s, geo, ground, wind } = r;
  const passed = r.path[r.seg];
  if (r.state === 'zoom' || !passed || passed === r.lastKey) return;
  r.lastKey = passed;
  if (passed.key && ['high_key', 'low_key', 'final_key'].includes(passed.key)) s.tag = passed.key;
  if (passed.key === 'low_key') r.pastLowKey = true;
  if (!passed.highKeyCheck) return;
  const rest = r.path.slice(r.seg + 1);
  let lapPath = null, lapClean = Infinity;
  if (s.alt > PFL.highKeyMaxFt) {
    const lap = orbitPath(s, geo.rwyDeg, orbitRadiusFt());
    lapPath = [...lap.map((p, i) => ({ ...p, plan: i ? 0 : r.cfg })), { x: geo.th.x, y: geo.th.y, theta: 0, plan: 0, key: 'high_key', highKeyCheck: true }];
    lapClean = neededFt(lapPath, 0, s, s.alt, 0, wind, false, 'high_key');
  }
  if (lapPath && s.alt - lapClean >= PFL.highKeyMinFt) {
    if (s.alt - lapClean > PFL.highKeyMaxFt && r.cfg < 1) {
      r.cfg = 1;
      r.lastConfigChangeN = r.n;
      r.notes.push('gear early to make the High Key window');
    }
    usePath(r, [...lapPath.map((p) => ({ ...p, plan: Math.max(p.plan, r.cfg) })), ...arcToAim(geo, PFL.joinStepDeg)]);
    setRec(r, r.cfg ? 'Orbit at High Key, gear early' : 'Orbit at High Key');
  } else if (s.alt > PFL.highKeyMinFt) {
    if (lapPath && r.cfg < 1) {
      r.cfg = 1;
      r.lastConfigChangeN = r.n;
      r.notes.push('gear early: an orbit would end below the High Key window');
    }
    const hkProfile = ground + neededFt([{ x: geo.th.x, y: geo.th.y, plan: 1 }, ...arcToAim(geo, PFL.joinStepDeg)], 0, geo.th, s.alt, 1, wind, false, 'aim', 2);
    const excess = Math.max(0, s.alt - Math.max(PFL.highKeyMinFt, hkProfile));
    const d = Math.max(0, excess / 2 * heightFactor(s.alt) * flownGlideRatio(Math.max(r.cfg, 1), s.alt));
    const off = { x: geo.u.x * d, y: geo.u.y * d };
    const fhk = { x: geo.th.x + off.x, y: geo.th.y + off.y };
    const semi = [];
    for (let th = PFL.joinStepDeg; th <= 180 + 1e-6; th += PFL.joinStepDeg) {
      const p = geo.at(th);
      semi.push({ x: p.x + off.x, y: p.y + off.y, plan: 1, falseCircle: true, arc: { r: geo.r }, ...(th > 180 - 1e-6 ? { key: 'false_low_key' } : {}) });
    }
    const lk = geo.at(180);
    usePath(r, [{ x: s.x, y: s.y, plan: 1 }, { ...fhk, plan: 1, key: 'false_high_key', falseCircle: true }, ...semi, { x: lk.x, y: lk.y, theta: 180, plan: planAt(180), key: 'low_key' }, ...arcToAim(geo, 180 + PFL.joinStepDeg)]);
    setRec(r, 'False High Key');
  } else {
    usePath(r, [{ x: s.x, y: s.y, plan: r.cfg }, ...rest]);
  }
  r.lastKey = r.path[r.seg];
}

/** Bank: the zoom turns onto its planned track; the glide flies its chain; past the threshold it holds the centreline. */
function bankNow(r, bankMax) {
  const { s, pilot, geo, path, seg } = r;
  if (r.state === 'zoom') return zoomBank(pilot, r.n, r.zoomTrackDeg ?? r.startHdg);
  if (r.n * PILOT_DT < PFL.holdBankSec) return s.bank;
  if (r.roundOut || path.slice(0, seg + 1).some((p) => p.key === 'threshold') || ['threshold', 'aim', 'touchdown', 'rollout'].includes(path[seg]?.key)) {
    const offRwy = legOffsetsFt(geo.th, geo.dep, s);
    const corrDeg = clamp(-offRwy.crossFt * 0.15, -45, 45);
    const wantHdg = pilot.headingFor(wrapDeg360(geo.rwyDeg + corrDeg));
    const trkErr = Math.abs(wrapDeg180(pilot.trackDeg() - geo.rwyDeg));
    const maxB = Math.abs(offRwy.crossFt) > 50 || trkErr > 15 ? bankMax : 15;
    return bankFor(wantHdg, s, maxB);
  }
  return chainBank(r.chain, r.loc, pilot, r.wind, bankMax);
}

/** Pitch and speed: the zoom's nose, or the glide at its speed with the round-out and flare. Returns climb and acceleration. */
function pitchNow(r, tas) {
  const { s, pilot, geo, z } = r;
  if (r.state === 'zoom') {
    const st = zoomPitchStep(z, s, tas, PILOT_DT);
    if (st.done) {
      r.state = 'glide';
      usePath(r, r.path.map((p, i) => (i === 0 ? { ...p, x: s.x, y: s.y } : p)));
    }
    return { climb: st.climb, accel: st.accel };
  }
  let want = glideKias(r.cfg);
  if (r.state === 'slow' && s.ias <= PFL.glideCleanKias + 0.5) r.state = 'glide';

  if (r.plan.kind === 'direct' && r.margin < 0 && !r.goingShort && (ftTo(r, 'aim') < FT_PER_NM || s.alt <= PFL.gateAltFt)) {
    const v2 = tas * tas - 2 * G_FTPS2 * -r.margin * heightFactor(s.alt);
    const vKt = Math.sqrt(Math.max(v2, 0)) / KT_TO_FTPS;
    want = Math.max(tradeFloorKias(r.cfg), Math.min(want, vKt * PFL.glideGearKias / Math.max(iasToTasKt(PFL.glideGearKias, s.alt), 1)));
  }

  const turnG = Math.tan(s.bank * DEG) * Math.cos(z.gamma);
  const dw = glideDragPerWeight(PFL_CONFIGS[r.cfg], s.ias, s.alt, Math.max(Math.hypot(z.nz, turnG), 0.5));
  const hAgl = s.alt - r.ground;
  const linedUp = hAgl <= PFL.preFlareFt && Math.abs(wrapDeg180(pilot.trackDeg() - geo.rwyDeg)) <= PFL.roundOutTrackDeg;
  if (linedUp && !r.roundOut) {
    r.roundOut = { flare: false };
    s.rec.segmentType = getSegmentType(r);
    r.notes.push(`round-out at ${Math.round(s.ias)} KIAS`);
  }
  if (r.roundOut) want = Math.min(want, PFL.thresholdKias[r.cfg]);

  const wantTas = ktToFtps(iasToTasKt(want, s.alt));
  const wantAccel = clamp((wantTas - tas) / 3, -PFL.maxAccelG * G_FTPS2, PFL.maxAccelG * G_FTPS2);
  let wantGamma = r.state === 'slow' ? 0 : Math.asin(clamp(-dw - wantAccel / G_FTPS2, -1, 1));

  if (r.roundOut) {
    const sinkNow = -tas * Math.sin(z.gamma);
    if (!r.roundOut.flare && hAgl <= Math.max(PFL.flareFromFt, sinkNow * PFL.flareTauSec)) {
      r.roundOut.flare = true;
      s.rec.segmentType = getSegmentType(r);
      r.notes.push(`flare at ${Math.round(hAgl)} ft, ${Math.round(s.ias)} KIAS`);
    }
    if (r.roundOut.flare) wantGamma = -Math.asin(clamp(Math.max(PFL.flareTouchSinkFtps, hAgl / PFL.flareTauSec) / tas, 0, 1));
    else if (s.ias > PFL.thresholdKias[r.cfg] + 0.5) wantGamma = Math.max(wantGamma, -PFL.preFlareDeg * DEG);
  }

  const nzHigh = Math.sqrt(Math.max(0, Math.min(PFL.glideMaxG, stallG(s.ias, r.cfg)) ** 2 - turnG ** 2));
  const nzWant = clamp(dampedClimbG(z.gamma, wantGamma, tas), 0, Math.max(nzHigh, Math.cos(z.gamma)));
  const eased = easeValue(z.nz, z.nzRate, nzWant, PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
  z.nz = eased.bankDeg;
  z.nzRate = eased.rollRateDps;
  z.gamma += G_FTPS2 * (z.nz - Math.cos(z.gamma)) / tas * PILOT_DT;
  return { climb: tas * Math.sin(z.gamma), accel: -G_FTPS2 * (dw + Math.sin(z.gamma)) };
}

/** The margin, the re-plan, the drag ladder, the square-off and the decision: once a second (spec 4.5 item 7). */
function everySecond(r, onFinal) {
  const { s, pilot, geo, ground, wind, n } = r;
  const tdKey = tdKeyOf(r);
  r.margin = marginNow(r);
  const marginMin = s.alt - ground - need(r, minDragPlan(r.path), Math.min(r.cfg, 1), false, r.cfg >= 3 ? tdKey : 'aim');
  const settled = (n - r.planFromN) * PILOT_DT >= PFL.planGraceSec;
  const inOrbit = s.rec.decision?.startsWith('Orbit') || s.rec.decision?.startsWith('False High Key') || s.alt > PFL.highKeyMaxFt;
  if (!onFinal && settled && !inOrbit && marginMin < -PFL.planGraceUnlessShortFt && r.plan.kind !== 'direct') {
    const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), r.cfg);
    if (direct) { replan(r, direct); r.notes.push(`went direct at ${Math.round(s.alt)} ft`); }
  } else if (!onFinal && r.plan.kind === 'direct' && marginMin + speedTradeFt(s.ias, s.alt, r.cfg) < 0) {
    const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), r.cfg);
    if (direct && direct.aimAlongFt > (r.plan.aimAlongFt ?? 0) + 1) replan(r, direct);
  }

  dragLadder(r, onFinal, marginMin, tdKey);

  // Still high with all the drag out: a pattern PFL squares off (TR-113). Area and High Key PFLs lose height before High Key.
  // Still on the way to the join counts too: a high downwind start squares off from where it is.
  const nearCircle = dist(geo.th, s) <= PFL.squareWithinFt;
  const thNow = r.path[r.seg]?.theta ?? (r.plan.kind === 'circle' && nearCircle && !r.path.slice(0, r.seg + 1).some((p) => p.theta !== undefined) ? r.plan.theta : undefined);
  const canSquare = r.patternPfl && r.plan.kind !== 'direct' && thNow !== undefined && thNow < PFL.squareBaseDeg && Math.abs(s.bank) <= 30 && (n - r.lastSquareN) * PILOT_DT >= PFL.squareEverySec;
  if (canSquare && s.alt - ground - need(r, r.path, 3, false, tdKey) > PFL.widenAboveFt) {
    const sq = squarePath(geo, r.path, r.seg, s, pilot.trackDeg(), s.alt, wind, tdKey, r.cfg, thNow);
    if (sq) {
      usePath(r, sq);
      r.lastSquareN = n;
      r.notes.push(`squared off at ${Math.round(s.alt)} ft`);
      r.margin = marginNow(r);
    }
  }

  setRec(r, decisionNow(r));
}

/** The drag ladder: gear, T/O flap, landing flap, one step at a time, at least 5 s apart (Fable F6). */
function dragLadder(r, onFinal, marginMin, tdKey) {
  const { s, geo, ground, path, seg, plan, margin, n } = r;
  const directDragOk = plan.kind === 'direct' && (path[seg]?.key === 'lined_up' || onFinal || s.alt <= ground + 200 || dist(geo.th, s) <= 4 * FT_PER_NM);
  const circleDragOk = plan.kind !== 'direct' && onCircle(r);
  const dragOk = directDragOk || circleDragOk;
  const notLow = marginMin >= -PFL.dragBufferFt;
  const dragSpacingOk = (n - r.lastConfigChangeN) * PILOT_DT >= PFL.minConfigIntervalSec;
  if (!dragSpacingOk || !notLow) return;
  if (r.cfg < 1) {
    const gearFits = s.alt - ground - need(r, minDragPlan(path), 1) + speedTradeFt(s.ias, s.alt, 1) >= 0;
    const directOk = plan.kind === 'direct' && (
      ((path[seg]?.key === 'lined_up' || onFinal) && gearFits) ||
      s.alt <= ground + 200 ||
      (dist(geo.th, s) <= 4 * FT_PER_NM && s.alt - ground - need(r, path, 1, true, 'aim', 2) >= PFL.dragBufferFt)
    );
    const circleOk = plan.kind !== 'direct' && (
      ((s.tag === 'high_key' || s.tag === 'low_key' || (path[seg]?.theta ?? 0) >= 180) && margin >= -PFL.onProfileFt) ||
      (s.alt <= PFL.gateAltFt + 300) ||
      (r.patternPfl && dist(geo.th, s) <= PFL.earlyGearWithinFt && s.alt - ground - need(r, path, r.cfg, true, 'aim', 2) >= PFL.dragBufferFt)
    );
    if (directOk || circleOk) {
      r.cfg = 1;
      r.lastConfigChangeN = n;
    }
  } else if (dragOk && r.cfg === 2) {
    const offRwy = legOffsetsFt(geo.th, geo.dep, s);
    const canLandingFlap = onFinal || (path[seg]?.theta !== undefined && path[seg].theta >= 225) || (plan.kind === 'direct' && path[seg]?.key === 'lined_up') || (offRwy.alongFt <= -1000 && Math.abs(offRwy.crossFt) <= 500);
    if (canLandingFlap && s.alt - ground - need(r, path, 3, false, tdKey) >= 0) {
      r.cfg = 3;
      r.lastConfigChangeN = n;
    }
  } else if (dragOk && r.cfg === 1) {
    const due = (path[seg]?.plan ?? 0) > r.cfg;
    const earlyOk = (path[seg]?.theta !== undefined && path[seg].theta >= 180) || onFinal || (margin > PFL.keysCarryHighFt && dist(geo.th, s) <= 3 * FT_PER_NM) || margin > PFL.dragBufferFt;
    if (due ? margin >= -PFL.onProfileFt : earlyOk && s.alt - ground - need(r, path, r.cfg, true, 'aim', 2) >= PFL.dragBufferFt) {
      r.cfg = 2;
      r.lastConfigChangeN = n;
    }
  }
}

/** What the pilot is doing, as the screen shows it. */
function decisionNow(r) {
  const { s, path, seg, plan } = r;
  if (plan.kind === 'direct') return (s.alt <= PFL.gateAltFt && s.ias < PFL.glideGearKias - 2) ? 'Trading speed' : plan.label;
  if (path[seg]?.falseCircle) return path.slice(0, seg + 1).some((p) => p.key === 'false_low_key') ? 'False Low Key' : 'False High Key';
  if (s.rec.decision?.startsWith('Orbit') && path[seg]?.key !== 'threshold' && seg < path.findIndex((p) => p.highKeyCheck)) return s.rec.decision;
  if (!onCircle(r)) return plan.label;
  const word = calcMarginTag(r.margin);
  const th = path[seg]?.theta;
  const sq = path[seg]?.square;
  const leg = th === undefined || th >= 360 ? 'Final'
    : sq ? (th < 180 ? 'To wide Low Key' : th < PFL.squareBaseDeg ? 'Wide downwind' : th < 315 ? 'Base' : 'To threshold')
    : th < 180 ? 'To Low Key' : th < 270 ? 'To Final Key' : 'To threshold';
  return `${leg}, ${word}`;
}

/** The 2,100 ft gate (TR-R14): checked once, flagged, and a practice that misses it goes around. Returns true to stop. */
function checkGate(r) {
  const { s, pilot, geo } = r;
  if (!(!r.gate && s.alt <= PFL.gateAltFt && r.state !== 'zoom')) return false;
  const trk = pilot.trackDeg();
  const offDeg = Math.abs(wrapDeg180(trk - geo.rwyDeg));
  const ok = offDeg <= PFL.gateTrackDeg && s.ias >= PFL.gateKias - 1;
  r.gate = { ok, offDeg, kias: s.ias, flags: [] };
  if (Math.abs(s.bank) > PFL.gateFlagBankDeg) r.gate.flags.push('bank over 45°');
  if (r.cfg < 1) r.gate.flags.push('gear up');
  if (r.cfg < 2) r.gate.flags.push('no T/O flap');
  if (!ok && r.practice) {
    r.outcome = 'go_around';
    setRec(r, 'Gate missed: go around');
    pilot.record();
    return true;
  }
  return false;
}

/** After the move: eject when short, record, and land or eject on reaching the ground. Returns true to stop. */
function checkEnd(r) {
  const { s, pilot, geo, ground } = r;
  if (r.ejectAtN !== null ? r.n >= r.ejectAtN : r.goingShort && (r.pastLowKey || s.alt <= PFL_KEY_ALT_FT.lowKey)) {
    r.outcome = 'eject';
    r.eject = { x: s.x, y: s.y, alt: s.alt };
    setRec(r, 'Eject');
    pilot.record();
    return true;
  }

  if (s.k % 4 === 2 && s.alt > ground) pilot.record();

  if (s.alt <= ground) {
    s.alt = ground;
    const o = legOffsetsFt(geo.th, geo.dep, s);
    const onRwy = o.alongFt >= 0 && o.alongFt <= geo.lenFt && Math.abs(o.crossFt) <= 150;
    r.outcome = onRwy ? 'landed' : 'eject';
    if (onRwy) r.touchdown = { x: s.x, y: s.y, alongFt: o.alongFt, kias: s.ias };
    else r.eject = { x: s.x, y: s.y, alt: s.alt };
    setRec(r, onRwy ? (o.alongFt > geo.lenFt / 3 ? 'Touchdown past the first third' : 'Touchdown') : 'Eject');
    pilot.record();
    return true;
  }
  return false;
}

/** One step of the flight. Returns true when the flight has ended. */
function stepPfl(r) {
  const { s, pilot } = r;
  s.rec.tSec = Math.round(r.n * PILOT_DT * 100) / 100;
  s.rec.segmentType = getSegmentType(r);
  if (Number.isFinite(r.margin)) {
    s.rec.marginFt = Math.round(r.margin);
    s.rec.marginTag = calcMarginTag(r.margin);
  }
  if (r.planLog[r.planLog.length - 1]?.plan.path !== r.path) {
    r.planLog.push({ at: pilot.points.length, plan: { ...r.plan, path: r.path } });
  }

  const tas = ktToFtps(iasToTasKt(s.ias, s.alt));
  if (r.state !== 'zoom') {
    r.loc = chainLocate(r.chain, r.loc.idx, s);
    r.seg = r.chain.pieces[r.loc.idx]?.owner ?? r.seg;
  }

  passPoint(r);

  const stallBank = Math.acos(clamp(1 / Math.max(stallG(s.ias, r.cfg), 1.0001), 0, 1)) / DEG;
  const bankMax = r.state === 'zoom' ? PFL.zoomMaxBankDeg : Math.min(PFL.maxBankDeg, stallBank);
  const onFinal = ['threshold', 'touchdown', 'aim', 'rollout', 'lined_up'].includes(r.path[r.seg]?.key) || r.path.slice(0, r.seg + 1).some((p) => p.key === 'threshold');

  const bank = bankNow(r, bankMax);
  const { climb, accel } = pitchNow(r, tas);

  if (!r.goingShort && r.state === 'glide' && r.n % 10 === 0) everySecond(r, onFinal);

  if (r.state === 'glide' && s.phase === 'pfl_zoom') {
    s.phase = 'pfl';
    if (!r.practice && r.ejectAtN === null && !r.goingShort && obviouslyShort(r.geo, s, r.cfg, r.wind)) {
      r.ejectAtN = r.n + Math.round(PFL.ejectDecideSec / PILOT_DT);
      r.goingShort = true;
      r.notes.push(`obviously short at ${Math.round(s.alt)} ft`);
      setRec(r, "Can't make it: ejecting");
    }
  }

  if (checkGate(r)) return true;

  pilot.step(bank, climb, accel);

  return checkEnd(r);
}

/**
 * Flies a PFL from `start` and records it: the zoom (or the level slow-down), then the glide along the chain of the
 * plan, re-planning at the keys and when the energy margin says so, the drag ladder, the square-off when high, the
 * round-out and the flare (spec 4.5). Returns { points, outcome, touchdown, eject, gate, plan, patternPfl, planLog, notes }.
 */
export function flyPfl(start, wind = { windFromDeg: 360, windKt: 0 }, options = {}) {
  const r = startRun(start, wind, options);
  for (r.n = 0; r.n < MAX_STEPS; r.n++) {
    if (stepPfl(r)) break;
  }

  const { s } = r;
  if (!r.outcome) {
    r.outcome = 'eject';
    r.eject = { x: s.x, y: s.y, alt: s.alt };
    r.notes.push('ran out of steps');
  }

  const points = r.pilot.points.map((p) => ({
    ...p,
    phase: p.phase ?? 'pfl',
    kias: p.kt,
    segmentType: p.segmentType ?? (p.phase === 'pfl_zoom' ? 'zoom' : 'straight'),
    marginFt: p.marginFt ?? null,
    marginTag: p.marginTag ?? null,
  }));
  return { points, outcome: r.outcome, touchdown: r.touchdown, eject: r.eject, gate: r.gate, plan: r.plan.kind, patternPfl: r.patternPfl, planLog: r.planLog, notes: r.notes };
}
