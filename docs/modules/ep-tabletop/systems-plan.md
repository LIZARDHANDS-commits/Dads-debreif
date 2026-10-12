# EP Tabletop: refactor and build plan for Dad's 12 Oct asks

> **Status:** the detailed design for plan Steps 3 to 8 (Dad's asks of 12 Oct 2026). Patrick said yes to building it as soon as it was ready (relayed by Dad, 12 Oct 2026). Its questions Q1 to Q8 are EP-Q5 to EP-Q12 in the README, and its phases 1, 2, 3a, 3b, 4 and 5 are plan Steps 3 to 8. Phase 0 (this docs change) is done. Where this file and `spec.md` or `decisions.md` disagree, those win and this file gets fixed.


Architecture review, Fable, 12 Oct 2026. Read-only: nothing in the repo was changed. Reviewed on branch `claude/ep-tabletop-phone` at V2.384 (Step 1, the one screen; Step 2, the instructor's phone by QR code).

**Who this is for.** An Opus agent carries it out phase by phase, each phase one pull request. Patrick and Dad read it to say yes or no. Software words are explained the first time they appear.

**What Dad asked for (12 Oct 2026, his words):** "Certain pressures should trigger a light.. certain conditions that an ip can prompt should trigger instruments and visual cues. student should be able to see their plan as they go, so if they make a wrong choice they see it go off the rails. instructors can pause, rewind, make things better or worse if the student IDs it or not." And earlier the same day (now on `future.md`): "the Student should have a decision selection screen... turn to the nearest suitable airfield. Zoom. fly straight. almost like a huge list so the EP table starts moving until the instructor pauses again to inject more."

**The one-line answer.** Today the instructor types gauge readings; the aircraft is a still picture. The plan turns that round: the instructor sets a *cause* (an oil leak, a chip, a fire), the gauges and lights follow from the cause, the student picks what to do from a list of plain manoeuvre words, the aircraft flies it on the shared T-6 flight model, and the student watches their plan work or run short on a small map. The instructor can pause, go back in time, and turn the cause up or down. Six pull requests, in the order below, with Patrick's yes on the flight approach before any flying code is written.

---

## 1. Where the code stands today (what each file does, so nothing is lost)

The rule book says: before deleting or rewriting code, list what it did. All in `src/modules/ep-tabletop/` unless said.

| File | Lines | What it does now | What it becomes | Risk of the change |
|---|---|---|---|---|
| `scenario.js` | 193 | The scenario engine, pure (every function returns a new session; the old one is never changed, which is what makes rewind cheap later). Holds the clock, the A-A-B-C-D-E-F step, `shown` (every indication's value, typed in), `revealed`, `pending` edits, developments by time / step / tap, FEVER and TCCC prompts, marks, notes, Declare boxes and the log. | Stays the heart. `shown` stops being a typed-in table and becomes *derived*: healthy baseline + what the faults do + the instructor's overrides. Gains `faults`, `flight`, `picks` and `history`. The outside shape (`startSession`, `act`, `advance`, `panelOf`, `settingOf`) is kept so the test and the screens keep working. | Medium. Both existing tests go through `settingOf` and `panelOf`; keep those names and the test keeps passing without being touched. |
| `scenarios.js` | 78 | One example scenario, "Engine roughness in the area": a healthy PT6A-68 cruise panel (`CRUISE_ENGINE`), the start, two developments that set indications directly (fuel flow ±40 pph; chip light at Boldface). | Developments set *faults* (`fault: { kind: 'chip' }`) as well as indications; the start gains a structured wind, a weight and a configuration for the flight model. | Low. Old-style developments (direct `set`) keep working as overrides. |
| `indications.js` | 97 | The catalogue of what can be set and asked about (engine numbers, lights, words, flight instruments), their labels and units, the words for a value, and `hudOf(panel)` which turns a panel into the shared cockpit's numbers (always `g: 1, vsFpm: 0` today). | Keeps the catalogue. `hudOf` takes G and vertical speed from the flight model and lights a flickering lamp on and off by the clock. | Low. |
| `student-view.js` | 133 | `studentView(session)`: the one function that makes the student's side (EP-9), and `cleanStudentView(raw)`: checks and clamps one arriving over the link (untrusted). | Gains the live flight state, the student's own picks and plan, and the cue flags (smoke, glow, shake); `cleanStudentView` checks the new fields the same way. | Medium. The EP-2 leak test must be extended to the new fields in the same change (the one test of Phase 1). |
| `console.js` | 190 | The instructor's console, one function: time and steps, every indication with Reveal and an edit box, Apply/Undo, the next development with Now/Later/+Add, prompts, marks, notes, Declare boxes. | Split by section (see Phase 1) and gains a Faults section (cause, severity dial, Better/Worse, "student identified it"), a Student picks list, a timeline with Rewind. | Low: screen only. The split is file moves; nothing changes in what the buttons do. |
| `index.js` | 382 | Picks the screen from the address (`?console&s=..&k=..` opens the phone's console). `mountScreen`: the student's screen, the Instructor switch, the QR code and the link, the clock on the shell's scheduler. `mountPhone`: the console on the phone, the scenario running there, sending only the student view. | Splits into `screen.js` (the student's screen), `phone.js` (the phone), and a short `index.js` that only picks. The student's decision list and plan map are new files. | Medium: it is the place most things meet. Done as file moves first, then additions. |
| `link.js` | 200 | One interface, `createLink`, the relay mailbox: the phone PUTs the student view at most twice a second plus a heartbeat every 4 s; the screen GETs once a second; "lost" after 10 s. Session id and key are 128 random bits each. | Generalised to one *mailbox* per direction, so the student's picks can go the other way (Phase 5). | Medium: no network in tests, so it is checked by hand on a phone. |
| `world3d.js` | 237 | The 3D view: the shared CT-156 cockpit with live engine displays over the shared Moose Jaw ground, sky and runways; drag to look, double-click to boresight, Shift to zoom. A picture only: `setPose` places the aircraft where it is told. | Unchanged except a few lines: `setPose` takes a small shake offset. No new 3D things (rule book: no 3D polish in a module still being built). | Low. |
| `ep-tabletop.css` | 138 | Layout and look. | Gains the cue overlays (a grey haze, an orange glow) and the decision list's layout. | Low. |
| `src/ui-kit/ct156-cockpit.js` | 2,850 (shared) | `liveEngine` option: engine displays, caution panel and the three lip lamps drawn from `hud.engine` (`ENGINE_LIVE` numbers and `lights`); without it, the other sims' cockpit is pixel for pixel as before. | **Untouched.** Flicker is done by the caller putting a light in or out of `lights` each redraw. | None. |
| `relay/ep-link.js` | 183 | The mailbox: GET (no key), PUT with key (first PUT keeps the key's hash), DELETE with key; 6-hour expiry; 16 KB cap; the shared allowed origins. | **No code change needed** for the return path (section 6). One doc line. | None. |
| `tests/unit/ep-tabletop/scenario.test.js` | 57 | A development reaches the panel only at its time, step or Apply; a pause stops the clock. | Kept as is. | — |
| `tests/unit/ep-tabletop/student-view.test.js` | 68 | The student view never carries the setup (EP-2). | Extended to the new fields (Phase 1's one test is a sibling check, see below). | — |

**What Traffic and the Formation sim do that this plan reuses, never copies:**
- The Formation sim's live Lead (`src/modules/turn-sim/live/fluid-lead.js`) flies on the shared point mass (`core/point-mass.js` `stepPointMass`: an aircraft as a point with a velocity, flown by G and bank) with the T-6's thrust and drag (`core/t6-performance.js` `t6aExcessFn`). Each button is a small "pilot" that asks for a G and a bank every step, G building no faster than the core's onset limit and roll inside `rollWithinT6A`. **This is the pattern the EP manoeuvres follow.**
- Traffic's PFL (`src/modules/traffic/pfl-geometry.js`, `pfl-flight.js`) glides on `glideDragPerWeight` (power off, by configuration), zooms with `zoomPitchStep`, and draws a wind-shifted glide ring (`glideFootprint`: the ring's centre moved downwind by the glide's time). The glide footprint is tied to Traffic's own field elevation and PFL numbers today; this plan moves the formula to core so both read one copy (section 4.3).

---

## 2. The systems model (Dad: "certain pressures should trigger a light")

**Idea in one sentence.** The instructor sets causes; the gauges follow from the causes by time; the lights follow from the gauges by thresholds; the instructor can still type over any gauge (today's way) and that wins.

### 2.1 The data model

A new pure file, `src/modules/ep-tabletop/systems.js` (pure means: numbers in, numbers out, no screen and no clock of its own, so it can be re-run for any moment, which rewind needs).

```
fault = { id, kind, severity, startedAtS, trend, params }
  kind:       'oilLeak' | 'chip' | 'fuelImbalance' | 'fire' | 'genFail' | 'roughness' | 'engineFail' | 'hydLeak' | 'fuelLeak'
  severity:   0 to 1, the instructor's dial (0.5 by default). Sets how fast and how far the gauge moves.
  startedAtS: scenario clock when it began. Gauges move as a function of (clockS - startedAtS) and severity.
  trend:      'worsening' | 'steady' | 'improving' (Better / Worse, section 5)
  params:     per kind, for example fuelImbalance { side: 'L' }
```

A session gains `faults: fault[]` and `overrides: { key: value }` (what today's `shown` edits become). The healthy baseline is the scenario's start (today's `CRUISE_ENGINE`).

```
shownOf(session) = overrides  over  lightsOf(gauges)  over  gauges
  where gauges = gaugesOf(baseline, faults, clockS, flight)
```

- `gaugesOf` works each fault's effect on the engine numbers: an oil leak takes oil pressure down from the baseline toward zero over a time set by severity, and oil temperature up; a fuel imbalance moves fuel from one tank's reading to the difference; a generator failure takes volts to the battery's and amps to zero; roughness puts a swing (today's `{ v, swing }`) on fuel flow, torque and Np; an engine failure takes torque, N1, ITT and fuel flow toward their idle-or-zero values and tells the flight model the engine is out. Every rate is an *estimate* until Patrick rules on how fast each should run (he knows what a "slow leak" looks like); each lives in one table, `FAULT_EFFECTS`, with its source column.
- `lightsOf(gauges)` lights each caution or warning from a threshold on a gauge (table in section 2.3), and lights MASTER CAUTION whenever any caution-panel light is lit and MASTER WARN with FIRE. An instructor's override on a light wins (today's tick box).
- `overrides` is exactly today's typed-in values, kept so nothing the instructor could do before is lost. Today's `stage`, `apply`, `discard` actions write to `overrides`.

**Why derived, not stored:** the gauges at any moment are a function of (faults, clock), so going back in time means re-reading the function, not keeping a copy of every gauge every second; and the student view keeps being made by one pure function, so nothing new can leak.

### 2.2 How the pieces read it

- `scenario.js`: `settingOf(s, key)` and `panelOf(s)` call `shownOf(s)` instead of reading `s.shown`. `advance` moves the clock; nothing else is needed, the gauges follow. Developments may carry `fault: {...}` (adds a fault) or `faultChange: { id, severity, trend }` as well as today's `set`. New actions: `addFault`, `setFault { id, severity, trend }`, `clearFault`.
- `student-view.js`: `panel: panelOf(s).set` as today; the student only ever gets the revealed, derived values. The student view never carries a fault, a severity or a trend (add these words to the EP-2 test's forbidden list).
- The shared cockpit: unchanged. `hudOf(panel)` already turns revealed numbers and lit lights into `hud.engine`.
- The console: a new Faults section (cause picker, severity slider, trend buttons) above today's Indications section, which stays for typing over any value.

### 2.3 The lights and their thresholds (every one needs a source)

The manuals were not mounted for this review, so **no cite below is a manual cite**. "Needs a page" means the executor must ask Patrick for the page (or Patrick rules the number) before the number is written as anything but an estimate; it is shown on the console as "(estimate)" until then. Values from `docs/references/open-source-performance-baseline.md` (ALL-30) are marked "baseline".

| Light (shared cockpit's name) | Follows | Working estimate | Source status |
|---|---|---|---|
| OIL PX | oil pressure low | below 90 psi, the bottom of the normal 90-120 psi range (baseline); real caution threshold likely lower | **needs a page** (CT-156 systems chapter, oil system cautions) |
| CHIP | event: the fault 'chip' | on when set | event, no threshold; the fault itself is the source |
| FIRE (lip lamp) | event: the fault 'fire' | on when set | event |
| MASTER WARN | any warning (FIRE) | with FIRE | the lip lamp logic; **needs a page** for what else is a warning |
| MASTER CAUTION | any caution-panel light | with any caution | panel logic; **needs a page** |
| FUEL BAL | fuel difference between tanks | estimate: difference above 50 lb for more than 2 min | **needs a page** (AI recollection, flagged as such) |
| L FUEL LO, R FUEL LO | tank below a level | estimate: 110 lb | **needs a page** (AI recollection) |
| FUEL PX | fuel pressure low (motive flow) | event with 'fuelLeak' or boost pump | **needs a page** |
| GEN | generator off line | event with 'genFail'; volts fall to about 24 V (battery, estimate), amps to 0 | **needs a page** for the bus volts |
| GEN BUS, BAT BUS, BUS TIE | bus state | out of scope until GEN is sourced | — |
| HYDR FL LO | hydraulic fluid low | event with 'hydLeak'; pressure then falls | **needs a page** for the pressure the light follows, if any |
| PMU FAIL, PMU STATUS | event | instructor-set only, no model | — |
| ITT red band | ITT above 820 °C | 820 °C max continuous (baseline, and already in `ENGINE_LIVE`'s bands) | baseline |
| N1 red band | N1 above 104 % | 104 % max take-off (baseline, already in `ENGINE_LIVE`) | baseline |
| Torque | above 100 %; 131 % for 20 s transient | baseline | baseline |
| Np | 100 % = 1,995 rpm (baseline); any light? | none modelled | — |

Rule-book reminder for the executor: these are **references flagged on screen, never walls**. A light coming on never stops the gauge moving on.

---

## 3. Visual cues (Dad: "trigger instruments and visual cues")

Which cues, where they live, and how they stay light. The rule book says the 3D view is a bonus and **no 3D polish in a module still being built**, so everything below stays out of `world3d.js` except one small offset.

| Cue | Triggered by | Where it is drawn | How, and why it is light |
|---|---|---|---|
| Words (smoke, flames, oil on the windscreen, roughness, noises) | the fault (automatic words by kind and severity) or the instructor's typing | the Revealed list, as today | exists; the fault writes the default words into `cue.*`, the instructor can overwrite |
| Light that flickers | a fault's `flicker: true` (for example a GEN light flickering before it fails) or the instructor's tick | the shared cockpit's lamp, by the caller | `hudOf` puts the light in or out of `hud.engine.lights` by `Math.floor(clockS × rate) % 2`; the cockpit redraws at most every 200 ms (`PANEL_REDRAW_MS`) so 2 to 3 a second is the ceiling; no cockpit code changes |
| Vibration / roughness | fault 'roughness', amplitude from severity | the cockpit camera | `world3d.setPose` adds a tiny head offset (a few tenths of a degree) that swings with the clock; stops when time stands still; **the only `world3d.js` change** |
| Smoke or fumes in the cockpit | fault 'fire' or 'smoke', or the instructor | a CSS overlay over the 3D canvas (a grey, half-see-through layer), opacity from severity | pure CSS and one class toggle on the student's screen; no 3D |
| Fire glow | fault 'fire' | a CSS overlay, an orange glow at the lower left edge of the view | as above |
| Smoke trail or flames outside the aircraft, oil streaks on the windscreen drawn in 3D | — | **not built**; goes on `future.md` as "3D cues" for after sign-off | rule book: no 3D polish now |

The student sees a cue only when it is revealed (words) or when the instructor applies it (overlays and shake go through `pending` and Apply like any indication, so the student never sees a cue half-made, EP-R4). The student view carries them as `cues: { haze: 0..1, glow: 0..1, shakeDeg: number, flicker: [light names] }`, cleaned and clamped by `cleanStudentView`.

---

## 4. The student's decisions and the aircraft moving

### 4.1 The decision list (controlled content, EP-3)

A long list of **plain manoeuvre words**, on the student's screen, enabled once time runs. Never boldface or checklist words, never their numbers, and nothing marks a choice right or wrong: the consequences show it. The instructor can trim or add to the list per scenario (console, Phase 3b).

Starting list (words only; the executor must not add numbers to the labels):

- Fly straight and level · Turn left to a heading · Turn right to a heading · Turn toward the nearest suitable field · Turn toward [a named field]
- Climb · Descend · Zoom (trade speed for height) · Glide at best glide · Slow down · Speed up
- Gear down · Gear up · Flaps take-off · Flaps landing · Flaps up
- Orbit here · Set up a forced-landing pattern (High Key over the chosen field)
- Declare (marks Declare on the step track; the words go in the Declare boxes) · Eject (ends the flight)

"Turn toward the nearest suitable field" picks the field for them from the airfield list (section 4.4) by the plain rule Patrick gives (Q2 below). The list is data, `manoeuvres.js`, each with an id, its words, which fields it needs (a heading, a field), and the pilot that flies it.

### 4.2 The flight approach (written before any code, as the rule book requires)

**The aircraft is a point mass flown by G and bank, on the shared core; each manoeuvre is a small pilot that asks for G, bank and a throttle setting every step.** This is exactly how the Formation sim's live Lead flies (`fluid-lead.js`) and how Traffic's PFL glides; the EP Tabletop adds no formula of its own.

- **Step:** `stepPointMass(state, { g, bankRad }, dt, excessFn)` (`core/point-mass.js`), at a fixed step of 0.05 s inside each frame, deterministic (same inputs, same path, which rewind and the two-screen link both need).
- **Thrust and drag:** `excessFn` from the systems model's engine state:
  - engine healthy, at a throttle 0 to 1: `excessFnFor(throttle)` (`core/t6-performance.js`; thrust scales, drag does not);
  - engine failed: power off and the configuration's drag, `-glideDragPerWeight(config, kias, alt, g)` (core) with the prop feathered (today's core numbers; the windmilling row of `T6A_GLIDE` is there if Patrick wants an unfeathered case);
  - engine rough: healthy thrust times (1 - a fraction from severity), with the swing that the gauges already show. The fraction is an estimate; Patrick's ruling wanted.
  - **One small core addition**, listed in `docs/modules/shared/flight-math.md` in the same change: `excessFnFor(throttle, { config = 'clean', engineOut = false })`, so the engine-out case is the same callback shape and nobody writes `-glideDragPerWeight(...)` inline a second time (today `flyZoomT6A` has its own inline `engineOff`, clean only; the executor should make it call the new helper too).
- **Speeds:** the model flies true airspeed; the gauge shows indicated via `tasToIasKt` (core); every comparison names its kind. The scenario's `kias` start becomes KTAS with `iasToTasKt(kias, altFt)`.
- **Roll and G onset:** `easeValue` (core) toward the pilot's bank and G, inside `rollWithinT6A` and `T6A_G_ONSET` (core).
- **Turns:** bank from the manoeuvre (30° gentle by default, an estimate; the forced-landing pattern at Traffic's `PFL.maxBankDeg` 60°, Patrick's ruling) and the turn rate falls out of the point mass; nothing computes radius separately.
- **Climb / descend:** a pitch target (the Formation sim's 15° estimate for Lead; for the EP a gentler 5° to 10°, an estimate) held with `dampedClimbG` (core).
- **Zoom:** the reference zoom as `flyZoomT6A` and Traffic's `zoomPitchStep` fly it (2 G pull to 20° nose up, through 145 KIAS, capture 125 KIAS, reference data; zoom only above 150 KIAS, Patrick C7). The EP flies it live step by step with the same numbers from core's `ZOOM_GAIN_TABLE`/`flyZoomT6A` constants; if `zoomPitchStep` is the cleaner shape, move it from Traffic to core first, don't copy it.
- **Glide at best glide:** hold 125 KIAS clean, 120 gear down (Patrick's C1; `PFL.glideCleanKias/glideGearKias` in Traffic's `pfl-geometry.js`; `T6A_GLIDE` in core says 125 clean, 105 gear down from the reference data: write both down, the executor uses Patrick's 125/120 and says so).
- **Slow down / speed up:** throttle to idle or max with level flight (`g = 1/cos(bank)`) until the target speed, then hold.
- **Wind:** the scenario's `wind: { fromDegT, kt }` as a vector (`windVectorFtps`, core) added to the air-mass velocity for the ground track; `windTriangle` (core) for the heading that holds a track toward a field. Headings magnetic on the panel (the 9° E of EP-7/TR-65).
- **Stall and physical limits:** speed never below the 1 G stall for the configuration (`stallLimitG`, `T6A_LIMITS.stallKias` 86, Patrick 30 Sep); if a pilot asks for more G than the wing gives, `availableG` caps it (a physical limit, which always holds). Published limits (VMO 316, 7 G) are flagged on the console, never walls.
- **The ground:** at the field's elevation (`airportElevationFt`, OurAirports) the flight ends: on a runway within its length and width, "landed"; elsewhere, "touched down off the runway" with where. The student sees the outcome in words; nothing says right or wrong.
- **The glide ring, as built in Step 5:** imported from Traffic for now (`calculateGlideFootprint` in `src/modules/traffic/pfl-geometry.js`), unchanged and without touching Traffic's files while Patrick's sessions are active; the rule book allows a module to import another's file when moving it isn't worth it. Moving it to core (section 4.3) stays the later preference.
- **Who runs it:** the scenario's master (the phone in phone mode, the screen in one-screen mode) runs the flight inside `advance`. The student view carries the flight state (position, altitude, KTAS and KIAS, heading, bank, pitch, climb rate, G) and the active manoeuvre. Between the phone's sends (at most twice a second) the student's screen **runs the same pure model from the last state it received**, so the picture is smooth; when the phone's next state arrives, the screen snaps to it (the phone is the master, EP-9). If that looks steppy in the room, the simpler fallback is to ease between received states; both are tool choices, not flying choices. **As built in Step 5:** the simpler way, the screen carries the phone's last state on by dead reckoning (its ground velocity, climb rate and turn rate, for at most 1 s) and takes the next state when it comes; running the model on the screen would need the engine's state, which is a cause and never reaches the student view (EP-2, EP-11).

### 4.3 The student's plan on screen (Dad: "see their plan as they go... see it go off the rails")

A small 2D map beside the step track (`plan-map.js`, canvas, north up): the aircraft, its track so far, the fields within reach (names, runway lines), and **the glide ring** around the aircraft: how far it could glide power off from here, shifted downwind.

- The ring is **Traffic's `glideFootprint` formula**, which must move to core (`core/t6-performance.js` or a new `core/glide.js`) with the field elevation, configuration and speeds as inputs, and Traffic's `pfl-geometry.js` then calls the core copy. This is already on the "flight math still inside the Traffic sim" list in `flight-math.md`; the move gets its line there in the same change. No second copy.
- With the engine running the ring still shows (what if it quits now?) in a fainter line; with the engine out it is solid and shrinks as height goes. A field inside the ring is reachable; the student watches it slip outside when they turn away or orbit too long. That is "off the rails" shown, not told.
- The line to the chosen field (bearing and distance, `legOffsetsFt`/`compassDegFromVector`, core) is drawn when the student has picked a field.
- The HSI bearing pointer in the shared cockpit is a later option (Q3): it needs a cockpit change, which this plan avoids until Patrick asks.

### 4.4 Fields

From `src/airfields/airports-data.js` (OurAirports: `AIRPORTS` with runways, lengths, surfaces and elevations; 33 entries round Moose Jaw). "Suitable" is Patrick's rule (Q2): the working answer is a paved runway of at least a length he names. Nothing in the list is marked right.

### 4.5 Numbers this part needs (table in section 9)

T-6 glide data and speeds are already in core with their sources; the open ones are the engine-rough thrust fraction, the gentle climb pitch, the default bank, the "suitable" runway length and the fault rates.

---

## 5. Instructor controls (Dad: "pause, rewind, make things better or worse if the student IDs it or not")

- **Pause** exists (EP-5).
- **Rewind.** Because every change makes a new session and never edits the old one, a timeline is just the list of past sessions. `timeline.js` keeps a *snapshot* (a saved copy of the session at a moment) at every instructor action and every 5 s of scenario time, and can rebuild any moment in between by re-running `advance` from the nearest earlier snapshot (deterministic). Rewind to a moment: the session becomes that snapshot, with the log kept whole and one new line "Rewound to m:ss" (the debrief should show what was undone). The console shows the timeline as a strip with the picks and developments marked; tap to rewind. Snapshots are small (a session is a few KB; the flight state is a dozen numbers; the track so far is kept as a short list of points thinned to one every 2 s), so a 2-hour session is a few MB at most.
  - **Does not leak:** the student view is still made by the one pure function from whatever session is current, so a rewound session shows the student exactly what they saw then and nothing about what came after (EP-2, EP-9). The one test of Phase 4 proves it.
  - **What rewinds and what stays:** the clock, step, gauges, lights, faults, flight and picks go back; the log, marks and notes stay (they are the instructor's record). Whether `revealed` goes back is Q4 (recommend it stays: the student can't un-know a reading).
- **Better / worse.** Each fault has the severity dial (0 to 1) and a trend. "Worse" steps severity up and sets the trend worsening; "Better" the other way; "Hold" freezes it. Beside the fault, a tick "Student identified it" (goes in the log and marks, never to the student). Nothing happens automatically on the tick: the instructor decides (Q5), so the tool never grades a student's call.
- **Developments tied to the student's calls.** A development's `at` gains two new kinds beside time/step/tap: `{ onPick: '<manoeuvre id>' }` (fires when the student picks that manoeuvre, for example the fire goes out when they shut down... written as a cause change, never as checklist words) and `{ onIdentified: true }`. The console's Now/Later/+Add works on them as today.
- **Inject while paused:** exists (stage, Apply, +Add). Faults join it: a fault staged while paused appears on Apply or Resume.

---

## 6. The link back (the student's picks reaching the phone)

Today the link runs phone to screen only: the phone PUTs with the key, the screen GETs without one (EP-8, EP-10). The student's picks must go the other way.

**Smallest return path: a second mailbox, same relay, no relay code change.** The screen, which already makes the session id and the key for the QR code, makes a second session id `r` and puts it in the QR address: `#/ep-tabletop?console&s=<session>&k=<key>&r=<return>`. The screen PUTs the picks to `/ep-link?s=<return>` with the same key (the screen knows the key: it made the QR); the phone GETs `/ep-link?s=<return>` once a second. The relay serves any well-formed session id with any JSON object under 16 KB, so it needs nothing new; one line in `relay/README.md` says the mailbox now also carries the picks. The QR address grows from about 126 to about 151 characters; `qr.js` makes codes to version 10 (213 bytes at level M), so it fits with room.

- Why a second *id* and not a second write into the same mailbox: last writer wins in a mailbox; two writers would clobber each other.
- Why the same key: the screen already holds the key, so a second key would add nothing against a third party (the relay refuses anyone without it) and would lengthen the code. A separate key is the option if Patrick prefers the two directions to be unlinkable; it is a tool choice, not a flying one.
- **The message:** `{ format: 1, seq: n, picks: [{ seq, clockS, manoeuvre, headingDegM?, fieldIcao? }] }`, the last 20 picks, so a missed poll loses nothing. The phone applies only picks with `seq` above the last it took.
- **Untrusted:** `cleanPicks(raw)` on the phone keeps only known manoeuvre ids from `manoeuvres.js`, clamps headings to 0-360, fields to a 3-4 character upper-case id from the airfield list, seq to an integer, and caps the list; anything else is dropped. Everything drawn on the phone is text. The allowed origins stay the relay's own list (never "allow all").
- **Drop handling:** as the forward link: the screen says "Picks not reaching the instructor" after 10 s of failed PUTs and keeps them to send; the phone's console shows the time of the last pick it saw.
- In one-screen mode the picks go straight into the local session; no network.
- The direct link (WebRTC, EP-Q4) stays unbuilt; `createLink` becomes `createMailbox({ role: 'write' | 'read', session, key, ... })` and the screen composes one of each, so option (a) still has one seam to plug into.

---

## 7. The phases (one pull request each)

Order: systems model and refactor (1), lights and cues (2), decisions and flight (3a core and engine, 3b screen), rewind and better/worse (4), the link back (5), docs and sign-off (6). **One change from the brief's order:** Phase 0 is a docs-only pull request first, because the rule book says how a module's aircraft are driven is settled in its spec and decisions before coding, and Phase 3 cannot start without Patrick's yes on section 4.2. Phase 3b (the student's list) works in one-screen mode before Phase 5 and is checked there; phone mode for picks comes with Phase 5.

Every brief copies the testing lines from `AGENTS.md`, "Testing", in full, and says "read `AGENTS.md` and `docs/modules/ep-tabletop/` first; search `docs/modules/shared/flight-math.md` and `src/core/` for existing flight math before writing new".

### Phase 0. Write it down: spec, decisions, plan (docs only)

- **Goal:** the flight approach (section 4.2), the systems model (section 2), the cues (3), the controls (5) and the return path (6) written into `spec.md`; new decisions EP-11 onward in `decisions.md` with "wording not yet confirmed with Patrick" until he says yes; Dad's two asks moved from `future.md` onto `plan.md` as Steps 3 to 7 (the present Step 3 "Scenarios and log" and Step 4 "Sign-off" renumber after them); the thresholds table (2.3) and the numbers table (9) in `spec.md` or a new `numbers.md` in the module folder; the questions (8) on the README's open-questions table and the one waiting list in `docs/PLAN.md`.
- **Files:** `docs/modules/ep-tabletop/*`, `docs/PLAN.md` (waiting list), `docs/FUTURE.md` only if something whole-tool moves.
- **Must not touch:** any code.
- **Decisions from Patrick first:** none to start; the pull request *is* what he approves. Q1 (the flight approach) gates Phase 3.
- **Test:** none (docs).
- **Check on screen:** none.
- **Model:** Sonnet, medium.

### Phase 1. The systems model and the refactor

- **Goal:** `systems.js` (faults, `gaugesOf`, `lightsOf`, `shownOf`, the `FAULT_EFFECTS` and `LIGHT_THRESHOLDS` tables with a source column, every unsourced number marked estimate); `scenario.js` reads `shownOf` and gains `addFault`, `setFault`, `clearFault`, overrides in place of `shown`; `scenarios.js`'s chip development becomes a fault, and a second example "Oil pressure dropping on departure" uses an oil leak (the spec's list); the console gains the Faults section and is split into `console.js` (frame and update), `console-time.js`, `console-indications.js`, `console-faults.js`, `console-marks.js`; `index.js` splits into `index.js`, `screen.js`, `phone.js` as plain moves. The student view's forbidden words gain fault, severity, trend (the existing EP-2 test extended in the same change; that is the file's one test, not a new one).
- **Files:** `src/modules/ep-tabletop/*` (no new flight code), `tests/unit/ep-tabletop/systems.test.js` (new), `tests/unit/ep-tabletop/student-view.test.js` (extended), module README, `docs/modules/ep-tabletop/decisions.md` (EP-11 files column).
- **Must not touch:** `src/ui-kit/ct156-cockpit.js`, `src/core/*`, `world3d.js`, `relay/*`, `link.js`.
- **Decisions from Patrick first:** none that stop it (thresholds run as estimates, flagged "(estimate)" on the console, per the rule "open questions don't stop the work"). Q6 asked in parallel.
- **The one test** (`systems.test.js`): *with an oil leak set at the start, the oil pressure is at its healthy value before the leak, falls as the clock runs, the OIL PX light is dark while the pressure is above its threshold, comes on once the pressure has fallen through it, and stays on afterwards; MASTER CAUTION comes on with it; the instructor typing a pressure over it wins.* Expected values: the scenario's healthy baseline (baseline document, 90-120 psi) and the threshold constant *named from the table with its source status*, never read back from the code's output. No time gate: the test advances the clock in generous steps until the light is on and only checks the order of events (dark above, lit below, stays lit). Can fail: if `lightsOf` read the wrong gauge or the light went out again, it fails.
- **Check on screen:** from the default start, one-screen mode: the Instructor switch, add "Oil leak" at severity 0.5, reveal oil pressure, Start: the needle falls, OIL PX and MASTER CAUTION light when it crosses the threshold; the student sees only the needle and the lights. Type 100 psi over it: the needle jumps back, lights go out. Default cockpit elsewhere (Debrief, Formation) unchanged: it does not import anything new.
- **Model:** Opus, medium (restructures the engine the flight code builds on; no flight maths).

### Phase 2. Lights that flicker and the visual cues

- **Goal:** flicker (`hudOf` by clock), shake (`world3d.setPose` offset, a few lines), haze and glow CSS overlays on the student's screen, default cue words per fault kind, cue controls on the console (prompt or set each; they go through pending and Apply), `cues` in the student view and `cleanStudentView`.
- **Files:** `indications.js`, `systems.js` (cue words), `screen.js`, `ep-tabletop.css`, `console-indications.js` or a new `console-cues.js`, `student-view.js`, `world3d.js` (setPose only), `tests/unit/ep-tabletop/student-view.test.js` (forbidden words gain the unrevealed cue words; still the file's one test).
- **Must not touch:** `ct156-cockpit.js`, `core/*`, anything 3D beyond the offset, `relay/*`, `link.js`.
- **Decisions from Patrick first:** none. Note on the pull request that 3D cues went to `future.md`.
- **The one test** (extend `student-view.test.js`): *a fire fault lights FIRE and MASTER WARN together; the glow and haze reach the student view only once applied, and a cue not yet applied is not in it.* Expected values: the fault table (event) and sentinel words typed in the test.
- **Check on screen:** set a fire fault, Apply: the FIRE lip lamp and MASTER WARN light, the orange glow and a little haze appear; pause: the flicker and shake stop ("time stands still"). Hide the console: nothing of the setup is on the student's side.
- **Model:** Sonnet, medium.

### Phase 3a. The aircraft flies the picks (engine and core)

- **Goal:** `flight.js` (the point-mass aircraft on the shared core, the engine state from `systems.js`, wind, the ground); `manoeuvres.js` (the list as data, each with its pilot asking for G, bank and throttle); `scenario.js` gains `flight`, `picks`, the `pick` action, developments `onPick`; the core gains `excessFnFor(throttle, { config, engineOut })` and the moved `glideFootprint` (Traffic's `pfl-geometry.js` calls the core copy; before-and-after check that Traffic's glide ring is drawn the same), each listed in `flight-math.md`. `hudOf` takes G and climb rate from the flight. The student view carries the flight state and the active manoeuvre; `cleanStudentView` checks them. No screen for the student yet beyond the panel moving (the console gets a plain "Pick for the student" list so it can be driven and seen in one-screen mode).
- **Files:** `src/modules/ep-tabletop/flight.js`, `manoeuvres.js`, `scenario.js`, `scenarios.js` (wind, weight, configuration), `indications.js`, `student-view.js`, `console-*.js` (the pick list for the instructor), `src/core/t6-performance.js` (the two shared additions), `src/modules/traffic/pfl-geometry.js` (one import swap), `docs/modules/shared/flight-math.md`, `tests/unit/ep-tabletop/flight.test.js` (new), `tests/unit/core/*` only to add the moved formula's existing test if Traffic had one.
- **Must not touch:** `ct156-cockpit.js`, `world3d.js`, `relay/*`, `link.js`, any other Traffic file, any formula already in core (never change the turn, energy, G, stall or stick-shaker formulas to make a test pass).
- **Decisions from Patrick first:** **Q1 (the flight approach) must be a yes.** Q2 (suitable field) can run on its working answer.
- **The one test** (`flight.test.js`): *from the example start (8,000 ft, about 12 NM from Moose Jaw) with the engine failed, the student who turns toward Moose Jaw and glides at best glide reaches the field with height to spare, and the student who turns away and flies straight touches down short of any field, with the energy gone.* Pilot-recognisable end results. Expected values: the clean glide of 2 NM per 1,000 ft (SMM 13.5 para 7 and the reference data in `T6A_GLIDE`): 6,100 ft above the field is about 12 NM of glide in still air, so 12 NM away is borderline and the test starts at 8 NM to leave margin that is explained beside the check; ±100 ft and ±10 kt from the shared table. Generous stop: the glide is over inside 10 minutes (6,100 ft at about 1,350 ft/min is under 5; the limit catches a stuck aircraft, never a slow one). Both cases run the same code, so it is also a comparison test (T1).
- **Check on screen:** one-screen mode, the console's pick list: Start, Turn toward Moose Jaw, Glide: the heading comes round at a sensible rate, the airspeed settles near 125, the altimeter unwinds, the picture descends toward the field; Zoom from 200 KIAS gains several hundred feet and ends near 125 (the `ZOOM_GAIN_TABLE` says about 600 to 800 ft at 200 KIAS, reference data). Traffic's PFL glide ring unchanged by eye.
- **Model:** Opus, **high** (flight maths).

### Phase 3b. The student's decision list and plan map

- **Goal:** the decision list on the student's screen (`decisions.js`): big plain buttons, grouped as in 4.1, a heading dial and a field picker where a pick needs one, enabled while time runs, each pick into the session (one-screen mode) and logged; the plan map (`plan-map.js`) with the aircraft, track, fields, the glide ring from core, the line to the chosen field; the instructor's per-scenario trim of the list on the console. The student view carries `plan: { picks (the student's own, words only), fieldIcao, ring }`.
- **Files:** `decisions.js`, `plan-map.js`, `screen.js`, `ep-tabletop.css`, `student-view.js`, `console-*.js`, `scenarios.js` (the default list per scenario), `tests/unit/ep-tabletop/student-view.test.js` (forbidden words: nothing in the list's data carries a boldface or checklist word; the test reads `manoeuvres.js` labels against a short list of banned words such as "PCL", "feather", "boldface", "checklist"; still the file's one test).
- **Must not touch:** `core/*`, `flight.js`'s maths, `world3d.js`, `relay/*`, `link.js`.
- **Decisions from Patrick first:** Q2 (suitable field) and Q3 (map or HSI) on their working answers.
- **The one test:** as above, the content check: *every manoeuvre label is plain words with no boldface or checklist wording and no number in it* (EP-3). Can fail if someone adds "PCL OFF" to the list.
- **Check on screen:** from the default start, Start, the student presses Turn toward the nearest suitable field: the map shows the line and ring, the aircraft turns; press Orbit here with the engine failed: the ring shrinks, the field slips outside it; nothing on the screen says right or wrong. At 1280 wide nothing overlaps (ALL-R7).
- **Model:** Sonnet, medium (Opus only if the map's drawing needs flight numbers beyond calling core).

### Phase 4. Timeline, rewind, better and worse

- **Goal:** `timeline.js` (snapshots at every action and every 5 s, rebuild of any moment, `rewindTo`); the console's timeline strip and Rewind; the Faults section's Better/Worse/Hold and "Student identified it"; developments `onIdentified`; the log line for a rewind; the debrief log shows undone lines greyed.
- **Files:** `timeline.js`, `scenario.js`, `console-time.js`, `console-faults.js`, `phone.js`, `screen.js`, `tests/unit/ep-tabletop/timeline.test.js` (new).
- **Must not touch:** `flight.js` maths, `core/*`, `ct156-cockpit.js`, `world3d.js`, `relay/*`, `link.js`.
- **Decisions from Patrick first:** Q4 (does revealed rewind) and Q5 (manual Better/Worse only) on their working answers.
- **The one test** (`timeline.test.js`): *run to after the chip light has come on and the student has turned toward the field, rewind to a moment before the chip: the student view at that moment has the light dark, the aircraft back where it was, none of the later picks, and none of the forbidden setup words; time runs on from there and the light comes on again at its time.* Expected values: the scenario's own events and sentinel words; the flight state compared with the snapshot taken at that moment during the first run (the same pure code, same inputs; a comparison, not a pinned number).
- **Check on screen:** phone or one-screen: run two minutes, Rewind to 0:30 on the strip: the student's screen shows 0:30's panel; resume; Worse on the oil leak: the needle falls faster.
- **Model:** Opus, medium.

### Phase 5. The link back: the student's picks to the phone

- **Goal:** `link.js` becomes `createMailbox`; the screen composes a reader (student view) and a writer (picks); the phone a writer and a reader; `r` in the QR address and `readConsoleHash`; `cleanPicks` on the phone; the drop words; `relay/README.md` line. In phone mode the student's picks now drive the phone's session.
- **Files:** `link.js`, `picks.js` (message and `cleanPicks`), `screen.js`, `phone.js`, `student-view.js` (none expected), `relay/README.md`, `docs/modules/ep-tabletop/spec.md` ("The phone link"), `tests/unit/ep-tabletop/picks.test.js` (new).
- **Must not touch:** `relay/ep-link.js` (no change needed; if the executor finds one is needed, stop and say so), `core/*`, `flight.js`, `ct156-cockpit.js`.
- **Decisions from Patrick first:** none (a build choice under EP-8; the pull request note says the second mailbox exists).
- **The one test** (`picks.test.js`): *a picks message with an unknown manoeuvre, a heading out of range and a replayed older seq is cleaned so only the new, known pick reaches the session, and the phone's session then carries that pick and flies it.* Expected values: the manoeuvre list and sentinel words typed in the test.
- **Check on screen:** a real phone scans the code; the student presses a pick on the laptop; within about two seconds the phone's console lists it and the laptop's aircraft turns; turn the phone's network off: the laptop says the picks aren't reaching the instructor and keeps them; back on: they arrive. Untried today: a real phone camera, iOS Safari and mobile networks (already on the plan as unseen).
- **Model:** Opus, medium (shared transport and untrusted input), or Sonnet if the thread prefers; no flight maths.

### Phase 6. Docs catch-up and sign-off list

- **Goal:** README, spec, decisions (wording to confirm with Patrick), testing.md's sign-off checklist gains the lines below; `plan.md` boxes ticked; version label.
- **Sign-off checklist additions (in Dad's words where possible):** "Set an oil leak: the pressure falls and the light comes on by itself." "Prompt smoke: the student sees the haze only after Apply." "The student picks Turn to the nearest field and Glide: the table moves and the map shows the ring; pick Orbit instead and the field falls outside the ring." "Rewind to before the light: the student sees the earlier panel." "Worse on the fault: it gets worse." "Picks made on the laptop show on the phone."
- **Model:** Sonnet, medium.

---

## 8. Open questions for Patrick (one at a time; his own idea is always an option)

**Q1. How the aircraft flies the student's picks** (gates Phase 3a).
- (a) The shared point mass with the T-6's thrust, drag and glide (how the Formation sim's Lead and Traffic's PFL fly), each pick a small pilot asking for G, bank and power. **Recommended:** one flight model for the whole tool, every number already sourced in core, nothing new to maintain.
- (b) A simpler sketch: fixed turn rate, fixed glide ratio, no point mass. Cheaper to build; a second, cruder set of flying numbers that the rule book says we should not have.
- (c) Your idea.

**Q2. What makes a field "suitable" for "turn to the nearest suitable field".**
- (a) You name the fields (Moose Jaw and the ones you'd take a T-6 into), and the list is only those. **Recommended:** it is a flying judgement.
- (b) Any paved runway of at least a length you give (the airfield list has lengths and surfaces); the tool picks the nearest.
- (c) Your idea.

**Q3. Where the student sees their plan.**
- (a) A small north-up map beside the step track with the glide ring and the line to the field. **Recommended:** no cockpit change, works in one-screen and phone mode now.
- (b) The HSI's bearing pointer in the cockpit (needs a shared-cockpit change).
- (c) Both.
- (d) Your idea.

**Q4. Rewind and what the student has already asked about.**
- (a) Rewind puts the clock, gauges, lights, aircraft and picks back; what the student has already revealed stays revealed (they can't un-know a reading). **Recommended.**
- (b) Rewind puts the revealed list back too, so the panel shows exactly what it showed then.
- (c) Your idea.

**Q5. Better or worse: by the instructor's hand only, or automatic when the student's pick matches the remedy.**
- (a) By hand only: the instructor ticks "identified" and presses Better or Worse. **Recommended:** the tool never judges a student's call; the instructor does (and EP-3's spirit: nothing in the tool says which choice is right).
- (b) Automatic improvement when the pick matches a fault's remedy (which means the tool holds a list of right answers).
- (c) Your idea.

**Q6. The light thresholds while the pages are not to hand.**
- (a) Build with the estimates in the table, each shown "(estimate)" on the console, and replace them as you give the page or the number. **Recommended** (the rule book: open questions don't stop the work).
- (b) Wait for the pages before Phase 1.
- (c) Your idea.

**Q7. Glide speeds: 125 clean and 120 gear down (your C1 for Traffic) or the reference data's 125 and 105 (`T6A_GLIDE`).** The two are written down side by side in core already.
- (a) Your 125 / 120, as Traffic flies. **Recommended** (your practice first).
- (b) The reference's 125 / 105.
- (c) Your idea.

**Q8. (Later, EP-Q3 still open) Which example scenarios ship**, now that a scenario can be "a cause and when it starts": oil leak on departure, chip in the area, fuel imbalance in the pattern, generator failure on an instrument departure, fire on climb-out, engine roughness in the area. Options: (a) those six as indications and causes only; (b) fewer; (c) your idea. Recommended (a).

---

## 9. Numbers that need a source (one table)

| Number | Where used | Working value | Source status |
|---|---|---|---|
| OIL PX threshold | lights | below 90 psi | needs a page (baseline gives the normal range, not the light) |
| FUEL BAL threshold | lights | 50 lb for 2 min | needs a page (AI recollection) |
| L/R FUEL LO threshold | lights | 110 lb | needs a page (AI recollection) |
| Battery volts with the generator off | gauges | about 24 V | needs a page or Patrick |
| ITT red 820 °C, N1 red 104 %, torque 100 % / 131 % for 20 s, Np 100 % = 1,995 rpm, oil 90-120 psi, 40 psi aerobatic idle minimum | gauges, bands | as listed | baseline (ALL-30) |
| Oil leak rate at severity 0.5 | fault effects | 105 to 40 psi over 3 minutes | estimate; Patrick's ruling wanted |
| Engine-rough thrust loss at severity 0.5 | flight | 20 % | estimate; Patrick's ruling wanted |
| Fuel imbalance rate | fault effects | 50 lb per minute | estimate |
| Gentle turn bank for the picks | manoeuvres | 30° | estimate (the Formation sim's "gentle"); forced-landing pattern 60° max, Patrick's ruling (Traffic `PFL.maxBankDeg`) |
| Climb / descend pitch for the picks | manoeuvres | 8° | estimate |
| Best glide speeds | flight | 125 clean / 120 gear (Patrick C1); reference 125 / 105 | Q7 |
| Glide ratios 2.0 / 1.5 / 1.3 / 1.1 NM per 1,000 ft | flight, ring | core `T6A_GLIDE` | reference data; SMM 13.5 para 7; T/O flap row an estimate |
| Zoom: 2 G to 20°, through 145, capture 125; only above 150 KIAS | flight | core | reference data; Patrick C7 |
| Stall 86 KIAS clean, 76 landing flap | flight floor | core / Traffic PFL | Patrick 30 Sep; the 76 from Traffic's `PFL.stallKias` (source to confirm) |
| Roll and G onset limits | flight | core `T6A_ROLL`, `T6A_G_ONSET` | estimates (Fable's audit 5 Oct; Patrick agreed one core limit) |
| Suitable runway length | fields | 5,000 ft paved | estimate; Q2 |
| Weight for the zoom table | flight | 5,800 lb | core's reference example |
| Flicker rate | cues | 2 a second | picture choice |
| Shake amplitude | cues | 0.3° at severity 1 | picture choice |
| Snapshot spacing | timeline | 5 s | tool choice |
| Return mailbox poll and lost time | link | 1 s / 10 s, as the forward link | tool choice (EP-8) |

---

## 10. Risks

- **Two screens, one aircraft.** The phone is the master but the student's screen runs the same model between sends. If the two ever disagree (a float difference, a missed send), the screen snaps and the picture may jump half a second. Mitigation: deterministic fixed step; the snap eased over 0.3 s; the simpler ease-between fallback kept in the design.
- **The leak surface grows.** Every new field in the student view is a new place the setup could leak. Mitigation: the one pure `studentView` and the EP-2 test's forbidden list extended in every phase that adds a field.
- **Moving `glideFootprint` to core touches Traffic.** Mitigation: a one-import swap and a before-and-after look at Traffic's glide ring; Traffic's test suite is CI's.
- **The shared `excessFnFor` change.** Additive (new optional second argument), the existing callers unchanged; its core test extended.
- **QR length** grows to about 151 characters: fits version 10 with room; `encodeQr` already throws with a plain message if not.
- **Snapshot memory** in a long session on a phone: thinned track, 5 s spacing, a cap of about 2 hours of snapshots (older ones every 60 s only).
- **Thresholds as estimates in the room**: a wrong number teaches the wrong light. Each shows "(estimate)" on the console until sourced; Q6.
- **Scope creep**: the decision list invites "add a checklist step". EP-3 and the Phase 3b content test hold the line.
- **Rule-book order:** no code for the flight before Phase 0 is approved; Opus high for 3a; one test per pull request; CI the one check; every status says what is unseen (a real phone and iOS Safari are still unseen from Step 2).

**Out of scope (to `future.md`):** 3D cues (smoke trail, flames, oil on the glass drawn in 3D); the HSI bearing pointer unless Q3 picks it; the student asking a question over the return link ("what's the oil pressure?") and the instructor revealing on the phone, which the same mailbox can carry later; chair-flying F in the Traffic sim; the direct WebRTC link (EP-Q4); standup mode; formation EPs; a shared scenario library; an unfeathered (windmilling) glide; grading of any kind.

---

## 11. Things seen in the current code worth a note (outside this ask)

None red. Yellow and notes:

1. `src/modules/ep-tabletop/indications.js:93-94` — `hudOf` always reports `g: 1` and `vsFpm: 0`. Fine while the aircraft is a picture; Phase 3a must feed them from the flight or the VSI and G meter will lie once the aircraft moves.
2. `src/modules/ep-tabletop/scenario.js:77-81, 152-162` — a development added `at: { step: <the current step> }` only fires on *entering* a step (`fireStep` runs in `goStep`), so adding one "at Boldface" while already at Boldface waits until Boldface is re-entered. Minor; the console's "+ Add at <step>" could surprise an instructor. One line in `addDevelopment` (fire at once if `a.when === s.step`) fixes it, if Patrick agrees that is the expected behaviour.
3. `src/modules/ep-tabletop/link.js:121` — after the screen has connected once, a 404 (the session ended or expired on the relay) reads as "lost" forever rather than "ended"; the screen keeps polling once a second for up to the module's life. Cosmetic; a distinct "ended" status would be clearer.
4. `src/modules/ep-tabletop/world3d.js:208` and `index.js:174` — if `cleanStudentView` drops `flight.altFt` (out of range or missing), `setPose` defaults the altitude to the field's elevation and the aircraft is drawn on the ground. Unlikely from our own phone, but a bad message would do it; defaulting to the situation's start altitude would be safer.
5. `tests/unit/ep-tabletop/scenario.test.js:3` — the expected values come "from the scenario itself". For a rules test (does the engine apply a change at its time) that is fair, but it is close to T3's "never from the code's own data". The new tests above name a baseline or manual value for every flying number.
6. `src/modules/ep-tabletop/scenarios.js:7-11` — most healthy-cruise numbers (torque 58 %, fuel flow 300 pph, ITT 650 °C) are estimates, correctly marked. Patrick could give the real area-cruise panel in one line and they would all be sourced.
7. Security: the relay's GET needs no key by design (the student view carries nothing secret, and the return mailbox's picks carry nothing secret either). Anyone who guesses a 128-bit id could read a view; that is 2^128, so fine. The key lives in the phone's address bar and history for the 6-hour life of the session; acceptable, already written in EP-8.
8. `relay/ep-link.js:63-77` — every new session lists up to 100 blobs to sweep; on Netlify Blobs that is a `list()` per new session, cheap at this scale, noted only.
9. `docs/modules/ep-tabletop/spec.md:36` says each shipped number comes from the baseline *or is marked an estimate*; the code matches. The README's "Where it stands" still says the relay "needs Dad's redeploy" while `plan.md` says `/ep-link` is live (deployed 12 Oct): one of the two is stale (Phase 0 fixes the wording).
