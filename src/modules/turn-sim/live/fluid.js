// Fluid manoeuvring for the 2-ship, the planned wingman (spec section 10.3, TS-57). One session runs from the entry
// (from fighting wing only: Patrick 19:03Z) to the end of Terminate, when the pair is back in fighting wing and the
// formation flies on as before.
//
// Lead's path is planned ahead (fluid-lead.js) about 20 s at a time and replayed; a press of a Lead button re-plans it
// from where he is (a turn or wings level is cut short). The entry is flown to its end first and a press during it waits
// its turn (as TS-45); Terminate can't be cut short. #2 is his own aircraft (fluid-wing-live.js, TS-194): nothing of his is
// planned ahead, so the dashed path ahead is Lead's alone.
import { STEP_SEC } from './flight.js';
import { FW_BAND } from './slots.js';
import { relativeTo } from './manoeuvres.js';
import { aspectAngle3dDeg, headingCrossAngle3dDeg, DEG } from '../../../core/angles.js';
import { shakerG } from '../../../core/t6-performance.js';
import { FTPS_TO_KT, G_FTPS2 } from '../../../core/units.js';
import { applyPose } from './kinematic.js';
import { WING, HOLD, closureNow, FLUID, LEAD_POWER, LEAD_ROLL } from './tuning.js';
import { len3, sub3, poseOf3d, rollRateDps, unit3, dot3 } from './attitude.js';
import { LEAD, FLUID_MOVES, stepLead, leadThrottle, levelTurn, wingsLevel, hold, reversal, entry, terminate, climbOrDescend, loop, wingovers, barrelRoll, sequenceParts } from './fluid-lead.js';
import { startLiveWing, stepLiveWing } from './fluid-wing-live.js';
import { leadPointMassOf, adoptLeadState } from './lead-pilot.js';

export { FLUID }; // its home is wing-moves.js (the tuning sheet, TS-214)

const dt = STEP_SEC;
/** Lead's path is kept planned this far ahead (it feeds the swap cue's look-back and the dashed preview). */
const AHEAD_STEPS = Math.round(20 / dt);
/** A guard on how far ahead the planner looks for the end of a manoeuvre a press must wait for. */
const WAIT_LIMIT_STEPS = Math.round(240 / dt);


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
export const bankDegFor = (value) => (typeof value === 'number' ? value : (LEVEL_BANKS.find((b) => b.value === value) ?? LEVEL_BANKS[1]).deg);

/** The words for #2's pursuit, for the tags and the card. */
export const PURSUIT_WORDS = Object.freeze({ lag: 'LAG', pure: 'PURE', lead: 'LEAD', swap: 'SWAPPING' });

/**
 * A new session from fighting wing. lead, wing: the live aircraft (flight.js) at the press; t0 the formation time.
 * opts: { blockFt, rangeFt, bank ('gentle' | 'medium' | 'steep') }. #2 is the live wingman (TS-194, fluid-wing-live.js;
 * the only #2 since the planned wingman was retired, TS-199). Returns the session.
 */
