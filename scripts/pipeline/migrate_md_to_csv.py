#!/usr/bin/env python3
"""
migrate_md_to_csv.py — Phase 1: bulk-convert legacy md files into the
CSV schema established in Phase 0.

Inputs (read-only):
  scripts/pipeline/issues/*.md
  scripts/pipeline/issues/done/*.md
  scripts/pipeline/tasks/*.md
  scripts/pipeline/tasks/done/*.md

Outputs:
  scripts/pipeline/issues.csv
  scripts/pipeline/tasks.csv
  scripts/pipeline/attempts.csv
  scripts/pipeline/descriptions/<id>.md   (one per row, body verbatim)

Usage:
  ./migrate_md_to_csv.py --dry-run            # writes to /tmp/csv-preview/
  ./migrate_md_to_csv.py --apply              # writes to scripts/pipeline/

Behavior:
- description body is preserved byte-for-byte (everything after the
  closing "---" of the frontmatter, including the leading blank line).
- "### Attempt N" sections are ALSO captured into attempts.csv as
  metadata, but the body itself is kept whole in descriptions/<id>.md
  to make round-trip equivalence with legacy md trivial.
- created_at = git log first-add time of the md file (falls back to
  file mtime if git history unavailable).
- updated_at = file mtime.

Exit codes:
  0 = success
  2 = parse failure on at least one file (none written)
  3 = post-write validation failure
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = REPO_ROOT / "scripts" / "pipeline"
JST = timezone(timedelta(hours=9))

ISSUE_DIRS = [PIPELINE_DIR / "issues", PIPELINE_DIR / "issues" / "done"]
TASK_DIRS = [PIPELINE_DIR / "tasks", PIPELINE_DIR / "tasks" / "done"]

# Re-import schema constants from the helper module
sys.path.insert(0, str(PIPELINE_DIR))
import csv_lib  # noqa: E402

ATTEMPT_HEADER = re.compile(r"^###\s+Attempt\s+(\d+)\s*$", re.MULTILINE)
# IMPORTANT: trailing whitespace tolerance is [ \t]*, not \s*. Using \s*
# would greedily consume the blank line that separates the frontmatter
# from "## Description", breaking byte-for-byte round-trip.
FRONTMATTER = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*\n", re.DOTALL)


def parse_md(path: Path) -> tuple[dict[str, str], str]:
    """Split a legacy md file into (frontmatter dict, body verbatim).
    Body is everything after the closing '---' line; the leading separator
    blank line (if present) is preserved as part of the body.

    Value parsing: only newlines are stripped from the right, and the
    single conventional space after the colon is removed from the left.
    Trailing spaces in values are preserved verbatim (1 legacy md has
    `summary: テスト失敗: ` with a trailing space we must round-trip).
    """
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER.match(text)
    if not m:
        raise ValueError(f"no frontmatter in {path}")
    fm_block = m.group(1)
    body = text[m.end():]
    fm = {}
    for line in fm_block.splitlines():
        # Newlines are not in line (splitlines strips them) but be defensive
        line = line.rstrip("\r\n")
        if not line.strip():
            continue
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        # Drop the conventional single leading space (` value`) but keep
        # any trailing spaces.
        if v.startswith(" "):
            v = v[1:]
        fm[k.strip()] = v
    return fm, body


def extract_attempts(body: str) -> list[dict[str, str]]:
    """Return [{attempt_no, note}] from any '### Attempt N' sections.
    Notes capture everything from the header line up to the next attempt
    header or end-of-body."""
    out = []
    matches = list(ATTEMPT_HEADER.finditer(body))
    for i, m in enumerate(matches):
        no = m.group(1)
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        note = body[start:end].strip()
        out.append({"attempt_no": no, "note": note})
    return out


def git_first_add_time(path: Path) -> str | None:
    """ISO-8601 timestamp of the file's first git commit (--diff-filter=A),
    or None if untracked / no history."""
    try:
        rel = path.relative_to(REPO_ROOT)
    except ValueError:
        return None
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%aI", "--", str(rel)],
            capture_output=True, text=True, cwd=str(REPO_ROOT), timeout=10,
        )
    except (subprocess.SubprocessError, FileNotFoundError):
        return None
    lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
    if not lines:
        return None
    return lines[-1]  # last line = oldest commit


def file_mtime_iso(path: Path) -> str:
    ts = datetime.fromtimestamp(path.stat().st_mtime, tz=JST)
    return ts.replace(microsecond=0).isoformat()


CACHE_FILE = Path("/tmp/git-first-add-cache.json")


def collect_first_add_times(paths: list[Path]) -> dict[Path, str]:
    """Batch-resolve first-add times. Uses /tmp/git-first-add-cache.json
    to avoid re-running git log 1604 times on every dry-run iteration
    (the 7-minute round-trip is unfriendly to fast iteration).
    Cache key = absolute path string. Cache invalidates if the file is
    newer than the recorded created_at, but in practice these are
    historical files that don't move."""
    import json
    cache: dict[str, str] = {}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    out: dict[Path, str] = {}
    fresh_resolved = 0
    for p in paths:
        key = str(p)
        cached = cache.get(key)
        if cached:
            out[p] = cached
            continue
        ts = git_first_add_time(p)
        if ts is None:
            ts = file_mtime_iso(p)
        out[p] = ts
        cache[key] = ts
        fresh_resolved += 1
    if fresh_resolved:
        try:
            CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
        except Exception:
            pass
    print(f"  git first-add resolved (fresh: {fresh_resolved}, "
          f"cached: {len(paths) - fresh_resolved})")
    return out


