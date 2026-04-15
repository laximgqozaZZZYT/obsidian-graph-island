---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.ts の dead export 5件から export キーワードを削除（バッチ1: 型エイリアス）
---

## Description (subtask of 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

以下5つの型エイリアスから export キーワードを削除する。
  宣言自体は残し、export のみ除去:
  - ClusterGroupArrangement (L146)
  - ClusterGroupBy (L139)
  - CoordinateSystem (L205)
  - GridShape (L234)
  - GridStyle (L257)
  
  変更後 pnpm build && pnpm test で確認。
  ビルドエラーが出た場合はその export を元に戻す（実は使われている）。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