export function createFluidSession(lead, wing, t0, opts = {}) {
  const blockFt = opts.blockFt ?? 8000;
  let rangeFt = opts.rangeFt ?? FLUID.rangeFt.def;
  let bankValue = opts.bank ?? 'medium';
  const rel = relativeTo(lead, wing);
  const side = rel.left >= 0 ? 1 : -1;
  const slot = { fwd: rel.fwd, left: rel.left, alt: (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0) };

  const entries = new Map(); // k -> Lead's entry
  let manId = 0;
  let kNow = 0;
  let kMax = 0;
  let queued = null; // { label, key }
  let ended = null; // the step Terminate finished on
  let endSeen = null; // the step Terminate's last step was flown on (the session ends once #2 has caught up too)
  // #2 (TS-194): his own aircraft on the shared point mass, flown by the pilot law in fluid-wing-live.js, his side swaps
  // his own call (TS-199). Lead's planner reads his side as last flown (wingSide: the entry turns away from him, Terminate's
  // gentle turn too).
  let liveWs = startLiveWing(wing, blockFt, { side, slot });
  let liveNow = null; // the last live step's result: his cue and side for now()
  const wingSide = () => liveNow?.side ?? side;
  /**
   * The entry's and terminate's blend times (V2.59; Patrick 5 Oct 04:59Z: "move quickly into fluid maneouvering or into
   * and out of fighting wing"): the distance from the fighting wing slot to the cone place at the set range (15° off
   * Lead's tail, on #2's side) at the close-in rate (tuning.js closureNow, the Rates choice) as the average closure, never
   * under WING.blendMinSec (estimate).
   */
  const blendSecs = () => {
    const d = Math.hypot(slot.fwd + rangeFt * Math.cos(WING.latDeg * DEG), Math.abs(slot.left) - rangeFt * Math.sin(WING.latDeg * DEG), slot.alt);
    const sec = Math.max(WING.blendMinSec, d / Math.max(closureNow().ftps, 1));
    return { inSec: sec, outSec: sec };
  };

  // ---- Lead's entries ----
  // Lead's point mass carried straight in from his programme when he flew it on the point mass (TS-225), else worked out
  // from the aircraft (leadStateOf).
  const st0 = leadPointMassOf(lead, blockFt);
  const man0 = { id: manId++, key: 'entry', label: 'Entry to fluid manoeuvring' };
  const entryPlanned = entry(-side, bankDegFor(bankValue)); // the entry turn away from #2 (Fig 12.20, turn away: he collapses into the cone)
  // Both go to MAX as soon as fluid manoeuvring starts (Patrick 11 Oct 2026 22:33Z): Lead's entry holds no speed, and #2
  // flies into position on geometry alone.
  const entryCtl = { ...entryPlanned, step: (st, mem, ctx) => ({ ...entryPlanned.step(st, mem, ctx), holdKias: undefined }) };
  const toEntry = (k, st, extra) => ({
    k, t: t0 + k * dt, st,
    pos: { x: st.pm.x, y: st.pm.y, z: st.pm.z - blockFt }, vel: st.vel, accPerp: st.accPerp, levelUp: st.pm.up,
    ...extra,
  });
  entries.set(0, toEntry(0, st0, { ctl: entryCtl, mem: entryCtl.init(st0, { wingSide: side }), queue: [], man: man0, phase: 'fighting wing', cue: { mode: 'pure' } }));
  const E = (k) => {
    while (k > kMax) generate();
    return entries.get(Math.max(0, k));
  };

  /** One more step of Lead's path, from the last one. */
  function generate() {
    const e = entries.get(kMax);
    const mem = structuredClone(e.mem);
    const blend = blendSecs();
    const r = e.ctl.step(e.st, mem, { wingSide: wingSide(), blendInSec: blend.inSec, blendOutSec: blend.outSec });
    // Lead holding a speed (Terminate, fighting wing after it) keeps 20-80% torque (TS-216); the manoeuvres stay MAX.
    // Lead rolls at his technique rate (TS-222) except in the nose-path manoeuvres, which roll as their path asks; his
    // roll and G are built over their onsets with the stop planned (lead: true, TS-223).
    const roll = e.ctl.key === 'wingover' || e.ctl.key === 'barrelRoll' ? null : LEAD_ROLL;
    const st = stepLead(e.st, { ...r, lead: true, ...(roll ? { roll } : {}), ...(r.holdKias ? { torqueBand: LEAD_POWER } : {}) });
    let ctl = e.ctl;
    let next = mem;
    let queue = e.queue;
    let man = e.man;
    let end = false;
    if (r.done) {
      if (queue.length) {
        ctl = queue[0];
        queue = queue.slice(1);
        // The next part of the standard sequence: its own name on the card, in the same group (a press waits for all).
        if (man.group !== undefined) man = { id: manId++, key: ctl.key, label: `${FLUID_MOVES.sequence.label}: ${ctl.label}`, group: man.group };
      } else if (ctl.key === 'terminate' || ctl.key === 'steady') {
        end = ctl.key === 'terminate';
        ctl = steady();
        man = { id: manId++, key: 'steady', label: 'Fighting wing' };
      } else {
        ctl = hold();
        man = { id: manId++, key: 'hold', label: 'Straight and level' };
      }
      // A flowing join (the sequence's loop into the wingovers, the wingovers into the barrel roll) hands the next part
      // its nose rate and G (TS-215).
      next = ctl.init(st, { wingSide: wingSide(), handIn: r.handover ?? null });
    }
    // Entry and exit speeds of a manoeuvre that has them (the loop): the step and KIAS where it starts and ends.
    if (r.entryKias !== undefined && e.man.entryK === undefined) Object.assign(e.man, { entryKias: r.entryKias, entryK: kMax + 1 });
    if (r.exitKias !== undefined && e.man.exitK === undefined) Object.assign(e.man, { exitKias: r.exitKias, exitK: kMax + 1 });
    if (r.note && e.man.note === undefined) Object.assign(e.man, { note: r.note, noteK: kMax + 1 }); // an exit off its entry speed, a skipped loop
    const lastMan = r.done ? e.man : e.lastMan;
    kMax += 1;
    entries.set(kMax, toEntry(kMax, st, { ctl, mem: next, queue, man, phase: r.phase, cue: r.cue, end, askBank: r.bank, lastMan, holdKias: r.holdKias ?? null }));
  }

  /** Re-plan from step j: everything Lead flies after it is worked out again, starting with the controller ctl. */
  function replanFrom(j, ctl, queue, man) {
    for (let k = j + 1; k <= kMax; k++) entries.delete(k);
    kMax = j;
    const e = entries.get(j);
    entries.set(j, { ...e, ctl, mem: ctl.init(e.st, { wingSide: wingSide() }), queue, man });
  }


  /** The pose for Lead at step k (roll rate from the lift's turn either side). */
  function leadPose(k) {
    const e = E(k);
    const a = E(k - 1).st;
    const c = E(k + 1).st;
    const roll = rollRateDps(a.nose, a.bodyUp, c.nose, c.bodyUp, 2 * dt);
    const pose = poseOf3d({ x: e.pos.x, y: e.pos.y, altAbove: e.pos.z, vel: e.st.vel, up: e.st.bodyUp, kias: e.st.kias, g: e.st.g, rollDps: roll });
    // His power for the tag (power.js): PCL MAX, or the throttle that holds a set speed; none before the first planned step.
    return { ...pose, pwr: e.holdKias === undefined ? null : leadThrottle(e.st, e.holdKias) };
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
      // A pitch change only: the bank Lead is asking for now is kept (point-mass convention).
      case 'climb': return [climbOrDescend(1, at.askBank ?? st.bank)];
      case 'descend': return [climbOrDescend(-1, at.askBank ?? st.bank)];
      // Under 200 KIAS Lead refuses the loop (TS-221); full power, so he pulls at whatever speed he has above it.
      case 'loop':
        if (st.kias < LEAD.loopMinKias) return { reason: `Loop: Lead has ${Math.round(st.kias)} KIAS, under the ${LEAD.loopMinKias} KIAS minimum (TS-221).` };
        return [loop()];
      // The roll's way is kept on the controller for the live wingman (fluid-wing-live.js), who keeps to its outside.
      case 'wingover': return [{ ...wingovers(dir), dir }];
      case 'barrelRoll': return [{ ...barrelRoll(dir), dir }];
      case 'sequence': return sequenceParts(dir, bank).map((c) => ({ ...c, dir }));
      case 'reversal':
        if (Math.abs(tsBank) < 10) return { reason: 'Reversal needs a turn to reverse: press a level turn first.' };
        return [reversal(tsBank, Math.max(bank, Math.abs(tsBank) > 5 ? Math.min(Math.abs(tsBank), LEAD.levelBanks.steep) : bank))];
      case 'terminate': {
        // A predictable turn: on the way Lead is already turning, or away from #2 if wings level (his own side: he may have
        // come out of the last manoeuvre on the other side, fluid-wing-live.js).
        const way = Math.abs(tsBank) > 5 ? Math.sign(tsBank) : -wingSide();
        return [terminate(way)];
      }
      default: throw new Error(`No fluid manoeuvre called ${key}`);
    }
  }

  return {
    /** For checks only: Lead's planned step at step k. */
    debug: { E: (k) => E(k), ws: () => liveWs },
    /** The step the session is on now (0 at the press). */
    get k() { return kNow; },
    get done() { return ended !== null && kNow >= ended; },
    get queued() { return queued; },
    /** The distance set (ft, straight line). */
    get rangeFt() { return rangeFt; },
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
      const curMan = now.man;
      const interruptible = (curMan.key === 'hold' || (FLUID_MOVES[curMan.key]?.interruptible ?? false)) && now.ctl.interruptible !== false && curMan.group === undefined;
      // Started now, or once the manoeuvre being flown has finished (its last step); the controllers are worked out from
      // where Lead will be then.
      let j = kNow;
      const group = (m) => m.group ?? m.id;
      if (!interruptible) while (j - kNow < WAIT_LIMIT_STEPS && group(E(j + 1).man) === group(curMan)) j++;
      const ctls = controllersFor(key, dir, E(j));
      if (ctls.reason) return { refused: ctls.reason };
      const [first, ...rest] = ctls;
      const id = manId++;
      // The standard sequence is flown as its parts, each named on the card, one group (SMM 16.17 para 42).
      const man = key === 'sequence' ? { id, key: first.key, label: `${FLUID_MOVES.sequence.label}: ${first.label}`, group: id } : { id, key, label: label(key, dir) };
      replanFrom(j, first, rest, man);
      if (interruptible) {
        queued = null;
        return 'started';
      }
      queued = { key, label: key === 'sequence' ? label(key, dir) : man.label, startK: j };
      return 'queued';
    },
    /** Flies one step: Lead's planned pose, and one step of #2's own aircraft. */
    step(lead, wing) {
      kNow += 1;
      while (kMax < kNow + AHEAD_STEPS) generate();
      if (queued && kNow > queued.startK) queued = null;
      const lp = leadPose(kNow);
      // #2 reads Lead as he is at the start of the step and flies one step of his own aircraft (fluid-wing-live.js):
      // pure pursuit of Lead with lead and lag by the cues, his side and his swaps his own.
      const e = E(kNow);
      const kg = kNow - 1;
      liveNow = stepLiveWing(liveWs, { e: E(kg), t: e.t, rangeFt, blockFt });
      liveWs = liveNow.ws;
      if (e.end && endSeen === null) endSeen = kNow;
      if (endSeen !== null && ended === null && (liveNow.settled || kNow - endSeen > HOLD.extraSec / dt)) ended = kNow;
      const pose = liveNow.pose;
      if (this.done) {
        // Back to fighting wing: both straight and level, #2 parallel at Lead's speed, for flight.js to fly on.
        Object.assign(lp, { bank: 0, roll: 0, climb: 0, g: 1 });
        Object.assign(pose, { h: lp.h, bank: 0, att: 0, roll: 0, climb: 0, g: 1, kias: lp.kias, tas: lp.tas, pitch: lp.pitch });
      }
      // #2's tag shows the power he flies; STRETCHED only past the 1,000 ft top of fluid's range (SMM 16.17 para 42).
      applyPose(lead, lp);
      // Back to the programme: his point mass carries straight on from fluid's (TS-225, lead-pilot.js), the engine with it.
      if (this.done) adoptLeadState(lead, e.st, blockFt);
      applyPose(wing, { ...pose, power: liveNow.power, stretched: liveNow.rangeFt > FLUID.rangeFt.max });
      lead.turning = !this.done;
      wing.turning = !this.done;
    },
    /**
     * What is flown now: { key, label, phase, manId, wingCue ('lag' | 'pure' | 'lead' | 'swap' | 'entry' | 'back to fighting wing'),
     * behindSec (always null: the live #2 is not on a line), speeds }. speeds: for the loop being flown, or the last one while Lead flies straight on after it,
     * { label, entryKias, exitKias (null until flown), note (an exit off its entry speed, or null), book: { minKias, exitTolKt,
     * source } }; else null.
     */
    now() {
      const e = E(kNow);
      const m = e.man.entryK !== undefined || FLUID_MOVES[e.man.key]?.speeds ? e.man : e.man.key === 'hold' ? e.lastMan : null;
      const book = m ? FLUID_MOVES[m.key]?.speeds : null;
      const speeds = book ? {
        label: m.label,
        entryKias: m.entryK !== undefined && kNow >= m.entryK ? m.entryKias : null,
        exitKias: m.exitK !== undefined && kNow >= m.exitK ? m.exitKias : null,
        note: m.noteK !== undefined && kNow >= m.noteK ? m.note : null,
        book,
      } : null;
      return {
        speeds,
        key: e.man.key, label: e.man.label, phase: e.phase, manId: e.man.id,
        wingCue: liveNow?.cue ?? 'entry',
        behindSec: null,
      };
    },
    /** The path still to fly, for the dashed preview: Lead's next 15 s (what is planned so far; a press re-plans it). #2 has no path ahead: he flies it as he goes. */
    planned() {
      const pts = { 1: [], 2: [] };
      const until = Math.min(kMax, kNow + Math.round(15 / dt));
      for (let k = kNow; k <= until; k += 5) {
        const x = entries.get(k);
        pts[1].push([x.t, x.pos.x, x.pos.y, x.pos.z]);
      }
      return pts;
    },
  };
}

