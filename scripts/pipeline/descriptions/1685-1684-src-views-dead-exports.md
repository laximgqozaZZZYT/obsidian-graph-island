## Description (subtask of 1684-dead-exports)

pnpm exec knip --reporter json または同等のツールで dead exports を列挙し、
  src/views/ 配下のファイルに含まれる未使用 export を削除する。
  対象は export 削除 (export 修飾子のみ削除して内部関数化) か、
  関数自体が他から参照されていない場合は関数ごと削除する。
  GOD OBJECT 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts,
  RenderPipeline.ts) では行数が減る方向のみ許可 (Max Allowed の範囲内)。
  変更後に pnpm test, pnpm lint, pnpm build が通ること。
  削除した export 名を commit message に列挙すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
