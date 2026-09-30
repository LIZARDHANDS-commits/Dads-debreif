# Traffic Pattern Sim

Routes on the left, aircraft on the right, a map in the middle. The spec is [`specs/SPEC-traffic.md`](../../../specs/SPEC-traffic.md); the task list is in [`tasks/traffic/`](../../../tasks/traffic/todo.md).

## Engine API

The engine is `route.js`, `sim.js`, `dice.js` and `readouts.js` (PR A, tasks 1 to 3). It is pure: plain objects in, plain objects out, no page, no clock, no `Math.random`. The screen calls it and draws what it returns; the drawing never changes a number. Everything is pinned to V6's own Traffic page by `tests/golden/traffic-*.test.js`.

### Conventions

- Positions are **feet**, x east and **y north**, origin at the setup's anchor (`setup.anchor = { lat, lon }`). V6 stored y pointing south; the built-in data was flipped once and nothing else changed.
- Altitudes are feet, speeds are knots, times are seconds of sim time, headings are compass degrees (0 north, 90 east).
- Point numbers on the screen count from 1. Inside the engine a point is its 0-based index in `route.points` (`startIndex`, `sourceIndex`, `mergeIndex`), as in V6; only `sim.spawn`'s `startPoint` is 1-based, because it is what the spawner's box holds.
- This is V6's simple model (SPEC-traffic, Assumption 1): an aircraft is a point that moves along its route at the speed set at the route points, at the height set there. No wind, no types yet (a type is only a colour, as in V6), no avoiding action.

### The setup

`src/modules/traffic/data/moose-jaw.json` is V6's built-in "Moose Jaw Dynamic" profile in this shape. `sim.createSim(setup, …)` reads `routes`, `aircraft`, `routeOptions` and `conflictLimits`; the rest is for the screen.

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
| `routePath(route, options?)` | `{ lengthFt, closed, points, segs }`: the flown path; `points` are V6's `roundedPoints` (`{ x, y, alt, kt, g, src }`), `segs` its `navSegs` (`{ a, b, len, i, headingDeg }`). Read only. |
| `drawPath(route, options?)` | `[{ x, y, alt }]` along the flown path, the rounded turns sampled finely enough to draw |
| `positionAt(route, distFt, options?)` | `{ x, y, alt, kt, headingDeg, leg, g }` at that distance along the route (a pattern wraps round; an open route stops at its ends). `leg` is V6's "Leg" column, counted from 1 |
| `legDistances(route)` | `[{ from, to, ft, nm }]`, one per leg, points counted from 1 (a pattern's last leg goes back to 1) |
| `newPattern(id, name, opts?)`, `newEntry(id, name, patternId, routes, opts?)`, `newSplit(id, name, patternId, routes, opts?)` | V6's builders (`defaultPattern`, `defaultEntry`, `defaultSplit`): a route, not yet in any list. `opts.color` sets the colour; `newPattern` also takes `offsetEastFt` and `offsetNorthFt` |

V6's own functions are there too, for the tests and the editor: `roundedPoints`, `navSegs`, `routeLengthFt`, `pointDistFt` (V6 `pointProg`: distance to where the turn at a point starts), `posOnRoute` (`positionAt` with V6's `seg` and `u`), `closestDistFt` (V6 `closestProg`), `pointTurnRadiusFt`, `isClosedRoute`, and the constants `DEFAULT_ROUTE_OPTIONS`, `ROUTE_COLORS` and `nextRouteColor(routes)` (V6's palette in turn).

### `sim.js`: the flying

```js
const sim = createSim(setup, { seed: 1 });   // aircraft from setup.aircraft, dice from the seed
sim.t                 // sim time in seconds (0 at the start; always a whole number of steps)
sim.seed, sim.setup   // what it was made with
sim.stepTo(tSec)      // fly on to tSec in whole 0.05 s steps; returns how many steps it took
sim.reset()           // back to 0 s, every aircraft (spawned ones too) at its start, the dice from the seed again
sim.spawn({ type, routeId, startPoint, delaySec, id })  // returns the new callsign
sim.remove(id)        // true if it was there
sim.clearFinished()   // drops every aircraft that has landed or is done (V6 "Clear inactive")
sim.aircraftSpecs()   // the aircraft as setup.aircraft has them, for saving a profile
sim.trailOf(id)       // [{ x, y }]: a point every 0.5 s of sim time for the last 2 minutes, oldest first
sim.diceState()       // where the dice are (changes with every roll; the golden tests compare it with V6's)
sim.state()           // what is where right now
```

The step is fixed: `stepTo` takes as many 0.05 s steps as fit in the time it is asked for, and stops there, so the caller keeps the remainder (ask for `sim.t` plus the frame time times the speed each frame). The same run comes out at any frame rate and any speed. At 1× and 20 frames a second it is V6's own run. Time only goes forward: to go back, `reset()` and fly again. `stepTo` throws a `RangeError` for a time that is not a number.

`spawn`: `type` is a V6 type name (default `CT-156`), `routeId` a route (default the first), `startPoint` counts from 1 (default 1; past the last point it is the last), `delaySec` is from now (default 0). `id` picks the callsign; without it the first free `A1`, `A2`, … is used, as in V6. An unknown type or route, a start point that is not a whole number from 1, a delay that is not a number, or a callsign in use throws a `RangeError`.

The clock is added up 0.05 s at a time, as V6 does, so a whole second can come out a hair short (3 s is 2.9999999999999973). `readouts.js` drops the fraction, as V6's clock does, so the clock reads the second before on those ticks, as V6's does.

A route point with no speed is flown at the aircraft type's own speed (V6's 125, 180, 150 and 230 kt for CT-157, CT-156, CT-102 and CT-114) and one with no height at 2,500 ft, as V6 does; the app never makes such a point.

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

