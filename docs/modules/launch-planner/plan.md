# Launch Planner: plan (proposed)

> **Status:** proposed, waiting on Patrick's yes. Dad asked on 16 Oct 2026, showing a day's flying schedule (kept out of the repo: it carries names): "Is there a better way to display schedule data than this. Is it Better to waterfall launches or wave launch when we have limited aircraft", then "Start thinking. Clear names. Generic is fine instructor A, student b. If I have a set flying window can we assess the most efficient schedule too".

## What it would do

1. **Show a flying day the way the limits bite:** one row per aircraft (tail), each sortie and turn as a block, sims and duties (SOF, duty desk) in their own lanes, colour by status (planned, airborne, landed, cancelled for weather, maintenance or student), a "now" line, and a capacity strip along the top: aircraft airborne, aircraft serviceable, and landings in each 15 minutes. Conflicts flagged (a crew double-booked, a turn under the minimum, crew-day limits). A "my day" card for one person.
2. **Compare launch plans** for a set flying window: waves, split waves and waterfall, each with its sorties, aircraft hours, peak landings in 15 minutes and peak aircraft turning at once, side by side.
3. **Find the most efficient schedule** for the window: the launch times per tail that give the most sorties, or the most sorties with the circuit's peak held under a chosen number, then crews placed into the slots within their limits.
4. **Watch it in Traffic:** the chosen plan's launches and recoveries run through the Traffic sim at Moose Jaw, so the circuit under each plan can be seen, not just counted.

## A worked example (made-up inputs, 16 Oct 2026)

Inputs, examples only: 10 aircraft, 1.4 h sorties (takeoff to landing), 41 min minimum turn (so a 2 h 05 cycle, as on the schedule Dad showed), first takeoff 08:00, last landing by 18:00, 2 min between takeoffs on one runway.

- **Each aircraft can fly at most 5 sorties** in that window: after five 2 h 05 cycles only **16 minutes** of the day are left over.
- **Tight waves are the most efficient here: 49 sorties** (68.6 aircraft hours; the 10th aircraft, launching 18 min after the first, just misses its 5th). But up to **8 landings in 15 minutes**, and all 10 aircraft turning at once.
- **Every tail moved out of the opening wave costs one sortie** in this window, because it can't fit its 5th flight before 18:00. Spreading the launches trades sorties for a quieter circuit:

| Launches spread over | Sorties | Peak landings in 15 min | Peak aircraft turning at once |
|---|---|---|---|
| 18 min (waves) | 49 | 8 | 10 |
| 30 min | 45 | 5 | 10 |
| 45 min | 44 | 3 | 9 |
| 60 min (split waves) | 43 to 45 | 3 to 5 | 7 |
| 90 to 112 min (waterfall) | 42 | 2 | 4 to 5 |

- **The levers that change it:** the waterfall's smoothing is free only when the day has slack. Six minutes shaved off the turn (35 min) leaves about 40 minutes of slack, enough to spread the launches 40 minutes and keep all 50 sorties. A longer window, shorter sorties late in the day (or a sim instead of the 5th sortie) do the same.
- **The pilot-level rule it suggests:** with limited aircraft and a full day, wave launches maximise sorties; waterfall buys a quieter circuit and steadier turns at a price of about one sortie per aircraft moved out of the opening wave, unless the day has slack to absorb the spread. All numbers here come from the made-up inputs, not 15 Wing's.

A mock-up of the display with generic crews was made for Dad (aircraft rows and the landings strip, waves against split waves); it is in the session's scratch folder and goes into the spec with the screen pictures.

## How "most efficient" would be worked out

- **Step 1, the aircraft:** for each tail, its first launch time; every later sortie follows one turn after landing. With a handful of tails and minute steps this is small enough to search exhaustively in the browser, so the answer is exact for the inputs, not a guess. The goal is picked on screen: most sorties; most sorties with peak landings at or under N; or the quietest circuit that still gives M sorties.
- **Step 2, the crews:** each instructor and student placed into a slot, respecting brief and debrief time, sorties per day, crew day and who needs which sortie. A simple, explained greedy fill first, each placement's reason shown; anything cleverer only if Patrick wants it (no new libraries without his yes).
- **Constraints it would know:** the flying window (and sunset), aircraft available and when (maintenance out), sortie lengths by type, minimum turn, takeoff spacing, circuit capacity, brief and debrief times, crew limits, sims and duty slots. Every default is an estimate until Patrick or a manual page gives it; limits from orders are flagged, never walls (rule book).

## Names and privacy

No real names in the repo, the examples or the tests: generic labels ("Instructor A", "Student 12"). A real schedule typed or imported on a computer stays in that browser (nothing sent anywhere), and a saved file is the user's own. Imported schedules are untrusted files (range-checked).

## When data fails

A schedule file that can't be read is refused with the reason, nothing half-loaded. Inputs that can't fit (a sortie longer than the window) are said, not silently dropped. Traffic can't load: the comparison still shows its numbers.

## Dad's picks (16 Oct 2026, card answers)

1. **Users: both.** The scheduler plans tomorrow's launches and crews; the SOF uses the same day view live (airborne, landed, cancelled) and re-plans after a weather hold.
2. **Input: typed or pasted.** The day typed in a table, or rows pasted from a spreadsheet; crews as labels, or real names kept only in that browser.
3. **Default goal: most sorties with the circuit capped.** The most sorties that keep landings at or under a set number per 15 minutes (5 as a starting default, an estimate; changeable on screen).
4. **Where: its own module**, a "Launch Planner" card on the home screen, with a small link from the SOF to today's plan.

## Questions still open (for Patrick)

- The circuit cap's default, and whether it changes by runway in use or by mix (CT-156, CT-102B).
- The real minimum turn, brief and debrief times, and crew limits, from Patrick or the orders (estimates until then; limits flagged, never walls).
- Whether the SOF's live tracking should mark aircraft airborne from the traffic feed automatically, or by hand only.

## Not in this plan

Student syllabus tracking, who-flew-what records, and links to any official scheduling system.
