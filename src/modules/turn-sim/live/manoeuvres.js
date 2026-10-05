// The line abreast manoeuvres as planned programmes for a 2-ship (Turn Sim first
// version). Each builder takes the pair as it is at the button press and returns
// what each aircraft flies: its segments (see flight.js) and, for the crossing
// turns, a height profile. Where the planner needs a number it can't write down
// in closed form (a turn with the roll in and out), it flies a dry run of the
// same flight.js the aircraft use, so the plan is exact for what is flown.
//
// Sources: SMM 16.19 paras 52-64 and Figures 16.15-16.21 (the line abreast
// turns, 70° bank and 3 G); Patrick's rulings of 4 Oct 2026: exact geometry for
// the delayed turns, a real 300 ft vertical miss in the shackle and cross turn.
import { bankDegFromG, turnRadiusFromBankFt } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { STEP_SEC, stepAircraft, copyAircraft, planDone } from './flight.js';

/** Line abreast turns: about 70° of bank at 3 G (SMM 16.18 para 50; Figs 16.15-16.21 "70/3"). */
export const TURN_G = 3;
export const TURN_BANK_DEG = bankDegFromG(TURN_G);
/** Crossing turns pass at least this far apart vertically (SMM 16.13 para 31; 16.19 paras 61, 64). */
export const VERTICAL_MISS_FT = 300;
/** The check turn's angle: the R/T example "check 20" (2 CFFTS Orders B2 ch 8 p.103). Working answer, Patrick to confirm. */
export const CHECK_DEG = 20;
/** The cross turn's first stage may be flown between these banks to roll out at the spacing ("60/2, or as required", Fig 16.21). */
const CROSS_FIRST_BANK_DEG = Object.freeze([20, 75]);

/**
 * The buttons. `turn` is degrees of heading change; `kind` picks the builder;
 * `sided` buttons come in a left and a right version.
 */
export const MANOEUVRES = Object.freeze({
  delayed90: { label: 'Delayed 90', kind: 'delayed', turnDeg: 90, sided: true, source: 'SMM 16.19 paras 52-54, Fig 16.15' },
  delayed45: { label: 'Delayed 45', kind: 'delayed', turnDeg: 45, sided: true, source: 'SMM 16.19 paras 55-57, Fig 16.16' },
  check: { label: `Check ${CHECK_DEG}`, kind: 'together', turnDeg: CHECK_DEG, sided: true, source: 'SMM 16.19 para 58, Fig 16.18' },
  inPlace90: { label: 'In place 90', kind: 'together', turnDeg: 90, sided: true, source: 'SMM 16.19 para 59, Fig 16.18' },
  hook: { label: 'Hook', kind: 'together', turnDeg: 180, sided: true, source: 'SMM 16.19 para 60, Fig 16.19' },
  shackle: { label: 'Shackle', kind: 'shackle', turnDeg: 45, sided: false, source: 'SMM 16.19 paras 61-63, Fig 16.20' },
  crossTurn: { label: 'Cross turn', kind: 'cross', turnDeg: 180, sided: false, source: 'SMM 16.19 para 64, Fig 16.21' },
});

/** A heading rounded to the whole degree, so a turn aims at 090, not at 089.8 left over from the last one. */
export const DEG = Math.PI / 180;
export const wholeDegree = (rad) => wrapPi(Math.round(rad / DEG) * DEG);
export const unit = (h) => ({ x: Math.cos(h), y: Math.sin(h) });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
/** Rounds a time to the fixed step, so two aircraft flying the same turn at different times fly exact copies of it. */
export const onStep = (sec) => Math.max(0, Math.round(sec / STEP_SEC)) * STEP_SEC;

/** Where `b` is from `a` in a's frame: { fwd, left } in feet. */
export function relativeTo(a, b) {
  const f = unit(a.headingRad);
  const dx = b.xFt - a.xFt;
  const dy = b.yFt - a.yFt;
  return { fwd: dx * f.x + dy * f.y, left: -dx * f.y + dy * f.x };
}

