# Flight math check (Q18)
(Plain-text copy of Claude Doc tab "Flight math check" node cf8dcafc-b5ed, rev 8, read 3 Oct 2026. Hand-transcribed; tables flattened.)
2026-09-29 · Patrick Korhonen
Patrick asked how we know these V6 numbers are wrong. I checked each one by running V6's own code, unchanged, on turns where the right answer is known. Where possible I also ran it on Dad's example flight. Four are plain errors in the code, and so is part of the fifth. The other two depend on what Dad intends, so they need his answer. Line numbers refer to original/shell.html.
## Dad's answers (by email, 29 Sep 2026)
Dad approved every proposed fix. Patrick settled the 4312 picture the next day. Each fix is still pinned first by a test that records V6's number (D10), then fixed in its own change, and logged as D39 to D47.
| # | Item | Dad's answer | What happens |
| 1 | EM chart turn rate | "Sounds good" | Fix (D39) |
| 2 | 3D view bank | "Sounds good" | Fix (D40) |
| 3 | Turn Sim toward/away | "Probably true. The turn is dependent on equal ground tracks, so the outside must turn first, then the next planes down the line." | Fix (D41); the Turn Sim sign-off shows it so he can confirm |
| 4 | Turn Sim wide/tight | "Okay fix it" | Fix (D42) |
| 5 | 4312 and 2134 picture | "Yea the picture should match" | Patrick (2026-09-30): it depends on how the formation entered; for now #2 is on lead's left, as V6 draws it (Q31, D48) |
| 6a | Auto timing waits for #1 | "Probably true" (same note as item 3) | Fix: outside first, each at its planned time (D43) |
| 6b | Auto delay rule | "Yes, ideally the aircraft all roll out on the same spacing and forward and aft conditions. Auto should produce the ideal." | Line abreast: spacing ÷ speed × cot(half the turn angle) (D44) |
| 7 | Traffic Sim rounded turns | "Agreed" | True circular arc (D46) |
| Q24 | Start heading as compass | "Agreed" | Compass heading (D45) |
| Q26 | Recorded bank, blank pitch | "Agreed" | Use recorded bank, estimate blank pitch (D47) |
| # | Item | Verdict | How it was checked |
| 1 | EM chart turn rate | Wrong: exactly half | V6's EM function on known turns and on all four tracks of Dad's example flight |
| 2 | 3D view bank | Wrong: too small, drawn mirrored, and shown in wings-level pulls | V6's bank and T-6 drawing functions on left and right turns |
| 3 | Turn Sim toward/away | Wrong: turns the opposite way | V6's Turn Sim, run in a browser |
| 4 | Turn Sim wide/tight | Wrong for every aircraft on lead's right | V6's Turn Sim |
| 5 | 4312 and 2134 picture | Dad's call | V6's Turn Sim, with a screenshot |
| 6 | Auto timing | Waiting for #1 is a bug. The delay rule is Dad's call | V6's Turn Sim |
| 7 | Traffic Sim rounded turns | Dad's call: flown tighter than the stated radius | V6's own corner code at 90° and 135° |
## 1. EM chart turn rate is half the real value
What V6 does (line 4158): it takes the aircraft's position 1 second before, now, and 1 second after. It measures the change in direction between the two 1-second legs, then divides by 2 seconds.
Why that is wrong: each leg's direction is the aircraft's track at the middle of that leg, so the two directions belong to half a second before now and half a second after. They are 1 second apart, not 2. The change in direction is one second of turning, so dividing by 2 halves the rate. The speed on the same line is right, because it divides a 2-second distance by 2.
Test results:
- Level turn at 4 G and 220 KTAS: the true rate is 19.23°/s, and V6's EM function gives 9.61°/s.
- Level turn at 2 G and 200 KTAS: the true rate is 9.46°/s, and V6 gives 4.73°/s.
- Dad's example flight, all four aircraft, 652 one-second samples in turns of 5 to 40°/s: V6's EM value is 0.500 to 0.503 times the turn rate of the circle through the same three track points.
V6's own Est G readout in the debrief viewer (line 2462) divides the heading change by the real time between its two points, so it gets the right rate. On the same flight, the Est G panel and the EM chart disagree about the turn rate by a factor of 2.
Fix: remove the division by 2.
## 2. 3D view bank angle
There are three separate problems here (lines 3788 to 3868).
Too small. The bank comes from the same halved turn rate, using tan(bank) = speed × turn rate ÷ g. At 4 G and 220 KTAS the true bank is 75.5°, and V6 shows B 63°. At 2 G and 200 KTAS it is 60°, and V6 shows 41°.
Drawn mirrored. V6's world has north up. Its sideways vector (heading + 90°) points to the aircraft's left, and V6 raises the wing on that side when bank is positive, which it is in a left turn. Running V6's own drawing code on a 4 G left turn puts the left wing tip 46 ft above the fuselage and the right wing tip 46 ft below, on the default 260 ft model. A real left bank puts the left wing down. Right turns are mirrored the same way.
Bank shown in wings-level pulls. When a track carries G, V6 replaces the bank with acos(1/G), which is the bank a level turn would need, and it picks left when the track is not turning. A straight 3 G pull-up shows B 71°.
Fix: use the real turn rate, flip the sign, and use G only in level turns.
## 3. Turn Sim: Toward / Away from cue aircraft
What V6 does (lines 941 to 945 and 1095 to 1106): it works out which side the cue aircraft is on using the same heading + 90° vector, which points left, and then treats that side as right.
Test result in V6's Turn Sim: 4312 at 6,000 ft, with #3 set to Toward cue aircraft #1 and lead held straight. #3 turned right, 43° in 5 seconds, and its range to #1 grew from 6,000 ft to 6,673 ft. Away turned it left and closed the range to 5,332 ft.
This does not depend on how 4312 is drawn. The turn goes the wrong way relative to where the cue aircraft actually is.
Fix: swap the sign.
## 4. Turn Sim: Wide / Tight
What V6 does (lines 905 to 913): it adds the error along one fixed sideways vector for every aircraft, instead of moving each aircraft away from lead or toward it.
Test result: 4312 at 6,000 ft, with a 1,000 ft error.
| Setting | #2 range to lead | #3 range to lead |
| Wide 1,000 ft | 7,000 ft (right) | 5,000 ft (wrong) |
| Tight 1,000 ft | 5,000 ft (right) | 7,000 ft (wrong) |
It is backwards for every aircraft on lead's right: #3 and #4 in 4312, #2 in 2134 and in the two-ship, and #2, #3 and #4 in the offset box. The debrief viewer's error overlay (line 2143) is built the same way.
Fix: move each aircraft away from lead for Wide and toward lead for Tight.
## 5. What 4312 and 2134 look like (Dad's call)
This is how V6 draws each preset when flying up the screen, listed left to right as seen from the cockpit:
| Preset | V6 draws |
| 4312 | #2, #1, #3, #4 |
| 2134 | #4, #3, #1, #2 |
| Two-ship | #1, #2 |
V6's own code comment says "4312 = 4 | 3 | 1 | 2", and the two-ship is labelled "2 | 1". Read left to right from the cockpit, those labels put #2 on the other side, so they are the mirror of what V6 draws. Read as seen from in front of the formation, V6 matches all three labels.
This is about the picture, not the math. V6 picks turn order and turn circles from where the aircraft are actually drawn, so each run is consistent with itself. A screenshot of V6's 4312 is in the thread.
Question for Dad: in 4312, flying north, is #2 on lead's left or right?
## 6. Auto timing
a. Aircraft wait for #1 (a bug). V6 plans for the outside aircraft to start first, but its trigger check (line 1525) holds every wingman until #1 has started turning. The test used 4312, Delayed 90, 220 KTAS and 6,000 ft.
- Right turn: V6 planned #2 at 0 s and #1 at 25.4 s. #2 actually started at 25.4 s, together with #1.
- Left turn: V6 planned #4 at 0 s and #3 at 25.4 s. Both actually started at 50.8 s, together with #1.
- #4 in a right turn and #2 in a left turn are planned at 76.1 s. That is after the default 75-second run, so with the default settings they never turn.
b. The delay rule (Dad's call). V6's auto delay is spacing × turn angle in radians ÷ speed, which comes to 25.4 s at the defaults. For the flight to roll out line abreast at the set spacing, the delay has to be spacing ÷ speed × cot(half the turn angle). For a 90° turn that is simply spacing ÷ speed: the inside aircraft waits exactly as long as it takes to fly the spacing. Here is the test in V6's own sim, as a two-ship at 6,000 ft, 220 KTAS and 2 G:
| Turn | Delay | Where #2 rolls out |
| 90° | 25.4 s (V6 auto) | 9,431 ft abeam and 3,431 ft behind |
| 90° | 16.2 s | 6,015 ft abeam and 15 ft behind |
| 45° | 12.7 s (V6 auto) | 908 ft right and 2,861 ft ahead, about 3,000 ft away |
| 45° | 39.0 s | 6,010 ft abeam and 4 ft behind |
The 15 ft and 4 ft come from the sim's 0.05-second step. V6's manual Base delay defaults to 16 s, which is spacing ÷ speed at 6,000 ft and 220 kt. So Dad's manual number already follows this rule, and only the auto formula disagrees. Spacing × angle is the extra distance flown on a circle one spacing wider, as in a wheel turn, not the delay for a delayed turn.
Question for Dad: should auto timing end the turn line abreast at the set spacing?
## 7. Traffic Sim rounded turns (Dad's call)
What V6 does (Traffic page, lines 193 to 214): it rounds each corner with a curve that starts and ends where a circle of the stated radius would, but the curve is a parabola, not a circle. A parabola bends hardest in the middle.
Test result (V6's own corner code, 120 kt, 2 G waypoint, stated radius 736 ft):
- 90° corner: tightest point 521 ft (0.71 of the radius), which needs about 2.6 G.
- 135° corner: tightest point 282 ft (0.38 of the radius), which needs about 4.6 G.
Question for Dad: should aircraft fly the stated radius (Q25)?
## Recommendation
Ask Dad to approve fixing 1 to 4 and 6a, since they are errors in the code rather than choices. 5 and 6b need his answers. Each fix gets a test that pins V6's current number first, and each change is logged in Decisions. Until then, the rebuilt modules keep V6's numbers.
The test scripts and screenshots are in the project files, in the flight-math-check folder.
