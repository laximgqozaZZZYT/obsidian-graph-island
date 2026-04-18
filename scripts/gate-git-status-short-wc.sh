#!/usr/bin/env bash
# gate-git-status-short-wc.sh — subtask-2 gate of 823-811-git-status-short.
#
# Contract (authoritative: scripts/pipeline/tasks/833-823-tmp-git-status-short-txt-wc-l.md):
#   Input:
#     $1 (or env GIT_STATUS_OUTPUT) — path to the file produced by subtask-1
#                                     (default: /tmp/git-status-short.txt).
#   Stdout (key=value, stable for downstream consumption):
#     file=<path>
#     found=<0|1>           # 1 iff file exists AND is readable
#     wc_exit=<N>           # exit code of `wc -l` (only meaningful when found=1)
#     line_count=<N|->      # numeric on success, "-" when unknown
#     summary=<single-line human summary>
#   Exit:
#     0 — file readable AND wc exit 0 AND line_count is a non-negative integer.
#     1 — wc failed, output was non-numeric, or the file is missing/unreadable.
#
# Constraints from parent task:
#   - read-only; no state-changing git commands
#   - may write /tmp/ only (we emit to stdout; no /tmp/ writes here)

set -uo pipefail

FILE="${1:-${GIT_STATUS_OUTPUT:-/tmp/git-status-short.txt}}"

echo "[823-811 subtask-2 gate]"
echo "file=${FILE}"

if [[ ! -r "${FILE}" ]]; then
  echo "found=0"
  echo "wc_exit=-"
  echo "line_count=-"
  echo "summary=FAIL: ${FILE} not readable"
  exit 1
fi
echo "found=1"

# Capture wc stdout separately from its exit code so we can log the raw error
# message when wc fails (task requires "エラーメッセージをそのままログに残す").
# Use mktemp so parallel invocations (CI, cron) don't collide on a fixed path.
err_file="$(mktemp -t gate-git-status-short-wc.XXXXXX.err)"
trap 'rm -f "${err_file}"' EXIT
wc_exit=0
wc_stdout="$(wc -l -- "${FILE}" 2>"${err_file}")" || wc_exit=$?
wc_stderr="$(cat "${err_file}" 2>/dev/null || true)"

echo "wc_exit=${wc_exit}"

if (( wc_exit != 0 )); then
  echo "line_count=-"
  echo "summary=FAIL: wc -l exit=${wc_exit}: ${wc_stderr}"
  exit 1
fi

# `wc -l FILE` prints "   <count> FILE"; extract the first whitespace-separated token.
line_count="$(echo "${wc_stdout}" | awk '{print $1}')"
if ! [[ "${line_count}" =~ ^[0-9]+$ ]]; then
  echo "line_count=-"
  echo "summary=FAIL: wc output not numeric: '${wc_stdout}'"
  exit 1
fi

echo "line_count=${line_count}"
echo "summary=OK: ${FILE} readable (${line_count} lines)"
exit 0
