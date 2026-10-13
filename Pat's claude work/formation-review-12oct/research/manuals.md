# Manuals check: aircraft, handling, rates, Lead (numbers.md), Step 12 phase A

Read-only. Paraphrased; citations only. "Ref data" = Patrick's performance upload (not in the manual text set; earlier audits in Pat's claude work/manuals/ checked it). "Silent" = none of Gen Book, EFIG, SMM, NFM text gives it. NFM charts are images, not in the text. NFM page numbers from the Scribd layer are +/-1 page.

| Our number | Our value | What the manual says | Citation | Verdict | Conf. |
|---|---|---|---|---|---|
| T6A_LIMITS.maxG / minG | +7 / -3.5 | Clean symmetric limit +7.0 to -3.5 (gear/flaps out +2.5 to 0) | NFM Fig 5-4 and Acceleration Limitations, ch.5 (~p.5-10 to 5-12) | matches | high |
| rollingMaxG / rollingMinG | +4.7 / -1 | Clean rolling limit +4.7 to -1.0 (gear/flaps out +2.0 to 0); rolls started at -1 G: at most 180 deg of bank change. EFIG and SMM repeat 4.7 and warn it is easy to exceed above 190 KIAS | NFM ch.5 same; EFIG p.181, p.419; SMM 14.17 caution; SMM 7.1 para 8 | matches | high |
| stallKias | 86 | Stall chart is an image; shaker at 15.5 units, 5-10 kt above stall. 86 is Patrick's ruling | NFM Fig 6-3 (image); ref data | manual silent (Patrick's) | med |
| voKias | 227 | VO 227 KIAS: above it full or abrupt control inputs can damage structure | NFM p.5-9 | matches | high |
| vmoKias / mmo | 316 / 0.67 | VMO 316 up to 18,769 ft; above that M 0.67 | NFM p.5-9, Fig 5-3 | matches | high |
| weightLb | 5168 | Max take-off and landing weight 6,500 lb. 5,168 is the weight on Patrick's envelope chart | NFM ch.5 weight limits; ref data | differs (different quantity; note on sheet) | med |
| T6A_ROLL rollPerKtasDps 0.45, maxRateDps 120, fullRateSec 0.3, onsetSec 0.2 | estimates | No full-stick roll rate, no onset time, anywhere. Only: yaw tendency at high roll rates; limit to half lateral stick for uncoordinated rolling pull-outs above 2 G; wake rolling moment can exceed aileron authority | NFM ch.6 Asymmetric Maneuvers (~p.6-5); NFM ch.2/3 wake note | manual silent | high (that it is silent) |
| T6A_G_ONSET 4 G/s, 16 G/s2 | estimate | No G/s anywhere. Words only: smooth, positive, deliberate; "set the rate" then straight pull; check G meter | SMM 12.36 para 86c(5), 14.14 para 36, 16.22 para 70-71; EFIG p.171, p.142 | manual silent | high |
| T6A_PITCH (aoa180 2.8, datum 2.6, flap AoAs, onGear) | Patrick's attitudes | Not re-checked here (SMM 3.14 para 35 / EFIG p.126 were cited by an earlier audit) | - | not checked | - |
| T6A_GLIDE clean 125 KIAS, 2.0 NM/1000 ft | | Same: about 2.0 NM per 1,000 ft at 125 KIAS; 120 KIAS gear-down pattern speed. Other rows are ref data / estimates | SMM 13.5 para 7, 13.4, 13.6 | matches (clean); others ref data | high |
| ZOOM_GAIN_TABLE | table | SMM does not give the table; 20 deg climb to 145 KIAS is ref data | ref data | manual silent (ref data) | med |
| T6A_MANOEUVRE.shakerMarginKt | 7 kt | Shaker 5-10 kt above stall | ref data; NFM (15.5 units) | matches | med |
| splitSMaxG | 5 | SMM table 14.1: about 4 G; EFIG: AIF 2410 maximum 5 G | SMM 14.5 Table 14.1; EFIG p.438 | matches (Patrick's 5) | med |
| splitSNoseUpDeg / splitSRollG | 20 deg / 0.5 G | Nose about 20 deg up, roll inverted at about 0.5 G | SMM 14.16 para 40-41; EFIG p.159 | matches | high |
| T6A_MANOEUVRE.rollRateDegPerSec | 90 | No roll rate | - | manual silent | high |
| G_ONSET_CEILING | 8 G/s | No G/s (see G onset) | - | manual silent | high |
| GATE_G_MAX_BANK_DEG, CLIMB_CATCH_SEC, LEVEL_OFF_SEC, LEVEL_OFF_PULL_G, PUSH_MARGIN_DEG, POWER_MAX_FROM, PILOT_SLOW_CAP_KTPS | 85 deg, 0.3 s, 1 s, 1 G, 45 deg, 0.985, 7.95 kt/s | Model plumbing; no manual number. Speed brake and torque are the rejoin's closure tools (not rates) | SMM 12.26 para 63 | manual silent | high |
| MIN_POSITIVE_G | 0.5 | Push-overs and point rolls at about 0.5 G are the manual's own number (Cuban 8, roll off the top, split S, G-warm 5 s push). Zero-G limit: 5 s | SMM 7.6 para 15, 7.9 para 22, 14.16 para 41, 16.22 para 71; EFIG p.142, p.192; NFM ch.5 (~5-10) | matches | high |
| CLOSE_BANK_DEG (wingman cap) | 60 | Manual's rejoin turn is 30 deg bank by Lead; break is 60 deg / 2 G. No wingman cap given (Patrick: no cap) | SMM 12.24 para 54; 12.25 para 61; Gen Book p.11 | manual silent (Patrick's) | med |
| G_RULE normalG / lastResortG | 5 / 7 | FM: 5 G limit at all times. Gen Book training rules: Lead +4 G, Wingmen +5 G | SMM 16.17 para 44a; Gen Book p.11 | matches for wingmen; differs for Lead (+4) | high |
| NO_BANK_CAP_DEG, G_RULE_BANK_DEG | 82 / 78 deg | No bank cap in formation anywhere | - | manual silent (Patrick's) | high |
| MOVE_TARGET_G | 4.5 | Under wingman +5 G | Gen Book p.11 | matches (inside limit) | high |
| RATE_SETS.close.leadRoll / echelonRoll | 30 deg/s, 20 / 12 deg/s2 | No numbers. Wingman must match Lead's roll rate; the usual error is lagging it. Echelon turns have a "slow roll rate" | SMM 12.19 para 43; 16.36 para 101 | manual silent (direction agrees) | high |
| RATE_SETS.close.routeRoll / frame / law | 8 deg/s etc. | No numbers | - | manual silent | high |
| RATE_SETS.tactical.roll | 180 deg/s, 720 deg/s2 | No roll rate in any manual. Nothing contradicts or supports it | - | manual silent | high |
| TELEGRAPH rolledSec 6.5, easeSec 1.5 (6/9/12 deg/s) | | Lead is smooth and progressive; telegraph manoeuvres; the wider the formation, the smoother, slower, more predictable. Lead changes in PCL, speed and pitch gradual. No roll numbers | EFIG p.363, p.367, p.369; SMM 12.36 para 86c, 16.9 para 25 | manual silent on numbers; direction matches | high |
| CLOSE_SHAPING (bank 8, fore/aft and lateral rates, tolerances, wake clearances) | estimates | No numbers; stated principle is small, timely corrections | SMM 12.18 para 40 | manual silent | med |
| CLOSE_BANK_CHOICES 30 / 45 / 60 | | 30 deg appears (rejoin turn), 60 deg appears (break). 45 only as a base-leg turn | SMM 12.24 para 54; 12.25 para 61; EFIG p.367 | matches (30, 60) | med |
| CLOSE_IN_SEC 10 / 5 / 2.5 | | No times | - | manual silent (Patrick's) | high |
| REJOIN_CLOSURE_KT | 15 / 25 / 50 | Turning rejoin overtake 10-20 KIAS (early training little or none); straight-ahead 20-30 | SMM 12.24 para 56ff; EFIG p.374, p.371 | 15 inside; 25 inside straight-ahead only; 50 differs | high |
| REJOIN_LINE_KIAS | 210 / 220 / 235 | Rejoins flown with Lead at 200 KIAS (so 10 / 20 / 35 over) | SMM 12.23 para 53 | 210, 220 match; 235 is 35 over (above 20-30) | med |
| EXPERIENCE rollShare 1, gOnsetGps 2 / 3 / 4, coneShare, leverShare | | No numbers | - | manual silent | high |
| ENGINE_RESPONSE_SEC | 0.25 s (2 to 100% TQ) | Slight lag between PCL and response in formation; from idle spool-up is "quite slow" (stay above idle). Patrick's 0.25 s is for the working range | SMM 12.18 para 40; SMM 4.7 warning (para 10 area) | partly differs (idle spool-up slow); silent on number | med |
| Torque limit 100% | (core / TQ share) | Max 100% torque; transient 131% for 20 s | NFM Fig 5-2 (~p.5-8) | matches | high |
| RATE_SET_SEC 2, CLOSURE shares and gains | | No numbers | - | manual silent | high |
| HAND_OVER_FT | 500 | Turn toward echelon about 500 ft behind Lead | SMM 12.26 para 63 | matches | med |
| WING_BANKS.fwTurnBankDeg | 60 deg (2 G) | 60/2 only in break and rejoin; FW turns not numbered | SMM 12.25 para 61; 12.29 | manual silent for FW | med |
| TURN_G / TURN_BANK_DEG | 3 G / about 70.5 deg | LAB turns normally 3 G level, PCL MAX; figures label 70/3 | SMM 16.18 para 50; 16.19 para 52; Figs 16.15-16.21 | matches | high |
| VERTICAL_MISS_FT | 300 | 300 ft minimum crossing separation | SMM 16.13 para 31; Gen Book p.11 | matches | high |
| CHECK_DEG | 20 | Check turn up to 30 deg; in-place over 30 to 90 | SMM Fig 16.18; 16.19 | matches (inside 30) | med |
| CROSS_FIRST_BANK_DEG | 20-75 | 60/2 "or as required" | SMM Fig 16.21 | matches | med |
| BREAK delaySec 5, bankDeg 60 | | Break and rejoin 60 deg / 2 G, delay as briefed; overhead break 3 s; FM academic break 2 s | SMM 12.25 para 61; 12.33 para 78-79; 16.17 para 43 | bank matches; 5 s differs (Patrick's) | high |
| LEAD.gOnset | T6A_G_ONSET | See G onset | - | manual silent | high |
| LEAD.levelBanks 30 / 60 / 70.5 | | 30 (rejoin), 60/2 (break), 70/3 (LAB) | SMM 12.24 para 54; 12.25 para 61; 16.18 para 50 | matches | high |
| entryHoldSec 5, terminateBankDeg 30, terminateTurnDeg 90, earlyCueSec 4 | | Terminate for position: Lead enters a "predictable turn", no angle | SMM 16.17 para 46 | manual silent | high |
| fwKias | 200 | 200 KIAS for rejoins (Lead stabilised) and marshall in LAB/FW; LAB itself 220; Patrick's block speeds 220 low / 200 mid | SMM 12.23 para 53; ch.17 para 9; 16.18 para 49 | matches | med |
| climbDeg 15, climbChangeFt 2000, levelOffFt 800, pitchCueDps 0.5, climbPitchDps 3 | | No numbers | - | manual silent | high |
| loopEntryKias | 230 | 230 KIAS, PCL MAX | SMM 7.5 para 11; Table 7.1 | matches | high |
| loopEntryBandKias | 15 | Loop entry between 200 (minimum) and 250 (maximum) | SMM 14.9 para 20; EFIG p.174 | matches | high |
| loopG | 3.5 | Hold about 3-4 G to near vertical; "3 1/2 G", cross-check G meter | SMM 7.5 para 11; EFIG p.171 | matches | high |
| loopDownMaxG | 4 | After horizon, back pressure up, then adjust to reach 230 KIAS; no G number. Lead limit +4 G | SMM 7.5 para 12; Gen Book p.11 | matches | med |
| loopTopMinG | 0.5 | Cross the top with "slight positive G"; top about 100-120 KIAS (wings level, rudder) | SMM 7.5 para 11; EFIG p.171 | matches (0.5 an estimate) | high |
| loopVerticalDeg | 80 | Constant pull "until the aircraft approaches the vertical"; vertical about 140 KIAS on the way down | SMM 7.5 para 11; EFIG p.171 | matches | med |
| loopPullOutDeg 330, setupMaxPitchDeg 10, loopWaitSec 5, setupLimitSec 60 | | No numbers. Down side: vertical about 140 KIAS, 45 deg nose down 180-190, 30 deg about 30 kt short of 230 | EFIG p.171 | manual silent (EFIG gives speed checkpoints for the model to meet) | high |
| wingoverKias / G / pitch | 230 / 3 / 45 deg | About 230 KIAS, about 3 G, about 45 deg pitch above and below; up to 120 deg bank; pull rate like the cloverleaf | SMM 16.17 para 47 | matches (120 deg bank not modelled) | high |
| cloverleaf pull 2.5-3.5 G | | 2.5-3.5 G; EFIG recommends about 3 G | SMM 7.7 para 17, Table 7.1; EFIG p.137 | matches | high |
| noseAccelDps2 8, noseEndDps2 3, noseSteerPerSec 1.2, climbDamp, speedHold | | Only "constant rate" nose, no number | SMM 7.5 para 11-13; 14.8 para 19 | manual silent | high |
| shakerShare | 0.9 | Aerobatics are flown to a stated G, not a share of the shaker (shaker only in max performance work) | SMM 14.14ff | manual silent | med |
| barrelKias / barrelG | 230 / 3 | 230 KIAS; 3 G entry, MAX | SMM 14.8 para 19; Table 14.1; EFIG p.419 | matches | high |
| barrelTopG | 2.25 | Ease back pressure and add aileron through the top (more roll, less pull); no G number | SMM 14.8 para 19; EFIG p.419 | manual silent on number (direction matches) | high |
| barrelPitchDeg / barrelOffDeg | 45 / 45 | 45 deg off the line with 45 deg pitch and 90 deg bank, then 90 deg off inverted level | SMM 14.8 para 19 | matches | high |
| cueOffTailDeg, overTopCue, loopCueDeg | | Lead/lag/pure pursuit concepts only | SMM 12.30; 16.14ff | manual silent | high |
| FW_MOVE.climbTorquePct | 80 | Climb with as high a torque as possible, about 85-90% so wingman keeps echelon; Lead after take-off about 80%; wing take-off max 90%, not below 80% | SMM 12.16 para 35; 12.13 para 32; 12.35 para 85; 16.2 para 5 | differs slightly (climb 85-90; 80 matches the accel phase); Patrick's hard rule | med |
| FW_MOVE.descentShare 0.8 of idle descent | | Lead descends with at least 20% torque; avoid full and idle power in close formation | SMM 12.31 para 75; 12.36 para 86c(3); EFIG p.395 | differs (manual says never idle) | high |
| FW_MOVE.climbFt 2000, climbDeg 15, heldTurnDeg 720 | | No numbers | - | manual silent | high |

Rows: about 60 table lines covering about 150 constants in the four sections; T6A_PITCH not re-checked.

## Priority answers

1. **Roll.** Full-stick roll rate: not in any manual (Gen Book, EFIG, SMM, NFM). Roll onset: silent. Wingman is told to match Lead's roll rate (SMM 12.19 para 43). Rolling limits: +4.7 / -1.0 G clean (NFM ch.5), 2.0 G with gear and flaps; rolls from -1 G at most 180 deg bank change; above 2 G uncoordinated rolling pull-outs: half lateral stick (NFM ch.6); high roll rates give yaw. Aileron roll, barrel roll, hesitation roll: "set a constant rate", no deg/s (SMM 7.4, 14.8). Echelon turns have a "slow roll rate" (SMM 16.36 para 101). LAB and break: 70/3, 60/2, no roll rates.
2. **G.** Onset: silent (words only: smooth, deliberate, positive). Limits: +7/-3.5, rolling +4.7/-1 (NFM); Gen Book p.11 Lead +4, wingmen +5; FM 5 G. Loop 3-4 G (EFIG 3.5); roll off the top and Immelmann 4; cloverleaf 2.5-3.5; wingover about 3; barrel 3, then ease back; Cuban 8 / split S rolls about 0.5 G. G-warm: 3 G to 90 deg, 5 s at 0.5 G, 4 G over 180, 3 G back (SMM 7.2 para 2, 16.22).
3. **Loop.** 230 KIAS, MAX, 3-4 G to near vertical, constant nose rate; top 100-120 KIAS slight positive G; down side: vertical about 140, 45 deg 180-190, 30 deg about 30 kt short; exit 230 on heading. Minimum loop entry 200, max 250. No pitch-rate number. Wingover 230 / 3 G / 45 deg / up to 120 deg bank. Barrel 230, 3 G, 45/45/90. (The "100-120 at the top" is in EFIG p.171, not in SMM 7.5; the repo's smm-aerobatics-catalog attributes it to SMM.)
4. **Power.** Max torque 100% (131% for 20 s). No idle-to-max time; spool-up from idle is slow, formation PCL lags. Leads: take-off 90% max, not below 80%; climb 85-90%; 80% after take-off; descent minimum 20%; avoid full and idle in close formation. The 90% guidance is the wing take-off and climb, not a general rule. Speed brake: rejoin closure control (SMM 12.26 para 63).
5. **Formation.** Speed changes: smooth, preface big power changes with a signal (SMM 12.31). Banks: 30 (rejoin), 60/2 (break), 70/3 (LAB). Telegraph: EFIG p.363.
