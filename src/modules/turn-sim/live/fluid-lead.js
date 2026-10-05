// Lead in fluid manoeuvring, the simplified baseline (spec section 10.3, TS-57; Patrick 21:44Z: "a working baseline thats
// simplified"). Every Lead button is planned at the press as a path, flown by the shared point-mass step (core
// stepPointMass: G along the lift, bank from the horizon) with the T-6A's full-power thrust and drag (core t6aExcessFn).
// Each button is a small "pilot" that asks for a G and a bank every step; the G builds at no more than 4 G/s (an
// estimate, design 5.3) and the roll at the ruled 90°/s built at 360°/s² (TS-37), so nothing jumps. The path is worked
// out ahead of time and replayed (the planned path drawn is the path flown, spec F1).
//
// Power: PCL MAX for the whole exercise (AFM7 brief p.17; SMM 16.17 paras 42-43, both aircraft the same power), except the
// entry's 30° bank stage and Terminate, where Lead flies a held speed (fighting wing's 200 KIAS, TS-53).
//
// The baseline's buttons and their sources (page references only, never manual text):
//  - Level turn: 60/2 at PCL MAX (AFM7 brief p.17, AFM8 brief p.19, Exercise 1); 30° gentle (AFM7 p.17's first stage);
//    70/3 steep (SMM 16.18 para 50, a line abreast number used here as "steep", an estimate). Holds height.
//  - Wings level ends a turn. Reversal: not a manual manoeuvre (manoeuvre-geometry.md 5.2); Patrick's list.
//  - Climb and descend (V2.18): not FM manoeuvres in the manuals (manoeuvre-geometry.md 5.2); Patrick's list and design
//    5.1. Lead changes only his pitch: 15° up or down (design 5.1, an estimate) through 2,000 ft (an estimate), then
//    levels off at the new height, keeping the bank he had (a climbing or descending turn if he was turning; the
//    climbing and descending turns of Fig 12.22's box). PCL stays MAX (SMM 16.17 para 43: constant power), so the speed
//    bleeds in the climb and builds in the descent on the shared point mass.
//  - Terminate: Lead's gentle, predictable level turn while #2 goes back to fighting wing (SMM 16.17 paras 45-46, 48;
//    AFM7 brief p.17; Patrick's pick 19:20Z row 7).
//  - Loop (V2.18; SMM 7.5 paras 10-13 and Fig 7.2; Table 7.1; EFIG p.170-171): wings level on the heading Lead has,
//    PCL MAX, 230 KIAS (Table 7.1; Fig 7.2 "Entry MAX TQ, 230 KIAS"), a wings-level pull at 3.5 G (EFIG p.171, inside
//    the SMM's 3-4 G) until the nose nears the vertical, then the nose kept moving at a constant rate (paras 11-13): the
//    G bleeds off with the speed, slight positive G over the top, back pressure up again coming down, then the pull-out
//    to level, no harder than the pull (para 12: "adjust back pressure to achieve 230 KIAS"). Speeds to compare against:
//    about 100-120 KIAS at the top, about 140 at the vertical down (EFIG p.171), 230 at the exit (para 12; Fig 7.2).
//    Before the pull Lead rolls wings level and gets to 230 KIAS by lowering or raising the nose at MAX (SMM 7.5 para 11
//    says to attain 230; how is not given, so the up to 10° nose down or up is an estimate).
//  - Wingovers (V2.19; SMM 16.17 para 47, the only text; no figure in the SMM or EFIG): about 230 KIAS, the pull up at
//    the cloverleaf's pitch rate (about 3 G, SMM 7.7 and EFIG p.137), aileron blended in as the nose comes through the
//    horizon, about 45° of pitch above and below the horizon, up to 120° of bank, about 3 G, out on a heading about 180°
//    from the entry; then the second the other way (para 47: "ideally"), back to the entry heading. Flown as a planned
//    nose path (followNose below) with the nose rate set for about 3 G: the 120° of bank and the 45° come out of it.
//  - Barrel roll (V2.19; SMM 14.8 paras 18-19, Fig 14.1; Table 14.1; Patrick's picks 19:20Z rows 5 and 6): PCL MAX,
//    on a reference line at 230 KIAS, a 3 G wings-level pull and the roll blended in; the nose circles a point on the
//    horizon 45° off the line: 45° off at 45° pitch up and about 90° of bank, 90° off level and inverted, 45° off at 45°
//    pitch down, then level on the line at 230 KIAS. The nose moves round that circle with the back pressure set by a G
//    plan: 3 G at the entry (Table 14.1), reduced over the top to 2.25 G (para 19: "the back pressure must be reduced";
//    2.25 is an estimate that brings the exit back to about 230 KIAS, Fig 14.1 "adjust rate as required for 230 KIAS
//    exit"), back up to 3 G coming down. Pitch over 60° is flagged (AFM7 brief p.17, Exercise 4), never held.
//  - The standard sequence (V2.19; SMM 16.17 para 42, as written there): a level turn, a loop, two wingovers and a
//    barrel roll, flown one after the other. The level turn is at the chosen bank (60/2 by default, AFM7 brief p.17
//    Exercise 1) for 360° (Patrick card 5 Oct 01:03Z, "360°", and "360 and the wingman uses it to set their spacing"; it
//    was 180°, an estimate, in V2.19), so the sequence starts and ends on the entry heading and #2 settles onto his fluid
//    position (the distance setting, 15° off Lead's tail) during it; then each manoeuvre's own speed set-up leads on.
import { stepPointMass, gAndBankForLift } from '../../../core/point-mass.js';
import { easeValue, dampedClimbG } from '../../../core/flight-math.js';
import { t6aExcessFn, tasToIasKt, shakerG, dragPerWeight, thrustPerWeight, T6A_G_ONSET } from '../../../core/t6-performance.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, headingChangeRollingOut, rollLimitAt } from './flight.js';
import { ROLL, WING } from './tuning.js';
import { excessPerWeight } from './slow-down.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3 } from './attitude.js';

