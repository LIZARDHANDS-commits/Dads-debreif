# Sign-off checklist: the Turn Fight

Anyone can run this in about forty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-fight

Keep V6 (the old single-file tool) open in another tab for the side-by-side lines. The numbers below are what the Turn Fight shows on its opening settings. Energy mode isn't on the screen yet, so it isn't checked here.

## First look

- [ ] On the home screen, the **Turn Fight** card has the small BFM heading, a short line reading "1-circle, 2-circle and vertical fights" and a PROTOTYPE badge. Clicking it opens the Turn Fight. **Home** in the header brings you back.
- [ ] Nothing is set up or typed, and the fight is ready to play. Three columns show: **Fight setup** on the left, the fight picture in the middle with the toolbar above it, and **Result** on the right. The toolbar says **Play**, **Reset**, a **View** choice (2D, 3D), **Playback speed** (1×), the time **T+0.0** and the word HEAD-TO-HEAD. Nothing covers anything else.
- [ ] The opening settings are V6's: **2-circle**, **Start separation** 2 NM, both aircraft **Speed** 220 KTAS and **G** 4, **First nose chases** and **Climb and dive** both off. In the picture Blue (B) and Red (R) face each other, 2 NM apart.
- [ ] **Turn Fight settings** is closed. Open it once: under **Start geometry** a line reads "Pass at T+16.4 s", the same time V6's jets merge. A second line says "Blue turns left, Red turns left" (2-circle, which way each jet will turn). Close it again.

## Play, Pause and Reset

- [ ] **Play** starts the fight. The button now says **Pause**, the time counts up and the two jets fly toward each other. HEAD-TO-HEAD stays until the merge.
- [ ] At T+16.4 the jets pass at the centre, a yellow MERGE cross shows there, and the word changes to 2-CIRCLE. Both jets then turn the same way and the yellow trails follow them.
- [ ] Compare with V6 at the same moment (for example the merge, and T+30): the picture, the Turn rate (19.2°/s), the Turn radius (1,106 ft) and the Range match V6's, apart from the words (V6 says "sec" where this says "s").
- [ ] **Pause** stops the fight and nothing moves. **Play** carries on from the same spot.
- [ ] **Reset** puts the time back to T+0.0 and the jets back at the start. It works while playing and while paused. If you press it while playing, playing stops.
- [ ] **Playback speed**: 0.5×, 1×, 2× and 4× each change how fast the time runs (4× is four times as fast as 1×). Changing the speed never resets the fight.
- [ ] Let the fight run to the end (use 4×). At 10 minutes it stops and says "Fight stopped at 10 minutes. Reset to fly it again." **Play** is greyed out until you press **Reset**.

## 1-circle, 2-circle and the chase

