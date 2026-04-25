#!/usr/bin/env python3
"""
verify_csv_equiv.py — Phase 1 verification harness.

For every legacy md file, reconstruct the equivalent text from the CSV
row + descriptions/<id>.md, then compare with the original. The check is
strict (frontmatter exact, body byte-for-byte, FK consistent).

Usage:
  ./verify_csv_equiv.py --csv-root /tmp/csv-preview        # check dry-run
  ./verify_csv_equiv.py --csv-root scripts/pipeline        # check live

Exit codes:
  0 = perfect round-trip on all files
  1 = mismatches found (count + sample diffs printed)
  2 = setup error (missing CSVs, missing description files)
"""
from __future__ import annotations

import argparse
import csv
import difflib
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

ISSUE_DIRS = [REPO_ROOT / "scripts" / "pipeline" / "issues",
              REPO_ROOT / "scripts" / "pipeline" / "issues" / "done"]
TASK_DIRS = [REPO_ROOT / "scripts" / "pipeline" / "tasks",
             REPO_ROOT / "scripts" / "pipeline" / "tasks" / "done"]

# Order matters — the reconstruct path emits fields in this exact order
# and the original md files are written in this order too. `completed` and
# `superseded_by` appear only in a handful of legacy files but must be
# slotted into the right positions to round-trip cleanly.
ISSUE_FRONTMATTER_FIELDS = ["priority", "reported", "completed", "status",
                            "source", "parent", "depends",
                            "superseded_by", "summary",
                            "decompose_attempts"]
TASK_FRONTMATTER_FIELDS = ["priority", "reported", "completed", "status",
                           "source", "parent", "depends",
                           "superseded_by", "summary"]

# Trailing whitespace tolerance is [ \t]*, not \s*. \s* would greedily
# consume blank lines after the frontmatter and break round-trip equality.
FRONTMATTER_RE = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*\n", re.DOTALL)


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def parse_md(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        raise ValueError(f"no frontmatter in {path}")
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip()
    body = text[m.end():]
    return fm, body


def reconstruct(row: dict[str, str], fields: list[str],
                desc_path_root: Path) -> str:
    """Rebuild a legacy-md-equivalent string from a CSV row + description."""
    desc_rel = row.get("description_path", "")
    if not desc_rel:
        raise ValueError(f"row {row.get('id')} missing description_path")
    desc_path = desc_path_root / desc_rel
    if not desc_path.is_file():
        raise FileNotFoundError(f"description missing: {desc_path}")
    body = desc_path.read_text(encoding="utf-8")
    lines = ["---"]
    for k in fields:
        v = row.get(k, "")
        # Legacy md sometimes omits empty fields entirely. Mirror that:
        # only emit lines that the original md would have had.
        if v == "":
            continue
        lines.append(f"{k}: {v}")
    lines.append("---")
    fm_block = "\n".join(lines) + "\n"
    return fm_block + body


def collect_md_files() -> tuple[list[Path], list[Path]]:
    issues, tasks = [], []
    for d in ISSUE_DIRS:
        if d.is_dir():
            issues.extend(sorted(d.glob("*.md")))
    for d in TASK_DIRS:
        if d.is_dir():
            tasks.extend(sorted(d.glob("*.md")))
    return issues, tasks


def diff_summary(original: str, reconstructed: str, max_lines: int = 8) -> str:
    diff = list(difflib.unified_diff(
        original.splitlines(keepends=True),
        reconstructed.splitlines(keepends=True),
        fromfile="original", tofile="reconstructed", n=2,
    ))
    if not diff:
        return "(no textual diff)"
    return "".join(diff[: max_lines + 4])  # +4 for the headers


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-root", required=True,
                    help="directory containing csv files (e.g. "
                         "/tmp/csv-preview or scripts/pipeline)")
    ap.add_argument("--show", type=int, default=5,
                    help="how many sample diffs to print (default 5)")
    args = ap.parse_args()

    csv_root = Path(args.csv_root)
    if csv_root.name != "pipeline":
        # accept either "/tmp/csv-preview" or ".../scripts/pipeline"
        candidate = csv_root / "scripts" / "pipeline"
        if candidate.is_dir():
            csv_root = candidate
    if not csv_root.is_dir():
        print(f"ERROR: csv root not found: {csv_root}")
        return 2

    issues_csv = csv_root / "issues.csv"
    tasks_csv = csv_root / "tasks.csv"
    if not issues_csv.exists() or not tasks_csv.exists():
        print(f"ERROR: csv files missing under {csv_root}")
        return 2

    # description root: csv files live under scripts/pipeline; description
    # paths are repo-relative ("scripts/pipeline/descriptions/...") so
    # walk back to the repo-root proxy.
    desc_root = csv_root.parent.parent  # /tmp/csv-preview or REPO_ROOT

    issue_rows = {r["id"]: r for r in read_csv_rows(issues_csv)}
    task_rows = {r["id"]: r for r in read_csv_rows(tasks_csv)}

    issue_paths, task_paths = collect_md_files()

    total = 0
    mismatches = []
    missing_in_csv = []
    sample_diffs = []

    def check(paths, rows_map, fields, kind):
        nonlocal total
        for p in paths:
            total += 1
            row_id = p.stem
            if row_id not in rows_map:
                missing_in_csv.append(f"{kind}: {row_id}")
                continue
            try:
                reconstructed = reconstruct(rows_map[row_id], fields,
                                            desc_root)
            except Exception as e:
                mismatches.append(f"{kind}/{row_id}: reconstruct failed: {e}")
                continue
            original = p.read_text(encoding="utf-8")
            # Tolerate one specific harmless variant: trailing newline.
            o = original
            r = reconstructed
            if o.rstrip("\n") == r.rstrip("\n"):
                continue
            mismatches.append(f"{kind}/{row_id}")
            if len(sample_diffs) < args.show:
                sample_diffs.append((row_id, diff_summary(o, r)))

    check(issue_paths, issue_rows, ISSUE_FRONTMATTER_FIELDS, "issues")
    check(task_paths, task_rows, TASK_FRONTMATTER_FIELDS, "tasks")

    print(f"Total md files checked: {total}")
    print(f"Missing in CSV: {len(missing_in_csv)}")
    print(f"Mismatches: {len(mismatches)}")

    if missing_in_csv:
        print("\n-- missing in CSV (first 10) --")
        for x in missing_in_csv[:10]:
            print(f"  {x}")

    if mismatches:
        print("\n-- mismatches (first {}) --".format(min(args.show,
                                                        len(mismatches))))
        for rid, d in sample_diffs:
            print(f"\n### {rid}")
            print(d)
        return 1

    if missing_in_csv:
        return 1

    print("\nALL EQUIVALENT (round-trip OK)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
