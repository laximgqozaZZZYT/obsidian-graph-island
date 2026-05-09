#!/usr/bin/env bash
# acknowledge-alert.sh — Operator helper to acknowledge resolved pipeline alerts.
# Pipeline writes alerts to issues.csv via csv_file_alert (csv-helpers.sh)
# but never closes them automatically — that's the operator's call after
# fixing the underlying issue.
#
# Usage:
#   ./acknowledge-alert.sh --list                    # show open alerts
#   ./acknowledge-alert.sh --ack <id-or-slug>        # ack one
#   ./acknowledge-alert.sh --ack-all [--yes]         # ack all with confirmation
set -uo pipefail

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
ISSUES_CSV="$PROJECT_DIR/scripts/pipeline/issues.csv"
cd "$PROJECT_DIR" || exit 1

# Source csv-helpers for csv_atomic_set_status
# shellcheck source=/dev/null
. "$PROJECT_DIR/scripts/pipeline/csv-helpers.sh"

MODE="--list"
TARGET=""
SKIP_CONFIRM=0

case "${1:-}" in
  --list|"") MODE="--list" ;;
  --ack)
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 --ack <id-or-slug>" >&2
      exit 2
    fi
    MODE="--ack"
    TARGET="$2"
    ;;
  --ack-all)
    MODE="--ack-all"
    [[ "${2:-}" == "--yes" ]] && SKIP_CONFIRM=1
    ;;
  -h|--help)
    sed -n '2,12p' "$0"; exit 0
    ;;
  *)
    echo "Unknown arg: $1" >&2
    echo "Usage: $0 --list | --ack <id> | --ack-all [--yes]" >&2
    exit 2
    ;;
esac

# Get open alerts (pending/in-progress + source=alert OR priority=critical)
list_open_alerts() {
  ISSUES_CSV="$ISSUES_CSV" python3 - <<'PY'
import csv, os
path = os.environ['ISSUES_CSV']
with open(path) as f:
    rows = list(csv.DictReader(f))
for r in rows:
    if r.get('status') in ('pending', 'in-progress', 'in_progress', 'decomposed'):
        if r.get('source') == 'alert' or r.get('priority') == 'critical':
            age_str = r.get('reported', 'unknown')
            print(f"  {r['id']}\t[{age_str}]\t{r.get('priority','?')}\t{r.get('summary','')[:60]}")
PY
}

case "$MODE" in
  --list)
    echo "## Open pipeline alerts ($(date -Iseconds))"
    echo ""
    out=$(list_open_alerts)
    if [[ -z "$out" ]]; then
      echo "  (no open alerts)"
    else
      echo "  ID                                              [reported]    priority  summary"
      echo "$out"
    fi
    ;;
  --ack)
    # Verify the issue exists and is open
    csv_atomic_set_status issues "$TARGET" done \
      "chore: ack alert $TARGET (operator-resolved)" 2>&1 \
      || { echo "ERROR: failed to ack $TARGET" >&2; exit 1; }
    echo "Acknowledged: $TARGET"
    ;;
  --ack-all)
    open_ids=$(ISSUES_CSV="$ISSUES_CSV" python3 - <<'PY'
import csv, os
path = os.environ['ISSUES_CSV']
with open(path) as f:
    rows = list(csv.DictReader(f))
for r in rows:
    if r.get('status') in ('pending', 'in-progress', 'in_progress', 'decomposed'):
        if r.get('source') == 'alert' or r.get('priority') == 'critical':
            print(r['id'])
PY
)
    count=$(echo "$open_ids" | grep -c . || echo 0)
    if [[ "$count" -eq 0 ]]; then
      echo "No open alerts to acknowledge."
      exit 0
    fi

    echo "Will acknowledge $count alert(s):"
    echo "$open_ids" | sed 's/^/  /'
    if [[ "$SKIP_CONFIRM" -eq 0 ]]; then
      printf "Proceed? [y/N] "
      read -r reply
      [[ "$reply" =~ ^[Yy] ]] || { echo "Cancelled."; exit 0; }
    fi

    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      csv_atomic_set_status issues "$id" done \
        "chore: ack alert $id (operator-bulk)" 2>/dev/null || \
        echo "  WARN: failed to ack $id"
      echo "  acked: $id"
    done <<< "$open_ids"
    echo "Done. Acknowledged $count alert(s)."
    ;;
esac
