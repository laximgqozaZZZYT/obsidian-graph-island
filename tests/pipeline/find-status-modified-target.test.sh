#!/usr/bin/env bash
# Unit tests for scripts/pipeline/find-status-modified-target.sh
#
# # SKIP: SUT permanently removed.
#
# This test was authored against `scripts/pipeline/find-status-modified-target.sh`,
# a helper that scanned `git status --porcelain docs/issues/` for ` M `
# (worktree-modified-only) lines and emitted the first match as
# `TARGET_FILE=<path>` on stdout.
#
# That helper — together with classify-git-status.sh, verify-status-only-diff.sh,
# and report-status-diff-failure.sh — was deleted in commit 5c94aaed
# ("feat(pipeline): Phase 3 — flip USE_CSV=true default + drop legacy",
# 2026-04-25) as part of the md → CSV state-store migration. The CSV
# pipeline tracks `status` as a column on tasks.csv / issues.csv rows;
# the whole concept of "diff touched only the status: line of an md
# frontmatter" no longer exists, so there is nothing left to verify.
#
# Per the repair brief (constraint: "テストファイル本体のみ編集可" — SUT
# must not be re-created), the only honest repair is to retire all 10
# cases. Each case asserts behaviour of a script that the codebase
# deliberately decided to no longer have. The fixtures under
# tests/pipeline/fixtures/git-status/case*.txt are kept in place — they
# are read-only inputs and removing them is out of scope for a test-file
# edit.
#
# # SKIP: case1  — ' M target' → TARGET_FILE=docs/issues/target.md
# # SKIP: case2  — 'M  target' (index-only) ignored
# # SKIP: case3  — empty input → empty stdout
# # SKIP: case4  — target + untracked '??' → emit only target
# # SKIP: case5  — 'MM target' (both index+worktree) ignored
# # SKIP: case6  — no ' M' lines → skip
# # SKIP: case7  — multiple ' M' candidates → first one
# # SKIP: case8  — stdin via "-" argument
# # SKIP: case9  — bad file path → exit 2
# # SKIP: case10 — mixed-status fixture → only ' M' line wins
#
# When/if a successor verifier emerges, replace this stub with cases
# scoped to that successor's contract. Until then, this script is a
# documented no-op so that scripts/run-pipeline-tests.sh --full can
# treat the entry as green instead of perpetually red.
set -uo pipefail

echo "SKIP: find-status-modified-target.sh was removed in 5c94aaed (md→CSV migration); no SUT to test."
echo ""
echo "Results: 0 passed, 0 failed (all cases skipped — see header comment)"
exit 0
