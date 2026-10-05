// Turns in fighting wing, 2-ship (Turn Sim spec section 10, decision TS-55). Patrick 4 Oct 18:00Z: "I want to be able to
// turn the formation in fighting wing"; 19:12Z: "500-1000 feet anywhere between 30-60 sweep, collapse to lead's six when
// manoeuvring, and can use geometry on turn in and turn out to fix positioning if tight or stretched (as per the SMM)".
//
// Lead flies the button's turn. #2 is the transitions.js tracker with a goal-seeking phase, run as a dry run at the press
// and recorded (the same bank-and-speed replay as every 2-ship change), so it is repeatable. Its goal, every step:
//  - Anywhere in the fighting wing band counts as in position (SMM 12.29 para 69, Fig 12.19: 500-1,000 ft, 30-60° sweep):
//    inside it #2 stays where it is; outside it, the nearest point of the band, on #2's own side.
//  - While Lead is manoeuvring (a moderate or steep bank) #2 collapses to Lead's six on Lead's turn circle (SMM 12.29
//    para 69: "collapsing to lead's 6 o'clock"; AFM7 brief p.14, Fighting Wing item 5b; Fig 12.20 "capture the turn
//    circle"), at its own range kept inside 500-1,000 ft: tight, it opens (lag); stretched, it closes (lead, cut-off), by
//    the tracker's pursuit geometry on the turn in and the turn out (Figs 12.21, 12.22), with power only as far as the
//    tracker's small overtake and undertake allow.
//  - A gentle turn (the check turn) is not manoeuvring: #2 keeps its side and sweep (AFM7 brief p.14 item 5a).
//  - Once Lead rolls out, #2 moves back out into the band on the side it started (Fig 12.23, "pick the side you want and
//    regain position").
// Numbers with no source beside them are estimates and say so.
//
// Turns in the close formations (spec section 10.2; Patrick 18:11Z: "do turns in any of these formations") are planned here
// too: planCloseTurn, below. planFormationTurn picks the planner for the formation the aircraft are in.
import { STEP_SEC, SMOOTHER_PEAK, copyAircraft } from './flight.js';
import { MANOEUVRES, relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, flyStep, dryRunT } from './transitions.js';
import { trackTwice, phase } from './tracker.js';
import { smoothest, makeTrack, seedTrack, posesFrom, settleLast, laggedBank, followInto } from './kinematic.js';
import { leadTurnSegs, rollEvents, eventsEnd } from './kinematic-moves.js';
import { KINEMATIC, FW_TURN, FW_FOLLOW, WING_BANKS } from './tuning.js';
import { G_FTPS2 } from '../../../core/units.js';

/** The turn buttons that fly in fighting wing (spec section 10); the shackle and the cross turn stay line abreast moves. */
export const FW_TURN_KEYS = Object.freeze(Object.keys(FW_TURN.turnDeg));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The goal for #2 in Lead's frame (fwd, left), from where Lead and #2 are now. side: #2's side to come back to (+1 left,
 * -1 right). Exported for the tests.
 */
export function fwGoal(L, W, side, collapse = true) {
  const { band } = FW_TURN;
  const q = relativeTo(L, W);
  const range = Math.hypot(q.fwd, q.left);
  // The band: stay put inside it; outside, its nearest point on #2's side (aiming a little inside the edge).
  const inside =
    range >= band.minFt && range <= band.maxFt && Math.sign(q.left) === side && sweepOf(q) >= band.minSweepDeg && sweepOf(q) <= band.maxSweepDeg;
  let bandGoal = { fwd: q.fwd, left: q.left };
  if (!inside) {
    const r = clamp(range, band.minFt + FW_TURN.aimInsideFt, band.maxFt - FW_TURN.aimInsideFt);
    const sw = clamp(Math.sign(q.left) === side ? sweepOf(q) : 90, band.minSweepDeg + FW_TURN.aimInsideDeg, band.maxSweepDeg - FW_TURN.aimInsideDeg) * DEG;
    bandGoal = { fwd: -r * Math.sin(sw), left: side * r * Math.cos(sw) };
  }
  // Manoeuvring: Lead's six on his turn circle, at #2's range kept in the band.
  const c = collapse ? smoothest((Math.abs(L.bankDeg) - FW_TURN.collapseFromDeg) / (FW_TURN.collapseFullDeg - FW_TURN.collapseFromDeg)) : 0;
  if (c <= 0) return bandGoal;
  const r = clamp(range, band.minFt + FW_TURN.aimInsideFt, band.maxFt - FW_TURN.aimInsideFt);
  const turnRadius = L.tasFtps ** 2 / (G_FTPS2 * Math.tan(Math.max(Math.abs(L.bankDeg), 1) * DEG));
  const theta = Math.min(r / turnRadius, Math.PI / 2);
  const six = { fwd: -turnRadius * Math.sin(theta), left: Math.sign(L.bankDeg) * turnRadius * (1 - Math.cos(theta)) };
  return { fwd: bandGoal.fwd + (six.fwd - bandGoal.fwd) * c, left: bandGoal.left + (six.left - bandGoal.left) * c };
}

