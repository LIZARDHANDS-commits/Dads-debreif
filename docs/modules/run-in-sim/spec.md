# Run-in Simulator: spec

Dad's ask (16 Oct 2026): "Lets build a run in simulator...the target can be a stadium, a bridge, mountains etc in a 3d enviroment. the user should see an orbit and a run in and be able to set those parameters along with speed alt winds. to see how the flyover, inert bomb drop, DZ offload will go, Diving drop or flat, as well as the escape manuver". Patrick approved the plan (relayed by Dad, 16 Oct 2026: "got the yes"). **Patrick approved this spec (relayed by Dad, 16 Oct 2026: "yea pat approves"), adding: "the user should sset a few parameters the then the computer sets the offset or whatever variable needs adjusting to hit"** (RS-9, below).

## What it is for

To see how a pass will go before it is flown, or to talk one through afterwards: an orbit, a run-in to a target, a release (or a flypast), and an escape, flown to the settings the user gives over real ground, with the result in pilot terms. These are the time over target, where an inert load landed against the aim point, and how low and how close the aircraft got in the escape.

Practice and training only: inert loads (the BDU-33 practice bomb and a cargo bag on a G-12), generic target shapes, no real-world target data. "Training only" shows on screen at all times (RS-2).

## The screen

Picture: `screen-mockup.png` in this folder. It is a mock-up, not the built screen, and its numbers are made up for the picture. V6 had no such screen; nothing moves or disappears elsewhere in the tool.

One screen, laid out by the house rules (`.agent/skills/screen-layout-and-style`): Setup on the left, the 3D view in the middle with a small plan view, the result on the right, and playback and cameras in the bar under the view.

**Left: Setup.** Showing from the start: **Run** (Flyover; Practice bomb, flat; Practice bomb, dive; Cargo offload), **Aircraft** (filled in from the run, RS-Q1), **Target** (the shapes below), **Place** (tap the map; default the Moose Jaw area, RS-Q4) and **Time over target** (a time after the start, default +6:00, an estimate). Below them are closed boxes, each showing its settings in one line:
- **Orbit:** height (ft AGL above the target's ground), radius (NM) and direction; or a bank angle instead of a radius; and where the orbit's centre sits (over the target, or offset back along the run-in).
- **Run-in:** heading (°M), the IP (initial point) as miles back from the target, speed (KIAS), Flat or Dive. For a dive: the dive angle and the roll-in height.
- **Release:** the release height (ft AGL), and where to release: at the computed air release point (the CARP, the default), or at a set distance before the target (to see a miss). For a flyover, the height over the target's top instead.
- **Escape:** turn direction (left, right, or straight ahead), G, bank, heading change, and the height to climb back to.
- **Wind:** at the release height and at the ground (°M and kt, linear between them), and today's temperature against the standard day. Under More, a "planning wind" the CARP is worked out with, if different from the wind the pass meets, to see what a wrong forecast does.
- **Display:** what's drawn (the orbit and run-in lines, the CARP, the load's trail, the flags), as the house rules say.

Each box shows only the few settings the user sets for that run (RS-9, below). Everything else in it is worked out by the computer and shown greyed with "set to hit". The main button is **Fly the pass**. Every setting starts at a default (the table below), and each box marks an estimate with a ⓘ that says so.

**Middle: the 3D view.** The real ground (the shared terrain, with the satellite picture draped on it) round the target, the target shape, the aircraft model, and the planned lines: the orbit, the IP, the run-in and the dive line, the CARP and the escape. As it flies, a trail follows the aircraft, and after release a trail follows the load to its impact mark. A small **plan view (2D)**, north up, sits in a corner. It shows the same lines from above with the wind arrow and a scale.

**Bar under the view:** a time line with the legs marked (Orbit, IP, Roll-in, Release, TOT, Escape), play and pause, and speeds ×1, ×2, ×4 and ×8. The cameras are **Chase**, **Cockpit** (the CT-156 cockpit when the aircraft is the CT-156), **Target** (from the target, looking at the aircraft), **Overhead** and **Side** (the profile, square to the run-in). The camera never moves on a click (house rules).

**Right: the result.** One card per pass flown, the latest selected. The card leads with the line that matters for the run: the miss for a drop ("Miss 40 ft at 2 o'clock"), the time over target for a flyover ("2 s late, 1,020 ft over the top"). Below it:
- the release (height, KIAS, dive angle) against the plan, and the load's time of fall;
- the escape: the lowest height above the ground over the whole pass after the IP, peak G, the closest distance to the target and the lowest airspeed, each flagged against its reference;
- the time on each leg.

## What the user sets and what the computer works out (RS-9)

Patrick (relayed by Dad, 16 Oct 2026): "the user should sset a few parameters the then the computer sets the offset or whatever variable needs adjusting to hit". So for each run the user sets a few essentials. The computer then works out every other number the pass needs to hit the aim point (or to make the flypast on time and at height), and flies it. These include the release point, the aim-off for the wind, the roll-in point, the IP turn and the orbit exit.

