#!/usr/bin/env bash
# ============================================================
# operator-tools.test.sh
# ============================================================
# Smoke tests for Round 5-9 operator tools:
#   1. scripts/pipeline/pipeline-status.sh    (R8-B)
#   2. scripts/pipeline/pipeline-debug.sh     (R9-B)
#   3. scripts/pipeline/cron-health.sh        (R9-C)
#   4. scripts/pipeline/pr-drainage.sh        (R9-A)
#
# Strategy: network-independent, deterministic, no side effects.
# We only assert basic existence + executable + bash -n on every tool,
# plus the documented stdout-shape and exit-code contract for each.
#
# We deliberately do NOT pin pipeline-status to a specific OK/WARN/CRITICAL
# verdict — that depends on live state. We only require that the verdict
# prefix is one of the three documented values and that the exit code
# is in the documented set {0,1,2}.
#
# (audit-pr-backlog.sh is covered separately by audit-pr-backlog-args.test.sh.)
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PIPELINE_DIR="$REPO_ROOT/scripts/pipeline"

passed=0
failed=0
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# ---------- assertion helpers ----------

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (missing: $path)"
    ((failed++))
  fi
}

assert_executable() {
  local label="$1" path="$2"
  if [[ -x "$path" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (not executable: $path)"
    ((failed++))
  fi
}

assert_syntax_ok() {
  local label="$1" path="$2"
  if bash -n "$path" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (bash -n failed for: $path)"
    ((failed++))
  fi
}

assert_contains() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (missing pattern: $pattern)"
    ((failed++))
  fi
}

assert_exit_in() {
  # assert_exit_in <label> <actual> <allowed1> [<allowed2> ...]
  local label="$1" actual="$2"
  shift 2
  for a in "$@"; do
    if [[ "$actual" -eq "$a" ]]; then
      echo "PASS: $label (exit=$actual)"
      ((passed++))
      return 0
    fi
  done
  echo "FAIL: $label (exit=$actual, expected one of: $*)"
  ((failed++))
}

# ---------- Cases 1-4: existence + executable + syntax for each tool ----------

TOOLS=(
  "pipeline-status.sh"
  "pipeline-debug.sh"
  "cron-health.sh"
  "pr-drainage.sh"
)

for tool in "${TOOLS[@]}"; do
  path="$PIPELINE_DIR/$tool"
  assert_file_exists "tool exists: $tool"        "$path"
  assert_executable  "tool executable: $tool"    "$path"
  assert_syntax_ok   "tool bash -n OK: $tool"    "$path"
done

# ---------- Case 5: pipeline-status.sh — single-line verdict ----------

rc=0
bash "$PIPELINE_DIR/pipeline-status.sh" > "$tmpdir/status.out" 2>&1 || rc=$?

# Strip trailing blank line so wc -l reflects intent
status_line="$(head -n1 "$tmpdir/status.out")"
status_lines="$(grep -cv '^$' "$tmpdir/status.out" 2>/dev/null || echo 0)"

if [[ "$status_lines" -le 1 ]]; then
  echo "PASS: pipeline-status: single-line output (lines=$status_lines)"
  ((passed++))
else
  echo "FAIL: pipeline-status: expected ≤1 non-blank line, got $status_lines"
  echo "--- output ---"
  cat "$tmpdir/status.out"
  echo "--- end ---"
  ((failed++))
fi

case "$status_line" in
  OK:*|WARN:*|CRITICAL:*)
    echo "PASS: pipeline-status: prefix is OK/WARN/CRITICAL"
    ((passed++))
    ;;
  *)
    echo "FAIL: pipeline-status: unexpected prefix in '$status_line'"
    ((failed++))
    ;;
esac

assert_exit_in "pipeline-status: exit code in {0,1,2}" "$rc" 0 1 2

# ---------- Case 6: pipeline-debug.sh — markdown guide with status echo ----------

rc=0
bash "$PIPELINE_DIR/pipeline-debug.sh" > "$tmpdir/debug.out" 2>&1 || rc=$?

assert_contains "pipeline-debug: markdown header (## )" '^## '   "$tmpdir/debug.out"
assert_contains "pipeline-debug: 'Status:' line"        '^Status:' "$tmpdir/debug.out"
assert_exit_in  "pipeline-debug: exit=0 (guide tool)"   "$rc" 0

# ---------- Case 7: cron-health.sh — markdown table + 7 cron rows + summary ----------

rc=0
bash "$PIPELINE_DIR/cron-health.sh" > "$tmpdir/cron.out" 2>&1 || rc=$?

assert_contains "cron-health: markdown header (## )"  '^## '             "$tmpdir/cron.out"
assert_contains "cron-health: table header row"       '^\| Cron'         "$tmpdir/cron.out"
assert_contains "cron-health: separator row"          '^\|-{2,}'         "$tmpdir/cron.out"

for cron in autonomous-improve e2e-patrol progress-report auto-merge-pr auto-stale-pr-close proposal-scorer feature-proposer; do
  assert_contains "cron-health: lists '$cron'" "$cron" "$tmpdir/cron.out"
done

assert_contains "cron-health: 'Healthy: N/7' summary" 'Healthy:[[:space:]]*[0-9]+/7' "$tmpdir/cron.out"
assert_exit_in  "cron-health: exit code in {0,1}"     "$rc" 0 1

# ---------- Case 8: pr-drainage.sh — output is valid bash, destructive merges commented ----------

rc=0
bash "$PIPELINE_DIR/pr-drainage.sh" > "$tmpdir/drainage.sh" 2>"$tmpdir/drainage.err" || rc=$?

# 8a. Generated script must parse cleanly (catch generation bugs early).
if bash -n "$tmpdir/drainage.sh" 2>"$tmpdir/drainage.parse.err"; then
  echo "PASS: pr-drainage: generated output is valid bash"
  ((passed++))
else
  echo "FAIL: pr-drainage: generated output failed bash -n"
  echo "--- parse error ---"
  cat "$tmpdir/drainage.parse.err"
  echo "--- output (first 40 lines) ---"
  head -40 "$tmpdir/drainage.sh"
  echo "--- end ---"
  ((failed++))
fi

# 8b. Output must contain at least a gh-pr action OR a comment line.
assert_contains "pr-drainage: contains gh pr ... or '# ' line" '(gh pr )|(^# )' "$tmpdir/drainage.sh"

# 8c. Exit code in documented set.
assert_exit_in  "pr-drainage: exit code in {0,1}" "$rc" 0 1

# 8d. CRITICAL safety: 'gh pr merge' must NEVER be emitted uncommented.
# We grep for lines that begin (after optional whitespace) with `gh pr merge`.
if grep -qE '^[[:space:]]*gh pr merge' "$tmpdir/drainage.sh"; then
  echo "FAIL: pr-drainage: DANGEROUS — 'gh pr merge' is uncommented"
  echo "--- offending lines ---"
  grep -nE '^[[:space:]]*gh pr merge' "$tmpdir/drainage.sh"
  echo "--- end ---"
  ((failed++))
else
  echo "PASS: pr-drainage: 'gh pr merge' is properly commented out (or absent)"
  ((passed++))
fi

# ---------- Case 9: integration — every tool produces non-empty output ----------

for tool in "${TOOLS[@]}"; do
  out="$tmpdir/$(basename "$tool" .sh).int.out"
  bash "$PIPELINE_DIR/$tool" > "$out" 2>&1 || true
  if [[ -s "$out" ]]; then
    echo "PASS: $tool produces non-empty output"
    ((passed++))
  else
    echo "FAIL: $tool produced empty output"
    ((failed++))
  fi
done

# ---------- Summary ----------

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
