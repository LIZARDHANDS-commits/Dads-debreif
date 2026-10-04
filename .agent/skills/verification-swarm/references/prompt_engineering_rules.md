# Verification Swarm — Phase 1: Prompt-Engineering Rules §1.3a–§1.13 (reference)

> Moved verbatim from `SKILL.md` on 2026-09-26 (agentskills.io: keep SKILL.md under 5,000 tokens / 500 lines; long material in `references/`). Section numbers are unchanged so existing citations (`§1.5`, `§1.11` …) still resolve here. `SKILL.md` keeps a one-line summary per rule.

### 1.3a Calibration Runs Both Ways — the asymmetry that costs most

A two-lens review gate (one lens checks the **facts**, one checks the **consequence**) fails in
*both* directions, and the second is the one teams miss.

| Failure | Looks like | Cost |
|---------|-----------|------|
| **Over-acceptance** | Confident findings that dissolve on inspection | A wasted review cycle |
| **Over-rejection** | Findings whose facts are fully confirmed, killed because the reviewer attacked an *overstated consequence* while the real defect stood | **A real defect ships** |

Examiners inflate consequences to make findings look important ("breaks everything", "silent
corruption"). Consequence reviewers then refute the rhetoric and mark the whole finding dead —
discarding a verified fact along with the exaggeration.

**Partition outcomes into three buckets, not two:**

| Bucket | Meaning | Disposition |
|--------|---------|-------------|
| Facts held **and** consequence held | Survived both lenses | Accept |
| **Facts held, consequence disputed** | The defect is real; only its stated impact is contested | **Deflate & Triage — never auto-drop** |
| Facts refuted | The citation does not support the claim | Drop |

> **Never ship the survivors as the answer.** The middle bucket is where the expensive misses hide.
> In one measured run it was the *largest* of the three and roughly half of it was genuine.

#### The Two-Step Deflation Protocol (Handling Bucket 2)
To prevent human review fatigue while preserving every confirmed defect:
1. **Strip the Rhetoric:** The Reviewer Lens converts catastrophic framing into an objective, neutral mechanical delta (e.g., *"Regex misses underscore in mode name"*).
2. **Re-Grade Severity (P1–P4):** Re-classify into P1 (Blocker), P2 (Major), P3 (Minor), or P4 (Cosmetic).
   * **P3/P4 Deflated Items:** Automatically batched into the Maintenance Backlog (no human debate needed) — **unless the project's gate requires every flag to be adjudicated**, in which case the project rule wins and they join the human queue, ranked last.
   * **P1/P2 Genuine Disputes:** The only items escalated for human adjudication by Patrick.
3. **The Code Reproduction Gate:** If an examiner claims a code/runtime defect is **P1 or P2**, it MUST include an executable reproduction command (`repro_command`). Claims lacking an executable repro that fails on disk are auto-demoted to P3. (See [Adversarial Deflation Playbook](./references/adversarial_deflation_playbook.md)).

### 1.4 The File-Per-Agent Rule & Finding Schema
Include in every swarm prompt:

> "Every agent writes its own numbered file under `[output_dir]/`.
> A report that isn't a file didn't happen."

**Enforce the Standard Hybrid Finding Block:**
Examiners must format every distinct finding using a fenced YAML metadata block (`id`, `target`, `source_citation`, `severity`, `category`, `repro_command`) followed by neutral observation, expectation, and evidence sections. Reports lacking this structure degrade downstream synthesis. (See [Finding Schema Template](./references/finding_schema_template.md)).

### 1.5 The Citation Contract & Witness Hierarchy
Require agents to cite their sources at two levels:

1. **Source citation:** Where in the input material did they find this?
   (e.g., `report_name.md:line` or agent ID)
2. **Substrate citation:** Where in the live codebase/docs can this be
   verified? (e.g., `file.ext:start-end` in the actual repository)

Claims that cannot cite both levels are dropped.

#### Cite the substrate the run used
- When auditing a recorded run (a test flight, a transcript), cite rules **at the commit that run
  executed on**, not at a stage tag or today's HEAD. Record that commit with the run's artifacts
  (e.g. `substrate=<sha>` in the bounds file) so auditors can `git show <sha>:<path>`.
- Before a run is used as evidence, confirm it ran on the substrate under test. In one measured
  case a "proof" run was a legacy-system session, and the ruling built on it had to be reopened.
- Cite **full repo-relative paths** for anything that gets snapshotted into run artifacts (live
  state files, logs): once snapshots are archived, a bare filename matches several files.

#### The 4-Tier Witness Hierarchy:
Grade all claims by the strength of their witness (See [Evidence Witness Hierarchy](./references/evidence_witness_hierarchy.md)):
* **Level 0 (Self-Report):** *"I verified X"* $\rightarrow$ **Dismissed.**
* **Level 1 (Derivative):** Citations to other agent summaries $\rightarrow$ **Untrusted without re-derivation.**
* **Level 2 (Execution):** Command stdout, pytest logs, non-zero exits $\rightarrow$ **Supportive.**
* **Level 3 (Immutable Substrate):** Physical `file:line` match in repository $\rightarrow$ **Authoritative.**

Runtime evidence ranks by whether it can still change: an **archived** transcript or log snapshot
(`run.jsonl#step=N`, a copied log) is Level 3 for *what the system did*; a **live** log that is
still being appended to is not a stable witness. A judge's score is Level 0 until its quotes are
verified (§1.12).

#### Mechanical Pre-Flight Check:
Before synthesis or manual review, run the zero-token citation linter to eliminate mechanical hallucinations:
```bash
python3 .agent/skills/verification-swarm/scripts/verify_citations.py --selftest              # control fires?
python3 .agent/skills/verification-swarm/scripts/verify_citations.py --dir [output_dir] --strict
```
It checks `file:line` bounds, transcript `file.jsonl#step=N` records, and that every
`evidence_quote:` appears **verbatim** in a location cited in the same finding block. A paraphrased
or invented quote fails mechanically (`QUOTE_NOT_FOUND`) before any reviewer spends a token on it.
A shortened path is accepted only when exactly one file ends with it; a bare name that matches
several files (`routing.json`, `rule.md`, `00_INDEX.md`) is `AMBIGUOUS_PATH`. **Require full
repo-relative paths in the prompt** — the linter must never guess which file an author meant.

### 1.6 Read-Only Constraints
If agents should not modify certain files, say so explicitly:

> "Do NOT modify [files]. Do not commit [directory]."

Swarm agents will helpfully "fix" things they find unless told not to.

**But instructions are not a control.** Agents violate them, and — more insidiously — the
*verification scripts themselves* can mutate the thing they verify. A checker that writes state
into the target to set up a test will corrupt that target when someone points it at the live copy.

> **Verification tooling must be structurally incapable of writing to the artifact it verifies.**

Inject required state through scratch locations and monkeypatched paths; never write the target.
Treat "the verifier can write" as a defect in the harness, not a usage caution. Audit for it the
same way you would audit for a missing citation.

#### Freeze the verifier for the length of a run
The swarm must not be able to change the checker it will be graded by. In one measured run the
commit that carried a swarm's results also loosened the citation linter (a hard-coded list of
directories to guess from); more than half of its "100% verified" citations passed only because of
that change, and dozens named files that exist in several places.
- Record the checker's hash in the prompt at launch (e.g. `sha256` of each verification script).
- Any run whose results arrive together with a changed checker is **unverified** until it is
  re-checked with the launch version. Improve the checker in its own reviewed change, never inside
  the run it grades.
