# Fable review: the Traffic module's PFL and flying code

**Date:** 5 Oct 2026. **Code reviewed:** `main` at DADS v2.10.86 (working tree, merge `42be070`). **Reviewer:** Fable 5.1, high thinking, read-only. **Brief:** `fable-pfl-review-brief.md` in this folder, approved by Patrick.

**Method.** I read `AGENTS.md`, `docs/PLAN.md`, the Traffic folder (spec 4.5, TR-39 to TR-84, testing, future), `docs/modules/shared/flight-math.md`, `src/core/`, all of `src/modules/traffic/pfl.js` and the rest of the flying code, and SMM chapter 13, EFIG p.402 and p.408 and NFM Fig 3-4 (pages cited only). I then ran about 40 single-flight traces of `flyPfl` with Node from the scratchpad (no test suites, no sweeps; scripts stayed outside the repo and this folder). Where a trace is quoted, the numbers come from the code as it stands. Nothing in the repo was changed.

**How numbers are marked.** *(SMM p.N)*, *(EFIG p.N)*, *(NFM p.N)* or *(Patrick, time)* means sourced. *(est.)* means an estimate of mine or of the code's author with no source. Speeds are named: KIAS (what the pilot reads), KTAS (true), GS (ground speed). Heights are altimeter feet MSL unless they say "true".

---

## 1. Summary, in plain words

The PFL code is a capable piece of work: the circle geometry, the keys moved into wind, the wind-drifted glide ring, the energy sums per configuration and the eject rules all read correctly, and from the normal starts (an area PFL at 8,000 ft, a High Key at 5,000 to 5,900 ft, Low Key at 3,700 ft, the break or initial at 190 to 220 KIAS) it lands on the runway in the first 1,300 ft every time I tried, gear at the right place and the gate flags clean. Those are the flights Patrick will mostly watch, and they look right.

The trouble starts when the aircraft is **high** or **inside Final Key**, and all of it comes from a few causes:

1. **The planner will choose a long way round to lose height, and the aircraft then cannot fly it.** When a tangent join to the circle would arrive high, the search prefers a join that "fits", which from a high start means a 270° turn or a join behind the aircraft, i.e. an orbit flown only to lose height. Patrick has ruled that unrealistic. The pursuit follower then saturates at 60° bank, cuts the orbit short, arrives late and still high, dumps gear and both flaps inside two seconds, widens, and two seconds later abandons the widened circle for a direct that lands long and off the side (trace H2: 2,700 ft above the field abeam the threshold ends 435 ft beside the runway, counted as an ejection). A Low Key start 600 ft high turns *away* from the field and glides clean for 1,000 ft before going direct (trace G6).

2. **Height is summed in true feet but compared with altimeter feet.** The temperature model (TR-77) is right in the aircraft but missing from the planner. On a −30 °C Moose Jaw day the plan is about 15% optimistic: the area PFL arrives at High Key 530 ft below the window, abandons the circle, fails the 2,100 ft gate and lands at 118 KIAS; on a +30 °C day it is pessimistic and lands 735 ft longer. On a standard day the error is nil, which is why the tests pass.

3. **The direct plan aims a third down the runway and demands a fresh 2,000 ft straight final.** From a normal final-turn position (400 ft above the field, 2,700 ft from the threshold) the sum says "short", the aircraft bleeds speed to 98 KIAS and ejects at 320 ft above the field, where a pilot would simply finish the turn and land. Late-final starts trade speed to 91 KIAS, hold the gear until 110 to 250 ft above the field, then take gear and both flaps in the last 70 ft. As speed falls the stall line caps the bank, so the line-up cannot be finished: that is the "lands beside the runway" case.

4. **Gear-down drag is about 30% lighter than the SMM's orbit figures**, so the T/O flap comes out right after High Key to make Low Key, and anything above profile lands long because the drag runs out.

