// Lead in fluid manoeuvring, the simplified baseline (spec section 10.3, TS-57; Patrick 21:44Z: "a working baseline thats
// simplified"). Every Lead button is planned at the press as a path, flown by the shared point-mass step (core
// stepPointMass: G along the lift, bank from the horizon) with the T-6A's full-power thrust and drag (core t6aExcessFn).
// Each button is a small "pilot" that asks for a G and a bank every step; the G builds at no more than 4 G/s (an
// estimate, design 5.3) and the roll inside the T-6A's ceiling at this speed (TS-85; the ruled 90°/s of TS-37 until then), so nothing jumps. The path is worked
// out ahead of time and replayed (the planned path drawn is the path flown, spec F1).
//
// Power: PCL MAX for the whole exercise (AFM7 brief p.17; SMM 16.17 paras 42-43, both aircraft the same power), except
// Terminate and the fighting wing after it, where Lead flies a held speed (fighting wing's 200 KIAS, TS-53) at 20% to 80%
// torque (TS-216, the band fluid.js asks for). The power is the engine's (TS-218, power.js engineStep): each step the
// throttle asked (MAX, or what holds the speed) is reached at the engine's quick rate, and from a settled idle only after
// its lag; the engine rides on the state (st.eng), so Lead and the live wingmen who fly this step all carry it.
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
//    AFM7 brief p.17; Patrick's pick 19:20Z row 7), rolled out as soon as #2 is back in fighting wing (Patrick 12 Oct
//    2026 04:33Z: "as soon as the aircraft are back in fighting wing position its roll out and move on, not 'finish a
//    turn'").
//  - Loop (V2.18; rebuilt V2.424 to TS-213, TS-215 and TS-221; SMM 7.5 paras 10-13 and Fig 7.2; Table 7.1; EFIG
//    p.170-171): PCL MAX, so no speed set-up: Lead pulls from level, wings level, at whatever speed he has once #2 has
//    rolled out, and refuses below 200 KIAS (TS-221). The pull is 3.5 G (EFIG p.171) but no more than 17 units AOA
//    (Patrick 12 Oct 2026: shaker at 15, ease to 17): from 230-240 KIAS 3.5 G holds to about 80° nose up, then he rides
//    17 units to the vertical. At 90° he holds the nose rate he has (TS-221: "make it smooth", so the rate's own change
//    carries on), and every 0.25 s predicts his exit speed for a rate and eases toward the one that gives his entry speed
//    (SMM 7.5 para 12, "adjust back pressure to achieve" the exit), under 4 G (Lead's limit, Gen Book p.11), never under
//    0.5 G over the top. Alone, he eases onto 1 G on the horizon; in the sequence he flows into the wingovers still
//    pulling, with no unload. The design and its runs: Pat's claude work/formation-review-12oct/research/loop-design.md.
//  - Wingovers (V2.19; SMM 16.17 para 47, the only text; no figure in the SMM or EFIG): the pull up at about 3 G,
//    aileron blended in as the nose comes through the horizon, about 45° of pitch above and below the horizon, up to 120°
//    of bank, out on a heading about 180° from the entry; then the second the other way (para 47: "ideally"), back to
//    the entry heading. Flown as a planned nose path: the climbing half at about 3 G, the descending half at the nose
//    rate the exit predictor picks for the entry speed (TS-215), so the 120° of bank and the 45° come out of it.
//  - Barrel roll (V2.19; SMM 14.8 paras 18-19, Fig 14.1; Table 14.1; Patrick's picks 19:20Z rows 5 and 6): PCL MAX,
//    on a reference line, a 3 G wings-level pull and the roll blended in; the nose circles a point on the horizon 45° off
//    the line: 45° off at 45° pitch up and about 90° of bank, 90° off level and inverted, 45° off at 45° pitch down, then
//    level on the line. Back pressure: 3 G at the entry (Table 14.1) easing to 2.25 G over the top (para 19; 2.25 an
//    estimate), then the descending half at the predictor's rate for the entry speed (TS-215; Fig 14.1 "adjust rate as
//    required"). Pitch over 60° is flagged (AFM7 brief p.17, Exercise 4), never held.
//  - The standard sequence (V2.19; SMM 16.17 para 42, as written there): a level turn, a loop, two wingovers and a
//    barrel roll, flown one after the other. The level turn is at the chosen bank (60/2 by default, AFM7 brief p.17
//    Exercise 1) for 360° (Patrick card 5 Oct 01:03Z, "360°", and "360 and the wingman uses it to set their spacing"),
//    so #2 settles onto his fluid position during it. Then the loop once #2 has rolled out, flowing into the wingovers
//    and on into the barrel roll, each starting at the speed the last one handed it and ending at it (TS-215).
import { stepPointMass, gAndBankForLift } from '../../../core/point-mass.js';
import { easeValue, dampedClimbG, turnRateFromBankRadPerSec, softMin, softMax } from '../../../core/flight-math.js';
import { excessFnFor, tasToIasKt, shakerG, gAtAoaUnits, t6aExcessFn, dragPerWeight, thrustPerWeight, T6A_G_ONSET, T6A_ROLL } from '../../../core/t6-performance.js';
import { wrapPi, DEG } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, headingChangeRollingOut, rollLimitAt } from './flight.js';
import { ROLL, WING, LEAD, LEAD_ROLL } from './tuning.js';
import { engineFrom, engineStep, throttleAtTorque } from './power.js';

export { LEAD }; // its home is lead-moves.js (the tuning sheet, TS-214); read from here by older imports
import { add3, sub3, scale3, len3, cross3, unit3, perp3, dot3 } from './attitude.js';

