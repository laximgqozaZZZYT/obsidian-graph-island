## Description (subtask of 1401-type-assertions)

`src/views/panel-defaults.ts` 内の `[] as PanelState["xxx"]` /
  `{} as Record<...>` /  `"xxx" as SomeEnum` 形式の型アサーション計19箇所を、
  オブジェクト/プロパティ側の型注釈で表現する形に書き換える。

  対象パターン例（実ファイルを開いて該当行を全て特定すること）:
  - L53 `[] as PanelState["subgraphStack"]`
  - L103 `] as PanelState["nodeShapeRules"]`
  - L120 `"node" as NodeDisplayMode`
  - L162 `{} as Record<string, string>`
  - L171 `"graph" as ViewMode`
  - L182-215 周辺の `[] as PanelState["xxx"]` 列

  方針:
  1. defaults オブジェクト全体に `: PanelState` 型注釈を付ける（既に
     `Partial<PanelState>` 等の宣言があれば変更しない）。
  2. 個別フィールドが推論で済む場合（例: `"node" as NodeDisplayMode`）は
     キャストを除去し、必要なら `satisfies NodeDisplayMode` を使う。
  3. enum/Union 文字列リテラルは `satisfies` または親オブジェクトの型から
     推論されるよう構造を整える。

  完了条件:
  - `src/views/panel-defaults.ts` の `as ` キャスト件数を
    `grep -E " as [A-Z]" src/views/panel-defaults.ts | wc -l` で測り、5件以下にする。
  - `pnpm build` と `pnpm test` がパス。
  - 既存のデフォルト値の挙動は変更しない（純粋な型表現の付け替え）。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
