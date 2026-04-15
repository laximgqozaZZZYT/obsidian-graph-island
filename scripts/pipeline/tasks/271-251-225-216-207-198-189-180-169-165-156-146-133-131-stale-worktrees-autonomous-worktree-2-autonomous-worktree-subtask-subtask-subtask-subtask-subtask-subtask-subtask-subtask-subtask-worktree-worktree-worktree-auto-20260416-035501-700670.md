---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 251-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-worktree-worktree
depends: none
summary: 残存する自律worktree auto-20260416-035501-700670 を削除しクリーンアップ
---

## Description (subtask of 251-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-worktree-worktree)

対象worktree auto-20260416-020001-4058240 は既に存在しない。
  残存する auto-20260416-035501-700670 (未コミット変更なし) を削除する。
  
  手順:
  1. `git worktree list` で現状確認
  2. `git worktree remove .autonomous-worktrees/auto-20260416-035501-700670 --force`
  3. `git branch -D auto-improve-auto-20260416-035501-700670`
  4. `git worktree prune`
  5. `git worktree list` で本体のみ残っていることを確認
  6. `.autonomous-worktrees/` ディレクトリが空なら削除
  
  完了条件:
  - git worktree list に本体のworktreeのみ表示される
  - 関連ブランチが削除されている
  - .autonomous-worktrees/ ディレクトリがクリーン
```

これは1タスクで完了できるシンプルな作業です。元のissue対象のworktreeが既に消えているため、複数タスクへの分解は不要です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
