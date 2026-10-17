# Patrick's Status, Plan & Checklist Queue (`docs/pat/status-and-plan.md`)

> **Single-Writer Rule:** Only Patrick's Claude and Antigravity sessions edit this file and [bulletin-for-dad.md](bulletin-for-dad.md). To see Dad's latest status and questions waiting on Patrick, read **[../dad/status-and-plan.md](../dad/status-and-plan.md)** and **[../dad/waiting-on-patrick.md](../dad/waiting-on-patrick.md)**.

## Active Workspace & Worktree State (`wise-mendeleev`, 17 Oct 2026)

- **`Dads-debreif` (`main`):** Unified and live at `https://lizardhands-commits.github.io/Dads-debreif/` (private repo with GitHub Pro Pages workflow, 3-layer Windows UTF-8/Mojibake + `ALL-R24` barrier, automatic `V2.xxx` version stamping in `vite.config.js`, and 0 open PRs).
- **`Dads-debreif-open-source-perf` (`wip/open-source-performance-redesign`, `769aede9`):** Protected local worktree holding Patrick's open-source aircraft performance redesign (`DO_NOT_DELETE_OR_MERGE.md`). Never delete, reset, push, or merge until specifically authorized by Patrick.

---

## Patrick's Fly-Through, Sign-Off & Measurement Queue

