#!/usr/bin/env bash
# god-object-audit.sh — God Object line count ratchet
# Source of truth: CLAUDE.md "GOD OBJECT Policy" table. Ratchet down only.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

JSON_OUTPUT=false
[[ "${1:-}" == "--json" ]] && JSON_OUTPUT=true

FILES=()
LIMITS=()
while IFS=$'\t' read -r file limit; do
  FILES+=("$file")
  LIMITS+=("$limit")
done < <(awk '
  /^## GOD OBJECT Policy/ { inblk = 1; next }
  inblk && /^## /         { inblk = 0 }
  inblk && /^\| `[^`]+\.ts` \|/ {
    path = $0; sub(/^\| `/, "", path); sub(/`.*/, "", path)
    split($0, cols, "|")
    gsub(/^[ \t]+|[ \t]+$/, "", cols[4])
    if (cols[4] ~ /^[0-9]+$/) print path "\t" cols[4]
  }
' CLAUDE.md)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "ERROR: no GOD OBJECT entries parsed from CLAUDE.md" >&2
  exit 2
fi

OVERALL_EXIT=0
if $JSON_OUTPUT; then
  echo "{\"files\":{"
  first=true
fi

for i in "${!FILES[@]}"; do
  file=${FILES[$i]}
  limit=${LIMITS[$i]}
  [[ ! -f "$file" ]] && continue
  current=$(wc -l < "$file")
  if $JSON_OUTPUT; then
    $first && first=false || echo ","
    status="pass"; [[ $current -gt $limit ]] && status="fail" && OVERALL_EXIT=1
    printf '"%s":{"current":%d,"limit":%d,"status":"%s"}' "$file" "$current" "$limit" "$status"
  elif [[ $current -gt $limit ]]; then
    OVERALL_EXIT=1
    echo "FAIL $file: ${current} (limit: ${limit}, +$((current - limit)))"
  else
    echo "OK   $file: ${current} (limit: ${limit})"
  fi
done

if $JSON_OUTPUT; then
  echo "},\"passed\":$(( OVERALL_EXIT == 0 ? 1 : 0 ))}"
fi
exit $OVERALL_EXIT
