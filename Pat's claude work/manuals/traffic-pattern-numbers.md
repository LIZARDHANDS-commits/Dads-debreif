# Moose Jaw traffic pattern: numbers from the manuals

Every number with where it comes from. "✓" = matches what's built or specced; "≠" = differs (question in [questions-for-patrick.md](questions-for-patrick.md)); "new" = not in the tool yet. Compared with SPEC-traffic on branch claude/traffic-spec-j17uqw (PR #96, head f4dab70) and V6's built-in "Moose Jaw Dynamic" setup (traffic.html line 613).

CYMJ field elevation is about 1,890 ft (V6's threshold point is 1,880 ft).

## Heights

| What | Manual | Where | Tool | |
|---|---|---|---|---|
| Harvard II traffic pattern (Moose Jaw) | 3,000 ft MSL (about 1,200 ft AGL), "to de-conflict with Hawk traffic" | SMM 4.14 para 32 | V6 built-in Pattern 1: 3,500 ft on upwind, crosswind, downwind, entry legs; Entries 1 and 3 at 3,500 | Q1 closed: Patrick keeps 3,500 ft (D109) |
| Same, newer source | "3000' and 220 KIAS, or as required" | EFIG p.212 (Mar 2025); p.151, 152, 185 diagrams label initial and break "3000ft MSL" | as above | Q1 closed: Patrick keeps 3,500 ft (D109) |
| Generic pattern (elsewhere) | 1,500 ft AGL or as local orders | SMM 4.14 para 32 | V6 generic new pattern 2,000-2,500 ft | info |
| Straight-in base leg | 2,700 ft MSL (about 800 ft AGL) to de-conflict with pattern traffic; normally 1,000 ft AGL elsewhere | SMM 4.5 para 8; EFIG p.131 "Level 2700ft" | V6 Entry 2 and Split 1 at 2,700 | ✓ |
| Straight-in from the pattern | descend at 220 KIAS, ~20 % torque, to 300 ft below pattern altitude, then decelerate | SMM 4.16 para 36; EFIG p.131 | V6 Split 1: 3,500 → 2,700 (800 ft) | ✓ if pattern is 3,000 (3,000 - 300 = 2,700) |
| Rejoining traffic can be | just 300 ft above you near the base turn | SMM 4.16 para 37 | conflict limit 200 ft vertical, caution 500 ft | info |
| Closed pattern | climb to ~2,700 MSL then reduce torque, level 3,000 ft | EFIG p.134 | V6 Split 3 climbs to 3,500 | Q1 closed: Patrick keeps 3,500 ft (D109) |
| The window | 3/4 NM from threshold on a 3° glide path, about 2,100-2,200 ft MSL at Moose Jaw; landing transition starts here | SMM 4.7 para 12; EFIG p.397 "200' AGL, 4000'" | V6 Pattern 1 point 13 at 2,100 ft | ✓ |
| Glide path | 3° (about 300 ft per NM) | SMM 4.7 para 10; EFIG p.399 | not modelled (straight descent between points) | info |
| Straight-in glide path intercept | runway 29 about 3.4 DME, runway 11 about 3.1 DME | EFIG p.130 | - | new (for T8 redraw) |
| Round-out | 10-15 ft; touchdown 300-400 ft down the runway at 80-90 KIAS | SMM 4.9 para 15 | aircraft land at the threshold point | info |

## Speeds (KIAS)

| What | Manual | Where | SPEC-traffic CT-156 phase | |
|---|---|---|---|---|
| Pattern, initial | 220 KIAS (about 65 % torque) | SMM 4.14 para 32; EFIG p.151, 185, 212 | Entry 220, Pattern 220 | ✓ |
| Joining | on the rejoin line at pattern altitude and speed at least 1 NM before the pattern | SMM 4.15 para 35; EFIG p.208 | Entry 220 | ✓ |
| Downwind after the break | decelerate, configure below 147 (gear limit), ideal 120, ~35 % torque | SMM 4.17 paras 40-41; EFIG p.151 | Inner 120 | ✓ |
| Perch / final turn | 120 KIAS, flaps LDG, ~20 % torque | EFIG p.150, 151, 152 | the spec puts "the final turn in a normal circuit" in the Pattern phase (220) | Q3 closed: 45° at 120 KIAS, base 140 (D110; SMM 4.19) |
| Ideal approach speed (any flap) | 120 | SMM Table 4.1 | Straight-in 120 | ✓ |
| Minimum manoeuvring speed | 120 flaps up, 115 T/O flap, 110 LDG flap; "not below threshold crossing speed + 10" | SMM Table 4.1 and note | - | info |
| Final approach speed (from the window) | 100 LDG flap, 105 T/O flap, 110 flapless | SMM 4.1 para 1, 4.8 para 13, Table 4.1 (threshold crossing speed) | Final 110 | Q2 closed: 100 KIAS window to threshold (D110) |
| Straight-in base | 120-147 joining, below 147 on base, ideal 120 (~35 % torque) | SMM 4.5 para 8, 4.6 para 9 | Straight-in 120 | ✓ |
| Straight-in descent on the glide path | 120 (~25 % torque) until the window | SMM 4.7 para 10 | Straight-in 120 | ✓ |
| Closed pattern | pull up at 140 KIAS minimum, ~15° nose up, 45-60° bank, level 3,000 ft and 140 KIAS | EFIG p.134 | V6 Split 3: 150 then 140 | ✓ |
| Touch-and-go | flaps up at 110 KIAS; Post-Take-Off check before 147 | SMM 4.13 paras 30-31 | - | info |
| Climb out | best rate 140 KIAS (~15° nose up); normal 180 KIAS (10-12° nose up) | SMM 3.14 para 35; EFIG p.126 | V6 Pattern 1: 140 at departure end, 180, then 220 | ✓ |
| Go-around | max power, 5-7° nose up | EFIG p.157 | - | info |

## Bank, G and turn points

| What | Manual | Where | Tool | |
|---|---|---|---|---|
| Pattern turns | 60° bank "throughout the pattern", except the last turn to initial: 45-60° as needed to line up | SMM 4.14 para 33 | 60° / 2 G default (D46, T6) | ✓ |
| The break | 180° level turn, 60° bank and 2 G ("60/2"), PCL idle, about 2,000 ft past the threshold with a 10 kt headwind; stronger headwind break later, lighter headwind break earlier | SMM 4.17 para 39, 4.18 para 42; EFIG p.151, 183 | V6 has no break point as such; pattern points 10-11 | new (break point rule for T8) |
| Final turn from the perch | up to 45° bank (about 1.4 G), flaps LDG, 120 KIAS, 1/3 sky 2/3 ground | EFIG p.150-152 | V6 points 11-13 at 1 G (flown tighter, T6b flags them) | Q3 closed: 45° at 120 KIAS, base 140 (D110; SMM 4.19) |
| Straight-in turns | 45° bank energy-depleting turn onto base; 30-45° turn onto the 45° leg and onto final | SMM 4.6 para 9, 4.16 para 36; EFIG p.131 | 60°/2 G default | Q3 closed: 45° at 120 KIAS, base 140 (D110; SMM 4.19) |
| Formation pattern | base leg can be one big 45° bank turn | EFIG p.367, 395 | - | info |
| Downwind spacing | "fuel cap over the runway" | EFIG p.134, 183 | - | new (for T8 redraw) |
| Centreline capture (straight-in) | begin the turn about 1/4 NM before the centreline | EFIG p.130 | - | info |
| Wind on the break | as above; wind on the final turn in SMM 4.20 (not read yet) | SMM 4.18 | T6 moves the roll-in for wind | ✓ in spirit |

## Pattern shape and references (for Patrick and Dad's route redraw, T8)

- The pattern is a racetrack on the outer runway (29L/11R) with **Whiskey** and **Echo** rejoins at each end, a **45° entry leg** [manual text left out; see the page cited], and ground references: Snowdys Springs, Race Track Lake, Sukanen Ship intersection, Auto Wrecker (Flat Farm), Arrow Tree Rows; windows "Intersecting Fields" (29L) and "Farm" (11R). EFIG p.211 (image), SMM Fig. 4.9.
- Rejoin lines: Island (Old Wives Lake), Bunny Lake, Gravel Pit and Road, 10 Mile Lake, Farms, River, White and Green Grain Elevators, Boot Heal, U-shaped Farm, Clover Leaf; High Terrain block to the west. EFIG p.209 (image).
- Overhead break and final turn diagrams for 29L and 11R with the perch, window and radio calls: EFIG p.151, 152, 185, 186.
- Straight-in 29L and 11R: EFIG p.131, 132 (and flapless 201, 202).
- Circuit check abeam the runway midpoint on every downwind (SMM 4.14 para 32).

## Other numbers

- Fuel: about 40 lb per traffic pattern or straight-in and landing; 15 lb per closed pattern and landing (SMM 4.3 para 4).
- AOA: don't exceed 15 units while manoeuvring on the approach (SMM 4.7 warning).
- Uncontrolled circuits (elsewhere): 1,000 ft AGL, downwind 1.5 NM out, base 1.5 NM, 3° is 900 ft AGL at 3 NM (EFIG p.399).
- Stream landing: minimum landing spacing 2,000 ft; wingman perches when lead is 1/2 to 2/3 through the final turn (EFIG p.393).

## Engine-out glide (for PFLs and a future engine-failure option)

T-6A Maximum Glide Distance chart (flight test, PT6A-68, June 1998; engine inoperative, IAS), uploaded by Patrick in the Traffic thread 06:33Z, saved as images/t6a-max-glide-distance.png. Checked against the image 2026-09-30:

| Configuration / drag index | Propeller | Glide speed | Sink rate | Glide ratio |
|---|---|---|---|---|
| Clean / 0 | feathered | 125 KIAS | 1,350 ft/min | 2 NM per 1,000 ft |
| Gear down / 20 | feathered | 105 KIAS | 1,500 ft/min | 1.5 NM per 1,000 ft |
| Landing flap, gear down / 80 | feathered | 95 KIAS | 1,850 ft/min | 1.1 NM per 1,000 ft |
| Clean / 0 | windmilling | 110 KIAS | 2,350 ft/min | 1 NM per 1,000 ft |

- The distance plot gives about 10 NM from 5,000 ft, 20 NM from 10,000, 39 NM from 20,000 and 61 NM from 31,000 ft at drag index 0; weight (5,000-6,500 lb) barely changes it.
- **SMM agrees:** [manual text left out; see the page cited], glide at 125 KIAS (SMM 13.5 para 7, 13.4). Rule of thumb: distance ÷ 2 × 1,000 + High Key altitude; High Key at Moose Jaw 5,000 ft MSL (3,000-4,000 ft AGL window), so 7,500 ft MSL at 5 NM (13.5 paras 7-8). Low Key about 1,700 ft AGL (3,700 MSL) (13.8 para 17). Feather the prop: an unfeathered prop "will greatly reduce glide distance" (matches the windmilling row).
- **One difference, not a conflict:** with the gear down the SMM flies the forced-landing pattern at **120 KIAS** from High Key to the flare (SMM 13.4, 13.6), while the chart's best gear-down glide speed is 105 KIAS. 120 is the pattern speed the SMM teaches; 105 is the max-distance speed. Orbit losses: 360° at 125 KIAS, 30° bank, clean about 1,700 ft; at 120 KIAS, gear down about 2,600 ft (SMM 13.5).
- PFL simulation: 4-6 % torque simulates a feathered engine (SMM 13; EFIG p.84 FCHT brief: "125KIAS and 4-6% Tq").

## NFM: zoom, glide and USAF pattern (A1-T6AAA-NFM-100, Scribd text)

- **Zoom (NFM Fig 3-4, p.3-12):** 2 s delay after the failure, then a **20° climb held to 145 KIAS**, engine secured, prop feathered. Height gained: about 595-883 ft from 200 KIAS and 1,172-1,552 ft from 250 KIAS (range across altitude and weight). That is about 64-71 % of the ideal energy height (V1² - V2²)/2g. Compare Q74 placeholders: 15° nose up (NFM: 20°) and 70 % (NFM: supported). Zoom/glide minimum 125 knots (boldface ZOOM/GLIDE step).
- **Glide (NFM Fig 3-5, p.3-13):** best glide 125 KIAS clean, prop feathered; gear down 105 (chart). Glide numbers match the max glide chart above. About 1,200 ft lost during an airstart attempt. Zero-thrust (feather) simulation 4-6 % torque, matching SMM 13.5.
- **USAF overhead pattern (NFM Fig 2-8, p.2-27), info only:** initial 200-250 KIAS, break at 1,000 ft AGL, downwind 110-120, perch 120 minimum, base 110 minimum, final 100/105/110 by flap. Moose Jaw flies the SMM pattern (220 KIAS, 3,500 ft per Patrick), so no change.
- **Stall (NFM Fig 6-3, p.6-7):** idle-power stall speed chart is an image, not in the text. Stick shaker 5-10 kt above the stall.