const DEG = Math.PI / 180;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The numbers Lead flies. Every one has its source; "estimate" where no manual or ruling gives it. */
export const LEAD = Object.freeze({
  gOnset: T6A_G_ONSET, // G per second and per second²: the T-6A's in core (estimate, design 5.3; TS-85)
  levelBanks: Object.freeze({ gentle: 30, medium: 60, steep: 70.5 }), // AFM7 p.17 (30, 60/2); SMM 16.18 para 50 (70/3, estimate as "steep")
  entryHoldSec: 5, // the entry's 30° bank stage while "all call ready" (AFM7 p.17): 5 s is an estimate
  terminateBankDeg: 30, // "gentle" (AFM7 p.17), "predictable" (SMM 16.17 para 46): 30° is an estimate
  terminateTurnDeg: 90, // how far the terminate turn goes before rolling out: an estimate
  fwKias: 200, // fighting wing speed (TS-53; SMM 12.23 para 53)
  earlyCueSec: 4, // how long a new turn's lag (into #2) or lead (away from #2) lasts before pure: an estimate
  climbDeg: 15, // the climb or descent angle (design 5.1, an estimate)
  climbChangeFt: 2000, // how far a climb or descent goes before levelling off (an estimate)
  levelOffFt: 800, // the climb eases onto the new height over its last 800 ft (an estimate)
  pitchCueDps: 0.5, // #2 reads Lead's nose as rising or falling past 0.5°/s of pitch rate (an estimate)
  climbPitchDps: 3, // how fast Lead raises or lowers the nose into and out of the climb or descent (an estimate)
  minPushG: 0.5, // Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a); 0.5 G at the push over is an estimate
  loopEntryKias: 230, // SMM Table 7.1, 7.5 para 11, Fig 7.2 (entry and exit)
  loopEntryBandKias: 15, // the aerobatics start within 15 KIAS of the entry speed (Patrick 5 Oct 04:59Z: "Fluid maneouvering aerobatics can happen as long as the aircraft are within 15 knots of the starting parameters"; 5 kt, an estimate, until V2.59; SMM 7.12 para 28b allows 200-250 for the loop)
  loopG: 3.5, // EFIG p.171 "3 1/2 G", inside SMM 7.5 para 11 and Table 7.1's 3-4 G
  loopDownMaxG: 4, // coming down Lead may pull up to 4 G, the top of the SMM's 3-4 G (Table 7.1), to "adjust back pressure to achieve 230 KIAS" (SMM 7.5 para 12); at the Orders' 4 G, not over it
  loopTopMinG: 0.5, // "slight positive G" over the top (SMM 7.5 para 11): 0.5 is an estimate
  loopVerticalDeg: 80, // "until the aircraft approaches the vertical" (SMM 7.5 para 11): 80° is an estimate
  loopPullOutDeg: 330, // where Lead stops holding the pitch rate and pulls out to level (an estimate)
  setupMaxPitchDeg: 10, // the speed set-up's nose down or up before the loop (an estimate)
  setupLimitSec: 60, // a guard only: after a minute of set-up the loop starts at whatever speed (an estimate)
  wingoverKias: 230, // "approximately 230 KIAS" (SMM 16.17 para 47)
  wingoverG: 3, // "approximately 3 G" (SMM 16.17 para 47); the cloverleaf's pull, 2.5-3.5 G (SMM Table 7.1; EFIG p.137 about 3 G)
  wingoverPitchDeg: 45, // "approximately 45 degrees of pitch (above and below the horizon)" (SMM 16.17 para 47)
  noseAccelDps2: 8, // how fast Lead changes the nose's rate along a planned nose path, 8°/s² (an estimate)
  noseEndDps2: 3, // and how gently he slows it onto the end of the path, 3°/s² (an estimate): the pull-out to level
  noseSteerPerSec: 1.2, // how fast he steers back onto the planned nose path, per second (an estimate)
  shakerShare: 0.9, // he pulls no more than 90% of the stick shaker's G on a planned nose path (an estimate)
  barrelKias: 230, // SMM Table 14.1, 14.8 para 19 (entry and exit)
  barrelG: 3, // entry load (SMM Table 14.1; Fig 14.1 "3G, wings level pull and begin roll")
  barrelTopG: 2.25, // the back pressure reduced over the top (SMM 14.8 para 19): 2.25 G is an estimate (230 KIAS out)
  barrelPitchDeg: 45, // SMM 14.8 para 19 (45° pitch up and down at the quarter points); Patrick's pick row 6
  barrelOffDeg: 45, // the nose circles a point 45° off the reference line (SMM 14.8 para 19: 45° off, then 90° off)
});