- [ ] **Fight type** → **1-circle** starts the fight again at T+0.0. The line in Start geometry now says "Blue turns left, Red turns right". After the merge the two jets turn opposite ways (Blue left, Red right, as seen from above) and the word says 1-CIRCLE. **2-circle** puts them back turning the same way (head-on, this is V6's same and opposite directions).
- [ ] Play a 2-circle fight to about T+40. In the Result column **First nose-on** reads a time such as "Both at +18.2 s" (both jets are equal, so it's a tie) and a yellow dashed line shows in the picture. With 1-circle it reads "Both at +9.1 s".
- [ ] Set Blue's **G** to 5 and play a 2-circle fight past T+30. **First nose-on** now names Blue ("Blue at +12.6 s") and shows how long after the merge.
- [ ] Put Blue's **G** back to 4 first. Then tick **First nose chases**. After first nose-on each jet turns toward the other, so the fight closes up: on the opening settings the Range at T+40 is about 0.36 NM, against about 0.53 NM without it. The turn line in Start geometry then adds "(until first nose-on; then each chases the other)". Untick it: the fight starts again.
- [ ] Open **About this model** below the settings menu. It explains 1-circle, 2-circle and first nose in plain words. It says 2-circle is each jet turning toward the other, 1-circle is Red turning away from Blue so the two share one circle, and that in a 2-circle fight between equal jets, from a head-on start, a nose-on happens only if they come back exactly head-on (a sideways offset such as ATA 1°, AA 179° gives none). Try it: ATA 1° with AA 179° in a 2-circle fight gives **First nose-on** "--" for the whole fight, while in 1-circle it still comes (about +8.3 s).

## Climb and dive, and the side view

- [ ] Tick **Climb and dive**. A **Pitch (°)** box shows for each jet, and a side view appears under the top-down picture. Untick it: the side view and the pitch boxes go.
- [ ] With it on, give Blue a pitch of 10 and Red a pitch of -10. The fight starts again. The side view shows Blue rising and Red falling. **More detail** in the Result column now shows **Height change** and **Height between**.
- [ ] With Climb and dive on and a pitch set, first nose-on may never come. That is expected, and the About panel says so.
- [ ] In **Turn Fight settings**, **Display**, **Side view height scale** (1×, 2×, 4×) stretches the heights in the side view only. It doesn't restart the fight.

## Turn Fight settings

Open **Turn Fight settings** (it is closed at first).

- [ ] The menu has two sections in this order, **Start geometry** then **Display**, and a **Reset to Standard Defaults** button (D384). There is nothing about Energy yet.
- [ ] **Start geometry**: has Red's position off Blue's nose (ATA) and its side, Red's aspect angle (AA) and its side, a heading crossing angle (HCA) line, a small picture of the start, **Red starts above Blue (ft)**, **When the turns start**, and a **Neutral Head-on** button.
- [ ] **Display**: has **Side view height scale** and **Paint**. Paint is greyed out in 2D, and **Side view height scale** is greyed out in 3D or without Climb and dive.
- [ ] Try a bad number in a box: a letter, or **Start separation** 50. The box refuses it and says the range, for example "Enter a number from 0.5 to 10 NM." The fight doesn't change.
- [ ] Change **Start separation** to 4. The fight starts again, and Start geometry now says "Pass at" a later time (about T+32.7 s).

## Start geometry

Each change here starts the fight again at T+0.0.

- [ ] **Neutral Head-on**, the opening one: ATA 0°, AA 180°, HCA 180°, "Pass at T+16.4 s". The MERGE cross shows in the picture.
- [ ] **Crossing**: set AA to 90. HCA reads 90°, the note says "Pass at T+16.4 s", and the jets cross at right angles. The small picture shows the new start. The turn line says which way each jet will turn: set AA side to Right and it says "Blue turns right, Red turns right". Play to the pass: the jets go by about 1.4 NM apart, so the yellow mark is labelled PASS, not MERGE. Put AA side back to Left.
- [ ] **Beam**: set ATA to 90 and AA to 90. The note says "No pass: the turns start at once" and no MERGE or PASS mark is drawn, because the range isn't closing.
- [ ] **Tail chase**: set ATA to 0 and AA to 0 (Blue dead astern of Red). HCA reads 0°, and with equal speeds the note says "No pass: the turns start at once". Set Blue's **Speed** to 260: now the note says "Pass at T+180.0 s", the time Blue takes to catch up. At 4× speed play to the pass: **First nose-on** reads "Blue at +0.0 s", because Blue has had Red on its nose the whole way (it never reads Red at that moment).
- [ ] At ATA 0° or 180°, and AA 0° or 180°, the side buttons mean nothing: flipping one while the fight plays doesn't restart it. At any other angle, flipping a side restarts the fight.
- [ ] Put Blue's **Speed** back to 220 and press **Neutral Head-on**, then set **When the turns start** → **At once**. It starts the turns at T+0 even at the head-on start. Back to **At the pass** and they wait for the pass.
- [ ] With **Climb and dive** on, **Red starts above Blue (ft)** works (it is greyed out otherwise). Set 2,000: the fight starts again, the side view shows Red above Blue, and **Height between** in More detail reads 2,000 ft at T+0.
- [ ] Press **Neutral Head-on**: ATA, AA, height and the turns go back to head-on, level and at the pass. It doesn't touch your speeds, G or fight type.

## The 2D and 3D views

- [ ] **View** opens on 2D. Play the fight, then choose **3D** while it is playing. The picture changes to a 3D scene, the time doesn't jump and the fight goes on. A row of camera buttons shows: **Overhead**, **Chase Blue** and **Chase Red**. Choose **2D**: the top-down picture is back, still at the right time. Neither switch resets anything.
- [ ] In 3D each jet is a CT-156 Harvard in the Moose Jaw paint with the letter B or R above it. The yellow MERGE cross and label mark the merge, and the first nose-on line shows when it happens.
- [ ] **Overhead** looks straight down with north up, like the 2D picture. **Chase Blue** and **Chase Red** follow that jet from behind and above, and turn as it turns. The three views all look different.
- [ ] Drag with the mouse to turn the view. Scroll the wheel (or pinch on a touch screen) to zoom. Nothing about the fight changes. The grid squares are 1 NM.
- [ ] **Paint**: with 3D showing, open **Turn Fight settings** and change **Paint** to **Ship colours**. The jets go plain blue and red, and the letters stay. Back to **Harvard** paints them again.
- [ ] Pause the fight in 3D. The picture holds still. Drag or zoom it: it still responds.
- [ ] Reload the page. The View choice, 3D or 2D, is remembered, and the fight starts at T+0.0.

## When 3D can't run

- [ ] Offline (rare, skip if you can't see it): the app keeps three.js on your computer after the first visit, so this note normally can't be seen. It shows only when three.js can't be fetched and the app has never been opened on that computer before. If you can set that up (a fresh browser profile, network off), open the Turn Fight and choose **3D**: a note under the toolbar says "3D needs a connection the first time." and the View goes back to 2D, and 2D keeps working. Turn the network back on.
- [ ] With a browser or setting that has no WebGL (for example WebGL turned off in the browser's settings), choosing **3D** shows "3D needs WebGL, which this browser does not have." and stays on 2D. Skip this line if your browser has no such setting.
- [ ] If the graphics card is reset while 3D is showing (rare; you can't easily make it happen), a note says "3D stopped (the graphics card was reset); showing 2D." and the fight keeps playing in 2D without resetting. Skip if you can't reproduce it.

## Keyboard

- [ ] Tab moves through every control in a sensible order, with a clear outline around the one you're on. Every button and box can be reached and used without the mouse.
- [ ] With the focus on a blank part of the page (not in a box), **Space** plays or pauses and **Home** resets. Neither works while you are typing in a number box.
- [ ] In a number box, the up and down arrow keys change the number by a small step (5 kt for speed, 0.1 for G, 0.5 NM for separation).
- [ ] The **View** and **Fight type** choices change with the arrow keys once one of them has the focus. **Playback speed** and **Paint** open with Space (or Alt+Down) and change with the arrow keys.
- [ ] Click into the 3D picture (or Tab to it) and press the arrow keys to turn the view, and **+** and **−** to zoom.
- [ ] The **Fight setup** and **Result** headings are buttons: Enter or Space folds the column away and back, and the fight keeps playing meanwhile. Fold them, reload: they stay folded.

## Keeping your settings

- [ ] Change **Fight type**, **Blue**'s speed and G, tick **First nose chases**, pick 2× speed and choose 3D. Reload the page. Every one of them is as you left it, and the time is T+0.0.
- [ ] Open **Turn Fight settings**, change a Start geometry number, and reload. It is kept.
- [ ] Press **Reset to Standard Defaults** (D384). The fight, both aircraft, both checkboxes, pitch, height scale, playback speed, Paint and all of Start geometry go back to standard defaults, and the fight starts again at T+0.0. The **View** stays as you had it (2D or 3D), and the columns stay as open or folded as they were.

## The readouts

The **Result** column shows a Blue and a Red value where it can. **More detail** (closed at first) opens more.

- [ ] **Result** has **Turn rate**, **Turn radius**, **Range** and **First nose-on**, updating as the fight plays. On the opening fight: 19.2°/s, 1,106 ft, and the range closing from 2.00 NM to 0.00 at the merge.
- [ ] **More detail** shows **Speed**, **G**, **360° time**, **Off-nose angle (ATA)**, **Aspect angle (AA)**, **Angle-off (HCA)** and **Time since the pass** (and the height lines with Climb and dive on).
- [ ] **Angle-off (HCA)** is the angle between the two jets' headings, one number for both. On the opening 2-circle fight it reads 180° at the start and stays 180°, because both jets turn the same way at the same rate. In a 1-circle fight it falls after the merge: about 40° at T+20 and 16° at T+30. Compare with V6's angle-off at the same moments: they match (V6 calls it angle-off).
- [ ] **Aspect angle (AA)** is where the other jet sits off each jet's tail. On the opening fight it reads 180° for both jets before the pass (each points at the other), 0° at the merge, then about 35° at T+20 and 131° at T+30.
- [ ] **Off-nose angle (ATA)** reads 0° for both jets before the pass, 180° at the merge, then about 145° at T+20 and 49° at T+30.
- [ ] **G** shows Blue's and Red's set G (4.0 by default). Set Blue's G to 7 at 220 kt: a warning under the box says "7.0 G is above the T-6's stall limit at 220 kt (6.5 G)". The fight still flies 7 G. Set Blue's speed to 300 and G to 8: it says "Above the T-6's 7 G limit". Put both back to normal: the warning goes.
- [ ] **First nose-on** reads "--" until a jet gets its nose within 5° of the other, then "Blue at +12.6 s", "Red at ..." or "Both at ..." (a tie), counted from the merge. The yellow dashed line is drawn from that jet toward the other.
- [ ] Compare the whole Result column with V6 at three moments (same settings, same time): they match, apart from the words and the changes on purpose listed in the specification (First nose-on now says "Both" for a tie).

## Energy mode (T-6) (Checkpoint D)

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

## Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 noted (time, number, V6 value, new value): ________

All lines ticked means the Turn Fight is done (R21).
