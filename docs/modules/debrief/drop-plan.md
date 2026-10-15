# Simulated drop over a drop zone: plan (approved)

> **Status:** approved: Patrick said yes (relayed by Dad, 15 Oct 2026: "pat says yes"). Dad asked on 15 Oct 2026: "After the herc. can we build a simulated drop in the KML viewer. So an inert bomb or cargo load over a drop zone. so we can see the inertia and whether or not it'd land on target". Dad's picks below (15 Oct 2026, card answers). It is built after the C-130J model (shared plan Step 3e), as Dad asked; its spec and decisions are written and approved before any code (Debrief plan Step 3b).

## What it does

In the Debrief (the KML viewer), a load leaves a ship at a moment on its loaded track, with the ship's velocity at that moment, falls under gravity and drag through the wind, and is drawn falling to the ground in 2D and 3D, with its trail. Where it lands is marked against a drop zone placed on the map, with the miss distance and its clock direction from the point of impact. The tool also shows where the ship should have released to hit the point of impact (the computed air release point, CARP) for the track's speed, height and heading at that moment.

Nothing about the flown track changes: the drop is drawn over the replay, and a loaded flight with no drop looks exactly as before.

## Dad's picks (15 Oct 2026)

1. **Loads: both, one model.** An inert practice bomb (free fall) or a cargo bundle on a parachute, picked per drop; one falling-object calculation serves both, the cargo adding a parachute that opens after a delay.
2. **Release: both.** Dad taps **Drop** at a moment in the replay (or sets a release time), it falls and the miss shows; and the tool shows the ideal release point (CARP) and release line for that pass.
3. **Wind: the Debrief's model winds aloft, with a typed override.** The existing Winds aloft (HRDPS by default, HRRR in the US; `src/modules/debrief/weather/winds.js`) at each height for the flight's time, with boxes to type a wind at release height and at the ground instead (for example the drop zone's measured wind). No new outside data source.
4. **Drop zone: tap the map, set a size.** Tap to place the point of impact, then a circle with a radius or a box with length, width and run-in heading; saved with the debrief.
5. **Load data: two presets, adjustable.** A 25 lb BDU-33 practice bomb, and an A-22 cargo bag on a G-12 parachute (the standard container drop); weight, drag and parachute numbers under "More".

## The math (written down before any code)

Search first: core has the atmosphere (density with height, `src/core/atmosphere.js`), the units, the wind vector helper (`windVectorFtps`) and the Debrief's winds aloft; there is no falling-object math yet, so this adds one small core function (`src/core/drop.js`), used by the Debrief only at first.

- **State:** position (ft, east, north, up) and velocity over the ground (ft/s), stepped every 0.05 s (the shared point mass's step) from release to the ground.
- **Release:** the ship's ground velocity at the moment from the track (the same smoothed velocity the readouts use), its height (corrected from the ground as DB-28 does), plus the wind at that height gives its true airspeed. The load starts with the ship's velocity: it leaves with the aircraft's inertia.
- **Forces:** gravity (32.174 ft/s²) and drag along the air-relative velocity (the velocity less the wind at the load's height): drag ÷ mass = ½ ρ v² Cd·A ÷ m, ρ from the standard atmosphere at the load's height (or the day's temperature where the Debrief has it). Speeds: drag uses true air-relative speed; the readouts quote ground speed and true airspeed by name.
- **Parachute (cargo):** for the open delay the bundle falls as cargo (its own Cd·A); then the canopy's Cd·A takes over, building over the opening time, so it settles to its steady descent rate. The steady rate is a check on the numbers: at the canopy's Cd·A and the load's weight it must give the published rate of descent.
- **Ground:** it stops where it meets the terrain under it (the Debrief's terrain tiles when Ground is terrain; the track's ground otherwise).
- **CARP:** the same calculation run backwards from the point of impact: for the pass's ground track, speed and height, the release point is the point of impact less the load's travel over the ground (forward throw plus drift), found by stepping the fall from a trial release and moving the trial by the miss until it is within 10 ft (an estimate; a few passes).

## The numbers (sources to be checked; estimates until then)

| Number | Working value | Source |
|---|---|---|
| BDU-33 weight | about 25 lb | public (USAF and US Navy practice bomb pages); to check |
| BDU-33 Cd·A | estimate from its size (about 4 in diameter) and a low-drag bomb's Cd; to check against a published ballistic table | estimate |
| A-22 bag rigged weight | up to 2,200 lb (rigged); preset about 1,000 lb | AFMAN 11-231 (Computed Air Release Point Procedures, public on e-Publishing) and the A-22 rigging manual; to check |
| G-12 rate of descent | about 28 ft/s (a published figure; varies by source and weight) | AFMAN 11-231 ballistic data; to check |
| Open delay and time to open | estimates until AFMAN 11-231's ballistic data is read | estimate |

Every number lands in this table with its page before it is used in code; AFMAN 11-231 is a public USAF publication, so its page is cited, never copied.

## On screen (simple screens: off until opened)

A "Drop" box in Tools, closed by default: load (BDU-33 or A-22/G-12), Drop at the replay's moment or a set release time, drop zone (place, circle or box), wind (model or typed), and "More" for the load numbers. While open: the falling load and its trail in 2D and 3D; the drop zone; the impact mark with "Miss 340 ft at 2 o'clock" (an example); the CARP mark and release line for the pass. A screen picture comes with the spec before building, as the rule book asks.

## When data fails

- No winds aloft (fetch failed, no model at that time, or below its lowest level): the drop uses the typed wind if there is one, else still air, and says "No wind data: still air" beside the impact. Never a silent zero.
- A release with too few good fixes around it to know the ship's velocity: no drop, with the reason.
- Terrain tiles missing: lands on the track's ground height, saying so.
- Published limits (a load's release speed or height limits) are shown as flags, never walls.

## Steps

0. **Patrick's yes** on this plan (given 15 Oct 2026, relayed by Dad).
1. **Numbers:** read AFMAN 11-231 (and the BDU-33's published data) into the table above with pages; mark what stays an estimate.
2. **Spec, requirements and decisions** (DB-36 onward) with the screen picture, approved before code.
3. **Core `drop.js`** (the fall and the CARP) with one light test: a load dropped in still air from a known height and speed lands where standard physics puts it (with drag set to zero, the vacuum throw; with the G-12, a fall time near height ÷ the published descent rate), within the shared margins.
4. **Debrief:** the Drop box, the drawing in 2D and 3D, saved with the debrief.
5. **Sign-off checklist** in Dad's and Patrick's words, run on a real flight with a known drop.

## Not in this plan

Real weapons or delivery modes, a sight picture or pipper, personnel parachutes, a high-altitude drop's free-fall stages, and dropping from Traffic or the Formation sim. Each would be its own plan item if Patrick wants it.
