# Master Flying Manuals Discrepancy & Reconciliation Matrix

**Author:** Antigravity Full-Spectrum Manuals Audit Swarm  
**Date:** 2026-10-03  
**Ground Truth Directory:** `C:\Users\patri\OneDrive\Desktop\manuals`  
**Governing Doctrine:** 15 Wing Moose Jaw CT-156 Harvard II SMM, Gen Book V8.9, EFIG, T-6A NFM  
**Technical Standards:** D109–D116, D368–D374, D382, D387, D407, D411, D420–D424  

---

## 1. Executive Summary

Following Patrick's instruction, a full-spectrum audit was conducted across all four modules of the application:
1. **Traffic Pattern Sim (`src/modules/traffic/`)**
2. **Turn Fight BFM & Aerobatics (`src/modules/turn-fight/`, `src/core/`)**
3. **Turn Sim Formation (`src/modules/turn-sim/`, `src/core/`)**
4. **Supervisor of Flying (SOF) & Weather (`src/modules/sof/`, `src/wx/`)**

This ledger records every discovered divergence between current codebase values, the flying manuals, and previously ratified decisions by Patrick.

---

## 2. Module-by-Module Discrepancy Ledger

### A. Traffic Pattern Sim (`src/modules/traffic/`)

| # | Item / Parameter | Current Code Value | Flying Manual Ground Truth | Existing Decision | Discrepancy Analysis & Remediation Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TR-01** | **Pattern Altitude (CYMJ)** | 3,500 ft MSL (`moose-jaw.json:16`, `aircraft.js:23`) | 3,000 ft MSL (SMM 4.14 para 32, EFIG p.212) | **D109 / D373 / D382:** Patrick ruled to keep 3,500 ft MSL | **No Change (Reconciled).** Patrick explicitly confirmed 3,500 ft MSL for the outer pattern (3,000 ft is older practice). |
| **TR-02** | **Closed Pattern Target Alt** | **2,400 ft MSL** (`aircraft.js:22, 326`) | Climb to ~2,700 MSL, level 3,000 ft MSL (EFIG p.134) | **D109:** Levels at 3,500 ft MSL | **DISCREPANCY (High).** `aircraft.js` uses legacy V6 2,400 ft MSL (~510 ft AGL). Recommend updating Closed Pattern label and flight target to **3,500 ft MSL** (or 3,000 ft MSL per SMM). |
| **TR-03** | **Go-Around Target Alt** | **2,500 ft MSL** (`aircraft.js:373`) | Pattern altitude (3,500 ft MSL per D109; 3,000 ft per SMM) | **D109 / D382** | **DISCREPANCY (Medium).** `aircraft.js` go-around climb says 2,500 ft. Recommend updating go-around climb target to **3,500 ft MSL**. |
| **TR-04** | **Window Speed to Threshold** | **110 KIAS** (`moose-jaw.json:26`, `aircraft.js:365`) | **100 KIAS** LDG flap threshold crossing speed (SMM 4.1, Table 4.1) | **D110:** 100 KIAS from window to threshold | **DISCREPANCY (Medium).** `moose-jaw.json` PAT1 point 13 sets 110 KIAS. Recommend changing PAT1 point 13 and ENT2 points 5–6 from 110 KIAS to **100 KIAS**. |
| **TR-05** | **Straight-In Glidepath Speed** | 110 KIAS (`moose-jaw.json:56, 57`) | 120 KIAS on glidepath until the window (SMM 4.7 para 10) | **D110:** 120 KIAS straight-in, 100 at window | **DISCREPANCY (Low).** Intermediate glidepath points use 110 KIAS instead of 120 KIAS. Recommend aligning to 120 KIAS until the window. |
| **TR-06** | **Overhead Break Turn** | 60° bank / 2.0 G, 220 kt (`moose-jaw.json:23`) | 60° bank / 2.0 G level turn at 220 KIAS (SMM 4.17 para 39) | **D46, D110, D382** | **Verified (Matches).** Code correctly flies 60° / 2.0 G at 220 KIAS. |
| **TR-07** | **Final Turn Bank & Speed** | 45° bank / 1.414 G, 120 kt (`moose-jaw.json:25`) | Up to 45° bank at 120 KIAS (EFIG p.150–152, SMM 4.19) | **D110** | **Verified (Matches).** |
| **TR-08** | **PFL High Key Altitude** | 5,000 ft MSL (`aircraft.js:210`) | 5,000 ft MSL over button at Moose Jaw (SMM 13.5 para 8) | **D378** | **Verified (Matches).** 5,000 ft MSL matches SMM Moose Jaw local standard. |
| **TR-09** | **PFL Glide Polar** | 125 KIAS clean = 2.0 NM / 1,000 ft | 125 KIAS clean feathered = 2.0 NM / 1,000 ft (SMM 13.5) | **D378** | **Verified (Matches).** |

