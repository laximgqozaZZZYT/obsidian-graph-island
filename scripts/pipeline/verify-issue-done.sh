#!/usr/bin/env bash
# verify-issue-done.sh — Verify that file paths mentioned in an issue's
# "Acceptance criteria" section actually exist in the git index (main HEAD).
#
# Usage: bash scripts/pipeline/verify-issue-done.sh <issue-file>
#
# Behavior:
#   1. Extract the "## Acceptance criteria" section from the issue file.
#   2. Collect backtick-quoted tokens that look like relative file paths
#      (prefixed with known repo dirs: scripts/, src/, tests/, e2e/, ...).
#   3. For each path, run `git ls-files --error-unmatch` to verify it is
#      tracked in the repository.
#   4. Print "MISSING: <path>" to stderr for any missing path and exit 1.
#   5. Exit 0 if all referenced paths are present (or if none are found).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue-id>" >&2
  exit 2
fi

# Argument is an issue id (or any path/string that strips to one via
# basename + .md removal). Body is read from descriptions/<id>.md.
PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$PROJECT_DIR" ]]; then
  echo "ERROR: not in a git repo" >&2
  exit 2
fi
ID="$(basename "$1" .md)"
ISSUE_FILE="$PROJECT_DIR/scripts/pipeline/descriptions/${ID}.md"
if [[ ! -f "$ISSUE_FILE" ]]; then
  echo "Description file not found: $ISSUE_FILE" >&2
  exit 2
fi

cd "$PROJECT_DIR"

# Extract Acceptance criteria section: from "## Acceptance criteria" header
# up to (but not including) the next "## " header or EOF.
section="$(awk '
  /^## Acceptance criteria/ { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$ISSUE_FILE")"

if [[ -z "$section" ]]; then
  # No Acceptance criteria section — nothing to verify.
  exit 0
fi

# Collect backtick-quoted file paths. A "file path" here is a token that:
#   - is enclosed in single backticks
#   - starts with a known repository directory prefix
#   - contains only path-safe characters
path_prefix_re='^(scripts|src|tests|e2e|docs|styles|samples|public|\.github)/[A-Za-z0-9._/-]+$'

mapfile -t paths < <(
  printf '%s\n' "$section" \
    | grep -oE '`[^`]+`' \
    | sed -e 's/^`//' -e 's/`$//' \
    | grep -E "$path_prefix_re" \
    | sort -u
) || true

missing=0
for p in "${paths[@]}"; do
  if ! git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
    echo "MISSING: $p" >&2
    missing=1
  fi
done

# Diff-aware check: the EXISTENCE check above passes for MODIFY-only tasks
# even when the task's iter produced zero edits to <path>. Locate the most
# recent "chore: start task <ID>" commit on this branch and require that at
# least one acceptance-criteria path was actually touched in commits since.
# Skipped if no start commit is found (issue may pre-date the convention).
if [[ "$missing" -eq 0 && ${#paths[@]} -gt 0 ]]; then
  start_sha=$(git log --grep="^chore: start task ${ID}\$" -n 1 --format=%H 2>/dev/null || true)
  if [[ -z "$start_sha" ]]; then
    start_sha=$(git log --grep="^chore: start ${ID}\$" -n 1 --format=%H 2>/dev/null || true)
  fi
  if [[ -n "$start_sha" ]]; then
    touched=$(git log "${start_sha}..HEAD" --name-only --pretty=format: -- "${paths[@]}" 2>/dev/null | grep -v '^$' | head -1 || true)
    if [[ -z "$touched" ]]; then
      echo "UNTOUCHED: no commit since $start_sha touched any of: ${paths[*]}" >&2
      missing=1
    fi
  fi
fi

exit "$missing"
