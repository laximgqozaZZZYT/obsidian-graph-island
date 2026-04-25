#!/usr/bin/env python3
"""
csv_lib.py — Pipeline CSV helpers (read + read-modify-write).

Backed by csv-schema.md. Used by csv-helpers.sh as a thin Python core for
RFC4180-correct parsing, atomic writes, and FK validation.

Invocation:
    python3 csv_lib.py <subcommand> [args...]

Stable subcommands (used by csv-helpers.sh):
    get_field <kind> <id> <field>
    get_status <kind> <id>
    select_pending <kind> [priority]
    select_by_parent <kind> <parent_id>
    select_by_status <kind> <status>
    count_active <kind>
    to_prompt_text <kind> <id>
    set_status <kind> <id> <new_status>
    set_field <kind> <id> <field> <value>
    increment_attempts <kind> <id>
    insert <kind> <id> [k=v ...]
    append_attempt <kind> <id> <note> [session_summary]
    archive <kind> <id>
    validate <kind>
    export_md <kind> <id>
    self_test

Concurrency: write subcommands take a flock at function entry. Reads are
lock-free (POSIX rename guarantees atomic whole-file replacement).
"""
from __future__ import annotations

import csv
import errno
import fcntl
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Iterable

# ---------- Configuration ----------

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = REPO_ROOT / "scripts" / "pipeline"
DESCRIPTIONS_DIR = PIPELINE_DIR / "descriptions"

ISSUE_COLUMNS = [
    "id", "priority", "reported", "completed", "status", "source", "parent",
    "depends", "superseded_by", "summary", "decompose_attempts",
    "description_path", "created_at", "updated_at",
]
TASK_COLUMNS = [
    "id", "priority", "reported", "completed", "status", "source", "parent",
    "depends", "superseded_by", "summary", "attempt_count",
    "description_path", "created_at", "updated_at",
]
ATTEMPT_COLUMNS = [
    "issue_id", "task_id", "attempt_no", "timestamp",
    "status_before", "session_summary", "note",
]

VALID_PRIORITIES = {"critical", "high", "medium", "low", "skip"}
# Statuses observed in 1604 legacy md files (some appear only in done dir):
# pending / in-progress = active. decomposed = subtasks generated.
# blocked = exhausted attempts. undecomposable = LLM gave up.
# done = success. cancelled = manually closed. superseded = replaced by later
# work without completion.
VALID_ISSUE_STATUSES = {"pending", "in-progress", "decomposed", "blocked",
                        "undecomposable", "done", "cancelled", "superseded"}
VALID_TASK_STATUSES = {"pending", "in-progress", "decomposed", "blocked",
                       "undecomposable", "done", "cancelled", "superseded"}
# source = how the row was created. Legacy md uses these spellings; new
# rows should pick from the active set.
VALID_ISSUE_SOURCES = {"auto-discovered", "kaizen", "e2e-patrol", "user",
                       "decomposed", "manual"}
VALID_TASK_SOURCES = {"decomposed", "user", "manual"}

ACTIVE_ISSUE_STATUSES = {"pending", "in-progress", "decomposed"}
ACTIVE_TASK_STATUSES = {"pending", "in-progress"}

LOCK_DIR = Path("/tmp")
LOCK_TIMEOUT_SEC = 30
LOCK_RETRY_COUNT = 3
LOCK_RETRY_SLEEP_SEC = 2

JST = timezone(timedelta(hours=9))


def _now_iso() -> str:
    return datetime.now(JST).replace(microsecond=0).isoformat()


# ---------- Kind dispatch ----------

class KindSpec:
    def __init__(self, name: str, columns: list[str], statuses: set[str],
                 active_statuses: set[str], sources: set[str],
                 attempts_field: str, csv_path: Path, lock_path: Path):
        self.name = name
        self.columns = columns
        self.statuses = statuses
        self.active_statuses = active_statuses
        self.sources = sources
        self.attempts_field = attempts_field
        self.csv_path = csv_path
        self.lock_path = lock_path


