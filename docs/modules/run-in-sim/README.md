# Run-in Simulator

An orbit, a run-in, a release (or a flypast) and an escape, flown in 3D over the real ground to the user's settings, to see how a flyover, an inert practice-bomb pass (flat or dive) or a cargo offload over a drop zone will go. Training only. Start here, then read only the file you need.

## Where it stands

**Built in V2.502 (plan Steps 2 to 5); not yet seen by Patrick or Dad.** Dad asked on 16 Oct 2026; Patrick approved the plan and the spec (relayed by Dad, 16 Oct 2026), adding RS-9: the user sets a few essentials and the computer works out the rest to hit. The home card shows (RS-1). Flyover, Practice bomb flat and Practice bomb dive fly with the CT-156 on the T-6A set; the cargo offload waits for the C-130J's performance set (RS-Q1), and the engine is ready for it (`src/modules/run-in-sim/README.md`). The code: `src/modules/run-in-sim/`.

## What is next

1. Step 6: run the sign-off checklist in `testing.md` in the app and send Patrick the result.
2. The open questions below, one at a time; each has a working answer the spec uses. RS-Q1's C-130J numbers table goes to Patrick before the C-130J flies.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How it works: the screen, the targets, the five legs, how it flies, the defaults, what happens when data fails |
| `screen-mockup.png` | The screen picture (a mock-up; its numbers are made up) |
| `requirements.md` | What it must do, in Dad's words, with how each is checked (RS-R) |
| `decisions.md` | Decisions approved with the spec (RS-) |
| `testing.md` | The one light test and the sign-off checklist |
| `plan.md` | The ordered steps and checkboxes |
| `future.md` | Ideas not being built until Patrick moves an item up |

## Open questions

Each has a working answer the spec uses until it is settled. Also on the waiting list in `../../PLAN.md`.

| ID | Question | Options | Working answer |
|---|---|---|---|
| RS-Q1 | Which aircraft fly which runs, and how the C-130J flies (it has a model, but no performance numbers yet) | (a) The CT-156 flies the flyover and the practice-bomb runs on the T-6A set; the C-130J flies the cargo offload on its own performance set, built from public numbers the way the Astra's was (every number an estimate, flagged on screen), in Step 4 with its numbers table shown to Patrick first; (b) the CT-156 flies all three for now, the C-130J later; (c) your idea | (a) |
| RS-Q2 | The default heights, speeds, dive angle, escape and orbit for each run type (the spec's table; all estimates) | (a) Keep the table's estimates until you give numbers or a manual page; (b) your numbers now; (c) your idea | (a) |
| RS-Q3 | The escape references the card flags (500 ft AGL anywhere; the flyover's 1,000 ft over the target's top inside 2,000 ft, the CARs 602.14 built-up-area reference, to be checked; 300 ft AGL for the cargo run) | (a) As the table; (b) your numbers; (c) your idea | (a) |
| RS-Q4 | The starting places | (a) The Moose Jaw area as the default, and "tap the map" anywhere else (mountains included); (b) also a ready-made mountain valley in the Place list; (c) your idea | (a) |
