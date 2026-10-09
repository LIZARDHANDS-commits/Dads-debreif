// Canopy Line-of-Sight & Cockpit Upright Normal (SMM 12.24 & 16.20).
//
// In military formation doctrine, diving onto Lead from above with your belly or wings
// masking Lead is strictly prohibited due to extreme collision risk.
// Inside 1,200 ft, Lead must remain in the upper windscreen/canopy glass:
//   LOS · c_canopy >= 0
// Zero blind time permitted inside 1,200 ft.

import { degToRad } from './angles.js';

/**
 * Calculates the 3D unit vector pointing straight out the canopy roof (cockpit upright axis).
 * @param {number} headingRad - Math heading radians (counter-clockwise from east, or 0 along x)
 * @param {number} pitchDeg - Pitch angle in degrees (nose up positive)
 * @param {number} bankDeg - Bank angle in degrees (right wing down positive)
 * @returns {{ x: number, y: number, z: number }} Unit vector normal to canopy
 */
export function canopySightVector(headingRad, pitchDeg = 0, bankDeg = 0) {
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
export function canopyLosDot(lead, wing) {
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

/**
 * Validates doctrinal canopy and step-down safety invariants for a 2-ship pair.
 * Invariants:
 *  - Outside 2,000 ft: open arena (brief loss <= 3.0 s permitted during tactical checks).
 *  - Inside 2,000 ft: Step-Down Gate (z_wing <= z_lead + 5 ft).
 *  - Inside 1,200 ft: Canopy "X" Lock (LOS · c >= 0, zero blind time).
 *  - Inside 1,000 ft: 3/9 Line Gate (fwd <= 0 ft relative to Lead).
 *
 * @param {{ xFt: number, yFt: number, altAboveFt?: number, headingRad: number }} lead
 * @param {{ xFt: number, yFt: number, altAboveFt?: number, headingRad: number, pitchDeg?: number, bankDeg?: number }} wing
 * @returns {{ ok: boolean, rangeFt: number, stepDownOk: boolean, canopyOk: boolean, laneOk: boolean, reason?: string }}
 */
export function checkDoctrinalInvariants(lead, wing) {
  const dx = wing.xFt - lead.xFt;
  const dy = wing.yFt - lead.yFt;
  const dz = (wing.altAboveFt ?? 0) - (lead.altAboveFt ?? 0);
  const rangeFt = Math.hypot(dx, dy, dz);

  // 1. Step-down check: inside 2,000 ft, Wing must be at or below Lead + 5 ft
  const stepDownOk = rangeFt >= 2000 || dz <= 5.0;

  // 2. Canopy check: inside 1,200 ft, Lead must remain in upper canopy glass
  const canopyOk = rangeFt >= 1200 || isLeadInCanopy(lead, wing);

  // 3. 3/9 Line check: inside 1,000 ft, Wing must remain behind Lead's 3/9 line
  const fwd = dx * Math.cos(lead.headingRad) + dy * Math.sin(lead.headingRad);
  const laneOk = rangeFt >= 1000 || fwd <= 0.0;

  let reason = null;
  if (!stepDownOk) reason = `Step-down violated: Wing is ${dz.toFixed(1)} ft above Lead inside ${rangeFt.toFixed(0)} ft range`;
  else if (!canopyOk) reason = `Canopy lock violated: Lead masked under cockpit floor inside ${rangeFt.toFixed(0)} ft range`;
  else if (!laneOk) reason = `3/9 line penetrated: Wing is ahead of Lead's 3/9 line inside ${rangeFt.toFixed(0)} ft range`;

  return {
    ok: stepDownOk && canopyOk && laneOk,
    rangeFt,
    stepDownOk,
    canopyOk,
    laneOk,
    reason,
  };
}
