#!/usr/bin/env bash
# ============================================================
# csv-helpers-retry.test.sh — Lock contention / retry / error path tests.
# ============================================================
#
# Companion to csv-helpers.test.sh (which covers the happy path of the
# bash facade). This suite focuses on the pieces that csv-helpers.sh
# *bolts on top* of csv_lib.py:
#
#   - host-level flock around mutate-then-commit (line ~177-204 of SUT)
#   - retry / timeout policy in the underlying csv_lib.py (LOCK_TIMEOUT_SEC,
#     LOCK_RETRY_COUNT, LOCK_RETRY_SLEEP_SEC) which the bash layer relies on
#   - error-path stderr writes
#   - status-enum coverage referenced by the active/blocked slug selectors
#
# Strategy: source-grep on csv-helpers.sh + csv_lib.py for the structural
# guarantees, plus a small *sandboxed* behavioural assertion that
# csv_atomic_set_status flips status under a temp lockfile (using the
# same PIPELINE_DIR-redirect trick as csv-helpers.test.sh — copy
# csv_lib.py into a tmp tree so __file__-derived paths stay sandboxed).
#
# Network-independent. No side-effects on real scripts/pipeline/*.csv.
# Deterministic: behavioural test serialises through the same flock the
# SUT uses, so concurrent test runs cannot race.
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/csv-helpers.sh"
CSV_LIB_PY="$REPO_ROOT/scripts/pipeline/csv_lib.py"

passed=0
failed=0

pass() { printf "  PASS: %s\n" "$1"; passed=$((passed + 1)); }
fail() { printf "  FAIL: %s\n" "$1" >&2; failed=$((failed + 1)); }

assert_grep() {
  local label="$1" pattern="$2" file="${3:-$SUT}"
  if grep -qE -- "$pattern" "$file"; then
    pass "$label"
  else
    fail "$label (pattern: $pattern in $(basename "$file"))"
  fi
}

assert_not_grep() {
  local label="$1" pattern="$2" file="${3:-$SUT}"
  if grep -qE -- "$pattern" "$file"; then
    fail "$label (unexpected pattern: $pattern in $(basename "$file"))"
  else
    pass "$label"
  fi
}

# ─────────────────────────────────────────────────────────────
# Section 1: SUT files exist
# ─────────────────────────────────────────────────────────────
echo "== preconditions =="
if [[ -f "$SUT" ]]; then
  pass "csv-helpers.sh exists"
else
  fail "csv-helpers.sh missing at $SUT"
  echo "Results: $passed passed, $failed failed"
  exit 1
fi
if [[ -f "$CSV_LIB_PY" ]]; then
  pass "csv_lib.py exists"
else
  fail "csv_lib.py missing at $CSV_LIB_PY"
  echo "Results: $passed passed, $failed failed"
  exit 1
fi

# ─────────────────────────────────────────────────────────────
# Section 2: Lock + retry infrastructure (host-level, in bash facade)
# ─────────────────────────────────────────────────────────────
echo "== host-level flock infrastructure (csv-helpers.sh) =="
assert_grep "host-level flock invocation"  'flock[[:space:]]+9'
assert_grep "lockfile path declared"       'graph-island-csv-commit\.lock'
assert_grep "lockfile redirected to fd 9"  '9>>"\$_csv_atomic_lock_file"'

