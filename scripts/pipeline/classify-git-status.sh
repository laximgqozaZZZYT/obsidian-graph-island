#!/usr/bin/env bash
# classify-git-status.sh — Classify `git status --short` output lines.
#
# Purpose (pipeline subtask 770-760): given the short status output and the
# file the preceding Edit step was supposed to touch, decide whether
#   - the target file shows up as exactly " M" or "M " (modified only, on
#     either worktree or index, but not both and not anything weirder),
#   - any OTHER file has a change mark (M / A / D / R / ??), meaning the
#     Edit may have leaked outside its intended scope. Rename (R) uses the
#     post-rename path.
# Emits a key=value classification plus human warnings so the next pipeline
# step (subtask-3) can decide gating without re-parsing the raw status.
#
# Assumes ASCII-safe paths (no quoted `"..."` entries from git status).
# Fine for the current pipeline scope (`docs/issues/*.md`); callers with
# spaces/non-ASCII in paths should prefer `git status --porcelain -z`.
#
# Usage:
#   bash scripts/pipeline/classify-git-status.sh <target> [<status-file>]
#
# <status-file>:
#   - omitted or "-"  : read `git status --short` lines from stdin
#   - path            : read lines from that file
#
# stdout (key=value, one per line — stable contract for subtask-3):
#   target=<target>
#   expected_found=<0|1>
#   unexpected_count=<N>
#   unexpected_files=<csv or empty>
#   warning=<message>          (0..2 lines)
#
# exit codes:
#   0 = target found cleanly and no unexpected files
#   1 = warnings emitted (target missing or unexpected files)
#   2 = usage error
set -uo pipefail

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "Usage: $0 <target> [<status-file>|-]" >&2
  exit 2
fi

target="$1"
src="${2:--}"

if [[ "$src" == "-" ]]; then
  input="$(cat)"
elif [[ -f "$src" ]]; then
  input="$(cat -- "$src")"
else
  echo "status-file not found: $src" >&2
  exit 2
fi

# Parse XY + filename. Renames ("R  old -> new") use the post-rename path.
# A "change mark" is M / A / D / R / ?; any of these in X or Y makes the
# line interesting for scope-leak detection.
result="$(printf '%s\n' "$input" | awk -v target="$target" '
  function record(xy, file) {
    if (file == target) {
      if (xy == " M" || xy == "M ") {
        expected_found = 1
      } else {
        # Target appears but with an unexpected status (e.g. MM, AM, ??):
        # still a scope-leak signal.
        if (unexpected_files) unexpected_files = unexpected_files ","
        unexpected_files = unexpected_files file
        unexpected_count++
      }
      return
    }
    # Any change mark on a non-target file is unexpected scope leak.
    if (xy ~ /[MADR?]/) {
      if (unexpected_files) unexpected_files = unexpected_files ","
      unexpected_files = unexpected_files file
      unexpected_count++
    }
  }
  /^$/ { next }
  {
    xy = substr($0, 1, 2)
    rest = substr($0, 4)
    # Rename lines carry both paths: "R  old -> new" (X=R).
    if (index(xy, "R") > 0) {
      pos = index(rest, " -> ")
      if (pos > 0) rest = substr(rest, pos + 4)
    }
    record(xy, rest)
  }
  END {
    printf "target=%s\n", target
    printf "expected_found=%d\n", expected_found + 0
    printf "unexpected_count=%d\n", unexpected_count + 0
    printf "unexpected_files=%s\n", unexpected_files
    if (!expected_found) {
      printf "warning=Edit が反映されていない可能性: target=%s が \" M\"/\"M \" で見つからない\n", target
    }
    if (unexpected_count > 0) {
      printf "warning=Edit が意図しないファイルに波及した可能性: %s\n", unexpected_files
    }
  }
')"

printf '%s\n' "$result"

# Exit 1 if any warning was emitted.
if grep -q '^warning=' <<<"$result"; then
  exit 1
fi
exit 0
