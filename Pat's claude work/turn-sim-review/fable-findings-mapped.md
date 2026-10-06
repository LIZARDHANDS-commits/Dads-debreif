# Fable's engine review, mapped back to our code

Source: `/mnt/project-files/formation-review-package/report/report.md` (Fable, medium, read-only, 6 Oct 2026, main 768c568 = V2.154).
Names are put back to ours: cone position = fighting wing, `fw-pointing.js` = `fw-pursuit.js`, lead point / nose on / lag point = lead / pure / lag pursuit. File:line numbers match our main (checked: `slots.js:95,100`, `turning-rejoin.js:77,654`, `tracker.js:120`).

## Headline
Keep plan-at-press (path drawn = path flown). Make the tracker the one pilot model every move uses, with a small coarse search left only for real choices (side, cut, roll or plain, dive or zoom). Today a wingman is flown four different ways (tracker, lines-then-tracker, held-command rejoin planners, point-mass roll paths), and that is the root of the copied rules, dead code, 7-deep search and slow presses.

## Findings, ranked (cost)
1. Four ways to fly a wingman; root cause of most below (high).
2. Fighting wing band written in 6 places with 4 widths: 500-1,000/30-60, 450-1,250/25-65, 400-1,300/20-70, bubble 500/1,000 (`slots.js:95,100`, `judge.js:53-58`, `moves.js:229,75`, LAG_ROLL, `fluid.js:44,399`) (low).
3. Overshoot lane margin 100 ft copied 3 times; 1,000/2,000 ft ranges hard-coded twice (`chooser.js:39`, `replan.js:25`, `transitions.js:49`, `kinematic-moves.js:231`, `rolling-rejoin.js:104`) (low).
4. `flyToDecision` and the 3/9 check duplicated in turning and straight rejoin, ~170 lines each (medium).
5. Core maths re-derived: climb cost x6, turn radius x5 (core has it), stall bank x4, DEG x11, a second kt-to-ft/s constant 1.6878 vs core 1.68781 (low).
6. Dead code: TS-81 decision-point and picture-break events, RULED_REJOIN (nulls), `planGoTo` fallback loop, FW_TURN.gentleBankDeg, REJOIN hot/cold bearings (low).
7. Turning rejoin search 7 loops deep, leaves up to 3,600 steps; main cause of 1-15 s presses (medium).
8. TRJ + roll: 72 rolls then up to 6 full searches; that's the 15 s (low-medium).
9. Files doing several jobs: `transitions.js`, `formation.js`, `hand-over.js`, `tracker.js` (medium, moves only).
10. Long functions: `runTracker` ~230 lines, `flyToDecision` ~170, `flyWith` ~120, `createFormation` ~540 (medium).
11. Numbers without a source in the 4-ship files and the judge (`four-close.js`, `four-rejoin.js`, `four-open.js`, `four-legs.js`, `move-in-band.js`, `judge.js`) (low).
12. One 30 ft/s height rate shared by three rules (tracker height rate = TRJ descent = cone climb) (low).
13. Side-selection boilerplate in 7 files (low).
14. Unclear names (`flyWith` x2, `trackTwice`, `fly2`, `kcap`, one-letter args) (low).
15. Stale comments (roll "90°/s", `hot-rejoin.js`, spec section 12) (low).
16. Judge keeps its own wider band table, so "in position" and "nearest formation" can disagree at the edges (low).

## Questions it raised for Patrick
- 4-ship legs still carry bank caps 45° (`four-rejoin.js:181,192`) and 75° (`four-open.js:157`) despite the no-bank-cap rulings. Intended or left over?
- 5% torque floor: not found; `slow-down.js:42` POWER_FLOOR_THROTTLE = 0.
- The shared 30 ft/s height rate: meant for all three rules?
- The judge's wider regions: a ruling or a convenience?

## Six-step refactor (one PR each)
1. Numbers and helpers: one fighting wing table, one lane rule, maths from core. No flying change (except the 0.01% constant).
2. Dead code and docs: delete the dead events and fields, mark TS-81 superseded. No flying change.
3. File splits and names. No flying change.
4. One rejoin law, coarse-then-fine search, rank rolls first. Flying within shared margins; faster presses.
5. One pilot model: lines, echelon-to-FW and open-out become tracker recipes. Patrick re-flies the 10 s echelon-to-FW and full-power open-out.
6. Judge on the one table.
Each step is proved by a before/after flight set (2-ship and 4-ship sequence, end states, G, closest approach, lowest speed).

## Fable didn't look at
Nothing run; press-time numbers are loop counts. Fluid, errors, 4-ship and lag-roll bodies read at header level only. No screens or tests.

## Follow-ups (report section 6, 20:30Z)
1. **Skimmed files, now read:** a fifth fighting wing width (LAG_ROLL 400-1,250 / 20-70, `moves.js:479-480`); Fluid's own cone (30° either side of the tail, SMM 16.17 para 42), which is a different thing and stays separate; a third name for the 500 ft bubble (LAG_ROLL.bubbleFt, FLUID.bubbleFt, rolling-rejoin); a fourth height-for-speed formula (`errors.js:623-664`); three copies of "settle anywhere in the cone" (`four-close.js:343`, `four-rejoin.js:131`, `four-open.js:84`).
   **5% torque floor found:** `moves.js:34` REJOIN.floorTorquePct, through `power.js:59`, used at `tracker.js:308`, `turning-rejoin.js:177,363`, `straight-rejoin.js:102`. That question is closed.
2. **Step 1 recipe written** (report 6.2): one CONE table, one LANE rule, every call site. The only flying change is the knots constant (1 part in 170,000). Three sites stay separate until Patrick rules:
   - lag roll far edge 1,250 vs judge 1,300;
   - `replan.js:160` lane clamp vs the chooser's;
   - Fluid's cone.
3. **The two flyToDecision copies:** 17 differences. A "Lead turning" flag covers 14. The 3 real technique differences are:
   - the sustained-bank cut near the floor (only the turning rejoin has it);
   - the window and near-edge stop check (inside the straight rejoin's law);
   - the hot branch (turning rejoin only).
4. **Handling** (report 6.4):
   - **Rates becomes an experience profile:** one row per level, covering G aim, roll rate share, G onset, how much of the cone's height he uses, and how the power is handled. The envelope, windows and bands are the same for all levels.
   - **One speed table**, each row marked limit (physics, the 200 KIAS floor, the overshoot call) or target (everything else).
   - **Eight places it jerks today**, mostly hand-overs between planners, speed being set directly, and power stages flipping.
   - **The fix is one command path:** every planner gives an aim, a closure and an energy intent, and one law turns them into bank, G and power. That gives one jerk limit, power hysteresis, shaped roll, and speed owned by the physics.
   - **Clashes with Patrick's rulings: DROPPED (Patrick 6 Oct 21:25Z "yeah ditch those"):**
     - its Rates G aims (3/4/5 G) go against "No on bank and g" (5 Oct 06:07Z);
     - its Student "uses power before geometry" goes against "Geometry first, power as needed, always".
