#!/usr/bin/env bash
# ============================================================
# auto-stale-pr-close-rules.test.sh
# ============================================================
# Unit tests for scripts/pipeline/auto-stale-pr-close.sh — Rule 3
# (CI=FAILURE non-draft PR auto-close after CI_FAIL_HOURS, default 48h).
#
# Introduced by Round 1 P1-C kaizen (2026-05-08). Round 7 split the
# behavioural cases off to source-grep due to a /tmp/auto-stale-prs.json
# race with the 6h-cron, then Round 8 restored behavioural coverage by
# parametrising the SUT with --json-input=PATH so each case can write to
# a tmpdir-isolated fixture path. No more race.
#
# Test cases:
#   1. dry-run header includes "CI_FAIL threshold:" line
#   2. CI=FAIL non-draft + old → CLOSE_CI_FAIL identified (ci_fail=1)
#   3. CI=FAIL but isDraft=true → ci_fail=0 (not counted as ci_fail)
#   4. CI=PASS non-draft + old → ci_fail=0
#   5. CI_FAIL_HOURS=999999 (extreme threshold) → ci_fail=0
#   6. summary line includes "ci_fail=" field
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/auto-stale-pr-close.sh"

passed=0
failed=0
tmpdir="$(mktemp -d)"
shimdir="$tmpdir/bin"
mkdir -p "$shimdir"
trap 'rm -rf "$tmpdir"' EXIT

# `gh` shim: SUT now reads from --json-input=PATH directly and skips
# `gh pr list` entirely, so the shim only has to be a safe no-op for any
# stray gh subcommands the SUT might emit (it currently does not in
# --dry-run, but keep the shim as defence-in-depth so a regression that
# adds a stray `gh` call doesn't escape and hit the live API).
cat > "$shimdir/gh" <<'EOF'
#!/usr/bin/env bash
echo "MOCK GH $*" >&2
exit 0
EOF
chmod +x "$shimdir/gh"

assert_contains() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (missing pattern: $pattern)"
    echo "--- output ---"
    cat "$file" 2>/dev/null || true
    echo "--- end ---"
    ((failed++))
  fi
}

# Run SUT with explicit --json-input pointing to a tmpdir-isolated fixture
# path. Eliminates the /tmp/auto-stale-prs.json race with the 6h cron run
# of the same SUT. Each test case constructs its own fixture path under
# $tmpdir, so even concurrent test invocations don't collide.
run_sut() {
  local out_file="$1" json_path="$2"; shift 2
  PATH="$shimdir:$PATH" "$@" --json-input="$json_path" \
    > "$out_file" 2>&1 || true
}

# Helpers — emit ISO-8601 UTC timestamps for fixture rows.
iso_hours_ago() {
  local hours="$1"
  date -u -d "$hours hours ago" +%Y-%m-%dT%H:%M:%SZ
}

# Sanity: SUT exists
if [[ ! -r "$SUT" ]]; then
  echo "FAIL: SUT not found at $SUT"
  exit 1
fi

# --- Case 1: dry-run header includes CI_FAIL threshold ---
echo "[]" > "$tmpdir/case1.json"
run_sut "$tmpdir/c1.out" "$tmpdir/case1.json" bash "$SUT" --dry-run
assert_contains "case1: CI_FAIL threshold header present" \
  "CI_FAIL threshold:" "$tmpdir/c1.out"

# --- Case 2: CI=FAIL non-draft + old → CLOSE_CI_FAIL identified (ci_fail=1) ---
# 100h old, non-draft, FAILURE conclusion → matches Rule 3 (>48h default).
old_iso="$(iso_hours_ago 100)"
cat > "$tmpdir/case2.json" <<JSON
[
  {
    "number": 9001,
    "headRefName": "auto-improve-case2",
    "title": "auto: case2 fixture",
    "createdAt": "$old_iso",
    "isDraft": false,
    "mergeStateStatus": "CLEAN",
    "statusCheckRollup": [
      {"conclusion": "FAILURE"}
    ]
  }
]
JSON
run_sut "$tmpdir/c2.out" "$tmpdir/case2.json" bash "$SUT" --dry-run
assert_contains "case2: CLOSE_CI_FAIL action emitted" \
  "CLOSE-CI-FAIL|CLOSE_CI_FAIL" "$tmpdir/c2.out"
assert_contains "case2: ci_fail=1 in summary" \
  "ci_fail=1" "$tmpdir/c2.out"

# --- Case 3: CI=FAIL but isDraft=true → ci_fail=0 (Rule 3 guarded) ---
cat > "$tmpdir/case3.json" <<JSON
[
  {
    "number": 9002,
    "headRefName": "auto-improve-case3",
    "title": "auto: case3 draft fixture",
    "createdAt": "$old_iso",
    "isDraft": true,
    "mergeStateStatus": "CLEAN",
    "statusCheckRollup": [
      {"conclusion": "FAILURE"}
    ]
  }
]
JSON
run_sut "$tmpdir/c3.out" "$tmpdir/case3.json" bash "$SUT" --dry-run
assert_contains "case3: ci_fail=0 (draft skipped by Rule 3)" \
  "ci_fail=0" "$tmpdir/c3.out"

# --- Case 4: CI=PASS non-draft + old → ci_fail=0 ---
cat > "$tmpdir/case4.json" <<JSON
[
  {
    "number": 9003,
    "headRefName": "auto-improve-case4",
    "title": "auto: case4 passing fixture",
    "createdAt": "$old_iso",
    "isDraft": false,
    "mergeStateStatus": "CLEAN",
    "statusCheckRollup": [
      {"conclusion": "SUCCESS"}
    ]
  }
]
JSON
run_sut "$tmpdir/c4.out" "$tmpdir/case4.json" bash "$SUT" --dry-run
assert_contains "case4: ci_fail=0 (no FAILURE conclusion)" \
  "ci_fail=0" "$tmpdir/c4.out"

# --- Case 5: CI_FAIL_HOURS=999999 (extreme threshold) → ci_fail=0 ---
# Same FAILURE fixture as case 2, but the threshold pushes ci_fail_epoch
# far into the past — the PR's createdAt is no longer "older than" it.
cat > "$tmpdir/case5.json" <<JSON
[
  {
    "number": 9004,
    "headRefName": "auto-improve-case5",
    "title": "auto: case5 extreme threshold",
    "createdAt": "$old_iso",
    "isDraft": false,
    "mergeStateStatus": "CLEAN",
    "statusCheckRollup": [
      {"conclusion": "FAILURE"}
    ]
  }
]
JSON
CI_FAIL_HOURS=999999 run_sut "$tmpdir/c5.out" "$tmpdir/case5.json" bash "$SUT" --dry-run
assert_contains "case5: ci_fail=0 with CI_FAIL_HOURS=999999" \
  "ci_fail=0" "$tmpdir/c5.out"

# --- Case 6: summary line includes "ci_fail=" field ---
# Reuse case 1 (empty fixture) — the summary line is emitted unconditionally.
assert_contains "case6: summary line includes ci_fail= field" \
  "ci_fail=" "$tmpdir/c1.out"

echo ""
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
