# Line abreast (LAB): how it is flown, from the manuals

Written 4 Oct 2026 for Patrick (CT-156 Turn Sim). Read-only research; nothing in the repo touched. Manual text is paraphrased; quoted words are R/T calls or short phrases. Every claim has a source. `pf/` = `/mnt/project-files/`. Text line numbers are for the files in `pf/manuals/text/`. Orders and SMM limits below are the normal way it is flown, not walls (Patrick, 4 Oct). The CFAFM was not opened; the SMM points to it only for aircraft limits (SMM 16.17 para 47 NOTE).

How I cite: "SMM 16.19 para 52 (smm.txt:8239)" = SMM section, paragraph, line in `smm.txt`. "Fig 16.15" = SMM figure (pictures are in `pf/manuals/images/`; I also rendered the split PDFs at higher resolution). "AFM8 brief p.17" = PDF page. "2 CFFTS Orders B2 ch8 p.103" = book, chapter, printed page. "Gen Book p.11". "EFIG p.460". "WFO" = 15 Wing Flying Orders AL 6.2. Anything marked **(guess)** is my own inference or my own arithmetic, not a source. **ASK** = sources disagree or say nothing a sim needs (collected in section 7).

---

## 0. Read this first

**What the manuals call it.** "Line abreast", short "LAB" (SMM 16.18, smm.txt:8197). The words "double attack" appear in only one source: the 15 Wing Flying Orders. There it means a close line-abreast pair used for Tac Initial, about 1,000 ft apart at 220 KIAS (WFO S2 art 406 para 4c, wfo-al6.2.txt:1480), and "double attack spacing maximum 1000 ft" for the Battle Break / GULAP run-in at 5 DME (WFO S2 art 406 para 3c, wfo-al6.2.txt:1454). Annex G (MTCA deconfliction plan, para 4) lists "double attack" next to "fighting wing" as a thing that splits a formation into individually counted aircraft (wfo-al6.2.txt:2293). The SMM says the same thing for Tac Initial in its own words: a "closer than normal line abreast position" at about 1,000 ft and 220 KIAS (SMM 17.5 para 36, smm.txt:9359). So in these manuals "double attack" is the Tac Initial / Battle Break close version of LAB. The SMM, EFIG, AFM7 and AFM8 briefs, Gen Book and 2 CFFTS Orders never use the phrase (searched all text files). The training formation Patrick wants for the sim is "LAB" in every teaching document.

**Three reading traps.**
1. **Call signs in the SMM text are placeholders** and change from paragraph to paragraph (VIPERS, BLACKS, VENOMS) for the same call. The format is "(call sign), (angle) LEFT/RIGHT". Do not read meaning into the name.
2. **"Into" and "away" are said from Lead's side in the SMM text, but the Fig 16.15 to 16.17 panel titles are from the wingman's side.** "Delayed 90 into the wingman" (SMM 16.19 para 53) is the panel titled "TURN AWAY FROM LEAD". "Delayed 90 away from the wingman" (para 54) is the panel titled "TURN TOWARDS LEAD". The same goes for the 45s. Same flying, opposite words. (The `manuals/README.md` figure table uses the panel titles.)
3. **"Wing flash" is never defined** anywhere I could read. Treat it as Lead's visible roll of the aircraft (the SMM uses "wing rock" for the same idea in Table 16.1 and Table 12.1). ASK.

**Five-line summary of how LAB is flown.**
1. Two aircraft side by side 4,000 to 6,000 ft apart, the wingman 0 to 10 degrees behind Lead's abeam line, within about 2,000 ft vertically, at 220 KIAS. Lead flies straight and predictable. The wingman is always the one who holds the position and fixes any error, however it came about (SMM 16.18 paras 49-50).
2. Turns are quick, 3 G, about 70 degrees of bank, power as needed, so the formation spends little time turning. Turns start by R/T call or a wing flash.
3. In delayed turns the aircraft on the outside of the turn rolls in first and clears the inside; the other flies straight until the first has passed behind and shows at about 5 or 7 o'clock, then turns. "Closer, turn early; wider, delay."
4. Turns that move both together (check, in-place, hook) start at the same moment; the crossing turns (shackle, cross turn) put the wingman directly above or below Lead with at least 300 ft between them.
5. After every turn the wingman cross-checks Lead, tweaks G or heading before roll-out, and fixes whatever is left quickly on roll-out. The 4-ship versions add an altitude stack of 300 ft steps and a 10-15 s delay for the rear element.

---

## 1. What line abreast is and why it is flown

- **Purpose.** A formation designed to give the best look-out to the rear hemisphere and mutual support. The basic element is the 2-ship (SMM 16.18 para 49, smm.txt:8199).
- **Trade-off.** Good visual coverage of the rear hemisphere, but degraded manoeuvrability. It is the defensive formation: normally used for mutual protection, with some offensive posture. Fighting wing is the opposite: simple, manoeuvrable, good forward look-out, poor rear coverage, normally the offensive formation (SMM 16.13 para 31, smm.txt:7912). EFIG says LAB [manual text left out; see the page cited], maximising downrange offensive capability while giving excellent mutual support (EFIG p.460, efig.txt:14308).
- **Why the spacing is what it is.** Each pilot can see the other'[manual text left out; see the page cited] weak spot is the "mutual blind area" midway between the two aircraft, where both blind areas overlap. Flying far enough apart pushes that area far back behind the formation. Beyond 9,000 ft apart it is very hard to cover or warn of an enemy attacking from the beam outside the formation (SMM 16.18 para 49).
- **Look-out work split.** About three quarters of the time on your primary sector, the rest on the remaining sky. Break the secondary and tertiary sectors into smaller ones, 3-5 s each. Cover the whole sky, level and vertical. Do not stare at the other aircraft, even though holding position is the wingman's job (SMM 16.14 paras 33-34, smm.txt:7950-7965). Fig 16.5 (pictured from the wingman: Lead on his side) shows a forward primary sector, a secondary sector on the Lead side, a tertiary sector on the outside, and a blind spot behind. That is my reading of the picture, not text.
- **Clearing for the formation.** The wingman, though primarily busy with the miss and his position, also gets the chance to clear the area for the formation (SMM 16.13 para 31). In a delayed turn the outside pilot clears the inside of the turn, then after roll-out clears the outside of the finished turn where the other aircraft will appear (SMM 16.19 para 52). In a hook one pilot looks level to low and the other level to high (para 60).
- **Who is responsible for what (2-ship).**
  - Wingman: remain within the prescribed LAB parameters; correct any error regardless of how it developed (SMM 16.18 para 50, smm.txt:8217). Primarily responsible for "making the miss" (not hitting Lead) and for maintaining position (para 31). Keep the lead in sight and keep an accurate station (SMM 12.37 para 90).
  - Lead: flies straight and level while the wingman moves into position (para 51); keeps predictable (Training rule, SMM Table 16.1 / Gen Book p.11); calls or flashes the turns; for tac nav, leads, navigates and looks out, while the wingman maintains formation integrity, looks out and does backup navigation (SMM 17.4 para 31, smm.txt:9299). For the 4-ship the rule of thumb is [manual text left out; see the page cited] (SMM 16.39 para 107; AFM8 brief p.27).
  - "There is always a contract between lead and wingman" that sets out the division of responsibility (SMM 17.1 para 2, smm.txt:9015). The contract itself is not written down in the SMM. ASK.
- **Training rules that apply to LAB** (SMM Table 16.1, smm.txt:8515-8565; Gen Book p.11; AFM8 brief p.30): wingmen make the miss (high if low level); lead remains predictable; transmit your intended flight path; nose high goes high if able; LAB crossing 300 ft minimum safe separation; wingman losing visual or SA manoeuvres away from Lead's last known position and calls BLIND with altitude; G limits Lead +4 / wingmen +5; hard deck 3,000 ft AGL or 2,000 ft above cloud (6,000 ft AGL with solo students). The table also says "no crossing flight paths", which reads oddly beside LAB crossing turns; the SMM treats the 300 ft rule as the answer (SMM 16.13 para 31). ASK.

---

## 2. The formation: the numbers

### 2.1 Two-ship LAB

