# Sign-off checklist: Traffic Pattern Sim (Gate 1)

Anyone can run this in about twenty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/traffic (or `http://localhost:5173/#/traffic` locally)

The simulator models the 15 Wing Moose Jaw circuit (Runway 29L left-hand circuits) baselined on standard aerodynamics and the 15 Wing SMM / EFIG manuals.

---

## 1. First look & UI Layout

- [ ] On the home screen, the **Traffic Pattern Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main areas appear without overlap:
  - **Routes & Patterns** panel on the left (showing authentic routes: Pattern 1, Entry routes ENT1–ENT4; legacy polyline splits SPL1–SPL4 are deactivated per D399).
  - **2D Airfield Map** in the center (centered on CYMJ Moose Jaw Runway 29L, 1,892 ft MSL field elevation).
  - **Aircraft List & Spawner** on the right (with callsign, type, route, altitude, airspeed readouts, and tactical maneuver buttons).
  - **Playback Bar** along the bottom with Play/Pause, Timeline slider, Time display, Speed multiplier, Photo toggle, 3D toggle, and Wind controls (**Wind from: °T** and **Wind speed: kt**).

---

## 2. Standard Circuit Geometry & Flight Physics (15 Wing SMM)

- [ ] With default settings, press **Play**. Built-in aircraft spawn and fly their designated routes.
- [ ] **CT-156 Harvard II (Default Type):**
  - Flies initial overhead pattern at **3,500 ft MSL** (1,600 ft AGL) and **220 KIAS**.
  - The overhead break initiates past the threshold and rolls into a crisp **60° bank / 2.0 G level turn** (D382, D389), bleeding airspeed cleanly downwind.
  - At the wind-adjusted perch point, the aircraft enters a continuous descending final turn at **nominal 35° bank** (30°–45° bounds, D391), slowing to **120 KIAS** in the turn and rolling out onto straight-in final descending to **2,700 ft MSL** before slowing to **100 KIAS** over the threshold.
  - Vertical descent profile is smooth and continuous ($\le 15^\circ$ descent slope), with no sudden vertical plunges.
- [ ] **Calm-Wind Rounded Arcs (D400):** With wind at `0 kt`, verify that the overhead break and final turn generate smooth, rounded 180° circular arcs with zero polygonal corners or outer box artifacts.
- [ ] **Turn Arcs:** Turns follow true circular arcs (`trueArcs: true`, D46) without quadratic Bézier G spikes.

---

## 3. Wind Triangle & Interactive Wind Controls

- [ ] In the bottom playback bar, locate the **Wind from: °T** and **Wind speed: kt** inputs.
- [ ] Set **Wind speed: kt** to `25` and **Wind from: °T** to `210` (crosswind from the left on RWY 29L).
- [ ] Aircraft in flight dynamically crab into the wind:
  - Aircraft headings visually orient into the wind to maintain ground track along the circuit legs.
  - Readouts show differing **IAS** vs. **Ground Speed (GS)** and active **Crab Angle**.
  - Headwind increases time/reduces ground speed along straight legs; tailwind increases ground speed.
- [ ] Return wind to `0 kt`: aircraft tracks and headings re-align with ground path, and ground speed equals airspeed.

---

## 4. Playback, Scrubbing & Timeline Rewind

- [ ] **Play / Pause:** Pressing Play starts simulation clock; Pause halts aircraft instantaneously.
- [ ] **Speed Multipliers:** Toggle 0.5×, 1×, 2×, 4×, 8×. Simulation advances smoothly at each rate.
- [ ] **Timeline Scrubbing & Rewind:** Drag the timeline scrubber backwards and forwards rapidly while aircraft are flying:
  - Aircraft smoothly update positions along their routes.
  - Callsign assignments remain consistent and distinct without index corruption or crashes (+422 lines of rewind guards).
- [ ] **Reset:** Clicking Reset restores simulation time to T+0.0 s with opening aircraft queue.

---

## 5. Aircraft Spawner & Closed Pattern Preset

- [ ] In the right-hand panel, select aircraft type from the dropdown (**CT-156 Harvard II**, **CT-155 Hawk**, **CT-114 Tutor**, **CF-188 Hornet**):
  - Each aircraft type flies its authentic SMM pattern speeds (e.g. Hawk/Hornet at higher pattern speeds, Tutor at SMM circuit speeds).
- [ ] **Spawner Clean-Up (D400):** Verify single working **Start at point** control (redundant preset dropdown removed). Select **Point 2**:
  - Live caption displays: `↳ Departure End (Closed Pattern): 2,400 ft, 140 kt`.
- [ ] Click **+ Spawn**: Aircraft spawns past departure end in `closed_pattern` phase.
- [ ] Press **Play**:
  - Aircraft executes authentic 180° climbing turn (50° bank / 2,100 fpm climb) to 3,500 ft MSL at 140 KIAS.
  - Rolls out wings-level on downwind heading (**118° true**) pointing directly towards the Perch.
  - Smoothly captures the Perch without looping or circling, transitioning into the descending final turn.
- [ ] **Conflict Detection:** When two aircraft fly within conflict boundaries (default 200 ft lateral / 200 ft vertical), amber caution or red conflict indications display accurately on the aircraft badges and map.

---

## 6. Tactical In-Flight Pilot Maneuvers

- [ ] **Breakout Command (D395):**
  - Click **Breakout** on an aircraft card in the circuit.
  - Aircraft immediately climbs to 3,500 ft MSL, accelerates to 180 kt, vectors towards the breakout point 2 NM south of pattern center, continues south, and turns to intercept the rejoin line.
- [ ] **High Key / PFL Command (D400):**
  - Click **High Key** on an aircraft card.
  - Aircraft vectors to overfly Runway 29L threshold at **5,000 ft MSL** heading along the runway axis (**298° true**).
  - From High Key, aircraft enters a continuous 360° circular gliding arc at 120 KIAS / 30° bank passing Low Key (3,900 ft MSL) down to threshold.
- [ ] **Go-Around Command (D394):**
  - Click **Go-around** after an aircraft passes the Window and slows to 100 KIAS on final approach.
  - Aircraft initiates immediate runway-axis climb-out to 3,500 ft MSL / 220 KIAS and rejoins the downwind pattern cleanly.

---

## 7. Satellite Photo & 3D Aerial View

- [ ] Click the **Satellite Photo** toggle button in the playback bar:
  - High-resolution Esri satellite imagery tiles load behind CYMJ airfield and runway vectors.
- [ ] Click the **3D View** toggle button:
  - Three.js WebGL 3D camera view initializes, showing circuit trajectories and altitude separation in full 3D space.
  - Orbit, pan, and zoom controls operate smoothly.
  - Switching back to **2D** returns to the crisp schematic vector map.

---

## 8. Settings Menu & Standards

- [ ] Open **Traffic settings** (gear icon / panel):
  - Lateral and vertical conflict limits (default 200 ft lateral, 200 ft vertical, 500 ft caution) are editable.
  - Type a new value into a box (e.g. 350 ft). Click **Reset to Standard Defaults**: the values reset to 200 ft without button focus-shift swallowing the click (TR-01 resolved).

---

## 9. Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 1 (Traffic Pattern Sim) is complete and signed off for Gate 1.
