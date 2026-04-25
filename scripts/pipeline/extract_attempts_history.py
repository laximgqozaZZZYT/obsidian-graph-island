#!/usr/bin/env python3
"""
extract_attempts_history.py — One-shot recovery of `### Attempt N`
sections that were dropped during the Phase 1 md → CSV migration.

Walks the legacy md tree at commit 9a2c20e7^ (the snapshot just before
the bulk migration), extracts every `### Attempt N` section, and
appends rows to scripts/pipeline/attempts.csv.

Run-once: after committing the result, this script can be deleted.

Usage:
  ./extract_attempts_history.py --dry-run   # print what would be added
  ./extract_attempts_history.py --apply     # append rows to attempts.csv
"""
from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PHASE_0_BASE = "9a2c20e7^"  # commit just before the bulk migration

# Re-use the schema from csv_lib (also documented in csv-schema.md)
sys.path.insert(0, str(REPO_ROOT / "scripts" / "pipeline"))
import csv_lib  # noqa: E402

ATTEMPT_HEADER = re.compile(r"^###\s+Attempt\s+(\d+)\b.*$", re.MULTILINE)
TIMESTAMP_HINT = re.compile(r"\((\d{4}-\d{2}-\d{2}T[\d:+\-]+)\)")
STATUS_LINE = re.compile(r"^- Status:\s*(.+)$", re.MULTILINE)


def git_show(path: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", "show", f"{PHASE_0_BASE}:{path}"],
            capture_output=True, text=True, cwd=str(REPO_ROOT), check=True,
        )
        return out.stdout
    except subprocess.CalledProcessError:
        return None


def list_md_paths() -> list[str]:
    out = subprocess.run(
        ["git", "ls-tree", "-r", PHASE_0_BASE, "--name-only",
         "--", "scripts/pipeline/issues", "scripts/pipeline/tasks"],
        capture_output=True, text=True, cwd=str(REPO_ROOT), check=True,
    )
    return [p for p in out.stdout.splitlines() if p.endswith(".md")]


def parse_attempts(text: str) -> list[dict[str, str]]:
    """Return [{attempt_no, timestamp, status_before, note}, …] for the file."""
    matches = list(ATTEMPT_HEADER.finditer(text))
    if not matches:
        return []
    out = []
    for i, m in enumerate(matches):
        attempt_no = m.group(1)
        section_start = m.start()
        section_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section = text[section_start:section_end].rstrip()
        ts_m = TIMESTAMP_HINT.search(section[: section.find("\n") + 1] if "\n" in section else section)
        timestamp = ts_m.group(1) if ts_m else ""
        st_m = STATUS_LINE.search(section)
        status_before = st_m.group(1).strip() if st_m else ""
        out.append({
            "attempt_no": attempt_no,
            "timestamp": timestamp,
            "status_before": status_before,
            "note": section,
        })
    return out


def parent_kind_id(path: str) -> tuple[str, str] | None:
    """Map an md path back to (kind, id)."""
    p = Path(path)
    if p.suffix != ".md":
        return None
    name = p.stem
    if "issues" in p.parts:
        return ("issues", name)
    if "tasks" in p.parts:
        return ("tasks", name)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    paths = list_md_paths()
    print(f"  scanning {len(paths)} md files at {PHASE_0_BASE}")

    new_rows: list[dict[str, str]] = []
    files_with_attempts: list[str] = []

    for path in paths:
        text = git_show(path)
        if text is None:
            continue
        attempts = parse_attempts(text)
        if not attempts:
            continue
        kind_id = parent_kind_id(path)
        if kind_id is None:
            continue
        kind, row_id = kind_id
        files_with_attempts.append(f"  {path} → {len(attempts)} attempt(s)")
        for a in attempts:
            row = {
                "issue_id": row_id if kind == "issues" else "",
                "task_id": row_id if kind == "tasks" else "",
                "attempt_no": a["attempt_no"],
                "timestamp": a["timestamp"],
                "status_before": a["status_before"],
                "session_summary": "",
                "note": a["note"],
            }
            new_rows.append(row)

    print(f"\nfiles with attempts ({len(files_with_attempts)}):")
    for line in files_with_attempts:
        print(line)
    print(f"\ntotal new rows: {len(new_rows)}")

    if args.dry_run:
        print("\n--dry-run — not appending. Sample rows:")
        for r in new_rows[:3]:
            print(f"  parent: {r['issue_id'] or r['task_id']}  attempt: {r['attempt_no']}  ts: {r['timestamp']}")
        return 0

    # Append to attempts.csv
    spec = csv_lib._kind("attempts")
    cols, existing = csv_lib._read_rows(spec)
    print(f"\nattempts.csv current rows: {len(existing)}")
    if existing:
        print("WARNING: attempts.csv already has rows. Aborting to avoid duplicates.")
        print("  If you really want to append, clear attempts.csv first.")
        return 2

    # Use csv_lib's atomic-write helper to keep semantics consistent.
    all_rows = existing + new_rows
    csv_lib._write_rows_atomic(spec, cols, all_rows)
    print(f"\nappended {len(new_rows)} rows. Validating…")

    errs = csv_lib.cmd_validate("attempts")
    if errs:
        print(f"VALIDATION ERRORS: {len(errs)}")
        for e in errs[:5]:
            print(f"  {e}")
        return 3
    print("validate: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
