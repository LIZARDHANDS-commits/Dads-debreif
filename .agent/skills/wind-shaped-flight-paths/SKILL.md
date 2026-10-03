---
name: wind-shaped-flight-paths
description: Synthesizes smooth, aerodynamically authentic, wind-compensated flight trajectories (kinematic rails) for patterns, turns, breaks, circuits, and forced landings. Use when creating flight simulator paths, UAV routes, or air traffic patterns that must look physically realistic, match pilot boundary conditions (attitude/crab), and hit spatial targets (runway centerline, threshold) exactly under variable wind conditions.
---

# Wind-Shaped Kinematic Flight Paths

## 1. Overview & Core Philosophy

Standard trajectory generation in simulators typically falls into one of three traps:
1. **Open-Loop / PID Physics Steering**: Aircraft suffer crab oscillation, S-turning, overshoot on final, or crash short of thresholds under changing wind fields.
2. **Pure Geometric Splines (Bézier / Hermite)**: Look robotic and artificial, with instantaneous attitude snaps, zero centrifugal drift, and disregard for aerodynamic G-limits.
3. **Robotic Discrete State Machines**: Dividing continuous 3D maneuvers into disjointed stages with artificial wait timers (e.g. "climb → wait 1.5s wings level → re-bank to turn to perch"), creating unnatural stop-and-go behavior, attitude jitter, and fragile brittle test suites. Continuous aerodynamic maneuvers must be formulated as closed-loop functions of altitude error, heading error, and wind-relative geometry.

**Kinematic Rail Synthesis** solves this by pre-computing a continuous, physically authentic trajectory where:
- Aerodynamic equations of motion ($G$, bank $\phi$, turn rate $\omega$, airspeed $V$) govern the path.
- Wind drift is integrated forward along maneuvers.
- Spatial targets (runway centerline, final gates, threshold) are achieved with **zero miss distance** by backward-inverting wind drift.
- Boundary conditions (crab angles on entry and rollout) match incoming and outgoing legs smoothly.
- Every waypoint embeds rich flight telemetry (`alt`, `kt`, `headingDeg`, `bankDeg`, `g`, `phase`) so 3D aircraft and cockpit instruments render authentic physics directly from the rails.

---

## 2. When to Use

### Use Kinematic Rails For:
- Standard visual traffic patterns (Overhead Break, Closed Pattern, Downwind, Perch, Final).
- Instrument approach procedures and published transitions.
- Forced landing patterns (PFL / Flameout approach from High Key to Touchdown).
- Formation join-ups, station-keeping tracks, and scheduled air traffic routes.

### Do NOT Use Kinematic Rails For:
- Unscripted combat dogfighting (1v1 BFM / ACM).
- Dynamic breakout maneuvers, stall recovery, or collision avoidance evasive breaks.
- Direct human stick / throttle flight control inputs.

---

## 3. The 7 Architectural Pillars

### Pillar 1: Aerodynamic Boundary Condition Matching
In real flying, an aircraft does not instantaneously swing its nose parallel to a new leg before turning. At the perch or pattern entry, it arrives with a drift-corrected crab angle $\psi_{\text{entry}}$. On final approach or rollout, it must exit with the runway's drift-corrected crab angle $\psi_{\text{exit}}$.

$$\sin(\beta) = \frac{W_{\text{cross}}}{V_{\text{TAS}}} \implies \psi_{\text{crab}} = \text{Track} + \arcsin\left(\frac{W_x \cos(\text{Track}) - W_y \sin(\text{Track})}{V_{\text{TAS}}}\right)$$

The turn generator must take $\psi_{\text{entry}}$ and $\psi_{\text{exit}}$ as first-class constraints and integrate across the total heading change:
$$\Delta \psi_{\text{total}} = \text{wrap180}(\psi_{\text{exit}} - \psi_{\text{entry}})$$

### Pillar 2: Wind-Drift Vector Integration
Forward integration along the turn arc uses discrete time steps $\Delta t$ ($0.1\text{ s} - 0.25\text{ s}$):

$$\vec{V}_{\text{ground}}(t) = \vec{V}_{\text{TAS}}(t) + \vec{W}$$

$$x(t + \Delta t) = x(t) + \left(V_{\text{TAS}} \sin\psi(t) + W_x\right) \Delta t$$

