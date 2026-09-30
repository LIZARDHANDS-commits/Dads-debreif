# Spec: `traffic`, the Traffic Pattern Sim

Status: **draft, waiting for Patrick's approval.** Changes go through a pull request. Module id `traffic` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102. This spec's own questions are numbered T1 to T11; Patrick answered T2 to T6 on 2026-09-30 at 04:36Z (see Answered questions), and the open ones are under Open questions. They get plan-doc Q numbers when they're logged.

The build starts when the coordinator says it's the Traffic Sim's turn, after the debrief, the Turn Sim and the Turn Fight. Until then this spec and [`tasks/traffic/`](../tasks/traffic/plan.md) are the work.

## Objective

A planning and teaching tool for traffic around the home airfield. The **left side defines the routes** aircraft fly: circuit patterns, entries that join a pattern, and splits that leave a pattern and rejoin it (to an inner circuit, a straight-in or back to the start). At **decision points** each aircraft picks what it does next, as a pilot does. The **right side spawns aircraft** that fly those routes (Patrick, 2026-09-29). The map shows every aircraft moving along its route at the speeds, heights and G set at each route point, and flags any two that come too close. A wind can be set, and each aircraft then crabs into it to hold its route, with its ground speed and crab angle worked out from its own airspeed, which comes from its type (Patrick, 2026-09-30). The Moose Jaw pattern can hold 10 to 12 aircraft at different speeds and heights, and the sim is there to show what that looks like (Patrick).

Users are T-6 instructors and students and the people who plan the Moose Jaw pattern, on a desktop or laptop (D6). They should be able to:

1. Open the Traffic Sim and see the Moose Jaw pattern with its traffic, and press Play (R14).
2. Change a route: drag its points on the map, or set each point's height, speed and G in a table, and add or remove points, entries and splits.
3. Spawn aircraft of a chosen type on any route, now or after a delay, and watch them fly, make their choices at the decision points and land.
4. Set a wind (direction and speed) and see each aircraft's crab angle and ground speed, and each turn start earlier with a tailwind and later with a headwind so the aircraft rolls out on its next leg.
5. See conflicts: any two aircraft inside the set lateral and vertical distances, in red, and inside the wider caution distances, in yellow.
6. Rewind or step back and forward 10 s and see exactly what happened, at any playback speed.
6a. Fly the overhead break and the descending final turn, practice forced landings, and simulated engine-outs from the pattern, with the manuals' numbers (Patrick, 06:03Z).
7. Save the whole setup as a named profile in this browser and load it again (a few built-in patterns, extra ones saved locally, no sharing: Patrick, 2026-09-29).

V6 does all this in its Traffic Pattern Sim, "Moose Jaw Traffic Sim V37", a separate page V6 embeds as base64 (`traffic.html` once decoded with `python3 tools/extract_subapps.py`; line numbers below refer to it). The rebuild keeps V6's routes, its flying and its numbers, flies rounded turns as true arcs (D46), fixes the bugs the audit found (issues #44 to #49, and #39), adds wind and real aircraft types (Patrick's new requirement, 2026-09-30), and shows only the essentials by default (R22).

## Assumptions