- A private copy of the checker inside the swarm's workspace is not the checker.

### 1.7 Prove the Controls Fire

A suite that cannot fail proves nothing. Every verification suite ships with a mode that asserts
the defect is **present** on the *unfixed* input:

```
verify_thing.py <target>                    # expect PASS on the fixed artifact
verify_thing.py <unfixed-copy> --expect-broken   # expect it to REPORT the defect
```

Run the second before trusting the first. Without it a suite that silently checks nothing is
indistinguishable from one that passes — and both produce a green result.

The same discipline applies to the swarm itself: include at least one dimension whose expected
outcome is a *finding*. If it comes back clean, suspect the harness before believing the artifact.

### 1.8 Blind Examiners — why convergence is evidence

Examiners get **no shared scratchpad and no message passing**. Each receives only its own brief
and the material.

This is not isolation for its own sake. When several agents that cannot see each other flag the
same defect, that agreement is independent evidence. Give them a shared blackboard and the first
agent's framing anchors the rest — N opinions collapse into one opinion echoed N times, while
*looking* like corroboration.

Information flows one direction and lossily: pass downstream reviewers the **finding**, not the
upstream reasoning, so they must re-derive it from the source. A reviewer who can read the
examiner's argument will grade the argument instead of checking the claim.

### 1.9 Pre-Declare the Baseline State

