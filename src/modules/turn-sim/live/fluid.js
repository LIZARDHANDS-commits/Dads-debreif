// Fluid manoeuvring for the 2-ship, the planned wingman (spec section 10.3, TS-57). One session runs from the entry
// (from fighting wing only: Patrick 19:03Z) to the end of Terminate, when the pair is back in fighting wing and the
// formation flies on as before.
//
// Lead's path is planned ahead (fluid-lead.js) about 20 s at a time and replayed; a press of a Lead button re-plans it
// from where he is (a turn or wings level is cut short). The entry is flown to its end first and a press during it waits
// its turn (as TS-45); Terminate can't be cut short. #2's line is worked out from Lead's path (fluid-wing.js), so it is
// planned too: the dashed path ahead is the path flown.
import { STEP_SEC } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { aspectAngle3dDeg, headingCrossAngle3dDeg } from '../../../core/angles.js';
import { shakerG } from '../../../core/t6-performance.js';
import { FTPS_TO_KT, G_FTPS2 } from '../../../core/units.js';
import { applyPose } from './kinematic.js';
import { len3, sub3, poseOf3d, rollRateDps, unit3, dot3 } from './attitude.js';
import { LEAD, FLUID_MOVES, leadStateOf, stepLead, levelTurn, wingsLevel, hold, reversal, entry, terminate } from './fluid-lead.js';
import { startWing, nextWing, rawWingPoint, smoothPoint, wingPose, levelUpOf, WING } from './fluid-wing.js';

const dt = STEP_SEC;
const DEG = Math.PI / 180;
/** Lead's path is kept planned this far ahead (it feeds #2's line and the dashed preview). */
const AHEAD_STEPS = Math.round(20 / dt);
/** Lead's path before the press is extended back this far (straight, as he was), so #2 can look back along it. */
const SEED_STEPS = Math.round(WING.maxBehindSec / dt) + 20;
/** A guard on how far ahead the planner looks for the end of a manoeuvre a press must wait for. */
const WAIT_LIMIT_STEPS = Math.round(240 / dt);

/** The fluid manoeuvring numbers (Patrick's picks of 19:20Z, fluid-conflicts.md, unless said). */
export const FLUID = Object.freeze({
  rangeFt: Object.freeze({ min: 500, max: 1000, def: 600, goodMax: 750 }), // SMM 16.17 para 42; AFM7 p.17, AFM8 p.19; Patrick row 3
  coneHalfDeg: 30, // 60° in all, 30° either side of Lead's tail (Patrick row 2)
  bubbleFt: 500, // SMM 16.17 para 44c; Gen Book p.11
  wingGLimit: 5, // SMM 16.17 para 44a; Gen Book p.11 (flagged, never a wall)
  leadGLimit: 4, // 2 CFFTS Orders B2 ch 8 para 1a; Gen Book p.11 (flagged)
  hardDeckMslFt: 6000, // 3,000 ft AGL, about 6,000 ft MSL in the Moose Jaw areas (SMM 14.6 para 16); FM minimum (Orders B2 ch 8 para 1f; Gen Book p.11)
  aspectHcaFlagDeg: 90, // SMM 16.17 para 44b
  lowLosDps: 5, // "low line of sight": an estimate (design 5.5)
});

/** A typed distance: { ok, value, reason }. 500-1,000 ft (SMM 16.17 para 42); outside it is refused, the sim keeps the old one. */
export function checkFluidRange(ft) {
  const n = Number(ft);
  if (!Number.isFinite(n) || n < FLUID.rangeFt.min || n > FLUID.rangeFt.max) return { ok: false, reason: `Fluid manoeuvring distance is ${FLUID.rangeFt.min}-${FLUID.rangeFt.max.toLocaleString('en-CA')} ft (SMM 16.17 para 42).` };
  return { ok: true, value: n };
}

