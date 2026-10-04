#!/usr/bin/env python3
"""
verify_citations.py — Deterministic Substrate Citation Linter
Part of the verification-swarm skill suite.

Scans examiner report markdown files, extracts all substrate/source citations
(e.g., target: file.py:45-50 or [file.md:12]), and validates their physical
existence and line-range bounds against disk at zero token cost.

Transcript citations: `path/to/transcript.jsonl#step=N` resolves to the JSONL record whose
step_index / step / stepIdx equals N (or, if records carry no step key, the N-th line).

Quote verification: an `evidence_quote:` (or `quote:`) key inside a finding's YAML block must
appear VERBATIM (whitespace-collapsed, case-sensitive) inside at least one location cited in the
same block: the line range of a file:line citation, or the text of a #step record. A quote that
matches none is QUOTE_NOT_FOUND, the mechanical signature of a fabricated or paraphrased quote.

Usage:
    python verify_citations.py --dir <reports_directory> [--root <project_root>] [--strict] [--json]
    python verify_citations.py --file <report_file.md> [--root <project_root>] [--strict]
    python verify_citations.py --selftest     # proves every failure class is detected (negative control)
"""

import sys
import os
import re
import argparse
import json
from pathlib import Path

# Enable UTF-8 encoding on stdout/stderr if supported
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

COLOR_GREEN = "\033[92m"
COLOR_RED = "\033[91m"
COLOR_YELLOW = "\033[93m"
COLOR_CYAN = "\033[96m"
COLOR_BOLD = "\033[1m"
COLOR_RESET = "\033[0m"

