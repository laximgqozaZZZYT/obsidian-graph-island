## Detected
51 OPEN auto-improve-* PRs on origin (threshold MAX_OPEN_AUTO_PRS=20).
autonomous-improve generates ~1 PR/cycle but the merge rate has collapsed,
so the backlog grew unboundedly. New cycles are now skipped until the
queue drains below the threshold.

## Recovery
1. Inspect: `gh pr list --state open --search "head:auto-improve-" --limit 50`
2. Manually merge or close stale PRs, or wait for `auto-stale-pr-close.sh`
3. The next cycle automatically resumes once OPEN count ≤ 20
4. If the closer itself is jammed, inspect /tmp/graph-island-stale-pr-close.log
