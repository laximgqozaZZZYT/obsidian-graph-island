#!/usr/bin/env bash
# Unit tests for scripts/pipeline/verify-issue-done.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/verify-issue-done.sh"
FIXTURES="$SCRIPT_DIR/fixtures/issues"

passed=0
failed=0

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (expected exit $expected, got $actual)"
    ((failed++))
  fi
}

assert_stderr_contains() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q "$pattern" "$stderr_file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (stderr missing pattern: $pattern)"
    ((failed++))
  fi
}

assert_stderr_empty_of() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q "$pattern" "$stderr_file" 2>/dev/null; then
    echo "FAIL: $label (stderr unexpectedly contains: $pattern)"
    ((failed++))
  else
    echo "PASS: $label"
    ((passed++))
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- Case 1: All paths exist in git index → exit 0 ---
rc=0
bash "$SUT" "$FIXTURES/case1-all-exist.md" 2>"$tmpdir/case1.err" || rc=$?
assert_exit "case1: all paths exist → exit 0" 0 "$rc"
assert_stderr_empty_of "case1: no MISSING in stderr" "MISSING" "$tmpdir/case1.err"

# --- Case 2: Contains a missing path → exit 1 + MISSING log ---
rc=0
bash "$SUT" "$FIXTURES/case2-missing-path.md" 2>"$tmpdir/case2.err" || rc=$?
assert_exit "case2: missing path → exit 1" 1 "$rc"
assert_stderr_contains "case2: MISSING logged" "MISSING:.*src/nonexistent-file-that-does-not-exist.ts" "$tmpdir/case2.err"

# --- Case 3: No file paths in AC → exit 0 (skip) ---
rc=0
bash "$SUT" "$FIXTURES/case3-no-paths.md" 2>"$tmpdir/case3.err" || rc=$?
assert_exit "case3: no paths mentioned → exit 0" 0 "$rc"
assert_stderr_empty_of "case3: no MISSING in stderr" "MISSING" "$tmpdir/case3.err"

# --- Case 4: Bare paths (no backticks) → not detected (false positive avoidance) ---
rc=0
bash "$SUT" "$FIXTURES/case4-bare-paths.md" 2>"$tmpdir/case4.err" || rc=$?
assert_exit "case4: bare paths ignored → exit 0" 0 "$rc"
assert_stderr_empty_of "case4: no MISSING in stderr" "MISSING" "$tmpdir/case4.err"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
