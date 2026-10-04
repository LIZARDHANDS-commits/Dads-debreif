# Turn Fight: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on TF-R1 to TF-R25, ratified by Patrick on 4 Oct 02:01Z (`pf/reset/1-requirements/requirements.md`, "## Turn Fight"), and the "Realistic kinematics means (Turn Fight)" paragraph under them. The per-test keep, rewrite or retire marks, and what each of the 43 failing browser tests shows, are in the test register's Turn Fight section.

**Today:** 18 unit files (558 tests, all pass) and one browser file that passes 25 and fails 43 at `6283f38` (`pf/reset/5-testing/browser-results-6283f38.md`). The browser file was written for the older screen: it expects the Simple fight first, 2 NM and head-on, a Climb and dive box, and the phase "HEAD-TO-HEAD", while the module now opens on the Energy fight at 1.2 NM with Red 5° off the nose, which is what Patrick ratified (TF-R14, TF-R20, TF-R22). About 70 tests gate on a time, one of them on computer time (`tests/unit/turn-fight/energy-sim.test.js:403`). Many Energy checks pin the engine's own output (`pf/reset/5-testing/agents/turn-fight.md`, module summary). Several tests keep the jets under the speed limit and above the hard deck as if those were walls, which TF-R4, TF-R6 and T10 now say are flagged, not stopped.

## Turn Fight rules on top of the whole-tool rules

