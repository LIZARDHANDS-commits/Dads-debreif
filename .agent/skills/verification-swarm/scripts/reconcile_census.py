#!/usr/bin/env python3
"""
reconcile_census.py — Deterministic Finding Census Reconciler
Part of the verification-swarm skill suite.

Parses examiner and review reports, extracts finding blocks, and produces an
authoritative, reconciled census table. Eliminates the 'Raised vs Reviewed'
count conflation anti-pattern (Section 4.1a).

Origin: a finding's YAML may carry `origin: PLANNED | OBSERVER` (default PLANNED). OBSERVER marks
findings raised by the open-observer lens (SKILL section 1.11): defects no planned check predicted.
Convergence: `dup_of: <id>` links a finding to an independently raised duplicate. Both are kept;
the census reports unique defects and how many were found by more than one blind source (SKILL 1.8).

Usage:
    python reconcile_census.py --dir <swarm_output_directory> [--json] [--output <census.md>]
    python reconcile_census.py --selftest
"""

import sys
import os
import re
import argparse
import json
from collections import defaultdict

# Enable UTF-8 encoding on stdout/stderr if supported
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

COLOR_CYAN = "\033[96m"
COLOR_BOLD = "\033[1m"
COLOR_RESET = "\033[0m"

YAML_BLOCK_PATTERN = re.compile(r"```ya?ml[^\n]*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
FIELD_PATTERN = re.compile(r"^\s*([a-zA-Z0-9_-]+):\s*[\"']?([^\"'\n\r]*)[\"']?", re.MULTILINE)


def parse_finding_yaml(yaml_text):
    """Extract key-value pairs from a finding's YAML metadata block."""
    data = {}
    for match in FIELD_PATTERN.finditer(yaml_text):
        k = match.group(1).strip().lower()
        v = match.group(2).strip()
        data[k] = v
    return data


def scan_reports(reports_dir):
    """
    Parse all markdown files in reports_dir and extract findings.
    Distinguishes between examiner files and review/lens files.
    """
    findings = {}
    by_examiner = defaultdict(list)

    for root, _, files in os.walk(reports_dir):
        for f in sorted(files):
            if not f.endswith(".md") or f.startswith("."):
                continue
            fpath = os.path.join(root, f)
            with open(fpath, "r", encoding="utf-8", errors="replace") as file_in:
                content = file_in.read().replace("\r\n", "\n")

            is_synthesis = "synthesis" in f.lower() or "census" in f.lower()

            if is_synthesis:
                continue

            for yaml_match in YAML_BLOCK_PATTERN.finditer(content):
                data = parse_finding_yaml(yaml_match.group(1))
                fid = data.get("id") or data.get("finding_id")
                if not fid:
                    continue

                fid = fid.upper().strip()
                is_review_block = "disposition" in data or ("review" in f.lower() and "target" not in data)
                if fid not in findings:
                    findings[fid] = {
                        "id": fid,
                        "title": data.get("title", ""),
                        "examiner_file": f if not is_review_block else "",
                        "target": data.get("target", "unspecified"),
                        "severity": (data.get("severity") or "P3_MINOR").upper(),
                        "category": (data.get("category") or "GENERAL").upper(),
                        "disposition": "RAISED",
                        "facts_held": True,
                        "consequence_held": True,
                        "deflated_severity": None,
                        "origin": "PLANNED",
                        "dup_of": None,
                        "reviews": [],
                    }

                entry = findings[fid]
                if is_review_block:
                    disp = data.get("disposition", "").upper()
                    if "ACCEPT" in disp or "SURVIVED" in disp:
                        entry["disposition"] = "SURVIVED"
                    elif "DISPUTE" in disp or "BUCKET_2" in disp or "DEFLAT" in disp:
                        entry["disposition"] = "DISPUTED"
                        entry["consequence_held"] = False
                    elif "DROP" in disp or "REFUTE" in disp:
                        entry["disposition"] = "DROPPED"
                        entry["facts_held"] = False
                    if data.get("deflated_severity"):
                        entry["deflated_severity"] = data.get("deflated_severity").upper()
                    entry["reviews"].append(f)
                else:
                    if not entry["examiner_file"]:
                        entry["examiner_file"] = f
                    if "OBSERV" in (data.get("origin") or "").upper():
                        entry["origin"] = "OBSERVER"
                    if data.get("dup_of") and data.get("dup_of").lower() not in ("none", "null", ""):
                        entry["dup_of"] = data.get("dup_of").upper().strip()
                    by_examiner[f].append(fid)

    return findings, by_examiner


def generate_markdown_census(findings, by_examiner):
    """Format findings into a canonical, multi-quantity reconciled Markdown table."""
    total_raised = len(findings)
    total_survived = sum(1 for f in findings.values() if f["disposition"] == "SURVIVED")
    total_disputed = sum(1 for f in findings.values() if f["disposition"] == "DISPUTED")
    total_dropped = sum(1 for f in findings.values() if f["disposition"] == "DROPPED")
    total_reviewed = total_survived + total_disputed + total_dropped

    md = []
    md.append("# Reconciled Finding Census\n")
    md.append("> **Rule (§4.1a):** A finding count without label clarity corrupts downstream tables.")
    md.append("> *Raised*, *Reviewed*, *Survived*, and *Disputed* represent distinct quantities.\n")

    md.append("## Global Summary Counts\n")
    md.append("| Quantity | Count | Percentage | Operational Meaning |")
    md.append("| :--- | :--- | :--- | :--- |")
    md.append(f"| **Raised by Examiners** | {total_raised} | 100% | Total potential defects discovered across all dimensions |")
    md.append(f"| **Dispatched for Review** | {total_reviewed} | {(total_reviewed/total_raised*100) if total_raised else 0:.1f}% | Findings evaluated by reviewer lenses (accounting for dispatch caps) |")
    md.append(f"| **Survived Both Lenses** | {total_survived} | {(total_survived/total_raised*100) if total_raised else 0:.1f}% | Facts confirmed AND consequence confirmed (Immediate Action) |")
    md.append(f"| **Disputed / Deflated (Bucket 2)** | {total_disputed} | {(total_disputed/total_raised*100) if total_raised else 0:.1f}% | Facts confirmed, consequence deflated/disputed (Human Review / Hygiene) |")
    md.append(f"| **Refuted / Dropped** | {total_dropped} | {(total_dropped/total_raised*100) if total_raised else 0:.1f}% | Citations did not hold up under substrate check |")
    md.append("\n---\n")

    o = origin_summary(findings)
    md.append("## Origin & Convergence\n")
    md.append("| Quantity | Count | Meaning |")
    md.append("| :--- | :--- | :--- |")
    md.append(f"| **Raised by planned checks** | {o['planned']} | Checklist / rubric / examiner dimensions |")
    md.append(f"| **Raised by open observer** | {o['observer']} | Unscripted lens (SKILL 1.11) |")
    md.append(f"| **Unique defects** | {o['unique']} | Raised minus `dup_of` links |")
    md.append(f"| **Convergent (>=2 blind sources)** | {o['convergent']} | Independent corroboration (SKILL 1.8) |")
    md.append(f"| **Observer-only, surviving (B1+B2)** | {o['observer_only_surviving']} | Real defects no planned check predicted |")
    md.append("\n---\n")

    # Severity distribution
    sev_counts = defaultdict(lambda: {"raised": 0, "survived": 0, "disputed": 0})
    for f in findings.values():
        sev = f["deflated_severity"] or f["severity"]
        # Normalize to P1, P2, P3, P4
        sev_label = "P3_MINOR"
        for candidate in ["P1_BLOCKER", "P2_MAJOR", "P3_MINOR", "P4_COSMETIC"]:
            if candidate in sev:
                sev_label = candidate
                break
        sev_counts[sev_label]["raised"] += 1
        if f["disposition"] == "SURVIVED":
            sev_counts[sev_label]["survived"] += 1
        elif f["disposition"] == "DISPUTED":
            sev_counts[sev_label]["disputed"] += 1

    md.append("## Severity Breakdown (Deflated / Accepted)\n")
    md.append("| Severity Level | Raised | Survived (Bucket 1) | Disputed (Bucket 2) | Disposition Path |")
    md.append("| :--- | :--- | :--- | :--- | :--- |")
    for s in ["P1_BLOCKER", "P2_MAJOR", "P3_MINOR", "P4_COSMETIC"]:
        c = sev_counts[s]
        action = "Immediate Blocker Fix" if "P1" in s else ("Major Architecture Fix" if "P2" in s else "Maintenance / Hygiene Backlog")
        md.append(f"| **{s}** | {c['raised']} | {c['survived']} | {c['disputed']} | {action} |")
    md.append("\n---\n")

    # Examiner distribution table
    md.append("## Census by Dimension / Examiner File\n")
    md.append("| Examiner / Source File | Raised Findings | Survived (B1) | Disputed (B2) | Dropped (B3) |")
    md.append("| :--- | :--- | :--- | :--- | :--- |")
    for ex_file, ids in sorted(by_examiner.items()):
        ex_survived = sum(1 for i in ids if findings[i]["disposition"] == "SURVIVED")
        ex_disputed = sum(1 for i in ids if findings[i]["disposition"] == "DISPUTED")
        ex_dropped = sum(1 for i in ids if findings[i]["disposition"] == "DROPPED")
        md.append(f"| `{ex_file}` | {len(ids)} | {ex_survived} | {ex_disputed} | {ex_dropped} |")
    md.append("\n---\n")

    # Master Finding Register
    md.append("## Master Itemized Finding Register\n")
    md.append("| Finding ID | Category | Target Substrate | Severity | Disposition | Primary Reviewer |")
    md.append("| :--- | :--- | :--- | :--- | :--- | :--- |")
    for fid, f in sorted(findings.items()):
        sev = f["deflated_severity"] or f["severity"]
        rev = f["reviews"][0] if f["reviews"] else "Self-Contained"
        md.append(f"| `{fid}` | {f['category']} | `{f['target']}` | {sev} | **{f['disposition']}** | `{rev}` |")

    return "\n".join(md)


def origin_summary(findings):
    """Counts by origin and convergence. A dup_of link merges two raised findings into one defect."""
    linked = {fid: f["dup_of"] for fid, f in findings.items() if f["dup_of"] and f["dup_of"] in findings}
    heads = set(linked.values())
    unique = len(findings) - len(linked)
    observer_only = [
        f for fid, f in findings.items()
        if f["origin"] == "OBSERVER" and fid not in linked and fid not in heads
        and f["disposition"] in ("SURVIVED", "DISPUTED")
    ]
    return {
        "planned": sum(1 for f in findings.values() if f["origin"] == "PLANNED"),
        "observer": sum(1 for f in findings.values() if f["origin"] == "OBSERVER"),
        "unique": unique,
        "convergent": len(heads),
        "observer_only_surviving": len(observer_only),
    }


def selftest():
    """Negative control: a planted census whose every count is known in advance."""
    import tempfile
    blocks = [
        ("L1.md", "id: F-1\ntarget: a.md:1\nseverity: P2_MAJOR"),
        ("L1.md", "id: F-2\ntarget: a.md:2\nseverity: P3_MINOR"),
        ("OBS.md", "id: F-3\ntarget: t.jsonl#step=4\norigin: OBSERVER\ndup_of: F-1"),
        ("OBS.md", "id: F-4\ntarget: t.jsonl#step=9\norigin: OBSERVER"),
        ("OBS.md", "id: F-5\ntarget: t.jsonl#step=11\norigin: OBSERVER"),
        ("V.md", "finding_id: F-1\ndisposition: BUCKET_1_ACCEPTED"),
        ("V.md", "finding_id: F-2\ndisposition: BUCKET_3_REFUTED"),
        ("V.md", "finding_id: F-3\ndisposition: BUCKET_1_ACCEPTED"),
        ("V.md", "finding_id: F-4\ndisposition: BUCKET_2_DISPUTED\ndeflated_severity: P3_MINOR"),
        ("V.md", "finding_id: F-5\ndisposition: BUCKET_3_REFUTED"),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        files = {}
        for name, body in blocks:
            files.setdefault(name, []).append("```yaml\n" + body + "\n```\n")
        for name, parts in files.items():
            with open(os.path.join(tmp, name), "w", encoding="utf-8") as fh:
                fh.write("\n".join(parts))
        findings, _ = scan_reports(tmp)
    o = origin_summary(findings)
    checks = [
        ("raised = 5", len(findings) == 5),
        ("planned 2 / observer 3", o["planned"] == 2 and o["observer"] == 3),
        ("unique defects = 4 (one dup_of link)", o["unique"] == 4),
        ("convergent = 1", o["convergent"] == 1),
        ("observer-only surviving = 1 (F-4 disputed; F-5 refuted; F-3 is a duplicate)", o["observer_only_surviving"] == 1),
        ("dispositions", [findings[k]["disposition"] for k in ("F-1", "F-2", "F-4", "F-5")]
            == ["SURVIVED", "DROPPED", "DISPUTED", "DROPPED"]),
    ]
    ok = True
    for name, passed in checks:
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
    print("SELFTEST PASSED" if ok else "SELFTEST FAILED")
    return 0 if ok else 1


def main():
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    parser = argparse.ArgumentParser(description="Deterministic Finding Census Reconciler for Verification Swarms")
    parser.add_argument("--dir", required=True, help="Directory containing examiner and review reports (.md)")
    parser.add_argument("--selftest", action="store_true", help="Run the built-in negative control and exit")
    parser.add_argument("--output", help="Optional path to write generated markdown census")
    parser.add_argument("--json", action="store_true", help="Output summary in JSON format")

    args = parser.parse_args()
    reports_dir = os.path.abspath(args.dir)

    if not os.path.isdir(reports_dir):
        print(f"Error: Directory not found: {reports_dir}", file=sys.stderr)
        sys.exit(1)

    findings, by_examiner = scan_reports(reports_dir)
    census_markdown = generate_markdown_census(findings, by_examiner)

    if args.output:
        out_path = os.path.abspath(args.output)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(census_markdown)
        print(f"Reconciled census successfully written to {out_path}")
    elif args.json:
        payload = {
            "total_findings": len(findings),
            "origin": origin_summary(findings),
            "findings": findings,
            "by_examiner": {k: len(v) for k, v in by_examiner.items()}
        }
        print(json.dumps(payload, indent=2))
    else:
        print(census_markdown)


if __name__ == "__main__":
    main()
