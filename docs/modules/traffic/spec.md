> **Note (reset, 4 Oct 2026):** this is the spec as it stood before the reset, moved here unchanged. It is refreshed against this module's new `requirements.md` and `decisions.md` when the module's work resumes. Where it disagrees with them, they win. Lines saying the code must give "the same answer V6 gives" or must match V6 are replaced: flight math is checked against the manuals and standard aerodynamics (ALL-R22, Patrick's answer Q-ALL-4).
>
> **Replaced old decisions:** this spec still cites D6, D10, D117, D118, D134, D374, D384, D387, D389, D396, D400, D406, which are no longer in force. The "Replaced old decisions" section of `../../DECISIONS.md`, `../turn-fight/decisions.md` and `decisions.md` says what took each one's place.

# Traffic Pattern Sim spec

Moved from `specs/SPEC-traffic.md` (the old copy is in `archive/specs/`).

# Spec: `traffic`, the Traffic Pattern Sim

> **Authoritative Flight Guidance: This spec supersedes SPEC-traffic-vector.md**  
> **Status**: Approved (D406, R34) — Vector Guidance Migration Ratification  
> **Date**: 2026-10-02  
> **Module ID**: `traffic` in [`archive/SPEC.md`](../../../archive/SPEC.md)  
> **Authoritative Companion**: Master Pattern Matrix at [`docs/references/traffic-pattern-matrix.md`](../../references/traffic-pattern-matrix.md) (single source of truth for waypoints & coordinates)  
> **Decisions**: D6, D10, D46, D109, D110, D117, D118, D134, D158, D368–D400, D406, D412 | **Requirements**: R2, R3, R4, R6, R8, R9, R14, R16, R21, R22, R24–R27, R34  
> **Architecture Update (D412)**: Flight model uses Hybrid Rails/Physics — see SPEC_hybrid_migration.md for full details. Rails for stable legs via generateWindAdjustedTrack(), Physics for dynamic maneuvers via flight-engine.js.  

---

## 1. How the aircraft moves (approved 4 Oct 2026, Traffic refactor PR 2)

Patrick approved this wording on 4 Oct 2026 (08:45Z). It replaces the old sections 1 ("Why we're doing this"), "Hard Invariants" and 2.1-2.2. The closed pattern, High Key, go-around, breakout and PFL controllers, and their 1 s blend back to the rail, stay until refactor PR 3 and PR 4.

1. **One mover.** One path follower is the only code that writes an aircraft's position, heading, bank and pitch. The three phase machines become one. The manoeuvre controllers (closed pattern, High Key, go-around, breakout, PFL) still run until PR 3 and PR 4, but they hand their position to the path follower instead of writing it themselves.
2. **Paths are built from the T-6, when they are needed.** A path is a smooth ground track (no corners) with the height and speed the aircraft can actually fly along it. It is built from the aircraft's performance and today's wind at the moment the aircraft needs it. Corners on the drawn route are only where the turns go, not part of the track.
3. **Heading is continuous.** Heading is the path's track plus the crab for the wind, worked out at every point along it. It never steps.
   - Today the heading jumps up to about 8° in one 0.05 s step at every route corner. That happens hundreds of times per circuit, at every wind. It is the jitter you see, not physics rounding (measured 4 Oct on main).
4. **Bank comes from the turn.** Bank = tan⁻¹(true airspeed × heading rate ÷ g), from the path's own curvature and ground speed, so the same ground track needs more bank downwind and less into wind (standard aerodynamics).
5. **Rolls ease in and out.** Bank changes at a roll rate that eases in and out, never instantly. Roll rate is a setting: default 45°/s, an estimate (no manual page gives a normal roll rate). Today's 90°/s in the breakout becomes the same setting.
6. **Pitch comes from the climb or descent.** Pitch = flight path angle + angle of attack. The angle of attack grows with G and falls with speed squared, matched to the SMM attitudes: normal climb at 180 KIAS about 10-12° nose up, best-rate climb at 140 KIAS about 15° (SMM 3.14 para 35; EFIG p.126). The match is an estimate until checked on screen.
7. **Height and speed change at achievable rates.** Climbs and accelerations come from full-power excess thrust at the turn's real G (`excessThrustPerWeight`). Decelerations come from idle drag. Nothing is blended between route points by distance.
8. **Speeds name their kind.** True airspeed is worked out from indicated airspeed and height everywhere. Indicated airspeed is no longer used as true airspeed in calm air. Track goes where track is meant, heading where heading is meant.
9. **What you see is what is flown.** The 2D and 3D views draw the sim's own heading, bank and pitch. The 3D view stops working out its own bank from heading change (view3d.js:98-134). If a little drawn smoothing is still needed after this, it smooths only the picture; the flown numbers stay exact (Patrick, 08:01Z).


## 1a. Manoeuvres and rejoins (approved 4 Oct 2026, Traffic refactor PR 4)

Patrick approved this wording on 4 Oct 2026 (09:56Z). It replaces the old 4.9-4.11 text and adds touch-and-go and High Key from anywhere.

### One climbing turn for every rejoin

15. **One controller.** The closed pattern, High Key from anywhere, the go-around and the breakout all use today's closed-pattern climbing turn as one controller. The 1 s slide back onto the path, the pre-drawn High Key path and the extra phase machines go.
16. **The climbing turn.**
    - Bank comes from the setting, 45-60° (default 50°). It can roll up to 90° to stop the climb smoothly and turn toward the target (TR-R33).
    - The climb is at full power and 140 KIAS. The climb rate comes from excess thrust at the turn's real G (`excessThrustPerWeight`), so it climbs less while turning harder.
    - Pitch comes from the climb (spec item 6) and is shown.
17. **Aim at where it joins, not at a point.** The turn aims at the place where it will meet its next path:
    - closed pattern: the inner downwind line of today's built circuit, then the circuit's own perch and final turn;
    - High Key: the 1/8 NM run-in (760 ft) to High Key;
    - breakout: the ENT1 line at pattern height, at least 1 NM out (TR-R34).
18. **Hand over only once on the path.** Control passes to the next path only when the aircraft is on it, with the same place, track, bank and pitch (item 13a). No snap and no slide.
    - Today the snap is 31-69 ft and the go-around slide is about 4 NM in 1 s (measured 4 Oct).

### Each manoeuvre

19. **Closed pattern (4.11).** Pull-up at or after the upwind end of the runway (WFO art 402). One continuous climbing turn to the inner downwind, levelling at 3,500 ft, then the circuit's own perch and final turn (TR-R33).
20. **Go-around (4.10).** Full power, straight ahead on the runway track. It levels at 2,500 ft until it crosses the upwind end of the runway, speeding up there, then trades that speed for height after it crosses (Patrick, 09:14Z). Then it flies the same climb-out as a take-off (item 10): climb at 180 KIAS to 3,500, accelerate to 220, crosswind turn at 220 onto the outer pattern (Patrick's card "Like a take-off", 09:18Z).
21. **Touch-and-go.** It touches down and rolls on the runway from where it landed, then flies the take-off climb-out (item 10). It no longer jumps back to the threshold. The ground roll uses lift-off at 85 KIAS (today's take-off number, an estimate until checked).
22. **Breakout (4.9).** An immediate climbing turn to 4,500 ft, staying 2 NM south of the pattern and clear of the rejoin lines, then rejoining on the ENT1 line at pattern height at least 1 NM out (TR-R34). Its bank and climb come from the same controller (item 16), not the old fixed 30-45° and 1,500-2,000 ft/min.
23. **High Key from anywhere.** Press High Key anywhere: the aircraft flies the climbing turn onto the 1/8 NM run-in, climbs at full power, and arrives at High Key on the line. From there the PFL (PR 3) takes over.

### Check on screen, at calm and in a strong wind

- Closed pattern from the runway, go-around from short final, touch-and-go, breakout from downwind, and High Key from downwind and from initial.
- Each one climbs, turns, levels and joins with no jump, slide or snap.
- Bank stays within the setting except to stop the climb.
- Every aircraft that rejoins lands on the runway.

---

## 2. Architecture

### 2.3 KIN vs NRG Performance Models
- **KIN (Kinematic)** — default for normal pattern traffic:
  - Speed: linear accel/decel toward nav-plan target (+4.0 kt/s up, -2.7 kt/s down, computed from T-6 `excessThrustPerWeight()`)
  - Altitude: climb via `excessThrustPerWeight()` and formula/physics-based descent (caps removed per D412)
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

### 2.5 Dynamic Downwind Geometry (`computeBreakRollout`)
Point 10 (Break Exit) position is dynamically computed by `computeBreakRollout()` in route.js, mirroring `computeWindPerch()` for Point 11. Both ends of the downwind leg are wind-adjusted.

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
| PFL Final Key | 3,000 | ~1,100 | SMM 13.9 ¶18 |

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
| Config | Best Glide (KIAS) | NM per 1,000 ft | L/D |
|---|---|---|---|
| Clean, feathered | 125 | 2.0 | 12.15 |
| Gear down | 105 (or 120 pattern) | 1.5 | — |
| Gear + T/O flap | 110 (**estimate**) | 1.3 (**estimate**) | — |
| Landing flaps | 95 | 1.1 | — |
| Windmilling | 110 | 1.0 | — |

The sim uses the glide **ratio** for the configuration down (clean 2.0, gear 1.5, T/O flap 1.3 **estimate**, landing flap 1.1 NM per 1,000 ft; T-6A max glide chart, `manuals/traffic-pattern-numbers.md`). Sink rate = true airspeed ÷ ratio (`glideSinkFpm` in `src/core/t6-performance.js`). The chart's ft/min column only matches its ratios at about 16,000 ft and is not used.

### 3.6 Key Geometry
| Measurement | Value | Derivation |
|---|---|---|
| Break turn radius (220 kt, 60° bank) | 2,470 ft (0.41 NM) | $R = v^2 / (g \tan 60^\circ)$ |
| Final turn radius (120 kt, 35° bank) | 1,814 ft (0.30 NM) | $R = v^2 / (g \tan 35^\circ)$ |
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

> **Authoritative Coordinates**: See [`docs/references/traffic-pattern-matrix.md`](../../references/traffic-pattern-matrix.md) for exact $(x, y)$ positions and waypoint attributes.

### 4.1 PAT_INNER — Overhead Break Circuit

Approved 4 Oct 2026 (Traffic refactor PR 2). Items 10-14 cover both the circuit and the take-off (4.8).

10. **Outer pattern.** The downwind and base legs are fixed to the ground (Patrick, 08:11Z).
    - After take-off, at full power on runway heading, the aircraft holds 5-7° nose up and accelerates until 180 KIAS. Then it climbs at 180 KIAS to 3,500 ft, levels, and accelerates at full power to 220 KIAS. Then it sets power for 220 (Patrick, 08:15Z; SMM 3.11 for the 5-7° take-off attitude, SMM 3.14 para 35 for the 180 KIAS climb).
    - It turns left onto crosswind once it reaches 220 KIAS, so the turn comes earlier over the ground on a strong headwind day (Patrick, 08:11Z and 08:27Z; SMM 18.4 para 13: "level off at pattern altitude with an airspeed of 220 KIAS. When able, turn to the crosswind leg").
    - The crosswind leg runs until the turn onto the fixed downwind. That turn starts early enough to roll out on the downwind line in today's wind.
    - Outer pattern turns are 60° bank and 2 G, except the turn to initial, which uses 45-60° as needed to line up on the centreline (SMM 4.14 para 33).
11. **The break.** It is a level turn at a constant 60° bank and 2 G, PCL idle (SMM 4.17 para 39).
    - It rolls out when the aircraft's ground track points at the wind-corrected perch, so the turn may be a little more or less than 180° (Patrick, 08:27Z).
    - The bank does not change for wind. The wind shapes the ground track ("Do not vary the angle of bank during the overhead break to compensate for a crosswind", SMM 4.18 para 42).
    - Speed bleeds off from 220 to about 140 KIAS over the turn, on today's curve (Patrick, 08:43Z). An idle-drag model replaces it only once it includes the prop's drag at idle and still gives about 140.
12. **One break point that moves with the headwind.** The break starts 2,000 ft past the threshold in a 10 kt headwind (SMM 4.17 para 39). It moves later in more headwind and earlier in less (SMM 4.18 para 42).
    - It moves by (headwind − 10 kt) × the time the break turn takes, so the aircraft rolls out at the same ground point in any headwind (Patrick, 08:48Z, "Same rollout spot").
    - That is about 1,700 ft past the threshold in calm air and about 2,300 ft in 20 kt (estimate from a turn of about 18 s).
    - It replaces today's two points: 2,000 ft in calm air, and V6's 3,818 ft point in any wind at all (route.js:609, :745).
13. **Final turn.** It is a continuous descending turn from the perch to the window, up to 45° bank (SMM 4.19 paras 43-48).
    - The perch moves so the turn rolls out at the window: earlier in a strong headwind, later in a light one, tighter with wind from the north, wider with wind from the south (Patrick, 08:27Z; SMM 4.20 para 49).
13a. **No jumps at any hand-over.** Each piece of path starts from where the last one ended: the same place, track, bank and pitch, and the same rates of change. It is joined like a clamped curve, so the joins are smooth (Patrick, 08:27Z).
14. **Check on screen**, at calm and in a strong wind:
    - the circuit from take-off and from initial;
    - no heading or bank jitter;
    - bank and radius look right in each turn;
    - the break point moves smoothly as the wind goes 0 → 1 → 20 kt;
    - every aircraft lands on the runway.

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

### 4.5 PFL: engine failure, and the glide from High Key

Approved 4 Oct 2026 08:54Z (Traffic refactor PR 3). Replaces the old 4.5 PFL_HIGH_KEY, 4.6 PFL_PATTERN and 4.7 PFL_FROM_AREA.

One runway for now: every PFL flies to 29L, and one that makes the runway ends in a touch-and-go (Patrick, 4 Oct 11:53Z, TR-49).

1. **Two ways in.** The PFL button is an engine failure where the aircraft is, power off from that moment. High Key (TR-R31) is practice: the aircraft arrives at High Key under power (PR 4), then flies this same glide.
2. **The pattern is a circle.** 0.5 NM radius in calm air, left-hand for 29L, closing tangent to the centreline at the threshold (SMM 13.6 para 13). No straight legs.
   - High Key: over the threshold on runway heading, window 5,000-6,000 ft MSL (WFO S2 art 403 para 1a; Patrick 06:30Z).
   - Low Key: 180° round, 1 NM abeam, about 3,700 ft MSL (SMM 13.8 para 17).
   - Final Key: 270° round, about 3,000 ft MSL, 1,000 ft AGL (SMM 13.9 para 18). Shown as "Final Key".
   - Key heights are what the aircraft is checked against, not a schedule it is held to.
3. **How it flies.** The join is flown live. The circle is a planned, wind-shaped ground track, and the aircraft blends onto it at a tangent. Height and speed come from the physics: the glide ratio of the configuration down, at the speed flown. Nothing writes a height by angle round the circle.
4. **Speed.** 125 KIAS clean until the gear goes down, then 120 KIAS (SMM 13.5 para 8, 13.14 para 26; Patrick 06:26Z). Never slower to stretch the glide, except direct to the threshold (item 10).
5. **Zoom.** Above 150 KIAS: a 2 G pull, push over through 140, capture 125 (EFIG p.408). The zoom turns toward the chosen join point at the same time, never away from the runway. At or below 150 KIAS: hold height and slow to 125. NFM Fig 3-4 (20° to 145 KIAS, p.3-12) stays a reference.
6. **Choosing the join.** Chosen at the button press from energy height (He = h + V²/2g, true airspeed), less the expected zoom loss, and checked again at the top of the zoom.
   - Points every 5° round the wind-corrected circle are tried.
   - A point is reachable if a clean, 125 KIAS tangent glide with the wind gets there with height to spare.
   - Of the reachable points, it picks one it can join in a single turn, rolling out on the circle's line before the point, with the least turn (SMM 13.13 para 24, 13.17 para 38; EFIG p.409-410). While zooming, that turn is planned at the zoom's bank (30°, an estimate) at its mean speed, tighter only if it must. A turn one way then the other (an S) is flown only when no single-turn join leaves it in range of the runway (Patrick 09:46Z).
   - At the apex it changes only if the first choice is no longer reachable.
7. **On the circle: one number, the energy margin.** Three drag options: gear, T/O flap, landing flap. The plan is gear near High Key, T/O flap near Low Key, landing flap near Final Key. Any of them can go early or late as required (Patrick, 08:32Z). Margin = height now − height needed to reach the aim point (a third down the runway) round the rest of the circle, flying the planned gear and T/O flap from here on, at the speed flown, with the wind. Re-checked every step. Gear and T/O flap go down at their planned point unless it is low; earlier only with height to spare. Landing flap goes down as soon as it would still touch down in the first 1,000 ft: closer is better (Patrick 09:49Z, 09:56Z).

   | Margin | What it does |
   |---|---|
   | At or past a step's planned point, and no more than 50 ft low | Takes that step: gear, then T/O flap |
   | Before a step's planned point, with the step's cost plus a buffer to spare | Takes the next step early |
   | With landing flap it still reaches the first 1,000 ft | Takes the landing flap |
   | Still high with everything out (more than 100 ft, an estimate) | Widens the circle from where it is to Final Key; Final Key itself stays where it is, never extended (Patrick 10:10Z; SMM) |
   | About zero | Holds configuration |
   | Below zero | Delays drag; cuts toward the next key |
   | Can't reach the aim point even clean | Leaves the circle, direct to the threshold |

   Drag only once on the circle, or committed direct with the runway made (SMM 13.6 para 15, 13.17 para 39). Circuit PFL: gear by Final Key at the latest. High Key and area PFL: gear by High Key, later if it arrives low (Patrick 06:26Z).
8. **Bank follows the circle.** About 25° in calm air (calculation: r = V²/(g·tan φ) at about 127 KTAS); more on the downwind side and less into wind, to hold the ground track. Roll rate and easing are PR 2's.
9. **Too high.**
   - Circuit PFL never has the energy for High Key; it always joins the circle at a tangent (Patrick 06:30Z).
   - Area PFL at High Key inside 5,000-6,000 ft: extends down the runway to a false High Key, then a false Low Key, the whole circle moved along (SMM 13.7 para 16, Fig 13.4).
   - Above 6,000 ft: orbits at High Key, or takes the gear early, until in the window (SMM 13.5 para 11; WFO S2 art 403 para 1b).
10. **Can't make the circle.** Direct to the threshold, gear up, flight path within 35° of runway heading by 2,100 ft. Late in the glide it may trade speed for height down to 80 KIAS, shown on screen as below the SMM speed. It may turn early and land further down the runway (Patrick, 08:33Z). If it can't make the runway at all, it ejects: the tag says "Eject" (Patrick, 08:33Z). *Working answer for the screen, not yet ruled on: it ejects as soon as no point on the runway is reachable; the aircraft is removed and a marker stays where it ejected.*
11. **Wind.** Bank varies to hold the circle over the ground. In strong wind the keys also move into wind: High Key the full amount, Low Key half, about 1,000 ft per 10 kt (EFIG p.402, p.406; SMM 13.12 paras 21-23).
12. **2,100 ft gate** (200 ft AGL): 120 KIAS and within 35° of runway heading (TR-R14). Bank under 45°, gear down and T/O flap are shown as flags (SMM 13.14 warning). Practice: a missed gate goes around. Engine failure: keeps going and tries to land.
13. **Landing.** Wings level before the threshold, aiming a third down the runway until the landing flap goes down, then touching down in the first 1,000 ft, closer being better (SMM 13.9 para 18; Patrick 09:49Z, 09:56Z). Touches down in line with the runway, no slower than 80 KIAS. A PFL that makes the runway then flies a touch-and-go, power back on, and carries on in the circuit (Patrick, 08:40Z); the touch-and-go itself is today's, made jump-free in PR 4.
14. **On screen.** Once a PFL starts, a small tag beside the aircraft in 2D and 3D shows its current decision (for example "Zoom to circle", "Join at Low Key", "False High Key", "Direct threshold") and its configuration (clean, gear, T/O flap, landing flap). The margin shows as high / on profile / low at each key. Glide ring: how far the aircraft can glide from where it is now, in the configuration down, corrected for wind (the circle's centre drifts downwind by the wind over the glide time, so it is no longer centred on the aircraft), drawn on the ground (Patrick, 08:33Z). The PFL circle is also drawn on the ground.
15. **If the numbers fail.** If the join search returns nothing usable (no finite answer), the aircraft does what item 10 says: direct to the runway, turning early to land further down it if needed, and ejects if it can't make the runway. *(New proposal, not yet ruled on.)*

#### PFL settings (each with a default)

| Setting | Default | Source |
|---|---|---|
| High Key window | 5,000-6,000 ft MSL | WFO S2 art 403 para 1a; Patrick 06:30Z |
| Keys move into wind | On from 15 kt; can be switched off | EFIG p.406; 15 kt is an **estimate** (Patrick 06:56Z) |
| Max bank on the PFL | Up to 60° until the 2,100 ft gate; below it, bank over 45° is flagged | Patrick, 08:34Z; SMM 13.14 warning. The stall line still holds: at 120 KIAS it allows about 59° (calculation, stall 86 KIAS) |
| Drag buffer | Next step's cost + 100 ft, for a step before its planned point | **Estimate** (`pfl-energy-logic.md`) |
| On profile | Down to 50 ft low still counts as on profile: a planned step is taken | **Estimate** |
| Touchdown point | Aim a third down until landing flap, then the first 1,000 ft | SMM 13.9 para 18; Patrick 09:49Z, 09:56Z |
| Widen when high | More than 100 ft high with all drag out: widen before Final Key, up to 6,000 ft outside the circle | Patrick 10:10Z; 100 ft and 6,000 ft are **estimates** |
| Start of the glide | Holds the bank it has for 1 s, then turns for the join, so the hand-over has no step in turn rate | **Estimate** (reaction time); Patrick 09:21Z, no snap at hand-overs |
| Zoom | 2 G, push through 140, capture 125; only above 150 KIAS | EFIG p.408; Patrick 4440, 06:35Z |

### 4.8 TAKEOFF — Runway Departure

See 4.1, item 10: at full power on runway heading, 5-7° nose up to 180 KIAS, 180 KIAS climb to 3,500 ft, accelerate to 220, crosswind turn once 220 is reached (Patrick, 08:11Z and 08:15Z, 4 Oct 2026; SMM 3.11, SMM 3.14 para 35, SMM 18.4 para 13).

### 4.9 BREAKOUT — Circuit Breakout
See 1a, items 15-18 and 22 (Patrick, 09:56Z, 4 Oct 2026).

### 4.10 GO_AROUND — Wave-off Climbout
See 1a, items 15-18 and 20 (Patrick, 09:56Z, 4 Oct 2026).

### 4.11 CLOSED_PATTERN — Closed Pattern Command
See 1a, items 15-19 (Patrick, 09:56Z, 4 Oct 2026). Touch-and-go is item 21 and High Key from anywhere is item 23.

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
3. **Transitions**: No jumps at any hand-over (section 4.1, item 13a). Until refactor PR 4, the manoeuvre controllers still hand back to the rail through the old 1.0 s blend. No instantaneous heading or speed jumps.
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
- **Playback bar**: Play/Pause, Rewind, −10 s, +10 s, Reset, speed (0.25× to 8×), clock, status, 2D/3D toggle, Fit, Layers.
- **Setup column** (the left column, Patrick, 4 Oct 11:05Z): Scenarios buttons (Moose Jaw day, One aircraft, Full circuit, Joining traffic, Random; each replaces the aircraft, paused at 0:00, and keeps the routes, wind and settings), then Wind: a dial for the direction it blows from (°T, drag in 10° steps, arrow keys) and a strength bar (kt), with a line giving 29L's head and cross wind. Scenarios and notes and the routes list follow.
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
- 2D or 3D: 2D. 3D opens over the field: from north of the field looking south-south-east, low over the base, with the runways in the lower half and the circuit beyond (Patrick, 4 Oct 2026 10:17Z, from his screenshot). Fit still frames every route.
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
| `flyZoomT6A(kias, altFt)` | `src/core/t6-performance.js` | NFM zoom table: reference for height gained (the PFL flies the EFIG p.408 zoom, 4.5 item 5) |
| `glideDragPerWeight(config, kias, altFt, g)` | `src/core/t6-performance.js` | PFL glide: drag for the configuration down |
| `windTriangle(hdg, ktas, wind)` | `src/core/wind.js` | Wind crab angle on all legs |
| `ktToFtps(kt)` | `src/core/units.js` | Speed conversion |
| `FT_PER_NM`, `G_FTPS2` | `src/core/units.js` | Physical constants |
| `wrapDeg180(deg)` | `src/core/angles.js` | Heading arithmetic |

---

## 9. Task Breakdown (Pre-Phase through Phase 5)

### Pre-Phase: Documentation Sync
- [x] Merge `SPEC-traffic.md` + `SPEC-traffic-vector.md` into one unified spec
- [x] Commit `refined_pattern_matrix.md` to `docs/references/traffic-pattern-matrix.md`
- [x] Register D406 in `archive/docs/records/plan-decisions.md` & `archive/docs/records/decisions-log.md`
- [x] Register R34 in `archive/docs/records/plan-requirements.md`
- [x] Update HANDOVER.md, docs/handover/traffic.md, tasks/traffic/todo.md, tasks/traffic/plan.md, POST_PROTOTYPE_QUEUE.md, .agent/memory/handoff.md
- [x] Create standalone checklist `archive/tasks/traffic/vector-migration-todo.md`

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
- [ ] **Task 2.1**: Define all nav plans in `nav-plans.js` from `docs/references/traffic-pattern-matrix.md`
- [ ] **Task 2.2**: Pattern-specific guidance overrides (break arc, perch pursuit, cubic descent, 3.0° glide slope)

### Phase 3: Integration (sim.js Swap)
- [x] **Task 3.1**: Replace rails in `sim.js` (`fly(a)` calls `stepAircraft()`)
- [x] **Task 3.2**: Migrate existing command blocks (breakout, PFL, go-around, closed pattern)
- [x] **Task 3.3**: Sync display via `scene.js`
- [x] **Task 3.4**: Update test suites (`sim.test.js`, `vector-sim.test.js`, `route.test.js`)

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
   - `tests/unit/traffic/nav-plans.test.js` (~30 tests): coordinate integrity against `docs/references/traffic-pattern-matrix.md`.
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
- **Single Source of Truth for Waypoints**: [`docs/references/traffic-pattern-matrix.md`](../../references/traffic-pattern-matrix.md).
- **Never stop or cap simulation prematurely**: station keeping is closed-loop (D370, D374).
- **Harvard II is CT-156** (D373). Default active runway: 29L (298° true), left-hand circuits (D378).
