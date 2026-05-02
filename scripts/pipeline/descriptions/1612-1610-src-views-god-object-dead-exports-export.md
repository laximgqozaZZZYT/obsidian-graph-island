## Description (subtask of 1610-dead-exports)

1. `pnpm exec ts-prune --project tsconfig.json` を再実行 (subtask-1 で減った後の状態を取得)。
  2. src/views/ 配下のうち、CLAUDE.md で指定された GOD OBJECT 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) を **除く** ファイルの dead exports を対応:
     - 同一ファイル内参照のみ → `export` を外す
     - 完全未使用 → 宣言ごと削除
  3. GOD OBJECT 4ファイルは "Max Allowed" を増減させない範囲でも本タスクでは変更しない (別タスクで扱う)。
  4. `pnpm build` と `pnpm test` がグリーンであることを確認。
  5. 削減した export 数を実測値でコミットメッセージに記録。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