const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The buttons Lead has in the baseline (design 5.1, cut down by Patrick 21:44Z), with their words. */
export const FLUID_MOVES = Object.freeze({
  levelTurn: { label: 'Level turn', sided: true, interruptible: true, source: 'AFM7 brief p.17 (60/2 at PCL MAX)' },
  wingsLevel: { label: 'Wings level', sided: false, interruptible: true, source: 'ends a turn' },
  reversal: { label: 'Reversal', sided: false, interruptible: true, source: "Patrick's list (not a manual manoeuvre)" },
  climb: { label: 'Climb', sided: false, interruptible: true, source: "Patrick's list; design 5.1 (15° and 2,000 ft are estimates)" },
  descend: { label: 'Descend', sided: false, interruptible: true, source: "Patrick's list; design 5.1 (15° and 2,000 ft are estimates)" },
  loop: {
    label: 'Loop', sided: false, interruptible: false, source: 'SMM 7.5 paras 10-13, Fig 7.2; Table 7.1; EFIG p.171',
    speeds: { minKias: LEAD.loopMinKias, exitTolKt: LEAD.loopExitTolKt, source: 'TS-221; SMM 7.5 para 12' },
  },
  wingover: {
    label: 'Wingovers', sided: true, interruptible: false, source: 'SMM 16.17 para 47',
    speeds: { minKias: null, exitTolKt: null, source: 'TS-215: out at the speed in' },
  },
  barrelRoll: {
    label: 'Barrel roll', sided: true, interruptible: false, source: 'SMM 14.8 paras 18-19, Fig 14.1; Table 14.1',
    speeds: { minKias: null, exitTolKt: null, source: 'TS-215: out at the speed in; SMM Fig 14.1' },
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
    eng: engineFrom(a.power), // the engine as the aircraft has it (TS-218): unknown when nothing set its power
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

/**
 * The throttle (share of full-power thrust) that holds an indicated speed: the speed hold's rate (LEAD.speedHold), up to
 * full power and down to the power floor (slow-down.js, TS-61), or inside a torque band ({ minTorquePct, maxTorquePct }:
 * Lead's 20-80% in formation, TS-216). Standard energy: thrust less drag gives the rate.
 */
function holdThrottle(st, kiasTarget, band = null) {
  const altFt = st.pm.z;
  const kias = Math.max(st.kias, 1);
  const ktas = st.V / KT_TO_FTPS;
  const wantKtps = Math.min(LEAD.speedHold.maxKtps, LEAD.speedHold.perSec * (kiasTarget - kias));
  const wantExcess = (wantKtps * KT_TO_FTPS * (ktas / kias)) / G_FTPS2;
  const thr = (wantExcess + dragPerWeight(kias, altFt, st.g)) / thrustPerWeight(kias, altFt);
  const lo = band ? throttleAtTorque(band.minTorquePct, kias, altFt) : 0;
  const hi = band ? throttleAtTorque(band.maxTorquePct, kias, altFt) : 1;
  return Math.max(lo, Math.min(hi, thr));
}

/**
 * Lead's power for the tag (power.js, TS-62): the throttle his engine gives (st.eng, TS-218); without one, PCL MAX (1)
 * through the manoeuvres (SMM 16.17 para 43), and in a stage that holds a speed the throttle that holds it.
 */
export function leadThrottle(st, holdKias) {
  if (st.eng && st.eng.thr !== null && st.eng.thr !== undefined) return st.eng.thr;
  if (!holdKias) return 1;
  return holdThrottle(st, holdKias);
}

/**
 * One fixed step of Lead (and of the live wingman): G and bank eased toward the pilot's ask ({ g, bank } in degrees, or a
 * lift vector in G along the body up wanted: `lift`), then the point mass (two half steps for accuracy). holdKias: a
 * speed to hold (else MAX); torqueBand: the torque the hold stays inside (Lead's LEAD_POWER in formation, TS-216).
 * The G ask is held under the stick shaker's line, the one physical limit (core shakerG); published limits are flagged
 * by the card, never held here.
 */
export function stepLead(st, ask) {
  const half = STEP_SEC / 2;
  let s = st;
  // The engine (TS-218): MAX, or the throttle that holds the speed asked (inside ask.torqueBand when given: Lead's 20-80%,
  // TS-216), reached as the engine answers; the step flies the thrust it gives.
  // ask.throttle: a set throttle instead (the programme Lead's climbs at 80% torque and descents at 20%, TS-225, lead-pilot.js).
  const wantThr = ask.throttle ?? (ask.holdKias ? holdThrottle(st, ask.holdKias, ask.torqueBand ?? null) : 1);
  const eng = engineStep(st.eng ?? null, wantThr, st.kias, st.pm.z, STEP_SEC);
  const excess = excessFnFor(eng.thr);
  for (let i = 0; i < 2; i++) {
    // A lift asked for as a vector (the live wingman, TS-194) is read into a G and a bank against the up of this half step,
    // and after the step the bank is re-read against the new up (carryBank), so the wings go where the lift wants and never
    // move because the level reference spun round the nose at the vertical (Patrick's "random stutter" in the loop, 12 Oct
    // 2026 04:14Z: a 0.5° roll twitch as #2's nose passed the vertical). A G and a bank asked for as numbers are flown as before.
    const want = ask.lift ? gAndBankForLift(ask.lift, s.nose, s.pm.up, s.bank * DEG) : null;
    const askG = want ? want.g : ask.g;
    const askBank = want ? want.bankRad / DEG : ask.bank;
    // Lead (ask.lead, fluid.js) pulls up to 17 units AOA (Patrick 12 Oct 2026), his G built over gOnsetSec with the stop
    // planned (TS-223); #2's live step keeps the shaker line and the G onset without a build until phase B.
    const gCap = ask.lead ? gAtAoaUnits(s.kias, LEAD.loopAoaUnits) : shakerG(s.kias);
    const gLim = ask.lead ? { ...LEAD.gOnset, onsetSec: LEAD.gOnsetSec, accelDps2: s.gAcc ?? 0, plannedStop: true } : LEAD.gOnset;
    const g = easeValue(s.g, s.gRate, Math.min(askG, gCap), half, gLim);
    const target = s.bank + wrapPi((askBank - s.bank) * DEG) / DEG; // the near way round
    // The roll: ask.roll's rate (Lead's technique, LEAD_ROLL, TS-222) or the aircraft's, never faster than the T-6A at this
    // speed (TS-85). Lead's is built over the T-6A's 0.2 s onset with the roll-out planned (TS-223, core easeRoll
    // plannedStop); #2's live step keeps the roll without an onset until phase B.
    const roll = rollLimitAt(s.V, ask.roll ?? ROLL);
    const limits = ask.lead ? { ...roll, onsetSec: T6A_ROLL.onsetSec, accelDps2: s.rollAcc ?? 0, plannedStop: true } : roll;
    const r = easeValue(s.bank, s.rollRate, target, half, limits);
    const pm = stepPointMass(s.pm, { g: g.bankDeg, bankRad: r.bankDeg * DEG }, half, excess);
    const prev = s;
    s = finish({ pm, bank: wrapDeg(r.bankDeg), rollRate: r.rollRateDps, rollAcc: ask.lead ? r.rollAccelDps2 : 0, g: g.bankDeg, gRate: g.rollRateDps, gAcc: ask.lead ? g.rollAccelDps2 : 0, blockFt: s.blockFt, eng });
    if (want) s = carryBank(prev, s);
  }
  return s;
}

/**
 * The point mass measures bank from a level up (core upFrom), which spins round the nose when the nose passes near the
 * vertical a little off the plane (a loop flown slightly tilted). Holding the bank number through that spin would be a
 * real roll, so the bank is re-read against the new up to keep the lift where it was: the wings don't move because the
 * reference did. Used for the live wingman's step (stepLead with a lift vector); Lead's own buttons fly bank numbers.
 */
export function carryBank(prev, next) {
  const carried = unit3(perp3(prev.pm.up, next.nose));
  const spin = Math.atan2(dot3(cross3(carried, next.pm.up), next.nose), dot3(carried, next.pm.up));
  if (Math.abs(spin) < 1e-9) return next;
  const bankDeg = next.bank - spin / DEG;
  const b = bankDeg * DEG;
  const right = cross3(next.nose, next.pm.up);
  const bodyUp = unit3(add3(scale3(next.pm.up, Math.cos(b)), scale3(right, Math.sin(b))));
  const accPerp = perp3(sub3(scale3(bodyUp, next.g * G_FTPS2), { x: 0, y: 0, z: G_FTPS2 }), next.nose);
  return { ...next, bank: ((bankDeg + 540) % 360) - 180, bodyUp, accPerp };
}

// ---- small pilot helpers ----------------------------------------------------------------------------

/** The G that holds (or brings smoothly onto) a climb angle at the bank flown now (core dampedClimbG over cos bank). */
export function gForClimb(st, targetRad, omega = LEAD.climbDamp.holdPerSec) {
  const cb = Math.max(0.25, Math.cos(st.bank * DEG));
  return Math.max(0, dampedClimbG(st.gammaRad, targetRad, st.V, omega)) / cb;
}
const headingOf = (st) => Math.atan2(st.nose.y, st.nose.x);
const wrapDeg = (d) => wrapPi(d * DEG) / DEG;
const level = (st) => Math.abs(st.gammaRad) < 0.3 * DEG && Math.abs(wrapDeg(st.bank)) < 0.5 && Math.abs(st.g - 1) < 0.03;

/** A nose direction from a heading and a climb angle (radians). */
export const noseAt = (h, th) => ({ x: Math.cos(th) * Math.cos(h), y: Math.cos(th) * Math.sin(h), z: Math.sin(th) });

/**
 * A planned nose path (the wingovers and the barrel roll): the nose direction as a function of u over [0, uEnd],
 * tabled by the angle the nose has moved through so far, so the pilot's one lever is how fast the nose moves along it
 * (the SMM's own words for the barrel roll: "keep the nose moving at a constant rate", 14.8 para 19).
 * Returns { total (radians), sAtU(u), at(s) -> { nose, tangent, u } }.
 */
export function nosePath(N, uEnd, steps = 4000) {
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
  // The angle moved through by u (where a wingover's second part starts, where a part ends).
  const sAtU = (u) => {
    let lo = 0;
    let hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (us[mid] <= u) lo = mid;
      else hi = mid;
    }
    return ss[lo];
  };
  return {
    total,
    sAtU,
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
export function followNose(st, path, mem, gWant) {
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
  return u < LEAD.overTopCue.pureFromU ? 'lag' : u < LEAD.overTopCue.leadFromU ? 'pure' : u < LEAD.overTopCue.pureAgainFromU ? 'lead' : 'pure';
}

// ---- the controllers: one per button -------------------------------------------------------------
// Each is { key, label, interruptible, init(st, ctx) -> mem, step(st, mem) -> { g, bank, holdKias?, phase, cue, done } }.
// cue: what #2 does with the part of the path Lead is flying now (fluid-wing-live.js liveWord): mode 'lag' | 'pure' | 'lead', latDeg
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
        const rollOut = Math.abs(headingChangeRollingOut(-st.bank, -st.rollRate, st.V, LEAD_ROLL, -(st.rollAcc ?? 0), true));
        if (mem.rollingOut || mem.turned >= turnDeg * DEG - rollOut) mem.rollingOut = true;
        if (mem.rollingOut) bank = 0;
      }
      const mode = mem.t < LEAD.earlyCueSec ? (mem.into ? 'lag' : 'lead') : 'pure';
      const done = mem.rollingOut && level(st);
      const cue = { mode, latDeg: LEAD.cueOffTailDeg }; // hold 15° off Lead's current tail (Patrick 22:28Z)
      // The sequence's 360° is where #2 sets his spacing (Patrick 01:03Z, "360 and the wingman uses it to set their
      // spacing"): a new distance, or a place he is not yet on, is eased in over the rest of the turn (at the commanded
      // bank's turn rate, standard kinematics), never quicker than WING.rangeSec, instead of in a few seconds. Already
      // set, nothing moves.
      if (turnDeg != null && !mem.rollingOut) {
        const rate = turnRateFromBankRadPerSec(Math.max(st.V, 1), bankDeg);
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
      return { g: gForClimb(st, 0), bank: 0, phase: Math.abs(st.bank) > 1 ? 'rolling out' : 'straight', cue: { mode: 'pure', latDeg: LEAD.cueOffTailDeg }, done: false };
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
      const near = Math.abs(toGo) < LEAD.climbNearFt && Math.abs(st.gammaRad) < 0.5 * DEG;
      const phase = near ? 'level' : Math.abs(toGo) < LEAD.levelOffFt ? 'levelling off' : sign > 0 ? 'climbing' : 'descending';
      // The nose moves at no more than 3°/s (estimate): the same damped climb, its target brought nearer.
      const omega = LEAD.climbDamp.pitchPerSec;
      const reach = (LEAD.climbPitchDps * DEG) / omega;
      const aim = st.gammaRad + Math.max(-reach, Math.min(reach, want - st.gammaRad));
      const g = Math.max(LEAD.minPushG, gForClimb(st, aim, omega));
      return { g, bank: bankDeg, phase, cue: { mode: pitchCue(pitchDps), latDeg: LEAD.cueOffTailDeg }, done: false };
    },
  };
}

// ---- the loop, wingovers and barrel roll: flown at full power, out at the speed in (TS-213, TS-215, TS-221) ----------
// The design and its runs: Pat's claude work/formation-review-12oct/research/loop-design.md (12 Oct 2026). Every number
// is in lead-moves.js LEAD with its source.

/** How Lead eases a held nose rate (°/s): its change at most noseRateAccelDps2, that change built at noseRateJerkDps3. */
const noseRateEase = () => ({ maxRateDps: LEAD.noseRateAccelDps2, maxAccelDps2: LEAD.noseRateJerkDps3 });

/** A stand-alone exit's cap on the nose rate (°/s) with leftDeg to go to the horizon: a jerk-limited stop on it. */
const endCapDps = (leftDeg) => (leftDeg <= 0 ? 0 : 0.5 * LEAD.endJerkDps3 * Math.cbrt((6 * leftDeg) / LEAD.endJerkDps3) ** 2);

/** The most G Lead pulls in the loop: 4 G (his limit) and 17 units AOA, met softly. */
const loopCapG = (kias) => softMin(LEAD.loopDownMaxG, gAtAoaUnits(kias, LEAD.loopAoaUnits), LEAD.limitKneeG);

/** The most G on a nose path (the wingovers, the barrel roll): 4 G and 90% of the shaker, met softly. */
const pathCapG = (kias) => softMin(LEAD.loopDownMaxG, LEAD.shakerShare * shakerG(kias), LEAD.limitKneeG);

/** What a pilot sees on the card when an exit misses the entry speed by more than 5 kt (an estimate), and why. */
function exitNote(entryKias, exitKias, flag, tolKt) {
  const off = exitKias - entryKias;
  if (Math.abs(off) <= 5) return null;
  const why = flag === 'fast' ? ': it needed more than Lead\'s 4 G' : flag === 'slow' ? ': too slow even at the gentlest nose rate' : '';
  return `Exit ${Math.round(exitKias)} KIAS, ${Math.round(Math.abs(off))} kt ${off > 0 ? 'fast' : 'slow'} of the entry${why}${tolKt != null && Math.abs(off) > tolKt ? ` (outside ${tolKt} kt)` : ''}`;
}

/**
 * The loop's exit speed if from now the nose rate eases from (r, rd, rdd) toward rTarget (°/s) with Lead's ease, the
 * G under the same soft limits: a fast run of the same physics in the loop's plane (wings level, PCL MAX), to the nose
 * back on the horizon (alpha 360°). Alone (standalone) the rate also eases to zero on the horizon. KIAS, and whether a
 * pull wanted more than the 4 G cap.
 */
function predictLoopExit({ V, h, alpha, r, rd, rdd }, rTarget, standalone) {
  let rs = { bankDeg: r, rollRateDps: rd, rollAccelDps2: rdd };
  let needMore = false;
  const dt = STEP_SEC;
  for (let t = 0; alpha < 2 * Math.PI && t < 60; t += dt) {
    rs = easeValue(rs.bankDeg, rs.rollRateDps, rTarget, dt, noseRateEase());
    let rc = rs.bankDeg;
    if (standalone) {
      rc = Math.max(0, softMin(rc, endCapDps((2 * Math.PI - alpha) / DEG), LEAD.endKneeDps));
      if (2 * Math.PI - alpha < 0.3 * DEG && rc < 0.3) break; // on the horizon, the nose all but stopped: the exit
    }
    const f = (V0, h0, a0) => {
      const cap = loopCapG(tasToIasKt(V0 / KT_TO_FTPS, h0));
      const raw = (rc * DEG * V0) / G_FTPS2 + Math.cos(a0);
      const G = softMax(LEAD.loopTopMinG, softMin(raw, cap, LEAD.limitKneeG), LEAD.limitKneeG);
      return { G, raw, cap, dV: G_FTPS2 * (t6aExcessFn(V0 / KT_TO_FTPS, h0, G) - Math.sin(a0)), dh: V0 * Math.sin(a0), da: (G_FTPS2 * (G - Math.cos(a0))) / V0 };
    };
    const k1 = f(V, h, alpha);
    const k2 = f(V + (k1.dV * dt) / 2, h + (k1.dh * dt) / 2, alpha + (k1.da * dt) / 2);
    if (k1.raw > k1.cap + 0.05 && k1.cap > LEAD.loopDownMaxG - 0.3) needMore = true;
    V += k2.dV * dt;
    h += k2.dh * dt;
    alpha += k2.da * dt;
  }
  return { kias: tasToIasKt(V / KT_TO_FTPS, h), needMore };
}

/**
 * The nose rate (°/s) that brings the loop's exit to the entry speed: halving on the predictor (the exit is slower the
 * faster the nose comes round). The bounds keep it a pilot's, 2 to 30°/s. flag: 'fast' if even 30°/s exits fast (it
 * wants more G), 'slow' if even 2°/s exits slow.
 */
function solveLoopRate(now, entryKias, standalone) {
  let lo = 2;
  let hi = 30;
  const fHi = predictLoopExit(now, hi, standalone);
  if (fHi.kias > entryKias) return { r: hi, flag: 'fast', pred: fHi };
  const fLo = predictLoopExit(now, lo, standalone);
  if (fLo.kias < entryKias) return { r: lo, flag: 'slow', pred: fLo };
  for (let i = 0; i < 14; i++) {
    const mid = 0.5 * (lo + hi);
    if (predictLoopExit(now, mid, standalone).kias > entryKias) lo = mid;
    else hi = mid;
  }
  const r = 0.5 * (lo + hi);
  const pred = predictLoopExit(now, r, standalone);
  return { r, flag: pred.needMore && pred.kias - entryKias > 5 ? 'fast' : null, pred };
}

/**
 * #2's pursuit word through the loop (Patrick 17:12Z: lag going up, fuselages parallel crossing the horizon, lead
 * coming down), by Lead's loop angle: LAG, PURE over the top (as near parallel as positive G allows), LEAD, then PURE in
 * trail for the pull-out. Where he sits for it is the live wingman's own law (fluid-wing-live.js loopWords).
 */
function loopMode(alphaRad) {
  const deg = alphaRad / DEG;
  return deg < LEAD.loopCueDeg.pureFrom ? 'lag' : deg < LEAD.loopCueDeg.leadFrom ? 'pure' : deg < LEAD.loopPullOutDeg ? 'lead' : 'pure';
}

/**
 * The loop (TS-213, TS-221; SMM 7.5 paras 10-13, Fig 7.2). Lead rolls wings level and holds level at MAX, at least
 * waitSec (the sequence: #2 rolls out first) and until he has LEAD.loopMinKias, then pulls 3.5 G, no more than 17 units
 * AOA, to the vertical; from 90° he flies the nose rate the exit predictor picks for his entry speed, under 4 G. Alone it
 * ends level on the horizon; flow (the sequence) ends at 360° still pulling, handing its nose rate and G to the next
 * manoeuvre (handover). Never cut short (a press waits for it).
 */
export function loop({ waitSec = 0, flow = false } = {}) {
  const standalone = !flow;
  const pure = { mode: 'pure', latDeg: LEAD.cueOffTailDeg };
  return {
    key: 'loop',
    label: 'Loop',
    interruptible: false,
    init: () => ({ stage: 'wait', waitT: 0 }),
    step(st, mem) {
      if (mem.stage === 'wait') {
        mem.waitT += STEP_SEC;
        const ready = mem.waitT >= waitSec && st.kias >= LEAD.loopMinKias && Math.abs(st.gammaRad) < 1 * DEG && Math.abs(st.bank) < 1 && Math.abs(st.g - 1) < 0.1;
        if (!ready) {
          // In the sequence, still under the minimum after a minute at MAX (it never has been): the loop is skipped.
          if (mem.waitT > waitSec + LEAD.loopWaitLimitSec) return { g: gForClimb(st, 0), bank: 0, phase: 'loop skipped', cue: pure, done: true, note: `Loop skipped: under ${LEAD.loopMinKias} KIAS (TS-221)` };
          const phase = mem.waitT < waitSec ? 'wings level, #2 rolling out' : st.kias < LEAD.loopMinKias ? `wings level at MAX for ${LEAD.loopMinKias} KIAS` : 'wings level for the pull';
          return { g: gForClimb(st, 0), bank: 0, phase, cue: pure, done: false };
        }
        mem.stage = 'pull';
        mem.n0 = unit3({ x: st.nose.x, y: st.nose.y, z: 0 });
        mem.prev = Math.atan2(st.nose.z, st.nose.x * mem.n0.x + st.nose.y * mem.n0.y);
        mem.alpha = 0;
        mem.entryKias = st.kias;
        mem.sinceSolve = Infinity;
        mem.qPrev = null;
        mem.flag = null;
      }
      // How far round the loop: the nose's angle in the loop's plane, counted on past 180° (unwrapped).
      const a = Math.atan2(st.nose.z, st.nose.x * mem.n0.x + st.nose.y * mem.n0.y);
      mem.alpha += wrapPi(a - mem.prev);
      mem.prev = a;
      const alpha = mem.alpha;
      // The path's pitch rate in the loop's plane now (°/s), from the G flown, and its change.
      const q = (G_FTPS2 * (st.g - Math.cos(alpha))) / st.V / DEG;
      const qd = mem.qPrev == null ? 0 : (q - mem.qPrev) / STEP_SEC;
      mem.qPrev = q;
      const cue = { mode: loopMode(alpha), latDeg: LEAD.cueOffTailDeg, loop: { n0: mem.n0, alpha } }; // the loop's frame for #2 (fluid-wing-live.js reads cue.loop)
      const out = { entryKias: mem.entryKias, exitKias: mem.exitKias };
      if (mem.stage === 'pull') {
        if (alpha < LEAD.loopVerticalDeg * DEG) {
          const cap = loopCapG(st.kias);
          return { ...out, g: softMin(LEAD.loopG, cap, LEAD.limitKneeG), bank: 0, phase: LEAD.loopG < cap - LEAD.limitKneeG ? 'pull, 3.5 G' : 'pull, 17 units', cue, done: false };
        }
        // At the vertical: hold the nose rate he has, its rate of change carried on, so the G rate does not step (TS-221).
        mem.stage = 'rate';
        mem.r = { bankDeg: q, rollRateDps: qd, rollAccelDps2: 0 };
      }
      if (mem.stage === 'rate') {
        mem.sinceSolve += STEP_SEC;
        const left = 2 * Math.PI - alpha;
        if (mem.sinceSolve >= LEAD.exitReplanSec && left > LEAD.exitFreezeDeg * DEG) {
          const sol = solveLoopRate({ V: st.V, h: st.pm.z, alpha, r: mem.r.bankDeg, rd: mem.r.rollRateDps, rdd: mem.r.rollAccelDps2 }, mem.entryKias, standalone);
          mem.rStar = sol.r;
          mem.flag = sol.flag; // the last prediction before the freeze: the card's note reads it
          mem.sinceSolve = 0;
        }
        mem.r = easeValue(mem.r.bankDeg, mem.r.rollRateDps, mem.rStar, STEP_SEC, noseRateEase());
        let rc = mem.r.bankDeg;
        if (standalone) rc = Math.max(0, softMin(rc, endCapDps(left / DEG), LEAD.endKneeDps));
        const raw = (rc * DEG * st.V) / G_FTPS2 + Math.cos(alpha);
        const g = softMax(LEAD.loopTopMinG, softMin(raw, loopCapG(st.kias), LEAD.limitKneeG), LEAD.limitKneeG);
        const atExit = alpha >= 2 * Math.PI || (standalone && left < 0.3 * DEG && rc < 0.3);
        if (!atExit) {
          const phase = alpha < 160 * DEG ? 'nose rate held' : alpha < 200 * DEG ? 'over the top' : 'coming down';
          return { ...out, g, bank: 0, phase, cue, done: false };
        }
        // The exit speed is read as the nose comes back to the horizon (SMM 7.5 para 12; Fig 7.2).
        mem.stage = 'exit';
        mem.exitKias = st.kias;
        const note = exitNote(mem.entryKias, st.kias, mem.flag, LEAD.loopExitTolKt);
        if (flow) return { entryKias: mem.entryKias, exitKias: mem.exitKias, g, bank: 0, phase: 'into the wingovers', cue, done: true, note, handover: { r: q, rd: qd, g: st.g } };
        mem.note = note;
      }
      // Alone: on the horizon, the G eased onto 1; hold it level.
      return { entryKias: mem.entryKias, exitKias: mem.exitKias, g: gForClimb(st, 0, LEAD.climbDamp.exitPerSec), bank: 0, phase: 'pull-out', cue, done: level(st), note: mem.note };
    },
  };
}

/** The nose rate (rad/s) along a path's tangent T (scaled by V/g) that gives G = g with the rest of the lift c: |T r + c| = g. */
function rateForG(T, c, g) {
  const a = dot3(T, T);
  const b = 2 * dot3(T, c);
  const cc = dot3(c, c) - g * g;
  return a > 1e-12 ? Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a)) : 0;
}

