# Sign-off checklist: Turn Sim (Formation Geometry Simulation) (Gate 3)

Anyone can run this in about twenty-five minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-sim (or `http://localhost:5173/#/turn-sim` locally)

The simulator models 2-ship and 4-ship tactical formation turns baselined on standard aerodynamics and 15 Wing Moose Jaw SMM Chapter 16 procedures.

---

## 1. First look & UI Layout

- [ ] On the home screen, the **Turn Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main columns show without overlap at 1280 × 800:
  - **Setup panel** on the left (Formation, Spacing, Start heading, Turn type, Direction, Speed, G, Timing).
  - **Stage canvas** in the middle with toolbar above it (Play, Pause, Step, Reset, Speed multiplier, sim time, Fit, Layers).
  - **Formation results panel** on the right (wingman spacing status badges, minimum separation, turn kinematics: radius, rate, bank).
- [ ] Default values load on initial open: Formation `4312`, Spacing `6000 ft`, Start heading `360°`, Turn `Delayed 90`, Speed `220 KTAS`, `G: 3.0`.
- [ ] No controls overlap, no scrollbars obscure the flight canvas, and the whole formation fits cleanly on screen.

---

## 2. Playback, Step & Interactive Manipulation

- [ ] **Play / Pause:** Pressing Play starts simulation; aircraft turn and progress along their tactical flight paths. Pause halts aircraft instantaneously.
- [ ] **Step:** With simulation paused, pressing Step advances simulation clock by exactly one discrete physics step (0.05 s) per click.
- [ ] **Reset:** Clicking Reset restores simulation time to `t = 0.0 s` and returns all aircraft to their starting formation slots.
- [ ] **Speed Multipliers:** Toggle 0.5×, 1×, 2×, 4×. Aircraft kinematics scale smoothly at each rate.
- [ ] **Pre-Play Drag Interaction (D334):** Before pressing Play, click and drag a wingman (e.g. #2 or #4) on the canvas.
  - The aircraft moves to the new position.
  - Initial position error is updated in the readout.
  - Lead (#1) remains anchored.

---

## 3. Tactical Formation Geometries

- [ ] **4312 (Standard Tactical 4-Ship):**
  - Verify slot layout: #4, #3, #1, #2 in Line Abreast.
  - Spacing defaults to 6,000 ft lateral interval.
- [ ] **2134 (Inverted Tactical 4-Ship):**
  - Switching to `2134` mirrors formation layout cleanly across the flight axis.
- [ ] **Two-Ship Formation:**
  - Select `Two-Ship`: Displays Lead (#1) and Wingman (#2) abreast.
  - Kinematics and spacing badges reflect 2-ship standards.
- [ ] **Offset Box Formation (SMM Ch 16):**
  - Select `Offset Box`: Front element (#1 & #2) with trailing element (#3 & #4).
  - Trail spacing defaults to 7,000 ft aft (6,000–8,000 ft standard band per D155 / SMM 16.41).

---

## 4. Tactical Maneuvers & Aerodynamic Standards

- [ ] **Delayed 90° Turn:**
  - Aircraft outside the turn initiates; inside aircraft delay turn according to timing law.
  - Aircraft roll out in tactical Line Abreast on the new heading.
- [ ] **Delayed 45° Turn (D151):**
  - Aircraft cross paths without reaching 90°; rolls out smoothly in Line Abreast with sides swapped.
- [ ] **Hook Turn (180° Formation Turn, D84, Task 3.1):**
  - Select `Hook Turn`.
  - Verify that the formation executes a **true 180° formation reversal** per SMM Chapter 16 and Dad, rolling out on reciprocal heading (180° heading change), completely resolving the legacy V6 90° bug.
- [ ] **Shackle Formation Turn (D85):**
  - Aircraft turn toward each other, cross flight tracks forming an X, and swap sides, rolling out on original heading.
- [ ] **Cross Turn (D150, D170):**
  - Lead and wingman turn toward each other: 2 G to 90°, then solved G to roll out abreast.

---

## 5. Timing Laws & Spacing Solver

- [ ] **Timing Law Dropdown:**
  - **Time Delay:** Aircraft turn after fixed seconds (`Base delay`).
  - **Clock Cue:** Wingman turns when designated reference aircraft crosses target clock cue (e.g. 4:30 or 7:30).
  - **Auto Timing (D44, D380):** Closed-loop timing solver calculates exact delay ($\text{spacing} / \text{speed} \times \cot(\theta/2)$) so wingmen roll out abreast.
- [ ] **Spacing Solver Scoring (D385):**
  - Solver evaluates and scores station-keeping trials at maneuver rollout completion, not arbitrary clock durations.

---

## 6. Offset Box Rear Element & Vertical De-Confliction

- [ ] Select `Offset Box` and `Delayed 90` Right:
  - Trailing element (#3 & #4) delay turn to maintain box geometry.
  - When flight tracks cross within 1,000 ft lateral separation in the flat simulation, a salient caution flags:
    `"Crossing: 300 ft vertical needed"` (D207 / SMM para 111).

---

## 7. Settings Menu & Standards

- [ ] Open **Turn Sim settings**:
  - Contains **Start geometry**, **Display**, and **More setup** sections.
  - Relabeled reset button reads **Reset to Standard Defaults** (D384).
- [ ] Click **Reset to Standard Defaults**:
  - Restores certified 15 Wing SMM standards (3.0 G turn rate, 7,000 ft trail spacing, standard timing delays) without losing page responsiveness.

---

## 8. Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 3 (Turn Sim Formation Simulation) is complete and signed off for Gate 3.
