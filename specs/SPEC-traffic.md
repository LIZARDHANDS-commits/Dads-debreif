# Spec: `traffic`, the Traffic Pattern Sim

> **Authoritative Flight Guidance: This spec supersedes SPEC-traffic-vector.md**  
> **Status**: Approved (D406, R34) — Vector Guidance Migration Ratification  
> **Date**: 2026-10-02  
> **Module ID**: `traffic` in [`SPEC.md`](../SPEC.md)  
> **Authoritative Companion**: Master Pattern Matrix at [`docs/traffic-pattern-matrix.md`](../docs/traffic-pattern-matrix.md) (single source of truth for waypoints & coordinates)  
> **Decisions**: D6, D10, D46, D109, D110, D117, D118, D134, D158, D368–D400, D406 | **Requirements**: R2, R3, R4, R6, R8, R9, R14, R16, R21, R22, R24–R27, R34  

---

## 1. Why We're Doing This: Unifying the Flight Engine

### 1.1 Current State: Two Competing Flight Systems
The traffic sim currently suffers from a **hybrid architecture** where two flight systems fight each other:

1. **System A "Rails"** (1,466 lines in `sim.js`):
   - Aircraft position = `posOnRoute(route, a.distFt)` — scalar distance along pre-computed polyline
   - Speed interpolated between waypoints
   - Used for: normal OHB circuit, entries, straight-in, final turn
2. **System B "Vector Guidance"** (~500 lines in `sim.js`):
   - Aircraft updates `a.customX/Y/Heading` each step with physics
   - Used for: closed pattern climb, breakout, go-around, PFL commands
   - **Critical flaw**: At the Perch, the code `delete`s all vector state and forces the aircraft back onto rails for the final turn

### 1.2 What This Causes
| Bug | Root Cause | Symptom |
|---|---|---|
| **Zero-wind OHB/Final Turn broken** | `route.js:273` switches to Bézier at zero wind instead of aero arcs | `(windKt ?? 0) > 0` fails |
| **Zero-wind PFL not circular** | `buildPath()` has no PFL handling | Always makes polygon corners |
| **Straight-in slows down too early** | Speed gate checks `route.id === 'PAT_SI'` | Never matches in normal operation |
| **Aircraft teleport at break start** | `useRwyBreak = (windKt ?? 0) <= 0` | Forces break to 2,000 ft past threshold |
| **Final turn dogleg at zero wind** | Perch at 4,307 ft but turn diameter is 4,013 ft | Rolls out 316 ft off centerline |

### 1.3 Why the Closed Pattern Works
The closed pattern uses free Cartesian vector guidance with `a.customX/Y/Heading`. It works at all wind conditions because it is **always physics-driven**. The rest of the circuit fails because it uses rails.

### 1.4 What's Already Implemented (~30%)
- Closed pattern climb + downwind pursuit to Perch: ✅ (Needs wind crab on heading)
- Breakout vector guidance: ✅ (Needs smooth `rollToward`)
- PFL/Engine failure: ✅ (Needs `glideSinkFpm()`)
- Go-around climb profile: ✅ (Needs smooth `rollToward` and wind crab)
- Wind-shifted Perch calculation: ✅ (Matches D389)
- Break decel formula (`route.js`): ✅ (Pre-computed, needs dynamic sim integration)
- Localizer cross-track guidance: ❌ Not implemented
- Dynamic final turn bank modulation: ❌ Not implemented
- Cubic descent curve: ❌ Not implemented
- 3.0° glide slope capture: ❌ Not implemented (currently a 10° plunge)
- Accelerated stall protection: ❌ Not implemented
- `rollToward()`, `dampedClimbG()`, `glideSinkFpm()`: ❌ Never imported into `sim.js`

### 1.5 The Fix: One Unified Flight Engine (D406, R34)
Replace the entire `fly(a)` function in `sim.js` with calls to a unified flight engine (`flight-engine.js`). Every aircraft is **always** physics-driven via Cartesian 3D vector integration. Published patterns become visual display overlays — they do not constrain the aircraft to physical rails.

---

## 2. Architecture

