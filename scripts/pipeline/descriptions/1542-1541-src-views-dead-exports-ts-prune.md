## Description (subtask of 1541-dead-exports)

`pnpm exec ts-prune` を実行して src/views/ 配下の dead exports を列挙する。
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は
  God Object のため export 削除のみで行数を減らす方向で対応 (内部使用なら export を外す、
  完全に未使用なら関数ごと削除)。テストでのみ参照されている export は残してよい。
  対応後、`pnpm test` と `pnpm build` が通ることを確認する。
  CLAUDE.md の "ratchet down only" に違反しないよう、God Object の行数が増えないことを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
