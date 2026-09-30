# Sign-off checklist: the Turn Fight

Anyone can run this in about forty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-fight

Keep V6 (the old single-file tool) open in another tab for the side-by-side lines. The numbers below are what the Turn Fight shows on its opening settings. Energy mode isn't on the screen yet, so it isn't checked here.

## First look

- [ ] On the home screen, the **Turn Fight** card has the small BFM heading, a short line reading "1-circle, 2-circle and vertical fights" and a PROTOTYPE badge. Clicking it opens the Turn Fight. **Home** in the header brings you back.
- [ ] Nothing is set up or typed, and the fight is ready to play. Three columns show: **Fight setup** on the left, the fight picture in the middle with the toolbar above it, and **Result** on the right. The toolbar says **Play**, **Reset**, a **View** choice (2D, 3D), **Playback speed** (1×), the time **T+0.0** and the word HEAD-TO-HEAD. Nothing covers anything else.
- [ ] The opening settings are V6's: **2-circle**, **Start separation** 2 NM, both aircraft **Speed** 220 KTAS and **G** 4, **First nose chases** and **Climb and dive** both off. In the picture Blue (B) and Red (R) face each other, 2 NM apart.
- [ ] **Turn Fight settings** is closed. Open it once: under **Start geometry** a line reads "Pass at T+16.4 s", the same time V6's jets merge. Close it again.

## Play, Pause and Reset

- [ ] **Play** starts the fight. The button now says **Pause**, the time counts up and the two jets fly toward each other. HEAD-TO-HEAD stays until the merge.
- [ ] At T+16.4 the jets pass at the centre, a yellow MERGE cross shows there, and the word changes to 2-CIRCLE. Both jets then turn the same way and the yellow trails follow them.
- [ ] Compare with V6 at the same moment (for example the merge, and T+30): the picture, the Turn rate (19.2°/s), the Turn radius (1,106 ft) and the Range match V6's, apart from the words (V6 says "sec" where this says "s").
- [ ] **Pause** stops the fight and nothing moves. **Play** carries on from the same spot.
- [ ] **Reset** puts the time back to T+0.0 and the jets back at the start. It works while playing and while paused. If you press it while playing, playing stops.
- [ ] **Playback speed**: 0.5×, 1×, 2× and 4× each change how fast the time runs (4× is four times as fast as 1×). Changing the speed never resets the fight.
- [ ] Let the fight run to the end (use 4×). At 10 minutes it stops and says "Fight stopped at 10 minutes. Reset to fly it again." **Play** is greyed out until you press **Reset**.

## 1-circle, 2-circle and the chase

