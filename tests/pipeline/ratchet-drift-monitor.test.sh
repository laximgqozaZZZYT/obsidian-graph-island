#!/usr/bin/env bash
# Smoke tests for scripts/pipeline/ratchet-drift-monitor.sh.
#
# The SUT inspects git history (git log on CLAUDE.md + vitest.config.ts) for
# ratchet RELAXATIONS — i.e. god-object Max Allowed INCREASES or coverage
# threshold DECREASES — within a $WINDOW_HOURS rolling window. It is read-only
# (no .csv writes, no remote calls), so the test stays network-independent and
# deterministic by:
#   1. running with WINDOW_HOURS=1 (small, bounded git log scan), and
#   2. asserting structural invariants of the OUTPUT FORMAT + SOURCE rather
#      than asserting on specific RELAXATION lines (whose presence depends on
#      transient git history within the window).
# CLAUDE.md is treated as read-only reference; the test never modifies it.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/ratchet-drift-monitor.sh"

passed=0
failed=0

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (missing: $path)"; ((failed++))
  fi
}

assert_executable() {
  local label="$1" path="$2"
  if [[ -x "$path" ]]; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (not executable: $path)"; ((failed++))
  fi
}

assert_syntax_ok() {
  local label="$1" path="$2"
  if bash -n "$path" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (bash -n failed for $path)"; ((failed++))
  fi
}

assert_grep_in() {
  local label="$1" pattern="$2" file="$3"
  if grep -Eq "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (pattern not found: $pattern)"; ((failed++))
  fi
}

assert_grep_in_file() {
  local label="$1" pattern="$2" file="$3"
  if grep -Eq "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"; ((passed++))
  else
    echo "FAIL: $label (pattern not found in output: $pattern)"; ((failed++))
  fi
}

# --- Case 1: existence + executable + syntax OK -------------------------------
assert_file_exists "ratchet-drift-monitor.sh exists"     "$SUT"
assert_executable  "ratchet-drift-monitor.sh executable" "$SUT"
assert_syntax_ok   "ratchet-drift-monitor.sh syntax OK"  "$SUT"

# --- Case 2: actual execution with bounded WINDOW_HOURS=1 ---------------------
# A 1h window keeps git log fast and avoids matching most historic commits.
# A 30s hard backstop guards against any unforeseen hang (script has no
# subprocesses that should outlive a few seconds locally).
rc=0
WINDOW_HOURS=1 timeout 30 bash "$SUT" >"$tmpdir/c2.out" 2>"$tmpdir/c2.err" || rc=$?

# The SUT uses `set -uo pipefail` (no -e) and finishes with `echo "Done."`,
# so a healthy run should exit 0. We allow 0/1 to remain robust against
# transient git plumbing exit codes from `git rev-parse "${sha}^"` on shallow
# clones or root commits — but flag anything outside that range.
if [[ "$rc" -le 1 ]]; then
  echo "PASS: case2: exit code in {0,1} (got $rc)"; ((passed++))
else
  echo "FAIL: case2: unexpected exit code $rc"; ((failed++))
  sed 's/^/      /' "$tmpdir/c2.err" | head -20
fi

# Output must be non-empty and emit the section headers regardless of whether
# any relaxations were found within the window.
if [[ -s "$tmpdir/c2.out" ]]; then
  echo "PASS: case2: stdout is non-empty"; ((passed++))
else
  echo "FAIL: case2: stdout was empty"; ((failed++))
fi

assert_grep_in_file "case2: header line printed"             "Ratchet Drift Monitor"               "$tmpdir/c2.out"
assert_grep_in_file "case2: window banner printed"           "Window: last 1 hours"                "$tmpdir/c2.out"
assert_grep_in_file "case2: vitest.config.ts section banner" "vitest.config.ts coverage thresholds" "$tmpdir/c2.out"
assert_grep_in_file "case2: CLAUDE.md section banner"        "CLAUDE.md god-object Max Allowed"    "$tmpdir/c2.out"
assert_grep_in_file "case2: terminal Done. line"             "^Done\.$"                            "$tmpdir/c2.out"

# --- Case 3: source-grep — contract guards -----------------------------------
# These ensure the script keeps watching the correct files and metrics, even
# if Case 2 happens to produce empty section bodies (which is a valid state).
assert_grep_in "case3a: references CLAUDE.md path"           "CLAUDE\.md"             "$SUT"
assert_grep_in "case3b: references vitest.config.ts path"    "vitest\.config\.ts"     "$SUT"
assert_grep_in "case3c: parses GOD OBJECT Policy block"      "GOD OBJECT Policy"      "$SUT"
assert_grep_in "case3d: scans coverage thresholds block"     "thresholds:"            "$SUT"
assert_grep_in "case3e: matches god-object src/.+\\.ts rows" 'src/.+\?\\\.ts'         "$SUT"
assert_grep_in "case3f: enumerates all 4 coverage metrics"   "statements branches functions lines" "$SUT"
assert_grep_in "case3g: emits RELAXATION marker"             "RELAXATION"             "$SUT"
assert_grep_in "case3h: detects increase direction"          "increase"               "$SUT"
assert_grep_in "case3i: detects decrease direction"          "decrease"               "$SUT"
assert_grep_in "case3j: configurable WINDOW_HOURS env"       'WINDOW_HOURS:-24'       "$SUT"
assert_grep_in "case3k: uses git log --since for window"     'git log --since'        "$SUT"
assert_grep_in "case3l: numeric comparison for relaxations"  'n\+0 < p\+0|n > p'      "$SUT"

# --- Summary ------------------------------------------------------------------
echo ""
echo "Results: $passed passed, $failed failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
exit 0
