#!/bin/bash
set -eu

N=$(wc -l < src/views/GraphViewContainer.ts)

if [ "$N" -le 8597 ]; then
  echo "OK: N=$N (<=8597)"
  exit 0
fi

OVER=$((N - 8597))
M=$(ls issues/*.md 2>/dev/null | sed -E 's|issues/([0-9]+)-.*|\1|' | sort -n | tail -1)
: "${M:=0}"
NEXT=$((M + 1))
FILE="${NEXT}-598-graphviewcontainer-ts-over-limit.md"

echo "N=$N"
echo "OVER=$OVER"
echo "NEXT=$NEXT"
echo "FILE=$FILE"
exit 1
