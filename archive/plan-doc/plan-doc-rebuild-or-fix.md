# Rebuild or fix in place
(Plain-text copy of Claude Doc tab "Rebuild or fix" node 3baf1935-931c, rev 14, read 3 Oct 2026. Hand-transcribed; tables flattened.)
2026-09-29 · Patrick Korhonen
Rebuild module by module (option C below). It costs the most work before anything new reaches users, but it is the only option that fixes the overlap and interference problems and ends with a modular, tested tool. Patching V6 is cheaper now and can fix most individual bugs, but not the 10 structural ones behind the overlaps you reported.
## Options at a glance
- A. Patch V6. Keep the single file and fix issues one by one in a copy of it.
- B. Refactor V6 in place. Split the file into modules step by step, keeping it working after every step.
- C. Rebuild module by module (D30). A new shell and shared core, with V6 as the spec. Flight math is copied over function by function under tests, and each module is signed off against V6 before it counts as done.
| | A. Patch V6 | B. Refactor in place | C. Rebuild module by module |
| Work before users see an improvement | Least. The first fixes can ship right away. | Some. Most fixes wait until the piece they touch is split out. | Most. The shell, shared core and tests come first, before the first module is usable. |
| Reaching your goals (modular, small, easy to change) | Never. 10 of the 49 issues are structural, and patches cannot reach them. | Eventually, but most modules get rewritten along the way. 58% of the SOF's JavaScript never runs. | Directly. Each module is written once, to its spec. |
| Modularity | None. All modules share one page and one set of globals, so any patch can break another module. V6 already carries six stacked CSS patch layers and 348 !important rules. | Improves step by step, but the boundaries follow V6's accidental ones. | Built in. One module is open at a time, shared code sits in one core, and dependencies run one way. |
| Quality and testing | Hard. Flight math reads its settings straight from input boxes, so every test has to drive a browser. A parser fix must be repeated in each copy (about 8 METAR/TAF parsers). | Unit tests become possible as each piece is extracted. | Unit tests from the first line, golden tests against V6's recorded numbers, and browser tests for overlaps and background loops (R2 to R7). |
| Functionality (risk of losing features) | Lowest. Nothing is removed, including the dead buttons. | Low. | Real risk of missing something. Covered by the code maps that list every control, a sign-off checklist per module, and V6 kept to compare against. |
| SOF weather safety | Quickest first patch, but the SOF's running code reads weather in about 5 places, each needing the fix, with no unit tests. | Same as A until the SOF is split. | No urgency, because V6 is not in use. The weather parser is written once, with a test for every bug the audit found, and the SOF stays last in the build order. |
| Speed and size | Videos can move out (61.6 MB down to 2.3 MB), but every module keeps running in the background, including the SOF's 12 timers and 3 live map pages. | Improves as modules split. | Only the open module runs, and the build enforces a size budget. |
| Readability for Dad | Familiar: his own code, but still about 7,200 dense lines in one page and the two pages embedded in it. | Familiar code, moved into files. | A new layout to learn. It stays plain JavaScript with no framework, keeps his function names where math is ported, and has a README per module. |
| Risk of stalling | Low per fix, but the structural problems never shrink. | Highest. A long half-split period where old and new wiring coexist. | Medium. Each finished module is usable on its own, so a pause still leaves working pieces. |
The flight math is the same under all three: V6's numbers are carried over unchanged and pinned by tests, and any correction needs Dad's sign-off (Q18). A fourth option, rewriting everything and switching over on one day, is not recommended: nothing is usable until all of it is.
## Where the 49 issues land
A patch could fix 31 of the 49 issues in V6. The case for rebuilding rests on the other 10: they are the overlap and interference problems you reported, and a patch cannot reach them.
| Kind of fix | Issues | Examples |
| Local patch in V6 | 31 | #1 TAF fractions, #23 example flight not fitted to view, #45 Pair spawns on the wrong route. Some must be repeated in every copy: #1 and #3 in about 5 live parsers, #29 in 4 colour tables. |
| Structural change | 10 | #34 side rails over every module, #36 map not resized, #39 hidden modules keep running, #19 two tennis solvers, #42 no shared Zulu switch, #43 duplicated code, and in the SOF #6, #7, #10, #11 |
| Dad's decision first | 8 | #13 to #16, #18, #20 and #47 (flight numbers), #9 (lightning source). Needed under any option. |
This split is Claude's judgement, issue by issue, from the audit in docs/audit/.
## Risks of rebuilding
| Risk | How it is handled |
| A feature gets lost | The code maps list every control and function in V6. Each module's spec names the V6 behaviour it keeps, and a person signs off a checklist before V6's version retires. |
| A number changes by accident | Flight math is copied, not rewritten, and golden tests compare it with V6's recorded numbers. |
| The rebuild stalls halfway | Each module ships on its own, so a pause still leaves the finished modules working. |
| Dad finds the new code unfamiliar | Plain JavaScript with no framework, one folder and README per module, and his function names kept where math is ported. |
## Recommendation
Rebuild module by module, in the build order in SPEC.md, with the SOF last. V6 is not in use (Patrick, 2026-09-29), so nothing needs to jump the queue.
V6 is not patched. It stays untouched in original/ as the spec and the source of the recorded numbers.
You chose this on 2026-09-29, so D30 in Decisions is now Decided. Nothing gets built until you have reviewed SPEC.md in PR #50 (https://github.com/LIZARDHANDS-commits/Dads-debreif/pull/50).
