#!/usr/bin/env python3
"""migrate-subtask-summaries.py — One-shot kaizen (2026-05-08).

Replaces historical 'subtask' boilerplate summaries in tasks.csv with
parent-derived labels. Without this migration, the
``csv_max_summary_jaccard`` similarity check in the autonomous pipeline
treats every legacy row as having the bag-of-words {"subtask"}, which
trivially matches any new issue whose summary contains "subtask",
causing the pipeline to incorrectly skip/dedupe brand-new tasks.

Strategy
--------
Use the ``parent`` column (always populated for these rows) instead of
trying to regex-parse the densely-encoded ``id``.  ``parent_short`` =
leading numeric token + up to 3 non-numeric words of the parent slug.
This keeps summaries concise yet distinctive (482 distinct labels for
569 rows in current data).

Output examples
---------------
``1000-976-subtask`` (parent ``976-943-639-626-subtask-issue-frontmatter-status``)
  -> ``subtask of 976 subtask issue frontmatter``
``1002-871-subtask`` (parent ``871-747-subtask``)
  -> ``subtask of 871 subtask``

Idempotent: re-running on an already-migrated CSV is a no-op (only rows
where ``summary == "subtask"`` are touched).
"""

from __future__ import annotations

import csv
import os
import re
import shutil
import sys
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "tasks.csv"
BAK_PATH = CSV_PATH.with_suffix(CSV_PATH.suffix + ".bak")
TMP_PATH = CSV_PATH.with_suffix(CSV_PATH.suffix + ".tmp")

# Match a leading numeric segment (one or more `\d+-` chunks then `\d+`)
# followed optionally by a slug tail.
_PARENT_RE = re.compile(r"^((?:\d+-)*\d+)(?:-(.+))?$")


def derive_summary(parent: str) -> str | None:
    """Build a concise, parent-derived label for a legacy 'subtask' row.

    Returns None when the parent column is empty / 'none' so the caller
    can record a skip.  Returns a fallback truncation when the parent
    does not start with digits (defensive — should not occur in current
    data).
    """
    if not parent or parent == "none":
        return None
    m = _PARENT_RE.match(parent)
    if not m:
        # Defensive fallback: parent has no leading digits.  Use the
        # first 40 chars of the slug verbatim.
        return f"subtask of {parent[:40]}"
    leading = m.group(1).split("-")[0]  # first numeric token only
    tail = m.group(2) or ""
    words = [w for w in tail.split("-") if w and not w.isdigit()][:3]
    if words:
        return f"subtask of {leading} {' '.join(words)}"
    return f"subtask of {leading}"


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found", file=sys.stderr)
        return 1

    shutil.copy2(CSV_PATH, BAK_PATH)
    print(f"Backup written: {BAK_PATH}")

    total = updated = skipped = 0
    with open(CSV_PATH, newline="") as f_in, open(TMP_PATH, "w", newline="") as f_out:
        reader = csv.DictReader(f_in)
        if reader.fieldnames is None:
            print("ERROR: CSV has no header", file=sys.stderr)
            return 1
        writer = csv.DictWriter(
            f_out,
            fieldnames=reader.fieldnames,
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in reader:
            total += 1
            if row.get("summary") == "subtask":
                new_summary = derive_summary(row.get("parent", ""))
                if new_summary:
                    row["summary"] = new_summary
                    updated += 1
                else:
                    skipped += 1
            writer.writerow(row)

    os.replace(TMP_PATH, CSV_PATH)

    print(f"Total rows: {total}")
    print(f"Updated:    {updated}")
    print(f"Skipped (no parent):    {skipped}")
    print(f"Backup retained at:     {BAK_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