---

### B. Turn Fight BFM & Aerobatics (`src/modules/turn-fight/`, `src/core/`)

| # | Item / Parameter | Current Code Value | Flying Manual Ground Truth | Existing Decision | Discrepancy Analysis & Remediation Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TF-01** | **MPT Sustained Speed** | 160 KIAS (`energy-sim.js:131, 141`) | 160 KIAS held within ±5 kt (SMM 14.14) | **D112, D384** | **Verified (Matches).** |
| **TF-02** | **Level MPT Bank Angle** | ~68.5°–69° aerodynamic bank | SMM states ~75° visual attitude cue; turn chart gives 69° | **D112 (Patrick ruling 09:27Z)** | **No Change (Reconciled).** Patrick explicitly approved keeping chart physics (69°) with SMM 75° noted as cockpit visual cue. |
| **TF-03** | **Tactical Split-S Pull G** | 5.0 G (`t6-performance.js:285`) | SMM Table 14.1 states "approx. 4 G"; EFIG AIF 2410 max 5 G | **D407 (Patrick ruling 09:27Z)** | **No Change (Reconciled).** Patrick explicitly ratified 5.0 G pull in stick shaker for tactical energy retention. |
| **TF-04** | **Immelmann Entry Envelope** | 200–250 KIAS (`energy-sim.js:139`) | 200–250 KIAS (SMM Table 14.1, SMM 14.15) | **D420, D426** | **Verified (Matches).** |
| **TF-05** | **Pitch Back Entry Envelope** | 160–220 KIAS (`energy-sim.js:142`) | 160–220 KIAS (SMM Table 14.1, SMM 14.17) | **D420** | **Verified (Matches).** Bank 60° at 160 kt to 30° at 220 kt matches EFIG p.441. |
| **TF-06** | **Slice Entry Envelope** | 100–160 KIAS (`energy-sim.js:143`) | 100–160 KIAS (SMM Table 14.1, SMM 14.18) | **D381, D420** | **Verified (Matches).** Bank 90° at 160 kt to 135° at 100 kt matches SMM 14.18. |
| **TF-07** | **Vertical 8 & Vertical Roll** | Not implemented in `energy-sim.js` | 280 KIAS entry, 4–5 G pull (SMM Table 14.1, SMM 14.19) | **FF48 (Phase 2 Queue)** | **Future Feature Gap.** Correctly identified in `docs/references/smm-aerobatics-catalog.md`. To be integrated in FF48 (SMM Aerobatics Sequence Mode). |
| **TF-08** | **Contact Aerobatics (Ch 7)** | Not in `energy-sim.js` | Loop (230 kt), Cuban 8 (230 kt), Cloverleaf (230 kt), Hesitation Roll (200 kt) | **FF48 (Phase 2 Queue)** | **Future Feature Gap.** Fully cataloged in `docs/references/smm-aerobatics-catalog.md` ready for sequence controller wiring. |
| **TF-09** | **Stall Speed Baseline ($V_s$)** | 86 KIAS (`t6-performance.js:15`) | 86 KIAS at 1 G clean (V-n diagram / NFM) | **D158, D387** | **Verified (Matches).** |
| **TF-10** | **Asymmetric Rolling G Limit** | 4.7 G (`energy-sim.js:147`) | +4.7 G / -1.0 G asymmetric limit (V-n diagram / SMM 14.17) | **D407** | **Verified (Matches).** Rolling rate >15°/s triggers 4.7 G clamp. |

---

### C. Turn Sim Formation (`src/modules/turn-sim/`, `src/core/`)