/** Sweep back from Lead's 3/9 line, degrees (0 abeam, 90 straight behind). */
function sweepOf(q) {
  return Math.atan2(-q.fwd, Math.max(Math.abs(q.left), 1e-6)) / DEG;
}


const NAMES = Object.freeze({ 1: 'Lead', 2: '#2', 3: '#3', 4: '#4' });
/** The wingmen in an order where the aircraft each flies off comes first (#4 off #3 after #3, SMM 16.37 para 103). */
const inRefOrder = (aircraft) => aircraft.filter((a) => a.ref != null).sort((a, b) => a.id - b.id);

/**
 * A turn in fighting wing, 2-ship or 4-ship. aircraft: Lead first, each wingman with the aircraft it flies off (`ref`): #2
 * off Lead; in the 4-ship #3 off #2 and #4 off #3 (SMM 16.38 para 104, Fig 16.29). key: a turn button (FW_TURN_KEYS); dir:
 * +1 left, -1 right. Each wingman flies the goal-seeking dry run off the aircraft ahead of it, planned in that order, so in
 * the 4-ship each collapses toward the six of the one ahead and stays clear of him: "4 misses 3, misses 2, misses Lead"
 * (AFM7 brief p.14 items 1 and 5b: "No. 3 must ensure clear of No. 2"; SMM 16.39 para 107). The stack, when there is one,
 * is kept. Returns { ok, plans, note, leadBankDeg, maxBankDeg, endSec } or { ok: false, reason }.
 */
export function planFwTurn(aircraft, key, dir, t0 = 0, { blockFt = 8000 } = {}) {
  const lead = aircraft[0];
  const m = MANOEUVRES[key];
  if (!FW_TURN_KEYS.includes(key)) return { ok: false, reason: `${m?.label ?? key} flies in line abreast only.` };
  const turnDeg = FW_TURN.turnDeg[key];
  // Lead flies every fighting wing turn at 60° of bank, 2 G level, 2-ship and 4-ship, and the wingmen follow with no bank cap
  // but the G rule (Patrick 5 Oct 06:16Z items 9 and 11, tuning.js WING_BANKS; AFM7 brief p.14 item 5's 30° and 45° until V2.22).
  const bank = WING_BANKS.fwTurnBankDeg;
  // #2 collapses to the six only in the bigger turns, not the check turn (FW_TURN.collapseMinTurnDeg; Patrick 06:44Z).
  const collapse = turnDeg >= FW_TURN.collapseMinTurnDeg;
  const follow = { ...FW_FOLLOW, bankCapDeg: WING_BANKS.fwFollowBankCapDeg };
  const leadSegs = leadTurnSegs(lead.headingRad, dir, turnDeg * DEG, bank, true);
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const refs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  const plans = { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) } };
  let endSec = t0;
  let maxBankDeg = 0;
  for (const wing of inRefOrder(aircraft)) {
    const ref = by.get(wing.ref);
    const rel0 = relativeTo(ref, wing);
    const side = Math.sign(rel0.left) || -1;
    const goalPhase = phase({ fwd: rel0.fwd, left: rel0.left, alt: wing.altAboveFt }, { ...follow, track: wing.ref, goal: (L, W) => fwGoal(L, W, side, collapse) });
    const { run, profile } = trackTwice({ refs, wing0: wing, t0, phases: [goalPhase], blockFt });
    if (!run.ok) return { ok: false, reason: `No safe ${m.label.toLowerCase()} in fighting wing from here: ${NAMES[wing.id]} could not settle back into the band.` };
    const plan = { segments: [{ kind: 'bankTrack', points: run.points }], profile };
    plans[wing.id] = plan;
    refs[wing.id] = recordFlight(wing, plan, t0);
    endSec = Math.max(endSec, t0 + run.durationSec);
    maxBankDeg = Math.max(maxBankDeg, run.maxBankDeg);
  }
  const four = aircraft.length > 2;
  const sideWord = relativeTo(lead, by.get(2)).left > 0 ? 'left' : 'right';
  return {
    ok: true,
    plans,
    note:
      `${turnDeg}° ${dir > 0 ? 'left' : 'right'} in fighting wing: Lead turns at ${bank}° of bank. ` +
      (collapse
        ? four
          ? `Each wingman collapses toward the six of the one ahead, #3 clear of #2 and #4 of #3, then they move back out into the band (SMM 12.29 para 69, 16.38 para 104; AFM7 brief p.14).`
          : `#2 collapses to Lead's six on his turn circle, then moves back out into the band on the ${sideWord} (SMM 12.29 para 69, Figs 12.20, 12.23).`
        : `${four ? 'The wingmen keep their' : '#2 keeps its'} side and sweep (AFM7 brief p.14).`),
    leadBankDeg: bank,
    maxBankDeg,
    endSec,
    stepSec: STEP_SEC,
  };
}

