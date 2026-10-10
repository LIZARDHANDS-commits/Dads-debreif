// The turning rejoin with a roll, "TRJ + roll" (Patrick 6 Oct 16:02Z: "a "barrel/lag roll" turning rejoin, where 2 does the
// "most efficient" rolling aerobatic to get on the line faster ... It won't always work so it can just be a "if it makes
// sense" move"; card "Either, pick quicker"; 16:22Z: "the rolls are their own separate buttons, only roll if those are
// pressed, otherwise it's a normal rejoin"). The SMM and EFIG have no rolling rejoin; the nearest pages are SMM 12.24 paras
// 56-58 and Fig 12.15 (the turning rejoin and its line), SMM 12.29 para 69 (using the vertical) and SMM 14.8 paras 18-19,
// Fig 14.1, Table 14.1 (the barrel roll). Every number in ROLLING_REJOIN is an estimate unless a page or ruling is named
// beside it. Approach and dry runs: turn-sim-review/rolling-rejoin/approach.md (project files).
//
// How it is planned. Lead turns into #2 exactly as in the plain turning rejoin (lead-turn-in.js leadTurnInto, 30° of bank held
// until #2 is in). #2 flies a roll from the press, then the plain turning rejoin's own search (turning-rejoin.js
// searchTurningRejoin) from where he rolls out. The roll is flown the way fluid manoeuvring flies Lead's barrel roll
// (fluid-lead.js): a planned nose path followed at a set G on the point mass (core point-mass.js: full power, the T-6A's
// drag, roll rate and stick shaker), so his speed, height and energy are the aircraft's own. Two shapes, each with the nose
// coming back to the horizon and the heading swung the way Lead turns:
//  - the barrel roll: the nose circles a point 45° off his heading (SMM 14.8 para 19's circle), up first and over the top
//    inverted, rolling toward Lead's turn or away from it;
//  - the high yo-yo: the nose up and back down, the heading swinging over the top.
// Of the rolls that stay outside Lead's 500 ft bubble, the quickest to IN POSITION (the roll plus the turning rejoin after
// it) is the plan. The chooser races it against the plain turning rejoin and flies the quicker, the card saying which
// (chooser.js). From a normal line abreast the plain rejoin is usually quicker; the roll pays when #2 is hot, swept forward
// of abeam.
//
// Conventions as the rest of the live code: x east, y north, z up, feet and seconds; heading in math radians (0 east,
// counter-clockwise); fwd and left in Lead's frame (left positive); bank left wing down positive.
import { relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, speedSeg } from './replay.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, pairSlot, LANE, sideFor } from './slots.js';
import { KIAS_OUTSIDE_LAB, REJOIN, TURNING_REJOIN, LAG_ROLL, G_RULE_BANK_DEG } from './tuning.js';
import { fromStep, wingFromPose } from './hand-over.js';
import { leadTurnInto } from './lead-turn-in.js';
import { searchTurningRejoin } from './turning-rejoin.js';
import { STEP_SEC, smoother } from './flight.js';
import { leadStateOf, stepLead, nosePath, noseAt } from './fluid-lead.js';
import { poseOf3d, len3, scale3 } from './attitude.js';
import { liftTowardAim, gAndBankForLift } from '../../../core/point-mass.js';
import { G_FTPS2 } from '../../../core/units.js';

const dt = STEP_SEC;

/** The Rejoin kind (transitions-panel.js's switch, chooser.js) that asks for a roll. */
export const ROLLING_REJOIN_KIND = 'roll';

