# Traffic Pattern Sim

Routes on the left, aircraft on the right, a map in the middle. The spec is [`specs/SPEC-traffic.md`](../../../specs/SPEC-traffic.md); the task list is in [`tasks/traffic/`](../../../tasks/traffic/todo.md).

## Screen

`index.js` is the module entry (`{ id: 'traffic', title, mount }`). It builds the screen, wires it to the engine, and runs everything on the shell's scheduler and listeners, so closing the module stops it all. It opens paused at 0:00:00 on a copy of the Moose Jaw setup (`data/moose-jaw.json`), with no route picked and the Traffic settings menu closed.

| File | What it does |
|---|---|
| `layout.js` | The three columns (Routes, map with the playback bar above it, Aircraft), the routes list and the "+ New route" menu. Below 900 px the map comes first and the columns stack. |
| `playback-bar.js` | Play or Pause, Reset, speed, the clock, Layers, Fit. |
| `clock.js` | Turns frame time into whole 0.05 s engine steps. Playback speed changes how many steps a frame asks for, never their size, so a run is the same at any frame rate. |
| `scene.js` | The plain data the map draws: routes with their path, decision points and turn data, leg lengths, aircraft, conflicts and trails. |
| `map2d.js` | The 2D map on the canvas (grid, routes, aircraft, labels, trails, bubbles). |
| `editor.js` | The left column's route editor: name, where an entry or split joins, and a row per point (label, altitude, speed, G); "+ Point" and "Delete point"; new routes; Leg distances. |
| `aircraft.js` | The right column: the spawner, the aircraft list and the conflicts. |
| `settings-panel.js`, `defaults.js` | The one closed "Traffic settings" menu and every setting's starting value and range. |
| `glue.js` | Copies the settings the engine reads into the setup, holding each number to its range. |

How it behaves:

- Every change goes into the setup the engine flies, so the map and the aircraft follow at once. Point values, names and labels are checked (range, length, a most of 30 routes and 100 points a route) and refused in plain words; names go on the page as text, never as HTML.
- "+ Point" adds a point halfway to the next one with the average height, speed and G, called "New Point". "Delete point" leaves a pattern at least 3 points and an entry or split at least 2. Links between routes are by point number, so adding or deleting a point moves the links of routes that join it, and a route joined to a deleted point is moved to the point before it.
- "+ New route" makes a pattern, entry or split from the engine's builders and picks it. An entry or split joins the selected pattern, or the first pattern. Route ids are never reused.
- Space plays or pauses and Home resets, never while typing. Escape closes an open menu and puts focus back on its button.

Not built yet: dragging points on the map and typing a point's position, Duplicate route, Delete route (when it is built it must refuse to delete the last route, because the engine throws when the routes are emptied while aircraft exist), editing an aircraft after it is spawned, plans, wind, the 3D view, the satellite photo, Rewind and the ±10 s buttons, profiles, PFLs and the rules.

Tests: `tests/unit/traffic/` for each file (in Node, on a stand-in page), and `tests/e2e/traffic.spec.js` in Chromium on `tests/e2e/pages/traffic.html`, which mounts the module straight from `src/` so the tests don't wait for its entry in `src/shell/registry.js`.

## Engine API

The engine is `route.js`, `sim.js`, `dice.js` and `readouts.js` (PR A, tasks 1 to 3). It is pure: plain objects in, plain objects out, no page, no clock, no `Math.random`. The screen calls it and draws what it returns; the drawing never changes a number. Everything is pinned to V6's own Traffic page by `tests/golden/traffic-*.test.js`.

### Conventions

- Positions are **feet**, x east and **y north**, origin at the setup's anchor (`setup.anchor = { lat, lon }`). V6 stored y pointing south; the built-in data was flipped once and nothing else changed.
- Altitudes are feet, speeds are knots, times are seconds of sim time, headings are compass degrees (0 north, 90 east).
- Point numbers on the screen count from 1. Inside the engine a point is its 0-based index in `route.points` (`startIndex`, `sourceIndex`, `mergeIndex`), as in V6; only `sim.spawn`'s `startPoint` is 1-based, because it is what the spawner's box holds.
- This is V6's simple model (SPEC-traffic, Assumption 1): an aircraft is a point that moves along its route at the speed set at the route points, at the height set there. No wind, no types yet (a type is only a colour, as in V6), no avoiding action.

### The setup