// ---- turns in the close formations ---------------------------------------------------------------

/**
 * The numbers of the close formation turns. Lead's bank: the 2-ship and the 4-ship's finger, box, route and line astern turn
 * at 45° (1.4 G), an estimate inside the close formation limit of 3 G (2 CFFTS Orders B2 ch 8 p.97, para 1a and 1b); the
 * check turn at 30° (gentle, as in fighting wing). The 4-ship's echelon turns at 30°: the Orders normally restrict it to
 * stepped turns away at 30° of bank (para 1b(2)); SMM 16.36 para 101 also has echelon turns normally away from the formation.
 * A turn into a 4-ship echelon is flown and flagged, never refused (the rule book: references, not walls).
 */
export const CLOSE_TURN = Object.freeze({
  bankDeg: 45,
  gentleBankDeg: 30,
  fourEchelonBankDeg: 30,
  /**
   * The wingman's place in the wing plane follows Lead's bank over this long (the shared kinematic estimate, KINEMATIC.planeLagSec):
   * he rolls with Lead at Lead's own roll rate (SMM 12.19 para 43), and steps up or down into the plane as the turn
   * establishes ("initially climbs or descends slightly as bank is changed", para 41).
   */
  planeLagSec: KINEMATIC.planeLagSec,
});

/** The formations whose turns are flown in Lead's wing plane, 2-ship and 4-ship (spec section 10.2). */
export const CLOSE_TURN_FORMATIONS = Object.freeze({ 2: ['echelon', 'route', 'astern'], 4: ['finger', 'echelon', 'box', 'trail', 'route'] });
/** Every formation the turn buttons fly in besides line abreast (Spread 4): fighting wing and the close ones. */
export const TURN_FORMATIONS = Object.freeze({ 2: ['fw', ...CLOSE_TURN_FORMATIONS[2]], 4: ['fw', ...CLOSE_TURN_FORMATIONS[4]] });

/** An aircraft flown through its segments on a copy, recording its bank and roll rate after every step (1..n). */
function bankAndRoll(aircraft, segments, t0, n) {
  const a = copyAircraft(aircraft);
  const p = { segments: segments.map((x) => ({ ...x })) };
  const out = [];
  let t = t0;
  for (let k = 1; k <= n; k++) {
    flyStep(a, p, t);
    t += STEP_SEC;
    out.push({ bank: a.bankDeg, roll: a.rollRateDps });
  }
  return out;
}

