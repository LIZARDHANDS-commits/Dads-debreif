# Corpus Scour & Safe Archival Protocol

> **The G-2 Hard Lesson:** Archiving a document can orphan a critical normative rule that lived only inside it. Before archiving any document, verify that zero active registers, rules, or test plans depend exclusively on statements found only within it.

---

## 1. The Three-Tier Archival Classification

When scouring a documentation corpus or project repository to identify candidates for retirement to `docs/archive/`, classify every candidate file into one of three tiers:

```
[Candidate File] ──┬──> Tier 1: SAFE_TO_ARCHIVE_IMMEDIATELY ────────> Move to docs/archive/
                   │
                   ├──> Tier 2: NEEDS_EXTRACTION_FIRST ──────────────> Extract Normative Rules ──> Move
                   │
                   └──> Tier 3: KEEP_ACTIVE ─────────────────────────> Retain in docs/
```

| Tier | Category | Criteria | Required Action Before Archiving |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Safe to Archive Immediately** | Retrospective sprint notes, completed swarm run reports whose syntheses are ratified, temporary scratch files, superseded drafts that have zero unique content. | Confirm file is tracked in historical index; move directly to `docs/archive/`. |
| **Tier 2** | **Needs Extraction First** | Legacy audit documents, gap analyses, or review reports containing **unique normative rules**, architectural matrices, or decision context not duplicated in canonical registers. | **Mandatory Extraction Gate:** Cite and promote all unique normative content to authoritative documents (`DECISIONS.md`, system rules, or runbooks) before moving file. |
| **Tier 3** | **Keep Active** | Canonical registers (`DECISIONS.md`, `GAP_REGISTER.md`), current operating procedures, living test plans, and active specifications. | Do not archive. Flag for update or synchronization if stale. |

---

## 2. The Anti-G-2 Normative Extraction Gate

The G-2 incident occurred when `08_START_DOCS_GAP_AUDIT.md` was archived, accidentally destroying the two-tier hydration boundary matrix that permitted reading lean index files.

To prevent recurrence, every candidate file proposed for retirement must pass this 4-step extraction gate:

### Step 1: Normative Grep Sweep
Search the document for normative keywords that indicate load-bearing system constraints:
```bash
grep -inE "must|shall|forbidden|required|boundary|invariant|matrix|whitelist|blacklist|precedence" <candidate_file.md>
```

### Step 2: Canonical Cross-Check
For every hit found in Step 1, verify whether an identical or superseding statement exists in the canonical registers:
* Is it recorded in `docs/DECISIONS.md`?
* Is it codified in the system's active rule files or architecture guides?
* Is it verified in the automated test suite?

### Step 3: Extract and Promote
If a hit exists *only* in the candidate document:
1. Report the rule (its text, source `file:line`, and the owning doc it belongs in) in your report file. The **orchestrator** promotes it; agents never write registers (SKILL §4.4), and a new decision entry is written only after the user confirms its exact text.
2. Verify that the promoted text retains operational executability (avoiding vague summaries).

### Step 4: Record the Move, Don't Rewrite the File
Move with `git mv` (history preserved) and leave the file's content as it was: archived records
are point-in-time, and editing them breaks their citations. Record the move instead:
* an entry in the project's doc index archive section (what it was, why archived, where its
  normative content went);
* a disposition ledger row for every finding the document carried (SKILL §4.4a);
* the document's own Status line only where the project already uses one.
Then repoint live references to the new path; leave point-in-time records (logs, reports) as written.

---

## 3. Resolving Document Contradictions (Precedence Hierarchy)

When scouring multiple documents, examiners will frequently find statements that contradict each other. The swarm must resolve conflicts using the project's **Authoritative Precedence Hierarchy**:

1. **Patrick's own words:** Highest authority.
2. **The rule book (`AGENTS.md`):** Governs workspace layout, touch policy, and fundamental invariants.
3. **`docs/PLAN.md` and the module's folder in `docs/modules/`:** Subordinate to the rule book; a doc that disagrees with a higher source is corrected.
4. **Everything else:** Old notes, `archive/`, and code comments are background only.

> **Rule:** When a derived document contradicts a decision in `DECISIONS.md`, the decision wins. The derived document is flagged for a synchronization patch or archival.
