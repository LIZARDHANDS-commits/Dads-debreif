# Fight Sim: every setting, switch and menu, and what to simplify

Patrick, 10:27Z: "a catalogue of all the settings and switches and menus which are overwhelming and need simplification". Read from `layout.js`, `state.js` and `view3d.js` on main `1020583`. Proposals only; nothing changed. Verdicts:
- **Keep**: stays on the first view.
- **More**: moves into the closed **Advanced setup** menu (Patrick 10:38Z), with a line beside each number saying what it is and why it has that value.
- **Merge**: folds into another control.
- **Remove**: dead, duplicated or not needed.
- **Dad**: also Advanced setup (Patrick 10:38Z replaced the separate page idea), in its own section with the same why-lines.

## Count

| Where | Controls today | Shown at first open (Energy on) | After the proposal |
|---|---|---|---|
| Setup column, first view | 16 (2 always hidden) | 13, of which 5 do nothing in Energy (greyed) | 8, plus the More button |
| Settings menu: Start geometry | 7 | 0 (menu closed) | 5 in More |
| Settings menu: Energy | 8 | 0 | 4 in More |
| Settings menu: Display | 3 | 0 | 1 in More |
| Model settings for checking | 17 (16 boxes and a reset) | 0 (only with `?debug=aero` in the address) | 0 here, moved to Dad's page |
| Toolbar, cameras, panels, menu buttons | 15 | 10 | 13 |
| Hidden numbers with no box | about 30 `TUNING` + 2 test-only | n/a | Dad's page or code constants with sources |
| **Total controls** | **64** | **23** | **about 30, with 14 on first open** |

## 1. Setup column, first view (`layout.js:96-160, 263-269`)

| # | Control | Key | Default | What it does | Problem | Verdict |
|---|---|---|---|---|---|---|
| 1 | Tactical Preset (list of 5) | none | Neutral High-Aspect Merge | Fills the setup from a preset | Not a saved setting; the default preset (250 KIAS, AA 175°) is not the default setup (220 KIAS, AA 180°); no source for the preset numbers | **Keep**, renamed "Start", with the first entry being the real defaults |
| 2 | Fight type | `circles` | 2-circle | Which way Red turns | Fine | **Keep** |
| 3 | Start separation | `separationNm` | 1.2 NM | Range at the start | Fine | **Keep** |
| 4-5 | Blue speed (KTAS), G | `blueKt`, `blueG` | 220, 5 | Simple fight only | Shown greyed in Energy | **Keep** only in Simple; hidden in Energy |
| 6-7 | Red speed (KTAS), G | `redKt`, `redG` | 220, 5 | Simple fight only | As above | As above |
| 8-9 | Pitch (°), each jet | `bluePitchDeg`, `redPitchDeg` | 0 | Climb and dive | Always hidden | **Remove** (TF-R22) |
| 10-11 | Blue start altitude, merge KIAS | `blueAltFt`, `blueKias` | 10,000, 220 | Energy start | Fine | **Keep** |
| 12-13 | Red start altitude, merge KIAS | `redAltFt`, `redKias` | 10,000, 220 | Energy start | Fine | **Keep** |
| 14 | First nose chases | `chase` | off | Simple: after first nose-on both chase | Greyed in Energy (Energy has its own chase rule) | **More**, Simple only |
| 15 | Climb and dive | `vertical` | off | Old V6 vertical | Always hidden | **Remove** (TF-R22) |
| 16 | BFM Energy Fight | `energy` | on | Switches Energy / Simple | A checkbox for the main mode | **Merge** into a two-button switch at the top: "Energy fight / Turn circles" |

## 2. Settings menu "Turn Fight settings" (closed) (`layout.js:162-246`)

Menu button plus "Reset to Standard Defaults".

### Start geometry

| # | Control | Key | Default | Problem | Verdict |
|---|---|---|---|---|---|
| 17 | Red's position off Blue's nose (ATA) | `startAtaDeg` | 5° | Hint says default 0° (wrong) | **More** |
| 18 | ATA side | `startAtaSide` | left | | **Merge** with 17 (signed: left/right in one box, or a dial on the start picture) |
| 19 | Red's aspect angle (AA) | `startAaDeg` | 180° | | **More** |
| 20 | AA side | `startAaSide` | left | | **Merge** with 19 |
| 21 | Red starts above Blue (ft) | `redAboveFt` | 0 | Greyed in Energy; per-jet altitude does this already; hint says "used with Climb and dive" | **Remove** |
| 22 | When the turns start | `turnsAt` | at the pass | | **More** |
| 23 | Neutral Head-on button | | | Same job as choosing the first preset | **Merge** into the Start list |

### Energy (shown only in Energy)

