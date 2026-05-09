#!/usr/bin/env bash
# ============================================================
# audit-pr-backlog-args.test.sh
# ============================================================
# Unit tests for scripts/pipeline/audit-pr-backlog.sh argument parsing.
#
# Network-independent: validates ONLY the argparse paths. The actual
# `gh pr list` execution is skipped by overriding PATH to point at a
# shim that exits non-zero, so the script reaches its post-argparse
# `gh pr list failed` branch (rc=1) — which proves args were accepted.
#
# This protects the R5-A kaizen (2026-05-09) that introduced
# --auto-improve-only, -v|--verbose, and -h|--help on audit-pr-backlog.sh.
#
# Test cases:
#   1. -h flag                 → exit 0 + Usage shown
#   2. --help flag             → exit 0 + Usage shown
#   3. --invalid-flag-xyz      → exit 2 + "Unknown arg" on stderr
#   4. --auto-improve-only     → not arg-error (rc != 2)
#   5. -v                      → not arg-error (rc != 2)
#   6. -v --auto-improve-only  → not arg-error (rc != 2)
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/audit-pr-backlog.sh"

passed=0
failed=0

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Build a `gh` shim that always fails. We DON'T blank PATH (the script
# needs mktemp/python3/date), instead we prepend a shim dir so the
# script's `gh pr list` resolves to our failing stub. This guarantees:
#   - Args were accepted (otherwise script would exit 2 before gh)
#   - Script exits 1 on the documented "gh pr list failed" path
SHIM_DIR="$tmpdir/shim"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/gh" <<'GH_SHIM'
#!/usr/bin/env bash
# Test shim: simulate gh failure (exit 1) so the SUT hits its
# `gh pr list failed` error branch without making a network call.
exit 1
GH_SHIM
chmod +x "$SHIM_DIR/gh"
SHIM_PATH="$SHIM_DIR:/usr/local/bin:/usr/bin:/bin"

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

assert_not_eq() {
  local label="$1" forbidden="$2" actual="$3"
  if [[ "$actual" -ne "$forbidden" ]]; then
    echo "PASS: $label"
    ((passed++))
  else
    echo "FAIL: $label (got forbidden value: $actual)"
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
    echo "--- output ---"
    cat "$file" 2>/dev/null || true
    echo "--- end ---"
    ((failed++))
  fi
}

# Sanity: SUT exists and is readable
if [[ ! -r "$SUT" ]]; then
  echo "FAIL: SUT not found at $SUT"
  exit 1
fi

# --- Case 1: -h → exit 0 + Usage shown ---
rc=0
bash "$SUT" -h > "$tmpdir/c1.out" 2>&1 || rc=$?
assert_exit     "case1: -h → exit 0"            0          "$rc"
assert_contains "case1: Usage section shown"    "[Uu]sage" "$tmpdir/c1.out"

# --- Case 2: --help → exit 0 + Usage shown ---
rc=0
bash "$SUT" --help > "$tmpdir/c2.out" 2>&1 || rc=$?
assert_exit     "case2: --help → exit 0"        0          "$rc"
assert_contains "case2: Usage section shown"    "[Uu]sage" "$tmpdir/c2.out"

# --- Case 3: invalid arg → exit 2 + Unknown arg on stderr ---
rc=0
bash "$SUT" --invalid-flag-xyz > "$tmpdir/c3.out" 2>&1 || rc=$?
assert_exit     "case3: invalid arg → exit 2"   2             "$rc"
assert_contains "case3: 'Unknown arg' message" "Unknown arg" "$tmpdir/c3.out"

# --- Case 4: --auto-improve-only accepted (gh shim → rc=1, not 2) ---
rc=0
env PATH="$SHIM_PATH" bash "$SUT" --auto-improve-only > "$tmpdir/c4.out" 2>&1 || rc=$?
assert_not_eq   "case4: --auto-improve-only is not an arg-error" 2 "$rc"
assert_contains "case4: hits gh-failure branch (not argparse)"   "gh pr list failed|gh pr list returned empty" "$tmpdir/c4.out"

# --- Case 5: -v accepted ---
rc=0
env PATH="$SHIM_PATH" bash "$SUT" -v > "$tmpdir/c5.out" 2>&1 || rc=$?
assert_not_eq   "case5: -v is not an arg-error" 2 "$rc"

# --- Case 6: combined flags accepted ---
rc=0
env PATH="$SHIM_PATH" bash "$SUT" -v --auto-improve-only > "$tmpdir/c6.out" 2>&1 || rc=$?
assert_not_eq   "case6: -v --auto-improve-only is not an arg-error" 2 "$rc"

# --- Case 7: --verbose long form accepted ---
rc=0
env PATH="$SHIM_PATH" bash "$SUT" --verbose > "$tmpdir/c7.out" 2>&1 || rc=$?
assert_not_eq   "case7: --verbose is not an arg-error" 2 "$rc"

echo "---"
echo "Results: $passed passed, $failed failed"
(( failed == 0 ))