- **F1. The Simple fight's answers are geometry, worked out in the test.** Turn rate = g·√(n²−1)/V, radius = V²/(g·√(n²−1)), bank = acos(1/G), the pass time = start distance ÷ closing speed, 360° time = 360 ÷ rate. A time shown on screen and checked by its formula is a check of the readout, not a time gate (T2). The circle drawn and the numbers shown agree (TF-R3).
- **F2. The Energy fight is checked by invariants and shapes (TF-R5 to TF-R7).** Energy is honest: with thrust equal to drag the energy height stays constant; no jet ends higher and faster than it started without power; climbing costs speed. Each move has its shape: a pitch back climbs while reversing, a slice descends, an Immelmann goes up and over and ends upright and slower, a split S loses height. The jets end in a steady turn near the max-performance turn (about 160 KIAS and 17 units, SMM 14.3 para 6) as an outcome with a stated margin and its reason. Where the model differs from the manual (its MPT bank of about 68.5° against the SMM's 75°), the difference is written down for Patrick and Dad, never tuned to pass (T7).
- **F3. Physical limits hold; published limits are flagged (T10).** Physical: no jet turns harder than its wing can give at that speed. Past the stall line STALL shows and the turn collapses (TF-R4, TF-R5). Published: 7 G (4.7 G rolling), the top speed (VMO, Mach 0.67) and the hard deck (6,000 ft MSL). Crossing one shows a plain flag and the jet keeps flying (TF-R4, TF-R6). That the AI pilot flies above the deck and under the top speed by default is checked as its choice. No test expects a jet to be held at a limit.
- **F4. The judging is fair (TF-R9).** Equal jets with equal settings always read "Both" or "Even fight", over many mirrored setups (T9, fixed seeds). A jet thousands of feet above the other's nose isn't nose-on, and a stalled jet can't claim it.
- **F5. Same fight, any way you watch it (TF-R2, TF-R13).** The same setup at 0.5×, 1× and 4× gives the same result and trails. Flipping the fight type changes only which way Red turns. Mirroring the start mirrors the fight. A display change never restarts it.
- **F6. Events, not seconds.** Tests wait for the pass, a phase or the first nose-on, never for a T+ value. The 10-minute stop is the product's own rule (TF-R23) and is tested as a rule **(Q-T9, decided)**. Runs that fly until something happens have a safety stop **(Q-T13, decided)**.
- **F7. Design numbers are named as settings.** The gun zone (2,500 ft, 15°, 60°, 2 s), the 35 ft hitbox, the tumble rate, the five presets, and the working values for Dad (stall 86 kt, 94 % shaker, roll rate, mid throttle) are design choices or values Dad hasn't checked yet (TF-Q10). Tests read them from where the code keeps them, so a change moves one test.

**Checks set the rule up directly (TF-57 PR 3, Patrick 4 Oct 17:34Z: "it's chaos theory, it won't always be the same").** The same setup flies the same fight every time, but any honest change to the flying can send the default fight down another path. So a check of a rule sets that rule up itself: the MPT checks fly the MPT as a set move with the other jet's collision break off (`SOLO`), the head-on checks start nose to nose (`HEAD_ON`), and the race checks keep both jets on their first move. Checks that only pinned one story of the default fight were deleted with Patrick's word (D405's winner, the default fight never chasing). The deck and top-speed checks stay: they are pilot checks on every fight.

## How each Turn Fight requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole Turn Fight browser file run at sign-off.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| TF-R1 Open, press Play, see who gets the nose on first, and why | The smoke test: open fresh, press Play, a result appears with nothing opened or typed; the extras (AI move reasons, yo-yos, presets, gun-kill, collision, 3D gadgets) each work once | Each change | A student who hasn't seen it gets a result |
| TF-R2 1-circle against 2-circle | F5: flipping the type reverses only Red's turn; two separate circles become one shared circle | Each change | |
| TF-R3 Rate and radius follow speed and G | F1, and the drawn circle's size matches the readout; more G at the same speed always tightens it | Each change | |
| TF-R25 Full physics, no planned paths | Change one jet's speed or G: its whole path changes; no jet snaps onto a line (no jump between steps) | Each change | |
| TF-R4 Outside the T-6's limits is flagged | F3: a G the speed can't give shows a warning beside the box; in Energy, past the stall line STALL shows and the turn stops until the pilot eases off; above 7 G or top speed a flag shows | Each change | |
| TF-R5 Energy traded honestly | F2's energy invariants | Each change | |
| TF-R6 To the MPT, above the deck by default | From slow, medium and fast merge speeds each jet ends in a steady turn near the MPT (F2); by default it stays above the deck; a jet forced below it shows the flag and keeps flying (F3) | Each change | Dad checks the turn picture against SMM 14 |
| TF-R7 Moves look and behave like the real ones | F2's shapes for each forced move; the move and its reason shown in words; an Immelmann tried at 140 KIAS or below flies and shows when it runs out of energy | Each change | Dad looks at each move in the side view |
| TF-R8 Meet where they should; MERGE and PASS | No kink or jump through the pass at any two speeds; a close pass reads MERGE and a wide one PASS | Each change | |
| TF-R9 Fair "nose on first" | F4 | Each change | |
| TF-R10 No wind, said on screen | The screen's one line says the fight is in still air | Each change | |
| TF-R11 Boxes filled in; bad entries refused | Blank, zero and impossible entries are refused with the range named, and the last good value stays | Each change | |
| TF-R12 Start geometry and the line before Play | A beam start says no pass and turns at once; a tail chase reads nose-on from the start; the heading crossing angle matches ATA and AA worked out in the test | Each change | |
| TF-R13 Play, Pause, Reset at 0.5× to 4× | F5; a fight setting restarts the fight, a display setting doesn't | Each change | |
| TF-R14 Standard defaults and one-click reset | Opens at 1.2 NM, Red 5° off Blue's nose, 5 G; reset brings back those same numbers and the start geometry to neutral head-on; reload keeps what was set | Each change | |
| TF-R15 The top view | Both jets lettered B and R as well as coloured, trails, 1 NM grid, MERGE or PASS mark and the first-nose-on line; a long fight stays in view without panning | Each change | |
| TF-R16 The Result in pilot words | Turn rate and radius readable in Simple (Result) and in Energy (the stats panel) and matching F1; extra numbers sit behind More detail | Each change | |
| TF-R17 Height against time, with the deck line and the same numbers as text | The graph, the deck line and the "Altitude at T+..." text agree at the same moment | Each change (unit); sign-off (browser) | |
| TF-R18 2D/3D switch | Switching while playing keeps the time and result; the 3D code loads only when switched on; without WebGL a plain note shows and 2D works | Each change (unit); sign-off (browser) | One look at each camera |
| TF-R19 Labels never cover each other | Through the pass at 1280 wide with data tags on, no two labels overlap | Each change (layout) | |
| TF-R20 Opens on Energy, Simple one click away, essentials only | Fresh open: the Energy fight, a one-click switch to Simple, the fight type, distance, two numbers per jet and Play; settings and About closed | Each change | Nothing on screen you don't need first |
| TF-R21 Pilot words with units and hints | Every box has a label with its unit and a hint with range and default; the model line is shown | Each change | A T-6 pilot reads every label without help |
| TF-R22 No greyed-out-for-ever controls | The every-button check in each mode; Climb and dive, "Red starts above Blue" and "Side view height scale" are gone | Each change | |
| TF-R23 Stops cleanly; nothing runs after leaving | The 10-minute stop ends the run with a plain message (F6); after leaving no timer or listener is left | Each change | Play at 4× for a long time |
| TF-R24 Keyboard | Space plays or pauses and Home resets, never while typing; Tab reaches every control | Each change | |

**At Turn Fight sign-off:** the whole Turn Fight browser file, F4 and F5 over many seeds, the hands-on checklist above and `archive/docs/checklists/turn-fight.md` rewritten for the ratified requirements (it still says 2 NM, 4 G and Energy off), and one look in real Safari at the 3D view.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] A student who hasn't seen it gets a result (TF-R1)
- [ ] Dad checks the turn picture against SMM 14 (TF-R6)
- [ ] Dad looks at each move in the side view (TF-R7)
- [ ] One look at each camera (TF-R18)
- [ ] Nothing on screen you don't need first (TF-R20)
- [ ] A T-6 pilot reads every label without help (TF-R21)
- [ ] Play at 4× for a long time (TF-R23)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `archive/docs/checklists/turn-fight.md`

#### Sign-off checklist: the Turn Fight

Anyone can run this in about forty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-fight

Keep V6 (the old single-file tool) open in another tab for the side-by-side lines. The numbers below are what the Turn Fight shows on its opening settings. (Simple 2D mode opens by default; Energy mode is checked in Section 10 below).

### First look

- [ ] On the home screen, the **Turn Fight** card has the small BFM heading, a short line reading "1-circle, 2-circle and vertical fights" and a PROTOTYPE badge. Clicking it opens the Turn Fight. **Home** in the header brings you back.
- [ ] Nothing is set up or typed, and the fight is ready to play. Three columns show: **Fight setup** on the left, the fight picture in the middle with the toolbar above it, and **Result** on the right. The toolbar says **Play**, **Reset**, a **View** choice (2D, 3D), **Playback speed** (1×), the time **T+0.0** and the word HEAD-TO-HEAD. Nothing covers anything else.
- [ ] The opening settings are V6's: **2-circle**, **Start separation** 2 NM, both aircraft **Speed** 220 KTAS and **G** 4, **First nose chases** and **Climb and dive** both off. In the picture Blue (B) and Red (R) face each other, 2 NM apart.
- [ ] **Turn Fight settings** is closed. Open it once: under **Start geometry** a line reads "Pass at T+16.4 s", the same time V6's jets merge. A second line says "Blue turns left, Red turns left" (2-circle, which way each jet will turn). Close it again.

### Play, Pause and Reset

- [ ] **Play** starts the fight. The button now says **Pause**, the time counts up and the two jets fly toward each other. HEAD-TO-HEAD stays until the merge.
- [ ] At T+16.4 the jets pass at the centre, a yellow MERGE cross shows there, and the word changes to 2-CIRCLE. Both jets then turn the same way and the yellow trails follow them.
- [ ] Compare with V6 at the same moment (for example the merge, and T+30): the picture, the Turn rate (19.2°/s), the Turn radius (1,106 ft) and the Range match V6's, apart from the words (V6 says "sec" where this says "s").
- [ ] **Pause** stops the fight and nothing moves. **Play** carries on from the same spot.
- [ ] **Reset** puts the time back to T+0.0 and the jets back at the start. It works while playing and while paused. If you press it while playing, playing stops.
- [ ] **Playback speed**: 0.5×, 1×, 2× and 4× each change how fast the time runs (4× is four times as fast as 1×). Changing the speed never resets the fight.
- [ ] Let the fight run to the end (use 4×). At 10 minutes it stops and says "Fight stopped at 10 minutes. Reset to fly it again." **Play** is greyed out until you press **Reset**.

### 1-circle, 2-circle and the chase

- [ ] **Fight type** → **1-circle** starts the fight again at T+0.0. The line in Start geometry now says "Blue turns left, Red turns right". After the merge the two jets turn opposite ways (Blue left, Red right, as seen from above) and the word says 1-CIRCLE. **2-circle** puts them back turning the same way (head-on, this is V6's same and opposite directions).
- [ ] Play a 2-circle fight to about T+40. In the Result column **First nose-on** reads a time such as "Both at +18.2 s" (both jets are equal, so it's a tie) and a yellow dashed line shows in the picture. With 1-circle it reads "Both at +9.1 s".
- [ ] Set Blue's **G** to 5 and play a 2-circle fight past T+30. **First nose-on** now names Blue ("Blue at +12.6 s") and shows how long after the merge.
- [ ] Put Blue's **G** back to 4 first. Then tick **First nose chases**. After first nose-on each jet turns toward the other, so the fight closes up: on the opening settings the Range at T+40 is about 0.36 NM, against about 0.53 NM without it. The turn line in Start geometry then adds "(until first nose-on; then each chases the other)". Untick it: the fight starts again.
- [ ] Open **About this model** below the settings menu. It explains 1-circle, 2-circle and first nose in plain words. It says 2-circle is each jet turning toward the other, 1-circle is Red turning away from Blue so the two share one circle, and that in a 2-circle fight between equal jets, from a head-on start, a nose-on happens only if they come back exactly head-on (a sideways offset such as ATA 1°, AA 179° gives none). Try it: ATA 1° with AA 179° in a 2-circle fight gives **First nose-on** "--" for the whole fight, while in 1-circle it still comes (about +8.3 s).

### Climb and dive, and the side view

- [ ] Tick **Climb and dive**. A **Pitch (°)** box shows for each jet, and a side view appears under the top-down picture. Untick it: the side view and the pitch boxes go.
- [ ] With it on, give Blue a pitch of 10 and Red a pitch of -10. The fight starts again. The side view shows Blue rising and Red falling. **More detail** in the Result column now shows **Height change** and **Height between**.
- [ ] With Climb and dive on and a pitch set, first nose-on may never come. That is expected, and the About panel says so.
- [ ] In **Turn Fight settings**, **Display**, **Side view height scale** (1×, 2×, 4×) stretches the heights in the side view only. It doesn't restart the fight.

### Turn Fight settings

Open **Turn Fight settings** (it is closed at first).

- [ ] In Simple mode, the menu has two sections in this order, **Start geometry** then **Display**, and a **Reset to Standard Defaults** button (D384). (When Energy mode is toggled, Energy and Model settings sections appear).
- [ ] **Start geometry**: has Red's position off Blue's nose (ATA) and its side, Red's aspect angle (AA) and its side, a heading crossing angle (HCA) line, a small picture of the start, **Red starts above Blue (ft)**, **When the turns start**, and a **Neutral Head-on** button.
- [ ] **Display**: has **Side view height scale** and **Paint**. Paint is greyed out in 2D, and **Side view height scale** is greyed out in 3D or without Climb and dive.
- [ ] Try a bad number in a box: a letter, or **Start separation** 50. The box refuses it and says the range, for example "Enter a number from 0.5 to 10 NM." The fight doesn't change.
- [ ] Change **Start separation** to 4. The fight starts again, and Start geometry now says "Pass at" a later time (about T+32.7 s).

### Start geometry

Each change here starts the fight again at T+0.0.

- [ ] **Neutral Head-on**, the opening one: ATA 0°, AA 180°, HCA 180°, "Pass at T+16.4 s". The MERGE cross shows in the picture.
- [ ] **Crossing**: set AA to 90. HCA reads 90°, the note says "Pass at T+16.4 s", and the jets cross at right angles. The small picture shows the new start. The turn line says which way each jet will turn: set AA side to Right and it says "Blue turns right, Red turns right". Play to the pass: the jets go by about 1.4 NM apart, so the yellow mark is labelled PASS, not MERGE. Put AA side back to Left.
- [ ] **Beam**: set ATA to 90 and AA to 90. The note says "No pass: the turns start at once" and no MERGE or PASS mark is drawn, because the range isn't closing.
- [ ] **Tail chase**: set ATA to 0 and AA to 0 (Blue dead astern of Red). HCA reads 0°, and with equal speeds the note says "No pass: the turns start at once". Set Blue's **Speed** to 260: now the note says "Pass at T+180.0 s", the time Blue takes to catch up. At 4× speed play to the pass: **First nose-on** reads "Blue at +0.0 s", because Blue has had Red on its nose the whole way (it never reads Red at that moment).
- [ ] At ATA 0° or 180°, and AA 0° or 180°, the side buttons mean nothing: flipping one while the fight plays doesn't restart it. At any other angle, flipping a side restarts the fight.
- [ ] Put Blue's **Speed** back to 220 and press **Neutral Head-on**, then set **When the turns start** → **At once**. It starts the turns at T+0 even at the head-on start. Back to **At the pass** and they wait for the pass.
- [ ] With **Climb and dive** on, **Red starts above Blue (ft)** works (it is greyed out otherwise). Set 2,000: the fight starts again, the side view shows Red above Blue, and **Height between** in More detail reads 2,000 ft at T+0.
- [ ] Press **Neutral Head-on**: ATA, AA, height and the turns go back to head-on, level and at the pass. It doesn't touch your speeds, G or fight type.

### The 2D and 3D views

- [ ] **View** opens on 2D. Play the fight, then choose **3D** while it is playing. The picture changes to a 3D scene, the time doesn't jump and the fight goes on. A row of camera buttons shows: **Overhead**, **Chase Blue** and **Chase Red**. Choose **2D**: the top-down picture is back, still at the right time. Neither switch resets anything.
- [ ] In 3D each jet is a CT-156 Harvard in the Moose Jaw paint with the letter B or R above it. The yellow MERGE cross and label mark the merge, and the first nose-on line shows when it happens.
- [ ] **Overhead** looks straight down with north up, like the 2D picture. **Chase Blue** and **Chase Red** follow that jet from behind and above, and turn as it turns. The three views all look different.
- [ ] Drag with the mouse to turn the view. Scroll the wheel (or pinch on a touch screen) to zoom. Nothing about the fight changes. The grid squares are 1 NM.
- [ ] **Paint**: with 3D showing, open **Turn Fight settings** and change **Paint** to **Ship colours**. The jets go plain blue and red, and the letters stay. Back to **Harvard** paints them again.
- [ ] Pause the fight in 3D. The picture holds still. Drag or zoom it: it still responds.
- [ ] Reload the page. The View choice, 3D or 2D, is remembered, and the fight starts at T+0.0.

### When 3D can't run

- [ ] Offline (rare, skip if you can't see it): the app keeps three.js on your computer after the first visit, so this note normally can't be seen. It shows only when three.js can't be fetched and the app has never been opened on that computer before. If you can set that up (a fresh browser profile, network off), open the Turn Fight and choose **3D**: a note under the toolbar says "3D needs a connection the first time." and the View goes back to 2D, and 2D keeps working. Turn the network back on.
- [ ] With a browser or setting that has no WebGL (for example WebGL turned off in the browser's settings), choosing **3D** shows "3D needs WebGL, which this browser does not have." and stays on 2D. Skip this line if your browser has no such setting.
- [ ] If the graphics card is reset while 3D is showing (rare; you can't easily make it happen), a note says "3D stopped (the graphics card was reset); showing 2D." and the fight keeps playing in 2D without resetting. Skip if you can't reproduce it.

### Keyboard

- [ ] Tab moves through every control in a sensible order, with a clear outline around the one you're on. Every button and box can be reached and used without the mouse.
- [ ] With the focus on a blank part of the page (not in a box), **Space** plays or pauses and **Home** resets. Neither works while you are typing in a number box.
- [ ] In a number box, the up and down arrow keys change the number by a small step (5 kt for speed, 0.1 for G, 0.5 NM for separation).
- [ ] The **View** and **Fight type** choices change with the arrow keys once one of them has the focus. **Playback speed** and **Paint** open with Space (or Alt+Down) and change with the arrow keys.
- [ ] Click into the 3D picture (or Tab to it) and press the arrow keys to turn the view, and **+** and **−** to zoom.
- [ ] The **Fight setup** and **Result** headings are buttons: Enter or Space folds the column away and back, and the fight keeps playing meanwhile. Fold them, reload: they stay folded.

### Keeping your settings

- [ ] Change **Fight type**, **Blue**'s speed and G, tick **First nose chases**, pick 2× speed and choose 3D. Reload the page. Every one of them is as you left it, and the time is T+0.0.
- [ ] Open **Turn Fight settings**, change a Start geometry number, and reload. It is kept.
- [ ] Press **Reset to Standard Defaults** (D384). The fight, both aircraft, both checkboxes, pitch, height scale, playback speed, Paint and all of Start geometry go back to standard defaults, and the fight starts again at T+0.0. The **View** stays as you had it (2D or 3D), and the columns stay as open or folded as they were.

### The readouts

The **Result** column shows a Blue and a Red value where it can. **More detail** (closed at first) opens more.

- [ ] **Result** has **Turn rate**, **Turn radius**, **Range** and **First nose-on**, updating as the fight plays. On the opening fight: 19.2°/s, 1,106 ft, and the range closing from 2.00 NM to 0.00 at the merge.
- [ ] **More detail** shows **Speed**, **G**, **360° time**, **Off-nose angle (ATA)**, **Aspect angle (AA)**, **Angle-off (HCA)** and **Time since the pass** (and the height lines with Climb and dive on).
- [ ] **Angle-off (HCA)** is the angle between the two jets' headings, one number for both. On the opening 2-circle fight it reads 180° at the start and stays 180°, because both jets turn the same way at the same rate. In a 1-circle fight it falls after the merge: about 40° at T+20 and 16° at T+30. Compare with V6's angle-off at the same moments: they match (V6 calls it angle-off).
- [ ] **Aspect angle (AA)** is where the other jet sits off each jet's tail. On the opening fight it reads 180° for both jets before the pass (each points at the other), 0° at the merge, then about 35° at T+20 and 131° at T+30.
- [ ] **Off-nose angle (ATA)** reads 0° for both jets before the pass, 180° at the merge, then about 145° at T+20 and 49° at T+30.
- [ ] **G** shows Blue's and Red's set G (4.0 by default). Set Blue's G to 7 at 220 kt: a warning under the box says "7.0 G is above the T-6's stall limit at 220 kt (6.5 G)". The fight still flies 7 G. Set Blue's speed to 300 and G to 8: it says "Above the T-6's 7 G limit". Put both back to normal: the warning goes.
- [ ] **First nose-on** reads "--" until a jet gets its nose within 5° of the other, then "Blue at +12.6 s", "Red at ..." or "Both at ..." (a tie), counted from the merge. The yellow dashed line is drawn from that jet toward the other.
- [ ] Compare the whole Result column with V6 at three moments (same settings, same time): they match, apart from the words and the changes on purpose listed in the specification (First nose-on now says "Both" for a tie).

### Energy mode (T-6) (Checkpoint D)

Energy mode flies the jets with real thrust, drag and stall limits, instead of a fixed speed and G. It is off until you tick **Energy (T-6)**. The numbers below are what the model gives at its start settings (220 KIAS and 10,000 ft each, hard deck 6,000 ft, MPT speed 160 KIAS, Move Auto). They are the model's, so they can differ a little from a real T-6.

- [ ] **Energy (T-6)** is unticked when you first open the Turn Fight, and the fight is exactly the simple one you checked above (nothing in Energy mode changes it). Tick it: **Speed (KTAS)** and **G** in each Fight setup box, **Climb and dive** and **First nose chases** go grey, and keep the values you had. **Start altitude (ft)** and **Merge speed (KIAS)** appear for Blue and for Red, at 10,000 ft and 220 KIAS. Untick it: everything comes back as you left it.
- [ ] At T+0.0 with Energy on, the Result shows 220 KIAS and 10,000 ft for both, G 1.0, Flags **None**, and beside each jet in the fight setup: "Pitch back: 220 KIAS, SMM entry 160 to 220". There is no Turn rate or Turn radius row (those belong to the simple fight). With **Turn Fight settings** open, Start geometry says "Pass at T+14.1 s".
- [ ] Play at 4×. About 9 seconds after the pass, and 140° of turn later, each jet's words change to "MPT 160 KIAS" and the Result's **To the MPT** reads "9.1 s, 140°". At T+30 both read MPT, about 162 KIAS, about 10,605 ft and 3.3 G, and the phase reads 2-CIRCLE. **More detail** shows a bank of about 73° and a Ps of about -30 ft/s at T+30 (the MPT gives up a little speed and height each second; the bank settles near 72° later).
- [ ] Keep playing: **First nose-on** reads "Both at +17.1 s" and **Winner** reads "Even fight: nobody gets behind". (When one jet starts its chase from behind, the word is "Blue wins" or "Red wins" instead; before either, it reads "--", and "No winner" if the fight runs to its 10-minute stop.)
- [ ] **Turn Fight settings** now has four parts, in this order: **Start geometry**, **Energy**, **Display**, **Model settings for checking**. Untick Energy and the Energy and Model settings parts go away.
- [ ] **Energy** holds **Blue's move** and **Red's move** (Auto, Immelmann, Pitch back, Slice, Split S, MPT), **MPT speed (KIAS)** 160 (125 to 175 KIAS per D349), **Hard deck (ft MSL)** 6,000, **Pursuit** Pure and **Chase after a head-on pass** ticked (D403). Each box shows its range and default, and a number outside the range gives a message and marks the box, like the other boxes.
- [ ] Set Blue's move to **Split S** (Red stays Auto). Blue's words read "Split S: set by you at 220 KIAS (forced move)". At about T+20 Blue is near 9,880 ft, lower than Red at about 10,810 ft, and Blue's **Move** reads Split S. Set it back to **Auto**. In Auto mode, at 140 KIAS or below, aircraft must fly a Split S or slice turn, never an Immelmann (D381).
- [ ] **Altitude split 3D dogfight (D404, D405)**: set Blue's Start altitude to 11,000 ft and Merge speed to 240 KIAS; set Red's Start altitude to 9,000 ft and Merge speed to 200 KIAS. Play at 4×. Rather than orbiting passively in rate circles, azimuth tracking initiates 3D combat pursuit after the merge: Blue rolls and dives, Red climbs, and both aircraft actively engage in a 3D dogfight with separation closing under 0.15 NM. High-energy Blue wins, and if Red stalls in a zoom climb it loses tracking authority and cannot falsely win (D405).
- [ ] **STALL**: set Blue's move to **Immelmann**, tick **At once** (Start geometry), and set Blue's Merge speed to 120. From about T+8 s to T+21 s, Blue's Flags cell reads **STALL** in red and bold, a line under the table says "Blue STALL: ... KIAS is below the 86 KIAS stall speed", and Red still reads **None**. The words say STALL, and the colour is only extra. (A screen reader is told once, "Flags: Blue STALL", not every time the numbers in the line change.) **OVER G** works the same way when a jet is pulling above +7 G; Auto never does that by itself, so you will not see it in a normal Auto fight (the model keeps Auto within limits). Only these two flags exist. (Immelmann pulls 5.0 G to shaker line, D402). Stalled aircraft freeze bank and lose control authority (D405).
- [ ] **Model settings for checking** is at the bottom of the menu with its own **Reset to defaults** button. It lists 15 boxes (Stall speed, Shaker, How long a stall lasts, Mid-range throttle, Lead point, Lag point, Roll rate, Pitch back bank at 160 and at 220, Auto: Immelmann or pitch back above, Auto: split S below, Immelmann off-nose angle, Lowest Immelmann top speed, Look-ahead, Deck margin). Change one (Stall speed to 83): the fight starts again. Press its **Reset to defaults**: it goes back to 86. The other settings above it do not change.
- [ ] Set Blue's Start altitude to 20,000 and Merge speed to 200: a note appears beside the box saying that above 15,000 ft the model's turn rate reads low, up to 28 % low at 20,000 ft and above near 200 KIAS, and that the SMM recommends aerobatics below 16,000 ft MSL (SMM 14.5 para 10). Put it back to 10,000.
- [ ] Set the Hard deck to 12,000 (above the 10,000 ft start): a message beside the boxes says "Blue's start altitude (10,000 ft) must be from the hard deck (12,000 ft) to 25,000 ft", and the message names what the fight flies instead: the default start altitudes (10,000 ft), merge speeds (220 KIAS), hard deck (6,000 ft) and separation (2 NM). The picture and "Pass at" in Start geometry follow those, too. Put it back to 6,000. Then set both start altitudes to 25,000 and Blue's Merge speed to 300: it says "Blue's merge speed (300 KIAS) is above the T-6A's limit at 25,000 ft" and gives the top speed there (in KIAS, with VMO or the Mach limit as the reason), with the same default start flown. At that top speed it flies from 25,000 ft. Put both back to 10,000 ft and 220.
- [ ] **About this model** explains the MPT bank: the SMM gives about 75° for the level MPT and 70 to 75° for the constant-speed MPT, and the model holds about 69° at the deck and about 72° in the constant-speed MPT. No text from the manual is copied, only numbers and page references.
- [ ] **Side view** (2D only): under the picture is a graph of altitude against time for Blue, Red and a dashed hard deck line. It has a line of numbers ("Altitude at T+30.0: Blue 10,605 ft, Red 10,605 ft. Hard deck 6,000 ft.") and a table (**Altitude table**, opened with its button) for anyone who cannot see the graph. With Blue's Merge speed at 180 the two lines part.
- [ ] Switch to **3D**: a see-through yellow plane shows at the hard deck's height, labelled **HARD DECK**, and the jets bank as the model banks them. Dotted vertical plumb lines drop from each aircraft to the hard deck (or terrain in Simple mode), and circular ground-shadow contact discs track underneath each aircraft (D401). Untick Energy: the hard deck plane goes. The graph is not shown in 3D.
- [ ] Reload: Energy stays on, and the moves, hard deck, pursuit, chase, both start altitudes and merge speeds and every Model settings box are as you left them. The fight starts at T+0.0.
- [ ] Press **Reset to Standard Defaults** (D384): Energy goes off, and every Energy setting (moves, MPT speed, hard deck, altitudes, merge speeds, all the Model settings) goes back to its default, which you see the next time you tick Energy. Reload: Energy is still off.
- [ ] Speed (skip if you have no slow computer): with Energy on at 4× on an old laptop, the page should stay responsive. If the model takes too long to pick a move during one frame, the screen stops that frame there and moves on (it never queues the work), so the fight may run a little slower than the clock for a moment.
- [ ] Uses nothing extra until you need it: with Energy off in 2D, the graph library (uPlot) and three.js are never fetched (in the browser's Network tab you see no uPlot file). Tick Energy in 2D: the uPlot file loads once. Choose 3D: three.js loads then.

### Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 noted (time, number, V6 value, new value): ________

All lines ticked means the Turn Fight is done (R21).


## Test files and what happens to each

From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/turn-fight/t6-limit.test.js` | Keep | TF-R4 (the warning beside a G box). The title's "V6's default" (`:26`) is a label only | | Each change |
| `tests/unit/turn-fight/playback.test.js` | Keep | TF-R13, F5. The frame cap "as V6 does" (`:28`) is a design choice, relabelled | | Each change |
| `tests/unit/turn-fight/energy-layout.test.js` | Rewrite (two tests) | The note strings stay (TF-R21). Two tests fly to 120 s and 60 s and pin the engine's bank of 68.5° there (`:59-70`), a time-and-model pin (T2, T3) | The MPT is reached and held (F2), found by event; the model's bank against the SMM's 75° is recorded as a known difference (T7) | Each change |
| `tests/unit/turn-fight/energy-playback.test.js` | Keep | TF-R13, F5: playback flies exactly the engine's own steps, so it can't change the outcome; the clock is injected | | Each change |
| `tests/unit/turn-fight/energy-readouts.test.js` | Keep, with changes | TF-R16 wording kept; kill and collision strings built from hand-made state. "First nose-on before T+40" (`:167-173`) goes (T2) | | Each change |
| `tests/unit/turn-fight/energy-sim.test.js` | Rewrite (about a third of 202) | The invariants stay (energy height, stall, thrust and drag). Rewritten: about 34 time gates, such as "reach the MPT within 120 s" at 16 merge speeds (`:466`) and "first nose-on 17.1 ± 1 s, V6 gives +18.2 s" (`:884`); the computer-time test (`:403`, T2); model numbers pinned to themselves (pitch back 7.7 ± 0.5 at `:344`, MPT bank 68.5 ± 2 at `:643`, 978.7 ± 10 at `:962`, T3); the 56 ten-minute "never below the deck, never above VMO" runs (`:989-1008`), which treat published limits as walls (F3, T10); turn-to-MPT limits of 210°, 235° and 265° (`:1125`, `:1148`, `:1729`) set looser than the cited aim "under 180°" (`:1130`), the pattern lesson F1 warns about | F2's shapes and invariants with margins and reasons; the AI flies above the deck and under VMO by choice, and a forced jet past either shows the flag and keeps flying (F3); the turn to the MPT is shown against SMM 14.17 para 42 and the gap goes to Patrick and Dad (T7) | Each change (a few merge speeds); sign-off (all 16) |
| `tests/unit/turn-fight/energy-state.test.js` | Keep, with changes | TF-R14 (defaults match 1.2 NM, Energy on), TF-R11. Flying both ends of every box for 40 s takes 63 s (`:77`); cut down (T9). The box count of 16 (`:56`) follows TF-Q9 (where the model settings live) | | Each change |
| `tests/unit/turn-fight/energy-tactical.test.js` | Keep, with changes | TF-R1 keeps the gun-kill, collision and tumble. Changes: the gun zone, hitbox and tumble numbers get their source named (F7); one test only checks that a result is true or false (`:256`, T8); "kill at 3.5 s" (`:313`) checks the zone's build-up rule instead of a second (T2); the comment's ±0.5 s and ±20 ft don't match the asserts (`:506-508`, T4) | | Each change |
| `tests/unit/turn-fight/energy-view3d.test.js` | Keep, with changes | TF-R18; bank = acos(1/G) worked out in the test (`:40-41`). The fixed moments T+18 and "tie by T+32" (`:31`, `:80`) are found by event instead (F6) | | Each change |
| `tests/unit/turn-fight/energy-graph.test.js` | Keep | TF-R17; the graph library loads only when needed (ALL-R9) | | Each change |
| `tests/unit/turn-fight/energy-below-mmo.test.js` | Rewrite | TF-R4, F3: the top speed is a published limit. The test pins the engine's own limit to 0.1 KIAS (`:76-78`), requires it to sit 7 to 11 KIAS under the NFM line (`:81`), and runs 10-minute fights that must never go above it. The chart helper `tests/unit/turn-fight/nfm-limit.js` (NFM Figure 4-1-2, page reference) is kept | The AI's chosen speed stays under the NFM line, read from the chart helper; a jet forced past it shows the flag and keeps flying; the engine's own margin under the line is not checked | Each change |
| `tests/unit/turn-fight/geometry.test.js` | Keep, with changes | TF-R12, F1: the pass time is checked against a brute-force closest approach (`:63`) and the formula (`:37`). Changes: "V6's directions" (`:157`, `:238`) relabelled; its own head-on START_DEFAULTS (`:179`) is the neutral head-on of TF-R14's reset, so it is named that way | | Each change |
| `tests/unit/turn-fight/profile.test.js` | Retire with the feature | TF-R22: the Simple side view for Climb and dive and its height scale are removed (TF-Q8). Height in the Energy fight is checked by `tests/unit/turn-fight/energy-graph.test.js` | | Each change, until removed |
| `tests/unit/turn-fight/readouts.test.js` | Keep, with changes | TF-R16, F1: 5 G at 220 KTAS is 24.3°/s and 875 ft (`:27`); the working goes into the test. "Rounding is V6's" (`:72`) relabelled; the stale 19.2°/s comment (`:148`) and the archived golden file (`:14`) go (Q-T8, decided) | | Each change |
| `tests/unit/turn-fight/sim.test.js` | Keep, with changes | TF-R3, F1. Most of its time checks are readouts with a formula (merge = distance ÷ closing speed, 360° = 360 ÷ rate) and stay; the 600 s stop (`:391-416`) is TF-R23's rule. Changes: "V6 `M`" (`:36`) and V6's start offset (`:147`) are relabelled to the formula and Patrick's Q49; tests that read the fight at a chosen second are found by event (F6); the archived golden file (`:14`) goes | | Each change |
| `tests/unit/turn-fight/state.test.js` | Keep | TF-R14 (1.2 NM, 220 KTAS, 5 G, Energy on, ATA 5°), TF-R1 (the five presets kept) | | Each change |
| `tests/unit/turn-fight/view.test.js` | Keep, with changes | TF-R15. The colours, the reach and the 42 % scale labelled "V6" (`:28`, `:41`, `:54`) are re-sourced to the spec (T3) | | Each change |
| `tests/unit/turn-fight/view3d.test.js` | Keep | TF-R18, TF-R1 (plumb lines and contact discs kept); bank = acos(1/G) worked out in the test | | Each change |
| `tests/e2e/turn-fight.spec.js` | Keep, with changes | 25 pass and 43 fail at `6283f38` (what each failure shows is below). Written for the older screen. Changes: Energy first (TF-R20); the standard defaults (TF-R14); the phase "TO THE PASS"; the Climb and dive tests retire (TF-R22); "Expected numbers are the engine's own" (`:1220`) becomes F2's shapes; the T+ gates (`:177`, `:179`, `:911`, `:1332`, `:1452`, `:1496`) become events (F6) | New beside it: turn rate and radius in Energy's stats panel (TF-R16); a jet forced below the deck shows the flag and keeps flying (TF-R6) | Smoke, layout, buttons, leaving and offline parts each change; the whole file at sign-off |
