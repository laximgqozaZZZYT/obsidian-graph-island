#!/usr/bin/env bash
# coverage-ratchet.sh — read coverage/coverage-summary.json and update
# vitest.config.ts thresholds to match the current totals (rounded down to
# the nearest 0.1 to give a small safety margin).
set -euo pipefail

SUMMARY="coverage/coverage-summary.json"
CONFIG="vitest.config.ts"

if [[ ! -f "$SUMMARY" ]]; then
  echo "ERROR: $SUMMARY not found. Run pnpm test:coverage first." >&2
  exit 1
fi

# Parse total percentages via python3 (available on all major platforms)
read -r STMTS BRANCHES FUNCS LINES < <(python3 - <<'PYEOF'
import json, sys, math

with open("coverage/coverage-summary.json") as f:
    data = json.load(f)

total = data["total"]

def floor1(v):
    """Floor to 1 decimal place."""
    return math.floor(v * 10) / 10

print(
    floor1(total["statements"]["pct"]),
    floor1(total["branches"]["pct"]),
    floor1(total["functions"]["pct"]),
    floor1(total["lines"]["pct"]),
)
PYEOF
)

echo "New thresholds → statements:${STMTS}  branches:${BRANCHES}  functions:${FUNCS}  lines:${LINES}"

# Replace the four threshold lines in vitest.config.ts using python3 (portable sed)
python3 - "$CONFIG" "$STMTS" "$BRANCHES" "$FUNCS" "$LINES" <<'PYEOF'
import sys, re

config_path, stmts, branches, funcs, lines = sys.argv[1:]

with open(config_path) as f:
    src = f.read()

def replace_threshold(text, key, value):
    pattern = rf'(\s*{re.escape(key)}:\s*)\d+(\.\d+)?'
    replacement = rf'\g<1>{value}'
    return re.sub(pattern, replacement, text, count=1)

src = replace_threshold(src, "statements", stmts)
src = replace_threshold(src, "branches",   branches)
src = replace_threshold(src, "functions",  funcs)
src = replace_threshold(src, "lines",      lines)

with open(config_path, "w") as f:
    f.write(src)

print(f"Updated {config_path}")
PYEOF
