#!/usr/bin/env bash
# ============================================================
# csv-alerts-dir.test.sh — Behavioural test for R11-B parallel file sink.
# ============================================================
#
# Round 11 R11-B added a parallel "alert directory" sink to csv_file_alert
# (csv-helpers.sh:283-293) so operators can see open pipeline alerts via
# `ls /tmp/graph-island-alerts/` rather than parsing issues.csv. The
# acknowledge-alert.sh script removes the corresponding .txt file when the
# operator runs `--ack <id>` (or `--ack-all`).
#
# This suite asserts:
#   1. csv_file_alert writes a human-readable .txt summary to ALERT_DIR
#   2. GRAPH_ISLAND_ALERT_DIR env override is honoured
#   3. acknowledge-alert.sh --ack <id> removes the .txt file
#   4. source-grep — env override + cleanup wiring is present in both files
#   5. fail-open — csv_file_alert still files the issue when ALERT_DIR
#      is unwritable (the issue row is the source of truth; the .txt file
#      is just a convenience sink, so it must never block alert filing)
#
# Sandbox strategy: copy csv_lib.py + csv-helpers.sh into a tmp tree so
# PIPELINE_DIR (which is __file__-relative inside csv_lib.py) points into
# the sandbox. PROJECT_DIR override redirects _csv_project_dir() so the
# atomic-commit path no-ops cleanly outside a git repo.
#
# Network-independent. No side-effects on real scripts/pipeline/*.csv or
# /tmp/graph-island-alerts/. Deterministic.
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT_HELPERS="$REPO_ROOT/scripts/pipeline/csv-helpers.sh"
SUT_ACK="$REPO_ROOT/scripts/pipeline/acknowledge-alert.sh"
CSV_LIB_PY="$REPO_ROOT/scripts/pipeline/csv_lib.py"

passed=0
failed=0

pass() { printf "  PASS: %s\n" "$1"; passed=$((passed + 1)); }
fail() { printf "  FAIL: %s\n" "$1" >&2; failed=$((failed + 1)); }

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    pass "$label"
  else
    fail "$label (path: $path)"
  fi
}

assert_file_missing() {
  local label="$1" path="$2"
  if [[ ! -e "$path" ]]; then
    pass "$label"
  else
    fail "$label (still exists: $path)"
  fi
}

assert_contains() {
  local label="$1" needle="$2" path="$3"
  if [[ -f "$path" ]] && grep -qF -- "$needle" "$path"; then
    pass "$label"
  else
    fail "$label (needle: $needle in $path)"
  fi
}

assert_grep() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE -- "$pattern" "$file"; then
    pass "$label"
  else
    fail "$label (pattern: $pattern in $(basename "$file"))"
  fi
}

# ─────────────────────────────────────────────────────────────
# Section 1: Preconditions — SUT files exist
# ─────────────────────────────────────────────────────────────
echo "== preconditions =="
for f in "$SUT_HELPERS" "$SUT_ACK" "$CSV_LIB_PY"; do
  if [[ -f "$f" ]]; then
    pass "exists: $(basename "$f")"
  else
    fail "missing: $f"
    echo "Results: $passed passed, $failed failed"
    exit 1
  fi
done

# ─────────────────────────────────────────────────────────────
# Section 2: Source-grep — env override + cleanup wiring
# (cheap structural guarantees that the integration points still exist;
# cheaper to assert here than to rebuild a full sandbox to detect a
# deletion of the GRAPH_ISLAND_ALERT_DIR var)
# ─────────────────────────────────────────────────────────────
echo "== source-grep: env override + cleanup wiring =="
assert_grep "csv-helpers references GRAPH_ISLAND_ALERT_DIR" \
  'GRAPH_ISLAND_ALERT_DIR' "$SUT_HELPERS"
assert_grep "csv-helpers writes to ALERT_DIR/<id>.txt" \
  'ALERT_DIR/[^"]*\.txt' "$SUT_HELPERS"
assert_grep "ack-alert references GRAPH_ISLAND_ALERT_DIR" \
  'GRAPH_ISLAND_ALERT_DIR' "$SUT_ACK"
assert_grep "ack-alert removes ALERT_DIR/<id>.txt" \
  'rm -f.*ALERT_DIR.*\.txt' "$SUT_ACK"

# ─────────────────────────────────────────────────────────────
# Section 3: Sandbox setup
# ─────────────────────────────────────────────────────────────
echo "== sandbox setup =="

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

sandbox="$tmpdir/sandbox"
mkdir -p "$sandbox/scripts/pipeline/descriptions"
cp "$CSV_LIB_PY"   "$sandbox/scripts/pipeline/csv_lib.py"
cp "$SUT_HELPERS"  "$sandbox/scripts/pipeline/csv-helpers.sh"
chmod +x "$sandbox/scripts/pipeline/csv_lib.py" 2>/dev/null || true

