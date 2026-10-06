# PFL glide drag: what the sources say and how to model it (Fable consult, 5 Oct 2026 23:50Z; full working for the PFL rework thread in `fable-gear-drag-consult.md`)

Read-only advice for Patrick and the PFL rework thread (which stays the only writer). Pages cited; guesses marked.

## The three sources agree on the clean glide

| Case | Source | Figure | The model today (chart polar, feathered) |
|---|---|---|---|
| Clean, 125 KIAS, straight | max glide chart (flight test 1998); SMM 13.5 para 7; NFM p.3-13 | 2.0 NM per 1,000 ft, about 1,350 ft/min | 2.0 NM per 1,000 ft |
| Clean, 125 KIAS, 4 to 6 % torque (practice zero thrust) | NFM p.3-45 | 1,350 to 1,500 ft/min | 1,350 to 1,430 ft/min at 4,000 to 8,000 ft MSL |
| Clean orbit, 125 KIAS, 30° bank | SMM 13.5 para 11 (part 5 p.46) | about 1,700 ft per 360° | 1,630 ft (4 % less) |

So the model's glide physics is right, and practice PFLs at 4 to 6 % torque fly like the feathered chart. An idle-prop drag term is not the answer: it would break the clean orbit figure too (adding enough prop drag to reach 2,600 ft gear down pushes the clean orbit to about 1,970 ft against the SMM's 1,700).

## Where the gear-down figure parts company

| Case | Source | Figure | Chart polar |
|---|---|---|---|
| Gear down, 105 KIAS, straight (best glide) | chart | 1.5 NM per 1,000 ft | 1.5 |
| Gear down, 120 KIAS, 30° bank, 360° | SMM 13.5 para 11, 13.6 para 13 | about 2,600 ft | 1,980 ft on the circle 30° gives (0.82 NM across) |
| Gear down, 120 KIAS, 1 NM circle (about 26° bank), 360° | SMM 13.6 para 13 (the pattern) | about 2,600 ft | 2,270 ft |

Three things in the SMM cannot all hold exactly: 30° of bank at 120 KIAS gives a 0.82 NM circle, not 1 NM; the SMM says "approximately" to both. What the pilot flies to is the ground picture, the 1 NM circle and the keys, so the bank comes out nearer 26°. On that circle the chart is 13 % short of the SMM's 2,600 ft (2,270). The keys are consistent with 2,600 per 360° (High Key 5,000, Low Key 3,700 after 180°, 400 ft left at short final from 3,000 ft AGL, SMM 13.6 para 13, 13.8 para 17): the 2,600 ft figure IS the pattern figure, not a separate orbit figure.

Why the gear-down figure is higher than the chart: not settled by any page I have. Guesses: the SMM number is a teaching figure with margin built in (the "extra 400 ft" wording); the CT-156's gear drag at 120 KIAS is larger than the 1998 flight-test chart's at 105 KIAS; or the figure was measured with a little flap or speed brake in use. Patrick's practice is the source that wins here.

## What went wrong in the fits so far (from PFL rework's report; I have not seen its trace)

1. Fitting 2,600 ft to a 30° bank orbit on a 0.84 NM circle needs a glide of about 1.04 NM per 1,000 ft gear down, 30 % more drag than the chart. Flying the 1 NM pattern with that drag then loses about 3,000 ft per 360°, so the keys come out low and the planner widens or drags to compensate. That is the likely root of the odd side effects (long touchdowns, slow final turns), though only the trace can confirm it.
2. Scaling only the zero-lift drag moves the best-glide speed down (96 KIAS against the chart's 105), because best-glide speed falls with the fourth root of zero-lift drag. That changes the glide ring and the direct-to-threshold speed for no reason the sources give.
3. Taking flaps early as a fudge hides the drag number in the plan. The SMM keeps drag devices for "high at a key" (13.6 para 15).

## Recommended model (one number, one setting)

- Keep the chart polar for every configuration (clean, gear, flap, landing) and its best-glide speeds.
- Add ONE number: the gear-down polar scaled by 1.117 on the whole polar (zero-lift and induced parts alike; an estimate fitted to the SMM), which loses 2,600 ft in 360° on the 1 NM circle (SMM 13.6 para 13) and gives Low Key 3,696 and Final Key 3,045 ft from High Key 5,000 with no other tuning. Best glide stays at the chart's 105 KIAS; the gear-down best-glide ratio becomes about 1.34 NM per 1,000 ft. Source: Patrick's ruling 23:20Z "Agreed with smm" plus the SMM pages above.
- Flap and landing-flap increments stay the chart's steps on top of that (as PFL rework has already done).
- Orbits to lose height fly at 30° (Patrick 23:29Z) and lose about 2,210 ft per 360° with that drag; the pattern on the 1 NM circle loses the SMM's 2,600 ft, which is what the keys need. Never fit the number on the orbit.
- A Setting under More, "Glide: SMM pattern (default) / Chart", so Patrick can flip between them and see the keys; the chart value stays as the real-engine-failure case (feathered).
- Check on screen, no tests: from High Key 5,000 ft at 120 KIAS gear down on the circle, Low Key within about 100 ft of 3,700, Final Key about 3,000, wings level short final about 400 ft AGL.

## One question for Patrick

Which circle does the 2,600 ft belong to? Options: (a) the 1 NM pattern (recommended, it is the pattern figure and the keys agree with it), (b) a true 30° bank orbit (0.84 NM; then the pattern itself loses about 3,000 ft and the keys no longer fit), (c) his own figure from flying it (feet per 360° on the pattern, which replaces the SMM's).

## Ruled (Patrick, 5 Oct 23:45-23:47Z)

The 2,600 ft belongs to the pre-High-Key orbit at 30° (SMM 13.5 para 11), so the gear drag is fitted there: the chart gear-down polar times 1.322 (estimate), best glide stays 105 KIAS. The pattern stays 1 NM; the keys stay 5,000 / 3,700 / 3,000 as targets with margin, and the aircraft arriving 250 to 300 ft under them is accepted as real life. Consequence told to Patrick: a gear-only 360 from High Key ends about 40 ft above the threshold. Working detail in `fable-gear-drag-consult.md`.

## FINAL (Patrick 23:47-23:49Z): chart drag as is

Patrick's flying overrode the orbit fit: "IRL I try to be at about the right height for low key and take land flaps quite early and still sometimes land a bit long, depends on the wind" (23:47Z); "more wind from the north or more headwind makes the land flap like an elevator you drop fast" (23:48Z); ruling 23:49Z: **"chart drag as is, keys about 100 ft high, take land flap early lets do that"**. So no gear-drag scaling at all (the 1.117 and 1.322 fits above are withdrawn); the chart polar stands for every configuration; the pattern stays 1 NM; the keys are targets and the aircraft about 100 ft above them is right; landing flap goes out early in the pattern by default. The SMM's 2,600 ft orbit figure is recorded as conservative beside the chart's about 1,980 ft (SMM 13.5 para 11 / 13.6 para 13 versus the max glide chart), both written down per the rule book. PFL rework builds it.
