# Authoritative Pattern Matrix — Vector Guidance Migration
> **This document is the single source of truth for nav-plan waypoints.**  
> Implementation agents read this as ground truth for `nav-plans.js`.

## Coordinate System
- Origin: CYMJ anchor (50.3303°N, 105.5592°W)
- X: feet East of origin (positive = east)
- Y: feet North of origin (positive = north)
- Alt: feet MSL
- Runway 29L: 298° true, threshold at (3104, -3194), departure end at (-4066, 681)
- Field elevation: 1,892 ft MSL

---

## 1. PAT_INNER — Overhead Break Circuit (Primary)

**Flight model**: KIN (kinematic)  
**Closed**: Yes (loops at threshold via landing check)  
**Color**: `#58a6ff` (blue)

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Bank (°) | G | Phase | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Threshold | 3,104 | -3,194 | 1,880 | 100 | 0 | 1 | `landing` | Touchdown/landing check |
| 1 | Departure End | -4,066 | 681 | 2,500 | 140 | 0 | 1 | `takeoff_climb` | Closed pattern branch trigger at x ≤ -4000 |
| 2 | Climb Out | -14,866 | 7,020 | 3,500 | 180 | 0 | 1 | `climb` | Climbing straight ahead |
| 3 | Upwind Turn | -21,000 | 10,327 | 3,500 | 220 | 60 | 2 | `crosswind` | Turn crosswind (60°/2G) |
| 4 | Crosswind | -28,411 | -1,450 | 3,500 | 220 | 0 | 1 | `crosswind` | Level crosswind leg |
| 5 | Abeam Dep End | -10,974 | -12,100 | 3,500 | 220 | 0 | 1 | `downwind` | **SI descent trigger** |
| 6 | Downwind | 17,150 | -28,181 | 3,500 | 220 | 0 | 1 | `downwind` | Mid-downwind |
| 7 | 45° Leg | 21,906 | -19,364 | 3,500 | 220 | 0 | 1 | `initial` | ENT_OHB merge point |
| 8 | Initial | 19,741 | -12,172 | 3,500 | 220 | 0 | 1 | `initial` | Run-in along extended centerline |
| 9 | Break | -288 | -1,441 | 3,500 | 220 | 60 | 2 | `break` | **Break point** (+2,048 ft past threshold) |
| 10 | Break Exit | -3,385 | -4,323 | 3,500 | 140 | 0 | 1 | `inner_downwind` | Rollout at 180° turn, 118° true |
| 11 | Perch | 7,146 | -10,275 | 3,500 | 120 | 35 | 1.4 | `final_turn` | Dynamic wind-shifted: P_perch = P_calm - W × T_turn |
| 12 | Window | 9,076 | -6,411 | 2,119 | 110 | 0 | 1 | `final` | Rollout on centerline, 3.0° glide slope |

### Phase Transitions
- `initial` → `break`: Aircraft crosses waypoint 9 (Break)
- `break` → `inner_downwind`: 180° turn accumulated (heading ≈ 118°)
- `inner_downwind` → `final_turn`: Perch capture (within 200 ft or along-track overshoot)
- `final_turn` → `final`: Rollout on 298° with cross-track < 50 ft
- `final` → `landing`: Threshold crossing (waypoint 0)
- `landing` → `takeoff_climb`: Touch-and-go (80% probability → advances power)
- `takeoff_climb` → `closed_pattern`: Past departure end at x ≤ -4000 → 50° bank climbing turn
- `closed_pattern` → `inner_downwind`: 180° accumulated or heading ≈ 118° → wings level direct to Perch

### Key Aerodynamics
- **Break decel**: V(u) = 220 × e^(-0.452u) over 180° turn (u ∈ [0,1])
- **Final turn descent**: z(u) = 3500 - 800(3u² - 2u³) cubic easing
- **Perch wind shift**: T_turn = π × v_tas / (g × tan(35°)) ≈ 29.8 s

---

## 2. PAT_SI — Straight-In Pattern

**Flight model**: KIN (kinematic)  
**Closed**: Yes (can loop)  
**Color**: `#7ee787` (green)

