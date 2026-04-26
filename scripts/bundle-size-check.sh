#!/usr/bin/env bash
# Bundle Size Check — verifies main.js is within budget
# Usage: bash scripts/bundle-size-check.sh [budget_bytes]
set -euo pipefail

BUDGET=${1:-819200}  # Default 800KB
WARN_RATIO=${WARN_RATIO:-95}  # Warn at this percent; effective range 1..99 (>=100 is handled as OVER BUDGET)

if [[ ! -f main.js ]]; then
  echo "ERROR: main.js not found. Run 'pnpm build' first."
  exit 1
fi

SIZE=$(stat -c%s main.js)
PERCENT=$(python3 -c "print(f'{$SIZE/$BUDGET*100:.1f}')")
PCT_INT=${PERCENT%.*}

print_top_contributors() {
  if [[ ! -f main.js.meta.json ]]; then
    echo "  (main.js.meta.json not found — run a production build to enable per-module analysis)"
    return
  fi
  echo "  Top reduction candidates (from main.js.meta.json):"
  node -e '
    const m = JSON.parse(require("fs").readFileSync("main.js.meta.json", "utf8"));
    const out = m.outputs["main.js"] ?? Object.values(m.outputs)[0];
    if (!out || !out.inputs) {
      console.log("  (no input breakdown)");
    } else {
      const rows = Object.entries(out.inputs)
        .filter(([, v]) => v.bytesInOutput > 0)
        .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
        .slice(0, 10);
      for (const [f, v] of rows) console.log(`    ${String(v.bytesInOutput).padStart(7)} bytes  ${f}`);
    }
  '
}

if [[ $SIZE -gt $BUDGET ]]; then
  echo "OVER BUDGET: ${SIZE} bytes (${PERCENT}% of ${BUDGET})"
  print_top_contributors
  exit 1
fi

echo "OK: ${SIZE} bytes (${PERCENT}% of ${BUDGET} budget)"
if [[ $PCT_INT -ge $WARN_RATIO ]]; then
  echo "WARNING: approaching budget (>=${WARN_RATIO}%)"
  print_top_contributors || true
fi
