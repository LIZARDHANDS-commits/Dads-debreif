// The moves: starting one, handing a pitch back or slice to the MPT, starting a pursuit, and which controller
// flies the aircraft's current mode. Each move's controller is its own file in this folder and returns
// { g, bankRad, prefer, throttle }; a move that has ended sets ctl.next and the pilot hands it over.
import { degToRad } from '../../../../core/angles.js';
import { SLICE_BANK_AT_MPT_DEG, SLICE_BANK_AT_100_DEG, SLICE_ENTRY_LOW_KIAS, MOVE_LABELS } from '../setup.js';
import { lerpHeld, carriedBankFor, rollSideSign } from '../frame.js';
import { controlBankMove } from './bank-move.js';
import { controlImmelmann } from './immelmann.js';
import { controlSplitS } from './split-s.js';
import { controlLowYoYo } from './low-yo-yo.js';
import { controlHighYoYo } from './high-yo-yo.js';
import { controlMpt } from './mpt.js';
import { controlPursuit, tacticalAimCalculation } from './pursuit.js';
import { controlClimbOut } from './climb-out.js';
export { isRolling, willRoll } from './common.js';

// ── Moves: start and controllers ────────────────────────────────────────────

/**
 * Puts an aircraft into a move: resets the move's own memory and gives the
 * reason the screen shows. `ac.move` is the name the screen shows; `ctl.mode` is
 * what the controller flies. They differ after a pitch back or slice hands to
 * the MPT: it flies the MPT at once but keeps its name until the speed is
 * within 5 kt of the MPT speed.
 */
export function startMove(state, ac, move, why, kias) {
  const p = state.setup;
  const c = ac.ctl;
  c.t = 0; c.turnDeg = 0; c.mptTurnDeg = 0; c.phase = 'main'; c.mode = move;
  c.entryKias = kias;
  c.halfUntilShaker = false; c.capture = false; c.level = false; c.levelAltFt = null; c.down = false;
  c.upZ0 = Math.sign(ac.pm.up.z) || 1;
  c.prefer = rollSideSign(ac);
  ac.move = move; ac.moveLabel = MOVE_LABELS[move]; ac.why = why;
  const dir = ac.turnDir;
  switch (move) {
    case 'pitchBack': {
      const bank = lerpHeld(kias, 160, p.pitchBackBank160Deg, 220, p.pitchBackBank220Deg);
      c.holdBankRad = carriedBankFor(ac.pm, degToRad(bank), dir);
      break;
    }
    case 'slice': {
      const bank = lerpHeld(kias, p.mptKias, SLICE_BANK_AT_MPT_DEG, SLICE_ENTRY_LOW_KIAS, SLICE_BANK_AT_100_DEG);
      c.holdBankRad = carriedBankFor(ac.pm, degToRad(bank), dir);
      break;
    }
    case 'immelmann': case 'splitS':
      c.holdBankRad = carriedBankFor(ac.pm, 0, dir); // wings level, whichever way up the carried frame is
      if (move === 'splitS') c.phase = 'pitchUp';
      break;
    case 'lowYoYo':
      c.phase = 'dive';
      c.holdBankRad = ac.bankRad ?? 0;
      break;
    case 'highYoYo':
      c.phase = 'climb';
      c.holdBankRad = ac.bankRad ?? 0;
      break;
    case 'mpt':
      c.halfUntilShaker = kias > p.mptKias; // rolling straight in from above its speed: PCL to mid-range until the shaker
      break;
    default: break;
  }
}

/** A pitch back or slice has found the MPT speed: fly the MPT's capture law from here, under the move's own name. */
export function handToMpt(ac) {
  const c = ac.ctl;
  c.mode = 'mpt'; c.capture = true; c.t = 0; c.mptTurnDeg = 0;
  c.halfUntilShaker = false; c.level = false; c.levelAltFt = null;
  c.mptEvalTimer = 0;
}

/** From the first nose-on the chaser flies pursuit, for the rest of the fight. */
export function startPursuit(state, ac) {
  const c = ac.ctl;
  c.mode = 'pursuit'; c.next = null;
  c.halfUntilShaker = false; c.capture = false; c.level = false; c.levelAltFt = null;
  c.forceG = null; c.chaseLimited = false;
  ac.move = 'pursuit'; ac.moveLabel = MOVE_LABELS.pursuit;
  const other = ac.who === 'blue' ? state.red : state.blue;
  if (state.setup.pursuit === 'tactical') {
    const calc = tacticalAimCalculation(state.setup, other, ac);
    ac.why = `${calc.label} after first nose-on`;
  } else {
    ac.why = `${{ pure: 'Pure', lead: 'Lead', lag: 'Lag' }[state.setup.pursuit]} pursuit after first nose-on`;
  }
}

/** The controller for the aircraft's current mode, returning { g, bankRad, prefer, throttle }. */
export function controlFor(ctx) {
  switch (ctx.ac.ctl.mode) {
    case 'pitchBack': case 'slice': return controlBankMove(ctx);
    case 'immelmann': return controlImmelmann(ctx);
    case 'splitS': return controlSplitS(ctx);
    case 'lowYoYo': return controlLowYoYo(ctx);
    case 'highYoYo': return controlHighYoYo(ctx);
    case 'mpt': case 'levelMpt': return controlMpt(ctx);
    case 'pursuit': return controlPursuit(ctx);
    case 'climbOut': return controlClimbOut(ctx);
    default: return { g: 1, bankRad: 0, prefer: 1, throttle: 1 };
  }
}
