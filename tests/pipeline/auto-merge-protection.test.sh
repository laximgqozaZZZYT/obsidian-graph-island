#!/usr/bin/env bash
# ============================================================
# auto-merge-protection.test.sh
# ============================================================
# Unit tests for scripts/pipeline/auto-merge-pr.sh PROTECTED_PATHS,
# PROTECTED_GLOBS, ALLOWED_PREFIXES, and ALLOWED_PATHS allow/deny lists.
#
# Network-independent: validates ONLY that the allow/deny constants exist
# in the source and contain the load-bearing entries. Execution-mode
# tests (gh + git mocks driving the candidate loop end-to-end) are
# deferred to a future iteration — auto-merge-pr.sh combines `gh pr list`,
# `gh pr diff`, `gh pr view`, embedded python3, and `gh pr merge --admin`,
# which makes a faithful shim non-trivial. Source-grep is a stable,
# zero-flake first guard against silent regressions of the policy.
#
# Why this matters:
#   2026-05-07 audit found 12 PRs stuck "rejected-protected" for 25h+
#   because the catch-all prefix `scripts/pipeline/` was blocking any PR
#   that touched issues.csv or descriptions/ as a side-effect. Today's
#   policy splits PROTECTED_GLOBS (code only: *.sh / *.py / *.ts / *.mjs
#   under scripts/pipeline) from ALLOWED_PREFIXES (state files: tasks/,
#   attempts/, descriptions/, reports/) so the autonomous loop's own
#   side-effect writes don't get auto-merge-blocked. If anyone widens the
#   protected globs back to a catch-all, these tests fail.
#
# Test buckets:
#   - PROTECTED_PATHS: CLAUDE.md, vitest.config.ts, package.json,
#     pnpm-lock.yaml, scripts/pipeline/csv-schema.md
#   - PROTECTED_GLOBS: scripts/pipeline/{*.sh,*.py,*.ts,*.mjs},
#     .github/workflows/*
#   - ALLOWED_PREFIXES: src/, tests/, scripts/pipeline/{descriptions,
#     attempts, reports, tasks}/
#   - ALLOWED_PATHS: scripts/pipeline/{issues,tasks,attempts}.csv,
#     visual-report.json
#   - Branch gate: auto-improve-* prefix
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/auto-merge-pr.sh"

passed=0
failed=0

if [[ ! -f "$SUT" ]]; then
  echo "FAIL: SUT not found: $SUT"
  echo ""
  echo "Results: 0 passed, 1 failed"
  exit 1
fi

assert_grep() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" "$SUT" 2>/dev/null; then
    echo "PASS: $label"
    passed=$((passed + 1))
  else
    echo "FAIL: $label (pattern not found: $pattern)"
    failed=$((failed + 1))
  fi
}

# Negative assertion — pattern must NOT appear. Used to lock in the
# 2026-05-07 fix that removed the catch-all `scripts/pipeline/` prefix
# from PROTECTED_PATHS / PROTECTED_GLOBS.
assert_no_grep() {
  local label="$1" pattern="$2"
  if grep -qE "$pattern" "$SUT" 2>/dev/null; then
    echo "FAIL: $label (forbidden pattern present: $pattern)"
    failed=$((failed + 1))
  else
    echo "PASS: $label"
    passed=$((passed + 1))
  fi
}

# ── PROTECTED_PATHS array ──
# Exact paths that must never be auto-merged. The five entries are the
# governance / dependency / pipeline-doc files that need human review.
assert_grep "PROTECTED_PATHS array exists"               'PROTECTED_PATHS=\('
assert_grep "PROTECTED_PATHS includes CLAUDE.md"         '"CLAUDE\.md"'
assert_grep "PROTECTED_PATHS includes vitest.config.ts"  '"vitest\.config\.ts"'
assert_grep "PROTECTED_PATHS includes package.json"      '"package\.json"'
assert_grep "PROTECTED_PATHS includes pnpm-lock.yaml"    '"pnpm-lock\.yaml"'
assert_grep "PROTECTED_PATHS includes csv-schema.md"     '"scripts/pipeline/csv-schema\.md"'

