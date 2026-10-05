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
import { STEP_SEC, SMOOTHER_PEAK } from './flight.js';
import { MANOEUVRES, relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, dryRunT } from './transitions.js';
import { trackTwice, phase } from './tracker.js';
import { smoothest, makeTrack, seedTrack, setTrackStep, TRACK_PAD, posesFrom, settleLast, slotInWorld } from './kinematic.js';
import { leadTurnSegs } from './kinematic-moves.js';
import { FW_TURN, FW_FOLLOW, WING_BANKS } from './tuning.js';
import { G_FTPS2 } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';

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
   * Lead's roll in a close formation turn: up to 30°/s, building at 20°/s², so 45° of bank takes about 3 s (estimates; no
   * manual gives a roll rate). At the 180°/s every other move may use (Patrick 5 Oct 06:07Z) his wing plane would swing a
   * wingman's place 30 ft (echelon) to 120 ft (route) up or down in half a second, which no wingman can follow.
   */
  leadRoll: Object.freeze({ maxRateDps: 30, maxAccelDps2: 20 }),
  /**
   * How a close wingman holds his place in Lead's real wing plane through the roll-in, the turn and the roll-out (SMM 12.19
   * paras 41-43, Fig 12.11; Patrick 5 Oct 19:51Z: "The aircraft should use bank and pitch and roll to stay in position as
   * lead flies in echelon, from any close formation position"; holdInPlane below). He rolls with Lead, and:
   *  - pulls or unloads up to followG more or less than Lead's G along Lead's lift line (pitch), so on the outside of a
   *    roll-in he climbs into the plane and on the inside he descends;
   *  - banks up to bankOffDeg off Lead's bank to slide in or out along Lead's wing line;
   *  - changes speed up to powerG along Lead's heading (about 2 kt/s);
   *  - builds a change of G at no more than onsetGps, and settles back onto his place at about holdPerSec (critically damped).
   * All estimates. Where Lead's roll moves his place faster than that (route, the 4-ship's outer wingmen) he is briefly out
   * of place and back in a few seconds ("initially climbs or descends slightly as bank is changed", para 41).
   */
  followG: 0.5,
  bankOffDeg: 10,
  powerG: 0.1,
  onsetGps: 4,
  holdPerSec: 2.5,
});

/** The formations whose turns are flown in Lead's wing plane, 2-ship and 4-ship (spec section 10.2). */
export const CLOSE_TURN_FORMATIONS = Object.freeze({ 2: ['echelon', 'route', 'astern'], 4: ['finger', 'echelon', 'box', 'trail', 'route'] });
/** Every formation the turn buttons fly in besides line abreast (Spread 4): fighting wing and the close ones. */
export const TURN_FORMATIONS = Object.freeze({ 2: ['fw', ...CLOSE_TURN_FORMATIONS[2]], 4: ['fw', ...CLOSE_TURN_FORMATIONS[4]] });

/**
 * A close wingman's place relative to Lead, step by step, as he holds it in Lead's real wing plane (CLOSE_TURN): body is his
 * place in Lead's wing plane { fwd, left, up }. His place moves as Lead turns and rolls; he follows it with his own G, at most
 * CLOSE_TURN.followG away from Lead's and building at CLOSE_TURN.onsetGps, and closes what is left at CLOSE_TURN.holdPerSec.
 * Flown from the press until Lead has finished (leadSteps) and the wingman is back on his place. Returns { rel: [{ x, y, z }] },
 * his offset from Lead in the world at steps 0..n.
 */
