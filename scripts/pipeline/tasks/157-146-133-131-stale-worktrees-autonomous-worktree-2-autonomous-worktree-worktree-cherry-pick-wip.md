---
priority: high
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree
depends: none
summary: 両worktreeのコミット済み変更をcherry-pickし、未コミットWIPを評価・取り込み
---

## Description (subtask of 146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree)

1. 両worktreeの差分を確認:
     - worktree 1 (auto-20260415-225001-2498008): コミット d8d1f0fd (gvc-constants.ts 71行追加)
     - worktree 2 (auto-20260415-225501-2533215): コミット 2c2a6b3b (card-renderer.ts リファクタ -28/+23)
  2. 未コミットWIP変更の評価:
     - worktree 1: main.ts, GVC, gvc-constants.ts, tests/main-plugin.test.ts
     - worktree 2: CLAUDE.md, main.ts, GVC, card-renderer.ts (+ gvc-constants.ts untracked)
     - 両方がmain.ts, GVCを変更 → 競合可能性あり
  3. cherry-pick実行:
     git cherry-pick d8d1f0fd (worktree 1のコミット)
     git cherry-pick 2c2a6b3b (worktree 2のコミット)
     競合時はgit diffでパッチ適用に切り替え
  4. WIP変更で価値あるものをgit diff + git applyで取り込み
     (CLAUDE.mdのみworktree 2のWIPから除外 — pipeline管理ファイルのため)
  5. pnpm build && pnpm test && pnpm lint で検証
  6. God Object行数がMax Allowedを超えていないことを確認:
     wc -l src/views/GraphViewContainer.ts (≤8612)
```

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
