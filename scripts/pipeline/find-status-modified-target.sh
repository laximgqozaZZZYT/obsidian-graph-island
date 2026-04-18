#!/usr/bin/env bash
# find-status-modified-target.sh — Identify the first `docs/issues/*.md`
# candidate whose only change is a worktree-side modification.
#
# Purpose (pipeline subtask 792-763): scan `git status --porcelain docs/issues/`
# for lines beginning with " M " (worktree-modified, index-clean) and emit
# the first matching path on stdout so the next pipeline step (793) can
# format it as `TARGET_FILE=<path>` and step (794) can run `git diff` on it.
#
# Contract:
#   - Lines not starting with " M " (untracked "??", staged "M ", renames
#     "R ", deletes " D", etc.) are ignored by design — this step is for
#     the *status-line-only* verification pipeline.
#   - If no candidate exists, stdout is empty and exit code is 0 ("skip",
#     not failure). Callers detect the skip by testing `[[ -z "$target" ]]`.
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

# Pick the first " M <path>" line (worktree-only modification). awk's `exit`
# stops scanning after the first hit so multi-candidate input still yields
# exactly one path — matching the task requirement "最初の1件を対象とする".
target="$(printf '%s\n' "$input" | awk '/^ M / { print $2; exit }')"

if [[ -n "$target" ]]; then
  printf '%s\n' "$target"
fi
exit 0