Same as PAT_INNER waypoints 0–5, then diverges:

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Bank (°) | G | Phase | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Threshold | 3,104 | -3,194 | 1,880 | 100 | 0 | 1 | `landing` | Shared with PAT_INNER |
| 1–5 | *(Same as PAT_INNER 1–5)* | | | | | | | | Shared upwind/crosswind/downwind |
| 6 | SI Downwind | -3,233 | -16,592 | 2,700 | 140 | 0 | 1 | `si_downwind` | Level at 2,700 after descent |
| 7 | SI Base Turn | 21,427 | -30,872 | 2,700 | 140 | 45 | 1.4 | `si_base` | Turn toward final |
| 8 | SI Base | 26,407 | -22,172 | 2,700 | 120 | 0 | 1 | `si_base` | ENT_SI merge point |
| 9 | SI Final (2 NM) | 16,828 | -10,708 | 2,700 | 120 | 0 | 1 | `si_final` | Stabilized on centerline |
| 10 | Window (¾ NM) | 6,663 | -4,560 | 2,250 | 120 | 0 | 1 | `si_final` | **0.75 NM speed gate** — decel starts HERE |
| 11 | Threshold | 3,104 | -3,194 | 1,880 | 100 | 0 | 1 | `landing` | Touchdown |

### Critical Rule: 0.75 NM Speed Gate
- Aircraft maintains 120 KIAS from SI Base all the way down final
- Does NOT slow down until crossing the Window (¾ NM = 4,558 ft from threshold)
- Window position: along 298° bearing, 4,558 ft from threshold → (6,663, -4,560)
- From Window to Threshold: decelerate 120 → 100 KIAS over 4,558 ft

### Phase Transitions
- `downwind` → `si_descent`: Abeam departure end (waypoint 5) → descend 3,500 → 2,700
- `si_descent` → `si_downwind`: Level at 2,700 ft
- `si_base` → `si_final`: Rollout on extended centerline
- `si_final` → `landing`: Threshold crossing

---

## 3. ENT_OHB — Overhead Break Entry

