# EP Tabletop: testing

The policy is `../../TESTING.md`. This module adds:

- The one light test, `tests/unit/ep-tabletop/scenario.test.js` (Step 1): a scenario's development changes the panel only when its time or step comes or the instructor applies it, and a pause stops the clock (what an instructor would recognise). Expected values come from the scenario itself.
- The one light test for Step 2, `tests/unit/ep-tabletop/student-view.test.js`: the student view (what the phone sends and the student's screen draws) never carries a development to come, an edit not yet applied, marks, notes, Declare answers or anything about the scenario's name or end, before start, paused with edits waiting, with a development pending and after Boldface (EP-2, EP-9). Expected values come from the scenario itself and words typed in the test.
- The one light test for Step 3, `tests/unit/ep-tabletop/systems.test.js`: with an oil leak set at the start, the oil pressure starts healthy and falls as the clock runs; OIL PX is dark above its threshold, comes on once the pressure falls through it and stays on; MASTER CAUTION comes on with it; a pressure the instructor types wins and the lights go out (EP-11). Expected values: the 90 to 120 psi normal range (ALL-30) and the named OIL PX threshold with its source status (an estimate, EP-Q10); no time gate, only the order of events. Step 3 also extended the Step 2 test: the student view never carries a cause, its severity or its trend.
- The QR encoder is checked by decoding, not by a test: its code for a real console address, and codes of every length it takes, were read back with an open decoder kept outside the repository (Step 2).
- The shared cockpit's `liveEngine` change is checked by picture, not by a test: the default cockpit rendered before and after the change is pixel for pixel the same (Step 1).
- No test checks a checklist or boldface step: none is stored (EP-3).

## Sign-off checklist (in Dad's and Patrick's words; filled in when the spec is approved)

- [ ] From the default start, open the EP Tabletop, scan the code with a phone, and run "engine roughness in the area" from A to F.
- [ ] The student's screen never shows the script, what comes next or the end.
- [ ] Pause on the phone, change fuel flow and the chip light, resume: the student sees only the result.
- [ ] Send the student back to Aircraft control from Analyse, Boldface and Checklists.
- [ ] Turn the phone's network off: the student's screen says "Instructor link lost" and keeps its state; rescan and carry on.
- [ ] The debrief log shows every step, pause, change and note, and saves to a file.
- [ ] No boldface or checklist text anywhere on either screen.
