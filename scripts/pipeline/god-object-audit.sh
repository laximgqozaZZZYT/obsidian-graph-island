#!/usr/bin/env bash
# god-object-audit.sh — God Object line count ratchet
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

JSON_OUTPUT=false
[[ "${1:-}" == "--json" ]] && JSON_OUTPUT=true

declare -A LIMITS
LIMITS["src/views/GraphViewContainer.ts"]=8612
LIMITS["src/views/PanelBuilder.ts"]=2218
LIMITS["src/views/EdgeRenderer.ts"]=2747
LIMITS["src/views/RenderPipeline.ts"]=2361

OVERALL_EXIT=0

if [[ "$JSON_OUTPUT" == true ]]; then
  echo "{\"files\":{"
  first=true
fi

for file in "${!LIMITS[@]}"; do
  limit=${LIMITS[$file]}
  [[ ! -f "$file" ]] && continue
  current=$(wc -l < "$file")
  if [[ "$JSON_OUTPUT" == true ]]; then
    [[ "$first" == true ]] && first=false || echo ","
    status="pass"; [[ $current -gt $limit ]] && status="fail" && OVERALL_EXIT=1
    printf "\"%s\":{\"current\":%d,\"limit\":%d,\"status\":\"%s\"}" "$file" "$current" "$limit" "$status"
  else
    if [[ $current -gt $limit ]]; then
      OVERALL_EXIT=1
      echo "FAIL $file: ${current} (limit: ${limit}, +$((current - limit)))"
    else
      echo "OK   $file: ${current} (limit: ${limit})"
    fi
  fi
done

if [[ "$JSON_OUTPUT" == true ]]; then
  echo "},\"passed\":$(( OVERALL_EXIT == 0 ? 1 : 0 ))}"
fi
exit $OVERALL_EXIT
