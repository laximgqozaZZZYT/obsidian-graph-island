#!/usr/bin/env bash
# ============================================================
# acknowledge-alert.test.sh
# ============================================================
# Unit tests for scripts/pipeline/acknowledge-alert.sh argument parsing
# and the --list / --ack / --ack-all dispatch contract.
#
# This complements operator-tools.test.sh (R10-B), which only does a
# 4-tool smoke check. Here we cover the per-flag exit-code contract
# introduced in R10-C (operator-resolved alert ack helper).
#
# Strategy:
#   - Network-independent. No mutation of the real issues.csv.
#   - Case 8 (--ack on a non-existent id) uses a clearly-bogus id;
#     csv_lib.py set_status returns rc=1 with "not found" on stderr,
#     which is the exact branch we want to assert. The atomic commit
#     wrapper short-circuits on the python failure, so no git side
#     effect is produced.
#   - Case 10 (--ack-all empty path) sandboxes a copy of the script
#     with PROJECT_DIR rewritten to point at a tempdir holding an
#     issues.csv that has zero open alerts. This exercises the
#     "No open alerts to acknowledge." branch + exit 0 without
#     touching the real CSV.
#
# Test cases (10):
#   1. file exists + executable
#   2. bash -n syntax OK
#   3. --list (default, no args) → header + exit 0
#   4. --list (explicit) → same shape as default
#   5. -h / --help → Usage shown + exit 0
#   6. --invalid-flag → "Unknown arg" + exit 2
#   7. --ack with no id → Usage + exit 2
#   8. --ack <bogus-id> → ERROR + exit 1
#   9. source-grep: calls csv_atomic_set_status issues
#  10. --ack-all --yes on empty alerts → "No open alerts" + exit 0
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/acknowledge-alert.sh"

passed=0
failed=0

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# ---------- assertion helpers ----------

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (missing: $path)"
    ((failed++))
  fi
}

assert_executable() {
  local label="$1" path="$2"
  if [[ -x "$path" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (not executable: $path)"
    ((failed++))
  fi
}

assert_syntax_ok() {
  local label="$1" path="$2"
  if bash -n "$path" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (bash -n failed for: $path)"
    ((failed++))
  fi
}

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $label (exit=$actual)"
    ((passed++))
  else
    echo "FAIL: $label (expected exit $expected, got $actual)"
    ((failed++))
  fi
}

assert_contains() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (missing pattern: $pattern)"
    echo "--- output ---"
    cat "$file" 2>/dev/null || true
    echo "--- end ---"
    ((failed++))
  fi
}

# Sanity: SUT must exist
if [[ ! -r "$SUT" ]]; then
  echo "FAIL: SUT not found at $SUT"
  exit 1
fi

# ---------- Case 1+2: existence/executable/syntax ----------

assert_file_exists "case1: acknowledge-alert.sh exists"     "$SUT"
assert_executable  "case1: acknowledge-alert.sh executable" "$SUT"
assert_syntax_ok   "case2: bash -n OK"                      "$SUT"

# ---------- Case 3: --list (default, no args) → header + exit 0 ----------
rc=0
bash "$SUT" > "$tmpdir/c3.out" 2>&1 || rc=$?
assert_exit     "case3: default (no args) → exit 0"           0                          "$rc"
assert_contains "case3: '## Open pipeline alerts' header"     '^## Open pipeline alerts' "$tmpdir/c3.out"

# ---------- Case 4: --list explicit → same header + exit 0 ----------
rc=0
bash "$SUT" --list > "$tmpdir/c4.out" 2>&1 || rc=$?
assert_exit     "case4: --list → exit 0"                       0                          "$rc"
assert_contains "case4: '## Open pipeline alerts' header"      '^## Open pipeline alerts' "$tmpdir/c4.out"

