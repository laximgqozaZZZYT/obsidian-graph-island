#!/usr/bin/env bash
# Coverage Ratchet — reads current coverage and updates vitest.config.ts thresholds
# Usage: bash scripts/coverage-ratchet.sh
# Requires: coverage/coverage-summary.json (run `pnpm test:coverage` first)
set -euo pipefail

COVERAGE_FILE="coverage/coverage-summary.json"
CONFIG_FILE="vitest.config.ts"

if [[ ! -f "$COVERAGE_FILE" ]]; then
  echo "ERROR: $COVERAGE_FILE not found. Run 'pnpm test:coverage' first."
  exit 1
fi

# Extract current coverage percentages (floor to 1 decimal — must use math.floor, not round)
STMT=$(python3 -c "import json,math; v=json.load(open('$COVERAGE_FILE'))['total']['statements']['pct']; print(math.floor(v*10)/10)")
BRANCH=$(python3 -c "import json,math; v=json.load(open('$COVERAGE_FILE'))['total']['branches']['pct']; print(math.floor(v*10)/10)")
FUNC=$(python3 -c "import json,math; v=json.load(open('$COVERAGE_FILE'))['total']['functions']['pct']; print(math.floor(v*10)/10)")
LINE=$(python3 -c "import json,math; v=json.load(open('$COVERAGE_FILE'))['total']['lines']['pct']; print(math.floor(v*10)/10)")

echo "Current coverage: statements=$STMT branches=$BRANCH functions=$FUNC lines=$LINE"

# Read existing thresholds from vitest.config.ts
OLD_STMT=$(grep -oP 'statements:\s*\K[0-9.]+' "$CONFIG_FILE")
OLD_BRANCH=$(grep -oP 'branches:\s*\K[0-9.]+' "$CONFIG_FILE")
OLD_FUNC=$(grep -oP 'functions:\s*\K[0-9.]+' "$CONFIG_FILE")
OLD_LINE=$(grep -oP 'lines:\s*\K[0-9.]+' "$CONFIG_FILE")

echo "Old thresholds:   statements=$OLD_STMT branches=$OLD_BRANCH functions=$OLD_FUNC lines=$OLD_LINE"

# Only ratchet UP (never decrease)
NEW_STMT=$(python3 -c "print(max($OLD_STMT, $STMT))")
NEW_BRANCH=$(python3 -c "print(max($OLD_BRANCH, $BRANCH))")
NEW_FUNC=$(python3 -c "print(max($OLD_FUNC, $FUNC))")
NEW_LINE=$(python3 -c "print(max($OLD_LINE, $LINE))")

# Update vitest.config.ts
sed -i "s/statements: $OLD_STMT/statements: $NEW_STMT/" "$CONFIG_FILE"
sed -i "s/branches: $OLD_BRANCH/branches: $NEW_BRANCH/" "$CONFIG_FILE"
sed -i "s/functions: $OLD_FUNC/functions: $NEW_FUNC/" "$CONFIG_FILE"
sed -i "s/lines: $OLD_LINE/lines: $NEW_LINE/" "$CONFIG_FILE"

echo "New thresholds:   statements=$NEW_STMT branches=$NEW_BRANCH functions=$NEW_FUNC lines=$NEW_LINE"

if [[ "$NEW_STMT" != "$OLD_STMT" || "$NEW_BRANCH" != "$OLD_BRANCH" || "$NEW_FUNC" != "$OLD_FUNC" || "$NEW_LINE" != "$OLD_LINE" ]]; then
  echo "Thresholds ratcheted up."
else
  echo "No change needed — thresholds already at or above current coverage."
fi
