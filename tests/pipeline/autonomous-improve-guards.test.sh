#!/usr/bin/env bash
# Unit tests for scripts/pipeline/autonomous-improve.sh early guards.
#
# Validates three independent fail-fast guard layers added during recent
# kaizen cycles. Each is its own bug-class — losing any one would re-open
# a known incident — so each gets its own assertion(s):
#
#   1. Kill-switch (R2 NEW-A, 2026-05-08, autonomous-improve.sh:13-22)
#      Operator escape hatch: touch $PIPELINE_DISABLE_FILE → exit 0.
#      Behavioural test (Case 1/2) plus source-grep (Case 5) so the
#      test stays green even if the early-exit logic moves location.
#
#   2. Pre-flight self-test (R5-B, 2026-05-09, autonomous-improve.sh:88-117)
#      Refuses to enter the autonomous loop when
#      `tests/pipeline/run-all.sh -q` is broken — past incident 5924e352
#      let a critical csv_lib bug ride for cycles because tests had
#      "rotted" silently. Source-grep only (Case 3): a behavioural test
#      would either need to break the test suite (poisons sibling tests)
#      or a heavy fixture-vendoring shim (out of scope for one suite).
#
#   3. Bifurcation auto-recovery (R1 P1-B, 2026-05-08, autonomous-improve.sh:472-492)
#      When local main lags origin/main by ≥ BIFURCATION_THRESHOLD commits
#      and the working tree is clean, attempt `git pull --ff-only` before
#      aborting — root cause of the 2026-05-06 false-done cascade. Source
#      grep only (Case 4): exercising the path requires a mocked remote
#      and is covered by the integration runs.
#
# Behavioural cases use `timeout` as a hard backstop so a regressed early
# guard cannot hang this suite indefinitely.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/autonomous-improve.sh"

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

assert_contains() {
  local label="$1" pattern="$2" file="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (file missing pattern: $pattern)"; ((failed++))
  fi
}

assert_lacks() {
  local label="$1" pattern="$2" file="$3"
  if ! grep -q "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (file unexpectedly contains pattern: $pattern)"; ((failed++))
  fi
}

assert_grep_in() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (pattern not found: $pattern)"; ((failed++))
  fi
}

# Sanity: SUT must exist (otherwise every assertion below would obscure-fail).
if [[ ! -f "$SUT" ]]; then
  echo "FAIL: precondition: SUT not found at $SUT"
  exit 1
fi

cd "$REPO_ROOT" || exit 1

# --- Case 1: kill-switch ON → exit 0 + PIPELINE-DISABLED stderr -----------
# We use PIPELINE_DISABLE_FILE override to point at a tempfile so we never
# touch the real .pipeline-disabled in the repo (which would silently
# disable the production cron pipeline if the test crashed mid-run).
test_disable="$tmpdir/.test-pipeline-disabled"
: > "$test_disable"
rc=0
PIPELINE_DISABLE_FILE="$test_disable" timeout 10 bash "$SUT" \
  > "$tmpdir/c1.out" 2> "$tmpdir/c1.err" || rc=$?
rm -f "$test_disable"
assert_exit "case1: kill-switch ON yields exit 0" 0 "$rc"
assert_contains "case1: PIPELINE-DISABLED marker on stderr" "PIPELINE-DISABLED" "$tmpdir/c1.err"

# --- Case 2: kill-switch OFF (file absent) → no PIPELINE-DISABLED message -
# We don't assert the exit code here: with the flag absent the script
# proceeds into the real cycle and may legitimately exit 0 (dirty-skip,
# rate-limit, no pending tasks) or 1 (pre-flight fail, decompose ABORT).
# All we care about for this case is that the kill-switch branch did NOT
# fire — i.e. PIPELINE-DISABLED is not in stderr.
rc=0
PIPELINE_DISABLE_FILE="/tmp/never-exists-${RANDOM}-${RANDOM}-${RANDOM}" \
  timeout 30 bash "$SUT" > "$tmpdir/c2.out" 2> "$tmpdir/c2.err" || rc=$?
assert_lacks "case2: PIPELINE-DISABLED absent when flag file missing" "PIPELINE-DISABLED" "$tmpdir/c2.err"

# --- Case 3: pre-flight self-test logic exists in source ------------------
# Behavioural test would require deliberately breaking run-all.sh which
# would also break the parent suite that just ran us. Source-grep is the
# pragmatic compromise: it locks in the contract that THESE three strings
# stay co-located in the SUT (label + invocation + alert slug).
assert_grep_in "case3a: PRE-FLIGHT FAILED log label present"        "PRE-FLIGHT FAILED" "$SUT"
assert_grep_in "case3b: invokes tests/pipeline/run-all.sh"          "tests/pipeline/run-all\\.sh" "$SUT"
assert_grep_in "case3c: alert slug pipeline-tests-broken filed"     "pipeline-tests-broken" "$SUT"

# --- Case 4: bifurcation auto-recovery (R1 P1-B) source markers -----------
# Three load-bearing strings: the log marker, the FF-only pull command, and
# the threshold constant. Any of them disappearing means we silently lost
# the 2026-05-06 incident fix.
assert_grep_in "case4a: AUTO-RECOVERY log marker"                    "AUTO-RECOVERY:" "$SUT"
assert_grep_in "case4b: ff-only pull command wired"                  "git pull --ff-only origin main" "$SUT"
assert_grep_in "case4c: BIFURCATION_THRESHOLD constant defined"      "BIFURCATION_THRESHOLD" "$SUT"

# --- Case 5: kill-switch block source markers (R2 NEW-A) ------------------
# Defence-in-depth for Case 1: even if the early-exit branch drifts in
# location or stderr message, these source strings prove the operator
# escape hatch is still wired.
assert_grep_in "case5a: PIPELINE_DISABLE_FILE env var honoured"      "PIPELINE_DISABLE_FILE" "$SUT"
assert_grep_in "case5b: 'Kill-switch (2026-05-08 kaizen)' comment"   "Kill-switch \\(2026-05-08 kaizen\\)" "$SUT"

# --- Summary ---
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
exit 0