/** The level turn banks the Lead buttons offer (design 5.1). */
export const LEVEL_BANKS = Object.freeze([
  { value: 'gentle', label: 'Gentle 30°', deg: LEAD.levelBanks.gentle },
  { value: 'medium', label: '60/2', deg: LEAD.levelBanks.medium },
  { value: 'steep', label: 'Steep 70/3', deg: LEAD.levelBanks.steep },
]);
export const bankDegFor = (value) => (LEVEL_BANKS.find((b) => b.value === value) ?? LEVEL_BANKS[1]).deg;

/** The words for #2's pursuit, for the tags and the card. */
export const PURSUIT_WORDS = Object.freeze({ lag: 'LAG', pure: 'PURE', lead: 'LEAD' });

/**
 * A new session from fighting wing. lead, wing: the live aircraft (flight.js) at the press; t0 the formation time.
 * opts: { blockFt, rangeFt, bank ('gentle' | 'medium' | 'steep') }. Returns the session.
 */
export function createFluidSession(lead, wing, t0, opts = {}) {
  const blockFt = opts.blockFt ?? 8000;
  let rangeFt = opts.rangeFt ?? FLUID.rangeFt.def;
  let bankValue = opts.bank ?? 'medium';
  const rel = relativeTo(lead, wing);
  const side = rel.left >= 0 ? 1 : -1;
  const slot = { fwd: rel.fwd, left: rel.left, alt: (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0) };

  const entries = new Map(); // k -> Lead's entry
  const raws = new Map(); // k -> #2's raw point
  let manId = 0;
  let kNow = 0;
  let kMin = -SEED_STEPS;
  let kMax = 0;
  // #2 at the press, as he is: wings at his bank, rolling at his rate.
  const wb = (wing.bankDeg ?? 0) * DEG;
  let wingState = { up: { x: -Math.sin(wb) * Math.sin(wing.headingRad), y: Math.sin(wb) * Math.cos(wing.headingRad), z: Math.cos(wb) }, rollDps: wing.rollRateDps ?? 0 };
  let queued = null; // { label, key }
  let ended = null; // the step Terminate finished on

  // ---- Lead's entries ----
  const st0 = leadStateOf(lead, blockFt);
  const wing0 = startWing({ t: t0, side, rangeFt, slot });
  const man0 = { id: manId++, key: 'entry', label: 'Entry to fluid manoeuvring' };
  const entryCtl = entry(-side, bankDegFor(bankValue)); // the entry turn away from #2 (Fig 12.20, turn away: he collapses into the cone)
  const toEntry = (k, st, w, extra) => ({
    k, t: t0 + k * dt, st, wing: w,
    pos: { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt }, vel: st.vel, accPerp: st.accPerp, levelUp: st.pm.up,
    ...extra,
  });
  entries.set(0, toEntry(0, st0, wing0, { ctl: entryCtl, mem: entryCtl.init(st0, { wingSide: side }), queue: [], man: man0, phase: 'fighting wing', cue: { mode: 'pure' } }));
  // Lead's path before the press, straight on as he was (only #2's look back reads it, while he is still on his slot).
  for (let k = -1; k >= kMin; k--) {
    const p = sub3(entries.get(0).pos, { x: st0.vel.x * -k * dt, y: st0.vel.y * -k * dt, z: st0.vel.z * -k * dt });
    entries.set(k, { ...entries.get(0), k, t: t0 + k * dt, pos: p, accPerp: { x: 0, y: 0, z: 0 }, levelUp: levelUpOf(st0.nose) });
  }
  const E = (k) => {
    while (k > kMax) generate();
    return entries.get(Math.max(kMin, k));
  };

  /** One more step of Lead's path, from the last one. */
  function generate() {
    const e = entries.get(kMax);
    const mem = structuredClone(e.mem);
    const r = e.ctl.step(e.st, mem, { wingSide: e.wing.side });
    const st = stepLead(e.st, r);
    const t = t0 + (kMax + 1) * dt;
    const w = nextWing(e.wing, r.cue, t, rangeFt);
    let ctl = e.ctl;
    let next = mem;
    let queue = e.queue;
    let man = e.man;
    let end = false;
    if (r.done) {
      if (queue.length) {
        ctl = queue[0];
        queue = queue.slice(1);
      } else if (ctl.key === 'terminate' || ctl.key === 'steady') {
        end = ctl.key === 'terminate';
        ctl = steady();
        man = { id: manId++, key: 'steady', label: 'Fighting wing' };
      } else {
        ctl = hold();
        man = { id: manId++, key: 'hold', label: 'Straight and level' };
      }
      next = ctl.init(st, { wingSide: w.side });
    }
    kMax += 1;
    entries.set(kMax, toEntry(kMax, st, w, { ctl, mem: next, queue, man, phase: r.phase, cue: r.cue, end }));
  }

  /** Re-plan from step j: everything Lead flies after it is worked out again, starting with the controller ctl. */
  function replanFrom(j, ctl, queue, man) {
    for (let k = j + 1; k <= kMax; k++) entries.delete(k);
    for (const k of [...raws.keys()]) if (k > j) raws.delete(k);
    kMax = j;
    const e = entries.get(j);
    entries.set(j, { ...e, ctl, mem: ctl.init(e.st, { wingSide: e.wing.side }), queue, man });
  }

  const R = (k) => {
    if (!raws.has(k)) raws.set(k, rawWingPoint(E, k, kMin));
    return raws.get(k);
  };
  const S = (k) => smoothPoint(R, k);

  /** The pose for Lead at step k (roll rate from the lift's turn either side). */
  function leadPose(k) {
    const e = E(k);
    const a = E(k - 1).st;
    const c = E(k + 1).st;
    const roll = rollRateDps(a.nose, a.bodyUp, c.nose, c.bodyUp, 2 * dt);
    return poseOf3d({ x: e.pos.x, y: e.pos.y, altAbove: e.pos.z, vel: e.st.vel, up: e.st.bodyUp, kias: e.st.kias, g: e.st.g, rollDps: roll });
  }

  // ---- presses ----
  const label = (key, dir) => `${FLUID_MOVES[key].label}${FLUID_MOVES[key].sided ? ` ${dir > 0 ? 'left' : 'right'}` : ''}`;

  /** The controllers a press starts, or { reason } when it can't be flown now. @returns {any} */
  function controllersFor(key, dir, at) {
    const bank = bankDegFor(bankValue);
    const st = at.st;
    const tsBank = -wrapDeg(st.bank);
    switch (key) {
      case 'levelTurn': return [levelTurn(dir, bank)];
      case 'wingsLevel': return [wingsLevel()];
      case 'reversal':
        if (Math.abs(tsBank) < 10) return { reason: 'Reversal needs a turn to reverse: press a level turn first.' };
        return [reversal(tsBank, Math.max(bank, Math.abs(tsBank) > 5 ? Math.min(Math.abs(tsBank), LEAD.levelBanks.steep) : bank))];
      case 'terminate': {
        // A predictable turn: on the way Lead is already turning, or away from #2 if wings level.
        const way = Math.abs(tsBank) > 5 ? Math.sign(tsBank) : -at.wing.side;
        return [terminate(way)];
      }
      default: throw new Error(`No fluid manoeuvre called ${key}`);
    }
  }

  return {
    /** For checks only: #2's raw point and Lead's planned step at step k. */
    debug: { R: (k) => R(k), E: (k) => E(k) },
    /** The step the session is on now (0 at the press). */
    get k() { return kNow; },
    get done() { return ended !== null && kNow >= ended; },
    get queued() { return queued; },
    /** Settings that may change while flying: the distance (eased in, WING.rangeSec) and the level turn bank (next press). */
    setRange(ft) { rangeFt = ft; },
    setBank(value) { bankValue = value; },
    /**
     * A Lead button. dir +1 left, -1 right for the sided ones. Returns 'started', 'queued' or { refused: reason }.
     * Nothing can be pressed while the entry is flown or after Terminate.
     */
    press(key, dir = 1) {
      const now = E(kNow);
      if (ended !== null || now.man.key === 'terminate' || entries.get(kMax).man.key === 'terminate') return { refused: 'Terminate is being flown; fluid manoeuvring is ending.' };
      const ctls = controllersFor(key, dir, now);
      if (ctls.reason) return { refused: ctls.reason };
      const man = { id: manId++, key, label: label(key, dir) };
      const [first, ...rest] = ctls;
      const curMan = now.man;
      const interruptible = curMan.key === 'hold' || (FLUID_MOVES[curMan.key]?.interruptible ?? false);
      if (interruptible && now.ctl.interruptible !== false) {
        replanFrom(kNow, first, rest, man);
        queued = null;
        return 'started';
      }
      // Wait for the manoeuvre being flown to finish (its last step), then start this one there.
      let j = kNow;
      while (j - kNow < WAIT_LIMIT_STEPS && E(j + 1).man.id === curMan.id) j++;
      replanFrom(j, first, rest, man);
      queued = { key, label: man.label, startK: j };
      return 'queued';
    },
    /** Flies one step: applies the planned poses to the two aircraft. */
    step(lead, wing) {
      kNow += 1;
      while (kMax < kNow + AHEAD_STEPS) generate();
      if (queued && kNow > queued.startK) queued = null;
      const lp = leadPose(kNow);
      const w = wingPose(S, kNow, wingState, blockFt);
      wingState = w.state;
      const e = E(kNow);
      if (e.end && ended === null) ended = kNow;
      if (this.done) {
        // Back to fighting wing: both straight and level, #2 exactly parallel at Lead's speed, for flight.js to fly on.
        Object.assign(lp, { bank: 0, roll: 0, climb: 0, g: 1 });
        Object.assign(w.pose, { h: lp.h, bank: 0, roll: 0, climb: 0, g: 1, kias: lp.kias, tas: lp.tas, pitch: lp.pitch });
      }
      applyPose(lead, lp);
      applyPose(wing, w.pose);
      lead.turning = !this.done;
      wing.turning = !this.done;
    },
    /** What is flown now: { key, label, phase, manId, wingCue ('lag' | 'pure' | 'lead' | 'entry' | 'back to fighting wing'), behindSec }. */
    now() {
      const e = E(kNow);
      const r = R(kNow);
      return {
        key: e.man.key, label: e.man.label, phase: e.phase, manId: e.man.id,
        wingCue: r.blend < 0.5 ? (e.man.key === 'terminate' || e.man.key === 'steady' ? 'back to fighting wing' : 'entry') : r.cue,
        behindSec: r.behindSec,
      };
    },
    /** The paths still to fly, for the dashed preview: the next 15 s of both (what is planned so far; a press re-plans it). */
    planned() {
      const pts = { 1: [], 2: [] };
      const until = Math.min(kMax - WING.smoothSteps, kNow + Math.round(15 / dt));
      for (let k = kNow; k <= until; k += 5) {
        const x = entries.get(k);
        pts[1].push([x.t, x.pos.x, x.pos.y, x.pos.z]);
        const p = R(k).p;
        pts[2].push([x.t, p.x, p.y, p.z]);
      }
      return pts;
    },
    /** The bounds of what is being flown (the fit-all camera keeps the fluid picture in view, spec section 10.3). */
    pictureBounds() {
      const p = this.planned();
      const xs = [...p[1], ...p[2]].map((q) => q[1]);
      const ys = [...p[1], ...p[2]].map((q) => q[2]);
      return xs.length ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } : null;
    },
  };
}