# ─────────────────────────────────────────────────────────────
# Section 3: csv_lib.py retry / timeout policy (the layer csv-helpers
# relies on — verifying the contract holds end-to-end).
# ─────────────────────────────────────────────────────────────
echo "== retry / timeout policy (csv_lib.py) =="
assert_grep "LOCK_TIMEOUT_SEC defined"   'LOCK_TIMEOUT_SEC[[:space:]]*=[[:space:]]*[0-9]+'  "$CSV_LIB_PY"
assert_grep "LOCK_RETRY_COUNT defined"   'LOCK_RETRY_COUNT[[:space:]]*=[[:space:]]*[0-9]+'  "$CSV_LIB_PY"
assert_grep "retry sleep defined"        'LOCK_RETRY_SLEEP_SEC[[:space:]]*=[[:space:]]*[0-9]+'  "$CSV_LIB_PY"
assert_grep "retry loop present"         'for[[:space:]]+attempt[[:space:]]+in[[:space:]]+range\(1, LOCK_RETRY_COUNT'  "$CSV_LIB_PY"
assert_grep "flock with LOCK_EX|LOCK_NB" 'fcntl\.flock\(.*LOCK_EX[[:space:]]*\|[[:space:]]*fcntl\.LOCK_NB\)'  "$CSV_LIB_PY"
assert_grep "TimeoutError on lock fail"  'TimeoutError\(' "$CSV_LIB_PY"

# ─────────────────────────────────────────────────────────────
# Section 4: API surface — required helper functions exist
# ─────────────────────────────────────────────────────────────
echo "== required helper functions =="
assert_grep "csv_atomic_set_status defined"    'csv_atomic_set_status\(\)'
assert_grep "csv_atomic_set_field defined"     'csv_atomic_set_field\(\)'
assert_grep "csv_atomic_insert defined"        'csv_atomic_insert\(\)'
assert_grep "csv_select_active_by_slug"        'csv_select_active_by_slug\(\)'
assert_grep "csv_select_blocked_by_slug"       'csv_select_blocked_by_slug\(\)'
assert_grep "csv_select_recent_done_by_slug"   'csv_select_recent_done_by_slug\(\)'
assert_grep "csv_set_field defined"            'csv_set_field\(\)'
assert_grep "csv_set_status defined"           'csv_set_status\(\)'
assert_grep "csv_max_summary_jaccard defined"  'csv_max_summary_jaccard\(\)'
assert_grep "csv_count_active defined"         'csv_count_active\(\)'

# ─────────────────────────────────────────────────────────────
# Section 5: Status enum coverage
# (slug selectors classify rows into active|blocked|done buckets;
#  changing these strings would silently break the autonomous pipeline.)
# ─────────────────────────────────────────────────────────────
echo "== status enum coverage =="
assert_grep "pending status referenced"    'pending'
assert_grep "decomposed status referenced" 'decomposed'
assert_grep "in-progress status referenced" 'in-progress'
assert_grep "blocked status referenced"    'blocked'
assert_grep "done status referenced"       '(status=done|=done|status is `done`)'

# ─────────────────────────────────────────────────────────────
# Section 6: Error-path stderr output
# ─────────────────────────────────────────────────────────────
echo "== error path =="
assert_grep "stderr error message"  '>&2'
assert_grep "early-exit when csv_lib missing" 'csv_lib\.py not found'

# ─────────────────────────────────────────────────────────────
# Section 7: csv_lib integration — bash dispatches into python3
# ─────────────────────────────────────────────────────────────
echo "== csv_lib integration =="
assert_grep "_csv_run dispatcher"    '_csv_run\(\)'
assert_grep "python3 invocation"     'python3[[:space:]]+"\$CSV_LIB"'
assert_grep "CSV_LIB path resolved"  'CSV_LIB="\$CSV_HELPERS_DIR/csv_lib\.py"'

# ─────────────────────────────────────────────────────────────
# Section 8: Atomic-commit contract
# (commit must be silent on "nothing to commit" — otherwise stale dirty
#  state poisons the next pipeline cycle.)
# ─────────────────────────────────────────────────────────────
echo "== atomic-commit contract =="
assert_grep "nothing-to-commit silent path"  'diff --cached --quiet'
assert_grep "commit uses --no-verify"        'commit --no-verify'
assert_grep "PROJECT_DIR override hook"      'PROJECT_DIR:-'

