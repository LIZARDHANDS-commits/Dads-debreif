# Spec: `traffic`, the Traffic Pattern Sim

Status: **draft, waiting for Patrick's approval.** Changes go through a pull request. Module id `traffic` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102. This spec's own questions are numbered T1 to T7 (see Open questions); they get plan-doc Q numbers when they're logged.

The build starts when the coordinator says it's the Traffic Sim's turn, after the debrief, the Turn Sim and the Turn Fight. Until then this spec and [`tasks/traffic/`](../tasks/traffic/plan.md) are the work.

## Objective

A planning and teaching tool for traffic around the home airfield. The **left side defines the routes** aircraft fly: circuit patterns, entries that join a pattern, and splits that leave a pattern and rejoin it. The **right side spawns aircraft** that fly those routes (Patrick, 2026-09-29). The map shows every aircraft moving along its route at the speeds, heights and G set at each route point, and flags any two that come too close. A wind can be set, and each aircraft then crabs into it to hold its route, with its ground speed and crab angle worked out from its own airspeed, which comes from its type (Patrick, 2026-09-30).

Users are T-6 instructors and students and the people who plan the Moose Jaw pattern, on a desktop or laptop (D6). They should be able to:

1. Open the Traffic Sim and see the Moose Jaw pattern with its traffic, and press Play (R14).
2. Change a route: drag its points on the map, or set each point's height, speed and G in a table, and add or remove points, entries and splits.
3. Spawn aircraft of a chosen type on any route, now or after a delay, and watch them fly, split off and land.
4. Set a wind (direction and speed) and see each aircraft's crab angle and ground speed, and which turns need more bank to hold their ground track.
5. See conflicts: any two aircraft inside the set lateral and vertical distances, in red, and inside the wider caution distances, in yellow.
6. Rewind or step back and forward 10 s and see exactly what happened, at any playback speed.
7. Save the whole setup as a named profile in this browser and load it again (a few built-in patterns, extra ones saved locally, no sharing: Patrick, 2026-09-29).

V6 does all this in its Traffic Pattern Sim, "Moose Jaw Traffic Sim V37", a separate page V6 embeds as base64 (`traffic.html` once decoded with `python3 tools/extract_subapps.py`; line numbers below refer to it). The rebuild keeps V6's routes, its flying and its numbers, flies rounded turns as true arcs (D46), fixes the bugs the audit found (issues #44 to #49, and #39), adds wind and real aircraft types (Patrick's new requirement, 2026-09-30), and shows only the essentials by default (R22).

## Assumptions

