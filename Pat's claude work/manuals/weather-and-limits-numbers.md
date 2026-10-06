# Weather, alternates and limits: numbers from the manuals

Compared with src/wx (main f7e8008), SPEC-wx, SPEC-sof and decisions D57-D81, D95. "✓" matches, "≠" differs (see [questions-for-patrick.md](questions-for-patrick.md)), "not built" = a rule the tool doesn't check.

## When an alternate is needed (Gen Book p.7)

| Rule | Manual | Tool | |
|---|---|---|---|
| Destination weather trigger | Alternate required if weather is **less than 3,000 ft and 3 miles** for the flight's duration + 1 h after ETA; **2,000 ft and 3 miles if remaining within the MTCA only** | Home limit 2,000 ft / 3 SM (D59). D59 called V6's "DEST <3000 FT / 3 SM" label wrong | ✓ Closed: Q4 agreed (Patrick 05:19Z), D111 — default 2,000/3 "local (MTCA)" plus a "Cross-country 3000/3" choice |
| Other triggers | destination radar-only or GNSS-only; flight over 3 hours | not built | info (SOF waves are local sorties) |

## Alternate minima (Gen Book p.7, "based on TAF valid at ETA")

| Approach at the alternate | Ceiling | Visibility | Tool |
|---|---|---|---|
| Two precision approaches | 400 ft, or 200 ft above lowest usable HAA/HAT for the landing runway, whichever is higher | 1 mile, or 1/2 mile above the lowest usable visibility | 400-1 (D72) ✓ |
| One precision | 600 ft, or 300 ft above lowest HAA/HAT, whichever is higher | 2 miles, or 1 mile above lowest usable, whichever is higher | 600-2 (D72, V6 fallback) ✓ |
| Non-precision (GNSS: see below) | 800 ft, or 300 ft above lowest HAA/HAT, whichever is higher | 2 miles, or 1 mile above lowest usable | 800-2 (D72) ✓ |
| No TAF, GFA at ETA | highest of 1,500 ft AGL; 1,000 ft above highest straight-in MDA HAT (no circling published); 1,000 ft above highest circling HAA | 3 miles | not built (SOF reads TAFs; GFA is FF26) |
| No published approach and no usable navaids (RNAV/GNSS only) when destination is radar or GNSS only | forecast must allow a visual descent from the IFR MEA and a VFR approach and landing | | D80 (MEA + 500, 3 SM) ✓ in spirit |

The "or 300/200 ft and 1 mile above the approach's own minima" parts are per airfield: they fit the Airfields section's per-approach minima (D95, "Not set" by default). Worth a line in the Airfields help text, no change to the rules.

## Forecast groups (Gen Book p.7)

| Group | Manual | Tool (D72) |
|---|---|---|
| TEMPO | not below alternate minima for that aerodrome | ✓ |
| PROB | not below published landing minima for the landing runway | ✓ |
| BECMG worsening | use worsened conditions from the start of the period | ✓ (worst of) |
| BECMG improving | use improved conditions only after the end of the period | ✓ (worst of) |

## GNSS-only alternates (Gen Book p.7 NOTE)

- Destination approach independent of GNSS and available at ETA; LNAV minima are the lowest considered; no more than one predicted satellite outage within ±1 h of ETA; RAIM available at alternate ETA ±15 min.
- **RNAV-only destination and alternate at least 100 NM apart** (75 NM in Nunavut or north of 56° in Quebec and Labrador). Tool: D73 100 NM ✓. The 75 NM exception doesn't apply to Moose Jaw.

## Take-off and filing (Gen Book p.7)

- Take-off minima: Cat 1 = lowest usable HAA/HAT and visibility for the landing runway; Cat 1R = + 300 ft and + 1 mile. "To file": + 300 ft and + 1 mile, within 1 h of ETA. Not built; info for a later SOF feature.

## Crosswind (Gen Book p.8 chart, p.10)

- Crosswind and CRFI chart (image, genbook-p8): Go region needs CRFI at least 0.35 (lowest step) rising to 0.48-0.5; hard crosswind limit about 25 kt at CRFI 0.5 and above. Read from the picture, so approximate.
- Formation crosswind limits: **dry 15 kt, wet 10 kt, icy 5 kt** (Gen Book p.10).
- Useful for FF21 (SOF crosswind, needs runway data FF20). Nothing built yet.

## Training-rule weather limits

| Activity | Ceiling / visibility | Where |
|---|---|---|
| Low level: staff | 1,000 ft / 3 miles, discernible horizon | Gen Book p.9 |
| Low level: dual | 1,500 / 3 | Gen Book p.9 |
| Low level: solo / TAC NAV | 2,000 / 5 | Gen Book p.9 |
| Low-level chase plane | 2,000 / 5 | Gen Book p.11 |
| Advanced formation | discernible horizon, 5 NM flight visibility; 5,000 ft between layers; 2,000 ft vertical / 1 NM horizontal from cloud | Gen Book p.11 |
| Wx check flight (before others fly) | profile only; authorised by Ops O/CFI/Cmdt | Gen Book p.34 |

The SOF has one home limit (2,000/3). These per-activity limits could become optional SOF checks later; logged here, not proposed as a change.

## Other

- Hot weather: above 25 °C OAT may forgo dual layers; above 27 °C WBGT low level is MALA Yellow (Gen Book p.17). Not in the tool.
- Diversion chart from Moose Jaw: Regina 35 NM 067°, Swift Current 82 NM (Gen Book p.23). Not yet compared with the Airfields defaults.
