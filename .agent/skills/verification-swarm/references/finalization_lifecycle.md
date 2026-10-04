# Verification Swarm — Phase 4: Finalization Lifecycle (reference)

> Moved verbatim from `SKILL.md` on 2026-09-26 (agentskills.io: keep SKILL.md under 500 lines; long material in `references/`). Section numbers are unchanged so existing citations (`§4.1`, `§4.4`, `§4.4a` …) still resolve here. `SKILL.md` keeps a one-line summary per rule.

## Phase 4: Finalization Lifecycle

### 4.1 The "Summary of a Summary Drifts" Principle
Each layer of extraction degrades mechanical accuracy — paths, filenames,
commands, counts, IDs — even when the analytical reasoning holds up.

**Implications:**
- Never trust restated mechanics without spot-checking against the source
- Budget for a corrections pass on every synthesis document
- Use a **Corrections section** (C1, C2, …), not silent edits — the delta
  between what was written and what is true is itself evidence about
  extraction reliability. This holds for later re-verification passes too:
  refreshing a historical report's line citations in place erases what it
  originally claimed. Append corrections; leave the point-in-time text
- **Re-read restated mechanics from the source at extraction time.** Require
  every path, filename, command and count in a derivative document to be
  re-verified against the live system, not copied from the layer above. In one
  measured run, five of six errors in a synthesis were misrestated mechanics
  while the analysis itself held

### 4.1a Raised vs Reviewed — the count that corrupts every table

A per-dimension findings cap limits what is **dispatched for review**, not what was **raised**.
Reporting the cap as the finding count silently understates the work and makes totals irreconcilable
across documents.

Label the quantity in every table — *raised*, *reviewed*, *survived*, *accepted* are four different
numbers. When a cap drops findings from review, say so explicitly and list what was dropped;
otherwise a reader cannot distinguish "we found eight" from "we looked at eight of twenty-two".

### 4.2 Derivative Document Status Levels

| Status | Meaning | Who Can Assign |
|--------|---------|----------------|
| `DRAFT` | Working output, not yet reviewed | Agent (default) |
| `PROMOTED` | Reviewed, useful, advisory | Agent or Patrick |
| `AUTHORITATIVE` | Canonical reference | **Patrick only** |

Swarm outputs should never self-stamp AUTHORITATIVE. They are derivative
documents with no independent authority path. The same applies to **verdicts on
gates a human owns**: a synthesis may report "preparation complete, pending
approval", never "GO", "approved", "ratified" or "certified".

### 4.3 The Follow-Up Audit Pattern
When a synthesis needs cross-checking:
1. Run a second swarm that reads the specialist reports AND the synthesis
2. Require it to produce a **recommendations-only delta report**
3. Enforce: "Do NOT modify the original synthesis"
4. After the audit, extract genuinely unique content into an `ADDENDUM.md`
5. Archive the raw audit doc (it served its purpose)

### 4.4 Registers: Agents Report, the Orchestrator Promotes
Swarm agents and worker agents **never write shared registers** (decision register, gap register,
test log, build notes, protocol/command inventories) and never assign register numbers. In one
measured case a code-fixing agent wrote its own decision entry, with a number that collided with a
pending ratification; it had to be excluded from the merge.

How the work stays visible and traceable instead:
- **Each agent writes its own report file** (§1.4, file-per-agent), committed to the repo:
  every finding, citation and evidence quote.
- **The orchestrator promotes** findings into the registers, and each register entry points back
  to its source report (`Source: <report>:<line>`).
- **Numbers are assigned at ratification**, read from the live register at write time; drafts use
  proposal labels. The canonical register on disk is authoritative.
- **Deduplicate against the project's open registers**, not only within the run: every finding is
  checked against existing gap/finding entries and tagged `DUP of <id>` when it restates one. A
  register that re-counts known items inflates "new defects" and hides what is actually new.
- **After promotion the run's folder moves to the archive** (`docs/archive/swarm/<run>/`); it stays
  indexed, searchable and citable.

### 4.4a The Promotion Census — "done" means every finding has a home
A run is not finished when its victory audit passes; it is finished when **every surviving
finding** ends in exactly one of: a register entry (cite it), `DUP of <id>`, or an explicit
rejection with its reason — recorded in a disposition ledger. Reconcile the counts (survived =
promoted + duplicate + rejected). In one measured run the audit was declared a victory while seven
surviving findings were queued and never logged; they surfaced two sessions later.

### 4.4b Conversation-History Audit (auditing a previous session)
Use when checking whether a past session's decisions, findings and promised updates landed.
1. **Extract, don't read whole.** Transcripts run to megabytes. Script out every Patrick/user
   message (read all of them) plus assistant turns containing decision words (decide, approve,
   ratify, finding, defer, next step, register IDs). Read the session's artifacts (plans, analyses).
2. **Inventory** every decision, ruling, instruction, finding, planned patch, promised doc update,
   deferred item, and any claim later relied on.
3. **Classify** each: COVERED (file:line), SUPERSEDED (what replaced or refuted it), PARTIAL (what
   specific was lost — a number, a condition, a path), or MISSING (where it should go).
4. **A transcript proves what was said, not that it was true.** Verify claims against primary
   evidence (the repo, logs, run artifacts) before counting them as covered.
5. **Report to a file or to the orchestrator**; the orchestrator promotes (§4.4) with the user's
   confirmation for decisions. End with: "anything left to extract: YES/NO" and why.

### 4.5 The Corpus Scour & Safe Archival Protocol (The Anti-G-2 Rule)
When using swarms to scour repositories for dead documentation and archive candidates:

1. **Three-Tier Classification:** Classify every candidate file into `SAFE_TO_ARCHIVE_IMMEDIATELY`, `NEEDS_EXTRACTION_FIRST`, or `KEEP_ACTIVE`.
2. **The Normative Extraction Gate:** Never archive a document containing load-bearing system constraints, boundary matrices, or unratified decisions without first promoting them to canonical registers. (The G-2 incident orphaned the two-tier hydration boundary matrix when an audit doc was archived).
3. **Precedence Hierarchy:** When documents conflict, resolve using the repository's precedence (Patrick's own words > `AGENTS.md` > `docs/PLAN.md` and `docs/modules/` > everything else). (See [Corpus Scour & Safe Archival Protocol](./corpus_scour_and_archival_protocol.md)).