/** The rolling rejoin's search. Estimates unless a page or ruling is named. */
export const ROLLING_REJOIN = Object.freeze({
  turnDeg: Object.freeze([30, 60, 90, 120]), // how far his heading swings the way Lead turns over the roll (estimates)
  pitchDeg: Object.freeze([20, 40, 60]), // the nose's highest and lowest (estimates; 45° is the barrel roll's, SMM 14.8 para 19)
  barrelOffDeg: 45, // the barrel roll's nose circles a point this far off his heading (SMM 14.8 para 19: 45° off)
  pullG: Object.freeze([3, 4]), // the pull: the barrel roll's 3 G entry (SMM Table 14.1, Fig 14.1) and 4 G (the top of SMM Table 7.1's 3-4 G; estimate choice)
  maxRollSec: 60, // a guard: a roll still going after this long is dropped (estimate)
  pathSteps: 800, // the nose path's table (fluid-lead.js nosePath; search effort only)
  fullSearches: 6, // how many of the most promising roll-outs get the turning rejoin's full search after them (search effort only)
  patience: 2, // ...stopping once this many in a row after the best so far bring nothing quicker (search effort only)
});

const SHAPES = Object.freeze({ barrel: 'barrel roll', yoyo: 'high yo-yo' });

/** The roll's candidates: every shape, heading swing, pitch and pull (ROLLING_REJOIN). */
function candidates() {
  const R = ROLLING_REJOIN;
  const list = [];
  for (const turnDeg of R.turnDeg) for (const pitchDeg of R.pitchDeg) for (const pullG of R.pullG) {
    list.push({ shape: 'yoyo', turnDeg, pitchDeg, pullG, dir: 0 });
    for (const dir of [1, -1]) list.push({ shape: 'barrel', turnDeg, pitchDeg, pullG, dir });
  }
  return list;
}

/**
 * Flies one roll for #2 from the press on the point mass (fluid-lead.js), against Lead's recorded turn `rec`. s: the way
 * Lead turns (+1 left); c.dir: +1 the barrel's circle toward that side, -1 away. Returns { poses, minKias, minG, maxG,
 * maxBankDeg, minRangeFt, laneFwdFt } or null (inside the 500 ft bubble once outside it, or never back to the horizon).
 */