| What | Value | Source |
|---|---|---|
| Lateral spacing | 4,000 to 6,000 ft between aircraft | SMM 16.18 para 49 (smm.txt:8202); Fig 16.11 |
| Fore/aft ("sweep") | 0 to 10 degrees. The wingman sits behind Lead's abeam (3/9) line, so Lead can see him. 10 degrees of sweep is a line drawn back from Lead (Fig 16.11). At 4,000 / 5,000 / 6,000 ft that is about 705 / 880 / 1,060 ft behind abeam **(guess, my arithmetic: spacing x tan 10 degrees)** | SMM 16.18 para 49; Fig 16.11 |
| Vertical | plus or minus 2,000 ft | SMM 16.18 para 49 |
| Speed | 220 KIAS. G-warm minimum 220 KIAS. Tac nav marshal in LAB or FW at 200 KIAS | SMM 16.18 para 49; 16.22 para 70 (smm.txt:8467); 17.4 para 9 (smm.txt:9094) |
| Power | No torque figure for LAB cruise anywhere. Turns are flown with PCL MAX or "as required to maintain airspeed" (see ASK 4) | SMM 16.18 para 50; 16.19 paras 52, 59, 60 |
| Sight picture | Fig 16.12 (front seat) and 16.13 (rear seat) show Lead against 0-degree and 10-degree sweep lines on the wingman's wingtip, plus an apparent-size scale: Lead looks full size at 2,000 ft, about 2/3 at 4,000 ft and about 1/2 at 6,000 ft. No text explains them | SMM 16.18, Fig 16.12, 16.13 |
| Mutual blind area | Pictured at 4,000 / 5,000 / 6,000 / 7,000 ft spacing with a blind line labelled 20 degrees and distances behind the formation of roughly 1.2 / 1.3 / 1.6 / 1.8 NM. The picture is a blurry raster; treat the read-off as approximate **(guess at the labels)** | SMM Fig 16.14 |
| Close version ("double attack") | about 1,000 ft apart, 220 KIAS, for Tac Initial; double attack spacing maximum 1,000 ft in the GULAP / Battle Break run-in; 4-ship second element about 3,000 ft behind | SMM 17.5 para 36; WFO S2 art 406 paras 3c, 4c, 4f |
| Entry | From echelon, route or fighting wing. Simplest: Lead establishes the heading, then calls the wingman to LAB; the wingman moves out while Lead flies straight and level. Lead may call a more dynamic entry where both turn onto a new heading together | SMM 16.18 para 51 (smm.txt:8230) |
| Signal to move to LAB | Double wave away with an open hand, palm inside | SMM Table 12.1 (smm.txt:6181) |
| Signal to close from LAB | First wing rock: close to fighting wing; second: route; third: echelon | SMM Table 12.1 (smm.txt:6183) |

### 2.2 Spread 4 (the four-ship LAB)

