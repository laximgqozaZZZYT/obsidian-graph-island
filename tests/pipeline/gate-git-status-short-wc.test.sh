#!/usr/bin/env bash
# Unit tests for scripts/gate-git-status-short-wc.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/gate-git-status-short-wc.sh"

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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# --- Case 1: readable file with 3 lines → exit 0, line_count=3 ---
f1="$tmpdir/ok.txt"
printf 'a\nb\nc\n' > "$f1"
rc=0
bash "$SUT" "$f1" >"$tmpdir/c1.out" 2>&1 || rc=$?
assert_exit "case1: readable 3-line file → exit 0" 0 "$rc"
assert_stdout_contains "case1: found=1" "^found=1$" "$tmpdir/c1.out"
assert_stdout_contains "case1: wc_exit=0" "^wc_exit=0$" "$tmpdir/c1.out"
assert_stdout_contains "case1: line_count=3" "^line_count=3$" "$tmpdir/c1.out"
assert_stdout_contains "case1: OK summary" "^summary=OK: " "$tmpdir/c1.out"

# --- Case 2: empty file → exit 0, line_count=0 ---
f2="$tmpdir/empty.txt"
: > "$f2"
rc=0
bash "$SUT" "$f2" >"$tmpdir/c2.out" 2>&1 || rc=$?
assert_exit "case2: empty file → exit 0" 0 "$rc"
assert_stdout_contains "case2: line_count=0" "^line_count=0$" "$tmpdir/c2.out"

# --- Case 3: missing file → exit 1, found=0 ---
rc=0
bash "$SUT" "$tmpdir/does-not-exist.txt" >"$tmpdir/c3.out" 2>&1 || rc=$?
assert_exit "case3: missing file → exit 1" 1 "$rc"
assert_stdout_contains "case3: found=0" "^found=0$" "$tmpdir/c3.out"
assert_stdout_contains "case3: FAIL summary" "^summary=FAIL: " "$tmpdir/c3.out"

# --- Case 4: unreadable file (mode 000) → exit 1 ---
f4="$tmpdir/unreadable.txt"
printf 'x\n' > "$f4"
chmod 000 "$f4"
rc=0
bash "$SUT" "$f4" >"$tmpdir/c4.out" 2>&1 || rc=$?
chmod 600 "$f4"
# Root can still read mode-000 files, so this assertion is conditional.
if [[ "$(id -u)" -ne 0 ]]; then
  assert_exit "case4: unreadable file → exit 1" 1 "$rc"
  assert_stdout_contains "case4: found=0" "^found=0$" "$tmpdir/c4.out"
else
  echo "SKIP: case4 (running as root; mode 000 still readable)"
fi

# --- Case 5: env var fallback ---
f5="$tmpdir/env.txt"
printf 'line1\nline2\n' > "$f5"
rc=0
GIT_STATUS_OUTPUT="$f5" bash "$SUT" >"$tmpdir/c5.out" 2>&1 || rc=$?
assert_exit "case5: env GIT_STATUS_OUTPUT → exit 0" 0 "$rc"
assert_stdout_contains "case5: line_count=2" "^line_count=2$" "$tmpdir/c5.out"

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