# ---------- Case 5: -h / --help → Usage + exit 0 ----------
rc=0
bash "$SUT" -h > "$tmpdir/c5h.out" 2>&1 || rc=$?
assert_exit     "case5: -h → exit 0"                          0          "$rc"
assert_contains "case5: -h prints Usage"                      "[Uu]sage" "$tmpdir/c5h.out"

rc=0
bash "$SUT" --help > "$tmpdir/c5help.out" 2>&1 || rc=$?
assert_exit     "case5: --help → exit 0"                      0          "$rc"
assert_contains "case5: --help prints Usage"                  "[Uu]sage" "$tmpdir/c5help.out"

# ---------- Case 6: invalid arg → exit 2 + "Unknown arg" ----------
rc=0
bash "$SUT" --invalid-flag-xyz > "$tmpdir/c6.out" 2>&1 || rc=$?
assert_exit     "case6: invalid arg → exit 2"                 2             "$rc"
assert_contains "case6: 'Unknown arg' on stderr"              "Unknown arg" "$tmpdir/c6.out"

# ---------- Case 7: --ack with no id → exit 2 + Usage ----------
rc=0
bash "$SUT" --ack > "$tmpdir/c7.out" 2>&1 || rc=$?
assert_exit     "case7: --ack (no id) → exit 2"               2          "$rc"
assert_contains "case7: --ack (no id) shows Usage"            "[Uu]sage" "$tmpdir/c7.out"

# ---------- Case 8: --ack <bogus-id> → ERROR + exit 1 ----------
# Use an obviously-bogus id with timestamp suffix so it cannot collide
# with anything real. csv_lib.py's set_status returns rc=1 with
# "not found" on stderr; the atomic commit wrapper short-circuits on
# the python failure (no git mutation).
BOGUS_ID="bogus-test-id-doesnotexist-$(date +%s)-$$"
rc=0
bash "$SUT" --ack "$BOGUS_ID" > "$tmpdir/c8.out" 2>&1 || rc=$?
assert_exit     "case8: --ack <bogus-id> → exit 1"            1                              "$rc"
assert_contains "case8: ERROR message contains 'failed to ack'" "(ERROR.*failed to ack|not found)" "$tmpdir/c8.out"

# ---------- Case 9: source-grep — uses csv_atomic_set_status issues ----------
if grep -qE 'csv_atomic_set_status[[:space:]]+issues' "$SUT"; then
  echo "PASS: case9: SUT calls csv_atomic_set_status issues"
  ((passed++))
else
  echo "FAIL: case9: SUT does NOT call csv_atomic_set_status issues"
  ((failed++))
fi

# ---------- Case 10: --ack-all argparse + empty-alerts contract ----------
# Goal: lock in the **contract** for --ack-all on an empty alert list.
#
# 2026-05-09 R11-D upgrade: the previous source-grep-only approach masked
# a real bug — `count=$(echo "$open_ids" | grep -c . || echo 0)` produced
# "0\n0" when open_ids was empty (echo "" prints a single empty line; grep
# -c . returns 0 with rc=1; `|| echo 0` then appended a second "0"). That
# broke the `[[ "$count" -eq 0 ]]` integer comparison.
#
# Case 10d/10e now exercise the empty-list path end-to-end against a
# sandbox issues.csv that has zero open alerts, asserting:
#   - exit 0
#   - stdout contains "No open alerts to acknowledge."
#   - no "syntax error" / "integer expression expected" leakage from the
#     buggy compound `count` value
#
# Sandboxing strategy:
#   The SUT hardcodes PROJECT_DIR/ISSUES_CSV at the top. We rewrite both
#   in a temp copy of the script via sed, and point csv-helpers.sh at the
#   real one (it has no PROJECT_DIR coupling that matters for this path —
#   the empty-list branch exits before any csv_atomic_set_status call).

# 10a. --ack-all --yes is recognized as a valid mode (not Unknown arg, not Usage).
if grep -qE '^[[:space:]]*--ack-all\)' "$SUT"; then
  echo "PASS: case10a: SUT has --ack-all case branch"
  ((passed++))
