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
| [**PATCH-015**](#patch-015-closed-loop-vector-pursuit-3d-visualization-suite--pilot-intuitive-controls) | M1 | 2026-09-30 23:55Z | 3D & Pilot UX | Closed-Loop Vector Pursuit, 3D Suite & Pilot-Intuitive Controls | Pass |

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

### PATCH-015: Closed-Loop Vector Pursuit, 3D Visualization Suite & Pilot-Intuitive Controls
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
  1. Final turn geometry had an unnatural 12.3° vertical elbow drop-off at Point 12 (Window, 2,119 ft MSL) due to linear descent against abrupt corner offsets.
  2. Overhead break decelerated linearly instead of obeying aerodynamic $V^2$ induced drag ($V(u) = 220 \cdot e^{-0.452 u}$, decelerating 220 to 140 KIAS).
  3. Aircraft lacked dynamic in-flight controls (`Breakout`, `Engine Fail` glide to 110 KIAS, `Go-Around`).
  4. Spawner was constrained to raw numeric point IDs rather than pilot-intuitive points (`Initial`, `Downwind`, `Perch`, `2-Mile Final`, `1-Mile Final`, `Takeoff`, `Rejoin Lines`) and lacked callsign preview.
  5. 3D view lacked camera translation/panning (right-click / middle-click / shift-drag), satellite photo ground projection plane, and vertical plumb lines with ground shadow reference rings.
* **Changes Made:**
  1. Updated `route.js`: Implemented continuous cubic easing descent along the final turn ($u \in [0, 1]$), smooth $V^2$ aerodynamic drag deceleration along the 180° break arc, and increased arc point density to 24 slices.
  2. Implemented `sim.command(aircraftId, action)` in `sim.js` supporting `'breakout'`, `'engine_fail'`, and `'go_around'` with automatic speed and vertical profile transitions; exposed `sim.nextCallsign()`.
  3. Exported `PILOT_SPAWN_PRESETS` in `aircraft.js`, added intuitive spawn preset dropdown and next callsign preview badge (`Next: A#`), and mounted in-flight action buttons (`Breakout`, `Eng Fail`, `Go-Around`) onto active aircraft rows.
  4. Added `panCamera` and pointer event listeners in `view3d.js` enabling camera panning via right-click drag, middle-click drag, Shift + left-click drag, and Shift + Arrow keys.
  5. Added satellite photo ground plane in 3D using `THREE.PlaneGeometry` with canvas texture sourced from `createTileLayer`, enabled via Layers menu.
  6. Added "Height lines" toggle in 3D controls toolbar displaying dashed vertical plumb lines (`LineDashedMaterial`) with ground shadow rings below airborne aircraft.
  7. Added unit tests in `commands.test.js` (4/4 passed) and updated `aircraft.test.js`, `view3d.test.js`, and `traffic-expected.json`.
* **Reasoning / Rationale:**  
  Decisions **D370**, **D374**, and **D390**. Elevates Traffic Sim into a modern 3D simulation suite with authentic Moose Jaw aerodynamics, responsive pilot controls, and intuitive visual references.
* **Verification:**  
  `npm test` passed 100% green (`2,943 passed, 0 failed, 1 skipped`). `npm run typecheck` passed (0 errors). `npm run build` passed in 451ms.




