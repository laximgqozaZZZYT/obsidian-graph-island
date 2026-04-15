---
priority: medium
reported: 2026-04-15
status: pending
source: decomposed
parent: 130-type-assertions
depends: none
summary: enum/unionリテラルアサーションを satisfies または型注釈に置換
---

## Description (subtask of 130-type-assertions)

28箇所の `"value" as SomeUnion` パターンを置換:
  
  1. デフォルト値定義 → `satisfies` 演算子を使用
     例: `viewMode: "graph" as ViewMode` → `viewMode: "graph" satisfies ViewMode`
     ただし satisfies は型アサーションではないのでカウント対象外になる
  2. 変数宣言時 → 型注釈を使用
     例: `const mode = v as NodeShape` → `const mode: NodeShape = v`
     (v の型が適切であれば)
  3. v がstring型の場合 → 型ガード関数を作成
     `function isNodeShape(v: string): v is NodeShape`
     src/types.ts に配列定数 + 型ガードを追加
  
  削減見込み: ~25個
  テスト: pnpm test && pnpm lint
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