def _kind(kind: str) -> KindSpec:
    if kind == "issues":
        return KindSpec(
            name="issues",
            columns=ISSUE_COLUMNS,
            statuses=VALID_ISSUE_STATUSES,
            active_statuses=ACTIVE_ISSUE_STATUSES,
            sources=VALID_ISSUE_SOURCES,
            attempts_field="decompose_attempts",
            csv_path=PIPELINE_DIR / "issues.csv",
            lock_path=LOCK_DIR / "graph-island-csv-issues.lock",
        )
    if kind == "tasks":
        return KindSpec(
            name="tasks",
            columns=TASK_COLUMNS,
            statuses=VALID_TASK_STATUSES,
            active_statuses=ACTIVE_TASK_STATUSES,
            sources=VALID_TASK_SOURCES,
            attempts_field="attempt_count",
            csv_path=PIPELINE_DIR / "tasks.csv",
            lock_path=LOCK_DIR / "graph-island-csv-tasks.lock",
        )
    if kind == "attempts":
        return KindSpec(
            name="attempts",
            columns=ATTEMPT_COLUMNS,
            statuses=set(),
            active_statuses=set(),
            sources=set(),
            attempts_field="",
            csv_path=PIPELINE_DIR / "attempts.csv",
            lock_path=LOCK_DIR / "graph-island-csv-attempts.lock",
        )
    raise ValueError(f"unknown kind: {kind!r}")


# ---------- Locking + atomic write ----------

class _Locked:
    """File-locked context manager with retry."""

    def __init__(self, lock_path: Path):
        self.lock_path = lock_path
        self.fd = None

    def __enter__(self):
        last_err = None
        for attempt in range(1, LOCK_RETRY_COUNT + 1):
            try:
                self.fd = os.open(str(self.lock_path),
                                  os.O_CREAT | os.O_WRONLY, 0o644)
                deadline = time.monotonic() + LOCK_TIMEOUT_SEC
                while True:
                    try:
                        fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        return self
                    except BlockingIOError:
                        if time.monotonic() >= deadline:
                            raise TimeoutError(
                                f"flock timeout on {self.lock_path}")
                        time.sleep(0.2)
            except (TimeoutError, OSError) as e:
                last_err = e
                if self.fd is not None:
                    os.close(self.fd)
                    self.fd = None
                if attempt < LOCK_RETRY_COUNT:
                    time.sleep(LOCK_RETRY_SLEEP_SEC)
                else:
                    raise
        raise last_err  # unreachable

    def __exit__(self, *exc):
        if self.fd is not None:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_UN)
            finally:
                os.close(self.fd)
                self.fd = None


def _ensure_csv_exists(spec: KindSpec) -> None:
    if spec.csv_path.exists():
        return
    spec.csv_path.parent.mkdir(parents=True, exist_ok=True)
    with spec.csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(spec.columns)


def _read_rows(spec: KindSpec) -> tuple[list[str], list[dict]]:
    _ensure_csv_exists(spec)
    with spec.csv_path.open("r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        if r.fieldnames is None:
            return spec.columns, []
        rows = [dict(row) for row in r]
        return list(r.fieldnames), rows


def _write_rows_atomic(spec: KindSpec, columns: list[str],
                       rows: list[dict]) -> None:
    tmp = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="",
        dir=str(spec.csv_path.parent), prefix=f".{spec.csv_path.name}.",
        suffix=".tmp", delete=False,
    )
    try:
        w = csv.DictWriter(tmp, fieldnames=columns,
                           extrasaction="ignore", quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for row in rows:
            w.writerow({c: row.get(c, "") for c in columns})
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, spec.csv_path)
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise


def _find_row(rows: list[dict], row_id: str) -> dict | None:
    for r in rows:
        if r.get("id") == row_id:
            return r
    return None


# ---------- READ APIs ----------

def cmd_get_field(kind: str, row_id: str, field: str) -> str:
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    row = _find_row(rows, row_id)
    if row is None:
        return ""
    return row.get(field, "")


def cmd_get_status(kind: str, row_id: str) -> str:
    return cmd_get_field(kind, row_id, "status")


def cmd_select_pending(kind: str, priority: str | None = None) -> list[str]:
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    out: list[str] = []
    for r in rows:
        if r.get("status") != "pending":
            continue
        if priority and r.get("priority") != priority:
            continue
        out.append(r["id"])
    return out


def cmd_select_by_parent(kind: str, parent_id: str) -> list[str]:
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    return [r["id"] for r in rows if r.get("parent") == parent_id]


def cmd_select_by_status(kind: str, status: str) -> list[str]:
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    return [r["id"] for r in rows if r.get("status") == status]


def cmd_count_active(kind: str) -> int:
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    return sum(1 for r in rows if r.get("status") in spec.active_statuses)