/**
 * A turn in a close formation, 2-ship or 4-ship (SMM 12.19 paras 41-43, Fig 12.11; 16.36 paras 99-102; Patrick 18:11Z: "do
 * turns in any of these formations"). Lead flies the button's turn; each wingman keeps his place on the aircraft he flies off
 * in that aircraft's wing plane, so on the outside of the turn he is stepped up and on the inside stepped down (Fig 12.11),
 * and he rolls with Lead at Lead's own roll rate (para 43). His path is a kinematic line worked out at the press (TS-55): his
 * place, carried round by the aircraft he flies off, one point a step, and every flight value read off it, except bank and
 * roll rate, which are Lead's (he matches Lead's roll). Line astern, in the plane, sits under Lead's tail through the turn.
 * In the 4-ship #3 is in Lead's wing plane, so #4, flying through #3 in #3's plane (SMM 16.37 para 103), is in Lead's plane
 * too: every wingman's place is worked out in Lead's plane, which is the same picture with no chain of small errors.
 * aircraft: Lead first, each wingman with `ref`; formation: the formation they are in; key: a turn button; dir: +1 left, -1 right.
 * Returns { ok, plans, note, leadBankDeg, maxBankDeg, endSec, flag }.
 */
export function planCloseTurn(aircraft, formation, key, dir, t0 = 0) {
  const lead = aircraft[0];
  const m = MANOEUVRES[key];
  if (!FW_TURN_KEYS.includes(key)) return { ok: false, reason: `${m?.label ?? key} flies in line abreast only.` };
  const four = aircraft.length > 2;
  const turnDeg = FW_TURN.turnDeg[key];
  const bank = turnDeg <= 30 ? CLOSE_TURN.gentleBankDeg : four && formation === 'echelon' ? CLOSE_TURN.fourEchelonBankDeg : CLOSE_TURN.bankDeg;
  const leadSegs = leadTurnSegs(lead.headingRad, dir, turnDeg * DEG, bank, true);
  const leadSteps = Math.round(dryRunT(lead, { segments: leadSegs }, t0).durationSec / STEP_SEC);
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const leadRec = recordFlight(lead, { segments: leadSegs }, t0);
  const plans = { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) } };
  // Each wingman's place, fixed in Lead's wing plane (all wings level at the press, so his place now is his place in the
  // plane), the plane a moment behind Lead's roll (SMM 12.19 para 43): the place is turned into the lagged plane here, and
  // the carry-on line turns with Lead's own bank, so he turns as Lead turns. Lead's rolls are each followed into gently, as
  // the station changes do (kinematic-moves.js); the roll-in at the press is one of them (from -1), so its blend is sized
  // like the rest.
  const plane = laggedBank(leadRec, CLOSE_TURN.planeLagSec);
  const wings = aircraft.slice(1).map((wing) => {
    const rel = relativeTo(lead, wing);
    const up = wing.altAboveFt - lead.altAboveFt;
    const slotAt = (k) => {
      const phi = plane.at(k).bankDeg * DEG;
      return { fwd: rel.fwd, left: rel.left * Math.cos(phi) + up * Math.sin(phi), up: -rel.left * Math.sin(phi) + up * Math.cos(phi), plane: 0 };
    };
    return { wing, slotAt, events: rollEvents(leadRec, slotAt, -1, leadSteps, KINEMATIC.closeBlendSec) };
  });
  const n = wings.reduce((m, w) => Math.max(m, eventsEnd(w.events) + 4), leadSteps + Math.ceil((2 * CLOSE_TURN.planeLagSec + 1) / STEP_SEC));
  const leadAttitude = bankAndRoll(lead, leadSegs, t0, n);
  let maxBankDeg = Number(bank);
  for (const { wing, slotAt, events } of wings) {
    const track = makeTrack(n);
    seedTrack(track, wing);
    if (!events.length || events[0].k > 0) followInto(track, { ref: leadRec, from: 0, slotAt, blendSec: KINEMATIC.closeBlendSec });
    for (const e of events) followInto(track, { ref: leadRec, from: e.k, slotAt, blendSec: e.blendSec, decaySec: e.blendSec / 2 });
    const line = posesFrom(track, wing.kias / wing.tasFtps);
    // He rolls with Lead, at Lead's roll rate (SMM 12.19 para 43).
    line.poses.forEach((p, i) => {
      p.bank = leadAttitude[i].bank;
      p.roll = leadAttitude[i].roll;
    });
    settleLast(line.poses, leadRec.at(n));
    plans[wing.id] = { segments: [{ kind: 'poseTrack', poses: line.poses }] };
    maxBankDeg = Math.max(maxBankDeg, line.maxBankDeg);
  }
  // Which way each is stepped: the wingmen on the turn's side are on the inside (stepped down), the others on the outside (up).
  const two = by.get(2);
  const twoSide = Math.sign(relativeTo(lead, two).left);
  const step = (s) => (s === 0 ? 'under Lead\'s tail' : s === dir ? 'stepped down (inside)' : 'stepped up (outside)');
  const who = formation === 'astern' || formation === 'trail'
    ? 'Each wingman stays under the tail of the one ahead, in his wing plane.'
    : four
      ? `#2 is ${step(twoSide)}, #3 and #4 ${step(formation === 'echelon' ? twoSide : -twoSide)}${formation === 'box' ? ', #4 under Lead\'s tail' : ''}.`
      : `#2 is ${step(twoSide)}.`;
  const intoEchelon = four && formation === 'echelon' && twoSide === dir;
  return {
    ok: true,
    plans,
    note: `${turnDeg}° ${dir > 0 ? 'left' : 'right'} in ${formationWord(formation, four)}: Lead turns at ${bank}° of bank; the wingmen roll with him, in his wing plane (SMM 12.19 paras 41-43, Fig 12.11). ${who}` +
      (intoEchelon ? ' A turn into a 4-ship echelon: the Orders normally restrict echelon to turns away (B2 ch 8 p.97); flown anyway.' : ''),
    flag: intoEchelon ? '4-ship echelon turn into the formation (Orders B2 ch 8 p.97: normally turns away only)' : null,
    leadBankDeg: bank,
    maxBankDeg,
    endSec: t0 + n * STEP_SEC,
    stepSec: STEP_SEC,
  };
}