$$y(t + \Delta t) = y(t) + \left(V_{\text{TAS}} \cos\psi(t) + W_y\right) \Delta t$$

### Pillar 3: Dynamic Intermediary Leg Endpoints (The Downwind Leg Theorem)
When an intermediary leg (e.g., Downwind) connects two dynamic turns (e.g., Overhead Break and Final Turn), its endpoints must be derived dynamically:

```
[ Runway / Initial ]
       │
  (Overhead Break) ── forward arc + wind drift ──► [ Start Point: Break Rollout ]
                                                              │
                                                       (Downwind Leg)
                                                      Track τ, crab β
                                                              │
  [ Target: Final Centerline ] ◄── final turn drift ──── [ End Point: Dynamic Perch ]
```

1. **Start Point (Forward Simulation)**:
   Simulate the entry maneuver forward from its runway start point to determine where the pilot rolls out wings-level under the prevailing wind:
   $$\vec{P}_{\text{start}} = \vec{P}_{\text{rollout}} = \vec{P}_{\text{break\_entry}} + \int_0^{T_{\text{break}}} (\vec{V}_{\text{TAS}}(t) + \vec{W})\,dt$$

2. **End Point (Backward Target Inversion)**:
   Determine where the final turn must begin so that wind drift lands the rollout precisely on the extended centerline:
   $$\vec{D}_{\text{final\_turn\_drift}} = \vec{W} \cdot T_{\text{final\_turn}}$$
   $$\vec{P}_{\text{end}} = \vec{P}_{\text{perch\_actual}} = \vec{P}_{\text{nominal\_perch}} - \vec{D}_{\text{final\_turn\_drift}}$$
   - Crosswind pushing toward runway $\to$ Perch shifts outward (wider).
   - Crosswind pushing away from runway $\to$ Perch shifts inward (closer).
   - Headwind on final $\to$ Perch shifts downwind (closer to threshold).
   - Tailwind on final $\to$ Perch shifts upwind (further from threshold).

3. **Connecting Ground Track**:
   Connect $\vec{P}_{\text{start}}$ to $\vec{P}_{\text{end}}$ along ground track $\tau$:
   $$\vec{T} = \vec{P}_{\text{end}} - \vec{P}_{\text{start}}, \quad \tau = \text{atan2}(T_x, T_y)$$
   The aircraft flies this leg crabbed into the wind: $\psi = \tau + \beta$.

### Pillar 4: Coordinated Turn Dynamics & G-Load Laws
Bank angle $\phi$, turn rate $\omega$, and load factor $G$ must adhere to standard aerodynamics:

$$\omega = \frac{g \cdot \tan\phi}{V_{\text{TAS}}} \quad (\text{rad/s}), \qquad G = \frac{1}{\cos\phi}$$

- **Overhead Break**: 2.0 G pull at $60^\circ$ bank, decelerating from $200 \to 140\text{ KIAS}$.
- **Descending Final Turn**: $30^\circ - 35^\circ$ bank ($1.15 - 1.22\text{ G}$) descending at a stabilized rate.

### Pillar 5: Roll-In & Roll-Out Blending (Attitude Smoothing)
Prevent instantaneous roll snaps by applying sinusoidal or linear ramp transitions over the first and last 15% of the total turn progress $u \in [0, 1]$:

$$\phi(u) = \phi_{\text{target}} \cdot \begin{cases} 
\sin\left(\frac{u}{0.15} \cdot \frac{\pi}{2}\right) & u < 0.15 \\
1.0 & 0.15 \le u \le 0.85 \\
\sin\left(\frac{1 - u}{0.15} \cdot \frac{\pi}{2}\right) & u > 0.85 
\end{cases}$$

### Pillar 6: Elevation Clamping & Glide Gradients
Descent along curving turns or straight glides must be parameterized by cumulative path distance $s$, clamping cleanly to runway threshold elevation $z_{\text{th}}$:

$$z(s) = z_{\text{start}} - (z_{\text{start}} - z_{\text{end}}) \cdot \frac{s}{S_{\text{total}}}$$

### Pillar 7: Embedded Telemetry Waypoints
Every point on the rail carries complete aerodynamic state:
```typescript
interface RailWaypoint {
  x: number;          // Local coordinate (ft)
  y: number;          // Local coordinate (ft)
  alt: number;        // Altitude MSL (ft)
  kt: number;         // Indicated Airspeed (KIAS)
  headingDeg: number; // Nose heading including wind crab (deg)
  bankDeg: number;    // Aircraft bank angle (deg)
  g: number;          // Normal load factor (G)
  phase: string;      // 'break' | 'downwind' | 'final_turn' | 'final' | 'landing'
}
```

