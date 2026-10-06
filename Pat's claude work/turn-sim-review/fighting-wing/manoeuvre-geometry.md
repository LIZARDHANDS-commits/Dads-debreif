# Fluid manoeuvring and fighting wing: geometry from the manuals

Read-only research, 4 Oct 2026 (Turn Sim thread). Rule from Patrick (18:57Z, 19:06Z): the manuals and their pictures drive the geometry, no assumptions; conflicts go to him. Pages only, no manual text copied. Stays in project files, never the repo. Not used: CFAFM.

Cite style: SMM chapter.section para N, plus the split-PDF part/page where I looked at the picture ("p6/7" = SMM split PDF part 6, page 7). EFIG = PDF page. Brief = Four Plane Brief PDF page. Orders = 2 CFFTS Orders Jul 26 (page from the text footers, check against the PDF). "Not in the manuals" means I searched SMM, EFIG, Gen Book, both briefs and the Orders text and found nothing.

Pictures in /mnt/project-files/manuals/images/ that I opened: smm-fig12-19, 12-24, 12-1, 12-2, 16-9, 16-10, 16-29, efig-p442, p445. Pictures not in that folder, rendered from the manual PDFs just to look (nothing saved): SMM Figs 12.20-12.23 (p5/23-24), 7.2-7.4 (p2/49-51), 14.1 (p6/7), 14.2 (p6/12); EFIG p.138, 143, 172, 420, 436 (the same figures as the SMM ones, with a few extra labels); Brief AFM7 p.14, 17; AFM8 p.20, 21.

## 1. Pictures in the manuals for fluid manoeuvring

There is no SMM figure of the fluid manoeuvring cone or bubble, none of a wingover, none of a level turn or climb or descent, and none of the standard sequence as a whole. SMM 16.17 (p7/4-5) has text only. The nearest pictures are the fighting wing figures (12.19-12.23) and Fig 16.10. The loop, barrel roll and Cuban eight pictures are the pilot's single-aircraft pictures, with no wingman.

## 2. Fighting wing (FW): position, cone, bubble

**Sources:** SMM 12.29 paras 68-69 (p5/22, Fig 12.19); SMM 12.30 paras 70-74 (p5/23-26, Figs 12.20-12.25); EFIG p.390-391; Brief AFM7 p.14; SMM 16.15 paras 36-38; SMM 16.38-16.39 paras 104-107 (p7/27-28, Fig 16.29).

**Position (SMM 12.29 para 69; EFIG p.391):** No. 2 holds a 30 to 60 degree sweep from Lead at 500-1,000 ft. EFIG p.391 says "30-60 sweep (ideally)", references nose-to-wingtip and nose-to-mid-wing (30 and 60) and the flat part of the panel plus fire lights for range. AFM7 p.14: work toward the near end of the range; be where Lead can see you except in turns; No. 2 sets the side.

**What Fig 12.19 shows that the text doesn't:**
- Lead's wing line (a horizontal dotted line through Lead) is the zero line. "30 degrees sweep" and "60 degrees sweep" are angles measured back from that wing line. So 60 sweep is the edge nearer Lead's tail (30 degrees off the tail) and 30 sweep is the edge farther from the tail (60 degrees off the tail). The text never defines "sweep"; as drawn, the 30-60 band is the same set of positions as 30-60 degrees off the tail.
- The wedge is bounded by two arcs: 500 ft inner, 1,000 ft outer, both radial from Lead. One wingman is drawn near the middle (about 45).
- The cockpit-view insets show the 30 and 60 sweep lines on Lead's wing from the wingman's view.

**Fig 16.10 (p7/4):** wingman on Lead's turn circle: aspect = X, HCA about 2X, LOS 0, closure 0.

**500 ft bubble (FW):** SMM text puts the bubble in the fluid rules (16.17 para 44c). Gen Book p.11 and SMM Table 16.1 (p7/17-18) list "FM/high-aspect, 500 ft bubble". No FW-specific bubble number found.