/**
 * A nose path's exit speed (KIAS at s = sEnd) if from now the nose rate eases from (r, rd, rdd) toward rTarget (°/s), the
 * G capped as flown (pathCapG): the same physics stepped ahead along the path. Alone (standalone) the rate also eases to
 * zero at the end.
 */
function predictPathExit(path, { V, h, s, r, rd, rdd }, rTarget, sEnd, standalone) {
  let rs = { bankDeg: r, rollRateDps: rd, rollAccelDps2: rdd };
  let needMore = false;
  const dt = STEP_SEC;
  for (let t = 0; s < sEnd && t < 60; t += dt) {
    rs = easeValue(rs.bankDeg, rs.rollRateDps, rTarget, dt, noseRateEase());
    let rc = rs.bankDeg;
    if (standalone) {
      rc = Math.max(0, softMin(rc, endCapDps((sEnd - s) / DEG), LEAD.endKneeDps));
      if (sEnd - s < 0.3 * DEG && rc < 0.3) break;
    }
    const p = path.at(s);
    const k = V / G_FTPS2;
    const w = perp3(Z, p.nose);
    const T = scale3(perp3(p.tangent, p.nose), k);
    let G = len3(add3(scale3(T, rc * DEG), w));
    const cap = pathCapG(tasToIasKt(V / KT_TO_FTPS, h));
    let rate = rc * DEG;
    if (G > cap) {
      needMore = needMore || cap > LEAD.loopDownMaxG - 0.3;
      G = cap;
      rate = rateForG(T, w, cap);
    }
    V += G_FTPS2 * (t6aExcessFn(V / KT_TO_FTPS, h, G) - p.nose.z) * dt;
    h += V * p.nose.z * dt;
    s += rate * dt;
  }
  return { kias: tasToIasKt(V / KT_TO_FTPS, h), needMore };
}

