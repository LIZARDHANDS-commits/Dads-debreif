# wx: weather parsing and limit checks

Turns raw METAR and TAF text into plain data and answers the SOF's weather questions. No page access; every function takes plain values and returns plain values. Spec: [`specs/SPEC-wx.md`](../../specs/SPEC-wx.md).

| File | What it does |
|---|---|
| `conditions.js` | Reads wind, visibility, weather and cloud tokens (shared by METAR and TAF). Merges a change group into what it changes. Formats visibility for display. |
| `metar.js` | `parseMetar(raw, { now })` |
| `taf.js` | `parseTaf(raw, { now })`, `tafTimeline(taf)` (prevailing conditions plus TEMPO/PROB/BECMG overlays), `forecastAt(taf, timeOrWindow)` |
| `limits.js` | `DEFAULT_LIMITS` (V6's WX SETUP values), `checkConditions`, `natoColour`, `flightCategory` |
| `alternates.js` | `homeAlternateTrigger(taf, window, limits)` for a wave, `assessAlternate(taf, eta, options)` for an alternate airfield |
| `dates.js` | Turns day-of-month times into full UTC dates; `ageMinutes` for data age |

## Where to change common things

- **Default limits:** `DEFAULT_LIMITS` in `limits.js`. The SOF passes the user's settings, so this is only the starting value. Changing it needs a logged decision.
- **Which weather raises a caution:** `checkConditions` in `limits.js`. The `watch` lists hold weather that is shown but not raised (question WX-2).
- **NATO colour or flight-category thresholds:** the `NATO` table and `flightCategory` in `limits.js`. Both are V6's values.
- **A report that parses wrong:** add it to `tests/unit/wx/reports.js` with a failing test first, then fix `conditions.js` or `taf.js`.

## Tests

```
node --test 'tests/unit/wx/*.test.js'
```

`v6-compare.test.js` runs V6's own SOF functions (decoded from `original/shell.html`) on the same reports, to show where the new code matches V6 and where it deliberately differs.