/** Straight and level at fighting wing's speed: what Lead flies after Terminate, while the formation hands back. */
function steady() {
  return {
    key: 'steady', label: 'Fighting wing', interruptible: true,
    init: () => ({}),
    step: (st) => ({ g: Math.max(0, Math.cos(st.gammaRad) - (st.V / G_FTPS2) * 0.5 * st.gammaRad), bank: 0, holdKias: LEAD.fwKias, phase: 'fighting wing', cue: { mode: 'pure', latDeg: 15, blend: 0 }, done: false }),
  };
}
const wrapDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;

/**
 * The readouts for the card and the tags (design 5.5), from the two aircraft as they are: range (straight line), aspect
 * (0 at Lead's tail, SMM 16.16 para 40b; Patrick row 10), HCA (para 40c), closure, line of sight rate, the cone state and
 * the flags. prev: the aircraft a step ago ({ lead, wing } with xFt, yFt, altAboveFt) for the rates, or null.
 */
export function fluidReadouts(lead, wing, prev, blockFt) {
  const p = (a) => ({ x: a.xFt, y: a.yFt, z: a.altAboveFt ?? 0 });
  const vel = (a) => {
    const horiz = Math.sqrt(Math.max(0, a.tasFtps ** 2 - (a.climbFtps ?? 0) ** 2));
    return { x: horiz * Math.cos(a.headingRad), y: horiz * Math.sin(a.headingRad), z: a.climbFtps ?? 0 };
  };
  const pl = p(lead);
  const pw = p(wing);
  const rangeFt = len3(sub3(pl, pw));
  const vl = vel(lead);
  const vw = vel(wing);
  const aspectDeg = aspectAngle3dDeg(pw, pl, vl) ?? 0;
  const hcaDeg = headingCrossAngle3dDeg(vl, vw) ?? 0;
  let closureKt = 0;
  let losDps = 0;
  if (prev) {
    const r0 = len3(sub3(p(prev.lead), p(prev.wing)));
    closureKt = ((r0 - rangeFt) / STEP_SEC) * FTPS_TO_KT;
    const a = unit3(sub3(p(prev.lead), p(prev.wing)));
    const b = unit3(sub3(pl, pw));
    losDps = Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) / DEG / STEP_SEC;
  }
  const state = rangeFt < FLUID.bubbleFt ? 'TIGHT' : rangeFt > FLUID.rangeFt.max ? 'STRETCHED' : aspectDeg > FLUID.coneHalfDeg ? 'OUT OF CONE' : 'IN POSITION';
  const flags = [];
  if (rangeFt < FLUID.bubbleFt) flags.push(`Inside the 500 ft bubble (${Math.round(rangeFt)} ft; SMM 16.17 para 44c).`);
  if (wing.g > FLUID.wingGLimit) flags.push(`#2 is pulling ${wing.g.toFixed(1)} G; the limit is 5 G (SMM 16.17 para 44a).`);
  if (lead.g > FLUID.leadGLimit) flags.push(`Lead is pulling ${lead.g.toFixed(1)} G; the limit is 4 G (Orders B2 ch 8).`);
  if (aspectDeg > FLUID.aspectHcaFlagDeg && hcaDeg > FLUID.aspectHcaFlagDeg && losDps < FLUID.lowLosDps) flags.push('More than 90° of aspect with more than 90° of HCA and low line of sight (SMM 16.17 para 44b).');
  for (const [a, name] of [[lead, 'Lead'], [wing, '#2']]) {
    if (blockFt + (a.altAboveFt ?? 0) < FLUID.hardDeckMslFt) flags.push(`${name} is below 3,000 ft AGL, the fluid manoeuvring minimum (Orders B2 ch 8 para 1f; Gen Book p.11).`);
    if (a.g > shakerG(a.kias) - 0.01) flags.push(`${name} is at the stick shaker.`);
  }
  return { rangeFt, aspectDeg, hcaDeg, closureKt, losDps, state, nearEnd: rangeFt <= FLUID.rangeFt.goodMax, flags };
}
