# Evidence Witness Hierarchy & Citation Verification

> **Core Axiom:** A self-reported claim is an unverified hypothesis. In multi-agent verification, assertions are graded strictly by the strength of their witness, never by the eloquence or confidence of the agent making them.

---

## 1. The 4-Tier Witness Hierarchy

When reviewing findings or constructing victory audits, every cited claim must be mapped to one of the following witness tiers:

| Tier | Witness Level | Operational Definition | Evidentiary Weight | Swarm Action |
| :--- | :--- | :--- | :--- | :--- |
| **Level 0** | **Self-Reported Assertion** | The agent states a condition holds without citing external files or command output (e.g., *"I checked all mode files and verified Law 1 is followed"*). | **Zero** | **Dismissed immediately.** Cannot be used to substantiate a finding or a pass. |
| **Level 1** | **Derivative Restatement** | A citation pointing to another agent's report, a previous synthesis summary, or secondary review commentary. | **Low** | **Untrusted without re-derivation.** Subject to "Summary of a summary drifts" (§4.1). Must be traced back to substrate. |
| **Level 2** | **Execution Evidence** | Deterministic tool output: non-zero exit codes, automated test runner outputs (`pytest`), compiler logs, or script stdout. | **Supportive / Strong** | **Accepted for functional behavior**, provided the command itself is reproducible and not tautological. |
| **Level 3** | **Immutable Substrate Match** | Direct, verifiable `file:line` citation pointing to committed code, rules, or data on disk that anyone can inspect at a named git commit: HEAD for the live tree, or the commit a recorded run executed on (SKILL §1.5). | **Authoritative** | **Primary standard of truth.** Survives as a verified mechanical fact. |

### Runtime records and judge verdicts

| Evidence | Tier | Why |
| :--- | :--- | :--- |
| Archived transcript record (`run.jsonl#step=N`) with a verbatim quote | **Level 3** | Immutable once copied; anyone can re-read the same bytes. It proves what was said or done in the run, not that a claim made in it is true (SKILL §4.4b) |
| Archived log snapshot (copied at the end of the unit of work) | **Level 3** | Same |
| Live, still-appended log or state file | **Not a stable witness** | Its content changes while it is read; cite a snapshot instead |
| LLM-judge score or majority verdict | **Level 0** until its quotes verify | A score is a claim about the record, not the record |

---

## 2. The Two-Level Citation Contract (§1.5)

Examiner agents must provide citations at two independent levels for every finding:

```
[Finding] ──┬──> 1. Source Citation (Where did the agent spot the issue?)
            │    e.g., report_name.md:45, PR description, or review note.
            │
            └──> 2. Substrate Citation (Where in the live filesystem does this live?)
                 e.g., AGENTS.md:74-78
```

### Citation Invariants:
1. **No Bare File Paths:** A citation must specify both the path and the exact line number or range (`path/to/file.ext:start-end`). A citation without line numbers is treated as an ungrounded search query.
2. **Substrate Grounding:** Substrate citations must resolve against the physical files on disk at the commit under test.
3. **No Phantom Paths:** Citations to hypothetical files, outdated legacy paths, or uncommitted files fail immediately.
4. **Transcript Steps:** A runtime record is cited as `path/to/run.jsonl#step=N`, never by a line number of a file that may be re-serialised.
5. **Verbatim Quotes:** When a finding rests on wording, it carries `evidence_quote:`; the quote must appear verbatim (whitespace-collapsed) in a location cited in the same block.

---

## 3. Automated Mechanical Pre-Flight (`verify_citations.py`)

Before human or LLM reviewers spend tokens evaluating the *semantics* of a finding, the citation must pass the zero-token mechanical linter:

```bash
python3 .agent/skills/verification-swarm/scripts/verify_citations.py --dir docs/swarm/<run_id>/ --strict
```

### Linter Verification Rules:
1. **File Existence:** Does `path/to/file.ext` physically exist relative to the project root? A shortened path is accepted only if exactly one file ends with it; several matches is `[AMBIGUOUS PATH]` — cite the full repo-relative path.
2. **Line Range Validity:** Does `start_line >= 1` and `end_line <= total_file_lines`?
3. **Step Existence:** Does `run.jsonl#step=N` resolve to a record (by `step_index`/`step`/`stepIdx`, else the N-th line)?
4. **Quote Match:** Does each `evidence_quote:` appear verbatim in at least one location cited in its block?
5. **Automated Status Badging:**
   * `[MATCH]`: File, bounds, step and quote confirmed.
   * `[MISSING FILE]`: Cited path does not exist on disk.
   * `[AMBIGUOUS PATH]`: A bare or shortened name matches several files; the linter will not guess.
   * `[LINE OOB]`: Line number exceeds current file length.
   * `[STEP MISSING]`: No record for the cited step.
   * `[QUOTE NOT VERBATIM]`: The quote is paraphrased, invented, or cited at the wrong location.

Prove the linter fires before trusting a clean run: `verify_citations.py --selftest` plants every failure class and must report each one.

Findings that fail mechanical verification are automatically flagged as `HALLUCINATED_CITATION` and returned to the authoring agent or dropped before synthesis.