def cmd_next_id_num() -> int:
    """Next monotonically-increasing numeric prefix usable for a new id.

    The pipeline shares one number space between issues and tasks
    (legacy invariant — 147 cannot be both an issue and a task id).
    Returns max(existing) + 1, or 1 if both files are empty.
    """
    issues_spec = _kind("issues")
    tasks_spec = _kind("tasks")
    _, ir = _read_rows(issues_spec)
    _, tr = _read_rows(tasks_spec)
    nums: list[int] = []
    for r in ir + tr:
        m = re.match(r"(\d+)", r.get("id", ""))
        if m:
            nums.append(int(m.group(1)))
    return (max(nums) + 1) if nums else 1


def cmd_select_active_by_slug(kind: str, slug: str) -> list[str]:
    """Find rows whose id ends with `-<slug>` and whose status is active.

    Matches both top-level issues (`<num>-<slug>`) and tasks
    (`<num>-<parent_num>-<slug>`). Used by discovery scripts to detect
    that the same kaizen-detected problem is already filed.
    """
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    suffix = "-" + slug
    out: list[str] = []
    for r in rows:
        rid = r.get("id", "")
        if not rid.endswith(suffix):
            continue
        if r.get("status") in {"pending", "in-progress", "decomposed",
                                "undecomposable"}:
            out.append(rid)
    return out


def cmd_select_blocked_by_slug(kind: str, slug: str) -> list[str]:
    """Find rows whose id ends with `-<slug>` and whose status is `blocked`.
    Used by the cooldown check in discover-issues.sh."""
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    suffix = "-" + slug
    out: list[str] = []
    for r in rows:
        rid = r.get("id", "")
        if rid.endswith(suffix) and r.get("status") == "blocked":
            out.append(rid)
    return out


def cmd_max_summary_jaccard(kind: str, summary: str) -> tuple[int, str]:
    """Return the highest Jaccard similarity (×100, integer) between the
    given summary and any active row's summary in `kind`. Used by
    discover-issues.sh to dedupe near-duplicates with different slugs."""
    spec = _kind(kind)
    _, rows = _read_rows(spec)

    def ws(t: str) -> set[str]:
        return {w for w in re.findall(r"[a-z]{3,}", t.lower())}

    new_ws = ws(summary)
    best_score = 0
    best_summary = ""
    for r in rows:
        if r.get("status") not in {"pending", "in-progress",
                                    "decomposed", "undecomposable"}:
            continue
        s = r.get("summary", "")
        if not s:
            continue
        existing_ws = ws(s)
        if not new_ws or not existing_ws:
            continue
        j = len(new_ws & existing_ws) / len(new_ws | existing_ws)
        score = int(j * 100)
        if score > best_score:
            best_score = score
            best_summary = s[:60]
    return best_score, best_summary


def cmd_to_prompt_text(kind: str, row_id: str) -> str:
    """Reproduce a legacy-md-like view: frontmatter + description body."""
    spec = _kind(kind)
    _, rows = _read_rows(spec)
    row = _find_row(rows, row_id)
    if row is None:
        return ""
    fm_keys = ["priority", "reported", "completed", "status", "source",
               "parent", "depends", "superseded_by", "summary",
               spec.attempts_field]
    lines = ["---"]
    for k in fm_keys:
        v = row.get(k, "")
        if v == "":
            continue
        lines.append(f"{k}: {v}")
    lines.append("---")
    desc_path_rel = row.get("description_path", "")
    body = ""
    if desc_path_rel:
        desc_path = REPO_ROOT / desc_path_rel
        if desc_path.is_file():
            body = desc_path.read_text(encoding="utf-8")
    return "\n".join(lines) + "\n\n" + body


def cmd_export_md(kind: str, row_id: str) -> str:
    """Identical output to to_prompt_text — kept as a separate verb for
    semantic clarity (export = round-trip rollback target)."""
    return cmd_to_prompt_text(kind, row_id)


# ---------- WRITE APIs ----------

def _mutate(spec: KindSpec, mutator) -> None:
    with _Locked(spec.lock_path):
        cols, rows = _read_rows(spec)
        mutator(cols, rows)
        _write_rows_atomic(spec, cols, rows)


def cmd_set_field(kind: str, row_id: str, field: str, value: str) -> None:
    spec = _kind(kind)

    def _do(cols, rows):
        if field not in cols:
            raise ValueError(f"unknown field {field} for {kind}")
        row = _find_row(rows, row_id)
        if row is None:
            raise KeyError(f"{kind} id={row_id} not found")
        row[field] = value
        row["updated_at"] = _now_iso()

    _mutate(spec, _do)


