# The flight-math list

Read this before writing any flight math (`AGENTS.md`, "Search for existing flight math before writing new"). If what you need is here, use it. If it is close, improve it here and in its test. Never write a second copy. A new shared formula gets a line in this list in the same change.

Every function lives in `src/core/` and is tested in `tests/unit/core/`. Inside the code, headings are math radians (0 east, counter-clockwise), except where a line says compass degrees. Positions are feet with x east and y north. Speeds say which kind they are.

Sources: "aero" means standard aerodynamics, worked out in the test. A manual page is given where one backs the number. "Estimate" means no manual or ruling backs it yet.

## Turns

| Function | File | What it gives, in pilot words | Source |
|---|---|---|---|
| `gFromBankDeg(bank)` | flight-math.js | G in a level turn at this bank: 60° is 2 G | aero, 1 / cos(bank) |
| `bankDegFromG(g)` | flight-math.js | Bank for a level turn at this G | aero |
| `turnRadiusFromBankFt(v, bank)` | flight-math.js | Turn radius from bank and true airspeed (ft/s) | aero, v² / (g tan bank) |
| `turnRateFromBankRadPerSec(v, bank)` | flight-math.js | Turn rate from bank and true airspeed | aero, g tan bank / v |
| `turnRadiusFt(v, g)`, `turnRateRadPerSec(v, g)` | flight-math.js | The same, given G instead of bank | aero |
| `limitG(g, max)`, `MIN_TURN_G` | flight-math.js | Keeps G above 1.01 so a turn exists | design choice (D74) |
| `rollToward(bank, target, maxDelta)` | flight-math.js | Rolls toward a bank by at most a step, the short way round | kinematics |
| `dampedClimbG(...)` | flight-math.js | G to bring the flight path smoothly onto a target climb angle | kinematics |
| `gFromTrack(p0, h0, p1, h1, dt)` | flight-math.js | G of a level turn read off a recorded track | aero |
| `stepPointMass(state, control, dt)` | point-mass.js | One step of an aircraft flown by G and bank, through loops and vertical | aero, Runge-Kutta |

## Speed, height and energy

| Function | File | What it gives | Source |
|---|---|---|---|
| `iasToTasKt(kias, alt)`, `tasToIasKt` | t6-performance.js | Indicated to true airspeed and back, standard day, no compressibility | aero |
| `machToKiasKt`, `speedOfSoundKt` | t6-performance.js | KIAS for a Mach number; speed of sound | aero |
| `isaDensityRatio(alt)` | flight-math.js | Air density as a fraction of sea level | standard atmosphere |
| `energyHeightFt(alt, ktas)` | t6-performance.js | Height plus the height the speed is worth | aero |
| `thrustPerWeight`, `dragPerWeight`, `excessThrustPerWeight` | t6-performance.js | Full-power thrust, drag and what is left to climb or speed up with. Climb rate = excess × TAS. Pass the turn's real G | fitted to the T-6A sustained turn chart (`T6A_FIT`) |
| `T6A_LIMITS`, `stallLimitG`, `availableG` | t6-performance.js | V-n limits, stall line, G available now | NFM; stall 86 KIAS (Patrick, 30 Sep) |
| `maxKiasT6A`, `modelMaxIasT6A` | t6-performance.js | Top speed at a height (VMO 316 or Mmo 0.67) | NFM Fig 5-3, p.5-9 |
| `shakerG`, `T6A_MANOEUVRE`, `splitST6A` | t6-performance.js | Pulls in the stick shaker; the split S | SMM 14.16 |

## Engine out

