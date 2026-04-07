---
priority: high
reported: 2026-04-07
status: done
source: decomposed
parent: 028-inline-relation-syntax
depends: none
summary: named-relation edge type追加 + パーサーの分岐修正 + 単体テスト
---

## Description (subtask of 028-inline-relation-syntax)

1. src/types.ts の EdgeType union に "named-relation" を追加
  2. src/parsers/metadata-parser.ts の resolveRelationEdge() を修正:
     - ontology未分類の inline relation link (@記法) を "named-relation" にマッピング
     - 既存の Dataview inline field (Author::[[X]]) は従来通り "semantic" のまま
     - parseInlineRelationLinksRaw の InlineFieldResult に isNamedRelation フラグ追加
       (collectInlineRelations で parseInlineRelationLinks 由来を区別)
  3. テスト追加:
     - parseInlineRelationLinksRaw: 標準/alias省略/日本語関係名/複数関係/通常wikilink共存/誤記
     - resolveRelationEdge: @記法 → named-relation, Dataview記法 → semantic の分岐
     - 既存 wikilink パースが壊れていないことの回帰テスト
```

###

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
