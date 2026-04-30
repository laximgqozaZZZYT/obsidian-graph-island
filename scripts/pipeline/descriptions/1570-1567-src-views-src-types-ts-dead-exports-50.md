## Description (subtask of 1567-dead-exports)

subtask-2完了後、再度 ts-prune を実行。
  対象は `src/views/` 配下の小ファイル(renderer-factory.ts, LabelManager.ts, CanvasGraphics.ts等)、`src/types.ts`、`src/i18n.ts`。
  **重要**: GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts (God Object)は行数が増えない範囲でのみ編集可。export削除のみで行数は減るはずなので問題ないが、Max Allowed超過は厳禁。
  - 内部のみで使用されている: `export` キーワードを削除
  - どこからも使われていない: 関数/定数/型ごと削除
  最後に `pnpm exec ts-prune --project tsconfig.json | wc -l` でdead exports件数が50個以下になっていることを確認。
  `pnpm test` と `pnpm lint` が通ることを確認してコミット。
  もし50個以下に達していない場合、残存リストから影響範囲が小さいものを優先的に追加削除する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
