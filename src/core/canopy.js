// Canopy Line-of-Sight & Cockpit Upright Normal (SMM 12.24 & 16.20).
//
// In military formation doctrine, diving onto Lead from above with your belly or wings
// masking Lead is strictly prohibited due to extreme collision risk.
// Inside 1,200 ft, Lead must remain in the upper windscreen/canopy glass:
//   LOS · c_canopy >= 0
// Zero blind time permitted inside 1,200 ft.

import { degToRad } from './angles.js';

/**
 * The overshoot lane and the gates around Lead, one copy for this gate and the Formation Sim (moved from turn-sim
 * live/slots.js in refactor step 2; SMM 12.27 para 65; Fable review step 1). A plan passes if #2 never gets more than
 * marginFt ahead of his slot's fore and aft place while inside rangeFt of Lead (estimate); his height under Lead is
 * measured inside belowRangeFt (the step-down gate); inside canopyRangeFt Lead stays in the canopy glass.
 */
export const LANE = Object.freeze({ marginFt: 100, rangeFt: 1000, belowRangeFt: 2000, canopyRangeFt: 1200 });

/**
 * Calculates the 3D unit vector pointing straight out the canopy roof (cockpit upright axis).
 * @param {number} headingRad - Math heading radians (counter-clockwise from east, or 0 along x)
 * @param {number} pitchDeg - Pitch angle in degrees (nose up positive)
 * @param {number} bankDeg - Bank angle in degrees (right wing down positive)
 * @returns {{ x: number, y: number, z: number }} Unit vector normal to canopy
 */
function canopySightVector(headingRad, pitchDeg = 0, bankDeg = 0) {
  const theta = degToRad(pitchDeg || 0);
  const phi = degToRad(bankDeg || 0);
  const psi = headingRad || 0;

  // Nose vector (forward)
  const nx = Math.cos(theta) * Math.cos(psi);
  const ny = Math.cos(theta) * Math.sin(psi);
  const nz = Math.sin(theta);

  // Wings-level upright vector (square to nose, pointing up)
  const ux = -Math.sin(theta) * Math.cos(psi);
  const uy = -Math.sin(theta) * Math.sin(psi);
  const uz = Math.cos(theta);

  // Right-wing vector (horizontal when wings level)
  const rx = Math.sin(psi);
  const ry = -Math.cos(psi);

  // Canopy vector rotated by bank angle about nose axis
  return {
    x: Math.cos(phi) * ux - Math.sin(phi) * rx,
    y: Math.cos(phi) * uy - Math.sin(phi) * ry,
    z: Math.cos(phi) * uz,
  };
}

/**
 * Line of sight dot product between Wing's canopy normal and Lead's relative position.
 * Returns > 0 when Lead is in the canopy glass / windscreen (visible),
 * or < 0 when Lead is masked by the cockpit floor, belly, or wings (blind).
 *
 * @param {{ xFt: number, yFt: number, altAboveFt?: number }} lead
 * @param {{ xFt: number, yFt: number, altAboveFt?: number, headingRad: number, pitchDeg?: number, bankDeg?: number }} wing
 * @returns {number} Dot product of LOS vector and canopy normal
 */
function canopyLosDot(lead, wing) {
  const dx = lead.xFt - wing.xFt;
  const dy = lead.yFt - wing.yFt;
  const dz = (lead.altAboveFt ?? 0) - (wing.altAboveFt ?? 0);
  const c = canopySightVector(wing.headingRad, wing.pitchDeg ?? 0, wing.bankDeg ?? 0);
  return dx * c.x + dy * c.y + dz * c.z;
}

/**
 * Determines whether Lead is visible in Wing's upper canopy glass.
 * @param {{ xFt: number, yFt: number, altAboveFt?: number }} lead
 * @param {{ xFt: number, yFt: number, altAboveFt?: number, headingRad: number, pitchDeg?: number, bankDeg?: number }} wing
 * @returns {boolean} True if Lead is in canopy field of view (LOS · c >= 0)
 */
export function isLeadInCanopy(lead, wing) {
  return canopyLosDot(lead, wing) >= 0;
}