# Seed empty CSVs with proper headers so csv_lib.py can append rows.
cat > "$sandbox/scripts/pipeline/issues.csv" <<'CSV'
id,priority,reported,completed,status,source,parent,depends,superseded_by,summary,decompose_attempts,description_path,created_at,updated_at
CSV
cat > "$sandbox/scripts/pipeline/tasks.csv" <<'CSV'
id,priority,reported,completed,status,source,parent,depends,superseded_by,summary,attempt_count,description_path,created_at,updated_at
CSV
cat > "$sandbox/scripts/pipeline/attempts.csv" <<'CSV'
issue_id,task_id,attempt_no,timestamp,status_before,session_summary,note
CSV

if [[ -f "$sandbox/scripts/pipeline/issues.csv" ]]; then
  pass "sandbox: seeded issues.csv"
else
  fail "sandbox: failed to seed issues.csv"
fi

# Sandbox lockfile — keeps this suite isolated from real cycles + parallel
# test runs (no contention on /tmp/graph-island-csv-commit.lock).
SANDBOX_LOCK="$tmpdir/csv-commit.lock"

# Helper that runs a single `csv_file_alert` invocation in a clean subshell
# so the sourced helpers don't pollute this shell's namespace.
#
# Args: $1 = ALERT_DIR, $2 = slug, $3 = priority, $4 = summary, $5 = body
# Stdout: the new issue_id (whatever csv_file_alert echoed)
run_alert() {
  local alert_dir="$1" slug="$2" prio="$3" sum="$4" body="$5"
  ALERT_DIR_OVERRIDE="$alert_dir" \
  SANDBOX="$sandbox" \
  SANDBOX_LOCK="$SANDBOX_LOCK" \
  ALERT_SLUG="$slug" ALERT_PRIO="$prio" ALERT_SUM="$sum" ALERT_BODY="$body" \
  bash -c '
    set -uo pipefail
    cd "$SANDBOX"
    # shellcheck source=/dev/null
    . scripts/pipeline/csv-helpers.sh
    _csv_atomic_lock_file="$SANDBOX_LOCK"
    export PROJECT_DIR="$SANDBOX"
    # 2>/dev/null swallows the harmless `git diff --cached` noise that
    # _csv_atomic_commit emits when PROJECT_DIR is not a git repo (the
    # commit silently no-ops via the diff path; the noise is just stderr
    # from older git binaries that reject `--cached` outside a repo).
    GRAPH_ISLAND_ALERT_DIR="$ALERT_DIR_OVERRIDE" \
      csv_file_alert "$ALERT_SLUG" "$ALERT_PRIO" "$ALERT_SUM" "$ALERT_BODY" \
      2>/dev/null
  '
}

# ─────────────────────────────────────────────────────────────
# Section 4: Case 1 — csv_file_alert creates summary file in ALERT_DIR
# ─────────────────────────────────────────────────────────────
echo "== case 1: csv_file_alert writes ALERT_DIR/<id>.txt =="

ALERT_DIR_C1="$tmpdir/case1-alerts"
issue_id_c1="$(run_alert "$ALERT_DIR_C1" 'test-r12b-c1' 'critical' \
  'Case1 summary' 'Case1 body content')"
issue_id_c1="$(printf '%s' "$issue_id_c1" | tail -n1 | tr -d '[:space:]')"

if [[ -n "$issue_id_c1" ]]; then
  pass "case1: csv_file_alert echoed issue_id ($issue_id_c1)"
else
  fail "case1: csv_file_alert echoed empty issue_id"
fi

assert_file_exists "case1: ALERT_DIR/<id>.txt created" \
  "$ALERT_DIR_C1/${issue_id_c1}.txt"
assert_contains   "case1: file contains 'Slug: test-r12b-c1'" \
  "Slug: test-r12b-c1" "$ALERT_DIR_C1/${issue_id_c1}.txt"
assert_contains   "case1: file contains 'Priority: critical'" \
  "Priority: critical" "$ALERT_DIR_C1/${issue_id_c1}.txt"
assert_contains   "case1: file contains body" \
  "Case1 body content" "$ALERT_DIR_C1/${issue_id_c1}.txt"

# ─────────────────────────────────────────────────────────────
# Section 5: Case 2 — env override redirects ALERT_DIR
# ─────────────────────────────────────────────────────────────
echo "== case 2: GRAPH_ISLAND_ALERT_DIR env override =="

ALERT_DIR_C2="$tmpdir/case2-custom-alerts"
issue_id_c2="$(run_alert "$ALERT_DIR_C2" 'test-r12b-c2' 'high' \
  'Case2 summary' 'Case2 body')"
issue_id_c2="$(printf '%s' "$issue_id_c2" | tail -n1 | tr -d '[:space:]')"

assert_file_exists "case2: env override path used" \
  "$ALERT_DIR_C2/${issue_id_c2}.txt"
# Negative — confirm the *default* path was NOT touched.
if [[ ! -e "/tmp/graph-island-alerts/${issue_id_c2}.txt" ]]; then
  pass "case2: default /tmp/graph-island-alerts/ untouched"
else
  fail "case2: default path was written despite env override"
fi

