<!-- made by tools/flight-design/fw_loops.py on 2026-10-13; inputs: FW_WING, FW_SEE, CLOSE_WING, CLOSE_SEE (wing-moves.js), LEAD.speedHold, ENGINE, STEP_SEC, power.js, through tools/control-map/tables.mjs; G onset lag 0.05 s, roll lag 0.05 s, Padé order 6; every row an estimate until part 2's rig checks it -->

| Technique | Loop | Trim | Delay model | Crossover (rad/s) | Phase margin (°) | Gain margin (dB) | Extra-delay margin (s) | Steady share | Note |
|---|---|---|---|---|---|---|---|---|---|
| fighting wing | steering | T2 | D-Lead | 0.593 | 62.4 | 34.7 | 1.84 | - | look 3 s (1142 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering | T2 | D-Picture | 0.593 | 48.9 | 13.0 | 1.44 | - | look 3 s (1142 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering without the aim-line term | T2 | D-Lead | 0.339 | 42.6 | 38.6 | 2.19 | - | what the aim-line "feed-forward" adds: compare with the row above |
| fighting wing | steering | T1 | D-Lead | 0.377 | 70.9 | 37.7 | 3.28 | - | look 8 s (3046 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering | T1 | D-Picture | 0.377 | 62.3 | 18.3 | 2.88 | - | look 8 s (3046 ft); P 0.242/s; aim-line turn 0.5 s (hidden feedback, R3); lag 0.1 s (estimate) |
| fighting wing | steering without the aim-line term | T1 | D-Lead | 0.267 | 62.6 | 38.8 | 4.09 | - | what the aim-line "feed-forward" adds: compare with the row above |
| fighting wing | arc loop (power closed) | T2 | D-Lead | 0.086 | 80.4 | 16.4 | 16.36 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T2 | D-Lead | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T2 | D-Lead | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop (power closed) | T2 | D-Picture | 0.085 | 79.9 | 12.7 | 16.34 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T2 | D-Picture | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T2 | D-Picture | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop without the feed-forward (half-gain trap) | T2 | D-Lead | - | - | - | - | 0.50 | steady closure delivered against the wanted: about half |
| fighting wing | arc loop (power closed) | T4 | D-Lead | 0.086 | 80.4 | 16.4 | 16.36 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T4 | D-Lead | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T4 | D-Lead | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop (power closed) | T4 | D-Picture | 0.085 | 79.9 | 12.7 | 16.34 | 1.00 | kc 0.5, aimSec 10 s, blend 1.5 s, limits and slew left out; same at T2 and T4: no gain here depends on Lead's turn rate |
| fighting wing | power on the arc error (arc closed) | T4 | D-Picture | - | - | - | - | - | R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure |
| fighting wing | arc loop inner shortfall term (kc) | T4 | D-Picture | - | - | - | - | - | kc on the closure it has |
| fighting wing | arc loop without the feed-forward (half-gain trap) | T4 | D-Lead | - | - | - | - | 0.50 | steady closure delivered against the wanted: about half |
| fighting wing | vertical PD | T1 | D-Lead | 0.685 | 66.0 | 30.8 | 1.68 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T1 | D-Picture | 0.685 | 50.3 | 13.4 | 1.28 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T2 | D-Lead | 0.685 | 66.0 | 30.8 | 1.68 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | vertical PD | T2 | D-Picture | 0.685 | 50.3 | 13.4 | 1.28 | - | 0.005 G/ft, 0.02 G per ft/s; G onset 0.05 s (estimate) |
| fighting wing | power on the swept place (PI) | T1 | D-Lead | 0.141 | 36.5 | 24.3 | 4.51 | - | P behind/10 s, I 15 s, speed hold 0.2/s, engine 0.25 s |
| fighting wing | power on the swept place (PI) | T1 | D-Picture | 0.141 | 33.3 | 16.9 | 4.11 | - | P behind/10 s, I 15 s, speed hold 0.2/s, engine 0.25 s |
| close formation | plane axis, as spec 7b.6c (no filter, no onset) | T1 | built 0.3 s | 2.032 | 36.9 | 7.8 | 0.32 | - | the check of the method: spec 7b.6c gives about 2 rad/s and 37° |
| close formation | plane axis with the 0.1 s rate filter, G onset and the step | T1 | built 0.3 s | 2.092 | 13.6 | 2.5 | 0.11 | - | Fable 13 Oct: 25.9° with the filter, about 17° with the onset (its estimate); onset lag 0.05 s here |
| close formation | plane axis, as above with a 0.15 s onset lag (sensitivity) | T1 | built 0.3 s | 2.022 | 4.0 | 0.8 | 0.03 | - | how much the onset lag guess matters; the flown axis settles in about 2 s without hunting (spec 7b status), so the true lag is small |
| close formation | line axis (bank on the pace) | T1 | built 0.3 s | 1.159 | 38.5 | 8.7 | 0.58 | - | 1.9° per ft/s at Lead's G 1; pace 0.4/s per ft |
| close formation | line axis (bank on the pace) | T2 | built 0.3 s | 2.188 | 17.6 | 2.7 | 0.14 | - | 1.9° per ft/s at Lead's G 2; pace 0.4/s per ft |
| close formation | hinge axis (torque on the pace) | T1 | built 0.3 s | 0.908 | 30.9 | 8.5 | 0.59 | - | 12% per ft/s, 0.036 kt/s per % (power.js); torque rate limit left out |
