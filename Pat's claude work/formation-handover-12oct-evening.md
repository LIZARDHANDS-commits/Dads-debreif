# Formation handover, 12 Oct 2026 evening (V2.417 on main)

For the next Formation session. Read `AGENTS.md`, then `docs/modules/turn-sim/README.md`, then this.

## Where it stands

Main is at V2.417, `cfdc99d9`. Everything from this session is merged, and no pull request is open from it.

| Version | What | Commit |
|---|---|---|
| V2.411 | TS-208: fighting wing wingmen fly Lead's turn circle, 650 ft of arc behind the one ahead, 500 ft floor, 50-100 ft low stack, power within 15 kt of Lead (2- and 4-ship) | a0d4a827 |
| V2.412 | 4-ship fighting wing start: 650 ft, 60 ft low each, #2 at 60°, #3/#4 at 45° | 7a34f22f |
| V2.413 | Turning rejoin: down onto Lead's wing plane at route spacing, then up the line into echelon | ecc45f69 |
| V2.414 | TS-209: Lead telegraphs close turns (6.5 s to bank, 1.5 s ease in and out; the roll-out mirrors it) | 60e2ee41 |
| V2.415 | 4-ship finger to echelon and the fighting wing start leg (main green again after V2.412) | 5961be6e |
| V2.416 | Wings level and Reversal in the 2-ship close formations; header version reads `src/modules/traffic/version.js` | 666a015c |
| V2.417 | Fluid: #2 rolls back to Lead when Lead turns into him (`fluid-wing-live.js`, `noAerobatics = fw \|\| !overTop`) | cfdc99d9 |

Version label: bump only `src/modules/traffic/version.js` and the fallback in `index.html`. The header and the home screen both read the version file.

## Waiting on Patrick

- Push tags (`Pat's claude work/tags-to-push.md`, second block) and deploy.
- Fly V2.417: the fighting wing turns, the telegraphed close turns, Wings level and Reversal in echelon, and fluid Standard sequence R from a high stack.
- Wording for a decision row on Wings level and Reversal. Working answer: Reversal turns 90° the other way. They also show in route and line astern, 2-ship only.

## Next work (from Patrick's asks, 2-ship focus)

1. **Fluid, too close from high and close in the cone.**
   - A Fluid press from about 520 ft, 60°, 150 ft above ends the entry at about 325 ft.
   - Standard sequence R then reaches about 240 ft, inside the 500 ft minimum.
   - Start from the cone-sweep probe idea: 160 entries over 500-1,000 ft, 30-60°, and ±150 ft, sequence L and R.
   - Patrick's rule (19:17Z): "no matter where we are in the cone we shouldn't lose lead when they turn in to us", entry included.
2. **Rough spots in `docs/modules/turn-sim/future.md`, end of the list.**
   - Telegraphed rolls in route and the 4-ship take 7.5-13 s because of the far-wingman cap.
   - The far-side turning rejoin drops along the whole way.
   - The 4-ship Tracker turn buttons come within about 280-306 ft.

## Unseen and untested

- Nothing from V2.411 to V2.417 has been flown in the app.
- CI on main after V2.416 and V2.417 was not checked by this session.
- Wings level and Reversal were checked only in a headless probe:
  - #2 holds 47 ft in echelon, 146 ft in route and 44 ft in line astern.
  - G stays between 0.73 and 2.27, and roll rate stays at or below 15°/s.

## Rules carried forward

- Patrick's flying beats a figure.
- Lead uses at most 80% torque, except in fluid and the line abreast tactical turns.
- Moves target 4.5 G.
- Keep 500 ft from the plane ahead.
- No roll snaps.
- At most one test per PR.
- Two failed fixes on one problem: stop and ask.
- Confirm the exact wording with Patrick before writing any decision or spec text.