/** Straight and level at fighting wing's speed: what Lead flies after Terminate, while the formation hands back. */
function steady() {
  return {
    key: 'steady', label: 'Fighting wing', interruptible: true,
    init: () => ({}),
    step: (st) => ({ g: Math.max(0, Math.cos(st.gammaRad) - (st.V / G_FTPS2) * 0.5 * st.gammaRad), bank: 0, holdKias: LEAD.fwKias, phase: 'fighting wing', cue: { mode: 'pure', latDeg: LEAD.cueOffTailDeg, blend: 0 }, done: false }),
  };
}
const wrapDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;

/**
 * Is an aircraft manoeuvring (turning, pitching or pulling) rather than straight and level? Lead's, for the tags and
 * the card (Patrick 23:07Z and 23:08Z: "during the turn all that matters is their distance from lead for spacing").
 * Over 5° of bank or pitch, or 0.2 G off 1 G: estimates of what a pilot would call straight and level.
 */
export function isManoeuvring(a) {
  return Math.abs(a.bankDeg ?? 0) > 5 || Math.abs(a.pitchDeg ?? 0) > 5 || Math.abs((a.g ?? 1) - 1) > 0.2;
}

/** The distance-only word while Lead manoeuvres: TIGHT inside 500 ft, STRETCHED past 1,000 ft, otherwise IN RANGE. */
export function rangeWord(rangeFt) {
  return rangeFt < FLUID.bubbleFt ? 'TIGHT' : rangeFt > FLUID.rangeFt.max ? 'STRETCHED' : 'IN RANGE';
}

