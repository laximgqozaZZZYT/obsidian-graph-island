## Description (subtask of 1444-type-assertions)

src/views/panel-defaults.ts の DEFAULT_PANEL_STATE オブジェクト内にある
  19箇所の `as` キャスト (例: `subgraphStack: [] as PanelState["subgraphStack"]`,
  `nodeDisplayMode: "node" as NodeDisplayMode`, `[] as PanelState["nodeShapeRules"]`)
  を削除し、代わりに以下のいずれかで型安全化する:
  (a) DEFAULT_PANEL_STATE 全体の型注釈を `: PanelState` に変更し配列/オブジェクト
      リテラルが PanelState の対応プロパティ型に推論されるようにする
  (b) PanelState["xxx"] 由来の空配列/空オブジェクトについては、明示的に
      型注釈付きの中間定数 (`const emptySubgraphStack: PanelState["subgraphStack"] = []`)
      を導入してから参照する
  事後確認: pnpm build / pnpm test / pnpm lint がすべて緑、
  `grep -E " as [A-Z]" src/views/panel-defaults.ts` の件数が当該ファイルで0または
  Obsidian/外部型必須のものだけに減ること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
