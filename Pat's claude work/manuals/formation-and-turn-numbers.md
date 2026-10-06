# Formation, turns and G: numbers from the manuals

SMM chapter 16 (advanced formation) and 14.3-14.7 (energy management) read 2026-09-30 from Patrick's split PDFs.

## Line abreast and 4-ship (SMM ch. 16)

| What | SMM | Tool | |
|---|---|---|---|
| Line abreast | 4,000-6,000 ft lateral, 0-10° sweep, ±2,000 ft vertical, 220 KIAS; beyond 9,000 ft mutual support breaks down (16.18 para 49) | spread 4,000-6,000 ✓; fore/aft ±250 ft; lead 200 kt ±10; Turn Sim 220 KTAS | ✓ spread; Q8 closed (D115: 220 KIAS low block, 200 mid), Q9 closed (D116: SMM 0-10° sweep with FORE/AFT flags) |
| Crossing separation | minimum 300 ft vertical and/or horizontal for all LAB manoeuvres (16.13 para 31) | Turn Sim shows min separation, no limit | info (could flag < 300 ft) |
| LAB turns | 3 G level, PCL max, energy-sustaining (16.18 para 50) | Turn Sim default G 2.0 | Q6 closed (D113: default 3 G) |
| Delayed 90 / 45 | outside pilot turns first at 3 G; inside pilot waits until the wingman reaches 5 or 7 o'clock; "closer, turn early; wider, delay" (16.19 paras 52-57) | outside first (D43), step = spacing ÷ speed × cot(half turn) (D44) | ✓ |
| Check / in-place turns | check ≤ 30°, both turn together; in-place > 30°, rollout in trail at LAB spacing (16.19 paras 58-59) | In-place 90 kept as V6 (Q43) | ✓ |
| Hook | both turn the same direction 180° at 3 G, roll out in LAB (16.19 para 60); spread-4: aim for aligned fuselages at the 90° point for aircraft on the outside (16.45 para 121) | Q43 rebuild: same direction 180°, fuselages line up mid-turn | ✓ |
| Shackle | 3 G into each other ~45°, wingman stacks above/below, cross, lead times the 45° reversal back to LAB (16.19 paras 61-62) | D85: sides swapped, an X | ✓ |
| Cross turn | toward each other at 2 G for ~90°, wingman stacks, then 3 G to roll out after 180° (16.19 para 64) | V6: 180° at one G | info: a two-stage G isn't in V6; could be a later refinement |
| G-warm | in-place 90 at 3 G, 5 s ½ G push, 4 G hook, in-place 90 back at 3 G; minimum 220 KIAS (16.22 paras 70-71) | - | info |
| Offset box | second element trails 6,000-8,000 ft (1.0-1.2 NM) with an offset (16.41 para 109) | offset standard 8,000 ± 1,000; Turn Sim box aft 8,000 | Q7 closed (D114: 7,000 ± 1,000, box aft 7,000) |
| Offset box turn timing | delayed and hook turns: #3 and #4 delay 10-15 s and miss #1 and #2; in-place, shackle and check turns: no delay (16.41 para 112) | Turn Sim keeps V6's offset-box plan; #4 solves by ground track (Q44b) | info: worth a golden check that V6's plan gives 10-15 s at the defaults |
| Spread-4 | #2 and #3 fly LAB off Lead; #4 flies LAB off #3 (16.42 para 116) | 4312: #2 s left, #3 s right, #4 2s right | ✓ |
| Landing separation | minimum 2,000 ft (16.46 para 122) | - | info |

## MTCA blocks (Gen Book p.12, map image)

- Harvard: Formation = Low block 6,000-10,000 ft MSL; Clearhood = Mid 10,500-15,500; IF = Hi 16,000-19,000. Harvard areas Walrus, Sable, Eagle (Hawk areas Wood, Sand, Stone, Edge). Lead speed (Patrick, 05:37Z): 220 KIAS low block, 200 KIAS mid block.

## Energy management (SMM 14.3-14.7), for the Turn Fight energy mode

- Max-performance parameters for training: **160 KIAS and 17 units AOA**; best turn rate at max power and 17 AOA (14.3 para 6, 14.4 para 8).
- Entry parameters (Table 14.1): Barrel roll 230 KIAS, 3 G; Vertical roll and Vertical 8 280 KIAS, 4-5 G; slow-speed loop/roll min 200/180 KIAS, 3-4 G; Immelmann 200-250 KIAS, about 4 G; **Split-S 100-120 KIAS, about 4 G; Pitch back 160-220 KIAS, about 4 G; Slice 100-160 KIAS**, all max power. Entry speeds assume about 10,000 ft MSL (14.5 para 10).
- Bank for the entry: **slice: roll the lift vector past horizontal, about 90-135° of bank, depending on entry speed**, then pull smoothly to the shaker (SMM 14.18 para 46; start from at least 10,000 ft, para 45). **Pitch back: no number**, only "roll to place your lift vector as required" (SMM 14.17 para 43), with lower speed meaning more bank (EFIG p.441). The Turn Fight spec's pitch-back 60° at 160 KIAS down to 30° at 220 KIAS is its own default, for Dad. Caution above 190 KIAS: easy to exceed the 4.7 G asymmetric limit (SMM 14.17).
- Roll rate: not in the Gen Book, EFIG or SMM.
- Hard deck in the Moose Jaw areas 3,000 ft AGL (about 6,000 ft MSL); soft deck at least 1,000 ft above it (14.6-14.7).

Compared with V6_STANDARDS (src/core/standards.js, main f7e8008), SPEC-turn-sim and SPEC-turn-fight.

