#!/usr/bin/env bash
# Unit tests for scripts/pipeline/decompose-issue.sh queue-depth throttle.
#
# Validates the P1-A kaizen (2026-05-08) which added DECOMPOSE_THROTTLE_CAP
# gating at line 30-52 of decompose-issue.sh. The throttle prevents the
# auto-discover→decompose pipeline from out-running the implementer
# (~6.3× faster) and stabilises queue depth around the configured cap.
#
# Throttle contract (must remain stable):
#   * Env var DECOMPOSE_THROTTLE_CAP (default 200) is the gate.
#   * pending_depth = count of tasks.csv rows whose status ∈
#     {pending, decomposed, in_progress, in-progress}.
#   * If pending_depth >= cap → emit "THROTTLE: …" to stderr, exit 0.
#   * Otherwise → emit "QUEUE-DEPTH: …" to stderr, continue normally.
#
# These tests use bogus issue ids (dummy-test-*) so the throttle path is
# exercised without any real decomposition side-effects. When the throttle
# clears (case 2) the script may still fail downstream — that is fine,
# we only assert on the throttle markers.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/decompose-issue.sh"

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

assert_stderr_lacks() {
  local label="$1" pattern="$2" stderr_file="$3"
  if grep -q "$pattern" "$stderr_file" 2>/dev/null; then
    echo "FAIL: $label (stderr unexpectedly contains: $pattern)"; ((failed++))
  else
    echo "PASS: $label"; ((passed++))
  fi
}

# Compute current depth once for boundary + default-cap reasoning. The SUT
# inlines the same query in Python, so this stays in sync without needing
# a fixture (read-only access to tasks.csv).
depth=$(python3 -c "
import csv
with open('$REPO_ROOT/scripts/pipeline/tasks.csv') as f:
    r = csv.DictReader(f)
    print(sum(1 for row in r if row.get('status', '') in ('pending', 'decomposed', 'in_progress', 'in-progress')))
" 2>/dev/null || echo 999999)

# --- Case 1: cap=1 → throttle MUST fire (depth ≥ 1 always true here) ---
rc=0; DECOMPOSE_THROTTLE_CAP=1 bash "$SUT" dummy-test-throttle-1 2>"$tmpdir/c1.err" || rc=$?
assert_exit "case1: cap=1 throttle ACTIVE → exit 0" 0 "$rc"
assert_stderr_contains "case1: THROTTLE marker present" "THROTTLE:" "$tmpdir/c1.err"
assert_stderr_contains "case1: cap 1 mentioned" "cap 1" "$tmpdir/c1.err"

# --- Case 2: cap=999999 → throttle CLEAR (depth far below cap) ---
# Exit code is intentionally not asserted: the SUT will fail downstream
# trying to decompose a nonexistent issue, but the throttle ran first.
rc=0; DECOMPOSE_THROTTLE_CAP=999999 bash "$SUT" nonexistent-issue-id 2>"$tmpdir/c2.err" || rc=$?
assert_stderr_contains "case2: QUEUE-DEPTH marker present" "QUEUE-DEPTH:" "$tmpdir/c2.err"
assert_stderr_lacks "case2: NO THROTTLE marker emitted" "THROTTLE:" "$tmpdir/c2.err"

# --- Case 3: cap = current depth (boundary, >= comparator must trigger) ---
if [[ "$depth" -gt 0 ]]; then
  rc=0; DECOMPOSE_THROTTLE_CAP="$depth" bash "$SUT" dummy-test-throttle-3 2>"$tmpdir/c3.err" || rc=$?
  assert_exit "case3: cap == depth → throttle (>= comparator)" 0 "$rc"
  assert_stderr_contains "case3: THROTTLE present at boundary" "THROTTLE:" "$tmpdir/c3.err"
  assert_stderr_contains "case3: cap $depth mentioned at boundary" "cap $depth" "$tmpdir/c3.err"
else
  echo "SKIP: case3 (depth=0, boundary not exercisable without fixture)"
fi

# --- Case 4: default cap=200 (no env var set) ---
# Reflects real backlog state. If depth drops below 200 in the future this
# branch will skip rather than mis-assert, keeping the test forward-stable.
rc=0; bash "$SUT" dummy-test-throttle-4 2>"$tmpdir/c4.err" || rc=$?
if [[ "$depth" -ge 200 ]]; then
  assert_exit "case4: default cap throttle → exit 0" 0 "$rc"
  assert_stderr_contains "case4: THROTTLE marker (default cap 200)" "THROTTLE:" "$tmpdir/c4.err"
  assert_stderr_contains "case4: cap 200 in default mode" "cap 200" "$tmpdir/c4.err"
else
  # Below default cap — should emit QUEUE-DEPTH instead.
  assert_stderr_contains "case4: QUEUE-DEPTH marker (depth<200)" "QUEUE-DEPTH:" "$tmpdir/c4.err"
  assert_stderr_lacks "case4: no THROTTLE when below default cap" "THROTTLE:" "$tmpdir/c4.err"
fi

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