def cmd_set_status(kind: str, row_id: str, new_status: str) -> None:
    spec = _kind(kind)
    if new_status not in spec.statuses:
        raise ValueError(f"invalid status {new_status} for {kind}")
    cmd_set_field(kind, row_id, "status", new_status)


def cmd_increment_attempts(kind: str, row_id: str) -> int:
    spec = _kind(kind)
    new_value = [None]

    def _do(cols, rows):
        row = _find_row(rows, row_id)
        if row is None:
            raise KeyError(f"{kind} id={row_id} not found")
        cur_raw = row.get(spec.attempts_field, "0") or "0"
        try:
            cur = int(cur_raw)
        except ValueError:
            cur = 0
        new = cur + 1
        row[spec.attempts_field] = str(new)
        row["updated_at"] = _now_iso()
        new_value[0] = new

    _mutate(spec, _do)
    return new_value[0]


def cmd_insert(kind: str, row_id: str, fields: dict[str, str]) -> None:
    spec = _kind(kind)
    now = _now_iso()
    today = now[:10]

    def _do(cols, rows):
        if _find_row(rows, row_id) is not None:
            raise ValueError(f"duplicate id {row_id} in {kind}")
        row = {c: "" for c in cols}
        row["id"] = row_id
        row["reported"] = today
        row["created_at"] = now
        row["updated_at"] = now
        if spec.attempts_field:
            row[spec.attempts_field] = "0"
        if spec.name == "tasks":
            row["status"] = "pending"
        elif spec.name == "issues":
            row["status"] = "pending"
        for k, v in fields.items():
            if k not in cols:
                raise ValueError(f"unknown field {k} for {kind}")
            row[k] = v
        # Validate enums
        if spec.name in ("issues", "tasks"):
            if row.get("priority") and row["priority"] not in VALID_PRIORITIES:
                raise ValueError(f"invalid priority {row['priority']}")
            if row.get("status") and row["status"] not in spec.statuses:
                raise ValueError(f"invalid status {row['status']}")
            if row.get("source") and row["source"] not in spec.sources:
                raise ValueError(f"invalid source {row['source']}")
        rows.append(row)

    _mutate(spec, _do)


def cmd_archive(kind: str, row_id: str) -> None:
    """Mark as done (no file move; status is the archive marker)."""
    cmd_set_status(kind, row_id, "done")


def cmd_append_attempt(parent_kind: str, parent_id: str,
                       note: str, session_summary: str = "") -> int:
    """Append to attempts.csv and bump parent attempt count."""
    if parent_kind not in ("issues", "tasks"):
        raise ValueError(f"attempts parent must be issues or tasks")
    parent_spec = _kind(parent_kind)
    attempts_spec = _kind("attempts")

    # Get current status before bumping
    status_before = cmd_get_status(parent_kind, parent_id)

    # Bump parent counter
    new_no = cmd_increment_attempts(parent_kind, parent_id)

    # Append to attempts.csv
    def _do(cols, rows):
        row = {c: "" for c in cols}
        if parent_kind == "issues":
            row["issue_id"] = parent_id
        else:
            row["task_id"] = parent_id
        row["attempt_no"] = str(new_no)
        row["timestamp"] = _now_iso()
        row["status_before"] = status_before
        row["session_summary"] = session_summary
        row["note"] = note
        rows.append(row)

    _mutate(attempts_spec, _do)
    return new_no


# ---------- VALIDATION ----------

