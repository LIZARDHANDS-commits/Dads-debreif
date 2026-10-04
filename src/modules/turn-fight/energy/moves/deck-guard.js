// The deck guard for every move but the chase (the chase has its own, inside its aim). Below the hard deck loses the
// fight (TF-R6), so a pilot does not let a dive carry it there: when the height the dive would bottom out at
// (deckDropFt: rolling upright first, then the pull-out circle) is under the deck, the pilot rolls the lift up to the
// vertical and pulls what the wing gives until the nose is back on the horizon. The deck stays a reference, not a wall:
// the physics still decides where the jet goes.
import { KT_TO_FTPS, G_FTPS2 } from '../../../../core/units.js';
import { availableG } from '../../../../core/t6-performance.js';
import { gAndBankForLift } from '../../../../core/point-mass.js';
import { TUNING } from '../setup.js';
import { scale, sub, unit, velOf } from '../frame.js';
import { deckDropFt } from './common.js';

/** The move's command `cmd`, or a pull-out when the dive would bottom out under the deck. */
export function guardDeck(ctx, cmd) {
  const { ac, p, f, kias, shaker } = ctx;
  const c = ac.ctl;
  if (c.mode === 'pursuit' || ac.stall || ac.tumble || c.forceG != null) { c.deckGuard = false; return cmd; }
  const cap = Math.max(1, Math.min(shaker, availableG(kias, true, p.stallKias)));
  if (!c.deckGuard) {
    if (f.climbRad >= 0) return cmd;
    // The pull-out G is what the wing gives at the speed the dive will have gained by then (energy: v² + 2 g × drop),
    // not at today's speed: a slow jet starting a split S has little G now and plenty at the bottom.
    const firstDropFt = deckDropFt(ctx, Math.max(cap - 1, 0.5));
    const vFtps = f.ktas * KT_TO_FTPS;
    const bottomKias = kias * Math.sqrt(1 + 2 * G_FTPS2 * firstDropFt / (vFtps * vFtps));
    const bottomCap = Math.max(1, availableG(bottomKias, true, p.stallKias));
    if (f.altFt - deckDropFt(ctx, Math.max(bottomCap - 1, 0.5)) >= p.hardDeckFt + TUNING.deckGuardAboveFt) return cmd;
    c.deckGuard = true;
  } else if (f.climbRad >= 0) {
    c.deckGuard = false; // the nose is back on the horizon: the move flies again
    return cmd;
  }
  const vHat = unit(velOf(ac.pm));
  const up = sub({ x: 0, y: 0, z: 1 }, scale(vHat, vHat.z)); // up in the vertical plane of the path
  const { g, bankRad } = gAndBankForLift(scale(unit(up), cap), vHat, ac.pm.up, ac.bankRad);
  return { ...cmd, g, bankRad, prefer: bankRad >= 0 ? 1 : -1 };
}
