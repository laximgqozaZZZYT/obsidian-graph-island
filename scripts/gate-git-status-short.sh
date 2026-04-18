#!/usr/bin/env bash
# gate-git-status-short.sh — Gate downstream execution based on the exit code
# of subtask-1 of parent task 769-760-git-status-short (git status --short).
#
# Contract (authoritative: scripts/pipeline/tasks/804-769-.md):
#   Input:
#     $1 (or env GIT_STATUS_EXIT)   — subtask-1 exit code (integer, required)
#     $2 (or env GIT_STATUS_OUTPUT) — path to subtask-1 combined stdout/stderr
#                                     output file (default: /tmp/git-status-short.txt).
#                                     Only read on failure.
#   Stdout:
#     Header "[769-760 subtask-1 gate]" plus diagnostic lines. On failure the
#     captured output is echoed under a "stderr:" prefix so the reporter can
#     distinguish gate messages from subtask-1 output.
#   Exit:
#     0 — subtask-1 exit==0; downstream may proceed.
#     1 — subtask-1 exit!=0, OR inputs missing/invalid (fail-closed; gate must
#         not let a malformed invocation masquerade as success).
#
# Note: unlike scripts/gate-subtask2-result.sh (which always exits 0 to keep the
# outer pipeline running), this gate is specified to exit 1 on failure so the
# caller halts immediately — downstream subtask-2 logic assumes a clean stdout.

set -uo pipefail

EXIT_CODE="${1:-${GIT_STATUS_EXIT:-}}"
OUTPUT_FILE="${2:-${GIT_STATUS_OUTPUT:-/tmp/git-status-short.txt}}"

echo "[769-760 subtask-1 gate]"

if [[ -z "${EXIT_CODE}" ]]; then
  echo "FAIL: exit code not provided (pass as \$1 or env GIT_STATUS_EXIT)"
  exit 1
fi

if ! [[ "${EXIT_CODE}" =~ ^-?[0-9]+$ ]]; then
  echo "FAIL: exit code is not an integer: '${EXIT_CODE}'"
  exit 1
fi

echo "subtask-1 exit: ${EXIT_CODE}"
echo "output file   : ${OUTPUT_FILE}"

if (( EXIT_CODE != 0 )); then
  echo "FAIL: subtask-1 (git status --short) failed (exit=${EXIT_CODE})"
  if [[ -r "${OUTPUT_FILE}" ]]; then
    echo "stderr:"
    # subtask-1 uses `> FILE 2>&1`, so stdout and stderr are merged here.
    sed 's/^/  /' -- "${OUTPUT_FILE}"
  else
    echo "stderr: (output file not readable: ${OUTPUT_FILE})"
  fi
  exit 1
fi

echo "OK: subtask-1 succeeded; downstream may proceed"
exit 0
