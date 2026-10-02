# Handoff — Traffic Sim Vector Guidance Migration

> Updated: 2026-10-02T03:50Z
> Last commit: `13444b5` — flight-engine.js + 62 tests + D412

## Current State

**Branch**: `main` at `13444b5`
**Working tree**: Clean (all agent mess reverted)
**Tests**: 3,131 pass, 0 fail, 1 skipped

### What's Built

| File | Lines | Tests | Status |
|---|---|---|---|
| `src/modules/traffic/flight-engine.js` | 732 | 62/62 pass | ✅ Committed |
| `tests/unit/traffic/flight-engine.test.js` | 716 | 62 pass | ✅ Committed |
| `tests/unit/traffic/flight-engine-challenge.test.js` | 431 | 11 pass | ✅ Committed |
| `tests/unit/traffic/flight-engine-stress.test.js` | 538 | 13 pass | ✅ Committed |

### What's NOT Built Yet

- `nav-plans.js` — pattern definitions with mode flags
- `sim.js` rewrite — hybrid fly(a) replacement
- Spawn UI — two-dropdown system
- CT-157 removal

## Architecture Decision: Hybrid Rails/Physics (D412)

**Ratified by Patrick 2026-10-02**. Replaces pure-vector approach.

### Two Modes

**RAILS** (stable legs): Position interpolated along `generateWindAdjustedTrack()` path. Bank/heading cosmetic from path curvature. Speed/altitude smoothly interpolated between waypoints. KIN model handles interpolation.

**PHYSICS** (dynamic maneuvers): `flight-engine.js` runs track intercept, KIN or NRG model, `rollToward()`, `windTriangle()`. Free Cartesian position.

**BLEND** (transition): 2-3 second linear interpolation from physics → rail. Like autopilot capturing localizer.

### Phase Mode Map

| Phase | Mode |
|---|---|
| Initial, downwind, final approach, entries | **Rails** |
| **Break** (60° bank, V² drag decel) | **Physics** |
| Inner downwind (break exit → Perch) | **Rails** |
| **Final turn** (Perch → rollout, cubic descent) | **Physics** |
| **Closed pattern climb** (50° bank to 3,500) | **Physics** |
| **Breakout** (climbing turn to rejoin) | **Physics** |
| **Go-around** (climb-out) | **Physics** |
| **PFL / engine failure** (NRG energy mgmt) | **Physics** |
| **Takeoff** (acceleration, climb) | **Physics** |
| Landing / touch-and-go | **Rails** |
| Straight-in | **Rails** |

### Snap-Back Criteria (Physics → Rails)

All four must be met simultaneously:
- ±5° heading of rail path tangent
- ±25 ft altitude of rail path altitude
- ±5° bank
- ±5 kt speed of rail target speed

### KIN/NRG Model Selection

- KIN is default for normal patterns (including rails)
- NRG auto-activates on PFL/engine-out
- Per-aircraft toggle on aircraft card: `Model: KIN ▼` / `Model: NRG ▼`
- Manual override always available

## Key Corrections Made

### Caps Fixed in flight-engine.js (all in commit 13444b5)

1. ✅ KIN descent cap removed (was -25 ft/s / 1,500 fpm — now physics-based)
2. ✅ KIN climb cap removed (was +35 ft/s / 2,100 fpm — now from `excessThrustPerWeight()`)
3. ✅ Fine-tracking bank cap made phase-dependent (±45° dynamic, ±30° stable)
4. ✅ Fake 110 KIAS glide floor removed (per-config targets: 125/120/100)
5. ✅ Lead turn cap raised from 0.45 to 0.65 × segLength
6. ✅ Turn rate floor raised from 10 to 50 ft/s (30 kt)
7. ✅ KIN accel/decel updated to +4.0/-2.7 kt/s (from T-6 `excessThrustPerWeight()`)
8. ✅ Inner downwind speed corrected from 120 to 140 KIAS (SMM)
9. ✅ `bankDegFromG` import fixed (from flight-math.js, not t6-performance.js)
10. ✅ Vfe guard moved to apply to all models, not just NRG
11. ✅ Lead turn angle wrapping to prevent NaN on 180° turns

### Aero Number Corrections Needed in Docs (NOT YET APPLIED)

