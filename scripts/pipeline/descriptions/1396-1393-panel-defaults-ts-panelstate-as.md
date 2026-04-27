## Description (subtask of 1393-type-assertions)

src/views/panel-defaults.ts には 19 個の `as` (例: `[] as string[]`,
  `null as string | null`, `"all" as const`, `"category" as const`,
  `[] as PanelState["nodeShapeRules"]` 等) があり、いずれも初期値リテラルの
  型推論補助として書かれている。
  対応:
  1. ファイル冒頭の export を `export const DEFAULT_PANEL_STATE: PanelState = { ... }`
     のように `PanelState` 型注釈で囲み、リテラル側の `as` を削除する
     (TypeScript の contextual typing で各フィールドが期待型に降りる)。
  2. `as const` が必要な enum 風 string literal は `PanelState` のフィールドが
     既に union 型なので注釈で吸収できるか確認。残るものは保持。
  3. `pnpm lint` と `pnpm test` を通す。型エラーが出た場合は PanelState 側の
     フィールド型が広すぎる可能性 — その場合は types.ts のフィールド型を
     必要に応じて狭める (`"all"` ではなく `EdgeDirectionFilter` のような
     既存 union 型を使う)。
  完了条件: panel-defaults.ts の `as` 件数が 19 → 5 以下、ビルド/テスト緑。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
