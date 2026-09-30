// The wording of the warning beside each G box (SPEC-turn-fight, "T-6 limit
// warning (simple mode)"). The stall line is G = (speed / 86 kt)², the
// sea-level stall line of the T-6A V-n diagram, and the aircraft is limited to
// 7 G; both come from core's shared T-6A model (core/t6-performance.js), which
// this module builds none of. The simple mode has no altitude, so its speed is
// taken as sea level, where true and indicated airspeed agree.
import { T6A_LIMITS, stallLimitG } from '../../core/t6-performance.js';

const T6_MAX_G = T6A_LIMITS.maxG;

// 4 G, or 1.95 G when a second decimal is needed to tell it from the limit.
const gText = (g) => (Math.abs(g * 10 - Math.round(g * 10)) < 1e-9 ? g.toFixed(1) : String(Number(g.toFixed(2))));
const floorTenth = (g) => (Math.floor(g * 10 + 1e-9) / 10).toFixed(1);

/**
 * The warning for a set speed and G, or null when the G is inside the limit.
 * The fight still flies whatever was set (as V6 does); this only says so.
 */
export function limitWarning(speedKt, g) {
  if (!(speedKt > 0) || !Number.isFinite(speedKt) || !Number.isFinite(g)) return null;
  const stall = stallLimitG(speedKt);
  if (stall < T6_MAX_G) {
    if (g > stall + 1e-9) return `${gText(g)} G is above the T-6's stall limit at ${speedKt} kt (${floorTenth(stall)} G)`;
    return null;
  }
  return g > T6_MAX_G + 1e-9 ? `Above the T-6's ${T6_MAX_G} G limit` : null;
}
