#!/usr/bin/env bash
# ============================================================
# audit-pr-backlog.sh — Read-only audit of open PRs.
# ============================================================
# Categorises every open PR by mergeability / draft / CI state and
# prints recommended next actions. Does NOT close, merge, label, or
# otherwise modify anything — strictly read-only.
#
# Categories (first match wins per PR):
#   ready-to-merge   non-draft + CI=PASS + mergeStateStatus∈{CLEAN,UNSTABLE}
#   awaiting-review  non-draft + CI=PASS + mergeable but no UNSTABLE/CLEAN signal
#   ci-failing       non-draft + at least one FAILURE conclusion in rollup
#   conflicting      mergeStateStatus∈{DIRTY,CONFLICTING}
#   stale-draft      isDraft + age ≥ 7d
#   fresh-draft      isDraft + age < 7d
#   other            anything not matched above
#
# Usage
#   bash scripts/pipeline/audit-pr-backlog.sh
#   bash scripts/pipeline/audit-pr-backlog.sh -v|--verbose
#   bash scripts/pipeline/audit-pr-backlog.sh --auto-improve-only
#   bash scripts/pipeline/audit-pr-backlog.sh -h|--help
#
# Exit codes
#   0 success   1 gh failure / empty payload   2 bad args
# ============================================================
set -uo pipefail

VERBOSE=0
AUTO_ONLY=0

print_help() {
  sed -n '2,25p' "$0"
}

for arg in "$@"; do
  case "$arg" in
    -v|--verbose)        VERBOSE=1 ;;
    --auto-improve-only) AUTO_ONLY=1 ;;
    -h|--help)           print_help; exit 0 ;;
    *)                   echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
cd "$PROJECT_DIR" || { echo "ERROR: cannot cd to $PROJECT_DIR" >&2; exit 1; }

# Fetch into a temp file (NOT a shell var). Embedding the JSON inside a
# python heredoc via shell expansion breaks on quotes / non-ASCII titles
# and on payloads > the arg-list limit. Mirror the pattern used in
# auto-stale-pr-close.sh: write JSON to /tmp, hand python the path.
TMP_JSON="$(mktemp -t audit-pr-backlog.XXXXXX.json)"
trap 'rm -f "$TMP_JSON"' EXIT

if ! gh pr list --state open --limit 300 \
      --json number,title,headRefName,createdAt,isDraft,statusCheckRollup,mergeStateStatus \
      > "$TMP_JSON" 2>/dev/null; then
  echo "ERROR: gh pr list failed (gh auth? offline? rate limit?)" >&2
  exit 1
fi

if [[ ! -s "$TMP_JSON" ]] || [[ "$(<"$TMP_JSON")" == "[]" ]]; then
  if [[ ! -s "$TMP_JSON" ]]; then
    echo "ERROR: gh pr list returned empty output" >&2
    exit 1
  fi
  # Empty list is a valid state — emit a minimal report and exit 0.
  echo "=== PR Backlog Audit ($(date -Iseconds)) ==="
  echo "Total open: 0"
  echo "(no open PRs)"
  exit 0
fi

python3 - "$TMP_JSON" "$VERBOSE" "$AUTO_ONLY" <<'PY'
import json
import sys
from datetime import datetime, timezone

json_path = sys.argv[1]
verbose   = sys.argv[2] == "1"
auto_only = sys.argv[3] == "1"

with open(json_path, "r", encoding="utf-8") as f:
    prs = json.load(f)

now = datetime.now(timezone.utc)

CATS = [
    "ready-to-merge",
    "awaiting-review",
    "ci-failing",
    "conflicting",
    "stale-draft",
    "fresh-draft",
    "other",
]
buckets = {c: [] for c in CATS}

filtered = []
for pr in prs:
    head = pr.get("headRefName", "") or ""
    if auto_only and not head.startswith("auto-improve-"):
        continue
    filtered.append(pr)

