#!/usr/bin/env bash
# read-verify-report.sh — Aggregate subtask-2 verify report into a 1-line gate
# summary that downstream pipeline tasks can consume without re-parsing.
#
# Pipeline role (issue 684-639 → 708-684):
#   subtask-2 of 607-597 produces reports/verify-582-report.md. This script
#   reads that report, judges PASS/FAIL from test-suite counts, prints a
#   key=value summary on stdout, and — on PASS only — persists a single-line
#   summary to /tmp/607-597-subtask-2-result.txt for the next subtask gate.
#
# Separation of concerns (per parent insight):
#   1. Discovery  — does the report file exist?            → missing=1 path
#   2. Judgment   — are fail counts zero and verdict PASS? → fail_count gate
# Discovery and judgment log separately so the pipeline can distinguish
# "report missing" from "tests failed".
#
# Usage:
#   bash scripts/pipeline/read-verify-report.sh [<report-path>]
#     default <report-path>: reports/verify-582-report.md
#
# stdout (key=value, stable contract for downstream gates):
#   report=<path>
#   found=<0|1>
#   verdict=<PASS|FAIL|UNKNOWN>
#   fail_count=<N>
#   pass_count=<N>
#   generated=<ISO-8601 or unknown>
#   summary=<single-line summary string>
#
# exit codes:
#   0 = found AND verdict=PASS AND fail_count=0 (gate OPEN)
#   1 = verdict=FAIL or fail_count>0 (gate CLOSED, SKIP next subtask)
#   2 = report not found (discovery failure)
set -uo pipefail

REPORT="${1:-reports/verify-582-report.md}"
OUT_FILE="/tmp/607-597-subtask-2-result.txt"

# Work from repo root so relative paths resolve consistently.
cd "$(git rev-parse --show-toplevel)"

# --- Discovery ---------------------------------------------------------------
if [[ ! -f "$REPORT" ]]; then
  echo "report=$REPORT"
  echo "found=0"
  echo "verdict=UNKNOWN"
  echo "fail_count=0"
  echo "pass_count=0"
  echo "generated=unknown"
  echo "summary=SKIP: verify report not found ($REPORT)"
  exit 2
fi

# --- Parse -------------------------------------------------------------------
# Tests line: "- Tests: 6201 total / 6201 passed / 0 failed / 0 skipped"
tests_line="$(grep -E '^\s*-\s*Tests:' "$REPORT" | head -1 || true)"
pass_count="$(echo "$tests_line" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || true)"
fail_count="$(echo "$tests_line" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || true)"
pass_count="${pass_count:-0}"
fail_count="${fail_count:-0}"

# Generated-at line: "- Generated at: 2026-04-18T15:29:31+09:00"
generated="$(grep -E '^\s*-\s*Generated at:' "$REPORT" | head -1 \
  | sed -E 's/^\s*-\s*Generated at:\s*//' || true)"
generated="${generated:-unknown}"

# Verdict line: "- All tests pass: PASS" or "- Overall: PARTIAL PASS ..."
verdict="UNKNOWN"
if grep -qE 'All tests pass:\s*PASS' "$REPORT"; then
  verdict="PASS"
elif grep -qE 'All tests pass:\s*FAIL' "$REPORT"; then
  verdict="FAIL"
fi

# --- Judgment ----------------------------------------------------------------
# FAIL gate: any failed test OR verdict=FAIL closes the gate.
if [[ "$fail_count" -gt 0 || "$verdict" == "FAIL" ]]; then
  summary="SKIP: subtask-3 は実行しない (FAIL=$fail_count verdict=$verdict)"
  echo "report=$REPORT"
  echo "found=1"
  echo "verdict=$verdict"
  echo "fail_count=$fail_count"
  echo "pass_count=$pass_count"
  echo "generated=$generated"
  echo "summary=$summary"
  exit 1
fi

# PASS: persist single-line summary so the next subtask can consume it.
date_only="$(echo "$generated" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)"
date_only="${date_only:-unknown}"
summary="verify PASS $pass_count/$pass_count ($date_only)"
printf '%s\n' "$summary" > "$OUT_FILE"

echo "report=$REPORT"
echo "found=1"
echo "verdict=$verdict"
echo "fail_count=$fail_count"
echo "pass_count=$pass_count"
echo "generated=$generated"
echo "summary=$summary"
exit 0