function flyRoll(c, wing, rec, s, blockFt) {
  const R = ROLLING_REJOIN;
  let st = leadStateOf(wing, blockFt);
  const h0 = Math.atan2(st.nose.y, st.nose.x);
  const off = c.shape === 'barrel' ? c.dir * s * R.barrelOffDeg * DEG : 0;
  // Heading: swung c.turnDeg the way Lead turns (smoothly), plus the barrel's circle off it; pitch up, then down.
  const N = (u) => noseAt(h0 + s * c.turnDeg * DEG * smoother(u) + off * (1 - Math.cos(2 * Math.PI * u)), c.pitchDeg * DEG * Math.sin(2 * Math.PI * u));
  const path = nosePath(N, 1, R.pathSteps);
  // The live code keeps each aircraft's true to indicated ratio as it is (tracker.js setKias): his KIAS is read with his own
  // ratio, so the rejoin after the roll carries on at the same true airspeed (the point mass's own KIAS, at its height,
  // differs by about 1% a few hundred feet off; the checks use that one).
  const tasPerKias = wing.tasFtps / wing.kias;
  const poses = [];
  let minKias = Infinity;
  let minG = Infinity;
  let maxG = 0;
  let maxBankDeg = 0;
  let laneFwdFt = -Infinity;
  let minRangeFt = Infinity;
  const L0 = rec.at(0);
  let out = Math.hypot(wing.xFt - L0.xFt, wing.yFt - L0.yFt, wing.altAboveFt - L0.altAboveFt) >= LAG_ROLL.bubbleFt;

  let posS = 0;
  let rate = 0;
  const lookahead = 0.08;
  const gain = 1.0;
  const noseAccel = 8 * DEG;
  const noseEnd = 3 * DEG;

  for (let n = 1; n <= Math.round(R.maxRollSec / dt); n++) {
    const u = posS / path.total;
    const uAim = Math.min(1.0, u + lookahead);
    const toAim = N(uAim);
    const vHat = st.nose;
    const { wanted } = liftTowardAim(vHat, toAim, st.V, gain);
    const wantedLen = len3(wanted);
    let lift = wanted;
    if (wantedLen > c.pullG) {
      lift = scale3(wanted, c.pullG / wantedLen);
    } else if (wantedLen < 1.0) {
      lift = scale3(wanted, 1.0 / Math.max(1e-6, wantedLen));
    }
    const gb = gAndBankForLift(lift, vHat, st.pm.up, st.bank * DEG);
    const askG = Math.max(1.0, Math.min(c.pullG, gb.g));
    const askBank = gb.bankRad / DEG;
    st = stepLead(st, { g: askG, bank: askBank });

    const wantRate = (Math.sqrt(Math.max(0, c.pullG * c.pullG - 1)) * G_FTPS2) / st.V;
    const left = path.total - posS;
    const endCap = Math.sqrt(2 * noseEnd * Math.max(0, left));
    const maxStep = noseAccel * dt;
    rate = Math.max(0, Math.min(endCap, rate + Math.max(-maxStep, Math.min(maxStep, wantRate - rate))));
    posS = Math.min(path.total, posS + rate * dt);
    const end = posS >= path.total - 1e-6 || (left < 0.5 * DEG && rate < 0.1 * DEG);

    const pose = poseOf3d({ x: st.pm.x, y: st.pm.y, altAbove: st.pm.z - blockFt, vel: st.vel, up: st.bodyUp, kias: st.V / tasPerKias, g: st.g, rollDps: -st.rollRate });
    pose.pwr = 1; // full power through the roll (the point mass flies it at MAX)
    poses.push(pose);

    const L = rec.at(n);
    const rel = relativeTo(L, { xFt: pose.x, yFt: pose.y });
    const range = Math.hypot(rel.fwd, rel.left, pose.alt - L.altAboveFt);
    if (range >= LAG_ROLL.bubbleFt) out = true;
    if (out && range < LAG_ROLL.bubbleFt) return null; // never inside 500 ft of Lead (SMM 16.23, the fluid bubble)
    if (out) minRangeFt = Math.min(minRangeFt, range);
    if (Math.hypot(rel.fwd, rel.left) < LANE.rangeFt) laneFwdFt = Math.max(laneFwdFt, rel.fwd);
    minKias = Math.min(minKias, st.kias);
    minG = Math.min(minG, st.g);
    maxG = Math.max(maxG, st.g);
    maxBankDeg = Math.max(maxBankDeg, Math.abs(pose.bank));
    if (st.kias < LAG_ROLL.topKiasBand[0]) return null;
    if (end) return { poses, minKias, minG, maxG, maxBankDeg, minRangeFt, laneFwdFt };
  }
  return null;
}

/**
 * How promising a roll-out is, before the turning rejoin's full search (smaller is better; a ranking only, in rough
 * seconds): the roll's time, then how far he still has to come down the rejoin line, how far off it (hot, ahead of it,
 * counts more: he must lose it with geometry), his heading against Lead's, his height off Lead's and his speed off
 * Lead's 200 KIAS (all estimates).
 */
function promise(rollSec, rel, dzFt, headingOffDeg, kias, s) {
  const lineRad = TURNING_REJOIN.lineDeg * DEG;
  const along = -rel.fwd * Math.sin(lineRad) + rel.left * s * Math.cos(lineRad);
  const hot = rel.fwd * Math.cos(lineRad) + rel.left * s * Math.sin(lineRad);
  return rollSec + Math.max(0, along) / 60 + Math.max(0, hot) / 15 + Math.max(0, -hot) / 60 + Math.abs(headingOffDeg) * 0.1 + Math.abs(dzFt) / 40 + Math.abs(kias - KIAS_OUTSIDE_LAB) * 0.1;
}

/**
 * The turning rejoin from where the roll rolls out (step k, #2 at `pose`): Lead's same turn seen from step k (hand-over.js
 * fromStep), and the plain rejoin's own search, hot. Returns searchTurningRejoin's best or null.
 */