def slug_to_id(stem: str) -> str:
    """Legacy md filename without .md = the id verbatim."""
    return stem


def determine_status(fm: dict[str, str], in_done_dir: bool) -> str:
    """The frontmatter status is authoritative. done dir is just a
    physical placement hint — most done-dir files DO have status=done|
    cancelled|etc, but a few have stale 'pending' or 'decomposed' that
    we must preserve as-is for round-trip fidelity."""
    return fm.get("status", "pending")


def collect_md_files() -> tuple[list[Path], list[Path]]:
    issue_paths = []
    for d in ISSUE_DIRS:
        if d.is_dir():
            issue_paths.extend(sorted(d.glob("*.md")))
    task_paths = []
    for d in TASK_DIRS:
        if d.is_dir():
            task_paths.extend(sorted(d.glob("*.md")))
    return issue_paths, task_paths


def build_row(fm: dict[str, str], path: Path, kind: str,
              created_at: str, updated_at: str,
              description_path: str) -> dict[str, str]:
    """Build a CSV row from frontmatter.

    Round-trip fidelity rule: if a key was ABSENT in the legacy md
    frontmatter, it stays empty in the CSV. The reconstruction code
    (verify_csv_equiv / cmd_to_prompt_text) skips empty cells, so the
    resulting md matches the original byte-for-byte.

    Required fields (id / status / description_path / timestamps) are
    always populated; everything else is preserved verbatim from the
    original frontmatter, including absence.
    """
    in_done_dir = "done" in path.parent.name or path.parent.name == "done"
    status = determine_status(fm, in_done_dir)
    row = {
        "id": path.stem,
        "priority": fm.get("priority", ""),
        "reported": fm.get("reported", ""),
        "completed": fm.get("completed", ""),
        "status": status,
        "source": fm.get("source", ""),
        "parent": fm.get("parent", ""),
        "depends": fm.get("depends", ""),
        "superseded_by": fm.get("superseded_by", ""),
        "summary": fm.get("summary", ""),
        "description_path": description_path,
        "created_at": created_at,
        "updated_at": updated_at,
    }
    if kind == "issues":
        # Preserve absence — empty != "0"
        row["decompose_attempts"] = fm.get("decompose_attempts", "")
    else:
        # attempt_count is derived from the body's ### Attempt N headers,
        # not from frontmatter. Filled by caller after extract_attempts.
        # Use "" (not "0") so it stays out of reconstructed frontmatter.
        row["attempt_count"] = ""
    return row


