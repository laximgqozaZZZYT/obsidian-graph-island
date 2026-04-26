#!/usr/bin/env bash
# gate-subtask2-result.sh — Gate subtask-3 execution based on subtask-2 verify result.
#
# Contract (authoritative: scripts/pipeline/tasks/710-684-skip-pass.md):
#   Input   : key=value lines from scripts/read-subtask2-result.sh
#             (keys: status, pass, fail, executed)
#   Stdout  : 5-line summary headed "[607-597 subtask-2 result]" followed by
#             one of "SKIP: subtask-3 は実行しない" / "OK: subtask-3 実行可" /
#             "SKIP: gate write failed".
#   Side FX : on PASS, one line at $GATE_FILE:
#             status=done pass=<N> fail=0 executed=<YYYY-MM-DD>
#   Exit    : always 0 — outer pipeline must never break; downstream steps
#             decide from stdout / the gate file.
#
# The "607-597" prefix is a cross-task contract — downstream subtask-3 reads
# that exact path. Do not generalize without updating the spec.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 0

READER=scripts/read-subtask2-result.sh
GATE_FILE=/tmp/607-597-subtask-2-result.txt

# Missing or failing reader → empty output → defaults applied below.
reader_out=$(bash "$READER" 2>/dev/null || true)

extract() {
  # extract <key> — print value of the first key=value line, or empty.
  printf '%s\n' "$reader_out" | awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print; exit}'
}

status=$(extract status);     status=${status:-unknown}
pass=$(extract pass);         pass=${pass:-0}
fail=$(extract fail);         fail=${fail:-0}
executed=$(extract executed); executed=${executed:-$(date +%Y-%m-%d)}

echo "[607-597 subtask-2 result]"
echo "status  : ${status}"
echo "PASS    : ${pass}"
echo "FAIL    : ${fail}"
echo "executed: ${executed}"

# SKIP when fail>0, or status is blocked/unknown.
if { [[ "$fail" =~ ^[0-9]+$ ]] && (( fail > 0 )); } \
   || [[ "$status" == "blocked" || "$status" == "unknown" ]]; then
  echo "SKIP: subtask-3 は実行しない"
  exit 0
fi

# PASS branch: best-effort cleanup of any stale/symlinked gate file, then write
# the contract line. NOT a security boundary — a TOCTOU window remains between
# rm and >, and sticky /tmp silently swallows rm failures on foreign owners.
# We therefore check the write itself so a silent failure never passes as PASS.
rm -f -- "$GATE_FILE"
if ! printf 'status=done pass=%s fail=0 executed=%s\n' "$pass" "$executed" > "$GATE_FILE" 2>/dev/null; then
  echo "SKIP: gate write failed"
  exit 0
fi
echo "OK: subtask-3 実行可"
exit 0
