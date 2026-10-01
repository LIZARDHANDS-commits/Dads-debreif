# Authoritative Specification: 3D Vector Aerodynamics & Flight Guidance Engine (Traffic Sim)

**Document ID:** `SPEC-traffic-vector`  
**Applicability:** `src/modules/traffic/` (Moose Jaw CYMJ Runway 29L Left-Hand Circuit)  
**Parent Specifications:** `specs/SPEC-traffic.md`, `HANDOVER.md`, `docs/REMEDIATION_ROADMAP.md`  
**Ratified Decisions:** D370 (Closed-loop flight), D371 (Pilot domain tolerances), D373/D378 (CYMJ 29L LH ground truth), D382 (60° break, 45° final turn), D389 (Dynamic perch drift compensation), D390 (Vector simulation & 3D suite), D391 (35° target bank, closed pattern to inner downwind, roll rates).

---

## 1. Executive Overview & System Architecture

Traffic Sim transitions from a 1D scalar polyline progression model (`a.distFt += gsKt * dt`) to a **free-flying 3D Cartesian aerodynamic vector physics model**, directly borrowed and adapted from `turn-fight` and `turn-sim`.

### 1.1 Core Principles
1. **Drawn Tracks = Visual Flight Charts:** Published SMM corridors on the map are visual reference charts (calm-wind corridor + optional wind-drifted overlay). They do not constrain the aircraft to physical rails.
2. **Aircraft = Free Aerodynamic Particles:** Each aircraft navigates $(x, y, z)$ with airspeed $V_{\text{ias}}$, true airspeed $V_{\text{tas}}$, heading $\psi$, bank $\phi$, roll rate $\dot{\phi}$, and vertical speed $\dot{z}$ in an active airmass wind vector $\vec{W} = (W_x, W_y)$.
3. **Dual Guidance Doctrine (Localizer vs. Pure Pursuit):**
   * **Localizer-Style Tracking:** Used on the **Outer Pattern** and on **Final Approach** (Runway 29L extended centerline). The aircraft calculates cross-track error $e_{\text{xtrack}}$ and applies proportional crab/heading corrections to track the ground corridor precisely.
   * **Closed-Loop Pure Pursuit:** Used on **Inner Downwind**. After rolling out of the overhead break or closed pattern crosswind turn, the aircraft computes the direct bearing to the **wind-compensated Perch waypoint** $\vec{P}_{\text{perch}}$ and flies direct to it (crabbed into wind).
4. **Roll Dynamics:** Turns are not instantaneous angle snaps. Commanded bank changes execute at realistic military pilot roll rates:
   $$\dot{\phi} \approx 30^\circ\text{–}50^\circ/\text{s}$$
   Maximum bank authority for tactical merges is up to **$60^\circ$**.
5. **Scope Isolation:** >90% of module files (`map2d.js`, `view3d.js`, `layout.js`, `playback-bar.js`, `aircraft.js`, `editor.js`, `defaults.js`, `types.js`, `profile.js`) remain **completely untouched**. Only `sim.js: fly(a)` and its snapshot logic are updated.

---

## 2. Mathematical Baseline & Aerodynamic Equations

### 2.1 The 3D Step Integrator (Every 0.05 s)
Every simulation step (`dt = 0.05 s`):
1. **True Airspeed Conversion:**
   $$V_{\text{tas}} = \text{iasToTasKt}(V_{\text{ias}}, z_{\text{MSL}}), \quad v_{\text{air}} = V_{\text{tas}} \cdot \frac{6076.12}{3600}\text{ ft/s}$$
2. **Moving Airmass Wind Vector:**
   $$\vec{W} = \begin{bmatrix} W_x \\ W_y \end{bmatrix} = \begin{bmatrix} -V_{\text{wind}} \cdot \sin(\theta_{\text{wind\_from}}) \cdot \frac{6076.12}{3600} \\ -V_{\text{wind}} \cdot \cos(\theta_{\text{wind\_from}}) \cdot \frac{6076.12}{3600} \end{bmatrix}\text{ ft/s}$$
3. **Ground Velocity & Position Integration:**
   $$\dot{x} = v_{\text{air}} \sin\psi \cos\theta + W_x, \quad \dot{y} = v_{\text{air}} \cos\psi \cos\theta + W_y, \quad \dot{z} = v_{\text{air}} \sin\theta$$
   $$x_{t+dt} = x_t + \dot{x} \cdot dt, \quad y_{t+dt} = y_t + \dot{y} \cdot dt, \quad z_{t+dt} = z_t + \dot{z} \cdot dt$$