/** The buttons Lead has in the baseline (design 5.1, cut down by Patrick 21:44Z), with their words. */
export const FLUID_MOVES = Object.freeze({
  levelTurn: { label: 'Level turn', sided: true, interruptible: true, source: 'AFM7 brief p.17 (60/2 at PCL MAX)' },
  wingsLevel: { label: 'Wings level', sided: false, interruptible: true, source: 'ends a turn' },
  reversal: { label: 'Reversal', sided: false, interruptible: true, source: "Patrick's list (not a manual manoeuvre)" },
  climb: { label: 'Climb', sided: false, interruptible: true, source: "Patrick's list; design 5.1 (15° and 2,000 ft are estimates)" },
  descend: { label: 'Descend', sided: false, interruptible: true, source: "Patrick's list; design 5.1 (15° and 2,000 ft are estimates)" },
  loop: {
    label: 'Loop', sided: false, interruptible: false, source: 'SMM 7.5 paras 10-13, Fig 7.2; Table 7.1; EFIG p.171',
    speeds: { entryKias: 230, exitKias: 230, source: 'SMM Table 7.1, 7.5 paras 11-12, Fig 7.2' },
  },
  wingover: {
    label: 'Wingovers', sided: true, interruptible: false, source: 'SMM 16.17 para 47',
    speeds: { entryKias: 230, exitKias: null, source: 'SMM 16.17 para 47: about 230 in, the exit not given' },
  },
  barrelRoll: {
    label: 'Barrel roll', sided: true, interruptible: false, source: 'SMM 14.8 paras 18-19, Fig 14.1; Table 14.1',
    speeds: { entryKias: 230, exitKias: 230, source: 'SMM Table 14.1, 14.8 para 19, Fig 14.1' },
    maxPitch: { deg: 60, source: 'AFM7 brief p.17, Exercise 4' },
  },
  sequence: { label: 'Standard sequence', sided: true, interruptible: false, source: 'SMM 16.17 para 42' },
  terminate: { label: 'Terminate', sided: false, interruptible: false, source: 'SMM 16.17 paras 45-46, 48; AFM7 brief p.17' },
});

// ---- Lead's state and one step --------------------------------------------------------------------

/**
 * Lead's state for the point mass, from a live aircraft (flight.js): the point-mass bank is right wing down positive
 * from the carried up (core point-mass.js), the Turn Sim's is left wing down positive, so the signs flip.
 */
export function leadStateOf(a, blockFt) {
  const h = a.headingRad;
  const tas = a.tasFtps;
  const climb = a.climbFtps ?? 0;
  const horiz = Math.sqrt(Math.max(0, tas * tas - climb * climb));
  const vel = { x: horiz * Math.cos(h), y: horiz * Math.sin(h), z: climb };
  const nose = unit3(vel);
  const up = unit3(perp3(Z, nose));
  const st = {
    pm: { x: a.xFt, y: a.yFt, z: blockFt + (a.altAboveFt ?? 0), vx: vel.x, vy: vel.y, vz: vel.z, up },
    bank: -(a.bankDeg ?? 0),
    rollRate: -(a.rollRateDps ?? 0),
    g: a.g ?? 1,
    gRate: 0,
    blockFt,
  };
  return finish(st);
}

/** Fills in what the rest reads off a state: nose, body up (the lift), speeds, the acceleration square to the path. */
function finish(st) {
  const { pm } = st;
  const vel = { x: pm.vx, y: pm.vy, z: pm.vz };
  const V = len3(vel);
  const nose = scale3(vel, 1 / V);
  const right = cross3(nose, pm.up);
  const b = st.bank * DEG;
  const bodyUp = unit3(add3(scale3(pm.up, Math.cos(b)), scale3(right, Math.sin(b))));
  st.vel = vel;
  st.V = V;
  st.nose = nose;
  st.bodyUp = bodyUp;
  st.kias = tasToIasKt(V / KT_TO_FTPS, pm.z);
  st.gammaRad = Math.asin(Math.max(-1, Math.min(1, nose.z)));
  st.accPerp = perp3(sub3(scale3(bodyUp, st.g * G_FTPS2), scale3(Z, G_FTPS2)), nose); // turns the path (ft/s²)
  return st;
}

/** Excess thrust that holds an indicated speed: what it takes, up to full power, and slowing no faster than the power back gives (slow-down.js, TS-61). */
function holdSpeedExcess(kiasTarget) {
  return (ktas, altFt, g) => {
    const kias = tasToIasKt(ktas, altFt);
    const wantKtps = Math.min(3, 0.2 * (kiasTarget - kias));
    const wantFtps2 = wantKtps * KT_TO_FTPS * (ktas / Math.max(kias, 1));
    return Math.max(excessPerWeight('power', kias, altFt, g), Math.min(wantFtps2 / G_FTPS2, t6aExcessFn(ktas, altFt, g)));
  };
}

/**
 * Lead's power for the tag (power.js, TS-62): PCL MAX (1) through the manoeuvres (SMM 16.17 para 43), and in a stage
 * that holds a speed (the entry's 30° stage, fighting wing, Terminate) the model's throttle for holdSpeedExcess.
 */
export function leadThrottle(st, holdKias) {
  if (!holdKias) return 1;
  const altFt = st.pm.z;
  const excess = holdSpeedExcess(holdKias)(st.V / KT_TO_FTPS, altFt, st.g);
  return Math.min(1, Math.max(0, (excess + dragPerWeight(st.kias, altFt, st.g)) / thrustPerWeight(st.kias, altFt)));
}

/**
 * One fixed step of Lead: G and bank eased toward the pilot's ask, then the point mass (two half steps for accuracy).
 * The G ask is held under the stick shaker's line, the one physical limit (core shakerG); published limits are flagged
 * by the card, never held here.
 */
export function stepLead(st, ask) {
  const half = STEP_SEC / 2;
  let s = st;
  const excess = ask.holdKias ? holdSpeedExcess(ask.holdKias) : t6aExcessFn;
  for (let i = 0; i < 2; i++) {
    const g = easeValue(s.g, s.gRate, Math.min(ask.g, shakerG(s.kias)), half, LEAD.gOnset);
    const target = s.bank + wrapPi((ask.bank - s.bank) * DEG) / DEG; // the near way round
    const r = easeValue(s.bank, s.rollRate, target, half, rollLimitAt(s.V, ROLL)); // never faster than the T-6A at this speed (TS-85)
    const pm = stepPointMass(s.pm, { g: g.bankDeg, bankRad: r.bankDeg * DEG }, half, excess);
    s = finish({ pm, bank: wrapDeg(r.bankDeg), rollRate: r.rollRateDps, g: g.bankDeg, gRate: g.rollRateDps, blockFt: s.blockFt });
  }
  return s;
}

