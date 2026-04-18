#!/usr/bin/env bash
# Unit tests for scripts/pipeline/classify-git-status.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/classify-git-status.sh"
FIXTURES="$SCRIPT_DIR/fixtures/git-status"
TARGET="docs/issues/target.md"

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

assert_stdout_contains() {
  local label="$1" pattern="$2" stdout_file="$3"
  if grep -q -E "$pattern" "$stdout_file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (stdout missing pattern: $pattern)"
    echo "--- stdout ---"; cat "$stdout_file"; echo "--- end ---"
    ((failed++))
  fi
}

assert_stdout_absent() {
  local label="$1" pattern="$2" stdout_file="$3"
  if grep -q -E "$pattern" "$stdout_file" 2>/dev/null; then
    echo "FAIL: $label (stdout unexpectedly contains: $pattern)"
    echo "--- stdout ---"; cat "$stdout_file"; echo "--- end ---"
    ((failed++))
  else
    echo "PASS: $label"
    ((passed++))
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- Case 1: Target modified on worktree only → expected, exit 0 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case1-target-worktree-modified.txt" \
  >"$tmpdir/c1.out" 2>&1 || rc=$?
assert_exit "case1: ' M target' → exit 0" 0 "$rc"
assert_stdout_contains "case1: expected_found=1" "^expected_found=1$" "$tmpdir/c1.out"
assert_stdout_contains "case1: unexpected_count=0" "^unexpected_count=0$" "$tmpdir/c1.out"
assert_stdout_absent  "case1: no warning" "^warning=" "$tmpdir/c1.out"

# --- Case 2: Target modified on index only → expected, exit 0 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case2-target-index-modified.txt" \
  >"$tmpdir/c2.out" 2>&1 || rc=$?
assert_exit "case2: 'M  target' → exit 0" 0 "$rc"
assert_stdout_contains "case2: expected_found=1" "^expected_found=1$" "$tmpdir/c2.out"
assert_stdout_absent  "case2: no warning" "^warning=" "$tmpdir/c2.out"

# --- Case 3: Target missing → warn, exit 1 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case3-target-missing.txt" \
  >"$tmpdir/c3.out" 2>&1 || rc=$?
assert_exit "case3: empty status → exit 1" 1 "$rc"
assert_stdout_contains "case3: expected_found=0" "^expected_found=0$" "$tmpdir/c3.out"
assert_stdout_contains "case3: warning about missing target" \
  "^warning=Edit が反映されていない可能性" "$tmpdir/c3.out"

# --- Case 4: Target plus unrelated untracked → warn, exit 1 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case4-target-plus-untracked.txt" \
  >"$tmpdir/c4.out" 2>&1 || rc=$?
assert_exit "case4: target + untracked → exit 1" 1 "$rc"
assert_stdout_contains "case4: expected_found=1" "^expected_found=1$" "$tmpdir/c4.out"
assert_stdout_contains "case4: unexpected lists leaked.md" \
  "^unexpected_files=.*leaked.md" "$tmpdir/c4.out"
assert_stdout_contains "case4: warning about scope leak" \
  "^warning=Edit が意図しないファイルに波及した可能性" "$tmpdir/c4.out"

# --- Case 5: Target has MM (both index and worktree) → suspicious, exit 1 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case5-target-mm-suspicious.txt" \
  >"$tmpdir/c5.out" 2>&1 || rc=$?
assert_exit "case5: 'MM target' → exit 1" 1 "$rc"
assert_stdout_contains "case5: expected_found=0 (MM not accepted)" \
  "^expected_found=0$" "$tmpdir/c5.out"
assert_stdout_contains "case5: target listed in unexpected" \
  "^unexpected_files=docs/issues/target.md$" "$tmpdir/c5.out"

# --- Case 6: Only unrelated file modified → warn twice, exit 1 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case6-unrelated-modified.txt" \
  >"$tmpdir/c6.out" 2>&1 || rc=$?
assert_exit "case6: unrelated modified → exit 1" 1 "$rc"
assert_stdout_contains "case6: expected_found=0" "^expected_found=0$" "$tmpdir/c6.out"
assert_stdout_contains "case6: unexpected lists unrelated.ts" \
  "^unexpected_files=src/unrelated.ts$" "$tmpdir/c6.out"
# Two warnings: missing target + scope leak
warning_count=$(grep -c "^warning=" "$tmpdir/c6.out" || true)
if [[ "$warning_count" -eq 2 ]]; then
  echo "PASS: case6: two warnings emitted"
  ((passed++))
else
  echo "FAIL: case6: expected 2 warnings, got $warning_count"
  ((failed++))
fi

# --- Case 7: Target plus unrelated deleted → warn about scope, exit 1 ---
rc=0
bash "$SUT" "$TARGET" "$FIXTURES/case7-target-plus-deleted.txt" \
  >"$tmpdir/c7.out" 2>&1 || rc=$?
assert_exit "case7: target + deleted → exit 1" 1 "$rc"
assert_stdout_contains "case7: expected_found=1" "^expected_found=1$" "$tmpdir/c7.out"
assert_stdout_contains "case7: unexpected lists removed.md" \
  "^unexpected_files=docs/issues/removed.md$" "$tmpdir/c7.out"

# --- Case 8: Stdin input ---
rc=0
printf ' M %s\n' "$TARGET" | bash "$SUT" "$TARGET" - >"$tmpdir/c8.out" 2>&1 || rc=$?
assert_exit "case8: stdin ' M target' → exit 0" 0 "$rc"
assert_stdout_contains "case8: expected_found=1 via stdin" \
  "^expected_found=1$" "$tmpdir/c8.out"

# --- Case 9: Missing argument → exit 2 (usage error) ---
rc=0
bash "$SUT" >"$tmpdir/c9.out" 2>&1 || rc=$?
assert_exit "case9: no args → exit 2" 2 "$rc"

# --- Case 10: target= line always present ---
assert_stdout_contains "case10: target key emitted" \
  "^target=docs/issues/target.md$" "$tmpdir/c1.out"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