### Pillar 8: Coupled 3D Turn-and-Climb Arrest (The Lift-Vector Perch Slice & Level-Off)
In dynamic pattern climbs (such as Closed Patterns, Go-Arounds, or missed approach climbs into downwind), pitch attitude, bank angle, and altitude capture must be tightly coupled rather than treated as sequential steps:

1. **Vertical Lift Component Dumping:**
   To arrest climb rate smoothly ($dh/dt \to 0$) exactly at target altitude $h_{\text{target}}$, scale climb pitch $\theta$ linearly over the final 300 ft buffer ($\Delta h \le 300\text{ ft}$):
   $$\theta(h) = \theta_{\text{climb}} \cdot \max\left(0, \frac{h_{\text{target}} - h}{300}\right)$$

2. **Horizontal Lift-Vector Slicing (Bank Modulation up to 90°):**
   In the final 300 ft of climb, allow bank angle to modulate upward (up to $90^\circ$ for an unloaded slice). Dumping vertical lift ($L \cos\phi \to 0$) prevents altitude overshoot, while direct application of horizontal lift ($L \sin\phi$) accelerates turn convergence onto the wind-adjusted target waypoint (e.g. the wind-adjusted perch).

3. **Proportional Rollout onto Wind-Killed Vector:**
   Rather than snapping wings level or holding a rigid bank angle until a timer expires, smoothly roll out towards $0^\circ$ bank proportionally as heading error to the wind-adjusted track drops below $25^\circ$:
   $$\phi_{\text{target}} = \begin{cases} 
   0^\circ & |\Delta\psi| \le 2.5^\circ \\
   \text{clamp}\left(\Delta\psi \cdot 1.8, -\phi_{\text{nom}}, \phi_{\text{nom}}\right) & |\Delta\psi| < 25^\circ \\
   -\phi_{\text{slice}} & \text{otherwise}
   \end{cases}$$
   Wings roll level ($\phi = 0^\circ$) precisely as the aircraft captures the wind-killed heading pointing directly at the downstream waypoint at pattern speed.

4. **Continuous Downwind Intercept:**
   The aircraft continues tracking straight downwind along that wind-killed heading, tangent-capturing the downwind rail or perch waypoint with zero spatial discontinuity ($< 15\text{ ft/frame}$).

### Pillar 9: Kinematic Rejoin & Approach Rails for Inbound Alignments (Teardrop & Circuit Rails)
When an aircraft is commanded to capture an inbound heading or fix (e.g. High Key 1/8 NM run-in on heading $298^\circ$ at 5,000 ft, or a circuit entry radial):
1. **Opposite/Offset Heading Principle**: If the aircraft's current vector points away from or opposite to the inbound run-in direction (e.g. departing northwest on $298^\circ$ while the High Key run-in requires entering from the southeast on $298^\circ$), it cannot fly a straight line or reactive PID.
2. **Strict Prohibition on Frame-by-Frame Cross-Track Mode Switches**: Never switch commanded headings between forward and reverse based on cross-track or along-track boundary lines (`alongTrack > 200` vs `<= 200`). This creates limit cycles, alternating bank commands, and endless circling.
3. **Pre-Synthesize a Full Kinematic Rail**:
   - **Climbing Turn Arc**: A coordinated climbing turn (35°–45° bank, 140 kt) with Pillar 8 climb arrest pitch decay over the final 300 ft to level off at target altitude (5,000 ft).
   - **Wind-Drift Integrated Downwind Leg**: Flies parallel to the target line, carrying wind crab.
   - **Base-to-Final Turn Arc**: A smooth continuous curve rolling out wings-level on the target inbound track at least 1/8 NM prior to the target fix.
   - **Stabilized Straight Run-in**: Straight flight along the exact inbound track (e.g. 660 ft at 5,000 ft, decelerating 140 → 120 kt) transitioning seamlessly to the downstream rail.

