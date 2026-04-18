#!/usr/bin/env bash
# handoff-git-status-short.sh — subtask-2 of parent 804-769-.
#
# Contract (authoritative: scripts/pipeline/tasks/813-804-subtask.md,
# 815-804-subtask.md):
#   Input:
#     $1 (omitted or "-")  — read from stdin
#     $1 = <path>          — read from file
#   Stdout:
#     Exact bytes from input (byte-for-byte passthrough). No trim, no normalize
#     — git status --short's blank status columns and trailing empty lines must
#     reach the downstream classify step intact.
#   Stderr (diagnostic only — downstream must not parse these lines):
#     [804-769 handoff]
#     lines=<N>            # line record count (awk END{NR}; last line counted
#                          # even without trailing newline)
#     head_3:
#       <line 1>           # two-space indent so blank input lines stay visible
#       <line 2>
#       <line 3>
#   Exit:
#     0 — passthrough succeeded (including empty input).
#     1 — input file given but not readable.
#
# Constraints (CLAUDE.md + parent task):
#   - shell-only; never touch src/ TypeScript (God Object budget untouched).
#   - read-only; never run git mv / git add / git commit / git reset.
#   - preserve exact bytes — reason: git status --short's XY columns encode
#     state in leading whitespace, and `$(cat)` / trim() would collapse the
#     first column silently.

set -uo pipefail

SRC="${1:-}"
TMP=""
cleanup() { [[ -n "$TMP" ]] && rm -f -- "$TMP"; }
trap cleanup EXIT

if [[ -z "$SRC" || "$SRC" == "-" ]]; then
  # Buffer stdin so we can both inspect (lines / head) and passthrough without
  # re-reading a non-seekable stream. Bash $(…) strips trailing \n, so the
  # temp-file route is the only byte-preserving option.
  TMP="$(mktemp -t handoff-git-status-short.XXXXXX)"
  cat >"$TMP"
  SRC="$TMP"
elif [[ ! -r "$SRC" ]]; then
  echo "FAIL: input not readable: $SRC" >&2
  exit 1
fi

# awk NR counts the last record even when the file has no trailing newline —
# matches "line list" semantics from the parent task better than `wc -l`.
# Read via stdin redirection because awk does not support `--` for filenames
# (portable across gawk/mawk/bsd awk) — safe here since $SRC is already a
# readable regular file (verified above) or the mktemp'd buffer.
lines="$(awk 'END { print NR + 0 }' <"$SRC")"

{
  echo "[804-769 handoff]"
  echo "lines=${lines}"
  echo "head_3:"
  # sed indent keeps empty input lines visible in the log (bare blank lines
  # are indistinguishable from log separators otherwise).
  head -n 3 -- "$SRC" | sed 's/^/  /'
} >&2

# Final step: byte-exact passthrough. `cat --` tolerates filenames starting
# with '-'; redirection via < would also work but loses that safety.
cat -- "$SRC"
