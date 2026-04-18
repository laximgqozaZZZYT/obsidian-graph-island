#!/usr/bin/env bash
# Unit tests for scripts/verify-body-match.sh (subtask-3 of 759-730).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/verify-body-match.sh"

passed=0
failed=0

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (expected exit $expected, got $actual)"
    ((failed++))
  fi
}

assert_stdout_contains() {
  local label="$1" pattern="$2" file="$3"
  if grep -q -- "$pattern" "$file" 2>/dev/null; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (stdout missing pattern: $pattern)"
    echo "  actual stdout:"
    sed 's/^/    /' "$file"
    ((failed++))
  fi
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Body used across most cases. Includes leading blank line, tab, wiki-link, trailing newline.
body=$'## Description\n\nOriginal body with\ttab and [[wiki-link]].\n- item with trailing spaces   \n'

make_target() {
  # make_target <out> [body]
  local body_override="${2:-$body}"
  {
    printf -- '---\npriority: medium\nstatus: done\n---\n\n'
    printf '%s' "$body_override"
  } > "$1"
}

make_baseline() {
  # make_baseline <out> [body]
  local body_override="${2:-$body}"
  jq -n --arg b "$body_override" '{frontmatter: {status: "done"}, body: $b}' > "$1"
}

# --- Case 1: exact match → BODY OK, exit 0 ---
make_target "$tmpdir/c1-target.md"
make_baseline "$tmpdir/c1-baseline.json"
rc=0
bash "$SUT" "$tmpdir/c1-target.md" "$tmpdir/c1-baseline.json" >"$tmpdir/c1.out" 2>&1 || rc=$?
assert_exit "case1: exact match → exit 0" 0 "$rc"
assert_stdout_contains "case1: BODY OK printed" "^BODY OK$" "$tmpdir/c1.out"

# --- Case 2: body differs on a middle line → ERROR + line number, exit 2 ---
mutated=$'## Description\n\nOriginal body with\ttab and [[wiki-link]].\n- MUTATED line   \n'
make_target "$tmpdir/c2-target.md" "$mutated"
make_baseline "$tmpdir/c2-baseline.json"
rc=0
bash "$SUT" "$tmpdir/c2-target.md" "$tmpdir/c2-baseline.json" >"$tmpdir/c2.out" 2>&1 || rc=$?
assert_exit "case2: body mismatch → exit 2" 2 "$rc"
assert_stdout_contains "case2: first diff line reported" "^ERROR: first diff at line 4$" "$tmpdir/c2.out"
assert_stdout_contains "case2: expected line in output" "MUTATED" "$tmpdir/c2.out"

# --- Case 3: trailing newline missing in target → detected as line count diff, exit 2 ---
no_trailing=$'## Description\n\nOriginal body with\ttab and [[wiki-link]].\n- item with trailing spaces   '
make_target "$tmpdir/c3-target.md" "$no_trailing"
make_baseline "$tmpdir/c3-baseline.json"
rc=0
bash "$SUT" "$tmpdir/c3-target.md" "$tmpdir/c3-baseline.json" >"$tmpdir/c3.out" 2>&1 || rc=$?
assert_exit "case3: trailing newline diff → exit 2" 2 "$rc"
assert_stdout_contains "case3: line count diff reported" "^ERROR: line count differs" "$tmpdir/c3.out"

# --- Case 4: missing target file → exit 1 ---
rc=0
bash "$SUT" "$tmpdir/nonexistent.md" "$tmpdir/c1-baseline.json" >"$tmpdir/c4.out" 2>&1 || rc=$?
assert_exit "case4: missing target → exit 1" 1 "$rc"
assert_stdout_contains "case4: error mentions target" "target file not found" "$tmpdir/c4.out"

# --- Case 5: missing baseline file → exit 1 ---
rc=0
bash "$SUT" "$tmpdir/c1-target.md" "$tmpdir/nonexistent.json" >"$tmpdir/c5.out" 2>&1 || rc=$?
assert_exit "case5: missing baseline → exit 1" 1 "$rc"
assert_stdout_contains "case5: error mentions baseline" "baseline not found" "$tmpdir/c5.out"

# --- Case 6: no '## Description' heading in target → exit 1 ---
printf -- '---\nstatus: done\n---\n\nno heading here\n' > "$tmpdir/c6-target.md"
rc=0
bash "$SUT" "$tmpdir/c6-target.md" "$tmpdir/c1-baseline.json" >"$tmpdir/c6.out" 2>&1 || rc=$?
assert_exit "case6: missing heading → exit 1" 1 "$rc"
assert_stdout_contains "case6: error mentions heading" "'## Description' not found" "$tmpdir/c6.out"

# --- Summary ---
echo
echo "================================"
echo "Total: $((passed + failed))  PASS: $passed  FAIL: $failed"
(( failed == 0 ))