4. **Coordinated Turn Kinematics & Roll Rate:**
   $$\phi_{t+dt} = \text{moveToward}(\phi_t, \phi_{\text{cmd}}, \dot{\phi}_{\max} \cdot dt) \quad \text{where } \dot{\phi}_{\max} = 45^\circ/\text{s}$$
   $$\omega = \frac{g \cdot \tan\phi}{v_{\text{air}}}, \quad \psi_{t+dt} = \psi_t + \omega \cdot dt$$
   $$n = \frac{1}{\cos\phi} \quad (\text{Load factor } G)$$

### 2.2 Closed-Loop Guidance Laws (Localizer vs. Pure Pursuit)
1. **Localizer-Style Tracking (Outer Pattern & Final Approach):**
   Given corridor course $\tau_{\text{ref}}$ (e.g. $298^\circ$ true for Runway 29L) and reference anchor $(x_0, y_0)$:
   $$e_{\text{xtrack}} = (x - x_0) \cdot \cos\tau_{\text{ref}} - (y - y_0) \cdot \sin\tau_{\text{ref}}\text{ (feet)}$$
   $$\psi_{\text{cmd}} = \tau_{\text{ref}} + \theta_{\text{crab}} + \text{clamp}(K_p \cdot e_{\text{xtrack}}, \; -30^\circ, \; +30^\circ) \quad \text{where } K_p = 0.02^\circ/\text{ft}$$
2. **Pure Pursuit Guidance (Inner Downwind to Dynamic Perch):**
   Given current position $(x, y)$ and wind-shifted Perch $\vec{P}_{\text{perch}} = (x_p, y_p)$:
   $$\beta_{\text{direct}} = \text{atan2}(x_p - x, \; y_p - y)$$
   $$\psi_{\text{cmd}} = \text{windCorrectedHeading}(\beta_{\text{direct}}, V_{\text{tas}}, \vec{W})$$
3. **Continuous Cubic Descent Curve (Final Turn):**
   Progress normalized over the 180° turn: $u = \frac{\Delta\psi}{180^\circ} \in [0, 1]$:
   $$z(u) = 3500 - (3500 - 2700) \cdot (3u^2 - 2u^3) = 3500 - 800 \cdot (3u^2 - 2u^3)\text{ ft MSL}$$
   *Guarantees $\dot{z} = 0$ at Perch entry ($u = 0$) and $\dot{z} = 0$ at straight-in centerline rollout ($u = 1$), eliminating vertical elbow kinks.*
4. **3.0° Glide Slope Capture (Centerline to Threshold):**
   Distance to threshold $D = \sqrt{(x - x_{\text{thresh}})^2 + (y - y_{\text{thresh}})^2}$:
   $$\text{Capture Distance: } D_{\text{intercept}} = \frac{2700 - 1892}{\tan(3.0^\circ)} = 15,417\text{ ft (2.54 NM)}$$
   $$\text{Target Altitude: } z_{\text{cmd}}(D) = 1892 + D \cdot \tan(3.0^\circ)\text{ ft MSL}$$
   $$\text{Vertical Descent Speed: } \dot{z} = -v_{\text{ground}} \cdot \tan(3.0^\circ) \approx -550\text{ fpm}$$

---

## 3. Harvard II (CT-156 / T-6A) Performance Integration

The simulation couples with `src/core/t6-performance.js` and `src/modules/traffic/types.js`:

### 3.1 Speed Schedule (`types.js`)
* **Initial / Break Entry:** $220\text{ KIAS}$ at $3,500\text{ ft MSL}$
* **Break Deceleration & Inner Downwind:** $140\text{ KIAS}$ at $3,500\text{ ft MSL}$
* **Perch Arrival & Final Turn:** $120\text{ KIAS}$
* **Straight-in & Threshold:** $100\text{ KIAS}$ at $1,892\text{ ft MSL}$

### 3.2 Authentic Induced Drag in the Break
During the 180° level break turn (60° bank / 2.0 G), deceleration decays smoothly according to aerodynamic induced drag:
$$V(u) = 220 \cdot e^{-0.452 u} \quad (u \in [0, 1] \text{ over } 180^\circ \text{ turn})$$

### 3.3 Accelerated Stall Protection (`core/t6-performance.js`)
* Baseline clean 1G stall speed: $V_{s0} = 86\text{ KIAS}$.
* Accelerated stall limit:
  $$n_{\text{stall}} = \left(\frac{V_{\text{ias}}}{86}\right)^2 \implies \phi_{\max} = \arccos\left(\frac{1}{n_{\text{stall}}}\right)$$
* At 140 KIAS (break rollout): $n_{\text{stall}} = 2.65\text{ G}$ ($\phi_{\max} = 67.8^\circ$, $+18\text{ kt}$ margin above 2.0 G).
* At 120 KIAS (final turn): $n_{\text{stall}} = 1.94\text{ G}$ ($\phi_{\max} = 59.1^\circ$, $+25\text{ kt}$ margin above 1.22 G at 35° bank).