const formationWord = (key, four) => ({ echelon: 'echelon', route: 'route', astern: 'line astern', trail: 'line astern', finger: 'finger', box: 'box', fw: 'fighting wing' })[key] ?? (four ? 'the formation' : key);

/**
 * A turn button pressed in a formation other than line abreast (spec sections 10.1 and 10.2): fighting wing (planFwTurn) or a
 * close formation (planCloseTurn). where: { key, side } from the formation's classifier. Returns the plan, or null when the
 * turn buttons do not fly in that formation.
 */
export function planFormationTurn(aircraft, where, key, dir, t0 = 0, { blockFt = 8000 } = {}) {
  const ships = aircraft.length > 2 ? 4 : 2;
  if (!FW_TURN_KEYS.includes(key) || !TURN_FORMATIONS[ships].includes(where.key)) return null;
  return where.key === 'fw' ? planFwTurn(aircraft, key, dir, t0, { blockFt }) : planCloseTurn(aircraft, where.key, key, dir, t0);
}

// ---- Lead's manoeuvres in fighting wing (TS-70) ------------------------------------------------------------------------

/**
 * Lead's buttons in fighting wing, 2-ship (spec section 10.7, TS-70; Patrick 5 Oct 09:03Z: "they should be normal clearhood
 * turns and climbs etc. fluid manoeuvring is just fighting wing aerobatics"; card "Yes, as written" 09:07Z): fluid's own
 * level turns, wings level, reversal, climb and descent, with no aerobatics. Each press is flown at once, planned again from
 * where the pair is (a held turn is planned FW_MOVE.heldTurnDeg ahead), and #2 flies the fighting wing turns' goal-seeking
 * tracker (fwGoal): anywhere in the cone is his place (Patrick 08:58Z), collapsing toward Lead's six while Lead is banked.
 */
export const FW_MOVES = Object.freeze({
  levelTurn: { label: 'Level turn', sided: true },
  wingsLevel: { label: 'Wings level', sided: false },
  reversal: { label: 'Reversal', sided: false },
  climb: { label: 'Climb', sided: false },
  descend: { label: 'Descend', sided: false },
});
/** Lead's moves in fighting wing: a held turn is planned two full turns ahead, the next press planning again from where the
 * pair is; climbs and descents as fluid's (2,000 ft, a 15° path at the steepest; design 5.1, estimates). */