/**
 * The readouts for the card and the tags (design 5.5), from the two aircraft as they are: range (straight line), aspect
 * (0 at Lead's tail, SMM 16.16 para 40b; Patrick row 10), HCA (para 40c), closure, line of sight rate, #2's state (the
 * distance only while Lead manoeuvres, the distance and the cone straight and level) and the flags. manKey: the manoeuvre Lead flies (for its pitch limit, the barrel roll 60°). prev: the aircraft a step ago ({ lead, wing } with xFt, yFt, altAboveFt) for the rates, or null.
 */
export function fluidReadouts(lead, wing, prev, blockFt, manKey = null) {
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
  // While Lead manoeuvres the cone is #2's aim, not a verdict (Patrick 23:02Z, SMM 16.17 para 42), and only the distance
  // is judged (23:07Z, 23:08Z); straight and level, the full verdict: the distance and the cone. In Terminate #2 is flowing
  // out of the cone to fighting wing (Patrick 12 Oct 2026 04:01Z), so there too only the distance is judged.
  const manoeuvring = isManoeuvring(lead);
  const leaving = manKey === 'terminate' || manKey === 'steady';
  const state = manoeuvring || leaving || rangeFt < FLUID.bubbleFt || rangeFt > FLUID.rangeFt.max ? rangeWord(rangeFt) : aspectDeg > FLUID.coneHalfDeg ? 'OUT OF CONE' : 'IN POSITION';
  const flags = [];
  if (rangeFt < FLUID.bubbleFt) flags.push(`Inside the 500 ft bubble (${Math.round(rangeFt)} ft; SMM 16.17 para 44c).`);
  if (wing.g > FLUID.wingGLimit) flags.push(`#2 is pulling ${wing.g.toFixed(1)} G; the limit is 5 G (SMM 16.17 para 44a).`);
  if (wing.stretched) flags.push('#2 is STRETCHED: more than 1,000 ft from Lead (SMM 16.17 para 42), at MAX and cutting inside Lead\'s turn to close (TS-74).');
  if (lead.g > FLUID.leadGLimit) flags.push(`Lead is pulling ${lead.g.toFixed(1)} G; the limit is 4 G (Orders B2 ch 8).`);
  if (aspectDeg > FLUID.aspectHcaFlagDeg && hcaDeg > FLUID.aspectHcaFlagDeg && losDps < FLUID.lowLosDps) flags.push('More than 90° of aspect with more than 90° of HCA and low line of sight (SMM 16.17 para 44b).');
  const maxPitch = manKey ? FLUID_MOVES[manKey]?.maxPitch : null;
  if (maxPitch && Math.abs(lead.pitchDeg ?? 0) > maxPitch.deg) flags.push(`Lead's pitch is ${Math.round(Math.abs(lead.pitchDeg))}°; the barrel roll's limit is ${maxPitch.deg}° (${maxPitch.source}).`);
  for (const [a, name] of [[lead, 'Lead'], [wing, '#2']]) {
    if (blockFt + (a.altAboveFt ?? 0) < FLUID.hardDeckMslFt) flags.push(`${name} is below 3,000 ft AGL, the fluid manoeuvring minimum (Orders B2 ch 8 para 1f; Gen Book p.11).`);
    if (a.g > shakerG(a.kias) - 0.01) flags.push(`${name} is at the stick shaker.`);
  }
  return { rangeFt, aspectDeg, hcaDeg, closureKt, losDps, state, manoeuvring, nearEnd: rangeFt <= FLUID.rangeFt.goodMax, flags };
}