// ---- small pilot helpers ----------------------------------------------------------------------------

/** The G that holds (or brings smoothly onto) a climb angle at the bank flown now (core dampedClimbG over cos bank). */
function gForClimb(st, targetRad, omega = 0.5) {
  const cb = Math.max(0.25, Math.cos(st.bank * DEG));
  return Math.max(0, dampedClimbG(st.gammaRad, targetRad, st.V, omega)) / cb;
}
const headingOf = (st) => Math.atan2(st.nose.y, st.nose.x);
const wrapDeg = (d) => wrapPi(d * DEG) / DEG;
const level = (st) => Math.abs(st.gammaRad) < 0.3 * DEG && Math.abs(wrapDeg(st.bank)) < 0.5 && Math.abs(st.g - 1) < 0.03;

/** A nose direction from a heading and a climb angle (radians). */
const noseAt = (h, th) => ({ x: Math.cos(th) * Math.cos(h), y: Math.cos(th) * Math.sin(h), z: Math.sin(th) });

/**
 * A planned nose path (the wingovers and the barrel roll): the nose direction as a function of u over [0, uEnd],
 * tabled by the angle the nose has moved through so far, so the pilot's one lever is how fast the nose moves along it
 * (the SMM's own words for the barrel roll: "keep the nose moving at a constant rate", 14.8 para 19).
 * Returns { total (radians), at(s) -> { nose, tangent, u } }.
 */
function nosePath(N, uEnd, steps = 4000) {
  const us = [0];
  const ss = [0];
  let prev = N(0);
  for (let i = 1; i <= steps; i++) {
    const u = (uEnd * i) / steps;
    const n = N(u);
    ss.push(ss[i - 1] + Math.acos(Math.max(-1, Math.min(1, dot3(prev, n)))));
    us.push(u);
    prev = n;
  }
  const total = ss[steps];
  const uAt = (s) => {
    const x = Math.max(0, Math.min(total, s));
    let lo = 0;
    let hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] <= x) lo = mid;
      else hi = mid;
    }
    const f = ss[hi] > ss[lo] ? (x - ss[lo]) / (ss[hi] - ss[lo]) : 0;
    return us[lo] + f * (us[hi] - us[lo]);
  };
  return {
    total,
    at(s) {
      const u = uAt(s);
      const e = 1e-3;
      const a = N(uAt(Math.max(0, s - e)));
      const b = N(uAt(Math.min(total, s + e)));
      const d = sub3(b, a);
      return { nose: N(u), tangent: len3(d) > 1e-12 ? unit3(d) : { x: 0, y: 0, z: 0 }, u };
    },
  };
}

/**
 * One step along a planned nose path: the nose rate (mem.rate, rad/s) is set for the G wanted (gWant, capped under the
 * stick shaker: LEAD.shakerShare), changed no faster than LEAD.noseAccelDps2 and slowed onto the path's end at
 * LEAD.noseEndDps2, so the pull-out comes in gently and nothing jumps. The lift a pilot needs follows: the path's own
 * turn at that rate plus a steer back onto it (LEAD.noseSteerPerSec), plus gravity's share square to the path (core
 * gAndBankForLift gives the G and the bank). mem: { s, rate }. Returns { g, bank, u, end }.
 */
function followNose(st, path, mem, gWant) {
  const p = path.at(mem.s);
  const w = perp3(Z, st.nose); // gravity's share square to the path, in G
  const k = st.V / G_FTPS2;
  const steer = scale3(perp3(sub3(p.nose, st.nose), st.nose), LEAD.noseSteerPerSec * k);
  const c = add3(w, steer);
  const T = scale3(perp3(p.tangent, st.nose), k);
  // The rate that gives gWant: |T rate + c| = gWant (the larger root).
  const g = Math.min(gWant, LEAD.shakerShare * shakerG(st.kias));
  const a = dot3(T, T);
  const b = 2 * dot3(T, c);
  const cc = dot3(c, c) - g * g;
  const want = a > 1e-12 ? Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a)) : mem.rate;
  const left = path.total - mem.s;
  const endCap = Math.sqrt(2 * LEAD.noseEndDps2 * DEG * Math.max(0, left));
  const step = LEAD.noseAccelDps2 * DEG * STEP_SEC;
  mem.rate = Math.max(0, Math.min(endCap, mem.rate + Math.max(-step, Math.min(step, want - mem.rate))));
  const lift = add3(scale3(T, mem.rate), c);
  const gb = gAndBankForLift(lift, st.nose, st.pm.up, st.bank * DEG);
  mem.s = Math.min(path.total, mem.s + mem.rate * STEP_SEC);
  return { g: gb.g, bank: gb.g < 0.3 ? st.bank : gb.bankRad / DEG, u: p.u, end: mem.s >= path.total - 1e-6 || (left < 0.5 * DEG && mem.rate < 0.1 * DEG) };
}

/**
 * #2's pursuit through a manoeuvre that goes up and over (the wingover and the barrel roll), by how far through it Lead
 * is (u, 0 to 1 for one wingover or the roll): Patrick's loop rule (17:12Z, "lag on the way up, try to cross horizon
 * with fuselages both parallel, and lead on the way down"), which he asked for here too (card 19:21Z, "like the loop"):
 * LAG going up, PURE over the top (as near parallel as positive G allows: his 23:00Z ruling, a loose aim), LEAD coming
 * down, PURE for the pull-out. The breaks (0.4, 0.6, 0.9) are estimates.
 */
function overTheTopMode(u) {
  return u < 0.4 ? 'lag' : u < 0.6 ? 'pure' : u < 0.9 ? 'lead' : 'pure';
}

