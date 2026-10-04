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
// The barrel roll, the wingovers, the side swap and the standard sequence wait for a later piece (spec 10.3).
import { stepPointMass } from '../../../core/point-mass.js';
import { easeValue, dampedClimbG } from '../../../core/flight-math.js';
import { t6aExcessFn, tasToIasKt, shakerG } from '../../../core/t6-performance.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { ROLL, STEP_SEC, headingChangeRollingOut } from './flight.js';
import { add3, sub3, scale3, len3, cross3, unit3, perp3 } from './attitude.js';
import { WING } from './fluid-wing.js';

const DEG = Math.PI / 180;
const Z = Object.freeze({ x: 0, y: 0, z: 1 });

/** The numbers Lead flies. Every one has its source; "estimate" where no manual or ruling gives it. */
export const LEAD = Object.freeze({
  gOnset: Object.freeze({ maxRateDps: 4, maxAccelDps2: 16 }), // G per second and per second², design 5.3 (estimate)
  levelBanks: Object.freeze({ gentle: 30, medium: 60, steep: 70.5 }), // AFM7 p.17 (30, 60/2); SMM 16.18 para 50 (70/3, estimate as "steep")
  entryHoldSec: 5, // the entry's 30° bank stage while "all call ready" (AFM7 p.17): 5 s is an estimate
  terminateBankDeg: 30, // "gentle" (AFM7 p.17), "predictable" (SMM 16.17 para 46): 30° is an estimate
  terminateTurnDeg: 90, // how far the terminate turn goes before rolling out: an estimate
  fwKias: 200, // fighting wing speed (TS-53; SMM 12.23 para 53)
  slowKtps: 1.5, // slowing with the power back: the Turn Sim's 1.5 kt/s estimate (TS-53)
  earlyCueSec: 4, // how long a new turn's lag (into #2) or lead (away from #2) lasts before pure: an estimate
  climbDeg: 15, // the climb or descent angle (design 5.1, an estimate)
  climbChangeFt: 2000, // how far a climb or descent goes before levelling off (an estimate)
  levelOffFt: 800, // the climb eases onto the new height over its last 800 ft (an estimate)
  pitchCueDps: 0.5, // #2 reads Lead's nose as rising or falling past 0.5°/s of pitch rate (an estimate)
  climbPitchDps: 3, // how fast Lead raises or lowers the nose into and out of the climb or descent (an estimate)
  minPushG: 0.5, // Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a); 0.5 G at the push over is an estimate
  loopEntryKias: 230, // SMM Table 7.1, 7.5 para 11, Fig 7.2 (entry and exit)
  loopEntryBandKias: 5, // Lead starts the pull within 5 kt of 230 (an estimate; SMM 7.12 para 28b allows 200-250)
  loopG: 3.5, // EFIG p.171 "3 1/2 G", inside SMM 7.5 para 11 and Table 7.1's 3-4 G
  loopDownMaxG: 4, // coming down Lead may pull up to 4 G, the top of the SMM's 3-4 G (Table 7.1), to "adjust back pressure to achieve 230 KIAS" (SMM 7.5 para 12); at the Orders' 4 G, not over it
  loopTopMinG: 0.5, // "slight positive G" over the top (SMM 7.5 para 11): 0.5 is an estimate
  loopVerticalDeg: 80, // "until the aircraft approaches the vertical" (SMM 7.5 para 11): 80° is an estimate
  loopPullOutDeg: 330, // where Lead stops holding the pitch rate and pulls out to level (an estimate)
  setupMaxPitchDeg: 10, // the speed set-up's nose down or up before the loop (an estimate)
  setupLimitSec: 60, // a guard only: after a minute of set-up the loop starts at whatever speed (an estimate)
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

/** Excess thrust that holds an indicated speed: what it takes, up to full power, and slowing at 1.5 kt/s at most (estimate). */
function holdSpeedExcess(kiasTarget) {
  return (ktas, altFt, g) => {
    const kias = tasToIasKt(ktas, altFt);
    const wantKtps = Math.max(-LEAD.slowKtps, Math.min(3, 0.2 * (kiasTarget - kias)));
    const wantFtps2 = wantKtps * KT_TO_FTPS * (ktas / Math.max(kias, 1));
    return Math.min(wantFtps2 / G_FTPS2, t6aExcessFn(ktas, altFt, g));
  };
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
    const r = easeValue(s.bank, s.rollRate, target, half, ROLL);
    const pm = stepPointMass(s.pm, { g: g.bankDeg, bankRad: r.bankDeg * DEG }, half, excess);
    s = finish({ pm, bank: r.bankDeg, rollRate: r.rollRateDps, g: g.bankDeg, gRate: g.rollRateDps, blockFt: s.blockFt });
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
      return { g: gForClimb(st, 0), bank, phase: mem.rollingOut ? 'rolling out' : Math.abs(st.bank) < bankDeg - 2 ? 'rolling in' : 'turning', cue: { mode, latDeg: 15 }, done }; // hold 15° off Lead's current tail (Patrick 22:28Z)
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
 * 10°, an estimate), until within 5 kt (estimate) of the entry speed, level and at 1 G. Returns the ask, or null when
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
  const phase = Math.abs(st.bank) > 1 ? 'wings level' : dKias < -LEAD.loopEntryBandKias ? 'nose low for 230' : dKias > LEAD.loopEntryBandKias ? 'nose high for 230' : 'steady for the pull';
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
      // and the entry ends once he is in it (WING.blendInSec), so Lead's next manoeuvre starts from a settled picture.
      return { ...r, phase: `${Math.round(bankDeg)}° at MAX`, cue: { mode: 'lead', latDeg: 15, blend: 1 }, done: Math.abs(st.bank) >= bankDeg - 1 && mem.turnMem.t > WING.blendInSec + 1 };
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
    step(st, mem) {
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
      return { g: gForClimb(st, 0), bank, holdKias: LEAD.fwKias, phase: mem.rollingOut ? 'rolling out' : 'gentle turn', cue: { mode: 'pure', latDeg: 15, blend: 0 }, done: mem.steady >= 3 && mem.t > WING.blendOutSec + 1 };
    },
  };
}
