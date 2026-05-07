#!/usr/bin/env bash
# run-pipeline-tests.sh — Run scripts/pipeline/ unit tests under tests/pipeline/.
#
# Usage:
#   bash scripts/run-pipeline-tests.sh           # smoke (currently-green tests only)
#   bash scripts/run-pipeline-tests.sh --full    # all tests, including known-rotten
#
# Why two modes: pipeline tests existed for months but were never wired into
# `pnpm test`. By the time the kaizen audit found them (2026-05-07), three
# test files had silently rotted as their SUTs evolved. Smoke mode lets us
# wire the green tests into CI immediately without breaking gates; --full
# mode surfaces the rot for incremental repair.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$REPO_ROOT/tests/pipeline"

# Tests known to pass against current SUTs (kaizen 2026-05-07 baseline).
# When repairing a rotten test, move its filename here.
SMOKE_TESTS=(
  gate-git-status-short-wc.test.sh
  handoff-git-status-short.test.sh
  verify-body-match.test.sh
  verify-issue-done.test.sh
  csv-helpers.test.sh
)

# Tests retained as SKIP stubs documenting dead SUTs (deleted in commit
# 5c94aaed, 2026-04-25 md→CSV migration). They exit 0 trivially. Kept in
# this list as informational markers — promotion to SMOKE_TESTS would mean
# regressing the SUT, which is not what we want.
KNOWN_ROTTEN=(
  classify-git-status.test.sh
  find-status-modified-target.test.sh
)

mode="smoke"
if [[ "${1:-}" == "--full" ]]; then
  mode="full"
fi

cd "$REPO_ROOT"

run_one() {
  local t="$1"
  local label="$2"
  if bash "$TESTS_DIR/$t" >/tmp/pipeline-test-out 2>&1; then
    echo "[$label PASS] $t"
    return 0
  else
    echo "[$label FAIL] $t"
    tail -5 /tmp/pipeline-test-out | sed 's/^/    /'
    return 1
  fi
}

green=0
red=0
echo "── Pipeline tests (mode: $mode) ──"
for t in "${SMOKE_TESTS[@]}"; do
  if run_one "$t" "smoke"; then ((green++)); else ((red++)); fi
done

if [[ "$mode" == "full" ]]; then
  echo "── Known-rotten (informational, not gating) ──"
  for t in "${KNOWN_ROTTEN[@]}"; do
    if run_one "$t" "rot  "; then ((green++)); else ((red++)); fi
  done
fi

echo
echo "── Summary: $green PASS, $red FAIL (mode: $mode) ──"

# Smoke mode is gating — any smoke FAIL fails the whole run.
# Full mode also gates on smoke failures only; rot failures are informational.
if [[ "$mode" == "smoke" ]]; then
  exit "$red"
else
  smoke_red=0
  for t in "${SMOKE_TESTS[@]}"; do
    bash "$TESTS_DIR/$t" >/dev/null 2>&1 || smoke_red=$((smoke_red+1))
  done
  exit "$smoke_red"
fi