| # | Item / Parameter | Current Code Value | Flying Manual Ground Truth | Existing Decision | Discrepancy Analysis & Remediation Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TS-01** | **Line Abreast Spacing** | 4,000–6,000 ft (`standards.js:70`) | 4,000–6,000 ft lateral (SMM 16.18 para 49) | **D116** | **Verified (Matches).** |
| **TS-02** | **Line Abreast Sweep Check** | 0–10° sweep aft (`standards.js:70`) | 0–10° sweep aft of Lead 3/9 line (SMM 16.18 para 49) | **D116 (Patrick ruling 05:37Z)** | **Verified (Matches).** |
| **TS-03** | **Lead Airspeed Standards** | 220 kt low / 200 kt mid (`standards.js:72`) | 220 KIAS low block, 200 KIAS mid block (Gen Book p.12) | **D115 (Patrick ruling 05:37Z)** | **Verified (Matches).** Split at 10,250 ft MSL. |
| **TS-04** | **Turn Sim Default G-Load** | **3.0 G** (`settings.js:108`) | 3.0 G level energy-sustaining turns (SMM 16.18 para 50) | **D113 (Patrick ruling 05:37Z)** | **Verified (Matches).** V6 was 2.0 G; rebuilt default is 3.0 G. |
| **TS-05** | **Offset Box Trail Spacing** | **7,000 ± 1,000 ft** (`standards.js:71`, `settings.js:110`) | 6,000–8,000 ft (1.0–1.2 NM) (SMM 16.41 para 109) | **D114 (Patrick ruling 05:37Z)** | **Verified (Matches).** V6 was 8,000 ± 1,000 ft; rebuilt is 7,000 ± 1,000 ft. |
| **TS-06** | **Hook Turn Arc** | **180°** (`settings.js:101`) | True 180° same-direction formation reversal (SMM 16.19 para 60) | **Q43 / D380** | **Verified (Matches).** V6 was 90°; rebuilt is true 180°. |
| **TS-07** | **Two-Stage Cross Turn** | 2.0 G first 90°, 3.0 G second 90° (`settings.js:129`) | 2.0 G for first 90°, then 3.0 G to 180° (SMM 16.19 para 64) | **D113** | **Verified (Matches).** |
| **TS-08** | **Offset Box Rear Element Delay**| 12.5 s (`settings.js:126`) | #3 and #4 delay 10–15 s (SMM 16.41 para 112a) | **D114** | **Verified (Matches).** 12.5 s sits in the exact center of the 10–15 s band. |

---

### D. Supervisor of Flying (SOF) & Weather (`src/modules/sof/`, `src/wx/`)

| # | Item / Parameter | Current Code Value | Flying Manual Ground Truth | Existing Decision | Discrepancy Analysis & Remediation Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WX-01** | **Alternate Trigger (Home)** | 2,000 ft / 3 SM default (`limits.js:8, 18`) | <3,000/3 standard, or <2,000/3 if remaining in MTCA (Gen Book p.7) | **D59 / D111** | **Verified (Matches).** Offers "Local (MTCA) 2000/3" and "Cross-country 3000/3". |
| **WX-02** | **Alternate Minima (Precision)**| 400-1 (2 precision), 600-2 (1 precision) | 400-1 or +200/+0.5; 600-2 or +300/+1 (Gen Book p.7) | **D72** | **Verified (Matches).** |
| **WX-03** | **Alternate Minima (Non-Prec)** | 800-2 | 800-2 or +300/+1 (Gen Book p.7) | **D72** | **Verified (Matches).** |
| **WX-04** | **Forecast Groups (TEMPO/PROB)**| TEMPO $\ge$ alt min, PROB $\ge$ ldg min | TEMPO not below alt min; PROB not below landing min (Gen Book p.7) | **D72** | **Verified (Matches).** |
| **WX-05** | **RNAV/GNSS Separation** | 100 NM (`alternates.js:13, 182`) | RNAV-only destination & alternate $\ge$ 100 NM apart (Gen Book p.7) | **D73** | **Verified (Matches).** |
| **WX-06** | **Formation Crosswind Limits** | Not actively checked in SOF | Dry 15 kt, Wet 10 kt, Icy 5 kt (Gen Book p.10) | **FF21 (Phase 2 Queue)** | **Feature Gap (Low).** Logged for inclusion when runway database integration (FF20/FF21) lands. |

---

## 3. High-Priority Action Items (Ready for Patrick's Approval)

Based on the findings above, **only three genuine code discrepancies** require immediate correction in `src/modules/traffic/`:

1. **Fix TR-02 (Closed Pattern Alt):** Update `src/modules/traffic/aircraft.js` lines 22 and 326 from `2,400 ft` to **`3,500 ft MSL`** (matching D109 outer pattern standard).
2. **Fix TR-03 (Go-Around Alt):** Update `src/modules/traffic/aircraft.js` line 373 from `2,500 ft` to **`3,500 ft MSL`** (matching D109 pattern altitude).
3. **Fix TR-04 & TR-05 (Window to Threshold Speed):** Update `src/modules/traffic/data/moose-jaw.json` line 26 from `110 kt` to **`100 kt`** (matching D110 and SMM Table 4.1 threshold crossing speed).

*All other modules (Turn Fight, Turn Sim, SOF/WX) have already been reconciled against the SMM and Patrick's ratified decisions.*
