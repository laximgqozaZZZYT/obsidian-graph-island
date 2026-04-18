#!/usr/bin/env bash
# gate-subtask2-result.sh — Gate subtask-3 execution based on subtask-2 verify result.
#
# Reads key=value output from scripts/read-subtask2-result.sh, prints a summary,
# and decides whether subtask-3 may run. Always exits 0 so the outer pipeline
# is never broken; downstream steps must check stdout / the gate file.
#
# Outputs (stdout):
#   [607-597 subtask-2 result]
#   status  : <status>
#   PASS    : <pass>
#   FAIL    : <fail>
#   executed: <YYYY-MM-DD>
#   <SKIP: ...>  | <OK: subtask-3 実行可>
#
# Side effects:
#   On PASS only, writes a one-line summary to /tmp/607-597-subtask-2-result.txt.
#   No repo files are modified.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

READER=scripts/read-subtask2-result.sh
GATE_FILE=/tmp/607-597-subtask-2-result.txt

# Capture subtask-1 reader output. Missing or failing reader → empty (defaults apply).
if [[ -x "$READER" ]] || [[ -f "$READER" ]]; then
  reader_out=$(bash "$READER" 2>/dev/null || true)
else
  reader_out=""
fi

extract() {
  # extract <key> — print value of the first key=value line for <key>, or empty.
  printf '%s\n' "$reader_out" | awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print; exit}'
}

status=$(extract status)
pass=$(extract pass)
fail=$(extract fail)
executed=$(extract executed)

# Defaults — keep semantics identical to "report not found" (subtask-1 contract).
status=${status:-unknown}
pass=${pass:-0}
fail=${fail:-0}
executed=${executed:-$(date +%Y-%m-%d)}

echo "[607-597 subtask-2 result]"
echo "status  : ${status}"
echo "PASS    : ${pass}"
echo "FAIL    : ${fail}"
echo "executed: ${executed}"

# Gate: SKIP when fail>0, status=blocked, or status=unknown.
fail_positive=false
if [[ "$fail" =~ ^[0-9]+$ ]] && (( fail > 0 )); then
  fail_positive=true
fi

if $fail_positive || [[ "$status" == "blocked" ]] || [[ "$status" == "unknown" ]]; then
  echo "SKIP: subtask-3 は実行しない"
  exit 0
fi

# PASS branch: status=done && fail=0 → record one-line summary for subtask-3.
printf 'status=done pass=%s fail=0 executed=%s\n' "$pass" "$executed" > "$GATE_FILE"
echo "OK: subtask-3 実行可"
exit 0