def cmd_validate(kind: str) -> list[str]:
    """Return a list of validation errors. Empty = clean."""
    spec = _kind(kind)
    errors: list[str] = []
    cols, rows = _read_rows(spec)
    if cols != spec.columns:
        errors.append(f"header mismatch: expected {spec.columns}, got {cols}")
    seen_ids: set[str] = set()
    for i, r in enumerate(rows, start=2):  # line 1 = header
        if spec.name in ("issues", "tasks"):
            rid = r.get("id", "")
            if not rid:
                errors.append(f"line {i}: empty id")
                continue
            if rid in seen_ids:
                errors.append(f"line {i}: duplicate id {rid}")
            seen_ids.add(rid)
        if spec.name in ("issues", "tasks"):
            if r.get("priority") and r["priority"] not in VALID_PRIORITIES:
                errors.append(
                    f"line {i}: invalid priority {r['priority']!r}")
            if r.get("status") and r["status"] not in spec.statuses:
                errors.append(f"line {i}: invalid status {r['status']!r}")
            if r.get("source") and r["source"] not in spec.sources:
                errors.append(f"line {i}: invalid source {r['source']!r}")
            desc_rel = r.get("description_path", "")
            if desc_rel:
                desc_abs = REPO_ROOT / desc_rel
                if not desc_abs.is_file():
                    errors.append(
                        f"line {i}: description_path missing {desc_rel}")
    if spec.name == "tasks":
        # FK: tasks.parent must reference issues.id OR tasks.id.
        # Tasks-as-parents are legal (e.g. a sub-decompose chain like
        # task 1149 -> task 1154 -> task 1167) and appear naturally in
        # the legacy data set.
        issues_spec = _kind("issues")
        _, issue_rows = _read_rows(issues_spec)
        valid_parents = {r["id"] for r in issue_rows} | \
                        {r["id"] for r in rows}
        for i, r in enumerate(rows, start=2):
            p = r.get("parent", "")
            if p and p != "none" and p not in valid_parents:
                errors.append(
                    f"line {i}: parent {p!r} not found "
                    f"in issues.csv or tasks.csv")
    if spec.name == "attempts":
        for i, r in enumerate(rows, start=2):
            iss, tsk = r.get("issue_id", ""), r.get("task_id", "")
            if bool(iss) == bool(tsk):
                errors.append(
                    f"line {i}: exactly one of issue_id/task_id must be set")
    return errors


# ---------- CLI dispatch ----------

