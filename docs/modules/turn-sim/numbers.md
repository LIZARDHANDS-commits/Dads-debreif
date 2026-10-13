# Formation Sim numbers register

Every number the Formation Sim's planners use, with the source written beside it in the code (refactor PR 4, TS-95). It is the tuning sheet's one page (TS-214): the aircraft's limits from core, then the Formation's handling, Lead's and the wingmen's technique and hands. Made by `node tools/turn-sim-numbers.mjs` from core `t6-performance.js` and `src/modules/turn-sim/live/` handling.js, rates.js, lead-moves.js, wing-moves.js, moves.js and bands.js (`tuning.js` re-exports them); do not edit by hand. "Estimate" means no manual page or ruling backs it yet. The formations' own places and bands are in `slots.js` and `judge.js`. Not in the sheet yet: the 4-ship's numbers (four-*.js, joining at plan Step 12.8), the training errors (errors.js), the optimiser's scoring (optimise/) and the planners' search effort.

## The aircraft: the T-6A's own limits (core, shared with every module) (`src/core/t6-performance.js`)

| Number | Value | Source and note |
|---|---|---|
| T6A_LIMITS |  | The T-6A flight envelope and airspeed limits (clean, at 5,168 lb; reference data). stallKias is the 1 G stall speed: 86 kt, which Patrick kept (2026-09-30 09:29Z). The envelope itself reads about 89 kt (7 G near 236 KIAS), and the sustained-turn data imply about 83 kt at maximum power (likely because power on lowers the stall speed). 7 G at 227.5 KIAS matching VO (227) is a coincidence. mmo is the |
| T6A_LIMITS.maxG | `7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1` |  |
| T6A_LIMITS.stallKias | `86, voKias: 227, vmoKias: 316, mmo: 0.67, weightLb: 5168` |  |
| T6A_ROLL | `Object.freeze({ rollPerKtasDps: 0.58, maxRateDps: 200, fullRateSec: 0.3, onsetSec: 0.2 })` | The T-6A's roll and G onset: the one aircraft limit every module stays under (Patrick 5 Oct 2026 22:01Z, "okay, let's do that"; whole-tool decision with the Docs keeper; Formation's part TS-85). ESTIMATES from standard aerodynamics (Fable's performance audit, 5 Oct 21:59Z-22:01Z): no manual in the project files gives them, so they stay estimates until Patrick corrects them. - full-stick roll rate: |
| T6A_G_ONSET | `Object.freeze({ maxRateDps: 4, maxAccelDps2: 16 })` | The T-6A's G onset in easeValue's shape (flight-math.js): G per second, and per second². An estimate (T6A_ROLL). |
| T6A_G_ONSET_CEILING_GPS | `6` | The fastest G ever builds, G per second: the ceiling the envelope gates hold every roll-in under (Formation handling.js, Traffic envelope.js). 6 G/s (ALL-40, Patrick 12 Oct 2026: "make it 6 g/s ceiling"; it was 8, twice T6A_G_ONSET): no pilot source supports more (centrifuge training tops out about 6 G/s; Patrick's recorded pulls peak under 3 G/s). An estimate. |
| T6A_PITCH |  | Pitch attitude: the angle of attack the wing needs on top of the flight path angle. AoA = aoa180Deg × G × (180 ÷ KIAS)², set so the normal 180 KIAS climb shows about 10-12° nose up and the 140 KIAS best-rate climb about 15°, with this model's full-power climb angles (SMM 3.14 para 35; EFIG p.126). With datumDeg it gives Patrick's attitudes within a fraction of a degree (Patrick, 11 Oct 2026 01:26Z |
| T6A_PITCH.aoa180Deg | `2.8` |  |
| T6A_PITCH.datumDeg | `2.6` |  |
| T6A_PITCH.takeoffFlapAoADeg | `-1.7` |  |
| T6A_PITCH.landingFlapAoADeg | `-3.3` |  |
| T6A_PITCH.onGearDeg | `2.5` |  |
| T6A_GLIDE |  | The T-6A max glide data (engine inoperative, IAS; PT6A-68; reference data; Patrick's upload 06:33Z; SMM 13.5 para 7 agrees on 2 NM at 125). chartSinkFpm is the reference sink rate, which works out as the glide ratio at about 16,000 ft; glideSinkFpm gives it at any height. The flapsTakeoff row is an estimate, interpolated between gear down and landing flap; no source gives it (Patrick, 4 Oct 2026 0 |
| T6A_GLIDE.clean | `Object.freeze({ kias: 125, nmPer1000Ft: 2.0, chartSinkFpm: 1350, prop: 'feathered', dragIndex: 0 })` |  |
| T6A_GLIDE.gearDown | `Object.freeze({ kias: 105, nmPer1000Ft: 1.5, chartSinkFpm: 1500, prop: 'feathered', dragIndex: 20 })` |  |
| T6A_GLIDE.flapsTakeoff | `Object.freeze({ kias: 110, nmPer1000Ft: 1.3, chartSinkFpm: 1816, prop: 'feathered', dragIndex: 50 })` |  |
| T6A_GLIDE.landing | `Object.freeze({ kias: 95, nmPer1000Ft: 1.1, chartSinkFpm: 1850, prop: 'feathered', dragIndex: 80 })` |  |
| T6A_GLIDE.windmilling | `Object.freeze({ kias: 110, nmPer1000Ft: 1.0, chartSinkFpm: 2350, prop: 'windmilling', dragIndex: 0 })` |  |
| ZOOM_GAIN_TABLE |  | The zoom reference data: height gained after an engine failure, engine secured and prop feathered, gear and flaps up; 2 s delay, 2 G pull to 20° nose up held to 145 KIAS, then a 0 to +0.5 G push to capture 125 KIAS (reference). Its lightest and heaviest rows, [speed][altitude]; the rows between are straight lines from these to within 1 ft. |
| ZOOM_GAIN_TABLE.kias | `Object.freeze([200, 250])` |  |
| ZOOM_GAIN_TABLE.altFt | `Object.freeze([500, 1500, 3000, 6000])` |  |
| ZOOM_GAIN_TABLE.lightLb | `5400` |  |
| ZOOM_GAIN_TABLE.heavyLb | `6500` |  |
| ZOOM_GAIN_TABLE.light | `Object.freeze([Object.freeze([595, 621, 649, 794]), Object.freeze([1172, 1232, 1297, 1487])])` |  |
| ZOOM_GAIN_TABLE.heavy | `Object.freeze([Object.freeze([738, 757, 768, 883]), Object.freeze([1299, 1347, 1410, 1552])])` |  |
| T6A_MANOEUVRE |  | How the model flies a manoeuvre (Patrick, 2026-09-30 09:27Z; SMM 14.16). - shakerMarginKt: pulls fly in the stick shaker, not on the stall line. The shaker comes on about 5 to 10 kt above the stall (reference); 7 kt here. - splitSMaxG: the most G the split S pulls; Patrick: "Split S goes up to 5 G" (AIF 2410's maximum; SMM Table 14.1 gives about 4 G). - rollRateDegPerSec: the roll inverted, at SPE |
| T6A_MANOEUVRE.shakerMarginKt | `7, splitSMaxG: 5, rollRateDegPerSec: 90, splitSNoseUpDeg: 20, splitSRollG: 0.5` |  |
| T6A_AOA | `Object.freeze({ shakerUnits: 15, stallUnits: 18 })` | The angle of attack indexer, in units (Patrick 12 Oct 2026: the stick shaker comes on at 15 units, and a pilot may ease on to 17; SMM 14.14 para 33: 17 units is just under the 18-unit stall). |

## Handling: how the steppers fly the aircraft on top of its limits (`handling.js`)

| Number | Value | Source and note |
|---|---|---|
| G_ONSET_CEILING | `T6A_G_ONSET_CEILING_GPS` | The fastest the gate lets G build (G per second): core T6A_G_ONSET_CEILING_GPS, 6 G/s (ALL-40; it was 8, twice the normal 4 G/s). Patrick 5 Oct 23:27Z: "higher than 4 occasionally is fine thats life as a pilot": 4 G/s is the normal pull, not a wall; the gate only stops a pull no pilot could make. Traffic reads the same core number. |
| GATE_G_MAX_BANK_DEG | `85` | Steeper than this the level-turn G (1 / cos bank) is not this model's (a lag roll through the inverted): the gate holds the roll only (flight.js), and the pilot's G shaping leaves it to the roll alone (pilot.js). An estimate. |
| CLIMB_CATCH_SEC | `0.3` | The time the last of a climb-rate change is closed over (seconds; an estimate), so the pull settles without flickering. Since V2.348 it is 0.3 s, not 0.1, so the G onset's own build (16 G/s²) keeps up and the climb rate comes onto the one wanted without passing it. |
| LEVEL_OFF_SEC | `1` | A level-off closes its climb rate over this long (seconds; an estimate), and uses at most this pull or push (G either side of 1; an estimate). |
| LEVEL_OFF_PULL_G | `1` |  |
| PUSH_MARGIN_DEG | `45` | The push is taken only when its wings are this much nearer than the pull's: positive G is the pilot's way (estimate). |
| POWER_MAX_FROM | `0.985` | From this share of full power the power is MAX: the tag says MAX from this share of full-power thrust (power.js, so it does not flick between MAX and 99% at full power), and the pilot flies MAX from this share of full power's acceleration (pilot.js). One number for both (they were two copies of 0.985); an estimate. |
| ENGINE | `Object.freeze({ quickSec: 0.25, idleTorquePct: 5, idleLagSec: 3.5, idleSettleSec: 1 })` | How the engine answers the PCL, every aircraft (TS-218; power.js engineStep is the one model). From 5% torque up the power follows the PCL quickly: the torque's full travel in quickSec, 0.25 s (Patrick 5 Oct 06:02Z: "2 percent to 100 in .25 seconds"; TS-218's words). Once it has sat below idleTorquePct, 5% (Patrick 12 Oct 2026: "if the power is at 5% or more its very responsive, but once you go id |
| PILOT_SLOW_CAP_KTPS | `7.95` | The fastest the wingman's pilot slows, KIAS per second, whatever the power, the boards and the climb give (pilot.js pilotSpeed). No source was written beside it (it came in with the HTRJ change, 2a37a7c3); an estimate. |
| MIN_POSITIVE_G | `0.5` | Nobody pushes below this: Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a) and the live wingmen never ask for less on the lift they have. 0.5 G is an estimate. One number for Lead's push (lead-moves.js LEAD.minPushG) and the live wingmen's floor (wing-moves.js FW_LIVE.minG, LIVE.minG); they were three copies. |

## Rates: the G rule, the rate sets, the Rates setting, roll, banks (`rates.js`)

| Number | Value | Source and note |
|---|---|---|
| CLOSE_BANK_DEG | `60` | A close move's bank cap, every Rates choice (Patrick 5 Oct 06:43Z: "lets do up to 60 for all as requird for now"; it was 30°, 06:16Z item 12, which left the AI's 2.5 s route to echelon out of reach); WING_BANKS below. A slower rate banks less. |
| G_RULE | `Object.freeze({ normalG: 5, lastResortG: 7 })` | The G rule: 5 G is the normal aim (SMM 16.17 para 44a; Gen Book p.11), more only as a last resort and never 7 (TS-60 amendment). Flagged on screen, never a wall; 7 G is the physical limit the planners keep under. |
| G_RULE_BANK_DEG | `bankDegFromG(G_RULE.normalG)` | "No bank cap" (Patrick 06:16Z): the bank of a level turn at the G rule's normal 5 G, about 78°. |
| NO_BANK_CAP_DEG | `bankDegFromG(T6A_LIMITS.maxG)` | No bank cap (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; 04:07:49Z: "no bank cap on rejoins or movements around a station"): only the aircraft's own limits hold: the bank of a level 7 G turn, about 82° (t6-performance.js T6A_LIMITS.maxG; the stall line too, availableG); the G rule is flagged, never a wall. |
| MOVE_TARGET_G | `4.5` | Formation moves pull 4.5 G, the same as the rejoin (TS-205; Patrick 12 Oct 2026 09:40Z card, 09:42Z: "4.5 g is the target, more if required"). Still no bank cap: the bank follows from the G, about 77° level. A target, not a wall: where nothing plans within it the planners' last try keeps the aircraft's own limits (REJOIN.bankCapDeg), flagged on screen. |
| MOVE_BANK_DEG | `bankDegFromG(MOVE_TARGET_G)` |  |
| RATE_SETS |  | Every move flies one of two sets of rates, and this is their one home (Patrick 5 Oct 21:06Z, 21:11Z: the near-Lead throttle is only for holding close formation, "as soon as a tactical formation is selected, unrestricted attitude changes and power"; 20:50Z: "Escelon is smooth to allow 2 to stay in position in tight formation", while "Fithging wing, rejoins, tactical formations, line abreast etc is  |
| RATE_SETS.close | `Object.freeze({` |  |
| RATE_SETS.…leadRoll | `Object.freeze({ maxRateDps: 30, maxAccelDps2: 20 })` |  |
| RATE_SETS.…echelonRoll | `Object.freeze({ maxRateDps: 30, maxAccelDps2: 12 })` |  |
| RATE_SETS.…routeRoll | `Object.freeze({ maxRateDps: 8, maxAccelDps2: 4 })` | Lead's roll-out once a turning rejoin ends in route, 124 ft out: gentler, so #2 rises with Lead's wing plane without a 0.6 G push (Fable's v2272 flight; estimate) |
| RATE_SETS.…frame | `Object.freeze({ lateralFtps: 35, foreAftFtps: 25, verticalFtps: 15, nearPerSec: 0.1, nearMinFtps: 8 })` |  |
| RATE_SETS.…law | `Object.freeze({ powerShare: 0.65, turnShare: 0.35, latG: 0.3, vertFtps2: 3 })` |  |
| RATE_SETS.tactical | `Object.freeze({` |  |
| RATE_SETS.…roll | `Object.freeze({ maxRateDps: 180, maxAccelDps2: 720 })` |  |
| RATE_SETS.…frame | `Object.freeze({ foreAftFtps: 80, verticalFtps: 40, nearPerSec: 10, nearMinFtps: 20 })` |  |
| RATE_SETS.…law | `Object.freeze({ powerShare: 1, turnShare: 1, latG: 1, vertFtps2: 10 })` |  |
| TELEGRAPH | `Object.freeze({ rolledSec: 6.5, easeSec: 1.5 })` | Lead "telegraphs" a close formation turn (Patrick 12 Oct 2026 18:45Z): the roll rate builds smoothly over easeSec, holds steady, and eases back to zero over easeSec, rolledSec from wings level to the bank (and the roll-out the same, his "yes" 18:45Z). A steeper bank rolls faster and builds faster: 30° at 6°/s (4°/s²), 45° at 9°/s (6°/s²), 60° at 12°/s (8°/s²). "It's to quick and suddent right now. |
| CLOSE_SHAPING |  | Nominal shaping targets and soft envelope caps for close-in formation work (SMM 12.4, 12.6, 12.20). Targets, not walls: guidance steers toward the nominal targets, with progressive soft cushion expanding toward the envelope cap if displaced. Scaled so echelon <-> route takes ~10 seconds. |
| CLOSE_SHAPING.targetBankDeg | `8.0` | Patrick's "small bank, gentle power" is the intent; 8° is an estimate (Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 11) |
| CLOSE_SHAPING.envelopeBankCapDeg | `15.0` |  |
| CLOSE_SHAPING.targetLateralFtps | `32.0` | ~19 kt lateral drift (estimate, row 11) |
| CLOSE_SHAPING.targetFwdFtps | `32.0` | ~19 kt fore/aft rate (estimate, row 11) |
| CLOSE_SHAPING.targetCornerFtps | `24.0` | corner flow rate, about 14 kt (estimate, row 11) |
| CLOSE_SHAPING.lineFwdFtps | `10.0` | echelon to route and back, along the line: the rate power sets fore and aft, about 7 kt (Patrick 11 Oct 2026 06:24Z: "crack off some power to set a rate"; estimate) |
| CLOSE_SHAPING.lineAccelFtps2 | `1.5` | ...set and taken off at about this, about 0.9 kt/s, so power keeps up with it (estimate) |
| CLOSE_SHAPING.lineLeadSec | `2.0` | ...and he starts taking the rate off this much early, leading the power, which answers late (estimate) |
| CLOSE_SHAPING.targetOvertakeKt | `8.0` | power trim |
| CLOSE_SHAPING.targetUndertakeKt | `8.0` |  |
| CLOSE_SHAPING.envelopeMaxOvertakeKt | `10.0` |  |
| CLOSE_SHAPING.envelopeMaxUndertakeKt | `10.0` |  |
| CLOSE_SHAPING.wakeClearanceDownFt | `15.0` | below prop wash |
| CLOSE_SHAPING.wakeClearanceAftFt | `12.0` | behind tail |
| CLOSE_SHAPING.advanceTolFt | `6.0` |  |
| CLOSE_SHAPING.finalTolFt | `5.0` | SMM close formation band (5 ft) |
| CLOSE_SHAPING.settleFtps | `3.5 * KT_TO_FTPS` | ~3.5 kt settle rate inside band |
| CLOSE_BANK_CHOICES | `Object.freeze([30, 45, 60])` | Bank angle choices for close formation turns (echelon, route, line astern). |
| DEFAULT_CLOSE_BANK_DEG | `60` |  |
| CLOSE_IN_SEC | `Object.freeze({ student: 10, instructor: 5, ai: 2.5 })` | How long each Rates choice takes from route to echelon, from the press to IN POSITION, seconds (Patrick 5 Oct 06:11Z: "student should take 10 seconds to get from route to eschelon ..., IP takes 5, AI takes 2-3? use that as a close in rate gauge"; AI's 2.5 is the middle of his 2-3). From it comes the close-in closure (closeInFtps below): the closure rate that flies route to echelon in that time wit |
| REJOIN_CLOSURE_KT | `Object.freeze({ student: 15, instructor: 25, ai: 50 })` | A rejoin's closure for each Rates choice, knots (Patrick 5 Oct 06:09Z: "Student keeps 15 knots, instructor 25 knots, all the way up into "route" or "corner" or "decision point" (whichever happens as a part of that rejoin) then they run in"; AI's 50 is an estimate, the thread's pick: double Instructor's). Held until #2 reaches the point the rejoin passes through (route, the corner, or the decision  |
| REJOIN_LINE_KIAS | `Object.freeze({ student: 210, instructor: 220, ai: 235 })` | The speed a rejoin aims for down the line (or up Lead's six) to the decision point, KIAS, by Rates choice (Patrick 6 Oct 15:54Z: "Let's do 210 220 235 . These are targets not requirements. Gemoetry first and speed if possible for rffecicney"; TS-133): turning rejoins and the straight-ahead rejoin both. A target, not a requirement: where the geometry has no room for it, the rejoin searches flies a  |
| EXPERIENCE |  | The Rates setting as an experience profile (clean-up step 5, TS-141; the review's report 6.4 A, Patrick 6 Oct 21:58Z): one row per level that every move reads, setting how boldly he uses the aircraft, never what the aircraft can do. The envelope gate (flight.js, TS-93), the windows and the bands (the manuals', TS-110) are the same for every level. Bank and G are not set by Rates (Patrick 5 Oct 06: |
| EXPERIENCE.student | `Object.freeze({ closeInSec: CLOSE_IN_SEC.student, rejoinClosureKt: REJOIN_CLOSURE_KT.student, lineKias: REJOIN_LINE_KIAS.student, rollShare: 1, gOnsetGps: 2, coneShare: 0.5, leverShare: 0.5 })` |  |
| EXPERIENCE.instructor | `Object.freeze({ closeInSec: CLOSE_IN_SEC.instructor, rejoinClosureKt: REJOIN_CLOSURE_KT.instructor, lineKias: REJOIN_LINE_KIAS.instructor, rollShare: 1, gOnsetGps: 3, coneShare: 0.8, leverShare: 0.75 })` |  |
| EXPERIENCE.ai | `Object.freeze({ closeInSec: CLOSE_IN_SEC.ai, rejoinClosureKt: REJOIN_CLOSURE_KT.ai, lineKias: REJOIN_LINE_KIAS.ai, rollShare: 1, gOnsetGps: 4, coneShare: 1, leverShare: 1 })` |  |
| RATE_CHOICES | `Object.freeze(Object.keys(CLOSE_IN_SEC))` | The Rates choices in screen order, and their words. |
| RATE_WORDS | `Object.freeze({ student: 'Student', instructor: 'Instructor', ai: 'AI' })` |  |
| DEFAULT_RATES | `'instructor'` |  |
| CLOSURE |  | The power profile (Patrick 5 Oct 04:58Z: "setting a higher power setting until a rate is "Set" then reducing the powr to "maintain that rate", then as the aaircraft approaches the position it wants to be in, it does the opposite... low power until its stopped in position, then increase to maintain"; 05:47Z: "We can use power to "assertively set the rate""; 05:54Z: "speed brake can be used to help  |
| CLOSURE.stopShare | `0.6` | the tracker's stop is planned at 60% of what power back (sideways: the slide's bank) gives, so the roll and the speed loop's lag still stop him on the slot (estimate) |
| CLOSURE.slideBankDeg | `CLOSE_BANK_DEG` | sideways the closure is set and stopped with up to the close move's 60° of bank (Patrick 06:43Z; 30° from 06:16Z until then), the same for every Rates choice (Patrick 06:07Z: "No on bank and g") |
| CLOSURE.nearGain | `1` | 1/s: inside the last few feet the closure dies away in proportion to the distance, so he settles without hunting; sideways only, fore and aft it is the tracker's own TRACKER.gain.position (V2.23.1) (estimate) |
| CLOSURE.farGain | `0.1` | ft/s per ft: beyond the hand-over band (odd starts only, the tracker's fallback) the closing speed may grow with range (the old rejoin's kcap) |
| ENGINE_RESPONSE_SEC | `ENGINE.quickSec` | How fast the engine answers the power lever: torque from 2% to 100% in about 0.25 s (Patrick 5 Oct 06:02Z: "The TQ can change very fast. 2 percent to 100 in .25 seconds."). A power change in the power profile (MAX, the power that holds the rate, IDLE, the power that holds the slot) reaches its new thrust in this long, so the acceleration it gives is there within it, then follows thrust minus drag. |
| RATE_SET_SEC | `2` | How long a change of rate takes: the power step is the smallest that reaches the new rate in about this long (an estimate, the thread's default for Patrick's 06:13Z technique: "set 90 or 100 to set it, then reset to 67 to maintain it"). |
| HAND_OVER_FT | `500` | Where a rejoin's closure gives way to the close-in rate: about 500 ft from the slot (Patrick 5 Oct 06:24Z; before it, card "Lines, then tracker" 05:41Z and 05:44Z: "within 500-1000 feet, dpending on whats going on. becuase we start to see the aspect change and the clusre visually and adjust to that"). Until the kinematic lines were removed it was also where a line handed over to the tracker. choos |
| WING_BANKS |  | The wingmen's banks, 2-ship (step 2) and 4-ship (step 3) (Patrick 5 Oct 06:16Z). Item 12: "30 is probably more accurate" for a close move's bank cap (the tracker's 25° until step 2); "When the aircraft is kicked off to fighting wing or line abreast they can use unlimited bank to dive away and get in position quickly": no cap there but the G rule. Item 11: "No, unlimitedf": a wingman following in a |
| WING_BANKS.closeBankCapDeg | `CLOSE_BANK_DEG` | Patrick 06:43Z: up to 60° as required (30° from 06:16Z item 12 until then) |
| WING_BANKS.kickOutBankCapDeg | `MOVE_BANK_DEG` | moves around a station: no bank cap, the moves' 4.5 G target (TS-205; the aircraft's own limits from V2.116, Patrick 6 Oct 04:07Z, until V2.395; the G rule only, 5 Oct 06:16Z item 12, until V2.116) |
| WING_BANKS.fwFollowBankCapDeg | `G_RULE_BANK_DEG` | Patrick 06:16Z item 11: the G rule only |
| WING_BANKS.rejoinBankCapDeg | `MOVE_BANK_DEG` | rejoins: no bank cap, the moves' 4.5 G target (TS-205; the aircraft's own limits from V2.116, Patrick 6 Oct 04:07Z, until V2.395; the G rule only, 5 Oct 06:16Z item 1, until V2.116) (the 4-ship's rejoin legs since step 3) |
| WING_BANKS.fwTurnBankDeg | `60` | Patrick 06:16Z item 9: 60° of bank, 2 G level, every fighting wing turn |
| ROLL | `RATE_SETS.tactical.roll` | Roll limits: up to 180°/s (Patrick 5 Oct 06:07Z: "Roll rate can be 180 degrees per second"; 90°/s until step 2, Patrick 4 Oct 08:54Z), building and dying away at 720°/s² (an estimate, step 2: 180°/s is reached in 0.25 s and within a 45° roll; it was 360°/s², Patrick card 4 Oct 09:54Z, which reaches 180°/s only in a roll of 90° or more). |

## Lead: the moves Lead flies, in the programme and in fluid (`lead-moves.js`)

| Number | Value | Source and note |
|---|---|---|
| LEAD_ROLL | `Object.freeze({ maxRateDps: 90, maxAccelDps2: 90 / T6A_ROLL.fullRateSec })` | Lead's roll into and out of a turn: up to 90°/s, its rate built at the T-6A's (full rate in T6A_ROLL.fullRateSec) and the build itself over the T-6A's onset (T6A_ROLL.onsetSec, 0.2 s), never past the aircraft at this speed (Patrick 12 Oct 2026, TS-222: "90/S is good. it's smoothd, of course"). A technique share of the aircraft's full-stick roll (ALL-39), not a limit of the aircraft: fluid Lead's l |
| LEAD_ROLL_STATE | `Object.freeze({ plannedRoll: true, rollAccelDps2: 0, rollAccelForRateDps: 0 })` | Lead's roll is planned, not chased: built over the T-6A's 0.2 s onset, the roll-out started where the wings will stop on the bank wanted, so he never rolls past it (core easeRoll plannedStop; Patrick 12 Oct 2026: "can we just make this simple?", against a PID). The chase had him ring about 15° past wings level from 30° of bank. The programme Lead carries these (formation.js, four-ship.js); fluid L |
| LEAD_POWER | `Object.freeze({ minTorquePct: 20, maxTorquePct: 80 })` | Lead's torque stays between 20% and 80% in formation, every case except fluid manoeuvring (MAX) and line abreast (Patrick 12 Oct 2026, TS-216: "make the min tq for lead 20%, max 80% in call cases (except FM and LAB)"; the 20% from SMM 12.31 and EFIG p.395; the 80% his 12 Oct 08:39Z and 09:17Z rulings, TS-203 and TS-204). So Lead never goes idle in formation and never meets the engine's lag from id |
| TURN_G | `3` | Line abreast turns: about 70° of bank at 3 G (SMM 16.18 para 50; Figs 16.15-16.21 "70/3"). |
| TURN_BANK_DEG | `bankDegFromG(TURN_G)` |  |
| VERTICAL_MISS_FT | `300` | Crossing turns pass at least this far apart vertically (SMM 16.13 para 31; 16.19 paras 61, 64). |
| CHECK_DEG | `20` | The check turn's angle: the R/T example "check 20" (2 CFFTS Orders B2 ch 8 p.103). Working answer, Patrick to confirm. |
| CROSS_FIRST_BANK_DEG | `Object.freeze([20, 75])` | The cross turn's first stage may be flown between these banks to roll out at the spacing ("60/2, or as required", Fig 16.21). |
| BREAK | `{ delaySec: 3, bankDeg: 60 }` | 60° level is 2 G (1 / cos 60°) |
| BREAK_DELAY_CHOICES | `Object.freeze([3, 4, 5, 6, 8])` | the setting's choices (estimates); 3 s the default (TS-217) |
| LEAD |  | The numbers Lead flies in fluid manoeuvring (moved from fluid-lead.js, 12.2b). Every one has its source; "estimate" where no manual or ruling gives it. |
| LEAD.gOnset | `T6A_G_ONSET` | G per second and per second²: the T-6A's in core (estimate, design 5.3; TS-85) |
| LEAD.levelBanks | `Object.freeze({ gentle: 30, medium: 60, steep: 70.5 })` | AFM7 p.17 (30, 60/2); SMM 16.18 para 50 (70/3, estimate as "steep") |
| LEAD.entryHoldSec | `5` | the entry's 30° bank stage while "all call ready" (AFM7 p.17): 5 s is an estimate |
| LEAD.entryTurn | `false` | The entry turn (AFM7 brief p.17: 30° away, then the chosen bank at MAX) is off: Lead flies straight and level while #2 moves into the fluid picture, and the 360 waits for the Standard sequence (Patrick 5 Oct 22:30Z: "fluid manoeuvring should just move into position to begin, not start a turn yet. the 360 happens when we hit sequence"; TS-86). true flies AFM7's entry turn as before. |
| LEAD.fwKias | `200` | fighting wing speed (TS-53; SMM 12.23 para 53) |
| LEAD.terminateBankDeg | `30` | "gentle" (AFM7 p.17), "predictable" (SMM 16.17 para 46): 30° is an estimate |
| LEAD.terminateTurnDeg | `90` | the most the terminate turn goes before rolling out, if #2 is not back in fighting wing sooner: an estimate |
| LEAD.earlyCueSec | `4` | how long a new turn's lag (into #2) or lead (away from #2) lasts before pure: an estimate |
| LEAD.climbDeg | `15` | the climb or descent angle (design 5.1, an estimate) |
| LEAD.climbChangeFt | `2000` | how far a climb or descent goes before levelling off (an estimate) |
| LEAD.levelOffFt | `800` | the climb eases onto the new height over its last 800 ft (an estimate) |
| LEAD.pitchCueDps | `0.5` | #2 reads Lead's nose as rising or falling past 0.5°/s of pitch rate (an estimate) |
| LEAD.climbPitchDps | `3` | how fast Lead raises or lowers the nose into and out of the climb or descent (an estimate) |
| LEAD.minPushG | `MIN_POSITIVE_G` | Lead keeps positive G (2 CFFTS Orders B2 ch 8 para 1a); 0.5 G at the push over is an estimate (handling.js) |
| LEAD.loopMinKias | `200` | below it Lead refuses the loop (TS-221, Patrick 12 Oct 2026: "Min speed for loop is 200, refuse") |
| LEAD.loopExitTolKt | `15` | the exit within 15 kt of the entry (TS-221); the law aims at the entry speed itself, 15 kt is the check |
| LEAD.loopG | `3.5` | the pull to the vertical, EFIG p.171 "3 1/2 G", inside SMM 7.5 para 11 and Table 7.1's 3-4 G (TS-213) |
| LEAD.loopAoaUnits | `17` | ... but no more than 17 units AOA: past the shaker (15 units) and just under the 18-unit stall (Patrick 12 Oct 2026: "shaker starts at 15 AOA. he can ease up to 17 AOA"; SMM 14.14 para 33). From 230-240 KIAS 3.5 G holds to about 80° nose up, then he rides 17 units to the vertical |
| LEAD.loopDownMaxG | `4` | Lead pulls no more than 4 G anywhere in the loop (Gen Book p.11: Lead +4 G in fluid manoeuvring; TS-213), flagged on the card if the exit needs more |
| LEAD.loopTopMinG | `0.5` | "slight positive G" over the top (SMM 7.5 para 11): 0.5 is an estimate, never reached in the design runs (0.85-1.04 G) |
| LEAD.loopVerticalDeg | `90` | the pull hands over to the nose rate held at the vertical, smoothly (TS-221, Patrick 12 Oct 2026: "The pull hands over to the rate hold at 90 deg (straight vertical), but make it smooth"; 80°, an estimate, until V2.424) |
| LEAD.loopPullOutDeg | `330` | #2's cue only (loopMode): PURE in trail for the pull-out from here (an estimate) |
| LEAD.loopWaitSec | `5` | in the standard sequence Lead holds wings level for 5 s after the 360 before the loop's pull, so #2 has rolled out and is set for the pull (Patrick 12 Oct 2026 01:50Z, "1 just waits for 2 to roll out of the turn before he begins his loop"; 04:14Z after flying V2.371, "lead can just wait another 2 seconds to pull in to the loop": 3 s became 5 s, his option A). An estimate from his words; #2 levels  |
| LEAD.loopWaitLimitSec | `60` | a guard only: in the sequence, wings level at MAX for at most a minute to reach loopMinKias, else the loop is skipped (an estimate) |
| LEAD.noseRateAccelDps2 | `4` | the most he changes a held nose rate, 4°/s² |
| LEAD.noseRateJerkDps3 | `6` | and how fast that change builds, 6°/s³, so the G rate never steps |
| LEAD.exitReplanSec | `0.25` | how often the exit speed is predicted again |
| LEAD.exitFreezeDeg | `30` | the last 30° before the exit the rate is held (nothing left to steer with) |
| LEAD.endJerkDps3 | `2` | a stand-alone exit eases the nose rate to zero on the horizon at 2°/s³ (4 G onto 1 G over about 2.7 s) |
| LEAD.endKneeDps | `1.5` | where the held rate meets that easing (°/s), so the G rate does not step |
| LEAD.limitKneeG | `0.15` | a G limit (4 G, 17 units, the shaker share) is met through a 0.15 G knee, never a corner (core softMin) |
| LEAD.joinBlendSec | `2` | a flowing join (loop to wingovers, wingovers to barrel roll): the next pull eases from the G handed in onto its own over 2 s |
| LEAD.rollingBandDeg | `0.5` | Lead counts as rolling (the T-6A's +4.7 G rolling limit, core availableG; NFM ch.5; Patrick 13 Oct 2026: "no rolling and pulling past 4.7 G") while his bank is more than 0.5° from the bank he is rolling to ... |
| LEAD.rollingRateDps | `1` | ... or his roll rate is over 1°/s (both estimates: where a roll starts and ends) |
| LEAD.gOnsetSec | `0.2` | Lead's G onset is built over 0.2 s, as the roll's (T6A_ROLL.onsetSec, TS-196), with the stop planned (TS-223); Lead only until Patrick moves it to core |
| LEAD.wingoverG | `3` | "approximately 3 G" (SMM 16.17 para 47); the cloverleaf's pull, 2.5-3.5 G (SMM Table 7.1; EFIG p.137 about 3 G) |
| LEAD.wingoverPitchDeg | `45` | "approximately 45 degrees of pitch (above and below the horizon)" (SMM 16.17 para 47) |
| LEAD.noseAccelDps2 | `8` | how fast the nose's rate changes along a planned nose path, 8°/s² (an estimate): #2's lag roll and rolling rejoin (followNose); Lead's own paths use noseRateAccelDps2 |
| LEAD.noseEndDps2 | `3` | and how gently he slows it onto the end of the path, 3°/s² (an estimate): the pull-out to level |
| LEAD.noseSteerPerSec | `1.2` | how fast he steers back onto the planned nose path, per second (an estimate) |
| LEAD.shakerShare | `0.9` | he pulls no more than 90% of the stick shaker's G on a planned nose path, the wingovers and barrel roll (an estimate) |
| LEAD.barrelG | `3` | entry load (SMM Table 14.1; Fig 14.1 "3G, wings level pull and begin roll") |
| LEAD.barrelTopG | `2.25` | the back pressure reduced over the top (SMM 14.8 para 19): 2.25 G is an estimate (230 KIAS out) |
| LEAD.barrelPitchDeg | `45` | SMM 14.8 para 19 (45° pitch up and down at the quarter points); Patrick's pick row 6 |
| LEAD.barrelOffDeg | `45` | the nose circles a point 45° off the reference line (SMM 14.8 para 19: 45° off, then 90° off) |
| LEAD.cueOffTailDeg | `WING.latDeg` | the cue Lead's moves give #2: hold 15° off Lead's current tail (Patrick 5 Oct 22:28Z; moves.js WING) |
| LEAD.overTopCue | `Object.freeze({ pureFromU: 0.4, leadFromU: 0.6, pureAgainFromU: 0.9 })` | #2's cue through a wingover or barrel roll by how far through it Lead is: LAG up, PURE over the top, LEAD down, PURE for the pull-out (Patrick 17:12Z, card 19:21Z); the breaks are estimates |
| LEAD.loopCueDeg | `Object.freeze({ pureFrom: 155, leadFrom: 205 })` | the loop's cue by Lead's loop angle: LAG, PURE over the top from 155°, LEAD from 205°, PURE again from loopPullOutDeg (estimates) |
| LEAD.climbDamp | `Object.freeze({ holdPerSec: 0.5, pitchPerSec: 0.4, exitPerSec: 0.6 })` | how firmly Lead's pull brings the flight path onto the one wanted (core dampedClimbG's omega, per second; estimates): holding a level path or a climb's angle; raising or lowering the nose into a climb; levelling after a stand-alone loop, wingovers or barrel roll |
| LEAD.climbNearFt | `20` | a climb or descent counts as arrived within 20 ft of the new height (an estimate) |
| LEAD.speedHold | `Object.freeze({ perSec: 0.2, maxKtps: 3 })` | holding a speed (the entry, Terminate): 0.2 kt/s per knot off it, never more than 3 kt/s (estimates) |
| FW_MOVE | `Object.freeze({ heldTurnDeg: 720, climbFt: 2000, climbDeg: 15, climbTorquePct: LEAD_POWER.maxTorquePct, descentTorquePct: LEAD_POWER.minTorquePct })` | climbTorquePct: Lead's climb power, 80% torque at most (Patrick 12 Oct 2026 08:39Z, a formation hard rule; TS-203); descentTorquePct: his descent power, 20% torque (TS-216; until V2.424 the descent was 80% of the model's idle descent, an estimate) |
| LEAD_PILOT |  | Lead's programme flown on the same point mass as in fluid (TS-225, Patrick 12 Oct 2026: "let's have him fly the same point mass"; "our first job is to make lead fly realistically"): lead-pilot.js flies each plan's turns, holds, speed changes and height legs with thrust, drag, G, his roll and his G onset, and his speed and height come out of the physics. onePointMass false flies the old programme L |
| LEAD_PILOT.onePointMass | `true` | the switch (TS-225: "A setting keeps the old programme Lead until this is proven"); false flies the old programme Lead |
| LEAD_PILOT.heightPerSec | `0.125` | how firmly he flies onto a planned or held height: climb rate added per foot of height error, per second (an estimate: a quarter of LEAD.climbDamp.holdPerSec, so the height and flight-path loops are critically damped together) |
| LEAD_PILOT.levelFtps | `0.5` | a plan that starts while he still climbs or sinks faster than 0.5 ft/s levels him off first, then holds that height (an estimate; the programme's own level-off, flight.js LEVEL_OFF_SEC, did the same) |
| LEAD_PILOT.heightCatchFtps | `25` | the most climb or sink he adds to close a height error, ft/s (about 1,500 ft/min; an estimate) |
| LEAD_PILOT.speedDoneKt | `0.5` | a speed change counts as made within 0.5 kt (an estimate; the planners' own "same speed" test) |
| LEAD_PILOT.speedStuckKtps | `0.05` | ... or once the power is at the band's edge and the speed has stopped coming toward it, KIAS per second (an estimate), so a change the power cannot make does not hold a plan open |
| LEAD_PILOT.labPower | `Object.freeze({ minTorquePct: 0, maxTorquePct: LEAD_POWER.maxTorquePct })` | line abreast's own speed changes (replay.js speedSeg lab): power back to the floor (slow-down.js, TS-61) and 80% to speed up (TS-216's LAB exception) |
| LEAD_PILOT.climbTorquePct | `FW_MOVE.climbTorquePct` | a planned climb at 80% torque (TS-203, TS-216) |
| LEAD_PILOT.descentTorquePct | `FW_MOVE.descentTorquePct` | a planned descent at 20% torque (TS-216) |
| LEAD_PILOT.speedByNosePerSec | `0.125` | in a planned climb or descent his nose holds his airspeed (TS-225, Patrick 13 Oct 2026): a speed error is taken out at this share per second, on top of the climb angle the power gives (an estimate, as slow as the height loop so the pitch never chases the speed) |
| LEAD_PILOT.pullAheadSec | `0.25` | he pulls as he rolls (Patrick 13 Oct 2026: "pull as he rolls"): the G for the bank he will have this far ahead, so the G builds with the bank instead of lagging it (an estimate: his G onset, 0.2 s, plus a step; it was the bank he had, and a 70.5° roll-in at 90°/s overshot by 0.3 G and swung his height -11/+13 ft; now the G peaks at the bank's own at 45°, 60° and 70.5°, height within 1-3 ft at 45°  |
| LEAD_PILOT.levelOffFt | `5` | a climb or descent is over once he is within 5 ft of the planned height and climbing or sinking under levelFtps (an estimate) |

## Wingmen: the live laws, the close turns' held poses, the fluid exercise, the rolling rejoin (`wing-moves.js`)

| Number | Value | Source and note |
|---|---|---|
| WING_LIVE | `Object.freeze({ placeKtPerFt: 0.08, closeKtPerKt: 0.6, overLeadG: 1.5 })` | What both live laws do the same way (they were copies): power flies his place, 1 kt per 12.5 ft behind it less 0.6 kt per knot he is already closing, and he pulls no more than about 1.5 G over what Lead is pulling (a pilot matches Lead's pull and adds what the picture needs). Estimates. |
| FW_LIVE |  | The live fighting wing wingmen's numbers (TS-208; moved from fw-live.js, 12.2b). Estimates unless a source is given. |
| FW_LIVE.settleSec | `30` | his run goes on this long past Lead's plan, long enough to reset in position after a roll-out (estimate) |
| FW_LIVE.maxSec | `300` |  |
| FW_LIVE.arcFt | `FW4.rangeFt` | in a turn he aims 650 ft of arc behind the one ahead (TS-208; Patrick 4 Oct 11:44Z, slots.js FW4) |
| FW_LIVE.floorFt | `FW_BAND.bubbleFt` | never closer than 500 ft to the one ahead (Patrick 12 Oct 2026 16:49Z; SMM 16.17 para 44c) |
| FW_LIVE.floorMarginFt | `100` | he starts to give room 100 ft before the floor, at the range he will have in lookSec (estimate) |
| FW_LIVE.lookSec | `HOLD.lookSec` | ... in about 2 s at the closure he has (estimate, TS-74) |
| FW_LIVE.floorGain | `2` | each foot short of the floor plus its margin counts as 2 ft too close (estimate) |
| FW_LIVE.floorLookSec | `6` | The floor in a turn into him: he looks floorLookSec ahead with the one ahead holding his turn (fw-pursuit.js predict), and if the heading he wants would bring him inside the floor plus its margin he takes the nearest heading on the lag side that keeps him out (searched in floorStepDeg steps up to floorMaxDeg off it); with none, the best one and height (estimates). |
| FW_LIVE.floorStepDeg | `5` | The floor in a turn into him: he looks floorLookSec ahead with the one ahead holding his turn (fw-pursuit.js predict), and if the heading he wants would bring him inside the floor plus its margin he takes the nearest heading on the lag side that keeps him out (searched in floorStepDeg steps up to floorMaxDeg off it); with none, the best one and height (estimates). |
| FW_LIVE.floorMaxDeg | `20` | ... and never more than 20° off Lead's circle (estimates; measured 12 Oct 2026: 90° stretched #3 to 2,500 ft, 45° to 1,900) |
| FW_LIVE.stackFt | `Object.freeze([-100, -50])` | 50 to 100 ft below the one ahead (Patrick 12 Oct 2026 17:16Z, 17:32Z "500 and stack is a technique that works") |
| FW_LIVE.stackKeepFt | `IN_POSITION.fwStackFt` | a deeper stack he has at the press is kept, up to the cone's 200 ft (TS-80), until Lead is level and he is clear (estimate) |
| FW_LIVE.coneFt | `150` | height in the cone: no more than 150 ft from his stack to keep the floor (TS-96's cone height; estimate) |
| FW_LIVE.gPer10Deg | `1` | The pilot's hands (estimates): about 1 G of turn per 10° of heading error (a 4-6 s period, Fable's audit), his nose put back onto the path over about 4 s of flight, at most 30° across it. |
| FW_LIVE.pathLookSec | `4` | The pilot's hands (estimates): about 1 G of turn per 10° of heading error (a 4-6 s period, Fable's audit), his nose put back onto the path over about 4 s of flight, at most 30° across it. |
| FW_LIVE.maxCutDeg | `30` | The pilot's hands (estimates): about 1 G of turn per 10° of heading error (a 4-6 s period, Fable's audit), his nose put back onto the path over about 4 s of flight, at most 30° across it. |
| FW_LIVE.rollDps | `60` | he rolls no faster than about 60°/s in fighting wing (estimate; the T-6A's own limit stays in stepLead) ... |
| FW_LIVE.rollLeadDeg | `6` | ... his ask leading his wings by no more than 6° (estimate) |
| FW_LIVE.lagTurnShare | `0.75` | lagging off the floor he turns at three quarters of Lead's turn ... (estimate; measured 12 Oct 2026: none overshot and stretched #3 and #4 to 1,400 ft, all of it passed closer) ... |
| FW_LIVE.ffSec | `1` | ... eased over about a second (estimate) |
| FW_LIVE.anticipateSec | `0.75` | he rolls with Lead's turn about 0.75 s of flight before he reaches where Lead rolled (estimate) |
| FW_LIVE.arcSec | `6` | Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of turning (about 45° of bank) and none straight. |
| FW_LIVE.arcRateFtps | `30` | Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of turning (about 45° of bank) and none straight. |
| FW_LIVE.acrossMaxFt | `500` | Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of turning (about 45° of bank) and none straight. |
| FW_LIVE.turnFullG | `1` | Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of turning (about 45° of bank) and none straight. |
| FW_LIVE.turnSec | `2` | his picture of the turn (lead, lag and pure against the cone) builds and fades over about 2 s (estimate) |
| FW_LIVE.takeTurn | `0.25` | with Lead level and his own turn under a quarter of full, the cone place is taken (estimate) |
| FW_LIVE.coneFtps | `40` | his place across the cone moves at no more than 40 ft/s (estimate) |
| FW_LIVE.altFtps | `8` | moved up or down at no more than 8 ft/s (the live wingman's fighting wing rate, estimate) |
| FW_LIVE.altSec | `4` | Height: a gentle loop on his stack and the energy height, never from the pointing error (estimates). |
| FW_LIVE.climbSec | `1` | Height: a gentle loop on his stack and the energy height, never from the pointing error (estimates). |
| FW_LIVE.maxClimbG | `0.25` | Height: a gentle loop on his stack and the energy height, never from the pointing error (estimates). |
| FW_LIVE.floorFtps | `40` | the floor's height is flown at up to 40 ft/s (2,400 ft/min) ... |
| FW_LIVE.floorClimbG | `0.5` | ... the climb or descent started at up to half a G ... |
| FW_LIVE.floorSec | `1` | ... and closed on in about 1 s (estimates) |
| FW_LIVE.energyFt | `100` | speed as height first, up to 100 ft (TS-96, TS-202; estimate) |
| FW_LIVE.placeKtPerFt | `WING_LIVE.placeKtPerFt` | power: 1 kt per 12.5 ft of arc behind his place (WING_LIVE) ... |
| FW_LIVE.closeKtPerKt | `WING_LIVE.closeKtPerKt` | ... less 0.6 kt per knot he is already closing (WING_LIVE) ... |
| FW_LIVE.overtakeKias | `HOLD.overtakeKias` | ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS) |
| FW_LIVE.overLeadG | `WING_LIVE.overLeadG` | he pulls no more than about 1.5 G over Lead (WING_LIVE), the floor excepted ... |
| FW_LIVE.normalG | `G_RULE.normalG` | ... and 5 G, the normal ceiling (SMM 16.17 para 44a; Gen Book p.11), flagged, not a wall |
| FW_LIVE.minG | `MIN_POSITIVE_G` | no push below 0.5 G (as Lead, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js) |
| FW_LIVE.seedFt | `8000` | Lead's track, kept for the wingmen to fly: seeded this far behind Lead at the first press, at this spacing (estimates). |
| FW_LIVE.seedStepFt | `50` | Lead's track, kept for the wingmen to fly: seeded this far behind Lead at the first press, at this spacing (estimates). |
| LIVE |  | The live fluid wingman's numbers (moved from fluid-wing-live.js, 12.2b). Estimates unless a source is given. |
| LIVE.sideDeg | `WING.latDeg` | the side offset: 15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15"; 12 Oct 02:45Z "that part is good") |
| LIVE.turnInFt | `50` | in a manoeuvre he holds about 50 ft inside the set distance (600 by default, so about 550: Patrick 12 Oct 2026 01:53Z, "maintain 500 in the turn and roll out slightly over 500"; 50 an estimate) |
| LIVE.capShare | `0.5` | lead or lag moves the aim off Lead, toward the inside of his turn or the outside, by up to half the range (about 27° of nose; estimate) |
| LIVE.biasLag | `-0.3` | Lead's cue word sets the default: lag puts the aim 30% of the cap outside his turn ... (estimate) |
| LIVE.biasLead | `0.3` | ... and lead 30% inside (estimate); pure is on him |
| LIVE.loopWords | `Object.freeze({ pureDeg: 110, leadDeg: 160, pullOutDeg: 330 })` | the loop, by Lead's angle round it: lag, pure from 110° (near the vertical), lead from 160° (over the top: Patrick 12 Oct 2026 03:40Z "around this position we should be transitioning to lead pursuit"), pure from the pull-out (330°, fluid-lead.js). Estimates; the planned wingman keeps his own breaks (155°, 205°) |
| LIVE.overWords | `Object.freeze({ pure: 0.3, lead: 0.45, pullOut: 0.9 })` | a wingover or a barrel roll, by how far through it Lead is: the same shape (planned: 0.4, 0.6, 0.9); estimates |
| LIVE.sideSwapDeg | `5` | with Lead level again, #2 takes the side of Lead's tail he is on once more than 5° past it (estimate), and keeps it |
| LIVE.sideFreeTurn | `0.25` | ... only with Lead's turn eased off (below a quarter of the full slide), upright and his nose near the horizon (estimates) |
| LIVE.biasPerSec | `0.15` | a change of cue word slides the default over about 2 s, lead to pure (4 s lag to lead), never in a step (estimate) |
| LIVE.kR | `1` | the range error, as a share of the range wanted, moves the aim ahead (stretched) or behind (tight) one for one (estimate) |
| LIVE.kC | `1` | the closure over lookSec, as a share of the range wanted, moves it behind (closing) or ahead (opening) one for one (estimate) |
| LIVE.lookSec | `HOLD.lookSec` | he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate, TS-74) |
| LIVE.severityG | `2` | the slide is full with Lead turning at 2 G of acceleration (a 3.5 G loop, a 70° turn), none straight (estimate) ... |
| LIVE.severitySec | `2` | ... and follows his turn over about 2 s, none to full, so a quick roll-in of Lead's moves #2's picture smoothly, never in a step (estimate; smooth hands) |
| LIVE.turnSenseSec | `0.5` | #2's sense of Lead's turn (its direction and size) follows Lead's turning acceleration with about half a second of lag (estimate) ... |
| LIVE.turnHeldG | `0.1` | ... and below 0.1 G of it the last turn's direction and plane are held, so a straight Lead never leaves him a direction from noise (estimate) |
| LIVE.circleSec | `4` | in a turn the side offset in Lead's plane eases away over about 4 s, so #2 settles onto Lead's circle (estimate; Patrick 12 Oct 2026 01:39Z: "maintain 500 feet in the turn then accept getting a bit further away as we seep out to our 'offset' position"); turning into him it is circleInsideSec |
| LIVE.swapLookSec | `0.25` | his drift across Lead's tail is read over about a quarter second (estimate; the planned cue read it over 0.25 s too) |
| LIVE.circleBackSec | `12` | in Terminate the offset comes back as Lead rolls out over about 12 s, the slot slide's own pace (estimate), so the roll-out never jumps the aim across |
| LIVE.circleInsideSec | `8` | ... but with the offset on the inside of Lead's turn (Lead turning into him) over about 8 s, so Lead's turn brings the circle to him and he rolls in later and shallower instead of rolling away first (estimate; Patrick 12 Oct 2026 03:10Z: he turns away only when the turn would bring him inside 500 ft) |
| LIVE.bubbleShare | `-1` | inside the 500 ft bubble the aim goes to full lag (spec section 9; SMM 16.17 para 44c) |
| LIVE.handsFadeSec | `3` | ... and fades out over the first 3 s after the Terminate press (estimate), so it is for the press only |
| LIVE.handsSec | `1` | in Terminate the lift wanted is eased over about a second (estimate; spec section 10.11, "eased over about a second") |
| LIVE.heightShare | `0.8` | how much of the offset eased off Lead's plane comes back as height above him in a turn (estimate; measured about 100 ft at 15° and 650 ft) |
| LIVE.l1Sec | `2.5` | the pursuit gain is 2V over the distance to the aim, or over about 2.5 s of flight if the aim is nearer (estimate): standard L1 guidance, soft enough that a roll-in of Lead's is followed, not snatched at |
| LIVE.overLeadG | `WING_LIVE.overLeadG` | he pulls no more than about 1.5 G over what Lead is pulling (estimate: a pilot matches Lead's pull and adds what the picture needs), the bubble excepted |
| LIVE.relevelPerSec | `0.5` | the side frame along Lead's path eases back to level at about 0.5 per second with Lead upright and his nose near the horizon, none inverted or near the vertical (estimate), so his side holds through a loop |
| LIVE.minG | `MIN_POSITIVE_G` | never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js) |
| LIVE.normalG | `G_RULE.normalG` | SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling) |
| LIVE.acrossDps | `3` | how fast his place moves across the tail (the entry): 3°/s, 30° in about 10 s (estimate) |
| LIVE.openDeg | `25` | tight with Lead straight his place opens across toward the edge of the fluid cone, 30° off the tail (SMM 16.17 para 42) less the shared 5° margin, so he is judged in position all the way; measured on V2.380 from 500 ft at 55° off the tail: opening to 45° (the middle of the fighting wing cone) keeps him 485 ft at the closest but parks him at 32°, out of the fluid cone; 25° goes through 429 ft (flag |
| LIVE.topSwapUpZ | `0.7` | the inverted top of a roll: Lead's canopy more than about 135° from upright (estimate) ... |
| LIVE.topSwapRollDps | `20` | ... and still rolling through it, faster than 20°/s (estimate), so a held inverted pass is not a roll ... |
| LIVE.topSwapTurn | `0.5` | ... with Lead pulling at least half the severity, about 1 G of turn (estimate) |
| LIVE.openUpFt | `100` | ... and up to about 100 ft above Lead (estimate: "use the cone as required", Patrick 5 Oct 2026 23:02Z), a longer path with power at MAX |
| LIVE.slotSideDeg | `2` | near Lead's tail Terminate takes the side he is heading for once more than 2° past it (estimate) ... |
| LIVE.slotAcrossDps | `1.5` | in Terminate his place flows across to the fighting wing slot at 1.5°/s (estimate), a gentle slide out while Lead flies straight |
| LIVE.rangeFtps | `60` | how fast his place moves in or out (a new distance, the entry, Terminate): estimate |
| LIVE.altFtps | `20` | how fast his place moves up or down (Terminate's slot height): estimate |
| LIVE.placeKtPerFt | `WING_LIVE.placeKtPerFt` | with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (WING_LIVE) ... |
| LIVE.closeKtPerKt | `WING_LIVE.closeKtPerKt` | ... less 0.6 kt per knot he is already closing on it (WING_LIVE) ... |
| LIVE.overtakeKias | `HOLD.overtakeKias` | ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS) |
| LIVE.wordShare | `Object.freeze({ on: 0.35, off: 0.15 })` | LAG or LEAD shows past 35% of the cap and goes under 15%, so the word doesn't flicker (estimate) |
| LIVE.settleKt | `2` | Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9) |
| LIVE.fwAltFtps | `8` | ... and moved up or down at no more than 8 ft/s, so a change of height is a gentle climb or descent, not a bob (estimate) |
| LIVE.fwAimFtps | `100` | In fighting wing his aim moves round Lead (in Lead's own frame) no faster than this and builds to it at fwAimAccel, so a press of Lead's never asks him for a snap: from the 4-ship's place (543 ft, 45° off the tail) the aim swept about 400 ft across in 3.6 s at a level turn's press and rolled him to 85° in 2 s (Patrick 12 Oct 2026 10:02Z: "There should be roll rates and roll acceleration build ups  |
| LIVE.fwAimAccelFtps2 | `60` | In fighting wing his aim moves round Lead (in Lead's own frame) no faster than this and builds to it at fwAimAccel, so a press of Lead's never asks him for a snap: from the 4-ship's place (543 ft, 45° off the tail) the aim swept about 400 ft across in 3.6 s at a level turn's press and rolled him to 85° in 2 s (Patrick 12 Oct 2026 10:02Z: "There should be roll rates and roll acceleration build ups  |
| LIVE.fwHeightFt | `100` | in fighting wing (TS-202) his spacing is flown with height first: up to the cone's 150 ft above or below Lead less the 50 ft margin (TS-96, FW_ENERGY; estimates) |
| FLUID |  | The fluid manoeuvring numbers (Patrick's picks of 19:20Z, fluid-conflicts.md, unless said). |
| FLUID.rangeFt | `Object.freeze({ min: FW_BAND.rangeFt[0], max: FW_BAND.rangeFt[1], def: 600, goodMax: 750 })` | SMM 16.17 para 42; AFM7 p.17, AFM8 p.19; Patrick row 3 (min and max: slots.js FW_BAND) |
| FLUID.coneHalfDeg | `30` | 60° in all, 30° either side of Lead's tail (Patrick row 2) |
| FLUID.bubbleFt | `FW_BAND.bubbleFt` | SMM 16.17 para 44c; Gen Book p.11 (slots.js FW_BAND) |
| FLUID.wingGLimit | `5` | SMM 16.17 para 44a; Gen Book p.11 (flagged, never a wall) |
| FLUID.leadGLimit | `4` | 2 CFFTS Orders B2 ch 8 para 1a; Gen Book p.11 (flagged) |
| FLUID.hardDeckMslFt | `6000` | 3,000 ft AGL, about 6,000 ft MSL in the Moose Jaw areas (SMM 14.6 para 16); FM minimum (Orders B2 ch 8 para 1f; Gen Book p.11) |
| FLUID.aspectHcaFlagDeg | `90` | SMM 16.17 para 44b |
| FLUID.lowLosDps | `5` | "low line of sight": an estimate (design 5.5) |
| CLOSE_TURN |  | The numbers of the close formation turns. Lead's bank: the 2-ship and the 4-ship's finger, box, route and line astern turn at 45° (1.4 G), an estimate inside the close formation limit of 3 G (2 CFFTS Orders B2 ch 8 p.97, para 1a and 1b); the check turn at 30° (gentle, as in fighting wing). The 4-ship's echelon turns at 30°: the Orders normally restrict it to stepped turns away at 30° of bank (para |
| CLOSE_TURN.bankDeg | `45` |  |
| CLOSE_TURN.echelonBankDeg | `60` |  |
| CLOSE_TURN.gentleBankDeg | `30` |  |
| CLOSE_TURN.fourEchelonBankDeg | `30` |  |
| CLOSE_TURN.leadRoll | `RATE_SETS.close.leadRoll` |  |
| CLOSE_TURN.echelonRoll | `RATE_SETS.close.echelonRoll` |  |
| CLOSE_TURN.followG | `0.5` |  |
| CLOSE_TURN.sidePerSec | `1` |  |
| CLOSE_TURN.settleSec | `60` |  |
| CLOSE_TURN.powerG | `0.1` |  |
| CLOSE_TURN.onsetGps | `4` |  |
| CLOSE_TURN.holdPerSec | `2.5` |  |
| CLOSE_TURN.rollMargin | `1.5` |  |
| CLOSE_TURN.sideBankDeg | `15` |  |
| CLOSE_TURN.endBankDeg | `0.2` |  |
| CLOSE_TURN.handOverEaseSec | `0.5` |  |
| CATCH_UP | `Object.freeze({ fullDeg: 15, mult: 3 })` | A close wingman's catch-up roll (estimates): his roll limit (rate and onset) grows smoothly with how far he is behind Lead's bank, to mult times the smooth roll at fullDeg behind (rollFrom). |
| ROLLED_CAUGHT_DEG | `0.1` | How far behind the path's bank his wings may be and still count as having caught it up (degrees; an estimate). |
| ROLLED_MAX_SEC | `1` | The longest roll-in that is re-flown at his rolled bank (an estimate). A rejoin's hand-over lags for well under a second (about 0.7 s, probes 12 Oct 2026); a close turn's roll-in can lag for 5 s or more (#4 in a 4-ship echelon hook), and re-flying that drew him out of position, so a longer lag flies the planned path as before. |
| ROLLED_BLEND_SEC | `6` | How long the path flown at his rolled bank takes to blend back onto the planned path (an estimate). Long enough that the blend adds no more than about a degree of bank past the planned path's: at 2 s it added up to 4° (probes, 12 Oct 2026). |
| SLOT_TOL_FT | `15` | How far a wingman may be from his slot at the press and still hold the slot (the classifier's close tolerance, judge.js). |
| ROLL_WITH_DEG | `5` | The bank off Lead's that Lead's roll rate leaves his farthest wingman needing to hold his place across Lead's wing line (estimate). |
| CLOSE_SEE |  | What the close-formation wingman sees and how (live/wingman/perception.js; spec 7b.3, 7b.6b, 7b.6d). Estimates unless a source is given. |
| CLOSE_SEE.delaySec | `0.3` | everything he sees reaches his hands about 0.3 s late (TS-211, estimate; Tohidi and Yildiz (2020) measured 0.3 s as a pilot's total delay, decision plus neuromuscular) |
| CLOSE_SEE.filterSec | `0.1` | the rates he reads (the picture moving, Lead's roll and its build-up, Lead's G) are smoothed over about 0.1 s, as an eye judges motion over a moment: at most 0.1 s, the plane axis has little phase to spare (spec 7b.6d item 7, the Fable audit) |
| CLOSE_SEE.aheadSec | `0.3` | he dead-reckons Lead's bank across his own delay: seen bank + rate x 0.3 + half the build-up x 0.3² (spec 7b.6d item 5) |
| CLOSE_WING |  | How the close-formation wingman holds his place (live/wingman/close-formation.js, supervisor.js, shaper.js; spec 7b.4, 7b.6, 7b.6c, 7b.6d). Three loops, one per control, each P and D on what he sees and a weak trim (core pilotAxis): pitch (G) on up and down, roll (bank off Lead's) on in and out, power (torque) on forward and back. Estimates unless a source is given; to be tuned by eye on the plot  |
| CLOSE_WING.plane | `Object.freeze({ kp: 0.04, kd: 0.06, ki: 0, iMax: 0 })` | Pitch, on the plane axis: G per foot and per ft/s (spec 7b.6c's starting gains; with the 0.3 s reaction about 2 rad/s and 37° of phase margin, the Fable audit; fallback 0.03 and 0.06). The trim starts at zero (spec 7b.6c, "added only if an offset remains"): the T2 probe showed a trim of 0.004 G per ft·s overshooting by 1 ft. |
| CLOSE_WING.kPosPerSec | `0.4` | In Lead's wing plane both loops are a cascade (spec 7b.6c "Power is a cascade"): the distance to his place picks one pace straight at it, and roll and power each close the pace he wants on the closure he sees, so on a move along the line bank and power go together and he stays on it ("power and bank together", 7b.3). Near the spot the pace is 0.4 ft/s per foot to go (estimate, for spec 7b.6b's set |
| CLOSE_WING.side | `Object.freeze({ kdDegPerFtps: 1.9, ki: 0, iMax: 0 })` | Roll, in and out: degrees of bank off Lead's per ft/s of pace error (spec 7b.6d item 7: 1.7 to 2.1° per ft/s, crossover 1.0 to 1.2 rad/s; estimate), so 0.76° per foot near the spot (the audit's "about 0.5°/ft"). Trim from zero as above. |
| CLOSE_WING.fore | `Object.freeze({ kdPctPerFtps: 12, ki: 0, iMax: 0 })` | Power, forward and back: about 12% torque per ft/s of pace error (spec 7b.6d item 7: 10 to 13%, estimate), so 4.8% per foot near the spot. Trim from zero as above. |
| CLOSE_WING.deadFt | `0` | No threshold (Patrick 13 Oct 2026: "we notice ANY drift from the ideal references. if we're not exactly on plane or exactly on the line we will correct, until we stabilize at the 'golden power setting' and control pressures to freeze us in place (which is rare)"). Replaces the audit's soft threshold (spec 7b.6d item 11: P less 0.5 ft, D ignoring drift under 0.5 ft/s), which left him coasting 0.85  |
| CLOSE_WING.deadFtps | `0` | No threshold (Patrick 13 Oct 2026: "we notice ANY drift from the ideal references. if we're not exactly on plane or exactly on the line we will correct, until we stabilize at the 'golden power setting' and control pressures to freeze us in place (which is rare)"). Replaces the audit's soft threshold (spec 7b.6d item 11: P less 0.5 ft, D ignoring drift under 0.5 ft/s), which left him coasting 0.85  |
| CLOSE_WING.paceFtps | `8` | The pace: at most jogging, 8 ft/s, in B1 (Patrick 13 Oct 2026: "yes 8 ft/s and 13 ft/s works"; "start with slower rates until we figure out how to tune the PID"), tapering as sqrt(2 x braking x distance) so he can always stop on the spot, the braking what the power floor gives (spec 7b.6d item 13: at 20% torque about 1.3 kt/s at 200 KIAS and 8,000 ft), for the part of the move the power must stop  |
| CLOSE_WING.brakeTorquePct | `20` | The pace: at most jogging, 8 ft/s, in B1 (Patrick 13 Oct 2026: "yes 8 ft/s and 13 ft/s works"; "start with slower rates until we figure out how to tune the PID"), tapering as sqrt(2 x braking x distance) so he can always stop on the spot, the braking what the power floor gives (spec 7b.6d item 13: at 20% torque about 1.3 kt/s at 200 KIAS and 8,000 ft), for the part of the move the power must stop  |
| CLOSE_WING.boardsBelowPct | `10` | Below 10% torque he would use the boards before idle (Patrick 13 Oct 2026, "sure 10% tq for boards"; TS-61's order). The live step has no boards' drag, so B1 flags it and holds 10%: never needed in a straight-and-level hold. |
| CLOSE_WING.jobs | `Object.freeze({` | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the pressures of 7b.4 (about 0.3 G, 5°, 5-10% to |
| CLOSE_WING.…onStation | `Object.freeze({ gCap: 0.3, bankCapDeg: 5, torqueCapPct: 10, torquePctps: 10 })` | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the pressures of 7b.4 (about 0.3 G, 5°, 5-10% to |
| CLOSE_WING.…smallMove | `Object.freeze({ gCap: 0.3, bankCapDeg: 5, torqueCapPct: 10, torquePctps: 10 })` | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the pressures of 7b.4 (about 0.3 G, 5°, 5-10% to |
| CLOSE_WING.…largeMove | `Object.freeze({ gCap: 0.5, bankCapDeg: 15, torqueCapPct: 100, torquePctps: 20 })` | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the pressures of 7b.4 (about 0.3 G, 5°, 5-10% to |
| CLOSE_WING.…outBeforeUp | `Object.freeze({ gCap: 0.5, bankCapDeg: 15, torqueCapPct: 100, torquePctps: 20 })` | The pilot's hand (spec 7b.4 and 7b.6d item 6; estimates), by job: the most G off what Lead's motion needs, the most bank off Lead's, the most torque off the holding setting (100: the floor to MAX), and how fast his torque may move (about 10%/s on station; a move's set and catch quicker, 20%/s, the top of 7b.6d's 15-20%/s). On station and small moves the pressures of 7b.4 (about 0.3 G, 5°, 5-10% to |
| CLOSE_WING.capsPerSec | `Object.freeze({ g: 0.5, bankDeg: 10, torquePct: 30 })` | a new job's pressure sizes are eased in, never stepped (bumpless; estimates) |
| CLOSE_WING.smallFromFt | `1.5` | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a margin) back to on station under 1 ft; a large move past 10 ft (Patrick's small move is "up to about 10 ft", spec 7b.6) back to small under 8 ft; under Lead (below his wing plane, inside his wingtip) out before up, until 2 ft outside the wingt |
| CLOSE_WING.stationFromFt | `1` | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a margin) back to on station under 1 ft; a large move past 10 ft (Patrick's small move is "up to about 10 ft", spec 7b.6) back to small under 8 ft; under Lead (below his wing plane, inside his wingtip) out before up, until 2 ft outside the wingt |
| CLOSE_WING.largeFromFt | `10` | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a margin) back to on station under 1 ft; a large move past 10 ft (Patrick's small move is "up to about 10 ft", spec 7b.6) back to small under 8 ft; under Lead (below his wing plane, inside his wingtip) out before up, until 2 ft outside the wingt |
| CLOSE_WING.smallBackFt | `8` | The supervisor's jobs, each with a dead band so it never flickers (spec 7b.6d item 12; estimates): a small move from 1.5 ft off (the 0.5 ft he can see and a margin) back to on station under 1 ft; a large move past 10 ft (Patrick's small move is "up to about 10 ft", spec 7b.6) back to small under 8 ft; under Lead (below his wing plane, inside his wingtip) out before up, until 2 ft outside the wingt |
| CLOSE_WING.driftFtps | `2` | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under 1.5 ft/s (estimates): a hand-over still closing brakes with a large move's pressures. |
| CLOSE_WING.driftBackFtps | `1.5` | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under 1.5 ft/s (estimates): a hand-over still closing brakes with a large move's pressures. |
| CLOSE_WING.underClearFt | `2` | ... and a large move too while he is moving faster than a gentle drift (spec 7b.6: "a gentle drift for a few feet, up to a jogging pace"), 2 ft/s, back under 1.5 ft/s (estimates): a hand-over still closing brakes with a large move's pressures. |
| CLOSE_WING.plhBandFt | `2` | Plane, line, hinge (Patrick 13 Oct 2026): in a large move the line's error is shown to the loops once he is within 2 ft of the plane, and the error along the line once also within 2 ft of the line, each eased in at half its share a second (estimates), so the loops see one or two dimensions at a time and the target never jumps. On station all at once. |
| CLOSE_WING.plhPerSec | `0.5` | Plane, line, hinge (Patrick 13 Oct 2026): in a large move the line's error is shown to the loops once he is within 2 ft of the plane, and the error along the line once also within 2 ft of the line, each eased in at half its share a second (estimates), so the loops see one or two dimensions at a time and the target never jumps. On station all at once. |
| ROLLING_REJOIN |  | The rolling rejoin's search and pursuit (moved from rolling-rejoin.js, 12.2b). Estimates unless a page or ruling is named. |
| ROLLING_REJOIN.turnDeg | `Object.freeze([30, 60, 90, 120])` | how far his heading swings the way Lead turns over the roll (estimates) |
| ROLLING_REJOIN.pitchDeg | `Object.freeze([20, 40, 60])` | the nose's highest and lowest (estimates; 45° is the barrel roll's, SMM 14.8 para 19) |
| ROLLING_REJOIN.barrelOffDeg | `45` | the barrel roll's nose circles a point this far off his heading (SMM 14.8 para 19: 45° off) |
| ROLLING_REJOIN.pullG | `Object.freeze([3, 4])` | the pull: the barrel roll's 3 G entry (SMM Table 14.1, Fig 14.1) and 4 G (the top of SMM Table 7.1's 3-4 G; estimate choice) |
| ROLLING_REJOIN.maxRollSec | `60` | a guard: a roll still going after this long is dropped (estimate) |
| ROLLING_REJOIN.pathSteps | `800` | the nose path's table (fluid-lead.js nosePath; search effort only) |
| ROLLING_REJOIN.fullSearches | `6` | how many of the most promising roll-outs get the turning rejoin's full search after them (search effort only) |
| ROLLING_REJOIN.patience | `2` | ...stopping once this many in a row after the best so far bring nothing quicker (search effort only) |
| ROLLING_REJOIN.aheadU | `0.08` | he steers toward the point 8% further along the nose path (estimate; named from rolling-rejoin.js flyRoll, 12.2b) |
| ROLLING_REJOIN.aimGain | `1.0` | ... at the pursuit gain of core liftTowardAim (estimate) |
| ROLLING_REJOIN.noseAccelDps2 | `LEAD.noseAccelDps2` | his nose rate changes along the path as Lead's does (8°/s², lead-moves.js; was a copy) |
| ROLLING_REJOIN.noseEndDps2 | `LEAD.noseEndDps2` | ... and eases onto the end of it as Lead's (3°/s²; was a copy) |

## Moves: the tracker's numbers and each tracker move's (`moves.js`)

| Number | Value | Source and note |
|---|---|---|
| POWER | `Object.freeze({ torqueSec: ENGINE.quickSec, jerkKtps2: 25 })` | How fast the power answers (Patrick 6 Oct 03:17Z: torque 0 to 100% in about 0.2 s; 03:18Z: the speed brakes are instant; TS-108). torqueSec: the torque's full travel, the engine's quick response (handling.js ENGINE.quickSec, 0.25 s, TS-218: one number; it was 0.2 here until V2.424). jerkKtps2: the most the wingman's hand changes his acceleration per second with the lever slammed (the Rates lever s |
| KIAS_OUTSIDE_LAB | `200` | The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). |
| KIAS_LAB | `220` |  |
| REJOIN |  | Defaults for rejoins. |
| REJOIN.overtakeKias | `15` | the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin |
| REJOIN.bankCapDeg | `NO_BANK_CAP_DEG` | #2 in a rejoin: no bank cap, only the aircraft's own limits (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; the G rule, about 78° level, from V2.59 until V2.116, TS-67; 60°, an estimate, until then) |
| REJOIN.leadBankDeg | `30` | Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21) |
| REJOIN.stopStage | `/** @type {'boards'} */ ('boards')` | from the decision point the overtake comes off with the torque floor and the boards, planned at CLOSURE.stopShare of what they give, idle only when the room left needs more (the last resort); the decision point is where that stop just fits (Patrick 6 Oct 03:17-03:20Z, TS-108; idle from 5 Oct 17:55Z, TS-75, until V2.119; slow-down.js's stages) |
| REJOIN.floorTorquePct | `5` | a rejoin keeps at least 5% torque, the boards as needed; idle is a last resort (Patrick 6 Oct 03:17-03:20Z, TS-108) |
| REJOIN.idealBearingDeg | `45` | Lead at 10:30 or 1:30 (SMM 12.24 para 56) |
| REJOIN.hotBearingDeg | `60` | hot and cold are drawn but not numbered in SMM Fig 12.16: 60 and 30 are estimates |
| REJOIN.coldBearingDeg | `30` |  |
| REJOIN.turnAnglesDeg | `[30, 45, 20, 60]` | how far Lead turns into #2; estimates (a gentle turn, AFM8 brief p.19). Since V2.59 the 2-ship's Lead holds his turn until #2 is in (Patrick 06:16Z item 3; lead-turn-in.js leadTurnInto): these are only the 2-ship tracker's fallback, and the 4-ship's (step 3, not yet changed) |
| TURNING_REJOIN |  | The turning rejoin (V2.59, TS-68; flown as held bank and power since V2.63, TS-69; Patrick 5 Oct 07:14Z, card "Yes, as written" 07:31Z, 07:32Z, 08:12Z-08:20Z): one rule for every turning rejoin, from line abreast (hot: #2 starts ahead of the line and gets colder to reach it) or fighting wing (cold: he turns hotter to reach it). #2 gets onto the rejoin line, Lead at about his 11 o'clock or 1 o'cloc |
| TURNING_REJOIN.lineDeg | `60` | the rejoin line, degrees behind Lead's 3/9 line: 30° off his tail (Patrick 11 Oct 2026 06:30Z: "let's do a 30 degree line"; Fable: the decision point moves out to about 248 ft and Lead stays inside the canopy bow until there). It was 35° from 00:03Z ("let's start with 35", Lead's fin about two-thirds out along his upper wing, SMM 12.24 para 56, Fig 12.14 frame 3; TS-181), and 45° before that, read |
| TURNING_REJOIN.lineUpFt | `0` | #2's least depth below Lead on the line: none since TS-182 (Patrick 11 Oct 2026 03:47Z: "Lead should stay frozen in the windscreen getting bigger until the decision point"), the 4° alone, about 15 ft below at the decision point; it was 50 ft (Patrick 10 Oct 19:57Z, SMM 12.24 para 58), which lifted Lead up the windscreen inside 700 ft |
| TURNING_REJOIN.lineElevDeg | `4` | on the line he holds Lead this many degrees above his horizon, frozen in the windscreen and growing: about 140 ft below at 2,000 ft, 70 at 1,000, 15 at the decision point (EFIG p.374 "place lead slightly above the horizon"; Patrick 10 Oct 23:58Z, an estimate to tune; TS-181, TS-182) |
| TURNING_REJOIN.frozenBearingDeg | `30` | after the SMM's start he holds Lead frozen in the windscreen at this bearing off his nose, the line's own angle (Fable 04:18Z, from the line's picture at the decision point; 35° with the 35° line until V2.263; estimate)... |
| TURNING_REJOIN.frozenSettleFt | `0` | ...coming onto it from where the reversal left him over this much of the way in: none, the reversal ends on it (Patrick 04:22Z "we freeze him in the same spot with the same aspect ratio the whole way"; 400 ft in V2.248)... |
| TURNING_REJOIN.frozenTauSec | `3` | ...taking out a bearing error over this long (estimate) |
| TURNING_REJOIN.trailSettleFt | `1500` | from trail after a break, no pointing turn: he eases Lead from his nose onto frozenBearingDeg over this much of the way in, a small, early, gentle bank (Patrick 11 Oct 2026 07:57Z; estimate) |
| TURNING_REJOIN.trailHeightG | `0.15` | ...and his height follows the line's 4° law from the start (about 265 ft below at 3,800 ft) within this many g of level flight, gentler than heightG's 1 g (Patrick 11 Oct 2026 07:57Z "gentler"; estimate) |
| TURNING_REJOIN.trailFwHandFt | `850` | ...and to fighting wing he holds that bearing in to this range, where the cone's tracker takes over, at a formation roll rate (Fable's v2272: a hand-over at 1,000 ft snapped him at 3 G; estimate) |
| TURNING_REJOIN.trailFwSlowFt | `1500` | ...coming off his overtake to Lead's speed over this much of the way before it (estimate) |
| TURNING_REJOIN.frozenKias | `210` | ...at this speed all the way to the decision point, slowing only after it (Patrick 11 Oct 2026 06:11Z: "I can hit 210 knots at the decision point"; V2.255 took the closure off to about 5 kt there instead) |
| TURNING_REJOIN.aimsFt | `[300, 600, 1200]` | how sharply #2 captures the line: off it by this much he heads for it at half approachDeg; the one that brings him in soonest is flown (estimates: smaller is a sharper capture, larger a gentler, longer one) |
| TURNING_REJOIN.approachDeg | `80` | far off the line he heads for it at up to this angle across it, in Lead's frame (estimate) |
| TURNING_REJOIN.bankCapDeg | `60` | the bank he uses at most to get onto the line and hold it: past about 60° the drag costs speed and buys nothing (the review's estimate, rejoin-review-fable.md). Only when no rejoin at 60° keeps him behind Lead's 3/9 line does he use more, up to the G rule (REJOIN.bankCapDeg) |
| TURNING_REJOIN.pointMaxG | `4.5` | he turns hard to point at Lead, within this G, his bank in proportion to the heading still to turn (Patrick 04:05Z: "Turn more at the start with 4-5 g quick roll and wings level earlier"; 5 G stays a flag he stays inside) |
| TURNING_REJOIN.pointGain | `6` | degrees of bank per degree of heading still to turn, so he rolls out as Lead comes onto the nose (estimate) |
| TURNING_REJOIN.pointAheadDeg | `5` | he is rolled out wings level with Lead still this far short of the nose, so the wait is real (Fable's V2.249 flight: at -89°/s straight through, Lead crossed the nose with #2 at 42° of bank; estimate) |
| TURNING_REJOIN.pointKias | `200` | he holds Lead's 200 KIAS through the pointing turn and the wait, then full power through the reversal (Patrick 04:59Z) (estimate from the geometry) |
| TURNING_REJOIN.pointRoll | `Object.freeze({ maxRateDps: 90, maxAccelDps2: 180 })` | the start's roll: quick but smooth (Patrick 04:05Z), not the 180°/s, 720°/s² of the tactical moves (estimate) |
| TURNING_REJOIN.levelDeg | `3` | wings level is within this (estimate) |
| TURNING_REJOIN.lookThroughDeg | `3` | wings level, he reverses once Lead has come this far through the nose ("a definite increase in the line of sight")... |
| TURNING_REJOIN.lookMinSec | `1.5` | ...and he has been wings level this long (Fable's V2.249 flight: the line of sight rate from the pointing turn ended the wait at once; estimates)... |
| TURNING_REJOIN.lookMaxSec | `20` | ...or after this long, whichever comes first (estimate) |
| TURNING_REJOIN.reverseDoneDeg | `2` | the reversal, at full power and within pointMaxG, turns with Lead's line of sight until Lead is within this of frozenBearingDeg off the nose (estimate) |
| TURNING_REJOIN.reverseRoll | `Object.freeze({ maxRateDps: 45, maxAccelDps2: 45 })` | the reversal is the smooth one (Patrick 04:05Z "quick but smooth"; Fable's V2.249 flight: -90°/s; estimate) |
| TURNING_REJOIN.reverseMaxSec | `20` | the reversal ends with Lead at frozenBearingDeg off the nose, so there is no slide onto it after (Fable 04:40Z; until V2.250 it ended 15° off Lead's heading, Lead 25° off the nose), or after this long (estimate) |
| TURNING_REJOIN.pointFromFt | `2500` | only from further out than this; closer in the capture alone (estimate) |
| TURNING_REJOIN.formRoll | `Object.freeze({ maxRateDps: 30, maxAccelDps2: 20 })` | his roll from the start to the slot: a formation rate, Lead's close-turn roll (rates.js RATE_SETS.close.leadRoll), not the 180°/s of the tactical moves |
| TURNING_REJOIN.coneRefJerkFtps3 | `10` | the place he flies to in the cone speeds up and slows down this smoothly, with no corner, so his roll-out has no kink (estimate) |
| TURNING_REJOIN.coneAlignSec | `1.5` | settled in the cone, his heading eases onto Lead's over about this long, carrying on from the turn he has, not a step onto Lead's heading (estimate) |
| TURNING_REJOIN.coneAlignDoneDeg | `0.05` | ...until within this of Lead's heading with the turn gone, then he holds Lead's heading (estimate) |
| TURNING_REJOIN.hotFt | `1000` | ahead of the line by this much (hot) he flies his least speed, Lead's 200 KIAS, coming up to lineOverKias above it as he reaches the line (estimate; TS-75) |
| TURNING_REJOIN.laneTolFt | `20` | flowing into the slot he may pass this far ahead of it, never more, toward Lead's 3/9 line (estimate; Patrick 08:04Z) |
| TURNING_REJOIN.decisionArriveRates | `'instructor'` | he reaches the decision point closing no faster than this Rates choice's close-in rate (about 15 kt), so AI's quicker close-in starts from a closure under control (estimate; SMM 12.24 para 58) |
| TURNING_REJOIN.fwArriveFtps | `5` | to fighting wing he arrives at its place on the line at about this closure, and the tracker settles him there (estimate) |
| TURNING_REJOIN.hotBanksDeg | `[30, 60]` | hot (from line abreast) he tries Lead's own 30° and the medium 60° first (the review's estimates, rejoin-review-fable.md follow-up 1) |
| TURNING_REJOIN.lagAimFt | `2400` | and, hot, the gentlest capture too: lagging while Lead's turn brings the aspect round (estimate) |
| TURNING_REJOIN.heightG | `1` | a height change is one smooth leg whose push and pull stay within this many g of level flight: no rate cap, only the physics (the G is charged in flight.js) and smoothness (Patrick 6 Oct 21:30Z: "there shouldnt be a limit within the physics and smoothness"; TS-140; the 1 g an estimate) |
| TURNING_REJOIN.captureFt | `150` | he is on the line within this many feet of it; only then does he start taking out the overtake for the decision point (estimate) |
| TURNING_REJOIN.lagCutFt | `1500` | to fighting wing, hot and within this far of the place down the line he flies at the place itself, lagging the cut so it ends there (Patrick 6 Oct 17:11Z card "Lag the cut"; the distance an estimate) |
| TURNING_REJOIN.lineTauSec | `4` | his heading comes onto the one the line asks over about this long, so the bank changes smoothly (estimate) |
| TURNING_REJOIN.diveGs | `Object.freeze([2, 1])` | line first (Patrick 6 Oct 06:14Z: "a deeper roll, harder pull, steper dive ... get to leads altitude faster"; TS-124): from above, his height comes off over the shortest smooth leg whose push and pull stay within this many g of level flight, the first that costs no more than diveSlackSec (estimates) |
| TURNING_REJOIN.planeEaseSec | `4` | from the move over, #2's height eases into Lead's wing plane over at least this long (TS-126; estimate) |
| TURNING_REJOIN.planeEaseG | `0.3` | ...and longer where the step is big, so the ease asks no more than this many g off level flight (TS-126; estimate) |
| TURNING_REJOIN.diveSlackSec | `8` | a dive that brings him in no more than this much later than the steady descent is flown (estimate) |
| TURNING_REJOIN.heightSec | `10` | #2 settles slightly low on the line over this long, or over his part to the decision point if shorter (estimate) |
| TURNING_REJOIN.captureHeightG | `0.5` | his height down (or up) to the line from where he starts, one smooth leg within this many g of level flight: from 2,000 ft high at 1 g he bunted to 0.1 G at the reversal and pulled out at 4.7 G (Fable's v2291 flight; estimate). Starts within a few hundred feet still take heightSec |
| TURNING_REJOIN.climbTurnG | `1.2` | up to the line from below, his climb is timed for full power at frozenKias in a turn of this many g (estimate) |
| TURNING_REJOIN.verticalUpFt | `Object.freeze([500, 1000])` | The vertical as a candidate (Patrick 5 Oct 17:44Z "we can use the vertical too", 19:51Z "if it scores high enough"; TS-82): #2 goes this much higher than he starts early in the rejoin, then comes down onto the line, the climb and descent each one smooth leg within heightG, its pull charged as G (flight.js) and within the G rule. Flown only when it brings him in sooner (estimates). |
| TURNING_REJOIN.undertakeKias | `25` | only when no rejoin at his least speed keeps him behind Lead's 3/9 line (close in and hot) does he slow, at most this far below Lead's 200 KIAS (rejoinTo's, an estimate; TS-75) |
| TURNING_REJOIN.lineOverKias | `10` | hot, he reaches the line at no more than this over his least speed, Lead's 200 KIAS (to fighting wing, its place's own speed) (Patrick 17:29Z: "when they hit the line it needs to be at 210-200 knots"; TS-75) |
| TURNING_REJOIN.runInReleaseShare | `0.5` | taking out the overtake, he sets it again once the room left needs less than this share of the slowing that started it (estimate; TS-75) |
| TURNING_REJOIN.runInHoldSec | `2` | within this many seconds of the decision point at the close-in rate, he keeps taking it out (estimate; TS-75) |
| TURNING_REJOIN.crossFlowFt | `150` | crossing Lead's six to the other side, he flows through the crossing point within this many feet (estimate) |
| TURNING_REJOIN.routeFlowFt | `20` | he flows through route without stopping, within this many feet of it, on into the slot (estimate; Patrick 07:14Z: "in one motion") |
| TURNING_REJOIN.windowFarFt | `250` | he moves out to the line and up it to echelon anywhere from this far from Lead... (Patrick 6 Oct 03:32Z card, 03:34Z) |
| TURNING_REJOIN.windowNearFt | `100` | ...down to this far, the decision point (Patrick 02:30Z); not stable by here, he overshoots, only when nothing else works (03:35Z) |
| TURNING_REJOIN.windowBankDeg | `5` | from the decision point down into route and up into the slot his bank stays matched to Lead's, within this (TS-182: "bank matched to Lead's", SMM 12.24 para 58 "align the fuselage"; an estimate; ±15° until V2.248) |
| TURNING_REJOIN.windowFtps | `15` | ...and out to route he moves at the station-change rate, about 9 kt (Patrick 10 Oct 2026 23:54Z card; TS-181; an estimate, Fable's trace C). From route into the slot it is the close moves' own (CLOSE_SHAPING) |
| TURNING_REJOIN.tailMinSec | `3` | the way from the decision point takes at least this long; his closure and his drop into Lead's plane come off evenly from what he brings there (Patrick 11 Oct 2026 06:11Z: "we do not have to stop at any spot"; estimate) |
| TURNING_REJOIN.tailBlendSec | `2.5` | ...its corners rounded over this either side, twice (estimate; 1.5 s once until V2.255, Patrick 05:31Z "still too jerky") |
| TURNING_REJOIN.tailDropG | `0.2` | ...and the drop into Lead's wing plane is done by route's spacing, adding no more than this many g of push or pull (Patrick 12 Oct 2026 18:41Z: "move down on to the line at route spacing, then up into echelon in one smooth move"; estimate: 0.3 (TS-126's planeEaseG) took #2 to 1.48 G, 0.15 stretched the rejoin 4 s; was tailUpFtps 5, the drop timed over the whole way) |
| TURNING_REJOIN.underExtraFt | `8` | to the other side he passes under Lead's tail this much below the crossover's corner, which the rounding of the way takes back, so he is below the wake there (estimate) |
| TURNING_REJOIN.tailInFt | `3` | ...and he is in his place once within this of the slot... |
| TURNING_REJOIN.tailStillFtps | `1` | ...and moving on it at under this, when Lead may roll out (Patrick 11 Oct 2026 06:10Z: "as soon as the plane is in echelon, the formation can roll out"; estimates) |
| TURNING_REJOIN.tailPlaneSec | `2.5` | ...in Lead's plane averaged this far either side of now, so through Lead's roll-out he starts the climb as Lead starts rolling and eases off it (Fable's V2.262 flight: 0.5 G push; estimate) |
| TURNING_REJOIN.tailPlaneRouteSec | `4` | ...over this long when he ends in route, 124 ft out, with Lead's gentler route roll-out (rates.js routeRoll): G 0.87-1.30, as in echelon (Fable's v2272 flight: 0.62 G; estimate) |
| TURNING_REJOIN.tailHold | `Object.freeze({ sideBankDeg: 10, followG: 0.5, onsetGps: 2, holdPerSec: 2 })` | ...flown with his bank within this of Lead's, his G within followG of Lead's, changing at no more than onsetGps, settling at holdPerSec (Patrick 11 Oct 2026 06:16Z: "the aircraft pitches to stay on plane, power to move forward and back, bank to move left and right"; his 06:15Z picture: 8 ft below Lead's plane in the roll-out with V2.256's 5°, 0.15 G, 1 G/s, 1.5/s; estimates) |
| TURNING_REJOIN.stableKt | `Object.freeze([10, 20])` | his closure, range rate in knots, is stable in this window (Patrick 03:34Z: "10-20 knots at 100 feet"); the slowing aims at its middle, and slower is cold, not unstable |
| TURNING_REJOIN.stableShare | `1.5` | ...and closing at no more than this times the closure that middle overtake gives on the X, about 32 kt, so he is holding the X, not sweeping through it (card 03:15Z "Closure or bearing"; the figure is an estimate) |
| TURNING_REJOIN.xWindowDeg | `10` | Lead is on the X picture within this many degrees of it, 25-45° off his tail (card 03:15Z "Closure or bearing"; the figure is an estimate) |
| TURNING_REJOIN.bearingTauSec | `6` | his bearing off Lead's tail comes onto the X over about this long (estimate, the design) |
| TURNING_REJOIN.hardPullsSec | `Object.freeze([2, 4, 6, 8, 10, 12, 14, 16])` | hot, he may first pull this long at his most bank with idle and the boards, then hold the X (Patrick 6 Oct 04:02Z: "pull like 5 g and 90 deg bank to the line with the power less than max"; the times are estimates) |
| TURNING_REJOIN.xFromFt | `1200` | a hot start further out flies onto the rejoin line as before, and holds Lead on the X only from this far down it (Patrick 6 Oct 03:58Z: "you can make x inside 750 feet if it helps thats the whole idea") |
| TURNING_REJOIN.lowEnergyFt | `100` | more than this below Lead, and beyond 1,000 ft, the rejoin is at MAX (Patrick 6 Oct 05:29Z: "full power for a while"; the 100 ft is an estimate) |
| TURNING_REJOIN.slowFtps2 | `3.5` | the slowing curve down to the window's closure: about power back at 200 KIAS, 8,000 ft (slow-down.js; an estimate) |
| TURNING_REJOIN.insideFloorFt | `500` | inside this range his least speed is his place's own speed inside Lead's turn, about 196-198 KIAS (estimate) |
| TURNING_REJOIN.onXDeg | `5` | he is on the X within this many degrees of it (for the card's speed on the line; estimate) |
| TURNING_REJOIN.overshootBankDeg | `15` | the overshoot: wings near level, no more than this bank... (SMM 12.27 para 65; card 03:33Z rule 5; estimate) |
| TURNING_REJOIN.overshootLevelSec | `3` | ...for this long, then he stabilizes on the outside of Lead's turn (estimate) |
| TURNING_REJOIN.rideKias | `210` | on the line he holds this to the decision point (Patrick 8 Oct 20:16: "maintain 210 to the decision point") |
| TURNING_REJOIN.windowEntryOverKt | `0.5` | a plan counts as on the line only if it enters the window at no more than rideKias + this (Patrick's G3: 210.5 KIAS, HANDOVER_REPORT_V2.210_TRJ.md; 5.5 until the clean-up, Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 10) |
| TURNING_REJOIN.fwLeastKias | `195` | on the way to fighting wing a plan never below this counts (5 kt under the 200 floor, which TS-169 lets bleed; estimate; row 10) |
| TURNING_REJOIN.fwQuickerBySec | `10` | into fighting wing, a start that misses the line speed above still wins when it is in this much sooner than one that meets it (Patrick's card 12 Oct 2026 00:05Z, "Quicker 78°": from line abreast the 78° start in 21 s over a 60° one in 34 s that met 210 KIAS; the 10 s is an estimate) |
| TURNING_REJOIN.fwApproach | `Object.freeze({ windowFt: 1200, carrotWindowFt: 250, decisionFt: 1000, coneEaseFarFt: 1500, captureFt: 250` | The turning rejoin to fighting wing's ride (turning-rejoin.js REJOIN_WAYS.fw), all estimates (Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 9) |
| TURNING_REJOIN.rideCaptureAlongFt | `1750` | he joins (the middle of Patrick's 1,500-2,000 ft, G6) the line no closer to Lead than this, or where he already is if closer (Patrick G1: established by 1,500 ft; 8 Oct 20:16 inside 2,000 ft get on it where he is) |
| TURNING_REJOIN.rideLeadFt | `1000` | he aims at the line this far further up it than his own place, so off it he heads across and onto it along it (estimate) |
| TURNING_REJOIN.rideMinLeadFt | `400` | ...and never less than this, so he never heads straight across it (estimate) |
| TURNING_REJOIN.rideStopFtps2 | `80` | he closes on the line no faster than he could stop on it at about this, in Lead's frame (a hard turn's worth with margin for the roll; estimate) |
| TURNING_REJOIN.rideAlongTauSec | `8` | until established, he takes out his distance from the capture point along the line over about this long, falling back if hot (estimate) |
| TURNING_REJOIN.rideSettleSec | `2` | close to the line he takes out the last of it over about this long, so he settles on it without chasing it (estimate) |
| TURNING_REJOIN.rideEaseFromFt | `500` | from this far up the line he eases off... (Patrick 8 Oct 21:26 card: 'Hold 210 to about 500 ft, then ease to about 205') |
| TURNING_REJOIN.rideEaseKias | `205` | ...to this, so he enters the window at about 15 kt (same card) |
| TURNING_REJOIN.highBoardsKt | `5` | high on the line, the boards come out once the height to lose is worth more than this much speed over the line's (Patrick 11 Oct 2026 09:10Z: "use the speed brake"; estimate) |
| TURNING_REJOIN.rideSpeedUpFt | `150` | within this of the line he sets 210 so he is at it when established, not still accelerating with MAX (estimate) |
| TURNING_REJOIN.rideHeadingTauSec | `2` | his heading comes onto the one asked over about this long (estimate) |
| TURNING_REJOIN.rideCrossShare | `0.7` | closing on the line from far off, at most this share of his speed goes across it in Lead's frame (estimate; Patrick 10 Oct 2026 20:15Z card "Faster smooth", TS-173) |
| TURNING_REJOIN.rideDriftFtps | `10` | established: within captureFt of the line and drifting across it no faster than this (Patrick G2, "Lead fixed on the canopy") |
| STRAIGHT_REJOIN |  | The straight-ahead rejoin, flown the way a pilot flies it (straight-rejoin.js, TS-72; Patrick 5 Oct 08:40Z: "SARJ should start at full power until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back"; the review's SARJ, fable-compiled.md section 3). All estimates unless a source is given. |
| STRAIGHT_REJOIN.lineArriveKt | `8` | he joins the line and flows up it closing at about this, slow enough to stop on the slot with power back, never stopping short of it (estimate) |
| STRAIGHT_REJOIN.lineFlowFt | `20` | he flows on up the line once within this many feet of route (on the line, TS-103), never stopping there (estimate; 40 until V2.232, when route at 3 wingspans, TS-181, left the line to echelon too short and he flowed in 6 ft ahead) |
| STRAIGHT_REJOIN.captureFt | `100` | he is on Lead's six within this many feet of it; until then full power, from then the overtake (estimate) |
| STRAIGHT_REJOIN.stopShare | `0.5` | he closes on Lead's six line no faster than he could stop on it at this share of the sideways pull his 60° bank gives (g tan 60°, about 56 ft/s²), the rest left for the roll and the heading lag (estimate; tried at 80, 40 and 25 ft/s²; refactor step 5, Fable's recommendation for Patrick's yes) |
| STRAIGHT_REJOIN.closeStopBankDeg | `15` | from a close start (fighting wing) he closes on the six no faster than he could stop on it at this bank's sideways pull (g tan 15°, about 8.6 ft/s²) (estimate; Fable's recommendation 11 Oct: a 10° cut flown with about 15° of bank) |
| STRAIGHT_REJOIN.closeHeadingTauSec | `7` | from a close start his heading comes onto the one asked over about this long: about 1.5° of bank per degree of cut at 200 KIAS (V / 1.5 g), so bank in proportion to the cut, the close-formation rule (estimate; Fable's recommendation 11 Oct, for Patrick's yes) |
| SPEEDS | `Object.freeze([` | Every speed the wingmen fly to, in one table, each row marked a limit (physics, the 200 KIAS rejoin floor, the overshoot call: never planned past) or a target (an aim: may be missed, and the card says so; references, not walls, the rule book). The values are read from their one home (the constant named); this table adds what kind each is and its source. |
| KINEMATIC |  | The numbers of the kinematic moves. All estimates unless a source is given. |
| KINEMATIC.lateralFtps | `RATE_SETS.close.frame.lateralFtps` | 140 ft/s across Lead's heading: about a 25° heading difference at 200 KIAS (estimate; SMM 16.18 para 51 gives no angle) |
| KINEMATIC.foreAftFtps | `RATE_SETS.close.frame.foreAftFtps` | 25 ft/s along it: about 15 KIAS of overtake or undertake, the middle of EFIG p.374's 10-20 KIAS |
| KINEMATIC.verticalFtps | `RATE_SETS.close.frame.verticalFtps` | 15 ft/s up or down: 900 ft/min (the 4-ship's stack-change estimate) |
| KINEMATIC.verticalTacticalFtps | `45` | 45 ft/s up or down: 2,700 ft/min tactical altitude adjustment (Task 5) |
| KINEMATIC.nearPerSec | `RATE_SETS.close.frame.nearPerSec` | closing slows with range: 10% of the range per second ... |
| KINEMATIC.nearMinFtps | `RATE_SETS.close.frame.nearMinFtps` | 8 ft/s ... but never below about 5 kt, the station-change rate (SMM 12.20 para 44 says "controlled") |
| KINEMATIC.closeBlendSec | `3` | a close formation wingman follows a roll of Lead this long after it (SMM 12.19 para 43: he lags Lead's roll) |
| KINEMATIC.planeLagSec | `3` | a close wingman's place in Lead's wing plane follows Lead's bank over this long (SMM 12.19 para 43: he lags the roll; estimate) |
| KINEMATIC.wideBlendSec | `8` | a fighting wing wingman takes this long |
| KINEMATIC.followLateralG | `0.2` | ... and swings its track at no more than this much sideways G (estimate) |
| KINEMATIC.followAccelKtps | `2.5` | ... or longer, so a wingman following a roll of Lead speeds up or slows at no more than this (estimate; inside the 3 kt/s the smoothness tests allow) |
| KINEMATIC.startBlendSec | `3` | a station change starts moving over this long |
| FW_TURN |  | The numbers of the fighting wing turns. Estimates unless a source is given. |
| FW_TURN.collapseFromDeg | `32` | #2 starts collapsing once Lead's bank passes this ... |
| FW_TURN.collapseFullDeg | `42` | ... and goes all the way to Lead's six by this |
| FW_TURN.collapseMinTurnDeg | `45` | ... but only in turns of this size or more: the check turn (20°) keeps #2's side and sweep (AFM7 brief p.14 item 5a). Patrick 5 Oct 06:44Z agreed "the fighting wing collapse tied to turn size, not bank" once every turn flew at 60°; 45° is the thread's pick (an estimate). |
| FW_TURN.band | `{ minFt: FW_BAND.rangeFt[0], maxFt: FW_BAND.rangeFt[1], minSweepDeg: FW_BAND.sweepDeg[0], maxSweepDeg: FW_BAND.sweepDeg[1] }` | SMM 12.29 para 69, Fig 12.19 (500-1,000 ft, 30-60°: slots.js FW_BAND, the one copy) |
| FW_TURN.aimInsideFt | `50` | when #2 has to move back into the band, it aims this far inside its edge in range ... |
| FW_TURN.aimInsideDeg | `5` | ... and in sweep, so it ends clearly in it (the shared ±100 ft and ±5° margins would also pass the edge) |
| FW_TURN.turnDeg | `{ check: 20, delayed45: 45, delayed90: 90, inPlace90: 90, hook: 180 }` | each turn button's turn, in fighting wing |
| FW_FOLLOW |  | The tracker's settings for a wingman following its goal in a fighting wing turn (estimates; the bank cap is flagged on screen, never a wall). What each does to the flying (tracker.js; Patrick 05:27Z asked for the gains in plain words): |
| FW_FOLLOW.coneAlt | `true` | his height is his own anywhere in the cone, and on the power profile he manages energy with it (FW_ENERGY, tracker.js) |
| FW_FOLLOW.goalTolFt | `3` | the moving goal counts as reached once the target slot is within 3 ft of it (estimate) |
| FW_FOLLOW.fwdRate | `40` | how fast the target slot slides fore and aft toward the goal, ft/s (estimate) |
| FW_FOLLOW.latRate | `60` | how fast the target slot slides sideways toward the goal, ft/s (estimate) |
| FW_FOLLOW.vrel0 | `30` | the closing speed on the target slot when near it, ft/s (estimate) |
| FW_FOLLOW.kcap | `0.05` | how much more closing speed per foot of range beyond d0, ft/s per ft (estimate) |
| FW_FOLLOW.d0 | `100` | the range beyond which the closing speed may grow, ft (estimate) |
| FW_FOLLOW.vrelMax | `120` | the most closing speed on the target slot, ft/s (estimate) |
| FW_FOLLOW.decel | `2` | the closure is never more than #2 could stop at this deceleration, ft/s² (estimate) |
| FW_FOLLOW.bankCapDeg | `G_RULE_BANK_DEG` | no cap but the G rule (Patrick 06:16Z item 11; 60°, an estimate, until step 2), flagged, never a wall |
| FW_FOLLOW.overtakeKias | `15` | power only a little: geometry does the rest (Patrick 19:12Z); the most speed above Lead, KIAS |
| FW_FOLLOW.undertakeKias | `15` | the most speed below Lead, KIAS (estimate) |
| FW_FOLLOW.advanceTol | `25` | within this many feet of the goal a leg counts as flown (estimate) |
| FW_FOLLOW.finalTol | `6` | within this many feet of the last goal, and slow against it, #2 is settled (estimate) |
| FW_PURSUIT |  | The pursuit curves #2 flies in a fighting wing turn (fw-pursuit.js, TS-100; SMM 12.29 para 69, 12.30 paras 71-73, Figs 12.20-12.23). Every number is an estimate unless a page is named beside it. |
| FW_PURSUIT.minBankDeg | `5` | Lead banked less than this is not turning: the tracker's band goal flies #2 instead (estimate) |
| FW_PURSUIT.aimRangeFt | `750` | the range aimed for on the circle: the middle of the cone's 500-1,000 ft (SMM 12.29 para 69, Fig 12.19) |
| FW_PURSUIT.arcScaleFt | `250` | the arc ahead of or behind the aim point that asks for the full angle off the tangent: the cone's edges, 250 ft either side of the aim (estimate) |
| FW_PURSUIT.leadMaxDeg | `30` | the most #2's nose points inside the circle when behind the aim point (lead) or outside it when ahead (lag), degrees (estimate) |
| FW_PURSUIT.lagMaxDeg | `20` | the most his nose points outside the circle when ahead of the aim point and inside it (turned into, tight: the miss, Fig 12.22), degrees (estimate) |
| FW_PURSUIT.circleScaleFt | `500` | how far outside or inside Lead's circle asks for the full extra lead or lag, ft (estimate) |
| FW_PURSUIT.circleDeg | `20` | that extra lead (outside the circle) or lag (inside it), degrees (estimate) |
| FW_PURSUIT.closeKias | `10` | the most speed above or below Lead the arc error asks for; power last, geometry first (Patrick 5 Oct 23:02Z; estimate) |
| FW_BUBBLE |  | The fighting wing bubble through a turn (Patrick 6 Oct 15:32Z: "When flying turns in fighting wing including entering and exit 2 must stay between 500 and 1000 feet ... on a turn in to 2 when 2 is near the front they may have to turn opposite of lead for a second to fly lag the capture the turn circle without busting that bubbles. If far and lead turns away assertive pull of lead pursuit to stay w |
| FW_BUBBLE.minFt | `FW_BAND.bubbleFt, maxFt: FW_BAND.rangeFt[1], marginFt: 60, horizonSec: 3, stepSec: 0.5, turnRateDegS: 15, searchStepDeg: 3, closeKias: 15` |  |
| FW_BUBBLE.tightHorizonSec | `8, diveFtps: 150, pullFtps2: 60, altGain: 1.5, maxBelowFt: 500` | The inner edge (Patrick 6 Oct 15:56Z: "For the tight turn towards 2, 2 can pull up into the vecitcal or dive towards lead to avoid the bubble as required"; 15:57Z: "Roll and dive away I mean"; TS-134): looking tightHorizonSec ahead, if the range across would come inside minFt plus marginFt, #2 rolls and dives to the height below Lead that keeps that slant range, at up to diveFtps (9,000 ft/min), t |
| FW_EXIT |  | The fighting wing turn exit (formation-turns.js fwExitSide; SMM 12.30, Fig 12.23): when Lead rolls out, #2 picks the side of the cone he flows to from the range he will have a few seconds on. Past the cone (stretched or opening): the inside of the turn, the shortest path. Inside it (tight or closing hard): the outside, the longer path. In between: the side his nose is already carrying him to, so h |
| FW_EXIT.lookAheadSec | `5` | the range is judged this far ahead at the present opening or closing (estimate) |
| FW_EXIT.reset | `Object.freeze({ vrel0: 150, kcap: 0.3, vrelMax: 300, decel: 20, overtakeKias: 30, undertakeKias: 30 })` | Back into the cone assertively after the turn (Patrick 6 Oct 15:59Z: "When the fighting wing turn ends 2 needs to assertively move back into the cone (it's too slow right now)"; TS-134): the tracker's closure law at these, not FW_FOLLOW's gentler ones; the height part is the cone energy at the bubble's rates (tracker.js). Estimates. |
| FW_EXIT.alignBankDeg | `10` | once in the cone, he eases his heading onto the one flown off's with no more than this bank, not the tracker's 30°, so a few degrees left over come off over a few seconds instead of a 30° flick that the wingmen behind copy (estimate) |
| FW_SWITCH |  | The fighting wing side switch (fw-switch.js, TS-102; Patrick 6 Oct 2026 01:04Z: "the station change from side to side in fighting wing should be at least 60 deg bank. it's a fast switch over that can be used to bleed energy. right now its very slow"). An S-turn behind Lead: into the tail line at the switch bank, then the other way until he is parallel to Lead again on the other side of the cone, h |
| FW_SWITCH.bankDeg | `60` | the bank he switches at, both ways: at least 60° (Patrick 6 Oct 01:04Z) |
| FW_SWITCH.holdKias | `25` | the most speed above or below Lead he uses to hold his spacing through the switch: geometry first, then power (Patrick 6 Oct 01:24Z; the figure is an estimate) |
| FW_SWITCH.holdScaleFt | `150` | the range opened or closed from the press that asks for all of holdKias, ft (estimate) |
| FW_SWITCH.aimSweepDeg | `35` | the S-turn aims 35° off Lead's tail line in the far cone: inside the band's 30° edge (SMM 12.29 para 69, Fig 12.19) with the least turn in, since every degree of turn in drops him back (estimate) |
| FW_SWITCH.rollOutDeg | `3` | the switch is over once his heading is back within this many degrees of Lead's: the band goal settles him in the far cone from there (estimate) |
| FW_SWITCH.reverseSec | `1.2` | about how long the roll from the switch bank one way to the other takes, allowed for when picking the reversal point (estimate from the T-6A roll ceiling, t6-performance.js) |
| FW_SWITCH.turnInMaxDeg | `40` | the most he turns in, off Lead's heading: the across he gains per foot dropped back falls off past this (drop-back is across × tan(half the angle)), and the band goal closes the rest (estimate) |
| FW_SWITCH.minBehindFt | `300` | the S-turn is flown only while he is at least this far behind Lead: nearer, he drops straight back first, never crossing close behind Lead (estimate; SMM 12.29 para 69 keeps fighting wing 500-1,000 ft back) |
| FW_ENERGY |  | Fighting wing energy with the cone (TS-96; Patrick 5 Oct 22:45Z: "energy can be managed with the cone", 23:02Z: "Use the cone as required, power as a last resort"): on the power profile in fighting wing (tracker.js), #2 takes a slowing first as a climb and a speeding up as a descent, inside the cone's height, so the throttle moves only for what the height can't give. The horizontal path and the sp |
| FW_ENERGY.coneUpFt | `IN_POSITION.fwStackFt - 25` | he uses the cone's height up to this far above or below Lead, 25 ft inside the in-position band: the top of the cone (Patrick 6 Oct 16:58Z; the margin an estimate) |
| FW_ENERGY.pullFtps2 | `8` | the climb rate changes no quicker than this, about a quarter G, charged as G (estimate) |
| TRACKER |  | The tracker's own numbers (tracker.js): a small control loop that chases a moving target slot in the frame of the aircraft flown off, flown once at the press and replayed. It stays as the fallback for starts no kinematic-line rule covers (Patrick 5 Oct 05:27Z: "Tracker for fallback, and refractor the tracker"). All estimates: they shape how smoothly the wingman flies, not where the formations are. |
| TRACKER.gain | `Object.freeze({` |  |
| TRACKER.…position | `0.3` | 1/s: position error to relative velocity |
| TRACKER.…heading | `1.2` | 1/s: heading error to turn rate (1.5 before #2's roll built its acceleration, TS-196: at 1.5 the roll that builds its acceleration came out of fighting wing to line abreast 17° past the bank it settles on; Fable's plan) |
| TRACKER.…refRate | `0.5` | 1/s: how fast the moving reference closes on its target |
| TRACKER.…speedLoop | `0.8` | 1/s: speed error to acceleration |
| TRACKER.…jerkKtps2 | `POWER_JERK_KTPS2` | kt/s²: the acceleration follows the torque, 0 to 100% in about 0.2 s (Patrick 6 Oct 03:17Z, TS-108; 1.0 until V2.119) |
| TRACKER.…ffFilter | `0.2` | how much of the commanded heading's own turn rate is fed forward each step (a smoothing share; estimate) |
| TRACKER.refAccelShare | `0.25` | the target slot builds up to its slide rate over 4 s (a quarter of the rate per second; estimate) |
| TRACKER.bankLeg | `Object.freeze({ refAccelShare: 0.6, refRate: 1.5 })` | a leg with a bank target (targetBankDeg, the close moves of CLOSE_SHAPING) builds the target slot's rate faster, 0.6 of it per second, and closes on it at 1.5/s, in place of refAccelShare and gain.refRate (estimates) |
| TRACKER.snapMaxFt | `1.0` | the target slot's snap distance is never more than 1 ft ... (estimate) |
| TRACKER.snapTolShare | `0.25` | ... and otherwise a quarter of the leg's advance tolerance (estimate) |
| TRACKER.lineOverrunShare | `1.2` | up or down the spinner-wingtip line, he stays on the line's extension up to 20% past its end (estimate) |
| TRACKER.snapFt | `0.05` | the target slot snaps onto its place within this many feet (estimate) |
| TRACKER.goalTolFt | `2` | a moving goal counts as reached within this many feet, unless the leg says otherwise (estimate) |
| TRACKER.settleMinFtps | `1.2` | settled: no faster against the last slot than this, ft/s ... |
| TRACKER.settleShare | `0.3` | ... or this share of the leg's final tolerance per second, whichever is more (estimates) |
| TRACKER.alignBankDeg | `30` | once settled, #2 turns to Lead's heading with no more than this bank (estimate) |
| TRACKER.minSpeedFtps | `1` | a commanded velocity under this gives no heading: #2 takes Lead's (estimate) |
| TRACKER.kiasSnap | `0.003` | the last few thousandths of a knot are taken out at once, so the speed has no step |
| TRACKER.alignHeadingRad | `1.5e-4` | aligned: within this of Lead's heading (about 0.01°) |
| TRACKER.alignDeadbandDeg | `0.05` | a closure phase, or the fighting wing cone (from 12 Oct 2026), lining up commands no bank under this (step 2): at 1.2/s of heading gain it is a heading error of about 0.004°, inside alignHeadingRad |
| TRACKER.laneRangeFt | `LANE.rangeFt` | the overshoot lane is measured inside this range (slots.js LANE) |
| TRACKER.belowRangeFt | `LANE.belowRangeFt` | the height under Lead is measured inside this range (slots.js LANE) |
| TRACKER.phase | `Object.freeze({` | Named in the sheet from tracker.js (12.2b, TS-214), values unchanged: |
| TRACKER.…latRate | `8` | how fast the target slot slides sideways, ft/s: station changes close or open at about 5 kt, an estimate (the SMM says only "controlled", 12.20 para 44) |
| TRACKER.…fwdRate | `8` | how fast the target slot slides fore and aft, ft/s (the same estimate) |
| TRACKER.…vrel0 | `10` | ft/s the closing speed is held to near the slot |
| TRACKER.…kcap | `0` | ft/s more per foot of range beyond d0 |
| TRACKER.…d0 | `100` | the range beyond which the closing speed may grow, ft (estimate) |
| TRACKER.…vrelMax | `60` | the most closing speed on the slot, ft/s (estimate) |
| TRACKER.…decel | `1.2` | ft/s²: about half what slowing with the power back gives (about 1.5-2 kt/s, slow-down.js), so the speed loop can stop the closure in time (estimate) |
| TRACKER.…bankCapDeg | `CLOSE_BANK_DEG` | the most bank the wingman uses in a close move: 60° (Patrick 06:43Z; 30° from 06:16Z item 12, 25°, an estimate, until step 3); flagged, never a wall |
| TRACKER.…overtakeKias | `8` | the most speed above the aircraft flown off, KIAS (estimate) |
| TRACKER.…undertakeKias | `12` | the most speed below it, KIAS (estimate) |
| TRACKER.…advanceTol | `3` | within this many feet of a leg's slot the next leg starts (estimate) |
| TRACKER.…finalTol | `1.5` | within this many feet of the last slot, and slow against it, the wingman is settled (estimate) |
| TRACKER.height | `Object.freeze({` | Named in the sheet from tracker.js (12.2b, TS-214), values unchanged: |
| TRACKER.…minChangeFt | `0.5` | a smaller change is left out |
| TRACKER.…minSec | `6` | no height change takes less than 6 s (estimate) |
| TRACKER.…heightG | `TURNING_REJOIN.heightG` | nor quicker than one smooth leg within the rejoin's height-change g (TS-140; estimate) |
| TRACKER.…unknownLegSec | `6` | a leg whose end was never learned is given 6 s (estimate) |
| TRACKER.…paceFtps | `Object.freeze({ rejoin: 120, tactical: 45, close: 15 })` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.coneEase | `Object.freeze({` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.…overLeadDeg | `5` | arriving along the line at the cone or the decision point his bank eases down to Lead's + this ... (estimate; row 1) |
| TRACKER.…minDeg | `25` | ... and never under this: the rejoin end's "bank proportional to the correction, bounded, very smooth", not a bank cap on the rejoin (estimate; row 1) |
| TRACKER.turnPower | `Object.freeze({` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.…bankDeg | `15` | in a turn past this bank ... (estimate; row 2) |
| TRACKER.…behindFt | `200` | ... and more than this far behind Lead ... (estimate; row 2) |
| TRACKER.…holdShare | `0.7` | ... his power never drops below this share of what holds his speed in the turn: a wingman doesn't idle in a turn behind Lead (estimate; row 2) |
| TRACKER.boards | `Object.freeze({` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.…closureKt | `25` | above this planned closure ... (estimate, below the 30 kt overshoot trigger so the brake comes first; row 3) |
| TRACKER.…insideFt | `500` | ... and less than this far behind Lead, the speed brake as well as power (estimate; row 3) |
| TRACKER.fwSettle | `Object.freeze({` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.…marginFt | `20` | settled in fighting wing: inside FW_BAND (SMM 12.29 para 69, 500-1,000 ft) widened by this ... (estimate; row 5) |
| TRACKER.…marginDeg | `2` | ... and its 30-60° sweep widened by this (estimate; row 5) |
| TRACKER.…aboveFt | `5` | no more than this above Lead ... (estimate; row 5) |
| TRACKER.…belowFt | `200` | ... nor this far below him (estimate; row 5) |
| TRACKER.…kt | `12` | speed within this of Lead's (estimate; row 5) |
| TRACKER.…bankDeg | `15` | bank within this of Lead's (estimate; row 5) |
| TRACKER.…climbFtps | `5` | climb or descent within this of Lead's, so he isn't still climbing when the rejoin ends (estimate; V2.330) |
| TRACKER.openingFull | `Object.freeze({` | The pace a height change is planned at when the leg names none: rejoin, tactical, close. A pace, never a cap: the G limits above govern (no height-rate cap, TS-140; the height-rate check retired, TS-178) (estimates; Patrick 11 Oct 2026 16:26Z, "Agree with chart", unsourced-numbers.md row 4) |
| TRACKER.…ceilingKias | `REJOIN_LINE_KIAS.ai` | the opening full power ends at the AI line speed (235 KIAS, TS-133) ... (row 6) |
| TRACKER.…overLineKt | `15` | ... or the line speed + this, whichever is higher ... (estimate; row 6) |
| TRACKER.…nearLeadFt | `1500` | ... or within this of Lead (to fighting wing, the band's far edge instead) (estimate; rows 6, 15) |
| TRACKER.wrongSideFt | `50` | more than this past Lead's six is the wrong side; inside the step-down gate (LANE.belowRangeFt, 2,000 ft, TS-151) that drops the ride (about 1.5 wingspans, estimate; row 8) |
| WING |  | #2's numbers. Sources beside each; "estimate" where none. |
| WING.latDeg | `15` | off Lead's tail, inside the 30° half cone (estimate; cone: Patrick 19:20Z row 2) |
| WING.rangeSec | `6` | how long a new distance setting takes to fly (estimate) |
| WING.blendInSec | `10` | entry (estimate) |
| WING.blendOutSec | `12` | terminate (estimate) |
| WING.blendMinSec | `3` | no blend quicker than 3 s, however quick the rate (estimate) |
| WING.swapAccelDps2 | `2` | how quickly a wingman can stop a drift across the cone, 2°/s² (estimate) |
| WING.swapMarginDeg | `2` | the stop must be at least 2° past the tail line before he swaps, so he doesn't flick on a line (estimate) |
| WING.swapGuardSec | `4` | no new swap for 4 s after one ends (estimate) |
| HOLD |  | The numbers of the hold. Estimates unless said. stretchMinFt, stretchShare: #2 is STRETCHED while he is more than this far behind where the planned line wanted him (10 ft, or 5% of his range from the aircraft he flies off if more), so a close wingman shows it at a few feet and a fighting wing one at a few tens. overtakeKias: closing back up he keeps at most this overtake, the middle of EFIG p.374' |
| HOLD.stretchMinFt | `10` |  |
| HOLD.stretchShare | `0.05` |  |
| HOLD.overtakeKias | `15` |  |
| HOLD.jerkFtps3 | `POWER_JERK_KTPS2 * KT_TO_FTPS` |  |
| HOLD.extraSec | `120` |  |
| HOLD.lookSec | `2` | he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate) |
| HOLD.bubbleMarginFt | `50` | with Lead at MAX, #2 takes power off only within about 50 ft of the 500 ft bubble (estimate) |
| FOUR_OPEN |  | The 4-ship's opening out (four-open.js: fighting wing or finger to Spread 4, the Fluid 4 split, the offset box spread): each wingman turns away and back at this bank at most. Patrick 6 Oct 01:44Z: "nah keep it sporty at 60 deg" (it was the G rule alone, about 78° and 5 G at the press: 5 Oct 06:16Z item 12, TS-66 (4)). |
| FOUR_OPEN.bankDeg | `60` | the opening-out bank, held (Patrick 6 Oct 01:44Z) |
| FOUR_OPEN.offHeadingsDeg | `Object.freeze([20, 25, 30, 35, 40, 45])` | how far off Lead's heading each holds on the way out to Spread 4; the one that settles soonest is flown (estimates; open-out.js's search) |
| OPEN_OUT.reserveKtps | `0.4` | #2 opens out up to the speed where full power still has this much in hand (estimate) |
| OPEN_OUT.gainKtPerSqrtFt | `0.45` | KIAS gained per square root of the range from Lead on the way out: full power plus the dive, about 1 KIAS per second from 200 (estimate fitted to the core T-6 curve, kept under it so the line stays inside full power) |
| OPEN_OUT.leadHolds | `true` | Lead holds his speed until #2 is out, then speeds up to line abreast speed (estimate needing Patrick's yes; false: he speeds up at once) |
| OPEN_OUT.nearPerSec | `RATE_SETS.tactical.frame.nearPerSec` | 10 |
| OPEN_OUT.nearMinFtps | `RATE_SETS.tactical.frame.nearMinFtps` | 20 ft/s |
| OPEN_OUT.foreAftFtps | `RATE_SETS.tactical.frame.foreAftFtps` | 80 ft/s: falling back in Lead's frame on the way out is geometry (the angle off), not a closure: up to about 47 kt (estimate) |
| OPEN_OUT.law | `RATE_SETS.tactical.law` | How hard the line may accelerate and turn in Lead's frame (RATE_SETS.tactical.law). Patrick 21:11Z: the near-Lead throttle is only for holding close formation; "as soon as a tactical formation is selected, unrestricted attitude changes and power". Full power along, a 45° banked turn's lateral acceleration (1 g across; estimate), a 0.3 g push or pull for the dive and the climb back (estimate). |
| OPEN_OUT.handOverFt | `150` | the tracker takes over this close to the slot (estimate) |
| OPEN_OUT.diveFt | `400` | A full power dive to start (Patrick 21:06Z: "LAB from echelon would be expedited by a full power dive to start"): #2 drops this far below Lead on the way out, trading height for speed, and climbs back to Lead's height by the slot, which bleeds the extra speed off again (energy height, standard aerodynamics; full-power.js). Both numbers are estimates. |
| OPEN_OUT.verticalFtps | `RATE_SETS.tactical.frame.verticalFtps` | 40 ft/s down or up on the way out: about 2,400 ft/min (estimate) |
| LAG_ROLL |  | #2's lag roll from fighting wing to the cone on Lead's other side (Patrick 5 Oct 08:54Z: "the airplane flips up and rolls canopy to canopy to lead then lands in the cone on the other side, power pitch and bank as required"). The SMM and EFIG do not name the lag roll; the nearest pages are SMM 12.29 para 69 (the cone, using the vertical), SMM 12.30-12.31 para 74 (lag pursuit) and SMM 14.8 paras 18- |
| LAG_ROLL.pullG | `Object.freeze([3, 2.5])` | the searched pull: the barrel roll's 3 G entry (SMM Table 14.1; Fig 14.1) and a softer 2.5 (estimate) |
| LAG_ROLL.noseUpDeg | `Object.freeze([45, 30])` | the searched nose-up: 30-45° (estimate; 45 is the barrel roll's, SMM 14.8 para 19) |
| LAG_ROLL.noseUpSlopDeg | `6` | how near the planned path's steepest climb must come to the searched nose-up (estimate) |
| LAG_ROLL.topKiasBand | `Object.freeze([150, 185])` | a plan slower than the first over the top is not used (estimate); since TS-144 the speed is the energy's, at full power throughout, so the 185 is no longer used |
| LAG_ROLL.inBandMarginFt | `50` | the roll may end, or close to, this far inside the band's far range ... (TS-144; estimate) |
| LAG_ROLL.inBandMarginDeg | `5` | ... and this far inside its far sweep (estimate) |
| LAG_ROLL.pmOffDeg | `Object.freeze([12, 15, 18, 21, 24, 27])` | on the point mass (TS-147): how far toward Lead the barrel roll's circle is centred, searched (estimates) |
| LAG_ROLL.pmNoseUpDeg | `Object.freeze([15, 25, 35, 45])` | ... and its nose-up, searched (estimates; Patrick 22:52Z: flat is fine if physical) |
| LAG_ROLL.settleMaxSec | `15` | after the roll, back to Lead's speed wings level within this (estimate) |
| LAG_ROLL.powerSlackKtps | `1` | the path may ask up to this many KIAS per second more than full power gives, for the coarse step (estimate) |
| LAG_ROLL.topRangeFt | `Object.freeze([600, 1400])` | range from Lead passing over his six: 600-1,400 ft, the apex as low and close as the bubble allows with 100 ft to spare (Patrick 6 Oct 22:50Z "could we make the apex lower", TS-146; was 900; estimate) |
| LAG_ROLL.closeTopRangeFt | `Object.freeze([200, 1400])` | from echelon (TS-78, TS-149): over Lead's six at 200-1,400 ft, allows natural apex from close formation (estimate) |
| LAG_ROLL.bubbleFt | `FW_BAND.bubbleFt` | a plan that comes inside 500 ft of Lead is refused (slots.js FW_BAND.bubbleFt) |
| LAG_ROLL.minG | `0.3` | canopy to canopy means positive G throughout: no plan pushes (estimate) |
| LAG_ROLL.rollSec | `Object.freeze([8, 30])` | the roll's length searched, in whole seconds (estimate) |
| LAG_ROLL.climbFt | `Object.freeze([200, 2000])` | how far above the straight line from start to end he goes, searched in 100 ft steps (estimate) |
| LAG_ROLL.fallBackFt | `Object.freeze([0, 1000])` | how far behind the slot the roll ends, searched in 100 ft steps (estimate) |
| LAG_ROLL.searchStepSec | `0.25` | the search's coarse time step (the flown path is planned at the sim's own step) |
| LAG_ROLL.coneRangeFt | `Object.freeze([400, 1250])` | where the roll may end: the sim's fighting wing region (judge.js classifier, 400-1,300 ft), kept 50 ft inside its far edge (estimate) |
| LAG_ROLL.coneSweepDeg | `Object.freeze([20, 70])` | the same region's sweep (judge.js classifier; estimate) |
| LAG_ROLL.closeOvertakeKias | `20` | closing back up to the slot after the roll: the top of EFIG p.374's 10-20 KIAS overtake (estimate choice) |
| LAG_ROLL.rollingAboveDps | `10` | above this roll rate the rolling G limit (core availableG, rolling) is the one checked (estimate) |
| LAG_ROLL.setUpSweepInDeg | `2` | from fighting wing he first moves to the front of the cone, this far inside its 30° edge, and to its top (FW_ENERGY.coneUpFt), so the roll ends in position (Patrick 6 Oct 22:33Z, TS-143; the margin an estimate) |
| LAG_ROLL.setUpRangeFt | `600` | ... at this range, 100 ft outside the cone's 500 ft inside edge and the bubble, its most forward corner (estimate) |
| LAG_ROLL.setUpMinFt | `50` | a set-up shorter than this is skipped (estimate) |
| LAG_ROLL.setUpMinSec | `4` | the set-up takes at least this long (estimate) ... |
| LAG_ROLL.setUpOvertakeKias | `30` | ... moving at up to this relative to Lead, briskly (estimate) |
| LAG_ROLL.fallBackCostFt | `20` | the search's cost per foot of ending behind the slot is 1 per this many feet (was 100; TS-143: end in position; estimate) |
| LAG_ROLL.rollMissG | `0.3` | #2's wings roll no faster than the T-6A (TS-85): a path asking more is used only while the lift they don't yet point stays under this (estimate) |
| RECIPES |  | The settings each of the tracker's moves (recipes.js) lays over TRACKER.phase: how fast the target slot slides (fwdRate, latRate, ft/s), the closing speed near the slot (vrel0, ft/s) and how it grows with range (kcap ft/s per ft beyond d0 ft) up to vrelMax, the deceleration (decel, ft/s²), the bank cap, the speed band against the aircraft flown off (overtakeKias, undertakeKias), the tolerances (ad |
| RECIPES.dropBack | `Object.freeze({ vrel0: 12, advanceTol: 15, finalTol: 6 })` | with CLOSE_SHAPING's rates, bank and speed band |
| RECIPES.sweepOut | `Object.freeze({ fwdRate: Infinity, latRate: Infinity, vrel0: 30, kcap: 0.1, d0: 50, vrelMax: 200, decel: 3, bankCapDeg: 45, overtakeKias: 20, undertakeKias: 20, advanceTol: 25, finalTol: 6, altSec: 6 })` | Patrick 19:03Z, TS-55: 7-15 s to fighting wing |
| RECIPES.closeThrough | `Object.freeze({ fwdRate: 40, latRate: 40, vrel0: 8, kcap: 0.05, d0: 100, vrelMax: 50, overtakeKias: 20, advanceTol: 6, bankCapDeg: 25 })` | SMM 16.15 para 38; AFM7 p.18 |
| RECIPES.rejoinTo | `Object.freeze({ rejoin: true, fwdRate: Infinity, latRate: Infinity, vrel0: 25, kcap: 0.1, d0: 500, vrelMax: 260, decel: 3, undertakeKias: 25, advanceTol: 40, finalTol: 3, altSec: 10 })` | with REJOIN's bank cap and overtake |
| RECIPES.openOut | `Object.freeze({ fwdRate: 40, latRate: 150, vrel0: 40, kcap: 0.1, d0: 300, vrelMax: 220, decel: 2, bankCapDeg: 45, overtakeKias: 25, undertakeKias: 15, advanceTol: 30, finalTol: 25 })` | SMM 16.18 para 51 |
| RECIPES.straightAhead | `Object.freeze({` |  |
| RECIPES.…quick | `Object.freeze({ rejoin: true, fwdRate: Infinity, latRate: Infinity, decel: 2, undertakeKias: 15 })` | every leg (Patrick 06:09Z) |
| RECIPES.…lineUp | `Object.freeze({ vrel0: 20, kcap: 0.05, d0: 50, vrelMax: 100, bankCapDeg: 30, overtakeKias: 15, advanceTol: 60 })` | onto the six, 1,000 ft back |
| RECIPES.…close | `Object.freeze({ vrel0: 36, kcap: 0, vrelMax: 50, decel: 3, bankCapDeg: 20, overtakeKias: 30 })` | along the six line, about 21 KIAS overtake (EFIG p.371's 20-30) |
| RECIPES.…route | `Object.freeze({ rejoin: true, overtakeKias: 30, vrel0: 6, kcap: 0.04, decel: 1, advanceTol: 6 })` | into route, slowing (SMM 16.15 para 38) |
| RECIPES.…routeFinalTol | `1.5` | ... and settled within 1.5 ft when it ends in route |
| RECIPES.…routeLowFt | `25` | ... else aimed 25 ft below route, closing level or slightly low (SMM 16.15 para 38; 25 ft an estimate) |
| RECIPES.fwSettle | `Object.freeze({ advanceTol: 6, finalTol: 6, vrel0: 16 })` | after the side switch he settles where he is in the cone |

## Bands: in position and done (`bands.js`)

| Number | Value | Source and note |
|---|---|---|
| STEADY | `Object.freeze({ closureKt: 5, bankOffDeg: 10 })` | When a 2-ship change of formation counts as done (formation.js inBandAndSteady; Patrick 5 Oct 20:39Z card "In band and steady", 20:41Z "I want 'stabilize' to be 'within 5 knots' instead of 'exactly zero'"; TS-78): #2 IN POSITION by the judge's band, moving against his slot at under closureKt, and banked within bankOffDeg of Lead (estimate). The tracker keeps closing on the exact slot underneath. |
| IN_POSITION | `Object.freeze({ closeFt: 5, fwStackFt: 200, labBandFt: Object.freeze([4000, 6000]), labStackFt: 2000 })` | What "in position" means (Patrick 5 Oct 21:26Z and 21:38Z, TS-80): a tactical formation is in position anywhere in its band: fighting wing in the cone up to fwStackFt above or below Lead (Patrick: 200 ft, straight and level); line abreast in the SMM's band, labBandFt lateral and labStackFt vertical (SMM 16.18 para 49: 4,000-6,000 ft, 0-10° sweep, ±2,000 ft). A close formation is in position within |
| STOP_KT | `5` | A station change's stop at a corner: "stabilize" is within this many knots against the slot, then the dwell (Patrick 20:41Z; was 1 ft/s). |
