# Draft wording for Patrick: Turn Sim spec section 10, "Changing formation" (2-ship)

Draft, 4 Oct 2026, from `design.md` in this folder and Patrick's answers (11:08Z-11:09Z). Once Patrick confirms it, this text goes into `docs/modules/turn-sim/spec.md` as section 10, with a decision (TS-53) and a plan step.

---

## 10. Changing formation (2-ship)

**What it does.** A new "Change formation" group of buttons sits above the manoeuvre buttons: Line abreast, Fighting wing, Echelon, Route and Fluid manoeuvring, plus a Side switch (Keep, L or R). Press one and the pair flies the manuals' transition from whatever formation they are in now. Where the manuals don't join two formations directly, the transition goes through an in-between formation, for example fighting wing to echelon through route (from-to table, `design.md` section 4). The button for the current formation is greyed out. Line astern and the rejoin options sit behind "More".

**How it flies.**
- **Planned paths:** every transition is planned when you press the button, in the same style as the manoeuvres: pre-planned paths, roll 90°/s, and smooth hand-overs with no jump in position, track, bank, roll rate, pitch rate or speed.
- **Speed:** the pair flies 200 KIAS outside line abreast and 220 KIAS in line abreast (SMM 12.23 para 53, SMM 16.18 para 49; Patrick 11:08Z). Lead slows or speeds up during the transition. Speed changes are smooth ramps, and they happen only during transitions (Patrick 11:09Z). Speeding up uses the T-6's full-power figure from the core. Slowing down uses 1.5 kt/s, an estimate, because idle thrust and the speed brake are not modelled.
- **Rejoins:**
  - The default rejoin from line abreast is a turning rejoin: Lead turns into #2, and #2 rejoins to fighting wing (SMM 16.20 para 65, Fig 16.25; AFM7 p.17; Patrick 11:09Z).
  - Pressing Echelon from line abreast flies the hot turning rejoin straight to echelon (SMM 16.20 para 66).
  - #2 overtakes Lead by 10-20 KIAS in a turning rejoin (EFIG p.374) and 20-30 KIAS straight ahead (EFIG p.371), and stays below Lead.
  - #2's bank in a rejoin is capped at 60°, an estimate, flagged on screen and never a wall.
- **Entering fluid manoeuvring:**
  - from echelon by the 2-second break (SMM 16.17 para 43);
  - from fighting wing by Lead's 30° turn, then max power (AFM7 p.17);
  - from line abreast through fighting wing.
- **After a change:** the manoeuvre buttons work only in line abreast for now; they are greyed out in other formations. Fighting wing and fluid manoeuvring themselves (Lead's moves, #2 staying in the cone) are a separate step.

**The positions** (the formation counts as established when #2 is inside these):

| Formation | #2's position | Source |
|---|---|---|
| Line abreast | 4,000-6,000 ft abeam, 0-10° sweep | SMM 16.18 para 49 |
| Fighting wing | 500-1,000 ft, 30-60° sweep, below Lead; default 750 ft and 45° (estimate) | SMM 12.29 para 69 |
| Route | 1 to 3 wingspans out on the wing-tip line | SMM 12.6 para 15 |
| Echelon | about 45 ft out, 25 ft back, 5 ft down (estimate; the manual gives sight references, not feet) | SMM 12.4 paras 11-12 |
| Line astern | directly behind and below, about 10 ft nose to tail | SMM 12.5 para 13 |

**Screen.**
- **Formation card:** shows "Now:" and "Flying:". During a rejoin it adds range, closure, Lead's clock position, ON LINE, HOT or COLD (hot and cold at 60° and 30°, estimates), and height against Lead. After each change, the card judges the new formation against the table above.
- **Camera:** zooms in by itself when the pair is closer than about 1,000 ft and back out when they open up.

**Flags, never walls.**
- Lead above 4 G in fighting wing or fluid manoeuvring, and above 3 G in close formation (2 CFFTS Orders B2 ch 8; Gen Book p.11).
- #2 at or above Lead's height during a rejoin (SMM 12.27 para 65).
- Less than 500 ft separation in fluid manoeuvring (SMM 16.13 para 31).

**When things go wrong.**
- **A press while a change is flying** waits its turn, as the manoeuvres do (TS-45).
- **A picture that fits no formation:** the planner works out the nearest formation from the pair's real positions. If none fits, it flies a rejoin from wherever #2 is.

**Not in this step:** the Overshoot button and rejoin mistakes (to `future.md`), the 4-ship changes (their own design), fighting wing and fluid manoeuvring flying (their own design).

**Checks (light):**
- every from-to pair ends in the target formation's band;
- smooth hand-overs, including through speed changes;
- #2 never above Lead in a rejoin;
- bank never past the cap.

No time gates. A generous limit of 3 minutes per change catches a planner that never finishes (estimate).

**Confirmed by Patrick, 4 Oct 11:45Z ("Agreed").**
