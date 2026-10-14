// The wingman's hand: close-formation pressure-sized inputs (B1, TS-226; spec 7b.4) and fighting-wing urgency shaper (B5, B14; spec 7e.10).
// Exports: startHand, shape, shapeFwLift.
// Imports: core/angles, live/flight, live/wing-moves, live/attitude.
// Depended on by: live/wingman/close-formation.js, live/wingman/fighting-wing.js.
//
// Close formation (startHand, shape) limits the pilot's hand to fingertip pressures for the job (supervisor.js): G off
// Lead's motion, bank off Lead's, torque off the holding setting (CLOSE_WING), leaving T-6A roll/G onset to stepLead.
// Fighting wing (shapeFwLift, B14, D18, S45) modulates #2's G onset rate by urgency u in [0, 1] from 1.0 G/s (smooth
// station-keeping) up to 4.0 G/s (guard / nose-behind urgency: 1 + 3u G/s, FW_WING.onsetMinGps..onsetMaxGps) while
// preserving the lift unit vector so roll commands are unaffected.
//
// Signs and units as close-formation.js and fighting-wing.js. The memory is never changed in place.
import { DEG } from '../../../../core/angles.js';
import { STEP_SEC } from '../flight.js';
import { CLOSE_WING, FW_WING } from '../wing-moves.js';
import { len3, scale3 } from '../attitude.js';

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
  // His corrections are sized around the setting the turn needs (the holding power and the power lead, B2), not around the
  // holding power alone: the lead is what he puts in for the turn he sees coming, not a correction.
  const base = want.basePct ?? want.holdPct;
  const sized = clamp(want.torquePct, base - caps.torqueCapPct, base + caps.torqueCapPct);
  const flags = { outOfPower: want.torquePct > 100 || want.torquePct < C.boardsBelowPct, boards: sized < C.boardsBelowPct };
  const aim = clamp(sized, C.boardsBelowPct, 100);
  // While he sees Lead rolling his hand moves at the telegraph's rate, times how much further out than echelon his place is
  // (B3: route about 3.3 times, so a 60° roll-in away from him, which needs about MAX from its start, gets MAX in about 0.7 s,
  // not 2 s: Patrick 13 Oct 2026, "If I know I need a lot more energy I might give it a few seconds of MAX power"; the
  // engine answers 0 to 100% in about 0.2 s, TS-108, TS-218).
  const torquePct = toward(mem.torquePct, aim, want.telegraph ? Math.max(j.torquePctps, C.telegraphTorquePctps * (want.reach ?? 1)) : j.torquePctps);
  const held = {
    plane: upCorrG !== want.upCorrG,
    side: leftCorrG !== want.leftCorrG,
    fore: Math.abs(torquePct - want.torquePct) > 0.01, // held to its size, its floor or MAX, or still moving at its rate
  };
  return { mem: { upCorrG, leftCorrG, torquePct, caps, held }, flags };
}

/**
 * Fighting-wing urgency shaper (B14, D18, S45; spec 7e.10): modulates #2's G onset rate by urgency u in [0, 1]
 * from W.onsetMinGps (1.0 G/s, smooth station-keeping) up to W.onsetMaxGps (4.0 G/s, guard / nose-behind urgency:
 * 1 + 3u G/s), scaling the lift vector magnitude while preserving its unit direction so roll commands are unchanged.
 */
export function shapeFwLift(prevG, lift, urgency = 0, dt = STEP_SEC, W = FW_WING) {
  const u = clamp(urgency ?? 0, 0, 1);
  const onsetGps = W.onsetMinGps + (W.onsetMaxGps - W.onsetMinGps) * u;
  const wantG = len3(lift);
  const baseG = prevG ?? wantG;
  const shapedG = baseG + clamp(wantG - baseG, -onsetGps * dt, onsetGps * dt);
  return {
    lift: wantG > 1e-9 ? scale3(lift, shapedG / wantG) : lift,
    shapedG,
    onsetGps,
  };
}

