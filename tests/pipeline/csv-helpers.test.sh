#!/usr/bin/env bash
# ============================================================
# csv-helpers.test.sh — Bash-level smoke tests for csv-helpers.sh
# ============================================================
# Verifies:
#   1. csv_lib.py self_test passes.
#   2. The bash facade wires through to the Python core (one call each).
#
# Runs in a sandbox dir. Does NOT touch real scripts/pipeline/*.csv.
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=/dev/null
. "$REPO_ROOT/scripts/pipeline/csv-helpers.sh"

failures=0
pass() { printf "  PASS: %s\n" "$1"; }
fail() { printf "  FAIL: %s\n" "$1" >&2; failures=$((failures + 1)); }

# ── 1. csv_lib self_test ────────────────────────────────────
echo "== csv_lib self_test =="
if csv_self_test >/dev/null; then
  pass "csv_lib self_test"
else
  fail "csv_lib self_test"
fi

# ── 2. bash facade smoke (sandboxed via PIPELINE_DIR override) ──
echo "== bash facade smoke =="
SANDBOX="$(mktemp -d)"
export PYTHONPATH=""
trap 'rm -rf "$SANDBOX"' EXIT

# Run helper invocations against a sandbox by passing a one-off PIPELINE_DIR
# override through the Python module. Easiest: spawn a tiny shim that
# rewrites the module-level paths. Since csv_lib.py derives PIPELINE_DIR
# from __file__, we copy it into the sandbox to redirect.
mkdir -p "$SANDBOX/scripts/pipeline/descriptions" "$SANDBOX/scripts/pipeline/tests"
cp "$REPO_ROOT/scripts/pipeline/csv_lib.py" \
   "$SANDBOX/scripts/pipeline/csv_lib.py"
cp "$REPO_ROOT/scripts/pipeline/csv-helpers.sh" \
   "$SANDBOX/scripts/pipeline/csv-helpers.sh"

# Re-source the sandboxed helper so $CSV_LIB points into the sandbox
# shellcheck source=/dev/null
. "$SANDBOX/scripts/pipeline/csv-helpers.sh"

DESC="$SANDBOX/scripts/pipeline/descriptions/010-smoke.md"
echo "## Description\nsmoke body" > "$DESC"

if csv_insert issues 010-smoke \
    "priority=high" "source=user" "parent=none" "depends=none" \
    "summary=smoke test issue" "status=pending" \
    "description_path=scripts/pipeline/descriptions/010-smoke.md" \
    >/dev/null 2>&1; then
  pass "csv_insert"
else
  fail "csv_insert"
fi

if [[ "$(csv_get_status issues 010-smoke)" == "pending" ]]; then
  pass "csv_get_status returns pending"
else
  fail "csv_get_status (got: $(csv_get_status issues 010-smoke))"
fi

if csv_set_status issues 010-smoke in-progress >/dev/null 2>&1; then
  pass "csv_set_status"
else
  fail "csv_set_status"
fi

if [[ "$(csv_count_active issues)" == "1" ]]; then
  pass "csv_count_active = 1"
else
  fail "csv_count_active (got: $(csv_count_active issues))"
fi

new_attempts=$(csv_increment_attempts issues 010-smoke 2>/dev/null)
if [[ "$new_attempts" == "1" ]]; then
  pass "csv_increment_attempts → 1"
else
  fail "csv_increment_attempts (got: $new_attempts)"
fi

prompt=$(csv_to_prompt_text issues 010-smoke)
if echo "$prompt" | grep -q "summary: smoke test issue" && \
   echo "$prompt" | grep -q "smoke body"; then
  pass "csv_to_prompt_text round-trips"
else
  fail "csv_to_prompt_text"
fi

if csv_archive issues 010-smoke >/dev/null 2>&1 && \
   [[ "$(csv_get_status issues 010-smoke)" == "done" ]]; then
  pass "csv_archive marks done"
else
  fail "csv_archive"
fi

if csv_validate issues >/dev/null 2>&1; then
  pass "csv_validate clean"
else
  fail "csv_validate"
fi

# ── 3. Phase 2-A helpers (next_id_num / select_*_by_slug / jaccard) ──
echo "== Phase 2-A helpers =="

# Reset sandbox state by re-creating the helpers
csv_insert issues "020-perf-regression" \
    "priority=high" "source=auto-discovered" "parent=none" "depends=none" \
    "summary=performance regression detected — render time 2x slower" \
    "status=pending" \
    "description_path=scripts/pipeline/descriptions/020-perf-regression.md" \
    >/dev/null 2>&1
echo "## Description\nbody" > "$SANDBOX/scripts/pipeline/descriptions/020-perf-regression.md"

# next_id_num after inserts of 010-* and 020-*
next_n=$(csv_next_id_num)
if [[ "$next_n" == "21" ]]; then
  pass "csv_next_id_num after 010 + 020 → 21"
else
  fail "csv_next_id_num (got: $next_n, expected 21)"
fi

# select_active_by_slug — should find 020-perf-regression
hit=$(csv_select_active_by_slug issues perf-regression)
if [[ "$hit" == "020-perf-regression" ]]; then
  pass "csv_select_active_by_slug finds active row"
else
  fail "csv_select_active_by_slug (got: '$hit')"
fi

# select_active_by_slug — slug does not exist → empty
none_hit=$(csv_select_active_by_slug issues nonexistent-slug)
if [[ -z "$none_hit" ]]; then
  pass "csv_select_active_by_slug empty for unknown slug"
else
  fail "csv_select_active_by_slug should be empty (got: '$none_hit')"
fi

# select_active_by_slug — archived (010-smoke is done) → not active
archive_hit=$(csv_select_active_by_slug issues smoke)
if [[ -z "$archive_hit" ]]; then
  pass "csv_select_active_by_slug skips archived (done) row"
else
  fail "csv_select_active_by_slug should skip done (got: '$archive_hit')"
fi

# max_summary_jaccard — exact match → 100
jac_out=$(csv_max_summary_jaccard issues "performance regression detected — render time 2x slower")
score=${jac_out%%|*}
if [[ "$score" == "100" ]]; then
  pass "csv_max_summary_jaccard exact match → 100"
else
  fail "csv_max_summary_jaccard exact (got: $score)"
fi

# max_summary_jaccard — disjoint → 0
jac_out2=$(csv_max_summary_jaccard issues "completely unrelated topic xyz qrt")
score2=${jac_out2%%|*}
if [[ "$score2" -lt 30 ]]; then
  pass "csv_max_summary_jaccard disjoint → low score ($score2)"
else
  fail "csv_max_summary_jaccard disjoint (got: $score2)"
fi

# select_blocked_by_slug — blocked status row
csv_insert issues "030-blocked-feature" \
    "priority=low" "source=auto-discovered" "parent=none" "depends=none" \
    "summary=stuck feature" "status=blocked" \
    "description_path=scripts/pipeline/descriptions/030-blocked-feature.md" \
    >/dev/null 2>&1
echo "body" > "$SANDBOX/scripts/pipeline/descriptions/030-blocked-feature.md"
blocked_hit=$(csv_select_blocked_by_slug issues blocked-feature)
if [[ "$blocked_hit" == "030-blocked-feature" ]]; then
  pass "csv_select_blocked_by_slug"
else
  fail "csv_select_blocked_by_slug (got: '$blocked_hit')"
fi

# ── Summary ─────────────────────────────────────────────────
echo
if [[ $failures -eq 0 ]]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "$failures TEST(S) FAILED" >&2
  exit 1
fi
