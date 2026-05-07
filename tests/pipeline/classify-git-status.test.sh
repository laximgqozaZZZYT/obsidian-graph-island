#!/usr/bin/env bash
# Unit tests for scripts/pipeline/classify-git-status.sh
#
# SKIP: SUT permanently removed.
#   The script `scripts/pipeline/classify-git-status.sh` was deleted in commit
#   5c94aaed ("feat(pipeline): Phase 3 — flip USE_CSV=true default + drop
#   legacy"), 2026-04-25. That commit retired the md→CSV migration's auxiliary
#   tools (find-status-modified-target.sh, classify-git-status.sh,
#   verify-status-only-diff.sh, report-status-diff-failure.sh) because CSV
#   mode replaces the concept entirely (status is a column, diffs are
#   row-level — there is no longer a `status:` frontmatter line to classify).
#
#   The contract these 10 cases verified (expected_found / unexpected_files /
#   warning= keys) no longer exists in the codebase. The fixtures under
#   tests/pipeline/fixtures/git-status/ are kept because the sibling
#   handoff-git-status-short.test.sh / gate-git-status-short-wc.test.sh suites
#   still consume them via emit-git-status-short.mjs +
#   format-git-status-short.mjs (the JSON-shaped successor pipeline).
#
#   This file is preserved as a SKIP marker rather than being deleted so the
#   reason for the gap is discoverable in-tree (rather than only via git log)
#   and so the historical case list survives for whoever revisits the
#   git-status classification feature next.
#
#   Restoration path (if the feature returns):
#     1. Recreate scripts/pipeline/classify-git-status.sh (see git show
#        5c94aaed^:scripts/pipeline/classify-git-status.sh for the prior
#        implementation).
#     2. Restore the case bodies from git history of this file (commit before
#        the SKIP conversion) — fixtures are still on disk.
#     3. Drop this skip block.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUT="$REPO_ROOT/scripts/pipeline/classify-git-status.sh"

if [[ ! -f "$SUT" ]]; then
  echo "SKIP: classify-git-status.sh removed in Phase 3 (md→CSV migration, commit 5c94aaed)."
  echo "      All 10 historical cases (case1..case10) skipped — see file header for details."
  echo ""
  echo "Results: 0 passed, 0 failed (10 skipped)"
  exit 0
fi

# Defensive: if the SUT is ever restored, fail loudly so a maintainer
# re-hydrates the case bodies from git history rather than silently passing.
echo "FAIL: SUT was restored at $SUT but this test file is still in SKIP mode."
echo "      Re-hydrate the historical cases from git history (see file header)."
exit 1
