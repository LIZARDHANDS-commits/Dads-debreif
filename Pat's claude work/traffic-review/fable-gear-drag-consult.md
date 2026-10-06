# Gear and flap drag in the PFL: Fable's consult for the PFL rework thread (5 Oct 2026, 23:58Z)

Read-only. The PFL rework thread stays the only writer. Patrick's short version is `pfl-glide-drag-consult.md`. Pages cited; every estimate is marked. I checked the numbers below with the core model itself (`src/core/t6-performance.js` glideDragPerWeight, iasToTasKt) flown round a 360° at 0.1 s steps from 5,000 ft MSL at 120 KIAS. I have not run the PFL planner or read the three traces; what I say about the planner's behaviour is inferred from the report and marked so.

## (a) Is the gap real aircraft behaviour or a modelling artefact?

Checked against the sources:

| Candidate | Verdict | Evidence |
|---|---|---|
| Gear drag as parasite only | Right in kind, and the cause of the 96 KIAS side effect | Gear is a zero-lift drag item (standard aerodynamics). But best-glide speed falls with the fourth root of zero-lift drag, so fitting 2,600 ft through the parasite term alone drops the gear-down best glide to 93 KIAS (fit on the 30° orbit) or 100 KIAS (fit on the 1 NM circle) against the chart's 105. Artefact of the fit, not the aircraft. |
| Practice power setting versus feathered prop | Not the gap | NFM p.3-45: the practice setting is 4 to 6 % torque, "zero thrust", and gives 1,350 to 1,500 ft/min clean at 125 KIAS: the same as the feathered chart (1,350). The SMM's clean orbit (1,700 ft, 13.5 para 11) matches the chart polar at 30° bank (model 1,638). A prop-drag term big enough to reach 2,600 ft gear down would push the clean orbit to about 1,970 ft, breaking that match. Checked. |
| The chart's conditions | Small | Flight test 1998, engine inoperative, feathered. Weight and altitude move the sink rate in ft/min but the glide ratio through the air stays; a 360° loss at a given bank scales with true airspeed squared, which the model already does through iasToTasKt. Not enough to make 13 to 30 %. Checked. |
| 30° versus 1 NM circle | Most of the apparent gap | At 120 KIAS at 4,000 ft a 30° bank circle is 0.84 NM across; the 1 NM circle (PFL_CIRCLE_RADIUS_FT) is 25° of bank. Same drag, the 1 NM circle loses 2,329 ft per 360° against 1,984 on the 30° orbit (chart drag). The SMM quotes "30°" and "approximately 1 NM" and "2,600" together, and at 120 KIAS they cannot all be exact. Checked. |
| SMM figures as rounded design numbers | Likely the rest | 13.6 para 13 ties 2,600 ft to the pattern: High Key 3,000 ft AGL, 400 ft left on short final; the keys (1,300 lost to Low Key, 700 to Final Key) are that same number split. On the 1 NM circle the chart polar is 12 % short of it (2,329 against 2,600). Why the aircraft loses that 12 % more with the gear down than the chart says is not in any page I have. Guess: a teaching number with margin, or the CT-156's gear drag at 120 KIAS being a little more than the chart's at 105. Patrick's own flying decides it. |

So: the gap is mostly the circle (checked), the remainder is a real 12 % difference between the chart's gear drag and the SMM pattern figure (source unknown, Patrick agreed with the SMM), and the 96 KIAS best glide and the "keys don't fit" result are artefacts of fitting the figure on the wrong circle through the parasite term only.

## (b) Figures and modelling I recommend

All losses below are per 360° at 120 KIAS from 5,000 ft MSL, model-flown.

| Item | Figure | Source | How |
|---|---|---|---|
| Clean | chart as is: 2.0 NM per 1,000 ft at 125 KIAS | chart; SMM 13.5 para 7; NFM p.3-13, p.3-45 | unchanged |
| Gear down, chart ("Chart" setting, real engine failure) | 1.5 at 105 KIAS | chart | unchanged |
| Gear down, pattern ("SMM pattern" setting, default) | the chart gear polar times 1.117 on the WHOLE polar (zero-lift and induced parts alike); best-glide ratio then 1.34 NM per 1,000 ft, best-glide speed stays 105 KIAS | fitted to SMM 13.6 para 13 (2,600 ft per 360° on the 1 NM circle); the 1.117 is an estimate, cause unknown | one constant, e.g. PATTERN_GEAR_DRAG = 1.117, applied in glideDragPerWeight for gearDown (and carried into the flap rows below) |
| Check of that fit | Low Key 3,696, Final Key 3,045, after 360° 2,397 ft MSL | SMM keys 3,700 / 3,000 / about 2,280 (13.6 para 13, 13.8 para 17) | model-flown on the 1 NM circle; the first two match within 50 ft without any further tuning |
| T/O flap | the chart's gear-to-T/O-flap step on top of the pattern gear (the step itself is the estimate it always was: the chart has no T/O flap row) | chart; estimate | as built in 1ea9da1, but on the whole-polar gear, so about 1.19 NM per 1,000 ft, best glide about 108 KIAS |
| Landing flap | the chart's gear-to-landing-flap step on top of the pattern gear | chart (1.1 at 95) | same way; about 0.98 NM per 1,000 ft |
| Pattern circle | 1 NM across, unchanged | ratified 4 Oct; SMM 13.6 para 13; Patrick 23:29Z "the PFL on the ground stays the same" | unchanged |
| Orbit to lose height (false High Key, high arrivals) | fly it at 30° of bank (0.84 NM); with the pattern gear it loses about 2,210 ft per 360°, the clean orbit about 1,640 | SMM 13.5 para 11 gives 30°; Patrick 23:29Z "only shrink the circle for the orbit" | keep 1ea9da1's orbitRadiusFt; the orbit's loss is whatever the drag gives, never a fitted number |

