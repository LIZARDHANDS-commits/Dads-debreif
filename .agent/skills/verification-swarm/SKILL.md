---
name: verification-swarm
description: >-
  Plans, launches, monitors and finalizes a multi-agent verification or
  audit swarm with any agent runner (Claude Code's agent tool or
  Antigravity's). Use when Patrick says "run a
  swarm" or wants a team of agents to cross-check reports or a body of
  work.
---

# Verification Swarm Operations

## Overview

General-purpose workflow for dispatching, monitoring, and finalizing
multi-agent verification swarms with any agent runner (Claude Code's agent
tool or Antigravity's). Covers prompt
engineering, calibration, failure handling, concurrent editing hazards,
and the full lifecycle from draft through finalization.

### Skill Layout & Tooling

```
verification-swarm/
├── SKILL.md                                        # Universal core methodology
├── scripts/
│   ├── verify_citations.py                         # Citation linter: file:line, transcript #step, verbatim quotes (0 tokens; --selftest)
│   └── reconcile_census.py                         # Census reconciler: raised/reviewed/survived + origin & convergence (--selftest)
└── references/
    ├── evidence_witness_hierarchy.md               # 4-tier witness model
    ├── finalization_lifecycle.md                   # Phase 4 in full: drift, counts, status levels, promotion, census, history audit
    ├── prompt_engineering_rules.md                 # Phase 1 §1.3a–§1.13 in full: two-lens buckets, citations/witness tiers, blind examiners, cold read, observer, judge panels
    ├── adversarial_deflation_playbook.md           # Two-step rhetoric stripping & P1–P4 re-grading
    ├── finding_schema_template.md                  # Standardized Markdown + YAML finding block
    └── corpus_scour_and_archival_protocol.md       # 3-tier archival triage & anti-G-2 extraction gate
```

## When to Use

- Dispatching agents to verify or audit any deliverable (plans, code, reports, configurations)
- Cross-checking a set of specialist reports against a synthesis
- Running adversarial verification of any document or codebase change
- Extracting insights from a corpus of agent transcripts or logs
- Scouring multi-document project repositories to catch implementation gaps, register drift, and safe archival candidates

---

## Phase 1: Prompt Engineering

### 1.1 Structure the Prompt
Every swarm prompt needs these sections:

| Section | Purpose |
|---------|---------|
| **1–2 sentence description** | What the swarm is doing and why |
| **Input location** | Where to read from (corpus, reports, codebase) |
| **Output location** | Where agents write their files |
| **Requirements (R1, R2, …)** | What to extract/verify — specify **what**, not **how** |
| **Acceptance criteria** | Objective, checkable conditions for completion |

### 1.2 The Environment Reality Check
Before finalizing any requirement, ask:

> "What tools and context does this swarm actually have access to?"

Swarm agents are **external** — they run in their own sessions with
generic tools. They CANNOT observe:
- Runtime state of any system under test (hooks, daemons, live processes) as it happens
- Internal persona/role engines of the system being audited
- Session memory or context from prior conversations

They DO have access to:
- Files on disk (read and write)
- Standard tools (grep, file viewing, command execution)
- Each other's output files (for synthesis phases)

**Kill any requirement that assumes capabilities the agents don't have.**
This is the single most common prompt engineering failure — it produces
logically impossible requirements that waste entire review cycles to catch.

#### Can't observe ≠ can't damage
The same agents that cannot *see* a live system can still *break* it. Anything they execute — a
test suite, a reset script, a hook invoked from the command line — acts on the shared files that
system runs on. In one measured incident a parallel agent ran a state-reset script mid-way through
a live test session, and a test fixture deleted the live logs the evaluation depended on; the run
had to be repeated. Therefore:
- **Anything executable runs against a whole-copy clone**, never the live tree. Copy the entire
  root the system resolves its paths from, not one subfolder.
- **Auditors read frozen snapshots**, not live append-only files. Copy the logs and state at the end
  of each unit of work; a live log keeps growing while the auditor reads it.
- **Pipelining is safe only on snapshots.** An audit swarm can work one step behind a live run
  (auditing unit N while unit N+1 executes) exactly when it reads nothing the live run writes.

### 1.3 Calibration: Tell Agents What to Distrust
If the input material has known reliability issues, state them explicitly:
- **Base rate:** "X% of findings in this corpus did not survive re-check.
  Treat uncorroborated claims as hypotheses."
- **Known error classes:** "The source material has [specific class] of
  errors. Check for these before promoting."
- **Accepted-defect tables:** If a prior pass already triaged findings,
  point agents to it so they don't re-report known items.

Without calibration data, agents will confidently promote unreliable claims.

### 1.3a–1.13 Prompt-engineering rules (full text in references)

Read [references/prompt_engineering_rules.md](./references/prompt_engineering_rules.md) before writing any swarm prompt — it holds the full text of §1.3a–§1.13, by number (citations elsewhere use these):

- **§1.3a Calibration runs both ways** — Partition two-lens review outcomes into three buckets (facts and consequence held, facts held but consequence disputed, facts refuted) so a contested-but-real defect is deflated and triaged, never auto-dropped with the rhetoric.
- **§1.4 File-per-agent rule & finding schema** — Every agent writes its own numbered file per finding, using the fenced YAML plus narrative finding-schema block; unstructured reports degrade downstream synthesis.
- **§1.5 Citation contract & witness hierarchy** — Require a source citation and a substrate citation graded by the 4-tier witness hierarchy (self-report / derivative / execution / immutable), citing full repo-relative paths and the commit the run actually executed on.
- **§1.6 Read-only constraints** — State read-only constraints explicitly, but treat a verifier able to write into the artifact it checks as a structural harness defect, and freeze/hash the checker so a run can't rewrite the tool grading it.
- **§1.7 Prove the controls fire** — Every verification suite must prove it fails on unfixed input before its pass is trusted, and swarms should include at least one dimension expected to surface a finding.
- **§1.8 Blind examiners** — Examiners get no shared scratchpad or message passing so independent convergence stays real evidence, and downstream reviewers see only the finding, never the upstream reasoning.
- **§1.9 Pre-declare the baseline state** — Tell agents the current baseline (VCS status, known-broken, mid-change items) up front so they don't burn effort re-discovering it or report known conditions as new findings.
- **§1.10 Cold-read isolation** — Assign at least one agent to read only the deliverable and its system, forbidden from review history or rationale, to test whether the work stands alone.
- **§1.11 The open observer** — Add one blind, evidence-bound, uncapped observer per unit of work whose only job is to flag anything anomalous outside the planned checklist, verified like every other finding.
- **§1.12 Judge panels** — LLM-judge panels need one rubric per call, several independent samples, pre-fan-out calibration, and a separate verification pass that re-derives facts from the record before any human sees a verdict.
- **§1.13 Check expected literals against a real run** — Have agents check expected literals (strings, regexes, log fields, paths) against a real prior run's actual output, not only the spec, since spec-only checks inherit the spec's bugs.

---

## Phase 2: Launch & Monitor

### 2.1 Launch
After user approval, launch the agents with your tool's own agent or subagent
feature (Claude Code uses its Agent tool).
**Copy the full prompt text** into the invocation — do not pass a file path
(the artifact may change after launch).

**Launch hygiene:**
- **One fresh request file per run.** Orchestrators that append every request into a single shared
  file hand each new run all the old
  briefs; one measured orchestrator read 1,200 lines of past swarm requests to find its 80-line
  brief. Archive the old file before launching.
- **Write the model tier into each worker's brief.** Defaults such as `inherit` silently
  give every worker the orchestrator's model; §2.1a's tiering only happens if the prompt states it.
- **State the ceiling and the checker hash in the prompt** (§2.1a, §1.6), so the victory audit can
  compare against them.
- **Worktree agents branch from the pushed branch** (`origin/main`), not local HEAD: push before
  launching them, and give each brief a first step ("`git log --oneline -1` must show <sha>, else
  stop"). Remove a worktree once its branch is merged — each one duplicates every path in the repo
  and confuses path-resolving tools.

### 2.1a Declare the Fan-Out Ceiling Before Launching

Agent count is knowable in advance. Compute and state it:

```
ceiling = dimensions × findings-cap-per-dimension × review-lenses  (+ synthesis agents)
```

A modest-looking design — a dozen dimensions, eight findings each, two lenses — is **200+ agents**.
The requester should learn that number from you before the run, not from the bill afterwards.

**Two levers cut it without losing signal:**

| Lever | Why it works |
|-------|-------------|
| **Escalate by severity** | Send only blocker/major findings to full adversarial review. Minor and cosmetic go straight to human adjudication — they do not need a panel. |
| **Tier models by role** | A lens doing mechanical string/line matching does not need a frontier model, and a cheaper one often does it *more* precisely because it editorialises less. Reserve frontier models for examination and consequence analysis. |

Applied together these typically cut cost by ~75% with no loss of findings.

### 2.2 The Concurrent Editing Hazard

> **CRITICAL:** Do NOT edit any file the swarm is reading while it runs.

Swarm agents cache files at session start. If you edit a file concurrently,
the swarm will make false claims about the file's state because it is
working from stale context. This is not a bug — it is an inherent property
of parallel agent sessions.

**If you must make corrections during a swarm run:**
- Document them separately
- Reconcile after the swarm completes
- Expect the swarm's output to contradict your edits (and note why)

### 2.3 Monitor
The sentinel reports progress automatically. Watch for:
- **Liveness:** `progress.md` updated within 20 minutes = healthy
- **Phase transitions:** dispatch → extraction → synthesis → verification
- **Victory audit:** mandatory blocking gate before completion

---

## Phase 3: Post-Swarm Verification

### 3.1 Victory Audit Failures Are Normal
Common rejection causes (all remediable):
- **Hallucinated IDs** in census/summary tables (synthesizer invents
  identifiers instead of transcribing from source reports)
- **Misaligned line numbers** in substrate citations
- **Self-stamped AUTHORITATIVE** on derivative documents

The orchestrator will automatically remediate and re-submit. Expect
1–2 rejection cycles on complex runs.

### 3.2 Independent Spot-Checks
After victory confirmation, independently verify:
- [ ] Output directory contains one file per agent + one synthesis
- [ ] `git status` shows only expected file changes
- [ ] No files outside the designated output area were modified
- [ ] Test suite still passes (if applicable)
- [ ] Register entries use correct next-available IDs and don't collide with
  entries from concurrent sessions
- [ ] Every count in a census or summary table states **which quantity** it holds

#### Deterministic Census Reconciliation:
To guarantee that findings counts reconcile across examiner reports, review lenses, and final synthesis, run the deterministic reconciler:
```bash
python3 .agent/skills/verification-swarm/scripts/reconcile_census.py --dir [output_dir] --output [output_dir]/CENSUS_RECONCILED.md
```

### 3.3 An Audit Must Re-Derive, Not Re-Read
A swarm's own "forensic" or "integrity" audit is only evidence if it reproduces something:
- **Re-run at least one command per empirical claim** (the rehearsal, the probe, the test) and
  compare output.
- **Open a sample of cited lines** and check they say what the finding claims.
- Checking that a report *contains* the expected words ("HEALTHY", "19 rubrics", "0 violations")
  is Level 1 evidence at best — it verifies the report, not the world.
- **A zero-defect audit triggers a second audit** by a different agent (§1.7: a clean result from
  a dimension that should find something means suspect the harness). In one measured run an
  audit reported "CLEAN, 0 defects"; an independent pass then found three P1 checklist defects and
  an answer-key leak.
- **A checker that reads the plan repeats the plan.** An in-session sub-agent asked to "make sure we
  got all the updates" read the adjudication plan and confirmed it; it missed a refuted evidence
  run, a register-ID collision and seven unlogged findings. Point checkers at primary artifacts
  (transcripts, logs, the files on disk), never at the summary being checked.
- **"Orphaned" / "unreferenced" claims need the grep that proves them.** One auditor called a
  script orphaned while an active doc cited it.

---

## Phase 4: Finalization Lifecycle

The full text lives in [references/finalization_lifecycle.md](./references/finalization_lifecycle.md) — read it
before writing any synthesis, ledger or register entry. The rules, by number (citations elsewhere use these):

- **§4.1 Summary of a summary drifts** — re-verify every restated path, command and count against the source; corrections as C1, C2 …, never silent edits.
- **§4.1a Raised vs reviewed** — label every count (raised / reviewed / survived / accepted); a cap is not a count.
- **§4.2 Status levels** — DRAFT → PROMOTED → AUTHORITATIVE (Patrick only); a synthesis never declares GO.
- **§4.3 Follow-up audit** — a second swarm produces a recommendations-only delta; extract to `ADDENDUM.md`; archive the audit.
- **§4.4 Agents report, the orchestrator promotes** — agents never write registers or assign numbers; file-per-agent reports; numbers at ratification; dedupe against the open registers; the run folder moves to `docs/archive/swarm/` after promotion.
- **§4.4a Promotion census** — done means every surviving finding is promoted, `DUP of <id>`, or rejected with a reason; survived = promoted + duplicate + rejected.
- **§4.4b Conversation-history audit** — extract Patrick's messages and decision turns, inventory, classify COVERED / SUPERSEDED / PARTIAL / MISSING; a transcript proves what was said, not that it was true.
- **§4.5 Corpus scour & safe archival (anti-G-2)** — three-tier classification, normative extraction gate, precedence hierarchy ([reference](./references/corpus_scour_and_archival_protocol.md)).

---

## Instantiating This Per Project

This skill is the method. The specifics — which dimensions suit which kind of change, where the
harness lives, what this project's own measured base rates are — belong in a project-level
verification command, not here. Keep that boundary: when project detail leaks into this file, the
skill stops being portable to the next codebase.

**Severity scales:** this skill grades P1 (blocker) … P4 (cosmetic). If the project's register uses a
different scale, state the mapping in the swarm prompt (e.g. P1..P4 → P0..P3) and write findings in
the **project's** scale — two scales in one register make every count ambiguous.

---

## Anti-Patterns

| ❌ Anti-Pattern | Why It Fails |
|----------------|-------------|
| Assuming swarm agents have runtime/internal capabilities | Produces logically impossible requirements |
| Editing files while swarm is running | Creates stale-context false claims |
| Letting synthesis self-stamp AUTHORITATIVE | Derivative documents have no authority path |
| Silent edits to correct synthesis errors | Loses the delta evidence about reliability |
| Trusting restated mechanics without spot-checking | Each extraction layer degrades paths, counts, IDs |
| Skipping the citation contract | Hallucinated claims enter registers unchecked |
| Passing artifact file path instead of prompt text | Artifact may change after launch |
| Omitting calibration data from the prompt | Agents confidently promote unreliable claims |
| Treating the two-lens survivors as the final finding set | Over-rejection silently drops verified defects |
| Dropping verified defects due to consequence rhetoric | Reviewers attack examiner drama instead of deflating the fact |
| Rating code defects P1/P2 without executable repro | Theoretical phantom bugs flood registers and waste triage |
| Retiring files without the Anti-G-2 extraction gate | Orphaned normative rules disappear silently into archive folders |
| Launching without computing the fan-out ceiling | Cost is discovered from the bill, not the design |
| Frontier models on mechanical matching lenses | Large spend for worse precision and more rhetoric |
| Relying on instructions to keep verifiers read-only | Scripts mutate what they verify; make it structurally impossible |
| Shipping a verification suite with no failing mode | A suite that checks nothing is indistinguishable from one that passes |
| Giving examiners a shared scratchpad | Converts independent corroboration into one anchored opinion |
| Reporting a findings cap as a findings count | Makes every downstream total irreconcilable |
| Skipping cold-read isolation | Nobody who has read the rationale can test whether the work stands alone |
| Letting swarm agents execute against the live system under test | Can't observe ≠ can't damage — resets and test fixtures corrupt a live run |
| Auditing live append-only logs | The next unit of work writes into the evidence while it is read |
| Running only planned checks | Finds only predicted defects; add a blind open observer (§1.11) |
| Treating a judge majority as evidence | Scores are claims; verify quotes verbatim before a human sees them (§1.12) |
| Letting a run change the checker that grades it | "100% verified" becomes a property of the edit, not the work (§1.6) |
| Verifying expected literals only against the spec | The checklist inherits the spec's bugs (§1.13) |
| Accepting an audit that re-ran nothing | Keyword presence verifies the report, not the world (§3.3) |
| Letting a synthesis declare GO | Only the gate owner decides (§4.2) |
| Bare file names in citations | The linter cannot know which `routing.json` you meant (§1.5) |
