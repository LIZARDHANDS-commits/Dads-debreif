# Advanced Mission Sets (the Run-in Simulator): spec

**Named Advanced Mission Sets by Dad, 17 Oct 2026** ("can we also change the name of the module to Advanced Mission Sets"): the name on the home card, the screen and the tab. The route, folder, files, ids and RS- numbers keep "run-in-sim"; the wording below is as written before.

Dad's ask (16 Oct 2026): "Lets build a run in simulator...the target can be a stadium, a bridge, mountains etc in a 3d enviroment. the user should see an orbit and a run in and be able to set those parameters along with speed alt winds. to see how the flyover, inert bomb drop, DZ offload will go, Diving drop or flat, as well as the escape manuver". Patrick approved the plan (relayed by Dad, 16 Oct 2026: "got the yes"). **Patrick approved this spec (relayed by Dad, 16 Oct 2026: "yea pat approves"), adding: "the user should sset a few parameters the then the computer sets the offset or whatever variable needs adjusting to hit"** (RS-9, below).

## What it is for

To see how a pass will go before it is flown, or to talk one through afterwards: an orbit, a run-in to a target, a release (or a flypast), and an escape, flown to the settings the user gives over real ground, with the result in pilot terms. These are the time over target, where an inert load landed against the aim point, and how low and how close the aircraft got in the escape.

Practice and training only: inert loads (the BDU-33 practice bomb and a cargo bag on a G-12), generic target shapes, no real-world target data. "Training only" shows on screen at all times (RS-2).

## The screen

Picture: `screen-mockup.png` in this folder. It is a mock-up, not the built screen, and its numbers are made up for the picture. V6 had no such screen; nothing moves or disappears elsewhere in the tool.

One screen, laid out by the house rules (`.agent/skills/screen-layout-and-style`): Setup on the left, the 3D view in the middle with a small plan view, the result on the right, and playback and cameras in the bar under the view.

**Left: Setup.** Showing from the start: **Run** (Flyover; Practice bomb, flat; Practice bomb, dive; Cargo offload), **Aircraft** (filled in from the run, RS-Q1), **Target** (the shapes below), **Place** (tap the map; default the Moose Jaw area, RS-Q4) and **Time over target** (a time after the start, default +6:00, an estimate). Below them are closed boxes, each showing its settings in one line:
- **Orbit (RS-11):** the pattern, **Holding pattern** (the default), **Figure 8** or **Circle**; its height (ft AGL above the target's ground), speed and turn direction. A holding pattern also has its leg time and bank; a figure 8 its bank; a circle its radius (or bank) and where its centre sits.
- **Run-in:** heading (°M), the IP (initial point) as miles back from the target, speed (KIAS), Flat or Dive. For a dive: the dive angle and the roll-in height.
- **Release:** the release height (ft AGL), and where to release: at the computed air release point (the CARP, the default), or at a set distance before the target (to see a miss). For a flyover, the height over the target's top instead.
- **Escape:** turn direction (left, right, or straight ahead), G, bank, heading change, and the height to climb back to.
- **Wind:** at the release height and at the ground (°M and kt, linear between them), and today's temperature against the standard day. Under More, a "planning wind" the CARP is worked out with, if different from the wind the pass meets, to see what a wrong forecast does.
- **Display:** what's drawn (the orbit and run-in lines, the CARP, the load's trail, the flags), as the house rules say.

Each box shows only the few settings the user sets for that run (RS-9, below). Everything else in it is worked out by the computer and shown greyed with "set to hit". The main button is **Fly the pass**; it stays in view at the foot of Setup, and once a pass has been flown a change of any setting flies it again by itself (RS-14). Every setting starts at a default (the table below), and each box marks an estimate with a ⓘ that says so.

**Middle: the 3D view.** The real ground (the shared terrain, with the satellite picture draped on it) round the target, the target shape, the aircraft model, and the planned lines: the orbit, the IP, the run-in and the dive line, the CARP and the escape. As it flies, a trail follows the aircraft, and after release a trail follows the load to its impact mark. A small **plan view (2D)**, north up, sits in a corner. It shows the same lines from above with the wind arrow and a scale.

