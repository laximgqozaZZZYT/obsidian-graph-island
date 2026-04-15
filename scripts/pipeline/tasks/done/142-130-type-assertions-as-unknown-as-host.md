---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 130-type-assertions
depends: none
summary: as unknown as Host 二重アサーションをインターフェース準拠で除去
---

## Description (subtask of 130-type-assertions)

GVC内の `this as unknown as InteractionHost`, `this as unknown as GuideRendererHost` 等
  (~15箇所)を除去。
  
  方針:
  1. GVC が各Hostインターフェースを implements で明示宣言する
     (すでに実質準拠しているはず)
  2. implements 追加で型エラーが出る場合、
     Host側インターフェースに optional プロパティを追加するか、
     GVC にアダプタメソッドを追加
  3. `this` を直接渡せるようになるので `as unknown as` が不要に
  
  同様に ExportManager, LayoutController 内の
  Host型二重アサーションも同じアプローチで除去。
  
  削減見込み: ~25個 (二重アサーション66個のうち)
  テスト: pnpm test && pnpm lint
  注意: GVC は god object なので行数を増やさないこと。
  implements 宣言は1行で済む。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
