#!/usr/bin/env bash
# cron-health.sh — Watchdog for 7 cron scripts.
# Reads /tmp/graph-island-*.log mtime, compares to expected cron interval.
# stale = log not updated for > 2× the expected interval.
# Exit codes:
#   0 = all 7 healthy
#   1 = at least one stale or missing
set -uo pipefail

now=$(date +%s)

declare -A CRONS=(
  ["autonomous-improve"]="/tmp/graph-island-improve.log:3600"
  ["e2e-patrol"]="/tmp/graph-island-e2e.log:3600"
  ["progress-report"]="/tmp/graph-island-progress-cron.log:1800"
  ["auto-merge-pr"]="/tmp/graph-island-auto-merge.log:1800"
  ["auto-stale-pr-close"]="/tmp/graph-island-stale-pr.log:21600"
  ["proposal-scorer"]="/tmp/graph-island-proposal-scorer.log:21600"
  ["feature-proposer"]="/tmp/graph-island-feature-proposer.log:604800"
)

healthy=0
stale=0

format_age() {
  local secs="$1"
  if [[ "$secs" -lt 60 ]]; then
    echo "${secs}s ago"
  elif [[ "$secs" -lt 3600 ]]; then
    echo "$((secs/60))min ago"
  elif [[ "$secs" -lt 86400 ]]; then
    echo "$((secs/3600))h ago"
  else
    echo "$((secs/86400))d ago"
  fi
}

format_interval() {
  local secs="$1"
  if [[ "$secs" -lt 3600 ]]; then
    echo "$((secs/60))min"
  elif [[ "$secs" -lt 86400 ]]; then
    echo "$((secs/3600))h"
  else
    echo "$((secs/86400))d"
  fi
}

echo "## Cron Health ($(date -Iseconds))"
echo ""
printf "| %-26s | %-16s | %-8s | %-7s |\n" "Cron" "Last Run" "Expected" "Status"
printf "|%s|%s|%s|%s|\n" \
  "----------------------------" \
  "------------------" \
  "----------" \
  "---------"

# Iterate in stable order matching crontab definition
for name in autonomous-improve e2e-patrol progress-report auto-merge-pr auto-stale-pr-close proposal-scorer feature-proposer; do
  val="${CRONS[$name]}"
  log_path="${val%:*}"
  interval="${val##*:}"
  threshold=$((interval * 2))

  if [[ ! -f "$log_path" ]]; then
    age_str="never"
    status="MISSING"
    stale=$((stale + 1))
  else
    mtime=$(stat -c %Y "$log_path" 2>/dev/null || echo 0)
    age=$((now - mtime))
    age_str=$(format_age "$age")
    if [[ "$age" -gt "$threshold" ]]; then
      status="STALE"
      stale=$((stale + 1))
    else
      status="OK"
      healthy=$((healthy + 1))
    fi
  fi
  expected_str=$(format_interval "$interval")
  printf "| %-26s | %-16s | %-8s | %-7s |\n" "$name" "$age_str" "$expected_str" "$status"
done

echo ""
echo "Healthy: $healthy/7"
if [[ "$stale" -gt 0 ]]; then
  exit 1
fi
exit 0
