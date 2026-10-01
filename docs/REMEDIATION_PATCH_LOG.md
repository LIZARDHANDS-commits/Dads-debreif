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

### PATCH-023: Milestone 2 Turn Fight Energy Screen & Tactical 3D Suite Integration
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
  1. **Tactical 3D Suite (D392):** Implemented `computeFloorZ` and `computePlumbGeometry` in `view3d.js`. Renders dynamic dotted vertical plumb lines (`THREE.LineDashedMaterial`, `computeLineDistances()`) from aircraft to floor, and 35-ft radius ground contact shadow discs (`THREE.RingGeometry`, floor offset +1.0 ft). Simple mode floors to terrain grid; Energy mode floors to Hard Deck plane; breaches plunge floor to 0 ft MSL.
  2. **Immelmann G-Law & Low Speed Gate (D381, D393):** Immelmann pulls 5.0 G until reaching the stick shaker boundary, then rides the shaker line via `pullCmdG(ctx)`. At $\le 140$ KIAS, aircraft must fly a Split S or slice turn, never an Immelmann.
  3. **Aero Limits & Corner Calibration:** Aligned `topKiasAt(altFt)` in `state.js` with `energyTopKias` (Mach 0.67 corner speed: 316 KIAS to 17,566 ft, 269 KIAS at 25,000 ft). Aligned MPT speed range to 125–175 KIAS per D349.
  4. **Forensic Trap Neutralization:**
     - Neutralized coordinate snap and mutual pursuit collision in `sim.js`.
     - Neutralized head-on pass check bypass in `sim.js:276` to ensure proper initial nose-on tracking.
     - Relabeled UI preset button from `Head-on (V6)` to `Neutral Head-on` in `layout.js:150` and updated E2E locators.
     - Relabeled reset button to `Reset to Standard Defaults` (D384) with backwards-compatible `standardDefaults()` alias.
     - Added setup error containment in `state.js:startEnergyRun` with unit test coverage.
  5. **Playwright E2E Stabilization:** Added `{ intervals: [50] }` to prevent overshooting during 4× forced Split S polling, updated MPT range hint assertion (`125 to 175 KIAS`), and made `resetDefaults` locator case-insensitive.
* **Reasoning / Rationale:**  
  Decisions **D368**, **D371**, **D372**, **D379**, **D381**, **D384**, **D386**, **D387**, **D392**, and **D393**. Fully delivers Milestone 2 and readies Turn Fight for Gate 2 Patrick sign-off.
* **Verification:**  
  - 504/504 unit tests passed 100% green (`node --test tests/unit/turn-fight/**/*.test.js`).
  - 67/67 Playwright E2E tests passed 100% green (`npx playwright test tests/e2e/turn-fight.spec.js`).
  - `npm run typecheck` passed (0 errors).
  - `npm run build` passed in 541ms with all bundles within budget.

---

### PATCH-024: Milestone 2 Active Combat Pursuit Default (D394)
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
  1. Defaulted `chaseAfterHeadOn` to `true` in `ENERGY_DEFAULT_SETUP` (`energy-sim.js:97`) and updated documentation per Patrick's D394 ratification.
  2. Preserved isolated non-pursuit unit tests with explicit `{ chaseAfterHeadOn: false }` or `{ pursuit: 'none' }`.
  3. Added Playwright E2E assertion in `tests/e2e/turn-fight.spec.js` confirming both aircraft switch to active combat pursuit (`move: 'pursuit'`) after the merge.
* **Reasoning / Rationale:**  
  Decision **D394**. Aligns dogfight simulation with John Boyd Energy-Maneuverability (E-M) theory and real-world BFM flow. As fighters merge and re-merge, pilots do not fly passive open-loop rate spirals; they aggressively acquire line of sight, pull lead/pure pursuit vectors, and trade altitude for speed to secure a firing solution.
* **Verification:**  
  - 505/505 unit tests passed 100% green (`node --test tests/unit/turn-fight/**/*.test.js`).
  - 68/68 Playwright E2E tests passing.
  - `npm run typecheck` passed (0 errors).
  - `npm run build` passed.





