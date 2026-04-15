---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 133-131-stale-worktrees-autonomous-worktree
depends: none
summary: worktree 2つの未コミット変更を評価し、有用な変更をmainブランチに取り込む
---

## Description (subtask of 133-131-stale-worktrees-autonomous-worktree)

1. 各worktreeの git diff を確認し、scattered-constants タスクの進捗を評価:
     - auto-20260415-215001-2102435: PanelBuilder.ts(-5,+4行), panel-sections.ts(+15行)
     - auto-20260415-215501-2134126: PanelBuilder.ts(+10行), panel-sections-display.ts(-9,+7行), panel-sections.ts(+2,-2行)
  2. 両worktreeのコミット済み変更(各5コミット)も含めて、mainに未反映の有用な変更を特定
  3. cherry-pick またはパッチ適用で有用な変更を fix/autofit-suppress-order に取り込む
     - PanelBuilder.ts は God Object (max 2218行) なので行数増加がないか確認必須
  4. 取り込み後、pnpm lint && pnpm test で品質ゲート通過を確認
  5. 取り込み結果をコミット
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