/**
 * Flies an aircraft's programme on a copy until it is done (or maxSec), sampling
 * its position. Returns { end, durationSec, points: [[t, x, y, altAbove], …] }.
 */
export function dryRun(aircraft, plan, t0, { maxSec = 600, sampleSec = 0.25 } = {}) {
  const a = copyAircraft(aircraft);
  const p = { segments: plan.segments.map((s) => ({ ...s })), profile: plan.profile };
  const every = Math.max(1, Math.round(sampleSec / STEP_SEC));
  const points = [[t0, a.xFt, a.yFt, a.altAboveFt]];
  let t = t0;
  let i = 0;
  while (!planDone(a, p) && t - t0 < maxSec) {
    stepAircraft(a, p, t);
    t += STEP_SEC;
    if (++i % every === 0) points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  }
  points.push([t, a.xFt, a.yFt, a.altAboveFt]);
  return { end: a, durationSec: t - t0, points };
}

export const turnSeg = (toRad, dir, bankDeg, rollOut = true) => ({ kind: 'turn', toRad, dir, bankDeg, rollOut });

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

/**
 * The wait that puts a second aircraft exactly abeam of the first on roll-out, when both fly
 * the same turn from heading u0 to heading u1 (unit vectors) at true airspeed v and `rel` is
 * where the second is from the first (feet): (rel · u1) / (v (1 − u0 · u1)). Shared by the
 * 2-ship delayed turns and the four-ship chain (four-ship.js). `extraAlongFt` is for a
 * second aircraft whose programme is not an exact copy of the first's (the four-ship's
 * check turn): how much further it is along the new heading, once rolled out, than a copy would be.
 */
export function exactWaitSec(rel, u0, u1, v, extraAlongFt = 0) {
  return (dot(rel, u1) + extraAlongFt) / (v * (1 - dot(u0, u1)));
}

/**
 * Delayed 90 or 45 (SMM 16.19 paras 52-57). The aircraft on the outside of the turn
 * goes first; the other holds straight, then flies the same turn. Exact geometry
 * (Patrick, card 09:53Z): both fly identical turns, so the second one's path is the
 * first one's moved by where it started and how long it waited, and the wait that
 * puts it exactly abeam on roll-out is
 *     wait = (rel · h1) / (V (1 − h0 · h1))
 * with rel the second aircraft's position from the first, h0 and h1 the old and new
 * heading as unit vectors and V the true airspeed. For a pair abreast at spacing s
 * that is s / V × cot(half the turn) (TS-4), and the pair rolls out at the same spacing,
 * sides swapped. If that wait comes out negative for the outside-first order (the
 * pair is not abreast), the other order is used.
 */
function delayed(pair, m, dir, t0) {
  const [lead, wing] = pair;
  const h0 = lead.headingRad;
  const h1 = wholeDegree(h0 + dir * m.turnDeg * DEG);
  const v = lead.tasFtps;
  const u0 = unit(h0);
  const turn = [turnSeg(h1, dir, TURN_BANK_DEG)];
  // The heading the turn really rolls out on (the fixed step leaves a fraction of a degree), from a dry run.
  const u1 = unit(dryRun(lead, { segments: turn }, t0).end.headingRad);
  const waitFor = (first, second) => exactWaitSec({ x: second.xFt - first.xFt, y: second.yFt - first.yFt }, u0, u1, v);
  // Outside of the turn: the aircraft whose partner is on the turning side.
  const wingLeft = relativeTo(lead, wing).left;
  const leadOutside = Math.sign(wingLeft) === dir;
  let [first, second] = leadOutside ? [lead, wing] : [wing, lead];
  let wait = waitFor(first, second);
  if (wait < 0) {
    [first, second] = [second, first];
    wait = waitFor(first, second);
  }
  wait = onStep(wait);
  const plans = {
    [first.id]: { segments: turn.map((seg) => ({ ...seg })) },
    [second.id]: { segments: [{ kind: 'hold', untilSec: t0 + wait }, ...turn.map((seg) => ({ ...seg }))] },
  };
  return { plans, firstId: first.id, note: `${first.id === lead.id ? 'Lead' : '#2'} goes first (outside of the turn); the other waits ${wait.toFixed(1)} s and rolls out abeam.` };
}

