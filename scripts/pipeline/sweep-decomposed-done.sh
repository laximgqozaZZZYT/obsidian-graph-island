#!/usr/bin/env bash
# ============================================================
# sweep-decomposed-done.sh — Recursive parent rollup for tasks.csv
# ============================================================
# The autonomous-improve.sh parent rollup only checks IMMEDIATE siblings
# when a task completes. Multi-level decompose chains (issue → task A →
# task A1 → task A1a) leave the intermediate `decomposed` tasks as
# permanent middle-nodes even after every leaf completes.
#
# This sweep walks tasks.csv repeatedly until fixed-point: any
# `decomposed` task whose direct children are all in a TERMINAL state
# (done / cancelled / blocked / superseded / undecomposable) is itself
# flipped to `done`. The sweep iterates until no flips happen.
#
# Usage:
#   bash scripts/pipeline/sweep-decomposed-done.sh --dry-run    # preview
#   bash scripts/pipeline/sweep-decomposed-done.sh --apply      # mutate
# ============================================================
set -uo pipefail

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --apply)   DRY_RUN=0 ;;
  *)
    echo "Usage: $0 --dry-run | --apply" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/csv-helpers.sh"

cd "$PROJECT_DIR" || exit 1

# Terminal child statuses — when EVERY direct child of a decomposed task
# is in this set, the task itself can be rolled up to `done`.
TERMINAL_STATUSES_RE='^(done|cancelled|blocked|superseded|undecomposable)$'

iteration=0
total_flipped=0

while :; do
  iteration=$((iteration + 1))
  flipped_this_round=0

  # All currently-decomposed tasks
  for ID in $(csv_select_by_status tasks decomposed 2>/dev/null); do
    # Direct children (parent == this id, in tasks)
    children=$(csv_select_by_parent tasks "$ID" 2>/dev/null)
    [[ -z "$children" ]] && continue   # no children → orphan decomposed, leave alone

    all_terminal=1
    for CHILD in $children; do
      st=$(csv_get_status tasks "$CHILD" 2>/dev/null)
      if ! [[ "$st" =~ $TERMINAL_STATUSES_RE ]]; then
        all_terminal=0
        break
      fi
    done

    if [[ "$all_terminal" -eq 1 ]]; then
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "ROLLUP [dry-run]: $ID would flip decomposed → done (all $(echo $children | wc -w) children terminal)"
      else
        csv_set_status tasks "$ID" done 2>/dev/null || continue
        echo "ROLLUP: $ID → done (all $(echo $children | wc -w) children terminal)"
      fi
      flipped_this_round=$((flipped_this_round + 1))
    fi
  done

  total_flipped=$((total_flipped + flipped_this_round))
  echo "  iteration $iteration: $flipped_this_round flips"
  [[ "$flipped_this_round" -eq 0 ]] && break
  [[ "$iteration" -ge 20 ]] && { echo "WARN: sweep iteration cap (20) hit; aborting" >&2; break; }
done

echo ""
echo "Sweep complete. Total flipped: $total_flipped"
echo "Remaining decomposed tasks: $(csv_select_by_status tasks decomposed 2>/dev/null | wc -l)"

if [[ "$DRY_RUN" -eq 0 && "$total_flipped" -gt 0 ]]; then
  echo ""
  echo "Validating tasks.csv..."
  python3 "$SCRIPT_DIR/csv_lib.py" validate tasks 2>&1 | head -5
fi
