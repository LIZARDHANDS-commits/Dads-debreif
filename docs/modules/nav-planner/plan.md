# Low-level Navigation Planner: plan (approved)

> **Status:** approved. Patrick's yes, relayed by Dad, 16 Oct 2026: "pat yes, build the nav planner" (ALL-43). Steps 0 to 5 being built for V2.483. Dad asked on 16 Oct 2026, from the idea list: "Low-level navigation planner: draw a route, get legs, times, fuel and terrain clearance, then fly it in the Debrief or check it against a real track. Could we do this better than falcon view?" Dad's picks below (16 Oct 2026, card answers).

## What it is

A training and debrief planner for low-level navigation, in the browser: draw a route, get each leg's track, distance, time, fuel and terrain clearance, brief it in 2D and 3D, then load the flown KML track and see, leg by leg, how the flying matched the plan. It carries "Not for flight planning", as the SOF does: it is a training tool, never a replacement for authorized mission planning.

## Against FalconView (Dad's question)

What it can do better: nothing to install (FalconView is a Windows program that needs NGA chart and terrain data loaded); the plan-to-flown comparison, which FalconView does not do; leg times and fuel from the CT-156's own numbers already in the tool, with the forecast winds aloft the Debrief already fetches for each leg's height; terrain clearance and the SOF's airspace, NOTAMs, lightning and weather along the route in one picture; a 3D fly-through on the Debrief's terrain and satellite ground.

What it can't or shouldn't match: official charts (Canadian VNCs are NAV CANADA copyright and never shipped; US sectionals are public), survey-grade terrain (the free terrain tiles are about 30 m, coarser than NGA's DTED level 2, so clearance is labelled an estimate), obstacles in Canada (the FAA's obstacle file is public for the US; a free Canadian source is not yet known), Canadian military low-level routes (not public; the US IR, VR and SR routes are in public FAA data), and authority for real mission planning.

## Dad's picks (16 Oct 2026)

1. **Plan, then debrief.** Route, legs, times, fuel and terrain clearance, briefed in 2D and 3D; then the flown track loaded against it, with leg-by-leg time and track errors. A new module that shares the Debrief's map, 3D view, terrain and satellite ground, and loading code.
2. **Moose Jaw first, then the US bases.** 15 Wing on satellite imagery and terrain first (no Canadian charts; obstacles still to find); the seven US T-6 bases next, with the public FAA sectional, obstacle file and military training routes.
3. **Tap points, then edit.** Tap turn points on the map, drag to move them, and type each leg's height (AGL or MSL), speed and turn point name in a table; save and open as a file; import and export KML or GPX, so a route goes to and from ForeFlight or a GPS.

## What it would show (first build, to settle in the spec)

- Each leg: track (°T and °M with the field's variation), distance, ground speed from the planned airspeed and the forecast wind at its height, time and running time, fuel and fuel remaining.
- Terrain clearance: the lowest clearance along each leg against the planned height, from the shared terrain tiles, with the highest point marked; a set minimum clearance flagged on screen, never a wall (the minimum's default from Patrick or a manual page; until then an estimate).
- A route card to print.
- 3D fly-through along the route at the planned speed.
- Against a flown track: each turn point's time early or late, the track error along each leg, height against plan, and the whole replayed in the Debrief's 2D and 3D.

## Sources and estimates

Speeds and fuel from core's CT-156 performance (cruise and low-level fuel flow need a manual page or Patrick's ruling; estimates until then). Winds from the Debrief's winds aloft (HRDPS, HRRR in the US). Terrain from the shared Terrarium tiles (Mapzen/AWS). Every number labelled with its source or as an estimate, as the rule book asks.

## When data fails

No winds: still air, said on every leg. Terrain tiles missing: clearance shown as unknown on that leg, never as clear. A route file that fails to load: refused with the reason, nothing half-loaded. Imported files are untrusted (range-checked, as the Debrief's KML loading is).

## Steps

- [x] 0. Patrick's yes (relayed by Dad, 16 Oct 2026), and the whole-tool decision for the new module (ALL-43).
- [x] 1. Spec, requirements and decisions (NP-), with the screen's picture (`spec.md`, `requirements.md`, `decisions.md`, `screen.png`). Approved with the module (the brief's working answers stand until Patrick says otherwise).
- [ ] 2. Route editing, legs, times and fuel at Moose Jaw (V2.483).
- [ ] 3. Terrain clearance and the route card (V2.483).
- [ ] 4. Brief: 2D and 3D fly-through, and **Brief mode** (Dad, 16 Oct 2026: "COuld this be a low level Briefing tool"; card pick "Add a Brief mode"; NP-11): a full-screen, leg-by-leg page with Next and Back and the arrow keys, each leg's run-in picture of its next turn point from the planned height 1 NM before it (estimate), and the leg's heading, time, ground speed, height, fuel remaining and hazards (V2.483).
- [ ] 5. Debrief: the flown track against the plan (V2.483).
- [ ] 6. The US bases: sectionals, obstacles, military training routes (not in this piece).
- [ ] 7. Sign-off checklist in Dad's and Patrick's words, on a real low-level route and its flown track (`testing.md`).

## Questions still open (working answers in the tool until answered)

- The minimum terrain clearance to flag, and whether it changes by leg type. **Working answer:** 500 ft, one value for every leg, an estimate; a flag, never a wall (NP-5).
- The CT-156's low-level fuel flow and cruise speeds (manual page or Patrick's ruling). **Working answer:** 240 KIAS, 500 lb/h and 1,100 lb start fuel, all estimates and settable (NP-2, NP-7).
- A Canadian obstacle source. **Working answer:** none; "no Canadian obstacle data" said on screen (NP-13).
- Whether routes should snap to known turn points (towns, lakes, the SOF's airfields). **Working answer:** no (`future.md`).
- New with the build: how an AGL leg is flown (NP-Q1), the typed wind in °T or °M (NP-Q2), the fuel numbers (NP-Q3): see the README.
