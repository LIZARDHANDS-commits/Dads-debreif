# Sign-off checklist: Traffic Pattern Sim (Gate 1)

Anyone can run this in about twenty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/traffic (or `http://localhost:5173/#/traffic` locally)

The simulator models the 15 Wing Moose Jaw circuit (Runway 29L left-hand circuits) baselined on standard aerodynamics and the 15 Wing SMM / EFIG manuals.

---

## 1. First look & UI Layout

- [ ] On the home screen, the **Traffic Pattern Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main areas appear without overlap:
  - **Routes & Patterns** panel on the left (showing Pattern 1, Entry routes, and Splits).
  - **2D Airfield Map** in the center (centered on CYMJ Moose Jaw Runway 29L, 1,892 ft MSL field elevation).
  - **Aircraft List & Spawner** on the right (with callsign, type, route, altitude, and airspeed readouts).
  - **Playback Bar** along the bottom with Play/Pause, Timeline slider, Time display, Speed multiplier, Photo toggle, 3D toggle, and Wind controls (**Wind from: °T** and **Wind speed: kt**).

---

## 2. Standard Circuit Geometry & Flight Physics (15 Wing SMM)

- [ ] With default settings, press **Play**. Built-in aircraft spawn and fly their designated routes.
- [ ] **CT-156 Harvard II (Default Type):**
  - Flies initial overhead pattern at **3,500 ft MSL** (1,600 ft AGL) and **220 KIAS**.
  - The overhead break initiates past the threshold and rolls into a crisp **60° bank / 2.0 G turn** (D382), decelerating cleanly downwind.
  - At the perch point, the aircraft enters a continuous descending final turn at **45° bank** (D382, TR-02), slowing to **120 KIAS** in the turn and rolling out onto straight-in final descending to **2,700 ft MSL** before slowing to **100 KIAS** over the threshold.
  - Vertical descent profile is smooth and continuous ($\le 15^\circ$ descent slope), with no sudden vertical plunges.
- [ ] **Turn Arcs:** Turns follow true circular arcs (`trueArcs: true`, D46) without quadratic Bézier G spikes.
- [ ] **Route Splits & Joins:** When an aircraft takes a split (e.g. SPL2 or SPL3) or joins from an entry, the aircraft transitions smoothly onto the new route with zero instantaneous coordinate jumping (TR-05 resolved).

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

## 5. Aircraft Spawner & Profiles

- [ ] In the right-hand panel, select aircraft type from the dropdown (**CT-156 Harvard II**, **CT-155 Hawk**, **CT-114 Tutor**, **CF-188 Hornet**):
  - Each aircraft type flies its authentic SMM pattern speeds (e.g. Hawk/Hornet at higher pattern speeds, Tutor at SMM circuit speeds).
- [ ] Spawn a new aircraft on a route: it receives the next available callsign and waits for its start delay.
- [ ] **Conflict Detection:** When two aircraft fly within conflict boundaries (default 200 ft lateral / 200 ft vertical), amber caution or red conflict indications display accurately on the aircraft badges and map.

---

## 6. Satellite Photo & 3D Aerial View

- [ ] Click the **Satellite Photo** toggle button in the playback bar:
  - High-resolution Esri satellite imagery tiles load behind CYMJ airfield and runway vectors.
- [ ] Click the **3D View** toggle button:
  - Three.js WebGL 3D camera view initializes, showing circuit trajectories and altitude separation in full 3D space.
  - Orbit, pan, and zoom controls operate smoothly.
  - Switching back to **2D** returns to the crisp schematic vector map.

---

## 7. Settings Menu & Standards

- [ ] Open **Traffic settings** (gear icon / panel):
  - Lateral and vertical conflict limits (default 200 ft lateral, 200 ft vertical, 500 ft caution) are editable.
  - Type a new value into a box (e.g. 350 ft). Click **Reset to Standard Defaults**: the values reset to 200 ft without button focus-shift swallowing the click (TR-01 resolved).

---

## Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 1 (Traffic Pattern Sim) is complete and signed off for Gate 1.
