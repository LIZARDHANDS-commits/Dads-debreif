# Weather parser, airfields and flight data

All three are done; nothing paused.

## Weather (`src/wx/`, `specs/SPEC-wx.md`)
METAR/TAF parsing, limits, alternate checks, sources (MET Norway, Datamask fallback, 5 min refresh). Exactly on a limit is "at limit" (yellow), strictly below is red. Anything unreadable reads "incomplete", never "meets". Fixtures in `tests/fixtures/wx`.

## Airfields (`src/airfields/`, `specs/SPEC-airfields.md`)
Home field (default CYMJ) and alternates as a setting; approach type picks the alternate minima row. No approach data ships (charts change every 56 days).

## Flight data (`src/flight-data/`, `specs/SPEC-flight-data.md`, README in the folder)
ForeFlight KML loading, cleaning (glitch removal, gaps), sampling, estimated pitch and G, clock, saved debrief files. A time hole of more than 5 s is a gap (`GAP_S`); the Debrief F2 fix may make it 5 s or more.