1. **It's V6's simple model, ported unchanged first.** Each aircraft is a point that moves along its route at the speed set at the route points (blended along each leg), at the height set at the points (blended the same way). There's no climb or descent performance and no avoiding action: aircraft fly their routes even through a conflict. The later tasks add the two pieces of avoiding action Patrick described, extending downwind for traffic on final and moving over between the runways (task 18). The screen says so in one line. With the wind set to calm (the default), everything is exactly V6's.
2. **Turns are flown at a steady bank (D46, Dad; Patrick, T6).** Pattern turns are 60° of bank, 2 G. In calm air that's a true circular arc of the radius worked out from the point's speed and G. In a wind the bank stays steady and the roll-in moves: earlier with a tailwind, later with a headwind, so the aircraft rolls out on its next leg. Where the legs are too short for the turn, it's tightened to fit, exactly where V6 already tightens it, and the point is flagged with the G it really needs.
3. **The flying is a pure calculation, kept apart from the drawing** (`sim.js`, `route.js`), so it runs in Node and is pinned against V6's own code by golden tests (R9). The drawing never changes a number.
4. **Choices happen at decision points, and they're repeatable.** Whether an aircraft lands, goes round again or takes a split is decided at a decision point, by the shares set there or by the aircraft's own plan (see T1). Any dice come from a seeded generator, so the same run replays the same way and Rewind shows what really happened (#46).
5. **Positions are feet from the setup's airfield**, x east and y north, the app's one convention (`core/angles.js`). V6 stored y pointing south (screen down); the port flips it once when it reads V6's data, and a golden test proves nothing else changes.
6. **A setup belongs to an airfield.** The built-in Moose Jaw setup is anchored where V6 anchors it (50.3303° N, 105.5592° W). The home field comes from `app.airfields` (R16, default CYMJ). Real runway data (FF20) and SOF crosswind (FF21) are future features, not part of this spec.
7. **Only the satellite photo needs the network.** Everything else works offline after the first visit (R6). With no network the map says "satellite photo needs a connection" and shows the grid.
8. **Speeds are indicated airspeeds** (Patrick, T5), as pilots fly them. The sim turns each into true airspeed at the point's height with the standard atmosphere (about 3 % more at 2,000 ft, 5 % more at 3,500 ft), and flies the true airspeed.
9. **Wind is one steady wind** for the whole map and every height, set as a direction (degrees true, the way a METAR gives it) and a speed in knots. Routes are **ground tracks**: aircraft crab to stay on them, as a pilot flying the pattern does. See "Wind and aircraft types" below.
10. Open questions never block the build. Each defaults to V6's behaviour until it's answered.

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
┌ Routes ──────────────────────┐┌ ▶ Play ⏪ Rewind −10s +10s Reset  8× ▾  0:12:40  Running  Wind 250°T 20 kt  2D|3D Layers▾ Fit ┐┌ Aircraft ──────────────────────┐
│ Pattern 1   pattern          ││                                                                              ││ Spawn  CT-156 ▾  on Entry 1 ▾  │
│ Entry 1     → Pattern 1 P8   ││                                                                              ││ Start at point 1  Delay 0 s    │
│ Split 1     P6 → P1          ││                                                                              ││ Plan  Random ▾                 │
│ + Pattern  + Entry  + Split  ││                                                                              ││ [+ Spawn]  [+ Pair, 15 s apart]│
│                              ││                map: satellite, grid, routes, aircraft, bubbles               ││                                │
│ Pattern 1 (selected)         ││                                                                              ││ A1 CT-157 Pattern 1 2,500 ft   │
│ Name [Pattern 1]             ││                                                                              ││    GS 162 kt crab 7° R  Flying │
│ #  Label     Alt  Speed  G   ││                                                                              ││ A2 CT-156 Entry 1  waiting     │
│ 1  Threshold 1880 Final  -   ││                                                                              ││    starts at 2:17      ▸ Edit  │
│ 6  Downwind  2500 Patt.  2 ◆ ││                                                                              ││                                │
│ + Point  Delete point        ││                                                                              ││ Conflicts                      │
│ ◆ Decision at P6: Stay 25 %, ││                                                                              ││ ⚠ CONFLICT A2/A5 180 ft lat,   │
│   Split 1 25 %, Split 4 50 % ││                                                                              ││   120 ft vert                  │
│ ▸ Leg distances              ││                                                                              ││ ▸ Conflict limits              │
│ ▸ Route options              ││                                                                              ││                                │
│ ▸ Profiles and notes         ││ Simplified: aircraft fly their routes at set speeds, no avoiding action.     ││                                │
└──────────────────────────────┘└──────────────────────────────────────────────────────────────────────────────┘└────────────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| **Playback bar:** Play or Pause, Rewind, −10 s, +10 s, Reset, speed (0.25× to 8×), the sim clock, Running / Paused / Rewinding, the 2D or 3D switch, Layers, Fit. **Wind:** direction (°T) and speed (kt), default calm, with a wind arrow and "Wind 250°T 20 kt" in the map corner whenever it isn't calm | **Layers** menu: trails, height and speed labels, route points, leg distances on the map, turn data (radius and bank at each point, and with a wind set the most G each turn needs), conflict bubbles, caution rings, satellite photo; under its **More**: photo opacity, draw photo above the grid, and photo alignment (scale trim, east/west and north/south offset, 100 ft nudges, Reset photo alignment) |
| **Routes list:** one line per route with its colour, kind and link ("Entry 1 → Pattern 1 P8", "Split 1 P6 → P1"); + Pattern, + Entry, + Split | **Route options** (per setup): fly rounded turns (on), radius from speed and G (on), manual turn radius (1,800 ft); Duplicate route, Delete route, show or hide a route on the map |
| **Selected route:** name; for an entry the pattern and point it joins; for a split the pattern and point it leaves and the pattern and point it rejoins. The point table: number, label, altitude (ft), speed, G. Speed is a phase (Entry, Pattern, Closed, Inner downwind, Straight-in base, Approach, Landing), so each aircraft flies its own type's indicated airspeed for that phase, or a fixed number every type flies (V6's way). **Decision points** are marked ◆ in the table and on the map; selecting one shows its choices (Stay on the pattern, Land, each split leaving there) with their shares, which must add up to 100 % | **Point table's More columns:** each point's position (east and north, ft); **Leg distances** (ft and NM, for the selected route, and with a wind set, each leg's headwind or tailwind and crosswind) |
| **Spawner:** aircraft type, route, start point (numbered from 1, as everywhere else), delay from now (s), plan (Random, which follows the shares, or a plan picked from the list, see T1), + Spawn, + Pair (15 s apart, same route), Clear finished | **Edit** on an aircraft row: type, route, start time, plan, delete; **Plans** (under More): make or change a plan, a list of what the aircraft does at each decision point it meets, in order ("2 circuits, then Split 4 to the inner circuit, then land"); **More detail**: each aircraft's leg number, and with a wind set its true airspeed, heading, track, headwind or tailwind, crosswind, and the bank and G it's pulling now; **Aircraft types**: the type table (indicated airspeeds by phase, with where each number came from), read-only |
| **Aircraft list:** callsign, type, route, altitude, airspeed, and Flying, Waiting (starts at 2:17), Landed or Done | **Conflict limits:** red lateral and vertical distances (200 ft, 200 ft), yellow caution lateral and vertical distances (500 ft, 500 ft) (T4) |
| **Conflicts:** each pair in conflict (red, "⚠ CONFLICT") or caution (yellow, "△ CAUTION") with its lateral and vertical distance, or "No conflicts." | **Profiles and notes:** profile name, saved profiles (the built-in ones listed first, read-only), Save, Load, Delete, and the notes box |
| The 2D map: grid, routes (patterns solid, entries dashed, splits dotted), route points of the selected route, aircraft with callsign and height/speed labels, bubbles. With a wind set, each aircraft's row also shows its ground speed and crab angle ("GS 94 kt, crab 7° L"), and its symbol points along its heading, so the crab shows on the map | **3D view** (the 2D or 3D switch): drag to turn and tilt, wheel to zoom, and three camera buttons (Fit, High look-down, Low chase) |

- **Colour is never the only signal.** Conflict lines start with ⚠ CONFLICT or △ CAUTION; routes are also told apart by line style and their name labels; aircraft carry their callsign.
- **Settings are remembered** with the profile (`app.storage`, scope `traffic`), and the last profile used opens next time. Loading the built-in profile puts back V6's setup.
- **Keyboard** (through `app.keys`, only while the Traffic Sim is open and never while typing): Space plays or pauses, Home resets, `[` and `]` step back and forward 10 s. On the map (ui-kit `canvas-view.js`): arrow keys pan, + and − zoom. Tab moves between controls as normal, and the point table keeps focus while you type through it (#49).
- **Number boxes** use ui-kit's number rule, so a blank, zero where zero makes no sense, infinite or out-of-range entry is refused with a message and the last good value stays: altitude −1,000 to 20,000 ft, speed 40 to 400 KIAS, G 1.0 to 9 (V6 limits G to 1.01 to 9 before turning), shares 0 to 100 %, delay 0 to 86,400 s, conflict distances 0 to 20,000 ft, manual radius 100 to 20,000 ft, wind direction 1° to 360° true, wind speed 0 to 60 kt. V6 had no limits and read a blank speed as 120 kt and a blank G as 2.
- Shares are typed as percentages ("25 %"); V6 typed its odds as fractions (0.25).

## What V6 does, and what the rebuild keeps

### Routes (`route.js`)

All of this is V6's, ported as it is and pinned by a golden test (R9):

- **Three kinds of route** (lines 160 to 176). A **pattern** is a closed loop. An **entry** is an open line that ends on a pattern point and joins the pattern there. A **split** leaves a pattern at one point and rejoins a pattern at another. (The rebuild lets an entry or split join a point on any route, see Types with their own pattern.)
- **Each point** has a label, a position, an altitude, a speed (KT) and a G (line 143). Between points, altitude and speed change evenly along the leg (`lerp`, line 145).
- **Rounded turns** (lines 194 to 214). At each point where the route turns by more than about 4.6° (0.08 rad), the aircraft starts turning a distance d before the point and finishes d after it, where d = R × tan(turn ÷ 2), but never more than 45 % of either leg. R comes from the point's speed and G (V² ÷ (g√(G² − 1)), G limited to 1.01 to 9) or, with "radius from speed and G" off, the manual radius. The first and last points of an entry or split don't round.
- **Where an aircraft is** (lines 215 to 223): its distance flown along the route, looked up on the rounded path.
- **New routes** (+ Pattern, + Entry, + Split): V6's builders (lines 160 to 176). A new pattern is V6's generic one: an 8,000 ft runway on 290° centred on the airfield, 9,000 ft upwind, 5,000 ft out, at 2,000 to 2,500 ft and 95 to 130 kt. A new entry joins the selected pattern; a new split leaves it.

**Changed (D46, Dad).** V6 draws each rounded turn as a curve (a quadratic Bézier) between the start and end of the turn. That curve is tighter than the radius it shows: a 90° turn at 120 kt and 2 G is set at 736 ft but flown at 523 ft, which needs 2.6 G (a 135° turn needs 4.6 G). The rebuild flies a true circular arc between the **same** start and end of turn, so:

- where the turn fits, the arc's radius is exactly R, and the G it needs is the point's own G;
- where a leg is too short (V6's 45 % limit), the arc is tighter than R, and the point is flagged: "Turn at point 10 needs 2.3 G (set 2.0): the legs are too short for a 2,474 ft radius" (see T6b);
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
- These two rules are pinned as V6 has them, then replaced by decision points (below, T1).
- **Conflicts** (line 459): two flying aircraft are in **conflict** when both their lateral distance is under the red lateral limit and their height difference is under the red vertical limit; in **caution** when both are under the caution limits but not in conflict.
- **Aircraft types** (line 139): CT-157, CT-156, CT-102 and CT-114, each with its own colour. In V6 the type changes only the colour and every aircraft flies the route's speeds (#45). That stays true for any point whose speed is a number, so V6's built-in setup flies exactly as before; points set to a phase use the type's speed (see "Wind and aircraft types").

**Changed: decision points (Patrick, T1).** V6's land odds and split odds are there to stand in for what pilots decide in a busy pattern: some go round again, some take the inner circuit, some come off on a straight-in, some land, so no two laps of traffic look alike. The rebuild makes that explicit:

- A **decision point** is any pattern point where more than one thing can happen: the pattern's first point (Land or Stay) and every point a split leaves from. Each choice there has a share, and the shares add up to 100 %, so the screen says exactly what's flown. One roll per aircraft per decision point, from the seeded dice.
- The built-in setup keeps what V6 really flies: P1 Land 20 %, Stay 80 %; P2 Split 3 50 %, Stay 50 %; P6 Split 1 25 %, Split 4 50 %, Stay 25 % (V6 shows 50 % and 50 % there, see #47); P12 Split 2 50 %, Stay 50 %.
- **Plans.** An aircraft can instead be given a plan when it's spawned: what it does at each decision point it meets, in order ("2 circuits, then the inner circuit, then land"). That lets an instructor set up the same busy pattern every time, for example 10 to 12 aircraft on known plans with one flying something different. An aircraft whose plan runs out lands at the next chance. The spawner's default plan is Random, which follows the shares, so V6's way still works with no set-up.

Changes that don't change a number:

- **One fixed step.** V6 moves aircraft by the frame time (at most 0.05 s) × the playback speed, so a run comes out slightly differently at different frame rates and speeds. The rebuild moves in whole 0.05 s steps of sim time and carries the remainder to the next frame, so at 1× and 20 frames a second it's V6's own run, and the same on every screen.
- **Routes are worked out once.** V6 rebuilt every rounded route several times per aircraft per frame; the rebuild caches each route's path and redoes it only when that route changes (#49).
- **The sim clock runs only while the Traffic Sim is open** (#39, R4), and the clock reads H:MM:SS, so it no longer wraps to 00:00 after an hour (#46).
- **Trails** keep a point every 0.5 s for the last 2 minutes of sim time, whatever the frame rate. V6 kept the last 500 screen frames, so trail length depended on the frame rate and speed.

### Wind and aircraft types (Patrick, 2026-09-30)

V6 has no wind. Patrick asked for winds and their effect on each aircraft's crab angle and ground speed, based on the aircraft type picked when it's spawned. This is new behaviour, so it lands after V6 is pinned. With the wind calm and every point's speed a fixed number, it changes nothing.

**The wind.** One steady wind for the whole map, at every height: a direction it blows **from**, in degrees true as a METAR gives it, and a speed in knots. Default calm. It's saved with the profile. Wind that changes with height, gusts and turbulence are out of scope.

**Speeds are indicated airspeeds (Patrick, T5).** Every speed in the sim, in the type table and on a route point, is indicated airspeed, as pilots fly it. The sim converts it to true airspeed at the aircraft's height with the standard atmosphere: TAS = IAS ÷ √σ, with σ from `core`'s `isaDensityRatio`. That's about 3 % more at 2,000 ft and 5 % more at 3,500 ft, so a 220 KIAS downwind at 3,500 ft is flown at about 231 KTAS. This makes every lap a few percent quicker than V6's, even in calm air, so it lands as its own logged change after the golden tests pin V6.

**Straight legs: crab to hold the track.** Routes are ground tracks, as a pattern is flown. For an aircraft with true airspeed TAS on a leg whose track is T, with wind W from direction D:

- crosswind = W × sin(D − T) (from the right when positive), headwind = W × cos(D − T) (a tailwind when negative);
- crab angle = asin(crosswind ÷ TAS), into the wind; heading = T + crab;
- ground speed = TAS × cos(crab) − headwind.
- Example: a CT-156 landing at 100 KIAS (about 103 KTAS at 1,900 ft), track 290°, wind 250° at 20 kt: crosswind 12.9 kt from the left, headwind 15.3 kt, so crab 7.2° left and ground speed 87 kt.

Aircraft move along the route at their ground speed (V6 moves them at the route speed, which is the same thing with no wind). So in a wind the same pattern takes a different time for each type, and spacing on final shrinks when the headwind slows everyone down, as it does for real.

**Turns: a steady bank, with the roll-in moved for the wind (Patrick, T6).** Pattern turns and the break are flown at a steady 60° of bank, 2 G (Patrick; SMM 4.14, 4.17). The straight-in turns onto base and final are 45°, about 1.4 G (Patrick, 05:04Z; SMM 4.6, 4.16). The final turn of a normal circuit, from the perch, is also 45° at 120 KIAS: one continuous descending 180° turn from the perch to the Window, never below final approach speed + 10 (EFIG p.150-152; SMM 4.19). Patrick asked that the manuals be the source for numbers he hasn't given himself (2026-09-30, 05:28Z). Each point's G sets its bank: new points default to 2 G, and points set to the Approach phase default to 1.41 G. The pilot doesn't change the bank to hold a ground-track circle; instead they roll in earlier with a tailwind and later with a headwind so they roll out on the next leg. The sim does the same:

- Through the turn the aircraft turns at a steady rate through the air, from its heading on the leg before (with that leg's crab) to its heading on the leg after (with that leg's crab). Rate of turn = g × tan(bank) ÷ TAS, so the turn's time is fixed, and so is how far the wind carries the aircraft during it.
- Over the ground that path is a circle stretched downwind (a trochoid). The sim works out, in one step with no trial and error, where on the leg before the aircraft must roll in so that it rolls out exactly on the leg after.
- In calm air this is exactly D46's arc: roll-in at R × tan(turn ÷ 2) before the point, radius R = TAS² ÷ (g × tan(bank)).
- Example: a CT-156 at 220 KIAS (231 KTAS at 3,500 ft), 60° bank, turning 90° from downwind to base (radius 2,744 ft in calm air): with a 20 kt tailwind on downwind the turn takes 11.6 s and the roll-in comes 3,127 ft before the corner instead of 2,744 ft, about 380 ft earlier. With the same wind on the nose it takes 10.4 s and the roll-in comes about 360 ft later.
- The turn's shape is worked out at the turn point's speed. The aircraft moves along it at its ground speed, from the wind triangle on the direction it's going at that moment, and the map draws its symbol along its heading, so the crab shows.
- **Turns that don't fit.** If the roll-in would have to start more than 45 % of the way back along either leg (V6's limit), the turn is tightened to fit, as V6 already does, and the point is flagged with the bank and G it really needs: "Turn at point 10 needs 2.3 G (set 2.0): the legs are too short". In a wind the flag uses the worst case over the turn. The sim doesn't stop the aircraft: it flies the route, and the flag says what it took.
- **Can't hold the track.** If the crosswind is stronger than an aircraft's airspeed, the leg is flagged "can't hold this track in this wind" and the aircraft moves along it at a crawl (10 kt over the ground) so nothing freezes. With the box limits (wind up to 60 kt, speeds from 40 kt) this only happens on a slow point set by hand.

Because the turns depend on each type's speed and on the wind, each route's path is worked out once per type and wind (at most four types) and kept until the route, the wind or a speed changes.

**Aircraft types and phases.** The spawner picks the type (V6's four, T3). Each type has an indicated airspeed for each **phase** of flight at Moose Jaw (Patrick, T5):

| Phase | Where it's flown | CT-156 (KIAS) |
|---|---|---|
| Entry | On an entry, out to where it joins the pattern | 220 |
| Pattern | The circuit: upwind, crosswind, downwind, and the break | 220 |
| Closed | A closed pattern | 140 |
| Inner downwind | Downwind in the inner circuit | 120 |
| Straight-in base | Base on a straight-in, after slowing down at 2,700 ft | 140 |
| Approach | The final turn (from the perch in a circuit, or from base on a straight-in) and final, down to the Window, 3/4 NM from the runway | 120 |
| Landing | At the threshold: the aircraft slows from its Approach speed at the Window to this | 100 |

The straight-in, as Patrick describes it for the CT-156 (2026-09-30, 05:04Z): from the outer pattern at 3,500 ft, abeam the departure end, descend to 2,700 ft at pattern speed; level at 2,700 ft, slow down gradually to 140 KIAS; turn onto base at 140 with 45° of bank; turn final at 120 with 45°; from the Window, 3/4 NM out, slow gradually to 100 KIAS at the threshold, the landing speed. The sim reads "slow to 100" as a gradual slow-down from 120 at the Window to 100 at the threshold (the SMM flies 100 from the Window; the difference is a few seconds on final). The pattern stays at 3,500 ft, Patrick's practice, although the SMM (4.14) and EFIG give 3,000 ft. Every point on that route is a phase or Blend, so each type flies its own version of it.

**Modelling the descent and the slow-down (Patrick, 05:50Z; D117).** The sim flies both, point by point, the way the route is drawn:
- *Descent:* the straight-in leaves the pattern at a point abeam the departure end (3,500 ft, Pattern speed) and has a **level-off** point at 2,700 ft further on. Between them the aircraft descends evenly with distance, still at pattern speed, as V6 already moves heights between points. Where the level-off point sits sets how steep the descent is, and the More detail readouts show each aircraft's rate of descent in ft/min, so a descent that's too steep is easy to see.
- *Slow-down:* from the level-off point (Pattern speed) to the base turn (Straight-in base, 140) the speed bleeds off evenly with distance, level at 2,700 ft, which is the "energy depleting" part. The same happens from 120 at the Window to 100 at the threshold.
- Each aircraft moves at its own true airspeed and ground speed through all of it, so a faster type reaches the base turn sooner and spacing on the straight-in changes as it would for real.
- Climb, descent and deceleration performance (how fast a type *can* slow down with the power at idle) aren't modelled: the aircraft does what the route says. A flag for "slows down faster than the type can" could come later with Dad's numbers.

**Types with their own pattern (Patrick, 05:50Z; D117).** The Grob flies a closer pattern at 3,000 ft and 180 KIAS, but joins the same straight-in base legs, at the same heights, as the CT-156. So:
- A setup can have **more than one pattern**, each with its own shape and heights (the built-in Moose Jaw setup gets a Grob pattern at 3,000 ft when Patrick and Dad redraw it, T8). Each aircraft is spawned on the pattern for its type.
- A split can **join any route**, not only a pattern: the Grob's straight-in leaves the Grob pattern and joins the shared straight-in base legs at the level-off point, where the CT-156's straight-in joins too. The base legs, the final turn and the Window are then drawn once and shared, and moving a point moves it for every type.
- Aircraft of different types on different patterns meet on the shared legs, which is exactly where the sim's conflict check earns its keep.

A route point's speed is a **phase** (each aircraft flies its own type's speed there), **Blend** (the speed is blended from the points either side, for a point where the aircraft is speeding up or slowing down, as in "slow down gradually to 140"), or a **fixed number** every type flies (V6's way). Speeds blend evenly along each leg, as in V6. Routes made with + Pattern, + Entry and + Split get phases from V6's own point labels (Threshold / Final is Landing; Departure End, Upwind, Crosswind, Downwind and Final Entry are Pattern; entry points are Entry), and the user sets the other phases on the splits that fly them.

| Type (V6 name) | What it is | Entry | Pattern | Closed | Inner downwind | Straight-in base | Approach | Landing | Where the numbers come from |
|---|---|---|---|---|---|---|---|---|---|
| CT-156 | Harvard II (Beechcraft T-6A), Moose Jaw's trainer | 220 | 220 | 140 | 120 | 140 | 120 | 100 | Patrick, who flies it (2026-09-30); the same numbers are in the SMM (4.1, 4.8, 4.14, 4.16, Table 4.1) and EFIG (p.134, 150-152), per the Flying manuals index thread |
| CT-157 | Siskin II (Pilatus PC-21), arriving at Moose Jaw ([RCAF](https://www.canada.ca/en/air-force/services/aircraft/ct-157.html)) | 220 | 220 | 140 | 120 | 140 | 120 | 100 | The CT-156's numbers for now (Patrick) |
| CT-102 | Astra II (Grob G 120TP), arriving at Moose Jaw | 180 | 180 | 120 | 120 | 120 | 100 | 80 | Entry and Pattern 180 KIAS on its own closer pattern at 3,000 ft (Patrick, 05:50Z). Inner downwind 120 kt, turning final at 100 kt, final 80 kt: flight tests by [Pilot magazine](https://pilotweb.aero/news/flight-test-grob-g120tp-the-twenty-first-century-trainer-6262292/) and [Flight Global](https://www.flightglobal.com/flight-test-grob-aircraft-g120tp-pocket-rocket/98067.article). Closed and Straight-in base copy its inner downwind (no public source) |
| CT-114 | Tutor, the Snowbirds' jet | 230 | 230 | 140 | 120 | 140 | 120 | 90 | No published circuit speeds found. Entry and Pattern are V6's own number; Closed to Approach copy the CT-156; Landing is 1.3 × its 71 kt stall ([Wikipedia](https://en.wikipedia.org/wiki/Canadair_CT-114_Tutor)), the usual approach-speed rule |

Patrick said the Astra and Tutor numbers look about right (2026-09-30); Dad can correct any of them later, and each correction is one row of data.

**How this relates to later features.**

- **Wind from the live METAR.** Once the SOF's weather store exists (built last), a "Use the latest METAR wind" button could fill the wind boxes (FF24 in the plan doc). A METAR gives the surface wind, which is usually lighter and backed from the wind at pattern height.
- **Runway data (FF20).** With real runway headings, the sim could place a new pattern on the runway by itself (T2 says how it's done by hand until then) and show the crosswind on the runway.
- **SOF crosswind (FF21).** The SOF's crosswind check against each type's limits would use the same wind-triangle function from `core` (below), so both screens agree. The type table could then carry each type's crosswind limit.
- **Automatic sequencing** (an idea for later, not in this spec): aircraft that extend downwind or slow down to keep their spacing behind the one ahead, which is what the pattern really does with 10 to 12 aircraft in it.

### The break, the final turn, PFLs and engine-outs (Patrick, 2026-09-30, 06:03Z; R24)

Patrick asked for the overhead break (slowing from 220 to 120 KIAS), the descending final turn onto a 3° final, practice forced landings (PFLs) and simulated engine-outs from the pattern. The numbers come from the manuals (Patrick, 05:28Z: "all the info we need ... are in the flying manuals index"), cited by section; Patrick's own answers win where they differ. All of this is new behaviour, built after V6 is pinned and the wind and types work (tasks 15 to 18), and none of it changes V6's built-in setup until the redraw (T8).

**How it all fits together, with the wind in everything (Patrick, 06:14Z; R26).** Every aircraft is flown the same way underneath: it moves **through the air** at its true airspeed, heading, bank and rate of descent, and the **wind carries the air**, so its position over the ground is the two added together, every 0.05 s step. Nothing gets its own wind rule; the wind shows up in each manoeuvre because of that one sum:
- **Routes and ordinary flying** (legs, turns, the straight-in): each route is worked out once per type and wind as a path over the ground (crab on the legs, roll-in moved in the turns), so the sim stays fast, exact and repeatable, and Rewind lands on exactly what happened.
- **Anything decided on the spot** (extending downwind, turning in without seeing someone, moving over, an engine-out, joining a PFL): the sim builds a short new path for that one aircraft there and then, with the same air-plus-wind maths, and flies it. Because the dice are seeded, Rewind rebuilds the same paths.
- **Glides.** A glide is fixed in the air: at 125 KIAS clean the aircraft comes down at a set rate, so it covers about 2 NM per 1,000 ft **through the air** (SMM 13.5). The wind then stretches or shrinks that over the ground: into a 20 kt headwind at 125 KIAS the reach over the ground is about 16 % shorter, with a tailwind about 16 % longer. So an engine-out on downwind with the wind behind it can make a key it couldn't in calm air, and one into wind can't. The same goes for the PFL: the height lost per second is fixed, so the half of the circle flown into wind takes longer over the ground and loses more height, and the key heights show it (SMM 13.12).
- **The break, the perch and the keys** move with the wind by the manuals' rules (above), and each move is shown, so a student can see why the break was later today.
- **One wind for every height** is the one simplification left. A later option (FF30) could take a second wind for pattern height, as the wind at 3,500 ft is usually stronger and veered from the surface wind a METAR gives.

**A note on 180° turns.** The steady-bank turn above moves the roll-in along the leg before so the aircraft rolls out on the leg after. For a 180° turn that can't work: the two legs are parallel, so moving the roll-in only slides the whole turn along. So the break and the final turn have their own rules, below, taken from the manuals.

**The overhead break (SMM 4.17, 4.18).**
- A pattern point can be marked **Break**. The aircraft flies initial at Pattern speed and height, then at the break point rolls into a level 180° turn at 60° of bank and 2 G with the power at idle, and rolls out on downwind.
- The speed bleeds off evenly with distance from 220 KIAS at the break to the Inner downwind speed (120 for the CT-156) at a downwind point, by default abeam the threshold (T10 asks Dad how fast a Harvard really slows at idle, to check this).
- Because the speed falls through the turn, the break isn't a circle: at a steady 60° the radius shrinks with the speed (2,744 ft at 220 KIAS, 1,276 ft at 150, at 3,500 ft). The sim flies it in 0.05 s steps, and downwind is wherever the break puts it. The map and Leg distances show the downwind spacing from the runway (for example "Downwind 3,900 ft from the centreline").
- **Wind.** The break point is 2,000 ft past the threshold with a 10 kt headwind on initial, later with more headwind and earlier with less (SMM 4.17 para 39, 4.18 para 42). The manual gives no number per knot, so the sim moves the break point to keep the time from roll-out to the perch the same as with a 10 kt headwind, which is what the rule is for; the readout says so. The bank isn't changed for a crosswind; the aircraft crabs once it's on downwind (SMM 4.18).

**The final turn (SMM 4.19, 4.20, 4.7).**
- The **perch** is abeam the Window on downwind. From it the aircraft flies one continuous descending 180° turn at 120 KIAS (the Approach phase) and rolls out on the extended centreline at the **Window**, 3/4 NM from the threshold, on a 3° glide path.
- **Bank from the spacing.** The turn's radius is half the distance from downwind to the centreline, so the bank is whatever that spacing needs at 120 KIAS: 45° for a 2,800 ft downwind, 35° for 4,000 ft, 29° for 5,000 ft. More than 45° is flagged "downwind too tight for the final turn" (SMM 4.19: up to 45°).
- **Height.** The height falls evenly around the turn from downwind height to the Window height, 3° × 3/4 NM, about 240 ft above the runway (roughly 2,130 ft MSL at Moose Jaw; SMM 4.7). The More detail readout shows the rate of descent: from a 3,500 ft downwind with a 4,000 ft spacing it's about 2,760 ft/min, from 3,000 ft about 1,750 ft/min (see T9).
- **Downwind height** (Patrick, 06:13Z, T9, D118): the Harvards break and fly downwind at 3,500 ft, the Grobs at 3,000 ft, and the final turn normally rolls out on the 3° glide path at the Window.
- **Extending for traffic** (Patrick, 06:13Z; R25). If the final turn would put the aircraft into someone already on final, it extends downwind and turns later. Its roll-out is then further out, where the 3° glide path is higher, so the turn needs less descent. The sim checks at the perch: if at roll-out it would be closer than the **final spacing** to the aircraft ahead on final (default 3,000 ft, see T11), it carries on downwind and checks again each step, then turns and rolls out on the 3° glide path wherever it meets it. The row says "Extended 18 s for traffic".
- **Missing someone** (Patrick, 06:13Z; R25). Sometimes a pilot doesn't see the traffic and turns anyway. Each time an aircraft on Random should extend, it misses the traffic with a set chance (default 10 %, see T11), and a plan can make it happen on purpose. The aircraft **on final** then moves over, between the runways, flies a low approach at 200 ft above the runway at 120 KIAS (SMM 4.21, 4.28 para 68) and rejoins the pattern at the departure end; the one that turned in lands. Where "between the runways" is gets drawn in the redraw (T8); until then it's 500 ft to the side of the centreline, away from the pattern. The conflict check shows the pair, which is the point of the lesson.
- **3° final.** From the Window to the threshold the height follows the 3° glide path (about 300 ft per NM, SMM 4.7). The straight-in's final uses the same glide path from where it meets it.
- **Wind** (SMM 4.20: the perch moves along downwind for a headwind and sideways for a crosswind). The sim does both in one step with no trial and error: it moves the perch along downwind by the distance the wind carries the aircraft during the turn, and changes the bank so the crosswind drift is taken up and the aircraft still rolls out on the centreline, flagging it if that needs more than 45°.

**Practice forced landings (SMM chapter 13).** For types with glide data (the CT-156; the Siskin copies it for now):
- A new route kind, **PFL**, made from a runway end and a left or right orbit: **High Key** over the threshold, **Low Key** 180° around, 1 NM abeam the threshold, **Final Key** 270° around, then the landing (SMM 13.6 to 13.9, 4.28 para 71). It's a circle about 0.8 to 1 NM across.
- Flown at 120 KIAS with the gear down at 30° of bank, losing about 2,600 ft in a full circle (SMM 13.6 para 13), which is about 2,150 ft/min. High Key defaults to 5,000 ft MSL at Moose Jaw (3,000 to 4,000 ft above the field is the window, SMM 13.5 para 8), so Low Key comes out about 3,700 ft MSL and Final Key about 3,050 ft, as the manual gives (SMM 13.8, 13.9). The key heights show on the map, and the aircraft row says how it did: "Low Key 3,650 ft, 50 ft low".
- A PFL can start higher than ideal: the aircraft carries on along the landing direction until it has lost half the excess, then turns (SMM 13.7 para 16).
- **Wind.** The sim flies the manual's first method (SMM 13.12 para 22a): the bank varies to hold the circle over the ground, so into wind the aircraft spends longer in the air and loses more height, and the key heights show that, which is the teaching point. Holding a circle over the ground needs the bank to change with the ground speed; the most bank it takes is flagged if it passes 45°.
- PFL traffic mixes with the pattern and straight-ins, and the conflict check shows where they meet (SMM 4.28 paras 67, 68, 70).

**Simulated engine-outs from the pattern (SMM 13.17, 13.18).**
- Each CT-156 or Siskin row has **Engine out**, and a plan can say "engine out at point N" for a set-piece lesson.
- The aircraft **zooms** straight ahead to 125 KIAS, trading speed for height. Speed alone would give about 1,600 ft from 220 KIAS at 3,500 ft; drag takes some of that, so the sim uses a share of it, 70 % for now (T10 asks Dad).
- It then turns towards the runway and **glides** at 125 KIAS, about 2 NM per 1,000 ft in still air (SMM 13.5 para 7), with the wind changing its range over the ground. It picks the closest key it can reach on a sensible heading, joins the PFL circle at a tangent (SMM 13.13, 13.17 paras 34, 38), lowers the gear and lands.
- With no key in reach it's flagged "can't make the runway: eject" and leaves the sim. In the final turn or on a straight-in final there's no zoom (SMM 13.17 para 40): it glides straight ahead if the runway is in reach, and otherwise ejects.
- Other traffic carries on as before (no avoiding action), so the conflict check shows what the "simulated traffic" call is about.

| Glide data | CT-156 (and CT-157 for now) | Where from |
|---|---|---|
| Best glide, clean | 125 KIAS, about 2 NM per 1,000 ft | SMM 13.5 para 7, 13.14 para 26 |
| Gear down, in the PFL | 120 KIAS, about 2,600 ft per 360° at 30° of bank | SMM 13.6 para 13 |
| High Key at Moose Jaw | 5,000 ft MSL ideal (3,000 to 4,000 ft above the field) | SMM 13.5 paras 7, 8 |
| Zoom | 70 % of the speed-for-height trade | Placeholder (T10) |

Later ideas logged in the plan doc: a go-around or low approach as a choice at the Window (FF27) and a touch-and-go into the closed pattern (FF28), both now part of R27 below, and a check of landing spacing on the runway (FF29).

The CT-102 and CT-114 have no glide data yet, so their rows don't offer Engine out and they can't fly a PFL; the button says why.

### More pattern procedures from the SMM (Patrick, 2026-09-30, 06:15Z; R27)

Patrick asked what else from the SMM's traffic pattern and abnormal procedures the sim should fly, naming break-outs and fly-throughs. The SMM's chapter 4 gives these. The sim has no controller, so each one is a **rule** that fires on its trigger, the way the extension and the move-over do (task 18). The rules are listed under Conflict limits with a checkbox each, all on by default because they're how the pattern really works, and each aircraft row says when one fired ("Broke out: conflict joining downwind").

**Recommended now (tasks 19 to 21):**

| Procedure | What the sim does | Trigger | SMM |
|---|---|---|---|
| **The option at the threshold** | A decision point at every threshold: full stop, touch-and-go, low approach and go-around, with shares (or the aircraft's plan). A touch-and-go goes back up the departure leg into the pattern or a closed pattern; a low approach levels at 200 ft above the runway at 120 KIAS, then goes around | The aircraft reaches the threshold | 4.13, 4.21, 4.22, 4.28 para 72 |
| **Runway occupied** ("continue with the gear") | If the aircraft ahead is still on the runway (a full stop takes a set time to clear, default 45 s), the one behind does a low approach and goes around instead of landing | Landing with the runway not yet clear | 4.28 para 77 |
| **Break-out** | A climbing turn about 45° away from the pattern flow, level above pattern height, then back in by the nearest entry | An aircraft joining the pattern (on an entry, or Whiskey or Echo) would come inside the conflict limits of traffic already in it; traffic in the pattern has right of way | 4.15 para 35, 4.23 |
| **Fly through** | At initial, instead of breaking, carries on to the departure end and turns crosswind to rejoin the pattern (breaking out if downwind traffic is in the way) | A PFL or other traffic would conflict with the break | 4.28 para 67 |
| **Break at the departure end** | Delays the break to the departure end of the runway | Traffic would conflict with a normal break | 4.28 para 73 |
| **Closed pattern: extend, or unable** | The closed pattern (climbing 180° at 45° to 60°, 140 KIAS, levelling at pattern height) is delayed along the departure leg until there's room on downwind; if there's no room by the end of the departure leg, the aircraft carries straight on and joins the normal pattern | Downwind traffic would be inside the conflict limits at the roll-out | 4.24, 4.28 paras 78, 79 |
| **Flapless** | An aircraft option: Approach stays 120 KIAS, Landing becomes 110 KIAS, straight-in base at least 120 | Set on the aircraft when it's spawned, or in a plan | 4.25, 4.26, 14.2 |
| **Rejoin via Whiskey or Echo** | Entries onto the extended downwind, drawn in the redraw (T8) | Route data | 4.28 para 76 |

**Later (Future features, not in this spec's tasks):**

- **Slide over or break to the inner runway** (FF31; SMM 4.28 paras 80, 81): needs the inner runway drawn and a second set of final routes.
- **Early left or right** (FF32; SMM 4.28 para 75): an early climbing turn to crosswind for staff.
- **The square circuit at uncontrolled airfields** (FF33; SMM 4.29): downwind a little further out, base when the threshold is about 45° behind, 3° glide path. This would make a better starter pattern for a home field other than Moose Jaw (T2) than V6's generic one.
- **Automatic sequencing** (already noted): speed control and spacing along the whole pattern, not just on final.

The triggers all use the same prediction: where each aircraft will be a few seconds ahead on its current path, with the wind, checked against the conflict limits. That's one function, tested once, and every rule above calls it.

### Changes that fix V6's bugs

Each lands as its own commit after the golden test pins V6's behaviour, and that commit changes the golden test to say exactly what differs (D10). Approving this spec approves them; none changes the flight math.

| Bug (issue) | V6 | Rebuild |
|---|---|---|
| Rewind and ±10 s put aircraft in the wrong place (#46) | At any speed but 1× they rebuild the run at speed × the real distance: at 2×, a minute in, an aircraft is 23,391 ft along its route instead of 9,925 ft | Rewind, −10 s and +10 s land exactly where the run was at that time, at every speed |
| Rewind isn't repeatable (#46) | Landings and splits are re-rolled on every rebuild, so going back shows a different history | The dice come from a generator seeded per run and per aircraft; Reset keeps the seed, and **New traffic** (under Reset's menu) picks a new one |
| Rewind gets slow (#46) | Every rewind frame replays the whole run from 0: 1.7 s for one +10 s at 30 minutes | Snapshots every 10 s of sim time; rewind starts from the nearest one |
| Two splits from one point (#47) | Each split rolls in turn and a later one can override an earlier one, so the odds on screen aren't the odds flown | Decision points: one roll per point, with shares that add up to 100 %, or the aircraft's plan (T1) |
| Jumps at splits and joins (#47) | An aircraft jumps up to 1,944 ft sideways when it leaves for a split, and up to 892 ft when it joins a pattern | The aircraft flies one joined-up path (pattern, split, pattern), rounded as one route, so it never jumps and never changes heading in one step |
| Build buttons wreck the selected route (#44) | "Build Entry to Selected Pattern" turns the selected pattern itself into an entry, with no undo | + Entry and + Split always make a new route linked to the selected pattern. "Build Default Pattern" (which reset the selected route) goes |
| Links break when points are added or removed (#44) | Entries and splits point at a pattern point by its number, so inserting a point makes them point at a different one; their ends are copies, so dragging a pattern point leaves them behind | Links point at the point itself. Adding or removing points keeps them right, and dragging a linked pattern point moves the entry or split end with it. The Snap buttons go, because the ends are always joined |
| Deleted routes come back (#44) | Deleting a route leaves aircraft and links pointing at it, and a new route can reuse its name and pick them up | Route ids are never reused. Delete asks first and names what uses the route; aircraft on it are removed and entries or splits linked to it are marked "Not linked" |
| Pair spawns on two routes (#45) | The second aircraft of "+ Pair 15 sec" goes on whatever route the left panel has selected | Both go on the spawner's route |
| Spawner route jumps (#45) | Selecting a route on the left changes the spawner's route on the right | The spawner keeps its own choice |
| Spawner numbers (#45) | Start point 0 means point 1; the delay is relative in the spawner but absolute in the list | Points are numbered from 1 everywhere; the list says "starts at 2:17" |
| Split odds in two places (#45) | Editable on the left and in a Split Probability Manager on the right, which goes stale | Only on the left, at the decision point |
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
| "Moose Jaw default align" | Un-aligned the built-in setup (it set the trim to 1.0 where the setup needs 1.2). Becomes "Reset photo alignment", which puts back the profile's own alignment (see T8) |
| The "← MODULES" button over the 2D/3D tabs | It covered the tabs (#37). The app's header takes you home |
| The V37 changelog line in the notes box | A developer note, not a user's |

### The built-in setup

V6 opens with its "Moose Jaw Dynamic" profile (line 613), and so does the rebuild at first when the home field is CYMJ: Pattern 1 (13 points), Entries 1 to 4, Splits 1 to 4, aircraft A1 to A7, 8× speed, satellite on at 1.2 trim, conflict limits 200 ft / 200 ft and caution 500 ft / 500 ft (Patrick, T4). Its data moves into `src/modules/traffic/data/moose-jaw.json` with a version number, y flipped to point north, and the aircraft start times rounded to whole seconds (V6 stores 12.000000000000005 s). That's what the golden tests pin.

Then, each as its own logged change: its land and split odds become decision points (T1), its speeds become indicated airspeeds (T5), and its points are switched to phases (T5): 220 kt points become Entry or Pattern, the 100 kt threshold points Landing, the 120 kt points after the final turn Approach, Split 1 (from 3,500 ft down to 2,700 ft and in to the threshold) becomes the straight-in Patrick describes, Split 3 (from the departure end back to downwind at 140 to 150 kt) Closed, and the other in-between points Blend. Final-turn and straight-in turn points get 45° (1.41 G). Patrick and Dad check that mapping when they redraw the routes.

**Redrawing the routes over a true photo (Patrick, T8).** V6's routes only line up with the photo when it's stretched 20 %, so either the routes or the photo are off. Patrick and Dad know the exact ground references the Moose Jaw pattern flies over. So once the editor and the photo are on screen (task 8), the photo is shown at its true scale (trim 1.0, checked against the runway length in the CFS), and Patrick and Dad drag each point onto its reference and name it after it ("Downwind: over the highway"). **Copy setup as text** (under Profiles and notes) puts the whole setup on the clipboard as text; they paste it into the Traffic thread and it becomes the new built-in setup, as its own logged change with its lap times listed before and after. Until then the built-in setup keeps V6's numbers and its 1.2 trim. They can send the list of references any time before that, and they'll be the point labels. The manuals already name the Moose Jaw references and rejoin lines (EFIG p.209, 211; SMM Fig. 4.9), and give two rules the redraw should follow: the break is a 180° level turn at 60° and 2 G about 2,000 ft past the threshold with a 10 kt headwind, later with more headwind and earlier with less (SMM 4.17, 4.18); and downwind spacing is judged by eye from the runway's position against the aircraft (EFIG p.134, 183). The page references are in the project's manuals notes.

**When the home field isn't Moose Jaw (Patrick, T2).** The sim opens a new setup at the home field with the satellite photo on and a box for the **runway number**. Typing it (say 29) draws V6's generic pattern on that runway: an 8,000 ft runway on the runway's heading (29 → 290°), centred on the airfield, with V6's 9,000 ft upwind and 5,000 ft out at 2,000 to 2,500 ft, and a switch for left- or right-hand circuits. The runway ends are handles: drag them onto the runway in the photo and the whole pattern follows, so the heading and length come out right whatever the magnetic variation. Each saved profile remembers its airfield and opens there, and the Moose Jaw setup stays in the list. Later, with runway data (FF20), the runway is placed automatically.

## What the Traffic Sim needs from `core`

Everything V6's Traffic page does is already in `core` and pinned against its own copies:

| Traffic page in V6 | `core` | Pinned by |
|---|---|---|
| `speedFps` (line 146) | `ktToFtps` (`KT_TO_FTPS` 1.68781) | `tests/golden/core-units.test.js` |
| `bankFromG`, `turnRadiusFromG` (lines 147 and 148), G limited to 1.01 to 9 | `bankDegFromG`, `turnRadiusFt`, `limitG(g, 9)` | `core-flight-math.test.js` |
| `vFromHdg` (line 150) | `unitVectorFromCompassDeg` (north up) | `core-angles.test.js` |
| `lonLatToPixel` (line 250) | `lonLatToWorldPixel` | `core-geo.test.js` |
| (new) indicated to true airspeed | `isaDensityRatio` (TAS = IAS ÷ √σ) | `core-flight-math.test.js` |

The route geometry (rounded turns, the arc, the steady-bank turn in a wind, the joined path), the flying, the dice and the conflict check are this module's own `route.js` and `sim.js`, as the Turn Sim owns its engine. If the Flight math core thread would rather own them, they move to `core` unchanged.

**New in `core` for the wind** (asked of the Flight math core thread through the coordinator, because the debrief and the SOF crosswind (FF21) can use the same math):

```js
// src/core/wind.js (proposed)
windTriangle(trackDeg, tasKt, windFromDeg, windKt)
  // → { crabDeg, headingDeg, groundSpeedKt, headwindKt, crosswindKt, canHoldTrack }
```

With the wind at 0 kt, `windTriangle` returns the airspeed as the ground speed and no crab, exactly, which a test pins. Unit tests use known answers (the final example above, a pure headwind, a pure crosswind, a crosswind stronger than the airspeed). The Flight math core thread has drafted it (PR #100), held until this spec is approved. Its `groundTurnG` (the G needed to hold a ground-track circle) isn't needed any more, because turns hold a steady bank (T6); the steady-bank turn uses `turnRadiusFt` and `bankDegFromG`, which `core` already has.

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
  predict.js       where each aircraft will be a few seconds ahead, for the rules (pure)
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
2. **Then each change lands as its own commit** and changes the golden test to say exactly what differs: D46's arcs (the path between turn points, everything else the same); the dice (the same odds, now per aircraft); decision points (T1); the joined path at splits and joins; indicated airspeed (T5). Wind, types and phases then arrive as new behaviour, with the golden tests still passing on a calm wind and fixed speeds.
3. **Unit tests** check meaning: a 90° turn at 120 kt and 2 G has a 736 ft radius; a turn that doesn't fit is flagged with the G it needs; rewinding to any time gives exactly the state the run had then, at 0.25× and 8×; the same seed gives the same run; over 20,000 crossings each choice at a decision point is taken at its share, and an aircraft with a plan follows it exactly; no aircraft moves more than one step's distance at a split or join; inserting a point keeps every link on the same point; a corrupt or oversized profile is refused with a message; with a wind, an aircraft on each leg of a square pattern has the crab and ground speed `windTriangle` gives, stays on its route, and takes longer into the wind; each steady-bank turn rolls out exactly on its next leg in any wind, at a constant bank, and in calm air is D46's arc; the downwind-to-base example above rolls in 3,127 ft before the corner; a point set to Landing flies each type's Landing speed, converted to true airspeed at its height; the straight-in flies 140 on base, 120 in its 45° turns and 100 at the threshold for a CT-156.
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
- With a wind set, each aircraft shows its crab angle and ground speed from its own type's airspeed, holds its route, and flies its turns at a steady bank, rolling in earlier with a tailwind and later with a headwind (Patrick's wind requirement, T6).
- With the wind calm, every number is V6's (or a listed change).
- Every control does something, nothing overlaps, and nothing runs after the module closes (R2, R3, R4).
- The break, the final turn onto a 3° final, PFLs and engine-outs fly as the manuals describe, with the key heights and flags shown (tasks 15 to 18), and the SMM's threshold options, break-outs, fly-throughs and closed-pattern rules fire on their triggers (tasks 19 to 21).
- Patrick or Dad signs off the checklist (R21).

## Plan

The tasks, checkpoints and risks are in [`tasks/traffic/plan.md`](../tasks/traffic/plan.md) and [`todo.md`](../tasks/traffic/todo.md).

## Open questions

Each has a default, which is what gets built until it's answered, and a recommendation. None blocks the build.

**For Patrick**

**T1. Decision points instead of split and land odds.** Patrick asked what the splits are for (2026-09-30). In V6 they stand in for what pilots decide in the pattern: some go round again, some take the inner circuit, some come off on a straight-in, some land. V6 rolls dice for each split in turn, and the second roll can override the first, so at point 6 the screen says 50 % and 50 % but aircraft really take Split 1 25 % of the time.
- Option 1: **decision points** with shares that add up to 100 %, plus an optional **plan** per aircraft ("2 circuits, inner circuit, land"), with Random as the default plan (see Flying). Random traffic for a quick look, planned traffic for a set-piece lesson, and the same run every time.
- Option 2: decision points with shares only, no plans.
- Option 3: keep V6's rolls and show the real odds beside each split.
- Default and recommendation: **option 1**.

**T8. The references for the redraw.** Which ground reference each point of the Moose Jaw pattern flies over (for example "downwind over the highway"), from Patrick and Dad. Default: V6's routes and 1.2 trim until they redraw them (see The built-in setup). Recommendation: send the list whenever it's handy; the redraw itself happens on screen once task 8 is built.

**T11 (Q75). Spacing on final, and how often someone misses traffic.** How much room does a pilot want ahead on final before turning in (default: at least 3,000 ft to the aircraft ahead at roll-out), and how often should a Random aircraft miss the traffic and turn anyway (default 10 %)? Recommendation: Patrick or Dad gives a number for each; they're one setting each under Conflict limits.

**For Dad (his flying knowledge)**

**T6b. Turns set at 1 G, and turns too tight for their legs.** Points 11 to 13 of the built-in Pattern 1 are set at 1 G, which in a level turn means no bank at all, and point 10's legs are too short for its 2 G turn (it needs 2.3 G). Default: fly them as V6 does, tightened where they don't fit and flagged. Recommendation: set every pattern turn to 60°, 2 G (Patrick's rule) when the routes are redrawn, and move any point whose turn still doesn't fit.

**T5b. Tutor and Astra numbers.** The CT-114 has no published circuit speeds, and the Astra's Entry speed is V6's own number. Default: the type table as it stands (Patrick: "looks about right"). Recommendation: Dad corrects any number he knows better; each is one row of data.

**T10 (Q74). The Harvard's slow-down and zoom.** How fast does a Harvard slow down at idle in a 60° break (the default spreads 220 to 120 KIAS evenly from the break to abeam the threshold), and how much height does the zoom from 220 KIAS really give (the default is 70 % of the speed-for-height trade, about 1,100 ft)? Recommendation: Dad gives a number for each, or they stay as placeholders.

## Answered questions

Patrick, 2026-09-30 at 04:36Z. Each answer lands as its own logged change after V6 is pinned (D10).

- **T2. Home field not Moose Jaw:** a satellite photo and a runway-number box for now; automatic later, with runway data (FF20). See The built-in setup.
- **T3. Aircraft types:** V6's four: CT-156, CT-157, CT-102 (the new Astra II) and CT-114.
- **T4. Conflict limits:** 200 ft lateral and 200 ft vertical for a conflict, 500 ft and 500 ft for caution, for now. The Moose Jaw pattern can hold 10 to 12 aircraft at different speeds and heights, which is what the sim is for. ("Dad's own numbers" meant: V6's boxes start at 1,500 ft / 500 ft but its Moose Jaw setup opens at 200 ft / 200 ft, so it wasn't clear which Dad meant to count as too close.)
- **T5. Speeds:** all indicated airspeeds, converted to true airspeed with height. Phases Entry, Pattern, Closed, Inner downwind, Straight-in base, Approach, Landing, with the CT-156's numbers from Patrick (220 entry and pattern, 140 closed, 120 inner downwind; straight-in: descend to 2,700 ft abeam the departure end, slow to 140 for base, 120 in the final turn and down to the Window at 3/4 NM, 100 at the threshold, 05:04Z; 100 replaces the 110 final he gave at 04:36Z, which is the flapless speed in the SMM), the same for the Siskin for now, and published numbers for the Astra and Tutor. The built-in routes switch to phases. See Wind and aircraft types.
- **T6. Turns:** a steady bank, 60° (2 G) for pattern turns and the break, 45° (about 1.4 G) for the straight-in turns onto base and final (05:04Z), and for a normal circuit's final turn from the perch (EFIG p.150-152), rolling in earlier with a tailwind and later with a headwind. See Wind and aircraft types.
- **T9 (Q73, D118). Downwind height after the break** (06:13Z): 3,500 ft for the Harvards, 3,000 ft for the Grobs; the final turn rolls out on the 3° glide path at the Window, extending downwind when final is busy.
- **T7. Do the routes match the ground?** Replaced by the redraw over a true-scale photo (T8).