`src/modules/traffic/data/moose-jaw-v6.json` is V6's built-in "Moose Jaw Dynamic" profile in this shape, unchanged; the golden tests and the engine's unit tests read it, so the V6 pins stay on V6's own data. `src/modules/traffic/data/moose-jaw.json` is the default setup: the same routes with the numbers the manuals clearly differ on corrected, each change its own commit (see the manual cross-check, `tests/crosscheck/`). When profiles land (task 7) the V6 setup becomes a selectable built-in profile beside the default. `sim.createSim(setup, …)` reads `routes`, `aircraft`, `routeOptions` and `conflictLimits`; the rest is for the screen.

```js
{
  version: 1,
  name: 'Moose Jaw Dynamic',
  anchor: { lat: 50.3303, lon: -105.5592 },       // where x = 0, y = 0 is
  routes: [ route, … ],
  aircraft: [ { id: 'A1', type: 'CT-157', routeId: 'PAT1', startIndex: 0, startsAtSec: 12 }, … ],
  routeOptions: { flyRoundedTurns: true, radiusFromG: true, manualRadiusFt: 1800 },
  conflictLimits: { latFt: 200, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 },
  view: {                                          // display settings only, V6's own values
    playbackSpeed: 8, zoom: 0.95, center: { x, y },
    showTrails, showLabels, showRoutePoints, showLegDistances, showTurnData, showBubbles, showCautionRings,
    photo: { show, aboveGrid, opacity, trim, offsetEastFt, offsetNorthFt },
  },
  notes: '',
}
```

A **route** is `{ id, name, kind, visible, color, points, … }` with `kind` one of `'pattern'` (a closed loop), `'entry'` or `'split'` (open lines), and the links V6 has, by point index for now:

| kind | extra fields |
|---|---|
| pattern | `landOdds` (chance of landing each time an aircraft crosses the first point) |
| entry | `attachTo` (pattern id it joins), `mergeIndex` (the pattern point it joins at) |
| split | `sourceRoute`, `sourceIndex` (where it leaves), `attachTo`, `mergeIndex` (where it rejoins), `splitOdds` |

A **point** is `{ label, x, y, alt, kt, g }`: position in feet, altitude in feet, speed in knots, G of the turn there.

### `route.js`: shape, length, position (all cached per route)

