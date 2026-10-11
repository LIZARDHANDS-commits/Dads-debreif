// Hand-overs and closure rates (tracker-only migration Slice 4; TS-65, TS-128). Kinematic lines have been removed;
// this file holds the shared hand-over, closure phase mapping (onClosure), frame offsets (offSlotFt), pose application
// (wingFromPose) and step slicing (fromStep) utilities used across 2-ship rejoins and formation transitions.
// Numbers are tuning.js's.
import { KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, copyAircraft } from './flight.js';
import { relativeTo } from './manoeuvres.js';
import { applyPose } from './kinematic.js';
import { WING_BANKS, closureNow, rejoinClosureNow } from './tuning.js';

const dt = STEP_SEC;

/** A leg whose slot is further than this from the aircraft flown off is a long move's (fighting wing, line abreast). */
const LONG_SLOT_FT = 300; // the close formations all sit inside about 150 ft (route, 3 wingspans out); fighting wing starts at 500 ft
// A move to a place more than this far from the aircraft he flies off has no closure cap: full power, then a smooth stop
// with power and the boards (Patrick 6 Oct 15:18Z: "Get rid of the closure rate when moving anywhere further than 100 feet
// from the aircraft ... as long as it's realistic and smooth"; TS-128). A rejoin's legs keep their own rules (TS-75).
export const FREE_MOVE_FT = 100;
// The closure such a move is planned to: more than the T-6 reaches over these distances, so it is no cap (an estimate).
export const FREE_CLOSURE_KT = 150;

/**
 * The phases flown on the power profile at the Rates choice's closures (tracker.js closureFtps; Patrick 06:09Z, 06:11Z):
 *  - a rejoin's legs (marked `rejoin`: up to route, the corner or the decision point), and the legs of other long moves
 *    (a slot out at fighting wing or line abreast range), at REJOIN_CLOSURE_KT;
 *  - every close leg (station changes, echelon and route both ways, line astern, the run-in from a rejoin's route or
 *    corner) at the close-in rate (tuning.js CLOSE_IN_SEC, closeInFtps).
 * Banks: a close leg up to 60° (Patrick 06:43Z); a kick out to fighting wing or line abreast, or a move in its band, with no cap
 * (Patrick 6 Oct 04:07Z); a rejoin's legs keep their own (REJOIN.bankCapDeg: no cap, Patrick 6 Oct 04:07Z). Each slot is chased at once, not
 * through a sliding reference, and the closure is never capped below the rate chosen. Since V2.145 a leg to a place more than
 * FREE_MOVE_FT from the aircraft he flies off, not a rejoin's, has no closure cap and slows with power and the boards (TS-128). With `closeIn` (the tracker's run-in after a hand-over, or a move that starts inside
 * the hand-over range) every leg is at the close-in rate (Patrick 06:24Z). `rejoinBankDeg` replaces a rejoin leg's own cap
 * (the 4-ship's: the G rule only, Patrick 06:16Z item 1).
 */
export function onClosure(phases, { closeIn: allCloseIn = false, rejoinBankDeg = null } = {}) {
  const closeIn = closureNow().ftps;
  const rejoin = rejoinClosureNow().ftps;
  return phases.map((p) => {
    const out = Math.hypot(p.slot.fwd, p.slot.left);
    const long = out > LONG_SLOT_FT;
    const free = !allCloseIn && !p.rejoin && p.targetBankDeg == null && out > FREE_MOVE_FT;
    const closureFtps = p.closureFtps ?? (free ? FREE_CLOSURE_KT * KT_TO_FTPS : !allCloseIn && (p.rejoin || long) ? rejoin : closeIn);
    const bankCapDeg = p.rejoin ? rejoinBankDeg ?? p.bankCapDeg : long || free ? WING_BANKS.kickOutBankCapDeg : (p.bankCapDeg ?? WING_BANKS.closeBankCapDeg);
    const fwdRate = p.targetBankDeg != null ? p.fwdRate : Infinity;
    const latRate = p.targetBankDeg != null ? p.latRate : Infinity;
    return {
      ...p,
      closureFtps,
      bankCapDeg,
      fwdRate,
      latRate,
      vrelMax: Math.max(p.vrelMax ?? 0, closureFtps),
      ...(free ? { slowStage: p.slowStage ?? 'boards' } : {}),
    };
  });
}

/** How far #2 (world x, y) is from a slot ({ fwd, left }) in the frame of L, horizontally, feet. */
export function offSlotFt(L, x, y, slot) {
  const rel = relativeTo(L, { xFt: x, yFt: y });
  return Math.hypot(rel.fwd - slot.fwd, rel.left - slot.left);
}

/** A recorded flight seen from step k on: at(n) is the original's at(n + k). */
export const fromStep = (rec, k) => ({ t0: rec.t0 + k * dt, at: (n) => rec.at(n + k) });

/** The aircraft as a line's pose left it: the hand-over state. */
export function wingFromPose(wing, pose) {
  const a = copyAircraft(wing);
  applyPose(a, pose);
  return a;
}
