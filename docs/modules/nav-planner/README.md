# Low-level Navigation Planner

This folder is the low-level navigation planner: draw a route at Moose Jaw, get each leg's track, heading, distance, time, fuel and terrain clearance, brief it in 2D, 3D and a leg-by-leg Brief mode, print a route card, then load the flown KML track and see how the flying matched the plan. Not for flight planning: a training and debrief tool. Start here, then read only the file you need.

## Where it stands

**Approved (Patrick's yes relayed by Dad, 16 Oct 2026: "pat yes, build the nav planner"; ALL-43). Plan steps 0 to 5 being built for V2.483 on branch `claude/nav-planner-plan`; not yet seen in the app by Patrick or Dad.** Step 6 (the US bases) is not started. The code is in `src/modules/nav-planner/`.

## What is next

1. Patrick or Dad opens the planner from the home screen, tries the Example route and Brief mode, and loads a flown track against a plan.
2. Patrick answers NP-Q1 to NP-Q3 below (one at a time).
3. The sign-off checklist in `testing.md`.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: the screen, which airspeed, heights, terrain clearance, times, fuel, winds, Brief mode, the route card, the debrief, files, and what happens when data fails |
| `requirements.md` | What the module must do (NP-R), in Dad's words, with how each is checked |
| `decisions.md` | Decisions in force (NP-) and those waiting on a question |
| `testing.md` | This module's one test and its sign-off checklist |
| `plan.md` | Dad's ask and picks, the ordered steps and checkboxes |
| `future.md` | Ideas not being built until Patrick moves them up |
| `screen.png` | The built screen (V2.483) |
| `../../../src/modules/nav-planner/` | The code, with its own short README |

## Open questions

Each has a working answer the tool uses until it is settled. Also on the waiting list in `../../PLAN.md`.

| ID | Question | Options | Working answer |
|---|---|---|---|
| NP-Q1 | How is a leg planned "500 ft AGL" flown, for the terrain check? | (a) Contouring: the aircraft holds 500 ft above the ground under it, so the leg's clearance is 500 ft, and the table also shows the leg's highest ground and the MSL altitude that clears it by the minimum; (b) level at 500 ft above the ground at the leg's start point, so rising ground along the leg shows as less clearance; (c) your idea | (a) |
| NP-Q2 | The typed wind: in °T (as forecast winds aloft are given) or °M (as the Traffic sim's surface wind is)? | (a) °T, labelled; (b) °M; (c) your idea | (a) |
| NP-Q3 | The CT-156's numbers for the planner: low-level speed, fuel flow and start fuel | (a) a manual page you name; (b) your own figures; (c) keep the estimates (240 KIAS, 500 lb/h, 1,100 lb) | (c) until you say |
