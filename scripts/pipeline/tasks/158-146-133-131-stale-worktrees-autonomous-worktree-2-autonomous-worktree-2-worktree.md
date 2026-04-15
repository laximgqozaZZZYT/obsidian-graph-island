---
priority: high
reported: 2026-04-15
status: pending
source: decomposed
parent: 146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree
depends: subtask-1
summary: 2つのworktreeと関連ブランチを削除し、クリーンな状態を検証
---

## Description (subtask of 146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree)

1. subtask-1の変更が取り込み済みであることを確認:
     git log --oneline -5 → cherry-pick/applyコミットが存在すること
  2. worktreeを強制削除（WIP変更は取り込み済みのため安全）:
     git worktree remove .autonomous-worktrees/auto-20260415-225001-2498008 --force
     git worktree remove .autonomous-worktrees/auto-20260415-225501-2533215 --force
  3. 関連ブランチを削除:
     git branch -D auto-improve-auto-20260415-225001-2498008
     git branch -D auto-improve-auto-20260415-225501-2533215
  4. 残骸の掃除:
     git worktree prune
     rmdir .autonomous-worktrees/ (空なら削除)
  5. 検証（全て成功で完了）:
     git worktree list → メインリポジトリのみ
     git branch --list 'auto-improve-*' → 空
     ls .autonomous-worktrees/ → 存在しない or 空
     git status → clean (新規コミット以外の変更なし)
```

---

依存関係: `subtask-1 → subtask-2`（直列）

subtask-1が重い（cherry-pick + 競合解決 + WIP評価 + テスト）。subtask-2は純粋なgitクリーンアップで軽量。分離することで、subtask-1失敗時にworktreeを温存でき、やり直しが効きます。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
