# Turn Fight (BFM)

A two-aircraft turning fight with two modes:
- **Simple mode** ports V6 (pinned by the golden test).
- **Energy mode** (D112) flies a real T-6A energy model from `src/core`, with climbs, dives and Auto manoeuvres (split S, Immelmann, pitch back, slice) toward the max-performance turn (MPT).

- **Where things are:**
  - Spec: `specs/SPEC-turn-fight.md`.
  - Tasks: `tasks/turn-fight/todo.md`.
  - Code: `src/modules/turn-fight/`.
  - Sign-off checklist: `docs/checklists/turn-fight.md`.
- **Live as PROTOTYPE.** On main through #235:
  - PR A to C: the V6 fight, screen, extras, decided changes and start geometry.
  - The 2D/3D switch, with the 3D fallback on a graphics reset.
  - The Energy engine (`energy-sim.js`, with no screen yet).
- **Energy engine rules now on main:**
  - The top speed is core's `modelMaxIasT6A`, exported here as `energyTopKias`. It is VMO 316 KIAS, or true Mach 0.67 in the model's IAS: 316 KIAS up to about 17,566 ft, 300 at 20,000 ft, 269 at 25,000 ft.
  - The MPT speed is 125 to 175 KIAS (`MPT_KIAS_RANGE`).
  - `state.evenFight` is true only when both noses came on together and no chase has started.

## Paused work

| What | Where | State |
|---|---|---|
| Energy screen (PR D, task 10's screen half) | branch `handover/turn-fight-energy-screen` (226729d), based on #227 (8091f5e); merges with main cleanly | Built and audited twice (second audit: ship). The top commit is **WIP**: the error catch is narrowed to the engine's own setup errors (message starts "Turn Fight energy setup: "); anything else is logged and rethrown. It has no tests yet. At the pause, the 491 turn-fight unit tests passed and typecheck was clean, but no e2e had been run on it. |

The Energy screen branch already has:
- the Energy (T-6) checkbox, off by default, with the simple fight unchanged;
- the Energy section in Turn Fight settings, and the "Model settings for checking" section;
- the two flags (OVER G, STALL) with a status line that is announced only when a flag turns on or off;
- the winner line, using `evenFight`, then who is chasing, then "--" or "No winner";
- the altitude side view (uPlot, loaded only when needed) with a text table;
- the 3D hard-deck plane and bank from the energy state;
- the MPT box range taken from the engine;
- a speed-at-height check through one helper, `topKiasAt` in `state.js`, with a fallback to defaults and a message that names what it replaced;
- the Energy lines in the checklist.

## To finish the Energy screen

1. **Merge main into the branch.**
2. **Swap in the engine's limit.**
   - Change `topKiasAt` in `state.js` to call `energyTopKias` from `energy-sim.js`. It is marked `// TODO: energyTopKias` and still calls core's `maxKiasT6A`, which is the NFM gauge line and would let the model fly over Mach 0.67.
   - Make the screen's "VMO or Mach" wording match the engine's refusal text: "(269 KIAS in the model, Mach 0.67; the NFM's 279 is the same Mach on the gauge)". The best way is to reuse the engine's message.
   - Add 17,566, 17,570 and 17,600 ft to the parity heights in `tests/unit/turn-fight/energy-state.test.js`.
   - The MPT minimum is now 125: check the box and `saneFix` tests.
3. **Test the WIP commit.** Add two unit tests: a setup error that is caught and shows the right note, and a non-setup RangeError that is rethrown.
4. **Tidy two e2e items.**
   - Give the forced Split S pause in `tests/e2e/turn-fight.spec.js` `expect.poll(..., { intervals: [50] })`, because it can overshoot at 4×.
   - Wrap the Energy e2e tests in `test.describe('Energy (T-6)', ...)` so `--grep "Energy"` finds all 18.
5. **Re-read the checklist's Energy numbers** against the merged engine. They were taken before #235.
6. **Get CI green, then merge.** Under the Streamlined build rules, GitHub's automatic tests are all a PR needs until the module is finished.
7. **Run the end-of-module test once:**
   - the full local unit and e2e run;
   - screenshots;
   - accessibility (axe);
   - the Verification check;
   - Patrick's or Dad's run of `docs/checklists/turn-fight.md`.

Known limit: OVER G cannot be triggered from the screen, because Auto never pulls past +7 G and no forced move does. The flag and its words are built and unit-tested.

## Small fixes left from the last check (#219 re-check)

These are worth doing:
- **Time label.** More detail's "Time since the pass" counts from T+0 when the turns start at once or there is no pass. Label that row "Time since the turns started" in those cases, and add a readouts unit test.
- **Checklist wording** (`docs/checklists/turn-fight.md`):
  - The trails are blue and red, not yellow.
  - With Climb and dive, the side view shows Blue rising and Red falling only *after the pass*.
  - After a graphics reset, View stays 2D, even after a reload, until you choose 3D again.
- **Greyed height box.** With Climb and dive off, Red's height box is greyed but still shows a number. This is optional.

Cut under the Streamlined build (3D is a bonus): the other 3D fallback items. These are focus after a reset, the restored-context listener, canvas clean-up, the note's wording, and a console recipe for testers. They go on the future features list if wanted.

## Settled calls

- Stall 86 kt (Patrick, D158; V-n diagram). Zoom weight 5,800 lb (D159).
- The level MPT keeps the turn-chart bank (about 69°); the SMM's 75° is in the help text (D143).
- The split S pulls up to 5 G at the shaker (D144). Above 220 KIAS, Auto picks an Immelmann or a pitch back by a short look-ahead, whichever gets there faster (D145, Patrick 09:32Z).
- Only OVER G and STALL are flagged. Pursuit is Pure by default (D132).
- Every manual KIAS (VMO, stall, charts) is compared with the model's IAS, which has no compressibility (D273). The Mach limit alone is checked as true Mach 0.67 (review rows D345, D347, D349 and D350).

## Open

- Two questions for Dad, in `docs/records/dads-questions.md`:
  - a slice or a split S below 120 KIAS;
  - whether the lowest Immelmann top speed should be 120 or about 140.
- Future: the chaser picks its own pursuit (FF42).