/** The descending half's nose rate (°/s) for the part's exit at the entry speed (a slower rate is a longer dive and a faster exit); 3 to 40°/s. */
function solvePathRate(path, now, entryKias, sEnd, standalone) {
  let lo = 3;
  let hi = 40;
  const fHi = predictPathExit(path, now, hi, sEnd, standalone);
  if (fHi.kias > entryKias) return { r: hi, flag: 'fast' };
  const fLo = predictPathExit(path, now, lo, sEnd, standalone);
  if (fLo.kias < entryKias) return { r: lo, flag: 'slow' };
  for (let i = 0; i < 14; i++) {
    const mid = 0.5 * (lo + hi);
    if (predictPathExit(path, now, mid, sEnd, standalone).kias > entryKias) lo = mid;
    else hi = mid;
  }
  return { r: 0.5 * (lo + hi), flag: null };
}

/**
 * A manoeuvre on a planned nose path (TS-215): each part's climbing half at the manual's G (gPlan(v), v 0 to 1 through
 * the part), its descending half at the nose rate the exit predictor picks for the entry speed. The nose rate is one
 * eased value all the way, so nothing steps. A flowing join (ctx.handIn from the manoeuvre before) starts the path where
 * the nose already is and eases the G handed in onto the plan over LEAD.joinBlendSec. Alone it ends level; flow hands
 * its nose rate and G on (handover). makePath(h0) gives the path from the entry heading.
 */
