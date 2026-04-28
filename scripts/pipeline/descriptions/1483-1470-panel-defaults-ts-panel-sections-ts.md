## Description (subtask of 1470-type-assertions)

panel-defaults.ts には `[] as PanelState["xxx"]` と `{} as Record<string, X>`
  型の初期値キャストが 19 件、panel-sections*.ts 系 5 ファイルには合計 31 件の
  `as` キャスト (主に文字列リテラル型 `"force" as Force`, `"png" as PNG` や
  `as Record<...>` パターン) があります。
  
  以下の置換を行うこと:
  1. `defaultPanelState` を `Partial<PanelState>` ではなく `PanelState` として
     型注釈し、各フィールドの `as PanelState["xxx"]` を削除する
     (オブジェクト全体の型注釈で個別キャストは不要になる)
  2. `[] as PanelState["xxx"]` → 配列型を関数シグネチャ側に移動するか
     `satisfies` 演算子に置換
  3. `"png" as PNG`, `"force" as Force` 等の文字列リテラル型キャストは、
     代入先変数を該当ユニオン型で宣言するか、関数引数の型を絞ることで削除
  4. `{} as Record<string, X>` → `Record<string, X> = {}` の形に置換
  
  目標: 50 件以上のアサーション削除。`pnpm tsc --noEmit` でコンパイル通過、
  `pnpm test` でテスト通過、`pnpm lint` 通過を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