| Item | Wrong | Correct | Source |
|---|---|---|---|
| Break exit / inner DW speed | 160 KIAS | **140 KIAS** | SMM 4.17 |
| Closed pattern rollout speed | 180 KIAS | **140 KIAS** | D400 |
| PFL High Key config | "Gear down" | **Clean, feathered, 125 KIAS** | SMM 13.5 |
| PFL Base Key altitude | 3,050 ft | **2,900 ft MSL / 120 KIAS** | D396 |
| PFL From Area defaults | 180°/5NM/5,000 | **090°/10NM/8,000** | Pattern matrix |
| Downwind speed label | 160-180 KIAS | **140-160 KIAS** (inner DW) | SMM |

## Document Hierarchy

**DO NOT merge these into one document. Each has a purpose.**

| Document | Location | Purpose | Update Needed |
|---|---|---|---|
| **SPEC_vector_migration_v2.md** | Artifact brain dir | THE spec — all aero numbers, patterns, spawn UI, behavioral rules, formulas, KIN/NRG dropdown, tactical maneuvers | §2: Update architecture from pure-vector to hybrid. Apply aero corrections above. Keep everything else. |
| **architecture_decisions.md** | Artifact brain dir | Architecture Q&A — why track intercept, why KIN/NRG | Add Q5: Why hybrid? Q6: Rails vs physics transitions |
| **refined_pattern_matrix.md** | Artifact brain dir | Waypoint coordinates (x,y,alt) | Add `mode` column (rails/physics) per waypoint |
| **master_implementation_plan.md** | Artifact brain dir | Execution plan — phases, ordering | Replace pure-vector phases with hybrid 5-step plan |
| **specs/SPEC-traffic.md** | Repo | Repo-facing spec | Add D412 hybrid note, correct aero numbers |

### Superseded (reference only, do not execute from)

- `SPEC_hybrid_migration.md` — attempted merge, lost detail, superseded by the 4 originals above
- `hybrid_implementation_plan.md` — first draft of hybrid plan, absorbed into master_implementation_plan.md

## V6 Constraint Audit (Key Findings)

Full audit in conversation history. Critical items:

- **10 `delete` blocks** wipe flight state at phase transitions
- **6 hardcoded altitude rates** (breakout 1,800, PFL 2,100/1,680/1,560/1,080, go-around 1,500/2,700 fpm)
- **5 zero-wind special branches** (Bézier, static Perch, TAS=IAS, wind-strip, useRwyBreak)
- **Bank angle snapping** at 6 locations (no rollToward())
- **Straight-in speed gate is dead code** (checks 'PAT_SI' which doesn't exist)
- **Left-turns-only hardcoded** (sim.js:921)
- **CT-157 fictional aircraft** first in SPAWN_TYPES

## T-6 Computed Performance Rates

From `excessThrustPerWeight()`:
- 140 KIAS, full throttle: **+4.0 kt/s** accel
- 220 KIAS, idle: **-2.7 kt/s** decel
- 180 KIAS, full throttle: **+2.7 kt/s**
- 180 KIAS, half throttle: **+0.4 kt/s** (near-level)

## Remaining Work (5 Steps)

### Step 1: Update the 4 original documents (NEXT)
Apply aero corrections, add hybrid architecture to §2, add mode column to matrix.

### Step 2: Task breakdown for Steps 3-4
Break nav-plans.js and sim.js rewrite into small implementable tasks.

### Step 3: Build nav-plans.js (~1 hr)
Pattern definitions from traffic-pattern-matrix.md with mode flags. ~30 unit tests.

### Step 4: Rewrite fly(a) in sim.js (~2 hrs)
Gut 710-line old fly(a). Replace with hybrid: rails interpolation + physics calls + blend. Keep 756-line sim harness.

### Step 5: Spawn UI + CT-157 removal (~1 hr)
Two-dropdown system. PFL From Area inputs.

### Step 6: Visual verification in browser
All patterns at zero wind and 20 kt crosswind.

## Decision Register

- **D406**: Vector Guidance Migration ratified (pure-vector, later refined)
- **D412**: Hybrid Rails/Physics Architecture (refines D406)
- **D407-D411**: Reserved for Turn Fight on next-module branch
- **R34**: Traffic Sim 3D Vector Aerodynamics & Flight Guidance Engine

## Rules / Warnings for Next Session

1. **No agents for doc edits** — do those manually
2. **Agents only for NEW code files** (nav-plans.js) where they can't break existing things
3. **One task per agent** — never a laundry list
4. **Never touch src/core/** — import only
5. **Pilot domain tolerances** apply to all tests: ±10 kt, ±100 ft, ±5°
6. **Don't hack physics to match legacy tests** — mark failing legacy tests with `// TODO: post-swarm tolerance update`
7. **The 4 original docs are the source of truth** — not SPEC_hybrid_migration.md
