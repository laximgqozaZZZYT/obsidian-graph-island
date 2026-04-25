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
VERIFY_SCRIPT="$SCRIPT_DIR/verify-issue-done.sh"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/csv-helpers.sh"

cd "$PROJECT_DIR" || exit 1

if [[ ! -x "$VERIFY_SCRIPT" ]] && [[ ! -f "$VERIFY_SCRIPT" ]]; then
  echo "verify-issue-done.sh not found: $VERIFY_SCRIPT" >&2
  exit 1
fi

moved=0
checked=0

for ID in $(csv_select_by_status issues done 2>/dev/null); do
  checked=$((checked + 1))
  missing_output=""
  if ! missing_output="$(bash "$VERIFY_SCRIPT" "$ID" 2>&1)"; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "RECONCILE [dry-run]: $ID would flip back to pending (missing: $missing_output)"
    else
      csv_set_status issues "$ID" pending 2>/dev/null || true
      echo "RECONCILE: $ID flipped back to pending (missing: $missing_output)"
    fi
    moved=$((moved + 1))
  fi
done

echo "Checked $checked issues, $moved need reconciliation."
