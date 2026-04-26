#!/usr/bin/env python3
"""
sweep_decomposed_done.py — Recursive parent rollup for tasks.csv.

The autonomous-improve.sh parent rollup only checks IMMEDIATE siblings
when a task completes. Multi-level decompose chains
(issue → task A → task A1 → task A1a) leave intermediate `decomposed`
tasks as permanent middle-nodes even after every leaf completes.

This sweep walks tasks.csv in memory until fixed-point: any
`decomposed` task whose direct children are all in a TERMINAL state
(done / cancelled / blocked / superseded / undecomposable) is itself
flipped to `done`. Iterates until no flips happen.

Single-process, no per-row subprocess. Fast on 1300+ row tables.

Usage:
  ./sweep_decomposed_done.py --dry-run
  ./sweep_decomposed_done.py --apply
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "pipeline"))
import csv_lib  # noqa: E402

TERMINAL_STATUSES = {
    "done", "cancelled", "blocked", "superseded", "undecomposable",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    spec = csv_lib._kind("tasks")
    cols, rows = csv_lib._read_rows(spec)

    # Index by id for O(1) lookup; also build parent → [children] map.
    by_id: dict[str, dict[str, str]] = {r["id"]: r for r in rows if r.get("id")}
    children_of: dict[str, list[str]] = {}
    for r in rows:
        p = r.get("parent", "")
        if p and p != "none":
            children_of.setdefault(p, []).append(r["id"])

    iteration = 0
    total_flipped = 0
    flipped_ids: list[str] = []

    while True:
        iteration += 1
        flipped = 0
        for r in rows:
            if r.get("status") != "decomposed":
                continue
            rid = r["id"]
            kids = children_of.get(rid, [])
            if not kids:
                # Orphan decomposed (no children) — leave alone (could be
                # a different issue: failed decompose that left no tasks).
                continue
            all_terminal = True
            for cid in kids:
                child = by_id.get(cid)
                if not child or child.get("status") not in TERMINAL_STATUSES:
                    all_terminal = False
                    break
            if all_terminal:
                # In-memory flip in BOTH modes so the next iteration sees
                # the new state (otherwise dry-run would loop forever).
                # Disk write only happens in --apply mode below.
                r["status"] = "done"
                r["updated_at"] = csv_lib._now_iso()
                flipped_ids.append(rid)
                if args.dry_run:
                    print(f"ROLLUP [dry-run]: {rid} → done "
                          f"({len(kids)} children all terminal)")
                flipped += 1
        total_flipped += flipped
        print(f"  iteration {iteration}: {flipped} flips")
        if flipped == 0:
            break
        if iteration >= 30:
            print("WARN: sweep hit iteration cap (30); aborting", file=sys.stderr)
            break

    print(f"\nSweep complete. Total {'would flip' if args.dry_run else 'flipped'}: {total_flipped}")
    remaining_decomposed = sum(1 for r in rows if r.get("status") == "decomposed")
    print(f"Remaining decomposed tasks: {remaining_decomposed}")

    if args.apply and total_flipped > 0:
        # Atomic write via csv_lib helper (acquires per-kind flock).
        with csv_lib._Locked(spec.lock_path):
            csv_lib._write_rows_atomic(spec, cols, rows)
        print(f"\nWrote {len(rows)} rows back to {spec.csv_path}")
        # Validate
        errs = csv_lib.cmd_validate("tasks")
        if errs:
            print(f"\nVALIDATION ERRORS: {len(errs)}")
            for e in errs[:5]:
                print(f"  {e}")
            return 1
        print("validate: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
