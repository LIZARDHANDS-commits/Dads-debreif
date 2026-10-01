# Traffic Sim Vector Physics Implementation Checklist

**Task List ID:** `traffic-vector-todo`  
**Master Specification:** [`specs/SPEC-traffic-vector.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/specs/SPEC-traffic-vector.md)  
**Execution Plan:** [`tasks/traffic/vector-physics-plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-plan.md)  
**Safety & Code Backup:** [`src/modules/traffic/sim.js.pre-vector.bak`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js.pre-vector.bak)  

---

## Stage 1: Core Aerodynamic Physics Engine (`sim.js`)

- [ ] **Slice A: 3D Cartesian Vector Stepper & Aircraft State**
  - [ ] Add continuous vector state fields to aircraft objects: `{ x, y, alt, headingDeg, bankDeg, iasKt, phase }`.
  - [ ] Initialize Cartesian state at aircraft spawn time based on route/corridor.
  - [ ] In `sim.js: fly(a)`, replace scalar `distFt += ...` addition with 3D Cartesian velocity integration:
        $$\dot{x} = v_{\text{air}}\sin\psi\cos\theta + W_x, \quad \dot{y} = v_{\text{air}}\cos\psi\cos\theta + W_y, \quad \dot{z} = v_{\text{air}}\sin\theta$$
  - [ ] Implement coordinated turn kinematics ($\omega = \frac{g\tan\phi}{v_{\text{air}}}$) and roll rate limit ($\dot{\phi} \le 45^\circ/\text{s}$).
  - [ ] Update `remember()` snapshot and `sim.state()` to record/restore full Cartesian vector state.
  - [ ] Verify test suite: `node --test tests/unit/traffic/*.test.js` remains 100% green.

- [ ] **Slice B: Overhead Break Maneuver & $V^2$ Drag Deceleration**
  - [ ] Detect Break Point crossing (Point 9, 2,048 ft past threshold on Runway 29L).
  - [ ] Trigger transition to `phase = 'break'`: roll into $60^\circ$ left bank ($2.0\text{ G}$).
  - [ ] Apply induced drag deceleration curve: $V(u) = 220 \cdot e^{-0.452 u}$ ($u \in [0, 1]$ over the 180° heading change).
  - [ ] Allow natural wind drift $\vec{W}$ in Cartesian coordinates throughout the turn.
  - [ ] Roll out wings level at $\psi = 118^\circ$ on Inner Downwind at $140\text{ KIAS}$.
  - [ ] Verify test suite and visual bank/speed transition on dev server.

- [ ] **Slice C: Dynamic Wind Perch & Inner Downwind Pure Pursuit**
  - [ ] Implement dynamic perch calculation: $\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$ ($T_{\text{turn}} \approx 29.8\text{ s}$).
  - [ ] Set `phase = 'downwind'`: calculate direct bearing to $\vec{P}_{\text{perch}}$ and steer closed-loop pure pursuit (crabbed into wind) at $140\text{ KIAS}$, $3,500\text{ ft MSL}$.
  - [ ] Trigger arrival within 150 ft capture radius of $\vec{P}_{\text{perch}}$ and slow to $120\text{ KIAS}$.
  - [ ] Verify test suite and wind drift compensation on downwind.

- [ ] **Slice D: Adaptive Final Turn & 3.0° Glide Slope Descent**
  - [ ] At $\vec{P}_{\text{perch}}$, trigger `phase = 'final_turn'`: initiate continuous descending turn.
  - [ ] Modulate bank adaptively with nominal target **$35^\circ$ bank** (bounded within $[30^\circ, 45^\circ]$) using cross-track centerline feedback.
  - [ ] Apply continuous cubic vertical descent easing from $3,500\text{ ft}$ at Perch to $2,700\text{ ft MSL}$ straight-in (eliminating Point 12 vertical cliff).
  - [ ] Roll out aligned on extended centerline ($298^\circ$ true) at $2,700\text{ ft MSL}$.
  - [ ] Intercept 3.0° glide slope at $2.54\text{ NM}$ ($15,417\text{ ft}$) from threshold; descend at $\sim 500\text{–}600\text{ fpm}$ down to $1,892\text{ ft MSL}$ threshold, decelerating $120 \to 100\text{ KIAS}$.
  - [ ] Verify test suite and smooth descent profile.

- [ ] **Slice E: Closed Pattern (Touch-and-Go Circuit)**
  - [ ] On touchdown at threshold ($100\text{ KIAS}$, $1,892\text{ ft MSL}$), evaluate landing decision:
        - Full stop (20%): rollout to stop.
        - Touch-and-go (80%): roll along runway, advance power past departure end (+4,000 ft).
  - [ ] Accelerate to $140\text{ KIAS}$ and climb at $1,500\text{ fpm}$ to $3,500\text{ ft MSL}$.
  - [ ] Roll into left crosswind turn (roll rate 30–50°/s, bank up to 60°) to merge smoothly onto **Inner Downwind** at $140\text{ KIAS}$.
  - [ ] Hand over to Phase 3 (`'downwind'`) to fly repeated circuit to Perch.
  - [ ] Verify test suite and endless circuit cycling.

---

## Stage 2: Pilot UI Controls & Visual Enhancements

- [ ] **Slice F: Operational Spawner Presets & Multi-Track Display Toggles**
  - [ ] Update Spawner dropdown in `aircraft.js` / `layout.js` to offer pilot-intuitive points:
        `Initial (220 kt)`, `Inner Downwind (140 kt)`, `Perch (120 kt)`, `2-Mile Final (120 kt)`, `1-Mile Final (100 kt)`, `Takeoff (100 kt)`.
  - [ ] Add map display toggle in Layers menu:
        `Both (Reference + Wind-adjusted)` (default), `Wind-adjusted only`, `SMM reference only`, `Neither`.
  - [ ] Verify test suite and UI responsiveness.

- [ ] **Slice G: In-Flight Pilot Command Actions**
  - [ ] Enable in-flight action buttons on aircraft cards: `Go-Around` and `Breakout`.
  - [ ] Implement `Breakout`: climb immediately to $3,500\text{ ft MSL}$, turn 90° away from pattern, accelerate to $140\text{ KIAS}$.
  - [ ] Implement `Go-Around`: maintain runway heading, climb to $2,500\text{ ft MSL}$, accelerate to $140\text{ KIAS}$, re-enter circuit past departure end.
  - [ ] Full Gate 1 local verification and Patrick sign-off.
