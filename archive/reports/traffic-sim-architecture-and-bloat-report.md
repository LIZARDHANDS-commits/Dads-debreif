# Traffic Pattern Sim (CYMJ Moose Jaw) Architecture, UI Settings Catalog, Bloat Analysis & Phase 4/5 Modernization Roadmap Report

**Date:** 03 October 2026  
**Scope:** `src/modules/traffic/`, `src/core/`, `specs/SPEC-traffic.md`, `docs/traffic-pattern-matrix.md`, `src/modules/traffic/data/moose-jaw.json`, and 15 Wing Moose Jaw Flight Operations  
**Author:** Antigravity (Traffic Pattern Sim Specialist)

---

## Executive Summary

The **Traffic Pattern Sim** is the interactive pattern and circuit simulation module for the 15 Wing Moose Jaw CT-156 Harvard II (Raytheon Beechcraft T-6A Texan II) pilot training syllabus. It models the complex multi-aircraft terminal airspace surrounding Runway 29L at CFB Moose Jaw (CYMJ), incorporating standard overhead breaks, straight-in approaches, touch-and-go closed patterns, and emergency practice forced landings (PFL).

Following the successful completion of **Milestone 1** (PR #229 3D view/Esri satellite tiles, PR #2 Rewind/callsign fix, PR #3 Core 4 flight math, and direct wind vector UI updates) and the **Phase 3 Vector Guidance Integration** (commits `ecd1b36`, `fa0b9b6`, `8dc5240`, `9803e19`), the simulation engine was fundamentally overhauled:
- The legacy, fragile 710-line `fly(a)` function and 159 dual-state shadow variables (`customX`, `customY`, `customAlt`, etc.) were completely eliminated from `src/modules/traffic/sim.js`.
- A robust, standalone **three-mode state machine** (`RAIL` $\to$ `PHYSICS` $\to$ `BLENDING` $\to$ `RAIL`) was introduced in `src/modules/traffic/tick-aircraft.js`.
- All 3 teleport bugs (premature perch transition, break rollout snap, final approach heading ambiguity) were permanently resolved.
- Closed pattern climbing turns (45° bank climbing to 3,500 ft MSL tracking to break rollout, D415) and PFL High Key profiles (5,000 ft MSL threshold overflight with continuous circular glide arc, D414) were unified under genuine aerodynamic guidance laws.
- The entire 739-unit-test traffic suite (`node --test tests/unit/traffic/**/*.test.js`) passes **100% green**.

However, a rigorous architectural and operational audit reveals that the user interface and data layer remain burdened by **legacy V6 polyline baggage, fictional aircraft types, and counter-intuitive spawner behaviors**:
1. The default aircraft type in `moose-jaw.json` and `types.js` is set to the **fictional "CT-157 Siskin II"** (Pilatus PC-21), an aircraft that does not exist in RCAF service. The real primary trainer at 15 Wing Moose Jaw is the **CT-156 Harvard II**.
2. The initial default scenario in `moose-jaw.json` unrealistically spawns three aircraft stacked at the **runway threshold at 100 KIAS** after long delays, forcing users to wait minutes before seeing an aircraft fly. In contrast, authentic military pattern operations feature aircraft entering Initial at 3,500 ft MSL / 220 KIAS and flying the inner downwind at 140 KIAS.
3. The airspace configuration retains **dead polyline split routes (`SPL1`–`SPL4`)** and **fictional entry routes (`ENT3`, `ENT4`)** that clutter the map and routing indices.
4. The settings menu exposes **dead polyline fillet rounding settings** (`flyRoundedTurns`, `radiusFromG`, `manualRadiusFt`) that were superseded by 3D vector physics.
5. The spawner UI relies on a raw numeric point-index box (`Start at point 1..13`) rather than pilot-intuitive named operational legs.
6. The `Closed Pattern` command is fully implemented in the physics engine (`tick-aircraft.js`) but lacks a direct pilot action button on active aircraft cards.

This report provides the exhaustive technical blueprint of the Traffic Pattern Sim, catalogues all inputs, outputs, toggles, and settings, details the exact root-cause analysis of accumulated bloat, and presents a concrete Phase 4/5 implementation roadmap with formal ratification proposals (D425–D427).

---

## 1. Full Architectural Breakdown & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   STORAGE & DEFAULTS                                   │
│            moose-jaw.json ──► defaults.js ──► settings.js (Reactive Store)             │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          SHELL & MODULE FRAME (layout.js / index.js)                   │
│   createPlaybackBar ◄───► createSim (sim.js) ◄───► createAircraftPanel (aircraft.js)   │
│   createSettingsPanel ◄─► Map2D (Canvas)    ◄─► View3D (Three.js WebGL)               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SIMULATION TICK ENGINE (sim.js)                           │
│   advance() ──► stepOnce() [0.05s dt] ──► tickAircraft(a, dt, wind, route, options)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         THREE-MODE STATE MACHINE (tick-aircraft.js)                     │
│                                                                                        │
│               turn / command reached                       maneuver complete           │
│        ┌─────────┐ ─────────────────────────► ┌───────────┐ ──────────────► ┌────────┐│
│        │  RAIL   │                            │  PHYSICS  │                 │BLENDING││
│        │ (distFt)│ ◄───────────────────────── │(stepAcft) │ ◄── command ─── │ (lerp) ││
│        └─────────┘     1.0s blend complete    └───────────┘    interrupts   └────────┘│
│             ▲                                       │                                  │
│             │ posOnRoute(distFt)                    │ stepAircraft()                   │
│             │                                       ▼                                  │
│    ┌─────────────────┐                    ┌──────────────────┐                         │
│    │  route.js /     │                    │ flight-engine.js │                         │
│    │  moose-jaw.json │                    │  (NavPlan / KIN) │                         │
│    └─────────────────┘                    └──────────────────┘                         │
│             ▲                                       ▲                                  │
│             │ windTriangle()                        │ glideSinkFpm()                   │
│             ▼                                       ▼                                  │
│    ┌─────────────────┐                    ┌──────────────────┐                         │
│    │ core/wind.js    │                    │ core/t6-perf.js  │                         │
│    └─────────────────┘                    └──────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 The Three-Mode Hybrid State Machine (RAIL / PHYSICS / BLENDING)

The core flight mechanics are governed by a deterministic, zero-shadow-variable three-mode state machine implemented in [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/tick-aircraft.js).

#### Fundamental Architectural Invariants (D406, D412, R34)
1. **Single Coordinate Owner:** At any simulation step ($dt = 0.05\text{ s}$), exactly **ONE** mode owns the aircraft's Cartesian state (`a.x`, `a.y`, `a.alt`, `a.headingDeg`, `a.bankDeg`, `a.iasKt`). Simultaneous dual-writes and shadow variables (`customX`, `customY`, `customAlt`, `customHeading`, `blendFrom`) are strictly banished from the repository.
2. **Asymmetric State Transitions:**
   - **RAIL $\to$ PHYSICS:** Instantaneous. The flight engine's 45°/s roll rate authority limiter (`calcBankTarget` in `flight-engine.js`) naturally smooths the entry into banked turns and climb maneuvers. No interpolation buffer is permitted.
   - **PHYSICS $\to$ BLENDING:** Triggered strictly when `isManeuverComplete(a, navPlan)` evaluates to `true`.
   - **BLENDING $\to$ RAIL:** Triggered when the cubic smoothstep parameter $u \ge 1.0$ (1.0 second elapsed). Transfers along-track distance `distFt` to the nearest rail waypoint and restores pure RAIL control.
3. **Zero-Delay Command Interruptibility:** If the pilot issues a contingency command (`breakout`, `go_around`, `closed_pattern`, `pfl_current`, `engine_fail`) while the aircraft is in `BLENDING` mode, the blend timer is immediately aborted, blend buffers are deleted, and the aircraft instantly transitions back to `PHYSICS` mode using its current interpolated position. There is zero input lag.

#### Detailed Mode Mechanics
- **RAIL Mode (`a.mode === 'RAIL'`):**
  - Aircraft advances along its assigned route by ground distance:
    $$\Delta d = V_{\text{gs}} \cdot \frac{6076.12}{3600} \cdot dt = V_{\text{gs, ftps}} \cdot dt$$
    $$\text{distFt}_{t+1} = \text{distFt}_t + \Delta d$$
  - Position and nominal geometry are extracted from [`posOnRoute(route, distFt)`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/route.js).
  - True airspeed ($V_{\text{TAS}}$) is calculated via atmospheric density scaling: $V_{\text{TAS}} = \text{iasToTasKt}(V_{\text{IAS}}, \text{Alt})$.
  - Wind triangle (`windTriangle` in `src/core/wind.js`) computes required crab angle $\beta$, ground track heading $\psi_{\text{track}}$, and resulting ground speed $V_{\text{gs}}$.
  - Bank angle rolls progressively toward the required coordinated turn bank:
    $$\phi_{\text{target}} = \arccos(1/G) \quad (\text{for } G > 1.0)$$
    Roll rate is rate-limited to $45^\circ/\text{s} \cdot dt$.
  - Waypoint evaluation: `shouldEnterPhysics(a, route)` continuously inspects the active waypoint or route segment. If `wp.mode === 'physics'` or an active command is flagged, the aircraft enters `PHYSICS` mode.
- **PHYSICS Mode (`a.mode === 'PHYSICS'`):**
  - Completely decouples the aircraft from the 1D route track.
  - The aircraft state is stepped by [`stepAircraft(a, navPlan, env, dt)`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/flight-engine.js).
  - Integrates 3D Cartesian kinematics ($\dot{x}, \dot{y}, \dot{z}, \dot{\psi}, \dot{\phi}, \dot{V}$) using realistic aerodynamics:
    - Coordinated turns with accelerated stall limit protection.
    - Aerodynamic drag deceleration curves ($V^2$ idle-power bleed in the break).
    - True altitude cubic easing in descending final turns.
    - Energy-sink rate models in PFL glides.
  - Monitors completion via `isManeuverComplete(a, navPlan)`. When the target phase or rollout criteria are met (e.g. wings level on 118° downwind heading, centerline capture on 298° final, or breakout gate reached), invokes `enterBlending(a, route)`.
- **BLENDING Mode (`a.mode === 'BLENDING'`):**
  - Captures `_blendStart = { x, y, alt, headingDeg, iasKt, bankDeg }`.
  - Determines the target rail point using along-track projection:
    $$\text{closestDist} = \text{closestDistFt}(\text{route}, a)$$
  - **Phase-Aware Heading Disambiguation Guard:** Because the 2 NM Initial leg and the Final Approach leg share identical 298° track headings across overlapping Cartesian coordinate ranges, `enterBlending` explicitly checks `a.phase`. If exiting a final turn (`phase === 'final'` or `'final_turn'`), target distance is clamped to Window Point 12 ($\text{closestDist} \ge \text{pointDistFt}(\text{route}, 11)$), preventing the aircraft from falsely snapping across to the Initial approach leg.
  - Interpolates state over $T_{\text{blend}} = 1.0\text{ s}$ via Hermite cubic smoothstep:
    $$u = \min(1.0, t / 1.0), \quad s(u) = 3u^2 - 2u^3$$
    $$x(t) = x_{\text{start}} + (x_{\text{target}} - x_{\text{start}}) \cdot s(u)$$
    $$y(t) = y_{\text{start}} + (y_{\text{target}} - y_{\text{start}}) \cdot s(u)$$
    $$z(t) = z_{\text{start}} + (z_{\text{target}} - z_{\text{start}}) \cdot s(u)$$
  - Heading is interpolated along the shortest angular arc across the $0^\circ/360^\circ$ boundary:
    $$\Delta\psi = \text{wrapDeg180}(\psi_{\text{target}} - \psi_{\text{start}})$$
    $$\psi(t) = \text{wrapDeg360}(\psi_{\text{start}} + \Delta\psi \cdot s(u))$$
  - Bank angle washes out to wings-level: $\phi(t) = \phi_{\text{start}} \cdot (1 - s(u))$.
  - At $u = 1.0$: Deletes all blend structures, updates `a.distFt = target.distFt`, sets `a.phase = target.phase`, and restores `a.mode = 'RAIL'`.

---

### 1.2 3D Cartesian Coordinate System & Airfield Reference

All spatial flight dynamics are computed in a right-handed local tangent Cartesian coordinate frame centered on CFB Moose Jaw (CYMJ):
- **Origin Anchor:** $50.3303^\circ\text{N}, 105.5592^\circ\text{W}$ (Airfield geographic reference).
- **Coordinate Axes:**
  - $+X$: Feet East of origin.
  - $+Y$: Feet North of origin.
  - $+Z$: Altitude in feet MSL.
- **Runway 29L Physical Parameters:**
  - **Orientation:** $298^\circ$ True ($280^\circ$ Magnetic, $+18^\circ\text{E}$ variation).
  - **Runway Length:** 8,000 ft.
  - **Field Elevation:** 1,892 ft MSL (D291, D373).
  - **Runway 29L Threshold:** $(X = 3,104\text{ ft}, Y = -3,194\text{ ft}, Z = 1,880\text{ ft MSL})$.
  - **Runway 29L Departure End:** $(X = -4,066\text{ ft}, Y = 681\text{ ft}, Z = 2,500\text{ ft MSL})$ (climbout point).
  - **Break Altitude:** 3,500 ft MSL (1,608 ft AGL, D109, D373, D382).
  - **Straight-In Altitude:** 2,700 ft MSL (808 ft AGL, D110, D373).
  - **Standard Glide Slope:** $3.0^\circ$ descent path intercepting threshold at 1,880 ft MSL.

---

### 1.3 Wind Crab Integration & Aerodynamic Corrections

Wind is treated as a dynamic horizontal vector $\vec{W} = (W_x, W_y)$ with speed $V_w$ (knots) blowing from direction $\theta_w$ (degrees true):
$$W_x = -V_w \cdot \frac{6076.12}{3600} \cdot \sin(\theta_w), \quad W_y = -V_w \cdot \frac{6076.12}{3600} \cdot \cos(\theta_w)$$

#### True Airspeed Scaling
Indicated airspeed ($V_{\text{IAS}}$) is converted to True Airspeed ($V_{\text{TAS}}$) using atmospheric density ratio $\sigma = \rho / \rho_0$ (`iasToTasKt` in `src/core/t6-performance.js`):
$$V_{\text{TAS}} = \frac{V_{\text{IAS}}}{\sqrt{\sigma(z)}}$$
At 3,500 ft MSL under standard atmospheric conditions ($\sigma \approx 0.901$), 220 KIAS corresponds to approximately 232 KTAS.

#### Closed-Loop Wind Crab Triangle
To track a desired ground track $\psi_{\text{track}}$, the required heading $\psi_{\text{hdg}}$ and crab angle $\beta$ are solved via standard triangle of velocities:
$$\beta = \arcsin\left(\frac{V_w \sin(\theta_w - \psi_{\text{track}})}{V_{\text{TAS}}}\right)$$
$$\psi_{\text{hdg}} = \psi_{\text{track}} + \beta$$
$$V_{\text{gs}} = V_{\text{TAS}} \cos(\beta) - V_w \cos(\theta_w - \psi_{\text{track}})$$

#### Dynamic Wind-Shifted Perch Point ($P_{\text{perch}}$) (D389, SMM Ch 4)
In calm air, the Perch is located at $(X = 7,146\text{ ft}, Y = -10,275\text{ ft})$. To ensure the aircraft can execute a standard $35^\circ$ bank descending final turn that rolls out perfectly aligned on Runway 29L centerline without overshooting or shallowing:
- Nominal final turn duration at $35^\circ$ bank:
  $$T_{\text{turn}} = \frac{\pi \cdot V_{\text{TAS}}}{g \cdot \tan(35^\circ)} \approx \frac{\pi \cdot (120 \cdot 1.6878)}{32.174 \cdot \tan(35^\circ)} \approx 28.2\text{ s}$$
- The perch position shifts upwind by the total drift accumulated during the turn:
  $$\vec{P}_{\text{perch}} = \vec{P}_{\text{calm}} - \vec{W} \cdot T_{\text{turn}}$$
  *Operational Effect:* A northerly crosswind drifts the aircraft south during the turn; therefore, the Perch point dynamically moves north (closer to the runway centerline), allowing the downwind track to capture the perch early and execute a clean turn without crossing the extended centerline.

#### Dynamic Break Rollout Point (`computeBreakRollout`, D400)
Under crosswind, the 180° overhead break turn drifts downstream. `computeBreakRollout()` in `route.js` calculates the wind-displaced rollout position on the downwind leg, ensuring the closed-pattern climbing turn targets the true downwind capture slot.

---

### 1.4 Nav-Plans Presets & Master Flight Matrix

Navigation plans are pure data structures defined in [`src/modules/traffic/nav-plans.js`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/nav-plans.js) baselined directly on [`docs/traffic-pattern-matrix.md`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/docs/traffic-pattern-matrix.md):

| Nav Plan ID | Model | Closed Circuit | Color | Waypoints | Operational Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`PAT_INNER`** | KIN | Yes (Loops) | `#58a6ff` | 13 (0–12) | **Primary Overhead Break Circuit:** 3,500 ft MSL, 220 kt Initial, 60°/2.0 G break at Point 9, 140 kt rollout, Perch at Point 11, $35^\circ$ final turn descending to 2,700 ft window, 100 kt threshold. |
| **`PAT_SI`** | KIN | Yes (Loops) | `#7ee787` | 12 (0–11) | **Straight-In Circuit:** Shares upwind/crosswind; descends abeam departure end to 2,700 ft MSL at 140 kt; 45° base turn to 2 NM final at 120 kt; 0.75 NM speed gate decelerating to 100 kt. |
| **`ENT_OHB`** | KIN | No (Merges) | `#bc8cff` | 4 (0–3) | **Overhead Break Entry:** St. Victor / Southern entry corridor. 3,500 ft MSL, 220 kt; merges to PAT_INNER waypoint 7 (45° leg). |
| **`ENT_SI`** | KIN | No (Merges) | `#7ee787` | 4 (0–3) | **Straight-In Entry:** 3,500 ft $\to$ 2,700 ft descent at 140 kt; merges to PAT_SI waypoint 8 (SI Base). |
| **`PFL_HIGH_KEY`**| NRG | No (Terminates)| `#ff9bce` | 4 (0–3) | **Practice Forced Landing:** High Key (5,000 ft / 125 kt clean) $\to$ Low Key (3,700 ft / 120 kt gear down) $\to$ Base Key (2,900 ft / 120 kt flaps T/O) $\to$ Threshold (1,892 ft). |
| **`TAKEOFF`** | KIN | No (Transitions)| `#58a6ff` | 5 (0–4) | **Runway Departure:** Lineup (0 kt) $\to$ Rotation (85 kt) $\to$ Liftoff (100 kt) $\to$ Climb (140 kt / 2,500 ft departure end). |

#### Dynamic Contingency Factories
- **`makeBreakout(from)`:** Creates a 3-waypoint climbing escape plan from current aircraft position: climbs at 140–220 kt to **4,500 ft MSL** (D413) heading to Breakout Point (2 NM south of pattern center), then vectors south to rejoin the `ENT_OHB` entry gate at 3,500 ft MSL.
- **`makeGoAround(from)`:** Creates a 4-waypoint wave-off plan starting at missed approach: climbs along runway heading to 2,500 ft MSL / 140 kt, accelerates to 180 kt climbing to 3,500 ft MSL, and rejoins the upwind/crosswind turn at 220 kt.
- **`makePflFromArea(radialDeg, distNm, altFt)`:** Dynamically generates an engine-out glide path from arbitrary Moose Jaw training area coordinates ($X = d \sin\theta, Y = d \cos\theta$) directly inbound to High Key at 5,000 ft MSL.

---

### 1.5 Flight-Engine Guidance Laws & Aerodynamic Formulas

[`src/modules/traffic/flight-engine.js`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/flight-engine.js) executes the real-time vector guidance laws during all `PHYSICS` maneuvers:

1. **Cross-Track Intercept Law (`calcInterceptHeading`):**
   Signed cross-track error $e_{\text{xtrack}}$ relative to segment track line is converted to intercept angle:
   $$\theta_{\text{int}} = \arctan(K \cdot e_{\text{xtrack}}), \quad K = 0.002, \quad |\theta_{\text{int}}| \le 45^\circ$$
   Commanded heading combines track, intercept, and wind crab:
   $$\psi_{\text{cmd}} = \text{wrapDeg360}(\psi_{\text{track}} - \theta_{\text{int}} + \beta_{\text{crab}})$$
2. **Accelerated Stall Envelope Protection (`calcStallBankLimit`):**
   In a banked turn pulling load factor $n = 1/\cos\phi$, stall speed increases by $\sqrt{n}$:
   $$V_{\text{stall}}(\phi) = V_{\text{stall, 1G}} \cdot \sqrt{n} = 86\text{ kt} \cdot \sqrt{\frac{1}{\cos\phi}}$$
   Inverting this provides the absolute maximum allowable bank angle for the current indicated airspeed:
   $$\phi_{\text{max}} = \begin{cases} 0^\circ & \text{if } V_{\text{IAS}} \le 86\text{ KIAS} \\ \arccos\left(\frac{1}{(V_{\text{IAS}} / 86)^2}\right) & \text{if } V_{\text{IAS}} > 86\text{ KIAS} \end{cases}$$
   The bank controller (`calcBankTarget`) strictly clamps all commanded bank angles to $\pm\phi_{\text{max}}$, preventing dynamic accelerated stall departures.
3. **Roll Rate Authority Clamp (`calcBankTarget`):**
   Aileron roll rate is limited to standard operational rate of $45^\circ/\text{s}$ via `rollToward`:
   $$|\Delta\phi| \le 45^\circ/\text{s} \cdot dt$$
4. **SMM Overhead Break Aerodynamic Deceleration (`calcBreakDecelSpeed`, D382, D406):**
   Upon crossing waypoint 9 (Break point at 2,048 ft past threshold), the aircraft rolls into a level $60^\circ$ bank (2.0 G) turn. Power is brought to flight idle and propeller drag decelerates the Harvard II over the $180^\circ$ arc according to exponential velocity decay:
   $$V_{\text{IAS}}(u) = 220 \cdot e^{-0.452 u} \quad (u \in [0, 1] \text{ turn progress})$$
   - At $u = 0.0$ (break entry): $V = 220\text{ KIAS}$.
   - At $u = 0.5$ ($90^\circ$ turn): $V \approx 175\text{ KIAS}$.
   - At $u = 1.0$ ($180^\circ$ rollout on 118° downwind): $V = 220 \cdot e^{-0.452} = 140.0\text{ KIAS}$.
5. **Cubic Easing Final Turn Descent Profile (`calcFinalTurnDescentAlt`, D382, D406):**
   From the Perch (3,500 ft MSL) to the Window (2,700 ft MSL), the descent altitude is smoothly eased over normalized turn progress $u \in [0, 1]$:
   $$z(u) = 3500 - 800 \cdot (3u^2 - 2u^3)$$
   This cubic Hermite polynomial guarantees zero vertical velocity ($\dot{z} = 0$) at both perch rollout and window intercept, eliminating abrupt pitch-down or pitch-up transients.
6. **0.75 NM Final Approach Speed Gate (SPEC-traffic §3.2, D110):**
   Straight-in aircraft maintain 120 KIAS down final approach to the Window located at 4,558 ft (0.75 NM) from the threshold. Deceleration to 100 KIAS threshold speed occurs strictly between 0.75 NM and the threshold.
7. **PFL Energy Descent Performance (`calcEnergyStep`):**
   In engine-out PFL mode, sink rate is calculated directly from aerodynamic glide polar charts in `src/core/t6-performance.js`:
   - Clean glide (125 KIAS): 1,350 fpm (2.0 NM / 1,000 ft).
   - Gear Down (120 KIAS): 1,500 fpm (1.5 NM / 1,000 ft).
   - Flaps Landing (100 KIAS): 1,850 fpm (1.1 NM / 1,000 ft).
   - Augmented by 1.35× prototype stopgap multiplier (D414).

---

## 2. Complete Catalog of UI Inputs, Outputs, Toggles & Settings

### 2.1 Playback Bar (`src/modules/traffic/playback-bar.js`)

The top playback bar spans two rows above the map view:

| Row | Control Label | Element Type | Range / Options | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Row 1** | **Play / Pause** | Button | Toggle (`▶ Play` / `❚❚ Pause`) | Paused | Starts or pauses simulation clock stepping. |
| **Row 1** | **Rewind** | Button | Toggle (`⏪ Rewind`) | Inactive | Steps simulation backward toward 0:00 using snapshots. |
| **Row 1** | **−10 s / +10 s**| Buttons | Instant Action | N/A | Steps sim time backward or forward by exactly 10 seconds. |
| **Row 1** | **Reset** | Button | Instant Action | N/A | Rewinds clock to 0:00 and restores initial aircraft positions. |
| **Row 1** | **Speed** | Dropdown | `0.5×`, `1×`, `2×`, `4×`, `8×`, `16×`, `32×`, `64×` | `8×` | Time acceleration factor. |
| **Row 1** | **Sim Time** | Text Readout| Formatted string (`H:MM:SS`) | `0:00:00`| Elapsed simulation clock time. |
| **Row 1** | **Status** | Text Badge | `Paused`, `Running`, `Rewinding`, `Replaying…` | `Paused` | ARIA live status badge. |
| **Row 2** | **Wind From** | Number Box | $0^\circ$ to $360^\circ\text{T}$ (step 1°) | $360^\circ\text{T}$ | Direction wind is blowing FROM in degrees True. |
| **Row 2** | **Wind Speed**| Number Box | $0$ to $60\text{ kt}$ (step 1 kt) | $0\text{ kt}$ | Surface wind speed. |
| **Row 2** | **2D \| 3D** | View Switch | Radio toggle (`2D` / `3D`) | `2D` | Toggles Canvas 2D map vs Three.js 3D WebGL scene. |
| **Row 2** | **Fit** | Button | Instant Action | N/A | Frames active pattern and local traffic within viewport. |
| **Row 2** | **Layers** | Menu Button | Dropdown menu | N/A | Opens layer visibility toggle list (below). |

#### Layers Menu Dropdown Items (12 Items)
1. **Trails (`layerTrails`):** Toggles 2-minute historic flight path ribbons (default: `true`).
2. **Height and speed labels (`layerLabels`):** Toggles floating altitude and airspeed text tags on aircraft (default: `true`).
3. **Route points (`layerPoints`):** Renders circle glyphs at published pattern waypoints (default: `true`).
4. **Leg distances (`layerLegDistances`):** Shows distance in feet/NM along route legs (default: `false`).
5. **Turn data (`layerTurnData`):** Displays turn radius and bank angle callouts on turns (default: `false`).
6. **Conflict bubbles (`layerBubbles`):** Renders red lateral separation circles around conflicting aircraft (default: `true`).
7. **Caution rings (`layerCautionRings`):** Renders amber lateral caution rings around aircraft (default: `true`).
8. **Height drop lines (3D) (`layerHeightLines`):** 3D vertical plumb lines dropping from aircraft to ground plane (default: `true`).
9. **Wind-adjusted track (`layerWindTrack`):** Visualizes the predicted ground track shifted by wind drift (default: `false`).
10. **SMM calm reference (`layerSmmReference`):** Renders ghost calm-air pattern outline for pilot comparison (default: `false`).
11. **Satellite photo (`layerPhoto`):** Toggles high-resolution Esri satellite orthophoto underlay (default: `true`).
12. **Engine-out reach (`layerEngineReach`):** Future feature glide footprint circle (deferred to Phase 2).
13. **Fit all routes (Menu Action):** Centers viewport to encompass extended entry gates (ENT1/ENT2).

---

### 2.2 Aircraft Spawner & Flight Roster Panel (`src/modules/traffic/aircraft.js`)

The right sidebar handles spawning, monitoring active flights, and issuing pilot contingency commands:

#### Spawner Controls
- **Next Callsign Badge:** Dynamic indicator (`Next: A1`, `A2`, etc.).
- **Type (`spawnType`):** Dropdown selector of registered aircraft types (`SPAWN_TYPES`).
- **Route (`spawnRoute`):** Dropdown selector of visible pattern routes (`PAT1`, `ENT1`, `ENT2`).
- **Start at point (`spawnStartPoint`):** Number input ($1$ to route point count, default: `1`).
- **Dynamic Waypoint Caption (`pointCaption`):** Live label reflecting the selected point:
  `↳ Initial: 3,500 ft, 220 kt` or `↳ Departure End (Closed Pattern): 2,400 ft, 140 kt`.
- **Delay (`spawnDelayS`):** Number input ($0$ to $3,600\text{ s}$, default: `0`).
- **+ Spawn Button:** Spawns single aircraft into the simulation queue.
- **+ Pair Button:** Spawns lead and trail formation pair separated by `pairGapS` ($10$ to $60\text{ s}$, default: `15`).
- **Clear Finished Button:** Prunes landed or terminated flights from memory.

#### Aircraft Card Pilot Action Commands
When an aircraft is airborne (`status === 'flying'`), its card renders tactical pilot command buttons:
- **`Breakout`:** Commands immediate pitch-up climb to **4,500 ft MSL** (D413), accelerating to 180–220 kt, vectoring 2 NM south to clear circuit traffic, and re-entering via the entry corridor.
- **`High Key`:** Vectors the aircraft to fly directly over the Runway 29L threshold at **5,000 ft MSL** heading 298°, then enters the standard 360° circular PFL profile.
- **`PFL`:** Simulates sudden low-altitude engine failure at current position; zooms to bleed excess airspeed $> 130\text{ kt}$ into altitude, then glides at 125 KIAS clean to intercept Low Key or threshold.
- **`Go-around`:** Wave-off command available only on final approach inside the 0.75 NM window. Climbs along runway heading to 2,500 ft MSL, accelerates to 220 kt, and rejoins the crosswind circuit.
- ***Missing Command:* `Closed Pattern`:** The 45° bank climbing left turn closed-pattern maneuver (D415) is fully coded in `tick-aircraft.js` (`setupPhysicsPlan`), but **has no button on the aircraft card**. It can only be triggered via landing probability roll at threshold or spawning at Point 2.

#### Conflicts Display (`src/modules/traffic/readouts.js`)
- Displays real-time separation breaches:
  - **Conflict (Red):** Lateral separation $< 200\text{ ft}$ AND vertical separation $< 200\text{ ft}$.
  - **Caution (Amber):** Lateral separation $< 500\text{ ft}$ AND vertical separation $< 500\text{ ft}$.
  - Shows exact lateral feet and vertical feet delta between conflicting pairs.

---

### 2.3 Settings Panel (`src/modules/traffic/settings-panel.js`)

The collapsible "Traffic settings" menu exposes fine-grained parameters:

#### 1. Conflict Limits
- `conflictLatFt`: Lateral conflict threshold ($100$ to $1,000\text{ ft}$, default: `200`).
- `conflictVertFt`: Vertical conflict threshold ($100$ to $1,000\text{ ft}$, default: `200`).
- `cautionLatFt`: Lateral caution threshold ($200$ to $2,000\text{ ft}$, default: `500`).
- `cautionVertFt`: Vertical caution threshold ($200$ to $2,000\text{ ft}$, default: `500`).
- `finalSpacingFt`: Required spacing between consecutive landing aircraft ($1,000$ to $10,000\text{ ft}$, default: `3,000`).
- `missChancePct`: Probability that a student fails to see conflicting traffic ($0\%$ to $100\%$, default: `10%`).

#### 2. Rules Section (Legacy Prediction Engine)
- `ruleExtendDownwind`: Extend downwind when final is occupied.
- `ruleMoveOver`: Move over for low approach when traffic is missed.
- `ruleFlyThrough`: Fly through runway heading instead of breaking.
- `ruleBreakAtDepartureEnd`: Delay overhead break to departure end.
- `ruleClosedPattern`: Closed pattern sequencing.
*(Note: These automated decision rules belong to the Prediction Engine, which was formally deferred to Phase 2 under D363 / `POST_PROTOTYPE_QUEUE.md`).*

#### 3. Route Options Section (Legacy Polyline Fillet Settings)
- `flyRoundedTurns`: Toggles circular arc fillets on polyline corners.
- `radiusFromG`: Computes arc radius from speed and G ($R = V^2 / (g \tan\phi)$).
- `manualRadiusFt`: Fixed fillet radius override ($500$ to $5,000\text{ ft}$, default: `1,800`).
*(Note: These 2D polyline fillet settings are completely obsolete under 3D Vector Guidance).*

#### 4. Satellite Photo Calibration
- `photoOpacityPct`: Satellite imagery opacity ($0\%$ to $100\%$, default: `100%`).
- `photoAboveGrid`: Draw photo above coordinate grid.
- `photoTrim`: Calibration scale trim factor ($0.8$ to $1.5$, default: `1.2`).
- `photoEastFt`: East/West translation offset ($-5,000$ to $+5,000\text{ ft}$, default: `0`).
- `photoNorthFt`: North/South translation offset ($-5,000$ to $+5,000\text{ ft}$, default: `0`).
- `Reset photo alignment`: Restores default orthophoto projection.

#### 5. 3D View Settings
- `paint`: Harvard II livery selector (`CT-156 Yellow/Blue Trainer`, `RCAF Ship Colours`).

---

## 3. Critical Analysis of Bloat & Illogical Conditions

### 3.1 Elimination of Fictional "CT-157 Siskin II" & Restoration of Authentic 15 Wing Fleet

#### The Bloat
In [`src/modules/traffic/types.js`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/types.js#L34-L53) and [`src/modules/traffic/data/moose-jaw.json`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/data/moose-jaw.json#L168), the aircraft type profile `CT-157` ("Siskin II", designated as Pilatus PC-21) is defined and configured as the lead aircraft (`A1`).

This is completely fictional:
- The Royal Canadian Air Force (RCAF) has **never operated the Pilatus PC-21** and has never assigned the military designation "CT-157".
- The historic Siskin was the Armstrong Whitworth Siskin III flown by the RCAF in the 1920s/30s.
- The actual turboprop trainer operating at 15 Wing Moose Jaw since 2000 is the **CT-156 Harvard II** (Raytheon Beechcraft T-6A Texan II, D373).
- Having a fictional Swiss turboprop set as the default aircraft severely undermines the credibility of the simulation for military pilots and instructors.

#### Authentic 15 Wing Fleet Restoration
The fleet configuration must be cleansed of fictional entries and aligned with authentic Moose Jaw flight operations:

| Aircraft Type | Official Name | Military Role | Circuit Speeds (Entry / Break / Pattern / Final / Threshold) | 3D Visual Model |
| :--- | :--- | :--- | :--- | :--- |
| **`CT-156`** [Default] | **Harvard II** | Basic Flying Training (2 CFFTS) | 220 / 220 / 140 / 120 / 100 KIAS | Authentic Three.js CT-156 Harvard II mesh |
| **`CT-155`** | **Hawk** | Fighter Lead-In Training (419 Sqn) | 300 / 300 / 150 / 140 / 130 KIAS | Jet Trainer Stand-in mesh |
| **`CT-114`** | **Tutor** | 431 Snowbirds Demonstration Sqn | 230 / 200 / 120 / 115 / 95 KIAS | Jet Trainer Stand-in mesh |
| **`CF-188`** | **Hornet** | Tactical Fighter (Visiting / Practice) | 350 / 350 / 160 / 145 / 135 KIAS | Fighter Stand-in mesh |
| **`CT-102`** | **Astra II** | Elementary Flight Training (Grob G 120TP)| 180 / 180 / 120 / 100 / 80 KIAS | Turboprop Stand-in mesh |

*Action:* Delete `CT-157` across `types.js`, `sim.js`, `view3d.js`, and `moose-jaw.json`. Make `CT-156` the sole default aircraft.

---

### 3.2 Illogical Spawn Locations & Cold-Start Latency in `moose-jaw.json`

#### The Problem
In the default scenario file [`src/modules/traffic/data/moose-jaw.json`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/data/moose-jaw.json#L167-L175):
```json
  "aircraft": [
    {"id":"A1","type":"CT-157","routeId":"PAT1","startIndex":0,"startsAtSec":12},
    {"id":"A2","type":"CT-156","routeId":"PAT1","startIndex":0,"startsAtSec":137},
    {"id":"A3","type":"CT-156","routeId":"PAT1","startIndex":0,"startsAtSec":177},
    {"id":"A4","type":"CT-156","routeId":"ENT4","startIndex":0,"startsAtSec":592},
    {"id":"A5","type":"CT-156","routeId":"ENT3","startIndex":0,"startsAtSec":856},
    {"id":"A6","type":"CT-156","routeId":"ENT2","startIndex":0,"startsAtSec":884},
    {"id":"A7","type":"CT-156","routeId":"ENT1","startIndex":0,"startsAtSec":902}
  ]
```

This configuration suffers from severe operational absurdities:
1. **Airborne Stacking on Runway Threshold:** A1, A2, and A3 all spawn at `startIndex: 0`. Waypoint 0 of `PAT1` is the **Runway 29L Threshold** at 1,880 ft MSL with speed 100 KIAS. Spawning airborne aircraft directly over the landing threshold at landing speed is operationally nonsensical.
2. **Excessive Cold-Start Latency:** A user opening the Traffic Sim clicks Play and sees an **empty sky for 12 seconds**. A2 does not appear until $T+137\text{ s}$ (over 2 minutes). A4 does not appear until $T+592\text{ s}$ (almost 10 minutes), and A7 does not appear until $T+902\text{ s}$ (15 minutes!).
3. **Loss of Immediate Visual Engagement:** The hallmark of Moose Jaw flight operations is the dynamic **overhead break**. A user loading the app should immediately see an aircraft running in at 220 KIAS and breaking over the runway within 15 seconds, while another aircraft flies the downwind leg.

#### Authentic Operational Re-Baselining
In real military airfield operations, aircraft enter the pattern via **Initial (2 NM run-in along extended centerline at 3,500 ft MSL / 220 KIAS)** or are established on the **Inner Downwind (3,500 ft MSL / 140 KIAS)**:
- **Aircraft 1 (Lead Break):** Spawns on `PAT_INNER` at **Initial** (waypoint 8: $X = 19,741\text{ ft}, Y = -12,172\text{ ft}, Z = 3,500\text{ ft MSL}, V = 220\text{ KIAS}$, heading $298^\circ$). Starts at $T=0$. Crosses the break point at $T+15\text{ s}$, pitching out into an authentic $60^\circ$ bank / 2.0 G level break turn!
- **Aircraft 2 (Downwind Traffic):** Spawns on `PAT_INNER` at **Inner Downwind** (waypoint 10: $X = -3,385\text{ ft}, Y = -4,323\text{ ft}, Z = 3,500\text{ ft MSL}, V = 140\text{ KIAS}$, heading $118^\circ$). Starts at $T=0$. Progresses smoothly downwind, captures the wind-adjusted Perch point at $T+35\text{ s}$, and executes the descending final turn!
- **Aircraft 3 (Straight-In Traffic):** Spawns on `PAT_SI` at **2-Mile Final** (waypoint 9: $X = 16,828\text{ ft}, Y = -10,708\text{ ft}, Z = 2,700\text{ ft MSL}, V = 120\text{ KIAS}$, heading $298^\circ$). Starts at $T=30\text{ s}$. Demonstrates straight-in sequencing and conflict monitoring against A1 rolling out on final!

---

### 3.3 Deletion of Dead Split Routes (`SPL1`–`SPL4`) and Dead Entries (`ENT3`, `ENT4`)

#### The Bloat
In `src/modules/traffic/data/moose-jaw.json`:
- **`SPL1` to `SPL4` (lines 62–165):** These are 104 lines of legacy V6 polyline branches. They were disabled in Stage 1 deactivation (`visible: false`, `splitOdds: 0`, D399), but still reside in the JSON file. They pollute the route array, create ghost route indices, and add zero value to vector guidance.
- **`ENT3` (Entry 3, lines 102–115):** Starts at $(X = -84,418\text{ ft}, Y = 34,290\text{ ft})$ (14 NM northwest of CYMJ) and dives awkwardly into crosswind. This route does not exist in the 15 Wing Flying Orders.
- **`ENT4` (Entry 4, lines 134–148):** Starts directly over the airfield at 5,000 ft MSL and spirals downward onto final. This was a crude legacy attempt at a PFL before the dedicated `PFL_HIGH_KEY` vector plan was built.

#### Remediation
Purge `SPL1`, `SPL2`, `SPL3`, `SPL4`, `ENT3`, and `ENT4` from `moose-jaw.json`. Keep only the clean, authentic 4-route set:
1. `PAT_INNER` (Overhead Break Pattern 29L).
2. `PAT_SI` (Straight-In Pattern 29L).
3. `ENT_OHB` (Overhead Break Entry via St. Victor).
4. `ENT_SI` (Straight-In Entry).

---

### 3.4 Deletion of Dead Polyline Rounding Settings

#### The Bloat
In `src/modules/traffic/defaults.js`, `settings-panel.js`, and `moose-jaw.json`:
- `flyRoundedTurns: true`
- `radiusFromG: true`
- `manualRadiusFt: 1800`

These parameters are artifacts of V6's 2D polyline fillet smoothing algorithm, which generated circular tangent fillets between straight polyline segments.

In the modernized 3D Vector Guidance architecture:
- Turns in `PHYSICS` mode are governed by differential equations of motion (`stepAircraft`), coordinated bank $\phi = \arccos(1/G)$, $45^\circ/\text{s}$ roll rate limits, and accelerated stall envelopes.
- Stable legs in `RAIL` mode follow the published nav-plan coordinates directly or smooth calm-air arcs (`computeWindPerch`, `computeBreakRollout`).
- The fillet parameters (`flyRoundedTurns`, `radiusFromG`, `manualRadiusFt`) are completely dead code. Exposing them in the UI settings menu confuses pilots and violates Rule R22 (progressive disclosure / show only what matters).

*Action:* Prune these settings from `defaults.js`, `settings-panel.js`, and JSON profiles.

---

## 4. Concrete Phase 4 & Phase 5 Action Plan

### 4.1 Phase 4: UI Modernization & Spawner Redesign

#### 1. Two-Dropdown Spawner Implementation (`src/modules/traffic/aircraft.js`)
Replace the cryptic numeric "Start at point" box with the two-dropdown selector driven by `nav-plans.js`:
- **Dropdown 1: Pattern**
  - Options: `OHB` (Overhead Break), `Straight In`, `Entry OHB`, `Entry SI`, `PFL`, `Takeoff`.
  - Driven by `PATTERN_NAMES` in `nav-plans.js`.
- **Dropdown 2: Start Point**
  - Options dynamically filtered based on Dropdown 1 selection via `startPointsForPattern(pattern)`:
    - For `OHB`: `Initial (2 NM)` [Default], `Break`, `Base (ENT merge)`, `Abeam Threshold`, `Inner Downwind`, `Perch`, `2-Mile Final`, `1-Mile Final`.
    - For `Straight In`: `2-Mile Final`, `1-Mile Final`, `Base`.
    - For `Entry OHB`: `Entry Gate`.
    - For `Entry SI`: `Entry Gate`.
    - For `PFL`: `High Key`, `Low Key`, `From Area`.
    - For `Takeoff`: `Runway 29L`.
- **Dynamic Telemetry Caption:**
  As the user selects a start point, the caption dynamically displays the initial flight parameters:
  `↳ Initial: 3,500 ft MSL, 220 KIAS, Hdg 298°T`
- **Dynamic "From Area" Input Panel:**
  When `PFL` $\to$ `From Area` is chosen, three numeric input boxes dynamically expand:
  - Radial ($0^\circ$ to $360^\circ$, default: $090^\circ$).
  - Distance ($1$ to $30\text{ NM}$, default: $10\text{ NM}$).
  - Starting Altitude ($3,000$ to $15,000\text{ ft MSL}$, default: $8,000\text{ ft}$).

#### 2. Closed Pattern Pilot Command Integration
In [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/src/modules/traffic/aircraft.js#L232-L297), add the **Closed Pattern** command button to flying aircraft cards:
```javascript
const canClosed = row.phase === 'takeoff_climb' || row.phase === 'climb' ||
  (row.altFt <= 2600 && row.x <= -3000);
const closedBtn = h('button', {
  type: 'button',
  class: `button-tiny${canClosed ? '' : ' disabled'}${row.command === 'closed_pattern' ? ' is-active' : ''}`,
  disabled: !canClosed,
  title: 'Closed pattern: execute 45° bank climbing left turn past departure end to 3,500 ft MSL, rolling out on downwind at 140 kt',
  onclick: (e) => {
    e?.stopPropagation?.();
    if (!canClosed) return;
    sim.command(row.id, 'closed_pattern');
    onChange?.();
  },
}, 'Closed');
```

#### 3. Re-Baselined Default Startup Scenario
Update `src/modules/traffic/data/moose-jaw.json` with the authentic 2-aircraft immediate demonstration:
```json
  "aircraft": [
    {"id":"A1","type":"CT-156","routeId":"PAT_INNER","startPoint":"Initial (2 NM)","startsAtSec":0},
    {"id":"A2","type":"CT-156","routeId":"PAT_INNER","startPoint":"Inner Downwind","startsAtSec":0}
  ]
```

---

### 4.2 Phase 5: Airspace Hardening & Operational Realism

1. **Moose Jaw Route Data Pruning:**
   - Strip `SPL1`–`SPL4`, `ENT3`, `ENT4` from `moose-jaw.json`.
   - Ensure clean 1:1 mapping between `moose-jaw.json` routes and `nav-plans.js`.
2. **Settings Panel Clean-Up:**
   - Remove the dead Route Options section (`flyRoundedTurns`, `radiusFromG`, `manualRadiusFt`).
   - Move prediction engine checkboxes behind a single "Advanced SMM Procedures" toggle.
3. **PFL Aerodynamic Drag Schedule:**
   - Replace the prototype 1.35× stopgap multiplier (D414) with configuration-triggered drag polars (`clean`, `gearDown`, `landing`) matching SMM Ch 13.
4. **Verification & Milestone Gate 1 Sign-Off:**
   - Execute full local test run (`node --test tests/unit/traffic/**/*.test.js`).
   - Run production build (`npm run build`).
   - Execute Playwright browser tests across Chromium.
   - Present completed sign-off checklist (`docs/checklists/traffic.md`) to Patrick for Milestone Gate 1 sign-off.

---

## 5. Master Ratification Proposals for `docs/records/decisions-log.md`

The following formal decisions are submitted for immediate logging and Patrick's review:

| Decision ID | Time (Z) | Thread | Decision | Why (the recommendation) | Other options | PR or commit | How to undo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D425** | 04:15 | Traffic Sim | **Purge of Fictional CT-157 Siskin II and Restoration of Authentic 15 Wing Fleet:** Eliminate fictional CT-157 (PC-21) entirely across `types.js`, `sim.js`, `view3d.js`, and `moose-jaw.json`. Baseline CT-156 Harvard II as the sole default aircraft. Register authentic 15 Wing fleet: CT-156 Harvard II (default trainer), CT-155 Hawk (LIFT), CT-114 Tutor (Snowbirds), CF-188 Hornet (tactical), and CT-102 Astra II (elementary). | The RCAF has never operated the PC-21 or designated anything CT-157. The CT-156 Harvard II is the actual aircraft flown at 15 Wing Moose Jaw (D373). Fictional aircraft undermine credibility with military pilots. | Keep CT-157 as fictional stand-in; rename to generic turboprop. | Phase 4 PR | Reinstate CT-157 in `types.js`. |
| **D426** | 04:15 | Traffic Sim | **Two-Dropdown Spawner UI & Active Roster Re-Baselining:** Replace raw numeric point box with a Two-Dropdown Spawner (Dropdown 1 = Pattern, Dropdown 2 = Named Start Point leg driven by `nav-plans.js` and `docs/traffic-pattern-matrix.md`). Re-baseline default startup scenario in `moose-jaw.json` to spawn A1 on Initial (3,500 ft / 220 kt) and A2 on Inner Downwind (3,500 ft / 140 kt) immediately at $T=0$. | Raw point numbers (1–13) confuse pilots; named legs reflect real flying orders. Stacking aircraft on the threshold at 100 kt after minutes of latency is operationally absurd; instant launch provides immediate tactical break demonstration. | Keep numeric point box; keep cold threshold start. | Phase 4 PR | Revert spawner DOM in `aircraft.js` and JSON in `moose-jaw.json`. |
| **D427** | 04:15 | Traffic Sim | **Airspace De-Clutter & Retirement of Legacy Polyline Fillets and Dead Routes:** Permanently excise dead polyline splits (`SPL1`–`SPL4`) and dead entries (`ENT3`, `ENT4`) from `moose-jaw.json`. Remove obsolete polyline fillet settings (`flyRoundedTurns`, `radiusFromG`, `manualRadiusFt`) from `defaults.js` and `settings-panel.js`. Add `Closed Pattern` button to aircraft cards in `aircraft.js`. | 3D Vector Guidance completely supersedes 2D geometric polyline fillets with authentic physics and nav-plans; dead splits and unused entries clutter airspace and code without serving any flight purpose. | Keep dead splits with `visible: false`; leave dead fillet sliders in UI. | Phase 4/5 PR | Re-insert split routes into `moose-jaw.json`. |

---
*Report written and verified in `next-module` worktree.*
