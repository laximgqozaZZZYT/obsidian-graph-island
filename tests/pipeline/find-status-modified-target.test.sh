#!/usr/bin/env bash
# Unit tests for scripts/pipeline/find-status-modified-target.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/find-status-modified-target.sh"
FIXTURES="$SCRIPT_DIR/fixtures/git-status"

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

assert_stdout_eq() {
  local label="$1" expected="$2" stdout_file="$3"
  local actual
  actual="$(cat "$stdout_file")"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label"
    echo "  expected: $(printf '%q' "$expected")"
    echo "  actual:   $(printf '%q' "$actual")"
    ((failed++))
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- Case 1: Single worktree-modified target → emit its path, exit 0 ---
rc=0
bash "$SUT" "$FIXTURES/case1-target-worktree-modified.txt" \
  >"$tmpdir/c1.out" 2>"$tmpdir/c1.err" || rc=$?
assert_exit "case1: ' M target' → exit 0" 0 "$rc"
assert_stdout_eq "case1: stdout = target path" \
  "docs/issues/target.md" "$tmpdir/c1.out"

# --- Case 2: Target is index-modified ("M "), not worktree ("  M") ---
# Script must ignore — only " M " counts as a status-line-edit candidate.
rc=0
bash "$SUT" "$FIXTURES/case2-target-index-modified.txt" \
  >"$tmpdir/c2.out" 2>"$tmpdir/c2.err" || rc=$?
assert_exit "case2: 'M  target' → exit 0 (skip)" 0 "$rc"
assert_stdout_eq "case2: index-only modification yields empty stdout" \
  "" "$tmpdir/c2.out"

# --- Case 3: Empty porcelain output → skip, exit 0, empty stdout ---
rc=0
bash "$SUT" "$FIXTURES/case3-target-missing.txt" \
  >"$tmpdir/c3.out" 2>"$tmpdir/c3.err" || rc=$?
assert_exit "case3: empty input → exit 0" 0 "$rc"
assert_stdout_eq "case3: empty stdout" "" "$tmpdir/c3.out"

# --- Case 4: Target + untracked file → emit target, ignore "??" leak ---
rc=0
bash "$SUT" "$FIXTURES/case4-target-plus-untracked.txt" \
  >"$tmpdir/c4.out" 2>"$tmpdir/c4.err" || rc=$?
assert_exit "case4: target + untracked → exit 0" 0 "$rc"
assert_stdout_eq "case4: emits only the ' M' target, not the '??' file" \
  "docs/issues/target.md" "$tmpdir/c4.out"

# --- Case 5: Target with MM ("both index and worktree") → not a clean
# status-line-edit candidate; script filters only on leading " M ". ---
rc=0
bash "$SUT" "$FIXTURES/case5-target-mm-suspicious.txt" \
  >"$tmpdir/c5.out" 2>"$tmpdir/c5.err" || rc=$?
assert_exit "case5: 'MM target' → exit 0" 0 "$rc"
assert_stdout_eq "case5: MM is not ' M' — empty stdout" "" "$tmpdir/c5.out"

# --- Case 6: No ' M' lines at all (only untracked/staged/deleted) → skip.
# Note: docs/issues/ filtering happens at the `git status --porcelain` layer
# when the script is called with no args; when given a fixture, the caller
# owns pre-filtering. This case verifies the " M " matcher, not scoping. ---
no_m_fixture="$tmpdir/no-m.txt"
cat >"$no_m_fixture" <<'EOF'
?? docs/issues/new.md
A  docs/issues/staged.md
 D docs/issues/deleted.md
EOF
rc=0
bash "$SUT" "$no_m_fixture" >"$tmpdir/c6.out" 2>"$tmpdir/c6.err" || rc=$?
assert_exit "case6: no ' M' lines → exit 0 (skip)" 0 "$rc"
assert_stdout_eq "case6: empty stdout when no ' M' candidate exists" \
  "" "$tmpdir/c6.out"

# --- Case 7: Multiple ' M' candidates → emit the first one only ---
multi_fixture="$tmpdir/multi.txt"
cat >"$multi_fixture" <<'EOF'
 M docs/issues/first.md
 M docs/issues/second.md
 M docs/issues/third.md
EOF
rc=0
bash "$SUT" "$multi_fixture" >"$tmpdir/c7.out" 2>"$tmpdir/c7.err" || rc=$?
assert_exit "case7: multiple candidates → exit 0" 0 "$rc"
assert_stdout_eq "case7: emits first candidate only" \
  "docs/issues/first.md" "$tmpdir/c7.out"

# --- Case 8: Stdin input ("-") ---
rc=0
printf ' M docs/issues/target.md\n' \
  | bash "$SUT" - >"$tmpdir/c8.out" 2>"$tmpdir/c8.err" || rc=$?
assert_exit "case8: stdin → exit 0" 0 "$rc"
assert_stdout_eq "case8: stdin path emitted" \
  "docs/issues/target.md" "$tmpdir/c8.out"

# --- Case 9: Non-existent file → usage error, exit 2 ---
rc=0
bash "$SUT" "$tmpdir/does-not-exist.txt" \
  >"$tmpdir/c9.out" 2>"$tmpdir/c9.err" || rc=$?
assert_exit "case9: bad path → exit 2" 2 "$rc"

# --- Case 10: Subpath with spaces in neighbor lines don't confuse awk ---
# Guards against regex false-positives like "MM" or "DM" getting matched.
edge_fixture="$tmpdir/edge.txt"
cat >"$edge_fixture" <<'EOF'
MM docs/issues/not-this.md
 D docs/issues/deleted.md
?? docs/issues/new.md
 M docs/issues/real-target.md
AM docs/issues/added-then-modified.md
EOF
rc=0
bash "$SUT" "$edge_fixture" >"$tmpdir/c10.out" 2>"$tmpdir/c10.err" || rc=$?
assert_exit "case10: mixed statuses → exit 0" 0 "$rc"
assert_stdout_eq "case10: picks only the ' M' line" \
  "docs/issues/real-target.md" "$tmpdir/c10.out"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
