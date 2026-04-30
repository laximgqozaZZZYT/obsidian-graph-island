---
priority: critical
reported: 2026-04-28
status: pending
source: auto-discovered
summary: autonomous-improve has SKIP-ed 3+ consecutive cycles (working tree dirty)
---

## Detected
autonomous-improve.sh has skipped 3 cycles in a row because
main has uncommitted changes. The pipeline is effectively halted.

## Working-tree contents (first 5)
```
 M scripts/pipeline/issues.csv
?? scripts/pipeline/descriptions/1509-autonomous-stalled-dirty-skip.md
```

## Recovery
1. Inspect changes: `git -C /home/ubuntu/obsidian-plugins/obsidian-graph-island diff`
2. Either commit or stash so working tree is clean
3. Counter clears automatically on the next non-SKIP cycle