What the whole-polar scale means physically: the aircraft is treated as 12 % draggier than the chart in every part of the polar when the gear is down. That is a fudge and labelled one; it is the smallest change that gives the SMM pattern without moving the speeds the pilot flies to. The parasite-only alternative (gear 1.36 NM per 1,000 ft fitted on the 1 NM circle) is physically tidier but moves best glide to 100 KIAS; I would not, because the glide ring and the direct-to-threshold speed then move for no reason the sources give.

## (c) What changes in what you built, and what to ask Patrick

In 711d7fe and 1ea9da1:
1. Replace T6A_GLIDE_FLOWN's gearDown 1.18 (a fit on the 0.84 NM orbit) with the whole-polar factor 1.117 fitted on the 1 NM circle. With 1.18 the 1 NM pattern loses about 3,100 ft per 360°, which is why need.mjs found 3,640 ft needed against 3,120 available, and (inferred, not seen) why the planner then flies the early-flap and long-landing workarounds.
2. Keep the flap rows as the chart's steps on top of the pattern gear; re-derive them from the new gear (they come out about 1.19 and 0.98 NM per 1,000 ft). Drop "take flaps early" as a general rule: with the right gear number the pattern reaches Final Key at the SMM height with no flap, and flap comes at the SMM's places (T/O between Low Key and Final Key, landing when assured, 13.8-13.9). Patrick's 23:32Z "take the flaps a bit early as required" stays available to the planner as a tool for a high arrival, not a default.
3. Keep orbits at 30° (1ea9da1). Keep the false High Key aiming at what the 1 NM pattern needs from High Key: with the fit above that is the SMM's 3,000 ft AGL plus 400 ft, so nothing special.
4. Make the two gear figures a Setting under More, "Glide: SMM pattern (default) / Chart", and show which is in use on the planner's readout so a trace says which drag it flew.
5. Then re-run your three dry runs. What I expect (unseen): normal starts land near the first 1,000 ft, H2 crosses the gate near 120 KIAS, final-turn starts cross 2,100 ft near 120 KIAS rather than 100 to 110.

Ask Patrick one question, already asked in the Fable thread with a recommendation: which circle does the 2,600 ft belong to? (a) the 1 NM pattern (recommended; the keys fall out of it), (b) a true 30° orbit (then the pattern loses 3,000 ft and the keys don't fit), (c) his own feet-per-360° from flying it. If he picks (c), refit the same one factor to his number on the 1 NM circle; nothing else changes.

Unsure of: why the aircraft is 12 % draggier gear down than the chart (not in any page I have); whether Patrick flies the pattern at 25° or 30° (the ground picture says 25°); the T/O flap step (always an estimate). Untested: everything in the planner; I ran only the core polar round a circle.

## Patrick's rulings after the consult (5 Oct 23:45-23:47Z, Fable thread)

- "the 2600 belongs to the orbit prior to commencing high key": fit the gear drag on the 30° orbit (SMM 13.5 para 11), not on the pattern circle. Whole-polar factor on the chart's gear-down polar: **1.322** (estimate, fitted; best-glide ratio about 1.13 NM per 1,000 ft, best-glide speed stays 105 KIAS). Model-flown check: 30° orbit at 120 KIAS from 5,000 ft loses 2,600 ft; clean orbit unchanged (1,640).
- "only shrink the circle for the orbit. the PFL on the ground stays the same" (23:29Z): the pattern circle stays 1 NM across (25° of bank at 120 KIAS).
- "the key altitudes budget some fudge. so the altitudes are a target, not an exact performance measurement": the keys stay 5,000 / 3,700 / 3,000 ft MSL as targets. With the fitted drag on the 1 NM circle the aircraft passes Low Key about 3,460 and Final Key about 2,690 (250 to 300 ft under the targets) and a full 360° from High Key ends about 40 ft above the threshold. That is accepted as real life: the gear-only pattern is tight, flap goes out when touchdown is assured, touchdown near the threshold. Patrick was told this consequence (23:47Z) and can change the fit if the aircraft does better.
- Replaces section (b)'s 1.117 and the 1 NM fit. Everything else in (b) and (c) stands: chart polar and speeds kept, flap rows as the chart's steps on top of the pattern gear (re-derive from 1.322), orbits at 30° with their loss from the drag, Setting "Glide: SMM pattern / Chart", no early-flap default.

## FINAL (Patrick 23:47-23:49Z): chart drag as is

Patrick's flying overrode the orbit fit: "IRL I try to be at about the right height for low key and take land flaps quite early and still sometimes land a bit long, depends on the wind" (23:47Z); "more wind from the north or more headwind makes the land flap like an elevator you drop fast" (23:48Z); ruling 23:49Z: **"chart drag as is, keys about 100 ft high, take land flap early lets do that"**. So no gear-drag scaling at all (the 1.117 and 1.322 fits above are withdrawn); the chart polar stands for every configuration; the pattern stays 1 NM; the keys are targets and the aircraft about 100 ft above them is right; landing flap goes out early in the pattern by default. The SMM's 2,600 ft orbit figure is recorded as conservative beside the chart's about 1,980 ft (SMM 13.5 para 11 / 13.6 para 13 versus the max glide chart), both written down per the rule book. PFL rework builds it.
