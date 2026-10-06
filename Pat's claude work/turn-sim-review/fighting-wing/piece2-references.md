# Piece 2 (live wingman, fighting wing and fluid): references and Patrick's adds

Turn Sim thread, 4 Oct 17:13Z. Read this together with `design.md` in this folder (its "Patrick's answers" are binding). Page references only; manual text stays in /mnt/project-files/manuals/ and never goes in the repo.

## Patrick's adds (4 Oct 17:12-17:13Z)
- "Make sure it knows where all of the references are" for pursuit curves and fluid manoeuvring (this list).
- **A distance setting** (the range target the wingman holds; design 5.6 already has 500-1,000 ft, defaults FW 650 ft and FM 600 ft as estimates; show it as an essential setting).
- **Loop technique, his words:** "in loops it needs to lag on the way up, try to cross horizon with fuselages both parallel, and lead on the way down to stay in position." The wingman's pursuit choice must change through a manoeuvre the way a pilot's does (lag going up, pure/parallel over the top, lead coming down), not one generic catch-up gain. Do the same reasoning for every Lead manoeuvre and write it down per manoeuvre, sourced or marked as estimate.
- **Entry and exit speeds, and how each aerobatic manoeuvre is flown**, from the manuals below.

## Pursuit curves, aspect, HCA
- SMM 12.30: lead, pure and lag pursuit (Fig 12.24 `images/smm-fig12-24-lead-and-lag-pursuit-curves.png`, Fig 12.25 cockpit view).
- SMM 12.2: heading crossing angle (Fig 12.2). SMM 16.16: pursuit curves in fluid, aspect angle and HCA (Figs 16.9 and 16.10).
- EFIG p.390-391: lead, lag and pure pursuit teaching points (how bank and pitch place the nose).

## Fighting wing and fluid manoeuvring
- SMM 12.29 (fighting wing, cone 30-60°, 500-1,000 ft), 12.36, 16.15, 16.17 (fluid manoeuvring: cone, bubble, wingman G aim, terminate, wingovers, standard sequence), 16.20, 16.38-16.40 (four-ship FW and fluid).
- AFM7 brief p.14, p.17 (FW and fluid 4 brief); AFM8 brief, offset box via fluid 4 and fluid manoeuvring pages (see four-ship/design.md for page numbers).
- EFIG p.72-76, 93-100 (fighting wing and fluid, lead and wing), p.460.
- 2 CFFTS Orders B2 ch 8 (G limits in FW/fluid, up to three aircraft, minimum altitude for formation wingovers/aerobatics in fluid, the fluid manoeuvring calls).
- Gen Book p.11 (bubble, G).

## Aerobatics: how each is flown, entry and exit speeds
- SMM 7.3-7.12, basic aerobatics: aileron roll (7.4), loop (7.5, Fig 7.2), Cuban eight (7.6), cloverleaf (7.7), roll off the top (7.9), looping limits 200-250 KIAS (7.12).
- SMM 14.3-14.20, advanced aerobatics: Table 14.1 entry parameters (14.4), barrel roll (14.8), Immelmann (14.15 para 39), split-S (14.16 para 40), slice (14.18), vertical 8 (14.19), vertical roll (14.20). Entry speeds assume about 10,000 ft MSL (14.5).
- `formation-and-turn-numbers.md` (Table 14.1 summary; EFIG p.433, 174 aerobatic entry speeds).
- EFIG aerobatics pages: loop p.54, 58, 136, 141, 170-174; Cuban p.141-143, 191-192; barrel roll p.78-84, 418-420; Immelmann p.421-422, 434-436.
- Wingover in formation: SMM 16.17 para 47.

## Code to read first
- Fight Sim pursuit code (moving to src/core as piece 2's first step): src/modules/turn-fight/energy/moves/pursuit.js, lookahead.js, smoothing.js. Never import turn-fight.
- src/core/point-mass.js (stepPointMass, upFrom), t6-performance.js (thrust, drag, shaker), angles.js (aspect, HCA, horizontal only today), flight-math.js (easeRoll).
- Turn Sim live code: live/flight.js, live/transitions.js, live/formation.js.

## Shared core, as of 4 Oct 17:16Z (coordinator)
Fight Sim already moved these into src/core (#295): point-mass.js upFrom, liftTowardAim, gAndBankForLift, turnPlaneNormal; t6-performance.js excessFnFor; flight-math.js easeValue (same as easeRoll); angles.js aspectAngle3dDeg, headingCrossAngle3dDeg. controlPursuit and smoothInputs stayed in Fight Sim, so build the wingman's own guards on top of the core pieces, with no second copies. The Turn Sim thread is now the only writer to src/core and may extend these pieces, as long as Fight Sim still flies the same.

## Method setting (Patrick 18:03Z)
Wingman method is a setting: Planned (default, scripted positions following the lag-up, parallel-over-the-top, lead-down rule) or Live (physics, real energy). Build Planned first; Live comes after, on the core pieces.
