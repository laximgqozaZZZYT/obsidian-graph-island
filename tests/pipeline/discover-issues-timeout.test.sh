#!/usr/bin/env bash
# Unit tests for scripts/pipeline/discover-issues.sh graceful timeout.
#
# Validates the NEW-B kaizen (2026-05-08) which added a SIGTERM trap +
# .tmp residue cleanup + exit 124 to discover-issues.sh (lines 16-44).
# Without the trap, a hard timeout would die mid-csv_atomic_* call,
# leaving stale scripts/pipeline/.{tasks,issues,attempts}.csv.<rand>.tmp
# orphans (csv_lib.py atomic-rename pattern). The trap gives in-flight
# writers up to 3s to land their os.replace(), sweeps any orphans, then
# exits with the GNU-timeout-conventional 124 (NOT 143 which is the
# bash-default 128+SIGTERM). This suite exercises the short-timeout path
# (DISCOVER_TIMEOUT=2) end-to-end and grep-asserts the trap source so
# regressions in either layer surface immediately.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/discover-issues.sh"

passed=0
failed=0

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

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

assert_grep() {
  local label="$1" pattern="$2" file="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (pattern not found: $pattern)"; ((failed++))
  fi
}

# discover-issues.sh uses bare relative paths (e.g. scripts/pipeline/.tasks.csv.*.tmp)
# inside on_timeout(), so cwd must be the repo root for the cleanup glob to match.
cd "$REPO_ROOT" || exit 1

# --- Case 1: short DISCOVER_TIMEOUT triggers SIGTERM trap → graceful exit 124 ---
# `timeout 10` is a hard backstop in case the trap fails to fire and the script
# would otherwise hang on a Claude API call. The 2s DISCOVER_TIMEOUT plus the
# 3s tmp-wait plus exec overhead means the trap path completes in ~5-6s, well
# inside the 10s hard cap. If we ever hit 10s, the trap regressed.
rc=0
DISCOVER_TIMEOUT=2 timeout 10 bash "$SUT" 2>"$tmpdir/c1.err" 1>/dev/null || rc=$?
assert_exit "case1: graceful timeout exit 124 (not 143)" 124 "$rc"
assert_stderr_contains "case1: TIMEOUT marker carries 2s value" "TIMEOUT: discover-issues exceeded 2s" "$tmpdir/c1.err"
assert_stderr_contains "case1: 'graceful shutdown' phrase present" "graceful shutdown" "$tmpdir/c1.err"

# --- Case 2: no .tmp residue after graceful exit ---
# The whole point of the trap: csv_lib.py atomic writes leave .tmp files between
# the open() and os.replace() — if SIGTERM kills the python process between
# those two calls, the .tmp orphans accumulate. on_timeout() sweeps them.
ls scripts/pipeline/.tasks.csv.*.tmp \
   scripts/pipeline/.issues.csv.*.tmp \
   scripts/pipeline/.attempts.csv.*.tmp 2>/dev/null > "$tmpdir/c2.out" || true
if [[ ! -s "$tmpdir/c2.out" ]]; then
  echo "PASS: case2: no orphan .tmp files after graceful exit"; ((passed++))
else
  echo "FAIL: case2: orphan .tmp files exist after graceful exit"; ((failed++))
  sed 's/^/      /' "$tmpdir/c2.out"
fi

# --- Case 3: SIGTERM trap + watchdog kill -TERM are wired in source ---
# Source-grep guards the contract even if Case 1 happens to pass for the
# wrong reason (e.g. timeout(1) returning 124 itself rather than the trap).
assert_grep "case3a: 'trap on_timeout TERM' installed" "trap on_timeout TERM" "$SUT"
assert_grep "case3b: watchdog uses 'kill -TERM \$\$'" 'kill -TERM \$\$' "$SUT"
assert_grep "case3c: on_timeout exits with 124" "exit 124" "$SUT"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
exit 0