// ---- the controllers: one per button -------------------------------------------------------------
// Each is { key, label, interruptible, init(st, ctx) -> mem, step(st, mem) -> { g, bank, holdKias?, phase, cue, done } }.
// cue: what #2 does with the part of the path Lead is flying now (fluid-wing.js): mode 'lag' | 'pure' | 'lead', latDeg
// (how far off Lead's tail he sits, inside the 30° half cone), and blend (1 fluid, 0 the fighting wing slot).

/** A level turn at a bank (turn-sim dir: +1 left, -1 right), held until the next press, or for turnDeg then wings level. */
export function levelTurn(dir, bankDeg, { turnDeg = null, label = null } = {}) {
  return {
    key: 'levelTurn',
    label: label ?? `Level turn ${dir > 0 ? 'left' : 'right'}, ${Math.round(bankDeg)}°`,
    interruptible: turnDeg == null,
    init(st, ctx) {
      // Fig 12.20: Lead turning away from #2 (lead pursuit to collapse to his six) or into him (the miss first, lag).
      return { h0: headingOf(st), turned: 0, hPrev: headingOf(st), t: 0, into: ctx.wingSide === dir, rollingOut: false };
    },
    step(st, mem) {
      const h = headingOf(st);
      mem.turned += wrapPi(h - mem.hPrev) * dir;
      mem.hPrev = h;
      mem.t += STEP_SEC;
      let bank = -dir * bankDeg;
      if (turnDeg != null) {
        const rollOut = Math.abs(headingChangeRollingOut(-st.bank, -st.rollRate, st.V));
        if (mem.rollingOut || mem.turned >= turnDeg * DEG - rollOut) mem.rollingOut = true;
        if (mem.rollingOut) bank = 0;
      }
      const mode = mem.t < LEAD.earlyCueSec ? (mem.into ? 'lag' : 'lead') : 'pure';
      const done = mem.rollingOut && level(st);
      const cue = { mode, latDeg: 15 }; // hold 15° off Lead's current tail (Patrick 22:28Z)
      // The sequence's 360° is where #2 sets his spacing (Patrick 01:03Z, "360 and the wingman uses it to set their
      // spacing"): a new distance, or a place he is not yet on, is eased in over the rest of the turn (at the commanded
      // bank's turn rate, standard kinematics), never quicker than WING.rangeSec, instead of in a few seconds. Already
      // set, nothing moves.
      if (turnDeg != null && !mem.rollingOut) {
        const rate = (G_FTPS2 * Math.tan(bankDeg * DEG)) / Math.max(st.V, 1);
        cue.settleSec = Math.max(WING.rangeSec, (turnDeg * DEG - mem.turned) / rate);
      }
      return { g: gForClimb(st, 0), bank, phase: mem.rollingOut ? 'rolling out' : Math.abs(st.bank) < bankDeg - 2 ? 'rolling in' : 'turning', cue, done };
    },
  };
}

/** Wings level: roll out and hold height, then straight and level until the next press. */
export function wingsLevel() {
  return {
    key: 'wingsLevel',
    label: 'Wings level',
    interruptible: true,
    init: () => ({}),
    step(st) {
      return { g: gForClimb(st, 0), bank: 0, phase: Math.abs(st.bank) > 1 ? 'rolling out' : 'straight', cue: { mode: 'pure', latDeg: 15 }, done: false };
    },
  };
}

/** Straight and level (what Lead flies after a manoeuvre until the next press). */
export function hold() {
  const c = wingsLevel();
  return { ...c, key: 'hold', label: 'Straight and level' };
}

/** Reversal: roll through to the same bank the other way (Patrick's list). Needs a turn to reverse. */
export function reversal(fromBankTurnSimDeg, bankDeg) {
  const dir = fromBankTurnSimDeg > 0 ? -1 : 1; // the new turn's way
  const c = levelTurn(dir, bankDeg, { label: `Reversal to the ${dir > 0 ? 'left' : 'right'}, ${Math.round(bankDeg)}°` });
  return { ...c, key: 'reversal' };
}

/**
 * #2's pursuit for a nose that rises or falls (Patrick's loop rule, 17:12Z, carried over to the climb and descent, an
 * estimate): lag while Lead's nose comes up, lead while it goes down, pure once it is steady. Lag sits outside Lead's
 * pull and lead inside his push, so both keep #2 just below Lead's path (EFIG p.391: lead inside the turn circle, lag
 * outside). pitchDps: Lead's flight path's pitch rate, up positive.
 */
function pitchCue(pitchDps) {
  return pitchDps > LEAD.pitchCueDps ? 'lag' : pitchDps < -LEAD.pitchCueDps ? 'lead' : 'pure';
}

/**
 * Climb (sign +1) or descend (-1): Lead changes his pitch only, 15° (estimate) through 2,000 ft (estimate), easing onto
 * the new height over the last 800 ft (estimate), at the bank he had (bankDeg, point-mass convention), and then holds
 * that height and bank until the next press. PCL MAX throughout (SMM 16.17 para 43).
 */
