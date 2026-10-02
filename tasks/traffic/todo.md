# Traffic Vector Integration — Task Checklist

> **Plan:** [`plan.md`](plan.md)  
> **Branch:** `wip/test-audit-and-cleanup`  
> **Commit strategy:** 4 commits, 1 PR to main

---

## Task 1: Cherry-Pick Flight Math Modules [S]

**Description:** Bring `flight-engine.js` and `nav-plans.js` from `wip/sim-3-worktree` onto this branch. These are standalone modules with zero `sim.js` coupling.

**Acceptance criteria:**
- [ ] `src/modules/traffic/flight-engine.js` exists (732 lines)
- [ ] `src/modules/traffic/nav-plans.js` exists (370 lines)
- [ ] `tests/unit/traffic/flight-engine.test.js` exists and passes (62 tests)
- [ ] `tests/unit/traffic/nav-plans.test.js` exists and passes (39 tests)
- [ ] `calcBreakDecelSpeed(u) = 220 × e^(-0.452u)` is present and tested

**Verification:**
- [ ] `npm test` — full suite green
- [ ] `npm run typecheck` — clean

**Dependencies:** None (test cleanup already done on this branch)

**Files touched:**
- `src/modules/traffic/flight-engine.js` (new, cherry-picked)
- `src/modules/traffic/nav-plans.js` (new, cherry-picked)
- `tests/unit/traffic/flight-engine.test.js` (new, cherry-picked)
- `tests/unit/traffic/nav-plans.test.js` (new, cherry-picked)

**Git:** `git cherry-pick 13444b5 3fc3cee`

---

## Task 2: Update SPEC with NEVER Rules [XS]

**Description:** Add the hard invariant to `specs/SPEC-traffic.md` so future agents cannot introduce shadow variables.

**Acceptance criteria:**
- [ ] SPEC contains the three NEVER rules:
  1. Exactly ONE mode owns coordinates per step (no dual-write)
  2. No shadow coordinates (customX, customY, etc.)
  3. BLENDING is a third mode, not a hybrid
- [ ] BLENDING mode documented: 1.0s cubic smoothstep, interruptible by commands
- [ ] RAIL→PHYSICS: instant. PHYSICS→BLENDING→RAIL: 1.0s.
- [ ] Break decel function `V(u) = 220e^(-0.452u)` explicitly preserved

**Verification:**
- [ ] Spec is self-consistent with existing D406/R34

**Dependencies:** None

**Files touched:**
- `specs/SPEC-traffic.md`

---

## Task 3: Write `tickAircraft()` State Machine [M]

**Description:** Write the three-mode state machine from scratch in `sim.js`. Replace the relevant parts of `fly(a)` without breaking existing rail-only behavior. Keep existing conflict detection, spawning, despawning, rewind/snapshot, and trail logic untouched.

**Acceptance criteria:**
- [ ] `tickAircraft(a, dt, wind)` function exists with RAIL/PHYSICS/BLENDING modes
- [ ] RAIL mode: `distFt` advances, `posOnRoute()` derives coordinates
- [ ] PHYSICS mode: `stepAircraft()` from flight-engine.js owns coordinates
- [ ] BLENDING mode: 1.0s cubic smoothstep lerp, single owner of coordinates
- [ ] Zero shadow variables (`customX`, `customY`, `customAlt`, `customHeading`, `blendFrom` all absent)
- [ ] `shouldEnterPhysics(a)` checks: break waypoint, final turn entry, command issued
- [ ] Command during BLENDING cancels blend, enters PHYSICS
- [ ] `closestDistFt()` used to compute blend target
- [ ] Existing behavior preserved: spawning, despawning, conflicts, trails, reset, rewind

**Verification:**
- [ ] `npm test` — full suite green (existing tests pass)
- [ ] `npm run typecheck` — clean
- [ ] Manual: spawn aircraft, watch full pattern (break → downwind → final → landing)
- [ ] Manual: trigger breakout mid-pattern, verify climb and departure
- [ ] Manual: trigger go-around on final, verify climb and re-enter

**Dependencies:** Task 1 (flight-engine.js must exist)

**Files touched:**
- `src/modules/traffic/sim.js` (~200 lines added/modified)

---

## Task 4: Write Behavioral Invariant Tests [S]

**Description:** Add the 5 behavioral flight invariant tests that catch real bugs (freeze, infinite loop, NaN, dead controls, mode violation).

**Acceptance criteria:**
- [ ] `tests/unit/traffic/flight-invariants.test.js` exists with 5 tests:
  1. **Continuous Motion**: displacement > 0 when v > 0, every 20 steps for 200+ steps
  2. **Circuit Progression**: break → downwind → final → landing within 120-300s
  3. **Command Responsiveness**: breakout climbs to ~4500 ft; go-around climbs to ~2500 ft
  4. **Mathematical Sanity**: no NaN/Infinity in x, y, alt, heading, speed for 6000 steps
  5. **Mode Invariant**: exactly one of RAIL/PHYSICS/BLENDING at every step
- [ ] All 5 tests pass
- [ ] Tests use pilot-domain tolerances, not exact values
- [ ] Operator warning comment at top of file

**Verification:**
- [ ] `npm test` — full suite green
- [ ] Each invariant test verified against a known-good scenario

**Dependencies:** Task 3 (state machine must be wired)

**Files touched:**
- `tests/unit/traffic/flight-invariants.test.js` (new)

---

## Checkpoint: After Tasks 1-4
- [ ] All tests pass (`npm test`)
- [ ] Application builds (`npm run build`)
- [ ] Manual verification: aircraft flies full pattern with physics turns
- [ ] Manual verification: pilot commands work (breakout, go-around)
- [ ] No `customX`, `customY`, `customAlt`, `customHeading`, or `blendFrom` anywhere in codebase
- [ ] Review with Patrick before merging PR to main

---

## Task 5: Commit, Push, PR [XS]

**Description:** Finalize commits and open PR to main.

**Acceptance criteria:**
- [ ] 4 clean commits on branch:
  1. "Cherry-pick flight-engine.js and nav-plans.js from 978b7f1"
  2. "Test audit: delete 31 saboteur tests, convert 32 to tolerances, add operator warnings"
  3. "Wire tickAircraft() three-mode state machine (RAIL/PHYSICS/BLENDING)"
  4. "Add 5 behavioral flight invariant tests"
- [ ] PR description lists: skills applied, design decisions, test audit summary
- [ ] CI green

**Verification:**
- [ ] `npm test` — green
- [ ] `npm run build` — green
- [ ] `npm run typecheck` — green

**Dependencies:** Tasks 1-4

**Files touched:** None (git operations only)