- [ ] **Fight type** → **1-circle** starts the fight again at T+0.0. After the merge the two jets turn opposite ways (Blue left, Red right, as seen from above) and the word says 1-CIRCLE. **2-circle** puts them back turning the same way.
- [ ] Play a 2-circle fight to about T+40. In the Result column **First nose-on** reads a time such as "Both at +18.2 s" (both jets are equal, so it's a tie) and a yellow dashed line shows in the picture. With 1-circle it reads "Both at +9.1 s".
- [ ] Set Blue's **G** to 5 and play a 2-circle fight past T+30. **First nose-on** now names Blue ("Blue at +12.6 s") and shows how long after the merge.
- [ ] Tick **First nose chases**. After first nose-on each jet turns toward the other, so the fight closes up: on the opening settings the Range at T+40 is about 0.36 NM, against about 0.53 NM without it. Untick it: the fight starts again.
- [ ] Open **About this model** below the settings menu. It explains 1-circle, 2-circle and first nose in plain words.

## Climb and dive, and the side view

- [ ] Tick **Climb and dive**. A **Pitch (°)** box shows for each jet, and a side view appears under the top-down picture. Untick it: the side view and the pitch boxes go.
- [ ] With it on, give Blue a pitch of 10 and Red a pitch of -10. The fight starts again. The side view shows Blue rising and Red falling. **More detail** in the Result column now shows **Height change** and **Height between**.
- [ ] With Climb and dive on and a pitch set, first nose-on may never come. That is expected, and the About panel says so.
- [ ] In **Turn Fight settings**, **Display**, **Side view height scale** (1×, 2×, 4×) stretches the heights in the side view only. It doesn't restart the fight.

## Turn Fight settings

Open **Turn Fight settings** (it is closed at first).

- [ ] The menu has two sections in this order, **Start geometry** then **Display**, and a **Reset to V6 defaults** button. There is nothing about Energy yet.
- [ ] **Start geometry**: has Red's position off Blue's nose (ATA) and its side, Red's aspect angle (AA) and its side, a heading crossing angle (HCA) line, a small picture of the start, **Red starts above Blue (ft)**, **When the turns start**, and a **Head-on (V6)** button.
- [ ] **Display**: has **Side view height scale** and **Paint**. Paint is greyed out in 2D, and **Side view height scale** is greyed out in 3D or without Climb and dive.
- [ ] Try a bad number in a box: a letter, or **Start separation** 50. The box refuses it and says the range, for example "Enter a number from 0.5 to 10 NM." The fight doesn't change.
- [ ] Change **Start separation** to 4. The fight starts again, and Start geometry now says "Pass at" a later time (about T+32.7 s).

## Start geometry

Each change here starts the fight again at T+0.0.

- [ ] **Head-on (V6)**, the opening one: ATA 0°, AA 180°, HCA 180°, "Pass at T+16.4 s". The MERGE cross shows in the picture.
- [ ] **Crossing**: set AA to 90. HCA reads 90°, the note says "Pass at T+16.4 s", and the jets pass at the centre while flying at right angles. The small picture shows the new start.
- [ ] **Beam**: set ATA to 90 and AA to 90. The note says "No pass: the turns start at once" and no MERGE cross is drawn, because the range isn't closing.
- [ ] **Tail chase**: set AA to 0 (Blue dead astern of Red). HCA reads 0°, and with equal speeds the note says "No pass: the turns start at once". Set Blue's **Speed** to 260: now the note says "Pass at T+180.0 s", the time Blue takes to catch up.
- [ ] **When the turns start** → **At once** starts the turns at T+0 even at the head-on start. Back to **At the pass** and they wait for the pass.
- [ ] With **Climb and dive** on, **Red starts above Blue (ft)** works (it is greyed out otherwise). Set 2,000: the fight starts again, the side view shows Red above Blue, and **Height between** in More detail reads 2,000 ft at T+0.
- [ ] Press **Head-on (V6)**: ATA, AA, height and the turns go back to head-on, level and at the pass. It doesn't touch your speeds, G or fight type.

## The 2D and 3D views

- [ ] **View** opens on 2D. Play the fight, then choose **3D** while it is playing. The picture changes to a 3D scene, the time doesn't jump and the fight goes on. A row of camera buttons shows: **Overhead**, **Chase Blue** and **Chase Red**. Choose **2D**: the top-down picture is back, still at the right time. Neither switch resets anything.
- [ ] In 3D each jet is a CT-156 Harvard in the Moose Jaw paint with the letter B or R above it. The yellow MERGE cross and label mark the merge, and the first nose-on line shows when it happens.
- [ ] **Overhead** looks straight down with north up, like the 2D picture. **Chase Blue** and **Chase Red** follow that jet from behind and above, and turn as it turns. The three views all look different.
- [ ] Drag with the mouse to turn the view. Scroll the wheel (or pinch on a touch screen) to zoom. Nothing about the fight changes. The grid squares are 1 NM.
- [ ] **Paint**: with 3D showing, open **Turn Fight settings** and change **Paint** to **Ship colours**. The jets go plain blue and red, and the letters stay. Back to **Harvard** paints them again.
- [ ] Pause the fight in 3D. The picture holds still. Drag or zoom it: it still responds.
- [ ] Reload the page. The View choice, 3D or 2D, is remembered, and the fight starts at T+0.0.

## When 3D can't run

- [ ] Offline: turn the network off (Wi-Fi off, or airplane mode) in a browser that hasn't opened 3D yet, reload, open the Turn Fight and choose **3D**. A note under the toolbar says "3D needs a connection the first time." and the View goes back to 2D. 2D keeps working. (If you have already opened 3D once on this device, it may work offline; that is fine.) Turn the network back on.
- [ ] With a browser or setting that has no WebGL (for example WebGL turned off in the browser's settings), choosing **3D** shows "3D needs WebGL, which this browser does not have." and stays on 2D. Skip this line if your browser has no such setting.
- [ ] If the graphics card is reset while 3D is showing (rare; you can't easily make it happen), a note says "3D stopped (the graphics card was reset); showing 2D." and the fight keeps playing in 2D without resetting. Skip if you can't reproduce it.

## Keyboard

- [ ] Tab moves through every control in a sensible order, with a clear outline around the one you're on. Every button and box can be reached and used without the mouse.
- [ ] With the focus on a blank part of the page (not in a box), **Space** plays or pauses and **Home** resets. Neither works while you are typing in a number box.
- [ ] In a number box, the up and down arrow keys change the number by a small step (5 kt for speed, 0.1 for G, 0.5 NM for separation).
- [ ] The **View** and **Fight type** choices change with the arrow keys once one of them has the focus. **Playback speed** and **Paint** open with Space or Enter and change with the arrow keys.
- [ ] Click into the 3D picture (or Tab to it) and press the arrow keys to turn the view, and **+** and **−** to zoom.
- [ ] The **Fight setup** and **Result** headings are buttons: Enter or Space folds the column away and back, and the fight keeps playing meanwhile. Fold them, reload: they stay folded.

## Keeping your settings

- [ ] Change **Fight type**, **Blue**'s speed and G, tick **First nose chases**, pick 2× speed and choose 3D. Reload the page. Every one of them is as you left it, and the time is T+0.0.
- [ ] Open **Turn Fight settings**, change a Start geometry number, and reload. It is kept.
- [ ] Press **Reset to V6 defaults**. The fight, both aircraft, both checkboxes, pitch, height scale, playback speed, Paint and all of Start geometry go back to V6's, and the fight starts again at T+0.0. The **View** stays as you had it (2D or 3D), and the columns stay as open or folded as they were.

## The readouts

The **Result** column shows a Blue and a Red value where it can. **More detail** (closed at first) opens more, and stays as you left it after a reload.

- [ ] **Result** has **Turn rate**, **Turn radius**, **Range** and **First nose-on**, updating as the fight plays. On the opening fight: 19.2°/s, 1,106 ft, and the range closing from 2.00 NM to 0.00 at the merge.
- [ ] **More detail** shows **Speed**, **G**, **360° time**, **Off-nose angle (ATA)**, **Aspect angle (AA)**, **Angle-off (HCA)** and **Time since merge** (and the height lines with Climb and dive on).
- [ ] **Angle-off (HCA)** is the angle between the two jets' headings, one number for both. On the opening 2-circle fight it reads 180° at the start and stays 180°, because both jets turn the same way at the same rate. In a 1-circle fight it falls after the merge: about 40° at T+20 and 16° at T+30. Compare with V6's angle-off at the same moments: they match (V6 calls it angle-off).
- [ ] **Aspect angle (AA)** is where the other jet sits off each jet's tail. On the opening fight it reads 180° for both jets before the pass (each points at the other), 0° at the merge, then about 35° at T+20 and 131° at T+30.
- [ ] **Off-nose angle (ATA)** reads 0° for both jets before the pass, 180° at the merge, then about 145° at T+20 and 49° at T+30.
- [ ] **G** shows Blue's and Red's set G (4.0 by default). Set Blue's G to 7 at 220 kt: a warning under the box says "7.0 G is above the T-6's stall limit at 220 kt (6.5 G)". The fight still flies 7 G. Set Blue's speed to 300 and G to 8: it says "Above the T-6's 7 G limit". Put both back to normal: the warning goes.
- [ ] **First nose-on** reads "--" until a jet gets its nose within 5° of the other, then "Blue at +12.6 s", "Red at ..." or "Both at ..." (a tie), counted from the merge. The yellow dashed line is drawn from that jet toward the other.
- [ ] Compare the whole Result column with V6 at three moments (same settings, same time): they match, apart from the words and the changes on purpose listed in the specification (First nose-on now says "Both" for a tie).

## Later, not on the screen yet

- [ ] Energy mode (its OVER G and STALL flags, and the moves) isn't built yet. There is nothing to check for it here.

## Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 noted (time, number, V6 value, new value): ________

All lines ticked means the Turn Fight is done (R21).
