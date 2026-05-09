#!/usr/bin/env bash
# run-all.sh — Run every tests/pipeline/*.test.sh suite and report aggregate results.
#
# Usage:
#   bash tests/pipeline/run-all.sh             # default: print last 10 lines of each test + summary
#   bash tests/pipeline/run-all.sh -v          # verbose: print full stdout/stderr of each test
#   bash tests/pipeline/run-all.sh --verbose
#   bash tests/pipeline/run-all.sh -q          # quiet: only PASS/FAIL line per test + summary
#   bash tests/pipeline/run-all.sh --quiet
#
# Env:
#   PIPELINE_TEST_FILTER=<regex>   Filter test basenames by extended regex (default: ".")
#                                  Example: PIPELINE_TEST_FILTER='^verify' bash run-all.sh
#
# Exit:
#   0 if all (matched) tests pass; 1 if any fail; 2 on argument error.
#
# Notes:
#   Tests are discovered via glob (alphabetical). Each test runs in its own subshell
#   so that `set -e` / `set -u` inside one test cannot leak into the runner state.
#   This is a developer-facing aggregator. The CI gate lives in
#   scripts/run-pipeline-tests.sh and uses an explicit smoke/rotten allowlist —
#   this script is its complement (one-shot regression check after kaizen edits).

set -uo pipefail

VERBOSE=0
QUIET=0
case "${1:-}" in
  -v|--verbose) VERBOSE=1 ;;
  -q|--quiet)   QUIET=1   ;;
  -h|--help)
    sed -n '2,20p' "$0"
    exit 0
    ;;
  "") ;;
  *)
    echo "Usage: $0 [-v|--verbose] [-q|--quiet]" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FILTER="${PIPELINE_TEST_FILTER:-.}"

shopt -s nullglob
TEST_FILES=("$SCRIPT_DIR"/*.test.sh)
shopt -u nullglob

if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
  echo "run-all.sh: no *.test.sh files found in $SCRIPT_DIR" >&2
  exit 1
fi

# Sort alphabetically (glob is already sorted on most shells, but be explicit).
IFS=$'\n' read -r -d '' -a TEST_FILES < <(printf '%s\n' "${TEST_FILES[@]}" | sort && printf '\0') || true

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
FAILED_NAMES=()
START=$(date +%s)

echo "=== pipeline tests ($(date -Iseconds)) ==="
echo "    dir:    $SCRIPT_DIR"
echo "    filter: $FILTER"
echo

for test_file in "${TEST_FILES[@]}"; do
  name=$(basename "$test_file")
  if ! [[ "$name" =~ $FILTER ]]; then
    continue
  fi
  TOTAL=$((TOTAL + 1))

  t_start=$(date +%s)
  # Run in independent subshell so set -e/-u inside the test does not poison us.
  output=$( bash "$test_file" 2>&1 )
  rc=$?
  t_end=$(date +%s)
  dur=$((t_end - t_start))

  # Parse "Results: N passed, M failed" if present, else count PASS:/FAIL: lines
  # (allowing leading whitespace — some suites indent assertion markers).
  results_line=$(echo "$output" | grep -E '^Results: [0-9]+ passed, [0-9]+ failed' | tail -1 || true)
  if [[ -n "$results_line" ]]; then
    asserted_failed=$(echo "$results_line" | sed -E 's/^Results: [0-9]+ passed, ([0-9]+) failed.*/\1/')
    asserted_passed=$(echo "$results_line" | sed -E 's/^Results: ([0-9]+) passed,.*/\1/')
  else
    asserted_failed=$(echo "$output" | grep -cE '^[[:space:]]*FAIL:' || true)
    asserted_passed=$(echo "$output" | grep -cE '^[[:space:]]*PASS:' || true)
  fi

  fail_marker="$(echo "$output" | grep -m1 -E '^[[:space:]]*FAIL:' || true)"
  is_skip_only=0
  if [[ "$asserted_passed" == "0" && "$asserted_failed" == "0" && -z "$fail_marker" ]]; then
    is_skip_only=1
  fi

  if [[ $rc -eq 0 && -z "$fail_marker" && "$asserted_failed" == "0" ]]; then
    PASSED=$((PASSED + 1))
    [[ $is_skip_only -eq 1 ]] && SKIPPED=$((SKIPPED + 1))
    if [[ $QUIET -eq 1 ]]; then
      echo "PASS  $name"
    else
      tag="PASS"
      [[ $is_skip_only -eq 1 ]] && tag="SKIP"
      printf '  %s [%2ds] %-42s  asserts: %s passed, %s failed\n' \
        "$tag" "$dur" "$name" "$asserted_passed" "$asserted_failed"
      if [[ $VERBOSE -eq 1 ]]; then
        echo "$output" | sed 's/^/      /'
      fi
    fi
  else
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("$name")
    if [[ $QUIET -eq 1 ]]; then
      echo "FAIL  $name"
    else
      printf '  FAIL [%2ds] %-42s  asserts: %s passed, %s failed  (rc=%d)\n' \
        "$dur" "$name" "$asserted_passed" "$asserted_failed" "$rc"
      if [[ $VERBOSE -eq 1 ]]; then
        echo "$output" | sed 's/^/      /'
      else
        echo "$output" | tail -10 | sed 's/^/      /'
      fi
    fi
  fi
done

END=$(date +%s)
DURATION=$((END - START))

echo
echo "=== Summary ==="
echo "Total:    $TOTAL"
echo "Passed:   $PASSED  (skip-only: $SKIPPED)"
echo "Failed:   $FAILED"
echo "Duration: ${DURATION}s"

if [[ $TOTAL -eq 0 ]]; then
  echo "run-all.sh: no tests matched filter '$FILTER'" >&2
  exit 1
fi

if [[ $FAILED -gt 0 ]]; then
  echo "Failed tests:"
  for n in "${FAILED_NAMES[@]}"; do
    echo "  - $n"
  done
  exit 1
fi
exit 0