/** Check, in-place and hook turns: both roll in together and fly the same turn (SMM 16.19 paras 58-60). */
function together(pair, m, dir) {
  const h1 = wholeDegree(pair[0].headingRad + dir * m.turnDeg * DEG);
  const plans = {};
  for (const a of pair) plans[a.id] = { segments: [turnSeg(h1, dir, TURN_BANK_DEG)] };
  const what = m.turnDeg >= 180 ? 'Both turn together through 180 and roll out abreast.' : m.turnDeg > 30 ? 'Both turn together and roll out in trail.' : 'Both turn together; the line between them turns with them.';
  return { plans, note: what };
}

/** The wingman's height for a crossing turn: up (or down) by the miss before the cross, back to Lead's height after. */
export function missProfile(t0, crossSec, endSec, sign = 1) {
  const up = Math.max(crossSec - 1, t0 + 2);
  const down = Math.min(crossSec + 1, endSec - 2);
  return [
    { t0, t1: up, fromFt: 0, toFt: sign * VERTICAL_MISS_FT },
    { t0: up, t1: down, fromFt: sign * VERTICAL_MISS_FT, toFt: sign * VERTICAL_MISS_FT },
    { t0: down, t1: Math.max(endSec, down + 2), fromFt: sign * VERTICAL_MISS_FT, toFt: 0 },
  ];
}

/** Sideways distance an aircraft moves (feet, toward the turn) in a dry run of `segments`, and how long it takes. */
function sideways(aircraft, segments, dir, t0) {
  const run = dryRun(aircraft, { segments }, t0);
  const rel = relativeTo(aircraft, run.end);
  return { sideFt: rel.left * dir, durationSec: run.durationSec, run };
}

/**
 * Shackle (SMM 16.19 paras 61-63, Fig 16.20): both turn about 45 toward each other,
 * the wingman passes 300 ft above, Lead turns back and the wingman with him; they end
 * on the original heading with sides swapped. The straight leg between the turns is
 * set so each moves sideways by the spacing: 2 × (one 45's sideways move) + V t sin 45.
 */
function shackle(pair, t0) {
  const [lead, wing] = pair;
  const h0 = wholeDegree(lead.headingRad);
  const rel = relativeTo(lead, wing);
  const spacing = Math.abs(rel.left);
  const leadDir = Math.sign(rel.left) || 1; // Lead turns toward the wingman
  const quarter = Math.PI / 4;
  const v = lead.tasFtps;
  const out = sideways(lead, [turnSeg(wrapPi(h0 + leadDir * quarter), leadDir, TURN_BANK_DEG)], leadDir, t0);
  const build = (dir, straight) => [
    turnSeg(wrapPi(h0 + dir * quarter), dir, TURN_BANK_DEG),
    { kind: 'hold', untilSec: t0 + onStep(out.durationSec) + straight },
    turnSeg(h0, -dir, TURN_BANK_DEG),
  ];
  // First guess from the geometry, then two corrections from dry runs of the whole programme,
  // so each aircraft moves sideways by the spacing and they roll out at the spacing they started at.
  let straight = Math.max(0, (spacing - 2 * out.sideFt) / (v * Math.sin(quarter)));
  let run = sideways(lead, build(leadDir, onStep(straight)), leadDir, t0);
  for (let i = 0; i < 2 && straight > 0; i++) {
    straight = Math.max(0, straight + (spacing - run.sideFt) / (v * Math.sin(quarter)));
    run = sideways(lead, build(leadDir, onStep(straight)), leadDir, t0);
  }
  straight = onStep(straight);
  const end = t0 + run.durationSec;
  const cross = t0 + out.durationSec + straight / 2;
  return {
    plans: {
      [lead.id]: { segments: build(leadDir, straight) },
      [wing.id]: { segments: build(-leadDir, straight), profile: missProfile(t0, cross, end) },
    },
    note: straight === 0 && run.sideFt > spacing + 100 ? 'Spacing is too tight for a full shackle: they roll out wider than they started.' : 'Both turn in, #2 passes 300 ft above Lead, both turn back.',
  };
}

