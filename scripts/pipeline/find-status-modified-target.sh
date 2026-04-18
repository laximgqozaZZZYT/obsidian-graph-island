#!/usr/bin/env bash
# find-status-modified-target.sh — Identify the first `docs/issues/*.md`
# candidate whose only change is a worktree-side modification.
#
# Purpose (pipeline subtask 792-763, 793-763): scan `git status --porcelain
# docs/issues/` for lines beginning with " M " (worktree-modified,
# index-clean) and emit the first matching path on stdout in the
# machine-readable `TARGET_FILE=<path>` form so downstream pipeline steps
# (e.g. autonomous-improve.sh, step 794) can extract it with a simple
# `grep '^TARGET_FILE='` and feed it into `git diff`.
#
# Contract:
#   - Output format: `TARGET_FILE=<path>\n` on stdout, one line per path.
#     The `TARGET_FILE=` prefix distinguishes it from ad-hoc log output
#     and lets callers parse it robustly with `sed 's/^TARGET_FILE=//'`.
#   - Lines not starting with " M " (untracked "??", staged "M ", renames
#     "R ", deletes " D", etc.) are ignored by design — this step is for
#     the *status-line-only* verification pipeline.
#   - If no candidate exists, stdout is empty (no bare `TARGET_FILE=`
#     line) and exit code is 0 ("skip", not failure). Callers detect the
#     skip by testing `[[ -z "$target" ]]` on the extracted value.
#
# Usage:
#   bash scripts/pipeline/find-status-modified-target.sh [<porcelain-input>]
#
# <porcelain-input>:
#   - omitted          : run `git status --porcelain docs/issues/` internally
#   - "-"              : read porcelain lines from stdin
#   - path             : read porcelain lines from that file
#
# Exit codes:
#   0 = always on successful read (candidate found OR no candidate)
#   2 = usage error (given file path does not exist)
set -uo pipefail

src="${1:-}"

if [[ -z "$src" ]]; then
  # Default: query git directly. Failures (e.g. not in a repo) are treated
  # as "no candidates" rather than propagated, consistent with the skip
  # semantics of this step.
  input="$(git status --porcelain docs/issues/ 2>/dev/null || true)"
elif [[ "$src" == "-" ]]; then
  input="$(cat)"
elif [[ -f "$src" ]]; then
  input="$(cat -- "$src")"
else
  echo "porcelain-input not found: $src" >&2
  exit 2
fi

# Pick the first " M <path>" line (worktree-only modification). Porcelain
# format is `XY <path>` with XY fixed at 2 chars + one space, so the path
# begins at column 4 — `substr($0, 4)` preserves embedded spaces that
# `$2` would truncate. `exit` caps output to one path, matching the task
# requirement "最初の1件を対象とする".
target="$(printf '%s\n' "$input" | awk '/^ M / { print substr($0, 4); exit }')"

if [[ -n "$target" ]]; then
  # Machine-readable emission. Empty-target case suppresses the line
  # entirely so callers never see a bare `TARGET_FILE=` with no value.
  printf 'TARGET_FILE=%s\n' "$target"
fi
exit 0
