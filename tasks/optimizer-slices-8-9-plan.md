# Implementation Plan: In-Browser Teaching Score Table & Nelder-Mead Polish Optimizer (Slices 8 & 9)

## Overview & Architecture

This plan delivers **Slice 8** (13-Term Score Table & Doctrine Price Tag Engine) and **Slice 9** (In-Browser Nelder-Mead Simplex "Polish" Optimizer) for Pat's Formation Simulator in `src/modules/turn-sim/`.

Following the validated CasADi continuous optimal control benchmark ($50\%\text{--}80\%$ time reductions, $3.03\text{ s/G}$ and $0.194\text{ s/deg}$ shadow prices), this brings quantitative doctrine evaluation directly into the web application:
1. **Interactive Teaching (Slice 8):** Evaluates any flight plan in seconds-equivalent across 13 doctrinal terms and renders the trade breakdown on the pilot card (e.g. *By-the-Book: 26 s | Unrestricted: 12 s | Traded: 14 s*) without altering flight paths.
2. **Deterministic Simplex Polish (Slice 9):** Adds a user-facing `Polish` switch running a lightweight 60-line Nelder-Mead simplex search over 25 control knots ($\le 300$ flights, $< 100\text{ ms}$) seeded from the winning technique track.

```
                           PRESS (Formation button, Rates, Polish switch)
                                           |
                                           v
   +----------------------------------------------------------------------------------+
   |  CHOOSER (src/modules/turn-sim/live/chooser.js)                                  |
   |  Races standard technique planners; when Polish is ON, races Polish candidate     |
   +----------------------------------------------------------------------------------+
        |                                                                  |
        v                                                                  v
   Technique Planner (TRJ, SARJ, FW, Roll)                      OPTIMISER (Slice 9)
        |                                                                  |
        |---> Winner's Track (Seed) -------------------------------------->|
        |                                                                  v
        |                                               +------------------------------------+
        |                                               | 1. controls.js: 25 Knots -> Curves |
        |                                               |    Bank(t), G(t), Pwr(t), Boards   |
        |                                               +------------------------------------+
        |                                                                  |
        |                                                                  v
        |                                               +------------------------------------+
        |                                               | 2. fly.js: Candidate Simulator     |
        |                                               |    Honest speed via slow-down/power|
        |                                               +------------------------------------+
        |                                                                  |
        |                                                                  v
        |                                               +------------------------------------+
        |                                               | 3. score.js (Slice 8):             |
        |                                               |    13-term cost table (seconds)    |
        |                                               +------------------------------------+
        |                                                                  |
        |                                               +<--- Simplex Search (search.js) ----+
        |                                               |     Reflect, Expand, Contract      |
        |                                               |     Stop: < 0.1s gain / 300 flts   |
        |                                               v
        |                                       Best Track + Score Breakdown
        |                                               |
        +-----------------------------------------------+
                                |
                                v
                      PILOT CARD & REPLAY
                      • Flight Replay: Exact point-mass step & envelope gate
                      • Slice 8 Card: Traded seconds (By-the-Book vs Unrestricted)
                      • Slice 9 Card: Polish savings ("Optimised 41s vs 47s; Traded 6s")
```

---

## Architectural Decisions

1. **Zero Client Libraries (`AGENTS.md` Compliant):**
   - No Wasm IPOPT, NLopt, or external math packages.
   - The Nelder-Mead simplex is a self-contained ~60-line textbook algorithm using plain JavaScript arithmetic.

2. **Seconds-Equivalent Objective Function (Slice 8):**
   - Every score term is expressed in **seconds-equivalent**.
   - Energy dumped is converted to the seconds full power needs to win it back at that speed: $\Delta t = \Delta h / [V \cdot (T - D) / W]$ using core `excessThrustPerWeight`.
   - Control movement is scaled using integrated square acceleration: $\int (\dot{p}^2 + \dot{n}^2 + \dot{\tau}^2)\,dt$.
   - Hard constraints (500 ft bubble, 3/9 line) act as hard rejections for standard plans, and steep exterior penalty barriers ($w = 10,000$) during simplex search.

3. **25 Control Knots & Dual Seeding (Slice 9):**
   - $K = 8$ knots for Bank $\phi$, $8$ knots for Load factor $n$, $8$ knots for Throttle $\tau$, plus $1$ overall duration scale $T$.
   - Speedbrake parameterizes as a single switch-on instant.
   - Knots are interpolated with the existing `smoother` function in `flight.js`.
   - Seeding samples the winning technique track at knot times. If second-best technique is within `TIE_SEC`, both are polished and the better outcome is kept.

4. **Honest Speed & Settle Isolation:**
   - Candidate simulation (`fly.js`) integrates speed through `slow-down.js` and `power.js`, **never calling `setKias`**.
   - The optimizer plans only to the arrival window (100–250 ft, 10–20 KIAS overtake); final slot holding is handed to the tracker's closed-loop settle phase (`hand-over.js onClosure`).

5. **Rates Persona Clamping:**
   - Knots are clamped to Rates profile bounds:
     - **Student:** Bank $\le 60^\circ$, $G \le 3$, roll share $0.5$.
     - **Instructor:** $G \le 4$, roll share $0.75$.
     - **AI:** Full airframe envelope (G rule ceiling 7 G, full roll onset).

---

## Phase Breakdown

### Phase 1: Slice 8 — 13-Term Score Table & Doctrine Price Tag Engine
- **Task 1: Core 13-Term Score Engine (`optimise/score.js`, `modes.js`)**
- **Task 2: Score Integration & Pilot Card Readout (`transitions-panel.js`, `layout.js`)**
- **Checkpoint 1: Slice 8 Verified (Unit tests green, zero flight path modification, card displays accurate price tag)**

### Phase 2: Slice 9 — In-Browser Nelder-Mead "Polish" Optimizer
- **Task 3: Knot Parameterization & Honest Speed Flight Step (`optimise/controls.js`, `optimise/fly.js`)**
- **Task 4: Nelder-Mead Simplex Search & Planner Bridge (`optimise/search.js`, `optimise/planner.js`)**
- **Task 5: Chooser Race & UI "Polish" Switch (`chooser.js`, `transitions-panel.js`)**
- **Checkpoint 2: Slice 9 Verified (Simplex converges $\le 300$ flights, $< 100\text{ ms}$, yields positive seconds savings without violating bubble or lane)**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :---: | :--- |
| **Simplex stalls on constraint boundary (bubble/lane)** | High | Use steep exterior quadratic penalty barriers during search; evaluate hard binary rejection only during final 0.05 s confirmation. |
| **Search exceeds browser frame budget (> 100 ms)** | High | Evaluate candidate flights at coarse $dt = 0.2\text{ s}$ during simplex exploration; limit search to $\le 300$ candidate flights. |
| **Inadvertent deviation from SMM doctrine** | Critical | Keep `Polish` switch OFF by default; standard formation changes continue flying doctrinal tracker phases until explicitly polished. |
| **Discontinuous speed or power commands** | Medium | Smooth knot interpolation using existing cubic hermite / smootherstep in `flight.js`. |