export const FW_MOVE = Object.freeze({ heldTurnDeg: 720, climbFt: 2000, climbDeg: 15 });

/**
 * One of Lead's fighting wing moves (FW_MOVES) from where the pair is now, 2-ship. bankDeg: Lead's level turn bank (the
 * fluid setting). Returns { ok, plans, note, leadBankDeg, maxBankDeg, endSec } or { ok: false, reason }.
 */
export function planFwMove(aircraft, key, dir, t0 = 0, { blockFt = 8000, bankDeg = /** @type {number} */ (WING_BANKS.fwTurnBankDeg) } = {}) {
  const [lead, wing] = aircraft;
  if (!FW_MOVES[key]) return { ok: false, reason: `No fighting wing move called ${key}.` };
  const turning = Math.abs(lead.bankDeg) > 5;
  const nowDir = Math.sign(lead.bankDeg) || 1;
  const held = (d, bank) => leadTurnSegs(lead.headingRad, d, FW_MOVE.heldTurnDeg * DEG, bank, true);
  let segments = [];
  let profile = [];
  if (key === 'levelTurn') segments = held(dir, bankDeg);
  else if (key === 'reversal') {
    if (!turning) return { ok: false, reason: 'Reversal needs a turn to reverse: press a level turn first.' };
    segments = held(-nowDir, Math.max(bankDeg, Math.abs(lead.bankDeg)));
  } else if (key === 'climb' || key === 'descend') {
    // A pitch change only: a turn being flown carries on at its bank (as fluid's).
    if (turning) segments = held(nowDir, Math.abs(lead.bankDeg));
    const avgFtps = (lead.tasFtps * Math.sin(FW_MOVE.climbDeg * DEG)) / SMOOTHER_PEAK;
    const up = key === 'climb' ? 1 : -1;
    profile = [{ t0, t1: t0 + FW_MOVE.climbFt / avgFtps, fromFt: lead.altAboveFt, toFt: lead.altAboveFt + up * FW_MOVE.climbFt }];
  } // wings level: no segments, so Lead rolls out (flight.js)
  const leadPlan = { segments, profile };
  const refs = { [lead.id]: recordFlight(lead, leadPlan, t0) };
  const rel0 = relativeTo(lead, wing);
  const side = Math.sign(rel0.left) || -1;
  const follow = { ...FW_FOLLOW, bankCapDeg: WING_BANKS.fwFollowBankCapDeg };
  const goalPhase = phase({ fwd: rel0.fwd, left: rel0.left, alt: wing.altAboveFt }, { ...follow, track: lead.id, goal: (L, W) => fwGoal(L, W, side, true) });
  const { run } = trackTwice({ refs, wing0: wing, t0, phases: [goalPhase], blockFt });
  if (!run.ok) return { ok: false, reason: `No safe ${FW_MOVES[key].label.toLowerCase()} in fighting wing from here: #2 could not stay in the cone.` };
  // #2 climbs and descends with Lead, keeping the height he has from Lead (the whole cone, high or low: Patrick 08:58Z).
  const dh = wing.altAboveFt - lead.altAboveFt;
  const wingProfile = profile.map((leg) => ({ ...leg, fromFt: leg.fromFt + dh, toFt: leg.toFt + dh }));
  const words = key === 'levelTurn' ? `a level turn ${dir > 0 ? 'left' : 'right'} at ${bankDeg}° of bank, held until the next press` : key === 'reversal' ? 'a reversal' : key === 'wingsLevel' ? 'wings level' : `a ${key === 'climb' ? 'climb' : 'descent'} of ${FW_MOVE.climbFt.toLocaleString('en-CA')} ft`;
  return {
    ok: true,
    plans: { [lead.id]: { segments: segments.map((x) => ({ ...x })), profile }, [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile: wingProfile } },
    note: `Fighting wing: Lead flies ${words}. #2 stays in the cone, anywhere in it, collapsing toward Lead's six while Lead is banked (SMM 12.29 para 69, Fig 12.19).`,
    leadBankDeg: key === 'levelTurn' ? bankDeg : Math.abs(lead.bankDeg),
    maxBankDeg: run.maxBankDeg,
    endSec: t0 + run.durationSec,
  };
}
