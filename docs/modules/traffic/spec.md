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
> **Authoritative Companion**: Master Pattern Matrix at [`docs/references/traffic-pattern-matrix.md`](../../references/traffic-pattern-matrix.md) (a readable list of the route points in true feet; the route file and `airfield.js` are the source)  
> **Decisions**: D6, D10, D46, D109, D110, D117, D118, D134, D158, D368–D400, D406, D412 | **Requirements**: R2, R3, R4, R6, R8, R9, R14, R16, R21, R22, R24–R27, R34  
> **Architecture Update (D412)**: Flight model uses Hybrid Rails/Physics — see SPEC_hybrid_migration.md for full details. Rails for stable legs via generateWindAdjustedTrack(), Physics for dynamic maneuvers via flight-engine.js. *Superseded 4 Oct 2026 (Patrick's card "Rebuild, then delete", 4 Oct 17:53Z): there is no physics mode or `flight-engine.js` any more; every manoeuvre is flown once by `circuit.js`'s simulated pilot and followed by `path-follower.js`.*  

---

## 1. How the aircraft moves (approved 4 Oct 2026, Traffic refactor PR 2)

Patrick approved this wording on 4 Oct 2026 (08:45Z). It replaces the old sections 1 ("Why we're doing this"), "Hard Invariants" and 2.1-2.2. The closed pattern, High Key, go-around, breakout and PFL controllers, and their 1 s blend back to the rail, stay until refactor PR 3 and PR 4.

*As built, 4 Oct 2026 (DADS v2.10.17): refactor PR 3 and PR 4 are done. There are no live controllers left: every manoeuvre is flown once by the simulated pilot (`circuit.js` `makePilot`, one roll model at 45°/s easing at 90°/s²) from where the aircraft is, recorded as a path, and followed by `path-follower.js`. The old physics engine (`flight-engine.js`) was deleted (Patrick's card "Rebuild, then delete", 17:53Z).*

1. **One mover.** One path follower is the only code that writes an aircraft's position, heading, bank and pitch. The three phase machines become one. The manoeuvre controllers (closed pattern, High Key, go-around, breakout, PFL) still run until PR 3 and PR 4, but they hand their position to the path follower instead of writing it themselves.
2. **Paths are built from the T-6, when they are needed.** A path is a smooth ground track (no corners) with the height and speed the aircraft can actually fly along it. It is built from the aircraft's performance and today's wind at the moment the aircraft needs it. Corners on the drawn route are only where the turns go, not part of the track.
3. **Heading is continuous.** Heading is the path's track plus the crab for the wind, worked out at every point along it. It never steps.
   - Today the heading jumps up to about 8° in one 0.05 s step at every route corner. That happens hundreds of times per circuit, at every wind. It is the jitter you see, not physics rounding (measured 4 Oct on main).
4. **Bank comes from the turn.** Bank = tan⁻¹(true airspeed × heading rate ÷ g), from the path's own curvature and ground speed, so the same ground track needs more bank downwind and less into wind (standard aerodynamics).
5. **Rolls ease in and out.** Bank changes at a roll rate that eases in and out, never instantly. Roll rate is a setting: default 45°/s, an estimate (no manual page gives a normal roll rate). Today's 90°/s in the breakout becomes the same setting.
   - The drawn bank and pitch are read off the path a second either side of the aircraft, not off its last step, and the nose eases toward its attitude at up to 10°/s (changing at up to 20°/s², estimates), so the wings hold a steady bank down a drawn turn and pitch changes are smooth; the path flown, the turn sizes and the roll limits are unchanged (Patrick, 6 Oct; TR-97).
6. **Pitch comes from the climb or descent.** Pitch attitude = flight path angle + angle of attack − 2.6° for where the fuselage sits on the wing (TR-91). The angle of attack grows with G and falls with speed squared. Patrick's attitudes (6 Oct 06:17Z): about −0.5 to −1° level at 220 KIAS (the model gives −0.7°), 2.5° on the wheels (held there), 5-7° at take-off (6°), about 10° in the 180 KIAS climb (the model gives about 8.5°, its climb angle being a little shallow). The 2.6° is an estimate fitted to the 220 KIAS point.
   - **Configuration-aware pitch attitude (TR-114, Patrick approved 10 Oct 2026; the 1.7° and 3.3° are **estimates**):** Flap deployment increases camber, shifting zero-lift line negative and reducing body AoA: Takeoff Flaps (23°) subtracts 1.7° from AoA; Landing Flaps (50°) subtracts 3.3° from AoA. This produces authentic pitch attitudes: ~+2.0° nose-up on level downwind at 120 KIAS with T/O flaps, ~-9.0° nose-low in the 2,400 fpm final turn with Landing Flaps, and ~0.0° (level with horizon) on final approach at 100 KIAS with Landing Flaps (giving the 1/3 windscreen aim-point sight picture from AETCMAN 11-248 and SMM Table 4.1).
7. **Height and speed change at achievable rates.** Climbs and accelerations come from full-power excess thrust at the turn's real G (`excessThrustPerWeight`). Decelerations come from idle drag. Nothing is blended between route points by distance.
8. **Speeds name their kind.** True airspeed is worked out from indicated airspeed and height everywhere. Indicated airspeed is no longer used as true airspeed in calm air. Track goes where track is meant, heading where heading is meant.
9. **What you see is what is flown.** The 2D and 3D views draw the sim's own heading, bank and pitch. The 3D view stops working out its own bank from heading change (view3d.js:98-134). If a little drawn smoothing is still needed after this, it smooths only the picture; the flown numbers stay exact (Patrick, 08:01Z).


## 1a. Manoeuvres and rejoins (approved 4 Oct 2026, Traffic refactor PR 4)

Patrick approved this wording on 4 Oct 2026 (09:56Z). It replaces the old 4.9-4.11 text and adds touch-and-go and High Key from anywhere.

*As built, 4 Oct 2026 (DADS v2.10.17), where it differs from the wording below (new wording waits for Patrick):*
- *Item 15: the "one controller" is the simulated pilot, which flies each manoeuvre once as a path (`closed-pattern.js`, `high-key.js`, `breakout.js`, `circuit.js` `buildGoAround`); the shared climb is `circuit.js` `powerClimb`.*
- *Item 16: the climb levels off smoothly as it nears the height (`powerClimb`), so the bank never rolls past the setting to stop the climb.*
- *Items 17 and 19: the closed pattern turns until its track points at today's wind-corrected perch, holds that track, and hands over to the circuit 1,000 ft short of the perch (an estimate); the circuit then flies its own final turn from the perch (Patrick, 5 Oct 19:55Z; TR-86). It first carries on as it was for 0.8 s (an estimate matched to the path follower's smoothing) so the heading doesn't step at the hand-over.*
- *Item 22: the breakout turns toward the breakout point 2 NM south of the pattern, climbing at full power toward 220 KIAS and 4,500 ft, then rejoins on ENT1's line at 3,500 ft and 220 KIAS, 0.7 to 1.2 NM before the Entry Gate (measured in calm and 20 kt); a straight-in rejoins its own straight-in.*

### One climbing turn for every rejoin

15. **One controller.** The closed pattern, High Key from anywhere, the go-around and the breakout all use today's closed-pattern climbing turn as one controller. The 1 s slide back onto the path, the pre-drawn High Key path and the extra phase machines go.
16. **The climbing turn.**
    - Bank comes from the setting, 45-60° (default 50°). It can roll up to 90° to stop the climb smoothly and turn toward the target (TR-R33).
    - The climb is at full power and 140 KIAS. The climb rate comes from excess thrust at the turn's real G (`excessThrustPerWeight`), so it climbs less while turning harder.
    - Pitch comes from the climb (spec item 6) and is shown.
17. **Aim at where it joins, not at a point.** The turn aims at the place where it will meet its next path:
    - closed pattern: straight to today's wind-corrected perch, then the circuit's own final turn (Patrick, 5 Oct 19:55Z: in a high wind it used to intercept the downwind line first; TR-86);
    - High Key: the 1/8 NM run-in (760 ft) to High Key;
    - breakout: the ENT1 line at pattern height, at least 1 NM out (TR-R34).
18. **Hand over only once on the path.** Control passes to the next path only when the aircraft is on it, with the same place, track, bank and pitch (item 13a). No snap and no slide.
    - Today the snap is 31-69 ft and the go-around slide is about 4 NM in 1 s (measured 4 Oct).

### Each manoeuvre

19. **Closed pattern (4.11).** Pull-up at or after the upwind end of the runway (WFO art 402). One continuous climbing turn until it points at the wind-corrected perch, then straight to it, levelling at 3,500 ft, then the circuit's own final turn (TR-R33; TR-86).
20. **Go-around (4.10).** Full power, straight ahead on the runway track. It levels at 2,500 ft until it crosses the upwind end of the runway, speeding up there, then trades that speed for height after it crosses (Patrick, 09:14Z). Then it flies the same climb-out as a take-off (item 10): climb at 180 KIAS to 3,500, accelerate to 220, crosswind turn at 220 onto the outer pattern (Patrick's card "Like a take-off", 09:18Z).
21. **Touch-and-go.** It touches down and rolls on the runway from where it landed, then flies the take-off climb-out (item 10). It no longer jumps back to the threshold. The ground roll uses lift-off at 85 KIAS (today's take-off number, an estimate until checked).
22. **Breakout (4.9).** A climbing turn to 4,500 ft, staying 2 NM south of the pattern and clear of the rejoin lines, then rejoining on the ENT1 line at pattern height at least 1 NM out (TR-R34). Avoidance climbs use a 140 KIAS sporty climb ($V_y$) at full power (Patrick, 6 Oct). Near the runway / after takeoff (below 2,500 ft MSL or before the departure end), the aircraft climbs straight ahead on the runway track wings level to 2,500 ft MSL past the departure end before initiating the turn, with bank capped at 45°; if there are no more conflicts once past 2,500 ft and the runway, it moves back over to the runway centreline and rejoins the pattern climb-out (Patrick, 6 Oct). Off the rejoin line (an entry that joins the pattern) the first turn goes away from the pattern, to the right at Moose Jaw (Patrick, 5 Oct 00:08Z). A breakout needed so as not to collide (the deconfliction's last-moment, skill-layer move) may bank up to 80° when clear of the ground, never past the stall line, and bleeds speed when full power can't hold it at that G; other breakouts and the button use the closed-pattern bank (Patrick, 5 Oct 00:13Z; TR-63). All breakout turns and path follower bank transitions obey the dynamic envelope gate (`gateRoll` in `envelope.js`): roll rate scales with true dynamic pressure ($0.45^\circ/\text{s}$ per knot TAS), G onset rate is capped at the $8\text{ G/s}$ airframe ceiling, and bank is dynamically bounded by the current stall limit.
23. **High Key from anywhere.** Press High Key anywhere: the aircraft flies the climbing turn onto the 1/8 NM run-in, climbs at full power, and arrives at High Key on the line. From there the PFL (PR 3) takes over.

### Check on screen, at calm and in a strong wind

- Closed pattern from the runway, go-around from short final, touch-and-go, breakout from downwind, and High Key from downwind and from initial.
- Each one climbs, turns, levels and joins with no jump, slide or snap.
- Bank stays within the setting except to stop the climb.
- Every aircraft that rejoins lands on the runway.

---

## 2. Architecture (as built, V2.366)

### 2.1 One mover
Every aircraft rides a path on the path follower (`path-follower.js` `followRoute`), which moves it along the path at the path's speed and height and takes heading, bank, roll and pitch from the path. There is no second way to move an aircraft.

### 2.2 The simulated pilot makes the paths
The paths are flown once, ahead of time, by the simulated pilot in `circuit.js` (`makePilot`): the circuit itself (`buildCircuit`, Pattern 1 built by flying it in the day's wind, section 1), and every manoeuvre from where the aircraft is when it starts: the go-around, the closed pattern (`closed-pattern.js`), the climb to High Key (`high-key.js`), the PFL (`pfl-flight.js` `flyPfl`, section 4.5), the breakout (`breakout.js`) and the evasions (`evade.js`, section 4.12). The pilot flies by bank, power and pitch within the T-6A model in `src/core/t6-performance.js`, so the path is one a pilot could fly.

### 2.3 Flown-path carriers
An aircraft on a manoeuvre carries its flown path in one carrier, `a.flown` = { kind, route, ... }, set by `path-follower.js` `setFlown`: kind `move` (the go-around, closed pattern, breakout, the deconfliction's moves, the extended downwind, the straight-in from the downwind), `high_key` (the climb to High Key) or `pfl` (the glide). `tick-aircraft.js` follows it, with each kind's own lines in one table (`FLOWN_STEP`), else the route the aircraft is on. When a flown path ends, `sim.js` `flownEnded` puts the aircraft back on its route (`goAroundEnded`, `pflEnded`). A new flown path replaces the one before, and any later command except a touch-and-go cancels a closed pattern still waiting for the upwind end, so the newest order wins (refactor step 3).

### 2.4 The step
`sim.js` steps in whole 0.05 s steps; `stepOnce` reads the order in one place (`HALF_SECOND_TICKS`, then `aircraftTick` for each aircraft). Every tenth step it runs the SI pattern, the randomiser, the deconfliction and the runway check; then, for each aircraft, the follow, the end of a flown path, the land-or-split decisions, the end of a route and a pending closed pattern; then the collision check and, every 10 s, the snapshot that rewind restores. The day's temperature (`weather.js`) is set from the setup before each step.

What an aircraft remembers between steps beyond where it is and what it is doing (`command`, `phase`, `intent`, `tag`, `status`, which the screen reads) sits in named groups, made on first use (`path-follower.js` `groupOf`) and copied into each snapshot: `random` (Randomize's rolls and their count), `spacing` (the deconfliction's move and the avoidance breakout), `landing` (the SI lap, a closed pattern waiting for the upwind end, the perch roll) and `pfl` (the glide's segment, decision, margin and end).

## 3. Aerodynamic Baseline

All numbers from 15 Wing SMM (Aug 2024), EFIG (24 Jun 2026), and T-6A reference data. Traceability citations only — agents read this spec directly.

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
| PFL glide (clean) | 125 | T-6A Max Glide Data |
| PFL glide (gear down) | 120 | SMM 13.5 |

### 3.2 Bank Angles and G
| Maneuver | Bank (°) | G | Source |
|---|---|---|---|
| Overhead break | 60 | 2.0 | SMM 4.17 ¶39 |
| Pattern turns (upwind, crosswind) | 60 | 2.0 | SMM 4.14 ¶33 |
| Final turn | 35 nominal (30–45 range) | 1.22 | D391, SMM 4.19 |
| PFL orbit | 30 | 1.15 | SMM 13.5 ¶11 |
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
| Stick shaker margin | +7 kt above stall (93 KIAS clean) | reference data |
| $V_{fe} / V_{le}$ (gear/flap limit) | 147 KIAS | SMM 4.6 ¶9 |
| $V_{mo}$ | 316 KIAS | reference data |
| Max G (clean) | +7.0 / -3.5 | reference flight envelope |
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

The sim uses the glide **ratio** for the configuration down (clean 2.0, gear 1.5, T/O flap 1.3 **estimate**, landing flap 1.1 NM per 1,000 ft; T-6A max glide data, `manuals/traffic-pattern-numbers.md`). Sink rate = true airspeed ÷ ratio (`glideSinkFpm` in `src/core/t6-performance.js`). The data's ft/min column only matches its ratios at about 16,000 ft and is not used. The SMM gives about 2,600 ft for a gear-down orbit at 120 KIAS and 30° of bank (SMM 13.5 para 11, p.46). With the data's drag the sim loses about 1,980 ft. The data is kept and the SMM figure is taken as conservative. The keys are targets, and the aircraft may carry them about 100 ft high (Patrick 5 Oct 23:46Z, 23:49Z; TR-89).

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
  Guarantees $dz/du = 0$ at entry (Perch). Since TR-82 the exit is not level: the descent rate at the rollout is the window's glide slope, so height and slope both match final.
- **Cross-track localizer** (straight corridor tracking):
  $$e_{\text{xtrack}} = (x - x_0)\cos\tau - (y - y_0)\sin\tau$$
  $$\psi_{\text{cmd}} = \tau + \text{crab} + \text{clamp}(K_p \cdot e_{\text{xtrack}}, -30^\circ, +30^\circ) \quad (K_p = 0.02^\circ/\text{ft})$$
- **Dynamic Perch** (wind compensation):
  $$\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$$
  $$T_{\text{turn}} = \pi \cdot v_{\text{tas}} / (g \tan 35^\circ) \approx 29.8\text{ s}$$

---

## 4. Pattern Definitions

> **Authoritative Coordinates**: the route file `src/modules/traffic/data/moose-jaw.json` and the runway constants in `src/modules/traffic/airfield.js`, in true feet since TR-67. Each point's source is in the project files' `traffic-map-rebuild/point-list.md`; the drawing is [moose-jaw-routes-draft.svg](moose-jaw-routes-draft.svg). `docs/references/traffic-pattern-matrix.md` lists the same points in a table.

### 4.0 The ground the routes are drawn on (TR-67, Patrick 5 Oct 00:27Z)

- **One frame, true feet.** x east and y north in feet from the field reference point (50.3303 N, 105.5592 W), converted with `core/geo.js` `latLonToLocalFt`. The satellite photo is drawn at true scale (trim 1.0, no offset), so the routes, the runway, the 3D scenery and the photo all agree, and distances on the map are real (leg lengths, miles on final, the Window, spacing, glide reach).
- **Where the points come from.** Runway 29L from its threshold bars on Esri's true-scale photo (7,250 ft at 298.6° true; CAP chart 7,280 ft, 289°M). The overhead pattern from EFIG Fig 3-10 laid on the photo (Race Track Lake and the Sukanen Ship intersection land within about 60 ft of the figure, its lines good to about ±300 ft); the straight-in from EFIG p.131; the rejoins from EFIG p.209 and Patrick ("the rejoin lines define the base leg"); the Window from Patrick (3/4 NM from the base of the numbers). Initial is only a reference point on the run-in (Patrick, 01:05Z).
- **Landmarks and buildings (TR-68).** The 3D landmarks (`landmarks3d.js`) and flight-line buildings (`scenery3d.js`) are traced off the same true-scale photo round Patrick's pins, about ±15 ft: Window Farm with its pigs in the pens, Sukanen with the red roof east-west, the whole Fiat Farm car lot, the Arrow Tree Rows on their real tree lines, the Glass Palace on its real outline, Hangars 5 and 6 turned to the taxiway, and three small arch hangars plus two buildings added. Pig and car sizes are estimates.
- **Flight-line buildings (TR-121).** Hangars 1 to 3 flat-roofed with their annexes (Hangar 4 arched); the Glass Palace two storeys with one-storey wings and the curved glass sloping down its west face; the hall by the main road with its low arched roof and blue eaves, the Canex store with its blue fascia and glass entrances, and Medical with Shipping and Receiving (`flightline-buildings3d.js`). Heights are estimates.
- **The Mess, Hangars 5 and 6, fuel tanks (TR-122).** The Mess as dark-brown blocks with a plant room and chimney; the two eastern hangars with blue and red (Snowbirds) upper walls, white annexes and doors south-west; the three white fuel tanks in red berms. Heights are estimates.
- **Roof textures (TR-140).** Each roof keeps its photo colour with a texture over it: ribbed metal on Hangars 1 to 3, the east hangars, the hall's arch and the Student Barracks; membrane on the flat roofs; shingles on the base houses (`roof-textures3d.js`, made by `tools/airfield/make-roof-textures.py`). Panel, sheet and shingle sizes are estimates. Drawing only.
- **Roads and power lines (TR-147).** From OpenStreetMap, downloaded once (`osm-features.js`), drawn on the real ground: roads by surface with painted lines on the highways, power lines on poles with sagging wires that fade past about a mile. The 3D view shows OpenStreetMap's credit. If the road pictures fail to load, the roads show in flat colours. Drawing only.
- **Striped sphere and radar (TR-148).** The red-and-white striped sphere mid-field; the radar dome east between the runways (place a best guess). Drawing only.
- **Ground and runways at range (TR-146).** The satellite photo is colour-graded (more contrast and colour); the runway and taxiway paint holds about 1.5 px wide far off, and the pavement brightens a little with distance. Up close nothing changes. Drawing only.
- **Showpiece buildings (TR-142).** Hangars 1 to 3, 5 and 6, the Mess, the Glass Palace and the tower are Blender models (`showpieces.glb`, `showpieces3d.js`) on the same footprints: recessed windows, ribbed hangar doors, parapets, skylights, the tower's cab. Loaded after the view opens; until then, or if the file fails, the code-built buildings show. Sizes are estimates. Drawing only.
- **Airfield furniture (TR-141).** Runway edge, threshold and approach lights, a PAPI left of 29L and 29R that shows red or white by the viewer's angle (3 degree slope), hold and location signs at every painted holding position, the parked Harvards and ramp vehicles on the photo's spots, and shelterbelt trees with trunks and crowns (`furniture3d.js`, `landmarks3d.js`). Layouts are standard practice, estimates for CYMJ. Drawing only.
- **Runway and taxiway paint (TR-120, with TR-98).** 29L/11R and 29R/11L carry the full set measured off the photo (grey runway, bars, piano keys, letters and numbers, centreline, aiming point, touchdown bars, pad chevrons); 03/21 only its numbers, centreline and yellow holding positions; the taxiways a yellow centreline and holding positions 250 ft from 29L's and 29R's centrelines. Echo is drawn as fresh black asphalt 50 ft wide. Paint only.
- **South Feedlot and Crossroads Farm (TR-118).** Two more landmarks on the true-scale photo: the feedlot about 2 NM south, its pens full of cattle (about 3,500, in groups), barns and sheds; the farmstead about 2.2 NM south-south-west, with houses, Quonsets and shelterbelts. Heights and the head count are estimates.
- **Base buildings, runways and props (TR-69).** Every other base building is a simple box with its photo roof colour (`base-buildings3d.js`); the radar dome stands mid-field; the runways are the photo's own, with no raised slabs (Patrick, 6 Oct 06:41Z; TR-93); runway 29L/11R's paint (threshold bars, piano keys, numbers and letters, centreline, aiming points, touchdown zone bars and the yellow chevrons on the pads before each threshold) is drawn as sharp flat shapes over the photo, each measured off it to about ±3 ft, shown with the photo (Patrick, 6 Oct 06:59Z-07:06Z; TR-98); the piano keys, letters, numbers and centreline dashes have a 0.5 ft (6 in) black outline, as real paint on light concrete does (FAA AC 150/5340-1; Patrick, 6 Oct 07:24Z and 07:29Z; TR-100, TR-101); white side stripes with the same outline run along both edges, threshold to threshold (Patrick, 6 Oct 07:33Z; TR-102); while the photo loads, the stand-in ground under it draws the runways flat in the photo's concrete colour with no markings of its own (Patrick, 6 Oct 08:07Z; TR-107); aircraft ride on their wheels on the photo; the propeller is a still blur disc. Heights, widths and the gear lift are estimates.
- **Real ground, rivers and the far photo (TR-117, was TR-70).** On High the pattern squares are draped over the real ground's height above the field (public Terrarium elevation tiles, zoom 12; `ground-heights3d.js`), true scale, so the Moose Jaw River valley sits where the photo shows it. The runways, flight line and base buildings stay flat, blending into the real ground over 1,000 ft; the ground fades to flat at the squares' outer edge. The traced river lines cut a channel 400 ft wide and 10 ft deep with darker banks (`rivers3d.js`; estimates). Landmarks stand on the ground. Performance keeps the flat photo. Data failure: a tile that fails leaves its part flat at field height. Drawing only: the flying uses the field elevation. The photo reaches thirty nautical miles each way in a soft outer ring, past Old Wives Lake.
- **Anything new goes straight in.** A position from latitude and longitude (a pin, a GPS track, airport data) is used as is. The photo-alignment controls stay for a photo that is off, never to fit routes to it.
- **To check a position again:** fetch Esri `World_Imagery` tiles at zoom 16 to 18, convert feet to latitude and longitude with the same formula, and draw the point on them. Esri's photos are not put in the repo.
- Before TR-67, V6's hand-drawn routes were about 1.12 to 1.2 times too big and the photo was stretched 1.2 times to sit under them; the flight physics was always in true feet, so turns were right and legs were long. With TR-67, Moose Jaw was rebuilt in true feet from the manuals at true photo scale (trim 1.0), and the legacy V6 profile and trim were retired.

### 4.1 PAT_INNER — Overhead Break Circuit

Approved 4 Oct 2026 (Traffic refactor PR 2). Items 10-14 cover both the circuit and the take-off (4.8).

10. **Outer pattern.** The downwind and base legs are fixed to the ground (Patrick, 08:11Z).
    - After take-off, at full power on runway heading, the aircraft holds 5-7° nose up and accelerates until 180 KIAS. Then it climbs at 180 KIAS to 3,500 ft, levels, and accelerates at full power to 220 KIAS. Then it sets power for 220 (Patrick, 08:15Z; SMM 3.11 for the 5-7° take-off attitude, SMM 3.14 para 35 for the 180 KIAS climb).
    - It turns left onto crosswind once it reaches 220 KIAS, so the turn comes earlier over the ground on a strong headwind day (Patrick, 08:11Z and 08:27Z; SMM 18.4 para 13: "level off at pattern altitude with an airspeed of 220 KIAS. When able, turn to the crosswind leg").
    - The crosswind leg runs until the turn onto the fixed downwind. That turn starts early enough to roll out on the downwind line in today's wind.
    - Every turn onto a line (downwind, base, 45° leg, initial) is planned: the pilot flies it ahead of time at 60° with the roll rate in and out, starts it so it rolls out on the line on its track, and rolls out just as the heading to go matches what rolling level turns, with no S-turn back (Patrick, 6 Oct, card "Plan the turns"; TR-95).
    - Outer pattern turns are 60° bank and 2 G, except the turn to initial, which uses 45-60° as needed to line up on the centreline (SMM 4.14 para 33).
11. **The break.** It is a level turn at a constant 60° bank and 2 G, PCL idle (SMM 4.17 para 39).
    - It rolls out when the aircraft's ground track points at the wind-corrected perch, so the turn may be a little more or less than 180° (Patrick, 08:27Z).
    - The bank does not change for wind. The wind shapes the ground track ("Do not vary the angle of bank during the overhead break to compensate for a crosswind", SMM 4.18 para 42).
    - Speed bleeds off from 220 to about 140 KIAS over the turn, on today's curve (Patrick, 08:43Z). An idle-drag model replaces it only once it includes the prop's drag at idle and still gives about 140.
12. **One break point that moves with the headwind.** The break starts 2,000 ft past the threshold in a 10 kt headwind (SMM 4.17 para 39). It moves later in more headwind and earlier in less (SMM 4.18 para 42).
    - Below 10 kt it moves earlier by (10 kt − headwind) × the time the break turn takes, so the aircraft rolls out at the same ground point (Patrick, 4 Oct 08:48Z, "Same rollout spot"): about 1,700 ft past the threshold in calm air.
    - Above 10 kt it moves later in a steady increase, by (headwind − 10 kt) × the time the break and the final turn take together (about 18 s + 30 s), up to the departure end at most (Patrick, 5 Oct 08:31Z and 08:32Z: "Break later all the way up until the departure end. Steady increase from the ten knot break point"; "it just moves further with the wind to make it work"; TR-84). The rollout moves too, and the downwind keeps about the length it has at 10 kt instead of being squeezed out as the final turn drifts back. That is about 2,800 ft past the threshold in 20 kt and about 6,000 ft in 60 kt.
    - It replaces today's two points: 2,000 ft in calm air, and V6's 3,818 ft point in any wind at all (route.js:609, :745).
13. **Final turn.** It is a continuous descending turn from the perch to the window, up to 45° bank (SMM 4.19 paras 43-48).
    - The perch moves so the turn rolls out at the window: earlier in a strong headwind, later in a light one, tighter with wind from the north, wider with wind from the south (Patrick, 08:27Z; SMM 4.20 para 49).
    - It ends on the glide path in both height and slope: at the rollout it is already coming down at the window's own slope (about 3°), which final carries on, so it never levels at the window and sits above the glide path (Patrick, 5 Oct 08:17Z; TR-82).
    - The 3° glide path ends at the base of the runway numbers, 207 ft past the threshold, at the runway's height: that is the aim point, so the aircraft crosses the threshold about 11 ft up, and the climb-out of a touch-and-go starts there. The straight-in's 3° line ends there too (Patrick, 6 Oct 06:33Z; TR-93).
    - The flare: from 15 ft over the runway the sink dies away and the wheels touch 400 ft past the numbers at about 120 ft/min (estimates; Patrick, 6 Oct 06:50Z: 300-500 ft); the attitude comes up to about 6°. The touch-and-go climb-out starts at the touchdown point; the straight-in flares the same way (TR-96).
    - Crosswind on final (Patrick, 11 Oct 09:03Z and 09:23Z; SMM 4.12 paras 25-28; reference data): from halfway between the window and touchdown, the aircraft changes from the crab to the wing-down method over about 3 s. The nose lines up with the runway, and the upwind wing comes down just enough to stop the drift. The bank is set at the window's speed by balancing the slip's side force against the bank (an estimate: about 4° in 10 kt across, 8.5° in 20 kt, 11° in 25 kt). It grows from there as the aircraft slows, because the wind's effect is stronger (about 10° in 20 kt in the flare). It lands on the upwind wheel, and the wings level as the other wheel comes down. The nose stays on the centreline through the roll. A touch-and-go goes back to the crab over about 3 s once airborne again. The ground track and glide path don't change. 25 kt across is the reference landing limit (reference data) (TR-143).
    - The perch search moves the perch by 0.6 of each miss, at most 1,500 ft a try, for up to 20 tries, and keeps the best (estimates; TR-83). It holds the window to within about 5 ft up to about 46 kt of wind from 260°-270°.
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
Dotted line, 4 waypoints from the south up the inner rejoin line (the overhead's base leg, 3.22 NM out), joining PAT_INNER at the 45° entry leg (3,500 ft / 220 KIAS; TR-67).

### 4.4 ENT_SI — Straight-In Entry
Dotted line, 6 waypoints from the south up the outer rejoin line (the straight-in's base leg at the Arrow Tree Rows, 3.89 NM out; EFIG p.131), then the 45° leg to final at 3.03 NM and the glide path from 2.5 NM, at 2,700 ft (TR-67). The glide path point moves with the temperature to where a true 3° line meets 2,700 ft on the altimeter: 2.46 NM on a standard day, 2.62 NM at 30°C, 2.10 NM at −30°C (Patrick's card "Follow the mark", 5 Oct 07:29Z; TR-80).

### 4.5 PFL: engine failure, and the glide from High Key

Approved 4 Oct 2026 08:54Z (Traffic refactor PR 3). Replaces the old 4.5 PFL_HIGH_KEY, 4.6 PFL_PATTERN and 4.7 PFL_FROM_AREA. Item 3, the planned chain that replaces the old steer-to-the-line follower, is Patrick's of 10 Oct 2026 (TR-113).

One runway for now: every PFL flies to 29L, and one that makes the runway ends in a touch-and-go (Patrick, 4 Oct 11:53Z, TR-49).

1. **Two ways in.** The PFL button is an engine failure where the aircraft is, power off from that moment. High Key (TR-R31) is practice: the aircraft arrives at High Key under power (PR 4), then flies this same glide.
2. **The pattern is a circle.** 0.5 NM radius in calm air, left-hand for 29L, closing tangent to the centreline at the threshold (SMM 13.6 para 13). No straight legs.
   - High Key: over the threshold on runway heading, window 5,000-6,000 ft MSL (WFO S2 art 403 para 1a; Patrick 06:30Z).
   - Low Key: 180° round, 1 NM abeam, about 3,700 ft MSL (SMM 13.8 para 17).
   - Final Key: 270° round, about 3,000 ft MSL, 1,000 ft AGL (SMM 13.9 para 18). Shown as "Final Key".
   - Key heights are what the aircraft is checked against, not a schedule it is held to.
3. **How it flies: one planned chain (TR-113; Patrick, 10 Oct 2026).** The aircraft plans the whole glide as a chain of pieces, flies each piece as planned, and works out the height it needs by adding up the same pieces it will fly. That gives one height sum on one path (Fable F9, F16).
   - **The pieces.**
     1. *Zoom or slow-down.* Above 150 KIAS: 2 G pull, push over, capture 125 KIAS, turning toward the join at up to 30° (item 5). At or below 150 KIAS: hold height and slow to 125. Planned and flown by the same zoom law, so the plan's apex is the flown apex; the core zoom (`flyZoomT6A`, reference data table) stays the reference for the height gained.
     2. *Turn.* A turn of a set size over the ground (the circle, a join turn, a turn onto final), in one direction. The bank is whatever holds that radius over the ground in the wind, up to 60° and the stall line (items 8, 11). The roll-in starts early enough to roll out on the next piece, so no corner is cut. Joining the circle from inside it, the turn onto the circle is planned too, at the 45° radius.
     3. *Straight.* A ground track held wings level, crabbed for wind.
     4. *Drag step.* Gear, T/O flap or landing flap at a planned point on the chain, at least 5 s after the step before it (Fable F6).
     5. *Round-out and flare.* Below 200 ft lined up: check to 3° to 100 KIAS, hold it, flare to touch down in the first 1,000 ft (item 13, TR-110).
   - Height lost on each piece comes from the glide drag of the configuration down, at the speed flown, with the turn's G and the wind, in altimeter feet (TR-77). The plan and the aircraft use the same numbers.
   - **Flying it.** The aircraft flies the piece it is on. A small correction holds it on that piece's line if wind or rounding moves it off. It never steers at a point further ahead.
   - **Re-planning happens only** at High Key, Low Key and Final Key; when the margin is more than 300 ft short; or when a drag step is no longer enough, or too much, to land. A new plan is flown for at least 5 s before it can be given up (plan grace, an estimate).
   - The margin is height now minus the chain's height needed, and it shows on the tag as today (item 14).
   - **When high: widen and square off (Patrick, 10 Oct).** A pattern PFL (the PFL button pressed in the circuit) still more than 100 ft high with all the drag out loses height the way a pilot does:
     - *Wide Low Key.* It flies Low Key further out from the runway.
     - *Square off the turns.* The rounded turns to Final Key and to the threshold become a straight leg, a turn of about 90°, another straight leg, and a turn of about 90° onto final, sized to burn the spare height. Landing flap goes rolling into the base turn (Patrick, 10 Oct 20:06Z).
     - *Final Key stays where it is.* Base still passes the normal Final Key spot; it is never extended (TR-48; Patrick's card, 10 Oct 19:46Z).
     - *Lands as normal.* It rolls out lined up, wings level, and touches down in the first 1,000 ft.
     - Area and High Key PFLs don't square off. They still lose extra height before High Key (TR-43).

4. **Speed.** 125 KIAS clean until the gear goes down, then 120 KIAS (SMM 13.5 para 8, 13.14 para 26; Patrick 06:26Z). Never slower to stretch the glide, except direct to the threshold (item 10).
5. **Zoom.** Above 150 KIAS: a 2 G pull, push over through 140, capture 125 (EFIG p.408). The zoom turns toward the chosen join point at the same time, never away from the runway. At or below 150 KIAS: hold height and slow to 125. Reference data (20° to 145 KIAS, p.3-12) stays a reference.
6. **Choosing the join.** Chosen at the button press from energy height (He = h + V²/2g, true airspeed), less the expected zoom loss, and checked again at the top of the zoom.
   - Points every 5° round the wind-corrected circle are tried.
   - A point is reachable if a clean, 125 KIAS tangent glide with the wind gets there with height to spare.
   - Of the reachable points, it picks one it can join in a single turn, rolling out on the circle's line before the point, with the least turn (SMM 13.13 para 24, 13.17 para 38; EFIG p.409-410). Gliding, the turn is planned at 45° and tighter if it must, down to 60° (Patrick 08:34Z) and never past the stall line. While zooming, that turn is planned at the zoom's bank (30°, an estimate) at its mean speed, tighter only if it must.
   - No orbit or turn away only to lose height (Patrick 17:51Z, confirmed 17:52Z). A join it can make at the planned drag wins over one that would be high only if its turn is no more than 90° longer (an estimate); otherwise the high one goes and the drag takes the height off (item 7). A turn of more than 180° is planned only to carry on a left turn the aircraft is already in, as from the break. A high join must still put it on the runway: at or before 225° round (room to square off, an estimate), or with all the drag out it lands before the far end's stopping margin (PFL rework, 5 Oct 2026, TR-85; wording waiting on Patrick's yes).
   - Inside the circle, where no single-turn tangent join exists, it meets the circle instead: a turn of up to 60° toward a point on the circle, straight to it, then left onto it, up to 120° (both estimates), like extending a little and turning onto the profile (Patrick 5 Oct 22:07Z). If every join within 180° of turn would leave it too high to land, even with all the drag out after the join, it turns round to rejoin the profile: up to one full turn, either way, with drag as required before the join (none, gear, or all of it; drag before the join only within about 5 NM). It takes the join nearest the planned profile, then the earliest round the circle, then the least turn. From inside the circle that can be one full left turn where it is, then out to meet the circle (Patrick 5 Oct 22:11Z). (TR-87, TR-88; approved by Patrick 22:23Z.)
   - A turn one way then the other (an S) is flown only when no single-turn join, in range or high, leaves it in range of the runway (Patrick 09:46Z, 17:51Z).
   - At the apex it changes only if the first choice is no longer reachable.
7. **On the circle: one number, the energy margin.** Three drag options: gear, T/O flap, landing flap. The plan is gear near High Key, T/O flap near Low Key, landing flap near Final Key. Any of them can go early or late as required (Patrick, 08:32Z). Margin = height now − height needed to reach the aim point (the threshold, with the round-out carrying it down the runway; TR-110) round the rest of the circle, flying the planned gear and T/O flap from here on, at the speed flown, with the wind. Re-checked every step. Gear goes down at its planned point unless it is low; earlier only with height to spare. Up to about 100 ft high is carried round. More than that before Low Key, the T/O flap goes early, anywhere on the circle (Patrick 23:51Z; TR-89). From Low Key the landing flap goes as soon as it would still touch down in the first 1,000 ft: closer is better (Patrick 09:49Z, 09:56Z).

   | Margin | What it does |
   |---|---|
   | At or past a step's planned point, and no more than 50 ft low | Takes that step: gear, then T/O flap |
   | Before a step's planned point, with the step's cost plus a buffer to spare | Takes the next step early |
   | With landing flap it still reaches the first 1,000 ft | Takes the landing flap |
   | Still high with everything out (more than 100 ft, an estimate) | A pattern PFL (the PFL button pressed in the circuit) flies a wide Low Key and squares off its turns to Final Key and to the threshold (item 3); Final Key itself stays where it is, never extended. A PFL from High Key or from the area doesn't square off; it loses extra height before High Key (TR-43) (Patrick 10:10Z, 17:10Z, 10 Oct; SMM; TR-48, TR-113) |
   | About zero | Holds configuration |
   | Below zero | Delays drag; cuts toward the next key |
   | Can't reach the aim point even clean | Leaves the circle, direct to the threshold |

   Getting on the circle comes first; gear can come early (Patrick 17:46Z, 17:51Z, 18:39Z). Before the join the gear goes down when, even with it, the join would still be high (the step's cost plus the buffer to spare), but gliding in from the area not before about 5 NM from the field ("difficult to manage", Patrick 18:39Z). Flaps can come before the circle when the aircraft is high: T/O flap anywhere before Low Key when more than 100 ft high (Patrick, 5 Oct 23:51Z), landing flap rolling in to the base turn when well above profile (Patrick, 10 Oct 20:06Z), and before the join when joining without them would need an unrealistic manoeuvre (more than 60° of bank, an S-turn, or an orbit only to lose height, Patrick 17:51Z). Gear and flap already down when the engine fails stay down, as there is no hydraulic pressure to raise them: the glide starts in that configuration and only adds drag (Patrick, 11 Oct 08:43Z). On a pattern PFL, gear and flap may both be needed before the circle (Patrick, 10 Oct 22:13Z). On the circle, or committed direct with the runway made, drag goes as in the table (SMM 13.6 para 15, 13.17 para 39). Circuit PFL: gear by Final Key at the latest. High Key and area PFL: gear by High Key, later if it arrives low (Patrick 06:26Z). A square-off leaves 50 ft (the on-profile allowance) still spare, and a new plan (a join, a square-off, a direct) is flown for 5 s before it may be given up, unless it is more than 300 ft short (estimates; Fable F5, F9) (PFL rework, 5 Oct 2026, TR-85; wording waiting on Patrick's yes).
8. **Bank follows the circle.** About 25° in calm air (calculation: r = V²/(g·tan φ) at about 127 KTAS); more on the downwind side and less into wind, to hold the ground track. Roll rate and easing are PR 2's.
9. **Too high.**
   - Circuit PFL never has the energy for High Key; it always joins the circle at a tangent (Patrick 06:30Z).
   - Area PFL at High Key inside 5,000-6,000 ft, and a PFL started at High Key (the High Key button): extends down the runway to a false High Key, then flies to a false Low Key, the whole circle moved along, with drag going on as it is due; from the false Low Key it carries on down the downwind to Low Key (SMM 13.7 para 16, Fig 13.4; Patrick 17:36Z).
   - Above 6,000 ft: orbits at High Key, or takes the gear early, until in the window (SMM 13.5 para 11; WFO S2 art 403 para 1b). An orbit to lose height, here or turning round to rejoin (item 6), is flown at 30° of bank, about 0.82 NM across, and loses what the drag gives. The 1 NM circle on the ground stays (SMM 13.5 para 11; Patrick 23:29Z; TR-89).
10. **Can't make the circle.** Make the runway if it can be made at all (Patrick 18:29Z, 18:39Z). Close in (in the final turn or on base), it carries on the turn it is in onto the runway: one turn at the bank that rolls it out on the centreline, at most 60° and the stall line, flying straight on first if that bank would be under 15° (then turning at the 45° radius), used only when it lines up before the first 1,000 ft; it aims at the first 1,000 ft, or nearer if it must, and lands wherever that turn reaches. Further out, the base-to-final glide below. The gear goes down by 2,400 ft or once lined up, unless the gear would make it short; then it lands gear up. Flaps go as on the circle, if the margin allows (Fable Q2 (c) and Q3 (a), Patrick's rulings, 5 Oct 23:07Z and 23:09Z) (PFL rework, 5 Oct 2026, TR-85; wording waiting on Patrick's yes). Otherwise: direct to the threshold, gear up, flight path within 35° of runway heading by 2,100 ft. Late in the glide it may trade speed for height down to 80 KIAS, shown on screen as below the SMM speed, but never closer than 5 kt to the stall speed for the configuration it is in: 86 KIAS clean, with gear or T/O flap, 76 KIAS with landing flap (TR-52). It may turn early and land further down the runway (Patrick, 08:33Z). If it can't make the runway at all, it ejects: the tag says "Eject" (Patrick, 08:33Z). It glides on toward the runway as it is until Low Key or Low Key height (3,700 ft), whichever comes first, and ejects there; already past Low Key or below its height, it ejects at once. The aircraft is removed and a red ✕ stays where it ejected (TR-53; Patrick 4 Oct 18:05Z). If at the zoom's top it obviously can't make it (the runway is more than 1.5 glide-ring radii from the ring's centre, an estimate), it thinks for 5 s on its way and ejects there instead. The seat fires, the parachute opens and drifts down with the wind, and the abandoned aircraft dives into the ground. The 3D view shows all of it; the 2D map shows the parachute. A practice from the High Key button never ejects this way (Patrick 5 Oct 06:29Z; TR-75).
11. **Wind.** Bank varies to hold the circle over the ground. In strong wind the keys also move into wind: High Key the full amount, Low Key half, about 1,000 ft per 10 kt (EFIG p.402, p.406; SMM 13.12 paras 21-23).
12. **2,100 ft gate** (200 ft AGL): 120 KIAS and within 35° of runway heading (TR-R14). Bank under 45°, gear down and T/O flap are shown as flags (SMM 13.14 warning). Practice: a missed gate goes around. Engine failure: keeps going and tries to land.
13. **Landing.** Wings level before the threshold. The glide aims at the threshold, and the round-out carries it down the runway (TR-110). Lined up below 200 ft, it checks to 3° until reaching threshold-crossing speed (100 KIAS), holds that, then flares to touch down in the first 1,000 ft, closer being better (SMM 13.9 para 18, 13.10 para 19; Patrick, 6 Oct; TR-47, TR-110). High late joins must land in the first third (TR-106). Touches down in line with the runway, no slower than the speed trade's floor (item 10, TR-52). A touchdown past the first third is shown on the tag as "Touchdown past the first third". A PFL that makes the runway then flies a touch-and-go, power back on, and carries on in the circuit (Patrick, 08:40Z); the touch-and-go itself is today's, made jump-free in PR 4.
14. **On screen.** Once a PFL starts, a small tag beside the aircraft in 2D and 3D shows its current decision (for example "Zoom to circle", "Join at Low Key", "False High Key", "Direct threshold") and its configuration (clean, gear, T/O flap, landing flap). The margin shows as high / on profile / low at each key. Glide ring: how far the aircraft can glide from where it is now, in the configuration down, corrected for wind (the circle's centre drifts downwind by the wind over the glide time, so it is no longer centred on the aircraft), drawn on the ground (Patrick, 08:33Z). The PFL circle is also drawn on the ground.
15. **If the numbers fail.** If the join search returns nothing usable (no finite answer), the aircraft does what item 10 says: direct to the runway, turning early to land further down it if needed; if it can't make the runway, it glides on to Low Key or Low Key height and ejects there (Patrick, 4 Oct 19:37Z).

#### PFL settings (each with a default)

| Setting | Default | Source |
|---|---|---|
| High Key window | 5,000-6,000 ft MSL | WFO S2 art 403 para 1a; Patrick 06:30Z |
| Keys move into wind | On from 15 kt; can be switched off | EFIG p.406; 15 kt is an **estimate** (Patrick 06:56Z) |
| Max bank on the PFL | Up to 60° until the 2,100 ft gate; below it, bank over 45° is flagged | Patrick, 08:34Z; SMM 13.14 warning. The stall line still holds: at 120 KIAS it allows about 59° (calculation, stall 86 KIAS) |
| Drag buffer | Next step's cost + 100 ft, for a step before its planned point | **Estimate** (`pfl-energy-logic.md`) |
| Early gear | Before the join when still high with it; gliding in from the area, not before about 5 NM from the field | Patrick 5 Oct 17:51Z, 18:39Z (TR-85) |
| Join choice | A join that fits beats a high one only if its turn is no more than 90° longer; over 180° only to carry on a left turn already banked 10° or more; a high join at or before 225° round, or landing before the far end's margin | Patrick 17:51Z (no orbit or S to lose height); 90°, 10° and 225° are **estimates** (TR-85) |
| Plan grace | A new plan is flown 5 s before it may be given up, unless more than 300 ft short; a square-off leaves 50 ft spare | **Estimates** (Fable F5, F9; TR-85) |
| Carry on the turn | Close in: one turn onto the centreline at up to 60°, straight first if under 15°, lining up before the first 1,000 ft, aiming at the first 1,000 ft and at least 300 ft past the roll-out | Patrick 18:29Z, 18:39Z, 08:34Z, 09:49Z; 15° and 300 ft are **estimates** (TR-85) |
| On profile | Down to 50 ft low still counts as on profile: a planned step is taken | **Estimate** |
| Touchdown point | Aim at threshold, round-out carries down runway, touch down in first 1,000 ft (first third for high late joins) | SMM 13.9 para 18, 13.10 para 19; TR-47, TR-106, TR-110 |
| Square off when high | Pattern PFLs only: more than 100 ft high with all drag out: corners tighten to the 45° radius, then the downwind moves out up to 6,000 ft; Final Key fixed; landing flap rolling into base; looked at every 10 s, and on the way to the join only within 3 NM of the threshold | Patrick 10 Oct (TR-113); 100 ft, 6,000 ft, 10 s and 3 NM are **estimates** |
| Start of the glide | Holds the bank it has for 1 s, then turns for the join, so the hand-over has no step in turn rate | **Estimate** (reaction time); Patrick 09:21Z, no snap at hand-overs |
| Zoom | 2 G, push through 140, capture 125; only above 150 KIAS | EFIG p.408; Patrick 4440, 06:35Z |
| Pitch changes | The nose moves by changing G, never in a step: G builds and eases at up to 2 G/s (changing at up to 8 G/s²); the glide may pull up to 2 G in all, never past the stall line and never below 0 G; drag counts the whole G, turn and pitch together (TR-51) | Patrick 4 Oct 17:49Z, 17:52Z; 2 G is his; 2 G/s and 8 G/s² are **estimates** |
| Speed trade floor | 80 KIAS, or 5 kt above the stall for the configuration down if higher: 91 KIAS clean, with gear or T/O flap, 81 with landing flap (TR-52) | Patrick's card 18:04Z; stall 86 clean (core; SMM 5.5 para 15 gives about 80-85), 76 with landing flap (SMM 5.8 para 29); T/O flap at the clean number and the 5 kt margin are **estimates** |
| Eject point | Can't make the runway: glides on until Low Key or 3,700 ft, then ejects (TR-53) | Patrick 18:05Z; Low Key height SMM 13.8 para 17 |

### 4.8 TAKEOFF — Runway Departure

See 4.1, item 10: at full power on runway heading, 5-7° nose up to 180 KIAS, 180 KIAS climb to 3,500 ft, accelerate to 220, crosswind turn once 220 is reached (Patrick, 08:11Z and 08:15Z, 4 Oct 2026; SMM 3.11, SMM 3.14 para 35, SMM 18.4 para 13).

### 4.9 BREAKOUT — Circuit Breakout
See 1a, items 15-18 and 22 (Patrick, 09:56Z, 4 Oct 2026).

### 4.10 GO_AROUND — Wave-off Climbout
See 1a, items 15-18 and 20 (Patrick, 09:56Z, 4 Oct 2026).

### 4.11 CLOSED_PATTERN — Closed Pattern Command
See 1a, items 15-19 (Patrick, 09:56Z, 4 Oct 2026). Touch-and-go is item 21 and High Key from anywhere is item 23.

### 4.12 Automatic deconfliction (Patrick, 4 Oct 09:40Z to 11:54Z)

Design and Patrick's nine answers: project files, `traffic-deconfliction/design.md`. Code: `deconflict.js` (decides), the shared `src/core/closest-approach.js` (the maths, ALL-27), `evade.js` (the flinch, the climb ahead and the straight-in rejoin, flown by the circuit's pilot), `breakout.js` (the breakout, flown the same way), `sim.js` (starts the moves). Setting: Traffic settings > Conflict limits > **Automatic deconfliction**, on at the start (Patrick, 4 Oct 16:59Z, TR-50).

1. Every 0.5 s, from all the aircraft as they were before anyone moved, each aircraft's position is predicted every second for 15 s: along the path it is following, at today's ground speed, or straight on when it flies free. Past the end of a path that ends (a straight-in at the runway, a flown move) it runs straight on along the last leg, as it really does, rather than stopping there (4 Oct, with item 10: a straight-in stopped at the threshold looked like a conflict to the aircraft spaced behind it).
2. Nothing happens unless a pair would get inside the caution distance (500 ft and 500 ft, TR-Q11) within 15 s (Q2).
3. **Layer 1, by the book.** The right-of-way table picks the one that gives way, once per pair, the same whichever aircraft is asked:
   - a PFL keeps right of way; an overhead aircraft at initial or in the break flies through, anyone on final goes around, anyone else breaks out (Patrick 09:43Z; WFO S2 art 401 para 9; SMM 4.28 para 68);
   - downwind over a fly-through, which climbs straight ahead to about 500 ft above pattern height (Q4, an estimate) and then breaks out (WFO S2 art 401 para 9 Note 1; SMM 4.28 para 67);
   - established in the pattern over joining, which breaks out (SMM 4.5 para 8, 4.15 para 35);
   - spacing on final comes first (item 10): an aircraft on the inner downwind extends its downwind to turn in behind traffic on final, and breaks out only when there is no room;
   - the perch is the point of no return (Q1): before it the aircraft about to perch breaks out if a conflict is still coming; past it the straight-in moves over 500 ft toward the inner runway (Q5, an estimate; the real 29L/29R gap is a question for Dad) and goes around (SMM 4.19 para 43, 4.28 para 68, 4.21 paras 50-51). It adds power and levels off at 2,100 ft, coming down to it on a 3° path (an estimate) if it is higher, and slows or speeds up to 120 KIAS; it holds 2,100 ft and 120 KIAS to the upwind end (the overshoot), then climbs out at take-off pitch, speeding up to 180 KIAS, as the go-around's climb-out does (Patrick, 4 Oct 19:01Z and 19:52Z, TR-56); past the upwind end it eases back across onto the runway centreline and flies the circuit's own climb-out line (Patrick, 6 Oct 06:43Z, TR-94); an aircraft on final that gives way to a PFL or to an aircraft that has perched moves over the same way instead of a plain go-around (Patrick, 5 Oct 05:53Z, TR-73); the Go-around button still levels at 2,500 ft;
   - no rule (Q9): the higher aircraft moves (higher by 100 ft or more, an estimate); at the same height the one on the right has right of way, so the one on the left moves; a dead heat goes by callsign order (an estimate).
4. **Layer 2, by skill.** If the red (200 ft and 200 ft) is still coming within 6 s, the one giving way acts if it still can; within 3 s the one with right of way acts too (SMM 4.28 para 69). The skill move is the flinch and then the breakout, or a go-around on final (a straight-in counts as on final only on its last leg) (Q3). The flinch lasts about 5 s (an estimate): the aircraft above (or level and first by callsign) trades speed for about 500 ft of height wings level; the one below banks away at up to 60° (SMM 4.14 para 33), never past the stall line; head-on, both go right. A PFL only banks away: out about 500 ft off its path over about 12 s, back over about 20 s (estimates), keeping its glide.
5. The moves: the breakout (TR-R34), after which a straight-in rejoins its own straight-in 2 NM before the end of its first leg, at that leg's height, and anyone else rejoins on the overhead entry as before (Q7); the go-around (4.10); and the fly-through, which is the go-around's flown path from where the aircraft is at pattern height (straight on to the departure end, crosswind, the outer downwind; WFO S2 art 401 para 9). A move already flying is never restarted.
6. A tag beside the aircraft says what it is doing, like the PFL tag: `[SPACING: extend downwind]`, `[GIVING WAY: break out]`, `[GIVING WAY: fly-through]`, `[GIVING WAY: go-around]`, `[GIVING WAY: move over]`, `[EVASIVE: flinch]`, `[EVASIVE: bank away]`.
7. **When data fails:** an aircraft with a non-finite position, height, track or speed is left out of the check for that tick, never an error, and every other pair is still checked. A red that still appears is the honest sign it could not clear it. A rewind replays the same decisions (no dice, the tag is part of the aircraft's saved state).
8. **Speeds:** predictions use ground speed; the moves fly their own indicated speeds.
9. **Known limits:** a PFL's bank away costs height (TR-55): the path follower charges the extra G's drag and the extra ground at the glide ratio (about 40 ft for the 500 ft bank away, a calculation), and when it is back on its glide the PFL re-plans from where it really is; its speed stays the planned one. The flinch, the climb ahead and the breakout after them are all flown paths, so the deconfliction predicts them along the path they will fly (the breakout since 4 Oct, `breakout.js` `buildBreakout`).
10. **Spacing on final** (TR-R18; Patrick's R25; Patrick, 4 Oct 21:50Z and 21:52Z; TR-58). Every 0.5 s, before the right-of-way check, an aircraft on Pattern 1's inner downwind looks at the traffic on final: anyone lined up with the runway (within 2,000 ft of the centreline and 30° of its track, short of the threshold and no more than 500 ft above the glide path, all estimates), anyone in the circuit's final turn, and anyone already extending. Each one's place is walked along the path it is following at its route's speeds in today's wind. Unless it would stay at least 2,000 ft behind each one all the way down final (the Flying Orders' day minimum, TR-R18), or roll out at least 2,000 ft ahead of it, it extends its downwind by the shortest distance (in 100 ft steps) that keeps 2,000 ft (its final turn comes down steadily but never under the 3° line to the numbers: where it would, it rides that line and rolls out on it, coming down; Patrick, 6 Oct 07:42Z; TR-104):
    - it flies on past its perch along the downwind line by that distance at 120 KIAS, flies the same final turn, and rolls out on the extended centreline at the glide path's height there (the window's own slope, about 3°, carried further out), then joins Pattern 1's own final 1,000 ft inside the window and lands as the circuit does;
    - it breaks out instead only if the extension would bring its final turn within 1,000 ft (an estimate) of the overhead pattern's base and 45° leg (Pattern 1 points 6 to 8; Patrick: "It would break out if it would hit the base leg of the OHB pattern"). With today's points that is about 13,000 ft past the perch;
    - one that would be at least 2,000 ft behind is left to space itself (it moves over if it must, item 3);
    - behind a straight-in, one in four don't extend: they perch anyway and the straight-in moves over (Patrick, 5 Oct 06:28Z, TR-74);
    - the tag reads `[SPACING: extend downwind]`.
    In the Busy circuit check (seeds 1-5, 260°/15 kt) the overhead aircraft extends about 1,700 ft behind the straight-in, the straight-in lands, and nobody moves over; the gap at the threshold came out at about 1,800-2,000 ft, because the speeds down final are estimated.

---

### 4.13 Randomize behaviour (Patrick, 4 Oct 21:52Z to 22:29Z)

Code: `randomize.js` (the odds, the seeded rolls and the straight-in from the outer downwind), `sim.js` `randomizeTick`. Setting: the **Randomize behaviour** box under Scenarios, off at the start, and under it, only while it is ticked, a **How often** slider (percent of rolls that pick something other than the normal circuit; 40 by default, an estimate; Patrick's card "Odds as a setting", 22:29Z). TR-59.

1. Every 0.5 s an aircraft at one of three points rolls once:
   - **On the upwind after take-off**, from the departure end of the runway to 3/4 mile past it (Patrick, 21:54Z): a closed pattern (4.11), a closed pattern to High Key (the climb to High Key and the practice PFL), or carry on. Closed patterns only start here, before the crosswind turn; the Closed pattern button still works from anywhere.
   - **Abeam the departure end on the outer downwind** (Pattern 1 point 5): descend for a straight-in, climb to High Key for a PFL, or carry on round the overhead.
   - **On final, about a mile out** (an estimate): touch-and-go, full stop, or a low approach, which goes around about 1,500 ft short of the threshold (an estimate) as the go-around does (4.10).
2. The normal choice (carry on, or touch-and-go on final) takes 100 minus the How often percent; the other two split it evenly.
3. **The straight-in from the outer downwind** (the SI pattern; Patrick, 4 Oct 22:44Z: descend from abeam the departure end, then intercept ENT2, the SI rejoin, rolling out on base while decelerating to 140 knots) is flown once by the circuit's pilot: from abeam the departure end down from 3,500 to 2,700 ft at 220 KIAS (SMM 4.16 para 36), at no more than 1,000 ft/min (an estimate), then level and slowing at idle toward 140 KIAS (SMM 4.16 para 36); the left turn at 45° (an estimate) onto ENT2's base leg (Entry Mid to Entry Gate, about a mile past the overhead's base turn as SMM 4.16 para 36 has it), rolling out on base at 140 KIAS. Settled on the base leg it joins ENT2, which flies the Entry Gate at 120 KIAS, the final turn and the glide path to the runway. Without ENT2 in the setup it carries on round the overhead.
4. **Repeatable:** each roll is a hash of the run's seed, the callsign and how many rolls that aircraft has made, kept as plain fields on the aircraft, so a rewind replays the same choices and the order of the aircraft changes nothing.
5. **Not rolled:** an aircraft flying a PFL, a climb to High Key, a go-around or another flown move, one with its engine failed, or one the deconfliction is moving. A move the dice start is flown exactly as its button flies it, and the deconfliction treats it the same way.
6. **When data fails:** an aircraft with no position is skipped that tick; nothing else changes.

### 4.14 Behaviour tag on every aircraft (Patrick, 4 Oct 21:55Z to 23:45Z)

**4 Oct (Patrick):** lined up on final, past the window and low (no more than 300 ft above the window's height, an estimate; Patrick, 6 Oct 06:43Z, TR-94), the tag is the landing behaviour: `[T+GO]`, `[STOP]` or `[GO AROUND]` (a low approach goes around). Round the lap the tag says only `[OHB]` or `[SI]`, the pattern the aircraft flies: no stage (UPWIND, OUTER, FINAL), no next step and no configuration. The manoeuvre tags (CLOSED, GO-AROUND, BREAKOUT, CLOSED TO HIGH KEY), the deconfliction's tags and the PFL tags are as below.

Code: `behaviour.js` (the tag's words and the configuration), `sim.js` `state()` (the `behaviour` field), `map2d.js` `getPflBadge` (shows it on the map and in the aircraft list). TR-60.

1. Every flying aircraft carries a tag in the PFL tag's style: the pattern it is flying, what it does next (not for OHB and SI) and its configuration, for example `[OHB · Gear + T/O flap]`. Clean is never shown outside a PFL's own tag: no configuration means clean. Words approved by Patrick (card list 22:34Z, "overhead can just be OHB" 22:44Z, "agreed" 22:53Z and 22:57Z; shortened 23:14Z, list approved 23:45Z):
   - Overhead entry, initial, break and inner downwind: `[OHB]`, then `[OHB · Gear + T/O flap]` once below 147.
   - Final turn and final: `[FINAL: touch-and-go · Gear + landing flap]`, or full stop, or low approach.
   - Upwind: `[UPWIND: crosswind next]` (with `· Gear + T/O flap` on the runway); crosswind and outer downwind: `[OUTER: initial next]`, or `[OUTER: SI next]` on the SI pattern (4.15).
   - Straight-in: `[SI]`, then `[SI · Gear + T/O flap]` on base, then the FINAL tag once lined up.
   - Closed pattern: `[CLOSED: downwind next]`; climb to High Key: `[CLOSED TO HIGH KEY: PFL next]`; go-around: `[GO-AROUND: outer downwind next]` (with `· T/O flap` until 110 KIAS); breakout: `[BREAKOUT: rejoin next]`.
   (The card's `[UPWIND: closed next]` never shows: a closed pattern the dice pick starts at once and shows its own tag.)
2. **Who wins:** a PFL's own tag shows while it glides; the deconfliction's tags (`[GIVING WAY: …]`, `[EVASIVE: …]`, `[SPACING: extend downwind]`) show while their move flies, with the configuration added unless clean, for example `[GIVING WAY: break out]`.
3. **Configuration** (Patrick's yes to the list, 22:53Z), with the PFL's labels plus "T/O flap" for gear up with the take-off flap still down:
   - OHB: Clean through the initial and break (SMM 4.17 paras 38-39); Gear + T/O flap on the inner downwind once below 147 KIAS (SMM 4.17 paras 40-41, EFIG p.185; the gear point is a guess: no manual names it); Gear + landing flap from the perch (SMM 4.19 paras 43, 48).
   - Straight-in: Clean down the outer downwind and until on ENT2's base (SMM 4.16 para 36); Gear + T/O flap on base (SMM 4.6 para 9); Gear + landing flap inside the window (SMM 4.8 para 13; the window's distance is Pattern 1's point 12 from the threshold).
   - Closed pattern: Clean in the pull-up, then as OHB from the downwind (SMM 4.24 paras 57-58).
   - Take-off, touch-and-go and go-around: Gear + T/O flap on the runway, gear up once 50 ft above the field (an estimate), flaps up at 110 KIAS (SMM 4.13 paras 30-31, 4.22 para 53).
   - Low approach: unchanged until the go-around (SMM 4.21 paras 50-51). Climb to High Key and breakout: Clean.
4. The tag only names what the sim already flies; it never changes how an aircraft flies. A PFL's configuration stays its own (pfl.js).
5. **When data fails:** an aircraft with no route and no flown move shows no tag; one with no position shows its tag without the straight-in's final check (its configuration stays as on base).

### 4.15 SI pattern (Patrick, 4 Oct 23:15Z to 23:19Z)

Code: `sim.js` `siPatternTick` and `startStraightInFromDownwind`, `randomize.js` `buildDownwindStraightIn`. TR-61.

1. An aircraft that starts on a straight-in (ENT2) flies the SI pattern lap after lap, as an OHB aircraft flies Pattern 1: after its touch-and-go it flies Pattern 1's climb-out, crosswind and outer downwind, then the straight-in from the outer downwind (4.13 item 3), joins ENT2 on its base leg and lands again. Patrick: "basically the OHB pattern but with the descent (keep 220 until at 2700) then joins the ENT 2 (just like how OHB works)".
2. The descent starts abeam the departure end (Pattern 1 point 5, within 3,000 ft past it, an engineering window). Patrick's card "Departure end" (23:19Z): SMM 4.16 para 36 says the approach end, but it was written when the pattern was at 3,000 ft. It holds 220 KIAS down to 2,700 ft (SMM 4.16 para 36), then levels with the power reduced and slows toward 140 KIAS; it may still be slowing in the 45° turn onto base (Patrick, 23:15Z) and rolls out below 147 (SMM 4.16 para 36, 4.6 para 9).
3. Randomize does not roll on the outer downwind for an SI-pattern aircraft (it always flies the straight-in); its upwind and final rolls still apply.
4. **When data fails:** without ENT2 or Pattern 1's outer downwind in the setup it carries on round the overhead.

### 4.16 The aircraft card's menu (Patrick, 4 Oct 23:23Z)

Code: `aircraft.js` (the card), `sim.js` `setPattern`. TR-62.

1. Each flying aircraft's card has one dropdown: **Pattern**, **Landing behaviour** or **Manoeuvres** (the default when the card first shows). Picking one shows that menu's buttons on the card; Remove stays on the card's name line.
   - Pattern: **OHB** and **SI**. SI flies the SI pattern each lap (4.15); OHB the overhead. It takes effect at the next outer downwind. Until set, an aircraft that started on ENT2 flies SI and every other aircraft OHB.
   - Landing behaviour: **Touch & Go**, **Full Stop** and **Go-around** (what was the Landing dropdown).
   - Manoeuvres: **Breakout**, **Closed Pattern** with its bank, **High Key**, **PFL** and **Go-around**, as before.
2. The highlighted button is the aircraft's current choice. The menu each card shows is remembered while the page is open.

### 4.17 Full stop: rollout and taxi-in (Patrick, 10 Oct 20:38Z)

Code: `taxi.js`, `sim.js` `landForTheStop`, `taxiTick` and `runwayBusyTick`, the route in `airfield.js` `TAXI_IN_29L`. TR-115.

1. An aircraft that lands for the stop on 29L slows evenly from its touchdown speed to 20 kt by the runway's end, and turns right off it there. Patrick: "slow down to the end of the runway and taxi off ... it slows to 20 knots and taxis at 20 knots."
2. It taxis at 20 kt along the taxiway from the 29L end, straight across 29R, then along the taxiway north of 29R east onto the ramp. It stops in front of the Bandit hangar (Hangar 2), waits 5 s and is removed. The route is traced off the satellite photo (about ±25 ft). The 200 ft turns, the gentle stop and the 5 s are estimates.
3. On the ground the speed shown is ground speed.
4. While it is on 29L (until 150 ft past its turn off the runway, an estimate), a touch-and-go on final behind it flies a low approach: it goes around 1,500 ft before the threshold, where a randomized low approach does (4.13), or at once if it is already closer. If the runway is clear by then, it lands as usual. Another full stop behind it still lands, and a PFL is not changed.
5. On the ground it takes only a touch-and-go, and only while still rolling on the runway. It is never in a conflict with aircraft flying over it.
6. **When data fails:** a landing for the stop that is not on 29L (a route of your own) is removed at touchdown, as before.

### 4.18 Mid-air collisions (Patrick, 10 Oct 21:15Z)

Code: `sim.js` `collisionTick` and `eject`. TR-116.

1. Two flying aircraft that touch both eject. Touching means passing within 35 ft of each other, centre to centre: Fight Sim's hitbox for the CT-156 (wingspan 33.4 ft, length 33.3 ft). Patrick: "if the aircraft actually do collide/touch, they eject and crash."
2. Each pilot ejects as a PFL pilot does when the aircraft can't make the runway (TR-75): the seat, the parachute, and the abandoned aircraft diving into the ground.
3. The check runs every step, along each aircraft's path through that step, so a fast head-on pass can't slip through between steps.
4. Aircraft rolling out or taxiing on the ground are left out. So are two that were already within 35 ft of each other when the step began (two started on the same spot); they pass through each other.
5. The automatic deconfliction (4.12) is unchanged: a collision happens only when it doesn't keep them apart, or when it is switched off.

### 4.19 CT-102B Astra II pattern (Dad's ask, 13 Oct 2026; Patrick's yes to the plan and a 60° break, relayed by Dad, 13 Oct 2026)

Phases 2a and 2b are built (V2.426, 13 Oct 2026; not yet seen): `astra-circuit.js` flies the pattern below and `route.js` builds it for the route `PAT_ASTRA` (`flown: 'ct102b-overhead'`). Not on screen yet: the route sits in `data/moose-jaw.json` under `routesNotYetInSetup` until Phase 3 moves it into the setup with the spawner and Random filters (item 6). Where building showed a number must differ from what was written before, it is marked **as flown, V2.426**, with the old number kept beside it. The plan is Step 5c in `plan.md`; the reasoning and the file-by-file list are in `ct102-pattern-review.md` (where this section and that file disagree, this section wins). Numbers below are marked **Dad**, **Patrick**, **physics** (worked from the speeds and the bank by the shared turn formula, radius = true speed squared / (g x tan bank)), **public** (a public fact sheet or type-certificate figure, read only through search summaries, unchecked) or **estimate** (no source yet). No Astra manual is in the project files, so nothing here is a manual number. TR-154 to TR-162 in `decisions.md` say which answers are Patrick's and which are working answers not yet confirmed with Patrick.

1. **What it is.** A second pattern at Moose Jaw for the CT-102B Astra II (a Grob G 120TP): same runway (29L), same side (left-hand), flown beside the CT-156's overhead, inside it and 500 ft below. It is an **overhead with a break**, tighter than the CT-156's (Dad's pick, Patrick's yes, 13 Oct). It is flown by the same simulated pilot and the same path follower as every other aircraft, with an Astra parameter set (a second set of numbers for the same point-mass formulas, never a second copy of a formula).
2. **Geometry, from a 180 KIAS initial.**
   - **Initial** at 180 KIAS and 3,000 ft MSL, along the runway, level.
   - **Break** at 60° of bank like the CT-156's (Patrick, 13 Oct: "60 degree break"), power idle, level, slowing on the CT-156's own break curve to about 115 KIAS by the end of the turn. The break point is the CT-156's rule (2,000 ft past the threshold in a 10 kt headwind, later in more headwind, SMM 4.17 para 39 and 4.18 para 42) as a **working choice, not yet confirmed with Patrick**. The 30° limit Patrick gave cannot be the break's bank: a 30° turn at 180 KIAS is a 5,430 ft radius (physics). **As flown, V2.426:** it rolls out at about 115 KIAS (114.5 in calm air); the bank is 60° for the first half, then, to roll out on the downwind line (about 300 ft wider than a steady 60° turn gives), it eases to about 50° for a moment and shallows through the second half onto the line. The break point in calm air is about 1,750 ft past the threshold (the rule, with the Astra's own break and final-turn times).
   - **Other turns at 30°** (Patrick, 13 Oct): the climbing turn and the final turn.
   - **Downwind about 2,700 ft out** from the centreline (physics: twice the 1,340 ft radius of a 30° turn at 90 KIAS, 3,000 ft down to the 3° path), parallel to the runway, about 0.77 of the CT-156's inner downwind (about 3,500 ft). The 60° break on its own would put it about 2,400 ft out (estimate), so the break rolls out on the line the final turn needs, not the other way round; the builder places it and the track shows where it lands. **As flown, V2.426:** 2,740 to 2,800 ft out in calm air. The CT-156's inner downwind as built is about 3,950 to 4,080 ft out in calm air, not about 3,500 (that was read off the route points), so the ratio is **about 0.69**, not 0.77. The line moves with the wind, as the CT-156's does, because the slow final turn drifts: wind from the pattern side moves it out (about 3,450 ft in 15 kt from 209° true; about 3,940 ft in 25 kt from 210°M, level with the CT-156's break exit at the downwind's upwind end, about 3,860 ft), wind from the runway side moves it in (about 2,100 ft in 15 kt from 029° true).
   - **Speed on downwind:** slows from the break's roll-out speed to 90 KIAS by the perch; the gear and flap point is an estimate. **As flown, V2.426:** at idle (the drag model's, which leaves out the propeller's drag at idle, so it slows less than the real aircraft would). In calm air it reaches 90 by the perch; in a 15 kt headwind the overhead's downwind is short (about 2,300 ft) and it reaches the perch at about 100 KIAS, slowing to 90 in the final turn.
   - **Perch** about abeam a point 0.3 NM short of the threshold (along about -2,000 ft), found by the same wind-shaped search the CT-156 uses, at 90 KIAS (Dad); **final turn** at 30° descending to roll out on the 3° path about 0.5 NM out (along about -3,000 to -3,500 ft). This is a working answer, not yet confirmed with Patrick (decisions TR-157). It keeps the Astra downwind clear of the CT-156's final turn, which comes down through 3,000 ft at about 2,700 ft across. The two types then share final from about 0.5 NM in. **As flown, V2.426:** the window is kept (on the centreline 0.5 NM before the base of the numbers, 2,051 ft, on the 3° path), and the search puts the perch **about abeam 0.6 NM short in calm air** (along about −3,760 ft), about 0.5 NM in a 15 kt headwind (about −2,900 ft), not 0.3 NM: a 180° turn rolls out about level with where it started, a little nearer the runway for the roll-in and roll-out, so a perch at 0.3 NM would roll out about 0.2 NM out. The final turn reaches back to about 0.85 NM short (along about −5,220 ft, 1,420 ft across, 2,635 ft) and comes onto the extended centreline about 0.7 NM out, about 150 to 170 ft above the CT-156's window (2,131 ft at 0.75 NM): the two finals meet there, not at 0.5 NM. Sequencing them is Phase 3's spacing rule and Phase 4's conflicts.
   - **Final and flare** are the CT-156's code with 90 KIAS at the threshold (Dad). Same aim point, same 3° path (SMM 4.7), same touchdown point.
   - **Size.** Fitted to the numbers, as Dad asked. Against the CT-156's inner downwind about 0.77 wide; against its outer downwind (2.0 NM) about 0.22; whole footprint about a fifth. Reported to Dad as both readings; exact once flown.
   - **Vertical room.** The two downwinds are 500 ft apart with no spare against the 500 ft caution. Nothing in the plan changes a limit; the check on screen looks for flicker.
3. **The climb and the climbing turn** (take-off, touch-and-go, go-around): working answer, not yet confirmed with Patrick (TR-158). **As built, V2.426:** the touch-and-go lap is the route's closed loop (touchdown, climb, climbing turn, downwind, final, touchdown, about 3¼ minutes in calm air); the climbing turn is flown at 90 KIAS, the low end of 90 to 100, so it rolls out on the final turn's downwind line; it starts at the departure end at about 2,960 ft (the level-off's last few feet). The overhead from the initial (2 NM out on the extended centreline, an estimate) to touchdown takes about 2½ minutes. The go-around and the spacing extension are not built yet (Phase 3). Full power at about 100 KIAS (estimate) to 3,000 ft, straight along the centreline. The climbing turn onto downwind starts when 3,000 ft is reached or the departure end is passed, whichever is later (so it clears the CT-156 go-around level of 2,500 ft), at 30° and held at 90 to 100 KIAS so the 2R of 2,700 to 3,350 ft matches the downwind line. A go-around climbs straight to 3,000 ft and rejoins downwind; the level is an engineering choice, Patrick to confirm. Note: a CT-156 climbing at 180 KIAS behind an Astra climbing at 100 reaches 3,000 ft about 1.1 NM out, the same place, so the upwind is where the two types meet (item 6).
4. **The numbers.**

| Number | Working value | Source status |
|---|---|---|
| Pattern height | 3,000 ft MSL (about 1,100 ft above the field) | Dad, 13 Oct; Patrick's working value |
| Initial speed | 180 KIAS (indicated) | Dad |
| Perch and threshold speed | 90 KIAS (indicated) | Dad |
| Break bank | 60° | Patrick (approved 13 Oct, relayed by Dad) |
| Break slows to | about 115 KIAS (114.5 as flown in calm air, V2.426) | physics on the CT-156's break curve |
| Climbing turn and final turn bank | 30° | Patrick, 13 Oct |
| Downwind distance out | about 2,700 ft (2,740 to 2,800 as flown in calm air, V2.426; it moves with the wind, item 2) | physics (30°, 90 KIAS) |
| Climb speed | about 100 KIAS | estimate |
| Rate of climb, full power | about 2,100 ft/min at sea level | public, unchecked; drives the thrust fit |
| Engine power | 456 shp (Rolls-Royce M250-B17F) | public, unchecked |
| Weight | empty 1,095 kg (2,414 lb); pattern weight about 1,450 kg (3,200 lb) | public, and an estimate |
| Wing area and span | 13.52 m2 (145.5 ft2), 10.31 m (33.83 ft) | public (EASA sheet) |
| Zero-lift drag, Oswald efficiency | CD0 about 0.025, e about 0.8 | estimates (standard values for a clean light turboprop trainer) |
| Propeller efficiency; engine flat-rating height | about 0.8; about 10,000 ft | estimates |
| Stall speed, clean and landing flap | about 68 and 59 KIAS | estimates (public figures for the G 120TP, unchecked) |
| G limits | +6 / -4 | public (aerobatic category), unchecked; not reached in the pattern |
| Maximum speed | about 240 KIAS | estimate, unchecked; not reached |
| Gear and flap limit speeds | not known | estimate, used for the tag's configuration only |
| Roll rate and G onset | the T-6's | estimates (already estimates for the T-6) |
| Drawn pitch (angle of attack, fuselage datum) | the T-6's shape scaled by the Astra stall speed | estimate, drawing only |
| Length, span, height for drawing | 27.62 ft, 33.83 ft, 8.66 ft | public (EASA sheet) |
| Hitbox for collisions | the CT-156's 35 ft | kept (TR-116); noted on `future.md` |
| Go-around level | straight to 3,000 ft | engineering choice, Patrick to confirm |

   Thrust and drag are worked from standard aerodynamics (the T-6 fit's own form: thrust per weight falls with true airspeed, drag per weight has a zero-lift and an induced part) with the derivation beside the constants. The check that the fit is sane: full-power climb at 100 KIAS comes out near the public 2,100 ft/min, and the 180 KIAS level cruise needs less than full power. A published limit (G, speed, the orders) is flagged on screen and is never a wall; only what the aircraft physically cannot do is (AGENTS.md).
5. **Estimates are shown (rule book: flagged, not hidden).** While any number in the Astra's set is an estimate: its aircraft-card tooltip and its behaviour tag end with " · est."; the spawner's route row reads "Astra pattern (working numbers)"; the route's name in "Routes on the map" says the same; and one line in the Traffic settings footer reads "CT-102B numbers are estimates: see docs/modules/traffic/spec.md 4.19." The flags come off number by number as a manual page or Patrick's ruling backs them.
6. **Spawns and conflicts** (working answers, not yet confirmed with Patrick; TR-159).
   - **Type and route are tied.** Picking the Astra route sets the type to CT-102B; picking CT-102B shows its route. The spot buttons come from the route's own tags: Initial, Break (or the nearest tagged point), Downwind, Perch, and the climb-out spots.
   - **Spawn a conflict works both ways** with the existing route-generic planner: select an aircraft of either type and pick either type's route; the aircraft that appears is timed to meet it inside 500 ft and 500 ft within 3 minutes. The message names the type.
   - **Right of way between types.** The existing rows apply where they match (final and past the perch have right of way; before the perch the one turning in extends or breaks out). For the rest: the aircraft established in its own pattern at its own height has right of way; the one crossing or climbing through it gives way. So a CT-156 climbing through 3,000 ft on the upwind, or coming down through it in its final turn before its perch, gives way; an Astra joining or going around gives way to a CT-156 that is established. The moves an Astra can be given are go-around (its own), a bank-away flinch and extend downwind (its own); the CT-156 breakout, move-over, fly-through and climb-breakout are not given to it.
   - **Spacing on final** (the 2,000 ft aim, TR-R18) counts both types as leaders and followers. Pair gap (20 s) is unchanged: at 90 KIAS it is more than the aim.
   - **Not offered to an Astra:** PFL from area, the rejoin boxes and SI spots, and the Manoeuvres buttons (Breakout, Closed pattern, High Key, PFL). Its card keeps Landing behaviour (touch-and-go, full stop, go-around) and Remove.
   - **Scenarios.** The Busy circuit, Random and the others stay all CT-156. Randomize is filtered to routes of the scenario's type so it never puts a CT-156 on the Astra pattern. A Mixed scenario is not built (TR-161; `future.md`).
7. **The ground-track toggle.** The Astra route is one more row in "Routes on the map", like the others: it shows or hides its line, dims it, says "Hidden", and the aircraft keep flying. **Hidden at first**, like the SI Rejoin and the SI pattern, so the opening picture does not change (TR-R2). The tag word is `[ASTRA]`, with " · est." while any number is an estimate (working answer, not yet confirmed with Patrick; TR-160).
8. **When data fails** (safety item):
   - **A missing or damaged Astra route** (not in the saved setup, or a point missing): the Astra type is not offered in the spawner and its row is absent; an Astra already in a loaded setup is removed with a plain message. The sim, the CT-156s and the 3D view carry on.
   - **A failed Astra model load** (file missing, corrupt or too slow): the plain stand-in aircraft is drawn at the Astra's length (27.6 ft) in the Astra colour, and the 3D view never stops (ALL-38 (4)).
   - **A pattern that cannot be built** (the pilot hits its step limit): that one aircraft is removed with the reason; the sim carries on.
   - **Stale or missing numbers** are never invented: an Astra number with no value stops that Astra from flying (item above) and is never filled from the T-6's, except the display-only ones marked in the table.
9. **What the CT-156 keeps.** Every default in the new code equals today's T-6 constant; every `PAT1` lookup returns PAT1 for a CT-156; the only edit inside the CT-156's own flying is a pure move of the final approach and flare into a function both types call, checked track for track in calm air, 15 kt and 25 kt. **As built, V2.426:** besides that move, the break, downwind and final turn (`flyInner`), the break curve, the break-point rule, the perch search and the pilot's thrust and drag take the aircraft's numbers and performance set as parameters whose defaults are the CT-156's constants; Pattern 1, the spacing extension and a go-around were built before and after in five winds and are identical point for point. No CT-156 test is edited or retired.
10. **Left out** (on `future.md`): Astra PFL, closed pattern, High Key, breakout, straight-in and SI pattern, Randomize, a Mixed scenario, the Astra hitbox, Astra cockpit instruments, Runway 11R.

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
3. **Transitions**: No jumps at any hand-over (section 4.1, item 13a). No instantaneous heading or speed jumps.
4. **Landing is explicit**: landing behaviour is governed by each aircraft's intent on its card (Touch & Go, Full Stop, Go-around; default Touch & Go) or chosen at random when "Randomize behaviour" is active (TR-59, TR-62; no seeded dice roll at threshold).
5. **Wind is always applied**: zero wind is NOT a special case. The same physics runs at 0 kt and 30 kt.
6. **Accelerated stall protection**: bank angle capped at accelerated stall limit. At 120 KIAS: max bank 59°. At 140 KIAS: max bank 68°.
7. **$V_{fe}$ guard**: no gear/flaps deployment above 147 KIAS.

---

## 7. The Screen, UI Controls & Progressive Disclosure

### 7.1 Layout Overview
Three columns at 1366 × 768 and up, none covering another (R2), each side column collapsed with a button (`ui-kit/panel.js`). Left column is Setup (Scenario, Weather, Wind, Display and Settings), right column is Aircraft (Spawner, aircraft cards and conflicts), playback bar sits over the map.

```
┌ Setup ──────────────────────┐┌ ▶ Play ⏪ Rewind −10s +10s Reset 8× ▾ 0:12:40 260°M 15 kt 2D|3D Fit Layers▾ ┐┌ Aircraft ──────────────────────┐
│ Scenario: Busy circuit ▾    ││                                                                             ││ Spawn aircraft ▾               │
│ [New picture]               ││                                                                             ││ ▸ Advanced settings            │
│ Weather: Standard ▾         ││               map: satellite photo, runway 29L/11R paint,                   ││                                │
│ Wind from: 260°M (dial)     ││                    routes, aircraft, caution rings                          ││ A1 CT-156  3,500 ft 220 kt [OHB]
│ Wind strength: 15 kt        ││                                                                             ││   [Manoeuvres ▾] [✕]           │
│ Runway: 29L                 ││                                                                             ││   Breakout  Closed  PFL ...    │
│ ▸ Display (Routes & Layers) ││                                                                             ││ A2 CT-156  2,700 ft 140 kt [SI]│
│ ▸ Traffic settings          ││                                                                             ││ ⚠ CONFLICT A1/A2               │
└─────────────────────────────┘└─────────────────────────────────────────────────────────────────────────────┘└────────────────────────────────┘
```

### 7.2 Progressive Disclosure (R22)
- **Playback bar**: Play/Pause, Rewind, −10 s, +10 s, Reset, speed (0.25× to 8×), clock, status, 2D/3D toggle, Fit (a menu: Fit pattern, Fit all routes), Layers. The Active runway list sits in the Setup column under the wind (Patrick, 4 Oct).
- **3D view**: one camera place, the 3D bar at the bottom left (Camera menu, Follow); **Graphics High / Performance** sits beside the 2D/3D switch and reloads the page when switched (TR-152): only the followed or flown aircraft is the full CT-156, the rest light Harvards; Performance also drops edge smoothing, roads, power lines, tree rows, parked aircraft, ramp vehicles and signs; the three Fit, High look-down and Low chase buttons over the view went, and Graphics is no longer repeated in Traffic settings (Patrick, 4 Oct). Cockpit, Chase, Padlock, Tower and Free camera use a true perspective camera, so the runway's shape changes with range and glide angle; the other views stay orthographic (TR-90). Chase and Cockpit can look up, P padlocks the runway from either, and the free camera flies with W/A/S/D and R/F, starting in the tower cab from Tower (TR-92). Cockpit, Chase and Padlock draw no locator circle round the selected aircraft (TR-93).
- **Setup column** (the left column, Patrick, 4 Oct 11:05Z): one "Scenario:" drop-down (Patrick, 4 Oct: it replaced six buttons and the "Scenarios and notes" section) listing Busy circuit, Moose Jaw day, One aircraft, Full circuit, Joining traffic and Random. It shows the scenario loaded, with a line under it saying what that scenario is; choosing one replaces the aircraft, paused at 0:00, and keeps the routes, wind and settings. Busy circuit and Random also show a "New picture" button, which loads them again with new dice. **Busy circuit** is the opening picture (Patrick, 4 Oct 18:36Z and 18:47Z): ten aircraft, seven at random points of the overhead break (Pattern 1) at least 1 NM apart, one entering the overhead, a PFL from the area (120°, 6 NM, 8,000 ft, an estimate that joins at High Key in winds up to 25 kt) and a straight-in on ENT2 timed so it meets the overhead aircraft in its final turn. The timing is measured by flying the two alone (30 s at 260°/15 kt, found again for any other wind); the overhead aircraft then extends its downwind to turn in behind the straight-in (4.12 item 10). New picture gives a new one. Then Wind: a dial for the direction it blows from, shown in °M (9° East, Patrick's ruling, TR-65; the setting itself stays in °T), dragged or stepped with the arrow keys in 5° magnetic steps (Shift for 1°); in 3D it turns with the camera so it is oriented as the screen is, and stays round however the camera tilts; in 2D it is north up (Patrick, 4 Oct) and a strength bar (kt), with a line giving 29L's head and cross wind. The routes list follows. Saved setups ("Scenarios and notes") are off the screen; the tool always opens on the built-in Moose Jaw.
- **Layers menu**: the three presets (Clean Operational, Standard Training, Full Telemetry), one shown as chosen only while the layers match it; the screen opens on Clean Operational (Patrick, 4 Oct), which has labels, the wind-adjusted track, the photo, the 3D height drop lines and the glide circle on (only round the selected aircraft); caution rings start off (Patrick, 6 Oct 06:33Z; TR-93), and only the Overhead break and OHB Rejoin lines showing; then **More** with a tick for every layer: trails, labels, route points, leg distances, turn data and conflict bubbles (all 2D), caution rings, height drop lines (3D), wind-adjusted track, SMM calm reference, satellite photo and engine-out reach (the PFL glide circle, on by default). The PFL ground circle is switched from the Routes on the map list (Patrick, 4 Oct).
- **Routes list** ("Routes on the map"): one line per route with its colour, line style and name only (Patrick, 4 Oct: no second label), and a last line for the PFL circle, which is the Layers menu's "PFL ground circle" switch. Each route's ▸ opens its line settings (Patrick, 4 Oct): thickness (×0.5 to ×4), opacity (10 to 100%) and "Draw on the ground (3D)"; ×1 and 70% at first (Patrick, 4 Oct), kept for the visit. The Moose Jaw routes carry the names pilots use: Overhead break (PAT1), OHB Rejoin (ENT1) and SI Rejoin (ENT2) (Patrick, 4 Oct). Pressing a line shows or hides that route on the map; a hidden route's line is dimmed and says "Hidden", and the aircraft on it fly on (Patrick, 4 Oct). The old point table for a picked route went with the route editor.
- **Spawner** (Patrick, 4 Oct: type and route, then a button for each spot), in a "Spawn aircraft" box that opens and closes like Traffic settings, closed at first (Patrick, 4 Oct): Type and Route lists, then one button per spot of the chosen route: for the overhead break only Initial, In the break, Downwind and Perch (Patrick, 4 Oct; Final Entry, Break, Break exit and Perch), for the OHB Rejoin a "Miles back from the Merge" number box (0.5 to 9.2 NM, 0.1 NM steps, 9 at first; TR-66) with + Spawn; for the SI Rejoin "Miles back from the base turn" (0.5 to 7.1 NM along the rejoin line to the Entry Mid, where it turns base, 5 at first; Patrick, 4 Oct: counted like the OHB Rejoin's, from where it joins the pattern); **SI pattern**: Downwind and Base buttons and "Miles on final" (0.75 NM, the Window, to 4.1 NM, 2 at first) (Patrick, 4 Oct); one press adds an aircraft at that spot, and a line above the spots says what a press does ("Press a spot to add an aircraft there now", or a pair, or in N s). **PFL from area** is the Route list's last choice and brings up its radial, distance and altitude boxes, **On profile** (sets the altitude so the glide crosses High Key between 5,000 and 6,000 ft, aiming at 5,500, in the wind set now, by flying the sim's own PFL from trial heights) and + Spawn PFL, in place of the spots. Under **Advanced settings** (closed): the delay, Add a pair and the pair gap (20 s). Clear finished (max 200 aircraft), and **Spawn a conflict** (Patrick, 4 Oct 19:24Z; anywhere and soonest, 4 Oct): with an aircraft selected, it adds one on the spawner's route (the SI Rejoin when SI pattern is chosen) at any position along it (the start partway along a route, TR-66), now or after up to 2 minutes, picking the meeting that comes soonest: inside the caution distance (500 ft and 500 ft) of the selected aircraft at least 20 s ahead, appearing at least 1 NM from everyone within 1,000 ft of its height (estimates; a PFL gliding in overhead no longer blocks a start on final, Patrick, 4 Oct). Meeting someone else first is allowed (Patrick: "if that happens oh well"). It works this out by flying everyone ahead on a copy of the run with no deconfliction (`scenario-timing.js` `conflictSpawnPlan`); if nothing on that route meets it in the next 3 minutes, it says so and adds nothing. Then the deconfliction, or the person, manages it.
- **Aircraft list** (Patrick, 4 Oct): one boxed card each, the selected one highlighted and the only one showing its controls (the menu: Pattern, Landing behaviour, Manoeuvres; Breakout, Closed Pattern with its bank, High Key, PFL, and Go-around once on final). A card shows the callsign, its tag (the route in brackets while waiting) and height and airspeed; the type and route are in its tooltip; ✕ removes it. Every flying aircraft's card has a small video camera picture (🎥) beside the ✕: it switches to 3D if needed and puts the camera in that aircraft's front cockpit, looking ahead (the 3D bar shows Cockpit, with Follow set to it) (Patrick, 11 Oct 01:51Z, 02:11Z). A gliding aircraft's card is yellow. The green caution ring and the PFL glide circle show only round the selected aircraft; selecting does not move the camera. It stays on one screen (Patrick, 4 Oct 19:27Z): rows that would run past the bottom of the window wait behind a "More (n)" button, which opens the whole list and becomes "Show fewer"; the selected aircraft always shows.
- **Conflicts**: pair readouts with lateral and vertical separation in red (⚠ CONFLICT) or yellow (△ CAUTION).
- **Settings menu**: all numbers and toggles live in one closed "Traffic settings" panel (R22), at the foot of the Setup column (Patrick, 4 Oct; it was in the Aircraft column).

### 7.3 Defaults & First Look
Every setting starts filled in so the first look is clean and intuitive:
- Playback speed: 8×
- 2D or 3D: 3D, on High graphics (Patrick, 11 Oct 08:59Z; was Performance, 5 Oct 06:31Z, TR-76). Without WebGL it falls back to 2D with a note. 3D opens over the field: from north of the field looking south-south-east, low over the base, with the runways in the lower half and the circuit beyond (Patrick, 4 Oct 2026 10:17Z, from his screenshot). Fit still frames every route.
- Weather: a standard day (about 11°C at the field). The Weather drop-down under Scenario also offers a hot day (30°C), a cold day (−30°C) or a temperature you set. Heights stay as the altimeter reads them on the local setting, and the 3,500 ft pattern is still flown at 3,500 ft on the altimeter. The temperature changes two things. True height above the field is the indicated height above the field × (mean temperature ÷ standard), so a hot day flies higher and a cold day lower; the 3D view draws the aircraft there, and the labels keep the altimeter's height. True airspeed for a given IAS also changes, and with it turn size, climbs, zooms, glides and the glide ring. Pressure is taken as standard, since a correct altimeter setting cancels it, and humidity is left out (Patrick, 5 Oct 06:47Z, card "Temperature, full" 06:48Z; TR-77).
- Approach marks in 3D (Layers, both on): the window, a slice at ¾ NM fixed at a true 2,100 to 2,200 ft (SMM 4.7 para 12; TR-79), which aircraft flown on the altimeter pass high on a hot day and low on a cold one, with a faint outline of where the altimeter reads 2,100-2,200 ft (red above on a hot day, blue below on a cold one; TR-81), with the 3° intercept point on the straight-in, where the straight-in starts down (TR-80, TR-150); and the selected aircraft's pink aim line (velocity vector) out to where it meets the ground (Patrick, 5 Oct 07:17Z; TR-78).
- Wind: 260°M at 15 kt, held as 269°T (Patrick, 4 Oct 18:47Z, was calm; magnetic from 4 Oct, TR-65, was 260°T)
- Aircraft: the Busy circuit scenario (7.2), unless a saved setup is open
- Default aircraft type: CT-156 Harvard II (paint: `harvard`)
- Pattern: PAT_INNER (Runway 29L, left-hand, 3,500 ft MSL)
- Conflict limits: 200 ft lateral, 200 ft vertical (caution: 500 ft / 500 ft)

---

## 8. Files and the core they use (as built, V2.366)

### 8.1 The flying files
| File | What it does |
|---|---|
| `sim.js` | The roster, the step and its order, the commands, rewind, conflicts, the runway, taxi and ejection |
| `tick-aircraft.js` | One aircraft's step: follow its flown path or its route |
| `path-follower.js` | The one mover (2.1), joins and side-steps, gear and flap from the phase |
| `circuit.js` | The simulated pilot and the circuit built by flying it |
| `route.js` | Route geometry, lengths and positions; Pattern 1's wind-adjusted track; the wind perch marker; a new pattern |
| `pfl.js`, `pfl-geometry.js`, `pfl-joins.js`, `pfl-flight.js`, `nav-plans.js` | The PFL (4.5): the sim glue; the PFL table, the circle, the zoom and the chain; the joins and the choosers; the flight. And where an area PFL starts |
| `closed-pattern.js`, `high-key.js`, `breakout.js`, `evade.js` | The manoeuvres flown by the pilot |
| `deconflict.js`, `envelope.js` | The spacing (4.12) and its limits |
| `randomize.js`, `behaviour.js` | Random behaviour (4.13) and the behaviour tag (4.14) |
| `weather.js`, `airfield.js` | The day's temperature, true heights and the straight-in descent; Moose Jaw's numbers and the runway frame (along and across the centreline, lined up) |
| `taxi.js`, `ejection.js`, `scenario-timing.js`, `glue.js`, `dice.js` | Taxi-in, ejection, the straight-in's timing, settings into the setup, the seeded dice |

### 8.2 Core used
| From | What |
|---|---|
| `src/core/flight-math.js` | Turn radius, rate and bank from G or bank, `limitG`, the smooth roll (`easeRoll`, `easeValue`), `dampedClimbG` |
| `src/core/t6-performance.js` | Thrust and drag (`excessThrustPerWeight`, `dragPerWeight`), the glide (`glideRatio`, `glideDragPerWeight`), the stall (`stallLimitG`), roll and G onset limits, pitch attitude, `T6A_LIMITS` |
| `src/core/atmosphere.js` | Temperature and density with the day's deviation (`weather.js`) |
| `src/core/wind.js` | The wind triangle and the wind vector |
| `src/core/angles.js`, `units.js`, `geo.js` | Heading wraps and compass conversions, unit constants, distance along and off a leg |
| `src/core/closest-approach.js` | Closest approach and first entry, for the spacing and collisions |

---

## 9. History
The first Traffic engine was V6's model, moving each aircraft along its route at the speeds and heights set at the points. A physics engine (`flight-engine.js`, with kinematic and energy models, a per-aircraft model dropdown, and nav plans) was planned and partly built on 30 Sep to 4 Oct 2026, then removed on Patrick's card "Rebuild, then delete" (4 Oct 17:53Z) in favour of the simulated pilot and the one mover (sections 1, 1a and 2). The old task list and reuse map are in git history.

---

## 10. Testing Strategy

1. **Core Math Verification**: `src/core/` unit tests (~800 tests) remain read-only and passing green.
2. **Module tests**: `tests/unit/traffic/`, one file per flying file, as listed in `testing.md`.
3. **Refactor proof**: each step of the V2.350 refactor is proved by the same trace before and after (`REFACTOR_HANDOVER_V2.350.md` section 3); the trace driver lives in the project files, not the repo.
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
- **Source of the waypoints**: the route file `src/modules/traffic/data/moose-jaw.json` and `airfield.js`; [`docs/references/traffic-pattern-matrix.md`](../../references/traffic-pattern-matrix.md) is a readable copy.
- **Never stop or cap simulation prematurely**: station keeping is closed-loop (D370, D374).
- **Harvard II is CT-156** (D373). Default active runway: 29L (298° true), left-hand circuits (D378).
