---
priority: high
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 270-251-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-worktree-worktree-subtask
depends: none
summary: stale remote auto/* ブランチの削除
---

## Description (subtask of 270-251-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-worktree-worktree-subtask)

リモートに残っている stale な auto/* ブランチを削除する。
  対象:
    - remotes/origin/auto/coverage-expand-20260402
    - remotes/origin/auto/coverage-expand-20260403
    - remotes/origin/auto/tech-debt-20260402
    - remotes/origin/auto/tech-debt-20260403
  コマンド:
    git push origin --delete auto/coverage-expand-20260402 auto/coverage-expand-20260403 auto/tech-debt-20260402 auto/tech-debt-20260403
  完了後 git fetch --prune で確認。
  acceptance: `git branch -r | grep auto/` が空であること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
