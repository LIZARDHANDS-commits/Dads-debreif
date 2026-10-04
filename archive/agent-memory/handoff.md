# Handoff

Rewritten by `/save` at the end of each session. Read by `/sync` at the start.

## Last updated
03 Oct 2026, 17:15 local / 23:15Z (Antigravity).

## Current State & Documentation Directory
- **Branch:** `main` (fully merged with `next-module` and synchronized with `origin/main`).
- **Active Test Server:** Vite dev server running on `http://localhost:5173/` and `http://10.0.0.149:5173/`.
- **SMM Aerobatics Catalog (D428 Ratified Sole Source of Truth):**
  - Authoritative reference: [`docs/smm-aerobatics-catalog.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/smm-aerobatics-catalog.md).
  - Both Aileron Roll and Hesitation Roll initiate with a 20° smooth pitch-up first.
  - Hesitation Roll is NOT a 4-point roll; rolls inverted, pauses while nose drops through horizon to SET calibrated dive attitude (~15° for 230–250 kt; ~30° for 280 kt), rolls upright in dive to accelerate to entry speed.
  - Loop, Cuban 8, Cloverleaf target entry is 230 KIAS with inverse dynamic G pull law (more G if slow, less G if fast); target exit is 230 KIAS.
  - Immelmann dynamically feasible at any speed > 220 KIAS.
  - SMM Aerobatics Sequence Mode registered as FF48 in `docs/records/future-ideas.md`.
- **Traffic Pattern Sim (Milestone 1 — Gate 1 Ready):**
  - 100% Complete through Gate 1 Readiness (D430–D437, PATCH-050–052).
  - 3D visual circuit landmarks (Window Farm, Sukanen Ship, Fiat Farm, Arrow Trees), traced airfield buildings, fixed SW sun lighting (D430–D434).
  - Breakout rejoin 2 NM prior on ENT1 along 3,500 ft corridor; High Key SE approach intercept and continuous pitch arrest controller (`calcHighKeyPitch`, D435).
  - Authentic Precautionary Forced Landing (PFL) architecture (D436): kinetic zoom apex (`zoomT6A`), SMM Ch 13 adaptive bank corner cutting, 3D kinematic rail synthesis (`mode = 'RAIL'`), dynamic 2D wind-drifted glide footprint ring with range HUD, 6 tactical badges, terrain contact clamp at 1,892 ft MSL (`status = 'crashed'` off-runway, `'landed'` on threshold).
  - Fixed Traffic button responsiveness: dual `pointerdown` + `click` event listeners with 250ms debounce across all playback controls, action buttons, layout toggles, and in-place DOM updates in `aircraft.js:write()` preventing 100ms click cancellation (D437).
  - All 126 unit tests, typecheck, build green. Ready for Patrick's Gate 1 sign-off on test server (`http://localhost:5173/`).
- **Turn Fight (Milestone 2 — Gate 2 Ready):** 100% Complete across all 30 tasks, Remediation Plans v2–v5, BFM AI v2.5 (PATCH-024 through PATCH-049, D401–D429). Altitude-split circling resolved via canopy visual acquisition (D429). All 558 unit tests, Playwright E2E tests, typecheck, build green. Ready for Gate 2 sign-off (`docs/checklists/turn-fight.md`).
- **Turn Sim (Milestone 3):**
  - Flagged for full architectural overhaul & assessment in [`docs/handover/turn-sim.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/handover/turn-sim.md) per Patrick directive (aircraft end up in a row after Delayed 45; legacy V6 heuristics broken).

## Milestones Status Overview
* **Milestone 0: Ground Truth & Decoupling Foundation** — COMPLETED [x]
* **Milestone 1: Traffic Pattern Sim (Gate 1)** — COMPLETED & READY FOR GATE 1 SIGN-OFF [x] (Checklist: `docs/checklists/traffic.md`)
* **Milestone 2: Turn Fight 1v1 BFM & Energy Screen (Gate 2)** — COMPLETED & READY FOR GATE 2 SIGN-OFF [x] (Checklist: `docs/checklists/turn-fight.md`)
* **Milestone 3: Turn Sim / Formation (Gate 3)** — QUEUED (Full architectural overhaul & assessment required per Patrick directive: SMM non-compliance, aircraft end up in a row after Delayed 45)
* **Milestone 4: Debrief 3D View & Tacview Integration** — QUEUED
* **Milestone 5: Final Prototype Acceptance (Gate 5)** — QUEUED

## Immediate Next Steps & Options for Patrick
1. **Gate 1 Sign-Off (Traffic Sim):** Run the interactive checklist [`docs/checklists/traffic.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/checklists/traffic.md) on `http://localhost:5173/` or `http://10.0.0.149:5173/`.
2. **Gate 2 Sign-Off (Turn Fight):** Run the interactive walkthrough checklist [`docs/checklists/turn-fight.md`](file:///c:/Users/patri/Documents/antigravity/wise-mendeleev/Dads-debreif/docs/checklists/turn-fight.md).
3. **Turn Sim Architectural Overhaul:** Begin the root-and-branch restructuring of Turn Sim trajectory/slot tracking to fix SMM formation behaviors (e.g. Delayed 45).
4. **SMM Aerobatics Sequence Mode (FF48):** Build the autonomous single-aircraft SMM aerobatics routine player demo in 3D.
