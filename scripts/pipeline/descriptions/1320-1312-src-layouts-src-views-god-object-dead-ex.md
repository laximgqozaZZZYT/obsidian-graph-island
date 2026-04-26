## Description (subtask of 1312-dead-exports)

対象外 (God Object — 行数増減なしの関係で本タスクでは触らない):
    - src/views/GraphViewContainer.ts
    - src/views/PanelBuilder.ts
    - src/views/EdgeRenderer.ts
    - src/views/RenderPipeline.ts
  上記以外の src/layouts/*.ts および src/views/*.ts (renderer-factory.ts, CanvasGraphics.ts,
  LabelManager.ts, etc.) について、subtask-1 と同じ手順で:
  1. `npx knip` で残存 dead exports を再取得。
  2. 対象ファイル群の export ごとに Grep で参照確認。
  3. 削除 (本体ごと不要) または unexport (`export` キーワードのみ外す)。
  4. 各変更後に `pnpm test` / `pnpm lint` / `pnpm build` を実行。
  5. 完了時点の dead export 件数を再計測しコミットメッセージに記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