**Flight model**: KIN  
**Closed**: No (merges into PAT_INNER at waypoint 7)  
**Color**: `#bc8cff` (purple)  
**Display**: Dotted line

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Bank (°) | Phase |
|---|---|---|---|---|---|---|---|
| 0 | Entry Start | -8,694 | -66,644 | 3,500 | 220 | 0 | `entry` |
| 1 | Entry Mid | 4,806 | -46,304 | 3,500 | 220 | 0 | `entry` |
| 2 | Entry Gate | 17,000 | -28,031 | 3,500 | 220 | 0 | `entry` |
| 3 | Merge (→ PAT_INNER #7) | 21,689 | -19,427 | 3,500 | 220 | 0 | `initial` |

Coordinates from current ENT1 in `moose-jaw.json`.

---

## 4. ENT_SI — Straight-In Entry

**Flight model**: KIN  
**Closed**: No (merges into PAT_SI at waypoint 8)  
**Color**: `#7ee787` (green, dashed)  
**Display**: Dotted line

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Bank (°) | Phase |
|---|---|---|---|---|---|---|---|
| 0 | Entry Start | -3,850 | -69,669 | 3,500 | 160 | 0 | `entry` |
| 1 | Entry Mid | 20,000 | -33,669 | 2,700 | 140 | 0 | `entry` |
| 2 | Entry Gate | 26,449 | -21,979 | 2,700 | 120 | 0 | `entry` |
| 3 | Merge (→ PAT_SI #8) | 26,407 | -22,172 | 2,700 | 120 | 0 | `si_base` |

Coordinates from current ENT2 in `moose-jaw.json`, merge point adjusted to PAT_SI base.

---

## 5. PFL_HIGH_KEY — Practice Forced Landing

**Flight model**: NRG (energy — uses `t6-performance.js`)  
**Closed**: No (terminates at landing)  
**Color**: `#ff9bce` (pink)

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Config | Phase |
|---|---|---|---|---|---|---|---|
| 0 | High Key | 3,104 | -3,194 | 5,000 | 125 | Clean, feathered | `high_key` |
| 1 | Low Key | 7,146 | -10,275 | 3,700 | 120 | Gear DOWN | `low_key` |
| 2 | Base Key | 9,076 | -6,411 | 2,900 | 120 | Flaps T/O | `base_key` |
| 3 | Threshold | 3,104 | -3,194 | 1,892 | 100 | Flaps LDG | `pfl_final` |

### PFL Energy Model
- **Glide performance**: `glideSinkFpm('clean', 125, alt)` → 1,350 fpm (2.0 NM/1,000 ft)
- **Gear down**: `glideSinkFpm('gearDown', 120, alt)` → 1,500 fpm (1.5 NM/1,000 ft)
- **Landing config**: `glideSinkFpm('landing', 100, alt)` → 1,850 fpm (1.1 NM/1,000 ft)
- **Orbit**: 30° bank, R ≈ 2,200 ft (0.36 NM), diameter ≈ 4,400 ft (≈ 1 NM per SMM)
- **200 ft AGL safety gate**: Mandatory go-around unless runway assured

---

## 6. TAKEOFF — Runway Departure

**Flight model**: KIN  
**Closed**: No (transitions to PAT_INNER closed pattern or departure)

| # | Label | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Phase |
|---|---|---|---|---|---|---|
| 0 | Lineup | 3,104 | -3,194 | 1,892 | 0 | `lineup` |
| 1 | Rotation | 1,500 | -2,250 | 1,892 | 85 | `takeoff_roll` |
| 2 | Liftoff | 500 | -1,660 | 1,900 | 100 | `initial_climb` |
| 3 | Gear Up | -2,000 | -190 | 2,200 | 140 | `climb` |
| 4 | Departure End | -4,066 | 681 | 2,500 | 140 | `climb` |

After waypoint 4: transitions to closed pattern climb (50° bank) or straight departure.

---

## 7. Master Spawn Point Catalog

**This is the two-dropdown spawn menu.** Dropdown 1 selects the pattern, Dropdown 2 selects the start point.

| Pattern | Start Point | X (ft) | Y (ft) | Alt (MSL) | Speed (KIAS) | Heading (°T) | Phase |
|---|---|---|---|---|---|---|---|
| **OHB** | Initial (2 NM) | 19,741 | -12,172 | 3,500 | 220 | 298 | `initial` |
| **OHB** | Break | -288 | -1,441 | 3,500 | 220 | 298 | `break` |
| **OHB** | Base (ENT merge) | 21,906 | -19,364 | 3,500 | 220 | 298 | `initial` |
| **OHB** | Abeam Threshold | -10,974 | -12,100 | 3,500 | 220 | 118 | `downwind` |
| **OHB** | Inner Downwind | -3,385 | -4,323 | 3,500 | 140 | 118 | `inner_downwind` |
| **OHB** | Perch | 7,146 | -10,275 | 3,500 | 120 | 118 | `final_turn` |
| **OHB** | 2-Mile Final | 15,500 | -10,200 | 2,700 | 120 | 298 | `final` |
| **OHB** | 1-Mile Final | 9,076 | -6,411 | 2,119 | 110 | 298 | `final` |
| **Straight In** | 2-Mile Final | 16,828 | -10,708 | 2,700 | 120 | 298 | `si_final` |
| **Straight In** | 1-Mile Final | 6,663 | -4,560 | 2,250 | 120 | 298 | `si_final` |
| **Straight In** | Base | 26,407 | -22,172 | 2,700 | 140 | 298 | `si_base` |
| **Entry OHB** | Entry Gate | -8,694 | -66,644 | 3,500 | 220 | 298 | `entry` |
| **Entry SI** | Entry Gate | -3,850 | -69,669 | 3,500 | 160 | 298 | `entry` |
| **PFL** | High Key | 3,104 | -3,194 | 5,000 | 125 | 298 | `high_key` |
| **PFL** | Low Key | 7,146 | -10,275 | 3,700 | 120 | 118 | `low_key` |
| **PFL** | From Area | *Computed* | *Computed* | *User-defined* | 125 | *Reciprocal* | `pfl_inbound` |
| **Takeoff** | Runway 29L | 3,104 | -3,194 | 1,892 | 0 | 298 | `lineup` |

### PFL "From Area" Spawn Computation
When "From Area" is selected, three input fields appear:
- **Radial** (°): direction FROM airfield center, 0–360, default 090°
- **Distance** (NM): 1–30 NM from airfield, default 10 NM
- **Altitude** (ft MSL): 3,000–15,000, default 8,000

Spawn position computed as:
```
x = distance_ft × sin(radial_rad)
y = distance_ft × cos(radial_rad)
heading = (radial + 180) % 360    // reciprocal, toward field
```
Aircraft spawns engine-out, NRG model, 125 KIAS clean glide. Target: High Key at 5,000 ft MSL. If arriving above 5,000: false High Key (fly runway heading until half excess altitude burned). If arriving below 5,000: direct to nearest key or threshold.

---

## 8. Flight Model Assignment

| Pattern | Default Model | Why |
|---|---|---|
| PAT_INNER | KIN | Standard kinematic speed/altitude profiles |
| PAT_SI | KIN | Standard kinematic |
| ENT_OHB | KIN | Standard entry |
| ENT_SI | KIN | Standard entry |
| PFL_HIGH_KEY | **NRG** | Uses `glideSinkFpm()`, energy management |
| PFL_PATTERN | **NRG** | Uses `flyZoomT6A()`, energy gates |
| TAKEOFF | KIN | Acceleration profile |
| BREAKOUT | KIN | Climbing vector to breakout point |
| GO_AROUND | KIN | Climb-out + rejoin |

Commands that auto-switch to NRG: `engine_fail`, `pfl_current`, `climb_high_key`
