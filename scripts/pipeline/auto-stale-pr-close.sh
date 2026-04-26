#!/usr/bin/env bash
# ============================================================
# auto-stale-pr-close.sh — Auto-stale aging auto-improve-* PRs
# ============================================================
# Phase H1 confirmed autonomous-improve.sh recovers ~92% commit-rate.
# Each successful cycle creates a PR — extrapolating to ~70 PRs/24h.
# Without intervention these accumulate as un-reviewed noise.
#
# Policy
#   - Only touches PRs whose head ref starts with "auto-improve-" so
#     we never disturb human PRs or stacked Phase PRs.
#   - When a PR is older than $STALE_HOURS (default 24h) and still
#     OPEN, mark it as a draft. This signals "no longer fresh" to
#     reviewers WITHOUT closing — the work is preserved, the merge
#     decision still rests with a human.
#   - When a PR is older than $CLOSE_DAYS (default 30d), close it
#     entirely and delete its branch on origin.
#
# Usage
#   ./auto-stale-pr-close.sh --dry-run   # list candidates, no action
#   ./auto-stale-pr-close.sh --apply     # actually mark draft / close
#
# Suggested cron (USER decides when to enable):
#   0 */6 * * * /home/ubuntu/obsidian-plugins/obsidian-graph-island/scripts/pipeline/auto-stale-pr-close.sh --apply >> /tmp/graph-island-stale-pr.log 2>&1
# ============================================================
set -uo pipefail

case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --apply)   DRY_RUN=0 ;;
  *)
    echo "Usage: $0 --dry-run | --apply" >&2
    exit 2
    ;;
esac

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
STALE_HOURS="${STALE_HOURS:-24}"
CLOSE_DAYS="${CLOSE_DAYS:-30}"

cd "$PROJECT_DIR" || exit 1

NOW_EPOCH=$(date +%s)
STALE_EPOCH=$(( NOW_EPOCH - STALE_HOURS * 3600 ))
CLOSE_EPOCH=$(( NOW_EPOCH - CLOSE_DAYS * 86400 ))

echo "=== auto-stale-pr-close ($(date -Iseconds)) ==="
echo "STALE threshold: ${STALE_HOURS}h  (mark draft)"
echo "CLOSE threshold: ${CLOSE_DAYS}d  (close + delete branch)"
echo "Mode: $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo ""

# `gh pr list --json` returns an isDraft field; we only need to flip
# OPEN non-draft PRs to draft.  Fetch up to 100 to cover bursty
# accumulation.
gh pr list --state open --limit 100 \
  --json number,headRefName,title,createdAt,isDraft \
  > /tmp/auto-stale-prs.json 2>/dev/null

stale_count=0
close_count=0

# Pre-collect candidates via mapfile to avoid the bash pipe-subshell
# stdout-trap (same kind of bug Phase H1 fixed for ratchet-drift-monitor).
mapfile -t candidates < <(python3 - "$STALE_EPOCH" "$CLOSE_EPOCH" /tmp/auto-stale-prs.json <<'PY'
import json, sys
from datetime import datetime, timezone

stale_epoch = int(sys.argv[1])
close_epoch = int(sys.argv[2])
json_path   = sys.argv[3]

with open(json_path) as f:
    prs = json.load(f)

for p in prs:
    head = p.get("headRefName", "")
    if not head.startswith("auto-improve-"):
        continue
    ca = datetime.fromisoformat(p["createdAt"].replace("Z", "+00:00"))
    ca_epoch = int(ca.timestamp())
    age_h = (int(datetime.now(timezone.utc).timestamp()) - ca_epoch) // 3600
    if ca_epoch < close_epoch:
        print(f"CLOSE|{p['number']}|{head}|{p['title'][:60]}|{age_h}")
    elif ca_epoch < stale_epoch and not p.get("isDraft", False):
        print(f"DRAFT|{p['number']}|{head}|{p['title'][:60]}|{age_h}")
PY
)

for line in "${candidates[@]}"; do
  [[ -z "$line" ]] && continue
  IFS='|' read -r action num branch title age_h <<< "$line"
  case "$action" in
    DRAFT)
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] DRAFT  #${num} (${age_h}h old)  ${title}"
      else
        gh pr ready --undo "$num" 2>&1 | tail -1
        echo "  DRAFT  #${num} (${age_h}h)  ${title}"
      fi
      stale_count=$((stale_count + 1))
      ;;
    CLOSE)
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "  [dry-run] CLOSE  #${num} (${age_h}h old)  ${title}"
      else
        gh pr close "$num" --delete-branch \
          --comment "auto-stale: ${age_h}h old without merge — closing per pipeline policy (CLOSE_DAYS=${CLOSE_DAYS})" \
          2>&1 | tail -1
        echo "  CLOSE  #${num} (${age_h}h)  ${title}"
      fi
      close_count=$((close_count + 1))
      ;;
  esac
done

echo ""
echo "Done. (stale=$stale_count, close=$close_count)"
rm -f /tmp/auto-stale-prs.json