export function climbOrDescend(sign, bankDeg = 0) {
  const word = sign > 0 ? 'Climb' : 'Descend';
  return {
    key: sign > 0 ? 'climb' : 'descend',
    label: `${word} ${LEAD.climbDeg}°, ${LEAD.climbChangeFt.toLocaleString('en-CA')} ft`,
    interruptible: true,
    init: (st) => ({ hTarget: st.pm.z + sign * LEAD.climbChangeFt, gammaPrev: st.gammaRad }),
    step(st, mem) {
      const toGo = mem.hTarget - st.pm.z;
      const want = Math.max(-1, Math.min(1, toGo / LEAD.levelOffFt)) * LEAD.climbDeg * DEG;
      const pitchDps = (st.gammaRad - mem.gammaPrev) / DEG / STEP_SEC;
      mem.gammaPrev = st.gammaRad;
      const near = Math.abs(toGo) < 20 && Math.abs(st.gammaRad) < 0.5 * DEG;
      const phase = near ? 'level' : Math.abs(toGo) < LEAD.levelOffFt ? 'levelling off' : sign > 0 ? 'climbing' : 'descending';
      // The nose moves at no more than 3°/s (estimate): the same damped climb, its target brought nearer.
      const omega = 0.4;
      const reach = (LEAD.climbPitchDps * DEG) / omega;
      const aim = st.gammaRad + Math.max(-reach, Math.min(reach, want - st.gammaRad));
      const g = Math.max(LEAD.minPushG, gForClimb(st, aim, omega));
      return { g, bank: bankDeg, phase, cue: { mode: pitchCue(pitchDps), latDeg: 15 }, done: false };
    },
  };
}

/**
 * The speed set-up before an aerobatic manoeuvre: wings level, nose down at MAX to gain speed or up to lose it (up to
 * 10°, an estimate), until within 15 KIAS of the entry speed (Patrick 04:59Z, LEAD.loopEntryBandKias), level and at 1 G. Returns the ask, or null when
 * ready (or after the guard time, when the manoeuvre starts at the speed Lead has).
 */
function speedSetUp(st, mem, kias) {
  mem.setupSec = (mem.setupSec ?? 0) + STEP_SEC;
  const dKias = st.kias - kias;
  const ready = Math.abs(dKias) <= LEAD.loopEntryBandKias && Math.abs(st.gammaRad) < 1 * DEG && Math.abs(st.bank) < 1 && Math.abs(st.g - 1) < 0.1;
  if (ready || mem.setupSec > LEAD.setupLimitSec) return null;
  const pitch = Math.max(-LEAD.setupMaxPitchDeg, Math.min(LEAD.setupMaxPitchDeg, 0.5 * dKias)) * DEG;
  const reach = (LEAD.climbPitchDps * DEG) / 0.4;
  const aim = st.gammaRad + Math.max(-reach, Math.min(reach, pitch - st.gammaRad));
  const g = Math.max(LEAD.minPushG, gForClimb(st, aim, 0.4));
  const phase = Math.abs(st.bank) > 1 ? 'wings level' : dKias < -LEAD.loopEntryBandKias ? `nose low for ${kias}` : dKias > LEAD.loopEntryBandKias ? `nose high for ${kias}` : 'steady for the pull';
  return { g, bank: 0, phase };
}

/**
 * #2's pursuit word through the loop (Patrick 17:12Z: lag going up, fuselages parallel crossing the horizon, lead
 * coming down), by Lead's loop angle: LAG, PURE over the top (as near parallel as positive G allows, fluid-wing.js
 * LOOP_WING), LEAD, then PURE in trail for the pull-out. Where he sits for it is fluid-wing.js loopPlace.
 */
function loopMode(alphaRad) {
  const deg = alphaRad / DEG;
  return deg < 155 ? 'lag' : deg < 205 ? 'pure' : deg < LEAD.loopPullOutDeg ? 'lead' : 'pure';
}

/**
 * The loop (SMM 7.5 paras 10-13, Fig 7.2): the speed set-up, a 3.5 G wings-level pull to near the vertical, the nose
 * kept moving at a constant rate over the top and down, the pull-out to level. Never cut short (a press waits for it).
 */
export function loop() {
  return {
    key: 'loop',
    label: 'Loop',
    interruptible: false,
    init: () => ({ stage: 'setup' }),
    step(st, mem) {
      if (mem.stage === 'setup') {
        const s = speedSetUp(st, mem, LEAD.loopEntryKias);
        if (s) return { ...s, cue: { mode: 'pure', latDeg: 15 }, done: false };
        mem.stage = 'pull';
        mem.n0 = unit3({ x: st.nose.x, y: st.nose.y, z: 0 });
        mem.alpha = 0;
        mem.prev = 0;
        mem.entryKias = st.kias;
      }
      // How far round the loop: the nose's angle in the loop's plane, counted on past 180° (unwrapped).
      const a = Math.atan2(st.nose.z, st.nose.x * mem.n0.x + st.nose.y * mem.n0.y);
      mem.alpha += wrapPi(a - mem.prev);
      mem.prev = a;
      const alpha = mem.alpha;
      let g = /** @type {number} */ (LEAD.loopG);
      let phase = 'pull, 3.5 G';
      if (mem.stage === 'pull' && alpha >= LEAD.loopVerticalDeg * DEG) {
        mem.stage = 'over';
        mem.q = (G_FTPS2 * (st.g - Math.cos(alpha))) / st.V; // the pitch rate here, then held (SMM 7.5 paras 11-13)
      }
      if (mem.stage === 'over') {
        // The G that keeps the nose moving at that rate (rate x speed over g, plus gravity's share), no less than slight
        // positive over the top and no more than the pull's.
        const cap = alpha > Math.PI ? LEAD.loopDownMaxG : LEAD.loopG;
        g = Math.max(LEAD.loopTopMinG, Math.min(cap, (mem.q * st.V) / G_FTPS2 + Math.cos(alpha)));
        phase = alpha < 160 * DEG ? 'constant rate' : alpha < 200 * DEG ? 'over the top' : 'coming down';
        if (alpha >= LEAD.loopPullOutDeg * DEG) mem.stage = 'exit';
      }
      if (mem.stage === 'exit') {
        g = Math.min(LEAD.loopDownMaxG, gForClimb(st, 0, 1.2));
        phase = 'pull-out';
      }
      // The exit speed is read as the nose comes back to the horizon (SMM 7.5 para 12; Fig 7.2 "Exit 230 KIAS").
      if (mem.stage === 'exit' && mem.exitKias === undefined && alpha >= 2 * Math.PI - 0.5 * DEG) mem.exitKias = st.kias;
      const done = mem.stage === 'exit' && level(st);
      // The loop's frame for #2 (fluid-wing.js framePoint): the entry heading and the angle round so far.
      return { g, bank: 0, phase, cue: { mode: loopMode(alpha), latDeg: 15, loop: { n0: mem.n0, alpha } }, done, entryKias: mem.entryKias, exitKias: mem.exitKias };
    },
  };
}