### Pillar 10: Open-Route vs Closed-Route Blending (The `lapOffset` Trap)
In simulation engines where progress along flight rails is tracked by scalar route distance (`distFt`):
1. **Closed Patterns (`route.kind === 'pattern'`)**: Loop indefinitely. They require `lapOffset = Math.floor(distFt / rLen) * rLen` so aircraft do not rewind to lap 0.
2. **Open One-Way Routes (Entries, Transitions, PFLs, `route.kind !== 'pattern'`)**: Do NOT loop. Distance along an open route is strictly `closestDist`.
3. **The Trap**: Applying `lapOffset` to an open route adds previously accumulated flight distance on top of the intercept point, immediately exceeding the route's total length (`distFt > rLen`). On the very next tick, route completion fires (`distFt >= len`), dumping the aircraft into the attached pattern with massive overshoot or setting `active = false`, causing the aircraft to teleport and disappear.
4. **The Rule**: Always guard lap offset calculations by route type:
   $$\text{targetDistFt} = \text{isClosedRoute}(\text{route}) \;?\; (\text{lapOffset} + \text{closestDist}) : \text{closestDist}$$

---

## 4. Reusable Reference Implementation

```javascript
/**
 * Computes wind crab angle and ground track components.
 */
export function calculateWindCrab(trackDeg, tasKt, windFromDeg, windKt) {
  if (!windKt || windKt <= 0) {
    return { headingDeg: trackDeg, crosswindKt: 0, headwindKt: 0, canHold: true };
  }
  const blowToRad = ((windFromDeg + 180) * Math.PI) / 180;
  const wx = windKt * Math.sin(blowToRad);
  const wy = windKt * Math.cos(blowToRad);
  const trkRad = (trackDeg * Math.PI) / 180;

  const crosswind = -wx * Math.sin(trkRad) + wy * Math.cos(trkRad);
  const headwind  =  wx * Math.cos(trkRad) + wy * Math.sin(trkRad);

  if (Math.abs(crosswind) >= tasKt) {
    return { headingDeg: trackDeg, crosswindKt: crosswind, headwindKt: headwind, canHold: false };
  }
  const crabDeg = (Math.asin(crosswind / tasKt) * 180) / Math.PI;
  return {
    headingDeg: (trackDeg + crabDeg + 360) % 360,
    crosswindKt: crosswind,
    headwindKt: headwind,
    canHold: true,
  };
}

/**
 * Simulates a turn arc forward under wind drift to find rollout point.
 */
export function simulateTurnArc(startX, startY, startAlt, startHdgDeg, tasKt, bankDeg, totalTurnDeg, windFromDeg, windKt, dt = 0.2) {
  const g = 32.174;
  const tasFtps = tasKt * 1.68781;
  const blowToRad = ((windFromDeg + 180) * Math.PI) / 180;
  const wxFtps = (windKt * 1.68781) * Math.sin(blowToRad);
  const wyFtps = (windKt * 1.68781) * Math.cos(blowToRad);

  const omega = (g * Math.tan((bankDeg * Math.PI) / 180)) / tasFtps;
  const turnRateDegSec = (omega * 180) / Math.PI;

  let x = startX, y = startY, hdg = startHdgDeg, accum = 0;
  const pts = [];

  while (accum < totalTurnDeg) {
    const dDeg = Math.min(turnRateDegSec * dt, totalTurnDeg - accum);
    accum += dDeg;
    hdg = (hdg - dDeg + 360) % 360; // Left-turn convention

    const hdgRad = (hdg * Math.PI) / 180;
    x += (tasFtps * Math.sin(hdgRad) + wxFtps) * dt;
    y += (tasFtps * Math.cos(hdgRad) + wyFtps) * dt;

    pts.push({
      x,
      y,
      alt: startAlt,
      headingDeg: hdg,
      bankDeg,
      g: 1 / Math.cos((bankDeg * Math.PI) / 180)
    });
  }

  return {
    rollout: { x, y, headingDeg: hdg, alt: startAlt },
    arcPoints: pts
  };
}

/**
 * Computes wind-offset Perch position by backward target inversion.
 */
export function computeWindOffsetPerch(nominalPerchX, nominalPerchY, tasKt, bankDeg, windFromDeg, windKt) {
  if (!windKt || windKt <= 0) return { x: nominalPerchX, y: nominalPerchY };

  const g = 32.174;
  const tasFtps = tasKt * 1.68781;
  const omega = (g * Math.tan((bankDeg * Math.PI) / 180)) / tasFtps;
  const turnDurationSec = Math.PI / omega; // 180° turn duration

  const blowToRad = ((windFromDeg + 180) * Math.PI) / 180;
  const windFtps = windKt * 1.68781;
  const driftX = windFtps * Math.sin(blowToRad) * turnDurationSec;
  const driftY = windFtps * Math.cos(blowToRad) * turnDurationSec;

  // Invert drift vector to position turn entry
  return {
    x: nominalPerchX - driftX,
    y: nominalPerchY - driftY,
    turnSec: turnDurationSec
  };
}

/**
 * Connects two dynamic endpoints with a wind-crabbed straight leg.
 */
export function buildIntermediaryLeg(pStart, pEnd, alt, tasKt, windFromDeg, windKt, spacingFt = 1000) {
  const dist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
  const trackRad = Math.atan2(pEnd.x - pStart.x, pEnd.y - pStart.y);
  const trackDeg = (trackRad * 180 / Math.PI + 360) % 360;
  const { headingDeg } = calculateWindCrab(trackDeg, tasKt, windFromDeg, windKt);

  const steps = Math.max(3, Math.ceil(dist / spacingFt));
  const waypoints = [];
  for (let i = 1; i < steps; i++) {
    const u = i / steps;
    waypoints.push({
      x: pStart.x + (pEnd.x - pStart.x) * u,
      y: pStart.y + (pEnd.y - pStart.y) * u,
      alt,
      kt: tasKt,
      headingDeg,
      bankDeg: 0,
      g: 1.0,
      phase: 'downwind'
    });
  }
  return waypoints;
}

/**
 * Calculates coupled climb arrest pitch decay, slice bank modulation, and proportional rollout.
 */
export function calculateClimbArrestSlice(currentAlt, targetAlt, currentHdgDeg, targetHdgDeg, nominalBankDeg = 50, climbPitchDeg = 10) {
  const altDiff = targetAlt - currentAlt;
  // 1. Scale pitch linearly over the last 300 ft of climb
  const pitchDeg = altDiff <= 300 ? Math.max(0, climbPitchDeg * Math.max(0, altDiff) / 300) : climbPitchDeg;

  // 2. Shortest angular difference to wind-killed target track
  let deltaHdg = ((targetHdgDeg - currentHdgDeg + 540) % 360) - 180;

  // 3. Proportional rollout / slice bank selection
  let targetBankDeg = 0;
  if (Math.abs(deltaHdg) <= 2.5) {
    targetBankDeg = 0;
  } else if (Math.abs(deltaHdg) < 25) {
    targetBankDeg = Math.max(-nominalBankDeg, Math.min(nominalBankDeg, deltaHdg * 1.8));
  } else {
    // In final 300 ft, allow slice bank up to 90° to dump vertical lift
    const isSlice = altDiff <= 300;
    const maxBank = isSlice ? Math.min(90, nominalBankDeg + 20) : nominalBankDeg;
    targetBankDeg = deltaHdg < 0 ? -maxBank : maxBank;
  }

  return { pitchDeg, targetBankDeg, deltaHdg };
}
```

---

## 5. Summary Checklist for Designing Kinematic Rails

- [ ] **Establish Boundary Headings**: Calculate crab angles for entry leg and exit leg.
- [ ] **Forward-Simulate Entry Maneuver**: Run forward Euler to find the true rollout position under wind.
- [ ] **Backward-Invert Exit Maneuver**: Offset the start of the final turn by $-\vec{W} \cdot T_{\text{turn}}$ to guarantee centerline capture.
- [ ] **Connect Intermediary Legs**: Draw straight ground tracks between dynamic endpoints and apply dynamic crab.
- [ ] **Apply Attitude Blending**: Smoothly ramp bank angle in/out (sinusoidal $15\%$ profile) to prevent jerky animations.
- [ ] **Coupled 3D Turn-and-Climb Arrest**: Scale pitch linearly over the final 300 ft, modulate slice bank up to $90^\circ$ to dump vertical lift, and roll out proportionally onto the wind-killed track.
- [ ] **Clamp Elevation**: Parameterize altitude against cumulative distance $s$, clamping to the runway threshold.
- [ ] **Emit Full Telemetry**: Include $(x, y, z, \text{IAS}, \psi, \phi, G)$ on all rail nodes.