### 2.1 Three-Tier Flight Engine
```
┌──────────────────────────────────────────────────────────────┐
│                     FLIGHT ENGINE                             │
│                                                               │
│   Tier 1: GUIDANCE (same for all aircraft)                    │
│   ├─ Track intercept: cross-track error → desired heading     │
│   ├─ Lead turns: bank early to capture next track             │
│   ├─ Wind correction: always applied, zero wind or not        │
│   └─ Waypoint capture: along-track overshoot + capture radius │
│                                                               │
│   Tier 2: PERFORMANCE (per-aircraft model)                    │
│   ├─ KIN (Kinematic): speed/alt from nav plan targets         │
│   └─ NRG (Energy): speed/alt from T-6 aero model             │
│       ├─ glideSinkFpm() for engine-out descent                │
│       ├─ excessThrustPerWeight() for powered flight            │
│       ├─ energyHeightFt() for can-I-make-it decisions          │
│       └─ Flap/gear drag management for energy window           │
│                                                               │
│   Tier 3: INTEGRATION (same for all aircraft)                 │
│   ├─ Position: x += (v_air × sin(hdg) + Wx) × dt             │
│   ├─ Heading: hdg += ω × dt, ω = g×tan(bank)/v_air           │
│   ├─ Bank: smooth roll via rollToward() at 45°/s              │
│   └─ TAS: iasToTasKt() always applied                         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Track Intercept Guidance (Lines, Not Points)
Aircraft intercept and fly along the line between waypoints, not toward a single point.
```javascript
// For each aircraft, each step:
const trackFrom = currentWaypoint;
const trackTo   = nextWaypoint;

// 1. Cross-track error: how far off the line am I?
const trackHdg  = Math.atan2(trackTo.x - trackFrom.x, trackTo.y - trackFrom.y);
const dx = aircraft.x - trackFrom.x;
const dy = aircraft.y - trackFrom.y;
const crossTrack = dx * Math.cos(trackHdg) - dy * Math.sin(trackHdg); // feet

// 2. Along-track distance: how far along the segment?
const alongTrack = dx * Math.sin(trackHdg) + dy * Math.cos(trackHdg);
const segLength  = Math.hypot(trackTo.x - trackFrom.x, trackTo.y - trackFrom.y);

// 3. Desired heading: track heading + intercept correction + wind crab
const interceptAngle = Math.atan(crossTrack * 0.002); // 0.002 rad/ft gain
const windCrab = windTriangle(trackHdg, v_tas, wind).crabRad;
const desiredHeading = trackHdg - interceptAngle + windCrab;

