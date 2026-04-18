#!/usr/bin/env bash
# Unit tests for scripts/handoff-git-status-short.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/handoff-git-status-short.sh"

passed=0
failed=0

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $label"
    ((++passed))
  else
    echo "FAIL: $label (expected exit $expected, got $actual)"
    ((++failed))
  fi
}

assert_stderr_contains() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q -E "$pattern" "$stderr_file" 2>/dev/null; then
    echo "PASS: $label"
    ((++passed))
  else
    echo "FAIL: $label (stderr missing pattern: $pattern)"
    echo "--- stderr ---"; cat "$stderr_file"; echo "--- end ---"
    ((++failed))
  fi
}

assert_bytes_equal() {
  local label="$1" expected="$2" actual="$3"
  if cmp -s -- "$expected" "$actual"; then
    echo "PASS: $label"
    ((++passed))
  else
    echo "FAIL: $label (stdout bytes differ from input)"
    echo "--- expected ($(wc -c <"$expected") bytes) ---"; od -c -- "$expected" | head -5
    echo "--- actual ($(wc -c <"$actual") bytes) ---"; od -c -- "$actual" | head -5
    ((++failed))
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- Case 1: 3-line file → lines=3, byte-exact passthrough ---
f1="$tmpdir/case1.in"
printf ' M foo.md\n M bar.md\n?? baz.md\n' >"$f1"
rc=0
bash "$SUT" "$f1" >"$tmpdir/c1.out" 2>"$tmpdir/c1.err" || rc=$?
assert_exit "case1: 3-line file → exit 0" 0 "$rc"
assert_stderr_contains "case1: lines=3" "^lines=3$" "$tmpdir/c1.err"
assert_stderr_contains "case1: head_3 marker" "^head_3:$" "$tmpdir/c1.err"
# Three leading spaces: 2 from sed indent + 1 from the XY column in " M foo.md".
assert_stderr_contains "case1: head_3 includes first line" "^   M foo\.md$" "$tmpdir/c1.err"
assert_bytes_equal "case1: stdout byte-exact" "$f1" "$tmpdir/c1.out"

# --- Case 2: empty file → lines=0, empty passthrough ---
f2="$tmpdir/case2.in"
: >"$f2"
rc=0
bash "$SUT" "$f2" >"$tmpdir/c2.out" 2>"$tmpdir/c2.err" || rc=$?
assert_exit "case2: empty file → exit 0" 0 "$rc"
assert_stderr_contains "case2: lines=0" "^lines=0$" "$tmpdir/c2.err"
assert_bytes_equal "case2: empty stdout" "$f2" "$tmpdir/c2.out"

# --- Case 3: stdin input with blank lines preserved ---
# The column-space and blank line are exactly what git status --short can emit;
# losing either would corrupt downstream XY parsing.
printf ' M foo.md\n\n M bar.md\n' >"$tmpdir/c3.in"
rc=0
bash "$SUT" <"$tmpdir/c3.in" >"$tmpdir/c3.out" 2>"$tmpdir/c3.err" || rc=$?
assert_exit "case3: stdin → exit 0" 0 "$rc"
assert_stderr_contains "case3: lines=3 (blank line counted)" "^lines=3$" "$tmpdir/c3.err"
assert_bytes_equal "case3: stdin passthrough byte-exact" "$tmpdir/c3.in" "$tmpdir/c3.out"

# --- Case 4: missing file → exit 1 ---
rc=0
bash "$SUT" "$tmpdir/does-not-exist.txt" >"$tmpdir/c4.out" 2>"$tmpdir/c4.err" || rc=$?
assert_exit "case4: missing file → exit 1" 1 "$rc"
assert_stderr_contains "case4: FAIL stderr" "^FAIL: input not readable" "$tmpdir/c4.err"

# --- Case 5: file without trailing newline → last line counted (awk NR) ---
f5="$tmpdir/case5.in"
printf ' M foo.md\n M bar.md' >"$f5"  # no trailing \n
rc=0
bash "$SUT" "$f5" >"$tmpdir/c5.out" 2>"$tmpdir/c5.err" || rc=$?
assert_exit "case5: no-trailing-nl → exit 0" 0 "$rc"
assert_stderr_contains "case5: lines=2 (awk counts last record)" "^lines=2$" "$tmpdir/c5.err"
assert_bytes_equal "case5: no-trailing-nl passthrough" "$f5" "$tmpdir/c5.out"

# --- Case 6: explicit "-" reads from stdin ---
printf 'xx\n' >"$tmpdir/c6.in"
rc=0
bash "$SUT" - <"$tmpdir/c6.in" >"$tmpdir/c6.out" 2>"$tmpdir/c6.err" || rc=$?
assert_exit "case6: explicit '-' → exit 0" 0 "$rc"
assert_bytes_equal "case6: dash stdin passthrough" "$tmpdir/c6.in" "$tmpdir/c6.out"

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
