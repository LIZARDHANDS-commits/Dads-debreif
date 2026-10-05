# Moose Jaw pattern matrix (29L, true feet)

The route points the Traffic sim flies at Moose Jaw, in true feet since TR-67 (5 Oct 2026). The code is the source of truth: `src/modules/traffic/data/moose-jaw.json` for the routes and `src/modules/traffic/airfield.js` for the runway constants. How the ground is drawn and where the points come from is [Traffic spec section 4.0](../modules/traffic/spec.md). The Traffic requirements and decisions in `../modules/traffic/` win wherever this page differs. Manual text is not copied here; only pages are cited.

Before TR-67 this page listed V6's hand-drawn positions, which were about 1.12 to 1.2 times too big. Those positions are still in git history and in the "Moose Jaw (V6 original)" setup. They are no longer the reference.

## Frame

- Origin: the field reference point, 50.3303 N, 105.5592 W (CAP aerodrome chart ARP N50 19.82 W105 33.55). Positions are converted with `core/geo.js` `latLonToLocalFt`.
- x is feet east of the origin and y is feet north. Heights are feet MSL and speeds are KIAS.
- Runway 29L runs 298° true (`RUNWAY_29L_HDG_DEG`, rounded from 298.6° on the photo; CAP chart 289°M plus 9° East). Downwind is 118° true.
- Field elevation is 1,892 ft (CAP aerodrome chart, CYMJ-AD, effective 3 Sep 2026). The route file uses 1,880 ft at the threshold (`THRESHOLD_DATA_ELEV_FT`).
- "Along" means NM from the 29L threshold toward the approach end. "Out" means NM south of the 29L centreline.

## Runway 29L

| Point | x, y (ft) | Along / out (NM) | Source |
|---|---|---|---|
| 29L threshold bar | 2,796, −2,776 | 0 / 0 | Esri true-scale photo, ±10 ft (`THRESHOLD_29L`) |
| 29L number base | 2,614, −2,677 | −0.03 / 0 | Patrick, 5 Oct 00:35Z |
| Departure end (11R threshold) | −3,572, 690 | −1.19 / 0 | Photo: 7,250 ft at 298.6° true (CAP chart 7,280 ft) (`DEPARTURE_END_29L`) |
| Window | 6,617, −4,856 | 0.72 / 0 | Patrick, 5 Oct 00:36Z: ¾ NM to the number base; about 2,119 to 2,131 ft on a 3° path (SMM 4.7 paras 10-12) |

## PAT1: the overhead pattern (3,500 ft, 220 KIAS)

| # | Point | x, y (ft) | Alt | KIAS | Source |
|---|---|---|---|---|---|
| 0 | Threshold / final | 2,796, −2,776 | 1,880 | 100 | Runway, above |
| 1 | Departure end | −3,572, 690 | 2,500 | 140 | Runway, above |
| 2 | Climb out | −12,311, 5,447 | 3,500 | 180 | On the runway line |
| 3 | Upwind ends, crosswind starts | −16,000, 7,455 | 3,500 | 220 | EFIG Fig 3-10 (p.211), drawing only. As flown, the crosswind turn starts once the aircraft reaches 220 KIAS (Patrick, 5 Oct 01:12Z) |
| 4 | Crosswind meets the outer downwind | −25,117, −1,451 | 3,500 | 220 | EFIG Fig 3-10 |
| 5 | Abeam departure end: the straight-in descent starts | −9,395, −10,008 | 3,500 | 220 | TR-61 (Patrick, 4 Oct 23:19Z) |
| 6 | Downwind ends, turn north | 14,145, −22,820 | 3,500 | 220 | EFIG Fig 3-10, inner line, 3.22 NM along |
| 7 | 45° leg starts (overhead rejoin merges here) | 18,108, −15,539 | 3,500 | 220 | EFIG Fig 3-10 |
| 8 | Final entry (initial starts) | 16,656, −10,320 | 3,500 | 220 | EFIG Fig 3-10, 2.60 NM along. Open: the orders put initial at 2.2 NM (WFO Annex C). Initial is only a reference point on the run-in (Patrick, 5 Oct 01:05Z) |
| 9 | Break | 1,039, −1,820 | 3,500 | 220 | Flown by rule: about 2,000 ft past the threshold with a 10 kt headwind, moving with the wind (SMM 4.17 para 39, 4.18 para 42), and no later than the departure end (WFO S2 art 401 para 1c) |
| 10 | Break exit | −1,550, −4,213 | 3,500 | 140 | Flown by rule (SMM 4.17-4.19, EFIG p.151) |
| 11 | Perch | 6,148, −8,688 | 3,500 | 120 | Flown by rule (SMM 4.17-4.19, EFIG p.151) |
| 12 | Window | 6,617, −4,856 | 2,119 | 110 | Runway, above |