function holdInPlane(leadRec, lead, wing, body, leadSteps) {
  const dt = STEP_SEC;
  const upMost = CLOSE_TURN.followG * G_FTPS2;
  const powerMost = CLOSE_TURN.powerG * G_FTPS2;
  const jMax = CLOSE_TURN.onsetGps * G_FTPS2 * dt;
  const k = CLOSE_TURN.holdPerSec;
  const placeAt = (i) => {
    const L = leadRec.at(Math.max(0, i));
    const p = slotInWorld(L, body.fwd, body.left, body.up, 1);
    return [p.x - L.xFt, p.y - L.yFt, p.z - L.altAboveFt];
  };
  const vel = (a) => [Math.cos(a.headingRad) * a.tasFtps, Math.sin(a.headingRad) * a.tasFtps, a.climbFtps ?? 0];
  const vl = vel(lead);
  const vw = vel(wing);
  let r = [wing.xFt - lead.xFt, wing.yFt - lead.yFt, wing.altAboveFt - lead.altAboveFt]; // where he is (his place, in a turn)
  let v = [vw[0] - vl[0], vw[1] - vl[1], vw[2] - vl[2]];
  // His turn and Lead's as they are (none at a close turn's press; a press mid-turn, replan.js), so his bank carries on.
  const turnAcc = (a) => [-Math.sin(a.headingRad) * G_FTPS2 * Math.tan(a.bankDeg * DEG), Math.cos(a.headingRad) * G_FTPS2 * Math.tan(a.bankDeg * DEG), 0];
  const aw = turnAcc(wing);
  const al = turnAcc(lead);
  let acc = [aw[0] - al[0], aw[1] - al[1], 0];
  const rel = [{ x: r[0], y: r[1], z: r[2] }];
  const last = leadSteps + Math.ceil(30 / dt);
  let prev = placeAt(0);
  let now = placeAt(0);
  for (let i = 0; i < last; i++) {
    const next = placeAt(i + 1);
    const pv = i === 0 ? next.map((x, j) => (x - now[j]) / dt) : next.map((x, j) => (x - prev[j]) / (2 * dt));
    const pa = i === 0 ? [0, 0, 0] : next.map((x, j) => (x - 2 * now[j] + prev[j]) / (dt * dt));
    // Along each of Lead's axes, what he can do about it: G along Lead's lift line (pitch), a little power along Lead's
    // heading, and across Lead's wing line only what a bank a few degrees off Lead's gives at the G he is pulling, so he rolls
    // with Lead. He closes each part of the gap at a rate he can still stop from with that axis's own limit to spare, so he
    // never overshoots his place.
    const L = leadRec.at(i);
    const phi = L.bankDeg * DEG;
    const ch = Math.cos(L.headingRad);
    const sh = Math.sin(L.headingRad);
    const axes = [[ch, sh, 0], [-sh * Math.cos(phi), ch * Math.cos(phi), -Math.sin(phi)], [-sh * Math.sin(phi), ch * Math.sin(phi), Math.cos(phi)]];
    const dot = (ax, w) => ax[0] * w[0] + ax[1] * w[1] + ax[2] * w[2];
    const along = (m, lim) => {
      const gap = dot(axes[m], r) - dot(axes[m], now);
      const want = dot(axes[m], pv) - Math.sign(gap) * Math.min(k * Math.abs(gap), Math.sqrt(lim * Math.abs(gap)));
      const raw = dot(axes[m], pa) + 2 * k * (want - dot(axes[m], v));
      return Math.max(-lim, Math.min(lim, raw));
    };
    const up = along(2, upMost);
    const lift = Math.max(0, G_FTPS2 / Math.cos(phi) + up); // his lift: Lead's (level turn) and the part he adds or takes off
    const parts = [along(0, powerMost), along(1, Math.max(0.5, lift * Math.tan(CLOSE_TURN.bankOffDeg * DEG))), up];
    const cmd = [0, 1, 2].map((j) => axes[0][j] * parts[0] + axes[1][j] * parts[1] + axes[2][j] * parts[2]);
    const step = cmd.map((c, j) => c - acc[j]);
    const jump = Math.hypot(...step);
    acc = acc.map((x, j) => x + (jump > jMax ? (step[j] * jMax) / jump : step[j]));
    v = v.map((x, j) => x + acc[j] * dt);
    r = r.map((x, j) => x + v[j] * dt);
    rel.push({ x: r[0], y: r[1], z: r[2] });
    prev = now;
    now = next;
    const off = Math.hypot(r[0] - now[0], r[1] - now[1], r[2] - now[2]);
    const slip = Math.hypot(...v.map((x, j) => x - (next[j] - prev[j]) / dt));
    if (i + 1 >= leadSteps && off < 0.05 && slip < 0.05 && Math.hypot(...acc) < 0.05) break;
  }
  return { rel };
}

/** A held wingman's poses for steps 1..n: his offsets from Lead (holdInPlane's rel) laid on Lead's flight, his bank his own. */
function heldPoses(leadRec, wing, rel, n) {
  const track = makeTrack(n);
  seedTrack(track, wing);
  for (let k = 1; k <= n + TRACK_PAD; k++) {
    const L = leadRec.at(k);
    const r = rel[Math.min(k, rel.length - 1)]; // once he is settled and Lead is wings level, the same offset
    setTrackStep(track, k, L.xFt + r.x, L.yFt + r.y, L.altAboveFt + r.z);
  }
  const line = posesFrom(track, wing.kias / wing.tasFtps);
  ownBank(line.poses);
  settleLast(line.poses, leadRec.at(n));
  return line.poses;
}

