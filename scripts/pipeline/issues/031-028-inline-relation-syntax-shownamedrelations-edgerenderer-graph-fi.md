---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 028-inline-relation-syntax
depends: subtask-1
summary: showNamedRelations トグル + EdgeRenderer/graph-filter統合
---

## Description (subtask of 028-inline-relation-syntax)

1. EdgeRenderer.ts:
     - EdgeDrawConfig に showNamedRelations: boolean を追加
     - EDGE_TYPE_SPECS に ["named-relation", { visibilityField: "showNamedRelations", color: null }] を追加
     - (shouldSkipEdge は EDGE_TYPE_SPECS 参照なので自動対応)
  2. graph-filter.ts:
     - VisibilityOptions に showNamedRelations を追加
     - applyVisibilityFilters に named-relation edge フィルタ追加
       (showSimilar と同じパターン: !opts.showNamedRelations → filterNamedRelationEdges)
     - filterNamedRelationEdges 関数を export
  3. GraphViewContainer.ts:
     - PANEL_STATE_MINIMAL/ALL/DEFAULT に showNamedRelations を追加 (ALL: true, MINIMAL/DEFAULT: true)
     - EdgeDrawConfig 組み立て箇所に showNamedRelations を追加
  4. テスト:
     - shouldSkipEdge: named-relation + showNamedRelations true/false
     - applyVisibilityFilters: showNamedRelations トグル反映
```

###

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