function pathManoeuvre({ makePath, parts, gPlan, flow }) {
  const standalone = !flow;
  return {
    init(st, ctx) {
      const handIn = ctx?.handIn ?? null;
      const h0 = headingOf(st);
      const path = makePath(h0);
      let s0 = 0;
      if (handIn) {
        // The nose has passed the horizon by a step or two: start the path where it is, so the steer does not pull it back.
        let best = -2;
        for (let k = 0; k <= 200; k++) {
          const sk = k * 0.1 * DEG;
          const d = dot3(path.at(sk).nose, st.nose);
          if (d > best) { best = d; s0 = sk; }
        }
      }
      return { stage: 'path', h0, s: s0, r: { bankDeg: handIn?.r ?? 0, rollRateDps: handIn?.rd ?? 0, rollAccelDps2: 0 }, handInG: handIn?.g ?? null, entryKias: st.kias, sinceSolve: Infinity, rStar: null, t: 0, part: 0, flag: null };
    },
    step(st, mem) {
      if (mem.stage === 'exit') return { g: gForClimb(st, 0, LEAD.climbDamp.exitPerSec), bank: 0, u: parts, end: true, done: level(st) };
      mem.t += STEP_SEC;
      const path = makePath(mem.h0); // looked up from its plain numbers each step (mem is copied step to step)
      const p = path.at(mem.s);
      const part = Math.min(parts - 1, Math.floor(p.u + 1e-9));
      const v = p.u - part;
      if (part !== mem.part) { mem.part = part; mem.rStar = null; mem.sinceSolve = Infinity; }
      const sEnd = path.sAtU(part + 1);
      const last = part === parts - 1;
      const k = st.V / G_FTPS2;
      const w = perp3(Z, st.nose); // gravity's share square to the path, in G
      const steer = scale3(perp3(sub3(p.nose, st.nose), st.nose), LEAD.noseSteerPerSec * k);
      const c = add3(w, steer);
      const T = scale3(perp3(p.tangent, st.nose), k);
      let target;
      if (v < 0.5) {
        // The manual's pull; after a flowing join the G handed in eases onto it (cosine), so the G rate builds from zero.
        const blend = mem.handInG != null ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, mem.t / LEAD.joinBlendSec))) : 0;
        const plan = gPlan(v);
        target = rateForG(T, c, plan + blend * ((mem.handInG ?? plan) - plan)) / DEG;
      } else {
        mem.sinceSolve += STEP_SEC;
        if (mem.sinceSolve >= LEAD.exitReplanSec && sEnd - mem.s > LEAD.exitFreezeDeg * DEG) {
          const sol = solvePathRate(path, { V: st.V, h: st.pm.z, s: mem.s, r: mem.r.bankDeg, rd: mem.r.rollRateDps, rdd: mem.r.rollAccelDps2 }, mem.entryKias, sEnd, standalone && last);
          mem.rStar = sol.r;
          mem.flag = sol.flag;
          mem.sinceSolve = 0;
        }
        target = mem.rStar ?? mem.r.bankDeg;
      }
      mem.r = easeValue(mem.r.bankDeg, mem.r.rollRateDps, target, STEP_SEC, noseRateEase());
      let rc = Math.max(0, mem.r.bankDeg);
      const left = path.total - mem.s;
      if (standalone && last) rc = Math.max(0, softMin(rc, endCapDps(left / DEG), LEAD.endKneeDps));
      let lift = add3(scale3(T, rc * DEG), c);
      const cap = pathCapG(st.kias);
      let rate = rc * DEG;
      if (len3(lift) > cap - LEAD.limitKneeG) {
        rate = rateForG(T, c, softMin(len3(lift), cap, LEAD.limitKneeG));
        lift = add3(scale3(T, rate), c);
      }
      const gb = gAndBankForLift(lift, st.nose, st.pm.up, st.bank * DEG);
      mem.s = Math.min(path.total, mem.s + rate * STEP_SEC);
      const end = mem.s >= path.total - 1e-6 || (standalone && last && left < 0.3 * DEG && rc < 0.3);
      const out = { g: gb.g, bank: gb.g < 0.3 ? st.bank : gb.bankRad / DEG, u: p.u, end, done: false };
      if (!end) return out;
      mem.exitKias = st.kias;
      mem.note = exitNote(mem.entryKias, st.kias, mem.flag, null);
      if (flow) return { ...out, done: true, handover: { r: rate / DEG, rd: mem.r.rollRateDps, g: st.g } };
      mem.stage = 'exit';
      return out;
    },
  };
}