| Run | The user sets | The computer works out to hit |
|---|---|---|
| Flyover | target, run-in heading, speed, height over the target's top, time over target | the crab for the wind, the IP turn, the orbit exit for the time over target |
| Practice bomb, flat | target, run-in heading, speed, release height | the release point (the CARP), so the aim-off for the wind; the crab; the orbit exit |
| Practice bomb, dive | target, run-in heading, dive angle, roll-in speed, release height | the release point on the dive line and the aim-off point upwind, for the speed the dive arrives with; the roll-in point and height, so the dive is steady for a few seconds before release (5 s, an estimate); the orbit exit. Under More, the speed at release can be set instead and the roll-in speed is worked out (RS-10) |
| Cargo offload | drop zone and point of impact, run-in heading, drop speed, drop height | the release point (the CARP: the green light), the crab, the orbit exit |

The IP distance, the wind, the escape and the orbit keep their defaults unless the user changes them. Under More, any worked-out number can be set by hand instead. The pass is then flown as set, and the card shows the miss that results, which shows what a late release or a wrong aim-off does. When the essentials can't hit (for example, a release too low for the dive to be steady), the computer says which essential stops it and what would work, and still flies the pass as set.

## Targets (RS-2)

Generic shapes, sized in feet, placed on the real ground at the tapped point and turned to the run-in heading (or any heading). Each size is an estimate chosen to look like the kind of thing, not any real one:

| Shape | Size (estimate) | Aim point |
|---|---|---|
| Stadium bowl | 800 × 650 ft, 100 ft high, open in the middle | the centre of the field |
| Bridge | a 1,500 ft deck 60 ft wide, 150 ft above the ground, on two towers 300 ft high | the middle of the deck |
| Tower | 300 ft high, 40 ft square | its foot |
| Range circle | rings at 50, 100 and 200 ft, flat on the ground, with a white centre | the centre |
| Drop zone | a circle (radius) or a box (length, width and heading), as the Debrief's drop zone (DB-36) | the point of impact the user taps inside it |

"Mountains" means the real ground itself: place any shape in a valley or on a ridge and the terrain is the real terrain there. Under More, the shape's size can be typed.

## The pass

Five legs, the same for every run type (RS-3):

1. **Orbit:** the aircraft starts on the orbit at the orbit's height and speed. It is a circle over the ground (so the bank changes with the wind) when a radius is set, or a steady bank (drifting with the wind) when a bank is set. The pilot leaves the orbit at the moment that makes the planned time over target (RS-8); if no exit in the next orbit can make it, the pass flies the soonest exit and the card says how late.
2. **To the IP and the run-in:** a turn onto the run-in line at the IP. Then, holding the run-in heading's ground track with the crab the wind needs (core `windTriangle`), it holds the run-in speed and height.
3. **Dive (dive runs only):** at the roll-in point (where the dive line from the release point meets the roll-in height), the pilot pushes over or rolls in to the dive angle. It then tracks the dive line to the release point.
4. **Release:** the load leaves with the aircraft's velocity at that moment and falls under gravity and drag through the wind to the ground (core `drop.js`, DB-36), drawn with its trail. For a flyover, the time over target is when the aircraft passes over or abeam the aim point.
5. **Escape:** straight after release (or the flypast) the pilot pulls to the escape G and rolls to the escape bank in the escape direction. It turns through the heading change, then rolls out and climbs back to the escape height. From a dive, the pull starts at the release and recovers the dive first.

## How it flies (RS-4)

Written down before code, as the rule book asks. Search first: everything below is core flight math already in use.

- **The aircraft:** the shared point mass (core `point-mass.js`, `stepPointMass`), flown by G and bank, with the aircraft's performance set giving thrust and drag (`excessFnFor` at the pilot's throttle). For the CT-156 that is the T-6A set (`t6-performance.js`), the one Traffic, the Formation and the EP Tabletop use. The C-130J has no set yet (RS-Q1).
- **The pilot:** a small pilot built only from core pieces, the way Traffic's and the Formation's are:
  - roll with `easeRoll` inside the aircraft's roll limit (`rollWithinT6A`);
  - G with `easeValue` inside the G onset (`T6A_G_ONSET`, the 6 G/s ceiling of ALL-40);
  - climb and dive angles captured with `dampedClimbG`;
  - lines and the orbit circle held by aiming the lift at a point ahead on them (`liftTowardAim`);
  - speed held with the throttle.
  The gains are the module's own, and each is marked an estimate. No new formula is written for the flying. Anything new the pilot needs that another module could use goes into core with a line in the flight-math list.