Everything is plain text: put it on the page with `textContent`. Numbers are rounded as V6 rounds them (`Math.round`, so .5 goes up; NM and G with `toFixed`), and the golden test compares each string with V6's own.

| Function | Returns |
|---|---|
| `clockText(tSec)` | `H:MM:SS`, e.g. `0:12:40`, `1:02:03` (V6's clock wrapped to `00:00` after an hour). The fraction is dropped, so 59.999 s is `0:00:59`, as in V6; a time that is not a time reads `0:00:00` |
| `startTimeText(tSec)` | `M:SS`, e.g. `2:17`, and `H:MM:SS` from an hour on |
| `aircraftRows(state, setup)` | one row per aircraft, in the state's order: `{ id, type, color, routeName, leg, altFt, kt, status, statusText, startsText, labelText, cells }`. `statusText` is V6's `Flying`, `Waiting`, `Landed` or `Done`; `startsText` is `starts at 2:17` while it waits and empty otherwise; `labelText` is the map label `1880ft 100kt Pattern 1`; `cells` is V6's seven columns (AC, Type, Route, Leg, Alt, KT, Status) as text. An aircraft on a route that has gone is shown on the first route, as in V6 |
| `conflictLines(state)` | `[{ level, a, b, text }]`, `text` like `⚠ CONFLICT A2/A5: 180 ft lat, 120 ft vert` or `△ CAUTION …`; `[]` when there are none, and the screen then shows `noConflictsText` (`No conflicts.`) |
| `legDistanceRows(route)` | `[{ leg: '1→2', from, to, ft, nm, ftText: '7170', nmText: '1.18', labelText: '7170 ft' }]`, a pattern's last leg is `4→1`; `[]` for fewer than two points. The screen leaves out hidden routes, as V6's table does |
| `pointRows(route, options?)` | `[{ number, titleText, dataText, turnText }]` per point: `Pattern 1 6 Downwind`, `2500ft/120kt/2.0G`, and the turn data, empty where V6 shows none (the first point of a pattern; the first and last of an entry or split) |
| `pointDataText(point)` | V6's `1880ft/100kt/2.0G` |
| `turnDataText(point, options?)` | V6's `R 736ft / bank 60°`: the radius the route options give, and the bank the point's G gives |
| `noConflictsText` | `No conflicts.` |

`options` is `setup.routeOptions` (default V6's).
