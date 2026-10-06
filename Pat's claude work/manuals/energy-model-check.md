# Turn Fight Energy model vs the manuals (audit items a-d)

Asked by the coordinator 2026-09-30 09:22Z. Model = core's T-6A performance model (src/core/t6-performance.js, point-mass.js; stall line (KIAS ÷ 86)², thrust/drag fitted to the sustained-turn and glide charts). Manual text stays here; the repo may cite page refs only.

## What the manuals say

- **Level MPT (LMPT)** (SMM 14.14 paras 34-36): flown in the stick-shaker range without stalling (stall = 18 units, para 33); full power; "airspeed will stabilize at approximately 150 KIAS minus the altitude in thousands"; "AOB is approximately 75 degrees"; nose slightly above steep-turn attitude; level held with bank, not pitch. From a higher speed: roll in, PCL mid-range, pull up to about 4 G, bleed speed, MAX at the shaker (para 36). EFIG p.428: 70-75° AOB, 150 KIAS minus altitude (140 at 10,000 ft). CSMPT: 160 KIAS, 70-75°, "4 G initially" (SMM para 37-38, EFIG p.430).
- **Optimum turn rate** about 160 KIAS and 17 units (SMM 14.13 para 31).
- **Stick shaker** 15.5 units, about 5-10 kt above the stall (NFM p.1-52); "expect a decrease in stall speed with power on" (NFM p.6-7). NFM Fig 6-2 "Maneuverability - G Available" and Fig 6-3 idle stall speeds are images, not in the Scribd text.
- **Split S** (SMM 14.16 paras 40-41): 100-120 KIAS, full power, raise nose to about 20° up, roll inverted at about 0.5 G, then pull in the shaker without stalling; "altitude loss will be approximately 2,000'"; practise from at least 10,000 ft MSL. Table 14.1: "approx. 4 G". EFIG p.438: don't delay the pull, pull more as speed increases; AIF 2410 max 5 G. EFIG p.422: max 160 KIAS entry for an off-speed split S. NFM Fig 6-1 (p.6-4) recommended entry 120-140 KIAS.
- **Immelmann** (SMM 14.15 para 39): 200-250 KIAS, about 4 G to the shaker, roll-out speed "will vary". EFIG p.435: roll-out airspeed "can be quite slow". NFM Fig 6-1 (p.6-4): 230-250 KIAS.
- **Pitch back** 160-220 KIAS, about 4 G; caution above 190 KIAS for the asymmetric G limit (SMM 14.17 paras 42-43).

## a) LMPT bank: model 68.5°, SMM ~75°, EFIG 70-75°

- The T-6A sustained-turn chart itself implies about 69°: 20.6°/s at ~140 KIAS at sea level is 2.8 G = 69°; 16.5°/s at 10,000 ft is 2.65 G = 68°. The stall line gives 70° at 146 KIAS (86 kt stall) or 71° (83 kt).
- 75° is 3.9 G, which at 140-146 KIAS needs a 71-74 kt stall speed. Power-on stall is lower than idle (NFM), and thrust at 15-17° AOA adds only about 0.1 G, so that doesn't close the gap. Bank measured on the attitude indicator vs flight-path bank differs by under 1° here.
- **Reading:** 75° is the pilot's attitude cue, not a performance number; the charts govern the physics. **Recommend** keep the model (~68-70°), and put "SMM ~75°, EFIG 70-75°" in the help text. For Patrick: does he accept the chart bank?

## b) LMPT speed by altitude: model 146.4 / 144.1 KIAS at 6,000 / 10,000 ft; rule 144 / 140

- The rule says "approximately". At constant power a stall-line level turn moves with density^(1/6): 150 → 145.6 at 6,000, 142.6 at 10,000, 138.9 at 15,000, i.e. about 0.75 kt per 1,000 ft; the 1 kt rule would need power falling off, and the PT6A-68 is flat-rated. The turn chart's own best-rate speed at sea level is ~140, below the rule's 150.
- **Reading:** within 4 kt across the MTCA working blocks (6,000-15,500). **Recommend no change**; quote the rule in help text. The 86 vs 83 kt stall choice (Dad's) moves it by a few knots either way; no Patrick question.

## c) Split S: model loses 1,512 ft from entry (1,854 from the top) vs SMM ~2,000

- The "about 4 G" is not an entry G: para 41 flies the roll at ~0.5 G and then pulls in the shaker, and G builds as speed builds (EFIG p.438 "pull more as airspeed increases"). At 100-120 KIAS the stall line allows only 1.4-1.9 G, so there's no conflict.
- Why the model loses less: it pulls on the stall line (18 units) the whole way; pilots fly in the shaker (from 15.5 units, 5-10 kt above stall), and Table 14.1 / EFIG put the peak around 4 G (5 G max). Both lower the G and add height loss.
- **Recommend (core):** pull at the shaker, not the stall line (stall speed + about 7 kt in the G formula), capped at 4 G, and measure loss from the entry altitude; check it lands near 2,000 ft. The hard-deck slice-vs-split-S choice uses this loss, so a bigger number is also the safer one. For Patrick: does the SMM's 2,000 ft count from the entry altitude? (recommend yes).

## d) Auto move step at 220/221 KIAS

- 221 is the bottom of the SMM Immelmann range (200-250) and below the NFM's (230-250); the manuals expect a slow roll-out, so a 113-120 KIAS exit and a long wait to reach the MPT is realistic for an Immelmann, not a model error. The problem is choosing it for "get to the best turn".
- The SMM's own way to reach the MPT from above 220 is the high-speed entry: roll in, PCL mid-range, pull up to about 4 G, bleed to the shaker, then MAX (SMM 14.14 para 36 level, para 38 CSMPT). This is the "mid-range power when too fast" proposal (2) already waiting on Patrick.
- **Recommend:** above 220 KIAS the Auto move flies the high-speed MPT entry; the Immelmann stays available under "force a move" (it trades speed for height). Changes D112's table, so Patrick decides.

## Patrick's answers (09:27Z, manuals thread)

- a) **Keep the turn chart** (~69° level MPT bank). SMM/EFIG 70-75° goes in help text only.
- c) **Split S goes up to 5 G; go with the model** as recommended: pull in the shaker (not on the stall line), capped at **5 G** (not 4), loss measured from entry altitude.
- d) **No** to the SMM high-speed entry for the Auto move: that's the academic way to enter a max-performance turn, not the best way to manage energy. **Above 220 KIAS the move is an Immelmann or a pitch back, chosen by what makes sense for geometry, energy and position.** (So Turn Fight proposal (2), mid-range power when too fast, is answered no for the Auto move.)

**Result (core #181, reported 09:47Z):** split S from 110 KIAS at 10,000 ft, pulling in the shaker capped at 5 G, loses 1,976 ft from the top of the 20° nose-up and 1,688 ft from the entry altitude. So the SMM's "approximately 2,000 ft" matches the loss measured from the top. For the hard-deck check, what counts is exit altitude against entry altitude (1,688 ft).