/**
 * Two wingovers (SMM 16.17 para 47), the first rolling dir (+1 left, -1 right), the second the other way. The nose path:
 * the heading turns 180° each way on a smooth curve (no turn rate at the start or end of each, so the wings start and
 * finish level), the nose rises to 45° at the quarter, crosses the horizon at the 90° point (the highest point and the
 * most bank) and falls to 45° below at three quarters; at the end of the second it comes up to the horizon on the entry
 * heading. The nose rate is set for about 3 G (para 47), less near the stick shaker. Never cut short (a press waits).
 */
export function wingovers(dir) {
  const A = LEAD.wingoverPitchDeg * DEG;
  return {
    key: 'wingover',
    label: `Wingovers, ${dir > 0 ? 'left' : 'right'} first`,
    interruptible: false,
    init: () => ({ stage: 'setup' }),
    step(st, mem) {
      if (mem.stage === 'setup') {
        const s = speedSetUp(st, mem, LEAD.wingoverKias);
        if (s) return { ...s, cue: { mode: 'pure', latDeg: 15 }, done: false };
        mem.stage = 'over';
        mem.h0 = headingOf(st);
        mem.s = 0;
        mem.rate = 0;
        mem.t = 0;
        mem.entryKias = st.kias;
      }
      // The path is looked up from its plain numbers each step (mem is copied step to step, so it holds no functions).
      const path = wingoverPath(mem.h0, dir, A);
      let r = { g: 1, bank: 0, u: 2, end: true };
      if (mem.stage === 'over') {
        mem.t += STEP_SEC;
        // The pull builds to about 3 G over the first second (and no faster than LEAD.gOnset).
        r = followNose(st, path, mem, 1 + (LEAD.wingoverG - 1) * Math.min(1, mem.t));
        if (r.end) mem.stage = 'exit';
      }
      if (mem.stage === 'exit') r = { ...r, g: gForClimb(st, 0, 0.6), bank: 0 };
      if (mem.stage === 'exit' && mem.exitKias === undefined) mem.exitKias = st.kias;
      const first = r.u <= 1;
      const v = first ? r.u : r.u - 1;
      const phase = mem.stage === 'exit' ? 'level' : `${first ? 'first' : 'second'} wingover, ${v < 0.25 ? 'nose up' : v < 0.5 ? 'to the top' : v < 0.75 ? 'nose down' : 'pulling up'}`;
      const done = mem.stage === 'exit' && level(st);
      // Through the wingovers #2 goes where Lead was and drifts in the cone (hold 0), back to 15° once level (Patrick 23:02Z).
      const cue = mem.stage === 'exit' ? { mode: 'pure', latDeg: 15 } : { mode: overTheTopMode(v), latDeg: 15, hold: 0 };
      return { g: r.g, bank: r.bank, phase, cue, done, entryKias: mem.entryKias, exitKias: mem.exitKias };
    },
  };
}

/**
 * The barrel roll (SMM 14.8 paras 18-19, Fig 14.1), dir +1 left, -1 right: the speed set-up to 230 KIAS on the heading
 * Lead has (the reference line), then the nose round its circle (see the header) with the G plan, then level. Never cut
 * short (a press waits).
 */
export function barrelRoll(dir) {
  return {
    key: 'barrelRoll',
    label: `Barrel roll ${dir > 0 ? 'left' : 'right'}`,
    interruptible: false,
    init: () => ({ stage: 'setup' }),
    step(st, mem) {
      if (mem.stage === 'setup') {
        const s = speedSetUp(st, mem, LEAD.barrelKias);
        if (s) return { ...s, cue: { mode: 'pure', latDeg: 15 }, done: false };
        mem.stage = 'roll';
        mem.h0 = headingOf(st);
        mem.s = 0;
        mem.rate = 0;
        mem.t = 0;
        mem.entryKias = st.kias;
      }
      const path = barrelPath(mem.h0, dir);
      let r = { g: 1, bank: 0, u: 1, end: true };
      if (mem.stage === 'roll') {
        mem.t += STEP_SEC;
        const u = path.at(mem.s).u;
        const plan = LEAD.barrelG - (LEAD.barrelG - LEAD.barrelTopG) * Math.sin(Math.PI * u) ** 2;
        r = followNose(st, path, mem, 1 + (plan - 1) * Math.min(1, mem.t));
        if (r.end) mem.stage = 'exit';
      }
      if (mem.stage === 'exit') r = { ...r, g: gForClimb(st, 0, 0.6), bank: 0 };
      // The exit speed is read as the nose comes back to the horizon on the line (SMM 14.8 para 19).
      if (mem.stage === 'exit' && mem.exitKias === undefined) mem.exitKias = st.kias;
      const u = r.u;
      const phase = mem.stage === 'exit' ? 'level' : u < 0.25 ? 'pull and roll' : u < 0.5 ? 'to inverted' : u < 0.75 ? 'nose down' : 'back to the line';
      const done = mem.stage === 'exit' && level(st);
      // #2 like the loop (Patrick card 19:21Z), drifting in the cone, back to 15° once level (23:02Z).
      const cue = mem.stage === 'exit' ? { mode: 'pure', latDeg: 15 } : { mode: overTheTopMode(u), latDeg: 15, hold: 0 };
      return { g: r.g, bank: r.bank, phase, cue, done, entryKias: mem.entryKias, exitKias: mem.exitKias };
    },
  };
}