// 4. Waypoint capture: advance when along-track passes lead-turn distance
const turnRadius = (v_air * v_air) / (G_FTPS2 * Math.tan(targetBankRad));
const leadDist   = turnRadius * Math.tan(halfTurnAngle / 2);
if (alongTrack >= segLength - leadDist) advanceWaypoint();
```
**This produces**: straight flight on long legs, smooth arcs at turns, self-correcting wind drift, and zero S-turning or corner-cutting.

### 2.3 KIN vs NRG Performance Models
- **KIN (Kinematic)** — default for normal pattern traffic:
  - Speed: linear accel/decel toward nav-plan target (4 kt/s up, 6 kt/s down)
  - Altitude: fixed climb/descent rate (2,100 fpm up, 1,500 fpm down)
  - Special: break decel uses V² drag formula: $V(u) = 220 \cdot e^{-0.452 u}$
- **NRG (Energy)** — for PFL, engine failure, breakout:
  - Speed: `excessThrustPerWeight()` determines accel/decel from physics
  - Altitude: `glideSinkFpm(config, kias, altFt)` for engine-out descent
  - Energy gate: `energyHeightFt()` decides can-I-make-the-runway
  - Drag management: gear + flaps modulate sink rate to hit energy window
  - Best glide speeds from `T6A_GLIDE`: clean 125 kt, gear down 120 kt, landing 100 kt
- **Auto-switching**: PFL/Engine Failure commands switch to NRG. Rejoining the pattern switches to KIN. Manual override is always available via the UI dropdown.

### 2.4 Per-Aircraft Model Dropdown
```
┌─────────────────────────────────────────────┐
│ A1  CT-156  3,500 ft  220 kt  ⟨ OHB ⟩     │
│ [Breakout] [PFL] [Go-around]   Model: KIN ▼│
│                                             │
│ A2  CT-156  4,800 ft  120 kt  ⟨ PFL ⟩      │
│ [Cancel PFL]                   Model: NRG ▼│
└─────────────────────────────────────────────┘
```

---

## 3. Aerodynamic Baseline

All numbers from 15 Wing SMM (Aug 2024), EFIG (24 Jun 2026), and T-6A NFM. Traceability citations only — agents read this spec directly.

### 3.1 Speed Schedule (CT-156 Harvard II)
| Phase | Speed (KIAS) | Source |
|---|---|---|
| Initial / Pattern entry | 220 | SMM 4.14 ¶32 |
| Break rollout → inner downwind | 140 (decelerating from 220) | SMM 4.17 ¶39 |
| Downwind (at Perch arrival) | 120 | SMM 4.19 ¶43 |
| Final turn | 120 | SMM 4.19 ¶43 |
| Threshold | 100 | SMM 4.1 ¶1, D110 |
| Touchdown | 80–90 | SMM 4.9 ¶15 |
| Closed pattern climb | 140 | SMM 4.2, EFIG p.134 |
| Go-around climb | 140 → 220 | SMM 4.22 ¶53 |
| PFL glide (clean) | 125 | T-6A Max Glide Chart |
| PFL glide (gear down) | 120 | SMM 13.5 |

### 3.2 Bank Angles and G
| Maneuver | Bank (°) | G | Source |
|---|---|---|---|
| Overhead break | 60 | 2.0 | SMM 4.17 ¶39 |
| Pattern turns (upwind, crosswind) | 60 | 2.0 | SMM 4.14 ¶33 |
| Final turn | 35 nominal (30–45 range) | 1.22 | D391, SMM 4.19 |
| PFL orbit | 30 | 1.15 | SMM 13.6 ¶13 |
| Breakout climbing turn | 30–45 | 1.15–1.41 | SMM 4.16 ¶36 |
| Closed pattern climb | 50 | 1.56 | D400 |

### 3.3 Altitudes (CYMJ)
| Point | Alt (ft MSL) | AGL | Source |
|---|---|---|---|
| Field elevation | 1,892 | 0 | D373 |
| Pattern / initial / break | 3,500 | 1,608 | D109 (override of SMM 3,000) |
| Straight-in level-off | 2,700 | 808 | SMM 4.5 ¶8 |
| PFL High Key | 5,000 | 3,108 | SMM 13.5 ¶8, D396, D400 |
| PFL Low Key | 3,700 | 1,808 | SMM 13.8 ¶17 |
| PFL Base/Final Key | 2,900–3,000 | ~1,100 | SMM 13.9 ¶18 |

### 3.4 Stall and Speed Limits
| Limit | Value | Source |
|---|---|---|
| Clean stall speed ($V_{s0}$) | 86 KIAS | D158, D387 |
| Accelerated stall: $n_{\text{stall}} = (V_{\text{ias}}/86)^2$ | At 140 kt: 2.65 G, at 120 kt: 1.94 G | Standard aero |
| Stick shaker margin | +7 kt above stall (93 KIAS clean) | NFM p.1-52 |
| $V_{fe} / V_{le}$ (gear/flap limit) | 147 KIAS | SMM 4.6 ¶9 |
| $V_{mo}$ | 316 KIAS | NFM p.5-9 |
| Max G (clean) | +7.0 / -3.5 | NFM V-n diagram |
| Roll rate (normal) | 30–50 °/s | SMM 16.18 |
| Roll rate (tactical max) | 90 °/s | T6A_MANOEUVRE |

### 3.5 Glide Performance (Engine Out)
| Config | Best Glide (KIAS) | Sink Rate (fpm) | NM per 1,000 ft | L/D |
|---|---|---|---|---|
| Clean, feathered | 125 | 1,350 | 2.0 | 12.15 |
| Gear down | 105 (or 120 pattern) | 1,500 | 1.5 | — |
| Landing flaps | 95 | 1,850 | 1.1 | — |
| Windmilling | 110 | 2,350 | 1.0 | — |

### 3.6 Key Geometry
| Measurement | Value | Derivation |
|---|---|---|
| Break turn radius (220 kt, 60° bank) | 2,470 ft (0.41 NM) | $R = v^2 / (g \tan 60^\circ)$ |
| Final turn radius (120 kt, 35° bank) | 1,814 ft (0.30 NM) | $R = v^2 / (g \tan 35^\circ)$ |
| PFL orbit radius (120 kt, 30° bank) | 2,200 ft (0.36 NM) | $R = v^2 / (g \tan 30^\circ)$ |
| Glide slope intercept (3.0°) | 15,417 ft (2.54 NM) from threshold | $(2700 - 1892) / \tan(3^\circ)$ |
| 0.75 NM speed gate | 4,558 ft from threshold | $0.75 \times 6,076$ |
| Perch wind shift time | 29.8 s | $T = \pi \cdot v_{\text{tas}} / (g \tan 35^\circ)$ |

### 3.7 Special Equations
- **Break deceleration** (induced drag in 60° level turn):
  $$V(u) = 220 \cdot e^{-0.452 u} \quad u \in [0, 1] \text{ over 180° turn}$$
- **Cubic descent** (final turn, smooth altitude transition):
  $$z(u) = 3500 - 800 \cdot (3u^2 - 2u^3) \quad u = \Delta\psi / 180^\circ \in [0, 1]$$
  Guarantees $dz/du = 0$ at entry (Perch) and exit (centerline rollout).
- **Cross-track localizer** (straight corridor tracking):
  $$e_{\text{xtrack}} = (x - x_0)\cos\tau - (y - y_0)\sin\tau$$
  $$\psi_{\text{cmd}} = \tau + \text{crab} + \text{clamp}(K_p \cdot e_{\text{xtrack}}, -30^\circ, +30^\circ) \quad (K_p = 0.02^\circ/\text{ft})$$
- **Dynamic Perch** (wind compensation):
  $$\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$$
  $$T_{\text{turn}} = \pi \cdot v_{\text{tas}} / (g \tan 35^\circ) \approx 29.8\text{ s}$$

---

## 4. Pattern Definitions

> **Authoritative Coordinates**: See [`docs/traffic-pattern-matrix.md`](../docs/traffic-pattern-matrix.md) for exact $(x, y)$ positions and waypoint attributes.

### 4.1 PAT_INNER — Overhead Break Circuit
13 waypoints forming the primary tactical circuit.  
Phase sequence: `initial` → `break` → `inner_downwind` → `final_turn` → `final` → `landing` → `takeoff_climb` → `closed_pattern` → `inner_downwind` (loops).
- `break`: 60° bank, $V^2$ drag decel 220→140, drift with wind.
- `inner_downwind`: Pure pursuit to dynamic wind-shifted Perch at 140→120 KIAS.
- `final_turn`: Cubic descent 3,500→2,700, modulated bank 30°–45°, cross-track steering.
- `final`: Localizer tracking on 298° centerline, 3.0° glide slope capture at 2.54 NM.
- `closed_pattern`: 50° bank climb at 2,100 fpm to 3,500, rollout on 118° direct to Perch.

### 4.2 PAT_SI — Straight-In Pattern
Shares waypoints 0–5 with PAT_INNER, then diverges at "Abeam Departure End":
- Descend from 3,500 → 2,700 ft MSL.
- Extended downwind past outer pattern.
- 45° base turn at 140 KIAS.
- Rollout on extended centerline at 2,700 ft / 120 KIAS.
- **0.75 NM speed gate**: maintain 120 KIAS until 4,558 ft from threshold, THEN decelerate to 100 KIAS.

### 4.3 ENT_OHB — Overhead Break Entry
Dotted line, 4 waypoints joining PAT_INNER at the 45° entry leg (3,500 ft / 220 KIAS).

### 4.4 ENT_SI — Straight-In Entry
Dotted line, 4 waypoints joining PAT_SI at the base leg (2,700 ft / 120 KIAS).

### 4.5 PFL_HIGH_KEY — Practice Forced Landing from High Key
NRG model. Overhead threshold at 5,000 ft MSL / 125 KIAS clean → 180° continuous gliding turn to Low Key (3,700 ft / 120 KIAS, gear down) → Base Key (2,900 ft, flaps T/O) → Final rollout → Touchdown. Orbit: 30° bank, $R \approx 2,200\text{ ft}$. 200 ft AGL safety gate (SMM 13.14).

### 4.6 PFL_PATTERN — In-Circuit Engine Failure
NRG model. Triggered anywhere in circuit. Immediate zoom climb (`flyZoomT6A`): 2G pull to 20° nose-up, hold to 145 KIAS, push to capture 125 KIAS glide. If $V \le 150\text{ KIAS}$: level decel to 125.  
Energy gate: $H_e = h + V^2 / (2g)$ vs distance to threshold:
- **Sufficient**: intercept tangent of PFL circle, fly to Low Key.
- **Insufficient**: direct to threshold, straight-in forced landing.

### 4.7 PFL_FROM_AREA — Glide Inbound from Training Area
NRG model. Spawns at user-defined position via **radial/distance/altitude from airfield center**:
- Radial: 0–360° (default 090°)
- Distance: 1–30 NM (default 10 NM)
- Altitude: 3,000–15,000 ft MSL (default 8,000 ft)
Aircraft spawns engine-out at best glide (125 KIAS clean), heading toward field (reciprocal of radial). Glides using `glideSinkFpm('clean', 125, alt)`. Arrives at High Key (5,000 ft MSL). Excess altitude burned via false High Key (SMM 13.7 ¶16).

### 4.8 TAKEOFF — Runway Departure
KIN model. Lineup on RWY 29L threshold at 0 KIAS, heading 298°. Accelerate down runway, rotate at 85 KIAS, climb on runway heading at 140 KIAS to 2,500 ft MSL, transition to closed pattern at departure end.

### 4.9 BREAKOUT — Circuit Breakout
KIN model. Immediate climbing turn (30–45° bank, 1,500–2,000 fpm) to 3,500 ft MSL. Steers toward breakout point 2.0 NM south of outer pattern center. Re-enters via ENT_OHB or ENT_SI.

### 4.10 GO_AROUND — Wave-off Climbout
KIN model. Full power, climb straight ahead on 298° to 2,500 ft, level accel to departure end, zoom to 3,500 ft / 180 KIAS, accelerate to 220, crosswind turn to rejoin PAT_INNER downwind.

---

## 5. Spawn UI

### 5.1 Two-Dropdown System
- **Dropdown 1 — Pattern**: OHB, Straight In, Entry OHB, Entry SI, PFL, Takeoff
- **Dropdown 2 — Start Point** (changes dynamically per pattern):

| Pattern | Start Points |
|---|---|
| OHB | Initial · Break · Base · Abeam Threshold · Inner Downwind · Perch · 2-Mile Final · 1-Mile Final |
| Straight In | 2-Mile Final · 1-Mile Final · Base |
| Entry OHB | Entry Gate |
| Entry SI | Entry Gate |
| PFL | High Key · Low Key · From Area (radial/dist/alt picker) |
| Takeoff | Runway 29L |

### 5.2 PFL "From Area" Inputs
When PFL pattern is selected and "From Area" start point chosen, three extra input fields appear:
- **Radial** (°): direction FROM airfield center (number box, 0–360, default 090)
- **Distance** (NM): range from airfield (number box, 1–30, default 10)
- **Altitude** (ft MSL): starting altitude (number box, 3,000–15,000, default 8,000)

---

## 6. Behavioral Rules

1. **Aircraft NEVER disappear randomly.** They keep flying their pattern continuously.
2. **If an aircraft finishes a route with no next instruction**: revert to OHB (PAT_INNER) pattern.
3. **Smooth vector blending**: all transitions between patterns/phases use roll-rate-limited heading changes over 3–5 seconds (30–50°/s). No instantaneous heading or speed jumps.
4. **Landing is explicit**: aircraft only land when probability rolls at threshold (20% full stop, 80% touch-and-go).
5. **Wind is always applied**: zero wind is NOT a special case. The same physics runs at 0 kt and 30 kt.
6. **Accelerated stall protection**: bank angle capped at accelerated stall limit. At 120 KIAS: max bank 59°. At 140 KIAS: max bank 68°.
7. **$V_{fe}$ guard**: no gear/flaps deployment above 147 KIAS.

---

## 7. The Screen, UI Controls & Progressive Disclosure

### 7.1 Layout Overview
Three columns at 1366 × 768 and up, none covering another (R2), each side column collapsed with a real button (`ui-kit/panel.js`). Left defines routes, right spawns aircraft, playback bar sits above the map.

```
┌ Routes ──────────────────────┐┌ ▶ Play ⏪ Rewind −10s +10s Reset 8× ▾ 0:12:40 Running  250°T 20 kt 2D|3D Fit Layers▾         ┐┌ Aircraft ──────────────────────┐
│ ▸ Profiles and notes         ││                                                                              ││ Spawn  Pattern: OHB ▾          │
│ PAT_INNER   pattern          ││                                                                              ││ Start:  Initial ▾  Delay 0 s   │
│ PAT_SI      straight-in      ││                                                                              ││ Model:  KIN ▾                  │
│ ENT_OHB     → PAT_INNER #7   ││                                                                              ││ [+ Spawn]  [+ Pair, 20 s apart]│
│ + New route ▾                ││                map: satellite, grid, routes, aircraft, bubbles               ││ ▸ Traffic settings             │
│                              ││                                                                              ││ A1 CT-156 PAT_INNER 3,500 ft   │
│ PAT_INNER (selected)         ││                                                                              ││    GS 162 kt crab 7° R  Flying │
│ Name [PAT_INNER]             ││                                                                              ││ A2 CT-156 ENT_OHB  waiting     │
│ #  Label     Alt  Speed  G   ││                                                                              ││    starts at 2:17      ▸ Edit  │
│ 0  Threshold 1880 Landing -  ││                                                                              ││                                │
│ 11 Perch     3500 Turn   1.4 ││                                                                              ││ Conflicts                      │
│ + Point  Delete point        ││                                                                              ││ ⚠ CONFLICT A1/A2 180 ft lat,   │
│                              ││                                                                              ││   120 ft vert                  │
│ ▸ Leg distances              ││                                                                              ││                                │
└──────────────────────────────┘└──────────────────────────────────────────────────────────────────────────────┘└────────────────────────────────┘
```

### 7.2 Progressive Disclosure (R22)
- **Playback bar**: Play/Pause, Rewind, −10 s, +10 s, Reset, speed (0.25× to 8×), clock, status, 2D/3D toggle, Fit, Layers. Wind box shows direction (°T) and speed (kt).
- **Layers menu**: trails, altitude/speed labels, waypoint points, leg distances, conflict bubbles, caution rings, satellite photo. Under More: opacity, grid order, photo alignment.
- **Routes list**: one line per route with color, kind, and link; "+ New route" dropdown.
- **Selected route**: name, point table (number, label, alt, speed phase, bank/G).
- **Spawner**: Pattern dropdown, Start Point dropdown, model (KIN/NRG), delay, + Spawn, + Pair (20 s apart, max 200 aircraft), Clear finished.
- **Aircraft list**: callsign, type, pattern, altitude, airspeed, status, GS/crab, and Maneuver menu (Breakout, Go-Around, PFL, Remove).
- **Conflicts**: pair readouts with lateral and vertical separation in red (⚠ CONFLICT) or yellow (△ CAUTION).
- **Settings menu**: all numbers and toggles live in one closed "Traffic settings" panel (R22).

### 7.3 Defaults & First Look
Every setting starts filled in so the first look is clean and intuitive:
- Playback speed: 8×
- 2D or 3D: 2D
- Wind: calm (360°T at 0 kt)
- Default aircraft type: CT-156 Harvard II (paint: `harvard`)
- Pattern: PAT_INNER (Runway 29L, left-hand, 3,500 ft MSL)
- Conflict limits: 200 ft lateral, 200 ft vertical (caution: 500 ft / 500 ft)

---

## 8. Code Reuse Map & Core Libraries

### 8.1 Reuse Map
- **KEEP AS-IS (5,300+ lines, zero changes)**:
  `map2d.js` (673), `view3d.js` (1,146), `layout.js` (186), `playback-bar.js` (160), `settings-panel.js` (130), `defaults.js` (196), `types.js` (169), `profile.js` (356), `clock.js` (98), `dice.js` (28), `readouts.js` (149), `glue.js` (69), `profile-store.js`, `profiles-panel.js`, `editor.js`, `index.js`, CSS.
- **KEEP + ADAPT (~200 lines changed)**:
  - `sim.js` (1,466): Rewind/snapshot engine, event queue, conflict detection, callsign mgmt, public API kept; `fly(a)` internals call `flight-engine.js`.
  - `route.js` (842): Geometry utils, `computeWindPerch()`, `generateWindAdjustedTrack()`, display functions kept; `posOnRoute()` retired as flight-critical.
  - `aircraft.js` (341): DOM gen, events, commands, roster kept; spawn presets adapted for two-dropdown UI.
  - `scene.js` (70): Data pipeline; propagates `phase`, `model`, `bankDeg`.
  - `moose-jaw.json` (193): Airfield, runways, PAT_INNER, entries kept; prune legacy SPL1–4.
- **BUILD NEW (~500 lines + ~350 tests)**:
  - `src/modules/traffic/flight-engine.js` (~300 lines): Track intercept, KIN/NRG models, phase machine.
  - `src/modules/traffic/nav-plans.js` (~200 lines): Pattern waypoint definitions from pattern matrix.
  - `tests/unit/traffic/flight-engine.test.js` (~200 lines): Flight engine unit tests.
  - `tests/unit/traffic/nav-plans.test.js` (~150 lines): Nav-plan waypoint tests.

### 8.2 Core Libraries Used (Read-Only)
| Import | From | How We Use It |
|---|---|---|
| `rollToward(current, target, maxDelta)` | `src/core/flight-math.js` | Smooth bank transitions at 45°/s |
| `dampedClimbG(current, target, rate)` | `src/core/flight-math.js` | Altitude convergence to glide slope |
| `turnRadiusFt(ktas, bankDeg)` | `src/core/flight-math.js` | Lead-turn distance calculation |
| `bankDegFromG(g)` | `src/core/flight-math.js` | Convert G to bank angle |
| `iasToTasKt(kias, altFt)` | `src/core/t6-performance.js` | TAS conversion (always applied) |
| `glideSinkFpm(config, kias, altFt)` | `src/core/t6-performance.js` | NRG: engine-out sink rate |
| `excessThrustPerWeight(kias, altFt, g)` | `src/core/t6-performance.js` | NRG: powered climb/accel |
| `energyHeightFt(altFt, ktas)` | `src/core/t6-performance.js` | NRG: can-I-make-the-runway |
| `stallLimitG(kias)` | `src/core/t6-performance.js` | Stall protection |
| `flyZoomT6A(kias, altFt)` | `src/core/t6-performance.js` | PFL zoom climb |
| `windTriangle(hdg, ktas, wind)` | `src/core/wind.js` | Wind crab angle on all legs |
| `ktToFtps(kt)` | `src/core/units.js` | Speed conversion |
| `FT_PER_NM`, `G_FTPS2` | `src/core/units.js` | Physical constants |
| `wrapDeg180(deg)` | `src/core/angles.js` | Heading arithmetic |

---

## 9. Task Breakdown (Pre-Phase through Phase 5)

### Pre-Phase: Documentation Sync
- [x] Merge `SPEC-traffic.md` + `SPEC-traffic-vector.md` into one unified spec
- [x] Commit `refined_pattern_matrix.md` to `docs/traffic-pattern-matrix.md`
- [x] Register D406 in `docs/records/plan-decisions.md` & `docs/records/decisions-log.md`
- [x] Register R34 in `docs/records/plan-requirements.md`
- [x] Update HANDOVER.md, docs/handover/traffic.md, tasks/traffic/todo.md, tasks/traffic/plan.md, POST_PROTOTYPE_QUEUE.md, .agent/memory/handoff.md
- [x] Create standalone checklist `tasks/traffic/vector-migration-todo.md`

### Phase 1: Core Flight Engine (`flight-engine.js`)
- [ ] **Task 1.1**: Create `flight-engine.js` — track intercept guidance
  - `stepAircraft(aircraft, dt, wind, navPlan)` → updates position, heading, bank, speed, alt
  - Track intercept with cross-track error and along-track distance
  - Lead-turn initiation: `leadDist = R × tan(halfAngle / 2)`
  - Wind correction via `windTriangle()` on every step
- [ ] **Task 1.2**: KIN performance model
  - Linear accel/decel (4 kt/s up, 6 kt/s down), climb 2,100 fpm, descend 1,500 fpm
  - Break special: $V(u) = 220 \cdot e^{-0.452 u}$
  - Final turn special: cubic descent $z(u) = 3500 - 800(3u^2 - 2u^3)$
- [ ] **Task 1.3**: NRG performance model
  - Speed from `excessThrustPerWeight()` or best glide; altitude from `glideSinkFpm()`
  - Energy gate: `energyHeightFt()` vs threshold distance
  - Configuration management (clean → gear down → flaps) and $V_{fe}$ guard (147 KIAS)
- [ ] **Task 1.4**: Phase state machine
  - State machine covering all circuit and emergency phases

### Phase 2: Pattern Definitions (`nav-plans.js`)
- [ ] **Task 2.1**: Define all nav plans in `nav-plans.js` from `docs/traffic-pattern-matrix.md`
- [ ] **Task 2.2**: Pattern-specific guidance overrides (break arc, perch pursuit, cubic descent, 3.0° glide slope)

### Phase 3: Integration (sim.js Swap)
- [ ] **Task 3.1**: Replace rails in `sim.js` (`fly(a)` calls `stepAircraft()`)
- [ ] **Task 3.2**: Migrate existing command blocks (breakout, PFL, go-around, closed pattern)
- [ ] **Task 3.3**: Sync display via `scene.js`
- [ ] **Task 3.4**: Update test suites (`sim.test.js`, `vector-sim.test.js`, `route.test.js`)

### Phase 4: Spawn UI Redesign
- [ ] **Task 4.1**: Build two-dropdown spawn UI (Pattern + Start Point)
- [ ] **Task 4.2**: Clean up aircraft types (remove fictional CT-157, confirm Harvard default)
- [ ] **Task 4.3**: Fix aircraft disappearance (never drop without explicit landing; fallback to OHB)

### Phase 5: Polish & Cleanup
- [ ] **Task 5.1**: Settings panel cleanup (retire dead rounded-turns options)
- [ ] **Task 5.2**: Visual polish (solid patterns, dotted entries)
- [ ] **Task 5.3**: Reset button label ("Reset to Standard Defaults", D384)

---

## 10. Testing Strategy

1. **Core Math Verification**: `src/core/` unit tests (~800 tests) remain read-only and passing green.
2. **Dedicated Engine Tests**:
   - `tests/unit/traffic/flight-engine.test.js` (~60 tests): track intercept, roll rate blending, lead turns, KIN/NRG integration, stall guards.
   - `tests/unit/traffic/nav-plans.test.js` (~30 tests): coordinate integrity against `docs/traffic-pattern-matrix.md`.
3. **Module Regression Tests**:
   - `tests/unit/traffic/sim.test.js`: adapt for vector engine.
   - `tests/unit/traffic/route.test.js`: test display overlays and geometry utilities.
4. **Tolerance Standards (D371)**:
   - Speed: $\pm 10\text{ kt}$
   - Altitude: $\pm 100\text{ ft}$
   - Angles (heading, bank): $\pm 5^\circ$
   - G-load: $\pm 0.5\text{ G}$
   - Separation: $\pm 100\text{ ft}$
5. **Zero Wind & Crosswind Dual Verification**:
   - All tests must pass identically in calm air ($0\text{ kt}$) and crosswind ($10\text{–}20\text{ kt}$).

---

## 11. Storage, Security & Performance

- **Storage**: Setups saved via `app.storage` under scope `traffic`. Strict shape, size and key validation in `profile.js` (max 20 setups, 400 KB each, 2 MB total).
- **Security**: No `innerHTML`, no arbitrary eval. Tile URLs are parameterized Esri numbers only.
- **Performance**: Route overlays cached; stepping is fixed 0.05 s; snapshots every 10 s; rewind playback $< 50\text{ ms}$.

---

## 12. Boundaries & Invariants

- **No editing `original/`** (D368, D372).
- **Core math (`src/core/`) is read-only.**
- **Single Source of Truth for Waypoints**: [`docs/traffic-pattern-matrix.md`](../docs/traffic-pattern-matrix.md).
- **Never stop or cap simulation prematurely**: station keeping is closed-loop (D370, D374).
- **Harvard II is CT-156** (D373). Default active runway: 29L (298° true), left-hand circuits (D378).
