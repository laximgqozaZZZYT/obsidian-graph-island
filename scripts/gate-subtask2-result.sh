#!/usr/bin/env bash
# gate-subtask2-result.sh — Gate subtask-3 execution based on subtask-2 verify result.
#
# Scope: the "607-597" prefix in GATE_FILE and stdout header is a cross-task
# contract fixed by scripts/pipeline/tasks/710-684-skip-pass.md — downstream
# subtask-3 reads that exact path. Do not generalize without updating the spec.
#
# Reads key=value output from scripts/read-subtask2-result.sh, prints a summary,
# and decides whether subtask-3 may run. Always exits 0 so the outer pipeline
# is never broken; downstream steps must check stdout / the gate file.

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

# PASS branch: rm -f defuses any pre-existing symlink at GATE_FILE before write.
rm -f -- "$GATE_FILE"
printf 'status=done pass=%s fail=0 executed=%s\n' "$pass" "$executed" > "$GATE_FILE"
echo "OK: subtask-3 実行可"
exit 0
