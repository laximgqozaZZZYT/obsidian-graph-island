#!/usr/bin/env bash
# Bundle Size Check — verifies main.js is within budget
# Usage: bash scripts/bundle-size-check.sh [budget_bytes]
set -euo pipefail

BUDGET=${1:-819200}  # Default 800KB

if [[ ! -f main.js ]]; then
  echo "ERROR: main.js not found. Run 'pnpm build' first."
  exit 1
fi

SIZE=$(stat -c%s main.js)
PERCENT=$(python3 -c "print(f'{$SIZE/$BUDGET*100:.1f}')")

if [[ $SIZE -gt $BUDGET ]]; then
  echo "OVER BUDGET: ${SIZE} bytes (${PERCENT}% of ${BUDGET})"
  exit 1
else
  echo "OK: ${SIZE} bytes (${PERCENT}% of ${BUDGET} budget)"
fi