else
  echo "FAIL: case10a: SUT missing --ack-all case branch"
  ((failed++))
fi

# 10b. --yes flag is honored (SKIP_CONFIRM=1).
if grep -qE 'SKIP_CONFIRM=1' "$SUT"; then
  echo "PASS: case10b: SUT honors --yes (sets SKIP_CONFIRM=1)"
  ((passed++))
else
  echo "FAIL: case10b: SUT missing SKIP_CONFIRM=1 assignment"
  ((failed++))
fi

# 10c. Empty-list message contract.
if grep -qE 'No open alerts to acknowledge' "$SUT"; then
  echo "PASS: case10c: SUT prints 'No open alerts to acknowledge.' on empty list"
  ((passed++))
else
  echo "FAIL: case10c: SUT missing 'No open alerts to acknowledge' message"
  ((failed++))
fi

# 10d. behavioural: --ack-all --yes against an empty alert CSV → exit 0
# Build a sandbox: copy SUT, rewrite PROJECT_DIR + ISSUES_CSV to point at
# a tempdir holding an issues.csv with zero open alerts (or none matching
# the alert/critical filter).
sandbox="$tmpdir/sandbox"
mkdir -p "$sandbox/scripts/pipeline"
# Minimal issues.csv: a header + one closed/done row that does NOT match
# the open-alerts predicate (status not in pending/in-progress + no
# source=alert / priority=critical). This guarantees an empty result set.
cat > "$sandbox/scripts/pipeline/issues.csv" <<'CSV'
id,summary,status,priority,source,reported
done-noise-1,closed unrelated row,done,low,kaizen,2026-05-09T00:00:00+00:00
CSV

# Copy + rewrite SUT so PROJECT_DIR / ISSUES_CSV / csv-helpers source
# all resolve inside the sandbox-or-real-repo. We only need PROJECT_DIR
# and ISSUES_CSV pointing at the sandbox; csv-helpers.sh can stay sourced
# from the real repo because the empty-list branch never invokes any of
# its functions.
sandbox_sut="$sandbox/scripts/pipeline/acknowledge-alert.sh"
cp "$SUT" "$sandbox_sut"
# shellcheck disable=SC2016
sed -i "s|^PROJECT_DIR=.*|PROJECT_DIR=\"$sandbox\"|" "$sandbox_sut"
sed -i "s|^ISSUES_CSV=.*|ISSUES_CSV=\"$sandbox/scripts/pipeline/issues.csv\"|" "$sandbox_sut"
# Re-point the csv-helpers source to the real repo so `set -uo pipefail`
# doesn't fail on a missing helper file.
sed -i "s|\. \"\$PROJECT_DIR/scripts/pipeline/csv-helpers.sh\"|. \"$REPO_ROOT/scripts/pipeline/csv-helpers.sh\"|" "$sandbox_sut"
chmod +x "$sandbox_sut"

rc=0
bash "$sandbox_sut" --ack-all --yes > "$tmpdir/c10d.out" 2>&1 || rc=$?
assert_exit     "case10d: --ack-all --yes (empty alerts) → exit 0"        0                                "$rc"
assert_contains "case10d: stdout contains 'No open alerts to acknowledge'" "No open alerts to acknowledge"  "$tmpdir/c10d.out"

# 10e. The buggy compound `count` value would surface as a bash "[[: ... :
# syntax error in expression" / "integer expression expected" line on
# stderr. Assert that no such leakage occurred — this is the regression
# guard for the R11-D fix.
if grep -qE '(syntax error in expression|integer expression expected|式に構文エラー)' "$tmpdir/c10d.out"; then
  echo "FAIL: case10e: --ack-all empty-list path leaks integer-compare error"
  echo "--- output ---"
  cat "$tmpdir/c10d.out"
  echo "--- end ---"
  ((failed++))
else
  echo "PASS: case10e: no integer-compare error from compound count value"
  ((passed++))
fi

# ---------- Summary ----------

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
