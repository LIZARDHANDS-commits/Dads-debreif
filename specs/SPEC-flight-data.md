# Spec: `flight-data`, flight tracks for the debrief

Status: **approved by Patrick on 2026-09-30** ("spec-flight-data-approved", in the Flight data thread), which also logs C5 to C9 and the 5 s / 450 kt data-quality rule as decisions. Changes go through a pull request. Module id `flight-data` in [`SPEC.md`](../SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

## Objective

Turn ForeFlight track logs (KML) into one clean, shared flight model that the debrief's 2D map, 3D view, readouts and EM chart all read from. V6 reads each file in one place but then keeps four playback clocks, reads bad GPS fixes as real flight, and loses everything on reload (issues #22 to #25). `flight-data` replaces that with:

1. **Loading:** up to 4 track files, or the example flight, loaded all at once or not at all, with a clear status (R11, D20).
2. **Cleaning:** impossible fixes dropped and GPS gaps marked, with a note saying what was changed (D32). Recorded bank used when a track has it; a blank pitch column estimated, not read as 0° (D47).
3. **One flight model** with the shared time window, interpolated positions, speed, heading, recorded or estimated G, bank and pitch.
4. **One playback clock** for every view (#24, R12).
5. **The debrief file:** tracks, debrief focus points (DFPs) and settings saved to a file and reopened exactly as they were (R17, D21, #25).

Users are instructors and students debriefing a sortie. They never see `flight-data` itself, only the debrief screen built on it (`debrief`, the next module).

## Assumptions

1. ForeFlight KML is the format to support and test (D20). All five real tracks we have (V6's four examples from 2026-06-02 and Patrick's flight from 2026-09-25) use the same layout: one `gx:Track` of `<when>`/`<gx:coord>` pairs, then `gx:SimpleArrayData` columns (`acc_horiz`, `acc_vert`, `course`, `speed_kts`, `altitude`, `bank`, `pitch`, and on #3 and #4 `g_load`). Plain `<coordinates>` KML is still read, as V6 does.
2. Files are read with our own small KML reader, not the browser's XML parser. It reads only the tags V6 reads, runs the same in the browser and in Node's test runner (no package needed), and never expands XML entities. The golden test proves it gives V6's points exactly (see Testing).
3. Everything stays on the user's computer. Nothing is uploaded anywhere.
4. `core` owns the numbers (`geo.js` projection, `units.js` factors, `time.js` KML times, and the estimated-G formula coming in core's Task 8). `flight-data` calls them and never keeps its own copy.
5. Folder: `src/flight-data/`, as the approved module map names it (not `src/data/`), with tests in `tests/unit/flight-data/` and `tests/golden/`.

## What V6 does today (the behaviour we pin first)

| V6 function (line in `original/shell.html`) | What it does |
|---|---|
| `parseKmlText` (2318) | Reads `<when>` and `<gx:coord>`, recorded G (`g_load` and similar names, 0 to 12) and pitch (±90°) by index. Never reads bank. Sorts by time. |
| `projectAll` (2376) | Projects every track to feet around the first fix of the first track. Playback runs from the latest start to the earliest end; if the tracks don't overlap it silently switches to the earliest start to the latest end. |
| `interpTrack` (2430) | Straight-line position, altitude, G and pitch between fixes; speed from the two fixes around the time (factor 0.592484). |
| `headingAtTrack` (2151) | Heading from the two fixes around the time (0 = east, D35). |
| `aircraftPitchAtTrack` (2446) | Recorded pitch if present, otherwise climb angle over ±1.5 s, capped at ±30°. |
| `estimatedGAtTrack` (2462) | G from turn rate and speed over ±1.5 s (the formula moves to `core`). |
| Playback loop (3262), `DADS3DAPI` (2113) | The clock the 2D, 3D and EM views share, 0.25× to 16×. |

## Changes from V6

Under D10, each change below lands as its own commit **after** the golden test has pinned V6's behaviour, and that commit updates the pinned value on purpose.

| # | Change | Why | Authority |
|---|---|---|---|
| C1 | A blank value in a recorded column is "no data", not 0. | V6 reads the blank pitch on #1, #2 and Patrick's track as 0°, so it never estimates it. | D47 |
| C2 | Read the recorded `bank` column (±180°) and use it when present; otherwise estimate bank from the turn, as now. | #3 and #4 record bank, including rolls past 90°. | D47 |
| C3 | Drop impossible fixes: ForeFlight's −100,000 m "no altitude" value (any altitude outside −500 m to 20,000 m), coordinates outside ±90°/±180°, and position jumps no T-6 can fly (see Data quality). | V6 draws #2 at −328,084 ft and speeds of 1,025 kt. | D32 |
| C4 | Mark GPS gaps: more than **5 s** between good fixes. The line breaks there, and interpolated values report "in a gap" so the debrief blanks spacing readouts. | V6 draws gaps of up to 81 s as straight flight. | D32 |
| C5 | Every fix needs its own time. A file whose `<when>` count doesn't match its coordinates, or with unreadable times, is refused with a message (V6 falls back to the point number and puts the flight in 1970). | Issue #22. | Spec approval |
| C6 | The first and last frame show the speed of the nearest segment, not 0 kt. Latitude and longitude are interpolated like x and y. | Issue #24: Lead reads "SLOW" at the start and end. | Spec approval |
| C7 | Heading is "unknown" (null) when the aircraft hasn't moved (duplicate fixes, taxi), not due east. | Issue #22: 3/9 line, aspect and labels flip at random on the ramp. | Spec approval |
| C8 | Tracks that don't overlap in time are refused with a message naming the one that doesn't fit, instead of V6's silent switch. The window stays V6's "common playback" (latest start to earliest end), and the status says when a track was cut. | Issue #22: one file from another day produced a days-long slider. | Spec approval |
| C9 | Load is all or nothing: if any file fails, nothing already loaded is lost and the message names the file and the reason. | Issue #23. | Spec approval |
| C10 | Pitch and G are estimated from the track by default. Recorded pitch and G are still read and kept, but not shown unless a setting asks for them. Recorded bank is still used (C2). | On #3 and #4 the recorded pitch doesn't follow the climb angle at all (correlation −0.2 to 0.1 at any time lag) and swings while parked, so it's the iPad moving, not the aircraft. | Patrick, Q32 (2026-09-30) |

C1 to C4 were already decided (D32, D47). Patrick's approval of this spec settled C5 to C9 (they fix bugs rather than change flight math, but C6 and C7 change numbers V6 shows).

## Data quality (C3, C4)

- **Gap:** more than 5 s between consecutive good fixes. ForeFlight logs about once a second (median 1.00 s on all five tracks).
- **Impossible jump:** a fix, or a run of up to 5 fixes, that the aircraft would need more than 450 kt ground speed to reach from the last good fix, when a later fix within those 5 is reachable at a normal speed. Speeds are measured over at least 1 s, because #4 logs some fixes 0.5 s apart, which looks like 550 kt if divided naively although the positions are fine. ForeFlight's own speed column peaks at 389 kt (#2), apart from one 7,637 kt glitch on #3.
- **What this does to the real tracks** (tried on all five before writing this): it drops 1 fix on #1, 23 on #2 and none on #3, #4 or Patrick's track, besides Patrick's 21 and #2's 1 at −100,000 m. The fastest segment left is 445 kt. Gaps over 5 s: 12, 25, 9 and 6 on the examples, 6 on Patrick's (7 before cleaning: two of them sit either side of a −100,000 m fix and become one).
- **Acceptance:** after cleaning, no segment on the five tracks implies more than 450 kt, no fix on #3, #4 or Patrick's track is dropped for a jump, and every −100,000 m fix is dropped. The rule is pinned by tests on these tracks, and the numbers (5 s, 450 kt, 5 fixes) are named constants in one place.
- **The status note** says, per track, how many fixes were dropped and why, and how many gaps there are and the longest.
- `acc_horiz` (ForeFlight's accuracy estimate) is kept with each fix but does not drop fixes on its own: #1's bad fix reports good accuracy, and many of #2's poor-accuracy fixes are in the right place.

## The flight model

Plain objects, no classes, no page access:

```js
// A loaded, cleaned track. Units are in the names.
{
  slot: 1,                   // 1 to 4, the ship number (#1 is lead)
  name: '#1 Lead - ED2F5',   // file name or example nickname (D22), shown as text only
  fixes: [{ t, lat, lon, altM, xFt, yFt, altFt, gRecorded, pitchRecordedDeg, bankRecordedDeg, accHorizM }],
  gaps: [{ fromT, toT }],
  dropped: { altitude: 21, position: 0, jump: 0 },
  has: { g: false, pitch: false, bank: false },
}
// A flight: up to 4 tracks on one map and one time window.
{ tracks: { 1: track, 2: track, ... }, ref, startT, endT, cutTracks: [4] }
```

Functions (names may shift slightly when written, the list will not):

| File | Functions |
|---|---|
| `kml.js` | `readKml(text, name)` returns a raw track or throws a readable `KmlError`. |
| `clean.js` | `cleanTrack(raw)` applies C1 to C4 and returns the track plus its notes. |
| `flight.js` | `buildFlight(tracks)` (projection, window, C8); `sampleAt(track, t)` returns position, lat/lon, altitude, speed, heading, G, bank, pitch, each with its source (recorded or estimated) and an `inGap` flag. |
| `clock.js` | The playback clock (below). |
| `debrief-file.js` | `toDebriefFile(flight, dfps, settings)` and `readDebriefFile(text)`. |
| `examples.js` | The example flight's four file names and nicknames (the files themselves are fetched only when asked for, R5). |

## The playback clock (#24, R12)

One clock for every view. It holds no timers of its own: the ui-kit scheduler calls `clock.tick(nowMs)` each frame while the debrief is open (R4).

- Play, pause, reset, seek to a time, step ±1 s, and speeds 0.25× to 16× as in V6.
- Play at the end starts again from the beginning (V6 does nothing).
- A frame longer than 0.25 s of real time (a hidden tab, a slow frame) moves the clock by 0.25 s at most, so it never jumps ahead.
- Seeking lands on exact seconds, so a DFP can be set at a chosen moment.

## The debrief file (R17, D21, #25)

A JSON file (`.dadsdebrief.json`) holding the original KML text of each track, the cleaning settings, the DFPs of **this** flight (each with its time, label and note, sorted by time) and the debrief settings. Reopening re-reads the KML with the same settings, so the flight comes back exactly as it was. Saving and opening the file itself is `storage/file.js`'s job; `flight-data` owns the format and checks it.

## Security (untrusted files)

KML and debrief files come from anyone. Following `.claude/skills/security-and-hardening` and `.claude/references/security-checklist.md`:

- **Size and shape are checked where the file comes in:** at most 30 MB per KML file (Patrick's 96-minute flight is 2.5 MB), 200,000 fixes per track, 4 tracks, 500 DFPs, and fixed lengths for names (80 characters) and notes (2,000). Anything over is refused with a message, before any work is done.
- **No entity expansion or external references.** The reader never expands `<!ENTITY>` and refuses a file with a `<!DOCTYPE>`, which a ForeFlight KML never has. A KMZ (zip) is recognised and refused with "export as KML".
- **Nothing from a file is ever put into `innerHTML`.** Names, notes and status text reach the page only through `textContent` or the ui-kit's `h()`. `flight-data` returns plain strings and numbers and never touches the page.
- **The debrief file is checked field by field against an allowlist:** unknown fields are dropped, numbers must be finite and in range, strings are length-capped. `JSON.parse` failures and bad shapes give one plain message, never a stack trace.
- **Only what's needed is read.** Pilot name, tail number and notes in a KML are not read or stored.

## Commands

```
npm test                                       # unit + golden tests (node --test)
python3 tools/rebuild_original.py /tmp/v6.html # V6 for the browser recording below
NODE_PATH=$(npm root -g) node tests/golden/checks/record-flight-data.cjs /tmp/v6.html
```

## Project structure

```
src/flight-data/   README.md kml.js clean.js flight.js clock.js debrief-file.js examples.js
tests/unit/flight-data/   *.test.js   meaning: gaps, dropped fixes, clock, file checks, abuse cases
tests/golden/      flight-data-*.test.js   V6 vs flight-data
                   v6-flight-data.json     V6's parse results recorded in Chromium
                   checks/record-flight-data.cjs   the recorder
tests/fixtures/flight-data/   small hand-made KML files (edge cases, broken files)
```

The four example tracks are read from `original/assets/` by the tests. Patrick's own track is used for local checks only and is **not** committed to the repository.

## Code style

As in `core`: plain ES modules, pure functions, units in names, a comment naming the V6 line each ported piece came from.

```js
/** Straight-line position between the fixes around time t (V6 interpTrack, line 2430). */
export function sampleAt(track, t) { ... }
```

## Testing strategy

1. **Golden, parsing.** V6's `parseKmlText` needs the browser's XML parser, so a recorder runs it in Chromium on the four example tracks, Patrick's track and the edge-case fixtures, and saves a fingerprint of every point plus a few hundred sample points in `tests/golden/v6-flight-data.json`. The golden test checks that `readKml` gives identical points (before C1 to C5). Patrick's track's fingerprint is committed, not the track.
2. **Golden, everything after parsing.** V6's `projectAll`, `interpTrack`, `headingAtTrack`, `aircraftPitchAtTrack` and `estimatedGAtTrack` run unchanged in Node (via `tests/golden/v6-source.js`) on the same points, at a few thousand seeded times across the example flight, and must match exactly.
3. **Each change (C1 to C10) is its own commit** that flips the golden expectation it touches and adds a unit test saying what it now means.
4. **Unit tests** for meaning and abuse cases: gap and jump rules on the real tracks, a 1970 timestamp, too many fixes, a DOCTYPE bomb, a KMZ, a truncated file, a debrief file with extra fields or a 10 MB note, every clock control.
5. **Mutation check** as in `core`: the tests must turn red when a threshold, a sign or a boundary is changed on purpose.

## Boundaries

- **Always:** pin V6 before changing; keep 5 s and 450 kt as named constants; run `npm test` before each commit; treat every file as hostile.
- **Ask first:** any change to a number beyond C1 to C10; adding a package; changing the debrief file format once people have saved files.
- **Never:** edit `original/` or `src/core/` (core changes go to the Flight math core thread); commit Patrick's own track; put file content into `innerHTML`.

## Success criteria

- The example flight and Patrick's track load, clean and play with a correct status (R11).
- The golden tests pass for V6's behaviour, and each of C1 to C10 is a separate, tested change.
- No −100,000 m fix, no segment over 450 kt, and no line drawn across a gap of more than 5 s on any of the five real tracks.
- A saved debrief reopens with the same tracks, DFPs and settings (R17).
- Every abuse case in the unit tests is refused with a readable message.

## Plan

PR 1 ports V6's reading, projection and sampling under golden tests. PR 2 adds C1 to C10, one commit each. PR 3 adds the clock and the debrief file. The tasks go in `tasks/flight-data/` once this spec is approved.

## Open questions

None. Q32 (recorded pitch and G on #3 and #4) was answered by Patrick on 2026-09-30 and is change C10.

## Future idea, not in this module

Calibrating the iPad against a stretch "on the runway" or "straight and level" (Patrick, Q32). Checked on #3 and #4: a fixed offset can't rescue their recorded pitch, because it doesn't follow the aircraft's climb and dive at all, and it moves by up to 13.5° (standard deviation) while parked. Recorded G is already within 0.01 to 0.02 of 1 G in level flight, but reads 0.94 on #3's ramp, so a ramp calibration would make it worse. It could work for an iPad on a fixed mount; it needs a track from one to test.
