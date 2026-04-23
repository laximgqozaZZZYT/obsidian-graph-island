---
priority: skip
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 131-stale-worktrees
depends: none
summary: This issue is not decomposable into src/ implementation tasks
---

## Description (subtask of 131-stale-worktrees)

Operational cleanup issue. Should be handled directly by running:
    git worktree prune
    git worktree list  # verify
  outside the autonomous pipeline, not as a code-change subtask.

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
