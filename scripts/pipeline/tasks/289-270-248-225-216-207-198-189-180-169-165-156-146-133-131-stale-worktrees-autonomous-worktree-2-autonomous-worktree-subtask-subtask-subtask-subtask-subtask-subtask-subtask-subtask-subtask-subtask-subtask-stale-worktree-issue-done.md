---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 270-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: stale worktree再帰issueチェーンを全てdoneに移動
---

## Description (subtask of 270-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

このissue（269番台）および親チェーン（248-225-216-207-...）の
  派生タスクをすべて .issues/done/ に移動する。
  
  手順:
  1. .issues/backlog/ と .issues/in-progress/ から
     "stale-worktrees" を含むissueファイルを特定
  2. すべて .issues/done/ に移動
  3. status: done に更新
  4. コミット: "chore: close recursive stale-worktree issue chain"
  
  実装作業はゼロ。ファイル移動のみ。

実行しますか？

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
