// The aircraft a pass can be flown with (spec, "How it flies"; RS-4, RS-Q1). Each entry gathers the one performance set
// core already holds for that aircraft, in the shape the pass engine (pass.js) and its pilot (pilot.js) read: nothing
// here is a new number or a new formula. Adding an aircraft (the C-130J for the cargo offload, once its performance set
// is approved, RS-Q1) means adding one entry here and listing it on a run in defaults.js.
import {
  excessFnFor, stallLimitG, rollWithinT6A, T6A_G_ONSET, T6A_G_ONSET_CEILING_GPS, T6A_LIMITS, T6A_MANOEUVRE, maxKiasT6A,
  attitudeDegFromClimb,
} from '../../core/t6-performance.js';

/**
 * The CT-156 Harvard II on the T-6A performance set (core t6-performance.js), the set Traffic, the Formation and the EP
 * Tabletop fly:
 *  - excessFn(throttle): (thrust − drag) ÷ weight for the point-mass step at part throttle (excessFnFor);
 *  - stallG(kias): the stall line, the most G the wing gives (stallLimitG, stall 86 KIAS, Patrick 30 Sep): a physical
 *    limit, always held;
 *  - roll(limits, ktas): a pilot's roll held under the aircraft's (rollWithinT6A, estimates, ALL-39);
 *  - gOnset: the G onset in easeValue's shape (T6A_G_ONSET, 4 G/s, an estimate), never past ALL-40's 6 G/s ceiling;
 *  - gLimit, rollingGLimit, maxKias(alt): the published limits (7 G, 4.7 G rolling, VMO 316 or Mmo 0.67): flagged on the
 *    card, never walls (RS-6);
 *  - stallKias and shakerKias: the stall speed and the stick shaker's (stall + T6A_MANOEUVRE's 7 kt, an estimate), the
 *    lowest airspeed's reference on the card;
 *  - attitudeDeg: the nose attitude the model is drawn at (attitudeDegFromClimb).
 */
const CT156 = Object.freeze({
  id: 'ct156',
  name: 'Harvard (CT-156)',
  performanceSet: 'T-6A',
  model: 'ct156',
  cockpit: true,
  excessFn: (throttle) => excessFnFor(throttle),
  stallG: (kias) => stallLimitG(kias),
  roll: (limits, ktas) => rollWithinT6A(limits, ktas),
  gOnset: Object.freeze({
    maxRateDps: Math.min(T6A_G_ONSET.maxRateDps, T6A_G_ONSET_CEILING_GPS),
    maxAccelDps2: T6A_G_ONSET.maxAccelDps2,
  }),
  gLimit: T6A_LIMITS.maxG,
  rollingGLimit: T6A_LIMITS.rollingMaxG,
  maxKias: (altFt) => maxKiasT6A(altFt),
  stallKias: T6A_LIMITS.stallKias,
  shakerKias: T6A_LIMITS.stallKias + T6A_MANOEUVRE.shakerMarginKt,
  attitudeDeg: attitudeDegFromClimb,
});

export const AIRCRAFT = Object.freeze({ ct156: CT156 });
