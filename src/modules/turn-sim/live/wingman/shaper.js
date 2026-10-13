// The close-formation wingman's hand (B1, TS-226; spec 7b.4, 7b.6c "Limits", 7b.6d item 6): pressure-sized inputs. It
// limits the pilot's hand only:
//  - the size of each pressure for the job he is doing (supervisor.js): G off what Lead's motion needs, bank off Lead's,
//    torque off the holding setting (Patrick 13 Oct 2026: "In close form the control movements are pressures. you fly with
//    your fingertips almost");
//  - how fast his torque may move (about 10%/s on station, quicker in a move's set and catch);
//  - a new job's sizes are eased in from the ones he has, so a change of job never steps his inputs (bumpless).
// It never applies the T-6A's roll or G onset: fluid-lead.js stepLead does that, once (7b.6d item 6). His bank is not
// smoothed: it moves as fast as the aircraft rolls (Patrick 13 Oct 2026: a wingman's bank may be "very un-smooth ... very
// quick/small as required").
// Torque: never below the boards' 10% (below it he would use the boards before idle, which the live step does not fly:
// flagged) nor above MAX; wanting more than MAX or less than 10% is "out of power", a flag for the card (7b.6d item 13).
//
// Signs and units as close-formation.js. The memory is never changed in place. Numbers: wing-moves.js CLOSE_WING.
import { DEG } from '../../../../core/angles.js';
import { STEP_SEC } from '../flight.js';
import { CLOSE_WING } from '../wing-moves.js';

const C = CLOSE_WING;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toward = (x, to, perSec) => x + clamp(to - x, -perSec * STEP_SEC, perSec * STEP_SEC);

/** The hand at the start: the inputs he already has (torquePct: his torque now) and the first job's pressure sizes. */
export function startHand({ upCorrG = 0, leftCorrG = 0, torquePct }, job) {
  const j = C.jobs[job.kind];
  return { upCorrG, leftCorrG, torquePct, caps: { gCap: j.gCap, bankCapDeg: j.bankCapDeg, torqueCapPct: j.torqueCapPct }, held: { plane: false, side: false, fore: false } };
}

/**
 * One step of his hand: what the technique wants (close-formation.js closeLaw's want), sized for the job, his torque moved
 * toward it at the job's rate. gRef: Lead's G as he sees it (a bank off Lead's is that much lift across the wing line).
 * Returns { mem (the inputs he gives this step, the sizes and which controls sit at their limit), flags: { outOfPower,
 * boards } }.
 */
export function shape(mem, want, job, gRef) {
  const j = C.jobs[job.kind];
  const caps = {
    gCap: toward(mem.caps.gCap, j.gCap, C.capsPerSec.g),
    bankCapDeg: toward(mem.caps.bankCapDeg, j.bankCapDeg, C.capsPerSec.bankDeg),
    torqueCapPct: toward(mem.caps.torqueCapPct, j.torqueCapPct, C.capsPerSec.torquePct),
  };
  const upCorrG = clamp(want.upCorrG, -caps.gCap, caps.gCap);
  const sideCap = Math.max(gRef, 0.5) * Math.sin(caps.bankCapDeg * DEG);
  const leftCorrG = clamp(want.leftCorrG, -sideCap, sideCap);
  const sized = clamp(want.torquePct, want.holdPct - caps.torqueCapPct, want.holdPct + caps.torqueCapPct);
  const flags = { outOfPower: want.torquePct > 100 || want.torquePct < C.boardsBelowPct, boards: sized < C.boardsBelowPct };
  const aim = clamp(sized, C.boardsBelowPct, 100);
  const torquePct = toward(mem.torquePct, aim, j.torquePctps);
  const held = {
    plane: upCorrG !== want.upCorrG,
    side: leftCorrG !== want.leftCorrG,
    fore: Math.abs(torquePct - want.torquePct) > 0.01, // held to its size, its floor or MAX, or still moving at its rate
  };
  return { mem: { upCorrG, leftCorrG, torquePct, caps, held }, flags };
}
