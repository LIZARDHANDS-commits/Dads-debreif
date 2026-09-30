# Plan: flight math (`core`)

Spec: [`specs/SPEC-core.md`](../../specs/SPEC-core.md). Owner: the "Flight math core" thread. Owns `src/core/`, `tests/unit/core/`, `tests/golden/` (except `v6-baseline.json`, recorded by `tools/record_v6_baseline.js`) and `specs/SPEC-core.md`.

## PR 1: units, angles, geo, time (flight data waits on this)

- [x] Harness that runs V6's own functions (`tests/golden/v6-source.js`)
- [x] `units.js` + golden test
- [x] `angles.js` + golden test + heading-convention unit test
- [x] `geo.js` + golden test + known-distance unit test
- [x] `time.js` + golden test + R10 clock-change unit test
- [ ] Patrick approves SPEC-core.md

## PR 2: flight-math.js

- [ ] Turn radius/rate and bank from G (Turn Sim 786–789, Turn Fight `M`, Traffic 147–148)
- [ ] ISA density ratio, IAS estimate, EM chart point (4154–4158), still halved (Q18)
- [ ] Closure rate (3119) and estimated G (2462), taking tracks as arguments
- [ ] Both tennis-ball solvers (3140, 3970) pinned; report where they disagree (#19)

## PR 3: standards.js

- [ ] Debrief classifier (3051, 3088, 3110) and Turn Sim classifier (1881); V6 default preset (R18)

## Waiting on Dad

Q18 items, Q24 (compass start heading), Q25 (Traffic radius), Q26 (recorded bank, blank pitch). None blocks a port.
