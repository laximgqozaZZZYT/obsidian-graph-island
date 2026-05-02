## Description (subtask of 1650-dead-exports)

`pnpm exec ts-prune | grep "src/views/"` で列挙し、CLAUDE.md の GOD OBJECT 4ファイル
  (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) を除外したファイル
  (例: renderer-factory.ts, view-mode-*, CanvasGraphics.ts, CanvasText.ts 等) の dead exports を処理する。
  - import されていない export → 削除
  - 同一ファイル内のみで使用 → `export` を外す
  GOD OBJECT は行数増加禁止のため、本タスクで「内部参照に書き戻す」変更も含めて
  GOD OBJECT 4ファイルへの追記は一切しないこと。
  `pnpm test`, `pnpm lint`, `pnpm build` を通す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