**The 2D view (RS-13).** A **3D | 2D** switch above the view. 2D fills the middle with two drawings, both following the playback:
- **Plan,** north up, on the satellite map at true scale: the target's footprint at its own heading, the orbit pattern, the IP, the run-in line, the aim-off point, the CARP, the impact, the escape and the flown track, with the aircraft's mark moving, the wind arrow, a north arrow and a scale.
- **Profile,** along the run-in, height against distance to the target: the ground under the run-in (from the terrain), the target cut where the run-in crosses it (the bridge's deck shows as a slab as wide as the run-in sees it at its crossing angle, with its towers), the aircraft's path, the dive line, the release, the load's fall to its impact, and the escape, with heights AGL labelled.

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

Generic shapes, sized in feet, placed on the real ground at the tapped point. **Each keeps its own heading, set in Setup as Target heading (°M); changing the run-in heading never turns it (RS-12)**, so the run-in can cross a bridge at any angle and show whether the load lands on top of the deck or falls past it underneath. Defaults: the bridge and the stadium at 050°M, square to the default 320°M run-in (estimates). Each size is an estimate chosen to look like the kind of thing, not any real one:

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

1. **Orbit (RS-11):** the aircraft starts in the pattern at the orbit's height and speed, flown over the ground (so the bank in the turns changes with the wind):
   - **Holding pattern** (the default): a racetrack on the IP, the inbound leg along the run-in heading ending at the IP, the turns in the set direction at the set bank (30°, an estimate), legs of 1 minute (the standard holding leg below 14,000 ft, a reference; an estimate here).
   - **Figure 8** (an infinity sign, ∞, since V2.508; Dad, 17 Oct 2026, with a picture: "can the figure 8 be more like this"): two round loops at the set bank (30°, an estimate), one each side of the run-in line, joined by two straight legs that cross diagonally at the IP at 60° (an estimate), each leg 30° off the run-in heading and pointing inbound; each loop's centre sits abeam the IP at its radius ÷ cos 30°, and each leg is its radius × tan 30° long.
   - **Circle:** the circle of the first version (a radius, or a steady bank), centred over the target or back along the run-in.
   In the holding pattern the pilot leaves at the IP already heading inbound, so the run-in starts straight; in the figure 8 he leaves at the IP turning the 30° from the crossing leg onto the run-in. The time over target is made by the computer (RS-8, RS-9): the holding pattern's last outbound leg is stretched or shortened, the figure 8's last loop flown wider or tighter (its legs grow and shrink with it) (between 15° and 45° of bank, estimates); when even that can't make it, the soonest exit, and the card says how late.
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
- **On top of the bridge or underneath (RS-12):** a load that meets the bridge's deck stops there and the card leads with "On the deck"; one that misses the deck falls past it to the ground and the card says "Under the bridge: missed the deck by … ft (long, short, left or right)" with where it hit the ground.
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

## Air refuelling: the point-parallel rendezvous (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

**Status: approved, Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'); built first on Dad's "Build anyway" the same day.** Plan: [air-refuelling-plan.md](air-refuelling-plan.md) Steps 1 to 3; decisions RS-15 to RS-18; requirements RS-R10 to RS-R13. Dad's ask (17 Oct 2026): "can we also add in the airrefueling... to the run in sim". His card answers the same day: show **the rendezvous** first, the **point-parallel**; the receiver is **the CT-156 as a stand-in** (labelled so; it has no probe). Not in this piece: contact and fuel transfer, a boom tanker, a real receiver model, fuel planning and the en-route rendezvous (plan Step 4, `future.md`).

**No number here has a manual source yet.** ATP-56 (the NATO air-to-air refuelling publication) would be the reference; it has not been read. Every number below is an **estimate** until Patrick or a manual page gives it, and says so in the code.

### What it shows

A separate run on the Run list, **Air refuelling, point-parallel**; the other runs and the default start (Practice bomb, flat) are unchanged. A tanker flies its anchor; a receiver flies toward it on the reciprocal track, offset; the tanker turns toward the receiver at the worked-out range and rolls out ahead of it in trail; the receiver then joins to the pre-contact position behind the left drogue and holds it.

- **The tanker (RS-15):** a KC-130J, drawn from the C-130J model (`src/ui-kit/c130j-model.js`) with two wing pods, their hoses and baskets as simple shapes. The pods hang under the outer wing, 50 ft out from the centreline (between the outer nacelle at 33.4 ft and the tip at 66.3 ft, the model's sources R9 and R10; the place is an estimate); each hose trails 75 ft behind its pod, 8° below level, to a basket 2.6 ft across (estimates for the picture). **It has no performance set (RS-Q1), so its flying is a picture, not a performance claim, and the screen says so:** it moves along its anchor over the ground at a set height and true airspeed, its ground speed what the wind makes of that, its bank drawn as the coordinated bank for its turn over the ground (core `bankDegFromTurnRate`).
- **The receiver:** the CT-156 on the T-6A set, flown by the run-in pilot (`pilot.js`, RS-4) on core's point mass, labelled on screen **"Stand-in receiver (CT-156, no probe)"**.

### The anchor (RS-15)

A racetrack over the ground, built with the holding pattern's geometry (`ground-path.js` `holdLap`, RS-11): the **refuelling leg** along the refuelling track (the receiver's track), starting at the **roll-out point** (the chosen Place), the turn at its far end, the **reciprocal leg** back, offset to the side the anchor turns, and the **rendezvous turn** back onto the refuelling leg at the roll-out point. The turns are at the set bank's radius at the tanker's true airspeed (core `turnRadiusFromBankFt`), so the offset between the legs is two turn radii and the tanker rolls out on the receiver's track. In a wind the tanker holds the racetrack over the ground, so its bank steepens on the downwind side; the card flags a bank steeper than set. Before the rendezvous the tanker is somewhere on its anchor, as many laps back as the rendezvous time needs.

### The point-parallel, worked out to hit (RS-16)

The receiver flies the refuelling track toward the roll-out point, the set height below the tanker; the tanker flies the reciprocal leg toward it, offset. The user sets the essentials; the computer works out the rest, as RS-9 does for the run-in:

| The user sets | The computer works out to hit |
|---|---|
| the refuelling track, the tanker's height (ft MSL) and speed (KIAS), the rendezvous time (the tanker's roll-out), the trail at roll-out, the overtake on the join | the offset (two turn radii); the **receiver's speed**: the tanker's ground speed along the track plus the set overtake, turned to the receiver's KIAS at its own height (speeds compared like with like: ground speed with ground speed, then true, then indicated, with core `iasToTasKt`/`tasToIasKt`); **the timing**: where the receiver starts so it is in trail at the rendezvous time (found by flying it); **the tanker's turn moment** (the rendezvous time less the turn's time over the ground) and **its turn range** (the range over the ground between the two when the tanker starts its turn) |

Under More: the tanker's bank, the anchor's leg and turn direction, the receiver's height below the tanker and the pre-contact distance; and two worked-out numbers can be set by hand, **the turn range** (the tanker turns when the receiver comes within it) and **the receiver's speed**. The pass is then flown as set and the card shows the trail that results, so an early or late turn, or a slow receiver, shows as a trail long or short against the plan. When a worked-out number can't be flown (the receiver's speed past what the T-6A set gives at full power, a hand-set turn range never reached), it is flown as best it can and the card says which and what would work.

