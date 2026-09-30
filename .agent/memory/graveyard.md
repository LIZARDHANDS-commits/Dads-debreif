# Graveyard

Approaches tried and dropped, so nobody tries them again. One line each: date, module, what was tried, why it was dropped.

- 30 Sep 2026, Traffic: raising G in the break and final turn to fix the turn shape. Worse with V6's rounding; waits for the task 12 arcs.
- 30 Sep 2026, Debrief: calibrating recorded iPad pitch and G on the ramp (FF15). Recorded pitch doesn't follow the climb angle and G reads 0.94 on the ramp; might work only with a fixed mount.
- 30 Sep 2026, all: mutation testing, fuzzing and exact memory counts. Dropped by Patrick's Streamlined build rules as too costly.
- 30 Sep 2026, all: Golden test bit-exact IEEE float comparison and SHA-256 output hashes against legacy V6 prototype. Dropped because V6 has known aero bugs and IEEE 754 precision fighting broke tests over nanometer differences.