**Three and four aircraft:** SMM 16.38 para 104: all [manual text left out; see the page cited]; Nos. 3 and 4 "alternating" on the side opposite No. 2. AFM7 p.14: [manual text left out; see the page cited] the opposite side; moderate or steep turns collapse toward Lead's six, No. 3 must clear No. 2. Fig 16.29 (SMM p7/27, no numbers, not to scale): Lead at the top, No. 2 right and behind, No. 3 behind and slightly left of Lead's line, No. 4 left and behind No. 3. AFM7 p.14 picture: each aircraft drawn 500-1,000 ft behind the one in front, the arrows measured along Lead's track (not radial); No. 2 one side, Nos. 3 and 4 stepped back on the other.

**Entry to FW (not the fluid piece):** from echelon or finger, No. 2 normally goes to the same side as in close formation (SMM 16.38 para 105). Echelon to FW: EFIG p.390 only says the wingman keeps visual separation. Time to get there: not in the manuals.

**Limits that apply:** Lead not above +4 G, positive G always, in FW and fluid; two aircraft have no bank or pitch limit in FW/fluid; three aircraft likewise; more than three: no bank limit, max 60 degrees pitch, CFAFM G limits (Orders B2 ch 8 para 1a, 1b(4), pp.98). Lead +4 G and wingmen +5 G (Gen Book p.11; SMM Table 16.1).

## 3. Wingman pursuit in a FW turn (the manual's own pictures)

**Sources:** SMM 12.30 paras 71-74, Figs 12.20-12.23 (p5/23-24), Fig 12.24 (p5/25, image smm-fig12-24); Fig 12.25 cockpit views (lag, pure, lead, maintaining distance); SMM 16.16 para 39-41; EFIG p.391.

**Definitions (SMM 12.30):** lead pursuit = flight path projected in front of Lead, Lead in the bottom of the windscreen, normally gives closure and raises aspect (para 72); pure = path onto Lead, Lead mid-windscreen, closure less than lead, LOS zero, raises aspect (para 73); lag = path behind Lead, Lead at the top of the windscreen, reduces closure and aspect (para 74). Aim: fly on or around Lead's turn circle, lead or lag as needed. EFIG p.391: lead pursuit uses bank and pitch to put the path inside Lead's turn circle; lag puts it outside; once in position "go where Lead was and do what Lead did".

**Fig 12.24 (as drawn):** from one point, the lead pursuit curve bends early toward and across ahead of the target's path; the lag pursuit curve swings wide and behind it.

