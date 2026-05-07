#!/usr/bin/env bash
# Unit tests for scripts/pipeline/verify-issue-done.sh
#
# The SUT now reads from $REPO_ROOT/scripts/pipeline/descriptions/<id>.md
# (id passed as $1, basenamed). To exercise it from tests we stage each
# fixture into descriptions/ under a uniquely-prefixed test ID and clean
# up on EXIT. This rot was introduced when verify-issue-done.sh was
# moved from "path arg" to "id arg" without test co-evolution (2026-05-07
# kaizen: detected via /kaizen pipeline-self-test gap audit).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/verify-issue-done.sh"
FIXTURES="$SCRIPT_DIR/fixtures/issues"
DESC_DIR="$REPO_ROOT/scripts/pipeline/descriptions"
TEST_PREFIX="vid-test-$$"  # unique per pid, for cleanup

passed=0
failed=0

# Stage fixtures with unique names so they don't collide with real issues.
declare -A staged_files
stage_fixture() {
  local case_name="$1" fixture="$2"
  local id="${TEST_PREFIX}-${case_name}"
  cp "$fixture" "$DESC_DIR/${id}.md"
  staged_files["$id"]="$DESC_DIR/${id}.md"
  echo "$id"
}
cleanup_fixtures() {
  for f in "${staged_files[@]}"; do rm -f "$f"; done
}
trap cleanup_fixtures EXIT

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (expected exit $expected, got $actual)"; ((failed++))
  fi
}

assert_stderr_contains() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q "$pattern" "$stderr_file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (stderr missing pattern: $pattern)"; ((failed++))
  fi
}

assert_stderr_empty_of() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q "$pattern" "$stderr_file" 2>/dev/null; then
    echo "FAIL: $label (stderr unexpectedly contains: $pattern)"; ((failed++))
  else
    echo "PASS: $label"; ((passed++))
  fi
}

tmpdir="$(mktemp -d)"
trap 'cleanup_fixtures; rm -rf "$tmpdir"' EXIT

# --- Case 1: All paths exist in git index → exit 0 ---
id1=$(stage_fixture "case1" "$FIXTURES/case1-all-exist.md")
rc=0; bash "$SUT" "$id1" 2>"$tmpdir/case1.err" || rc=$?
assert_exit "case1: all paths exist → exit 0" 0 "$rc"
assert_stderr_empty_of "case1: no MISSING in stderr" "MISSING" "$tmpdir/case1.err"

# --- Case 2: Contains a missing path → exit 1 + MISSING log ---
id2=$(stage_fixture "case2" "$FIXTURES/case2-missing-path.md")
rc=0; bash "$SUT" "$id2" 2>"$tmpdir/case2.err" || rc=$?
assert_exit "case2: missing path → exit 1" 1 "$rc"
assert_stderr_contains "case2: MISSING logged" "MISSING:.*src/nonexistent-file-that-does-not-exist.ts" "$tmpdir/case2.err"

# --- Case 3: No file paths in AC → exit 0 (skip) + WARN ---
id3=$(stage_fixture "case3" "$FIXTURES/case3-no-paths.md")
rc=0; bash "$SUT" "$id3" 2>"$tmpdir/case3.err" || rc=$?
assert_exit "case3: no paths mentioned → exit 0" 0 "$rc"
assert_stderr_empty_of "case3: no MISSING in stderr" "MISSING" "$tmpdir/case3.err"
assert_stderr_contains "case3: WARN logged for path-less criteria" "WARN.*no recognized path tokens" "$tmpdir/case3.err"

# --- Case 4: Bare paths (no backticks) → not detected (false positive avoidance) + WARN ---
id4=$(stage_fixture "case4" "$FIXTURES/case4-bare-paths.md")
rc=0; bash "$SUT" "$id4" 2>"$tmpdir/case4.err" || rc=$?
assert_exit "case4: bare paths ignored → exit 0" 0 "$rc"
assert_stderr_empty_of "case4: no MISSING in stderr" "MISSING" "$tmpdir/case4.err"
assert_stderr_contains "case4: WARN logged (no backtick paths)" "WARN.*no recognized path tokens" "$tmpdir/case4.err"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