/**
 * Two wingovers (SMM 16.17 para 47), the first rolling dir (+1 left, -1 right), the second the other way. The nose path:
 * the heading turns 180° each way on a smooth curve (no turn rate at the start or end of each, so the wings start and
 * finish level), the nose rises to 45° at the quarter, crosses the horizon at the 90° point (the highest point and the
 * most bank) and falls to 45° below at three quarters; at the end of the second it comes up to the horizon on the entry
 * heading. Climbing at about 3 G (para 47, under 90% of the shaker), descending at the rate for the entry speed (TS-215).
 * flow: hand on to the barrel roll still pulling (the sequence). Never cut short (a press waits).
 */
export function wingovers(dir, { flow = false } = {}) {
  const A = LEAD.wingoverPitchDeg * DEG;
  const law = pathManoeuvre({ makePath: (h0) => wingoverPath(h0, dir, A), parts: 2, gPlan: () => LEAD.wingoverG, flow });
  return {
    key: 'wingover',
    label: `Wingovers, ${dir > 0 ? 'left' : 'right'} first`,
    interruptible: false,
    init: (st, ctx) => law.init(st, ctx),
    step(st, mem) {
      const r = law.step(st, mem);
      const leveling = mem.stage === 'exit';
      const first = r.u <= 1;
      const v = first ? r.u : r.u - 1;
      const phase = leveling ? 'level' : `${first ? 'first' : 'second'} wingover, ${v < 0.25 ? 'nose up' : v < 0.5 ? 'to the top' : v < 0.75 ? 'nose down' : 'pulling up'}`;
      // Through the wingovers #2 goes where Lead was and drifts in the cone (hold 0), back to 15° once level (Patrick 23:02Z).
      const cue = leveling ? { mode: 'pure', latDeg: LEAD.cueOffTailDeg } : { mode: overTheTopMode(v), latDeg: LEAD.cueOffTailDeg, hold: 0, over: v }; // over: how far through, for the live wingman's own breaks
      return { g: r.g, bank: r.bank, phase, cue, done: r.done, handover: r.handover, note: r.done ? mem.note : undefined, entryKias: mem.entryKias, exitKias: mem.exitKias };
    },
  };
}

