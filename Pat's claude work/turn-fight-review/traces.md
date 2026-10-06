# Fight Sim traces (what the Energy engine actually flies on main)

Main `1020583`, 4 Oct 2026. Node runs of `energy-sim.js` with the screen's own defaults (`state.js` DEFAULTS through `energySetupFrom`), no browser. Script: `trace.mjs` in this folder (run from the repo root). Raw output: `trace-out-1.json`, `trace-out-2.json`. Each run stops at a gun kill, a collision, or 240 s (my cut-off; the tool's own stop is 10 minutes). Timings are this machine, one run each; a phone will be slower (guess).

Screen defaults: 2-circle, 1.2 NM, Red 5° off Blue's nose (ATA), 10,000 ft, 220 KIAS, both jets **Tactical**, Pure pursuit, chase from head-on on, deck 6,000 ft.

## Results

| Run | Setup change | Result | Notes |
|---|---|---|---|
| default | none | Blue gun kill at 55.7 s | Red changes move 14 times in 47 s (MPT, pitch back, slice, high yo-yo, slice, MPT, pitch back, MPT, slice) |
| auto | both Auto | **Mid-air collision at 66.3 s** | Both pitch back, then 46 s of MPT; Red gets nose-on at 65.9 s, chases head-on, 0.4 s later they collide |
| auto140 | Auto, 140 KIAS | **Collision at 34.2 s** | Both chase each other head-on 1.5 s before impact |
| auto300 | Auto, 300 KIAS | **Collision at 32.9 s** | Both pursue for 14 s, then collide |
| m140 | 140 KIAS | No nose-on in 240 s | Both jets mirror each other: slice / MPT / pitch back flips every 4-7 s, then level MPT at the deck (lowest 5,981 ft) for the rest |
| m180 | 180 KIAS | No nose-on in 240 s | Same churn; 204 s of the 240 in MPT |
| m260 | 260 KIAS | Red gun kill at 39.6 s | |
| m300 | 300 KIAS | No kill in 240 s | Both start pursuit at 19 s and chase each other for 220 s |
| unequal | Blue 250, Red 180 | No kill in 240 s | Red pursues for 184 s; Blue sits 195 s in MPT |
| low | start at 7,000 ft | No kill in 240 s | Red pursues 219 s |
| heights | Red 2,000 ft above | Red gun kill at 38.3 s | |
| forcedImm | Blue Immelmann, Red MPT | No kill in 240 s | Immelmann top at 106 KIAS; Red pursues 209 s |
| forcedSplitS | both split S at 120 | No kill in 240 s | both pursue 193 s |
| forcedSlice | both slice at 150 | **Collision at 128.8 s** | 113 s of mirror MPT circles, no nose-on, no avoidance |
| forcedPitchBack | both pitch back at 200 | **Collision at 162.5 s** | 152 s of mirror MPT, no avoidance |

Over G and STALL never showed in any run. Hard deck: the lowest any jet went was 5,981 ft (level MPT aiming at the deck itself).

## Smoothness (the biggest step-to-step change per jet)

| Quantity | Typical worst per run | Worst seen | Where |
|---|---|---|---|
| Position jump beyond speed x time | 0.00-0.01 ft | 0.01 ft | none: one integrator, no teleports |
| G change | 50-150 G/s | 203 G/s (5.0 to 0.9 G in one 0.02 s step) | move changes: MPT entry (1.9 to 5.0 G), split S level-off, Immelmann roll, pursuit start |
| Roll acceleration | 4,500 deg/s2 | 4,500 deg/s2 | every roll: roll rate goes 0 to 90 deg/s in one step and stops the same way |
| Flight-path pitch acceleration | 200-1,000 deg/s2 | 1,515 deg/s2 | Immelmann and split S phases, MPT entry |

What that means for a pilot: the track on the map is smooth, but the nose and wings move like a switch at every move change. In 3D that shows as a snap or jerk. Real G onset and roll acceleration are finite (no manual figure checked yet; any number here would be a guess).

## Compute

| Run | Building the fight (Reset or any setting change) | Fight time per second of compute |
|---|---|---|
| Tactical (default) | 0.2-1.0 s | 1-7 ms per fight second on average |
| Auto | 0-35 ms | under 1 ms per fight second |

Worst single 0.02 s step, default fight: 96 ms; 7 steps over 10 ms in 56 s. Those are the Tactical re-picks (7 copies of the fight flown 20 s ahead every 3.5 s). `playback.js:111-115` ends the frame and drops the time when one step takes over 10 ms, so the fight hitches and runs slow there (inference from the code; not seen in a browser).

## Not seen

Nothing was looked at in a browser. E2E and unit tests were not run. Wall-clock numbers are this machine only.
