#!/usr/bin/env bash
# ============================================================
# ratchet-drift-monitor.sh — Detect ratchet relaxations in git log
# ============================================================
# Watches CLAUDE.md (god-object Max Allowed) and vitest.config.ts
# (coverage thresholds) for changes in the relaxation direction:
#   - god-object Max Allowed: any INCREASE is a relaxation
#   - coverage thresholds: any DECREASE is a relaxation
#
# Reports any such commits in the last $WINDOW_HOURS hours so a human
# (or follow-up cron) can decide whether to flag them as tech debt or
# accept them as deliberate re-baseline.
#
# Usage:
#   bash scripts/pipeline/ratchet-drift-monitor.sh           # last 24h
#   WINDOW_HOURS=168 bash scripts/pipeline/ratchet-drift-monitor.sh  # last week
#
# Suggested cron: */30 * * * * (writes to /tmp/graph-island-ratchet.log)
# ============================================================
set -uo pipefail

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
WINDOW_HOURS="${WINDOW_HOURS:-24}"

cd "$PROJECT_DIR" || exit 1

NOW=$(date -Iseconds)
SINCE=$(date -d "${WINDOW_HOURS} hours ago" -Iseconds)

echo "=== Ratchet Drift Monitor ($NOW) ==="
echo "Window: last $WINDOW_HOURS hours (since $SINCE)"

# Helper: emit one line per (file, commit, metric, prev → new) tuple
# when a relaxation is detected.
report_relaxation() {
  local file="$1" commit="$2" date="$3" metric="$4" prev="$5" new="$6" direction="$7"
  echo "RELAXATION  $date  $commit  $file  $metric: $prev → $new  ($direction)"
}

# ------------------------------------------------------------
# Coverage thresholds (vitest.config.ts) — DECREASE = relaxation
# ------------------------------------------------------------
echo ""
echo "-- vitest.config.ts coverage thresholds --"
git log --since="$SINCE" --pretty=format:'%H|%aI' -- vitest.config.ts 2>/dev/null \
  | while IFS='|' read -r sha date; do
      [[ -z "$sha" ]] && continue
      parent=$(git rev-parse "${sha}^" 2>/dev/null) || continue
      for metric in statements branches functions lines; do
        prev=$(git show "${parent}:vitest.config.ts" 2>/dev/null \
          | awk '/thresholds:/,/\}/' | grep "$metric:" | grep -oP '[0-9]+\.[0-9]+' | head -1)
        new=$(git show "${sha}:vitest.config.ts" 2>/dev/null \
          | awk '/thresholds:/,/\}/' | grep "$metric:" | grep -oP '[0-9]+\.[0-9]+' | head -1)
        [[ -z "$prev" || -z "$new" ]] && continue
        # decrease = relaxation
        if awk -v p="$prev" -v n="$new" 'BEGIN{ exit !(n+0 < p+0) }'; then
          report_relaxation "vitest.config.ts" "${sha:0:8}" "$date" "$metric" "$prev" "$new" "decrease"
        fi
      done
    done

# ------------------------------------------------------------
# God-object limits (CLAUDE.md) — INCREASE = relaxation
# ------------------------------------------------------------
echo ""
echo "-- CLAUDE.md god-object Max Allowed --"
git log --since="$SINCE" --pretty=format:'%H|%aI' -- CLAUDE.md 2>/dev/null \
  | while IFS='|' read -r sha date; do
      [[ -z "$sha" ]] && continue
      parent=$(git rev-parse "${sha}^" 2>/dev/null) || continue
      # Extract limits from CLAUDE.md table for prev and new
      python3 - <<PY
import subprocess, re, sys

def limits(rev):
    out = subprocess.run(["git","show",f"{rev}:CLAUDE.md"], capture_output=True, text=True)
    if out.returncode != 0:
        return {}
    res = {}
    in_block = False
    for line in out.stdout.splitlines():
        if "GOD OBJECT Policy" in line:
            in_block = True; continue
        if in_block and line.startswith("## "):
            in_block = False
        if in_block:
            m = re.match(r"\| \`(src/.+?\.ts)\` \| \d+ \| (\d+) \|", line)
            if m:
                res[m.group(1)] = int(m.group(2))
    return res

prev = limits("$parent")
new  = limits("$sha")
for f, n in new.items():
    p = prev.get(f, n)
    if n > p:
        print(f"RELAXATION  $date  ${sha[:8]}  CLAUDE.md  {f} Max: {p} → {n}  (increase)")
PY
    done

echo ""
echo "Done."
