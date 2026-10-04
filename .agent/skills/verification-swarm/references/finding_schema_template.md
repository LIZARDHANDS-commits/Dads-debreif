# Standardized Finding Schema & Reporting Template

> **Core Axiom:** A report that cannot be parsed by a script will suffer from "Summary of a summary drifts" (§4.1). Standardizing the finding block format guarantees lossless aggregation.

---

## 1. The Hybrid Finding Block Format

Every finding authored by an examiner must use the following standard Markdown block structure with a fenced YAML metadata block at its head:

````markdown
### Finding [EX-01]: Brief Descriptive Title of the Defect

```yaml
id: EX-01
target: path/to/substrate_file.py:45-52
source_citation: report_name.md:14
severity: P2_MAJOR
category: IMPLEMENTATION_DRIFT
repro_command: python -c "assert False" # Required if code P1 or P2
evidence_quote: "exact words from the cited location"   # when the finding rests on wording
origin: PLANNED            # or OBSERVER (open-observer lens, SKILL 1.11)
dup_of: none               # id of an independently raised duplicate, set by the aggregator
```

**Observation:**
Precise, neutral statement of what was found on disk. Quote the relevant lines or cite the exact discrepancy.

**Expected:**
What the authoritative specification, decision, or system rule required.

**Evidence & Analysis:**
Why this divergence matters, including any dependency analysis or structural impact.
````

---

## 2. YAML Field Definitions

| Field | Type | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `id` | String | `[A-Z0-9_-]+` (e.g. `EX-01`, `LAW-03`) | Unique identifier within the examiner report. Never reuse IDs. |
| `target` | String | `path/to/file.ext:start-end` or `path/to/run.jsonl#step=N` | **Substrate citation.** Full repo-relative path and line numbers, or a record in an archived transcript. Bare names (`routing.json:12`) fail as `AMBIGUOUS_PATH` when several files share the name. |
| `source_citation` | String | `path/to/file.ext:start-end` | **Source citation.** Where in the input corpus or audit material this was identified. |
| `severity` | Enum | `P1_BLOCKER`, `P2_MAJOR`, `P3_MINOR`, `P4_COSMETIC` | Initial severity claim assessed by the examiner. |
| `category` | Enum | `IMPLEMENTATION_DRIFT`, `SPEC_GAP`, `REGISTER_COLLISION`, `DEAD_CODE`, `SECURITY_HAZARD`, `DOC_DRIFT`, `BEHAVIOURAL_DEVIATION`, `RUBRIC_FAIL`, `UNPLANNED_OBSERVATION` | High-level classification. The last three are for runtime records: behaviour contradicting a rule, a judged rubric below threshold, an observer anomaly with no rule yet. |
| `repro_command` | String | Shell/Python one-liner or `none` | **Mandatory for code P1/P2.** Executable reproduction proving failure. Must run against a clone, never the live system (SKILL 1.2). |
| `evidence_quote` | String | Verbatim text | Checked mechanically by `verify_citations.py`: must appear in a location cited in the same block. |
| `origin` | Enum | `PLANNED`, `OBSERVER` | Which lens raised it; `reconcile_census.py` reports observer-only survivors separately. |
| `dup_of` | String | Another finding `id` or `none` | Convergence link set by the aggregator; both findings are kept. |

> **Severity scale:** `P1_BLOCKER`…`P4_COSMETIC` is this skill's scale. If the project register uses another (e.g. P0–P3), the swarm prompt states the mapping and findings use the project's scale.

---

## 3. Reviewer Evaluation Block Format

When a reviewer lens or adversarial agent evaluates a finding, it appends a structured Review Block below the examiner's finding:

````markdown
#### Review [REV-EX-01]: Examiner Finding Evaluation

```yaml
finding_id: EX-01
disposition: BUCKET_1_ACCEPTED | BUCKET_2_DISPUTED | BUCKET_3_REFUTED
facts_held: true | false
consequence_held: true | false
deflated_severity: P1_BLOCKER | P2_MAJOR | P3_MINOR | P4_COSMETIC
witness_level: LEVEL_0_SELF_REPORT | LEVEL_1_DERIVATIVE | LEVEL_2_EXECUTION | LEVEL_3_SUBSTRATE
```

**Reviewer Assessment:**
Deflated technical summary of the confirmed fact, noting whether the stated consequence was upheld, modified, or refuted.
````

---

## 4. Prompt Template for Examiner Agents

When instructing examiner agents in Phase 1 (§1.1), include this instruction:

```text
FINDING FORMAT REQUIREMENT:
You must report every distinct finding using the Standard Hybrid Finding Block.
Include the ```yaml metadata block with 'id', 'target', 'source_citation', 'severity',
'category', and 'repro_command' (mandatory for P1/P2 code bugs). Cite transcripts as
'file.jsonl#step=N'. When the finding rests on wording, add 'evidence_quote' with the exact words:
a quote that is not verbatim at the cited location fails the linter and the finding is refuted.
Do not combine multiple unrelated defects into a single finding.
A report that does not use this schema cannot be processed by the automated census parser.
```
