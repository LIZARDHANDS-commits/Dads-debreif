# Formation Sim numbers register

Every number the Formation Sim's planners use, with the source written beside it in the code (refactor PR 4, TS-95). Made by `node tools/turn-sim-numbers.mjs` from `src/modules/turn-sim/live/` rates.js, bands.js and moves.js; do not edit by hand. "Estimate" means no manual page or ruling backs it yet. The formations' own places and bands are in `slots.js` and `judge.js`.

## Rates: the G rule, the rate sets, the Rates setting, roll, banks (`rates.js`)

| Number | Value | Source and note |
|---|---|---|
| CLOSE_BANK_DEG | `60` | A close move's bank cap, every Rates choice (Patrick 5 Oct 06:43Z: "lets do up to 60 for all as requird for now"; it was 30°, 06:16Z item 12, which left the AI's 2.5 s route to echelon out of reach); WING_BANKS below. A slower rate banks less. |
| G_RULE | `Object.freeze({ normalG: 5, lastResortG: 7 })` | The G rule: 5 G is the normal aim (SMM 16.17 para 44a; Gen Book p.11), more only as a last resort and never 7 (TS-60 amendment). Flagged on screen, never a wall; 7 G is the physical limit the planners keep under. |
| G_RULE_BANK_DEG | `bankDegFromG(G_RULE.normalG)` | "No bank cap" (Patrick 06:16Z): the bank of a level turn at the G rule's normal 5 G, about 78°. |
| NO_BANK_CAP_DEG | `bankDegFromG(T6A_LIMITS.maxG)` | No bank cap (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; 04:07:49Z: "no bank cap on rejoins or movements around a station"): only the aircraft's own limits hold: the bank of a level 7 G turn, about 82° (t6-performance.js T6A_LIMITS.maxG; the stall line too, availableG); the G rule is flagged, never a wall. |
| RATE_SETS |  | Every move flies one of two sets of rates, and this is their one home (Patrick 5 Oct 21:06Z, 21:11Z: the near-Lead throttle is only for holding close formation, "as soon as a tactical formation is selected, unrestricted attitude changes and power"; 20:50Z: "Escelon is smooth to allow 2 to stay in position in tight formation", while "Fithging wing, rejoins, tactical formations, line abreast etc is  |
| RATE_SETS.close | `Object.freeze({` |  |
| RATE_SETS.…leadRoll | `Object.freeze({ maxRateDps: 30, maxAccelDps2: 20 })` |  |
| RATE_SETS.…echelonRoll | `Object.freeze({ maxRateDps: 30, maxAccelDps2: 12 })` |  |
| RATE_SETS.…frame | `Object.freeze({ lateralFtps: 140, foreAftFtps: 25, verticalFtps: 15, nearPerSec: 0.1, nearMinFtps: 8 })` |  |
| RATE_SETS.…law | `Object.freeze({ powerShare: 0.65, turnShare: 0.35, latG: 0.3, vertFtps2: 3 })` |  |
| RATE_SETS.tactical | `Object.freeze({` |  |
| RATE_SETS.…roll | `Object.freeze({ maxRateDps: 180, maxAccelDps2: 720 })` |  |
| RATE_SETS.…frame | `Object.freeze({ foreAftFtps: 80, verticalFtps: 40, nearPerSec: 10, nearMinFtps: 20 })` |  |
| RATE_SETS.…law | `Object.freeze({ powerShare: 1, turnShare: 1, latG: 1, vertFtps2: 10 })` |  |
| CLOSE_IN_SEC | `Object.freeze({ student: 10, instructor: 5, ai: 2.5 })` | How long each Rates choice takes from route to echelon, from the press to IN POSITION, seconds (Patrick 5 Oct 06:11Z: "student should take 10 seconds to get from route to eschelon ..., IP takes 5, AI takes 2-3? use that as a close in rate gauge"; AI's 2.5 is the middle of his 2-3). From it comes the close-in closure (closeInFtps below): the closure rate that flies route to echelon in that time wit |
| REJOIN_CLOSURE_KT | `Object.freeze({ student: 15, instructor: 25, ai: 50 })` | A rejoin's closure for each Rates choice, knots (Patrick 5 Oct 06:09Z: "Student keeps 15 knots, instructor 25 knots, all the way up into "route" or "corner" or "decision point" (whichever happens as a part of that rejoin) then they run in"; AI's 50 is an estimate, the thread's pick: double Instructor's). Held until #2 reaches the point the rejoin passes through (route, the corner, or the decision  |
| RATE_CHOICES | `Object.freeze(Object.keys(CLOSE_IN_SEC))` | The Rates choices in screen order, and their words. |
| RATE_WORDS | `Object.freeze({ student: 'Student', instructor: 'Instructor', ai: 'AI' })` |  |
| DEFAULT_RATES | `'instructor'` |  |
| CLOSURE |  | The power profile (Patrick 5 Oct 04:58Z: "setting a higher power setting until a rate is "Set" then reducing the powr to "maintain that rate", then as the aaircraft approaches the position it wants to be in, it does the opposite... low power until its stopped in position, then increase to maintain"; 05:47Z: "We can use power to "assertively set the rate""; 05:54Z: "speed brake can be used to help  |
| CLOSURE.stopShare | `0.6` | the tracker's stop is planned at 60% of what power back (sideways: the slide's bank) gives, so the roll and the speed loop's lag still stop him on the slot (estimate) |
| CLOSURE.slideBankDeg | `CLOSE_BANK_DEG` | sideways the closure is set and stopped with up to the close move's 60° of bank (Patrick 06:43Z; 30° from 06:16Z until then), the same for every Rates choice (Patrick 06:07Z: "No on bank and g") |
| CLOSURE.nearGain | `1` | 1/s: inside the last few feet the closure dies away in proportion to the distance, so he settles without hunting; sideways only, fore and aft it is the tracker's own TRACKER.gain.position (V2.23.1) (estimate) |
| CLOSURE.farGain | `0.1` | ft/s per ft: beyond the hand-over band (odd starts only, the tracker's fallback) the closing speed may grow with range (the old rejoin's kcap) |
| ENGINE_RESPONSE_SEC | `0.25` | How fast the engine answers the power lever: torque from 2% to 100% in about 0.25 s (Patrick 5 Oct 06:02Z: "The TQ can change very fast. 2 percent to 100 in .25 seconds."). A power change in the power profile (MAX, the power that holds the rate, IDLE, the power that holds the slot) reaches its new thrust in this long, so the acceleration it gives is there within it, then follows thrust minus drag. |
| RATE_SET_SEC | `2` | How long a change of rate takes: the power step is the smallest that reaches the new rate in about this long (an estimate, the thread's default for Patrick's 06:13Z technique: "set 90 or 100 to set it, then reset to 67 to maintain it"). |
| HAND_OVER_FT | `500` | The hand-over from a kinematic line to the tracker, and the change from a rejoin's closure to the close-in rate, together at about 500 ft from the slot (Patrick 5 Oct 06:24Z; before it, card "Lines, then tracker" 05:41Z and 05:44Z: "within 500-1000 feet, dpending on whats going on. becuase we start to see the aspect change and the clusre visually and adjust to that"). The line flies the big move a |
| WING_BANKS |  | The wingmen's banks, 2-ship (step 2) and 4-ship (step 3) (Patrick 5 Oct 06:16Z). Item 12: "30 is probably more accurate" for a close move's bank cap (the tracker's 25° until step 2); "When the aircraft is kicked off to fighting wing or line abreast they can use unlimited bank to dive away and get in position quickly": no cap there but the G rule. Item 11: "No, unlimitedf": a wingman following in a |
| WING_BANKS.closeBankCapDeg | `CLOSE_BANK_DEG` | Patrick 06:43Z: up to 60° as required (30° from 06:16Z item 12 until then) |
| WING_BANKS.kickOutBankCapDeg | `NO_BANK_CAP_DEG` | moves around a station: no cap (Patrick 6 Oct 04:07Z; the G rule only, 5 Oct 06:16Z item 12, until V2.116) |
| WING_BANKS.fwFollowBankCapDeg | `G_RULE_BANK_DEG` | Patrick 06:16Z item 11: the G rule only |
| WING_BANKS.rejoinBankCapDeg | `NO_BANK_CAP_DEG` | rejoins: no cap (Patrick 6 Oct 04:07Z; the G rule only, 5 Oct 06:16Z item 1, until V2.116) (the 4-ship's rejoin legs since step 3) |
| WING_BANKS.fwTurnBankDeg | `60` | Patrick 06:16Z item 9: 60° of bank, 2 G level, every fighting wing turn |
| ROLL | `RATE_SETS.tactical.roll` | Roll limits: up to 180°/s (Patrick 5 Oct 06:07Z: "Roll rate can be 180 degrees per second"; 90°/s until step 2, Patrick 4 Oct 08:54Z), building and dying away at 720°/s² (an estimate, step 2: 180°/s is reached in 0.25 s and within a 45° roll; it was 360°/s², Patrick card 4 Oct 09:54Z, which reaches 180°/s only in a roll of 90° or more). |

## Bands: in position and done (`bands.js`)

| Number | Value | Source and note |
|---|---|---|
| STEADY | `Object.freeze({ closureKt: 5, bankOffDeg: 10 })` | When a 2-ship change of formation counts as done (formation.js inBandAndSteady; Patrick 5 Oct 20:39Z card "In band and steady", 20:41Z "I want 'stabilize' to be 'within 5 knots' instead of 'exactly zero'"; TS-78): #2 IN POSITION by the judge's band, moving against his slot at under closureKt, and banked within bankOffDeg of Lead (estimate). The tracker keeps closing on the exact slot underneath. |
| IN_POSITION | `Object.freeze({ closeFt: 5, fwStackFt: 200, labBandFt: Object.freeze([4000, 6000]), labStackFt: 2000 })` | What "in position" means (Patrick 5 Oct 21:26Z and 21:38Z, TS-80): a tactical formation is in position anywhere in its band: fighting wing in the cone up to fwStackFt above or below Lead (Patrick: 200 ft, straight and level); line abreast in the SMM's band, labBandFt lateral and labStackFt vertical (SMM 16.18 para 49: 4,000-6,000 ft, 0-10° sweep, ±2,000 ft). A close formation is in position within |
| STOP_KT | `5` | A station change's stop at a corner: "stabilize" is within this many knots against the slot, then the dwell (Patrick 20:41Z; was 1 ft/s). |

## Moves: each move's numbers (`moves.js`)

| Number | Value | Source and note |
|---|---|---|
| POWER | `Object.freeze({ torqueSec: 0.2, jerkKtps2: 25 })` | How fast the power answers (Patrick 6 Oct 03:17Z: torque 0 to 100% in about 0.2 s; 03:18Z: the speed brakes are instant; TS-108). torqueSec: the torque's full travel. jerkKtps2: the most the acceleration changes per second, so the full torque's span (about 4.5 kt/s from throttle 0 to MAX at 150 KIAS, 3.7 at 200; slow-down.js) is covered in about 0.2 s; the boards' 1-2.5 kt/s then comes in under 0. |
| KIAS_OUTSIDE_LAB | `200` | The pair flies 200 KIAS outside line abreast (SMM 12.23 para 53; Patrick 11:08Z) and 220 in it (SMM 16.18 para 49). |
| KIAS_LAB | `220` |  |
| REJOIN |  | Defaults for rejoins. |
| REJOIN.overtakeKias | `15` | the middle of EFIG p.374's 10 to 20 KIAS for a turning rejoin |
| REJOIN.bankCapDeg | `NO_BANK_CAP_DEG` | #2 in a rejoin: no bank cap, only the aircraft's own limits (Patrick 6 Oct 04:07Z: "there is NO LIMIT on bank angle in formation"; the G rule, about 78° level, from V2.59 until V2.116, TS-67; 60°, an estimate, until then) |
| REJOIN.leadBankDeg | `30` | Lead's turn in a turning rejoin (SMM 12.24 para 54; AFM7 p.21) |
| REJOIN.lineKias | `220` | every rejoin, turning or straight ahead: at least this down the line (or Lead's six) to the decision point, whatever the Rates choice; Rates sets only the close-in rate after it (Patrick 5 Oct 17:54Z: "aim for 220 up the line for both"; 17:55Z: "in all rejoins id like the minimum closure up the line to be 220 knots for expeidiousness, then slow down at the decision point"; TS-75) |
| REJOIN.stopStage | `/** @type {'boards'} */ ('boards')` | from the decision point the overtake comes off with the torque floor and the boards, planned at CLOSURE.stopShare of what they give, idle only when the room left needs more (the last resort); the decision point is where that stop just fits (Patrick 6 Oct 03:17-03:20Z, TS-108; idle from 5 Oct 17:55Z, TS-75, until V2.117; slow-down.js's stages) |
| REJOIN.floorTorquePct | `5` | a rejoin keeps at least 5% torque, the boards as needed; idle is a last resort (Patrick 6 Oct 03:17-03:20Z, TS-108) |
| REJOIN.idealBearingDeg | `45` | Lead at 10:30 or 1:30 (SMM 12.24 para 56) |
| REJOIN.hotBearingDeg | `60` | hot and cold are drawn but not numbered in SMM Fig 12.16: 60 and 30 are estimates |
| REJOIN.coldBearingDeg | `30` |  |
| REJOIN.turnAnglesDeg | `[30, 45, 20, 60]` | how far Lead turns into #2; estimates (a gentle turn, AFM8 brief p.19). Since V2.59 the 2-ship's Lead holds his turn until #2 is in (Patrick 06:16Z item 3, RULED_REJOIN; hand-over.js leadTurnInto): these are only the 2-ship tracker's fallback, and the 4-ship's (step 3, not yet changed) |
| TURNING_REJOIN |  | The turning rejoin (V2.59, TS-68; flown as held bank and power since V2.63, TS-69; Patrick 5 Oct 07:14Z, card "Yes, as written" 07:31Z, 07:32Z, 08:12Z-08:20Z): one rule for every turning rejoin, from line abreast (hot: #2 starts ahead of the line and gets colder to reach it) or fighting wing (cold: he turns hotter to reach it). #2 gets onto the rejoin line, Lead at his 10:30 or 1:30 with about hal |
| TURNING_REJOIN.lineDeg | `45` | the rejoin line, degrees behind Lead's 3/9 line: Lead at 10:30 or 1:30 (SMM 12.24 para 56; Patrick's card 07:31Z). It passes through the fighting wing place (16.20 para 66) and the corner behind echelon (para 58's latest point) |
| TURNING_REJOIN.lineUpFt | `-30` | #2's height on the line, below Lead: "just slightly below lead" (SMM 12.24 para 58); 30 ft is an estimate |
| TURNING_REJOIN.aimsFt | `[300, 600, 1200]` | how sharply #2 captures the line: off it by this much he heads for it at half approachDeg; the one that brings him in soonest is flown (estimates: smaller is a sharper capture, larger a gentler, longer one) |
| TURNING_REJOIN.approachDeg | `80` | far off the line he heads for it at up to this angle across it, in Lead's frame (estimate) |
| TURNING_REJOIN.bankCapDeg | `60` | the bank he uses at most to get onto the line and hold it: past about 60° the drag costs speed and buys nothing (the review's estimate, rejoin-review-fable.md). Only when no rejoin at 60° keeps him behind Lead's 3/9 line does he use more, up to the G rule (REJOIN.bankCapDeg) |
| TURNING_REJOIN.hotFt | `1000` | ahead of the line by this much (hot) he flies his least speed, Lead's 200 KIAS, coming up to lineOverKias above it as he reaches the line (estimate; TS-75) |
| TURNING_REJOIN.laneTolFt | `20` | flowing into the slot he may pass this far ahead of it, never more, toward Lead's 3/9 line (estimate; Patrick 08:04Z) |
| TURNING_REJOIN.decisionArriveRates | `'instructor'` | he reaches the decision point closing no faster than this Rates choice's close-in rate (about 15 kt), so AI's quicker close-in starts from a closure under control (estimate; SMM 12.24 para 58) |
| TURNING_REJOIN.fwArriveFtps | `5` | to fighting wing he arrives at its place on the line at about this closure, and the tracker settles him there (estimate) |
| TURNING_REJOIN.hotBanksDeg | `[30, 60]` | hot (from line abreast) he tries Lead's own 30° and the medium 60° first (the review's estimates, rejoin-review-fable.md follow-up 1) |
| TURNING_REJOIN.lagAimFt | `2400` | and, hot, the gentlest capture too: lagging while Lead's turn brings the aspect round (estimate) |
| TURNING_REJOIN.descentFtps | `30` | a height difference comes off no quicker than this, 1,800 ft/min (estimate) |
| TURNING_REJOIN.captureFt | `150` | he is on the line within this many feet of it; only then does he start taking out the overtake for the decision point (estimate) |
| TURNING_REJOIN.lineTauSec | `4` | his heading comes onto the one the line asks over about this long, so the bank changes smoothly (estimate) |
| TURNING_REJOIN.heightSec | `10` | #2 settles slightly low on the line over this long, or over his part to the decision point if shorter (estimate) |
| TURNING_REJOIN.verticalUpFt | `Object.freeze([500, 1000])` |  |
| TURNING_REJOIN.undertakeKias | `25` | only when no rejoin at his least speed keeps him behind Lead's 3/9 line (close in and hot) does he slow, at most this far below Lead's 200 KIAS (rejoinTo's, an estimate; TS-75) |
| TURNING_REJOIN.lineOverKias | `10` | hot, he reaches the line at no more than this over his least speed, Lead's 200 KIAS (to fighting wing, its place's own speed) (Patrick 17:29Z: "when they hit the line it needs to be at 210-200 knots"; TS-75) |
| TURNING_REJOIN.runInReleaseShare | `0.5` | taking out the overtake, he sets it again once the room left needs less than this share of the slowing that started it (estimate; TS-75) |
| TURNING_REJOIN.runInHoldSec | `2` | within this many seconds of the decision point at the close-in rate, he keeps taking it out (estimate; TS-75) |
| TURNING_REJOIN.floorMarginKias | `5` | within this of his least speed, he banks no more than MAX holds the speed at, so he doesn't bleed below it (estimate; TS-75) |
| TURNING_REJOIN.crossFlowFt | `150` | crossing Lead's six to the other side, he flows through the crossing point within this many feet (estimate) |
| TURNING_REJOIN.routeFlowFt | `20` | he flows through route without stopping, within this many feet of it, on into the slot (estimate; Patrick 07:14Z: "in one motion") |
| TURNING_REJOIN.windowFarFt | `250` | he moves out to the line and up it to echelon anywhere from this far from Lead... (Patrick 6 Oct 03:32Z card, 03:34Z) |
| TURNING_REJOIN.windowNearFt | `100` | ...down to this far, the decision point (Patrick 02:30Z); not stable by here, he overshoots, only when nothing else works (03:35Z) |
| TURNING_REJOIN.stableKt | `Object.freeze([10, 20])` | his closure, range rate in knots, is stable in this window (Patrick 03:34Z: "10-20 knots at 100 feet"); the slowing aims at its middle, and slower is cold, not unstable |
| TURNING_REJOIN.stableShare | `1.5` | ...and closing at no more than this times the closure that middle overtake gives on the X, about 32 kt, so he is holding the X, not sweeping through it (card 03:15Z "Closure or bearing"; the figure is an estimate) |
| TURNING_REJOIN.xWindowDeg | `10` | Lead is on the X picture within this many degrees of it, 35-55° off his tail (card 03:15Z "Closure or bearing"; the figure is an estimate) |
| TURNING_REJOIN.bearingTauSec | `6` | his bearing off Lead's tail comes onto the X over about this long (estimate, the design) |
| TURNING_REJOIN.hardPullsSec | `Object.freeze([2, 4, 6])` | hot, he may first pull this long at his most bank with idle and the boards, then hold the X (Patrick 6 Oct 04:02Z: "pull like 5 g and 90 deg bank to the line with the power less than max"; the times are estimates) |
| TURNING_REJOIN.xFromFt | `750` | a hot start further out flies onto the rejoin line as before, and holds Lead on the X only from this far down it (Patrick 6 Oct 03:58Z: "you can make x inside 750 feet if it helps thats the whole idea") |
| TURNING_REJOIN.slowFtps2 | `3.5` | the slowing curve down to the window's closure: about power back at 200 KIAS, 8,000 ft (slow-down.js; an estimate) |
| TURNING_REJOIN.insideFloorFt | `500` | inside this range his least speed is his place's own speed inside Lead's turn, about 196-198 KIAS (estimate) |
| TURNING_REJOIN.onXDeg | `5` | he is on the X within this many degrees of it (for the card's speed on the line; estimate) |
| TURNING_REJOIN.overshootBankDeg | `15` | the overshoot: wings near level, no more than this bank... (SMM 12.27 para 65; card 03:33Z rule 5; estimate) |
| TURNING_REJOIN.overshootLevelSec | `3` | ...for this long, then he stabilizes on the outside of Lead's turn (estimate) |
| STRAIGHT_REJOIN |  | The straight-ahead rejoin, flown the way a pilot flies it (straight-rejoin.js, TS-72; Patrick 5 Oct 08:40Z: "SARJ should start at full power until it gets back on leads six, then set an overtake. The geometry of moving makes it fall back"; the review's SARJ, fable-compiled.md section 3). All estimates unless a source is given. |
| STRAIGHT_REJOIN.lineArriveKt | `8` | he joins the line and flows up it closing at about this, slow enough to stop on the slot with power back, never stopping short of it (estimate) |
| STRAIGHT_REJOIN.lineFlowFt | `40` | he flows on up the line once within this many feet of route (on the line, TS-103), never stopping there (estimate) |
| STRAIGHT_REJOIN.cutsDeg | `[30, 45, 60]` | far off Lead's six line he heads across it at up to this angle to Lead's track; the one that brings him in soonest is flown (estimates: a bigger cut gets across sooner and falls back further) |
| STRAIGHT_REJOIN.aimsFt | `[600, 1200, 2400]` | how sharply he comes onto the six line: off it by this much he cuts at half the angle (estimates, as TURNING_REJOIN.aimsFt; gentler than the turning rejoin's so he doesn't swing through the six) |
| STRAIGHT_REJOIN.lineTauSec | `2` | his heading comes onto the one the cut asks over about this long (estimate; the turning rejoin's 4 s swings him through the six) |
| STRAIGHT_REJOIN.captureFt | `100` | he is on Lead's six within this many feet of it; until then full power, from then the overtake (estimate) |
| STRAIGHT_REJOIN.decisionBehindFt | `100` | the decision point, this far behind route on the line up to it: the tracker flows him through route from there. Coming straight up from behind, all of his closure is fore and aft, so he needs more room to stop than the turning rejoin's 45° line (about 22 ft behind route) gives (estimate) |
| KINEMATIC |  | The numbers of the kinematic moves. All estimates unless a source is given. |
| KINEMATIC.lateralFtps | `RATE_SETS.close.frame.lateralFtps` | 140 ft/s across Lead's heading: about a 25° heading difference at 200 KIAS (estimate; SMM 16.18 para 51 gives no angle) |
| KINEMATIC.foreAftFtps | `RATE_SETS.close.frame.foreAftFtps` | 25 ft/s along it: about 15 KIAS of overtake or undertake, the middle of EFIG p.374's 10-20 KIAS |
| KINEMATIC.verticalFtps | `RATE_SETS.close.frame.verticalFtps` | 15 ft/s up or down: 900 ft/min (the 4-ship's stack-change estimate) |
| KINEMATIC.nearPerSec | `RATE_SETS.close.frame.nearPerSec` | closing slows with range: 10% of the range per second ... |
| KINEMATIC.nearMinFtps | `RATE_SETS.close.frame.nearMinFtps` | 8 ft/s ... but never below about 5 kt, the station-change rate (SMM 12.20 para 44 says "controlled") |
| KINEMATIC.closeBlendSec | `3` | a close formation wingman follows a roll of Lead this long after it (SMM 12.19 para 43: he lags Lead's roll) |
| KINEMATIC.planeLagSec | `3` | a close wingman's place in Lead's wing plane follows Lead's bank over this long (SMM 12.19 para 43: he lags the roll; estimate) |
| KINEMATIC.wideBlendSec | `8` | a fighting wing wingman takes this long |
| KINEMATIC.followLateralG | `0.2` | ... and swings its track at no more than this much sideways G (estimate) |
| KINEMATIC.followAccelKtps | `2.5` | ... or longer, so a wingman following a roll of Lead speeds up or slows at no more than this (estimate; inside the 3 kt/s the smoothness tests allow) |
| KINEMATIC.startBlendSec | `3` | a station change starts moving over this long |
| RULED_REJOIN | `Object.freeze({ bankCapDeg: null, reverseBanksDeg: null, leadTurnsUntilIn: true, descentFtps: null, overshootRangeFt: 200 })` | Patrick's 06:16Z rulings on the rejoin's estimates (5 Oct 06:16Z), flown since V2.59 (TS-67) in the numbers above (REJOIN.bankCapDeg) and hand-over.js leadTurnInto; the hot rejoin's numbers for items 2, 4 and 5 went with it (TS-94): 1. "Unlimitd bank. they can roll and dive if they want/need to and it ameks sense": no bank cap on #2 in a rejoin (REJOIN.bankCapDeg); bank follows the G the move need |
| FW_TURN |  | The numbers of the fighting wing turns. Estimates unless a source is given. |
| FW_TURN.gentleBankDeg | `30` | AFM7 brief p.14 item 5a's gentle check turn: no longer flown since step 3 (every turn at WING_BANKS.fwTurnBankDeg, Patrick 06:16Z) |
| FW_TURN.turnBankDeg | `45` | item 5b's moderate turn: no longer flown since step 3 (WING_BANKS.fwTurnBankDeg) |
| FW_TURN.collapseFromDeg | `32` | #2 starts collapsing once Lead's bank passes this ... |
| FW_TURN.collapseFullDeg | `42` | ... and goes all the way to Lead's six by this |
| FW_TURN.collapseMinTurnDeg | `45` |  |
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
| FW_EXIT |  | The fighting wing turn exit (formation-turns.js fwExitSide; SMM 12.30, Fig 12.23): when Lead rolls out, #2 picks the side of the cone he flows to from the range he will have a few seconds on. Past the cone (stretched or opening): the inside of the turn, the shortest path. Inside it (tight or closing hard): the outside, the longer path. In between: the side his nose is already carrying him to, so h |
| FW_EXIT.lookAheadSec | `5` | the range is judged this far ahead at the present opening or closing (estimate) |
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
| FW_ENERGY.coneUpFt | `IN_POSITION.fwStackFt - 50` | he uses the cone's height up to this far above or below Lead, 50 ft inside the in-position band (estimate) |
| FW_ENERGY.climbFtps | `TURNING_REJOIN.descentFtps` | no quicker than the rejoin's height changes, 1,800 ft/min (estimate) |
| FW_ENERGY.pullFtps2 | `8` | the climb rate changes no quicker than this, about a quarter G, charged as G (estimate) |
| TRACKER |  | The tracker's own numbers (tracker.js): a small control loop that chases a moving target slot in the frame of the aircraft flown off, flown once at the press and replayed. It stays as the fallback for starts no kinematic-line rule covers (Patrick 5 Oct 05:27Z: "Tracker for fallback, and refractor the tracker"). All estimates: they shape how smoothly the wingman flies, not where the formations are. |
| TRACKER.gain | `Object.freeze({` |  |
| TRACKER.…position | `0.3` | 1/s: position error to relative velocity |
| TRACKER.…heading | `1.5` | 1/s: heading error to turn rate |
| TRACKER.…refRate | `0.5` | 1/s: how fast the moving reference closes on its target |
| TRACKER.…speedLoop | `0.8` | 1/s: speed error to acceleration |
| TRACKER.…jerkKtps2 | `POWER_JERK_KTPS2` | kt/s²: the acceleration follows the torque, 0 to 100% in about 0.2 s (Patrick 6 Oct 03:17Z, TS-108; 1.0 until V2.117) |
| TRACKER.…ffFilter | `0.2` | how much of the commanded heading's own turn rate is fed forward each step (a smoothing share; estimate) |
| TRACKER.refAccelShare | `0.25` | the target slot builds up to its slide rate over 4 s (a quarter of the rate per second; estimate) |
| TRACKER.snapFt | `0.05` | the target slot snaps onto its place within this many feet (estimate) |
| TRACKER.goalTolFt | `2` | a moving goal counts as reached within this many feet, unless the leg says otherwise (estimate) |
| TRACKER.settleMinFtps | `1.2` | settled: no faster against the last slot than this, ft/s ... |
| TRACKER.settleShare | `0.3` | ... or this share of the leg's final tolerance per second, whichever is more (estimates) |
| TRACKER.alignBankDeg | `30` | once settled, #2 turns to Lead's heading with no more than this bank (estimate) |
| TRACKER.minSpeedFtps | `1` | a commanded velocity under this gives no heading: #2 takes Lead's (estimate) |
| TRACKER.kiasSnap | `0.003` | the last few thousandths of a knot are taken out at once, so the speed has no step |
| TRACKER.alignHeadingRad | `1.5e-4` | aligned: within this of Lead's heading (about 0.01°) |
| TRACKER.alignDeadbandDeg | `0.05` | a closure phase lining up commands no bank under this (step 2): at 1.5/s of heading gain it is a heading error of about 0.003°, inside alignHeadingRad |
| TRACKER.laneRangeFt | `1000` | the overshoot lane is measured inside this range (SMM 12.27 para 65; design section 10) |
| TRACKER.belowRangeFt | `2000` | the height under Lead is measured inside this range (SMM 12.27 para 65) |
| TRACKER.phase | `Object.freeze({` |  |
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
| TRACKER.height | `Object.freeze({` |  |
| TRACKER.…minChangeFt | `0.5` | a smaller change is left out |
| TRACKER.…minSec | `4` | no height change takes less than 4 s (estimate) |
| TRACKER.…unknownLegSec | `6` | a leg whose end was never learned is given 6 s (estimate) |
| WING |  | #2's numbers. Sources beside each; "estimate" where none. |
| WING.pursuitShare | `0.1` | the lag or lead offset as a share of the range (estimate) |
| WING.latDeg | `15` | off Lead's tail, inside the 30° half cone (estimate; cone: Patrick 19:20Z row 2) |
| WING.collapseSec | `6` | how long the collapse toward the six takes (estimate) |
| WING.rangeSec | `6` | how long a new distance setting takes to fly (estimate) |
| WING.blendInSec | `10` | entry (estimate) |
| WING.blendOutSec | `12` | terminate (estimate) |
| WING.blendMinSec | `3` | no blend quicker than 3 s, however quick the rate (estimate) |
| WING.smoothSteps | `10` | the position line is smoothed over 10 steps (0.5 s) either side (estimate) |
| WING.maxBehindSec | `10` | the furthest back along Lead's path #2 can be |
| WING.turnSec | `8` | the lag or lead offset is what the cue wanted over the last 8 s, averaged (estimate) |
| WING.tailSec | `6` | the turn onto the place off Lead's current tail is averaged over the last 6 s (estimate; 3 s in V2.18) |
| WING.headingSec | `3` | the fighting wing slot, while blending, turns with Lead's heading averaged over the last 3 s (estimate) |
| WING.swapMinSec | `5` | the side swap takes no less than 5 s ... (estimate) |
| WING.swapMaxSec | `12` | ... and no more than 12 s (estimate) |
| WING.swapAccelDps2 | `2` | how quickly a wingman can stop a drift across the cone, 2°/s² (estimate) |
| WING.swapMarginDeg | `2` | the stop must be at least 2° past the tail line before he swaps, so he doesn't flick on a line (estimate) |
| WING.swapGuardSec | `4` | no new swap for 4 s after one ends (estimate) |
| WING.openGAim | `4.5` | the G he aims to stay under while the range opens: 0.5 G inside the 5 G aim for the turn's own share (estimate) |
| WING.openFadeSec | `2` | the opening is allowed only in those manoeuvres, faded in and out over 2 s (estimate) |
| WING.closeShare | `0.08` | closing back he flies at most 8% faster along Lead's path than Lead did there (about 15-20 KIAS; estimate) ... |
| WING.closeSec | `4` | ... and the last of it dies away over about 4 s (estimate) |
| WING.openSoft | `0.005` | how softly the opening hands over to the closing (the smooth maximum's width; estimate) |
| HOLD |  | The numbers of the hold. Estimates unless said. stretchMinFt, stretchShare: #2 is STRETCHED while he is more than this far behind where the planned line wanted him (10 ft, or 5% of his range from the aircraft he flies off if more), so a close wingman shows it at a few feet and a fighting wing one at a few tens. overtakeKias: closing back up he keeps at most this overtake, the middle of EFIG p.374' |
| HOLD.stretchMinFt | `10` |  |
| HOLD.stretchShare | `0.05` |  |
| HOLD.overtakeKias | `15` |  |
| HOLD.closeDecelFtps2 | `1` |  |
| HOLD.gain | `0.6` |  |
| HOLD.jerkFtps3 | `POWER_JERK_KTPS2 * KT_TO_FTPS` |  |
| HOLD.margin | `Object.freeze({ share: 0.05, ktps: 0.05 })` |  |
| HOLD.extraSec | `120` |  |
| HOLD.cutShare | `0.25` | the most offset inside Lead's turn, as a share of the range: about sin 15°, the lag line's angle, so he goes toward pure pursuit and stays inside the 30° cone (estimate) |
| HOLD.cutSec | `4` | how long moving into or out of the offset takes (estimate) |
| HOLD.cutMinCurvPerFt | `1 / 20000` | a line straighter than a 20,000 ft radius has no inside to cut (estimate) |
| HOLD.lookSec | `2` | he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate) |
| HOLD.bubbleMarginFt | `50` | with Lead at MAX, #2 takes power off only within about 50 ft of the 500 ft bubble (estimate) |
| HOLD.offsetAccFtps2 | `10` | and moves with at most about 0.3 G of its own, so the lag or lead adds little to the G he pulls (estimate) |
| HOLD.aimSec | `1` | and the offset's aim is eased over about 1 s, so a new turn or a reversal never jerks his G (estimate) |
| HOLD.powerSec | `POWER.torqueSec` | the torque's full travel, 0 to 100%, takes about 0.2 s; the boards are instant (Patrick 6 Oct 03:17Z, 03:18Z, TS-108; 2 s, an estimate, until V2.117) |
| HOLD.floorKias | `70` | his speed is never shown below 70 KIAS, a guard only: the planned line keeps him well above it (estimate) |
| FOUR_OPEN |  | The 4-ship's opening out (four-open.js: fighting wing or finger to Spread 4, the Fluid 4 split, the offset box spread): each wingman turns away and back at this bank at most. Patrick 6 Oct 01:44Z: "nah keep it sporty at 60 deg" (it was the G rule alone, about 78° and 5 G at the press: 5 Oct 06:16Z item 12, TS-66 (4)). |
| FOUR_OPEN.bankDeg | `60` | the opening-out bank, held (Patrick 6 Oct 01:44Z) |
| FOUR_OPEN.offHeadingsDeg | `Object.freeze([20, 25, 30, 35, 40, 45])` | how far off Lead's heading each holds on the way out to Spread 4; the one that settles soonest is flown (estimates; open-out.js's search) |
| OPEN_OUT.reserveKtps | `0.4` | #2 opens out up to the speed where full power still has this much in hand (estimate) |
| OPEN_OUT.gainKtPerSqrtFt | `0.45` | KIAS gained per square root of the range from Lead on the way out: full power plus the dive, about 1 KIAS per second from 200 (estimate fitted to the core T-6 curve, kept under it so the line stays inside full power) |
| OPEN_OUT.leadHolds | `true` | Lead holds his speed until #2 is out, then speeds up to line abreast speed (estimate needing Patrick's yes; false: he speeds up at once) |
| OPEN_OUT.nearPerSec | `RATE_SETS.tactical.frame.nearPerSec` | 10 |
| OPEN_OUT.nearMinFtps | `RATE_SETS.tactical.frame.nearMinFtps` | 20 ft/s |
| OPEN_OUT.foreAftFtps | `RATE_SETS.tactical.frame.foreAftFtps` | 80 ft/s: falling back in Lead's frame on the way out is geometry (the angle off), not a closure: up to about 47 kt (estimate) |
| OPEN_OUT.law | `RATE_SETS.tactical.law` |  |
| OPEN_OUT.handOverFt | `150` | the tracker takes over this close to the slot (estimate) |
| OPEN_OUT.diveFt | `400` |  |
| OPEN_OUT.verticalFtps | `RATE_SETS.tactical.frame.verticalFtps` | 40 ft/s down or up on the way out: about 2,400 ft/min (estimate) |
| LAG_ROLL |  | #2's lag roll from fighting wing to the cone on Lead's other side (Patrick 5 Oct 08:54Z: "the airplane flips up and rolls canopy to canopy to lead then lands in the cone on the other side, power pitch and bank as required"). The SMM and EFIG do not name the lag roll; the nearest pages are SMM 12.29 para 69 (the cone, using the vertical), SMM 12.30-12.31 para 74 (lag pursuit) and SMM 14.8 paras 18- |
| LAG_ROLL.pullG | `Object.freeze([3, 2.5])` | the searched pull: the barrel roll's 3 G entry (SMM Table 14.1; Fig 14.1) and a softer 2.5 (estimate) |
| LAG_ROLL.noseUpDeg | `Object.freeze([45, 30])` | the searched nose-up: 30-45° (estimate; 45 is the barrel roll's, SMM 14.8 para 19) |
| LAG_ROLL.noseUpSlopDeg | `6` | how near the planned path's steepest climb must come to the searched nose-up (estimate) |
| LAG_ROLL.topKias | `165` | the speed aimed for over the top, about 160-170 KIAS (estimate) |
| LAG_ROLL.topKiasBand | `Object.freeze([150, 185])` | a plan whose slowest speed is outside this is not used (estimate) |
| LAG_ROLL.topRangeFt | `Object.freeze([900, 1400])` | range from Lead passing over his six, about 1,000-1,300 ft (estimate, widened 100 ft each way) |
| LAG_ROLL.closeTopRangeFt | `Object.freeze([500, 1400])` | from echelon (TS-78): over Lead's six at 500-1,400 ft, the bubble's edge to the same far end (estimate) |
| LAG_ROLL.bubbleFt | `500` | a plan that comes inside 500 ft of Lead is refused (SMM 16.23, the fluid bubble; FW_BAND's inner edge, SMM 12.29 para 69) |
| LAG_ROLL.minG | `0.3` | canopy to canopy means positive G throughout: no plan pushes (estimate) |
| LAG_ROLL.rollSec | `Object.freeze([8, 30])` | the roll's length searched, in whole seconds (estimate) |
| LAG_ROLL.climbFt | `Object.freeze([200, 2000])` | how far above the straight line from start to end he goes, searched in 100 ft steps (estimate) |
| LAG_ROLL.fallBackFt | `Object.freeze([0, 1000])` | how far behind the slot the roll ends, searched in 100 ft steps (estimate) |
| LAG_ROLL.searchStepSec | `0.25` | the search's coarse time step (the flown path is planned at the sim's own step) |
| LAG_ROLL.coneRangeFt | `Object.freeze([400, 1250])` | where the roll may end: the sim's fighting wing region (judge.js classifier, 400-1,300 ft), kept 50 ft inside its far edge (estimate) |
| LAG_ROLL.coneSweepDeg | `Object.freeze([20, 70])` | the same region's sweep (judge.js classifier; estimate) |
| LAG_ROLL.closeOvertakeKias | `20` | closing back up to the slot after the roll: the top of EFIG p.374's 10-20 KIAS overtake (estimate choice) |
| LAG_ROLL.rollingAboveDps | `10` | above this roll rate the rolling G limit (core availableG, rolling) is the one checked (estimate) |
| LAG_ROLL.rollMissG | `0.3` | #2's wings roll no faster than the T-6A (TS-85): a path asking more is used only while the lift they don't yet point stays under this (estimate) |