# ─────────────────────────────────────────────────────────────
# Section 9: Behavioural — csv_atomic_set_status flips status under
# the host-level flock without leaving the lockfile in a broken state.
#
# Uses the same sandbox trick as csv-helpers.test.sh (copy csv_lib.py
# into a tmp tree so PIPELINE_DIR — which is __file__-relative — points
# into the sandbox). We override _csv_atomic_lock_file via env so even
# parallel test runs of this suite don't contend on /tmp/graph-island-*.
# ─────────────────────────────────────────────────────────────
echo "== behavioural: csv_atomic_set_status =="

SANDBOX="$(mktemp -d)"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

mkdir -p "$SANDBOX/scripts/pipeline/descriptions"
cp "$CSV_LIB_PY"                                "$SANDBOX/scripts/pipeline/csv_lib.py"
cp "$SUT"                                       "$SANDBOX/scripts/pipeline/csv-helpers.sh"
chmod +x "$SANDBOX/scripts/pipeline/csv_lib.py" 2>/dev/null || true

# Sandbox lockfile — keeps this suite isolated from real cycles + parallel
# test runs (no contention on /tmp/graph-island-csv-commit.lock).
SANDBOX_LOCK="$SANDBOX/csv-commit.lock"

# Source the sandboxed helper, then override the lockfile var.
# shellcheck source=/dev/null
. "$SANDBOX/scripts/pipeline/csv-helpers.sh"
_csv_atomic_lock_file="$SANDBOX_LOCK"
# Disable git side-effects: PROJECT_DIR points at sandbox (no .git → commit
# becomes a no-op via the diff --cached --quiet branch, or git add silently
# fails on the not-a-repo path).
export PROJECT_DIR="$SANDBOX"

# Seed a row.
if csv_insert issues "777-retry-test" \
    "priority=low" "source=auto-discovered" "parent=none" "depends=none" \
    "summary=retry-path test row" "status=pending" \
    "description_path=scripts/pipeline/descriptions/777-retry-test.md" \
    >/dev/null 2>&1; then
  pass "behavioural: csv_insert seeds row"
else
  fail "behavioural: csv_insert seeds row"
fi

# Verify pre-condition.
if [[ "$(csv_get_status issues 777-retry-test 2>/dev/null)" == "pending" ]]; then
  pass "behavioural: pre-condition status=pending"
else
  fail "behavioural: pre-condition status (got: $(csv_get_status issues 777-retry-test 2>/dev/null))"
fi

# Atomic flip → in-progress. Lockfile must materialise.
if csv_atomic_set_status issues "777-retry-test" "in-progress" "test: flip" \
    >/dev/null 2>&1; then
  pass "behavioural: csv_atomic_set_status returns 0"
else
  fail "behavioural: csv_atomic_set_status returns 0"
fi

if [[ -f "$SANDBOX_LOCK" ]]; then
  pass "behavioural: lockfile created"
else
  fail "behavioural: lockfile not created at $SANDBOX_LOCK"
fi

if [[ "$(csv_get_status issues 777-retry-test 2>/dev/null)" == "in-progress" ]]; then
  pass "behavioural: status flipped to in-progress under flock"
else
  fail "behavioural: status flip (got: $(csv_get_status issues 777-retry-test 2>/dev/null))"
fi

# Lock should be releasable — second call must not deadlock.
# (If flock leaks the fd, this would hang; the test runner's own timeout
# is the safety net but a healthy SUT returns instantly.)
if csv_atomic_set_status issues "777-retry-test" "done" "test: archive" \
    >/dev/null 2>&1; then
  pass "behavioural: second atomic call does not deadlock"
else
  fail "behavioural: second atomic call (lock leak?)"
fi

if [[ "$(csv_get_status issues 777-retry-test 2>/dev/null)" == "done" ]]; then
  pass "behavioural: second flip → done"
else
  fail "behavioural: second flip (got: $(csv_get_status issues 777-retry-test 2>/dev/null))"
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo
echo "Results: $passed passed, $failed failed"
if [[ $failed -gt 0 ]]; then
  exit 1
fi
exit 0
