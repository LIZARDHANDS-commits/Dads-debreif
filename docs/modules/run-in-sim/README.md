# Advanced Mission Sets

**Named Advanced Mission Sets by Dad, 17 Oct 2026 ("can we also change the name of the module to Advanced Mission Sets"; it was the Run-in Simulator).** The name people see changed (the home card, the screen, the tab); the folder, the route (`#/run-in-sim`), the file names, the ids and the RS- decision numbers keep the old name so nothing breaks, and the history below keeps it as written.

An orbit, a run-in, a release (or a flypast) and an escape, flown in 3D over the real ground to the user's settings, to see how a flyover, an inert practice-bomb pass (flat or dive) or a cargo offload over a drop zone will go. Training only. Start here, then read only the file you need.

## Where it stands

**Built in V2.502 (plan Steps 2 to 5); not yet seen by Patrick or Dad.** Dad asked on 16 Oct 2026; Patrick approved the plan and the spec (relayed by Dad, 16 Oct 2026), adding RS-9: the user sets a few essentials and the computer works out the rest to hit. The home card shows (RS-1). Dad's first-look asks are built too (plan Step 4b, still V2.502, not yet seen): the orbit as a holding pattern (the default) or a figure 8 leaving at the IP heading inbound (RS-11), the target keeping its own heading with the card saying on the bridge's deck or underneath (RS-12), and a 2D plan and profile behind a 3D | 2D switch (RS-13). Flyover, Practice bomb flat and Practice bomb dive fly with the CT-156 on the T-6A set; the cargo offload waits for the C-130J's performance set (RS-Q1), and the engine is ready for it (`src/modules/run-in-sim/README.md`). The code: `src/modules/run-in-sim/`.

## What is next

1. Dad or Patrick looks at Step 4b in the app (the holding pattern and the figure 8, the bridge from 90° and 30°, the 2D view).
2. Step 6: run the sign-off checklist in `testing.md` in the app and send Patrick the result.
3. **Dad's correction to the refuelling run (20 Oct 2026, plan Step 7d; RS-19 amended):** the receiver turns direct to the IP after take-off, and the tanker holds at the ARCP until the receiver is IP inbound; the old ways stay as settings. Built within Patrick's yes on the refuelling run; Patrick's look and Dad's in the app next.
4. **Proposed, built ahead of Patrick's yes (Dad, 17 Oct 2026: "Can we make a paint scheme for USAF and USN"): a Paint choice in the Display box (RCAF Harvard, USAF, USN; RS-29, ALL-45), colours and markings all estimates.** Patrick's yes, then Dad or Patrick looks at both paints in the app.
5. The open questions below, one at a time; each has a working answer the spec uses. RS-Q1's C-130J numbers table goes to Patrick before the C-130J flies.

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
