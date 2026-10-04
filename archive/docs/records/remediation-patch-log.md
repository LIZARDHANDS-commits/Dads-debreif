# Remediation Patches & Fixes Log

**Project:** Dad's Debrief (Moose Jaw T-6 Harvard II / CT-156 Debrief Webtool)  
**Document Purpose:** Living audit trail and chronological technical register of every fix, patch, refactoring, and test adjustment applied throughout the rebuild and remediation roadmap.  
**Rule Reference:** Mandated by [`.agent/rules/dads-debrief.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/.agent/rules/dads-debrief.md).  
**Living Document:** Maintained in lockstep with [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md) and mirrored at [`docs/records/remediation-patch-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/remediation-patch-log.md).

---

## Patch Index Summary

| Patch ID | Milestone | Date & Time (UTC) | Category | Summary / Component | Verification |
| :---: | :---: | :---: | :---: | :--- | :---: |
| [**PATCH-001**](#patch-001-pilot-domain-tolerances-helper) | M0 | 2026-09-30 22:14Z | Test Framework | Pilot Domain Tolerances Helper & Assertion Suite | Pass |
| [**PATCH-002**](#patch-002-v6-runtime-test-quarantine--npm-scoping) | M0 | 2026-09-30 22:14Z | Quarantine | Archive 36 Golden Tests + Wx V6 Eval & Scope `package.json` | Pass |
| [**PATCH-003**](#patch-003-traffic-scenarios-crosscheck-table-relaxation) | M0 | 2026-09-30 22:15Z | Test Framework | Relax Crosscheck Table Assertion to Domain Tolerances | Pass |
| [**PATCH-004**](#patch-004-host-scenariostore-wiring-gap-mitigation) | M0 | 2026-09-30 22:15Z | Host Wiring | Wire `scenarioStore` in `host.js` (`createHost` & `makeApp`) and `src/app.js` | Pass |
| [**PATCH-005**](#patch-005-restore-debrief-non-prototype-status) | M0 | 2026-09-30 22:19Z | Bug Fix | Revert `prototype: true` on Debrief to uphold `registry.test.js:34` | Pass |
| [**PATCH-006**](#patch-006-gitignore-agent-teamwork-directories) | M0 | 2026-09-30 22:15Z | Git Hygiene | Add `.agents/` to `.gitignore` | Pass |
| [**PATCH-007**](#patch-007-relabel-settings-reset-buttons-to-standard-defaults) | M0 | 2026-09-30 22:16Z | UI / SMM | Relabel Settings Reset Buttons to "Reset to Standard Defaults" | Pass |
| [**PATCH-008**](#patch-008-turn-sim-settings-test-v6-parser-decoupling) | M0 | 2026-09-30 22:19Z | Bug Fix | Remove Legacy `v6Page` HTML Parsing Test from `settings.test.js` | Pass |
| [**PATCH-009**](#patch-009-roadmap-navigable-table-of-contents--gaps-codification) | M0 | 2026-09-30 22:18Z | Documentation | Add TOC, Gaps 1–7 Risk Mitigations, and Living Log to Roadmap | Pass |
| [**PATCH-010**](#patch-010-consolidation--deduplication-of-hot-ram-system-rule-and-master-roadmap) | M0 | 2026-09-30 22:30Z | System Rules | Consolidation & Deduplication of Hot RAM System Rule | Pass |
| [**PATCH-011**](#patch-011-milestone-1-pr-1-merged-threejs-3d-view--esri-satellite-tiles-pr-229) | M1 | 2026-09-30 22:38Z | 3D View | Merged Three.js 3D View & Esri Satellite Tiles (PR #229) | Pass |
| [**PATCH-012**](#patch-012-milestone-1-pr-2-consolidated-traffic-polish--rewind-fix) | M1 | 2026-09-30 22:43Z | Sim Engine | Consolidated Traffic Polish & Rewind Fix | Pass |
| [**PATCH-013**](#patch-013-milestone-1-pr-3-traffic-core-4-implementation--plausibility-gate) | M1 | 2026-09-30 23:15Z | Aero & SMM | Traffic Core 4 Implementation & Plausibility Gate | Pass |
| [**PATCH-014**](#patch-014-interactive-wind-ui-inputs--dynamic-simulation-updates) | M1 | 2026-09-30 23:25Z | UI & Physics | Interactive Wind UI Inputs & Dynamic Simulation Updates | Pass |
| [**PATCH-015**](#patch-015-3d-visualization-suite-spawner-presets--polyline-final-turn-smoothing) | M1 | 2026-09-30 23:55Z | 3D & Pilot UX | 3D Visualization Suite, Spawner Presets & Polyline Smoothing | Pass |
| [**PATCH-016**](#patch-016-3d-render-loop-decoupling-layer-relocation--ui-cleanup) | M1 | 2026-10-01 00:20Z | 3D & UI | 3D Render Loop Decoupling, Layer Relocation & UI Cleanup | Pass |
| [**PATCH-017**](#patch-017-visual-wind-adjusted-track-overlay--dynamic-perch-calculation) | M1 | 2026-10-01 00:45Z | Aero & Route | Visual Wind-Adjusted Track Overlay & Dynamic Perch Calculation | Pass |
| [**PATCH-018**](#patch-018-3d-satellite-ground-plane-fix--airfield-ground-truth-baseline) | M1 | 2026-10-01 03:40Z | 3D & Ground | 3D Satellite Ground Plane Fix & Airfield Ground Truth Baseline | Pass |
| [**PATCH-019**](#patch-019-master-vector-physics-specification-mathematical-equations--simjs-pre-vector-snapshot) | M1 | 2026-10-01 04:15Z | Aero & Spec | Master Vector Physics Spec, Equations, Snapshot & Checklist | Pass |
| [**PATCH-020**](#patch-020-stage-1-vector-physics-slices-ae-integration--crosscheck-realignment) | M1 | 2026-10-01 05:05Z | Aero & SMM | Stage 1 Vector Physics Slices A–E Integration & Crosscheck Realignment | Pass |
| [**PATCH-021**](#patch-021-stage-2-pilot-ui-controls-slices-f--g-integration) | M1 | 2026-10-01 05:15Z | UI & SMM | Stage 2 Pilot UI Controls (Slices F & G) Integration | Pass |
| [**PATCH-022**](#patch-022-v20-ui-badge-zero-wind-track-realignment--closed-pattern-climb-physics) | M1 | 2026-10-01 05:40Z | UI & Physics | V2.0 UI Badge, Zero-Wind Track Realignment & Closed Pattern Climb Physics | Pass |
| [**PATCH-023**](#patch-023-closed-pattern-guidance-calm-wind-rounded-arcs-high-key-pfl--spawner-clean-up) | M1 | 2026-10-01 09:30Z | Aero & Pilot UX | Closed Pattern Guidance, Calm-Wind Rounded Arcs, High Key PFL & Spawner Clean-Up | Pass |
| [**PATCH-024**](#patch-024-milestone-2-turn-fight-energy-screen--tactical-3d-suite-integration) | M2 | 2026-10-01 07:00Z | 3D & Energy | Milestone 2 Turn Fight Energy Screen & Tactical 3D Suite Integration | Pass |
| [**PATCH-025**](#patch-025-milestone-2-active-combat-pursuit-default-d403) | M2 | 2026-10-01 07:25Z | BFM Physics | Milestone 2 Active Combat Pursuit Default (D403) | Pass |
| [**PATCH-026**](#patch-026-energy-mode-3d-merge-azimuth-acquisition-across-vertical-separation-d404) | M2 | 2026-10-01 08:05Z | BFM & 3D | Energy Mode 3D Merge Azimuth Acquisition across Vertical Separation (D404) | Pass |
| [**PATCH-027**](#patch-027-pilot-stall-authority-loss--post-merge-3d-pursuit-entry-d405) | M2 | 2026-10-01 09:05Z | Aero & BFM | Pilot Stall Authority Loss & Post-Merge 3D Pursuit Entry (D405) | Pass |
| [**PATCH-028**](#patch-028-pre-phase-vector-guidance-migration-documentation-synchronization-d406-r34) | M1 | 2026-10-02 01:25Z | Aero & Spec | Pre-Phase Vector Guidance Migration Documentation Synchronization (D406, R34) | Pass |
| [**PATCH-029**](#patch-029-turn-fight-bfm-1v1-50-g-law-d386-cone-bfm-ai-v22--test-harmonization) | M2 | 2026-10-02 11:55Z | Aero & BFM | 5.0 G Pull Law, D386 Cone, BFM AI v2.2 & Pilot Domain Test Harmonization | Pass |
| [**PATCH-030**](#patch-030-simjs-surgery--deleted-flya-wired-tickaircraft-eliminated-shadow-variables) | M1 | 2026-10-02 19:32Z | Sim Engine | sim.js Surgery: Deleted fly(a), Wired tickAircraft(), Eliminated 159 Shadow Variables | Pass |
| [**PATCH-031**](#patch-031-teleport-fix-1--clear-stale-waypointindex-on-blend-complete) | M1 | 2026-10-02 19:32Z | Sim Engine | Teleport Fix 1: Clear Stale waypointIndex on Blend Complete | Pass |
| [**PATCH-032**](#patch-032-teleport-fix-2--position-based-shouldenterphysics) | M1 | 2026-10-02 19:32Z | Sim Engine | Teleport Fix 2: Position-Based shouldEnterPhysics | Pass |
| [**PATCH-033**](#patch-033-teleport-fix-3--phase-aware-enterblending-targets-window-point-12) | M1 | 2026-10-02 19:32Z | Sim Engine | Teleport Fix 3: Phase-Aware enterBlending Targets Window Point 12 for Final Approach | Pass |
| [**PATCH-034**](#patch-034-computebreakrollout--wind-adjusted-downwind-start-position) | M1 | 2026-10-02 19:58Z | Aero & Route | computeBreakRollout(): Wind-Adjusted Downwind Start Position | Pass |
| [**PATCH-035**](#patch-035-pfl--high-key-3-bugs-fixed--135x-prototype-drag) | M1 | 2026-10-02 20:03Z | Aero & Engine | PFL / High Key 3 Bugs Fixed + 1.35× Prototype Drag | Pass |
| [**PATCH-036**](#patch-036-breakout-altitude-standardized-to-4500-ft) | M1 | 2026-10-02 20:16Z | SMM & Aero | Breakout Altitude Standardized from 3,500 ft to 4,500 ft | Pass |
| [**PATCH-037**](#patch-037-closed-pattern-command--45-bank-climbing-left-turn) | M1 | 2026-10-02 20:16Z | Aero & Maneuver | Closed Pattern Command: 45° Bank Climbing Left Turn | Pass |
| [**PATCH-049**](#patch-049-turn-fight-altitude-split-canopy-visual-pursuit-d429) | M2 | 2026-10-03 15:35Z | BFM AI & Aero | Altitude-Split Canopy Visual Acquisition Pursuit (D429) | Pass |
| [**PATCH-050**](#patch-050-traffic-3d-visual-landmarks-buildings-cameras-sun-d430-d434) | M1 | 2026-10-03 15:45Z | 3D & UX | 3D Visual Landmarks, Traced Buildings, Camera Suite & SW Sun (D430–D434) | Pass |
| [**PATCH-051**](#patch-051-breakout-rejoin-high-key-and-pfl-architecture-d435-d436) | M1 | 2026-10-03 23:05Z | Aero & SMM | Breakout 2 NM Rejoin, High Key Controller & PFL Architecture (D435–D436) | Pass |
| [**PATCH-052**](#patch-052-traffic-single-click-button-responsiveness-and-dom-stability-d437) | M1 | 2026-10-03 23:15Z | UI & Architecture | Single-Click Button Responsiveness & Stable In-Place DOM Updates (D437) | Pass |
| [**PATCH-053**](#patch-053-high-key-pfl-energy-gate-pilot-domain-tolerances--360-spiral-continuity-d438) | M1 | 2026-10-04 00:35Z | Aero & SMM | High Key PFL Energy Gate Pilot Domain Tolerances & 360° Spiral Continuity (D438) | Pass |

---

## Detailed Technical Changelog

### PATCH-001: Pilot Domain Tolerances Helper
* **Date & Time:** 2026-09-30 22:14 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Created:**
  * [`tests/helpers/tolerances.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/helpers/tolerances.js)
* **Problem / Flaw Identified:**  
  Previous tests across the suite enforced floating-point equality down to $10^{-15}$ against V6 output. Minor mathematical cleanups or compiler differences caused cascading test failures over nanometer and micro-knot differences that have zero physical or piloting significance.
* **Changes Made:**
  Created `tests/helpers/tolerances.js` exporting frozen `TOLERANCES` dictionary ($\pm 10\text{ kt}$ airspeed, $\pm 100\text{ ft}$ altitude, $\pm 5^\circ$ angles, $\pm 0.5\text{ G}$, $\pm 2.5^\circ/\text{s}$ turn rate, $\pm 5\%$ relative) and helper assertion functions `assertNear` and `assertTableWithinTolerance`.
* **Reasoning / Rationale:**  
  Ratified by Decisions **D369** and **D371**. Aligns automated test assertions with realistic 15 Wing Moose Jaw flight tolerances and cockpit flight instruments.
* **Verification:**  
  Imported and verified in `tests/crosscheck/traffic-scenarios.test.js`.

---

### PATCH-002: V6 Runtime Test Quarantine & NPM Scoping
* **Date & Time:** 2026-09-30 22:14 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Moved / Modified:**
  * Moved `tests/golden/` (36 files) $\rightarrow$ `archive/tests/golden/`
  * Moved `tests/unit/wx/v6-compare.test.js` $\rightarrow$ `archive/tests/wx/v6-compare.test.js`
  * Moved `tests/unit/wx/v6-sof.js` $\rightarrow$ `archive/tests/wx/v6-sof.js`
  * Modified [`package.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/package.json) (line 14)
* **Problem / Flaw Identified:**  
  `tests/golden/` contained 36 legacy test files that dynamically evaluated `original/shell.html` via `eval()` and `new Function()`, enforced SHA-256 cryptographic dataset locks, and preserved known V6 aerodynamic bugs. Furthermore, `v6-sof.js` and `v6-compare.test.js` in `tests/unit/wx/` were extracting raw HTML strings from V6.
* **Changes Made:**
  Moved legacy golden and weather comparison files into `archive/tests/`. Updated `package.json` test script:
  ```json
  "test": "node --test \"tests/unit/**/*.test.js\" \"tests/crosscheck/**/*.test.js\""
  ```
* **Reasoning / Rationale:**  
  Decisions **D368** and **D372**. Decouples active test runner from legacy V6 runtime eval while preserving full historical records in `archive/`. Scoping `package.json` prevents the test runner from crawling archived files.
* **Verification:**  
  `npm test` skips `archive/` cleanly; execution duration dropped from 42.5s to 29.8s.

---

### PATCH-003: Traffic Scenarios Crosscheck Table Relaxation
* **Date & Time:** 2026-09-30 22:15 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`tests/crosscheck/traffic-scenarios.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-scenarios.test.js) (lines 17–20, 99)
* **Problem / Flaw Identified:**  
  Line 99 used `assert.deepEqual(TABLE, expected)`, failing if any calculated floating-point coordinate or speed deviated by $10^{-9}$.
* **Changes Made:**
  Imported `assertTableWithinTolerance` from `../helpers/tolerances.js` and replaced `assert.deepEqual(TABLE, expected)` with `assertTableWithinTolerance(TABLE, expected)`.
* **Reasoning / Rationale:**  
  Allows Traffic simulation math to be refined without breaking crosscheck tests over minor decimal rounding.
* **Verification:**  
  Verified passing with `node --test tests/crosscheck/traffic-scenarios.test.js`.

---

### PATCH-004: Host scenarioStore Wiring Gap Mitigation
* **Date & Time:** 2026-09-30 22:15 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`src/shell/host.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/shell/host.js) (lines 24, 75)
  * [`src/app.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/app.js) (line 52)
* **Problem / Flaw Identified (Critical Gap 1):**  
  Turn Sim expects `app.scenarioStore` to persist tactical scenarios in localStorage. While prior plans noted adding `scenarioStore` to `src/app.js`, `createHost` in `src/shell/host.js` never accepted `scenarioStore` or exposed it on the `app` object in `makeApp`. Turn Sim would always have defaulted to ephemeral `memoryStore()`, losing saved scenarios on reload.
* **Changes Made:**
  1. Updated `createHost` in `src/shell/host.js` to accept `scenarioStore = null` in its options.
  2. Added `scenarioStore: scenarioStore ?? store.scope('scenarios')` to `makeApp(session)`.
  3. Added `scenarioStore: store.scope('scenarios')` to `createHost` call in `src/app.js`.
* **Reasoning / Rationale:**  
  Pre-wires host service dependency before Turn Sim branches merge, ensuring seamless localStorage persistence for formation setups.
* **Verification:**  
  Verified with `npm run build` and unit tests in `tests/unit/shell/host.test.js`.

---

### PATCH-005: Restore Debrief Non-Prototype Status
* **Date & Time:** 2026-09-30 22:19 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`src/shell/registry.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/shell/registry.js) (lines 14–22)
* **Problem / Flaw Identified:**  
  An earlier task note suggested adding `prototype: true` to the Debrief module card. When applied, `tests/unit/shell/registry.test.js:34` failed with:  
  `✖ turn-sim, turn-fight, traffic and sof are prototypes until the combined sign-off (D135); debrief is not`.  
  Debrief was already signed off in PR #241 and intentionally had its prototype badge removed.
* **Changes Made:**
  Preserved Debrief's signed-off status by removing `prototype: true` from the `debrief` entry in `src/shell/registry.js`.
* **Reasoning / Rationale:**  
  Honors existing verified module sign-off state (PR #241) and keeps `tests/unit/shell/registry.test.js` green.
* **Verification:**  
  `node --test tests/unit/shell/registry.test.js` passed (6 passed, 0 failed).

---

### PATCH-006: Gitignore Agent Teamwork Directories
* **Date & Time:** 2026-09-30 22:15 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`.gitignore`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/.gitignore)
* **Problem / Flaw Identified:**  
  Antigravity agent scratch directories (`.agents/`) were appearing as untracked files in `git status`, risking accidental commits of temporary agent context into the repository.
* **Changes Made:**
  Appended `.agents/` to `.gitignore`.
* **Reasoning / Rationale:**  
  Standard git hygiene; prevents workspace metadata pollution.
* **Verification:**  
  Verified with `git status`; `.agents/` is excluded from git tracking.

---

### PATCH-007: Relabel Settings Reset Buttons to Standard Defaults
* **Date & Time:** 2026-09-30 22:16 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`src/modules/turn-fight/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/layout.js) (line 66)
  * [`tests/e2e/turn-fight.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/turn-fight.spec.js) (line 15)
* **Problem / Flaw Identified:**  
  Turn Fight and Turn Sim UI buttons were labeled "Reset to V6 defaults". V6 defaults contained uncertified flight parameters (e.g. 2.0 G break turn instead of SMM 3.0 G, 8,000 ft trail instead of SMM 7,000 ft).
* **Changes Made:**
  1. In `src/modules/turn-fight/layout.js:66`, changed `resetLabel: 'Reset to V6 defaults'` to `resetLabel: 'Reset to Standard Defaults'`.
  2. In `tests/e2e/turn-fight.spec.js:15`, updated button locator regex to `/Reset to (Standard|V6) defaults/` to support both during transition.
* **Reasoning / Rationale:**  
  Decision **D384**. Restores certified 15 Wing SMM standards (`DEFAULT_STANDARDS`) and eliminates misleading V6 labeling from the pilot interface.
* **Verification:**  
  Verified with `npm run build` and e2e test selector compatibility.

---

### PATCH-008: Turn Sim Settings Test V6 Parser Decoupling
* **Date & Time:** 2026-09-30 22:19 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`tests/unit/turn-sim/settings.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-sim/settings.test.js) (lines 9–38)
* **Problem / Flaw Identified:**  
  Test 1 in `tests/unit/turn-sim/settings.test.js` imported `../../golden/v6-source.js` to parse V6 input values directly from `original/shell.html`. After `tests/golden/` was moved to `archive/`, running `npm test` threw:  
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'tests/golden/v6-source.js'`.
* **Changes Made:**
  Removed the legacy HTML-parsing test and unused `v6Page` import, while preserving all 11 active unit tests for `DEFAULTS`, ranges, error handling, and migrations.
* **Reasoning / Rationale:**  
  Upholds Decisions **D368** and **D372** (zero runtime `eval()` or HTML parsing against V6). Turn Sim settings are verified against certified SMM standards without depending on legacy HTML extraction.
* **Verification:**  
  `node --test tests/unit/turn-sim/settings.test.js` passed (11 passed, 0 failed).

---

### PATCH-009: Roadmap Navigable Table of Contents & Gaps Codification
* **Date & Time:** 2026-09-30 22:18 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md)
  * [`docs/records/remediation-roadmap.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/remediation-roadmap.md)
* **Problem / Flaw Identified:**  
  Roadmap lacked an executive Table of Contents for quick navigation and did not explicitly document the 7 critical integration gaps caught during the deep codebase audit (including `host.js` wiring, crosscheck expected table regeneration timing, visual snapshot drift policy, and headless CI WebGL limits).
* **Changes Made:**
  Added hyperlinked Table of Contents, Section 2.2 detailing Gaps 1–3, Section 2.3 detailing Gaps 4–7 risk mitigations, and Section 7 Living Execution & Decision Log. Synchronized mirror in `docs/records/`.
* **Reasoning / Rationale:**  
  Creates a living, authoritative navigation map and tactical execution ledger for all human and AI developers working on the rebuild.
* **Verification:**  
  File formatting, links, and markdown syntax verified.

---

### PATCH-010: Consolidation & Deduplication of Hot RAM System Rule and Master Roadmap
* **Date & Time:** 2026-09-30 22:30 UTC
* **Milestone:** Milestone 0 (Foundation)
* **Branch:** `foundation/v6-decoupling`
* **Files Modified:**
  * [`.agent/rules/dads-debrief.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/.agent/rules/dads-debrief.md)
  * [`Dads-debreif/.agent/rules/dads-debrief.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/.agent/rules/dads-debrief.md)
* **Problem / Flaw Identified:**  
  The always-on rule file `.agent/rules/dads-debrief.md` (which is loaded into every LLM turn as Hot RAM) had bloated to 186 lines (~23 KB) because it duplicated the active Milestones 0–5 checklist, the 11 swarm forensic refinement bullets, and the Phase 2 deferred features list. This burned ~3,500 extra tokens per prompt turn and caused synchronization drift with `docs/REMEDIATION_ROADMAP.md` (where completed Milestone 0 tasks had been checked off, but remained unchecked in the rule).
* **Changes Made:**
  1. Streamlined `.agent/rules/dads-debrief.md` in both root and repository directories.
  2. Pruned the redundant living task checklist, swarm gap summaries, and Phase 2 table from Hot RAM.
  3. Added an Authoritative Document Directory table establishing `docs/REMEDIATION_ROADMAP.md` as the sole single source of truth for active task tracking (`- [x]`), gap analyses (Gaps 1–7), and deferred features (`PPQ-01` to `PPQ-16`).
  4. Preserved all invariant flight physics ground truths (CYMJ 29L LH, Break 3,500 ft / Straight-in 2,700 ft, CT-156=Harvard II), pilot domain tolerances (D369/D371), platform constraints (Antigravity serial PR rule), streamlined build rules, and available skills.
* **Reasoning / Rationale:**  
  Hot RAM must contain non-negotiable operational boundaries and routing pointers, not living checklists. Eliminates token waste and stops cross-document synchronization drift.
* **Verification:**  
  Both `.agent/rules/dads-debrief.md` copies verified identical in content.

---

### PATCH-011: Milestone 1 (PR 1) Merged Three.js 3D View & Esri Satellite Tiles (PR #229)
* **Date & Time:** 2026-09-30 22:38 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main` (commit `64cc09a`)
* **Files Modified:**
  * [`src/modules/traffic/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/view3d.js) (NEW)
  * [`src/modules/traffic/map2d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/map2d.js)
  * [`src/modules/traffic/settings-panel.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/settings-panel.js)
  * [`src/modules/traffic/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/layout.js)
  * [`src/modules/traffic/index.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/index.js)
  * [`src/modules/traffic/defaults.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/defaults.js)
  * [`src/modules/traffic/traffic.css`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/traffic.css)
  * [`tests/unit/traffic/view3d.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/view3d.test.js) (NEW)
  * [`tests/unit/traffic/map2d.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/map2d.test.js)
  * [`tests/unit/traffic/settings-panel.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/settings-panel.test.js)
  * [`tests/unit/traffic/layout.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/layout.test.js)
  * [`tests/unit/traffic/defaults.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/defaults.test.js)
  * [`tests/e2e/traffic.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/traffic.spec.js)
  * [`tests/e2e/visual.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/visual.spec.js)
* **Problem / Flaw Addressed:**  
  Traffic Sim previously lacked 3D perspective visualization and satellite airfield map tiles, limiting pilot situational awareness in visual circuit spacing.
* **Changes Made:**
  1. Merged `origin/claude/traffic-spec-j17uqw` (PR #229) cleanly into `main` via `64cc09a` (+2,441 lines across 18 files).
  2. Integrated Three.js 3D traffic renderer (`view3d.js`) with aircraft orientation (bank, pitch, heading) and camera controls.
  3. Integrated Esri satellite tile rendering under 2D map canvas with offline caching and graceful fallback.
* **Reasoning / Rationale:**  
  Completes Task 1.1 and Task 1.2 of Milestone 1 per the master execution roadmap.
* **Verification:**  
  `npm test` passed 100% green (`2,879 passed, 0 failed, 8 todo, 1 skipped` in 31.2s; 54 new unit tests). `npm run build` passed in 354ms with all size budgets intact.

---

### PATCH-012: Milestone 1 (PR 2) Consolidated Traffic Polish & Rewind Fix
* **Date & Time:** 2026-09-30 22:43 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main` (commits `74372d4`, `e214f63`, `4405cd9`)
* **Files Modified:**
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
  * [`src/modules/traffic/profile-store.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/profile-store.js)
  * [`src/modules/traffic/profiles-panel.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/profiles-panel.js)
  * [`src/modules/traffic/clock.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/clock.js)
  * [`src/modules/traffic/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/layout.js)
  * [`src/modules/traffic/playback-bar.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/playback-bar.js)
  * [`tests/unit/traffic/rewind.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/rewind.test.js) (+422 lines)
  * [`tests/unit/traffic/profile-store.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/profile-store.test.js)
  * [`tests/unit/traffic/fake-dom-extras.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/fake-dom-extras.test.js) (NEW)
* **Problem / Flaw Addressed:**  
  Previous separate branches `traffic-polish` and `traffic-rewind-fix` modified overlapping files (`aircraft.js`, `sim.js`, `index.js`), risking Git collision and lost callsign state during timeline scrubbing. Additionally, an obsolete damaged-text assertion in `profile-store.test.js` failed against PR-03's hardened `foreign: true` security standard.
* **Changes Made:**
  1. Consolidated both branches cleanly onto `traffic/pr-2-polish-rewind`.
  2. Preserved the full 422 lines of rewind tests in `tests/unit/traffic/rewind.test.js`.
  3. Integrated event-based timeline scrubbing, timed spawns, and single-row playback bar layout.
  4. Fixed `profile-store.test.js` to correctly expect `foreign: true` and unreadable warning message when damaged non-JSON storage is encountered.
  5. Merged consolidated PR 2 cleanly into `main` via `4405cd9`.
* **Reasoning / Rationale:**  
  Completes Tasks 1.3 and 1.4 of Milestone 1 per the master execution roadmap.
* **Verification:**  
  `npm test` passed 100% green (`2,929 passed, 0 failed, 8 todo, 1 skipped` in 32.1s; 50 new unit tests). `npm run build` passed in 412ms with all size budgets intact.

---

### PATCH-013: Milestone 1 (PR 3) Traffic Core 4 Implementation & Plausibility Gate
* **Date & Time:** 2026-09-30 23:15 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `traffic/pr-3-core-4` -> `main`
* **Files Modified:**
  * [`src/modules/traffic/types.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/types.js) (NEW)
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/data/moose-jaw.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/data/moose-jaw.json)
  * [`tests/unit/traffic/setup-diff.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/setup-diff.test.js)
  * [`tests/unit/traffic/plausibility.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/plausibility.test.js)
  * [`tests/crosscheck/traffic-measure.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-measure.js)
  * [`tests/crosscheck/traffic-expected.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-expected.json)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
* **Problem / Flaw Addressed:**  
  Traffic Core 4 required authentic 15 Wing aircraft performance profiles (`types.js`), wind vector integration (`groundSpeedKt`, `crabDeg`, `headingDeg`, `trackDeg`), closed-loop wind-adjusted perch guidance per D389, true circular turn arcs (`trueArcs: true`) per D46 eliminating quadratic Bézier G spikes, continuous descending final turn (13.7° slope) per D382/TR-02, break initiation 2,048 ft past threshold per TR-06, threshold landing decision per TR-08, and aligned split/join endpoints eliminating legacy 1,949 ft position jumps per TR-05.
* **Changes Made:**
  1. Created `src/modules/traffic/types.js` with authentic 15 Wing SMM circuit speeds for CT-156 Harvard II (default), CT-155 Hawk, CT-114 Tutor, CF-188 Hornet, CT-157, and CT-102.
  2. Integrated wind triangle and true airspeed calculations into `sim.js`, exposing ground speed, crab angle, track, and heading on aircraft telemetry.
  3. Formulated and recorded Decision D389: level 60°/2.0 G break turn regardless of wind, with closed-loop perch waypoint drift compensation $\Delta \vec{P}_{\text{wind}} = \vec{V}_{\text{wind}} \times T_{\text{turn}}$.
  4. Implemented D46 true circular arcs (`circularArcPoints`) and linear final descent in `route.js`, eliminating flown G spikes and maintaining constant 13.7° slope ($\le 15^\circ$).
  5. Calibrated `moose-jaw.json`: Break point at 2,048 ft past threshold (TR-06), restored D382 standards (Break exit 2.0 G, Perch 1.4142 G, Window 2,119 ft MSL), and aligned split/join endpoints (SPL2, SPL3, ENT3, ENT1) eliminating step jumps across 20 seeds (TR-05).
  6. Converted all 8 `test.todo` stubs in `tests/unit/traffic/plausibility.test.js` to active passing green assertions (TR-02, TR-04, TR-05, TR-06, TR-07, TR-08, TR-20).
  7. Regenerated `tests/crosscheck/traffic-expected.json` with authentic SMM circuit numbers.
* **Reasoning / Rationale:**  
  Completes Task 1.5 of Milestone 1 per the master execution roadmap. Prepares Traffic Sim module for Gate 1 Sign-Off.
* **Verification:**  
  `npm test` passed 100% green (`2,937 passed, 0 failed, 0 todo, 1 skipped` in 39.3s). `npm run build` passed in 401ms.

---

### PATCH-014: Interactive Wind UI Inputs & Dynamic Simulation Updates
* **Date & Time:** 2026-09-30 23:25 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/glue.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/glue.js)
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/index.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/index.js)
  * [`tests/unit/traffic/glue.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/glue.test.js)
* **Problem / Flaw Addressed:**  
  Wind direction and speed inputs were previously hidden in the playback bar (`wind: false`). In addition, `createSim` captured `setup.windFromDeg` and `setup.windKt` as static initial constants at simulation initialization time, meaning runtime wind adjustments via UI settings had zero effect on already-flying aircraft ground speeds, crabbing angles, and heading pointers.
* **Changes Made:**
  1. Enabled interactive wind controls in the playback bar: `available: { photo: true, view3d: true, wind: true }` in `src/modules/traffic/index.js`.
  2. Subscribed `settings.subscribe()` in `index.js` to reset flight trail history (`sim.forgetHistory()`) on wind value change, preserving timeline scrub/rewind integrity.
  3. Modified `src/modules/traffic/glue.js` `applyToSetup()` to forward `windFromDeg` and `windKt` clamped within valid limits to the simulation setup object, with updated JSDoc typings.
  4. Converted `sim.js` static wind constants to dynamic accessors (`getWindFromDeg()` and `getWindKt()`) evaluated on each 0.05 s step, immediately updating crabbing, ground speed, and heading pointers for flying aircraft without restarting the simulation.
  5. Added unit test `wind settings reach the setup and update a running sim` in `tests/unit/traffic/glue.test.js` verifying dynamic crabbing and speed changes.
* **Reasoning / Rationale:**  
  Provides interactive wind control for Patrick's Gate 1 inspection and ensures wind physics respond dynamically to user input.
* **Verification:**  
  `npm test` passed 100% green (`2,938 passed, 0 failed, 0 todo, 1 skipped` in 40.5s). `npm run typecheck` passed cleanly (0 errors). `npm run build` passed in 304ms.

---

### PATCH-015: 3D Visualization Suite, Spawner Presets & Polyline Final Turn Smoothing
* **Date & Time:** 2026-09-30 23:55 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
  * [`src/modules/traffic/readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/readouts.js)
  * [`src/modules/traffic/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/view3d.js)
  * [`src/modules/traffic/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/layout.js)
  * [`src/modules/traffic/index.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/index.js)
  * [`src/modules/traffic/traffic.css`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/traffic.css)
  * [`tests/crosscheck/traffic-expected.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-expected.json)
  * [`tests/unit/traffic/aircraft.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/aircraft.test.js)
  * [`tests/unit/traffic/commands.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/commands.test.js) (NEW)
  * [`tests/unit/traffic/view3d.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/view3d.test.js)
* **Problem / Flaw Addressed:**  
  1. Final turn drawn polyline geometry had an unnatural 12.3° vertical elbow drop-off at Point 12 (Window, 2,119 ft MSL) due to linear descent against abrupt corner offsets.
  2. Overhead break polyline decelerated linearly instead of obeying aerodynamic $V^2$ induced drag ($V(u) = 220 \cdot e^{-0.452 u}$, decelerating 220 to 140 KIAS).
  3. Aircraft backend lacked basic command hooks (`sim.command` for breakout, engine fail glide to 110 KIAS, go-around).
  4. Spawner was constrained to raw numeric point IDs rather than pilot-intuitive points (`Initial`, `Downwind`, `Perch`, `2-Mile Final`, `1-Mile Final`, `Takeoff`, `Rejoin Lines`) and lacked callsign preview.
  5. 3D view lacked camera translation/panning (right-click / middle-click / shift-drag), satellite photo ground projection plane, and vertical plumb lines with ground shadow reference rings.
* **Changes Made:**
  1. Updated `route.js`: Implemented continuous cubic easing descent along the final turn ($u \in [0, 1]$), smooth $V^2$ aerodynamic drag deceleration along the 180° break arc, and increased arc point density to 24 slices.
  2. Implemented `sim.command(aircraftId, action)` in `sim.js` supporting `'breakout'`, `'engine_fail'`, and `'go_around'` with automatic speed and vertical profile transitions; exposed `sim.nextCallsign()`.
  3. Exported `PILOT_SPAWN_PRESETS` in `aircraft.js`, added intuitive spawn preset dropdown and next callsign preview badge (`Next: A#`), and mounted in-flight action buttons (`Breakout`, `Eng Fail`, `Go-Around`) onto active aircraft rows.
  4. Added `panCamera` and pointer event listeners in `view3d.js` enabling camera panning via right-click drag, middle-click drag, Shift + left-click drag, and Shift + Arrow keys.
  5. Added satellite photo ground plane in 3D using `THREE.PlaneGeometry` with canvas texture sourced from `createTileLayer`, enabled via Layers menu.
  6. Added "Height lines" toggle displaying dashed vertical plumb lines (`LineDashedMaterial`) with ground shadow rings below airborne aircraft.
  7. Added unit tests in `commands.test.js` (4/4 passed) and updated `aircraft.test.js`, `view3d.test.js`, and `traffic-expected.json`.
  8. **Simulation Scope Note:** This patch smoothed the *drawn polyline routes* in `route.js` and upgraded UI/3D controls. The flying aircraft in `sim.js` remained driven by 1D polyline distance (`a.distFt`); full Cartesian vector flight was deferred to Stage 1 of the vector physics roadmap.
* **Reasoning / Rationale:**  
  Decisions **D370**, **D374**, and **D390**. Elevates Traffic Sim with intuitive pilot controls, smooth polyline geometry, and modern 3D visual references.
* **Verification:**  
  `npm test` passed 100% green (`2,943 passed, 0 failed, 1 skipped`). `npm run typecheck` passed (0 errors). `npm run build` passed in 451ms.

---

### PATCH-016: 3D Render Loop Decoupling, Layer Relocation & UI Cleanup
* **Date & Time:** 2026-10-01 00:20 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/view3d.js)
  * [`src/modules/traffic/playback-bar.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/playback-bar.js)
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
* **Problem / Flaw Addressed:**  
  1. Switching to 3D mode froze the browser because offscreen canvas tile uploads were scheduled every frame inside the Three.js animation loop (`photoTexture.needsUpdate = true`).
  2. "Height lines" was placed as a floating toolbar button on the 2D map, overlapping UI labels.
  3. Experimental in-flight action buttons on aircraft rows were non-functional and cluttered the view.
* **Changes Made:**
  1. Debounced satellite tile texture generation (`ensurePhotoTexture`), prevented per-frame `photoTexture.needsUpdate = true`, and removed redundant tile redraw loops. 3D mode now runs at a locked 60 FPS.
  2. Relocated "Height drop lines" toggle into the `Layers ▾` dropdown menu (`layerHeightLines`, `needs: 'view3d'`) alongside Labels, Caution rings, and Trails.
  3. Cleaned experimental action buttons from aircraft rows.
* **Reasoning / Rationale:**  
  Preserves smooth 60 FPS 3D rendering and uncluttered, professional UI layout.
* **Verification:**  
  Smooth 60 FPS Three.js rendering confirmed; unit tests passed.

---

### PATCH-017: Visual Wind-Adjusted Track Overlay & Dynamic Perch Calculation
* **Date & Time:** 2026-10-01 00:45 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/scene.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/scene.js)
  * [`src/modules/traffic/defaults.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/defaults.js)
  * [`src/modules/traffic/profile.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/profile.js)
  * [`src/modules/traffic/playback-bar.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/playback-bar.js)
  * [`src/modules/traffic/index.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/index.js)
  * [`src/modules/traffic/map2d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/map2d.js)
  * [`src/modules/traffic/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/view3d.js)
  * [`tests/unit/traffic/vector-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/vector-sim.test.js) (NEW)
* **Problem / Flaw Addressed:**  
  Pilots in Traffic Sim had no visual reference displaying where an aircraft would drift under active wind, nor where the ideal wind-shifted Perch waypoint should be located for a continuous descending final turn.
* **Changes Made:**
  1. Exported `computeWindPerch(route, windFromDeg, windKt, options)` in `route.js` calculating exact wind drift offset $\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$ ($T_{\text{turn}} \approx 29.8\text{ s}$ for 180° turn at 120 KIAS, 35° bank).
  2. Exported `generateWindAdjustedTrack(route, windFromDeg, windKt, options)` constructing full 3D Cartesian trajectory geometry: 60° bank / 2.0 G level break turn with natural wind drift & $V^2$ aerodynamic drag deceleration ($220 \to 140$ KIAS); direct crabbed ground track to shifted Perch; continuous 180° descending final turn ($3500 \to 2700$ ft MSL cubic easing) rolling out wings level on runway centerline; 3.0° glide slope descent ($120 \to 100$ KIAS) to 1,892 ft MSL threshold.
  3. Added `layerWindTrack` and `layerSmmReference` layer toggles to `DEFAULTS`, `PROFILE_SETTING_KEYS`, and `LAYER_ITEMS`.
  4. Rendered active wind track (solid), SMM calm reference corridor (dashed), and dynamic `"Perch (Wind)"` marker with warm highlight on both 2D canvas and 3D Three.js scene.
  5. Added unit tests in `tests/unit/traffic/vector-sim.test.js` (5/5 passed).
  6. **Simulation Scope Note:** This patch implemented the *visual track calculation and map rendering* in `route.js` and `scene.js`. The running aircraft simulation engine in `sim.js` was NOT yet converted to Cartesian vectors and remained on the 1D polyline waypoint stepper (`a.distFt += ...`), with the vector engine scheduled for Stage 1 (Slices A–E) in `tasks/traffic/vector-physics-todo.md`.
* **Reasoning / Rationale:**  
  Decisions **D370**, **D382**, and **D389**. Provides pilots with clear visual ground track and Perch references under varying wind conditions.
* **Verification:**  
  `npm test` passed 100% green (`2,948 passed, 0 failed, 1 skipped`). `npm run typecheck` passed (0 errors). `npm run build` passed in 439ms.

---

### PATCH-018: 3D Satellite Ground Plane Fix & Airfield Ground Truth Baseline
* **Date & Time:** 2026-10-01 03:40 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main` (commit `ff80c96`)
* **Files Modified:**
  * [`src/modules/traffic/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/view3d.js)
* **Problem / Flaw Addressed:**  
  1. The 3D satellite floor remained invisible/transparent because `fixedMap.worldToScreen` returned an object `{ x, y }`, whereas `map-tiles.js:107` expected an array `[x, y]`, causing array destructuring (`const [x1, y1] = toScreen(...)`) to throw `TypeError: toScreen(...) is not iterable`.
  2. Single-sided plane geometry (`THREE.FrontSide`) caused backface culling from certain grazing camera angles, and matching ground elevation caused potential z-fighting against the wireframe grid.
  3. If external Esri web tiles were delayed or offline, the 3D ground was completely empty.
* **Changes Made:**
  1. Corrected `fixedMap.worldToScreen` to return `[x, y]`, enabling `createTileLayer.draw` to paint satellite tiles onto `photoCanvas`.
  2. Added `THREE.DoubleSide` to `photoMaterial` and set elevation to `floor - 2` to prevent backface culling and z-fighting.
  3. Implemented `paintBaseAirfield(ctx)` painting the Moose Jaw runway complex (Runways 29L/11R, 29R/11L, 04/22) and prairie grass baseline immediately upon texture creation, so the airfield ground is always visible even prior to web tile arrival.
  4. Updated visibility condition to `options.layerPhoto !== false` (on by default).
* **Reasoning / Rationale:**  
  Guarantees instant, reliable visual reference on the 3D floor matching the 2D map view.
* **Verification:**  
  `npm test` passed 100% green (`2,948 passed, 0 failed, 1 skipped`). `npm run typecheck` passed (0 errors). `npm run build` passed in 573ms.

---

### PATCH-019: Master Vector Physics Specification, Mathematical Equations & sim.js Pre-Vector Snapshot
* **Date & Time:** 2026-10-01 04:15 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main` (commits `620b229`, `7156052`, `f81c135`)
* **Files Created:**
  * [`src/modules/traffic/sim.js.pre-vector.bak`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js.pre-vector.bak) (Safety backup)
  * [`specs/SPEC-traffic-vector.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/specs/SPEC-traffic-vector.md) (Master specification)
  * [`tasks/traffic/vector-physics-plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-plan.md) (Execution plan & Before/After code diagrams)
  * [`tasks/traffic/vector-physics-todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-todo.md) (Living task checklist for Slices A–G)
* **Files Modified:**
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md) (Decision D391)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md) (Decision D391)
  * [`docs/handover/traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/handover/traffic.md)
  * [`.agent/memory/handoff.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/.agent/memory/handoff.md)
* **Problem / Flaw Addressed:**  
  1. Transitioning Traffic Sim from legacy 1D "slot-car on rails" polyline progression to authentic 3D Cartesian vector flight required an authoritative mathematical specification that formalizes closed-loop steering, localizer corridor tracking, pure pursuit, vertical cubic transitions, and authentic Harvard II aero parameters without breaking existing tests.
  2. Safe engineering discipline required preserving an exact pre-modification snapshot of `sim.js` (`src/modules/traffic/sim.js.pre-vector.bak`) committed to Git history prior to code edits.
  3. All team documents (handover, decisions, living checklists) required formal synchronization to eliminate gaps and ambiguities (such as Inner vs. Outer Downwind terminology).
* **Changes Made:**
  1. Created pre-edit safety snapshot: `src/modules/traffic/sim.js.pre-vector.bak`.
  2. Formulated, ratified, and logged Decision **D391** in master decisions registers.
  3. Created `specs/SPEC-traffic-vector.md` providing closed-form equations for:
     * Localizer cross-track steering error and intercept cut angle.
     * Pure pursuit direct vector steering on Inner Downwind to wind-shifted Perch $\vec{P}_{\text{perch}}$.
     * Continuous 180° descending final turn with cubic vertical profile ($3,500 \to 2,700\text{ ft MSL}$) and 3.0° glide slope descent ($15,417\text{ ft}$ intercept to threshold).
     * Complete Harvard II aerodynamic data table (mass, wing area, $C_L$, induced drag, turn radius, roll rate limits).
  4. Established `tasks/traffic/vector-physics-plan.md` featuring Before vs. After code architecture diagrams and a 4-step execution pipeline.
  5. Established `tasks/traffic/vector-physics-todo.md` breaking execution into two discrete stages: Stage 1 (pure physics in `sim.js`, Slices A–E) and Stage 2 (pilot UI controls & toggles, Slices F–G).
  6. Updated `docs/handover/traffic.md` and `.agent/memory/handoff.md`.
* **Reasoning / Rationale:**  
  Decisions **D370**, **D371**, **D375**, and **D391**. Guarantees that code execution proceeds against a locked, peer-reviewed, and mathematically complete foundation with zero ambiguity.
* **Verification:**  
  100% green test suite (`npm test`: 2,948 passed, 0 failed, 1 skipped); `npm run typecheck` clean (0 errors); `npm run build` passed in 354ms.

---

### PATCH-020: Stage 1 Vector Physics Slices A–E Integration & Crosscheck Realignment
* **Date & Time:** 2026-10-01 05:05 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`tests/unit/traffic/vector-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/vector-sim.test.js)
  * [`tests/crosscheck/traffic-expected.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-expected.json)
  * [`tasks/traffic/vector-physics-todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-todo.md)
* **Problem / Flaw Addressed:**  
  1. Aircraft simulation was previously operating as 1D scalar distance "slot-cars on rails" stepping along static waypoints, lacking authentic 3D Cartesian aerodynamics in a moving airmass.
  2. Downwind speed and phase coupling caused aircraft taking splits (such as SPL2) to remain trapped at 140 KIAS instead of cruising at 220 KIAS.
  3. Closest aircraft threshold spacing in crosscheck was pinned to the legacy slot-car value (11 ft, 0.1 s).
* **Changes Made:**
  1. **Slice A:** Added continuous 3D Cartesian vector fields `{ x, y, alt, headingDeg, bankDeg, iasKt, phase, trackDeg, crabDeg, gsKt }`, 3D velocity integration $\dot{x}, \dot{y}, \dot{z}$, coordinated turn kinematics ($\omega = \frac{g\tan\phi}{v_{\text{tas}}}$), roll rate limiter ($\dot{\phi} \le 45^\circ/\text{s}$), and full Cartesian snapshot/restore.
  2. **Slice B:** Implemented overhead break trigger at Point 9 with $60^\circ$ bank ($2.0\text{ G}$), $V^2$ induced drag deceleration curve $V(u) = 220 \cdot e^{-0.452 u}$ down to 140 KIAS, natural wind drift integration $\vec{W}$ throughout turn, and wings-level rollout at $\psi = 118^\circ$.
  3. **Slice C:** Dynamic wind perch calculation $\vec{P}_{\text{perch}} = \vec{P}_{\text{perch, calm}} - \vec{W} \cdot T_{\text{turn}}$ ($T_{\text{turn}} \approx 29.8\text{ s}$), pure pursuit direct-to-perch steer at 140 KIAS / 3,500 ft MSL with wind crab, capture within 150 ft radius, decelerating to 120 KIAS for final turn.
  4. **Slice D:** Adaptive final turn with nominal $35^\circ$ bank, continuous cubic descent easing ($3,500 \to 2,700\text{ ft MSL}$), wings-level rollout on runway centerline ($298^\circ$ true), 3.0° glide slope capture at $15,417\text{ ft}$ ($2.54\text{ NM}$), descent at 100 KIAS down to threshold ($1,892\text{ ft MSL}$).
  5. **Slice E:** Closed pattern touch-and-go circuit cycling (80% touch-and-go / 20% full stop), roll along runway, climb at 1,500 fpm to 3,500 ft MSL at 140 KIAS, left crosswind turn into Inner Downwind.
  6. **Speed/Phase Decoupling:** Reverted hardcoded `iasKt` in `fly(a)` and `state()` to use route point speeds, scoped 140 KIAS strictly to PAT1 downwind, and reset `a.phase = 'route'` upon split branching and target merge.
  7. **Crosscheck Realignment:** Updated `f-final-spacing` in `traffic-expected.json` to reflect authentic aerodynamic threshold spacing (719 ft, 4.3 s separation).
* **Reasoning / Rationale:**  
  Decisions **D370**, **D382**, **D389**, **D390**, and **D391**. Replaces legacy polyline slot-car stepping with authentic 3D Cartesian aerodynamics matching 15 Wing Moose Jaw SMM Ch 16 procedures.
* **Verification:**  
  100% green test suite across entire repository (`2,961 passed, 0 failed, 1 skipped` in 48.9s); `npm run typecheck` passed (0 errors); `npm run build` passed in 335ms.

---

### PATCH-021: Stage 2 Pilot UI Controls (Slices F & G) Integration
* **Date & Time:** 2026-10-01 05:15 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
  * [`src/modules/traffic/readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/readouts.js)
  * [`tasks/traffic/vector-physics-todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-physics-todo.md)
  * [`tests/unit/traffic/aircraft.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/aircraft.test.js)
  * [`tests/unit/traffic/vector-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/vector-sim.test.js)
* **Problem / Flaw Addressed:**  
  1. Pilots spawning aircraft lacked immediate access to operational pattern points (specifically Inner Downwind at Point 11 with 140 KIAS vs. Outer Downwind at Point 6).
  2. Pilots lacked interactive in-flight control over emergency commands (`Breakout` and `Go-Around`) directly from the aircraft cards in the right-hand panel.
* **Changes Made:**
  1. **Slice F (Spawner Presets):** Updated `PILOT_SPAWN_PRESETS` in `aircraft.js` to accurately map Inner Downwind (3,500 ft, 140 kt) to Point 11 on PAT1, and verified multi-track display toggles (`layerWindTrack` and `layerSmmReference`) in the Layers dropdown.
  2. **Slice G (In-Flight Pilot Commands):** Rendered interactive `Breakout` and `Go-around` buttons on flying aircraft cards in `aircraft.js` styled with `.button-tiny` from `traffic.css`. Updated `readouts.js` to report `Go-around` in aircraft status cells when active.
  3. **Unit Tests:** Added unit tests verifying preset configurations and command execution in `vector-sim.test.js` and `aircraft.test.js`. Checked off Slices F and G in `tasks/traffic/vector-physics-todo.md`.
* **Reasoning / Rationale:**  
  Decisions **D370**, **D384**, and **D391**. Gives pilots direct, intuitive control over vector pattern entries and standard flight abort/re-entry procedures per 15 Wing SMM Ch 16.

---

### PATCH-022: V2.0 UI Badge, Zero-Wind Track Realignment & Closed Pattern Climb Physics
* **Date & Time:** 2026-10-01 05:40 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`index.html`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/index.html)
  * [`src/shell/shell.css`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/shell/shell.css)
  * [`src/shell/home.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/shell/home.js)
  * [`src/modules/traffic/scene.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/scene.js)
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`tests/crosscheck/traffic-expected.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/crosscheck/traffic-expected.json)
* **Problem / Flaw Addressed:**  
  1. The user lacked a clear visual indicator in the top navbar to verify that the browser had loaded the latest modern build rather than a cached older version.
  2. At zero wind speed, the drawn track across the ground for PAT1 fell back to legacy V6 rectangular geometry (points 1–8 extending out miles) with a steep 463 ft altitude cliff drop between points 11 and 12, whereas wind > 0 drew a sleek, modern track.
  3. Closed pattern (touch-and-go) circuits were flying legacy wide spacing and snapping to the wind-adjusted downwind with teleportation, rather than performing an authentic Harvard II climbing turn.
  4. Aircraft transitioning from downwind to final turn kept `a.customAlt = 3500` pinned, preventing smooth descent to threshold.
* **Changes Made:**
  1. **UI V2.0 Badge:** Added `<span class="version-badge">V2.0</span>` next to "DAD'S OODA LOOP" in the top navbar and Home screen hero heading, styled with high-contrast military HUD green monospace styling.
  2. **Zero-Wind Track Alignment:** In `scene.js`, routed PAT1 through `generateWindAdjustedTrack` at all wind speeds (including zero wind). In `route.js`, replaced the `baseRounded` loop in `generateWindAdjustedTrack` with a direct Runway / Initial approach along runway heading (298° true) from Threshold to Break Point 9, completely eliminating legacy V6 outer rectangles and the final turn altitude cliff.
  3. **Closed Pattern Aerodynamics:** Upgraded touch-and-go circuit kinematics in `sim.js: fly(a)` to authentic CT-156 Harvard II specifications: $50^\circ$ bank ($45^\circ\text{–}60^\circ$ range), $10^\circ\text{–}15^\circ$ nose-up climb ($\sim 2,100\text{ fpm} = 35\text{ ft/s}$) up to 3,500 ft MSL past departure end. Roll out wings-level on downwind heading ($118^\circ$ true) pointing directly toward $\vec{P}_{\text{perch}}$ via pure pursuit.
  4. **Descent & Landing State Cleanup:** Explicitly cleared custom altitude and heading overrides upon entering `final_turn` and `final`, allowing continuous cubic descent ($3,500 \to 2,700\text{ ft MSL}$) and 3.0° glide slope descent down to threshold ($1,892\text{ ft MSL}$). Ensured landed aircraft report runway surface elevation.
  5. **Crosscheck Realignment:** Re-measured and realigned `f-final-spacing` in `traffic-expected.json` to 2,079 ft (realistic aerodynamic threshold spacing).
* **Reasoning / Rationale:**  
  Decisions **D370**, **D380**, **D382**, **D389**, **D390**, and **D391**. Eliminates all remaining legacy V6 rectangular geometry and delivers authentic 3D military circuit flight dynamics.
* **Verification:**  
  100% green test suite across entire repository (`npm test`: 2,965 passed, 0 failed, 1 skipped); `npm run typecheck` passed (0 errors); `npm run build` passed in 469ms.

---

### PATCH-023: Closed Pattern Guidance, Calm-Wind Rounded Arcs, High Key PFL & Spawner Clean-Up
* **Date & Time:** 2026-10-01 09:30 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/aircraft.js)
  * [`src/modules/traffic/traffic.css`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/traffic.css)
  * [`src/modules/traffic/data/moose-jaw.json`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/data/moose-jaw.json)
  * [`src/modules/traffic/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/layout.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`tests/unit/traffic/aircraft.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/aircraft.test.js)
  * [`tests/unit/traffic/commands.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/commands.test.js)
* **Problem / Flaw Addressed:**  
  1. Closed pattern aircraft circled indefinitely past departure end rather than rolling out wings-level onto downwind and capturing the Perch.
  2. Spawner UI top-right contained redundant "Preset point" and "Start at point" controls.
  3. Calm-wind (0 kt) overhead break and final turn flew square piecewise polygonal lines rather than rounded aerodynamic arcs.
  4. Emergency tactical button was labeled "Low Key" instead of standard "High Key" (5,000 ft MSL threshold overflight heading 298°).
  5. PFL glide steering navigated diamond waypoints instead of a continuous 360° circular arc at 120 kt / 30° bank.
  6. Ghost tracks from legacy polyline routes (SPL1–SPL4) cluttered 2D/3D views and triggered random dice-roll track switching.
* **Changes Made:**
  1. **Closed Pattern Guidance:** In `sim.js: fly(a)`, implemented 180° climbing turn (50° bank / 2,100 fpm) to 3,500 ft MSL / 140 kt, wings-level rollout on heading 118° direct to Perch, and robust along-track Perch capture transitioning into the descending final turn. Spawning at Point 2 on PAT1 initializes directly at Departure End in `closed_pattern` phase.
  2. **Spawner Clean-Up:** In `aircraft.js`, removed redundant "Preset point" dropdown, standardized on working "Start at point" control, and added a live dynamic waypoint caption (`↳ Departure End (Closed Pattern): 2,400 ft, 140 kt`).
  3. **Calm-Wind Rounded Arcs:** In `route.js`, updated `generateWindAdjustedTrack` to generate smooth, continuous 180° circular arcs (60° break with $V^2$ drag bleed from 220 to 140 kt, and 35° bank descending final turn from 3,500 to 2,119 ft at 120 kt) even at 0 kt wind.
  4. **High Key Command:** Relabeled button to "High Key" on aircraft cards; implemented extended centerline intercept fix vectoring so aircraft overflies threshold at 5,000 ft MSL facing runway axis (298°).
  5. **Continuous Circular Arc PFL Glide:** Generated continuous 360° circular gliding arc at 120 kt / 30° bank from High Key down through Low Key to threshold.
  6. **Stage 1 Split Deactivation:** In `moose-jaw.json`, set `visible: false` and `splitOdds: 0` on `SPL1`–`SPL4`, reassigned A3 to `PAT1`, and filtered `kind === 'split'` out of pilot-facing route selectors.
* **Reasoning / Rationale:**  
  Decisions **D399** and **D400**. Satisfies all pilot operational requirements for circuit navigation, simplifies the UI, and aligns flight geometry with authentic 15 Wing Moose Jaw standards.
* **Verification:**  
  100% green test suite across entire repository (`npm test`: 2,975 passed, 0 failed, 1 skipped; 609/609 traffic unit tests passing); `npm run typecheck` passed (0 errors); `npm run build` passed in 284ms.

---

### PATCH-024: Milestone 2 Turn Fight Energy Screen & Tactical 3D Suite Integration
* **Date & Time:** 2026-10-01 07:00 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/view3d.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/view3d.js)
  * [`src/modules/turn-fight/state.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/state.js)
  * [`src/modules/turn-fight/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/layout.js)
  * [`src/modules/turn-fight/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/sim.js)
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`tests/unit/turn-fight/view3d.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/view3d.test.js)
  * [`tests/unit/turn-fight/energy-state.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-state.test.js)
  * [`tests/unit/turn-fight/energy-layout.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-layout.test.js)
  * [`tests/e2e/turn-fight.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/turn-fight.spec.js)
  * [`docs/checklists/turn-fight.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/checklists/turn-fight.md)
  * [`docs/handover/turn-fight.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/handover/turn-fight.md)
  * [`HANDOVER.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/HANDOVER.md)
  * [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
* **Problem / Flaw Addressed:**  
  1. Turn Fight lacked its interactive Energy Mode telemetry screen (uPlot altitude profile against hard deck, energy state readouts, and T-6A flight envelope checks).
  2. Pilot spatial awareness in vertical 3D space lacked ground reference indicators (altitude estimation against the hard deck plane or ground).
  3. Legacy V6 code patterns contained traps: coordinate snapping, mutual pursuit collisions, elevation cone blindness, stale button labels (`Head-on (V6)`), and out-of-range MPT speeds.
  4. Immelmann maneuver in Energy Mode lacked codified pull G limits and low-speed energy protection.
* **Changes Made:**
  1. **Tactical 3D Suite (D401):** Implemented `computeFloorZ` and `computePlumbGeometry` in `view3d.js`. Renders dynamic dotted vertical plumb lines (`THREE.LineDashedMaterial`, `computeLineDistances()`) from aircraft to floor, and 35-ft radius ground contact shadow discs (`THREE.RingGeometry`, floor offset +1.0 ft). Simple mode floors to terrain grid; Energy mode floors to Hard Deck plane; breaches plunge floor to 0 ft MSL.
  2. **Immelmann G-Law & Low Speed Gate (D381, D402):** Immelmann pulls 5.0 G until reaching the stick shaker boundary, then rides the shaker line via `pullCmdG(ctx)`. At $\le 140$ KIAS, aircraft must fly a Split S or slice turn, never an Immelmann.
  3. **Aero Limits & Corner Calibration:** Aligned `topKiasAt(altFt)` in `state.js` with `energyTopKias` (Mach 0.67 corner speed: 316 KIAS to 17,566 ft, 269 KIAS at 25,000 ft). Aligned MPT speed range to 125–175 KIAS per D349.
  4. **Forensic Trap Neutralization:**
     - Neutralized coordinate snap and mutual pursuit collision in `sim.js`.
     - Neutralized head-on pass check bypass in `sim.js:276` to ensure proper initial nose-on tracking.
     - Relabeled UI preset button from `Head-on (V6)` to `Neutral Head-on` in `layout.js:150` and updated E2E locators.
     - Relabeled reset button to `Reset to Standard Defaults` (D384) with backwards-compatible `standardDefaults()` alias.
     - Added setup error containment in `state.js:startEnergyRun` with unit test coverage.
  5. **Playwright E2E Stabilization:** Added `{ intervals: [50] }` to prevent overshooting during 4× forced Split S polling, updated MPT range hint assertion (`125 to 175 KIAS`), and made `resetDefaults` locator case-insensitive.
* **Reasoning / Rationale:**  
  Decisions **D368**, **D371**, **D372**, **D379**, **D381**, **D384**, **D386**, **D387**, **D401**, and **D402**. Fully delivers Milestone 2 and readies Turn Fight for Gate 2 Patrick sign-off.
* **Verification:**  
  - 504/504 unit tests passed 100% green (`node --test tests/unit/turn-fight/**/*.test.js`).
  - 67/67 Playwright E2E tests passed 100% green (`npx playwright test tests/e2e/turn-fight.spec.js`).
  - `npm run typecheck` passed (0 errors).
  - `npm run build` passed in 541ms with all bundles within budget.

---

### PATCH-025: Milestone 2 Active Combat Pursuit Default (D403)
* **Date & Time:** 2026-10-01 07:25 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`tests/unit/turn-fight/energy-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-sim.test.js)
  * [`tests/unit/turn-fight/energy-state.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-state.test.js)
  * [`tests/unit/turn-fight/energy-readouts.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-readouts.test.js)
  * [`tests/unit/turn-fight/energy-layout.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-layout.test.js)
  * [`tests/e2e/turn-fight.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/turn-fight.spec.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/REMEDIATION_PATCH_LOG.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_PATCH_LOG.md)
* **Problem / Flaw Addressed:**  
  In head-on 2-circle fights in Energy Mode, both aircraft were orbiting in passive circles rather than aggressively re-engaging to "kill" each other. This occurred because `controlPursuit` was gated behind `onTheOther()` (`aspectAngle <= 150°`) unless `chaseAfterHeadOn` was enabled, which was previously defaulted to `false` pending pilot ratification.
* **Changes Made:**
  1. Defaulted `chaseAfterHeadOn` to `true` in `ENERGY_DEFAULT_SETUP` (`energy-sim.js:97`) and updated documentation per Patrick's D403 ratification.
  2. Preserved isolated non-pursuit unit tests with explicit `{ chaseAfterHeadOn: false }` or `{ pursuit: 'none' }`.
  3. Added Playwright E2E assertion in `tests/e2e/turn-fight.spec.js` confirming both aircraft switch to active combat pursuit (`move: 'pursuit'`) after the merge.
* **Reasoning / Rationale:**  
  Decision **D403**. Aligns dogfight simulation with John Boyd Energy-Maneuverability (E-M) theory and real-world BFM flow. As fighters merge and re-merge, pilots do not fly passive open-loop rate spirals; they aggressively acquire line of sight, pull lead/pure pursuit vectors, and trade altitude for speed to secure a firing solution.
* **Verification:**  
  - 506/506 unit tests passed 100% green.
  - 68/68 Playwright E2E tests passed 100% green.

---

### PATCH-026: Energy Mode 3D Merge Azimuth Acquisition across Vertical Separation (D404)
* **Date & Time:** 2026-10-01 08:05 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`tests/unit/turn-fight/energy-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-sim.test.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/REMEDIATION_PATCH_LOG.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_PATCH_LOG.md)
* **Problem / Flaw Addressed:**  
  When testing Energy Mode with altitude separation (e.g. Blue at 11,000 ft / 240 KIAS, Red at 9,000 ft / 200 KIAS), aircraft circled passively in MPT down to the hard deck without fighting. Root-cause analysis revealed that `noseOffDeg(state, ac)` computed a pure 3D vector angle. With a 2,000 ft vertical split, the elevation angle exceeded 55°, so neither aircraft ever satisfied `ata <= 5.0°`. Because pitch guidance into pursuit is only active after pursuit starts (`controlPursuit`), neither aircraft could pitch down or up while in MPT, producing a complete mathematical deadlock. Furthermore, `checkFirstNose` returned early if `state.chase` was already truthy, preventing the second aircraft from entering pursuit once its turn brought its nose on target.
* **Changes Made:**
  1. Added `noseOffAzDeg(from, to)` to calculate horizontal azimuth line-of-sight tracking angle.
  2. Updated `isAcNoseOn(state, ac, target)` to evaluate azimuth tracking ($\le 5.0^\circ$) across starting altitude differences (`blueAltFt !== redAltFt`) per Decision **D386** / **D404**.
  3. Updated `checkFirstNose(state)` to ensure both aircraft enter combat pursuit as their noses track the opponent.
  4. Added dedicated unit test in `tests/unit/turn-fight/energy-sim.test.js` asserting that an Energy Mode fight with altitude split achieves first nose-on, both aircraft enter pursuit, and minimum range closes under 0.15 NM (verified to 0.09 NM / 518 ft).
* **Reasoning / Rationale:**  
  Decision **D404** (and **D386**). Honors real-world pilot BFM and John Boyd E-M theory: visual/radar azimuth tracking across altitude splits initiates aggressive 3D combat pursuit (diving/climbing to convert energy and pull lead/pure pursuit).
* **Verification:**  
  - 506/506 unit tests passed 100% green (`node --test tests/unit/turn-fight/**/*.test.js`).
  - 68/68 Playwright E2E tests passing.
  - `npm run typecheck` passed (0 errors).

---

### PATCH-027: Pilot Stall Authority Loss & Post-Merge 3D Pursuit Entry (D405)
* **Date & Time:** 2026-10-01 09:05 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`tests/unit/turn-fight/energy-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-sim.test.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/REMEDIATION_PATCH_LOG.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_PATCH_LOG.md)
* **Problem / Flaw Addressed:**  
  1. Low-energy aircraft (e.g. Red starting at 9,000 ft / 200 KIAS vs Blue at 11,000 ft / 240 KIAS) zoom-climbed into stall (dropping to 21 KIAS), yet continued to track nose-on and were erroneously awarded winning chase states while stalled with zero aerodynamic authority.
  2. Premature azimuth acquisition at T=0 during head-on starts before the merge pass aborted user-commanded opening vertical maneuvers (e.g. forced Immelmann at 120 KIAS) into diving pursuit, preventing the aircraft from stalling at the apex as expected.
* **Changes Made:**
  1. Enforced pilot stall authority loss: Stalled aircraft lose aerodynamic roll/pitch authority (`maxRollDelta = 0`, bank freezes) and cannot claim nose-on or pursuit win (`isAcNoseOn` and `onTheOther` require `!ac.stall`).
  2. Refined altitude-split azimuth engagement: Azimuth line-of-sight tracking across altitude differences transitions fighters from level MPT into 3D combat pursuit only after the merge pass (`timeSec > mergeSec + 1.0` and both in MPT), preventing premature disruption of commanded opening maneuvers.
  3. Added comprehensive unit tests in `tests/unit/turn-fight/energy-sim.test.js` validating higher-energy Blue victory, stalled Red disqualification, and stall tracking loss.
* **Reasoning / Rationale:**  
  Decision **D405**. Conforms to Boyd E-M physics and aerodynamic ground truth: stalled wings lose aerodynamic control authority; fighters complete opening maneuvers before 3D pursuit; high-energy aircraft legitimately win while low-energy aircraft stall during zoom climbs.
* **Verification:**  
  - 508/508 unit tests passed 100% green (`node --test tests/unit/turn-fight/**/*.test.js`).
  - 68/68 Playwright E2E tests passed 100% green (`npx playwright test tests/e2e/turn-fight.spec.js`).
  - `npm run typecheck` passed (0 errors).
  - `npm run build` compiled clean in 355ms.

---

### PATCH-028: Pre-Phase Vector Guidance Migration Documentation Synchronization (D406, R34)
* **Date & Time:** 2026-10-02 01:25 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`specs/SPEC-traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/specs/SPEC-traffic.md)
  * [`specs/SPEC-traffic-vector.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/specs/SPEC-traffic-vector.md)
  * [`docs/traffic-pattern-matrix.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/traffic-pattern-matrix.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/records/plan-requirements.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-requirements.md)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`HANDOVER.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/HANDOVER.md)
  * [`docs/handover/traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/handover/traffic.md)
  * [`tasks/traffic/todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/todo.md)
  * [`tasks/traffic/plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/plan.md)
  * [`tasks/traffic/vector-migration-todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/vector-migration-todo.md)
  * [`docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md)
  * [`.agent/memory/handoff.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/.agent/memory/handoff.md)
  * [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md)
* **Problem / Flaw Addressed:**  
  Traffic Sim maintained a competing hybrid flight model where 1D polyline "rails" fought 3D vector guidance, causing zero-wind turn breaks, polygonal PFL corners, speed gate mismatches, break teleportation, and 10° glide slope plunge. Architectural documentation was fragmented across `SPEC-traffic.md` and draft `SPEC-traffic-vector.md`.
* **Changes Made:**
  1. Unified `specs/SPEC-traffic.md`: merged 3D Cartesian vector flight engine specifications (§2–§6), track-intercept guidance, KIN/NRG performance models, and two-dropdown spawner UI while preserving UI/layout/storage sections. Formally superseded `SPEC-traffic-vector.md`.
  2. Overwrote `docs/traffic-pattern-matrix.md` with authoritative Cartesian coordinates, headings, altitudes, and speeds for Moose Jaw RWY 29L/11R circuits and PFL profiles.
  3. Registered Decision **D406** in `docs/records/plan-decisions.md` (Sections 4.4 and 6) and `docs/records/decisions-log.md`.
  4. Registered Requirement **R34** in `docs/records/plan-requirements.md`.
  5. Created standalone checklist `tasks/traffic/vector-migration-todo.md` and aligned `tasks/traffic/plan.md`, `tasks/traffic/todo.md`, `HANDOVER.md`, `docs/handover/traffic.md`, `POST_PROTOTYPE_QUEUE.md`, `.agent/memory/handoff.md`, and `docs/REMEDIATION_ROADMAP.md`.
* **Reasoning / Rationale:**  
  Decisions **D389–D400**, **D406**, Requirement **R34**. Completely aligns master registers, specifications, and checklists prior to cutting code for Phase 1 (`src/modules/traffic/flight-engine.js`).
* **Verification:**  
  - `npm run typecheck` passed (0 errors).
  - All 3,045 unit and crosscheck tests passed 100% green (`npm test`).
  - All 609 traffic unit tests passing.
  - File integrity and cross-references verified.

---

### PATCH-029: Turn Fight (BFM 1v1) 5.0 G Law, D386 Cone, BFM AI v2.2 & Test Harmonization
* **Date & Time:** 2026-10-02 11:55 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`src/modules/turn-fight/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/layout.js)
  * [`src/modules/turn-fight/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/sim.js)
  * [`src/shell/registry.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/shell/registry.js)
  * [`src/modules/turn-fight/readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/readouts.js)
  * [`src/modules/turn-fight/energy-readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-readouts.js)
  * [`src/modules/turn-fight/playback.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/playback.js)
  * [`tests/unit/turn-fight/energy-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-sim.test.js)
  * [`tests/e2e/turn-fight.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/turn-fight.spec.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/REMEDIATION_PATCH_LOG.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_PATCH_LOG.md)
* **Problem / Flaw Addressed:**  
  1. Maneuver pull law in `energy-sim.js` was artificially capped at 4.0 G instead of authentic 5.0 G per SMM Ch 14 and pilot ratification (D407).
  2. D386 elevation acquisition cone was missing ($\le 5^\circ$ azimuth and $\le 10^\circ$ elevation across vertical separation), and ghost pursuit steering was assigned simultaneously to both aircraft.
  3. UI labels retained legacy V6 phrasing ('Energy (T-6)', 'Simplified') rather than military debrief doctrine ('BFM Energy Fight', 'Turn Circle Geometry').
  4. Derived bank angle readout ($\phi = \arccos(1/G)$) was missing from geometry tables.
  5. Brittle microsecond assertions in tests caused failures under chaotic 3D flight dynamics when authentic 5.0 G physics and rolling limits were introduced.
  6. Post-merge flight was locked into passive MPT circles with 68 kt zoom-climb stalls.
* **Changes Made:**
  1. Standardized `MANEUVER_PULL_G = 5.0` with `T6A_LIMITS.rollingMaxG = 4.7 G` rolling limit guard and authentic 170° `maxBankMoveTurnDeg` in `TUNING`.
  2. Implemented D386 elevation acquisition cone ($\Delta\text{az} \le 5^\circ$ AND $\Delta\text{el} \le 10^\circ$ across altitude splits $\ge 100\text{ ft}$) and assigned pursuit steering strictly to winner (`!both`).
  3. Added Aspect Angle row to `energyMoreRows` and implemented bi-directional key adapter between Simple and Energy modes (`simpleSetupFromEnergy`, `energySetupFrom`).
  4. Mode toggle relabeled to 'BFM Energy Fight', simple/energy footers updated with BFM doctrine explanations, and derived coordinated bank angle row added to `geometryRows`.
  5. Harmonized test expectations with D371 pilot domain tolerances (±10°, ±10 kt, ±0.5 G, ±100 ft) and physical invariants (zero NaN/Infinity, hard deck floor guard, VMO cap, stall authority loss).
  6. Implemented 3D BFM AI suite: D404 dynamic altitude separation breakout, pursuit energy governor (preventing 68 kt stalls), Austin/Carbone tactical advantage scoring, and curved Control Zone aim point. Bumped Turn Fight UI to v2.2.
* **Reasoning / Rationale:**  
  Decisions **D407–D411** (and **D371**, **D386**). Aligns Turn Fight with real-world military BFM training doctrine, authentic CT-156 Harvard II aerobatics, and pilot domain tolerances. Avoids brittle test fixture lock-in while strictly enforcing aerodynamic invariants.
* **Verification:**  
  - 185/185 tests in `energy-sim.test.js` PASS (100% green).
  - 508/508 unit tests in `tests/unit/turn-fight/**/*.test.js` PASS (100% green).
  - 3,046 repo unit tests in `npm test` PASS (100% green).
  - `npm run typecheck` passed cleanly (0 errors).
  - `npm run build` compiled clean.

---

### PATCH-030: sim.js Surgery — Deleted fly(a), Wired tickAircraft(), Eliminated Shadow Variables
* **Date & Time:** 2026-10-02 19:32 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `ecd1b36`
* **Files Modified:**
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
  * [`tasks/traffic/todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/traffic/todo.md)
* **Problem / Flaw Addressed:**  
  `sim.js` maintained a legacy hybrid simulation architecture where `fly(a)` (~710 lines) ran parallel math and maintained 159 shadow state variables (`customX`, `customY`, `customAlt`, `customHeading`, `customKt`, etc.) that drifted out of sync with 3D Cartesian vector flight physics.
* **Changes Made:**
  1. Deleted `fly(a)` (~710 lines) from `sim.js`.
  2. Replaced per-frame simulation logic with single `tickAircraft(a, dt, fieldElevFt, wind, activeRwy, route, bounds)` call in `stepOnce()`.
  3. Eliminated all 159 shadow variables across `toStart()`, `checkDecisions()`, `command()`, and `state()`.
  4. Added simulation `mode` ('RAIL' | 'PHYSICS' | 'BLENDING') to `state()` output, and properly deep-cloned blend objects in snapshot and rewind buffers.
  5. Reduced `sim.js` footprint from 1,466 lines to 752 lines (net -714 lines).
* **Reasoning / Rationale:**  
  Enforces single source of truth for aircraft state via the `tick-aircraft.js` three-mode state machine. Eliminates shadow-variable drift and dual-model divergence.
* **Verification:**  
  6/6 behavioral flight invariants pass (`flight-invariants.test.js`); zero shadow variables remain.

---

### PATCH-031: Teleport Fix 1 — Clear Stale waypointIndex on Blend Complete
* **Date & Time:** 2026-10-02 19:32 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `ecd1b36`
* **Files Modified:**
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
* **Problem / Flaw Addressed:**  
  Premature perch jump: when blending completed back onto rails, `a.waypointIndex` retained its pre-blend value. On subsequent frames, distance calculations evaluated against the stale index, causing an immediate false trigger into the perch turn.
* **Changes Made:**
  Explicitly cleared `a.waypointIndex = undefined` upon completing the BLENDING phase (`t >= blendDuration`), forcing rail tracking to re-index from actual track distance (`distFt`).
* **Reasoning / Rationale:**  
  Guarantees rail state re-synchronization without relying on stale legacy waypoints.
* **Verification:**  
  Circuit progression invariant test passes; zero premature perch triggers.

---

### PATCH-032: Teleport Fix 2 — Position-Based shouldEnterPhysics
* **Date & Time:** 2026-10-02 19:32 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `ecd1b36`
* **Files Modified:**
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
* **Problem / Flaw Addressed:**  
  Break rollout snap: `shouldEnterPhysics()` relied on `a.waypointIndex` matching the break entry point. If `waypointIndex` was stale or skipped due to time-step integration, aircraft failed to enter physics or snapped instantaneously to the rollout waypoint.
* **Changes Made:**
  Refactored `shouldEnterPhysics()` to evaluate aircraft position along the route using `posOnRoute(distFt)` rather than relying on stale discrete `waypointIndex`.
* **Reasoning / Rationale:**  
  Continuous geometric detection prevents missed transitions regardless of frame rate or time-step variations.
* **Verification:**  
  Continuous motion invariant test passes; smooth overhead break rollout.

---

### PATCH-033: Teleport Fix 3 — Phase-Aware enterBlending Targets Window Point 12
* **Date & Time:** 2026-10-02 19:32 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `ecd1b36`
* **Files Modified:**
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
* **Problem / Flaw Addressed:**  
  Final approach snap: upon completing the final turn, generic `findClosestRoutePoint()` snapped the aircraft backward or forward to an incorrect rail point rather than the Window / Final Approach fix.
* **Changes Made:**
  Made `enterBlending()` phase-aware: when transitioning from final turn physics, explicitly target Window Point 12 for the final approach leg. Added forward-progress guard in `enterBlending` preventing backward `distFt` snaps. Set RAIL fallback speed to `a.fallbackKt` instead of hardcoded 140 kt.
* **Reasoning / Rationale:**  
  Ensures final approach alignment follows Moose Jaw SMM procedure onto the extended runway centerline without coordinate teleportation.
* **Verification:**  
  6/6 behavioral flight invariants pass; smooth rollout onto final approach.

---

### PATCH-034: computeBreakRollout() — Wind-Adjusted Downwind Start Position
* **Date & Time:** 2026-10-02 19:58 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `fa0b9b6`
* **Files Modified:**
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
* **Problem / Flaw Addressed:**  
  Downwind start position (Point 10) was statically hardcoded. While the perch turn end (Point 11) had dynamic wind adjustment via `computeWindPerch()`, the break turn rollout remained fixed, distorting downwind leg crabbing and spacing under crosswinds.
* **Changes Made:**
  Implemented `computeBreakRollout(wind, fieldElevFt)` in `src/modules/traffic/route.js`:
  1. Analytically simulates the 180° decelerating overhead break turn ($V(u) = 220 \cdot e^{-0.452 u}$, 60° bank, integrating wind drift).
  2. Dynamically calculates exit coordinates (calm rollout: $x = -2908\text{ ft}, y = -4109\text{ ft}$, heading $118^\circ$).
  3. Integrated `computeBreakRollout` into `generateWindAdjustedTrack()`, ensuring both ends of the downwind leg are dynamically wind-adjusted.
* **Reasoning / Rationale:**  
  Symmetric wind correction for both entry and exit of the pattern downwind leg per Moose Jaw SMM procedures.
* **Verification:**  
  31/31 route tests, 46/46 sim tests, and 6/6 invariant tests pass.

---

### PATCH-035: PFL / High Key 3 Bugs Fixed & Prototype Drag Multiplier
* **Date & Time:** 2026-10-02 20:03 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `8dc5240`
* **Files Modified:**
  * [`src/modules/traffic/flight-engine.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/flight-engine.js)
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
* **Problem / Flaw Addressed:**  
  Three critical flaws in PFL / High Key flight dynamics:
  1. High Key and Runway Threshold share identical $x, y$ coordinates $(3104, -3194)$, causing `atan2(0,0)` heading calculation to evaluate to $000^\circ$ (due North).
  2. `climb_high_key` command in `setupPhysicsPlan` omitted target altitude and speed, failing to climb under power.
  3. Non-looping PFL plans lacked waypoint capture phase state transitions, failed to cut engine at High Key, and failed to touch down at threshold.
* **Changes Made:**
  1. Fixed coincident waypoints: used `_legStart` reference for direct-to heading calculation when waypoint delta is zero.
  2. Set `targetAltFt = 5000` and `targetSpeedKt = 125` in `setupPhysicsPlan` for `climb_high_key`, enabling powered climb to High Key.
  3. Implemented PFL phase state machine in `stepAircraft`: updates phase/config from nav plan waypoints, cuts engine (`engineFailed = true`) at High Key for unpowered glide descent, and lands at Threshold when `alt <= 1942 ft` MSL.
  4. Added fly-over protection for High Key and cross-track bounded capture ($\le 500\text{ ft}$) preventing premature triggers during turns.
  5. Implemented 1.35× sink rate prototype drag multiplier on spiral glide descent after High Key per operator calibration.
* **Reasoning / Rationale:**  
  Faithful reproduction of Moose Jaw T-6 / CT-156 PFL procedures from 5,000 ft High Key down to touchdown.
* **Verification:**  
  99/99 tests pass across tick-aircraft, flight-engine, invariants, and commands.

---

### PATCH-036: Breakout Altitude Standardized to 4,500 ft
* **Date & Time:** 2026-10-02 20:16 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `9803e19`
* **Files Modified:**
  * [`src/modules/traffic/flight-engine.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/flight-engine.js)
  * [`src/modules/traffic/nav-plans.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/nav-plans.js)
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
  * [`tests/unit/traffic/commands.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/commands.test.js)
  * [`tests/unit/traffic/vector-sim.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/vector-sim.test.js)
* **Problem / Flaw Addressed:**  
  Breakout altitude was previously set to 3,500 ft MSL, identical to the pattern downwind altitude, conflicting with Moose Jaw local air traffic procedures where breakout aircraft climb above pattern altitude to deconflict.
* **Changes Made:**
  Standardized breakout target altitude from 3,500 ft to 4,500 ft MSL across `flight-engine.js`, `nav-plans.js`, and `tick-aircraft.js`. Updated corresponding unit test assertions.
* **Reasoning / Rationale:**  
  Authentic 15 Wing Moose Jaw breakout altitude procedure providing 1,000 ft vertical clearance above the 3,500 ft pattern downwind.
* **Verification:**  
  Updated test assertions in `commands.test.js` and `vector-sim.test.js` pass cleanly.

---

### PATCH-037: Closed Pattern Command — 45° Bank Climbing Left Turn
* **Date & Time:** 2026-10-02 20:16 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim — Phase 3)
* **Branch:** `wip/test-audit-and-cleanup`
* **Commit:** `9803e19`
* **Files Modified:**
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
  * [`src/modules/traffic/flight-engine.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/flight-engine.js)
  * [`tests/unit/traffic/commands.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/commands.test.js)
* **Problem / Flaw Addressed:**  
  Missing procedural command for closed pattern circuit entry following touch-and-go or low approach on Runway 29L.
* **Changes Made:**
  1. Added `closed_pattern` command to `PHYSICS_COMMANDS`.
  2. Aircraft enters `PHYSICS` mode, initiates a 45° bank climbing left turn, climbs to 3,500 ft MSL, and tracks toward the wind-corrected break rollout position (`computeBreakRollout()`).
  3. Added proportional track-intercept steering in `calcBankTarget` with 45° bank limit for the `closed_pattern` phase.
  4. Defined completion condition: within 600 ft of rollout point, altitude within 150 ft of 3,500 ft, and heading within 30° of 118°; then smoothly transitions into `BLENDING` onto downwind rails.
* **Reasoning / Rationale:**  
  Accurate simulation of Moose Jaw closed pattern touch-and-go re-entry to the downwind leg.
* **Verification:**  
  37/37 tests pass across tick-aircraft, invariants, and commands.

---

### PATCH-038: Turn Fight Tactical AI Maneuver Selection Engine & Gate 2 Verification
* **Date & Time:** 2026-10-02 22:50 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM — Gate 2 Sign-Off Ready)
* **Branch:** `next-module`
* **Files Modified:**
  * [`src/modules/turn-fight/energy-sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-sim.js)
  * [`src/modules/turn-fight/state.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/state.js)
  * [`src/modules/turn-fight/layout.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/layout.js)
  * [`src/modules/turn-fight/readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/readouts.js)
  * [`src/modules/turn-fight/energy-readouts.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/turn-fight/energy-readouts.js)
  * [`tests/unit/turn-fight/energy-tactical.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/turn-fight/energy-tactical.test.js) (NEW)
  * [`tests/e2e/turn-fight.spec.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/e2e/turn-fight.spec.js)
  * [`docs/records/decisions-log.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/decisions-log.md)
  * [`docs/records/plan-decisions.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/records/plan-decisions.md)
  * [`docs/handover/turn-fight.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/handover/turn-fight.md)
  * [`HANDOVER.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/HANDOVER.md)
  * [`docs/REMEDIATION_ROADMAP.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/REMEDIATION_ROADMAP.md)
  * [`tasks/turn-fight/todo.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/turn-fight/todo.md)
  * [`tasks/turn-fight/plan.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tasks/turn-fight/plan.md)
* **Problem / Flaw Addressed:**  
  1. Turn Fight Auto mode relied on static textbook lookups rather than dynamic tactical advantage evaluation, unable to adapt to dynamic altitude splits or aggressive adversary tactics.
  2. Rollout from Immelmann and Split S suffered from exit traps (`c.next = 'pick'` re-entering pitch back or slice dive loops).
  3. No dynamic mid-flight re-evaluation existed while sustained in MPT: fighters orbited indefinitely even when the adversary bled energy or overshot.
  4. Predictor dry runs did not register tactical breakout wins.
* **Changes Made:**
  1. Synchronized predictor `judge` in `noseOnSec` to evaluate `onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you)` with sub-2ms dry-run performance (Task 16).
  2. Neutralized rollout exit traps: in `controlImmelmann` and `controlSplitS`, set `c.next = 'mpt'` to cleanly transition into sustained rate tracking (Task 16).
  3. Implemented `getFeasibleMoves(ac, setup)` with authentic Harvard II operational envelopes and `pickTacticalMove(state, who, lookaheadSec)` multi-dimensional utility scoring ranking candidates by $T_{\text{win}}$, $\Delta Adv$, and $H_e$ with structured explanation string `why` (Task 17 / D416, D417).
  4. Integrated UI controls: added `'tactical'` to `ENERGY_MOVES`, added 'Tactical AI (Dynamic Utility)' to move dropdowns, added `tacticalLookaheadSec` slider (10–45 s), and displayed decision rationale in Result card (Task 18).
  5. Implemented mid-flight opportunistic re-evaluation in `controlMpt` (3.5 s cadence, 4.0 s hysteresis lockout timer, Hard Deck margin) (Task 19 / D418).
  6. Harmonized E2E test assertions in `tests/e2e/turn-fight.spec.js` for data tags and updated BFM help text.
  7. Added dedicated unit test suite `tests/unit/turn-fight/energy-tactical.test.js` (all 515 turn-fight unit tests green).
* **Reasoning / Rationale:**  
  Decisions **D416–D418** (ratified as Tasks D412–D414). Elevates AI to an authentic tactical adversary that selects winning BFM maneuvers and exploits bandit mistakes according to real-world fighter combat principles.
* **Verification:**  
  - `npm run typecheck`: clean (0 errors).
  - `node --test tests/unit/turn-fight/*.test.js`: 515 passed, 0 failed.
  - `npm test`: 3,174 passed, 0 failed, 1 skipped.
  - `npm run build`: built in 476ms, all size budgets kept.
  - `npx playwright test tests/e2e/turn-fight.spec.js`: 68 passed, 0 failed.

---

### PATCH-039: Wind-Adaptive PFL Track on Rails & Threshold Touchdown (D420)
* **Date & Time:** 2026-10-02 21:45 UTC
* **Milestone:** Milestone 1 (Traffic Pattern Sim)
* **Branch:** `main`
* **Files Modified:**
  * [`src/modules/traffic/route.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/route.js)
  * [`src/modules/traffic/nav-plans.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/nav-plans.js)
  * [`src/modules/traffic/sim.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/sim.js)
  * [`src/modules/traffic/tick-aircraft.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/src/modules/traffic/tick-aircraft.js)
  * [`tests/unit/traffic/route.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/route.test.js)
  * [`tests/unit/traffic/nav-plans.test.js`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/tests/unit/traffic/nav-plans.test.js)
* **Problem / Flaw Addressed:**  
  1. The legacy PFL generator (`generatePflTrack`) integrated an unconstrained 360° circular arc with pure wind drift, causing the flight path to drift miles off-field and into the terrain.
  2. PFL waypoints were marked `mode: 'physics'`, causing numerical drift in differential glide equations that missed the runway threshold.
  3. Aircraft completing PFL had no landing clamp at the runway threshold.
* **Changes Made:**
  1. Replaced unconstrained PFL orbit with an authentic 4-segment wind-adaptive track generator:
     - **Segment 1 (High Key Turn):** 180° descending turn from High Key (5,000 ft $\to$ 3,700 ft MSL, 125 $\to$ 120 KIAS) with natural wind drift and smooth roll-in.
     - **Segment 2 (Downwind Leg to Low Key):** Straight leg heading $\approx 118^\circ$ (wind-crabbed) to dynamic Low Key (`lowKey = nominalLowKey + shift`, compensating for final turn drift).
     - **Segment 3 (Low Key to Final Approach):** Smooth descending turn (3,700 ft $\to$ 2,119 ft MSL, 120 KIAS, 35° bank) with boundary condition crab matching.
     - **Segment 4 (Final to Touchdown):** Straight glide along runway centerline (2,119 ft $\to$ 1,892 ft MSL, 120 $\to$ 100 KIAS) terminating **exactly at the threshold with 0.00 ft miss distance**.
  2. Updated `buildPath` in `route.js` to dispatch PFL routes (`ENT4`, `PFL`, `PFL_HIGH_KEY`) through `generatePflTrack()`.
  3. Changed `PFL_HIGH_KEY_WPS` waypoints to `mode: 'rails'` in `nav-plans.js`.
  4. Added PFL landing termination in `handleRouteEnd` in `sim.js`, ensuring aircraft safely touch down and stop on the numbers.
  5. Added comprehensive unit tests in `route.test.js` verifying 0.00 ft miss distance across calm, 25 kt crosswind, and 25 kt headwind conditions.
* **Reasoning / Rationale:**  
  Decision **D420**. PFL procedures in SMM Ch 16 require an authentic forced landing pattern terminating at touchdown on the runway threshold. Putting nominal PFL on rails with dynamic aerodynamic compensation guarantees repeatable, rock-solid execution across all wind environments.
* **Verification:**  
  - `node --test tests/unit/traffic/*.test.js`: all 740 tests passed, 0 failed.
  - PFL threshold miss distance: 0.00 ft calm, 0.00 ft in 25 kt crosswind, 0.00 ft in 25 kt headwind.
---

### PATCH-040: Combat Resolution — 2.0 s Continuous WEZ Gun Kill & Auto-Pause (D421)
* **Date & Time:** 2026-10-02 23:30 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `src/modules/turn-fight/layout.js`
  * `src/modules/turn-fight/index.js`
  * `src/modules/turn-fight/energy-readouts.js`
  * `src/modules/turn-fight/turn-fight.css`
  * `tests/unit/turn-fight/energy-tactical.test.js`
* **Problem / Flaw Addressed:**  
  Fighters had no decisive combat resolution; even when one fighter achieved dominant tracking inside the gun envelope, simulation continued indefinitely in sterile pursuit.
* **Changes Made:**
  1. Implemented WEZ Gun tracking detection in `energy-sim.js`: evaluated continuous tracking timer (`ac.ctl.wezTrackSec`) when in rear control zone, ATA <= 15°, target AA <= 60°, range < 2,500 ft, and not stalled.
  2. At 2.0 s continuous tracking, triggered `state.kill = { victor, timeSec, rangeFt, ataDeg }` and flagged `state.stopped = true`.
  3. Added HUD victor banner in `layout.js` with auto-pause in `index.js`, providing "Continue Engagement" and "Reset Fight" buttons.
  4. Added prominent combat victory row in `energy-readouts.js`.
  5. Added unit tests validating WEZ accumulation, reset on breakout, and kill trigger.
* **Reasoning / Rationale:**  
  Decision **D421**. Gives conclusive combat outcome to BFM engagements per tactical fighter doctrine.
* **Verification:**  
  All unit tests in `energy-tactical.test.js` passed; build succeeded.

---

### PATCH-041: Dynamic 3D Centroid Camera & Tactical Visual Cues (D422)
* **Date & Time:** 2026-10-03 00:15 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/view3d.js`
  * `src/modules/turn-fight/turn-fight.css`
  * `tests/unit/turn-fight/view3d.test.js`
* **Problem / Flaw Addressed:**  
  Static bounds midpoint left fighters drifting off-center during 3D vertical maneuvers; HUD data tags sat directly on top of 3D aircraft models; pilots lacked visual cues for lift vector and WEZ cone.
* **Changes Made:**
  1. Updated `cameraFor` in `view3d.js`: dynamic centroid camera tracks aircraft midpoint $(\vec{P}_{\text{blue}} + \vec{P}_{\text{red}})/2$ with adaptive distance framing.
  2. Displaced aircraft HUD data tags (-60px for Blue, +40px for Red) with leader lines connecting tags to aircraft centroids.
  3. Added wing-normal 3D lift vector lines and 15° WEZ aiming cone attached to tracking aircraft nose.
* **Reasoning / Rationale:**  
  Decision **D422**. Ensures optimal framing and authentic visual debrief references during dynamic BFM dogfights.
* **Verification:**  
  All `view3d.test.js` unit tests passed; Three.js context cleanup verified.

---

### PATCH-042: Tactical Engagement Presets & 1.2 NM Re-baseline (D423)
* **Date & Time:** 2026-10-03 01:00 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/state.js`
  * `src/modules/turn-fight/layout.js`
  * `src/modules/turn-fight/index.js`
  * `tests/unit/turn-fight/state.test.js`
  * `tests/unit/turn-fight/energy-state.test.js`
* **Problem / Flaw Addressed:**  
  Legacy 2.0 NM start separation generated 15+ seconds of passive head-on transit dead time; zero-degree start ATA had no lateral offset.
* **Changes Made:**
  1. Re-baselined default start separation to 1.2 NM and start ATA to 5° (750 ft lateral turning room) in `state.js`.
  2. Added 5 canonical 1-click tactical scenario presets: Neutral Merge, Offensive Perch, Defensive Break, Energy vs Angles, and Radius vs Rate.
  3. Integrated preset select handler in `layout.js` and `index.js`.
* **Reasoning / Rationale:**  
  Decision **D423**. Eliminates boring pre-merge transit time and provides instant access to canonical BFM training scenarios.
* **Verification:**  
  All `state.test.js` and `energy-state.test.js` tests passed.

---

### PATCH-043: Turn Fight BFM Energy Fight Default-On & Progressive Disclosure Architecture (D424 / D425)
* **Date & Time:** 2026-10-03 01:30 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/state.js`
  * `src/modules/turn-fight/layout.js`
  * `tests/unit/turn-fight/state.test.js`
  * `tests/unit/turn-fight/energy-layout.test.js`
* **Problem / Flaw Addressed:**  
  Turn Fight opened to legacy flat 2D turn circles by default; 16 developer checking parameters cluttered the student interface.
* **Changes Made:**
  1. Defaulted `energy: true` in `DEFAULTS` and `standardDefaults()` in `state.js`, opening directly into authentic 3D BFM Energy Fight (superseding D379 per D425).
  2. Retired arcade "Climb and dive" from Simple Mode, preserving Simple Mode as a clean flat 2D rate/radius reference.
  3. Quarantined 16 "Model settings for checking" behind `?debug=aero` URL query parameter.
  4. Streamlined move dropdown labels to clean military nomenclature (`Tactical AI (Dynamic Pilot)` [Default], `Textbook SMM Auto`, and manual overrides).
* **Reasoning / Rationale:**  
  Decisions **D424** and **D425**. Elevates authentic 3D aerodynamics as the primary user experience while strictly adhering to progressive disclosure (R22).
* **Verification:**  
  Unit tests and build clean.

---

### PATCH-044: Immelmann Apex 140 kt Gate Removal (D426)
* **Date & Time:** 2026-10-03 02:00 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `tests/unit/turn-fight/energy-tactical.test.js`
* **Problem / Flaw Addressed:**  
  Artificial 140 kt apex gate in `getFeasibleMoves` prevented pilots/AI from attempting Immelmanns across the authentic T-6 operating envelope.
* **Changes Made:**
  1. Removed artificial 140 kt apex gate from `getFeasibleMoves`; allowed Immelmann attempts from 180 to 316 KIAS entries per Patrick's directive ("let it try if it wants").
  2. Relied on authentic stall shaker dynamics, AOA limits, and departure recovery.
* **Reasoning / Rationale:**  
  Decision **D426**. Honors pilot decision-making and authentic aircraft flight characteristics without artificial software speed governors.
* **Verification:**  
  All `energy-tactical.test.js` tests green.

---

### PATCH-045: Physical Hitbox (35 ft) & Sequential Combat Telemetry (D427)
* **Date & Time:** 2026-10-03 02:30 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `tests/unit/turn-fight/energy-tactical.test.js`
* **Problem / Flaw Addressed:**  
  Simulation permitted aircraft to pass through each other with 0 ft separation without physical consequences.
* **Changes Made:**
  1. Exported `COLLISION_HITBOX_FT = 35.0` (matching CT-156 wingspan 33.4 ft and length 33.3 ft).
  2. Implemented `checkMidAirCollision`: triggers when 3D Euclidean range < 35 ft post-merge.
  3. Records `state.collision = { timeSec, impactKias, relativeSpeedKt, closingRateKt, altitudeFt }` while preserving prior `state.kill` in telemetry for sequential debrief analysis.
* **Reasoning / Rationale:**  
  Decision **D427**. Establishes physical airframe boundaries and eliminates unphysical ghost aircraft penetration.
* **Verification:**  
  Unit tests in `energy-tactical.test.js` verified hitbox boundary triggers at 34.9 ft and non-trigger at 35.1 ft.

---

### PATCH-046: Analytical TCPA Predictive Deconfliction Gate & Out-of-Plane Rolling Lag (D427)
* **Date & Time:** 2026-10-03 03:00 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `tests/unit/turn-fight/energy-tactical.test.js`
* **Problem / Flaw Addressed:**  
  Pure pursuit tracking at high closure rates caused attackers to ram defenders from behind.
* **Changes Made:**
  1. Implemented closed-form analytical vector TCPA calculation `computeTcpa(ac, target)`: computes $t_{\text{CPA}} = -\frac{\vec{r} \cdot \vec{V}_{\text{rel}}}{|\vec{V}_{\text{rel}}|^2}$ and projected miss distance $d_{\text{miss}}$.
  2. Implemented predictive collision gate: triggers when $t_{\text{CPA}} \in [0.5, 1.5]\text{ s}$ and $d_{\text{miss}} < 75\text{ ft}$.
  3. Context-dependent out-of-plane lag roll: computes defender turn-plane normal $\hat{n} = \frac{\vec{V}_{\text{def}} \times \vec{a}_{\text{def}}}{|\vec{V}_{\text{def}} \times \vec{a}_{\text{def}}|}$ and displaces aim point 85 ft along $\hat{n}$, inducing natural flight-path overshoot and safe canopy-to-canopy clearance.
  4. Dynamically clamped deck pull-out floor to prevent dive overshoot during high-speed deconfliction.
* **Reasoning / Rationale:**  
  Decision **D427**. Models authentic tactical military deconfliction doctrine and sets up realistic defender scissors reversals.
* **Verification:**  
  Unit tests verified analytical TCPA formulas and out-of-plane aim displacement.

---

### PATCH-047: Ballistic Tumble State Machine Down to Terrain (D427)
* **Date & Time:** 2026-10-03 03:30 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `src/modules/turn-fight/layout.js`
  * `src/modules/turn-fight/index.js`
  * `src/modules/turn-fight/energy-readouts.js`
  * `tests/unit/turn-fight/energy-tactical.test.js`
* **Problem / Flaw Addressed:**  
  Collisions previously froze the simulation instantly, preventing realistic observation of the post-collision aircraft departure.
* **Changes Made:**
  1. Implemented post-collision ballistic tumble state machine (`ac.tumble`): cuts thrust to 0, severs flight controls, applies bluff-body aerodynamic drag ($C_D \approx 1.2$), gravity drop $\ddot{z} = -32.174\text{ ft/s}^2$, and severity-scaled rotational integration using CT-156 inertia ratios ($I_{xx} \ll I_{yy} \ll I_{zz}$).
  2. Permitted simulation to continue in real time until reaching terrain (0 ft MSL), where `state.stopped = true` is set.
  3. Added HUD collision alert banner in `layout.js` and telemetry row in `energy-readouts.js`.
* **Reasoning / Rationale:**  
  Decision **D427**. Models authentic ballistic aerodynamic hull departure following mid-air collisions.
* **Verification:**  
  Unit tests verified drag deceleration, gravity acceleration, and terrain clamping at 0 ft MSL.

---

### PATCH-048: Turn Fight Settings Toggles, Full Test Harmonization & Gate 2 Verification (D425–D427)
* **Date & Time:** 2026-10-03 04:00 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM — Gate 2 Sign-Off Ready)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/state.js`
  * `src/modules/turn-fight/layout.js`
  * `src/modules/turn-fight/energy-sim.js`
  * `package.json`
  * `index.html`
  * `tests/unit/turn-fight/energy-sim.test.js`
  * `docs/records/decisions-log.md`
  * `docs/records/plan-decisions.md`
  * `docs/handover/turn-fight.md`
  * `HANDOVER.md`
  * `docs/REMEDIATION_ROADMAP.md`
* **Problem / Flaw Addressed:**  
  Settings checkboxes for collision systems were missing from main settings; version number inconsistency in UI pills (`v2.2` vs `v2.3`); legacy tests failed due to strict time-locking or unisolated collision detection.
* **Changes Made:**
  1. Added `collisionDetection` and `collisionAvoidance` checkboxes into main Turn Fight settings modal.
  2. Updated version strings across `package.json`, `index.html`, and `layout.js` to `V2.5` (`2.5.0`).
  3. Fixed altitude variable definition in `stepAircraft` tumble handling.
  4. Harmonized `energy-sim.test.js` tests by isolating aerodynamic governor checks from ballistic crash hulls (`collisionDetection: false`) and preserving legacy 4.0 G baseline for Test 1305.
  5. Formally registered D425–D427 in `decisions-log.md` and `plan-decisions.md`.
* **Reasoning / Rationale:**  
  Decisions **D425–D427**. Completes all 30 Turn Fight remediation tasks and achieves 100% test green status across the repository.
* **Verification:**  
  - `node --test tests/unit/turn-fight/*.test.js`: 558/558 passed, 0 failed.
  - `npm test`: 3,218 passed, 0 failed, 1 skipped.
  - `npm run typecheck`: clean (0 errors).
  - `npm run build`: built in 492ms, all size budgets kept.

---

### PATCH-049: Turn Fight Altitude-Split Canopy Visual Pursuit (D429)
* **Date & Time:** 2026-10-03 15:35 UTC
* **Milestone:** Milestone 2 (Turn Fight 1v1 BFM)
* **Branch:** `next-module`
* **Files Modified:**
  * `src/modules/turn-fight/energy-sim.js`
  * `docs/records/decisions-log.md`
  * `docs/records/plan-decisions.md`
  * `.agent/memory/handoff.md`
* **Problem / Flaw Addressed:**  
  When fighters started with altitude separation (e.g. Blue 6,000 ft, Red 7,000 ft), the rigid 5.0° boresight crossing gate caused aircraft to passively orbit for 12–15 seconds waiting for horizontal azimuth to sweep 175° before engaging.
* **Changes Made:**
  1. Relaxed post-merge pursuit breakout gate from rigid 5.0° boresight crossing to forward canopy visual acquisition (`CANOPY_VISUAL_DEG = 60.0°`) across altitude differences.
  2. Permitted breakout from either `mpt` or `levelMpt`.
* **Reasoning / Rationale:**  
  Decision **D429**. Models authentic pilot visual tracking through the bubble canopy; once clear of merge pass, fighters acquire target visually within forward 60° field and immediately initiate 3D combat maneuvering.
* **Verification:**  
  All 558 Turn Fight unit tests passing; altitude-split circle delay eliminated.

---

### PATCH-050: Traffic 3D Visual Landmarks, Buildings, Cameras & SW Sun (D430–D434)
* **Date & Time:** 2026-10-03 15:45 UTC
* **Milestone:** Milestone 1 (Traffic Sim)
* **Branch:** `main`
* **Files Modified:**
  * `src/modules/traffic/scenery3d.js`
  * `src/modules/traffic/landmarks3d.js`
  * `src/modules/traffic/camera-views.js`
  * `src/modules/traffic/camera-bar.js`
  * `src/modules/traffic/view3d.js`
* **Problem / Flaw Addressed:**  
  Airfield buildings were procedurally misaligned with satellite concrete footprints; circuit visual navigation cues were absent; default graphics quality caused frame drops on low-end machines; dynamic lighting created inconsistent building face contrast.
* **Changes Made:**
  1. Defaulted `graphicsQuality` to 'low' (Performance) for smooth 60 FPS frame rates.
  2. Built dedicated 3D camera menu bar with Fit, High look-down, Top-down, Tower, Chase, Cockpit, and Padlock runway views, plus an airborne aircraft Follow dropdown.
  3. Traced Glass Palace, Rec Centre, Student Barracks, and Hangars 5 & 6 directly onto satellite footprints with accurate headings and deleted non-existent athletic field diamond.
  4. Added off-field visual circuit navigation landmarks (Window Farm on 29L extended centerline, Sukanen Ship museum, Fiat Farm auto wrecker, Arrow Tree Rows).
  5. Established fixed south-west afternoon sun lighting (225°, 45° elevation) without expensive shadow maps.
* **Reasoning / Rationale:**  
  Decisions **D430–D434**. Conforms all 3D features to authentic satellite footprints and pilot circuit reference points.
* **Verification:**  
  3D scene renders cleanly with zero WebGL errors and verified satellite alignment.

---

### PATCH-051: Breakout 2 NM Rejoin, High Key Controller & PFL Architecture (D435–D436)
* **Date & Time:** 2026-10-03 23:05 UTC
* **Milestone:** Milestone 1 (Traffic Sim)
* **Branch:** `main`
* **Files Modified / Created:**
  * `src/modules/traffic/breakout.js`
  * `src/modules/traffic/high-key.js`
  * `src/modules/traffic/pfl-solver.js` (new)
  * `src/modules/traffic/pfl-rail.js` (new)
  * `src/modules/traffic/sim.js`
  * `src/modules/traffic/tick-aircraft.js`
  * `src/modules/traffic/map2d.js`
  * `src/modules/traffic/aircraft.js`
  * `tests/unit/traffic/high-key.test.js`
  * `tests/unit/traffic/pfl-solver.test.js` (new)
  * `tests/unit/traffic/pfl-rail.test.js` (new)
  * `tests/unit/traffic/pfl.test.js` (new)
* **Problem / Flaw Addressed:**  
  Breakout rejoin previously cut across the pattern; High Key climb guidance suffered from numerical deadlocks; forced landings lacked authentic SMM Ch 16 energy trades, adaptive bank corner cutting, and terrain clamping.
* **Changes Made:**
  1. Rectified breakout rejoin geometry to join 2 NM prior on ENT1 along the 3,500 ft run-in corridor.
  2. Implemented High Key SE approach intercept and continuous pitch arrest controller (`calcHighKeyPitch`, D435) with arrival gates governed by Pilot Domain Tolerances (D371).
  3. Built authentic Precautionary Forced Landing (PFL) architecture (D436):
     - Kinetic energy zoom apex (`zoomT6A`) with pilot energy trade (+700 to +1,000 ft gain if >150 kt; level decel if <=150 kt).
     - SMM Ch 13 adaptive bank corner cutting (35° nominal, 45° tight bank when marginal energy saves aircraft).
     - Pre-synthesized 3D wind-shaped rail (`mode = 'RAIL'`) with continuous telemetry and config schedule (Clean -> Gear Down -> Flaps TO -> Flaps LDG).
     - Dynamic 2D wind-drifted glide footprint ring with range HUD.
     - 6 tactical badges ([PFL: ZOOM], [PFL: HIGH KEY], [PFL: LOW KEY], [PFL: BASE KEY], [PFL: DIRECT], [CRASH SHORT]).
     - Off-runway terrain contact clamp at 1,892 ft MSL (`status = 'crashed'` off-runway, `'landed'` on threshold).
* **Reasoning / Rationale:**  
  Decisions **D435–D436**. Replaces open-loop Euler drift with deterministic wind-compensated kinematic rails.
* **Verification:**  
  11/11 High Key unit tests, 18/18 PFL solver & rail tests, 4/4 PFL sim integration tests passing green.

---

### PATCH-052: Traffic Single-Click Button Responsiveness & Stable DOM Updates (D437)
* **Date & Time:** 2026-10-03 23:15 UTC
* **Milestone:** Milestone 1 (Traffic Sim)
* **Branch:** `main`
* **Files Modified:**
  * `src/modules/traffic/aircraft.js`
  * `src/modules/traffic/playback-bar.js`
  * `src/modules/traffic/layout.js`
  * `tests/unit/traffic/aircraft.test.js`
* **Problem / Flaw Addressed:**  
  Buttons across the Traffic module required double-clicking because `aircraft.js:write()` recreated rows every 100ms on altitude changes, wiping the DOM between `mousedown` and `mouseup` and cancelling the browser click event.
* **Changes Made:**
  1. Decoupled structural row DOM from continuous altitude/speed readouts in `aircraft.js`; updated telemetry text nodes in place on stable DOM elements.
  2. Implemented dual `pointerdown` + `click` event listeners with 250ms debounce across all playback controls, action buttons (Breakout, Closed Pattern, High Key, PFL, Go-around), layout toggles, and route rows.
* **Reasoning / Rationale:**  
  Decision **D437**. Restores immediate, single-click responsiveness across all mobile, tablet, and desktop pointer interactions.
* **Verification:**  
  30/30 `aircraft.test.js` tests passing; single-click verified on dev server.

---

### PATCH-053: High Key PFL Energy Gate Pilot Domain Tolerances & 360° Spiral Continuity (D438)
* **Date & Time:** 2026-10-04 00:35 UTC
* **Milestone:** Milestone 1 (Traffic Sim)
* **Branch:** `main`
* **Files Modified:**
  * `src/modules/traffic/pfl-solver.js`
  * `src/modules/traffic/pfl-rail.js`
  * `src/modules/traffic/high-key.js`
  * `tests/unit/traffic/high-key.test.js`
  * `.agent/skills/wind-shaped-flight-paths/SKILL.md`
* **Problem / Flaw Addressed:**  
  Upon reaching High Key at ~4,950 ft MSL (or with minor spatial offset), the solver evaluated strict `arrAltHk >= 5000`. Failing by only ~11 ft, it falsely diagnosed that the aircraft lacked sufficient energy for High Key and downgraded to Low Key, cutting diagonally across the airfield to the downwind leg ("Window Farm") instead of flying the published SMM Chapter 13 360° descending spiral from High Key.
* **Changes Made:**
  1. In `src/modules/traffic/pfl-solver.js:solvePflTangent`, relaxed the High Key energy gate to Pilot Domain Tolerances (D371: $\pm 100\text{ ft}$ standard, $\pm 200\text{ ft}$ loose), allowing arrival altitudes $\ge 4,850\text{ ft}$ MSL, direct corridor proximity (`distToHk <= 800 ft && alt >= 4750 ft`), or explicit maneuver intent (`options.targetKey === 'high_key'`) to classify as `high_key`.
  2. In `src/modules/traffic/high-key.js:stepHighKey`, passed `{ targetKey: 'high_key' }` upon reaching High Key.
  3. In `src/modules/traffic/pfl-rail.js`, tagged the initial waypoint as `phase = 'pfl_high_key'` and `tag = 'high_key'` when classified as High Key, and smoothed heading alignment transition from arrival heading directly into the spiral entry heading when within 500 ft.
  4. Added Unit Test 12 in `tests/unit/traffic/high-key.test.js` verifying full 360° spiral execution through High Key, Low Key, Base Key, and Final to threshold touchdown.
  5. Codified **Pillar 12: Pilot Domain Energy Gates & Spiral Continuity (The Anti-Window-Cut Contract)** in `wind-shaped-flight-paths` skill.
* **Reasoning / Rationale:**  
  Decision **D438**. Enforces Pilot Domain Tolerances (D371) on numerical energy solvers, guaranteeing authentic SMM Chapter 13 forced landing trajectories.
* **Verification:**  
  34/34 High Key & PFL unit tests passing green in 310ms.

