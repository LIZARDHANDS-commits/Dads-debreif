# airfields: the home field and its alternates

The home airfield (default CYMJ) and the alternates list (default CYQR, CYYN, CYXE), and what each alternate needs for the weather check. Spec: [`specs/SPEC-airfields.md`](../../specs/SPEC-airfields.md).

| File | What it does |
|---|---|
| `catalog.js` | `CATALOG`: V6's 15 airfields with names, positions and time zones (CYMJ also has its elevation). `DEFAULT_HOME`, `DEFAULT_ALTERNATES`. |
| `minima.js` | `alternateMinima(field)`: the Canada Air Pilot (CAP GEN) alternate minima for the airfield's approach type, with trade-offs, "whichever is greater" and rounding. `landingMinima(field)` for PROB groups. `visualDescent(field)` for GNSS-only and no-IFR-approach fields (D80). `roundCeilingFt`. |
| `distance.js` | `greatCircleNm(a, b)`, to 0.1 NM, or null without both positions. |
| `format.js` | Text for the panel: `formatMinimaLine`, `formatSm`, `formatOffset`, `formatNm`. |
| `airfields.js` | `createAirfields({ store })`: the setting (`home()`, `alternates()`, `stations()`, `update()`, `reset()`, `subscribe()`), and `checkOptions(icao)`, which is passed straight to `wx`'s `assessAlternate`. |

## Where to change common things

- **Add a built-in airfield:** one line in `CATALOG` (name, position, IANA time zone, elevation if known), and a test in `tests/unit/airfields/catalog.test.js`. People can also add any airfield themselves in Settings.
- **The minima table:** `TABLE` in `minima.js`. It is a weather rule: changing it needs a logged decision and a test citing the CAP GEN line.
- **Approach data** is never shipped. People enter the approach type and lowest HAT and visibility from the current Canada Air Pilot.

## The screen

`panel.js`: `createAirfieldsPanel({ airfields })` returns `{ element, dispose }`, the Airfields section of Settings (R22), styled by `airfields.css`. The shell mounts it; `tests/e2e/airfields.spec.js` tests it on `tests/e2e/pages/airfields.html`. `format.js` holds its text (minima lines, UTC offsets, distances).
