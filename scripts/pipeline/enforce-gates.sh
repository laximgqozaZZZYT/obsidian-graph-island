#!/usr/bin/env bash
# enforce-gates.sh — Mechanical quality gate enforcement
# Usage: bash scripts/pipeline/enforce-gates.sh [--skip-e2e] [--json]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

SKIP_E2E=false
JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --skip-e2e) SKIP_E2E=true ;;
    --json)     JSON_OUTPUT=true ;;
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

run_gate "typecheck" npx tsc --noEmit
run_gate "lint" npx eslint src/ --quiet --max-warnings 999
run_gate "test" npx vitest run
run_gate "build" node esbuild.config.mjs production
run_gate "bundle" bash scripts/bundle-size-check.sh
run_gate "godobj" bash scripts/pipeline/god-object-audit.sh

if [[ "$SKIP_E2E" == false ]]; then
  CDP_CHECK=$(curl -sf "http://localhost:9222/json/version" 2>/dev/null || true)
  if [[ -n "$CDP_CHECK" ]]; then
    run_gate "e2e" npx playwright test --config e2e/cdp-smoke.config.ts --reporter=line
  else
    RESULTS["e2e"]="skip"
    [[ "$JSON_OUTPUT" == false ]] && echo "SKIP [e2e]"
  fi
else
  RESULTS["e2e"]="skip"
  [[ "$JSON_OUTPUT" == false ]] && echo "SKIP [e2e]"
fi

if [[ "$JSON_OUTPUT" == true ]]; then
  echo "{"
  echo "  \"passed\": $(( OVERALL_EXIT == 0 ? 1 : 0 )),"
  echo -n "  \"gates\": {"
  first=true
  for gate in typecheck lint test build bundle godobj e2e; do
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