for pr in filtered:
    created_iso = pr.get("createdAt", "")
    try:
        ca = datetime.fromisoformat(created_iso.replace("Z", "+00:00"))
        age_days = (now - ca).days
        age_hours = int((now - ca).total_seconds() // 3600)
    except Exception:
        age_days = -1
        age_hours = -1
    pr["_age_days"] = age_days
    pr["_age_hours"] = age_hours

    is_draft = bool(pr.get("isDraft", False))
    mss = (pr.get("mergeStateStatus") or "").upper()
    rollup = pr.get("statusCheckRollup") or []
    if not isinstance(rollup, list):
        rollup = []

    # Aggregate check conclusions. GitHub uses "" or None while pending.
    conclusions = []
    for c in rollup:
        if isinstance(c, dict):
            conclusions.append((c.get("conclusion") or "").upper())
    has_failure = any(c == "FAILURE" for c in conclusions)
    # "Pass" = at least one check, none failing, none pending. SKIPPED /
    # NEUTRAL count as pass-equivalent (matches GitHub's rollup semantics).
    pending = any(c in ("", "PENDING", "IN_PROGRESS", "QUEUED") for c in conclusions)
    has_pass = bool(conclusions) and not has_failure and not pending

    # First match wins — order matters.
    if has_failure and not is_draft:
        bucket = "ci-failing"
    elif mss in ("DIRTY", "CONFLICTING"):
        bucket = "conflicting"
    elif is_draft and age_days >= 7:
        bucket = "stale-draft"
    elif is_draft:
        bucket = "fresh-draft"
    elif mss in ("CLEAN", "UNSTABLE") and has_pass:
        bucket = "ready-to-merge"
    elif mss == "CLEAN":
        bucket = "awaiting-review"
    else:
        bucket = "other"
    buckets[bucket].append(pr)

# ── Header ──
hdr_suffix = "  (auto-improve-* only)" if auto_only else ""
print(f"=== PR Backlog Audit ({now.isoformat(timespec='seconds')}) ===")
print(f"Total open: {len(filtered)}{hdr_suffix}")
print()

# ── Per-category sections ──
for cat in CATS:
    items = buckets[cat]
    if not items:
        continue
    items.sort(key=lambda p: -(p.get("_age_days") or 0))
    print(f"--- {cat.upper()} ({len(items)}) ---")
    for pr in items:
        num   = pr.get("number", "?")
        age_d = pr.get("_age_days", -1)
        title = (pr.get("title") or "")[:50]
        print(f"  #{num:<5} [{age_d:>3}d]  {title}")
        if verbose:
            head = pr.get("headRefName", "") or ""
            mss = pr.get("mergeStateStatus") or "UNKNOWN"
            rollup = pr.get("statusCheckRollup") or []
            check_summary_parts = []
            for c in rollup:
                if not isinstance(c, dict):
                    continue
                name = c.get("name") or c.get("workflowName") or "?"
                concl = c.get("conclusion") or c.get("status") or "?"
                check_summary_parts.append(f"{name}={concl}")
            checks = ", ".join(check_summary_parts) if check_summary_parts else "(no checks)"
            print(f"        head={head}  merge={mss}")
            print(f"        checks: {checks}")
    print()

# ── Recommended actions ──
print("=== Recommended Actions ===")
any_action = False
n_stale_draft = len(buckets["stale-draft"])
n_ci_fail     = len(buckets["ci-failing"])
n_ready       = len(buckets["ready-to-merge"])
n_conflict    = len(buckets["conflicting"])
n_awaiting    = len(buckets["awaiting-review"])

if n_stale_draft:
    any_action = True
    print(f"- {n_stale_draft} stale draft(s) (>=7d) → run: bash scripts/pipeline/auto-stale-pr-close.sh --apply")
if n_ci_fail:
    any_action = True
    print(f"- {n_ci_fail} CI-failing non-draft → will be auto-closed at 48h by auto-stale-pr-close R3 (CI_FAIL_HOURS)")
if n_ready:
    any_action = True
    print(f"- {n_ready} ready-to-merge → human review or run: bash scripts/pipeline/auto-merge-pr.sh --apply")
if n_conflict:
    any_action = True
    print(f"- {n_conflict} conflicting → manual rebase, or auto-stale-pr-close --apply (CONFLICT_HOURS=6h closes auto-improve-*)")
if n_awaiting:
    any_action = True
    print(f"- {n_awaiting} awaiting-review (CI green, mergeable) → human review")

# Cap warning is always relevant when looking at autonomous backlog.
auto_improve_total = sum(
    1 for p in prs if (p.get("headRefName") or "").startswith("auto-improve-")
)
if auto_improve_total > 20:
    any_action = True
    print(f"- WARNING: {auto_improve_total} auto-improve-* PRs open (soft cap is 20)")

if not any_action:
    print("- (none — backlog is healthy)")
PY
