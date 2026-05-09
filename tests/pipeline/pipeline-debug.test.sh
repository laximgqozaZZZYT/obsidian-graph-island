#!/usr/bin/env bash
# ============================================================
# pipeline-debug.test.sh
# ============================================================
# Unit tests for scripts/pipeline/pipeline-debug.sh — the operator
# guidance helper that turns a one-line pipeline-status verdict into
# a markdown recovery guide.
#
# This complements operator-tools.test.sh (R10-B), which only smoke-
# tests pipeline-debug for "markdown header + 'Status:' line + exit=0".
# Here we lock in the **per-status guide branch**: each verdict pattern
# (kill-switch, autonomous stalled, tests broken, throttle, local main,
# PR backlog, OK, unknown) must route to its own guide block.
#
# Strategy:
#   - Real-state path: run pipeline-debug.sh as-is and assert the
#     three universal contracts (Status: line, ## header, exit 0).
#   - Kill-switch override: PIPELINE_DISABLE_FILE env var is honored
#     by pipeline-status.sh — use a tempfile to deterministically
#     trigger the "CRITICAL: kill-switch active" branch.
#   - Per-pattern coverage: source-grep each documented case label so
#     the test fails loudly if a pattern goes missing during refactor.
#   - Unknown-status fallback: source-grep the *) catch-all label.
#
# Test cases (12):
#   1. file exists + executable
#   2. bash -n syntax OK
#   3. exit code is always 0 (guide tool)
#   4. emits 'Status:' line
#   5. emits a '## ' markdown header
#   6. kill-switch override → "Pipeline manually disabled" guide
#   7. kill-switch override → exit 0 (still a guide)
#   8. source-grep: 'CRITICAL: kill-switch active'   case
#   9. source-grep: 'CRITICAL: autonomous-improve stalled' case
#  10. source-grep: 'OK:' case label
#  11. source-grep: 'WARN:' case label(s)
#  12. source-grep: '*)' unknown-status fallback emits "Unknown status"
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/pipeline-debug.sh"

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

assert_source_contains() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" "$SUT"; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (SUT missing pattern: $pattern)"
    ((failed++))
  fi
}

# Sanity: SUT must exist
if [[ ! -r "$SUT" ]]; then
  echo "FAIL: SUT not found at $SUT"
  exit 1
fi

# ---------- Case 1+2: existence/executable/syntax ----------

assert_file_exists "case1: pipeline-debug.sh exists"     "$SUT"
assert_executable  "case1: pipeline-debug.sh executable" "$SUT"
assert_syntax_ok   "case2: bash -n OK"                   "$SUT"

# ---------- Case 3+4+5: real-state run — exit 0, Status: line, ## header ----------

rc=0
bash "$SUT" > "$tmpdir/run.out" 2>&1 || rc=$?
assert_exit     "case3: real-state run → exit 0"            0           "$rc"
assert_contains "case4: emits 'Status:' line"               '^Status:'  "$tmpdir/run.out"
assert_contains "case5: emits '## ' markdown header"        '^## '      "$tmpdir/run.out"

# ---------- Case 6+7: kill-switch override → guide + exit 0 ----------
# pipeline-status.sh respects PIPELINE_DISABLE_FILE; pointing it at an
# existing tempfile deterministically triggers the kill-switch branch
# without touching the real .pipeline-disabled marker.
KILL_FILE="$tmpdir/fake-kill-switch"
touch "$KILL_FILE"
rc=0
PIPELINE_DISABLE_FILE="$KILL_FILE" bash "$SUT" > "$tmpdir/kill.out" 2>&1 || rc=$?
assert_contains "case6: kill-switch → 'Pipeline manually disabled' guide" \
                "Pipeline manually disabled" "$tmpdir/kill.out"
assert_contains "case6: kill-switch → echoes the CRITICAL line"          \
                "CRITICAL: kill-switch active" "$tmpdir/kill.out"
assert_exit     "case7: kill-switch override → exit 0"                   0 "$rc"

# ---------- Cases 8-12: source-grep per-status case labels ----------
# These guarantee the case-match block keeps a branch for each
# documented pipeline-status verdict shape. If pipeline-status.sh
# changes its prefix, refactoring removing one of these here without
# updating both files will trip this test.

assert_source_contains "case8:  has 'CRITICAL: kill-switch active' case" \
                       'CRITICAL: kill-switch active'
assert_source_contains "case9:  has 'CRITICAL: autonomous-improve stalled' case" \
                       'CRITICAL: autonomous-improve stalled'
assert_source_contains "case10: has 'OK:' case label" \
                       '"OK:"\*\)'
assert_source_contains "case11: has at least one 'WARN:' case label" \
                       '"WARN: '
assert_source_contains "case12: '*)' fallback emits 'Unknown status'" \
                       'Unknown status'

# ---------- Summary ----------

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