- **Layout.** Four aircraft in one line. Spread-4 East (right) is #2, Lead, #3, #4 from left to right looking along the heading (north in the figure); Spread-4 West (left) is #4, #3, Lead, #2 from left to right. Each neighbouring pair is a normal LAB pair (SMM 16.42 para 113, 116; Fig 16.33).
- **Distances in Fig 16.33** (I zoomed the PDF): each neighbouring pair 4,000-6,000 ft; #2 to #3 8,000-12,000 ft; #2 to #4 12,000-18,000 ft, "up to about 3 NM" overall (SMM Fig 16.33 note). The `manuals/README.md` row for Fig 16.33 says "Lead-#3 8,000-12,000". That is wrong: the 8,000-12,000 arrow runs from #2 to #3. Lead-#3 and #3-#4 are the ordinary 4,000-6,000.
- **Who flies off whom.** #3 and #2 fly LAB off Lead; #4 flies LAB off #3 (SMM 16.42 para 116, smm.txt:8933). #4 keeps visual with #3 and ideally Lead and #2; [manual text left out; see the page cited] a slight altitude stack helps (para 115).
- **Altitude stack (the main separation).**
  - AFM8 brief p.14 (picture): #2 at +300 ft, Lead 0, #3 at -300 ft, #4 at -600 ft. Text on AFM7 p.15 / AFM8 p.15: "300 ft stacks, low to high 4, 3, 1, 2". Same for the offset box (AFM8 p.14 shows a different horizontal layout but the same steps).
  - SMM Fig 16.33 gives an example with the opposite sign and 250 ft steps: #2 7,750; Lead 8,000; #3 8,250; #4 8,500. Its note: #2 sets the stack, and #3 and #4 move to the opposite block, with #4 above #3 in the example.
  - The principle matches (#2 on one side of Lead; #3 and #4 on the other; #4 furthest). The sign and the step size differ. ASK.
  - Use: establish the stack before turns, hold it while the formation turns, use the vertical to fix position once rolled out, return to the stack promptly when Lead calls (AFM8 brief p.14 items 3-5; p.17 item 2).
- **Speed.** No separate speed is given for Spread 4. Its G-warm is "largely the same" as the 2-ship one (minimum 220 KIAS, SMM 16.44 para 120). Fig 16.33 note: "standard LAB formation between elements and Lead/#3".
- **Entry.** Only from finger or fighting wing. #3 moves out slower than usual and waits for #4 to start moving before opening up, to leave room for #4 (SMM 16.42 para 114, smm.txt:8924). Set-up from FW with finger geometry; use altitude and power to make the spacing; stack once in position; start wide (about 6,000 ft) if a G-warm follows (AFM8 brief p.15, AFM7 brief p.15).
- **Spacing in practice.** "Strive for tight side of LAB spacing" for manoeuvres (AFM8 brief p.17 item 3). Wide (about 6,000 ft) for the first G-warm turn, then tighten toward 4,000 ft (AFM8 brief p.16 items 1, 5).
- **Look-out.** Increased to include the other two aircraft (SMM 16.42 para 117).

### 2.3 Offset box (the other four-ship LAB form)

- **Layout.** Two elements, each flying LAB inside the element (4,000-6,000 ft). The second element trails the first with an offset (#3 sits roughly between #2 and Lead laterally, #4 outboard). Text: trail 6,000-8,000 ft (1.0-1.2 NM). Both SMM Fig 16.30 and AFM8 brief p.21-22 show 8,000-12,000 ft along the trail axis instead (SMM 16.41 para 109, smm.txt:8888; Fig 16.30; AFM8 brief p.21). Note 8,000 ft is 1.3 NM, so even the text is not exact. ASK. Patrick's ruling (Q7, 5:37Z, 4 Oct) follows the text: 7,000 plus or minus 1,000 ft.
- **Why.** Spacing gives separation so the whole formation is not easy to see, and lets the rear element protect the front element. The Harvard is hard to see from straight behind, so the offset helps keep sight of the lead element (para 109).
- **Responsibility.** The trailing element is responsible for separation from the front element, especially if the box becomes "over-square" (too far forward for its width); use the offset to cure that (para 111).
- **Entry.** From fighting wing or finger on the call "OFFSET BOX EAST/WEST"; element leaders carry it out as briefed; #3 achieves the pre-briefed spacing on the lead element (para 110). AFM8 route: from FW, "FLUID 4, GO": #3 diverges to a wide LAB (6,000 ft) off Lead; #2 and #4 stay in FW on the outside; stack once in position (AFM8 brief p.20). Or "FOR OFFSET BOX RIGHT/LEFT, IN PLACE 90 RIGHT": both elements turn in FW, spread to LAB, #3 calls "IN" when the rear element is ready (p.21-22). Offset box manoeuvring: Lead commands the turns for the front element; #3 calls the turns for the rear element (p.23).
- **Same look-out and manoeuvring principles as LAB** (para 109).

### 2.4 Speed kinds

Every speed the manuals give for LAB is KIAS (220 for LAB and G-warm, 200 for rejoins and the tac nav marshal, 220 for Tac Initial). The only knots figure that is not IAS is the tac nav run-in at 240 kt **ground speed** (SMM 17.4 paras 9, 28). The Gen Book gives a conversion point: 220 KIAS is 240 KTAS at 7,000 ft (Gen Book p.23 note 4, genbook.txt:946, a fuel-planning note). Standard atmosphere gives about 244 KTAS at 7,000 ft and 248 at 8,000 ft **(guess, my arithmetic)**. Patrick's ruling (4 Oct, 5:37Z): lead flies 220 KIAS in the low block (6,000-10,000 ft MSL) and 200 KIAS in the mid block (10,500-15,500 ft); formation flying is normally in the low block (WFO S2, Harvard airspace paras 13-15, wfo-al6.2.txt:2355-2362; Gen Book p.12). The manuals have no 200 KIAS mid-block rule for LAB; that is Patrick's.

---

## 3. Straight and level: who holds what

**Lead.** Flies the briefed heading, altitude and speed smoothly and predictably. EFIG: [manual text left out; see the page cited] predictable Lead's control inputs must be; telegraph manoeuvres; avoid very low airspeeds; think about minimum power (EFIG p.362-363, efig.txt:11887-11935). The most important consideration in any manoeuvring is the experience of the wingman (SMM 12.36 para 87c(7); 16.36 para 98).

**Wingman.** Holds all three position axes relative to Lead:
- **Lateral:** 4,000-6,000 ft (4-ship: tight side of that, AFM8 p.17).
- **Fore/aft:** 0-10 degrees behind abeam.
- **Vertical:** within about 2,000 ft in the 2-ship; the 300 ft stack in the 4-ship; in the low-level environment keep Lead on or slightly below the horizon (SMM 17.4 para 15, smm.txt:9144).

**References.** The only references the SMM gives are pictures (Fig 16.12 and 16.13): wingtip sweep lines and Lead's apparent size. No text explains them. For general visual cues the SMM defines closure (how fast the other aircraft grows or shrinks), range (compare size to cockpit features), line of sight (how fast the other aircraft moves across the windscreen) and aspect (SMM 12.2 paras 4-9, smm.txt:4852-4895; 16.16 para 40). Do not stare at Lead (para 34).

**Error words.** The standard station-keeping terms are Forward / Back (longitudinal), Up / Down (vertical), In / Out (lateral), Right / Left (line astern) (SMM 12.18 para 39, smm.txt:5173). They are written for close formation but are the words the manual has for fore/aft, high/low and wide/tight.

**How the wingman fixes errors (what the sources say, and what they leave out).**

| Error | Sourced fix | Not in the sources |
|---|---|---|
| Wide / tight (lateral) | A check turn [manual text left out; see the page cited] (SMM 16.19 para 58). Heading change is the lateral control. The 4-ship manoeuvres use 10-15 degree check turns (Fig 16.34, 16.31; AFM8 p.17-18). Mid-turn, "adjust G and/or anticipated heading" (para 52 NOTE) | How many degrees to use for a given error; how fast. ASK |
| Fore / aft (sweep) | Power: SMM 12.18 para 40 says the PCL has a lag, so anticipate it and make each correction as soon as the need appears, small, because the longer you wait the bigger the correction and the longer to regain position. In 4-ship, "use altitude/power as required to make spacing" (AFM8 p.15) and, after roll-out, "make prompt corrections to position using power/altitude" (AFM8 p.23) | Torque amounts for LAB. ASK |
| High / low | Vertical: AFM8 p.17 "once rolled out, use the stack to fix position" (4-ship). In the 2-ship the plus or minus 2,000 ft band is wide enough that no correction is described | Fix rate. ASK |
| Too early or late into a turn | "Closer ... turn early, wider ... delay" (SMM 16.19 para 54 NOTE); fix the rest with G and heading in the turn and on roll-out (para 52 NOTE) | Nothing quantitative |
| Out of position generally | Wingman corrects "regardless of how it developed" (para 50). Regain LAB as soon as possible after rolling out, and be in the correct LAB before a turn so as not to conflict with Lead, especially 45-degree turns (SMM 17.4 para 19, smm.txt:9173) | - |
| Wingman too far ahead of the normal position | SMM 16.20 para 67 (smm.txt:8440, rejoin context) says Lead may need to correct the formation to proper LAB before a rejoin if the wingman is too far ahead; it names a small check turn away from the wingman for novices. That a check turn away pushes him aft is my geometry (see 4.4), not the text | - |
| Lost visual | Manoeuvre away from Lead's last known position, call BLIND with altitude (Table 16.1) | - |
| Wrong-way turn / split | Formation can split by "turning the wrong way in line abreast". Recovery is a BVR rejoin: wingman calls "OFF, BLIND" with heading and altitude; Lead sets a deconfliction contract (usually altitude); read it back; rendezvous; talk the wingman onto Lead with clock position, distance and relative height (SMM 16.11 paras 26-29, smm.txt:7862-7900) | - |

**Tolerances the sources give.** Lateral 4,000-6,000 ft; sweep 0-10 degrees; vertical plus or minus 2,000 ft; speed 220 KIAS with no stated tolerance; the 4-ship stack steps; crossing separation 300 ft. None of these says how long an excursion may last. The `V6_STANDARDS` numbers (200 kt plus or minus 10; plus or minus 250 ft fore/aft) are not from these manuals. Patrick's Q9 ruling (follow the SMM sweep, flag out-of-position) already covers sweep.

**Mistakes in station keeping that the SMM names** (close formation; the LAB equivalents are not written): over-controlling (move out, relax, re-trim, move back in, SMM 12.1 para 3); a lag between PCL and aircraft response; with the lead's bank change the wingman "most commonly" fails to match the lead's roll rate and slides wide when stepped up or toward Lead when stepped down (SMM 12.19 para 43). AFM7: avoid abrupt corrections and PIO (AFM7 p.18).

---

## 4. The manoeuvres, one by one

**Common to all LAB turns** (SMM 16.18 para 50, smm.txt:8217; Figures 16.15-16.21 note "All turns 70/3, energy sustaining"):
- Start by R/T call, wing flash or other briefed signal. Comms or comm-out per manoeuvre below.
- Prompt level turn, 3 G (about 70 degrees of bank), PCL MAX (para 50) or "as required to maintain airspeed" (paras 52, 59, 60). The text says there will be a minor loss of airspeed that is regained after rolling wings level. The point of the high G [manual text left out; see the page cited], while keeping both aircraft at combat speed.
- The wingman cross-checks Lead throughout (Fig 16.15 left note, 16.21 note).
- No roll rate, no roll-in time, no speed-loss number anywhere. ASK.
- Minimum crossing separation 300 ft (vertical and/or horizontal) for every LAB manoeuvre (SMM 16.13 para 31; 2 CFFTS Orders B2 ch8 p.98 para 4).

**Standard R/T words** (2 CFFTS Orders B2 ch8 p.103 para 22e, 2cffts-orders-jul26.txt:3346-3354): "(call sign), 90/45 left/right" for delayed turns; "In place 90/45 left/right"; "Check 20 left/right"; "Hook left/right"; "Shackle"; "Cross-turn". SMM examples: "VENOMS, 90 LEFT"; "VENOMS IN PLACE 90 LEFT/RIGHT"; "VENOMS, CHECK 20 LEFT"; "BLACKS, HOOK LEFT/RIGHT"; "BLACKS, SHACKLE"; "BLACKS, CROSSTURN" (paras 53-64, Fig 16.18). Each R/T call carries the formation call sign; the wingman need not answer when the move shows it was understood (SMM 12.7 paras 19-21).

### 4.1 Delayed 90, turning into the wingman (Lead on the outside)

- **Call or signal.** R/T "(call sign), 90 LEFT/RIGHT" (SMM 16.19 para 53, smm.txt:8256). Comm-out: Lead simply turns 90 towards the wingman (Fig 16.15 comm-out box).
- **Who turns first and why.** Lead, because he is on the outside of the turn. The outside pilot immediately starts the 3 G level turn [manual text left out; see the page cited]. The point of a delayed turn is that each pilot turns quickly, without interfering with the other, and in the other's view for most of the turn (para 52, smm.txt:8239).
- **The cue the other uses.** The wingman (inside) flies [manual text left out; see the page cited] Lead has passed behind and shows at about the 5 o'clock [manual text left out; see the page cited]" (para 52; the figure and my geometry give 5 for a left turn, 7 for a right turn). Then he turns 90 degrees at 3 G, clearing the inside of the turn. Fig 16.15 says the wingman turns before Lead has passed through his tail and reached about 7 or 5 o'clock (panel titled "turn away from lead"). Rule for when: "closer, turn early; wider, delay" (para 54 NOTE).
- **Bank / G / speed.** 70 degrees / 3 G / 220 KIAS start; PCL as required to hold airspeed.
- **Roll-out picture.** After 90 degrees Lead rolls out, immediately clears outside the finished turn where the wingman is about to appear. After 90 degrees the wingman rolls out back in LAB on the opposite side of the formation (para 52). Fig 16.15 shows the pair finishing abreast, sides swapped, both on the new heading (positions 7).
- **How the wingman corrects.** Cross-check Lead during the turn and adjust G and/or anticipated heading to help fix spacing errors before roll-out; any remaining error is fixed on roll-out (para 52 NOTE). Fig 16.15: "Wingman must quickly fix any spacing or sweep errors on roll out" (right panel); "adjust G for spacing and fix any errors upon roll-out" (left panel).
- **Common errors and fixes.**
  - Turning too early or late relative to the other: use the closer/wider rule. Turning when the wrong aircraft is at the clock position (e.g. waiting for 7 when it should be 5): Fig 16.15 separates the two by turn direction.
  - Wrong-way turn: a formation split, then BVR rejoin (SMM 16.11 para 26).
  - After the turn: spacing or sweep errors are corrected with power, G, and heading, "quickly" (Fig 16.15). No numbers.
- **Steps a sim could follow** (right turn, Lead on the left, wingman on the right; mirror for left):
  1. Lead rolls in (R/T or comm-out cue). Wingman holds heading and speed.
  2. Lead turns 90 degrees at about 70 degrees of bank / 3 G, then rolls out.
  3. Wingman watches Lead sweep across behind his tail. When Lead is at his 7 o'clock (for a right turn; 5 for a left), adjusted by the closer/wider rule, he rolls in 90 degrees at 70/3.
  4. Wingman cross-checks Lead during the turn and nudges G and/or heading.
  5. Wingman rolls out; both are now on the new heading with sides swapped.
  6. Wingman spends the next few seconds fixing spacing (4,000-6,000 ft) and sweep (0-10 degrees) with power and a small heading change; Lead flies straight.

### 4.2 Delayed 90, turning away from the wingman (wingman on the outside)

- **Call or signal.** Lead starts it with a wing flash. On R/T the call is "(call sign), 90 LEFT/RIGHT" and the wingman starts on the call (SMM 16.19 para 54, smm.txt:8261).
- **Who turns first and why.** The wingman, because he is on the outside. He immediately turns 90 degrees into Lead and rolls out. Lead (inside) waits.
- **The cue.** When [manual text left out; see the page cited], Lead initiates his own 90-degree turn in the called direction (para 54). Fig 16.15 right panel: Lead turns before the wingman has passed through his tail and reached about 7 or 5 o'clock. Same rule: "closer, turn early; wider, delay."
- **Bank / G / speed / roll-out.** As 4.1. Pair ends in LAB on the opposite sides, abreast.
- **How the wingman corrects.** Here the wingman rolls out first, so he sees the geometry unfold ahead of Lead's turn and must "quickly fix any spacing or sweep errors on roll-out" (Fig 16.15 right note).
- **Steps** (right turn, wingman on the left): 1. Lead flashes the wings; wingman rolls into a 70/3 turn right. 2. Wingman rolls out after 90 degrees and clears outside. 3. Lead, still straight, watches the wingman cross behind and appear at his 7 o'clock; Lead rolls in 70/3 for 90 degrees. 4. Lead rolls out; both are abreast again, sides swapped. 5. Wingman fixes spacing and sweep.

### 4.3 Delayed 45 (into the wingman, away from the wingman, and with check)

General (SMM 16.19 paras 55-57, smm.txt:8276-8300): the 45 is flown "similar to" the 90, and once you understand it, any angle from 30 to 90 degrees is within reach (para 55). Figures 16.16 and 16.17 add the notes below.

**Delayed 45 into the wingman.**
- **Call.** "(call sign), 45 LEFT/RIGHT" (para 56). Comm-out: Lead turns 45 towards the wingman.
- **Who first.** Lead (outside). The wingman sees Lead start and must assume a 90 is about to be performed. If the turn was called on the radio the wingman knows the new heading.
- **Cue.** The wingman carries on straight, in front of Lead, to the other side of Lead's path, and picks up the new heading in LAB when Lead has rolled out on the (45-degree) heading. Fig 16.16 note: the wingman turns after Lead has passed through his tail and reached about 7 or 5 o'clock. (The 90 and the 45 differ on "before" and "after" the tail, and on clock side; see ASK 8.)
- **Power / time.** Fig 16.16: the geometry allows constant speed and power, but the turn is "more time consuming".
- **Roll-out.** Both on the 45-degree heading in LAB, sides swapped (para 56); the picture shows them roughly abeam with the second aircraft slightly behind. Wingman quickly fixes any spacing or sweep errors on roll-out.

**Delayed 45 away from the wingman.**
- **Call.** Lead starts with the standard wing flash. On R/T "(call sign), 45 LEFT/RIGHT" (para 57).
- **First.** The wingman turns towards Lead as if for a 90. Instead of completing 90, he rolls out at about 45 when Lead gives a second wing flash (or at the heading Lead called).
- **Cue.** Lead crosses to the wingman's other side, then turns to the new heading to regain LAB. Fig 16.16: Lead turns after the wingman passes through his tail and reaches about 7 or 5 o'clock.
- **Comm-out** (Fig 16.16): Lead initiates with a wing flash and gives a second wing flash to indicate the 45; the wingman turns towards Lead and rolls out at 45 on seeing the second flash.

**Delayed 45 with a check turn** (Fig 16.17; para 56 last sentence).
- Into the wingman: after Lead has established 45 degrees, the wingman does a check turn towards Lead to adjust geometry. Away from the wingman: after the wingman has established 45, Lead checks towards him. Comm-out (Fig 16.17 right panel): Lead flashes his wings to start, then a check turn tells the wingman it is a 45, and the wingman turns towards Lead and rolls out at 45 on seeing the second wing flash.
- Fig 16.17: needs a power or speed increase to hold sweep, but is less time consuming.
- 4-ship: the check is 10-15 degrees (AFM8 p.18, Fig 16.34). [manual text left out; see the page cited] (AFM8 p.18 item 5).
- Tac nav: in the low-level, "a modified delayed 45" is used for turns over 30 and up to 70 degrees (SMM 17.4 para 16; see 4.10).

**Bank / G / speed.** 70/3 for all (Fig 16.16, 16.17).

**Errors and fixes.** Be in correct LAB before a 45, to avoid conflict with Lead (SMM 17.4 para 19). Fix spacing and sweep on roll-out.

**Steps a sim could follow (45 into the wingman, no check):**
1. Lead rolls into a 70/3 turn toward the wingman; rolls out after 45 degrees; flies straight on the new heading.
2. Wingman flies straight ahead (as if a 90 were coming), crossing in front of Lead's new track.
3. When Lead has passed through his tail and shows at about 5 o'clock for a right turn or 7 o'clock for a left turn, the wingman rolls in 70/3 for 45 degrees. (Fig 16.16 left panel draws the right-turn case with Lead at the wingman's right rear and my geometry agrees. This is the opposite clock side from the 90, where a right turn is cued at 7. See ASK 8.)
4. Wingman rolls out on the new heading, other side of Lead, in LAB; cross-checks and fixes spacing and sweep on roll-out.

### 4.4 Check turn (30 degrees or less)

- **Call.** "(call sign), check 20 left/right" (Fig 16.18 R/T box; Orders p.103). Comm-out is not authorised (Fig 16.18), [manual text left out; see the page cited] such as in TACNAV (para 58, smm.txt:8304). At low level a comm-out check turn may be flown as briefed (SMM 17.4 para 16).
- **Who turns.** Both aircraft together. Both roll into the direction indicated, pull through 30 degrees or less, and roll out (para 58). Also used to help the wingman gain a LAB position.
- **Bank / G / speed.** 70/3, energy sustaining (Fig 16.18).
- **Roll-out.** Same formation shape on the new heading (Fig 16.18); the wingman quickly fixes any spacing or sweep errors (note).
- **Limit.** More than 30 degrees is called an in-place turn (para 58). Low-level: [manual text left out; see the page cited] (SMM 17.4 para 16). Heading corrections by check turns should be small (SMM 17.4 para 24).
- **What a check turn does to the geometry (guess, my arithmetic, no wind, same speed and G):** both turn the same angle, so the line between the two aircraft rotates by that angle. A check turn into the wingman moves him ahead of the abeam line by about spacing x sin(turn); away from him, aft by the same. At 5,000 ft apart: 10 degrees about 870 ft; 20 degrees about 1,710 ft; 30 degrees about 2,500 ft. This is consistent with SMM 16.20 para 67 (a small check turn away from the wingman, and a correction if he is too far ahead), but the text does not state the effect.
- **Steps:** 1. Lead's call. 2. Both roll in 70/3 together. 3. Both roll out after the called angle (up to 30). 4. Wingman fixes spacing and sweep.

### 4.5 In-place turn (more than 30, up to 90 degrees)

- **Call.** "(call sign) IN PLACE 90 LEFT/RIGHT" (para 59, smm.txt:8315). Radio only; comm-out is not authorised (para 59; Fig 16.18).
- **Who turns.** Both together, into or away from the wingman. Also used to go from LAB to fighting wing or back, and inside the G-warm (para 58).
- **Bank / G / speed.** 70/3 energy sustaining, PCL as required to maintain airspeed.
- **Roll-out.** Ends in trail with normal LAB spacing: [manual text left out; see the page cited] one, adjusting into position if not (para 59). In some cases an in-place turn brings a formation back into LAB. With both on the same turn radius, after a 90 turn into the wingman the wingman is straight ahead of Lead at the old spacing; after a 90 turn away from him, Lead is ahead **(guess, my arithmetic)**. A 45 in-place leaves them on a 45-degree sweep line (the Orders list "In place 45" as a call, B2 ch8 p.103).
- **Correction.** Trailing aircraft lines up behind on roll-out (para 59), "quickly" fixes spacing (Fig 16.18).
- **Steps:** 1. Call. 2. Both roll in together 70/3. 3. Roll out at the called heading. 4. Trailing aircraft slides in line and holds the old spacing (4,000-6,000 ft) behind the leading one.

### 4.6 Hook turn (both turn 180, same direction)

- **Call.** "(call sign), HOOK LEFT/RIGHT" (para 60, smm.txt:8323). Comm-out: Lead flashes his wings; the wingman starts a turn towards Lead; as Lead sees it, he turns away from the wingman to start the 180; when the wingman sees Lead turning away he assumes a 180 and continues to roll out in LAB (para 60). Comm-out hooks are always away from the wingman (Fig 16.19 note).
- **Who turns.** Both, together, same direction, 180 degrees.
- **Bank / G / speed.** Both start 70/3 energy-sustaining level turns, PCL as required (para 60). The inside aircraft holds 70/3 for the whole 180. The outside aircraft adjusts G to line up fuselages with the inside one at the 90-degree point, then returns to 70/3 (Fig 16.19). AFM8 p.18 says "slightly adjust G" and "strive for precise 70/3". Once past the 90-degree point, everyone returns to 70/3 (Fig 16.19; AFM8 p.18).
- **Look-out.** Both clear the inside of the turn, one level to low and one level to high (para 60).
- **Roll-out.** Both roll out after 180 in LAB (para 60), at the same spacing, now heading back along the track. Same-radius circles leave the lateral spacing unchanged **(guess, my arithmetic)**.
- **Correction.** The outside aircraft's G tweak at 90 degrees is the main in-turn fix. The wingman "must quickly fix any spacing or sweep errors on roll out" (Fig 16.19). No numbers for the G tweak. ASK.
- **4-ship.** Spread 4: all aircraft on the outside align fuselages at the 90-degree mark; all roll out 180 degrees from the old heading in LAB (SMM 16.45 para 121, smm.txt:8964; Fig 16.36; AFM8 p.18). Offset box: rear element delays the hook 10-15 s to flow in behind the lead element and must keep out of the lead element (Fig 16.32 note; AFM8 p.24). Watch for the other element and hold the stack (AFM8 p.24).
- **Steps:** 1. Call (or wing flash). 2. Both roll in 70/3. 3. At 90 degrees the outside aircraft checks alignment against the inside one and adjusts G. 4. Past 90, both back to 70/3. 5. Roll out after 180 in LAB; wingman fixes spacing and sweep.

### 4.7 Shackle (turn towards each other, cross, turn back; heading unchanged)

- **Call.** "(call sign), SHACKLE" (para 61, smm.txt:8334). Comm-out is not authorised (Fig 16.20).
- **Who turns.** Both, promptly, 3 G, towards each other, rolling out after about 45 degrees.
- **Vertical separation.** Lead stays level. The wingman must immediately "telegraph" his nose position (visibly pitching) to show he will pass above or below, and turns about 45 degrees towards Lead, adjusting roll-out heading to fly directly above or below Lead. Minimum 300 ft vertical when they pass (Fig 16.20; para 61; Training rules; Orders p.98 para 4).
- **After they cross.** Lead indicates [manual text left out; see the page cited] heading, timing it to arrive back in LAB. The wingman must cross-check Lead to see that timing (para 62, smm.txt:8350). Fig 16.20: the wingman turns 45 back as soon as Lead starts turning back.
- **Roll-out.** Same heading, sides swapped, both in LAB. The picture is an X.
- **Why.** Increase rear-hemisphere coverage when checking a possible threat at six; place the wingman on the right side for an attack. Downside: it makes the formation easier to see (and the wing flashes add to that) (para 63).
- **How the wingman corrects.** Quickly fix spacing and sweep on roll-out (Fig 16.20).
- **4-ship.** Offset box: shackle, in-place and check turns have no delay for the rear element (SMM 16.41 para 112b). Not listed as an approved Spread-4 turn (para 118).
- **Steps:** 1. Call. 2. Both roll in 70/3 towards each other. 3. Wingman telegraphs the nose to set up the vertical miss. 4. Roll out at about 45 degrees; wingman aims to pass directly above or below, 300 ft or more. 5. They cross. 6. Lead starts the turn back; wingman sees it and does the same. 7. Roll out on the original heading in LAB; fix spacing and sweep.
- **Rough timing (guess, my arithmetic, 240 KTAS, 3 G, no wind):** each aircraft moves about 530 ft sideways in each 45-degree turn. If each ends up one spacing away from where it started, the straight leg between the two turns lasts about (spacing minus 1,060 ft) / 286 ft per s: about 14 s at 5,000 ft spacing.

### 4.8 Cross turn (turn towards each other, reverse the formation's direction)

- **Call.** "(call sign), CROSSTURN" (para 64, smm.txt:8363). Comm-out is not authorised (Fig 16.21).
- **Who turns.** Both, together, towards each other. They keep a 2 G energy-sustaining turn for about the first 90 degrees (text); Fig 16.21 labels it "60/2, or as required to pass directly above or below Lead", and the second part "70/3". After they cross both increase to 3 G energy-sustaining, using bank as required to roll out after 180 degrees of heading change.
- **Vertical separation.** The wingman immediately telegraphs nose position and turns towards Lead; PCL MAX will likely be needed to hold speed; he may need to adjust G to fly directly above or below Lead; minimum 300 ft vertical (Fig 16.21). Training environment: positive separation and a 180-degree heading crossing angle as they merge (para 64).
- **Energy.** Energy is lost or gained in making the miss. Compensate afterwards: for example, if the wingman climbed to miss Lead at the start, he descends after crossing to get the energy back. Doing this minimises geometry errors at the end (para 64). In the tactical environment add altitude separation as they cross (the SMM cites Fig 16.20; Fig 16.21 is meant).
- **Roll-out.** 180 degrees of heading change, in LAB, on the opposite physical sides (the aircraft have swapped sides of the track).
- **Correction.** The wingman "must continue to crosscheck Lead throughout the turn to adjust G for spacing & fix any errors upon roll-out" (Fig 16.21).
- **Steps:** 1. Call. 2. Both roll in about 60 degrees of bank / 2 G towards each other. 3. Wingman telegraphs the nose, sets 300 ft or more vertical offset; PCL MAX if needed. 4. Pass at about 70-90 degrees of heading change each, a heading crossing angle of about 180 degrees as they merge (para 64). 5. Both go to 70/3; wingman descends or climbs to regain energy. 6. Roll out after 180 degrees in LAB; fix spacing and sweep.
- **Spacing check (guess, my arithmetic, 240 KTAS):** a 2 G circle has a radius of about 2,940 ft; a 3 G circle about 1,800 ft. Turning in towards each other and passing at about 80 degrees (5,000 ft apart) the pair come out about 9,500 ft minus the starting spacing apart: 4,500 ft after starting at 5,000 ft, 3,500 ft after 6,000 ft. That is the reason the wingman needs to adjust G to get the final spacing right.

### 4.9 G-warm (G-awareness), 2-ship

- **When.** Before any manoeuvring above 3 G. Flown from LAB at 220 KIAS minimum (SMM 16.22 para 70, smm.txt:8467). Fuel and tank balance checks first (2 CFFTS Orders B2 ch8 p.102-103 para 22e: same fuel plus or minus 30 lb, tanks within 50 lb, reply "same, balanced").
- **Calls and steps** (para 70-71, smm.txt:8467-8485; Fig 16.26):
  1. Lead: "VENOMS, STAND-BY FOR G-WARM". All select PCL MAX, check fuel, complete checks.
  2. Once at 220 KIAS, each calls ready with fuel in order: "VENOM 21, READY WITH 800 AND BALANCED"; "VENOM 22 READY, SAME, BALANCED".
  3. Lead: "[manual text left out; see the page cited], flown at 3 G.
  4. After the turn, both do a 5-second push to about 0.5 G ("push over").
  5. When Lead sees the wingman level, Lead: "VENOMS, HOOK (L/R)". Both fly a 4 G energy-sustaining hook with PCL MAX, which may need a slight descent.
  6. When both crews are satisfied (a few seconds) the wingman calls "22 COMPLETE" (everyone in aircraft 2 feels ready).
  7. Lead: "VENOMS IN PLACE 90 (L/R)" back to the original heading, a standard 3 G energy-sustaining turn (Fig 16.26 labels the last turn 70/3).
- **Spread 4 G-warm** is "largely carried out the same way", with per-aircraft calls and more care for look-out; everyone's job is to fly accurate G and headings in the turns and on roll-out and to keep separation from the aircraft ahead (SMM 16.44 para 120, smm.txt:8953; AFM8 p.16). Start wide (about 6,000 ft), first 90 towards #2, full power on command, tighten toward 4,000 ft afterwards.
- **Conflict:** Orders limit formations of more than two to 3 G normally (B2 ch8 p.97 para 1b), but the 4-ship G-warm repeats the 4 G hook. ASK.

### 4.10 Turns that are not 45 or 90 (modified delayed turns) and the low-level timing

(SMM 17.4 paras 16-19, smm.txt:9151-9190; "TAC NAV")
- Turns of 30 degrees or less: check turns, with the wingman repositioning to minimise loss of mutual support.
- Over 30 up to 70 degrees: "modified delayed 45". Over 70 and under 110: "modified delayed 90". Over 110: one delayed turn, or a combination of several.
- For turns smaller than the 90 or 45 (for example 75 on a delayed 90) the second aircraft turns later; for larger, earlier (para 17).
- Lead's wing flash: about 17 s before the turn point for a delayed 90, about 35 s for a delayed 45; as a rule of thumb 1.1-1.3 NM before the turn point for a 90 and 2.1-2.3 NM for a 45 (para 18). The "turn point" is not defined; the numbers fit about 240 kt ground speed. **(guess)** My own geometry (section 8) gives a wait of (spacing / speed) x cot(half the turn angle) between the first aircraft starting to turn and the second starting: for 5,000 ft apart at 240 kt, about 12 s for a 90 and 30 s for a 45, which is about 5 s less than the 17 s and 35 s in the SMM in both cases. A constant 5 s gap is believable as flash-to-roll-in time, but this is a guess.
- The wingman anticipates upcoming turns from the route timing, and regains LAB as soon as possible after roll-out; he must be in the right position before a turn (para 19). Wingman makes the miss, going high at low level (para 20).
- Before turning, clear into the turn; at low level also check the old six, new six and new twelve o'clock; look away from clearing the front for no more than 3-5 s; [manual text left out; see the page cited]; if the aircraft starts to descend in the turn, reduce bank first, then add G (paras 21, 23).

### 4.11 Rejoins from LAB

(SMM 16.20 paras 65-67, smm.txt:8390-8450.) Unless told otherwise the wingman first rejoins to fighting wing.
- **Straight-ahead rejoin.** Lead calls "(call sign) ... FIGHTING WING" or rocks the wings once and holds heading. #2 turns slightly into Lead to set a rejoin line to a fighting wing position on the same side he was on in LAB; his last vector must clearly aim away from Lead. If echelon is called he goes through fighting wing and aims away from Lead on the final vector, which leaves room for misjudged overtake.
- **Turning rejoin.** Lead may turn into or away from #2, holds constant bank and IAS, calls the same words [manual text left out; see the page cited] at a briefed speed. If Lead turns away, #2 crosses Lead's turn circle for a normal rejoin line with ample closure. If Lead turns toward #2, #2 turns aggressively to point at Lead, rolls out and watches; when a definite increase in line of sight shows, he reverses to capture fighting wing and lines up the fuselage with Lead's.
- **Hot turning rejoin straight to echelon** must pass through the fighting wing position (para 66; Fig 16.25) to leave an overshoot lane.
- **Lead's part.** Tailor the rejoin to the wingman's experience; a small check turn away from the wingman before the rejoin helps a novice; a wingman too far ahead of normal needs a correction before the rejoin (para 67).
- **Tac nav.** Rejoins from LAB or FW can simply collapse to close formation through route (SMM 17.5 para 34, smm.txt:9344).
- **4-ship.** Lead pauses, lets #2 build closure, then turns gently towards #2. #2 does a turning rejoin to FW spacing and keeps the stack; #3 and #4 do "cold" turning rejoins; #3 must keep positive separation from #2, and in the box #4 from #3 (AFM8 p.19, p.25).

### 4.12 Spread 4 manoeuvres

Approved: [manual text left out; see the page cited] (SMM 16.43 para 118, smm.txt:8940). All turns are started by comms (para 119). Timing stays the same as the 2-ship, with extra care for accurate headings and for looking at the aircraft you are turning towards, because [manual text left out; see the page cited]. Altitude separation is the main means of safe separation where flight paths cross (note after para 119). AFM8 p.17: [manual text left out; see the page cited]; stack before turns; tight side of LAB spacing; precise 70/3 on the hook; avoid freeze calls mid-turn (the stack and look-out are the safety).
- **Delayed 90** (Fig 16.33 right panel, Fig 16.34 left panel; AFM8 p.17). Order of turning: outside aircraft first. For a right turn from Spread-4 East: #2, Lead, #3, #4. For a left turn: #4, #3, Lead, #2. Each aircraft completes a standard 90-degree LAB turn "followed by" the next one inboard. Reading (guess): each uses its outboard neighbour as its LAB partner and times on that neighbour, since #3 and #2 fly LAB off Lead and #4 off #3 (para 116). (The figure text for the left turn says "to the Right"; it is a caption slip.)
- **Delayed 45** (Fig 16.34 right panel; AFM8 p.18): the aircraft on the outside (#2 for a right turn) completes a standard 45; all remaining aircraft each do a 10-15 degree check turn, then Lead, #3 and #4 complete a standard LAB 45. Monitor your check-turn geometry so you pass ahead of the reference aircraft. Stack required.
- **In-place, check, hook:** as the 2-ship; see 4.4-4.6.
- **G-warm:** 4.9.

### 4.13 Offset box manoeuvres

(SMM 16.41 para 112, smm.txt:8902-8910; Figs 16.30-16.32; AFM8 p.23-24.)
- **Delayed 45/90 and hook:** #3 and #4 delay their turn by 10-15 s and "miss" #1 and #2, so the second element flows into the correct trail position (para 112a). Fig 16.30: "#3 to delay turn by 10-15 s to ensure geometry on roll-out; #4 will turn at the standard LAB turn cue". AFM8 p.23: Lead commands the turns for the first element; #3 calls the turns for the second; make prompt corrections on roll-out using power and altitude; re-establish the stack. These two statements differ slightly (text: both delay; figure and AFM8: #3 delays, #4 uses the standard cue). ASK.
- **In-place, shackle and check turns:** no delay (para 112b). Note that the shackle appears here but not in Spread 4's approved list.
- **Delayed 45 (Fig 16.31):** #2 does a standard 45; Lead does a 10-15 degree check turn into #2; the second element delays 10-15 s and repeats the same flow, rolling out with the offset.
- **Hook (Fig 16.32):** the rear element delays 10-15 s; the trailing element must keep clear of the lead element during the turn. Outside aircraft in each element align fuselages with the inside one at 90 degrees.

### 4.14 Other LAB items in the tac nav chapter (not turns, but LAB-related)

- LAB descent: straight ahead; the wingman waits for Lead to start; brief terrain and the 500 ft MSL altitude; keep Lead at or slightly below the horizon; at 1,000 ft AGL both concentrate on terrain clearance (SMM 17.4 para 14, smm.txt:9134).
- LAB station keeping, low level: wingman positions Lead on or slightly below the horizon (para 15).
- Target run-in "actioning": 4 NM (1 minute) before the target the wingman does an energy-sustaining 90 degrees perpendicular to track at 240 kt ground speed and calls "22 ACTIONING"; about 20 s later (5-10 s after passing Lead's tail) he turns direct to the target, which puts Lead about 8 or 4 o'clock (para 28, smm.txt:9258). Post-target: Lead climbs with about 90 degrees of turn to the egress heading, gains about 1 NM lateral, then turns fully; the wingman climbs and turns to the egress heading about 1,000 ft below Lead; Lead should be about 11 or 1 o'clock high; the wingman calls visual and rejoins to LAB (para 29, smm.txt:9277).
- Tac Initial / battle break ("double attack"): formation at initial in a closer than normal LAB at about 1,000 ft and 220 KIAS; both break at the same time; the wingman does a normal overhead break and aims to roll out behind and slightly outside Lead (SMM 17.5 paras 36-37, smm.txt:9359-9372).

---

## 5. How spacing and timing are managed overall

1. **The cue rule.** The inside aircraft's start depends on the lateral width: "closer ... turn early; wider ... delay" (SMM 16.19 para 54 NOTE). The visual cue for the 90 is the other aircraft at about 5 or 7 o'clock; for the 45, after the other has passed through the tail at about 5 or 7 o'clock; for turns that are not 90 or 45, "later for smaller, earlier for larger" (SMM 17.4 para 17).
2. **Pre-turn.** The wingman must be in correct LAB before a turn starts (SMM 17.4 para 19). In the 4-ship, set the stack before the turn.
3. **In the turn.** Cross-check Lead; adjust G and/or anticipated heading to head off spacing errors (SMM 16.19 para 52 NOTE). Outside aircraft in a hook: adjust G to align fuselages at the 90-degree point.
4. **On roll-out.** "Quickly fix any spacing or sweep errors" (every turn figure note); in the 4-ship with power and altitude (AFM8 p.17, p.23).
5. **If early or late.** The sources do not give a recovery procedure for "I turned too early / too late" beyond the cue rule and the roll-out fix. A possible tool: a shackle can reposition the wingman on the other side or fix LAB geometry that needs correcting at once (SMM 17.4 para 24); a check turn into or away from the other aircraft shifts him ahead or aft (SMM 16.19 para 58; 16.20 para 67). ASK.
6. **If it all goes wrong.** Terminate (any member; all acknowledge in order); Knock-it-off; FREEZE during 4-ship formation changes (SMM 16.17 paras 45-46, 16.32 para 85; Table 16.1; AFM8 p.30). [manual text left out; see the page cited] (AFM8 p.18 item 6).
7. **Tactical nav time.** A different kind of timing: errors against the planned time are fixed by airspeed (under 30 s), by turning on time and using DCT-TO (30-60 s, about 60 s of error taken out on a 90-degree turn), or by shortcut legs (over 1 minute), always with minimum impact on formation integrity (SMM 17.4 paras 24-26, smm.txt:9204-9235). Track errors: any heading corrections by check turns kept small; formation integrity comes first.
8. **Look-out first.** The 4-ship briefs repeat that precision is for safety: Mission Aim "precise flying with expedited corrections" (AFM8 p.4).

---

## 6. Every number

| What | Value | Unit | Speed kind | Source |
|---|---|---|---|---|
| LAB lateral spacing | 4,000 to 6,000 | ft | - | SMM 16.18 para 49 (smm.txt:8202) |
| LAB sweep | 0 to 10 (wingman behind Lead's abeam line) | deg | - | SMM 16.18 para 49; Fig 16.11 |
| LAB vertical | plus or minus 2,000 | ft | - | SMM 16.18 para 49 |
| LAB speed | 220 | kt | KIAS | SMM 16.18 para 49 |
| Spread distance where cover gets very hard | greater than 9,000 | ft | - | SMM 16.18 para 49 |
| Mid block / low block lead speed | 200 / 220 | kt | KIAS | Patrick's ruling 4 Oct, not a manual |
| LAB turn | 3 G, about 70 deg bank | G / deg | - | SMM 16.18 para 50; Figs 16.15-16.21 notes |
| LAB turn power | PCL MAX (para 50) or as required to hold airspeed (paras 52, 59, 60) | - | - | SMM 16.18-16.19 |
| Delayed 90 turn angle | 90 | deg | - | SMM 16.19 para 52 |
| Delayed 90/45 cue | other aircraft at 5 or 7 o'clock | clock | - | SMM 16.19 para 52, 54, Figs 16.15-16.17 |
| Delayed 45 turn angle | 45 (30 to 90 equally learnable) | deg | - | SMM 16.19 paras 55-57 |
| Check turn | 30 or less ("Check 20" in R/T examples) | deg | - | SMM 16.19 para 58; Fig 16.18; Orders p.103 |
| In-place turn | more than 30 to 90 | deg | - | SMM 16.19 para 59; Fig 16.18 |
| Hook | 180 | deg | - | SMM 16.19 para 60 |
| Hook alignment check | at the 90 deg point | deg | - | Fig 16.19; SMM 16.45 para 121 |
| Shackle turn | about 45 each way | deg | - | SMM 16.19 para 61 |
| Cross turn first part | about 90 deg at 2 G (Fig: 60/2 or as required) | deg / G | - | SMM 16.19 para 64; Fig 16.21 |
| Cross turn second part | 3 G (Fig: 70/3) to 180 total | G | - | SMM 16.19 para 64; Fig 16.21 |
| Minimum crossing separation | 300 (vertical and/or horizontal) | ft | - | SMM 16.13 para 31; Table 16.1; Orders B2 ch8 p.98 para 4 |
| Shackle / cross vertical | minimum 300 | ft | - | Fig 16.20, 16.21 |
| Rejoin from LAB, turning | lead 30 deg bank, briefed speed | deg | - | SMM 16.20 para 65b |
| Rejoins (4-ship briefs) | 30 deg bank, 200 | deg / kt | KIAS | AFM7 p.21 |
| Rejoin speed on departure | 200 level, 180 climbing | kt | KIAS | AFM8 p.11 |
| G-warm speed | minimum 220, PCL MAX | kt | KIAS | SMM 16.22 para 70 |
| G-warm turns | in-place 90 at 3 G; 5 s push to about 0.5 G; hook at 4 G; in-place 90 at 3 G | G / s | - | SMM 16.22 para 71; Fig 16.26 |
| G-warm fuel match | same within 30 lb, tanks within 50 lb | lb | - | Orders B2 ch8 p.102-103 |
| Offset box second element | 6,000-8,000 (1.0-1.2 NM) text; 8,000-12,000 figures | ft | - | SMM 16.41 para 109; Fig 16.30; AFM8 p.21 |
| Offset box delay for #3 (and #4) | 10 to 15 | s | - | SMM 16.41 para 112a |
| Spread 4 neighbours | 4,000 to 6,000 | ft | - | SMM Fig 16.33 |
| Spread 4 #2 to #3 / #2 to #4 | 8,000-12,000 / 12,000-18,000 (up to about 3 NM) | ft | - | SMM Fig 16.33 |
| Spread 4 check turns in 45s | 10 to 15 | deg | - | SMM Fig 16.34; AFM8 p.18 |
| Altitude stack (AFM) | #2 +300, Lead 0, #3 -300, #4 -600 | ft | - | AFM8 p.14 |
| Altitude stack (SMM example) | #2 7,750; Lead 8,000; #3 8,250; #4 8,500 (250 ft steps) | ft | - | SMM Fig 16.33 |
| Spread-4 wide start / tighten | about 6,000 / toward 4,000 | ft | - | AFM8 p.16 |
| Fighting wing (for LAB entry) | 30-60 deg sweep, 500-1,000 ft | deg / ft | - | SMM 12.29 para 69 (smm.txt:5560) |
| Tac Initial / double attack | about 1,000 ft apart, 220 | ft / kt | KIAS | SMM 17.5 para 36; WFO S2 art 406 para 4c |
| Double attack maximum in GULAP / Battle Break run-in | 1,000 | ft | - | WFO S2 art 406 para 3c |
| 4-ship second element at Tac Initial | about 3,000 behind | ft | - | WFO S2 art 406 para 4f |
| Tac nav marshal | 200 in LAB or FW | kt | KIAS | SMM 17.4 para 9 |
| Tac nav run-in groundspeed | 240 | kt | ground speed | SMM 17.4 paras 9, 28 |
| Wing flash before turn point (delayed 90 / 45) | about 17 / about 35 | s | - | SMM 17.4 para 18 |
| Wing flash before turn point (distance) | 1.1-1.3 / 2.1-2.3 | NM | - | SMM 17.4 para 18 |
| Modified delayed turn bands | 30 to 70 = modified 45; 70 to 110 = modified 90; over 110 single or combined | deg | - | SMM 17.4 para 16 |
| Time errors (tac nav) | under 30 s airspeed; 30-60 s turn on time; over 60 s shortcut | s | - | SMM 17.4 para 26 |
| Actioning | 4 NM (1 min) before target; turn direct about 20 s later | NM / s | ground speed 240 kt | SMM 17.4 para 28 |
| Lateral gain after target | about 1 | NM | - | SMM 17.4 para 29 |
| Wingman after target | about 1,000 below Lead | ft | - | SMM 17.4 para 29 |
| Look-out scan | about 3/4 of time primary; scan blocks 3-5 s | - / s | - | SMM 16.14 para 33; 17.4 para 23 |
| G limits | Lead +4, wingmen +5 | G | - | Table 16.1; Gen Book p.11 |
| G, more than 2 aircraft | normally 3 G, 90 deg bank, 45 deg pitch (more for some forms) | G / deg | - | Orders B2 ch8 p.97 para 1b |
| Mutual blind area | about 1.2-1.8 NM behind at 4,000-7,000 ft; blind line 20 deg (blurry, guess) | NM / deg | - | SMM Fig 16.14 |
| Tactical formation weather | ceiling 2,000 ft AGL, 5 miles, discernible horizon | ft / mi | - | Orders B2 ch8 p.98 para 5 |
| Training rule weather | discernible horizon, 5 NM flight vis, 5,000 ft between layers, 2,000 ft vertical / 1 NM horizontal | - | - | Table 16.1; Gen Book p.11 |
| Hard deck | 3,000 AGL or 2,000 above cloud; 6,000 AGL with solo students | ft | - | Table 16.1 |
| Harvard Low / Mid / High block | 6,000-10,000 / 10,500-15,500 / 16,000-FL190 | ft ASL | - | WFO S2 Harvard airspace para 13; Gen Book p.12 |
| 220 KIAS in KTAS | 240 at 7,000 ft | kt | KTAS | Gen Book p.23 note 4 |
| Fuel, for the G-warm call | e.g. 800 lb | lb | - | SMM 16.22 para 70 |
| Lost wingman (IMC) | 10 deg, 10 s, 10 deg bank; outside rolls out 20 s | deg / s | - | SMM 12.38 para 94; Gen Book p.10 |

---

## 7. ASK list: sources disagree or are silent

1. **Altitude stack direction and step size.** AFM8 p.14: #2 high (+300), Lead 0, #3 -300, #4 -600; text "low to high 4, 3, 1, 2" (AFM8 p.15; AFM7 p.15). SMM Fig 16.33 example: #2 7,750 / Lead 8,000 / #3 8,250 / #4 8,500: opposite sign, 250 ft steps; SMM says #2 sets the stack and the others go to the opposite block. Same principle, different numbers. Which does the sim draw? **(guess: AFM8, the newer squadron SOP.)**
2. **Offset box trail distance.** SMM text 6,000-8,000 ft (1.0-1.2 NM); SMM Fig 16.30 arrow and AFM8 p.21 picture 8,000-12,000. Patrick ruled 7,000 plus or minus 1,000 (follows text). The two sides stay recorded.
3. **Offset box: who delays.** SMM para 112a: #3 and #4 delay 10-15 s. Fig 16.30 and AFM8 p.23: #3 delays 10-15 s, #4 turns at the standard LAB cue. And the figures show a right turn only.
4. **Power in turns and the speed loss.** SMM para 50: PCL MAX with a minor airspeed loss to regain afterwards; paras 52, 59, 60 and the figure notes: "energy sustaining", PCL as required. No number for the loss. The T-6A sustained-turn chart (`manuals/images/t6a-sustained-turn-rate.png`, USN T-6A, not Harvard II) shows well under 3 G sustainable at 220 KIAS at 8,000-10,000 ft, so speed will bleed in a real 3 G turn **(guess, read off a picture)**. Needs a simple bleed rate from Patrick.
5. **Roll rate, roll-in time, reaction time, correction rate.** None in any source. "Prompt", "quickly", "immediately", "expedited". What the sim uses is a guess.
6. **How far a wingman moves for a given error** (heading degrees for wide/tight, torque for fore/aft, G tweak size in a hook). Only the 10-15 degree check in the 4-ship 45s is given.
7. **Delayed 45 end state.** SMM para 56 and Figs 16.16, 16.17: ends "in LAB". The 4-ship figures show a slanted line with "fix on roll-out". The research file records Patrick's wish for "trail" (TS-Q1); I could not find that wording in a manual. My geometry (section 8) says if the second aircraft waits (spacing / speed) x cot 22.5 degrees the pair end exactly abeam, so the manuals' LAB claim is geometrically fine.
8. **Cue wording differs between text and figure.** Text: the inside aircraft starts "until the other reaches the 5 or 7 o'clock position" (para 52); the text does not say which side goes with which direction, the figure and my geometry give 5 for a left turn and 7 for a right turn. Fig 16.15: the inside turns "before" the other passes through the tail and reaches about 7 or 5; Fig 16.16 and 16.17: "after" it passes through the tail and reaches about 7 or 5, and the 45 figure draws the other aircraft on the opposite clock side from the 90 for the same turn direction. My geometry: at 5,000 ft apart the ideal 90 start comes with the other at about 6:40 for a right turn (about 200 degrees from the nose, left rear, not yet through the tail); for a 45 right turn about 4:35 (about 137 degrees, right rear, already through the tail) **(guess)**. So "5 or 7 o'clock" is a rough visual cue, not a precise one, and a sim that cues the 45 by the 90's clock side would be on the wrong side.
9. **Spread-4 G-warm hook at 4 G** versus Orders 3 G for formations of more than two aircraft (B2 ch8 p.97). The SMM calls the 4-ship G-warm "largely the same" as the 2-ship.
10. **Wing flash** is undefined. Hand and signal tables use "wing rock" and "rock the wings".
11. **How the wingman picks the LAB side, and the Spread-4 entry call.** Not stated for LAB. For fighting wing "No. 2 sets the side" (AFM7 p.14). Spread-4 East/West is a layout, but the call that selects it is not written (the box has "OFFSET BOX EAST/WEST", para 110).
12. **Torque / power setting for LAB cruise** is not given; the lead keeps power margin for the wingman only in close formation (SMM 12.36 para 87c(3): avoid full and idle power) and in the formation climb (85-90%, SMM 12.16 para 35).
13. **Hook and cross turn: which side each aircraft ends on.** Text says "in LAB" only. My reading of the figures and arithmetic **(guess)**: in the hook both fly the same-size circle and the wingman stays on the same physical side of Lead's track (he is west of Lead before and after); delayed turns put him on the opposite side of the formation (para 52 says so); the shackle swaps sides (the X); in the cross turn the aircraft swap physical sides.
14. **"No crossing flight paths"** (Table 16.1) versus LAB crossing turns (300 ft rule). The SMM does not reconcile them.
15. **Mutual blind area numbers** (Fig 16.14) are unreadable at this resolution.
16. **Mid-block LAB speed 200 KIAS** is only Patrick's ruling; the manuals say 220 for LAB and G-warm, 200 only for marshal, rejoin and similar.
17. **The 9,000 ft mutual-support limit** (para 49) against Spread-4 outer pairs 12,000-18,000 ft apart (Fig 16.33): no comment from the SMM.
18. **Contract between lead and wingman** is referred to but not written (SMM 17.1 para 2).
19. **Check-turn direction**: SMM 16.17 shows "check towards" for the wingman in the 45 with check but never states which way a plain check turn goes relative to the other aircraft.

---

## 8. Own geometry check (guess; standard aerodynamics, not a source)

Assumptions: equal TAS and G, no wind, instant roll, 240 KTAS (405 ft/s; 250 KTAS gives results 3-4 per cent smaller in time). Level turn radius = V squared / (g x square root of (n squared minus 1)).

| Item | Value |
|---|---|
| Bank at 2 G / 3 G / 4 G | 60 / 70.5 / 75.5 deg |
| Radius at 2 G / 3 G / 4 G | about 2,940 / 1,800 / 1,320 ft |
| Turn rate at 2 G / 3 G / 4 G | about 7.9 / 12.9 / 17.6 deg per s |
| 90 degrees / 180 degrees at 3 G | about 7.0 s / 14.0 s |
| Wait between the first aircraft starting to turn and the second starting, so that both end exactly abeam at the old spacing S on the opposite sides | S / V x cot(half the turn angle) |
| That wait, 90-degree turn, S = 4,000 / 5,000 / 6,000 ft | 9.9 / 12.3 / 14.8 s |
| That wait, 45-degree turn, same spacings | 23.8 / 29.8 / 35.8 s |
| Where the other aircraft is at that moment (S = 5,000 ft, right turn) | 90: about 6:40 (200 deg off the nose, left rear); 45: about 4:35 (137 deg, right rear). Mirror for a left turn |
| Using a fixed 7 o'clock cue for a 90 (S = 5,000 / 6,000 ft) | turn comes about 1.2 / 2.2 s early; end 4,480 / 5,120 ft apart with the wingman about 520 / 880 ft ahead (about 6.6 / 9.8 deg of "negative" sweep) |
| Hook, same G for both | lateral spacing unchanged; each aircraft is displaced about 3,600 ft sideways at the end (the diameter) |
| In-place 90 into the wingman | the wingman is dead ahead of Lead by the old spacing |
| Check turn of angle t | moves the other aircraft by about S x sin t forward (turn into him) or aft (turn away) |
| Cross turn, 60/2 first, 70/3 after | ends about 9,500 ft minus S apart abeam (S = 4,000: 5,500; 5,000: 4,500; 6,000: 3,500); they pass at about 70-90 deg of heading change |
| Shackle | straight leg between the two 45-degree turns about (S minus 1,060) / 286 s, about 14 s at 5,000 ft |
| Sweep offsets (10 deg) | 705 / 880 / 1,060 ft aft of abeam at 4,000 / 5,000 / 6,000 ft |

The wait formula equals the "step = spacing / speed x cot(half the turn)" the existing extract says the tool already uses (`formation-and-turn-numbers.md`, D44), so the tool's delay agrees with the geometry. The wait is longer for wider spacing and shorter for bigger turns, which is exactly the SMM's "closer turn early, wider delay" and its "bigger than 90/45 turn earlier" (SMM 17.4 para 17).

---

## 9. Checks of the earlier extracts (what is wrong or thin)

Checked: `manuals/formation-and-turn-numbers.md`, the Turn Sim rows in `manuals/README.md`, `reset/1-requirements/agents/research-turn-sim-briefs.md`, `.../turn-sim-manoeuvre-catalogue.md`.

**Wrong or misleading**
1. `manuals/README.md`, Fig 16.33 row: "Lead-#3 8,000-12,000" is wrong. The figure shows 4,000-6,000 for each neighbouring pair; 8,000-12,000 is #2 to #3 and 12,000-18,000 is #2 to #4. Total up to about 3 NM. (Checked on the PDF.)
2. `manuals/README.md`, Fig 16.15 row: "Away" / "Towards" there are the figure panel titles (wingman's view). The SMM text uses "into the wingman" / "away from the wingman" from Lead's view, with the opposite meaning for the same flying. Both are right; a reader will confuse them.
3. `formation-and-turn-numbers.md` says LAB turns are "3 G level, PCL max, energy-sustaining (para 50)". Para 50 says PCL MAX with a minor speed loss; paras 52, 59, 60 say "PCL as required to maintain airspeed". That difference matters for a speed model.
4. The catalogue and brief extracts say the altitude stack is 300 ft with "4, 3, 1, 2" (right for AFM) but not that the SMM's own example has 250 ft steps and the opposite order.
5. Both extracts state the 3 G limit for more than two aircraft but not the clash with the 4 G Spread-4 G-warm hook.

**Thin or missing**
6. SMM 17.4 paras 16-19: modified delayed 45/90 for non-standard angles; wing flash timing (17 s, 35 s; 1.1-1.3 NM, 2.1-2.3 NM); the rule that the wingman must be in the right LAB before a 45. Not in any extract.
7. SMM 16.11 para 26: "turning the wrong way in line abreast" as a named cause of a split, with the BVR rejoin as the fix.
8. SMM 16.14 look-out technique (3/4 of time on the primary sector, 3-5 s blocks) and 17.4 para 23 ([manual text left out; see the page cited]).
9. Gen Book p.23 note 4: 220 KIAS = 240 KTAS at 7,000 ft (not in extracts). The extracts' "about 245-255 kt at 8,000-10,000 ft" is close to my own 248-256.
10. "Double attack" is only in the WFO (Tac Initial and Battle Break spacing, MTCA counting); the extracts only mention it in the E10 catalogue row and do not say it is not in the SMM.
11. SMM Table 12.1 hand signals for LAB ("double wave away" to move to LAB; wing rocks to close from LAB) are not in the extracts.
12. EFIG has no LAB teaching slides; it has block briefs only (EFIG p.460 AFM1 "Line abreast", p.94, p.98, p.100 sequence lists) and "Leading Wingwork" (p.362-363) with [manual text left out; see the page cited]. Nothing numeric.

**Checked and right** (spot-checked against the text): lateral/sweep/vertical/speed numbers; check 30 / in-place 30-90 / hook 180 / shackle 45 / cross turn 2 G then 3 G; G-warm sequence; Spread 4 flies LAB off Lead and #3; offset box 10-15 s; the 300 ft crossing rule; Patrick's Q6-Q9 rulings are consistent with the text.

---

## 10. What I could not read or was unsure of

- SMM figures are pictures. I read the line-abreast figures (16.11-16.21, 16.26, 16.30-16.34) at high resolution; the mutual blind area figure (16.14) is a blurry low-resolution raster, and its labels are my best read. I did not open Figs 16.22-16.25 (rejoin pictures), 16.35, 16.36, or any of Chapter 17's figures separately (I used the AFM8 equivalents for the 4-ship pictures).
- AFM7 PDF: read as text only; the pages that matter for LAB (Spread 4 from FW, G-warm, TRJ) are the same as in AFM8, which I opened as pictures (AFM8 p.14, 16, 17, 18, 20-24).
- The EFIG slides are mostly lists; I found no LAB teaching content beyond the block briefs.
- The CFAFM was not opened (controlled). The SMM's limit references to it were not followed.
- The meaning of "wing flash", of the "contract", and of the sight-picture references in Figs 16.12/16.13 are not in the text I could read.
- Patrick's TS-Q1 "trail" wording for the Delayed 45 is quoted second-hand from the research file; I did not find it in a manual.
