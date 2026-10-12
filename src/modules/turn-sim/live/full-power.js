// A wingman is held to what the aircraft can do (decision TS-63; Patrick 5 Oct 2026 02:48Z: "If they get stretched they
// just have to show it in their tag and fix it as best as they can once the maneuver ever finishes"): a speed-up is never
// faster than full power gives at that speed, height and G (core excessThrustPerWeight, the same curve as slow-down.js
// fullPowerKtps), with a climb paid for out of the same excess (standard aerodynamics: dV/dt = g ((T - D) / W - sin(climb
// angle))). What is left here is that limit, read by the lag roll (lag-roll.js). #2 in fluid manoeuvring flew by energy
// and geometry here (flyFluidStep, TS-74, V2.69) until the Planned method was retired (Patrick, 12 Oct 2026, "Retire
// Planned"); Live flies him now (fluid-wing-live.js). Formation Sim only: the core curves are used, not changed.
//
// Units: feet, seconds, KIAS.
import { G_FTPS2 } from '../../../core/units.js';
import { fullPowerKtps } from './slow-down.js';

/** KIAS per second the climb costs at climb rate climbFtps (energy height, standard aerodynamics: g x climb / V, in KIAS terms). */
export function climbKtps(climbFtps, tasFtps, kias) {
  return ((G_FTPS2 * (climbFtps ?? 0)) / Math.max(tasFtps, 1)) * (kias / Math.max(tasFtps, 1));
}

/** The most a pose may speed up (KIAS per second): full power at its speed, height and G, less what its climb costs. */
export function speedUpLimitKtps(kias, altFt, g, climbFtps, tasFtps) {
  return fullPowerKtps(kias, altFt, g) - climbKtps(climbFtps, tasFtps, kias);
}