Every function that needs the route options takes them as an optional last argument, `setup.routeOptions` (default: V6's own, rounded turns on, radius from speed and G, manual radius 1,800 ft). A route's path is worked out once per route and options and kept until a point's position, height, speed or G, or the kind, changes; the caches read the route each time, so editing a point in place is safe.

| Function | Returns |
|---|---|
| `routePath(route, options?)` | `{ lengthFt, closed, points, segs }` (and `draw` and `pointDists`, internal caches of `drawPath` and `pointDistFt`: leave them be): the flown path; `points` are V6's `roundedPoints` (`{ x, y, alt, kt, g, src }`), `segs` its `navSegs` (`{ a, b, len, i, headingDeg }`). Read only. |
| `drawPath(route, options?)` | `[{ x, y, alt }]` along the flown path, the rounded turns sampled finely enough to draw |
| `positionAt(route, distFt, options?)` | `{ x, y, alt, kt, headingDeg, leg, g }` at that distance along the route (a pattern wraps round; an open route stops at its ends). `leg` is V6's "Leg" column, counted from 1 |
| `legDistances(route)` | `[{ routeId, from, to, ft, nm, x, y }]`, one per leg, points counted from 1 (a pattern's last leg goes back to 1, so a pattern of two points has 1→2 and 2→1, as V6 draws it). `x`, `y` is the middle of the leg in feet, where the map puts its label |
| `pointTurn(route, i, options?)` | `{ radiusFt, bankDeg }` for the turn at point `i` (from 0), or `null` where V6 shows none: the first point of a pattern, the first and last of an entry or split (bug #49, kept for now). `pointRows` uses it; `turnAtPoint(point, options?)` is the same numbers for any point |
| `newPattern(id, name, opts?)`, `newEntry(id, name, patternId, routes, opts?)`, `newSplit(id, name, patternId, routes, opts?)` | V6's builders (`defaultPattern`, `defaultEntry`, `defaultSplit`): a route, not yet in any list. `opts.color` sets the colour; `newPattern` also takes `offsetEastFt` and `offsetNorthFt` |

V6's own functions are there too, for the tests and the editor: `roundedPoints`, `navSegs`, `routeLengthFt`, `pointDistFt` (V6 `pointProg`: distance to where the turn at a point starts), `posOnRoute` (`positionAt` with V6's `seg` and `u`), `closestDistFt` (V6 `closestProg`), `pointTurnRadiusFt`, `isClosedRoute`, and the constants `DEFAULT_ROUTE_OPTIONS`, `ROUTE_COLORS` and `nextRouteColor(routes)` (V6's palette in turn).

### `sim.js`: the flying

```js
const sim = createSim(setup, { seed: 1 });   // aircraft from setup.aircraft, dice from the seed
sim.t                 // sim time in seconds (0 at the start; always a whole number of steps)
sim.seed, sim.setup   // what it was made with
sim.stepTo(tSec)      // fly on to tSec in whole 0.05 s steps; returns how many steps it took
sim.reset()           // back to 0 s, every aircraft (spawned ones too) at its start and no longer landed, the dice from the seed again
sim.spawn({ type, routeId, startPoint, delaySec, id })  // returns the new callsign
sim.remove(id)        // true if it was there
sim.clearFinished()   // drops every aircraft that has landed or is done (V6 "Clear inactive")
sim.aircraftSpecs()   // the aircraft as setup.aircraft has them, for saving a profile
sim.trailOf(id)       // [{ x, y }]: a point every 0.5 s of sim time for the last 2 minutes, oldest first. V6 also adds the split point to the trail when a split is taken; this does not (display only)
sim.diceState()       // where the dice are (changes with every roll; the golden tests compare it with V6's)
sim.state()           // what is where right now
sim.remapStarts(routeId, mapIndex)  // a point was added to or deleted from a route: move the start points of its aircraft the same way
```

`remapStarts(routeId, mapIndex)` is for the editor: when a point is added to or deleted from a route, `mapIndex(oldIndex) → newIndex` (0-based) says where each point number went, and every aircraft that starts on that route (spawned ones and `setup.aircraft`) starts at the same place as before. An aircraft that has not left yet is moved to its new start; one that is flying keeps its distance along the route (as V6's does).

`setup.routes` must not be emptied while there are aircraft (V6's Delete route refuses the last one): `createSim`, `reset` and `spawn` throw a `RangeError` ("the setup needs at least one route") when there is no route to put an aircraft on. `reset` clears `landed`, as V6's `resetAircraftToStarts` does (V6's Reset button left it set).

The step is fixed: `stepTo` takes as many 0.05 s steps as fit in the time it is asked for, and stops there, so the caller keeps the remainder (ask for `sim.t` plus the frame time times the speed each frame). The same run comes out at any frame rate and any speed. At 1× and 20 frames a second it is V6's own run. Time only goes forward: to go back, `reset()` and fly again. `stepTo` throws a `RangeError` for a time that is not a number.

`spawn`: `type` is a V6 type name (default `CT-156`), `routeId` a route (default the first), `startPoint` counts from 1 (default 1; past the last point it is the last), `delaySec` is from now (default 0). `id` picks the callsign; without it the first free `A1`, `A2`, … is used, as in V6. An unknown type or route, a start point that is not a whole number from 1, a delay that is not a number, or a callsign in use throws a `RangeError`.

The clock is added up 0.05 s at a time, as V6 does, so a whole second can come out a hair short (3 s is 2.9999999999999973). `readouts.js` drops the fraction, as V6's clock does, so the clock reads the second before on those ticks, as V6's does.

V6 reads a missing speed as 120 kt and a missing height as 2,500 ft, and so does this. The aircraft type's own speed (V6's 125, 180, 150 and 230 kt for CT-157, CT-156, CT-102 and CT-114) is used only on a route with no legs (one point or none), and the height its start point had when it was made (2,500 ft if none) there too, as V6's `acProfile` does; the app never makes a point with no speed.

Constants: `STEP_SEC` (0.05), `TYPE_COLORS` (V6's four types and the colour each is drawn in) and `DEFAULT_CONFLICT_LIMITS` (200, 200, 500, 500 ft, used when `setup.conflictLimits` is missing).

`sim.state()` returns:

```js
{
  t: 12.5,
  aircraft: [{
    id: 'A1', type: 'CT-157', color: '#a5d6ff',
    routeId: 'PAT1',            // the route it is on now (it changes at splits and joins)
    x, y, alt, kt, headingDeg,  // where it is, and the route's height and speed there (V6's Alt and KT)
    leg,                        // V6's Leg column, counted from 1
    distFt,                     // distance flown along routeId
    status: 'waiting' | 'flying' | 'landed' | 'done',
    startsAt: 12,               // sim time it starts, in seconds
  }, …],
  conflicts: [{ a: 'A2', b: 'A5', latFt, vertFt, level: 'conflict' | 'caution' }, …],
}
```

A landed or done aircraft keeps the place it stopped at. Conflicts are between aircraft that are flying: both distances under the red limits is a conflict, both under the caution limits (and not a conflict) a caution. `setup.routes`, `setup.routeOptions` and `setup.conflictLimits` are read each step, so a route or a limit edited while it runs takes effect at once, as in V6.

### `dice.js`

`createDice(seed)` returns a function that gives a number from 0 up to (not including) 1 each time it is called, the same numbers for the same seed (mulberry32). `dice.getState()` and `dice.setState(state)` save and restore it. The sim takes all its choices (land or go round, take a split or not) from one shared dice, in V6's order; a dice for each aircraft comes with task 12.

### `readouts.js`: text, with V6's rounding

Everything is plain text: put it on the page with `textContent`. These strings (`labelText`, `dataText`, `turnText`, the table cells) are for the tables and lists and are pinned to V6's own text. The map keeps the spec's own style ("1,880 ft 100 kt", with commas) in `map2d.js` and takes its numbers from `legDistances` and `pointTurn`, not from these strings. Numbers are rounded as V6 rounds them (`Math.round`, so .5 goes up; NM and G with `toFixed`), and the golden test compares each string with V6's own.

| Function | Returns |
|---|---|
| `clockText(tSec)` | `H:MM:SS`, e.g. `0:12:40`, `1:02:03` (V6's clock wrapped to `00:00` after an hour). The fraction is dropped, so 59.999 s is `0:00:59`, as in V6; a time that is not a time reads `0:00:00` |
| `startTimeText(tSec)` | `M:SS`, e.g. `2:17`, and `H:MM:SS` from an hour on |
| `aircraftRows(state, setup)` | one row per aircraft, in the state's order: `{ id, type, color, routeName, leg, altFt, kt, status, statusText, startsText, labelText, cells }`. `statusText` is V6's `Flying`, `Waiting`, `Landed` or `Done`; `startsText` is `starts at 2:17` while it waits and empty otherwise; `labelText` is the map label `1880ft 100kt Pattern 1`; `cells` is V6's seven columns (AC, Type, Route, Leg, Alt, KT, Status) as text. An aircraft on a route that has gone is shown on the first route, as in V6 |
| `conflictLines(state)` | `[{ level, a, b, text }]`, `text` like `⚠ CONFLICT A2/A5: 180 ft lat, 120 ft vert` or `△ CAUTION …`; `[]` when there are none, and the screen then shows `noConflictsText` (`No conflicts.`) |
| `legDistanceRows(route)` | `[{ leg: '1→2', routeId, from, to, ft, nm, x, y, ftText: '7170', nmText: '1.18', labelText: '7170 ft' }]`, a pattern's last leg is `4→1`; `[]` for fewer than two points. The screen leaves out hidden routes, as V6's table does |
| `pointRows(route, options?)` | `[{ number, titleText, dataText, turnText }]` per point: `Pattern 1 6 Downwind`, `2500ft/120kt/2.0G`, and the turn data, empty where V6 shows none (the first point of a pattern; the first and last of an entry or split) |
| `pointDataText(point)` | V6's `1880ft/100kt/2.0G` |
| `turnDataText(point, options?)` | V6's `R 736ft / bank 60°`: the radius the route options give, and the bank the point's G gives |
| `noConflictsText` | `No conflicts.` |

`options` is `setup.routeOptions` (default V6's).

### Gluing the screen's settings to the setup

The settings store (`defaults.js`) and the setup name the same things differently, so the screen's glue copies them across when it starts a sim and whenever a box changes: `conflictLatFt` to `setup.conflictLimits.latFt`, `conflictVertFt` to `.vertFt`, `cautionLatFt` to `.cautionLatFt` and `cautionVertFt` to `.cautionVertFt`; `flyRoundedTurns`, `radiusFromG` and `manualRadiusFt` to `setup.routeOptions` (same names). The sim reads them each step, so a change takes effect at once.