| Function | File | What it gives | Source |
|---|---|---|---|
| `T6A_GLIDE` | t6-performance.js | Glide speed and ratio per configuration: clean 2.0, gear down 1.5, T/O flap 1.3, landing flap 1.1 NM per 1,000 ft | T-6A max glide chart; SMM 13.5 para 7. T/O flap row is an estimate |
| `glideRatio(config)` | t6-performance.js | Feet flown per foot of height lost (clean about 12.2) | same chart |
| `glideSinkFpm(config, kias, alt)` | t6-performance.js | Sink rate at any height (the chart's ft/min fit only at about 16,000 ft) | same chart |
| `zoomT6A`, `flyZoomT6A`, `NFM_ZOOM` | t6-performance.js | Height gained by the zoom after an engine failure | NFM Fig 3-4, p.3-12 |

## Wind and navigation

| Function | File | What it gives | Source |
|---|---|---|---|
| `windTriangle(track, tas, windFrom, windKt)` | wind.js | Crab, heading and ground speed to hold a track (compass degrees). Pass the track, not the heading | aero |
| `windVectorFtps(windFrom, windKt)` | wind.js | The wind as a vector, x east and y north, the way the air moves | aero |
| `legOffsetsFt(a, b, p)` | geo.js | Distance along a leg and off it (right positive) | geometry |
| `compassDegFromVector(dx, dy)`, `wrapDeg360` | angles.js | Compass bearing of a vector; degrees into 0-360 | geometry |
| `wrapDeg180`, `wrapPi`, `angleDiffRad`, `headingRad` | angles.js | Angle wrapping and differences, math radians | geometry |
| `compassDegToHeadingRad`, `headingRadToCompassDeg`, `unitVectorFromCompassDeg` | angles.js | Compass degrees to code headings and back | geometry |
| `relativeBearingDeg`, `aspectAngleDeg`, `headingCrossAngleDeg`, `clockToRelativeDeg` | angles.js | Bearing off the nose, aspect, heading crossing angle, clock code | geometry |
| `closureKt` | flight-math.js | Closure between two aircraft | geometry |
| `latLonToLocalFt`, `localFtToLatLon`, `distance` | geo.js | Map feet and lat/lon | flat-earth projection |
| `FT_PER_NM`, `KT_TO_FTPS`, `G_FTPS2` and the rest | units.js | Unit constants, once | standard values |

## Formation and gunnery

`standards.js` (formation spread, offset and lead standards, SMM defaults D114-D116) and `tennis.js` (the tennis-ball solution) are shared too; see their file headers.

## Flight math still inside the Traffic Sim

These live in `src/modules/traffic/` today. The refactor moves or replaces them (Traffic plan, Step 2). The full table of copies is in `pf/reset/traffic-architecture/flight-math-duplicates.md`.

| What | Where now | What happens to it |
|---|---|---|
| Moose Jaw numbers (threshold, runway heading, field elevation, pattern and key heights, PFL circle) | `airfield.js` | Stays there; any number still typed elsewhere moves in by PR 5 |
| Wind-shaped circuit path: wind perch, break arc, final turn | `route.js` (`computeWindPerch`, `simulateBreakArc`, `generateWindAdjustedTrack`) | Becomes the circuit path in PR 2 |
| PFL circle and its old height schedule | `route.js` (`generatePflTrack`), `pfl-rail.js`, `pfl-solver.js` | Rebuilt in PR 3 |
| The 1,350 ft/min sink literal | `pfl-rail.js`, `pfl-solver.js`, `map2d.js` | Replaced by `glideSinkFpm` in PR 3 |
| Glide speeds 125 / 120 / 100 | `flight-engine.js` | Settled with the PFL spec in PR 3 (Patrick's C1: 125 clean, 120 gear down) |
| IAS used as TAS in calm air; heading passed where track is meant | `tick-aircraft.js`, `flight-engine.js` | Fixed in PR 2 |
| Bank laws, intercept gain, climb-arrest pitch, break deceleration | `flight-engine.js`, `tick-aircraft.js`, `high-key.js`, `breakout.js` | One guidance law in PR 2 and PR 4 |
| Turn rate from bank, G from bank, g = 32.174 inline | `high-key.js`, `pfl-rail.js`, `pfl-solver.js`, `flight-engine.js` | Removed with those files' rewrites (PR 2 to PR 4) |