### The join to pre-contact (RS-17)

From the tanker's roll-out the receiver joins: it climbs to the drogue's height (the tanker's less the hose's droop) at no more than 5° (an estimate), once it is at least 300 ft behind the tanker's wing line (an estimate; after an overrun it stays below and drops back to 500 ft behind first, then climbs), and steers onto the line through the pre-contact point along the tanker's track (the L1 follower it flies every line with). Its speed is the tanker's ground speed along the track plus a closure that is the set overtake far out, eased off approaching the point so it could brake at **0.3 kt/s** (an estimate of a smooth technique), and nothing at the point. **Pre-contact** is the receiver's nose **15 ft behind the left basket** (an estimate; the CT-156's nose is 15.3 ft ahead of its centre on the model). Within 10 ft each way (an estimate) for 10 s (an estimate) it is **stabilised in pre-contact** and the run ends. The join is followed for at most 10 minutes (a guard); a join that hasn't stabilised by then says so.

### The result card

Leads with the trail at the tanker's roll-out against the plan ("Rolled out 1.0 NM ahead, plan 1.0 NM"), then: the receiver's offset across the track and its height below at the roll-out; the overtake at roll-out; the peak closure on the join and the closure inside 200 ft of pre-contact; the time from roll-out to stabilised in pre-contact; the closest the receiver came to the tanker's wing line; the tanker's steepest bank against the set bank; the receiver's peak G and lowest airspeed; the worked-out numbers (the turn range and moment, the offset, the receiver's speed and start). Overtake and closure are the rate the range between the two shrinks (core `closureKt`), so ground speed against ground speed.

**Flags, references never walls (RS-6), every one an estimate until Patrick or ATP-56 gives it:** the peak closure on the join over **30 kt**; the closure inside **200 ft** of pre-contact over **10 kt** (set so the join's own easing-off, which gives about 9 kt there, is not flagged by its own reference); the tanker's bank steeper than its set bank; **the receiver ahead of the tanker's wing line** (the line through the tanker square to its heading) at any time after the roll-out; the receiver's peak G against its limit, VMO and the stick shaker, as the run-in.

### The screen for this run

Picture: `air-refuelling-screen.png` in this folder, the built screen (V2.504, headless Chromium, 17 Oct 2026): the 2D plan with CYMJ 29L, the climb-out, the IP, the orbit, the offset and the turn range ring, as the tanker turns inbound (V2.503's picture, from Behind the drogue, is in git history). V6 had no such screen; nothing moves or disappears elsewhere: the run-in's runs and their boxes, bar and card are as they were.

- **Setup**, showing from the start: Run, Aircraft ("KC-130J tanker (a picture) · CT-156 stand-in receiver"), Place (the roll-out point) and the **Rendezvous time** (the tanker's roll-out, s after the start). Boxes: **Tanker and anchor** (track, height, speed; More: bank, leg, direction), **Rendezvous** (trail; the receiver's speed, start, the turn range and moment greyed "set to hit"; More: the receiver's height below, the turn range or the receiver's speed by hand), **Join** (overtake; More: pre-contact distance), **Wind** (at the refuelling height and at the ground) and **Display**. The run-in's boxes (Target, Orbit, Run-in, Release, Escape, Time over target) hide. Every setting starts at a default. A line under the Aircraft says: "The tanker's flying is a picture, not a performance claim: the KC-130J has no performance set yet (RS-Q1)."
- **3D:** the anchor, the receiver's track and the turn point drawn; both aircraft with their trails. Cameras: Chase, Cockpit (the receiver's), Overhead and Side as the run-in, plus **From the tanker** (from its tail, looking at the receiver) and **Behind the drogue** (behind the left basket, looking at it and the tanker); Target is greyed for this run (no target). The two new cameras show only on this run.
- **2D (RS-13):** the plan with the anchor, both tracks, the turn point and the roll-out point; the profile along the refuelling track (height MSL against distance from the roll-out point) with both aircraft's paths, as the whole rendezvous, the join, or behind the tanker (the receiver's height against its distance behind the tanker, with the drogue and the pre-contact point).
- **Time line marks:** Start, Turn, Roll-out, Pre-contact.