### 1. To Measure at Work (CT-156 Ramp & Flight Readings)
- [ ] **Flight measurements (Patrick, 12 Oct 2026):**
  1. A full-stick 360° aileron roll at about 200 KIAS: the time from the stick moving to wings level (`ALL-39` expects ~3.0 s; 2.3 s would mean ~0.75°/s per knot, 3.9 s the old 0.45).
  2. The same at about 140 KIAS, to check the rate grows with speed as the model says.
  3. From idle, the time from the PCL moving forward until torque starts to rise (`TS-218`'s 3–4 s).
- [ ] **CT-156 ramp measurements (`M1` to `M47` in `3d-work` `ct156/measurements.md`) and photos (`P1` to `P15`):**
  - Phone clinometer on the canopy rail and canopy frames (`ALL-34` 2.5° ramp readings recorded in `docs/DECISIONS.md`), tyres, sill and glare shield heights, bow sections, panel bezels, rear cockpit, prop blade, cowl seams, helmet and harness, photos from each seat with seat up and down.

### 2. Shared 3D & Model Showcase (`#/showcase`)
- [ ] **CT-156 Phase 5 & Model Showcase (`V2.511`, inspected 17 Oct 2026; [modules/model-showcase/plan.md](../modules/model-showcase/plan.md), `3d-work` #117 `ct156/briefs/5-polish-and-signoff.md`):**
  - Ten defect screenshots (`W11`–`W25`) logged 17 Oct 2026 and two-step Phase 5 plan ratified (`/grill-me`):
    1. **Step 5.1 (`5-App` — Pure-JS Fixes, Live Instruments & Model Showcase Choreography):** `W11` (cheat-line stripe vs roundel), `W12` (Performance outside seats & tub), `W13` (spinner holes aligned & rotating with prop), `W19` (compass ball in `ct156-cockpit.js`), `W20` (real-time ZULU clock + live `TRQ` needle/readout & realistic companion engine/systems dials), `W23` (tail-number placard `156114`), `W24` (fix EADI & standby attitude opposite bank sign), `W25` (Model Showcase automatic gentle flight cycle + `Manoeuvre` checkbox + `Gear`/`Flaps` pill buttons + smooth gear transit + moving control surfaces, flaps, stick, and `pcl`), and `5A` (Performance helmets on other ships).
    2. **Step 5.2 (`5-Master` — Consolidated Blender Master + Bake + Meshopt Delivery + App Import):** `W12` (High full outside seats), `W14` (recessed forward-hood NACA air intakes), `W15` (unlit black chin air intake cavity around splitter rod), `W16` (`detCordFront`/`detCordRear` in `exterior/frames`), `W17` (gear handle detail & `EMER LDG GR PULL` plaque separation), `W18` (delete right-sill `pubClip`), `W19` (close canopy/sill/bow gaps), `W21` (fix pedal footwell triangles), `W22` (reshape & seat `canopyHandle`, delete floating bolt blocks), `W1`–`W3` + `W5` + `W7` + `W8`, and `5A` (`@gltf-transform/cli` Meshopt compression in `deliver.mjs`).
    3. **Step 5.3 (`5D` — Sign-Off):** Review Model Showcase and the 3D modules after Steps 5.1 and 5.2 land.
- [ ] **CT-156 cockpit sizes & questions (`TS-154` to `TS-156`):**
  1. Canopy sill distance below eye when strapped in (model ~1.7 ft vs photo ~1.0–1.2 ft; try the Camera menu eye sliders).
  2. Final-approach 3° picture on windscreen.
  3. Line astern (~10 ft nose to tail) vs 11-248 close trail (1–2 lengths).

### 3. Pat's Formation Simulator (`turn-sim`)
- [ ] **Formation B5, fighting wing on the live wingman (`V2.515`; PR `#1078`, 17 Oct 2026):**
  - The `CR` code review is done; notes in `Pat's claude work/formation-review-12oct/b5-code-review-17oct.md`. Fixed or ruled:
    - Live is the default (`TS-235`, "Keep Live, I said yes"), and the screen switch now shows it.
    - #2 escapes above Lead only when already more than 100 ft above him (`TS-233`).
    - TS-202's old fighting wing test retired at your word.
    - Bubble kisses on hard turns into #2 accepted as physics (`TS-236`).
  - Next, recommended: the should-fixes that change how #2 flies:
    - F8: the aim steps when he switches technique.
    - F7: S-turns capped at about 1°/s.
    - F6: the rig doesn't test the law that flies.
  - Then the bookkeeping fixes (F9–F18), the Lead replay (`T31`), and **Checkpoint G: you fly fighting wing on Live** and rule on its estimates (G cap Lead + 1.5 G, roll 60°/s, floor margin 100 ft, opening check turn T5). Then B4 (`TRJ`/`SARJ` from fighting wing), starting with spec 7d for your approval.
  - Two gauge cases aren't covered by `TS-236` yet: a hard turn into #2 from in position (436 ft) and a 4 G turn into #2 (374 ft, ending outside the cone). They're your call.
- [ ] **Formation Phase B (`V2.485`, merged in `#1031`; [modules/turn-sim/](../modules/turn-sim/)):**
  - Fly Live close formation, route, line astern, Corner (17 ft below Lead), and fighting wing (`TS-232` to `TS-234`).
  - Confirm whether route's quicker throttle hand is right (spec 7c.9) and formation climb torque (SMM 16.31 ~85% vs 80%, `TS-203`).
  - Ratify `TS-76` to `TS-173` wordings in [modules/turn-sim/decisions.md](../modules/turn-sim/decisions.md).
  - Confirm T-6 roll limit and G onset estimates (`TS-85`, `TS-93`) and speed brake deceleration (`TS-61`).

### 4. Traffic Pattern Simulator (`traffic`) & Pat's Fight and Turn Sim (`turn-fight`)
- [ ] **See Traffic and the PFL on screen ([modules/traffic/plan.md](../modules/traffic/plan.md) Steps 1 and 2):** Busy circuit, PFL from downwind/base/upwind, High Key, area PFL at 8,000 ft, straight-in pattern, breakouts, 3D Moose Jaw base, and Dad's new CT-102B Astra II pattern (`#1024–#1038`).
- [ ] **Traffic 3D Moose Jaw details (`TR-141`, `TR-142`, `TR-147`, `TR-148`):** Approach lights/PAPI and real taxiway letters; own building photos (if any); pins for grain elevators and radar dome.
- [ ] **See Pat's Fight and Turn Sim on screen ([modules/turn-fight/testing.md](../modules/turn-fight/testing.md)):** Smart pilot, `OVERSPEED` and `BELOW DECK` flags, and Advanced setup menu against the Energy sign-off checklist.
