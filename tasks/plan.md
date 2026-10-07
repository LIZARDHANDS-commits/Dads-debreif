# Implementation Plan: 3D Tactical Maneuver Guidance & Decoupling

## Overview
Wire the 3D lift vector guidance law (`liftTowardAim` and `gAndBankForLift` from `src/core/point-mass.js`) into the dedicated tactical aerobatic maneuvers: the Lag Roll (`lag-roll.js`) and the Rolling Rejoin (`rolling-rejoin.js`). This enables continuous over-the-top trajectory pulls past $90^\circ$ bank without 2D Euler gimbal lock, maintains positive G and line-of-sight pointing throughout, and strictly protects doctrinal boundaries (dedicated button triggers only; standard formation changes never roll unprompted).

## Architecture Decisions

1. **Continuous 3D Lift Guidance ("Put the lift vector where you want to go"):**
   - Replace 1D Euler pitch/yaw nose tracking with true 3D lift vector pointing using `liftTowardAim(vHat, toAim, vFtps, gainPerSec)`.
   - `toAim` is the vector in world coordinates from the aircraft to the dynamic 3D lag point (above and behind Lead's six) or rejoin line intercept.
   - Decompose the continuous 3D lift vector into normal load factor ($G$) and bank angle ($\phi$) via `gAndBankForLift(lift, vHat, up)`.
   - Because the lift vector points perpendicular to the wings out the canopy top ($+\hat{z}_{\text{body}}$), the guidance law naturally rolls the aircraft and pulls through the vertical over the top while keeping Lead in the canopy glass.

2. **Gimbal-Lock Free Aerobatics Past $90^\circ$:**
   - Flying on the point-mass model (`stepPointMass`) with carried normal `upFrom` prevents Euler angle singularities ($\theta = \pm 90^\circ$) and numerical instability at the apex of vertical rolls.
   - The aircraft maintains positive G ($G \ge 1.0$) throughout the over-the-top pull, satisfying canopy-to-canopy geometry (SMM 12.29 / 14.8).

3. **Strict Doctrinal Decoupling (Patrick's 6 Oct 16:22Z Ruling):**
   - Rolls are separate, dedicated buttons (`lagRoll` button and `TRJ + roll` selection).
   - Standard formation changes (`change('fw')`, `change('lab')`, `change('echelon')`, `change('route')`, `change('astern')`) use standard proportional closure and bank within envelope gates, and NEVER trigger automatic or unprompted over-the-top rolls.
   - Chooser races (`chooser.js`) race rolls only when explicitly requested by the user.

---

## Task List

### Phase 1: Lag Roll 3D Lift Guidance (`lag-roll.js`)
- [x] **Task 3.1: Wire 3D Lift Vector Guidance into `lag-roll.js`**
  - Define dynamic 3D aim vector `toAim` targeting the lag point (up and back from Lead's six) during the climb and roll, transitioning to the opposite fighting wing slot.
  - Wire `liftTowardAim` and `gAndBankForLift` into `flyPmRoll` in place of 1D nose tracking.
  - Verify roll pulls over the top inverted, maintains $G \ge 1.0$ and positive canopy sightline, and rolls out wings-level in the fighting wing cone on the opposite side.

### Phase 2: Rolling Rejoin 3D Lift Guidance (`rolling-rejoin.js`)
- [x] **Task 3.2: Wire 3D Lift Guidance into `rolling-rejoin.js`**
  - Apply `liftTowardAim` and `gAndBankForLift` to candidate rolls in `flyRoll` (barrel roll and high yo-yo shapes).
  - Target the 3D trajectory toward the turning rejoin entry tangent while staying outside Lead's 500 ft bubble.
  - Ensure seamless handover from the roll-out state into the turning rejoin line search (`searchTurningRejoin`).

### Phase 3: Doctrinal Decoupling & Regression Verification
- [x] **Task 3.3: Doctrinal Decoupling & Regression Verification**
  - Verify that standard formation changes (`f.change(...)`) are strictly prevented from executing rolls unprompted.
  - Verify `transitions.test.js` (4/4), `canopy.test.js` (10/10), and tactical tests pass green.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Lift pointing instability near aim point (chatter as distance $\to 0$) | High | Apply deadband and gain tapering as aircraft enters proximity sphere ($< 50$ ft) of the aim point. |
| Inadvertent trigger of rolls during standard formation changes | Critical | Guard chooser candidate list so rolling planners only run when `rejoin === 'roll'` or `to === 'lagRoll'`. |
| Excessive G onset or stick shaker breach at roll apex | Medium | Clamp commanded lift to shaker G envelope (`shakerG(kias) * shakerShare`) via existing envelope gate. |

## Open Questions
- None. Requirements, geometry, and doctrinal boundaries are fully defined by SMM 12.29/14.8 and Patrick's rulings.
