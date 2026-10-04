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
import { STEP_SEC } from './flight.js';
import { MANOEUVRES, relativeTo, DEG } from './manoeuvres.js';
import { recordFlight, trackTwice, phase } from './transitions.js';
import { smoothest } from './kinematic.js';
import { leadTurnSegs } from './kinematic-moves.js';
import { G_FTPS2 } from '../../../core/units.js';

/** The numbers of the fighting wing turns. Estimates unless a source is given. */
export const FW_TURN = Object.freeze({
  gentleBankDeg: 30, // Lead's bank for a turn of 30° or less (the check turn): gentle (AFM7 brief p.14 item 5a)
  turnBankDeg: 45, // Lead's bank for the bigger turns: moderate, so #2 collapses (item 5b); 1.4 G level
  collapseFromDeg: 32, // #2 starts collapsing once Lead's bank passes this ...
  collapseFullDeg: 42, // ... and goes all the way to Lead's six by this
  band: { minFt: 500, maxFt: 1000, minSweepDeg: 30, maxSweepDeg: 60 }, // SMM 12.29 para 69, Fig 12.19
  aimInsideFt: 50, // when #2 has to move back into the band, it aims this far inside its edge in range ...
  aimInsideDeg: 5, // ... and in sweep, so it ends clearly in it (the shared ±100 ft and ±5° margins would also pass the edge)
  turnDeg: { check: 20, delayed45: 45, delayed90: 90, inPlace90: 90, hook: 180 }, // each turn button's turn, in fighting wing
});

/** The turn buttons that fly in fighting wing (spec section 10); the shackle and the cross turn stay line abreast moves. */
export const FW_TURN_KEYS = Object.freeze(Object.keys(FW_TURN.turnDeg));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The goal for #2 in Lead's frame (fwd, left), from where Lead and #2 are now. side: #2's side to come back to (+1 left,
 * -1 right). Exported for the tests.
 */
export function fwGoal(L, W, side) {
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
  const c = smoothest((Math.abs(L.bankDeg) - FW_TURN.collapseFromDeg) / (FW_TURN.collapseFullDeg - FW_TURN.collapseFromDeg));
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

/**
 * A turn in fighting wing. pair: [lead, wing], #2 in fighting wing; key: a turn button (FW_TURN_KEYS); dir: +1 left,
 * -1 right. Returns { ok, plans, note, leadBankDeg, maxBankDeg, endSec } or { ok: false, reason }.
 */
export function planFwTurn(pair, key, dir, t0 = 0, { blockFt = 8000 } = {}) {
  const [lead, wing] = pair;
  const m = MANOEUVRES[key];
  if (!FW_TURN_KEYS.includes(key)) return { ok: false, reason: `${m?.label ?? key} flies in line abreast only.` };
  const turnDeg = FW_TURN.turnDeg[key];
  const bank = turnDeg <= 30 ? FW_TURN.gentleBankDeg : FW_TURN.turnBankDeg;
  const leadSegs = leadTurnSegs(lead.headingRad, dir, turnDeg * DEG, bank, true);
  const refs = { [lead.id]: recordFlight(lead, { segments: leadSegs }, t0) };
  const rel0 = relativeTo(lead, wing);
  const side = Math.sign(rel0.left) || -1;
  const up0 = wing.altAboveFt - lead.altAboveFt;
  const goalPhase = phase(
    { fwd: rel0.fwd, left: rel0.left, alt: lead.altAboveFt + up0 },
    {
      goal: (L, W) => fwGoal(L, W, side),
      goalTolFt: 3,
      // How the tracker flies to the goal (estimates, the 4-ship's fighting wing follow, transitions-panel limits apply):
      fwdRate: 40,
      latRate: 60,
      vrel0: 30,
      kcap: 0.05,
      d0: 100,
      vrelMax: 120,
      decel: 2,
      bankCapDeg: 60, // the bank cap (an estimate), flagged on screen, never a wall
      overtakeKias: 15, // power only a little: geometry does the rest (Patrick 19:12Z)
      undertakeKias: 15,
      advanceTol: 25,
      finalTol: 6,
    },
  );
  const { run, profile } = trackTwice({ refs, wing0: wing, t0, phases: [goalPhase], blockFt });
  if (!run.ok) return { ok: false, reason: `No safe ${m.label.toLowerCase()} in fighting wing from here: #2 could not settle back into the band.` };
  const sideWord = side > 0 ? 'left' : 'right';
  return {
    ok: true,
    plans: { [lead.id]: { segments: leadSegs.map((x) => ({ ...x })) }, [wing.id]: { segments: [{ kind: 'bankTrack', points: run.points }], profile } },
    note:
      `${turnDeg}° ${dir > 0 ? 'left' : 'right'} in fighting wing: Lead turns at ${bank}° of bank. ` +
      (bank > FW_TURN.collapseFromDeg
        ? `#2 collapses to Lead's six on his turn circle, then moves back out into the band on the ${sideWord} (SMM 12.29 para 69, Figs 12.20, 12.23).`
        : `#2 keeps its side and sweep (AFM7 brief p.14).`),
    leadBankDeg: bank,
    maxBankDeg: run.maxBankDeg,
    endSec: t0 + run.durationSec,
    stepSec: STEP_SEC,
  };
}