def _print_lines(items: Iterable[str]) -> None:
    for it in items:
        print(it)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: csv_lib.py <subcommand> [args...]", file=sys.stderr)
        return 2

    sub = argv[1]
    args = argv[2:]
    try:
        if sub == "get_field":
            print(cmd_get_field(args[0], args[1], args[2]))
        elif sub == "get_status":
            print(cmd_get_status(args[0], args[1]))
        elif sub == "select_pending":
            kind = args[0]
            priority = args[1] if len(args) > 1 else None
            _print_lines(cmd_select_pending(kind, priority))
        elif sub == "select_by_parent":
            _print_lines(cmd_select_by_parent(args[0], args[1]))
        elif sub == "select_by_status":
            _print_lines(cmd_select_by_status(args[0], args[1]))
        elif sub == "count_active":
            print(cmd_count_active(args[0]))
        elif sub == "next_id_num":
            print(cmd_next_id_num())
        elif sub == "select_active_by_slug":
            _print_lines(cmd_select_active_by_slug(args[0], args[1]))
        elif sub == "select_blocked_by_slug":
            _print_lines(cmd_select_blocked_by_slug(args[0], args[1]))
        elif sub == "max_summary_jaccard":
            score, winner = cmd_max_summary_jaccard(args[0], args[1])
            print(f"{score}|{winner}")
        elif sub == "to_prompt_text":
            sys.stdout.write(cmd_to_prompt_text(args[0], args[1]))
        elif sub == "export_md":
            sys.stdout.write(cmd_export_md(args[0], args[1]))
        elif sub == "set_status":
            cmd_set_status(args[0], args[1], args[2])
        elif sub == "set_field":
            cmd_set_field(args[0], args[1], args[2], args[3])
        elif sub == "increment_attempts":
            print(cmd_increment_attempts(args[0], args[1]))
        elif sub == "insert":
            kind, row_id = args[0], args[1]
            fields = {}
            for kv in args[2:]:
                if "=" not in kv:
                    raise ValueError(f"insert field must be k=v: {kv}")
                k, v = kv.split("=", 1)
                fields[k] = v
            cmd_insert(kind, row_id, fields)
        elif sub == "append_attempt":
            kind, row_id, note = args[0], args[1], args[2]
            session = args[3] if len(args) > 3 else ""
            print(cmd_append_attempt(kind, row_id, note, session))
        elif sub == "archive":
            cmd_archive(args[0], args[1])
        elif sub == "validate":
            errs = cmd_validate(args[0])
            for e in errs:
                print(e, file=sys.stderr)
            return 1 if errs else 0
        elif sub == "self_test":
            return _self_test()
        else:
            print(f"unknown subcommand: {sub}", file=sys.stderr)
            return 2
    except (ValueError, KeyError, TimeoutError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


# ---------- Self-test ----------

def _self_test() -> int:
    """Sandbox test: sets PIPELINE_DIR to a temp dir, runs every API,
    asserts results. No effect on real data."""
    global PIPELINE_DIR, DESCRIPTIONS_DIR, REPO_ROOT
    saved = (PIPELINE_DIR, DESCRIPTIONS_DIR, REPO_ROOT)
    sandbox = Path(tempfile.mkdtemp(prefix="csv-self-test-"))
    try:
        REPO_ROOT = sandbox
        PIPELINE_DIR = sandbox / "scripts" / "pipeline"
        DESCRIPTIONS_DIR = PIPELINE_DIR / "descriptions"
        DESCRIPTIONS_DIR.mkdir(parents=True)

        # Insert an issue
        (DESCRIPTIONS_DIR / "001-test-issue.md").write_text(
            "## Description\nbody text\n", encoding="utf-8")
        cmd_insert("issues", "001-test-issue", {
            "priority": "high", "source": "user",
            "parent": "none", "depends": "none",
            "summary": "test issue", "status": "pending",
            "description_path":
                "scripts/pipeline/descriptions/001-test-issue.md",
        })
        assert cmd_get_status("issues", "001-test-issue") == "pending"
        assert cmd_count_active("issues") == 1
        assert cmd_select_pending("issues") == ["001-test-issue"]

        # Insert a task with parent FK
        (DESCRIPTIONS_DIR / "002-001-test-task.md").write_text(
            "## Description\ntask body\n", encoding="utf-8")
        cmd_insert("tasks", "002-001-test-task", {
            "priority": "high", "source": "decomposed",
            "parent": "001-test-issue", "depends": "none",
            "summary": "test task", "status": "pending",
            "description_path":
                "scripts/pipeline/descriptions/002-001-test-task.md",
        })
        assert cmd_select_by_parent("tasks", "001-test-issue") == \
            ["002-001-test-task"]

        # Status flow
        cmd_set_status("tasks", "002-001-test-task", "in-progress")
        assert cmd_get_status("tasks", "002-001-test-task") == "in-progress"

        # Increment attempts
        n = cmd_increment_attempts("tasks", "002-001-test-task")
        assert n == 1, f"expected 1, got {n}"
        n = cmd_increment_attempts("tasks", "002-001-test-task")
        assert n == 2

        # Append attempt
        no = cmd_append_attempt("tasks", "002-001-test-task",
                                "gates failed", "fix attempt 1")
        assert no == 3  # 2 (manual) + 1 (this)
        attempts_rows = cmd_select_by_status("attempts", "")  # no-op safe
        # validate attempts.csv exists and has 1 row
        _, ar = _read_rows(_kind("attempts"))
        assert len(ar) == 1
        assert ar[0]["task_id"] == "002-001-test-task"

        # Archive
        cmd_archive("tasks", "002-001-test-task")
        assert cmd_get_status("tasks", "002-001-test-task") == "done"

        # Prompt rendering
        prompt = cmd_to_prompt_text("issues", "001-test-issue")
        assert "summary: test issue" in prompt
        assert "## Description" in prompt
        assert "body text" in prompt

        # Validation: no errors expected
        for k in ("issues", "tasks", "attempts"):
            errs = cmd_validate(k)
            assert not errs, f"{k} validate errors: {errs}"

        # Validation: introduce an FK violation
        (DESCRIPTIONS_DIR / "003-999-orphan.md").write_text("body\n",
            encoding="utf-8")
        cmd_insert("tasks", "003-999-orphan", {
            "priority": "low", "source": "decomposed",
            "parent": "999-nonexistent", "depends": "none",
            "summary": "orphan task", "status": "pending",
            "description_path":
                "scripts/pipeline/descriptions/003-999-orphan.md",
        })
        errs = cmd_validate("tasks")
        assert any("999-nonexistent" in e for e in errs), \
            f"expected FK error, got {errs}"

        # Duplicate insert
        try:
            cmd_insert("issues", "001-test-issue", {
                "priority": "high", "source": "user",
                "parent": "none", "depends": "none",
                "summary": "dup", "status": "pending",
                "description_path": "x.md",
            })
            assert False, "expected ValueError on duplicate"
        except ValueError:
            pass

        print("self_test: all assertions passed")
        return 0
    except AssertionError as e:
        print(f"self_test FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        PIPELINE_DIR, DESCRIPTIONS_DIR, REPO_ROOT = saved
        shutil.rmtree(sandbox, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
