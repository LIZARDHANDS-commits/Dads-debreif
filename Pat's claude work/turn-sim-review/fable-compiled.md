# What Fable told us, and what we did with it (Formation Sim)

Kept by the Formation Sim thread (Patrick 5 Oct 09:21Z: "Keep an organized compilation of what fable told us and make sure we make good use of it"). The raw notes are in [rejoin-review-fable.md](rejoin-review-fable.md): the review at 08:45Z, then follow-ups at 08:46Z, 08:52-08:58Z and 09:08Z on 5 Oct 2026. Every time and closure Fable gave is an estimate from the shared turn formulas, unless a page is cited. Fable read only text extracts of the SMM and EFIG, never the CFAFM.

**Wording rule (Patrick 6 Oct 03:14Z):** every Fable brief and note uses the wording in [rendezvous-glossary.md](rendezvous-glossary.md) and opens with its context block.

**Rule for every Formation Sim brief:** before building a rejoin, a fighting wing move or fluid, read this file and say which line the work uses or changes. When a "To do" line is built, move it to "Used", with the version.

## 1. Lessons (the common theme)

We flew the numbers in the wrong frame, or with the wrong kind of speed.

1. **Name the kind of speed.** Patrick's 15/25/50 kt Rates are overtake (KIAS above Lead), not range rate. One closure number was read three ways in three files. A knots-to-feet conversion was applied twice. AGENTS.md already says speeds must name their kind.
2. **Formation flying happens in Lead's turning frame.** In a turn, Lead's turn does most of the closing. On the line at matched speed, the range dies away slowly (time constant about 1/ω, 20-30 s) and never finishes without an overtake. A place inside Lead's turn needs about 13 KIAS less than Lead.
3. **Manoeuvring costs energy.** Power is back-computed, so a planner must clamp itself with the full-power and slow-down rates, worked out at the G and climb it is flying. At 1 G, a 60-79° turn cost nothing.
4. **Fly like a pilot, not a controller.** Set a medium bank and a power setting, and hold them. The tracker re-aimed every 0.05 s, giving big short inputs.
5. **Write the method down first, and find the cause after two failed fixes.** Our two failed fixes for Student's fighting wing treated symptoms. Fable found the cause by reading the whole chain end to end.

Why the gaps formed: the code grew by patches tuned until each case looked right; the checks measured times, not mechanisms, so plausible times hid wrong-kind numbers; and each fix saw only one slice.

## 2. Used (built and merged)

| Fable's point | Where | Version |
|---|---|---|
| Rates flown as overtake; three held segments (point, hold the line, decision point and run-in) | turning-rejoin.js | V2.63 (TS-69) |
| Power: MAX to set the overtake, hold it, take it out with the least stage that fits (power back, idle, boards) | turning-rejoin.js | V2.64 |
| G and climb cost in the speed limits; never past the stall line | turning-rejoin.js | V2.64 |
| Hot starts try Lead's 30° and a gentle lag first | tuning.js hotBanksDeg, lagAimFt | V2.64 |
| "Ahead of 3/9" flag no longer counts the start geometry | turning-rejoin.js | V2.64 |
| Fit the overtake to the room (fall back to a smaller Rates overtake) | turning-rejoin.js | V2.64 |
| Double knots-to-feet slip in the stopping rate | tracker.js, hand-over.js | V2.64 |
| AI line abreast at 4,000 ft flows through route at Instructor's close-in rate | turning-rejoin.js | V2.64 |
| Tracker's speed limits centred on the place's own speed, so Student's fighting wing settles (30 of 30) | tracker.js | V2.65 |
| Echelon to fighting wing: roll away at 45-60°, 15-30° off, idle and boards, ease down, turn back, MAX into the cone (in the cone at 7-10 s, was 28-44 s) | echelon-to-fw.js | V2.68 (TS-73) |
| SARJ: the same held planner with Lead straight; full power until on Lead's six, then Lead + Δ, the least stop stage, the tracker through route (fighting wing to echelon 41 s, was 92 s) | straight-rejoin.js | V2.67 (TS-72) |
| Lag roll: a pose track of #2's own 3D path; search the pull {2.5, 3 G} and the nose {30, 45°}; check G each step and the 500 ft bubble; flag when Lead leaves the top half of the canopy | lag-roll.js | V2.66 (TS-71) |
| Fluid #2 by energy, not by the planned line's speed; lag and lead for spacing; Lead kept at MAX (the manuals win over the review's "power in hand") | full-power.js flyFluidStep | V2.69 (TS-74) |
| Hot start: geometry first, power only when tight (follow-up 1), on Patrick's rule: never below 200 KIAS unless close in and hot, 220 up the line, slow at the decision point | turning-rejoin.js, straight-rejoin.js | V2.71 (TS-75) |
| No outside library; a few lines of trigonometry on our own stepper | (followed) | n/a |

## 3. To do (told to us, not built yet)

In Patrick's order (08:40Z, card "First" 09:04Z):

1. ~~SARJ~~: built V2.67 (see Used).
2. ~~Echelon to fighting wing~~: built V2.68 (see Used).
3. **Planned overshoot** when too hot at the decision point (SMM 12.27 paras 64-66): below and behind Lead, to the outside, then rejoin from there.
4. ~~Height flown as energy~~: built V2.82 (TS-82): the pull is charged as G and the vertical is a turning rejoin candidate. Was: **Height flown as energy** (tried in V2.71: no gain at realistic climb rates until a height change's pull is charged as G): if #2 is high, power back so the dive doesn't push him past Lead + Δ; if low, climb at MAX and accept a smaller Δ. Tonight height doesn't trade with speed; flag it, don't model it yet.
5. **Refuse a rejoin** if Lead's turn would pass about 360°.
6. ~~Fluid "stretched"~~: built V2.69 (see Used). Lead stays at MAX (the manuals); #2 flies by energy and geometry.
7. **Errors panel:** its drawn lines are at full power (hot-rejoin.js). Keep hot-rejoin.js until the new planner covers the Errors panel.
8. **Lag roll in a turn:** plan it in Lead's turning frame (it now needs Lead straight and level).
9. **4-ship turning rejoin.**
10. **Delete list**, once the new moves fly: turning-rejoin.js's tracker legs; tracker.js holdLine; TURNING_REJOIN line tuning; planGoTo's "Lead waits" paths for the 2-ship (transitions.js); legsFor lab→rejoinTo; kinematic-moves.js planLineMove (unused). This is the old-code delete agent's job (Opus), after Patrick's look.

**Not checked:** whether kinematic.js still reads the closure as range rate (Fable named kinematic.js:510-520).

## 4. Accepted as is

- G onset is ignored: a few tenths of a second.
- Per-step setKias with held commands is kept; no smootherstep speed segments.

## 5. Where else the lessons may apply (inferred, not checked)

- **Fight Sim pursuit:** the same kind of chasing tracker; closure may be read as range rate; high-G turns may be free.
- **Traffic:** any speed limit worked out at 1 G in a turn, and any comparison between kinds of speed (indicated, true, ground).
- Patrick's card 09:25Z: "Next session". The coordinator gives these to Fight Sim and Traffic with their next piece of work.
