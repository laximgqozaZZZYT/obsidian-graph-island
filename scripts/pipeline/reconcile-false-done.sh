#!/usr/bin/env bash
# ============================================================
# reconcile-false-done.sh — Move falsely-completed issues back to pending
# ============================================================
# Scans issues/done/*.md, runs verify-issue-done.sh on each,
# and moves failures back to issues/ with status: pending.
#
# Usage:
#   bash scripts/pipeline/reconcile-false-done.sh            # live run
#   bash scripts/pipeline/reconcile-false-done.sh --dry-run   # preview only
#
# Manual use only — not intended for cron.
# ============================================================
set -uo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
DONE_DIR="$ISSUE_DIR/done"
VERIFY_SCRIPT="$SCRIPT_DIR/verify-issue-done.sh"

# CSV migration feature flag (Phase 2-D). In CSV mode, reconcile flips
# the status column instead of git-mving md files between dirs.
USE_CSV=${USE_CSV:-false}
if [[ "$USE_CSV" == "true" ]]; then
  # shellcheck source=/dev/null
  . "$SCRIPT_DIR/csv-helpers.sh"
fi

cd "$PROJECT_DIR" || exit 1

if [[ "$USE_CSV" != "true" && ! -d "$DONE_DIR" ]]; then
  echo "No done directory: $DONE_DIR" >&2
  exit 0
fi

if [[ ! -x "$VERIFY_SCRIPT" ]] && [[ ! -f "$VERIFY_SCRIPT" ]]; then
  echo "verify-issue-done.sh not found: $VERIFY_SCRIPT" >&2
  exit 1
fi

moved=0
checked=0

if [[ "$USE_CSV" == "true" ]]; then
  for ID in $(csv_select_by_status issues done 2>/dev/null); do
    checked=$((checked + 1))
    missing_output=""
    if ! missing_output="$(USE_CSV=true bash "$VERIFY_SCRIPT" "$ID" 2>&1)"; then
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "RECONCILE [dry-run]: $ID would flip back to pending (missing: $missing_output)"
      else
        csv_set_status issues "$ID" pending 2>/dev/null || true
        echo "RECONCILE: $ID flipped back to pending (missing: $missing_output) [csv]"
      fi
      moved=$((moved + 1))
    fi
  done
else
  for issue in "$DONE_DIR"/*.md; do
    # Handle glob with no matches
    [[ -f "$issue" ]] || continue

    checked=$((checked + 1))
    basename_issue="$(basename "$issue")"

    # Capture missing-file output from verify-issue-done.sh
    missing_output=""
    if ! missing_output="$(bash "$VERIFY_SCRIPT" "$issue" 2>&1)"; then
      # Verification failed — this issue should not be in done/
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "RECONCILE [dry-run]: $basename_issue would move back to pending (missing: $missing_output)"
      else
        git mv "$issue" "$ISSUE_DIR/$basename_issue"
        # Replace status: done with status: pending in frontmatter
        sed -i 's/^status: done$/status: pending/' "$ISSUE_DIR/$basename_issue"
        echo "RECONCILE: $basename_issue moved back to pending (missing: $missing_output)"
      fi
      moved=$((moved + 1))
    fi
  done
fi

echo "Checked $checked issues, $moved need reconciliation."
