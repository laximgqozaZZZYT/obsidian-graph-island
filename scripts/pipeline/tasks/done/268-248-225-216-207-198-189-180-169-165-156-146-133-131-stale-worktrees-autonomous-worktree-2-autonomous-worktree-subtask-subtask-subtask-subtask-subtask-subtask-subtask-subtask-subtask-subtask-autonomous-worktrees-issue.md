---
priority: low
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: 空の .autonomous-worktrees ディレクトリ削除 + issue完了マーク
---

## Description (subtask of 248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

1. `rmdir .autonomous-worktrees` で空ディレクトリを削除
  2. `git worktree prune` で残骸がないことを確認
  3. `git worktree list` でメインリポジトリのみ表示されることを確認
  4. `git branch --list 'auto-improve-*'` が空であることを確認
  5. issue 131-stale-worktrees.md の status を done に変更
  6. タスクチェーン内の全 decomposed タスクの status を done に変更
  7. コミット: "chore: close stale-worktrees issue chain — all worktrees already cleaned up"

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
