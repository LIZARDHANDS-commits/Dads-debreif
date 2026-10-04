# Adversarial Deflation Playbook (Handling Bucket 2)

> **Core Axiom:** Examiners inflate consequences to sound important; reviewers reject inflation and accidentally kill verified facts. Adversarial deflation strips the rhetoric to rescue the mechanical defect.

---

## 1. The Asymmetry That Costs Most (§1.3a)

In multi-agent verification, outcomes fall into three distinct buckets:

```
[Finding] ──┬──> Bucket 1: Facts Held AND Consequence Held ───────────> ACCEPT (Immediate Action)
            │
            ├──> Bucket 2: Facts Held, Consequence Disputed ──────────> DEFLATE & TRIAGE (Never Auto-Drop)
            │
            └──> Bucket 3: Facts Refuted ─────────────────────────────> DROP (Citation ungrounded)
```

### The Cost Asymmetry:
* **Over-acceptance (Type I Error):** Promoting a false finding wastes a quick triage turn.
* **Over-rejection (Type II Error):** Dropping a confirmed defect because the reviewer attacked the examiner's exaggerated phrasing **lets a real defect ship to production**.

---

## 2. The Two-Step Deflation Protocol

When evaluating any finding, the Reviewer Lens must execute this two-step routine:

### Step 1: Strip the Rhetoric (Translate to Neutral Mechanical Fact)
Convert speculative disaster framing into an objective, observable delta.

| Inflated Examiner Claim | Deflated Neutral Fact |
| :--- | :--- |
| *"This regex fatally breaks all mode transitions and causes silent data corruption across the system!"* | *"The regex `MODE\s+` fails to match modes formatted with an underscore (e.g. `MODE_B`)."* |
| *"The Golden Thread is completely destroyed by this uncontrolled write mutation!"* | *"File `03_golden_thread.md` grows by 1 line during selftest execution because reset logic omits it."* |
| *"Total architectural violation of the Constitution Pillar 4!"* | *"File `CAT_A_MIND.md:12` references a deprecated tool name instead of the renamed script."* |

### Step 2: Mechanical Severity Re-Grading (P1 through P4)
Re-assign severity strictly based on reproducible behavior, not the examiner's speculative scenario:

* **P1 — Blocker:** Causes runtime crash, dead-loop, unhandled exception on standard execution paths, or security vulnerability.
* **P2 — Major:** Architectural contradiction, broken feature on non-primary path, or silent behavior deviation from canonical specification.
* **P3 — Minor:** Harmless warning, unhandled edge-case on invalid input, unreferenced variable, or stale comment.
* **P4 — Cosmetic / Hygiene:** Typo, markdown formatting discrepancy, non-functional whitespace drift, or style convention.

---

## 3. The Code Reproduction Gate for P1/P2

To prevent examiners from manufacturing theoretical runtime blockers without evidence, enforce the **Code Reproduction Gate**:

> **Rule:** If an examiner rates a code or runtime defect as **P1 (Blocker)** or **P2 (Major)**, the finding MUST include an executable reproduction command (`repro_command`).

```bash
# Valid P1/P2 Repro Example:
repro_command: python -c "import re; assert re.match(r'MODE\s+', 'MODE_B')"
```

### Protocol:
1. If the examiner provides an executable repro and it fails as claimed $\rightarrow$ **Severity stands as P1/P2**.
2. If the examiner claims P1/P2 on code but provides no repro or the command passes $\rightarrow$ **The Reviewer automatically downgrades the finding to P3 (Minor)**.
3. *Documentation and Architectural contradictions* are evaluated via logical cross-referencing and do not require executable Python commands.

---

## 4. Triage Without Reviewer Fatigue

Bucket 2 findings (Facts Confirmed, Consequence Disputed) are triaged as follows:
* **P3 / P4 Deflated Items:** Automatically aggregated into the **Maintenance / Hygiene Backlog**. No human committee debate required; sign off as a single batch. **Exception:** when the project's gate requires every flag to be adjudicated (e.g. an acceptance gate over judged rubrics), deflated items still join the human queue — ranked last, but not batched away.
* **P1 / P2 Genuine Disputes:** The only items escalated for direct human adjudication by Patrick. This cuts human review volume by ~80% while ensuring 100% of critical decisions receive attention.
