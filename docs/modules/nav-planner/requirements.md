# Low-level Navigation Planner: requirements (NP-R)

Each line is in Dad's words where he gave them, with how it is checked. Source: Dad, 16 Oct 2026 (his ask: "Low-level navigation planner: draw a route, get legs, times, fuel and terrain clearance, then fly it in the Debrief or check it against a real track. Could we do this better than falcon view?", and his three card picks in `plan.md`); Patrick's yes relayed by Dad the same day.

| ID | Requirement | How it is checked |
|---|---|---|
| NP-R1 | "Draw a route": tap turn points on the map, drag to move them, delete them, and type each turn point's name, position, and its leg's height (AGL or MSL) and planned speed in a table (Dad's pick 3, "tap points, then edit"). | Checklist: build a five-leg route at Moose Jaw by tapping, drag one point, delete one, rename one. |
| NP-R2 | "Get legs, times, fuel": each leg's true and magnetic track, heading to fly, distance, true airspeed, ground speed with the wind, leg and running time, fuel used and remaining, each number with its source or marked an estimate. | The one test (tracks, ground speeds and times against standard navigation); checklist. |
| NP-R3 | Winds: the forecast winds aloft for each leg's height (the Debrief's model winds), a typed wind, or none, and the screen says which; no winds means still air, said on every leg. | Checklist: each of the three choices; with the network off, model winds fall back to still air with the reason. |
| NP-R4 | "Terrain clearance": the lowest clearance along each leg against its planned height, the highest point marked, legs below a set minimum flagged on screen (never a wall); missing terrain says "unknown", never "clear". | Checklist: an MSL leg over the Dirt Hills set low shows [LOW]; with terrain tiles blocked the legs say unknown. |
| NP-R5 | A route card to print. | Checklist: Route card opens the print dialog with one page holding the legs and "Not for flight planning". |
| NP-R6 | Brief in 2D and 3D: the route on the map, and a 3D fly-through on the Debrief's terrain and satellite ground at the planned speeds (play, pause, speed). | Checklist: play the fly-through at 8×. |
| NP-R7 | Brief mode (Dad, 16 Oct 2026: "COuld this be a low level Briefing tool"): full screen, leg by leg with Next and Back and the arrow keys, each leg's run-in picture of the next turn point from the planned height, its heading, time, ground speed, height, fuel remaining and hazards. | Checklist: brief the example route to the end and back. |
| NP-R8 | "Check it against a real track": load a flown KML and see each turn point's time early or late, each leg's track error and height against the plan, in 2D and replayed in 3D. | Checklist: Dad's CBRA32 track against a plan of its route. |
| NP-R9 | Save and open the route as a file, and import and export KML and GPX "so a route goes to and from ForeFlight or a GPS" (Dad's pick 3); every opened file is untrusted, range-checked and refused whole with the reason if bad. | Checklist: save, open, export KML and GPX and import them back; open a file with a bad latitude and see it refused. |
| NP-R10 | Moose Jaw first (Dad's pick 2): 15 Wing on satellite imagery and terrain; no Canadian charts; "no Canadian obstacle data" said on screen. | Checklist. |
| NP-R11 | "Not for flight planning" on screen and on the route card (plan.md). | Checklist. |
