## Description (subtask of 1547-dead-exports)

subtask-1 と同じ手順で dead exports を再検出し、src/views/ と src/layouts/ 配下の未使用 export を削除または unexport する。
  CLAUDE.md の GOD OBJECT Policy で名指しされている GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts の 4 ファイルは行数を増やすリスクが高いため本タスクでは触らない。
  それ以外の views/ ファイル (renderer-factory.ts, LabelManager.ts, CanvasGraphics.ts 等) と layouts/ 全体が対象。
  `pnpm lint` `pnpm test` `pnpm build` がグリーンであることを確認してコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