/**
 * Cross turn (SMM 16.19 para 64, Fig 16.21): both turn toward each other, the first
 * 90° at a gentler bank, then 70/3 to 180°. The first-stage bank is the same for both,
 * so their paths mirror and they roll out abeam; it is chosen (by halving) so each moves
 * sideways by the spacing and they roll out at the spacing they started at. The
 * wingman passes 300 ft above Lead at the cross.
 */
function crossTurn(pair, t0) {
  const [lead, wing] = pair;
  const h0 = wholeDegree(lead.headingRad);
  const rel = relativeTo(lead, wing);
  const spacing = Math.abs(rel.left);
  const leadDir = Math.sign(rel.left) || 1;
  const segs = (dir, bank) => [
    turnSeg(wrapPi(h0 + dir * Math.PI / 2), dir, bank, false),
    turnSeg(wrapPi(h0 + Math.PI), dir, TURN_BANK_DEG),
  ];
  const sideFor = (bank) => sideways(lead, segs(leadDir, bank), leadDir, t0);
  let [lo, hi] = CROSS_FIRST_BANK_DEG; // a steeper first stage moves less sideways
  let best = sideFor(lo);
  if (best.sideFt > spacing) {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const trial = sideFor(mid);
      if (trial.sideFt > spacing) lo = mid;
      else hi = mid;
      best = trial;
    }
  }
  const bank = (lo + hi) / 2;
  const run = sideFor(bank).run;
  // They cross when each has moved half the spacing sideways.
  const crossPoint = run.points.find((p) => relativeTo(lead, { xFt: p[1], yFt: p[2] }).left * leadDir >= spacing / 2);
  const end = t0 + run.durationSec;
  const cross = crossPoint ? crossPoint[0] : t0 + run.durationSec / 2;
  const firstG = 1 / Math.cos((bank * Math.PI) / 180);
  return {
    plans: {
      [lead.id]: { segments: segs(leadDir, bank) },
      [wing.id]: { segments: segs(-leadDir, bank), profile: missProfile(t0, cross, end) },
    },
    note: `Both turn in at ${Math.round(bank)}° bank (${firstG.toFixed(1)} G) to 90°, #2 passes 300 ft above, then 70° (3 G) to 180°.`,
  };
}

/**
 * The plan for a button press. pair: [lead, wing] as they are now; key: a MANOEUVRES key;
 * dir: +1 left, -1 right (ignored by the shackle and cross turn); t0: formation time now.
 * Returns { plans: { id: { segments, profile? } }, note }.
 */
export function planManoeuvre(pair, key, dir, t0) {
  const m = MANOEUVRES[key];
  if (!m) throw new Error(`No manoeuvre called ${key}`);
  if (m.kind === 'delayed') return delayed(pair, m, dir, t0);
  if (m.kind === 'together') return together(pair, m, dir);
  if (m.kind === 'shackle') return shackle(pair, t0);
  return crossTurn(pair, t0);
}

/** Turn radius at the line abreast bank, for the readout and the circles. */
export function turnRadiusAt(tasFtps) {
  return turnRadiusFromBankFt(tasFtps, TURN_BANK_DEG);
}
