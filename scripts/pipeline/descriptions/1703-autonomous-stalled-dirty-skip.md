## Detected
autonomous-improve.sh has skipped 3 cycles in a row because
main has uncommitted changes. The pipeline is effectively halted.

## Working-tree contents (first 5)
```
 M scripts/pipeline/issues.csv
```

## Recovery
1. Inspect changes: `git -C /home/ubuntu/obsidian-plugins/obsidian-graph-island diff`
2. Either commit or stash so working tree is clean
3. Counter clears automatically on the next non-SKIP cycle
