# Flight math core

Shared flight math in `src/core/`: units, time and zones, geometry, wind triangle, standards, and the T-6A performance model (thrust, drag, turn, zoom, glide, split S, speed limits).

- Spec: `specs/SPEC-core.md`. Tasks: `tasks/flight-math/`. Tests: `tests/unit/core/`, `tests/golden/`.
- Done, through #232. No paused work.

## Left (optional)

- Verification suggested the shared GPS gap rule (`GAP_S` in `src/flight-data/clean.js` and `flight.js`, now "more than 5 s") become "5 s or more". One-line change; the Debrief already treats 5 s holes as gaps on its own since #241.

## Notes

- `maxKiasT6A` is the NFM airspeed-limit line for what pilots see; `modelMaxIasT6A` is the same limit on the model's IAS, used as a guard (never over Mach 0.67).
- Stall 86 kt (Patrick, D158). Shaker G is stall + 7 kt, capped at 7 G.
- The model is fitted to the NFM charts: drag from the max-glide chart (125 KIAS), thrust from the sustained-turn chart. Refit with `tests/golden/checks/t6a-fit.mjs`.
- `tests/golden/checks/mutate.py` exists but is not run (no mutation testing under the current rules).
- Browser vs Node time-zone checks: an Edmonton mismatch from 1 Nov 2026 on is time-zone data, not a bug.
