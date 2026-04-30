## Description (subtask of 1463-dead-exports)

1. subtask-1 終了時点で `npx ts-prune` を再実行し、現在の dead exports 残数を確認
  2. `src/views/` 配下のうち以下の God Object 4ファイル "以外" の dead exports を削除:
     - 除外: GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts
     - 対象: renderer-factory.ts, CanvasGraphics.ts, CanvasText.ts, LabelManager.ts, panel-*.ts, view-mode-*.ts など
  3. 削除方針は subtask-1 と同じ (export 削除 or 関数削除)
  4. God Object 4ファイルの行数が変わっていないことを `wc -l` で確認 (CLAUDE.md ratchet 維持)
  5. `pnpm build` と `pnpm test` を実行して破壊がないことを確認
  注意: God Object 内の dead exports は今回触らない。subtask-3 でも触らない。別 issue で extract と一緒に扱う方が安全

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
