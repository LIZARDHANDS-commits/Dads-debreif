# Fight Sim refactor: wording for Patrick to approve (draft)

Patrick chose "Refactor pilot layer" on the card (10:36Z) and asked to be careful about what is lost and how (10:36Z). Below is the exact wording proposed for the repo. Nothing is written to the repo until he approves it.

## A. New decision for `docs/modules/turn-fight/decisions.md`

| ID | Rule | Was | Why |
|---|---|---|---|
| TF-57 | Fight Sim's Energy fight is refactored in the pilot layer only. The aircraft model (core point-mass step, thrust, drag, limits), the eight moves, the Tactical AI, gun kill, collision, presets, start geometry, the Simple fight and the screens are kept. What changes: one place picks each jet's next move; each move is its own file that flies the move and says when it is done; one smoothing layer limits how fast G and roll change for every move; the look-ahead runs on a time budget. Nothing is dropped without being on the keep-list first. | new | Patrick, 4 Oct 10:36Z (card). The architecture review found the model sound and the decisions tangled: five places pick moves, pursuit never ends, G and roll change in one step (`pf/turn-fight-review/review.md`). |

## B. New plan step for `docs/modules/turn-fight/plan.md` (before today's Step 2)

### Step 1b. Refactor the pilot layer (TF-57)

- [ ] **Keep-list first.** Before any code moves: list every behaviour, setting and readout the Energy fight has today, and record the 19 traced fights (`pf/turn-fight-review/traces.md`) as the "before" run. Patrick sees the list.
- [ ] **PR 1, move only.** Split `energy-sim.js` into the pilot, the moves, the smoothing layer (switched off), the look-ahead and the judge, with core's formulas in place of the local copies. The 19 fights must give the same results as before, or it does not merge.
- [ ] **PR 2, smooth inputs.** Switch on the smoothing layer: G builds at a set rate and roll eases in and out, for every move. Default "brisk" (Patrick, 4 Oct 10:38Z): G onset about 6 G per second, and the roll rate reaches 90°/s in about 0.25 s (360°/s²). Both are estimates until a manual or Patrick's practice gives a number, and both are in Advanced setup. A setting turns it off to compare. The tumble moves onto the same aircraft model. Checked on screen: no snaps in 3D, fights still end sensibly.
- [ ] **PR 3, one pilot.** The pilot alone picks moves, for Auto and Tactical alike; pursuit can end; collision avoidance works in every move; the tuning numbers are retuned now that reaching the MPT is not a goal (TF-R6 reworded first). Checked against the "before" fights and on screen from the default start.
- [ ] **PR 4, speed and flags.** The look-ahead gets a time budget (no wait on Reset, no hitch); the hard-deck and top-speed flags from Step 2 land here.
- [ ] **Controls and Advanced setup.** The settings catalogue's cut list (`pf/turn-fight-review/settings-catalogue.md`) was approved by Patrick (card, 4 Oct 10:41Z) and is applied in the PR that touches each control. The extra settings that are kept go into one menu labelled **Advanced setup**, closed by default. Every number in it has a line beside it saying what it is, why it is set to that value (manual page, Patrick's ruling, or "estimate"), and what changing it does (Patrick, 4 Oct 10:38Z). It replaces today's "More energy settings" and "Model settings for checking".

## C. The keep-list (draft; filled out in full before PR 1)

Kept as is: aircraft model and T-6 performance (core); stall, over-G and shaker flags; the eight moves (pitch back, slice, Immelmann, split S, low and high yo-yo, MPT and level MPT, pursuit with pure, lead, lag and tactical aim); Auto's SMM-table pick and Immelmann / pitch-back race; the Tactical look-ahead and advantage score; first nose-on, chase, even fight; gun kill and auto-pause; mid-air collision and tumble; start geometry and the 5 presets; the 10-minute stop; every readout, the graph, the 2D and 3D views; the Simple circles fight.

Changes (each one listed in its PR): G and roll no longer change in one step; Auto re-decides during the fight; pursuit can end; avoidance in every move; the tumble uses the main model; tuning retuned; one defaults table; one version label.

Goes: Climb and dive and its controls (TF-R22, already ruled); the duplicate maths copies; anything else only with Patrick's yes.