5. Smaller: two different zooms (plan by the NFM table, flight by the code's own pull, 20% more height), no round-out (touchdown at 120 KIAS on the glide), a widen sized to zero spare that is abandoned on the next tick, the join search run only at 45° bank when the pilot may use 60°, three copies of the break-speed curve and three of the stall-bank formula, and a handful of constants with no source.

**Against Patrick's rule** ("get on the circle first; gear can come early; drag first only if the alternative is an unrealistic manoeuvre"): the code gets the first half wrong in the high cases (it picks the unrealistic manoeuvre) and never uses the second half (drag is forbidden until the aircraft is on the circle, `dragOk`). The fix is mostly re-ordering what exists: try the join at up to 60° bank; if every join is high, take the nearest join and gear now; widen with a buffer; only then more drag; never an orbit or an S except the SMM's own orbit above the High Key window.

**Structure.** Planner plus pure-pursuit follower is a workable shape, but the follower is a controller, not a pilot: it cuts corners, saturates at 60° bank when the path turns behind it, and the energy sum is on a path it does not fly. I recommend keeping the planner and the 0.1 s pilot, but making the join a held-bank arc at the bank the plan assumed, re-planning only at the keys and at the one-second margin check, and giving every new plan a few seconds' grace before it can be abandoned.

---

## 2. Findings, ranked by how much they hurt the flying

### F1. The planner chooses an orbit to lose height, and the follower cannot fly it (high starts)

**Where.** `src/modules/traffic/pfl.js`: `chooseJoin` lines 479–519 (the `search`, the `best`/`high` choice, the order `one.best ?? run.best ?? one.high ?? run.high ?? chooseDirect`); `joinPath` 260–315 (one turn, left up to 270°, right up to 180°); `dragOk` line 824 (`onCircle() && …`); the carrot follower 751–758.

**Evidence (traces).**

- *H2: inner downwind abeam the threshold, 4,600 ft, 140 KIAS, heading 118, calm* (a pattern PFL after a go-around climb). Plan "Join at Low Key" at θ = 175°, but the path chosen is a 270° left turn (the "fits" join). The follower holds 60° bank for 17 s (heading 118 → 258), 1,400 to 1,950 ft off the planned path the whole time, cuts the orbit and arrives at θ = 230°, 1,151 ft high. Gear, T/O flap and landing flap go out at 4,334 / 4,288 / 4,243 ft (two seconds). Widened at 4,206 ft (919 ft high). Two seconds later margin −104 ft → "Direct threshold" at 4,101 ft. Ground contact 6,221 ft along, 435 ft off the side → `eject`. A pilot 900 ft above Low Key height one mile from Low Key has an easy PFL: gear now, T/O flap, a slightly wider downwind, landing flap at Low Key, land in the first half.
- *G6: Low Key, 4,300 ft (600 ft high), 120 KIAS, heading 118, calm.* Join chosen at θ = 155°, 1,357 ft *behind* the aircraft; it turns away (heading 118 → 219), glides clean (no drag allowed before the join) from 4,300 to 3,308 ft, then "Direct threshold" (margin −594, min-drag margin −151), gear at 2,453 ft, lands 2,861 ft along.
- *C: the perch, 3,500 ft, 120 KIAS, heading 118.* Join at θ = 205° (5,036 ft away) is planned, and abandoned on the first glide tick (min-drag margin −144 ft) for a direct that then shows +306 ft spare and lands 2,356 ft along (see F9).
- *F / F2: outer downwind abeam the departure end, 3,500 ft, 220 KIAS.* Zoom to 4,670, joins the circle at 3,881 ft "high", all three configurations out in two seconds, widens (twice in wind), goes direct at 3,198 ft in wind, lands 3,256 ft along (calm) / 1,839 ft (wind).

**Cause.** `search` ranks a join that fits (`hAtJoin − most ≤ 0`) above every join that is high, however long the path to it; from a high start the only joins that fit are those reached by the longest turn the rule allows (270° left) or by flying past the circle and coming back. That is the orbit-for-height Patrick ruled out (17:51Z). Three things then compound it: (a) drag is forbidden until on the circle (`dragOk` needs `onCircle()`), so the early-gear rule at line 831 can never fire before the join; (b) the follower is pure pursuit with a 1,000 ft carrot *(est.)* on a path drawn for 45° bank, so a path that turns behind the aircraft saturates it at `bankMax` 60°, and `project()` only looks six segments ahead, so once the aircraft is off the path the projection sticks and the carrot stays wrong; (c) the join search is run at one bank only (F10).

**Fix, in pilot terms.** From a high start the pilot does not orbit: he takes the nearest sensible join (the one most in line with where he is going), takes the gear on the way, widens the circle a little if still high, then flaps, and if still high he lands long. In code:

1. In `chooseJoin`, rank joins by turn and straight (as now) *first*, and only prefer a "fits" join over a "high" one when its path is not more than, say, 90° of turn longer *(est.; Patrick's "no S-turn, no orbit" rule is the source of the idea, the 90° is mine)*. Never accept a join whose first turn exceeds 180° unless it is the natural continuation of the aircraft's own turn (a break), which is what the 270° allowance was for.
2. Allow gear before the join when the join is "high" (every join too high even with all drag), and allow it anywhere once the runway is assured, per Patrick's rule. Allow T/O and landing flap before the join only if the join is still high after gear *and* the alternative would be a widen past the limit or an orbit: that is Patrick's "drag first if it would otherwise have to manoeuvre unrealistically".
3. Keep the SMM's orbit above the High Key window (SMM 13.7 para 16, p.47–48) as the one sanctioned orbit; it is already in the code at lines 714–748.
4. Fly the join as a held-bank arc at the bank the plan assumed, with the carrot only for the straight pieces (see F16).

**One test for the PR** (AGENTS.md Testing): a PFL started at Low Key 600 ft high lands on the runway, with the gear down before Final Key, and turns through no more than 180° ± 30° between Low Key and touchdown (pilot-recognisable: it did not orbit or turn away).

### F2. Height needed is summed in true feet and compared with the altimeter (temperature)

**Where.** `neededFt` 407–443 (every piece is `air × drag/weight`, which is true feet of height); compared with `s.alt − ground` at lines 818–822, 831, 834, 840, 889; `chooseJoin` 479–519 (`availFt − toJoin`, `hAtJoin − least − ground`, `atHk ≥ highKeyMinFt`); the High Key lap test line 723–725. The aircraft itself is right: `circuit.js makePilot.step` moves the altimeter by true climb ÷ `heightFactor` (TR-77), and `glideFootprint` line 140 converts to true height correctly.

**Evidence (traces, area PFL 120°/6 NM/8,000 ft, wind 269/15, and Low Key 3,700 ft calm; field temperature set with `setFieldTemperature`).**

| Field temp | `heightFactor` | At High Key | Then | Touchdown |
|---|---|---|---|---|
| standard | 1.000 | 5,111 ft | normal profile | 1,158 ft along, 120 KIAS |
| +30 °C | 1.066 | 5,304 ft | lands long | 1,893 ft along, 120 KIAS |
| −30 °C | 0.853 | 4,579 ft (below the 5,000 window) | "low", gear late at 3,759, direct at 2,967, trades speed | 934 ft along, 118 KIAS, gate failed 25° off |
| Low Key 3,700, −30 °C | 0.853 | – | direct at 2,663, trades speed to 109 KIAS | 867 ft along, 111 KIAS, gate failed |

On a −30 °C day the altimeter reads 8,000 when the aircraft is truly at 7,094 ft (`trueAltFt`), so the planner believes it has 6,120 ft to work with and has 5,214. Moose Jaw sees −30 °C every winter; the error is 15% of the height, about 900 ft from the area. On a standard day the two frames coincide, so the tests cannot see it.

**Cause.** Wrong frame: a true-foot sum compared with an indicated height.

**Fix.** Compare like with like: either divide `neededFt` by `heightFactor(alt)` before comparing with `s.alt − ground`, or convert the altimeter to true with `trueAltFt(s.alt) − trueAltFt(ground)` wherever the sum is compared (seven places listed above). Standard altimetry *(sourced: standard aerodynamics; the code's own TR-77 model)*. Also `DIRECT_TURN_RADIUS_FT` (line 324) is a module-load constant for a standard day at 2,500 ft (1,373 ft at 45° bank, 120 KIAS): it should be computed with today's density, like `circuit.js`'s caches already do (they include `temperatureKey`, TR-83).

**One test:** on a −30 °C field-temperature day the area PFL from 8,000 ft still arrives at High Key inside the 5,000–6,000 ft window and lands on the runway.

### F3. The direct plan aims a third down the runway and demands a 2,000 ft straight final: final-turn starts eject, late finals trade speed and drop gear at 100 ft

**Where.** `chooseDirect` 549–567 (candidates from the aim point outward, 500 ft steps, each needing `altFt − need − ground + trade ≥ 0`); `directPathFrom` 365–394 (turn circle of `DIRECT_TURN_RADIUS_FT` tangent to the centreline `directFinalFt` = 2,000 ft *(est.)* before the aim, and when the aircraft is inside that circle a half-circle is charged, line 389, while the drawn path is a straight line the follower cannot fly); `mustGear` line 826 (`plan.kind !== 'direct'`); the direct margin and trade at 852–855 and 866; `minDragPlan` 531–534 (direct = nothing until lined up).

**Evidence (traces, calm).**

| Start | Result |
|---|---|
| FT1: final turn, heading 230, 2,300 ft (420 ft above the field), 1,200 ft left of the centreline, 2,500 ft short, 45° bank | "Direct threshold" → "Trading speed" → **Eject at 2,204 ft** (320 ft above the field), 98 KIAS clean |
| FT2: heading 240, 2,200 ft, 800 ft left, 1,800 ft short | Eject at 2,157 ft, 99 KIAS |
| FT3: heading 220, 2,400 ft, 1,500 ft left, 3,000 ft short | Eject at 2,230 ft, 97 KIAS |
| D: mid final turn, heading 208, 2,900 ft, 1.17 NM out | Trades speed to 95 KIAS at 2,197 ft; gear 2,125, T/O flap 1,967, landing flap 1,942 (60 ft above the field); touchdown 2,306 ft along at 104 KIAS; gate failed |
| D2: late final turn, heading 250, 2,500 ft | min 91 KIAS; gear at 1,991 (110 ft), both flaps in the next 50 ft; touchdown 96 KIAS |
| FT4: heading 250, 2,150 ft, 600 ft right of the centreline | min 91 KIAS; gear 1,947 (67 ft), landing flap 1,898 (18 ft); touchdown 94 KIAS, gate failed "gear up, no T/O flap" |

For FT1 the aircraft is 2,770 ft from the threshold with 420 ft of height; finishing the turn at 45° bank (R 1,373 ft) and landing on the first 1,000 ft needs about 3,000 ft of air path, about 300 ft of height clean at 1.4 G *(est. from the core glide model)*. The code instead needs a turn circle tangent 2,000 ft before a point at least 500 ft down the runway, finds the aircraft inside that circle, charges a half-circle (4,300 ft), finds nothing on the runway reachable, and ejects because it is already below Low Key height (line 917).

**Cause.** The direct geometry is a base-to-final template (turn circle + straight final), not "continue the turn you are in to the nearest point of the runway". The margin for the drag decision is to the one-third aim point with gear and T/O flap (line 820), so a start that can reach the first 1,000 ft is called short; the trade to the floor is then used to stretch to the aim point while the gear is withheld (direct is exempt from `mustGear`), and the flaps arrive only when the margin turns positive in the last 100 ft. Trading speed also lowers `stallBank` (line 756), so at 91–99 KIAS the follower is capped at about 27–40° bank and cannot finish a line-up; with wind or a wider offset that is the ground contact beside the runway (`|cross| > 150 ft` → `eject`, line 931).

**Fix, in pilot terms.** Inside Final Key you finish the turn you are in, at up to 60° bank if you must (SMM 13.12 para 23 warns against excessive bank on final, p.51; Patrick allows 60° to the gate, 08:34Z), roll out pointing at the nearest part of the runway you can reach, gear down as soon as the runway is assured (SMM 13.17 para 39, p.53), landing flap if there is height to spare, and hold the glide speed: trading speed is for the last few hundred feet of reach, not a substitute for the gear decision. In code: (1) from inside Final Key, plan a single held-bank arc from the present heading to the runway heading, radius from the present speed and a bank up to 60°, ending on the centreline wherever that arc meets it, and measure the margin to the first 1,000 ft (`touchdownFt` *(Patrick 09:49Z)*), not to the one-third aim point; (2) apply `mustGear` to the direct plan too (gear by 2,400 ft or when lined up), and plan landing flap when the margin allows, as on the circle; (3) only eject when no point on the runway is reachable with gear down and the speed trade counted. Numbers: 60° bank *(Patrick)*, 120 KIAS gear down *(SMM 13.9 para 18, p.48–49)*, 1,000 ft touchdown zone *(Patrick 09:49Z)*.

**One test:** a PFL pressed in the final turn 400 ft above the field, 1,200 ft left of the centreline and 2,500 ft short, lands on the runway with the gear down and never slower than 110 KIAS before the round-out *(110 = 120 KIAS gear-down speed less the shared ±10 kt margin)*.

### F4. Gear-down drag is about 30% lighter than the SMM's orbit losses, so the T/O flap comes out just after High Key and high starts land long

**Where.** `src/core/t6-performance.js` `T6A_GLIDE` 182–188 (gear down 1.5 NM per 1,000 ft at 105 KIAS, T/O flap 1.3 at 110, landing 1.1 at 95) and `glideDragPerWeight` 221–225 (the parasite term scaled by the square of the ratio of best-glide ratios). `pfl.js` 828–835 (the early-drag rule, "before it only with height to spare", 100 ft buffer *(est.)*).

**Evidence.** A 360° orbit at 120 KIAS, 0.5 NM radius, 4,500 ft, from the core model: clean 1,652 ft; gear 2,013 ft; gear + T/O flap 2,368 ft; gear + landing flap 2,932 ft (my computation with the repo's functions). The SMM gives about 1,700 ft clean and about 2,600 ft gear down for the orbit (SMM 13.5 para 11, p.45–46). Clean agrees; gear down is 23% light, so the planned half-orbit from High Key at 5,000 to Low Key at 3,700 (1,300 ft, which matches the SMM's 2,600 per orbit) cannot be flown gear-only in the model: the trace from High Key at exactly 5,000 ft (practice) takes gear at 4,960 and **T/O flap at 4,776 ft**, 160° before its planned point at Low Key, and still arrives at Low Key 3,696. From 5,500 ft the same, plus a 2,280 ft false-High-Key extension. Once every configuration is out there is nothing left but widening, so every foot of excess height lands about 7 ft long (landing-flap glide 6.7:1).

**Cause.** The gear-down chart speed in `T6A_GLIDE` is 105 KIAS but the PFL flies 120 KIAS; the drag fit is anchored to the best-glide point, and at 120 KIAS with the gear down the model's drag rise is gentler than the SMM's orbit figure implies. Whether the chart (max glide, feathered) or the SMM (practice, idle, 120 KIAS) is the right anchor for a practice PFL is Patrick's call (question Q1).

**Fix.** Either scale the gear-down and flap drag so that the model's orbit losses at 120 KIAS match the SMM's 1,700 / 2,600 ft *(SMM p.45–46)*, keeping the clean fit as it is, or keep the chart ratios and accept that the sim needs T/O flap early. I recommend the first: the SMM numbers are the ones Patrick's PFL is built on, and the plan's drag points (gear at High Key, T/O flap at Low Key, landing flap at Final Key, TR-39) only work with them. The spec's settings table should then carry both numbers with their pages. **One test:** from High Key at 5,000 ft the aircraft arrives at Low Key within ±100 ft of 3,700 ft with gear only.

### F5. The widen uses every foot of spare height, so the next deviation flips it to "direct"

**Where.** `widenPath` 576–599 (`spare(k) > 0` bisection to within 1.5 ft; or the full `maxWidenFt` 6,000 ft *(est.)* if even that leaves spare); the direct trigger at 847 (`marginMin < −100`).

**Evidence.** H2: widened at 4,206 ft with margin +919 → margin −50 one second later → −104 two seconds later → direct. F2: widened at 3,612 (336 ft high) → direct at 3,198 (−111). In both the aircraft was still 200–550 ft off the path at 60° bank when the widen was built from its position with the path's track, so the first corner of the new path cost height the sum had not counted.

**Fix.** Size the widen to leave a buffer (the existing `onProfileFt` 50 ft or `dragBufferFt` 100 ft *(both est.)*), build it only once the aircraft is settled on the circle (bank below 30° and within 150 ft of the path, say *(est.)*), and give any new plan a grace period (5 s *(est.)*) before the direct trigger may fire, unless the margin is below −300 ft *(est.)*. SMM 13.7 para 16 warns against increasing the orbit radius (p.47–48); Patrick allowed the widen for a pattern PFL (TR-48, 10:10Z), so it stays, with a buffer.

### F6. When the join is "high", all three configurations go out in two seconds at the join

**Where.** 824–835: `dragOk` becomes true the instant `onCircle()` is true; then gear (`due`, margin ≥ −50), T/O flap (spare ≥ cost + 100), landing flap (still touches down in the first 1,000 ft) can all pass on consecutive one-second ticks.

**Evidence.** B (inner downwind abeam threshold 3,500/140, calm): gear 3,499, T/O flap 3,481, landing flap 3,447 ft; Final Key passed at 3,400 ft (400 ft high); touchdown 1,838 ft (calm) / 2,037 ft (wind). F: 3,881 / 3,866 / 3,852. G5 (Low Key in 20 kt from 208°, the tuning case in `future.md`): 3,359 / 3,335 / 3,313, touchdown 2,553 ft.

**Cause.** Drag is forbidden before the join, then allowed all at once. This is the mirror of Patrick's rule: he said gear may come early when the circle is still the priority. SMM 13.8 para 17 puts T/O flap between Low Key and Final Key and 13.9 para 18 landing flap when the runway is assured (p.48–49).

**Fix.** Take the gear as soon as the join is known to be high (on the way to it), hold the T/O flap for the planned point unless still high there, and keep the landing flap rule as it is. One configuration change per 5 s *(est.)* as a sanity bound. The G5 case then arrives at Final Key nearer 3,000 ft and the "high starts land long" tuning item in `future.md` mostly goes away with F4.

### F7. Two zooms: the plan uses the NFM table, the flight uses its own pull, and the flight gains about 20% more

**Where.** Plan: `avail = start.alt + zoomT6A(...)` (pfl.js ~655–665) from `src/core/t6-performance.js` 228–335 (NFM Fig 3-4, p.3-12: 2 s delay, 2 G pull to 20° nose up held to 145 KIAS, 0 to +0.5 G push to capture 125, NFM p.3-9). Flight: pfl.js 760–780, 2 G pull (`zoomPullG` 2 *(EFIG p.408)*) until 140 KIAS (`pushOverKias` 140 *(EFIG p.408)*) or 30° climb (`zoomMaxClimbDeg` 30 *(est.)*), bank up to 30° (`zoomMaxBankDeg` *(est.)*).

**Evidence.** E (initial, 220 KIAS, 3,500 ft): planned gain 959 ft, flown 1,167 ft. E2 (break, 190 KIAS): planned 600, flown 720. The apex re-check (880–897) only re-plans when short, so the extra height is handled by earlier drag; the join choice itself was made with 200 ft less than the aircraft arrives with.

**Cause.** Duplicated flight maths with different numbers (AGENTS.md: never write a second copy). The 30° climb cap is an estimate that contradicts the core's cited 20°.

**Fix.** Fly the zoom with `flyZoomT6A` from core (20° nose up, 145 KIAS, NFM) and plan with the same function, so plan and flight agree; keep the EFIG's 140 KIAS push-over only if Patrick prefers the EFIG wording (question Q4). Remove `zoomMaxClimbDeg`.

### F8. No round-out: the wheels touch at 120 KIAS on the glide path

**Where.** 928–938: ground contact is the first step with `s.alt ≤ ground`; `touchdown.kias` is the glide speed; the path angle at contact is 5–10° in the traces.

**Pilot's version.** SMM 13.10 para 19 (p.49–50): a two-stage round-out from the glide, touching down at 80–90 KIAS. The aim point a third down (SMM 13.9 para 18) is where the glide *would* hit; the round-out carries the aircraft on. The code's "touchdown in the first 1,000 ft with landing flap" (Patrick 09:49Z) therefore describes the wheels, and the energy sum should end at the round-out, not the ground.

**Fix.** From about 100 ft above the field *(est.)*, ease the path to about 2° *(est.)* while the speed falls from 120 to 85 KIAS *(SMM p.49–50)*; the energy is already in `speedTradeFt` (the trade from 120 to 85 KTAS at field level is about 240 ft of height, which at a 2° path is about 1,700 ft along *(est. from the energy-height sum)*). Mark the touchdown where the speed reaches 85 KIAS or the ground, whichever is first. This moves the recorded touchdown about 1,500–2,000 ft further along, so the "first 1,000 ft" test in `pfl.test.js` would have to be re-read against Patrick's intent (the aim point or the wheels), with his yes.

### F9. The join search's reachability sum and the decision layer's margin disagree on the same path

**Where.** `chooseJoin` 497–506 (`neededTo` to the join, then `least`/`most` from the join point) versus lines 818–822 (`neededFt(minDragPlan(path), seg, proj.pt, …)` from the aircraft).

**Evidence.** C (perch): `chooseJoin` returns a circle join at θ = 205° as reachable; at the first glide tick the decision layer finds `marginMin` −144 ft on that same path and goes direct, which then shows +306 ft spare. The plan on the tag flips from "Join circle" to "Direct threshold" within a second.

**Cause.** Not pinned down; the candidates are the two-piece sum (join leg stopped at `__end`, then the rest restarted at the join point with a fresh G term and plan index) against the one-pass sum, and the reachable test (`≥ 0`) against the direct trigger (`< −100`) with a different G for the first segment. I am unsure which term carries the 144 ft.

**Fix.** Use one sum for both (compute the join's reachability with the same `neededFt(minDragPlan(path), 0, from, …)` call the loop uses) and add the grace period of F5. **One test:** no PFL changes its plan in the first five seconds after the join is chosen unless the plan is "Eject".

### F10. Does the plan stay inside what the aircraft can do? Mostly, with these exceptions

- **One turn radius for everything.** `DIRECT_TURN_RADIUS_FT` (line 324) is 45° bank at 120 KIAS, 2,500 ft, standard day: 1,373 ft. It is used for the clean join at 125 KIAS (true radius 1,490 ft: 8% tighter than the bank gives, made up by more bank in the follower), for the direct turn circle, and for `leadTurn`. The gliding join is searched only at this radius (`minTurnRadiusFt = turnRadiusFt`, lines 479 and 663–665) although the spec allows 60° to the gate *(Patrick 08:34Z)* and the stall line allows about 62° at 125 KIAS clean (stall 86 KIAS *(Patrick, 30 Sep)*, 5 kt margin *(est.)*). A start that needs 46–60° of bank to join falls through to a straight run, a "high" join or direct though a join existed. **Fix:** pass `minTurnRadiusFt` for 60° when gliding, and compute both radii with today's density.
- **Turn G in the sum.** Line 431 caps the turn at 2 G whatever the configuration's stall line: at 120 KIAS gear down with the 5 kt margin the pilot may only pull 1.74 G *(stall 86 KIAS)*, so a path corner costed at 2 G is one the aircraft cannot fly, though the error is on the safe side. `omega` is from ground speed and the heading change (line 430) while the G uses TAS: mixed frame, second order.
- **The speed-trade floor ignores bank.** `tradeFloorKias` (464–466) is the 1 G stall plus 5 kt; at 30° of bank the clean stall is 92 KIAS, above the 91 KIAS floor. The follower protects itself by capping bank with `stallBank` (line 756), which is what leaves it unable to line up in F3.
- **A straight line through a turn circle.** `directPathFrom` 376–390 draws a straight line when the aircraft is inside the turn circle, which no aircraft flies, while charging a half-circle of height for it.
- **`highKeyPath`** (318–321) costs no turn from the present heading onto the 3,000 ft run-in *(est.; `high-key.js` uses 760 ft, "ratified")*.
- **Zoom bank** 30° *(est.)* and climb 30° *(est.)*: see F7.
- **Pursuit at 60° bank** when the carrot is behind the aircraft (F1), on a path drawn for 45°.
- Nothing asks for a sink the configuration cannot fly: the glide speeds are fixed per configuration (125 clean, 120 gear *(SMM 13.9 para 18)*) and the sum uses the model's drag at those speeds. Good.

### F11. The eject rules work as written; their inputs do not

- **"Obviously short"** (165–171, 883–888; TR-75): the runway's nearest point more than 1.5 *(est.)* glide-ring radii from the ring's centre, i.e. the ring's edge half a radius short. I3 (final, 2 NM out, 620 ft above the field): ring 1.24 NM, runway 2.0 NM away → short; thinks 5 s, ejects at 2,381 ft 1.8 NM out. I (area, 7.4 NM at 5,000 ft): "Eject" at the press, glides toward the field, ejects at 3,700 ft 4.7 NM short (TR-53). Both as specified. The 1.5 is an estimate; a pilot's version is "the runway is outside the ring with no zoom or wind to close it", which is a factor of 1.0 plus the zoom gain. I would keep 1.5 until Patrick says otherwise; the gain from changing it is small.
- **The join search finds nothing** (`kind: 'none'`, line 518): the direct path is flown clean, the tag reads "Zoom: eject" or "Slow to 125: eject" at the press and "Eject" after, drag is never taken, and it ejects at Low Key or 3,700 ft. That matches spec item 15 and Patrick 18:05Z. What is missing is the pilot's third option between runway and ejection seat: inside Final Key with the runway in reach but not the aim point (F3), the code ejects where a pilot lands. Question Q2.

### F12. The gear decision at the 50 ft-low edge

**Where.** Line 831: at the planned point the gear goes if `margin ≥ −onProfileFt` (−50 ft *(est.)*); between −50 and −100 nothing; below −100 the direct trigger. **Assessment:** harmless on its own, because `margin` is to the one-third aim point: a −50 margin lands 300–400 ft before the aim point, still 2,000 ft down the runway. The edge only bites because the same margin feeds `mustGear`'s exemption for direct and the direct trigger. **Fix:** make the drag decisions use the margin to the first 1,000 ft (where it must land) and the "on profile / high / low" words use the margin to the aim point (where it should land). Then −50 ft at the gear point means "will land 350 ft short of the first 1,000 ft", which is a real reason to hold the gear.

### F13. Constants without a source and mismatched twins

In `PFL` (pfl.js 35–115), marked `(est.)` in the code or unsourced: `gOnsetGps` 2 and `gOnsetGps2` 8; `zoomMaxClimbDeg` 30 (contradicts NFM 20°); `zoomMaxBankDeg` 30; `stallMarginKt` 5; `atHighKeyFt` 1,500; `dragBufferFt` 100; `onProfileFt` 50; `stopMarginFt` 2,000; `joinLeadFt` 1,500; `highKeyRunInFt` 3,000; `directFinalFt` 2,000; `lookaheadFt` 1,000; `cutFtPerFtLow` 8; `maxLookaheadFt` 6,000; `widenAboveFt` 100; `maxWidenFt` 6,000; `holdBankSec` 1; `maxAccelG` 0.1; `obviousShortRingFactor` 1.5; `ejectDecideSec` 5. `PFL.stallKias` `[86, 86, 86, 76]` repeats the core's 86 and adds 76 for landing flap with no page. Twins that disagree: `sim.js` line 715 starts the practice PFL "at High Key" from 4,750 ft, `pfl.js` from 5,000 (`highKeyMinFt`); `high-key.js` run-in 760 ft (1/8 NM, "ratified") against `pfl.js` 3,000 ft; the core's zoom (20°, 145 KIAS) against pfl.js's (30° cap, 140 KIAS). Spec 4.5's settings table should carry each with its page or "estimate".

### F14. Dead code and duplicated flight maths

- `route.js generatePflTrack`: the old PFL rail with scripted heights (forbidden by spec 4.5 item 3), still used by `scene.js` for drawing; `pflRail` fields in `sim.js`/`tick-aircraft.js` (about 12 references). Candidate for removal once the drawing uses the flown path.
- The break-speed curve 220·e^(−0.452u) in three places: `circuit.js breakKias`, `route.js` ~222 and ~654.
- "Bank at the stall line" three times: `pfl.js` 756 (`acos(1/stallG)`), `breakout.js` and `evade.js` (`bankDegFromG(0.9 × stallLimitG)`), with different margins (5 kt vs 10% G).
- `speedTradeFt` (467–471) is the difference of two `energyHeightFt` (core 111–114).
- `glideFootprint` line 144 converts kt to ft/s inline instead of `ktToFtps`.
- Ground-radius scaling `R × ((v + wind)/v)²` in `high-key.js`, `closed-pattern.js` and `circuit.js readyToTurnOnto`.
- Two zooms (F7). Two High Key heights and two run-ins (F13).

### F15. The rest of the flying code, lighter

- **circuit.js.** `makePilot.step` is in the right frames: heading rate from TAS and bank, ground vector = TAS vector + wind, altimeter by true climb ÷ `heightFactor`, IAS from TAS × √σ. `powerClimb` uses excess thrust at the real G. The final glide rate uses ground speed correctly. `breakTurnSec`/`finalTurnSec` caches include `temperatureKey` (TR-83 done). `bankFor` (3° per degree of error, 1 s lead) is a controller gain *(est.)*, acceptable. No turn costed at 1 G found.
- **route.js.** `computeWindPerch`, `simulateBreakArc`, `buildRoundedPoints` (PAT1 `trueArcs`) are consistent in frame; `pathCache` signature includes `temperatureKey`. Duplicated break curve (F14). `generatePflTrack` dead (F14).
- **sim.js.** `startHighKeyClimb` starts the practice PFL at once within 1,500 ft of High Key and 4,750 ft (vs 5,000 in pfl.js, F13). The hand-over from the PFL's end to `goFromRunway` is a `startJoin` blend over up to 15 s that absorbs about 50 kt and some height: check on screen that it does not look like a jump at the touchdown (unseen by me).
- **deconflict.js.** Predictions extrapolate the current ground speed and track for the whole 15 s window; a turning aircraft's prediction is a straight line. Adequate for a flag, not for the 3D geometry; no frame fault.
- **evade.js.** `buildFlinch` holds speed at 60° bank: I checked the excess thrust-to-weight at 140 KIAS, 3,500 ft, 2 G is +0.112 with the core model, so the aircraft can; at 220 KIAS also positive. `flyRejoin` accelerates at a flat ±2 ft/s² *(est.)* not from the performance model: a wrong-frame-adjacent shortcut, harmless at circuit speeds. `extendLimitFt` unsourced.
- **randomize.js.** Nothing in the flying frame; the random starts respect the configured speed kinds.
- **high-key.js.** Dubins path to the 760 ft run-in with `Rg = R × ((v+wind)/v)²` as a ground-radius estimate for a headwind component only; fine for a positioning climb, duplicated (F14).
- **Hand-overs.** `path-follower.js startJoin` (quintic Hermite, T ≤ 15 s) is used for every seam I found; the only seam I could not check is PFL-end → runway → `goFromRunway` on screen.

### F16. Structure (question 6)

Planner plus carrot follower is the right *split* (a glide is a plan; the pilot flies it) but the wrong *follower*. Pure pursuit on a 5°-stepped path with a 1,000 ft carrot cuts every corner, so the energy sum is on a path the aircraft does not fly; when the path turns behind the aircraft it saturates at 60° bank for as long as it takes (F1); "cut inside when low" by stretching the carrot (lines 752–753, 8 ft per ft low *(est.)*) is a controller's trick where the SMM says to fly direct to the next key (13.6 para 15, p.46–47). A planner of held-bank and configuration segments, re-planned at the keys and when the one-second margin crosses a threshold, would fly like a pilot and make the energy sum exact on the flown path. The middle road, which I recommend because it keeps the working geometry: keep `pflGeometry`, `arcToAim`, `neededFt` and the decision layer; make `joinPath` and `directPath` return held-bank arcs (bank, radius, direction) plus straights, fly arcs at that bank with the pilot model and the straights with the carrot; re-plan a tangent join to the *next* key when low instead of stretching the carrot; and add a plan grace period. Dead code and duplicates: F14.

---

## 3. Questions only Patrick can answer

Each one line, with options and my recommendation. The working answer (what the tool should do until he replies) is the recommendation.

- **Q1. Gear-down drag: which figure does the sim trust?** Options: (a) keep the T-6A glide chart ratios as fitted in core (gear-down orbit 2,013 ft, T/O flap early is then normal); (b) scale gear and flap drag so the orbit loses 1,700 ft clean and 2,600 ft gear down at 120 KIAS as SMM 13.5 para 11 (p.45–46) says; (c) ask Dad what the aircraft actually loses per orbit gear down at 120 KIAS. Recommend (b), and put (c) on the questions-for-Dad list.
- **Q2. Inside Final Key, runway reachable but not the aim point: land ahead or eject?** Options: (a) land on whatever part of the runway the turn reaches, gear down, as a pilot would (first-third rule waived inside Final Key); (b) eject as the code does now, in the spirit of SMM 13.17 para 40 (p.53); (c) land but flag "outside the first third" on screen. Recommend (c).
- **Q3. May a direct take gear and flap like a normal approach once the runway is assured?** Spec 4.5 item 10 lets it land gear up. Options: (a) gear by 2,400 ft or when lined up, flaps if the margin allows (same rules as the circle); (b) keep "gear only if it fits, else gear up". Recommend (a); the gear-up landing stays only when the sum says the gear would put it short.
- **Q4. Zoom: whose numbers?** Options: (a) NFM Fig 3-4 / p.3-9 (20° nose up, 145 KIAS, then push to 125), used for plan and flight; (b) EFIG p.408 (2 G pull, push through 140, capture 125) for both; (c) keep the two as they are. Recommend (a) for the gain and the attitude, with the EFIG's 140 KIAS push-over noted in the spec as the Moose Jaw technique; never (c).
- **Q5. Does "no orbit only to lose height" exempt the SMM's orbit above the High Key window (13.7 para 16)?** Options: (a) yes, the High Key orbit and false High Key stay as built; (b) no, above the window the aircraft extends only. Recommend (a).
- **Q6. Round-out and touchdown speed: add them?** Options: (a) two-stage round-out to 80–90 KIAS per SMM 13.10 para 19, touchdown mark where the wheels touch, and the "first 1,000 ft" test re-read against the wheels; (b) keep touchdown on the glide at 120 KIAS and treat the mark as the aim point. Recommend (a), small change, visible on screen.
- **Q7. Structure: which shape for the next PFL work?** Options: (a) the middle road in F16 (held-bank arcs for joins and the direct, carrot for straights, re-plan at keys, grace period); (b) a full re-write as a segment planner; (c) keep pure pursuit and fix F1–F6 inside it. Recommend (a).

---

## 4. What I did not look at, and what I am unsure of

**Not looked at.** The screens, the 3D view, `scene.js` beyond its use of `generatePflTrack`, `ejection.js` (picture only), `nav-plans.js` beyond `makePflFromArea` and `onProfileAltFt`, `closed-pattern.js` beyond the duplicated radius scaling, the relay and weather fetch, the test files' bodies (names only), and anything on screen: every statement above is from reading and Node traces, not from the running app. I did not run the test suites or any sweep. I did not use the flight manual.

**Unsure of.**
- The 144 ft disagreement in F9: I have the symptom and two candidate terms, not the proof.
- Whether the T-6A glide chart's gear-down speed (105 KIAS in `T6A_GLIDE`) or the SMM's 120 KIAS practice technique is the right anchor for the drag fit (Q1): this is a flying-knowledge question.
- My time labels in the traces were index-based and inflated; I quoted heights and positions instead, which are exact.
- The hot-day figure in F2 (+193 ft at High Key) is smaller than the frame error alone predicts (about +400 ft); the difference is probably the wind-triangle effect of the higher TAS on a 15 kt crosswind and I did not separate the two.
- The one test suggested per fix is written in pilot terms; the margins I used are the shared table's (±100 ft, ±10 kt) unless I said why.
- The version label: the brief says v2.10.86; `src/modules/traffic/version.js` holds the on-screen value and I did not check it matches.
