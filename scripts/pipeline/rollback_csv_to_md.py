#!/usr/bin/env python3
"""
rollback_csv_to_md.py — emergency reverse migration: rebuild legacy md
files from CSV rows + descriptions/<id>.md.

Use this if Phase 2 surfaces a blocker and we need to revert pipeline
state to the md-based world without losing recent CSV-side work.

Output layout (mirrors pre-migration):
  scripts/pipeline/issues/<id>.md         (status in active set)
  scripts/pipeline/issues/done/<id>.md    (status in archive set)
  scripts/pipeline/tasks/<id>.md          (status in active set)
  scripts/pipeline/tasks/done/<id>.md     (status in archive set)

Active set: pending, in-progress, decomposed
Archive set: blocked, undecomposable, done, cancelled, superseded

Usage:
  ./rollback_csv_to_md.py --dry-run      # writes to /tmp/md-rollback-preview/
  ./rollback_csv_to_md.py --apply        # writes to scripts/pipeline/{issues,tasks}/[done/]

Notes:
- The tool does NOT delete the CSV files; the caller decides whether to
  remove them or keep both formats during a hot-rollback.
- Description files are read from scripts/pipeline/descriptions/.
- Round-trip equivalence is enforced by Phase 1's verify_csv_equiv.py;
  if you trust that check, this rollback's output should match the
  pre-migration md content modulo trailing newlines.
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = REPO_ROOT / "scripts" / "pipeline"

ACTIVE_STATUSES = {"pending", "in-progress", "decomposed"}
ARCHIVE_STATUSES = {"blocked", "undecomposable", "done", "cancelled",
                    "superseded"}

ISSUE_FIELDS = ["priority", "reported", "completed", "status", "source",
                "parent", "depends", "superseded_by", "summary",
                "decompose_attempts"]
TASK_FIELDS = ["priority", "reported", "completed", "status", "source",
               "parent", "depends", "superseded_by", "summary"]


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def reconstruct(row: dict[str, str], fields: list[str],
                desc_root: Path) -> str:
    desc_rel = row.get("description_path", "")
    desc_path = desc_root / desc_rel
    body = desc_path.read_text(encoding="utf-8") if desc_path.is_file() else ""
    lines = ["---"]
    for k in fields:
        v = row.get(k, "")
        if v == "":
            continue
        lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n" + body


def output_path(out_root: Path, kind: str, status: str, row_id: str) -> Path:
    if status in ACTIVE_STATUSES:
        return out_root / kind / f"{row_id}.md"
    return out_root / kind / "done" / f"{row_id}.md"


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if args.dry_run:
        out_root = Path("/tmp/md-rollback-preview/scripts/pipeline")
        if out_root.exists():
            shutil.rmtree(out_root)
        out_root.mkdir(parents=True)
    else:
        out_root = PIPELINE_DIR

    desc_root = REPO_ROOT  # description_path is repo-relative

    issue_rows = read_csv(PIPELINE_DIR / "issues.csv")
    task_rows = read_csv(PIPELINE_DIR / "tasks.csv")

    written = 0
    skipped = 0
    for row in issue_rows:
        rid = row.get("id", "")
        if not rid:
            skipped += 1
            continue
        text = reconstruct(row, ISSUE_FIELDS, desc_root)
        path = output_path(out_root, "issues", row.get("status", "done"), rid)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        written += 1
    for row in task_rows:
        rid = row.get("id", "")
        if not rid:
            skipped += 1
            continue
        text = reconstruct(row, TASK_FIELDS, desc_root)
        path = output_path(out_root, "tasks", row.get("status", "done"), rid)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        written += 1

    print(f"reconstructed {written} md files (skipped {skipped})")
    print(f"output root: {out_root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