/**
 * The barrel roll (SMM 14.8 paras 18-19, Fig 14.1), dir +1 left, -1 right: from the heading Lead has (the reference
 * line) and the speed he has, the nose round its circle (see the header), the back pressure 3 G easing to 2.25 G over the
 * top, the descending half at the rate for the entry speed (TS-215), then level. flow: hand on still pulling. Never cut
 * short (a press waits).
 */
export function barrelRoll(dir, { flow = false } = {}) {
  const law = pathManoeuvre({ makePath: (h0) => barrelPath(h0, dir), parts: 1, gPlan: (u) => LEAD.barrelG - (LEAD.barrelG - LEAD.barrelTopG) * Math.sin(Math.PI * u) ** 2, flow });
  return {
    key: 'barrelRoll',
    label: `Barrel roll ${dir > 0 ? 'left' : 'right'}`,
    interruptible: false,
    init: (st, ctx) => law.init(st, ctx),
    step(st, mem) {
      const r = law.step(st, mem);
      const leveling = mem.stage === 'exit';
      const u = Math.min(1, r.u);
      const phase = leveling ? 'level' : u < 0.25 ? 'pull and roll' : u < 0.5 ? 'to inverted' : u < 0.75 ? 'nose down' : 'back to the line';
      // #2 like the loop (Patrick card 19:21Z), drifting in the cone, back to 15° once level (23:02Z).
      const cue = leveling ? { mode: 'pure', latDeg: LEAD.cueOffTailDeg } : { mode: overTheTopMode(u), latDeg: LEAD.cueOffTailDeg, hold: 0, over: u };
      return { g: r.g, bank: r.bank, phase, cue, done: r.done, handover: r.handover, note: r.done ? mem.note : undefined, entryKias: mem.entryKias, exitKias: mem.exitKias };
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
 * (Patrick 01:03Z; #2 sets his spacing in it), a loop after LEAD.loopWaitSec wings level, two wingovers rolling dir
 * first, a barrel roll dir. The loop flows into the wingovers and they into the barrel roll, with no unload between them,
 * each handing the next its nose rate and G (fluid.js passes the handover to the next init as ctx.handIn); the barrel
 * roll ends level.
 */
export function sequenceParts(dir, bankDeg) {
  return [
    levelTurn(dir, bankDeg, { turnDeg: 360, label: `Level turn ${dir > 0 ? 'left' : 'right'}, ${Math.round(bankDeg)}°, 360°` }),
    loop({ waitSec: LEAD.loopWaitSec, flow: true }),
    wingovers(dir, { flow: true }),
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

/**
 * The entry from fighting wing. By default (Patrick 22:30Z, LEAD.entryTurn false) Lead flies straight and level at his
 * speed while #2 moves into the fluid picture, and the entry ends once he is in it; Lead then holds straight and level until
 * the next press. With LEAD.entryTurn, AFM7 brief p.17's entry: a 30° bank turn away from #2 while all call ready, then
 * the chosen bank and PCL MAX.
 */
export function entry(dir, bankDeg) {
  if (!LEAD.entryTurn) {
    return {
      key: 'entry',
      label: 'Entry: #2 into position, Lead straight and level',
      interruptible: false,
      init: (st) => ({ t: 0, fwKias: st.kias }),
      step(st, mem, ctx) {
        mem.t += STEP_SEC;
        const blendSec = ctx?.blendInSec ?? WING.blendInSec;
        return { g: gForClimb(st, 0), bank: 0, holdKias: mem.fwKias, phase: '#2 into position', cue: { mode: 'pure', latDeg: LEAD.cueOffTailDeg, blend: 1 }, done: mem.t > blendSec + 1 };
      },
    };
  }
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
          return { g: gForClimb(st, 0), bank: -dir * LEAD.levelBanks.gentle, holdKias: mem.fwKias, phase: '30° turn, ready calls', cue: { mode: 'pure', latDeg: LEAD.cueOffTailDeg, blend: 0 }, done: false };
        }
        mem.stage = 'turn';
        mem.turnMem = turn.init(st, ctx);
      }
      const r = turn.step(st, mem.turnMem);
      // Fig 12.20, turn away: #2 collapses into the cone by lead pursuit. The blend into the fluid picture starts here,
      // and the entry ends once he is in it (the blend time: from the close-in rate since V2.59, ctx.blendInSec, else
      // WING.blendInSec), so Lead's next manoeuvre starts from a settled picture.
      const blendSec = ctx?.blendInSec ?? WING.blendInSec;
      return { ...r, phase: `${Math.round(bankDeg)}° at MAX`, cue: { mode: 'lead', latDeg: LEAD.cueOffTailDeg, blend: 1 }, done: Math.abs(st.bank) >= bankDeg - 1 && mem.turnMem.t > blendSec + 1 };
    },
  };
}

/**
 * Terminate (SMM 16.17 paras 45-46, 48; AFM7 brief p.17): Lead recovers to level flight and flies a gentle predictable
 * turn (30°, estimate) with the power back to fighting wing's 200 KIAS while #2 goes back to his fighting wing slot on
 * the side he is on, and rolls out as soon as #2 is back there (Patrick 12 Oct 2026 04:33Z): when #2's blend back to
 * fighting wing is done (ctx.blendOutSec, the time at the close-in rate), or after 90° (estimate) if that comes first.
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
      const backSec = ctx?.blendOutSec ?? WING.blendOutSec;
      const rollOut = Math.abs(headingChangeRollingOut(-st.bank, -st.rollRate, st.V, LEAD_ROLL, -(st.rollAcc ?? 0), true));
      if (mem.t >= backSec || mem.turned >= LEAD.terminateTurnDeg * DEG - rollOut) mem.rollingOut = true;
      const bank = mem.rollingOut ? 0 : -dir * LEAD.terminateBankDeg;
      const steady = mem.rollingOut && level(st) && Math.abs(st.kias - LEAD.fwKias) < 0.5;
      mem.steady = steady ? mem.steady + STEP_SEC : 0;
      mem.t += STEP_SEC;
      return { g: gForClimb(st, 0), bank, holdKias: LEAD.fwKias, phase: mem.rollingOut ? 'rolling out' : 'gentle turn', cue: { mode: 'pure', latDeg: LEAD.cueOffTailDeg, blend: 0 }, done: mem.steady >= 3 && mem.t > backSec + 1 };
    },
  };
}