- **Speeds name their kind:** the user sets KIAS. The model flies true airspeed, converted with `iasToTasKt` at the day's temperature (`densityRatio`). The result card says KIAS for the aircraft and ground speed where it means it.
- **The dive is flown at idle** with the idle prop's drag on top of the clean airframe's: the Formation Sim's TS-61 drag (`turn-sim/live/slow-down.js`, sized from Patrick's overhead break, about 5 kt/s level at 200 KIAS), imported where it is (RS-10). Without it, a 30° dive from a 200 KIAS roll-in passed VMO.
- **The load:** core `drop.js` as built for the Debrief (DB-36), with its two presets and their estimates. Its CARP today assumes a level release. The dive release needs the CARP to take the release velocity's vertical part (`ground.vz`) and to slide the release point along the dive line instead of over the ground. That is an improvement to `carp()` in place, with a line in the flight-math list, never a second copy (RS-5).
- **Heights:** the ground under the aircraft and under the load from the shared terrain heights. Heights on screen are AGL (above the ground under the target) unless they say MSL.
- **Limits (RS-6):** what the aircraft physically can't do always holds: the stall line (`availableG`), its roll limit and G onset. Published limits (the G limit, VMO) and the module's own references (the minimum escape height and target distance) are flagged on screen, never walls. A setting past them is flown as set, and the card flags it. A setting the aircraft can't fly (a dive it can't pull out of above the ground, a turn tighter than the stall line allows) is flown as best it can, and the card says so. It is never silently changed.

## Defaults (every one an estimate until Patrick or a manual page gives it; RS-Q2)

| Setting | Flyover | Practice bomb, flat | Practice bomb, dive | Cargo offload |
|---|---|---|---|---|
| Aircraft | CT-156 | CT-156 | CT-156 | C-130J (RS-Q1) |
| Target | Stadium bowl | Range circle | Range circle | Drop zone, 300 ft radius (estimate) |
| Orbit | 3,000 ft AGL, 2.0 NM, left, 200 KIAS | same | same | 1,500 ft AGL, 3.0 NM, left, 160 KIAS |
| IP | 5.0 NM | 5.0 NM | 5.0 NM | 6.0 NM |
| Run-in speed | 250 KIAS | 220 KIAS | 200 KIAS at the roll-in (RS-10) | 140 KIAS (the G-12's typical release speed, Safran/Airlift data sheet, unchecked; drop-plan.md) |
| Run-in height | 1,000 ft above the target's top (the CARs 602.14 built-up-area reference, to be checked) | 1,000 ft AGL | roll-in 6,000 ft AGL | 600 ft AGL (above drop-plan.md's 475 to 550 ft lowest drop height, unchecked) |
| Dive angle | — | — | 30° | — |
| Release | — | at the CARP | 3,000 ft AGL, at the CARP | at the CARP |
| Escape | straight ahead, climb to 3,000 ft AGL | left, 4 G, 60° bank, 90°, climb to 3,000 ft AGL | left, 4 G, 60° bank, 90°, climb to 3,000 ft AGL | straight ahead, then left, 1.5 G, 30° bank, 90°, climb to 1,500 ft AGL |
| Flags | under 1,000 ft above the target's top inside 2,000 ft of it (CARs reference); 500 ft AGL anywhere | 500 ft AGL; peak G over the aircraft's limit | the same | 300 ft AGL; bank over 30° below 1,000 ft AGL |
| Wind | still air | still air | still air | still air |

## When data fails

- **Terrain tiles missing:** the ground is flat at the target's height. The screen says so, and every AGL height and the lowest-height flag read "unknown ground" rather than a number.
- **Satellite tiles missing:** the plain ground colour, as the other 3D views do.
- **No WebGL:** the plan view (2D), the settings and the result still work. The 3D view shows a message in its place.
- **A pass the pilot can't make** (the TOT can't be made, the dive can't be recovered above the ground, the orbit's bank would pass the stall line): flown as best it can and flagged on the card (above).
- **The load never lands** (a drop longer than `drop.js`'s 30 minutes): "did not land" in place of the miss.
- **No outside data source:** the wind and temperature are typed (RS-7), so nothing is fetched except the shared terrain and satellite tiles the other 3D views already use.

## What the module uses (no second copies)

- core: `point-mass.js`, `t6-performance.js` (and the shared performance-set builder when Traffic's chain brings it to main), `drop.js` (from the Debrief's drop, DB-36), `wind.js`, `atmosphere.js`, `angles.js`, `geo.js`, `units.js`, `terrain-tiles.js` and `terrain-grid.js`;
- ui-kit: `terrain3d.js`, `draped-ground.js`, `sky-clouds.js`, `three-aircraft.js`, the CT-156 model and cockpit, the C-130J model (`c130j-model.js`, shared plan Step 3e), `panel.js` and `controls.js`;
- shell: the home card, the version label and settings.

It is built once the Debrief's drop (core `drop.js`) and the C-130J model are on main; until then its branch sits on theirs.
