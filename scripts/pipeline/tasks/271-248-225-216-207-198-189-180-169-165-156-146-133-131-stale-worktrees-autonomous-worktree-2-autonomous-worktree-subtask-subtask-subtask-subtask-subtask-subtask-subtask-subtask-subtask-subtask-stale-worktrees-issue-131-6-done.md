---
priority: low
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: stale-worktrees issue #131 と派生タスク6件を done に移動
---

## Description (subtask of 248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

git worktree list で worktree が1個（メイン）のみであることを確認済み。
  git worktree prune --dry-run で prune 対象ゼロ。
  131-stale-worktrees.md の status を done に変更。
  scripts/pipeline/tasks/ 配下の 225-216 系タスク6件を done/ に移動。
```

これ以上の分解は不要です。元の問題（stale worktree）は既に存在しません。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