### Defaults for this run (every one an estimate; ATP-56 not read)

| Setting | Default | Source |
|---|---|---|
| Refuelling track | 320°M | estimate (the run-in's default heading) |
| Tanker height | 10,000 ft MSL | estimate, chosen inside the stand-in's speeds: the T-6A set holds 200 to about 250 KIAS level there |
| Tanker speed | 200 KIAS (233 KTAS on a standard day) | estimate |
| Tanker bank in its turns | 25° | estimate |
| Anchor leg | 20 NM | estimate |
| Anchor turns | left | estimate |
| Rendezvous time (the tanker's roll-out) | +3:00 | estimate, so the run is short to watch |
| Receiver below the tanker for the rendezvous | 1,000 ft | estimate |
| Trail at roll-out | 1.0 NM | estimate (air-refuelling-plan.md) |
| Overtake on the join (and so the receiver's rendezvous speed over the tanker's) | 20 kt | estimate |
| Braking toward pre-contact | 0.3 kt/s | estimate of technique |
| Pre-contact | nose 15 ft behind the left basket | estimate |
| Stabilised in pre-contact | within 10 ft for 10 s | estimate |
| Wind | still air | as the run-in |

### When data fails

- **The C-130J's model file doesn't come:** the model's own stand-in shows (the CT-156 drawn at the C-130J's length, `c130j-model.js`), with the pods, hoses and baskets still drawn.
- **Terrain tiles missing:** the ground is flat at the fallback height, as the run-in; at the refuelling height nothing here is judged against the ground.
- **The receiver can't make the worked-out speed** (past full power on the T-6A set): flown at what it makes; the card shows the trail long, and says a later rendezvous time or a lower overtake would work.
- **A hand-set turn range is never reached:** the tanker turns at the worked-out moment and the card says so.
- **The join doesn't stabilise within 10 minutes:** the card says so, with the receiver's last distance from pre-contact.
- **No outside data:** as the run-in, nothing is fetched but the shared terrain, satellite and model files.

### Change: take off from Moose Jaw, meet at the IP, the tanker turns inbound from its orbit (RS-19, RS-20; approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

Dad, 17 Oct 2026: **"Can we have the tanker in orbit while the ct156 is initial takeoff meeting at the IP then the tanker turns inbound to meet from the orbit"**, and **"Giving turn range and offset would help too"**. Changes to RS-15 to RS-18 (RS-19 and RS-20), approved with the rest of this run: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'). They replace the airborne start as the run's default; the airborne start (the first version, above) stays under More as "Start the receiver airborne on the track".

**The receiver's flight (RS-19).** It starts at Moose Jaw (CYMJ) on the runway into the wind at the ground: 29L, or 11R when the ground wind blows from the 11R side; 29L when calm, the Traffic module's default (Patrick's measured runway points, `src/airfields/cymj-runways.js`; field 1,892 ft, Patrick's number). Then:
- **The take-off.** The run starts with the receiver rolling at the 29L (or 11R) threshold at 85 KIAS, the take-off number the Traffic module uses for lift-off (Traffic spec item 21, an estimate there). **The ground roll from a standstill is not modelled:** the T-6A set has nothing for the wheels on the runway, and its thrust fit is not meant for low speeds (at 10 kt it gives about 0.8 G of push, about four times a real ground roll's). The set is clean only (no take-off flap), so the receiver keeps its wheels on the runway, accelerating at full power on the set, until its clean stall line gives 1.3 G (about 98 KIAS; an estimate), then lifts off. The card gives the lift-off time.
- **The climb-out** as the Traffic module flies it (Patrick, 4 Oct 2026 08:15Z; SMM 3.11, SMM 3.14 para 35): full power on runway heading, the take-off attitude (6°, the middle of 5 to 7°) to 180 KIAS, then a 180 KIAS climb at full power (the climb angle the set gives there, at 90% of its excess so the throttle keeps a margin: an estimate). It holds the runway track until 2,500 ft MSL and past the departure end before it turns (Patrick, 6 Oct, the Traffic module's after-take-off rule, Traffic spec item 22).
- **To the IP** (the rendezvous initial point, on the refuelling track this far back from the roll-out point; set in the Rendezvous box, default 15 NM, an estimate), climbing at 180 KIAS to the rendezvous height (1,000 ft below the tanker, as before), then levelling at the receiver's rendezvous speed (worked out as before: the tanker's ground speed plus the overtake). Near the IP it turns onto the refuelling track, leading the turn as the run-in does onto its run-in line; the IP time is when it passes the IP on the track. Then the rendezvous track, the turn and the join as before.
- **The place for this run** starts at a point **32 NM north-north-west of CYMJ** along the default refuelling track (320°M), so the climb-out and the transit point the way the receiver will fly (an estimate; Place moves it, and the take-off is still from CYMJ). Picking the run puts this place back while the place is still a default; picking another run puts the Moose Jaw area back.

**The tanker holds in its orbit (RS-19).** The anchor racetrack as before, the tanker flying it from the start the whole time the receiver takes off and transits. **Worked out to hit, as RS-9:** the receiver's flight is flown ahead (at the worked-out speeds) to find when it is in trail on the track (the IP time plus its run down the track); the tanker's roll-out is set to that moment, so its turn inbound from the orbit starts that long before it less the turn's time, and where it is in its orbit at the start (and how many laps it flies before turning) follows. The card gives the tanker's laps in orbit before turning.

**Turn range and offset (RS-20).** Both lead the rendezvous part of the card: the **turn range** (NM, the range over the ground from the tanker to the receiver as the tanker starts its turn) and **the tanker's turn moment**; the **offset** (NM, between the tanker's inbound track and the receiver's track, and which side). The offset is now **settable in the Rendezvous box**: worked out as two turn radii by default (greyed "set to hit"), and under More set by hand. A hand-set offset makes the anchor that wide (its orbit turns at half the offset's radius, so a narrow one banks steeper and is flagged), while the turn inbound stays at the set bank; the tanker then rolls out to the side of the receiver's track by the difference, the turn range is still worked out to hit, and the card shows the trail and the offset across the track that result. **Drawn on the 2D plan and in 3D:** the offset as a labelled line square to the track from the tanker's inbound track to the receiver's track at the turn point, and the turn range as a labelled ring round the tanker's turn point with a line to where the receiver was when the tanker turned.

**The screen.** Setup shows "Takes off from CYMJ 29L (into the wind)" under the Aircraft; the Rendezvous box adds the IP and the offset; the Rendezvous time box shows only for the airborne start. The time line marks are **Takeoff, IP, Tanker turns, Roll-out, Pre-contact**. The 2D plan shows CYMJ's runway, the climb-out (the flown track), the IP and the orbit, with the offset and turn range drawn; the profile's whole rendezvous starts at the take-off.

**When data fails.** The runway's height is the shared terrain's at its threshold (CYMJ's 1,892 ft where no tile comes). A transit the receiver can't make in time (a far place) only makes the run longer: the tanker keeps orbiting until the worked-out moment. A receiver that hits rising ground on the climb-out is flagged as before.

| Added default (estimate unless sourced) | Value | Source |
|---|---|---|
| The run starts | rolling at the threshold at 85 KIAS | Traffic spec item 21 (an estimate there) |
| Lift-off | when the clean stall line gives 1.3 G (about 98 KIAS) | estimate (the set is clean only) |
| Take-off attitude to 180 KIAS, then 180 KIAS climb | 6°, 180 KIAS | Patrick 4 Oct 08:15Z; SMM 3.11, 3.14 para 35 (Traffic `CIRCUIT`) |
| Climb on this share of the full-power excess | 90% | estimate |
| Straight ahead before turning | to 2,500 ft MSL and past the departure end | Patrick, 6 Oct (Traffic spec item 22) |
| IP | 15 NM back from the roll-out point on the track | estimate |
| Place for this run | 32 NM NNW of CYMJ (50.7871 N, 105.9892 W) | estimate |
| Offset | two of the tanker's turn radii (3.4 NM at the defaults), or by hand | geometry; hand value an estimate |

### Change: the turn inbound flown in the air mass, and the take-off's ground (RS-21, RS-22; approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

Dad, 17 Oct 2026: **"Is turn range/offset scalable based on altitude airspeed wind"**, and **"takeoff isn't working"**.

**The turn inbound in the air mass (RS-21).** Before, the offset was two of the tanker's turn radii at its true airspeed and set bank (so it scaled with height, airspeed and bank, not with wind), and the turn inbound was a fixed circle over the ground (so in a wind its drawn bank changed: 30.7° against 25° in 30 kt). Now, standard aerodynamics: the tanker flies the turn inbound at its set bank and true airspeed **in the air mass**. Its heading turns at the rate that bank gives (core `turnRateFromBankRadPerSec`) from the heading that holds the reciprocal leg's track to the one that holds the refuelling track (core `windTriangle` on each), and its ground track is that circle through the air plus the wind times the time, so it drifts with the wind over the turn. **The offset worked out to hit** is the across-track part of that drift-and-turn, so the tanker rolls out on the receiver's track; the along-track part moves the turn point along the reciprocal leg so it still rolls out at the roll-out point; **the turn range** is still the range over the ground at the turn, timed on the receiver's flight. In a pure head- or tailwind the whole rendezvous drifts with the air, so the offset and turn range come out the same as in calm air (only where it happens over the ground moves); a crosswind changes both (from the receiver's right, a narrower offset and a shorter turn range; from the left, wider and longer). Height and airspeed scale them through the turn radius. **The orbit keeps its ground shape** (its legs and turns over the ground, as before; flying it in the air mass too was not cheap with the shared ground-path pieces), so its drawn bank still changes round its turns in a wind and the card flags it past the set bank; the turn inbound itself is now always at the set bank. Hand-set offset and turn range work as before. The card and Setup say the wind they were worked for: "for 30 kt from 050°M at 10,000 ft", or "for calm air".

**The take-off's ground (RS-22).** The 3D ground's two squares (the sharp inner 20 NM, the outer 80 NM) were centred on the place, 32 NM from CYMJ, so the take-off sat on the coarse outer picture (and on the live preview showed no ground at all). For this run from the take-off they are centred **8 NM from CYMJ toward the place** (half way if the place is nearer than 16 NM; an estimate for the look), so the airfield and the climb-out sit in the sharp square and the anchor and the join in the outer one; the flying is unchanged (its frame stays the place's). **CYMJ's runways are drawn in 3D** by the shared airfield builder (`src/ui-kit/airfield3d.js` `buildAirports`, as the EP Tabletop draws them), on this run only, at the runway's height the flying uses: CYMJ's 1,892 ft, or the terrain's at the threshold if higher. On the runway the CT-156's centre stands 5.4 ft over its wheels (the Debrief's `WHEELS_BELOW_ORIGIN_FT`, an estimate there), its gear is down, and it starts up 3 s after lift-off (an estimate) over the model's 6 s travel. The 2D plan and the corner plan already take in the whole route (V2.504).

| Wind-aware results (still air unless said; every number an estimate) | Offset | Turn range | Roll-out trail / across |
|---|---|---|---|
| Defaults (10,000 ft, 200 KIAS, 25°) | 3.39 NM | 7.57 NM | 0.992 NM / 0 ft |
| 15,000 ft | 3.97 NM | 8.69 NM | 0.997 NM / 0 ft |
| Tanker 240 KIAS | 4.87 NM | 10.20 NM | 0.999 NM / 0 ft |
| 30 kt headwind (from 320°M) | 3.39 NM | 7.57 NM | 0.997 NM / 0 ft |
| 30 kt tailwind (from 140°M) | 3.39 NM | 7.57 NM | 0.991 NM / 0 ft |
| 30 kt crosswind from the right (050°M) | 2.73 NM | 6.82 NM | 0.996 NM / 0 ft |
| 30 kt crosswind from the left (230°M) | 4.10 NM | 8.28 NM | 0.996 NM / 0 ft |

## The anthem flyover (RS-24, RS-25; approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

Dad, 17 Oct 2026: **"on the stadium flyover it would be nice for the user to hit national anthem starts playing...and the the aircraft gets its self over the target by national anthem completion (us or Canada as options)"**. His card: the browser plays the tune itself (no recording).

**On the Flyover run only.** Setup shows **National anthem: Canada, US or none** (default Canada, an estimate: Moose Jaw is in Canada), with **its length** under More (default 1:10 for O Canada and 1:30 for The Star-Spangled Banner, estimates; the tempo follows the length). The bar under the view shows an **Anthem starts** button.

**Two ways it is timed, both by the existing time-over-target machinery (RS-8, RS-11: the holding pattern's last outbound leg stretched or shortened, the figure 8's last loop's bank, or the circle's exit; no second timing solver):**
- **Planned (the default when an anthem is chosen):** the anthem's last note is the time over target, so the anthem starts the anthem's length before it; during playback it plays from that moment and the aircraft crosses the stadium on the last note.
- **Live: pressing Anthem starts during playback.** The press time becomes the anthem's start and the time over target becomes its last note. The pass is worked out again from that moment **with the past unchanged**: the pattern's laps already begun stay as flown (the solver may only change a lap the aircraft has not started, or a circle exit after the press), the stored flight up to the press is kept, and playback carries on from the same moment with the anthem playing. If the anthem is too short for the aircraft to get there from where it is, it arrives as soon as it can and the card flags how late (a reference, never a wall).

**What the flying allows (worked out, said plainly).** From a holding pattern a live anthem can rarely be made: after a press the aircraft must finish the lap it is on, fly at least a shortest last lap (15 s legs) and the run-in. With the flyover's defaults (1-minute legs, the IP 5 NM out at 250 KIAS: about 72 s of run-in alone) that is about 3 minutes, longer than either anthem (70 to 90 s). The live press then shows how late it would be, and the planned anthem shows it made. Timing the last minute by speed on the run-in (the real way a flypast meets an anthem) is on `future.md`.

**The tune (RS-25).** The browser plays the melody as simple tones (Web Audio oscillators, no audio files, no library), from note lists (pitch and beats) in `src/modules/run-in-sim/anthems.js`, scaled so the whole tune lasts the set length. It plays only at ×1 playback; at ×2 and faster it is muted and the bar says so. It stops when the pass ends, on pause, on a scrub, or when the anthem ends. **Sources:** The Star-Spangled Banner (John Stafford Smith's melody, public domain) from Jack Campin's public-domain ABC transcription (music21's corpus, "americanfifeopus.abc"); O Canada (Calixa Lavallée's melody, public domain): its first line from the anthem-scores note data (converted from a public-domain Wikimedia Commons MIDI); **the rest of O Canada is written from memory and not checked**: the screen says so under the anthem choice until Dad or Patrick checks it by ear.

**The card** leads with "Over the stadium X s after (or before) the last note" (on the last note within half a second), then the anthem, its length, when it started (planned, or pressed at +m:ss), and the time over target's words as before. **Time line marks:** Anthem starts, Last note.

### Change: a live anthem press cuts track and adjusts speed on the run-in (RS-26, RS-27; within Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))

Dad, 17 Oct 2026, on the late live press: **"adjusts speed on run in and cuts track"**.

On a live "Anthem starts" press the computer now compares, and flies the one that best makes the last note:
- **Stay in the orbit** (V2.506's way: the existing time-over-target solver with the past kept), at the planned run-in speed, or at the fastest if that is still late;
- **Cut track** (RS-26; V2.507's way, replaced in V2.508, below): leave the orbit at once and fly direct to **the IP**, or direct to **a point on the run-in line inside the IP** (each whole mile in from the IP down to a **minimum straight run-in of 2 NM**, an estimate, so the pass still stabilises before the target), then down the run-in line. The cut is flown by the same pilot and legs as the run-in (to the point, then the line), starting from where the aircraft was at the press; the stored flight up to the press is kept. A cut whose crossing is more than **300 ft abeam** of the target (an estimate: the turn onto the line was too tight to settle on it) is not a choice.
- **The run-in speed worked out to hit** (RS-27, as RS-9): for each choice, the speed held from the press to the target, between **a slowest of the stick shaker plus 60 kt** (153 KIAS on the T-6A set, an estimate) and **a fastest of what the T-6A set holds level at full power at the run-in height**, never past VMO less 10 kt (about 290 KIAS at the default run-in height; an estimate), found by flying it, so it crosses on the last note. The pilot holds it with the existing throttle law.
- **The pick:** the choice whose crossing is nearest the last note; within half a second, the one that changes least (the orbit, then the cut to the IP, then the farther joins). Early even at the slowest with the full orbit: the orbit's lap stretching makes it (as before). Late even with the shortest cut at the fastest: it crosses as soon as it can and the card says how late (a reference, never a wall).
- **Pressed on the run-in already:** only the speed is worked out (nothing left to cut).

**The card** adds what it did ("Cut to the IP at +1:05, run-in 280 KIAS", "Cut to the run-in 3.0 NM out at +1:05, run-in 262 KIAS", or "Stayed in its orbit, run-in 250 KIAS") beside the time against the last note. **The views** show the flown cut (the flown track), and the run-in line from where the cut joined it (marked as the IP).

**V2.508: the cut turns harder, toward the inbound line, and skips the IP** (RS-26; Dad, 17 Oct 2026, on V2.507: "as well as the cutting of ground track the aircraft increase bank or g or turn towards the inbound line and skip the IP"). Seen on the preview: a US press at +0:34 from the default hold flew "Cut to the run-in 4.0 NM out" with a 260° turn and crossed 38 s late, where +0:30 crossed on the note. The cause: V2.507 flew a cut direct to a point on the run-in line. At +0:34 the aircraft is in the hold's turn at the IP end, 1.4 NM left of the line, heading 229° against the run-in's 329° and turning away from it about 3° a second; a few seconds earlier the cut to the 2 NM point could still turn right about 90° and settle on the line, but by +0:34 that turn crossed 300 to 900 ft abeam (the speed needed made it too wide), so it was dropped, and the next choice, the point 4 NM out, lay nearly behind it, so the pilot kept turning left 260° round to it. No timing or scoring fault: the press time is the playback time, and the card's 38 s is the same flight that was scored.

From V2.508 a cut is flown this way:
- **At once at the cut bank** (60°, 2 G level, an estimate), the shorter or the longer way round, onto an **intercept of the run-in line** at 30°, 45°, 60° or 90° (estimates), skipping the IP;
- **straight to the line**, then **rolled out onto it at the same bank**, led so it rolls out on the line; then the run-in follower holds the line as on any run-in;
- at least **2 NM of straight run-in** left before the target (an estimate);
- **never a loop:** a cut whose track crosses itself, or that crosses the line before rolling out onto it, or whose crossing is more than 300 ft abeam of the target (an estimate), is not a choice, and the next best is taken;
- V2.507's cut **direct to a point on the run-in line** each whole mile inside the IP (the IP itself skipped) stays a choice, under the same rules, for where the line can't be met heading inbound (from a circle round the target the aircraft is already beside or past the target);
- the run-in speed worked out to hit as before (RS-27), held from the press.

**The card** says, for example, "Cut right at 60° bank at +0:34, onto the run-in 3.2 NM out, run-in 255 KIAS", and a note names a cut that would have crossed nearer the last note but more than 300 ft abeam. The peak G is flagged against the CT-156's limit as before (a reference, never a wall). **The views** show the flown cut, with the run-in line drawn from where it joined (marked as the IP).

### Change: the stadium's crowd, field and fireworks (RS-28; proposed, built ahead of Patrick's yes)

Dad, 17 Oct 2026: **"can you include fireworks at the stadium at the end of the song, just for a better visual confirmation. as well as people in the seats with rows, and a football field marking with the goal posts"**. This is 3D polish built ahead of Patrick's yes: Dad chose "Build it now, flagged" after being told the rule book says no more 3D polish in a module still being built. A picture only; every size is an estimate.

On the **Stadium bowl** only (the other targets look as before), in the 3D view:
- **The stands** are 10 stepped tiers rising from the open middle to the same outer wall and 100 ft top as the plain bowl, with **people in the seats in rows** (3 rows a tier, 3.5 ft apart along the row, 12% of seats empty, mixed colours), about 14,000 of them as one instanced mesh.
- **The football field** lies on the bowl's floor at the target's heading: green, end zones (one blue, one red), sidelines and end lines, yard lines every 5 yd with the 10 yd ones thicker, and goal posts (a stem, a crossbar 10 ft up and two uprights 35 ft higher) at both ends. It follows the anthem: **Canadian** (110 yd goal line to goal line, 20 yd end zones, 65 yd wide, posts on the goal line) for O Canada and when no anthem is set (an estimate); **US** (100 yd, 10 yd end zones, 53 1/3 yd wide, posts at the back of the end zone) for the Star-Spangled Banner. Both fit inside the bowl's open middle at true size (450 by 195 ft and 360 by 160 ft in a 544 by 390 ft opening), so neither the field nor the bowl is scaled, and the target sizes in `targets.js`, which the flying uses, do not change.
- **Fireworks** start at the anthem's last note (the time line's "Last note" mark, which is the pass's time over target) when an anthem is chosen, planned or from a live press, and not otherwise: 8 coloured shells rise and burst 260 to 420 ft above the field over about 3 s, their sparks fall and fade, and the show is over about 6 s after the note. They are drawn from the playback time alone, so scrubbing the time line back and forth shows them correctly and they replay.
- **Display** has a new switch, "Stadium crowd, field and fireworks", on by default. Off draws the plain bowl and green floor exactly as before.

**When data fails:** nothing here reads outside data; with no WebGL the 3D view is already replaced by its message. **Cost:** about 14 draw calls and 178,000 triangles for the whole stadium (the crowd is one instanced draw); not measured on a slow computer.
### Change: the aircraft's paint, RCAF, USAF or USN (RS-29; proposed, built ahead of Patrick's yes (Dad, 17 Oct 2026))

Dad, 17 Oct 2026: **"Can we make a paint scheme for USAF and USN"**, with reference photos and profile drawings of the T-6A and T-6B.

The shared CT-156 model gets two more paints (ALL-45), and the **Display** box gets a **Paint** choice: RCAF Harvard (the default, as before), USAF or USN. Choosing one builds the aircraft again where it is and redraws; nothing is replanned or reflown (the paint changes no number). The choice is saved with the other settings. The USAF is white above and dark navy below with a thin red pinstripe at the break, a black glare panel, "U.S. AIR FORCE" under the front cockpit, the star-and-bar and the tail code; the USN is white above and red-orange below with "NAVY", a big tail letter and a side number on the nose. Follow-up, Dad, 17 Oct 2026: **"the usaf and usn need the wing tip triangle ref"**, "the top tip near the outside front edge.. its in the pic". Both paints carry a formation-reference triangle on the upper surface of each wing tip in the outer front corner (navy on the USAF's white wing, red-orange on the USN's; size and shape estimates). His correction the same day: **"You messed up the USAF. White on top blue on bottom"** (the dark wing with "USAF" in his photo was an underside), so the USAF is white above everywhere and the large white "USAF" is under the left wing, on the navy. The colours, the places and sizes of the marks, the tail code and letter and the serials are all **estimates** from Dad's pictures (none of which is copied); see ALL-45 for the list.
