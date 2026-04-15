---
priority: medium
reported: 2026-04-15
status: pending
source: decomposed
parent: 131-stale-worktrees
depends: none
summary: subtask
---

## Description (subtask of 131-stale-worktrees)

現状把握完了。3つのworktreeがあり、うち1つは未コミットの変更あり。`git worktree prune` は何も検出しない（パスが実在するため）。これは手動削除が必要なケースです。

このissueは非常にシンプルで、1タスクで完了できます。分解の必要はありません。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