function rejoinFrom({ lead, wing, pose, k, into, s, to, sTo, spacingFt, blockFt, t0 }) {
  const from = {
    longRec: fromStep(into.longRec, k),
    planTo: (n, rollOutRoll) => {
      const p = into.planTo(n + k, rollOutRoll);
      return { ...p, rec: fromStep(p.rec, k) };
    },
  };
  return searchTurningRejoin({ lead, wing: wingFromPose(wing, pose), into: from, s, to, sTo, spacingFt, blockFt, t0: t0 + k * dt, hot: true, vertical: false });
}

/**
 * The rolling rejoin as a "Change formation" plan (planGoTo's shape, transitions.js), or null when it does not apply, or
 * { ok: false, reason } when no roll gets #2 in from here. It applies with the Rejoin kind 'roll' (its own button), to the
 * 2-ship from line abreast (or anywhere the judge calls no formation) to fighting wing or a close formation, and from
 * fighting wing to a close formation. options: { side, spacingFt, blockFt, rejoin, lastSide }, as planGoTo's.
 */
export function planRollingRejoin(pair, to, options = {}, t0 = 0) {
  if (pair.length !== 2 || options.rejoin !== ROLLING_REJOIN_KIND) return null;
  if (options.turn === 'away') return null; // the roll is flown with Lead turning into #2 only (TS-174)
  const [lead, wing] = pair;
  if (!FORMATIONS[to] || to === 'lab') return null;
  const from = classify([lead, wing]);
  if (!(from.key === 'lab' || from.key === 'other' || (from.key === 'fw' && to !== 'fw'))) return null;
  const R = ROLLING_REJOIN;
  const spacingFt = options.spacingFt ?? 6000;
  const blockFt = options.blockFt ?? 8000;
  const s = from.side || Math.sign(relativeTo(lead, wing).left) || (options.lastSide ?? -1);
  const want = options.side ?? 'keep';
  const sTo = sideFor(to, want, s);
  const pre = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [{ ...speedSeg(lead.kias, KIAS_OUTSIDE_LAB, blockFt), withNext: true }] : [];
  const into = leadTurnInto({ lead, pre, s, bankDeg: REJOIN.leadBankDeg, t0, record: recordFlight });
  const rec = into.longRec;

  // Every roll flown, ranked by how promising its roll-out is; the most promising get the full search after them.
  const flown = [];
  for (const c of candidates()) {
    const m = flyRoll(c, wing, rec, s, blockFt);
    if (!m) continue;
    const k = m.poses.length;
    const end = m.poses[k - 1];
    const L = rec.at(k);
    const rel = relativeTo(L, { xFt: end.x, yFt: end.y });
    const headingOffDeg = ((((end.h - L.headingRad) / DEG + 540) % 360) - 180);
    flown.push({ c, m, k, score: promise(k * dt, rel, end.alt - L.altAboveFt, headingOffDeg, end.kias, s) });
  }
  if (!flown.length) return { ok: false, reason: 'No roll from here: every roll comes inside 500 ft of Lead.' };
  flown.sort((a, b) => a.score - b.score);
  // The overshoot lane (chooser.js's check, SMM 12.27 para 65): inside 1,000 ft he stays behind his slot toward Lead's 3/9
  // line; a roll that keeps it beats one that doesn't, whatever its time.
  const laneLimitFt = Math.max(0, pairSlot(to, sTo || s, spacingFt)?.fwd ?? 0) + LANE.marginFt;
  const better = (x, y) => (x.laneOk !== y.laneOk ? x.laneOk : x.durationSec < y.durationSec - 0.5);
  let best = null;
  let since = 0;
  for (const f of flown.slice(0, R.fullSearches)) {
    if (best && since >= R.patience) break;
    since += 1;
    const b = rejoinFrom({ lead, wing, pose: f.m.poses[f.k - 1], k: f.k, into, s, to, sTo, spacingFt, blockFt, t0 });
    if (!b) continue;
    const durationSec = f.k * dt + b.durationSec;
    if (durationSec > CHANGE_LIMIT_SEC) continue;
    const judged = judge([b.run.end.lead, b.run.end.wing], { key: to }, { spacingFt });
    if (!judged.inBand) continue;
    const laneOk = Math.max(f.m.laneFwdFt, b.run.laneFwdFt ?? -Infinity) <= laneLimitFt;
    const cand = { ...f, b, durationSec, judged, laneOk };
    if (!best || better(cand, best)) {
      best = cand;
      since = 0;
    }
  }
  if (!best) return { ok: false, reason: 'No roll gets #2 in from here.' };

  const { c, m, k, b, judged } = best;
  const { part, run, profile, lp } = b;
  const label = FORMATIONS[to].label;
  const sideWord = to === 'astern' ? '' : sTo > 0 ? ' left' : ' right';
  const fromWord = from.key === 'other' ? 'From here' : `${FORMATIONS[from.key].label}${s > 0 ? ' left' : ' right'}`;
  const shape = SHAPES[c.shape];
  const way = c.shape === 'barrel' ? `, rolling ${c.dir > 0 ? 'toward' : 'away from'} Lead's turn` : '';
  const rollSec = k * dt;
  const restBankDeg = Math.max(part.maxBankDeg, run.maxBankDeg);
  const note = `${fromWord} to ${label}${sideWord}: turning rejoin with a ${shape}. Lead turns into #2 at ${REJOIN.leadBankDeg}° of bank and holds it until #2 is in (SMM 16.20 para 65b). `
    + `#2 flies a ${shape}${way} at full power, ${c.pullG} G, nose ${c.pitchDeg}° up and down, heading swung ${c.turnDeg}° the way Lead turns, for ${Math.round(rollSec)} s; slowest ${Math.round(m.minKias)} KIAS, closest to Lead ${Math.round(m.minRangeFt).toLocaleString('en-CA')} ft. `
    + `Then the turning rejoin from where he rolls out (SMM 12.24 paras 56-58). The SMM has no rolling rejoin (nearest: SMM 14.8 paras 18-19, the barrel roll); the numbers are estimates.`;
  return {
    ok: true,
    plans: {
      [lead.id]: { segments: lp.segments.map((x) => ({ ...x })) },
      [wing.id]: { segments: [{ kind: 'poseTrack', poses: m.poses }, { kind: 'bankTrack', points: [...part.points, ...run.points] }], profile },
    },
    note,
    label: `${label}${sideWord}`,
    flying: `${fromWord} to ${label}${sideWord} (turning rejoin with a ${shape})`,
    from: from.key,
    fromSide: s,
    to,
    side: sTo,
    rejoinKind: 'into',
    leadTurnDeg: Math.round(lp.turned / DEG),
    laneFwdFt: Math.max(m.laneFwdFt, run.laneFwdFt ?? -Infinity),
    maxBankDeg: Math.max(m.maxBankDeg, restBankDeg),
    maxG: Math.max(m.maxG, part.maxG ?? 1),
    // The roll rolls through the inverted: its pull is its own (as the lag roll's, TS-71); the rejoin after it keeps the G rule.
    gRuleOk: restBankDeg <= G_RULE_BANK_DEG + 0.5,
    judged,
    endSec: t0 + best.durationSec,
    rejoining: true,
    handOverSec: null,
    rollingRejoin: { shape: c.shape, dir: c.dir, turnDeg: c.turnDeg, pitchDeg: c.pitchDeg, pullG: c.pullG, rollSec, minKias: m.minKias, minG: m.minG, maxG: m.maxG, maxBankDeg: m.maxBankDeg, minRangeFt: m.minRangeFt },
  };
}