## Formation

| What | Manual | Where | Tool | |
|---|---|---|---|---|
| Lead speed after a rejoin break | roll out at 200 KIAS or as briefed; lead's break is normally a 180° turn at 60° bank | EFIG p.371, 374 | V6_STANDARDS lead target 200 kt ± 10 | ✓ (supports 200) |
| Straight-ahead rejoin | 20-30 KIAS overtake | EFIG p.371 | - | info |
| Turning rejoin | 10-20 KIAS overtake; angular cut-off at 10:30 or 1:30 | EFIG p.374 | - | info |
| Route | one to three wingspans back | EFIG p.384 | - | info |
| Line astern | about 10 ft clearance; stabilator 1/3 to 1/2 above canopy bow | EFIG p.383 | - | info |
| Fighting wing | 30-60° sweep, 500-1,000 ft range | EFIG p.391 | - | info |
| Interval take-off | as briefed, minimum 5 s | EFIG p.386 | - | info |
| Stream landing | minimum landing spacing 2,000 ft; perch when lead is 1/2 to 2/3 through the final turn; ~1/2° steeper than lead, not more than 1° | EFIG p.393 | - | info |
| Formation descent | lead minimum torque 20 % | EFIG p.395 | - | info |
| Advanced formation G limits | **lead +4 G, wingmen +5 G** | Gen Book p.11 | Turn Sim lead target G 1.0 ± 0.2 (level turns); no max-G check | info (possible later check) |
| Advanced formation separation | high-aspect / FM: 500 ft bubble; line-abreast crossing: 300 ft minimum safe separation; hard deck 3,000 ft AGL or 2,000 ft above cloud (6,000 ft AGL with solo students) | Gen Book p.11 | - | info |
| Lost wingman (IMC) | brief item "W/L - 10 deg - 10 sec - 10 AOB"; outside: roll out 20 s; inside: continue turn, reduce torque, tell lead to roll out | Gen Book p.10 | - | info |
| Formation crosswind | dry 15 kt, wet 10 kt, icy 5 kt | Gen Book p.10 | - | info |

## Turns and G (for the Turn Fight and Turn Sim)

| What | Manual | Where | Tool | |
|---|---|---|---|---|
| Level turns | 60° bank = 2 G (the "60/2" in the break) | EFIG p.183 | core turn math; D46 | ✓ |
| Level max-performance turn | 70-75° bank, entry at 150 KIAS minus altitude in thousands (e.g. 140 KIAS at 10,000 ft), pull to the shaker | EFIG p.428 | Turn Fight default 220 KTAS, 4 G (V6) | info, see Q5 |
| Constant-speed max-performance turn | 70-75° bank, 160 KIAS, about 4 G initially | EFIG p.430 | same | info, see Q5 |
| G awareness | AGSM for 4 G held more than 180° | EFIG p.428, 430 | - | info |
| Aerobatics entry speeds | looping at least 200 KIAS, rolling at least 180, maximum 250 | EFIG p.433, 174 | - | info |
| Nose-low recovery | safety altitude 6,000 ft AGL; rolling G limit +4.7 | EFIG p.181 | - | info |
| Low level | minimum 180 KIAS; enroute turns level to slightly climbing, not more than 180° | Gen Book p.9 | - | info |

## T-6A performance charts (Patrick, 05:19Z; images/t6a-*.png, from the T-6A flight manual, source pages not given)

Read off the pictures, so approximate.

- **V-n, max take-off weight 5,168 lb:** symmetric limits +7 G / -3.5 G; asymmetric (rolling) +4.7 / -1 G; limit speed 316 KIAS (VMO), 244 KIAS / M0.67 at 31,000 ft. The sea-level stall line fits G ≈ (KIAS ÷ 86)²: about 1.4 G at 100, 3.1 G at 150, 5.4 G at 200, 6.6 G at 220, 7 G at about 227 KIAS.
- **Airspeed limits:** VO 227 KIAS (manoeuvring speed, the corner where 7 G is first available), VG 206, VMO 316; gear and flaps extended 147 KIAS up to 22,000 ft; M0.67 above 18,769 ft.
- **Sustained turn rate (max power, clean, standard day):** best at the stall limit around 130-140 KIAS: about 20.6 °/s at sea level, 18.5 at 5,000 ft, 16.5 at 10,000, 14.8 at 15,000, 12 at 20,000, 9.5 at 25,000, 6.7 at 31,000. Sustained G tops out near 3 G at sea level; zero sustained turn by about 260 KIAS at sea level.
- **Sustained turn radius:** smallest about 650-700 ft near 140 KIAS at sea level (3 G), growing with altitude.
- **What it means for the Turn Fight:** V6's default 220 KTAS / 4 G sits inside the envelope (220 KIAS can pull up to about 6.6 G), but 4 G isn't sustainable there, so speed would bleed off; the Turn Fight holds speed constant (Q50, "Simplified: constant speed and turn rate"). Real energy trading is FF23. A check against the stall line (flag a G above what the set speed allows) needs no energy model.

## T-6A NATOPS Flight Manual (NFM)

- The turn-rate/radius charts (appendix A9), V-n and the idle stall-speed chart (Fig 6-3, p.6-7) are images; the Scribd text holds only their captions. The T-6A chart images Patrick sent at 05:19Z are the readable copies. Stick shaker 5-10 kt above the stall. Zoom and glide are in traffic-pattern-numbers.md.

## Not yet read closely

- SMM 12 (basic formation, pursuit curves) and 17 (TAC NAV, battle break, tac initial in Moose Jaw) are extracted in text/smm.txt but only skimmed.
