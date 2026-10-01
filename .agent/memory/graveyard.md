# Graveyard

Approaches tried and dropped, so nobody tries them again. One line each: date, module, what was tried, why it was dropped.

- 30 Sep 2026, Traffic: raising G in the break and final turn to fix the turn shape. Worse with V6's rounding; waits for the task 12 arcs.
- 30 Sep 2026, Debrief: calibrating recorded iPad pitch and G on the ramp (FF15). Recorded pitch doesn't follow the climb angle and G reads 0.94 on the ramp; might work only with a fixed mount.
- 30 Sep 2026, all: mutation testing, fuzzing and exact memory counts. Dropped by Patrick's Streamlined build rules as too costly.
- 30 Sep 2026, all: Golden test bit-exact IEEE float comparison and SHA-256 output hashes against legacy V6 prototype. Dropped because V6 has known aero bugs and IEEE 754 precision fighting broke tests over nanometer differences.
- 30 Sep 2026, Traffic: Quadratic Bezier curve rounding for turns. Dropped because peak curvature exceeds average by 1.41x, producing 3.28 G and 4.19 G spikes that exceed T-6A available G at 150 kt. Replaced with D46 constant-radius circular arcs.
- 01 Oct 2026, Traffic: Dual Spawner controls ("Start at point" numeric input + "Preset point" dropdown). Dropped because having two parallel ways to select route start points caused confusion; standardized on working "Start at point" with dynamic live waypoint caption.
- 01 Oct 2026, Traffic: SPL1–SPL4 polyline routes with dice rolls (splitOdds: 0.5) for diversions. Dropped in favor of authentic closed-loop vector maneuvers (Breakout, PFL, Go-Around, Closed Pattern).
