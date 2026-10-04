// Climb out (TF-R6, Patrick 4 Oct 17:20Z): a jet that has gone below the hard deck has lost the fight. It stops fighting,
// rolls wings level and climbs back above the deck, then flies level there. Climb angle and the height above the deck
// are model settings (estimates).
import { TUNING } from '../setup.js';
import { levelOffG } from './common.js';

/** Wings level, climbing at climbOutDeg until climbOutAboveDeckFt over the deck, then level there. */
export function controlClimbOut(ctx) {
  const { ac, p, f } = ctx;
  const target = f.altFt < p.hardDeckFt + TUNING.climbOutAboveDeckFt ? TUNING.climbOutDeg * Math.PI / 180 : 0;
  return { g: Math.max(levelOffG(ctx, target), 0), bankRad: 0, prefer: ac.bankRad >= 0 ? 1 : -1, throttle: 1 };
}

/** The jet that went below the deck stops fighting and climbs out. */
export function startClimbOut(ac, why) {
  const c = ac.ctl;
  c.mode = 'climbOut'; c.next = null; c.forceG = null; c.capture = false; c.level = false; c.levelAltFt = null;
  ac.move = 'climbOut';
  ac.why = why;
}
