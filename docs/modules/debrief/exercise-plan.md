# Large exercises, up to 16 ships: plan (proposed)

> **Status:** proposed, waiting on Patrick's yes. Dad asked on 15 Oct 2026: "Additionally lets add a to the KML viewer an large 16 ship exercises option". Dad's picks below (15 Oct 2026, card answers). Until Patrick moves it up it sits on `future.md` ("Large exercises, up to 16 ships"). It would be built after the simulated drop (plan Step 3b).

## What it does

An **Exercise** load in the Debrief: up to 16 track files (one per ship, as today), arranged as up to four flights of four. Each flight has a call sign, an aircraft type, its own colour family and its ships numbered 1 to 4 inside it. Everything the Debrief does for four ships today works for each flight: the formation judging, the gap fill, the GPS puck and timestamp settings, the altitude check, the 3D models and cameras, the DFPs, the CSV and the drop (Step 3b). Loading four files or fewer is exactly as today.

## Dad's picks (15 Oct 2026)

1. **Flights of four.** Up to four 4-ship flights (for example Cobra, Viper, Hawk, Boa), each with its own Lead; formation judging works inside each flight as it does today (Lead and #2 to #4 of that flight).
2. **Each flight its own type.** Each flight picks Harvard (CT-156), T-38A or C-130J, and its call sign; for example a Herc flight with Harvard and T-38 escorts. The drop works from any ship.

## What changes (from a first look at the code, 16 Oct 2026; to be confirmed in the spec)

Four slots are written through the Debrief: the loading and the playback window (`src/flight-data/flight.js`), the ship colours and labels (`SHIP_COLORS` in the 2D layers, the 3D view and its overlay), the camera's ship pills (`view3d/camera-modes.js`), the GPS puck, timestamp and altitude rows, the formation judging (`state.js`, the readouts), the tennis ball and EM chart, the debrief file (`debrief-session.js`) and the CSV. The plan is to keep each of these as it is for one flight and add the flight as a level above it, so a four-file load is unchanged and the judging code is used once per flight, not rewritten.

## On screen (simple screens: only the essentials showing)

- Loading: today's file list; past four files, each file also picks its flight (default: in order, four to a flight) and the flights' call signs and types sit in a small table under "More".
- Labels: the call sign and number ("Viper 3"); colours by flight (four families of four shades), so a flight reads as one group and its ships apart; ALL-42's numbers-and-labels rule kept.
- The Formation panel: one block per flight, collapsed except the flight being watched.
- Camera: pick the flight, then the ship.
- The 3D: each flight drawn as its own type; the Aircraft size setting as today.
- A screen picture comes with the spec before building.

## When data fails

A file that fails to load leaves its slot empty with the reason, and the rest load. A flight with fewer than two good tracks is shown but not judged, saying why. Performance: 16 tracks of a long sortie must still replay smoothly (the Debrief's R5); if a weak computer can't, the 3D falls back to light models for ships far from the camera (the T-38A and C-130J light files exist for this).

## Steps

0. **Patrick's yes** on this plan.
1. **Spec, requirements and decisions** with the screen picture, approved before code.
2. **Flights as a level above the four slots** in the loading, the playback window and the debrief file; a four-file load unchanged.
3. **Colours, labels, the Formation panel, the camera pills and the 3D types** per flight.
4. **The CSV and the drop** per ship and flight.
5. **One light test:** a 16-file load gives four flights, each judged as a four-ship would be alone.
6. **Sign-off checklist** run on a real large exercise's tracks (Dad to provide, or the example flight copied into four flights).

## Questions still open (one at a time, for Dad or Patrick)

- How many ships can a flight have (exactly four, or two to four)?
- Whether ships from different flights get a "closest approach" readout (deconfliction), or that stays a future idea.
- Whether a real 16-ship exercise's tracks exist to test with.

## Not in this plan

More than 16 ships, live tracks, and an exercise planner. Each would be its own plan item if Patrick wants it.