# ── PROTECTED_GLOBS array ──
# Glob patterns matching protected pipeline CODE files only (bash glob
# `*` does NOT cross `/`, so e.g. `scripts/pipeline/*.sh` is correctly
# scoped to immediate children, leaving descriptions/, attempts/ etc.
# free for autonomous PRs to modify).
assert_grep "PROTECTED_GLOBS array exists"               'PROTECTED_GLOBS=\('
assert_grep "PROTECTED_GLOBS includes pipeline/*.sh"     '"scripts/pipeline/\*\.sh"'
assert_grep "PROTECTED_GLOBS includes pipeline/*.py"     '"scripts/pipeline/\*\.py"'
assert_grep "PROTECTED_GLOBS includes pipeline/*.ts"     '"scripts/pipeline/\*\.ts"'
assert_grep "PROTECTED_GLOBS includes pipeline/*.mjs"    '"scripts/pipeline/\*\.mjs"'
assert_grep "PROTECTED_GLOBS includes workflows/*"       '"\.github/workflows/\*"'

# Regression guard — the catch-all prefix `scripts/pipeline/` (a bare
# string with no `*.ext` qualifier) must NOT be in PROTECTED_PATHS
# nor PROTECTED_GLOBS. The 2026-05-07 audit traced the 12-PR backlog
# to that exact pattern; reintroducing it would re-break auto-merge
# for every autonomous PR that touches issues.csv / descriptions/ as
# a side effect.
assert_no_grep "no catch-all 'scripts/pipeline/' protected path" \
  '"scripts/pipeline/"[[:space:]]*$'

# ── ALLOWED_PREFIXES array ──
# A changed file passes if it's under one of these prefixes.
assert_grep "ALLOWED_PREFIXES array exists"              'ALLOWED_PREFIXES=\('
assert_grep "ALLOWED_PREFIXES includes src/"             '"src/"'
assert_grep "ALLOWED_PREFIXES includes tests/"           '"tests/"'
assert_grep "ALLOWED_PREFIXES includes descriptions/"    '"scripts/pipeline/descriptions/"'
assert_grep "ALLOWED_PREFIXES includes attempts/"        '"scripts/pipeline/attempts/"'
assert_grep "ALLOWED_PREFIXES includes reports/"         '"scripts/pipeline/reports/"'
assert_grep "ALLOWED_PREFIXES includes tasks/"           '"scripts/pipeline/tasks/"'

# ── ALLOWED_PATHS array ──
# Exact CSV / report files the autonomous loop legitimately writes
# every cycle.
assert_grep "ALLOWED_PATHS array exists"                 'ALLOWED_PATHS=\('
assert_grep "ALLOWED_PATHS includes issues.csv"          '"scripts/pipeline/issues\.csv"'
assert_grep "ALLOWED_PATHS includes tasks.csv"           '"scripts/pipeline/tasks\.csv"'
assert_grep "ALLOWED_PATHS includes attempts.csv"        '"scripts/pipeline/attempts\.csv"'
assert_grep "ALLOWED_PATHS includes visual-report.json"  '"scripts/pipeline/visual-report\.json"'

# ── Branch gate ──
# Only PRs whose head branch begins with `auto-improve-` are even
# considered. This is the outer perimeter that protects every human
# / Phase / hot-fix branch from being touched by this script.
assert_grep "auto-improve-* branch gate"                 'auto-improve-'

# ── Loop logic markers ──
# Light structural checks that the script still actually iterates the
# arrays we've validated above. Exact loop bodies are out of scope
# for source-grep; we just assert the constants are referenced.
assert_grep "PROTECTED_PATHS is iterated"                '\$\{PROTECTED_PATHS\[@\]\}'
assert_grep "PROTECTED_GLOBS is iterated"                '\$\{PROTECTED_GLOBS\[@\]\}'
assert_grep "ALLOWED_PREFIXES is iterated"               '\$\{ALLOWED_PREFIXES\[@\]\}'
assert_grep "ALLOWED_PATHS is iterated"                  '\$\{ALLOWED_PATHS\[@\]\}'

# ── Reject reasons surfaced ──
# Counters used by the run-summary line (downstream alerts grep these).
assert_grep "rejected-protected reason emitted"          'rejected-protected'
assert_grep "rejected-outside reason emitted"            'rejected-outside'

echo ""
echo "Results: $passed passed, $failed failed"
if [[ $failed -gt 0 ]]; then
  exit 1
fi
exit 0