**Figures 12.20-12.23 (the programmer's script, as drawn and labelled):** Lead is the black path, ahead and between the two wingmen, who start at the edges of a grey wedge behind Lead. "Turn away" = green, "turn into" = blue.

| Figure | Case | Turn away (Lead turns away from you) | Turn into (Lead turns toward you) |
|---|---|---|---|
| 12.20 | In position | Collapse to Lead's six by promptly aiming inside the turn circle (lead pursuit); this stops range increasing | Make the miss first (lag pursuit and/or altitude separation), collapsing to six by turning slightly toward Lead; then reverse and capture the turn circle by matching Lead's turn (pure) |
| 12.21 | Stretched (aft) | Aim well inside the turn circle at once (lead pursuit), then use geometry; stops range growing and starts closure | Lead's turn gives a chance to correct: slowly collapse by delaying your turn, then progressively capture the circle (pure) |
| 12.22 | Tight (forward) | Aim at Lead's tail (pure pursuit) and capture the circle; the extra distance travelled fixes the closer range | Make the miss (altitude separation or lag); the box says a climbing turn above Lead or a descending turn below Lead are both good techniques; you will likely end outside the circle because of angular cutoff, so recapture by matching Lead's turn (pure) |
| 12.23 | Turn exit (Lead rolls out wings level ahead) | Tight or high closure: flow out to the outside of the turn, a longer path, to control range and closure. Stretched or range increasing: flow to the inside, the shortest path. Good range, no closure: pick the side you want | same |

**Not in the text, only in these figures:** the climbing-above and descending-below-Lead technique (Fig 12.22 box). design.md section 2 says the manuals do not use high plane and low plane; this figure does, in effect. SMM 12.29 para 69 also lists "utilizing the vertical" and "flowing to the opposite side".

**Lead's turn in these figures:** rate, bank and G are not given. Fig 12.20-12.22 show Lead's path curving once from straight; no numbers.

**Plane of motion:** SMM 16.16 para 39c: when Lead changes from a level turn to a vertical or oblique one, the turn radius may stay the same but the plane changes, so the wingman's path must change too.

**Total G, as the manual draws it (16.16 para 39f, Fig 16.8):** in a 3 G loop total G is about 2 at the bottom, about 3 on the vertical (nose up and nose down), about 4 inverted; rate and radius keep changing.

## 4. Fluid manoeuvring (FM): entry, cone, bubble, rules

**Sources:** SMM 16.17 paras 42-48 (p7/4-5); Brief AFM7 p.17, AFM8 p.19 (the same text); SMM 16.40 para 108; Orders B2 ch 8 pp.98-99 and p.103-104 (calls); Gen Book p.11; SMM Table 16.1.

- **What it is:** an exercise where the wingman reacts to the preceding aircraft and uses lead, lag and pure pursuit to stay inside a defined area behind it (para 42).
- **Sequence:** "a level turn, a loop, two wingovers, and a barrel roll", a "non-regimented sequence", "may be modified" (para 42). The text does not give an order for the five. Briefs list Exercise 1: 60/2 level turn; Exercise 3: wingovers; Exercise 4: barrel roll (max 60 degrees pitch). **Exercise 2 is not listed in either brief and the loop is not named there.**
- **Cone and distance:** "a 60 degree cone behind the preceding aircraft at 500-1000 ft" (para 42). Both aircraft keep the same power. The 30-60 swept position is never needed and "would put the aircraft outside the FM parameters". No picture of the cone exists. Briefs: "work towards 500-750 ft spacing during manoeuvres".
- **Entry (para 43):** first exposure: academic entry from echelon with a 2-second break for spacing; later from FW or line abreast. Constant power throughout. Lead gives an advisory call, wingman acknowledges, Lead starts. A wingman not quite in position uses the first manoeuvre to get there. **Briefs (AFM7 p.17, AFM8 p.19):** Lead starts a 30 degree bank turn in FW, all call ready, then Lead increases to 60 degrees bank and sets PCL MAX. Fuel check and tank balance called first (Orders B2 ch 8 p.103-104).
- **Fluid 4 / four-ship:** SMM 16.40 para 108: same concepts as two-plane, with Orders restrictions (above: no bank limit over three aircraft, 60 degrees pitch max, CFAFM G). AFM8 p.20 "Offset Box via Fluid 4": from FW, Lead calls "FLUID 4, GO"; No. 3 diverges to wide LAB on Lead (6,000 ft, text); Nos. 2 and 4 hold FW on the outside; stack once in position. Picture on that page: Lead and No. 2 fly straight, Nos. 3 and 4 start abreast on the left and fall back along a diagonal; label on the LAB spacing arrow is 4,000-6,000 ft. AFM8 p.21-22 show the in-place 90 and then LAB at 6,000 ft, 6,000+ ft, then trail positions. Four-ship FM rules for the cone and bubble beyond para 108: not in the manuals.
- **Restrictions (para 44):** structural limits plus 5 G at all times; never more than 90 degrees aspect with more than 90 degrees HCA and low LOS while using lead, lag or pure; 500 ft bubble at all times. Gen Book p.11 and Table 16.1 repeat the bubble and the G limits (Lead +4, wingmen +5); both also list "Wingmen make the miss (high if low level)", "Lead remain predictable", "Transmit your intended flight path", [manual text left out; see the page cited]. Orders: Lead not above +4 G and positive G; minimum altitude for formation wingovers/aerobatics in FM 3,000 ft AGL (para 1f); hard deck 3,000 ft AGL (Gen Book p.11; SMM 14.6 para 16).
- **Terminate (paras 45, 46, 48):** "TERMINATE" if a restriction is broken, any member can call, all aircraft acknowledge in order, a rejoin is set up. "TERMINATE FOR POSITION": wingman outside the parameters and cannot regain them quickly; Lead acknowledges and flies a predictable turn; wingman repositions, calls "Cleared to Manoeuvre", Lead restarts. At the end, FM normally ceases with a terminate; Lead recovers to level and signals [manual text left out; see the page cited] (para 48). AFM7 p.17: terminate calls on completion; Lead flies a [manual text left out; see the page cited]. Four-plane: Lead transitions to a level turn on a terminate (SMM 16.39 para 107). Orders p.103-104 give the call format.
- **Note on speeds (para 47 note):** pursuit curves may need changes to the academic manoeuvre speeds, G and bank to keep the FM parameters, within CFAFM limits.
- **FW to FM transition geometry beyond the 30 to 60 bank step:** not in the manuals.

## 5. Lead's manoeuvres

### 5.1 Level turn
- **Source:** SMM 16.17 para 42 (named, no numbers); AFM7 p.17 and AFM8 p.19: 30 AOB turn in FW, then "60/2 level turn" at PCL MAX. The brief does not say what "2" is; every other "x/y" in these manuals is bank/G, and 60 degrees bank level is 2 G (standard aerodynamics, not a manual number).
- **Entry speed:** not in the manuals for FM. Power: MAX (briefs); same on both aircraft (SMM para 42). Exit speed and heading: not in the manuals (turn amount is not given; a 180 degree turn is only the BFT test for FW, EFIG p.76).
- **Path as drawn:** none for FM. The wingman's behaviour through the turn is Figs 12.20-12.23 (section 3). FW test: at least two turns into and two away, each about 180 degrees (EFIG p.76).

### 5.2 Reversal, climb and descent
- **Reversal:** not in the manuals as an FW or FM manoeuvre. The words appear only for the LAB 45 degree reversal (SMM 16.19, line abreast) and the wingman reversing his turn in a rejoin (SMM 16.20 para 65). Fig 12.20 shows the wingman reversing after a turn-into. Not a Lead manoeuvre anywhere I read.
- **Climb and descent:** not in the manuals as FM manoeuvres. FW text allows "utilizing the vertical" (12.29 para 69); Fig 12.22 box: climbing turn above Lead, descending turn below. Formation descent: 20% minimum torque recommended, smooth power changes (SMM 12.31 para 75, EFIG p.395); formation climb about 85-90% (SMM 12.17 para 35; 16.32 para 84 says about 85%). Those are transit numbers, not FM.

### 5.3 Wingover (the only text is SMM 16.17 para 47; no figure; EFIG has no wingover page)
- **Entry:** about 230 KIAS. [manual text left out; see the page cited] in as the nose comes through the horizon.
- **Geometry:** about [manual text left out; see the page cited], about 3 G; exit about 180 degrees from the entry heading. Ideally a second wingover with the opposite roll direction to finish.
- **Not in the manuals:** power (the briefs set PCL MAX for the exercise), exit speed, how far the path moves sideways, whether the second wingover ends on the entry heading and line, height gained. The first wingover's 180 degrees plus the second's gives the entry heading back by implication only.
- Orders limit: aerobatics are over 120 degrees bank or 60 pitch; two-ship FW/FM is exempt (B2 ch 8 para 1a note). Min height 3,000 ft AGL (para 1f).
- Wingman: not in the manuals beyond para 47's "predictability for the wingman", Table 16.1 "nose high goes high if able" and the pursuit text above.

### 5.4 Barrel roll (SMM 14.8 paras 18-19, Fig 14.1 p6/7; EFIG p.418-420; Table 14.1)
- **Entry:** 230 KIAS, 3 G, PCL MAX (Table 14.1 p6/4; Brief: max 60 degrees pitch in fluid). Aligned on a reference line. Figure label: "3G, wings level pull and begin roll". Minimum rolling entry 180 KIAS, normal 230 (SMM 7.12 para 28a).
- **Shape (text):** 45 degrees off the entry line with 45 degrees pitch up and 90 degrees bank; 90 degrees off the line level and inverted; 45 degrees off the line again with 45 degrees pitch down and 90 degrees bank; level at 230 KIAS aligned with the original reference line. Aileron rises and back pressure falls as the speed falls on the way up and over; reverse on the way down. Nose seen from the cockpit traces a circle about a point on the horizon (para 18).
- **Figure shows, text doesn't:** the ring is drawn tilted in perspective and the exit aircraft is displaced to one side of the entry line; two unlabelled thin blue lines run through the picture (read as the section lines at the start and at the 90 degree point). Labels: "blend pitch and roll to arrive at 90 degree reference, wings level inverted"; "adjust rate for 230 KIAS exit". Whether the exit line is the same line or only parallel is not stated.
- **Exit:** 230 KIAS, original heading.
- EFIG p.419: back pressure first, then aileron; 3 G; more roll less pull on the way up, more pull less roll on the way down; should reach 90 degrees off entry inverted "with nose above horizon"; asymmetric G limit 4.7 G.
- Wingman: not in the manuals beyond the general rules.

### 5.5 Loop (SMM 7.5 paras 10-13, Fig 7.2 p2/49; EFIG p.170-172; Table 7.1; 7.12 para 28b; 14.10 paras 25-26)
- **Entry:** 230 KIAS (normal entry 230-250, max 250, min 200), PCL MAX, wings level on a reference line. Wings-level pull at 3-4 G until near the vertical (Fig 7.2: "3-4 G wings level pull"). EFIG p.171: about 3.5 G.
- **Over the top:** G bleeds off; keep slight positive G across the top; nose kept moving at a constant rate; opposite horizon used as reference; rudder for torque (right rudder rising, removed as speed builds). EFIG p.171: top at about 100-120 KIAS, shaker is a cue, "freeze stick".
- **Down side:** after the nose passes the horizon, back pressure increases; the pitch rate stays constant as speed builds. Exit 230 KIAS (para 12). EFIG p.171: vertical down about 140 KIAS, 45 degrees about 180-190, 30 degrees about 30 KIAS to go (my reading: these are nose-down attitudes on the way down; the slide labels them under "Exit"). If fast pull more; if slow continue to 45 and reassess.
- **Height used:** about 3,000 ft of vertical airspace (SMM 7.1 para 6).
- **Shape as drawn:** one tall loop, the top slightly narrower than the bottom, drawn in perspective so the exit sits to one side of the entry line; Fig 7.2 labels the vertical leg "add right rudder to counteract TQ". Text says track stays on the reference line.
- **Radius:** SMM 14.13 paras 29-30 give turn rate and radius formulas (TAS and radial G); 16.16 para 39f says rate and radius constantly change in a loop.
- **Wingman (Patrick's rule, 17:12Z, not a manual):** lag on the way up, cross the horizon with fuselages parallel, lead on the way down. The manuals give no phase-by-phase loop pursuit. The only manual support is the plane-of-motion and total-G text above, Table 16.1 "nose high goes high if able", and "wingmen make the miss (high if low level)".

### 5.6 Terminate
See section 4. Terminate means all manoeuvring stops and everyone acknowledges; "for position" makes Lead fly a predictable turn. Shape of the terminate turn: "predictable turn" (para 46), "level turn" (para 107, four-plane), "gentle turn" (AFM7 p.17). No bank or G given.

### 5.7 The standard sequence
Level turn, loop, two wingovers, barrel roll (SMM 16.17 para 42). Initial training; may be modified; non-regimented. Order, spacing between manoeuvres and the reference heading: not in the manuals. The briefs only number Exercises 1, 3, 4. Repetition guidance for multiple aerobatics: no repetition of the same manoeuvre in one sequence except in opposite directions, flow each into the next without hesitating (SMM 7.11 para 27; EFIG p.174) - this is about solo aerobatics, not FM. Entry speed for each is its own (loop and barrel roll 230, wingover about 230). Speed management between manoeuvres: not in the manuals.

## 6. Not chosen yet (aerobatic manoeuvres not in the FM list)

**Cloverleaf (SMM 7.7 paras 16-17, Fig 7.4 p2/51; EFIG p.136-138; Table 7.1):**
- Entry 230 KIAS, MAX, wings level, pull 2.5-3.5 G (EFIG: about 3 G, "pitch rate" the wingover para 47 refers to).
- At about 60 degrees nose up pick a reference point on the horizon 90 degrees off the entry direction; keep pulling and start a roll toward it with constant roll rate, wings level when inverted and aligned with the reference; then pull out as the last half of a loop to 230 KIAS on the 90 degree heading (this one leaf is all the text describes).
- Fig 7.4 labels: "60 deg nose up, roll towards 90 deg reference, maintain pitch rate"; "wings level inverted, adjust rudder to align with reference". The ring is drawn tilted and the exit is on the 90 degree line.
- EFIG p.137: the 60 degree point is "about 50 degrees nose up, feet above horizon" with canopy bow at or above the horizon in the blend; inverted under 120 KIAS is a safety item.

**Cuban eight (SMM 7.6 paras 14-15, Fig 7.3 p2/50; EFIG p.141-143):**
- Entry as the loop (230, MAX, 3-4 G; EFIG 3.5 G). At the inverted position, check the approaching horizon, pick a point [manual text left out; see the page cited] it release back pressure and half-roll around that point (point roll about 0.5 G); pull out at constant rate to 230 KIAS as the nose passes level; repeat the whole thing rolling the opposite way, ending level on the original heading at 230 KIAS.
- Figure shows a figure-eight (two leaves crossing in the middle) with 45 degrees nose down at the roll, and a label "approximately 180-190 KIAS, set rate for 230 KIAS" on the first pull-out; the text gives only 230 at the end. EFIG p.142: point about one fist above the canopy bow; hold the nose down until about 180 KIAS.

**Immelmann (SMM 14.15 para 39, Fig 14.2 p6/12; EFIG p.434-436; Table 14.1):**
- Entry 200-250 KIAS, level, full power (figure: 100% TQ), about 4 G held until stick shaker, then manage back pressure to stay in the shaker without stalling; approaching inverted, relax stick and roll out wings level; much rudder at slow speed and high power. Exit speed varies (EFIG p.435: can be quite slow).
- Figure: a semicircle pull ("pull and maintain approx 4G until shaker activates"), then "half roll to the upright position", exit "transition to follow-on manoeuvres as desired". Heading ends 180 degrees from entry and higher (that is what a roll off the top is, SMM 7.9 para 21 for the basic version).
- The basic roll off the top (SMM 7.9 paras 21-22) differs: 250 KIAS, MAX, about 4 G, half roll at about 0.5 G, about 120 KIAS at the end. Neither the Immelmann nor the basic roll off the top has a wingman instruction in the manuals.

## 7. Conflicts and mismatches (not resolved, each side with its page)

1. **Sweep width:** SMM 12.29 para 69 and EFIG p.391: 30 to 60 degree sweep. SMM 16.38 para 104 (3 and 4 aircraft): "60 degree sweep" off the preceding aircraft. Fig 12.19 measures sweep from Lead's wing line (60 sweep = 30 off the tail), and the text never defines it. The sim's current 4-ship slots (requirements-log item 14: No. 2 at 45, Nos. 3 and 4 at 30, 650 ft) are not a number I found in any manual.
2. **FM cone:** SMM 16.17 para 42 says a "60 degree cone" and puts the 30-60 swept position outside it. No picture, and the manual does not say if 60 is the total width or each side. (design.md Q1.) Only a total width of 60 leaves the 30-60 off-tail band outside, if sweep is read as off the tail.
3. **FM distance:** SMM 16.17 para 42: 500-1,000 ft. Briefs AFM7 p.17 and AFM8 p.19: 500-750 ft. AFM7 p.14 FW: near end of 500-1,000. Bubble is 500 ft (para 44c, Gen Book p.11).
4. **How range is measured:** Fig 12.19 draws radial arcs at 500 and 1,000 ft from Lead; AFM7 p.14 draws the 500-1,000 ft arrows along Lead's track between aircraft.
5. **G:** SMM 16.17 para 44a: 5 G at all times. Orders B2 ch 8 para 1a: Lead not above +4 G, positive G. Gen Book p.11 and SMM Table 16.1: Lead +4, wingmen +5. Wingover about 3 G (para 47).
6. **Pitch and bank limits for FM:** SMM wingover 45 degrees pitch, up to 120 degrees bank. Brief barrel roll: max 60 degrees pitch (SMM 14.8 uses 45 degrees at the quarter points). Orders: two and three aircraft no angle limits; more than three, 60 degrees pitch, no bank limit; aerobatics defined as over 120 degrees bank or 60 pitch.
7. **Barrel roll inverted point:** SMM 14.8 para 19: level, inverted, 90 degrees off the line. EFIG p.419: inverted with the nose above the horizon. Fig 14.1 label: wings level inverted at the 90 degree reference, no pitch stated.
8. **Cloverleaf roll point:** SMM 7.7 para 17 and Fig 7.4: about 60 degrees nose up. EFIG p.137 header says 60, body says about 50 degrees nose up.
9. **Loop G and speeds:** SMM 3-4 G (Table 7.1, para 11); EFIG p.171: 3.5 G. Entry: Table 7.1 gives 230; SMM 7.12 para 28b says normal entry 230-250 and max 250. Slow-speed loop entry min 200 KIAS (14.10 para 26).
10. **Cuban 180-190 KIAS:** shown only in Fig 7.3 and EFIG p.143, and in EFIG p.142/171 for the pull-out; SMM 7.6 para 15 gives 230 KIAS at level only.
11. **After a terminate:** SMM 16.17 para 48: rejoin to close formation (turning or straight ahead). AFM7 p.17: gentle turn, re-establish Finger geometry at FW spacing. SMM 16.17 para 46 (for position): predictable turn. SMM 16.39 para 107 (four-plane): level turn.
12. **Fig 12.21, tight/stretched caption:** the turn-into wingman's box says "delaying your turn (lag pursuit)", but the label under his aircraft reads "Delay the turn (Lead pursuit)".
13. **No. 3 and No. 4 side:** SMM 16.38 para 104: "alternating" on the side opposite to No. 2. AFM7 p.14: Nos. 3 and 4 both fly the side opposite No. 2. Fig 16.29 shows No. 3 and No. 4 both on the left, No. 2 on the right.
14. **Fluid 4 LAB spacing:** AFM8 p.20 text: 6,000 ft; the same page's figure label: 4,000-6,000 ft.
15. **Aspect angle:** SMM 16.16 para 40b: 0 at Lead's tail, 180 dead ahead, independent of heading (as does 12.2 para 6 in words). Figs 12.1 and 16.9 (as I read them) draw it from Lead's wing line: a wingman 45 degrees to the left of the tail is labelled 45 and one 45 degrees to the right is labelled 135. A programmer should not take either as settled.
16. **SMM paragraph numbers:** piece2-references.md cites Immelmann as 14.16 and split-S as 14.17; the SMM text has them at 14.15 (para 39) and 14.16 (para 40). Fig 14.3 split-S not looked at.
17. **Entry to FM:** SMM 16.17 para 43: from echelon with a 2-second break, or FW or LAB. AFM7 p.17: from FW, 30 degrees bank then 60 degrees bank and PCL MAX. Both stated; not contradictory, but the 30 to 60 stage is brief only.

## 8. What the manuals do not give (so it cannot be drawn exactly from them)

- Any FM cone picture or the cone's width; any bubble picture.
- Level turn: entry speed, turn amount, exit heading; what "2" means in 60/2.
- Reversal, climb, descent as FM manoeuvres.
- Wingover: figure, power, exit speed, lateral displacement, height gained, entry-line return after the second.
- Order and spacing of the standard sequence; Exercise 2; where the loop sits.
- Wingman pursuit by phase for loop, barrel roll and wingover (Patrick's loop rule is the only source).
- FW to FM stage timing; four-ship FM geometry beyond para 108.
- Height gained or lost for wingover, barrel roll, loop in FM (loop: about 3,000 ft vertical, SMM 7.1 para 6).
- Echelon to FW time.