/**
 * #2 from where he is to a close place on his side (echelon or route), held in Lead's real wing plane the way the close
 * turns hold him (holdInPlane): a press mid-move (spec F11, replan.js), so a station change in a turn moves along Lead's
 * wing line instead of chasing a level place. leadPlan: Lead's { segments, profile } from here; slot: the place
 * ({ fwd, left, alt }, slots.js). Returns { poses, steps, leadRec }: poses for steps 1..steps, the last settled on Lead.
 */
export function slideInPlane(lead, wing, leadPlan, slot, t0 = 0) {
  const leadSteps = Math.round(dryRunT(lead, leadPlan, t0).durationSec / STEP_SEC);
  const leadRec = recordFlight(lead, leadPlan, t0);
  const { rel } = holdInPlane(leadRec, lead, wing, { fwd: slot.fwd, left: slot.left, up: slot.alt }, leadSteps);
  const steps = Math.max(leadSteps, rel.length - 1);
  return { poses: heldPoses(leadRec, wing, rel, steps), steps, leadRec };
}

/**
 * Bank and roll rate from a wingman's own path: the direction of the lift that turns him and lifts or lowers him (standard
 * aerodynamics: tan bank = V turn rate / (g + vertical acceleration)), so he rolls with Lead and pulls or unloads to stay in
 * Lead's wing plane, a degree or two off Lead's bank where he has to slide in or out.
 */
function ownBank(poses) {
  const m = poses.length;
  const at = (i) => poses[Math.max(0, Math.min(m - 1, i))];
  const span = (i) => (Math.min(m - 1, i + 1) - Math.max(0, i - 1)) * STEP_SEC || STEP_SEC;
  const bank = poses.map((p, i) => {
    const turn = wrapPi(at(i + 1).h - at(i - 1).h) / span(i);
    const az = (at(i + 1).climb - at(i - 1).climb) / span(i);
    return Math.atan2(p.tas * turn, G_FTPS2 + az) / DEG;
  });
  poses.forEach((p, i) => {
    p.bank = bank[i];
    p.roll = (bank[Math.min(m - 1, i + 1)] - bank[Math.max(0, i - 1)]) / span(i);
  });
}

/**
 * A turn in a close formation, 2-ship or 4-ship (SMM 12.19 paras 41-43, Fig 12.11; 16.36 paras 99-102; Patrick 18:11Z: "do
 * turns in any of these formations"). Lead flies the button's turn; each wingman keeps his place on the aircraft he flies off
 * in that aircraft's wing plane, so on the outside of the turn he is stepped up and on the inside stepped down (Fig 12.11),
 * and he rolls with Lead (para 43). Lead rolls in and out smoothly (CLOSE_TURN.leadRoll). Each wingman's path is worked out at
 * the press (TS-77): his place in Lead's real wing plane, held with G, a little bank and a little power (holdInPlane), and
 * every flight value read off the path, his bank from his own lift (ownBank). Line astern, in the plane, sits under Lead's
 * tail through the turn.
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
  const leadSegs = leadTurnSegs(lead.headingRad, dir, turnDeg * DEG, bank, true).map((x) => ({ ...x, roll: CLOSE_TURN.leadRoll }));
  const leadSteps = Math.round(dryRunT(lead, { segments: leadSegs }, t0).durationSec / STEP_SEC);
  const by = new Map(aircraft.map((a) => [a.id, a]));
  const leadRec = recordFlight(lead, { segments: leadSegs }, t0);
  const plans = { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) } };
  // Each wingman's place, fixed in Lead's real wing plane (holdInPlane): his place now, turned back out of Lead's bank.
  let maxBankDeg = Number(bank);
  const held = aircraft.slice(1).map((wing) => {
    const rel = relativeTo(lead, wing);
    const up = wing.altAboveFt - lead.altAboveFt;
    const phi = (lead.bankDeg ?? 0) * DEG;
    const body = { fwd: rel.fwd, left: rel.left * Math.cos(phi) - up * Math.sin(phi), up: rel.left * Math.sin(phi) + up * Math.cos(phi) };
    return { wing, ...holdInPlane(leadRec, lead, wing, body, leadSteps) };
  });
  const n = held.reduce((m, h) => Math.max(m, h.rel.length - 1), leadSteps);
  for (const { wing, rel } of held) {
    const poses = heldPoses(leadRec, wing, rel, n);
    plans[wing.id] = { segments: [{ kind: 'poseTrack', poses }] };
    for (const p of poses) maxBankDeg = Math.max(maxBankDeg, Math.abs(p.bank));
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
    note: `${turnDeg}° ${dir > 0 ? 'left' : 'right'} in ${formationWord(formation, four)}: Lead rolls in smoothly to ${bank}° of bank; the wingmen roll with him and hold their places in his wing plane with G, pitch and bank (SMM 12.19 paras 41-43, Fig 12.11). ${who}` +
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
