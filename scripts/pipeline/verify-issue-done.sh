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
  echo "Usage: $0 <issue-file>" >&2
  exit 2
fi

ISSUE_FILE="$1"
if [[ ! -f "$ISSUE_FILE" ]]; then
  echo "Issue file not found: $ISSUE_FILE" >&2
  exit 2
fi

# Resolve absolute path before chdir so relative args keep working.
ISSUE_FILE="$(cd "$(dirname "$ISSUE_FILE")" && pwd)/$(basename "$ISSUE_FILE")"

cd "$(git rev-parse --show-toplevel)"

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

exit "$missing"
