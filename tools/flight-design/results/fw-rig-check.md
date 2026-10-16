<!-- made by tools/flight-design/fw_loops.py rig_check from results/fw-rig.json (tools/fw-rig.mjs); every model row an estimate -->

| Rig case | What steps | Rig: final, peak, overshoot %, 63% (s) | Linear model: final, peak, overshoot %, 63% (s) | Verdict |
|---|---|---|---|---|
| vertical-T1 | height against Lead (ft) for a 40 ft step in the height target | 1, 1.014, 1, 4.85 | 1.0, 1.013, 1, 4.62 | holds |
| steering-T1 | his lateral place (ft, out) for a 60 ft step in the swept aim | 0.979, 0.982, 0, 9.25 | 0.989, 0.992, 0, 7.45 | holds |
| power-T1 | his KIAS for a 3 KIAS step in the wanted speed | -0.136, 0.558, 310, 2.45 | -0.137, 0.577, -, 2.59 | holds |
| offset-T2 | his offset d inside Lead's circle (ft) for a 60 ft step in the aim's offset | 4.581, 4.721, 3, 19.55 | -, -, -, - | not checkable linearly: the filter flies him at this trim (filter acting 217 of 400 recorded steps after the step; trim s 604 ft, d 102 ft, height -228 ft) |
| arc-T2 | his arc closure (ft/s) for a 5 ft/s step in the wanted closure | -1.083, -3.394, 213, 0.25 | -, -, -, - | not checkable linearly: the filter flies him at this trim (filter acting 199 of 400 recorded steps after the step; trim s 604 ft, d 102 ft, height -228 ft) |