/** The barrel roll's nose path: a circle of 45° about a point on the horizon 45° off the reference line, toward the roll. */
function barrelPath(h0, dir) {
  const A = LEAD.barrelPitchDeg * DEG;
  const off = LEAD.barrelOffDeg * DEG;
  return cachedPath(`barrel ${h0} ${dir}`, () => nosePath((u) => {
    const phi = 2 * Math.PI * u;
    return noseAt(h0 + dir * off * (1 - Math.cos(phi)), A * Math.sin(phi));
  }, 1));
}

/**
 * The standard sequence's parts (SMM 16.17 para 42), in its order: a level turn dir (+1 left) at bankDeg for 360°
 * (Patrick 01:03Z; #2 sets his spacing in it), a loop, two wingovers rolling dir first, a barrel roll dir.
 */
export function sequenceParts(dir, bankDeg) {
  return [
    levelTurn(dir, bankDeg, { turnDeg: 360, label: `Level turn ${dir > 0 ? 'left' : 'right'}, ${Math.round(bankDeg)}°, 360°` }),
    loop(),
    wingovers(dir),
    barrelRoll(dir),
  ];
}

/** Planned nose paths, kept by their numbers (a few at a time). */
const pathCache = new Map();
function cachedPath(key, make) {
  if (!pathCache.has(key)) {
    if (pathCache.size > 20) pathCache.clear();
    pathCache.set(key, make());
  }
  return pathCache.get(key);
}

/** The wingovers' nose path (see wingovers). */
function wingoverPath(h0, dir, A) {
  return cachedPath(`wingover ${h0} ${dir} ${A}`, () => nosePath((u) => {
    const first = u <= 1;
    const v = first ? u : u - 1;
    const d = first ? dir : -dir;
    const h = h0 + (first ? 0 : dir * Math.PI) + d * Math.PI * 0.5 * (1 - Math.cos(Math.PI * v));
    return noseAt(h, A * Math.sin(2 * Math.PI * v));
  }, 2));
}

/** The entry from fighting wing (AFM7 brief p.17): a 30° bank turn away from #2 while all call ready, then 60° and PCL MAX. */
export function entry(dir, bankDeg) {
  const turn = levelTurn(dir, bankDeg);
  return {
    key: 'entry',
    label: `Entry: 30° turn, then ${Math.round(bankDeg)}° at MAX`,
    interruptible: false,
    init: (st, ctx) => ({ t: 0, stage: 'thirty', fwKias: st.kias, turnMem: null, wingSide: ctx?.wingSide }),
    step(st, mem, ctx) {
      if (mem.stage === 'thirty') {
        mem.t += Math.abs(st.bank) > LEAD.levelBanks.gentle - 1 ? STEP_SEC : 0;
        if (mem.t < LEAD.entryHoldSec) {
          return { g: gForClimb(st, 0), bank: -dir * LEAD.levelBanks.gentle, holdKias: mem.fwKias, phase: '30° turn, ready calls', cue: { mode: 'pure', latDeg: 15, blend: 0 }, done: false };
        }
        mem.stage = 'turn';
        mem.turnMem = turn.init(st, ctx);
      }
      const r = turn.step(st, mem.turnMem);
      // Fig 12.20, turn away: #2 collapses into the cone by lead pursuit. The blend into the fluid picture starts here,
      // and the entry ends once he is in it (the blend time: from the close-in rate since V2.59, ctx.blendInSec, else
      // WING.blendInSec), so Lead's next manoeuvre starts from a settled picture.
      const blendSec = ctx?.blendInSec ?? WING.blendInSec;
      return { ...r, phase: `${Math.round(bankDeg)}° at MAX`, cue: { mode: 'lead', latDeg: 15, blend: 1 }, done: Math.abs(st.bank) >= bankDeg - 1 && mem.turnMem.t > blendSec + 1 };
    },
  };
}

/**
 * Terminate (SMM 16.17 paras 45-46, 48; AFM7 brief p.17): Lead recovers to level flight, flies a gentle predictable turn
 * (30°, estimate) for 90° (estimate) with the power back to fighting wing's 200 KIAS, then rolls out; #2 goes back to
 * his fighting wing slot on the side he is on.
 */
export function terminate(dir) {
  return {
    key: 'terminate',
    label: 'Terminate',
    interruptible: false,
    init: (st) => ({ hPrev: headingOf(st), turned: 0, rollingOut: false, steady: 0, t: 0 }),
    step(st, mem, ctx) {
      const h = headingOf(st);
      mem.turned += wrapPi(h - mem.hPrev) * dir;
      mem.hPrev = h;
      let bank = -dir * LEAD.terminateBankDeg;
      const rollOut = Math.abs(headingChangeRollingOut(-st.bank, -st.rollRate, st.V));
      if (mem.rollingOut || mem.turned >= LEAD.terminateTurnDeg * DEG - rollOut) mem.rollingOut = true;
      if (mem.rollingOut) bank = 0;
      const steady = mem.rollingOut && level(st) && Math.abs(st.kias - LEAD.fwKias) < 0.5;
      mem.steady = steady ? mem.steady + STEP_SEC : 0;
      mem.t += STEP_SEC;
      return { g: gForClimb(st, 0), bank, holdKias: LEAD.fwKias, phase: mem.rollingOut ? 'rolling out' : 'gentle turn', cue: { mode: 'pure', latDeg: 15, blend: 0 }, done: mem.steady >= 3 && mem.t > (ctx?.blendOutSec ?? WING.blendOutSec) + 1 };
    },
  };
}
