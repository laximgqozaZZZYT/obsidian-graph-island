---
priority: high
reported: 2026-04-15
status: decomposed
source: decomposed
parent: 131-stale-worktrees
depends: none
summary: 放置されたautonomous worktreeを安全にクリーンアップ
---

## Description (subtask of 131-stale-worktrees)

1. 各worktreeの未コミット変更を確認:
     - auto-20260414-222501-1579244: untracked 1件(tests/ego-sector.test.ts) → 破棄可
     - auto-20260415-210639-1899310: modified 5件 → 変更内容を確認し、
       mainにマージ済みか判定。未マージなら stash or commit してからブランチ保存
     - auto-20260415-214001-2041656: clean (現セッション自身 → 最後に削除)
  
  2. 安全なworktreeから順に削除:
     git worktree remove .autonomous-worktrees/auto-20260414-222501-1579244
     git worktree remove .autonomous-worktrees/auto-20260415-210639-1899310 (要 --force if dirty)
     git worktree remove .autonomous-worktrees/auto-20260415-214001-2041656
  
  3. 関連ブランチを削除:
     git branch -D auto-improve-auto-20260414-222501-1579244
     git branch -D auto-improve-auto-20260415-210639-1899310
     git branch -D auto-improve-auto-20260415-214001-2041656
  
  4. git worktree prune で残骸を掃除
  
  5. git worktree list で3つとも消えたことを確認
  
  注意: auto-20260415-214001-2041656 は現在実行中のセッション自身の
  worktreeなので、自分自身を削除できない場合がある。その場合は
  他の2つを削除し、このworktreeの削除は次回セッションに委ねる。
```

---

`★ Insight ─────────────────────────────────────`
- `git worktree prune` は**パスが存在しない**worktreeのみ削除する。ディレクトリが実在する場合は `git worktree remove <path>` が必要
- 未コミット変更がある worktree は `--force` なしでは remove できない。auto-20260415-210639-1899310 の modified 5件は要注意
- 自律パイプラインが自分自身のworktreeを削除するのは不可能（cwd が消える）。設計上、クリーンアップは**次のセッション**か**親リポジトリ側**から行うべき
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
