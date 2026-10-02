# Traffic Pattern Sim: Vector Guidance Integration Plan (v3)

> **Status:** Tests cleaned up on `wip/test-audit-and-cleanup`. Ready for cherry-pick and integration.  
> **Authoritative Spec:** [`specs/SPEC-traffic.md`](../../specs/SPEC-traffic.md) (D406, R34)  
> **Pattern Matrix:** [`docs/traffic-pattern-matrix.md`](../../docs/traffic-pattern-matrix.md)  
> **Task Checklist:** [`todo.md`](todo.md)  
> **Branch:** `wip/test-audit-and-cleanup` (off main @ `65e4590`)

---

## 1. Executive Summary

Integrate the proven standalone flight math (`flight-engine.js`, `nav-plans.js`) into `sim.js` using a clean three-mode state machine: RAIL → PHYSICS → BLENDING → RAIL. Written from scratch, not patched from the failed SIM-2/SIM-3 attempts.

**Hard invariant (NEVER rules):**
1. At any simulation step, exactly ONE of {RAIL, PHYSICS, BLENDING} owns `a.x`, `a.y`, `a.alt`, `a.heading`.
2. There are no shadow coordinates (`customX`, `customY`, `customAlt`, etc.). Ever.
3. When physics completes a maneuver, coordinates blend to the nearest rail point over 1.0s via cubic smoothstep. There is no "dual write" period.
4. A pilot command during BLENDING cancels the blend and enters PHYSICS immediately.

---

## 2. Architecture Decisions (from grill-me interview, 02 Oct 2026)

| Decision | Choice | Rationale |
|:---------|:-------|:----------|
| PHYSICS→RAIL transition | 1.0s cubic smoothstep BLENDING mode | Smooth visual transition without shadow variables. BLENDING is a third mode that exclusively owns coordinates via a timer-driven lerp. |
| RAIL→PHYSICS transition | Instant | flight-engine.js roll rate limiter (45°/s) naturally smooths the entry into turns. No blend needed. |
| Blend target | `closestDistFt()` | Finds nearest along-track point, resumes `distFt` from there. |
| Command during blend | Cancel blend, enter PHYSICS | Commands always take priority. Zero input lag. |
| Maneuvers in physics | All turns + all commands | Break, final turn, closed pattern, breakout, go-around, PFL, engine fail. Straight legs stay on rails. |
| Break deceleration | `calcBreakDecelSpeed(u) = 220 × e^(-0.452u)` | Simulates idle/prop-feathering drag. Preserved from flight-engine.js. |
| Integration approach | Write `tickAircraft()` from scratch | ~200 lines. Old `fly(a)` is 400+ lines with shadow variables. Cleaner to rewrite. |
| Sim.js editing | Single agent, serial, one PR | D375. Swarm editing of sim.js caused SIM-3 disaster. |

---

## 3. Three-Mode State Machine

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
   ┌────▼────┐  turn/command  ┌──────────┐  maneuver   ┌──────────┐
   │  RAIL   │──────────────►│ PHYSICS  │──complete──►│ BLENDING │
   │         │               │          │              │          │
   │ distFt  │  ◄──1.0s──────│ engine   │  command?──►│  lerp    │
   │ owns    │    done        │ owns     │  cancel     │  owns    │
   │ x,y,alt │               │ x,y,alt  │  blend &    │ x,y,alt  │
   └─────────┘               └──────────┘  re-enter   └──────────┘
                                             PHYSICS
```

### RAIL mode
- `distFt` advances by `groundSpeedFtps × dt`
- `posOnRoute(route, distFt)` derives x, y, alt, heading
- Triggers PHYSICS when `shouldEnterPhysics(a)` returns true (turn waypoint reached, or command issued)

### PHYSICS mode  
- `stepAircraft(a, dt, wind, navPlan)` from `flight-engine.js` owns x, y, alt, heading exclusively
- Coordinated turns, bank, drag decel, climb/descent — all real aerodynamics
- When `navPlan.isComplete(a)` → enter BLENDING

### BLENDING mode
- Records `blendStart = {x, y, alt, heading}` and `blendTarget = posOnRoute(route, closestDistFt(route, a.x, a.y))`
- Each step: `t += dt; u = clamp(t / 1.0, 0, 1); s = 3u² - 2u³` (cubic smoothstep)
- `a.x = blendStart.x + (blendTarget.x - blendStart.x) * s` (same for y, alt, heading)
- When `u >= 1.0` → set `a.distFt` from target, delete blend state, enter RAIL
- If command issued → cancel blend, enter PHYSICS with current interpolated position

---

## 4. What We Have vs What We Need

| Item | Status | Location |
|:-----|:-------|:---------|
| `flight-engine.js` (732 lines, 62 tests) | ✅ Ready, standalone | `wip/sim-3-worktree` commit `13444b5` |
| `nav-plans.js` (370 lines, 39 tests) | ✅ Ready, standalone | `wip/sim-3-worktree` commit `3fc3cee` |
| Test cleanup (31 deleted, 32 converted) | ✅ Done | `wip/test-audit-and-cleanup` branch |
| `tickAircraft()` state machine | ❌ To write | ~200 lines in `sim.js` |
| `shouldEnterPhysics(a)` | ❌ To write | ~30 lines, checks waypoint type |
| Behavioral invariant tests | ❌ To write | `tests/unit/traffic/flight-invariants.test.js` |
| SPEC update (add NEVER rules) | ❌ To write | `specs/SPEC-traffic.md` |

---

## 5. Graveyard (NEVER repeat these)

| What | Why it failed |
|:-----|:-------------|
| Shadow variables (`customX/Y/Alt/Heading`, `blendFrom`) | Created "dual universe" — both systems wrote coordinates simultaneously |
| Cubic Hermite "blend" between rail and physics | Required dual-state to compute both endpoints, birthing shadow variables |
| Exact float assertions in physics tests | Agents "fix" physics to match test values, corrupting downstream |
| Multi-agent swarm editing sim.js | Agents cancel each other's work in endless loops |
| Going back to SIM-2/SIM-3 branches | Inherits broken state management, harder to clean than rewrite |

---

## 6. Risk Mitigation

1. **Test suite defused first.** All 31 agent-loop-trigger tests deleted before any sim.js changes.
2. **Operator warning in every test file.** AI agents read the warning before trying to "fix" physics.
3. **Behavioral invariants added before integration.** They define success in flight terms, not float terms.
4. **Single agent, serial execution.** No swarm, no parallel sim.js editing.
5. **Cherry-picked modules are standalone.** `flight-engine.js` and `nav-plans.js` have zero coupling to `sim.js`.