# Regex patterns for citation extraction
YAML_BLOCK_PATTERN = re.compile(r"```ya?ml[^\n]*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
TARGET_KEY_PATTERN = re.compile(r"^\s*(?:-\s+)?(?:target|substrate_citation|source_citation|citation):\s*[\"']?([^\"'\n\r]+)[\"']?", re.MULTILINE | re.IGNORECASE)
INLINE_CITATION_PATTERN = re.compile(r"(?:`|\[|\()([a-zA-Z0-9_\-\.\/\\\\]+\.[a-zA-Z0-9_]+):(\d+)(?:-(\d+))?(?:`|\]|\))")
INLINE_STEP_PATTERN = re.compile(r"(?:`|\[|\()([a-zA-Z0-9_\-\.\/\\\\]+\.jsonl)#step=(\d+)(?:`|\]|\))")
QUOTE_KEY_PATTERN = re.compile(r"^\s*(?:evidence_quote|quote):\s*(.+?)\s*$", re.MULTILINE | re.IGNORECASE)
STEP_KEYS = ("step_index", "step", "stepIdx", "stepIndex")


def parse_line_ref(ref_str):
    """
    Parse strings like 'path/to/file.py:45-50', 'path/to/file.py:45', 'file.md', or 'log.jsonl#step=12'.
    Returns (clean_path, start_line, end_line, step).
    """
    ref_str = ref_str.strip().strip("\"'[]()`")
    m = re.match(r"^(.+?\.jsonl)#step=(\d+)$", ref_str)
    if m:
        return m.group(1).strip(), None, None, int(m.group(2))
    m = re.match(r"^(.+?):(\d+)(?:-(\d+))?$", ref_str)
    if m:
        path_part = m.group(1).strip()
        start = int(m.group(2))
        end = int(m.group(3)) if m.group(3) else start
        return path_part, start, end, None
    return ref_str, None, None, None


def _unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    return value.replace('\\"', '"')


def _collapse(text):
    return re.sub(r"\s+", " ", text).strip()


def _string_leaves(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _string_leaves(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _string_leaves(v)


def count_file_lines(file_path):
    """Return total number of lines in a file, or None if unreadable."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return sum(1 for _ in f)
    except Exception:
        return None


def extract_citations_from_markdown(content, filename=""):
    """
    Extract all citations from a markdown document.
    Prioritizes structured YAML metadata blocks, then falls back to inline citations.
    """
    citations = []
    seen = set()

    # Normalize Windows CRLF newlines
    content = content.replace("\r\n", "\n")

    # 1. Search in YAML metadata blocks
    for block_no, yaml_match in enumerate(YAML_BLOCK_PATTERN.finditer(content)):
        yaml_text = yaml_match.group(1)
        block_cites = []
        for key_match in TARGET_KEY_PATTERN.finditer(yaml_text):
            raw_val = key_match.group(1).strip()
            path_part, start, end, step = parse_line_ref(raw_val)
            if not path_part or path_part.lower() in ("none", "n/a", "unspecified"):
                continue
            cite = {
                "raw": raw_val,
                "path": path_part,
                "start_line": start,
                "end_line": end,
                "step": step,
                "context": "yaml_metadata",
                "source_file": filename,
            }
            block_cites.append(cite)
            key = (path_part, start, end, step)
            if key not in seen:
                seen.add(key)
                citations.append(cite)
        for quote_match in QUOTE_KEY_PATTERN.finditer(yaml_text):
            quote = _unquote(quote_match.group(1))
            if quote and quote.lower() not in ("none", "n/a"):
                short = quote[:60] + ("..." if len(quote) > 60 else "")
                citations.append({
                    "raw": f'quote "{short}" (block {block_no + 1})',
                    "quote": quote,
                    "locations": block_cites,
                    "context": "evidence_quote",
                    "source_file": filename,
                })

    # 2. Search inline markdown citations
    for inline_match in INLINE_CITATION_PATTERN.finditer(content):
        path_part = inline_match.group(1).strip()
        start = int(inline_match.group(2))
        end = int(inline_match.group(3)) if inline_match.group(3) else start
        key = (path_part, start, end, None)
        if key not in seen and path_part:
            # Filter out URL schemes or obvious non-files
            if not path_part.startswith(("http", "https", "ftp", "mailto")):
                seen.add(key)
                citations.append({
                    "raw": f"{path_part}:{start}" + (f"-{end}" if end != start else ""),
                    "path": path_part,
                    "start_line": start,
                    "end_line": end,
                    "step": None,
                    "context": "inline_text",
                    "source_file": filename,
                })

    # 3. Inline transcript step citations
    for step_match in INLINE_STEP_PATTERN.finditer(content):
        path_part, step = step_match.group(1).strip(), int(step_match.group(2))
        key = (path_part, None, None, step)
        if key not in seen:
            seen.add(key)
            citations.append({
                "raw": f"{path_part}#step={step}",
                "path": path_part,
                "start_line": None,
                "end_line": None,
                "step": step,
                "context": "inline_text",
                "source_file": filename,
            })

    return citations


SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv", "graphify-out", "worktrees"}  # worktrees: agent checkouts under .claude/ duplicate every path
_FILE_INDEX = {}


def _file_index(root_dir):
    """Every file under root_dir as a posix relative path (cached per root)."""
    root = str(Path(root_dir).resolve())
    if root not in _FILE_INDEX:
        files = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            rel = os.path.relpath(dirpath, root).replace("\\", "/")
            for f in filenames:
                files.append(f if rel == "." else f"{rel}/{f}")
        _FILE_INDEX[root] = files
    return _FILE_INDEX[root]


def resolve_path(path, root_dir):
    """Resolve a cited path. Returns (path_or_None, ambiguous_candidates).

    1. Exact path under root_dir.
    2. Path with leading folders stripped (e.g. a repo-name prefix), if that exists.
    3. Unique suffix match: a shortened path such as `scripts/hook_router.py` is accepted only when
       exactly ONE file under root_dir ends with it. Two or more matches is AMBIGUOUS — the linter
       will not guess which file the author meant (`routing.json`, `rule.md`, `00_INDEX.md` ...).
    """
    raw_path = path.replace("\\", "/")
    if raw_path.startswith("./"):
        raw_path = raw_path[2:]
    candidate = (Path(root_dir) / raw_path).resolve()
    if candidate.is_file():
        return candidate, []
    parts = raw_path.split("/")
    for i in range(1, len(parts)):
        sub = (Path(root_dir) / "/".join(parts[i:])).resolve()
        if sub.is_file():
            return sub, []
    matches = [f for f in _file_index(root_dir) if f == raw_path or f.endswith("/" + raw_path)]
    if len(matches) == 1:
        return (Path(root_dir) / matches[0]).resolve(), []
    if len(matches) > 1:
        return None, matches
    return None, []


def read_step_record(file_path, step):
    """Return the text of the JSONL record for `step` (by step key, else by 1-based line), or None."""
    try:
        lines = Path(file_path).read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return None
    keyed = False
    for line in lines:
        try:
            rec = json.loads(line)
        except Exception:
            continue
        if isinstance(rec, dict):
            for k in STEP_KEYS:
                if k in rec:
                    keyed = True
                    if str(rec[k]) == str(step):
                        return "\n".join(_string_leaves(rec))
    if not keyed and 1 <= step <= len(lines):
        try:
            return "\n".join(_string_leaves(json.loads(lines[step - 1])))
        except Exception:
            return lines[step - 1]
    return None


def location_text(citation, root_dir):
    """Text a quote may match inside: the cited line range, the cited step record, or the whole file."""
    candidate, _ = resolve_path(citation["path"], root_dir)
    if candidate is None:
        return None
    if citation.get("step") is not None:
        return read_step_record(candidate, citation["step"])
    try:
        lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return None
    start, end = citation.get("start_line"), citation.get("end_line")
    if start is None:
        return "\n".join(lines)
    return "\n".join(lines[max(start - 1, 0):(end or start)])


def validate_quote(citation, root_dir):
    if not citation["locations"]:
        return "QUOTE_NOT_FOUND", "Quote has no citation in its block to be checked against"
    needle = _collapse(citation["quote"])
    for loc in citation["locations"]:
        text = location_text(loc, root_dir)
        if text is not None and needle in _collapse(text):
            return "MATCH", f"Quote found verbatim in {loc['raw']}"
    cited = ", ".join(loc["raw"] for loc in citation["locations"])
    return "QUOTE_NOT_FOUND", f"Quote not verbatim in any cited location ({cited})"


def validate_citation(citation, root_dir):
    """
    Verify citation against disk.
    Returns status: 'MATCH', 'FILE_NOT_FOUND', 'AMBIGUOUS_PATH', 'LINE_OUT_OF_BOUNDS',
    'STEP_NOT_FOUND', 'QUOTE_NOT_FOUND'.
    """
    if citation["context"] == "evidence_quote":
        return validate_quote(citation, root_dir)
    candidate, ambiguous = resolve_path(citation["path"], root_dir)
    if ambiguous:
        shown = ", ".join(ambiguous[:4]) + (" ..." if len(ambiguous) > 4 else "")
        return "AMBIGUOUS_PATH", f"{len(ambiguous)} files match '{citation['path']}': {shown} (cite the full path)"
    if candidate is None:
        return "FILE_NOT_FOUND", f"File does not exist: {citation['path']}"
    if citation.get("step") is not None:
        if read_step_record(candidate, citation["step"]) is None:
            return "STEP_NOT_FOUND", f"No record for step {citation['step']} in {citation['path']}"
        return "MATCH", f"Step {citation['step']} record found"

    total_lines = count_file_lines(candidate)
    if total_lines is None:
        return "READ_ERROR", f"Unable to read file: {citation['path']}"

    start = citation["start_line"]
    end = citation["end_line"]

    if start is not None:
        if start < 1 or start > total_lines:
            return "LINE_OUT_OF_BOUNDS", f"Start line {start} out of bounds (file has {total_lines} lines)"
        if end is not None and (end < start or end > total_lines):
            return "LINE_OUT_OF_BOUNDS", f"End line {end} out of bounds (file has {total_lines} lines)"

    return "MATCH", f"Verified ({total_lines} lines total)"


def run_verification(target_paths, root_dir):
    """Validate all citations across target files."""
    results = []
    stats = {"total": 0, "match": 0, "file_not_found": 0, "ambiguous_path": 0, "line_out_of_bounds": 0,
             "step_not_found": 0, "quote_not_found": 0, "read_error": 0}

    for path in target_paths:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            print(f"{COLOR_RED}Error reading {path}: {e}{COLOR_RESET}")
            continue

        file_citations = extract_citations_from_markdown(content, filename=os.path.basename(path))
        for c in file_citations:
            stats["total"] += 1
            status, detail = validate_citation(c, root_dir)
            if status == "MATCH":
                stats["match"] += 1
            elif status == "FILE_NOT_FOUND":
                stats["file_not_found"] += 1
            elif status == "AMBIGUOUS_PATH":
                stats["ambiguous_path"] += 1
            elif status == "LINE_OUT_OF_BOUNDS":
                stats["line_out_of_bounds"] += 1
            elif status == "STEP_NOT_FOUND":
                stats["step_not_found"] += 1
            elif status == "QUOTE_NOT_FOUND":
                stats["quote_not_found"] += 1
            else:
                stats["read_error"] += 1

            results.append({
                "source_file": c["source_file"],
                "citation": c["raw"],
                "status": status,
                "detail": detail,
                "context": c["context"]
            })

    return results, stats


def failures(stats):
    return (stats["file_not_found"] + stats["ambiguous_path"] + stats["line_out_of_bounds"]
            + stats["step_not_found"] + stats["quote_not_found"])


def selftest():
    """Negative control (skill section 1.7): one good report, one report carrying every failure class."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "src").mkdir()
        for d in ("mode_a", "mode_b"):
            (root / d).mkdir()
            (root / d / "commands.md").write_text("x\n", encoding="utf-8")
        (root / "src" / "rule.md").write_text(
            "line one\nLAW 15: archive writes need Mode D.\nline three\n", encoding="utf-8")
        (root / "t.jsonl").write_text(
            json.dumps({"step_index": 7, "content": "Aris: 5 Blue Cubes extracted.\nVERIFIED VECTORS"}) + "\n"
            + json.dumps({"step_index": 8, "content": "Sully: survives cross-examination"}) + "\n",
            encoding="utf-8")
        good = (
            "```yaml\nid: G-1\ntarget: src/rule.md:2\nevidence_quote: \"archive writes need Mode D.\"\n```\n"
            "```yaml\nid: G-2\ntarget: t.jsonl#step=7\nevidence_quote: \"5 Blue Cubes extracted. VERIFIED VECTORS\"\n```\n"
            "Inline: `t.jsonl#step=8` and `src/rule.md:1-3`.\n"
            "```yaml\nevidence:\n  - target: \"rule.md:3\"\n```\n"          # unique suffix + YAML list item
            "Also `mode_a/commands.md:1`.\n")
        bad = (
            "```yaml\nid: B-1\ntarget: src/missing.md:1\n```\n"
            "```yaml\nid: B-2\ntarget: src/rule.md:99\n```\n"
            "```yaml\nid: B-3\ntarget: t.jsonl#step=42\n```\n"
            "```yaml\nid: B-4\ntarget: t.jsonl#step=8\nevidence_quote: \"Sully: facts validated\"\n```\n"
            "```yaml\nid: B-5\ntarget: src/rule.md:1\nevidence_quote: \"archive writes need Mode D.\"\n```\n"
            "```yaml\nid: B-6\ntarget: commands.md:1\n```\n")
        (root / "good.md").write_text(good, encoding="utf-8")
        (root / "bad.md").write_text(bad, encoding="utf-8")
        _, g_stats = run_verification([str(root / "good.md")], str(root))
        b_res, b_stats = run_verification([str(root / "bad.md")], str(root))
    quote_fails = [r["citation"] for r in b_res if r["status"] == "QUOTE_NOT_FOUND"]
    checks = [
        ("good report: every citation and quote MATCHES (incl. unique suffix, YAML list item)",
         failures(g_stats) == 0 and g_stats["match"] == g_stats["total"] == 8),
        ("bare name matching two files is AMBIGUOUS, not guessed", b_stats["ambiguous_path"] == 1),
        ("missing file detected", b_stats["file_not_found"] == 1),
        ("line out of bounds detected", b_stats["line_out_of_bounds"] == 1),
        ("missing transcript step detected", b_stats["step_not_found"] == 1),
        ("paraphrased quote detected", any("Sully" in c for c in quote_fails)),
        ("real quote cited at the wrong line detected", any("archive" in c for c in quote_fails)),
    ]
    ok = True
    for name, passed in checks:
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
    print("SELFTEST PASSED" if ok else "SELFTEST FAILED")
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="Deterministic Substrate Citation Linter for Verification Swarms")
    if "--selftest" in sys.argv[1:]:
        sys.exit(selftest())
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dir", help="Directory containing examiner reports (.md files)")
    group.add_argument("--file", help="Single examiner report markdown file")
    parser.add_argument("--root", default=".", help="Root directory of the substrate codebase (default: current directory)")
    parser.add_argument("--strict", action="store_true", help="Exit with non-zero status if any citation fails")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--selftest", action="store_true", help="Run the built-in negative control and exit")

    args = parser.parse_args()
    root_dir = os.path.abspath(args.root)

    target_files = []
    if args.file:
        target_files = [os.path.abspath(args.file)]
    elif args.dir:
        dir_path = os.path.abspath(args.dir)
        if not os.path.isdir(dir_path):
            print(f"{COLOR_RED}Directory not found: {dir_path}{COLOR_RESET}", file=sys.stderr)
            sys.exit(1)
        for root, _, files in os.walk(dir_path):
            for f in sorted(files):
                if f.endswith(".md") and not f.startswith("."):
                    target_files.append(os.path.join(root, f))

    if not target_files:
        print(f"{COLOR_YELLOW}No markdown files found to scan.{COLOR_RESET}")
        sys.exit(0)

    results, stats = run_verification(target_files, root_dir)

    if args.json:
        output_payload = {
            "root_dir": root_dir,
            "scanned_files": len(target_files),
            "stats": stats,
            "results": results,
        }
        print(json.dumps(output_payload, indent=2))
        if args.strict and failures(stats) > 0:
            sys.exit(1)
        sys.exit(0)

    print(f"\n{COLOR_BOLD}{COLOR_CYAN}=====================================================")
    print("      Verification Swarm — Citation Linter Report")
    print(f"====================================================={COLOR_RESET}")
    print(f"Codebase Root : {root_dir}")
    print(f"Scanned Files : {len(target_files)} report(s)")
    print(f"Total Citations Scanned : {stats['total']}\n")

    for r in results:
        status = r["status"]
        if status == "MATCH":
            badge = f"{COLOR_GREEN}[MATCH]{COLOR_RESET}"
        elif status == "FILE_NOT_FOUND":
            badge = f"{COLOR_RED}[MISSING FILE]{COLOR_RESET}"
        elif status == "AMBIGUOUS_PATH":
            badge = f"{COLOR_RED}[AMBIGUOUS PATH]{COLOR_RESET}"
        elif status == "LINE_OUT_OF_BOUNDS":
            badge = f"{COLOR_RED}[LINE OOB]{COLOR_RESET}"
        elif status == "STEP_NOT_FOUND":
            badge = f"{COLOR_RED}[STEP MISSING]{COLOR_RESET}"
        elif status == "QUOTE_NOT_FOUND":
            badge = f"{COLOR_RED}[QUOTE NOT VERBATIM]{COLOR_RESET}"
        else:
            badge = f"{COLOR_YELLOW}[ERROR]{COLOR_RESET}"

        print(f"  {badge} {COLOR_BOLD}{r['citation']}{COLOR_RESET}  ({r['source_file']})")
        if status != "MATCH":
            print(f"         {COLOR_RED}↳ {r['detail']}{COLOR_RESET}")

    print(f"\n{COLOR_BOLD}Summary:{COLOR_RESET}")
    print(f"  Passed : {COLOR_GREEN}{stats['match']}/{stats['total']}{COLOR_RESET}")
    print(f"  Failed : {COLOR_RED}{failures(stats)}/{stats['total']}{COLOR_RESET} "
          f"({stats['file_not_found']} missing files, {stats['ambiguous_path']} ambiguous paths, "
          f"{stats['line_out_of_bounds']} line range errors, "
          f"{stats['step_not_found']} missing steps, {stats['quote_not_found']} non-verbatim quotes)")
    print(f"{COLOR_BOLD}{'='*53}{COLOR_RESET}\n")

    if args.strict and failures(stats) > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
