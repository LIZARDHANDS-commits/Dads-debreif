# Low-level Navigation Planner: testing

The policy is `../../TESTING.md`. This module adds:

- **The one light test**, `tests/unit/nav-planner/legs.test.js`: a known two-leg route (20 NM due north, then 15 NM due east, at 2,500 ft MSL and 240 KIAS) with a typed wind of 270°T at 30 kt gives each leg's true and magnetic track, true airspeed, ground speed and time as standard navigation works them out in the test (one minute of latitude is one nautical mile; the standard atmosphere's density; the wind triangle written out), within the shared margins (±5°, ±10 kt, ±100 ft on distance, ±5 % on time because a time follows from the speed's margin). It serves NP-R2. No expected value comes from the planner's own output.
- Terrain clearance, files, the map, the 3D fly-through, Brief mode and the debrief are checked by the sign-off checklist and pictures, not by tests (one test per piece of work, rule book).

## Sign-off checklist (in Dad's and Patrick's words once the spec is approved)

- [ ] From the default start, open the Low-level Navigation Planner from the home screen: Moose Jaw on satellite imagery, "Not for flight planning" in the bar.
- [ ] Tap a five-leg route round Moose Jaw; drag a point; delete one; rename one; set one leg to MSL.
- [ ] The legs show °T, °M, heading, NM, KTAS, ground speed, times and fuel; the estimates say so.
- [ ] Wind: None says still air on every leg; Typed changes the headings and times; Model winds aloft gives each leg its own wind or says why not.
- [ ] An MSL leg set low over the Dirt Hills shows [LOW]; the highest point is marked; with the terrain blocked, legs say unknown.
- [ ] Route card prints one page with "Not for flight planning".
- [ ] 3D: the route at its heights, the fly-through plays, pauses and changes speed.
- [ ] Brief mode: Next and Back through every leg (and the arrow keys); each page shows the run-in picture and the leg's numbers and hazards.
- [ ] Save, open, export KML and GPX, import both back; a file with a bad value is refused with the reason.
- [ ] Load a real flown KML against its plan: early/late at each turn point, track error and height per leg, the flown track in 2D, replayed in 3D.