# ─────────────────────────────────────────────────────────────
# Section 6: Case 3 — acknowledge-alert.sh --ack removes the .txt sink
#
# We can't run acknowledge-alert.sh as-is because it hardcodes
# PROJECT_DIR=/home/ubuntu/obsidian-plugins/obsidian-graph-island and
# would mutate the real issues.csv. Instead we copy the script into the
# sandbox and rewrite the PROJECT_DIR line to point at the sandbox.
# This still exercises the real --ack code path (csv_atomic_set_status +
# rm -f "$ALERT_DIR/${TARGET}.txt").
# ─────────────────────────────────────────────────────────────
echo "== case 3: acknowledge-alert.sh --ack removes file sink =="

ALERT_DIR_C3="$tmpdir/case3-alerts"
issue_id_c3="$(run_alert "$ALERT_DIR_C3" 'test-r12b-c3' 'critical' \
  'Case3 summary' 'Case3 body')"
issue_id_c3="$(printf '%s' "$issue_id_c3" | tail -n1 | tr -d '[:space:]')"

assert_file_exists "case3: pre-condition — .txt exists before ack" \
  "$ALERT_DIR_C3/${issue_id_c3}.txt"

# Sandboxed copy of acknowledge-alert.sh with PROJECT_DIR rewritten.
ACK_SANDBOX="$sandbox/scripts/pipeline/acknowledge-alert.sh"
cp "$SUT_ACK" "$ACK_SANDBOX"
# Replace the hardcoded PROJECT_DIR= line with our sandbox path.
# Use python rather than sed -i to avoid GNU/BSD sed flag drift.
SANDBOX="$sandbox" python3 - "$ACK_SANDBOX" <<'PY'
import os, sys, pathlib
p = pathlib.Path(sys.argv[1])
sandbox = os.environ["SANDBOX"]
src = p.read_text()
out_lines = []
for line in src.splitlines():
    if line.startswith("PROJECT_DIR=") and "obsidian-graph-island" in line:
        out_lines.append(f'PROJECT_DIR="{sandbox}"')
    else:
        out_lines.append(line)
p.write_text("\n".join(out_lines) + "\n")
PY
chmod +x "$ACK_SANDBOX"

# Run --ack inside an env that overrides ALERT_DIR + the sandbox lockfile.
ack_out="$(GRAPH_ISLAND_ALERT_DIR="$ALERT_DIR_C3" \
  PROJECT_DIR="$sandbox" \
  bash "$ACK_SANDBOX" --ack "$issue_id_c3" 2>/dev/null)"
ack_rc=$?

if [[ $ack_rc -eq 0 ]]; then
  pass "case3: acknowledge-alert.sh --ack returns 0"
else
  fail "case3: acknowledge-alert.sh --ack rc=$ack_rc (output: $ack_out)"
fi

assert_file_missing "case3: ALERT_DIR/<id>.txt removed by --ack" \
  "$ALERT_DIR_C3/${issue_id_c3}.txt"

# Also verify the issue row was archived (status=done) — this is the
# csv_atomic_set_status side of the --ack contract.
status_after="$(cd "$sandbox" \
  && python3 scripts/pipeline/csv_lib.py get_status issues "$issue_id_c3" \
  2>/dev/null)"
if [[ "$status_after" == "done" ]]; then
  pass "case3: issue row archived to status=done"
else
  fail "case3: status after ack (got: ${status_after:-<empty>})"
fi

# ─────────────────────────────────────────────────────────────
# Section 7: Case 4 — fail-open: csv_file_alert succeeds even when
# ALERT_DIR is unwritable. The issue row is the source of truth; the
# .txt file is a convenience sink, so it must never block alert filing.
# ─────────────────────────────────────────────────────────────
echo "== case 4: fail-open when ALERT_DIR is unwritable =="

# Use a path under /proc which mkdir -p cannot create (read-only kernel fs).
# This exercises the `|| true` fail-open paths in csv-helpers.sh:285,293.
ALERT_DIR_BAD="/proc/graph-island-alerts-${RANDOM}-${RANDOM}"
issue_id_c4="$(run_alert "$ALERT_DIR_BAD" 'test-r12b-c4' 'low' \
  'Case4 fail-open' 'Case4 body' 2>/dev/null)"
issue_id_c4="$(printf '%s' "$issue_id_c4" | tail -n1 | tr -d '[:space:]')"

if [[ -n "$issue_id_c4" ]]; then
  pass "case4: csv_file_alert succeeds when ALERT_DIR unwritable"
else
  fail "case4: csv_file_alert silently dropped issue (fail-open broken)"
fi

# Confirm the issue row WAS written to issues.csv (the durable sink).
if grep -qF -- "$issue_id_c4" "$sandbox/scripts/pipeline/issues.csv"; then
  pass "case4: issue row written to issues.csv despite alert-dir failure"
else
  fail "case4: issue row missing from issues.csv"
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo
echo "Results: $passed passed, $failed failed"
if [[ $failed -gt 0 ]]; then
  exit 1
fi
exit 0
