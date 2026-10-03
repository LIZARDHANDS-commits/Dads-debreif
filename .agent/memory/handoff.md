# Handoff

Rewritten by `/save` at the end of each session. Read by `/sync` at the start.

## Last updated
03 Oct 2026, 12:25 local / 18:25Z (Antigravity).

## Current State & Documentation Directory
- **Branch:** `next-module` (up to date with `origin/next-module`, ahead of `main`).
- **SMM Aerobatics Catalog (D428 Ratified Sole Source of Truth):**
  - Authoritative reference: [`docs/smm-aerobatics-catalog.md`](file:///C:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/docs/smm-aerobatics-catalog.md).
  - Both Aileron Roll and Hesitation Roll initiate with a 20° smooth pitch-up first.
  - Hesitation Roll is NOT a 4-point roll; rolls inverted, pauses while nose drops through horizon to SET calibrated dive attitude (~15° for 230–250 kt; ~30° for 280 kt), rolls upright in dive to accelerate to entry speed.
  - Loop, Cuban 8, Cloverleaf target entry is 230 KIAS with inverse dynamic G pull law (more G if slow, less G if fast); target exit is 230 KIAS.
  - Immelmann dynamically feasible at any speed > 220 KIAS.
  - SMM Aerobatics Sequence Mode registered as FF48 in `docs/records/future-ideas.md`.
- **Turn Fight (Milestone 2):** 100% COMPLETE across all 30 tasks, Remediation Plans v2–v5, BFM AI v2.5 (PATCH-024 through PATCH-048, D401–D427). All 558 unit tests, Playwright E2E tests, typecheck, build green (3,218+ repo tests pass). Ready for Gate 2 sign-off.
- **Traffic Pattern Sim (Milestone 1):**
  - Core 3-mode state machine (`RAIL`, `PHYSICS`, `BLENDING`) complete.
  - Architecture and bloat remediation report completed and moved to [`archive/reports/traffic-sim-architecture-and-bloat-report.md`](file:///C:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/archive/reports/traffic-sim-architecture-and-bloat-report.md).
- **Turn Sim (Milestone 3):**
  - Flagged for full architectural overhaul & assessment in [`docs/handover/turn-sim.md`](file:///C:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/docs/handover/turn-sim.md) per Patrick directive (aircraft end up in a row after Delayed 45; legacy V6 heuristics broken).
  - Four paused branches on hold pending overhaul. Detailed technical audit in [`.agents/turn-sim-architecture-and-bloat-report.md`](file:///C:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/.agents/turn-sim-architecture-and-bloat-report.md).

## Milestones Status Overview
* **Milestone 0: Ground Truth & Decoupling Foundation** — COMPLETED [x]
* **Milestone 1: Traffic Pattern Sim (Gate 1)** — Core Engine & Physics Complete [x]; Spawner / UI modernization ready.
* **Milestone 2: Turn Fight 1v1 BFM & Energy Screen (Gate 2)** — COMPLETED & READY FOR GATE 2 SIGN-OFF [x] (Checklist: `docs/checklists/turn-fight.md`)
* **Milestone 3: Turn Sim / Formation (Gate 3)** — QUEUED (Full architectural overhaul & assessment required per Patrick directive: SMM non-compliance, aircraft end up in a row after Delayed 45)
* **Milestone 4: Debrief 3D View & Tacview Integration** — QUEUED
* **Milestone 5: Final Prototype Acceptance (Gate 5)** — QUEUED

## Immediate Next Steps & Options for Patrick
1. **Gate 2 Sign-Off (Turn Fight):** Run the interactive walkthrough checklist [`docs/checklists/turn-fight.md`](file:///C:/Users/patri/.gemini/antigravity/worktrees/wise-mendeleev/next_module_worktree/docs/checklists/turn-fight.md) on `localhost:4174` (or preview build).
2. **Turn Sim Architectural Assessment & Overhaul:** Begin the root-and-branch restructuring of Turn Sim trajectory/slot tracking to fix SMM formation behaviors (e.g. Delayed 45).
3. **SMM Aerobatics Sequence Mode (FF48):** Build the autonomous single-aircraft SMM aerobatics routine player demo in 3D.
4. **Merge `next-module` to `main`:** Bring all completed Turn Fight v2.5 BFM features, SMM catalog ratification, and Traffic Sim Phase 3 into `main`.

## Waiting on Patrick
- Decision on which of the 4 paths above to tackle next!
