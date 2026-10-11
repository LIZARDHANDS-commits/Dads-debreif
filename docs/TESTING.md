# Testing policy

What the tests check, when they run, and why. Each module adds its own rules and its sign-off checklist in `modules/<module>/testing.md`.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).

## The idea in one paragraph

Tests check what a pilot would recognise: what must always be true (an aircraft never exceeds its G limit unless the screen says so) and what happened (it landed on the runway, it rolled out in trail). They never fail on a tight time (a generous, realistic limit is fine), never copy V6's numbers or the code's own output, and never push anyone to change the flight physics to make them pass. The SMM, the orders and the aircraft's published limits are references: crossing one is shown on screen, not forbidden. Fast, steady checks run on every change. The heavier checks and a person's hands-on checklist run once, when a module is signed off. A module is done when someone has seen it working and signed its checklist, not when the tests are green (ALL-R26).


## 1. What a test may check

| # | Rule | Why | Before the trim (test register, 4 Oct) |
|---|---|---|---|
| T1 | **Check invariants and outcomes.** An invariant is something that is always true, for any input (no aircraft flies through the ground; a steeper bank at the same speed always turns tighter). An outcome is the end result a pilot would judge (it landed on the runway; separation never dropped below the limit). A comparison test runs two cases and checks how they relate (mirror the wind and the circuit, and the path mirrors). | ALL-R19 to ALL-R21 say checks look at invariants, not numbers; top lesson 3; research section 1, options A to C | Mostly expected values: for example SOF about 350 of 796, Turn Sim 76 of 189 |
| T2 | **No tight time gates.** A test may check that something happens within a generous, realistic time, with the reason written beside it: for example, an aircraft sent to a PFL lands within 5 minutes. The limit sits well above the usual time, so it catches an aircraft that is stuck or lost, never one that is a second slow. Exact times and narrow windows (such as reaching High Key between 85 and 125 s) are never checked, and neither is how long the computer takes. Rules that are about time, such as a stale weather report, are tested as rules. **(Wording by Patrick, 4 Oct 03:07Z; Q-T9 and Q-T13, decided.)** | Patrick 21:18Z (`pf/reset/consolidation-plan.md:12`) and 4 Oct 03:06Z (reasonable time tests are allowed; the old tests failed for being about a second off); lesson F2; ALL-R21 ("nothing is capped by time") | About 250 tests gate on a time; Traffic about 94, Turn Fight about 70, Turn Sim 44 |
| T3 | **Expected values come from an independent source**, written next to the check: Patrick's ruling, a manual page (page reference only, never manual text), standard aerodynamics worked out in the test, or real recorded data used as input (weather reports, Dad's flight logs). Never from the code's own output, and never from V6's output. V6 only answers "does this feature exist". | ALL-R22; lesson F1 and top lesson 1. The flight math check (`pf/reset/2-inventory/agents/sources/plan-doc-flight-math-check.md`) showed V6's own numbers were wrong in places, for example its EM turn rate is exactly half the real one | About 130 tests pin a V6 number; some pin the code's own earlier output (for example Turn Sim 3,924 ft and 36.74 s) |
| T4 | **Tolerances are margins, not requirements.** A check that needs a margin uses the shared table by default: ±10 kt, ±100 ft, ±5°, ±0.5 G, ±2.5°/s, ±5 % (D371's standard tier, `tests/helpers/tolerances.js`). A check may use a different margin when it says why, in one line next to the check ("the arc is drawn in 1° steps, so allow 50 ft"). A margin never makes a time a gate (T2). **(Q-T6: Patrick, 4 Oct 02:55Z, "Both".)** | Patrick 21:18Z; lesson F3; research section 1 | `tests/helpers/tolerances.js` is imported by no test; about 180 bands are typed into Traffic tests alone, mostly without a reason |
| T5 | **Compare like with like.** A speed check names its kind (indicated, true, ground speed or Mach) and only compares the same kind. | ALL-R28; lesson F24 | Not checked today |
| T6 | **Same setup, same result.** Anything random uses a fixed, recorded seed, so a failure can be replayed. Each module section says how its randomness is split (for Traffic, one stream per aircraft is proposed in the research). | ALL-R19 ("the same setup gives the same picture every time"); research section 1, "Randomness" | `tests/unit/core/properties.test.js` already uses fixed seeds |
| T7 | **A test never forces a change to the flight physics.** When a flight test disagrees with the physics, check the test against the manuals and Patrick's practice first. If the physics still looks wrong, ask Patrick; never bend the physics to turn a test green. And if a test fails twice, stop the work and ask Patrick before going on. **(Q-T12, decided: "Both", Patrick 4 Oct 02:58Z.)** | Top lesson 1; lesson F1 (agents added G clamps and an instant bank snap to make tests pass) | The D411 banner says a version of this in 201 test files |
| T8 | **Every test must be able to fail.** Each new or changed test is reviewed with one question: would it fail if the behaviour were wrong? A test that only checks the code against itself, or can't fail, is rewritten or removed. | Research section 5; lesson F1 | The register marks several circular checks and one test that can't fail (`tests/unit/turn-sim/rear-delay.test.js:67`) |
| T9 | **Keep it light.** No mutation runs, stress runs or long parameter sweeps. Property tests (many random inputs through one law) are allowed with a few fixed seeds on each change and a wider sweep at sign-off **(Q-T10, decided)**. | Lesson F4 ("no mutation, fuzz or stress runs"); top lesson 4 | `fast-check` is installed and used in two files |
| T10 | **Limits and orders are references, not walls.** Two kinds of limit are kept apart. *Physical limits* are what the air and the aircraft allow: it can't pull more G than its wing gives at that speed, it can't fly through the ground, and it can't make energy. These are invariants (T1) and hold every time. *Published limits* are the SMM safety limits, the orders and the aircraft's operating limits (for example the G limit, the maximum speed and a hard deck). A flight may cross one. The test then checks that the screen says so, and that the aircraft keeps flying realistically; it never expects the aircraft to be held at the limit. The standard setups are still checked against the SMM and the manuals as outcomes (T1, T3). | Patrick, 4 Oct 00:47Z: orders and SMM limits are references, not absolute requirements; the turn sims follow the SMM but not absolutely. ALL-R20 ("unless the screen flags it as an exceedance"). Lesson F1 (agents added G clamps to make tests pass) | D411 lists "Hard Deck 6,000 ft MSL floor clamping" and the speed limits as invariants (`archive/agent-rules/dads-debrief.md:62`) |

The last column is history. The test trim (#398, Patrick's yes 5 Oct 05:15Z) cut the unit tests from 3,125 to 1,608 and the browser tests from 383 to 123, keeping the flying and safety checks. Formation Sim's tests wait for its own clean-up.


## 2. What runs when

| When | What runs | Who looks |
|---|---|---|
| **Every change** (each pull request and each push to main) | Unit tests for every module (flight invariants, outcomes, rules, data parsing). Type check. Build with the home-screen size budget (ALL-R9). In Chromium only: one smoke test per screen (it opens with no errors and one key control works), the accessibility scan, the layout check at 1280 × 800 and 1920 × 1080 with every menu open, the every-button check, and the leave-and-switch, offline and blocked-storage checks. Aim: the whole run under 10 minutes; a run that grows past that is trimmed, it doesn't get a longer limit. | Nobody, unless it goes red |
| **Module sign-off** | Everything above, plus: the module's own browser tests, where it still has any (after #398 and #407 no module has its own browser file; every module relies on the shared smoke, layout and button checks); the same smoke set in Firefox and WebKit; the property tests with many seeds; a plain list of what the module's tests check, made from the test names, for Patrick to skim (lesson F4). Then the hands-on checklist (section 4). | Patrick, or whoever signs off |
| **Never** | Nightly runs; re-checking every module after each merge (lesson F6); heavy test machinery (T9). | |

Every push to main publishes the live site while the repo variable PAGES_ON is true, and a hand Run workflow always publishes (#451, 5 Oct). A failing check doesn't stop it; it shows as a warning on the run **(Q-T1, decided: "Always publish", Patrick 4 Oct 02:59Z)**.

A test that passes and fails on the same code (a flaky test) is fixed first. If it can't be fixed the same day, it moves to the sign-off run with a note on the waiting-on-Patrick list, so one flaky test can't hold up every change **(Q-T4, decided)**.


## 3. How each whole-tool requirement is checked

"Each change" and "sign-off" are the two runs in section 2. "Checklist" is the hands-on sign-off checklist in section 4.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| ALL-R1 Opens from a link, nothing to install | Each screen opens in Chromium; the smoke set in Firefox and WebKit | Each change; sign-off | Open the link on a laptop with nothing installed; one real Safari look |
| ALL-R2 Desktop and laptop first | Layout check only at desktop sizes; no phone tests | Each change | Run the checklist on a laptop |
| ALL-R3 Home screen | Five module cards and About show; previews stay still when reduced motion is set. The heading is checked to contain "DAD's OODA LOOP", not to equal it, so the version badge doesn't break it | Each change | Previews play and look right |
| ALL-R4 Only real modules | Every card on the home screen opens a working module | Each change | |
| ALL-R5 Not overwhelming | Each module opens with only its default items showing (module section lists them) | Each change | "Is anything on screen that I don't need for a first use?" |
| ALL-R6 One Settings menu | Settings starts closed; change a value, press reset, the defaults are back | Each change | |
| ALL-R7 Everything fits at 1280 wide | Layout check: nothing overlaps or is cut off at 1280 × 800 and 1920 × 1080, with every menu and panel open | Each change | Look at the busiest state at 1280 wide |
| ALL-R8 No dead buttons | Every visible control changes something, with no error; every greyed control shows a reason | Each change | Every control does what its label says |
| ALL-R9 Quick to open | The build reports the home-screen and card-video sizes against the 3 MB budget (a size, not a time) | Each change | |
| ALL-R10 Plain pilot words | none | | A pilot reads every screen without asking what a label means |
| ALL-R11 Keyboard and readable | Accessibility scan against WCAG 2.1 AA finds no serious problems **(Q-T3, decided)** | Each change | Tab through each screen; zoom to 200%; focus is always visible |
| ALL-R12 One module at a time | Leave each module: nothing keeps running; settings stay separate | Each change | |
| ALL-R13 No errors; plain message when outside things fail | Every browser test fails on any page error or unplanned network call; block each outside service and storage in turn: a plain message, nothing freezes | Each change | |
| ALL-R14 Works offline after one visit | Visit once, go offline: every module opens; weather and new tiles say "offline" | Each change | |
| ALL-R15 One time switch | Flip it: every clock and time label follows; fixed dates either side of a clock change convert correctly (the test sets its own date, never the computer's) | Each change | |
| ALL-R16 Home airfield setting | Set a non-Moose Jaw field: clock, SOF and maps follow | Each change | |
| ALL-R17 Work is kept | Save, reload and compare settings and files; with storage blocked, the "won't be saved" message shows and the tool keeps working | Each change | Save a debrief and a sim setup to a file and reopen them |
| ALL-R18 Report a problem | The button opens the form with the module and version filled in | Each change | |
| ALL-R19 Realistic kinematics | Invariants on every simulator: same setup and seed, same path; a headwind shortens the ground track; a crosswind shows as crab and drift on every aircraft; no aircraft jumps, freezes or slides sideways, including when it changes from a planned leg to free flight (each step's change in position and heading stays within what its speed and turn rate allow) | Each change; many seeds at sign-off | Watch each simulator from its default start: does it fly like a T-6? |
| ALL-R20 Turns, speed and energy | Invariants: a steeper bank at the same speed always turns tighter; turn rate and radius follow from bank and speed; no aircraft pulls more G than its wing gives at that speed; a flight that crosses a published G or speed limit is flagged on screen and keeps flying (T10); trading height for speed never makes energy | Each change | |
| ALL-R21 Drift corrects like a pilot | Push an aircraft off its path (wind change, late start): it rejoins smoothly before the next leg, judged by where it ends up, not by how long it takes | Each change | |
| ALL-R22 Numbers have sources | Every expected flying value in a test names its source (T3); reviewed with each change | Each change (review) | |
| ALL-R23 Flight math in one place | The flight-math index lists every formula; reviewed at sign-off that no module has its own copy | Sign-off (review) | |
| ALL-R24 Manual content stays private | Reviewed at sign-off: no manual text or page images in the repo or on the site | Sign-off (review) | |
| ALL-R25 Plain JavaScript, one folder per module | none | | Find where a common thing is changed from the module's README |
| ALL-R26 Sign-off checklist | The checklist is the test (section 4) | Sign-off | Checklist run and recorded |
| ALL-R27 Version on screen | The header shows a version; a newer published version offers Reload | Each change | |
| ALL-R28 Speeds name their kind | Each speed readout shows its kind; shared conversion helpers are unit-tested against standard formulas | Each change | |


## 4. The hands-on checklist

- One short checklist per module, in plain pilot words, kept in the module's `testing.md` (ALL-R26). It covers what a person judges better than a test: does it fly and look right, does every control do what it says, does it make sense to a pilot (ALL-R10).
- Anyone can run it: any pilot with the link, who sends the result to Patrick **(Q-T7, decided: "Anyone", Patrick 4 Oct 03:01Z)**.
- It is run in the real app, from the module's default start, on a laptop at 1280 wide (ALL-R2, ALL-R7), with a quick keyboard and zoom pass (ALL-R11) and one look in real Safari.
- The result is recorded with the date, who ran it and the version shown on screen (ALL-R27). Anything not seen working is listed as unseen (lesson F37).
- A module is done only when its checklist is signed. Green tests alone never make a module done.


## 5. How tests are written

- **Test names are plain sentences** a pilot can follow (most already are).
- **Each test file starts with three plain lines:** what it checks, which requirement it serves, and where its expected values come from. This replaces the D411 warning banner, which sits in 201 of 205 test files, including layout and accessibility tests where it means nothing **(Q-T11, decided)**. The testing rules themselves go in the rule book and in every agent brief (lesson F36).
- **Browser tests wait for what is on screen, not for a number of seconds,** and use a fixed clock where time matters, so they don't depend on the computer's speed, date or time zone (lesson F5).
- **No real network in tests:** every outside service is stubbed, and an unplanned request fails the test (already built).
- **Each module owns its tests:** `tests/unit/<module>/` and at most one browser file per module; shared pieces in shared folders. A module's tests never reach into another module.
- **Each PR adds at most one test, the one that best shows it flies right. Skills that say otherwise are overridden.** (Patrick, 5 Oct 05:19Z; also in `AGENTS.md`.)
- **Before deleting or rewriting code, list what it did**, and check the new code on the default start (lesson F42).


## 6. What happens to the old pieces

These are proposals for the Part B columns of the test register and for thread 7; nothing moves until Patrick ratifies this policy.

| Old piece | Under this policy |
|---|---|
| D411 test policy (`archive/agent-rules/dads-debrief.md:46-67`) and the testing lines of `CLAUDE.md:8` and `CLAUDE.md:11` | Replaced by this file (thread 6 writes the rule book) |
| `archive/tests/e2e/visual.spec.js` and its nine reference pictures | Retire (Q-T2, decided) |
| `tests/helpers/tolerances.js` (18 constants, used by nothing) | Kept as the default margins (T4, Q-T6). Its loose tier and its helper that guesses a margin from a field name are dropped: the helper reads any name with a "g" in it as a G value |
| The D411 banner in 201 test files | Replaced by the three-line header **(Q-T11, decided)** |
| References to `archive/tests/golden/` in test headers and READMEs; the 42 golden files in `archive/tests/golden/` | Stay archived; the references are removed **(Q-T8, decided)** |
| `archive/tests/crosscheck/traffic-expected.json` (run by no test; 57 of 91 rows no longer match) | Decided in the Traffic section |
| `tests/unit/ui-kit/ct156-cockpit.test.js`, the cockpit's horizon test ("half sky, half ground" at 200 KIAS, AETCMAN 11-248 Fig 2.7; rewritten in V2.235 to 15-40 % up at 220 KIAS) | Retired, no horizon test replaces it (Patrick, 11 Oct 2026 01:27Z: "I don't think we need a test here"; ALL-31). The SMM 220 KIAS picture and a person's look in Cockpit are the check |
| Tests that gate on a time, pin V6, or check the code against itself | Marked rewrite or retire per test in the register's Part B columns, module by module |


## 7. Patrick's answers to the testing questions

All thirteen questions in `pf/reset/5-testing/questions-queue.md` were answered by Patrick on cards, 4 Oct 02:55Z to 03:05Z. A marker reading "decided" means the text shows his answer.

Answers:
- Q-T6 (margins): Both. The shared table is the default; a check may differ with a reason (Patrick, 4 Oct 02:55Z).
- Q-T9 (rules about time): Allowed. A rule that is about time is tested as a rule on a fake clock; how long a flight takes is never a tight gate (Patrick, 4 Oct 02:56Z; T2 reworded by Patrick at 03:07Z).
- Q-T12 (when a flight test disagrees with the physics): Both. The new wording in T7, and a test that fails twice still stops the work for Patrick's answer (Patrick, 4 Oct 02:58Z).
- Q-T1 (what stops the site publishing): Always publish. Every push to main publishes; a failing check is a warning (Patrick, 4 Oct 02:59Z).
- Q-T2 (screenshot tests): Drop them. The nine screenshot comparisons retire; the layout check and a person's look cover the screens (Patrick, 4 Oct 02:59Z).
- Q-T4 (flaky tests): Fix, then park. Fixed first; if not fixable that day, moved to the sign-off run and put on Patrick's waiting list (Patrick, 4 Oct 03:00Z).
- Q-T3 (accessibility standard): WCAG 2.1 AA (Patrick, 4 Oct 03:01Z).
- Q-T7 (who runs the sign-off checklist): Anyone. Any pilot with the link, who sends the result to Patrick (Patrick, 4 Oct 03:01Z).
- Q-T10 (many random setups): Allowed, small. A few fixed seeds on every change, a wider sweep at sign-off (Patrick, 4 Oct 03:03Z).
- Q-T11 (the warning banner): Header. The D411 banner is replaced by a three-line header in every test file (Patrick, 4 Oct 03:04Z).
- Q-T8 (old V6 comparison tests): Keep archived. The pointers to them are removed (Patrick, 4 Oct 03:04Z).
- Q-T5 (Traffic random choices): By callsign. Each aircraft draws from its own stream, seeded from its callsign (Patrick, 4 Oct 03:05Z).
- Q-T13 (safety stop): Safety stop. A generous stop with its reason beside it; reaching it fails as "never happened" (Patrick, 4 Oct 03:05Z).
- T2 wording (time limits): Patrick, 4 Oct 03:07Z, after his 03:06Z note that reasonable time tests are allowed, such as a PFL landing within 5 minutes.


## What this file doesn't cover yet

- The Turn Sim's final marks, which wait for the Turn Sim review.
- PT-PT Sim and the Briefing Board, which get their sections with their own spec sessions.