1. **It's V6's simple model, ported unchanged first.** Each aircraft is a point that moves along its route at the speed set at the route points (blended along each leg), at the height set at the points (blended the same way). There's no climb or descent performance and no avoiding action: aircraft fly their routes even through a conflict. The screen says so in one line. With the wind set to calm (the default), everything is exactly V6's.
2. **Rounded turns are true circular arcs (D46, Dad).** Where a turn fits, its radius is the one worked out from the point's speed and G, as the screen says. Where the legs are too short, the turn is tightened to fit, exactly where V6 already tightens it, and the point is flagged with the G it really needs (see T6).
3. **The flying is a pure calculation, kept apart from the drawing** (`sim.js`, `route.js`), so it runs in Node and is pinned against V6's own code by golden tests (R9). The drawing never changes a number.
4. **Random choices are repeatable.** Whether an aircraft lands or takes a split is still a dice roll with the odds set on the route, but the dice come from a seeded generator, so the same run replays the same way and Rewind shows what really happened (#46).
5. **Positions are feet from the setup's airfield**, x east and y north, the app's one convention (`core/angles.js`). V6 stored y pointing south (screen down); the port flips it once when it reads V6's data, and a golden test proves nothing else changes.
6. **A setup belongs to an airfield.** The built-in Moose Jaw setup is anchored where V6 anchors it (50.3303° N, 105.5592° W). The home field comes from `app.airfields` (R16, default CYMJ). Real runway data (FF20) and SOF crosswind (FF21) are future features, not part of this spec.
7. **Only the satellite photo needs the network.** Everything else works offline after the first visit (R6). With no network the map says "satellite photo needs a connection" and shows the grid.
8. **Wind is one steady wind** for the whole map and every height, set as a direction (degrees true, the way a METAR gives it) and a speed in knots. Routes are **ground tracks**: aircraft crab to stay on them, as a pilot flying the pattern does. See "Wind and aircraft types" below.
9. Open questions never block the build. Each defaults to V6's behaviour until it's answered.

## Tech stack

Plain JavaScript ES modules, no framework and no new packages (SPEC.md). Drawing is Canvas 2D through ui-kit's `createCanvasView` (2D map, pan and zoom) and `createCanvasSurface` (3D view). Tests use Node's `node:test` and the Playwright set-up the app frame already has.

## Commands

```
npm run dev                                     # the app with live reload; open the Traffic Pattern Sim card
npm test                                        # unit and golden tests (node --test)
node --test tests/golden/traffic-sim.test.js    # just the V6 comparison of the flying
npm run test:e2e                                # Playwright browser tests
npm run build && npm run preview                # a local build, to measure (performance-optimization)
python3 tools/extract_subapps.py /tmp/v6-subapps    # V6's traffic.html, to read with the line numbers used here
python3 tools/rebuild_original.py /tmp/v6.html      # V6, to compare side by side
```

## Code style

Pure functions with units in their names, turn math from `core`, and a comment naming the V6 line each piece comes from:

```js
// src/modules/traffic/route.js
import { ktToFtps } from '../../core/units.js';
import { limitG, turnRadiusFt } from '../../core/flight-math.js';

/** Turn radius in feet at a route point (V6 `pointTurnRadius`, traffic line 149). */
export function pointTurnRadiusFt(point, { radiusFromG, manualRadiusFt }) {
  if (!radiusFromG) return manualRadiusFt;
  return turnRadiusFt(ktToFtps(point.kt || 120), limitG(point.g || 2, 9));
}
```

- `route.js` and `sim.js` never read the page, settings or the clock. They take plain data and return plain data.
- No `innerHTML`, `!important`, `setInterval` or `requestAnimationFrame` in the module (ui-kit rules, checked by `tests/unit/source-rules.test.js`).

## The screen

Three columns at 1366 × 768 and up, none covering another (R2), each side column collapsed with a real button (ui-kit `panel.js`). Left defines routes, right spawns aircraft, the playback bar sits above the map, not on it (#49, #34, #35).

```
┌ Routes ──────────────────────┐┌ ▶ Play ⏪ Rewind −10s +10s Reset  8× ▾  0:12:40  Running  Wind 250°T 20 kt  2D|3D Layers▾ Fit ┐┌ Aircraft ─────────────────────┐
│ Pattern 1   pattern  Land 20%││                                                                              ││ Spawn  CT-156 ▾  on Entry 1 ▾ │
│ Entry 1     → Pattern 1 P8   ││                                                                              ││ Start at point 1  Delay 0 s   │
│ Split 1     P6 → P1  25%     ││                                                                              ││ [+ Spawn]  [+ Pair, 15 s apart]│
│ + Pattern  + Entry  + Split  ││                 map: satellite, grid, routes, aircraft, bubbles              ││                               │
│                              ││                                                                              ││ A1 CT-157 Pattern 1 2,500 ft  │
│ Pattern 1 (selected)         ││                                                                              ││    GS 162 kt crab 7° R  Flying│
│ Name [Pattern 1]  Land 20 %  ││                                                                              ││ A2 CT-156 Entry 1  waiting    │
│ #  Label      Alt  Speed G   ││                                                                              ││    starts at 2:17      ▸ Edit │
│ 1  Threshold  1880 Final 2.0 ││                                                                              ││                               │
│ 2  Dep. end   2500 140  2.0  ││                                                                              ││ Conflicts                     │
│ + Point  Delete point        ││                                                                              ││ ⚠ CONFLICT A2/A5 180 ft lat,  │
│ ▸ Leg distances              ││                                                                              ││   120 ft vert                 │
│ ▸ Route options              ││                                                                              ││ ▸ Conflict limits             │
│ ▸ Profiles and notes         ││  Simplified: aircraft fly their routes at set speeds, no avoiding action.   ││                               │
└──────────────────────────────┘└──────────────────────────────────────────────────────────────────────────────┘└───────────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| **Playback bar:** Play or Pause, Rewind, −10 s, +10 s, Reset, speed (0.25× to 8×), the sim clock, Running / Paused / Rewinding, the 2D or 3D switch, Layers, Fit. **Wind:** direction (°T) and speed (kt), default calm, with a wind arrow and "Wind 250°T 20 kt" in the map corner whenever it isn't calm | **Layers** menu: trails, height and speed labels, route points, leg distances on the map, turn data (radius and bank at each point, and with a wind set the most G each turn needs), conflict bubbles, caution rings, satellite photo; under its **More**: photo opacity, draw photo above the grid, and photo alignment (scale trim, east/west and north/south offset, 100 ft nudges, Reset photo alignment) |
| **Routes list:** one line per route with its colour, kind and link ("Entry 1 → Pattern 1 P8", "Split 1 P6 → P1, 25 %"); + Pattern, + Entry, + Split | **Route options** (per setup): fly rounded turns (on), radius from speed and G (on), manual turn radius (1,800 ft); Duplicate route, Delete route, show or hide a route on the map |
| **Selected route:** name; for a pattern its land odds; for an entry the pattern and point it joins; for a split the pattern and point it leaves, its odds, and the pattern and point it rejoins. The point table: number, label, altitude (ft), speed, G. Speed is either a number every aircraft flies (V6's way) or a phase, Entry, Pattern or Final, so each aircraft flies its own type's speed for that phase | **Point table's More columns:** each point's position (east and north, ft); **Leg distances** (ft and NM, for the selected route, and with a wind set, each leg's headwind or tailwind and crosswind) |
| **Spawner:** aircraft type, route, start point (numbered from 1, as everywhere else), delay from now (s), + Spawn, + Pair (15 s apart, same route), Clear finished | **Edit** on an aircraft row: type, route, start time, delete; **More detail**: each aircraft's leg number, and with a wind set its true airspeed, heading, track, headwind or tailwind, crosswind, and the bank and G it's pulling now; **Aircraft types**: the type table (speeds by phase, with where each number came from), read-only until Dad's numbers are in (T5) |
| **Aircraft list:** callsign, type, route, altitude, airspeed, and Flying, Waiting (starts at 2:17), Landed or Done | **Conflict limits:** red lateral and vertical distances, yellow caution lateral and vertical distances (see T4) |
| **Conflicts:** each pair in conflict (red, "⚠ CONFLICT") or caution (yellow, "△ CAUTION") with its lateral and vertical distance, or "No conflicts." | **Profiles and notes:** profile name, saved profiles (the built-in ones listed first, read-only), Save, Load, Delete, and the notes box |
| The 2D map: grid, routes (patterns solid, entries dashed, splits dotted), route points of the selected route, aircraft with callsign and height/speed labels, bubbles. With a wind set, each aircraft's row also shows its ground speed and crab angle ("GS 94 kt, crab 7° L"), and its symbol points along its heading, so the crab shows on the map | **3D view** (the 2D or 3D switch): drag to turn and tilt, wheel to zoom, and three camera buttons (Fit, High look-down, Low chase) |

- **Colour is never the only signal.** Conflict lines start with ⚠ CONFLICT or △ CAUTION; routes are also told apart by line style and their name labels; aircraft carry their callsign.
- **Settings are remembered** with the profile (`app.storage`, scope `traffic`), and the last profile used opens next time. Loading the built-in profile puts back V6's setup.
- **Keyboard** (through `app.keys`, only while the Traffic Sim is open and never while typing): Space plays or pauses, Home resets, `[` and `]` step back and forward 10 s. On the map (ui-kit `canvas-view.js`): arrow keys pan, + and − zoom. Tab moves between controls as normal, and the point table keeps focus while you type through it (#49).
- **Number boxes** use ui-kit's number rule, so a blank, zero where zero makes no sense, infinite or out-of-range entry is refused with a message and the last good value stays: altitude −1,000 to 20,000 ft, speed 40 to 400 KT, G 1.0 to 9 (V6 limits G to 1.01 to 9 before turning), odds 0 to 100 %, delay 0 to 86,400 s, conflict distances 0 to 20,000 ft, manual radius 100 to 20,000 ft, wind direction 1° to 360° true, wind speed 0 to 60 kt. V6 had no limits and read a blank speed as 120 kt and a blank G as 2.
- Odds are typed as percentages ("25 %"); V6 typed them as fractions (0.25). The stored value stays a fraction, so V6's numbers are unchanged.

## What V6 does, and what the rebuild keeps

### Routes (`route.js`)

All of this is V6's, ported as it is and pinned by a golden test (R9):

- **Three kinds of route** (lines 160 to 176). A **pattern** is a closed loop. An **entry** is an open line that ends on a pattern point and joins the pattern there. A **split** leaves a pattern at one point and rejoins a pattern at another.
- **Each point** has a label, a position, an altitude, a speed (KT) and a G (line 143). Between points, altitude and speed change evenly along the leg (`lerp`, line 145).
- **Rounded turns** (lines 194 to 214). At each point where the route turns by more than about 4.6° (0.08 rad), the aircraft starts turning a distance d before the point and finishes d after it, where d = R × tan(turn ÷ 2), but never more than 45 % of either leg. R comes from the point's speed and G (V² ÷ (g√(G² − 1)), G limited to 1.01 to 9) or, with "radius from speed and G" off, the manual radius. The first and last points of an entry or split don't round.
- **Where an aircraft is** (lines 215 to 223): its distance flown along the route, looked up on the rounded path.
- **New routes** (+ Pattern, + Entry, + Split): V6's builders (lines 160 to 176). A new pattern is V6's generic one: an 8,000 ft runway on 290° centred on the airfield, 9,000 ft upwind, 5,000 ft out, at 2,000 to 2,500 ft and 95 to 130 kt. A new entry joins the selected pattern; a new split leaves it.

**Changed (D46, Dad).** V6 draws each rounded turn as a curve (a quadratic Bézier) between the start and end of the turn. That curve is tighter than the radius it shows: a 90° turn at 120 kt and 2 G is set at 736 ft but flown at 523 ft, which needs 2.6 G (a 135° turn needs 4.6 G). The rebuild flies a true circular arc between the **same** start and end of turn, so:

- where the turn fits, the arc's radius is exactly R, and the G it needs is the point's own G;
- where a leg is too short (V6's 45 % limit), the arc is tighter than R, and the point is flagged: "Turn at point 10 needs 2.3 G (set 2.0): the legs are too short for a 2,474 ft radius" (see T6);
- routes barely change length, because the start and end of each turn stay where V6 put them. On the built-in Pattern 1 the lap gets 776 ft shorter (156,924 ft, about 25.8 NM, becomes 156,148 ft), a few seconds off a lap of about 8½ minutes.

Measured on V6's own code, built-in Pattern 1 (line 613), turn points only:

| Point | Turn | Set radius | Fits? | Radius flown after D46 | G needed (set) |
|---|---|---|---|---|---|
| 4 Upwind, 5 Crosswind, 7 Downwind | 86° to 91° | 2,474 ft (220 kt, 2 G) | yes | 2,474 ft | 2.0 (2.0) |
| 8, 9 Final Entry | 45° | 2,474 ft | yes | 2,474 ft | 2.0 (2.0) |
| 10 | 83° | 2,474 ft | no | 2,067 ft | 2.3 (2.0) |
| 11, 12, 13 | 88° to 96° | 7,557 to 12,241 ft (set at 1 G) | no | 1,635 to 2,004 ft | 1.1 to 1.5 (1.0) |

### Flying the aircraft (`sim.js`)

Kept from V6 (lines 234 to 244 and 365 to 454), and pinned by a golden test:

- **Spawning.** An aircraft starts at the chosen point of its route after its delay, and moves at the speed of the route where it is (V6's `acProfile`). Its altitude is the route's altitude where it is.
- **Patterns loop.** Each time an aircraft crosses the pattern's first point it may land and leave, with the pattern's land odds (V6's built-in: 20 %).
- **Splits.** When an aircraft on a pattern reaches a split's point, it takes the split with the split's odds. At the end of an entry or split it joins the pattern at the linked point. An entry or split with no pattern to join ends there ("Done").
- **Conflicts** (line 459): two flying aircraft are in **conflict** when both their lateral distance is under the red lateral limit and their height difference is under the red vertical limit; in **caution** when both are under the caution limits but not in conflict.
- **Aircraft types** (line 139): CT-157, CT-156, CT-102 and CT-114, each with its own colour. In V6 the type changes only the colour and every aircraft flies the route's speeds (#45). That stays true for any point whose speed is a number, so V6's built-in setup flies exactly as before; points set to a phase use the type's speed (see "Wind and aircraft types").

Changes that don't change a number:

- **One fixed step.** V6 moves aircraft by the frame time (at most 0.05 s) × the playback speed, so a run comes out slightly differently at different frame rates and speeds. The rebuild moves in whole 0.05 s steps of sim time and carries the remainder to the next frame, so at 1× and 20 frames a second it's V6's own run, and the same on every screen.
- **Routes are worked out once.** V6 rebuilt every rounded route several times per aircraft per frame; the rebuild caches each route's path and redoes it only when that route changes (#49).
- **The sim clock runs only while the Traffic Sim is open** (#39, R4), and the clock reads H:MM:SS, so it no longer wraps to 00:00 after an hour (#46).
- **Trails** keep a point every 0.5 s for the last 2 minutes of sim time, whatever the frame rate. V6 kept the last 500 screen frames, so trail length depended on the frame rate and speed.

### Wind and aircraft types (Patrick, 2026-09-30)

V6 has no wind. Patrick asked for winds and their effect on each aircraft's crab angle and ground speed, based on the aircraft type picked when it's spawned. This is new behaviour, so it lands after V6 is pinned, and with the wind calm it changes nothing: the golden tests keep passing with the wind at 0 kt.

**The wind.** One steady wind for the whole map, at every height: a direction it blows **from**, in degrees true as a METAR gives it, and a speed in knots. Default calm. It's saved with the profile. Wind that changes with height, gusts and turbulence are out of scope.

**Routes are ground tracks.** A route is where the aircraft go over the ground, as a pattern is flown: the pilot crabs into the wind to hold the downwind leg and steepens or shallows the bank to hold the turns. So with a wind:

- **Straight legs.** For an aircraft with true airspeed TAS on a leg whose track is T, with wind W from direction D:
  - crosswind = W × sin(D − T) (from the right when positive), headwind = W × cos(D − T) (a tailwind when negative);
  - crab angle = asin(crosswind ÷ TAS), into the wind; heading = T + crab;
  - ground speed = TAS × cos(crab) − headwind.
  - Example: a CT-156 at 110 KTAS on final, track 290°, wind 250° at 20 kt: crosswind 12.9 kt from the left, headwind 15.3 kt, so crab 6.7° left and ground speed 94 kt.
- **Aircraft move along the route at their ground speed** (V6 moves them at the route speed, which is the same thing with no wind). So in a wind the same pattern takes a different time for each type, and spacing on final shrinks when the headwind slows everyone down, as it does for real.
- **Turns (D46 with wind).** The turn's ground track stays the true arc D46 draws, with the radius worked out from the point's speed and G in still air. Holding that arc in a wind needs more bank where the wind is behind the aircraft and less where it's ahead: G needed = √(1 + (GS² ÷ (g × radius))²), with GS the ground speed at that moment. Example: a 180 KTAS, 2 G turn has a 1,656 ft radius; with a 20 kt tailwind (GS 200 kt) holding it needs 2.4 G. The turn data layer and the point table flag the most G each turn needs in this wind, as they do for turns too tight for their legs (T6). The sim doesn't limit bank: the aircraft always holds its route, and the flag says what it took.
- **Can't hold the track.** If the crosswind is stronger than an aircraft's airspeed, the leg is flagged "can't hold this track in this wind" and the aircraft moves along it at a crawl (10 kt over the ground) so nothing freezes. With the box limits (wind up to 60 kt, speeds from 40 kt) this only happens on a slow point set by hand.
- **The map** draws each aircraft's symbol along its heading, so the crab is visible, while it moves along the track.

**Aircraft types.** The spawner picks the type (V6 already has the list). Each type has a speed for three phases of a route, **Entry**, **Pattern** (upwind, crosswind, downwind, base) and **Final**. A route point's speed is either a fixed number (V6's way, flown by every type) or one of those phases, so each aircraft flies its own type's speed there, blended along the leg as V6 blends speeds. Routes made with + Pattern, + Entry and + Split get phases from V6's own point labels (Threshold / Final and Final Entry are Final, Departure End, Upwind, Crosswind and Downwind are Pattern, entry points are Entry). V6's built-in setup keeps its fixed numbers until Dad says which points should follow the type (T5), so it opens exactly as V6.

The type table below is the default until Dad gives real pattern speeds (T5). Entry and Pattern use V6's own speed for each type (line 139, Dad's numbers). Final uses 1.3 × the published landing stall speed, the usual approach-speed rule (FAA Airplane Flying Handbook, chapter 9), rounded to the nearest 5 kt, except the CT-156, whose final speed comes from Dad's built-in pattern (110 kt at point 13, 100 kt at the threshold).

| Type (V6 name) | What it is | Entry and Pattern (kt) | Final (kt) | Source for Final |
|---|---|---|---|---|
| CT-156 | Harvard II (Beechcraft T-6A), Moose Jaw's trainer | 180 | 110 | Dad's built-in Pattern 1, point 13 |
| CT-157 | Siskin II (Pilatus PC-21), arriving at Moose Jaw from 2026 ([RCAF](https://www.canada.ca/en/air-force/services/aircraft/ct-157.html)) | 125 | 105 | Landing stall about 81 kt ([Wikipedia, PC-21](https://en.wikipedia.org/wiki/Pilatus_PC-21)) |
| CT-102 | Astra (Grob G 120A); the new CT-102B Astra II (G 120TP) is coming to Moose Jaw | 150 | 75 | Landing stall 58 kt for the G 120TP ([Wikipedia, G 120TP](https://en.wikipedia.org/wiki/Grob_G_120TP)); 55 kt for the G 120A |
| CT-114 | Tutor, the Snowbirds' jet | 230 | 90 | Stall 71 kt ([Wikipedia, CT-114](https://en.wikipedia.org/wiki/Canadair_CT-114_Tutor)) |

V6's Entry and Pattern numbers look like cruise or planning numbers rather than pattern speeds (125 kt for a PC-21 is slow for its pattern, 230 kt fast for a Tutor's downwind), which is why T5 asks Dad. Which types to list at all is T3.

**Speeds are true airspeed** for now, as V6 treats them (with no wind, V6's speed is the ground speed). Pattern speeds in flight manuals are indicated airspeed, which at 3,500 ft is about 5 % less than true; T5 asks whether to convert them with the standard atmosphere (`core`'s `isaDensityRatio`).

**How this relates to later features.**

- **Wind from the live METAR.** Once the SOF's weather store exists (built last), a "Use the latest METAR wind for CYMJ" button could fill the wind boxes. It isn't in this spec: it needs the network and the SOF's sources, and a METAR gives the surface wind, which is usually lighter and backed from the wind at pattern height. It goes to the plan doc's Future features as a new idea.
- **Runway data (FF20).** With real runway headings, the sim could show the crosswind component on the runway itself and draw the generic pattern on the real runway. Until then, the final leg's crosswind readout is the nearest thing.
- **SOF crosswind (FF21).** The SOF's crosswind check against each type's limits would use the same wind-triangle functions from `core` (below), so both screens agree. The type table could then carry each type's crosswind limit.

### Changes that fix V6's bugs

Each lands as its own commit after the golden test pins V6's behaviour, and that commit changes the golden test to say exactly what differs (D10). Approving this spec approves them; none changes the flight math.

| Bug (issue) | V6 | Rebuild |
|---|---|---|
| Rewind and ±10 s put aircraft in the wrong place (#46) | At any speed but 1× they rebuild the run at speed × the real distance: at 2×, a minute in, an aircraft is 23,391 ft along its route instead of 9,925 ft | Rewind, −10 s and +10 s land exactly where the run was at that time, at every speed |
| Rewind isn't repeatable (#46) | Landings and splits are re-rolled on every rebuild, so going back shows a different history | The dice come from a generator seeded per run and per aircraft; Reset keeps the seed, and **New traffic** (under Reset's menu) picks a new one |
| Rewind gets slow (#46) | Every rewind frame replays the whole run from 0: 1.7 s for one +10 s at 30 minutes | Snapshots every 10 s of sim time; rewind starts from the nearest one |
| Two splits from one point (#47) | Each split rolls in turn and a later one can override an earlier one, so the odds on screen aren't the odds flown | One roll per split point, see **T1** |
| Jumps at splits and joins (#47) | An aircraft jumps up to 1,944 ft sideways when it leaves for a split, and up to 892 ft when it joins a pattern | The aircraft flies one joined-up path (pattern, split, pattern), rounded as one route, so it never jumps and never changes heading in one step |
| Build buttons wreck the selected route (#44) | "Build Entry to Selected Pattern" turns the selected pattern itself into an entry, with no undo | + Entry and + Split always make a new route linked to the selected pattern. "Build Default Pattern" (which reset the selected route) goes |
| Links break when points are added or removed (#44) | Entries and splits point at a pattern point by its number, so inserting a point makes them point at a different one; their ends are copies, so dragging a pattern point leaves them behind | Links point at the point itself. Adding or removing points keeps them right, and dragging a linked pattern point moves the entry or split end with it. The Snap buttons go, because the ends are always joined |
| Deleted routes come back (#44) | Deleting a route leaves aircraft and links pointing at it, and a new route can reuse its name and pick them up | Route ids are never reused. Delete asks first and names what uses the route; aircraft on it are removed and entries or splits linked to it are marked "Not linked" |
| Pair spawns on two routes (#45) | The second aircraft of "+ Pair 15 sec" goes on whatever route the left panel has selected | Both go on the spawner's route |
| Spawner route jumps (#45) | Selecting a route on the left changes the spawner's route on the right | The spawner keeps its own choice |
| Spawner numbers (#45) | Start point 0 means point 1; the delay is relative in the spawner but absolute in the list | Points are numbered from 1 everywhere; the list says "starts at 2:17" |
| Split odds in two places (#45) | Editable on the left and in a Split Probability Manager on the right, which goes stale | Only on the left, with the split; the routes list shows every split's odds |
| Profiles (#48) | Load doesn't change the name box, so the next Save overwrites another profile; no confirm; storage errors are silent; no way back to the built-in setup | Load fills in the name; Save over an existing name and Delete ask first; "Profiles won't be saved in this browser" when storage is blocked (`app.storage`); the built-in setup is always in the list |
| Unsafe import (#48) | Import JSON can run script from the file | Export and Import go (no sharing, Patrick 2026-09-29). Profiles read back from storage are checked before use |
| Point table (#49) | Altitude, speed and G are off the side of the panel and unlabelled; typing loses focus after every box | A labelled table that fits the column; focus stays |
| Satellite photo (#49) | Can request hundreds of thousands of tiles and freeze the page; no credit to Esri | The tile zoom follows the map zoom, at most 64 tiles a view, a limited cache, failed tiles retried, and Esri's credit line on the map |
| 3D view (#49) | Near things drawn smaller and on the wrong side, heights stretched 1.6×, the whole pattern about 100 px wide, the title under the toolbar | A true perspective camera with the same scale on every axis, framed on the routes; six camera number boxes become drag, wheel and three buttons |
| Caution ring (#49) | Shows only with bubbles on, and never in 3D | Its own layer, in 2D and 3D |
| Turn data (#49) | Skips point 1 of a pattern | Every rounded point |
| Labels (#49) | Every route prints every point's label, so up to six sit on top of each other at the threshold | Point labels only on the selected route; other routes show their name once |

### Removed (R3)

| V6 control | Why it goes |
|---|---|
| Follow-aircraft list in the toolbar | Filled in but never read; choosing one did nothing (#45) |
| Closed loop checkbox | Did nothing: patterns are always loops, entries and splits never (#44) |
| Route type list on an existing route | Changing a pattern into an entry broke every link to it (#44). The kind is set when the route is made; Duplicate copies one |
| Build Default Pattern / Entry / Split | Overwrote the selected route (#44). + Pattern, + Entry and + Split do the useful part |
| Snap entry end / Snap split start / end / both | Linked ends are always joined now (#44) |
| Split Probability Manager | A second, stale copy of the split odds (#45) |
| Export JSON, Import JSON | No sharing (Patrick, 2026-09-29), and Import could run script (#48) |
| Six 3D camera number boxes, three sliders | Replaced by drag, wheel and three buttons; the numbers had no meaning to a user |
| Satellite tile zoom box | Chosen from the map zoom now; a wrong value froze the page (#49) |
| "Moose Jaw default align" | Un-aligned the built-in setup (it set the trim to 1.0 where the setup needs 1.2). Becomes "Reset photo alignment", which puts back the profile's own alignment (see T7) |
| The "← MODULES" button over the 2D/3D tabs | It covered the tabs (#37). The app's header takes you home |
| The V37 changelog line in the notes box | A developer note, not a user's |

### The built-in setup

V6 opens with its "Moose Jaw Dynamic" profile (line 613), and so does the rebuild when the home field is CYMJ: Pattern 1 (13 points), Entries 1 to 4, Splits 1 to 4, aircraft A1 to A7, 8× speed, satellite on at 1.2 trim, conflict limits 200 ft / 200 ft and caution 500 ft / 500 ft (see T4). Its data moves into `src/modules/traffic/data/moose-jaw.json` with a version number, y flipped to point north, and the aircraft start times rounded to whole seconds (V6 stores 12.000000000000005 s). Everything else is V6's.

When the home field isn't CYMJ, see T2.

## What the Traffic Sim needs from `core`

Everything V6's Traffic page does is already in `core` and pinned against its own copies:

| Traffic page in V6 | `core` | Pinned by |
|---|---|---|
| `speedFps` (line 146) | `ktToFtps` (`KT_TO_FTPS` 1.68781) | `tests/golden/core-units.test.js` |
| `bankFromG`, `turnRadiusFromG` (lines 147 and 148), G limited to 1.01 to 9 | `bankDegFromG`, `turnRadiusFt`, `limitG(g, 9)` | `core-flight-math.test.js` |
| `vFromHdg` (line 150) | `unitVectorFromCompassDeg` (north up) | `core-angles.test.js` |
| `lonLatToPixel` (line 250) | `lonLatToWorldPixel` | `core-geo.test.js` |

The route geometry (rounded turns, the arc, the joined path), the flying, the dice and the conflict check are this module's own `route.js` and `sim.js`, as the Turn Sim owns its engine. If the Flight math core thread would rather own them, they move to `core` unchanged.

**New in `core` for the wind** (asked of the Flight math core thread through the coordinator, because the debrief and the SOF crosswind (FF21) can use the same math):

```js
// src/core/wind.js (proposed)
windTriangle(trackDeg, tasKt, windFromDeg, windKt)
  // → { crabDeg, headingDeg, groundSpeedKt, headwindKt, crosswindKt, canHoldTrack }
groundTurnG(groundSpeedKt, radiusFt)   // G needed to hold a ground-track arc
```

With the wind at 0 kt, `windTriangle` returns the airspeed as the ground speed and no crab, exactly, which a test pins. Unit tests use known answers (the final and tailwind-turn examples above, a pure headwind, a pure crosswind, a crosswind stronger than the airspeed).

Two more pieces come from other threads, through the coordinator:

- **The satellite tile loader.** The debrief builds one (SPEC-debrief, `tiles.js`: tile limits, retries, Esri credit). Modules never import each other (SPEC.md), so it moves to `ui-kit` before this module's satellite task, through the app frame thread.
- **The `#/traffic` entry** in `src/shell/registry.js` and `tests/e2e/traffic.spec.js`, through the app frame thread.

## Project structure

```
src/modules/traffic/
  index.js         mount and unmount; wires settings, scheduler, keys, storage
  route.js         route geometry: rounded turns, arcs, joined paths, point lookup (pure)
  sim.js           the flying: spawn, step, land, split, join, conflicts, snapshots (pure)
  dice.js          the seeded dice (pure)
  types.js         the aircraft type table and phase speeds (pure data)
  profile.js       profile shape, V6 import of the built-in data, checks on read-back (pure)
  readouts.js      aircraft rows, conflict lines, leg distances as text (pure)
  map2d.js         the 2D map on a ui-kit canvas view
  view3d.js        the 3D view on a ui-kit canvas surface
  editor.js        the left column: routes list, selected route, point table
  aircraft.js      the right column: spawner, aircraft list, conflicts
  layout.js        the columns, playback bar, Layers menu
  traffic.css
  data/moose-jaw.json   V6's built-in setup
  README.md        what's here and where to change common things (R8)
tests/unit/traffic/          route, sim, dice, profile and readouts tests
tests/golden/traffic-v6.js           runs V6's own Traffic page functions in Node with a stand-in page
tests/golden/traffic-route.test.js   V6 vs route.js on the built-in and generated routes
tests/golden/traffic-sim.test.js     V6 vs sim.js, step by step, with the same dice
tests/e2e/traffic.spec.js            (via the app frame) define, spawn, play, rewind, no overlap, stops when closed
docs/checklists/traffic.md           the sign-off checklist (R21)
```

## Skills used

Patrick asked every thread to name the repo skills it uses (2026-09-30). These follow `.claude/skills/README.md`, and each PR lists the ones it applied.

| Step | Skill (`.claude/skills/`) | How it's used here |
|---|---|---|
| This spec | spec-driven-development | The six core areas, assumptions listed up front, and Patrick's approval before any code |
| The task plan | planning-and-task-breakdown | `tasks/traffic/`: vertical slices, each task with acceptance, verify and at most about 5 files, checkpoints between PRs |
| Tasks 1 to 3, 10 and 12 (routes, flying, readouts, wind, the changes) | test-driven-development | The golden tests against V6's own functions are written first and fail until `route.js` and `sim.js` exist. Each fix starts as a failing test that states the change from V6 (D10). The wind starts from known-answer tests of the wind triangle and a calm-wind test that must equal V6 |
| Every task | incremental-implementation | One task per commit, each leaving the app working; `npm test` before each commit |
| Tasks 4 to 8 and 11 (the screen) | frontend-ui-engineering, with `.claude/references/accessibility-checklist.md` | Labelled controls and table headers, keyboard use, colour never the only signal, R22's essentials-first layout, tokens instead of `!important` |
| Tasks 5, 8 and 9 (map, photo, 3D, rewind) | performance-optimization, with `.claude/references/performance-checklist.md` | Measure the built-in setup at 8× with 30 aircraft at 1920 × 1080 on a local build, and a rewind at 1 hour; one change at a time; log each attempt in the PR |
| Task 7 (profiles) | security-and-hardening, with `.claude/references/security-checklist.md`, plus `/security-review` | Profiles read back from storage are untrusted: shape, size and value checks, text only, never `innerHTML` |
| When something breaks | debugging-and-error-recovery | A golden mismatch or red CI: reproduce, find the step where V6 and the port part, fix, add a regression test |
| Before each PR leaves draft | code-review-and-quality, plus `/code-review` | The five-axis review with severity labels, and `.claude/references/definition-of-done.md` |
| Polish, before sign-off | code-simplification, plus `/simplify` | Tidy without changing a number (the golden tests must still pass) |

## Testing strategy

1. **Golden tests first (R9, D10).** `traffic-v6.js` loads V6's own Traffic functions, unchanged, through `tests/golden/v6-source.js` (which already decodes the Traffic page), with a stand-in page (settings as plain values, no drawing) and `Math.random` replaced by a seeded generator. Tried while writing this spec: V6's `step` runs in Node this way for 30 minutes of sim time on the built-in setup.
   - `traffic-route.test.js`: rounded paths, lengths and positions for every built-in route and a grid of generated ones (turns from 5° to 175°, short and long legs, radius from G and manual), within 1e-9 ft.
   - With the wind at 0 kt and every point's speed a number, as in V6.
   - `traffic-sim.test.js`: V6 and `sim.js` side by side at 0.05 s steps for an hour of sim time, with the same dice in the same order: every aircraft's route, distance along it, altitude, speed, and Flying, Waiting, Landed or Done, within 1e-9 ft; and the conflict list at every step.
2. **Then each change lands as its own commit** and changes the golden test to say exactly what differs: D46's arcs (the path between turn points, everything else the same); the dice (the same odds, now per aircraft); one roll per split point (T1); the joined path at splits and joins. Wind and types then arrive as new behaviour, with the golden tests still passing on a calm wind.
3. **Unit tests** check meaning: a 90° turn at 120 kt and 2 G has a 736 ft radius; a turn that doesn't fit is flagged with the G it needs; rewinding to any time gives exactly the state the run had then, at 0.25× and 8×; the same seed gives the same run; over 20,000 crossings each split is taken at its stated odds; no aircraft moves more than one step's distance at a split or join; inserting a point keeps every link on the same point; a corrupt or oversized profile is refused with a message; with a wind, an aircraft on each leg of a square pattern has the crab and ground speed `windTriangle` gives, stays on its route, and takes longer into the wind; a point set to Final flies each type's Final speed.
4. **Browser tests** (Playwright, via the app frame): define a pattern, add an entry, spawn aircraft on it and see them fly and join (Patrick's left-define, right-spawn test); every control does something (R3); nothing overlaps at 1366 × 768 and 1920 × 1080 (R2); closing the module leaves no frames or timers running (R4); no console errors (R7); the satellite layer with the network off shows its message.
5. **Sign-off checklist** (R21), run by Patrick or Dad against V6 side by side.

## Performance

- Route paths cached per route; the sim does no geometry per frame beyond one lookup per aircraft.
- The map draws only when something moves or changes (ui-kit), and the side columns update at most 5 times a second while playing (V6 rebuilt every table 60 times a second, even when paused, #49).
- Snapshots every 10 s of sim time make any rewind or ±10 s cost at most 10 s of stepping.
- Target: the built-in setup at 8× with 30 aircraft stays smooth at 1920 × 1080 on a local build; rewind at 1 hour of sim time takes under 50 ms.

## Security

- The only outside inputs are what people type (checked by ui-kit's number rule), profiles read back from this browser's storage, and satellite tiles.
- Profiles are checked on read-back before any of it is used: known version, at most 50 routes of at most 200 points, at most 200 aircraft, names at most 60 characters, ids and colours from a fixed pattern, every number finite and in its box's range, links pointing at routes that exist. A profile that fails is skipped with a message, and the others still load.
- Everything is shown as text (ui-kit `h`), never as HTML.
- Satellite tiles come from one fixed Esri address built from numbers only; there's no user-entered URL.

## Boundaries

- **Always:** keep V6's numbers unless a logged decision says otherwise; take turn math from `core`; run `npm test` before each commit.
- **Ask first:** any change to how aircraft fly or what the sim shows beyond D46, the wind and types, and the fixes above; a new package; new outside data (runway data is FF20).
- **Never:** edit `original/`; fold a fix into the port that pins V6; read a number from an input box inside `route.js` or `sim.js`.

## Success criteria

- The golden tests pass on V6's behaviour first, and every change from V6 is one of the listed fixes, D46 or an answered question, each in its own commit.
- A user can define a pattern and an entry on the left, spawn aircraft on the right, and watch them fly, split, join, land and conflict, with only the default controls showing (R22, R14).
- Rewind and ±10 s show exactly what happened, at every speed.
- With a wind set, each aircraft shows its crab angle and ground speed from its own type's airspeed, holds its route, and each turn shows the most G it needs (Patrick's wind requirement).
- With the wind calm, every number is V6's (or a listed change).
- Every control does something, nothing overlaps, and nothing runs after the module closes (R2, R3, R4).
- Patrick or Dad signs off the checklist (R21).

## Plan

The tasks, checkpoints and risks are in [`tasks/traffic/plan.md`](../tasks/traffic/plan.md) and [`todo.md`](../tasks/traffic/todo.md).

## Open questions

Each has a default, which is what gets built until it's answered, and a recommendation. None blocks the build.

**For Patrick**

**T1. Two splits from the same point.** In the built-in setup, Splits 1 and 4 both leave Pattern 1 at point 6 and both say 50 %. Because V6 rolls for each in turn and the second can override the first, aircraft really take Split 1 25 % of the time, Split 4 50 %, and stay on the pattern 25 %: not what the screen says.
- Option 1: one roll per point, each split taken at exactly its stated odds, and the built-in numbers changed to what V6 really flies (Split 1 25 %, Split 4 50 %, so 25 % stay). The traffic looks the same as V6 and the numbers are true. Odds at one point that add up to more than 100 % are refused with a message.
- Option 2: one roll per point with the built-in numbers left at 50 % and 50 %, so every aircraft leaves the pattern at point 6.
- Option 3: keep V6's rolls, and show the real odds beside each split.
- Default and recommendation: **option 1**.

**T2. When the home field isn't Moose Jaw.** V6 only knows Moose Jaw. With another home field set:
- Option 1: open a new setup with V6's generic pattern (an 8,000 ft runway on 290°) centred on the home field, ready to drag into place, and keep the Moose Jaw setup in the profile list. Each saved profile remembers its airfield and opens there.
- Option 2: always open Moose Jaw, whatever the home field.
- Default and recommendation: **option 1**. Real runways for the generic pattern come with FF20.

**T3. Which aircraft types?** V6 lists CT-157, CT-156, CT-102 and CT-114. Moose Jaw's fleet is changing under the RCAF's new training programme: the CT-157 Siskin II (PC-21) and the CT-102B Astra II (Grob G 120TP) are arriving, and the Snowbirds' CT-114 Tutors pause after November 2026.
- Option 1: keep V6's four, with CT-102 meaning the new CT-102B Astra II.
- Option 2: V6's four plus any Dad adds (for example a civilian light aircraft for mixed traffic).
- Default: option 1. Recommendation: option 1 now, and Dad names any others (adding a type is one row of data).

**For Dad (his flying knowledge)**

**T4. What counts as a conflict?** V6's boxes start at 1,500 ft lateral and 500 ft vertical for a conflict and 2,500 ft and 1,000 ft for caution, but the built-in setup opens with 200 ft / 200 ft and 500 ft / 500 ft, which is nearly touching. Default: V6's built-in setup as it opens (200 / 200, 500 / 500). Recommendation: ask Dad which numbers he teaches for the Moose Jaw pattern and put those in the built-in setup.

**T5. Each type's pattern speeds.** The type table above is a placeholder: Entry and Pattern are V6's one speed per type (which look like planning numbers, not pattern speeds), and Final is 1.3 × stall speed from public sources, or Dad's own route for the CT-156. Three things for Dad:
- the real Entry, Pattern and Final speeds for each type, as he teaches them;
- whether they're indicated airspeeds, to be converted to true airspeed with height (about 5 % more at 3,500 ft), which changes V6's calm-wind timing by the same 5 %; the default keeps them as true airspeed, as V6 does;
- which points of the built-in Moose Jaw setup should follow the type's speed (Final for points 1 and 13 of Pattern 1, Pattern for the rest, Entry for the entries is the obvious guess). The default keeps V6's fixed speeds, so the built-in setup flies exactly as V6 until he says.
- Recommendation: all three from Dad, each landing as its own logged change.

**T6. Turns in a wind, and turns too tight for their legs.** D46 flies each turn as a true arc at its stated radius. Where the legs are too short for that radius, V6 already tightens the turn (a turn may start no further back than 45 % of either leg). Default and recommendation: keep V6's tightening, fly it as a true arc, and flag the point with the G it really needs (in the built-in Pattern 1, point 10 needs 2.3 G where 2.0 is set). The other choice is to keep the full radius and cut the corner short, which would move the route off its points. Also: points 11 to 13 are set at 1 G, which means "no turn" in a level turn; did Dad mean "as wide as fits"? The default flies them as V6 does. With a wind, the default also holds each turn's ground track and flags the most G it needs (a 2 G turn at 180 kt needs 2.4 G with a 20 kt tailwind). The other choice is a steady bank, which lets the wind blow the aircraft off its route in the turn; the sim couldn't keep traffic on its routes that way.

**T7. Do the built-in routes match the ground?** The built-in setup only lines up with the satellite photo when the photo is stretched 20 % (V6's scale trim 1.2). Either the route points were placed on the stretched photo, so every distance and time in the built-in setup is about 17 % longer than on the real ground, or the photo is wrong. Default: keep V6's numbers and the 1.2 trim for the built-in setup. Recommendation: Dad checks one known distance (for example the runway, 8,150 ft between points 1 and 2 of Pattern 1) against the CFS; if the routes are stretched, shrink the built-in routes by 1 ÷ 1.2 as its own logged change, so leg distances and lap times are real.