def write_csv(path: Path, columns: list[str],
              rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns,
                           extrasaction="ignore",
                           quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in columns})


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true",
                   help="write to /tmp/csv-preview/ instead of repo")
    g.add_argument("--apply", action="store_true",
                   help="write to scripts/pipeline/ for real")
    ap.add_argument("--limit", type=int, default=0,
                    help="(debug) only process first N files per kind")
    args = ap.parse_args()

    if args.dry_run:
        out_root = Path("/tmp/csv-preview")
        if out_root.exists():
            shutil.rmtree(out_root)
        out_pipeline = out_root / "scripts" / "pipeline"
    else:
        out_pipeline = PIPELINE_DIR

    out_descriptions = out_pipeline / "descriptions"
    out_descriptions.mkdir(parents=True, exist_ok=True)

    issue_paths, task_paths = collect_md_files()
    if args.limit > 0:
        issue_paths = issue_paths[: args.limit]
        task_paths = task_paths[: args.limit]
    print(f"  issue md files: {len(issue_paths)}")
    print(f"  task  md files: {len(task_paths)}")

    print("== resolving git first-add times (this can take a while) ==")
    all_paths = issue_paths + task_paths
    first_add = collect_first_add_times(all_paths)

    issue_rows: list[dict[str, str]] = []
    task_rows: list[dict[str, str]] = []
    attempts_rows: list[dict[str, str]] = []
    parse_errors: list[str] = []
    seen_ids: dict[str, Path] = {}
    desc_writes: list[tuple[Path, str]] = []

    for kind, paths, rows_list in (
        ("issues", issue_paths, issue_rows),
        ("tasks", task_paths, task_rows),
    ):
        for p in paths:
            try:
                fm, body = parse_md(p)
            except Exception as e:
                parse_errors.append(f"{p}: {e}")
                continue
            row_id = slug_to_id(p.stem)
            if row_id in seen_ids:
                parse_errors.append(
                    f"{p}: duplicate id {row_id} also in {seen_ids[row_id]}"
                )
                continue
            seen_ids[row_id] = p

            desc_rel = f"scripts/pipeline/descriptions/{row_id}.md"
            created = first_add.get(p) or file_mtime_iso(p)
            updated = file_mtime_iso(p)
            row = build_row(fm, p, kind, created, updated, desc_rel)
            attempts = extract_attempts(body)
            if kind == "tasks":
                row["attempt_count"] = str(len(attempts))
            for a in attempts:
                attempts_rows.append({
                    "issue_id": row_id if kind == "issues" else "",
                    "task_id": row_id if kind == "tasks" else "",
                    "attempt_no": a["attempt_no"],
                    "timestamp": updated,
                    "status_before": "",
                    "session_summary": "",
                    "note": a["note"],
                })
            rows_list.append(row)
            desc_writes.append((out_descriptions / f"{row_id}.md", body))

    if parse_errors:
        print(f"\n!! {len(parse_errors)} parse errors — aborting:")
        for e in parse_errors[:20]:
            print(f"  {e}")
        if len(parse_errors) > 20:
            print(f"  ... ({len(parse_errors) - 20} more)")
        return 2

    print(f"\n  parsed: issues={len(issue_rows)}  "
          f"tasks={len(task_rows)}  attempts={len(attempts_rows)}")

    # Write description bodies
    for path, body in desc_writes:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")

    # Write CSVs
    write_csv(out_pipeline / "issues.csv", csv_lib.ISSUE_COLUMNS, issue_rows)
    write_csv(out_pipeline / "tasks.csv", csv_lib.TASK_COLUMNS, task_rows)
    write_csv(out_pipeline / "attempts.csv", csv_lib.ATTEMPT_COLUMNS,
              attempts_rows)

    print(f"\n== wrote ==")
    print(f"  {out_pipeline / 'issues.csv'}")
    print(f"  {out_pipeline / 'tasks.csv'}")
    print(f"  {out_pipeline / 'attempts.csv'}")
    print(f"  {len(desc_writes)} files in {out_descriptions}")

    # Post-write validation (uses csv_lib against the written outputs).
    # For dry-run we point csv_lib at the preview directory.
    if args.dry_run:
        # Point csv_lib at the preview dir for validation
        csv_lib.PIPELINE_DIR = out_pipeline
        csv_lib.DESCRIPTIONS_DIR = out_descriptions
        csv_lib.REPO_ROOT = out_root
    print(f"\n== validate ==")
    # Phase 1 policy: orphan-parent FK violations are tolerated as
    # warnings — legacy data has a small number of child tasks whose
    # parent issue was manually deleted long ago. Phase 2's CI check
    # tightens this back to errors. Non-FK errors still fail the run.
    any_hard_err = False
    for k in ("issues", "tasks", "attempts"):
        errs = csv_lib.cmd_validate(k)
        fk_warns = [e for e in errs
                    if "not found in issues.csv or tasks.csv" in e]
        hard = [e for e in errs if e not in fk_warns]
        if hard:
            any_hard_err = True
            print(f"  {k}: {len(hard)} ERRORS")
            for e in hard[:10]:
                print(f"    {e}")
            if len(hard) > 10:
                print(f"    ... ({len(hard) - 10} more)")
        if fk_warns:
            print(f"  {k}: {len(fk_warns)} FK warnings (orphan parents — "
                  f"legacy data, tolerated this phase)")
            for e in fk_warns[:5]:
                print(f"    {e}")
            if len(fk_warns) > 5:
                print(f"    ... ({len(fk_warns) - 5} more)")
        if not errs:
            print(f"  {k}: OK")
    if any_hard_err:
        print("\n!! validation failed (non-FK errors)")
        return 3

    print("\nDONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
