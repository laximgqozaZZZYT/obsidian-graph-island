---
priority: medium
reported: 2026-04-07
status: pending
source: decomposed
parent: 028-inline-relation-syntax
depends: subtask-2
summary: edge ラベル表示 + named-relation 色分け対応
---

## Description (subtask of 028-inline-relation-syntax)

1. EdgeRenderer.ts:
     - named-relation edge の label として edge.relation を表示
       (既存の edge label 描画ロジックを確認し、relation フィールドが
        label として使われる経路を確認・追加)
     - EDGE_TYPE_SPECS の named-relation の color を専用色に設定
       (または colorEdgesByRelation 有効時に relation 別色分け — 既存機構で対応済みか確認)
  2. metadata-parser.ts:
     - buildRelationColorMap が named-relation edge の relation も拾うことを確認
       (既に edge.relation を見ているので追加不要の可能性大 → テストで確認)
  注意: EdgeRenderer.ts は 2740行 (上限3853行) なので行数増加は最小限に
```

###

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