The outer downwind runs 2.00 NM south of the 29L centreline and parallel to it, through Race Track Lake and the Sukanen Ship intersection (EFIG Fig 3-10). The lap is about 18.7 NM; V6's was 25.8 NM in stretched feet.

## ENT1: the overhead rejoin (3,500 ft, 220 KIAS)

It comes from the south along the inner base-leg line (3.22 NM along) and merges into PAT1 at point 7. The rejoin lines define the base leg (Patrick, 5 Oct 01:05Z; SMM 4 para 76; EFIG p.209). It must be established at least 1 NM before the pattern (WFO S2 art 401 para 7, SMM 4.15 para 35).

| # | Point | x, y (ft) | Alt | KIAS |
|---|---|---|---|---|
| 0 | Entry start | −8,616, −64,638 | 3,500 | 220 |
| 1 | Entry mid | 6,592, −36,696 | 3,500 | 220 |
| 2 | Entry gate (= PAT1 point 6) | 14,145, −22,820 | 3,500 | 220 |
| 3 | Merge (= PAT1 point 7) | 18,108, −15,539 | 3,500 | 220 |

## ENT2: the straight-in rejoin (2,700 ft)

It comes from the south along the outer base-leg line (3.89 NM along), with a 45° bank base turn, the pre-landing check on base, then a 30 to 45° bank turn onto final (EFIG p.131; SMM 4.5-4.6, 4.16 para 36). The 3° glide path is met about 2.50 NM out: 2,700 − 1,892 = 808 ft on 3° to the number base (SMM 4.7 para 10). TR-61 flies the full straight-in pattern from here, lap after lap.

| # | Point | x, y (ft) | Alt | KIAS |
|---|---|---|---|---|
| 0 | Entry start | −5,006, −66,602 | 3,500 | 160 |
| 1 | Entry mid | 10,202, −38,661 | 2,700 | 140 |
| 2 | Entry gate (base) | 21,144, −18,558 | 2,700 | 120 |
| 3 | Final | 18,992, −11,591 | 2,700 | 110 |
| 4 | Glide path | 16,158, −10,049 | 2,700 | 110 |
| 5 | Merge (threshold) | 2,796, −2,776 | 1,880 | 100 |

## PFL

The circle has a radius of 0.5 true NM (`PFL_CIRCLE_RADIUS_FT`). Its centre is 0.5 NM left of 29L at the threshold, so the circle closes on the centreline at the threshold (Traffic pfl-definition, ratified 4 Oct 07:03Z). The key heights (`PFL_KEY_ALT_FT`) are High Key over the threshold at 5,000 ft, Low Key at 3,700 ft and Final Key at 3,000 ft (SMM 13.8 para 17, 13.9 para 18). Pattern PFLs meet the circle on a tangent (EFIG p.409). The full rules are in the [Traffic spec](../modules/traffic/spec.md).

## Whiskey

Whiskey is a waypoint on the extended 29L downwind (SMM 4 para 76), about 5.1 NM west of the threshold, just past Race Track Lake. This is an estimate from Fig 3-10, and Whiskey is not yet in the route file.