---

## 4. Flight Phases & Guidance State Machine

### Phase 1: `initial` (Runway 29L Corridor)
* **Guidance:** Localizer tracking along extended centerline ($298^\circ$ true) at $3,500\text{ ft MSL}$, $220\text{ KIAS}$.
* **Trigger:** Crossing Point 9 (Break point at 2,048 ft past runway threshold per SMM and TR-06).

### Phase 2: `break` (Overhead Break Turn)
* **Guidance:** Constant $60^\circ$ left bank ($\phi = -60^\circ$, $2.0\text{ G}$). Speed bleeds via induced drag $V(u) = 220 \cdot e^{-0.452 u}$ down to $140\text{ KIAS}$.
* **Drift:** Drifts naturally with active wind vector $\vec{W}$.
* **Rollout Trigger:** Cumulative turn angle reaches $180^\circ$ ($\psi = 118^\circ$ true). Rolls wings level to capture Inner Downwind.

### Phase 3: `downwind` (Inner Downwind to Perch)
* **Dynamic Perch Calculation:**
  $$T_{\text{turn}} = \frac{\pi \cdot v_{\text{tas}}}{g \cdot \tan(35^\circ)} \approx 29.8\text{ s}$$
  $$\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$$
* **Guidance:** Closed-loop pure pursuit direct to $\vec{P}_{\text{perch}}$ at $140\text{ KIAS}$, $3,500\text{ ft MSL}$ with standard wind crab.
* **Trigger:** Arrival within 150 ft capture radius of $\vec{P}_{\text{perch}}$. Slows to $120\text{ KIAS}$.

### Phase 4: `final_turn` (Continuous Descending Turn)
* **Guidance:** Continuous descending turn toward Runway 29L centerline.
  * **Target Bank:** Nominal **$35^\circ$ bank**, modulating within **$[30^\circ, 45^\circ]$** using proportional cross-track feedback:
    $$\phi_{\text{cmd}} = \text{clamp}\left( 35^\circ + K_p \cdot e_{\text{centerline}} + K_d \cdot \dot{e}_{\text{centerline}}, \; 30^\circ, \; 45^\circ \right)$$
  * **Vertical Descent:** Continuous cubic easing from $3,500\text{ ft MSL}$ down to $2,700\text{ ft MSL}$ straight-in.
* **Trigger:** Rollout aligned on runway centerline ($298^\circ$ true) with cross-track error $< 50\text{ ft}$.

### Phase 5: `glide_slope` (3.0° Straight-in Approach)
* **Guidance:** Localizer tracking of centerline at $2,700\text{ ft MSL}$ until capturing 3.0° glide slope at $2.54\text{ NM}$ ($15,417\text{ ft}$) from threshold. Continuous descent at $\sim 500\text{–}600\text{ fpm}$ down to $1,892\text{ ft MSL}$ threshold, decelerating from $120 \to 100\text{ KIAS}$.

### Phase 6: `threshold` & `touch_and_go` (Closed Pattern)
* **Touchdown:** Crosses threshold at $100\text{ KIAS}$, $1,892\text{ ft MSL}$.
  * **Full Stop (20%):** Decelerates along runway to stop (`landed = true`).
  * **Touch-and-Go (80%):** Rolls along runway decelerating slightly, then advances takeoff power past departure end (+4,000 ft), accelerates to $140\text{ KIAS}$, and climbs at $\sim 1,500\text{ fpm}$ to $3,500\text{ ft MSL}$.
* **Closed Pattern Turn:** Rolls into left crosswind turn (roll rate 30–50°/s, bank up to 60°) to merge smoothly onto the **Inner Downwind circuit** at $140\text{ KIAS}$, directly joining the corridor between break rollout and Perch.

---

## 5. Entries, Splits & Conflict Telemetry

1. **Entries (ENT1, ENT2, ENT3) & Splits:** Flown Localizer-style along their surveyed corridors. When merging onto downwind or final, the guidance commands a smooth bank turn (roll rate 30–50°/s, bank up to 60°) to intercept the circuit without coordinate snaps.
2. **Conflict Telemetry:** Trailing aircraft maintain passive telemetry. Separation caution and conflict rings light up when distance is $< 3,000\text{ ft}$. Manual in-flight action triggers (`Go-Around`, `Breakout`) allow the pilot/instructor to direct avoiding action.
3. **Deterministic Replay:** State snapshots are taken every 20 steps (1.0 s) storing `{ id, x, y, alt, headingDeg, bankDeg, iasKt, phase }`. Rewind and timeline scrubbing are 100% deterministic.
