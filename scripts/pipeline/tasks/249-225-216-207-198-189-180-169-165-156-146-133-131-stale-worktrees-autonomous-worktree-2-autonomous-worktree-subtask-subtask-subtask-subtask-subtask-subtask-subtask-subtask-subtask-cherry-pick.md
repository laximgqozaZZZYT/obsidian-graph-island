---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: 未マージの有用コミットを評価し、必要ならcherry-pick
---

## Description (subtask of 225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

2つのブランチにmainに無いユニークコミットがある:
  - worktree-agent-a862fdb4: 4a85d9aa "refactor: extract tooltip/hover/animation helpers from GraphViewContainer (-140 lines)"
  - worktree-agent-ae801798: 461a5086 "test: add 200 DOM/Canvas integration tests for views layer"
  
  各コミットの内容を `git show <hash>` で確認し:
  1. 現在のmainのコードと衝突しないか確認
  2. 有用であればmainにcherry-pick
  3. 衝突が大きい or 古すぎる場合はスキップ（理由をコミットメッセージに記録）
  4. cherry-pick後に `pnpm test` と `pnpm lint` を実行して確認
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
