#!/usr/bin/env bash
# enforce-gates.sh — Mechanical quality gate enforcement
# Usage: bash scripts/pipeline/enforce-gates.sh [--json]
# All gates run unconditionally. E2E requires CDP (auto-detected).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
  esac
done

declare -A RESULTS
OVERALL_EXIT=0

run_gate() {
  local name="$1"; shift
  local exit_code=0
  "$@" >/dev/null 2>&1 || exit_code=$?
  RESULTS["$name"]="$exit_code"
  if [[ $exit_code -ne 0 ]]; then
    OVERALL_EXIT=1
    [[ "$JSON_OUTPUT" == false ]] && echo "FAIL [$name]"
  else
    [[ "$JSON_OUTPUT" == false ]] && echo "PASS [$name]"
  fi
}

# ── All gates run unconditionally ──
run_gate "typecheck" npx tsc --noEmit
run_gate "lint" npx eslint src/ --quiet --max-warnings 999
run_gate "test" npx vitest run
run_gate "build" node esbuild.config.mjs production
run_gate "bundle" bash scripts/bundle-size-check.sh
run_gate "godobj" bash scripts/pipeline/god-object-audit.sh

# ── Coverage threshold check ──
if [[ -f vitest.config.ts ]]; then
  COV_OUT=$(npx vitest run --coverage 2>&1 || true)
  if echo "$COV_OUT" | grep -q "does not meet global threshold"; then
    RESULTS["coverage"]="1"
    OVERALL_EXIT=1
    [[ "$JSON_OUTPUT" == false ]] && echo "FAIL [coverage]"
  else
    RESULTS["coverage"]="0"
    [[ "$JSON_OUTPUT" == false ]] && echo "PASS [coverage]"
  fi
else
  RESULTS["coverage"]="skip"
fi

# ── Coverage ratchet guard: thresholds must never decrease ──
if [[ -f vitest.config.ts ]]; then
  _extract_thresh() {
    local m="$1"
    awk '/thresholds:/,/\}/' vitest.config.ts | grep "$m:" | grep -oP '[0-9]+\.[0-9]+'
  }
  PREV_THRESH=$(git show HEAD:vitest.config.ts 2>/dev/null || true)
  if [[ -n "$PREV_THRESH" ]]; then
    for metric in statements branches functions lines; do
      cur=$(_extract_thresh "$metric")
      prev=$(echo "$PREV_THRESH" | awk '/thresholds:/,/\}/' | grep "$metric:" | grep -oP '[0-9]+\.[0-9]+')
      if [[ -n "$cur" && -n "$prev" ]]; then
        decreased=$(awk -v c="$cur" -v p="$prev" 'BEGIN{print (c < p) ? 1 : 0}')
        if [[ "$decreased" -eq 1 ]]; then
          OVERALL_EXIT=1
          [[ "$JSON_OUTPUT" == false ]] && echo "FAIL [ratchet] $metric decreased: $prev → $cur"
        fi
      fi
    done
  fi
fi

# ── E2E: handled by e2e-patrol.sh (separate cron, no timeout, background) ──

# ── JSON output ──
if [[ "$JSON_OUTPUT" == true ]]; then
  echo "{"
  echo "  \"passed\": $(( OVERALL_EXIT == 0 ? 1 : 0 )),"
  echo -n "  \"gates\": {"
  first=true
  for gate in typecheck lint test build bundle godobj coverage; do
    val="${RESULTS[$gate]:-skip}"
    [[ "$first" == true ]] && first=false || echo -n ","
    if [[ "$val" == "skip" ]]; then printf "\"%s\":\"skip\"" "$gate"
    elif [[ "$val" == "0" ]]; then printf "\"%s\":\"pass\"" "$gate"
    else printf "\"%s\":\"fail\"" "$gate"; fi
  done
  echo "}}"
fi

[[ "$JSON_OUTPUT" == false ]] && { [[ $OVERALL_EXIT -eq 0 ]] && echo "ALL GATES PASSED" || echo "GATE FAILURES DETECTED"; }
exit $OVERALL_EXIT