Tell agents what the work currently looks like: version-control status, what is expected to
differ, what is mid-change, what is known-broken. Without it they spend a large share of their
effort establishing orientation, and they report known-expected conditions as discoveries.

### 1.10 Cold-Read Isolation — testing whether work stands alone

Assign at least one agent to read **only the deliverable and the system it describes**, explicitly
forbidden from opening review history, rationale documents, design notes, or prior audits.

It simulates the reader who will actually execute the work. This is the only reliable test of
whether a deliverable is self-sufficient, because **the author cannot unknow the context — and
neither can anyone who has read the reasoning.** Everything obvious to the team is invisible to
them precisely because it is obvious.

Expect this dimension to produce the findings that embarrass you most usefully.

### 1.11 The Open Observer — the lens for defects nobody predicted

Planned checks (checklists, rubrics, examiner dimensions) only find the defects someone thought to
look for. In one measured run, three of eight real findings were in nobody's checklist — they were
noticed by an agent that simply read the whole record.

Add one observer per unit of work with a single job: *list anything that looks wrong or surprising.*
- **Blind to the plan.** It does not see the checklist, the rubric anchors or the expected outcome;
  seeing them anchors it to the predicted defects (§1.8).
- **Evidence-bound.** Every item carries a verbatim quote and a location, plus the rule it
  contradicts (`file:line`) or "none — oddity only".
- **Uncapped, counted.** It reports how many items it raised; zero is a valid, reported answer.
- **No self-dedup.** A downstream aggregator links observer items that duplicate planned findings
  (`dup_of`) and keeps both — when a blind observer and a planned check converge, that is evidence.
- **Verified like everything else.** Observer items enter the same verification pass (§1.12) and
  are tagged `origin: OBSERVER` so the census can report what the planned checks missed.

It differs from §1.10's cold reader: the cold reader tests whether a *deliverable* stands alone; the
observer inspects a *record of behaviour* for anything anomalous.

### 1.12 Judge Panels — a majority is not evidence

When agents *score* a record against rubrics (LLM-as-judge) instead of hunting defects:
- **One rubric per call, never the expected answer.** A judge that sees the intended outcome grades
  against it.
- **Several independent samples; disagreement is a flag,** not an average.
- **Calibrate before fan-out:** re-grade every pass in the first unit with a fresh judge; any flip
  stops the run until the anchors are fixed.
- **A verdict is a claim, not a witness.** A majority of judges agreeing is Level 0 until the quotes
  they relied on are checked verbatim against the record. Put a **verification pass** between the
  judges and any human queue: one agent that receives each finding's statement and citations only
  (never the judges' reasoning), re-derives the fact from the snapshot, and assigns the three
  buckets of §1.3a. Run the citation linter first so invented quotes never reach it.
- Tier it: mechanical matching (checklists, aggregation, observation) gets a cheap model; judging and
  the verification pass's consequence call get a capable one (§2.1a).

### 1.13 Check Expected Literals Against a Real Run
When agents write assertions (expected strings, regexes, log fields, paths) for a system that has
already produced real output, have them verify each literal against that output — not only
against the specification. A checklist verified only against the spec inherits the spec's bugs: in
one measured run a footer banner was asserted with brackets in seven places because the test plan
said so, while every real transcript rendered it without them. Presence checks would have failed
every correct run; absence checks would have passed every leak.