| # | Control | Key | Default | Problem | Verdict |
|---|---|---|---|---|---|
| 24-25 | Blue's move, Red's move (7 choices each) | `blueMove`, `redMove` | Tactical | Hint says Auto is the default (wrong); 7 items mix "who decides" (Tactical, Auto) with forcing a move | **More**, as one "Pilot: Tactical / SMM table" choice for both jets, plus a "Force a move" list per jet for comparing moves |
| 26 | MPT speed | `mptKias` | 160 KIAS | | **More** |
| 27 | Hard deck | `hardDeckFt` | 6,000 ft MSL | | **More** |
| 28 | Pursuit (Tactical / Pure / Lead / Lag) | `pursuit` | Pure | Overlaps with the Tactical pilot, which blends lag, pure and lead itself | **Merge**: the Tactical pilot picks its own pursuit; Pure / Lead / Lag stay only as a "Force a pursuit" choice |
| 29 | Chase from head-on | `chaseAfterHeadOn` | on | Hint says "Off by default" (wrong); with it on, Auto jets chase head-on into each other (traces) | **Remove** as a switch: a pilot rule in the refactor (TF-Q5 still open) |
| 30 | Mid-air collision | `collisionDetection` | on | | **More** |
| 31 | Collision avoidance | `collisionAvoidance` | on | Works only in pursuit today | **Remove** as a switch: avoidance always on, as a pilot rule. Keep 30 for "what if they don't see each other" |

### Display

| # | Control | Key | Default | Problem | Verdict |
|---|---|---|---|---|---|
| 32 | Data tags on aircraft | `dataTags` | on | Same setting as the toolbar's Data tags (#55) | **Remove** (keep the toolbar one) |
| 33 | Side view height scale | `heightScale` | 2x | Only for Climb and dive; greyed in Energy | **Remove** with TF-R22 |
| 34 | Paint | `paint` | Harvard | 3D only | **More**, next to the 3D cameras |

### Model settings for checking (only with `?debug=aero`)

| # | Box | Default | Verdict |
|---|---|---|---|
| 35 | Stall speed | 86 KIAS | **Dad** |
| 36 | Shaker (% of stall-line G) | 94 % | **Dad** (and one shaker rule, see review) |
| 37 | How long a stall lasts | 1 s | **Dad** |
| 38 | Mid-range throttle | 50 % | **Dad** |
| 39-40 | Lead point, Lag point | 1 s, 1 s | **Dad** |
| 41 | Roll rate | 90°/s | **Dad** (shared with Turn Sim) |
| 42-43 | Pitch back bank at 160, at 220 | 60°, 30° | **Dad** |
| 44 | Auto: Immelmann or pitch back above | 220 KIAS | **Dad** |
| 45 | Auto: split S below | 120 KIAS | **Dad** |
| 46 | Immelmann off-nose angle | 120° | **Dad** |
| 47 | Lowest Immelmann top speed | 120 KIAS | **Dad** |
| 48 | Look-ahead (Auto race) | 60 s | **Remove** after the refactor (one look-ahead) |
| 49 | Deck margin | 1,000 ft | **Dad** |
| 50 | Tactical AI look-ahead | 20 s | **Dad** |
| 51 | Reset to defaults (this section) | | **Dad** |

Plus about 30 `TUNING` numbers with no box (`energy-sim.js:160-186`), tuned to the archived MPT test. Proposal: retune after the refactor, keep only those the new pilot still needs, each with a source or marked a guess, on Dad's page.

## 3. Toolbar, cameras and panels (`layout.js:273-360`)

| # | Control | Default | Verdict |
|---|---|---|---|
| 52 | Play / Pause | | **Keep** |
| 53 | Reset | | **Keep** |
| 54 | 2D / 3D switch | 2D | **Keep** |
| 55 | Data tags | on | **Keep** (the one copy) |
| 56 | Playback speed 0.5x-4x | 1x | **Keep** |
| 57-59 | 3D cameras: Overhead, Chase Blue, Chase Red | | **Keep** (3D only) |
| 60 | Fight setup panel open/close | open | **Keep** |
| 61 | Result panel open/close | open | **Keep** |
| 62 | More detail panel | closed | **Keep** (turn rate and radius go here, TF-R16) |
| 63 | Altitude table | closed | **Keep** (accessibility) |
| 64 | About this model | closed | **Keep**, rewritten: it still explains Climb and dive |
| keys | Space plays, Home resets | | **Keep** |

Also on screen, not controls: three version labels (v2.5 title, v2.5 pill, v2.2 on the launcher card): **one label**.

## 4. The proposed first view (Energy)

```
[ Energy fight | Turn circles ]          Start: [ Standard head-on  v ]
Fight type: (2-circle) (1-circle)        Separation: [1.2] NM
Blue  start [10,000] ft   merge [220] KIAS
Red   start [10,000] ft   merge [220] KIAS
> Advanced setup (start geometry, pilot and moves, MPT speed, hard deck, collisions, smoothing, model numbers, paint)
[Play] [Reset] [2D|3D] [Data tags] [1x]
```

14 controls at first open (today 23, of which 5 do nothing in Energy). Everything else is one click away under More; Dad's numbers move to their own page.

## 5. Wrong or stale hint text found

- ATA hint says default 0°; it is 5°.
- Move hint says Auto is the default; it is Tactical.
- Chase from head-on hint says off by default; it is on.
- Red starts above Blue and Side view height scale hints talk about Climb and dive, which cannot be switched on.
- About panel: two paragraphs on Climb and dive.

## Not seen

Nothing was looked at in a browser; this is from the code. The counts include controls that show only in one mode.
